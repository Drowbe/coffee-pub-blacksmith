// ==================================================================
// JSON import registry — shared window, parse, and directory buttons
// ==================================================================

import { JsonImportWindow } from './window-json-import.js';
import { getDeclaration, getDeclarationsForKind, listFieldGroups } from './registry-declarations.js';
import { buildTemplateText, buildGuideText } from './manager-declarations.js';
import { prepareJsonImportText } from './utility-json-import-prompts.js';

/** @type {Map<string, object>} */
const kinds = new Map();

/**
 * @typedef {object} JsonImportKind
 * @property {string} id
 * @property {boolean} [gmOnly=true]
 * @property {string} [buttonHtml]
 * @property {string} [headerSelector]
 * @property {boolean} [showInSwitcher=true] - Whether this kind appears in the import window's importer dropdown.
 * @property {string} [switcherLabel]
 * @property {string} idSuffix
 * @property {string} windowTitle
 * @property {string} headerTitle
 * @property {string} windowIcon
 * @property {object} [position]
 * @property {Array<{value: string, label: string, authoringModes?: string}>} [templateOptions]
 *           The STATIC options only. Declared profiles are unioned in at render time --
 *           call `getTemplateOptions(kindId)` for the list a person actually sees.
 * @property {Array<{id: string, label: string, checked?: boolean, disabled?: boolean, showForTemplate?: string, authoringModes?: string}>} [promptCheckboxes]
 * @property {Array<{id: string, label: string, value?: string, showForTemplate?: string, authoringModes?: string, inputType?: 'text'|'select'|'textarea', fullWidth?: boolean, options?: Array<{value: string, label: string}>}>} [promptFields]
 * @property {(templateKey: string, promptOptions?: Record<string, string|boolean>) => Promise<string>} [onBuildPrompt] - Build and return the prompt text; the window delivers it (clipboard or text file).
 * @property {(templateKey: string, promptOptions?: Record<string, string|boolean>) => Promise<string>} [onBuildJsonTemplate] - Build a clean JSON-only hand-authoring template.
 * @property {(templateKey: string, promptOptions?: Record<string, string|boolean>) => Promise<string>} [onBuildAuthoringGuide] - Build a plain-text JSON template plus human authoring instructions.
 * @property {boolean} [composesOwnAuthoring] - True when the kind builds its own template and
 *   guide from the declaration rather than having them replaced, for authoring output carrying
 *   something a declaration cannot describe such as a live catalog.
 * @property {(entries: object[]) => Promise<unknown>} [onImport] - Legacy batch fallback for kinds not yet using onImportEntry.
 * @property {(entry: object) => Promise<unknown>} [onValidateEntry]
 * @property {(entry: object) => Promise<unknown>} [onImportEntry]
 * @property {(entry: object) => string} [onProfileName] - Which field on an entry names its profile. Defaults to `entry.type`.
 */

/**
 * Register a JSON import kind (item, roll table, etc.).
 * @param {JsonImportKind} kind
 */
export function registerJsonImportKind(kind) {
    const id = String(kind?.id || '').trim();
    if (!id) {
        throw new Error('JSON import kind requires an id');
    }
    kinds.set(id, routeAuthoringToDeclarations(kind));
}

/**
 * Return the descriptor with its template and guide builders routed: derived when a
 * declaration exists for the selected profile, the kind's own builder otherwise.
 *
 * WRAPPED AT REGISTRATION, not when the window opens. Routing only at open time meant
 * the window received derived output while anything reading `getKind(id)` -- a public
 * path -- got the old builder. Two ways to ask the same question returning different
 * answers is the exact defect this migration keeps finding, and it does not become
 * acceptable because we authored it.
 *
 * Routing is evaluated per call rather than at registration, so a kind declared after
 * it registers still routes.
 *
 * The PROMPT is deliberately not routed. It carries campaign context and creative
 * direction that declarations do not describe, so deriving it now would drop them;
 * template and guide reduce entirely to declared fields.
 *
 * @param {JsonImportKind} kind
 * @returns {JsonImportKind}
 */
function routeAuthoringToDeclarations(kind) {
    // A kind that COMPOSES its own authoring output is left alone. Replacing a
    // builder wholesale is right when everything it produces is derivable, and
    // wrong when it also carries something a declaration cannot describe -- the
    // Roll Table guide embeds a live catalog of real document names for an author
    // to pick from, and wrapping it would silently drop that. Such a kind calls
    // the derivation itself and appends what only it can supply, which is what the
    // Item prompt already does.
    if (kind.composesOwnAuthoring) return kind;

    const declared = (templateKey) => {
        const profile = String(templateKey ?? '').trim().toLowerCase();
        return profile ? getDeclaration(kind.id, profile) : null;
    };
    // Object.create rather than a spread: a spread EVALUATES getters, and kinds use
    // them for choices that must be read when the window opens rather than when the
    // module loads -- the item kind's promptCheckboxes getter asks whether Artificer
    // is active, which at registration time it may not yet be. Inheriting leaves every
    // getter lazy and untouched.
    return Object.create(kind, {
        onBuildJsonTemplate: { enumerable: true, value: async (templateKey, promptOptions = {}) => {
            const declaration = declared(templateKey);
            return declaration
                ? buildTemplateText(kind.id, declaration.id, promptOptions)
                : await kind.onBuildJsonTemplate?.(templateKey, promptOptions) ?? '';
        } },
        onBuildAuthoringGuide: { enumerable: true, value: async (templateKey, promptOptions = {}) => {
            const declaration = declared(templateKey);
            return declaration
                ? buildGuideText(kind.id, declaration.id, promptOptions)
                : await kind.onBuildAuthoringGuide?.(templateKey, promptOptions) ?? '';
        } }
    });
}

/**
 * @param {string} kindId
 * @returns {JsonImportKind|undefined}
 */
export function getJsonImportKind(kindId) {
    return kinds.get(String(kindId || '').trim());
}

/**
 * Parse clipboard/file JSON into an array of object entries.
 * @param {string} jsonDataRaw
 * @returns {object[]}
 */
export function parseJsonImportPayload(jsonDataRaw) {
    if (Array.isArray(jsonDataRaw)) {
        return jsonDataRaw;
    }
    if (typeof jsonDataRaw === 'object' && jsonDataRaw !== null) {
        return [jsonDataRaw];
    }

    const jsonData = prepareJsonImportText(jsonDataRaw);
    let parsed;
    try {
        parsed = JSON.parse(jsonData);
    } catch (e) {
        const hint = jsonData.includes('```')
            ? ' Remove markdown code fences (```) and paste raw JSON only.'
            : '';
        throw new Error(`Invalid JSON: ${e.message}.${hint}`);
    }
    if (Array.isArray(parsed)) {
        if (!parsed.length) {
            throw new Error('JSON array is empty');
        }
        for (const entry of parsed) {
            if (typeof entry !== 'object' || entry === null) {
                throw new Error('JSON array entries must be objects');
            }
        }
        return parsed;
    }
    if (typeof parsed === 'object' && parsed !== null) {
        return [parsed];
    }
    throw new Error('JSON must be an array or object');
}

/**
 * @param {JsonImportKind} kind
 * @param {string} jsonDataRaw
 * @returns {Promise<object>}
 */
function inputName(entry, index) {
    return String(entry?.name || entry?.itemName || entry?.tableName || entry?.title || `Entry ${index + 1}`);
}

function profileName(kind, entry) {
    // Each kind names its own profile field; a kind that does not supply
    // onProfileName falls back to the conventional `type`.
    if (typeof kind.onProfileName === 'function') {
        return String(kind.onProfileName(entry) || '').toLowerCase();
    }
    return String(entry?.type || '').toLowerCase();
}

function issueFromError(error, stage) {
    return {
        code: String(error?.code || `${stage.toUpperCase()}_FAILED`),
        stage,
        path: String(error?.path || ''),
        message: String(error?.message || error || 'Unknown error'),
        details: error?.details && typeof error.details === 'object' ? error.details : {}
    };
}

function normalizeIssues(issues, stage = 'validate') {
    return (Array.isArray(issues) ? issues : []).map(issue => {
        if (typeof issue === 'string') return { code: 'IMPORT_WARNING', stage, path: '', message: issue, details: {} };
        return {
            code: String(issue?.code || 'IMPORT_WARNING'), stage: String(issue?.stage || stage),
            path: String(issue?.path || ''), message: String(issue?.message || issue || 'Warning'),
            details: issue?.details && typeof issue.details === 'object' ? issue.details : {}
        };
    });
}

function summarize(operation, entries) {
    const succeeded = entries.filter(entry => entry.status === 'success').length;
    const warned = entries.filter(entry => entry.status === 'warning').length;
    const failed = entries.filter(entry => entry.status === 'error').length;
    const status = failed
        ? ((succeeded || warned) ? 'partial' : 'error')
        : (warned ? 'warning' : 'success');
    return { operation, status, processed: entries.length, succeeded, warned, failed, entries };
}

function parseFailure(operation, kind, error) {
    return summarize(operation, [{
        index: -1, status: 'error', inputName: 'JSON payload', kind: kind.id, profile: '',
        document: null, warnings: [], errors: [issueFromError(error, 'parse')], retryable: true
    }]);
}

function documentSummary(document) {
    if (!document || typeof document !== 'object') return null;
    return {
        uuid: String(document.uuid || ''),
        id: String(document.id || document._id || ''),
        name: String(document.name || ''),
        documentName: String(document.documentName || document.constructor?.documentName || ''),
        type: String(document.type || ''),
        destination: { type: document.pack ? 'compendium' : 'world', folderId: document.folder?.id || null, packId: document.pack || null }
    };
}

async function validateEntry(kind, entry, index) {
    const base = {
        index, inputName: inputName(entry, index), kind: kind.id, profile: profileName(kind, entry),
        document: null, warnings: [], errors: [], retryable: false
    };
    try {
        const outcome = typeof kind.onValidateEntry === 'function' ? await kind.onValidateEntry(entry) : null;
        const warnings = normalizeIssues(outcome?.validationWarnings, 'validate');
        return { ...base, status: warnings.length ? 'warning' : 'success', warnings };
    } catch (error) {
        return { ...base, status: 'error', errors: [issueFromError(error, 'validate')], retryable: true };
    }
}

export async function validateJsonImport(kind, jsonDataRaw) {
    let entries;
    try {
        entries = parseJsonImportPayload(jsonDataRaw);
    } catch (error) {
        return parseFailure('validate', kind, error);
    }
    return summarize('validate', await Promise.all(entries.map((entry, index) => validateEntry(kind, entry, index))));
}

export async function runJsonImport(kind, jsonDataRaw) {
    let entries;
    try {
        entries = parseJsonImportPayload(jsonDataRaw);
    } catch (error) {
        return parseFailure('import', kind, error);
    }
    const results = [];
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const validation = await validateEntry(kind, entry, index);
        if (validation.status === 'error') {
            results.push(validation);
            continue;
        }
        try {
            const created = typeof kind.onImportEntry === 'function'
                ? await kind.onImportEntry(entry)
                : await kind.onImport([entry]);
            const importWarnings = normalizeIssues(created?.importWarnings, 'postProcess');
            const createdValue = created?.document ? created.document : created;
            const documents = (Array.isArray(createdValue) ? createdValue : [createdValue]).filter(value => value && typeof value === 'object');
            const warnings = [...validation.warnings, ...importWarnings];
            results.push({ ...validation, status: warnings.length ? 'warning' : 'success', warnings, document: documentSummary(documents[0]), documents: documents.map(documentSummary).filter(Boolean) });
        } catch (error) {
            results.push({
                ...validation, status: 'error', document: null,
                errors: [issueFromError(error, 'create')], retryable: true
            });
        }
    }
    return summarize('import', results);
}

/**
 * Checkboxes for the options declared by field groups attaching to this kind.
 *
 * A group declares the option that gates it; without this nothing renders that
 * option, and the group's fields are gated by a control the user never sees. It
 * worked for the first group only because Blacksmith happened to hardcode a
 * checkbox with the same id -- which is the Artificer-shaped hole this whole
 * mechanism exists to close.
 *
 * A kind's own checkboxes win a duplicate id, so the hardcoded one still governs
 * until it is removed with the prompt work; a group does not get two checkboxes.
 *
 * @param {JsonImportKind} kind
 * @returns {Array<object>}
 */
/**
 * The kind's own template options, plus one for every DECLARED profile.
 *
 * A declaration was reaching construction, validation and routing while the
 * authoring UI knew nothing about it -- so a module could register a profile that
 * imported correctly and was invisible to anyone trying to AUTHOR a payload for
 * it. No template, no guide, no prompt: the three derived outputs that exist for
 * consumers, unreachable by consumers. Raised by the first satellite to register
 * one, who found their own profile missing from both dropdowns while a Blacksmith
 * legacy entry with the same id sat in one of them.
 *
 * The kind's static entries WIN a collision, because a kind still on its parser
 * needs its own entry to keep working while a declared profile of the same id is
 * being adopted. That is the state a handover passes through, and it should read
 * as one entry rather than two.
 *
 * `authoringModes` comes from the declaration and defaults to `json prompt`,
 * which is what a declared profile can genuinely offer: template and guide derive
 * from the declaration, and so does the prompt's schema section. A prompt-only
 * profile is a legacy shape rather than something a declaration produces.
 *
 * @param {object} kind
 * @returns {Array<{value: string, label: string, authoringModes: string}>}
 */
/**
 * What a kind actually OFFERS: its static options unioned with every profile
 * declared for it.
 *
 * Exported because the registration is not the rendered list, and asking the
 * registry for `getJsonImportKind(id).templateOptions` hands back only the
 * static half. That divergence is the recurring defect of this subsystem in
 * miniature -- two readers of one contract -- and it had already produced its
 * symptom: a declared profile imported correctly, appeared in the window, and
 * was invisible to anything that asked the registry what the kind offered.
 *
 * Callers that want the list a person sees call this. `getJsonImportKind`
 * remains the raw registration, which is honest about being the registration.
 *
 * @param {string} kindId
 * @returns {Array<{value: string, label: string, authoringModes: string}>}
 */
export function getTemplateOptions(kindId) {
    const kind = getJsonImportKind(kindId);
    return kind ? composeTemplateOptions(kind) : [];
}

function composeTemplateOptions(kind) {
    const stat = kind.templateOptions ?? [];
    const claimed = new Set(stat.map(one => String(one?.value ?? '')));
    const declared = getDeclarationsForKind(kind.id)
        .filter(declaration => !claimed.has(declaration.id))
        .map(declaration => ({
            value: declaration.id,
            label: declaration.label ?? declaration.id,
            authoringModes: declaration.authoringModes ?? 'json prompt'
        }));
    return [...stat, ...declared];
}

function groupOptionCheckboxes(kind) {
    const existing = new Set((kind.promptCheckboxes ?? []).map(one => one.id));
    const profiles = getDeclarationsForKind(kind.id).map(one => one.id);
    return listFieldGroups()
        .filter(group => group.kind === kind.id && !existing.has(group.option.id))
        .map((group) => {
            // Scope the checkbox to the profiles the group actually applies to, so a
            // group covering three of eight does not offer itself on the other five.
            const scoped = group.appliesTo === '*'
                ? null
                : group.appliesTo.filter(one => profiles.includes(one)).join(' ');
            return {
                id: group.option.id,
                label: group.option.label ?? group.option.id,
                checked: group.option.default === true,
                authoringModes: 'json prompt',
                ...(scoped ? { showForTemplate: scoped } : {})
            };
        });
}

/**
 * Open JsonImportWindow for a registered kind.
 * @param {string} kindId
 */
export function openJsonImportWindow(kindId) {
    const kind = getJsonImportKind(kindId);
    if (!kind) {
        throw new Error(`Unknown JSON import kind: ${kindId}`);
    }

    const importerOrder = ['journal', 'actor', 'item', 'rolltable'];
    // A kind may opt out of the switcher dropdown while still opening its own
    // window -- a consuming module's importer does not always belong in the
    // list a GM sees from the Item directory.
    const importerKinds = [...kinds.values()].filter(entry => entry.showInSwitcher !== false).sort((left, right) => {
        const leftIndex = importerOrder.indexOf(left.id);
        const rightIndex = importerOrder.indexOf(right.id);
        return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
            - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });

    void JsonImportWindow.open({
        idSuffix: kind.idSuffix ?? kind.id,
        windowTitle: kind.windowTitle ?? 'Import JSON',
        headerTitle: kind.headerTitle ?? kind.windowTitle ?? 'Import JSON',
        windowIcon: kind.windowIcon ?? 'fa-solid fa-file-import',
        selectedImporter: kind.id,
        importerOptions: importerKinds.map(entry => ({
            value: entry.id,
            label: entry.switcherLabel ?? entry.headerTitle?.replace(/^Import\s+/i, '') ?? entry.id
        })),
        onSwitchImporter: openJsonImportWindow,
        position: kind.position ?? { width: 920, height: 680 },
        templateOptions: composeTemplateOptions(kind),
        promptCheckboxes: [...(kind.promptCheckboxes ?? []), ...groupOptionCheckboxes(kind)],
        promptFields: kind.promptFields ?? [],
        journalAreaUi: kind.journalAreaUi ?? null,
        journalLocationUi: kind.journalLocationUi ?? null,
        onBuildPrompt: kind.onBuildPrompt,
        onBuildJsonTemplate: kind.onBuildJsonTemplate,
        onBuildAuthoringGuide: kind.onBuildAuthoringGuide,
        onValidate: async (jsonDataRaw) => validateJsonImport(kind, jsonDataRaw),
        onImport: async (jsonDataRaw) => {
            return runJsonImport(kind, jsonDataRaw);
        }
    });
}

/**
 * Insert an Import button on a directory sidebar (or compatible header).
 * @param {HTMLElement} html
 * @param {string} kindId
 */
export function attachJsonImportButton(html, kindId) {
    const kind = getJsonImportKind(kindId);
    if (!kind) {
        return;
    }
    if (kind.gmOnly !== false && !game.user.isGM) {
        return;
    }

    const button = document.createElement('button');
    button.innerHTML = kind.buttonHtml ?? '<i class="fa-solid fa-file-import"></i> Import';
    button.addEventListener('click', () => openJsonImportWindow(kindId));

    const selector = kind.headerSelector ?? '.header-actions.action-buttons';
    const headerActions = html.querySelector(selector);
    if (headerActions) {
        headerActions.insertBefore(button, headerActions.firstChild);
    }
}
