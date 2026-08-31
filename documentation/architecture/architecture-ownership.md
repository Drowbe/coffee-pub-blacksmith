# Architecture: Module Ownership

**Audience:** anyone deciding which module a new feature belongs in.

when you build something new for the Coffee Pub suite, which module does it go in?

This exists because that question used to be re-argued from scratch every time. The rules below are not new policy — they describe what the suite already does when it is working correctly. Where the code disagrees with them, the code is the thing that is wrong.

---

## The suite in one line

**Blacksmith is the engine and the coordinator. Everything else is an experience.**

Blacksmith is a required dependency of every Coffee Pub module. It exists so that no satellite has to solve window chrome, toolbar registration, sockets, toasts, or compendium indexing more than once. It is deliberately being made *smaller* over time: Curator, Regent, and Cartographer were all extracted from it, and that direction continues.

A satellite module is a thing with opinions. Bibliosoph knows what an injury is. Squire knows what a character tray should show. Crier knows how a turn should be announced. Blacksmith knows none of that and must never learn it.

---

## The three rules

### 1. Content or opinion goes to a satellite. Plumbing goes to Blacksmith.

Ask: *does this thing have a point of view, or is it neutral machinery?*

| Has an opinion | Is machinery |
|---|---|
| What counts as an injury and how it heals | How an ActiveEffect gets created |
| Who the MVP of a combat was | Recording what happened in combat |
| How a turn announcement should read | Delivering a toast to every client |
| What a quest is | Storing and indexing journal pages |

If somebody had to make a design decision to build it, it is an experience. If it would look the same no matter what game you were running, it is plumbing.

### 2. UI belongs to Blacksmith only when it is the face of a Blacksmith registry.

Blacksmith owning UI is not a contradiction. When Blacksmith owns a registry, the canonical viewer of that registry is part of the service — leave it out and every consumer rebuilds it, badly and differently.

**Blacksmith may own:** the compendium search window (over `api.compendiums`), pin configuration (over the pins registry), toast send (over `api.toast`), GM notes (over the notes provider registry).

**Blacksmith may not own:** anything that renders judgment or content. If the window needs an `if (type === 'injury')` branch, the boundary has leaked and the experience is creeping back in.

A satellite may *also* build its own surface over the same engine. This is not duplication — it is the intended pattern. Blacksmith ships a general compendium search window; Squire ships a character-facing quick-add panel; both call `api.compendiums`. One engine, two surfaces, one index.

### 3. Consuming something Blacksmith owns means a thin adapter, never a reimplementation.

Never build a second cache, a second index, or a second copy of logic that Blacksmith already publishes. Wrap the API in one adapter file so an upstream signature change is one file to reconcile.

The reference implementation is Squire's `utility-compendium-search.js`, whose header states the rule better than this document does:

> Deliberately no local fallback that reads pack indexes directly: that would build a second index cache alongside Blacksmith's with independent invalidation, which is the whole reason the search belongs upstream.

---

## Extension points, not special cases

When a satellite needs Blacksmith to understand something Blacksmith must not learn, the answer is a registry. Blacksmith stores an opaque string or a callback; the satellite supplies the meaning.

| Registry | Entry point |
|---|---|
| Windows | `registerWindow` / `openWindow` |
| Toolbar tools | `registerToolbarTool` |
| Menubar tools | `registerMenubarTool`, `registerSecondaryBarItem`, `registerMenubarVisibilityOverride` |
| Effects classification | `effects.registerClassifier` |
| GM notes providers | `gmNotes.registerProvider` |
| Pins | `pins.registerPinType`, `registerPinTaxonomy`, `registerContextMenuItem` |
| Tags | `tags.register` |
| JSON import kinds | `importer.registerKind` |
| Toast channels | `toast.registerChannel` |

Toast channels are the model to copy. Bibliosoph declares `crit`, `fumble`, `injury`, and `social`. Blacksmith stores the strings and renders the labels in a settings checklist. **Blacksmith still has no idea what a critical hit is.** That is the shape every extension point should have.

---

## Blacksmith absorbs third-party variance; satellites never branch on it

Blacksmith is a required dependency. Everything else in a user's world — Midi-QOL, Times Up, DAE, whatever the table happens to install — is optional, and most users will not have it. That produces a hard rule:

**A satellite must never check whether a third-party module is installed, read its flags, or depend on its behavior.** A module that branches on `game.modules.get('some-module')?.active` has taken a dependency in all but name, and it will behave differently for every user depending on what else they run.

Where a third-party module genuinely changes the substrate, **Blacksmith is the adapter.** It detects the module, yields to it or supplies the baseline itself, and exposes one contract either way. The satellite never learns which happened.

The reference implementation is `utility-midi-resolution.js`: a runtime `enableMidiIntegration` check on every lane, explicit "yield to MIDI" branches, and core dnd5e fallback lanes when it is absent or switched off. Bibliosoph consumes `rolls.on('damageResolved')` and has never needed to know whether Midi-QOL is present.

Two consequences worth stating:

- **A non-goal list is a decision, not a default.** If a Blacksmith subsystem declines to adapt part of the substrate, the variance does not disappear — it lands on every consumer, unowned and invisible. That may still be the right call, but it should be made deliberately and written down with its reason.
- **"Optional module does X" is a finding, never a fix.** When a satellite discovers that some third-party module changes shared behavior, the correct output is a request to Blacksmith, not a workaround in the satellite.
- **A satellite often cannot even fail gracefully, which is why "just handle it defensively" is not an answer.** Worked example, verified 2026-08-07: two modules racing to delete the same Active Effect. The loser cannot suppress the error banner, because Foundry notifies from inside the socket response handler — `SocketInterface.#handleError` calls `ui.notifications.error` *before* `reject`, so a `.catch()` is strictly too late (`client/helpers/socket-interface.mjs`). A pre-flight existence check only narrows the window; it is time-of-check to time-of-use. The only remaining move is to not attempt the operation, which requires knowing the other module will — the forbidden branch. Where the substrate leaves no defensive option, arbitration is not a convenience the hub offers; it is the only place correctness can live.

## Prefer hooks over registry callbacks for lifecycle

A registry contract only covers callers who opted in. A Foundry hook covers every route, including ones nobody anticipated.

Bibliosoph's condition unwind is the reference case: it listens on `deleteActiveEffect` rather than exposing a "remove my effect" callback, so an injury's conveyed condition is cleaned up whether it was removed from Squire's status window, the actor sheet, the token HUD, or by its duration expiring. No caller had to know Bibliosoph exists.

Register a callback when a consumer needs to *ask a question* (what type is this? what should it be labelled?). Use a hook when you need to *react to a fact* (this was deleted; combat advanced).

---

## Worked examples

**Status effects window** — a grid of `CONFIG.statusEffects` plus a list of an actor's ActiveEffects. No content, no opinion, and it is the face of `api.effects`. → **Blacksmith.** Bibliosoph registers a classifier so its injuries render with a type and a source. Squire opens it with an actor. Neither learns about the other.

**Injuries** — authored content with severities, treatment DCs, tick damage, and expiry semantics. Nothing about it is neutral. → **Bibliosoph.**

**MVP scoring** — somebody chose a formula weighting damage against healing against saves. That is a judgment. → **out of Blacksmith**, even though the combat data collection that feeds it stays.

**Dice tray** — a roll UI over Foundry's own dice. A GM wants it, a player wants it, it has nothing to do with characters specifically. → **Blacksmith.**

**Health panel** — HP, death saves, party health at a glance. This is the core loop of a character tray. → **Squire.**

**Ad-hoc timed marker** ("dropped weapon, 3 rounds") — a named ActiveEffect with `duration: {rounds: N}`. No content, no opinion, pure plumbing over a core Foundry primitive. → **Blacksmith**, next to the conditions grid.

**Reputation, and what a merchant charges because of it** — the score is a number per scene with a band and a label, and everyone agrees what it means. → **Blacksmith.** What that score does to a price is a judgment about a shop's economy, and it belongs to whoever runs the shop → **out of Blacksmith.** The split is the whole point: a consumer reads `getPartyReputation()` and `getReputationScaleEntry()` and sets its own markups. `reputation.json` therefore carries labels, descriptions, and bands, and no pricing.

This one had a half-answer in the file for a while — a `merchantModifier` field, null in ten of eleven bands and `0` in the eleventh — which was worse than having nothing. A consumer cannot tell a delta from a multiplier by looking at it (read as a multiplier, `0` means every item is free), and a field Blacksmith publishes but does not fill implies Blacksmith intends to own it. **Publish nothing, or publish something you fill and use.** An unfilled field is a claim on someone else's decision.

---

## Anti-patterns

**Reaching for a "custom condition" when you want an instance.** A condition is *vocabulary* — a registered `CONFIG.statusEffects` entry, global and permanent, that rules can key off. An ActiveEffect is an *instance*. "Bob dropped his weapon for 3 rounds" is an instance. If you find yourself wanting to register global vocabulary to track one character in one fight, what you actually want is a faster way to create an instance.

**Solving it locally because the API is one call away.** The second implementation is always cheaper than the first and always more expensive than both.

**Letting Blacksmith keep something because moving it is work.** Stats is roughly 9,300 lines in Blacksmith today, about half of which renders or judges rather than records. That half is an experience living in the engine — the same state Curator and Regent were in before extraction.

---

## When the rules do not settle it

Two tie-breakers:

- **Does the satellite make sense without it?** If removing the feature leaves the satellite coherent, it was probably infrastructure.
- **Would a second module want this?** If yes and it has no opinion, it is Blacksmith's. If yes but it has an opinion, it is a satellite that the other module should depend on.

If it is still unclear, prefer leaving it in the satellite. Pulling something into Blacksmith later is easy; getting it back out is what this suite has spent years doing.
