// ==================================================================
// ===== DEFEATED MANAGER ===========================================
// ==================================================================
//
// Keeps one answer to "is this combatant dead", instead of the two this module
// used to hold.
//
// The two were: core's, where a combatant is out only when `Combatant#isDefeated`
// is true -- the `defeated` field, or the DEFEATED special status on the actor
// (`client/documents/combatant.mjs:116`) -- and ours, where an NPC is dead the
// moment its hit points reach zero (`CombatBarManager.isCombatantDead`,
// `ui-combat-tracker.js`). Core's is the one that decides turns: `Combat#nextTurn`
// skips a combatant only when the tracker's Skip Defeated setting is on AND
// `isDefeated` is true. Ours only decides what our own bar draws.
//
// Nothing closes the gap between them on its own. dnd5e 5.3.3 does NOT apply the
// `dead` status when hit points reach zero -- `preUpdateHP` and `onUpdateHP` reset
// death saves and fire the damage hook and nothing else (`dnd5e.mjs:26269-26302`).
// So an NPC at zero is defeated only because a GM pressed the skull. GMs press it
// for the monsters they run and nobody presses it for a player's summons, which is
// why a table's first sighting of this is six dead berserkers taking turns.
//
// This manager marks it instead: an NPC combatant reaching zero gets `defeated` and
// the DEFEATED status, exactly as the tracker's own button would, and core skips it
// everywhere from then on -- its Next Turn, ours, the keybinding, any other module.
// PCs are deliberately untouched: a character at zero is making death saves, and
// dying is a separate event that already has a flag of its own.
//
// TWO THINGS IT IS CAREFUL ABOUT
//
// It records its own marks with a combatant flag. `defeated` is read elsewhere as
// the GM's verdict rather than as a hit point reading -- XP awards
// (`manager-xp.js`) and adversary statistics (`stats-adversaries.js`) both do -- so
// a mark this manager did not make is never removed by it. Heal a GM-marked NPC
// above zero and it stays marked; heal one this manager marked and the mark comes
// off with the flag.
//
// And only the active GM writes. Every client sees the same hit point update, so
// without that check every connected client races to issue the same two document
// updates.
//
// IT NEVER STANDS DOWN, AND IT ASKS NO OTHER MODULE FOR PERMISSION
//
// This manager once did the opposite: it returned early out of `syncCombatant`
// whenever another module looked configured to mark the dead, on the theory that
// two modules writing the same field was the thing to avoid. That cost a table
// nineteen rounds of corpses taking turns (2026-09-02) -- the other module then
// didn't write, and nobody did. **Two modules writing the same field is cosmetic;
// two modules each assuming the other did it is a broken world.** See TODO-GLOBAL
// Ground Rule 8. Nothing here reads another module's settings or checks whether one
// is installed, and nothing should be added that does: this feature has to be
// complete and correct on core Foundry and dnd5e alone.
//
// THE TWO WRITES ARE NOT EQUALLY IMPORTANT
//
//   * The `defeated` FIELD decides turns. `Combat#nextTurn` skips on it, so this is
//     the functional half. A plain combatant update -- no static id, no collision
//     possible, and a redundant write just writes the value that was there.
//   * The DEFEATED STATUS is the token's skull overlay. Cosmetic, and the only half
//     that can race: `Actor#toggleStatusEffect` reads `this.effects` synchronously
//     and then creates with the status's STATIC `_id` and `keepId: true`
//     (`client/documents/actor.mjs:490-521`), so two writers who both see it absent
//     both create `dnd5edead0000000` and the server rejects the loser with "The _id
//     already exists". Foundry prints that from its socket ack handler, so no
//     try/catch of ours can silence the line.
//
// We accept that line. It is one console message about a job that got done -- if
// something else is racing us for the overlay, that something else is drawing the
// overlay, so the GM sees the right thing either way. Trading a correct mark for a
// tidy console is the trade that caused this bug in the first place.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

/** Marks this manager placed the `defeated` flag, so it may also take it off. */
const AUTO_FLAG = 'autoDefeated';

export class DefeatedManager {
    static _initialized = false;

    /**
     * Actors with a sync in flight, by uuid.
     *
     * `Actor#toggleStatusEffect` reads `this.effects` synchronously to decide
     * whether the status is already there, then creates with `keepId: true` and the
     * status's STATIC `_id` (`client/documents/actor.mjs:490-521`). Two overlapping
     * calls therefore both see nothing and both create `dnd5edead0000000`, and the
     * second throws "The _id already exists within the parent collection".
     *
     * That is reachable without anything unusual: `updateActor` fires more than once
     * when damage lands in stages, and each firing starts its own async chain, so
     * awaiting inside one of them serialises nothing. This set is what makes the
     * second firing wait for the first rather than race it.
     */
    static _inFlight = new Set();

    /**
     * Hooks are registered unconditionally and the setting is read inside them,
     * rather than gating registration on it. Two callbacks that leave immediately
     * unless hit points changed in an actual combat are not a cold-path cost worth
     * a reload -- and gating registration would mean the setting only takes effect
     * after one, which for a switch a GM reaches for mid-session is the wrong trade.
     */
    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        HookManager.registerHook({
            name: 'updateActor',
            description: 'Defeated: Mark an NPC combatant defeated when its hit points reach zero',
            context: 'defeated-manager',
            priority: 3,
            callback: (actor, updateData) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (updateData?.system?.attributes?.hp?.value === undefined) return;
                void DefeatedManager.syncActor(actor);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        HookManager.registerHook({
            name: 'createCombatant',
            description: 'Defeated: Mark a combatant that joins a fight already at zero hit points',
            context: 'defeated-manager',
            priority: 3,
            callback: (combatant) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                void DefeatedManager.syncCombatant(combatant);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Reconcile what is ALREADY on the table, not just what changes from here.
        //
        // Both hooks above are edge-triggered: they fire when hit points change or a
        // combatant joins, and neither ever looks at a fight that was already running.
        // That was fine while the assumption held that nothing could reach zero
        // unmarked -- and it did not hold. A world can be loaded mid-combat with
        // combatants that went to zero before this feature was switched on, or on a
        // client that was not the active GM, or in any world where the mark was
        // missed once, and nothing would ever revisit them: the creature is at
        // zero and stays at zero, so no further `updateActor` is coming. The GM's only
        // recourse was to damage each corpse again.
        //
        // Not awaited, deliberately. This runs inside the `ready` chain that drives
        // the loading progress bar, and a sweep of a large fight must not be the thing
        // a table waits on to finish booting.
        void this.reconcileAll();

        postConsoleAndNotification(MODULE.NAME, 'Defeated: Manager initialized', '', true, false);
    }

    /**
     * Bring every combatant in every combat in line with its hit points, once.
     *
     * Sequential rather than parallel: `syncCombatant` drops a second call for an
     * actor already in flight, and the same actor can hold combatants in more than
     * one combat, so firing these together would silently skip the duplicates.
     * Nearly all of them write nothing, which is what makes the cost of walking the
     * whole world at startup acceptable.
     */
    static async reconcileAll() {
        if (!this._isEnabled() || !this._isWriter()) return;
        let reconciled = 0;
        for (const combat of game.combats ?? []) {
            for (const combatant of combat.combatants ?? []) {
                try {
                    await this.syncCombatant(combatant);
                    reconciled++;
                } catch (error) {
                    // One bad combatant must not end the sweep for the other forty-three.
                    postConsoleAndNotification(MODULE.NAME, 'Defeated: Error reconciling combatant', `${combatant?.name ?? 'unknown'}: ${error?.message || error}`, false, false);
                }
            }
        }
        if (reconciled) postConsoleAndNotification(MODULE.NAME, 'Defeated: Reconciled existing combatants', reconciled, true, false);
    }

    // ==============================================================
    // ===== THE DEFINITION =========================================
    // ==============================================================
    //
    // **Blacksmith decides what "dead" means, and this is where it is decided.**
    // Everything in the module that needs the answer asks one of the two functions
    // below; nothing re-derives it. Before this, three places each held their own
    // version -- the combat bar's `isCombatantDead`, the encounter builder's
    // `canStillFight`, and core's `Combatant#isDefeated` -- and they could disagree,
    // which is how a table ends up with a bar showing a skull over a combatant the
    // tracker is about to give a turn to.
    //
    // THE RULE
    //
    //   * An explicit verdict wins, from wherever it came: the GM's skull, the
    //     DEFEATED status, or this manager's own mark. That is `isDefeated`.
    //   * Otherwise a NON-CHARACTER at 0 or fewer hit points is dead.
    //   * A character at zero is DYING, not dead. They still take turns, because
    //     rolling death saves is what their turn is for. Only an explicit mark --
    //     three failed saves, or a GM deciding it -- ends a character.
    //
    // HOW THIS STAYS IN AGREEMENT WITH CORE (raised by the Crier session, 2026-09-03)
    //
    // The seam to worry about is this predicate drifting from `Combatant#isDefeated`,
    // because core's `nextTurn` and every sibling's skip follow `isDefeated` while our
    // own UI would follow this. If the two ever disagreed, the desync would move rather
    // than close.
    //
    // **`isDefeated` is DOWNSTREAM of this predicate, not merely correlated with it.**
    // That is the whole job of the sync above: anything this predicate calls dead,
    // `syncCombatant` marks -- both the field and the status -- so core's getter is
    // kept as a faithful projection of our definition rather than a second opinion.
    //
    // The invariant that keeps it true, and the one thing not to break: **never define
    // dead in a way this manager does not also write.** A rule that reads (say) a
    // fleeing NPC as out of the fight, without a corresponding mark, would reintroduce
    // exactly the divergence this note exists to prevent.

    /**
     * Whether this combatant is dead. The single answer; see THE DEFINITION above.
     * @param {Combatant|null} combatant
     * @returns {boolean}
     */
    static isDead(combatant) {
        const actor = combatant?.actor;
        if (!actor) return false;
        if (combatant.isDefeated === true) return true;
        return this._isActorDeadByHitPoints(actor);
    }

    /**
     * Whether the creature this token stands for is dead.
     *
     * Separate from `isDead` because the callers differ: the encounter builder works
     * from canvas tokens and runs OUT of combat, where there is no combatant to ask.
     * It still has to honour an explicit verdict, so it looks for a combatant in ANY
     * combat rather than the viewed one -- `game.combat` resolves to the first ACTIVE
     * combat in the world and is null whenever no combat is flagged active, which is a
     * live condition, not a hypothetical (2026-09-02). Reading it here would have made
     * a GM-marked corpse look alive to the encounter builder.
     *
     * @param {Token|TokenDocument|null} token
     * @returns {boolean}
     */
    static isTokenDead(token) {
        const actor = token?.actor;
        if (!actor) return false;

        if (actor.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? 'dead')) return true;

        const tokenId = token.id ?? token.document?.id ?? null;
        if (tokenId) {
            for (const combat of game.combats ?? []) {
                for (const combatant of combat.combatants ?? []) {
                    if (combatant.tokenId !== tokenId) continue;
                    if (combatant.isDefeated === true) return true;
                }
            }
        }

        return this._isActorDeadByHitPoints(actor);
    }

    /**
     * The hit-point half of the rule, shared by both entry points.
     *
     * A missing pool reads as ALIVE rather than dead: hit points are optional on an
     * actor -- a dnd5e `group` carries members instead -- and "we cannot tell" must not
     * become "remove it from the fight".
     *
     * @param {Actor|null} actor
     * @returns {boolean}
     */
    static _isActorDeadByHitPoints(actor) {
        if (!actor || actor.type === 'character') return false;
        const hp = Number(actor.system?.attributes?.hp?.value);
        if (!Number.isFinite(hp)) return false;
        return hp <= 0;
    }

    /** Whether this client is the one that performs the writes. */
    static _isWriter() {
        return game.users?.activeGM?.isSelf === true;
    }

    /** Whether the feature is on. Read per call so the setting is live. */
    static _isEnabled() {
        return getSettingSafely(MODULE.ID, 'combatAutoMarkDefeated', true) === true;
    }

    /**
     * Every combatant in every combat backed by this actor. All of them, not just
     * the active combat's: a second fight on another scene holds the same creature
     * at the same hit points, and leaving it unmarked there would put the two
     * combats back into disagreement.
     */
    static _combatantsForActor(actor) {
        if (!actor) return [];
        const found = [];
        for (const combat of game.combats ?? []) {
            for (const combatant of combat.combatants ?? []) {
                if (combatant.actor?.uuid === actor.uuid) found.push(combatant);
            }
        }
        return found;
    }

    /** Bring every combatant backed by this actor in line with its hit points. */
    static async syncActor(actor) {
        if (!this._isEnabled() || !this._isWriter()) return;
        for (const combatant of this._combatantsForActor(actor)) {
            await this.syncCombatant(combatant);
        }
    }

    /**
     * The one decision, for one combatant. Non-characters only, and a no-op unless
     * the mark actually has to move -- this is reached from a hook that fires on
     * every hit point change, including the fourteen that do not cross zero.
     */
    static async syncCombatant(combatant) {
        const actorUuid = combatant?.actor?.uuid ?? null;
        // Whether THIS invocation is the one holding the guard. Without it the
        // `finally` below would release a guard this call never took -- the dropped
        // second caller would clear the first caller's claim while it was still
        // working, which is the exact race the guard exists to close.
        let holdsGuard = false;
        try {
            if (!this._isEnabled() || !this._isWriter()) return;
            const actor = combatant?.actor;
            if (!actor || actor.type === 'character') return;

            // One sync per actor at a time. See `_inFlight`. Dropping the second
            // rather than queueing it is correct: it was triggered by the same hit
            // points the first is already acting on, so it has nothing new to apply,
            // and a later change fires its own hook.
            if (actorUuid && this._inFlight.has(actorUuid)) return;
            if (actorUuid) {
                this._inFlight.add(actorUuid);
                holdsGuard = true;
            }

            const hp = Number(actor.system?.attributes?.hp?.value ?? 0);
            const shouldBeDefeated = hp <= 0;

            // Going up: only undo what this manager did. A GM who marked a fleeing
            // NPC defeated at full health meant it, and a later heal is not a reason
            // to overrule them. This guards BOTH writes below, which is why it comes
            // before either is considered -- a GM who put the skull on by hand keeps
            // both the field and the overlay.
            if (!shouldBeDefeated && combatant.getFlag(MODULE.ID, AUTO_FLAG) !== true) return;

            // The two halves are judged SEPARATELY, because they can disagree and
            // routinely do. `Combatant#isDefeated` is an OR of the two, so testing it
            // hides exactly the half-states this manager exists to close: a creature
            // carrying the status but no field reads as fully defeated through
            // `isDefeated`, while XP awards and adversary statistics, which read the
            // raw field, never see the kill. Observed in the wild, not theorised.
            const statusId = CONFIG.specialStatusEffects?.DEFEATED;
            const hasStatus = !!(statusId && actor.effects?.find(e => e.statuses?.has(statusId)));
            const fieldNeedsWrite = (combatant.defeated === true) !== shouldBeDefeated;
            const statusNeedsWrite = hasStatus !== shouldBeDefeated;

            if (!fieldNeedsWrite && !statusNeedsWrite) return;

            if (fieldNeedsWrite) {
                await combatant.update({
                    defeated: shouldBeDefeated,
                    [`flags.${MODULE.ID}.${AUTO_FLAG}`]: shouldBeDefeated ? true : null
                });
            }
            if (statusNeedsWrite) await this._syncStatusEffect(actor, shouldBeDefeated);

            postConsoleAndNotification(
                MODULE.NAME,
                `Defeated: ${combatant.name} ${shouldBeDefeated ? 'marked' : 'unmarked'} at ${hp} hit points`,
                `field: ${fieldNeedsWrite ? 'written' : 'already correct'}, status: ${statusNeedsWrite ? 'written' : 'already correct'}`,
                true,
                false
            );
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Defeated: Error syncing defeated state', error?.message || error, false, false);
        } finally {
            if (holdsGuard) this._inFlight.delete(actorUuid);
        }
    }

    /**
     * The status effect half. Setting only the `defeated` field leaves the token
     * without its overlay, which is the half-state players actually see -- the same
     * point `CombatBarManager.toggleCombatantDefeated` makes, and the same two
     * writes, so the two paths produce identical state.
     */
    static async _syncStatusEffect(actor, active) {
        const statusId = CONFIG.specialStatusEffects?.DEFEATED;
        if (!statusId || !actor) return;
        const existing = actor.effects.find(e => e.statuses?.has(statusId));
        if (active && !existing) {
            try {
                await actor.toggleStatusEffect(statusId, { overlay: true, active: true });
            } catch (error) {
                // The status effect carries a STATIC id, so a second creator hits a
                // duplicate-id rejection rather than making a second effect. Our own
                // `_inFlight` guard cannot prevent that on its own: core's tracker
                // skull button, dnd5e, or another module can create the same effect
                // at the same moment, and we cannot lock them out. The outcome we
                // wanted has happened either way, so swallow that one case and let
                // anything else be reported.
                const message = String(error?.message ?? '');
                if (!message.includes('already exists')) throw error;
                postConsoleAndNotification(MODULE.NAME, 'Defeated: Defeated status was already being applied by something else', '', true, false);
            }
        } else if (!active && existing) {
            // Guarded for the same reason the create above is, and it was not.
            // `actor.effects` is this client's copy: another client, the tracker's
            // own skull button, or any other module can delete the effect between the
            // lookup a line above and this call, and the server then rejects ours with
            // "ActiveEffect <id> does not exist!". Unhandled, that surfaced in the
            // GM's console as an uncaught promise rejection out of the server's
            // `_deleteDocuments` -- reported on 2026-09-02. The outcome we wanted
            // has happened either way.
            try {
                await existing.delete();
            } catch (error) {
                const message = String(error?.message ?? '');
                if (!message.includes('does not exist')) throw error;
                postConsoleAndNotification(MODULE.NAME, 'Defeated: Defeated status was already removed by something else', '', true, false);
            }
        }
    }
}
