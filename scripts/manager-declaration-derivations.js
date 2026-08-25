// ==================================================================
// ===== DECLARATION DERIVATIONS ====================================
// ==================================================================
// Content a declaration cannot express as fields, because it is not
// authored at all: it is generated from what the fields resolved to.
//
// This is the "computed content" hook the plan reserves, and Blacksmith's
// own Weapon profile is its first instance -- dnd5e expects a full Attack
// activity that nobody types, assembled from the item's resolved name,
// artwork, chat text, range units and attack type.
//
// POSITION MATTERS, and the plan left it vague. A derivation runs AFTER
// every field has resolved, over the assembled document data, not over the
// raw entry. The weapon activity needs the guessed icon and the normalised
// range units, and neither exists before construction.
//
// Named and Blacksmith-owned, like transforms and named rules. A module
// selects one; it never supplies one.
// ==================================================================

// Imported lazily inside the derivation, never at module load. The registry
// imports this file to validate that a declaration's `derive` names exist, and
// parsers/parse-item.js reaches const.js, which fetches module.json while it
// loads. A top-level import here would drag Foundry into the registry and cost
// the declaration layer the headless testability that is half its value.

/**
 * The standard Attack activity every weapon carries.
 *
 * Authors are forbidden from supplying `activities` on a weapon -- the rule
 * vocabulary enforces it -- precisely because this is generated. Two sources of
 * the same activity would diverge, and dnd5e would use whichever won.
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload, for fields that do not land.
 * @returns {Promise<object>} The same data, with the activity attached.
 */
async function weaponAttackActivity(data, entry) {
    const { WEAPON_ATTACK_TYPES, _activityBase } = await import('./parsers/parse-item.js');
    const units = data?.system?.range?.units || 'ft';
    const attackType = WEAPON_ATTACK_TYPES[data?.system?.type?.value] ?? 'melee';

    const activity = _activityBase({
        activityType: 'Attack',
        activityName: data.name,
        activityIcon: data.img,
        activityFlavorText: entry?.itemDescriptionChat || '',
        activationType: 'action',
        activationValue: 1,
        activityTarget: {
            affectsType: 'creature', affectsCount: 1, choice: false, special: '',
            templateType: '', templateSize: null, templateWidth: null, templateHeight: null,
            templateCount: null, contiguous: false, units, prompt: false
        }
    }, 0, 'weapon', false);

    activity.attack = {
        ability: String(entry?.weaponAbility ?? '').trim().toLowerCase(),
        bonus: String(entry?.weaponAttackBonus || ''),
        critical: { threshold: null },
        flat: false,
        type: { value: attackType, classification: 'weapon' }
    };
    activity.damage = { critical: { bonus: '' }, includeBase: true, parts: [] };

    data.system = data.system || {};
    data.system.activities = { [activity._id]: activity };
    return data;
}

/**
 * Equippable passive effects, as Active Effect documents.
 *
 * A derivation rather than a field transform for the same reason the attack
 * activity is one: each effect falls back to the item's artwork, and that is the
 * GUESSED icon, which does not exist until construction has resolved it.
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with effects attached.
 */
async function equippablePassiveEffects(data, entry) {
    const { _buildEquippablePassiveEffects } = await import('./parsers/parse-item.js');
    data.effects = _buildEquippablePassiveEffects(entry, data.img);
    return data;
}

/**
 * Authored activities, and the effects they apply.
 *
 * A derivation rather than a field transform for three reasons, each of which
 * rules a transform out on its own: `_buildActivities` needs the RESOLVED icon,
 * it needs to know whether the parent item has limited uses (which is itself a
 * derived field), and it MUTATES the effects array by pushing applied effects
 * into it -- so activities and effects have to be produced together.
 *
 * `parentType` comes from the document rather than a parameter, so one derivation
 * serves Feature and Spell; dnd5e's own shape differs between them (a spell's
 * activity consumes a spell slot, a feature's does not).
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with activities and effects attached.
 */
async function itemActivities(data, entry) {
    const { _buildActivities } = await import('./parsers/parse-item.js');
    const effects = Array.isArray(entry?.effects)
        ? foundry.utils.deepClone(entry.effects) : [];
    const hasUses = Boolean(data?.system?.uses?.max);
    data.system = data.system || {};
    data.system.activities = _buildActivities(entry?.activities, data.type, hasUses, effects, data.img);
    data.effects = effects;
    return data;
}

/**
 * dnd5e's slug identifier, derived from the resolved document name.
 *
 * A derivation rather than a second path on the name field: it is computed FROM
 * the name rather than being another place the name is written, and the two would
 * drift the moment a name transform appeared.
 * @param {object} data
 * @returns {Promise<object>}
 */
async function slugIdentifier(data) {
    const { _identifier } = await import('./parsers/parse-item.js');
    data.system = data.system || {};
    data.system.identifier = _identifier(data.name);
    return data;
}

/** @type {Record<string, Function>} */
const DERIVATIONS = {
    weaponAttackActivity, equippablePassiveEffects, itemActivities, slugIdentifier
};

/**
 * Whether a named derivation exists, so a declaration selecting one that does not
 * is rejected at registration rather than silently producing an incomplete document.
 * @param {string} name
 * @returns {boolean}
 */
export function hasDerivation(name) {
    return Object.prototype.hasOwnProperty.call(DERIVATIONS, name);
}

/**
 * Run a profile's derivations, in declaration order.
 * @param {string[]} names
 * @param {object} data
 * @param {object} entry
 * @returns {object}
 */
export async function applyDerivations(names, data, entry) {
    let result = data;
    for (const name of names ?? []) {
        const derivation = DERIVATIONS[name];
        if (derivation) result = await derivation(result, entry);
    }
    return result;
}
