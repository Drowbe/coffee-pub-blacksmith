// ==================================================================
// ===== REGENT SETTINGS ============================================
// ==================================================================

import { MODULE } from './const.js';

const AI_GROUP = { name: "regent-ai", label: "Regent (AI)", hint: "OpenAI and Regent AI tools." };

/** Game system choices for prompt optimization (Regent-owned, not from Blacksmith). */
const GAME_SYSTEM_CHOICES = {
    generic: 'Generic tabletop RPG',
    dnd5e: 'Dungeons & Dragons 5th Edition',
    pf2e: 'Pathfinder Second Edition',
    foundryIronsworn: 'Ironsworn'
};

/** Build macro dropdown choices from game.macros (fallback when Blacksmith API does not provide them). */
function getMacroChoicesLocal() {
    const choices = { none: '-- Choose a Macro --' };
    if (typeof game !== 'undefined' && game.macros) {
        const names = Array.from(game.macros.values()).map(m => m.name).sort();
        names.forEach(name => { choices[name] = name; });
    }
    return choices;
}

/**
 * Register Regent settings.
 * Macro dropdown: use Blacksmith API (arrMacroChoices) when provided; otherwise build from game.macros.
 * Game system dropdown: Regent-owned GAME_SYSTEM_CHOICES only.
 * @param {Object|null} [macroChoicesFromApi] - Optional macro choices from BlacksmithAPI.get().BLACKSMITH.arrMacroChoices
 */
export function registerRegentSettings(macroChoicesFromApi = null) {
    const macroChoices = macroChoicesFromApi ?? getMacroChoicesLocal();

    game.settings.register(MODULE.ID, 'openAIMacro', {
        name: MODULE.ID + '.openAIMacro-Label',
        hint: MODULE.ID + '.openAIMacro-Hint',
        scope: 'world', config: true, requiresReload: true,
        type: String,
        default: 'none',
        choices: macroChoices,
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAIAPIKey', {
        name: MODULE.ID + '.openAIAPIKey-Label',
        hint: MODULE.ID + '.openAIAPIKey-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: String, default: '',
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAIProjectId', {
        name: MODULE.ID + '.openAIProjectId-Label',
        hint: MODULE.ID + '.openAIProjectId-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: String, default: '',
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAIModel', {
        name: MODULE.ID + '.openAIModel-Label',
        hint: MODULE.ID + '.openAIModel-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: String, default: 'gpt-4o-mini',
        choices: {
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o Mini',
            'gpt-4-turbo': 'GPT-4 Turbo',
            'gpt-4': 'GPT-4',
            'gpt-3.5-turbo': 'GPT-3.5 Turbo'
        },
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAIGameSystems', {
        name: MODULE.ID + '.openAIGameSystems-Label',
        hint: MODULE.ID + '.openAIGameSystems-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: String,
        default: 'dnd5e',
        choices: GAME_SYSTEM_CHOICES,
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAIPrompt', {
        name: MODULE.ID + '.openAIPrompt-Label',
        hint: MODULE.ID + '.openAIPrompt-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: String,
        default: 'You are a helpful assistant for D&D 5e. Be concise and use proper terminology.',
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAIContextLength', {
        name: MODULE.ID + '.openAIContextLength-Label',
        hint: MODULE.ID + '.openAIContextLength-Hint',
        scope: 'world', config: true, requiresReload: true,
        type: Number, default: 10,
        range: { min: 0, max: 100, step: 5 },
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'openAITemperature', {
        name: MODULE.ID + '.openAITemperature-Label',
        hint: MODULE.ID + '.openAITemperature-Hint',
        scope: 'world', config: true, requiresReload: true,
        type: Number, default: 1,
        range: { min: 0, max: 2, step: 0.1 },
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'narrativeUseCookies', {
        name: MODULE.ID + '.narrativeUseCookies-Label',
        hint: MODULE.ID + '.narrativeUseCookies-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: Boolean, default: false,
        group: AI_GROUP
    });

    // Narrative worksheet defaults (stored for cookie fallbacks; config: false to keep UI minimal)
    game.settings.register(MODULE.ID, 'defaultNarrativeFolder', {
        name: MODULE.ID + '.defaultNarrativeFolder-Label',
        hint: MODULE.ID + '.defaultNarrativeFolder-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'defaultJournalPageTitle', {
        name: MODULE.ID + '.defaultJournalPageTitle-Label',
        hint: MODULE.ID + '.defaultJournalPageTitle-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'defaultCampaignRealm', {
        name: MODULE.ID + '.defaultCampaignRealm-Label',
        hint: MODULE.ID + '.defaultCampaignRealm-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'defaultCampaignRegion', {
        name: MODULE.ID + '.defaultCampaignRegion-Label',
        hint: MODULE.ID + '.defaultCampaignRegion-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'defaultCampaignArea', {
        name: MODULE.ID + '.defaultCampaignArea-Label',
        hint: MODULE.ID + '.defaultCampaignArea-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'defaultCampaignSite', {
        name: MODULE.ID + '.defaultCampaignSite-Label',
        hint: MODULE.ID + '.defaultCampaignSite-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultCardImage', {
        name: MODULE.ID + '.narrativeDefaultCardImage-Label',
        hint: MODULE.ID + '.narrativeDefaultCardImage-Hint',
        scope: 'world', config: false, type: String, default: '', choices: {}
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultImagePath', {
        name: MODULE.ID + '.narrativeDefaultImagePath-Label',
        hint: MODULE.ID + '.narrativeDefaultImagePath-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultIncludeEncounter', {
        name: MODULE.ID + '.narrativeDefaultIncludeEncounter-Label',
        hint: MODULE.ID + '.narrativeDefaultIncludeEncounter-Hint',
        scope: 'world', config: false, type: Boolean, default: false
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultIncludeTreasure', {
        name: MODULE.ID + '.narrativeDefaultIncludeTreasure-Label',
        hint: MODULE.ID + '.narrativeDefaultIncludeTreasure-Hint',
        scope: 'world', config: false, type: Boolean, default: false
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultXP', {
        name: MODULE.ID + '.narrativeDefaultXP-Label',
        hint: MODULE.ID + '.narrativeDefaultXP-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultTreasureDetails', {
        name: MODULE.ID + '.narrativeDefaultTreasureDetails-Label',
        hint: MODULE.ID + '.narrativeDefaultTreasureDetails-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
    game.settings.register(MODULE.ID, 'narrativeDefaultEncounterDetails', {
        name: MODULE.ID + '.narrativeDefaultEncounterDetails-Label',
        hint: MODULE.ID + '.narrativeDefaultEncounterDetails-Hint',
        scope: 'world', config: false, type: String, default: ''
    });
}
