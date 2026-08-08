// ==================================================================
// ===== STATS-ADVERSARIES.JS =======================================
// ==================================================================
// A per-combatant record of what happened to each adversary during a
// combat, so XP does not have to be derived from the final state of the
// combat tracker.
//
// WHY THIS EXISTS. `XpManager.detectMonsterResolution` reads live actor
// hit points at award time. That is correct only while every token still
// exists: `Combatant#actor` falls back to the base prototype actor when
// its token is gone (client/documents/combatant.mjs:84-87), and a
// prototype is at full health because the damage lived in the token's
// delta and died with it. So a monster killed and then looted-and-cleared
// mid-fight re-derives as undamaged and earns nothing. Looting a corpse
// during combat is normal table practice -- it declutters the canvas --
// so this is not an edge case.
//
// EVIDENCE, NOT VERDICT. This stores hit points and defeated state, never
// a resolution. `detectMonsterResolution` still decides, so a GM who
// corrects a resolution in the XP window, or a table that later changes
// its multiplier settings, is not arguing with a frozen answer.
//
// KEYED ON COMBATANT ID. Not actor id: an unlinked token carries the
// BASE actor's id, so two tokens of one prototype are indistinguishable
// by it -- and that is exactly the case this record has to get right.
//
// PERSISTED, because sessions stop mid-combat. The record lives in a flag
// on the Combat document, written through the same debounced path as the
// rest of combat stats, so a reload resumes with it intact.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const FLAG_KEY = 'adversaries';

/** Full flag path, for recognising our own writes coming back at us as updateCombat. */
export const ADVERSARY_FLAG_PATH = `flags.${MODULE.ID}.${FLAG_KEY}`;

/**
 * Read the record off a Combat document.
 *
 * Takes the document rather than reading `game.combat`, because the caller that needs it most runs
 * on `deleteCombat` -- when `game.combat` is already null but the hook's argument is still readable.
 *
 * @param {Combat} combat
 * @returns {object} combatantId -> evidence. Empty when there is nothing recorded.
 */
export function getAdversaryRecord(combat) {
    if (!combat) return {};
    try {
        return combat.getFlag(MODULE.ID, FLAG_KEY) ?? {};
    } catch (_) {
        return {};
    }
}

/**
 * Evidence for one combatant, as it stands right now.
 *
 * `maxHp` is captured so a later reader can tell "damaged" from "untouched" without the prototype,
 * and `defeated` covers the case a GM marks something dead without taking it to zero.
 *
 * @param {Combatant} combatant
 * @returns {object|null} Null when there is nothing worth recording.
 */
function snapshotCombatant(combatant) {
    const actor = combatant?.actor;
    if (!actor) return null;
    const hp = actor.system?.attributes?.hp;
    const current = Number(hp?.value);
    const max = Number(hp?.max);
    return {
        combatantId: combatant.id,
        name: combatant.name ?? actor.name ?? 'Unknown',
        actorUuid: actor.uuid ?? null,
        tokenUuid: combatant.token?.uuid ?? null,
        actorType: actor.type ?? null,
        hasPlayerOwner: actor.hasPlayerOwner === true,
        cr: actor.system?.details?.cr ?? null,
        hp: Number.isFinite(current) ? current : null,
        maxHp: Number.isFinite(max) ? max : null,
        defeated: combatant.isDefeated === true,
        updated: combatant.parent?.round ?? null
    };
}

/**
 * Write the record, but only when it actually changed.
 *
 * This guard is load-bearing rather than an optimisation. `setFlag` updates the Combat document,
 * which fires `updateCombat`, which is where the periodic sweep is registered -- so an
 * unconditional write is a write loop: sweep, write, sweep, write, each with a server round trip.
 * Comparing first terminates it without depending on whether Foundry happens to short-circuit a
 * no-op update, which is not a behaviour worth betting on.
 *
 * @param {Combat} combat
 * @param {object} record
 * @returns {Promise<void>}
 */
async function _write(combat, record) {
    try {
        if (foundry.utils.objectsEqual(getAdversaryRecord(combat), record)) return;
        await combat.setFlag(MODULE.ID, FLAG_KEY, record);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Adversary Record: capture failed', error, false, false);
    }
}

export class AdversaryRecord {
    /**
     * Record the current state of every combatant in a combat.
     *
     * Called often and cheaply: it reads documents already in memory and writes one flag. The write
     * is what makes it survive a reload, which is required because sessions stop mid-combat.
     *
     * @param {Combat} combat
     * @returns {Promise<void>}
     */
    static async captureAll(combat) {
        if (!combat || !game.user?.isGM) return;
        const record = { ...getAdversaryRecord(combat) };
        for (const combatant of combat.combatants ?? []) {
            // A combatant with no token can only produce DEGRADED evidence: its actor resolves to
            // the prototype, so hit points read as full and the name reads as the prototype's. Once
            // something is recorded, re-capturing in that state is strictly worse than keeping what
            // we have -- and the periodic sweep would otherwise do exactly that on the next round,
            // silently replacing the name and hit points captured while the token was alive.
            if (!combatant.token && record[combatant.id]) continue;
            const evidence = snapshotCombatant(combatant);
            if (evidence) record[combatant.id] = evidence;
        }
        await _write(combat, record);
    }

    /**
     * Record one combatant, preserving everything already known about the others.
     *
     * This is the call that matters on the way out: a token about to be deleted, or a combatant
     * about to be removed, is the last moment its hit points exist anywhere.
     *
     * @param {Combatant} combatant
     * @returns {Promise<void>}
     */
    static async capture(combatant) {
        const combat = combatant?.parent;
        if (!combat || !game.user?.isGM) return;
        const record = { ...getAdversaryRecord(combat) };
        // Same rule as the sweep: do not downgrade an entry captured while the token existed.
        if (!combatant.token && record[combatant.id]) return;
        const evidence = snapshotCombatant(combatant);
        if (!evidence) return;
        record[combatant.id] = evidence;
        await _write(combat, record);
    }

    /**
     * Capture every combatant whose token is among those about to be deleted.
     *
     * Runs on `preDeleteToken` rather than `deleteToken`: afterwards the token is gone, its actor
     * resolves to the prototype, and the hit points this record exists to preserve are already
     * unrecoverable.
     *
     * @param {TokenDocument} tokenDocument
     * @returns {Promise<void>}
     */
    static async captureForToken(tokenDocument) {
        const combat = game.combat;
        if (!combat || !tokenDocument?.id || !game.user?.isGM) return;
        const affected = combat.combatants.filter(c => c.tokenId === tokenDocument.id);

        // Read every value we need SYNCHRONOUSLY, before the first await.
        //
        // This hook is not awaited by Foundry -- a pre-hook returning a promise does not delay the
        // delete -- so the token disappears while this function is still running. Anything read after
        // an await reads a combatant whose token is already gone, which means the prototype: full
        // hit points and the prototype's name. The first version of this awaited a server round trip
        // and then read the name, and stamped "Cult Leader (BCOD)" over the name it was trying to
        // preserve.
        const pending = affected.map(combatant => ({
            combatant,
            evidence: snapshotCombatant(combatant),
            displayName: combatant.token?.name ?? combatant.name
        }));

        for (const entry of pending) {
            if (entry.evidence) await this.captureEvidence(combat, entry.combatant.id, entry.evidence);
            await this.stampName(entry.combatant, entry.displayName);
        }
    }

    /**
     * Store an already-taken snapshot. Separate from `capture` because the caller that matters has
     * to take its snapshot before awaiting anything.
     *
     * @param {Combat} combat
     * @param {string} combatantId
     * @param {object} evidence
     * @returns {Promise<void>}
     */
    static async captureEvidence(combat, combatantId, evidence) {
        if (!combat || !evidence || !game.user?.isGM) return;
        const record = { ...getAdversaryRecord(combat) };
        record[combatantId] = evidence;
        await _write(combat, record);
    }

    /**
     * Persist the combatant's display name into its own `name` field before its token disappears.
     *
     * `Combatant#name` is a stored field that, when empty, derives as `token?.name || actor?.name`
     * (`client/documents/combatant.mjs:159`). For an unlinked token the actor fallback is the
     * PROTOTYPE name, so the combat tracker reverts an adversary to "Cult Leader" the moment its
     * corpse is cleared -- on the next data preparation, which is why it appears to change on its own
     * a moment later rather than immediately.
     *
     * Writing the derived name into the field it derives INTO stops the derivation: `||=` leaves a
     * populated value alone. This fixes the tracker as well as the XP window, which reading the
     * record cannot do.
     *
     * Never overwrites a name that is already stored -- that would be a GM's explicit rename.
     *
     * @param {Combatant} combatant
     * @returns {Promise<void>}
     */
    static async stampName(combatant, displayName = null) {
        if (!combatant || !game.user?.isGM) return;
        if (combatant._source?.name) return;          // a GM said so; leave it alone
        // Passed in by callers that read it before the token went away. Re-deriving here would read
        // the prototype for exactly the combatants this exists to protect.
        displayName ??= combatant.token?.name ?? combatant.name;
        if (!displayName) return;
        try {
            await combatant.update({ name: displayName });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Adversary Record: name stamp failed', error, false, false);
        }
    }
}
