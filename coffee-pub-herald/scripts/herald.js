// ==================================================================
// ===== HERALD - ENTRY POINT =======================================
// ==================================================================

import { MODULE } from './const.js';
import { registerSettings } from './settings.js';
import { HeraldManager } from './manager-herald.js';

Hooks.once('init', () => {
    registerSettings();
});

Hooks.once('ready', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error(`${MODULE.TITLE}: Blacksmith API not available. Herald requires Coffee Pub Blacksmith.`);
        return;
    }
    HeraldManager.initialize(blacksmith);
});
