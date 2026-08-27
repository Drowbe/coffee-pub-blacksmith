# Plan: statistics integrity

**Status: Planned -- the backup exists, nothing else has started.** Live scaffolding, opened 2026-08-04.
Two findings that constrain every further change to the statistics system: there is irreplaceable campaign
data in the live world, and several statistics are written only by midi-qol handlers, so two tables get
different numbers from the same fight.

**On completion:** the storage and versioning rules fold into
`documentation/architecture/architecture-stats.md`, the work items become `TODO.md` entries, shipped history
goes to `CHANGELOG.md`, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## CRITICAL - protect the live campaign statistics before changing them further

**Raised 2026-08-04.** There is real campaign data in the live world and it is irreplaceable. The
urgent item - a backup - is done. What remains below blocks the **damage-semantics change**, which
must not land until the version stamp is being written.

**An export DOES exist** - `_exportHistory()` in `window-stats-party.js:243`, with a matching import
at `:404`. An earlier note here claimed there was none; that was wrong. It writes
`{version, exportDate, combatHistory, playerStats[]}`, where each player entry is
`{actorId, actorName, stats: {lifetime}}`. There is still **no schema version on the stored data
itself** - the `version` field lives only in the export envelope.

**THE IMPORT IS ADDITIVE, NOT A RESTORE. This is a trap.** `_mergePlayerStats`
(`window-stats-party.js:557`) **adds** imported values to whatever is already on the actor -
`totalHits`, `totalMisses`, `criticals`, `fumbles`, `totalDamage`, healing totals - and takes the
extreme for `biggest`/`weakest`. Exporting, then importing the same file back into the same world,
**doubles every lifetime figure**. It is a merge built for combining two sources, not for restoring
a backup, and nothing in the UI says so. Combat history is safe by contrast: it is keyed on
`combatId` and replaces-if-newer.

Consequences: a restore needs the current data cleared first, or a writer that replaces rather than
merges. **There is no reset reachable from either stats window** - the reset functions exist in
`stats-player.js` but are not wired to any button - so today a restore cannot be done through the UI
at all without doubling.

**Where the durable data actually is** (the ephemeral per-combat flags do not matter here):

| What | Where | Replaceable? |
|---|---|---|
| Lifetime per-character statistics | actor flag `coffee-pub-blacksmith.playerStats`, one per actor | **No.** Accumulated over the whole campaign. |
| Completed combat summaries | world setting `coffee-pub-blacksmith.combatHistory` | **No.** |
| Running combat | combat flags `stats` / `combatStats` | Yes - one fight. |

**What can destroy it today, with no undo:** `stats-player.js:506`, `:577` and `:601` each write
`CPB_STATS_DEFAULTS` over an actor's whole `playerStats` flag, and `stats-combat.js:1023` sets
`combatHistory` to `[]`. Those are the reset paths working as designed; the problem is that nothing
stands between them and a campaign's history.

**A backup now exists.** The author exported the live world on 2026-08-04 (10 combats, 16 player
stat records). That was the urgent item and it is done; the export file is the safety net for
everything below. Note that it cannot be restored through the UI as things stand - see the additive
import above.

**Still outstanding:**

1. **A schema/version stamp** written into `playerStats` and into each `combatHistory` entry. Not
   cosmetic: see the sequencing problem below. Without it, old and new records are
   indistinguishable forever.
2. **Guard the reset paths** behind an explicit confirmation that names what is about to be lost,
   and have them export first.
3. **Make the import restore rather than accumulate**, or at minimum say plainly in the import
   dialog that it adds to existing values. A user restoring their own backup has no reason to expect
   doubling, and the dialog currently offers no hint. Wire a reset to the stats windows as part of
   this - without one, there is no way to make a restore land on a clean slate.

**What a real export turned up, fixed 2026-08-04.** Reading the actual exported file, and then
running the repair macro against the live world, found three defects that no amount of reading the
code had surfaced - all now fixed (see `CHANGELOG.md`), with `utilities/repair-stats-data.js` to
repair data already stored. `combatHistory` was storing whole Scene documents in its `sceneId` field
(19.3 MB of the 19.4 MB total on production); non-party actors were being tracked, including summons
and eighteen plain monsters; and `getPlayerStats` re-created a record on any cache miss, so clearing
one and then rendering any window that read it brought it straight back. The lesson is worth keeping
- **inspect the data, not just the code that writes it**, and watch what the console does *after* a
repair reports success.

**The scene-document repair has been applied to production** (down to ~40 KB, verified). The
record-clearing does not stick on 13.14.2 or earlier, because the old code re-creates records on
read - so **re-run the macro on any world once it has updated to 13.15.0**. On the fixed code the
clear holds: a verified run cleared ten non-party records with no `Initializing stats for actor:`
following, where the same run against the old code showed all ten reborn in the same tick. That
absence is the check worth repeating, since nothing errors when it goes wrong.

**The sequencing problem, and why this blocks the damage-semantics change.** "Damage dealt" is being
redefined from *rolled total* to *applied HP after resistance* (decided 2026-08-04). Existing records
were written under the old meaning. Once new records land beside them, one number in one field means
two different things depending on when it was written, with **nothing in the data saying which** -
every historical total, biggest hit, and MVP score silently becomes a mix. A version stamp is what
makes that recoverable: it lets a later migration find the old records, and it lets a reader know
which meaning they are looking at. **Do not land the damage-semantics change until the export exists
and the stamp is being written.**

Decide as part of this, since it cannot be decided afterwards: are historical records **migrated**
(they cannot be - the resistance information was never captured, so the original applied HP is
unrecoverable), **left as-is and labelled** (recommended), or **reset**? Labelled is the only honest
option that keeps the campaign's history.

## The statistics system is midi-first in load-bearing places

**Audited 2026-08-04, read-only.** midi-qol is not a dependency (`module.json` requires only
socketlib and lib-wrapper), but several statistics are written **only** by midi handlers. The result
is not a missing feature — it is that **two tables get different numbers from the same fight**, with
nothing erroring on either. Errors in both directions, so cross-table comparison is meaningless.

The three worst were fixed 2026-08-04 and now live only in `CHANGELOG.md`: the MVP offense counter,
player lifetime damage discarding uncorrelated damage, and the `return` that stopped one activity
card yielding both an attack and its damage. What follows is what remains, worst first.

1. **DECIDED, BLOCKED ON THE EXPORT ABOVE - "damage dealt" means applied HP.**
   Settled 2026-08-04: it means **what actually came off the monster**, not what the dice said. midi
   already records applied HP after resistance (`stats-sources.js:534-551`,
   `stats-player.js:1056-1071`); the core lane records the rolled total
   (`utility-message-resolution.js:489-495`), so a non-midi table reads roughly double against a
   resistant or immune monster. The core lane must move to the HP-delta signal; the hooks it needs
   already exist and are wired for other purposes (`stats-player.js:437-451`,
   `stats-combat.js:2130-2146`).

   **Do not land this before the export and the version stamp exist** - see the CRITICAL item at the
   top. This redefines a field that already holds a campaign of history, and without a stamp the old
   and new meanings become indistinguishable forever. It propagates to damage dealt and taken,
   biggest-hit moments, the MVP damage term, and the party readout.

   This is a silent numeric divergence rather than a missing field, which makes it the hardest to
   notice and the most important to settle a policy on.

   *Verify:* hit a resistant monster for a rolled 20 that applies 10; confirm 10 is recorded, and
   that the same attack records 10 with midi enabled and disabled.

2. **Lower severity, combat lane.** `_onMidiRollComplete`'s GM path never persists while its socket
   twin does (`stats-sources.js:1226` vs `:699-777`), so a crit just before a reload is lost only on
   the GM path. `_processAttackRoll` fabricates `AC = 10` when unknown and records a hit or miss
   from it (`stats-combat.js:1786-1787`). `_onSocketTrackDamage` classifies healing by **item-name
   keywords** — "heal", "cure", "restore" (`stats-sources.js:985, 992`) — where the midi lane uses
   the sign of `hpDamage`.

3. **midi vocabulary inside system-native code.** `makeKey()` prefers `midi:${workflowId}` before
   the system-native key (`utility-message-resolution.js:167-181`); that file imports
   `getWorkflowId` from the midi module despite its header promising no midi-specific APIs (`:13`
   vs `:10`); and `stats-combat.js:1542` branches on `attackEvent.key.startsWith("midi:")` while its
   own header claims "the accumulator no longer knows midi-qol exists" (`:15-17`). Either the claims
   go or the coupling does.

4. **`manager-roll-outcomes.js` is the pattern to copy.** Its core `createChatMessage` lane is
   registered unconditionally (`:284`) and the midi hooks are additive (`:287`). That is core-first
   with midi as enhancement, which is the rule.

**This blocks phase 2 of the delivery work below.** Recounting hits from `landedTargets` and gating
`successfulOffenseCount` on a landed delivery both change midi tables' numbers while non-midi tables
keep current behaviour — widening the split rather than closing it. Land items 1-3 first.
