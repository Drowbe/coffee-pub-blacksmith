// ==================================================================
// ===== REGENT BOOTSTRAP ===========================================
// ==================================================================

import { registerWindowQueryPartials } from './window-query-registration.js';
import { OpenAIAPI } from './api-openai.js';
import { buildButtonEventRegent } from './regent.js';
import { registerRegentSettings } from './regent-settings.js';
import { BlacksmithAPI } from '../../api/blacksmith-api.js';

function onInit() {
    registerRegentSettings();
}

async function onReady() {
    await registerWindowQueryPartials();
    OpenAIAPI.initializeMemory();

    const api = await BlacksmithAPI.get();
    if (!api?.registerToolbarTool) return;

    const regent = () => buildButtonEventRegent('default');
    api.registerToolbarTool('regent', {
        icon: 'fa-solid fa-crystal-ball',
        name: 'regent',
        title: 'Consult the Regent',
        button: true, visible: true, onCoffeePub: true, onFoundry: false,
        onClick: regent, moduleId: 'coffee-pub-regent', zone: 'utilities', order: 10
    });
    api.registerToolbarTool('lookup', {
        icon: 'fa-solid fa-bolt-lightning', name: 'lookup', title: 'Open Lookup Worksheet',
        button: true, visible: true, onCoffeePub: true, onFoundry: false,
        onClick: () => buildButtonEventRegent('lookup'), moduleId: 'coffee-pub-regent', zone: 'utilities', order: 20
    });
    api.registerToolbarTool('character', {
        icon: 'fa-solid fa-helmet-battle', name: 'character', title: 'Open Character Worksheet',
        button: true, visible: true, onCoffeePub: true, onFoundry: false,
        onClick: () => buildButtonEventRegent('character'), moduleId: 'coffee-pub-regent', zone: 'utilities', order: 30
    });
    api.registerToolbarTool('assistant', {
        icon: 'fa-solid fa-hammer-brush', name: 'assistant', title: 'Open Assistant Worksheet',
        button: true, visible: true, gmOnly: true, onCoffeePub: true, onFoundry: false,
        onClick: () => buildButtonEventRegent('assistant'), moduleId: 'coffee-pub-regent', zone: 'utilities', order: 10
    });
    api.registerToolbarTool('encounter', {
        icon: 'fa-solid fa-sword', name: 'encounter', title: 'Open Encounter Worksheet',
        button: true, visible: true, gmOnly: true, onCoffeePub: true, onFoundry: false,
        onClick: () => buildButtonEventRegent('encounter'), moduleId: 'coffee-pub-regent', zone: 'utilities', order: 20
    });
    api.registerToolbarTool('narrative', {
        icon: 'fa-solid fa-book-open-reader', name: 'narrative', title: 'Open Narrative Worksheet',
        button: true, visible: true, gmOnly: true, onCoffeePub: true, onFoundry: false,
        onClick: () => buildButtonEventRegent('narrative'), moduleId: 'coffee-pub-regent', zone: 'utilities', order: 30
    });
}

Hooks.once('init', onInit);
Hooks.once('ready', onReady);
