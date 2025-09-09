// ================================================================== 
// ===== BLACKSMITH TOOLBAR MANAGER ================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-common.js';

/**
 * BlacksmithToolbarManager - Manages dynamic tool registration for the Blacksmith toolbar
 * 
 * This class provides a centralized system for registering, unregistering, and managing
 * tools that appear in the Blacksmith Utilities toolbar. It follows the same pattern
 * as ChatPanel.toolbarIcons for consistency.
 */
export class BlacksmithToolbarManager {
    
    // Map to store registered tools: toolId -> toolData
    static registeredTools = new Map();
    
    // Hook ID for the toolbar registration
    static hookId = null;
    
    /**
     * Initialize the Blacksmith Toolbar Manager
     */
    static initialize() {
        postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Initializing", "", true, false);
        
        // Register the default tools that were previously hardcoded
        this._registerDefaultTools();
        
        postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Initialized", `Registered ${this.registeredTools.size} tools`, true, false);
    }
    
    /**
     * Register a tool for the Blacksmith toolbar
     * @param {string} toolId - Unique identifier for the tool
     * @param {Object} toolData - Tool configuration object
     * @param {string} toolData.icon - FontAwesome icon class
     * @param {string} toolData.name - Tool name (used internally)
     * @param {string} toolData.title - Tool title (displayed on hover)
     * @param {boolean} toolData.button - Whether this is a button tool
     * @param {boolean|Function} toolData.visible - Visibility condition (boolean or function)
     * @param {Function} toolData.onClick - Click handler function
     * @param {string} toolData.moduleId - Module ID that registered this tool (optional)
     * @returns {boolean} Success status
     */
    static registerTool(toolId, toolData) {
        try {
            // Validate required properties
            if (!toolId || typeof toolId !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Invalid toolId", toolId, false, false);
                return false;
            }
            
            if (!toolData || typeof toolData !== 'object') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Invalid toolData", "", false, false);
                return false;
            }
            
            const requiredProps = ['icon', 'name', 'title', 'button', 'visible', 'onClick'];
            for (const prop of requiredProps) {
                if (!(prop in toolData)) {
                    postConsoleAndNotification(MODULE.NAME, `Blacksmith Toolbar Manager: Missing required property '${prop}'`, "", false, false);
                    return false;
                }
            }
            
            // Validate property types
            if (typeof toolData.icon !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: icon must be a string", "", false, false);
                return false;
            }
            
            if (typeof toolData.name !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: name must be a string", "", false, false);
                return false;
            }
            
            if (typeof toolData.title !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: title must be a string", "", false, false);
                return false;
            }
            
            if (typeof toolData.button !== 'boolean') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: button must be a boolean", "", false, false);
                return false;
            }
            
            if (typeof toolData.visible !== 'boolean' && typeof toolData.visible !== 'function') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: visible must be a boolean or function", "", false, false);
                return false;
            }
            
            if (typeof toolData.onClick !== 'function') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: onClick must be a function", "", false, false);
                return false;
            }
            
            // Store the tool
            this.registeredTools.set(toolId, {
                ...toolData,
                moduleId: toolData.moduleId || 'blacksmith-core',
                registeredAt: Date.now()
            });
            
            postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Tool registered", `${toolId} by ${toolData.moduleId || 'blacksmith-core'}`, true, false);
            return true;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error registering tool", error, false, false);
            return false;
        }
    }
    
    /**
     * Unregister a tool from the Blacksmith toolbar
     * @param {string} toolId - Unique identifier for the tool
     * @returns {boolean} Success status
     */
    static unregisterTool(toolId) {
        try {
            if (!toolId || typeof toolId !== 'string') {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Invalid toolId", toolId, false, false);
                return false;
            }
            
            if (!this.registeredTools.has(toolId)) {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Tool not found", toolId, false, false);
                return false;
            }
            
            const toolData = this.registeredTools.get(toolId);
            this.registeredTools.delete(toolId);
            
            postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Tool unregistered", `${toolId} by ${toolData.moduleId}`, true, false);
            return true;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error unregistering tool", error, false, false);
            return false;
        }
    }
    
    /**
     * Get all registered tools
     * @returns {Array} Array of tool objects
     */
    static getRegisteredTools() {
        return Array.from(this.registeredTools.values());
    }
    
    /**
     * Get a specific tool by ID
     * @param {string} toolId - Unique identifier for the tool
     * @returns {Object|null} Tool object or null if not found
     */
    static getTool(toolId) {
        return this.registeredTools.get(toolId) || null;
    }
    
    /**
     * Check if a tool is registered
     * @param {string} toolId - Unique identifier for the tool
     * @returns {boolean} True if tool is registered
     */
    static hasTool(toolId) {
        return this.registeredTools.has(toolId);
    }
    
    /**
     * Get tools by module ID
     * @param {string} moduleId - Module ID to filter by
     * @returns {Array} Array of tool objects from the specified module
     */
    static getToolsByModule(moduleId) {
        return Array.from(this.registeredTools.values()).filter(tool => tool.moduleId === moduleId);
    }
    
    /**
     * Clear all tools from a specific module
     * @param {string} moduleId - Module ID to clear tools for
     * @returns {number} Number of tools removed
     */
    static clearModuleTools(moduleId) {
        let removedCount = 0;
        for (const [toolId, toolData] of this.registeredTools.entries()) {
            if (toolData.moduleId === moduleId) {
                this.registeredTools.delete(toolId);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Cleared module tools", `${removedCount} tools from ${moduleId}`, true, false);
        }
        
        return removedCount;
    }
    
    /**
     * Get tools that should be visible (evaluate visibility conditions)
     * @returns {Array} Array of visible tool objects
     */
    static getVisibleTools() {
        return Array.from(this.registeredTools.values()).filter(tool => {
            if (typeof tool.visible === 'function') {
                try {
                    return tool.visible();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error evaluating visibility", error, false, false);
                    return false;
                }
            }
            return tool.visible;
        });
    }
    
    /**
     * Register the default tools that were previously hardcoded
     * @private
     */
    static _registerDefaultTools() {
        // Import the required functions for default tools
        import('./blacksmith.js').then(({ buildButtonEventRegent }) => {
            import('./window-gmtools.js').then(({ CSSEditor }) => {
                import('./journal-tools.js').then(({ JournalToolsWindow }) => {
                    
                    // Register all the default tools
                    this.registerTool('regent', {
                        icon: "fa-solid fa-crystal-ball",
                        name: "regent",
                        title: "Consult the Regent",
                        button: true,
                        visible: true,
                        onClick: buildButtonEventRegent,
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('lookup', {
                        icon: "fa-solid fa-bolt-lightning",
                        name: "lookup",
                        title: "Open Lookup Worksheet",
                        button: true,
                        visible: true,
                        onClick: () => buildButtonEventRegent('lookup'),
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('character', {
                        icon: "fa-solid fa-helmet-battle",
                        name: "character",
                        title: "Open Character Worksheet",
                        button: true,
                        visible: true,
                        onClick: () => buildButtonEventRegent('character'),
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('assistant', {
                        icon: "fa-solid fa-hammer-brush",
                        name: "assistant",
                        title: "Open Assistant Worksheet",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => buildButtonEventRegent('assistant'),
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('encounter', {
                        icon: "fa-solid fa-swords",
                        name: "encounter",
                        title: "Open Encounter Worksheet",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => buildButtonEventRegent('encounter'),
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('narrative', {
                        icon: "fa-solid fa-masks-theater",
                        name: "narrative",
                        title: "Open Narrative Worksheet",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => buildButtonEventRegent('narrative'),
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('css', {
                        icon: "fa-solid fa-paint-brush",
                        name: "css",
                        title: "Open GM Tools",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => {
                            const editor = new CSSEditor();
                            editor.render(true);
                        },
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('journal-tools', {
                        icon: "fa-solid fa-book-open",
                        name: "journal-tools",
                        title: "Journal Tools",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => {
                            // Create a dummy journal object for the window to work with
                            // The window will handle journal selection internally
                            const dummyJournal = { id: null, name: "Select Journal" };
                            const journalTools = new JournalToolsWindow(dummyJournal);
                            journalTools.render(true);
                        },
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('refresh', {
                        icon: "fa-solid fa-sync-alt",
                        name: "refresh",
                        title: "Refresh Client",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => {
                            window.location.reload();
                        },
                        moduleId: 'blacksmith-core'
                    });
                    
                    this.registerTool('request-roll', {
                        icon: "fa-solid fa-dice",
                        name: "request-roll",
                        title: "Request a Roll",
                        button: true,
                        visible: () => game.user.isGM,
                        onClick: () => {
                            // Import and open the SkillCheckDialog (same as chat panel)
                            import('./window-skillcheck.js').then(({ SkillCheckDialog }) => {
                                const dialog = new SkillCheckDialog();
                                dialog.render(true);
                            }).catch(error => {
                                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error opening SkillCheckDialog", error, false, false);
                            });
                        },
                        moduleId: 'blacksmith-core'
                    });
                    
                }).catch(error => {
                    postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error importing JournalToolsWindow", error, false, false);
                });
            }).catch(error => {
                postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error importing CSSEditor", error, false, false);
            });
        }).catch(error => {
            postConsoleAndNotification(MODULE.NAME, "Blacksmith Toolbar Manager: Error importing buildButtonEventRegent", error, false, false);
        });
    }
}
