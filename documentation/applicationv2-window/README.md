# Example Application V2 Window (Framework Only)

Minimal window skeleton that includes all **five Blacksmith zones**: **title bar** (Foundry), **option bar** (optional), **header** (optional), **body** (required — inject your content here), **action bar** (optional). Omit the zones you don’t need. No domain content—replace placeholders with your own.

**Zone reference:** See **blacksmith-windows-zones.webp** for the layout. See **window-samples.png** for real windows and which zones they use.

## Files

- **example-window.hbs** — Handlebars template (single root, option bar, header, body, action bar).
- **example-window.js** — Application V2 class with delegation, scroll save/restore, and static actions.

## How to use

1. Copy both files into your module, e.g.:
   - `templates/your-window.hbs`
   - `scripts/your-window.js`
2. In the template, remove or leave empty the zones you don’t need (option bar, header, action bar). Keep **body** and put your layout/content there.
3. In the JS file:
   - Set `PARTS.body.template` to your template path (e.g. `modules/your-module-id/templates/your-window.hbs`).
   - Replace `ExampleModuleWindow` / `EXAMPLE_APP_ID` / `_exampleWindowRef` / `_exampleDelegationAttached` with your own names.
   - Implement `getData()` and your actions.
4. Add CSS for `.example-window-root`, `.example-window-option-bar`, `.example-window-header`, `.example-window-body`, `.example-window-buttons` (or rename classes). See `guidance-applicationv2.md` §6.3 or `../styles/window-skills.css` in this repo for layout patterns.
5. Open the window from your API or a button, e.g. `new YourWindow().render(true)`.

## Reference

Full guidance and zone contract: **guidance-applicationv2.md**.
