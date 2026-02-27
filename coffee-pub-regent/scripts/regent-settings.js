// ==================================================================
// ===== REGENT SETTINGS ============================================
// ==================================================================

import { MODULE } from './const.js';

const AI_GROUP = { name: "regent-ai", label: "Regent (AI)", hint: "OpenAI and Regent AI tools." };

export function registerRegentSettings() {
    game.settings.register(MODULE.ID, 'openAIMacro', {
        name: MODULE.ID + '.openAIMacro-Label',
        hint: MODULE.ID + '.openAIMacro-Hint',
        scope: 'world', config: true, requiresReload: true,
        type: String, default: '-- Choose a Macro --',
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
        type: String, default: 'dnd5e',
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
    game.settings.register(MODULE.ID, 'openAIDebug', {
        name: MODULE.ID + '.openAIDebug-Label',
        hint: MODULE.ID + '.openAIDebug-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: Boolean, default: false,
        group: AI_GROUP
    });
    game.settings.register(MODULE.ID, 'narrativeUseCookies', {
        name: MODULE.ID + '.narrativeUseCookies-Label',
        hint: MODULE.ID + '.narrativeUseCookies-Hint',
        scope: 'world', config: true, requiresReload: false,
        type: Boolean, default: false,
        group: AI_GROUP
    });
}
