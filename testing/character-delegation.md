# Testing: Character Delegation

**Audience:** us.

Scope: the delegation grid and the remembered arrangement (`scripts/manager-delegation.js`, `scripts/window-delegation.js`). Needs a GM client and at least two player users with characters.

1. Open it. As the GM click the Party Leader item in the menubar. Expected: the menu has Start a Vote, Vote for Leader and Character Delegation; choosing the last opens a window titled Character Delegation. As the elected leader (not GM) the menu has only Start a Vote.
2. The grid. Expected: a row per player (no GMs) as a card with their portrait and name, the same height as a character portrait; a column per player character and per player-owned NPC, with no names above them; a small icon in each portrait's lower right. Default shows a minus on a dim grey portrait. Group actors are not listed. There is no helper text in the footer.
3. Click cycles. Press a dim cell repeatedly. Expected: Default (minus) goes to Owner (hand, full colour, orange ring), then Observer (eye), Limited (low-vision eye), None (ban), then back to Default; each step is one click. The tooltip names the level now and the one the next click gives. Open that actor's Configure Ownership after each step: it shows the same level, and Default reads Default, not None.
4. Back to Default. Take a cell back round to Default. Expected: that player's entry in the actor's ownership dropdown reads Default and the player's access matches the actor's Default level.
5. Follows Foundry. With the window open, change a player's ownership in an actor's own ownership sheet. Expected: the grid follows within a moment without reopening.
6. Set as Default (the secondary button, left of Reset). With a normal arrangement showing (each player owns their own character), press it. Expected: a notice saying how many characters were saved; no cell shows an orange dot; Reset to Default is disabled and its tooltip says everything already matches.
7. Delegate. Give one player Owner on another player's character, and Observer on a third. Expected: both cells carry an orange dot; Reset to Default (the primary button, far right) is now enabled, and its tooltip says how many characters it would put back.
8. Reset. Press Reset to Default and confirm. Expected: the extra owner and the observer go back to Default and the dots go; the players' own characters are still lit. Cancel the confirmation once: nothing changes.
9. Default survives a reload. Reload Foundry, delegate again, press Reset. Expected: it returns to the arrangement saved before the reload.
10. A new character. Create a new player character after saving the default, give someone Owner on it, press Reset. Expected: that character is left as it is (it was never saved). Press Set as Default again and it joins the remembered arrangement.
