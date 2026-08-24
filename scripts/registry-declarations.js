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
 * @property {'selector'|'envelope'} [role] - `selector` picks the profile and does not land;
 *                             `envelope` is consumed into the document by a transform (passthrough form).
 * @property {string} [type] - 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'.
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
 * @property {Record<string,string>} [aliases] - Accepted spellings mapping onto a canonical VALUE.
 * @property {string[]} [acceptsKeys] - Other payload KEYS this field may arrive under. Distinct
 *                             from `aliases`: one renames the value, the other renames the field.
 * @property {string} [transform] - Named, Blacksmith-owned conversion. Never module code.
 * @property {string} [merge] - Array merge policy on re-import, e.g. 'unionBy:name'.
 * @property {DeclarationField[]} [fields] - Nested declaration for object / array-of-object fields.
 * @property {string} [requiresOption] - Option id that must be truthy for this field to appear
 *                             in authoring output.
 * @property {string} [guidance] - ONE sentence. Used for both the guide line and the prompt line,
 *                             so the two cannot drift.
 */

/**
 * @typedef {object} Declaration
 * @property {string} kind - Host kind id: 'item', 'journal', 'actor', 'rolltable'.
 * @property {string} id - Profile id, unique within the kind.
 * @property {string} label
 * @property {number} schemaVersion
 * @property {'mapped'|'rendered'|'passthrough'} form
 * @property {string} [module] - Owning module id. Absent means Blacksmith.
 * @property {object} document - { documentName, type }.
 * @property {DeclarationField[]} fields
 * @property {object[]} [rules] - Cross-field rules from the closed vocabulary.
 * @property {object} [ownership] - Per-profile ownership defaults. Never inherited from the kind:
 *                             a profile whose content is revealed deliberately must say so.
 */

const FORMS = new Set(['mapped', 'rendered', 'passthrough']);
const ROLES = new Set(['selector', 'envelope']);
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
function validateField(field, form, where) {
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
    // A mapped profile lands every field somewhere. The exceptions are explicit:
    // a selector picks the profile, an envelope is consumed by a transform.
    if (form === 'mapped' && !field.path && !field.role && !Array.isArray(field.fields)) {
        throw new Error(`${at}: a mapped profile requires a path, a role, or nested fields`);
    }
    if (field.absentMeans !== undefined && !ABSENT_MEANS.has(field.absentMeans)) {
        throw new Error(`${at}: absentMeans must be 'default' or 'preserve'`);
    }
    if (field.values !== undefined && !Array.isArray(field.values)) {
        throw new Error(`${at}: values must be an array`);
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
    if (field.acceptsKeys !== undefined) {
        if (!Array.isArray(field.acceptsKeys)) {
            throw new Error(`${at}: acceptsKeys must be an array`);
        }
        if (field.acceptsKeys.includes(name)) {
            throw new Error(`${at}: acceptsKeys must not repeat the field's own name`);
        }
    }
    if (field.authorable === false && field.example !== undefined) {
        throw new Error(`${at}: a non-authorable field cannot carry a template example`);
    }
    if (Array.isArray(field.fields)) {
        validateFields(field.fields, form, at);
    }
}

/**
 * @param {DeclarationField[]} fields
 * @param {string} form
 * @param {string} where
 */
function validateFields(fields, form, where) {
    if (!Array.isArray(fields)) {
        throw new Error(`${where}: fields must be an array`);
    }
    const seen = new Set();
    for (const field of fields) {
        validateField(field, form, where);
        const name = String(field.name).trim();
        if (seen.has(name)) {
            throw new Error(`${where}: duplicate field name "${name}"`);
        }
        seen.add(name);
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
