# Testing: verification owed for Request a Roll

**Audience:** us.

Scope: the Request a Roll work — the dice builder, the quick roll library, the Roll Builder, and the
menubar consolidation — where it has shipped and is not yet proven in a running world. **Remove an item
when it passes rather than ticking it, and delete this file when it is empty.** A checklist of ticked boxes
cannot be told apart from one nobody ran.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

**What is already proven.** The author exercised the dice builder, the quick roll rows, the Roll Builder,
the menubar consolidation and the silent quick-roll path live across the session that built them. What
survives here is what a single GM at a single client does not reach: a second person, a second world, a
reload, and the refusal cases.

Highest risk first, if time is short: the two-GM library case, and the contested-selection refusal.

---

## Two people

**A second GM sees the same library.** `requestRollQuickRolls` is world-scoped precisely so it is shared,
and nothing in a one-client session tests that. Log in as a second GM, confirm the QUICK tab shows the same
rolls, add one, and confirm it appears for the first GM after a reload. Favourites are `user`-scoped and
must *not* cross over — check that too, in the same pass.

**A player's view.** Left-clicking the dice tool must open the Dice Tray, not Request a Roll, and the
context menu must show Open Dice Tray and nothing about requesting rolls or the roll library. With
`sidebarManualRollsPlayersEnabled` off, the manual-rolls entry must be absent from a player's menu and still
present in the GM's.

**A player toggling manual rolls whispers the GM.** `_whisperGmManualRollsToggled` only runs for
non-GMs, so this needs a player client.

**Manual rolls across clients.** `core.diceConfiguration` is client-scoped, so the icon colour is per
person. Confirm that is what actually happens rather than assuming it — a GM turning manual rolls on should
not light a player's icon.

## A second world

**Seeding.** Create a fresh world and confirm the QUICK tab arrives with all twenty-four built-ins in six
categories.

**Not re-seeding.** Delete every quick roll, reload, and confirm they stay deleted. The
`requestRollQuickRollsSeeded` flag is the only thing standing between a GM's decision and the module
overruling it every launch.

**Export and import between worlds.** Export from one world, import into another, choose **Merge**, and
confirm the built-ins merge rather than duplicate — their ids are derived from what the roll is, and that is
the whole reason merging is safe. Then import the same file again and confirm nothing doubles. Then try
**Replace All** and confirm the library becomes exactly the file.

**Import refusals.** A non-JSON file, a JSON file of the wrong shape, and an array of things that are not
rolls must each be refused by name and leave the library untouched.

## Refusals and fallbacks

**A contest saved against "selected tokens" opens the window.** This is the case the silent path
deliberately refuses, because splitting a selection into challengers and defenders is a judgement. Fire one
from the menubar and confirm the window opens rather than a card posting with a guessed split.

**A contest saved against "whole party" fires silently** with NPCs selected, and produces a real contest
card with a Challengers/Defenders verdict — not an ordinary request where both sides simply roll.

**Nobody to roll.** Fire a `selected`-targeted quick roll with nothing selected; the window should open.

**A favourite saved before `targets` existed.** An older contested favourite has no `targets` and must fall
back to the window rather than guessing. Needs a favourite saved before this release, so it is only
testable on an upgraded world.

## Reload and persistence

**The dice icon opens lit.** Enable manual rolls, reload, and confirm the menubar icon is still orange
before anything is clicked.

**The icon follows an outside change.** With the menubar visible, open Foundry's own Configure Dice sheet
and switch a die back to normal. The icon must follow without a reload.

**Remembered dice rolls survive.** Remember a dice build, reload, confirm it is still under the builder and
still loads back into the rows in the order it was written.

## Judgements about how it looks

**The Roll Builder under all three Tool themes.** Its stylesheet has no colour literals, so Light, Dark and
Glass should each look deliberate. Check the icon palette and the choice cards in particular, and check an
open `<select>` dropdown, which is an OS popup that inherits nothing from the window.

**The marks in a long list.** Scroll the QUICK tab with all twenty-four rolls and confirm the marks read as
a glance rather than as clutter, and that a long description still truncates cleanly beside them.

**A cinematic quick roll from the menubar.** Fire one and confirm the overlay reaches the players as well as
the GM — the socket broadcast is on the silent path now, not only the window's.
