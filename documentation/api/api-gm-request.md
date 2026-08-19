# GM Request API

**Audience:** developers of Coffee Pub modules where a player needs the GM to do something they lack
permission to do themselves.

Scope: the public surface of `blacksmith.gmRequest` - registering ops, making requests, and what a handler
is given.

Mechanism and the reason it is not part of `api.sockets` live in
`architecture/architecture-gm-request.md`.

## What it is for

A player clicks Buy. The purchase has to be written by someone with permission to write it, exactly one GM
must answer so two do not both run it, and the answer has to come back to the player who asked. That is one
piece of transport, and three modules had written it separately before this existed.

It routes and it elects. It does **not** authorize. Your handler still decides whether the caller may do
what they asked.

What it gives you that you cannot get for yourself is a **caller identity the requester could not have
forged**. Foundry knows who sent a query and does not pass it to query handlers, so every consumer that
needed it had been putting the caller's id in its own payload - which is the step that makes it forgeable.

## Registering an op

```js
blacksmith.gmRequest.registerOp({
    op: 'coffee-pub-merchant.buy',
    module: 'coffee-pub-merchant',
    handler: async (payload, user) => {
        // `user` is the VERIFIED caller. `payload` came from a client; trust none of it.
        const actor = await fromUuid(payload.actorUuid);
        if (!actor?.testUserPermission(user, 'OWNER')) return { ok: false, code: 'NOT_YOURS' };
        return blacksmith.inventory.exchange({ transfers: buildTransfers(actor, payload) });
    }
});
```

Register on **every** client, not only the GM's. Any client can become the answering GM, and one that
registered nothing answers `UNKNOWN_OP`.

Op names must be module-prefixed. Registering an op that already exists is **refused** rather than
overwriting silently; use `unregisterOp(op)` when replacement is intended.

| Option | Required | Meaning |
|---|---|---|
| `op` | yes | Module-prefixed identifier, e.g. `'coffee-pub-merchant.buy'`. |
| `handler` | yes | `(payload, user) => result`. Async is fine. Returning nothing counts as `{ ok: true }`. |
| `module` | no | Your module id, for diagnostics. |

## Making a request

```js
const result = await blacksmith.gmRequest.request('coffee-pub-merchant.buy', {
    actorUuid, itemId, quantity
}, { timeout: 15000 });

if (!result.ok) return reportToUser(result.code);
```

**A GM calling this runs the handler locally**, with no socket round trip and no election. That is what
makes an op work in a world with no other clients connected, and it keeps a GM's own actions off the wire.

The timeout is enforced here rather than by Foundry. `User#query` resolves only when the answer arrives, so
without it a GM that disconnects mid-request leaves the promise pending forever.

## What a handler receives

`(payload, user)`.

`user` is a `User` document, resolved from an id the server supplied. A client cannot choose it.

`payload` is whatever the requester sent, and it is untrusted. Re-resolve every uuid and re-check every
rule against the documents you resolve, not against what the payload claims about them. The envelope having
verified *who* is asking says nothing about whether *what* they asked for is allowed.

Never read an identity out of `payload`. If you find one there, it is either redundant or a hole.

## Failure results

Every failure is `{ ok: false, code, ...context }`.

| Code | Meaning |
|---|---|
| `NO_ACTIVE_GM` | No GM is connected to answer. |
| `NO_QUERY_PERMISSION` | This user lacks Foundry's `QUERY_USER` permission. It defaults to the PLAYER role, so this means a world has revoked it. |
| `QUERY_UNAVAILABLE` | The API did not initialize - Foundry older than v13, or `CONFIG.queries` absent. |
| `UNKNOWN_OP` | No handler registered for that op on the answering client. |
| `TIMEOUT` | No answer within the timeout. Carries `waitedMs`. |
| `HANDLER_ERROR` | The handler threw, or the query itself rejected. Carries `message`. |
| `IDENTITY_UNVERIFIED` | The answering client could not establish who called. Requests are refused rather than answered from a claimed identity. |

Your handler's own result codes pass through untouched, so use your own vocabulary for domain refusals.

## IDENTITY_UNVERIFIED, and why it is not a fallback

`blacksmith.gmRequest.hasVerifiedIdentity()` reports whether a handler can be given a verified caller on
this client.

When it cannot, requests are **refused**. They are not answered using the id the requester claimed. A
degraded identity is worse than none: consumers would have no way to tell which they were holding, and a
permission check against a client-chosen id is not a permission check.

If you see this code, the capture failed to install - which is a Blacksmith problem, not a consumer one.
Report it rather than working around it.

## Election

Exactly one GM answers: Foundry's own `game.users.activeGM`. Using core's designation rather than a
hand-rolled sort means every module agrees with every other module and with core itself.

## What this does not do

No permission checks, no UI, no chat, no notifications, and no domain rules. It does not know what a
purchase is. Approval prompts, recipient selection and windows stay with the module that has the domain -
the same boundary `api.inventory` holds.
