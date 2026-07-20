# Toolbar Manager Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public API, see `../api/api-toolbar.md`.

`manager-toolbar.js` owns tool registration and renders tools into two different places: Blacksmith's own "Blacksmith Utilities" toolbar and Foundry's native scene-controls toolbar. Both are driven from one registry, but they gate visibility differently — which is the main thing to understand here.

## Registry

A single `Map` of `toolId -> toolData` holds every tool, whether it came from Blacksmith or a consuming module. `registerTool(toolId, toolData)` (`:179`) is the internal entry point; `registerToolbarTool` on `module.api` is the public wrapper.

Registration applies defaults, so most fields are optional:

| Field | Default |
|---|---|
| `name` | the `toolId` |
| `title` | `name`, else `toolId` |
| `icon` | `"fa-solid fa-square-question"` |
| `zone` | `"general"` |
| `order` | `999` |
| `moduleId` | `"blacksmith-core"` |
| `button` | `true` |
| `toggle` | `false` (not user-configurable) |

**`onClick` is the only required field.** A non-function `onClick` is rejected with a log rather than stored, because such a tool would render a button that does nothing.

`registerTool` also stores `toolId` on the tool object itself, deliberately assigned *after* the `...toolData` spread so a caller cannot clobber the registry key. This is what makes `getToolsByModule()` results unregisterable — pass `tool.toolId`, never `tool.name`.

**Duplicate ids:** a second registration from a *different* module is refused and returns `false`, with a log naming both modules — the original owner keeps the id. A module re-registering *its own* id overwrites and returns `true`; modules do this deliberately to refresh button state. So `false` means "someone else owns this id", not "this id is taken".

## Zones

Tools are grouped into six zones, rendered in this order (`zoneOrder`, `:101` and `:163`):

`general` → `rolls` → `communication` → `utilities` → `leadertools` → `gmtools`

Within a zone, tools sort by `order` ascending. An unrecognised zone falls back to `general`.

## Blacksmith's own tools

`registerDefaultTools()` registers **five** tools. Read that function for the current list rather than trusting a copy here — this doc has carried a wrong count more than once:

| Tool | Zone | Gate |
|---|---|---|
| `css` | `gmtools` | `gmOnly` |
| `journal-tools` | `gmtools` | `gmOnly` |
| `refresh` | `gmtools` | `gmOnly` |
| `request-roll` | `gmtools` | `gmOnly` |
| `vote` | `leadertools` | `leaderOnly` |

`addToolbarButton()` only wires the `getSceneControlButtons` hook; it does not define the defaults.

## Two render paths, two visibility rules

This is the asymmetry to know about. Both paths read the same registry, but they do not apply the same gates:

| Path | Renders to | Gates on |
|---|---|---|
| `getVisibleToolsByZones()` (`:83`) | Blacksmith Utilities toolbar | `gmOnly`, `leaderOnly`, **`visible`**, `onCoffeePub` |
| `getFoundryToolbarTools()` (`:120`) | Foundry scene controls | `gmOnly`, `leaderOnly`, `onFoundry` |

`getFoundryToolbarTools()` **never reads `tool.visible`**. A tool registered with `{ visible: () => false, onFoundry: true }` is hidden from Blacksmith's toolbar and still rendered in Foundry's. A consumer using `visible` as a kill-switch therefore ships a button they believe is off.

The code comment at `:116-117` presents the omission as deliberate, but `api-toolbar.md` has always documented `visible` as a general gate. Until that is reconciled, `onFoundry` (which accepts a boolean or a function) is the only reliable Foundry-side gate. Treat this as an open contract question, not a settled design — it is listed in `known-issues.md`.

`gmOnly` and `leaderOnly` behave as a hierarchy: GMs see everything, leaders see leader tools plus general ones, players see neither.

## Settings

`getToolbarSettings()` / `setToolbarSettings()` read and write `toolbarDisplayStyle`, whose registered choices are `none`, `dividers`, and `labels`.

`setToolbarSettings()` (`:1317`) writes `settings.displayStyle` straight through to `game.settings.set` with **no validation** against those choices, so an unrecognised value is stored as-is and corrupts a user-scope setting. Validate at the call site until this is fixed.

## Error handling

`registerTool` and `unregisterToolbarTool` wrap their bodies in `try`/`catch` blocks that are currently **empty**, so an unexpected failure is swallowed silently rather than logged. Bear that in mind when a registration appears to do nothing — the absence of an error is not evidence that it succeeded.
