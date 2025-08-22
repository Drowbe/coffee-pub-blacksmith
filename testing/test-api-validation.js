// Test file to verify the Blacksmith API fix
// This should be run in the browser console after Blacksmith loads

console.log('Testing Blacksmith API fix...');

// Function to test the API when it's ready
function testBlacksmithAPI() {
    console.log('🔍 Testing Blacksmith API availability...');
    
    // Test 1: Check if API is available
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.error('❌ Blacksmith API not found');
        console.log('💡 This usually means Blacksmith is still initializing...');
        return false;
    }
    
    console.log('✅ Blacksmith API found');
    
    // Test 2: Check if utils is available
    if (!blacksmith?.utils) {
        console.error('❌ Utils not available');
        return false;
    }
    
    console.log('✅ Utils available');
    
    // Test 3: Check if safe settings functions are available
    const requiredFunctions = [
        'getSettingSafely',
        'setSettingSafely', 
        'getCachedSetting'
    ];
    
    let allFunctionsAvailable = true;
    requiredFunctions.forEach(funcName => {
        if (typeof blacksmith.utils[funcName] === 'function') {
            console.log(`✅ ${funcName} is available`);
        } else {
            console.log(`❌ ${funcName} is NOT available`);
            allFunctionsAvailable = false;
        }
    });
    
    if (allFunctionsAvailable) {
        console.log('🎉 ALL SAFE SETTINGS FUNCTIONS ARE NOW WORKING!');
        
        // Test 4: Try to use getSettingSafely
        try {
            const testValue = blacksmith.utils.getSettingSafely('test-module', 'test-setting', 'fallback');
            console.log('✅ getSettingSafely test successful, returned:', testValue);
        } catch (error) {
            console.error('❌ getSettingSafely test failed:', error);
        }
        
        // Test 5: List all available utils
        console.log('📋 All available utils:');
        Object.keys(blacksmith.utils).forEach(key => {
            const type = typeof blacksmith.utils[key];
            console.log(`  - ${key}: ${type}`);
        });
        
        return true;
    } else {
        console.error('❌ Some functions are still missing');
        return false;
    }
}

// Function to wait for API and then test
function waitAndTestAPI() {
    console.log('⏳ Waiting for Blacksmith API to be ready...');
    
    // Check if API is ready
    if (game.modules.get('coffee-pub-blacksmith')?.api?.utils) {
        console.log('🚀 API is ready, testing now...');
        return testBlacksmithAPI();
    }
    
    // If not ready, wait a bit and try again
    console.log('⏰ API not ready yet, waiting 1 second...');
    setTimeout(waitAndTestAPI, 1000);
}

// Start the test
waitAndTestAPI();

// Also provide a manual test function
console.log('💡 You can also manually test with: testBlacksmithAPI()');

