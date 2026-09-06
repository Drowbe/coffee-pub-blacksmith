#!/usr/bin/env node
/**
 * Guard the equip-location classifier's invariants.
 *
 *   node tools/check-equip-locations.mjs
 *
 * Exits non-zero on a violation.
 *
 * WHY THIS EXISTS. Four things here are invisible to a reader and silent when
 * broken:
 *
 *   1. THE VOCABULARY ORDER. First match wins, so `face` before `head` is what
 *      keeps a mask off the head and `carried` last is what stops the word "kit"
 *      beating a garment. A reordering changes answers and looks like a tidy-up
 *      in review. This asserts the order, not just the contents.
 *
 *   2. EVERY PATTERN NAMES A REAL LOCATION. A typo in a location string yields a
 *      value no consumer's map has a case for, and it surfaces as an item that
 *      silently fails to place rather than as an error.
 *
 *   3. THE RESOLVER STILL REFUSES. The module's one rule is that an API which
 *      always returns a location recreates the bug it replaces. That is a
 *      property of behaviour, not of the table, so it is checked by running the
 *      real `resolve()` against real item shapes.
 *
 *   4. THE STRUCTURED TABLE MATCHES THE COMPENDIUM DATA IT WAS BUILT FROM. The
 *      weapon fixtures below are verbatim from the dnd5e 5.3.3 `items` and
 *      `equipment24` packs, which are byte-identical for every weapon here.
 *      Read twice, independently, before the table was written. Hand Crossbow is
 *      the one that matters: it is `amm,lgt,lod` with no `two`, and an earlier
 *      draft's "ranged means two-handed" rule would have reported it wrong.
 *
 * This imports the real modules rather than a copy, so it cannot pass against a
 * drifted duplicate. It runs in bare Node with no Foundry globals, which is also
 * a test in itself: anything that reaches for `game` or `ui` at import time
 * fails here loudly.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
function fail(message) { failures.push(message); }
function check(condition, message) { if (!condition) fail(message); }

// ==================================================================
// ===== FOUNDRY STUBS ==============================================
// ==================================================================
//
// `const.js` fetches module.json at import time and `api-core.js` reaches for
// Foundry globals. Neither exists in Node, so the two source files under test are
// loaded with a stubbed graph. CONFIG.DND5E carries only the registries tier 2
// reads, with the real 5.3.3 keys.

globalThis.CONFIG = {
    DND5E: {
        shieldIds: { shield: 'Compendium.dnd5e.equipment24.Item.phbarmShield0000' },
        armorIds: { breastplate: 'Compendium.dnd5e.equipment24.Item.phbarmBreastplat' },
        ammoIds: {
            arrow: 'Compendium.dnd5e.equipment24.Item.phbamoArrows0000',
            crossbowBolt: 'Compendium.dnd5e.equipment24.Item.phbamoBolts00000'
        }
    }
};

/**
 * Load the two modules with `const.js` and `api-core.js` stubbed.
 *
 * Node has no loader hook this small, so the modules are read and their two
 * infrastructure imports rewritten to data URLs before evaluation. The classifier
 * itself is untouched -- this rewrites imports, never logic.
 */
async function loadModules() {
    const fs = await import('node:fs/promises');
    const stubs = {
        './const.js': 'export const MODULE = { NAME: "BLACKSMITH", ID: "coffee-pub-blacksmith" };',
        './api-core.js': 'export function postConsoleAndNotification() {}'
    };
    const stubUrls = Object.fromEntries(
        Object.entries(stubs).map(([specifier, source]) => [
            specifier,
            `data:text/javascript,${encodeURIComponent(source)}`
        ])
    );

    // The two source files import each other, so both must be rewritten together and
    // the cycle preserved: the API's import of the vocabulary is left pointing at
    // the rewritten vocabulary, and vice versa.
    const files = ['api-equip-locations.js', 'utility-equip-vocabulary.js'];
    const sources = {};
    for (const file of files) {
        sources[file] = await fs.readFile(path.join(ROOT, 'scripts', file), 'utf8');
    }

    const rewritten = {};
    for (const file of files) {
        let source = sources[file];
        for (const [specifier, url] of Object.entries(stubUrls)) {
            source = source.replaceAll(`'${specifier}'`, `'${url}'`);
        }
        rewritten[file] = source;
    }

    // Write the rewritten pair beside the originals under a temp name so the
    // cycle resolves through the filesystem, then remove them.
    const tmpDir = path.join(ROOT, 'scripts', '.equip-check-tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    try {
        for (const file of files) {
            await fs.writeFile(path.join(tmpDir, file), rewritten[file], 'utf8');
        }
        const api = await import(pathToFileURL(path.join(tmpDir, 'api-equip-locations.js')).href);
        const vocab = await import(pathToFileURL(path.join(tmpDir, 'utility-equip-vocabulary.js')).href);
        return { api, vocab };
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
}

const { api, vocab } = await loadModules();
const { EquipLocationsAPI, LOCATIONS, GRIP, SOURCE } = api;

// ==================================================================
// ===== 1. THE TAXONOMY ============================================
// ==================================================================

const EXPECTED_LOCATIONS = [
    'head', 'face', 'neck', 'back', 'chest', 'arms', 'hands', 'waist', 'feet',
    'ring', 'held', 'ammunition', 'carried'
];

const actualLocations = Object.values(LOCATIONS);
check(
    actualLocations.length === EXPECTED_LOCATIONS.length
        && EXPECTED_LOCATIONS.every(value => actualLocations.includes(value)),
    `taxonomy changed: expected [${EXPECTED_LOCATIONS.join(', ')}], got [${actualLocations.join(', ')}]`
);

// `hand` was renamed to `held` because it sat one letter from `hands`, the body
// part, and a consumer writing the wrong one got silence rather than an error.
check(!actualLocations.includes('hand'), 'taxonomy has both `hand` and `hands`: the near-collision this rename removed');
check(Object.isFrozen(LOCATIONS), 'LOCATIONS is not frozen');

// ==================================================================
// ===== 2. THE VOCABULARY, IN ORDER ================================
// ==================================================================

const EXPECTED_ORDER = [
    'vocab:chest', 'vocab:face', 'vocab:head', 'vocab:neck', 'vocab:waist', 'vocab:feet',
    'vocab:hands', 'vocab:arms', 'vocab:back', 'vocab:ring', 'vocab:carried'
];

const order = vocab.builtIn().map(entry => entry.id);
check(
    order.length === EXPECTED_ORDER.length && order.every((id, i) => id === EXPECTED_ORDER[i]),
    `vocabulary ORDER changed (order is load-bearing):\n    expected ${EXPECTED_ORDER.join(' -> ')}\n    got      ${order.join(' -> ')}`
);

for (const entry of vocab.builtIn()) {
    check(actualLocations.includes(entry.location), `vocabulary "${entry.id}" names unknown location "${entry.location}"`);
    check(entry.pattern instanceof RegExp, `vocabulary "${entry.id}" has no RegExp pattern`);
}

// The three orderings that encode real defects, asserted as behaviour rather
// than as positions, so they survive an insertion between them.
const ORDER_CASES = [
    ['Mask of the Beast', LOCATIONS.FACE, 'face must precede head, or a mask lands on the head'],
    ['Belt Pouch', LOCATIONS.WAIST, 'waist must precede back, or a belt pouch becomes a backpack'],
    ['Cloak of the Healer\'s Kit', LOCATIONS.BACK, 'carried must be last, or "kit" beats a garment'],
    // `eyes` is in `face` for Eyes of the Eagle, so `chest` must come FIRST or a
    // Robe of Eyes -- a garment -- is worn on the face. The least intuitive
    // constraint in the table, and the reason chest leads a head-to-toe sequence.
    ['Robe of Eyes', LOCATIONS.CHEST, 'chest must precede face, or a Robe of Eyes lands on the face'],
    ['Eyes of the Eagle', LOCATIONS.FACE, '`eyes` must reach face, or eyewear goes unplaced']
];

// Items Squire found unplaceable when walking the SRD magic items. Each one is a
// gap the vocabulary had, and each is here so a future trim cannot silently
// reopen it -- these are common in play, not corner cases.
const REAL_ITEM_CASES = [
    ['Bag of Holding', LOCATIONS.CARRIED, 'bag names a container, not a location'],
    ['Bag of Tricks', LOCATIONS.CARRIED, 'bag names a container, not a location'],
    ['Robe of the Archmagi', LOCATIONS.CHEST, 'robe: no armour value, so nothing structured catches it'],
    ['Headband of Intellect', LOCATIONS.HEAD, 'headband'],
    ['Stone of Good Luck', LOCATIONS.CARRIED, 'stone'],
    ['Eversmoking Bottle', LOCATIONS.CARRIED, 'bottle'],
    ['Alchemy Jug', LOCATIONS.CARRIED, 'jug'],
    ['Chime of Opening', LOCATIONS.CARRIED, 'chime'],
    ['Driftglobe', null, 'one word, no boundary to match: unplaceable, and honestly so'],
    // `necklace` is in `neck` and precedes `carried`, so a Necklace of Prayer
    // Beads stays on the neck even though `bead` is in the carried list.
    ['Necklace of Prayer Beads', LOCATIONS.NECK, 'neck must beat `bead`']
];
for (const [name, expected, why] of REAL_ITEM_CASES) {
    const got = EquipLocationsAPI.resolve({ name, type: 'equipment', system: {} });
    check(got.location === expected, `"${name}" expected ${expected} (${why}), got ${got.location}`);
}
for (const [name, expected, why] of ORDER_CASES) {
    const got = EquipLocationsAPI.resolve({ name, type: 'equipment', system: {} });
    check(got.location === expected, `${why} -- "${name}" resolved to ${got.location}`);
}

// ==================================================================
// ===== 3. THE WEAPON DATA THE TABLE RESTS ON ======================
// ==================================================================
//
// Verbatim from dnd5e 5.3.3 `items` and `equipment24` (identical for all of
// these). `system.properties` is given as an ARRAY here, which is the pack
// shape; the Set shape is exercised separately below.

const WEAPONS = [
    { name: 'Dagger', subtype: 'simpleM', props: ['fin', 'lgt', 'thr'], grip: GRIP.OFF, hands: 1 },
    { name: 'Dart', subtype: 'simpleR', props: ['fin', 'thr'], grip: GRIP.MAIN, hands: 1 },
    { name: 'Greatsword', subtype: 'martialM', props: ['hvy', 'two'], grip: GRIP.BOTH, hands: 2 },
    { name: 'Hand Crossbow', subtype: 'martialR', props: ['amm', 'lgt', 'lod'], grip: GRIP.OFF, hands: 1 },
    { name: 'Heavy Crossbow', subtype: 'martialR', props: ['amm', 'hvy', 'lod', 'two'], grip: GRIP.BOTH, hands: 2 },
    { name: 'Javelin', subtype: 'simpleM', props: ['thr'], grip: GRIP.MAIN, hands: 1 },
    { name: 'Light Crossbow', subtype: 'simpleR', props: ['amm', 'lod', 'two'], grip: GRIP.BOTH, hands: 2 },
    { name: 'Longbow', subtype: 'martialR', props: ['amm', 'hvy', 'two'], grip: GRIP.BOTH, hands: 2 },
    { name: 'Longsword', subtype: 'martialM', props: ['ver'], grip: GRIP.EITHER, hands: 1, versatile: true },
    { name: 'Quarterstaff', subtype: 'simpleM', props: ['ver'], grip: GRIP.EITHER, hands: 1, versatile: true },
    { name: 'Shortbow', subtype: 'simpleR', props: ['amm', 'two'], grip: GRIP.BOTH, hands: 2 },
    { name: 'Sling', subtype: 'simpleR', props: ['amm'], grip: GRIP.MAIN, hands: 1 }
];

for (const weapon of WEAPONS) {
    const item = { name: weapon.name, type: 'weapon', system: { type: { value: weapon.subtype }, properties: weapon.props } };
    const got = EquipLocationsAPI.resolve(item);
    check(got.location === LOCATIONS.HELD, `${weapon.name}: expected held, got ${got.location}`);
    check(got.grip === weapon.grip, `${weapon.name}: expected grip ${weapon.grip}, got ${got.grip}`);
    check(got.hands === weapon.hands, `${weapon.name}: expected ${weapon.hands} hand(s), got ${got.hands}`);
    check(got.versatile === Boolean(weapon.versatile), `${weapon.name}: versatile should be ${Boolean(weapon.versatile)}, got ${got.versatile}`);
    check(got.source === SOURCE.STRUCTURED, `${weapon.name}: expected a structured answer, got ${got.source}`);
}

// The deleted "ranged means two-handed" rule would have failed exactly here.
const handCrossbow = EquipLocationsAPI.resolve({
    name: 'Hand Crossbow', type: 'weapon',
    system: { type: { value: 'martialR' }, properties: ['amm', 'lgt', 'lod'] }
});
check(handCrossbow.hands === 1, 'Hand Crossbow reported as two-handed: the deleted ranged rule is back');

// Containers: the type says an item HOLDS things, never where it sits on a body.
// A structured `container -> back` rule put a Fanny Pack of Holding between a
// character's shoulder blades, so the type has no structured rule at all and the
// name decides. These assert both halves of that split.
const CONTAINER_CASES = [
    ['Fanny Pack of Holding', 'container', LOCATIONS.CARRIED, 'a fanny pack is not worn on the back'],
    ['Belt Pouch', 'container', LOCATIONS.WAIST, 'waist still wins over a container word'],
    ['Backpack', 'container', LOCATIONS.BACK, 'backpack names the location in itself'],
    ['Handy Haversack', 'container', LOCATIONS.BACK, 'haversack names the location in itself'],
    ['Quiver', 'container', LOCATIONS.CARRIED, 'a quiver is worn at back or hip: not knowable'],
    ['Oaken Strongbox', 'container', null, 'a container the vocabulary cannot place stays unplaced']
];
for (const [name, type, expected, why] of CONTAINER_CASES) {
    const got = EquipLocationsAPI.resolve({ name, type, system: {} });
    check(got.location === expected, `"${name}" expected ${expected} (${why}), got ${got.location}`);
}

// `clothing` reports a KIND, not a location. These are the real typings from the
// classic `items` pack, where a `clothing -> chest` rule was wrong for five of
// seven and right for the two robes by luck. equipment24 types the same items
// `wondrous`, so this is pack-dependent -- which is itself a reason no structured
// rule can be built on the subtype. `armor.value: 0` is what these carry.
const CLOTHING_CASES = [
    ['Cloak of Protection', LOCATIONS.BACK],
    ['Cloak of Elvenkind', LOCATIONS.BACK],
    ['Cloak of Displacement', LOCATIONS.BACK],
    ['Boots of Speed', LOCATIONS.FEET],
    ['Hat of Disguise', LOCATIONS.HEAD],
    ['Robe of the Archmagi', LOCATIONS.CHEST],
    ['Robe of Eyes', LOCATIONS.CHEST]
];
for (const [name, expected] of CLOTHING_CASES) {
    for (const subtype of ['clothing', 'wondrous']) {
        const got = EquipLocationsAPI.resolve({ name, type: 'equipment', system: { type: { value: subtype }, armor: { value: 0 }, properties: [] } });
        check(got.location === expected, `"${name}" (${subtype}) expected ${expected}, got ${got.location}`);
    }
}

// ==================================================================
// ===== 4. THE PROPERTY SHAPE ======================================
// ==================================================================
//
// `system.properties` is an array in pack source and a Set on a prepared live
// document. A resolver reading only one shape works in every test and fails on
// the one path nobody tried.

const asArray = EquipLocationsAPI.resolve({ name: 'Greatsword', type: 'weapon', system: { type: { value: 'martialM' }, properties: ['hvy', 'two'] } });
const asSet = EquipLocationsAPI.resolve({ name: 'Greatsword', type: 'weapon', system: { type: { value: 'martialM' }, properties: new Set(['hvy', 'two']) } });
check(asArray.hands === 2, 'array-shaped properties not read');
check(asSet.hands === 2, 'Set-shaped properties not read (live documents carry a Set)');
check(asArray.grip === asSet.grip && asArray.hands === asSet.hands, 'array and Set shapes disagree');

// ==================================================================
// ===== 5. THE STRUCTURED ROWS THAT HAVE NO FALLBACK ===============
// ==================================================================

// A shield carries NO properties and is identified solely by its subtype. This
// row is the only thing that can catch it; nothing must "simplify" it away.
const shield = EquipLocationsAPI.resolve({ name: 'Shield', type: 'equipment', system: { type: { value: 'shield' }, armor: { value: 2 }, properties: [] } });
check(shield.location === LOCATIONS.HELD && shield.grip === GRIP.OFF, `Shield expected held/off, got ${shield.location}/${shield.grip}`);

// Shield must be checked before armour, because a shield also carries
// `system.armor.value`.
check(shield.matched === 'equipment:shield', `Shield matched "${shield.matched}": the armour row is winning`);

// Natural weapons must never be classified, or a character with claws reads as
// permanently drifted in a consumer's build check.
for (const subtype of ['natural', 'siege', 'improv']) {
    const got = EquipLocationsAPI.resolve({ name: 'Claws', type: 'weapon', system: { type: { value: subtype }, properties: [] } });
    check(got.location === 'none', `weapon subtype "${subtype}" must resolve to 'none', got ${got.location}`);
}

// ==================================================================
// ===== 6. THE ONE RULE: IT MUST STILL REFUSE ======================
// ==================================================================

const unknown = EquipLocationsAPI.resolve({ name: 'Iridescent Widget of Xanth', type: 'equipment', system: { type: { value: 'wondrous' }, properties: [] } });
check(unknown.location === null, `an unrecognised item must resolve to null, got "${unknown.location}"`);
check(unknown.source === null && unknown.matched === null, 'an unresolved answer must carry no source or match');

check(EquipLocationsAPI.resolve(null).location === null, 'null input must resolve to null');
check(EquipLocationsAPI.resolve(undefined).location === null, 'undefined input must resolve to null');
check(EquipLocationsAPI.resolve({}).location === null, 'an empty object must resolve to null');

// Three-valued: 'none' and null are different answers.
check(EquipLocationsAPI.isEquippable({ name: 'Potion of Healing', type: 'consumable', system: { type: { value: 'potion' } } }) === false, 'a potion must be false, not null');
check(EquipLocationsAPI.isEquippable({ name: 'Iridescent Widget of Xanth', type: 'equipment', system: {} }) === null, 'an unknown item must be null, not false');

// ==================================================================
// ===== 7. THE VOCABULARY IS NOT GATED BY ITEM TYPE ================
// ==================================================================
//
// Gating the last resort on `system.type.value` gates it on the very field whose
// unreliability creates the need for it.

const cloakAsLoot = EquipLocationsAPI.resolve({ name: 'Cloak of Protection', type: 'loot', system: { type: { value: 'gear' } } });
check(cloakAsLoot.location === LOCATIONS.BACK, `a Cloak of Protection typed loot must still reach the vocabulary, got "${cloakAsLoot.location}"`);
check(cloakAsLoot.source === SOURCE.VOCABULARY, `expected a vocabulary answer, got ${cloakAsLoot.source}`);
check(cloakAsLoot.confidence === 'low', 'a vocabulary answer must be low confidence, so a consumer can show it as a suggestion');

// A Ring of Fire Resistance is typed `trinket` in real content, not `ring`: a key
// existing in CONFIG is not the same as content using it.
const ringAsTrinket = EquipLocationsAPI.resolve({ name: 'Ring of Fire Resistance', type: 'equipment', system: { type: { value: 'trinket' } } });
check(ringAsTrinket.location === LOCATIONS.RING, `a ring typed trinket must still resolve to ring, got "${ringAsTrinket.location}"`);

// A wand reaches the vocabulary and is carried, not held. The deleted rod/wand
// structured row would have taken it with no grip at all.
const wand = EquipLocationsAPI.resolve({ name: 'Wand of Magic Missiles', type: 'equipment', system: { type: { value: 'wand' }, properties: ['foc', 'mgc'] } });
check(wand.location === LOCATIONS.CARRIED, `a wand must resolve to carried, got "${wand.location}"`);
check(wand.grip === null, 'a carried item must carry no grip');

// ==================================================================
// ===== 8. TIER 2, AND GRIP DISCIPLINE =============================
// ==================================================================

const bolts = EquipLocationsAPI.resolve({ name: 'Mystery Bolts', type: 'loot', system: { type: { baseItem: 'crossbowBolt' } } });
check(bolts.location === LOCATIONS.AMMUNITION, `baseItem ammunition must resolve to ammunition, got "${bolts.location}"`);
check(bolts.source === SOURCE.BASE_ITEM, `expected a baseItem answer, got ${bolts.source}`);

// grip and hands are meaningful only for `held`, and must be null elsewhere or a
// consumer's map has to guess which fields to trust.
const NON_HELD_SAMPLES = [
    { name: 'Arrows', type: 'consumable', system: { type: { value: 'ammo' } } },
    { name: 'Breastplate', type: 'equipment', system: { type: { value: 'medium' }, armor: { value: 14 } } },
    { name: 'Thieves\' Tools', type: 'tool', system: {} }
];
for (const item of NON_HELD_SAMPLES) {
    const got = EquipLocationsAPI.resolve(item);
    check(got.location !== LOCATIONS.HELD, `${item.name} unexpectedly resolved to held`);
    check(got.grip === null && got.hands === null, `${item.name}: grip and hands must be null unless the location is held`);
}

// Every held answer must carry a grip, or a consumer cannot place it. This is
// what the deleted rod/wand row violated.
for (const weapon of WEAPONS) {
    const got = EquipLocationsAPI.resolve({ name: weapon.name, type: 'weapon', system: { type: { value: weapon.subtype }, properties: weapon.props } });
    check(got.grip !== null && got.hands !== null, `${weapon.name}: a held answer must carry both grip and hands`);
}

// ==================================================================
// ===== 9. REGISTRATION ============================================
// ==================================================================

EquipLocationsAPI.resetVocabulary();
const baseline = EquipLocationsAPI.getVocabulary().length;

check(EquipLocationsAPI.registerVocabulary({ id: 'test:circlet', location: LOCATIONS.HEAD, pattern: /\bwidget\b/i, position: 0 }), 'a valid registration was refused');
check(EquipLocationsAPI.getVocabulary()[0].id === 'test:circlet', 'position was ignored: appending to an ordered list is not extending it');
check(EquipLocationsAPI.resolve({ name: 'Iridescent Widget of Xanth', type: 'equipment', system: {} }).location === LOCATIONS.HEAD, 'a registered pattern did not take effect');

check(!EquipLocationsAPI.registerVocabulary({ id: 'test:bad', location: 'elbow', pattern: /x/ }), 'a registration naming an unknown location was accepted');

// An unknown key is REFUSED, not ignored. `index` for `position` would otherwise
// register successfully with the position silently dropped, and a pattern
// appended after vocab:carried never fires -- accepted, and does nothing.
check(!EquipLocationsAPI.registerVocabulary({ id: 'test:typo', location: LOCATIONS.HEAD, pattern: /x/, index: 0 }), 'an unknown key (`index` for `position`) was ignored rather than refused');
check(!EquipLocationsAPI.getVocabulary().some(e => e.id === 'test:typo'), 'a refused registration was added anyway');
// Every permitted key must be one the code actually reads. A key allowed here
// that nothing consumes is the same silent miss one layer up.
for (const key of vocab.VOCABULARY_KEYS) {
    check(['id', 'location', 'pattern', 'position'].includes(key), `permitted key "${key}" is not consumed by register()`);
}
check(!EquipLocationsAPI.registerVocabulary({ id: 'test:circlet', location: LOCATIONS.HEAD, pattern: /x/ }), 'a duplicate id was accepted');
check(!EquipLocationsAPI.registerVocabulary({ id: 'test:nopattern', location: LOCATIONS.HEAD }), 'a registration with no pattern was accepted');
check(!EquipLocationsAPI.unregisterVocabulary('vocab:head'), 'a built-in pattern was unregistered');
check(EquipLocationsAPI.unregisterVocabulary('test:circlet'), 'a registered pattern could not be unregistered');

EquipLocationsAPI.resetVocabulary();
check(EquipLocationsAPI.getVocabulary().length === baseline, 'reset did not restore the built-in table');

// ==================================================================
// ===== REPORT =====================================================
// ==================================================================

if (failures.length) {
    console.error('check-equip-locations: FAILED\n');
    for (const message of failures) console.error(`  - ${message}`);
    console.error(`\n${failures.length} violation(s).`);
    process.exit(1);
}

console.log(`check-equip-locations: OK (${actualLocations.length} locations, ${vocab.builtIn().length} vocabulary patterns, ${WEAPONS.length} weapons verified against dnd5e 5.3.3 pack data)`);
