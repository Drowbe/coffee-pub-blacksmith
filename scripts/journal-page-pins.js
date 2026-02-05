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
        console.log('[Blacksmith] JournalPagePins: registering hooks');
        // Fallback direct registration in case HookManager is bypassed
        Hooks.on('renderJournalSheet', (app, html, data) => this._onRenderSheet(app, html, data));
        Hooks.on('renderJournalPageSheet', (app, html, data) => this._onRenderSheet(app, html, data));

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

    static _onRenderSheet(app, html) {
        console.log('[Blacksmith] JournalPagePins: render hook fired', app?.constructor?.name);
        const root = this._normalizeHtml(html, app);
        if (!root) {
            console.log('[Blacksmith] JournalPagePins: no root element', app?.constructor?.name);
            return;
        }
        if (this._isEditMode(root)) return;

        const page = this._resolvePage(app, root);
        if (!page) {
            console.log('[Blacksmith] JournalPagePins: no page resolved', app?.constructor?.name);
            return;
        }

        this._injectButton(root, page);
        // Re-run shortly after render in case other modules mutate the header
        setTimeout(() => this._injectButton(root, page), 200);
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
            console.log('[Blacksmith] JournalPagePins: header not found on render');
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

        const closeButton = header.querySelector('.header-button.close, .header-control.close, button.close, a.close');
        if (closeButton) closeButton.insertAdjacentElement('beforebegin', button);
        else header.appendChild(button);

        console.log('[Blacksmith] JournalPagePins: button injected', { page: page.id, headerClass: header.className });
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

            await this._enterPlacementMode({ pinId, page, pins, currentSceneId: sceneId });
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
            const label = page.name || page.parent?.name || 'Journal Page';
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

    static async _enterPlacementMode({ pinId, page, pins, currentSceneId }) {
        if (this._cleanupPlacement) {
            this._cleanupPlacement();
            this._cleanupPlacement = null;
        }

        const originalCursor = canvas.stage.cursor;
        canvas.stage.cursor = 'crosshair';
        document.body.classList.add(this.PLACEMENT_CLASS);

        const cancelPlacement = () => {
            cleanup();
            ui.notifications.info('Pin placement cancelled.');
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                cancelPlacement();
            }
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

                if (placed) {
                    ui.notifications.info('Journal page pinned to the scene.');
                }
            } catch (error) {
                ui.notifications.error(`Could not place pin: ${error?.message || error}`);
            }
        };

        const cleanup = () => {
            canvas.stage.off('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            canvas.stage.cursor = originalCursor || 'default';
            document.body.classList.remove(this.PLACEMENT_CLASS);
            this._cleanupPlacement = null;
        };

        canvas.stage.on('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        this._cleanupPlacement = cleanup;
    }

    static _getPinsApi() {
        return game.modules.get(MODULE.ID)?.api?.pins;
    }
}
