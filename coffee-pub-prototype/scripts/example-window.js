/**
 * Minimal Application V2 window - plug-in framework based on the Skills window pattern.
 * Copy this file and the template (example-window.hbs) into your module. Update:
 * - MODULE_ID / template path in PARTS
 * - Window title and classes
 * - getData() and your actions
 * - CSS (see guidance-applicationv2.md §6.3 or styles/window-skills.css)
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const EXAMPLE_APP_ID = 'example-module-window';
let _exampleWindowRef = null;
let _exampleDelegationAttached = false;

export class ExampleModuleWindow extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: EXAMPLE_APP_ID,
            classes: ['example-module-window'],
            position: { width: 900, height: 600 },
            window: { title: 'Example Window', resizable: true, minimizable: true },
            actions: {
                reset: ExampleModuleWindow._actionReset,
                apply: ExampleModuleWindow._actionApply
            }
        }
    );

    static PARTS = {
        body: {
            template: 'modules/your-module-id/templates/example-module-window.hbs'
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${EXAMPLE_APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        super(opts);
    }

    _getRoot() {
        const byId = document.getElementById(this.id);
        if (byId) return byId;
        return document.querySelector('.example-window-root') ?? this.element ?? null;
    }

    async _prepareContext(options = {}) {
        const base = await super._prepareContext?.(options) ?? {};
        return foundry.utils.mergeObject(base, await this.getData(options));
    }

    async getData(options = {}) {
        return {
            appId: this.id,
            windowTitle: 'Example Window',
            subtitle: 'Subtitle or context'
        };
    }

    _saveScrollPositions() {
        const root = this._getRoot();
        const body = root?.querySelector?.('.example-window-body');
        const details = root?.querySelector?.('.example-window-details-content');
        return {
            body: body ? body.scrollTop : 0,
            details: details ? details.scrollTop : 0
        };
    }

    _restoreScrollPositions(saved) {
        if (!saved) return;
        const root = this._getRoot();
        const body = root?.querySelector?.('.example-window-body');
        const details = root?.querySelector?.('.example-window-details-content');
        if (body && saved.body) body.scrollTop = saved.body;
        if (details && saved.details) details.scrollTop = saved.details;
    }

    async render(force = false) {
        const scrolls = this._saveScrollPositions();
        const result = await super.render(force);
        requestAnimationFrame(() => this._restoreScrollPositions(scrolls));
        return result;
    }

    _attachDelegationOnce() {
        _exampleWindowRef = this;
        if (_exampleDelegationAttached) return;
        _exampleDelegationAttached = true;

        document.addEventListener('click', (e) => {
            const w = _exampleWindowRef;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;

            const resetBtn = e.target?.closest?.('[data-action="reset"]');
            if (resetBtn) {
                e.preventDefault?.();
                ExampleModuleWindow._actionReset(e, resetBtn);
                return;
            }
            const applyBtn = e.target?.closest?.('[data-action="apply"]');
            if (applyBtn) {
                e.preventDefault?.();
                ExampleModuleWindow._actionApply(e, applyBtn);
                return;
            }
        });
    }

    static _actionReset(event, target) {
        const w = _exampleWindowRef;
        if (!w) return;
        event?.preventDefault?.();
        w.render();
    }

    static _actionApply(event, target) {
        const w = _exampleWindowRef;
        if (!w) return;
        event?.preventDefault?.();
        w.render();
    }

    async _onFirstRender(_context, options) {
        await super._onFirstRender?.(_context, options);
        this._attachDelegationOnce();
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._attachDelegationOnce();
    }
}
