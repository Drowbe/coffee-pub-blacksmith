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



---

## Moved from `TODO.md` (2026-08-27)

Three lists of verification owed that had been filed as work items. They are not work -- the code has
shipped -- so they belong here, under the same rule as everything above: remove an item when it passes
rather than ticking it.

## Live-verify the compendium mapping simplification

Shipped unverified, and it touches settings storage, so worth a careful pass in a world that already has mappings.

- **Existing mappings survive.** Load a world configured before this change and confirm each type's Priority Slots slider reads the number it actually had configured, and that the dropdowns below hold the same compendiums in the same order.
- **Lowering the slider hides rather than deletes.** Drop a type from 8 to 3, reload, confirm slots 4-8 are gone from the UI; raise it back to 8, reload, confirm the original picks return.
- **The dropdowns are complete.** Confirm a journal compendium that used to be missing — one that failed the old "primary journal" heuristic — now appears in the JournalEntry dropdowns. That is the specific regression this change exists to fix.
- **What you pick is what gets searched.** Map a compendium that the old build would have vetoed, then resolve a name from it and confirm it resolves.
- **Scene mappings.** If Scene was mapped, confirm it now shows per-pack dropdowns and re-pick; the old `source:` values are skipped.
- Confirm the Included Sources section and the Auto-map checkbox are gone entirely, with no orphaned headings left behind.

## Live-verify the Compendium Search tool window

`api.compendiums.search()` itself is verified — 57/57 headless assertions, grouping proven across 10 sources (`testing/suites/suite-compendiums.js`). The palette built on it is not. There are three ways in — the Blacksmith scene-controls toolbar (Utilities zone, `fa-book-atlas`), the menubar left zone (magnifying glass, beside menu/settings/refresh), and Ctrl+Space. Confirm all three reach the same single window rather than opening duplicates, then check:

- **Drag lands on a character sheet.** Drag an Item row onto an open dnd5e character sheet and confirm the item is added. Then drag an Actor row onto the canvas and confirm a token is placed. Both ride Foundry's native `{type, uuid}` drop contract, so a failure here means the payload is wrong, not the sheet.
- **Drag as a player.** Log in as a player who owns a character and repeat. The tool is not GM-only, and a player sees only the packs they have permission on.
- **All types is the default.** Confirm the selector opens on All, that a query returns a mix (an Actor, an Item, a Journal entry) grouped by compendium, and that nothing appears twice — the dedup case is a pack mapped to both Item and Spell, where a spell would otherwise be listed once per type. Confirm the subtype filter is hidden in All mode and returns when a single type is chosen.
- **Type switching.** Switching type re-renders (the subtype list belongs to the type) — confirm focus returns to the search field and the subtype list is the new type's. Synthetic types (Spell, Feature, Class) should show no subtype selector at all, since their subtype is already fixed by the mapping.
- **All-types cost.** Time the first keystroke of a 3-character query in All mode with every type mapped — it warms every configured pack index at once, which is the worst case this window has. If it stalls the client, the fix is a higher minimum or a smaller default scope, not a spinner.
- **Themes.** Cycle Light / Dark / Glass from the title-bar menu and check, in each: the search box and both selects take a theme-appropriate surface rather than the old black box; placeholder text is legible; the focus ring appears on tab; an **opened** dropdown's rows are readable (that popup is drawn by the OS and inherits nothing, so it is the one that regresses independently); and the sticky source headers hide the rows scrolling under them.
  This is a shell-level fix in `styles/window-tool.css`, so also spot-check one other Tool consumer with a form — the same rules now apply to every Tool window, and a regression there would not show up on this palette.
- **Long lists.** Search a single letter with `minLength` reached (e.g. "ar") and scroll. Confirm sticky headers behave and the window's fixed 620px height with `resizable: true` is sensible.
- **Group headers.** Confirm each header shows the pack's own name on the left and its package quietly on the right, with no counts and no "Package: Pack" run-on. Search something that hits two different packages' "Equipment" packs and confirm the two headers are distinguishable.
- **Truncation status.** Search a broad query that exceeds the window's 100-result cap and confirm the footer says "more available, N compendiums not searched" in the accent color. Then search something narrow and confirm the message is absent — it must not appear merely because a count is round.
- **Reload indexes.** The title-bar refresh action calls `clearCache()`. Edit a compendium item's name, hit refresh, confirm the new name appears.
- **Ctrl+Space.** Confirm it opens the palette, and that pressing it again with the window already open focuses it rather than opening a second. Confirm it appears in Configure Controls under Blacksmith so it can be rebound — Ctrl+Space is the keyboard-layout switcher on some Windows and macOS setups, and on such a machine the OS will eat it. Also confirm it does *not* fire while you are typing in a chat box or another text field.
- **Menubar toggle.** Turn off Compendium Search in Menubar (Manage Content settings group) and confirm the menubar button disappears while the toolbar tool and keybinding still work.

Also confirm a JSON character import still works — the only consumer of the changed index shape (`_getPackIndex()` entries gained `img`) that the harness suite does not exercise.

Once the drag path is confirmed, update the Squire row in `TODO-GLOBAL.md`.

## Live-verify the expanded encounter bar readouts

Seventeen chips now share the middle zone — ten out of combat, seven in one — where six shared it before.
Shipped unverified.

- **Both sets read correctly.** Out of combat, check each of the ten against the Party Statistics window;
  the two consume the same aggregate, so any disagreement is a bug in the chip's write rather than in the
  numbers. In combat, check the seven against the end-of-combat card once the fight ends.
- **The ranking is the feature.** Narrow the window until chips start dropping and confirm they go in the
  order `READOUT_SUPPRESSION_ORDER` declares — campaign-scale figures first, the three originals last. If
  the wrong ones survive at a typical width, the fix is the ranking, not the set.
- **Fewest misses reads as a credit.** Hover it and confirm the tooltip says "Fewest misses on record".
  The aggregate ranks that measure low-is-best, so the bare number is misleading without the wording.
- **Portraits and totals stay distinguishable.** Per-person standings show a face; party totals show a
  number and no face. Confirm a six-figure lifetime total renders as `8.4k` with the exact figure in the
  tooltip.
- **Players see what the GM sees.** On a player client, confirm both sets render. The live figures arrive
  through the combat flag every client reads, so three blanks there would mean the mirror is broken.
- **Nothing regressed at the far end of the bar.** The suppression list grew from ten entries to
  twenty-one; confirm party health, monster health, and both timers still survive a narrow bar, since they
  rank after every statistic.

## Live-verify the Configure Pin tabs and broken links

Shipped unverified.

- **Five tabs.** Open Configure Pin on a journal pin as GM: General, Tags, Image, Appearance, Animations. Image holds only Pin Source (the icon library or image field); Appearance holds Pin Design and Text Format.
- **Type shows.** On a note pin the header subtitle, "Default for Note" and "Update All Canvas Pins for type: Note" all read Note, not blank.
- **Edits survive switching.** Change Size on Appearance, pick a different icon on Image, add a tag on Tags, change Pin visibility on General, flip between tabs, Save. All four are saved.
- **Update All and Default.** Turn on "Update All Canvas Pins for type" in the footer: the window re-renders and stays on the tab you were on.
- **Player owner.** As a player who owns a pin, open Configure Pin (Enter on the selected pin): only Image, Appearance and Animations, opening on Image.
- **Linked to.** On a journal page pin, General shows Linked to with the page name; clicking it opens that page. Same for a journal pin and a note pin.
- **Broken glyph.** Delete the journal page a pin points at. Within a moment the pin shows an amber broken-link glyph bottom right and a tooltip. As a player, the same pin shows no glyph.
- **Broken double-click.** Double-click the broken pin: "What this pin points to no longer exists." and nothing opens. Configure Pin shows the missing notice under Linked to.
- **It heals.** Undo the deletion if you can, reload the scene: the glyph is gone.
- **Not over-eager.** A pin whose page still exists shows no glyph, and a satellite pin of a type that declares no target never does.

## Live-verify relinking a broken pin

Shipped unverified. Needs a world with journal page pins, plus a compendium containing a journal with a page named like one of them. Merchant and Librarian pins are listed at the end.

- **Buttons.** Delete the page a journal pin points at. Open Configure Pin: General shows the missing notice with a **Relink** button, and the pin's right-click menu has **Relink Pin**. As a player, neither appears.
- **Ask first.** Pressing Relink asks Compendiums, This World, or Compendiums, then World, with the Pins setting **Relink: Where to Look** preselected. Turn **Relink: Ask Where to Look** off and confirm it goes straight to the search using the setting.
- **Compendium.** Choose Compendiums: the page from the compendium's journal appears marked Compendium, with its pack in the second line. Nothing is preselected, and Enter without choosing says to pick one.
- **World.** Choose This World: the same-named world page appears first, marked "Same name". A page with a different name does not appear.
- **Both.** Choose Compendiums, then World: compendium results come first.
- **Relink.** Pick one and choose **Relink**. "Pin relinked." appears, the amber glyph clears, and Linked to shows the page, which opens in the client. Unsaved edits elsewhere in the window are still there. A pin pointed at a compendium page keeps working on double-click.
- **Every compendium.** With **Relink: Search Every Compendium** off, a compendium you did not map in Compendium Mapping is not searched; on, it is, after the mapped ones, and the first search pauses briefly.
- **Drop.** Drag a page from the sidebar onto the box: its UUID fills in and Relink works. Drop an actor: the dialog reopens asking for a Journal Entry Page, with the dropped UUID still in the box. For a pin that pointed at a whole journal, drop one of its pages: it relinks to that journal. For a page pin, drop a whole journal: the refusal says to open the journal and drag one of its pages.
- **Bookkeeping.** After relinking to a world page, its pin toolbar shows it as already pinned, and double-clicking the pin opens it.
- **Merchant pin.** Delete a shop's actor, then Relink its pin: there is no question (world only), and only world actors named like the shop appear. After relinking, the pin shows the new shop's name, picture and kind tag. Choosing an actor that is not linked works and warns.
- **Librarian codex and quest pins.** Delete a codex entry, then Relink its pin to another entry: the pin takes the new entry's name, category icon and tags, and the new entry's panel row shows it as pinned. Same for a quest pin, which also takes the new quest's category. A compendium document is refused for both.
- **Not offered.** A note pin and a Librarian objective pin that are broken show the missing notice with no Relink button and no menu entry.
- **Animation headings.** On the Animations tab, the first column is headed Animation and the second Sound.
- **Rename on General.** Open Configure Pin on a journal pin: General opens with a **Name** field holding the pin's label. Change it, Save: the label on the map changes. With Update All on, the other pins of that type keep their own names.
- **Rename after a relink.** Relink a journal pin to a page named differently from its label: after Relink a dialog asks to rename the pin to the page's name. **Rename** changes the label, **Keep Label** leaves it. A page named the same (ignoring case) does not ask.

## Live-verify repairing many broken pins

Shipped unverified. Needs a scene with several broken journal pins, one broken Merchant or Librarian pin, and a broken note pin (a kind that cannot be relinked).

- **Repair Links.** Manage Pins shows **Repair Links** in the action bar. With nothing broken it says "No broken links to repair." As a player, the button is not there.
- **One question.** With broken journal pins it asks where to look once. With only Merchant or Librarian pins broken it does not ask.
- **The list.** Each broken pin has a row with its label, the kind of document, and a dropdown of matches marked Compendium or World. A pin with exactly one same-name match is preselected, and the rest read **Leave broken**. The dialog mentions the count of broken pins that cannot be relinked when a note pin is broken.
- **Apply.** Change one choice, tick the rename box and press **Apply**. The chosen pins relink, the glyphs clear, the window refreshes, and a summary reports the count. No rename question appears per pin. Without the rename box ticked, journal pin labels stay as they were.
- **Nothing chosen.** Setting every row to Leave broken and pressing Apply says to choose at least one.
- **Selected only.** In Manage Pin Tags, Select mode, tick two broken pins and one healthy one and press **Relink Selected**: only the two broken ones are listed.
- **Failure.** Delete a chosen document between opening the dialog and pressing Apply: the summary names the pin and the reason, and the rest relink.
- **Taxonomy.** Manage Pin Layers no longer lists empty Codex, Quest and Objective rows, and shows one Note row, not two.
