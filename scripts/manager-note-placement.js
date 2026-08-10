// ==================================================================
// ===== NOTE PLACEMENT =============================================
// ==================================================================
//
// The click-the-map-to-pin-this-note interaction.
//
// It lives in its own manager rather than in the editor because it
// outlives the window: placing a note closes the editor so you can see
// the map, and the interaction has to keep running after it is gone.
//
// Placement itself is Pins' -- this only captures a point and hands it
// over. There is one placement implementation in Blacksmith and it is not
// this file.
//
// Placing also creates an ANNOTATION with a `point` anchor, which is what
// makes `notes.getByTarget(scene)` return the notes pinned to a scene. A
// pin the annotation layer does not know about is a note you cannot find
// from the thing it is attached to, which is the failure the whole layer
// exists to prevent.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { PinsAPI } from './api-pins.js';
import { NotesManager, ANCHOR_KINDS } from './manager-notes.js';

const CURSOR_CLASS = 'blacksmith-note-placing';

export class NotePlacementManager {

    /** The live placement, or null. One at a time. */
    static _active = null;

    /**
     * Start placing a note's pin. Cancelled with Escape or right-click.
     *
     * @param {object} options
     * @param {string} options.noteUuid
     * @param {string} options.pinId the note's pin, already created and unplaced
     * @returns {boolean} whether placement started
     */
    static begin({ noteUuid, pinId }) {
        if (!noteUuid || !pinId) return false;

        const view = canvas?.app?.view;
        if (!canvas?.scene || !view) {
            ui.notifications.warn('Open a scene before placing a note.');
            return false;
        }

        // Starting a second placement would leave the first one's listeners live,
        // and the map would then place two notes on one click.
        if (this._active) this.cancel();

        document.body.classList.add(CURSOR_CLASS);

        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();

            // Screen point to canvas point. The view's bounding rect handles the
            // canvas element's own offset; toLocal handles pan and zoom.
            const rect = view.getBoundingClientRect();
            const local = canvas.stage?.toLocal({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            });
            if (!local) {
                ui.notifications.warn('Could not read that canvas position.');
                this.cancel();
                return;
            }

            const sceneId = canvas.scene.id;
            this.cancel();
            await this._place({ noteUuid, pinId, sceneId, x: local.x, y: local.y });
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.cancel();
        };

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            this.cancel();
        };

        // Capture phase: the canvas has its own pointer handling, and without
        // capturing, a click lands on a token or starts a drag-select instead.
        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);

        this._active = { view, onPointerDown, onContextMenu, onKeyDown };
        ui.notifications.info('Click the map to place this note. Escape or right-click cancels.');
        return true;
    }

    /** Tear down the interaction. Safe to call when nothing is active. */
    static cancel() {
        const active = this._active;
        if (!active) return;
        this._active = null;

        active.view?.removeEventListener('pointerdown', active.onPointerDown, true);
        active.view?.removeEventListener('contextmenu', active.onContextMenu, true);
        window.removeEventListener('keydown', active.onKeyDown);
        document.body.classList.remove(CURSOR_CLASS);
    }

    /** Place the pin and record the annotation that makes the note findable from the scene. */
    static async _place({ noteUuid, pinId, sceneId, x, y }) {
        try {
            const placed = await PinsAPI.place(pinId, { sceneId, x, y });
            if (!placed) {
                ui.notifications.error('Could not place the note pin.');
                return;
            }

            const note = fromUuidSync(noteUuid);
            const scene = game.scenes.get(sceneId);
            if (note && scene) {
                // The anchor carries the pin id rather than coordinates: Pins owns
                // where it is, and duplicating x/y here would be a second copy to
                // keep in step every time somebody drags the marker.
                await NotesManager.attach(note, scene, {
                    anchor: { kind: ANCHOR_KINDS.POINT, pinId }
                });
            }

            ui.notifications.info(`Placed "${note?.name ?? 'note'}" on ${scene?.name ?? 'the scene'}.`);
            Hooks.callAll('blacksmith.notes.placed', { noteUuid, pinId, sceneId });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: placing the pin failed', error?.message ?? error, false, false);
            ui.notifications.error('Could not place the note pin.');
        }
    }

    /**
     * Remove a note's pin from the canvas, keeping the pin and its design.
     *
     * `unplace` rather than `delete` so re-pinning restores the icon the user
     * chose. The annotation goes, because the note is no longer on that scene and
     * leaving it would make `getByTarget(scene)` lie.
     */
    static async unplace(noteUuid) {
        const note = typeof noteUuid === 'string' ? fromUuidSync(noteUuid) : noteUuid;
        const pinId = note?.getFlag(MODULE.ID, 'pinId');
        if (!pinId) return false;

        try {
            const pin = PinsAPI.get(pinId);
            const sceneId = pin?.sceneId;
            await PinsAPI.unplace(pinId);

            if (sceneId) {
                const scene = game.scenes.get(sceneId);
                if (scene) await NotesManager.detachTarget(note, scene);
            }

            Hooks.callAll('blacksmith.notes.unplaced', { noteUuid: note.uuid, pinId });
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: unplacing the pin failed', error?.message ?? error, false, false);
            return false;
        }
    }

    /** Register the listener the editor fires when it closes to let you see the map. */
    static initialize() {
        Hooks.on('blacksmith.notes.requestPlacement', ({ noteUuid, pinId }) => {
            this.begin({ noteUuid, pinId });
        });
    }
}
