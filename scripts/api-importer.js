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
    listDeclarations,
    registerFieldGroup,
    getFieldGroupsFor,
    listFieldGroups
} from './registry-declarations.js';
import {
    buildTemplateText,
    buildTemplateObject,
    buildGuideText,
    validateEntry,
    validateEntryDeep,
    buildDocumentData,
    buildDocumentUpdate
} from './manager-declarations.js';

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

    /**
     * Register a field group: fields a module contributes to profiles it does not own.
     *
     * For content whose fields are orthogonal to the host's type -- an Artificer item is
     * a loot, or a consumable, or a tool, WITH their fields added. Registering a profile
     * would compete with the host's rather than compose with it. See the FieldGroup
     * typedef in registry-declarations.js.
     */
    static registerFieldGroup(group) {
        return registerFieldGroup(group);
    }

    /** Every group attaching to one profile, in registration order. */
    static getFieldGroupsFor(kindId, profileId) {
        return getFieldGroupsFor(kindId, profileId);
    }

    /** Every registered field group. */
    static listFieldGroups() {
        return listFieldGroups();
    }

    /** The derived JSON authoring template for a profile, as formatted text. */
    static getJsonTemplate(kindId, profileId, options = {}) {
        return buildTemplateText(kindId, profileId, options);
    }

    /** The same template as a plain object, for callers that would only re-parse it. */
    static getJsonTemplateObject(kindId, profileId, options = {}) {
        return buildTemplateObject(kindId, profileId, options);
    }

    /** The derived authoring guide for a profile: every field, every rule, and the template. */
    static getAuthoringGuide(kindId, profileId, options = {}) {
        return buildGuideText(kindId, profileId, options);
    }

    // ---------- Validation and construction ----------

    /**
     * Shape validation for one entry: types, required fields, allowed values, bounds,
     * nested shapes and cross-field rules. Pure and synchronous -- no world access,
     * no transforms, nothing created.
     *
     * @returns {{status: 'success'|'warning'|'error', errors: object[], warnings: object[]}}
     */
    static validateEntry(kindId, profileId, entry) {
        return validateEntry(kindId, profileId, entry);
    }

    /**
     * Shape validation plus a dry conversion, which is what catches a failure a pure
     * check cannot see -- an unparseable price is well-shaped as a string and only
     * fails when converted. Nothing is created. The assembled data comes back on
     * `data` so a caller that wants it need not build twice.
     *
     * @returns {Promise<{status: string, errors: object[], warnings: object[], data?: object}>}
     */
    static validateEntryDeep(kindId, profileId, entry) {
        return validateEntryDeep(kindId, profileId, entry);
    }

    /**
     * Build document source data for one entry from its profile's declaration, ready
     * to pass to `createDocuments`. Nothing is created here.
     *
     * This is the primitive that lets a module STOP maintaining its own builder. It
     * is not only for JSON import: any surface that collects friendly fields -- a
     * form in a module's own window, a macro, a generator -- can map them to an entry
     * and get the same document data the importer would produce, from the same
     * declaration. That is the whole point of declaring a shape once.
     *
     * A module that calls `createDocuments` itself owns what follows: destination,
     * permissions, rollback and GM-note preservation are promises the IMPORT path
     * makes, and they do not travel with the data. Use the import path when they
     * matter.
     *
     * @returns {Promise<object>} Document source data.
     */
    static buildDocumentData(kindId, profileId, entry) {
        return buildDocumentData(kindId, profileId, entry);
    }

    /**
     * Build an UPDATE for an existing document from the fields an entry supplies.
     *
     * The counterpart to `buildDocumentData`, and the same assembler in a second
     * mode rather than a second builder -- which is the point. Moving only a create
     * path onto declarations while keeping a hand-written builder for edits takes a
     * module from one builder to two.
     *
     * Omits what creation does that an edit must not: the document type and every
     * const (rewriting a type the document already has fails the whole save),
     * defaults for absent fields (an edit must not assert `quantity: 1` because the
     * form did not mention it), and derivations (they assemble whole content and
     * cannot express "leave the rest alone").
     *
     * Transforms still run, so a supplied field converts as it would on create, and
     * a field present but empty still clears.
     *
     * @param {object} entry - Only the fields being changed.
     * @returns {Promise<object>} A partial document, ready for `Document#update`.
     */
    static buildDocumentUpdate(kindId, profileId, entry) {
        return buildDocumentUpdate(kindId, profileId, entry);
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
