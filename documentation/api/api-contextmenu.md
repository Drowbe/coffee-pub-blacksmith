# Context Menu API

**Audience:** developers of Coffee Pub modules that need a right-click menu, in or out of a Foundry application.

Scope: the public surface of `blacksmith.uiContextMenu` - showing a menu, its item shape, zones, and flyouts.

Implementation is `scripts/ui-context-menu.js`; styling is `styles/menu-context-global.css`.

## Showing a menu

```javascript
blacksmith.uiContextMenu.show({
    id: 'my-module-token-menu',
    x: event.clientX,
    y: event.clientY,
    zones: [
        { name: 'Open Sheet', icon: 'fa-solid fa-user', callback: () => actor.sheet.render(true) },
        { separator: true },
        { name: 'Delete', icon: 'fa-solid fa-trash', callback: () => actor.delete() }
    ]
});
```

| Option | Default | Behavior |
|---|---|---|
| `id` | required | Unique menu id. Showing the same id again closes the previous menu first, so a re-trigger cannot stack menus. Throws if omitted. |
| `x` / `y` | required | Client coordinates, normally from the triggering event. |
| `zones` | required | Either a flat array of items, or a zones object - see Zones. |
| `root` | `document.body` | Element to append the menu to. Pass the popout's element when the trigger lives in a popped-out window, or the menu appends to the wrong document. |
| `className` | `''` | Extra class on the menu root, for consumer styling. |
| `zoneClass` | `'core'` | Which zone tint a flat array is rendered in. |
| `maxWidth` | `300` | Applied as an inline max-width in pixels. |

`show` returns nothing. Use `close(id)` to dismiss a specific menu and `closeAll()` for every open one.

## Items

| Field | Meaning |
|---|---|
| `name` | The label. Rendered as text, so markup in it is shown literally rather than parsed. |
| `icon` | Font Awesome classes, or raw HTML. See Icons and images. |
| `description` | Optional second line under the label, in a smaller muted style. Also rendered as text. |
| `callback` | Invoked on click, awaited, and the menu closes afterwards. A throw is caught and logged rather than left unhandled. |
| `disabled` | Adds a disabled style and removes the click handler. A disabled item with a submenu still opens the submenu. |
| `separator` | When true the entry renders as a divider and every other field is ignored. |
| `submenu` | Array of items. Turns the row into a flyout - see Flyouts. |

## Icons and images

`icon` accepts either form, decided by whether the string starts with `<`:

- **Font Awesome classes** - `icon: 'fa-solid fa-trash'` is wrapped in an `<i>` for you.
- **Raw HTML** - anything beginning with `<` is inserted as-is, which is how images work.

For an image, use the sizing class the stylesheet provides:

```javascript
icon: `<img class="context-menu-item-portrait" src="${actor.img}" alt="">`
```

`.context-menu-item-portrait` gives a 24 by 24 thumbnail with `object-fit: cover`, which is what you want for
a portrait. The combat bar's Graveyard menu uses exactly this (`manager-combatbar.js:3591`).

The icon slot itself is also sized, so a bare `<img>` no longer stretches the row - it is constrained to the
slot with `object-fit: contain`. Use `.context-menu-item-portrait` when you want the image cropped square, and
rely on the slot when you want it fitted whole. Both are 24 pixels and both get the same border, radius and
backing fill, so the choice is about cropping rather than appearance.

An image in the slot is given a thumbnail treatment - a hairline border, a small radius, and a faint backing
fill - and a Font Awesome glyph is not. That asymmetry is deliberate: a bordered rounded box around a glyph
looks like a mistake. The backing fill matters more than it sounds, because item and macro artwork is often a
transparent PNG that loses its edges against the menu's own dark translucent panel.

Both treatments respond to row state: the border warms on hover, and both dim with a disabled row rather than
staying vivid on a greyed-out entry.

**The raw HTML form is inserted with `innerHTML`, so pass only markup you control.** An icon string built
from a journal field, a chat message, an actor name, or anything else a player can influence is an injection
path. Font Awesome classes are the safe default; reach for HTML when you specifically need an image.

## Zones

A zones object groups items into three tinted bands, separated automatically, rendered in this order:

```javascript
zones: {
    module: [ /* the calling module's own actions */ ],
    core:   [ /* Blacksmith actions */ ],
    gm:     [ /* GM-only actions */ ]
}
```

Empty zones are skipped, and separators are only inserted between bands that have content. A flat array is
equivalent to supplying one zone, named by `zoneClass`.

The tint carries meaning: it tells a user which class of thing an action belongs to. A GM action rendered in
the core band reads as something every player can do.

## Flyouts

An item with a `submenu` array becomes a flyout. It opens on hover, gets an arrow, and closes when the
pointer leaves after a short delay. Opening one closes any sibling flyout, so only one is ever open.

A flyout inherits its parent zone's tint deliberately: a GM-zone submenu rendered in the core colour would
read as a different class of action than the row that opened it.

Submenus are appended to `document.body` rather than to the menu, so they are not clipped by it.

## Dismissal

A menu closes on a pointer press outside it, on Escape, after an item's callback resolves, or when `close(id)`
or `closeAll()` is called. Its listeners are removed on close, so a closed menu leaves nothing behind.

Three properties of that worth knowing, because each one exists to fix a way the menu used to get stuck:

**Dismissal listens in the capture phase.** A consumer whose own UI calls `stopPropagation()` on its clicks -
a map that swallows clicks to place things on it, for instance - would otherwise trap the menu open, because
the event never reaches the document. Capture means the menu sees the press regardless.

**Escape closes the menu and stops there.** It does not reach the application behind it, so a menu open over
one of your windows no longer closes both at once. Press Escape again to close the window.

**It listens on `pointerdown`, not `click`.** This is why it works whether you open the menu on `click` or on
`pointerdown`: the listener is armed on the next tick, by which point the opening gesture has been dispatched,
so it cannot see its own trigger. There is no timing window in which an outside press is ignored.

A menu whose `root` is a popped-out window is dismissed by presses in either document, not only the popout.

## Positioning

The menu is placed at the coordinates given, then pulled back inside the viewport with an 8 pixel margin if
it would overflow the right edge or the bottom. It is measured after being added to the document, so its real
rendered size is used rather than an estimate.

A menu taller than the viewport is capped and scrolls rather than running off the bottom of the screen. The
cap leaves the same 8 pixel margin the position clamp uses. Submenus carry the same class, so they are bounded
the same way, and because they are appended to the document body rather than to the menu they are never
clipped by it.

A very long list still reads better as a flyout than as a scrolling column, but it is no longer unreachable.
