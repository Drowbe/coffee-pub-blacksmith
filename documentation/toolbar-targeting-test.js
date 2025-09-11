/**
 * Toolbar Targeting Test Script
 * 
 * This script tests the new onCoffeePub and onFoundry parameters
 * for the Blacksmith toolbar API.
 * 
 * Run this in the browser console to test the functionality.
 */

// Test the new toolbar targeting parameters
function testToolbarTargeting() {
    console.log("🧪 Testing Blacksmith Toolbar Targeting API...");
    
    // Get the Blacksmith API
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.registerToolbarTool) {
        console.error("❌ Blacksmith API not available");
        return false;
    }
    
    console.log("✅ Blacksmith API available");
    
    // Test 1: Tool only in Blacksmith toolbar
    console.log("\n📋 Test 1: Blacksmith-only tool");
    const blacksmithOnly = blacksmith.registerToolbarTool('test-blacksmith-only', {
        icon: "fa-solid fa-coffee",
        name: "test-blacksmith-only",
        title: "Blacksmith Only Tool",
        button: true,
        visible: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => console.log("Blacksmith-only tool clicked!"),
        moduleId: "test-module",
        zone: "utilities",
        order: 1
    });
    console.log(blacksmithOnly ? "✅ Registered successfully" : "❌ Registration failed");
    
    // Test 2: Tool only in FoundryVTT toolbar
    console.log("\n📋 Test 2: FoundryVTT-only tool");
    const foundryOnly = blacksmith.registerToolbarTool('test-foundry-only', {
        icon: "fa-solid fa-dice-d20",
        name: "test-foundry-only",
        title: "FoundryVTT Only Tool",
        button: true,
        visible: true,
        onCoffeePub: false,
        onFoundry: true,
        onClick: () => console.log("FoundryVTT-only tool clicked!"),
        moduleId: "test-module",
        zone: "rolls",
        order: 1
    });
    console.log(foundryOnly ? "✅ Registered successfully" : "❌ Registration failed");
    
    // Test 3: Tool in both toolbars
    console.log("\n📋 Test 3: Both toolbars tool");
    const bothToolbars = blacksmith.registerToolbarTool('test-both-toolbars', {
        icon: "fa-solid fa-star",
        name: "test-both-toolbars",
        title: "Both Toolbars Tool",
        button: true,
        visible: true,
        onCoffeePub: true,
        onFoundry: true,
        onClick: () => console.log("Both toolbars tool clicked!"),
        moduleId: "test-module",
        zone: "general",
        order: 1
    });
    console.log(bothToolbars ? "✅ Registered successfully" : "❌ Registration failed");
    
    // Test 4: Default behavior (should be Blacksmith-only)
    console.log("\n📋 Test 4: Default behavior");
    const defaultBehavior = blacksmith.registerToolbarTool('test-default', {
        icon: "fa-solid fa-question",
        name: "test-default",
        title: "Default Behavior Tool",
        button: true,
        visible: true,
        // No onCoffeePub or onFoundry specified - should default to onCoffeePub: true, onFoundry: false
        onClick: () => console.log("Default behavior tool clicked!"),
        moduleId: "test-module",
        zone: "general",
        order: 2
    });
    console.log(defaultBehavior ? "✅ Registered successfully" : "❌ Registration failed");
    
    // Test 5: Verify tool registration
    console.log("\n📋 Test 5: Verification");
    const allTools = blacksmith.getRegisteredTools();
    const testTools = Array.from(allTools.values()).filter(tool => tool.moduleId === "test-module");
    
    console.log(`Found ${testTools.length} test tools:`);
    testTools.forEach(tool => {
        console.log(`  - ${tool.name}: onCoffeePub=${tool.onCoffeePub}, onFoundry=${tool.onFoundry}`);
    });
    
    // Test 6: Cleanup
    console.log("\n📋 Test 6: Cleanup");
    const cleanup1 = blacksmith.unregisterToolbarTool('test-blacksmith-only');
    const cleanup2 = blacksmith.unregisterToolbarTool('test-foundry-only');
    const cleanup3 = blacksmith.unregisterToolbarTool('test-both-toolbars');
    const cleanup4 = blacksmith.unregisterToolbarTool('test-default');
    
    console.log(`Cleanup: ${cleanup1 && cleanup2 && cleanup3 && cleanup4 ? "✅ All tools removed" : "❌ Some tools failed to remove"}`);
    
    console.log("\n🎉 Toolbar Targeting Test Complete!");
    return true;
}

// Run the test
testToolbarTargeting();
