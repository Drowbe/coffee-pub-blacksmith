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
| `scripts/cards-rest.js` | Card state and composition, both phases, the request completion stamp |
| `scripts/window-rest.js` | The GM's rest window, rendering the shared `window-template.hbs` frame |
| `styles/window-rest.css` | The roster row; everything else comes from the shared window vocabulary |
| `tools/check-rest-clients.mjs` | The invariants below, checkable from the command line |

Settings live in `scripts/settings.js` with every other setting. All are `world` scope, so every client
reads the same values -- which is what lets the two clients below agree without negotiating.

## The flow

Blacksmith owns every surface; dnd5e does every rule.

```
1. GM opens the rest window        kind of rest, who is resting, food and water for tonight
2. One card posts per character    where they stand, and a Rest button
3. Player presses Rest             on their own card, on their own client
4. We call actor.longRest()        dnd5e applies every recovery rule
5. THE SAME CARD is rewritten      recovery, provisions, and a Forage button if one is owed
6. They roll                       the row becomes its own result
```

**One card per character, for the whole night.** Steps 2 and 5 are the same message: the card that asked
the question holds the answer. An earlier design had a separate request card in front of the result card,
with a player window between them; both turned out to be the same object at a different moment, and
collapsing them removed two surfaces rather than building them.

The card's phase is `before` or `rested`, and `buildPartsFromState` composes from that. A `before` card
shows the health bar, where the character stands, and the Rest row; a `rested` card shows what changed.

A rest started anywhere else -- the party sheet, a character sheet, a system rest request -- still works,
and posts a `rested` card with no `before` phase. That path is why the request completion stamp below still
matters.

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

## The rest window

It renders `templates/window-template.hbs` -- the shared frame -- and adds only a roster row of its own.
That is deliberate: the window framework not owning the frame is the CRITICAL item on `TODO.md`, and of the
15 `BlacksmithWindowBaseV2` subclasses only 4 use the shared template. A window that hand-rolled its own
would be a fifth copy of the frame to migrate later.

It starts a rest and runs no rules. The kind of rest, the roster, and whether food and water are tracked
are all questions; pressing the button posts the cards and closes.

The roster is the primary party's characters when a primary party is set, falling back to every
player-owned character so a world without one still gets a usable window.

## A rest's own choices beat the world's

Whether food and water are tracked is a world setting, and the window opens showing what the table has
already decided. What the GM changes there applies to that rest only, travelling on the card and then on
the rest config to `_provision`.

A rest that expressed no opinion -- one started from a character sheet, or from the party sheet -- falls
back to the setting. So the setting is the default rather than the rule, and a night at an inn does not
require changing what the world does every other night.

Provisions are recorded as off for a short rest whatever was chosen, because a short rest consumes none.

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
- A rest begun from a card rewrites that card rather than posting a second one, and falls back to posting
  if the card has since been deleted.
- A pre-rest card carries the GM's choices, shows only pools the character actually has, and offers the
  Rest control as a clickable row.
- A rest's own provision choices win over the settings, in both directions.
- The GM's card completes the request when, and only when, the system's card was suppressed.
- The clock waits for the last sleeper, moves once, and ignores late arrivals.
- Socket handlers survive startup order. `RestManager.initialize()` runs at `blacksmith.js:534` and
  `SocketManager.initialize()` at 1538, so the socket does not exist at registration time and a bare
  `getSocket()?.register?.()` registers nothing at all.
- Consuming a provision respects uses, and an empty container is not treated as full.
- Spent hit dice are not reported as recovered.

The check instantiates the manager twice, with separate static state, because both defects it was written
for are expressible only across two clients. A stub that sets `game.user.isGM = true` cannot see them.
