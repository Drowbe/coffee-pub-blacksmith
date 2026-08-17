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
// That is off by default, which is the only reason this file exists. What it adds
// is a setting so the table decides once instead of per rest, and the coalescing
// that a group rest needs -- see `_queueAdvance`.
//
// Food, water and exhaustion automation are intended to live here later. They are
// rest concerns, not clock concerns, which is why this is its own file.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
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
            description: 'Rest: Advance the world clock by the length of the rest',
            context: 'rest-time',
            priority: 4,
            callback: (actor, result, config) => this._onRestCompleted(config, actor)
        });

        postConsoleAndNotification(MODULE.NAME, "Rest: Time advancement registered", "", true, false);
    }

    /**
     * @param {object} config  The rest configuration dnd5e used.
     * @param {Actor} [actor]  The actor that rested.
     */
    static async _onRestCompleted(config, actor) {
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

            await this._provision(config, actor);
            if (!isLast) return;

            this._markRequestHandled(requestId);
            await this._completeRest(minutes, config?.advanceTime === true);
            return;
        }

        // No request. The burst still needs the same protection: the automatic group
        // loop rests each member once, but nothing guarantees a caller does.
        if (!this._recordBurstAcceptance(actor)) return;
        await this._provision(config, actor);

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

    /** Outcomes gathered across a rest, reported as one card when it completes. */
    static _report = [];

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
            const result = await this._forage(actor);
            if (needsFood) outcome.food = result;
            if (needsWater) outcome.water = result;
            if (result === 'hungry') outcome.exhaustion = 1;
        }

        if (outcome.exhaustion > 0) await this._addExhaustion(actor, outcome.exhaustion);

        this._report.push(outcome);
    }

    /** Use one of a stack. */
    static async _consume(item) {
        const quantity = Number(item.system?.quantity ?? 0);
        await item.update({ 'system.quantity': quantity - 1 });
    }

    /**
     * One Survival check for whatever the character is missing.
     * @returns {'foraged'|'hungry'|'unrolled'}
     */
    static async _forage(actor) {
        const dc = Number(getSettingSafely(MODULE.ID, 'restForageDC', 12)) || 12;

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
        if (!Number.isFinite(total)) return 'unrolled';

        return total >= dc ? 'foraged' : 'hungry';
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

    /**
     * One card for the whole rest, posted when it completes.
     *
     * Batched rather than one per character, because dnd5e already posts a recovery
     * card each and doubling that turns a party's long rest into a wall of chat. The
     * card only appears when there is something to say.
     */
    static async _postReport() {
        const report = this._report;
        this._report = [];
        if (!report.length) return;

        const phrase = { ate: 'ate', foraged: 'foraged', hungry: 'went without', unrolled: 'could not forage' };

        const items = report.map((entry) => {
            const detail = [];
            if (entry.food) detail.push(`Food: ${phrase[entry.food]}`);
            if (entry.water) detail.push(`Water: ${phrase[entry.water]}`);

            return {
                thumb: true,
                img: entry.img || undefined,
                icon: entry.img ? undefined : 'fa-solid fa-drumstick-bite',
                label: entry.name,
                sublabel: detail.join(' · '),
                // The tone carries what a hand-bolded "+1 exhaustion" was doing, in
                // the vocabulary every other card already uses.
                tone: entry.exhaustion > 0 ? 'danger' : undefined,
                trailing: entry.exhaustion > 0 ? `+${entry.exhaustion} exhaustion` : undefined
            };
        });

        try {
            // The module's own card API rather than a hand-built ChatMessage. It
            // brings the theme, the escaping and the parts vocabulary with it -- and
            // `rows` is the part written for exactly this shape: a portrait, a name,
            // a sub-line and a trailing value.
            await ChatCardsAPI.post({
                moduleId: MODULE.ID,
                type: 'rest',
                parts: [
                    { part: 'header', icon: 'fa-solid fa-drumstick-bite', title: 'Provisions' },
                    { part: 'rows', items }
                ]
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Rest: Failed to post the provisions summary", error, false, false);
        }
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
        await this._postReport();
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
