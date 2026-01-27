# Canvas Pins API Feedback (Pin Config Window)

> **Addressed in `api-pins.md`**: The checklist below has been incorporated into the main Canvas Pins API documentation. See the section **"Pin configuration window – contracts and behavior"** and the **`pins.configure()`** entry in [api-pins.md](api-pins.md) for exact payload shapes, default storage schema, normalization rules, styling hooks, and current vs planned options.

This is a short, clear checklist for the pin‑config window API so modules can integrate without guessing.

## TL;DR (What’s missing)
- Define **exact `onSelect` payload** shape.
- Pick **one normalized image format** (FA class string or HTML) and document it.
- Specify **default storage schema** when `useAsDefault` is enabled.
- Define how **pin type** is shown/locked/edited.
- Allow **custom icon categories** and **FilePicker** image browse.
- Expose **permission gating** and a stable **CSS root**.

---

## Required API Clarifications

1) **`pins.configure()` return payload**
   - Must be documented and stable.

2) **Image/icon normalization**
   - The window should always return a single format for `image`.
   - Recommended: FA class string (e.g. `fa-solid fa-star`) OR HTML only.

3) **Default storage contract**
   - If `useAsDefault` is enabled, define the exact object written to settings.

4) **Pin type handling**
   - Must support: hidden, fixed, or editable type.

5) **Icon library source**
   - Provide a default list + option to inject custom categories.

6) **FilePicker integration**
   - Built‑in “Browse” support for image selection.

7) **Permission gating**
   - Allow `gm | owner | any` or similar.

8) **Ownership preservation**
   - Ensure `pins.update()` doesn’t accidentally change visibility unless intended.

9) **Styling hooks**
   - Provide a stable root selector for theming.

---

## Recommended `pins.configure()` Payload

```ts
interface PinConfigResult {
  image: string; // normalized format (see above)
  size: { w: number; h: number };
  shape: 'circle' | 'square' | 'none';
  style: { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number };
  dropShadow: boolean;
  text: {
    content?: string;
    layout: 'under' | 'over' | 'around';
    display: 'always' | 'hover' | 'never' | 'gm';
    color: string;
    size: number;
    maxLength: number;
    scaleWithPin: boolean;
  };
  type?: string;
  useAsDefault?: boolean;
}
```

## Recommended `pins.configure()` Options

```ts
interface PinConfigureOptions {
  sceneId?: string;
  onSelect?: (config: PinConfigResult) => void;
  useAsDefault?: boolean;
  defaultSettingKey?: string;
  moduleId?: string;

  pinType?: string;         // fixed type
  allowTypeEdit?: boolean;  // show type control
  typeChoices?: Record<string,string> | string[];

  iconCategories?: IconCategory[]; // override icon list
  allowImageUrl?: boolean;
  allowFilePicker?: boolean;

  permission?: 'gm' | 'owner' | 'any';
}
```

---

## Example (Current Squire NoteIconPicker Output)

This is the **actual** payload our current window returns:

```js
onSelect({
  icon: { type: 'fa' | 'img', value: string },
  pinSize: { w: number, h: number },
  pinShape: 'circle' | 'square' | 'none',
  pinStyle: { fill?: string, stroke?: string, strokeWidth?: number },
  pinDropShadow: boolean,
  pinTextConfig: {
    textLayout: 'under' | 'over' | 'around',
    textDisplay: 'always' | 'hover' | 'never' | 'gm',
    textColor: string,
    textSize: number,
    textMaxLength: number,
    textScaleWithPin: boolean
  }
})
```

Squire then:
- Saves to note flags
- Updates the canvas pin
- Refreshes the notes panel

---

## Why this matters
If the window output isn’t standardized, every module will roll its own format and defaults, causing inconsistent behavior and brittle integrations.
