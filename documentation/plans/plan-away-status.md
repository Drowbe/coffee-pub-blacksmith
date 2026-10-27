# Plan: Away, a player status that belongs to the table and not to the Stage Manager

**Status: In progress -- phase 1 built, not yet seen in a running world.** Opened 2026-10-27 from a conversation with
the author. Phase 1 is `scripts/manager-away.js`; it replaced the Stage Manager's own Away and Do Not Disturb marks.

**On completion:** the system goes to `documentation/architecture/architecture-away.md`, the public calls to
`documentation/api/api-away.md`, the work items become `TODO.md` entries, shipped history goes to `CHANGELOG.md`, and
this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## The idea

"Away" means a player has stepped away from the table in real life. It is a fact about a person, so it is not tied to
scenes, and it is not Do Not Disturb. Do Not Disturb is retired as a name and as a behavior (see Open questions, 2).

What it is for:

- A visible indicator that the player has stepped away.
- When a player sets it, the party is toasted that they are away.
- Activity in the Foundry client prompts them: "Are you back?"
- An optional custom away message.
- An API, so other modules and a future detector can set and read it, and so a request that needs a player's input
  can notice they are away. Example: a party roll request reaches an away player, and the GM is toasted that the GM
  needs to roll for them. Blacksmith's own request-a-roll is the first consumer.
- A later phase can detect away on its own, or accept it through the API.

## Decided 2026-10-27

- **Away only, no Do Not Disturb.** It is a mark and a message. It changes nothing the Stage Manager does.
- **Storage** is a flag on the person's own User document, `flags.coffee-pub-blacksmith.away = { since, message }`.
- **Who sets it:** the person, and a GM for anyone, both able to clear it.
- **Where a player sets it:** a menubar icon, left zone, icon only, beside the Stage Manager. The icon reflects their own
  current status. Clicking it shows the connected party and where each stands as information, and lets them click
  Available, Away, or Away with a message.
- **The toast** goes to everyone present, the GM included, through each client's own `updateUser`, so it needs no socket.
- **Old marks:** dropped, nothing shipped.

## Phases

1. **The status. Built.** The flag, the menubar icon and menu, the toast, the message, `api.away`, the `blacksmith.away.changed`
   hook, and the Stage Manager moved onto it. Not yet seen in a running world.
2. **Are you back.** While a player is away, a throttled listener for pointer, key and focus activity shows one prompt
   with Yes and Still away. Yes clears the flag. It must not fire on the activity of setting it, and Still away
   snoozes the prompt for a while.
3. **Consumers.** Request-a-roll toasts the GM when it targets an away player, so the GM can roll for them. Any other place
   Blacksmith waits on a player is checked and moved to the same call.
4. **Detection.** Idle or visibility detection, or an external source, calling `api.away.set`. Needs a design of what
   counts as away, and a setting for it to be opt-in per player.

## Not built yet, and why

- **An indicator in Foundry's own players list.** The plan listed it. The menubar menu and the Stage Manager chip are the
  indicators in phase 1; the players list needs markup injection into a core application and is left for later.
- **A "back" announcement.** Going away is toasted; coming back is shown by the indicators and not announced.
