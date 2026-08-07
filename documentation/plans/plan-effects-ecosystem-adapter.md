# Plan: Effects ecosystem adapter (Times Up), asks 1 and 3

**Status: Planned** — unblocked; Bibliosoph answered both open questions 2026-08-07.

Bibliosoph asked the effects layer to adapt the effects ecosystem the way `utility-midi-resolution.js`
adapts Midi-QOL. The exchange is in `note-bibliosoph-effects-ecosystem.md` and the triage in
`TODO-GLOBAL.md`. Their three asks were unbundled: **1 and 3 are this plan; ask 2 (a GM-authoritative
expiry event) is a separate decision and is not in scope here.**

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

## Not in scope

- **Ask 2**, a GM-authoritative `effects.expired` event. It means owning a clock, deduping across clients,
  and interleaving with Times Up's own expiry, which deletes effects. It reverses a standing non-goal of
  the layer and is a new subsystem rather than an increment. Bibliosoph has confirmed they are **not
  blocked on it** — their own expiry works standalone now that their unit handling is fixed. The case for
  it is that every consumer will independently get the same thing wrong, which is a good argument and a
  separate decision.
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
