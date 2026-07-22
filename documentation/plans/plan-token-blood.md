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
  the same math the combat bar uses, not a fourth copy. Rewiring the combat/party bars onto the helper is
  a follow-up, not part of v1.
- **Settings** (world scope, registered with the other token-indicator settings): `tokenBloodEnabled`
  (default on) and `tokenBloodVisibility` (`everyone` | `gmOnly`, default `everyone`). Both are also
  gated by the master `generalIndicatorsEnabled`. Changing either refreshes live via the existing
  settingChange callback.
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
