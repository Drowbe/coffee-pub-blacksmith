// ==================================================================
// Dynamic lists injected into roll table import prompts
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const ITEM_RARITY_ORDER = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];

function getItemRarityKey(item) {
    const r = item?.system?.rarity;
    if (!r || typeof r !== 'string') return 'other';
    return r.trim().toLowerCase();
}

function formatRarityLabel(rarityKey) {
    if (rarityKey === 'other') return 'Other';
    return rarityKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const CR_SORT_OTHER = -1;

function getActorCr(actor) {
    let cr = null;
    if (actor?.system?.details?.cr?.value !== undefined) {
        cr = actor.system.details.cr.value;
    } else if (actor?.system?.details?.cr !== undefined) {
        cr = actor.system.details.cr;
    } else if (actor?.system?.cr !== undefined) {
        cr = actor.system.cr;
    }
    const num = parseCrToNumber(cr);
    const sortKey = num !== null ? num : CR_SORT_OTHER;
    const label = num !== null ? formatCrLabel(num) : 'Other';
    return { sortKey, label };
}

function parseCrToNumber(cr) {
    if (typeof cr === 'number' && !Number.isNaN(cr)) return cr;
    if (typeof cr === 'string' && cr.trim() !== '') {
        const lower = cr.trim().toLowerCase();
        if (lower === '1/8') return 0.125;
        if (lower === '1/4') return 0.25;
        if (lower === '1/2') return 0.5;
        const n = Number(cr);
        if (!Number.isNaN(n)) return n;
    }
    return null;
}

function formatCrLabel(num) {
    if (num === 0) return '0';
    if (num === 0.125) return '1/8';
    if (num === 0.25) return '1/4';
    if (num === 0.5) return '1/2';
    return String(num);
}

export function getWorldActorsList() {
    try {
        const actors = game.actors.contents.filter(actor => !actor.isToken);
        return actors.map(actor => actor.name).join(', ');
    } catch (e) {
        return 'No actors found';
    }
}

export function getWorldItemsList() {
    try {
        const items = game.items.contents;
        return items.map(item => item.name).join(', ');
    } catch (e) {
        return 'No items found';
    }
}

export function getItemCompendiumsList() {
    try {
        const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsItem') ?? 1;
        const compendiums = [];

        for (let i = 1; i <= numCompendiums; i++) {
            const compendiumSetting = game.settings.get(MODULE.ID, `itemCompendium${i}`);
            if (compendiumSetting && compendiumSetting !== 'none') {
                compendiums.push(compendiumSetting);
            }
        }

        return compendiums.join(', ');
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Error getting item compendiums list', e, false, false);
        return 'No compendiums configured';
    }
}

export function getActorCompendiumsList() {
    try {
        const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsActor') ?? 1;
        const compendiums = [];

        for (let i = 1; i <= numCompendiums; i++) {
            const compendiumSetting = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
            if (compendiumSetting && compendiumSetting !== 'none') {
                compendiums.push(compendiumSetting);
            }
        }

        return compendiums.join(', ');
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Error getting actor compendiums list', e, false, false);
        return 'No compendiums configured';
    }
}

/**
 * Resolve which configured pack ids to use for a settings group.
 * @param {string} countKey
 * @param {string} prefix
 * @param {string[]} [packIds] - explicit subset; when provided, used as-is
 * @returns {string[]}
 */
/**
 * Yield to the browser so the "working" overlay can repaint (spinner + status) before we run
 * the next chunk of synchronous catalog processing.
 * @returns {Promise<void>}
 */
function yieldToUI() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 0);
    });
}

/**
 * Report the compendium currently being scanned and yield a frame.
 * @param {((message: string) => void)|undefined} onProgress
 * @param {string} category - "actors" | "items"
 * @param {string} label - human compendium label
 * @param {number} index - 1-based
 * @param {number} total
 * @returns {Promise<void>}
 */
async function reportScan(onProgress, category, label, index, total) {
    if (typeof onProgress !== 'function') return;
    onProgress(`Scanning ${category} — ${label} (${index}/${total})…`);
    await yieldToUI();
}

function resolveConfiguredPackIds(countKey, prefix, packIds) {
    if (Array.isArray(packIds)) {
        return packIds.filter((id) => id && id !== 'none');
    }
    const ids = [];
    const numCompendiums = game.settings.get(MODULE.ID, countKey) ?? 1;
    for (let i = 1; i <= numCompendiums; i++) {
        const id = game.settings.get(MODULE.ID, `${prefix}${i}`);
        if (id && id !== 'none') ids.push(id);
    }
    return ids;
}

/**
 * @param {string[]} [packIds] - optional subset of item-compendium pack ids; defaults to all configured
 * @param {(message: string) => void} [onProgress] - per-compendium status callback
 * @returns {Promise<string>}
 */
export async function getCompendiumItemsList(packIds, onProgress) {
    try {
        const compendiumIds = resolveConfiguredPackIds('numCompendiumsItem', 'itemCompendium', packIds);
        const compendiumBlocks = [];

        let scanIndex = 0;
        for (const compendiumId of compendiumIds) {
            try {
                const compendium = game.packs.get(compendiumId);
                if (!compendium) {
                    postConsoleAndNotification(MODULE.NAME, 'Configured compendium not found', compendiumId, false, false);
                    continue;
                }

                scanIndex += 1;
                await reportScan(onProgress, 'items', compendium.metadata?.label ?? compendiumId, scanIndex, compendiumIds.length);
                const documents = await compendium.getDocuments();
                if (!documents?.length) {
                    continue;
                }

                const byRarity = new Map();
                for (const doc of documents) {
                    const key = getItemRarityKey(doc);
                    if (!byRarity.has(key)) byRarity.set(key, []);
                    byRarity.get(key).push(doc.name);
                }

                const sortedRarityKeys = [...byRarity.keys()].sort((a, b) => {
                    const ia = ITEM_RARITY_ORDER.indexOf(a);
                    const ib = ITEM_RARITY_ORDER.indexOf(b);
                    if (ia === -1 && ib === -1) return a.localeCompare(b);
                    if (ia === -1) return 1;
                    if (ib === -1) return -1;
                    return ia - ib;
                });

                const rarityLines = sortedRarityKeys.map(rarityKey => {
                    const names = byRarity.get(rarityKey).join(', ');
                    return `RARITY: ${formatRarityLabel(rarityKey)}\n${names}`;
                });

                compendiumBlocks.push(`${compendiumId}\n\n${rarityLines.join('\n\n')}`);
            } catch (e) {
                postConsoleAndNotification(MODULE.NAME, `Error getting items from compendium ${compendiumId}`, e, false, false);
            }
        }

        return compendiumBlocks.join('\n\n');
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Error getting compendium items list', e, false, false);
        return 'Error retrieving compendium items';
    }
}

/**
 * @param {string[]} [packIds] - optional subset of actor-compendium pack ids; defaults to all configured
 * @param {(message: string) => void} [onProgress] - per-compendium status callback
 * @returns {Promise<string>}
 */
export async function getCompendiumActorsList(packIds, onProgress) {
    try {
        const compendiumIds = resolveConfiguredPackIds('numCompendiumsActor', 'monsterCompendium', packIds);
        const compendiumBlocks = [];

        let scanIndex = 0;
        for (const compendiumId of compendiumIds) {
            try {
                const compendium = game.packs.get(compendiumId);
                if (!compendium) {
                    postConsoleAndNotification(MODULE.NAME, 'Configured compendium not found', compendiumId, false, false);
                    continue;
                }

                scanIndex += 1;
                await reportScan(onProgress, 'actors', compendium.metadata?.label ?? compendiumId, scanIndex, compendiumIds.length);
                const documents = await compendium.getDocuments();
                if (!documents?.length) {
                    continue;
                }

                const byCr = new Map();
                for (const doc of documents) {
                    const { label } = getActorCr(doc);
                    if (!byCr.has(label)) byCr.set(label, []);
                    byCr.get(label).push(doc.name);
                }

                const crSortKeys = new Map();
                for (const doc of documents) {
                    const { sortKey, label } = getActorCr(doc);
                    if (!crSortKeys.has(label)) crSortKeys.set(label, sortKey);
                }
                const sortedCrLabels = [...byCr.keys()].sort((a, b) => {
                    const sa = crSortKeys.get(a) ?? CR_SORT_OTHER;
                    const sb = crSortKeys.get(b) ?? CR_SORT_OTHER;
                    if (sa === CR_SORT_OTHER && sb === CR_SORT_OTHER) return a.localeCompare(b);
                    if (sa === CR_SORT_OTHER) return 1;
                    if (sb === CR_SORT_OTHER) return -1;
                    return sa - sb;
                });

                const crLines = sortedCrLabels.map(crLabel => {
                    const names = byCr.get(crLabel).join(', ');
                    return `CR: ${crLabel}\n${names}`;
                });

                compendiumBlocks.push(`${compendiumId}\n\n${crLines.join('\n\n')}`);
            } catch (e) {
                postConsoleAndNotification(MODULE.NAME, `Error getting actors from compendium ${compendiumId}`, e, false, false);
            }
        }

        return compendiumBlocks.join('\n\n');
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Error getting compendium actors list', e, false, false);
        return 'Error retrieving compendium actors';
    }
}
