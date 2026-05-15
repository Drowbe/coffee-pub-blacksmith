// Journal Page Pins – add a "pin this page" control and placement flow
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { getCachedTemplate } from './blacksmith.js';
import { HookManager } from './manager-hooks.js';
import { PinManager } from './manager-pins.js';
import { JournalDomWatchdog } from './manager-journal-dom.js';

/** Foundry ownership levels (align with Configure Pin). */
const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : 0;
const OBSERVER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 2;
const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER : 3;

/** Client setting key for last-used journal pin toolbar choices. */
const TOOLBAR_PREFS_KEY = 'clientJournalPinToolbarPrefs';

const DEFAULT_TOOLBAR_PREFS = Object.freeze({
    pinMode: 'single',
    placementIcon: 'fa-solid fa-book-open',
    selectedTags: ['narrative'],
    accessMode: 'read',
    visibilityMode: 'visible'
});

const ACCESS_CYCLE = ['read', 'pin', 'full', 'none'];
const VISIBILITY_CYCLE = ['visible', 'hidden', 'owner'];

/** Match Configure Pin access dropdown labels (window-pin-configuration.js). */
const ACCESS_LABELS = Object.freeze({
    none: 'None: GM Only',
    read: 'Read Only: All open / GM Edit',
    pin: 'Pin: All see pin / GM and Owner Edit',
    full: 'Full: All view and edit'
});

/** Match Configure Pin visibility dropdown labels (window-pin-config.hbs). */
const VISIBILITY_LABELS = Object.freeze({
    visible: 'Visible',
    hidden: 'Hidden',
    owner: 'Owner'
});

const PLACEMENT_MODE_LABELS = Object.freeze({
    single: 'Single',
    multiple: 'Multiple'
});

/** Pin links to a specific journal page (config.journalPageUuid). */
const PIN_TARGET_PAGE = 'page';
/** Pin links to the journal entry only — double-click opens the journal (first page). */
const PIN_TARGET_JOURNAL = 'journal';

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
    static _resolvedPinType = null;

    static get PIN_TYPE() {
        if (this._resolvedPinType) return this._resolvedPinType;
        const pins = game?.modules?.get('coffee-pub-blacksmith')?.api?.pins;
        const taxonomy = pins?.getModuleTaxonomy?.(MODULE.ID);
        const firstType = Object.keys(taxonomy ?? {})[0];
        if (firstType) this._resolvedPinType = firstType;
        return firstType ?? 'journal-pin'; // fallback if taxonomy not yet loaded
    }
    static BUTTON_CLASS = 'journal-page-pin-button';
    static JOURNAL_BUTTON_CLASS = 'journal-entry-pin-button';
    static PLACEMENT_CLASS = 'journal-page-pin-placement-mode';
    static PAGE_IMAGE_OPTION = '__journal-page-image__';
    static _cleanupPlacement = null;

    static _initialized = false;
    static _intervalId = null;
    static _hookManagerIds = [];
    static _onPinDeleted = null;
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
     * Tear down hooks and HookManager entries (world exit / dev reload).
     */
    static dispose() {
        if (this._intervalId != null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        if (this._onPinDeleted) {
            try {
                Hooks.off('blacksmith.pins.deleted', this._onPinDeleted);
            } catch (_e) { /* non-fatal */ }
            this._onPinDeleted = null;
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
            this._registerJournalTaxonomy(pins);
            return;
        }
        Hooks.once('ready', () => {
            const readyPins = this._getPinsApi();
            if (readyPins?.isAvailable?.()) {
                this._registerJournalTaxonomy(readyPins);
            }
        });
    }

    static _registerJournalTaxonomy(pinsApi) {
        if (!pinsApi) return;
        // Tags come from pin-taxonomy.json — do not register them here.
        pinsApi.registerPinType(MODULE.ID, this.PIN_TYPE, 'Journal Pin');
        void pinsApi.loadBuiltinTaxonomy?.();
    }

    static async _getPinClassificationDefaults() {
        const pins = this._getPinsApi();
        if (pins?.loadBuiltinTaxonomy) {
            await pins.loadBuiltinTaxonomy();
        }
        const taxonomy = pins?.getPinTaxonomyChoices?.(MODULE.ID, this.PIN_TYPE) ?? null;
        return {
            tags: Array.isArray(taxonomy?.tags) && taxonomy.tags.length
                ? [...taxonomy.tags]
                : ['journal']
        };
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
                if ((evt?.pin?.type ?? '') !== this.PIN_TYPE) return;
                const config = evt?.pin?.config ?? {};
                if (this._isJournalPin(evt.pin)) {
                    const journal = await this._resolveJournalFromPinConfig(config);
                    if (!journal) return;
                    if (typeof journal.testUserPermission === 'function' && !journal.testUserPermission(game.user, 'LIMITED')) {
                        postConsoleAndNotification(MODULE.NAME, 'Journal pin: You do not have permission to view that journal.', null, false, false);
                        return;
                    }
                    await this._viewJournalEntry(journal);
                    return;
                }
                const pageUuid = config.journalPageUuid;
                if (!pageUuid) return;
                const page = await fromUuid(pageUuid);
                if (!page) return;
                const journal = page.parent;
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

        this._onPinDeleted = (evt) => {
            void this._onJournalPinDeleted(evt);
        };
        Hooks.on('blacksmith.pins.deleted', this._onPinDeleted);
    }

    /**
     * Clear stale page flags when a journal pin is removed from the canvas.
     * @param {{ pinId?: string }} evt
     */
    static async _onJournalPinDeleted(evt) {
        const pinId = evt?.pinId;
        if (!pinId || !game.journal?.contents) return;
        for (const journal of game.journal.contents) {
            if (journal.getFlag(MODULE.ID, 'pinId') === pinId) {
                if (journal.isOwner || game.user?.isGM) {
                    try {
                        await journal.unsetFlag(MODULE.ID, 'pinId');
                        await journal.unsetFlag(MODULE.ID, 'sceneId');
                    } catch (_e) { /* non-fatal */ }
                }
            }
            if (!journal.pages) continue;
            for (const page of journal.pages) {
                if (page.getFlag(MODULE.ID, 'pinId') !== pinId) continue;
                if (!page.isOwner && !game.user?.isGM) continue;
                try {
                    await page.unsetFlag(MODULE.ID, 'pinId');
                    await page.unsetFlag(MODULE.ID, 'sceneId');
                } catch (_e) { /* non-fatal */ }
            }
        }
    }

    static _isJournalPin(pin) {
        return pin?.config?.pinTarget === PIN_TARGET_JOURNAL;
    }

    static _isPagePin(pin) {
        if (!pin?.config || typeof pin.config !== 'object') return false;
        if (pin.config.pinTarget === PIN_TARGET_PAGE) return true;
        return !!pin.config.journalPageUuid;
    }

    /**
     * Resolve a JournalEntry from pin config (never treat arbitrary dotted strings as UUIDs).
     * @param {Record<string, unknown>} config
     * @returns {Promise<JournalEntry | null>}
     */
    static async _resolveJournalFromPinConfig(config) {
        if (!config || typeof config !== 'object') return null;
        const journalId = typeof config.journalId === 'string' ? config.journalId.trim() : '';
        if (journalId) {
            const fromId = game.journal?.get(journalId) ?? null;
            if (fromId?.documentName === 'JournalEntry') return fromId;
        }
        const journalUuid = typeof config.journalUuid === 'string' ? config.journalUuid.trim() : '';
        if (journalUuid.startsWith('JournalEntry.')) {
            try {
                const doc = await fromUuid(journalUuid);
                if (doc?.documentName === 'JournalEntry') return doc;
            } catch (_e) { /* fall through */ }
        }
        return null;
    }

    static _getToolbarPrefs() {
        const raw = game.settings.get(MODULE.ID, TOOLBAR_PREFS_KEY) ?? {};
        const pinMode = raw.pinMode === 'multiple' ? 'multiple' : 'single';
        const accessMode = ACCESS_CYCLE.includes(raw.accessMode) ? raw.accessMode : DEFAULT_TOOLBAR_PREFS.accessMode;
        let visibilityMode = VISIBILITY_CYCLE.includes(raw.visibilityMode) ? raw.visibilityMode : DEFAULT_TOOLBAR_PREFS.visibilityMode;
        if (accessMode === 'none') visibilityMode = 'hidden';
        return {
            pinMode,
            placementIcon: typeof raw.placementIcon === 'string' && raw.placementIcon
                ? raw.placementIcon
                : DEFAULT_TOOLBAR_PREFS.placementIcon,
            selectedTags: Array.isArray(raw.selectedTags) && raw.selectedTags.length
                ? [...raw.selectedTags]
                : [...DEFAULT_TOOLBAR_PREFS.selectedTags],
            accessMode,
            visibilityMode
        };
    }

    static async _saveToolbarPrefs(partial) {
        const cur = this._getToolbarPrefs();
        const next = { ...cur, ...partial };
        if (next.accessMode === 'none') next.visibilityMode = 'hidden';
        await game.settings.set(MODULE.ID, TOOLBAR_PREFS_KEY, next);
    }

    static _readPlacementOptsFromBar(bar) {
        const pinMode = bar?.getAttribute?.('data-pin-mode') === 'multiple' ? 'multiple' : 'single';
        const accessMode = bar?.getAttribute?.('data-access-mode') || 'read';
        const visibilityMode = bar?.getAttribute?.('data-visibility-mode') || 'visible';
        const placementIcon = bar?.getAttribute?.('data-placement-icon') || null;
        const selectedTags = [...(bar?.querySelectorAll?.('.journal-page-pin-tag-option.selected') ?? [])]
            .map(el => el.dataset.tag).filter(Boolean);
        return {
            allowDuplicates: pinMode === 'multiple',
            accessMode: ACCESS_CYCLE.includes(accessMode) ? accessMode : 'read',
            visibilityMode: VISIBILITY_CYCLE.includes(visibilityMode) ? visibilityMode : 'visible',
            placementIcon,
            selectedTags
        };
    }

    static _applyPlacementPermissions(pinData, accessMode, visibilityMode) {
        if (!pinData || typeof pinData !== 'object') return;
        const access = ACCESS_CYCLE.includes(accessMode) ? accessMode : 'read';
        let vis = VISIBILITY_CYCLE.includes(visibilityMode) ? visibilityMode : 'visible';
        if (access === 'none') vis = 'hidden';

        let defaultLevel = OBSERVER;
        if (access === 'none') defaultLevel = NONE;
        else if (access === 'full') defaultLevel = OWNER;

        pinData.ownership = {
            ...(pinData.ownership && typeof pinData.ownership === 'object' ? pinData.ownership : {}),
            default: defaultLevel
        };
        const prevConfig = pinData.config && typeof pinData.config === 'object' ? pinData.config : {};
        pinData.config = {
            ...prevConfig,
            blacksmithAccess: access === 'pin' ? 'pin' : (access === 'full' ? 'full' : 'read'),
            blacksmithVisibility: vis
        };
    }

    static _updateToggleButtonUI(bar) {
        if (!bar) return;
        const pinMode = bar.getAttribute('data-pin-mode') === 'multiple' ? 'multiple' : 'single';
        const accessMode = bar.getAttribute('data-access-mode') || 'read';
        const visibilityMode = bar.getAttribute('data-visibility-mode') || 'visible';

        const modeBtn = bar.querySelector('.journal-page-pin-mode-toggle');
        if (modeBtn) {
            const isMultiple = pinMode === 'multiple';
            modeBtn.classList.remove('selected');
            modeBtn.dataset.pinMode = pinMode;
            const icon = modeBtn.querySelector('i');
            if (icon) {
                icon.className = isMultiple ? 'fa-solid fa-clone' : 'fa-solid fa-map-pin';
            }
            const modeKey = isMultiple ? 'multiple' : 'single';
            modeBtn.title = `Placement: ${PLACEMENT_MODE_LABELS[modeKey]}`;
        }

        const accessBtn = bar.querySelector('.journal-page-pin-access-toggle');
        if (accessBtn) {
            accessBtn.dataset.accessMode = accessMode;
            const icon = accessBtn.querySelector('i');
            accessBtn.title = `Access: ${ACCESS_LABELS[accessMode] || ACCESS_LABELS.read}`;
            if (icon) {
                icon.className = accessMode === 'none'
                    ? 'fa-solid fa-lock'
                    : (accessMode === 'full' ? 'fa-solid fa-users' : (accessMode === 'pin' ? 'fa-solid fa-map-pin' : 'fa-solid fa-eye'));
            }
        }

        const visBtn = bar.querySelector('.journal-page-pin-visibility-toggle');
        if (visBtn) {
            visBtn.dataset.visibilityMode = visibilityMode;
            const icon = visBtn.querySelector('i');
            visBtn.title = `Visibility: ${VISIBILITY_LABELS[visibilityMode] || VISIBILITY_LABELS.visible}`;
            if (icon) {
                icon.className = visibilityMode === 'hidden'
                    ? 'fa-solid fa-eye-slash'
                    : (visibilityMode === 'owner' ? 'fa-solid fa-user-shield' : 'fa-solid fa-map');
            }
            if (accessMode === 'none') {
                visBtn.classList.add('is-locked');
                visBtn.disabled = true;
            } else {
                visBtn.classList.remove('is-locked');
                visBtn.disabled = false;
            }
        }
    }

    static _applyToolbarPrefsToBar(bar, prefs) {
        if (!bar || !prefs) return;
        bar.setAttribute('data-pin-mode', prefs.pinMode);
        bar.setAttribute('data-access-mode', prefs.accessMode);
        bar.setAttribute('data-visibility-mode', prefs.visibilityMode);
        bar.setAttribute('data-placement-icon', prefs.placementIcon);
        this._updateToggleButtonUI(bar);

        bar.querySelectorAll('.journal-page-pin-icon-option').forEach(el => el.classList.remove('selected'));
        const iconBtn = bar.querySelector(`.journal-page-pin-icon-option[data-placement-icon="${prefs.placementIcon}"]`);
        if (iconBtn) iconBtn.classList.add('selected');

        bar.querySelectorAll('.journal-page-pin-tag-option').forEach(el => {
            el.classList.toggle('selected', prefs.selectedTags.includes(el.dataset.tag));
        });
    }

    static _getTrackedPinForPage(page, pins) {
        let pinId = page.getFlag(MODULE.ID, 'pinId') || null;
        let pin = pinId ? pins.get(pinId) : null;
        const isTargetPin = pin
            && pin.moduleId === MODULE.ID
            && pin.type === this.PIN_TYPE
            && this._isPagePin(pin)
            && pin.config?.journalPageUuid === page.uuid;
        if (!isTargetPin) return { pin: null, pinId: null, sceneId: null };
        const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
        return { pin, pinId, sceneId };
    }

    static _getTrackedPinForJournal(journal, pins) {
        let pinId = journal.getFlag(MODULE.ID, 'pinId') || null;
        let pin = pinId ? pins.get(pinId) : null;
        const isTargetPin = pin
            && pin.moduleId === MODULE.ID
            && pin.type === this.PIN_TYPE
            && this._isJournalPin(pin)
            && pin.config?.journalId === journal.id;
        if (!isTargetPin) return { pin: null, pinId: null, sceneId: null };
        const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
        return { pin, pinId, sceneId };
    }

    static async _confirmMovePinIfNeeded(page, pins, allowDuplicates) {
        if (allowDuplicates || !page || !pins) return true;
        const { pin, pinId, sceneId } = this._getTrackedPinForPage(page, pins);
        if (!pin || !pinId || !sceneId) return true;
        const targetSceneId = canvas?.scene?.id;
        if (!targetSceneId || sceneId === targetSceneId) return true;
        const sceneName = game.scenes.get(sceneId)?.name ?? 'another scene';
        const currentName = canvas.scene?.name ?? 'this scene';
        return foundry.applications.api.DialogV2.confirm({
            window: { title: 'Move journal pin?' },
            content: `<p>This page already has a pin on <strong>${foundry.utils.escapeHTML(sceneName)}</strong>. Placing on <strong>${foundry.utils.escapeHTML(currentName)}</strong> will move that pin here.</p><p>Use the <strong>multiple pins</strong> toggle to add another pin without moving the existing one.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
    }

    static async _confirmMoveJournalPinIfNeeded(journal, pins, allowDuplicates) {
        if (allowDuplicates || !journal || !pins) return true;
        const { pin, pinId, sceneId } = this._getTrackedPinForJournal(journal, pins);
        if (!pin || !pinId || !sceneId) return true;
        const targetSceneId = canvas?.scene?.id;
        if (!targetSceneId || sceneId === targetSceneId) return true;
        const sceneName = game.scenes.get(sceneId)?.name ?? 'another scene';
        const currentName = canvas.scene?.name ?? 'this scene';
        return foundry.applications.api.DialogV2.confirm({
            window: { title: 'Move journal pin?' },
            content: `<p>This journal already has a pin on <strong>${foundry.utils.escapeHTML(sceneName)}</strong>. Placing on <strong>${foundry.utils.escapeHTML(currentName)}</strong> will move that pin here.</p><p>Use the <strong>multiple pins</strong> toggle to add another pin without moving the existing one.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
    }

    static async _clearStalePagePinFlags(page) {
        if (!page?.getFlag) return;
        const pinId = page.getFlag(MODULE.ID, 'pinId');
        if (!pinId) return;
        const pins = this._getPinsApi();
        if (pins?.get?.(pinId)) return;
        if (!page.isOwner && !game.user?.isGM) return;
        try {
            await page.unsetFlag(MODULE.ID, 'pinId');
            await page.unsetFlag(MODULE.ID, 'sceneId');
        } catch (_e) { /* non-fatal */ }
    }

    static async _clearStaleJournalPinFlags(journal) {
        if (!journal?.getFlag) return;
        const pinId = journal.getFlag(MODULE.ID, 'pinId');
        if (!pinId) return;
        const pins = this._getPinsApi();
        const pin = pins?.get?.(pinId);
        if (pin && this._isJournalPin(pin)) return;
        if (!journal.isOwner && !game.user?.isGM) return;
        try {
            await journal.unsetFlag(MODULE.ID, 'pinId');
            await journal.unsetFlag(MODULE.ID, 'sceneId');
        } catch (_e) { /* non-fatal */ }
    }

    static _getPagePinLabel(page) {
        const label = String(page?.name ?? '').trim();
        return label || 'Journal Page';
    }

    static _getJournalPinLabel(journal) {
        const label = String(journal?.name ?? '').trim();
        return label || 'Journal';
    }

    static _getFirstPageId(journal) {
        const pages = journal?.pages?.contents ?? [];
        if (!pages.length) return null;
        const sorted = [...pages].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        return sorted[0]?.id ?? null;
    }

    static _getFirstImageFromJournal(journal) {
        const pages = journal?.pages?.contents ?? [];
        if (!pages.length) return '';
        const sorted = [...pages].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        for (const page of sorted) {
            const src = this._getFirstImageFromPage(page);
            if (src) return src;
        }
        return '';
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
    /**
     * Open the journal for the current user (sidebar-style). Shows the first page when pages exist.
     */
    static _viewJournalEntry(journal) {
        if (!journal || journal.documentName !== 'JournalEntry') return Promise.resolve();
        const pageId = this._getFirstPageId(journal);
        if (pageId) return this._viewJournalPage(journal, pageId, { preferJournalSheet: true });
        return this._openJournalSheet(journal);
    }

    /**
     * Open the journal entry sheet for this user only (no journal.show() broadcast).
     * @param {JournalEntry} journal
     */
    static _openJournalSheet(journal) {
        if (!journal || journal.documentName !== 'JournalEntry') return Promise.resolve();
        try {
            const sheet = journal.sheet;
            if (sheet?.render) {
                sheet.render(true);
                setTimeout(() => this._ensureJournalSheetViewMode(sheet), 200);
            }
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Journal pin: error opening journal', e?.message ?? e, false, true);
        }
        return Promise.resolve();
    }

    static _viewJournalPage(journal, pageId, options = {}) {
        if (!journal || journal.documentName !== 'JournalEntry' || !pageId) return Promise.resolve();
        const preferJournalSheet = options.preferJournalSheet === true;
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
            if (!preferJournalSheet) {
                const page = journal.pages?.get(pageId);
                if (page?.sheet) {
                    page.sheet.render(true);
                    return;
                }
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
                    const existingJournalBtn = bar.querySelector(`.${this.JOURNAL_BUTTON_CLASS}`);
                    if (existingJournalBtn && journal?.id) existingJournalBtn.setAttribute('data-journal-id', journal.id);
                    bar.hidden = false;
                    return;
                }
                root.querySelectorAll('.journal-page-pins-bar').forEach((existing) => existing.remove());
                const html = template({ pageId: pageId ?? '', journalId: journal?.id ?? '' });
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                bar = wrapper.firstElementChild;
                if (!bar || !bar.classList.contains('journal-page-pins-bar')) {
                    postConsoleAndNotification(MODULE.NAME, 'Journal page pins: toolbar template did not return expected element', null, false, true);
                    return;
                }
                journalHeader.insertAdjacentElement('afterend', bar);
                bar.addEventListener('click', (event) => {
                    const barEl = event.currentTarget;

                    // Tag chip toggle
                    const tagOption = event.target.closest?.('.journal-page-pin-tag-option');
                    if (tagOption) {
                        event.preventDefault();
                        event.stopPropagation();
                        tagOption.classList.toggle('selected');
                        const prefs = this._readPlacementOptsFromBar(barEl);
                        void this._saveToolbarPrefs({
                            placementIcon: prefs.placementIcon,
                            selectedTags: prefs.selectedTags,
                            pinMode: barEl.getAttribute('data-pin-mode') === 'multiple' ? 'multiple' : 'single',
                            accessMode: prefs.accessMode,
                            visibilityMode: prefs.visibilityMode
                        });
                        return;
                    }

                    // Icon option
                    const iconOption = event.target.closest?.('.journal-page-pin-icon-option');
                    if (iconOption) {
                        event.preventDefault();
                        event.stopPropagation();
                        const icon = iconOption.getAttribute('data-placement-icon');
                        if (icon) {
                            barEl.setAttribute('data-placement-icon', icon);
                            barEl.querySelectorAll('.journal-page-pin-icon-option').forEach((el) => el.classList.remove('selected'));
                            iconOption.classList.add('selected');
                            const prefs = this._readPlacementOptsFromBar(barEl);
                            void this._saveToolbarPrefs({
                                placementIcon: icon,
                                selectedTags: prefs.selectedTags,
                                pinMode: barEl.getAttribute('data-pin-mode') === 'multiple' ? 'multiple' : 'single',
                                accessMode: prefs.accessMode,
                                visibilityMode: prefs.visibilityMode
                            });
                        }
                        return;
                    }

                    // Single / multiple pin mode
                    const modeToggle = event.target.closest?.('.journal-page-pin-mode-toggle');
                    if (modeToggle) {
                        event.preventDefault();
                        event.stopPropagation();
                        const next = barEl.getAttribute('data-pin-mode') === 'multiple' ? 'single' : 'multiple';
                        barEl.setAttribute('data-pin-mode', next);
                        this._updateToggleButtonUI(barEl);
                        const prefs = this._readPlacementOptsFromBar(barEl);
                        void this._saveToolbarPrefs({
                            pinMode: next,
                            placementIcon: prefs.placementIcon,
                            selectedTags: prefs.selectedTags,
                            accessMode: prefs.accessMode,
                            visibilityMode: prefs.visibilityMode
                        });
                        return;
                    }

                    // Access cycle
                    const accessToggle = event.target.closest?.('.journal-page-pin-access-toggle');
                    if (accessToggle) {
                        event.preventDefault();
                        event.stopPropagation();
                        const cur = barEl.getAttribute('data-access-mode') || 'read';
                        const idx = ACCESS_CYCLE.indexOf(cur);
                        const next = ACCESS_CYCLE[(idx + 1) % ACCESS_CYCLE.length];
                        barEl.setAttribute('data-access-mode', next);
                        if (next === 'none') barEl.setAttribute('data-visibility-mode', 'hidden');
                        this._updateToggleButtonUI(barEl);
                        const prefs = this._readPlacementOptsFromBar(barEl);
                        void this._saveToolbarPrefs({
                            accessMode: next,
                            visibilityMode: barEl.getAttribute('data-visibility-mode'),
                            pinMode: prefs.allowDuplicates ? 'multiple' : 'single',
                            placementIcon: prefs.placementIcon,
                            selectedTags: prefs.selectedTags
                        });
                        return;
                    }

                    // Map visibility cycle
                    const visToggle = event.target.closest?.('.journal-page-pin-visibility-toggle');
                    if (visToggle) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (barEl.getAttribute('data-access-mode') === 'none') return;
                        const cur = barEl.getAttribute('data-visibility-mode') || 'visible';
                        const idx = VISIBILITY_CYCLE.indexOf(cur);
                        const next = VISIBILITY_CYCLE[(idx + 1) % VISIBILITY_CYCLE.length];
                        barEl.setAttribute('data-visibility-mode', next);
                        this._updateToggleButtonUI(barEl);
                        const prefs = this._readPlacementOptsFromBar(barEl);
                        void this._saveToolbarPrefs({
                            visibilityMode: next,
                            accessMode: prefs.accessMode,
                            pinMode: prefs.allowDuplicates ? 'multiple' : 'single',
                            placementIcon: prefs.placementIcon,
                            selectedTags: prefs.selectedTags
                        });
                        return;
                    }

                    // Pin journal (entry-level, not a specific page)
                    const journalBtn = event.target.closest?.(`.${this.JOURNAL_BUTTON_CLASS}`);
                    if (journalBtn) {
                        event.preventDefault();
                        event.stopPropagation();
                        const sheet = (event.target.closest?.('.journal-sheet') || event.target.closest?.('.journal-entry')) ?? root;
                        const j = this._resolveJournalFromSheet(sheet, null) ?? journal;
                        if (!j) {
                            ui.notifications.warn('Could not determine which journal to pin.');
                            return;
                        }
                        const placementOpts = this._readPlacementOptsFromBar(barEl);
                        if (placementOpts.placementIcon === this.PAGE_IMAGE_OPTION) {
                            const journalImage = this._getFirstImageFromJournal(j);
                            if (!journalImage) {
                                ui.notifications.warn('No image found in this journal. Add an image to a page or choose an icon.');
                                return;
                            }
                        }
                        void this._beginJournalPlacement(j, placementOpts, barEl);
                        return;
                    }

                    // Pin page
                    const target = event.target.closest?.('.journal-page-pin-button');
                    if (!target) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const sheet = (event.target.closest?.('.journal-sheet') || event.target.closest?.('.journal-entry')) ?? root;
                    const pinnedPageId = barEl?.getAttribute?.('data-page-id');
                    const placementOpts = this._readPlacementOptsFromBar(barEl);
                    const j = pinnedPageId ? this._resolveJournalFromSheet(sheet, null) : null;
                    const page = j?.pages?.get(pinnedPageId) ?? null;
                    if (!page) {
                        ui.notifications.warn('Could not determine which page to pin. Switch to the page you want and try again.');
                        return;
                    }
                    if (placementOpts.placementIcon === this.PAGE_IMAGE_OPTION) {
                        const pageImage = this._getFirstImageFromPage(page);
                        if (!pageImage) {
                            ui.notifications.warn('No image found on this page. Add an image or choose an icon.');
                            return;
                        }
                    }
                    void this._beginPlacement(page, placementOpts, barEl);
                });

                // Populate tag chips then restore saved icon/tag state for current page
                this._populateTagChips(bar)
                    .then(() => this._restoreBarState(bar, activePage, journal))
                    .catch(() => {});
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Journal page pins: failed to render toolbar', err?.message ?? err, false, true);
                return;
            }
        }

        const prevPageId = bar.dataset.activePage ?? '';
        bar.setAttribute('data-page-id', pageId ?? '');
        bar.dataset.activePage = pageId ?? '';
        const journalBtn = bar.querySelector(`.${this.JOURNAL_BUTTON_CLASS}`);
        if (journalBtn && journal?.id) journalBtn.setAttribute('data-journal-id', journal.id);
        bar.hidden = false;

        // Restore state whenever the active page changes on an existing bar
        if (bar.querySelector('.journal-page-pins-tag-row')?.dataset.populated && pageId !== prevPageId) {
            this._restoreBarState(bar, activePage, journal).catch(() => {});
        }
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

    static async _beginPlacement(page, opts = {}, bar = null) {
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
            const allowDuplicates = opts.allowDuplicates === true;
            const confirmed = await this._confirmMovePinIfNeeded(page, pins, allowDuplicates);
            if (!confirmed) return;
            const { pinId, pin, sceneId } = await this._ensurePin(page, pins, opts);
            if (!pinId || !pin) {
                ui.notifications.error('Could not create a pin for this page.');
                return;
            }
            await this._enterPlacementMode({
                pinId,
                pinTarget: PIN_TARGET_PAGE,
                page,
                journal: null,
                pins,
                pin,
                currentSceneId: sceneId,
                bar,
                placementOpts: opts
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Journal Page Pins: Error starting placement', error?.message || error, false, true);
            ui.notifications.error(`Pin placement failed: ${error?.message || error}`);
        }
    }

    static async _beginJournalPlacement(journal, opts = {}, bar = null) {
        try {
            if (!journal?.isOwner) {
                ui.notifications.warn('You need owner permission on this journal to place a pin.');
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
            const allowDuplicates = opts.allowDuplicates === true;
            const confirmed = await this._confirmMoveJournalPinIfNeeded(journal, pins, allowDuplicates);
            if (!confirmed) return;
            const { pinId, pin, sceneId } = await this._ensureJournalPin(journal, pins, opts);
            if (!pinId || !pin) {
                ui.notifications.error('Could not create a pin for this journal.');
                return;
            }
            await this._enterPlacementMode({
                pinId,
                pinTarget: PIN_TARGET_JOURNAL,
                page: null,
                journal,
                pins,
                pin,
                currentSceneId: sceneId,
                bar,
                placementOpts: opts
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Journal Pins: Error starting journal placement', error?.message || error, false, true);
            ui.notifications.error(`Pin placement failed: ${error?.message || error}`);
        }
    }

    static async _populateTagChips(bar) {
        const tagRow = bar.querySelector('.journal-page-pins-tag-row');
        if (!tagRow || tagRow.dataset.populated) return;
        tagRow.dataset.populated = '1';
        // Use flags API: show only taxonomy-tier flags for this pin type, not global flags
        const flags = this._getTagsApi();
        const contextKey = `${MODULE.ID}.${this.PIN_TYPE}`;
        const choices = flags?.getChoices?.(contextKey) ?? [];
        const tags = choices.filter(c => c.tier === 'taxonomy').map(c => c.key);
        const displayTags = tags.length ? tags : ['narrative'];
        tagRow.innerHTML = displayTags.map(tag =>
            `<button type="button" class="journal-page-pin-tag-option" data-tag="${tag}">${tag}</button>`
        ).join('');
    }

    static _normalizeImageToIcon(image) {
        if (!image || typeof image !== 'string') return null;
        if (image === this.PAGE_IMAGE_OPTION) return this.PAGE_IMAGE_OPTION;
        if (!image.includes('<')) return image.trim();
        const match = image.match(/class=["']([^"']+)["']/);
        return match ? match[1].trim() : null;
    }

    static async _restoreBarState(bar, activePage, journal = null) {
        const DEFAULT_TAG = 'narrative';
        await this._clearStalePagePinFlags(activePage);
        if (journal) await this._clearStaleJournalPinFlags(journal);

        const prefs = { ...this._getToolbarPrefs() };
        const pins = this._getPinsApi();
        let pin = null;

        const pagePinId = activePage?.getFlag?.(MODULE.ID, 'pinId') || null;
        const pagePin = pagePinId ? pins?.get?.(pagePinId) : null;
        if (pagePin
            && pagePin.moduleId === MODULE.ID
            && pagePin.type === this.PIN_TYPE
            && this._isPagePin(pagePin)
            && pagePin.config?.journalPageUuid === activePage?.uuid) {
            pin = pagePin;
        } else if (journal) {
            const journalPinId = journal.getFlag?.(MODULE.ID, 'pinId') || null;
            const journalPin = journalPinId ? pins?.get?.(journalPinId) : null;
            if (journalPin
                && journalPin.moduleId === MODULE.ID
                && journalPin.type === this.PIN_TYPE
                && this._isJournalPin(journalPin)) {
                pin = journalPin;
            }
        }

        if (pin) {
            const iconClass = this._normalizeImageToIcon(pin.image);
            if (iconClass) {
                prefs.placementIcon = iconClass;
            } else if (typeof pin.image === 'string' && pin.image.trim() && !pin.image.includes('fa-')) {
                prefs.placementIcon = this.PAGE_IMAGE_OPTION;
            }
            if (Array.isArray(pin.tags) && pin.tags.length) {
                prefs.selectedTags = [...pin.tags];
            }
        }

        this._applyToolbarPrefsToBar(bar, prefs);
        const tagChips = bar.querySelectorAll('.journal-page-pin-tag-option');
        if (tagChips.length && ![...tagChips].some(el => el.classList.contains('selected'))) {
            const chip = bar.querySelector(`.journal-page-pin-tag-option[data-tag="${DEFAULT_TAG}"]`);
            if (chip) chip.classList.add('selected');
        }
    }

    static _mergeJournalPinData(base, clientDefault, opts) {
        const pinData = (clientDefault && typeof clientDefault === 'object')
            ? {
                ...base,
                ...clientDefault,
                id: base.id,
                moduleId: base.moduleId,
                type: base.type,
                text: base.text,
                config: {
                    ...(base.config || {}),
                    ...(clientDefault.config && typeof clientDefault.config === 'object' ? clientDefault.config : {})
                }
            }
            : { ...base };
        pinData.allowDuplicatePins = opts.allowDuplicates === true;
        this._applyPlacementPermissions(pinData, opts.accessMode, opts.visibilityMode);
        return pinData;
    }

    static async _ensurePin(page, pins, opts = {}) {
        let pinId = page.getFlag(MODULE.ID, 'pinId') || null;
        let pin = pinId ? pins.get(pinId) : null;
        const isTargetPin = pin
            && pin.moduleId === MODULE.ID
            && pin.type === this.PIN_TYPE
            && this._isPagePin(pin)
            && pin.config?.journalPageUuid === page.uuid;
        if (!isTargetPin) {
            pin = null;
            pinId = null;
        }

        const clientDefault = pins.getDefaultPinDesign?.(MODULE.ID, this.PIN_TYPE) ?? null;
        const allowDuplicates = opts.allowDuplicates === true;

        const placementIcon = opts?.placementIcon || null;
        const resolvedPlacementImage = placementIcon === this.PAGE_IMAGE_OPTION
            ? this._getFirstImageFromPage(page)
            : placementIcon;

        const userSelectedTags = Array.isArray(opts?.selectedTags) ? opts.selectedTags : null;
        const classification = userSelectedTags !== null
            ? { tags: userSelectedTags }
            : await this._getPinClassificationDefaults();

        if (pin && allowDuplicates) {
            const label = this._getPagePinLabel(page);
            const base = {
                id: crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                tags: classification.tags,
                text: label,
                config: {
                    pinTarget: PIN_TARGET_PAGE,
                    journalPageUuid: page.uuid,
                    journalId: page.parent?.id ?? '',
                    pageId: page.id ?? ''
                },
                ...JOURNAL_PIN_DEFAULTS
            };
            if (resolvedPlacementImage) base.image = resolvedPlacementImage;
            const pinData = this._mergeJournalPinData(base, clientDefault, opts);
            if (resolvedPlacementImage) pinData.image = resolvedPlacementImage;
            pin = await pins.create(pinData);
            pinId = pin.id;
            const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
            return { pinId, pin, sceneId };
        }

        if (!pin) {
            const label = this._getPagePinLabel(page);
            const base = {
                id: pinId ?? crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                tags: classification.tags,
                text: label,
                config: {
                    pinTarget: PIN_TARGET_PAGE,
                    journalPageUuid: page.uuid,
                    journalId: page.parent?.id ?? '',
                    pageId: page.id ?? ''
                },
                ...JOURNAL_PIN_DEFAULTS
            };
            if (resolvedPlacementImage) base.image = resolvedPlacementImage;
            const pinData = this._mergeJournalPinData(base, clientDefault, opts);
            if (resolvedPlacementImage) pinData.image = resolvedPlacementImage;
            pin = await pins.create(pinData);
            pinId = pin.id;
            await page.setFlag(MODULE.ID, 'pinId', pinId);
        } else {
            const label = this._getPagePinLabel(page);
            const patch = {};
            if (pin.text !== label) patch.text = label;
            if (resolvedPlacementImage && pin.image !== resolvedPlacementImage) patch.image = resolvedPlacementImage;
            if (userSelectedTags !== null) patch.tags = userSelectedTags;
            patch.allowDuplicatePins = false;
            const permissionCarrier = {
                ownership: foundry.utils.deepClone(pin.ownership ?? { default: OBSERVER }),
                config: foundry.utils.deepClone(pin.config ?? {})
            };
            this._applyPlacementPermissions(permissionCarrier, opts.accessMode, opts.visibilityMode);
            patch.ownership = permissionCarrier.ownership;
            patch.config = permissionCarrier.config;
            pin = await pins.update(pin.id, patch) || pin;
        }
        const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
        return { pinId, pin, sceneId };
    }

    static async _ensureJournalPin(journal, pins, opts = {}) {
        let pinId = journal.getFlag(MODULE.ID, 'pinId') || null;
        let pin = pinId ? pins.get(pinId) : null;
        const isTargetPin = pin
            && pin.moduleId === MODULE.ID
            && pin.type === this.PIN_TYPE
            && this._isJournalPin(pin)
            && pin.config?.journalId === journal.id;
        if (!isTargetPin) {
            pin = null;
            pinId = null;
        }

        const clientDefault = pins.getDefaultPinDesign?.(MODULE.ID, this.PIN_TYPE) ?? null;
        const allowDuplicates = opts.allowDuplicates === true;

        const placementIcon = opts?.placementIcon || null;
        const resolvedPlacementImage = placementIcon === this.PAGE_IMAGE_OPTION
            ? this._getFirstImageFromJournal(journal)
            : placementIcon;

        const userSelectedTags = Array.isArray(opts?.selectedTags) ? opts.selectedTags : null;
        const classification = userSelectedTags !== null
            ? { tags: userSelectedTags }
            : await this._getPinClassificationDefaults();

        const journalConfig = {
            pinTarget: PIN_TARGET_JOURNAL,
            journalId: journal.id,
            journalUuid: journal.uuid
        };

        if (pin && allowDuplicates) {
            const label = this._getJournalPinLabel(journal);
            const base = {
                id: crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                tags: classification.tags,
                text: label,
                config: { ...journalConfig },
                ...JOURNAL_PIN_DEFAULTS
            };
            if (resolvedPlacementImage) base.image = resolvedPlacementImage;
            const pinData = this._mergeJournalPinData(base, clientDefault, opts);
            if (resolvedPlacementImage) pinData.image = resolvedPlacementImage;
            pin = await pins.create(pinData);
            pinId = pin.id;
            const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
            return { pinId, pin, sceneId };
        }

        if (!pin) {
            const label = this._getJournalPinLabel(journal);
            const base = {
                id: pinId ?? crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                tags: classification.tags,
                text: label,
                config: { ...journalConfig },
                ...JOURNAL_PIN_DEFAULTS
            };
            if (resolvedPlacementImage) base.image = resolvedPlacementImage;
            const pinData = this._mergeJournalPinData(base, clientDefault, opts);
            if (resolvedPlacementImage) pinData.image = resolvedPlacementImage;
            pin = await pins.create(pinData);
            pinId = pin.id;
            await journal.setFlag(MODULE.ID, 'pinId', pinId);
        } else {
            const label = this._getJournalPinLabel(journal);
            const patch = {};
            if (pin.text !== label) patch.text = label;
            if (resolvedPlacementImage && pin.image !== resolvedPlacementImage) patch.image = resolvedPlacementImage;
            if (userSelectedTags !== null) patch.tags = userSelectedTags;
            patch.allowDuplicatePins = false;
            const permissionCarrier = {
                ownership: foundry.utils.deepClone(pin.ownership ?? { default: OBSERVER }),
                config: foundry.utils.deepClone(pin.config ?? {})
            };
            this._applyPlacementPermissions(permissionCarrier, opts.accessMode, opts.visibilityMode);
            patch.ownership = permissionCarrier.ownership;
            patch.config = permissionCarrier.config;
            pin = await pins.update(pin.id, patch) || pin;
        }
        const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
        return { pinId, pin, sceneId };
    }

    static async _enterPlacementMode({
        pinId,
        pinTarget = PIN_TARGET_PAGE,
        page = null,
        journal = null,
        pins,
        pin,
        currentSceneId,
        bar = null,
        placementOpts = null
    }) {
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
            const snapped = this._snapCanvasPlacementPoint(local);
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
                const flagDoc = pinTarget === PIN_TARGET_JOURNAL ? journal : page;
                if (flagDoc) {
                    if (!placementOpts?.allowDuplicates) {
                        await flagDoc.setFlag(MODULE.ID, 'pinId', pinId);
                    }
                    await flagDoc.setFlag(MODULE.ID, 'sceneId', targetSceneId);
                }
                await pins.reload({ sceneId: targetSceneId });
                if (bar && placementOpts) {
                    await this._saveToolbarPrefs({
                        pinMode: placementOpts.allowDuplicates ? 'multiple' : 'single',
                        placementIcon: placementOpts.placementIcon || bar.getAttribute('data-placement-icon'),
                        selectedTags: placementOpts.selectedTags ?? [],
                        accessMode: placementOpts.accessMode,
                        visibilityMode: placementOpts.visibilityMode
                    });
                }
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

    /**
     * Snap a canvas-local point to the scene grid (v13+ getSnappedPoint; legacy fallback).
     * @param {{ x: number; y: number }} local
     * @returns {{ x: number; y: number }}
     */
    static _snapCanvasPlacementPoint(local) {
        const grid = canvas?.grid;
        if (!grid || !local) return local;
        if (typeof grid.getSnappedPoint === 'function') {
            const modes = typeof CONST !== 'undefined' ? CONST.GRID_SNAPPING_MODES : null;
            const behavior = { resolution: 1 };
            if (modes?.CENTER) behavior.mode = modes.CENTER;
            return grid.getSnappedPoint({ x: local.x, y: local.y }, behavior);
        }
        if (typeof grid.getSnappedPosition === 'function') {
            return grid.getSnappedPosition(local.x, local.y, 1);
        }
        return local;
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

    static _getTagsApi() {
        return game.modules.get(MODULE.ID)?.api?.tags;
    }
}
