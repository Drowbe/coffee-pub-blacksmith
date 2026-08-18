# Rest

**Audience: developers working on Blacksmith.**

How resting is extended and why. Blacksmith implements no rest mechanics; this covers what it adds around
the system's, and the client boundary that shape forces.

## What it is

dnd5e owns resting entirely: `actor.shortRest()` and `actor.longRest()`, recovery of hit points, hit dice,
spell slots and item uses, exhaustion, party rests, and three duration variants in `CONFIG.DND5E.restTypes`.
It also advances the world clock itself (`dnd5e.mjs:34982`), though that is off by default.

Blacksmith adds three things and reimplements none of the above:

| Addition | Why it is not the system's |
|---|---|
| The rest moves the world clock | A setting, so the table decides once instead of per rest |
| Food and water | Rations and water are tracked by no part of the system |
| One card per character | Replaces the system's rest card, carrying the same recovery information |

## Files

| File | Holds |
|---|---|
| `scripts/manager-rest.js` | Hook handling, the client split, provisions, the clock |
| `scripts/cards-rest.js` | Card state and composition, and the request completion stamp |
| `tools/check-rest-clients.mjs` | The invariants below, checkable from the command line |

Settings live in `scripts/settings.js` with every other setting. All are `world` scope, so every client
reads the same values -- which is what lets the two clients below agree without negotiating.

## The client split

This is the load-bearing fact about the feature, and the one that is invisible in the code of any single
function.

`dnd5e.restCompleted` is `Hooks.callAll` (`dnd5e.mjs:34995`). Foundry hooks are local: it fires on the
client that ran the rest, and nowhere else. When a player accepts a rest request, that client is theirs and
the GM's client never hears about it.

The work is therefore divided by what each client alone can do:

| Client | Does | Because |
|---|---|---|
| The one that rested | Builds the card state | `result.clone`, the pre-rest snapshot every recovery row is diffed against, exists only in that call stack. It is not a document and cannot be fetched elsewhere |
| The GM | Every write: rations, exhaustion, the card, the completion stamp, the clock | A player has permission for none of them |

The state crosses as plain data over the `executeAsGM` proxy, the same mechanism `manager-pins.js` and
`manager-tags.js` use. A GM pressing Rest takes the same path with no hop.

Guarding the hook with a GM check does not defer the work to the GM. It discards it, because there is no
GM on the other side to defer to.

## Two shapes of party rest

They need different handling, and treating them alike made a five-character rest advance the clock forty
hours.

**Requested** (the default, and what the party sheet's rest button does): dnd5e posts a request card and
rests nobody. Each character then rests individually as their player accepts, minutes apart, each carrying
the same `config.request.id`. No timer can group these, because the gaps are however long a person takes
to click. The request id is the key, and the roster on the request message says how many acceptances to
wait for.

**Automatic** (`autoRest` on): dnd5e rests every member in a tight loop, each forced to
`advanceTime: false`, then advances the clock once itself. These arrive as a burst with no request id, so a
short coalescing timer is the right tool.

The clock moves when the **last** character rests, not the first. A party is not eight hours later until
everyone has slept. A request nobody finishes simply never advances, which is the honest outcome for a rest
that did not happen -- and the GM can resolve any outstanding character from the request card.

## Replacing the system's card means taking on its job

The system's rest card is not only a summary. For a requested rest it is also what marks a character done:
it carries `flags.dnd5e.requestResult`, and `RequestMessageData.onCreateMessage` and
`onUpdateResultMessage` (`dnd5e.mjs:79669-79670`) watch every message for that flag and write the message
id onto the matching target. A target with a result is complete; a target without one keeps offering its
Rest button.

So when the system card is suppressed, Blacksmith's card carries the same stamp, set after creation as
dnd5e does itself (`dnd5e.mjs:70861`). Only when the system card was actually suppressed: if dnd5e posted
its own it has already stamped the request, and a second stamp repoints the target at the wrong message.

## The card carries its own state

Everything needed to draw the card, including the already-rendered recovery rows, is stored in the message
flags. That is what lets a foraging roll made minutes later re-render the card from the message alone --
the `RestResult` and its clone are long gone by then, and re-deriving the recovery would be impossible.

Recovery rows are derived by diffing the live actor against `result.clone`, not by reading
`result.updateData`. dnd5e applies the update at `dnd5e.mjs:34977` and fires the hook at 34995, so the
actor already holds the new values and `updateData` has been consumed by `Document#update`. Two actual
actor states cannot drift the way a spent update object can.

`ActorDeltasField` is deliberately not used: it is the system's internal display plumbing, and a chat card
should not be coupled to it.

## Provisions come in two shapes

Rations are a stack: quantity is the count, and the item goes when it reaches zero. A waterskin is one item
holding a pool of uses -- pints in a container you keep -- so drinking one spends a use and the item stays.
dnd5e stores a pool as how much is `spent` and derives `value` as `max - spent` (`dnd5e.mjs:4357`), so an
item has a pool only when it has a max.

Availability and consumption ask the same question, so an empty waterskin does not count as water.

One Survival check covers both food and water. A character searching a riverbank finds the berries and the
stream in the same hour, and two rolls would charge them twice for one activity -- so at most one level of
exhaustion is at stake per rest.

## Hit dice have a sign

The hit dice delta is a plain before-to-after difference (`dnd5e.mjs:34844`). A long rest recovers dice, so
it is positive; a short rest spends them, so it is negative. dnd5e flips it for display
(`dnd5e.mjs:35016`) because its card reports dice spent as a positive count. The sign alone says which
happened, so nothing needs to consult the rest type.

## Invariants

`node tools/check-rest-clients.mjs` guards these, and exits non-zero on a violation:

- A player accepting a rest hands it to the GM rather than dropping it, carrying the state built on their
  own client.
- The GM's card completes the request when, and only when, the system's card was suppressed.
- The clock waits for the last sleeper, moves once, and ignores late arrivals.
- Socket handlers survive startup order. `RestManager.initialize()` runs at `blacksmith.js:534` and
  `SocketManager.initialize()` at 1538, so the socket does not exist at registration time and a bare
  `getSocket()?.register?.()` registers nothing at all.
- Consuming a provision respects uses, and an empty container is not treated as full.
- Spent hit dice are not reported as recovered.

The check instantiates the manager twice, with separate static state, because both defects it was written
for are expressible only across two clients. A stub that sets `game.user.isGM = true` cannot see them.
