/**
 * Merge bundled asset data with optional per-category JSON paths (Asset Mapping settings).
 * See documentation/plan-assets.md — bundled default, then replace category when a path is set.
 */

import * as bundledAssetExports from '../resources/assets.js';
import { MODULE } from './const.js';
import { initializeAssetLookupInstance } from './asset-lookup.js';

function cloneDeep(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

/**
 * @param {string} path - Foundry-relative path (e.g. modules/.../file.json)
 * @returns {string|null}
 */
function pathToFetchUrl(path) {
    let p = (path ?? '').trim();
    if (!p) return null;
    p = p.replace(/\\/g, '/');
    if (typeof foundry !== 'undefined' && foundry.utils?.getRoute) {
        return foundry.utils.getRoute(p);
    }
    return p;
}

/**
 * @param {string} path
 * @returns {Promise<object|null>}
 */
async function fetchJsonFromPath(path) {
    const url = pathToFetchUrl(path);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

/**
 * Replace one category array when JSON is valid; otherwise keep base.
 * @param {object} baseFragment - e.g. { themes: [...] }
 * @param {object|null} json - parsed JSON root
 * @param {string} arrayKey - themes | images | icons | ...
 * @param {string} label - for logging
 */
function applyCategoryOverride(baseFragment, json, arrayKey, label) {
    if (!json || typeof json !== 'object') return baseFragment;
    const arr = json[arrayKey];
    if (!Array.isArray(arr)) {
        console.warn(`${MODULE.TITLE} | Asset loader: "${label}" JSON missing a "${arrayKey}" array; keeping bundled data.`);
        return baseFragment;
    }
    return { ...baseFragment, [arrayKey]: arr };
}

/**
 * @param {object} baseBundles - `import * as bundles from '../resources/assets.js'`
 * @returns {Promise<object>} Merged bundles for AssetLookup
 */
export async function loadAssetBundlesWithOverrides(baseBundles = bundledAssetExports) {
    const out = {
        dataBackgroundImages: cloneDeep(baseBundles.dataBackgroundImages),
        dataIcons: cloneDeep(baseBundles.dataIcons),
        dataNameplate: cloneDeep(baseBundles.dataNameplate),
        dataSounds: cloneDeep(baseBundles.dataSounds),
        dataVolume: cloneDeep(baseBundles.dataVolume),
        dataBanners: cloneDeep(baseBundles.dataBanners),
        dataBackgrounds: cloneDeep(baseBundles.dataBackgrounds),
        MVPTemplates: cloneDeep(baseBundles.MVPTemplates)
    };

    if (typeof game === 'undefined' || !game?.settings?.get) {
        return out;
    }

    const jobs = [
        ['assetMapBackgroundImagesJson', 'dataBackgroundImages', 'images'],
        ['assetMapIconsJson', 'dataIcons', 'icons'],
        ['assetMapNameplatesJson', 'dataNameplate', 'names'],
        ['assetMapSoundsJson', 'dataSounds', 'sounds'],
        ['assetMapVolumesJson', 'dataVolume', 'volumes'],
        ['assetMapBannersJson', 'dataBanners', 'banners'],
        ['assetMapBackgroundsJson', 'dataBackgrounds', 'backgrounds']
    ];

    for (const [settingKey, exportKey, arrayKey] of jobs) {
        let path = '';
        try {
            path = game.settings.get(MODULE.ID, settingKey) ?? '';
        } catch {
            continue;
        }
        if (!String(path).trim()) continue;

        try {
            const json = await fetchJsonFromPath(path);
            out[exportKey] = applyCategoryOverride(out[exportKey], json, arrayKey, settingKey);
        } catch (e) {
            console.warn(`${MODULE.TITLE} | Asset loader: could not load ${settingKey} (${path})`, e);
            try {
                ui?.notifications?.warn?.(`${MODULE.TITLE}: Could not load Asset Mapping file for ${settingKey}. Using bundled default for that category.`);
            } catch { /* ignore */ }
        }
    }

    return out;
}

/**
 * Re-fetch merged bundles from world settings, rebuild AssetLookup and BLACKSMITH choice caches.
 * Used after Asset Mapping paths change (onChange) or for future dev hooks.
 */
export async function reloadAssetManifestsFromWorldSettings() {
    const merged = await loadAssetBundlesWithOverrides(bundledAssetExports);
    initializeAssetLookupInstance(merged);
    const { refreshAssetDerivedChoices } = await import('./settings.js');
    refreshAssetDerivedChoices();
}
