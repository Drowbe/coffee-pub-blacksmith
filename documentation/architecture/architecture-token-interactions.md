# Token Interactions Architecture

**Audience:** us, and any Coffee Pub module maintainer who needs to change how token gesture claims work.

Scope: how `blacksmith.tokens` intercepts a canvas gesture, and why it does it this way rather than the three
more obvious ways.

The public surface is specified in `api/api-tokens.md`. Implementation is `scripts/api-token-interactions.js`.

## The constraint that shapes everything

Foundry decides whether a gesture may happen before it decides what happens. `MouseInteractionManager#can` is
consulted at `client/canvas/interaction/mouse-handler.mjs:494`, and only on a true result does
`#handleClickLeft2` dispatch. The gesture-to-predicate map at
`client/canvas/placeables/placeable-object.mjs:792` binds `clickLeft2` to `Token#_canView`
(`client/canvas/placeables/token.mjs:4254`), which requires LIMITED on the Actor.

A player has no permission on a corpse, so nothing downstream of that check ever runs. No hook can help:
by the time any handler could fire, the decision is made. `Token#_onClickLeft2`
(`client/canvas/placeables/token.mjs:4319`) renders the Actor sheet directly and fires nothing at all.

This is the whole reason the feature is an API. `HookManager` is not the limitation - it accepts any hook name
(`manager-hooks.js:94`) - Foundry simply never emits one, and `HookManager` propagates `return false` only for
`pre*` names (`manager-hooks.js:80`), so a veto-by-hook shape would not work either.

A context menu is not a way around it: `Token#_canHUD` (`token.mjs:4227`) requires GM or OWNER, which is
stricter than LIMITED.

## The mechanism

`PlaceableObject#activateListeners` (`placeable-object.mjs:775`) builds a `MouseInteractionManager` and assigns
it to `this.mouseInteractionManager`. The manager stores its `permissions` and `callbacks` arguments as plain
own properties (`mouse-handler.mjs:64-65`), and reads them per gesture by key
(`mouse-handler.mjs:294` and `:311`), invoking each with the placeable as `this`.

Two consequences make interception possible without touching a prototype. The entries are replaceable at
runtime, because they are looked up on each gesture rather than captured. And their lifetime is exactly the
placeable's draw lifetime, because `activateListeners` has one caller - `placeable-object.mjs:434`, inside
`draw()`.

Blacksmith already wraps `Token.prototype.draw` (`manager-libwrapper.js`) and fires `postCoffeePubTokenDraw`
after the wrapped call resolves, which is after `activateListeners` has run. The registry listens there and
replaces the entries for each claimed gesture on that token's own manager.

So no libWrapper registration is added for this feature, and nothing on a prototype changes.

## Two invariants that are invisible in correct code

Both of these look like redundant caution when the code is working, and both are destructive when removed.
Neither is recoverable by reading the shipped code, which is why they are written here.

**Fail closed on a throwing handler.** When a claim's `handler` throws, the gesture does nothing. It must not
fall through to Foundry's handler, because `bypassPermission` may already have granted the gesture in the
predicate - falling through would open the Actor sheet to a user who could not otherwise open it. A
try/catch that "recovers" by calling the original handler converts an error into a permission leak.

**The `OURS` marker is load-bearing.** `draw()` builds a fresh manager, so the patch runs again on the same
token. The marker is how a second pass tells Foundry's real entry from a replacement of ours. Without it, a
replacement could be captured as the "original", and the pass-through path would call itself. Removing the
marker on the grounds that `Token.prototype._canView` is always the same reference makes correctness depend on
Foundry never binding a per-instance predicate.

**The callback re-checks the real predicate when no claim matches.** Foundry evaluates permission and
dispatches the handler in two separate calls (`mouse-handler.mjs:494` then the callback), so a claim can match
during the permission call - granting the gesture through `bypassPermission` - and stop matching before
dispatch, because `matches` reads live document state. Falling straight through to Foundry's handler at that
point would run it on a gesture only the bypass allowed. The no-claim branch therefore re-evaluates the
displaced predicate and suppresses the gesture if it denies. This looks like a redundant permission check
sitting next to Foundry's own, which is exactly why it would be removed by someone tidying up; it is the same
leak the fail-closed rule above prevents, reached through a different door.

## Why `matches` resolves at gesture time

The registry patches every drawn token while any claim exists, and evaluates `matches` when the gesture fires
rather than when the token draws.

Deciding at draw time would be cheaper and would leave unmatched tokens untouched, but it is wrong for the
case the feature exists to serve: a creature that dies mid-session becomes lootable without redrawing, so its
corpse would stay unclaimable until something happened to redraw it.

The cost is bounded because the claimable gestures are double-clicks - human-rate events, not the pointermove
path. What the design does preserve is that **nothing happens until the first claim**: the draw hook is
registered lazily by `registerInteraction`, and with an empty registry no token is patched.

This is also why `matches` cannot be `async`. The permission predicate is synchronous by Foundry's contract,
and a promise is truthy, so returning one would grant the gesture unconditionally.

## Restoration

The originals displaced on each token are held in a `WeakMap` keyed by the placeable, so a torn-down scene's
tokens are not retained. `unregisterInteraction` restores every token on the canvas and then re-applies the
claims that remain, which is what makes teardown immediate instead of waiting for a redraw, without dropping
another module's claims in the process.

## Bounds

**Tokens only.** The interception point is the Coffee Pub token draw hook, so tiles, notes, and drawings are
not covered. Adding one would mean either an equivalent draw hook per placeable class or moving to the
class-level fallback below.

**Two gestures only.** `clickLeft2` and `clickRight2`. The other entries in the permissions map drive token
control, selection, dragging, and hover, and replacing those removes machinery the canvas depends on. The
registry is gesture-keyed throughout, so widening it is a change to one frozen array plus whatever
verification the new gesture needs.

**Invisible to libWrapper conflict detection.** Instance patching is not a registered wrapper, so if anything
else replaces the same keys the last writer wins silently. The registry owning those keys for the whole suite
is the mitigation, and is the reason this is an API rather than a technique each module applies.

**Scoped by construction, not by a current fact.** `Token#_canView` has exactly one consumer in the v13
client - the `clickLeft2` entry at `placeable-object.mjs:792` - so even a broad relaxation would not reach the
Actor sheet by another route today. The design does not rely on that, because it is a property of the current
version rather than a contract.

## The fallback, if a non-Token placeable ever needs this

Wrap `foundry.canvas.interaction.MouseInteractionManager.prototype.can` and `.callback`
(`client/canvas/interaction/_module.mjs:3`). Both receive the gesture name as an explicit argument
(`mouse-handler.mjs:293` and `:310`) and expose the placeable as `this.object`, so a relaxation stays scoped
to one named gesture by construction, and two wrappers cover every gesture on every placeable class.

The trade is that `matches` then runs on every gesture evaluation on every placeable, including the pointer
paths, and a wrapper sits in that path whether or not anything is registered. That is the right shape for a
registry serving several placeable types and the wrong one for a single consumer that needs tokens.

Two alternatives were considered and rejected. A `CONFIG.Token.objectClass` subclass avoids monkeypatching but
occupies a single slot any module may also claim, and a module that replaces rather than extends it wins
silently. Making `BlacksmithLayer` interactive to catch the click above the token layer means an
event-capturing layer over the whole canvas plus manual hit-testing, which risks stealing gestures from
everything else.
