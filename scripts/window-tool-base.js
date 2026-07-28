// ==================================================================
// ===== LIGHTWEIGHT APPLICATION V2 TOOL WINDOW BASE =================
// ==================================================================
//
// Compact/persistent tool-palette presentation built on the same
// BlacksmithWindowBaseV2 lifecycle and public Window API.

import { BlacksmithWindowBaseV2 } from './window-base.js';
import { UIContextMenu } from './ui-context-menu.js';

export const BLACKSMITH_WINDOW_STYLES = Object.freeze({
    STANDARD: 'standard',
    TOOL: 'tool'
});

export const BLACKSMITH_TOOL_TITLEBARS = Object.freeze({
    FULL: 'full',
    MICRO: 'micro'
});

export const BLACKSMITH_TOOL_THEMES = Object.freeze({
    LIGHT: 'light',
    DARK: 'dark',
    GLASS: 'glass'
});

export class BlacksmithToolWindowBaseV2 extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';
    static WINDOW_STYLE = BLACKSMITH_WINDOW_STYLES.TOOL;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['blacksmith-window-tool'],
            position: { width: 360, height: 'auto' },
            window: {
                resizable: false,
                minimizable: true
            },
            toolTitlebar: BLACKSMITH_TOOL_TITLEBARS.FULL,
            toolTheme: BLACKSMITH_TOOL_THEMES.LIGHT,
            allowTitlebarModeToggle: true,
            allowToolThemeToggle: true,
            rememberTitlebarMode: true,
            rememberToolTheme: true,
            rememberPosition: true,
            windowSizeConstraints: {
                minWidth: 220,
                maxWidth: 'calc(100vw - 16px)',
                maxHeight: 'calc(100vh - 16px)'
            }
        }
    );

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-blacksmith/templates/window-tool-template.hbs'
        }
    };

    constructor(options = {}) {
        super(options);
        this._toolTitlebarMode = this.options?.toolTitlebar === BLACKSMITH_TOOL_TITLEBARS.MICRO
            ? BLACKSMITH_TOOL_TITLEBARS.MICRO
            : BLACKSMITH_TOOL_TITLEBARS.FULL;
        this._toolTheme = Object.values(BLACKSMITH_TOOL_THEMES).includes(this.options?.toolTheme)
            ? this.options.toolTheme
            : BLACKSMITH_TOOL_THEMES.LIGHT;
        this._loadToolTitlebarPreference();
        this._loadToolThemePreference();
    }

    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);
        context.appId ??= this.id;
        context.windowStyle = BLACKSMITH_WINDOW_STYLES.TOOL;
        context.toolTheme = this.toolTheme;
        context.toolThemeIsDark = this.toolTheme === BLACKSMITH_TOOL_THEMES.DARK;
        context.toolThemeIsGlass = this.toolTheme === BLACKSMITH_TOOL_THEMES.GLASS;
        context.showToolBar ??= Boolean(context.toolBarLeft || context.toolBarRight);
        context.showToolFooter ??= Boolean(context.toolFooterLeft || context.toolFooterRight);
        return context;
    }

    _saveScrollPositions() {
        const root = this.element;
        const body = root?.querySelector?.('.blacksmith-window-tool-body');
        return { body: body?.scrollTop ?? 0 };
    }

    _restoreScrollPositions(saved) {
        const body = this.element?.querySelector?.('.blacksmith-window-tool-body');
        if (body && saved?.body != null) body.scrollTop = saved.body;
    }

    /**
     * Inline controls rendered directly in the compact native title bar.
     * Override in a subclass.
     *
     * @returns {Array<{id:string, icon:string, label:string, active?:boolean, disabled?:boolean, onClick?:Function}>}
     */
    getToolHeaderActions() {
        return [];
    }

    get toolTitlebarMode() {
        return this._toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO
            ? BLACKSMITH_TOOL_TITLEBARS.MICRO
            : BLACKSMITH_TOOL_TITLEBARS.FULL;
    }

    get toolTheme() {
        return Object.values(BLACKSMITH_TOOL_THEMES).includes(this._toolTheme)
            ? this._toolTheme
            : BLACKSMITH_TOOL_THEMES.LIGHT;
    }

    get _toolTitlebarPreferenceKey() {
        return this.options?.toolTitlebarPreferenceKey || `${this._positionKey}-titlebar`;
    }

    get _toolThemePreferenceKey() {
        return this.options?.toolThemePreferenceKey || `${this._positionKey}-theme`;
    }

    _loadToolTitlebarPreference() {
        if (this.options?.allowTitlebarModeToggle === false) return;
        if (this.options?.rememberTitlebarMode === false) return;
        try {
            const saved = localStorage.getItem(this._toolTitlebarPreferenceKey);
            if (Object.values(BLACKSMITH_TOOL_TITLEBARS).includes(saved)) {
                this._toolTitlebarMode = saved;
            }
        } catch (_) {}
    }

    _saveToolTitlebarPreference(mode) {
        if (this.options?.rememberTitlebarMode === false) return;
        try {
            localStorage.setItem(this._toolTitlebarPreferenceKey, mode);
        } catch (_) {}
    }

    _loadToolThemePreference() {
        if (this.options?.allowToolThemeToggle === false) return;
        if (this.options?.rememberToolTheme === false) return;
        try {
            const saved = localStorage.getItem(this._toolThemePreferenceKey);
            if (Object.values(BLACKSMITH_TOOL_THEMES).includes(saved)) {
                this._toolTheme = saved;
            }
        } catch (_) {}
    }

    _saveToolThemePreference(theme) {
        if (this.options?.rememberToolTheme === false) return;
        try {
            localStorage.setItem(this._toolThemePreferenceKey, theme);
        } catch (_) {}
    }

    async setToolTitlebarMode(mode, { persist = true, render = true } = {}) {
        const normalized = mode === BLACKSMITH_TOOL_TITLEBARS.MICRO
            ? BLACKSMITH_TOOL_TITLEBARS.MICRO
            : BLACKSMITH_TOOL_TITLEBARS.FULL;
        this._toolTitlebarMode = normalized;
        if (persist) this._saveToolTitlebarPreference(normalized);
        this._applyToolWindowModeClasses(this.element);
        if (render && this.rendered) await this.render(false);
        return this;
    }

    async setToolTheme(theme, { persist = true, render = true } = {}) {
        const normalized = Object.values(BLACKSMITH_TOOL_THEMES).includes(theme)
            ? theme
            : BLACKSMITH_TOOL_THEMES.LIGHT;
        const previousTheme = this.toolTheme;
        if (normalized === previousTheme) return this;

        this._toolTheme = normalized;
        if (persist) this._saveToolThemePreference(normalized);
        this._applyToolWindowModeClasses(this.element);
        if (render && this.rendered) await this.render(false);

        try {
            await this.onToolThemeChanged(normalized, previousTheme);
        } finally {
            Hooks.callAll(
                'blacksmith.toolWindowThemeChanged',
                this,
                normalized,
                previousTheme
            );
        }
        return this;
    }

    /**
     * Consumer lifecycle callback invoked after a runtime Tool theme change.
     * Override for JavaScript work that cannot be expressed through the shared
     * CSS variables, frame classes, data attribute, or template context.
     *
     * @param {'light'|'dark'|'glass'} theme
     * @param {'light'|'dark'|'glass'} previousTheme
     * @returns {Promise<void>|void}
     */
    async onToolThemeChanged(_theme, _previousTheme) {}

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        // Header controls may change at runtime.
        options.window ??= {};
    }

    _getHeaderControls() {
        // Tool windows use Blacksmith's body-level UIContextMenu. Returning only
        // inherited controls keeps Application V2 integrations available for
        // conversion into that menu without creating an in-frame tool dropdown.
        return super._getHeaderControls?.() ?? [];
    }

    _getToolContextMenuItems() {
        const localize = (value) => game.i18n.localize(value || '');
        const items = [];

        for (const action of this.getToolHeaderActions?.() ?? []) {
            if (!action?.id) continue;
            items.push({
                name: `${action.active ? '✓ ' : ''}${localize(action.label || String(action.id))}`,
                icon: action.icon || 'fa-solid fa-circle',
                disabled: Boolean(action.disabled),
                callback: () => action.onClick?.call(this, null, action)
            });
        }

        for (const control of super._getHeaderControls?.() ?? []) {
            if (control?.visible === false || !control?.label) continue;
            items.push({
                name: localize(control.label),
                icon: control.icon || 'fa-solid fa-circle',
                disabled: Boolean(control.disabled),
                callback: () => control.onClick?.call(this, null)
            });
        }

        if (items.length) items.push({ separator: true });

        if (this.options?.allowTitlebarModeToggle !== false) {
            const useFull = this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO;
            items.push({
                name: localize(useFull
                    ? 'coffee-pub-blacksmith.ToolWindowUseFullTitlebar'
                    : 'coffee-pub-blacksmith.ToolWindowUseMicroTitlebar'),
                icon: useFull ? 'fa-solid fa-window-maximize' : 'fa-solid fa-grip-lines',
                callback: () => this.setToolTitlebarMode(
                    useFull ? BLACKSMITH_TOOL_TITLEBARS.FULL : BLACKSMITH_TOOL_TITLEBARS.MICRO
                )
            });
        }

        if (this.options?.allowToolThemeToggle !== false) {
            items.push({
                name: localize('coffee-pub-blacksmith.ToolWindowTheme'),
                icon: 'fa-solid fa-palette',
                submenu: [
                    {
                        name: `${this.toolTheme === BLACKSMITH_TOOL_THEMES.LIGHT ? '✓ ' : ''}${localize('coffee-pub-blacksmith.ToolWindowLightTheme')}`,
                        icon: 'fa-solid fa-sun',
                        callback: () => this.setToolTheme(BLACKSMITH_TOOL_THEMES.LIGHT)
                    },
                    {
                        name: `${this.toolTheme === BLACKSMITH_TOOL_THEMES.DARK ? '✓ ' : ''}${localize('coffee-pub-blacksmith.ToolWindowDarkTheme')}`,
                        icon: 'fa-solid fa-moon',
                        callback: () => this.setToolTheme(BLACKSMITH_TOOL_THEMES.DARK)
                    },
                    {
                        name: `${this.toolTheme === BLACKSMITH_TOOL_THEMES.GLASS ? '✓ ' : ''}${localize('coffee-pub-blacksmith.ToolWindowGlassTheme')}`,
                        icon: 'fa-regular fa-gem',
                        callback: () => this.setToolTheme(BLACKSMITH_TOOL_THEMES.GLASS)
                    }
                ]
            });
        }

        if (this.options?.window?.minimizable !== false) {
            items.push({
                name: localize(this.minimized
                    ? 'coffee-pub-blacksmith.ToolWindowRestore'
                    : 'coffee-pub-blacksmith.ToolWindowMinimize'),
                icon: this.minimized ? 'fa-solid fa-window-restore' : 'fa-solid fa-window-minimize',
                callback: async () => {
                    if (this.minimized) await this.maximize();
                    else await this.minimize();
                }
            });
        }

        items.push(
            {
                name: localize('coffee-pub-blacksmith.ToolWindowResetPosition'),
                icon: 'fa-solid fa-arrows-to-dot',
                callback: () => this.resetToolWindowPosition()
            },
            {
                name: localize('APPLICATION.TOOLS.Close'),
                icon: 'fa-solid fa-xmark',
                callback: () => this.close()
            }
        );
        return items;
    }

    _showToolContextMenu(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        this.bringToFront();

        const trigger = event?.currentTarget;
        const rect = trigger?.getBoundingClientRect?.();
        const x = Number.isFinite(event?.clientX) && event.clientX > 0
            ? event.clientX
            : (rect?.right ?? this.position.left);
        const y = Number.isFinite(event?.clientY) && event.clientY > 0
            ? event.clientY
            : (rect?.bottom ?? this.position.top);

        UIContextMenu.show({
            id: `blacksmith-tool-window-menu-${this.id}`,
            x,
            y,
            zones: this._getToolContextMenuItems(),
            zoneClass: 'core',
            className: 'blacksmith-tool-window-context-menu'
        });
    }

    resetToolWindowPosition() {
        clearTimeout(this._positionSaveTimer);
        try {
            localStorage.removeItem(this._positionKey);
        } catch (_) {}

        const rect = this.element?.getBoundingClientRect?.();
        const width = rect?.width || Number(this.position?.width) || 360;
        const height = rect?.height || Number(this.position?.height) || 160;
        const viewportWidth = document.documentElement?.clientWidth || globalThis.innerWidth || width;
        const viewportHeight = document.documentElement?.clientHeight || globalThis.innerHeight || height;
        return this.setPosition({
            left: Math.max(8, Math.round((viewportWidth - width) / 2)),
            top: Math.max(8, Math.round((viewportHeight - height) / 2))
        });
    }

    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        this._applyToolWindowModeClasses(frame);
        return frame;
    }

    async render(force = false) {
        const result = await super.render(force);
        requestAnimationFrame(() => this._applyToolWindowChrome());
        return result;
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this._applyToolWindowChrome();
    }

    _applyToolWindowChrome() {
        const frame = this.element;
        const header = frame?.querySelector?.(':scope > .window-header');
        if (!frame || !header) return;

        this._applyToolWindowModeClasses(frame);
        header.querySelectorAll(
            '.blacksmith-window-tool-header-action, .blacksmith-window-tool-menu-trigger'
        ).forEach((element) => element.remove());

        const actions = this.getToolHeaderActions?.() ?? [];
        const controlsToggle = header.querySelector('[data-action="toggleControls"]');
        if (controlsToggle) controlsToggle.hidden = true;
        if (this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.FULL) {
            for (const action of actions) {
                if (!action?.id) continue;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `header-control icon blacksmith-window-tool-header-action ${action.icon || 'fa-solid fa-circle'}`;
                button.dataset.toolAction = String(action.id);
                button.dataset.tooltip = game.i18n.localize(action.label || String(action.id));
                button.setAttribute('aria-label', button.dataset.tooltip);
                button.setAttribute('aria-pressed', String(Boolean(action.active)));
                button.classList.toggle('is-active', Boolean(action.active));
                button.disabled = Boolean(action.disabled);
                if (typeof action.onClick === 'function') {
                    button.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        action.onClick.call(this, event, action);
                    });
                }
                header.insertBefore(button, controlsToggle);
            }
        }

        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = `header-control icon fa-solid ${
            this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO
                ? 'fa-dot'
                : 'fa-ellipsis-vertical'
        } blacksmith-window-tool-menu-trigger`;
        menuButton.dataset.tooltip = game.i18n.localize('coffee-pub-blacksmith.ToolWindowMenu');
        menuButton.setAttribute('aria-label', menuButton.dataset.tooltip);
        menuButton.addEventListener('click', (event) => this._showToolContextMenu(event));
        header.insertBefore(menuButton, header.querySelector('[data-action="close"]'));

        if (!header.dataset.blacksmithToolContextBound) {
            header.dataset.blacksmithToolContextBound = 'true';
            header.addEventListener('contextmenu', (event) => {
                this._showToolContextMenu(event);
            });
        }

        frame.classList.add('blacksmith-window-tool-has-menu');
    }

    _applyToolWindowModeClasses(frame) {
        if (!frame?.classList) return;
        frame.classList.add('blacksmith-window-tool');
        frame.classList.toggle(
            'blacksmith-window-tool-titlebar-full',
            this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.FULL
        );
        frame.classList.toggle(
            'blacksmith-window-tool-titlebar-micro',
            this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO
        );
        frame.classList.toggle(
            'blacksmith-window-tool-theme-light',
            this.toolTheme === BLACKSMITH_TOOL_THEMES.LIGHT
        );
        frame.classList.toggle(
            'blacksmith-window-tool-theme-dark',
            this.toolTheme === BLACKSMITH_TOOL_THEMES.DARK
        );
        frame.classList.toggle(
            'blacksmith-window-tool-theme-glass',
            this.toolTheme === BLACKSMITH_TOOL_THEMES.GLASS
        );
        frame.dataset.toolTitlebar = this.toolTitlebarMode;
        frame.dataset.toolTheme = this.toolTheme;
    }
}
