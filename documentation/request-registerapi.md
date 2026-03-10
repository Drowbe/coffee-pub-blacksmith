
Here’s a concise spec for the Blacksmith developer:

---

## Blacksmith: Module API registration

**Purpose:** Let optional modules (e.g. Curator, Scribe) expose their APIs through Blacksmith so other modules can call them via a single entry point.

### Requirements

**1. Registration mechanism**

- During `ready` (or whenever hooks/menubar are set up), modules must be able to register their API object with Blacksmith.
- Either extend `registerModule()` or add a dedicated call.

**Proposed signature (to be confirmed):**

```javascript
// Option A: extend existing registerModule
BlacksmithModuleManager.registerModule('coffee-pub-curator', {
    name: 'CURATOR',
    version: '1.0.0',
    api: { /* Curator's API object */ }
});

// Option B: separate call
BlacksmithAPIRegistry.register('coffee-pub-curator', curatorApiObject);
```

**2. Exposure to consumers**

- Registered APIs should be exposed through the same path/pattern as hooks and menubar, so they are available after `ready` and after the bridge is loaded.

**Proposed usage (to be confirmed):**

```javascript
// After ready, when Blacksmith is ready
BlacksmithAPI.curator?.updateTokenImages();
BlacksmithAPI.curator?.openTokenWindow({ tokenDocument });

// Or if namespaced differently
(await BlacksmithAPI.get()).curator?.updateTokenImages();
```

- Use the module id (e.g. `coffee-pub-curator`) or a stable short name (e.g. `curator`) as the property.
- When a module is not installed/enabled, that property should be `undefined` so callers can check.

**3. Timing**

- Exposure timing should match hooks, menubar, and other Blacksmith APIs.
- Curator will register its API during its `ready` handler, after Blacksmith has finished its setup.

**4. Null handling**

- If Curator (or another module) is not active, `BlacksmithAPI.curator` must be `undefined` (or otherwise clearly absent), so callers can use optional chaining.

---

## Curator: token/selection types

What Curator expects today:

| Context | Type | Notes |
|--------|------|-------|
| **Token mode – window selection** | Canvas `Token` | From `canvas.tokens.controlled[0]` |
| **Token mode – processing** | `TokenDocument` | Used by `_processTokenImageReplacement(tokenDocument)` |
| **Portrait mode – window selection** | `Actor` | From `ui.actors.viewed[0]` or `canvas.tokens.controlled[0].actor` |
| **Portrait mode – processing** | `Actor` + optional `TokenDocument` | Used by `_processPortraitImageReplacement(actor, tokenDocument)` |
| **Combat context menu** | `canvasToken` (Canvas `Token`) | From Blacksmith’s `getCombatContextMenuItems` context |

**API design for Curator:**

- Accept inputs that are easy to obtain from Foundry/Blacksmith:
  - **Token:** Canvas `Token` (has `.document` and `.actor`)
  - **TokenDocument:** Can derive `Actor` via `.actor`
  - **Actor:** For portrait-only usage (e.g. actor directory)

- Normalization:
  - If given a canvas `Token`, use `token.document` for token operations and `token.actor` for portrait.
  - If given a `TokenDocument`, use as-is for token operations and `.actor` for portrait.
  - If given an `Actor`, use for portrait operations only.

---

## Curator API surface (for Blacksmith/other modules)

Methods Curator will implement and register with Blacksmith:

| Method | Description |
|--------|-------------|
| `updateTokenImages()` | Update all token images on the current canvas |
| `updatePortraitImages()` | Update all portrait images on the current canvas |
| `updateTokenImage(tokenOrTokenDocument)` | Replace image for a single token |
| `updatePortraitImage(actorOrTokenOrTokenDocument)` | Replace portrait for a single actor |
| `openTokenWindow(opts?)` | Open token replacement window. `opts: { token?, tokenDocument? }` to pre-select a token |
| `openPortraitWindow(opts?)` | Open portrait replacement window. `opts: { actor?, token?, tokenDocument? }` to pre-select an actor/token |

All will be callable via `BlacksmithAPI.curator` (or equivalent) once Blacksmith supports registration and exposure as above.