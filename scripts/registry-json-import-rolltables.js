// ==================================================================
// Roll table JSON import — prompt registry (core + profile) + kind
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { registerJsonImportKind } from './registry-json-import.js';
import { parseTableToFoundry } from './parsers/parse-rolltable.js';
import {
    fetchPromptText,
    composePrompt,
    applyCampaignPlaceholders
} from './utility-json-import-prompts.js';
import {
    queryImportCatalog,
    formatImportCatalog
} from './utility-rolltable-import-lists.js';
import {
    getConfiguredActorCompendiums,
    getConfiguredItemCompendiums
} from './utility-json-import-compendium-lists.js';

export const ROLLTABLE_PROMPT_CORE = 'prompt-rolltable-core.txt';

/** @type {Record<string, string>} */
export const ROLLTABLE_PROMPT_PROFILES = {
    text: 'prompt-rolltable-profile-text.txt',
    'document-custom': 'prompt-rolltable-profile-document-custom.txt',
    'document-item': 'prompt-rolltable-profile-document-item.txt',
    'document-actor': 'prompt-rolltable-profile-document-actor.txt',
    'compendium-item': 'prompt-rolltable-profile-compendium-item.txt',
    'compendium-actor': 'prompt-rolltable-profile-compendium-actor.txt'
};

export const ROLLTABLE_TEMPLATE_OPTIONS = [
    { value: 'text', label: 'Simple Text' },
    { value: 'document-custom', label: 'Custom' },
    { value: 'document-item', label: 'World Items' },
    { value: 'document-actor', label: 'World Actors' },
    { value: 'compendium-item', label: 'Compendium Items' },
    { value: 'compendium-actor', label: 'Compendium Actors' }
];

/**
 * @param {string} templateKey
 * @returns {Promise<string>}
 */
const ALL_PROFILES = Object.keys(ROLLTABLE_PROMPT_PROFILES).join(' ');
const ACTOR_PROFILES = 'document-actor compendium-actor';
const ITEM_PROFILES = 'document-item compendium-item';
const COMPENDIUM_ACTOR_PREFIX = 'tableActorPack:';
const COMPENDIUM_ITEM_PREFIX = 'tableItemPack:';

function selectField(id, label, value, options, showForTemplate = ALL_PROFILES, authoringModes = 'json prompt', group = 'Table Structure') {
    return {
        id, label, value, inputType: 'select', showForTemplate, authoringModes, group,
        groupIcon: group === 'Table Structure' ? 'fa-solid fa-table-list' : 'fa-solid fa-filter',
        options: options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))
    };
}

export function getRollTablePromptFields() {
    return [
        { id: 'resultCount', label: 'Result count', value: '20', inputType: 'text', showForTemplate: ALL_PROFILES, authoringModes: 'json prompt', group: 'Table Structure', groupIcon: 'fa-solid fa-table-list' },
        selectField('drawWithReplacement', 'Draw behavior', 'true', [['true','With Replacement'],['false','Without Replacement']]),
        selectField('displayRollFormula', 'Display roll formula', 'false', [['false','Hidden'],['true','Shown']]),
        selectField('weightingMode', 'Weighting', 'equal', [['equal','Equal'],['manual','Manual Ranges / Weights']]),
        selectField('duplicatePolicy', 'Duplicate results', 'avoid', [['avoid','Avoid Duplicates'],['allow','Allow Duplicates']]),
        selectField('referencePolicy', 'Missing references', 'exact', [['exact','Exact References Only'],['fallback','Use Text Fallback']], 'document-custom document-item document-actor compendium-item compendium-actor', 'json prompt', 'Reference Policy'),
        selectField('customDocumentType', 'Document type', 'item', [['actor','Actor'],['adventure','Adventure'],['card stack','Card Stack'],['item','Item'],['journal entry','Journal Entry'],['macro','Macro'],['playlist','Playlist'],['rollable table','Rollable Table'],['scene','Scene']], 'document-custom', 'json prompt', 'Source'),
        { id: 'nameSearch', label: 'Name contains', value: '', inputType: 'text', showForTemplate: `document-custom ${ACTOR_PROFILES} ${ITEM_PROFILES}`, authoringModes: 'json prompt', group: 'Catalog Search', groupIcon: 'fa-solid fa-magnifying-glass' },
        { id: 'actorCrExact', label: 'Exact CR', value: '', inputType: 'text', showForTemplate: ACTOR_PROFILES, authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorCrMin', label: 'Minimum CR', value: '', inputType: 'text', showForTemplate: ACTOR_PROFILES, authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorCrMax', label: 'Maximum CR', value: '', inputType: 'text', showForTemplate: ACTOR_PROFILES, authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorType', label: 'Creature type', value: '', inputType: 'text', showForTemplate: ACTOR_PROFILES, authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorSize', label: 'Creature size', value: '', inputType: 'text', showForTemplate: ACTOR_PROFILES, authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        selectField('itemType', 'Item type', '', [['','Any'],['weapon','Weapon'],['equipment','Equipment'],['consumable','Consumable'],['loot','Loot'],['tool','Tool'],['container','Container'],['feat','Feature'],['spell','Spell']], ITEM_PROFILES, 'json prompt', 'Item Filters'),
        selectField('itemRarity', 'Rarity', '', [['','Any'],['common','Common'],['uncommon','Uncommon'],['rare','Rare'],['very rare','Very Rare'],['legendary','Legendary'],['artifact','Artifact']], ITEM_PROFILES, 'json prompt', 'Item Filters'),
        selectField('itemMagical', 'Magical', 'any', [['any','Any'],['magical','Magical Only'],['nonmagical','Nonmagical Only']], ITEM_PROFILES, 'json prompt', 'Item Filters'),
        selectField('tablePurpose', 'Purpose', 'story', [['story','Story / Discovery'],['encounter','Encounter'],['loot','Loot / Reward'],['utility','Utility / Generator']], ALL_PROFILES, 'prompt', 'Generation Direction'),
        selectField('tableDetail', 'Detail', 'standard', [['concise','Concise'],['standard','Standard'],['rich','Rich']], ALL_PROFILES, 'prompt', 'Generation Direction'),
        { id: 'tableTone', label: 'Tone / theme', value: '', inputType: 'text', showForTemplate: ALL_PROFILES, authoringModes: 'prompt', group: 'Generation Direction', groupIcon: 'fa-solid fa-wand-magic-sparkles' },
        { id: 'additionalContext', label: 'Additional context', value: '', inputType: 'textarea', fullWidth: true, showForTemplate: ALL_PROFILES, authoringModes: 'prompt', group: 'Generation Direction', groupIcon: 'fa-solid fa-wand-magic-sparkles' }
    ];
}

export function getRollTablePromptCheckboxes() {
    const checkboxes = [{ id: 'includeResultImages', label: 'Include Result Images', checked: false, authoringModes: 'json prompt', showForTemplate: ALL_PROFILES, section: 'Table Structure', sectionIcon: 'fa-solid fa-table-list' }];
    for (const comp of getConfiguredItemCompendiums()) checkboxes.push({ id: `${COMPENDIUM_ITEM_PREFIX}${comp.id}`, label: comp.label, checked: true, authoringModes: 'json prompt', showForTemplate: 'compendium-item', section: 'Item Compendiums', sectionIcon: 'fa-solid fa-wand-sparkles' });
    for (const comp of getConfiguredActorCompendiums()) checkboxes.push({ id: `${COMPENDIUM_ACTOR_PREFIX}${comp.id}`, label: comp.label, checked: true, authoringModes: 'json prompt', showForTemplate: 'compendium-actor', section: 'Actor Compendiums', sectionIcon: 'fa-solid fa-dragon' });
    return checkboxes;
}

function selectedPackIds(options, prefix) {
    const keys = Object.keys(options).filter(key => key.startsWith(prefix));
    if (keys.length) return keys.filter(key => options[key]).map(key => key.slice(prefix.length));
    const configured = prefix === COMPENDIUM_ACTOR_PREFIX
        ? getConfiguredActorCompendiums()
        : getConfiguredItemCompendiums();
    return configured.map(comp => comp.id);
}

function catalogSpec(key, options) {
    if (key === 'document-actor') return { kind: 'actor', source: 'world', packIds: [] };
    if (key === 'document-item') return { kind: 'item', source: 'world', packIds: [] };
    if (key === 'compendium-actor') return { kind: 'actor', source: 'compendium', packIds: selectedPackIds(options, COMPENDIUM_ACTOR_PREFIX) };
    if (key === 'compendium-item') return { kind: 'item', source: 'compendium', packIds: selectedPackIds(options, COMPENDIUM_ITEM_PREFIX) };
    return null;
}

async function buildFilteredCatalog(key, options, onProgress) {
    if (key === 'document-custom') {
        const type = String(options.customDocumentType || 'item').toLowerCase();
        const collectionMap = {
            actor: game.actors?.contents, adventure: game.adventures?.contents, 'card stack': game.cards?.contents,
            item: game.items?.contents, 'journal entry': game.journal?.contents, macro: game.macros?.contents,
            playlist: game.playlists?.contents, 'rollable table': game.tables?.contents, scene: game.scenes?.contents
        };
        const search = String(options.nameSearch || '').trim().toLowerCase();
        const rows = (collectionMap[type] ?? [])
            .filter(document => !search || document.name.toLowerCase().includes(search))
            .map(document => ({ name: document.name, id: document.id, uuid: document.uuid, source: 'world', packId: '', img: document.img ?? '' }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const text = rows.length
            ? rows.map(row => `- ${row.name} | world${options.includeResultImages && row.img ? ` | img=${row.img}` : ''}`).join('\n')
            : 'No matching entries found.';
        return { text, rows, spec: { kind: 'document', source: 'world', packIds: [] } };
    }
    const spec = catalogSpec(key, options);
    if (!spec) return { text: '', rows: [], spec: null };
    if (spec.source === 'compendium' && !spec.packIds.length) return { text: 'No compendiums selected.', rows: [], spec };
    const rows = await queryImportCatalog({ ...spec, filters: options, onProgress });
    return { text: formatImportCatalog(rows, spec.kind, { includeImages: !!options.includeResultImages }), rows, spec };
}

function buildTableDirectives(options) {
    const count = parseResultCount(options.resultCount);
    const lines = [
        `- Create exactly ${count} result rows.`,
        `- Draw with replacement: ${options.drawWithReplacement !== 'false'}.`,
        `- Display roll formula: ${options.displayRollFormula === 'true'}.`,
        `- Weighting: ${options.weightingMode === 'manual' ? 'use intentional manual weights/ranges' : 'use equal weights and contiguous one-number ranges'}.`,
        `- Duplicates: ${options.duplicatePolicy === 'allow' ? 'allowed when useful' : 'avoid duplicate result names'}.`,
        `- Result images: ${options.includeResultImages ? 'use available entry images when known' : 'leave resultImagePath blank'}.`,
        `- Reference policy: ${options.referencePolicy === 'fallback' ? 'when an exact reference is unavailable, emit a text result instead' : 'use exact catalog references only; never invent a linked name'}.`
    ];
    if (options.tablePurpose) lines.push(`- Purpose: ${options.tablePurpose}.`);
    if (options.tableDetail) lines.push(`- Detail: ${options.tableDetail}.`);
    if (options.tableTone) lines.push(`- Tone/theme: ${options.tableTone}.`);
    if (options.additionalContext) lines.push(`- Additional context: ${options.additionalContext}`);
    return lines.join('\n');
}

export async function buildRollTableImportPrompt(templateKey, options = {}, onProgress) {
    const key = String(templateKey || 'text').toLowerCase();
    const core = await fetchPromptText(ROLLTABLE_PROMPT_CORE);
    const profileFile = ROLLTABLE_PROMPT_PROFILES[key];
    if (!profileFile) throw new Error(`Unsupported Roll Table profile: ${templateKey}`);
    const parts = [core];
    if (profileFile) {
        parts.push(await fetchPromptText(profileFile));
    }

    let composed = composePrompt(parts);
    composed = await applyCampaignPlaceholders(composed);

    const catalog = await buildFilteredCatalog(key, options, onProgress);
    if (catalog.spec && options.referencePolicy !== 'fallback' && options.duplicatePolicy !== 'allow' && catalog.rows.length < parseResultCount(options.resultCount)) {
        throw new Error(`Only ${catalog.rows.length} exact catalog matches remain after filtering, but ${parseResultCount(options.resultCount)} unique results were requested. Broaden the filters, select more compendiums, lower the result count, allow duplicates, or enable text fallback.`);
    }
    const packIds = catalog.spec?.packIds ?? [];
    composed = composed.split('[ADD-ACTORS-HERE]').join(catalog.text);
    composed = composed.split('[ADD-ITEMS-HERE]').join(catalog.text);
    composed = composed.split('[ADD-COMPENDIUMS-HERE]').join(packIds.join(', '));
    composed = composed.split('[ADD-COMPENDIUM-ITEMS-HERE]').join(catalog.text);
    composed = composed.split('[ADD-COMPENDIUM-ACTORS-HERE]').join(catalog.text);
    if (key === 'document-custom') composed += `\n\nWORLD ${String(options.customDocumentType || 'item').toUpperCase()} CATALOG (exact resultText values)\n\n${catalog.text}\n`;
    composed += `\n\n========================================\nGENERATION DIRECTION (AUTHORITATIVE)\n========================================\n\n${buildTableDirectives(options)}\n`;

    return composed;
}

function parseResultCount(value) {
    const count = Number.parseInt(String(value ?? '20'), 10);
    if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Result count must be a whole number from 1 to 200.');
    return count;
}

function tableResultDefaults(key, options) {
    if (key === 'text') return { resultType: 'text', resultDocumentType: ' ', resultCompendium: ' ' };
    if (key === 'document-custom') return { resultType: 'document', resultDocumentType: options.customDocumentType || 'item', resultCompendium: ' ' };
    if (key === 'document-item') return { resultType: 'document', resultDocumentType: 'item', resultCompendium: ' ' };
    if (key === 'document-actor') return { resultType: 'document', resultDocumentType: 'actor', resultCompendium: ' ' };
    if (key === 'compendium-item') return { resultType: 'Compendium', resultDocumentType: 'Item', resultCompendium: selectedPackIds(options, COMPENDIUM_ITEM_PREFIX)[0] || '' };
    return { resultType: 'Compendium', resultDocumentType: 'actor', resultCompendium: selectedPackIds(options, COMPENDIUM_ACTOR_PREFIX)[0] || '' };
}

export async function buildRollTableJsonTemplate(templateKey, options = {}) {
    const key = String(templateKey || 'text').toLowerCase();
    if (!ROLLTABLE_PROMPT_PROFILES[key]) throw new Error(`Unsupported Roll Table profile: ${templateKey}`);
    const count = parseResultCount(options.resultCount);
    const defaults = tableResultDefaults(key, options);
    const results = Array.from({ length: count }, (_, index) => ({
        ...defaults,
        resultImagePath: '',
        resultText: '',
        resultWeight: 1,
        resultRangeLower: index + 1,
        resultRangeUpper: index + 1
    }));
    return JSON.stringify([{
        tableName: '', tableDescription: '', tableImagePath: '',
        drawWithReplacement: options.drawWithReplacement !== 'false',
        displayRollFormula: options.displayRollFormula === 'true', results
    }], null, 2);
}

export async function buildRollTableAuthoringGuide(templateKey, options = {}, onProgress) {
    const key = String(templateKey || 'text').toLowerCase();
    const json = await buildRollTableJsonTemplate(key, options);
    const catalog = await buildFilteredCatalog(key, options, onProgress);
    const availability = catalog.spec && options.referencePolicy !== 'fallback' && options.duplicatePolicy !== 'allow' && catalog.rows.length < parseResultCount(options.resultCount)
        ? `\nWARNING: ${catalog.rows.length} exact unique matches are available for ${parseResultCount(options.resultCount)} requested rows. Broaden filters, select more packs, lower the count, allow duplicates, or use text fallback.\n`
        : '';
    const catalogSection = catalog.spec ? `\nFILTERED REFERENCE CATALOG\n${availability}\n${catalog.text}\n` : '';
    return `BLACKSMITH ROLL TABLE JSON AUTHORING GUIDE

The JSON block is a valid starter array. Edit it as plain text, then paste only the JSON array into Import JSON.

Selected contract
${buildTableDirectives(options)}
- Profile: ${key}. Keep its resultType, resultDocumentType, and resultCompendium conventions.
- Linked resultText values must exactly match the catalog/world document. For compendium rows, use the pack id shown beside that name.
- Manual weighting may use different positive weights/ranges; ranges must be ordered, non-overlapping, and lower must not exceed upper.
- Keep JSON value types intact. Do not add comments, trailing commas, or duplicate keys.
${catalogSection}
JSON TEMPLATE

\`\`\`json
${json}
\`\`\`
`;
}

export const ROLLTABLE_JSON_IMPORT_KIND_ID = 'rolltable';

const rolltableJsonImportKind = {
    id: ROLLTABLE_JSON_IMPORT_KIND_ID,
    gmOnly: true,
    buttonHtml: '<i class="fa-solid fa-dice-d20"></i> Import',
    idSuffix: 'rolltable',
    windowTitle: 'Import JSON',
    headerTitle: 'Import Roll Table',
    windowIcon: 'fa-solid fa-dice-d20',
    position: { width: 920, height: 680 },
    templateOptions: ROLLTABLE_TEMPLATE_OPTIONS,
    get promptCheckboxes() { return getRollTablePromptCheckboxes(); },
    get promptFields() { return getRollTablePromptFields(); },
    onBuildPrompt: buildRollTableImportPrompt,
    onBuildJsonTemplate: buildRollTableJsonTemplate,
    onBuildAuthoringGuide: buildRollTableAuthoringGuide,
    onImport: async (entries) => {
        const tablesToImport = await Promise.all(entries.map(parseTableToFoundry));
        const created = await RollTable.createDocuments(tablesToImport, { keepId: false });
        postConsoleAndNotification(
            MODULE.NAME,
            `Imported ${created.length} table(s) successfully.`,
            '',
            false,
            true
        );
        return true;
    },
    onImportError: (e) => {
        postConsoleAndNotification(MODULE.NAME, 'Failed to import tables', e, false, true);
        ui.notifications.error(`Failed to import tables: ${e.message}`);
        return false;
    }
};

registerJsonImportKind(rolltableJsonImportKind);
