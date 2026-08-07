# Plan: Effects ecosystem adapter (Times Up)

**Status: Planned** — unblocked; Bibliosoph answered both open questions 2026-08-07.

Bibliosoph asked the effects layer to adapt the effects ecosystem the way `utility-midi-resolution.js`
adapts Midi-QOL. The triage and the settled rules are in `TODO-GLOBAL.md`,
`architecture/architecture-ownership.md` and `architecture/architecture-effects.md`. Their three asks
were unbundled and then all three folded back in: 1 and 3 were taken first, and **ask 2 was promoted into
scope on 2026-08-07** once it was demonstrated that no correct consumer can exist without it.
## What the substrate actually does

Two independent sources produce rounds-based durations, and a fix scoped to either one alone is wrong.

- **dnd5e** — `DurationData.getEffectDuration()` maps a source item's own units at creation: `round`/`turn`
  produce `{rounds}`/`{turns}`, `minute`/`hour`/`day` produce `{seconds}`. The sheet's Temporary section
  also defaults `duration.rounds` to 1. Happens in worlds with no Times Up at all.
- **Times Up** — `setDurationRounds` (`module/handleUpdates.js:15`) rewrites any effect whose remaining
  seconds fall under *Max rounds to convert* x `CONFIG.time.roundTime` into a rounds duration: sets
  `duration.rounds`/`turns`, stamps `startRound`/`startTurn`, **nulls `duration.seconds`**, and stashes the
  original in `flags.times-up.durationSeconds`. `setDurationSeconds` reverses it.

**`duration.remaining` is reported in the unit the document carries** — seconds for a seconds duration, a
decimal count of rounds for a turns duration. Assuming seconds everywhere is the specific error that cost
Bibliosoph two shipped bugs; a consumer-facing field has to state its unit or it will cost the next
consumer the same.

### Reference world (Bibliosoph's verification target)

| Times Up setting | Value |
|---|---|
| Max rounds to convert | 10, i.e. a 60s threshold at `roundTime` 6 |
| Expire rounds/turns duration effects on combat end | enabled |
| Enable Times Up | enabled |
| Set start for transfer effects | enabled |
| Update passive effects | enabled |

*Expire on combat end* is the one that changes semantics rather than presentation: converted effects are
deleted when combat ends, so an under-threshold effect whose owner intended it to linger is binned
instead. Observed, not inferred. It matters for ask 2 and not for this plan, but it is the reason ask 2
cannot be inferred from ask 1.

## Ask 1 — a normalized `remaining` on the display DTO

Consumers must never branch on seconds-versus-rounds. Requirements:

- Expose a **value and its unit**, not a seconds-normalized number. Rounds do not track wall-clock time,
  so reporting them in seconds would state a remainder that is not true. Bibliosoph confirmed this is the
  shape they need and better than the seconds-normalized number they originally asked for.
- **A number to compare, not a string to display.** Bibliosoph renders its own wording and does not read
  `durationLabel`; the existing label stays as-is for consumers that do want a string.
- Where Times Up has converted an effect, report from `flags.times-up.durationSeconds` so the value is
  stable across the conversion. **This is the hub reading a third-party flag, which is exactly what the
  adapter is for** — see the ownership rule below.

## Ask 3 — `enableTimesUpIntegration`, mirroring `enableMidiIntegration`

A runtime setting check on every lane that touches duration, with the baseline supplied when Times Up is
absent or the integration is switched off. Same shape as `utility-midi-resolution.js`: no consumer learns
which path ran.

## The rule this rests on

`architecture/architecture-ownership.md`: **Blacksmith absorbs third-party variance; satellites never
branch on it.** Bibliosoph originally wrote that *no* Coffee Pub module should read Times Up's flags and
has since conceded the point — a satellite must not, the hub must. Without that rule this plan would be
prohibited by the thing it is trying to fix.

## Ask 2 — IN SCOPE. Promoted 2026-08-07.

Ask 2 is a GM-authoritative `effects.expired` event. It means owning the expiry decision, deduping across
clients, and interleaving with Times Up's own expiry, which deletes effects. It reverses a standing
non-goal and is a new subsystem rather than an increment, which is why it was held back until the case for
it was proven rather than argued. It now is; see below.

**What changed:** with Bibliosoph's unit handling fixed, Bibliosoph and Times Up now both correctly detect
that a converted effect has expired, and **both delete it** — one throws an unhandled rejection every time.
Before the fix there was no race only because Bibliosoph had silently stopped claiming those effects, so
the absence of a race was itself the bug.

**This is the part that makes it ours.** Under the ownership rule
(`architecture/architecture-ownership.md`) a satellite has no legal move:

| Option | Outcome |
|---|---|
| Always delete on expiry | Races Times Up wherever it is installed |
| Never delete on expiry | Effects linger forever in worlds without Times Up, since core does not expire them |
| Check whether Times Up is installed and defer | **Forbidden** — that is a satellite branching on a third-party module |

The first two are wrong and the third is barred by the rule we just agreed with them. That is a stronger
argument than the original one ("every consumer reimplements `hasExpired()`"): it is not that consumers
*will* get it wrong, it is that a correct consumer *cannot exist*. Arbitration has to sit in the adapter
because the adapter is the only layer permitted to know Times Up is there.

### The mitigation does not work, which closes the argument (verified 2026-08-07)

Blacksmith advised Bibliosoph to guard the delete and catch the rejection. **That stops the unhandled
rejection and not the error banner**, so it is not a fix.

Foundry notifies from the socket ACK before the caller ever sees the rejection.
`client/helpers/socket-interface.mjs`:

```js
if ( response.error ) {
  const err = SocketInterface.#handleError(response.error);  // calls ui.notifications.error(...)
  reject(err);                                               // only now can a caller catch
}
```

`#handleError` is documented in core as "displaying it on screen and in the console" and calls
`ui.notifications.error(error.message)` unconditionally. It runs *inside* the promise executor, before
`reject`, so a `.catch()` is strictly too late. There is no caller-side way to suppress it.

A pre-flight existence check does not close it either — that is time-of-check to time-of-use. The window
narrows; it does not shut, because the other actor can delete between the check and the call.

**So the trilemma survives its own mitigation.** The only move left is to not attempt the delete, which
requires knowing another module already will, which is the forbidden branch. "A correct consumer cannot
exist" is now demonstrated rather than argued, and there is no third option to find.

**Design consequence to weigh before taking it.** The clean contract is that **consumers never delete on
expiry** — Blacksmith either yields deletion to Times Up or performs it, and fires the same event either
way. That gives the layer exactly one CRUD operation, which is a real cost against its "no CRUD" non-goal
and should be stated rather than slipped in. The alternative, firing the event and letting the owner
delete, reintroduces the race the moment Times Up is installed.

Bibliosoph is **not blocked** — their own expiry works standalone. Guarding the delete is still worth
doing on its own merits, because a GM can remove an effect by hand mid-operation and an unhandled
rejection is a robustness bug regardless. It is simply not a fix for this: see above.

## Also not in scope
- Letting a classifier set `durationLabel`. Declined and settled: it would let a module assert duration
  semantics the substrate can silently contradict.

## Verification

No test framework, so this is live-world work. In a world with Times Up enabled at the reference settings:
apply an effect with a duration above the 60s threshold and one below it, confirm the normalized value and
unit are consistent across the conversion boundary in both directions, and confirm the reported value does
not jump when combat starts or ends. Repeat with Times Up disabled to confirm the baseline lane. Then
repeat with an effect authored in rounds by a dnd5e item, which never passes through Times Up at all.

## Dismantling

On completion: the substrate behaviour and the adapter mechanism into `architecture-effects.md`, the new
DTO field and the setting into `api-effects.md`, the entry into `CHANGELOG.md`, the TODO-GLOBAL section
trimmed to whatever remains open, and this file deleted.
