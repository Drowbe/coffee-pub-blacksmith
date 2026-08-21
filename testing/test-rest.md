# Testing: verification owed for the rest work (2026-08-17/18)

**Audience:** us.

Scope: the rest window, the two-phase rest card, hit dice, foraging, provisions, and the Dice So Nice
consolidation. Transitional -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather
than ticking it, and delete this file when it is empty.** A checklist of ticked boxes cannot be told apart
from one nobody ran.

**Status: the main paths passed in a live multi-client session on 2026-08-19.** Rest requests, the rest
window, grouped rests, hit dice, foraging and the dice animations were all exercised in play with players
on their own clients, and the two-client case this work started from -- a GM request that a player accepts
-- worked. Those items have been removed.

**What is left is what play does not reach**, and it is all one of three shapes: a setting deliberately
flipped to its other state, a browser reload mid-flow, or a sequence spanning more nights than one session
holds. None of it is known to be broken; none of it has been seen.

Everything the harness can already prove has been left out on purpose: composition, the offer rules, the
provision marks, the slot filter and the waterskin are all assertions in `tools/check-rest-clients.mjs`,
and a line here repeating them would be a second place to maintain the same claim.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

Items are one line each on purpose -- see the note in `verification-queue.md` about wrapped lines being
mangled by an editor pass.

## Settings in their other state

Each of these is the configuration the live session did not happen to be in. Flip it, run one rest, flip it back.

- [ ] The same rest with **Auto Rest** on still posts cards and moves time. This is the control that kept passing while the two-client case was broken.
- [ ] With **Suppress System Rest Card** on, a player accepting ticks that character off the request and its Rest button stops offering itself.
- [ ] With it off, the system posts its own card and the request still completes exactly once.
- [ ] With **Auto Spend HD** ticked, dnd5e spends them during the rest and the card offers none.
- [ ] Turn the food setting off globally, tick Track food in the window: rations are consumed for that rest only.
- [ ] With **Enable Dice So Nice** switched OFF, the toolbar button animates nothing. It ignored this setting before, which is the bug that was fixed.

## The rest window - selection and mode details

Seen on screen and used, but these specific behaviours were not deliberately checked.

- [ ] Select two tokens, open it: only those two start ticked. Deselect everything and reopen: all ticked.
- [ ] Select an NPC ally not in the primary party: it appears in the roster.
- [ ] Switch to Short Rest: New Day unticks, Provisions and Hit Point options disappear, Hit Dice appears. Switch back: they return.

## Sequences longer than one session

- [ ] Four nights running on a waterskin: it empties, then triggers foraging, and never vanishes.

## Recovery paths

- [ ] Delete one of two pre-rest cards, then rest the other: the clock moves rather than waiting forever.
- [ ] Reload mid-rest with a pre-rest card on screen: the card still works, since its state lives on the message.
