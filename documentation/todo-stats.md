# Stats System Plan (Source of Truth)

This file is the **single source of truth** for the stats system. We update it whenever we learn something new so we don’t rediscover the same issues.

## Outcomes (non-negotiable)

1. **Lifetime player stats** (actor flags) shown any time via `templates/window-stats-player.hbs`
2. **Round + combat cards** generated at end of round/combat via:
   - `templates/card-stats-round-*.hbs`
   - `templates/card-stats-combat-*.hbs`
3. **Party stats window** shown any time via `templates/window-stats-party.hbs`

All of the above must work under:
- **Core dnd5e** (no MIDI)
- **Midi-QOL** (authoritative workflow hooks)

---

## Current Architecture (as implemented in the repo)

### Data flow (end-to-end)

- **Combat/Round stats collection + reporting**: `scripts/stats-combat.js`
  - Collects events during combat/round into in-memory aggregates
  - Produces cards at end of round and combat (renders templates directly)
  - Produces a compact **combat summary**, stores it into `game.settings(MODULE.ID, 'combatHistory')`
  - Emits `Hooks.callAll('blacksmith.combatSummaryReady', combatSummary, combat)` for lifetime consumers

- **Player lifetime stats collection**: `scripts/stats-player.js`
  - Stores lifetime/session stats on **actor flags**
  - Uses both chat parsing + MIDI workflow hooks (multi-lane)
  - Consumes `blacksmith.combatSummaryReady` as an authoritative reconciliation source

- **UI**:
  - Player window (`scripts/window-stats-player.js`) reads `StatsAPI.player.getStats()` → `templates/window-stats-player.hbs`
  - Party window (`scripts/window-stats-party.js`) reads:
    - `StatsAPI.combat.getCombatHistory()` (combat summaries) and
    - `StatsAPI.player.getStats()` (lifetime leaderboard)
    → `templates/window-stats-party.hbs`

---

## Lanes (how stats are collected)

### MIDI lane (authoritative; must not break core)

Combat stats (`stats-combat.js`) uses:
- `midi-qol.hitsChecked` → hit/miss outcomes per workflow
- `midi-qol.preTargetDamageApplication` → per-target damage/healing amounts (deduped)
- `midi-qol.RollComplete` → crit/fumble (multi-source detection, staged if ordering differs)

Player stats (`stats-player.js`) uses similar hooks and maintains a per-actor update queue for race-proof healing given.

### Core lane (chat + fallbacks)

Both systems use chat message parsing via:
- `scripts/utility-message-resolution.js`:
  - `resolveAttackMessage(message)`
  - `resolveDamageMessage(message)`
  - stable keying + roll hydration

Core lane must remain valid without MIDI installed.

---

## Shared utilities (normalization layer)

### `scripts/utility-message-resolution.js`
- Hydrates rolls reliably in v12/v13
- Tiered attack classification with early exits (damage/heal/usage must not be attacks)
- Produces normalized `AttackResolvedEvent` / `DamageResolvedEvent`

### `scripts/utility-midi-resolution.js`
- Conservative workflow ID extraction (`getWorkflowId`, `getWorkflowKey`)
- Multi-source crit/fumble detection (`getCritFumbleFromWorkflow`)
- Normalized event builders (`buildAttackEventFromWorkflow`, `buildDamageEventFromWorkflow`)
- Hook arg normalization (`extractPreTargetDamageArgs`)
- TTL dedupe (`createDedupeTracker`)

---

## Policy Decisions (locked in)

### Buckets: totals vs moments

- **Totals include all damage**:
  - count `bucket: "onHit"`, `"other"`, and `"unlinked"` into totals (`damageDealt`, `damageTaken`)
  - this is required for core AoE/save/non-attack damage and any correlation misses

- **Moments only include onHit damage**:
  - `topHits`, `biggestHit`, `weakestHit` should only consider `bucket === "onHit"`
  - avoids “biggest hit” being an AoE cloud tick or unlinked effect

- **Healing counts regardless of onHit**:
  - healing never requires attack correlation
  - healing contributes to totals and “biggest heal” moments

### Party-only totals in summaries

- **Combat Summary totals are PARTY-only**:
  - The Combat Summary card’s totals (`hits/misses`, `damageDealt`, `damageTaken`, `healingGiven`, `crits/fumbles`) must be computed from **player characters only**.
  - `participants` may include NPCs (useful for moments/debug), but NPCs must not inflate party totals.

---

## Known Problem Areas (post-v12/v13 changes)

- **Message timing**: rolls/flags may arrive after `createChatMessage` → requires `updateChatMessage` reprocessing with dedupe
- **Correlation drift**: keying can fail; totals must not depend on perfect `onHit` correlation
- **Core save/AoE**: no attack roll exists; must still count totals
- **Crit attribution**: must be per-attack key (global “last roll was crit” flags are timing-sensitive)
- **Multi-target damage/healing**: must dedupe per (key + target) and avoid over-attributing a single roll to multiple targets

---

## Work Items (live checklist; keep updated)

### Combat stats (minimal remaining fixes)

- [ ] Count `other/unlinked` damage in totals (moments only for onHit).
- [ ] Core healing from chat: process heal messages into totals without attack correlation.
- [ ] Core crit/fumble attribution: stamp per attack key (remove reliance on global `_lastRollWasCritical` for attribution).
- [ ] Core target attribution: prefer `damageEvent.targetUuids`, intersect with `attackEvent.hitTargets` for onHit.
- [ ] Add `updateChatMessage` hook (flags/rolls only) with dedupe to avoid double counting.
- [ ] MIDI: count non-onHit damage in totals (trackMoments=false).

### Process guardrail (no more churn)

When a bug is discovered, add:
- reproduction scenario (core vs MIDI)
- which lane misbehaved
- what decision/policy it violated (if any)
- resolution approach

---

## Verification Matrix (must pass)

Run in this order in **core-only**, then repeat with **MIDI enabled**:

1. Weapon attack **miss**
2. Weapon attack **hit**, then damage
3. Spell save/AoE damage **without an attack roll**
4. Multi-target attack (verify per-target attribution)

When validating, capture only:
- “Attack Resolved”
- “Damage Resolved”
- “Unlinked Damage”
- final `combatSummary.totals` and participant summaries
