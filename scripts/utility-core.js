// ================================================================== 
// ===== CORE UI UTILITY ===========================================
// ================================================================== 

import { MODULE } from './const.js';
import { MenuBar } from './api-menubar.js';
import { getSettingSafely } from './api-core.js';
import { PerformanceUtility } from './utility-performance.js';

export class CoreUIUtility {
    /**
     * Whether a core UI region is hidden (inline style or computed, for v13 compatibility).
     * @param {HTMLElement | null} el
     * @returns {boolean}
     */
    static _isRegionHidden(el) {
        if (!el) return false;
        if (el.style.display === 'none') return true;
        try {
            return getComputedStyle(el).display === 'none';
        } catch {
            return false;
        }
    }

    /**
     * Check the current state of UI elements to determine if interface is hidden
     * @returns {boolean} True if any UI elements are hidden
     */
    static isInterfaceHidden() {
        const uiLeft = document.getElementById('ui-left');
        const uiBottom = document.getElementById('ui-bottom');
        const uiTop = document.getElementById('ui-top');

        return (
            this._isRegionHidden(uiLeft) ||
            this._isRegionHidden(uiBottom) ||
            this._isRegionHidden(uiTop)
        );
    }

    /**
     * Toggle the FoundryVTT interface visibility
     * @param {{ silent?: boolean }} [options]
     */
    static toggleInterface(options = {}) {
        const silent = !!options.silent;
        const uiLeft = document.getElementById('ui-left');
        const uiBottom = document.getElementById('ui-bottom');
        const uiTop = document.getElementById('ui-top');
        const label = document.querySelector('.interface-label');

        const isLeftHidden = this._isRegionHidden(uiLeft);
        const isBottomHidden = this._isRegionHidden(uiBottom);
        const isTopHidden = this._isRegionHidden(uiTop);
        const isAnyHidden = isLeftHidden || isBottomHidden || isTopHidden;

        const hideLeftUI = game.settings.get(MODULE.ID, 'canvasToolsHideLeftUI');
        const hideBottomUI = game.settings.get(MODULE.ID, 'canvasToolsHideBottomUI');

        if (isAnyHidden) {
            if (!silent) ui.notifications.info('Showing the Interface...');
            if (hideLeftUI && uiLeft && isLeftHidden) uiLeft.style.display = 'inherit';
            if (hideBottomUI && uiBottom && isBottomHidden) uiBottom.style.display = 'inherit';
            if (uiTop && isTopHidden) uiTop.style.display = 'inherit';
            if (label) label.textContent = '';
        } else {
            if (!silent) ui.notifications.info('Hiding the Interface...');
            if (hideLeftUI && uiLeft) uiLeft.style.display = 'none';
            if (hideBottomUI && uiBottom) uiBottom.style.display = 'none';
            if (uiTop) uiTop.style.display = 'none';
            if (label) label.textContent = '';
        }
    }

    /**
     * If the user enabled "Apply on Load", hide the core UI once the DOM is available (may run multiple times).
     */
    static applyHideInterfaceOnLoad() {
        const settingKey = `${MODULE.ID}.canvasToolsHideUIOnLoad`;
        if (!game.settings.settings.has(settingKey) || !game.settings.get(MODULE.ID, 'canvasToolsHideUIOnLoad')) {
            return;
        }
        if (!document.getElementById('ui-left')) return;
        if (!this.isInterfaceHidden()) {
            this.toggleInterface({ silent: true });
        }
    }

    /**
     * Build the start menu context items
     * @returns {Promise<Array<{name: string, icon: string, description?: string, onClick?: Function, submenu?: Array, separator?: boolean}>>}
     */
    static async getLeftStartMenuItems() {
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
            name: PerformanceUtility.getMemoryDisplayString(),
            icon: "fa-solid fa-chart-simple",
            description: 'Click for full performance report',
            onClick: () => {
                PerformanceUtility.showPerformanceCheck();
            }
        });

        if (game.user.isGM && getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) {
            let qvOn = getSettingSafely(MODULE.ID, 'quickViewEnabled', false);
            try {
                const { QuickViewUtility } = await import('./utility-quickview.js');
                qvOn = QuickViewUtility.isActive();
            } catch {
                /* module cycling / not yet loaded */
            }
            items.push({
                name: qvOn ? 'Quickview On' : 'Quickview Off',
                icon: qvOn ? 'fa-solid fa-lightbulb' : 'fa-regular fa-lightbulb',
                description: 'GM Quickview: brightness, fog reveal, token sight highlights',
                onClick: async () => {
                    const { QuickViewUtility } = await import('./utility-quickview.js');
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
                description: "Toggle core Foundry UI visibility",
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

// Register core UI menubar tools via the public API (same pattern as external modules)
Hooks.once('ready', () => {
    // Apply on Load: hide UI when the setting is on — DOM may not exist on first tick (v13)
    CoreUIUtility.applyHideInterfaceOnLoad();
    requestAnimationFrame(() => requestAnimationFrame(() => CoreUIUtility.applyHideInterfaceOnLoad()));
    setTimeout(() => CoreUIUtility.applyHideInterfaceOnLoad(), 250);
    setTimeout(() => CoreUIUtility.applyHideInterfaceOnLoad(), 1500);

    const api = game.modules.get(MODULE.ID)?.api;
    if (!api?.registerMenubarTool) return;

    // START MENU
    api.registerMenubarTool('left-start-menu', {
        icon: "fa-solid fa-bars",
        name: "left-start-menu",
        title: "",
        tooltip: "Open menu",
        onClick: async (event) => {
            const items = await CoreUIUtility.getLeftStartMenuItems();
            if (!Array.isArray(items) || items.length === 0) return;
            const trigger = event?.target?.closest?.('[data-tool]');
            const rect = trigger?.getBoundingClientRect?.();
            const x = Number.isFinite(event?.clientX) ? event.clientX : Math.round((rect?.left ?? 0) + ((rect?.width ?? 0) / 2));
            const y = Number.isFinite(event?.clientY) ? event.clientY : Math.round(rect?.bottom ?? 0);
            MenuBar._showMenubarContextMenu(items, x, y);
        },
        zone: "left",
        group: "general",
        groupOrder: 100,
        order: 1,
        moduleId: "blacksmith-core",
        gmOnly: false,
        leaderOnly: false,
        visible: true,
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });

    // SETTINGS
    api.registerMenubarTool('settings', {
        icon: "fa-solid fa-gear",
        name: "settings",
        title: "Open Foundry Settings",
        tooltip: null,
        onClick: () => game.settings.sheet.render(true),
        zone: "left",
        group: "general",
        groupOrder: 100,
        order: 1,
        moduleId: "blacksmith-core",
        gmOnly: false,
        leaderOnly: false,
        visible: false,
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });

    // REFRESH
    api.registerMenubarTool('refresh', {
        icon: "fa-solid fa-rotate",
        name: "refresh",
        title: "Refresh Foundry",
        tooltip: null,
        onClick: () => window.location.reload(),
        zone: "left",
        group: "general",
        groupOrder: 100,
        order: 2,
        moduleId: "blacksmith-core",
        gmOnly: false,
        leaderOnly: false,
        visible: false,
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });
});

Hooks.once('canvasReady', () => {
    CoreUIUtility.applyHideInterfaceOnLoad();
});