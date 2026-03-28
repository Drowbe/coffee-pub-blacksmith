// Journal Page Pins – add a "pin this page" control and placement flow
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { getCachedTemplate } from './blacksmith.js';
import { HookManager } from './manager-hooks.js';
import { PinManager } from './manager-pins.js';
import { JournalDomWatchdog } from './manager-journal-dom.js';

/** Foundry ownership level for "View & Click" (observer). */
const OBSERVER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 2;

/**
 * Default pin design and event animations for new journal page pins when no client default is set.
 * Matches the recommended Configure Pin defaults (size 100, right text, hover animations, etc.).
 */
const JOURNAL_PIN_DEFAULTS = Object.freeze({
    image: '<i class="fa-solid fa-book-open"></i>',
    size: { w: 100, h: 100 },
    shape: 'circle',
    style: { fill: '#000000', stroke: '#ffffff', strokeWidth: 6, iconColor: '#ffffff' },
    dropShadow: true,
    textLayout: 'right',
    textDisplay: 'hover',
    textColor: '#ffffff',
    textSize: 18,
    textMaxLength: 0,
    textMaxWidth: 50,
    textScaleWithPin: true,
    ownership: { default: OBSERVER },
    eventAnimations: {
        hover: { animation: 'ripple', sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3' },
        click: { animation: 'glow', sound: null },
        doubleClick: { animation: 'bounce', sound: 'modules/coffee-pub-blacksmith/sounds/book-open-02.mp3' },
        add: { animation: 'bounce', sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-03.mp3' },
        delete: { animation: 'scale-small', sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-03.mp3' }
    }
});

export class JournalPagePins {
    static PIN_TYPE = 'journal-page';
    static BUTTON_CLASS = 'journal-page-pin-button';
    static PLACEMENT_CLASS = 'journal-page-pin-placement-mode';
    static PAGE_IMAGE_OPTION = '__journal-page-image__';
    static _cleanupPlacement = null;

    static _initialized = false;
    static _intervalId = null;
    static _domObserver = null;
    static _hookManagerIds = [];
    static _watchdogSheetHandler = null;
    static _watchdogPageHandler = null;
    /** Bound callbacks registered only via HookManager (single dispatch per hook; no duplicate Hooks.on). */
    static _boundRenderSheet = null;
    static _boundRenderApplicationJournal = null;

    static init() {
        if (this._initialized) return;
        this._initialized = true;

        this._registerPinType();
        this._registerHooks();
        this._registerPinEvents();

        // If the game is already ready (late load / hot reload), run ready tasks now
        if (game?.ready) {
            this._afterReady();
        }
    }

    /**
     * Tear down interval, DOM observer, and HookManager entries (world exit / dev reload).
     */
    static dispose() {
        if (this._intervalId != null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        if (this._domObserver) {
            try {
                this._domObserver.disconnect();
            } catch (_e) { /* non-fatal */ }
            this._domObserver = null;
        }
        for (const id of this._hookManagerIds) {
            try {
                HookManager.removeCallback(id);
            } catch (_e) { /* non-fatal */ }
        }
        this._hookManagerIds = [];
        this._boundRenderSheet = null;
        this._boundRenderApplicationJournal = null;

        if (this._watchdogSheetHandler) {
            try { JournalDomWatchdog.unregisterSheetHandler(this._watchdogSheetHandler); } catch (_e) { /* non-fatal */ }
            this._watchdogSheetHandler = null;
        }
        if (this._watchdogPageHandler) {
            try { JournalDomWatchdog.unregisterPageHandler(this._watchdogPageHandler); } catch (_e) { /* non-fatal */ }
            this._watchdogPageHandler = null;
        }

        this._initialized = false;
    }

    static _registerPinType() {
        const pins = this._getPinsApi();
        if (pins?.isAvailable?.()) {
            pins.registerPinType(MODULE.ID, this.PIN_TYPE, 'Journal Page');
            return;
        }
        Hooks.once('ready', () => {
            const readyPins = this._getPinsApi();
            if (readyPins?.isAvailable?.()) {
                readyPins.registerPinType(MODULE.ID, this.PIN_TYPE, 'Journal Page');
            }
        });
    }

    static _registerHooks() {
        this._boundRenderSheet = this._onRenderSheet.bind(this);
        this._boundRenderApplicationJournal = (app, html, data) => {
            const name = app?.constructor?.name || '';
            if (name.includes('Journal') || app?.document?.documentName === 'JournalEntry' || app?.document?.documentName === 'JournalEntryPage') {
                this._onRenderSheet(app, html, data);
            }
        };

        Hooks.once('ready', () => this._afterReady());

        // HookManager only: avoids double-firing the same callback (previously also used Hooks.on here).
        this._hookManagerIds = [
            HookManager.registerHook({
                name: 'renderJournalSheet',
                description: 'Blacksmith: add journal page pin control (entry sheet)',
                context: 'journal-page-pins-sheet',
                priority: 3,
                callback: this._boundRenderSheet
            }),
            HookManager.registerHook({
                name: 'renderJournalPageSheet',
                description: 'Blacksmith: add journal page pin control (page sheet)',
                context: 'journal-page-pins-page',
                priority: 3,
                callback: this._boundRenderSheet
            }),
            HookManager.registerHook({
                name: 'renderApplication',
                description: 'Blacksmith: journal page pins fallback for journal ApplicationV2 renders',
                context: 'journal-page-pins-render-app',
                priority: 3,
                callback: this._boundRenderApplicationJournal
            })
        ];
    }

    static _registerPinEvents() {
        // Register with PinManager directly so we don't depend on module.api.pins being set
        PinManager.registerHandler('doubleClick', async (evt) => {
            try {
                // Only handle our journal-page pin type; ignore gather-spot and other types (avoids opening journals when another module's pin shares moduleId)
                if ((evt?.pin?.type ?? '') !== this.PIN_TYPE) return;
                const pageUuid = evt?.pin?.config?.journalPageUuid;
                if (!pageUuid) return;
                const page = await fromUuid(pageUuid);
                if (!page) return;
                const journal = page.parent;
                // Don't open if user cannot view the journal (avoids triggering Foundry's internal update that can require OWNER)
                if (journal && typeof journal.testUserPermission === 'function' && !journal.testUserPermission(game.user, 'LIMITED')) {
                    postConsoleAndNotification(MODULE.NAME, 'Journal page pin: You do not have permission to view that journal.', null, false, false);
                    return;
                }
                await this._viewJournalPage(journal, page.id);
            } catch (err) {
                const msg = err?.message ?? String(err);
                if (msg.includes('lacks permission') && msg.includes('JournalEntryPage')) {
                    postConsoleAndNotification(MODULE.NAME, 'Journal page pin: You do not have permission to open that journal page.', null, false, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, 'Journal page pin: error on doubleClick', msg, false, true);
                }
            }
        }, { moduleId: MODULE.ID });
    }

    static _getPagePinLabel(page) {
        const label = String(page?.name ?? '').trim();
        return label || 'Journal Page';
    }

    static _getFirstImageFromPage(page) {
        if (!page) return '';
        if (page.type === 'image' && typeof page.src === 'string' && page.src.trim()) {
            return page.src.trim();
        }
        const html = page?.text?.content;
        if (typeof html !== 'string' || !html.trim()) return '';
        const match = html.match(/<img[^>]*src=["']([^"']+)["']/i);
        return (match?.[1] || '').trim();
    }

    /**
     * Open the journal and show the given page for the current user only (no broadcast to players).
     * Ensures the page opens in view mode, not edit mode (clicks the sheet's toggle if it opened in edit).
     * Catches permission errors so viewing a journal the user cannot update does not break other handlers (e.g. gather-spot).
     */
    static _viewJournalPage(journal, pageId) {
        if (!journal || !pageId) return Promise.resolve();
        const sheet = journal.sheet;
        const openAndView = () => {
            // Open the sheet for the current user only; do not use journal.show() as that broadcasts "shown to all players"
            if (sheet && (typeof sheet.viewPage === 'function' || typeof sheet.goToPage === 'function')) {
                try {
                    const goToPage = typeof sheet.goToPage === 'function' ? sheet.goToPage.bind(sheet) : sheet.viewPage?.bind(sheet);
                    if (sheet.rendered) {
                        goToPage(pageId);
                    } else {
                        sheet.render(true);
                        setTimeout(() => goToPage(pageId), 100);
                    }
                    // If the sheet opened in edit mode (e.g. default for GM), switch to view mode
                    setTimeout(() => this._ensureJournalSheetViewMode(sheet), 200);
                    return;
                } catch (e) { /* fall through */ }
            }
            const page = journal.pages?.get(pageId);
            if (page?.sheet) {
                page.sheet.render(true);
                return;
            }
            if (sheet?.render) sheet.render(true);
        };
        try {
            openAndView();
            return Promise.resolve();
        } catch (e) {
            const msg = e?.message ?? String(e);
            if (msg.includes('lacks permission') && msg.includes('JournalEntryPage')) {
                postConsoleAndNotification(MODULE.NAME, 'Journal page pin: You do not have permission to open that journal page.', null, false, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, 'Journal page pin: error opening page', msg, false, true);
            }
            return Promise.resolve();
        }
    }

    /**
     * If the journal sheet is in edit mode, click the toggle/close button so it opens in view mode.
     * @param {Application} sheet - The journal entry sheet (JournalEntrySheet).
     */
    static _ensureJournalSheetViewMode(sheet) {
        if (!sheet?.element) return;
        const root = sheet.element?.querySelector?.('.journal-sheet, .journal-entry') ?? sheet.element;
        if (!root || !root.querySelector) return;
        if (root.querySelector('.editor-container, .editor-edit') === null) return; // Already in view mode
        // Try main sheet toggle (view/edit) or page-level close-view button
        const toggleBtn = root.querySelector(
            'button[data-action="toggleMode"], [data-action="toggleMode"], [data-action="closeView"], button[data-action="closeView"]'
        );
        if (toggleBtn) toggleBtn.click();
    }

    static _afterReady() {
        this._registerWatchdogHandlers();
        setTimeout(() => this._processOpenSheets(), 300);
        // Single scan for already-open journal windows; afterwards the shared watchdog drives updates.
        this._scanUiWindows();
    }

    static _registerWatchdogHandlers() {
        if (this._watchdogSheetHandler) return;
        this._watchdogSheetHandler = (sheetEl) => {
            // _onRenderSheet handles edit/view mode and injection.
            this._onRenderSheet(null, sheetEl, {});
        };
        this._watchdogPageHandler = (sheetEl) => {
            this._onRenderSheet(null, sheetEl, {});
        };
        JournalDomWatchdog.registerSheetHandler(this._watchdogSheetHandler);
        JournalDomWatchdog.registerPageHandler(this._watchdogPageHandler);
    }

    static _onRenderSheet(app, html) {
        const root = this._normalizeHtml(html, app);
        if (!root) return;
        if (this._isEditMode(root)) return;

        // If hook passed just the page article (v13 renderJournalPageSheet), find parent journal sheet
        let sheetRoot = root;
        if (root.tagName === 'ARTICLE' || root.classList?.contains('journal-entry-page')) {
            sheetRoot = root.closest('.journal-sheet, .journal-entry') ?? root;
        }

        const journal = this._resolveJournalFromSheet(sheetRoot, app);
        if (!journal) return;

        this._injectPinBar(sheetRoot, journal);
    }

    /**
     * Resolve the JournalEntry document from the sheet DOM or app (not the page).
     * Uses same cues as encounter toolbar; when app/data-document-id/ui.windows fail, find journal by matching sheet element.
     */
    static _resolveJournalFromSheet(root, app) {
        if (app?.document?.documentName === 'JournalEntry') return app.document;
        if (app?.object?.documentName === 'JournalEntry') return app.object;
        const docId = root?.dataset?.documentId ?? root?.getAttribute?.('data-document-id')
            ?? root?.dataset?.entryId ?? root?.dataset?.id ?? null;
        if (docId) return game.journal?.get(docId) ?? null;
        if (typeof ui?.windows !== 'undefined') {
            const win = Object.values(ui.windows).find((w) => {
                const el = w?.element?.jquery ? w.element[0] : w?.element;
                return el === root || el?.contains?.(root) || root?.contains?.(el);
            });
            if (win?.document?.documentName === 'JournalEntry') return win.document;
        }
        // Fallback: find journal whose sheet element is this root (v13 / dnd5e2 often don't set data-document-id or use ui.windows)
        if (game.journal?.contents) {
            for (const journal of game.journal.contents) {
                let el = journal.sheet?.element;
                if (el?.jquery || (typeof el?.get === 'function')) el = el[0] ?? el?.get?.(0);
                if (el === root || el?.contains?.(root) || root?.contains?.(el)) return journal;
            }
            // Fallback 2: resolve by active page id (which journal has a page with this id?)
            const activeArticle = root?.querySelector?.('article.journal-entry-page.active, article.journal-entry-page:not([style*="display: none"])');
            const pageId = activeArticle?.getAttribute?.('data-page-id') ?? activeArticle?.dataset?.pageId ?? null;
            if (pageId) {
                for (const journal of game.journal.contents) {
                    if (journal.pages?.get(pageId)) return journal;
                }
            }
        }
        return null;
    }

    /**
     * Get the currently visible JOURNAL PAGE (JournalEntryPage) from the sheet DOM.
     * Uses the exact same selector and order as the encounter toolbar so we get the same pageId.
     */
    static _getActivePageFromSheet(sheetRoot) {
        if (!sheetRoot) return null;
        const journal = this._resolveJournalFromSheet(sheetRoot, null);
        if (!journal) return null;
        const pageId = this._getActivePageIdFromSheet(sheetRoot);
        if (!pageId) return null;
        return journal.pages?.get(pageId) ?? null;
    }

    /**
     * Get the active page ID from the sheet DOM using the same selector as the encounter toolbar.
     * Encounter toolbar: journalPage = nativeHtml.querySelector('article.journal-entry-page.active, article.journal-entry-page:not([style*="display: none"])'); pageId = journalPage.getAttribute('data-page-id')
     */
    static _getActivePageIdFromSheet(sheetRoot) {
        if (!sheetRoot) return null;
        const journalPage = sheetRoot.querySelector('article.journal-entry-page.active, article.journal-entry-page:not([style*="display: none"])');
        return journalPage ? journalPage.getAttribute('data-page-id') : null;
    }

    /**
     * Inject the "Pin this page" bar after .journal-header (same area as encounter toolbar).
     * Uses same pageId resolution as encounter toolbar; click handler uses the bar's stored data-page-id so we pin the correct page.
     */
    static async _injectPinBar(root, journal) {
        const journalHeader = root.querySelector('.journal-header');
        const journalEntryPages = root.querySelector('.journal-entry-pages');
        if (!journalHeader || !journalEntryPages) return;

        const pageId = this._getActivePageIdFromSheet(root);
        const activePage = (pageId && journal?.pages) ? journal.pages.get(pageId) : null;

        let bar = root.querySelector('.journal-page-pins-bar');
        if (!bar) {
            try {
                const templatePath = `modules/${MODULE.ID}/templates/toolbar-pins.hbs`;
                const template = await getCachedTemplate(templatePath);
                bar = root.querySelector('.journal-page-pins-bar');
                if (bar) {
                    bar.setAttribute('data-page-id', pageId ?? '');
                    bar.hidden = !activePage;
                    return;
                }
                root.querySelectorAll('.journal-page-pins-bar').forEach((existing) => existing.remove());
                const html = template({ pageId: pageId ?? '' });
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                bar = wrapper.firstElementChild;
                if (!bar || !bar.classList.contains('journal-page-pins-bar')) {
                    postConsoleAndNotification(MODULE.NAME, 'Journal page pins: toolbar template did not return expected element', null, false, true);
                    return;
                }
                journalHeader.insertAdjacentElement('afterend', bar);
                bar.addEventListener('click', (event) => {
                    const iconOption = event.target.closest?.('.journal-page-pin-icon-option');
                    if (iconOption) {
                        event.preventDefault();
                        event.stopPropagation();
                        const icon = iconOption.getAttribute('data-placement-icon');
                        if (icon) {
                            bar.setAttribute('data-placement-icon', icon);
                            bar.querySelectorAll('.journal-page-pin-icon-option').forEach((el) => el.classList.remove('selected'));
                            iconOption.classList.add('selected');
                        }
                        return;
                    }
                    const target = event.target.closest?.('.journal-page-pin-button');
                    if (!target) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const barEl = event.currentTarget;
                    const sheet = (event.target.closest?.('.journal-sheet') || event.target.closest?.('.journal-entry')) ?? root;
                    const pinnedPageId = barEl?.getAttribute?.('data-page-id');
                    const placementIcon = barEl?.getAttribute?.('data-placement-icon') || null;
                    const j = pinnedPageId ? this._resolveJournalFromSheet(sheet, null) : null;
                    const page = j?.pages?.get(pinnedPageId) ?? null;
                    if (!page) {
                        ui.notifications.warn('Could not determine which page to pin. Switch to the page you want and try again.');
                        return;
                    }
                    if (placementIcon === this.PAGE_IMAGE_OPTION) {
                        const pageImage = this._getFirstImageFromPage(page);
                        if (!pageImage) {
                            ui.notifications.warn('No image found on this page. Add an image or choose an icon.');
                            return;
                        }
                    }
                    this._beginPlacement(page, { placementIcon });
                });
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Journal page pins: failed to render toolbar', err?.message ?? err, false, true);
                return;
            }
        }

        bar.setAttribute('data-page-id', pageId ?? '');
        bar.hidden = !activePage;
    }

    static _processOpenSheets() {
        const nodes = document.querySelectorAll('.journal-sheet, .journal-entry');
        nodes.forEach((node) => {
            this._onRenderSheet(null, node, {});
        });
        this._scanUiWindows();
    }

    static _scanUiWindows() {
        if (!ui?.windows) return;
        for (const win of Object.values(ui.windows)) {
            const name = win?.constructor?.name || '';
            if (name.includes('Journal')) {
                const el = win.element?.length ? win.element[0] : win.element;
                if (el) {
                    this._onRenderSheet(win, el, {});
                }
            }
        }
    }

    static _setupDomObserver() {
        if (this._domObserver) {
            return;
        }
        this._domObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    this._processNode(node);
                }
                if (m.type === 'attributes' && m.target) {
                    const target = m.target;
                    if (target.tagName === 'ARTICLE' && target.classList?.contains('journal-entry-page')) {
                        const sheet = target.closest('.journal-sheet, .journal-entry');
                        if (sheet) {
                            if (sheet._journalPagePinsDebounce) clearTimeout(sheet._journalPagePinsDebounce);
                            sheet._journalPagePinsDebounce = setTimeout(() => {
                                const journal = this._resolveJournalFromSheet(sheet, null);
                                if (journal) this._injectPinBar(sheet, journal);
                            }, 300);
                        }
                    }
                }
            }
        });
        this._domObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-page-id'] });
    }

    static _processNode(node) {
        if (!(node instanceof HTMLElement)) return;
        const sheet = node.closest?.('.journal-sheet, .journal-entry')
            ?? (node.classList?.contains('journal-sheet') || node.classList?.contains('journal-entry') ? node : null)
            ?? node.querySelector?.('.journal-sheet, .journal-entry');
        if (!sheet) return;
        const run = () => {
            const journal = this._resolveJournalFromSheet(sheet, null);
            if (journal) this._injectPinBar(sheet, journal);
        };
        if (sheet.querySelector?.('.journal-header') && sheet.querySelector?.('.journal-entry-pages')) {
            run();
        } else {
            setTimeout(run, 200);
        }
    }

    static _normalizeHtml(html, app) {
        if (!html) {
            const el = app?.element;
            if (el?.length) return el[0];
            return null;
        }
        if (html instanceof HTMLElement) return html;
        if (html[0] instanceof HTMLElement) return html[0];
        if (html.jquery || typeof html.find === 'function') {
            const el = html[0] || html.get?.(0);
            if (el instanceof HTMLElement) return el;
        }
        if (html instanceof DocumentFragment) return html;
        return null;
    }

    static _isEditMode(root) {
        return !!root.querySelector('.editor-container, .editor-edit');
    }

    static async _beginPlacement(page, opts = {}) {
        try {
            if (!page?.isOwner) {
                ui.notifications.warn('You need owner permission on this page to place a pin.');
                return;
            }
            const pins = this._getPinsApi();
            if (!pins?.isAvailable?.()) {
                ui.notifications.warn('Blacksmith pins are not available yet.');
                return;
            }
            const allowPlayerWrites = game.settings.get(MODULE.ID, PinManager.SETTING_ALLOW_PLAYER_WRITES) ?? false;
            if (!game.user.isGM && !allowPlayerWrites) {
                ui.notifications.warn('Only a GM can create pins (Pins setting).');
                return;
            }
            await pins.whenReady?.();
            if (!canvas?.scene) {
                ui.notifications.warn('Open a scene before placing a pin.');
                return;
            }
            const { pinId, pin, sceneId } = await this._ensurePin(page, pins, opts);
            if (!pinId || !pin) {
                ui.notifications.error('Could not create a pin for this page.');
                return;
            }
            await this._enterPlacementMode({ pinId, page, pins, pin, currentSceneId: sceneId });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Journal Page Pins: Error starting placement', error?.message || error, false, true);
            ui.notifications.error(`Pin placement failed: ${error?.message || error}`);
        }
    }

    static async _ensurePin(page, pins, opts = {}) {
        let pinId = page.getFlag(MODULE.ID, 'pinId') || null;
        let pin = pinId ? pins.get(pinId) : null;
        const isTargetPin = pin
            && pin.moduleId === MODULE.ID
            && pin.type === this.PIN_TYPE
            && pin.config?.journalPageUuid === page.uuid;
        if (!isTargetPin) {
            pin = null;
            pinId = null;
        }

        const clientDefault = pins.getDefaultPinDesign?.(MODULE.ID, this.PIN_TYPE) ?? null;
        const allowDuplicates = pin?.allowDuplicatePins === true
            || (clientDefault && clientDefault.allowDuplicatePins === true);

        const placementIcon = opts?.placementIcon || null;
        const resolvedPlacementImage = placementIcon === this.PAGE_IMAGE_OPTION
            ? this._getFirstImageFromPage(page)
            : placementIcon;

        if (pin && allowDuplicates) {
            // Allow duplicate pins: create a new pin for this placement instead of reusing
            const label = this._getPagePinLabel(page);
            const base = {
                id: crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                text: label,
                config: {
                    journalPageUuid: page.uuid,
                    journalId: page.parent?.id ?? '',
                    pageId: page.id ?? ''
                },
                allowDuplicatePins: true,
                ...JOURNAL_PIN_DEFAULTS
            };
            if (resolvedPlacementImage) base.image = resolvedPlacementImage;
            const pinData = (clientDefault && typeof clientDefault === 'object')
                ? {
                    ...base,
                    ...clientDefault,
                    id: base.id,
                    moduleId: base.moduleId,
                    type: base.type,
                    text: base.text,
                    config: base.config,
                    allowDuplicatePins: true
                }
                : base;
            if (resolvedPlacementImage) pinData.image = resolvedPlacementImage;
            pin = await pins.create(pinData);
            pinId = pin.id;
            // Do not set page flag — page keeps pointing to first pin; this is a second instance
            const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
            return { pinId, pin, sceneId };
        }

        if (!pin) {
            const label = this._getPagePinLabel(page);
            const base = {
                id: pinId ?? crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                text: label,
                config: {
                    journalPageUuid: page.uuid,
                    journalId: page.parent?.id ?? '',
                    pageId: page.id ?? ''
                },
                ...JOURNAL_PIN_DEFAULTS
            };
            if (resolvedPlacementImage) base.image = resolvedPlacementImage;
            const pinData = (clientDefault && typeof clientDefault === 'object')
                ? {
                    ...base,
                    ...clientDefault,
                    id: base.id,
                    moduleId: base.moduleId,
                    type: base.type,
                    text: base.text,
                    config: base.config
                }
                : base;
            if (resolvedPlacementImage) pinData.image = resolvedPlacementImage;
            pin = await pins.create(pinData);
            pinId = pin.id;
            await page.setFlag(MODULE.ID, 'pinId', pinId);
        } else {
            // Keep existing linked pins aligned with the current page title.
            const label = this._getPagePinLabel(page);
            const patch = {};
            if (pin.text !== label) {
                patch.text = label;
            }
            if (resolvedPlacementImage && pin.image !== resolvedPlacementImage) {
                patch.image = resolvedPlacementImage;
            }
            if (Object.keys(patch).length > 0) {
                pin = await pins.update(pin.id, patch) || pin;
            }
        }
        const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
        return { pinId, pin, sceneId };
    }

    static async _enterPlacementMode({ pinId, page, pins, pin, currentSceneId }) {
        if (this._cleanupPlacement) {
            this._cleanupPlacement();
            this._cleanupPlacement = null;
        }
        const originalCursor = canvas.stage.cursor;
        canvas.stage.cursor = 'crosshair';
        const canvasEl = document.getElementById('board') || canvas.app?.element;
        const originalCanvasCursor = canvasEl?.style?.cursor;
        if (canvasEl) canvasEl.style.cursor = 'crosshair';
        document.body.classList.add(this.PLACEMENT_CLASS);

        const overlay = document.getElementById('blacksmith-pins-overlay');
        const preview = this._createPlacementPreview(pin);
        if (preview) {
            preview.style.pointerEvents = 'none';
            preview.classList.add('blacksmith-pin-placement-preview');
            document.body.appendChild(preview);
        }
        const cancelPlacement = () => {
            cleanup();
            ui.notifications.info('Pin placement cancelled.');
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') cancelPlacement();
        };
        const onPointerMove = (event) => {
            if (!preview) return;
            const oe = event.data?.originalEvent;
            const clientX = oe?.clientX ?? 0;
            const clientY = oe?.clientY ?? 0;
            const w = preview.offsetWidth || 46;
            const h = preview.offsetHeight || 46;
            preview.style.left = `${clientX - w / 2}px`;
            preview.style.top = `${clientY - h / 2}px`;
        };
        const onPointerDown = async (event) => {
            if (event.data?.originalEvent?.button === 2) {
                cancelPlacement();
                return;
            }
            const global = event.data?.global;
            if (!global) return;
            const local = canvas.stage.toLocal(global);
            const snapped = canvas.grid?.getSnappedPosition
                ? canvas.grid.getSnappedPosition(local.x, local.y, 1)
                : local;
            cleanup();
            try {
                let placed = null;
                const targetSceneId = canvas.scene.id;
                if (currentSceneId && currentSceneId !== targetSceneId) {
                    await pins.unplace(pinId);
                    currentSceneId = null;
                }
                if (currentSceneId === targetSceneId) {
                    placed = await pins.update(pinId, { x: snapped.x, y: snapped.y }, { sceneId: targetSceneId });
                } else {
                    placed = await pins.place(pinId, { sceneId: targetSceneId, x: snapped.x, y: snapped.y });
                }
                await page.setFlag(MODULE.ID, 'pinId', pinId);
                await page.setFlag(MODULE.ID, 'sceneId', targetSceneId);
                await pins.reload({ sceneId: targetSceneId });
            } catch (error) {
                ui.notifications.error(`Could not place pin: ${error?.message || error}`);
            }
        };
        const cleanup = () => {
            canvas.stage.off('pointerdown', onPointerDown);
            canvas.stage.off('pointermove', onPointerMove);
            document.removeEventListener('keydown', onKeyDown);
            canvas.stage.cursor = originalCursor || 'default';
            if (canvasEl) canvasEl.style.cursor = originalCanvasCursor ?? '';
            document.body.classList.remove(this.PLACEMENT_CLASS);
            if (preview?.parentElement) preview.remove();
            this._cleanupPlacement = null;
        };
        canvas.stage.on('pointerdown', onPointerDown);
        canvas.stage.on('pointermove', onPointerMove);
        document.addEventListener('keydown', onKeyDown);
        this._cleanupPlacement = cleanup;
    }

    static _createPlacementPreview(pin) {
        const scale = canvas.stage?.scale?.x ?? 1;
        const size = Math.round((pin.size?.w ?? 46) * scale);
        const style = pin.style || {};
        const shape = pin.shape || 'circle';
        const fillColor = style.fill || '#1f3a4d';
        const strokeColor = style.stroke || '#5fb3ff';
        const strokeWidth = typeof style.strokeWidth === 'number' ? style.strokeWidth : 2;
        const iconColor = style.iconColor || '#ffffff';
        const el = document.createElement('div');
        el.className = 'blacksmith-pin';
        el.dataset.shape = shape;
        el.style.position = 'fixed';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.backgroundColor = fillColor;
        el.style.border = `${strokeWidth}px solid ${strokeColor}`;
        el.style.borderRadius = shape === 'circle' ? '50%' : '15%';
        el.style.opacity = '0.9';
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        const icon = document.createElement('div');
        icon.className = 'blacksmith-pin-icon';
        icon.dataset.iconType = pin.iconText ? 'text' : 'fa';
        if (pin.iconText) {
            icon.textContent = String(pin.iconText).trim();
            icon.style.color = iconColor;
        } else {
            const img = pin.image ?? '<i class="fa-solid fa-book-open"></i>';
            icon.innerHTML = typeof img === 'string' && img.includes('<i ')
                ? img
                : (typeof img === 'string' && img.includes('fa-')
                    ? `<i class="${img.trim()}"></i>`
                    : '<i class="fa-solid fa-map-pin"></i>');
            const i = icon.querySelector('i');
            if (i) i.style.color = iconColor;
        }
        icon.style.fontSize = `${Math.round(size * 0.6)}px`;
        el.appendChild(icon);
        return el;
    }

    static _getPinsApi() {
        return game.modules.get(MODULE.ID)?.api?.pins;
    }
}
