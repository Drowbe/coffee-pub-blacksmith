# Token Interactions API

**Audience:** developers of Coffee Pub modules that need to own a canvas gesture on a token their module does not own.

Scope: the public surface of `blacksmith.tokens` - claiming, releasing, and inspecting token gesture claims.

Mechanism and design rationale live in `architecture/architecture-token-interactions.md`.

## What it is for

Foundry evaluates a gesture's permission predicate before it dispatches the handler, so a player with no
permission on a token never reaches the handler at all. There is no hook that can change that outcome, which
is why claiming a gesture is an API rather than a subscription.

A claim answers one question: for this gesture on this token, does a module own the interaction instead of
Foundry. A matching claim replaces Foundry's handler; it does not run before it.

## registerInteraction

```js
const registrationId = blacksmith.tokens.registerInteraction({
    id: 'curator-loot',
    module: 'coffee-pub-curator',
    gesture: 'clickLeft2',
    priority: 2,
    matches: (tokenDocument, user) => LootManager.isLootable(tokenDocument),
    bypassPermission: true,
    handler: (token, event) => LootManager.open(token.document),
    context: 'curator-loot'
});
```

| Option | Required | Meaning |
|---|---|---|
| `id` | yes | Consumer-chosen identifier. Appears in log messages; need not be globally unique. |
| `module` | no | Registering module id, for diagnostics. Defaults to `unknown`. |
| `gesture` | yes | Foundry gesture key. `clickLeft2` or `clickRight2` only. |
| `matches` | yes | `(tokenDocument, user) => boolean`. Synchronous. Must return exactly `true` to match. |
| `handler` | yes | `(token, event) => void`. Receives the Token placeable, not the document. |
| `priority` | no | Higher wins. Default `3`. Ties break by registration order, earliest first. |
| `bypassPermission` | no | Default `false`. When `true`, a matching token's gesture permission is granted. |
| `context` | no | Grouping key for `disposeByContext`. |

Returns a registration id for `unregisterInteraction`.

Throws when `id` is missing or not a string, when `gesture` is not claimable, or when `matches` or `handler`
is not a function.

### Gesture keys

Gestures use Foundry's own key names, not friendly aliases, because the key is what is patched.

| Key | Gesture | Foundry predicate it displaces | Default requirement |
|---|---|---|---|
| `clickLeft2` | double left-click | `Token#_canView` | LIMITED on the Actor |
| `clickRight2` | double right-click | `Token#_canConfigure` | Actor update permission |

`clickLeft`, `clickRight`, `dragStart`, `dragLeftStart`, and `hoverIn` are rejected. Those gestures drive
token control, selection, dragging, and hover state, and claiming them removes machinery the canvas depends
on.

### matches

Runs on every evaluation of the claimed gesture, so it stays synchronous and cheap - read a flag or an actor
type, do not resolve a UUID or open a compendium.

It cannot be `async`. Foundry's permission predicate is synchronous, and a promise is truthy, so returning one
grants the gesture unconditionally.

Throwing counts as no match. The gesture falls through to Foundry's behavior and the error is logged.

The token document is passed rather than the placeable, so a claim can be evaluated against document state
without reaching into canvas objects. The `handler` receives the placeable, since that is what an interaction
handler generally needs.

### handler

Replaces Foundry's handler for the gesture. For `clickLeft2` on a claimed token, the Actor sheet does not
open.

If it throws, the gesture does nothing and the error is logged. It does not fall through to Foundry's
handler: permission for that gesture may already have been granted by `bypassPermission`, and falling through
would open the Actor sheet to a user who could not otherwise open it.

### bypassPermission

Grants the gesture's permission for a matching token only, and only for the claimed gesture. It does not
change any Actor's ownership and does not alter the predicate for any other gesture or any other token.

Without it, a claim only changes what happens on a gesture the user could already perform.

## unregisterInteraction

```js
blacksmith.tokens.unregisterInteraction(registrationId);   // -> boolean
```

Returns `true` if a claim was removed. Tokens currently on the canvas are restored immediately; this does not
wait for a redraw.

## disposeByContext

```js
blacksmith.tokens.disposeByContext('curator-loot');        // -> number removed
```

Removes every claim registered with that `context`, mirroring `HookManager.disposeByContext`.

## getRegisteredInteractions

```js
blacksmith.tokens.getRegisteredInteractions();
// [ { registrationId, id, module, gesture, priority, bypassPermission, context } ]
```

Diagnostics only. Describes what is registered in this client right now; it is not a record of world
configuration, and `matches` and `handler` are not included.

## ALLOWED_GESTURES

```js
blacksmith.tokens.ALLOWED_GESTURES;   // frozen ['clickLeft2', 'clickRight2']
```

## Resolution when several claims match

Claims are ordered by `priority` descending, then by registration order ascending, and the first whose
`matches` returns `true` owns the gesture. One claim runs, never several. With no matching claim, Foundry's
own permission check and handler run unchanged.

## What this API does not do

It does not open windows, check distance, resolve recipients, or mutate documents. It decides which module
owns a gesture on a token. Everything a claim then does is the consumer's, including whatever authorization
its own feature requires - a claim granting a canvas gesture is not a statement that the user may take any
particular action.
