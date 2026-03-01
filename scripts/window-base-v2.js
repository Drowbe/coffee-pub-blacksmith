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
        const details = root?.querySelector?.('.blacksmith-window-template-details-content');
        return {
            body: body ? body.scrollTop : 0,
            details: details ? details.scrollTop : 0
        };
    }

    _restoreScrollPositions(saved) {
        if (!saved) return;
        const root = this._getRoot();
        const body = root?.querySelector?.('.blacksmith-window-template-body');
        const details = root?.querySelector?.('.blacksmith-window-template-details-content');
        if (body != null && saved.body != null) body.scrollTop = saved.body;
        if (details != null && saved.details != null) details.scrollTop = saved.details;
    }

    async render(force = false) {
        const scrolls = this._saveScrollPositions();
        const result = await super.render(force);
        requestAnimationFrame(() => this._restoreScrollPositions(scrolls));
        return result;
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
