// ==================================================================
// ===== API-EQUIP-LOCATIONS.JS =====================================
// ==================================================================
//
// Where on a character does this item go? dnd5e has no answer: there is
// no body-slot concept anywhere in the system, so every module that
// places an item on a character would otherwise grow its own guesser.
//
// This answers with a generic LOCATION. It does not know about slots.
// A consumer's slots are its own -- Squire's layout has `sheath`,
// `hip1/hip2` and `bothhands`, which are doll positions in one window,
// and a shared API returning them would hand every other module that
// window's opinions.
//
// THE ONE RULE: an API that always returns a location recreates the bug
// it replaces. When nothing can justify an answer this returns null and
// says so. Twenty items imported with eight unplaced beats arrows
// confidently placed on a character's head.
//
// Stateless and synchronous by construction. No persistence, no world
// state, no await -- a consumer classifies a whole inventory inside a
// flag write, where an await per item is visibly slow. Occupancy (what
// is actually in a slot) is the consumer's; `system.equipped` is already
// the truth and a second source of it would be a defect.
//
// Designed with the Squire session that owns the character build tool.
// The taxonomy, the vocabulary and every structured rule came from that
// work, verified against the dnd5e 5.3.3 compendiums.
//
// See documentation/api/api-equiplocations.md and
// documentation/architecture/architecture-equiplocations.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { matchName, getVocabulary, register, unregister, reset } from './utility-equip-vocabulary.js';

// ==================================================================
// ===== THE TAXONOMY ===============================================
// ==================================================================

/**
 * The thirteen locations. Canon for the suite: adding one later is cheap,
 * removing one is not.
 *
 * `HELD` is deliberately not `hand`. It sat one letter from `HANDS` -- the
 * body part -- and both are plausible for a gauntlet, which is worn on the
 * hands and used with them. A consumer writing `'hand'` when it meant gloves
 * would get silence rather than an error, and the defect surfaces as a
 * gauntlet in a weapon slot: the exact bug this module exists to prevent,
 * reintroduced by its own vocabulary. `HELD` is also right about a torch,
 * which is carried in a hand rather than worn on one.
 */
export const LOCATIONS = Object.freeze({
    HEAD: 'head',
    FACE: 'face',
    NECK: 'neck',
    BACK: 'back',
    CHEST: 'chest',
    ARMS: 'arms',
    HANDS: 'hands',
    WAIST: 'waist',
    FEET: 'feet',
    RING: 'ring',
    HELD: 'held',
    AMMUNITION: 'ammunition',
    CARRIED: 'carried'
});

/**
 * How a held item is wielded. Main hand, off hand and two-handed are 5e rules
 * concepts -- offhand attacks, the `two` property -- rather than UI positions,
 * which is why they belong here and a doll slot does not.
 *
 * `EITHER` is the versatile case. It carries no claim about occupancy: whether
 * a longsword is actually wielded in two hands depends on what is in the other
 * hand, and that is the consumer's to decide.
 */
export const GRIP = Object.freeze({
    MAIN: 'main',
    OFF: 'off',
    BOTH: 'both',
    EITHER: 'either'
});

/**
 * Which tier produced the answer. A consumer renders a `VOCABULARY` hit as an
 * unconfirmed suggestion and a `STRUCTURED` hit as placed -- the difference
 * between "we think this is a helm" and "dnd5e says this is armour". That is
 * what makes a bad guess visible instead of silently authoritative.
 */
export const SOURCE = Object.freeze({
    STRUCTURED: 'structured',
    BASE_ITEM: 'baseItem',
    VOCABULARY: 'vocabulary'
});

/** Deliberately not body equipment -- a potion, a vehicle, a natural weapon. */
const NOT_EQUIPMENT = 'none';

// ==================================================================
// ===== READING THE ITEM ===========================================
// ==================================================================

/**
 * Whether an item carries a dnd5e property.
 *
 * `system.properties` is an ARRAY in pack source and a Set on a prepared live
 * document. A resolver calling only `.has()` breaks on compendium data; one
 * calling only `.includes()` breaks on anything from `actor.items`. Both shapes
 * are met in normal use -- pack data when importing from a compendium, live
 * documents when reading an actor -- so both are handled here, once.
 *
 * This is the kind of defect that passes every test and fails on the one path
 * nobody tried. Found by Squire while reading the compendiums directly.
 */
function hasProperty(item, key) {
    const props = item?.system?.properties;
    return props?.has?.(key) ?? (Array.isArray(props) && props.includes(key));
}

/** The item's subtype: `system.type.value`. Absent far more often than expected. */
function subtypeOf(item) {
    const value = item?.system?.type?.value;
    return typeof value === 'string' ? value : null;
}

/** The item's base item id: `system.type.baseItem`. */
function baseItemOf(item) {
    const value = item?.system?.type?.baseItem;
    return typeof value === 'string' && value ? value : null;
}

/** Build a result. `grip`, `hands` and `versatile` are meaningful only for HELD. */
function result(location, { grip = null, hands = null, versatile = false, confidence, source, matched }) {
    return { location, grip, hands, versatile, confidence, source, matched };
}

/** An answer we cannot justify. The whole point of the module. */
function unresolved() {
    return { location: null, grip: null, hands: null, versatile: false, confidence: null, source: null, matched: null };
}

// ==================================================================
// ===== TIER 1: STRUCTURED =========================================
// ==================================================================

/**
 * dnd5e's own fields. Highest confidence when they fire, and they do not always
 * fire: content sets `system.type.value` unreliably, which is the whole reason
 * the later tiers exist.
 *
 * Order matters in three places. Shield is checked before armour because a
 * shield also carries `system.armor.value`. The weapon `two` check precedes
 * `lgt` because a heavy crossbow carries both `hvy` and `two`. Versatile is
 * checked before the weapon fallthrough so a longsword is not silently reported
 * as a plain main-hand weapon.
 *
 * @returns {object|null} A result, or null to fall through to the next tier.
 */
function resolveStructured(item) {
    const type = item?.type;
    const subtype = subtypeOf(item);

    // --- Weapons ---------------------------------------------------
    if (type === 'weapon') {
        // Natural, siege and improvised weapons are never gear. Squire had to
        // stop its build tool unequipping them and stop its drift check counting
        // them, or every character with claws read as permanently drifted.
        if (subtype === 'natural' || subtype === 'siege' || subtype === 'improv') {
            return result(NOT_EQUIPMENT, { confidence: 'high', source: SOURCE.STRUCTURED, matched: `weapon:${subtype}` });
        }
        if (hasProperty(item, 'two')) {
            return result(LOCATIONS.HELD, { grip: GRIP.BOTH, hands: 2, confidence: 'high', source: SOURCE.STRUCTURED, matched: 'weapon:two' });
        }
        if (hasProperty(item, 'ver')) {
            return result(LOCATIONS.HELD, { grip: GRIP.EITHER, hands: 1, versatile: true, confidence: 'high', source: SOURCE.STRUCTURED, matched: 'weapon:ver' });
        }
        if (hasProperty(item, 'lgt')) {
            return result(LOCATIONS.HELD, { grip: GRIP.OFF, hands: 1, confidence: 'high', source: SOURCE.STRUCTURED, matched: 'weapon:lgt' });
        }
        // A sling is `amm` alone -- no `two`, no `lgt` -- so this row is doing
        // real work rather than only catching melee.
        return result(LOCATIONS.HELD, { grip: GRIP.MAIN, hands: 1, confidence: 'high', source: SOURCE.STRUCTURED, matched: 'weapon:default' });
    }

    // --- Consumables -----------------------------------------------
    if (type === 'consumable') {
        if (subtype === 'ammo') {
            return result(LOCATIONS.AMMUNITION, { confidence: 'high', source: SOURCE.STRUCTURED, matched: 'consumable:ammo' });
        }
        return result(NOT_EQUIPMENT, { confidence: 'high', source: SOURCE.STRUCTURED, matched: 'consumable:default' });
    }

    // --- Tools -----------------------------------------------------
    // `container` deliberately has NO structured rule. dnd5e's container type
    // means "this holds other items" and says nothing about where on a body it
    // sits: a belt pouch, a Bag of Holding and a wooden chest are all containers.
    // An earlier draft resolved the type to `back`, which put a Fanny Pack of
    // Holding between a character's shoulder blades. Containers fall through to
    // the vocabulary, where `backpack` and `haversack` name a location and `bag`
    // and `pack` only name a container.
    if (type === 'tool') {
        return result(LOCATIONS.CARRIED, { confidence: 'medium', source: SOURCE.STRUCTURED, matched: 'tool' });
    }

    // --- Equipment subtypes ----------------------------------------
    // A shield carries NO properties at all and is identified solely by its
    // subtype. This row is the only thing that can catch it -- there is nothing
    // to fall back on -- so it is not redundant with the armour row below it.
    if (subtype === 'shield') {
        return result(LOCATIONS.HELD, { grip: GRIP.OFF, hands: 1, confidence: 'high', source: SOURCE.STRUCTURED, matched: 'equipment:shield' });
    }
    if (subtype === 'ring') {
        return result(LOCATIONS.RING, { confidence: 'high', source: SOURCE.STRUCTURED, matched: 'equipment:ring' });
    }
    if (subtype === 'vehicle') {
        return result(NOT_EQUIPMENT, { confidence: 'high', source: SOURCE.STRUCTURED, matched: 'equipment:vehicle' });
    }
    // Truthiness is the test on purpose. dnd5e's `clothing` items carry
    // `system.armor.value: 0` in the classic `items` pack, so `!== undefined`
    // here would send every cloak, hat and pair of boots to the chest.
    if (item?.system?.armor?.value) {
        return result(LOCATIONS.CHEST, { confidence: 'high', source: SOURCE.STRUCTURED, matched: 'equipment:armor' });
    }
    // `clothing` deliberately has NO rule. It reports a KIND -- "a garment" --
    // and says nothing about where the garment is worn. In the classic `items`
    // pack, Cloak of Protection, Cloak of Elvenkind, Cloak of Displacement,
    // Boots of Speed and Hat of Disguise are all `clothing`; a `clothing -> chest`
    // rule was wrong for every one of them and right only for the two robes, by
    // luck. It also sat in tier 1, so `vocab:back` never saw the word "cloak".
    //
    // The words carry the location and the vocabulary already has them all. A
    // garment nobody has a word for lands at null, which is the honest answer.

    // `rod` and `wand` deliberately fall through. An earlier draft resolved them
    // to HELD with no grip, which the contract does not allow, and it beat the
    // vocabulary's `carried` purely by sitting in tier 1 -- so a Wand of Magic
    // Missiles consumed a weapon slot. A wand is stowed far more often than
    // brandished, and it is exactly the "nothing structured really knows" case.
    return null;
}

// ==================================================================
// ===== TIER 2: BASE ITEM ==========================================
// ==================================================================

/**
 * dnd5e's base-item registries, for content whose subtype is missing or wrong
 * but whose `baseItem` is set. Three registries determine a location on their
 * own; weapon base items do not, because handedness comes from properties the
 * item already carries and tier 1 has already read them.
 *
 * Read from CONFIG at call time rather than captured at module load: a world
 * may extend these, and this module is imported during `init`.
 */
function resolveBaseItem(item) {
    const baseItem = baseItemOf(item);
    if (!baseItem) return null;

    const config = globalThis.CONFIG?.DND5E ?? {};
    if (config.shieldIds && baseItem in config.shieldIds) {
        return result(LOCATIONS.HELD, { grip: GRIP.OFF, hands: 1, confidence: 'medium', source: SOURCE.BASE_ITEM, matched: `shieldIds:${baseItem}` });
    }
    if (config.armorIds && baseItem in config.armorIds) {
        return result(LOCATIONS.CHEST, { confidence: 'medium', source: SOURCE.BASE_ITEM, matched: `armorIds:${baseItem}` });
    }
    if (config.ammoIds && baseItem in config.ammoIds) {
        return result(LOCATIONS.AMMUNITION, { confidence: 'medium', source: SOURCE.BASE_ITEM, matched: `ammoIds:${baseItem}` });
    }
    return null;
}

// ==================================================================
// ===== THE PUBLIC SURFACE =========================================
// ==================================================================

export const EquipLocationsAPI = {
    LOCATIONS,
    GRIP,
    SOURCE,

    /**
     * Where does this item go?
     *
     * Synchronous and pure. Classify a whole inventory by mapping over it; there
     * is no batch form because there is nothing to batch.
     *
     * @param {Item|object} item An Item document, or plain item data from a pack.
     * @returns {{
     *   location: string|null,
     *   grip: string|null,
     *   hands: number|null,
     *   versatile: boolean,
     *   confidence: string|null,
     *   source: string|null,
     *   matched: string|null
     * }} `location` is one of `LOCATIONS`, `'none'` for something deliberately
     *    not body equipment, or `null` when nothing could justify an answer.
     *    `grip`, `hands` and `versatile` are meaningful only when the location
     *    is `held`. `matched` names the rule that fired, so a consumer can
     *    answer "why did it pick that" without printing a regular expression.
     */
    resolve(item) {
        if (!item || typeof item !== 'object') return unresolved();

        const structured = resolveStructured(item);
        if (structured) return structured;

        const base = resolveBaseItem(item);
        if (base) return base;

        // The vocabulary is the last resort and is reached by anything that fell
        // through, with no gate on item type. Gating it by `system.type.value`
        // would gate it on the very field whose unreliability creates the need
        // for it: a Cloak of Protection typed `loot` matches no structured rule,
        // and refusing to read the word "cloak" in its name returns null for no
        // reason. `confidence` and `source` exist so a low-grade answer can be
        // offered honestly rather than withheld.
        const vocabulary = matchName(item?.name);
        if (vocabulary) {
            return result(vocabulary.location, { confidence: 'low', source: SOURCE.VOCABULARY, matched: vocabulary.id });
        }

        return unresolved();
    },

    /**
     * Whether an item is body equipment at all.
     *
     * Convenience over `resolve()`, and three-valued on purpose: `false` means
     * deliberately not equipment, `null` means nobody knows. Collapsing them
     * means re-guessing forever on items a player already rejected, and being
     * unable to tell "unknown" from "not applicable" in a UI.
     *
     * @param {Item|object} item
     * @returns {boolean|null}
     */
    isEquippable(item) {
        const { location } = this.resolve(item);
        if (location === null) return null;
        return location !== NOT_EQUIPMENT;
    },

    /**
     * The ordered vocabulary, for inspection. The order is load-bearing, so a
     * consumer explaining a match needs it as much as the patterns.
     */
    getVocabulary,

    /**
     * Add a name pattern. Position is a parameter and not a convenience:
     * appending to an ordered list is not the same as extending it.
     */
    registerVocabulary: register,

    /** Remove a registered pattern. Built-ins cannot be removed. */
    unregisterVocabulary: unregister,

    /** Restore the built-in vocabulary. For tests and the check tool. */
    resetVocabulary: reset
};

postConsoleAndNotification(MODULE.NAME, 'Equip Locations API loaded', '', true, false);
