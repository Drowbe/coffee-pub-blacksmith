# **Blacksmith External API Documentation**

> **For External Module Developers Only**
> 
> This document covers how **other FoundryVTT modules** can integrate with Coffee Pub Blacksmith. 
> 
> **If you're developing Blacksmith itself**, see `BLACKSMITH-ARCHITECTURE.md` for internal architecture details.

## **⚠️ Breaking Change Notice**

**Version 12.2.0+**: The API has been simplified to use global objects instead of async methods.

**Old way (broken):**
```javascript
const hookManager = await BlacksmithAPI.getHookManager();
const utils = await BlacksmithAPI.getUtils();
```

**New way (working):**
```javascript
const hookManager = BlacksmithHookManager;
const utils = BlacksmithUtils;
```

**Migration**: Update your code to use the global objects directly - no more `await` needed!

## **🚧 PENDING MIGRATION NOTICE**

**Important**: We are currently migrating our constants system from the old `COFFEEPUB` approach to a new centralized system. During this migration:

- **✅ Working Now**: Core API functions (hooks, utilities, module management)
- **⚠️ PENDING**: Sound constants, image constants, and other asset constants
- **📝 Status**: Use direct file paths for sounds/images until migration completes

**What This Means for You:**
- Your module integration will work for core features
- Sound and image constants will be available via `BlacksmithConstants` once migration completes
- For now, use direct file paths (e.g., `'modules/coffee-pub-blacksmith/sounds/notification.mp3'`)

**Migration Timeline**: Expected completion in 6 weeks. We'll update this documentation when the new constants system is ready.

## **What This API Provides**

Coffee Pub Blacksmith offers a clean, reliable integration path for external modules through our **global object system**. This approach:

- ✅ **Handles timing issues automatically** - No more race conditions
- ✅ **Provides consistent interface** - Same API regardless of when you call it  
- ✅ **Manages availability checks** - Automatically waits for Blacksmith to be ready
- ✅ **Offers debugging tools** - Console commands to verify integration
- ✅ **Simple direct access** - No async/await complexity

## **🚧 Current API Status - What's Working vs What's Pending**

### **✅ Available Now (Fully Functional)**
- **Hook Management**: Register and manage FoundryVTT hooks
- **Utility Functions**: Logging, notifications, settings management
- **Module Registration**: Register your module with Blacksmith
- **Statistics API**: Access combat and player statistics
- **Core Constants**: Theme choices, sound choices, background image choices

### **⚠️ Pending Migration (Use Alternatives)**
- **Sound Constants**: `COFFEEPUB.SOUNDNOTIFICATION01` → Use direct file paths
- **Image Constants**: `COFFEEPUB.BACKSKILLCHECK` → Use direct file paths  
- **Volume Constants**: `COFFEEPUB.SOUNDVOLUMENORMAL` → Use hardcoded values (0.7)
- **Asset Constants**: All `COFFEEPUB.*` constants → Will be `BlacksmithConstants.*` after migration

### **📝 Migration Workarounds**
```javascript
// Instead of: COFFEEPUB.SOUNDNOTIFICATION01
// Use: 'modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3'

// Instead of: COFFEEPUB.SOUNDVOLUMENORMAL  
// Use: 0.8 (or your preferred volume)

// Instead of: COFFEEPUB.BACKSKILLCHECK
// Use: 'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp'

// Instead of: COFFEEPUB.SOUNDEFFECTREACTION04 (battlecry)
// Use: 'modules/coffee-pub-blacksmith/sounds/battlecry.mp3'

// Instead of: COFFEEPUB.SOUNDSUCCESS
// Use: 'modules/coffee-pub-blacksmith/sounds/fanfare-success-2.mp3'
```

## **Integration Philosophy**

We believe external modules should have a **simple, predictable interface** that doesn't break when Blacksmith's internal structure changes. The global object system provides this stability with direct access to all features.

## **Internal vs External APIs - What's the Difference?**

### **🔧 Internal API (for Blacksmith developers)**
- **Location**: `BLACKSMITH-ARCHITECTURE.md`
- **Access**: Direct manager access (e.g., `HookManager.registerHook()`)
- **Use case**: When developing Blacksmith itself
- **Example**: `scripts/blacksmith.js` uses internal APIs

### **🌐 External API (for other modules)**
- **Location**: This document (`BLACKSMITH-API.md`)
- **Access**: Global objects (e.g., `BlacksmithHookManager`, `BlacksmithUtils`)
- **Use case**: When your module wants to integrate with Blacksmith
- **Example**: Other Coffee Pub modules use external APIs

### **Why Two APIs?**
- **Internal**: Direct access for performance and flexibility
- **External**: Stable interface that won't break when internal structure changes
- **Bridge**: Handles timing issues and provides consistent experience

# **Quick Start - External Module Integration**

## **Step 1: Add Blacksmith as a Library Dependency**
Add Blacksmith to your module's `module.json` dependencies to get access to the API library:

```json
{
  "name": "your-module",
  "requires": [
    {
      "id": "coffee-pub-blacksmith",
      "type": "library",
      "manifest": "https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json"
    }
  ]
}
```

**What this means**: Once added as a library dependency, you can import the bridge file to access the API as global objects.

## **Step 2: Import the Bridge File (Required)**
Import the Blacksmith API bridge file to ensure the API is available:

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
```

**Why import?**: The global objects are only available after Blacksmith is fully ready. Importing the bridge file ensures proper initialization and timing.

## **Step 3: Register Your Module (Required)**

**What to Replace:**
- `YOUR_MODULE_ID` → Your module's ID from `module.json` (e.g., "my-awesome-module")
- `YOUR_SHORT_NAME` → A short, readable name for logs (e.g., "MODULENAME" instead of "My Awesome Module Title")
- `YOUR_MODULE_VERSION` → Your module's version from `module.json` (e.g., "1.0.0")

**Why This Matters:**
- **Module ID**: Must match your `module.json` exactly
- **Short Name**: Makes console logs easier to read and filter
- **Version**: Helps with compatibility and debugging

```javascript
// === BEGIN: BLACKSMITH API REGISTRATION ===
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

// Register your module with Blacksmith (use 'ready' hook for timing safety)
Hooks.once('ready', async () => {
    try {
        // Get the module manager
        const moduleManager = BlacksmithModuleManager;
        // Register your module
        moduleManager.registerModule('YOUR_MODULE_ID', {
            name: 'YOUR_SHORT_NAME',
            version: 'YOUR_MODULE_VERSION'
        });
        // Log success
        console.log('✅ Module ' + 'YOUR_SHORT_NAME' + ' registered with Blacksmith successfully');
    } catch (error) {
        console.error('❌ Failed to register ' + 'YOUR_SHORT_NAME' + ' with Blacksmith:', error);
    }
});
// === END: BLACKSMITH API REGISTRATION ===
```

**Why register?**: This tells Blacksmith about your module and enables inter-module features.

**Why 'ready' hook?**: The `ready` hook runs after Blacksmith is fully initialized, ensuring the global objects are available. Using `init` can cause timing issues where the API isn't ready yet.

## **Step 4: Test Your Integration (Recommended)**

After completing the basic setup, run this comprehensive test suite to verify everything is working correctly. Paste the entire block into your module right after the registration block:

```javascript
// ========== BEGIN: BLACKSMITH API TESTING ==========
// This test assumes that the Blacksmith module is installed and properly configured.
// It is best to filter for the word "API TEST" in console to see the results of the tests.
// Be sure to set you module ID in the TEST_MODULE_ID variable below.

Hooks.once('ready', async () => {

    // !! IMPORTANT !! SET YOUR MODULE ID HERE !!
    const TEST_MODULE_ID = YOUR_MODULE_ID; // <-------- Replace with your actual module ID

    try {
        // ----- CONSTANTS TEST INSTRUCTIONS
        console.log('API TEST | ');
        console.log('API TEST | ===================================================');
        console.log('API TEST| ====  CONSTANTS TEST INSTRUCTIONS              ====');
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


         // ----- UTILITY TESTS: CONSOLE AND NOTIFICATION TEST
        console.log('API TEST | ');
        console.log('API TEST | ==================================================='); 
        console.log('API TEST | ====  UTILITY TESTS: NOTIFICATION TEST         ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ');
        console.log('API TEST | 1. You should see the message "API TEST | BLACKSMITH TEST OF POSTCONSOLEANDNOTIFICATION" in the console.');
        console.log('API TEST | 2. It should be followed by a value "Some awesome result"');
        console.log('API TEST | 3. It should be laid out differently than the other console messages and start with "COFFEE PUB • "');
        console.log('API TEST | 4. It should also pop aup a notifcation.');
        console.log('API TEST | 5. If you see a notfication and value, your the utility functions worked!');
        console.log('API TEST | ');
        BlacksmithUtils.postConsoleAndNotification(
            TEST_MODULE_ID,        // Module ID (string)
            'API TEST | BLACKSMITH TEST OF POSTCONSOLEANDNOTIFICATION',      // Main message
            'Some awesome result',                 // Result object (optional)
            false,                  // Debug flag (true = debug, false = system)
            true                   // Show notification (true = show, false = console only)
        );
        // ----- SAFE SETTINGS TEST
        console.log('API TEST | ');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  SAFE SETTINGS TEST INSTRUCTIONS          ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ');
        console.log('API TEST | 1. This test will fail with "not a registered game setting" - this is EXPECTED!');
        console.log('API TEST | 2. The error proves Blacksmith is properly integrated with FoundryVTT settings.');
        console.log('API TEST | 3. In real usage, you would register your settings first in your module.json or init hook.');
        console.log('API TEST | 4. If you see the error message, your safe settings integration is working correctly!');
        console.log('API TEST | ');

        // Test safe settings access (this will fail as expected)
        try {
            // Test safe get BEFORE setting (should return default since setting doesn't exist)
            const defaultValue = BlacksmithUtils.getSettingSafely(TEST_MODULE_ID, 'test-setting', 'default-value');
            console.log('✅ API TEST | BLACKSMITH TEST: Safe get (before set) working:', defaultValue);
            
            // Test safe set
            BlacksmithUtils.setSettingSafely(TEST_MODULE_ID, 'test-setting', 'test-value-123');
            console.log('✅ API TEST | BLACKSMITH TEST: Safe set working');
            
            // This will fail because the setting isn't registered - this is EXPECTED behavior
            const rawSetting = game.settings.get(TEST_MODULE_ID, 'test-setting');
            console.log('🔍 API TEST | BLACKSMITH TEST: Raw FoundryVTT setting:', rawSetting);
            
        } catch (error) {
            console.log('✅ API TEST | BLACKSMITH TEST: Safe settings test completed as expected');
            console.log('✅ API TEST | BLACKSMITH TEST: Error shows proper FoundryVTT integration:', error.message);
        }

        // ----- SOUND PLAYBACK TEST
        console.log('API TEST | ');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  SOUND PLAYBACK TEST INSTRUCTIONS         ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ');
        console.log('API TEST | 1. You should hear a "Battle Cry" sound.');
        console.log('API TEST | 2. If you don\'t hear a sound, you may have missed it. Try clicking the canvas or try again to be safe.');
        console.log('API TEST | 3. If DO you hear a battle cry, your sound playback worked!');
        console.log('API TEST | ');

        // Test sound playback
        try {
            // Use a direct sound path instead of COFFEEPUB constants
            BlacksmithUtils.playSound('modules/coffee-pub-blacksmith/sounds/battlecry.mp3', 0.7);
            console.log('✅ API TEST | BLACKSMITH TEST: Sound playback test completed');
        } catch (error) {
            console.error('❌ API TEST | BLACKSMITH TEST: Sound playback test failed:', error);
        }

        // ----- HOOK TEST - Use REAL FoundryVTT events
        console.log('API TEST | ');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ====  HOOK REGISTRATION TEST INSTRUCTIONS      ====');
        console.log('API TEST | ===================================================');
        console.log('API TEST | ');
        console.log('API TEST | 1. You should see the message "API TEST | BLACKSMITH TEST: Hooks registered successfully:" in the console.');
        console.log('API TEST | 2. It should be followed by a value "token: tokenHookId, chat: chatHookId"');
        console.log('API TEST | 3. If you see a value, your the hook registration worked!');
        console.log('API TEST | ');
        // HOOK TEST - Use REAL FoundryVTT events
        // Hook that fires when you update a token (this actually exists)
        const tokenHookId = BlacksmithHookManager.registerHook({
            name: 'updateToken',  // This is a real FoundryVTT event
            description: 'API TEST: Test hook for token updates',
            context: 'api-test-token',
            priority: 5,
            callback: (token, changes) => {
                console.log('🎯 API TEST | BLACKSMITH TEST: Token Updated:', { token, changes });
                
                BlacksmithUtils.postConsoleAndNotification(
                    TEST_MODULE_ID,  // ✅ Use the same module ID as above
                    'API TEST | BLACKSMITH TEST: Token updated!',
                    { hookId: tokenHookId, tokenName: token.name, tokenId: token.id, changes },
                    false,
                    true
                );
            }
        });

        // Hook that fires when you render a chat message (this actually exists)
        const chatHookId = BlacksmithHookManager.registerHook({
            name: 'renderChatMessage',  // This is a real FoundryVTT event
            description: 'API TEST: Test hook for chat messages',
            context: 'api-test-chat',
            priority: 5,
            callback: (message, html, data) => {
                console.log('💬 API TEST | BLACKSMITH TEST: Chat Message Rendered:', { message, data });
                
                BlacksmithUtils.postConsoleAndNotification(
                    TEST_MODULE_ID,  // ✅ Use the same module ID as above
                    'API TEST | BLACKSMITH TEST: Chat message rendered!',
                    { hookId: chatHookId, messageId: message.id, content: message.content },
                    false,
                    true
                );
            }
        });

        console.log('✅ API TEST | BLACKSMITH TEST: Hooks registered successfully:', { 
            token: tokenHookId, 
            chat: chatHookId
        });

        // ----- HOOK ACTIVATIONTEST INSTRUCTIONS
        console.log('API TEST | ');
        console.log('API TEST | ====  HOOK ACTIVATION TEST INSTRUCTIONS        ====');
        console.log('API TEST | ');
        console.log('API TEST | 1. Move a token to trigger updateToken hook');
        console.log('API TEST | 2. Send a chat message to trigger renderChatMessage hook');
        console.log('API TEST | 3. If you see logging, your hooks worked!');
        console.log('API TEST | ');

    } catch (error) {
        console.error('❌ API TEST | BLACKSMITH TEST: Error during testing:', error);
        
        // Try to log the error with Blacksmith if available
        if (BlacksmithUtils && BlacksmithUtils.postConsoleAndNotification) {
            BlacksmithUtils.postConsoleAndNotification(
                TEST_MODULE_ID,  // ✅ Use the same module ID here too
                'API TEST | BLACKSMITH TEST: Error occurred during testing',
                { error: error.message, stack: error.stack },
                false,
                true
            );
        }
    }

});
// ========== END: BLACKSMITH API TESTING ==========
```

**What This Test Covers:**
- ✅ **Constants Access** - Themes, sounds, tables
- ✅ **Version Access** - Blacksmith API version
- ✅ **Utility Functions** - Console logging and notifications
- ✅ **Safe Settings** - Settings access (with expected error)
- ✅ **Sound Playback** - Audio integration
- ✅ **Hook Registration** - Event system setup
- ✅ **Hook Activation** - Real event testing

**How to Use:**
1. Copy this entire block into your module
2. Replace `YOUR_MODULE_ID` with your actual module ID. (REQUIRED)
3. Run it and filter console for "API TEST" to see results
4. Follow the interactive test instructions for hooks

## **Step 5: Test Your Integration**
Use these console commands to verify everything is working:

```javascript
// Check if Blacksmith API is ready
BlacksmithAPIStatus()

// Verify your module is registered
BlacksmithAPICheck()
```

## **Step 6: Start Using the API**
Now you can access Blacksmith's features directly:

```javascript
// Direct access - no await needed!
BlacksmithHookManager.registerHook(...)
BlacksmithUtils.postConsoleAndNotification(...)
BlacksmithModuleManager.registerModule(...)
``` 



***





# **Console Commands - Complete Reference**

> **Open your browser console (F12 → Console tab) to use these commands**

These console commands help you debug and monitor your Blacksmith integration. They're the **easiest way to verify everything is working**.

**💡 Copy-Paste Friendly**: Each group is in a single text box with comments. Copy the entire group to get the context, or run multiple commands at once!

## **🔍 Quick Status Checks**

```javascript
// Check if Blacksmith API is ready
BlacksmithAPIStatus()

// Verify your module registration
BlacksmithAPICheck()

// Get API version
BlacksmithAPIVersion()
```
**Quick Status Commands** - Use these to verify your integration is working.

## **📊 Detailed Information**

```javascript
// Get comprehensive debug information
BlacksmithAPIDetails()

// Show all registered modules
BlacksmithAPIModules()

// Display available features
BlacksmithAPIFeatures()
```
**Detailed Info Commands** - Use these for debugging and system overview.

## **⚙️ Hook Management (Advanced)**

```javascript
// Show hook summary
BlacksmithAPIHooks()

// Detailed hook information
BlacksmithAPIHookDetails()

// Hook statistics
BlacksmithAPIHookStats()
```
**Hook Management Commands** - Use these for debugging hook registrations and performance.

## **🔧 Utilities & Settings**

```javascript
// Show available utility functions
BlacksmithAPIUtils()

// Display Blacksmith settings
BlacksmithAPISettings()

// Show constants and themes
BlacksmithAPIConstants()

// Debug readiness issues
BlacksmithAPIManualReady()
```
**Utility Commands** - Use these to explore available functions and settings.

## **📋 Complete Command Reference**

For detailed information about what each command returns and displays:

| Command | Returns | Console Output |
|---------|---------|----------------|
| `BlacksmithAPIStatus()` | `true`/`false` | Ready/not ready status with details |
| `BlacksmithAPICheck()` | Object | Module count and registration list |
| `BlacksmithAPIVersion()` | String | Current API version (e.g., "12.2.0") |
| `BlacksmithAPIDetails()` | Object | Full debug status and system overview |
| `BlacksmithAPIModules()` | Object | All registered modules with details |
| `BlacksmithAPIFeatures()` | Object | Features grouped by source module |
| `BlacksmithAPIHooks()` | Object | Hook count, names, and summary data |
| `BlacksmithAPIHookDetails()` | Object | Hooks organized by priority levels |
| `BlacksmithAPIHookStats()` | Object | Statistical breakdown by priority/context |
| `BlacksmithAPIUtils()` | Object | Complete list of utility functions |
| `BlacksmithAPISettings()` | Object | All current configuration values |
| `BlacksmithAPIConstants()` | Object | Constants, themes, and sounds |
| `BlacksmithAPIGenerateConstants()` | Object | Test the new constants generation system |
| `BlacksmithAPIAssetLookup()` | Object | Test the new Asset Lookup Tool |
| `BlacksmithAPIManualReady()` | `true`/`false` | Manual readiness check for debugging |

## **✅ What You Should See:**

**If everything is working:**
```
✅ BlacksmithAPIStatus() → Shows "✅ READY" status
✅ BlacksmithAPICheck() → Shows your module in the list
✅ All commands return useful information
```

**If something is wrong:**
```
❌ "BlacksmithAPIStatus is not a function" → API not loaded
❌ "❌ NOT READY" status → Wait for Blacksmith to initialize
❌ Error messages → Check console for specific issues
```

**💡 Pro Tip**: Start with `BlacksmithAPIStatus()` - it's the quickest way to verify your integration is working!

---

# **🔍 Asset Lookup Tool (NEW!)**

## **Overview**

The **Asset Lookup Tool** provides flexible, tag-based access to all Blacksmith assets (sounds, images, themes, etc.) while maintaining backward compatibility with existing constants.

### **Key Benefits:**
- **🔄 Flexible Access**: Find assets by type, category, and tags
- **⚡ Performance**: Constants still exist for frequently used items
- **🏷️ Smart Tagging**: Organize assets with multiple descriptive tags
- **🔄 Auto-Generation**: Constants generated from data collections
- **🔧 Future-Proof**: Easy to add new asset types and categories

## **Data Structure**

Each asset now includes enhanced metadata:

```javascript
{
    "name": "Interface: Error 01",
    "id": "modules/coffee-pub-blacksmith/sounds/interface-error-01.mp3",
    "constantname": "SOUNDERROR01",
    "path": "modules/coffee-pub-blacksmith/sounds/interface-error-01.mp3",
    "tags": ["interface", "error"],
    "type": "sound",
    "category": "interface"
}
```

### **Fields:**
- **`name`**: Human-readable display name
- **`id`**: Unique identifier
- **`constantname`**: Generated constant name (for backward compatibility)
- **`path`**: File path or reference
- **`tags`**: Array of descriptive tags
- **`type`**: Asset type (sound, image, theme, etc.)
- **`category`**: Asset category (interface, background, etc.)

## **Usage Examples**

### **1. Get Assets by Type and Tags**
```javascript
// Get all interface sounds tagged as "error"
const errorSounds = assetLookup.getByTypeAndTags('sound', 'interface', ['error']);

// Get all monster banners
const monsterBanners = assetLookup.getByTypeAndTags('image', 'banner', ['monster']);

// Get all flying monster banners
const flyingMonsters = assetLookup.getByTypeAndTags('image', 'banner', ['monster', 'flying']);
```

### **2. Get Assets by Category**
```javascript
// Get all interface assets
const interfaceAssets = assetLookup.getByCategory('interface');

// Get all background assets
const backgroundAssets = assetLookup.getByCategory('background');
```

### **3. Search by Criteria**
```javascript
// Find assets with "error" in name, type sound, category interface
const errorInterfaceSounds = assetLookup.searchByCriteria({
    name: 'error',
    type: 'sound',
    category: 'interface'
});

// Find all assets tagged with "notification"
const notificationAssets = assetLookup.searchByCriteria({
    tags: ['notification']
});
```

### **4. Get UI Choices**
```javascript
// Get choices for dropdown (returns { id: name, ... })
const soundChoices = assetLookup.getChoices('sound', 'interface');

// Get choices for specific tag combination
const errorSoundChoices = assetLookup.getChoices('sound', 'interface', ['error']);
```

### **5. Random Asset Selection**
```javascript
// Get random error sound
const randomErrorSound = assetLookup.getRandom('sound', 'interface', ['error']);

// Get random monster banner
const randomMonsterBanner = assetLookup.getRandom('image', 'banner', ['monster']);
```

### **6. Backward Compatibility**
```javascript
// Constants still work exactly as before
const errorSound = SOUNDERROR01; // Generated from data collections

// Or use the lookup tool
const errorSoundPath = assetLookup.getConstant('SOUNDERROR01');
```

## **Common Use Cases**

### **Settings Dropdowns**
```javascript
// "Show me all sounds in interface category tagged as error"
const errorInterfaceSounds = assetLookup.getByTypeAndTags('sound', 'interface', ['error']);
// Returns: [SOUNDERROR01, SOUNDERROR02, SOUNDERROR03, ...]
```

### **Dynamic Asset Selection**
```javascript
// "Get a random monster banner for this encounter"
const encounterBanner = assetLookup.getRandom('image', 'banner', ['monster']);

// "Find all flying creatures for aerial combat"
const aerialAssets = assetLookup.searchByCriteria({
    tags: ['flying'],
    type: 'image'
});
```

### **Asset Organization**
```javascript
// "Get all assets related to fire damage"
const fireAssets = assetLookup.searchByCriteria({
    tags: ['fire', 'damage']
});

// "Get all interface sounds for buttons"
const buttonSounds = assetLookup.getByTypeAndTags('sound', 'interface', ['button']);
```

## **Testing the Tool**

Use the console command to test all functionality:

```javascript
// Test the Asset Lookup Tool
BlacksmithAPIAssetLookup();
```

This will test:
- ✅ Tag-based lookups
- ✅ Category searches
- ✅ Criteria searches
- ✅ Choice generation
- ✅ Random selection
- ✅ Constant generation

---

# **AI Prompts & Integration Notes**

## **🤖 For AI Assistants**

If you're using AI to help with Blacksmith integration, here are the key points:

### **What to Tell AI:**
- "Use the BlacksmithAPI bridge for external module integration"
- "All methods return Promises that wait for Blacksmith to be ready"
- "Import from `/modules/coffee-pub-blacksmith/api/blacksmith-api.js`"
- "Use global objects like `BlacksmithHookManager` for direct access"

### **What NOT to Tell AI:**
- "Access HookManager directly" (this is internal API)
- "Use game.modules.get() directly" (use the bridge instead)
- "Import from scripts/manager-hooks.js" (this is internal)

### **Example AI Prompt:**
```
Help me integrate my FoundryVTT module with Coffee Pub Blacksmith using their external API. 
I need to register hooks and access their HookManager. Use the BlacksmithAPI bridge approach.
```

## **📝 Integration Checklist**

Before asking for help, verify:
- [ ] Blacksmith module is installed and active
- [ ] You're using the external API (BlacksmithAPI bridge)
- [ ] You've registered your module with Blacksmith
- [ ] You're handling async/await properly


***



# **Working Examples - External API Usage**

> **All examples use the BlacksmithAPI bridge for external modules**

**📋 Import Required**: All examples assume you've imported the bridge file:
```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
```

**📋 Parameter Order**: All examples follow the recommended order: `name`, `description`, `context`, `priority`, `key`, `options`, `callback` (callback always last for readability).

**📋 API Usage**: All BlacksmithAPI methods return Promises that automatically wait for Blacksmith to be ready. Use `await` or `.then()` to handle the asynchronous nature.

## **Basic Hook Registration**
```javascript
// Direct access - no await needed!
const hookId = BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Track actor changes',
    context: 'my-module',
    priority: 3,
    callback: (actor, changes) => {
        // My logic here
        console.log(`Actor ${actor.name} updated:`, changes);
    }
});
```

## **Hook with All Parameters (Recommended Order)**
```javascript
// Example showing the recommended parameter order
const fullHookId = BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My module: Track actor changes',
    context: 'my-module',
    priority: 3,
    key: 'unique-actor-tracker', // Prevents duplicate registrations
    options: { 
        once: false,           // Don't auto-cleanup
        throttleMs: 100        // Max once per 100ms
    },
    callback: (actor, changes) => {
        // My logic here
        console.log(`Actor ${actor.name} updated:`, changes);
    }
});
```

## **Combat Tracking Hook**
```javascript
// Combat-related hooks
const combatHookId = BlacksmithHookManager.registerHook({
    name: 'updateCombat',
    description: 'My module: Track combat changes',
    context: 'my-combat-tracker', // For batch cleanup
    priority: 2, // High priority - core functionality
    callback: (combat, changed) => {
        if (changed.round !== undefined) {
            console.log(`Round changed to ${changed.round}`);
        }
    }
});
```

## **UI Enhancement Hook**
```javascript
// UI enhancement hooks
const uiHookId = BlacksmithHookManager.registerHook({
    name: 'renderChatMessage',
    description: 'My module: Enhance chat messages',
    context: 'my-chat-enhancer', // For batch cleanup
    priority: 4, // Low priority - UI updates
    callback: (message, html, data) => {
        // Modify the HTML before display
        html.find('.message-content').addClass('my-enhanced-style');
    }
});
```

## **One-time Hook with Auto-cleanup**
```javascript
// One-time hooks with auto-cleanup
const welcomeHookId = BlacksmithHookManager.registerHook({
    name: 'userLogin',
    description: 'My module: Welcome message',
    context: 'my-welcome', // For batch cleanup
    priority: 5, // Lowest priority
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        console.log(`Welcome back, ${user.name}!`);
    }
});
```

## **Performance-Optimized Hooks**
```javascript
// Throttle noisy hooks (e.g., updateToken)
const throttledHookId = BlacksmithHookManager.registerHook({
    name: 'updateToken',
    description: 'My module: Throttled token updates',
    context: 'my-token-tracker',
    priority: 4,
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => {
        // Only runs at most once every 50ms
        console.log('Token updated:', token.name);
    }
});

// Debounce for final state (e.g., search input)
const debouncedHookId = BlacksmithHookManager.registerHook({
    name: 'searchInput',
    description: 'My module: Debounced search',
    context: 'my-search',
    priority: 4,
    options: { debounceMs: 300 }, // Wait 300ms after last input
    callback: (input) => {
        // Only runs after user stops typing
        console.log('Searching for:', input);
    }
});
```

## **Complete Module Initialization**
```javascript
// In your module's main file
import { BlacksmithAPI } from 'coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async () => {
    try {
        // Register with Blacksmith
        BlacksmithModuleManager.registerModule('my-awesome-module', {
            name: 'My Awesome Module',
            version: '1.0.0',
            features: [
                { type: 'actor-tracking', data: { description: 'Tracks actor changes' } },
                { type: 'combat-enhancement', data: { description: 'Improves combat experience' } }
            ]
        });
        
        // Set up hooks
        const hookId = BlacksmithHookManager.registerHook({
            name: 'updateActor',
            description: 'My module: Track actor changes',
            context: 'my-awesome-module', // For batch cleanup
            priority: 3,
            callback: (actor, changes) => {
                // My logic here
                BlacksmithUtils.postConsoleAndNotification(
                    'my-awesome-module', 
                    'Actor updated!', 
                    { actorId: actor.id, changes }, 
                    false, 
                    false
                );
            }
        });
        
        console.log('My module initialized with Blacksmith!');
        
    } catch (error) {
        console.error('Failed to initialize with Blacksmith:', error);
    }
});
```


***



# **Available APIs**

**📋 API Order**: APIs are ordered by most commonly used first - HookManager (core functionality), Utils (everyday helpers), ModuleManager (setup), and Stats API (advanced features).

## **HookManager - Centralized Hook Management**
**Purpose**: Register and manage FoundryVTT hooks with priority ordering and cleanup

**Key Features**:
- **Priority-based execution** (1=Critical, 2=High, 3=Normal, 4=Low, 5=Lowest)
- **Context-based cleanup** for batch operations
- **Throttle/debounce support** for performance optimization
- **Dedupe protection** to prevent duplicate registrations
- **Automatic cleanup** for "once" hooks

**Core Methods**:
```javascript
// Register a hook
const callbackId = hookManager.registerHook({
    name: 'hookName',                    // Required: FoundryVTT hook name
    description: 'Description',           // Optional: Human-readable description
    context: 'context-name',             // Optional: Batch cleanup identifier
    priority: 3,                         // Optional: 1-5, default: 3
    key: 'uniqueKey',                    // Optional: Dedupe protection
    options: {                            // Optional: Performance options
        once: true,                       // Auto-cleanup after first execution
        throttleMs: 50,                   // Max once per 50ms
        debounceMs: 300                   // Wait 300ms after last call
    },
    callback: (args) => { /* logic */ }   // Required: Your callback function - ALWAYS LAST
});
```

**IMPORTANT: Parameter Order**
The HookManager uses destructured parameters, so the order doesn't matter as long as you use the correct property names. However, for **readability and consistency**, we strongly recommend this order:
1. `name` (required)
2. `description` (optional)
3. `context` (optional)
4. `priority` (optional)
5. `key` (optional)
6. `options` (optional)
7. `callback` (required) - **ALWAYS LAST for readability**

**What We Actually Support:**
- **Required**: `name`, `callback`
- **Optional**: `description`, `priority`, `options`, `key`, `context`
- **Options**: `once`, `throttleMs`, `debounceMs`
- **Performance**: Throttling and debouncing work as documented
- **Cleanup**: `once: true` auto-removes hooks after first execution
- **Dedupe**: `key` prevents duplicate registrations
- **Batch cleanup**: `context` enables group removal

**Usage Examples**:

```javascript
// Remove a specific callback
const removed = hookManager.removeCallback(callbackId);

// Cleanup by context
hookManager.disposeByContext('context-name');

// Get statistics and debugging info
hookManager.showHooks();
hookManager.showHookDetails();
hookManager.getStats();
```

**📚 See the Working Examples section above for complete hook registration examples with different use cases and performance optimizations.**


***



## **Utils - Utility Functions**
**Purpose**: Access to Blacksmith's utility functions for common operations

**Note**: For access to Blacksmith's global constants and choice arrays (themes, sounds, tables, etc.), use the global constants object:
```javascript
const themeChoices = BlacksmithConstants.arrThemeChoices;
const soundChoices = BlacksmithConstants.arrSoundChoices;
const tableChoices = BlacksmithConstants.arrTableChoices;
```

**💡 Explore All Utilities**: Use the console command `BlacksmithAPIUtils()` to see a complete list of all available utility functions and their current values.

**⚠️ PENDING MIGRATION**: The `COFFEEPUB` constants (like `COFFEEPUB.SOUNDNOTIFICATION01`) are currently being migrated to a new system. These will be available via `BlacksmithConstants` once the migration is complete.

**Available Utilities**:

| Function | Type | Description | Parameters |
|----------|------|-------------|------------|
| `postConsoleAndNotification` | Function | Console logging with debug support | `(moduleId, message, result, debug, notification)` |
| `playSound` | Async Function | Sound playback | `(sound, volume, loop, broadcast)` |
| `getSettingSafely` | Function | Safe settings access | `(moduleId, settingKey, defaultValue)` |
| `setSettingSafely` | Function | Safe settings modification | `(moduleId, settingKey, value)` |
| `formatTime` | Function | Time formatting utilities | `(ms, format)` |
| `generateFormattedDate` | Function | Date formatting utilities | `(format)` |
| `trimString` | Function | String truncation | `(str, maxLength)` |
| `toSentenceCase` | Function | Text case conversion | `(str)` |
| `getActorId` | Function | Get actor ID by name | `(actorName)` |
| `getTokenImage` | Function | Get token image | `(tokenDoc)` |
| `getPortraitImage` | Function | Get actor portrait | `(actor)` |
| `getTokenId` | Function | Get token ID by name | `(tokenName)` |
| `objectToString` | Function | Convert object to string | `(obj)` |
| `stringToObject` | Function | Convert string to object | `(str)` |
| `convertSecondsToRounds` | Function | Convert seconds to rounds | `(numSeconds)` |
| `rollCoffeePubDice` | Async Function | Roll dice with Coffee Pub system | `(roll)` |
| `resetModuleSettings` | Function | Reset module settings | `(moduleId)` |

**Quick Examples**:
```javascript
// Console logging with debug support
utils.postConsoleAndNotification(
    'my-module-id',        // Module ID (string)
    'Message content',      // Main message
    result,                 // Result object (optional)
    false,                  // Debug flag (true = debug, false = system)
    false                   // Show notification (true = show, false = console only)
);

// Sound playback - use predefined constants or full paths
// ⚠️ PENDING MIGRATION: COFFEEPUB constants will be available via BlacksmithConstants once migration is complete
utils.playSound('modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3', 0.8); // Use direct paths for now
utils.playSound('modules/coffee-pub-blacksmith/sounds/interface-notification-02.mp3', 0.5); // Custom path

// ⚠️ PENDING MIGRATION: Available sound constants will be documented here once migration is complete
// These will include:
// - Various notification sounds
// - Button click sounds  
// - Pop/interface sounds
// - Book-related sounds
// - Chest/loot sounds
// - Weapon sounds
// - Musical instrument sounds
// - Reaction sounds (battlecry, etc.)
// - Volume constants

// Settings management
const setting = utils.getSettingSafely('my-module-id', 'setting-key', 'default');
utils.setSettingSafely('my-module-id', 'setting-key', 'newValue');

// Time and formatting utilities
const formattedTime = utils.formatTime(ms, 'colon');
const formattedDate = utils.generateFormattedDate('YYYY-MM-DD');

// Newly exposed functions for Scribe and other modules:
const tokenId = utils.getTokenId("My Token");
const objString = utils.objectToString({ key: "value" });
const obj = utils.stringToObject("key=value|other=data");
const rounds = utils.convertSecondsToRounds(30);
const diceResult = await utils.rollCoffeePubDice("2d20");
utils.resetModuleSettings("my-module-id");
```

**Usage Examples**:
```javascript
// Log important events
BlacksmithUtils.postConsoleAndNotification(
    'my-awesome-module',
    'Hook registered successfully',
    { hookId, hookName: 'updateActor' }, // result object
    false, // System message (not debug)
    false  // No notification
);

// Play sounds for user feedback
// ⚠️ PENDING MIGRATION: Use direct paths until COFFEEPUB constants are migrated
BlacksmithUtils.playSound('modules/coffee-pub-blacksmith/sounds/fanfare-success-2.mp3', 0.8); // Success notification sound

// Access Blacksmith version and constants
console.log('Blacksmith version:', game.modules.get('coffee-pub-blacksmith')?.api?.version);
console.log('Available themes:', BlacksmithConstants.arrThemeChoices);

// Note: BlacksmithAPI.version doesn't exist - use the module.api.version instead
```


***



## **ModuleManager - Module Registration System**
**Purpose**: Register your module with Blacksmith and check feature availability

**Key Methods**:
```javascript
// Register your module with Blacksmith
moduleManager.registerModule('your-module-id', {
    name: 'Your Module Name',
    version: '1.0.0',
    features: [
        { type: 'combat-tracking', data: { description: 'Tracks combat statistics' } },
        { type: 'ui-enhancements', data: { description: 'Provides UI improvements' } }
    ]
});

// Check if a module is active
const isActive = moduleManager.isModuleActive('your-module-id');

// Get features for a specific module
const features = moduleManager.getModuleFeatures('your-module-id');
```

**Usage Examples**:
```javascript
// Register your module
BlacksmithModuleManager.registerModule('my-awesome-module', {
    name: 'My Awesome Module',
    version: '1.0.0',
    features: [
        { type: 'combat-tracking', data: { description: 'Tracks combat statistics' } },
        { type: 'statistics', data: { description: 'Provides player analytics' } },
        { type: 'ui-enhancements', data: { description: 'Improves user interface' } }
    ]
});

// Check if Blacksmith is available
if (BlacksmithModuleManager.isModuleActive('coffee-pub-blacksmith')) {
    console.log('Blacksmith is active and ready!');
}

// Get your module's features
const myFeatures = BlacksmithModuleManager.getModuleFeatures('my-awesome-module');
console.log('My module features:', myFeatures);
```




## **Stats API - Statistics and Analytics**
**Purpose**: Access to Blacksmith's statistics and tracking systems

**Key Methods**:
```javascript
// Get combat statistics
const combatStats = stats.combat.getCurrentStats();

// Get player statistics
const playerStats = await stats.player.getStats(actorId);

// Get specific stat categories
const attackStats = await stats.player.getStatCategory(actorId, 'attacks');
const roundSummary = stats.combat.getRoundSummary();
```

**Usage Examples**:
```javascript
// Get combat statistics
const combatStats = BlacksmithStats.combat.getCurrentStats();
console.log('Current combat stats:', combatStats);

// Get player statistics for a specific actor
const playerStats = await BlacksmithStats.player.getStats(actorId);
console.log('Player stats:', playerStats);

// Get specific stat categories
const attackStats = await BlacksmithStats.player.getStatCategory(actorId, 'attacks');
const healingStats = await BlacksmithStats.player.getStatCategory(actorId, 'healing');
```


***



# **Integration Patterns**

**📚 Note**: For complete, working examples of these patterns, see the **Working Examples** section above.

## **Module Initialization Pattern**
```javascript
// In your module's main file
import { BlacksmithAPI } from 'coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async () => {
    try {
        // Register with Blacksmith
        BlacksmithModuleManager.registerModule('my-module', {
            name: 'My Module',
            version: '1.0.0',
            features: [
                { type: 'actor-tracking', data: { description: 'Tracks actor changes' } }
            ]
        });
        
        // Set up hooks
        const hookId = BlacksmithHookManager.registerHook({
            name: 'updateActor',
            description: 'My module: Track actor changes',
            context: 'my-module', // For batch cleanup
            priority: 3,
            callback: (actor, changes) => {
                // My logic here
                BlacksmithUtils.postConsoleAndNotification('my-module', 'Actor updated!', { actorId: actor.id, changes }, false, false);
            }
        });
        
        console.log('My module initialized with Blacksmith!');
        
    } catch (error) {
        console.error('Failed to initialize with Blacksmith:', error);
    }
});
```


***



## **Feature Detection Pattern**
```javascript
// Check what features are available
if (BlacksmithHookManager) {
    console.log('HookManager available');
}

if (BlacksmithModuleManager) {
    console.log('ModuleManager available');
}

if (BlacksmithUtils) {
    console.log('Utilities available');
}

// Check if Blacksmith is ready
if (BlacksmithAPI.isReady) {
    console.log('Blacksmith is ready');
}
```


***



## **Error Handling Pattern**
```javascript
try {
    if (!BlacksmithHookManager) {
        throw new Error('HookManager not available');
    }
    
    const hookId = BlacksmithHookManager.registerHook({
        name: 'updateActor',
        description: 'My module: Actor update handler',
        context: 'my-module',
        priority: 3,
        callback: (actor, changes) => {
            // My logic here
        }
    });
    
    console.log('Hook registered successfully:', hookId);
    
} catch (error) {
    console.error('Failed to register hook:', error);
    
    // Fallback to direct FoundryVTT hooks
    Hooks.on('updateActor', (actor, changes) => {
        // My logic here
    });
}
```

# **Performance Considerations**

## **Hook Priority Guidelines**
```javascript
// Priority 1 (CRITICAL) - System cleanup, critical features
// Use for: Must-run-first operations, system integrity
hookManager.registerHook({
    name: 'closeGame',
    priority: 1,
    // ...
});

// Priority 2 (HIGH) - Core functionality, data validation  
// Use for: Core features, data integrity, early processing
hookManager.registerHook({
    name: 'updateActor',
    priority: 2,
    // ...
});

// Priority 3 (NORMAL) - Standard features
// Use for: Most hooks, standard functionality
hookManager.registerHook({
    name: 'renderChatMessage',
    priority: 3, // Default
    // ...
});

// Priority 4 (LOW) - Nice-to-have features, UI updates
// Use for: UI enhancements, cosmetic features
hookManager.registerHook({
    name: 'renderApplication',
    priority: 4,
    // ...
});

// Priority 5 (LOWEST) - Cosmetic features, debug hooks
// Use for: Debug logging, cosmetic updates
hookManager.registerHook({
    name: 'renderPlayerList',
    priority: 5,
    // ...
});
```

## **Performance Optimization Options**
```javascript
// Throttle noisy hooks (e.g., updateToken)
hookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 50 }, // Max once per 50ms
    callback: (token, changes) => {
        // Only runs at most once every 50ms
    }
});

// Debounce for final state (e.g., search input)
hookManager.registerHook({
    name: 'searchInput',
    options: { debounceMs: 300 }, // Wait 300ms after last input
    callback: (input) => {
        // Only runs after user stops typing
    }
});

// One-time hooks with auto-cleanup
hookManager.registerHook({
    name: 'userLogin',
    options: { once: true }, // Auto-cleanup after first execution
    callback: (user) => {
        // Hook automatically removes itself after this runs
    }
});
```






# **Debugging and Troubleshooting**

## **Console Commands**
Blacksmith provides console commands for debugging hook registrations:

```javascript
// Show all registered hooks
BlacksmithAPIHooks();

// Show detailed hook information with priority grouping
BlacksmithAPIHookDetails();

// Get raw hook statistics
BlacksmithAPIHookStats();
```

## **Common Issues and Solutions**

**Issue: "HookManager is not defined"**
```javascript
// Solution: Use global objects directly
BlacksmithHookManager.registerHook(...)
```

**Issue: Hook not executing**
```javascript
// Check if hook is registered
const stats = BlacksmithHookManager.getStats();
console.log('Registered hooks:', stats.hooks);

// Verify hook name is correct
// FoundryVTT hook names are case-sensitive
```

**Issue: Performance problems**
```javascript
// Use throttling for noisy hooks
BlacksmithHookManager.registerHook({
    name: 'updateToken',
    options: { throttleMs: 100 }, // Reduce frequency
    // ...
});

// Use debouncing for user input
BlacksmithHookManager.registerHook({
    name: 'searchInput', 
    options: { debounceMs: 500 }, // Wait longer
    // ...
});
```

# **Best Practices**

## **1. Use Direct Global Access (RECOMMENDED)**
```javascript
// GOOD: Use global objects directly
BlacksmithHookManager.registerHook(...)
BlacksmithUtils.postConsoleAndNotification(...)
BlacksmithModuleManager.registerModule(...)

// ALTERNATIVE: Store references if you prefer
const hookManager = BlacksmithHookManager;
const utils = BlacksmithUtils;
```

**Why direct access is better:**
- **No extra variables** cluttering your scope
- **Always clear** where the API comes from
- **Consistent pattern** - same approach everywhere
- **Simpler code** - one less step

## **2. Always Use Contexts**
```javascript
// GOOD: Descriptive context for cleanup
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    context: 'my-module-actor-tracking',
    // ...
});

// BAD: No context makes cleanup difficult
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    // Missing context
    // ...
});
```

## **3. Provide Clear Descriptions**
```javascript
// GOOD: Clear, descriptive hook description
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'My Module: Track actor HP changes for health panel updates',
    // ...
});

// BAD: Vague description makes debugging hard
BlacksmithHookManager.registerHook({
    name: 'updateActor',
    description: 'Updates stuff',
    // ...
});
```

## **3. Use Appropriate Priorities**
```javascript
// Use priority 3 (NORMAL) for most hooks
// Only use 1 or 2 for critical/core functionality
// Use 4 or 5 for cosmetic/debug features
```

## **4. Handle Errors Gracefully**
```javascript
// Always check if APIs are available
if (!BlacksmithAPI.isReady()) {
    console.warn('Blacksmith not ready, using fallback');
    // Fallback logic
    return;
}
```

## **5. Clean Up When Done**
```javascript
// Store hook IDs for cleanup
const myHookIds = [];

myHookIds.push(BlacksmithHookManager.registerHook({
    name: 'updateActor',
    context: 'my-module',
    // ...
}));

// Clean up when module disables
Hooks.once('closeGame', () => {
    myHookIds.forEach(id => BlacksmithHookManager.removeCallback(id));
});
```

# **Testing**

## **Console Testing Commands**

Blacksmith provides console commands for testing and debugging:

```javascript
// Show all registered hooks
BlacksmithAPIHooks();

// Show detailed hook information with priority grouping
BlacksmithAPIHookDetails();

// Get raw hook statistics
BlacksmithAPIHookStats();
```

## **Integration Validation Checklist**

Use this checklist to verify your integration:

- [ ] Module registers successfully with Blacksmith
- [ ] API availability checks work correctly
- [ ] Hook registration succeeds without errors
- [ ] Utility functions return expected results
- [ ] Settings access works safely
- [ ] Error handling provides appropriate fallbacks
- [ ] Cleanup functions work when module disables
- [ ] No console errors during startup
- [ ] No console errors during normal operation

## **Basic API Availability Test**

```javascript
function testBasicAPI() {
    if (!BlacksmithUtils) {
        console.error('❌ Blacksmith Utils not available');
        return false;
    }
    
    if (!BlacksmithHookManager) {
        console.error('❌ HookManager not available');
        return false;
    }
    
    if (!BlacksmithModuleManager) {
        console.error('❌ ModuleManager not available');
        return false;
    }
    
    console.log('✅ Basic API test passed');
    return true;
}
```

## **Test Utility Functions**

```javascript
async function testUtilityFunctions() {
    if (!BlacksmithUtils) return false;
    
    try {
        // Test settings access
        const testValue = BlacksmithUtils.getSettingSafely('test-module', 'test-setting', 'default');
        console.log('✅ Settings access working:', testValue);
        
        // Test logging
        BlacksmithUtils.postConsoleAndNotification('test-module', 'Utility test', { testType: 'utility' }, false, false);
        console.log('✅ Logging working');
        
        // Test sound (if available)
        if (BlacksmithUtils.playSound) {
            // ⚠️ PENDING MIGRATION: Use direct path until COFFEEPUB constants are migrated
            BlacksmithUtils.playSound('modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3', 0.8);
            console.log('✅ Sound playback working');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Utility test failed:', error);
        return false;
    }
}
```

## **Test Safe Settings Access**

```javascript
async function testSettingsAccess() {
    if (!BlacksmithUtils) return false;
    
    try {
        // Test safe get
        const value = BlacksmithUtils.getSettingSafely('my-module', 'test-setting', 'default');
        console.log('✅ Safe get working:', value);
        
        // Test safe set
        BlacksmithUtils.setSettingSafely('my-module', 'test-setting', 'test-value');
        console.log('✅ Safe set working');
        
        // Verify the set worked
        const newValue = BlacksmithUtils.getSettingSafely('my-module', 'test-setting', 'default');
        console.log('✅ Setting verification working:', newValue);
        
        return true;
    } catch (error) {
        console.error('❌ Settings test failed:', error);
        return false;
    }
}
```

## **Test BLACKSMITH Object Access**

```javascript
async function testBLACKSMITHObject() {
    if (!BlacksmithConstants) return false;
    
    try {
        // Test choice arrays
        if (BlacksmithConstants.arrThemeChoices) {
            console.log('✅ Theme choices available:', BlacksmithConstants.arrThemeChoices.length);
        }
        
        if (BlacksmithConstants.arrSoundChoices) {
            console.log('✅ Sound choices available:', BlacksmithConstants.arrSoundChoices.length);
        }
        
        if (BlacksmithConstants.arrTableChoices) {
            console.log('✅ Table choices available:', BlacksmithConstants.arrTableChoices.length);
        }
        
        // Test default values
        if (BlacksmithConstants.strDefaultCardTheme) {
            console.log('✅ Default theme available:', BlacksmithConstants.strDefaultCardTheme);
        }
        
        return true;
    } catch (error) {
        console.error('❌ BLACKSMITH object test failed:', error);
        return false;
    }
}
```

## **Test Module Registration**

```javascript
async function testModuleRegistration() {
    if (!BlacksmithModuleManager) return false;
    
    try {
        // Test registration
        BlacksmithModuleManager.registerModule('test-module', {
            name: 'Test Module',
            version: '1.0.0',
            features: ['testing']
        });
        console.log('✅ Module registration working');
        
        // Test feature checking
        if (BlacksmithModuleManager.getModuleFeatures) {
            const features = BlacksmithModuleManager.getModuleFeatures('test-module');
            console.log('✅ Feature checking working:', features);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Module registration test failed:', error);
        return false;
    }
}
```

## **One-Liner Quick Test**

```javascript
// Quick test: Check if Blacksmith is available and ready
(() => {
    const status = {
        utils: !!BlacksmithUtils,
        hooks: !!BlacksmithHookManager,
        moduleManager: !!BlacksmithModuleManager,
        constants: !!BlacksmithConstants
    };
    console.log('Blacksmith Status:', status);
    return Object.values(status).every(Boolean);
})();
```

## **Common Issues and Troubleshooting**

## **Issue: "API not ready" errors**

**Symptoms:**
- Console errors about functions not being available
- Module crashes during initialization
- Hooks not registering

**Solutions:**
1. **Use proper timing**: Wait for `ready` hook, not `init`
2. **Check availability**: Always verify API exists before use
3. **Add retry logic**: Use polling or event-based ready detection
4. **Check module order**: Ensure Blacksmith loads before your module

**Code Fix:**
```javascript
// BAD: Assumes API is ready
Hooks.once('init', () => {
    BlacksmithUtils.getSettingSafely('setting', 'default'); // May crash!
});

// GOOD: Check availability first
Hooks.once('ready', () => {
    if (BlacksmithUtils) {
        BlacksmithUtils.getSettingSafely('setting', 'default');
    }
});
```

## **Issue: "Function not found" errors**

**Symptoms:**
- `TypeError: blacksmith.utils.getSettingSafely is not a function`
- `Cannot read property 'registerHook' of undefined`

**Solutions:**
1. **Check API structure**: Verify the function exists before calling
2. **Use optional chaining**: `blacksmith?.utils?.getSettingSafely?.()`
3. **Add fallbacks**: Provide alternative behavior when functions unavailable
4. **Check version compatibility**: Ensure you're using the correct API version

**Code Fix:**
```javascript
// BAD: No existence check
const value = BlacksmithUtils.getSettingSafely('setting', 'default');

// GOOD: Check existence first
if (BlacksmithUtils) {
    const value = BlacksmithUtils.getSettingSafely('setting', 'default');
} else {
    // Fallback behavior
    const value = game.settings.get('my-module', 'setting') ?? 'default';
}
```

## **Issue: Empty choice arrays**

**Symptoms:**
- Dropdown menus show no options
- Settings registration fails
- Choice arrays are empty or undefined

**Solutions:**
1. **Wait for data**: Use `blacksmithUpdated` hook to detect when data is ready
2. **Check timing**: Ensure you're accessing data after Blacksmith is fully initialized
3. **Add fallbacks**: Provide default choices if arrays are empty
4. **Verify data source**: Check if Blacksmith has the expected data

**Code Fix:**
```javascript
// BAD: Access immediately (may be empty)
Hooks.once('ready', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const choices = blacksmith.BLACKSMITH.arrThemeChoices; // May be empty!
});

// GOOD: Wait for data to be ready
Hooks.on('blacksmithUpdated', (data) => {
    if (data.type === 'ready') {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        const choices = blacksmith.BLACKSMITH.arrThemeChoices; // Should be populated
    }
});
```

## **Issue: Settings not accessible**

**Symptoms:**
- `"module.setting" is not a registered game setting`
- Settings registration fails
- Cannot access module settings

**Solutions:**
1. **Register settings first**: Ensure settings are registered before accessing
2. **Use safe access**: Use `getSettingSafely` instead of direct access
3. **Check module ID**: Verify the module ID matches exactly
4. **Add fallbacks**: Provide default values when settings unavailable

**Code Fix:**
```javascript
// BAD: Direct access without registration
const value = game.settings.get('my-module', 'setting');

// GOOD: Safe access with fallback
const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');

// BETTER: Register settings first, then access
Hooks.once('ready', () => {
    game.settings.register('my-module', 'setting', {
        type: String,
        default: 'default'
    });
    
    const value = blacksmith.utils.getSettingSafely('my-module', 'setting', 'default');
});
```

## **Issue: Module not registering**

**Symptoms:**
- Module doesn't appear in Blacksmith's module list
- Registration function not found
- No confirmation of successful registration

**Solutions:**
1. **Check timing**: Register during `init` hook, not later
2. **Verify function**: Ensure `registerModule` exists before calling
3. **Check parameters**: Provide required name and version
4. **Add error handling**: Catch and log registration errors

**Code Fix:**
```javascript
// BAD: No error handling or availability check
Hooks.once('init', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    blacksmith.registerModule('my-module', {}); // May fail silently
});

// GOOD: Proper error handling and availability check (use 'ready' hook for timing safety)
Hooks.once('ready', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    
    if (blacksmith?.registerModule) {
        try {
            blacksmith.registerModule('my-module', {
                name: 'My Module',
                version: '1.0.0'
            });
            console.log('✅ Module registered successfully');
        } catch (error) {
            console.error('❌ Module registration failed:', error);
        }
    } else {
        console.warn('⚠️ Blacksmith registration not available');
    }
});
```

# **AI-Friendly Integration Prompts**

## **For AI Coding Assistants**

Copy and paste the following prompt into your AI coding assistant to get help integrating with Coffee Pub Blacksmith:

```
I need to integrate my FoundryVTT module with Coffee Pub Blacksmith. 

Coffee Pub Blacksmith is a central hub module that provides shared utilities, safe settings access, and inter-module communication for the Coffee Pub ecosystem. It's designed for FoundryVTT v12+ and provides a robust API for other modules to use.

Key features I need to understand:
- Safe settings access that prevents startup crashes
- Shared utility functions (logging, time formatting, sound management, etc.)
- Global variable sharing through the BLACKSMITH object
- Hook system for inter-module communication
- Module registration system

The full API documentation is available at: https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API/

Please help me:
1. Set up the basic module registration with Blacksmith
2. Implement safe settings access using Blacksmith's utilities
3. Access shared choice arrays (themes, sounds, tables, etc.) through the BLACKSMITH object
4. Set up proper hook listeners for the 'blacksmithUpdated' event
5. Follow the initialization timing best practices (use 'ready' phase, not 'init' for accessing data)

IMPORTANT: Import the bridge file to ensure the API is available!

My module ID is: [YOUR_MODULE_ID]
My module name is: [YOUR_MODULE_NAME]

IMPORTANT: Please follow the exact patterns from the documentation:
- Use the Quick Start Template structure
- Implement proper error handling and availability checks
- Use the standardized MODULE constants pattern
- Include the blacksmithUpdated hook for real-time updates
- Use direct global object access (e.g., BlacksmithUtils.postConsoleAndNotification())
- Provide working code examples that I can copy-paste directly

Please provide complete, working code examples that I can directly implement.
```

## **Quick Reference for AI Assistants**

**Essential Integration Points:**

* Import the bridge file: `import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js'`
* Register module during 'ready' hook using `BlacksmithModuleManager.registerModule()` (timing safety)
* Access BLACKSMITH object during 'ready' hook via `BlacksmithConstants`
* Listen to 'blacksmithUpdated' hook for data updates
* Use `BlacksmithUtils.getSettingSafely()` for safe settings access
* Access choice arrays via `BlacksmithConstants.arr[Type]Choices`

**FoundryVTT Lifecycle:**

* 'init': Basic module setup (avoid Blacksmith API calls here)
* 'ready': Module registration, access to populated data, settings registration
* 'blacksmithUpdated': Real-time data updates

**Key Global Objects:**

* `BlacksmithModuleManager` - Module registration and management
* `BlacksmithUtils` - Utility functions (settings, logging, sound, etc.)
* `BlacksmithHookManager` - Hook management system
* `BlacksmithConstants` - Global constants and choice arrays
* `BlacksmithStats` - Combat and player statistics

**Example Usage:**
```javascript
// Module registration
BlacksmithModuleManager.registerModule('my-module', { name: 'MY_MODULE', version: '1.0.0' });

// Safe settings access
const setting = BlacksmithUtils.getSettingSafely('my-module', 'settingName', 'default');

// Logging
BlacksmithUtils.postConsoleAndNotification('my-module', 'Message', data, false, false);

// Hook registration
BlacksmithHookManager.registerHook({ name: 'myHook', callback: () => {} });
```

**Critical Patterns to Follow:**

* Always check API availability before use
* Use standardized MODULE constants
* Implement proper error handling
* Use setTimeout for notifications
* Test integration with provided console commands

**Full Documentation:** <https://github.com/Drowbe/coffee-pub-blacksmith/wiki/Blacksmith-API>

# **Version Compatibility**

## **FoundryVTT Version Support**

- **FoundryVTT 12.x**: ✅ **FULLY SUPPORTED**
- **FoundryVTT 13.x**: ✅ **READY FOR COMPATIBILITY**

## **API Versioning**

```javascript
// Check Blacksmith version
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const version = blacksmith?.version || 'unknown';
console.log('Blacksmith version:', version);

// Version-specific features
if (version >= '12.0.0') {
    // Use FoundryVTT 12+ features
}
```

## **Backward Compatibility**

Blacksmith maintains backward compatibility within major versions. When breaking changes are necessary, they will be:

1. **Announced in advance** through documentation updates
2. **Deprecated gradually** with migration guides
3. **Versioned appropriately** to prevent conflicts
4. **Documented clearly** with examples

# **Error Handling**

## **Comprehensive Error Handling Pattern**

```javascript
class BlacksmithErrorHandler {
    static async safeOperation(operation, fallback = null) {
        try {
            const blacksmith = await this.getBlacksmith();
            return await operation(blacksmith);
        } catch (error) {
            console.error('Blacksmith operation failed:', error);
            return fallback;
        }
    }
    
    static async getBlacksmith() {
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        if (!blacksmith?.utils?.getSettingSafely) {
            throw new Error('Blacksmith API not ready');
        }
        return blacksmith;
    }
}

// Usage
const result = await BlacksmithErrorHandler.safeOperation(
    async (blacksmith) => {
        return blacksmith.utils.getSettingSafely('setting', 'default');
    },
    'fallback-value'
);
```

## **Error Recovery Strategies**

1. **Graceful Degradation**: Provide fallback behavior when Blacksmith unavailable
2. **Retry Logic**: Attempt operations multiple times with delays
3. **User Notification**: Inform users when features are unavailable
4. **Logging**: Record errors for debugging and support

# **Support and Community**

## **Getting Help**

- **Documentation**: This file and related architecture docs
- **Console Commands**: Use `BlacksmithAPIHooks()` and `BlacksmithAPIHookDetails()`
- **Error Logging**: Check browser console for detailed error messages
- **GitHub Issues**: Report problems and request features

## **Contributing**

- **Report Issues**: Document any problems you encounter
- **Feature Requests**: Suggest improvements to the API
- **Examples**: Share your integration patterns with the community
- **Documentation**: Help improve this documentation

---

# **Summary of Key Integration Points**

## **✅ What Works:**
- **Import Required**: `import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js'`
- **Global Objects**: Direct access via `BlacksmithUtils`, `BlacksmithHookManager`, etc.
- **HookManager**: Full hook management with priority and cleanup
- **ModuleManager**: Module registration with feature tracking
- **Utils**: Safe settings access, logging, sound, formatting
- **Stats API**: Combat and player statistics access
- **BLACKSMITH Object**: Global constants and choice arrays

## **⚠️ Common Mistakes to Avoid:**
- **Missing Import**: Always import the bridge file first
- **Wrong Import Path**: Don't use `/scripts/` - use `/api/`
- **Missing Module ID**: Always provide module ID for settings access
- **Incorrect Parameter Order**: Check parameter documentation carefully
- **Using null objects**: Wait for Blacksmith to be ready before accessing global objects

## **🔧 Integration Checklist:**
- [ ] Import the bridge file: `import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js'`
- [ ] Wait for Blacksmith to be ready (global objects are automatically available after import)
- [ ] Register your module during the 'init' hook
- [ ] Always provide context for hook cleanup
- [ ] Use proper error handling and availability checks
- [ ] Test integration with provided console commands

---

**Last Updated**: Current session - API fully functional and documented  
**Status**: Production ready with comprehensive integration support  
**Next Milestone**: Enhanced API features and ecosystem integration

