// ==================================================================
// ===== MANAGER-NPC-SCALING-TEMPLATES: the template library ========
// ==================================================================
//
// Named scalings ("Elite", "Super") stored as plain data in a world setting. The engine
// (utility-npc-scaling.js) owns what a template means; this file owns where the library lives.
//
// WORLD-scoped and `config: false`, like the Quick Rolls library this copies: it is content a table
// builds, not a preference, and a second GM should see the same list. SEEDED ONCE, then left alone: a
// separate flag records that the built-ins were planted, so a GM who deletes them does not find them back
// next launch. The seed is lazy -- `all()` returns the built-ins until something is written -- so there is
// no ready-time hook to order.

import { MODULE } from './const.js';
import { getSettingSafely } from './api-core.js';
import { NpcScalingError, BUILTIN_TEMPLATES, TEMPLATE_VERSION, normalizeTemplate } from './utility-npc-scaling.js';

const SETTING = 'npcScalingTemplates';
const SEEDED_SETTING = 'npcScalingTemplatesSeeded';
const EXPORT_TYPE = 'coffee-pub-blacksmith.npc-scaling-templates';

export class NpcScalingTemplates {

    /** A template with an id; one without gets a fresh one. */
    static _normalize(raw) {
        const t = normalizeTemplate(raw);
        return { ...t, id: t.id || `tpl-${foundry.utils.randomID(10)}` };
    }

    /**
     * The library, normalised. Returns the built-ins while nothing has been written AND the seed flag is
     * unset; an empty list with the flag set is a GM who cleared it on purpose.
     * @returns {Object[]}
     */
    static all() {
        const stored = getSettingSafely(MODULE.ID, SETTING, null);
        if (Array.isArray(stored) && stored.length) return stored.map((t) => NpcScalingTemplates._normalize(t));
        if (getSettingSafely(MODULE.ID, SEEDED_SETTING, false)) return [];
        return BUILTIN_TEMPLATES.map((t) => NpcScalingTemplates._normalize(t));
    }

    static get(id) {
        return NpcScalingTemplates.all().find((t) => t.id === id) ?? null;
    }

    static async _write(list) {
        if (!game.user?.isGM) throw new NpcScalingError('NOT_GM', 'Only a GM can change the template library.');
        await game.settings.set(MODULE.ID, SETTING, list.map((t) => NpcScalingTemplates._normalize(t)));
        // Writing anything makes the library the GM's, so the built-ins must never be planted over it later.
        if (!getSettingSafely(MODULE.ID, SEEDED_SETTING, false)) await game.settings.set(MODULE.ID, SEEDED_SETTING, true);
    }

    /**
     * Add a template, or replace the one sharing its id.
     * @param {Object} record
     * @returns {Promise<Object>} The stored template.
     * @throws {NpcScalingError} BAD_TEMPLATE, NOT_GM.
     */
    static async save(record) {
        const normalized = NpcScalingTemplates._normalize(record);
        const list = NpcScalingTemplates.all();
        const index = list.findIndex((t) => t.id === normalized.id);
        if (index >= 0) list[index] = normalized;
        else list.push(normalized);
        await NpcScalingTemplates._write(list);
        return normalized;
    }

    static async remove(id) {
        await NpcScalingTemplates._write(NpcScalingTemplates.all().filter((t) => t.id !== id));
    }

    /** True when another template already has this name (case-insensitive), ignoring the one with `exceptId`. */
    static nameTaken(name, exceptId = null) {
        const wanted = String(name ?? '').trim().toLowerCase();
        return NpcScalingTemplates.all().some((t) => t.id !== exceptId && t.name.toLowerCase() === wanted);
    }

    // ===== PORTABILITY ============================================

    /** The library as an enveloped file payload. The envelope is what tells it from any other JSON array. */
    static exportPayload() {
        return {
            type: EXPORT_TYPE,
            version: TEMPLATE_VERSION,
            exportedAt: new Date().toISOString(),
            world: game.world?.id ?? null,
            templates: NpcScalingTemplates.all()
        };
    }

    static exportFilename() {
        const world = String(game.world?.id ?? 'world').replace(/[^A-Za-z0-9_-]+/g, '-');
        return `npc-scaling-templates-${world}-${new Date().toISOString().slice(0, 10)}.json`;
    }

    static exportToFile() {
        const payload = NpcScalingTemplates.exportPayload();
        foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), 'application/json', NpcScalingTemplates.exportFilename());
        return payload.templates.length;
    }

    /**
     * Read a file's text into normalised templates, or throw with a reason a GM can act on. Accepts the
     * envelope and a bare array. An entry with no name is a file of the wrong kind and is dropped.
     * @param {string} text
     * @returns {Object[]}
     * @throws {NpcScalingError} BAD_TEMPLATE
     */
    static parseImport(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            throw new NpcScalingError('BAD_TEMPLATE', 'That file is not valid JSON.');
        }
        const raw = Array.isArray(parsed) ? parsed : parsed?.templates;
        if (!Array.isArray(raw)) throw new NpcScalingError('BAD_TEMPLATE', 'That file does not contain NPC scaling templates.');
        if (parsed?.version != null && Number(parsed.version) > TEMPLATE_VERSION) {
            throw new NpcScalingError('BAD_TEMPLATE', `That file was written by a newer version of Blacksmith (format ${parsed.version}).`);
        }
        const templates = raw
            .filter((t) => t && typeof t === 'object' && String(t.name ?? '').trim())
            .map((t) => NpcScalingTemplates._normalize(t));
        if (!templates.length) throw new NpcScalingError('BAD_TEMPLATE', 'That file contains no usable templates.');
        return templates;
    }

    /**
     * Bring imported templates into the library. Merging matches on id: re-importing an export updates what
     * changed instead of doubling it. `replace` empties the library first.
     * @returns {Promise<{ added: number, updated: number, total: number }>}
     */
    static async importTemplates(templates, { replace = false } = {}) {
        const existing = replace ? [] : NpcScalingTemplates.all();
        const known = new Set(existing.map((t) => t.id));
        const incoming = new Map(templates.map((t) => [t.id, t]));
        const merged = [
            ...existing.map((t) => incoming.get(t.id) ?? t),
            ...templates.filter((t) => !known.has(t.id))
        ];
        const updated = templates.filter((t) => known.has(t.id)).length;
        await NpcScalingTemplates._write(merged);
        return { added: templates.length - updated, updated, total: merged.length };
    }
}
