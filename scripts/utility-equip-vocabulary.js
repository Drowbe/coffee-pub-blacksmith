// ==================================================================
// ===== UTILITY-EQUIP-VOCABULARY.JS ================================
// ==================================================================
//
// The ordered name-pattern table behind `api.equipLocations`, and the
// registration point a world or a module extends it through.
//
// THE ORDER IS LOAD-BEARING. First match wins, so these are not a set:
//   - `face` before `head`, or "mask" lands on the head.
//   - `waist` before `back`, or a "belt pouch" becomes a backpack.
//   - `carried` last, or a garment loses to the word "kit" in the same name.
// A reordering is invisible in review and silently changes answers, which
// is why `tools/check-equip-locations.mjs` asserts the order and not just
// the contents.
//
// A WORD THAT NAMES A CONTAINER IS NOT A WORD THAT NAMES A LOCATION.
// `backpack`, `haversack`, `knapsack` and `rucksack` say "back" in
// themselves. `pack`, `bag`, `sack`, `satchel` and `quiver` say only
// "something portable", so they resolve to `carried` -- where on the
// body is not knowable from them. Bare `pack` was in the back list once
// and put a Fanny Pack of Holding between someone's shoulder blades.
//
// This table is the LAST RESORT and is reached by anything that fell
// through the structured tier, with no gate on item type. Gating it by
// `system.type.value` would gate it on the very field whose unreliability
// creates the need for it: a Cloak of Protection typed `loot` matches no
// structured rule, and refusing to read the word "cloak" sitting in its
// name returns null for no reason.
//
// Contributed by Squire, which had carried this table in its character
// build tool. Taken whole rather than rewritten, because the ordering
// encodes cases that were found by playing rather than by reasoning.
//
// THE TABLE IS BUILT LAZILY, and that is not a style choice. This FILE
// and `api-equip-locations.js` import each other -- the API needs the
// matcher, the table needs the taxonomy -- so building the table at
// file-evaluation time throws a temporal-dead-zone ReferenceError on
// `LOCATIONS` whenever the API file is evaluated first. Deferring to
// first use means both files are fully evaluated by the time any entry
// is read, which keeps one source of truth for the taxonomy instead of
// a second copy of the strings here.
//
// (Both files are Blacksmith's own, in `scripts/`. Nothing here crosses
// a Foundry module boundary: a sibling reaches this only at runtime,
// through `api.equipLocations`.)
//
// See documentation/architecture/architecture-equiplocations.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { LOCATIONS } from './api-equip-locations.js';

/**
 * The built-in patterns, in resolution order.
 *
 * Each entry is `{ id, location, pattern }`. `id` is what `resolve()` reports
 * back as `matched`, so a consumer answering "why did it pick that" names a
 * rule rather than printing a regular expression at a user.
 */
function builtIn() {
    return [
        // CHEST IS FIRST, and only because of `eyes` below. A Robe of Eyes is a
        // garment, not eyewear, and `face` would otherwise take it. This is the
        // one ordering constraint that is not intuitive from the sequence alone,
        // so it is asserted behaviourally in the check tool as well as by order.
        { id: 'vocab:chest', location: LOCATIONS.CHEST, pattern: /\b(robe|vestment|tunic|jerkin|tabard|surcoat)\b/i },
        { id: 'vocab:face', location: LOCATIONS.FACE, pattern: /\b(mask|goggles?|spectacles?|lenses?|eyepatch|veil|visor|monocle|eyes)\b/i },
        { id: 'vocab:head', location: LOCATIONS.HEAD, pattern: /\b(helm|helmet|hat|cap|crown|circlet|coif|hood|diadem|tiara|headband|mitre)\b/i },
        { id: 'vocab:neck', location: LOCATIONS.NECK, pattern: /\b(amulet|necklace|periapt|pendant|torc|collar|medallion|scarab|brooch|holy symbol|talisman)\b/i },
        { id: 'vocab:waist', location: LOCATIONS.WAIST, pattern: /\b(belt|girdle|sash|baldric)\b/i },
        { id: 'vocab:feet', location: LOCATIONS.FEET, pattern: /\b(boots?|shoes?|sandals?|greaves?|slippers?)\b/i },
        { id: 'vocab:hands', location: LOCATIONS.HANDS, pattern: /\b(gloves?|gauntlets?|mitts?|handwraps?)\b/i },
        { id: 'vocab:arms', location: LOCATIONS.ARMS, pattern: /\b(bracers?|vambraces?|armbands?|sleeves?)\b/i },
        // `back` holds words that name a BODY LOCATION. A backpack, haversack,
        // knapsack and rucksack are worn on the back by definition; a cloak is a
        // garment. Words that merely name a portable CONTAINER are in `carried`
        // below -- see the note at the top of this file.
        { id: 'vocab:back', location: LOCATIONS.BACK, pattern: /\b(cloak|cape|mantle|backpack|haversack|knapsack|rucksack|wings?)\b/i },
        { id: 'vocab:ring', location: LOCATIONS.RING, pattern: /\bring\b/i },
        { id: 'vocab:carried', location: LOCATIONS.CARRIED, pattern: /\b(pouch|pack|bag|sack|satchel|quiver|horn|pipes?|lantern|torch|flask|totem|idol|figurine|focus|wand|rod|staff|instrument|kit|tools?|deck|orb|stone|bottle|jug|chime|globe|crystal|bead|mirror|censer|bowl)\b/i }
    ];
}

/** Built-in ids, for refusing to unregister one. Cheap enough to rebuild. */
function builtInIds() {
    return new Set(builtIn().map(entry => entry.id));
}

/**
 * Every key `register()` accepts. Anything else is refused rather than ignored.
 * Each one is read by `register()` or returned by `getVocabulary()`; a key
 * permitted here that nothing consumes is the same silent miss one layer up.
 */
const VOCABULARY_KEYS = Object.freeze(['id', 'location', 'pattern', 'position']);

/** The live table. Null until first use -- see the lazy-build note above. */
let _vocabulary = null;

/** The live table, built on first use. */
function table() {
    if (_vocabulary === null) _vocabulary = builtIn();
    return _vocabulary;
}

/**
 * The ordered vocabulary, as a read-only view.
 *
 * Exposed because "why did it pick that" is the question a build tool's author
 * fields most often, and answering it needs the order as much as the patterns.
 *
 * @returns {ReadonlyArray<{id: string, location: string, pattern: RegExp}>}
 */
export function getVocabulary() {
    return Object.freeze(table().map(entry => Object.freeze({ ...entry })));
}

/**
 * Add a pattern to the vocabulary.
 *
 * Position is a parameter and not a convenience: appending to an ordered list is
 * not the same as extending it. A homebrew "Circlet of Blasting" pattern appended
 * after `carried` never fires, because something earlier already matched.
 *
 * @param {object} entry
 * @param {string} entry.id            Reported as `matched`. Namespace it with your module id.
 * @param {string} entry.location      One of `LOCATIONS`, or `'none'`.
 * @param {RegExp} entry.pattern       Tested against the item name.
 * @param {number} [entry.position]    Index to splice at. Omitted appends to the end.
 * @returns {boolean} Whether it was registered.
 */
export function register(entry = {}) {
    // Reject an unknown key rather than ignoring it. A consumer writing `index`
    // for `position` would otherwise register successfully with the position
    // silently dropped -- and a pattern appended after `vocab:carried` never
    // fires, so the registration looks accepted and does nothing. Pattern
    // borrowed from `registry-declarations.js`, where a renamed key
    // (`containerNameFormat` to `containerNameTransform`) was registered against
    // its old spelling, nothing threw, and container names went untransformed.
    const unknown = Object.keys(entry).filter(key => !VOCABULARY_KEYS.includes(key));
    if (unknown.length) {
        postConsoleAndNotification(MODULE.NAME, `equipLocations: vocabulary entry has unknown key(s): ${unknown.join(', ')}. Permitted: ${VOCABULARY_KEYS.join(', ')}`, '', false, false);
        return false;
    }

    const { id, location, pattern, position } = entry;
    if (!id || typeof id !== 'string') {
        postConsoleAndNotification(MODULE.NAME, 'equipLocations: vocabulary entry needs a string id', '', false, false);
        return false;
    }
    if (!(pattern instanceof RegExp)) {
        postConsoleAndNotification(MODULE.NAME, `equipLocations: vocabulary "${id}" needs a RegExp pattern`, '', false, false);
        return false;
    }
    if (!isKnownLocation(location)) {
        postConsoleAndNotification(MODULE.NAME, `equipLocations: vocabulary "${id}" names an unknown location "${location}"`, '', false, false);
        return false;
    }
    const current = table();
    if (current.some(entry => entry.id === id)) {
        postConsoleAndNotification(MODULE.NAME, `equipLocations: vocabulary "${id}" is already registered`, '', false, false);
        return false;
    }

    const record = { id, location, pattern };
    if (Number.isInteger(position) && position >= 0 && position < current.length) {
        current.splice(position, 0, record);
    } else {
        current.push(record);
    }
    return true;
}

/**
 * Remove a registered pattern by id. Built-ins cannot be removed -- a consumer
 * that dislikes one registers a narrower pattern ahead of it instead, which keeps
 * the built-in table the same for every other consumer in the world.
 *
 * @param {string} id
 * @returns {boolean} Whether anything was removed.
 */
export function unregister(id) {
    if (builtInIds().has(id)) {
        postConsoleAndNotification(MODULE.NAME, `equipLocations: "${id}" is built in and cannot be unregistered`, '', false, false);
        return false;
    }
    const current = table();
    const before = current.length;
    _vocabulary = current.filter(entry => entry.id !== id);
    return _vocabulary.length !== before;
}

/**
 * Restore the built-in table. Exists for the check tool and for tests; a
 * consumer has no reason to discard another module's registrations.
 */
export function reset() {
    _vocabulary = builtIn();
}

/**
 * Match a name against the ordered table.
 *
 * @param {string} name
 * @returns {{location: string, id: string}|null} First match, or null.
 */
export function matchName(name) {
    if (!name || typeof name !== 'string') return null;
    for (const entry of table()) {
        if (entry.pattern.test(name)) return { location: entry.location, id: entry.id };
    }
    return null;
}

/**
 * Whether a string is a location this API can return. Kept here rather than
 * called back into the API module, which would deepen the cycle described above.
 */
function isKnownLocation(value) {
    return value === 'none' || Object.values(LOCATIONS).includes(value);
}

export { builtIn, VOCABULARY_KEYS };
