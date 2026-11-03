# Callout API

**Audience:** module authors who want a data box that points at something on the canvas, and Blacksmith contributors.

A callout is a box with a tail aimed at an anchor: a title, an image or icon, badges, rows of label and value, a few words of body text and buttons. It replaces a bare text label when the thing deserves formatted data. The box is HTML in an overlay, kept on its anchor through every pan and zoom.

Access it at `game.modules.get('coffee-pub-blacksmith').api.callout`. Design notes are in `architecture/architecture-callout.md`.

## Data, not markup

You hand over data and Blacksmith draws it, so a callout looks the same whichever module made it.

- Every string is escaped. There is no HTML option.
- An icon is a Font Awesome class list (`fa-solid fa-route`). Anything else is ignored.
- A badge variant is one of `accent`, `success`, `danger`, `warning`, `info`, or none.
- Appearance is the one `style` object below: measured values only, never a class, a style string or HTML. Pass none and your callout looks like every other.
- Buttons are the shared `blacksmith-tool-btn`, badges the shared `blacksmith-badge`.

## Example

```javascript
const callout = game.modules.get('coffee-pub-blacksmith').api.callout;

callout.show('my-module:route-12', {
  anchor: { x: 2400, y: 1800 },                 // a scene point
  title: 'Phlan to Melvaunt',
  subtitle: 'Road',
  icon: 'fa-solid fa-route',
  badges: ['Trade route', { text: 'Dangerous', variant: 'danger' }],
  rows: [
    { label: 'Distance', value: '55 mi', icon: 'fa-solid fa-ruler' },
    { label: 'On foot', value: '3 days' }
  ],
  actions: [
    { label: 'Travel here', icon: 'fa-solid fa-person-walking', onClick: () => startTravel(12) }
  ]
});

callout.hide('my-module:route-12');
```

## `show(id, spec)`

Shows a callout, or replaces the one already open under that id. Returns a function that hides it. Throws a `TypeError` on a bad id or spec.

| Field | Type | Meaning |
|---|---|---|
| `anchor` | `{ x, y }` \| `{ pinId }` \| `{ uuid }` | What the tail points at. `x, y` is a scene point. `pinId` follows that pin's element. `uuid` is a document with a canvas placeable (token, tile, light, and so on); the box points at its bounds. Required |
| `title` | string | Required |
| `subtitle` | string | Under the title, muted |
| `image` | string | An image URL, shown as a 40px thumbnail. Wins over `icon` |
| `imageFit` | string | How the image fills its tile: `cover` (default), `contain`, `fill`, `none`, `scale-down` or `zoom` |
| `imageZoom` | number | With `imageFit: 'zoom'`: 1 to 2, 1 being the same as cover |
| `icon` | string | Font Awesome classes, shown in a tile where an image would be |
| `badges` | `Array<string \| { text, variant?, icon? }>` | A string is a plain badge |
| `body` | string | Plain text; line breaks are kept. Scrolls past about nine lines |
| `rows` | `Array<{ label, value, icon? }>` | Label on the left, value on the right |
| `actions` | `Array<{ label, onClick, icon?, tooltip?, gmOnly?, visible?, closeOnClick? }>` | Buttons. `visible` is a boolean or a function, checked each time the box is drawn. `closeOnClick` defaults to `true` |
| `onClick` | `({ id, close, event }) => void` | Makes the whole box a click: it runs when the box is pressed anywhere but on a button, and the cursor becomes a pointer. See [Clicks](#clicks) |
| `closeOnClick` | boolean | With `onClick`: whether a press on the box closes it first. Default `true` |
| `footer` | string | Small muted line at the bottom |
| `side` | `'auto'`, a side (`'top'`, `'bottom'`, `'left'`, `'right'`) or a corner (`'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`) | Preferred side or corner of the anchor. A corner puts the box up-left, up-right and so on, clear of the anchor on both axes. The box flips to another place to stay on screen (a corner flips on each axis, then both, then the four sides), then slides along the edge. The tail is drawn on the horizontal edge facing the anchor, at the end nearest it. Default `'auto'` (top, bottom, right, left) |
| `gap` | number | Pixels between the anchor and the box, 0 to 48, default 10. The tail sits in it |
| `interactive` | boolean | Default `true`. `false` makes the box ignore the pointer, so it never takes events from the canvas. It cannot have `actions` (a `TypeError`), since nothing in it could be clicked |
| `maxWidth` | number | Pixels, minimum 160, default 280 |
| `style` | object | Appearance; see below |
| `signal` | `AbortSignal` | Aborting hides the callout. A signal already aborted shows nothing |

### `style`

The look of the box. Every field is optional, and one that is absent or invalid keeps the stock look (a dark panel).

| Field | Type | Meaning |
|---|---|---|
| `fill` | `#rrggbb` | Background |
| `stroke` | `#rrggbb` | Border colour |
| `strokeWidth` | number | Border width in pixels, 0 to 8 |
| `dropShadow` | boolean | `false` removes the shadow |
| `iconColor` | `#rrggbb` | The icon in the head tile |
| `textColor` | `#rrggbb` | All text. Muted parts (subtitle, row labels, footer), the badges and the buttons are worked out from it |
| `textSize` | number | Pixels, 8 to 32 |

A colour must be hex (`#rgb`, `#rrggbb`, `#rrggbbaa`); a name, `rgb()` or anything else is ignored. The values become custom properties on the box, so nothing a caller passes reaches a stylesheet. Width is `maxWidth`, not part of `style`.

## Clicks

A callout answers a click in one of three ways, and you choose:

1. **The whole box is one action.** Pass `onClick`. A press anywhere on the box runs it, and the cursor is a pointer.
2. **Buttons.** Pass `actions`: any number, each its own button with its own `onClick`. They wrap onto more rows when they do not fit.
3. **Neither.** Pass neither and the box is for reading; nothing in it reacts.

`onClick` and `actions` can be used together; a press on a button runs that button only. The handler receives `{ id, close, event }`, where `event` is the click, for its modifier keys. A box with `interactive: false` takes neither.

A hover-driven callout also closes on its own: `hide(id, { grace: true })` closes it a moment after the pointer leaves both the anchor and the box. Pressing closes it first by default (`closeOnClick`, on the box or on an action); pass `false` to keep it open.

A throw, or a rejected promise, is reported with a notification and does not break the box.

## `update(id, patch)`

Merges `patch` over the open callout's spec and redraws it in place. Returns `false` when nothing is open under that id. Send only what changed.

## `hide(id, options?)`

Hides a callout. With `{ grace: true }` it waits about 180 ms and stays open while the pointer is on the box. A hover-driven caller shows on pointer enter and hides with `grace` on leave, so the pointer can cross the gap and press a button. Showing again under the same id cancels the wait.

## `hideAll(prefix?)`

Hides every open callout, or those whose id starts with `prefix`. Use your module id as the prefix to clear your own.

## `isOpen(id)`

Returns whether a callout is open under that id.

## Lifetime

- A callout is per client and is never saved or sent. Each client that should see one calls `show`.
- Every open callout is hidden when the scene is torn down.
- A callout whose anchor is off screen is hidden from view and comes back when the anchor does.
- A callout anchored to a pin hides itself when that pin is removed.
- Ids are global. Prefix yours with your module id.

## Driving a callout from hover

A callout does not need a pin. Any hover target on the canvas can drive one: show it on enter, hide it with `grace` on leave, so the pointer can cross onto the box and press a button.

```javascript
const callout = game.modules.get('coffee-pub-blacksmith').api.callout;

function onEnter(route, point) {
  callout.show('my-module:route', {
    anchor: point,                              // { x, y } in scene units, e.g. under the pointer
    title: route.name,
    rows: [{ label: 'Distance', value: route.distance }],
    actions: [{ label: 'Travel here', onClick: () => startTravel(route.id) }]
  });
}

function onLeave() {
  callout.hide('my-module:route', { grace: true });
}
```

A point anchor is a place in the scene, so the box stays on it through every pan and zoom. Call `show` again under the same id to move or replace it. Blacksmith pins use the same calls; see [Pins](api-pins.md#callout).

### A read-out that follows the pointer

A box that tracks the cursor (a distance while drawing, say) should not sit under it. Pass `interactive: false` so it never takes the pointer from the canvas, and a corner `side` so it stays clear on both axes. Show it once, then `update` it as the pointer moves: `update` keeps the same element and only re-draws and re-places it.

```javascript
callout.show('my-module:sketch', { anchor: point, title: 'Route', rows: [{ label: 'Distance', value: '0 mi' }], interactive: false, side: 'top-left', gap: 6 });
// on each pointermove:
callout.update('my-module:sketch', { anchor: point, side: cornerOppositeTravel, rows: [{ label: 'Distance', value }] });
callout.hide('my-module:sketch');
```
