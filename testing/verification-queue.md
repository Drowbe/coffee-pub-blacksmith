# Testing: verification owed for the 2026-08-07/08 work

**Audience:** us.

Scope: code that has shipped and is not yet proven in a running world, and the steps to prove it. This is a
transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.** A checklist of ticked boxes cannot be told apart from one
nobody ran.

**Status: the harness half is finished, and a live multi-client session on 2026-08-19 exercised the happy
paths.** A full "Run All Headless" passes **519/519** as of 2026-08-09, across all nine suites.

**Do not read the length of this list as untested code.** This page was curated from the start to hold only
what play does *not* reach, so a session that goes well removes almost nothing from it. What survives is
races that need two clients acting at the same instant, permission boundaries that need a deliberate attempt
to cross them, a browser reload, and judgements about how something looks. Every one of those is still owed
after a good session, and the permission items are the ones where a pass matters most: a leak there is a
bypass, not a cosmetic fault.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

Highest risk first, if time is short: the two-client inventory case, the encumbrance guard with the guard
switched off, and the XP reload case.

**Run the harness whole, not per tab.** Every defect found on 2026-08-09 was order-dependent - the per-tab runs
were green while the full run was red, because the inventory and XP suites churn actors and combats while the
readouts checks are reading the bar. A tab passing on its own proves less than it looks.

## Tags write path - two clients, cannot be automated (opened 2026-08-25)

The `Tags` suite passes 32/32 and covers every case reachable from one client. Four of the five live items
here passed on 2026-08-25: the no-GM-online refusal, a pin write leaving no row, the legacy purge running
once, and the bulk pin strip. **One remains, and it is the one the write-path fix was mostly for.**

Before the fix a player computed the entire `tagAssignments` object locally and shipped it to the GM, who
wrote it verbatim, so a player holding a stale copy overwrote every context key for every module.

**Sequencing the two clients by hand does NOT test this.** Foundry pushes a world setting change to every
connected client and fires `updateSetting`, so a player who simply waits ends up with a FRESHER copy, not a
staler one. Run the naive version - GM tags, then player tags, then compare - and it passes against the
broken code as well, which is worse than not running it. The window has to be forced.

- [ ] **A player write does not destroy a GM edit the player has not yet seen.** Force the window by
  blocking the player's main thread, so the socket message carrying the GM's change cannot be processed
  until after the player's write is composed.

  1. GM: `await api.tags.setTags('zz-clobber.gm', 'g1', ['before'])`
  2. Player: run the blocking macro below. It logs what it can see, spins for 20 seconds, logs again, then
     writes.
  3. GM, while the player is spinning: `await api.tags.setTags('zz-clobber.gm', 'g2', ['during-block'])`
  4. Wait for the player's macro to finish.
  5. GM: read `tagAssignments`. `zz-clobber.gm` must hold **both** `g1` and `g2`, and `zz-clobber.player`
     must hold `p1`.

  **The second log line is the control.** It must still show only `g1`. If it shows `g2`, the block did not
  hold, the player's copy was never stale, and the run proves nothing - redo it with a longer spin.

  Player macro:
  ```js
  const api = game.modules.get('coffee-pub-blacksmith').api;
  const read = () => JSON.stringify(
      game.settings.get('coffee-pub-blacksmith', 'tagAssignments')['zz-clobber.gm'] ?? null);
  console.log('BEFORE block, player sees:', read());
  const until = Date.now() + 20000;
  while (Date.now() < until) { /* block the event loop; the GM's update cannot be applied */ }
  console.log('AFTER block, player still sees:', read(), '<- must NOT contain g2');
  await api.tags.setTags('zz-clobber.player', 'p1', ['player-tag']);
  console.log('player write done');
  ```

  Cleanup, as GM:
  ```js
  const api = game.modules.get('coffee-pub-blacksmith').api;
  await api.tags.deleteRecordTags('zz-clobber.gm', 'g1');
  await api.tags.deleteRecordTags('zz-clobber.gm', 'g2');
  await api.tags.deleteRecordTags('zz-clobber.player', 'p1');
  await api.tags.delete('before'); await api.tags.delete('during-block'); await api.tags.delete('player-tag');
  ```

  A cheaper positive check, if the timing proves awkward: log the proxy payload on the player client and
  confirm it carries `{contextKey, recordId, tags}` for the one record and no other module's context keys.
  A delta cannot clobber, so the payload shape is the property; the run above is what proves it end to end.


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



Items are one line each on purpose. Wrapped continuations in this file keep being reformatted into code
fences by an editor pass, which has mangled it twice; a single line cannot be mangled that way.

## Token interaction registry

Confirmed on a player session: a non-GM double-clicking a matched NPC ran the claim's handler and got no Actor
sheet. What remains is whether the relaxation stays scoped. **Highest-value item on this page** - a leak here
is a permission bypass, not a cosmetic fault, and the answer is to pull the feature rather than patch around it.

Blacksmith side, with no claim registered:

- [ ] A token the player lacks permission on: double-click does nothing, and no sheet opens.
- [ ] The player's own character: sheet opens normally, unchanged.
- [ ] A GM double-clicking any unclaimed token: sheet opens normally.

Curator side, with its loot claim registered:

- [ ] A claimed corpse: the loot window opens for a player who has no permission on it.
- [ ] A **different** corpse the same claim does not match: double-click does nothing.
- [ ] A claim whose `handler` throws opens nothing - specifically not the Actor sheet, since permission has already been granted by that point.
- [ ] Disable Curator mid-session (`disposeByContext`): a claimed token reverts to normal double-click immediately, without a redraw.

## api.dialog modality (default changed to non-modal)

The only change in 13.16.0 with real regression risk for satellites: a caller that assumed nothing behind it
could be touched now behaves differently. Blacksmith's own callers are all destructive or prompts, so the risk
sits outside this repo.

Blacksmith callers:

- [ ] A **destructive** confirm still blocks everything behind it - delete a pin layer in Manage Pins.
- [ ] A non-destructive confirm no longer blocks - the window behind it stays draggable.
- [ ] Escape resolves to `closeValue` on a modal dialog.
- [ ] Escape resolves to `closeValue` on a non-modal dialog.

Curator callers:

- [ ] A quantity prompt from the loot window leaves that window draggable and clickable.
- [ ] Taking a second item while a quantity prompt is open behaves sanely - either refused or queued, not two prompts fighting.
- [ ] Any Curator confirm that was written expecting modal still reads correctly now it is not.

## Shared button width

- [ ] A window with **two** footer buttons lays out correctly now the fixed 300px is gone from `.blacksmith-window-btn-primary`.
- [ ] Manage Pins and the pin config footers still look right - both had local resets that are now deleted.
- [ ] A Curator window with a two-button footer, since Curator inherits the same base and the reset it relied on is gone.



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

