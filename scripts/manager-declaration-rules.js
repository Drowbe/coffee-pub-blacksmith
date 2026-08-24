// ==================================================================
// ===== DECLARATION RULES ==========================================
// ==================================================================
// Cross-field validation, in two tiers.
//
// VOCABULARY RULES are the common shapes, declared structurally. Blacksmith
// derives the check, the guide line and the prompt sentence from the same
// entry, which is why the set is CLOSED: a module supplying its own predicate
// would give us validation we cannot describe to a generator, and "every
// module handed users a differently shaped prompt" is one of the four reasons
// the importer exists.
//
// NAMED RULES are the exotic ones, and they exist because the alternative is
// worse. Blacksmith's own Weapon profile needs "Ranged and Thrown weapons
// require a range value", where `ranged` is DERIVED from the weapon subtype
// through a lookup table -- a rule about a value the author never wrote.
// Covering that structurally means adding contains / greaterThan / anyOf /
// derived-value references, which is a predicate DSL by another name. So a
// named rule is Blacksmith code selected by a declaration, exactly like a
// named transform, and it carries its own sentence so the prompt stays
// derivable.
//
// A module may select either. It supplies neither.
// ==================================================================

import { issue } from './utility-import-issues.js';

/** Vocabulary rule kinds. Closed on purpose; adding one is a deliberate change. */
export const RULE_KINDS = new Set([
    'requiresTogether',
    'mutuallyExclusive',
    'impliedBy',
    'requires',
    'mustBeEmpty'
]);

/**
 * Read a field's authored value, honouring key aliases the same way construction does.
 * @param {object} entry
 * @param {object} declaration
 * @param {string} name
 * @returns {*}
 */
function valueOf(entry, declaration, name) {
    if (Object.prototype.hasOwnProperty.call(entry, name)) return entry[name];
    const field = declaration.fields.find(one => one.name === name);
    for (const alias of field?.acceptsKeys ?? []) {
        if (Object.prototype.hasOwnProperty.call(entry, alias)) return entry[alias];
    }
    return undefined;
}

/**
 * Whether a reference is satisfied. A reference is either a field name, or a
 * field name plus one value that field's array must contain -- `weaponProperties:ver`.
 * That second form is what the Weapon rules need and it is the only shape beyond
 * a plain name, so it stays a notation rather than becoming an operator set.
 * @param {object} entry
 * @param {object} declaration
 * @param {string} reference
 * @returns {boolean}
 */
function isPresent(entry, declaration, reference) {
    const [name, member] = String(reference).split(':');
    const value = valueOf(entry, declaration, name);
    if (member !== undefined) {
        return Array.isArray(value) && value.includes(member);
    }
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return true;
}

/** Human-readable form of a reference, for a message nobody has to write by hand. */
function label(reference) {
    const [name, member] = String(reference).split(':');
    return member === undefined ? name : `${name} "${member}"`;
}

/**
 * The sentence a vocabulary rule states. Used for the validation message, and the
 * same text feeds the authoring guide and the prompt so the three cannot drift.
 * @param {object} rule
 * @returns {string}
 */
export function ruleSentence(rule) {
    const list = (references) => references.map(label).join(' and ');
    switch (rule.kind) {
        case 'requiresTogether':
            return `${list(rule.fields)} must be supplied together, or not at all.`;
        case 'mutuallyExclusive':
            return `${list(rule.fields)} cannot be combined.`;
        case 'impliedBy':
            return `${label(rule.when)} requires ${list(rule.then)}, and the reverse.`;
        case 'requires':
            return `${label(rule.when)} requires ${list(rule.then)}.`;
        case 'mustBeEmpty':
            return `${label(rule.field)} must be empty; Blacksmith generates it.`;
        default:
            return rule.message ?? 'Invalid combination of fields.';
    }
}

/**
 * Evaluate one vocabulary rule.
 * @param {object} rule
 * @param {object} entry
 * @param {object} declaration
 * @returns {object|null} An issue, or null when satisfied.
 */
function evaluateVocabulary(rule, entry, declaration) {
    const present = (reference) => isPresent(entry, declaration, reference);
    const raise = (path) => issue(rule.code ?? `RULE_${rule.kind.toUpperCase()}`,
        path, rule.message ?? ruleSentence(rule), { rule: rule.kind });

    switch (rule.kind) {
        case 'requiresTogether': {
            const supplied = rule.fields.filter(present);
            if (supplied.length && supplied.length !== rule.fields.length) {
                return raise(String(rule.fields.find(one => !present(one))).split(':')[0]);
            }
            return null;
        }
        case 'mutuallyExclusive': {
            const supplied = rule.fields.filter(present);
            return supplied.length > 1 ? raise(String(supplied[0]).split(':')[0]) : null;
        }
        case 'impliedBy': {
            // Both directions, which is the point: the magical flag and the magical
            // property each imply the other, and one without the other is a payload
            // that would produce an item disagreeing with itself.
            const left = present(rule.when);
            const right = rule.then.every(present);
            if (left !== right) {
                return raise(String(left ? rule.then.find(one => !present(one)) : rule.when).split(':')[0]);
            }
            return null;
        }
        case 'requires': {
            if (present(rule.when) && !rule.then.every(present)) {
                return raise(String(rule.then.find(one => !present(one))).split(':')[0]);
            }
            return null;
        }
        case 'mustBeEmpty': {
            const value = valueOf(entry, declaration, String(rule.field).split(':')[0]);
            const empty = value === undefined || value === null
                || (Array.isArray(value) && !value.length);
            return empty ? null : raise(String(rule.field).split(':')[0]);
        }
        default:
            return null;
    }
}

// ------------------------------------------------------------------
// Named rules
// ------------------------------------------------------------------

/**
 * Ranged and Thrown weapons need a positive range.
 *
 * `ranged` is not authored: it is derived from the weapon subtype through a
 * lookup table, which is why this cannot be a vocabulary rule. The sentence is
 * declared alongside so the prompt and the guide still get it.
 */
const weaponRangeRequired = {
    sentence: 'Ranged and Thrown weapons require weaponRange.value greater than zero.',
    /**
     * @param {object} entry
     * @returns {object|null}
     */
    check(entry) {
        const RANGED_SUBTYPES = new Set(['simple ranged', 'simpler', 'martial ranged', 'martialr', 'siege weapon', 'siege']);
        const subtype = String(entry?.itemSubType ?? '').trim().toLowerCase();
        const thrown = Array.isArray(entry?.weaponProperties)
            && entry.weaponProperties.some(one => String(one).trim().toLowerCase() === 'thrown');
        if (!RANGED_SUBTYPES.has(subtype) && !thrown) return null;
        const value = Number(entry?.weaponRange?.value);
        if (Number.isFinite(value) && value > 0) return null;
        return issue('WEAPON_RANGE_REQUIRED', 'weaponRange.value', this.sentence);
    }
};

/** @type {Record<string, {sentence: string, check: Function}>} */
const NAMED_RULES = { weaponRangeRequired };

/**
 * Whether a named rule exists, so a declaration selecting one that does not is
 * rejected at registration rather than passing silently at import.
 * @param {string} name
 * @returns {boolean}
 */
export function hasNamedRule(name) {
    return Object.prototype.hasOwnProperty.call(NAMED_RULES, name);
}

/** The sentence a named rule states, for guide and prompt derivation. */
export function namedRuleSentence(name) {
    return NAMED_RULES[name]?.sentence ?? '';
}

/**
 * Evaluate every rule a declaration carries.
 * @param {object} declaration
 * @param {object} entry
 * @returns {object[]} Issues, empty when every rule is satisfied.
 */
export function evaluateRules(declaration, entry) {
    const issues = [];
    for (const rule of declaration.rules ?? []) {
        const raised = rule.named
            ? NAMED_RULES[rule.named]?.check(entry) ?? null
            : evaluateVocabulary(rule, entry, declaration);
        if (raised) issues.push(raised);
    }
    return issues;
}

/**
 * Every sentence a profile's rules state, in declaration order. One source for
 * the validation message, the guide line and the prompt line.
 * @param {object} declaration
 * @returns {string[]}
 */
export function ruleSentences(declaration) {
    return (declaration.rules ?? []).map(rule =>
        rule.named ? namedRuleSentence(rule.named) : ruleSentence(rule));
}
