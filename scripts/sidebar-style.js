// ================================================================== 
// ===== SIDEBAR STYLE ==============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class SidebarStyle {
    static initialized = false;
    static styleClass = 'blacksmith-sidebar-styled';
    static manualRollButton = null;

    /**
     * Initialize the sidebar style functionality
     */
    static initialize() {
        if (this.initialized) {
            return;
        }

        // Check if ready has already fired
        if (game.ready) {
            // Ready has already fired, setup immediately
            this._applySidebarStyle();
            this._registerSettingChangeHook();
            // Only create manual roll button for GM if setting is enabled
            if (game.user.isGM) {
                if (getSettingSafely(MODULE.ID, 'sidebarManualRollsEnabled', true)) {
                    this._createManualRollButton();
                } else {
                    // Setting disabled - remove button if it exists
                    this._removeManualRollButton();
                }
            }
        } else {
            // Wait for Foundry to be ready
            Hooks.once('ready', () => {
                this._applySidebarStyle();
                this._registerSettingChangeHook();
                // Only create manual roll button for GM if setting is enabled
                if (game.user.isGM) {
                    if (getSettingSafely(MODULE.ID, 'sidebarManualRollsEnabled', true)) {
                        this._createManualRollButton();
                    } else {
                        // Setting disabled - remove button if it exists
                        this._removeManualRollButton();
                    }
                }
            });
        }

        this.initialized = true;
    }

    /**
     * Register hook for setting changes
     */
    static _registerSettingChangeHook() {
        // Register settingChange hook to handle external setting changes
        const settingChangeHookId = HookManager.registerHook({
            name: 'settingChange',
            description: 'Sidebar Style: Handle setting changes for sidebar style and manual rolls',
            context: 'sidebar-style-settings',
            priority: 3,
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'sidebarStyleUI') {
                    this._applySidebarStyle();
                }
                
                // Handle manual rolls enabled/disabled setting
                if (moduleId === MODULE.ID && settingKey === 'sidebarManualRollsEnabled') {
                    if (value && game.user.isGM) {
                        // Setting enabled - create button if it doesn't exist
                        if (!this.manualRollButton || !document.querySelector('.blacksmith-manual-rolls')) {
                            this._createManualRollButton();
                        }
                    } else {
                        // Setting disabled - remove button
                        this._removeManualRollButton();
                    }
                }
                
                // Update manual roll button when core dice configuration changes (GM only)
                if (game.user.isGM && moduleId === 'core' && settingKey === 'diceConfiguration') {
                    if (this.manualRollButton) {
                        this._updateManualRollButtonState(this.manualRollButton);
                    }
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    /**
     * Remove the manual roll button if it exists
     */
    static _removeManualRollButton() {
        if (this.manualRollButton) {
            const buttonLi = this.manualRollButton.closest('li');
            if (buttonLi) {
                buttonLi.remove();
            }
            this.manualRollButton = null;
        } else {
            // Also check if button exists in DOM but not in our reference
            const existingButton = document.querySelector('.blacksmith-manual-rolls');
            if (existingButton) {
                const buttonLi = existingButton.closest('li');
                if (buttonLi) {
                    buttonLi.remove();
                }
            }
        }
    }

    /**
     * Create the manual roll button in sidebar tabs (below pin button)
     * Only visible for GMs
     */
    static _createManualRollButton() {
        // Only show for GM
        if (!game.user.isGM) {
            return;
        }

        // Check if button already exists
        if (document.querySelector('.blacksmith-manual-rolls')) {
            this.manualRollButton = document.querySelector('.blacksmith-manual-rolls');
            this._updateManualRollButtonState(this.manualRollButton);
            return;
        }

        // Find the pin button (if it exists) or chat button
        const pinButton = document.querySelector('.blacksmith-sidebar-pin');
        const chatButton = document.querySelector('button[data-action="tab"][data-tab="chat"]');
        
        let referenceElement = null;
        if (pinButton) {
            // Pin button exists, add below it
            referenceElement = pinButton.closest('li');
        } else if (chatButton) {
            // No pin button, use chat button as reference
            referenceElement = chatButton.closest('li');
        } else {
            postConsoleAndNotification(MODULE.NAME, 'Manual Roll Button: Could not find pin or chat button', '', true, false);
            // Try again after a delay
            setTimeout(() => {
                this._createManualRollButton();
            }, 500);
            return;
        }

        if (!referenceElement) {
            postConsoleAndNotification(MODULE.NAME, 'Manual Roll Button: Could not find reference element parent', '', true, false);
            setTimeout(() => {
                this._createManualRollButton();
            }, 500);
            return;
        }

        // Create new list item for manual roll button
        const manualRollButtonLi = document.createElement('li');
        
        // Create the manual roll button
        const manualRollButton = document.createElement('button');
        manualRollButton.type = 'button';
        manualRollButton.className = 'blacksmith-manual-rolls ui-control plain icon';
        manualRollButton.setAttribute('data-tooltip', '');
        manualRollButton.setAttribute('aria-label', 'Toggle Manual Rolls');
        manualRollButton.setAttribute('data-action', 'toggleManualRolls');
        
        // Update button state based on current setting
        this._updateManualRollButtonState(manualRollButton);
        
        // Add click handler
        manualRollButton.addEventListener('click', async (event) => {
            event.preventDefault();
            await this._toggleManualRolls(manualRollButton);
        });

        // Append button to list item
        manualRollButtonLi.appendChild(manualRollButton);
        
        // Insert after the reference element (below pin button or chat button)
        if (pinButton) {
            referenceElement.insertAdjacentElement('afterend', manualRollButtonLi);
        } else {
            referenceElement.insertAdjacentElement('afterend', manualRollButtonLi);
        }
        
        this.manualRollButton = manualRollButton;
    }

    /**
     * Toggle all dice between manual and digital modes
     * @returns {Promise<boolean>} True if manual mode is now enabled
     */
    static async _toggleManualAllDice() {
        const NAMESPACE = 'core';
        const KEY = 'diceConfiguration';

        const cfg = foundry.utils.duplicate(game.settings.get(NAMESPACE, KEY));

        // Consider "on" if every die is manual
        const isManual = Object.values(cfg).every(v => v === 'manual');
        const next = isManual ? '' : 'manual';

        for (const die of Object.keys(cfg)) {
            cfg[die] = next;
        }

        await game.settings.set(NAMESPACE, KEY, cfg);

        return next === 'manual'; // handy for updating aria-pressed
    }

    /**
     * Check if manual rolls are currently enabled
     * @returns {boolean} True if all dice are set to manual
     */
    static _isManualRollsEnabled() {
        try {
            const cfg = game.settings.get('core', 'diceConfiguration');
            return Object.values(cfg || {}).every(v => v === 'manual');
        } catch (error) {
            return false;
        }
    }

    /**
     * Update manual roll button state based on current dice configuration
     */
    static _updateManualRollButtonState(button) {
        const isManualRollsEnabled = this._isManualRollsEnabled();
        
        // Clear existing icon classes
        button.classList.remove('fa-solid', 'fa-regular', 'fa-dice-d20', 'fa-hand-pointer');
        
        // Clear button content
        button.innerHTML = '';
        
        // Create icon element
        const icon = document.createElement('i');
        if (isManualRollsEnabled) {
            icon.className = 'fa-solid fa-dice-d20';
            button.setAttribute('aria-pressed', 'true');
            button.setAttribute('data-tooltip', 'Manual Rolls: Enabled (Click to disable)');
            button.setAttribute('aria-label', 'Manual Rolls: Enabled');
            button.classList.add('active');
        } else {
            icon.className = 'fa-solid fa-dice-d20';
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('data-tooltip', 'Manual Rolls: Disabled (Click to enable)');
            button.setAttribute('aria-label', 'Manual Rolls: Disabled');
            button.classList.remove('active');
        }
        
        button.appendChild(icon);
    }

    /**
     * Toggle manual rolls setting
     * Only available for GMs
     */
    static async _toggleManualRolls(button) {
        // Only GMs can toggle manual rolls
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'Manual rolls toggle is only available for GMs', '', false, true);
            return;
        }

        const enabled = await this._toggleManualAllDice();
        this._updateManualRollButtonState(button);
        
        postConsoleAndNotification(MODULE.NAME, `Manual rolls ${enabled ? 'enabled' : 'disabled'}`, '', true, false);
    }

    /**
     * Apply or remove sidebar styles based on setting
     */
    static _applySidebarStyle() {
        const isEnabled = getSettingSafely(MODULE.ID, 'sidebarStyleUI', false);
        const sidebar = document.getElementById('sidebar');
        const sidebarTabs = document.getElementById('sidebar-tabs');
        const chatControls = document.getElementById('chat-controls');
        const rollPrivacy = document.getElementById('roll-privacy');
        
        if (!sidebar) {
            // Sidebar not found yet, try again after a delay
            setTimeout(() => {
                this._applySidebarStyle();
            }, 500);
            return;
        }

        if (isEnabled) {
            sidebar.classList.add(this.styleClass);
            if (sidebarTabs) {
                sidebarTabs.classList.add(this.styleClass);
            }
            if (chatControls) {
                chatControls.classList.add(this.styleClass);
            }
            if (rollPrivacy && rollPrivacy.classList.contains('vertical')) {
                rollPrivacy.classList.add(this.styleClass);
            }
        } else {
            sidebar.classList.remove(this.styleClass);
            if (sidebarTabs) {
                sidebarTabs.classList.remove(this.styleClass);
            }
            if (chatControls) {
                chatControls.classList.remove(this.styleClass);
            }
            if (rollPrivacy) {
                rollPrivacy.classList.remove(this.styleClass);
            }
        }
    }
}

