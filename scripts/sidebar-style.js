// ================================================================== 
// ===== SIDEBAR STYLE ==============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class SidebarStyle {
    static initialized = false;
    static styleClass = 'blacksmith-sidebar-styled';

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
        } else {
            // Wait for Foundry to be ready
            Hooks.once('ready', () => {
                this._applySidebarStyle();
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
            description: 'Sidebar Style: Handle setting changes for sidebar style',
            context: 'sidebar-style-settings',
            priority: 3,
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'sidebarStyleUI') {
                    this._applySidebarStyle();
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
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

