import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { QuickViewUtility } from './utility-quickview.js';

/**
 * Manages all libWrapper integrations for the Blacksmith module
 * This centralizes our core Foundry VTT modifications and provides a clean API for other Coffee Pub modules
 */
export class WrapperManager {
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
                    target: 'foundry.canvas.placeables.Token.prototype.draw',
                    callback: this._onTokenDraw,
                    type: 'WRAPPER'
                },
                {
                    target: 'foundry.canvas.groups.CanvasVisibility.prototype.restrictVisibility',
                    callback: this._onRestrictVisibility,
                    type: 'WRAPPER'
                }
            ];

            // Register all wrappers and log their registration
            for (const reg of wrapperRegistrations) {
                try {
                    libWrapper.register(MODULE.ID, reg.target, reg.callback, reg.type);
                } catch (wrapError) {
                    postConsoleAndNotification(MODULE.NAME, 'Scene Navigation: ERROR registering wrapper', {target: reg.target, error: wrapError.message}, false, false);
                }
            }
            
            postConsoleAndNotification(MODULE.NAME, 'libWrapper: Total wrappers registered', wrapperRegistrations.length, true, false);

        } catch (error) {
            console.error("Coffee Pub Blacksmith | Error registering wrappers:", error);
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

            const content = typeof messageData.content === 'string' ? messageData.content : '';
            const isCoffeePubCard = content.includes('blacksmith-card')
                || content.includes('cpb-chat-card')
                || content.includes('vote-card')
                || content.includes('coffeepub-hide-header');
            if (isCoffeePubCard) {
                messageData.flags ??= {};
                messageData.flags[MODULE.ID] ??= {};
                messageData.flags[MODULE.ID].isCoffeePubCard = true;
                messageData.flags[MODULE.ID].removeChatCardPadding = game.settings.get(MODULE.ID, 'removeChatCardPadding');
            }
            
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
     * After core token visibility restriction, Quick View forces GM-facing visibility and
     * reapplies hatch overlays only where tokens are still sight-hidden or sheet-hidden.
     */
    static _onRestrictVisibility(wrapped, ...args) {
        const result = wrapped(...args);
        const finish = () => {
            try {
                QuickViewUtility._syncQuickViewHatchAfterRestrict();
            } catch (error) {
                console.error('Coffee Pub Blacksmith | restrictVisibility wrapper:', error);
            }
        };
        try {
            if (result instanceof Promise) void result.then(finish).catch(() => {});
            else finish();
        } catch (error) {
            console.error('Coffee Pub Blacksmith | restrictVisibility wrapper:', error);
        }
        return result;
    }
}
