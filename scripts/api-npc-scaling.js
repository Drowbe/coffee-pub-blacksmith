// ==================================================================
// ===== API-NPC-SCALING.JS =========================================
// ==================================================================
// The public surface for scaling a creature: `game.modules.get('coffee-pub-blacksmith').api.npcScaling`.
// Blacksmith's own window is its first consumer. GM only, end to end: scaling creates a world actor.
//
// See documentation/api/api-npc-scaling.md.

import { NpcScalingManager, NPC_SCALING_APPLIED_HOOK } from './manager-npc-scaling.js';
import { NpcScalingError, GUIDELINES, specFromCR, proficiencyForCR, SPEC_VERSION } from './utility-npc-scaling.js';

export const NpcScalingAPI = {

    /** The hook fired once after a scaled actor is created: `{ source, result, spec, output }`. */
    HOOK_APPLIED: NPC_SCALING_APPLIED_HOOK,

    /** The error class every refusal is an instance of; `error.code` is stable. */
    NpcScalingError,

    /** The version a spec carries. A spec of another version is refused. */
    SPEC_VERSION,

    /**
     * What a scaling would change, without changing anything.
     * @param {Actor|Token|TokenDocument|string} target  An NPC, a token of one, or a UUID.
     * @param {{ cr?: number, spec?: Object, label?: string, attacksPerRound?: number }} request  A target CR or a ready-made spec.
     * @returns {Promise<{ spec: Object, preview: Array, warnings: Array, snapshot: Object }>}
     * @throws {NpcScalingError}
     */
    async preview(target, request = {}) {
        const { spec, preview, warnings, snapshot } = await NpcScalingManager.plan(target, request);
        return { spec, preview, warnings, snapshot };
    },

    /**
     * Scale a creature into a NEW actor. The source is never changed.
     * @param {Actor|Token|TokenDocument|string} target
     * @param {{ cr?: number, spec?: Object, label?: string, attacksPerRound?: number, output?: 'actor' }} request
     * @returns {Promise<{ actor: Actor, source: Actor, preview: Array, warnings: Array, spec: Object }>}
     * @throws {NpcScalingError}
     */
    async apply(target, request = {}) {
        return NpcScalingManager.apply(target, request);
    },

    /**
     * Describe a CR retarget as a spec without reading any actor: for tools that build or save specs.
     * @param {{ cr: number, attacksPerRound?: number }} source
     * @param {number} targetCR
     * @param {{ label?: string }} [options]
     * @returns {Object}
     */
    specFromCR(source, targetCR, options = {}) {
        return specFromCR(source, targetCR, options);
    },

    /**
     * What a scaled actor says about itself, or null for any other actor.
     * @param {Actor} actor
     * @returns {{ sourceUuid: string, spec: Object, version: number, appliedAt: number, crFrom: number|null, crTo: number|null }|null}
     */
    provenance(actor) {
        return NpcScalingManager.provenance(actor);
    },

    /** The proficiency bonus dnd5e gives an NPC of this CR. */
    proficiencyForCR,

    /** The guidelines table in use, frozen. */
    get guidelines() {
        return GUIDELINES;
    },

    /**
     * Open the scaling window for a creature, or focus the one already open for it.
     * @param {Actor|Token|TokenDocument|string} target
     * @returns {Promise<Application|null>}
     */
    async open(target) {
        const { NpcScalingWindow } = await import('./window-npc-scaling.js');
        return NpcScalingWindow.open(target);
    }
};
