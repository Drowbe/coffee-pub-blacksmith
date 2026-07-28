# Active Effects Architecture

The Active Effects subsystem is a small shared normalization layer, not an effect engine. Its purpose is to stop Blacksmith, Crier, Bibliosoph, and future Coffee Pub modules from independently filtering and formatting the same Foundry Active Effect documents.

## Components

| Component | Responsibility |
|---|---|
| `scripts/api-effects.js` | Filtering, dnd5e condition labels, duration and description normalization, classifier registry, change event |
| `scripts/manager-combatbar.js` | Blacksmith's hover-card presentation and live refresh |
| `styles/menubar-combatbar.css` | Compact effect rows in the hover card |
| `documentation/api/api-effects.md` | Consumer contract |

## Flow

1. A consumer supplies an Actor to `effects.getDisplayEffects(actor)`.
2. The API preserves Actor effect order while removing disabled, suppressed, and non-display effects.
3. Registered classifiers get a chance to identify module-owned effects.
4. The API resolves dnd5e condition labels, duration, attribution, and permission-safe description HTML.
5. The consumer renders the returned DTO without reading module-specific flags itself.

Foundry's Active Effect create/update/delete hooks call `EffectsAPI.emitChanged`. Blacksmith refreshes an already-visible combat hover card and consumers may subscribe through `effects.onChanged`.

The combat portrait context menu can turn that transient view into a persistent card. Persistent cards reuse the same data builder and markup, remain client-local, preserve their position during refreshes, and update on Actor, Combatant, Active Effect, and display-setting changes. Their per-card Follow Combat toggle changes the record's combatant identity on turn changes and rerenders in place; disabling it leaves the card pinned to the combatant currently shown. They contain no effect mutations and therefore do not expand the API's ownership boundary.

## Classifier boundary

Blacksmith owns only generic Foundry and dnd5e interpretation. A classifier owned by another module translates that module's flags into display metadata. It does not mutate the effect or implement gameplay.

The built-in Bibliosoph classifier is deliberately low priority and compatibility-only. It understands the established `outcomeBurst` flag sufficiently to prevent regressions while Bibliosoph adopts the registry. An authoritative Bibliosoph classifier should use a higher priority or explicitly replace the compatibility classifier.

## Permissions

Effect names and statuses are returned by the normalization API, but descriptions default to permission-aware behavior: only GMs and Actor owners receive enriched description HTML. Blacksmith additionally suppresses the entire effect section on its limited NPC hover-card view. Consumers remain responsible for applying an equally strict visibility policy to their own UI.

## Non-goals

- Active Effect CRUD
- duration ticking or expiry
- roll automation
- Midi-QOL or DAE interpretation
- socket synchronization
- module-specific injury, critical, or fumble rules
