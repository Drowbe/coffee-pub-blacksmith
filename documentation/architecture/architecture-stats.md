# Stats System Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public surface, see `../api/api-stats.md`.

The stats system tracks combat statistics at three scopes — round, combat, and lifetime — plus a transient per-session scope. Round and combat data are ephemeral by design; only the combat *summary* and lifetime totals persist.

## Files and responsibilities

| File | Owns |
|---|---|
| `scripts/stats-combat.js` | The accumulator and the rules: round tracking, combat tracking, summary generation, persistence, and the combat history |
| `scripts/stats-sources.js` | Where the data comes from — dnd5e roll hooks, midi-qol workflows, chat messages, and the socket carrying a player's rolls to the GM |
| `scripts/stats-cards.js` | The eight round/combat statistics chat cards in two template families |
| `scripts/stats-mvp.js` | MVP scoring and the narrative written from it. A leaf: imports none of the above |
| `scripts/stats-player.js` | Lifetime per-actor stats, and GM-only in-memory session state |
| `scripts/stats-party.js` | Party-wide aggregates over the other two, cached; owns no data of its own |
| `scripts/timer-round.js` | Round duration, including `accumulatedTime` (shares a flag with stats-combat — see below) |

The four combat files were one 5,264-line class until the decomposition. What separates them is direction of
dependency, not subject matter: `stats-sources.js` translates events *in*, `stats-cards.js` renders results
*out*, `stats-mvp.js` computes over data handed to it, and `stats-combat.js` sits in the middle owning state.
A change to any one of the three outer files should not require reading the others.

## How the four files reference each other

Not uniform, and the differences are deliberate:

| From | To | How | Why |
|---|---|---|---|
| `stats-cards.js` | `stats-combat.js` | static | Cards read tracker state |
| `stats-combat.js` | `stats-cards.js` | **lazy** (`await import`) | Cards are needed only when one is sent, so laziness costs nothing and removes the cycle |
| `stats-sources.js` | `stats-combat.js` | static | Handlers write tracker state |
| `stats-combat.js` | `stats-sources.js` | **static — a cycle** | Handlers are needed while `_registerHooks` runs, and `initialize()` calls that synchronously; `socket.register` in particular needs the class right then. A lazy import would push an `await` into the bootstrap sequence §3 of `architecture-blacksmith.md` warns about |
| either | `stats-mvp.js` | static | It is a leaf and imports nothing back |

The `stats-combat` / `stats-sources` cycle is the harmless kind: neither module touches the other while its
own body evaluates, every cross-reference sitting inside a method that runs later. **That is a condition, not
an observation** — adding a `static X = CombatStats.something` to `stats-sources.js` would break module
initialization. The file says so at the top.

`_registerHooks` deliberately stays whole in `stats-combat.js` rather than being split across the two, so
there remains exactly one place where every hook and socket is registered.

`stats-combat.js` never touches lifetime data or actor flags. `stats-player.js` never touches combat flags — its only flag access is `actor.getFlag` / `actor.setFlag(MODULE.ID, 'playerStats')`. The boundary is clean in both directions; keep it that way.

Three files carry the same method names as `stats-combat.js`'s former handlers — `stats-player.js` and
`manager-roll-outcomes.js` each define their own `_onAttackRoll`, `_onMidiHitsChecked`, and `_forwardToGM`.
Those are independent implementations, not calls across a boundary, and a search for any of those names will
return all of them. `manager-roll-outcomes.js` having its own socket forwarder is a real duplication.

`stats-party.js` reads both and writes neither. It exists because every other tier is per-actor or
per-combat, so anything party-wide has to be reduced, and that reduction should have exactly one
implementation.

## The adapter owns correlation; the tracker owns the numbers

One attack can reach us three ways — a dnd5e roll hook, a midi-qol workflow, and a chat message — in any
order, sometimes more than once, and which of them fire depends on what the world has installed. Working out
that several arrivals describe one swing, and that one of them already counted, is **translation**. It lives
in `stats-sources.js` with the handlers that need it: `_attackCache` and `ATTACK_TTL_MS`, `_pendingMidiCrit`,
`_midiDedupe`, `_chatDedupe`, `_roundOffenseCache`, and `_lastRollWasCritical`.

All of those used to sit on `CombatStats`, which mostly never touched them. The tracker now reaches back for
exactly three things, through named methods rather than by poking at fields:

| Call | When |
|---|---|
| `CombatSources.getCachedAttack(key)` | Correlating a damage event to the attack that caused it |
| `CombatSources.resetRound()` | A round boundary, which the tracker owns and the adapter needs told |
| `CombatSources.noteAttackCritical(crit)` | After processing an attack, so the damage event that follows knows |

Three is the budget. If that list grows, the boundary is being eroded again.

`_lastRollWasCritical` is the one worth understanding, because it looks like tracker state and is not. The
non-midi path splits one attack across two unrelated system events, so something has to carry crit-ness
forward. The tracker **wrote that field and never read it** — it was pushing state to the adapter through a
shared mutable variable. It is now an explicit hand-off in the direction the data actually flows.

**`stats-combat.js` imports nothing from `utility-message-resolution.js` or `utility-midi-resolution.js`,
and that is a load-bearing invariant.** midi-qol is optional by long-standing requirement — it is absent from
`module.json`'s `requires`, its hooks register only inside `if (game.modules.get("midi-qol")?.active)`, and
handlers on both paths re-check `isMidiIntegrationEnabled()` with opposite polarity so exactly one path counts
any given attack. The accumulator being unable to name midi-qol is what makes that requirement structural
rather than a convention. An import from either utility reappearing in `stats-combat.js` means event
translation has leaked back in.

`_ensureParticipantStats` and `_ensureCombatTotals` hand back live references into the accumulator, and the
handlers write through them. That is the last of the reaching-in: a caller holding one of those references
can mutate recorded statistics without going through the manager.

## One card, many sightings: what a chat message is worth reading twice

A dnd5e activity card is **not** a finished record when it is created. It is posted on use, then
updated in place as each part of the activity resolves — the attack roll arrives after the card, the
damage roll after that — and midi-qol rewrites the same card several more times. So one swing produces
one message id and a dozen `createChatMessage` / `updateChatMessage` sightings, each carrying more than
the last.

Three rules follow, and all three were learned by getting them wrong:

**A resolution with no roll is provisional, and must not be recorded.** `resolveAttackMessage` decides
hit or miss by comparing the attack total against each target's AC, so before the d20 lands every target
resolves as unknown. Recording that banks an attempt with no hit — a permanent miss for a swing that
had not been rolled yet. `stats-sources.js` and `stats-player.js` both gate on
`typeof attackEvent.attackTotal === 'number'` for this reason.

**A deferred sighting must not mark the dedupe key.** This is the load-bearing half. The key is the
message id, so marking it on the provisional sighting discards every later sighting of the same
message — including the one carrying the roll and the real hit list. The attempt could then never
become a hit. Leaving the key unmarked is what lets the correction through.

**The attack and its damage share a message, so reading it as an attack cannot end the read.**
`_onChatMessage` resolves the attack and then falls through to `resolveDamageMessage` on the same
message, deliberately not as an `else`. Returning after the attack branch meant an activity card was
only ever read as an attack, and no damage was recorded on that path at all — a landed hit showed the
right hit rate and zero damage dealt.

Two consequences for anyone touching `utility-message-resolution.js`:

`hydrateFirstRoll` reads `rolls[0]`. On a combined card that is the attack d20, so anything wanting
damage must use `hydrateAllRolls` and select the damage rolls — otherwise the to-hit total is reported
as damage dealt. `resolveDamageMessage` sums the damage rolls rather than taking the first.

Recognising damage cannot rely on `dnd5e.roll.type` or on "no d20 anywhere on the message". On an
activity card the first describes the card as a usage and the second is false, because the attack's d20
is sitting beside the damage. The rolls themselves are the evidence, which is what `isDamageRoll` tests.

## Dedupe is per lane, and the lanes must agree

`stats-combat.js` and `stats-player.js` consume the same messages independently and reach different
storage — the combat accumulator and the lifetime actor flags. Both therefore need the same correlation
discipline, and for a long time only one had it: the combat lane deduped on message id while the
lifetime lane deduped not at all, so a single swing that the combat bar counted once was written to
lifetime flags once per card rewrite — nine times in a measured case, silently inflating every lifetime
total. `CPBPlayerStats._isAttackDuplicate` is the counterpart to `CombatSources._chatDedupe`.

The general shape: **a new consumer of these messages needs its own dedupe, not a shared one.** The
lanes deliberately do not share a tracker, because they can legitimately process the same event at
different times — but every lane needs one, and a lane without one fails silently and upward.

## The tiers

- **Round** (`CombatStats.currentStats`) — in memory for the active round, mirrored to the combat `stats` flag. Reset when a new round begins.
- **Combat** (`CombatStats.combatStats`) — aggregates for the active combat: totals for damage, healing, and attack counts, plus per-participant summaries and top-moment highlights. Raw event arrays are discarded when the summary is generated. Read publicly through `getRunningCombatStats()`.
- **Lifetime** (actor flag `playerStats`) — permanent per-actor records. GM-only writes.
- **Session** (`CPBPlayerStats._sessionStats`) — a GM-only in-memory Map keyed by actor id, holding transient state. Lost on world reload.

- **Party** (`PartyStats._cache`) — a derived aggregate over lifetime flags and stored combat history. Owns
  nothing; holds no truth of its own.

`_boundedPush` caps round and actor logs (default 1000 entries) so in-memory arrays cannot grow without limit.

## One reduction serves the live combat and the summary card

`_generateCombatSummary()` used to do two jobs in one function: reduce `combatStats` into
per-participant summaries, party-only totals, top moments, and MVP rankings; and then wrap that in combat
metadata. Only the second job needs a finished combat, so the first is extracted as
`_buildCombatAggregate()` — pure over `combatStats`, no metadata, no writes — and both the summary
generator and `getRunningCombatStats()` call it.

That separation is the point rather than tidiness. A live readout wants exactly the numbers the summary
card reports, and reducing them a second time would be a second definition of who counts as the party, how
misses are inferred when only attempts and hits were recorded, and how MVP is scored. The two would then
disagree at the moment combat ends, which is the one moment a table is looking at both.

`_generateCombatSummary()` keeps the one write that is genuinely its own: stamping `mvpRankings` back onto
`combatStats` for the stored summary.

## The party aggregate is cached, not derived per read

Building it awaits `getStats` for every player-owned actor and reduces the whole combat history. A window
opened occasionally can afford that; a menubar readout that re-renders on every combat update cannot, and a
second consumer reducing it again would be a second definition of who counts as the party and how ties
break.

So `PartyStats` caches, and invalidates on the events that can change the answer: `blacksmith.combatSummaryReady`
when a combat ends, and actor create, update, and delete for membership and lifetime writes. Reads are
served from cache; `getAggregateSync()` exists for callers that render synchronously and returns null while
a rebuild runs rather than blocking.

Consumers must not reduce the party themselves — the Party Statistics window did until this landed, and its
`_buildSummary` / `_buildLeaderboard` were deleted in favour of the aggregate.

## Persistence

Two things survive a reload, and they behave differently:

**`combatHistory`** — a world setting (type Object, default `[]`) holding every combat summary. `_storeCombatSummary()` (`stats-combat.js:1081`) does `[summary, ...currentHistory]` and writes it back with **no pruning**; the source comment states the intent plainly: "Store all history - no pruning to ensure lifetime stats remain verifiable." It grows without bound and syncs to every client.

This is a deliberate design decision, not an oversight. Do not add pruning without a decision to change that contract — lifetime stats are reconstructable from this history, and truncating it silently breaks that guarantee.

The `20` that appears around this data is **not** a storage bound: `getCombatHistory(limit = 20)` (`:1118`) applies `.slice(0, limit)` at read time. Pass `null` to get everything.

**Actor flag `playerStats`** — lifetime totals, written only by `stats-player.js`.

**Because the history is unbounded and syncs to every client, every field in a summary must be small.** A summary entry stores ids and scalars; it never stores a document. `_generateCombatSummary` (`stats-combat.js:907`) resolves `sceneId` with `combat.scene?.id ?? combat.sceneId ?? canvas?.scene?.id ?? null`, and the `?.id` is the load-bearing part — **`combat.scene` is a resolved Scene document, not an id**. Assigning it directly serializes every token, wall, tile, light and sound of the map into a world setting that is loaded on every launch and rewritten at the end of every fight. Ten combats reached 21.1 MB that way, against roughly 40 KB of statistics. `sceneName` is stored alongside and is the only part of the scene any readout displays.

## Who counts as a party member

One predicate, `isPlayerCharacter` in `api-core.js`, and every lane delegates to it — `CombatStats._isPlayerCharacter`, `CPBPlayerStats._isPlayerCharacter`, `CombatMvp._calculateMVPScore`, `PartyStats.getPartyActors`, `getPartyMembers` in `utility-party.js`, and the party window. It requires **both** a `character` sheet type and player ownership.

**The sheet type is what keeps summons out; ownership alone would not.** A summoned creature is handed to its summoner's player so they can drive it, so it reports `hasPlayerOwner === true` for as long as it exists. Testing ownership by itself — or `hasPlayerOwner || type === 'character'`, an **or**, which is what the combat and MVP lanes used — gave one casting of Conjure Animals six identically-named rows in the party window, each with its own lifetime record and its own place in the MVP ranking. A live campaign was also carrying records for eighteen plain monsters.

**NPCs are not tracked, including ones a player owns permanently**, and this was decided after trying the alternative. An intermediate design admitted companions and screened summons out by `flags.dnd5e.summon`, which dnd5e stamps on actors its own Summon activity creates (`SummonsData#getChanges` in the system bundle). Checked against a real world it matched **nothing** — those summons came from a premade-content module that copies actors instead. In the same directory sat an animated weapon with its own stat block, player-owned and persistent, indistinguishable from a familiar by every available signal.

**So the rule is the one that needs no inference.** Anything inferred here fails silently and in the direction that corrupts data, and a campaign accumulates summons without limit, each recreated with a fresh id every casting. A sheet type is a fact; transience is a guess.

Two consequences follow: killing a creature summoned by an enemy counts as a kill, and a summon scoring a kill credits nobody. Damage a summon deals is not attributed to its summoner.

Where a check also needs to exclude the synthetic actors of unlinked tokens, `!actor.isToken` is written beside the predicate rather than folded into it — lifetime statistics live on world actors, which is a separate concern from being a character.

**The check that matters is inside `initializeActorStats`, not at its callers, because reading a record creates one.** `getPlayerStats` (`stats-player.js:504`) initializes on a cache miss and is called from the party window, the MVP ranking, and combat end — so a guard on only the explicit initialization paths leaves the read path open, and merely *looking* at an NPC mints its record. This is not theoretical: a cleanup on a live world cleared ten non-party records and the console shows all ten re-initialized before the next line of output, because clearing the flag triggered a re-render that read them back into existence. `initializeActorStats` is the one place a record is born; the check lives there, and the guards at its callers are an optimization rather than the protection.

The consequence for readers is that **`getPlayerStats` returns `null` for a non-party actor** rather than a zeroed record. It previously always returned something, so a caller that dereferences the result without checking will now throw on the first monster it sees.

## Data flow

```
Event occurs (attack, damage, etc.)
  |
stats-combat.js tracks to currentStats (round data)
  |
Round end -> generates round summary -> posts to chat -> discards currentStats
  |
stats-combat.js accumulates into combatStats (aggregates only)
  |
Combat end
  |
stats-combat.js generates the combat summary (aggregates + top N moments)
  |
stats-combat.js persists it to the combatHistory world setting (unbounded)
  |
stats-combat.js fires blacksmith.combatSummaryReady
  |
stats-player.js reads the summary -> updates lifetime stats in actor flags
  |
stats-combat.js discards combatStats; stats-player.js clears session data
  |
Lifetime stats persist in actor flags
```

## Combat flag ownership

Each combat flag has exactly one owner. This was not always true, and the split is deliberate:

| Flag | Owner | Holds |
|---|---|---|
| `stats` | `stats-combat.js` | `currentStats` — written wholesale, safe because nothing else stores here |
| `combatStats` | `stats-combat.js` | The whole-combat accumulator, mirrored on a debounce. Reload resilience for the GM, and the read path for every other client |
| `roundTimer` | `timer-round.js` | `{ startedAt, accumulatedTime }` — this round's timing |
| `totalCombatDuration` | `timer-round.js` | Accumulated duration of completed rounds |

Both subsystems previously stored data under `stats`, which broke in a way worth remembering: `stats-combat` writes that flag wholesale from its in-memory `currentStats`, which has no `accumulatedTime` field — so every write silently discarded the round timer's banked time, producing intermittent under-reported round durations.

The deeper problem was semantic, not just a write collision: both subsystems kept a field called `roundStartTimestamp` and meant **different things by it**. For `stats-combat` it is the wall-clock start of the round (`roundEndTimestamp - roundStartTimestamp` gives `roundDuration`). For the round timer it is the start of the current *active session*, reset whenever the GM's window regains focus. One key could not hold both meanings, which is why merging was not a fix — separate keys were.

Consumers should not read these flags directly. `RoundTimer.getCurrentRoundDuration()` is the public accessor for round elapsed time; `manager-combatbar.js` uses it rather than touching flags.

`_getRoundTiming()` still falls back to the legacy `stats.roundStartTimestamp` / `stats.accumulatedTime` when the `roundTimer` flag is absent, so combats already in progress when the split shipped keep their elapsed time. That fallback is transitional — remove it a release after it lands.

## GM-gated writing is not GM-only reading

The gating below governs who *accumulates*. It does not govern who can read, and conflating the two is a
mistake worth naming: it made live combat statistics look like GM information when they are the opposite —
the table is the audience, and a player who lands the biggest hit of the night is the person the number is
for.

`_schedulePersistCombatStats` mirrors both `currentStats` and `combatStats` to combat flags on a one-second
debounce. A combat document syncs to every client, so the running totals are already on every machine. The
mirror was built for reload resilience — a GM who refreshes mid-combat restores from it — and doubles as a
broadcast channel at no cost. No socket is involved, and none is wanted: a flag write already fires
`updateCombat` everywhere, which is what lets a readout follow along without subscribing to anything.

`getRunningCombatSource()` is where that is expressed, and it reads the flag for **everyone, the GM
included** — even though the GM has memory sitting right there, fresher. That is the deliberate part.

Two read paths would mean the GM's screen works when the players' does not. A broken mirror would then show
the whole table placeholder readouts while the one person able to diagnose it saw perfect numbers and no
error anywhere. There is no amount of logging that fixes a failure the maintainer cannot see; deleting the
second path does. Reading the same bytes the table reads makes "works for me" structurally unavailable.

The price is small and worth naming: the GM's figures lag by up to the debounce interval, and the first
moments of a combat show placeholders for everyone until the first mirror lands. The second is not a
degradation but an honest report — nothing has been broadcast yet, so there is nothing to show.

**The mirror must never publish memory poorer than the flag.** The write is otherwise unconditional --
whatever is in memory replaces the flag -- which is right while this client is the one accumulating and
catastrophic when it is not. After a browser refresh it is not: `initialize()` restores from the flag
exactly once, at `ready`, reading `game.combat` at that instant, and `game.combat` resolves against the
*viewed scene*, so a combat running on another scene reads as no combat at all. The restore then silently
does nothing, memory stays at its defaults, and the next tracked event mirrors those defaults over a flag
holding the whole fight.

`combatStats.startTime` is the discriminator: `_onCombatStart` stamps it, so memory without it has never
been initialised for a combat while a flag with it has. That pairing means the client lost its state, and
`_schedulePersistCombatStats` recovers from the flag rather than publishing over it. A genuinely new
combat always carries a stamp, so a legitimate reset is never blocked. Any future writer of these flags
needs the same rule -- the failure is silent, and what it destroys is the only copy.

`_generateCombatSummary` is the one exception and still reduces memory directly. The stored summary has to
be exact rather than current-to-within-a-second, it runs only on the GM, and it is the write everything
else derives from. `_buildCombatAggregate(source)` takes its input rather than reaching for `combatStats`,
which is what lets the two coexist without a second reduction.

A consequence for consumers: a read is null for the first moments of a combat, so a running combat does not
imply data. Handle null rather than assuming.

**Serialization is a real boundary here, not a formality.** The accumulator crosses JSON on its way to the
flag, and JSON has no `Infinity` — `fastestTurn`'s "nothing timed yet" sentinel of `{duration: Infinity}`
arrives as `{duration: null}`. Any check of the form `x !== Infinity` therefore passes on the flag path and
fails on the memory path. Ask whether a number is finite rather than comparing it against one spelling of
unusable, and treat the same question anywhere else a sentinel or a `Map` crosses that boundary
(`_serializeForCombatFlag` already normalizes Maps for the same reason).

## GM gating

Every tracking path is GM-gated and setting-gated together, in the form `if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;` (`stats-combat.js:109`, `:134`, `:653`). Player clients collect nothing; the GM is the only writer. Any integration that assumes players accumulate their own stats is wrong.

## Hooks

- `blacksmith.combatSummaryReady` — `(summary, combat)` at combat end. This is the supported way to observe stats; there is no subscription API.
- `blacksmith.roundMvpScore` — `{ actorId, actorUuid, score, rank, name }` per round, after the Party Breakdown is generated.

No explicit teardown runs when tracking is disabled, so consumers should remove their own listeners if they stop caring.
