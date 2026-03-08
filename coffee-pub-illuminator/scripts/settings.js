/**
 * Illuminator settings: image replacement, dead tokens, path helpers.
 * Uses MODULE.ID for all keys. Sound choices for dead tokens come from Blacksmith when provided.
 */
import { MODULE } from './const.js';

const GROUP = 'illuminator';

function registerHeader(id, labelKey, hintKey, level = 'H2', group = GROUP, scope = 'world') {
    game.settings.register(MODULE.ID, `heading${level}${id}`, {
        name: MODULE.ID + '.' + labelKey,
        hint: MODULE.ID + '.' + hintKey,
        scope,
        config: true,
        default: '',
        type: String,
        group
    });
}

function registerImageReplacementPaths() {
    const numSetting = 'numImageReplacementPaths';
    if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) return;
    const numPaths = game.settings.get(MODULE.ID, numSetting) ?? 1;
    for (let i = 1; i <= numPaths; i++) {
        const settingKey = `tokenImageReplacementPath${i}`;
        if (game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) continue;
        game.settings.register(MODULE.ID, settingKey, {
            name: `Folder ${i}`,
            hint: '',
            type: String,
            config: true,
            scope: 'world',
            default: '',
            filePicker: 'folder',
            requiresReload: false,
            group: GROUP
        });
    }
}

function registerPortraitImageReplacementPaths() {
    const numSetting = 'numPortraitImageReplacementPaths';
    if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) return;
    const numPaths = game.settings.get(MODULE.ID, numSetting) ?? 1;
    for (let i = 1; i <= numPaths; i++) {
        const settingKey = `portraitImageReplacementPath${i}`;
        if (game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) continue;
        game.settings.register(MODULE.ID, settingKey, {
            name: `Folder ${i}`,
            hint: '',
            type: String,
            config: true,
            scope: 'world',
            default: '',
            filePicker: 'folder',
            requiresReload: false,
            group: GROUP
        });
    }
}

export function getTokenImagePaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numImageReplacementPaths') ?? 1;
    const paths = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `tokenImageReplacementPath${i}`) || '';
        if (path && path.trim() !== '') paths.push(path.trim());
    }
    return paths;
}

export function getPortraitImagePaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numPortraitImageReplacementPaths') ?? 1;
    const paths = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `portraitImageReplacementPath${i}`) || '';
        if (path && path.trim() !== '') paths.push(path.trim());
    }
    return paths;
}

export function getTokenImageReplacementCacheStats() {
    return game.settings.get(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus') || '';
}

/**
 * Register all Illuminator settings. Call from ready hook; pass Blacksmith API for sound choices.
 * @param {Object} [blacksmithApi] - Blacksmith module.api; used for arrSoundChoices on dead token sound settings.
 */
export function registerSettings(blacksmithApi) {
    const soundChoices = (blacksmithApi?.BLACKSMITH?.arrSoundChoices) || { none: 'None' };

    // ----- Dead Tokens -----
    registerHeader('DeadTokens', 'headingH2DeadTokens-Label', 'headingH2DeadTokens-Hint', 'H2', GROUP, 'world');
    registerHeader('DeadConfiguration', 'headingH3DeadConfiguration-Label', 'headingH3DeadConfiguration-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'enableDeadTokenReplacement', {
        name: MODULE.ID + '.enableDeadTokenReplacement-Label',
        hint: MODULE.ID + '.enableDeadTokenReplacement-Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenCreatureTypeFilter', {
        name: MODULE.ID + '.deadTokenCreatureTypeFilter-Label',
        hint: MODULE.ID + '.deadTokenCreatureTypeFilter-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        requiresReload: false,
        group: GROUP
    });

    registerHeader('DeadExperience', 'headingH3DeadExperience-Label', 'headingH3DeadExperience-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'deadTokenImagePath', {
        name: MODULE.ID + '.deadTokenImagePath-Label',
        hint: MODULE.ID + '.deadTokenImagePath-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-npc.webp',
        requiresReload: false,
        filePicker: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenSoundNPC', {
        name: MODULE.ID + '.deadTokenSoundNPC-Label',
        hint: MODULE.ID + '.deadTokenSoundNPC-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'none',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenImagePathPC', {
        name: MODULE.ID + '.deadTokenImagePathPC-Label',
        hint: MODULE.ID + '.deadTokenImagePathPC-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-pc.webp',
        requiresReload: false,
        filePicker: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenSoundPC', {
        name: MODULE.ID + '.deadTokenSoundPC-Label',
        hint: MODULE.ID + '.deadTokenSoundPC-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'none',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenSoundStable', {
        name: MODULE.ID + '.deadTokenSoundStable-Label',
        hint: MODULE.ID + '.deadTokenSoundStable-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'none',
        group: GROUP
    });

    // ----- Token and Portrait Image Replacement -----
    registerHeader('TokenImagePortraitReplacement', 'headingH2TokenImagePortraitReplacement-Label', 'headingH2TokenImagePortraitReplacement-Hint', 'H2', GROUP, 'world');
    registerHeader('headingH3TokenReplaceShared', 'headingH3TokenReplaceShared-Label', 'headingH3TokenReplaceShared-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', {
        name: MODULE.ID + '.tokenImageReplacementShowInCoffeePubToolbar-Label',
        hint: MODULE.ID + '.tokenImageReplacementShowInCoffeePubToolbar-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', {
        name: MODULE.ID + '.tokenImageReplacementShowInFoundryToolbar-Label',
        hint: MODULE.ID + '.tokenImageReplacementShowInFoundryToolbar-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementCategoryStyle', {
        name: MODULE.ID + '.tokenImageReplacementCategoryStyle-Label',
        hint: MODULE.ID + '.tokenImageReplacementCategoryStyle-Hint',
        scope: 'world',
        config: true,
        type: String,
        choices: { buttons: 'Buttons', tabs: 'Tabs' },
        default: 'buttons',
        requiresReload: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementTagSortMode', {
        name: MODULE.ID + '.tokenImageReplacementTagSortMode-Label',
        hint: MODULE.ID + '.tokenImageReplacementTagSortMode-Hint',
        scope: 'world',
        config: true,
        type: String,
        choices: { count: 'Count (by frequency)', alpha: 'Alpha (alphabetical)', hidden: 'Hidden (hide tags)' },
        default: 'count',
        requiresReload: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementLastMode', {
        scope: 'world',
        config: false,
        type: String,
        default: 'token',
        choices: { token: 'Token', portrait: 'Portrait' },
        group: GROUP
    });

    registerHeader('TokenImageReplacementDataWeights', 'headingH3TokenImageReplacementDataWeights-Label', 'headingH3TokenImageReplacementDataWeights-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementMonsterMapping', {
        type: Object,
        config: false,
        scope: 'world',
        default: {},
        group: GROUP
    });

    const weight = (key, def) => ({
        name: MODULE.ID + '.' + key + '-Label',
        hint: MODULE.ID + '.' + key + '-Hint',
        type: Number,
        config: true,
        scope: 'world',
        range: { min: 0, max: 100, step: 5 },
        default: def,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightActorName', weight('tokenImageReplacementWeightActorName', 90));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightTokenName', weight('tokenImageReplacementWeightTokenName', 70));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor', weight('tokenImageReplacementWeightRepresentedActor', 50));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureType', weight('tokenImageReplacementWeightCreatureType', 15));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype', weight('tokenImageReplacementWeightCreatureSubtype', 15));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightEquipment', weight('tokenImageReplacementWeightEquipment', 10));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightSize', weight('tokenImageReplacementWeightSize', 3));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightTags', weight('tokenImageReplacementWeightTags', 25));

    registerHeader('TokenImageReplacementIgnored', 'TokenImageReplacementIgnored-Label', 'TokenImageReplacementIgnored-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredFolders', {
        name: MODULE.ID + '.tokenImageReplacementIgnoredFolders-Label',
        hint: MODULE.ID + '.tokenImageReplacementIgnoredFolders-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '.DS_Store',
        requiresReload: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementDeprioritizedWords', {
        name: MODULE.ID + '.tokenImageReplacementDeprioritizedWords-Label',
        hint: MODULE.ID + '.tokenImageReplacementDeprioritizedWords-Hint',
        type: String,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: 'spirit',
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredWords', {
        name: MODULE.ID + '.tokenImageReplacementIgnoredWords-Label',
        hint: MODULE.ID + '.tokenImageReplacementIgnoredWords-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        requiresReload: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredTagPatterns', {
        name: MODULE.ID + '.tokenImageReplacementIgnoredTagPatterns-Label',
        hint: MODULE.ID + '.tokenImageReplacementIgnoredTagPatterns-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        requiresReload: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementFilterGarbageTags', {
        name: MODULE.ID + '.tokenImageReplacementFilterGarbageTags-Label',
        hint: MODULE.ID + '.tokenImageReplacementFilterGarbageTags-Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
        group: GROUP
    });

    registerHeader('headingH3TokenReplacement', 'headingH3TokenReplacement-Label', 'headingH3TokenReplacement-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementEnabled', {
        name: MODULE.ID + '.tokenImageReplacementEnabled-Label',
        hint: MODULE.ID + '.tokenImageReplacementEnabled-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateDropped', {
        name: MODULE.ID + '.tokenImageReplacementUpdateDropped-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateDropped-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementThreshold', {
        name: MODULE.ID + '.tokenImageReplacementThreshold-Label',
        hint: MODULE.ID + '.tokenImageReplacementThreshold-Hint',
        type: Number,
        config: true,
        requiresReload: false,
        scope: 'world',
        range: { min: 0.1, max: 1.0, step: 0.05 },
        default: 0.3,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementFuzzySearch', {
        name: MODULE.ID + '.tokenImageReplacementFuzzySearch-Label',
        hint: MODULE.ID + '.tokenImageReplacementFuzzySearch-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementVariability', {
        name: MODULE.ID + '.tokenImageReplacementVariability-Label',
        hint: MODULE.ID + '.tokenImageReplacementVariability-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateMonsters', {
        name: MODULE.ID + '.tokenImageReplacementUpdateMonsters-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateMonsters-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateNPCs', {
        name: MODULE.ID + '.tokenImageReplacementUpdateNPCs-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateNPCs-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateVehicles', {
        name: MODULE.ID + '.tokenImageReplacementUpdateVehicles-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateVehicles-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateActors', {
        name: MODULE.ID + '.tokenImageReplacementUpdateActors-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateActors-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementSkipLinked', {
        name: MODULE.ID + '.tokenImageReplacementSkipLinked-Label',
        hint: MODULE.ID + '.tokenImageReplacementSkipLinked-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    registerHeader('TokenImageReplacementCache', 'headingH3TokenImageReplacementCache-Label', 'headingH3TokenImageReplacementCache-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementCache', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        requiresReload: false
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementWindowState', {
        scope: 'client',
        config: false,
        type: Object,
        default: {},
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementDisplayCacheStatus', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'portraitImageReplacementCache', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        requiresReload: false
    });

    game.settings.register(MODULE.ID, 'numImageReplacementPaths', {
        name: MODULE.ID + '.numImageReplacementPaths-Label',
        hint: MODULE.ID + '.numImageReplacementPaths-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1,
        range: { min: 0, max: 15, step: 1 },
        requiresReload: true,
        group: GROUP
    });
    registerImageReplacementPaths();

    registerHeader('PortraitImageReplacement', 'headingH3PortraitImageReplacement-Label', 'headingH3PortraitImageReplacement-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'portraitImageReplacementEnabled', {
        name: MODULE.ID + '.portraitImageReplacementEnabled-Label',
        hint: MODULE.ID + '.portraitImageReplacementEnabled-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateDropped', {
        name: MODULE.ID + '.portraitImageReplacementUpdateDropped-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateDropped-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementThreshold', {
        name: MODULE.ID + '.portraitImageReplacementThreshold-Label',
        hint: MODULE.ID + '.portraitImageReplacementThreshold-Hint',
        type: Number,
        config: true,
        requiresReload: false,
        scope: 'world',
        range: { min: 0.1, max: 1.0, step: 0.05 },
        default: 0.3,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementFuzzySearch', {
        name: MODULE.ID + '.portraitImageReplacementFuzzySearch-Label',
        hint: MODULE.ID + '.portraitImageReplacementFuzzySearch-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementVariability', {
        name: MODULE.ID + '.portraitImageReplacementVariability-Label',
        hint: MODULE.ID + '.portraitImageReplacementVariability-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateMonsters', {
        name: MODULE.ID + '.portraitImageReplacementUpdateMonsters-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateMonsters-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateNPCs', {
        name: MODULE.ID + '.portraitImageReplacementUpdateNPCs-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateNPCs-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateVehicles', {
        name: MODULE.ID + '.portraitImageReplacementUpdateVehicles-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateVehicles-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateActors', {
        name: MODULE.ID + '.portraitImageReplacementUpdateActors-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateActors-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementSkipLinked', {
        name: MODULE.ID + '.portraitImageReplacementSkipLinked-Label',
        hint: MODULE.ID + '.portraitImageReplacementSkipLinked-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    registerHeader('PortraitImageReplacementCache', 'headingH3PortraitImageReplacementCache-Label', 'headingH3PortraitImageReplacementCache-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'numPortraitImageReplacementPaths', {
        name: MODULE.ID + '.numPortraitImageReplacementPaths-Label',
        hint: MODULE.ID + '.numPortraitImageReplacementPaths-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1,
        range: { min: 0, max: 15, step: 1 },
        requiresReload: true,
        group: GROUP
    });
    registerPortraitImageReplacementPaths();
}
