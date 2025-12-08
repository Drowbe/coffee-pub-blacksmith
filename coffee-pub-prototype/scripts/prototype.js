// ================================================================== 
// ===== MODULE IMPORTS =============================================
// ================================================================== 

import { MODULE } from './const.js';

// ================================================================== 
// ===== BLACKSMITH API INTEGRATION =================================
// ================================================================== 

// Import Blacksmith API bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

// ================================================================== 
// ===== MODULE INITIALIZATION ======================================
// ================================================================== 

Hooks.once('ready', async () => {
    try {
        // Register settings FIRST during the ready phase
        registerSettings();
        
        // Register module with Blacksmith
        if (typeof BlacksmithModuleManager !== 'undefined') {
            BlacksmithModuleManager.registerModule(MODULE.ID, {
                name: MODULE.NAME,
                version: MODULE.VERSION
            });
            console.log(`✅ ${MODULE.NAME}: Registered with Blacksmith successfully`);
        } else {
            console.warn(`⚠️ ${MODULE.NAME}: Blacksmith not available`);
        }
        
        // Initialize module features
        initializeModule();
        
    } catch (error) {
        console.error(`❌ ${MODULE.NAME}: Error during initialization:`, error);
    }
});

// ================================================================== 
// ===== MODULE FUNCTIONS ===========================================
// ================================================================== 

/**
 * Initialize module features
 */
function initializeModule() {
    // Add your module initialization code here
    console.log(`${MODULE.NAME}: Module initialized`);
}

