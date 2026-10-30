# Character Delegation Architecture

**Audience:** Contributors to the Blacksmith codebase. There is no public API; the window and one setting are the whole surface.

When a player misses a session, someone else runs their character. In Foundry that is a single fact: the delegate has Owner on the actor. The Character Delegation window is a grid for changing that, for every player and every character at once, and for returning to the usual arrangement afterwards. `scripts/manager-delegation.js` is the data and the actions, `scripts/window-delegation.js` is the grid, and `styles/window-delegation.css` holds the layout.

## Ownership is the only truth

A cell is one player's level on one actor, read straight from `actor.ownership[userId]`; no entry reads as `INHERIT`, which is "Default" in an actor's ownership dropdown, so the player falls back to the actor's Default ownership. A cell is never a record of its own, so it cannot disagree with Foundry's permission sheet; edit ownership there and the grid follows, because the window re-renders on `updateActor`.

A GM is never a row. A GM owns everything, so a cell for one would always read the same and mean nothing.

## The grid

Rows are the non-GM users in name order, each a card (portrait or avatar, and name) as tall as a character cell. Columns are `DelegationManager.actors()`: the party's player characters (`getPartyMembers`), then the NPCs players own (`getOwnedNpcs`: familiars, summons, companions). Group actors are left out on purpose, since a group is routinely owned by everyone. There are no column headings: a cell is the character's portrait, and its tooltip names the player, the character and the level.

**One click steps the level.** `DelegationManager.cycle` moves a cell to the next level in a ring: Default, Owner, Observer, Limited, None, and back to Default. Default is first and Owner second because handing a character over is what the window is for, so one click from Default is Owner. The level is shown by a small icon on a disc in the cell's lower right (a minus for Default, a hand for Owner, an eye for Observer, a low-vision eye for Limited, a ban for None), and by the portrait: grey and dim on Default and None, part way up on Limited and Observer, full colour with a brand-orange ring on Owner. Default is written as `INHERIT` (-1), never as a number that would pin the player to a level. Only a GM writes; the window refuses to open for anyone else. An ownership window for the actor was considered and dropped: it is Foundry's own sheet and one click away from the actor, and the cycle does the job without leaving the grid.

## The remembered arrangement

**Set as Default** stores `delegationDefaults`, one hidden world setting: `{ actorId: { userId: level } }`, holding only the players who were not on Default at that moment, so an actor saved with `{}` means everyone on Default. It replaces what was there. (The first build stored `{ actorId: [userId] }`, owners only; `getDefaults` still reads that as Owner for each.) **Reset to Default** (`resetPlan`, then `resetToDefaults`) changes only the cells that differ, one `actor.update` per actor, after a confirmation that says how many. A character with no entry has never been saved and Reset leaves it alone, so a new character does not have its owners stripped. The button is disabled when there is nothing to change, and its tooltip says why. It is the window's primary button, at the far right; Set as Default is the secondary beside it.

A cell that differs from the remembered arrangement carries a small orange dot (`changed`), which is how a delegation in force reads at a glance, and also how a player taken off a character they normally run reads. A character with nothing remembered never shows the dot.

## Where it opens from

The Party Leader menubar menu (`MenuBar.showLeaderMenu`) has a **Character Delegation** item, in the GM's part of the menu only: the elected leader's own menu is still just Start a Vote. It imports the window lazily. The window is also registered with `registerWindow` as `blacksmith-delegation-window`, like the other tool windows. It is not a menubar tool of its own and is not reopened on load.

## What it does not do

It does not change a user's assigned character (`user.character`), which is a separate Foundry setting and decides whose sheet a player gets by default. Delegation is access to a character, not a change of who the character belongs to. It does not touch token or prototype-token permissions, which follow the actor's.
