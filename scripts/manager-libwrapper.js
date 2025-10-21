import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Manages all libWrapper integrations for the Blacksmith module
 * This centralizes our core Foundry VTT modifications and provides a clean API for other Coffee Pub modules
 */
export class WrapperManager {
    static _singleClickTimeouts = new Map();
    
    static initialize() {

        
        // Check if libWrapper is available
        if(typeof libWrapper === 'undefined') {
            console.error('Coffee Pub Blacksmith | libWrapper module not found! Please make sure you have it installed.');
            ui.notifications.error("Coffee Pub Blacksmith requires the 'libWrapper' module. Please install and enable it.");
            return;
        }

        // Verify libWrapper module is active
        const libWrapperModule = game.modules.get('lib-wrapper');
        if (!libWrapperModule?.active) {

            Hooks.once('libWrapper.Ready', () => {

                this._registerWrappers();
            });
        } else {

            this._registerWrappers();
        }
    }

    static _registerWrappers() {
        try {
    
            
            // Verify libWrapper is still available
            if(typeof libWrapper === 'undefined') {
                throw new Error('libWrapper became unavailable during registration');
            }

            const wrapperRegistrations = [
                {
                    target: 'ChatMessage.create',
                    callback: this._onChatMessageCreate,
                    type: 'WRAPPER'
                },
                {
                    target: 'Combat.prototype.nextTurn',
                    callback: this._onNextTurn,
                    type: 'WRAPPER'
                },
                {
                    target: 'Combat.prototype.nextRound',
                    callback: this._onNextRound,
                    type: 'WRAPPER'
                },
                {
                    target: 'Token.prototype.draw',
                    callback: this._onTokenDraw,
                    type: 'WRAPPER'
                },
            ];

            // Register all wrappers and log their registration
            for (const reg of wrapperRegistrations) {
                try {
                    postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Attempting to register wrapper', {target: reg.target, type: reg.type}, true, false);
                    libWrapper.register(MODULE.ID, reg.target, reg.callback, reg.type);
                    postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Successfully registered wrapper', reg.target, true, false);
                } catch (wrapError) {
                    postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: ERROR registering wrapper', {target: reg.target, error: wrapError.message}, false, true);
                    console.error(`Coffee Pub Blacksmith | Error registering wrapper for ${reg.target}:`, wrapError);
                }
            }
            
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Total wrappers registered', wrapperRegistrations.length, true, false);

            // Register scene navigation using native hooks instead of libWrapper to avoid conflicts
            WrapperManager._registerSceneNavigationHooks();

        } catch (error) {
            console.error("Coffee Pub Blacksmith | Error registering wrappers:", error);
            ui.notifications.error("Coffee Pub Blacksmith | Failed to register some wrappers. See console for details.");
        }
    }

    /**
     * Register scene navigation using native Foundry hooks to avoid libWrapper conflicts
     * @private
     */
    static _registerSceneNavigationHooks() {
        console.log('Scene Navigation: Registering native hooks...');
        
        // Try multiple hook names for scene directory
        const sceneHooks = [
            'renderSceneDirectory',
            'renderSceneNavigation', 
            'renderDirectory',
            'renderApplication'
        ];
        
        for (const hookName of sceneHooks) {
            Hooks.on(hookName, (app, html) => {
                console.log(`Scene Navigation: ${hookName} hook fired`, app, html);
                // Check if this is the scene directory
                if (app && (app.constructor.name === 'SceneDirectory' || app.constructor.name === 'SceneNavigation')) {
                    console.log('Scene Navigation: This is the scene directory!', app.constructor.name);
                    WrapperManager._attachSceneClickListeners(html);
                }
            });
        }
        
        // Also try the ready hook as a fallback
        Hooks.once('ready', () => {
            console.log('Scene Navigation: Ready hook fired, checking for scene directory...');
            const sceneDirectory = ui.scenes;
            if (sceneDirectory && sceneDirectory.element) {
                console.log('Scene Navigation: Found scene directory element', sceneDirectory.element);
                WrapperManager._attachSceneClickListeners(sceneDirectory.element);
            } else {
                console.log('Scene Navigation: No scene directory found in ui.scenes');
            }
        });
        
        // Check immediately if scene directory is already rendered
        setTimeout(() => {
            console.log('Scene Navigation: Checking for scene directory after timeout...');
            const sceneDirectory = ui.scenes;
            if (sceneDirectory && sceneDirectory.element) {
                console.log('Scene Navigation: Found scene directory element after timeout', sceneDirectory.element);
                WrapperManager._attachSceneClickListeners(sceneDirectory.element);
            } else {
                console.log('Scene Navigation: No scene directory found after timeout');
            }
        }, 1000);
        
        postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Native hooks registered', '', true, false);
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
                elements.off('click.blacksmith').on('click.blacksmith', WrapperManager._onSceneClickNative);
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
                if (WrapperManager._singleClickTimeouts && WrapperManager._singleClickTimeouts.has(entryId)) {
                    clearTimeout(WrapperManager._singleClickTimeouts.get(entryId));
                    WrapperManager._singleClickTimeouts.delete(entryId);
                    postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Cleared pending single-click timeout', scene.name, true, false);
                }
                await scene.activate();
                WrapperManager._updateSceneIcons();
                return;
            }

            // Handle single-click for viewing with a delay
            if (event.type === "click" && event.detail === 1) {
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Single-click detected, scheduling view in 250ms', scene.name, true, false);
                
                // Clear any existing timeout for this scene
                if (WrapperManager._singleClickTimeouts && WrapperManager._singleClickTimeouts.has(entryId)) {
                    clearTimeout(WrapperManager._singleClickTimeouts.get(entryId));
                }
                
                // Store the timeout ID
                if (!WrapperManager._singleClickTimeouts) {
                    WrapperManager._singleClickTimeouts = new Map();
                }
                
                const timeoutId = setTimeout(async () => {
                    // Only proceed if this wasn't followed by a double-click
                    if (event.detail === 1) {
                        await scene.view();
                        WrapperManager._updateSceneIcons();
                    }
                    // Clean up the timeout reference
                    if (WrapperManager._singleClickTimeouts) {
                        WrapperManager._singleClickTimeouts.delete(entryId);
                    }
                }, 250); // 250ms delay
                
                WrapperManager._singleClickTimeouts.set(entryId, timeoutId);
                return;
            }
            
        } catch (error) {
            console.error('Scene Navigation: ERROR in native handler', error);
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: ERROR in native handler', error.message, false, true);
        }
    }

    /**
     * Wrapper for ChatMessage.create
     * Allows other Coffee Pub modules to intercept and modify chat messages
     */
    static async _onChatMessageCreate(wrapped, messageData, context={}) {
        try {
            // Ensure messageData is an object
            messageData = messageData || {};
            
            // Pre-process message
            const hookResult = await Hooks.call('preCoffeePubChatMessage', messageData, context);
            
            // Only use hook result if it's an object, otherwise use original messageData
            const dataToUse = (hookResult && typeof hookResult === 'object') ? hookResult : messageData;
            
            // Call original with potentially modified data
            const result = await wrapped(dataToUse, context);
            
            // Post-process only if result exists
            if (result) {
                await Hooks.call('postCoffeePubChatMessage', result);
            }
            
            return result;
        } catch (error) {
            console.error("Coffee Pub Blacksmith | Error in chat message wrapper:", error);
            // On error, try to proceed with original message data
            return wrapped(messageData, context);
        }
    }

    /**
     * Wrapper for Combat.prototype.nextTurn
     * Allows other Coffee Pub modules to intercept and modify turn changes
     */
    static async _onNextTurn(wrapped, ...args) {
        try {
            // Pre-process turn change
            await Hooks.call('preCoffeePubNextTurn', this);
            
            // Call original
            const result = await wrapped(...args);
            
            // Post-process
            await Hooks.call('postCoffeePubNextTurn', this);
            
            return result;
        } catch (error) {
            console.error("Coffee Pub Blacksmith | Error in next turn wrapper:", error);
            return wrapped(...args);
        }
    }

    /**
     * Wrapper for Combat.prototype.nextRound
     * Allows other Coffee Pub modules to intercept and modify round changes
     */
    static async _onNextRound(wrapped, ...args) {
        try {
            // Pre-process round change
            await Hooks.call('preCoffeePubNextRound', this);
            
            // Call original
            const result = await wrapped(...args);
            
            // Post-process
            await Hooks.call('postCoffeePubNextRound', this);
            
            return result;
        } catch (error) {
            console.error("Coffee Pub Blacksmith | Error in next round wrapper:", error);
            return wrapped(...args);
        }
    }

    /**
     * Wrapper for Token.prototype.draw
     * Allows other Coffee Pub modules to modify token rendering
     */
    static async _onTokenDraw(wrapped, ...args) {
        try {
            // Pre-process token draw
            await Hooks.call('preCoffeePubTokenDraw', this);
            
            // Call original
            const result = await wrapped(...args);
            
            // Post-process
            await Hooks.call('postCoffeePubTokenDraw', this);
            
            return result;
        } catch (error) {
            console.error("Coffee Pub Blacksmith | Error in token draw wrapper:", error);
            return wrapped(...args);
        }
    }

    /**
     * Wrapper for SceneDirectory.prototype._onClickEntryName
     * Handles custom scene navigation click behaviors
     */
    static async _onSceneClick(wrapped, event) {
        try {
            console.log('Scene Navigation: *** WRAPPER CALLED ***', {
                type: event?.type,
                detail: event?.detail,
                shiftKey: event?.shiftKey
            });
            
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: *** WRAPPER CALLED ***', {
                type: event?.type,
                detail: event?.detail,
                shiftKey: event?.shiftKey
            }, true, false);
        
        if (!event) {
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: No event, calling wrapped', '', true, false);
            return wrapped(event);
        }

        // Only handle if custom clicks are enabled
        const blnCustomClicks = game.settings.get(MODULE.ID, 'enableSceneClickBehaviors');
        postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Custom clicks enabled', blnCustomClicks, true, false);

        if (!blnCustomClicks) {
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Custom clicks disabled, calling wrapped', '', true, false);
            return wrapped(event);
        }

        postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Preventing default and stopping propagation', '', true, false);
        event.preventDefault();
        event.stopPropagation();

        const directoryItem = event.currentTarget.closest(".directory-item");
        const entryId = directoryItem?.dataset.entryId;
        
        // Check if this is actually a scene (not other documents)
        const scene = game.scenes.get(entryId);
        if (!scene) {
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Not a scene, calling wrapped', {entryId}, true, false);
            return wrapped(event);
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
            if (WrapperManager._singleClickTimeouts && WrapperManager._singleClickTimeouts.has(entryId)) {
                clearTimeout(WrapperManager._singleClickTimeouts.get(entryId));
                WrapperManager._singleClickTimeouts.delete(entryId);
                postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Cleared pending single-click timeout', scene.name, true, false);
            }
            await scene.activate();
            WrapperManager._updateSceneIcons();
            return;
        }

        // Handle single-click for viewing with a delay
        if (event.type === "click" && event.detail === 1) {
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: Single-click detected, scheduling view in 250ms', scene.name, true, false);
            
            // Clear any existing timeout for this scene
            if (WrapperManager._singleClickTimeouts && WrapperManager._singleClickTimeouts.has(entryId)) {
                clearTimeout(WrapperManager._singleClickTimeouts.get(entryId));
            }
            
            // Store the timeout ID
            if (!WrapperManager._singleClickTimeouts) {
                WrapperManager._singleClickTimeouts = new Map();
            }
            
            const timeoutId = setTimeout(async () => {
                // Only proceed if this wasn't followed by a double-click
                if (event.detail === 1) {
                    await scene.view();
                    WrapperManager._updateSceneIcons();
                }
                // Clean up the timeout reference
                if (WrapperManager._singleClickTimeouts) {
                    WrapperManager._singleClickTimeouts.delete(entryId);
                }
            }, 250); // 250ms delay
            
            WrapperManager._singleClickTimeouts.set(entryId, timeoutId);
            return;
        }
        
        // If we didn't handle the event, call the original function
        postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: No matching condition, calling wrapped', '', true, false);
        return wrapped(event);
        
        } catch (error) {
            console.error('Scene Navigation: ERROR in wrapper', error);
            postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: ERROR in wrapper', error.message, false, true);
            // On error, call the original function
            return wrapped(event);
        }
    }

    /**
     * Helper method to update scene icons
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
