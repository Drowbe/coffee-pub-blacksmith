// ==================================================================
// ===== DECLARATION DERIVATIONS ====================================
// ==================================================================
// Content a declaration cannot express as fields, because it is not
// authored at all: it is generated from what the fields resolved to.
//
// This is the "computed content" hook the plan reserves, and Blacksmith's
// own Weapon profile is its first instance -- dnd5e expects a full Attack
// activity that nobody types, assembled from the item's resolved name,
// artwork, chat text, range units and attack type.
//
// POSITION MATTERS, and the plan left it vague. A derivation runs AFTER
// every field has resolved, over the assembled document data, not over the
// raw entry. The weapon activity needs the guessed icon and the normalised
// range units, and neither exists before construction.
//
// Named and Blacksmith-owned, like transforms and named rules. A module
// selects one; it never supplies one.
// ==================================================================

// Imported lazily inside the derivation, never at module load. The registry
// imports this file to validate that a declaration's `derive` names exist, and
// parsers/parse-item.js reaches const.js, which fetches module.json while it
// loads. A top-level import here would drag Foundry into the registry and cost
// the declaration layer the headless testability that is half its value.

/**
 * The standard Attack activity every weapon carries.
 *
 * Authors are forbidden from supplying `activities` on a weapon -- the rule
 * vocabulary enforces it -- precisely because this is generated. Two sources of
 * the same activity would diverge, and dnd5e would use whichever won.
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload, for fields that do not land.
 * @returns {Promise<object>} The same data, with the activity attached.
 */
async function weaponAttackActivity(data, entry) {
    const { WEAPON_ATTACK_TYPES, _activityBase } = await import('./parsers/parse-item.js');
    const units = data?.system?.range?.units || 'ft';
    const attackType = WEAPON_ATTACK_TYPES[data?.system?.type?.value] ?? 'melee';

    const activity = _activityBase({
        activityType: 'Attack',
        activityName: data.name,
        activityIcon: data.img,
        activityFlavorText: entry?.itemDescriptionChat || '',
        activationType: 'action',
        activationValue: 1,
        activityTarget: {
            affectsType: 'creature', affectsCount: 1, choice: false, special: '',
            templateType: '', templateSize: null, templateWidth: null, templateHeight: null,
            templateCount: null, contiguous: false, units, prompt: false
        }
    }, 0, 'weapon', false);

    activity.attack = {
        ability: String(entry?.weaponAbility ?? '').trim().toLowerCase(),
        bonus: String(entry?.weaponAttackBonus || ''),
        critical: { threshold: null },
        flat: false,
        type: { value: attackType, classification: 'weapon' }
    };
    activity.damage = { critical: { bonus: '' }, includeBase: true, parts: [] };

    data.system = data.system || {};
    data.system.activities = { [activity._id]: activity };
    return data;
}

/**
 * Equippable passive effects, as Active Effect documents.
 *
 * A derivation rather than a field transform for the same reason the attack
 * activity is one: each effect falls back to the item's artwork, and that is the
 * GUESSED icon, which does not exist until construction has resolved it.
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with effects attached.
 */
async function equippablePassiveEffects(data, entry) {
    const { _buildEquippablePassiveEffects } = await import('./parsers/parse-item.js');
    data.effects = _buildEquippablePassiveEffects(entry, data.img);
    return data;
}

/**
 * Authored activities, and the effects they apply.
 *
 * A derivation rather than a field transform for three reasons, each of which
 * rules a transform out on its own: `_buildActivities` needs the RESOLVED icon,
 * it needs to know whether the parent item has limited uses (which is itself a
 * derived field), and it MUTATES the effects array by pushing applied effects
 * into it -- so activities and effects have to be produced together.
 *
 * `parentType` comes from the document rather than a parameter, so one derivation
 * serves Feature and Spell; dnd5e's own shape differs between them (a spell's
 * activity consumes a spell slot, a feature's does not).
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with activities and effects attached.
 */
async function itemActivities(data, entry) {
    const { _buildActivities } = await import('./parsers/parse-item.js');
    const effects = Array.isArray(entry?.effects)
        ? foundry.utils.deepClone(entry.effects) : [];
    const hasUses = Boolean(data?.system?.uses?.max);
    data.system = data.system || {};
    data.system.activities = _buildActivities(entry?.activities, data.type, hasUses, effects, data.img);
    data.effects = effects;
    return data;
}

/**
 * dnd5e's slug identifier, derived from the resolved document name.
 *
 * A derivation rather than a second path on the name field: it is computed FROM
 * the name rather than being another place the name is written, and the two would
 * drift the moment a name transform appeared.
 * @param {object} data
 * @returns {Promise<object>}
 */
async function slugIdentifier(data) {
    const { _identifier } = await import('./parsers/parse-item.js');
    data.system = data.system || {};
    data.system.identifier = _identifier(data.name);
    return data;
}

/**
 * A Roll Table's rows and the die that rolls them.
 *
 * A derivation rather than a field transform because no row can be converted on
 * its own: an omitted range follows from the row BEFORE it through a running
 * cursor, and the table's formula follows from the highest range across all of
 * them. A per-field transform sees one value and cannot do either.
 *
 * Document rows resolve a name to a UUID here as well. The author supplies an
 * exact name and never a UUID -- a name survives a pack being rebuilt where a
 * UUID does not -- and `missingDocumentPolicy` decides whether a name that
 * resolves to nothing stops the import or degrades the row to plain text.
 *
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with results and formula attached.
 */
async function rollTableResults(data, entry) {
    const { parseTableToFoundry } = await import('./parsers/parse-rolltable.js');
    // The row conversion, the ordered ranges, the overlap check and the document
    // resolution are one algorithm and are not split apart to be re-derived. What
    // the declaration owns is the SHAPE of a row; what this owns is the sequence.
    const converted = await parseTableToFoundry(entry);
    data.results = converted.results;
    data.formula = converted.formula;
    return data;
}

/**
 * A sidekick block folded into the Actor's flags and traits.
 *
 * A derivation rather than a field with a path, because the block does not land
 * anywhere as written: it is normalised, stamped with a schema version, and it
 * also sets `system.traits.important`, which is a second place no single field
 * mapping reaches.
 * @param {object} data
 * @param {object} entry
 * @returns {Promise<object>}
 */
async function actorSidekick(data, entry) {
    const { consumeSidekick } = await import('./parsers/parse-actor.js');
    return entry?.sidekick ? consumeSidekick(data, entry.sidekick) : data;
}

/**
 * A Character's race, background, classes and subclasses folded into its items.
 *
 * The association each one carries is recorded on `_characterFoundations` for the
 * post-create link step, which is the only work in the importer that cannot
 * happen before the document exists.
 * @param {object} data
 * @param {object} entry
 * @returns {Promise<object>}
 */
async function actorCharacterFoundations(data, entry) {
    const { consumeCharacterFoundations } = await import('./parsers/parse-actor.js');
    data.items = Array.isArray(data.items) ? data.items : [];
    data._characterFoundations = consumeCharacterFoundations(data, entry);
    return data;
}

/**
 * The friendly `token` block merged forward onto `prototypeToken`.
 * @param {object} data
 * @param {object} entry
 * @returns {Promise<object>}
 */
async function actorToken(data, entry) {
    const { consumeToken } = await import('./parsers/parse-actor.js');
    const token = entry?.token;
    if (!token || typeof token !== 'object' || Array.isArray(token)) return data;
    return consumeToken(data, token);
}

/**
 * The payload's named items, spells and features resolved against the configured
 * compendiums, then the defaults every imported Actor gets.
 *
 * The two are one derivation because the second is only correct after the first:
 * `processCharacterData` may return a NEW object, so applying defaults before it
 * applies them to something that gets replaced. That ordering was implicit in the
 * parser and is worth stating rather than leaving to declaration order.
 * @param {object} data
 * @returns {Promise<object>}
 */
async function actorContent(data) {
    const { resolveActorContent, applyActorDefaults } = await import('./parsers/parse-actor.js');
    return applyActorDefaults(await resolveActorContent(data));
}

/**
 * An Area journal's page content: the whole payload composed into one HTML page.
 *
 * A derivation rather than per-field paths because nothing here lands on its own.
 * The breadcrumb's leaf falls back through three fields, actor names resolve to
 * document links, and a card collapses entirely when every part of it is empty --
 * none of which a field mapping can express. This is the same call Roll Table's
 * ranges settled: the declaration owns the SHAPE of the payload, and one composer
 * owns turning all of it into a document.
 *
 * It is also why there is no `rendered` form. Composing a template over the whole
 * entry IS a derivation; a second mechanism for it would have been a name for
 * something already built.
 *
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with the entry name and its one page.
 */
async function journalAreaContent(data, entry) {
    const { buildAreaJournalTemplateData } = await import('./parsers/parse-journal-area.js');
    const { getCachedTemplate } = await import('./blacksmith.js');
    const { normalizeFoundryJournalHtml, applyJournalHeadingSpacing } =
        await import('./utility-journal-html.js');
    const { toSentenceCase } = await import('./api-core.js');
    const { BLACKSMITH } = await import('./const.js');

    const omitIfNone = (value) => {
        const text = value == null ? '' : String(value).trim();
        return !text || text.toLowerCase() === 'none' ? '' : text;
    };
    const area = omitIfNone(entry?.area);
    const sceneTitle = omitIfNone(entry?.scenetitle)
        ? toSentenceCase(String(entry.scenetitle).trim())
        : '';

    let content;
    try {
        const template = await getCachedTemplate(BLACKSMITH.JOURNAL_AREA_TEMPLATE);
        content = applyJournalHeadingSpacing(
            normalizeFoundryJournalHtml(template(await buildAreaJournalTemplateData(entry))));
    } catch (error) {
        // The composer reaches templates, campaign settings and the Actor
        // directory, so a failure here is rarely about the payload. Saying which
        // half broke beats a bare Handlebars message on the result screen.
        throw new Error(`Area journal HTML build failed: ${error?.message || String(error)}`);
    }

    data.name = area || sceneTitle || 'Unnamed Entry';
    // No `type` here on purpose: the profile's declared `document.pageType` is
    // stamped on after derivations, which is what lets a module-owned subtype be
    // created without every derivation knowing about it.
    data.pages = [{
        name: sceneTitle || area || 'Area',
        text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }
    }];
    return data;
}

/**
 * A Location journal's page content.
 *
 * The same call as the Area composer and for the same reason -- one HTML page
 * built from the whole payload -- but the GROUPING differs, and that difference
 * is the one worth recording. Area names its entry after the area and holds a
 * single page; Location files every page into one shared entry, `journalname`,
 * defaulting to "Locations". A journal profile therefore decides both what its
 * page says and which entry the page belongs to.
 *
 * @param {object} data - Assembled document source data.
 * @param {object} entry - The authored payload.
 * @returns {Promise<object>} The same data, with the entry name and its one page.
 */
async function journalLocationContent(data, entry) {
    const { buildLocationJournalPage } = await import('./parsers/parse-journal-location.js');
    const built = await buildLocationJournalPage(entry);
    data.name = built.journalName;
    data.pages = [built.page];
    return data;
}

/** @type {Record<string, Function>} */
const DERIVATIONS = {
    journalAreaContent, journalLocationContent,
    weaponAttackActivity, equippablePassiveEffects, itemActivities, slugIdentifier,
    rollTableResults,
    actorSidekick, actorCharacterFoundations, actorToken, actorContent
};

/**
 * Whether a named derivation exists, so a declaration selecting one that does not
 * is rejected at registration rather than silently producing an incomplete document.
 * @param {string} name
 * @returns {boolean}
 */
export function hasDerivation(name) {
    return Object.prototype.hasOwnProperty.call(DERIVATIONS, name);
}

/**
 * Run a profile's derivations, in declaration order.
 * @param {string[]} names
 * @param {object} data
 * @param {object} entry
 * @returns {object}
 */
export async function applyDerivations(names, data, entry) {
    let result = data;
    for (const name of names ?? []) {
        const derivation = DERIVATIONS[name];
        if (derivation) result = await derivation(result, entry);
    }
    return result;
}
