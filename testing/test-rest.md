# Testing: verification owed for the rest work (2026-08-17/18)

**Audience:** us.

Scope: the rest window, the two-phase rest card, hit dice, foraging, provisions, and the Dice So Nice
consolidation. Transitional -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather
than ticking it, and delete this file when it is empty.** A checklist of ticked boxes cannot be told apart
from one nobody ran.

**Status: nothing here has been run in Foundry.** `node tools/check-rest-clients.mjs` passes 139
assertions and every defect it was written for fails it when reintroduced -- but it is a Node harness
against stubs, and it models our understanding of two clients rather than Foundry's actual behaviour. The
P0 this work started from was found by a person reading code, not by a check.

Everything the harness can already prove has been left out on purpose: composition, the offer rules, the
provision marks, the slot filter and the waterskin are all assertions in that file, and a line here
repeating them would be a second place to maintain the same claim. What remains needs a running world -- a
second client, a canvas, an animation, a reload, or a person judging what something looks like.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

Highest risk first, if time is short: the two-client rest, the request completion stamp, and the toolbar
dice button.

Items are one line each on purpose -- see the note in `verification-queue.md` about wrapped lines being
mangled by an editor pass.

## Two clients - the case that started this

- [ ] GM sends a rest request from the party sheet; a PLAYER accepts. A Blacksmith card posts and the clock moves. This produced nothing at all before the fix.
- [ ] The same rest with **Auto Rest** on still posts cards and moves time. This is the control that kept passing while the above was broken.
- [ ] With **Suppress System Rest Card** on, a player accepting ticks that character off the request and its Rest button stops offering itself.
- [ ] With it off, the system posts its own card and the request still completes exactly once.

## The rest window - never yet seen on screen

- [ ] It opens from the clock menu and renders.
- [ ] Select two tokens, open it: only those two start ticked. Deselect everything and reopen: all ticked.
- [ ] Select an NPC ally not in the primary party: it appears in the roster.
- [ ] Switch to Short Rest: New Day unticks, Provisions and Hit Point options disappear, Hit Dice appears. Switch back: they return.
- [ ] Begin Rest posts one card per selected character and closes.

## The clock, grouped

- [ ] Two characters from one window rest minutes apart: the clock moves ONCE, after the second. This is the forty-hour bug's second incarnation.
- [ ] Delete one of two pre-rest cards, then rest the other: the clock moves rather than waiting forever.
- [ ] A character resting from their own sheet still posts a card and still moves the clock.

## Hit dice - the parts a harness cannot see

- [ ] Spending a die: dice animate, **no roll card appears in chat**, the health bar rises and the count falls.
- [ ] With **Auto Spend HD** ticked, dnd5e spends them during the rest and the card offers none.

## Foraging and provisions - live only

- [ ] Rolling the Forage button updates that same card and applies exhaustion on a failure.
- [ ] Four nights running on a waterskin: it empties, then triggers foraging, and never vanishes.
- [ ] Turn the food setting off globally, tick Track food in the window: rations are consumed for that rest only.

## Dice So Nice consolidation - regression risk outside rest

- [ ] The **toolbar dice button** still rolls and animates. It was rewritten to delegate.
- [ ] With **Enable Dice So Nice** switched OFF, the toolbar button animates nothing. It ignored this setting before, which is the bug that was fixed.
- [ ] A normal skill check from the roll window still animates, since `processRoll` now calls the shared primitive.

## Startup and sockets

- [ ] Client loads with no console errors, GM and player both.
- [ ] A player's rest and a player's forage roll both reach the GM. The socket handlers register late, on `blacksmith.socketReady`.
- [ ] Reload mid-rest with a pre-rest card on screen: the card still works, since its state lives on the message.
