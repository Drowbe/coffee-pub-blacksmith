// Simple test for Blacksmith API - run this in console
console.log('=== SIMPLE BLACKSMITH API TEST ===');

// Check if module exists
const module = game.modules.get('coffee-pub-blacksmith');

console.log('Module found:', !!module);

if (module) {
    console.log('Module active:', module.active);
    console.log('Module API:', !!module.api);
    
    if (module.api) {
        console.log('Utils available:', !!module.api.utils);
        
        if (module.api.utils) {
            console.log('getSettingSafely available:', typeof module.api.utils.getSettingSafely);
            console.log('setSettingSafely available:', typeof module.api.utils.setSettingSafely);
            console.log('getCachedSetting available:', typeof module.api.utils.getCachedSetting);
            
            // List all utils
            console.log('All utils:', Object.keys(module.api.utils));
        }
    }
}

// Alternative: Check if UtilsManager is available globally
console.log('UtilsManager available:', typeof UtilsManager !== 'undefined');
if (typeof UtilsManager !== 'undefined') {
    console.log('UtilsManager initialized:', UtilsManager.isInitialized);
    console.log('UtilsManager API version:', UtilsManager.API_VERSION);
}
