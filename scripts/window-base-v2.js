// ==================================================================
// ===== APPLICATION V2 WINDOW BASE ===================================
// ==================================================================
//
// Base class for Blacksmith Application V2 windows (zone contract).
// Provides: _getRoot(), scroll save/restore, optional delegation ref.
// Subclasses set PARTS, getData(), ROOT_CLASS, and optionally ACTION_HANDLERS.
// See documentation/applicationv2-window/guidance-applicationv2.md
//

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BlacksmithWindowBaseV2 extends HandlebarsApplicationMixin(ApplicationV2) {
    /** Override in subclass: CSS class on the template root. Default matches window-template.hbs. */
    static ROOT_CLASS = 'blacksmith-window-template-root';

    /** Subclass sets: { actionName: staticMethod }. Used by _attachDelegationOnce for data-action routing */
    static ACTION_HANDLERS = null;

    /** Per-class ref for static action callbacks. Set in _attachDelegationOnce. */
    static _ref = null;

    /** Per-class: avoid attaching document listener more than once */
    static _delegationAttached = false;

    _getRoot() {
        const byId = document.getElementById(this.id);
        if (byId) return byId;
        const rootClass = this.constructor.ROOT_CLASS;
        return document.querySelector(`.${rootClass}`) ?? this.element ?? null;
    }

    async _prepareContext(options = {}) {
        const base = await super._prepareContext?.(options) ?? {};
        const data = await this.getData(options);
        const merged = foundry.utils.mergeObject(base, data);
        // Default zone visibility to true so template shows option bar, header, action bar when not specified
        if (merged.showOptionBar === undefined) merged.showOptionBar = true;
        if (merged.showHeader === undefined) merged.showHeader = true;
        if (merged.showTools === undefined) merged.showTools = true;
        if (merged.showActionBar === undefined) merged.showActionBar = true;
        return merged;
    }

    _saveScrollPositions() {
        const root = this._getRoot();
        const body = root?.querySelector?.('.blacksmith-window-template-body');
        return {
            body: body ? body.scrollTop : 0
        };
    }

    _restoreScrollPositions(saved) {
        if (!saved) return;
        const root = this._getRoot();
        const body = root?.querySelector?.('.blacksmith-window-template-body');
        if (body != null && saved.body != null) body.scrollTop = saved.body;
    }

    async render(force = false) {
        const scrolls = this._saveScrollPositions();
        const result = await super.render(force);
        requestAnimationFrame(() => {
            this._restoreScrollPositions(scrolls);
            this._applyWindowSizeConstraints();
        });
        return result;
    }

    /**
     * Apply optional min/max size from options.windowSizeConstraints to the window element.
     * Subclasses can pass windowSizeConstraints: { minWidth, minHeight, maxWidth, maxHeight } in DEFAULT_OPTIONS or constructor options.
     * (Do not put min/max on position — Foundry's position object is not extensible.)
     */
    _applyWindowSizeConstraints() {
        const constraints = this.options?.windowSizeConstraints ?? {};
        const win = this.element?.closest?.('.window') ?? document.getElementById(this.id)?.closest?.('.window');
        if (!win || typeof win.style === 'undefined') return;
        const apply = (key, styleKey) => {
            const v = constraints[key];
            if (v != null && v !== '') win.style[styleKey] = typeof v === 'number' ? `${v}px` : v;
        };
        apply('minWidth', 'minWidth');
        apply('minHeight', 'minHeight');
        apply('maxWidth', 'maxWidth');
        apply('maxHeight', 'maxHeight');
    }

    _attachDelegationOnce() {
        this.constructor._ref = this;
        const Ctor = this.constructor;
        if (Ctor._delegationAttached) return;
        Ctor._delegationAttached = true;
        const handlers = Ctor.ACTION_HANDLERS;
        if (!handlers || typeof handlers !== 'object') return;
        document.addEventListener('click', (e) => {
            const w = Ctor._ref;
            if (!w) return;
            const root = w._getRoot();
            const inRoot = root?.contains?.(e.target);
            const inApp = w.element?.contains?.(e.target);
            if (!inRoot && !inApp) return;
            const btn = e.target.closest?.('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const fn = handlers[action];
            if (typeof fn === 'function') {
                e.preventDefault?.();
                fn(e, btn);
            }
        }, true);
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
