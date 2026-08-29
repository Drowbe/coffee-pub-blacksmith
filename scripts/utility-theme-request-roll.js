import { MODULE } from './const.js';

const DEFAULT_REQUEST_ROLL_THEME_PATH = `modules/${MODULE.ID}/themes/request-roll/theme-requestroll.json`;
const REQUEST_ROLL_THEME_SETTING = 'requestRollThemeJson';

let _cachedPath = null;
let _cachedTheme = null;

function normalizePath(path) {
    const p = String(path ?? '').trim();
    return p || DEFAULT_REQUEST_ROLL_THEME_PATH;
}

function toFetchUrl(path) {
    const normalized = normalizePath(path).replace(/\\/g, '/');
    if (typeof foundry !== 'undefined' && foundry.utils?.getRoute) {
        return foundry.utils.getRoute(normalized);
    }
    return normalized;
}

function getThemePath() {
    try {
        const configuredPath = game?.settings?.get?.(MODULE.ID, REQUEST_ROLL_THEME_SETTING);
        if (String(configuredPath ?? '').trim()) {
            return normalizePath(configuredPath);
        }
    } catch {
        return DEFAULT_REQUEST_ROLL_THEME_PATH;
    }

    return DEFAULT_REQUEST_ROLL_THEME_PATH;
}

async function loadThemeJson() {
    const path = getThemePath();
    if (_cachedTheme && _cachedPath === path) return _cachedTheme;

    const res = await fetch(toFetchUrl(path));
    if (!res.ok) {
        throw new Error(`Failed to load Request Roll theme (${res.status})`);
    }

    const json = await res.json();
    _cachedPath = path;
    _cachedTheme = json && typeof json === 'object' ? json : {};
    return _cachedTheme;
}

function findByConstantname(records, constantname) {
    return Array.isArray(records)
        ? records.find((entry) => entry?.constantname === constantname)
        : null;
}

function findById(records, id) {
    return Array.isArray(records)
        ? records.find((entry) => entry?.id === id)
        : null;
}

export function invalidateRequestRollThemeCache() {
    _cachedPath = null;
    _cachedTheme = null;
}

export async function getRequestRollThemeJson() {
    return await loadThemeJson();
}

export async function resolveRequestRollSound(constantname) {
    try {
        const json = await loadThemeJson();
        const rec = findByConstantname(json?.sounds, constantname) ?? findById(json?.sounds, constantname);
        return rec?.path || '';
    } catch {
        return '';
    }
}

export async function resolveRequestRollCinematicBanner(constantname) {
    try {
        const json = await loadThemeJson();
        const rec = findByConstantname(json?.cinematicBanners, constantname)
            ?? findById(json?.cinematicBanners, constantname);
        return rec?.path || '';
    } catch {
        return '';
    }
}

/**
 * A theme SETTING -- a plain value rather than an asset path.
 *
 * The two resolvers above answer "which file?", and both read `path`. This answers
 * "which of these?", so it reads `value` and the entry carries no path at all. Kept as
 * its own section rather than squeezed into `cinematicBanners` with an empty path,
 * because a reader scanning that list is entitled to assume everything in it is an
 * image, and a settings entry hiding among them is the kind of thing that survives
 * exactly until someone writes a loop over it.
 *
 * Returns '' when the theme names nothing, so the caller keeps its own default rather
 * than being handed a value the theme never chose.
 *
 * @param {string} constantname
 * @returns {Promise<string>}
 */
export async function resolveRequestRollSetting(constantname) {
    try {
        const json = await loadThemeJson();
        const rec = findByConstantname(json?.settings, constantname)
            ?? findById(json?.settings, constantname);
        return String(rec?.value ?? '').trim();
    } catch {
        return '';
    }
}
