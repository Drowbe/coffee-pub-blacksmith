# Plan: Pin Minimum Size and Zoom Detail

**Status: Planned.** Opened 2026-10-10.

**On completion:** the tiers, thresholds and rules below fold into `documentation/architecture/architecture-pins.md`
(Rendering pipeline), the variables into its CSS notes, shipped history goes to `CHANGELOG.md`, and this file
is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## The problem

Pins are sized in scene units: screen size is `size.w * canvas.stage.scale.x`
(`PinDOMElement._calculatePinPosition`, `scripts/manager-pins-renderer.js`). Zoomed out on a town map, a
32-unit pin over a building falls to about 10px, too small to read or hit, and its label shrinks with it.
Pins never collide as they shrink, because spacing and size scale together. **The problem is readability,
not crowding.**

## Decision: level of detail, not clustering

Clustering was considered and **deferred** (2026-10-10). A cluster badge replaces *where* the pins are with
*how many*, and the point of calling out three adjacent buildings is where they are. Clustering also gives no
performance win, since every position must still be computed to group them. It earns its place only when
compact pins still collide, which takes a dozen or more pins in a district. Revisit if real maps show that.
This plan is the prerequisite either way: without a minimum size, nothing ever collides to cluster.

## Design

Each pass computes the pin's **natural** screen size, `min(w, h) * scale`, and picks a tier from it:

| Tier | When (natural size) | Screen size | Shows |
|---|---|---|---|
| `full` | at or above the minimum | natural, unchanged | everything, as today |
| `compact` | below the minimum, at or above the dot threshold | clamped to the minimum, aspect kept | shape and icon; label only on hover |
| `dot` | below the dot threshold | fixed dot size | a filled dot in the pin's stroke color; label on hover |

- **One attribute, CSS does the rest.** The renderer writes `data-zoom-detail="full|compact|dot"` on the pin
  element, only when the tier changes. `styles/pins.css` hides the icon, label and corner glyphs per tier.
  No DOM is created or removed by a tier change.
- **Thresholds are `:root` variables, not settings**, read through `PinDOMElement._rootVar`:
  `--blacksmith-pin-min-screen-size` (proposed 24px), `--blacksmith-pin-dot-threshold` (proposed 12px),
  `--blacksmith-pin-dot-size` (proposed 10px). A minimum of `0` turns the feature off. Promote to a
  per-user setting only if someone asks to change them; a client setting under the Pins heading would need
  that heading moved from `world` to `user` (see `check-settings-headings.mjs`).
- **Labels:** in `compact` and `dot`, a `textDisplay: 'always'` label behaves as `hover`. `never` and `gm`
  keep their meaning. Hover shows the label at its `full` size relative to the minimum, not the tiny natural
  size.
- **Skip curved text below `full`.** Arc layouts call `_createCurvedText` on every pin on every pan frame,
  rebuilding per-character spans and reading computed style. Hidden text needs neither, so the tier gate
  skips it. This is a real per-frame saving on maps with arc-labelled pins.
- **Only shrinking is clamped.** A large pin, such as an image covering a building, never changes tier
  until it is genuinely tiny. Nothing grows a pin past its natural size.
- **Hit area:** a `dot` keeps a transparent hit area of at least the minimum size, so it stays clickable.
- **Unchanged at every tier:** position (centered on the same scene point), selection outline, click,
  double-click, right-click, drag, ping animations, the permission and filter gates. A dragged pin keeps
  its tier until the drop.
- **Broken-link glyph:** kept in `compact` (the GM needs to see it from far out), dropped in `dot`.

## Open questions

1. **Per-type opt-out.** Does any pin type need to render at true scene size always, such as a pin used as
   a measured area marker? If so, a taxonomy key `zoomDetail: false`. Not building it until a case exists.
2. **Dot color.** The stroke color is proposed because it carries a pin's identity at a glance. The fill
   color is the alternative.

## Work

1. Tier computation and the `data-zoom-detail` attribute in `_calculatePinPosition` / `updatePosition`.
2. The three `:root` variables in `styles/pins.css`, plus tier rules for icon, label, glyphs and dot.
3. Label handling: `always` acts as `hover` below `full`; skip `_createCurvedText` below `full`.
4. Dot hit area.
5. Architecture doc and CHANGELOG; delete this plan.

## Verification

In a scene with pins of each shape, an image pin, a pin with arc text and one with an `always` label: zoom
out until pins pass each threshold. Pins should stop shrinking at the minimum, then drop to dots, stay
centered on their buildings, show their label on hover, and still click, drag and open their context menu.
Setting the minimum to `0` in DevTools should restore today's behavior exactly.
