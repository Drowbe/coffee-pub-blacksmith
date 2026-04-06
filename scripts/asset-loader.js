/**
 * Asset data: defaults load from shipped JSON under resources/asset-defaults/ (runtime fetch only;
 * no Node/build step). Optional per-category overrides via Asset Mapping settings.
 * See documentation/plan-assets.md.
 */

import { MODULE } from './const.js';
import { initializeAssetLookupInstance } from './asset-lookup.js';

function cloneDeep(obj) {
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

/**
 * @param {object} json - Parsed JSON root (may include manifestVersion)
 * @returns {object} Clone without manifestVersion
 */
function stripManifestVersion(json) {
    if (!json || typeof json !== 'object') return json;
    const out = { ...json };
    delete out.manifestVersion;
    return out;
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

const DEFAULT_JSON_BASE = () => `modules/${MODULE.ID}/resources/asset-defaults`;

/**
 * Load all default category JSON files from the module (HTTP). Sole source for default bundles at init.
 * @returns {Promise<object>}
 */
export async function loadDefaultAssetBundlesFromJson() {
    const base = DEFAULT_JSON_BASE();
    const jobs = [
        ['assets-background-images.json', 'dataBackgroundImages', 'images'],
        ['assets-icons.json', 'dataIcons', 'icons'],
        ['assets-nameplates.json', 'dataNameplate', 'names'],
        ['assets-sounds.json', 'dataSounds', 'sounds'],
        ['assets-volumes.json', 'dataVolume', 'volumes'],
        ['assets-banners.json', 'dataBanners', 'banners'],
        ['assets-backgrounds.json', 'dataBackgrounds', 'backgrounds']
    ];

    const out = {
        dataBackgroundImages: { images: [] },
        dataIcons: { icons: [] },
        dataNameplate: { names: [] },
        dataSounds: { sounds: [] },
        dataVolume: { volumes: [] },
        dataBanners: { banners: [] },
        dataBackgrounds: { backgrounds: [] },
        MVPTemplates: {}
    };

    await Promise.all(
        jobs.map(async ([file, exportKey, arrayKey]) => {
            const json = await fetchJsonFromPath(`${base}/${file}`);
            const cleaned = stripManifestVersion(json);
            if (cleaned && Array.isArray(cleaned[arrayKey])) {
                out[exportKey] = { [arrayKey]: cleaned[arrayKey] };
            }
        })
    );

    try {
        const mvp = await fetchJsonFromPath(`${base}/assets-mvp-templates.json`);
        const cleaned = stripManifestVersion(mvp);
        if (cleaned && typeof cleaned === 'object') {
            out.MVPTemplates = cleaned;
        }
    } catch (e) {
        console.warn(`${MODULE.TITLE} | Asset loader: could not load MVP templates JSON`, e);
    }

    return out;
}

/**
 * Merge: base bundles (clone), then per-setting path overrides (fetch).
 * @param {object} baseBundles - Object with dataBackgroundImages, dataIcons, …, MVPTemplates (see loadDefaultAssetBundlesFromJson)
 * @returns {Promise<object>} Merged bundles for AssetLookup
 */
export async function loadAssetBundlesWithOverrides(baseBundles) {
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
 */
export async function reloadAssetManifestsFromWorldSettings() {
    const baseBundles = await loadDefaultAssetBundlesFromJson();
    const merged = await loadAssetBundlesWithOverrides(baseBundles);
    initializeAssetLookupInstance(merged);
    const { refreshAssetDerivedChoices } = await import('./settings.js');
    refreshAssetDerivedChoices();
}
