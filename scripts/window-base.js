// ==================================================================
// ===== APPLICATION V2 WINDOW BASE (window-base.js) ==================
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

    /**
     * Subclass sets: { actionName: handler }. Handlers are invoked as
     * handler(event, target, instance) with `this` bound to the instance, so a
     * window with two instances open routes each click to the right one.
     */
    static ACTION_HANDLERS = null;

    /**
     * Per-class reference to the most recently rendered instance.
     *
     * DEPRECATED — kept only so consumers whose handlers still read
     * `MyWindow._ref` keep working while they migrate to the instance argument.
     * It is wrong by construction with two instances open: it points at
     * whichever rendered last. Read the third handler argument (or `this`)
     * instead. See known-issues.md under Windows.
     */
    static _ref = null;

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
     *
     * Published as CSS custom properties, never as inline min-width/min-height,
     * and paired with a `blacksmith-window` marker class that window-common.css
     * keys off.
     *
     * Inline minima cannot be minimised away. Foundry's `minimize()` collapses a
     * frame by setting inline `max-height: var(--header-height)`
     * (client/applications/api/application.mjs), and CSS resolves min-height
     * over max-height when they conflict — per spec, not a quirk. With both
     * declarations inline, the minimum wins and the frame stays at full size
     * with its content hidden: a title bar on top of an empty rectangle. Nothing
     * clears it either, since `maximize()` only clears the maxima it set itself.
     *
     * Custom properties move the minima into the cascade, where the stylesheet
     * can zero them for `.minimized` and `.minimizing` with ordinary specificity
     * — no JS bookkeeping, no minimise/maximise hooks, and no `!important` in
     * any consumer. The maxima ride the same mechanism deliberately: expressing
     * one thing two ways is how the original inline write became invisible.
     *
     * The marker class is added here rather than through DEFAULT_OPTIONS.classes
     * because `mergeObject` overwrites arrays instead of concatenating, so a
     * class declared on a base is silently dropped by any subclass that declares
     * its own — window-tool-base.js does exactly that. Setting it alongside the
     * properties also keeps the two from drifting apart.
     */
    _applyWindowSizeConstraints() {
        const constraints = this.options?.windowSizeConstraints ?? {};
        const element = this.element ?? document.getElementById(this.id);
        const win = element?.matches?.('.window, .application')
            ? element
            : element?.closest?.('.window, .application');
        if (!win || typeof win.style === 'undefined') return;

        win.classList.add('blacksmith-window');

        const apply = (key, property) => {
            const v = constraints[key];
            if (v == null || v === '') {
                win.style.removeProperty(property);
                return;
            }
            win.style.setProperty(property, typeof v === 'number' ? `${v}px` : v);
        };
        apply('minWidth', '--blacksmith-window-min-width');
        apply('minHeight', '--blacksmith-window-min-height');
        apply('maxWidth', '--blacksmith-window-max-width');
        apply('maxHeight', '--blacksmith-window-max-height');
    }

    // ---- Position / size persistence ----------------------------------------

    get _positionKey() {
        return this.options?.windowPositionKey || `blacksmith-win-pos-${this.constructor.name}`;
    }

    /**
     * Move a window's stored presentation from an old localStorage key to a new one, once.
     *
     * Position, titlebar mode, and tool theme all hang off `windowPositionKey` (see `_positionKey`
     * and the two preference getters in window-tool-base.js), so a window that changes its key --
     * which is what happens when a tool moves between modules -- silently resets all three. This
     * moves the three keys and deletes the originals, so it is a no-op on every load after the
     * first.
     *
     * Static because it must run before the window is ever constructed: the position is read
     * during the first render.
     *
     * @param {string} oldKey
     * @param {string} newKey
     * @returns {boolean} whether anything was moved
     */
    static migratePositionKey(oldKey, newKey) {
        if (!oldKey || !newKey || oldKey === newKey) return false;
        let moved = false;
        // The base key plus the two derived preference keys. Adding a fourth derived key to
        // window-tool-base.js means adding its suffix here.
        for (const suffix of ['', '-titlebar', '-theme']) {
            try {
                const from = `${oldKey}${suffix}`;
                const value = localStorage.getItem(from);
                if (value === null) continue;
                const to = `${newKey}${suffix}`;
                // Never clobber a value the user already produced under the new key.
                if (localStorage.getItem(to) === null) {
                    localStorage.setItem(to, value);
                    moved = true;
                }
                localStorage.removeItem(from);
            } catch (_) {}
        }
        return moved;
    }

    _saveWindowPosition() {
        if (this.options?.rememberPosition === false) return;
        try {
            const pos = this.position;
            if (!pos || pos.left == null) return;
            localStorage.setItem(this._positionKey, JSON.stringify({
                left: pos.left, top: pos.top, width: pos.width, height: pos.height
            }));
        } catch (_) {}
    }

    _loadWindowPosition() {
        if (this.options?.rememberPosition === false) return null;
        try {
            const raw = localStorage.getItem(this._positionKey);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    setPosition(position = {}) {
        const result = super.setPosition(position);
        clearTimeout(this._positionSaveTimer);
        this._positionSaveTimer = setTimeout(() => this._saveWindowPosition(), 250);
        return result;
    }

    // -------------------------------------------------------------------------

    /**
     * Bind `data-action` routing for this instance.
     *
     * Per instance, on `this.element` — not one listener per class on `document`.
     * The frame is created before parts render and survives part re-renders, so a
     * listener here still catches late-injected body content, which was the only
     * reason document-level delegation was used. Binding per instance also means
     * two open instances of one class cannot steal each other's clicks, and the
     * listener dies with the element instead of leaking for the session.
     */
    _attachDelegationOnce() {
        // Deprecated compatibility shim; see the _ref docblock above.
        this.constructor._ref = this;
        const handlers = this.constructor.ACTION_HANDLERS;
        if (!handlers || typeof handlers !== 'object') return;
        const root = this.element;
        if (!root) return;
        // Track the element rather than a boolean: the frame is expected to
        // persist across part re-renders, but if it is ever replaced we must
        // rebind rather than silently lose every action.
        if (this._delegationBoundTo === root) return;
        this._delegationBoundTo = root;
        root.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-action]');
            if (!btn || !root.contains(btn)) return;
            const fn = handlers[btn.dataset.action];
            if (typeof fn !== 'function') return;
            e.preventDefault?.();
            fn.call(this, e, btn, this);
        }, true);
    }

    async _onFirstRender(_context, options) {
        await super._onFirstRender?.(_context, options);
        this._attachDelegationOnce();
        const saved = this._loadWindowPosition();
        if (saved) {
            requestAnimationFrame(() => this.setPosition(saved));
        }
    }

    _onClose(options) {
        clearTimeout(this._positionSaveTimer);
        this._positionSaveTimer = null;
        // The click listener dies with the frame element; drop our reference to
        // it so a reopened instance rebinds against the new frame.
        this._delegationBoundTo = null;
        if (this.constructor._ref === this) this.constructor._ref = null;
        return super._onClose?.(options);
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._attachDelegationOnce();
    }
}
