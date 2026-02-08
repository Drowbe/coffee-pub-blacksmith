// Journal Page Pins – add a "pin this page" control and placement flow
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { PinManager } from './manager-pins.js';

export class JournalPagePins {
    static PIN_TYPE = 'journal-page';
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
        postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: registering hooks', null, true, false);
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
        PinManager.registerHandler('doubleClick', async (evt) => {
            try {
                const pageUuid = evt?.pin?.config?.journalPageUuid;
                if (!pageUuid) return;
                const page = await fromUuid(pageUuid);
                if (!page) return;
                this._viewJournalPage(page.parent, page.id);
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Journal page pin: error on doubleClick', err?.message || err, false, true);
            }
        }, { moduleId: MODULE.ID });
    }

    /**
     * Open the journal and show the given page (not just the journal).
     */
    static _viewJournalPage(journal, pageId) {
        if (!journal || !pageId) return;
        const sheet = journal.sheet;
        // Open journal in default (tabbed) mode, then switch to the page (avoid single-page/PDF mode)
        if (typeof journal.show === 'function') {
            try {
                journal.show({ force: true });
                if (sheet && typeof sheet.viewPage === 'function') {
                    if (sheet.rendered) {
                        sheet.viewPage(pageId);
                    } else {
                        setTimeout(() => sheet.viewPage?.(pageId), 100);
                    }
                }
                return;
            } catch (e) { /* fall through */ }
        }
        if (sheet && typeof sheet.viewPage === 'function') {
            try {
                if (!sheet.rendered) sheet.render(true);
                sheet.viewPage(pageId);
                return;
            } catch (e) { /* fall through */ }
        }
        const page = journal.pages?.get(pageId);
        if (page?.sheet) {
            page.sheet.render(true);
            return;
        }
        if (sheet?.render) sheet.render(true);
    }

    static _afterReady() {
        setTimeout(() => this._processOpenSheets(), 300);
        this._setupDomObserver();
        if (!this._intervalId) {
            this._intervalId = setInterval(() => this._scanUiWindows(), 2000);
        }
        this._scanUiWindows();
        postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: ready tasks completed', null, true, false);
    }

    static _onRenderSheet(app, html) {
        postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: render hook fired', app?.constructor?.name, true, false);
        const root = this._normalizeHtml(html, app);
        if (!root) {
            postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: no root element', app?.constructor?.name, true, false);
            return;
        }
        if (this._isEditMode(root)) return;

        const page = this._resolvePage(app, root);
        if (!page) {
            postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: no page resolved', app?.constructor?.name, true, false);
            return;
        }

        this._injectButton(root, page);
        setTimeout(() => this._injectButton(root, page), 200);
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
                    postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: scanning window', name, true, false);
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
            const page = this._resolvePageFromDom(header);
            if (page) {
                this._injectButton(header.closest('.journal-sheet, .journal-entry') || header.parentElement || header, page);
            }
        });
    }

    static _resolvePageFromDom(header) {
        const form = header.closest('.journal-sheet, .journal-entry, form');
        const docId = form?.dataset?.entryId || form?.dataset?.documentId || form?.dataset?.id || null;
        let pageId = form?.dataset?.pageId || form?.dataset?.pageid || header?.dataset?.pageId || null;
        if (!pageId) {
            const pageNode = (form || header.closest('.journal-page'))?.querySelector('[data-page-id], [data-pageid]');
            pageId = pageNode?.dataset?.pageId || pageNode?.dataset?.pageid || null;
        }
        if (!docId && !pageId) return null;

        let journal = docId ? game.journal?.get(docId) : null;
        if (pageId) {
            if (journal?.pages?.get(pageId)) return journal.pages.get(pageId);
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

    static _injectButton(root, page) {
        const header = root.querySelector('.window-header, header.window-header, .app-header, .journal-header, .sheet-header, .titlebar') || root.querySelector('header');
        if (!header) {
            postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: header not found on render', null, true, false);
            return;
        }
        if (header.querySelector(`.${this.BUTTON_CLASS}`)) return;

        const button = document.createElement('a');
        button.className = `header-control icon ${this.BUTTON_CLASS}`;
        button.title = 'Pin this journal page to the current scene';
        button.innerHTML = '<i class="fa-solid fa-map-pin"></i>';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._beginPlacement(page);
        });

        const closeButton = header.querySelector('[data-action="close"], .header-button.close, .header-control.close, button.close, a.close, i.fa-xmark');
        if (closeButton?.parentElement === header) {
            closeButton.insertAdjacentElement('beforebegin', button);
        } else if (closeButton) {
            closeButton.closest('button, a')?.insertAdjacentElement('beforebegin', button);
        } else {
            header.appendChild(button);
        }
        postConsoleAndNotification(MODULE.NAME, 'JournalPagePins: button injected', { page: page.id, headerClass: header.className }, true, false);
    }

    static async _beginPlacement(page) {
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
            const { pinId, pin, sceneId } = await this._ensurePin(page, pins);
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

    static async _ensurePin(page, pins) {
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
        if (!pin) {
            const label = page.parent?.name || page.name || 'Journal Page';
            const pinData = {
                id: pinId ?? crypto.randomUUID(),
                moduleId: MODULE.ID,
                type: this.PIN_TYPE,
                text: label,
                image: '<i class="fa-solid fa-book-open"></i>',
                size: { w: 46, h: 46 },
                style: { fill: '#1f3a4d', stroke: '#5fb3ff', strokeWidth: 2, iconColor: '#ffffff' },
                dropShadow: true,
                textLayout: 'right',
                textDisplay: 'hover',
                textColor: '#ffffff',
                textSize: 12,
                config: {
                    journalPageUuid: page.uuid,
                    journalId: page.parent?.id ?? '',
                    pageId: page.id ?? ''
                }
            };
            pin = await pins.create(pinData);
            pinId = pin.id;
            await page.setFlag(MODULE.ID, 'pinId', pinId);
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
                if (placed) ui.notifications.info('Journal page pinned to the scene.');
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
