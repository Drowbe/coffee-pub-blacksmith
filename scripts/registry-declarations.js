// ==================================================================
// ===== DECLARATION REGISTRY =======================================
// ==================================================================
// A profile declares its SHAPE as data; Blacksmith derives the JSON
// template, authoring guide, prompt, validation, document construction
// and export from that one declaration. This file owns registration and
// the self-validation that makes a malformed declaration fail loudly at
// registration rather than silently at import.
//
// Contract: documentation/plans/plan-importer-api.md, section "The
// declaration". Build sequence: documentation/TODO.md.
//
// BLACKSMITH IS CONSUMER ZERO. Our own profiles register through
// `registerDeclaration` below, and `api.importer.registerDeclaration`
// is a pass-through to the same function with the same validation and
// no privileged fields. There is deliberately no internal back door;
// if a Blacksmith profile needs something, the public surface gains it.
// ==================================================================

/**
 * @typedef {object} DeclarationField
 * @property {string} name - The friendly authoring key.
 * @property {string} [path] - Target on the created document. Required on a mapped profile
 *                             unless `role` says the field does not land.
 * @property {'selector'|'envelope'|'input'} [role] - `selector` picks the profile; `input` is read by
 *                             another field's transform; `envelope` is consumed into the document
 *                             (passthrough form). None of the three lands on a path of its own.
 * @property {string} [type] - 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' |
 *                             'formula'. A `formula` field targets a dnd5e FormulaField and accepts
 *                             a number or a roll-formula string.
 * @property {boolean} [nullable=false] - Whether null is a real value for this field rather than an
 *                             absence. dnd5e uses it that way: a null `proficient` means "follow the
 *                             character", and a null range bound means "no such bound".
 * @property {boolean} [required=false]
 * @property {boolean} [authorable=true] - False means declared but never in the template, guide or
 *                             prompt, never written from a payload, and preserved across re-import.
 * @property {*} [default] - Applied at import when the field is absent.
 * @property {*} [example] - Shown in the JSON template. Falls back to `default` when omitted.
 *                             These are genuinely different: the template shows `"0 GP"` where the
 *                             runtime default is `{value: 0, denomination: 'gp'}`.
 * @property {'default'|'preserve'} [absentMeans='default'] - `preserve` leaves whatever is on the
 *                             document untouched, so present-but-empty can still clear it.
 * @property {string[]} [values] - Allowed canonical values.
 * @property {number} [min] - Inclusive lower bound. Number and integer fields only.
 * @property {number} [max] - Inclusive upper bound. Number and integer fields only.
 * @property {Record<string,string>} [aliases] - Accepted spellings mapping onto a canonical VALUE.
 * @property {string[]} [acceptsKeys] - Other payload KEYS this field may arrive under. Distinct
 *                             from `aliases`: one renames the value, the other renames the field.
 * @property {string} [transform] - Named, Blacksmith-owned conversion. Never module code.
 * @property {string} [merge] - Array merge policy on re-import, e.g. 'unionBy:name'.
 * @property {DeclarationField[]} [fields] - Nested declaration for object / array-of-object fields.
 * @property {string} [requiresOption] - Option id that must be truthy for this field to appear
 *                             in authoring output.
 * @property {string} [suppressedByOption] - Option id that removes this field when explicitly false.
 *                             The opt-out counterpart to `requiresOption`.
 * @property {*} [const] - A fixed value always written at `path` and never authored. Not part of
 *                             the template, the guide or the prompt.
 * @property {string} [guidance] - ONE sentence. Used for both the guide line and the prompt line,
 *                             so the two cannot drift.
 */

/**
 * @typedef {object} Declaration
 * @property {string} kind - Host kind id: 'item', 'journal', 'actor', 'rolltable'.
 * @property {string} id - Profile id, unique within the kind.
 * @property {string} label
 * @property {number} schemaVersion
 * @property {'mapped'|'passthrough'} form
 * @property {string} [module] - Owning module id. Absent means Blacksmith.
 * @property {object} document - { documentName, type, pageType }. `pageType` is the
 *                             JournalEntryPage subtype a journal profile creates, defaulting to
 *                             'text'. A module-owned subtype is namespaced `<module.id>.<subtype>`;
 *                             Foundry namespaces the DECLARATION of one, not its creation, so
 *                             Blacksmith can build a subtype another module declares.
 * @property {DeclarationField[]} fields
 * @property {object[]} [rules] - Cross-field rules: a closed vocabulary kind, or a named rule.
 * @property {string[]} [derive] - Named derivations run over the assembled document data.
 * @property {object} [ownership] - Per-profile ownership defaults. Never inherited from the kind:
 *                             a profile whose content is revealed deliberately must say so.
 */

import { RULE_KINDS, hasNamedRule } from './manager-declaration-rules.js';
import { hasDerivation } from './manager-declaration-derivations.js';
import { hasTransform } from './manager-declaration-transforms.js';

/**
 * Whether a value matches a declared type. Lives here rather than beside the
 * validator because registration uses it too: a `default` or `example` that does
 * not match its own field's type is a declaration bug, and catching it at
 * registration is the difference between a clear error and "[object Object]"
 * surfacing from a transform three steps later.
 * @param {string} type
 * @param {*} value
 * @returns {boolean}
 */
export function matchesType(type, value) {
    switch (type) {
        case 'string': return typeof value === 'string';
        case 'boolean': return typeof value === 'boolean';
        case 'number': return typeof value === 'number' && Number.isFinite(value);
        case 'integer': return Number.isInteger(value);
        case 'array': return Array.isArray(value);
        case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
        // A dnd5e FormulaField, which genuinely accepts both: `15` and
        // `8 + @prof + @abilities.cha.mod` are equally valid save DCs, and dnd5e
        // coerces the number to a string on assignment. Declaring such a field as
        // `integer` rejects every formula and as `string` rejects every plain
        // number, so both were wrong and the third option is to name what it is.
        case 'formula': return typeof value === 'string'
            || (typeof value === 'number' && Number.isFinite(value));
        default: return true;
    }
}

/**
 * Whether a field accepts a value, honouring its declared type and nullability.
 * @param {object} field
 * @param {*} value
 * @returns {boolean}
 */
export function fieldAccepts(field, value) {
    if (value === null) return field?.nullable === true;
    return matchesType(field?.type, value);
}

// TWO forms, not three. `rendered` was specified as a third -- fields feed a
// template and the whole payload becomes one HTML string -- and no profile ever
// used it. Expressing Blacksmith's Area journal against the model settled it: every
// field is `role: 'input'` and one derivation composes the HTML, which is exactly
// what a Roll Table's rows and an Actor's envelope already do under `mapped`.
// A form present in a registry and a documentation table but in no profile is
// indistinguishable from a rule that can never fire.
const FORMS = new Set(['mapped', 'passthrough']);
const ROLES = new Set(['selector', 'envelope', 'input']);
const ABSENT_MEANS = new Set(['default', 'preserve']);

/** @type {Map<string, Declaration>} */
const declarations = new Map();

/**
 * Registry key. Profiles are unique per kind, not globally, so two kinds may
 * both have a `text` profile without colliding.
 * @param {string} kindId
 * @param {string} profileId
 * @returns {string}
 */
function keyFor(kindId, profileId) {
    return `${String(kindId || '').trim()}.${String(profileId || '').trim()}`;
}

/**
 * Validate one field, recursing into nested declarations.
 * Throws with a path so the message names the offending field rather than the profile.
 * @param {DeclarationField} field
 * @param {string} form
 * @param {string} where
 */
function validateField(field, form, where, nested = false) {
    if (!field || typeof field !== 'object') {
        throw new Error(`${where}: each field must be an object`);
    }
    const name = String(field.name || '').trim();
    if (!name) {
        throw new Error(`${where}: field requires a name`);
    }
    const at = `${where}.${name}`;

    if (field.role !== undefined && !ROLES.has(field.role)) {
        throw new Error(`${at}: role must be one of ${[...ROLES].join(', ')}`);
    }
    // A mapped profile lands every top-level field somewhere. The exceptions are
    // explicit: a selector picks the profile, an envelope is consumed by a transform.
    // A NESTED field is exempt -- its parent owns the document path and the nesting
    // describes the shape of the value, not another place to write.
    if (!nested && form === 'mapped' && !field.path && !field.role && !Array.isArray(field.fields)) {
        throw new Error(`${at}: a mapped profile requires a path, a role, or nested fields`);
    }
    if (field.absentMeans !== undefined && !ABSENT_MEANS.has(field.absentMeans)) {
        throw new Error(`${at}: absentMeans must be 'default' or 'preserve'`);
    }
    if (field.values !== undefined && !Array.isArray(field.values)) {
        throw new Error(`${at}: values must be an array`);
    }
    // A bound only means anything on a number. On a string field it would read as
    // a length limit, which it is not, and would be enforced as a numeric compare
    // against NaN -- a check that can never fail, declared by someone who believed
    // it would.
    for (const bound of ['min', 'max']) {
        if (field[bound] === undefined) continue;
        if (typeof field[bound] !== 'number' || Number.isNaN(field[bound])) {
            throw new Error(`${at}: ${bound} must be a number`);
        }
        if (field.type !== 'number' && field.type !== 'integer') {
            throw new Error(`${at}: ${bound} requires a number or integer field, not ${field.type}`);
        }
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        throw new Error(`${at}: min ${field.min} is greater than max ${field.max}`);
    }
    // An alias pointing at a value that is not allowed is the failure mode that
    // silently normalises authored content into something the profile rejects.
    if (field.aliases !== undefined) {
        if (typeof field.aliases !== 'object' || Array.isArray(field.aliases)) {
            throw new Error(`${at}: aliases must be an object`);
        }
        const allowed = new Set(field.values ?? []);
        for (const [alias, target] of Object.entries(field.aliases)) {
            if (!allowed.has(target)) {
                throw new Error(`${at}: alias "${alias}" maps to "${target}", which is not in values`);
            }
        }
    }
    if (field.path !== undefined && typeof field.path !== 'string') {
        throw new Error(`${at}: path must be a string`);
    }
    // A transform name that does not exist is a declaration bug, and catching it at
    // registration is the difference between a clear error and a failure surfacing
    // from construction three steps later. Derivations were already checked here;
    // transforms were not, which was an inconsistency rather than a decision.
    if (field.transform !== undefined && !hasTransform(field.transform)) {
        throw new Error(`${at}: no transform named "${field.transform}" is registered`);
    }
    if (field.acceptsKeys !== undefined) {
        if (!Array.isArray(field.acceptsKeys)) {
            throw new Error(`${at}: acceptsKeys must be an array`);
        }
        if (field.acceptsKeys.includes(name)) {
            throw new Error(`${at}: acceptsKeys must not repeat the field's own name`);
        }
    }
    // `default` and `example` are BOTH in authored shape -- what a person types --
    // never in the shape a transform produces. Transforms always run, including over
    // a default, so a default already in converted shape gets converted twice.
    if (field.type) {
        for (const slot of ['default', 'example']) {
            if (field[slot] !== undefined && !fieldAccepts(field, field[slot])) {
                throw new Error(`${at}: ${slot} must match the declared type ${field.type};`
                    + ` both are in authored shape, before any transform runs`);
            }
        }
    }
    if (field.const !== undefined) {
        if (field.example !== undefined || field.default !== undefined) {
            throw new Error(`${at}: a const field cannot carry a default or an example`);
        }
        if (!field.path) {
            throw new Error(`${at}: a const field requires a path`);
        }
    }
    if (field.authorable === false && field.example !== undefined) {
        throw new Error(`${at}: a non-authorable field cannot carry a template example`);
    }
    if (Array.isArray(field.fields)) {
        validateFields(field.fields, form, at, true);
    }
}

/**
 * @param {DeclarationField[]} fields
 * @param {string} form
 * @param {string} where
 */
function validateFields(fields, form, where, nested = false) {
    if (!Array.isArray(fields)) {
        throw new Error(`${where}: fields must be an array`);
    }
    const seen = new Set();
    for (const field of fields) {
        validateField(field, form, where, nested);
        const name = String(field.name).trim();
        if (seen.has(name)) {
            throw new Error(`${where}: duplicate field name "${name}"`);
        }
        seen.add(name);
    }
}

/**
 * Validate a profile's cross-field rules. A rule selects either a vocabulary kind
 * or a named rule, never both, and never supplies a predicate.
 * @param {object} declaration
 * @param {string} where
 */
function validateRules(declaration, where) {
    if (declaration.rules === undefined) return;
    if (!Array.isArray(declaration.rules)) {
        throw new Error(`${where}: rules must be an array`);
    }
    const names = new Set(declaration.fields.map(field => String(field.name)));
    const known = (reference) => names.has(String(reference).split(':')[0]);

    for (const rule of declaration.rules) {
        if (!rule || typeof rule !== 'object') {
            throw new Error(`${where}: each rule must be an object`);
        }
        if (rule.named !== undefined) {
            if (rule.kind !== undefined) {
                throw new Error(`${where}: a rule selects either a kind or a named rule, not both`);
            }
            if (!hasNamedRule(rule.named)) {
                throw new Error(`${where}: no named rule "${rule.named}" is registered`);
            }
            continue;
        }
        if (!RULE_KINDS.has(rule.kind)) {
            throw new Error(`${where}: rule kind must be one of ${[...RULE_KINDS].join(', ')}`);
        }
        // A rule naming a field the profile does not declare is silently inert,
        // which is worse than an error: the constraint reads as enforced and is not.
        const references = [
            ...(Array.isArray(rule.fields) ? rule.fields : []),
            ...(Array.isArray(rule.then) ? rule.then : []),
            ...(rule.when !== undefined ? [rule.when] : []),
            ...(rule.field !== undefined ? [rule.field] : [])
        ];
        if (!references.length) {
            throw new Error(`${where}: rule "${rule.kind}" references no fields`);
        }
        for (const reference of references) {
            if (!known(reference)) {
                throw new Error(`${where}: rule "${rule.kind}" references undeclared field "${reference}"`);
            }
        }
    }
}

/**
 * Register a profile declaration.
 * @param {Declaration} declaration
 * @returns {string} The registry key.
 */
export function registerDeclaration(declaration) {
    if (!declaration || typeof declaration !== 'object') {
        throw new Error('A declaration must be an object');
    }
    const kind = String(declaration.kind || '').trim();
    const id = String(declaration.id || '').trim();
    if (!kind) throw new Error('A declaration requires a kind');
    if (!id) throw new Error(`Declaration for kind "${kind}" requires an id`);

    const where = `${kind}.${id}`;
    if (!FORMS.has(declaration.form)) {
        throw new Error(`${where}: form must be one of ${[...FORMS].join(', ')}`);
    }
    if (!Number.isInteger(declaration.schemaVersion) || declaration.schemaVersion < 1) {
        throw new Error(`${where}: schemaVersion must be an integer of 1 or more`);
    }
    if (!declaration.document || typeof declaration.document !== 'object') {
        throw new Error(`${where}: document is required`);
    }
    if (!String(declaration.document.documentName || '').trim()) {
        throw new Error(`${where}: document.documentName is required`);
    }
    validateFields(declaration.fields, declaration.form, where);
    validateRules(declaration, where);
    if (declaration.derive !== undefined) {
        if (!Array.isArray(declaration.derive)) {
            throw new Error(`${where}: derive must be an array of named derivations`);
        }
        for (const name of declaration.derive) {
            if (!hasDerivation(name)) {
                throw new Error(`${where}: no derivation named "${name}" is registered`);
            }
        }
    }

    const key = keyFor(kind, id);
    if (declarations.has(key)) {
        // Reject rather than replace, for the same reason two contributions claiming
        // one entry is an error: a silent last-one-wins is a race nobody can see.
        throw new Error(`${where}: a declaration is already registered for this profile`);
    }
    declarations.set(key, declaration);
    return key;
}

/**
 * @param {string} kindId
 * @param {string} profileId
 * @returns {Declaration|undefined}
 */
export function getDeclaration(kindId, profileId) {
    return declarations.get(keyFor(kindId, profileId));
}

/**
 * Every declaration registered against one kind, in registration order.
 * @param {string} kindId
 * @returns {Declaration[]}
 */
export function getDeclarationsForKind(kindId) {
    const kind = String(kindId || '').trim();
    return [...declarations.values()].filter(entry => entry.kind === kind);
}

/**
 * Every registered declaration, in registration order.
 * @returns {Declaration[]}
 */
export function listDeclarations() {
    return [...declarations.values()];
}

// ==================================================================
// ===== FIELD GROUPS ===============================================
// ==================================================================
// A module contributing fields to profiles it does NOT own.
//
// Raised by Artificer 2026-08-25, and it is a real gap rather than a
// convenience. Their flags are orthogonal to the D&D item type: an Artificer
// item is a loot, or a consumable, or a tool, WITH their fields added. So there
// is no profile id they could register under -- `item/artificer` would compete
// with the eight rather than compose with them, and declaring the block eight
// times duplicates it and still cannot be opted into per import.
//
// A group is therefore its own registry, keyed separately, merged into a host
// profile's fields when that profile is derived. It never replaces a profile and
// two groups may attach to the same one.
// ==================================================================

/**
 * @typedef {object} FieldGroup
 * @property {string} id - Unique within the kind.
 * @property {string} module - Owning module id. Required: a group is by definition
 *                             contributed by someone other than the profile's owner.
 * @property {string} kind - The kind whose profiles it attaches to.
 * @property {string[]|'*'} appliesTo - Profile ids, or '*' for every profile of the kind.
 * @property {{id: string, label: string, default?: boolean}} option - The import option
 *                             gating the whole group. Its `id` is payload-visible, so it
 *                             is not renamed casually.
 * @property {string} [preamble] - Profile-level prompt text that does not reduce to
 *                             per-field guidance. Carrying it here is what lets a module
 *                             stop hosting prompt files anywhere.
 * @property {DeclarationField[]} fields
 * @property {object[]} [rules]
 */

/** @type {Map<string, FieldGroup>} */
const fieldGroups = new Map();

/**
 * Register a field group.
 * @param {FieldGroup} group
 * @returns {string} The registry key.
 */
export function registerFieldGroup(group) {
    if (!group || typeof group !== 'object') {
        throw new Error('A field group must be an object');
    }
    const kind = String(group.kind || '').trim();
    const id = String(group.id || '').trim();
    const module = String(group.module || '').trim();
    if (!kind) throw new Error('A field group requires a kind');
    if (!id) throw new Error(`Field group for kind "${kind}" requires an id`);
    // A group exists so a module can contribute to profiles it does not own, so it
    // must say who it is. Without it a failure cannot name whose fields are at fault.
    if (!module) throw new Error(`${kind}.${id}: a field group requires an owning module id`);

    const where = `${kind}.${id}`;
    if (group.appliesTo !== '*' && !Array.isArray(group.appliesTo)) {
        throw new Error(`${where}: appliesTo must be an array of profile ids or '*'`);
    }
    if (!group.option || typeof group.option !== 'object' || !String(group.option.id || '').trim()) {
        throw new Error(`${where}: a field group requires an option with an id`);
    }
    // Groups are validated exactly as a mapped profile's fields are: same paths,
    // same transforms, same rejections. A contributed field is not a lesser field.
    validateFields(group.fields, 'mapped', where);
    validateRules(group, where);

    const key = `${kind}.${id}`;
    if (fieldGroups.has(key)) {
        throw new Error(`${where}: a field group is already registered under this id`);
    }
    fieldGroups.set(key, group);
    return key;
}

/**
 * Every group attaching to one profile, in registration order.
 * @param {string} kindId
 * @param {string} profileId
 * @returns {FieldGroup[]}
 */
export function getFieldGroupsFor(kindId, profileId) {
    const kind = String(kindId || '').trim();
    const profile = String(profileId || '').trim();
    return [...fieldGroups.values()].filter(group => group.kind === kind
        && (group.appliesTo === '*' || group.appliesTo.includes(profile)));
}

/** Every registered field group, in registration order. */
export function listFieldGroups() {
    return [...fieldGroups.values()];
}
