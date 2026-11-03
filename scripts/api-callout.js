// ==================================================================
// ===== API-CALLOUT.JS =============================================
// ==================================================================
//
// A data box that points at something on the canvas: a title, an image or icon, rows of label and value,
// badges, a few words of body text and buttons, with a tail aimed at the anchor. It is what a plain text
// label cannot be.
//
// DOM, not PIXI: the box is HTML in a fixed overlay, placed from scene coordinates and re-placed on every
// pan and zoom, the same way pins are. That is what lets it carry an image and the shared components
// (`blacksmith-badge`, `blacksmith-tool-btn`) instead of a second look of its own.
//
// The caller passes DATA, never markup. Every string is escaped here, an icon must be a Font Awesome class,
// a badge variant must be one of ours, and appearance is one closed `style` object of measured values (hex
// colours, clamped numbers) that becomes custom properties -- never a class, a style string or a
// stylesheet. It exists so an author can restyle their own callouts; a module that passes none gets the
// same callout as every other, the rule the chat cards hold (tools/check-card-contracts.mjs).
//
// The lifecycle is the caller's: show it, update it, hide it. A hover-driven caller shows on enter and
// hides with `{ grace: true }` on leave; the grace lets the pointer cross the gap and land on the box,
// which keeps it open so a button can be pressed.
//
// See documentation/api/api-callout.md and documentation/architecture/architecture-callout.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

const LAYER_ID = 'blacksmith-callout-layer';
const HOOK_CONTEXT = 'blacksmith-callout';
const BADGE_VARIANTS = new Set(['accent', 'success', 'danger', 'warning', 'info']);
const IMAGE_FITS = new Set(['cover', 'contain', 'fill', 'none', 'scale-down', 'zoom']);
const SIDES = ['top', 'bottom', 'right', 'left'];
const DIAGONALS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const GAP = 10;           // px between the anchor and the box (the tail lives in it); `spec.gap` overrides
const MAX_GAP = 48;
const MARGIN = 8;         // px kept clear of the viewport edge
const TAIL_INSET = 14;    // px the tail keeps from a box corner
const GRACE_MS = 180;     // how long a graceful hide waits for the pointer to land on the box

/** @type {Map<string, {spec: object, el: HTMLElement, timer: number|null, hovered: boolean, leaveHides: boolean, abort: (() => void)|null}>} */
const open = new Map();
let layer = null;
let frame = null;

// ==================================================================
// ===== SANITISING =================================================
// ==================================================================

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/** A Font Awesome class list from `fa-solid fa-user` or `<i class="fa-solid fa-user"></i>`; '' when it is neither. */
function faClass(value) {
    if (typeof value !== 'string') return '';
    const raw = value.trim().startsWith('<') ? (value.match(/class=["']([^"']+)["']/i)?.[1] ?? '') : value;
    const classes = raw.trim().replace(/\s+/g, ' ');
    return /^[a-z0-9 -]+$/i.test(classes) && /\bfa-?[a-z0-9-]*/i.test(classes) ? classes : '';
}

function icon(value) {
    const classes = faClass(value);
    return classes ? `<i class="${classes}"></i>` : '';
}

const HEX = /^#[0-9a-f]{3,8}$/i;
const STYLE_VARS = [
    '--blacksmith-callout-fill', '--blacksmith-callout-stroke', '--blacksmith-callout-stroke-width',
    '--blacksmith-callout-shadow', '--blacksmith-callout-icon-color',
    '--blacksmith-callout-text', '--blacksmith-callout-text-size'
];

/**
 * Put `spec.style` on the box as custom properties, which callout.css reads. This is the one door for
 * appearance and it is closed to anything but a measured value: colours are hex, numbers are clamped.
 * Nothing the caller passes reaches a stylesheet or an attribute as text.
 * Whatever is absent or invalid keeps the stylesheet's own look.
 */
function applyStyle(el, style) {
    for (const prop of STYLE_VARS) el.style.removeProperty(prop);
    if (!style || typeof style !== 'object') return;
    const set = (prop, value) => el.style.setProperty(prop, value);
    const colour = (key, prop) => { if (typeof style[key] === 'string' && HEX.test(style[key].trim())) set(prop, style[key].trim()); };
    const whole = (key, min, max) => { const n = Math.round(Number(style[key])); return style[key] != null && style[key] !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
    colour('fill', '--blacksmith-callout-fill');
    colour('stroke', '--blacksmith-callout-stroke');
    colour('iconColor', '--blacksmith-callout-icon-color');
    colour('textColor', '--blacksmith-callout-text');
    const strokeWidth = whole('strokeWidth', 0, 8);
    if (strokeWidth != null) set('--blacksmith-callout-stroke-width', `${strokeWidth}px`);
    const textSize = whole('textSize', 8, 32);
    if (textSize != null) set('--blacksmith-callout-text-size', `${textSize}px`);
    if (style.dropShadow === false) set('--blacksmith-callout-shadow', 'none');
}

/** The caller-supplied spec, checked once at the door so a bad shape throws where the mistake is. */
function validate(id, spec) {
    if (!id || typeof id !== 'string') throw new TypeError('callout: an id (string) is required');
    if (!spec || typeof spec !== 'object') throw new TypeError('callout: a spec object is required');
    const anchor = spec.anchor;
    const valid = anchor && typeof anchor === 'object' && (
        (Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) || typeof anchor.pinId === 'string' || typeof anchor.uuid === 'string');
    if (!valid) throw new TypeError('callout: anchor must be { x, y } in scene units, { pinId }, or { uuid }');
    if (!spec.title || typeof spec.title !== 'string') throw new TypeError('callout: a title (string) is required');
    if (spec.side != null && spec.side !== 'auto' && !SIDES.includes(spec.side) && !DIAGONALS.includes(spec.side)) {
        throw new TypeError(`callout: side must be 'auto', ${[...SIDES, ...DIAGONALS].map((s) => `'${s}'`).join(', ')}`);
    }
    if (spec.gap != null && !Number.isFinite(spec.gap)) throw new TypeError('callout: gap must be a number of pixels');
    if (spec.interactive != null && typeof spec.interactive !== 'boolean') throw new TypeError('callout: interactive must be a boolean');
    if (spec.interactive === false && spec.actions?.length) throw new TypeError('callout: a callout with interactive: false cannot have actions, nothing in it can be clicked');
    if (spec.style != null && (typeof spec.style !== 'object' || Array.isArray(spec.style))) throw new TypeError('callout: style must be an object');
    for (const key of ['rows', 'badges', 'actions']) {
        if (spec[key] != null && !Array.isArray(spec[key])) throw new TypeError(`callout: ${key} must be an array`);
    }
    for (const action of spec.actions ?? []) {
        if (!action?.label || typeof action.onClick !== 'function') throw new TypeError('callout: every action needs a label and an onClick function');
    }
}

// ==================================================================
// ===== MARKUP =====================================================
// ==================================================================

function renderActions(spec) {
    if (spec.interactive === false) return '';
    const visible = (spec.actions ?? []).map((action, index) => ({ action, index })).filter(({ action }) => {
        if (action.gmOnly && !game.user?.isGM) return false;
        return typeof action.visible === 'function' ? !!action.visible() : action.visible !== false;
    });
    if (!visible.length) return '';
    const buttons = visible.map(({ action, index }) => {
        const tip = action.tooltip ? ` data-tooltip="${esc(action.tooltip)}"` : '';
        return `<button type="button" class="blacksmith-tool-btn" data-callout-action="${index}"${tip}>${icon(action.icon)}${esc(action.label)}</button>`;
    }).join('');
    return `<div class="blacksmith-callout-actions">${buttons}</div>`;
}

function renderMarkup(spec) {
    const fit = IMAGE_FITS.has(spec.imageFit) ? spec.imageFit : 'cover';
    const zoom = Math.max(1, Math.min(2, Number(spec.imageZoom) || 1));
    const media = spec.image
        ? `<span class="blacksmith-callout-image"><img src="${esc(spec.image)}" alt="" data-fit="${fit}" style="--blacksmith-callout-image-zoom: ${zoom}"></span>`
        : (faClass(spec.icon) ? `<span class="blacksmith-callout-icon">${icon(spec.icon)}</span>` : '');
    const titles = `<div class="blacksmith-callout-titles"><div class="blacksmith-callout-title">${esc(spec.title)}</div>${spec.subtitle ? `<div class="blacksmith-callout-subtitle">${esc(spec.subtitle)}</div>` : ''}</div>`;
    const badges = (spec.badges ?? []).length
        ? `<div class="blacksmith-callout-badges">${spec.badges.map((badge) => {
            const entry = typeof badge === 'string' ? { text: badge } : badge;
            const variant = BADGE_VARIANTS.has(entry?.variant) ? ` blacksmith-badge-${entry.variant}` : '';
            return `<span class="blacksmith-badge${variant}">${icon(entry?.icon)}${esc(entry?.text)}</span>`;
        }).join('')}</div>`
        : '';
    const body = spec.body ? `<div class="blacksmith-callout-body">${esc(spec.body)}</div>` : '';
    const rows = (spec.rows ?? []).length
        ? `<dl class="blacksmith-callout-rows">${spec.rows.map((row) => `<div class="blacksmith-callout-row"><dt>${icon(row?.icon)}${esc(row?.label)}</dt><dd>${esc(row?.value)}</dd></div>`).join('')}</dl>`
        : '';
    const footer = spec.footer ? `<div class="blacksmith-callout-footer">${esc(spec.footer)}</div>` : '';
    return `<div class="blacksmith-callout-head">${media}${titles}</div>${badges}${body}${rows}${renderActions(spec)}${footer}`;
}

// ==================================================================
// ===== PLACEMENT ==================================================
// ==================================================================

/** A scene point in client pixels. */
function sceneToClient(x, y) {
    const view = canvas.app?.renderer?.view ?? canvas.app?.canvas;
    if (!view || !canvas.stage) return null;
    const rect = view.getBoundingClientRect();
    const point = canvas.stage.toGlobal(new PIXI.Point(x, y));
    return { x: point.x + rect.left, y: point.y + rect.top };
}

/** The anchor as a client-pixel rectangle, or null when it cannot be found (a deleted pin, another scene). */
function anchorRect(anchor) {
    if (!canvas?.ready) return null;
    if (typeof anchor.pinId === 'string') {
        const el = document.querySelector(`.blacksmith-pin[data-pin-id="${CSS.escape(anchor.pinId)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    let corners;
    if (typeof anchor.uuid === 'string') {
        const bounds = fromUuidSync(anchor.uuid)?.object?.bounds;
        if (!bounds) return null;
        corners = [sceneToClient(bounds.x, bounds.y), sceneToClient(bounds.x + bounds.width, bounds.y + bounds.height)];
    } else {
        corners = [sceneToClient(anchor.x, anchor.y)];
    }
    if (corners.some((c) => !c)) return null;
    const [a, b = a] = corners;
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

/** `spec.gap` in pixels, clamped, else the stock gap. */
function gapOf(spec) {
    return Number.isFinite(spec.gap) ? Math.max(0, Math.min(MAX_GAP, spec.gap)) : GAP;
}

/** The sides to try, in order: the preferred one, then what is nearest to it. A diagonal flips on each axis, then both. */
function sidesFrom(preferred) {
    if (DIAGONALS.includes(preferred)) {
        const [v, h] = preferred.split('-');
        const ov = v === 'top' ? 'bottom' : 'top';
        const oh = h === 'left' ? 'right' : 'left';
        return [preferred, `${v}-${oh}`, `${ov}-${h}`, `${ov}-${oh}`, ...SIDES];
    }
    return SIDES.includes(preferred) ? [preferred, ...SIDES.filter((s) => s !== preferred)] : SIDES;
}

/** Where a box of this size sits on one side (or corner) of the anchor, unclamped, and how much of it fits on screen. */
function candidate(side, a, w, h, gap) {
    const cx = (a.left + a.right) / 2;
    const cy = (a.top + a.bottom) / 2;
    const west = side === 'left' || side.endsWith('-left');
    const east = side === 'right' || side.endsWith('-right');
    const north = side === 'top' || side.startsWith('top-');
    const south = side === 'bottom' || side.startsWith('bottom-');
    const left = west ? a.left - gap - w : east ? a.right + gap : cx - w / 2;
    const top = north ? a.top - gap - h : south ? a.bottom + gap : cy - h / 2;
    const visibleW = Math.min(left + w, innerWidth - MARGIN) - Math.max(left, MARGIN);
    const visibleH = Math.min(top + h, innerHeight - MARGIN) - Math.max(top, MARGIN);
    return { side, left, top, fits: visibleW >= w - 0.5 && visibleH >= h - 0.5 };
}

function place(entry) {
    const { el, spec } = entry;
    const a = anchorRect(spec.anchor);
    const inView = a && a.right > 0 && a.left < innerWidth && a.bottom > 0 && a.top < innerHeight;
    el.style.visibility = inView ? 'visible' : 'hidden';
    if (!inView) return;

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = gapOf(spec);
    const options = sidesFrom(spec.side).map((side) => candidate(side, a, w, h, gap));
    const chosen = options.find((o) => o.fits) ?? options[0];

    const left = Math.max(MARGIN, Math.min(chosen.left, innerWidth - MARGIN - w));
    const top = Math.max(MARGIN, Math.min(chosen.top, innerHeight - MARGIN - h));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    // A corner placement draws its tail on the horizontal edge that faces the anchor, at the end nearest it.
    const edge = chosen.side.split('-')[0];
    el.dataset.side = edge;

    // The tail points at the anchor's centre, kept off the corners; the box was clamped, the anchor was not.
    const vertical = edge === 'top' || edge === 'bottom';
    const centre = vertical ? (a.left + a.right) / 2 - left : (a.top + a.bottom) / 2 - top;
    const extent = vertical ? w : h;
    el.style.setProperty('--blacksmith-callout-tail', `${Math.round(Math.max(TAIL_INSET, Math.min(centre, extent - TAIL_INSET)))}px`);
}

function placeAll() {
    frame = null;
    for (const [id, entry] of open) {
        if (typeof entry.spec.anchor.pinId === 'string' && !anchorRect(entry.spec.anchor)) {
            CalloutAPI.hide(id); // the pin is gone
            continue;
        }
        place(entry);
    }
}

function schedulePlace() {
    if (frame == null) frame = requestAnimationFrame(placeAll);
}

// ==================================================================
// ===== LAYER AND HOOKS ============================================
// ==================================================================

function ensureLayer() {
    if (layer?.isConnected) return layer;
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    layer.className = 'blacksmith-callout-layer';
    layer.addEventListener('click', onLayerClick);
    const after = document.getElementById('blacksmith-pins-overlay') ?? document.getElementById('board');
    if (after?.parentElement) after.parentElement.insertBefore(layer, after.nextSibling);
    else document.body.appendChild(layer);
    return layer;
}

function startHooks() {
    HookManager.registerHook({
        name: 'canvasPan',
        description: 'Callout: keep every open callout on its anchor as the canvas moves',
        context: HOOK_CONTEXT,
        priority: 3,
        callback: () => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            schedulePlace();
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });
    HookManager.registerHook({
        name: 'canvasTearDown',
        description: 'Callout: a callout belongs to the scene it pointed into',
        context: HOOK_CONTEXT,
        priority: 3,
        callback: () => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            CalloutAPI.hideAll();
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });
    window.addEventListener('resize', schedulePlace);
}

function stopHooks() {
    HookManager.disposeByContext(HOOK_CONTEXT);
    window.removeEventListener('resize', schedulePlace);
    if (frame != null) cancelAnimationFrame(frame);
    frame = null;
}

function onLayerClick(event) {
    const button = event.target.closest?.('[data-callout-action]');
    const box = event.target.closest?.('.blacksmith-callout');
    if (!button || !box) return;
    const id = box.dataset.calloutId;
    const entry = open.get(id);
    const action = entry?.spec.actions?.[Number(button.dataset.calloutAction)];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.closeOnClick !== false) CalloutAPI.hide(id);
    try {
        const result = action.onClick({ id, close: () => CalloutAPI.hide(id) });
        if (result?.catch) result.catch((error) => reportError(id, action, error));
    } catch (error) {
        reportError(id, action, error);
    }
}

function reportError(id, action, error) {
    postConsoleAndNotification(MODULE.NAME, `Callout "${id}" action "${action.label}" failed`, error?.message ?? String(error), false, true);
}

// ==================================================================
// ===== API ========================================================
// ==================================================================

export const CalloutAPI = {

    /**
     * Show a callout, or replace the one already open under this id.
     * @param {string} id - Unique per callout; prefix with your module id
     * @param {object} spec
     * @param {{x: number, y: number} | {pinId: string} | {uuid: string}} spec.anchor - A scene point, a pin, or a placeable's document
     * @param {string} spec.title
     * @param {string} [spec.subtitle]
     * @param {string} [spec.image] - Image URL; wins over `icon`
     * @param {'cover'|'contain'|'fill'|'none'|'scale-down'|'zoom'} [spec.imageFit='cover'] - How `image` fills its tile; the same words a pin image takes
     * @param {number} [spec.imageZoom=1] - With `imageFit: 'zoom'`: 1 to 2, 1 being the same as cover
     * @param {string} [spec.icon] - Font Awesome classes, e.g. `fa-solid fa-route`
     * @param {Array<string | {text: string, variant?: 'accent'|'success'|'danger'|'warning'|'info', icon?: string}>} [spec.badges]
     * @param {string} [spec.body] - Plain text; line breaks are kept
     * @param {Array<{label: string, value: string|number, icon?: string}>} [spec.rows]
     * @param {Array<{label: string, onClick: Function, icon?: string, tooltip?: string, gmOnly?: boolean, visible?: boolean|Function, closeOnClick?: boolean}>} [spec.actions]
     * @param {string} [spec.footer]
     * @param {'auto'|'top'|'bottom'|'left'|'right'|'top-left'|'top-right'|'bottom-left'|'bottom-right'} [spec.side='auto'] - Preferred side or corner of the anchor; it flips to stay on screen
     * @param {number} [spec.gap=10] - Pixels between the anchor and the box, 0 to 48
     * @param {boolean} [spec.interactive=true] - false makes the box ignore the pointer, so it never takes events from the canvas; it cannot have `actions`
     * @param {number} [spec.maxWidth=280]
     * @param {{ fill?: string, stroke?: string, strokeWidth?: number, dropShadow?: boolean, iconColor?: string, textColor?: string, textSize?: number }} [spec.style] - Appearance. Colours are hex (`#rrggbb`); anything else is ignored
     * @param {AbortSignal} [spec.signal] - Aborting hides it
     * @returns {() => void} Hides this callout
     * @throws {TypeError} On a bad id or spec
     */
    show(id, spec) {
        validate(id, spec);
        const previous = open.get(id);
        if (previous) {
            clearTimeout(previous.timer);
            previous.el.remove();
            previous.abort?.();
        }
        const el = document.createElement('div');
        el.className = 'blacksmith-callout';
        el.dataset.calloutId = id;
        el.style.maxWidth = `${Math.max(160, Number(spec.maxWidth) || 280)}px`;
        el.style.visibility = 'hidden';
        applyStyle(el, spec.style);
        el.classList.toggle('blacksmith-callout-passive', spec.interactive === false);
        el.innerHTML = renderMarkup(spec);

        const entry ={ spec, el, timer: null, hovered: false, leaveHides: false, abort: null };
        el.addEventListener('mouseenter', () => {
            entry.hovered = true;
            clearTimeout(entry.timer);
        });
        el.addEventListener('mouseleave', () => {
            entry.hovered = false;
            if (entry.leaveHides) CalloutAPI.hide(id, { grace: true });
        });
        if (spec.signal) {
            const onAbort = () => CalloutAPI.hide(id);
            if (spec.signal.aborted) return () => {};
            spec.signal.addEventListener('abort', onAbort, { once: true });
            entry.abort = () => spec.signal.removeEventListener('abort', onAbort);
        }

        if (!open.size) startHooks();
        open.set(id, entry);
        ensureLayer().appendChild(el);
        place(entry);
        return () => CalloutAPI.hide(id);
    },

    /**
     * Change an open callout. The patch is merged over its spec, so send only what changed.
     * @param {string} id
     * @param {object} patch - Any `show` field except `signal`
     * @returns {boolean} false when no callout is open under that id
     */
    update(id, patch) {
        const entry = open.get(id);
        if (!entry) return false;
        const spec = { ...entry.spec, ...patch };
        validate(id, spec);
        entry.spec = spec;
        if ('style' in patch) applyStyle(entry.el, spec.style);
        if ('interactive' in patch) entry.el.classList.toggle('blacksmith-callout-passive', spec.interactive === false);
        if ('maxWidth' in patch) entry.el.style.maxWidth = `${Math.max(160, Number(spec.maxWidth) || 280)}px`;
        entry.el.innerHTML = renderMarkup(spec);
        place(entry);
        return true;
    },

    /**
     * Hide a callout.
     * @param {string} id
     * @param {{grace?: boolean}} [options] - `grace` waits a moment, and keeps it open while the pointer is on the box
     */
    hide(id, { grace = false } = {}) {
        const entry = open.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        if (grace) {
            entry.leaveHides = true;
            entry.timer = setTimeout(() => {
                if (!entry.hovered) CalloutAPI.hide(id);
            }, GRACE_MS);
            return;
        }
        entry.abort?.();
        entry.el.remove();
        open.delete(id);
        if (!open.size) stopHooks();
    },

    /**
     * Hide every open callout, or only those whose id starts with a prefix.
     * @param {string} [prefix]
     */
    hideAll(prefix) {
        for (const id of [...open.keys()]) {
            if (!prefix || id.startsWith(prefix)) CalloutAPI.hide(id);
        }
    },

    /** @param {string} id @returns {boolean} */
    isOpen(id) {
        return open.has(id);
    }
};
