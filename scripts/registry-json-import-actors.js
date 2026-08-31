// ==================================================================
// Actor JSON import - NPC, Sidekick and Character Snapshot
// ==================================================================
// The Actor kind, moved out of `blacksmith.js` when Actor was declared.
//
// Actor is the PASSTHROUGH form. Its declaration describes the envelope an
// author writes around a dnd5e stat block, not the stat block itself, so this
// kind composes its own authoring output: the derived envelope, plus a worked
// native body the declaration deliberately does not describe.
// ==================================================================

import { registerJsonImportKind } from './registry-json-import.js';
import { getDeclaration } from './registry-declarations.js';
import { validateEntryDeep, buildDocumentData } from './manager-declarations.js';
// Side-effect import: registers the declared Actor profiles.
import './declarations/declaration-actor.js';
import { compendiumManager } from './manager-compendiums.js';
import { linkCharacterFoundations, validateSidekickSnapshot } from './parsers/parse-actor.js';
import {
    getActorPromptFields, getActorPromptCheckboxes, buildActorImportPrompt,
    buildActorJsonTemplate, buildActorAuthoringGuide
} from './utility-prompt-builder-actors.js';
import { getJournalPortraitPromptFields, buildJournalVisualPrompt } from './registry-json-import-journals.js';

export const ACTOR_JSON_IMPORT_KIND_ID = 'actor';

/** The profiles that import JSON. `portrait` is prompt-only and builds nothing. */
const JSON_PROFILES = ['npc', 'sidekick', 'character'];

/**
 * The declared profile for an entry.
 *
 * The payload names its profile the same way it always has: a Character says so
 * in `type`, and a Sidekick is recognised by carrying the sidekick block. This is
 * the old parser's own test, promoted from a pair of branches inside it to the
 * thing that selects a declaration.
 *
 * `sidekick` is accepted as a `type` because authored payloads use it, even
 * though the Actor created is a dnd5e npc either way.
 * @param {object} entry
 * @returns {object|null}
 */
function declaredProfileFor(entry) {
    const type = String(entry?.type || '').trim().toLowerCase();
    if (type === 'character') return getDeclaration(ACTOR_JSON_IMPORT_KIND_ID, 'character');
    if (type === 'sidekick' || entry?.sidekick !== undefined) {
        return getDeclaration(ACTOR_JSON_IMPORT_KIND_ID, 'sidekick');
    }
    return getDeclaration(ACTOR_JSON_IMPORT_KIND_ID, 'npc');
}

/**
 * Carry a structured issue on a thrown Error, so a failure reaches the result
 * screen naming the field rather than as a blanket validation failure.
 * @param {object} issue
 * @returns {Error}
 */
function errorFromIssue(issue) {
    const error = new Error(issue.message);
    error.code = issue.code;
    error.path = issue.path;
    error.details = issue.details;
    return error;
}

registerJsonImportKind({
    id: ACTOR_JSON_IMPORT_KIND_ID,
    gmOnly: true,
    buttonHtml: '<i class="fa-solid fa-user-plus"></i> Import',
    idSuffix: 'actor',
    windowTitle: 'Import JSON',
    headerTitle: 'Import Actor',
    windowIcon: 'fa-solid fa-user-plus',
    position: { width: 920, height: 680 },
    // The kind builds its own template and guide from the declaration plus a
    // native body no declaration describes, so the router leaves both alone.
    composesOwnAuthoring: true,
    templateOptions: [
        { value: 'npc', label: 'NPC/Monster', authoringModes: 'json prompt' },
        { value: 'sidekick', label: 'Sidekick', authoringModes: 'json prompt' },
        { value: 'character', label: 'Character Snapshot', authoringModes: 'json prompt' },
        { value: 'portrait', label: 'Portrait Image', authoringModes: 'prompt' }
    ],
    get promptFields() {
        return [...getActorPromptFields(), ...getJournalPortraitPromptFields()];
    },
    get promptCheckboxes() {
        return getActorPromptCheckboxes();
    },
    onBuildPrompt: async (type, promptOptions = {}, onProgress) => type === 'portrait'
        ? buildJournalVisualPrompt('portrait', promptOptions)
        : buildActorImportPrompt(type, promptOptions, onProgress),
    // Both are composed in `utility-prompt-builder-actors.js`: the declaration
    // supplies the envelope, and the dnd5e stat block around it is a worked
    // example no declaration describes.
    onBuildJsonTemplate: async (type) => (JSON_PROFILES.includes(type) ? buildActorJsonTemplate(type) : ''),
    onBuildAuthoringGuide: async (type) => (JSON_PROFILES.includes(type) ? buildActorAuthoringGuide(type) : ''),
    onValidateEntry: async (entry) => {
        const declaration = declaredProfileFor(entry);
        const outcome = await validateEntryDeep(ACTOR_JSON_IMPORT_KIND_ID, declaration.id, entry);
        if (outcome.errors.length) throw errorFromIssue(outcome.errors[0]);
        // Both of these compare the assembled Actor against something OUTSIDE the
        // payload -- the configured compendiums, the base stat block -- so neither
        // is expressible as a declaration rule, and neither should block an import.
        // The assembled data comes back from the conversion check above rather than
        // being built again; building an Actor is the expensive half of validating one.
        const actorData = outcome.data;
        return {
            validationWarnings: [
                ...outcome.warnings.map(warning => warning.message),
                ...await compendiumManager.validateCharacterItems(actorData),
                ...await validateSidekickSnapshot(actorData)
            ]
        };
    },
    onImportEntry: async (entry) => {
        const declaration = declaredProfileFor(entry);
        const actorData = await buildDocumentData(ACTOR_JSON_IMPORT_KIND_ID, declaration.id, entry);

        // The underscore keys are working state the derivations left behind for the
        // post-create step; they are not Actor data and Foundry would store them.
        const actorCreationData = { ...actorData };
        for (const key of ['_originalItems', '_originalSpells', '_originalFeatures', '_originalCurrency', '_characterFoundations']) {
            delete actorCreationData[key];
        }
        const [created] = await Actor.createDocuments([actorCreationData], { keepId: false });

        // Actor is the only kind with work AFTER create, and so the only one that
        // rolls back: a Character whose foundations could not be linked is a broken
        // document, not a partial one, and leaving it behind is worse than failing.
        try {
            const postProcess = await compendiumManager.addItemsToActor(created, actorData);
            if (created.type === 'character' && actorData._characterFoundations?.length) {
                await linkCharacterFoundations(created, actorData._characterFoundations,
                    postProcess?.embeddedDocuments ?? []);
            }
            return {
                document: created,
                importWarnings: (postProcess?.unresolved ?? []).map(reference => `Could not add ${reference}.`)
            };
        } catch (error) {
            await created.delete();
            throw error;
        }
    }
});
