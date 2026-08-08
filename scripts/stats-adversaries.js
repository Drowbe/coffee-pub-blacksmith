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
        try {
            const record = { ...getAdversaryRecord(combat) };
            for (const combatant of combat.combatants ?? []) {
                const evidence = snapshotCombatant(combatant);
                if (evidence) record[combatant.id] = evidence;
            }
            await combat.setFlag(MODULE.ID, FLAG_KEY, record);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Adversary Record: capture failed', error, false, false);
        }
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
        const evidence = snapshotCombatant(combatant);
        if (!evidence) return;
        try {
            const record = { ...getAdversaryRecord(combat) };
            record[combatant.id] = evidence;
            await combat.setFlag(MODULE.ID, FLAG_KEY, record);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Adversary Record: capture failed', error, false, false);
        }
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
        for (const combatant of affected) await this.capture(combatant);
    }
}
