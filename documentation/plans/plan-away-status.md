# Plan: Away, a player status that belongs to the table and not to the Stage Manager

**Status: Planned -- nothing built.** Opened 2026-10-27 from a conversation with the author. The Stage Manager
currently carries a per-player Away or Do Not Disturb mark in its own stored state (`stageState.statuses`); this plan
replaces it with a status the whole module owns.

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

## Proposed shape (for the author to confirm)

- **Storage: a flag on the player's own User document**, `flags.coffee-pub-blacksmith.away = { since, message }`,
  absent when they are back. A player can update their own user, and every client already receives user updates, so no
  socket and no GM are needed. A world setting would not work: a player cannot write one. The update goes through
  `updateUser`, which is also the single place the party toast and the indicator refresh are driven from.
- **Who sets it:** the player, from their own chip or a control (one click to go away, an optional message box), and the
  GM for any player from the Stage Manager chip, as the bell does today.
- **Indicator:** the Stage Manager chip, and Foundry's own players list. Not on tokens.
- **Away toast:** through the toast system to the connected party, naming the player and the message. The cross-client
  send is the open piece of the toast system (see `project-toast-system`), so this plan depends on it or on the Send
  Toast path that already exists.
- **Are you back:** while a player is away, a throttled listener for pointer, key and focus activity shows one prompt
  with Yes and Still away. Yes clears the flag. It must not fire on the activity of setting it, and Still away snoozes
  the prompt for a while.
- **API:** `api.away`: `get(userId)`, `isAway(userId)`, `set(userId, { message })`, `clear(userId)`, `list()`, and a
  `blacksmith.away.changed` hook. `set` and `clear` follow the same rule as the flag: a player for themselves, a GM for
  anyone. Documented in `documentation/api/api-away.md` when built.

## Phases

1. **The status.** The flag, set and clear for self and GM, the indicator, the party toast, the message, `api.away`,
   and the Stage Manager moved onto it (its bell and `stageState.statuses` removed, and a stored Away or Do Not
   Disturb mark migrated or dropped, see Open questions, 3).
2. **Are you back.** Activity detection and the prompt.
3. **Consumers.** Request-a-roll toasts the GM when it targets an away player. Any other place Blacksmith waits on a
   player is checked and moved to the same call.
4. **Detection.** Idle or visibility detection, or an external source, calling `api.away.set`. Needs a design of
   what counts as away, and a setting for it to be opt-in per player.

## Open questions, in the order they block the work

1. **Who may set it for a player?** The plan says the player and any GM. Confirm a GM clearing a player's Away is
   wanted, or whether only the player may clear their own.
2. **Does Away change what the Stage Manager does?** Do Not Disturb stopped drags, Return Everyone, the chat button
   and the load-time move. Away as described is a mark and a message. Recommendation: drop those behaviors, since a
   player who stepped away is simply not there when moved and sees where they are on return. Confirm.
3. **The existing marks.** Nothing has shipped, so any stored `statuses` can be dropped with no migration.
   Confirm there is nothing in a live world to carry over.
4. **Where does the player set it?** Their own chip is only visible in the GM's Stage Manager. A player needs a control
   of their own: the menubar, the players list, or a chat command. Pick one before phase 1.
5. **Does the toast go to the whole party or only to the GM?** The author's wording is the party.
