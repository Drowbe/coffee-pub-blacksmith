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
| `icon` | string | Font Awesome classes, shown in a tile where an image would be |
| `badges` | `Array<string \| { text, variant?, icon? }>` | A string is a plain badge |
| `body` | string | Plain text; line breaks are kept. Scrolls past about nine lines |
| `rows` | `Array<{ label, value, icon? }>` | Label on the left, value on the right |
| `actions` | `Array<{ label, onClick, icon?, tooltip?, gmOnly?, visible?, closeOnClick? }>` | Buttons. `visible` is a boolean or a function, checked each time the box is drawn. `closeOnClick` defaults to `true` |
| `footer` | string | Small muted line at the bottom |
| `side` | `'auto'` \| `'top'` \| `'bottom'` \| `'left'` \| `'right'` | Preferred side of the anchor. The box flips to another side, then slides along the edge, to stay on screen. Default `'auto'` (top, bottom, right, left) |
| `maxWidth` | number | Pixels, minimum 160, default 280 |
| `style` | object | Appearance; see below |
| `signal` | `AbortSignal` | Aborting hides the callout. A signal already aborted shows nothing |

### `style`

The same options a pin has, plus its text. Every field is optional, and one that is absent or invalid keeps the stock look (a dark panel).

| Field | Type | Meaning |
|---|---|---|
| `fill` | `#rrggbb` | Background |
| `stroke` | `#rrggbb` | Border colour |
| `strokeWidth` | number | Border width in pixels, 0 to 8 |
| `shape` | `'rounded'` \| `'square'` | Corners |
| `dropShadow` | boolean | `false` removes the shadow |
| `iconColor` | `#rrggbb` | The icon in the head tile |
| `textColor` | `#rrggbb` | All text. Muted parts (subtitle, row labels, footer), the badges and the buttons are worked out from it |
| `textSize` | number | Pixels, 8 to 32 |

A colour must be hex (`#rgb`, `#rrggbb`, `#rrggbbaa`); a name, `rgb()` or anything else is ignored. The values become custom properties on the box, so nothing a caller passes reaches a stylesheet. Width is `maxWidth`, not part of `style`.

`onClick` receives `{ id, close }`. A throw, or a rejected promise, is reported with a notification and does not break the box.

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

## Pins

Every pin can show a callout. Set **Show: Hover** in the Callout section of Configure Pin (Appearance tab), or set `calloutDisplay: 'hover'` when creating the pin. It shows while the pointer is on the pin and goes when the pin is pressed or dragged. The pin's `calloutStyle` (width, shape, background, border, icon colour, drop shadow, text colour and size) is passed as the callout's `style`. See [Pins](api-pins.md) for what it holds and how a module adds data to it.
