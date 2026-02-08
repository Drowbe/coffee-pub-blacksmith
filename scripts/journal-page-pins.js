// Journal Page Pins – add a "pin this page" control and placement flow
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { PinManager } from './manager-pins.js';

export class JournalPagePins {
    static PIN_TYPE = 'journal-collection';
    static BUTTON_CLASS = 'journal-page-pin-button';
    static PLACEMENT_CLASS = 'journal-page-pin-placement-mode';
    static _cleanupPlacement = null;

    static init() {
        this._registerPinType();
        this._registerHooks();
        this._registerPinEvents();

        // If the game is already ready (late load / hot reload), run ready tasks now
        if (game?.ready) {
            this._afterReady();
        }
    }

    static _registerPinType() {
        const pins = this._getPinsApi();
        if (pins?.isAvailable?.()) {
            pins.registerPinType(MODULE.ID, this.PIN_TYPE, 'Journal');
            return;
        }
        Hooks.once('ready', () => {
            const readyPins = this._getPinsApi();
            if (readyPins?.isAvailable?.()) {
                readyPins.registerPinType(MODULE.ID, this.PIN_TYPE, 'Journal');
            }
        });
    }

    static _registerHooks() {
        console.log('[Blacksmith] JournalPagePins: registering hooks');
        // Fallback direct registration in case HookManager is bypassed
        Hooks.on('renderJournalSheet', (app, html, data) => this._onRenderSheet(app, html, data));
        Hooks.on('renderJournalPageSheet', (app, html, data) => this._onRenderSheet(app, html, data));
        Hooks.on('renderApplication', (app, html, data) => {
            const name = app?.constructor?.name || '';
            if (name.includes('Journal') || app?.document?.documentName === 'JournalEntry' || app?.document?.documentName === 'JournalEntryPage') {
                this._onRenderSheet(app, html, data);
            }
        });
        Hooks.once('ready', () => this._afterReady());

        HookManager.registerHook({
            name: 'renderJournalSheet',
            description: 'Blacksmith: add journal page pin control (entry sheet)',
            context: 'journal-page-pins-sheet',
            priority: 3,
            callback: this._onRenderSheet.bind(this)
        });

        HookManager.registerHook({
            name: 'renderJournalPageSheet',
            description: 'Blacksmith: add journal page pin control (page sheet)',
            context: 'journal-page-pins-page',
            priority: 3,
            callback: this._onRenderSheet.bind(this)
        });
    }

    static _registerPinEvents() {
        // Register with PinManager directly so we don't depend on module.api.pins being set
        // (Blacksmith assigns module.api after JournalPagePins.init() in the same ready callback).
        PinManager.registerHandler('doubleClick', async (evt) => {
            try {
                const journalUuid = evt?.pin?.config?.journalUuid;
                if (!journalUuid) return;
                const journal = await fromUuid(journalUuid);
                if (!journal) return;
                this._viewJournal(journal);
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Journal pin: error on doubleClick', err?.message || err, false, true);
            }
        }, { moduleId: MODULE.ID });
    }

    /**
     * Open the journal (let the system show it; no specific page).
     * @param {JournalEntry} journal - The journal entry
     */
    static _viewJournal(journal) {
        if (!journal) return;
        if (typeof journal.show === 'function') {
            try {
                journal.show({ force: true });
                return;
            } catch (e) { /* fall through */ }
        }
        const sheet = journal.sheet;
        if (sheet?.render) sheet.render(true);
    }

    static _afterReady() {
        // Late-pass: process any already-open journal windows
        setTimeout(() => this._processOpenSheets(), 300);
        this._setupDomObserver();
        // Periodic safety scan (last resort)
        if (!this._intervalId) {
            this._intervalId = setInterval(() => this._scanUiWindows(), 2000);
        }
        // Immediate scan now
        this._scanUiWindows();
        console.log('[Blacksmith] JournalPagePins: ready tasks completed');
    }

    static _onRenderSheet(app, html) {
        let root = this._normalizeHtml(html, app);
        if (!root) return;
        // When hook passes only the page (article), use the full sheet so we find the header (AppV2 uses form.application)
        if (root.closest) {
            const sheet = root.closest('.journal-sheet, .journal-entry, form.application');
            if (sheet) root = sheet;
        }
        if (this._isEditMode(root)) return;

        const journal = this._resolveJournal(app, root);
        if (!journal) return;

        this._injectButton(root, journal);
        setTimeout(() => this._injectButton(root, journal), 200);
    }

    static _processOpenSheets() {
        const nodes = document.querySelectorAll('.journal-sheet, .journal-entry');
        nodes.forEach((node) => {
            this._onRenderSheet(null, node, {});
        });
        // Kick an immediate window scan too
        this._scanUiWindows();
    }

    static _scanUiWindows() {
        if (!ui?.windows) return;
        for (const win of Object.values(ui.windows)) {
            const name = win?.constructor?.name || '';
            if (name.includes('Journal')) {
                const el = win.element?.length ? win.element[0] : win.element;
                if (el) {
                    console.log('[Blacksmith] JournalPagePins: scanning window', name);
                    this._onRenderSheet(win, el, {});
                }
            }
        }
    }

    static _setupDomObserver() {
        if (this._domObserver) return;
        this._domObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    this._processNode(node);
                }
            }
        });
        this._domObserver.observe(document.body, { childList: true, subtree: true });
    }

    static _processNode(node) {
        if (!(node instanceof HTMLElement)) return;
        const headers = node.matches('.window-header')
            ? [node]
            : Array.from(node.querySelectorAll('.window-header'));
        headers.forEach((header) => {
            const sheet = header.closest('.journal-sheet, .journal-entry') || header.parentElement || header;
            const journal = this._resolveJournalFromDom(sheet);
            if (journal) {
                this._injectButton(sheet, journal);
            }
        });
    }

    static _resolveJournal(app, root) {
        const doc = app?.document ?? app?.object ?? null;
        if (doc?.documentName === 'JournalEntry') return doc;
        if (doc?.documentName === 'JournalEntryPage' && doc?.parent) return doc.parent;
        const form = root?.closest?.('.journal-sheet, .journal-entry') || root;
        const docId = form?.dataset?.documentId || form?.dataset?.entryId || form?.dataset?.id || null;
        if (docId && game.journal?.get) return game.journal.get(docId) || null;
        return null;
    }

    static _resolveJournalFromDom(sheet) {
        if (!sheet) return null;
        const form = sheet.matches?.('.journal-sheet, .journal-entry') ? sheet : sheet.closest?.('.journal-sheet, .journal-entry') || sheet;
        const docId = form?.dataset?.documentId || form?.dataset?.entryId || form?.dataset?.id || null;
        if (!docId || !game.journal?.get) return null;
        return game.journal.get(docId) || null;
    }

    static _resolvePageFromDom(header) {
        const form = header.closest('.journal-sheet, .journal-entry, form');
        const docId = form?.dataset?.entryId || form?.dataset?.documentId || form?.dataset?.id || null;
        let pageId = form?.dataset?.pageId || form?.dataset?.pageid || header?.dataset?.pageId || null;
        if (!pageId) {
            const pageNode = (form || header.closest('.journal-page'))?.querySelector('[data-page-id], [data-pageid]');
            pageId = pageNode?.dataset?.pageId || pageNode?.dataset?.pageid || null;
        }

        // Page sheets often have data-page-id on the article element
        if (!docId && !pageId) return null;

        let journal = docId ? game.journal?.get(docId) : null;

        if (pageId) {
            if (journal?.pages?.get(pageId)) return journal.pages.get(pageId);
            // Fallback: search all journals for the page
            for (const j of game.journal.contents) {
                const p = j.pages?.get(pageId);
                if (p) return p;
            }
        }

        return null;
    }

    static _normalizeHtml(html, app) {
        if (!html) {
            const el = app?.element;
            if (el?.length) return el[0];
            return null;
        }
        // native HTMLElement
        if (html instanceof HTMLElement) return html;
        // jQuery-like
        if (html[0] instanceof HTMLElement) return html[0];
        if (html.jquery || typeof html.find === 'function') {
            const el = html[0] || html.get?.(0);
            if (el instanceof HTMLElement) return el;
        }
        // DocumentFragment
        if (html instanceof DocumentFragment) return html;
        return null;
    }

    static _isEditMode(root) {
        const appEl = root.closest?.('form.application') ?? root;

        // Common AppV2 signals
        if (appEl?.classList?.contains('editable')) return true;
        if (appEl?.dataset?.mode === 'edit') return true;

        // Classic sheets sometimes mark editing like this
        if (appEl?.classList?.contains('editing')) return true;

        // Fallback: an actual editor UI that indicates edit controls (not just display)
        return !!appEl?.querySelector?.('.editor-edit, button.save, [data-action="save"]');
    }

    static _resolvePage(app, root) {
        let page = app?.object ?? app?.document ?? app?.page ?? null;
        if (page?.documentName === 'JournalEntryPage') return page;

        const pages = app?.pages ?? app?.document?.pages ?? app?.object?.pages ?? null;
        const activeId = pages?.active ?? pages?.current ?? root?.dataset?.pageId ?? root?.getAttribute?.('data-page-id');
        if (pages && typeof pages.get === 'function') {
            const candidate = pages.get(activeId);
            if (candidate?.documentName === 'JournalEntryPage') return candidate;
        }

        if (app?.document?.pages && typeof app.document.pages.get === 'function') {
            const fallback = app.document.pages.get(activeId);
            if (fallback?.documentName === 'JournalEntryPage') return fallback;
        }

        return null;
    }

    static _injectButton(root, journal) {
        const appEl = root.closest?.('form.application') ?? root;
        const header =
            appEl?.querySelector?.(':scope > header.window-header') ||
            appEl?.querySelector?.('header.window-header') ||
            root.querySelector?.('header.window-header');

        if (!header) return;
        if (header.querySelector(`.${this.BUTTON_CLASS}`)) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `header-control icon ${this.BUTTON_CLASS}`;
        button.dataset.tooltip = 'Pin this journal to the current scene';
        button.setAttribute('aria-label', 'Pin this journal to the current scene');
        button.innerHTML = '<i class="fa-solid fa-map-pin"></i>';

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._beginPlacement(journal);
        });

        const closeBtn = header.querySelector('[data-action="close"]');
        if (closeBtn) closeBtn.insertAdjacentElement('beforebegin', button);
        else header.appendChild(button);
    }

    static async _beginPlacement(journal) {
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

            const { pinId, pin, sceneId } = await this._ensurePin(journal, pins);
            if (!pinId || !pin) {
                ui.notifications.error('Could not create a pin for this journal.');
                return;
            }

            await this._enterPlacementMode({ pinId, journal, pins, pin, currentSceneId: sceneId });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Journal Pins: Error starting placement', error?.message || error, false, true);
            ui.notifications.error(`Pin placement failed: ${error?.message || error}`);
        }
    }

    static async _ensurePin(journal, pins) {
        let pinId = journal.getFlag(MODULE.ID, 'journalPinId') || null;
        let pin = pinId ? pins.get(pinId) : null;

        const isTargetPin = pin
            && pin.moduleId === MODULE.ID
            && pin.type === this.PIN_TYPE
            && pin.config?.journalUuid === journal.uuid;

        if (!isTargetPin) {
            pin = null;
            pinId = null;
        }

        if (!pin) {
            const label = journal.name || 'Journal';
            const pinData = {
                id: pinId ?? crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                text: label,
                image: '<i class="fa-solid fa-book"></i>',
                size: { w: 46, h: 46 },
                style: { fill: '#1f3a4d', stroke: '#5fb3ff', strokeWidth: 2, iconColor: '#ffffff' },
                dropShadow: true,
                textLayout: 'right',
                textDisplay: 'hover',
                textColor: '#ffffff',
                textSize: 12,
                config: { journalUuid: journal.uuid }
            };

            pin = await pins.create(pinData);
            pinId = pin.id;
            await journal.setFlag(MODULE.ID, 'journalPinId', pinId);
        }

        const sceneId = typeof pins.findScene === 'function' ? pins.findScene(pinId) : null;
        return { pinId, pin, sceneId };
    }

    static async _enterPlacementMode({ pinId, journal, pins, pin, currentSceneId }) {
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
        const preview = overlay ? this._createPlacementPreview(pin) : null;
        if (preview && overlay) {
            overlay.appendChild(preview);
            preview.style.pointerEvents = 'none';
            preview.classList.add('blacksmith-pin-placement-preview');
        }

        const cancelPlacement = () => {
            cleanup();
            ui.notifications.info('Pin placement cancelled.');
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                cancelPlacement();
            }
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

                await journal.setFlag(MODULE.ID, 'journalPinSceneId', targetSceneId);
                await pins.reload({ sceneId: targetSceneId });

                if (placed) {
                    ui.notifications.info('Journal pinned to the scene.');
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
        el.style.position = 'absolute';
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
            icon.innerHTML = typeof img === 'string' && img.includes('<i ') ? img : `<i class="fa-solid fa-map-pin"></i>`;
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
