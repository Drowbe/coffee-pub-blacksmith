# Plan: the interruptible rest

**Status: Planned.** Nothing here is implemented. Written 2026-08-21 so the design questions are settled
before code, per the workflow's step 3. Distribute it and delete it when it ships -- surface to
`../api/api-worldclock.md`, mechanism to `../architecture/architecture-rest.md`, history to `CHANGELOG.md`.

## What it is

A long rest the clock drives. The GM starts it, world time advances across the rest's duration rather than
jumping, and the GM can interrupt partway -- rolling for encounters, having something happen at hour three,
then resuming or abandoning.

Nothing else in the ecosystem does this, which is the reason it is worth building rather than faking.

## The constraint that shapes everything

**An interrupted rest is not a rest.** The system's recovery must run only if the rest *completes*.

That single rule rules out the obvious implementation. Today the order is: dnd5e applies recovery, then
Blacksmith advances the clock once the burst settles (`manager-rest.js:_queueAdvance` / `_completeRest`,
`game.time.advance` at `:1160`). "Call `longRest()` and then advance gradually" would hand back hit dice
and spell slots to a party that gets ambushed at hour two.

So the order inverts: **advance first, recover last.** Time passes; only when the full duration has elapsed
does the rest resolve into dnd5e's recovery. Everything below follows from that.

## What already exists, and must not be rebuilt

- **The card that can show a rest in progress.** The rest card updates in place and holds its own state
  across two phases, in message flags rather than in memory -- that is what lets a foraging roll minutes
  later re-render it. A card showing "hour 3 of 8" with an Interrupt button is the same mechanism with a
  third phase. See `architecture-rest.md`, "The card carries its own state".
- **Lifecycle with interruption**, three times over: `timer-round.js`, `timer-planning.js`,
  `timer-combat.js`. A rest timer is that shape over *world* time instead of wall time.
- **Grouping.** `_applyRest` already knows a rest is grouped when it has an id, and the window stamps
  `restId` on every card it posts. A driven rest is one group by construction.
- **The schedule API.** `worldClock.schedule` fires on crossings, so a dawn or a dated event lands
  correctly during a gradual advance without the rest knowing anything about it.

**What is missing is the primitive, not the surface: advance world time gradually, and let it be
interrupted.**

## The primitive

**Half of this shipped on 2026-08-21 with the time modes.** `TimeDriver` (`scripts/manager-time-modes.js`)
already advances world time in commits paced by real time, on a single GM elected through
`game.users.activeGM`, re-checking ownership every commit and carrying fractional seconds. Points 1 and 2
below are answered in code; read them as a record of why it is shaped that way.

**What is missing is the target and the interrupt.** The driver runs open-endedly at a rate. A rest needs
it to run *to* a total and stop, to report progress as it goes, and to be stoppable with a reason that the
caller can tell apart from completion.

A GM-owned driver that advances world time in commits until a target is reached, and can be stopped.

```
start(totalMinutes, { onCommit, onComplete, onInterrupt })
interrupt(reason)
```

Four things it must settle:

**1. Commit granularity, because writing time is expensive.** `game.time.advance` writes a world setting
and wakes every connected client -- `updateWorldTime` fires on all of them, and the darkness driver runs.
Advancing a minute of world time per real second would be thousands of writes per rest. The clock is
deliberately not on an interval (`architecture-worldclock.md`, "No interval"), and this must not
reintroduce one. Commit in coarse steps -- an in-world hour, or a fixed number of steps across the
duration -- and let any smoother display be computed locally between them.

**2. A single owner.** Only a GM can write, so only a GM may drive. Two GMs connected means two drivers
advancing one clock at double speed -- the same hazard already recorded in the "real time when out of
combat" TODO, and it wants the same answer. It must also stop cleanly when that owner disconnects, leaving
a rest that can be resumed rather than one that silently stalls.

**3. Interruption is a state, not an event.** The rest has to be resumable, so "interrupted at hour 3"
must survive a reload -- which means it lives in the card's flags, next to the state that is already there,
not in a manager's memory.

**4. It must not double-advance.** `_queueAdvance` exists because a burst of individual rests would
otherwise move the clock once per character. A driven rest already moved the clock itself, so the
completion path must pass through with `systemAdvanced`-equivalent semantics or bypass the queue entirely.
Getting this wrong reproduces the forty-hour bug, which has now happened twice on two different paths.

## Open questions, to answer before writing code

- **Does an interrupted rest resume, or restart?** The 2024 rules say a long rest interrupted by an hour
  or more of strenuous activity must be restarted. Modelling that faithfully means the driver tracks *why*
  it stopped and how long the interruption lasted; modelling it loosely means the GM decides. Loose is
  probably right -- the GM is sitting there -- but it should be a decision, not a default.
- **Short rests too, or long only?** A short rest is an hour and the interruption case is rarer. Starting
  with long rest only is defensible; the primitive should not assume it.
- **What does a player see?** The clock moves on their screen while they cannot act on the rest. Whether
  the card shows progress to players or only to the GM is a visibility decision with a settings cost.
- **Does the driver own encounter rolls, or does something else?** It should not. The driver advances
  time and fires crossings; a random-encounter feature registers a schedule and reacts. Anything else puts
  encounter content in the hub, which the ownership rules forbid.
- **What happens to provisions and foraging mid-rest?** They are resolved at completion today. An
  interrupted rest that never completes should not consume rations -- confirm that falls out of the
  inverted order rather than needing its own branch.

## Phases

1. **The primitive alone**, with no rest attached: a GM-owned driver that advances world time in commits
   to a target and can be interrupted, plus harness checks for owner election, commit count, and interrupt
   leaving the clock where it stopped.
2. **The rest drives on it**, long rest only, GM-initiated from the rest window. Recovery runs on
   completion, nothing runs on interruption.
3. **The card grows its third phase**: in-progress display, an Interrupt control, resume or abandon.
4. **Whatever consumes the crossings** -- encounters, weather, events -- lives outside this and outside
   Blacksmith. It is unblocked by the schedule API, not by this plan.

Phase 1 is worth shipping and verifying on its own. It is also the primitive the "real time when out of
combat" idea needs, so building it once serves both, and the second consumer is the test of whether the
shape is right.

## How it gets verified

There is no test framework beyond running Foundry, so each phase names its own check:

- **Phase 1:** start a 480-minute advance, watch the clock move in the expected number of commits, and
  interrupt partway -- the clock holds exactly where it stopped. With two GMs connected, exactly one
  drives. Harness checks cover the commit count and the election; the two-GM case needs a second client.
- **Phase 2:** a rest that completes hands back hit dice and slots; a rest interrupted at hour three hands
  back nothing, and the actor is untouched. Verified by inspecting the actor rather than the card.
- **Phase 3:** reload the browser mid-rest -- the card still shows hour three and still offers Interrupt,
  because the state is in the message flags.
