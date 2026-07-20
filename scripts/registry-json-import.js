// ==================================================================
// JSON import registry — shared window, parse, and directory buttons
// ==================================================================

import { JsonImportWindow } from './window-json-import.js';
import { prepareJsonImportText } from './utility-json-import-prompts.js';

/** @type {Map<string, object>} */
const kinds = new Map();

/**
 * @typedef {object} JsonImportKind
 * @property {string} id
 * @property {boolean} [gmOnly=true]
 * @property {string} [buttonHtml]
 * @property {string} [headerSelector]
 * @property {string} idSuffix
 * @property {string} windowTitle
 * @property {string} headerTitle
 * @property {string} windowIcon
 * @property {object} [position]
 * @property {Array<{value: string, label: string, authoringModes?: string}>} [templateOptions]
 * @property {Array<{id: string, label: string, checked?: boolean, disabled?: boolean, showForTemplate?: string, authoringModes?: string}>} [promptCheckboxes]
 * @property {Array<{id: string, label: string, value?: string, showForTemplate?: string, authoringModes?: string, inputType?: 'text'|'select'|'textarea', fullWidth?: boolean, options?: Array<{value: string, label: string}>}>} [promptFields]
 * @property {(templateKey: string, promptOptions?: Record<string, string|boolean>) => Promise<string>} [onBuildPrompt] - Build and return the prompt text; the window delivers it (clipboard or text file).
 * @property {(templateKey: string, promptOptions?: Record<string, string|boolean>) => Promise<string>} [onBuildJsonTemplate] - Build a clean JSON-only hand-authoring template.
 * @property {(templateKey: string, promptOptions?: Record<string, string|boolean>) => Promise<string>} [onBuildAuthoringGuide] - Build a plain-text JSON template plus human authoring instructions.
 * @property {(entries: object[]) => Promise<unknown>} [onImport] - Legacy batch fallback for kinds not yet using onImportEntry.
 * @property {(entry: object) => Promise<unknown>} [onValidateEntry]
 * @property {(entry: object) => Promise<unknown>} [onImportEntry]
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
    kinds.set(id, kind);
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
    if (kind.id === 'item') return String(entry?.itemType || entry?.type || '').toLowerCase();
    if (kind.id === 'journal') return String(entry?.journaltype || '').toLowerCase();
    if (kind.id === 'rolltable') return String(entry?.results?.[0]?.resultType || '').toLowerCase();
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
 * Open JsonImportWindow for a registered kind.
 * @param {string} kindId
 */
export function openJsonImportWindow(kindId) {
    const kind = getJsonImportKind(kindId);
    if (!kind) {
        throw new Error(`Unknown JSON import kind: ${kindId}`);
    }

    const importerOrder = ['journal', 'actor', 'item', 'rolltable'];
    const importerKinds = [...kinds.values()].sort((left, right) => {
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
        templateOptions: kind.templateOptions ?? [],
        promptCheckboxes: kind.promptCheckboxes ?? [],
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
