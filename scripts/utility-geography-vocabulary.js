// ==================================================================
// ===== GEOGRAPHY VOCABULARY (PURE) ================================
// ==================================================================
//
// The vocabulary and its normalisers, with NO dependency on const.js,
// settings, or a running world. Frozen literals plus two functions that
// touch nothing but HABITAT_KEYS.
//
// It is a separate file for one reason: the importer's declaration files,
// validation and template derivation are deliberately Foundry-free so they
// can be asserted headlessly outside a running world
// (see architecture-importer.md). `const.js` fetches module.json at import
// time, so anything importing it drags a live world in with it -- a static
// geography import from a declaration would take that property away from
// the whole layer.
//
// manager-geography.js re-exports everything here, so no consumer needs to
// know which of the two files a name came from.
// ==================================================================

/**
 * The canonical habitat vocabulary.
 *
 * A CLOSED constant, deliberately, not a registry. It matches every consumer
 * that exists, and it is the safe direction on an API: a constant can become a
 * pre-populated registry later without breaking anyone, where a registry cannot
 * be narrowed back to a constant. It also means an habitat value can never
 * be unknown, which retires the question of what a consumer should do with one.
 *
 * `key` is what is stored and joined on; `label` is what a person reads. They
 * are separate because at least one consumer uses the stored value as both a
 * round-trip key and the visible button text, and a value that is simultaneously
 * identity and label cannot be made human-readable without breaking the round trip.
 *
 * Keys are lowercase. Consumers normalise case at their own boundary rather than
 * trusting the stored form -- a value written before this vocabulary existed, or
 * by a hand-edited flag, is otherwise a silent join failure.
 */
export const HABITATS = Object.freeze([
    { key: 'mountain', label: 'Mountain' },
    { key: 'arctic', label: 'Arctic' },
    { key: 'planar', label: 'Planar' },
    { key: 'coastal', label: 'Coastal' },
    { key: 'swamp', label: 'Swamp' },
    { key: 'desert', label: 'Desert' },
    { key: 'underdark', label: 'Underdark' },
    { key: 'forest', label: 'Forest' },
    { key: 'underwater', label: 'Underwater' },
    { key: 'grassland', label: 'Grassland' },
    { key: 'urban', label: 'Urban' },
    { key: 'hill', label: 'Hill' }
]);

/** Just the keys, for membership checks. */
export const HABITAT_KEYS = Object.freeze(HABITATS.map(e => e.key));

/** The four geography fields, in breadcrumb order, with their seed settings. */
export const GEOGRAPHY_FIELDS = Object.freeze([
    { key: 'realm', setting: 'defaultCampaignRealm', label: 'Realm' },
    { key: 'region', setting: 'defaultCampaignRegion', label: 'Region' },
    { key: 'site', setting: 'defaultCampaignSite', label: 'Site' },
    { key: 'area', setting: 'defaultCampaignArea', label: 'Area' }
]);

export const GEOGRAPHY_FIELD_LIST = GEOGRAPHY_FIELDS;

// ==================================================================
// ===== NORMALISATION ==============================================
// ==================================================================

/**
 * Normalise one habitat value to a canonical key, or null.
 * Accepts any case so a value stored before this vocabulary existed still resolves.
 */
export function normalizeHabitat(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    return HABITAT_KEYS.includes(key) ? key : null;
}

/**
 * Normalise a stored habitat array.
 *
 * Filters against the VOCABULARY, never against truthiness, and that is the whole
 * point of the function. Several checkboxes sharing one name submit one entry per
 * box, `null` for each unticked one, so the raw value from a form is typically
 * `[null, null, 'forest', null, ...]`. `String(null)` is `"null"`, which is truthy,
 * so the obvious `.map(String).filter(Boolean)` turns those nulls into the literal
 * string "null" once per box -- data that looks populated and matches nothing.
 */
export function normalizeHabitats(value) {
    // The string branch is DEFENSIVE, not a shape any writer produces. Artificer confirmed
    // 2026-08-31 that the only producer is a twelve-box checkbox group, which always yields a
    // RadioNodeList and therefore an array. It stays for hand-edited flags and future writers,
    // and is deliberately not documented as a supported input.
    const raw = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
    const seen = new Set();
    for (const entry of raw) {
        const key = normalizeHabitat(entry);
        if (key) seen.add(key);
    }
    // Emitted in vocabulary order rather than the order they were ticked, so the
    // stored value is stable and two scenes with the same habitats compare equal.
    return HABITAT_KEYS.filter(key => seen.has(key));
}
