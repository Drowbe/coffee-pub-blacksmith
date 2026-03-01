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
    const blacksmithApi = await BlacksmithAPI.get();
    const macroChoices = blacksmithApi?.BLACKSMITH?.arrMacroChoices ?? null;

    // Register Regent settings (macro dropdown uses API when available; game systems are Regent-owned)
    registerRegentSettings(macroChoices);

    await registerWindowQueryPartials();
    OpenAIAPI.initializeMemory();

    const api = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!api?.registerToolbarTool) return;

    // Register Regent window with Blacksmith Window API so openWindow('consult-regent') works
    if (api.registerWindow) {
        api.registerWindow('consult-regent', {
            open: (options = {}) => {
                const mode = options?.mode ?? 'default';
                const p = buildButtonEventRegent(mode);
                if (p && typeof p.catch === 'function') {
                    p.catch((err) => {
                        console.error('Regent: failed to open window', err);
                        ui.notifications?.error?.(err?.message ?? 'Failed to open Consult the Regent.');
                    });
                }
                return p;
            },
            title: 'Consult the Regent',
            moduleId: 'coffee-pub-regent'
        });
    }

    // Toolbar/menubar: open via Window API so content-area and toolbar use same path and error handling
    const regent = (_event) => {
        if (!api.openWindow) {
            buildButtonEventRegent('default').catch((err) => {
                console.error('Regent: failed to open window', err);
                ui.notifications?.error?.(err?.message ?? 'Failed to open Consult the Regent.');
            });
            return;
        }
        const result = api.openWindow('consult-regent', { mode: 'default' });
        if (result && typeof result.catch === 'function') {
            result.catch((err) => {
                console.error('Regent: failed to open window', err);
                ui.notifications?.error?.(err?.message ?? 'Failed to open Consult the Regent.');
            });
        }
    };
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
