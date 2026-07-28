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

        frame.classList.add('blacksmith-window-tool');
        header.querySelectorAll('.blacksmith-window-tool-header-action').forEach((element) => element.remove());

        const actions = this.getToolHeaderActions?.() ?? [];
        const controlsToggle = header.querySelector('[data-action="toggleControls"]');
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

        // Inspect the rendered dropdown so controls contributed by Foundry hooks or
        // other modules count too, not only controls returned by this application.
        const hasDropdownControls = Boolean(
            frame.querySelector('.controls-dropdown')?.children?.length
        );
        frame.classList.toggle('blacksmith-window-tool-has-menu', hasDropdownControls);
    }
}
