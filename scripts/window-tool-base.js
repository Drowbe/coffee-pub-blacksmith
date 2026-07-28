// ==================================================================
// ===== LIGHTWEIGHT APPLICATION V2 TOOL WINDOW BASE =================
// ==================================================================
//
// Compact/persistent tool-palette presentation built on the same
// BlacksmithWindowBaseV2 lifecycle and public Window API.

import { BlacksmithWindowBaseV2 } from './window-base.js';

export const BLACKSMITH_WINDOW_STYLES = Object.freeze({
    STANDARD: 'standard',
    TOOL: 'tool'
});

export const BLACKSMITH_TOOL_TITLEBARS = Object.freeze({
    FULL: 'full',
    MICRO: 'micro'
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
            allowTitlebarModeToggle: true,
            rememberTitlebarMode: true,
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
        this._loadToolTitlebarPreference();
    }

    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);
        context.appId ??= this.id;
        context.windowStyle = BLACKSMITH_WINDOW_STYLES.TOOL;
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

    get _toolTitlebarPreferenceKey() {
        return this.options?.toolTitlebarPreferenceKey || `${this._positionKey}-titlebar`;
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

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        // Application V2 only rebuilds its controls dropdown when a window update
        // is requested. Tool actions and title-bar modes may change at runtime.
        options.window ??= {};
    }

    _getHeaderControls() {
        const controls = super._getHeaderControls?.() ?? [];
        const modeToggleControl = this.options?.allowTitlebarModeToggle === false
            ? []
            : [{
                action: 'blacksmith-tool-toggle-titlebar',
                icon: this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO
                    ? 'fa-solid fa-window-maximize'
                    : 'fa-solid fa-grip-lines',
                label: this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO
                    ? 'coffee-pub-blacksmith.ToolWindowUseFullTitlebar'
                    : 'coffee-pub-blacksmith.ToolWindowUseMicroTitlebar',
                onClick: () => this.setToolTitlebarMode(
                    this.toolTitlebarMode === BLACKSMITH_TOOL_TITLEBARS.MICRO
                        ? BLACKSMITH_TOOL_TITLEBARS.FULL
                        : BLACKSMITH_TOOL_TITLEBARS.MICRO
                )
            }];

        if (this.toolTitlebarMode !== BLACKSMITH_TOOL_TITLEBARS.MICRO) {
            return [...controls, ...modeToggleControl];
        }

        const toolActions = (this.getToolHeaderActions?.() ?? [])
            .filter((action) => action?.id && !action.disabled)
            .map((action) => {
                const localizedLabel = game.i18n.localize(action.label || String(action.id));
                return {
                    action: `blacksmith-tool-${String(action.id)}`,
                    icon: action.icon || 'fa-solid fa-circle',
                    label: action.active ? `✓ ${localizedLabel}` : localizedLabel,
                    visible: true,
                    onClick: (event) => action.onClick?.call(this, event, action)
                };
            });

        const minimizeControl = this.options?.window?.minimizable === false
            ? []
            : [{
                action: 'blacksmith-tool-minimize',
                icon: this.minimized ? 'fa-solid fa-window-restore' : 'fa-solid fa-window-minimize',
                label: this.minimized
                    ? 'coffee-pub-blacksmith.ToolWindowRestore'
                    : 'coffee-pub-blacksmith.ToolWindowMinimize',
                onClick: async () => {
                    if (this.minimized) await this.maximize();
                    else await this.minimize();
                    await this.render(false);
                }
            }];

        return [
            ...toolActions,
            ...controls,
            ...modeToggleControl,
            ...minimizeControl,
            {
                action: 'blacksmith-tool-reset-position',
                icon: 'fa-solid fa-arrows-to-dot',
                label: 'coffee-pub-blacksmith.ToolWindowResetPosition',
                onClick: () => this.resetToolWindowPosition()
            },
            {
                action: 'blacksmith-tool-close',
                icon: 'fa-solid fa-xmark',
                label: 'APPLICATION.TOOLS.Close',
                onClick: () => this.close()
            }
        ];
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
        header.querySelectorAll('.blacksmith-window-tool-header-action').forEach((element) => element.remove());

        const actions = this.getToolHeaderActions?.() ?? [];
        const controlsToggle = header.querySelector('[data-action="toggleControls"]');
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

        if (!header.dataset.blacksmithToolContextBound) {
            header.dataset.blacksmithToolContextBound = 'true';
            header.addEventListener('contextmenu', (event) => {
                if (this.toolTitlebarMode !== BLACKSMITH_TOOL_TITLEBARS.MICRO) return;
                event.preventDefault();
                event.stopPropagation();
                this.bringToFront();
                void this.toggleControls(true);
            });
        }

        // Inspect the rendered dropdown so controls contributed by Foundry hooks or
        // other modules count too, not only controls returned by this application.
        const hasDropdownControls = Boolean(
            frame.querySelector('.controls-dropdown')?.children?.length
        );
        frame.classList.toggle('blacksmith-window-tool-has-menu', hasDropdownControls);
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
        frame.dataset.toolTitlebar = this.toolTitlebarMode;
    }
}
