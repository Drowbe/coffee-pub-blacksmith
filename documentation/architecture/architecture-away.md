# Away Architecture

**Audience:** Contributors to the Blacksmith codebase. The public calls are in `documentation/api/api-away.md`.

Away means a player has stepped away from the table in real life. It is a status of the person, so it belongs to the module and not to any window: the Stage Manager shows it, the menubar sets it, and other modules read it through `api.away`. It is a mark and an optional message. It never stops a move, a toast or a roll; a consumer that needs a person's input reads the status and decides what to do about an absent one.

## Storage

One flag on the person's own User document: `flags.coffee-pub-blacksmith.away = { since, message }`, absent when they are back. A player can update their own user, and every client already receives user updates, so setting it needs no socket and no GM connected. A world setting could not do this, because a player cannot write one.

`AwayManager.set` stores `since` (the time it was set) and a trimmed message capped at 200 characters; setting again replaces the message. `clear` unsets the flag and returns whether anything was cleared. A person may change their own status and a GM may change anyone's; anything else throws. `get` always returns the full shape or null, whatever is stored.

## What reacts

Each client reacts on its own, from `updateUser` (registered through `HookManager`, context `away`), when the change touches the `away` key or its unset form. That is why nothing needs a socket:

- **The menubar icon.** `AwayManager.registerMenubarTool` adds an icon-only tool in the left zone beside the Stage Manager (order 211, every user). Its icon is a function, so a rebuild picks up the person's own current status: a check when available, a clock when away, in the brand orange while away (`updateMenubarToolIconColor`, which also rebuilds). It only reacts to the running user's own change.
- **The toast.** Every client that sees a user go away, the GM included, shows "{name} is away" with the message as its subtitle (the person themselves sees "You are away"). It is local to each client, stacked by user, so a second change replaces the first. Coming back is not toasted; the indicators show it.
- **The Stage Manager.** `stages()` puts `away` on each person and the window re-renders on `updateUser`. See `architecture-stage-manager.md`.
- **Other modules.** `Hooks.callAll('blacksmith.away.changed', { userId, away, message, since })`, on every client.

## The menu

Clicking the icon opens `UIContextMenu` (not `showMenubarContextMenu`, which drops information rows) at the icon. It lists every connected person as an information row, their status as the description, then three actions for the running person: Available, Away, and Away with a message. The last opens a `DialogV2.prompt` with one text field. A failed action is shown as a warning and does not throw into the menu.

## The menubar tooltip

The tool registers a `tooltip` function because its `title` is null: the menubar renders a title as visible label text. `registerMenubarTool` used to drop `tooltip` when it normalised the tool, so no icon-only tool had hover text; it now copies it through.

## Not built

The "Are you back?" prompt on activity, request-a-roll's use of the status, detection, an indicator in Foundry's own players list, and an announcement when someone comes back. See `documentation/plans/plan-away-status.md`.
