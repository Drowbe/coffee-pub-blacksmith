// ================================================================== 
// ===== MODULE IMPORTS =============================================
// ================================================================== 

import { MODULE } from './const.js';
import { registerSettings } from './settings.js';

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



// ========== BEGIN: BLACKSMITH API TESTING ==========
// Remove after setup
// This test assumes that the Blacksmith module is installed and properly configured.
// It is best to filter for the word "API TEST" in console to see the results of the tests.
// Be sure to set you module ID in the TEST_MODULE_ID variable below.

Hooks.once('ready', async () => {

    // !! IMPORTANT !! SET YOUR MODULE ID HERE !!
    const TEST_MODULE_ID = MODULE.ID; // <-------- Replace with your actual module ID

    try {
        // ----- CONSTANTS TEST INSTRUCTIONS
        console.log('API TEST | ');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  CONSTANTS TEST INSTRUCTIONS              ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ');
        console.log('API TEST | 1. You should see the themeChoices, soundChoices, and tableChoices in the console.');
        console.log('API TEST | 2. Expand the objects and you should see the choices.');
        console.log('API TEST | If you see values, your constants worked!');
        console.log('API TEST | ');

        const themeChoices = BlacksmithConstants.arrThemeChoices;
        const soundChoices = BlacksmithConstants.arrSoundChoices;
        const tableChoices = BlacksmithConstants.arrTableChoices;    
        console.log('API TEST | BLACKSMITH TEST: themeChoices', themeChoices);
        console.log('API TEST | BLACKSMITH TEST: soundChoices', soundChoices);
        console.log('API TEST | BLACKSMITH TEST: tableChoices', tableChoices);

        console.log('API TEST | ==== NON-EXPOSED VARIABLE TEST INSTRUCTIONS: ====');
        console.log('API TEST | 1. You should see the Blacksmith version in the console.');
        console.log('API TEST | 2. It should be followed by a value.');
        console.log('API TEST | If you see a value, your the non-exposed variables worked!');
        console.log('API TEST | ');
        // Access non-exposed variables
        console.log('API TEST | BLACKSMITH TEST: Blacksmith version:', game.modules.get('coffee-pub-blacksmith')?.api?.version);

        // ----- UTILITY TESTS: NOTIFICATION TEST
        console.log('API TEST | ');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  UTILITY TESTS: NOTIFICATION TEST         ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | 1. You should see the message "API TEST | BLACKSMITH TEST OF POSTCONSOLEANDNOTIFICATION" in the console.');
        console.log('API TEST | 2. It should be followed by a value "Some awesome result".');
        console.log('API TEST | 3. The log will start with "COFFEEPUB" to show the formatted utility output.');
        console.log('API TEST | 4. A notification should appear at the top of Foundry.');
        console.log('API TEST | 5. If you see both, your utility functions worked!');
        console.log('API TEST | ');

        BlacksmithUtils.postConsoleAndNotification(
            TEST_MODULE_ID,
            'API TEST | BLACKSMITH TEST OF POSTCONSOLEANDNOTIFICATION',
            'Some awesome result',
            false,
            true
        );

        // ----- SAFE SETTINGS TEST
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  SAFE SETTINGS TEST INSTRUCTIONS          ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | 1. This test will fail with "not a registered game setting" - this is EXPECTED!');
        console.log('API TEST | 2. The error proves Blacksmith is properly integrated with FoundryVTT settings.');
        console.log('API TEST | 3. In real usage, you would register your settings first in your module.json or init hook.');
        console.log('API TEST | 4. If you see the error message, your safe settings integration is working correctly!');
        console.log('API TEST | ');

        try {
            const defaultValue = BlacksmithUtils.getSettingSafely(TEST_MODULE_ID, 'test-setting', 'default-value');
            console.log('✅ API TEST | BLACKSMITH TEST: Safe get (before set) working:', defaultValue);

            const setSuccess = await BlacksmithUtils.setSettingSafely(TEST_MODULE_ID, 'test-setting', 'test-value-123');
            console.log('✅ API TEST | BLACKSMITH TEST: Safe set working:', setSuccess);

            const rawSetting = game.settings.get(TEST_MODULE_ID, 'test-setting');
            console.log('⚠️ API TEST | BLACKSMITH TEST: Raw FoundryVTT setting:', rawSetting);
        } catch (settingError) {
            console.log('✅ API TEST | BLACKSMITH TEST: Safe settings test completed as expected');
            console.log('⚠️ API TEST | BLACKSMITH TEST: Error shows proper FoundryVTT integration:', settingError);
        }

        // ----- HOOK MANAGER TEST
        console.log('API TEST | ==== HOOK MANAGER TEST INSTRUCTIONS: ====');
        console.log('API TEST | 1. You should see a hook registration confirmation.');
        console.log('API TEST | 2. The hook should unlock a notification when triggered.');
        console.log('API TEST | ');

        const hookName = 'createActor';
        const hookContext = TEST_MODULE_ID;

        const hookResult = BlacksmithHookManager.registerHook({
            name: hookName,
            description: 'API Test Hook',
            context: hookContext,
            priority: 50,
            key: `${hookContext}-${hookName}`,
            options: {},
            // BEGIN - HOOKMANAGER CALLBACK
            callback: async (actor) => {
                BlacksmithUtils.postConsoleAndNotification(TEST_MODULE_ID, 'API TEST | Hook triggered!', {
                    actorId: actor.id,
                    name: actor.name
                }, false, false);
            }
            // END - HOOKMANAGER CALLBACK
        });

        console.log('API TEST | Hook registration result:', hookResult);

        // ----- SOUND PLAYBACK TEST
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  SOUND PLAYBACK TEST INSTRUCTIONS        ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | 1. You should hear a "Battle Cry" sound.');
        console.log('API TEST | 2. If you do not hear a sound, click the canvas or ensure audio is playing.');
        console.log('API TEST | 3. If you hear a battle cry, your sound playback worked!');
        console.log('API TEST | ');

        try {
            BlacksmithUtils.playSound('modules/coffee-pub-blacksmith/sounds/battlecry.mp3', 0.7);
            console.log('✅ API TEST | BLACKSMITH TEST: Sound playback test completed');
        } catch (soundError) {
            console.error('❌ API TEST | BLACKSMITH TEST: Sound playback test failed:', soundError);
        }

        // ----- UTILS TEST
        console.log('API TEST | ==== UTILS TEST INSTRUCTIONS: ====');
        console.log('API TEST | 1. You should see a notification in the console.');
        console.log('API TEST | 2. The notification should contain your module ID.');
        console.log('API TEST | ');

        BlacksmithUtils.postConsoleAndNotification(TEST_MODULE_ID, 'API TEST | Utils working!', null, false, false);

        // ----- HOOK TEST - Use REAL FoundryVTT events
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  HOOK REGISTRATION TEST INSTRUCTIONS     ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | 1. You should see the message "API TEST | BLACKSMITH TEST: Hooks registered successfully".');
        console.log('API TEST | 2. It should be followed by an object showing token and chat hook IDs.');
        console.log('API TEST | ');

        const tokenHookId = BlacksmithHookManager.registerHook({
            name: 'updateToken',
            description: 'API TEST: Test hook for token updates',
            context: 'api-test-token',
            priority: 5,
            // BEGIN - HOOKMANAGER CALLBACK
            callback: (token, changes) => {
                console.log('🟣 API TEST | BLACKSMITH TEST: Token Updated:', { token, changes });
                BlacksmithUtils.postConsoleAndNotification(
                    TEST_MODULE_ID,
                    'API TEST | BLACKSMITH TEST: Token updated!',
                    { hookId: tokenHookId, tokenName: token?.name, tokenId: token?.id, changes },
                    false,
                    true
                );
            }
            // END - HOOKMANAGER CALLBACK
        });

        const chatHookId = BlacksmithHookManager.registerHook({
            name: 'renderChatMessage',
            description: 'API TEST: Test hook for chat messages',
            context: 'api-test-chat',
            priority: 5,
            // BEGIN - HOOKMANAGER CALLBACK
            callback: (message, html, data) => {
                console.log('🟣 API TEST | BLACKSMITH TEST: Chat Message Rendered:', { message, data });
                BlacksmithUtils.postConsoleAndNotification(
                    TEST_MODULE_ID,
                    'API TEST | BLACKSMITH TEST: Chat message rendered!',
                    { hookId: chatHookId, messageId: message?.id, content: message?.content },
                    false,
                    true
                );
            }
            // END - HOOKMANAGER CALLBACK
        });

        console.log('API TEST | BLACKSMITH TEST: Hooks registered successfully:', { tokenHookId, chatHookId });

        // ----- MODULE MANAGER TEST
        console.log('API TEST | ==== MODULE MANAGER TEST INSTRUCTIONS: ====');
        console.log('API TEST | 1. You should see your module registered in the module manager.');
        console.log('API TEST | 2. The registration should include your module ID and version.');
        console.log('API TEST | ');

        const moduleManager = BlacksmithModuleManager;
        const registeredModules = moduleManager.getRegisteredModules?.() || [];
        console.log('API TEST | Registered modules:', registeredModules);

        // ----- HOOK ACTIVATION TEST INSTRUCTIONS
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  HOOK ACTIVATION TEST INSTRUCTIONS       ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | 1. Move a token to trigger updateToken hook.');
        console.log('API TEST | 2. Send a chat message to trigger renderChatMessage hook.');
        console.log('API TEST | 3. If you see logging, your hooks worked!');
        console.log('API TEST | ');

        console.log('API TEST | ==== TEST COMPLETE: PLEASE REVIEW THE RESULTS ABOVE ====');

    } catch (error) {
        console.error('API TEST | BLACKSMITH TEST: Error during testing:', error);

        // Try to log the error with Blacksmith if available
        if (BlacksmithUtils && BlacksmithUtils.postConsoleAndNotification) {
            BlacksmithUtils.postConsoleAndNotification(
                TEST_MODULE_ID,
                'API TEST | BLACKSMITH TEST: Error occurred during testing',
                { error: error?.message, stack: error?.stack },
                false,
                true
            );
        }

        console.error('API TEST | ERROR OCCURRED DURING API TEST:', error);
    }
});
// ========== END: BLACKSMITH API TESTING ==========









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

