// ================================================================== 
// ===== BLACKSMITH TOOLBAR API TEST ===============================
// ================================================================== 

/**
 * Test script for Blacksmith Toolbar API
 * 
 * This script demonstrates how to use the Blacksmith Toolbar API
 * and can be used to test API functionality.
 * 
 * USAGE:
 * 1. Open FoundryVTT console (F12)
 * 2. Copy and paste this entire script
 * 3. Run the test functions
 */

// Test configuration
const TEST_MODULE_ID = 'api-test-module';
const TEST_TOOL_ID = 'api-test-tool';

/**
 * Test basic tool registration
 */
async function testBasicRegistration() {
    console.log('🧪 Testing basic tool registration...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api?.registerToolbarTool) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    const success = blacksmith.api.registerToolbarTool(TEST_TOOL_ID, {
        icon: "fa-solid fa-flask",
        name: TEST_TOOL_ID,
        title: "API Test Tool",
        zone: "utilities",
        order: 999,
        moduleId: TEST_MODULE_ID,
        onClick: () => {
            ui.notifications.info("API Test Tool clicked!");
            console.log("✅ API Test Tool onClick executed successfully");
        }
    });
    
    if (success) {
        console.log('✅ Tool registered successfully');
        return true;
    } else {
        console.error('❌ Failed to register tool');
        return false;
    }
}

/**
 * Test tool querying
 */
async function testToolQuerying() {
    console.log('🧪 Testing tool querying...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    // Test isToolRegistered
    const isRegistered = blacksmith.api.isToolRegistered(TEST_TOOL_ID);
    console.log(`✅ isToolRegistered('${TEST_TOOL_ID}'): ${isRegistered}`);
    
    // Test getToolsByModule
    const moduleTools = blacksmith.api.getToolsByModule(TEST_MODULE_ID);
    console.log(`✅ getToolsByModule('${TEST_MODULE_ID}'): ${moduleTools.length} tools`);
    
    // Test getRegisteredTools
    const allTools = blacksmith.api.getRegisteredTools();
    console.log(`✅ getRegisteredTools(): ${allTools.size} total tools`);
    
    return true;
}

/**
 * Test settings management
 */
async function testSettingsManagement() {
    console.log('🧪 Testing settings management...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    // Test getToolbarSettings
    const settings = blacksmith.api.getToolbarSettings();
    console.log('✅ Current toolbar settings:', settings);
    
    // Test setToolbarSettings
    const newSettings = {
        showDividers: !settings.showDividers,
        showLabels: !settings.showLabels
    };
    
    blacksmith.api.setToolbarSettings(newSettings);
    console.log('✅ Settings updated:', newSettings);
    
    // Restore original settings
    setTimeout(() => {
        blacksmith.api.setToolbarSettings(settings);
        console.log('✅ Settings restored to original values');
    }, 2000);
    
    return true;
}

/**
 * Test tool unregistration
 */
async function testToolUnregistration() {
    console.log('🧪 Testing tool unregistration...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    const success = blacksmith.api.unregisterToolbarTool(TEST_TOOL_ID);
    
    if (success) {
        console.log('✅ Tool unregistered successfully');
        return true;
    } else {
        console.error('❌ Failed to unregister tool');
        return false;
    }
}

/**
 * Test GM-only tool
 */
async function testGMOnlyTool() {
    console.log('🧪 Testing GM-only tool...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    const success = blacksmith.api.registerToolbarTool('api-test-gm-tool', {
        icon: "fa-solid fa-shield-alt",
        name: "api-test-gm-tool",
        title: "API Test GM Tool",
        zone: "gmtools",
        order: 999,
        moduleId: TEST_MODULE_ID,
        gmOnly: true,
        onClick: () => {
            ui.notifications.info("GM-only tool clicked!");
            console.log("✅ GM-only tool onClick executed");
        }
    });
    
    if (success) {
        console.log('✅ GM-only tool registered successfully');
        return true;
    } else {
        console.error('❌ Failed to register GM-only tool');
        return false;
    }
}

/**
 * Test leader-only tool
 */
async function testLeaderOnlyTool() {
    console.log('🧪 Testing leader-only tool...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    const success = blacksmith.api.registerToolbarTool('api-test-leader-tool', {
        icon: "fa-solid fa-crown",
        name: "api-test-leader-tool",
        title: "API Test Leader Tool",
        zone: "leadertools",
        order: 999,
        moduleId: TEST_MODULE_ID,
        leaderOnly: true,
        onClick: () => {
            ui.notifications.info("Leader-only tool clicked!");
            console.log("✅ Leader-only tool onClick executed");
        }
    });
    
    if (success) {
        console.log('✅ Leader-only tool registered successfully');
        return true;
    } else {
        console.error('❌ Failed to register leader-only tool');
        return false;
    }
}

/**
 * Test dynamic visibility
 */
async function testDynamicVisibility() {
    console.log('🧪 Testing dynamic visibility...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return false;
    }
    
    const success = blacksmith.api.registerToolbarTool('api-test-dynamic-tool', {
        icon: "fa-solid fa-eye",
        name: "api-test-dynamic-tool",
        title: "API Test Dynamic Tool",
        zone: "utilities",
        order: 999,
        moduleId: TEST_MODULE_ID,
        visible: () => {
            // Only show if user is GM or if it's a specific time
            return game.user.isGM || (new Date().getSeconds() % 2 === 0);
        },
        onClick: () => {
            ui.notifications.info("Dynamic visibility tool clicked!");
            console.log("✅ Dynamic visibility tool onClick executed");
        }
    });
    
    if (success) {
        console.log('✅ Dynamic visibility tool registered successfully');
        return true;
    } else {
        console.error('❌ Failed to register dynamic visibility tool');
        return false;
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('🚀 Starting Blacksmith Toolbar API Tests...');
    console.log('==========================================');
    
    const tests = [
        { name: 'Basic Registration', fn: testBasicRegistration },
        { name: 'Tool Querying', fn: testToolQuerying },
        { name: 'Settings Management', fn: testSettingsManagement },
        { name: 'GM-Only Tool', fn: testGMOnlyTool },
        { name: 'Leader-Only Tool', fn: testLeaderOnlyTool },
        { name: 'Dynamic Visibility', fn: testDynamicVisibility },
        { name: 'Tool Unregistration', fn: testToolUnregistration }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            if (result) {
                passed++;
                console.log(`✅ ${test.name}: PASSED`);
            } else {
                failed++;
                console.log(`❌ ${test.name}: FAILED`);
            }
        } catch (error) {
            failed++;
            console.log(`❌ ${test.name}: ERROR - ${error.message}`);
        }
        console.log('---');
    }
    
    console.log('==========================================');
    console.log(`🏁 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('🎉 All tests passed! Blacksmith Toolbar API is working correctly.');
    } else {
        console.log('⚠️ Some tests failed. Check the console for details.');
    }
}

/**
 * Clean up test tools
 */
function cleanupTestTools() {
    console.log('🧹 Cleaning up test tools...');
    
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('❌ Blacksmith API not available');
        return;
    }
    
    const testTools = [
        TEST_TOOL_ID,
        'api-test-gm-tool',
        'api-test-leader-tool',
        'api-test-dynamic-tool'
    ];
    
    testTools.forEach(toolId => {
        if (blacksmith.api.isToolRegistered(toolId)) {
            blacksmith.api.unregisterToolbarTool(toolId);
            console.log(`✅ Cleaned up tool: ${toolId}`);
        }
    });
    
    console.log('✅ Cleanup complete');
}

// Export functions for manual testing
window.BlacksmithToolbarAPITest = {
    runAllTests,
    testBasicRegistration,
    testToolQuerying,
    testSettingsManagement,
    testGMOnlyTool,
    testLeaderOnlyTool,
    testDynamicVisibility,
    testToolUnregistration,
    cleanupTestTools
};

console.log('🔧 Blacksmith Toolbar API Test loaded!');
console.log('Available functions:');
console.log('- BlacksmithToolbarAPITest.runAllTests()');
console.log('- BlacksmithToolbarAPITest.cleanupTestTools()');
console.log('- Individual test functions available');
