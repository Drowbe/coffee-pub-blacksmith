import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

/**
 * Manages scene navigation behavior for the Blacksmith module
 * Handles custom click behaviors for scene directory and navigation bar
 */
export class NavigationManager {
    static _singleClickTimeouts = new Map();
    static _renderTimeouts = []; // Track setTimeout IDs from render hooks

    /**
     * Initialize scene navigation hooks
     */
    static initialize() {
        
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
        
    }

    /**
     * Initialize scene navigation after module loading is complete
     * @private
     */
    static _onReady() {
        // Update scene icons on initial load
        NavigationManager._updateSceneIcons();
        
        // Try to attach listeners if elements exist (v13: pass native DOM element, not jQuery)
        const sceneDirectory = document.querySelector('#scenes');
        if (sceneDirectory) {
            NavigationManager._attachSceneClickListeners(sceneDirectory);
        }
        
        const sceneNavigation = document.querySelector('#navigation');
        if (sceneNavigation) {
            NavigationManager._attachSceneClickListeners(sceneNavigation);
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
        
        // Unregister hooks via HookManager
        HookManager.unregisterHook({
            name: 'ready',
            callbackId: 'scene-navigation-ready-debug'
        });
        HookManager.unregisterHook({
            name: 'renderSceneDirectory',
            callbackId: 'scene-navigation-directory'
        });
        HookManager.unregisterHook({
            name: 'renderSceneNavigation',
            callbackId: 'scene-navigation-bar'
        });
        
        // Clear any pending single-click timeouts
        if (NavigationManager._singleClickTimeouts) {
            NavigationManager._singleClickTimeouts.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            NavigationManager._singleClickTimeouts.clear();
        }
        
        // Clear any pending render timeouts
        if (NavigationManager._renderTimeouts) {
            NavigationManager._renderTimeouts.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            NavigationManager._renderTimeouts = [];
        }
        
    }

    /**
     * Hook callback for renderSceneDirectory
     * @private
     */
    static _onRenderSceneDirectory(app, html) {
        NavigationManager._attachSceneClickListeners(html);
        // Update icons after render (Foundry wipes them out on re-render)
        const timeoutId = setTimeout(() => {
            NavigationManager._updateSceneIcons();
            // Remove from tracking array after execution
            const index = NavigationManager._renderTimeouts.indexOf(timeoutId);
            if (index > -1) NavigationManager._renderTimeouts.splice(index, 1);
        }, 10);
        NavigationManager._renderTimeouts.push(timeoutId);
    }

    /**
     * Hook callback for renderSceneNavigation
     * @private
     */
    static _onRenderSceneNavigation(app, html) {
        NavigationManager._attachSceneClickListeners(html);
        // Update icons after render (Foundry wipes them out on re-render)
        const timeoutId = setTimeout(() => {
            NavigationManager._updateSceneIcons();
            // Remove from tracking array after execution
            const index = NavigationManager._renderTimeouts.indexOf(timeoutId);
            if (index > -1) NavigationManager._renderTimeouts.splice(index, 1);
        }, 10);
        NavigationManager._renderTimeouts.push(timeoutId);
    }

    /**
     * Attach click listeners to scene elements
     * @private
     */
    static _attachSceneClickListeners(html) {
        // Try different selectors to find scene elements (v13: html is native DOM element)
        const selectors = [
            '.directory-item .scene-name',
            '.directory-item a',
            '.directory-item .scene',
            '.scene-name'
        ];
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        for (const selector of selectors) {
            const elements = nativeHtml.querySelectorAll(selector);
            if (elements.length > 0) {
                // v13: Remove existing listeners and add new ones (native DOM)
                elements.forEach(element => {
                    // Remove existing listener if it exists (check for data attribute)
                    const existingListener = element._blacksmithClickListener;
                    if (existingListener) {
                        element.removeEventListener('click', existingListener);
                    }
                    // Add new listener
                    element.addEventListener('click', NavigationManager._onSceneClickNative);
                    // Store reference for cleanup
                    element._blacksmithClickListener = NavigationManager._onSceneClickNative;
                });
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
            
            
            if (!event) return;

            // Only handle if custom clicks are enabled
            const blnCustomClicks = game.settings.get(MODULE.ID, 'enableSceneClickBehaviors');

            if (!blnCustomClicks) {
                return; // Allow default behavior
            }

            event.preventDefault();
            event.stopPropagation();

            const directoryItem = event.currentTarget.closest(".directory-item");
            const entryId = directoryItem?.dataset.entryId;
            
            // Check if this is actually a scene (not other documents)
            const scene = game.scenes.get(entryId);
            if (!scene) {
                return; // Allow default behavior
            }
                       
            // Handle shift-click for configuration
            if (event.shiftKey) {
                scene.sheet.render(true);
                return;
            }

            // Handle double-click for activation
            if (event.type === "click" && event.detail === 2) {
                // Clear any pending single-click timeout for this scene
                if (NavigationManager._singleClickTimeouts && NavigationManager._singleClickTimeouts.has(entryId)) {
                    clearTimeout(NavigationManager._singleClickTimeouts.get(entryId));
                    NavigationManager._singleClickTimeouts.delete(entryId);
                }
                await scene.activate();
                NavigationManager._updateSceneIcons();
                return;
            }

            // Handle single-click for viewing with a delay
            if (event.type === "click" && event.detail === 1) {
                
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
            // v13: Use native DOM instead of jQuery
            const sceneElement = document.querySelector(`.directory-list .scene[data-entry-id="${scene.id}"]`);
            if (!sceneElement) return;
            
            const sceneNameElement = sceneElement.querySelector("a");
            if (!sceneNameElement) return;
            
            // Remove all existing icons
            const existingIcons = sceneNameElement.querySelectorAll('.fa-solid');
            existingIcons.forEach(icon => icon.remove());
            
            // Add appropriate icon
            if (scene.id === activeSceneId) {
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-bow-arrow tabs-scenes-icon icon-active';
                sceneNameElement.insertBefore(icon, sceneNameElement.firstChild);
            } else if (scene.id === viewingSceneId) {
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-eye tabs-scenes-icon icon-viewing';
                sceneNameElement.insertBefore(icon, sceneNameElement.firstChild);
            }
        });
    }
}

