# Investigation: Regent Query Window — Missing CSS vs Blacksmith

**Purpose:** Compare Regent’s current CSS with Blacksmith’s so we know exactly what was not copied over and why the query window looks unstyled (default scrollbars, plain checkbox, no layout, broken expanded view).

**No code was changed.** This is investigation only.

---

## 1. What Regent Loads Today

| Source | File | Content |
|--------|------|--------|
| Regent `module.json` | `styles/window-query.css` | ~255 lines: workspace *content* only (`.workspace-item-*`, `.primary-info`, `.details-grid`, `.tag`, `.weapon-entry`, `.spell-list-container`, etc.) |

Regent does **not** load any other stylesheet. It has no equivalent to Blacksmith’s `window-common.css`, `common.css`, or `default.css`.

---

## 2. What Blacksmith Loads for the Query Window

Blacksmith’s `default.css` imports (among others):

- `common.css` — variables, chat/scene cleanup, `.panel-drop-zone`, etc.
- `window-common.css` — **main source of query-window layout and styling** (~1220 lines).
- `window-query.css` — same workspace *content* styles Regent has (~255 lines).

So the **only** file Regent is missing that matters for the query UI is the **layout/chrome** in **`window-common.css`**. The content styles in `window-query.css` were copied; the frame was not.

---

## 3. Why Blacksmith’s Query CSS Doesn’t Apply to Regent

Even when Blacksmith is enabled, most of `window-common.css` still doesn’t affect Regent’s window because of **selector scope**.

### 3.1 ID mismatch

Blacksmith’s layout is tied to **Blacksmith** app IDs:

- `#coffee-pub-blacksmith-query`
- `#coffee-pub-blacksmith-wrapper`
- `#coffee-pub-blacksmith-container`
- `#coffee-pub-blacksmith-output`
- `#coffee-pub-blacksmith-input`

Regent’s template and app use **Regent** IDs:

- Form: `#coffee-pub-regent-query`
- Wrapper: `#coffee-pub-regent-wrapper`
- Container: `#coffee-pub-regent-container`
- Output: `#coffee-pub-regent-output`
- Input: `#coffee-pub-regent-input`
- App root: `id: MODULE.ID` → `#coffee-pub-regent`

So every rule in `window-common.css` that starts with `div#coffee-pub-blacksmith-query`, `#coffee-pub-blacksmith-wrapper`, `#coffee-pub-blacksmith-container`, `#coffee-pub-blacksmith-output`, or `#coffee-pub-blacksmith-input` **does not match** Regent’s DOM. That’s the bulk of the layout (flex, heights, overflow, padding).

### 3.2 What *does* match (in theory)

The template still uses many **shared** IDs/classes that are **not** prefixed by the app:

- `#blacksmith-workspace-wrapper`, `#blacksmith-workspace-content`
- `#blacksmith-message-options`, `#blacksmith-message-header`, `#blacksmith-message-content`, `#blacksmith-input-message`
- `#blacksmith-workspace-footer`, `#blacksmith-workspace-toolbar`
- Classes: `.blacksmith-checkbox`, `.blacksmith-textarea`, `.blacksmith-send-button-normal`, `.button-main`, `.toggle-button-workspace`, etc.

So the **unscoped** or **class-based** rules in `window-common.css` (e.g. `#blacksmith-workspace-wrapper`, `#blacksmith-message-options .blacksmith-checkbox`) would apply **if** Regent loaded that file. But Regent does **not** load `window-common.css`, so none of those run in Regent’s context. And the **layout** is driven by the **parent** IDs (`#coffee-pub-blacksmith-*`), which Regent doesn’t have, so even with the file loaded the two-column layout and flex structure would not apply.

---

## 4. What’s in Blacksmith’s `window-common.css` That Regent Never Gets

Below is a concise list of what lives in `window-common.css` and is **not** in Regent’s `window-query.css`. This is the “missing CSS” that explains the visual issues.

### 4.1 Variables (used in window-common.css)

- `:root`: `--element-radius`, `--container-opacity`
- Referenced but **not defined** in the files we saw: `--base-width`, `--total-width`, `--workspace-width`, `--container-padding` (likely set elsewhere in Blacksmith or JS)

Regent has no equivalent variables for the query window.

### 4.2 Top-level layout (all scoped to Blacksmith IDs)

- `#coffee-pub-blacksmith-query` — flex, height, width
- `#coffee-pub-blacksmith-wrapper` — flex row, min-height, transition, overflow
- `#coffee-pub-blacksmith-container` — flex column, min-width, flex-grow, overflow
- `#coffee-pub-blacksmith-output` — height, flex-grow, overflow, border-radius, padding, margin
- `#coffee-pub-blacksmith-input` — flex-shrink, padding
- `.window-content` under `#coffee-pub-blacksmith-query` — opacity, padding

**Effect when missing:** No two-panel layout, no proper height for output/input, default browser look.

### 4.3 Workspace panel (right side when expanded)

- `#blacksmith-workspace-wrapper` — width, flex, transition, background, overflow, `workspace-hidden` state (width 0, opacity 0)
- `#blacksmith-workspace-content` — flex, overflow-y, border-radius, padding
- **Custom scrollbar** for `#blacksmith-workspace-content`: width, track, thumb (colors, border-radius)
- `#blacksmith-workspace-footer` — padding

**Effect when missing:** Expanded panel doesn’t get width/layout, no custom scrollbar (browser default shows), footer unstyled.

### 4.4 Message options / checkbox / toolbar

- `#blacksmith-message-options` — margins, background
- `#blacksmith-message-options .blacksmith-checkbox` — size, border, background, alignment
- `#blacksmith-message-options label` — margins, font, color

**Effect when missing:** “ENTER Sends” checkbox and label use default browser styling (as in your screenshots).

### 4.5 Output / message area

- `#coffee-pub-blacksmith-output` — background (including parchment tile), color
- `div#blacksmith-message-wrapper`, `#blacksmith-message-header`, `#blacksmith-message-header-processing`, `#blacksmith-message-content` — padding, borders, colors, border-radius, fonts
- `.blacksmith-message-speaker`, `.blacksmith-message-header-question`, `.blacksmith-message-header-answer`
- `#blacksmith-message-divider` — border, color, font
- Processing animation: `@keyframes message-processing`

**Effect when missing:** Output area has no background texture, no message bubble styling, no divider styling, default scrollbar.

### 4.6 Input / textarea / buttons

- `.blacksmith-textarea` — font, padding, border-radius, background (parchment tile)
- `.blacksmith-send-button-round` / `.blacksmith-send-button-normal` — size, position, border-radius, colors, hover
- `.button-main::after` — `content: " Consult the Regent"`
- `.button-workspace::after` — `content: " Channel Divinity"`
- `#blacksmith-input-message button[type="submit"]` — flex

**Effect when missing:** Input looks plain, main button has no “Consult the Regent” text styling, no hover state.

### 4.7 Workspace section chrome (left/right panel content)

- `.workspace-section` — width, margin, padding, background, border, border-radius, box-shadow
- `.workspace-section h4`, `.workspace-section h5` — font, color, padding
- `.workspace-section-content` — width, padding, transition, max-height, collapsed state (max-height 0, opacity 0)
- `.workspace-section-divider`, `.workspace-section-spacer`, `.workspace-section-nodivider`
- `.workspace-section .form-label`, `.form-label .helper`, `.workspace-section .form-details`
- `.workspace-section textarea`, `input`, `select`, `option` — padding, border, background, border-radius
- `.workspace-section input[type="checkbox"]` — size, border, background
- `.message-box` — border, padding, background, color, border-radius
- `.toggle-button-section`, `.toggle-button-workspace` — size, colors, hover, icon alignment
- `#blacksmith-clear-workspace`, `#blacksmith-toggle-workspace` — same button styling

**Effect when missing:** D&D 5E Lookup (and other worksheets) have no section boxes, no styled inputs/checkboxes, no collapse/expand styling, no dividers.

### 4.8 Workspace-specific and encounter/character UI

- `#blacksmith-query-workspace-*` (lookup, quickactions, narrative, encounter, assistant) — font, padding, background
- `.encounter-info-row`, `.info-badge-container`, `.info-badge`, `.big-number`, `.normal-badge`, `.bold-badge`, gap/rating colors
- `.player-card`, `.character-name`, `.character-details`, `.workspace-button-group`
- `.add-all-button`, `.add-monsters-button`, `.add-npcs-button`, `.add-tokens-button` — layout, colors, hover
- `.panel-drop-zone`, `.drop-zone-content`
- `.workspace-section-image-container`, `.workspace-section-image`, `.workspace-section-image-caption`
- `.form-options`, toggle buttons, sliders, badges, encounter rating badges and keyframes
- Toolbars: `#blacksmith-message-toolbar`, `#blacksmith-workspace-toolbar` — flex, colors, borders, button size/hover
- `.blacksmith-workspace-toolbar-divider`

**Effect when missing:** Expanded view (image 3) has no structured layout, no styled sections, default form controls, no toolbar styling — matching “even worse” when expanded.

### 4.9 Theme / assets

- `div#coffee-pub-blacksmith-query .window-content` — background, color
- `.blacksmith-textarea` — `background: url(../../coffee-pub-blacksmith/images/tiles/tile-parchment-white.webp)`
- `div#coffee-pub-blacksmith-output` — same parchment background
- `div#blacksmith-workspace-wrapper` — background

**Effect when missing:** No dark window background, no parchment texture on output/input; Regent also can’t reference Blacksmith image paths without depending on that module’s layout.

---

## 5. Summary Table

| Area | In Regent’s window-query.css? | In Blacksmith’s window-common.css? | Applies to Regent? |
|------|-------------------------------|-----------------------------------|--------------------|
| Workspace content (items, grids, tags, weapons, spells) | Yes | Same in window-query.css | Yes |
| Top-level layout (wrapper, container, output, input) | No | Yes (scoped to #coffee-pub-blacksmith-*) | **No** (ID mismatch) |
| Workspace panel (expand/collapse, scrollbar) | No | Yes (#blacksmith-workspace-*) | **No** (file not loaded) |
| Checkbox / “ENTER Sends” | No | Yes | **No** (file not loaded) |
| Output / message bubbles / divider | No | Yes (partly scoped to #coffee-pub-blacksmith-output) | **No** |
| Textarea / send button / “Consult the Regent” | No | Yes | **No** (file not loaded) |
| Workspace sections (D&D Lookup, CRITERIA, etc.) | No | Yes | **No** (file not loaded) |
| Toggle buttons, toolbars, footer | No | Yes | **No** (file not loaded) |
| Parchment / theme / variables | No | Yes | **No** |

---

## 6. Root Cause

1. **Only `window-query.css` was copied** into Regent. That file only styles **inner content** (workspace items, grids, tags, etc.).
2. **All layout and chrome** for the query window live in **`window-common.css`** in Blacksmith, which Regent does not load.
3. Even if Regent did load `window-common.css`, **layout would still fail** because the main selectors target `#coffee-pub-blacksmith-query` and `#coffee-pub-blacksmith-*`, while Regent uses `#coffee-pub-regent-query` and `#coffee-pub-regent-*`.

So the fix will require either:

- **Option A:** Add a Regent-specific stylesheet that duplicates the **query-window-relevant** parts of `window-common.css` and retargets them to `#coffee-pub-regent-*` (and `#coffee-pub-regent` where the app root is used), with asset paths and variables adjusted for Regent, or  
- **Option B:** Have Regent reuse Blacksmith’s `window-common.css` (e.g. by listing it as a dependency or loading it when Blacksmith is present) **and** change Regent’s template/root IDs to match Blacksmith’s query IDs so the same selectors apply (tight coupling and possible conflicts).

This document is investigation only; no code was changed.
