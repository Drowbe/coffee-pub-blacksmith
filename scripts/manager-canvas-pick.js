// ==================================================================
// ===== CANVAS PICK: DRAG A BOX, GET THE DOCUMENTS INSIDE IT =======
// ==================================================================
// One interactive pick at a time. The box is drawn in the DOM (see styles/canvas-pick.css) and the
// pointer is taken with window capture listeners, so the canvas never sees the left-button gesture:
// the user's selection and active layer are untouched, and right-drag pan and wheel zoom still work.
// See documentation/architecture/architecture-canvas-pick.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/** Placeable document names the pick can return, in the order they are reported. */
export const PICKABLE_TYPES = Object.freeze([
    'Tile', 'Drawing', 'AmbientLight', 'AmbientSound', 'Wall', 'Note', 'Token', 'Region'
]);

export const PICK_CONTAINMENT = Object.freeze(['centre', 'inside', 'intersects']);
export const PICK_LEVELS = Object.freeze(['current', 'all']);

/** Pixels the pointer must travel before a press counts as a drag and not a click. */
const DRAG_THRESHOLD = 4;

function localize(key, fallback) {
    const value = game?.i18n?.localize?.(`${MODULE.ID}.${key}`);
    return value && value !== `${MODULE.ID}.${key}` ? value : fallback;
}

// ==================================================================
// ===== GEOMETRY ===================================================
// ==================================================================

function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function rectInsideRect(inner, outer) {
    return inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height;
}

function rectsOverlap(a, b) {
    return a.x <= b.x + b.width && b.x <= a.x + a.width
        && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** Liang-Barsky: does the segment (x0,y0)-(x1,y1) touch the rectangle at all. */
function segmentTouchesRect(x0, y0, x1, y1, rect) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - rect.x, rect.x + rect.width - x0, y0 - rect.y, rect.y + rect.height - y0];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return false;
        } else {
            const t = q[i] / p[i];
            if (p[i] < 0) {
                if (t > t1) return false;
                if (t > t0) t0 = t;
            } else {
                if (t < t0) return false;
                if (t < t1) t1 = t;
            }
        }
    }
    return true;
}

/**
 * Is this placeable inside the box, by the chosen rule.
 * A wall is a segment, so its rules are the segment's: `centre` is the midpoint, `inside` is both
 * endpoints, `intersects` is any contact. Everything else uses the bounds Foundry reports (a light or
 * sound reports its radius), with `centre` meaning the placeable's centre point.
 */
export function placeableMatches(placeable, rect, containment) {
    const doc = placeable.document;
    if (doc.documentName === 'Wall') {
        const [x0, y0, x1, y1] = doc.c;
        if (containment === 'inside') return pointInRect(x0, y0, rect) && pointInRect(x1, y1, rect);
        if (containment === 'intersects') return segmentTouchesRect(x0, y0, x1, y1, rect);
        return pointInRect((x0 + x1) / 2, (y0 + y1) / 2, rect);
    }
    if (containment === 'inside') return rectInsideRect(placeable.bounds, rect);
    if (containment === 'intersects') return rectsOverlap(placeable.bounds, rect);
    const center = placeable.center;
    return pointInRect(center.x, center.y, rect);
}

/**
 * Is this document on the level being looked at. Walls, tiles, lights, sounds, notes and drawings carry
 * a set of levels where empty means every level; a token carries one level.
 */
function onCurrentLevel(doc) {
    const level = canvas.level;
    if (!level) return true;
    if (doc.schema?.has?.('levels')) return !doc.levels?.size || doc.levels.has(level.id);
    if (doc.schema?.has?.('level')) return doc.level === level.id;
    return true;
}

/** The documents of the scene inside `rect`, across every layer, without touching any layer's state. */
export function collectDocuments(rect, { types, containment, levels }) {
    const found = [];
    for (const type of PICKABLE_TYPES) {
        if (!types.includes(type)) continue;
        const layer = canvas.getLayerByEmbeddedName(type);
        for (const placeable of layer?.placeables ?? []) {
            const doc = placeable.document;
            if (!doc?.isOwner) continue;
            if (levels === 'current' && !onCurrentLevel(doc)) continue;
            if (placeableMatches(placeable, rect, containment)) found.push(doc);
        }
    }
    return found;
}

// ==================================================================
// ===== THE PICK ===================================================
// ==================================================================

function normalizeOptions(options = {}) {
    const {
        types = PICKABLE_TYPES,
        containment = 'centre',
        levels = 'current',
        prompt = localize('canvasPickArea-Hint', 'Drag a box to pick. Esc to cancel.'),
        signal = null
    } = options ?? {};

    if (!Array.isArray(types) || !types.length) {
        throw new TypeError('canvas.pickArea: types must be a non-empty array of document names.');
    }
    const unknown = types.filter((type) => !PICKABLE_TYPES.includes(type));
    if (unknown.length) {
        throw new TypeError(`canvas.pickArea: unknown type(s) ${unknown.join(', ')}. Use: ${PICKABLE_TYPES.join(', ')}.`);
    }
    if (!PICK_CONTAINMENT.includes(containment)) {
        throw new TypeError(`canvas.pickArea: containment must be one of ${PICK_CONTAINMENT.join(', ')}.`);
    }
    if (!PICK_LEVELS.includes(levels)) {
        throw new TypeError(`canvas.pickArea: levels must be one of ${PICK_LEVELS.join(', ')}.`);
    }
    return { types: [...types], containment, levels, prompt: String(prompt), signal };
}

export class CanvasPickManager {
    /** The pick in progress, or null. Calling `cancel()` on it resolves its promise with null. */
    static #active = null;

    /**
     * Let the user drag a box on the canvas and resolve with what is inside it.
     * Starting a pick while one is open cancels the open one, which resolves null.
     * @param {object} [options] See documentation/api/api-canvas.md.
     * @returns {Promise<{rect: {x:number,y:number,width:number,height:number}, documents: foundry.abstract.Document[]}|null>}
     */
    static pickArea(options = {}) {
        const settings = normalizeOptions(options);
        if (!canvas?.ready || !canvas.scene) {
            return Promise.reject(new Error('canvas.pickArea: there is no active scene to pick from.'));
        }
        CanvasPickManager.#active?.cancel();

        return new Promise((resolve) => {
            const view = canvas.app.view;
            const band = document.createElement('div');
            band.className = 'blacksmith-pick-area-band';
            band.hidden = true;
            const hint = document.createElement('div');
            hint.className = 'blacksmith-pick-area-hint';
            hint.textContent = settings.prompt;
            document.body.append(band, hint);

            const previousCursor = view.style.cursor;
            view.style.cursor = 'crosshair';

            // Both corners are kept in scene coordinates, so panning mid-drag keeps the box on the map.
            let start = null;
            let current = null;
            let dragging = false;
            let pressX = 0;
            let pressY = 0;
            let finished = false;

            const toScene = (clientX, clientY) => {
                const bounds = view.getBoundingClientRect();
                const point = canvas.stage.toLocal(new PIXI.Point(clientX - bounds.left, clientY - bounds.top));
                return { x: point.x, y: point.y };
            };
            const toClient = (point) => {
                const bounds = view.getBoundingClientRect();
                const screen = canvas.stage.toGlobal(new PIXI.Point(point.x, point.y));
                return { x: screen.x + bounds.left, y: screen.y + bounds.top };
            };
            const sceneRect = () => {
                const x = Math.min(start.x, current.x);
                const y = Math.min(start.y, current.y);
                return { x, y, width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) };
            };
            const drawBand = () => {
                if (!dragging) return;
                const a = toClient(start);
                const b = toClient(current);
                band.hidden = false;
                band.style.left = `${Math.min(a.x, b.x)}px`;
                band.style.top = `${Math.min(a.y, b.y)}px`;
                band.style.width = `${Math.abs(b.x - a.x)}px`;
                band.style.height = `${Math.abs(b.y - a.y)}px`;
            };

            const finish = (result) => {
                if (finished) return;
                finished = true;
                window.removeEventListener('pointerdown', onPointerDown, true);
                window.removeEventListener('pointermove', onPointerMove, true);
                window.removeEventListener('pointerup', onPointerUp, true);
                window.removeEventListener('keydown', onKeyDown, true);
                Hooks.off('canvasPan', panHookId);
                Hooks.off('canvasTearDown', tearDownHookId);
                settings.signal?.removeEventListener('abort', onAbort);
                view.style.cursor = previousCursor;
                band.remove();
                hint.remove();
                if (CanvasPickManager.#active?.cancel === cancel) CanvasPickManager.#active = null;
                resolve(result);
            };
            const cancel = () => finish(null);
            const onAbort = () => cancel();

            const onPointerDown = (event) => {
                // Only the left button over the canvas itself. Right-drag pans, and UI above the canvas
                // (the sidebar, windows, pins) keeps working.
                if (event.button !== 0 || event.target !== view) return;
                event.stopPropagation();
                event.preventDefault();
                pressX = event.clientX;
                pressY = event.clientY;
                start = toScene(event.clientX, event.clientY);
                current = start;
                dragging = false;
            };
            const onPointerMove = (event) => {
                if (!start) return;
                if (!dragging && Math.hypot(event.clientX - pressX, event.clientY - pressY) < DRAG_THRESHOLD) return;
                dragging = true;
                event.stopPropagation();
                current = toScene(event.clientX, event.clientY);
                drawBand();
            };
            const onPointerUp = (event) => {
                if (!start) return;
                event.stopPropagation();
                event.preventDefault();
                if (!dragging) {
                    // A click with no travel is not a pick; wait for a real drag.
                    start = null;
                    return;
                }
                current = toScene(event.clientX, event.clientY);
                const rect = sceneRect();
                let documents;
                try {
                    documents = collectDocuments(rect, settings);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'canvas.pickArea: collecting documents failed', error?.message ?? error, false, false);
                    documents = [];
                }
                finish({ rect, documents });
            };
            const onKeyDown = (event) => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                event.preventDefault();
                cancel();
            };

            const panHookId = Hooks.on('canvasPan', drawBand);
            const tearDownHookId = Hooks.on('canvasTearDown', cancel);
            window.addEventListener('pointerdown', onPointerDown, true);
            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', onPointerUp, true);
            window.addEventListener('keydown', onKeyDown, true);

            if (settings.signal) {
                if (settings.signal.aborted) {
                    cancel();
                    return;
                }
                settings.signal.addEventListener('abort', onAbort, { once: true });
            }

            CanvasPickManager.#active = { cancel };
        });
    }

    /** Cancel the open pick, if any. Its promise resolves null. */
    static cancel() {
        CanvasPickManager.#active?.cancel();
    }
}
