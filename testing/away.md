# Testing: Away

**Audience:** us.

Scope: the Away status and its menubar icon (`scripts/manager-away.js`). The stored shape and who may write it are covered by the Away suite in the test harness; everything here needs a GM client and at least one player client on a second browser or profile. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

1. The icon. As a player, find the new icon in the left zone of the menubar, beside the Stage Manager (as the GM it sits right after it). Expected: a plain check-person icon; hovering says you are available and to click for the party.
2. The party list. Click it with two people connected. Expected: a menu listing each connected person with Available or Away under their name, yours marked "(you)", then Available, Away and Away with a message. Clicking elsewhere or pressing Escape closes it.
3. Go away. Choose Away. Expected: your icon becomes a clock in the brand orange, hover says you are away, and everyone connected, the GM included, gets an "is away" toast; you get "You are away".
4. A message. Choose Away with a message, type "back in ten" and confirm. Expected: the same, with the message under the toast title and in the hover text. Cancel the dialog instead: nothing changes.
5. Replace the message. While away, choose Away with a message again with different text. Expected: the toast comes again with the new text, replacing the old one on screen.
6. Back. Choose Available. Expected: the icon returns to normal, no toast, and the menu shows you Available.
7. Survives a reload. Go away, reload. Expected: the icon is still the orange clock.
8. The GM marks a player. In the Stage Manager press the clock on a player's chip. Expected: the chip is outlined in the brand orange, the player's own menubar icon becomes the clock, and everyone gets the toast. Press it again: the chip returns to normal and the player's icon returns to normal. As the GM mark yourself and another GM too.
9. A player cannot mark another. From a player's console, `game.modules.get('coffee-pub-blacksmith').api.away.set(<another user id>)`. Expected: it rejects with "you can only change your own status".
10. Another module hears it. In a console, `Hooks.on('blacksmith.away.changed', console.log)`, then change a status. Expected: one line per change on every client.
11. Tooltips. Hover the Stage Manager icon in the menubar. Expected: its hover text now shows ("Stage Manager: who is on which scene"); it had none before.
