// ==================================================================
// ===== API-NPC-SCALING.JS =========================================
// ==================================================================
// The public surface for scaling a creature: `game.modules.get('coffee-pub-blacksmith').api.npcScaling`.
// Blacksmith's own window is its first consumer. GM only, end to end: scaling creates a world actor.
//
// See documentation/api/api-npc-scaling.md.

import { NpcScalingManager, NPC_SCALING_APPLIED_HOOK } from './manager-npc-scaling.js';
import { NpcScalingTemplates } from './manager-npc-scaling-templates.js';
import { NpcScalingGuidelines } from './manager-npc-scaling-guidelines.js';
import {
    NpcScalingError, GUIDELINES, specFromCR, specFromTemplate, templateFromSpec, proficiencyForCR, buildTable, SPEC_VERSION
} from './utility-npc-scaling.js';

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
     * The template library: named scalings stored as data in the world. A template names no document, so it
     * exports and imports as plain JSON. Reads are open to every client; writes are GM only.
     * Pass a template's id (or the object) as `request.template` to `preview` and `apply`.
     */
    templates: {
        /** @returns {Object[]} Every template. The built-ins until the GM first changes the library. */
        list() {
            return NpcScalingTemplates.all();
        },

        /** @param {string} id @returns {Object|null} */
        get(id) {
            return NpcScalingTemplates.get(id);
        },

        /**
         * Add a template, or replace the one with this id. A template with no id gets one.
         * @param {Object} template  `{ id?, name, crBy, hp: { mode, value }, ac, attack, saveDC, initiative, damage, legres, legact }`
         * @returns {Promise<Object>} The stored template.
         * @throws {NpcScalingError} BAD_TEMPLATE, NOT_GM.
         */
        save(template) {
            return NpcScalingTemplates.save(template);
        },

        /** @param {string} id @returns {Promise<void>} */
        remove(id) {
            return NpcScalingTemplates.remove(id);
        },

        /** True when another template already has this name. */
        nameTaken(name, exceptId = null) {
            return NpcScalingTemplates.nameTaken(name, exceptId);
        },

        /**
         * The portable template a spec amounts to: hit points as a percentage, attack as a total, the CR change as a step.
         * @param {Object} spec
         * @param {{ cr: number|null, hpMax?: number }} source  The creature the spec was made for.
         * @param {string} name
         * @returns {Object}
         */
        fromSpec(spec, source, name) {
            return templateFromSpec(spec, source, name);
        },

        /** The spec a template makes for a creature with this CR (and hit point maximum). Reads nothing. */
        toSpec(template, source) {
            return specFromTemplate(template, source);
        },

        /** The library as a file payload. */
        exportPayload() {
            return NpcScalingTemplates.exportPayload();
        },

        /** Download the library as a JSON file. @returns {number} How many templates it holds. */
        exportToFile() {
            return NpcScalingTemplates.exportToFile();
        },

        /** Read a file's text into templates, or throw `BAD_TEMPLATE`. Writes nothing. */
        parseImport(text) {
            return NpcScalingTemplates.parseImport(text);
        },

        /** @returns {Promise<{ added: number, updated: number, total: number }>} */
        import(templates, options = {}) {
            return NpcScalingTemplates.importTemplates(templates, options);
        }
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

    /** The guidelines table scaling reads now, frozen: the bundled one, or the one built from a compendium. */
    get guidelines() {
        return NpcScalingGuidelines.current().table;
    },

    /** The bundled DMG 2014 table, frozen, whatever the world is using. */
    bundledGuidelines: GUIDELINES,

    /**
     * Where the table in use came from.
     * @returns {{ kind: 'bundled'|'compendium', label: string, builtAt: number|null, samples: number|null, packs: string[], rows: Array<{ key: string, n: number, status: string }> }}
     */
    guidelineInfo() {
        const { table, ...info } = NpcScalingGuidelines.current();
        return info;
    },

    /**
     * Build a guidelines table from the NPCs in some actor compendiums, WITHOUT using it: per CR, the median
     * armor class, hit points, best attack bonus, damage per round and save DC, smoothed so no column falls as
     * CR rises. CRs with too few creatures are interpolated, and the result says which. Show it, then pass it to
     * `setGuidelines`.
     * @param {{ packs: string[], minSamples?: number, onProgress?: (done: number, total: number) => void }} options  `packs` are compendium ids, e.g. `dnd5e.actors24`.
     * @returns {Promise<{ table: Object, report: { samples: number, minSamples: number, rows: Array }, label: string, packs: string[], skipped: number }>}
     * @throws {NpcScalingError} NO_PACK, BAD_TABLE.
     */
    async buildGuidelines({ packs, minSamples, onProgress } = {}) {
        const sampled = await NpcScalingManager.sampleCompendium(packs, { onProgress });
        const built = buildTable(sampled.samples, { minSamples });
        return { ...built, label: `Built from ${sampled.labels.join(', ')}`, packs: sampled.packIds, skipped: sampled.skipped };
    },

    /**
     * Make a table from `buildGuidelines` the world's table. GM only.
     * @param {Object} result
     * @returns {Promise<void>}
     * @throws {NpcScalingError} NOT_GM, BAD_TABLE.
     */
    setGuidelines(result) {
        return NpcScalingGuidelines.save(result);
    },

    /** Go back to the bundled table. GM only. */
    resetGuidelines() {
        return NpcScalingGuidelines.reset();
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
