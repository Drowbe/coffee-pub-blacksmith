// ================================================================== 
// ===== EXAMPLE MODULE INTEGRATION ================================
// ================================================================== 

/**
 * Example Module Integration with Blacksmith Toolbar API
 * 
 * This file demonstrates how an external module can integrate
 * with the Blacksmith Toolbar API to add custom tools.
 * 
 * This is a complete example that can be used as a template
 * for real module development.
 */

// Example module configuration
const EXAMPLE_MODULE = {
    ID: 'example-blacksmith-integration',
    NAME: 'Example Blacksmith Integration',
    VERSION: '1.0.0'
};

// Toolbar tools to register
const TOOLBAR_TOOLS = [
    {
        id: 'example-dice-roller',
        data: {
            icon: "fa-solid fa-dice-d20",
            name: "example-dice-roller",
            title: "Example Dice Roller",
            zone: "rolls",
            order: 5,
            moduleId: EXAMPLE_MODULE.ID,
            onClick: () => {
                // Simple dice roller example
                const roll = new Roll('1d20');
                roll.roll();
                roll.toMessage({
                    flavor: "Example Dice Roll",
                    speaker: ChatMessage.getSpeaker()
                });
                ui.notifications.info(`Rolled: ${roll.total}`);
            }
        }
    },
    {
        id: 'example-gm-tool',
        data: {
            icon: "fa-solid fa-cog",
            name: "example-gm-tool",
            title: "Example GM Tool",
            zone: "gmtools",
            order: 10,
            moduleId: EXAMPLE_MODULE.ID,
            gmOnly: true,
            onClick: () => {
                ui.notifications.info("GM tool activated!");
                console.log("Example GM tool clicked by:", game.user.name);
            }
        }
    },
    {
        id: 'example-leader-tool',
        data: {
            icon: "fa-solid fa-crown",
            name: "example-leader-tool",
            title: "Example Leader Tool",
            zone: "leadertools",
            order: 1,
            moduleId: EXAMPLE_MODULE.ID,
            leaderOnly: true,
            onClick: () => {
                ui.notifications.info("Leader tool activated!");
                console.log("Example leader tool clicked by:", game.user.name);
            }
        }
    },
    {
        id: 'example-utility-tool',
        data: {
            icon: "fa-solid fa-wrench",
            name: "example-utility-tool",
            title: "Example Utility Tool",
            zone: "utilities",
            order: 15,
            moduleId: EXAMPLE_MODULE.ID,
            visible: () => {
                // Dynamic visibility based on some condition
                return game.user.isGM || game.settings.get(EXAMPLE_MODULE.ID, 'enableUtilityTool');
            },
            onClick: () => {
                ui.notifications.info("Utility tool activated!");
                console.log("Example utility tool clicked by:", game.user.name);
            }
        }
    }
];

/**
 * Example Module Class
 */
class ExampleModule {
    constructor() {
        this.blacksmithAPI = null;
        this.registeredTools = new Set();
        this.isInitialized = false;
    }

    /**
     * Initialize the module
     */
    async initialize() {
        console.log(`${EXAMPLE_MODULE.NAME}: Initializing...`);
        
        // Wait for Blacksmith API to be available
        await this.waitForBlacksmithAPI();
        
        // Register module with Blacksmith
        this.registerWithBlacksmith();
        
        // Register toolbar tools
        this.registerToolbarTools();
        
        // Set up hooks
        this.setupHooks();
        
        this.isInitialized = true;
        console.log(`${EXAMPLE_MODULE.NAME}: Initialized successfully`);
    }

    /**
     * Wait for Blacksmith API to be available
     */
    async waitForBlacksmithAPI() {
        return new Promise((resolve) => {
            const checkAPI = () => {
                const blacksmith = game.modules.get('coffee-pub-blacksmith');
                if (blacksmith?.api?.registerToolbarTool) {
                    this.blacksmithAPI = blacksmith.api;
                    resolve();
                } else {
                    // Check again in 100ms
                    setTimeout(checkAPI, 100);
                }
            };
            checkAPI();
        });
    }

    /**
     * Register module with Blacksmith
     */
    registerWithBlacksmith() {
        if (this.blacksmithAPI?.registerModule) {
            this.blacksmithAPI.registerModule(EXAMPLE_MODULE.ID, {
                name: EXAMPLE_MODULE.NAME,
                version: EXAMPLE_MODULE.VERSION,
                features: ['toolbar-integration']
            });
            console.log(`${EXAMPLE_MODULE.NAME}: Registered with Blacksmith`);
        }
    }

    /**
     * Register all toolbar tools
     */
    registerToolbarTools() {
        if (!this.blacksmithAPI) {
            console.error(`${EXAMPLE_MODULE.NAME}: Blacksmith API not available`);
            return;
        }

        TOOLBAR_TOOLS.forEach(tool => {
            try {
                const success = this.blacksmithAPI.registerToolbarTool(tool.id, tool.data);
                if (success) {
                    this.registeredTools.add(tool.id);
                    console.log(`${EXAMPLE_MODULE.NAME}: Registered tool: ${tool.id}`);
                } else {
                    console.error(`${EXAMPLE_MODULE.NAME}: Failed to register tool: ${tool.id}`);
                }
            } catch (error) {
                console.error(`${EXAMPLE_MODULE.NAME}: Error registering tool ${tool.id}:`, error);
            }
        });
    }

    /**
     * Unregister all toolbar tools
     */
    unregisterToolbarTools() {
        if (!this.blacksmithAPI) {
            return;
        }

        this.registeredTools.forEach(toolId => {
            try {
                const success = this.blacksmithAPI.unregisterToolbarTool(toolId);
                if (success) {
                    console.log(`${EXAMPLE_MODULE.NAME}: Unregistered tool: ${toolId}`);
                } else {
                    console.error(`${EXAMPLE_MODULE.NAME}: Failed to unregister tool: ${toolId}`);
                }
            } catch (error) {
                console.error(`${EXAMPLE_MODULE.NAME}: Error unregistering tool ${toolId}:`, error);
            }
        });
        
        this.registeredTools.clear();
    }

    /**
     * Set up FoundryVTT hooks
     */
    setupHooks() {
        // Clean up when module is disabled
        Hooks.once('disableModule', (moduleId) => {
            if (moduleId === EXAMPLE_MODULE.ID) {
                this.cleanup();
            }
        });

        // Handle module updates
        Hooks.once('updateModule', (moduleId) => {
            if (moduleId === EXAMPLE_MODULE.ID) {
                this.cleanup();
                this.initialize();
            }
        });
    }

    /**
     * Clean up module resources
     */
    cleanup() {
        console.log(`${EXAMPLE_MODULE.NAME}: Cleaning up...`);
        this.unregisterToolbarTools();
        this.isInitialized = false;
    }

    /**
     * Get module status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            blacksmithAPI: !!this.blacksmithAPI,
            registeredTools: Array.from(this.registeredTools),
            toolCount: this.registeredTools.size
        };
    }
}

// Create and initialize the example module
const exampleModule = new ExampleModule();

// Initialize when FoundryVTT is ready
Hooks.once('ready', () => {
    exampleModule.initialize();
});

// Export for testing
window.ExampleModule = exampleModule;

console.log(`${EXAMPLE_MODULE.NAME}: Module script loaded`);

// ================================================================== 
// ===== USAGE EXAMPLES ============================================
// ================================================================== 

/**
 * Example: Manual tool registration
 */
function registerCustomTool() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api?.registerToolbarTool) {
        console.error('Blacksmith API not available');
        return;
    }

    const success = blacksmith.api.registerToolbarTool('manual-custom-tool', {
        icon: "fa-solid fa-star",
        name: "manual-custom-tool",
        title: "Manual Custom Tool",
        zone: "utilities",
        order: 50,
        moduleId: 'manual-example',
        onClick: () => {
            ui.notifications.info("Manual custom tool clicked!");
        }
    });

    console.log('Manual tool registration:', success ? 'SUCCESS' : 'FAILED');
}

/**
 * Example: Query registered tools
 */
function queryTools() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('Blacksmith API not available');
        return;
    }

    // Get all tools
    const allTools = blacksmith.api.getRegisteredTools();
    console.log('All registered tools:', allTools.size);

    // Get tools by module
    const moduleTools = blacksmith.api.getToolsByModule(EXAMPLE_MODULE.ID);
    console.log('Example module tools:', moduleTools.length);

    // Check specific tool
    const isRegistered = blacksmith.api.isToolRegistered('example-dice-roller');
    console.log('Dice roller registered:', isRegistered);
}

/**
 * Example: Manage toolbar settings
 */
function manageSettings() {
    const blacksmith = game.modules.get('coffee-pub-blacksmith');
    if (!blacksmith?.api) {
        console.error('Blacksmith API not available');
        return;
    }

    // Get current settings
    const settings = blacksmith.api.getToolbarSettings();
    console.log('Current settings:', settings);

    // Toggle dividers
    blacksmith.api.setToolbarSettings({
        showDividers: !settings.showDividers
    });
    console.log('Toggled dividers');
}

// Export utility functions
window.ExampleModuleUtils = {
    registerCustomTool,
    queryTools,
    manageSettings,
    getModuleStatus: () => exampleModule.getStatus()
};

console.log('Example Module Integration loaded!');
console.log('Available functions:');
console.log('- ExampleModuleUtils.registerCustomTool()');
console.log('- ExampleModuleUtils.queryTools()');
console.log('- ExampleModuleUtils.manageSettings()');
console.log('- ExampleModuleUtils.getModuleStatus()');
