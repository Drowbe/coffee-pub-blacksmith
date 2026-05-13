// ================================================================== 
// ===== CORE UI UTILITY ===========================================
// ================================================================== 

import { MODULE } from './const.js';
import { MenuBar } from './api-menubar.js';
import { PinManager } from './manager-pins.js';
import { getSettingSafely } from './api-core.js';

/** Foundry v13+: use namespaced class; global `KeyboardManager` is deprecated. */
function _keyboardManager() {
    return foundry?.helpers?.interaction?.KeyboardManager ?? null;
}

export class CoreUIUtility {
    /**
     * Foundry interface regions managed by Hide/Show UI (element id + user setting key).
     * @type {ReadonlyArray<{ id: string, settingKey: string }>}
     */
    static MANAGED_UI_SEGMENTS = Object.freeze([
        { id: 'ui-left-column-1', settingKey: 'canvasToolsHideUIIncludeToolbar' },
        { id: 'ui-left-column-2', settingKey: 'canvasToolsHideUIIncludeSceneControls' },
        { id: 'players', settingKey: 'canvasToolsHideUIIncludePlayers' },
        { id: 'hotbar', settingKey: 'canvasToolsHideUIIncludeHotbar' },
        { id: 'chat-notifications', settingKey: 'canvasToolsHideUIIncludeFloatingChat' }
    ]);

    /** Last explicit suppressed state from toggle / Apply on Load (drives sheet edits to include list). */
    static _uiSuppressed = false;

    static _interfaceKeybindingRegistered = false;
    static _applyOnLoadRetryScheduled = false;

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
     * Elements that currently participate in Hide/Show (exist in DOM and setting is on).
     * @returns {HTMLElement[]}
     */
    static getIncludedManagedElements() {
        const out = [];
        for (const { id, settingKey } of this.MANAGED_UI_SEGMENTS) {
            if (!game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) continue;
            if (!game.settings.get(MODULE.ID, settingKey)) continue;
            const el = document.getElementById(id);
            if (el) out.push(el);
        }
        return out;
    }

    /**
     * Managed region ids that are currently included by user settings, whether or not they exist in the DOM yet.
     * @returns {string[]}
     */
    static getIncludedManagedRegionIds() {
        const out = [];
        for (const { id, settingKey } of this.MANAGED_UI_SEGMENTS) {
            if (!game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) continue;
            if (!game.settings.get(MODULE.ID, settingKey)) continue;
            out.push(id);
        }
        return out;
    }

    /**
     * Apply hidden or visible state to every managed segment (excluded segments are always shown).
     * @param {boolean} suppressed
     */
    static applySuppressedState(suppressed) {
        this._uiSuppressed = !!suppressed;
        for (const { id, settingKey } of this.MANAGED_UI_SEGMENTS) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (!game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
                el.style.display = '';
                continue;
            }
            const included = game.settings.get(MODULE.ID, settingKey);
            if (!included) {
                el.style.display = '';
                continue;
            }
            el.style.display = suppressed ? 'none' : '';
        }
    }

    /**
     * True when every included segment is hidden (nothing included → false).
     * @returns {boolean}
     */
    static isInterfaceHidden() {
        const els = this.getIncludedManagedElements();
        if (els.length === 0) return false;
        return els.every((el) => this._isRegionHidden(el));
    }

    /**
     * Toggle the FoundryVTT interface visibility for included regions only.
     * @param {{ silent?: boolean }} [options]
     */
    static toggleInterface(options = {}) {
        const silent = !!options.silent;
        const label = document.querySelector('.interface-label');
        const els = this.getIncludedManagedElements();
        if (els.length === 0) {
            if (!silent) {
                ui.notifications.warn(
                    game.i18n?.localize?.(`${MODULE.ID}.canvasToolsHideUINoInclude-Warn`) ||
                        'No interface parts are included. Enable at least one in module settings or Manage UI → Options.'
                );
            }
            return;
        }
        const allHidden = els.every((el) => this._isRegionHidden(el));
        const nextSuppressed = !allHidden;
        if (!silent) {
            ui.notifications.info(
                nextSuppressed
                    ? (game.i18n?.localize?.(`${MODULE.ID}.canvasToolsHideUIHiding-Toast`) || 'Hiding the interface...')
                    : (game.i18n?.localize?.(`${MODULE.ID}.canvasToolsHideUIShowing-Toast`) || 'Showing the interface...')
            );
        }
        this.applySuppressedState(nextSuppressed);
        if (label) label.textContent = '';
    }

    /**
     * If the user enabled "Apply on Load", hide the core UI once the DOM is available (may run multiple times).
     */
    static _scheduleApplyHideInterfaceOnLoadRetries() {
        if (this._applyOnLoadRetryScheduled) return;
        this._applyOnLoadRetryScheduled = true;

        const retry = () => this.applyHideInterfaceOnLoad({ allowRetry: false });
        requestAnimationFrame(retry);
        requestAnimationFrame(() => requestAnimationFrame(retry));
        for (const delay of [100, 250, 500, 1000, 1500, 2500]) {
            setTimeout(retry, delay);
        }
        setTimeout(() => {
            this._applyOnLoadRetryScheduled = false;
        }, 3000);
    }

    static applyHideInterfaceOnLoad({ allowRetry = true } = {}) {
        const settingKey = `${MODULE.ID}.canvasToolsHideUIOnLoad`;
        if (!game.settings.settings.has(settingKey) || !game.settings.get(MODULE.ID, 'canvasToolsHideUIOnLoad')) {
            return;
        }

        const includedIds = this.getIncludedManagedRegionIds();
        if (includedIds.length === 0) return;

        const hasAnyIncludedRegion = includedIds.some((id) => !!document.getElementById(id));
        if (!hasAnyIncludedRegion) {
            if (allowRetry) this._scheduleApplyHideInterfaceOnLoadRetries();
            return;
        }

        // Force the persisted "hidden" state instead of toggling based on whatever the DOM currently reports.
        this.applySuppressedState(true);

        // Some regions are rendered after the first pass; keep a short retry window so late DOM inserts inherit the hidden state.
        if (allowRetry) this._scheduleApplyHideInterfaceOnLoadRetries();
    }

    /**
     * Human-readable shortcut from Configure Controls (lowercase "ctrl + q" style).
     * Uses game.keybindings.get() so reassigned keys are reflected whenever the menu is built.
     * @param {string} namespace - Module id that registered the action
     * @param {string} action - Keybinding action id (e.g. toggleQuickView, toggleInterfaceHide)
     * @returns {string} Empty if unavailable or unassigned.
     */
    static getKeybindingDisplayLower(namespace, action) {
        try {
            const bindings = game.keybindings?.get?.(namespace, action);
            if (!Array.isArray(bindings) || bindings.length === 0) return '';
            const b = bindings[0];
            if (!b?.key) return '';
            const KM = _keyboardManager();
            const parts = [];
            for (const raw of b.modifiers || []) {
                const sym = String(raw).toUpperCase();
                if (sym === 'CONTROL' || sym === 'CTRL') {
                    parts.push('ctrl');
                    continue;
                }
                if (KM?.MODIFIER_KEYS) {
                    if (raw === KM.MODIFIER_KEYS.CONTROL || sym === 'CONTROL') {
                        parts.push('ctrl');
                        continue;
                    }
                    if (raw === KM.MODIFIER_KEYS.SHIFT || sym === 'SHIFT') {
                        parts.push('shift');
                        continue;
                    }
                    if (raw === KM.MODIFIER_KEYS.ALT || sym === 'ALT') {
                        parts.push('alt');
                        continue;
                    }
                }
                parts.push(String(raw).toLowerCase());
            }
            const keyPart = KM?.getKeycodeDisplayString?.(b.key) ?? b.logicalKey ?? b.key;
            parts.push(String(keyPart).toLowerCase());
            return parts.join(' + ');
        } catch {
            return '';
        }
    }

    /**
     * Build the start menu context items
     * @returns {Promise<Array<{name: string, icon: string, description?: string, onClick?: Function, submenu?: Array, separator?: boolean}>>}
     */
    static async getLeftStartMenuItems() {
        const items = [];
        const L = (key) => (game.i18n?.localize?.(`${MODULE.ID}.${key}`) ?? key);

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

        if (getSettingSafely(MODULE.ID, 'enablePerformanceMonitor', true)) {
            try {
                const { PerformanceUtility } = await import('./utility-performance.js');
                items.push({
                    name: PerformanceUtility.getMemoryDisplayString(),
                    icon: 'fa-solid fa-chart-simple',
                    description: '',
                    onClick: () => {
                        PerformanceUtility.showPerformanceCheck();
                    }
                });
            } catch {
                /* module cycling */
            }
        }

        if (game.user.isGM && getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) {
            let qvOn = getSettingSafely(MODULE.ID, 'quickViewEnabled', false);
            try {
                const { QuickViewUtility } = await import('./utility-quickview.js');
                qvOn = QuickViewUtility.isActive();
            } catch {
                /* module cycling / not yet loaded */
            }
            const qvBase = qvOn ? L('quickViewMenubar-StateOn') : L('quickViewMenubar-StateOff');
            const qvHotkey = CoreUIUtility.getKeybindingDisplayLower(MODULE.ID, 'toggleQuickView');
            const qvLabel = qvHotkey ? `${qvBase} (${qvHotkey})` : qvBase;
            items.push({
                name: qvLabel,
                icon: qvOn ? 'fa-solid fa-street-view' : 'fa-regular fa-street-view',
                description: '',
                onClick: async () => {
                    const { QuickViewUtility } = await import('./utility-quickview.js');
                    await QuickViewUtility.toggle();
                    MenuBar.renderMenubar();
                }
            });
        }

        const applyOnLoad = game.settings.get(MODULE.ID, 'canvasToolsHideUIOnLoad');
        const isHidden = CoreUIUtility.isInterfaceHidden();

        const includeSettingKeys = [
            'canvasToolsHideUIIncludeToolbar',
            'canvasToolsHideUIIncludeSceneControls',
            'canvasToolsHideUIIncludePlayers',
            'canvasToolsHideUIIncludeHotbar',
            'canvasToolsHideUIIncludeFloatingChat'
        ];
        const includeMenubarKeys = [
            'canvasToolsHideUIIncludeToolbar-Menubar',
            'canvasToolsHideUIIncludeSceneControls-Menubar',
            'canvasToolsHideUIIncludePlayers-Menubar',
            'canvasToolsHideUIIncludeHotbar-Menubar',
            'canvasToolsHideUIIncludeFloatingChat-Menubar'
        ];

        const optionsSubmenu = [
            {
                name: L('canvasToolsHideUIOnLoad-Label'),
                icon: applyOnLoad ? 'fa-solid fa-square-check' : 'fa-regular fa-square',
                description: '',
                onClick: async () => {
                    await game.settings.set(MODULE.ID, 'canvasToolsHideUIOnLoad', !applyOnLoad);
                    ui.notifications.info(
                        game.i18n.format(`${MODULE.ID}.canvasToolsHideUIOnLoad-Toggled`, {
                            state: !applyOnLoad ? L('canvasToolsHideUIOnLoad-StateOn') : L('canvasToolsHideUIOnLoad-StateOff')
                        })
                    );
                }
            }
        ];
        for (let i = 0; i < includeSettingKeys.length; i++) {
            const settingKey = includeSettingKeys[i];
            const on = game.settings.get(MODULE.ID, settingKey);
            optionsSubmenu.push({
                name: L(includeMenubarKeys[i]),
                icon: on ? 'fa-solid fa-square-check' : 'fa-regular fa-square',
                description: '',
                onClick: async () => {
                    // If UI is currently hidden, apply include/exclude toggles immediately.
                    const suppressedBefore = CoreUIUtility._uiSuppressed || CoreUIUtility.isInterfaceHidden();
                    await game.settings.set(MODULE.ID, settingKey, !on);
                    CoreUIUtility.applySuppressedState(suppressedBefore);
                    MenuBar.renderMenubar();
                }
            });
        }

        const hideShowBase = isHidden ? L('canvasToolsHideUIShowUI-Menubar') : L('canvasToolsHideUIHideUI-Menubar');
        const hideHotkey = CoreUIUtility.getKeybindingDisplayLower(MODULE.ID, 'toggleInterfaceHide');
        const hideShowLabel = hideHotkey ? `${hideShowBase} (${hideHotkey})` : hideShowBase;

        const uiSubmenu = [
            {
                name: hideShowLabel,
                icon: 'fa-solid fa-sidebar',
                description: '',
                onClick: () => {
                    CoreUIUtility.toggleInterface();
                    MenuBar.renderMenubar();
                }
            },
            {
                name: L('canvasToolsHideUIOptions-Menubar'),
                icon: 'fa-solid fa-sliders',
                description: '',
                submenu: optionsSubmenu
            }
        ];

        items.push({
            name: L('canvasToolsManageUI-Menubar'),
            icon: "fa-solid fa-desktop",
            description: "",
            submenu: uiSubmenu
        });

        return items;
    }

    /**
     * Register default Ctrl+I in Configure Controls. Call from `init` so the binding appears in the controls UI.
     * Same pattern as QuickViewUtility._registerQuickViewKeybinding in utility-quickview.js.
     */
    static registerInterfaceToggleKeybinding() {
        if (this._interfaceKeybindingRegistered || !game?.keybindings?.register) return;
        try {
            const KM = _keyboardManager();
            const controlMod = KM?.MODIFIER_KEYS?.CONTROL;
            const modifiers = controlMod != null ? [controlMod] : ['Control'];
            const precedence =
                typeof CONST !== 'undefined' && CONST.KEYBINDING_PRECEDENCE_NORMAL !== undefined
                    ? CONST.KEYBINDING_PRECEDENCE_NORMAL
                    : undefined;
            game.keybindings.register(MODULE.ID, 'toggleInterfaceHide', {
                name: MODULE.ID + '.keybindingToggleInterfaceHide-Name',
                hint: MODULE.ID + '.keybindingToggleInterfaceHide-Hint',
                editable: [{ key: 'KeyI', modifiers }],
                restricted: false,
                ...(precedence !== undefined ? { precedence } : {}),
                onDown: () => {
                    CoreUIUtility.toggleInterface();
                    MenuBar.renderMenubar();
                }
            });
            this._interfaceKeybindingRegistered = true;
        } catch (e) {
            console.error('Coffee Pub Blacksmith | Interface hide keybinding registration failed', e);
        }
    }
}

Hooks.once('init', () => {
    CoreUIUtility.registerInterfaceToggleKeybinding();
});

// Register core UI menubar tools via the public API (same pattern as external modules)
Hooks.once('ready', () => {
    // Apply on Load: force hidden state once the client UI finishes building.
    CoreUIUtility.applyHideInterfaceOnLoad();

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

    // PINS
    api.registerMenubarTool('pin-layers', {
        icon: "fa-solid fa-layer-group",
        name: "pin-layers",
        title: "",
        tooltip: "Open Pins",
        onClick: () => api.pins?.openLayers({ sceneId: canvas?.scene?.id }),
        contextMenuItems: () => {
            return typeof MenuBar._getPinsContextMenuItems === 'function'
                ? MenuBar._getPinsContextMenuItems()
                : [];
        },
        zone: "left",
        group: "general",
        groupOrder: 100,
        order: 10,
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
});

Hooks.once('canvasReady', () => {
    CoreUIUtility.applyHideInterfaceOnLoad();
});

Hooks.on('renderHotbar', () => {
    CoreUIUtility.applyHideInterfaceOnLoad();
});

Hooks.on('renderSceneControls', () => {
    CoreUIUtility.applyHideInterfaceOnLoad();
});

Hooks.on('renderPlayerList', () => {
    CoreUIUtility.applyHideInterfaceOnLoad();
});

// Reflect pin filter state on the Pins menubar icon (orange = filters active)
function _syncPinsIconColor() {
    try {
        const anyHidden = PinManager.isGlobalHidden() ||
            Object.keys(game.settings.get(MODULE.ID, PinManager.HIDDEN_MODULE_TYPES_SETTING_KEY) || {}).length > 0 ||
            Object.keys(game.settings.get(MODULE.ID, PinManager.HIDDEN_TAGS_SETTING_KEY) || {}).length > 0;
        const tool = MenuBar.toolbarIcons?.get('pin-layers');
        if (!tool) return;
        tool.iconColor = anyHidden ? 'rgba(255, 140, 0, 0.9)' : null;
        MenuBar.renderMenubar(true);
    } catch (_err) {}
}

const _PIN_FILTER_KEYS = new Set([
    'pinsHideAll', 'pinsHiddenModuleTypes', 'pinsHiddenTags'
]);

const _CORE_UI_HIDE_INCLUDE_KEYS = new Set([
    'canvasToolsHideUIIncludeToolbar',
    'canvasToolsHideUIIncludeSceneControls',
    'canvasToolsHideUIIncludePlayers',
    'canvasToolsHideUIIncludeHotbar',
    'canvasToolsHideUIIncludeFloatingChat'
]);

function _onCoreUiIncludeSettingKeyChanged(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return;
    const short = rawKey.includes('.') ? rawKey.slice(rawKey.lastIndexOf('.') + 1) : rawKey;
    if (!_CORE_UI_HIDE_INCLUDE_KEYS.has(short)) return;
    CoreUIUtility.applySuppressedState(CoreUIUtility._uiSuppressed);
}

Hooks.on('updateSetting', (setting) => {
    if (_PIN_FILTER_KEYS.has(setting?.key)) _syncPinsIconColor();
    if (setting?.namespace === MODULE.ID && _CORE_UI_HIDE_INCLUDE_KEYS.has(setting?.key)) {
        _onCoreUiIncludeSettingKeyChanged(setting.key);
    }
});

Hooks.on('clientSettingChanged', (key, _value, _options) => {
    _onCoreUiIncludeSettingKeyChanged(key);
});
