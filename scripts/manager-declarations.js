// ==================================================================
// ===== DECLARATION MANAGER - derivation from a declaration ========
// ==================================================================
// Everything a profile needs is derived here from its declaration:
// the JSON template today, and the authoring guide, prompt, validation,
// document construction and export as the build sequence proceeds
// (documentation/TODO.md, "Build sequence").
//
// Nothing in this file knows what an Item or a codex page is. It reads a
// declaration and emits, which is the whole point: a field added to a
// declaration reaches every output with no edit here.
// ==================================================================

import { getDeclaration, fieldAccepts } from './registry-declarations.js';
import { issue } from './utility-import-issues.js';
import { evaluateRules } from './manager-declaration-rules.js';

/**
 * Whether a field appears in authoring output at all.
 * A non-authorable field is real and is preserved across re-import, but a
 * user never types it -- an editor or a subsystem writes it.
 * @param {object} field
 * @returns {boolean}
 */
function isAuthorable(field) {
    // A const field is emitted, never typed. It belongs in the declaration so the
    // created document is fully described by it, but it is not part of the schema
    // an author fills in.
    if (field?.const !== undefined) return false;
    return field?.authorable !== false;
}

/**
 * Whether an option gate lets this field through.
 *
 * `requiresOption` names an option that must be truthy -- an opt-in block such as
 * a module's flag namespace. The opposite gate (present unless explicitly switched
 * off, which is how passive effects behave) arrives with the equipment profile in
 * step 4; there is no profile needing it yet and inventing it now would be a guess.
 * @param {object} field
 * @param {Record<string, unknown>} options
 * @returns {boolean}
 */
function isShown(field, options) {
    // Opt-in: an option that must be truthy, such as a module's flag namespace.
    if (field?.requiresOption) return Boolean(options?.[field.requiresOption]);
    // Opt-out: present unless explicitly switched off. Passive effects behave this
    // way -- the current builder emits them unless includePassiveEffects === false.
    if (field?.suppressedByOption) return options?.[field.suppressedByOption] !== false;
    return true;
}

/**
 * The value a field contributes to the JSON template.
 *
 * `example` and `default` are deliberately separate. `default` is what import
 * applies when the field is absent; `example` is starter content a person edits.
 * They diverge more often than they agree -- the price field's default is a
 * parsed `{value, denomination}` while its template example is the string
 * `"0 GP"` a user is meant to type over.
 * @param {object} field
 * @returns {*}
 */
function templateValue(field) {
    if (field.example !== undefined) return field.example;
    if (field.default !== undefined) return field.default;
    if (Array.isArray(field.fields)) return field.type === 'array' ? [] : {};
    switch (field.type) {
        case 'array': return [];
        case 'object': return {};
        case 'boolean': return false;
        case 'number':
        case 'integer': return 0;
        default: return '';
    }
}

/**
 * Build the JSON-only starter template for one profile.
 *
 * Field order is declaration order, so a declaration reads in the same order as
 * the template it produces and a reviewer can diff the two by eye.
 * @param {string} kindId
 * @param {string} profileId
 * @param {Record<string, unknown>} [options] - Option values gating `requiresOption` fields.
 * @returns {object} The template as a plain object; callers stringify.
 */
export function buildTemplateObject(kindId, profileId, options = {}) {
    const declaration = getDeclaration(kindId, profileId);
    if (!declaration) {
        throw new Error(`No declaration registered for ${kindId}.${profileId}`);
    }
    const data = {};
    for (const field of declaration.fields) {
        if (!isAuthorable(field) || !isShown(field, options)) continue;
        data[field.name] = templateValue(field);
    }
    return data;
}

/**
 * The same template as formatted JSON text, which is what the window delivers.
 * @param {string} kindId
 * @param {string} profileId
 * @param {Record<string, unknown>} [options]
 * @returns {string}
 */
export function buildTemplateText(kindId, profileId, options = {}) {
    return JSON.stringify(buildTemplateObject(kindId, profileId, options), null, 2);
}

/**
 * Every authorable field name a profile exposes, in declaration order.
 * Used by the harness to assert the template carries the whole surface.
 * @param {string} kindId
 * @param {string} profileId
 * @param {Record<string, unknown>} [options]
 * @returns {string[]}
 */
export function authorableFieldNames(kindId, profileId, options = {}) {
    const declaration = getDeclaration(kindId, profileId);
    if (!declaration) return [];
    return declaration.fields
        .filter(field => isAuthorable(field) && isShown(field, options))
        .map(field => field.name);
}

// ==================================================================
// ===== VALIDATION =================================================
// ==================================================================
// Derived from the declaration, which is what finally populates the
// structured error envelope. Every kind throws a bare `Error` today, so
// `code` is permanently VALIDATE_FAILED and `path` is always blank. A
// declared field that fails its declared type already knows its own path,
// and a named check already knows its own code -- so the envelope stops
// being something a profile has to opt into by throwing richly.
//
// STEP 2 IS SHAPE ONLY. Transforms run at construction (step 3), so a
// value this accepts may still fail conversion. That is deliberate: the
// two stages are separate in the pipeline and collapsing them here would
// re-create the double-conversion the callback importer had.
// ==================================================================

/**
 * The payload key a field reads, and whether it came from an accepted alias.
 *
 * Key aliases are NOT value aliases. `values`/`aliases` normalise what a field
 * holds; `acceptsKeys` names other keys the field may arrive under, which is how
 * `name` still works where the schema says `itemName`. Conflating the two costs a
 * compatibility path, so they are separate properties.
 * @param {object} field
 * @param {object} entry
 * @returns {{key: string|null, aliased: boolean}}
 */
function sourceKey(field, entry) {
    if (Object.prototype.hasOwnProperty.call(entry, field.name)) {
        return { key: field.name, aliased: false };
    }
    for (const alias of field.acceptsKeys ?? []) {
        if (Object.prototype.hasOwnProperty.call(entry, alias)) {
            return { key: alias, aliased: true };
        }
    }
    return { key: null, aliased: false };
}

/**
 * Normalise an authored value onto its canonical form via the field's value aliases.
 * @param {object} field
 * @param {*} value
 * @returns {*}
 */
export function normalizeValue(field, value) {
    if (typeof value !== 'string' || !field.aliases) return value;
    const token = value.trim().toLowerCase();
    for (const [alias, target] of Object.entries(field.aliases)) {
        if (alias.toLowerCase() === token) return target;
    }
    return value;
}

/**
 * Validate one entry against a profile's declaration. Shape only; no documents,
 * no transforms, no world access.
 * @param {string} kindId
 * @param {string} profileId
 * @param {object} entry
 * @returns {{status: 'success'|'warning'|'error', errors: object[], warnings: object[]}}
 */
export function validateEntry(kindId, profileId, entry) {
    const declaration = getDeclaration(kindId, profileId);
    if (!declaration) {
        return {
            status: 'error',
            errors: [issue('UNKNOWN_PROFILE', '', `No declaration registered for ${kindId}.${profileId}`)],
            warnings: []
        };
    }
    const errors = [];
    const warnings = [];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return {
            status: 'error',
            errors: [issue('NOT_AN_OBJECT', '', 'An entry must be a JSON object')],
            warnings: []
        };
    }

    const claimed = new Set();
    for (const field of declaration.fields) {
        const { key, aliased } = sourceKey(field, entry);
        if (key) claimed.add(key);

        if (key === null) {
            if (field.required) {
                errors.push(issue('REQUIRED_FIELD_MISSING', field.name,
                    `${field.name} is required.`));
            }
            continue;
        }
        // A field the author is not meant to write. Not fatal -- it is dropped or
        // preserved rather than applied -- but silence here is how discovery state
        // gets wiped by a payload that looked accepted.
        if (field.authorable === false) {
            warnings.push(issue('FIELD_NOT_AUTHORABLE', key,
                `${key} is maintained by Blacksmith and is ignored on import.`));
            continue;
        }
        if (aliased) {
            warnings.push(issue('DEPRECATED_KEY', key,
                `${key} is accepted for compatibility; the current name is ${field.name}.`,
                { canonical: field.name }));
        }

        const raw = entry[key];
        if (raw === undefined) continue;
        // null is only skipped when the field does not treat it as a value; a
        // nullable field validates it like anything else.
        if (raw === null && field.nullable !== true) continue;

        if (field.type && !fieldAccepts(field, raw)) {
            errors.push(issue('TYPE_MISMATCH', key,
                `${key} must be of type ${field.type}.`,
                { expected: field.type, actual: Array.isArray(raw) ? 'array' : typeof raw }));
            continue;
        }
        if (Array.isArray(field.values)) {
            const normalized = normalizeValue(field, raw);
            if (!field.values.includes(normalized)) {
                errors.push(issue('VALUE_NOT_ALLOWED', key,
                    `${key} must be one of: ${field.values.join(', ')}.`,
                    { allowed: field.values, actual: raw }));
            }
        }
    }

    // Cross-field rules run only once every field is individually sound: a rule
    // about two fields cannot say anything useful while one of them is the wrong
    // type, and reporting both would bury the cause under the consequence.
    if (!errors.length) {
        errors.push(...evaluateRules(declaration, entry));
    }

    // Anything the profile does not declare is reported rather than dropped in
    // silence. The current importer ignores unknown keys entirely, so an author
    // who misspells a field gets a successful import that did nothing.
    for (const key of Object.keys(entry)) {
        if (!claimed.has(key)) {
            warnings.push(issue('UNKNOWN_FIELD', key,
                `${key} is not part of the ${declaration.label} schema and is ignored.`));
        }
    }

    return {
        status: errors.length ? 'error' : (warnings.length ? 'warning' : 'success'),
        errors,
        warnings
    };
}

// ==================================================================
// ===== CONSTRUCTION ===============================================
// ==================================================================
// Declaration plus entry, into document source data. Blacksmith builds
// the document; a profile shapes its own data and never calls create.
// That is what makes destination, permissions, rollback, gmNotes
// preservation and type preservation enforceable in one place.
// ==================================================================

/**
 * Write `value` at a dotted path, creating intermediate objects. Arrays are
 * assigned whole rather than indexed into -- a declared array field owns its
 * value, and per-element merging is a `merge` policy rather than a path concern.
 * @param {object} target
 * @param {string} path
 * @param {*} value
 */
function writePath(target, path, value) {
    const parts = String(path).split('.');
    let node = target;
    for (let index = 0; index < parts.length - 1; index++) {
        const part = parts[index];
        if (typeof node[part] !== 'object' || node[part] === null || Array.isArray(node[part])) {
            node[part] = {};
        }
        node = node[part];
    }
    node[parts[parts.length - 1]] = value;
}

/**
 * Merge module-owned flag namespaces without interpreting any of them. This is
 * the seam that lets a sibling carry its own data on a Blacksmith-built
 * document -- Artificer's block rides here, and a declared subtype's would too.
 * @param {object} target
 * @param {object} namespaces
 */
function mergeNamespaces(target, namespaces) {
    if (!namespaces || typeof namespaces !== 'object' || Array.isArray(namespaces)) return;
    target.flags = target.flags || {};
    for (const [namespace, data] of Object.entries(namespaces)) {
        if (!namespace || data == null || typeof data !== 'object') continue;
        target.flags[namespace] = foundry.utils.mergeObject(
            target.flags[namespace] || {}, data, { inplace: false });
    }
}

/**
 * Build document source data for one entry from its declaration.
 *
 * Absent fields fall back to `default`; a field with neither a value nor a
 * default is OMITTED rather than written as undefined, because dnd5e treats a
 * missing key and an explicitly-undefined one differently on create.
 *
 * @param {string} kindId
 * @param {string} profileId
 * @param {object} entry
 * @returns {Promise<object>} Document source data, ready for create.
 */
export async function buildDocumentData(kindId, profileId, entry) {
    const declaration = getDeclaration(kindId, profileId);
    if (!declaration) {
        throw new Error(`No declaration registered for ${kindId}.${profileId}`);
    }
    // Imported lazily so template derivation and validation stay free of Foundry:
    // the transforms reach const.js, which fetches module.json at load. Those two
    // therefore run headlessly outside Foundry; construction does not, and is
    // proven by the harness against the parser it replaces.
    const { applyTransform } = await import('./manager-declaration-transforms.js');

    const data = {};
    if (declaration.document?.type) data.type = declaration.document.type;

    for (const field of declaration.fields) {
        if (field.const !== undefined) {
            if (field.path) writePath(data, field.path, foundry.utils.deepClone(field.const));
            continue;
        }
        // A selector picks the profile; an input is read by another field's transform.
        // Neither lands, and both are still authored, validated and templated.
        if (field.role === 'selector' || field.role === 'input') continue;

        const { key } = sourceKey(field, entry);
        const supplied = key === null ? undefined : entry[key];
        const hasValue = supplied !== undefined && supplied !== null;

        // `preserve` means an absent field leaves whatever is on the document
        // alone, so present-but-empty can still clear it. Nothing to write here.
        if (!hasValue && field.absentMeans === 'preserve') continue;

        let value = hasValue ? normalizeValue(field, supplied) : field.default;

        if (field.transform) {
            value = await applyTransform(field.transform, value, { entry, field, declaration });
        }
        if (value === undefined) continue;

        if (field.merge === 'mergeNamespaces') {
            mergeNamespaces(data, value);
            continue;
        }
        if (field.path) writePath(data, field.path, value);
    }

    // After every field, never before: a derivation reads what construction
    // produced -- the guessed icon, the normalised range units -- none of which
    // exists while the raw entry is all there is.
    if (declaration.derive?.length) {
        const { applyDerivations } = await import('./manager-declaration-derivations.js');
        return await applyDerivations(declaration.derive, data, entry);
    }
    return data;
}

/**
 * Shape validation plus a dry conversion, without creating anything.
 *
 * `validateEntry` above is deliberately pure and synchronous, which is what keeps
 * it assertable outside Foundry. It cannot see a failure that belongs to a
 * transform -- an unparseable price is well-shaped as a string and only fails
 * when converted. Leaving it there would mean Validate passes and Import fails,
 * so the author learns at the worst moment; `plan-importer-api.md` specifies that
 * validation performs conversion checks, and this is where they run.
 *
 * Nothing is created. The converted data is discarded; only its failure matters.
 * @param {string} kindId
 * @param {string} profileId
 * @param {object} entry
 * @returns {Promise<{status: string, errors: object[], warnings: object[]}>}
 */
export async function validateEntryDeep(kindId, profileId, entry) {
    const shape = validateEntry(kindId, profileId, entry);
    if (shape.status === 'error') return shape;
    try {
        await buildDocumentData(kindId, profileId, entry);
    } catch (error) {
        const raised = error?.issue
            ?? issue('CONVERT_FAILED', '', String(error?.message || error), {}, 'convert');
        return { status: 'error', errors: [raised], warnings: shape.warnings };
    }
    return shape;
}
