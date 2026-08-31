# Active Effects Architecture

**Audience:** contributors to the Blacksmith codebase.

The Active Effects subsystem is a small shared normalization layer, not an effect engine. Its purpose is to stop Blacksmith, Crier, Bibliosoph, and future Coffee Pub modules from independently filtering and formatting the same Foundry Active Effect documents.

## Components

| Component | Responsibility |
|---|---|
| `scripts/api-effects.js` | Filtering, dnd5e condition labels, duration and description normalization, Times Up adaptation, expiry arbitration, classifier registry, change and expiry events |
| `scripts/manager-combatbar.js` | Blacksmith's hover-card presentation and live refresh |
| `styles/menubar-combatbar.css` | Compact effect rows in the hover card |
| `documentation/api/api-effects.md` | Consumer contract |

## Flow

1. A consumer supplies an Actor to `effects.getDisplayEffects(actor)`.
2. The API preserves Actor effect order while removing disabled, suppressed, and non-display effects.
3. Registered classifiers get a chance to identify module-owned effects.
4. The API resolves dnd5e condition labels, duration, attribution, and permission-safe description HTML.
5. The consumer renders the returned DTO without reading module-specific flags itself.

Foundry's Active Effect create/update/delete hooks call `EffectsAPI.emitChanged`. Blacksmith refreshes an already-visible combat hover card and consumers may subscribe through `effects.onChanged`.

The combat portrait context menu can turn that transient view into a persistent card. Persistent cards reuse the same data builder and markup, remain client-local, preserve their position during refreshes, and update on Actor, Combatant, Active Effect, and display-setting changes. Their per-card Follow Combat toggle changes the record's combatant identity on turn changes and rerenders in place; disabling it leaves the card pinned to the combatant currently shown. They contain no effect mutations and therefore do not expand the API's ownership boundary.


## Duration is rewritten, not passed through

`durationLabel` is the one field the layer does not simply relay, and the reason is that Foundry's own
label for a seconds-based duration is raw seconds: a half-hour wound arrives as `1710 Seconds`.
`formatDuration` in `api-effects.js` converts the seconds branch to the unit a person would say and
leaves round- and turn-based durations on Foundry's label, which already reads well.

Two consequences a reader should know before relying on the field:

**The same effect can read differently in and out of combat.** Below `ROUNDS_READ_BETTER_BELOW`
(120 seconds) the seconds branch reports rounds instead, but only while a combat is started, because a
remainder in rounds is only meaningful when rounds are being counted. Outside combat the same effect
reports seconds.

**Seconds and rounds are different measurements, not two spellings of one.** A seconds duration is
wall-clock and only decreases as `game.time.worldTime` advances; a rounds duration advances with the
combat tracker. Which one an effect carries is decided by whoever created it — in dnd5e,
`DurationData.getEffectDuration()` maps an item's own units, so `round`/`turn` units produce
`duration.rounds`/`turns` and `minute`/`hour`/`day` produce `duration.seconds`. The layer therefore
branches rather than unifying them: presenting a rounds duration as seconds would state a wall-clock
remainder for something that does not track wall-clock time.

**A third-party module can change which branch an effect takes, mid-life.** Times Up's
`setDurationRounds` (`module/handleUpdates.js`) rewrites any effect whose remaining seconds fall below
its *Max rounds to convert* threshold (default 10 rounds x `CONFIG.time.roundTime`) into a rounds-based
duration: it sets `duration.rounds`/`turns`, stamps `startRound`/`startTurn`, **nulls `duration.seconds`**,
and stashes the original in `flags.times-up.durationSeconds`. `setDurationSeconds` reverses it. So an
effect authored in seconds renders as minutes without Times Up and as `N Rounds, M Turns` with it — the
document changed underneath, and this layer faithfully reports what it now says.

That is worth stating plainly because it is the layer's one uncomfortable truth: **it normalizes format,
not substrate.** Two worlds with identical authored data can display differently, and no consumer can see
why. Adapting to the effects ecosystem the way `utility-midi-resolution.js` adapts to Midi-QOL is the
shape that would close it; it is not built.

**`remaining` is only as live as the world clock.** Core computes it as
`seconds - (worldTime - startTime)`, so in a world whose `worldTime` never advances the value equals
the authored total forever. The label is accurate and simply never moves; nothing in this layer ticks
it, which is why duration ticking is listed under Non-goals.

## Classifier boundary

Blacksmith owns only generic Foundry and dnd5e interpretation. A classifier owned by another module translates that module's flags into display metadata. It does not mutate the effect or implement gameplay.

The built-in Bibliosoph classifier is deliberately low priority and compatibility-only. It understands the established `outcomeBurst` flag sufficiently to prevent regressions while Bibliosoph adopts the registry. An authoritative Bibliosoph classifier should use a higher priority or explicitly replace the compatibility classifier.

## Permissions

Effect names and statuses are returned by the normalization API, but descriptions default to permission-aware behavior: only GMs and Actor owners receive enriched description HTML. Blacksmith additionally suppresses the entire effect section on its limited NPC hover-card view. Consumers remain responsible for applying an equally strict visibility policy to their own UI.

## Expiry arbitration

Foundry core does not expire effects. Times Up does, and it is optional. That left every consuming module
with three moves and no correct one:

| A satellite could | Result |
|---|---|
| Always delete on expiry | Races Times Up wherever it is installed |
| Never delete on expiry | Effects linger forever in worlds without it |
| Check whether Times Up is installed and defer | Forbidden — a satellite branching on a third-party module |

**The loser of that race cannot even fail quietly.** Foundry notifies from inside the socket response
handler — `SocketInterface.#handleError` calls `ui.notifications.error` *before* `reject`
(`client/helpers/socket-interface.mjs`) — so a caller's `catch` is strictly too late, and a pre-flight
existence check only narrows the window rather than closing it. Arbitration therefore has to live in the
one layer permitted to know Times Up is there, which is this one.

`sweepExpired` runs on the GM only, on `updateWorldTime` and on combat turn/round changes, because seconds
durations and rounds durations advance on different clocks and neither implies the other. The GM check
cannot sit at hook registration: `initialize()` runs at `init`, before `game.user` exists, so gating there
evaluates undefined on every client and registers nothing anywhere.

Two separations are load-bearing:

- **`blacksmith.effects.expired` means the clock ran out, not that the document is gone.** Removal is
  carried by Foundry's own `deleteActiveEffect`, which fires whoever deleted. Keeping them apart is what
  lets the layer yield deletion to Times Up without the event's meaning changing.
- **Consumers must not delete on expiry.** Exactly one actor deletes in every configuration: Times Up when
  it is present and the integration is on, this layer otherwise.

Announced effects are remembered per session so the event fires once rather than on every subsequent tick;
the record is dropped when the effect is deleted, so a re-applied effect can expire again.

## Non-goals

These are non-goals **of this layer**, not of Blacksmith. Several are owned elsewhere in the module, and
the list says where, so it does not read as a blanket position the codebase contradicts.

The rule that governs which of them are defensible is in
[architecture-ownership.md](architecture-ownership.md): Blacksmith absorbs third-party variance so
satellites never branch on it, and a non-goal is a decision rather than a default — declining to adapt
does not remove the variance, it moves it onto every consumer, unowned.

| Not done here | Why, and where it lives if it lives anywhere |
|---|---|
| Active Effect CRUD | Belongs to whoever owns the effect — **with one exception**: this layer deletes an effect whose clock it owns, because arbitration is meaningless without it. It creates and updates nothing. |
| Roll automation | `api-rolls.js`. |
| Midi-QOL or DAE interpretation | Not in *this* layer. Blacksmith does interpret Midi-QOL — `utility-midi-resolution.js`, gated on `enableMidiIntegration` — but only for rolls. |
| Socket synchronization | Not in *this* layer; the change event is local and the expiry event is GM-side. Blacksmith has `manager-sockets.js`, and this layer deliberately does not use it: every client derives the same display from Actor data it already has, and removal already broadcasts as `deleteActiveEffect`. |
| Module-specific injury, critical, or fumble rules | Belongs to the owning module, via a registered classifier. Policy on an expired effect — heal it, leave it to be treated — is the owner's; detecting that the clock ran out is not. |

**"Duration ticking or expiry" was on this list until 2026-08-07** and is deliberately no longer. It was
removed because a non-goal is a decision: declining it did not remove the problem, it pushed an unsolvable
one onto every consumer. The layer is now authoritative about exactly one thing, expiry, and about nothing
else.