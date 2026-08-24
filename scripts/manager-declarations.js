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

import { getDeclaration } from './registry-declarations.js';

/**
 * Whether a field appears in authoring output at all.
 * A non-authorable field is real and is preserved across re-import, but a
 * user never types it -- an editor or a subsystem writes it.
 * @param {object} field
 * @returns {boolean}
 */
function isAuthorable(field) {
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
    if (!field?.requiresOption) return true;
    return Boolean(options?.[field.requiresOption]);
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
