# Testing: verification owed for the 2026-08-07/08 work

**Audience:** us.

Scope: code that has shipped and is not yet proven in a running world, and the steps to prove it. This is a
transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.** A checklist of ticked boxes cannot be told apart from one
nobody ran.

**Status: 25 items owed.** Nothing here is known broken; it is all unverified. Two suites in
`utilities/tests/` cover the automatable half -- run `utilities/test-harness.js` in a script macro as GM and
use "Run All Headless". Everything under a "cannot be automated" heading needs a second client, a browser
reload, or a human judgement, and those are the items most likely to be skipped and most likely to matter.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

Everything below is written, syntax-checked, and passing both invariant checks, and **none of it has been
exercised in a running world** except where noted. Delete an item when it passes; delete the whole section
when it is empty.

Two things are worth knowing before working through it. **The harness is the cheap half:** paste
`utilities/test-harness.js` into a script macro as GM and use "Run All Headless", which covers 33 assertions
across the two new suites. **The expensive half cannot be automated** - a second client, a browser reload, or
a judgement about what a window looks like - and those are the items most likely to be skipped and most likely
to matter.

Highest risk first, if time is short: the two-client inventory case, the encumbrance guard with the guard
switched off, and the XP reload case.

**Partly answered: the full run on 2026-08-08 reported 463/476 with 13 failures.** The XP Record tab was the
suspect and accounts for **four** of them, all the same cause - two checks set a token name and asserted on it,
and Blacksmith's own nameplate renaming overwrote it first. Neither was an XP defect. Both are fixed in the
suite and the code defect they exposed is in the `CHANGELOG.md` Fixed section. **Nine failures remain
unidentified, in some other suite.** Do not assume they are harmless.

## Harness - XP Record tab

`sweep-does-not-loop` and `record-is-evidence-not-verdict` have passed. Remaining:

- [ ] Re-run the whole tab after the naming fix, expecting 33/33. The checks refuse to run while a combat is
      active - they create their own Combat and will not disturb a live one - so end combat first.
- [ ] `sweep-does-not-degrade` passes on its own merits. Its hit-point assertions already pass and only the two
      name assertions failed, so the behaviour it exists for - the periodic sweep replacing good evidence with
      prototype values once a token is gone - is proven for hit points and not yet for the name.
- [ ] Run "Run All Headless" again and name the other nine failures.



## Inventory - live, cannot be automated

- [ ] **Two clients loot one corpse simultaneously.** Total received must equal total removed. The mutex is
  ```
  per-client by design, so this measures what that actually costs in practice.
  ```
- [ ] **Two players swap items simultaneously.** Both complete rather than hang. Sorted lock acquisition
  ```
  exists for this; the failure mode is a hang with no error.
  ```
- [ ] Curator's loot window end to end: per-row TAKE, a partial quantity, a currency TAKE, an emptied row
  ```
  disappearing, and an item the looter already held growing rather than adding a second row.
  ```
- [ ] Take All over a corpse holding a **packed bag**: every other row moves, the bag is refused with a
  ```
  content count, and the bag stays on the corpse.
  ```
- [ ] Take All over a corpse holding **two identical stacks**: they arrive as one stack, not two rows.



## Encumbrance guard

Three of these are done. The activation line appeared in a full run (`Encumbrance Guard active: serialising dnd5e encumbrance recomputes per actor (dnd5e 5.2.5)`), no libWrapper conflict warning appeared alongside it,
and the harness proved the mechanism directly - six separate writes to one near-threshold actor produced zero
duplicate-id rejections, and an unrelated failure still propagated rather than being swallowed by the narrow
catch.

- [x] **Switch** `enableEncumbranceGuard` **off, reload, and confirm** `guard-collapses-recomputes` **now FAILS.** A
  ```
  guard that cannot be turned off to watch the bug return is assumed rather than demonstrated. This is the
  only item left that proves the guard does anything, and nothing in a passing run can substitute for it.
  ```
- [x] Loot several items onto a near-encumbered player through Curator's window. The harness covers the
  ```
  mechanism, so this is now a low-risk confirmation that the real path behaves the same rather than a
  test of the guard itself.
  ```



## Token interaction registry

The permission bypass is **already confirmed** on a player session - a non-GM double-clicking a matched NPC
ran the claim's handler and got no Actor sheet. What remains is whether the relaxation stays scoped.

- [ ] **A non-matching token the same player lacks permission on: double-click must do nothing.** If a sheet
  ```
  opens, the relaxation is leaking past the claim. Treat that as a security regression and pull the
  feature rather than patching around it.
  ```
- [ ] Same player, their own character: sheet opens normally.
- [ ] A claim whose `handler` throws opens **nothing** - specifically not the Actor sheet. Permission has
  ```
  already been granted by that point, so falling through would leak the sheet.
  ```
- [ ] `disposeByContext` while a claimed token is on screen: double-click reverts immediately, without a redraw.



## api.dialog modality (default changed to non-modal)

- [ ] A quantity prompt raised from Curator's loot window leaves that window draggable and clickable.
- [ ] A **destructive** confirm still blocks everything behind it - delete a pin layer in Manage Pins.
- [ ] A non-destructive confirm no longer blocks. This is the only item with real regression risk: a caller
  ```
  that assumed nothing behind it could be touched now behaves differently. Blacksmith's own callers are all
  either destructive or prompts, so the risk sits with satellites.
  ```
- [ ] Escape still resolves to `closeValue` on both a modal and a non-modal dialog.



## Shared button width

- [ ] A window with **two** footer buttons lays out correctly now the fixed 300px is gone from
  ```
  `.blacksmith-window-btn-primary`. That is the case the width was breaking.
  ```
- [ ] Manage Pins and the pin config footers still look right - both had local resets that are now deleted.



## XP record - live

- [ ] **The reload case.** Kill something, delete its token, reload the browser **without ending combat**, then
  ```
  end combat. Both the resolution and the name must hold. This is the one that proves persistence rather
  than in-memory state, and it is the case that found the last two bugs.
  ```
- [ ] The combat tracker keeps the fought name after the corpse is cleared, and still does a minute later -
  ```
  the revert ran on a later data-preparation cycle, so it is not immediate.
  ```
- [ ] A wounded monster that survives reads `Escaped`, not `Ignored`. Nothing on the Combatant records how hurt
  ```
  something was, so this is the case that genuinely needs the record rather than the stored `defeated` flag.
  ```
- [ ] Create Combat with a live token and a corpse on canvas, nothing selected: only the live one enters, and
  ```
  the console names the skip count.
  ```
- [ ] Encounter CR badges: a monster at zero drops the monster CR; a **player character at zero does not**
  ```
  drop the party CR. That asymmetry is deliberate and is the one most likely to be reported as a bug.
  ```

