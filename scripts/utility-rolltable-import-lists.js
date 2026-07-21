// ==================================================================
// Dynamic lists injected into roll table import prompts
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { getWorldCollection as getMappedWorldCollection, getDocumentSubtype, normalizeType } from './compendium-types.js';
import { compendiumManager } from './manager-compendiums.js';

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

function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function getActorType(actor) {
    const value = actor?.system?.details?.type?.value ?? actor?.system?.details?.type ?? actor?.type ?? '';
    return normalizeText(value);
}

function getActorSize(actor) {
    return normalizeText(actor?.system?.traits?.size ?? '');
}

function getItemType(item) {
    return normalizeText(item?.type ?? item?.system?.type?.value ?? '');
}

function isMagicalItem(item) {
    const properties = item?.system?.properties;
    if (properties instanceof Set) return properties.has('mgc');
    if (Array.isArray(properties)) return properties.includes('mgc');
    return !!properties?.mgc;
}

function matchesName(document, search) {
    const term = normalizeText(search);
    return !term || normalizeText(document?.name).includes(term);
}

function matchesActorFilters(actor, filters = {}) {
    const cr = getActorCr(actor).sortKey;
    const exactCr = parseCrToNumber(filters.actorCrExact);
    const minCr = parseCrToNumber(filters.actorCrMin);
    const maxCr = parseCrToNumber(filters.actorCrMax);
    if (exactCr !== null && cr !== exactCr) return false;
    if (minCr !== null && (cr === CR_SORT_OTHER || cr < minCr)) return false;
    if (maxCr !== null && (cr === CR_SORT_OTHER || cr > maxCr)) return false;
    if (normalizeText(filters.actorType) && getActorType(actor) !== normalizeText(filters.actorType)) return false;
    if (normalizeText(filters.actorSize) && getActorSize(actor) !== normalizeText(filters.actorSize)) return false;
    return matchesName(actor, filters.nameSearch);
}

function matchesItemFilters(item, filters = {}) {
    if (normalizeText(filters.itemType) && getItemType(item) !== normalizeText(filters.itemType)) return false;
    if (normalizeText(filters.itemRarity) && getItemRarityKey(item) !== normalizeText(filters.itemRarity)) return false;
    const magical = normalizeText(filters.itemMagical);
    if (magical === 'magical' && !isMagicalItem(item)) return false;
    if (magical === 'nonmagical' && isMagicalItem(item)) return false;
    return matchesName(item, filters.nameSearch);
}

/**
 * Query world or compendium Actors/Items using the shared importer catalog contract.
 * This is intentionally UI-neutral so Roll Tables, guided templates, the future Utility
 * tab, and the public importer API can all consume the same filtered rows.
 * @param {{kind:string, source:'world'|'compendium', packIds?:string[], filters?:object, onProgress?:(message:string)=>void}} options
 * @returns {Promise<Array<object>>}
 */
export async function queryImportCatalog({ kind, source, packIds = [], filters = {}, onProgress } = {}) {
    const canonicalKind = normalizeType(kind);
    if (!canonicalKind) throw new Error(`Unsupported catalog kind: ${kind}`);
    const kindKey = canonicalKind.toLowerCase();
    if (!['world', 'compendium'].includes(source)) throw new Error(`Unsupported catalog source: ${source}`);
    const itemKinds = ['item', 'spell', 'feature', 'species', 'background', 'class', 'subclass'];
    const matches = kindKey === 'actor' ? matchesActorFilters : (itemKinds.includes(kindKey) ? matchesItemFilters : (document => matchesName(document, filters.nameSearch)));
    const requiredSubtype = getDocumentSubtype(canonicalKind);
    const rows = [];
    if (source === 'world') {
        const documents = (getMappedWorldCollection(canonicalKind) ?? []).filter(document => !document.isToken);
        for (const document of documents) {
            if (matches(document, filters)) rows.push(toCatalogRow(document, kindKey, 'world', ''));
        }
    } else {
        let index = 0;
        for (const packId of packIds.filter(Boolean)) {
            const pack = game.packs.get(packId);
            if (!pack) continue;
            index += 1;
            await reportScan(onProgress, `${canonicalKind} documents`, pack.metadata?.label ?? packId, index, packIds.length);
            const documents = await pack.getDocuments();
            for (const document of documents) {
                if (requiredSubtype && document.type !== requiredSubtype) continue;
                if (matches(document, filters)) rows.push(toCatalogRow(document, kindKey, 'compendium', packId));
            }
        }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.packId.localeCompare(b.packId));
}

function toCatalogRow(document, kind, source, packId) {
    const base = { name: document.name, id: document.id, uuid: document.uuid, source, packId, img: document.img ?? '' };
    if (kind === 'actor') {
        const cr = getActorCr(document);
        return { ...base, cr: cr.label, creatureType: getActorType(document), size: getActorSize(document) };
    }
    if (['item', 'spell', 'feature', 'species', 'background', 'class', 'subclass'].includes(kind)) return { ...base, itemType: getItemType(document), rarity: getItemRarityKey(document), magical: isMagicalItem(document) };
    return base;
}

/** @param {Array<object>} rows @param {string} kind @param {{includeImages?:boolean}} options */
export function formatImportCatalog(rows, kind, options = {}) {
    if (!rows.length) return 'No matching entries found.';
    return rows.map(row => {
        const source = `source=${row.source === 'compendium' ? row.packId : 'world'}`;
        const kindKey = String(kind).toLowerCase();
        const details = kindKey === 'actor'
            ? `CR=${row.cr}; type=${row.creatureType || 'unknown'}; size=${row.size || 'unknown'}`
            : (['item', 'spell', 'feature', 'species', 'background', 'class', 'subclass'].includes(kindKey)
                ? `type=${row.itemType || 'unknown'}; rarity=${row.rarity}; magical=${row.magical}`
                : 'document');
        const image = options.includeImages && row.img ? ` | img=${row.img}` : '';
        return `- ${row.name} | ${source} | ${details}${image}`;
    }).join('\n');
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
        return compendiumManager.getSelected('Item').join(', ');
    } catch (e) {
        postConsoleAndNotification(MODULE.NAME, 'Error getting item compendiums list', e, false, false);
        return 'No compendiums configured';
    }
}

export function getActorCompendiumsList() {
    try {
        return compendiumManager.getSelected('Actor').join(', ');
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

function resolveConfiguredPackIds(type, packIds) {
    if (Array.isArray(packIds)) {
        return packIds.filter((id) => id && id !== 'none');
    }
    return compendiumManager.getSelected(type);
}

/**
 * @param {string[]} [packIds] - optional subset of item-compendium pack ids; defaults to all configured
 * @param {(message: string) => void} [onProgress] - per-compendium status callback
 * @returns {Promise<string>}
 */
export async function getCompendiumItemsList(packIds, onProgress) {
    try {
        const compendiumIds = resolveConfiguredPackIds('Item', packIds);
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
        const compendiumIds = resolveConfiguredPackIds('Actor', packIds);
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
