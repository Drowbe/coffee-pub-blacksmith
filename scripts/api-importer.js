// ==================================================================
// ===== API-IMPORTER – Public interface for the JSON importer ======
// ==================================================================
// Thin wrapper over the JSON import registry. Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.importer
// The caller supplies onValidateEntry/onImportEntry, so Blacksmith
// never has to know a consuming module's data model.
// See documentation/api/api-importer.md for full method contracts.
// ==================================================================

import {
    registerJsonImportKind,
    getJsonImportKind,
    parseJsonImportPayload,
    openJsonImportWindow,
    attachJsonImportButton
} from './registry-json-import.js';

export class ImporterAPI {

    /** Register a JSON import kind. See the JsonImportKind typedef in registry-json-import.js. */
    static registerKind(kind) {
        return registerJsonImportKind(kind);
    }

    /** Look up a registered kind by id. */
    static getKind(kindId) {
        return getJsonImportKind(kindId);
    }

    /** Open the import window for a registered kind. */
    static openWindow(kindId) {
        return openJsonImportWindow(kindId);
    }

    /** Parse clipboard/file JSON into an array of entries. Throws on malformed input. */
    static parsePayload(jsonDataRaw) {
        return parseJsonImportPayload(jsonDataRaw);
    }

    /** Insert an Import button into a directory sidebar or compatible header. */
    static attachButton(html, kindId) {
        return attachJsonImportButton(html, kindId);
    }
}
