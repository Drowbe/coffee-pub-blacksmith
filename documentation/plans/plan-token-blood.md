# Plan: Token Blood HP Indicator

**Status: Implemented (Blood Damage + Blood Hit + Remove All Blood) — pending live verification; authored-art phase open**

Author reskin direction (2026-07-22, applied): Blood Damage is a central pool that grows with damage,
ringed by small splats — not uniform large blobs. Blood Hit is a second feature: a transient brighter
burst above the token on each hit, scaled to damage, fading over ~0.9s. Remove All Blood is a GM
toolbar button relayed to all clients via the hidden `tokenBloodClearRequest` world setting;
cleared tokens are suppressed until they next take damage.

Ground blood splatter rendered UNDER each token whose HP is reduced, with splatter intensity following
% remaining HP. Author direction (2026-07-22): the splatter is on the ground beneath the token, not
painted over the token art.

## Decisions

- **Render target**: `canvas.primary` via `PrimarySpriteMesh` (the sorted ground-level group that holds
  token/tile meshes). `sortLayer: 650` places the splatter above tiles (500) and drawings (600) but under
  all token meshes (700). `elevation` mirrors the token's elevation. This is what makes "under the token"
  work: the Token placeable container renders above the art, so attaching there was rejected.
- **Art (v1)**: procedural splatter — PIXI.Graphics blobs rendered to a texture with
  `renderer.generateTexture`, seeded deterministically from the token id so every client and every
  refresh draws the same splatter for the same token. No bundled assets needed for v1; swapping in
  authored webp textures later is a drop-in replacement at the texture-build step.
- **Tiers** (match the combat bar's classification in `manager-combatbar.js`): >=75% none; 50–74%
  light; 25–49% medium; 1–24% heavy; 0 HP dead (heaviest pool, darker). HP % comes from a new shared
  helper `scripts/utility-health.js` (`getHealthPercent`, `getHealthSeverity`) so blood is a consumer of
  the same math the combat bar uses, not another copy. Rewiring the combat bar onto the helper is
  a follow-up, not part of v1.
- **Settings** (world scope, registered with the other token-indicator settings): `tokenBloodEnabled`
  (default on) and `tokenBloodVisibility` (`everyone` | `gmOnly`, default `everyone`). Both are also
  gated by the master `generalIndicatorsEnabled`. Changing either refreshes live via the existing
  settingChange callback.
- **Two cleanup timers, not one** (2026-08-06): `tokenBloodCleanupSeconds` counts from a token's last
  damage; `tokenBloodMopDeadSeconds` ("Mop the Dead", default 30) replaces it for a token whose mesh is
  at the `dead` tier. Blood Cleanup defaults to 0 (never), which is right during a fight and wrong for
  the bodies left behind it, so the split is what lets blood on the living persist while corpses are
  cleared. `_scheduleBloodCleanup` picks the interval off the mesh entry's severity, so no extra hook
  is needed — a corpse's mesh is built at the moment it crosses into `dead`, and building schedules.
  Both treat 0 as never, and both suppress redraw for that token afterwards.
- **Visibility**: the splatter mesh tracks `token.visible` on `refreshToken`, so GM-hidden tokens and
  tokens outside a player's vision do not leak position through their blood.
- **Triggers**: `updateActor` (HP path changes → update blood for the actor's active tokens — covers
  linked actors and unlinked-token actor deltas), existing `updateToken` (movement/elevation),
  `deleteToken` (cleanup), `canvasReady` (rebuild), `refreshToken` (position/visibility sync + lazy
  creation for newly dropped tokens). No sockets: every client derives the splatter from actor data it
  already has. No per-frame work.

## Phases

1. **v1 (this change)**: static tiered splatter as above.
2. **Damage flash**: brief animation on HP drop, reusing the manager's existing PIXI animation pattern.
3. **Authored art**: replace or augment the procedural texture with bundled splatter webp assets.

## Verification (v1)

In a live world: damage a linked PC and an unlinked NPC token past each tier boundary → splatter
appears/intensifies under the token on all clients; heal → it recedes and disappears at >=75%; kill →
dead pool; drag the token → splatter follows; hide the token → players lose the splatter, GM keeps it;
`tokenBloodVisibility: gmOnly` → players never see it; disable `tokenBloodEnabled` → all splatter
removed immediately; perf monitor shows no idle cost.

## Dismantling

On completion: tiers/settings/mechanism into `architecture-blacksmith.md` or a token-indicators
architecture doc section; the feature entry into `CHANGELOG.md`; TODO item deleted; this file deleted.


---

## Moved from `TODO.md` (2026-08-27): remaining work

The Health Indicators system (Blood Damage pools, Blood Hit bursts with damage/attack triggers and sound, cleanup timer, visibility gating, Remove/Restore All Blood toolbar buttons) shipped in `CHANGELOG.md` [13.11.0]; each entry there carries its own live-verification steps. Open:
- **Finish the live-verification pass**: core flows (pools per tier, bursts on both triggers, attack-mode fix, player-client rendering) were exercised during development on 2026-07-22; still unverified: GM Only visibility on a player client, the Blood Cleanup slider, Remove/Restore All Blood across two clients, the hit sound, unlinked NPCs at every tier, and the perf-monitor idle check. Steps are in the [13.11.0] entries. When this passes, dismantle `documentation/plans/plan-token-blood.md` per the plans rule.
- **Optional authored splatter art**: replace or augment the procedural texture with bundled webp splatter assets — a drop-in swap at the texture-build step in `manager-token-indicators.js`; tiers, seeding, placement, and visibility all stay as-is.
- **Rewire the combat bar onto `utility-health.js`** so the HP-percent math has one home (it currently computes its own; the helper's 'hurt' tier maps to its "healthy" bucket — see the helper's JSDoc).

Next round (author, 2026-07-22). Note the shared design question for the first and last items: today all blood is *derived* from HP and redrawn from scratch — nothing is stored. Hand-drawn blood and trails left behind by movement are real data that must live somewhere (scene flags, most likely) with their own cleanup story, which is a genuine design shift, not another tier row:
- **Draw blood on the canvas**: a GM paint tool to stamp splatter directly on the ground (click or click-drag), independent of any token's HP. Decide persistence (scene-flag storage vs session-only), whether Remove All Blood clears it, and whether it reuses the procedural drawer at a chosen size.
- **Burst style options**: alternative hit-burst treatments beyond blood — old-school comic "POW"/"BAM"-style graphics and other animation styles — selectable via a burst-style setting alongside the existing trigger/sound settings. The burst pipeline (spawn, animate, destroy) is style-agnostic; only the texture generator varies.
- **Blood color by creature type**: for Blood Damage pools, map dnd5e creature type to blood color (e.g. undead ichor, construct oil, ooze slime) with a sensible default for the rest. Decide where the mapping lives (constants vs setting vs taxonomy JSON) and whether Blood Hit bursts follow the same color.
- **Gore level setting**: one global intensity dial scaling pool sizes, splat counts, and opacity across all tiers (subtle table → full Tarantino), multiplying the existing `_BLOOD_TIERS` values rather than adding new tiers.
- **Blood trails on movement**: optionally leave some blood behind when a wounded token moves — droplets along the drag path, heavier at worse tiers. Interacts with the persistence question above and with Blood Cleanup (trails likely want their own, shorter lifetime).
- **Investigation (2026-07-22) — most of the plumbing already exists; LOE ~1 focused day for v1 plus art**:
  - `scripts/manager-token-indicators.js` already runs per-token PIXI overlays on `canvas.interface` (turn indicator, targeted rings, portrait stacks via `PIXI.Sprite.from`) with movement tracking, delete cleanup, `canvasReady` refresh, and HookManager wiring. Blood is one more indicator type in that framework, not a new system.
  - HP % and the exact severity steps are already computed in `manager-combatbar.js:536-566` (healthy >=75 / injured >=50 / bloodied >=25 / critical), with a cross-system HP path watch list at `:652-663`. First step: extract a shared `getHealthPercent(actor)` + severity helper so blood is the second consumer rather than another copy.
  - Quick View's hatch (`utility-quickview.js:542-568`) proves the token-conforming overlay pattern (scaled to `token.w/h`, rotation-aware, non-interactive); `images/overlays/overlay-pattern-*.webp` establishes the bundled overlay-texture pattern.
  - Genuinely new: 3-4 alpha webp splatter textures (or one greyscale splatter tinted/scaled per tier); an `updateActor` hook alongside the existing `updateToken` one (linked actors vs unlinked-token actor deltas both need live testing); an enable setting plus a visibility-scope setting (everyone / GM-only / own-tokens-plus-GM — blood on canvas broadcasts enemy HP state to players, the one real design decision). Phase 2: damage-taken flash reusing the manager's existing PIXI animation pattern. No sockets — each client derives the overlay from actor data it already has; no per-frame work, so §9B-clean by construction.
- **Ownership (resolved by the investigation): Blacksmith.** This is canvas indicator UX driven by HP data, both of which live here; it does not need the rolls-classification event surface (it reacts to HP deltas, not crits). Injury *mechanics* stay in the sibling module.
- **Status**: PENDING — needs a plan first (feature, so per the workflow it gets a `documentation/plans/` entry before code: visual approach, thresholds, settings, dead-state treatment — ties into the "Hide Dead" menubar item below).
- **How to verify**: damage a linked and an unlinked token past each threshold → splatter tier updates on all clients; heal → it recedes; visibility-scope setting hides it from players when set; no per-frame cost when idle (check with the perf monitor); disabled setting → no hooks registered.
- **Priority**: Medium
