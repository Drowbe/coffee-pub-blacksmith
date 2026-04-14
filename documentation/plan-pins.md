# Pins Plan

## Tracking Table

| # | Area | Goal | Status | Notes |
|---|------|------|--------|-------|
| 1 | Problem statement | Define the pin-overload problem, current behavior, and target outcome | Not started | Align on UX, architecture, and performance goals |
| 2 | Data model | Add first-class pin classification beyond `type` | Not started | Candidate fields: `group`, `tags`, `collectionId` |
| 3 | Permission model | Separate permission visibility from user view preferences | Not started | Keep `ownership` and GM-only visibility as hard gates |
| 4 | View-state model | Add client-side filter profiles / saved pin views | Not started | User chooses what is loaded/rendered |
| 5 | Render pipeline | Filter before DOM creation, not only after render | Not started | Prevent loading/rendering pins the user has hidden |
| 6 | UI | Add a real pin management UI, not just hamburger toggles | Not started | Panel/window for filters, counts, presets |
| 7 | API | Expose the new classification and filter surface cleanly | Not started | Keep existing API compatible where possible |
| 8 | Migration | Define fallback behavior for existing pins with only `type` | Not started | Avoid breaking current consumers |
| 9 | Performance | Verify whether load/render pressure is real and where | Not started | Focus on DOM churn first, memory second |
| 10 | Documentation and tests | Update docs and add coverage for the new system | Not started | Track API, architecture, UI, and migration behavior |

## Locked Decisions

The following decisions are now agreed and should be treated as implementation direction unless a later plan explicitly changes them.

- Metadata shape starts with `type` + `group` + `tags[]`.
- Visibility/filter profiles should be implemented as global per-user profiles first.
- A dedicated pin-management panel/window should be built; the hamburger menu remains quick access only.
- Pins hidden by the active user profile should be excluded before DOM creation.
- The pin-management window must use Application V2 only.
- The pin-management window should leverage the existing Blacksmith window/API patterns.
- No V1 `Application` or `FormApplication` work is allowed for this feature.
- Blacksmith uses a universal core classification model; this feature does not start with module-defined dynamic filter dimensions.
- `tags` support both registered and freeform usage.
- `type` remains technical/coarse; `group` and `tags` are the user-facing layer-management fields.
- First version: modules define `group` / `tags` at creation time; GMs can edit them later.
- Hidden-by-profile pins should be removed from canvas rendering; this is especially important for undiscovered quest content, GM-only journal pins, and similar non-player-facing content.
- Viewport culling is out of scope for the first implementation; ship classification-based pre-filtering before DOM creation first.
- Journal-page pins should get a Blacksmith-defined starting taxonomy.
- The starting taxonomy should support a default JSON file under `resources/pin-taxonomy.json`, with room for GM-provided JSON later if that workflow is adopted.

## Goal

The end state is a pin system where users can decide what they want to see on the canvas, and pins they do not want are not unnecessarily loaded into the active render path. The current system is sufficient for permissions and basic hide/show, but it is not sufficient for managing a crowded canvas.

This plan separates three concerns that are currently too coupled:

1. Whether a user is allowed to see a pin at all.
2. How a pin is classified for organization and filtering.
3. Whether the current user wants that class of pins loaded/rendered right now.

## Current State

Current behavior, based on the existing pin architecture:

- Placed pins are stored in scene flags and unplaced pins are stored in a world setting.
- On `canvasReady` and `updateScene`, the renderer loads scene pins through `PinManager.list({ sceneId })`.
- Pins are currently grouped most meaningfully by `moduleId` and `type`.
- User-facing visibility controls are currently limited to global hide/show and module-or-module+type hide/show.
- Permissions are controlled through `ownership`, plus a GM-only visible/not-visible override in pin config.
- Visibility filtering currently happens late enough that the system still thinks in terms of loading scene pins first and then hiding some of them.

This is enough for basic control, but not enough for a canvas with many journal pins, quest pins, note pins, and similar content competing for attention.

## Target Architecture

### 1. Permission Layer

This remains the hard gate.

- `ownership` continues to determine whether a user can see/edit a pin.
- GM-only visibility overrides remain a hard visibility control if the project still wants them.
- This layer answers: "Can this user ever see this pin?"

This layer should not be used as the primary answer to clutter management.

### 2. Classification Layer

Pins need richer first-class organization than a single `type` string.

Keep:

- `type` as the coarse technical kind of pin

Add candidates such as:

- `group`
- `tags: string[]`
- `collectionId`
- optionally `sourceKind` / `sourceId` where grouping by origin matters

Example for journal-page pins:

```js
{
  moduleId: 'coffee-pub-blacksmith',
  type: 'journal-page',
  group: 'locations',
  tags: ['city', 'shop', 'quest-board'],
  collectionId: 'waterdeep'
}
```

This allows the system to support broad categories, user-facing tags, and campaign-specific collections without abusing `type`.

Decision:

- Blacksmith owns a universal core classification model of `type`, `group`, and `tags[]`.
- The first implementation does not attempt to build a dynamic module-defined dimension system into the filtering UI.
- Modules may still store additional metadata in `config`, but the layers/filter UI is built around the universal core model.

Tag behavior:

- Support both registered and freeform tags.
- Registered tags should be the preferred user-facing path where Blacksmith provides a known taxonomy.
- Freeform tags remain valid for module-specific or campaign-specific extensions.

### 3. View-State Layer

Add client-side filter state that represents what the current user wants to work with right now.

This should support:

- show/hide by `moduleId`
- show/hide by `type`
- show/hide by `group`
- show/hide by `tag`
- optional show/hide by `collectionId`
- saved presets or named profiles

Examples:

- `Exploration`
- `Town`
- `Questing`
- `GM Prep`

This layer answers: "Of the pins I am allowed to see, which ones do I want active on the canvas right now?"

Decision:

- Start with global per-user profiles.
- Hidden-by-profile pins should be removed from canvas rendering.
- This is particularly useful for undiscovered quest content, GM-only journal pins, and any other content that should not participate in the current user’s active map view.

## Render and Load Strategy

The main architectural change should be moving filtering earlier in the pipeline.

Current rough flow:

1. List pins for the active scene.
2. Load/render pin DOM.
3. Apply visibility filters.

Target flow:

1. Fetch pins for the active scene.
2. Apply permission visibility checks.
3. Apply user view-state filters.
4. Instantiate DOM only for pins that survive both stages.

This matters for two reasons:

- Better user control: hidden-by-profile pins are not part of the active canvas clutter.
- Better performance behavior: fewer DOM nodes, less pan/zoom position work, less event overhead.

Decision:

- Classification-based pre-filtering before DOM creation is in scope for the first implementation.
- Viewport culling is not part of phase 1.
- Viewport culling can be revisited later if active filtered pin sets are still too large in real scenes.

## UI Direction

The current hamburger menu is too shallow for this problem. It should remain as a quick-access surface, but not as the primary management UI.

Add a dedicated pin management interface such as a `Pin Layers` or `Pin Filters` panel.

That panel should support:

- grouped visibility controls
- counts per group/type/tag
- search/filter within the panel
- saved presets
- clear distinction between permission state and personal visibility preferences

The panel should be the place where users manage their canvas view, not the pin right-click menu.

Implementation constraint:

- This window must be built with Application V2 only and should follow the established Blacksmith V2 window architecture and API exposure patterns.
- Do not introduce any V1 `Application` / `FormApplication` path for pin-layer management.

Editing/classification constraint:

- First version: modules define `group` and `tags` at pin creation time.
- GMs can edit those values later through Blacksmith-managed UI/workflows.
- End users should not be given direct classification-authoring tools in the first release unless a later use case proves necessary.

## API Direction

The public API should evolve without breaking the current basic contract.

Likely additions:

- first-class classification fields in pin data
- helpers for registering groups/types/tags or friendly labels
- view-profile helpers for users
- filtered list/load helpers that reflect the new model

Likely constraints:

- existing `type` usage should remain valid
- existing module consumers should continue working without immediate migration

## Migration Strategy

Existing pins will mostly have:

- `moduleId`
- `type`
- `config`

Migration should treat `type` as the initial coarse classification and allow all new fields to be optional.

Migration goals:

- no breakage for current pins
- no mandatory backfill before the feature is usable
- ability to phase in richer classification over time

Journal taxonomy direction:

- Journal-page pins should receive a Blacksmith-defined starter taxonomy when Blacksmith controls their creation flow.
- The default taxonomy should live in `resources/pin-taxonomy.json`.
- That JSON should be treated as the shipped default, with room for a later GM-selected JSON override workflow if desired.

## Performance Notes

The immediate risk is probably not raw memory use alone. The more likely pressure points are:

- number of pin DOM nodes
- number of position updates during pan/zoom
- image/icon rendering work
- event handling overhead on dense scenes

Memory may still matter at larger scales, but the first optimization target should be reducing active DOM/render workload by not instantiating pins the user has hidden through view-state filters.

The example usage pattern for map locations, journal pins, quest pins, notes, and other layers makes this especially important. Even a scene that is manageable with only two visible pin families can become noisy quickly once additional content types are placed on the same map.

## Proposed Work Order

1. Define the data model for richer pin classification.
2. Define client-side view-state / preset storage.
3. Refactor the load pipeline so filtering occurs before DOM creation.
4. Add a dedicated pin-management UI.
5. Update API docs and architecture docs.
6. Add tests and migration coverage.

## Remaining Open Questions

- Should hidden-by-profile pins still appear in some search/navigation UI even when not rendered, or should search default to the active profile with an explicit "show hidden/filtered" toggle?
- How should registered tags be loaded and merged: Blacksmith-only defaults, per-module registration, JSON-driven loading, or a mixed model?
- What exact default taxonomy should ship in `resources/pin-taxonomy.json` for journal-page pins and other built-in pin families?
