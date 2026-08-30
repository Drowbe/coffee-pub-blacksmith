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

        postConsoleAndNotification(MODULE.NAME, 'Defeated: Manager initialized', '', true, false);
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
            const isDefeated = combatant.isDefeated === true;
            if (shouldBeDefeated === isDefeated) return;

            // Going up: only undo what this manager did. A GM who marked a fleeing
            // NPC defeated at full health meant it, and a later heal is not a reason
            // to overrule them.
            if (!shouldBeDefeated && combatant.getFlag(MODULE.ID, AUTO_FLAG) !== true) return;

            await combatant.update({
                defeated: shouldBeDefeated,
                [`flags.${MODULE.ID}.${AUTO_FLAG}`]: shouldBeDefeated ? true : null
            });
            await this._syncStatusEffect(actor, shouldBeDefeated);

            postConsoleAndNotification(
                MODULE.NAME,
                `Defeated: ${combatant.name} ${shouldBeDefeated ? 'marked' : 'unmarked'} at ${hp} hit points`,
                '',
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
            await existing.delete();
        }
    }
}
