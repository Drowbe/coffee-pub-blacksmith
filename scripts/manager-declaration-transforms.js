// ==================================================================
// ===== DECLARATION TRANSFORMS =====================================
// ==================================================================
// Named conversions a declaration SELECTS but never supplies. Blacksmith
// owns compatibility with Foundry and dnd5e, so a system-shaped derivation
// is ours by definition; a module that needs one which does not exist asks
// for it, and that is one of the two narrow places where negotiation
// survives (plan-importer-api.md, "Where negotiation actually remains").
//
// A transform receives the authored value and a context, and returns the
// value to write. Returning `undefined` means WRITE NOTHING -- which is how
// an empty GM note leaves no flag behind rather than an empty envelope.
//
// Transforms may be async and may read the whole entry, because some of
// them genuinely need it: the icon guess reads the item's name and
// description, not just the blank path it is replacing.
// ==================================================================

import { GMNotesManager } from './manager-gmnotes.js';
import {
    guessIconPath, _damagePart, _emptyDamagePart, _attunementValue, _uses,
    WEAPON_TYPES, WEAPON_PROPERTIES
} from './parsers/parse-item.js';

/** Helpers the transforms borrow from the parser, named so the reuse is visible. */
const TRANSFORM_DEPS = { _uses };
import { issue } from './utility-import-issues.js';

/**
 * Thrown by a transform so the failure reaches the result envelope with a code
 * and a path rather than as a bare message. Carries a structured issue.
 */
export class TransformError extends Error {
    /**
     * @param {string} code
     * @param {string} path
     * @param {string} message
     * @param {object} [details]
     */
    constructor(code, path, message, details = {}) {
        super(message);
        this.name = 'TransformError';
        this.issue = issue(code, path, message, details, 'convert');
    }
}

/**
 * Price as an amount plus a coin abbreviation, into dnd5e's stored shape.
 * Mirrors parseItemPrice in parsers/parse-item.js; the difference is that a
 * failure here names the field instead of throwing an untyped Error.
 * @param {*} value
 * @param {{field: object}} context
 * @returns {{value: number, denomination: string}}
 */
function price(value, { field }) {
    if (value == null || String(value).trim() === '') {
        return { value: 0, denomination: 'gp' };
    }
    const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp|ep|pp)?$/i);
    if (!match) {
        throw new TransformError('PRICE_UNPARSEABLE', field.name,
            `Unsupported ${field.name} "${value}"; use a value such as "50 GP".`,
            { actual: value });
    }
    return { value: Number(match[1]), denomination: (match[2] || 'gp').toLowerCase() };
}

/**
 * GM notes HTML into Blacksmith's envelope. Blank writes nothing at all, so an
 * item authored without notes carries no flag rather than an empty one.
 * @param {*} value
 * @returns {object|undefined}
 */
function gmNotes(value) {
    const html = typeof value === 'string' ? value : '';
    if (!html.trim()) return undefined;
    return GMNotesManager.buildEnvelope({ html });
}

/**
 * An explicit artwork path, or a guess from the item's name and description.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {Promise<string>}
 */
async function itemIcon(value, { entry }) {
    const supplied = typeof value === 'string' ? value.trim() : '';
    if (supplied) return supplied;
    return guessIconPath(entry);
}

/**
 * The magical flag, as dnd5e's physical-item property list.
 * @param {*} value
 * @returns {string[]}
 */
function magicalProperty(value) {
    return value ? ['mgc'] : [];
}

/**
 * The weapon subtype, as dnd5e's canonical code.
 * `values` on the field could not do this alone: the canonical form (`simpleM`) is
 * not what anyone authors, so the accepted spellings ARE the schema and the codes
 * are an implementation detail the author never sees.
 * @param {*} value
 * @param {{field: object}} context
 * @returns {string}
 */
function weaponType(value, { field }) {
    const token = String(value ?? 'Simple Melee').trim().toLowerCase();
    const resolved = WEAPON_TYPES[token];
    if (!resolved) {
        throw new TransformError('WEAPON_TYPE_UNSUPPORTED', field.name,
            `Unsupported ${field.name} "${value}".`, { actual: value });
    }
    return resolved;
}

/**
 * The weapon property list, folding in the magical flag.
 *
 * TWO authored fields land here -- `weaponProperties` and `itemIsMagical` -- which
 * is why the second is declared `role: 'input'` and this transform reads the entry
 * rather than only its own value. The rule vocabulary separately enforces that the
 * two agree, so by the time this runs they cannot contradict each other.
 * @param {*} value
 * @param {{entry: object, field: object}} context
 * @returns {string[]}
 */
function weaponProperties(value, { entry, field }) {
    if (value != null && !Array.isArray(value)) {
        throw new TransformError('TYPE_MISMATCH', field.name, `${field.name} must be an array.`);
    }
    const properties = [];
    for (const raw of value ?? []) {
        const key = WEAPON_PROPERTIES[String(raw ?? '').trim().toLowerCase()];
        if (!key) {
            throw new TransformError('WEAPON_PROPERTY_UNSUPPORTED', field.name,
                `Unsupported weapon property "${raw}".`, { actual: raw });
        }
        if (!properties.includes(key)) properties.push(key);
    }
    if (entry?.itemIsMagical && !properties.includes('mgc')) properties.push('mgc');
    return properties;
}

/**
 * Base damage, from the formula plus the separately authored damage type.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {object}
 */
function damagePart(value, { entry }) {
    return _damagePart(value, entry?.weaponDamageType);
}

/**
 * Versatile damage, or dnd5e's empty part when the weapon is not versatile.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {object}
 */
function versatileDamage(value, { entry }) {
    const formula = String(value ?? '').trim();
    return formula ? _damagePart(formula, entry?.weaponDamageType) : _emptyDamagePart();
}

/**
 * Attunement, which dnd5e stores only for magical items.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {string}
 */
function attunement(value, { entry }) {
    return entry?.itemIsMagical ? _attunementValue(value) : '';
}

/**
 * The range block, with every bound normalised to a number or null.
 * @param {*} value
 * @param {{field: object}} context
 * @returns {object}
 */
function weaponRange(value, { field }) {
    const source = value ?? {};
    if (typeof source !== 'object' || Array.isArray(source)) {
        throw new TransformError('TYPE_MISMATCH', field.name, `${field.name} must be an object.`);
    }
    const range = { units: String(source.units || 'ft') };
    for (const key of ['value', 'long', 'reach']) {
        const raw = source[key];
        if (raw == null || raw === '') {
            range[key] = null;
            continue;
        }
        const number = Number(raw);
        if (!Number.isFinite(number) || number < 0) {
            throw new TransformError('RANGE_INVALID', `${field.name}.${key}`,
                `${field.name}.${key} must be a non-negative number or null.`, { actual: raw });
        }
        range[key] = number;
    }
    return range;
}

/**
 * A subtype token as dnd5e stores it: lowercase, spaces to hyphens.
 * @param {*} value
 * @returns {string}
 */
function slug(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Attunement, written ONLY for a magical item.
 *
 * Distinct from `attunement` above, which always writes and is what a weapon
 * wants. Equipment and tools assign the key inside a magical-only branch, so a
 * mundane one carries no attunement key at all rather than an empty string --
 * and returning undefined is how a transform says write nothing.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {string|undefined}
 */
function attunementIfMagical(value, { entry }) {
    return entry?.itemIsMagical ? _attunementValue(value) : undefined;
}

/**
 * dnd5e's limited-uses block, from the max plus the separately authored spent
 * count and recovery period.
 *
 * Three authored fields land here, which is the same shape as the weapon damage
 * pair: the field owning the path reads its siblings, and they are declared
 * `role: 'input'`. The recovery period is validated by the underlying helper,
 * so an unsupported one fails at convert with the field named.
 * @param {*} value
 * @param {{entry: object, field: object}} context
 * @returns {object}
 */
function limitedUses(value, { entry, field, declaration }) {
    const { _uses } = TRANSFORM_DEPS;
    // Read siblings through their OWN declarations so their key aliases are honoured.
    // The parser reads `flat.featureUsesSpent ?? flat.usesSpent`, and reaching into
    // the entry by one name would silently drop the short form.
    const read = (name) => {
        if (!name) return undefined;
        if (Object.prototype.hasOwnProperty.call(entry, name)) return entry[name];
        const sibling = declaration?.fields?.find(one => one.name === name);
        for (const alias of sibling?.acceptsKeys ?? []) {
            if (Object.prototype.hasOwnProperty.call(entry, alias)) return entry[alias];
        }
        return undefined;
    };
    try {
        return _uses(value, read(field.spentFrom), read(field.periodFrom), read(field.formulaFrom));
    } catch (error) {
        throw new TransformError('RECOVERY_PERIOD_UNSUPPORTED',
            field.periodFrom ?? field.name, error.message);
    }
}

/**
 * Spell preparation, authored as a word and stored as a number.
 * Not an alias: an alias maps one spelling onto another spelling of the same
 * value, and these are different types, which makes it a conversion.
 * @param {*} value
 * @param {{field: object}} context
 * @returns {number}
 */
function spellPreparation(value, { field }) {
    const stored = { unprepared: 0, prepared: 1, always: 2 }[String(value ?? 'prepared').toLowerCase()];
    if (stored == null) {
        throw new TransformError('SPELL_PREPARATION_UNSUPPORTED', field.name,
            `Unsupported ${field.name} "${value}".`, { actual: value });
    }
    return stored;
}

/**
 * Casting time into dnd5e's activation block. The authored `units` is the action
 * type, which reads oddly but is what the system stores.
 * @param {*} value
 * @returns {object}
 */
function castingActivation(value) {
    const casting = value ?? {};
    return {
        type: casting.units || 'action',
        value: casting.value ?? 1,
        condition: casting.condition || ''
    };
}

/**
 * A spell's range block.
 * @param {*} value
 * @returns {object}
 */
function spellRange(value) {
    const range = value ?? {};
    return {
        value: range.value ?? '',
        units: range.units || 'self',
        special: range.special || ''
    };
}

/**
 * A spell's duration block.
 * @param {*} value
 * @returns {object}
 */
function spellDuration(value) {
    const duration = value ?? {};
    return {
        value: duration.value ?? '',
        units: duration.units || 'inst',
        special: duration.special || ''
    };
}

/**
 * A spell's target block. Narrower than an activity's: dnd5e stores no width,
 * height or prompt here, and writing them would invent structure the system
 * does not read.
 * @param {*} value
 * @returns {object}
 */
function spellTarget(value) {
    const target = value ?? {};
    return {
        template: {
            count: target.templateCount ?? '',
            contiguous: !!target.contiguous,
            type: target.templateType || '',
            size: target.templateSize ?? '',
            width: '',
            height: '',
            units: target.units || 'ft'
        },
        affects: {
            count: target.affectsCount ?? '',
            type: target.affectsType || '',
            choice: !!target.choice,
            special: target.special || ''
        }
    };
}

/**
 * Spell materials, from the description plus the separately authored cost and
 * consumed flag. `supply` is always zero at import -- it tracks what a character
 * actually carries, which is world state rather than a property of the spell.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {object}
 */
function spellMaterials(value, { entry }) {
    return {
        value: typeof value === 'string' ? value : '',
        consumed: !!entry?.materialConsumed,
        cost: Number(entry?.materialCost) || 0,
        supply: 0
    };
}

/** @type {Record<string, Function>} */
const TRANSFORMS = {
    slug, attunementIfMagical, limitedUses,
    spellPreparation, castingActivation, spellRange, spellDuration, spellTarget, spellMaterials,
    price, gmNotes, itemIcon, magicalProperty,
    weaponType, weaponProperties, damagePart, versatileDamage, attunement, weaponRange
};

/**
 * Whether a named transform exists. Used by the registry so a declaration naming
 * a transform Blacksmith does not have is rejected at registration.
 * @param {string} name
 * @returns {boolean}
 */
export function hasTransform(name) {
    return Object.prototype.hasOwnProperty.call(TRANSFORMS, name);
}

/**
 * Apply a named transform.
 * @param {string} name
 * @param {*} value
 * @param {{entry: object, field: object, declaration: object}} context
 * @returns {Promise<*>}
 */
export async function applyTransform(name, value, context) {
    const transform = TRANSFORMS[name];
    if (!transform) {
        throw new TransformError('UNKNOWN_TRANSFORM', context?.field?.name ?? '',
            `No transform named "${name}" is registered.`);
    }
    return transform(value, context);
}

/** Every registered transform name, for capability reporting. */
export function transformNames() {
    return Object.keys(TRANSFORMS);
}
