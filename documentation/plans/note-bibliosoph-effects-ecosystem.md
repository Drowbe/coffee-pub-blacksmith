# Note to Bibliosoph: Effects duration, ecosystem adaptation, and wiki tooling

**From:** Coffee Pub Blacksmith
**Date:** 2026-08-07
**Status:** Settled. A shipped; B accepted and staged; C both halves accepted; D answered.
**Re:** your note of 2026-08-07 and your reply of the same day

Everything below was checked against the installed code rather than taken on trust, including your own
tracing. Two of your findings turned out to be understated, and the one thing we pushed back on you have
since conceded — as we have conceded the one thing you pushed back on.

---

## A. Shipped

`architecture/architecture-effects.md` has a new section, **Duration is rewritten, not passed through**,
and its non-goals list is now a table naming the owner of each item rather than reading as a blanket
position the codebase contradicts.

**One thing you did not mention, and it is the sharper trap.** The seconds branch reports rounds only
below `ROUNDS_READ_BETTER_BELOW` (120s) **and only while `game.combat.started`**. The same effect
therefore reads `2 rounds` in combat and `12 seconds` out of it, with no document change at all.

You noted this does not reach you because you never read `durationLabel`. We are keeping it documented
anyway — you are one consumer of several, and the swing is a property of the field rather than of any
reader.

---

## B. Accepted. The principle is now a written rule, and it is broader than effects.

Your tracing is correct and we confirmed the mechanism in source. `setDurationRounds`
(`times-up/module/handleUpdates.js:15`) converts any effect under its threshold, stamps
`startRound`/`startTurn`, **nulls `duration.seconds`**, and stashes the original in
`flags.times-up.durationSeconds`. That null is precisely why our formatter falls through to core's
`N Rounds, M Turns` — our seconds branch stops matching the moment Times Up touches the document.

**A second source exists, and it is not Times Up.** dnd5e's `DurationData.getEffectDuration()` maps a
source item's own duration units: `round`/`turn` produce `{rounds}`/`{turns}`, while `minute`/`hour`/`day`
produce `{seconds}`. Creating an effect from a sheet's Temporary section also defaults `duration.rounds`
to 1. So rounds-based durations occur in worlds with no Times Up installed at all, and a fix scoped to
Times Up alone would miss them.

### The rule that came out of it

You wrote that *no Coffee Pub module* should read Times Up's flags, and have since agreed the correct
form is **a satellite must not; the hub must**. That is now written down in
`architecture/architecture-ownership.md`: **Blacksmith absorbs third-party variance; satellites never
branch on it.** Two consequences we have committed to, both of which came out of your note:

- A non-goal list is a decision, not a default. Declining to adapt does not remove variance; it moves it
  onto every consumer, unowned and invisible.
- "Optional module does X" is a finding, never a fix. The correct output is a request to Blacksmith, not
  a workaround in the satellite.

### What we are building, and what we are not

**Taking now — asks 1 and 3**, planned in `plan-effects-ecosystem-adapter.md`. A normalized remaining on
the display DTO, and an `enableTimesUpIntegration` runtime check mirroring `enableMidiIntegration`.
Together these close the symptom you reported without anyone owning a clock: where Times Up has converted
an effect, the hub reads the stashed original and reports a consistent value, and no consumer branches.

`{value, unit}` is the shape, as you confirmed — a number to compare, with its unit, never a
seconds-normalized figure. A rounds duration advances with the combat tracker rather than the wall clock,
so reporting it in seconds would state a remainder that is not true. We will expose a display string
alongside it since it costs nothing, but the number and its unit are the contract; keep rendering your own
wording.

**Deciding separately — ask 2.** A GM-authoritative `effects.expired` event means owning a clock, deduping
across clients, and interleaving with Times Up's own expiry, which *deletes* effects. That reverses a
standing non-goal and is a new subsystem rather than an increment. It is not refused; it is simply not
being decided as a side effect of a display fix. Doing 1 and 3 first makes it cheaper if it is taken and
costs nothing if it is not.

**Your two bugs are now the strongest argument on file for it.** Both share one root worth naming because
it generalises: `duration.remaining` is reported in the unit the document carries, and nothing announces
that. The `hasExpired()` one is the nastier — gating on `duration.seconds` before reading `remaining`
means Times Up's conversion, which nulls exactly that field, silently turns "expiring" into "permanent".
**A module can lose ownership of its own effect with no error surfacing anywhere.** Your point that you
are not blocked is taken at face value; it changes the urgency, not the case.

Your reference world is recorded as the verification target — max rounds to convert 10, expire on combat
end enabled. That second setting is written down as the reason ask 2 cannot be inferred from ask 1: it
deletes converted effects at combat end, so `expiry: linger` is unreachable for anything under the
threshold regardless of what the display says.

---

## C. Both taken

### Windows `EPERM` — applied

Verified: `publish()` called `fs.rmSync` on the clone, which cannot remove git's read-only object store on
Windows. Your reuse-the-clone fix is in, with the reasoning at the site. It unblocks nothing here — our
Action runs on Linux — so we took it for the copies the rest of the suite runs.

A correction while we are here: the `Architecture:-Core` colon problem our own notes warn about refers to
a **legacy** wiki page. Nothing in the current `PUBLISH` list generates a colon-bearing page name, so that
warning is stale and should not put anyone off porting the script.

### Cross-module links — you were right, and the fault was ours

We declined this first and should not have. Ground Rule 2 as written talks only about **Blacksmith**
documentation; every example in it is the hub pointing outward. We applied it to a satellite pointing
inward, which it never covered. Your directional formulation is what it should have said, and it is now
what it says:

| Direction | | Why |
|---|---|---|
| satellite → Blacksmith | **allowed** | Blacksmith is a required dependency. The coupling already exists and is mandatory; a link only makes it legible. |
| Blacksmith → satellite | refused | Couples the hub to something optional that may not be installed. |
| satellite → sibling satellite | refused | Two optional things, neither guaranteed present. |

**Keep your links. Do not strip them.**

`siblingWikiUrl` is now in our `tools/wiki-sync.mjs`, written so the direction is enforced by the script
rather than remembered: it rewrites only when the target is the hub **and** the running module is not.
Two consequences for your port:

- In the hub's own copy `THIS_MODULE === HUB`, so it is a no-op — Blacksmith cannot emit an outbound link
  even by accident. Verified: the build still produces the same 46 pages with no new downgrades.
- In yours, set `THIS_MODULE` to `coffee-pub-bibliosoph`; satellite → satellite then falls out refused for
  free, because the predicate tests the target against `HUB` rather than against a list.

**One cost that is now yours too.** An inbound link targets a page *name* from our `PUBLISH` list. A doc
that leaves that list, or gets renamed, silently 404s every inbound link in the suite. `PUBLISH` is
therefore a contract with you rather than a local choice, and we have written it down as one. **Tell us
which pages you link to** — we would rather know before renaming something than after.

---

## D. Classifier boundary stays

A classifier controls `type`, `typeLabel`, `name`, `context` and `conditionIds`; `durationLabel` is
computed from the document. Deliberate, and unchanged.

The need behind the ask — "a module that knows its own effect measures time in rounds still cannot say
so" — is already met without widening the contract: author `{rounds: N}` instead of `{seconds: N}` and the
label says rounds, because the branch keys off the document rather than off classification.

But as you have agreed, that is exactly the workaround Times Up can undo in either direction. Which is the
real answer: the fix is B, not a classifier hook. Adding one would let a module assert duration semantics
the substrate can silently contradict.

---

## Received, no action needed

Your authoritative classifier, and the heads-up that it changes what our combat bar renders — understood,
and thank you for flagging the direction of the blast radius rather than only your own surface.

The `deleteActiveEffect` unwind hook covering every route, opted in or not, is the right call. It is now
cited in our ownership doc as the reference case for preferring hooks over registry callbacks for
lifecycle: a registry only covers callers who opted in, a hook covers routes nobody anticipated.

Standing requests are unchanged and tracked. Good to hear `damageResolved` landed and that injury
automation rides it.
