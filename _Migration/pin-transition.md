# Pin Config Window Transition Notes

This document describes the existing Squire pin configuration window so the Blacksmith API dev can lift it into a shared module and keep Squire working.

## Current implementation (Squire)

### File locations
- JS: `scripts/panel-notes.js`
  - Class: `NoteIconPicker`
- Template: `templates/notes-icon-picker.hbs`
- CSS: `styles/notes-icon-picker.css`
- Icon data: `resources/pin-icons.json`

### What it does
- Lets user choose **icon vs image** mode.
- Allows **Font Awesome icon selection** (categorized from `pin-icons.json`).
- Allows **image URL / file picker** selection.
- Controls pin design:
  - size (width/height + lock proportions)
  - shape (circle/square/none)
  - fill/stroke/strokeWidth
  - drop shadow
  - text layout/display/color/size/max length/scale with pin
- Can set selection as **default design** (`notesPinDefaultDesign` setting).

### Invocations in Squire
- From pin context menu (configure pin): `NoteIconPicker(...).render(true)`
  - `scripts/panel-notes.js` `configureHandler` in `registerNotePinContextMenuItems`
- From note editor header icon:
  - `scripts/window-note.js` in `NotesForm.activateListeners`

### Data contract for NoteIconPicker

Constructor:
```js
new NoteIconPicker(noteIcon, {
  onSelect,
  pinSize,
  pinStyle,
  pinShape,
  pinDropShadow,
  pinTextConfig
})
```

- `noteIcon`: `{ type: 'fa'|'img', value: string }` or `null`
- `pinSize`: `{ w: number, h: number }`
- `pinStyle`: `{ fill?: string, stroke?: string, strokeWidth?: number }`
- `pinShape`: `'circle'|'square'|'none'`
- `pinDropShadow`: `boolean`
- `pinTextConfig`:
  - `textLayout`: `'under'|'over'|'around'`
  - `textDisplay`: `'always'|'hover'|'never'|'gm'`
  - `textColor`: `string`
  - `textSize`: `number`
  - `textMaxLength`: `number`
  - `textScaleWithPin`: `boolean`

`onSelect` callback signature:
```js
onSelect({
  icon,            // { type: 'fa'|'img', value }
  pinSize,         // { w, h }
  pinShape,        // 'circle'|'square'|'none'
  pinStyle,        // { fill, stroke, strokeWidth }
  pinDropShadow,   // boolean
  pinTextConfig    // object with text settings above
})
```

### How Squire uses the result

When `onSelect` fires:
- Squire updates the **note flags**:
  - `noteIcon` (the icon/image object)
  - `notePinSize`, `notePinShape`, `notePinStyle`, `notePinDropShadow`
  - `notePinTextLayout`, `notePinTextDisplay`, `notePinTextColor`, `notePinTextSize`, `notePinTextMaxLength`, `notePinTextScaleWithPin`
- Updates the **pin on canvas** via `updateNotePinForPage(page)`
- Updates the **Notes panel** UI

### Note icon rendering helpers
- `buildNoteIconHtml(iconData, imgClass)` – creates `<i ...>` or `<img ...>`
- `normalizeNoteIconFlag(iconFlag)` – parses stored flag into `{type, value}`
- `resolveNoteIconHtmlFromContent(content)` – fallback uses first image in note

These live in `scripts/panel-notes.js` and are imported by `scripts/window-note.js`.

## What the new API module should expose

To keep Squire identical, the API module should expose:

1) **Window / Application**
- A `PinConfigWindow` (or reuse `NoteIconPicker` name) with same constructor signature and `onSelect` output.
- Same template structure and CSS class names so Squire styling doesn’t break.

2) **Utility helpers** (optional but highly useful)
- `buildNoteIconHtml(iconData, className)`
- `normalizeNoteIconFlag(iconFlag)`
- `resolveNoteIconHtmlFromContent(content)`

If these are moved into the API module, Squire can import them instead of duplicating.

3) **Icon categories source**
- The API module should include `pin-icons.json` and load it via `fetch` (current logic in `NoteIconPicker.loadIconCategories`).

## Notes for when it lives in a new module

### Integration points that must remain compatible
- Squire expects the `onSelect` payload shape shown above.
- The picker must continue to support:
  - icon vs image toggle
  - file picker browse (image selection)
  - set-as-default checkbox (optional; we can wire to Squire settings)
- The picker preview HTML uses `buildNoteIconHtml` output.

### Squire updates to apply when API is externalized

When the window moves to Blacksmith (or another API module):
- Replace `import { NoteIconPicker } from './panel-notes.js'` with new API import.
- Ensure CSS is loaded (from new module, or keep local CSS override).
- Update any template path references (if template lives in new module).

### How updates flow back into Squire notes

Squire stores pin config on the note itself, then updates the pin:
- Note flags -> `updateNotePinForPage(page)` -> canvas pin

So the config window only needs to return the data; Squire will:
- set flags
- update pin
- refresh Notes panel

No additional API coupling required beyond `onSelect` payload.

## Type considerations

Blacksmith pins now use a `type` field.
Squire uses type:
```
const NOTE_PIN_TYPE = 'coffee-pub-squire-sticky-notes'
```

The config window does not set type; it’s set by Squire when creating/updating pins.

## Summary for API dev

Use these files as the “source of truth” implementation:
- `scripts/panel-notes.js` (NoteIconPicker class)
- `templates/notes-icon-picker.hbs`
- `styles/notes-icon-picker.css`
- `resources/pin-icons.json`

Keep the constructor and `onSelect` payload intact. This will let Squire swap to the new shared module with minimal changes.
