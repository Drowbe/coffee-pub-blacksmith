import { MODULE } from './const.js';

/**
 * Shared DOM observer for journal sheets + active page changes.
 *
 * This consolidates the multiple "MutationObserver + interval" pipelines previously used by:
 * - journal double-click editing
 * - encounter toolbars on journal pages
 * - journal page pins
 *
 * The goal is to reduce duplicate DOM scanning / attribute watching overhead while keeping
 * v13 ApplicationV2 behavior reliable.
 */
export class JournalDomWatchdog {
    static _initialized = false;

    /** @type {MutationObserver|null} */
    static _observer = null;

    /** @type {number|null} */
    static _activePageIntervalId = null;

    /**
     * Known journal sheet roots we have seen in the DOM.
     * Used by the interval fallback to detect active page changes when attribute observation is insufficient.
     * @type {Set<HTMLElement>}
     */
    static _knownSheets = new Set();

    /**
     * Sheet roots currently subscribed for "ensure UI exists" events.
     * @type {Set<(sheetEl: HTMLElement) => void>}
     */
    static _sheetHandlers = new Set();

    /**
     * Sheet roots subscribed for "active page might have changed" events.
     * @type {Set<(sheetEl: HTMLElement) => void>}
     */
    static _pageHandlers = new Set();

    /** Last known active page id for each sheet element (object identity). */
    static _lastActivePageBySheet = new WeakMap();

    static init() {
        if (this._initialized) return;
        this._initialized = true;

        this._observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Detect added journal sheet roots.
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (!(node instanceof HTMLElement)) continue;
                        const sheet = this._extractJournalSheet(node);
                        if (!sheet) continue;
                        this._trackSheet(sheet);
                        this._emitSheet(sheet);
                    }
                }

                // Detect active page changes on journal-entry-page ARTICLE nodes.
                if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
                    const t = mutation.target;
                    if (t.tagName !== 'ARTICLE') continue;
                    if (!t.classList?.contains('journal-entry-page')) continue;
                    const sheet = t.closest?.('.journal-sheet, .journal-entry') ?? null;
                    if (!sheet) continue;
                    this._trackSheet(sheet);
                    this._emitPage(sheet);
                }
            }
        });

        this._observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-page-id', 'style']
        });

        // Scan existing sheets once so late subscribers still get covered.
        this._scanExistingSheets();

        // Interval fallback: detect active page id changes for already-known sheets.
        // Keep this centralized so we don't have multiple intervals per module.
        this._activePageIntervalId = window.setInterval(() => {
            this._pruneDetachedSheets();
            for (const sheet of this._knownSheets) {
                if (!sheet || !document.body.contains(sheet)) continue;
                const pageId = this._getActivePageIdFromSheet(sheet);
                if (!pageId) continue;
                const last = this._lastActivePageBySheet.get(sheet);
                if (pageId !== last) {
                    this._lastActivePageBySheet.set(sheet, pageId);
                    this._emitPage(sheet);
                }
            }
        }, 1000);

        Hooks.once('closeGame', () => this.dispose());
    }

    static dispose() {
        try {
            if (this._observer) this._observer.disconnect();
        } catch (_e) { /* non-fatal */ }
        this._observer = null;

        try {
            if (this._activePageIntervalId != null) window.clearInterval(this._activePageIntervalId);
        } catch (_e) { /* non-fatal */ }
        this._activePageIntervalId = null;

        this._knownSheets.clear();
        this._lastActivePageBySheet = new WeakMap();
        this._sheetHandlers.clear();
        this._pageHandlers.clear();
        this._initialized = false;
    }

    /**
     * Subscribe a handler for "sheet root exists / ensure UI" events.
     * The handler will also be invoked for existing sheets immediately.
     */
    static registerSheetHandler(handler) {
        if (typeof handler !== 'function') return;
        this._sheetHandlers.add(handler);
        this.init();
        this._scanExistingSheets();
        for (const sheet of this._knownSheets) handler(sheet);
    }

    static unregisterSheetHandler(handler) {
        this._sheetHandlers.delete(handler);
    }

    /**
     * Subscribe a handler for "active page may have changed" events.
     * The handler will also be invoked for existing sheets immediately.
     */
    static registerPageHandler(handler) {
        if (typeof handler !== 'function') return;
        this._pageHandlers.add(handler);
        this.init();
        this._scanExistingSheets();
        for (const sheet of this._knownSheets) handler(sheet);
    }

    static unregisterPageHandler(handler) {
        this._pageHandlers.delete(handler);
    }

    /**
     * Drop sheet roots no longer in the document so we do not retain detached DOM for the whole session.
     */
    static _pruneDetachedSheets() {
        for (const sheet of [...this._knownSheets]) {
            if (!sheet || !document.body.contains(sheet)) {
                this._knownSheets.delete(sheet);
                try {
                    this._lastActivePageBySheet.delete(sheet);
                } catch (_e) { /* non-fatal */ }
            }
        }
    }

    static _trackSheet(sheetEl) {
        if (!sheetEl) return;
        this._knownSheets.add(sheetEl);
        const pageId = this._getActivePageIdFromSheet(sheetEl);
        if (pageId) this._lastActivePageBySheet.set(sheetEl, pageId);
    }

    static _emitSheet(sheetEl) {
        for (const cb of this._sheetHandlers) {
            try {
                cb(sheetEl);
            } catch (e) {
                // Non-fatal: avoid breaking other callbacks
                console.warn(`${MODULE.ID}: JournalDomWatchdog sheet handler failed`, e);
            }
        }
    }

    static _emitPage(sheetEl) {
        for (const cb of this._pageHandlers) {
            try {
                cb(sheetEl);
            } catch (e) {
                console.warn(`${MODULE.ID}: JournalDomWatchdog page handler failed`, e);
            }
        }
    }

    static _scanExistingSheets() {
        const nodes = document.querySelectorAll('.journal-sheet, .journal-entry');
        for (const n of nodes) {
            if (!(n instanceof HTMLElement)) continue;
            this._trackSheet(n);
        }
    }

    static _extractJournalSheet(node) {
        if (!node) return null;
        if (node.classList?.contains('journal-sheet') || node.classList?.contains('journal-entry')) return node;
        const sheet = node.querySelector?.('.journal-sheet') || node.querySelector?.('.journal-entry');
        return sheet instanceof HTMLElement ? sheet : null;
    }

    static _getActivePageIdFromSheet(sheetRoot) {
        if (!sheetRoot?.querySelector) return null;
        const journalPage = sheetRoot.querySelector('article.journal-entry-page.active, article.journal-entry-page:not([style*="display: none"])');
        if (!journalPage) return null;
        return journalPage.getAttribute('data-page-id') ?? journalPage.dataset?.pageId ?? null;
    }
}

