# GM Request Architecture

**Audience:** us, and any Coffee Pub maintainer who needs to change how player-to-GM requests work.

Scope: how `blacksmith.gmRequest` obtains a caller identity a requester cannot forge, and why it is built on
Foundry's query API rather than on sockets.

The public surface is specified in `api/api-gm-request.md`. Implementation is `scripts/api-gm-request.js`.

## Why the hub owns it, and why it is not `api.sockets`

Three hand-rolled copies of this existed before it: Curator's loot envelope, Merchant's, and Blacksmith's
own token-movement request. Ours was the worst of the three - no timeout, no response on approval, and a
silent no-op when SocketLib is absent, because it reached for `executeAsGM`, which the native fallback does
not provide.

It is deliberately **not** part of `api.sockets`. Hanging it there would imply it rides our transport and
inherits the SocketLib/native split, which is precisely the part worth not reintroducing. Foundry v13 ships
the request/response primitive in core: `CONFIG.queries` plus `User#query` gives a promise, a target, and a
return value, and `game.users.activeGM` gives the election. Most of what the three copies implemented is now
core's.

What is left worth owning is thin, and it is all in `api-gm-request.js`: the local-GM shortcut, a
`{ok, code}` vocabulary matching `api.inventory`, op registration that refuses collisions instead of
overwriting them, a requester-side timeout, and the identity capture below.

## The identity capture is the whole point

**Foundry knows who sent a query, and knows it in a way no client can forge.** `User#query` emits only the
*target's* id (`foundry.mjs:47824`); the sender never transmits its own. So the id the receiving client sees
in `#handleUserQuery(userId, ...)` was supplied by the server from the authenticated socket.

**Core then throws it away.** `#handleUserQuery` resolves that user, throws if it does not exist, and calls
`queryHandler(queryData, queryOptions)` where `queryOptions` holds only `timeout`
(`foundry.mjs:41082-41094`). The identity is present, verified, and never forwarded.

Every consumer that needed it had therefore put the caller's id into its own payload - which converts a
verified identity into a client-asserted one and makes every ownership check downstream meaningless. No
consumer can fix that alone, because the only channel carrying the real id is core's socket listener.

So we read it from that listener ourselves.

### Ordering, and why there is no gentler way

Core's `userQuery` listener invokes our query handler **synchronously** before it awaits, so a listener
registered after core's would record the id too late for the handler that needs it.

socket.io's emitter (`@socket.io/component-emitter`) has `on`, `off` and `listeners`, and **no
`prependListener`**. The only way to run first is therefore to lift core's listeners off the event, install
ours, and put them back in their original order:

```js
const existing = [...socket.listeners('userQuery')];
socket.off('userQuery');
socket.on('userQuery', capture);
for (const listener of existing) socket.on('userQuery', listener);
```

`listeners()` returns the emitter's own array, so it is **copied before `off` clears it**. Reordering
core's listeners is invasive and is not done lightly; it is here because the alternative is either a
forgeable identity or a timing trick that depends on where core places its `await`.

**This runs in `ready`, never `init`.** Core registers the listener during game setup, and installing
earlier finds nothing to reorder - which the code detects and treats as failure rather than installing a
listener that would then sit in front of nothing.

### Correlation is client-supplied and does not need to be trusted

The capture sees the payload; the handler sees the payload; they are matched on a `correlationId` the
requester generated. That id proves nothing and is not asked to: it only pairs one capture with one
handler call. The *identity* attached to it comes from the server.

Entries are **single-use** - consumed on read - so a replayed correlation id finds nothing and is refused.
Unclaimed entries are swept on a TTL so a dropped query cannot grow the map indefinitely.

### It fails closed

If the capture cannot be installed - no emitter API, core listener absent, an exception - the flag stays
false and **every request is refused with `IDENTITY_UNVERIFIED`**. It never falls back to the id in the
payload.

That is the single most important line in the file. A degraded identity is worse than none, because a
consumer has no way to tell which one it is holding, and a permission check against a client-chosen id is
not a permission check - it is one that looks like it works. This is the same failure class as everything in
section 9C of `architecture-blacksmith.md`: a plausible substitute is worse than a refusal.

## The timeout is ours because core has none

`User#query` resolves when the ack arrives and nothing else (`foundry.mjs:47823-47831`). The `timeout` it
accepts is forwarded to the receiving client as information; it does not arm a timer on the requester's
side. A GM that disconnects mid-request therefore leaves the promise pending forever.

`request()` races the query against its own timer for that reason. The forwarded value is still passed
through, so a handler that wants to know how long it has can read it.

## The local-GM shortcut is not an optimisation

`request()` called by a GM dispatches locally rather than querying itself. That is what makes an op work in
a world with no other clients connected, and it keeps a GM's own actions off the wire entirely. Removing it
to "make all paths the same" breaks single-user worlds, which is exactly where a GM tests things.
