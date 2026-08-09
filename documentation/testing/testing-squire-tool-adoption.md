# Testing: Dice Tray, Macros, and Health adoption

**Audience:** us.

Scope: the Squire tool adoption shipped 2026-08-09, which has not been run in a world at all. This is a
transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.**

**Status: nothing here is proven. No part of this work has been loaded in Foundry.** It was written
unattended against Squire's source and Foundry's own source, and syntax-checked; that is all. Treat a clean
console as the first hurdle, not a pass.

Results go to the **Verify** line of the `[Unreleased]` `CHANGELOG.md` entry, not back into this file.

**Order matters. Squire must not delete anything until the phase covering it passes here.** Squire deleting
first leaves a release with no dice tray at all.

Highest risk first, if time is short: the macro list surviving adoption, the duplicate-icon check, and the
threshold unification, which is the only item that changes behaviour users already had.

## Load

- [ ] Client loads with both Blacksmith and Squire active, no console errors. Three icons in the menubar:
      dice, heart-pulse, code.
- [ ] **Exactly one of each icon, not two.** Both modules release together, so Squire's copies should
      already be gone. Two icons means Squire still registers a tool that has not been deleted.

## Settings adoption -- do this before anything else touches the values

- [ ] **Before updating**, write down the exact contents and order of the macro list and the favourites, and
      the three health threshold values if they were ever changed from 75/50/25.
- [ ] After updating, open the macros window: list and order identical to what was written down.
- [ ] Right-click the macros menubar icon: favourites listed, in order, each with its macro artwork.
- [ ] Settings sheet shows the three health thresholds under Health Indicators with the previous values, not
      the defaults.
- [ ] As a **second user**, confirm their macro list is theirs and not the first user's. This is what the
      per-user ledger is for; a world-scoped guard would have let one user's adoption block everyone else's.
- [ ] In a **second browser**, confirm favourites are empty. This is expected -- `userFavoriteMacros` is
      client scope -- and the point of checking is that nothing errors and the empty list does not overwrite
      the first browser's.
- [ ] Reload twice. Adoption must not run again: changing an adopted value and reloading must not revert it.

## Window position, titlebar, and theme

- [ ] Each of the three windows opens where Squire's did, with the same titlebar mode and the same theme.
      This is `migratePositionKey` moving three localStorage keys per window.
- [ ] Move and re-theme a window, reload, and confirm the new position and theme persist under the new key.

## Dice Tray

- [ ] Roll each die type. Result posts to chat and the recent-rolls strip updates.
- [ ] The chat card looks the way it did in Squire -- the description and "Rolling:" lines are styled. These
      moved from a per-message CSS string into the stylesheet, so this is the check that the move worked.
- [ ] Toggle recent rolls off, close, reopen. Window is short and the setting persisted. Toggle back on: the
      window returns to full height. This is the 280/150 pair Squire flagged as load-bearing.
- [ ] Roll with advantage and disadvantage on a multi-term formula. Dice double and keep the right half.
- [ ] Re-roll from a history entry.
- [ ] **Select a token, then roll, and check the speaker on the chat card.** It should be resolved by
      Foundry from your own token, unchanged from before. If the speaker follows the window title instead,
      the reasoning in the file header is wrong.
- [ ] Open an NPC's actor sheet without selecting anything. The dice tray title must **not** change. This is
      the deliberate behaviour change; confirm it reads as sane rather than broken.

## Macros

- [ ] Drag a macro from the hotbar into the window. It appends, once, not twice. Two copies means the
      re-entrancy guard is not holding.
- [ ] Reorder by dragging. Order persists across a reload.
- [ ] Left-click runs a macro and the slot shows its spinner briefly.
- [ ] Right-click toggles a favourite; the menubar right-click menu reflects it without a reload.
- [ ] Middle-click and Shift+click clear a slot, then remove it. The last slot never disappears.
- [ ] Remove a favourited macro from the list. It must also disappear from the favourites menu.
- [ ] Drag something that is not a macro onto the window. It is refused with a warning rather than added.

## Health

- [ ] Select one token: the window follows and titles with the token's name.
- [ ] Select three: three rows, plus Party and NPC summary rows, titled "Health: 3 Selected".
- [ ] Deselect everything: the window shows the scene summary rather than stale rows.
- [ ] **A scene with no NPCs, or no party.** The empty group's bar must not render at a broken width -- this
      was NaN before the fix and is the reason `fillPercent` exists.
- [ ] Apply damage and healing at several amounts; the amount persists across a reopen.
- [ ] Click a row to narrow the controls to it, click again to widen back.
- [ ] The Select Party and Select NPCs buttons select tokens on the canvas, and the window follows.
- [ ] Click the combat bar's party health bar. The Health window opens -- the `party-health` intent now
      resolving to Blacksmith's own tool rather than Squire's.
- [ ] With Squire installed, the conditions button appears on each row **only if** Squire registers a window
      under `blacksmith-status-effects`. Until it does, the button is absent by design; confirm its absence
      does not leave a gap in the row layout.
- [ ] As a player with the Health tool setting off, the icon is absent; on, present, and the window works.
- [ ] Select 20+ tokens at once. One re-render, not twenty -- the selection hook is debounced for this.

## Threshold unification -- the one behaviour change

- [ ] Set `healthThresholdBloodied` to something well away from 50, say 70.
- [ ] Confirm **all three** change together: the Health window bar colour, the combat bar portrait ring, and
      the token blood indicator on the canvas. Previously the window used the setting and the other two used
      hardcoded 75/50/25.
- [ ] Confirm a creature at exactly the threshold classifies as bloodied. Boundaries are inclusive now.
- [ ] Restore the thresholds and confirm everything returns to the previous appearance.

## Window reopen on load

- [ ] Leave all three windows open, reload. All three reopen.
- [ ] Close all three, reload. None reopen.
- [ ] This behaviour existed in Squire through a `windowStates` user flag that the handover note did not
      list. Confirm the flag was adopted rather than reset -- a user who had windows open before the update
      should still have them open after.
