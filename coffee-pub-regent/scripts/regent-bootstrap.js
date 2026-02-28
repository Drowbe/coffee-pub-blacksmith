// ==================================================================
// ===== REGENT BOOTSTRAP ===========================================
// ==================================================================

import { registerWindowQueryPartials } from './window-query-registration.js';
import { OpenAIAPI } from './api-openai.js';
import { buildButtonEventRegent } from './regent.js';
import { registerRegentSettings } from './regent-settings.js';
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

async function onReady() {
    // Expose OpenAI API for other modules (e.g. dependents that want AI without implementing their own)
    const regentModule = game.modules.get('coffee-pub-regent');
    if (regentModule) {
        regentModule.api = regentModule.api || {};
        regentModule.api.openai = OpenAIAPI;
    }

    // Get Blacksmith API first so we can use it for macro choices (API-only access)
    const api = await BlacksmithAPI.get();
    const macroChoices = api?.BLACKSMITH?.arrMacroChoices ?? null;

    // Register Regent settings (macro dropdown uses API when available; game systems are Regent-owned)
    registerRegentSettings(macroChoices);

    await registerWindowQueryPartials();
    OpenAIAPI.initializeMemory();

    if (!api?.registerToolbarTool) return;

    const regent = () => buildButtonEventRegent('default');
    api.registerToolbarTool('regent', {
        icon: 'fa-solid fa-crystal-ball',
        name: 'regent',
        title: 'Consult the Regent',
        button: true, visible: true, onCoffeePub: true, onFoundry: false,
        onClick: regent, moduleId: 'coffee-pub-regent', zone: 'utilities', order: 10
    });
}

Hooks.once('ready', onReady);

Hooks.once('disableModule', (moduleId) => {
    if (moduleId === 'coffee-pub-regent') {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        api?.unregisterWindow?.('consult-regent');
        api?.unregisterToolbarTool?.('regent');
    }
});
