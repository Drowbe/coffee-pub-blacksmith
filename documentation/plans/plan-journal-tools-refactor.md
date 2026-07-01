# Plan: Journal Tools Refactor (de-clunk)

Purpose: reduce fragility in the Journal Tools feature. It is **already ApplicationV2**
(`JournalToolsWindow extends BlacksmithWindowBaseV2 → HandlebarsApplicationMixin(ApplicationV2)`),
but it opts out of the two biggest V2 conveniences and hand-rolls replacements, plus carries
several timing/DOM hacks and mega-methods. This is a **de-clunk, not a rewrite** — keep the base
class and behavior; adopt the V2 idioms it skips and extract the logic.

Status: **Planned** — assessment done; no code changed. File: `scripts/manager-journal-tools.js`
(3569 lines, two classes: `JournalTools` static manager + `JournalToolsWindow`).

---

## Findings (why it feels clunky/fragile)

1. **Declarative actions disabled.** `static ACTION_HANDLERS = null` (~L2389); `_attachLocalListeners()`
   re-queries and `.bind()`s each control every render (~L2493–2528). A missed selector → listener
   **silently doesn't attach**. Biggest reliability hazard.
2. **Runtime partial loading.** Partials fetched + `Handlebars.registerPartial()` at init (~L49–63);
   the main template `{{> partials/…}}` depends on them. Fetch race/failure → window renders empty.
3. **`setTimeout` timing hacks.** 200ms wait for a sheet to render before navigating (~L2565);
   `setTimeout(…, 0)` reflow poke for progress bars (~L2901); 10ms throttle sleeps (~L504, 660, 763).
4. **Manual DOM state mutation.** Button apply→stop swaps + `_resetApplyButton()` (~L2854–2869),
   progress `style.width` writes (~L2876), `innerHTML` result blobs (~L3379–3431). State and DOM drift.
5. **Mega-methods.** `_upgradeJournalLinksUnified()` ~600 lines (L309–908), `_collectChanges()` ~287
   (L3194–3481), `_onApplyTools()` ~180 (L2666–2845). Untestable; where fragility hides.
6. **Ad-hoc cancellation.** `isProcessing` / `shouldStop` booleans (~L2394–2395) polled in async loops;
   no `AbortController`.
7. Minor: no `_onClose` teardown; `FormData`-then-DOM fallback that shadows its own vars
   (~L2686–2732); custom `.journal-tools-*` CSS instead of the design system.

Unverified concern to check first: `_renderSearchResults()` builds HTML via `insertAdjacentHTML`
(~L3379–3431) — confirm all user/document-derived text is escaped (potential XSS).

---

## Phase 1 — Clunk removal, no behavior change (low risk)

1. **Convert listeners to `data-action` + `ACTION_HANDLERS`.** Add `data-action` to controls in the
   templates; replace `_attachLocalListeners()` bindings with a `static ACTION_HANDLERS` map (mirror
   `window-json-import.js`). Kills the silent-no-attach bug and per-render re-wiring. Keep any genuine
   delegation (e.g. result-title clicks) as a single delegated handler in `_onRender`.
2. **Move partials to `loadTemplates()`** at init; delete the runtime `fetch()` + `registerPartial()`.
3. **Delete the `setTimeout` hacks.** Drive page-navigation off the render hook (await the sheet's
   render rather than a fixed 200ms); let progress updates ride normal paint or a single busy/overlay
   pattern (same approach used in the import window's `_setBusy`); replace 10ms sleeps with a
   `yieldToUI()` (rAF) helper if throttling is still wanted.
4. Add `_onClose()` teardown for any observers/delegated handlers not tied to `this.element`.

Verify after Phase 1: open via header icon + toolbar; both tabs; run an entity report + a
search/replace; Stop button; copy status/results; page navigation to a result.

## Phase 2 — Extract & harden (medium risk)

5. **Extract the mega-methods** into a plain, testable module (e.g. `scripts/journal-tools-core.js`):
   scanning, collect-changes, and apply as pure-ish functions taking data + callbacks. Leave
   `JournalToolsWindow` a thin controller (read form → call core → render results).
6. **Swap stop-flags for `AbortController`**; thread the signal into the core loops.
7. Consolidate scattered `game.settings.get()` reads into one options read per operation.
8. (Optional) Migrate `.journal-tools-*` styling toward the design system.

---

## Guardrails
- One phase per commit; smoke-test the checklist above after each.
- No behavior change in Phase 1 — pure structure/reliability.
- Confirm the XSS escaping question before touching `_renderSearchResults`.
