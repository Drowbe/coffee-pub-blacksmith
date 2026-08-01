# Combat Timers — Architecture

**Audience:** Contributors to the Blacksmith codebase, and modules drawing a Blacksmith timer.

Three timer modules track different things during an encounter and are drawn by more than one surface.
This describes what each measures, the contract every surface uses to draw one, and the traps in that
contract.

**Files:**

| File | Role |
|---|---|
| `scripts/timer-planning.js` | Planning timer — counts down at the top of a round |
| `scripts/timer-combat.js` | Turn timer — counts down per combatant turn |
| `scripts/timer-round.js` | Round and total combat duration — count up |
| `templates/timer-planning.hbs`, `timer-combat.hbs`, `timer-round.hbs` | Tracker markup |
| `styles/timer-planning.css`, `timer-combat.css` | Bar styling, including the shared band colours |

## Two kinds of timer

**Countdowns** have a configured limit, so they have a percentage and can be drawn as a bar. The planning
timer and the turn timer are countdowns.

**Elapsed counters** count up with no maximum. `RoundTimer.getCurrentRoundDuration()` and its total-combat
equivalent have no percentage and cannot be bars; they are text. `getCombatData` in
`manager-combatbar.js` computes `currentRoundDuration` and `totalCombatDuration` and passes both to the
combat bar template, which currently ignores them.

The turn timer's file and setting are named `combatTimer*`, but it measures a **turn**, not the combat.
Nothing measures the combat as a countdown.

## The display contract

`PlanningTimer.getDisplayState()` and `CombatTimer.getDisplayState()` each return:

```
{ percent, state: 'high' | 'medium' | 'low' | 'expired', text, isExpired }
```

This is the single source of truth for every surface drawing that timer — the tracker's render, the
tracker's per-tick DOM update, and the combat bar's readout. Both timers previously computed the same
thresholds and text in two or three places each; that is what these methods replaced.

Bands are identical across both timers: `expired` at zero or below, `low` at 25% or less, `medium` at 50%
or less, `high` above. **Colour is the timer's identity**, not its state — planning is a blue ramp, the
turn timer green through yellow to red. The values are custom properties declared beside the tracker's own
bar rules (`--blacksmith-planning-timer-*`, `--blacksmith-turn-timer-*`) so a second surface consumes them
rather than repeating hex codes.

**Text precedence differs between the two timers and that is deliberate.** The turn timer shows paused in
preference to expired; the planning timer shows expired in preference to paused. This is existing
behaviour, preserved rather than normalised.

Pause is a **text** state. Colour continues to track remaining time while paused; nothing desaturates.

## Visibility

Whether a timer should be on screen is a separate question from its display state, and each module owns it:

- `CombatTimer.shouldDisplay()` — combat started, round not zero, timer enabled, not GM-only-hidden, and
  every non-defeated combatant's initiative rolled.
- `PlanningTimer.verifyTimerConditions()` — enabled, combat started, **`game.combat.turn === 0`**, not
  expired, not GM-only-hidden, turns array built, and every non-defeated combatant's initiative rolled.

**`state.isActive` is not a visibility signal for either timer, despite the name.** For `CombatTimer` it is
assigned only in `resumeTimer`, so it is false for a timer that started normally and only becomes true
after a pause and resume — while `startTimer` nonetheless announces `isActive: true` in the
`combatTimerStateChange` payload it emits, so the hook and the state disagree. For `PlanningTimer` it is
set on start but stays true after the turn advances past zero, so it does not express "the planning phase
is running". Ask the module through the two methods above.

## Ticking

All three timers run `setInterval(..., 1000)` and update by writing into a cached set of DOM nodes, never
by re-rendering. Each keeps `{bars, texts, progress}`, refreshed when the cache is stale (any cached node
disconnected) or empty, and refreshed outright by the tracker render. This is deliberate: the menubar
fingerprint exists to avoid rebuilding on a cadence, and a per-second rebuild for the length of every
combat is exactly what it is there to prevent.

Any new surface must follow the same rule. `blacksmithTimerDisplay(itemId, display)` is fired on every tick
by both countdown timers for exactly this purpose — a subscriber writes to its own DOM. Re-render only on
transitions, which the timers announce separately.

## Hooks

| Hook | Fired by | Meaning |
|---|---|---|
| `blacksmithTimerDisplay` | both countdowns, per tick | draw this state; do not re-render |
| `combatTimerStateChange` | `CombatTimer` | start, pause, resume; carries `{isPaused, isActive, remaining}` |
| `planningTimerExpired` | `PlanningTimer` | planning has ended; the turn timer takes over |
| `endPlanningTimer` | `CombatTimer` | ask the planning timer to stop |
| `combatTimerCleanup` | `PlanningTimer` | teardown |

## Interaction

Left click toggles pause; right click sets the remaining time from the click position. Both are GM-only and
both are shared: `CombatTimer.handleTimerClick` / `handleRightClick` and `PlanningTimer._onTimerClick` /
`_onTimerRightClick`.

Both right-click handlers measure `event.currentTarget.getBoundingClientRect()`, so **they must be bound
directly to the bar element, never through a delegated listener** — delegation hands them the delegate root
and the click scrubs to a wrong time.

## Consumers

The combat tracker draws all three. The combat bar draws the two countdowns in one shared slot — see
**documentation/architecture/architecture-encounter.md**.
