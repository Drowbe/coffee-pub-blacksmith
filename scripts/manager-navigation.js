import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

/**
 * Manages scene navigation behavior for the Blacksmith module
 * Handles custom click behaviors for scene directory and navigation bar
 */
export class NavigationManager {
    static _singleClickTimeouts = new Map();

    /**
     * Initialize scene navigation hooks
     */
    static initialize() {
        console.log('Scene Navigation: Registering hooks via HookManager...');
        
        // Use setTimeout to delay execution until after module loading phase
        // All early hooks (init, ready, canvasReady, updateScene) have already fired
        setTimeout(() => {
            NavigationManager._onReady();
        }, 1000); // 1 second delay to ensure module loading is complete
        
        // Register renderSceneDirectory hook
        HookManager.registerHook({
            name: 'renderSceneDirectory',
            description: 'Scene Navigation: Attach click listeners to scene directory',
            context: 'Module',
            priority: 3,
            key: 'scene-navigation-directory',
            callback: NavigationManager._onRenderSceneDirectory
        });
        
        // Register renderSceneNavigation hook
        HookManager.registerHook({
            name: 'renderSceneNavigation',
            description: 'Scene Navigation: Attach click listeners to scene navigation bar',
            context: 'Module',
            priority: 3,
            key: 'scene-navigation-bar',
            callback: NavigationManager._onRenderSceneNavigation
        });
        
        // Register cleanup hook
        HookManager.registerHook({
            name: 'unloadModule',
            description: 'Scene Navigation: Cleanup scene navigation hooks',
            context: 'Module',
            priority: 3,
            key: 'scene-navigation-cleanup',
            callback: NavigationManager.cleanup
        });
        
        postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Hooks registered via HookManager', '', true, false);
    }

    /**
     * Initialize scene navigation after module loading is complete
     * @private
     */
    static _onReady() {
        // Update scene icons on initial load
        NavigationManager._updateSceneIcons();
        
        // Try to attach listeners if elements exist
        const sceneDirectory = document.querySelector('#scenes');
        if (sceneDirectory) {
            NavigationManager._attachSceneClickListeners($(sceneDirectory));
        }
        
        const sceneNavigation = document.querySelector('#navigation');
        if (sceneNavigation) {
            NavigationManager._attachSceneClickListeners($(sceneNavigation));
        }
        
        // Try ui.scenes.element if direct query failed
        if (!sceneDirectory && ui.scenes?.element) {
            NavigationManager._attachSceneClickListeners(ui.scenes.element);
        }
    }

    /**
     * Cleanup scene navigation hooks
     * @private
     */
    static cleanup() {
        console.log('Scene Navigation: Cleaning up hooks...');
        
        // Unregister hooks via HookManager
        HookManager.unregisterHook('ready', 'scene-navigation-ready-debug');
        HookManager.unregisterHook('renderSceneDirectory', 'scene-navigation-directory');
        HookManager.unregisterHook('renderSceneNavigation', 'scene-navigation-bar');
        
        // Clear any pending timeouts
        if (NavigationManager._singleClickTimeouts) {
            NavigationManager._singleClickTimeouts.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            NavigationManager._singleClickTimeouts.clear();
        }
        
        postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Cleanup completed', '', true, false);
    }

    /**
     * Hook callback for renderSceneDirectory
     * @private
     */
    static _onRenderSceneDirectory(app, html) {
        NavigationManager._attachSceneClickListeners(html);
        // Update icons after render (Foundry wipes them out on re-render)
        setTimeout(() => NavigationManager._updateSceneIcons(), 10);
    }

    /**
     * Hook callback for renderSceneNavigation
     * @private
     */
    static _onRenderSceneNavigation(app, html) {
        NavigationManager._attachSceneClickListeners(html);
        // Update icons after render (Foundry wipes them out on re-render)
        setTimeout(() => NavigationManager._updateSceneIcons(), 10);
    }

    /**
     * Attach click listeners to scene elements
     * @private
     */
    static _attachSceneClickListeners(html) {
        // Try different selectors to find scene elements
        const selectors = [
            '.directory-item .scene-name',
            '.directory-item a',
            '.directory-item .scene',
            '.scene-name'
        ];
        
        for (const selector of selectors) {
            const elements = html.find(selector);
            if (elements.length > 0) {
                elements.off('click.blacksmith').on('click.blacksmith', NavigationManager._onSceneClickNative);
                break; // Stop after finding elements with the first working selector
            }
        }
    }

    /**
     * Native click handler for scene navigation
     * @private
     */
    static async _onSceneClickNative(event) {
        try {
            console.log('Scene Navigation: *** NATIVE HANDLER CALLED ***', {
                type: event?.type,
                detail: event?.detail,
                shiftKey: event?.shiftKey
            });
            
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: *** NATIVE HANDLER CALLED ***', {
                type: event?.type,
                detail: event?.detail,
                shiftKey: event?.shiftKey
            }, true, false);
            
            if (!event) return;

            // Only handle if custom clicks are enabled
            const blnCustomClicks = game.settings.get(MODULE.ID, 'enableSceneClickBehaviors');
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Custom clicks enabled', blnCustomClicks, true, false);

            if (!blnCustomClicks) {
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Custom clicks disabled, allowing default', '', true, false);
                return; // Allow default behavior
            }

            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Preventing default and stopping propagation', '', true, false);
            event.preventDefault();
            event.stopPropagation();

            const directoryItem = event.currentTarget.closest(".directory-item");
            const entryId = directoryItem?.dataset.entryId;
            
            // Check if this is actually a scene (not other documents)
            const scene = game.scenes.get(entryId);
            if (!scene) {
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Not a scene, allowing default', {entryId}, true, false);
                return; // Allow default behavior
            }
            
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Scene identified', {name: scene?.name, id: entryId}, true, false);
            
            // Handle shift-click for configuration
            if (event.shiftKey) {
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Shift-click detected, opening config', '', true, false);
                scene.sheet.render(true);
                return;
            }

            // Handle double-click for activation
            if (event.type === "click" && event.detail === 2) {
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Double-click detected, activating scene', scene.name, true, false);
                // Clear any pending single-click timeout for this scene
                if (NavigationManager._singleClickTimeouts && NavigationManager._singleClickTimeouts.has(entryId)) {
                    clearTimeout(NavigationManager._singleClickTimeouts.get(entryId));
                    NavigationManager._singleClickTimeouts.delete(entryId);
                    postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Cleared pending single-click timeout', scene.name, true, false);
                }
                await scene.activate();
                NavigationManager._updateSceneIcons();
                return;
            }

            // Handle single-click for viewing with a delay
            if (event.type === "click" && event.detail === 1) {
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Single-click detected, scheduling view in 250ms', scene.name, true, false);
                
                // Clear any existing timeout for this scene
                if (NavigationManager._singleClickTimeouts && NavigationManager._singleClickTimeouts.has(entryId)) {
                    clearTimeout(NavigationManager._singleClickTimeouts.get(entryId));
                }
                
                // Store the timeout ID
                if (!NavigationManager._singleClickTimeouts) {
                    NavigationManager._singleClickTimeouts = new Map();
                }
                
                const timeoutId = setTimeout(async () => {
                    // Only proceed if this wasn't followed by a double-click
                    if (event.detail === 1) {
                        await scene.view();
                        // Update icons after viewing (scene.view doesn't trigger updateScene hook)
                        NavigationManager._updateSceneIcons();
                    }
                    // Clean up the timeout reference
                    if (NavigationManager._singleClickTimeouts) {
                        NavigationManager._singleClickTimeouts.delete(entryId);
                    }
                }, 250); // 250ms delay
                
                NavigationManager._singleClickTimeouts.set(entryId, timeoutId);
                return;
            }
            
        } catch (error) {
            console.error('Scene Navigation: ERROR in native handler', error);
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: ERROR in native handler', error.message, false, true);
        }
    }

    /**
     * Update scene icons to show active/viewing state
     * @private
     */
    static _updateSceneIcons() {
        const blnShowIcons = game.settings.get(MODULE.ID, 'enableSceneInteractions');
        if (!blnShowIcons) return;

        const activeSceneId = game.scenes.active?.id;
        const viewingSceneId = game.scenes.current?.id;
        
        game.scenes.forEach(scene => {
            const sceneElement = $(`.directory-list .scene[data-entry-id=${scene.id}]`);
            const sceneNameElement = $(sceneElement).find("a");
            
            if (sceneNameElement.length === 0) return; // Skip if element not found
            
            // Remove all existing icons
            $(sceneNameElement).find('.fa-solid').remove();
            
            // Add appropriate icon
            if (scene.id === activeSceneId) {
                $(sceneNameElement).prepend("<i class='fa-solid fa-bow-arrow tabs-scenes-icon icon-active'></i> ");
            } else if (scene.id === viewingSceneId) {
                $(sceneNameElement).prepend("<i class='fa-solid fa-eye tabs-scenes-icon icon-viewing'></i> ");
            }
        });
    }
}

