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
//     // dnd5e.mjs:34982
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
// See documentation/plans/plan-rest-card.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { postRestCard, updateRestCard, isForagePending } from './cards-rest.js';
import { ChatCardsAPI } from './api-chat-cards.js';

class RestManager {

    /**
     * A PARTY REST HAPPENS IN ONE OF TWO SHAPES, and they need different handling.
     * Getting this wrong is what made a five-character rest advance the clock forty
     * hours in testing.
     *
     * 1. REQUESTED (`autoRest` false, the default, and what the party sheet's rest
     *    button does). dnd5e posts a request card and rests nobody
     *    (`dnd5e.mjs:69799-69820`). Each character then rests individually as their
     *    player accepts -- minutes apart, each with its own dialog, and each carrying
     *    the same `config.request.id`. No timer can group these, because the gaps
     *    between them are however long a person takes to click.
     *
     * 2. AUTOMATIC (`autoRest` true). dnd5e rests every member in a tight loop
     *    (`dnd5e.mjs:69824`), each forced to `advanceTime: false`, then advances the
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

    static initialize() {
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

        this._registerForageAction();

        postConsoleAndNotification(MODULE.NAME, "Rest: Time advancement registered", "", true, false);
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
    }

    /**
     * @param {object} config  The rest configuration dnd5e used.
     * @param {Actor} [actor]  The actor that rested.
     */
    static async _onRestCompleted(config, actor, result) {
        // Only a GM writes: the clock is a world setting, and item quantities and
        // exhaustion are documents. dnd5e guards its own advance the same way.
        if (!game.user?.isGM) return;

        const minutes = Number(config?.duration);
        const request = config?.request ?? null;
        const requestId = request?.id ?? null;

        // A REQUESTED REST: every character's acceptance carries the same id, so the
        // id identifies the rest rather than the moment it arrived. That matters
        // because acceptances are minutes apart -- one dialog per player -- and no
        // timer can group them.
        if (requestId) {
            if (this._handledRequests.includes(requestId)) return;

            // RECORDED BEFORE PROVISIONING, and provisioning only happens for a
            // character who has not already been fed on this rest. A character can
            // reach `restCompleted` twice for one request -- a double click, or a GM
            // resolving someone who had already resolved themselves -- and the first
            // version provisioned on every arrival, so that character ate two
            // rations and appeared twice on the card. Seen once, fed once.
            const { isNew, isLast } = this._recordAcceptance(request, requestId, actor);
            if (!isNew) return;

            await this._restedOne(config, actor, result);
            if (!isLast) return;

            this._markRequestHandled(requestId);
            await this._completeRest(minutes, config?.advanceTime === true);
            return;
        }

        // No request. The burst still needs the same protection: the automatic group
        // loop rests each member once, but nothing guarantees a caller does.
        if (!this._recordBurstAcceptance(actor)) return;
        await this._restedOne(config, actor, result);

        // No request: either a lone character resting, or the automatic group loop.
        // Both are bursts, so the timer is the right tool.
        this._queueAdvance(minutes, config?.advanceTime === true);
    }

    /**
     * Has everyone the request asked for now rested?
     *
     * The roster lives on the request message as `system.targets`, one entry per
     * character (`dnd5e.mjs:70835`). Counting acceptances against it is what makes the
     * clock wait for the last sleeper rather than the first.
     *
     * A request naming one character, or one whose roster cannot be read, advances
     * immediately -- guessing wrong in that direction costs a slightly early clock,
     * while guessing wrong the other way means a rest that never advances at all.
     *
     * @returns {boolean}
     */
    static _recordAcceptance(request, requestId, actor) {
        const uuid = actor?.uuid ?? null;
        const targets = request?.system?.targets;
        const expected = Array.isArray(targets) ? targets.length : 0;

        const seen = this._requestProgress.get(requestId) ?? new Set();
        const isNew = !uuid || !seen.has(uuid);
        if (uuid) seen.add(uuid);

        // Re-set so a first sighting is stored, and so this request becomes the most
        // recently touched for the eviction below.
        this._requestProgress.delete(requestId);
        this._requestProgress.set(requestId, seen);

        // Maps keep insertion order, so the first key is the least recently touched.
        // Abandoned requests are the only thing that accumulates here, and they are
        // worth nothing once a newer one is in flight.
        while (this._requestProgress.size > this.MAX_TRACKED_REQUESTS) {
            this._requestProgress.delete(this._requestProgress.keys().next().value);
        }

        // A roster of one, or one we cannot read, completes on the first arrival --
        // an early clock is a smaller failure than one that never moves.
        const isLast = (expected <= 1) || (seen.size >= expected);
        if (isLast) this._requestProgress.delete(requestId);

        return { isNew, isLast };
    }

    /**
     * The same protection for a burst with no request behind it.
     * @returns {boolean} Whether this character is new to the burst.
     */
    static _recordBurstAcceptance(actor) {
        const uuid = actor?.uuid;
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
    static async _restedOne(config, actor, result) {
        const provisions = await this._provision(config, actor);

        if (!getSettingSafely(MODULE.ID, 'restPostCard', true)) return;

        try {
            await postRestCard({ actor, result, config, provisions });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Failed to post the rest card for ${actor?.name}`, error, false, false);
        }
    }

    /**
     * Feed and water a character for the night.
     *
     * LONG RESTS ONLY. A short rest is an hour by the tea, not a day's provisions,
     * and consuming a ration for one would empty a pack over an afternoon.
     */
    static async _provision(config, actor) {
        if (config?.type !== 'long') return;
        if (!actor?.items) return;

        const wantFood = getSettingSafely(MODULE.ID, 'restTrackFood', false);
        const wantWater = getSettingSafely(MODULE.ID, 'restTrackWater', false);
        if (!wantFood && !wantWater) return;

        const outcome = { name: actor.name, img: actor.img ?? null, food: null, water: null, exhaustion: 0 };

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
            // LET THEM ROLL IT. The check decides whether a character loses a level
            // of exhaustion, and rolling it for them invisibly gave them no chance to
            // spend inspiration or apply a bonus -- and produced a card reporting a
            // failure with no dice anywhere on it, which reads as a broken button.
            //
            // Pending is a real state: nothing is decided, no exhaustion is applied,
            // and the card carries a button until somebody presses it.
            if (getSettingSafely(MODULE.ID, 'restForagePlayerRolls', true)) {
                if (needsFood) outcome.food = 'pending';
                if (needsWater) outcome.water = 'pending';
                outcome.dc = this._forageDC();
            } else {
                const { verdict, total, dc } = await this._forage(actor);
                if (needsFood) outcome.food = verdict;
                if (needsWater) outcome.water = verdict;
                if (verdict === 'hungry') outcome.exhaustion = 1;

                // The roll travels with the outcome so the card can SHOW it.
                outcome.roll = { total, dc };
            }
        }

        if (outcome.exhaustion > 0) await this._addExhaustion(actor, outcome.exhaustion);

        return outcome;
    }

    /** Use one of a stack. */
    static async _consume(item) {
        const quantity = Number(item.system?.quantity ?? 0);
        await item.update({ 'system.quantity': quantity - 1 });
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
            const item = actor.items.find((i) =>
                (i.name?.trim().toLowerCase() === name) && (Number(i.system?.quantity ?? 0) > 0));
            if (item) return item;
        }
        return null;
    }

    /**
     * Add levels of exhaustion, clamped to the condition's own maximum.
     *
     * Only the NUMBER is written. The system owns what exhaustion does -- with the
     * modern rules it already applies the penalty to every d20 roll
     * (`dnd5e.mjs:33818`) and to speed -- so applying effects ourselves would either
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

    static _registerForageAction() {
        ChatCardsAPI.registerAction(MODULE.ID, 'forage', ({ message }) => this._onForageClicked(message));

        // The result comes back here rather than to the clicker: the roll happens in
        // the roll window and the hook fires on every client, so the GM -- the only
        // one who may write the card -- picks it up wherever it was rolled. No socket
        // hop of our own is needed.
        HookManager.registerHook({
            name: 'blacksmith.rolls.skillCheckResolved',
            description: 'Rest: Resolve a foraging check when its roll lands',
            context: 'rest-time',
            priority: 4,
            callback: (outcome) => this._onSkillCheckResolved(outcome)
        });
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

        // OUR ROLL TOOL, through the public Request a Roll surface.
        //
        // `orchestrateRoll` was the first attempt and is the wrong level: it REQUIRES
        // an existing skill-check card and throws without one ("chat card must be
        // created first by skillcheck dialog", `manager-rolls.js:161`). It updates a
        // card; it cannot make one. `openRequestRollDialog({ silent: true })` is the
        // documented way to create the request, and the player then rolls it with the
        // same window, modifier field and card they already know.
        //
        // The actor entry uses `{ actorId, tokenId }` deliberately: an object shaped
        // `{ id, actorId }` falls through to matching EVERY placeable for that actor,
        // which silently produces two rows for a character with two tokens on the
        // scene (documented in api-requestroll.md).
        try {
            const api = game.modules?.get(MODULE.ID)?.api;
            if (typeof api?.openRequestRollDialog !== 'function') {
                ui.notifications?.warn('The roll tool is not available.');
                return;
            }

            await api.openRequestRollDialog({
                silent: true,
                title: `Foraging — ${actor.name}`,
                initialType: 'skill',
                initialValue: 'sur',
                dc,
                showDC: true,
                groupRoll: false,
                actors: [{ actorId: actor.id, tokenId: actor.token?.id ?? actor.getActiveTokens?.()?.[0]?.id ?? null, name: actor.name }]
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Rest: Could not open the forage roll for ${actor.name}`, error, false, false);
        }
    }

    /**
     * A skill check finished somewhere. If it was one of ours, resolve that card.
     *
     * Subscribed rather than awaited, because `orchestrateRoll` hands the roll to the
     * roll window and returns -- the answer arrives whenever the player is done with
     * it. `blacksmith.rolls.skillCheckResolved` carries the actor and the total
     * (`api-rolls.js:94`), which is everything needed to find the card this belongs
     * to and finish it.
     */
    static async _onSkillCheckResolved(outcome) {
        // GM only: this ends in a scene-level write and a message rewrite, and every
        // client sees the hook. Without this the outcome would be applied once per
        // connected player.
        if (!game.user?.isGM) return;
        if (outcome?.rollType && (outcome.rollType !== 'skill')) return;

        // `Number(null)` is 0, not NaN, so a missing total would otherwise arrive as
        // a roll of zero and resolve the check as an automatic failure. Absent and
        // zero are different answers and only one of them is a roll.
        if (outcome?.total == null) return;

        const total = Number(outcome.total);
        if (!Number.isFinite(total)) return;

        const card = this._findPendingForageCard(outcome?.actorId);
        if (!card) return;

        const state = card.getFlag(MODULE.ID, 'rest');
        const dc = Number(state.provisions?.dc) || this._forageDC();

        await this._applyForage({ messageId: card.id, actorUuid: state.actorUuid, total, dc });
    }

    /**
     * The most recent rest card still owing a foraging check for this actor.
     *
     * Searched newest-first because a character can rest many times in a campaign and
     * only the current one is owed. The card carries the actor uuid in its own flag,
     * so this needs nothing held in memory and works after a reload.
     */
    static _findPendingForageCard(actorId) {
        if (!actorId) return null;

        const messages = game.messages?.contents ?? [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            const state = message.getFlag?.(MODULE.ID, 'rest');
            if (!state || !isForagePending(state)) continue;

            // Compare on the id rather than the uuid: the hook reports an actor id,
            // and a token actor's uuid is not the same string.
            const uuid = String(state.actorUuid ?? '');
            if (uuid.endsWith(actorId)) return message;
        }

        return null;
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

        const provisions = { ...state.provisions, roll: { total, dc } };
        if (provisions.food === 'pending') provisions.food = verdict;
        if (provisions.water === 'pending') provisions.water = verdict;
        provisions.exhaustion = success ? 0 : 1;

        if (!success) {
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
