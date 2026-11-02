// ==================================================================
// ===== UTILITY-PIN-CALLOUT.JS =====================================
// ==================================================================
//
// A pin's callout: the pin's own data laid out as an api.callout, shown while the pointer is on the pin.
// Blacksmith is the first consumer of the callout API, and this is all it does with it -- there is no
// pin-only path in the callout itself.
//
// What the box holds, and where each part comes from:
//   - title      the pin's text, else its type's registered name
//   - subtitle   `config.callout.subtitle`, else the type's name (when the title is not already that)
//   - image/icon the pin's own image or Font Awesome icon (`calloutImage.mode` 'pin'), a custom image with its own
//                fit and zoom ('custom'), or none
//   - badges     `config.callout.badges`, else the pin's tags
//   - body, rows `config.callout.body` and `config.callout.rows` -- the data a module hangs on its own pins
//   - buttons    the pin context menu's registered items (the same ones, in the same order), plus Configure
//                Pin for whoever may edit the pin
//
// Whether a pin shows one is the pin's `calloutDisplay`, and how it looks is the pin's `calloutStyle`, both
// set in the Callout section of Configure Pin.
// See documentation/architecture/architecture-callout.md, Pin callouts.

import { CalloutAPI } from './api-callout.js';

const calloutId = (pinId) => `blacksmith-pin:${pinId}`;

/** Pins whose pointer is still on them; a callout built after an async step is dropped when the pointer has left. */
const wanted = new Set();

/** The callout spec for one pin. */
async function specFor(pin) {
    const { PinManager } = await import('./manager-pins.js');
    const userId = game.user?.id ?? '';
    const cfg = (pin.config && typeof pin.config === 'object' && pin.config.callout) || {};
    const typeLabel = PinManager.getPinTypeLabel(pin.moduleId, pin.type) || '';

    const title = pin.text?.trim() || typeLabel || 'Pin';
    const picture = pin.calloutImage ?? {};
    const mode = picture.mode ?? 'pin';
    const image = mode === 'custom' ? (picture.src ?? '') : (mode === 'pin' ? (pin.image ?? '') : '');
    const isIcon = mode === 'pin' && /^fa[a-z-]*\s|\bfa-/.test(image);

    const actions = PinManager.getContextMenuItems(pin, userId)
        .filter((item) => !item.submenu)
        .map((item) => ({ label: item.name, icon: item.icon, tooltip: item.description, onClick: () => item.callback() }));
    if (PinManager._canEdit(pin, userId)) {
        actions.push({
            label: 'Configure Pin',
            icon: 'fa-solid fa-cog',
            onClick: () => game.modules.get('coffee-pub-blacksmith')?.api?.pins?.configure(pin.id, { sceneId: canvas?.scene?.id })
        });
    }

    return {
        anchor: { pinId: pin.id },
        title,
        subtitle: cfg.subtitle ?? (typeLabel && typeLabel !== title ? typeLabel : undefined),
        image: image && !isIcon ? image : undefined,
        imageFit: mode === 'custom' ? picture.fit : (mode === 'pin' ? pin.imageFit : undefined),
        imageZoom: mode === 'custom' ? picture.zoom : (mode === 'pin' ? pin.imageZoom : undefined),
        icon: isIcon ? image : undefined,
        badges: cfg.badges ?? (pin.tags ?? []),
        body: cfg.body,
        rows: cfg.rows,
        footer: cfg.footer,
        actions,
        style: pin.calloutStyle,
        maxWidth: pin.calloutStyle?.width
    };
}

export const PinCallout = {

    /** Show a pin's callout if the pin asks for one. Called as the pointer enters the pin. */
    async show(pin) {
        if (!pin || (pin.calloutDisplay ?? 'never') !== 'hover') return;
        wanted.add(pin.id);
        const spec = await specFor(pin);
        if (!wanted.has(pin.id)) return;
        CalloutAPI.show(calloutId(pin.id), spec);
    },

    /** Hide it. `grace` lets the pointer cross to the box; without it the box goes at once (a press, a drag, a deletion). */
    hide(pinId, { grace = false } = {}) {
        wanted.delete(pinId);
        CalloutAPI.hide(calloutId(pinId), { grace });
    }
};
