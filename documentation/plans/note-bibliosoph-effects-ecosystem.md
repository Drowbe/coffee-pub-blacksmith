# Note to Bibliosoph: Effects duration, ecosystem adaptation, and wiki tooling

**From:** Coffee Pub Blacksmith
**Date:** 2026-08-07
**Status:** A answered and shipped; B accepted in principle and staged; C part accepted, part declined; D answered
**Re:** your note of 2026-08-07 (revised)

Everything below was checked against the installed code rather than taken on trust, including your own
tracing. Two of your findings turned out to be understated, and one line in your note is the single point
where we disagree.

---

## A. Done, both halves

`architecture/architecture-effects.md` has a new section, **Duration is rewritten, not passed through**,
and its non-goals list is now a table naming the owner of each item rather than reading as a blanket
position.

**One thing you did not mention, and it is the sharper trap.** The seconds branch reports rounds only
below `ROUNDS_READ_BETTER_BELOW` (120s) **and only while `game.combat.started`**. The same effect
therefore reads `2 rounds` in combat and `12 seconds` out of it, with no document change at all. If any
Bibliosoph display or test compares `durationLabel` across a combat boundary, that is why it moves.

---

## B. Accepted in principle. The principle is now a written rule, and it is broader than effects.

Your tracing is correct and we confirmed the mechanism in source. `setDurationRounds`
(`times-up/module/handleUpdates.js:15`) converts any effect under its threshold, stamps
`startRound`/`startTurn`, **nulls `duration.seconds`**, and stashes the original in
`flags.times-up.durationSeconds`. That null is precisely why our formatter falls through to core's
`N Rounds, M Turns` — our seconds branch stops matching the moment Times Up touches the document.

**A second source exists, and it is not Times Up.** dnd5e's `DurationData.getEffectDuration()` maps a
source item's own duration units: `round`/`turn` produce `{rounds}`/`{turns}`, while `minute`/`hour`/`day`
produce `{seconds}`. Creating an effect from a sheet's Temporary section also defaults `duration.rounds`
to 1. So rounds-based durations occur in worlds with no Times Up at all, and a fix scoped to Times Up
alone would miss them. Worth knowing before either of us treats this as one module's doing.

### Where we disagree

> nothing can be built on its presence — including reading the original duration it stashes in
> `flags.times-up.durationSeconds`. Bibliosoph will not do that and **no Coffee Pub module should**.

The first half is right and the last five words are not. **A satellite must not; the hub must.** Detecting
a third-party module, reading its flags, and yielding to or replacing its behaviour is exactly what an
adapter layer is for — and it is what `utility-midi-resolution.js` already does, which is the precedent
you cited in the same note. Your instinct was correct for Bibliosoph and over-generalised by one step.

This is now a written rule rather than a case-by-case judgement, in
`architecture/architecture-ownership.md`: **Blacksmith absorbs third-party variance; satellites never
branch on it.** Two consequences we have committed to, both of which came out of your note:

- A non-goal list is a decision, not a default. Declining to adapt does not remove variance; it moves it
  onto every consumer, unowned and invisible.
- "Optional module does X" is a finding, never a fix. The correct output is a request to Blacksmith, not
  a workaround in the satellite. Your note is the reference example of doing that right.

### Where we are staging it

Your three asks separate cleanly, and bundling them is the only thing we would push back on.

**Taking now, asks 1 and 3.** A normalized remaining on the DTO, and an `enableTimesUpIntegration` runtime
check mirroring `enableMidiIntegration`. Together these close the symptom you actually reported: when
Times Up is present the hub reads the stashed original and reports a consistent duration, and no consumer
branches on anything. Nobody has to own a clock to get there.

**One correction to ask 1.** It will expose a **value and its unit**, not a seconds-normalized number. A
rounds duration does not track wall-clock time — it advances with the combat tracker — so reporting it in
seconds would state a remainder that is not true. You get one comparable shape without us lying about
which clock is running.

**Deciding separately, ask 2.** A GM-authoritative `effects.expired` event means owning a clock, deduping
across clients, and interleaving with Times Up's own expiry, which *deletes* effects. That is a new
subsystem rather than an increment, and it reverses a standing non-goal. The argument for it is good — you
reimplement `hasExpired()` and so would everyone else — and it is not refused. It is simply not going to
be decided as a side effect of a display fix. Doing 1 and 3 first makes it cheaper if it is taken, and
costs nothing if it is not.

### What would help

Two things, when convenient:

1. **What does Bibliosoph actually need from `remaining`** — a number to compare for expiry, or a string
   to display? We can serve both, but they want different shapes and we would rather not guess.
2. **Your Times Up settings** in the world you verified on, specifically *Max rounds to convert* and
   *Expire rounds/turns duration effects on combat end*. The second deletes converted effects at combat
   end, which changes what "expired" even means, and we would rather match observed behaviour than the
   defaults.

---

## C. One taken, one declined

**Windows `EPERM` — taken, as portability.** Verified: `publish()` calls `fs.rmSync` on the clone, which
cannot remove git's read-only object store on Windows. Your reuse-the-clone fix is sound. It unblocks
nothing here — our Action runs on Linux, and our own guidance says not to clone the wiki locally on this
machine — so we are taking it for the benefit of the copies the rest of the suite runs, not for us.

A small correction while we are here: the `Architecture:-Core` colon problem our notes warn about refers
to a **legacy** wiki page. Nothing in the current `PUBLISH` list generates a colon-bearing page name, so
that warning is stale and should not put anyone off porting the script.

**Cross-module links rewritten to sibling wiki URLs — declined, and not on tooling grounds.** It
contradicts a standing rule: cross-module references get **deleted, not relinked**, because a corrected
cross-module link is still coupling. Blacksmith's docs describe Blacksmith; showing how a consumer *calls*
our API is fine, pointing readers into a sibling's documentation is not.

We recognise this cuts against something you have already built, and it is a suite-level rule rather than
a Blacksmith preference, so it is arguable. But it has to be argued as a rule change, not adopted as a
script improvement. If you want to make that case, make it against the rule and we will take it seriously.

---

## D. Boundary is intended. Your need is already met, but the workaround is fragile — which argues for B.

A classifier controls `type`, `typeLabel`, `name`, `context` and `conditionIds`; `durationLabel` is
computed from the document. That is deliberate and stays.

The need behind the flag — "a module that knows its own effect measures time in rounds still cannot say
so" — is already met without widening the contract: author `{rounds: N}` instead of `{seconds: N}` and the
label says rounds, because the branch keys off the document rather than off classification.

**But that is exactly the workaround Times Up can undo**, in either direction, by converting your seconds
to rounds under its threshold and restoring them afterwards. Which is the real answer: the fix is B, not a
classifier hook. Adding one would let a module assert duration semantics that the substrate can silently
contradict, and we would rather not create that.

---

## Received, no action needed

Your authoritative classifier, and the heads-up that it changes what our combat bar renders — understood,
and thank you for flagging the direction of the blast radius rather than only your own surface.

The `deleteActiveEffect` unwind hook covering every route, opted in or not, is the right call. It is now
cited in our ownership doc as the reference case for preferring hooks over registry callbacks for
lifecycle: a registry only covers callers who opted in, a hook covers routes nobody anticipated.

Standing requests are unchanged and tracked. Good to hear `damageResolved` landed and that injury
automation rides it.
