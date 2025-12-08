// ================================================================== 
// ===== SETTINGS REGISTRATION ======================================
// ================================================================== 

import { MODULE } from './const.js';

/**
 * Register all module settings
 * Called during the 'ready' phase when Foundry is ready
 */
export const registerSettings = () => {
    
    // Example: Enable/Disable Feature Setting
    game.settings.register(MODULE.ID, 'enableFeature', {
        name: MODULE.ID + '.enableFeature-Label',
        hint: MODULE.ID + '.enableFeature-Hint',
        scope: 'world',
        config: true,
        default: true,
        type: Boolean
    });
    
    // Add more settings here as needed
    
    console.log(`${MODULE.NAME}: Settings registered`);
};

