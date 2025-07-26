import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

/**
 * Manages all libWrapper integrations for the Blacksmith module
 * This centralizes our core Foundry VTT modifications and provides a clean API for other Coffee Pub modules
 */
export class WrapperManager {
    static initialize() {
        postConsoleAndNotification("Coffee Pub Blacksmith | WrapperManager initializing", "", false, true, false);
        
        // Check if libWrapper is available
        if(typeof libWrapper === 'undefined') {
            postConsoleAndNotification('Coffee Pub Blacksmith | libWrapper module not found! Please make sure you have it installed.', "", false, false, true);
            ui.notifications.error("Coffee Pub Blacksmith requires the 'libWrapper' module. Please install and enable it.");
            return;
        }

        // Verify libWrapper module is active
        const libWrapperModule = game.modules.get('lib-wrapper');
        if (!libWrapperModule?.active) {
            postConsoleAndNotification("Coffee Pub Blacksmith | Waiting for libWrapper to be ready", "", false, true, false);
            Hooks.once('libWrapper.Ready', () => {
                postConsoleAndNotification("Coffee Pub Blacksmith | libWrapper Ready, registering wrappers", "", false, true, false);
                this._registerWrappers();
            });
        } else {
            postConsoleAndNotification("Coffee Pub Blacksmith | libWrapper already active, registering wrappers", "", false, true, false);
            this._registerWrappers();
        }
    }

    static _registerWrappers() {
        try {
            postConsoleAndNotification("Coffee Pub Blacksmith | Starting wrapper registration", "", false, true, false);
            
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
                {
                    target: 'SceneDirectory.prototype._onClickEntryName',
                    callback: async function(event) {
                        postConsoleAndNotification("Coffee Pub Blacksmith | Scene Click Handler Called", "", false, true, false);
                        if (!event) {
                            postConsoleAndNotification("Coffee Pub Blacksmith | No event received", "", false, true, false);
                            return;
                        }

                        // Only handle if custom clicks are enabled
                        const blnCustomClicks = game.settings.get(MODULE_ID, 'enableSceneClickBehaviors');
                        postConsoleAndNotification("Coffee Pub Blacksmith | Custom clicks enabled", blnCustomClicks, false, true, false);
                        
                        if (!blnCustomClicks) {
                            postConsoleAndNotification("Coffee Pub Blacksmith | Using default behavior", "", false, true, false);
                            return this._original(event);
                        }

                        event.preventDefault();
                        event.stopPropagation();

                        const sceneId = event.currentTarget.closest(".directory-item").dataset.entryId;
                        const scene = game.scenes.get(sceneId);
                        
                        // Handle shift-click for configuration
                        if (event.shiftKey) {
                            postConsoleAndNotification("Coffee Pub Blacksmith | Shift-click detected: Opening config", "", false, true, false);
                            scene.sheet.render(true);
                            return;
                        }

                        // Handle double-click for activation
                        if (event.type === "click" && event.detail === 2) {
                            postConsoleAndNotification("Coffee Pub Blacksmith | Double-click detected: Activating scene", "", false, true, false);
                            await scene.activate();
                            WrapperManager._updateSceneIcons();
                            return;
                        }

                        // Handle single-click for viewing with a delay
                        if (event.type === "click" && event.detail === 1) {
                            // Store the clicked scene for the timeout
                            const clickedScene = scene;
                            
                            // Wait briefly to see if this becomes a double-click
                            setTimeout(async () => {
                                // Only proceed if this wasn't followed by a double-click
                                if (event.detail === 1) {
                                    postConsoleAndNotification("Coffee Pub Blacksmith | Single-click detected: Viewing scene", "", false, true, false);
                                    await clickedScene.view();
                                    WrapperManager._updateSceneIcons();
                                }
                            }, 250); // 250ms delay
                            return;
                        }
                    },
                    type: 'OVERRIDE'
                }
            ];

            // Register all wrappers and log their registration
            for (const reg of wrapperRegistrations) {
                try {
                    postConsoleAndNotification(`Coffee Pub Blacksmith | Registering wrapper for ${reg.target}`, "", false, true, false);
                    libWrapper.register(MODULE_ID, reg.target, reg.callback, reg.type);
                    postConsoleAndNotification(`Coffee Pub Blacksmith | Successfully registered wrapper for ${reg.target}`, "", false, true, false);
                } catch (wrapError) {
                    postConsoleAndNotification(`Coffee Pub Blacksmith | Error registering wrapper for ${reg.target}:`, wrapError, false, false, true);
                    ui.notifications.error(`Coffee Pub Blacksmith | Failed to register wrapper for ${reg.target}`);
                }
            }

            postConsoleAndNotification("Coffee Pub Blacksmith | All wrappers registered successfully", "", false, true, false);
        } catch (error) {
            postConsoleAndNotification("Coffee Pub Blacksmith | Error registering wrappers:", error, false, false, true);
            ui.notifications.error("Coffee Pub Blacksmith | Failed to register some wrappers. See console for details.");
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
            postConsoleAndNotification("Coffee Pub Blacksmith | Error in chat message wrapper:", error, false, false, true);
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
            postConsoleAndNotification("Coffee Pub Blacksmith | Error in next turn wrapper:", error, false, false, true);
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
            postConsoleAndNotification("Coffee Pub Blacksmith | Error in next round wrapper:", error, false, false, true);
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
            postConsoleAndNotification("Coffee Pub Blacksmith | Error in token draw wrapper:", error, false, false, true);
            return wrapped(...args);
        }
    }

    /**
     * Helper method to update scene icons
     * @private
     */
    static _updateSceneIcons() {
        const blnShowIcons = game.settings.get(MODULE_ID, 'enableSceneInteractions');
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