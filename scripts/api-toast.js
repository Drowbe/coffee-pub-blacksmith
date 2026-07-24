// ==================================================================
// ===== API-TOAST.JS ===============================================
// ==================================================================
// Local, per-client toast primitive — Phase 1 of the player-facing
// toast system. Rendering only: no sockets, no cross-client delivery.
// A consumer whose event already reached this client (its own socket,
// a setting sync, a document hook) calls show() receipt-side.
//
// Toasts are DOM-direct: no Handlebars template, no re-render cycle,
// no structure fingerprint — each toast element is built once and
// removed once. See documentation/architecture/architecture-toast.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, getSettingSafely } from './api-core.js';

/**
 * True when a user is listed in the world setting `toastExcludedUsers` — a
 * comma-separated list of Foundry user names (case-insensitive) whose clients
 * never render toasts, e.g. a camera/stream account that cannot click a toast
 * closed. show() checks the current user, making the exclusion receipt-side:
 * it covers local shows, broadcastToast relays, and targeted sends alike.
 * @param {User} user - The user to test (default: the current user)
 * @returns {boolean}
 */
export function isToastExcludedUser(user = game.user) {
    const raw = getSettingSafely(MODULE.ID, 'toastExcludedUsers', '');
    if (!user?.name || typeof raw !== 'string' || !raw.trim()) return false;
    return raw.split(',')
        .map(name => name.trim().toLowerCase())
        .filter(Boolean)
        .includes(user.name.toLowerCase());
}

class ToastManager {
    static toasts = new Map(); // toastId -> { id, moduleId, stackKey, persistent, color, size, onClick, onDismiss, timeoutId, element }
    static MAX_STACK = 5;      // applies to TRANSIENT toasts only — persistent (duration: 0) toasts are exempt
    static ANIMATION_MS = 400; // must match the transition duration in styles/toast.css
    // Class-only styling with two deliberate, sanitized inline exceptions
    // (author decision 2026-07-19 — the API takes parameters, not a closed style set):
    //   backgroundImage — encodeURI'd path in url("")
    //   color — strict-hex accent applied as a CSS custom property; drives the border
    //           and (via color-mix in toast.css) a tinted wash of the box background
    static COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    // Toast bodies are slightly translucent so the play area reads through them.
    // Keep in sync with the default background alpha in styles/toast.css.
    static BACKGROUND_ALPHA = 0.9;
    // Two display modes (author decision 2026-07-19): no size = a TOAST (content-fit,
    // stacks top-center); any size = a BILLBOARD (viewport-proportional box in BOTH
    // dimensions, typography scaling with it, centered, singleton, cap-exempt,
    // click-anywhere dismisses). 'fullscreen' is the 100%×100% billboard with a scrim.
    static SIZES = ['small', 'medium', 'large', 'fullscreen'];
    // Content animations — BILLBOARDS ONLY (author decision 2026-07-23): stacked
    // toasts fire from timers and announcements, and five toasts each doing their
    // own dance is noise; the expressive lane is the sized takeover. Pure CSS
    // keyframes on the content children (toast.css), entrance-only except pulse
    // (a subtle infinite breathe meant for persistent billboards), gated behind
    // prefers-reduced-motion. Applied as a class — same whitelist model as SIZES.
    static ANIMATIONS = ['pop', 'reveal', 'pulse', 'slam', 'shake'];
    // Publish surfaces: Foundry serves two player-facing views — the active
    // tabletop (/game) and the chat-only /stream capture page (typically
    // recorded by OBS). Toasts default to the tabletop.
    static PUBLISH = ['game', 'stream', 'both'];

    // ===== PUBLIC API =====

    /**
     * Show a toast on this client.
     * @param {Object} config
     * @param {string} config.title - Headline text (required)
     * @param {string} config.subtitle - Second line (optional)
     * @param {string} config.icon - FontAwesome icon class (ignored if image is set)
     * @param {string} config.image - Image path/URL, rendered as a round avatar (wins over icon)
     * @param {number} config.duration - Seconds before auto-dismiss; 0 = until closed (default: 8). Persistent (0) toasts are exempt from stack-cap eviction — only the close button, stackKey replacement, or programmatic removal ends them.
     * @param {string} config.color - Accent color as strict hex ('#rgb' or '#rrggbb'); drives the border, icon, and title (optional; anything else = default look)
     * @param {string} config.backgroundColor - Box background color as strict hex, independent of the accent (optional; default is the dark base; a backgroundImage covers it)
     * @param {string} config.size - Omit for a normal toast (content-fit, stacks top-center). 'small' | 'medium' | 'large' | 'fullscreen' render a BILLBOARD: a viewport-proportional box (both dimensions, typography scaling with it), centered on screen, one at a time (a new billboard replaces the current), exempt from the stack cap; with no onClick, clicking anywhere dismisses it
     * @param {string} config.backgroundImage - Image path/URL rendered as a cover background behind the toast content, with an automatic dark scrim for legibility (optional)
     * @param {string} config.sound - Optional audio path played locally when the toast appears
     * @param {string} config.moduleId - Owning module (default: "blacksmith-core")
     * @param {Function} config.onClick - Body click runs this, then the toast is removed (onDismiss does NOT fire)
     * @param {Function} config.onDismiss - Fires only when the toast goes away unacted-on: auto-timeout or the close button. Same contract as menubar notifications (see api-menubar.md). Never fires on replacement via stackKey, stack-cap eviction, programmatic remove(), or clearByModule().
     * @param {string} config.stackKey - Toasts stack by default; a new toast with the same stackKey replaces the old one in place
     * @param {string} config.publish - Which Foundry view renders the toast: 'game' (the active tabletop, default), 'stream' (the chat-only /stream capture view), or 'both'. Anything else falls back to 'game'. Checked receipt-side against game.view, so it covers every delivery path.
     * @param {string} config.animation - Content animation, BILLBOARDS ONLY (ignored without a size): 'pop' (scale in with a bounce), 'reveal' (staged icon/title/subtitle entrance), 'pulse' (subtle infinite breathe, meant for persistent billboards), 'slam' (smashes in from oversized with a jolt on impact — crit energy), or 'shake' (rattles in with a decaying wobble — fumble energy). Anything else, or no size, renders without animation. Respects prefers-reduced-motion.
     * @returns {string|null} - Toast ID for later removal, or null on error
     */
    static show({ title, subtitle = "", icon = null, image = null, backgroundImage = null, backgroundColor = null, sound = null, duration = 8, color = null, size = null, animation = null, moduleId = "blacksmith-core", onClick = null, onDismiss = null, stackKey = null, publish = 'game' } = {}) {
        try {
            if (!title) {
                postConsoleAndNotification(MODULE.NAME, "Toast: show() requires a title", "", false, false);
                return null;
            }

            // Publish surface: render only when this client's view is targeted.
            // game.view is "stream" on the /stream capture page, "game" on the
            // active tabletop; anything else counts as the tabletop.
            const validPublish = this.PUBLISH.includes(publish) ? publish : 'game';
            const currentView = game.view === 'stream' ? 'stream' : 'game';
            if (validPublish !== 'both' && validPublish !== currentView) {
                postConsoleAndNotification(MODULE.NAME, `Toast publish '${validPublish}' skips the ${currentView} view - suppressed`, "", true, false);
                return null;
            }

            // Excluded users never render toasts on the tabletop, whatever the
            // delivery path. The stream view is exempt: exclusion protects a
            // passive account from interactive noise on /game, while a
            // stream-targeted toast is a deliberate publish to the capture
            // surface — often logged in through that same account.
            if (currentView === 'game' && isToastExcludedUser()) {
                postConsoleAndNotification(MODULE.NAME, `Toast suppressed for excluded user: ${game.user?.name}`, "", true, false);
                return null;
            }

            // Same stackKey replaces in place. Supersession is not a dismissal — no onDismiss.
            if (stackKey) {
                for (const [id, toast] of this.toasts.entries()) {
                    if (toast.stackKey === stackKey) this._remove(id, { instant: true });
                }
            }

            const validColor = (typeof color === 'string' && this.COLOR_PATTERN.test(color)) ? color : null;
            const validBackgroundColor = (typeof backgroundColor === 'string' && this.COLOR_PATTERN.test(backgroundColor)) ? backgroundColor : null;
            const validSize = this.SIZES.includes(size) ? size : null;
            // Animations are billboard-only by design — no size, no animation.
            const validAnimation = (validSize && this.ANIMATIONS.includes(animation)) ? animation : null;
            const persistent = !(Number(duration) > 0);

            // Billboards are singletons: a second one replaces the first, whatever its size —
            // two simultaneous centered takeovers is meaningless. Replacement, not dismissal.
            if (validSize) {
                for (const [id, toast] of this.toasts.entries()) {
                    if (toast.size) this._remove(id, { instant: true });
                }
            }

            // Stack cap: evict the oldest TRANSIENT toast, silently. Persistent (duration: 0)
            // toasts don't count toward the cap and are never evicted — "until closed" means it.
            // Billboards live outside the stack entirely and are likewise exempt.
            // Eviction is not a dismissal — no onDismiss.
            let transientIds = [...this.toasts.values()].filter(t => !t.persistent && !t.size).map(t => t.id);
            while (transientIds.length >= this.MAX_STACK) {
                this._remove(transientIds.shift(), { instant: true });
            }

            const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Callbacks are safe to store: toasts are per-client and never cross the socket.
            const toast = {
                id: toastId,
                moduleId: moduleId,
                stackKey: stackKey,
                persistent: persistent,
                color: validColor,
                backgroundColor: validBackgroundColor,
                size: validSize,
                animation: validAnimation,
                onClick: typeof onClick === 'function' ? onClick : null,
                onDismiss: typeof onDismiss === 'function' ? onDismiss : null,
                timeoutId: null,
                element: null
            };

            toast.element = this._buildElement(toast, { title, subtitle, icon, image, backgroundImage });
            this.toasts.set(toastId, toast);
            // Billboards render inside a fixed full-viewport layer, outside the top-center
            // stack container — they are not stack entries. The layer (not the billboard)
            // guarantees fixed positioning, so a stale or missing stylesheet can never drop
            // a billboard into Foundry's body layout and shove the UI around.
            if (toast.size) {
                this._getBillboardLayer().appendChild(toast.element);
            } else {
                this._getContainer().appendChild(toast.element);
            }
            requestAnimationFrame(() => toast.element.classList.add('visible'));

            if (sound && sound !== 'sound-none') {
                void playSound(sound, window.COFFEEPUB?.SOUNDVOLUMENORMAL ?? 0.7, false, false);
            }

            if (duration > 0) {
                toast.timeoutId = setTimeout(() => {
                    this._dismiss(toastId);
                }, duration * 1000);
            }

            postConsoleAndNotification(MODULE.NAME, `Toast shown: ${title}`, "", true, false);
            return toastId;

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Toast: error in show()", error, false, false);
            return null;
        }
    }

    /**
     * Remove a toast programmatically. Silent — onDismiss does not fire.
     * @param {string} toastId - The toast ID to remove
     * @returns {boolean} - True if the toast existed and was removed
     */
    static remove(toastId) {
        try {
            return this._remove(toastId);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Toast: error in remove()", error, false, false);
            return false;
        }
    }

    /**
     * Remove all toasts belonging to a module. Silent — onDismiss does not fire.
     * @param {string} moduleId - The module ID to clear toasts for
     * @returns {number} - Number of toasts removed
     */
    static clearByModule(moduleId) {
        try {
            let removedCount = 0;
            for (const [id, toast] of this.toasts.entries()) {
                if (toast.moduleId === moduleId) {
                    this._remove(id, { instant: true });
                    removedCount++;
                }
            }
            if (removedCount > 0) {
                postConsoleAndNotification(MODULE.NAME, `Cleared ${removedCount} toasts for module: ${moduleId}`, "", true, false);
            }
            return removedCount;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Toast: error in clearByModule()", error, false, false);
            return 0;
        }
    }

    /**
     * Get info about the active toasts (no elements or callbacks — display metadata only).
     * @returns {Array} - Array of { id, moduleId, stackKey }
     */
    static getActive() {
        return Array.from(this.toasts.values()).map(t => ({
            id: t.id,
            moduleId: t.moduleId,
            stackKey: t.stackKey,
            persistent: t.persistent,
            color: t.color,
            backgroundColor: t.backgroundColor,
            size: t.size,
            animation: t.animation
        }));
    }

    // ===== INTERNALS =====

    /**
     * Convert a validated hex color (#rgb or #rrggbb) to an rgba() string.
     * Input is already strict-hex validated by show() — no sanitizing needed here.
     * @private
     */
    static _hexToRgba(hex, alpha) {
        let h = hex.slice(1);
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const int = parseInt(h, 16);
        return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
    }

    /**
     * The fixed stack container, lazily created on first show().
     * @private
     */
    static _getContainer() {
        let container = document.getElementById('blacksmith-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'blacksmith-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * The fixed full-viewport layer billboards render into, lazily created.
     * Positioning is INLINE and JS-owned (this is not consumer input, so the
     * class-only styling rule is untouched): even a stale or missing stylesheet
     * must never let a billboard participate in Foundry's body layout — a static
     * div on <body> pushes the entire interface around. pointer-events: none on
     * the layer; each billboard re-enables its own (same model as the stack).
     * @private
     */
    static _getBillboardLayer() {
        let layer = document.getElementById('blacksmith-toast-billboard-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'blacksmith-toast-billboard-layer';
            layer.style.cssText = 'position:fixed;inset:0;z-index:10001;pointer-events:none;';
            document.body.appendChild(layer);
        }
        return layer;
    }

    /**
     * Build a toast element. Text lands via textContent — consumer strings are
     * never parsed as HTML.
     * @private
     */
    static _buildElement(toast, { title, subtitle, icon, image, backgroundImage }) {
        const el = document.createElement('div');
        el.className = 'blacksmith-toast';
        if (toast.onClick) el.classList.add('blacksmith-toast-actionable');
        // Whitelisted in show() — these can only ever be values from STYLES/SIZES
        // Accent color: strict-hex validated in show(); applied as a custom property so
        // toast.css derives border/icon/title from one value.
        if (toast.color) {
            el.classList.add('blacksmith-toast-accented');
            el.style.setProperty('--blacksmith-toast-accent', toast.color);
        }
        // Background color: independent of the accent, strict-hex validated in show().
        // Rendered at BACKGROUND_ALPHA so the play area reads through the toast, matching
        // the default look. A backgroundImage covers it when both are set.
        if (toast.backgroundColor) {
            el.style.backgroundColor = this._hexToRgba(toast.backgroundColor, this.BACKGROUND_ALPHA);
        }
        if (toast.size) el.classList.add(`blacksmith-toast-size-${toast.size}`);
        // Whitelisted in show() (billboard-only); keyframes live in toast.css,
        // scoped to the content children so the container's enter/exit
        // transition and ANIMATION_MS stay untouched.
        if (toast.animation) el.classList.add(`blacksmith-toast-anim-${toast.animation}`);

        // backgroundImage is the one inline-style exception to the class-only model:
        // encodeURI neutralizes quotes so the path cannot escape the url("") wrapper.
        if (backgroundImage && typeof backgroundImage === 'string') {
            el.classList.add('blacksmith-toast-has-bg');
            el.style.backgroundImage = `url("${encodeURI(backgroundImage)}")`;
        }

        if (image) {
            const img = document.createElement('img');
            img.className = 'blacksmith-toast-image';
            img.src = image;
            img.alt = '';
            el.appendChild(img);
        } else if (icon) {
            const i = document.createElement('i');
            i.className = `${icon} blacksmith-toast-icon`;
            el.appendChild(i);
        }

        const textBlock = document.createElement('div');
        textBlock.className = 'blacksmith-toast-text';
        const titleEl = document.createElement('div');
        titleEl.className = 'blacksmith-toast-title';
        titleEl.textContent = title;
        textBlock.appendChild(titleEl);
        if (subtitle) {
            const subEl = document.createElement('div');
            subEl.className = 'blacksmith-toast-subtitle';
            subEl.textContent = subtitle;
            textBlock.appendChild(subEl);
        }
        el.appendChild(textBlock);

        const close = document.createElement('button');
        close.className = 'blacksmith-toast-close';
        close.innerHTML = '&times;';
        close.addEventListener('click', (event) => {
            // Keep the close out of the body-click path so × never fires onClick
            event.stopPropagation();
            this._dismiss(toast.id);
        });
        el.appendChild(close);

        if (toast.onClick) {
            el.addEventListener('click', (event) => {
                try {
                    playSound(window.COFFEEPUB?.SOUNDBUTTON04, window.COFFEEPUB?.SOUNDVOLUMESOFT, false, false);
                } catch (_error) {
                    // Non-blocking UI feedback only.
                }
                try {
                    toast.onClick(event);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Error executing toast onClick for ${toast.id}:`, error, false, false);
                }
                // Acted on — remove silently, onDismiss does not fire
                this._remove(toast.id);
            });
        } else if (toast.size) {
            // A billboard with no action: click anywhere dismisses (author decision
            // 2026-07-19 — fastest re-entry to play). This IS a dismissal — the player let
            // it go by — so it routes through _dismiss and onDismiss fires.
            el.addEventListener('click', () => this._dismiss(toast.id));
        }

        return el;
    }

    /**
     * Remove because the toast went away WITHOUT being acted on — auto-timeout or
     * the close button. Fires onDismiss, then removes. All other removal paths are
     * silent by design (post-onClick, remove(), clearByModule(), stackKey
     * replacement, stack-cap eviction).
     * @private
     */
    static _dismiss(toastId) {
        const toast = this.toasts.get(toastId);
        if (toast && typeof toast.onDismiss === 'function') {
            try {
                toast.onDismiss();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Error in toast onDismiss for ${toastId}:`, error, false, false);
            }
        }
        return this._remove(toastId);
    }

    /**
     * Drop a toast from the Map and the DOM. Animated fade-out by default;
     * instant for replacement/eviction/bulk paths where a fade would overlap
     * the incoming toast.
     * @private
     */
    static _remove(toastId, { instant = false } = {}) {
        const toast = this.toasts.get(toastId);
        if (!toast) return false;
        if (toast.timeoutId) clearTimeout(toast.timeoutId);
        this.toasts.delete(toastId);
        if (toast.element) {
            if (instant) {
                toast.element.remove();
            } else {
                toast.element.classList.remove('visible');
                setTimeout(() => toast.element.remove(), this.ANIMATION_MS);
            }
        }
        return true;
    }
}

/**
 * INTERNAL — Blacksmith-only until toast Phase 3. Show a toast on every connected
 * client: locally via show(), remotely via the "showToast" socket relay registered
 * in manager-sockets.js. Data-only by necessity — callbacks cannot cross the socket
 * and are stripped. Deliberately NOT on ToastAPI: the public cross-client surface
 * (send({recipients})) is gated on the socket rewrite; this is private plumbing for
 * Blacksmith's own announcements (timers). SocketManager is imported dynamically to
 * avoid a static import cycle (manager-sockets imports api-toast for the relay).
 * @param {Object} config - Same shape as show(), minus callbacks
 */
export async function broadcastToast(config) {
    const { onClick, onDismiss, ...data } = config || {};
    ToastManager.show(data);
    try {
        const { SocketManager } = await import('./manager-sockets.js');
        const socket = SocketManager.getSocket();
        if (socket) await socket.executeForOthers('showToast', data);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Toast: broadcast relay failed', error, false, false);
    }
}

/**
 * INTERNAL — Blacksmith-only until toast Phase 3, same standing as broadcastToast.
 * Show a toast on SPECIFIC users' clients. Targeting is receipt-side per the socket
 * privacy rule: both transports broadcast, `_recipients` rides the payload, and the
 * showToast handler renders only on listed clients — so the payload must never carry
 * secrets (a GM announcement is non-secret by contract). Shows locally too if the
 * sender is in the list. Data-only — callbacks are stripped.
 * @param {Object} config - Same shape as show(), minus callbacks
 * @param {string[]} userIds - User ids to show the toast to
 * @returns {boolean} - True if the send was handed to the socket (or was local-only)
 */
export async function sendToastToUsers(config, userIds) {
    const recipients = Array.isArray(userIds) ? userIds.filter(id => typeof id === 'string' && id) : [];
    if (!recipients.length) return false;
    const { onClick, onDismiss, ...data } = config || {};
    if (recipients.includes(game.userId)) ToastManager.show(data);
    const remote = recipients.filter(id => id !== game.userId);
    if (!remote.length) return true;
    try {
        const { SocketManager } = await import('./manager-sockets.js');
        const socket = SocketManager.getSocket();
        if (socket) await socket.executeForOthers('showToast', { ...data, _recipients: remote });
        return !!socket;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Toast: targeted relay failed', error, false, false);
        return false;
    }
}

/**
 * Public surface — exposed as module.api.toast. See documentation/api/api-toast.md.
 */
const ToastAPI = {
    show: ToastManager.show.bind(ToastManager),
    remove: ToastManager.remove.bind(ToastManager),
    clearByModule: ToastManager.clearByModule.bind(ToastManager),
    getActive: ToastManager.getActive.bind(ToastManager)
};

export { ToastManager, ToastAPI };
