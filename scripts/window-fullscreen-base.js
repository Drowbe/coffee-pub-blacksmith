// ==================================================================
// ===== FULLSCREEN WINDOW BASE (window-fullscreen-base.js) =========
// ==================================================================
//
// A viewport-covering, blocking presentation surface: handouts, cutscenes,
// reveals, and anything else that should take the table's whole attention.
//
// Built on the same BlacksmithWindowBaseV2 lifecycle as the standard and tool
// presentations, so ACTION_HANDLERS delegation, scroll save/restore, and the
// window registry all behave identically. What differs is everything the frame
// would have decided: this window is frameless and unpositioned, and CSS owns
// its geometry.

import { BlacksmithWindowBaseV2 } from './window-base.js';
import { BLACKSMITH_WINDOW_STYLES } from './window-styles.js';
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * The closed set of layouts. Implemented entirely in styles/window-fullscreen.css,
 * selected by `data-layout` on the template root.
 *
 * Deliberately four, and deliberately not extensible: a consumer wanting something
 * else owns it inside bodyContent. Blacksmith is not the suite's layout engine.
 */
export const BLACKSMITH_FULLSCREEN_LAYOUTS = Object.freeze({
    /** Panel centred, width-capped, body scrolls. The default. */
    CENTERED: 'centered',
    /** Full-width horizontal band, vertically centred. The cinematic shape. */
    BAR: 'bar',
    /** Two equal columns; the body's two children are the columns. */
    SPLIT: 'split',
    /** Panel fills the viewport edge to edge; the consumer owns everything. */
    FULL: 'full'
});

/** Background sizing for a backdrop image. */
export const BLACKSMITH_FULLSCREEN_FITS = Object.freeze({
    COVER: 'cover',
    CONTAIN: 'contain',
    TILE: 'tile'
});

const ROOT_SELECTOR = '.blacksmith-window-fullscreen-root';
const CLOSE_ACTION = 'blacksmith-fullscreen-close';
const OPEN_CLASS = 'blacksmith-window-fullscreen-open';

/**
 * Turn a caller-supplied path into a CSS `url()` that resolves where the caller meant.
 *
 * Two things happen here, and both are the base's job rather than the consumer's.
 *
 * **The path is made root-absolute.** A consumer hands over a Foundry path -- the
 * `modules/my-module/images/thing.webp` that every Foundry API takes -- because that is
 * what a consumer has. A relative `url()` inside a custom property is not resolved against
 * the document: it is resolved against the stylesheet that the `var()` is written in, which
 * is `styles/window-fullscreen.css`. So `modules/x/y.webp` was fetched from
 * `modules/coffee-pub-blacksmith/styles/modules/x/y.webp` and 404'd. Routing it through
 * `getRoute` fixes the base and picks up a server ROUTE_PREFIX at the same time, which a
 * hand-written leading slash would not. A value that is already absolute, or that carries a
 * scheme or is protocol-relative, is left alone.
 *
 * **The value is made safe to interpolate.** It reaches CSS rather than HTML, so the risk is
 * not script injection -- it is escaping the quoted `url("...")` and turning the rest of the
 * string into declarations of its own. Only three things can do that from inside the quotes:
 * a double quote, a backslash escaping one, and a newline. Parens, semicolons, and commas are
 * inert there, and stripping them corrupts a perfectly valid `data:` URI -- which is why this
 * takes out exactly the three rather than everything that looks like punctuation.
 *
 * @param {string} value
 * @returns {string|null}
 */
function cssUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const safe = trimmed.replace(/["\\\r\n]/g, '');
    if (!safe) return null;

    const alreadyResolvable = /^[a-z][a-z0-9+.-]*:/i.test(safe) // http:, https:, data:
        || safe.startsWith('//')                                 // protocol-relative
        || safe.startsWith('/');                                 // already root-absolute
    const path = alreadyResolvable ? safe : foundry.utils.getRoute(safe);

    return `url("${path}")`;
}

export class BlacksmithFullscreenWindowBaseV2 extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-fullscreen-root';
    static WINDOW_STYLE = BLACKSMITH_WINDOW_STYLES.FULLSCREEN;

    /**
     * No option bar: it is a filter strip for editor windows and has no meaning over a
     * cutscene. Tools and the action bar stay off until a consumer asks for them, because
     * the common case here is a header and a body and nothing else.
     */
    static ZONE_DEFAULTS = {
        showHeader: true,
        showTools: false,
        showActionBar: false
    };

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-blacksmith/templates/window-fullscreen-template.hbs'
        }
    };

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            tag: 'div',
            classes: ['blacksmith-window-fullscreen'],
            window: {
                // frame:false hands us a bare element and, as a side effect, keeps Foundry from
                // ever writing an inline z-index (bringToFront early-returns without a frame),
                // which is what lets the stylesheet pin the stacking with no !important.
                frame: false,
                // positioned:false makes setPosition a no-op, so no inline geometry fights the CSS.
                positioned: false,
                resizable: false,
                minimizable: false
            },
            // Nothing to remember: the position is the viewport.
            rememberPosition: false,
            fullscreenLayout: BLACKSMITH_FULLSCREEN_LAYOUTS.CENTERED,
            fullscreenBackdrop: {},
            showCloseButton: true,
            dismissOnEscape: true,
            dismissOnBackdrop: false,
            fullscreenTransitionMs: 220
        }
    );

    // ==============================================================
    // ===== ONE AT A TIME ==========================================
    // ==============================================================
    //
    // Shared across every subclass, unlike the tool base's per-subclass registry.
    // Two viewport-covering surfaces stacked is not a layout, it is a lost window:
    // the second hides the first completely and nothing can reach it again.

    /** @type {BlacksmithFullscreenWindowBaseV2|null} */
    static #current = null;

    /** The fullscreen window currently open on this client, or null. */
    static get current() {
        return BlacksmithFullscreenWindowBaseV2.#current;
    }

    /** Close whatever fullscreen window is open, if any. */
    static async closeCurrent(options = {}) {
        const current = BlacksmithFullscreenWindowBaseV2.#current;
        if (current) await current.close(options);
    }

    // ==============================================================
    // ===== RENDER CONTEXT =========================================
    // ==============================================================

    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);
        context.appId ??= this.id;
        context.windowStyle = BLACKSMITH_WINDOW_STYLES.FULLSCREEN;
        context.fullscreenLayout = this.fullscreenLayout;
        context.showCloseButton = this.options?.showCloseButton !== false;
        context.closeLabel = game.i18n?.localize?.('APPLICATION.TOOLS.Close') ?? 'Close';
        return context;
    }

    /** The resolved layout, falling back to `centered` for an unknown value. */
    get fullscreenLayout() {
        const requested = this.options?.fullscreenLayout;
        return Object.values(BLACKSMITH_FULLSCREEN_LAYOUTS).includes(requested)
            ? requested
            : BLACKSMITH_FULLSCREEN_LAYOUTS.CENTERED;
    }

    /**
     * Backdrop appearance, as the consumer asked for it.
     * @returns {{image?: string, color?: string, opacity?: number, blur?: number, fit?: string, position?: string}}
     */
    get fullscreenBackdrop() {
        const backdrop = this.options?.fullscreenBackdrop;
        return (backdrop && typeof backdrop === 'object') ? backdrop : {};
    }

    // ==============================================================
    // ===== PRESENTATION ===========================================
    // ==============================================================

    /**
     * Publish the backdrop options as custom properties on the window element.
     *
     * They are properties rather than inline `background` declarations for the same
     * reason the standard base publishes its size constraints that way: a consumer
     * stylesheet can then override one of them with ordinary specificity, and the
     * shell keeps a single expression of each value.
     *
     * The image sits on its own layer inside the template, not on this element, so
     * `opacity` dims the image alone -- put it here and it would fade the content
     * with it, which is the whole reason a translucent image over a colour wash is
     * impossible to express any other way.
     */
    _applyFullscreenBackdrop() {
        const element = this.element;
        if (!element?.style) return;

        const { image, color, opacity, blur, imageBlur, fit, position } = this.fullscreenBackdrop;
        const set = (property, value) => {
            if (value == null || value === '') element.style.removeProperty(property);
            else element.style.setProperty(property, value);
        };

        set('--blacksmith-fullscreen-backdrop-image', cssUrl(image));
        set('--blacksmith-fullscreen-backdrop-color', color);
        set('--blacksmith-fullscreen-backdrop-opacity',
            Number.isFinite(opacity) ? String(Math.min(1, Math.max(0, opacity))) : null);
        // Two different blurs, and they are not interchangeable. `blur` is a backdrop-filter
        // on the surface, so it softens the table showing through from behind. `imageBlur`
        // is a filter on the image layer itself, which is what turns a detailed background
        // image into a texture that content stays readable over.
        set('--blacksmith-fullscreen-backdrop-blur',
            Number.isFinite(blur) ? `${blur}px` : (typeof blur === 'string' ? blur : null));
        set('--blacksmith-fullscreen-backdrop-image-filter',
            Number.isFinite(imageBlur) ? `blur(${imageBlur}px)`
                : (typeof imageBlur === 'string' ? `blur(${imageBlur})` : null));
        set('--blacksmith-fullscreen-backdrop-size',
            fit === BLACKSMITH_FULLSCREEN_FITS.TILE ? 'auto'
                : fit === BLACKSMITH_FULLSCREEN_FITS.CONTAIN ? 'contain'
                    : fit === BLACKSMITH_FULLSCREEN_FITS.COVER ? 'cover' : null);
        set('--blacksmith-fullscreen-backdrop-repeat',
            fit === BLACKSMITH_FULLSCREEN_FITS.TILE ? 'repeat' : null);
        set('--blacksmith-fullscreen-backdrop-position', position);
    }

    /**
     * Size constraints are a windowed-frame concern and this window has no frame.
     * Overridden to a no-op rather than left inherited so the element does not pick
     * up the `blacksmith-window` marker class, which window-common.css keys off for
     * minimise behaviour that cannot happen here.
     */
    _applyWindowSizeConstraints() {}

    _saveScrollPositions() {
        const body = this.element?.querySelector?.('.blacksmith-window-fullscreen-body');
        return { body: body?.scrollTop ?? 0 };
    }

    _restoreScrollPositions(saved) {
        const body = this.element?.querySelector?.('.blacksmith-window-fullscreen-body');
        if (body && saved?.body != null) body.scrollTop = saved.body;
    }

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    async _preFirstRender(context, options) {
        await super._preFirstRender?.(context, options);
        const current = BlacksmithFullscreenWindowBaseV2.#current;
        if (current && current !== this) {
            try {
                await current.close();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME,
                    'Fullscreen window: the open surface refused to close; replacing it anyway',
                    error, false, false);
            }
        }
        BlacksmithFullscreenWindowBaseV2.#current = this;
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender?.(context, options);
        const element = this.element;
        if (!element) return;

        // Set here as well as in DEFAULT_OPTIONS.classes, because mergeObject overwrites
        // arrays rather than concatenating: any subclass declaring its own `classes` drops
        // the base's, and this class is the entire shell. Foundry also skips its own
        // `application` class for a frameless app (application.mjs:407), so this marker is
        // the only hook the stylesheet has.
        element.classList.add('blacksmith-window-fullscreen');

        element.setAttribute('role', 'dialog');
        element.setAttribute('aria-modal', 'true');

        // Bound on the element, which survives part re-renders (with no frame the element
        // IS the content container, and _replaceHTML only swaps its children).
        element.addEventListener('click', this.#onFullscreenClick);

        if (this.options?.dismissOnEscape !== false) {
            // Capture phase, and swallowed. Without a frame this window never becomes
            // ui.activeWindow, so Foundry's own dismiss chain will not reach it -- and
            // letting the keypress continue would dismiss whatever is behind the surface
            // instead, which the user cannot see.
            document.addEventListener('keydown', this.#onFullscreenKeyDown, true);
        }

        // One frame later, so the browser has a pre-transition state to animate from.
        requestAnimationFrame(() => this.element?.classList.add(OPEN_CLASS));
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._applyFullscreenBackdrop();
    }

    /**
     * Close without Foundry's own closing animation.
     *
     * That animation is built for a window frame: it stamps the measured width and height
     * onto the element as inline position, then collapses it with `max-height: 0`, which on
     * a `position: fixed; inset: 0` surface is a snap to nothing rather than a fade -- and
     * the inline geometry is exactly what `positioned: false` exists to keep off this
     * element. The fade this window does want is its own, and it has already run in
     * `_preClose` by the time the frame animation would start.
     */
    async close(options = {}) {
        return super.close({ ...options, animate: false });
    }

    async _preClose(options) {
        const element = this.element;
        const ms = Number(this.options?.fullscreenTransitionMs);
        if (element && Number.isFinite(ms) && ms > 0) {
            element.classList.remove(OPEN_CLASS);
            await new Promise((resolve) => setTimeout(resolve, ms));
        }
        return super._preClose?.(options);
    }

    /**
     * The click listener needs no removal: `_tearDown` has already detached and dropped the
     * element by the time this runs, so the listener goes with it. The keydown listener is
     * on `document` and does not, which is the whole reason this override exists.
     */
    _onClose(options) {
        document.removeEventListener('keydown', this.#onFullscreenKeyDown, true);
        if (BlacksmithFullscreenWindowBaseV2.#current === this) {
            BlacksmithFullscreenWindowBaseV2.#current = null;
        }
        return super._onClose?.(options);
    }

    // ==============================================================
    // ===== DISMISSAL ==============================================
    // ==============================================================

    /**
     * The viewer asked for this window to go away -- Escape, the close control, or a
     * backdrop click. Override to do something other than close it.
     *
     * This is deliberately distinct from `close()`, which is every other route: a timer, a
     * socket, a consumer's own code. A window that needs to broadcast, confirm, or save on
     * the way out almost always means "when the *viewer* dismissed it" and not "whenever
     * this window closes", and hooking `close()` for it fires on the programmatic paths too.
     * Request a Roll's cinematic is the case in point -- a GM dismissing it ends it for the
     * table, while the same window closing because the rolls finished must not broadcast,
     * since every client reaches that point independently.
     *
     * @param {'escape'|'close-button'|'backdrop'} reason
     * @returns {Promise<void>}
     */
    async onDismiss(reason) {
        await this.close();
    }

    // Arrow-function fields, so add/removeEventListener see one identity per instance.

    #onFullscreenKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        if (!this.rendered) return;
        if (BlacksmithFullscreenWindowBaseV2.#current !== this) return;
        event.preventDefault();
        event.stopPropagation();
        this.onDismiss('escape');
    };

    #onFullscreenClick = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        if (target.closest(`[data-action="${CLOSE_ACTION}"]`)) {
            event.preventDefault();
            event.stopPropagation();
            this.onDismiss('close-button');
            return;
        }

        if (this.options?.dismissOnBackdrop !== true) return;
        // Only a click that landed on the surface itself, never one that bubbled out of
        // the panel -- otherwise every click inside the content closes the window.
        const root = this.element?.querySelector?.(ROOT_SELECTOR);
        const onBackdrop = target === this.element
            || target === root
            || target.classList?.contains?.('blacksmith-window-fullscreen-backdrop');
        if (onBackdrop) this.onDismiss('backdrop');
    };
}
