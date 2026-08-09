// ==================================================================
// ===== MACROS WINDOW ==============================================
// ==================================================================
//
// A drop target for Foundry Macros: drag macros in, reorder them, run them,
// and mark favourites that appear on the menubar tool's right-click menu.
// Adopted from Squire, where it was split across a panel class and a window
// shell; here it is one file.
//
// The list lives in the `userMacros` setting as {id, name, img} pointers to
// Macro documents -- the macro itself is never copied, so a macro deleted from
// the world leaves an empty slot rather than a broken copy.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow } from './api-windows.js';
import { MenuBar } from './api-menubar.js';
import { setToolWindowState } from './manager-tool-windows.js';

export const MACROS_WINDOW_ID = 'blacksmith-macros';

/** Squire's registry id, kept so any macro calling it keeps working. */
export const MACROS_LEGACY_WINDOW_ID = 'coffee-pub-squire-macros-window';

/** Slots shown when the list is empty, so there is always somewhere to drop. */
const MIN_SLOTS = 1;

/** How long a slot shows its "running" spinner after a macro is launched. */
const RUN_FEEDBACK_MS = 600;

/**
 * The actor whose name titles the window. Cosmetic, exactly as in the dice tray --
 * a macro runs against whatever its own script resolves, never this actor.
 * @returns {Actor|null}
 */
function getCurrentActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

/** The stored macro list, with junk entries dropped. */
function readMacros() {
    const macros = game.settings.get(MODULE.ID, 'userMacros') || [];
    return macros.filter((m) => m && typeof m === 'object');
}

export class MacrosWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    /** The open instance, so the menubar tool raises it rather than opening a second one. */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-macros-window',
            classes: ['blacksmith-macros-tool-window'],
            position: {
                width: 400,
                height: 300
            },
            window: {
                title: 'Macros',
                resizable: true,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: null,
                maxWidth: 2400,
                maxHeight: null
            },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'blacksmith-macros-tool-position'
        }
    );

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-blacksmith/templates/window-tool-template.hbs'
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? MacrosWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, MacrosWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, MacrosWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.actor = getCurrentActor();
        this._registeredActor = null;
        this._registerActor(this.actor);
        this._runFeedbackTimers = new Set();
        this._hookContext = `macros:${this.id}`;

        HookManager.registerHook({
            name: 'controlToken',
            description: 'Macros: retitle for the selected token',
            priority: 4,
            context: this._hookContext,
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                void this.updateActor(getCurrentActor());
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    get title() {
        return `Macros: ${this.actor?.name || 'No Character'}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    getToolHeaderActions() {
        return [{
            id: 'open-macro-folder',
            icon: 'fa-solid fa-folder-open',
            label: 'Open Macros Folder',
            onClick: () => ui.macros?.renderPopout?.()
        }];
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    async getData() {
        let macros = readMacros();
        if (macros.length < MIN_SLOTS) macros = [{ id: null, name: null, img: null }];

        const favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];

        const content = await foundry.applications.handlebars.renderTemplate(
            'modules/coffee-pub-blacksmith/templates/window-macros.hbs',
            {
                actor: this.actor,
                macros,
                favoriteMacroIds
            }
        );

        return {
            appId: this.id,
            bodyContent: content
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this._activateMacroListeners(this.element);
    }

    // ==============================================================
    // ===== DRAG DATA ==============================================
    // ==============================================================

    /** Read drop payload, preferring Foundry's own decoder and falling back to raw MIME types. */
    _getDragData(event) {
        const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation
            || globalThis.TextEditor?.implementation
            || globalThis.TextEditor;
        if (typeof textEditor?.getDragEventData === 'function') {
            try {
                const data = textEditor.getDragEventData(event);
                if (data && Object.keys(data).length) return data;
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Macros: could not decode drag data', error?.message ?? error, true, false);
            }
        }

        for (const type of ['text/plain', 'application/json', 'text']) {
            const raw = event.dataTransfer?.getData(type);
            if (!raw) continue;
            try {
                return JSON.parse(raw);
            } catch (_) {
                // Try the next MIME type.
            }
        }
        return {};
    }

    /** Resolve a drop payload to a Macro document, or null if it is not one. */
    async _resolveDroppedMacro(data) {
        if (!data || data.type === 'internal-macro') return null;
        if (data.type !== 'Macro' && data.data?.type !== 'Macro' && !data.uuid?.startsWith('Macro.')) {
            return null;
        }

        const macroId = data.id || data.data?._id || data.data?.id || data.uuid?.split('.').pop();
        let macro = macroId ? game.macros.get(macroId) : null;
        if (!macro && data.uuid && typeof globalThis.fromUuid === 'function') {
            macro = await globalThis.fromUuid(data.uuid);
        }
        return macro?.documentName === 'Macro' ? macro : null;
    }

    /**
     * Append a dropped macro to the list.
     *
     * Guarded against re-entry: AppV2 windows share Foundry's global drag surface, so
     * two handlers can see one drop, and this is a read-modify-write on a setting --
     * two concurrent adds would lose one. Inherited from Squire, where it fixed exactly
     * that.
     */
    async _addDroppedMacro(data) {
        if (this._dropInProgress) return false;
        this._dropInProgress = true;
        try {
            const macro = await this._resolveDroppedMacro(data);
            if (!macro) return false;

            const macros = readMacros();
            macros.push({ id: macro.id, name: macro.name, img: macro.img });
            await game.settings.set(MODULE.ID, 'userMacros', macros);
            await this.render(false);
            return true;
        } finally {
            this._dropInProgress = false;
        }
    }

    // ==============================================================
    // ===== LISTENERS ==============================================
    // ==============================================================

    _activateMacroListeners(root) {
        if (!root) return;
        const panel = root.querySelector?.('#blacksmith-macros-content');
        if (!panel) return;

        const macrosGrid = panel.querySelector('.macros-grid');
        let isInternalDrag = false;

        const getLastSlot = () => {
            const slots = macrosGrid?.querySelectorAll('.macro-slot:not(.add-slot)');
            return slots?.length ? slots[slots.length - 1] : null;
        };

        // Feedback goes on our own content element, never on the ApplicationV2 frame --
        // restyling the frame disrupts Foundry's positioned UI.
        const showDropTarget = () => {
            panel.classList.add('macro-drop-target');
            getLastSlot()?.classList.add('drop-target-slot');
        };
        const hideDropTarget = () => {
            panel.classList.remove('macro-drop-target');
            getLastSlot()?.classList.remove('drop-target-slot');
        };

        // Captured at the content boundary so canvas and sidebar handlers cannot also
        // process an external macro drop. Internal reordering still reaches the slots.
        panel.addEventListener('dragenter', (e) => {
            if (isInternalDrag) return;
            e.preventDefault();
            e.stopPropagation();
            showDropTarget();
        }, true);

        panel.addEventListener('dragover', (e) => {
            if (isInternalDrag) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            showDropTarget();
        }, true);

        panel.addEventListener('dragleave', (e) => {
            if (isInternalDrag) return;
            e.preventDefault();
            e.stopPropagation();
            if (!e.relatedTarget || !panel.contains(e.relatedTarget)) hideDropTarget();
        }, true);

        panel.addEventListener('drop', async (e) => {
            const data = this._getDragData(e);
            if (data?.type === 'internal-macro') return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            isInternalDrag = false;
            hideDropTarget();
            try {
                const added = await this._addDroppedMacro(data);
                if (!added) ui.notifications.warn('Only macros can be dropped here.');
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Macros: failed to add dropped macro', error?.message ?? error, false, false);
                ui.notifications.error('Failed to add macro.');
            }
        }, true);

        panel.addEventListener('dragend', () => {
            isInternalDrag = false;
            hideDropTarget();
        });

        panel.querySelectorAll('.macro-slot').forEach((slot, idx) => {
            slot.setAttribute('draggable', !slot.classList.contains('empty'));

            slot.addEventListener('dragstart', (e) => {
                if (slot.classList.contains('empty')) return;
                e.stopPropagation();
                isInternalDrag = true;
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'internal-macro', fromIndex: idx }));
                const img = slot.querySelector('img');
                if (img) e.dataTransfer.setDragImage(img, 16, 16);
            });

            slot.addEventListener('dragend', (e) => {
                e.stopPropagation();
                isInternalDrag = false;
                hideDropTarget();
            });

            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
            });
            slot.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.add('dragover');
            });
            slot.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.remove('dragover');
            });

            slot.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.remove('dragover');

                const data = this._getDragData(e);
                if (!data || !Object.keys(data).length) {
                    ui.notifications.warn('Invalid drag data.');
                    return;
                }

                if (data.type === 'internal-macro' && typeof data.fromIndex === 'number') {
                    if (data.fromIndex === idx) return;
                    const macros = readMacros();
                    const [moved] = macros.splice(data.fromIndex, 1);
                    macros.splice(idx, 0, moved);
                    await game.settings.set(MODULE.ID, 'userMacros', macros);
                    await this.render(false);
                    return;
                }

                if (!await this._addDroppedMacro(data)) {
                    ui.notifications.warn('Only macros can be dropped here.');
                }
            });

            // Left click runs the macro; Shift+left is the remove gesture handled below.
            slot.addEventListener('click', (e) => {
                if (slot.classList.contains('empty')) return;
                if (e.button !== 0 || e.shiftKey) return;
                const macroId = readMacros()[idx]?.id;
                const macro = macroId ? game.macros.get(macroId) : null;
                if (!macro) return;

                this._showRunFeedback(slot);
                macro.execute();
            });

            // Right click toggles favourite, which is what the menubar menu lists.
            slot.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (slot.classList.contains('empty')) return;

                const macroId = readMacros()[idx]?.id;
                if (!macroId) return;

                let favoriteMacroIds = game.settings.get(MODULE.ID, 'userFavoriteMacros') || [];
                favoriteMacroIds = favoriteMacroIds.includes(macroId)
                    ? favoriteMacroIds.filter((id) => id !== macroId)
                    : [...favoriteMacroIds, macroId];
                await game.settings.set(MODULE.ID, 'userFavoriteMacros', favoriteMacroIds);
                await this.render(false);
            });

            // Middle click or Shift+left clears the slot, then removes it once empty.
            slot.addEventListener('mousedown', async (e) => {
                if (!(e.button === 1 || (e.button === 0 && e.shiftKey))) return;
                e.preventDefault();
                e.stopPropagation();

                let macros = readMacros();
                let removedMacroId = null;

                if (macros[idx] && typeof macros[idx].id === 'string' && macros[idx].id.length > 0) {
                    removedMacroId = macros[idx].id;
                    macros[idx] = { id: null, name: null, img: null };
                } else if (macros.length > 1) {
                    removedMacroId = macros[idx]?.id || null;
                    macros.splice(idx, 1);
                }

                // Always leave somewhere to drop.
                if (macros.length === 0) macros = [{ id: null, name: null, img: null }];

                await game.settings.set(MODULE.ID, 'userMacros', macros);

                // A macro no longer in the list cannot stay favourited, or the menubar
                // menu would list something the window does not show.
                if (removedMacroId && !macros.some((m) => m.id === removedMacroId)) {
                    const favoriteMacroIds = (game.settings.get(MODULE.ID, 'userFavoriteMacros') || [])
                        .filter((id) => id !== removedMacroId);
                    await game.settings.set(MODULE.ID, 'userFavoriteMacros', favoriteMacroIds);
                }

                await this.render(false);
            });
        });
    }

    /** Brief spinner so a macro with no visible output still acknowledges the click. */
    _showRunFeedback(slot) {
        if (!slot.querySelector('.macro-loader')) {
            const loader = document.createElement('span');
            loader.className = 'macro-loader';
            loader.innerHTML = '<i class="fa-solid fa-sun macro-spinner"></i>';
            slot.appendChild(loader);
        }
        slot.classList.add('loading');

        const timer = setTimeout(() => {
            this._runFeedbackTimers.delete(timer);
            slot.classList.remove('loading');
            slot.querySelector('.macro-loader')?.remove();
        }, RUN_FEEDBACK_MS);
        this._runFeedbackTimers.add(timer);
    }

    // ==============================================================
    // ===== ACTOR TRACKING =========================================
    // ==============================================================

    _registerActor(actor) {
        if (!actor || this._registeredActor === actor) return;
        this._unregisterActor();
        actor.apps[this.id] = this;
        this._registeredActor = actor;
    }

    _unregisterActor() {
        if (!this._registeredActor) return;
        delete this._registeredActor.apps[this.id];
        this._registeredActor = null;
    }

    async updateActor(actor) {
        if (this.actor === (actor || null)) return;
        this._unregisterActor();
        this.actor = actor || null;
        this._registerActor(this.actor);
        await this.render(false);
    }

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    _onClose(options) {
        for (const timer of this._runFeedbackTimers) clearTimeout(timer);
        this._runFeedbackTimers.clear();
        this._unregisterActor();
        HookManager.disposeByContext(this._hookContext);
        MacrosWindow.activeWindow = null;
        void setToolWindowState('macros', false);
        super._onClose?.(options);
    }
}

/**
 * Open the macros window, or raise it if it is already open.
 * @returns {Promise<MacrosWindow>}
 */
export async function openMacrosWindow() {
    try {
        if (MacrosWindow.activeWindow) {
            MacrosWindow.activeWindow.bringToFront?.();
            return MacrosWindow.activeWindow;
        }

        const window = new MacrosWindow();
        MacrosWindow.activeWindow = window;
        await window.render(true);
        await setToolWindowState('macros', true);
        return window;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Macros: failed to open', error?.message ?? error, false, false);
        ui.notifications.error('Failed to open macros');
    }
}

/**
 * The menubar tool's right-click menu: the window, then the favourites.
 *
 * Built fresh on each open rather than frozen at registration, so favouriting a
 * macro shows up without a reload.
 */
function buildMacrosContextMenu() {
    const items = [{
        name: 'Show Macro Window',
        icon: 'fa-solid fa-code',
        onClick: () => openMacrosWindow()
    }];

    const favorites = (game.settings.get(MODULE.ID, 'userFavoriteMacros') || [])
        .map((id) => game.macros.get(id))
        .filter(Boolean);

    if (favorites.length) {
        items.push({ separator: true });
        for (const macro of favorites) {
            items.push({
                // Macros are identified by their artwork in Foundry's own hotbar, so a
                // column of identical play triangles is the least useful thing this
                // list could show. Falls back to the triangle when a macro has no image.
                name: macro.name,
                icon: macro.img ? `<img src="${macro.img}" alt="">` : 'fa-solid fa-play',
                onClick: () => macro.execute()
            });
        }
    }

    return items;
}

/** Register the window (under both ids) and its menubar tool. */
export function registerMacros() {
    BlacksmithToolWindowBaseV2.migratePositionKey('squire-macros-tool-position', 'blacksmith-macros-tool-position');

    const descriptor = {
        moduleId: MODULE.ID,
        title: 'Macros',
        open: async () => openMacrosWindow()
    };
    registerWindow(MACROS_WINDOW_ID, descriptor);
    registerWindow(MACROS_LEGACY_WINDOW_ID, descriptor);

    MenuBar.registerMenubarTool('macros', {
        icon: 'fa-solid fa-code',
        name: 'macros',
        title: null,
        tooltip: 'Macro window (right-click for favorites)',
        onClick: () => openMacrosWindow(),
        contextMenuItems: () => buildMacrosContextMenu(),
        zone: 'left',
        group: 'general',
        order: 202,
        moduleId: MODULE.ID,
        gmOnly: false,
        leaderOnly: false,
        visible: true,
        // Remove once Squire's release dropping this tool has shipped.
        supersedes: ['squire-macros']
    });

    return true;
}
