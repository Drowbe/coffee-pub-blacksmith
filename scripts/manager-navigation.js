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
     * Cleanup scene navigation hooks
     * @private
     */
    static cleanup() {
        console.log('Scene Navigation: Cleaning up hooks...');
        
        // Unregister hooks via HookManager
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
        console.log('Scene Navigation: *** renderSceneDirectory CALLBACK FIRED ***', {app, html, htmlType: html?.constructor?.name});
        NavigationManager._attachSceneClickListeners(html);
        
        // Also check if scene directory is already rendered and attach listeners
        setTimeout(() => {
            const sceneDirectory = ui.scenes;
            if (sceneDirectory && sceneDirectory.element) {
                console.log('Scene Navigation: Double-checking scene directory after render', sceneDirectory.element);
                NavigationManager._attachSceneClickListeners(sceneDirectory.element);
            }
        }, 100);
    }

    /**
     * Hook callback for renderSceneNavigation
     * @private
     */
    static _onRenderSceneNavigation(app, html) {
        console.log('Scene Navigation: *** renderSceneNavigation CALLBACK FIRED ***', {app, html, htmlType: html?.constructor?.name});
        NavigationManager._attachSceneClickListeners(html);
    }

    /**
     * Attach click listeners to scene elements
     * @private
     */
    static _attachSceneClickListeners(html) {
        console.log('Scene Navigation: Attaching click listeners to:', html);
        
        // Try different selectors
        const selectors = [
            '.directory-item .scene-name',
            '.directory-item a',
            '.directory-item .scene',
            '.scene-name'
        ];
        
        for (const selector of selectors) {
            const elements = html.find(selector);
            console.log(`Scene Navigation: Found ${elements.length} elements for selector "${selector}"`);
            
            if (elements.length > 0) {
                elements.off('click.blacksmith').on('click.blacksmith', NavigationManager._onSceneClickNative);
                console.log(`Scene Navigation: Attached listeners to ${elements.length} elements using selector "${selector}"`);
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

        game.scenes.forEach(scene => {
            const sceneElement = $(`.directory-list .scene[data-entry-id=${scene.id}]`);
            const sceneNameElement = $(sceneElement).find("a");
            const strIconActive = "<i class='fa-solid fa-bow-arrow'></i> ";
            const strIconViewing = "<i class='fa-solid fa-eye'></i> ";
            
            $(sceneNameElement).find('.fa-solid').remove();
            if (scene.id === game.scenes.active?.id) {
                $(sceneNameElement).prepend(strIconActive);
            } else if (scene.id === game.scenes.current?.id) {
                $(sceneNameElement).prepend(strIconViewing);
            }
        });
    }
}

