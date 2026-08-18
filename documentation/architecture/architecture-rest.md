# Rest

**Audience: developers working on Blacksmith.**

How resting is extended and why. Blacksmith implements no rest mechanics; this covers what it adds around
the system's, and the client boundary that shape forces.

## What it is

dnd5e owns resting entirely: `actor.shortRest()` and `actor.longRest()`, recovery of hit points, hit dice,
spell slots and item uses, exhaustion, party rests, and three duration variants in `CONFIG.DND5E.restTypes`.
It also advances the world clock itself (`dnd5e.mjs:38304`), though that is off by default.

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
shows the health bar, where the character stands, and the Begin Rest button; a `rested` card shows what
changed.

## The two controls carry different weight

Begin Rest is a `primary` button: pressing it is the point of the card, and it commits the character to
the night. Foraging is an ordinary button with a d20, because it opens a roll window and decides nothing
until dice land. Giving both the same weight would tell the reader they carry the same consequence.

Neither restates what the card already says. The character's name is the identity part and the kind of
rest is the subtitle, so a control repeating either -- or explaining itself in a second line -- states one
fact three times. Both were rows before, and read as more data rather than as the thing to press.

The foraging block states its DC only while the roll is owed. Afterwards the result occupies the same
place, labelled by the check rather than the character, and the DC line goes: a standing "DC 12" above a
row named for the same check is the card saying one thing twice.

It carries no heading. A foraging check exists only when a character is short of food or water, and that
same state is what puts a Food or Water row above it -- so the block is always already inside Provisions,
and a "Foraging" label restates its own container. That ordering is guaranteed by the data rather than by
convention, which is what makes dropping the heading safe.

The pre-rest card carries no headings either, for the neighbouring reason: it has only one thing to say
about the character, so its rows have nothing to be distinguished from. A heading separates one group from
another, and a lone group is not a group.

## A pre-rest card shows only what that rest can give back

Spell slots appear only when the rest being taken can restore them. A short rest restores pact slots and
nothing else, so a wizard sees no slot line before one -- reporting "8 / 17" ahead of a rest that will not
move it is true and useless, while a warlock still sees their pact slots.

The rule is dnd5e's own, read from its configuration rather than restated:
`restTypes[type].recoverSpellSlotTypes` tested against each pool's `type` is exactly what
`_getRestSpellRecovery` applies (`dnd5e.mjs:38516-38520`). A multiclass warlock/wizard therefore shows the
pact half on a short rest and everything on a long one, without this file knowing what a warlock is. When
the configuration cannot be read the pools are shown: a missing set is our ignorance, not a claim that
nothing recovers.

**Hit dice are the exception, and deliberately so.** A short rest does not restore them -- it is where they
get spent -- so they are the most relevant number on the card rather than the least. The rule above is
about resources a rest gives back; hit dice are the resource it takes.

## Hit dice on a short rest

A short rest is mostly its hit dice, and dnd5e's own short rest is mostly the dialog that spends them.
Blacksmith suppresses that dialog, so it has to offer them itself or a short rest heals nothing.

Hit dice are **per class**: a Fighter 3 / Wizard 2 has three d10 and two d6, in separate pools, and the
rules let them choose which to spend and keep the big ones back. `system.attributes.hd.bySize` is dnd5e's
map of denomination to how many remain, and it is what the card composes from.

The card offers **one button per denomination**. A single-class character therefore sees one button and a
multiclass character sees the choice they actually have; nothing is hidden and the common case stays
simple. Pressing one calls `actor.rollHitDie({ denomination })`, which rolls, spends the die and applies
the healing in a single call -- the player owns their own actor, so all of that happens on their client.
Only the card rewrite needs the GM, over the same proxy the foraging roll uses.

The system's roll message **is** suppressed (`message: { create: false }`, which stops the card without
touching the mechanics), and the dice are shown through `api.rolls.showDice` instead.

Those are two halves of one decision. Foundry has no 3D dice of its own -- Dice So Nice supplies them, and
it normally fires off a chat message being created, which is why most modules get dice only by posting a
roll card. That is also how a party of five buries the card they are reading under twenty roll messages,
leaving the answer somewhere above the scroll. Calling the animation directly separates the two: the dice
roll on screen, the result lands on the card that asked for it, and nothing is posted. The health bar
rising and the die count falling say the rest in the place the player is already looking.

`showDice` is public API rather than a local helper because the same problem belongs to any roll that
lands somewhere other than a roll card. It honours the world's Dice So Nice setting and does nothing when
the module is absent, so no caller has to check.

Three rules decide when the offer appears, all chosen rather than derived:

| Rule | Why |
|---|---|
| Only when the character is hurt | Spending a die you cannot benefit from burns a resource for nothing |
| Only on a short rest | A long rest restores hit points outright |
| Once offered, it stays while dice remain -- including at full health | Spending a last die at full health is a choice a player is allowed to make, and a control that vanished underneath them would be the card overruling them |

The third is why `buildHitDiceParts` reads only `offered` and the pools, and never current hit points. The
decision is made once, when the rest completes, and stored.

**Auto Spend HD** is the GM's alternative, offered on the rest window for short rests only. With it on,
dnd5e spends dice automatically until the character is within three hit points of full or runs out --
which is fast, and will spend a d12 to heal four. With it off, the choice goes to the player, one die at a
time. Off is the system's default and ours.

## Outcomes are marks; states are not

Food and water resolve to a tick or a cross. The question is a yes-or-no, and a column of marks is read at
a glance where a column of phrases has to be parsed row by row. What the phrases carried that a mark cannot
-- the roll, the exhaustion it cost -- moves to the sublabel.

A pending check gets neither mark. It is not an outcome, and a tick or a cross would tell the reader the
question is settled while the button that settles it is still on the card. The one state that keeps words
is `unrolled`: a glyph cannot say why a roll could not be made.

This is also what preserves a distinction the words used to make. "Ate a ration" and "Foraged" are both a
green tick now, and they are told apart by the sublabel -- a forager has their roll on it and someone
eating from their pack has nothing.

A rest started anywhere else -- the party sheet, a character sheet, a system rest request -- still works,
and posts a `rested` card with no `before` phase. That path is why the request completion stamp below still
matters.

## The client split

This is the load-bearing fact about the feature, and the one that is invisible in the code of any single
function.

`dnd5e.restCompleted` is `Hooks.callAll` (`dnd5e.mjs:38317`). Foundry hooks are local: it fires on the
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

## Three shapes of grouped rest, and why the clock needs all of them

Treating any of these as ungrouped makes a five-character rest advance the clock forty hours. It has
happened twice, on two different paths, for the same reason.

**A rest is grouped when it has an id**, and `_applyRest` does not care where the id came from:

| Shape | Id | Roster read from |
|---|---|---|
| Our rest window | `restId`, stamped on every card it posts | the cards carrying that id |
| A dnd5e request | `config.request.id` | `system.targets` on the request message (`dnd5e.mjs:74326`) |
| `autoRest`, or a lone character | none | not grouped -- a burst, handled by a short timer |

**The window's rests must group even though no system request exists.** The window replaced
`party.longRest()`, and with it the request card that had been supplying the id -- so its acceptances
looked like a series of lone characters and each one moved the clock a full rest. The `restId` restores
the grouping the request used to provide.

**The window's roster is the cards that exist**, counted when an acceptance arrives, rather than a number
baked in at post time. It corrects itself: a card that failed to post never counts, and a card the GM
deletes removes that character from the rest instead of stalling it forever.

Below that, the two system shapes still differ:

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
`onUpdateResultMessage` (`dnd5e.mjs:82950-82951`) watch every message for that flag and write the message
id onto the matching target. A target with a result is complete; a target without one keeps offering its
Rest button.

So when the system card is suppressed, Blacksmith's card carries the same stamp, set after creation as
dnd5e does itself (`dnd5e.mjs:74353`). Only when the system card was actually suppressed: if dnd5e posted
its own it has already stamped the request, and a second stamp repoints the target at the wrong message.

## The card carries its own state

Everything needed to draw the card, including the already-rendered recovery rows, is stored in the message
flags. That is what lets a foraging roll made minutes later re-render the card from the message alone --
the `RestResult` and its clone are long gone by then, and re-deriving the recovery would be impossible.

Recovery rows are derived by diffing the live actor against `result.clone`, not by reading
`result.updateData`. dnd5e applies the update at `dnd5e.mjs:38299` and fires the hook at 38317, so the
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

**Selected tokens are an instruction.** A GM who has picked tokens out on the canvas has already said who
this rest is for, so those start ticked and nothing else does; with no selection, everybody is ticked,
because an untouched canvas is not a request to rest nobody. A selected actor the party list does not know
about joins the roster -- an NPC ally resting with the group is exactly the case a primary party misses.
Vehicles are excluded, since dnd5e refuses to rest them.

**New Day is offered on both rest types**, with a different default for each: set for a long rest, unset
for a short one, both read from `CONFIG.DND5E.restTypes`. A short rest can still begin a new day -- a night
watch broken by an hour's rest at dawn -- so only the default differs, never the availability. Switching
rest type resets the box to that type's default, but an unrelated re-render leaves the GM's own choice
alone.

## The window must not override what it does not ask about

The window sends its rest configuration explicitly, so every field it names overrides the system's default
for that rest -- including the ones the GM never thought about. An unticked box is not a neutral default;
it is `false`, sent deliberately.

`newDay` is the case that bit. dnd5e defaults a long rest to `newDay: true`
(`CONFIG.DND5E.restTypes.long.newDay`, applied at `dnd5e.mjs:38152`), and daily, dawn and dusk item uses
recover only when `recoverDailyUses || config.newDay` (`dnd5e.mjs:38542`). An unticked box therefore
skipped every one of them on an ordinary night, silently.

So a control that overrides a system default takes its own default **from that system value**, read at
render time rather than hardcoded. Anything the window does not mean to decide, it must not send.

## One click, one rest

A card stays `phase: 'before'` until the GM's rewrite lands, and that is a socket round trip away. Nothing
in between retires the row, so a second click passes the same pending check and starts a second rest.

The clicking client keeps a set of cards whose rest is in flight, claimed **before the first `await`** --
claiming it later leaves a gap two rapid clicks both fit through. It is released in a `finally`, so a rest
that fails leaves a button that still works rather than a dead one.

This closes the double click. It does not close a GM and an owner pressing the same card simultaneously
from two browsers: the GM's own dedup stops the second rest reaching provisions, the card or the clock, but
both `longRest` calls have already run against the actor. dnd5e has the same exposure on its own request
cards.

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
dnd5e stores a pool as how much is `spent` and derives `value` as `max - spent` (`dnd5e.mjs:11539`), so an
item has a pool only when it has a max.

Availability and consumption ask the same question, so an empty waterskin does not count as water.

One Survival check covers both food and water. A character searching a riverbank finds the berries and the
stream in the same hour, and two rolls would charge them twice for one activity -- so at most one level of
exhaustion is at stake per rest.

## Hit dice have a sign

The hit dice delta is a plain before-to-after difference (`dnd5e.mjs:38196`). A long rest recovers dice, so
it is positive; a short rest spends them, so it is negative. dnd5e flips it for display
(`dnd5e.mjs:38338`) because its card reports dice spent as a positive count. The sign alone says which
happened, so nothing needs to consult the rest type.

## Invariants

`node tools/check-rest-clients.mjs` guards these, and exits non-zero on a violation:

- A player accepting a rest hands it to the GM rather than dropping it, carrying the state built on their
  own client.
- A grouped rest moves the clock once, when the last character rests -- for a window rest as well as a
  system request, and the two go through the same code.
- A second click while a rest is in flight starts no second rest, and the guard clears afterwards.
- The window defaults New Day from the system's own configuration rather than hardcoding it.
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
