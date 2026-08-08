# Plan: api.tokens - token interaction claim registry

**Status: Planned.** Approved by the author 2026-08-07. Nothing implemented.

This plan is scaffolding. When it is implemented its content is distributed - the public surface to a new
`api/api-tokens.md`, the mechanism to `architecture/architecture-token-interactions.md`, work items to
`TODO.md`, history to `CHANGELOG.md` - and this file is deleted.

## The problem

A player double-clicking a lootable corpse token should get a consuming module's loot window instead of the
Actor sheet. Foundry offers no way to do this, and the reason is not the missing hook it appears to be.

`Token#_onClickLeft2` (`client/canvas/placeables/token.mjs:4319`) renders the Actor sheet directly and fires
nothing. But adding a hook there would not help, because **the permission predicate runs before the
handler**: `MouseInteractionManager#can` is consulted at `client/canvas/interaction/mouse-handler.mjs:494`
(`if (isDouble && this.can("clickLeft2", event))`), and the gesture-to-predicate map at
`client/canvas/placeables/placeable-object.mjs:792` binds `clickLeft2` to `_canView`, which requires LIMITED
on the Actor (`token.mjs:4254`). A player has no permission on a corpse, so the gesture is rejected before
any handler could run. There is nothing to subscribe to.

A context menu is not a workaround - `_canHUD` requires GM or OWNER (`token.mjs:4227`), stricter still.

`HookManager` is not the obstacle. It accepts any hook name (`manager-hooks.js:94`); Foundry simply never
emits one. It also propagates `return false` only for `pre*` names (`manager-hooks.js:80`), so a
veto-by-hook design would not work either.

## The mechanism: patch the instance, not the class

`activateListeners()` (`placeable-object.mjs:775`) assigns a fresh `this.mouseInteractionManager`, and its
`permissions` and `callbacks` are plain objects the engine reads per gesture (`mouse-handler.mjs:294`,
`:311`). It has exactly **one** caller - `placeable-object.mjs:434`, inside `draw()` - so patch lifetime and
draw lifetime are the same thing and nothing recreates the manager behind us.

Blacksmith already wraps `Token.prototype.draw` and already fires `postCoffeePubTokenDraw` after `wrapped()`
resolves (`manager-libwrapper.js:180`), which is exactly when that manager exists. So: on that hook, consult
the registry, and for a matching token only, replace that instance's `permissions.clickLeft2` and
`callbacks.clickLeft2`.

**No new libWrapper registration. No class-level wrapper. Nothing global changes.**

Why this shape rather than wrapping `MouseInteractionManager.prototype.can`:

| | Class wrapper | Instance patch |
|---|---|---|
| `matches` evaluated | every gesture, every placeable | once per token draw |
| Blast radius | every gesture on every placeable | one token, one gesture key |
| New libWrapper registrations | 2 | 0 |
| Re-apply on redraw | manual | automatic, keyed to the draw we wrap |

An unmatched token is not "permitted as before" - it is untouched, because no shared code path was modified.

Two costs, accepted. This is **Token-only**: other placeable classes have no equivalent Coffee Pub draw
hook, so a tile or note interaction would need its own plumbing. And instance patching is invisible to
libWrapper's conflict detection, so if anything else patches the same keys the last writer wins silently -
the registry being sole owner of those keys is the mitigation, and is why this is an API rather than a
technique we document and let each module apply.

**Fallback, if a non-Token placeable ever needs this:** wrap
`foundry.canvas.interaction.MouseInteractionManager.prototype.can` and `.callback`
(`client/canvas/interaction/_module.mjs:3`). Both take the gesture name explicitly, so relaxation stays
scoped to one named gesture by construction, and two wrappers cover every gesture and every placeable class.
Right shape for a general registry; wrong trade for one consumer that only needs tokens.

Rejected alternatives, recorded so they are not re-proposed. A `CONFIG.Token.objectClass` subclass avoids
monkeypatching but occupies a single slot any module may also claim, and one that replaces rather than
extends it wins silently. Making `BlacksmithLayer` interactive means an event-capturing layer over the whole
canvas plus manual hit-testing, risking stolen gestures everywhere.

## Surface

`scripts/api-token-interactions.js`, exporting `TokenInteractionsAPI`, registered as `blacksmith.tokens`.

`scripts/api-tokens.js` already exists but holds deployment and positioning helpers and is **not** on the api
object, so `blacksmith.tokens` is a new namespace holding only the registry. If those helpers are ever made
public they join the same namespace; nothing about this plan exposes them.

```js
const id = blacksmith.tokens.registerInteraction({
    id: 'curator-loot',
    module: 'coffee-pub-curator',
    gesture: 'clickLeft2',
    priority: 2,
    matches: (tokenDocument, user) => LootManager.isLootable(tokenDocument),
    bypassPermission: true,
    handler: (token, event) => LootManager.open(token.document),
    context: 'curator-loot'
});

blacksmith.tokens.unregisterInteraction(id);
blacksmith.tokens.disposeByContext('curator-loot');
```

**Gesture names are Foundry's own keys, not friendly aliases.** `clickLeft2`, not `doubleClick`. The key is
what gets patched, so using it directly means no translation layer to drift and no ambiguity about which
predicate is involved when a consumer debugs. Curator's request used `doubleClick`; they have been told.

**v1 accepts `clickLeft2` and `clickRight2` only.** The data model is gesture-keyed so adding others is a
one-line change - which honors Curator's request that the registry be general in shape - but `clickLeft`,
`clickRight`, `dragStart`, `dragLeftStart`, and `hoverIn` are rejected with a clear error. Claiming those
breaks token selection, dragging, or the HUD in ways no consumer has justified, and shipping unjustified
bypass paths is how a safe registry becomes an unsafe one.

**Conflict resolution is deterministic.** Highest `priority` wins; on a tie, earliest registration wins; the
loser is logged at debug level. No claimant leaves Foundry's behavior untouched.

## Design decisions, with the reason attached

**`bypassPermission` relaxes the predicate only for a matching claimant, and only for the claimed gesture.**
Curator asked for this constraint and it is correct: a generic relaxation of `_canView` would re-open the
Actor sheet to unprivileged players. Under the instance-patch design this is structural rather than
disciplined - the replaced predicate lives on one token's manager and is reached by one gesture.

Worth recording, because it makes the risk smaller than it first appears: `Token#_canView` has exactly one
consumer in the whole v13 client, the `clickLeft2` entry at `placeable-object.mjs:792`. Nothing else calls
it. That is a fact about the current version and not something to rely on, which is why the scoping is done
by construction anyway.

**Fail closed.** If `matches` throws, treat the token as unmatched and leave Foundry's behavior alone. If the
`handler` throws, do **not** fall through to the original handler - permission has already been relaxed for
that gesture, and falling through would open the Actor sheet to a player who could not otherwise open it. A
thrown claimant means the gesture does nothing, and the error is logged.

**A claimed gesture skips the original entirely.** The loot window opening *and* the Actor sheet opening is
the failure Curator is trying to avoid, so a matching claimant replaces rather than precedes.

**`matches` must be synchronous and cheap.** It runs once per token draw, not per gesture, so this is a
guideline rather than the hard constraint it would be under a class wrapper - but token draws are frequent
enough that an expensive predicate is felt. The registry returns immediately when nothing is registered.

**Unregistering restores already-patched tokens.** Because patching happens per draw, dropping a
registration only affects future draws; tokens already on the canvas would keep a dead claim until something
redrew them. So the registry keeps the original `permissions` and `callbacks` entries per patched instance
and restores them on unregister. Track this in a `WeakMap` keyed by the token so it cannot leak scene
objects.

**No sockets, no permission changes to documents.** The registry never writes to an Actor's ownership. The
no-wrapper alternative - granting players LIMITED on lootable corpses - was rejected precisely because it
hands them the Actor sheet, which is what a mediated loot window exists to prevent.

## Non-goals

- **Non-Token placeables.** Tiles, notes, drawings. Needs the fallback wrapper; no consumer has asked.
- **Gestures beyond the two allowlisted.** See above.
- **Anything the claimant does.** What the window shows, who may loot, distance checks, and recipient
  resolution are consumer-owned. Blacksmith decides only which claimant, if any, owns a gesture on a token.

## Work breakdown

Each item carries its verification. There is no test framework, so every check is a live-world step.

1. **Registry and validation.** `registerInteraction`, `unregisterInteraction`, `disposeByContext`, the
   gesture allowlist, priority ordering, and the empty-registry fast path. No patching yet. Verify from a
   macro: registering returns an id; a rejected gesture throws with a readable message; two registrations
   resolve by priority then registration order.
2. **The patch on `postCoffeePubTokenDraw`.** Consult the registry, patch matching instances, record
   originals in a `WeakMap`. Verify as GM: a matching token's
   `token.mouseInteractionManager.permissions.clickLeft2` is the replacement, a non-matching token's is
   Foundry's original, and both survive a scene reload unchanged in kind.
3. **Permission bypass, verified as a real player.** This is the item the whole plan exists for and it cannot
   be checked from a GM client. With a non-GM user who has **no** permission on the corpse Actor:
   double-clicking the corpse opens the claimant's window and **not** the Actor sheet; double-clicking an
   ordinary NPC token they lack permission on still does nothing; double-clicking their own character still
   opens their sheet normally.
4. **Fail-closed behavior.** Make `matches` throw, then make `handler` throw. Verify: a throwing `matches`
   leaves Foundry behavior intact; a throwing `handler` opens nothing at all - specifically **not** the Actor
   sheet - and logs. This is the security-relevant case, so check it as a player, not as GM.
5. **Teardown.** Verify: `unregisterInteraction` on a claim whose token is currently on canvas restores the
   original predicate immediately, without waiting for a redraw, and that double-click reverts to doing
   nothing for that player. Confirm `disposeByContext` clears a whole module's claims.
6. **Register on the api object** beside `effects: EffectsAPI` (`blacksmith.js:996`). Verify
   `game.modules.get('coffee-pub-blacksmith').api.tokens.registerInteraction` is a function in a fresh world
   with no console errors.
7. **Docs.** New `api/api-tokens.md` and `architecture/architecture-token-interactions.md`; add both to the
   `PUBLISH` list in `tools/wiki-sync.mjs`. The architecture doc must carry the two invariants that are
   invisible in correct code: the patch is per-instance and keyed to draw, and fail-closed must not fall
   through to the original handler.
8. **CHANGELOG.** `13.15.3` is closed by BUILD commit `408601da`, so this opens a fresh `## [Unreleased]`
   heading if `api.inventory` has not already opened one.

## Sequencing against api.inventory

Independent - this touches no inventory code and `api.inventory` touches no canvas code. Build this first: it
is far smaller, it closes Curator's last open design question, and `api.inventory` is the longer piece whose
`grantItem` core Curator actually needs to function. Curator's Phase 1 loot entry point is the chat card they
already post, which needs neither, so nothing they have written is waiting on this specifically.
