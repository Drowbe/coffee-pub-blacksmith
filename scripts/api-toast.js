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
import { postConsoleAndNotification, playSound } from './api-core.js';

class ToastManager {
    static toasts = new Map(); // toastId -> { id, moduleId, stackKey, onClick, onDismiss, timeoutId, element }
    static MAX_STACK = 5;
    static ANIMATION_MS = 400; // must match the transition duration in styles/toast.css

    // ===== PUBLIC API =====

    /**
     * Show a toast on this client.
     * @param {Object} config
     * @param {string} config.title - Headline text (required)
     * @param {string} config.subtitle - Second line (optional)
     * @param {string} config.icon - FontAwesome icon class (ignored if image is set)
     * @param {string} config.image - Image path/URL, rendered as a round avatar (wins over icon)
     * @param {number} config.duration - Seconds before auto-dismiss; 0 = until closed (default: 8)
     * @param {string} config.moduleId - Owning module (default: "blacksmith-core")
     * @param {Function} config.onClick - Body click runs this, then the toast is removed (onDismiss does NOT fire)
     * @param {Function} config.onDismiss - Fires only when the toast goes away unacted-on: auto-timeout or the close button. Same contract as menubar notifications (see api-menubar.md). Never fires on replacement via stackKey, stack-cap eviction, programmatic remove(), or clearByModule().
     * @param {string} config.stackKey - Toasts stack by default; a new toast with the same stackKey replaces the old one in place
     * @returns {string|null} - Toast ID for later removal, or null on error
     */
    static show({ title, subtitle = "", icon = null, image = null, duration = 8, moduleId = "blacksmith-core", onClick = null, onDismiss = null, stackKey = null } = {}) {
        try {
            if (!title) {
                postConsoleAndNotification(MODULE.NAME, "Toast: show() requires a title", "", false, false);
                return null;
            }

            // Same stackKey replaces in place. Supersession is not a dismissal — no onDismiss.
            if (stackKey) {
                for (const [id, toast] of this.toasts.entries()) {
                    if (toast.stackKey === stackKey) this._remove(id, { instant: true });
                }
            }

            // Stack cap: evict the oldest, silently. Eviction is not a dismissal — no onDismiss.
            while (this.toasts.size >= this.MAX_STACK) {
                const oldestId = this.toasts.keys().next().value;
                this._remove(oldestId, { instant: true });
            }

            const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Callbacks are safe to store: toasts are per-client and never cross the socket.
            const toast = {
                id: toastId,
                moduleId: moduleId,
                stackKey: stackKey,
                onClick: typeof onClick === 'function' ? onClick : null,
                onDismiss: typeof onDismiss === 'function' ? onDismiss : null,
                timeoutId: null,
                element: null
            };

            toast.element = this._buildElement(toast, { title, subtitle, icon, image });
            this.toasts.set(toastId, toast);
            this._getContainer().appendChild(toast.element);
            requestAnimationFrame(() => toast.element.classList.add('visible'));

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
            stackKey: t.stackKey
        }));
    }

    // ===== INTERNALS =====

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
     * Build a toast element. Text lands via textContent — consumer strings are
     * never parsed as HTML.
     * @private
     */
    static _buildElement(toast, { title, subtitle, icon, image }) {
        const el = document.createElement('div');
        el.className = 'blacksmith-toast';
        if (toast.onClick) el.classList.add('blacksmith-toast-actionable');

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
 * Public surface — exposed as module.api.toast. See documentation/api/api-toast.md.
 */
const ToastAPI = {
    show: ToastManager.show.bind(ToastManager),
    remove: ToastManager.remove.bind(ToastManager),
    clearByModule: ToastManager.clearByModule.bind(ToastManager),
    getActive: ToastManager.getActive.bind(ToastManager)
};

export { ToastManager, ToastAPI };
