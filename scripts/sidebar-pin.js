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
    static _bypassCollapseIntercept = false;

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
                    if (value) {
                        // Pinning - ensure sidebar is expanded
                        this._ensureSidebarExpanded();
                    }
                    // Unpinning - no action needed, Foundry handles it
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

        // Intercept collapse button click when pinned
        if (this.collapseButton) {
            this.collapseButton.addEventListener('click', (event) => {
                // Bypass interceptor for programmatic clicks
                if (SidebarPin._bypassCollapseIntercept) {
                    return;
                }

                const isPinned = getSettingSafely(MODULE.ID, 'sidebarPinUI', false);
                
                if (isPinned) {
                    // Pin is enabled - prevent collapse, unpin, then allow collapse
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // Update pin button UI immediately (synchronously)
                    this._updatePinUI(false);
                    
                    // Unpin setting (async, but don't wait)
                    this._setPinState(false).catch(() => {
                        // Ignore errors
                    });
                    
                    // Now trigger the collapse by clicking the button again
                    // This time it will proceed because we're no longer pinned
                    setTimeout(() => {
                        this.collapseButton.click();
                    }, 10);
                    
                    // Show notification after a brief delay to not interfere with collapse
                    setTimeout(() => {
                        ui.notifications.info(game.i18n.format('coffee-pub-blacksmith.sidebarPinUI-Unpinned'));
                    }, 100);
                }
                // If not pinned, let Foundry's handler run normally
            }, true); // Use capture phase to run before Foundry's handler
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
        
        if (isPinned) {
            // When pinning: ensure sidebar is expanded by triggering Foundry's expand if needed
            this._ensureSidebarExpanded();
        }
        // When unpinning: no action needed - Foundry handles collapse normally
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
     * Ensure sidebar is expanded by triggering Foundry's expand button if needed
     */
    static _ensureSidebarExpanded() {
        // Prefer Foundry's API if available
        if (ui?.sidebar?.expand && ui?.sidebar?.collapsed) {
            ui.sidebar.expand();
            return;
        }

        // Fallback to button click if API not available
        if (!this.collapseButton) {
            return;
        }

        // Check if sidebar is collapsed using button attributes (more reliable than icon classes)
        const label = this.collapseButton.getAttribute('aria-label') || '';
        const tooltip = this.collapseButton.getAttribute('data-tooltip') || '';
        const isCollapsed = label === 'Expand' || tooltip.toLowerCase().includes('expand');

        if (isCollapsed) {
            // Sidebar is collapsed - trigger Foundry's expand button
            // Use bypass flag to avoid our interceptor
            SidebarPin._bypassCollapseIntercept = true;
            try {
                this.collapseButton.click();
            } finally {
                SidebarPin._bypassCollapseIntercept = false;
            }
        }
        // If already expanded, Foundry is already handling it - no action needed
    }


    /**
     * Apply initial state on load
     */
    static _applyInitialState() {
        const isPinned = getSettingSafely(MODULE.ID, 'sidebarPinUI', false);
        if (isPinned) {
            this._updatePinUI(true);
            this._ensureSidebarExpanded();
        }
    }
}

