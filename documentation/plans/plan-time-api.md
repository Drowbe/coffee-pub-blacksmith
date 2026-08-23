# Plan: one time surface, exposed

**Status: Planned.** Nothing built. Opened 2026-08-23.

Delete this file when it is implemented, distributing surface to `api/`, mechanism to `architecture/`,
history to `CHANGELOG.md`, and remaining work to `TODO.md`.

## The problem, counted

Five table-facing wall-clock timers, each with its own tick, its own persistence, its own sync, and its own
idea of what pausing means:

| | Ticks | Deadline lives in | Synced how |
|---|---|---|---|
| Planning (`timer-planning.js`) | 1s | combat-scoped state | `SocketManager` |
| Combat (`timer-combat.js`) | 1s, from three separate `setInterval` sites | combat-scoped state | sockets |
| Round (`timer-round.js`) | interval | `roundTimer` combat flag | flag |
| Session (`api-menubar.js`) | 1s display, plus a second re-sync interval | `sessionStartTime` / `sessionEndTime` world settings | sockets |
| Note reminders, real clock (`manager-note-reminders.js`) | 15s poll | note flags | not needed |

Separately, `manager-time-modes.js` produces world time and the world clock and in-world reminders consume
it. Infrastructure pollers (latency, socket fallback, active-page) are not in scope: they poll for a
condition rather than counting toward a moment.

**The output is already shared and the mechanics are not.** `timer-notifications.js` routes notifications
for combat, planning and the menubar. But `hasHandledWarning` and `hasHandledExpiration` are implemented
independently in `timer-planning.js` and `api-menubar.js` -- two hand-rolled answers to "fire this once,
not on every tick", which is fine until one is fixed and the other is not.

## What this is for: consumers, not tidiness

**The reason to build it is that sibling modules need time-bound events and will otherwise each grow their
own.** That is the whole point, and it changes the shape: this is a public surface on the hub from the
first commit, not an internal refactor that might get exposed later. Blacksmith's own five timers are the
first consumers and the proof the surface is right, not the reason for it.

An internal helper that four files share is worth little. A published contract that stops ten modules
writing eleven countdown implementations is worth the work.

## Three surfaces, not one

The instinct to unify is right about the mechanics and wrong about the clocks. Keep these separate:

| Surface | Answers | Clock |
|---|---|---|
| `blacksmith.countdown` | "show a thing counting down, and tell me at zero" | wall |
| `blacksmith.schedule` | "run this at a real moment" | wall |
| `blacksmith.session` | "when did this session start, when does it end" | wall |
| `blacksmith.worldClock.schedule` -- **exists** | "run this when the world reaches a moment" | world |

**World time and wall time must not be merged behind one call.** World time is server-authoritative, moves
in jumps, and runs backwards routinely when a GM rewinds; wall time does neither. `architecture-notes.md`
already documents why note reminders carry two separate clocks rather than one with a mode flag, and
`architecture-calendar.md` documents the same split for events. A single `schedule({at})` that meant either
would be the third place to make that mistake.

### `blacksmith.countdown` -- the primitive

What repeats across all five existing timers, and therefore what this owns:

- a tick, at a declared cadence, with one shared interval rather than one per countdown
- pause and resume, with a single answer to what pausing the game does
- a deadline that survives a reload
- cross-client agreement on that deadline
- a warning threshold that fires **once**
- an expiry that fires **once**

Open questions to settle before writing it:

1. **Does the consumer own the DOM?** The five existing timers each draw their own bar. The primitive
   should emit ticks and let the consumer draw, or it becomes a widget library. Leaning: emit only.
2. **Where does a consumer's deadline persist?** A world setting per consumer does not scale. Likely one
   Blacksmith-owned store keyed by module and countdown id, which also gives a way to list what is running.
3. **What does pause mean when the game pauses?** Declared per countdown, because a combat timer and a
   session timer want opposite answers.

### `blacksmith.schedule` -- the wall-clock counterpart

Deliberately the same shape as `worldClock.schedule` so the two read as siblings: an id, a moment, a
description, a callback, and a scope. Two things it must state plainly, both of which the world version
already had to:

- **Who fires.** Wall clock is per-client, so a callback registered on five clients runs five times unless
  the registration says otherwise. `worldClock.schedule` solved this with `gmOnly`; this needs the same,
  plus "the author only" for the note-reminder case.
- **In-memory or persisted.** `worldClock.schedule` is in-memory and nothing fires retroactively, and that
  is documented as a limit. The same limit is worse here, because a real moment passes whether or not
  anyone is playing. Note reminders exist as a persisted index precisely because of this. Either this
  surface persists, or it documents the limit as loudly as the world one does and points at what to use
  instead.

### `blacksmith.session` -- the real-world clock we already have

`sessionStartTime` and `sessionEndTime` are already synced world settings driven by the menubar timer.
That means the module already has a real-world clock, and it is not exposed.

Exposing it gives, with almost no new mechanism:

- `blacksmith.session.start` / `.end` / `.remaining`
- events: session started, session ending (threshold), session ended
- **"fires at session start"**, which the calendar plan wanted for real-world reminders and which is not a
  scheduled time at all -- it is a hook on this.

## What this does to the real-world calendar

`plan-calendar-window.md` proposes a real-world calendar mode as a second store with its own scheduling.
**It should be this surface's planning view instead.** "Next session is Tuesday at 7" is `sessionEndTime`'s
scheduled counterpart -- the same shape, in the future -- so most of the persistence and sync it needs
already exists. That makes Tier 2 of the real-world work cheaper than estimated on 2026-08-23, and it
removes the "two stores" question that plan was worried about.

The Google Calendar half is unaffected and remains the expensive, different-in-kind piece. An `.ics` export
is a fraction of the work and needs no authentication.

## Order, and the risk

**Do not big-bang this.** The combat timers are the most battle-tested code in the module and the least
worth destabilising for tidiness.

1. Build `blacksmith.countdown` and `blacksmith.session`, used by nothing.
2. Move **note reminders' real clock** onto it first. It is days old, has no users, and its 15-second poll
   is exactly what the shared tick replaces.
3. Move the **round timer** next: the simplest of the four and the least load-bearing.
4. Publish the API docs and tell the siblings. Consumers before further migration -- the surface is proven
   by an outside caller, not by our own code shaped to fit it.
5. Session timer, then planning, then combat. Each on its own, each verified live.

A step is finished when the old interval is **deleted**, not left beside the new one. Two timers driving
one bar is worse than either.

## What would say this was a mistake

- The primitive grows a `worldTime: true` option. That is the merge this plan exists to prevent.
- A consumer needs to know which of the three surfaces to use and cannot tell from the names.
- Migrating the combat timer needs the primitive to grow options only the combat timer wants.
