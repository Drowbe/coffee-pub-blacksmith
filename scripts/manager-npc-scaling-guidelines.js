// ==================================================================
// ===== MANAGER-NPC-SCALING-GUIDELINES: which table scaling reads ==
// ==================================================================
//
// Scaling reads each stat's gap between two challenge ratings from a table. The module ships the DMG 2014
// table (`GUIDELINES`); a GM can instead build one from the creatures in a compendium they choose, which is
// how a table gets 2024 numbers (no 2024 book publishes one). The BUILDING is in the engine
// (`buildTable`) and the SAMPLING is in `NpcScalingManager.sampleCompendium`; this file only holds the choice.
//
// One world setting, `config: false`, holding either nothing (use the bundled table) or the built table with
// where it came from. A stored table that fails `validateTable` is not used: scaling falls back to the
// bundled one and says so in the console, because a table whose rows fall would scale creatures down while
// the preview read fine.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { GUIDELINES, NpcScalingError, validateTable, deepFreeze } from './utility-npc-scaling.js';

const SETTING = 'npcScalingGuidelines';
const STORE_VERSION = 1;

/** What the table is called when nothing has been built. */
export const BUNDLED_LABEL = 'DMG 2014 (bundled)';

let warned = false;

export class NpcScalingGuidelines {

    /**
     * The table scaling reads now, and where it came from.
     * @returns {{ kind: 'bundled'|'compendium', label: string, builtAt: number|null, samples: number|null, packs: string[], rows: Array, table: Object }}
     */
    static current() {
        const stored = getSettingSafely(MODULE.ID, SETTING, null);
        if (stored?.table) {
            const problems = validateTable(stored.table);
            if (!problems.length) {
                return {
                    kind: 'compendium',
                    label: String(stored.label || 'Built from a compendium'),
                    builtAt: stored.builtAt ?? null,
                    samples: stored.samples ?? null,
                    packs: Array.isArray(stored.packs) ? stored.packs : [],
                    rows: Array.isArray(stored.rows) ? stored.rows : [],
                    table: deepFreeze(foundry.utils.deepClone(stored.table))
                };
            }
            if (!warned) {
                warned = true;
                postConsoleAndNotification(MODULE.NAME,
                    `NPC Scaling: the stored guidelines table is not usable (${problems[0]}); scaling with ${BUNDLED_LABEL}.`, problems, false, false);
            }
        }
        return { kind: 'bundled', label: BUNDLED_LABEL, builtAt: null, samples: null, packs: [], rows: [], table: GUIDELINES };
    }

    /**
     * Make a built table the world's table.
     * @param {{ table: Object, report: { samples: number, rows: Array }, label?: string, packs?: string[] }} result  What `api.npcScaling.buildGuidelines` resolved.
     * @returns {Promise<void>}
     * @throws {NpcScalingError} NOT_GM, BAD_TABLE.
     */
    static async save(result) {
        if (!game.user?.isGM) throw new NpcScalingError('NOT_GM', 'Only a GM can change the guidelines table.');
        const problems = validateTable(result?.table);
        if (problems.length) throw new NpcScalingError('BAD_TABLE', `That table cannot be used: ${problems[0]}`);
        warned = false;
        await game.settings.set(MODULE.ID, SETTING, {
            version: STORE_VERSION,
            label: String(result.label || 'Built from a compendium'),
            builtAt: Date.now(),
            packs: result.packs ?? [],
            samples: result.report?.samples ?? null,
            table: foundry.utils.deepClone(result.table),
            rows: result.report?.rows ?? []
        });
    }

    /** Go back to the bundled table. */
    static async reset() {
        if (!game.user?.isGM) throw new NpcScalingError('NOT_GM', 'Only a GM can change the guidelines table.');
        warned = false;
        await game.settings.set(MODULE.ID, SETTING, {});
    }
}
