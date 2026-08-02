# Plan: Decompose the Stats Tracker

**Status: Phases 1-3 implemented and verified live. Phase 4 not started.**

Result: `stats-combat.js` went from 5,264 lines to 2,849, with 872 in `stats-cards.js`, 1,034 in
`stats-sources.js`, and 634 in `stats-mvp.js`.

Verified 2026-08-02 against a live world: the harness Stats suite at 60/60 idle and, with a combat running,
`running-shape` 23/23 and `running-mirror` 9/9; a multi-round combat with midi-qol active recording hits,
damage and crits across three attackers including an NPC; MVP scoring and description generation completing;
every card in both families posting with data; and a second pass with a player connected, exercising
`_forwardToGM` and the `_onSocket*` receivers -- the distributed path, and the one a GM-only test cannot
reach.

## What static checking caught, and what it did not

Kept because it decides how phase 4 should be verified.

Both defects that reached the working tree were **missing lowercase imports**: `assetLookup` in
`stats-mvp.js`, which threw inside `_calculateMVP` on every round end and took the round cards down with it,
and `getActorPortrait` in `stats-cards.js`, latent and not yet triggered. `node --check` cannot see either;
an unresolved-identifier scan that only matched capitalised names could not either, because module helpers
and imported functions are overwhelmingly lowercase.

The check that would have caught both, and the one to run **first** on phase 4: take every module-scope name
the original file had -- its imports and top-level declarations, 23 of them here -- and confirm each one
referenced in a new file is imported or declared there. That population is exactly what an extraction
strands.

`stats-combat.js` is 5,249 lines and 94 static methods in one class, doing at least seven jobs. This breaks
it into files that each do one, without changing behaviour and without moving the public API.

## Why now, and why not sooner

The argument for waiting was always that a refactor without a safety net is a rewrite with extra steps.
That changed: `utilities/tests/suite-stats.js` now carries 90+ assertions over `stats.player`,
`stats.party`, and `stats.combat`, and they assert **invariants between code paths** rather than sample
values -- party-only totals, MVP ordering, shape parity between the running combat and the stored summary,
mirror-versus-memory agreement. Those are exactly the assertions a move-only refactor needs, because the
failure mode of moving code is two paths quietly disagreeing.

The argument against waiting longer is that the file is still growing. The encounter bar work added to it,
and the next feature will too.

## What is not the problem, and must not move

**The public API surface is fine.** `stats.player`, `stats.party`, and `stats.combat` are small,
documented in `api-stats.md`, consumed by the encounter bar and the Party Statistics window, and covered by
the suite. They are the seam this refactor happens underneath.

The rule for every phase: **a consumer must not be able to tell the refactor happened.** If a phase wants a
behavioural change, that is a separate change, made before or after but never inside.

`stats-party.js` (252 lines) is already the shape the rest should reach and is not touched.

## The decomposition

Measured from the method roster, grouped by responsibility:

| Cluster | Approx lines | Representative methods |
|---|---|---|
| Chat cards and template preparation | ~935 | `_prepareTemplateData` (321), `_prepareCombatTemplateData` (267), `_sendRoundCards`, `_sendCombatCards`, `_sendCombatStartCard`, `generateRoundSummary` |
| System integration -- dnd5e, midi-qol, sockets | ~930 | `_onMidiPreTargetDamageApplication` (183), `_onMidiHitsChecked`, `_onMidiRollComplete`, `_onAttackRoll`, `_onDamageRoll`, `_onChatMessage`, the five `_onSocket*` handlers, `_forwardToGM`, `_getCritFumbleFromChatAttackRoll` |
| MVP scoring and narrative | ~800 | `_calculateMVP` (152), `_computeMvpScore`, `_computeMvpMaxima`, `_generateMVPDescription`, `_chooseTheme`, `_renderTemplate`, `generateDescription`, `_computeContributions` |
| Accumulation core | ~600 | `_processDamageOrHealing` (237), `_processResolvedAttack`, `_processResolvedDamage`, `_ensureParticipantStats`, `_creditKill` |
| Combat lifecycle | ~400 | `_onCombatStart`, `_onCombatEnd`, `_onRoundStart`, `_onRoundEnd`, `_onTurnChange` |
| Read surface and aggregate | ~250 | `getRunningCombatStats`, `getRunningCombatSource`, `_buildCombatAggregate`, `getCombatSummary`, `getCombatHistory` |
| Persistence | ~115 | `_schedulePersistCombatStats`, `_serializeForCombatFlag`, `_persistCombatStatsNow` |
| Hook registration | 283 | `_registerHooks`, one method |

Two facts worth carrying into the work, because both are easy to break by moving code:

**Players are not passive.** `_forwardToGM` sends roll events over SocketLib to the GM, who records them.
So a player client forwards but does not accumulate, and the five `_onSocket*` handlers are the GM-side
receivers. Any phase touching the integration cluster is touching a distributed path, not a local one.

**The GM-gate is scattered, not central.** `if (!game.user.isGM || !getSettingSafely(...))` appears at
several entry points rather than at one boundary. Moving a method without its gate silently turns a player
client into a writer. Each phase must account for the gates in the code it moves; a later phase can
consider pulling them to one boundary, but that is a behavioural change and not part of a move.

## Phases

Ordered least-risk first. Each is independently shippable and independently verifiable, and none depends on
a later one.

**Phase 1 -- extract the chat cards.** ~935 lines to `stats-cards.js`. The largest single cluster, the most
clearly separable, and the one with no distributed behaviour: it reads a finished summary and posts
messages. Note that `api-chatcards.md` is a **theme** API and not a rendering framework, so this is a new
sibling file rather than a move into an existing home; the cards keep using the theme API as they do now.

It backs **eleven templates in two families** -- `card-stats-round-{start,summary,mvp,moments,breakdown}`
and `card-stats-combat-{start,end,summary,mvp,moments,breakdown}` -- which is the honest measure of how much
presentation lives in the tracker. Takes both `_prepare*TemplateData` methods, the three `_send*Card`
methods, `generateRoundSummary`, and `_enrichNotableMomentsWithPortraits`.

`registerHelpers` and its three formatting helpers go too: checked, and its only caller is
`initialize` at `stats-combat.js:646`, so nothing outside depends on it. The new file registers them.

**Verify**: the harness Stats tab is unchanged, and a live combat produces every card in both families --
round start through combat breakdown -- identical to before. Run a multi-round combat, or the round family
is never exercised.

**Phase 2 -- extract MVP scoring and narrative.** ~800 lines to `stats-mvp.js`. Scoring is a self-contained
calculation over participant summaries, and the narrative generation beneath it (`_chooseTheme`,
`_renderTemplate`, `generateDescription`, `_pickRandom`, `_sanitizeName`) is a small templating engine that
has nothing to do with combat tracking. The tuning settings reader goes with it.

The one coupling to preserve deliberately: `_generateCombatSummary` stamps `mvpRankings` back onto
`combatStats`, and the `blacksmith.roundMvpScore` hook fires per round. Both stay observable exactly as
they are.

**Verify**: the suite's MVP assertions -- party-only, sorted descending, MVP is the top entry -- pass
unchanged, and a live combat's MVP card names the same character with the same score.

**Phase 3 -- extract system integration.** ~930 lines to `stats-sources.js` (or split dnd5e and midi-qol if
the seam is clean once inside). This is the highest-value phase and the riskiest: it isolates third-party
coupling so a midi-qol change hits one file, and it puts the socket forwarding beside the handlers it
feeds. It is riskiest because it is the distributed path and because `_registerHooks` (283 lines) has to be
split along with it.

Related but separate: `project-rolls-api.md` notes four crit/fumble detection sites across the codebase
that want consolidating. `_getCritFumbleFromChatAttackRoll` is one of them. Do not fold that consolidation
into this phase -- note the overlap and keep the move pure.

**Verify**: with midi-qol active and again with it inactive, a full combat records the same hits, misses,
crits, fumbles, damage, and kills as before. Then the same with a player rolling, to exercise the forward
path rather than only the GM path.

**Phase 4 -- assess what remains.** Accumulation, lifecycle, persistence, and the read surface come to
roughly 1,500 lines. That may be a reasonable file, or the read surface and persistence may want to come
out. Decide with the file in front of you rather than now; a plan that pre-commits to a split it cannot see
is guessing.

## What the phases actually found

Recorded because it changed decisions, and because phase 4 inherits it.

**Two dead methods**, deleted rather than carried into new files: `generateRoundSummary` (rendered
`stats-round.hbs`, no caller anywhere) and `_generateMVPDescription` (definition only). One per phase for
the first two phases.

**`registerHelpers` could not move, and is a live bug.** The plan said to check whether it was card-local.
It is not: it registers Handlebars helpers that eleven non-stats templates rely on, and it sits *after* the
`trackCombatStats` early return in `initialize()`. Turning combat stats off therefore unregisters
`formatTime`, which `timer-combat.hbs` uses. Logged in `TODO.md`; not fixed, because a move is a move.

**Phase 2 was a leaf, phase 3 was not.** The MVP scoring methods referenced no tracker state at all, so
`stats-mvp.js` imports nothing back -- and a commented-out `import { MVPDescriptionGenerator } from
'./mvp-description-generator.js'` at the top of `stats-combat.js` shows the extraction had been intended
before. The integration handlers are the opposite: they write tracker state through nine members, which is
why phase 3 needed a cycle and why its adapters are the phase 4 target.

**`_registerHooks` did not need splitting.** The plan assumed it would have to be. Keeping it whole with its
callbacks repointed was both lower risk and the better arrangement -- one place where every hook and socket
is registered.

## Adjacent work this does not include

Named so they are not silently absorbed:

- **`stats-player.js` is 2,606 lines and 37 methods** and wants its own audit. Do not bundle it.
- **Dynamic import when tracking is off** -- already a Medium item in `TODO.md`. The static imports in
  `blacksmith.js` and the timers keep the file on the cold path even when disabled. Decomposition makes
  this easier and should be done after, not during.
- **`RoundTimer._getRoundTiming()`'s legacy fallback** (`timer-round.js:230`) for combats predating the
  `stats` / `roundTimer` flag split is marked in `architecture-stats.md` as removable a release after it
  shipped. It has shipped. It lives in the timers, not here, so it is a separate change in a separate file
  -- listed only so it is not lost.
- **Consolidating the scattered GM-gates** to one boundary. A behavioural change, worth doing, not a move.

## How this gets verified at all

There is no test framework beyond Foundry, so the harness is the safety net and it has to be used the same
way each time:

1. Run the Stats suite before the phase and keep the console output.
2. Make the move.
3. Run it again. **The assertion count and every result must be identical.** A changed count means
   something was dropped; a changed result means behaviour moved.
4. Then a live combat, because the suite covers the read surface and not the tracking hooks -- the phase's
   own verify line above says what to watch.

If a phase cannot be verified this way, it is too big; split it.

## When this is done

Per the docs rules this plan is scaffolding and gets **deleted** on completion. Its durable content --
which file owns what, why the integration cluster is isolated, the socket forward path, where the GM-gates
live -- belongs in `architecture-stats.md` as each phase lands, not left here. Anything still shaped like
work at that point moves to `TODO.md`.
