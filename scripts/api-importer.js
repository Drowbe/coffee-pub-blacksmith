// ==================================================================
// ===== API-IMPORTER – Public interface for the JSON importer ======
// ==================================================================
// Consumed via:
//   game.modules.get('coffee-pub-blacksmith')?.api?.importer
// See documentation/api/api-importer.md for full method contracts.
//
// TWO SURFACES LIVE HERE DURING THE MIGRATION.
//
//   Declarations (below, first) are the direction. A profile registers its
//   SHAPE as data and Blacksmith derives the template, guide, prompt,
//   validation, document construction and export from it.
//
//   The kind registry (second) is the shipped callback surface being
//   replaced. It stays until every Blacksmith kind has moved, because the
//   importer has to keep working throughout. Do not build new consumers on
//   it -- see documentation/TODO.md, "Build sequence".
//
// Blacksmith is consumer zero: our own profiles call exactly these
// functions, with no internal back door and no privileged fields.
// ==================================================================

import {
    registerJsonImportKind,
    getJsonImportKind,
    parseJsonImportPayload,
    openJsonImportWindow,
    attachJsonImportButton
} from './registry-json-import.js';
import {
    registerDeclaration,
    getDeclaration,
    getDeclarationsForKind,
    listDeclarations
} from './registry-declarations.js';
import { buildTemplateText, buildTemplateObject } from './manager-declarations.js';

export class ImporterAPI {

    // ---------- Declarations ----------

    /**
     * Register a profile declaration. Throws, naming the offending field, when the
     * declaration is malformed -- a bad declaration fails here rather than at import.
     * See the Declaration typedef in registry-declarations.js.
     */
    static registerDeclaration(declaration) {
        return registerDeclaration(declaration);
    }

    /** Look up one registered declaration. */
    static getDeclaration(kindId, profileId) {
        return getDeclaration(kindId, profileId);
    }

    /** Every declaration registered against one kind, in registration order. */
    static getDeclarationsForKind(kindId) {
        return getDeclarationsForKind(kindId);
    }

    /** Every registered declaration, in registration order. */
    static listDeclarations() {
        return listDeclarations();
    }

    /** The derived JSON authoring template for a profile, as formatted text. */
    static getJsonTemplate(kindId, profileId, options = {}) {
        return buildTemplateText(kindId, profileId, options);
    }

    /** The same template as a plain object, for callers that would only re-parse it. */
    static getJsonTemplateObject(kindId, profileId, options = {}) {
        return buildTemplateObject(kindId, profileId, options);
    }

    // ---------- Kind registry (being replaced) ----------

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
