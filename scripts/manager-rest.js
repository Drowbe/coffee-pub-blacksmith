// ==================================================================
// ===== REST ======================================================
// ==================================================================
//
// Rest and the world clock. Currently one job: a rest moves the clock by however
// long the rest took.
//
// WE DO NOT IMPLEMENT RESTING, and should not start. dnd5e already has the whole
// of it -- `actor.shortRest()`, `actor.longRest()`, group rests, recovery of hit
// points, hit dice, spell slots, item uses and exhaustion, and three duration
// variants (`CONFIG.DND5E.restTypes`: short 60/480/1 minutes and long 480/10080/60
// for normal, gritty and epic). It even advances the clock itself:
//
//     // dnd5e.mjs:38304
//     if ( config.advanceTime && (config.duration > 0) && game.user.isGM )
//         await game.time.advance(60 * config.duration);
//
// That is off by default, which is the only reason the clock half of this file
// exists. What it adds is a setting so the table decides once instead of per rest,
// and the coalescing that a group rest needs -- see `_queueAdvance`.
//
// What it also owns is FOOD AND WATER, and the card. One card per character, posted
// as each of them finishes -- the composition lives in `cards-rest.js`. A card is
// about one actor, so its state is that actor's state, which is what will let a
// foraging roll made minutes later find its own card again.
//
// See documentation/architecture/architecture-rest.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import {
    buildRestState, postRestCardFromState, updateRestCard, updateRestCardState,
    isForagePending, isRestPending, readHitDicePools
} from './cards-rest.js';
import { ChatCardsAPI } from './api-chat-cards.js';
import { RollsAPI } from './api-rolls.js';
import { SocketManager } from './manager-sockets.js';

class RestManager {

    /**
     * WHICH CLIENT DOES WHAT, and why this file is split across two of them.
     *
     * `dnd5e.restCompleted` is `Hooks.callAll` (`dnd5e.mjs:38317`). Foundry hooks are
     * LOCAL -- it fires on whichever client ran the rest and on no other. When a
     * player accepts a rest request, that client is theirs, and the GM's client never
     * hears about it at all.
     *
     * So the work is divided by what each client alone can do:
     *
     *   ACTING CLIENT  builds the card state, because `result.clone` -- the pre-rest
     *                  snapshot every recovery row is diffed against -- exists only
     *                  in this call stack. It is not a document and cannot be fetched
     *                  from anywhere else.
     *
     *   GM CLIENT      does everything that WRITES: rations, exhaustion, the card, the
     *                  completion stamp and the clock. A player has permission for
     *                  none of them.
     *
     * The state crosses between them as plain data over the GM proxy socket.
     *
     * The earlier version guarded the hook with `if (!game.user.isGM) return`, which
     * reads as "let the GM handle it" and in fact meant "throw it away" -- there was
     * no GM on the other side to handle anything. Every rest a player accepted
     * produced no card, no provisions and no clock movement. It passed testing
     * because a GM pressing Rest is the single path where the acting client IS the
     * GM, and that is the path a GM tests.
     */

    /**
     * A PARTY REST HAPPENS IN ONE OF TWO SHAPES, and they need different handling.
     * Getting this wrong is what made a five-character rest advance the clock forty
     * hours in testing.
     *
     * 1. REQUESTED (`autoRest` false, the default, and what the party sheet's rest
     *    button does). dnd5e posts a request card and rests nobody
     *    (`dnd5e.mjs:72901`). Each character then rests individually as their
     *    player accepts -- minutes apart, each with its own dialog, and each carrying
     *    the same `config.request.id`. No timer can group these, because the gaps
     *    between them are however long a person takes to click.
     *
     * 2. AUTOMATIC (`autoRest` true). dnd5e rests every member in a tight loop
     *    (`dnd5e.mjs:72929`), each forced to `advanceTime: false`, then advances the
     *    clock once itself. These arrive as a burst with no request id.
     *
     * So: the request id is the primary key, and the timer is the fallback for the
     * burst. Both are needed; neither alone is enough.
     */

    /** Fallback window for completions arriving without a request id. */
    static COALESCE_MS = 400;

    /**
     * Request ids already accounted for, newest last. Bounded, because it would
     * otherwise grow for the life of the world.
     */
    static _handledRequests = [];
    static MAX_REMEMBERED_REQUESTS = 50;

    /**
     * Who has accepted each request so far: request id -> Set of actor uuids.
     *
     * THE CLOCK MOVES WHEN THE LAST CHARACTER RESTS, not the first. The party is not
     * eight hours later until everyone has actually slept, and the earlier reading --
     * advance on the first acceptance -- put the party at dawn while half of them had
     * not begun.
     *
     * The objection to waiting is that one player who never clicks freezes the clock.
     * In practice that is not a dead end: the request card lets the GM resolve any
     * outstanding character themselves, so the stall always has a hand on it. A
     * request that is genuinely abandoned simply never advances, which is the honest
     * outcome for a rest that never happened.
     *
     * Tracked here rather than read from dnd5e's own per-target results because
     * `dnd5e.restCompleted` fires INSIDE the rest, before the result message exists --
     * so the character who just rested is not yet marked complete on the request.
     */
    static _requestProgress = new Map();
    static MAX_TRACKED_REQUESTS = 20;

    /** @type {{timer: any, minutes: number, systemAdvanced: boolean}|null} */
    static _pending = null;

    /**
     * Warn once when exhaustion is on but the system is running 2014 rules.
     *
     * OUR EXHAUSTION FEATURE IS NOT A RULES ENGINE -- dnd5e automates the modern
     * six-level track itself, and a long rest removes a level through
     * `exhaustionDelta`, which is why this needed no code. On `legacy` the system
     * uses the 2014 table instead, where the levels mean different things and a long
     * rest still clears only one. Foraging will still apply exhaustion and dnd5e will
     * still handle it, but the effects a GM expects from the modern rules are not
     * what they will get.
     *
     * A warning rather than a refusal: the table's rules version is the table's
     * decision, and silently doing nothing would be worse than saying so once.
     */
    static _warnIfLegacyRules() {
        if (!game.user?.isGM) return;
        if (this._warnedLegacyRules) return;

        const version = game.settings.get('dnd5e', 'rulesVersion');
        if (version === 'modern') return;

        const forage = getSettingSafely(MODULE.ID, 'restForageEnabled', false);
        const exhaustion = getSettingSafely(MODULE.ID, 'restExhaustionEnabled', false);
        if (!forage && !exhaustion) return;

        this._warnedLegacyRules = true;
        postConsoleAndNotification(MODULE.NAME,
            'Rest: exhaustion assumes the 2024 rules. This world is set to 2014 (legacy), '
            + 'so dnd5e applies the older exhaustion table and the effects will differ.',
            `dnd5e rulesVersion: ${version}`, false, true);
    }

    /** @type {boolean} One warning per session, not one per rest. */
    static _warnedLegacyRules = false;

    static initialize() {
        this._warnIfLegacyRules();

        HookManager.registerHook({
            name: 'dnd5e.restCompleted',
            description: 'Rest: Advance the world clock, provision the character, post their card',
            context: 'rest-time',
            priority: 4,
            callback: (actor, result, config) => this._onRestCompleted(config, actor, result)
        });

        // Suppressing the system's own card is a change to the rest CONFIG, so it has
        // to happen before the rest runs rather than after. Both rest types, since a
        // short rest posts one too.
        for (const hook of ['dnd5e.preLongRest', 'dnd5e.preShortRest']) {
            HookManager.registerHook({
                name: hook,
                description: 'Rest: Optionally suppress the system\'s own rest card',
                context: 'rest-time',
                priority: 4,
                callback: (actor, config) => this._onPreRest(config)
            });
        }

        this._registerActions();

        postConsoleAndNotification(MODULE.NAME, "Rest: Time advancement registered", "", true, false);
    }

    /**
     * Card actions, and the two GM proxies.
     *
     * REGISTRATION ORDER IS LOAD-BEARING. `RestManager.initialize()` runs at
     * `blacksmith.js:534`; `SocketManager.initialize()` at 1538. So the socket does
     * not exist yet when this runs, and the original `getSocket()?.register?.(...)`
     * registered NOTHING -- optional chaining turned a missing socket into a silent
     * no-op rather than an error. `executeAsGM` runs a handler on the GM's client, so
     * a handler the GM never registered means every hop from a player vanished.
     *
     * Same shape as `manager-pins.js:2738`, which had already solved this.
     */
    static _registerActions() {
        ChatCardsAPI.registerAction(MODULE.ID, 'rest', ({ message }) => this._onRestClicked(message));
        ChatCardsAPI.registerAction(MODULE.ID, 'forage', ({ message }) => this._onForageClicked(message));
        ChatCardsAPI.registerAction(MODULE.ID, 'spendHitDie', ({ message, value }) => this._onSpendHitDie(message, value));

        if (SocketManager.isSocketReady) this._registerSocketHandlers();
        else Hooks.once('blacksmith.socketReady', () => this._registerSocketHandlers());
    }

    static _registerSocketHandlers() {
        try {
            const socket = SocketManager.getSocket();
            if (typeof socket?.register !== 'function') {
                postConsoleAndNotification(MODULE.NAME, "Rest: No socket to register the GM proxies on", "", false, false);
                return;
            }

            socket.register(this.REST_GM_PROXY, (payload) => this._applyRest(payload));
            socket.register(this.FORAGE_GM_PROXY, (payload) => this._applyForage(payload));
            socket.register(this.HIT_DIE_GM_PROXY, (payload) => this._applyHitDie(payload));

            postConsoleAndNotification(MODULE.NAME, "Rest: GM proxies registered", "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Rest: Could not register the GM proxies", error, false, false);
        }
    }

    /**
     * Silence the system's rest card, when ours is replacing it.
     *
     * GATED ON OURS BEING ON. Suppressing the system's card without posting one would
     * leave a rest that reports nothing at all -- no recovery, no hit dice, nothing --
     * and the two settings are independent, so a GM can reach that combination by
     * ticking one box.
     *
     * Mutating `config` is the supported way to do this: `preLongRest` and
     * `preShortRest` both receive the configuration by reference and dnd5e reads
     * `config.chat` afterwards.
     */
    static _onPreRest(config) {
        if (!config) return;

        // ACCEPTING A REQUEST OPENS A DIALOG WITH NOTHING IN IT. The GM already chose
        // New Day, Remove Temp HP and Recover Max HP when they sent the request, so
        // every control is locked and the only thing left to do is press REST -- a
        // second click confirming the first.
        //
        // Only for a REQUESTED rest. A character resting on their own opens the same
        // dialog with those controls live, and that one is a real choice.
        if (config.request && getSettingSafely(MODULE.ID, 'restSkipRequestDialog', true)) {
            config.dialog = false;
        }

        if (!getSettingSafely(MODULE.ID, 'restSuppressSystemCard', false)) return;
        if (!getSettingSafely(MODULE.ID, 'restPostCard', true)) return;

        config.chat = false;

        // SILENCING THE SYSTEM CARD TAKES ON ITS JOB. That card is not only a summary:
        // for a requested rest it is what marks the character done, by carrying
        // `flags.dnd5e.requestResult` (see `stampRequestResult` in cards-rest.js).
        // Suppress it and say nothing, and the request keeps offering Rest -- the same
        // character could rest over and over, all night.
        //
        // Recorded on the config rather than re-read from the setting later, because
        // this is the only place that knows we ACTUALLY suppressed it: the two guards
        // above can decline. dnd5e passes one config object by reference from
        // `preShortRest` (`dnd5e.mjs:38169`) through to `restCompleted` (38317) -- the
        // dialog mutates that same object at 38178 -- so a marker set here survives.
        config[this.SUPPRESSED_KEY] = true;
    }

    /** Marker set on the rest config when we silenced the system's own card. */
    static SUPPRESSED_KEY = 'blacksmithSuppressedCard';

    /**
     * Markers riding the rest config from the button that started the rest through to
     * `restCompleted`.
     *
     * `CARD_KEY` is the message id of the card that was pressed, which is what turns a
     * rest into an UPDATE of that card rather than a second one about the same night.
     * `OPTIONS_KEY` carries the food and water choices the GM made in the rest window,
     * so a rest can track provisions differently from the world default without
     * anybody changing a setting.
     *
     * Both survive the journey because dnd5e passes one config object by reference
     * from `preShortRest` (`dnd5e.mjs:38169`) to `restCompleted` (38317).
     */
    static CARD_KEY = 'blacksmithCardId';
    static OPTIONS_KEY = 'blacksmithProvisionOptions';
    static GROUP_KEY = 'blacksmithRestId';

    /**
     * Cards whose Rest button has been pressed and whose rest has not yet come back.
     *
     * CLIENT-LOCAL AND DELIBERATELY SO. The card stays `phase: 'before'` until the GM
     * rewrites it, and that is a socket round trip away -- so `isRestPending` still
     * says "not yet rested" for the whole of it, and a second click starts a SECOND
     * `longRest`. That applies recovery twice, can eat another ration, and can move
     * the clock again.
     *
     * This closes the double click, which is the case that actually happens. It does
     * not close a GM and an owner pressing the same card in the same second from two
     * browsers: the GM's dedup catches the second rest before it reaches provisions,
     * the card or the clock, but both `longRest` calls have already run against the
     * actor. dnd5e has the same exposure on its own request cards.
     */
    static _restsInFlight = new Set();

    /**
     * Somebody pressed Rest on a pre-rest card.
     *
     * THE SYSTEM DOES THE RULES; THE CARD IS THE WHOLE INTERFACE. This calls
     * `actor.longRest()` or `actor.shortRest()` with the dialog and the system card
     * both off, because the card that was just pressed already asked the question and
     * is about to hold the answer. Everything dnd5e does to the actor is untouched.
     *
     * It runs on the CLICKING client, which is the player's -- so the rest completes
     * there, and `_onRestCompleted` hands it to the GM exactly as it does for a rest
     * accepted on a system request.
     */
    static async _onRestClicked(message) {
        const state = message?.getFlag?.(MODULE.ID, 'rest');
        if (!state || !isRestPending(state)) return;

        // CLAIMED BEFORE THE FIRST AWAIT, or the guard is not a guard: two clicks a
        // few milliseconds apart would both read `phase: 'before'`, both pass, and
        // both rest. Nothing between here and the GM's rewrite retires the row.
        if (this._restsInFlight.has(message.id)) return;
        this._restsInFlight.add(message.id);

        try {
            const actor = await fromUuid(state.actorUuid).catch(() => null);
            if (!actor) {
                ui.notifications?.warn('That character no longer exists.');
                return;
            }

            // The GM may rest anyone -- which is also how a character whose player is
            // away gets their rest. Everyone else rests only their own.
            if (!game.user?.isGM && !actor.isOwner) {
                ui.notifications?.warn(`${actor.name} is not yours to rest.`);
                return;
            }

            const isLong = state.restType === 'long';
            const config = {
                type: isLong ? 'long' : 'short',
                dialog: false,
                chat: false,
                newDay: state.restOptions?.newDay === true,
                // The hit point options, only meaningful on a long rest -- the window
                // sends them as false for a short one, which is what dnd5e's own
                // short-rest configuration does anyway.
                recoverTemp: state.restOptions?.recoverTemp === true,
                recoverTempMax: state.restOptions?.recoverTempMax === true,
                // AND ITS OPPOSITE. Off is what hands the dice to the player: dnd5e
                // spends them automatically when this is on, and the card offers them
                // one at a time when it is not.
                autoHD: state.restOptions?.autoHD === true,
                // OURS TO MOVE. Leaving this false keeps the clock in one place -- the
                // grouping in `_applyRest`, which knows how many characters are still
                // to rest. dnd5e's own advance would fire once per character.
                advanceTime: false,
                [this.SUPPRESSED_KEY]: true,
                [this.CARD_KEY]: message.id,
                [this.GROUP_KEY]: state.restId ?? null,
                [this.OPTIONS_KEY]: {
                    trackFood: state.restOptions?.trackFood,
                    trackWater: state.restOptions?.trackWater,
                    forage: state.restOptions?.forage,
                    exhaustion: state.restOptions?.exhaustion
                }
            };

            await actor[isLong ? 'longRest' : 'shortRest'](config);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: ${state.name} could not rest`, error, false, false);
            ui.notifications?.warn(`${state.name} could not rest. See the console for details.`);
        } finally {
            this._restsInFlight.delete(message.id);
        }
    }

    /** Socket handler name for the rest GM hop. */
    static REST_GM_PROXY = 'restCompletedOnClient';

    /**
     * A rest finished ON THIS CLIENT. Capture what only this client can see, then hand
     * the whole thing to the GM. See the note at the top of the class.
     *
     * @param {object} config  The rest configuration dnd5e used.
     * @param {Actor} [actor]  The actor that rested.
     * @param {object} result  The RestResult, including the pre-rest clone.
     */
    static async _onRestCompleted(config, actor, result) {
        // BUILT HERE, WHATEVER CLIENT THIS IS. `result.clone` dies with this call
        // stack, so deferring the diff to the GM would mean diffing the actor against
        // itself and reporting that a rest recovered nothing.
        const payload = {
            actorUuid: actor?.uuid ?? null,
            requestId: config?.request?.id ?? null,
            restType: config?.type ?? null,
            minutes: Number(config?.duration),
            systemAdvanced: config?.advanceTime === true,
            suppressedSystemCard: config?.[this.SUPPRESSED_KEY] === true,
            cardId: config?.[this.CARD_KEY] ?? null,
            groupId: config?.[this.GROUP_KEY] ?? null,
            provisionOptions: config?.[this.OPTIONS_KEY] ?? null,
            state: buildRestState({ actor, result, config })
        };

        if (game.user?.isGM) {
            await this._applyRest(payload);
            return;
        }

        // Everything left is a write, and a player may make none of them: the clock is
        // a world setting, rations and exhaustion are documents they do not own, and
        // the card is authored by the GM. Same GM proxy the pins and tags managers use.
        const socket = SocketManager.getSocket();
        if (typeof socket?.executeAsGM !== 'function') {
            ui.notifications?.warn('Your rest was not recorded: no GM is connected.');
            return;
        }

        try {
            await socket.executeAsGM(this.REST_GM_PROXY, payload);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Could not hand ${actor?.name}'s rest to the GM`, error, false, false);
        }
    }

    /**
     * Apply a finished rest. Runs on the GM's client, wherever the rest was clicked.
     */
    static async _applyRest(payload = {}) {
        if (!game.user?.isGM) return;

        const { requestId, minutes, systemAdvanced } = payload;

        // A GROUPED REST comes in two flavours and they need the same treatment: a
        // dnd5e request, identified by `config.request.id`, and one our rest window
        // started, identified by the `restId` stamped on every card it posted.
        //
        // BOTH MUST GROUP, and only the first one did. The window creates no system
        // request, so its acceptances fell through to the burst timer -- and a burst
        // is a 400ms window, while players accept minutes apart. Each one flushed on
        // its own and moved the clock a full rest. That is the forty-hour bug this
        // file was written to prevent, reappearing on the flow that replaced the one
        // it was written for.
        const groupId = requestId ?? payload.groupId ?? null;

        if (groupId) {
            if (this._handledRequests.includes(groupId)) return;

            // RECORDED BEFORE PROVISIONING, and provisioning only happens for a
            // character who has not already been fed on this rest. A character can
            // reach here twice for one request -- a double click, or a GM resolving
            // someone who had already resolved themselves -- and the first version
            // provisioned on every arrival, so that character ate two rations and
            // appeared twice on the card. Seen once, fed once.
            const { isNew, isLast } = this._recordAcceptance(groupId, payload.actorUuid, this._expectedFor(payload));
            if (!isNew) return;

            await this._restedOne(payload);
            if (!isLast) return;

            this._markRequestHandled(groupId);
            await this._completeRest(minutes, systemAdvanced);
            return;
        }

        // No request. The burst still needs the same protection: the automatic group
        // loop rests each member once, but nothing guarantees a caller does.
        if (!this._recordBurstAcceptance(payload.actorUuid)) return;
        await this._restedOne(payload);

        // No request: either a lone character resting, or the automatic group loop.
        // Both are bursts, so the timer is the right tool.
        this._queueAdvance(minutes, systemAdvanced);
    }

    /**
     * How many characters this rest is waiting for.
     *
     * READ FROM DOCUMENTS ON THE GM, never carried across the socket, because the GM
     * holds every message anyway and a copy could only be staler.
     *
     * A system request states its roster on the request message
     * (`dnd5e.mjs:74326`). A window rest has no request, so its roster is simply THE
     * CARDS THAT EXIST -- which is better than a count baked in at post time, because
     * it corrects itself: a card that failed to post never counts, and a card the GM
     * deletes removes that character from the rest rather than stalling it forever.
     *
     * @returns {number} 0 when the roster cannot be read, which completes on the first
     *                   arrival -- an early clock beats one that never moves.
     */
    static _expectedFor(payload) {
        if (payload?.requestId) {
            const targets = game.messages?.get(payload.requestId)?.system?.targets;
            return Array.isArray(targets) ? targets.length : 0;
        }

        const restId = payload?.groupId;
        if (!restId) return 0;

        let count = 0;
        for (const message of game.messages?.contents ?? []) {
            if (message?.flags?.[MODULE.ID]?.rest?.restId === restId) count++;
        }
        return count;
    }

    /**
     * Record one character's acceptance against a grouped rest.
     *
     * THE CLOCK MOVES WHEN THE LAST CHARACTER RESTS, so this counts acceptances
     * against the roster and reports when the group is complete. Whether the group is
     * a dnd5e request or one of our own rests makes no difference here -- that is the
     * point of it taking a plain id.
     *
     * @param {string} groupId  The request id, or our own rest id.
     * @param {string|null} uuid  Who just rested.
     * @param {number} expected  How many the group is waiting for.
     * @returns {{isNew: boolean, isLast: boolean}}
     */
    static _recordAcceptance(groupId, uuid = null, expected = 0) {
        const seen = this._requestProgress.get(groupId) ?? new Set();
        const isNew = !uuid || !seen.has(uuid);
        if (uuid) seen.add(uuid);

        // Re-set so a first sighting is stored, and so this group becomes the most
        // recently touched for the eviction below.
        this._requestProgress.delete(groupId);
        this._requestProgress.set(groupId, seen);

        // Maps keep insertion order, so the first key is the least recently touched.
        // Abandoned rests are the only thing that accumulates here, and they are
        // worth nothing once a newer one is in flight.
        while (this._requestProgress.size > this.MAX_TRACKED_REQUESTS) {
            this._requestProgress.delete(this._requestProgress.keys().next().value);
        }

        // A roster of one, or one we cannot read, completes on the first arrival --
        // an early clock is a smaller failure than one that never moves.
        const isLast = (expected <= 1) || (seen.size >= expected);
        if (isLast) this._requestProgress.delete(groupId);

        return { isNew, isLast };
    }

    /**
     * The same protection for a burst with no request behind it.
     * @returns {boolean} Whether this character is new to the burst.
     */
    static _recordBurstAcceptance(uuid) {
        if (!uuid) return true;

        this._burstSeen ??= new Set();
        if (this._burstSeen.has(uuid)) return false;
        this._burstSeen.add(uuid);
        return true;
    }

    /** @type {Set<string>|null} */
    static _burstSeen = null;

    // ==============================================================
    // ===== FOOD AND WATER =========================================
    // ==============================================================

    /**
     * One character has finished resting: feed them, and post their card.
     *
     * ONE CARD PER CHARACTER, posted here rather than accumulated and flushed at the
     * end. A card is about one actor, so its state is that actor's state -- which is
     * what will let a foraging roll made minutes later find its own card and update
     * it, with nothing held in memory in between. The batched summary this replaced
     * had to wait for the whole party before it could say anything at all.
     */
    static async _restedOne(payload) {
        const actor = payload?.actorUuid
            ? await fromUuid(payload.actorUuid).catch(() => null)
            : null;

        const provisions = await this._provision(payload?.restType, actor, payload?.provisionOptions);
        const state = { ...payload.state, provisions: provisions ?? null };

        // THE CARD THAT STARTED THE REST IS THE CARD THAT REPORTS IT. A rest begun
        // from our own card rewrites that message in place -- one card for the night,
        // which is the entire point of the pre-rest phase. Posting a second would put
        // the question and its answer in two places.
        if (payload.cardId) {
            const message = game.messages?.get(payload.cardId);
            if (message) {
                try {
                    await updateRestCardState(message, state);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Rest: Failed to update the rest card for ${state.name}`, error, false, false);
                }
                return;
            }
            // The card was deleted while its player was resting. Falling through posts
            // a fresh one, which is better than losing the rest entirely.
        }

        if (!getSettingSafely(MODULE.ID, 'restPostCard', true)) return;

        try {
            await postRestCardFromState(
                state,
                // OURS TO STAMP ONLY IF WE SILENCED THEIRS. When the system posted its
                // own card it has already marked the request complete, and stamping
                // ours as well would point the request's target at the wrong message.
                { requestId: payload.suppressedSystemCard ? payload.requestId : null }
            );
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Failed to post the rest card for ${state.name}`, error, false, false);
        }
    }

    /**
     * Feed and water a character for the night.
     *
     * LONG RESTS ONLY. A short rest is an hour by the tea, not a day's provisions,
     * and consuming a ration for one would empty a pack over an afternoon.
     */
    static async _provision(restType, actor, options = null) {
        if (restType !== 'long') return;
        if (!actor?.items) return;

        // THE REST'S OWN CHOICE WINS, and the setting is only the default it started
        // from. A GM running a night in a city with an inn turns provisions off for
        // that rest without changing what the world does every other night. Undefined
        // means the rest expressed no opinion -- a rest started anywhere but our own
        // window -- so the setting decides, exactly as before.
        const choose = (chosen, key, fallback = false) => (typeof chosen === 'boolean'
            ? chosen
            : getSettingSafely(MODULE.ID, key, fallback));

        const wantFood = choose(options?.trackFood, 'restTrackFood');
        const wantWater = choose(options?.trackWater, 'restTrackWater');
        if (!wantFood && !wantWater) return;

        // TWO INDEPENDENT QUESTIONS, and they compose into four tables rather than one:
        //
        //   forage on,  exhaustion on   a check, and failing it costs a level
        //   forage on,  exhaustion off  a check, and failing it just means going without
        //   forage off, exhaustion on   no check; going without costs a level
        //   forage off, exhaustion off  no check; the card shows a cross and the GM
        //                               decides what it means
        //
        // Foraging off is not "forage and always fail" -- there is no roll, no DC and
        // no button, because the table has said searching for food is not a thing that
        // happens here. Exhaustion off does not hide the shortage either; the cross
        // still shows, because what a character ate is a fact and the penalty is a rule.
        const canForage = choose(options?.forage, 'restForageEnabled', true);
        const applyExhaustion = choose(options?.exhaustion, 'restExhaustionEnabled', true);

        const outcome = {
            name: actor.name, img: actor.img ?? null, food: null, water: null, exhaustion: 0,
            // Carried on the outcome, and therefore onto the card, because a foraging
            // roll resolves MINUTES LATER from that card -- by which time this rest's
            // config is long gone and only the message remains.
            applyExhaustion
        };

        const foodItem = wantFood
            ? this._findProvision(actor, getSettingSafely(MODULE.ID, 'restFoodItems', 'Rations'))
            : null;
        const waterItem = wantWater
            ? this._findProvision(actor, getSettingSafely(MODULE.ID, 'restWaterItems', 'Waterskin, Water (Pint)'))
            : null;

        if (foodItem) {
            await this._consume(foodItem);
            outcome.food = 'ate';
        }
        if (waterItem) {
            await this._consume(waterItem);
            outcome.water = 'ate';
        }

        const needsFood = wantFood && !foodItem;
        const needsWater = wantWater && !waterItem;

        // ONE CHECK COVERS BOTH. A character searching a riverbank finds the water
        // and the berries in the same hour -- two rolls would be charging them twice
        // for one activity, and would make going without both twice as punishing as
        // the rules anywhere suggest. It also means at most ONE level of exhaustion
        // per rest, because there is only one check to fail.
        if (needsFood || needsWater) {
            if (!canForage) {
                // NO CHECK AT ALL. Not a failed forage -- an absent one. The card gets
                // a cross against whatever they could not consume and nothing else:
                // no DC, no button, no dice. What that costs is the table's business,
                // and with exhaustion off it is entirely the GM's.
                if (needsFood) outcome.food = 'hungry';
                if (needsWater) outcome.water = 'hungry';
                if (applyExhaustion) outcome.exhaustion = 1;
            } else if (getSettingSafely(MODULE.ID, 'restForagePlayerRolls', true)) {
                // LET THEM ROLL IT. The check decides whether a character loses a level
                // of exhaustion, and rolling it for them invisibly gave them no chance
                // to spend inspiration or apply a bonus -- and produced a card reporting
                // a failure with no dice anywhere on it, which reads as a broken button.
                //
                // Pending is a real state: nothing is decided, no exhaustion is applied,
                // and the card carries a button until somebody presses it.
                if (needsFood) outcome.food = 'pending';
                if (needsWater) outcome.water = 'pending';
                outcome.dc = this._forageDC();
            } else {
                const { verdict, total, dc } = await this._forage(actor);
                if (needsFood) outcome.food = verdict;
                if (needsWater) outcome.water = verdict;
                if ((verdict === 'hungry') && applyExhaustion) outcome.exhaustion = 1;

                // The roll travels with the outcome so the card can SHOW it.
                outcome.roll = { total, dc };
            }
        }

        if (outcome.exhaustion > 0) await this._addExhaustion(actor, outcome.exhaustion);

        return outcome;
    }

    /**
     * A PROVISION COMES IN TWO SHAPES, and the difference is the whole reason these
     * two helpers exist.
     *
     * Rations are a STACK: five of them in the pack, and eating one leaves four --
     * quantity is the count, and the item goes when it hits zero.
     *
     * A waterskin is ONE ITEM WITH A POOL. It holds four pints; drinking one spends a
     * use and you keep the skin, because the skin is the container. Treating that as a
     * stack meant a single night's water DELETED the waterskin, and the character woke
     * with nothing to carry water in -- so the second night they could not drink at
     * all, and the third they were foraging for it.
     *
     * dnd5e stores a pool as how much is SPENT and derives `value` as `max - spent`
     * (`dnd5e.mjs:11539`), so a pool only counts as one when it has a max.
     *
     * @returns {number} How many uses or units are left.
     */
    static _remaining(item) {
        const uses = item?.system?.uses;
        if (Number(uses?.max) > 0) return Number(uses.value ?? 0);
        return Number(item?.system?.quantity ?? 0);
    }

    /** Use one: a pint from the skin, or one ration off the stack. */
    static async _consume(item) {
        const uses = item?.system?.uses;

        if (Number(uses?.max) > 0) {
            await item.update({ 'system.uses.spent': Number(uses.spent ?? 0) + 1 });
            return;
        }

        await item.update({ 'system.quantity': Number(item.system?.quantity ?? 0) - 1 });
    }

    /**
     * One Survival check for whatever the character is missing.
     * @returns {{verdict: 'foraged'|'hungry'|'unrolled', total: number|null, dc: number}}
     */
    /** @returns {number} */
    static _forageDC() {
        return Number(getSettingSafely(MODULE.ID, 'restForageDC', 12)) || 12;
    }

    static async _forage(actor) {
        const dc = this._forageDC();

        let total = null;
        try {
            // The system's own skill roll, so proficiency, bonuses and any module
            // hooking rolls all apply. Its dialog and its chat card are suppressed:
            // a five-character rest would otherwise raise five prompts and five cards
            // before anyone had finished sleeping.
            const rolled = await actor.rollSkill({ skill: 'sur' }, { configure: false }, { create: false });
            const roll = Array.isArray(rolled) ? rolled[0] : rolled;
            total = Number(roll?.total);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Survival roll failed for ${actor.name}`, error, false, false);
        }

        // A roll we could not make is not a failure. Charging exhaustion for our own
        // inability to roll would punish the character for our bug.
        if (!Number.isFinite(total)) return { verdict: 'unrolled', total: null, dc };

        return { verdict: total >= dc ? 'foraged' : 'hungry', total, dc };
    }

    /**
     * The first configured provision the character actually has.
     *
     * The list is searched IN ORDER rather than the character's inventory, so a GM
     * who writes "Rations, Trail Mix" gets rations eaten first. Matching is on the
     * trimmed, lower-cased name -- the same item is called different things across
     * the PHB, the SRD and homebrew, which is the whole reason this is a list.
     */
    static _findProvision(actor, list) {
        const names = String(list ?? '')
            .split(',')
            .map((n) => n.trim().toLowerCase())
            .filter(Boolean);

        for (const name of names) {
            // Availability asks the SAME question consuming answers -- an empty
            // waterskin has a quantity of one and nothing left in it, and the old
            // quantity-only test called that water.
            const item = actor.items.find((i) =>
                (i.name?.trim().toLowerCase() === name) && (this._remaining(i) > 0));
            if (item) return item;
        }
        return null;
    }

    /**
     * Add levels of exhaustion, clamped to the condition's own maximum.
     *
     * Only the NUMBER is written. The system owns what exhaustion does -- with the
     * modern rules it already applies the penalty to every d20 roll
     * (`dnd5e.mjs:37154`) and to speed -- so applying effects ourselves would either
     * duplicate that or fight it.
     */
    static async _addExhaustion(actor, levels) {
        const max = CONFIG.DND5E?.conditionTypes?.exhaustion?.levels ?? 6;
        const current = Number(actor.system?.attributes?.exhaustion ?? 0);
        const next = Math.min(current + levels, max);
        if (next === current) return;

        try {
            await actor.update({ 'system.attributes.exhaustion': next });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Failed to apply exhaustion to ${actor.name}`, error, false, false);
        }
    }

    // ==============================================================
    // ===== THE FORAGE BUTTON ======================================
    // ==============================================================

    /** Socket handler name for the forage GM hop. Registered in `_registerSocketHandlers`. */
    static FORAGE_GM_PROXY = 'restForageResolved';

    /** Socket handler name for the hit-die GM hop. */
    static HIT_DIE_GM_PROXY = 'restHitDieSpent';

    /** Cards with a hit die in flight, for the same reason `_restsInFlight` exists. */
    static _hitDiceInFlight = new Set();

    /**
     * Somebody pressed one of the hit dice buttons.
     *
     * THE SYSTEM SPENDS THE DIE AND DOES THE HEALING. `actor.rollHitDie()` rolls
     * `max(1, 1dN + CON)`, increments that class's `hd.spent` and applies the hit
     * points, all in one call -- and the player owns their own actor, so it happens on
     * their client with no permission problem and no hop.
     *
     * ITS CHAT MESSAGE IS SUPPRESSED, AND WE SHOW THE DICE OURSELVES. Those are two
     * halves of one decision. `create: false` stops the roll card without touching the
     * mechanics -- dnd5e applies its updates either way -- and `api.rolls.showDice`
     * animates the dice directly through Dice So Nice.
     *
     * The alternative was letting the system post its card, which is the only way most
     * modules ever get 3D dice. It is also how a party of five buries the card they
     * are reading under twenty roll messages, leaving the answer somewhere above the
     * scroll. The health bar rising and the die count falling say the same thing in the
     * place the player is already looking.
     *
     * What cannot happen on their client is the card rewrite -- the card was authored
     * by the GM -- so the outcome goes over the same proxy the forage roll uses.
     */
    static async _onSpendHitDie(message, denomination) {
        const state = message?.getFlag?.(MODULE.ID, 'rest');
        if (!state?.hitDice?.offered) return;
        if (!denomination) return;

        // Claimed before the first await, as the Rest button is: the card does not
        // change until the GM's rewrite lands, so two quick clicks would otherwise
        // spend two dice when the player asked for one.
        if (this._hitDiceInFlight.has(message.id)) return;
        this._hitDiceInFlight.add(message.id);

        try {
            const actor = await fromUuid(state.actorUuid).catch(() => null);
            if (!actor) {
                ui.notifications?.warn('That character no longer exists.');
                return;
            }

            if (!game.user?.isGM && !actor.isOwner) {
                ui.notifications?.warn(`${actor.name} is not yours to roll for.`);
                return;
            }

            const before = Number(actor.system?.attributes?.hp?.value ?? 0);

            // `rollHitDie` returns the rolls and returns null when there is no die of
            // this size left -- which is the honest answer to a stale button, so it is
            // treated as "nothing happened" rather than an error. `create: false`
            // suppresses only the chat card; the spend and the healing still happen.
            const rolls = await actor.rollHitDie({ denomination }, {}, { create: false });
            if (!rolls || (Array.isArray(rolls) && !rolls.length)) return;

            // OUR dice, through our own roll API, so the table's Dice So Nice setting
            // is honoured in one place and a missing module is nobody's problem here.
            await RollsAPI.showDice(rolls);

            const total = (Array.isArray(rolls) ? rolls : [rolls]).reduce((sum, roll) => sum + Number(roll?.total ?? 0), 0);

            // THE SNAPSHOT IS TAKEN HERE, after the system has applied everything, and
            // sent with the outcome. The GM could read the actor instead, but the
            // update was made on THIS client and the GM's copy may not have caught up
            // -- the card would then report the state before the spend.
            await this._deliverHitDie({
                messageId: message.id,
                actorUuid: state.actorUuid,
                denomination,
                total,
                healed: Math.max(0, Number(actor.system?.attributes?.hp?.value ?? 0) - before),
                hp: {
                    value: Number(actor.system?.attributes?.hp?.value ?? 0),
                    max: Number(actor.system?.attributes?.hp?.max ?? 0)
                },
                pools: readHitDicePools(actor)
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: ${state.name} could not spend a hit die`, error, false, false);
        } finally {
            this._hitDiceInFlight.delete(message.id);
        }
    }

    /** Hand a spent hit die to whoever may rewrite the card. */
    static async _deliverHitDie(payload) {
        if (game.user?.isGM) {
            await this._applyHitDie(payload);
            return;
        }

        const socket = SocketManager.getSocket();
        if (typeof socket?.executeAsGM !== 'function') {
            ui.notifications?.warn('Your hit die was rolled, but the card could not be updated: no GM is connected.');
            return;
        }

        try {
            await socket.executeAsGM(this.HIT_DIE_GM_PROXY, payload);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Rest: Could not send the hit die result to the GM", error, false, false);
            ui.notifications?.warn('Your hit die was rolled, but the card could not be updated.');
        }
    }

    /**
     * Record a spent hit die on the card. Runs on the GM's client.
     *
     * THE DIE IS ALREADY SPENT AND THE HEALING ALREADY APPLIED by the time this runs
     * -- `rollHitDie` did both on the clicking client. This only writes down what
     * happened, so a failure here costs the record and never the mechanics.
     */
    static async _applyHitDie({ messageId, denomination, total, healed, hp, pools } = {}) {
        if (!game.user?.isGM) return;

        const message = game.messages?.get(messageId);
        const state = message?.getFlag?.(MODULE.ID, 'rest');
        if (!state?.hitDice?.offered) return;

        const next = {
            ...state,
            // The bar moves with the dice, which is why the block sits under it.
            hp: hp ?? state.hp,
            hitDice: {
                ...state.hitDice,
                pools: pools ?? state.hitDice.pools,
                spent: [...(state.hitDice.spent ?? []), { denomination, total, healed }]
            }
        };

        await updateRestCardState(message, next);
    }

    /**
     * Somebody pressed Forage.
     *
     * THE ROLL HAPPENS ON THE CLICKER'S CLIENT, with the system's own dialog and its
     * own chat card, so the player sees their dice and can spend inspiration or take
     * advantage. `rollSkill` returns the rolls to the caller, so no hook subscription
     * is needed to learn the total -- we already have it.
     *
     * WRITING is the part that cannot happen there: the card was authored by the GM
     * and `ChatCardsAPI.update` refuses a user who cannot modify the message. So the
     * outcome is handed to the GM, who applies the exhaustion and rewrites the card.
     */
    static async _onForageClicked(message) {
        const state = message?.getFlag?.(MODULE.ID, 'rest');
        if (!state || !isForagePending(state)) return;

        const actor = await fromUuid(state.actorUuid).catch(() => null);
        if (!actor) {
            ui.notifications?.warn('That character no longer exists.');
            return;
        }

        // The GM may roll for anyone -- which is also how an unpressed button gets
        // resolved. Everyone else may roll only for their own character. The card is
        // public, so this decides what a reader may DO rather than what they see.
        if (!game.user?.isGM && !actor.isOwner) {
            ui.notifications?.warn(`${actor.name} is not yours to roll for.`);
            return;
        }

        const dc = Number(state.provisions?.dc) || this._forageDC();

        // OUR ROLL WINDOW, AND NO SECOND CARD. `api.rolls.promptRoll` opens the full
        // window -- modifiers, named bonuses, advantage -- and hands the result back
        // rather than writing it anywhere. We already have the card it belongs on.
        //
        // Two earlier attempts are worth not repeating. `orchestrateRoll` REQUIRES an
        // existing skill-check card and throws without one; it updates a card, it
        // cannot make one. `openRequestRollDialog({ silent: true })` works, but posts
        // a whole second card for a single check, which is the thing this feature is
        // supposed to be removing. The card-free mode was the missing piece, and it
        // is now public API rather than something bent to fit here.
        let results = null;
        try {
            const { promptRoll } = await import('./manager-rolls.js');
            results = await promptRoll({
                actor,
                type: 'skill',
                value: 'sur',
                dc,
                title: 'Foraging',
                tokenId: actor.token?.id ?? actor.getActiveTokens?.()?.[0]?.id ?? null
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Could not open the forage roll for ${actor.name}`, error, false, false);
            return;
        }

        // Closed without rolling. Nothing is decided and the button stays.
        const total = Number(results?.roll?.total);
        if (!Number.isFinite(total)) return;

        const payload = { messageId: message.id, actorUuid: state.actorUuid, total, dc };

        // Only a GM may rewrite the card or write exhaustion, and the roll may have
        // been made by a player. Same GM proxy the pins and tags managers use.
        if (game.user?.isGM) {
            await this._applyForage(payload);
            return;
        }

        const socket = SocketManager.getSocket();
        if (typeof socket?.executeAsGM !== 'function') {
            ui.notifications?.warn('Your roll could not be applied: no GM is connected. Ask your GM to resolve it.');
            return;
        }

        // Told, not swallowed. A rejected hop leaves the card pending, which is
        // recoverable -- the GM can press the button themselves -- but only if the
        // player knows their roll went nowhere.
        try {
            await socket.executeAsGM(this.FORAGE_GM_PROXY, payload);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Could not send ${actor.name}'s forage roll to the GM`, error, false, false);
            ui.notifications?.warn('Your roll could not be applied. Ask your GM to resolve it.');
        }
    }

    /**
     * Apply a resolved forage. Runs on the GM's client, wherever the click came from.
     */
    static async _applyForage({ messageId, actorUuid, total, dc } = {}) {
        if (!game.user?.isGM) return;

        const message = game.messages?.get(messageId);
        const state = message?.getFlag?.(MODULE.ID, 'rest');
        if (!state) return;

        // A second arrival for the same card resolves nothing. Two players cannot
        // press it, but a GM and an owner can, and a double click always can.
        if (!isForagePending(state)) return;

        const success = Number(total) >= Number(dc);
        const verdict = success ? 'foraged' : 'hungry';

        // READ FROM THE CARD, not from the settings. This resolves minutes after the
        // rest -- the config that started it is gone, and the world setting may since
        // have been changed. The rest recorded its own answer for exactly this moment;
        // anything else would apply tonight's rule to last night's roll.
        //
        // Absent means yes, so cards written before this option existed keep behaving
        // as they did.
        const applyExhaustion = state.provisions?.applyExhaustion !== false;
        const costsALevel = !success && applyExhaustion;

        const provisions = { ...state.provisions, roll: { total, dc } };
        if (provisions.food === 'pending') provisions.food = verdict;
        if (provisions.water === 'pending') provisions.water = verdict;
        provisions.exhaustion = costsALevel ? 1 : 0;

        if (costsALevel) {
            const actor = await fromUuid(actorUuid).catch(() => null);
            if (actor) await this._addExhaustion(actor, 1);
        }

        await updateRestCard(message, provisions);
    }

    /** Remember a request so a late acceptance cannot advance the clock again. */
    static _markRequestHandled(requestId) {
        this._handledRequests.push(requestId);
        if (this._handledRequests.length > this.MAX_REMEMBERED_REQUESTS) this._handledRequests.shift();
    }

    /**
     * Fold a rest completion into the pending advance.
     *
     * `systemAdvanced` sticks once set: if ANY completion in the burst had dnd5e's own
     * `advanceTime` enabled, the system has already moved the clock and we must not
     * move it again. Taking the MAXIMUM duration rather than the sum is the same
     * decision from the other side -- five characters resting eight hours is eight
     * hours, not forty.
     */
    static _queueAdvance(minutes, systemAdvanced) {
        if (!this._pending) {
            this._pending = { timer: null, minutes: 0, systemAdvanced: false };
        }

        // Guarded, because a rest with no duration now reaches here rather than being
        // turned away earlier -- the burst still has to flush so the provisions card
        // gets posted. An unguarded Math.max would let one NaN poison a real duration
        // arriving later in the same burst.
        if (Number.isFinite(minutes)) this._pending.minutes = Math.max(this._pending.minutes, minutes);
        this._pending.systemAdvanced = this._pending.systemAdvanced || systemAdvanced;

        clearTimeout(this._pending.timer);
        this._pending.timer = setTimeout(() => this._flush(), this.COALESCE_MS);
    }

    static async _flush() {
        const pending = this._pending;
        this._pending = null;
        if (!pending) return;

        await this._completeRest(pending.minutes, pending.systemAdvanced);
    }

    /**
     * The rest is over. Move the clock if we are the ones moving it, and say what
     * everyone ate either way.
     *
     * The two are separate on purpose: a table that tracks rations but lets the
     * system handle time still wants the provisions card, and an earlier version that
     * returned early on the clock setting swallowed it.
     */
    static async _completeRest(minutes, systemAdvanced) {
        // The burst roster belongs to the rest that just ended. Leaving it in place
        // would make the next rest think everyone had already eaten.
        this._burstSeen = null;

        const advances = getSettingSafely(MODULE.ID, 'restAdvancesTime', true)
            && Number.isFinite(minutes) && (minutes > 0);

        if (advances) await this._advance(minutes, systemAdvanced);
    }

    /**
     * Move the clock by a rest's length.
     * @param {number} minutes
     * @param {boolean} systemAdvanced Whether dnd5e already did it.
     */
    static async _advance(minutes, systemAdvanced) {
        if (systemAdvanced) {
            postConsoleAndNotification(
                MODULE.NAME,
                "Rest: dnd5e advanced the clock itself, so Blacksmith did not",
                "", true, false
            );
            return;
        }

        const calendar = game.time?.calendar;
        if (!calendar?.days) return;

        // The calendar's own minute, not 60 -- the same reason the clock never
        // hardcodes 86400.
        const seconds = minutes * calendar.days.secondsPerMinute;

        try {
            await game.time.advance(seconds);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Rest: Failed to advance the world clock", error, false, false);
        }
    }
}

export { RestManager };
