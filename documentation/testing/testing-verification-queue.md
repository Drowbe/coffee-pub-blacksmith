# Testing: verification owed for the 2026-08-07/08 work

**Audience:** us.

Scope: code that has shipped and is not yet proven in a running world, and the steps to prove it. This is a
transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.** A checklist of ticked boxes cannot be told apart from one
nobody ran.

**Status: 21 items owed, and the harness half is finished.** A full "Run All Headless" passes **519/519** as of
2026-08-09, across all nine suites. Everything still listed below is something a harness cannot reach: a second
client, a browser reload, cross-module integration, or a judgement about what something looks like. Those are
the items most likely to be skipped and most likely to matter.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

Highest risk first, if time is short: the two-client inventory case, the encumbrance guard with the guard
switched off, and the XP reload case.

**Run the harness whole, not per tab.** Every defect found on 2026-08-09 was order-dependent - the per-tab runs
were green while the full run was red, because the inventory and XP suites churn actors and combats while the
readouts checks are reading the bar. A tab passing on its own proves less than it looks.

## Combat bar - live

- [ ] Watch the bar during an actual fight. The lifetime standings chips must stay put as hit points change,
      rather than blanking and returning. The harness can only prove the chips are present at the moment it
      looks; it cannot prove they never flickered.



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

