// ================================================================== 
// ===== CORE UI UTILITY ===========================================
// ================================================================== 

import { MODULE } from './const.js';
import { MenuBar } from './api-menubar.js';
import { QuickViewUtility } from './utility-quickview.js';
import { PerformanceUtility } from './utility-performance.js';

export class CoreUIUtility {
    /**
     * Check the current state of UI elements to determine if interface is hidden
     * @returns {boolean} True if any UI elements are hidden
     */
    static isInterfaceHidden() {
        const uiLeft = document.getElementById('ui-left');
        const uiBottom = document.getElementById('ui-bottom');
        const uiTop = document.getElementById('ui-top');

        const isLeftHidden = uiLeft && uiLeft.style.display === 'none';
        const isBottomHidden = uiBottom && uiBottom.style.display === 'none';
        const isTopHidden = uiTop && uiTop.style.display === 'none';

        return isLeftHidden || isBottomHidden || isTopHidden;
    }

    /**
     * Toggle the FoundryVTT interface visibility
     */
    static toggleInterface() {
        const uiLeft = document.getElementById('ui-left');
        const uiBottom = document.getElementById('ui-bottom');
        const uiTop = document.getElementById('ui-top');
        const label = document.querySelector('.interface-label');

        // Check if any UI element that can be hidden is currently hidden
        const isLeftHidden = uiLeft && uiLeft.style.display === 'none';
        const isBottomHidden = uiBottom && uiBottom.style.display === 'none';
        const isTopHidden = uiTop && uiTop.style.display === 'none';
        const isAnyHidden = isLeftHidden || isBottomHidden || isTopHidden;

        // Get the settings
        const hideLeftUI = game.settings.get(MODULE.ID, 'canvasToolsHideLeftUI');
        const hideBottomUI = game.settings.get(MODULE.ID, 'canvasToolsHideBottomUI');

        if (isAnyHidden) {
            ui.notifications.info("Showing the Interface...");
            if (hideLeftUI && isLeftHidden) uiLeft.style.display = 'inherit';
            if (hideBottomUI && isBottomHidden) uiBottom.style.display = 'inherit';
            if (isTopHidden) uiTop.style.display = 'inherit';
            if (label) label.textContent = '';
        } else {
            ui.notifications.info("Hiding the Interface...");
            if (hideLeftUI) uiLeft.style.display = 'none';
            if (hideBottomUI) uiBottom.style.display = 'none';
            if (uiTop) uiTop.style.display = 'none';
            if (label) label.textContent = '';
        }
    }

    /**
     * Build the start menu context items
     * @returns {Array<{name: string, icon: string, description?: string, onClick?: Function, submenu?: Array, separator?: boolean}>}
     */
    static getLeftStartMenuItems() {
        const items = [];

        items.push({
            name: "Refresh",
            icon: "fa-solid fa-rotate",
            onClick: () => {
                window.location.reload();
            }
        });

        items.push({
            name: "Settings",
            icon: "fa-solid fa-gear",
            onClick: () => {
                game.settings.sheet.render(true);
            }
        });

        items.push({
            name: "Performance Check",
            icon: "fa-solid fa-chart-simple",
            onClick: () => {
                PerformanceUtility.showPerformanceCheck();
            }
        });

        if (game.user.isGM) {
            items.push({
                name: QuickViewUtility.isActive() ? "Quick View Off" : "Quick View On",
                icon: QuickViewUtility.getIcon(),
                description: "Clarity mode: increase brightness, reveal fog, show all tokens",
                onClick: async () => {
                    await QuickViewUtility.toggle();
                    MenuBar.renderMenubar();
                }
            });
        }

        const api = game.modules.get(MODULE.ID)?.api;
        const applyOnLoad = game.settings.get(MODULE.ID, 'canvasToolsHideUIOnLoad');
        const isHidden = CoreUIUtility.isInterfaceHidden();
        
        const uiSubmenu = [
            {
                name: isHidden ? "Show Interface" : "Hide Interface",
                icon: "fa-solid fa-sidebar",
                description: "Toggle visibility of core Foundry interface",
                onClick: () => {
                    CoreUIUtility.toggleInterface();
                    MenuBar.renderMenubar();
                }
            },
            {
                name: applyOnLoad ? "Disable Apply on Load" : "Enable Apply on Load",
                icon: applyOnLoad ? "fa-solid fa-square-check" : "fa-regular fa-square",
                description: "Automatically hide UI when client loads",
                onClick: async () => {
                    await game.settings.set(MODULE.ID, 'canvasToolsHideUIOnLoad', !applyOnLoad);
                    ui.notifications.info(`Apply on Load is now ${!applyOnLoad ? 'Enabled' : 'Disabled'}.`);
                }
            }
        ];

        items.push({
            name: "Manage UI",
            icon: "fa-solid fa-desktop",
            description: "Interface visibility settings",
            submenu: uiSubmenu
        });

        if (api) {
            let visibilityItems = [];
            let clearItems = [];
            
            if (typeof MenuBar._getPinsVisibilityMenuItems === 'function') {
                visibilityItems = MenuBar._getPinsVisibilityMenuItems();
            }
            
            if (typeof MenuBar._getPinsClearMenuItems === 'function') {
                clearItems = MenuBar._getPinsClearMenuItems();
            }

            const pinsSubmenu = [...visibilityItems];
            if (visibilityItems.length > 0 && clearItems.length > 0) {
                pinsSubmenu.push({ separator: true });
            }
            pinsSubmenu.push(...clearItems);

            if (pinsSubmenu.length > 0) {
                items.push({
                    name: "Pins",
                    icon: "fa-solid fa-map-pin",
                    description: "Visibility and clear options",
                    submenu: pinsSubmenu
                });
            }
        }

        return items;
    }
}

// Register Apply-on-Load behavior only (start menu / settings / refresh are registered in api-menubar registerDefaultTools)
Hooks.once('ready', () => {
    if (game.settings.get(MODULE.ID, 'canvasToolsHideUIOnLoad')) {
        if (!CoreUIUtility.isInterfaceHidden()) {
            CoreUIUtility.toggleInterface();
        }
    }
});