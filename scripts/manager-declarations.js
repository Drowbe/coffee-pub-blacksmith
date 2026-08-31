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

import { getDeclaration, getDeclarationsForKind, getFieldGroupsFor, fieldAccepts } from './registry-declarations.js';
import { issue } from './utility-import-issues.js';
import { evaluateRules, referenceHolds, ruleSentences } from './manager-declaration-rules.js';

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
/**
 * The fields a profile derives from: its own, plus every group attaching to it.
 *
 * ONE composed list rather than a profile's own, because a contributed field must
 * be indistinguishable from a declared one everywhere downstream -- template, guide,
 * prompt, validation and construction. Anywhere that reads `declaration.fields`
 * directly is a place a group would be silently dropped.
 *
 * A group's fields come last so a profile's own always win a name collision; the
 * host owns its schema and a contributor cannot redefine it out from under it.
 * @param {object} declaration
 * @returns {object[]}
 */
export function effectiveFields(declaration) {
    return effectiveDeclaration(declaration).fields;
}

/**
 * The profile as everything downstream should see it: its own fields and rules,
 * plus every group's.
 *
 * Composed as a whole DECLARATION rather than as two lists, because a group's
 * rules have to be evaluated against a field set that includes the group's fields
 * -- rule evaluation resolves key aliases by looking a field up by name, so a rule
 * over a contributed field cannot be checked against the host's fields alone.
 * Composing fields and rules separately produced exactly that: the group's fields
 * appeared in the template and its rules silently never fired.
 * @param {object} declaration
 * @returns {object}
 */
export function effectiveDeclaration(declaration, entry = null) {
    let groups = getFieldGroupsFor(declaration.kind, declaration.id);
    // When there is an ENTRY, a group applies only if the payload engages it.
    //
    // Authoring gates on an import option a person ticks; validation and
    // construction see only JSON and have no options to consult. Inferring from the
    // payload is the only honest answer, and getting this wrong is not subtle: with
    // every group always in play, a group's `required` field is demanded of every
    // item of the kind -- a plain weapon failed for want of an Artificer type.
    //
    // Engaged means the entry carries at least one of the group's fields. A partial
    // group is then a genuine error and reported as one, which is the behaviour
    // wanted: half an Artificer block is a mistake, none of it is not.
    if (entry) {
        groups = groups.filter(group => group.fields.some(field =>
            Object.prototype.hasOwnProperty.call(entry, field.name)
            || (field.acceptsKeys ?? []).some(alias =>
                Object.prototype.hasOwnProperty.call(entry, alias))));
    }
    if (!groups.length) return declaration;
    const own = new Set(declaration.fields.map(field => field.name));
    return {
        ...declaration,
        fields: [
            ...declaration.fields,
            ...groups.flatMap(group => group.fields
                .filter(field => !own.has(field.name))
                // The group's option gates every field it contributes, so a module
                // declares the gate once rather than repeating it on each field.
                .map(field => ({ ...field, requiresOption: field.requiresOption ?? group.option.id })))
        ],
        rules: [...(declaration.rules ?? []), ...groups.flatMap(group => group.rules ?? [])]
    };
}

function isShown(field, options) {
    // Opt-in: an option that must be truthy, such as a module's flag namespace.
    if (field?.requiresOption) return Boolean(options?.[field.requiresOption]);
    // Opt-out: present unless explicitly switched off. Passive effects behave this
    // way -- the current builder emits them unless includePassiveEffects === false.
    if (field?.suppressedByOption) return options?.[field.suppressedByOption] !== false;
    return true;
}

/**
 * Whether a field's `requiresWhen` gate holds for a given entry.
 *
 * Distinct from the option gates above: those key on something a person ticks in
 * the window, this keys on another FIELD's value. Artificer's Process fields are
 * the case -- four fields that exist only when `artificerFamily` is `Process` and
 * are meaningless on anything else.
 *
 * It reuses the rule vocabulary's `field:value` reference rather than inventing a
 * second way to say the same thing.
 * @param {object} field
 * @param {object} declaration
 * @param {object} entry
 * @returns {boolean}
 */
function gateHolds(field, declaration, entry) {
    if (!field?.requiresWhen) return true;
    return referenceHolds(entry ?? {}, declaration, field.requiresWhen);
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
    // Nested fields come BEFORE `default`: a declared shape produces one worked
    // element, which is a far better starting point than an empty array. The old
    // builder hand-maintained a 30-field example activity for exactly this reason;
    // deriving it means the example cannot drift from what validation accepts.
    if (Array.isArray(field.fields)) {
        const element = {};
        for (const nested of field.fields) {
            if (!isAuthorable(nested)) continue;
            element[nested.name] = templateValue(nested);
        }
        return field.type === 'array' ? [element] : element;
    }
    if (field.default !== undefined) return field.default;
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
    for (const field of effectiveFields(declaration)) {
        if (!isAuthorable(field) || !isShown(field, options)) continue;
        // A value-gated field is OMITTED from the template. A template is a single
        // starting point with no entry to test the gate against, so including one
        // produces a contradictory example -- a Plant component carrying the fields
        // that only exist on a Process, which the profile's own rules forbid. The
        // guide and prompt state the condition instead, which is where a condition
        // can actually be expressed.
        if (field.requiresWhen) continue;
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
    return effectiveFields(declaration)
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

    const composed = effectiveDeclaration(declaration, entry);
    const claimed = new Set();
    for (const field of composed.fields) {
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
        errors.push(...evaluateRules(composed, entry));
    }

    // Every undeclared key, in ONE warning rather than one warning each.
    //
    // `buildItemJsonTemplate` emits a single field set for all eight Item profiles,
    // so every payload authored from a template -- our own shipped fixtures included
    // -- carries fields its profile does not read. Reporting them individually
    // produced nine warnings on a stock Equipment fixture and read as a failure.
    //
    // An earlier attempt split them by whether a sibling profile declared the field.
    // That was too clever: it made the message depend on which profiles happened to
    // be declared yet, and two of the fields (the image-generation hints) belong to
    // no profile at all and never will. One line names them all, a typo included,
    // and the noise goes away for good at step 5 when templates are derived per
    // profile and the residue stops being generated.
    const undeclared = Object.keys(entry).filter(key => !claimed.has(key));
    if (undeclared.length) {
        warnings.push(issue('UNKNOWN_FIELDS', '',
            `${undeclared.length} field${undeclared.length === 1 ? '' : 's'} not part of the `
            + `${declaration.label} schema, ignored: ${undeclared.join(', ')}.`,
            { fields: undeclared }));
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

    const composed = effectiveDeclaration(declaration, entry);
    for (const field of composed.fields) {
        if (!gateHolds(field, composed, entry)) continue;
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

// ==================================================================
// ===== AUTHORING GUIDE ============================================
// ==================================================================

/**
 * The rules an authoring output should state, given the options in force.
 *
 * Authoring is gated by the OPTION a person ticks, while validation is gated by
 * what the payload engages -- so the two need different rule sets from the same
 * declaration. Using the validation set for authoring put a contributing module's
 * rules into a prompt whose fields had been switched off, leaving the generator
 * told about constraints on fields it was never given. A rule about something
 * absent is the same defect as a rule that can never fire, in the other direction.
 *
 * @param {object} declaration
 * @param {Record<string, unknown>} options
 * @returns {string[]}
 */
function authoringRuleSentences(declaration, options) {
    const groups = getFieldGroupsFor(declaration.kind, declaration.id)
        .filter(group => isShown({ requiresOption: group.option.id }, options));
    return ruleSentences({
        ...declaration,
        rules: [...(declaration.rules ?? []), ...groups.flatMap(group => group.rules ?? [])]
    });
}

/**
 * One guide line for a field: its name, what it accepts, and its sentence.
 * @param {object} field
 * @returns {string}
 */
function guideLine(field) {
    const notes = [];
    if (field.required) notes.push('required');
    if (Array.isArray(field.values) && field.values.length) {
        notes.push(`one of: ${field.values.map(one => (one === '' ? '""' : String(one))).join(', ')}`);
    }
    if (field.acceptsKeys?.length) notes.push(`also accepts: ${field.acceptsKeys.join(', ')}`);
    if (field.requiresWhen) notes.push(`only when ${field.requiresWhen.replace(':', ' is ')}`);
    const suffix = notes.length ? ` (${notes.join('; ')})` : '';
    return `- ${field.name}${suffix}: ${field.guidance ?? ''}`.trimEnd();
}

/**
 * The human authoring guide for a profile: the same template, plus what every
 * field means and every rule requires.
 *
 * Derived rather than written, because the hand-written guide it replaces drifted
 * from the code in both directions -- it documented fields the parser never read,
 * and omitted rules the parser enforced. A guide and a validator that disagree is
 * worse than no guide, because the reader believes it.
 *
 * @param {string} kindId
 * @param {string} profileId
 * @param {Record<string, unknown>} [options]
 * @returns {string}
 */
export function buildGuideText(kindId, profileId, options = {}) {
    const declaration = getDeclaration(kindId, profileId);
    if (!declaration) {
        throw new Error(`No declaration registered for ${kindId}.${profileId}`);
    }
    const composed = effectiveDeclaration(declaration);
    const shown = composed.fields.filter(field => isAuthorable(field) && isShown(field, options));

    const sections = [
        `BLACKSMITH ${String(declaration.label).toUpperCase()} AUTHORING GUIDE`,
        '',
        'The JSON block below is a valid starter template. Edit it, then paste only the',
        'JSON object into the Import JSON tab. JSON has no comments -- do not add any.',
        '',
        buildTemplateText(kindId, profileId, options),
        '',
        'Fields',
        ...shown.map(guideLine)
    ];

    const sentences = authoringRuleSentences(declaration, options);
    if (sentences.length) {
        sections.push('', 'Rules', ...sentences.map(one => `- ${one}`));
    }

    // A contributing module's profile-level argument, which does not reduce to
    // per-field guidance. Carrying it here is what lets a module stop hosting
    // prompt text of its own.
    const preambles = getFieldGroupsFor(declaration.kind, declaration.id)
        .filter(group => group.preamble && isShown({ requiresOption: group.option.id }, options))
        .map(group => group.preamble);
    if (preambles.length) sections.push('', ...preambles);

    sections.push(
        '',
        'Before importing',
        '- No trailing commas, no duplicate keys.',
        '- Keep numbers, booleans, null, arrays and objects as their JSON types; do not quote them.',
        '- Every field above is one this profile reads. Anything else is reported and ignored.'
    );
    return sections.join('\n');
}

/**
 * The schema section of a generation prompt: every field, every rule, and a
 * template to fill in.
 *
 * The same content as the authoring guide in the register a generator reads --
 * ALL-CAPS types and explicit requiredness rather than prose. Derived from the
 * same declaration, so the prompt cannot ask for a shape validation rejects,
 * which is exactly what the hand-maintained prompt parts had drifted into: a
 * profile part advertising activity types the converter refuses, and a template
 * offering a spell four limited-uses fields the parser never read.
 *
 * This is the DERIVABLE half of a prompt. Framing, campaign context and creative
 * direction are not described by a declaration and stay authored; a caller
 * composes the two.
 *
 * @param {string} kindId
 * @param {string} profileId
 * @param {Record<string, unknown>} [options]
 * @returns {string}
 */
export function buildPromptSchemaText(kindId, profileId, options = {}) {
    const declaration = getDeclaration(kindId, profileId);
    if (!declaration) {
        throw new Error(`No declaration registered for ${kindId}.${profileId}`);
    }
    const composed = effectiveDeclaration(declaration);
    const shown = composed.fields.filter(field => isAuthorable(field) && isShown(field, options));

    const describe = (field) => {
        const type = String(field.type ?? 'string').toUpperCase();
        const required = field.required ? ' (REQUIRED)' : '';
        const bits = [`${field.name.toUpperCase()}: (${type})${required} ${field.guidance ?? ''}`.trim()];
        if (Array.isArray(field.values) && field.values.length) {
            bits.push(`  Allowed: ${field.values.map(one => (one === '' ? '""' : String(one))).join(', ')}.`);
        }
        if (field.requiresWhen) {
            bits.push(`  Include only when ${field.requiresWhen.replace(':', ' is ')}.`);
        }
        return bits.join('\n');
    };

    const sections = [
        '========================================',
        `IMPORT PROFILE: ${String(declaration.label).toUpperCase()}`,
        '========================================',
        '',
        'Every field below belongs to this profile. Do not invent field names, and do',
        'not carry over fields from another profile -- they are ignored on import.',
        '',
        'FIELDS',
        '',
        ...shown.map(describe)
    ];

    const sentences = authoringRuleSentences(declaration, options);
    if (sentences.length) {
        sections.push('', 'RULES -- output that breaks one of these is rejected on import', '',
            ...sentences.map(one => `- ${one}`));
    }

    const preambles = getFieldGroupsFor(declaration.kind, declaration.id)
        .filter(group => group.preamble && isShown({ requiresOption: group.option.id }, options))
        .map(group => group.preamble);
    if (preambles.length) sections.push('', ...preambles);

    sections.push('', 'JSON TEMPLATE', '', buildTemplateText(kindId, profileId, options));
    return sections.join('\n');
}
