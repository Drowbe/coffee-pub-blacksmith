// ================================================================== 
// ===== SIDEBAR PIN ================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, setSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class SidebarPin {
    static initialized = false;
    static pinButton = null;
    static collapseButton = null;
    static sidebarContent = null;
    static observer = null;

    /**
     * Initialize the sidebar pin functionality
     */
    static initialize() {
        if (this.initialized) {
            return;
        }

        // Check if ready has already fired
        if (game.ready) {
            // Ready has already fired, setup immediately
            this._setupSidebarPin();
            this._registerSettingChangeHook();
        } else {
            // Wait for Foundry to be ready
            Hooks.once('ready', () => {
                this._setupSidebarPin();
                this._registerSettingChangeHook();
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
            description: 'Sidebar Pin: Handle setting changes for sidebar pin',
            context: 'sidebar-pin-settings',
            priority: 3,
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'sidebarPinUI') {
                    this._updatePinUI(value);
                    this._updateSidebarExpanded(value);
                    this._updateCollapseButtonState();
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    /**
     * Setup the sidebar pin button and handlers
     */
    static _setupSidebarPin() {
        postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: Setting up sidebar pin", "", true, false);
        
        // Try to find elements immediately
        this._findAndSetupElements();

        // If elements not found, use MutationObserver to wait for them
        if (!this.collapseButton || !this.sidebarContent) {
            postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: Elements not found, setting up observer", "", true, false);
            
            this.observer = new MutationObserver(() => {
                if (this._findAndSetupElements()) {
                    // Elements found, disconnect observer
                    postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: Elements found via observer", "", true, false);
                    if (this.observer) {
                        this.observer.disconnect();
                        this.observer = null;
                    }
                }
            });

            // Start observing the document body for changes
            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Also try after a short delay
            setTimeout(() => {
                this._findAndSetupElements();
                if (this.observer) {
                    this.observer.disconnect();
                    this.observer = null;
                }
            }, 1000);
        } else {
            postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: Elements found immediately", "", true, false);
        }
    }

    /**
     * Find sidebar elements and setup pin button
     * @returns {boolean} True if all elements were found
     */
    static _findAndSetupElements() {
        // Find the sidebar content div
        this.sidebarContent = document.getElementById('sidebar-content');
        
        // Try multiple selectors for the collapse button
        // FoundryVTT might use different structures
        let collapseButtonLi = document.querySelector('li button[data-action="toggleState"].collapse');
        
        // If not found, try alternative selectors
        if (!collapseButtonLi) {
            collapseButtonLi = document.querySelector('button.collapse[data-action="toggleState"]');
        }
        if (!collapseButtonLi) {
            collapseButtonLi = document.querySelector('button[data-action="toggleState"]');
        }
        if (!collapseButtonLi) {
            // Try finding by tooltip text
            const allButtons = document.querySelectorAll('button[data-tooltip]');
            for (const btn of allButtons) {
                const tooltip = btn.getAttribute('data-tooltip');
                if (tooltip && (tooltip.toLowerCase().includes('collapse') || tooltip.toLowerCase().includes('toggle'))) {
                    collapseButtonLi = btn;
                    break;
                }
            }
        }
        
        if (collapseButtonLi) {
            this.collapseButton = collapseButtonLi;
        }

        // Debug logging
        if (!this.sidebarContent) {
            postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: sidebar-content not found", "", true, false);
        }
        if (!this.collapseButton) {
            postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: collapse button not found", "", true, false);
        }

        // If we have both elements, setup the pin button
        if (this.sidebarContent && this.collapseButton) {
            this._createPinButton();
            this._setupEventHandlers();
            this._applyInitialState();
            this._updateCollapseButtonState();
            return true;
        }

        return false;
    }

    /**
     * Create the pin button element
     */
    static _createPinButton() {
        // Check if pin button already exists
        if (document.querySelector('.blacksmith-sidebar-pin')) {
            this.pinButton = document.querySelector('.blacksmith-sidebar-pin');
            return;
        }

        // Find the parent list item of the collapse button
        const collapseButtonParent = this.collapseButton.closest('li');
        if (!collapseButtonParent) {
            postConsoleAndNotification(MODULE.NAME, "Sidebar Pin: Could not find collapse button parent", "", false, false);
            return;
        }

        // Create new list item for pin button
        const pinButtonLi = document.createElement('li');
        
        // Create the pin button
        const pinButton = document.createElement('button');
        pinButton.type = 'button';
        pinButton.className = 'blacksmith-sidebar-pin ui-control plain icon';
        pinButton.setAttribute('data-tooltip', 'Pin Sidebar Open');
        pinButton.setAttribute('aria-label', 'Pin Sidebar Open');
        pinButton.setAttribute('data-action', 'togglePin');
        
        // Create the icon
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-thumbtack';
        pinButton.appendChild(icon);
        
        // Append button to list item
        pinButtonLi.appendChild(pinButton);
        
        // Insert after the collapse button's parent
        collapseButtonParent.insertAdjacentElement('afterend', pinButtonLi);
        
        this.pinButton = pinButton;
    }

    /**
     * Setup event handlers for pin and collapse buttons
     */
    static _setupEventHandlers() {
        if (!this.pinButton) {
            return;
        }

        // Handle pin button click
        this.pinButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._togglePin();
        });

        // Intercept collapse button click
        if (this.collapseButton) {
            this.collapseButton.addEventListener('click', (event) => {
                const isPinned = getSettingSafely(MODULE.ID, 'sidebarPinUI', false);
                
                if (isPinned) {
                    // Pin is enabled - honor the collapse, unpin, and show notification
                    // Remove expanded class to allow collapse (in capture phase, before Foundry's handler)
                    if (this.sidebarContent) {
                        this.sidebarContent.classList.remove('expanded');
                    }
                    
                    // Unpin (async, but don't wait)
                    this._setPinState(false);
                    
                    // Show notification
                    ui.notifications.info(game.i18n.format('coffee-pub-blacksmith.sidebarPinUI-Unpinned'));
                    
                    // Don't prevent default - let Foundry's collapse handler run normally
                }
                
                // Update collapse button state after a short delay to allow Foundry's handler to run
                setTimeout(() => {
                    this._updateCollapseButtonState();
                }, 50);
            }, true); // Use capture phase to run before Foundry's handler
        }

        // Watch for sidebar state changes to update collapse button
        if (this.sidebarContent) {
            const sidebarObserver = new MutationObserver(() => {
                this._updateCollapseButtonState();
            });
            
            sidebarObserver.observe(this.sidebarContent, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    /**
     * Toggle the pin state
     */
    static _togglePin() {
        const currentState = getSettingSafely(MODULE.ID, 'sidebarPinUI', false);
        this._setPinState(!currentState);
    }

    /**
     * Set the pin state
     * @param {boolean} isPinned - Whether the sidebar should be pinned
     */
    static async _setPinState(isPinned) {
        await setSettingSafely(MODULE.ID, 'sidebarPinUI', isPinned);
        this._updatePinUI(isPinned);
        this._updateSidebarExpanded(isPinned);
        this._updateCollapseButtonState();
    }

    /**
     * Update the pin button UI to reflect current state
     * @param {boolean} isPinned - Whether the sidebar is pinned
     */
    static _updatePinUI(isPinned) {
        if (!this.pinButton) {
            return;
        }

        if (isPinned) {
            this.pinButton.classList.add('pinned');
            this.pinButton.setAttribute('data-tooltip', 'Unpin Sidebar');
            this.pinButton.setAttribute('aria-label', 'Unpin Sidebar');
        } else {
            this.pinButton.classList.remove('pinned');
            this.pinButton.setAttribute('data-tooltip', 'Pin Sidebar Open');
            this.pinButton.setAttribute('aria-label', 'Pin Sidebar Open');
        }
    }

    /**
     * Update the sidebar expanded class based on pin state
     * @param {boolean} isPinned - Whether the sidebar should be expanded
     */
    static _updateSidebarExpanded(isPinned) {
        if (!this.sidebarContent) {
            return;
        }

        if (isPinned) {
            this.sidebarContent.classList.add('expanded');
        } else {
            // Only remove if not already expanded by other means
            // We don't want to interfere with normal sidebar behavior when unpinned
            // The expanded class will be managed by Foundry's normal collapse/expand
        }
    }

    /**
     * Update the collapse button icon and tooltip based on sidebar state
     */
    static _updateCollapseButtonState() {
        if (!this.collapseButton || !this.sidebarContent) {
            return;
        }

        // Check if sidebar is expanded (has expanded class or is visible)
        const isExpanded = this.sidebarContent.classList.contains('expanded') || 
                          !this.sidebarContent.classList.contains('collapsed');

        // Get the icon element
        const icon = this.collapseButton.querySelector('i');
        if (!icon) {
            return;
        }

        if (isExpanded) {
            // Sidebar is expanded - show collapse icon (caret-right)
            icon.classList.remove('fa-caret-left');
            icon.classList.add('fa-caret-right');
            this.collapseButton.setAttribute('data-tooltip', 'Collapse');
            this.collapseButton.setAttribute('aria-label', 'Collapse');
        } else {
            // Sidebar is collapsed - show expand icon (caret-left)
            icon.classList.remove('fa-caret-right');
            icon.classList.add('fa-caret-left');
            this.collapseButton.setAttribute('data-tooltip', 'Expand');
            this.collapseButton.setAttribute('aria-label', 'Expand');
        }
    }

    /**
     * Apply initial state on load
     */
    static _applyInitialState() {
        const isPinned = getSettingSafely(MODULE.ID, 'sidebarPinUI', false);
        if (isPinned) {
            this._updatePinUI(true);
            this._updateSidebarExpanded(true);
            this._updateCollapseButtonState();
        }
    }
}

