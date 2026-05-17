// ==================================================================
// JSON import registry — shared window, parse, and directory buttons
// ==================================================================

import { JsonImportWindow } from './window-json-import.js';
import { normalizeStraightQuotesForJson } from './utility-json-import-prompts.js';

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
 * @property {Array<{value: string, label: string}>} [templateOptions]
 * @property {(templateKey: string) => Promise<void>} [onCopyTemplate]
 * @property {(entries: object[]) => Promise<boolean>} onImport
 * @property {(error: Error) => boolean} [onImportError]
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
    const jsonData = normalizeStraightQuotesForJson(jsonDataRaw);
    const parsed = JSON.parse(jsonData);
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
 * @returns {Promise<boolean>}
 */
export async function runJsonImport(kind, jsonDataRaw) {
    const entries = parseJsonImportPayload(jsonDataRaw);
    return kind.onImport(entries);
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

    void JsonImportWindow.open({
        idSuffix: kind.idSuffix ?? kind.id,
        windowTitle: kind.windowTitle ?? 'Import JSON',
        headerTitle: kind.headerTitle ?? kind.windowTitle ?? 'Import JSON',
        windowIcon: kind.windowIcon ?? 'fa-solid fa-file-import',
        position: kind.position ?? { width: 920, height: 680 },
        templateOptions: kind.templateOptions ?? [],
        onCopyTemplate: kind.onCopyTemplate,
        onImport: async (jsonDataRaw) => {
            try {
                return await runJsonImport(kind, jsonDataRaw);
            } catch (e) {
                if (typeof kind.onImportError === 'function') {
                    return kind.onImportError(e);
                }
                throw e;
            }
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
