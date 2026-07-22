// ==================================================================
// Roll Table JSON import — v13 Text/Document authoring and import
// ==================================================================

import { registerJsonImportKind } from './registry-json-import.js';
import { parseTableToFoundry } from './parsers/parse-rolltable.js';
import { fetchPromptText, composePrompt, applyCampaignPlaceholders } from './utility-json-import-prompts.js';
import { queryImportCatalog, formatImportCatalog } from './utility-rolltable-import-lists.js';
import { getConfiguredCompendiums } from './utility-json-import-compendium-lists.js';

export const ROLLTABLE_PROMPT_CORE = 'prompt-rolltable-core.txt';
export const ROLLTABLE_PROMPT_PROFILES = {
    text: 'prompt-rolltable-profile-text.txt',
    document: 'prompt-rolltable-profile-document.txt'
};
export const ROLLTABLE_TEMPLATE_OPTIONS = [
    { value: 'text', label: 'Text' },
    { value: 'document', label: 'Document' }
];

const ALL_PROFILES = 'text document';
const PACK_PREFIX = 'tableSourcePack:';
const DOCUMENT_TYPES = [
    ['Actor', 'Actors'], ['Item', 'Items'], ['Spell', 'Spells'], ['Feature', 'Features'],
    ['JournalEntry', 'Journal Entries'], ['RollTable', 'Roll Tables'], ['Scene', 'Scenes'],
    ['Macro', 'Macros'], ['Playlist', 'Playlists'], ['Cards', 'Card Stacks']
];

function selectField(id, label, value, options, config = {}) {
    return {
        id, label, value, inputType: 'select', showForTemplate: config.showForTemplate ?? ALL_PROFILES,
        showForField: config.showForField ?? '', authoringModes: config.authoringModes ?? 'json prompt',
        group: config.group ?? 'Table Structure', groupIcon: config.groupIcon ?? 'fa-solid fa-table-list',
        hint: config.hint ?? '',
        options: options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))
    };
}

export function getRollTablePromptFields() {
    return [
        { id: 'resultCount', label: 'Result count', value: '20', inputType: 'text', hint: 'How many result rows the generated table should contain (1–200).', showForTemplate: ALL_PROFILES, authoringModes: 'json prompt', group: 'Table Structure', groupIcon: 'fa-solid fa-table-list' },
        selectField('drawWithReplacement', 'Draw behavior', 'true', [['true','With Replacement'],['false','Without Replacement']], { hint: 'With replacement allows the same result to be drawn again; without replacement marks drawn results unavailable.' }),
        selectField('displayRollFormula', 'Display roll formula', 'false', [['false','Hidden'],['true','Shown']], { hint: 'Controls whether Foundry displays the table roll formula to users.' }),
        selectField('weightingMode', 'Weighting', 'equal', [['equal','Equal'],['manual','Manual Ranges / Weights']], { hint: 'Equal gives every result the same chance. Manual permits intentionally different ranges or weights.' }),
        selectField('duplicatePolicy', 'Duplicate results', 'avoid', [['avoid','Avoid Duplicates'],['allow','Allow Duplicates']], { hint: 'Controls whether the generated result list may contain the same entry more than once.' }),
        selectField('catalogDocumentType', 'Catalog content', 'Actor', DOCUMENT_TYPES, {
            group: 'Source', groupIcon: 'fa-solid fa-books',
            hint: 'For Document tables this is the kind of document Blacksmith will link. For Text tables it chooses the catalog governed by the Use catalog entries policy.'
        }),
        selectField('textCatalogPolicy', 'Use catalog entries', 'exact', [['exact','Exact Names'],['inspired','Inspiration Only'],['none','Do Not Include Catalog']], {
            showForTemplate: 'text', authoringModes: 'json prompt', group: 'Text Results', groupIcon: 'fa-solid fa-align-left',
            hint: 'Exact Names copies selected catalog names verbatim into unlinked Text results. Inspiration Only allows newly written results.'
        }),
        selectField('referencePolicy', 'Missing references', 'exact', [['exact','Fail Import'],['fallback','Create Text Result']], {
            showForTemplate: 'document', group: 'Document Linking', groupIcon: 'fa-solid fa-link',
            hint: 'Blacksmith resolves exact catalog names to UUID-backed Foundry Document results during import.'
        }),
        { id: 'actorCrExact', label: 'Exact CR', value: '', inputType: 'text', hint: 'Match only actors with this challenge rating. Leave blank to use the minimum and maximum fields.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Actor', authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorCrMin', label: 'Minimum CR', value: '', inputType: 'text', hint: 'Exclude actors below this challenge rating.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Actor', authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorCrMax', label: 'Maximum CR', value: '', inputType: 'text', hint: 'Exclude actors above this challenge rating.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Actor', authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorType', label: 'Creature type', value: '', inputType: 'text', hint: 'Match a D&D creature type such as beast, humanoid, undead, or dragon.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Actor', authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorSize', label: 'Creature size', value: '', inputType: 'text', hint: 'Match a creature size such as tiny, medium, large, or huge.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Actor', authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        { id: 'actorNameSearch', label: 'Name contains', value: '', inputType: 'text', placeholder: 'Optional name text…', hint: 'Only include actors whose names contain this text. Leave blank for every actor matching the other filters.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Actor', authoringModes: 'json prompt', group: 'Actor Filters', groupIcon: 'fa-solid fa-dragon' },
        selectField('itemType', 'Item type', '', [['','Any'],['weapon','Weapon'],['equipment','Equipment'],['consumable','Consumable'],['loot','Loot'],['tool','Tool'],['container','Container'],['feat','Feature'],['spell','Spell']], { showForField: 'catalogDocumentType=Item', group: 'Item Filters', groupIcon: 'fa-solid fa-wand-sparkles', hint: 'Limit the catalog to one Foundry item type.' }),
        selectField('itemRarity', 'Rarity', '', [['','Any'],['common','Common'],['uncommon','Uncommon'],['rare','Rare'],['very rare','Very Rare'],['legendary','Legendary'],['artifact','Artifact']], { showForField: 'catalogDocumentType=Item', group: 'Item Filters', groupIcon: 'fa-solid fa-wand-sparkles', hint: 'Limit the catalog to items with this rarity.' }),
        selectField('itemMagical', 'Magical', 'any', [['any','Any'],['magical','Magical Only'],['nonmagical','Nonmagical Only']], { showForField: 'catalogDocumentType=Item', group: 'Item Filters', groupIcon: 'fa-solid fa-wand-sparkles', hint: 'Choose whether the catalog includes magical items, nonmagical items, or both.' }),
        { id: 'itemNameSearch', label: 'Name contains', value: '', inputType: 'text', placeholder: 'Optional name text…', hint: 'Only include items whose names contain this text.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Item', authoringModes: 'json prompt', group: 'Item Filters', groupIcon: 'fa-solid fa-wand-sparkles' },
        { id: 'documentNameSearch', label: 'Name contains', value: '', inputType: 'text', placeholder: 'Optional name text…', hint: 'Only include documents whose names contain this text.', showForTemplate: ALL_PROFILES, showForField: 'catalogDocumentType=Spell|Feature|JournalEntry|RollTable|Scene|Macro|Playlist|Cards', authoringModes: 'json prompt', group: 'Document Filters', groupIcon: 'fa-solid fa-filter' },
        selectField('tablePurpose', 'Purpose', 'story', [['story','Story / Discovery'],['encounter','Encounter'],['loot','Loot / Reward'],['utility','Utility / Generator']], { authoringModes: 'prompt', group: 'Generation Direction', groupIcon: 'fa-solid fa-wand-magic-sparkles' }),
        selectField('tableDetail', 'Detail', 'standard', [['concise','Concise'],['standard','Standard'],['rich','Rich']], { authoringModes: 'prompt', group: 'Generation Direction', groupIcon: 'fa-solid fa-wand-magic-sparkles' }),
        { id: 'tableTone', label: 'Tone / theme', value: '', inputType: 'text', showForTemplate: ALL_PROFILES, authoringModes: 'prompt', group: 'Generation Direction', groupIcon: 'fa-solid fa-wand-magic-sparkles' },
        { id: 'additionalContext', label: 'Additional context', value: '', inputType: 'textarea', fullWidth: true, showForTemplate: ALL_PROFILES, authoringModes: 'prompt', group: 'Generation Direction', groupIcon: 'fa-solid fa-wand-magic-sparkles' }
    ];
}

export function getRollTablePromptCheckboxes() {
    const checkboxes = [
        { id: 'includeResultImages', label: 'Include Result Images', checked: false, authoringModes: 'json prompt', showForTemplate: ALL_PROFILES, section: 'Table Structure', sectionIcon: 'fa-solid fa-table-list' },
        { id: 'sourceWorld', label: 'Include world documents', checked: true, authoringModes: 'json prompt', showForTemplate: ALL_PROFILES, section: 'Sources', sectionIcon: 'fa-solid fa-globe' }
    ];
    for (const [type, label] of DOCUMENT_TYPES) {
        const packs = getConfiguredCompendiums(type);
        for (const pack of packs) {
            checkboxes.push({
                id: `${PACK_PREFIX}${type}:${pack.id}`, label: pack.label, checked: true,
                authoringModes: 'json prompt', showForTemplate: ALL_PROFILES,
                showForField: `catalogDocumentType=${type}`,
                section: `${label} Compendiums`, sectionIcon: type === 'Actor' ? 'fa-solid fa-dragon' : 'fa-solid fa-books',
                bulkSelectable: true
            });
        }
    }
    return checkboxes;
}

function parseResultCount(value) {
    const count = Number.parseInt(String(value ?? '20'), 10);
    if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Result count must be a whole number from 1 to 200.');
    return count;
}

function selectedPackIds(options, type) {
    const prefix = `${PACK_PREFIX}${type}:`;
    const keys = Object.keys(options).filter(key => key.startsWith(prefix));
    if (keys.length) return keys.filter(key => options[key]).map(key => key.slice(prefix.length));
    return getConfiguredCompendiums(type).map(pack => pack.id);
}

async function buildFilteredCatalog(key, options, onProgress) {
    if (key === 'text' && options.textCatalogPolicy === 'none') {
        return { rows: [], text: '', sources: [], enabled: false };
    }
    const kind = String(options.catalogDocumentType || 'Actor');
    const nameSearch = kind === 'Actor'
        ? options.actorNameSearch
        : (kind === 'Item' ? options.itemNameSearch : options.documentNameSearch);
    const filters = { ...options, nameSearch: String(nameSearch || '') };
    const packIds = selectedPackIds(options, kind);
    const sources = [];
    const rows = [];
    if (options.sourceWorld !== false) {
        sources.push('world');
        rows.push(...await queryImportCatalog({ kind, source: 'world', filters, onProgress }));
    }
    if (packIds.length) {
        sources.push(...packIds);
        rows.push(...await queryImportCatalog({ kind, source: 'compendium', packIds, filters, onProgress }));
    }
    const uniqueRows = [...new Map(rows.map(row => [row.uuid, row])).values()];
    return { rows: uniqueRows, text: formatImportCatalog(uniqueRows, kind, { includeImages: !!options.includeResultImages }), sources, enabled: sources.length > 0 };
}

function buildTableDirectives(key, options) {
    const lines = [
        `- Create exactly ${parseResultCount(options.resultCount)} result rows.`,
        `- Result type: ${key}.`,
        `- Draw with replacement: ${options.drawWithReplacement !== 'false'}.`,
        `- Display roll formula: ${options.displayRollFormula === 'true'}.`,
        `- Weighting: ${options.weightingMode === 'manual' ? 'intentional manual weights/ranges' : 'equal weights with contiguous one-number ranges'}.`,
        `- Duplicates: ${options.duplicatePolicy === 'allow' ? 'allowed when useful' : 'avoid duplicate result names'}.`,
        `- Result images: ${options.includeResultImages ? 'copy known catalog image paths' : 'leave resultImagePath blank'}.`
    ];
    if (key === 'document') {
        lines.push(`- Document lookup type: ${options.catalogDocumentType || 'Actor'}.`);
        lines.push(`- Set missingDocumentPolicy to "${options.referencePolicy === 'fallback' ? 'text' : 'error'}" (${options.referencePolicy === 'fallback' ? 'create a Text result when lookup fails' : 'fail rather than invent or silently downgrade'}).`);
        lines.push('- Use exact catalog names and their displayed source ids. Do not output UUIDs; Blacksmith resolves them during import.');
    } else {
        const policy = String(options.textCatalogPolicy || 'exact');
        if (policy === 'exact') {
            lines.push('- Catalog policy: EXACT NAMES. Select entries from the filtered catalog and copy each chosen name verbatim into resultText. Do not rename, paraphrase, embellish, or replace catalog entries.');
        } else if (policy === 'inspired') {
            lines.push('- Catalog policy: INSPIRATION ONLY. Newly authored or embellished resultText is allowed; catalog-name fidelity is not required.');
        } else {
            lines.push('- Catalog policy: NONE. Create original Text results without using a catalog.');
        }
        lines.push('- Text means the Foundry result is not UUID-linked. It does not, by itself, require renaming or rewording catalog content.');
    }
    if (options.tablePurpose) lines.push(`- Purpose: ${options.tablePurpose}.`);
    if (options.tableDetail) {
        const detailScope = key === 'text' && String(options.textCatalogPolicy || 'exact') === 'exact'
            ? ' Apply this to tableName, tableDescription, and thoughtful catalog selection only; resultText must remain the exact catalog name.'
            : '';
        lines.push(`- Detail: ${options.tableDetail}.${detailScope}`);
    }
    if (options.tableTone) lines.push(`- Tone/theme: ${options.tableTone}.`);
    if (options.additionalContext) lines.push(`- Additional context: ${options.additionalContext}`);
    return lines.join('\n');
}

export async function buildRollTableImportPrompt(templateKey, options = {}, onProgress) {
    const key = String(templateKey || 'text').toLowerCase();
    const profileFile = ROLLTABLE_PROMPT_PROFILES[key];
    if (!profileFile) throw new Error(`Unsupported Roll Table result type: ${templateKey}`);
    let composed = composePrompt([await fetchPromptText(ROLLTABLE_PROMPT_CORE), await fetchPromptText(profileFile)]);
    composed = await applyCampaignPlaceholders(composed);
    const catalog = await buildFilteredCatalog(key, options, onProgress);
    if (key === 'text' && String(options.textCatalogPolicy || 'exact') === 'exact' && !catalog.rows.length) {
        throw new Error('Exact Names was selected, but no matching catalog entries were found in the selected sources.');
    }
    if (key === 'text' && String(options.textCatalogPolicy || 'exact') === 'exact' && options.duplicatePolicy !== 'allow' && catalog.rows.length < parseResultCount(options.resultCount)) {
        throw new Error(`Only ${catalog.rows.length} exact unique catalog entries remain for ${parseResultCount(options.resultCount)} requested Text rows. Broaden the filters, select more sources, lower the count, allow duplicates, or choose Inspiration Only.`);
    }
    if (key === 'document' && !catalog.rows.length) throw new Error('No matching documents were found in the selected sources.');
    if (key === 'document' && options.referencePolicy !== 'fallback' && options.duplicatePolicy !== 'allow' && catalog.rows.length < parseResultCount(options.resultCount)) {
        throw new Error(`Only ${catalog.rows.length} exact unique matches remain for ${parseResultCount(options.resultCount)} requested rows. Broaden the filters, select more sources, lower the count, allow duplicates, or enable text fallback.`);
    }
    if (catalog.enabled) composed += `\n\n========================================\nFILTERED CATALOG\n========================================\n\nDocument type: ${options.catalogDocumentType || 'Actor'}\nSelected sources: ${catalog.sources.join(', ')}\nMatching entries: ${catalog.rows.length}\n\n${catalog.text}\n`;
    composed += `\n\n========================================\nGENERATION DIRECTION (AUTHORITATIVE)\n========================================\n\n${buildTableDirectives(key, options)}\n`;
    return composed;
}

export async function buildRollTableJsonTemplate(templateKey, options = {}) {
    const key = String(templateKey || 'text').toLowerCase();
    if (!ROLLTABLE_PROMPT_PROFILES[key]) throw new Error(`Unsupported Roll Table result type: ${templateKey}`);
    const count = parseResultCount(options.resultCount);
    const results = Array.from({ length: count }, (_, index) => ({
        resultType: key,
        resultImagePath: '',
        resultDocumentType: key === 'document' ? String(options.catalogDocumentType || 'Actor') : '',
        resultDocumentSource: '',
        resultText: '',
        resultWeight: 1,
        resultRangeLower: index + 1,
        resultRangeUpper: index + 1
    }));
    return JSON.stringify([{
        tableName: '', tableDescription: '', tableImagePath: '',
        drawWithReplacement: options.drawWithReplacement !== 'false',
        displayRollFormula: options.displayRollFormula === 'true',
        missingDocumentPolicy: key === 'document' && options.referencePolicy === 'fallback' ? 'text' : 'error',
        results
    }], null, 2);
}

export async function buildRollTableAuthoringGuide(templateKey, options = {}, onProgress) {
    const key = String(templateKey || 'text').toLowerCase();
    const json = await buildRollTableJsonTemplate(key, options);
    const catalog = await buildFilteredCatalog(key, options, onProgress);
    const catalogSection = catalog.enabled
        ? `\nFILTERED CATALOG\n\nDocument type: ${options.catalogDocumentType || 'Actor'}\nSelected sources: ${catalog.sources.join(', ')}\nMatching entries: ${catalog.rows.length}\n\n${catalog.text}\n`
        : '';
    return `BLACKSMITH ROLL TABLE JSON AUTHORING GUIDE

Edit the JSON block, then paste only its JSON array into Import JSON.

Selected contract
${buildTableDirectives(key, options)}
- Text results are never linked.
- Document results use an exact plain-text name, document type, and optional source id. Blacksmith resolves the UUID during import.
- Ranges must be positive, ordered, and non-overlapping. Keep JSON types intact and do not add comments or trailing commas.
${catalogSection}
JSON TEMPLATE

\`\`\`json
${json}
\`\`\`
`;
}

export const ROLLTABLE_JSON_IMPORT_KIND_ID = 'rolltable';
registerJsonImportKind({
    id: ROLLTABLE_JSON_IMPORT_KIND_ID,
    gmOnly: true,
    buttonHtml: '<i class="fa-solid fa-dice-d20"></i> Import',
    idSuffix: 'rolltable', windowTitle: 'Import JSON', headerTitle: 'Import Roll Table',
    windowIcon: 'fa-solid fa-dice-d20', position: { width: 920, height: 680 },
    templateOptions: ROLLTABLE_TEMPLATE_OPTIONS,
    get promptCheckboxes() { return getRollTablePromptCheckboxes(); },
    get promptFields() { return getRollTablePromptFields(); },
    onBuildPrompt: buildRollTableImportPrompt,
    onBuildJsonTemplate: buildRollTableJsonTemplate,
    onBuildAuthoringGuide: buildRollTableAuthoringGuide,
    onValidateEntry: async (entry) => {
        if (!String(entry?.tableName || '').trim()) throw new Error('tableName is required.');
        if (!Array.isArray(entry?.results) || !entry.results.length) throw new Error('results must contain at least one table result.');
        return parseTableToFoundry(entry);
    },
    onImportEntry: async (entry) => {
        const [created] = await RollTable.createDocuments([await parseTableToFoundry(entry)], { keepId: false });
        return created;
    }
});
