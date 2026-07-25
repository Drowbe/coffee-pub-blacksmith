# Plan: Roll Outcome Classification API

**Status: Phase 1 shipped in repo — shared utility, `module.api.rolls`, skill-check hooks. Phases 2–4 pending.**

Blacksmith already *knows* what rolls mean (hit, miss, crit, fumble, success vs DC) in four separate places. Sibling modules — especially **Bibliosoph** (crit/fumble/injury/reaction triggers, awareness for quick encounters) and **Regent** (skill lookups via Request Roll) — need a **subscription surface**, not another copy of the logic.

## window-query.js — not in Blacksmith

The Query Tool (`window-query.js`, `window-query.hbs`) **was moved to Regent** (`coffee-pub-regent`). Blacksmith no longer ships those files. Regent subclasses `BlacksmithWindowBaseV2` for its query window (`blacksmith.js` comment at `:102`).

Any TODO item that pointed at `scripts/window-query.js` inside this repo is **stale**. Query-tool roll integration (if still needed) is **Regent's** work: Regent should call `openRequestRollDialog` / `module.api.rolls` from its own window, not Blacksmith's removed file.

## Consumers

| Consumer | Today | After this API |
|---|---|---|
| **Bibliosoph** | `openRequestRollDialog`, compendium resolution, `blacksmith.requestRollComplete` for awareness / quick encounters | Subscribe to `blacksmith.rolls.resolved` / `attackResolved` for crits, fumbles, massive hits, injury tables, reactions ("Big Hit!") |
| **Regent** | Request Roll dialog, query window (Regent repo) for skill lookups | Same Request Roll API; optional `rolls.classify()` when holding a message/roll |
| **Blacksmith internal** | Duplicated d20/crit logic in `manager-rolls.js`, `blacksmith.js`, stats, message/MIDI resolution | Migrate onto `utility-roll-classification.js`; cinema overlay gets real DC |
| **Stats / MVP** | `utility-midi-resolution.js`, `stats-combat.js` private helpers | Keep internal until Phase 3; then delegate crit detection to shared utility |

## Problem: four implementations

1. **`manager-rolls.js`** — d20 extraction for sounds/cinema; cinema success uses hardcoded DC 10 (`:1562`).
2. **`blacksmith.js` `handleSkillRollUpdate`** — crit/fumble, success vs DC, group majority, contested winners (GM-authoritative).
3. **`utility-message-resolution.js`** — attack hit/miss per target vs AC from chat messages.
4. **`utility-midi-resolution.js`** — `getCritFumbleFromWorkflow` (flags + d20); stats/MVP consumer.

Semantics differ by design:

| Context | "Success" means | Crit/fumble |
|---|---|---|
| Skill check | `total >= dc` | Nat 20 / nat 1 on active d20 |
| Group skill check | Majority beat DC | Per-actor nat 20/1 |
| Contested | Higher total wins | Per-actor nat 20/1 |
| Attack (message) | `total >= target AC` per target | Roll flags + nat 20/1 |
| MIDI workflow | Hit target lists | Workflow flags + roll flags + d20 |

The unified contract **names these explicitly** (`kind`, `success`, `groupRoll`, `hitTargets`) rather than collapsing them.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Roll sources                                                │
│  • Request Roll (skill check cards)                          │
│  • dnd5e / MIDI chat messages                                │
│  • MIDI workflow hooks (attacks)                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  utility-roll-classification.js (shared internals)           │
│  extractActiveD20 · classifyCritFumble · classify()          │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  api-rolls.js         │   │  Blacksmith internal sites    │
│  module.api.rolls     │   │  (migrate in Phases 2–3)      │
│  classify · on · emit │   │                               │
└──────────┬───────────┘   └──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Hooks (subscription — primary surface for siblings)           │
│  blacksmith.rolls.resolved                                   │
│  blacksmith.rolls.skillCheckResolved                         │
│  blacksmith.rolls.attackResolved                             │
│  blacksmith.rolls.groupResolved                              │
└─────────────────────────────────────────────────────────────┘
```

**Pull API (secondary):** `module.api.rolls.classify(input, options)` for modules holding a `Roll`, `ChatMessage`, or `{ workflow, attackRoll }`.

**Request Roll (existing):** `openRequestRollDialog` stays on `module.api` top-level for backward compatibility; also documented under rolls in `api-rolls.md`.

## Phases

### Phase 1 — Foundation (shipped)

- [x] `scripts/utility-roll-classification.js` — `extractActiveD20`, `classifyCritFumble`, `classify`, `buildSkillCheckOutcome`
- [x] `scripts/api-rolls.js` — `RollsAPI` on `module.api.rolls`
- [x] Skill-check hook emission from GM `handleSkillRollUpdate` (fires **once per roller**, not re-firing earlier actors)
- [x] `documentation/api/api-rolls.md`, this plan, `architecture-rolls.md` update
- [x] Remove stale `window-query.js` TODO references from Blacksmith docs

### Phase 2 — Internal migration (Blacksmith dogfooding)

- [ ] Replace duplicated d20 blocks in `manager-rolls.js` with `extractActiveD20`
- [ ] Cinema overlay: use card DC from context instead of hardcoded 10
- [ ] `blacksmith.js` skill-check path: use `buildSkillCheckOutcome` for flag annotation (drop inline crit copy)

### Phase 3 — Attack / MIDI hook emission

- [ ] Authoritative firing point: after `resolveAttackMessage` / MIDI workflow normalization (stats pipeline or dedicated hook registrar)
- [ ] Emit `blacksmith.rolls.attackResolved` once per attack (dedupe like stats combat)
- [ ] Respect whisper/blind visibility (`outcomeVisibleToUser`)
- [ ] Migrate `stats-combat.js` crit helpers to shared utility (verify MVP counts unchanged)

### Phase 4 — Sibling adoption

- [ ] **Bibliosoph:** subscribe for crit/fumble/injury/reaction automation; move "Auto-Roll Injury" out of Blacksmith BACKLOG
- [ ] **Regent:** document query-window + Request Roll pattern in Regent repo (no Blacksmith query file)
- [ ] **`TODO-GLOBAL.md`:** track cross-module wiring and verification checklist

## Exactly-once rules

| Source | Fire when | Do not |
|---|---|---|
| Skill check | GM receives `updateSkillRoll` for `tokenId` | Re-emit prior actors when group recalculates |
| Group check | `blacksmith.rolls.groupResolved` when `allRollsComplete && isGroupRoll` | Fire per-actor group summary on every partial roll |
| Attack message | One emit per resolved attack message id | Double with MIDI workflow + chat for same swing |
| MIDI workflow | One emit per workflow id (dedupe tracker) | Re-emit on damage hook for same attack |

## Verification

1. Request Roll: nat 20/1/15 vs known DC — hook payload matches card flags; sounds unchanged.
2. Group roll: three actors — three `skillCheckResolved`, one `groupResolved` when done.
3. Contested: winners/ties in payload match card.
4. Attack (manual): `classify(chatMessage)` hit/miss lists match message flags.
5. Combat with MIDI: MVP crit/fumble counts unchanged after Phase 3 migration.
6. Blind GM roll: players do not receive `resolved` hook payload.

## Related docs

- `../api/api-rolls.md` — consumer contract
- `../api/api-requestroll.md` — Request Roll dialog (roll *request*, not classification)
- `../architecture/architecture-rolls.md` — internal roll execution flow
- `../TODO-GLOBAL.md` — Bibliosoph / Regent adoption tracking
