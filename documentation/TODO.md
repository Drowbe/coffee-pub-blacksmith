# TODO - Active Work and Future Ideas

**Master list:** This file contains all todos referenced in architecture and API documentation. **Process:** When a task is completed, add it to **`CHANGELOG.md`**, then remove it from this file and from any completed-task language in API/architecture docs.

**Scope:** Blacksmith-only work. Cross-module cleanup that spans the Coffee Pub suite (doc/pack/table ownership, module extraction) lives in **`documentation/TODO-GLOBAL.md`**.

## CRITICAL - the importer is declaration-driven, and Blacksmith is consumer zero (opened 2026-08-23)

**This is a re-founding, not an increment.** It breaks every consumer on purpose and the value only exists
when they have all moved. Decided 2026-08-23 after reviewing the shipped registry against
`plans/plan-importer-api.md` and the live item path.

**The original goal, restated:** a module registers its shape; Blacksmith builds the prompt; the user
authors JSON outside the system; Blacksmith reads it, constructs whatever it is, and the module has access
to the new content. The four reasons it existed: every module was coding its own way to build an item or a
journal, and that code already existed in Blacksmith; every module did it differently; users were handed
prompts of completely different shapes; and the core shapes of items and journals turned out to be the
same, with the exceptions normalizable.

**What went wrong is now legible.** A kind registers *behavior* -- `onValidateEntry`, `onImportEntry`,
`onBuildPrompt`, `onBuildJsonTemplate`, `onBuildAuthoringGuide`. Five callbacks is five places for every
module to be different, so the API guarantees the divergence it was built to end. Measured against the four
reasons, callbacks answer none of them.

**A kind must register a declaration -- its shape, as data.** Blacksmith derives the JSON template, the
authoring guide, the prompt, validation, normalization, the document, the result envelope and the export
from that one declaration. Then: nobody builds, so nothing is built differently; two modules' prompts are
structurally identical by construction rather than by convention; and adding a field yields a new prompt
line, template entry, validation rule and export field without anyone writing code.

A declaration holds:

1. **Identity** -- kind, profile, label, host kind it extends, schema version.
2. **Fields** -- friendly name, type, required, allowed values, default, target path on the document, and one
   sentence of guidance. That sentence becomes both the guide line and the prompt line, so the two cannot
   drift.
3. **Shared parts by reference** -- `tags`, `xp`, `links`, `location`, `duration`, `gmNotes` named rather than
   redescribed. See the fragments section below.
4. **Document target** -- `documentName`, `type` (including a subtype string declared by another module), and
   destination rules.
5. **Options** -- schema / creative / import, the three scopes `plan-importer-api.md` already defines.

**Two things cannot be declared, and pretending otherwise is how this gets half-built again:** computed
content (Artificer's recipe body is generated HTML; our injury journal is assembled) and cross-entry work
(pins referencing quests, actor foundations linked after embedding). So one narrowly-scoped transform hook
over already-declared data *before* construction, and one post-create hook for cross-entry work.
**A module may shape its own data and may never call `create`.** The moment a module creates, gmNotes
preservation, destination, permissions, rollback and type preservation all stop being enforceable -- which
is the state we are in now.

### Blacksmith is the first consumer of its own API

**The recurring failure this rule exists to stop:** a module jumps through hoops to work with us while
Blacksmith takes a shortcut and duplicates the code. It is live inside the importer today --
`_failedPayloadEntries` (`window-json-import.js:505-516`) keeps its own copy of the array-or-object rule
instead of calling `parseJsonImportPayload`, and the item kind's validate and import paths pass *different
objects* to the same parser (`registry-json-import-items.js:404-410`). Both are shortcuts that produced real
divergence.

Concretely, and non-negotiably:

- Blacksmith's own four kinds register through the **same public `registerKind` path** an external module
  uses. No internal back door, no direct `kinds.set`, no privileged descriptor fields.
- A Blacksmith kind may not use a capability that is not exposed on `module.api.importer`.
- A Blacksmith declaration may not reference an internal import an external module cannot reach. Today
  `registry-json-import-items.js` imports our parsers directly; nothing external can.
- **The inverse failure is also live and also ends.** `prompts/prompt-item-partial-artificer.txt` and
  `prompts/prompt-item-profile-artificer.txt` are Artificer's shape hosted in Blacksmith's repo, and
  Artificer's flag skeleton is a hardcoded literal at `registry-json-import-items.js:255-265`. Under the
  declaration model Artificer declares that itself and we host none of it -- which also closes a module
  boundary violation.
- **Make it checkable.** `tools/check-importer-parity.mjs` fails if a Blacksmith kind touches anything not on
  the public surface. A principle nobody can run stops being true within two releases.

### What the item path already proves

The item importer is the half that stayed true to the goal and is the working reference. Blacksmith builds
the prompt (including Artificer's part), reads the JSON, merges any namespace from `flat.flags` generically
(`parse-item.js:900-905`), and creates the Item itself (`registry-json-import-items.js:409`). Artificer
contributes nothing at import time and reads its flags afterwards. `createArtificerItem`
(`coffee-pub-artificer/scripts/utility-artificer-item.js:143`) is their manual create-item form, not an
importer.

Two mechanisms there generalize and both are needed by journals, which have neither:

- **Namespaced flag passthrough** -- any `flags.<namespace>` merged verbatim, uninterpreted.
- **Native `type` + `system` passthrough** -- `isNativeFoundryItemData` / `prepareNativeItemForCreation`
  (`parse-item.js:725-747`) strips identity and placement fields and preserves everything else.

The second is the answer for a foreign subtype. Blacksmith can create a `coffee-pub-librarian.codex` page:
Foundry namespaces subtype *declaration*, not creation, and the registered TypeDataModel validates whoever
calls create. **Blacksmith never needs to know the model; it needs to not mangle it.** Today's journal
importer hardcodes `type: "text"` (`utility-common.js:410,485,600`). *Verify the creation claim in a live
world before building on it:* with Librarian enabled, from a Blacksmith macro, create a page with
`type: 'coffee-pub-librarian.codex'` and an empty `system`. If Foundry refuses, this section changes.

### Migration scope

Blacksmith's four kinds (item, actor, journal, rolltable), Librarian's two (codex, quest), and Artificer's
recipes and items. Squire's adoption is tracked in `plans/plan-squire-tool-adoption.md`.

**A half-migrated importer is worse than either end state**, and that is exactly what the repo is now: items
migrated, journals never started, and the contract unreadable from the code. Note that this contract has been
specified three times -- the architecture doc, `plan-importer-api.md`, and the shipped registry -- and each
specified something different. What is different this time is that Librarian is moving and every module has
to change regardless.

**The contract is written.** `plans/plan-importer-api.md` holds it, derived bottom-up by expressing all four
of Blacksmith's own kinds -- nineteen profiles -- against the model rather than by specifying it in advance.
That survey is what the three previous attempts skipped. Three profile forms came out of it (mapped,
rendered, passthrough) and nothing in nineteen profiles needed a construct outside the model.

### Build sequence

**Vertical slices, never a horizontal layer.** Each step leaves the module working, is verifiable on its
own, and the old path keeps running until the step that replaces it. The engine is a data transformation
with no world state, so most of it is assertable in `testing/suites/` -- which is the first time any part of
the importer has been. Add `suite-importer-declarations.js` in step 1 and grow it with each step; the
long-standing "no automated coverage" defect is fixed by the re-founding rather than alongside it.

**Steps 0 to 3 are done and verified live (2026-08-23); they are recorded in `CHANGELOG.md` and removed
from this list.** What exists now: the public registration path, a declaration registry that rejects a
malformed declaration at registration, derivation of the JSON template, shape validation and a dry
conversion check, the named transform library, document construction, and the Item `loot` profile live on
all of it. The Item importer routes an entry to the derived path when a declaration exists for its profile
and to the parser when one does not, so each remaining profile moves simply by being declared.
`testing/suites/suite-importer-declarations.js` grows with each step and stands at 55 assertions.

4. **The remaining seven Item profiles.** Weapon last, because it exercises every rule in the cross-field
   vocabulary; equipment brings nested `passiveEffects`, `const`, `generated` and the ancestor default chain;
   feature and spell bring the `consumption` transform.
   **Verify:** all six item fixtures import unchanged, and the Artificer flag block still round-trips --
   which is also when Artificer's prompt parts leave `prompts/` and Artificer declares them.

5. **Guide and prompt derivation.** After construction, not before: the field guidance sentences are only
   proven once the fields themselves are.
   **Verify:** a field added to a declaration appears in the template, the guide and the prompt with no
   other edit. That single check is the whole point of the model.

6. **Roll Table.** Second-simplest mapped kind; adds rule scoping and ordered array derivation, and moves
   `missingDocumentPolicy` from the payload to an import option with the payload form kept as an alias.

7. **Actor.** The passthrough form, and the move out of `blacksmith.js` into
   `registry-json-import-actors.js`. The `_`-prefixed scratch fields go away with converting once.

8. **Journal.** The rendered form, plus the passthrough seam items already have -- which is what lets
   Blacksmith construct a foreign subtype and what today's hardcoded `type: "text"` prevents. Folder
   destination and the in-place duplicate policy become declared rather than incidental.

9. **Fragments: `tags`, then `links`.** Both confirmed by more than one kind. `tags` first -- one applier
   call, and a wrong tag does not corrupt a document.

10. **Export derivation and the three completeness layers** (owner precondition, type-registration
    precondition, invalid-document refusal). This is what closes the import/export section below.

11. **`tools/check-importer-parity.mjs`, and only then a consumer.** Librarian's codex is a mapped profile
    and can be declared as soon as step 5 lands; their quest cannot until their own data model work does.

**Both verifications that were outstanding are now discharged (2026-08-24).** Invalid-document tracking *is*
populated on an embedded collection, so the export completeness guarantee has its independent source and step
10 needs no redesign; use `invalidDocumentIds` for the ids and a source-versus-collection count as the
cross-check. And Librarian will build quests against declarations rather than giving them their own data
model first, so step 8 is not waiting on them and their timeline does not shape ours.

**How to verify:** all four Blacksmith kinds are declarations registered through the public path, and
`node tools/check-importer-parity.mjs` passes. Every fixture in `testing/data/import-json/` still imports.
A field added to a declaration appears in the template, the guide, the prompt and the export with no other
edit. Artificer's prompt files are gone from `prompts/` and Artificer supplies them.

## CRITICAL - importer defects that survive the re-founding (opened 2026-08-23)

Confirmed in the source 2026-08-23. The double-conversion defect is absent here because it disappears with
`onImportEntry`; these do not.

- **The structured error envelope is always empty.** `issueFromError` reads `error.code`, `error.path` and
  `error.details` (`registry-json-import.js:114`) and every kind throws a plain `Error`, so `code` is
  permanently `VALIDATE_FAILED` or `CREATE_FAILED` and `path`/`details` are always blank. The shape is
  already specified in `plan-importer-api.md`. Under declarations most errors become derived (a field that
  fails its declared type knows its own path), so build the typed issue helper as part of the engine rather
  than asking kinds to throw richly.
  **How to verify:** import a roll table fixture with `results` deleted; the row names a specific code and
  the offending path.

- **Validation is parallel and import is sequential.** `Promise.all` at `registry-json-import.js:181` against
  the `for` loop at `:191`, so a validator touching shared resolver state can behave differently under
  Validate than under Import. Make validation sequential unless there is a measured reason not to.
  **How to verify:** validate then import `actor-import-character.json` as a three-entry array; warnings match
  exactly.

- **Retry duplicates parse logic and breaks on envelopes.** `_failedPayloadEntries`
  (`window-json-import.js:505-516`) re-parses raw text with its own array-or-object rule instead of calling
  the registry parser, then maps result indices into it. Given an envelope payload, `entries` is `[envelope]`,
  so index 0 resolves to the whole envelope and 1..N resolve to `undefined` and are filtered away: **Retry
  Failed and Edit and Retry silently retry one wrong object and drop the rest**, with no error and a
  plausible result screen. Retry must go through the same unwrap, and payload context must be held on the
  window rather than round-tripped through the textarea.

- **Actor is the only kind registered inside the god module.** ~75 lines at `blacksmith.js:3095-3160`, its
  kind id a local `const` rather than an exported constant, and the only kind whose import rolls back
  (`await created.delete()`). Under declarations the rollback question is settled centrally -- Blacksmith
  creates, so Blacksmith rolls back, for every kind.

- **A published doc links to a held one.** `api/api-importer.md` is in `PUBLISH` (`tools/wiki-sync.mjs:54`)
  and links `../architecture/architecture-importer.md`, deliberately held (`:107`). Live broken wiki link.

- **The architecture doc is largely unbuilt, in present tense**, and will need reconciling to the declaration
  model wholesale. That is also its publish gate.

- **No automated coverage at all** -- no suite, no check, no testing doc, against 12 fixtures already in
  `testing/data/import-json/`. **Do not build a suite against the callback importer.** It would assert a
  contract being replaced, which is the failure the harness header warns about: a harness asserting a stale
  contract manufactures confidence. `suite-importer-declarations.js` arrives with step 1 of the build
  sequence above and grows with each step, which is why coverage is listed here as a defect but scheduled
  there rather than fixed on its own. The current importer stays unasserted for the length of the migration;
  that is deliberate, and its existing fixtures are the migration's regression evidence instead.

The export half has its own section below (**Import/export and module-owned document subtypes**). Its
constraints are unchanged and the declaration model is what finally makes them enforceable: export inverts
the same declaration, so `type` preservation and round-trip equivalence become assertions rather than hopes.

## Importer: the shared parts are ours, and they are declared by reference (opened 2026-08-23)

**The overlap between modules is not coincidence.** Comparing Librarian's codex and quest payloads against
our four kinds, the fields that recur across modules are, with few exceptions, the fields Blacksmith already
owns a subsystem for:

| Recurring part | Owned by |
|---|---|
| `tags` | `api.tags` -- its context key is already `{moduleId}.{dataType}` |
| `reward.xp` | `architecture-xp.md` |
| scene pin coordinates | `api.pins` |
| `links` / `related` -- names resolved to documents | `api.compendiums` canonical resolver |
| `timeframe.duration` | world clock / calendar |
| `visible`, ownership | `architecture-ownership.md` |
| `flags.coffee-pub-blacksmith.gmNotes` | `api.gmNotes` -- already a mandatory preservation path |
| `name`, `img`, `category`, `description` | nobody; genuinely generic identity |

So a **fragment is the authoring shape of a Blacksmith subsystem**, declared by name rather than
redescribed. We own it because we already own the API behind it, and every module that names it gets
identical parsing, validation, prompt wording and application -- which is why a tag means the same thing in a
codex entry, a quest and an item.

**The tags case is live, not hypothetical.** `api-tags.md` states assignments live in a Blacksmith world
setting and consuming modules do not store tags in their own record data -- its worked example context key
is `coffee-pub-librarian.quest`. Librarian's export nonetheless emits `tags` inline per entry. On import that
array must be applied through `TagsAPI.setTags(contextKey, recordId, tags)` (`api-tags.js:35`) after
creation, not written into the page.

A fragment supplies four things:

1. **Schema** -- field names and types.
2. **Normalizer** -- friendly to canonical, once, for everyone (`TagsAPI.normalize` exists).
3. **Authoring text** -- the template block and the prompt paragraph, so every module describes the part in
   the same words instead of each inventing wording a model then reads differently.
4. **Applier** -- writes through the owning Blacksmith API after construction.

**Build exactly one fragment end to end first -- `tags`.** It is already a subsystem with an API and an
architecture doc, it appears in both Librarian kinds, its applier is one call, and a wrong tag does not
corrupt a document. Extend to XP and pins only if the seam holds. Fragments are opt-in and never exclusive:
a module meaning something else by a word simply does not name the fragment. **A shared fragment is API
surface** -- version it from the start, because changing one breaks every module that named it.

**How to verify:** a Librarian quest imported with `tags` in the payload has no tags in its page data and the
correct tags under context key `coffee-pub-librarian.quest`; the same tag on one of our items resolves to the
same normalized string; a GM rename propagates to both.

## Importer: consumer migration and the fixtures we have (opened 2026-08-23)

**Librarian is the forcing function.** They are replacing ~600 lines of duplicated import dialog across
codex and quest, have already extracted their codex import into callback-shaped functions
(`coffee-pub-librarian/scripts/import-codex.js`), and asked to build against a branch. **They must not be
given the callback contract** -- `onImportEntry` has never been used by an external module, so Librarian
would be the first, and the pattern this effort exists to kill would be re-institutionalized through the API
built to end it. Send them the declaration contract instead.

Settled with them 2026-08-23 and still true under declarations:

- **Two profiles, not one** -- codex and quest are separate journals, separate settings, separate page
  models. Both extend the `journal` kind.
- **Discrimination is declared, and `description` is not a discriminator** -- it is the quest body field *and*
  the legacy codex name for `summary`, so anything keying on it gets the two backwards. Quest-only:
  `tasks`, `reward`, `timeframe`, `status`, `visible`. Codex-only: `summary`, `related`, `expandedDetails`,
  `links`.
- **Their two profiles are disjoint by construction**, so a payload matching neither is an *orphan* that
  falls through, not a collision. Ambiguity detection still gets built defensively; testing it needs a
  throwaway third profile.
- **Envelopes: a payload is not always a list of entries.** Their quest export is
  `{ kind, exportVersion, quests: [...], scenePins: {...} }`, and `parseJsonImportPayload` turns a non-array
  object into `[parsed]` (`registry-json-import.js:62-93`), so it arrives as one entry rather than N.
  **Invisible from inside our four kinds -- all four are top-level arrays.** The declaration must be able to
  describe an envelope: which key holds the entries, and what sibling data travels alongside.
- **Sibling data must survive to the end of the run**, reaching construction and post-create. Post-create work
  that cannot complete must warn into the result envelope, not the console -- their case is a pin whose quest
  failed to import, and separately a pin referencing a quest absent from the payload entirely.
- **Do not justify envelope context on their `scenePins`.** They reported 2026-08-23 that their pin export
  reads a legacy scene flag nothing writes any more -- live pins moved to our Pins API -- so in a real world
  it emits `{}`. Their envelope fixture is reconstructed, not captured. The justification is the general case
  plus a batch-level resolution cache; their live world holds 342 codex entries resolving compendium links
  per entry. If their export is fixed the shape changes: `questUuid`, `x`, `y`, `objectiveIndex` are the
  stable core.
- **An envelope-level `kind` is diagnostic only, never dispatch.** They will emit
  `"kind": "coffee-pub-librarian.quest"` so a disabled-module message can name the owner, while declared
  discrimination stays the only route in.
- **Progress reporting throttled on elapsed time (100-150ms), not every Nth entry** -- per-entry cost is not
  uniform and entries hitting compendium resolution are dramatically slower, so a count-based throttle looks
  stalled through a slow stretch. `_buildSelectedPrompt` already threads `onProgress` into the prompt builders
  (`window-json-import.js:423`); the import loop has nothing.
- **Import options become a real category with a first consumer** -- `plan-importer-api.md` defines them
  (Import JSON tab only, unlike prompt-side `promptCheckboxes`) and none are built. Librarian's is a single
  "place canvas pins" boolean.

**Artificer migrates too, in both directions.** Its recipe import is a wholly parallel pipeline -- own window
(`window-artificer-recipe-import.js`), own parse, own normalizers, own `resolveItemByName` with its own
compendium priority setting and cache, own result reporting, pages created as `type: 'text'` -- in a module
that already requires Blacksmith and registers its Import Recipes button on our menubar
(`artificer.js:314`). It uses Blacksmith to render the button that opens its own importer. Its *item* path is
already correct and becomes the reference; what moves is that Artificer declares its own shape instead of us
hosting it.

**Fixtures Librarian supplied**, in their repo at `coffee-pub-librarian/testing/`:

- `fixture-import-orphan.json` -- three entries matching neither profile, exercising fall-through. The third
  isolates the `description` trap. Entry 2 is annotated "every field here is one BOTH kinds use", which makes
  it a written inventory of the cross-module shared surface and a direct input to the fragment list above.
- `fixture-import-quest-envelope.json` -- envelope with `kind`, three quests (one failing on an empty `name`),
  two scenes and four pins, two orphaned in different ways. Reconstructed rather than captured.

Two unresolved discrepancies to settle with them: `exportVersion` is `2` (number) in their message and
`"1.1"` (string) in the fixture; and the fixture pins carry `questIndex` and `questCategory`, which are not
in the stable core they named.

**How to verify:** Librarian declares codex and quest profiles against the `journal` kind and writes no
construction code. Codex Entry appears in the Journal importer's template dropdown; pasting codex JSON
creates pages of type `coffee-pub-librarian.codex` built by Blacksmith; pasting area JSON in the same batch
still routes to our profile. `fixture-import-orphan.json` fails all three entries with a fall-through message
and the description-trap entry is not claimed by quests. `fixture-import-quest-envelope.json` unwraps to
three entries, imports two, and reports both orphaned pins as warnings in the envelope. Retry Failed retries
exactly the failed quest and preserves sibling data. With Librarian disabled the payloads refuse legibly,
naming Librarian from the envelope `kind`. A 342-entry codex import re-renders their panel once and reports
progress on a time-based throttle.

## CRITICAL - the window framework does not own the frame, and we are building on it

**Plan: `documentation/plans/plan-window-framework.md`** (opened 2026-08-16). Not started.

The window API provides a zone contract and base classes; the consumer owns the markup. **Of 15
`BlacksmithWindowBaseV2` subclasses in Blacksmith, 4 render `window-template.hbs`.** Two header systems
exist, and the button vocabulary is used by 3 of 15.

**Why critical rather than tidy:** on 2026-08-16 the roll window rendered *Regent's* copy of its header,
because `Handlebars.partials` is a global namespace, both modules registered `partial-unified-header`, and
both registrations `await` a fetch -- so the winner was a race. It presented as a layout bug, logged
nothing, and changed between loads with no edit to either file. Blacksmith's side is fixed by namespacing;
the conditions that produced it are not.

Every window shipped against the current contract is another copy of the frame to migrate later.

**Audit every module.** Minstrel and Artificer are the most complex by leaps and should be surveyed FIRST,
not last: a frame validated only on simple windows will fail on them after everything else has moved.

## Something writes an invalid `properties` value onto items created on NPCs (opened 2026-08-21)

Noticed while fixing the inventory merge predicate, and left open because that fix does not depend on it.

An item created on an NPC with no `properties` in its payload stores `properties: ["gear"]`; the identical
payload on a character stores `[]`. `"gear"` is not a valid property for either -- `validProperties.loot` is
`Set(["mgc"])` (`dnd5e.mjs:45532`, dnd5e 5.3.3) -- and it lands on `container` items too, so whatever does
this is not type-specific.

**Not us, and not the obvious suspects.** No Coffee Pub sibling writes `system.properties`. Nor do the other
installed `preCreateItem` hooks: chris-premades, DAE, and automated-conditions-5e are all clean on it, and
`midi-qol.js` contains no `gear` string at all.

This is invalid data sitting in a live world rather than a broken feature, which is why it is filed rather
than chased. **The way in, when someone does chase it:** register a temporary `preCreateItem` hook that logs
`item._source.system.properties` on entry. That separates "already present when the hook chain started" from
"written by something in it", which is the fork the whole search turns on.

## World clock: a Scene Config notice for clock-driven darkness (opened 2026-08-16)

The darkness driver has shipped (see `CHANGELOG.md` and
`documentation/architecture/architecture-worldclock.md`). One piece of it was deliberately left out.

**A GM who opens Scene Config on a clock-driven scene sees the Darkness Level slider sitting at a value
they did not set, with nothing saying why.** The right-click menu on the world clock reports the state, but
that is not where a GM is looking when they are looking at the slider. A short notice in the Lighting tab
-- "darkness on this scene currently follows the world clock" -- closes that gap.

**Why it was deferred rather than built:** it means injecting into `renderSceneConfig`, and on the day the
driver was written that exact surface was actively unstable in a sibling module -- Artificer's own Scene
Config tab was disappearing between reloads from a render race against Foundry's `_replaceHTML`. Adding a
second injector to a surface already misbehaving would have made both harder to diagnose. Blacksmith
currently has **zero** references to Scene Config, which is worth keeping true until there is a reason.

Whatever does this should read the same scene flag the driver uses (`DarknessManager.FLAG`) rather than
inventing a parallel one, and must survive the sheet re-rendering underneath it.

## World clock: what is left (opened 2026-08-16)

Built and in `CHANGELOG.md`: the clock, its controls, the sky panel, drag-to-scrub, the tooltip, the
darkness driver, the schedule API (`api.worldClock.schedule`), rests moving the clock, and the clock menu
(Rest, Set Time, Set Date, Options). Architecture in
`documentation/architecture/architecture-worldclock.md`, API in `documentation/api/api-worldclock.md`.

**Ideas, not commitments.** Several of these are placement questions rather than build questions.

### 1. The interruptible rest -- the one genuinely novel thing

A long rest the clock drives, interruptible partway. **Planned in
`documentation/plans/plan-interruptible-rest.md` (written 2026-08-21)** -- the constraint that shapes it,
the missing primitive, the open questions, and four phases. Read that rather than restating it here.

**What interrupts it, decided by the author 2026-08-22:** every N in-world hours the rest triggers a GM
roll for an encounter -- goblins spot the camp in the night. On a hit the rest **ends early and the party
gets partial credit**, which is the whole reason the recovery cannot run up front.

Two consequences for the design:

- **Partial credit is a third outcome**, alongside completed and abandoned. The plan currently says an
  interrupted rest gives nothing; that was the simple reading and it is now wrong. What "partial" means in
  dnd5e terms -- some hit dice, no slots? a fraction of the duration? -- is the open question, and it is a
  rules decision rather than a code one.
- **The encounter roll is pluggable, not ours.** A setting picks the plain roll or, when installed,
  Bibliosoph's encounter tool. Blacksmith fires the moment and asks; what an encounter *is* stays content,
  and content belongs in a sibling. Feature-detect rather than depend.

The short version, so this list still reads: what is missing is not the surface but the primitive --
advance world time gradually and let it be interrupted -- and the rule that decides the design is that an
interrupted rest is not a rest, so recovery runs only on completion.

**Phase 1 is now half-built.** `TimeDriver` (`manager-time-modes.js`) already advances world time in
real-time commits, on one elected GM, carrying fractional seconds. What the rest adds is a *target* and an
interrupt: the driver runs open-endedly today. That is a smaller phase 1 than the plan assumed, and the
plan should be read with that in mind.

### 2. Already done, recorded so nobody rebuilds it

**The rest is finished, end to end** -- the rest window, one card per character carrying both the
pre-rest state and the result, player-rolled foraging, and provisions decided per rest. See `CHANGELOG.md`
and `documentation/architecture/architecture-rest.md`.

**Food, water and exhaustion are finished** -- see `CHANGELOG.md`. Exhaustion needed no code at all:
dnd5e automates the modern rules itself once `rulesVersion` is set to "modern"
(`dnd5e.mjs:37158`, and the condition is configured `levels: 6, reduction: { rolls: 2, speed: 5 }`), and a
long rest already removes a level through `exhaustionDelta`. **Confirm that setting is "modern" in this
world** -- it is the whole feature.

### 3. Weather -- a sibling

**Narrative first**, with FXMaster optional rather than assumed: the text is what a table remembers, and it
keeps weather from depending on a specific animation module. Unblocked by the schedule API -- a weather
feature registers a `dailyAt` and never needs to know how the clock works.

### 4. Calendar events and dated reminders -- a sibling

Festivals, holidays, anything dated, and the GM reminder that motivates it: "the wizard's scroll is ready"
set three in-world days out and surfacing on its own.

**The trigger already exists and needs nothing.** `worldClock.schedule({ at })` takes an absolute world
time in seconds and fires once (`api-worldclock.md`). Turning a date into that number is core's job and is
already available -- `game.time.calendar.componentsToTime({ year, month, day, hour, ... })`; the clock
already uses its inverse `timeToComponents` for drag-to-scrub (`manager-worldclock.js:1180`).

**Two things were missing, and one is now half done:**

1. **Persistence -- still open, and it is the whole of the work.** Schedules are in-memory and explicitly
   *not a queue*: nothing fires retroactively, and a one-shot whose moment passed while the world was closed
   is missed. A reminder set three days out must survive a reload, so it needs a store and re-registration
   on `ready`. Where events live is the open decision -- see the plan below.
2. **Authoring -- a first draft shipped 2026-08-21.** `scripts/window-calendar.js` renders the month grid,
   pages, marks today, and lets a GM jump the world to a day. It has no events in it yet, which is exactly
   the half that waits on (1). See `documentation/plans/plan-calendar-window.md`.

So this is a store plus a view over a firing mechanism that is already built and documented. Worth knowing
before anyone scopes it as a clock feature -- it is not one.

### 5. A morning briefing -- last, wherever it lives

State of the party plus weather. Wants 3 and 4 to exist first, so it is last regardless of placement.

### Placement

Which sibling owns weather, events and briefings is cross-module work and moves to
`documentation/TODO-GLOBAL.md` once decided. The rule that put the darkness driver in its own file applies
to all three: they are features that consume the clock, not parts of it.

## Advantage/disadvantage discards a built formula's keep modifier (opened 2026-08-16)

**Reported from play:** build `4d6kh3` in the dice tray, click Disadvantage, and the `kh3` is gone.
Normal works; the advantage and disadvantage buttons are what lose it.

**The mechanism is confirmed in source, the behaviour is not yet verified in a world.**
`manager-rolls.js:902-903` handles the `dice` roll type by *replacing* the formula outright:

```js
if (options.advantage) diceFormula = '2d20kh';
else if (options.disadvantage) diceFormula = '2d20kl';
```

Every other roll type does the same thing (`:605`, `:668`, `:727`, `:753`, `:837`, `:959`), but for those
the base roll genuinely is a d20 and replacing it is right. For a dice-tray formula it throws away what the
user built -- not only `kh3` but the dice themselves, so `4d6kh3` becomes `2d20kh`.

**What to decide before fixing**, because the fix depends on the answer and it is a rules question rather
than a code one: what does advantage *mean* for an arbitrary formula? Doubling the first dice term and
keeping highest is one reading; rolling the whole expression twice and taking the better total is another,
and they give different distributions. dnd5e itself only defines advantage for a d20 test.

Options worth weighing:
- **Disable advantage/disadvantage for the `dice` roll type** and say why in the UI. Honest, smallest, and
  arguably correct since the concept is not defined for an arbitrary formula.
- **Apply it to the leading dice term only**, leaving the rest of the expression intact.
- **Roll twice, keep the better total.** Closest to the intent, furthest from the current code.

Related and already decided: the roll configuration window deliberately offers no keep-highest/keep-lowest
buttons, because advantage and disadvantage are the three buttons in its footer and two controls reaching
the same ruling can disagree. That decision is why this bug cannot appear there -- it is the dice tray's
alone.

**How to verify:** open the dice tray, build `4d6kh3`, click each of Normal, Advantage and Disadvantage,
and read the resulting formula in the chat card. Normal should keep `4d6kh3`; today the other two do not.

## Import/export and module-owned document subtypes (opened 2026-08-09, before the phase starts)

**Settle this before writing importer code, not after.** Raised by Squire while closing the tool adoption;
the codex/quest domains have since moved to Librarian, which is where the subtype lives now.

**The import half is settled.** `module.api.importer` exposes the kind registry, and a kind supplies its own
`onImportEntry`, so the owning module constructs its own documents and Blacksmith never sees the subtype. What
remains below is the export half, plus the refuse-legibly behaviour of Blacksmith's *own* journal importer when
it meets a subtype it does not own.

Librarian declares a document subtype in its `module.json` -- `documentTypes: { JournalEntryPage: { codex: {} } }`
-- so every codex entry is stored as `type: "coffee-pub-librarian.codex"`. Blacksmith declares no subtypes, and
today's journal importer writes `type: "text"` (`scripts/utility-common.js:410,485,600`), so nothing is broken
now. Extending import/export to codex pages is what makes it a question.

**One option is off the table on mechanics rather than principle.** Foundry namespaces a module-declared
subtype as `${module.id}.${subtype}` (`client/applications/settings/dependency-resolution.mjs:246`). Blacksmith
*cannot* declare `coffee-pub-librarian.codex`; putting `codex` in its manifest would produce
`coffee-pub-blacksmith.codex`, a different type with no data model or sheet registered against it. So the
importer stays agnostic. That is forced, not chosen.

What agnostic has to mean, concretely:

- **Preserve `type` verbatim on both sides.** An export that normalises a subtype to `text` silently
  downgrades every codex page on the round trip, which looks like success.
- **Check before writing, and refuse legibly.** An unknown subtype should produce a message naming the module
  that owns it -- parsed from the prefix -- not a raw validation throw and not a silent skip.
- **Export with the owner disabled is the dangerous direction, more than import.** Pages of an unregistered
  subtype are refused at world load, so they are absent from `game.journal` entirely. An export would then
  produce a file missing every codex page and report success. Import at least fails loudly.

**It also changes how this phase gets verified.** "Load with the satellite disabled" has been the backbone of
both tool phases, and it worked because none of those four tools read journal pages. It cannot be the pass
condition here -- with Librarian off, the codex pages under test do not exist. It becomes a *test case* instead:
disabled proves the importer refuses legibly and the exporter does not quietly omit, while the round-trip pass
condition needs Librarian enabled.

## Player-facing messages should be toasts, not Foundry notifications (opened 2026-08-20)

Raised while verifying the movement restrictions: blocking a player's move warns through
`ui.notifications.warn`, which is Foundry's chrome in Foundry's voice, while the movement-mode *change*
two hundred lines earlier announces itself through `ToastAPI.show` with our icon and styling. One file,
two vocabularies, and the one the player sees more often is the borrowed one.

**Scope, measured 2026-08-20:** 194 `ui.notifications.*` calls across 31 files in `scripts/` -- 94 `warn`,
61 `error`, 39 `info`. Heaviest are `window-skillcheck.js` (19), `ui-journal-pins.js` (18),
`window-stats-party.js` (18), `token-movement.js` (16). There is a second producer: the `blnNotification`
flag on `postConsoleAndNotification` routes to `ui.notifications` at `api-core.js:1519-1548`, so any
sweep has to decide about that path too or the two will drift.

**This is not a find-and-replace, and the sorting is the work.** Three categories, and only the first
should move:

- **Player-facing feedback on an action they just took** -- "only the leader can move tokens", "you can
  only move during your turn". This is our feature speaking, and it should look like it. Toast.
- **Errors a GM must acknowledge**, especially ones that persist or report a failure they need to act on.
  A toast auto-dismisses; that is the wrong shape for something the user must not miss. Probably stays.
- **Developer and debug output** riding `blnNotification`. Not user-facing messaging at all. Stays.

**Order it after toast presets** -- see the entry in `TODO-GLOBAL.md` raised by Merchant. Without a
warning/error/info preset vocabulary, converting call sites means choosing a colour at each one, which is
how 194 sites become 194 slightly different palettes. Presets first, then this becomes mechanical.

`token-movement.js` is the natural first file: it already contains both idioms, so the diff shows the
before and after side by side, and the movement warnings are as player-facing as the module gets.

**Verify:** set movement to Locked, drag a player-owned token as a player -- the refusal appears as a
Blacksmith toast with our icon, and nothing is logged twice. Then confirm a GM-facing failure still
raises the notification it did before.

## Player frame rate - investigate before optimising anything (opened 2026-08-20)

**Not started, deliberately.** Recorded so the next person starts from what is known rather than from a
guess. Nothing here is a confirmed defect in this module.

**The observation.** In the 2026-08-19 session the GM ran at 30-45 fps with a max framerate cap set, and
two players reported slow graphics -- one at roughly 10 fps, on a MacBook Pro several years old.

**What Blacksmith actually runs per frame.** `manager-token-indicators.js` is the only file that adds
callbacks to `canvas.app.ticker`: the turn-indicator pulse (`:591`), target rings (`:968`), and two bounded
fade animations. Everything else in the module is event-driven or on a one-second interval -- the menubar
timers (`api-menubar.js:4962`) and the journal watchdog. The combat bar's `requestAnimationFrame`
(`manager-combatbar.js:412`) is a scroll easing that terminates itself. So the per-frame surface is small,
but it is real, it is GPU-side, and it scales with token count.

**Three world settings gate all of it**, which makes a clean A/B for one session: `generalIndicatorsEnabled`,
`targetedIndicatorEnabled`, and `tokenBloodEnabled`. Blood is the heaviest -- a pool per wounded token.

**The ratio argues against this module being the primary cause, and that is the trap.** 45 to 10 fps is a
4.5x gap between two machines. JavaScript work rarely produces that spread; GPU fill rate does, and a
Retina display renders about 4x the pixels unless Foundry's pixel ratio is capped -- which matches the
observed ratio almost exactly. **Rule out the client and the scene before profiling module code**, or the
first plausible module finding will get the blame and the real cause will survive.

Order to check, cheapest first:

1. The slow player's browser: Chrome rather than Safari, and hardware acceleration actually on
   (`chrome://gpu`). Acceleration silently off means software rendering, and 10 fps is its signature.
2. Foundry's own Performance Mode and max framerate **on that client** -- this is where the Retina pixel
   cost is controlled.
3. Scene cost: fog exploration on a large scene, wall count driving dynamic vision, animated tiles or token
   textures. These hit players harder than the GM, whose vision and fog are often effectively bypassed.
4. Only then bisect modules -- all off but core and dnd5e, note the number, enable in halves.

**One gap we own.** The blood system's idle performance check has never been run; it is still listed under
the token blood entry above as "no per-frame cost when idle (check with the perf monitor)". Of the three
settings named here, that is the one where we genuinely do not know the cost.

**Verify:** a number before and a number after, on the same client and the same scene. `9B.4` in
`architecture/architecture-blacksmith.md` has the profiling method; the answer to this item is a
measurement, not a change.

## Asset sources - let a module supply the image library, and let users remap it (opened 2026-08-09)

**The idea:** image choices in settings (backgrounds, icons, nameplates, and sounds alongside them) should be
able to come from Coffee Pub Vault when it is installed and selected, and a user should be able to point the
same choices at their own library instead of ours.

Vault already declares itself "optional assets for the Coffee Pub suite, integrated via Blacksmith"
(`coffee-pub-vault/module.json`), and it currently ships three scripts and no integration. Blacksmith
already has most of the machinery: `AssetLookup.dataCollections` holds `backgroundImages`, `icons`,
`nameplates`, and `sounds`; `settings.js:703,726` build the dropdown choices from it; `refreshAssetDerivedChoices()`
rebuilds them; and `loadAssetBundlesWithOverrides()` in the `ready` sequence already merges optional
per-category JSON overrides on top of the default bundle. So this is closer to finishing a pipeline than
starting one.

**The design constraint, which is the part worth getting right:** Blacksmith must not name Vault. The hub
cannot hardcode a sibling that may not be installed - the same rule that produced the `party-health` intent
and the `blacksmith-status-effects` window id. So the shape is a **registration API**, something like
`blacksmith.registerAssetSource(sourceId, { label, collections })`, with Vault as the first consumer and
nothing in Blacksmith aware of it by name. A user's own library is then the same mechanism reached through
a settings path rather than a module, which is why "Vault as a source" and "remap to my own images" are one
feature and not two.

Open questions to settle before building:

- **Do sources merge or replace?** A user pointing at their own icon set probably means "instead of", while
  Vault probably means "as well as". If both, precedence has to be explicit and visible in the settings UI,
  not implicit in registration order - the menubar intent system resolves ties by registration order and
  that is already a known rough edge.
- **What is the unit a user remaps?** A whole collection, or an individual asset? Per-asset remapping is
  what "my own version of that image" most likely means, and it is a different data shape from a source.
- **How does this relate to the existing Asset Mapping overrides?** There is already a per-category JSON
  override path. If it can carry this, most of the work is a UI and a registration front door rather than a
  new pipeline; if it cannot, decide whether it survives.
- **Sounds too?** `dataCollections` treats them alike and Vault ships both, so splitting them here would be
  arbitrary.

**How it will be verified:** with Vault installed and registered, its images appear in the background and
icon dropdowns and a chosen one renders. With Vault absent, the dropdowns are exactly what they are today
and nothing logs. With a user library configured, its entries appear and take the precedence the settings
say they do.

## Stylesheet cleanup - retrofit the neutral overlay tokens (opened 2026-08-08)

**Author has flagged stylesheet cleanup as a critical effort soon; this is the piece of it that is now
mechanical.** Four neutral overlay tokens were added on 2026-08-08 - `--blacksmith-border-hint`,
`--blacksmith-border-subtle`, `--blacksmith-fill-hint`, `--blacksmith-fill-subtle` - because the token set had
no translucent neutral at all. Only the context menu icons use them so far.

**The scale, measured rather than estimated:** `styles/*.css` contains 1395 `rgba()` declarations, of which
**570 are neutral white or black overlays**. None were tokenised. They cluster hard on a handful of alpha
values, which is what the four token values were chosen from:

| Value | Uses |
|---|---|
| `rgba(255,255,255,0.9)` | 45 |
| `rgba(0,0,0,0.1)` | 40 |
| `rgba(0,0,0,0.2)` | 33 |
| `rgba(255,255,255,0.2)` | 27 |
| `rgba(255,255,255,0.1)` | 23 |
| `rgba(255,255,255,0.08)` | 18 |

**Why it is worth doing:** a theme change is currently 570 edits across ~50 stylesheets. Tokenised, it is four.
And the absence of a translucent neutral token is what caused a real bug - the context menu icons were given an
opaque `--blacksmith-surface-dark-3` border because it was the only token that read as a border colour, and it
drew a visible box around every row instead of hinting an edge.

**Why it is not trivial:** it is a visual-risk sweep, not a find-and-replace. Notes before starting:

- The four tokens are white overlays. The 570 include **black** overlays too, which are doing a different job -
  darkening rather than lightening - and want their own tokens rather than being forced onto these.
- Not every literal should become a token. A one-off value tuned for a specific surface is legitimately a
  one-off; the win is on the clustered values.
- The alpha values above are the *current* clustering, not a target. Some of those 45 uses of `0.9` are text
  colour rather than an overlay and belong with the text tokens instead.
- `node tools/check-design-tokens.mjs` gates this: every token in `vars.css` must be documented in
  `design-system/design-tokens.md` and vice versa, both directions, exact values.
- There is no automated visual check, so verification is opening the affected windows. Sweep one stylesheet at
  a time rather than all of them, or a regression is unattributable.

Start with the highest-count values in the most-used sheets, and stop tokenising as soon as the values stop
repeating.

## Window presentation is per DEVICE and should be per USER (opened 2026-08-11)

**The rule, stated by the author:** favourites, sorting, and window sizes are *user* settings - remembered
for a person across every device they log in from. Notes favourites (`favoriteNotes`) and the notes list
sort (`notesSort`) already are, as flags on the User. Window presentation is not.

`BlacksmithWindowBase` writes position and size to **`localStorage`** (`window-base.js`, `_positionKey`), and
`BlacksmithToolWindowBase V2` does the same for the tool theme and title-bar mode
(`_toolThemePreferenceKey`, `_toolTitlebarPreferenceKey`). So a GM who moves a window on the desktop client
finds it back at its default on a laptop, and their chosen light/dark theme does not travel either.

Moving it to user flags is the fix, but it is not a find-and-replace:

- **Writes become async.** `localStorage.setItem` is synchronous and is called from drag/resize handlers;
  `User#setFlag` is a document update. It needs debouncing or a drag will fire an update per frame.
- **Reads happen before `ready` in places.** A flag read needs `game.user` to exist; localStorage does not.
- **Existing values must migrate**, once, per key - there is already a `migratePositionKey` helper for the
  old-key-to-new-key case that shows the shape.
- **Six windows carry position keys** today, plus whatever the satellites set through the same base.

Decide whether `windowPositionKey` stays the storage key or becomes a flag path before starting; that
choice is what makes the migration one pass or several.

## Overall party reputation, for external consumers (opened 2026-08-10)

Reputation is per-scene and nothing aggregates it. The API is `getPartyReputation(scene)`,
`setPartyReputation(value, scene)`, `getReputationScaleEntry(value)`, and the two chat cards; storage is
`blacksmithPartyData.scenes[sceneId].reputation`. Squire shows the current scene's value and wants an overall
one, so this is **API surface, not an internal helper** - get the shape right rather than widen it later.

**The trap is that 0 is both "neutral" and "never set".** `getPartyReputation` returns 0 for a scene with no
entry, and 0 is also the dead centre of the -100..+100 scale. A naive average over `game.scenes` drags toward
zero in proportion to how many scenes have never been touched, which in a real world is nearly all of them.
So the aggregate must read `blacksmithPartyData.scenes` directly and count only scenes with a stored entry -
not iterate scenes and call the getter.

Decide which of these it is before building:

- **Mean of scenes with an entry.** The places you have actually been. Probably what "overall" means.
- **Weighted by visits.** Nothing tracks visits today, so this needs new data first.
- **A campaign-level value set directly**, with scene reputation staying local colour. This is what "Future:
  campaign reputation" in `manager-reputation.js` means, and it is a different feature, not an aggregate.

Whichever it is, return the matching `getReputationScaleEntry` band alongside the number - a consumer showing
"overall reputation" wants the word, not the integer.

## Consider: `api.inventory.transferContainer()`

**Deferred at design time, and there is now a concrete cost to point at.** A container move was left out of
`api.inventory` on purpose: it is one-to-many creates plus many source deletes, which breaks the singular
return shape, makes quantity splitting meaningless, and turns rollback into N deletes plus N restores plus
reporting which of those also failed. That reasoning still holds.

What has changed is the price of not having it, reported by Curator after shipping a loot window:

- Clearing a body that contains bags takes **N+1 batches** rather than one, because a container and its
  contents cannot be emptied and taken in the same `transferItems` call - see the note in `api-inventory.md`.
  The multi-pass loop works and is not difficult, but every consumer clearing a hierarchy has to write it.
- The per-row experience for a player is worse than the batch one: take six things, then take the bag, and
  again for a nested bag.

If it is built, **reuse dnd5e's own prompt rather than inventing a second answer to the same question.**
Curator's GM-side removal of a packed container calls `Item5e#deleteDialog()` (`dnd5e.mjs:24044`), which lets
the system own the "delete contents too?" question and the recursion behind it. A `transferContainer()` that
asked differently would give a table two dialogs with two semantics for one decision. `Item5e.createWithContents`
(`dnd5e.mjs:24153`) is the matching primitive on the create side, and its docstring requires `keepId: true` at
the `createDocuments` call or the container links break.

Not blocking anything. Two consumers now know the workaround, and it is documented.

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

## Save-based offense: delivery as a dimension, and the accuracy bug it fixes

**Plan:** `documentation/plans/plan-save-delivery.md`. Four phases, each independently landable.

**The bug that motivates it.** midi sets `workflow.hitTargets` to *every target* for an activity
with no attack roll, so for a save spell it means "was targeted", not "was hit". Blacksmith reads it
as the latter (`utility-midi-resolution.js:285`, `stats-sources.js:416`), so a Fireball on five
goblins records five hits and zero misses **even when all five succeed their saves**. Hit rate is
`hits / (hits + misses)`, so every save spell cast drags the caster and the party average toward
100%. midi already computes the correct set as `workflow.failedSaves`; nothing here reads it.

Note that save damage **is** already eligible for damage moments and always has been — `hitTargets`
being non-empty makes `hadHit` true, so a Fireball can already take the biggest-hit record. Do not
repeat the earlier claim that it cannot.

- **Phase 1 — carry it. DONE**, pending live verification. `resolveDelivery()` and
  `delivery` / `landedTargets` / `landedIsProvisional` on the attack event
  (`utility-midi-resolution.js`), plus a `midi-qol.postCheckSaves` observer
  (`CombatSources._onMidiPostCheckSaves`) that finalises the landed set and logs. Records nothing
  and changes no statistic — deliberately, including not creating a cache entry where none exists,
  since that alone would move damage out of `unlinked`.
  *Verify:* in a live combat with debug on, cast an attack spell, a save spell and Magic Missile;
  each reports the expected `delivery`, and the save reports `failedSaves` matching the table.
- **Phase 2 — fix accuracy.** Count hits and misses from `landedTargets`, not `hitTargets`. This
  changes existing numbers on purpose. **Blocked on the phase 1 log** (see below): what phase 2 does
  depends on whether `hitsChecked` fires for save-only activities at all.
  *Verify:* Fireball five targets with some succeeding; hits and misses reflect the saves, and a
  weapon attack is unchanged.
- **Phase 3 — caster statistics.** Saves forced, DC, failure rate, and a readout once there is
  something to show. **Settled 2026-08-04: "saves forced" counts CASTINGS, not targets** — one
  Fireball on five goblins is one forced save, and it mattered if any target failed. Counting
  targets would measure the encounter's geometry rather than the caster.
  *Verify:* against a hand-counted round.

**Blocking question for phase 2, answerable from phase 1's log.** Whether `hitsChecked` fires for a
save-only activity. If it does, save spells inflate hit rate toward 100% and phase 2 recounts. If it
does not, save damage is `unlinked` today — totals only — and phase 2 is about linking it at all,
which is a bigger change. midi's bundle supports both readings across its Workflow subclasses and is
not settleable by reading. Cast a save spell in combat with debug on and read `hadCachedAttack` in
the `MIDI postCheckSaves` line.
- **Phase 4 — MVP fairness.** `successfulOffenseCount` increments whenever `hitTargets` is non-empty,
  which for a save spell is unconditional; it should require a landed delivery.
  *Verify:* a caster whose spell is entirely resisted scores no offense count for it.

Non-midi tables are deliberately out of scope: save results arrive as uncorrelated messages, so they
get `delivery: 'unknown'` and current behaviour rather than a guess that corrupts the statistic this
work exists to fix.

## Readout widgets: `segmentchip` — later, when something needs it

**Not scheduled.** A widget kind worth having when a readout has **more than two parts**, kept here so the idea is not lost rather than because anything currently wants it.

One bar split into proportional segments, showing composition at a glance where separate numbers make the reader do the arithmetic. The original case was attack outcomes — hits, misses, criticals, fumbles as one item.

**Why it is not being built now.** Its justification was width, and that has been met by other means: `Finesse` collapsed criticals and fumbles into one chip, suppression works, and the zones clip rather than collide. `Finesse` is also the same consolidation done in text (`6C | 3F`, separator muted), and for **two** parts a text pair reads better than a bar would — at this row's height each segment is a few pixels, so small categories become slivers nobody can judge and the reader falls back to the tooltip. That is the same failure the gauge ring had twice: a shape too small to carry the reading it promises.

**What would change the answer:** a readout with three or more parts whose *proportions* matter, where the text form gets long and the arithmetic gets real. Damage by type, or party composition, would qualify. Two counts do not.

If it is built: confirm the segments sum to the whole and the tooltip names each; confirm no recorded data renders an empty bar rather than a row of zero-width slivers; confirm it survives suppression at a narrow window without clipping.

## One participation list, owned by Blacksmith instead of copied per module

**The fact belongs to the hub; the behaviour belongs to each module.** A camera, stream, or bot
account is not a person: nobody clicks, nobody answers, nobody votes. That is one statement about
the account, and at least four modules need to derive different behaviour from it — toasts do not
render, voting does not count it toward quorum, Herald hides the menubar, and anything that opens a
dialog should not prompt it.

**This list has already been built twice with different homes.** `excludedUsersMenubar` was a
Blacksmith world setting and now lives in Herald (`api-menubar.js:2918`); `toastExcludedUsers` is
still here. Bibliosoph's roll announcements would be the third. The GM answers the same question
once per module, and any module that forgets blasts the capture screen. `matchUserBySetting`
(`api-core.js`) already exists, so the *mechanism* was shared long ago and the *concept* never was.

**Do not model it as a "do not send" list.** That is a behaviour, and encoding it as one is what
made it fragment. Model the account: one predicate, one world setting, consumers deciding for
themselves what it means for them.

**Keep two similar cases apart.** A passive account *cannot* interact. A person who is present but
not playing tonight — a guest, a second screen — *can*, and merely should not be counted for
decisions. One list for both means excluding the guest from toasts in order to keep them out of a
vote. Only the passive account is a standing fact; the guest case belongs to per-vote configuration
(see the voting item below).

**Orthogonal to the toast `channel`, deliberately.** Participation answers *who this person is*;
`channel` answers *what kind of thing this toast is*. The override is the intersection — a passive
account still renders a display-only announcement. Nothing about `channel` changes when this lands.

Three things to settle before writing code, because siblings will depend on the answers:

1. **The name.** It will sit in sibling source for years. `isPassive`, `isSpectator`,
   `isParticipant` — pick for how the call site reads in a consumer, not how it reads here.
2. **Migration.** `toastExcludedUsers` is configured in live worlds. Alias it, or copy its value
   into the new setting on first load; do not silently drop a GM's existing configuration.
3. **Whether Herald migrates back** to consulting the shared list rather than its own. That is
   cross-module and is tracked in `TODO-GLOBAL.md`.

*Verify:* mark an account passive, then confirm each consumer behaves without further configuration
— no toasts on the tabletop (but a bypass-channel toast still renders), no place in a vote tally,
and unanimity reached without waiting on it. Confirm a GM who had `toastExcludedUsers` set before
the change still has that user excluded afterwards.

## Voting: filter who can vote and who can be voted for

Two separate filters. One now has a rule but no configuration; the other has no concept.

**Who can vote** is a logged-in non-GM user who owns at least one `character` actor, snapshotted per vote as `vote.eligibleUserIds` when the vote starts. That rule covers the case it was written for — a camera account, or a player holding only the party `group` actor, is no longer counted, so a vote can reach unanimity without waiting on someone who will never vote. What is still missing is any way to *configure* exceptions: a player who genuinely owns a character but is not participating tonight (a guest, a second screen) is still counted, and nothing narrows the snapshot.

**Who can be voted for** has no concept at all. For a leader vote every eligible voter is implicitly a candidate. A GM-run vote may want a deliberately short candidate list.

**The design question, unanswered:** per-vote configuration in the Create Vote dialog (`window-vote-config.js`), or a standing world setting for "users excluded from voting" that every vote inherits?

**Settled since:** the standing "this account is not a person" case is not a voting concern at all — it belongs to the shared participation list above, which voting should consult rather than duplicate. What is left here is the case that list deliberately excludes: a real player, owning a real character, who is not participating *tonight*. That is per-session, so it wants per-vote configuration rather than a standing setting.

## Compendium mapping wants a custom settings panel

The real fix, and the reason automatic mapping and the source checkboxes were removed rather than repaired. A row of numbered dropdowns is the wrong control for an ordered list: adding a compendium means finding a free slot, removing one means setting it to "none" and letting the compaction pass shuffle it, and reordering means retyping several dropdowns. The slot-count slider makes that bearable but not good.

What it should be: one panel per type showing the chosen compendiums as a **drag-and-drop ordered list**, with add and remove, and no slot count to manage at all — the list is as long as it is. `registerMenu` with a `BlacksmithWindowBaseV2` form is the shape; the existing `numCompendiums{Type}` and `{prefix}{i}` settings can stay as the storage behind it, so this is a UI change rather than a data migration.

Two things to carry over: the ordinary settings page must keep working for anyone who does not open the panel, and the panel needs the full unfiltered choice list (`getAllPacks(type)`), not a narrowed one.

Verify live: reorder by dragging and confirm the search order changes to match; remove the first entry and confirm the rest shift up without a reload; confirm a type with nothing configured reads as empty rather than as a column of "none".

## Live-verify the compendium mapping simplification

Shipped unverified, and it touches settings storage, so worth a careful pass in a world that already has mappings.

- **Existing mappings survive.** Load a world configured before this change and confirm each type's Priority Slots slider reads the number it actually had configured, and that the dropdowns below hold the same compendiums in the same order.
- **Lowering the slider hides rather than deletes.** Drop a type from 8 to 3, reload, confirm slots 4-8 are gone from the UI; raise it back to 8, reload, confirm the original picks return.
- **The dropdowns are complete.** Confirm a journal compendium that used to be missing — one that failed the old "primary journal" heuristic — now appears in the JournalEntry dropdowns. That is the specific regression this change exists to fix.
- **What you pick is what gets searched.** Map a compendium that the old build would have vetoed, then resolve a name from it and confirm it resolves.
- **Scene mappings.** If Scene was mapped, confirm it now shows per-pack dropdowns and re-pick; the old `source:` values are skipped.
- Confirm the Included Sources section and the Auto-map checkbox are gone entirely, with no orphaned headings left behind.

## Live-verify the Compendium Search tool window

`api.compendiums.search()` itself is verified — 57/57 headless assertions, grouping proven across 10 sources (`testing/suites/suite-compendiums.js`). The palette built on it is not. There are three ways in — the Blacksmith scene-controls toolbar (Utilities zone, `fa-book-atlas`), the menubar left zone (magnifying glass, beside menu/settings/refresh), and Ctrl+Space. Confirm all three reach the same single window rather than opening duplicates, then check:

- **Drag lands on a character sheet.** Drag an Item row onto an open dnd5e character sheet and confirm the item is added. Then drag an Actor row onto the canvas and confirm a token is placed. Both ride Foundry's native `{type, uuid}` drop contract, so a failure here means the payload is wrong, not the sheet.
- **Drag as a player.** Log in as a player who owns a character and repeat. The tool is not GM-only, and a player sees only the packs they have permission on.
- **All types is the default.** Confirm the selector opens on All, that a query returns a mix (an Actor, an Item, a Journal entry) grouped by compendium, and that nothing appears twice — the dedup case is a pack mapped to both Item and Spell, where a spell would otherwise be listed once per type. Confirm the subtype filter is hidden in All mode and returns when a single type is chosen.
- **Type switching.** Switching type re-renders (the subtype list belongs to the type) — confirm focus returns to the search field and the subtype list is the new type's. Synthetic types (Spell, Feature, Class) should show no subtype selector at all, since their subtype is already fixed by the mapping.
- **All-types cost.** Time the first keystroke of a 3-character query in All mode with every type mapped — it warms every configured pack index at once, which is the worst case this window has. If it stalls the client, the fix is a higher minimum or a smaller default scope, not a spinner.
- **Themes.** Cycle Light / Dark / Glass from the title-bar menu and check, in each: the search box and both selects take a theme-appropriate surface rather than the old black box; placeholder text is legible; the focus ring appears on tab; an **opened** dropdown's rows are readable (that popup is drawn by the OS and inherits nothing, so it is the one that regresses independently); and the sticky source headers hide the rows scrolling under them.
  This is a shell-level fix in `styles/window-tool.css`, so also spot-check one other Tool consumer with a form — the same rules now apply to every Tool window, and a regression there would not show up on this palette.
- **Long lists.** Search a single letter with `minLength` reached (e.g. "ar") and scroll. Confirm sticky headers behave and the window's fixed 620px height with `resizable: true` is sensible.
- **Group headers.** Confirm each header shows the pack's own name on the left and its package quietly on the right, with no counts and no "Package: Pack" run-on. Search something that hits two different packages' "Equipment" packs and confirm the two headers are distinguishable.
- **Truncation status.** Search a broad query that exceeds the window's 100-result cap and confirm the footer says "more available, N compendiums not searched" in the accent color. Then search something narrow and confirm the message is absent — it must not appear merely because a count is round.
- **Reload indexes.** The title-bar refresh action calls `clearCache()`. Edit a compendium item's name, hit refresh, confirm the new name appears.
- **Ctrl+Space.** Confirm it opens the palette, and that pressing it again with the window already open focuses it rather than opening a second. Confirm it appears in Configure Controls under Blacksmith so it can be rebound — Ctrl+Space is the keyboard-layout switcher on some Windows and macOS setups, and on such a machine the OS will eat it. Also confirm it does *not* fire while you are typing in a chat box or another text field.
- **Menubar toggle.** Turn off Compendium Search in Menubar (Manage Content settings group) and confirm the menubar button disappears while the toolbar tool and keybinding still work.

Also confirm a JSON character import still works — the only consumer of the changed index shape (`_getPackIndex()` entries gained `img`) that the harness suite does not exercise.

Once the drag path is confirmed, update the Squire row in `TODO-GLOBAL.md`.

## Pins

- **Single-click selects a pin (selection state + keyboard actions)**: clicking a pin should put it in a selected state with a visible ring so keyboard actions can operate on it — first milestone: Delete/Backspace removes the selected pin via `PinManager.delete` with a permission check. Currently a single click only invokes registered `click` handlers (`pins-renderer.js:994` editable path, `pins-renderer.js:743` non-editable path); there is no selection concept. Design validated; no performance concern — pins are a pure DOM overlay, so one delegated `pointerdown` listener on `#blacksmith-pins-overlay` plus a `document` `keydown` handler suffices. Implementation: track the selected pin id in the renderer (`PinDOMElement._selectedPinId`); apply an `is-selected` class styled in `styles/pins.css`; `pointerdown` on a pin element selects, on the overlay container deselects; `keydown` Delete/Backspace deletes (scoped so it does not fire while typing in inputs), Escape deselects; expose `pins.getSelectedPin()` / `selectPin()` / `deselectPin()` on the public API and fire `blacksmith.pins.selected` / `blacksmith.pins.deselected` hooks so other modules can react. Verify live: click a pin and see the ring; press Delete and confirm the pin is removed (with its delete animation if configured); click empty canvas or Escape deselects; Delete does nothing when no pin is selected and does not fire while typing in a text field.
- **Double-click sometimes lands in drag mode instead of firing**: for editable pins, mousedown enters the drag system and any movement beyond `DRAG_THRESHOLD` (10px screen space, `pins-renderer.js:856`) makes the release count as a drag (`pins-renderer.js:943`), so a slightly jittery double-click gets swallowed as a tiny drag and the second click never reaches the double-click counter (`pins-renderer.js:1004`). Candidate fixes: track movement per press instead of cumulatively, treat a second press arriving within the 300ms click window as a double-click before the drag decision, or require both distance and a minimum hold time before committing to drag. Verify live: rapidly double-click an editable pin ~20 times with normal hand jitter and confirm the double-click action fires every time and the pin does not shift position; confirm a real drag (press, move, release) still moves the pin and a deliberate slow click still fires the single-click action.

## Stats adapters still write tracker state through live references

The last of the reaching-in, and all that remains of the stats decomposition, which is otherwise complete
(see `CHANGELOG.md`; the design lives in `architecture/architecture-stats.md`).

`CombatStats._ensureParticipantStats` and `_ensureCombatTotals` return live references into `currentStats`
and `combatStats`, and the handlers in `stats-sources.js` write through them — six and two call sites
respectively, plus two direct `combatStats` reads. So mutation of the accumulator is authored in two files
and ordered by whichever handler happens to run.

The shape this wants: the adapter returns an event describing what happened, and the tracker applies it,
owning every write. The `_process*` calls are already that shape and should be the model.

**This is a behaviour change, not a move** — mutation order and timing shift, and it sits on the distributed
socket path where a player's roll reaches the GM. It wants its own change and its own verification pass:
a multi-round combat with midi-qol active, one with `enableMidiIntegration` off, and one with a player
rolling. A correlation or ordering break shows as inflated or missing hit counts rather than an error.

`stats-player.js` (2,606 lines) wants its own audit and is deliberately not bundled into this.

## `manager-roll-outcomes.js` duplicates the stats socket forwarder

Both it and `stats-sources.js` define `_forwardToGM`, doing the same job over the same SocketLib socket.
Noted during the decomposition. Related to the crit/fumble detection consolidation in
`plans/plan-rolls-classification.md`, which names four detection sites; this is the forwarding equivalent.

## Live-verify the expanded encounter bar readouts

Seventeen chips now share the middle zone — ten out of combat, seven in one — where six shared it before.
Shipped unverified.

- **Both sets read correctly.** Out of combat, check each of the ten against the Party Statistics window;
  the two consume the same aggregate, so any disagreement is a bug in the chip's write rather than in the
  numbers. In combat, check the seven against the end-of-combat card once the fight ends.
- **The ranking is the feature.** Narrow the window until chips start dropping and confirm they go in the
  order `READOUT_SUPPRESSION_ORDER` declares — campaign-scale figures first, the three originals last. If
  the wrong ones survive at a typical width, the fix is the ranking, not the set.
- **Fewest misses reads as a credit.** Hover it and confirm the tooltip says "Fewest misses on record".
  The aggregate ranks that measure low-is-best, so the bare number is misleading without the wording.
- **Portraits and totals stay distinguishable.** Per-person standings show a face; party totals show a
  number and no face. Confirm a six-figure lifetime total renders as `8.4k` with the exact figure in the
  tooltip.
- **Players see what the GM sees.** On a player client, confirm both sets render. The live figures arrive
  through the combat flag every client reads, so three blanks there would mean the mirror is broken.
- **Nothing regressed at the far end of the bar.** The suppression list grew from ten entries to
  twenty-one; confirm party health, monster health, and both timers still survive a narrow bar, since they
  rank after every statistic.

## Make display-only secondary bar items first-class

The item vocabulary is four kinds: `button` (the default), `info`, `progressbar`, and `balancebar`. Three of
those are display-only, but `.secondary-bar-item` styles every item as a button — fill, border, 6px radius,
pointer cursor, hover lift, and a square `min-width`. Any bar showing a readout therefore strips that
locally, which the combat bar does today. The stripping belongs in the shared stylesheet, keyed on the
display-only kinds. A hover lift on a number that cannot be clicked is an affordance that lies.

Ordered by value against risk:

1. **Display-only styling, centrally** (`styles/menubar.css`): strip button chrome for `info`, `progressbar`,
   and `balancebar`, and delete the combat bar's local override. Small and clearly correct. **Check the party
   bar before and after** — its health `progressbar` (`api-menubar.js:709`) and reputation `balancebar`
   (`manager-reputation.js:178`) are the other consumers, so their appearance changes with this.
2. **State-driven colour** — the real capability gap. `progressColor` is a single static value, but a timer's
   colour is a function of its remaining time and a health bar's arguably should be too. Today the only way
   is to write a state class and clear the inline colour the partial emits, which is exactly what the combat
   bar's timers do. A data-shaped mapping (thresholds, or state-to-colour) rather than a callback: some item
   paths cross the socket boundary, so a function will not survive every route.
3. **Label placement** — the left/right labels are positioned for a current/max idiom; a timer wants one
   caption centred over the bar, which today means overriding position. A `labelPosition` option covers it.
4. **Sizing basis** — items size from `--blacksmith-menubar-secondary-height`, the height of the whole bar.
   That assumption is why the combat bar's two rows each redeclare five variables, and it is the most
   fragile part of that stylesheet. If items sized from a `--secondary-bar-item-basis` defaulting to the bar
   height, a container could override it once and every per-row redeclaration would disappear. Fixes the
   general case rather than one bar's case.

Worth doing now rather than later: real-time stats are going into the combat bar's middle zone, so the
readout vocabulary is about to get considerably more use and the cost of it being second-class compounds
from here. Update `documentation/api/api-menubar.md` with whatever surface (2) and (3) add. Verify: the
combat bar renders readouts correctly with no bar-local appearance overrides left.

## Contributed actions by subject (menubar routing)

Let a module declare that an action belongs to a **subject**, and let a surface declare that it displays
that subject; Blacksmith matches the two and offers the action wherever the subject appears. Squire
registering a party-health tool would then also reach the combat bar's party health bar, without Blacksmith
knowing what Squire or health are. The test for the implementation: if it ever needs an
`if (subject === 'health')` branch, the design has gone wrong — this is routing, not knowledge.

**Declared, never inferred.** Matching on names, icons, or tool ids would guess, and would guess wrong
exactly where it matters: "health" means party health on the combat bar, one actor's health on a portrait
hover card, and monster health on a third item. A wrong wire is not cosmetic, it is a control acting on the
wrong target. Both sides naming a subject cannot mis-fire, and it mirrors the existing `zone` / `group`
system — placement by declaration.

**Do not surface the contributing module in the UI.** Players have no awareness of installed modules, their
names, or their capabilities, and no reason to acquire any. Their economy is *action and context*: they know
the thing they want to do, not what provides it. Group and label contributed actions by what they do, the
way pins group by category rather than by owning module. Naming the provider is a developer's mental model
leaking into a player's surface.

Error isolation is already handled: `UIContextMenu` wraps every item callback in its own try/catch
(`ui-context-menu.js:172`), and the existing provider call sits in a try. Nothing further is needed there —
and the framing that a user should be able to attribute a failure to a module is the same fallacy as above.

**Prerequisite**: confirm the `hasCustomTemplate` gate on the secondary-bar context-menu path
(`api-menubar.js:3420`, `:3431`) works for hybrid bars — the combat bar is the hybrid one, so nothing here
lands without it. Tracked separately below.

**Fold in the existing hand-wired exceptions** when the registry exists; each is this feature special-cased
for one module:

- `manager-combatbar.js:2950` calls `getCombatContextMenuItems` on `coffee-pub-curator` by name to get the
  portrait menu's image-replacement rows. This is the closest precedent and the natural proving ground —
  generalising it removes a hard-coded sibling reference from the hub even if no second consumer appears.
- `api-effects.js:61`, `:278` read a `coffee-pub-bibliosoph` flag (`outcomeBurst`) directly to classify an
  effect. Different shape — data rather than action — but the same coupling.
- Quick Encounter reaches its provider through `hasQuickEncounterTool()` / `openQuickEncounterWindow()`,
  which is looser but still a named capability rather than a declared subject. The provider is
  **Bibliosoph**. Leave the row where it is for now — it only opens the tool and the tool does the rest, so
  there is nothing to re-route until the registry exists.

**Wanted wiring, once it exists**: clicking the combat bar's party health bar should open whatever the
party-health tool provides. Called out as very handy — it is the case that motivated the idea.

## Design system

- **Record the "players do not know about modules" rule in `design-system/design-patterns.md`**: module identity is a developer concept and must not appear in player-facing UI. Players have no awareness of which modules are installed, what they are called, or what each provides, and no reason to acquire any — their economy is action and context. Group and label by what a thing *does*, never by what supplies it; pins are the existing model, grouped by category rather than by owning module. The rule has a second face worth stating explicitly: the argument that a user should be able to **attribute a failure** to the responsible module is the same fallacy, because a broken control simply reads as broken whoever owns it. Error isolation still matters so one provider cannot break a shared surface, but attribution is not a user-facing requirement and must not shape the UI. This came out of the contributed-actions design above (2026-08-01) and governs far more than that feature, which is why it belongs in the published design docs rather than only in a backlog entry. Verify: the rule appears in `design-patterns.md` and reads as a constraint on new UI, not as a note about one feature.

## Encounter bar

The merge is complete and its plan is deleted; the design now lives in
`documentation/architecture/architecture-encounter.md`. This is what is left.

- **Live-verify the shipped encounter bar work**: every entry for it in `CHANGELOG.md` carries its own verification steps and most have not been run. Priority order, hardest to notice first: the linked/unlinked HP dedupe (place a second token of a linked PC and confirm the party maximum does not double, then five unlinked goblins and confirm the monster maximum counts all five); challenge rating switching from canvas to tracker scope when combat starts; the readout suppression order under a narrow window; and the graveyard round-tripping a combatant via Toggle Defeated.
- **Secondary bar item clicks are skipped for custom-template bars**: the two click handlers gate on `!this.secondaryBar.hasCustomTemplate` (`api-menubar.js:3308`, `:3420`), which predates hybrid bars. It reads the flag off `secondaryBar` rather than the bar type, where it appears never to be set, so clicks may already work — but that is untested. It does not matter for `info` chips, which are not clickable, and does matter for `balancebar`, which takes `onClick` and `contextMenuItems`. Verify before the balance bar lands: register a clickable item on the combat bar and confirm both left-click and the context menu fire; if they do not, gate on the bar type and allow hybrid.

## Item import expansion

**A consumer is now waiting on this (2026-07-30).** Squire has finished its `api.dialog` migration and needs
`api.importer` to replace its own Codex/Quest import code. The publish gate on `api-importer.md` and
`architecture-importer.md` (`tools/wiki-sync.mjs:83`) is exactly the first item below, so verifying that batch
unblocks publishing the docs and exposing the namespace. Squire's Quest import additionally needs validation
reporting, progress/error reporting, and scene-pin handling extension points — scope those when the API is
designed. Detail in `TODO-GLOBAL.md`.

- **Live-verify the shipped 13.10.0 batch**: native Item/inline NPC ingestion, Feature/Spell profiles, activity targeting/effects, Full Prompt / JSON Template delivery, Equipment passive effects Phase 1, and the shared Validate/results flow are implemented and recorded in `CHANGELOG.md` [13.10.0], each entry carrying its own live-verification steps; run them in a live world. For the shared validation flow: verify one valid fixture, malformed JSON, a mixed valid/invalid two-entry batch, Open/Open All, Edit and Retry, Retry Failed without duplicate creation, and importer switching after results.
- **Optional Midi-QOL activity import support (later)**: extend the friendly Feature/Spell activity schema with an explicitly optional Midi-QOL integration block (starting with `midiProperties.magicEffect`, and auditing the remaining activity automation fields). Core dnd5e imports must remain valid and unchanged when Midi-QOL is absent; only emit Midi-QOL data when the JSON explicitly requests it, preserve it through native Foundry Item passthrough, and verify behavior both with and without Midi-QOL installed before shipping.
- **Passive equipped effects for physical Items — later phases**: Phase 1 (friendly transfer effects limited to reminder text and standard statuses, `changes: []` enforced) shipped in 13.10.0. Later: define and whitelist safe core dnd5e change keys, stacking behavior, and evaluate other physical Item profiles plus optional DAE/Midi-QOL integration. Native Item effects remain the lossless escape hatch.
- **Actor package/bundle import (later design)**: explore one AI/hand-authored JSON package that creates an Actor and all of its custom Items, Features, and Spells in one transaction. Preserve the current lightweight compendium-reference and inline-embedded Item paths, but add explicit per-entry destinations (`embed only`, world Item Directory, or a GM-selected writable compendium), UUID/name deduplication, conflict choices (reuse/update/create copy), dependency ordering, preflight validation/preview, and rollback so a partial failure cannot leave orphaned Items or a half-built Actor. Never write to a compendium implicitly.
- **Later phases**: harden existing physical-item converters; evaluate advancement-bearing and remaining dnd5e Item types individually.

## Performance & memory

Open items only. Completed work lives in `CHANGELOG.md`; the *design* that came out of this work (shared
journal watchdog, menubar fingerprint, timer DOM caching, dead observer paths) is documented in
**`architecture/architecture-blacksmith.md` §9B**.

**Status:** not reproducing the old runaway tab-memory pattern. Remaining session cost drivers are menubar
churn and Quick View token hooks. Last validated 2026-03-28 — **stale, needs a re-run (see below).**

| Priority | Item | Files | Notes |
| --- | --- | --- | --- |
| Low | **Remove dead observer paths** | `ui-journal-encounter.js` | `_setupGlobalObserver` (and the `_setupActivePageChecker` / `_setupPageNavigationListener` it drives) is defined but never called. Delete or gate behind a debug flag so it can't be accidentally re-enabled. |
| Low | **Audit for redundant direct `Hooks.on`** | suite-wide | Phase D: find features still calling `Hooks.on` directly where HookManager already wraps the same hook name. |
| Low | **Menubar: dynamic tool title changes** | `api-menubar.js` | A tool's **title** changing without a zone/active/visibility change may not refresh until something else invalidates the structure fingerprint. |
| Low | **High-volume sidebar hook** | `sidebar-combat.js` | `Hooks.on('renderApplication')` fires on every sidebar render; the filter is cheap but call volume is high. |
| — | **Re-run the validation pass** | — | 90–180 minute GM session; compare DOM node trend, listener counts, combat responsiveness. **How to measure: `architecture/architecture-blacksmith.md` §9B.4.** If stable, downgrade status to MONITORING. |

## Settings & feature gating

The **load gate vs on/off** model is documented in `architecture/architecture-blacksmith.md` §8. Quick View,
the performance monitor, latency, pins menubar, and hook gating for all three timers are done — see
`CHANGELOG.md`. Open:

| Priority | Item | Status | Notes |
| --- | --- | --- | --- |
| Medium | **Combat / player stats** — optional dynamic import when tracking off | Not started | `CombatStats.initialize()` / `CPBPlayerStats.initialize()` already return before `_registerHooks()` when disabled, but `stats-combat.js` stays in the bundle via static imports (`blacksmith.js`, timers). Dynamic import would shrink the cold path. |
| Low | **Combat timer** — optional dynamic import | Not started | Already correctly gated (`combatTimerEnabled` false → `initialize()` returns before registering hooks). Only the static import remains. |

## CRITICAL BUGS

Consumer-facing defects — the ones other modules will hit — live in **`known-issues.md`**, each with a symptom, a workaround, and a fix pointer. This section holds only what is *not* consumer-facing: open design decisions and internal code-quality work.

Pattern worth internalising from the 2026-07-16 API audit: **every defect it found was an API Blacksmith does not call on itself.** The menubar API works because Blacksmith self-registers its own menubar tools. It does not self-register through `registerToolbarTool`, never called `registerModule`, never checked `removeHook`'s return, and never used `BLACKSMITH.rolls.execute` — and all four were silently broken. If an API isn't dogfooded, nothing tests it.

## ARCHITECTURE DOCS — audit results (2026-07-17)

All 13 audited against source. **Two are fiction, three are shipped-work-described-as-plans, and the pattern is consistent enough to name.**

> **The finding that explains almost all of it:** the house rule *"a doc that copies code drifts; a doc that points at code doesn't"* held as a **natural experiment**. In `architecture-blacksmith.md`, everything that *points* (file inventory 45/46 correct, the style list exactly right, the §9A trap list 7/9, all cross-links) survived intact. Everything that *narrates or copies* (§3.1's hand-maintained call sequence, §2.1's transcribed esmodules array) rotted. Same doc, same author, same age — the only variable was pointer vs copy.

### `architecture-rolls.md` — ASCII diagrams and API Reference still encode the wrong flow
- The trim and the correction block shipped (see `CHANGELOG.md`, architecture-docs audit). Remaining: the ASCII diagrams and the API Reference section still encode the old 4-function/public-internal model. The real flow is 3-function (`requestRoll()` is commented-out legacy), `orchestrateRoll` throws without an existing message id rather than creating cards, and the socket direction is inverted (roller→GM). Rewriting the diagrams needs a session with the code.

### ⛔ `architecture-socketmanager.md` — 81% fiction, BORN fiction. REWRITE NEEDED — #1 POST-RESET EFFORT
- **Priority (author, 2026-07-17): #1 after the wiki reset**, ahead of the design-system effort — sockets and hooks are the two most critical systems. (The hook-system doc, `architecture-hookmanager.md`, was already rewritten from source this session; sockets is the remaining critical one.) Excluded from the first wiki publish; rewrite from `manager-sockets.js` preserving the god-module analysis.
- **67 of 83 symbols phantom.** Proven never-real by `git log -S`: `_handleIncomingMessage`, `performanceMetrics`, `_initializeLocal`, `_detectSocketLib` have **only ever existed in this doc file, in any commit**. Added whole 2025-08-28, when `manager-sockets.js` already looked as it does now. Never described this codebase.
- Invented: a third "Local Mode" transport, batching, reconnection/backoff, replay-attack validation, latency metrics, a config system, four debug globals.
- **Most dangerous:** it invents a security model. Reality is `_isLocalRecipient()` (`:125`) filtering **on receipt** — both transports broadcast to every client. Source: *"emit() must never carry secrets"* (`:306`).
- **Header added; body left for diffing.** Do NOT delete: the socket layer has no other contributor doc, and the **"Migration Plan" section is real** — the god-module problem (SocketManager imports 6 UI subsystems at `:14-19`) is live and correct. Its status is stale (`module.api` exposure shipped at `blacksmith.js:1298`).

### `architecture-blacksmith.md` — KEEP, fix §3.1 (the map a new contributor reads first)
- **§9A is right and §3.1 is wrong — the doc contradicts itself and the correct half loses.** §3.1 claims `hookCanvas()` registers canvasInit/canvasReady/updateScene/dropCanvasData. It registers **no hooks** (`:821-837` only injects the layer class); those live in `initializeSceneInteractions()` (`:617`, called during `ready`) and three are gated on `enableSceneClickBehaviors`. §9A says so correctly.
- **§3.1 lists lifecycle phases in the wrong order** (`setup → init → ready → canvasReady`; Foundry runs `init → setup → canvasReady → ready`). Its own phase *numbers* are right — only the list order is wrong. Worst possible place for it.
- §3.1 also self-contradicts §4.3 on `BLACKSMITH.rolls.execute` (§4.3 correctly says removed), and names phantoms `ConstantsGenerator`, `registerWindowQueryPartials`, `executeRoll`, `_setupDomObserver`.
- §9A's `removeCallback` "trap" is now **stale — we fixed that code today**. Delete it.
- §2.1 drift: esmodules omits 2 files (9, not 7); ships **two** style entries, not one.
- §11 (~89 lines) is a migration plan — honestly fenced, but belongs in this file.
- **Verified excellent and worth protecting:** file inventory 45/46, style list exact (48 imports, names and order), §9A Quick View line-for-line, §4.3 roll exports exact, §9B.2 dead-code table (its `_setupActivePageChecker` row looks like a false positive but is **transitively dead** — the doc is right).
- **Live bug it predicted:** §7 warns "a new stylesheet is silently unstyled unless added to `default.css`". `styles/widget-tags.css` is on disk, imported by nothing — it matters because `TagWidget.registerPartial()` is live at `blacksmith.js:543`. (A second instance, `journal-toolbars.css`, was genuinely dead and has since been deleted.)

### `architecture-toolbarmanager.md` — 20 phantoms; ~60% is a superseded plan
- 8 phantom API names (`registerBlacksmithTool`, `BlacksmithToolbarManager`, `TokenControlToolbarManager`, …) presented as the design to implement; that design was abandoned for what shipped. It **documents and disclaims the same phantom class** 160 lines apart.
- Says **"9 default tools"** — actual is **5**. Third wrong count in this file's history; note line 14 already warns readers not to trust its lists, then line 150 supplies one.
- Copied `request-roll` block says `zone: 'rolls'`; actual is `gmtools`. Tool Data Structure omits `onCoffeePub`/`onFoundry`/`toggle` (load-bearing). Claims `icon`/`title` required; both default — only `onClick` is (now validated).
- 3 wrong file paths, 1 fictional CSS selector.
- **Doc arguably right vs code:** its "Tool Visibility System" implies parity, but `getFoundryToolbarTools()` ignores `tool.visible` while `getVisibleTools()` honors it. Fix belongs in code.

### `architecture-tags.md` — MAJOR-REWRITE, but **fix the code split first**
- Root cause: the system was renamed **Flags → Tags**; the code finished, the doc didn't. Its title says Tags, its body says flags — so it names 5 phantom files (`widget-flags.js` → real `widget-tags.js`, etc.) and a phantom `api.flags` namespace.
- **Do not rewrite it yet.** The doc's JSON section is *correct* for the shipped `tag-taxonomy.json` (which really does use `flags`). Rewriting to `tags` while the JSON ships `flags` just moves the lie. Fix the three-shape split first (see the Tags entry below), then document one schema.
- Also: four-tier classification is fiction (code has `taxonomy`|`global` only); `TagWidget.prepareData` is documented positional but takes an **object**; `activate()` omitted (widget renders inert without it); context key documented `.quests`, shipped JSON has `.quest`.

### `architecture-stats.md` — MAJOR-REWRITE (~66% is a decision memo)
- **Its central storage claim is inverted.** It says "**NO PERSISTENCE** — all combat data is lost" and recommends *against* storing summaries. The code stores every one, deliberately unbounded, in the `combatHistory` world setting (`stats-combat.js:1090`, `settings.js:2141`). Option C was chosen and shipped; the doc still presents it as an open question.
- It proposes "keep last 10-20, prune oldest" — **the pruning lie in proposal form.** Delete it or it regenerates.
- §2 misattributes an entire subsystem: claims `stats-player.js` owns `combat.setFlag('combatStats')`. That file has **zero** combat setFlag/getFlag/unsetFlag; its only flag is `actor.setFlag('playerStats')`. 8 phantoms.
- Asserts clean ownership of the `stats` flag; reality is the known three-way collision — and **worse than recorded**: `timer-round.js:233` also writes *wholesale*, clobbering `currentStats` in the other direction.
- Never mentions that **all writes are GM-gated** — a real gap. Keep the data-flow diagram (L726-752, verifies almost perfectly); add the `combatHistory` write.

### `architecture-xp.md` — KEEP-WITH-FIXES (weakest of the "real" docs)
- Resolution multipliers wrong on **4 of 6**, and wrong in *mechanism*: they're GM-configurable settings (`xpMultiplierDefeated` etc.), not the fixed constants the doc lists.
- Calls `XpDistributionWindow` a `FormApplication`; it extends `BlacksmithWindowBaseV2` (`xp-manager.js:806`).
- Its "Known Issues" section describes a circular-dependency bug **that is already fixed** — the code at `:878` implements the exact proposed fix. Delete.
- Possible latent code bug: two entry points produce different monster shapes (`openXpDistributionWindow` → raw Combatants; `calculateXpData` → the documented shape). The doc may be describing correct *intent*.

### `architecture-pins.md` — KEEP-WITH-FIXES (the recent rewrite mostly holds)
- Verified strong: schema v7, all 6 migration rows exact, all 9 schema defaults byte-exact, permissions model exact, all 5 lifecycle hooks.
- **"No canvas layer is used for pins" is false** — `canvas-layer.js` defines `BlacksmithLayer`, registered at `blacksmith.js:830`, and it is a pin lifecycle entry point (`_draw()` → `PinRenderer.initialize()`, `activate()` → `loadScenePins`). Absent from Components entirely.
- **`pinTagRegistry` is filed under "client settings"; it is `scope: 'world'`** (`settings.js:3451`) — and this contradicts the doc's own three-concerns spine, since it's shared vocabulary, not view state. Highest-value fix.
- Shape list omits `rectangle` — note it matches the **buggy** `update()` whitelist rather than the design. Don't "correct" the doc to the bug.
- `_getPinLocation` → real name `_findPinLocation`. Event list omits 7 of 16. Filter-change mechanism misdescribed (it's `applyVisibilityFilters()`, not a reload).

### `architecture-token-naming.md` — REAL. The model doc.
- Promoted from a plan **properly**: describes built behavior, and its "Do not enumerate the keys" callout applies the house rule correctly *and is self-aware about the prior failure* ("The plan this doc replaced hardcoded '18 keys'; the file had 20" — the file has 20).
- One phantom: `flag-taxonomy.json` → real `tag-taxonomy.json`.
- Its §3 pseudocode **drops rung 2** of the cascade and contradicts its own §2 — the copy-drifts rule biting an otherwise good doc. Replace the block with a pointer to `utility-token-naming.js:231`.

### Audit coverage gaps — what was NOT checked (2026-07-17)
Recorded so a future pass doesn't mistake silence for a clean bill of health.
- **`api-pins.md`** (~100 symbols checked, largest doc): NOT verified — `reconcile()` internals; the five GM tag mutators' bodies (so doc claims about scrubbing saved visibility-profile snapshots are **unverified**); `seedTagRegistryIfEmpty` semantics; arc-text layout / `textMaxWidth`; `imageFit`/`imageZoom`; the v4→v7 schema migration chain; most `window-pin-layers.js` UI claims. Given the reserved-profile-name finding, **the profile/UI-layer claims are the least trustworthy area**.
- **`architecture-*.md`**: 10 docs, still substantially unverified. `architecture-socketmanager.md` is known fiction (30/30 symbols phantom). `architecture-hookmanager.md` needs ~900 of 1411 lines cut.
- **Fence checker**: `scratchpad/check-fences.ps1` syntax-checks all 378 JS fences across the API docs (tries whole-module, function-body, class-body, and object-literal readings before reporting). ~29 remaining hits are pseudo-code fragments, not defects. Worth keeping if you want it in the repo.

### Chat Cards: parts system (supersedes the old posting-API entry)

Design is settled in `documentation/plans/plan-chat-cards.md` (decisions 1-9). That plan is the reference for
*why*; the items below are the work. Steps run in order and each is verified in a live world before the next
begins. Sibling migration is step 7 and lives in `TODO-GLOBAL.md`, not here.

Steps 1 to 3 are built and are in `CHANGELOG.md` under Unreleased -- the parts library and renderer, the
action dispatcher, and Blacksmith's simple cards. **None of it has been verified in a running world yet**;
the verification steps travelled with the work and are the first thing to do before step 4.

**The gate for every item**: if a consuming module still writes card HTML, the item is not done.

#### Tooltip convention sweep
- **Work**: `CLAUDE.md` now requires `data-tooltip` and forbids a bare `title=` or both on one element (an element carrying both shows two tooltips -- Foundry's styled one and the browser's native one). **139 `title=` attributes remain across Blacksmith's templates**, all pre-dating the convention. The new chat-card parts are already clean.
- **Not a blanket replace.** Some sites may want `title` deliberately, and some elements may already carry both, where the fix is to delete one rather than convert. Judge per site.
- **Location**: `templates/*.hbs` (windows, menubar, toolbars); zero in `templates/parts/`
- **How to verify**: hover a converted element and confirm exactly one tooltip appears, styled as Foundry's. Grep for elements carrying both attributes first -- those are the visible bugs; the rest is consistency.

#### Card style extraction — done reading, gaps below

All three source stylesheets and Bibliosoph's have been read end to end (2026-08-13). Values that were
clearly part values are applied; what remains is listed here because each needs either a new part or a
judgement call. **Read this before steps 4 and 5** — it is the reason those steps exist in this order.

**Applied from the read**: large band sized against the card rather than against the band (the source
subheader is 1.3em of the card; compounding against the band's own 0.9em had shipped it at 1.17em); a
`cover` thumbnail variant, because portraits crop square and token art must not; and the XP card's player
portraits switched to it.

**Gaps needing a new part.** None of these compose today:

- **Clickable row.** `.cpb-roll-result.pending-roll` makes the whole row a button, not a row with a trailing
  button. It is how an unrolled skill check invites the click, and it is a different affordance from
  `rows`' trailing action. Needed by step 5.
- **Gauge -- a scale you read a position off.** Distinct from `meter`, which is one value against a maximum
  with the colour as emphasis. A gauge's colour *is* the data, so the caller supplies it: either a gradient
  of stops or a set of segments, plus one or more markers positioned along the range. Three real instances,
  all different: Squire's party reputation (gradient, one marker, a midpoint tick,
  `coffee-pub-squire/styles/panel-party.css:546-620`), Blacksmith's own balance bar (two solid segments, two
  markers), and `.damage-ratio-bar` in `cards-stats.css` (equal segments split red/green with a triangular
  marker positioned by a CSS variable). Build it to cover all three rather than one at a time. A theme may
  offer a palette; the module always overrides -- see the amendment to decision 5 in the plan.
- **Segmented comparison bar.** Folded into the gauge above. `.damage-ratio-bar` in `cards-stats.css`: a track of equal segments split
  red/green with a triangular marker positioned by a CSS variable. It is not `meter` — `meter` is one value
  against a maximum, this is a ratio between two quantities with a pointer. Needed by step 4 unless the
  stats simplification drops it.
- **Corner ribbon.** `.blacksmith-mvp-ribbon` is absolutely positioned, rotated 25 degrees, and overflows
  its container. Genuinely new, and worth confirming it survives step 4 before building a part for it.

**Judgement calls, not gaps:**

- **Trailing text has two legitimate treatments.** The roll card's `.cpb-roll-total` is 1.2em roboto-slab
  because the number is the point; the XP card's `.xp-gained` is 0.85em/900 sans because the name is. The
  parts system currently ships the roll treatment as the only one, so migrated XP awards render larger and
  in a different face than they did. Decide whether the default flips and roll cards opt in, or a variant
  is added.
- **Two section-header treatments exist.** Generic `.section-header` versus `.cpb-card-section-header`
  (900, uppercase, `#481515`). The roll cards have always looked different here. Unify or keep both.
- **Sub-line colour.** `.total-xp` is a strong `rgba(62, 18, 18, 0.9)`; the generic row sub-line is muted
  grey. The XP card reads quieter than it did.
- **Level-up marker.** `.level-up` is orange with a text-shadow. There is no tone for it, and inventing a
  `celebration` tone for one card is the naming mistake this system already made once.
- **Bordered band with a tone.** `.cpb-roll-requested-mode` is a band with a dotted border whose colour
  changes for advantage, disadvantage, and locked. `band` tints fills, not borders.

**Dead in the source, do not carry across**: `.legend-items`, `.resolution-type`, `.monster-name`,
`.monster-xp` in `cards-xp.css` — none appear in any template.

**How to verify**: post each migrated card beside a screenshot of the original and compare padding,
weights, and colours. The Chat Cards suite in `testing/test-harness.js` posts one card per button.

**Priority**: the three gaps are prerequisites for steps 4 and 5. The judgement calls are not blocking, but
the trailing-text one is already visible on a shipped card.

#### 4. Stats simplification
- **Work**: Collapse round and combat summaries to a key-data card plus a "View Details" button opening a
  dashboard window; combat is the aggregate of round. Retires 8 templates and `styles/cards-stats.css`.
- **Location**: `templates/card-stats-*.hbs` (deleted), `styles/cards-stats.css` (deleted),
  `scripts/stats-cards.js`, new window
- **How to verify**: run a combat to completion. The round card and the combat card each show key data and a
  working button; the dashboard opens with the same numbers the old cards showed. Compare against a
  screenshot of the old cards for parity of the underlying stats.

#### 5. Blacksmith's interactive cards
- **Work**: Migrate skill check and vote to compositions and the action dispatcher. Retires the legacy
  `.cpb-chat-card` root and `templates/vote-card.hbs`, and removes the per-card `renderChatMessageHTML`
  plumbing in `blacksmith.js` and `manager-vote.js`.
- **Location**: `window-skillcheck.js`, `manager-vote.js`, `blacksmith.js`, `templates/card-skill-check.hbs`,
  `templates/vote-card.hbs`
- **How to verify**: run a skill check with several actors -- confirm non-owners see disabled rows, owners can
  roll, and results fill in. Open a vote, cast from two player clients, confirm the tally updates on both and
  the GM cannot vote. Close the vote and confirm the result renders.

#### 5b. Skill check migration -- UNVERIFIED IN A LIVE WORLD (2026-08-14)

The card is composed from parts (`scripts/cards-skill-check.js`), `templates/card-skill-check.hbs` is
deleted, and all three render sites go through `skillCheckMessageData()`. **Nothing has been run in
Foundry.** This is the largest untested change in the card work; treat every item below as owed.

- **How to verify**: request a roll for two actors. The card must show a header, a "Requested Rolls"
  section and one clickable row per actor. Click a row: it rolls, and that row becomes a result. Then a
  contested roll (two groups), a group roll with a DC, and a roll with no DC.
- **Two clients**: a `blindroll` must show the total to the GM and a veil to the player, on the same
  message at the same time. A player's own row must stay clickable in every mode -- the card is public on
  purpose.
- **Rows a player cannot roll** get `.blacksmith-row-not-yours` at render, dimmed. The permission itself
  is checked in `SkillCheckDialog.handleRollAction`.

#### 5c. Stats cards migrated -- CSS NOT YET SAFE TO DELETE (2026-08-14)

Round and combat now post ONE card each (`scripts/cards-stats.js`), replacing four messages apiece.
Nine templates deleted: the eight `card-stats-*` and the orphaned `templates/stats-combat.hbs`, which
nothing had rendered in a long time. **Unverified in a live world.**

- **How to verify**: end a round with the stats settings on -- expect exactly ONE card, not four:
  header, MVP ribbon and portrait, three tiles (Damage / Kills / Healing), a Party section with one
  subject per actor carrying the red-to-green ratio bar, and a "View the details" button that opens the
  stats window. Then end a combat for the aggregated version. Then a round where nothing happened, to
  confirm the ribbon and MVP block drop out rather than render empty.
- **`styles/cards-stats.css` is deleted (2026-08-14).** The caution recorded here was based on two false
  positives: `stat-label` matches inside `combat-hover-stat-label`, which is what the combat bar
  actually emits, and a bare class NAME appearing in a live template says nothing about whether its
  RULE can match. Re-audited with whole-token matching and a self-check: of 58 classes, six appear in
  live markup, and every one of their rules is a compound selector needing a dead ancestor
  (`.mvp-info .player-name`, `.status-tag.rank`, `.turn-time.expired`, `.mvp-stat-card h4 .fas`,
  `.party-timing-stats .timing-stat .label`). Nothing in the file could match anything.

#### 5d. Vote card -- MIGRATED, verified live (2026-08-15)

Composed from parts (`scripts/cards-vote.js`); `templates/vote-card.hbs` deleted and the card rules
split out of what is now `styles/window-vote.css`, renamed because it holds only the window's rules. The confirmed leak is closed: the card
re-renders per client, and the voter detail is not on it at all.

Verified with two clients: only the GM sees Close Vote, the count updates as votes arrive, a player's
own choice highlights with a tick on their screen alone, and the GM sees "Waiting on" shrink.

**Do not put the voter detail back on this card.** A veiled value is presentation privacy -- the value
still travels to every client -- and a ballot a player can read from the flags is not a ballot. The
count is fine, and "who has not voted yet" is fine, because a name there says only that someone has yet
to act. If the detail is ever wanted on the card, the honest mechanism is a whisper.

**Still owed**: headless harness assertions for `composeVoteCard`, matching the ones for the skill
check and stats composers. It is pure, so every branch -- active, closed, no options, a winner, the
GM-only parts -- is assertable without a vote happening.

#### 5e. Imported journal pages need their own styling (2026-08-15)

`styles/overrides-foundry.css` was deleted. It restyled `.journal-page-content` -- Foundry's own journal
body -- for EVERY journal in the world: core content, compendium pages, and anything Cartographer,
Scribe or a third-party module writes. Not gated behind a setting; the file itself said "These are not
in Settings yet".

**Four of its five rules were not taste. They fixed OUR import output**, and that problem comes back
with the deletion. Recorded here so it is not rediscovered from scratch:

    /* Breathing room between stacked JSON-import sections
       (themes often collapse margins) */
    .journal-page-content ul + h2,
    .journal-page-content ul + h3,
    .journal-page-content blockquote + h2,
    .journal-page-content blockquote + h3 { margin-top: 1.1em; }
    .journal-page-content h2 + h3          { margin-top: 0.85em; }

    /* Taste, not a fix -- emphasis on journal headings */
    .journal-page-content h2 { font-weight: 700; font-size: 1.9em; }
    .journal-page-content h4 { font-weight: 900; font-size: 1.25em; }
    section.journal-page-content img { border-radius: 4px; }

**Do this as part of the Scribe / import / cards effort, not before it.** Scoping these rules now would
be scoping a hack we are about to replace: we got here by styling CORE elements to bend them into shape,
and the direction of travel is that our content carries its own elements. An imported page should be
recognisable as ours -- a class the importer stamps, or a custom element -- and styled through that,
so the fix reaches our pages and no one else's.

- **Where**: whatever stamps imported journal pages (the JSON import registry), plus a scoped stylesheet.
- **How to verify**: import a page with stacked lists and blockquotes; the spacing holds. Then open a
  core compendium journal and confirm it renders exactly as Foundry draws it, with nothing of ours on it.

#### 6. CSS consolidation
- **Work**: Collapse the five card CSS files to one layout file and one theme file. Delete the `theme-default`
  render-time rewrite hook in `blacksmith.js` -- the world default is resolved at post time as of step 1.
  No legacy CSS is preserved for old chat history (decision 8).
- **Location**: `styles/cards-*.css`, `styles/default.css` (imports), `scripts/blacksmith.js`
- **How to verify**: post one card of every type in each of the 9 themes and confirm none has lost styling.
  Confirm a new CSS file added without an `@import` in `default.css` is silently unstyled -- so check the
  import chain explicitly. Run `node tools/check-design-tokens.mjs`.

## ENHANCEMENTS

### High Priority

#### One time surface, exposed to the suite (opened 2026-08-23)

**Plan: `documentation/plans/plan-time-api.md`.** Not started.

Five table-facing wall-clock timers in Blacksmith -- planning, combat, round, session, real-time note
reminders -- each with its own tick, persistence, sync and pause semantics. `timer-notifications.js`
already shares the *output*; the mechanics are not shared, and "fire the warning once" is implemented twice
independently (`timer-planning.js` and `api-menubar.js`).

**The reason is the siblings, not tidiness.** Other modules need time-bound events and will each grow their
own otherwise. This is a public surface from the first commit; Blacksmith's own timers are the first
consumers and the proof it is right, not the reason for it.

Three surfaces, deliberately not one: `countdown` (a deadline with tick, pause, persistence, fire-once),
`schedule` (a wall-clock callback, sibling in shape to the existing `worldClock.schedule`), and `session`
(exposing `sessionStartTime` / `sessionEndTime`, which already exist and are already synced).

**World time and wall time stay separate.** World time is server-authoritative, jumps, and runs backwards
when a GM rewinds. Merging them behind one call would be the third place that mistake was made -- see the
two-clock tables in `architecture-notes.md` and `architecture-calendar.md`.

Work, in order. Each step is finished when the OLD interval is deleted, not left beside the new one:

- Build `countdown` and `session`, used by nothing. Verify: a scratch countdown ticks, pauses, survives a
  reload, and fires its warning and expiry exactly once each.
- Move real-time note reminders onto it. Days old, no consumers, and its 15s poll is what the shared tick
  replaces. Verify: `testing/note-reminders.md`, real-time sections, all still pass.
- Move the round timer. Simplest and least load-bearing of the four. Verify: round and total durations
  survive a mid-combat reload.
- Publish the API docs and tell the siblings. **Consumers before further migration** -- the surface is
  proven by an outside caller, not by our own code shaped to fit it.
- Session timer, then planning, then combat. One at a time, each verified live on two clients.

Also folds into this: the real-world calendar mode in `plan-calendar-window.md` should be `session`'s
planning view rather than a second store of its own, and "a reminder that fires at session start" is a hook
on `session`, not a scheduled time.

#### Request-side roll modes and explainer (Bibliosoph request #5, 2026-07-30)

Both shipped and are recorded in `CHANGELOG.md`; what remains is the live verification
below. Design is in `architecture/architecture-rolls.md` ("Requester-supplied roll parameters") and the
surface in `api/api-requestroll.md`. Consumer waiting: Bibliosoph's treatment rolls currently state the
required mode in the request title and detect what was actually rolled by sniffing the formula for `2d20kh` /
`2d20kl`; both items below exist to let them delete that.

- **`rollAdvantage` on the request**: `'advantage' | 'disadvantage' | 'normal'`, global and per-actor (per-actor wins), honoured in the Roll Configuration window and the cinematic overlay. Pre-selects and marks the requested button; `lockRollAdvantage: true` removes the other two. **How to verify live**: silent request with `rollAdvantage: 'advantage'` — the card shows an Advantage badge, the roll window opens with Advantage marked, and clicking it produces a `2d20kh` formula in the result tooltip; the same request with `lockRollAdvantage: true` shows only the Advantage button in both the roll window and (with `isCinematic: true`) the cinematic overlay; a two-actor request giving one actor `'disadvantage'` per-actor and the other nothing produces `2d20kl` for the first and the global mode for the second; `rollAdvantage: 'normal'` with the lock leaves exactly one button and rolls `1d20`; a request with no `rollAdvantage` behaves exactly as today, three live buttons and nothing marked.
- **`explanation` on the request card**: requester-authored prose rendered on the chat card independent of `showRollExplanation`. **How to verify live**: silent request with `explanation` set and `showRollExplanation: false` — the prose appears alone; with `showRollExplanation: true` both the explanation and the SRD skill description appear, explanation first; with neither, the card is unchanged from today.

#### Grow the test harness as APIs get touched

- **Landed 2026-07-30**: `testing/test-harness.js` plus suites for `api.dialog`, `api.entityList`, `api.quantitySplit`, and window delegation — 83 headless assertions, all passing. Two tiers: headless assertions behind a "Run All Headless" button, and interactive checks for what only a person can judge. Contract and suite shape are documented in `testing/harness-lib.js`.
- **The rule that keeps it honest**: a harness asserting a stale contract is worse than none, because it manufactures confidence. Update the relevant suite **as part of** the change that alters an API, the same way the workflow already treats the docs. If it is optional, it rots.
- **`compendiums` suite added** when `search()` landed, per the rule below — it derives every fixture from the live world rather than naming content, which is the pattern any suite over user-configurable data should follow.
- **Next suites, in priority order**: `hookManager` and `sockets` — the two siblings actually break against, and `sockets` is already the #1 post-reset rewrite, so a suite written before that rewrite gives it a regression net. Then `tags`, `toast`. Do not port all twenty APIs speculatively; add a suite when its API is next touched.
- **Not yet covered anywhere**: cross-client behavior. Every current check runs on one client, so socket targeting and receipt-side filtering still need a second connected client and cannot be asserted headlessly. Worth stating in the sockets suite when it lands rather than implying coverage it does not have.
- **Candidate to absorb**: `utilities/api-toolbar-test.js` and `utilities/toolbar-targeting-test.js` predate the harness and duplicate its role. Fold them into a `toolbar` suite when the toolbar API is next touched.

#### Dead `render` option on directly-constructed DialogV2 instances

- **Found 2026-07-30** while building `api.dialog`, and confirmed against the v13 API docs: `render` and `close` are **`DialogV2WaitOptions`** — options of the static `wait()` / `confirm()` / `prompt()` methods. They are **not** constructor options, so `new DialogV2({ render })` silently ignores the callback.
- **Affected**: `window-vote-config.js:148` passes `render` to `new DialogV2(...)` to focus the title field — that focus has never happened. Audit the other `new DialogV2` sites (`api-menubar.js` 4, `manager-vote.js` 2, `utility-common.js` 1) for the same pattern.
- **Fix**: either move the call to `DialogV2.wait({ ..., render })` (which also removes the hand-rolled promise and explicit `close()` those sites carry), or override `_onRender` on a subclass. Migrating them onto `api.dialog` resolves it for free and is the preferred route.
- **How to verify**: open the Create Custom Vote dialog and confirm the title input is focused on open.
- **Priority**: Low — cosmetic (missing focus), but it is a silent-no-op pattern worth removing before it is copied again.

#### Journal Tools entity replacement should resolve through `api.compendiums`
- **Context (author, 2026-07-18)**: the Compendiums API now handles exactly what Journal Tools does by hand — plain text in, formatted compendium/world link out (`resolve`/`resolveMany`, canonical name-to-UUID). `manager-journal-tools.js` predates it and drives `compendiumManager` + the per-type setting names directly.
- **Need**: route the entity-replacement lookups through `api.compendiums` so both features share one resolver (and its index caching). Fold into the Journal Tools de-clunk refactor (see TECHNICAL DEBT) rather than as a standalone change — the scan/collect/apply extraction is the right moment.
- **Priority**: Low-Medium — consolidation, not a bug; the current path works.

#### Request Roll cannot be fully disabled
- **Found**: 2026-07-18 (author, during toolbar-visibility testing).
- **Issue**: `requestRollShowInFoundryToolbar` only hides the Foundry-toolbar button; there is no master off-switch for the Request Roll feature. Harder than it looks: the menubar/CoffeePub toolbar surfaces it too, and **other modules can invoke it via the API** (`SkillCheckDialog` / request-roll surface), so a true disable needs a decision about what a consumer API call does when the feature is "off" (throw? no-op with log? still work headlessly?).
- **Need**: design the gate first (load gate vs UI-only vs API-refusal — see the §8 load-gate model), then implement across the button surfaces + API entry points.
- **Priority**: Low-Medium — polish, but the current toggle implies more off than it delivers.

#### Audit `requiresReload` flags now that setting-change handlers are live
- **Found during the settingChange verification (2026-07-18)**: many settings carry `requiresReload: true` from the era when the change handlers were dead and reload was the *only* way changes applied. Now both mechanisms fire on Save: e.g. scene-title styles apply instantly and then Foundry redundantly prompts for a reload; `menubarCombatSize` half-applies live (CSS var) and needs the reload to settle the rest of the bar layout.
- **Need**: per-setting decision — where the live handler fully applies the change, drop `requiresReload` so Save is clean; where it can't, keep it. Do this with the settings sheet open and a checklist, not as a blanket sed. **Data from the 2026-07-18 test round**: confirmed DROP candidates — scene-title styles, `sidebarPinUI`, `sidebarStyleUI`, `sidebarManualRollsEnabled` (all applied fully live, prompt was redundant); confirmed KEEP — `sidebarCombatChatEnabled` (tab injection needs the reload), `requestRollShowInFoundryToolbar` (scene-controls button only clears on reload); RECHECK — `menubarCombatSize` (half-applies live; if the bar renders correctly after reload, keep the flag or fix the live path).
- **How to verify**: for each flag dropped — change the setting, Save → change fully applies with **no reload prompt**; for each kept — the prompt still appears and reload applies it.
- **Priority**: Medium — pure UX polish, but the redundant prompts now actively misrepresent which settings need a reload.
- **Doc follow-up**: the ⚠️ block in `architecture-blacksmith.md` §9B.2 describes the dead registrations — once verification passes, it should be rewritten to describe the helper (documentation agent).

#### Design system: make it upstream of the component docs
- **Why it matters**: cross-module design continuity is "better but lacking." The design-system docs are now audited and published, but they do not yet *drive* the per-component docs, which each restate design details that have diverged.
- **Done 2026-07-20 — audit and split.** The 1,564-line `design-system.md` was verified against `styles/` (54 files, 16.5k lines), `templates/`, and `scripts/`, then replaced by four published pages: `design-tokens` (all 63 `vars.css` tokens), `design-components`, `design-patterns`, `design-extending`. The audit found the doc described the pre-`vars.css` world — 19 hexes in the palette section had tokens the doc never named — and that **every wrong claim sat inside a pasted markup block while the class names and file pointers were nearly all correct**, which is why the new pages name classes and cite `file:line` instead of pasting HTML. Consumer-facing errors that would have produced non-working sibling-module code: a fabricated `api.menubar.addButton()` (real: `registerMenubarTool(toolId, toolData)`), an ApplicationV1 window example (`static get defaultOptions` — zero occurrences in the repo; all 14 real windows use `static DEFAULT_OPTIONS` + `static PARTS`), and a debug-logging pattern with zero call sites (real: `postConsoleAndNotification`, 955 calls). Defects found in passing went to `known-issues.md`; tech debt is in the two entries above. `tools/check-design-tokens.mjs` now fails the build if any documented token value drifts from `vars.css`.
- **Remaining scope — the continuity fix**: make the design-system pages upstream of the component docs (chat cards, windows, pins, menubar, timers). Those `api-`*/`architecture-*` pages should point at and conform to the design system rather than restating design details. Start by grepping the published component docs for class names and token names that also appear in `design-components`/`design-tokens`, and replace the restatement with a pointer.
- **Relationship**: the "Card CSS migration to theme system" item below is a facet of this — fold it in when this starts.
- **Window-template gap found 2026-07-19**: `.blacksmith-window-template-body` ships with **no padding**, so every window re-invents the gutter (`notes-gm.css` 12px; `window-json-import.css` 0 + internal panel padding; `window-toast-send.css` 12px). When the design-system pass touches windows, decide a default body gutter in `window-template.css` and strip the per-window overrides (watch for double-padding in windows that pad internally). Same pass should reconcile field-label styling: the shared `blacksmith-field-label` (small uppercase) vs the importer's own bolder sentence-case labels — one canonical label style in the shared kit.
- **Window themes are asymmetric between the two bases (noted 2026-07-29)**: the Light/Dark/Glass trio exists only in `window-tool-base.js` + `styles/window-tool.css`; `window-base.js` has no theme concept and `styles/window-template.css` has no theme hooks. A consumer on the standard base gets one presentation, on the Tool base gets three. Nothing is blocked on this — Squire's transfer tool correctly uses the Tool base — but the asymmetry is undocumented and a consumer picking a base has no way to know theming rides on that choice. Decide deliberately and write it down: extend the trio to the standard base, or state the split as intentional (persistent canvas palettes are themeable; editors and forms are not) in `api-window.md`'s base-class comparison table.
- **Blocked on**: nothing — the wiki reset is complete.
- **How to verify**: every token/class named in the split docs resolves to a real definition in `styles/`*; no design detail is stated divergently between the design-system docs and a component doc; a sibling can style a card/window from the consumer reference and match Blacksmith.
- **Priority**: Highest post-reset.

#### CSS tech debt surfaced by the design-system audit (2026-07-20)
These were section 15 ("Known Inconsistencies") of `design-system.md`. That section was future-work commentary living inside a spec, so it moved here; each claim below was re-verified against the CSS on 2026-07-20, and the counts are current as of that date.

- **Adopt the tokens that already exist.** `styles/vars.css` defines 63 tokens, and **21 of them are referenced by no CSS in the module** — the entire `--blacksmith-status-`* family (5), the entire `--blacksmith-interactive-*` family (3), all three `--blacksmith-shadow-*`, and most surfaces. Meanwhile **124 raw hex literals across `styles/` are byte-identical to a token that already exists**: `#594a3c` x48 (`--blacksmith-color-brand`), `#c15701` x15 (`-brand-accent`), `#8d8061` x13 (`-brand-muted`, otherwise unused), `#8b0000` x7 (`--blacksmith-status-danger`), `#bdbdae` x6 (`--blacksmith-text-light`), `#0e0c0c` x5, `#ada39d` x5, `#4b4b4b` x4, `#f6f1ed` x3, `#629602` x3, `#313030` x2, `#e4ddd9` x2, `#d63737` x2, plus `#222222` x9. Repo-wide the CSS holds 649 raw hex literals against 609 `var()` references. This is a mechanical find-and-replace per literal, not a design decision — the token and its value already agree. **This supersedes the old "hardcoded colors should become variables" framing: the variables exist, the CSS just does not use them.**
- **Legacy Hungarian-notation tokens.** 9 remain, all in `styles/common.css:8-16` (`--intChatSpacing`, `--strHideRollTableIcon`, `--strSceneTextAlign`, `--strScenePadding{Left,Right,Top,Bottom}`, `--strSceneFontSize`). Migrate to `--blacksmith-[component]-[property]` when those features are next touched. Note these are written by the scene-title/chat settings handlers, so renaming them means updating the JS that sets them.
- **Duplicate rules in `window-common.css`.** `div#coffee-pub-blacksmith .window-content` is declared 3 times, and `styles/window-common.css:70` still carries `/* -------- THINGS BELOW HAVE NOT BEEN ORGANIZED ----------- */`. Consolidate to one rule per selector per file.
- **`cpb-` vs `blacksmith-` prefix split — resolved for the parts system, 2026-08-14.** The note said this was worth a decision only if the card system was ever rebuilt; it was, so the decision was taken. Every class and data attribute the parts system introduced is `blacksmith-`, including the dispatcher's `data-blacksmith-action`. Legacy `cpb-chat-card`, `cpb-roll-result` and the rest are deliberately untouched: they die with their cards at steps 4 and 5 rather than being renamed on the way out. What remains of this item is that cleanup, which happens by deletion.
- **`.bh-` namespace is unused.** Referenced nowhere in `styles/`, `templates/`, or `scripts/`. The reservation was dropped from the design docs; either adopt it deliberately or leave it dead.
- **Typography is partly tokenized.** `vars.css` now defines `--blacksmith-font-size-{xs,sm,base,md,lg,xl}` and `--blacksmith-font-weight-{light,normal,bold,black}`, so the old "not tokenized at all" claim is obsolete. Card-context sizes are still literal `em` values in the card CSS; fold that into the card-theme migration below rather than doing it standalone.
- **How to verify**: after the token-adoption pass, no hex literal in `styles/` matches a value defined in `vars.css` (the audit script in the design-system effort checks this mechanically), and the rendered UI is pixel-identical — these substitutions are value-preserving by construction.
- **Priority**: Medium. None of this is user-visible; it is what makes the design system actually govern the CSS instead of merely describing it.

#### Dead CSS found during the design-system audit (2026-07-20)
- **`styles/widget-tags.css` (154 lines) is unlanded, not dead** — do not delete it. It appears in neither `styles/default.css`'s import list nor `module.json`'s `styles` array, so none of its rules apply. 14 of its 15 `bsw-`* classes are emitted by `templates/partials/tag-widget.hbs`, and `scripts/widget-tags.js` (imported at `scripts/blacksmith.js:88`) registers that template as the `blacksmith-tag-widget` partial. What is missing is the last step: **no template invokes the partial**, and the stylesheet is not imported. The tag widget is therefore a complete, inert feature — nothing renders it, so nothing is visibly broken today. Landing it means adding the `@import` to `default.css` and a `{{> blacksmith-tag-widget}}` call site. Deleting the CSS instead would destroy the styling for a feature that is one call site from working.
- **`--blacksmith-variant-timeline-`* duplicates `--blacksmith-variant-info-*`.** Both pairs are `rgba(47, 68, 106, ...)` (`styles/vars.css:112-113` and `:124-125`), so the two variants render indistinguishably despite being presented as distinct. Decide: give `timeline` its own hue, or drop it and alias consumers to `info`. This is a design call, not a cleanup — the published token page currently states the duplication as fact.
- **Priority**: Low.

#### Move media under a single `assets/` folder
- **Issue**: media is scattered across three top-level folders plus one nested inside `themes/`. Foundry's
  convention is a single `assets/` root, and adopting it collapses four entries out of a top-level listing
  that already has nineteen directories.
- **What moves** (counts are tracked files): `images/` (466 across banners, pins-map, pins-note, tokens,
  tiles, markers, backgrounds, portraits, overlays, misc), `sounds/` (135 across reactions, steps, objects,
  gore, general, cartoon), and `themes/request-roll/{images,sounds}` (16). Target shape:
  `assets/images/...`, `assets/sounds/...`, with the theme's media either alongside them or left in place
  as part of that theme's self-contained bundle -- decide which, because a theme is arguably one unit.
- **Blast radius**: 95 references to `images/` and 12 to `sounds/` across `scripts/`, `styles/`, `templates/`,
  and `lang/`. `module.json` declares none of it, so nothing there changes. **The risk is not the code
  references** -- those are greppable and a compile check catches a miss. It is the paths that are not in
  code: values already saved in world settings, journal entries, tiles, and playlists that point at
  `modules/coffee-pub-blacksmith/images/...`. Those live in the author's world, not this repo, and moving
  the file silently breaks them.
- **Status: deferred (2026-08-13).** Not blocked on anything, just not now.
- **When it happens it needs a migration tool, not a `git mv`.** The author's call. A world already holds
  paths pointing at the old locations in settings, journals, tiles, and playlists, and only a tool that
  walks those documents and rewrites them can move the files without breaking a live world. Writing that
  tool is the bulk of this item; moving the files is the easy part. It belongs in `testing/`'s neighbour
  `utilities/`, since it is a one-off action a person runs, and it should report what it changed rather
  than changing things silently.
- **Therefore**: this needs a decision on whether to leave redirect stubs, ship a one-time migration that
  rewrites stored setting values, or accept the breakage and fix references by hand. Do not start the move
  before that is settled.
- **How to verify**: `grep -rn "modules/coffee-pub-blacksmith/\(images\|sounds\)/"` returns nothing outside
  `assets/`; then load a world and check the surfaces that pull media -- pin icons, token replacement
  images, the sound picker in settings, nameplate backgrounds, and the request-roll theme.
- **Priority**: Low. Pure housekeeping with a real breakage risk, so it wants a quiet moment, not a
  moment between features.

#### `applicationv2-window/` — decide its disposition
- **Issue**: `documentation/applicationv2-window/guidance-applicationv2.md` (539 lines) has never been audited and is **not published to the wiki**, yet three published pages point at it by repo path — `api-window.md`, `architecture-window.md`, and `architecture-blacksmith.md`. Those render as plain text on the wiki (the sync downgrades unpublished targets), so nothing is broken, but a wiki reader is sent off-wiki to the repo to find how to build an Application V2 window.
- **Options**: (a) audit, scrub to the formatting standard, and publish it as its own page; or (b) fold it into the design-system split as originally planned, since window guidance is design-system material. Either way `applicationv2-window/README.md` (27 lines, quick start for the example) gets deleted and the `.webp`/`.png`/example files stay as repo assets.
- **If it publishes**, revisit the wording of those three references so they name a wiki page rather than a repo path.
- **Artificer has its own copy** of `guidance-applicationv2.md` (found 2026-08-13). Whatever happens here
  has to account for it, or one gets fixed and the other drifts -- the same shape as the `cards-common.hbs`
  fork, one layer up. Tracked in `TODO-GLOBAL.md` under forked hub code.
- **Priority**: Medium — fold it into the design-system effort rather than doing it standalone.

#### Publish the importer docs once the import work is verified
- **Issue**: `api/api-importer.md` (474 lines) and `architecture/architecture-importer.md` (311 lines) are the only two `api-`*/`architecture-*` docs not on the wiki. They were written ahead of the functionality, so they are held under the rule that a doc describes what exists.
- **Gate**: the JSON-import work lands and passes live testing. Then audit both against the finished code, scrub to the formatting standard, and add them to `PUBLISH` in `tools/wiki-sync.mjs`.
- **Priority**: Medium — this closes the documentation set with nothing held back.

#### Card CSS migration to theme system
- **Issue**: RESOLVED. All three card-type stylesheets (`cards-xp.css`, `cards-skill-check.css`, `cards-stats.css`) were deleted with the cards they styled; what replaced them takes its colour from the theme variables throughout.
- **Status**: PENDING
- **Location**: nothing left to do. The as-built theme system is described in `documentation/architecture/architecture-chatcards.md`.
- **Need**: Grep each card-type file for hardcoded `color`/`background`/`border-color` values and replace with `var(--blacksmith-card-*)`, reusing existing theme variables where the meaning matches and adding XP/skill-check/stats-specific or semantic (success/failure/warning) variables — all `--blacksmith-card-` prefixed — where none fit. Decide per semantic color whether it is theme-dependent (add to each theme) or fixed (keep hardcoded, document). Keep layout/spacing in the layout file, colors in the variable blocks. Test every card type under all themes.
- **Priority**: High – Improves theme consistency and maintainability

### Medium Priority

#### Player-facing toast system (phased: local primitive → multi-action → cross-client)
- **Status**: Phase 1 shipped and live-verified (2026-07-24). Phases 2–3 pending.
- **Shipped (Phase 1)**: `api.toast` — `show({ title, subtitle, icon, image, duration, onClick, onDismiss, stackKey, moduleId })`, `remove`, `clearByModule`, `getActive`. Local per-client primitive, `scripts/api-toast.js` + `styles/toast.css`; docs at `documentation/api/api-toast.md` and `documentation/architecture/architecture-toast.md`; leader-change dogfood toast wired into the `partyLeader` settingChange callback in `api-menubar.js` (runs alongside the chat cards). Full detail in `CHANGELOG.md` 13.9.3.
- **Call to action (shipped 2026-07-25 — pending live verification)**: `show()` takes `callToAction` — a button-styled label inside the existing single click target (NOT a second event; body `onClick` handles it), small/medium/large billboards only, requires a live `onClick`, accent-styled, relays strip it along with callbacks so it is receipt-side-only by construction. **How to verify**: `api.toast.show({ title: "CRITICAL HIT!", size: 'medium', callToAction: "Roll for the Crit Card", onClick: () => console.log('rolled') })` → pill button below the text, whole-billboard hover lights it, any click logs once and removes the toast; omit `onClick` or `size`, or use `fullscreen` → no button; with `color:` the button wears the accent.
- **Phase 2 — actions beyond the body click**: optional `actions: [{ label, onClick }]` button row for multi-choice toasts ("roll for crit" / "read message" / "acknowledge"). Phase 1's single body-click API must not change shape when this lands — actions are additive. Note the architecture constraint: toasts are immutable DOM (no `update()`), so an action row is part of the built element, not patched in later.
- **Phase 3 — cross-client delivery (gated on the socket rewrite, #1)**: `api.toast.send({ recipients, ... })` riding `api.sockets`; GM or a module pushes, targeted clients render via the Phase 1 primitive. Respect the socket privacy rule — targeting is receipt-side; never send secrets in the payload.
- **Consumer migration (after Phase 1 verifies)**: Bibliosoph swaps `_showSplash` (`manager-conversations.js` :1252) for `api.toast.show()` — its splash policy (per-kind settings, mention-always, auto-open fallback) stays Bibliosoph-side. Goes in `TODO-GLOBAL.md` / Bibliosoph's own TODO, not here.
- **Notification channel settings (the migration mechanism — shipped for leader + movement)**: the **Notifications** settings section (`settings.js`, `WORKFLOW_GROUPS.NOTIFICATIONS`) holds one world-scoped choice per migrated feature — toast / chat / both / none via `NOTIFICATION_CHANNEL_CHOICES`, **default `toast`** unless a feature deliberately chooses otherwise. `notifyLeaderChange` and `notifyMovementChange` are live: toast gated receipt-side in the feature's `updateSetting` hook, chat card gated GM-side at its `ChatMessage.create` site. Every future migration adds its `notifyX` setting to this section and gates both ends the same way.
- **Timer notifications: MIGRATED** — `notifySessionTimer` / `notifyPlanningTimer` / `notifyCombatTimer` channels route all three timers' announcements via the shared `routeTimerNotification()` (`timer-notifications.js`) and the internal `broadcastToast()` socket relay (see `architecture-toast.md`); redundant `ui.notifications` banners removed (combat auto-advance banner deliberately kept — nothing else carries it). Per-kind toggles stay in each timer's own settings section. Full detail + verify matrix in `CHANGELOG.md` 13.9.3.
- **Chat-noise reduction — remaining candidates** (2026-07-17 survey of all `ChatMessage.create` sites):
  - *Needs targeting or piggybacks on chat today*: **vote open/result announcements** (`manager-vote.js` :795 is the interactive vote card itself — stays until Phase 2 actions; only the result *announcement* is toast material). (Hurry-up nudges migrated 2026-07-24 — see `CHANGELOG.md`.)
  - *Stays in chat (record value — do not migrate)*: combat stats/MVP round summaries (`stats-combat.js`), XP distribution (`xp-manager.js`), roll results (`manager-rolls.js`, `window-skillcheck.js`), reputation cards (`manager-reputation.js`), marching-order/conga table (`token-movement.js` :1420), the Manual Rolls GM audit whisper (`ui-sidebar-style.js` :553 — arguably a GM-only toast later, but it is an audit trail).
  - NOT yet — the leader toast currently runs alongside the cards; each migration is its own change with its own verification.
- **Turn notification with the combatant's portrait (ON HOLD 2026-07-24 — author decision)**: do not build yet — the author suspects turn announcements belong in a sibling module, not Blacksmith; revisit ownership before any work. The endorsed part of the idea: timer messages (turn warning/expired) carrying the face of whoever is holding things up, for context — when this is picked up, the mechanics are the toast `image` slot (round avatar, wins over `icon`), `getPortraitImage` in `api-core.js`, and threading the image through the timer payload into `timerToastContent()` (`timer-notifications.js`). The hurry-up nudge toast already demonstrates the pattern.
- **New toast option adoption — candidates (2026-07-23, post-13.11 build)**: the publish/animation/billboard options shipped; these are the wiring candidates, each its own change with its own verification when picked up. Billboard + animation moments: **vote result announcement** (`manager-vote.js` — result only; the interactive card stays until Phase 2 actions) as a small billboard with `pop`; **XP distribution award** (`xp-manager.js`) as a medium billboard with `pop` alongside the chat record; **combat round MVP headline** (`stats-combat.js`) as a billboard with `slam` while the full summary stays in chat; **timer expirations** ("time's up" moments in `timer-notifications.js` routing) upgraded from plain toast to small billboard with `pop`. Stream (`publish: 'both'`) moments for spectator/recording value: round MVP, XP awards, vote results, and session start/break/end billboards (a persistent `pulse` "Back in a few" board is the break-screen case). Sibling-side (not this repo): crit/fumble slam/shake wiring belongs to the rolls consumer module once the `blacksmith.rolls.`* consolidation lands, and Bibliosoph's splash migration can adopt animations when it swaps to `api.toast` (both tracked in `TODO-GLOBAL.md` / sibling TODOs).
- **Future-proofing ideas (captured, not committed)**: priority/queue ordering when stacked; themes via the design-system tokens; Phase 3 ack-back ("player clicked acknowledge" reported to the GM).
- **Toast templates (later)**: add a Save as New workflow to the GM Send Toast window so a configured toast can be named and reused. Define template ownership, rename/delete behavior, and whether templates are client- or world-scoped before implementation; title and message may be template content even though they are deliberately excluded from ordinary last-used preferences.
- **Priority**: Medium (feature). Phase 2 is unblocked; Phase 3 is gated on the socket system.

#### Scene "burden" calculator — developer tool for scene performance cost
- **Issue**: no way to quantify how expensive a scene is before players hit it. The costly scenes are the counter-intuitive ones — wide-open maps with few walls mean huge unoccluded areas, so light, sound, and vision polygons cover far more space and every token-vision refresh does more work. A "burden" score would let us test scenes against calibrated benchmarks and eventually warn in real time that a level is "too much".
- **Status**: PENDING — needs a plan (feature; phased below)
- **Location**: new dev tool; nearest pattern is `scripts/utility-performance.js` (perf monitor — dynamically imported, surfaced via the menubar hamburger, gated behind its enable setting). Same load-gate treatment applies.
- **Phases**:
  1. **Calculator** — on demand, score the current scene from its document + canvas state: dimensions/grid area, wall count *and* open-space ratio (walls actually *reduce* vision cost by occluding), light sources (count, radius, animated?), ambient sounds, tokens with vision enabled, tiles/drawings, fog exploration size. Output a breakdown, not just one number, so we can see *which* axis is heavy. Surface via the perf-monitor menu or a console-callable API first — UI polish later.
  2. **Calibrate** — run it across known-good and known-bad scenes (and the burden-of-knowledge campaign's real scenes are ideal test data — read-only, never edit) alongside observed FPS/refresh timings to weight the axes into meaningful thresholds. Until this phase, the score is a raw metric, not a verdict.
  3. **Real-time advisory** — once calibrated, evaluate on `canvasReady` (and optionally on wall/light/token changes, debounced) and warn the GM when a scene crosses the "too much" threshold. GM-only, low-noise (once per scene load, not per change).
- **Design questions for the plan**: static document analysis vs. live measurement (e.g. timing an actual `canvas.perception` refresh) — probably both, since phase 2 needs the live numbers to calibrate the static score; where the score lives (pure function in the utility vs. exposed on `module.api` for siblings like Cartographer, which builds scenes and would want this).
- **How to verify**: run the calculator on a trivially small scene and a large open scene → scores differ in the expected direction with a sensible breakdown; toggling a big light or vision on a token changes the relevant axis; disabled setting → nothing loads (dynamic import not fetched).
- **Priority**: Medium

#### Token blood — remaining work
The Health Indicators system (Blood Damage pools, Blood Hit bursts with damage/attack triggers and sound, cleanup timer, visibility gating, Remove/Restore All Blood toolbar buttons) shipped in `CHANGELOG.md` [13.11.0]; each entry there carries its own live-verification steps. Open:
- **Finish the live-verification pass**: core flows (pools per tier, bursts on both triggers, attack-mode fix, player-client rendering) were exercised during development on 2026-07-22; still unverified: GM Only visibility on a player client, the Blood Cleanup slider, Remove/Restore All Blood across two clients, the hit sound, unlinked NPCs at every tier, and the perf-monitor idle check. Steps are in the [13.11.0] entries. When this passes, dismantle `documentation/plans/plan-token-blood.md` per the plans rule.
- **Optional authored splatter art**: replace or augment the procedural texture with bundled webp splatter assets — a drop-in swap at the texture-build step in `manager-token-indicators.js`; tiers, seeding, placement, and visibility all stay as-is.
- **Rewire the combat bar onto `utility-health.js`** so the HP-percent math has one home (it currently computes its own; the helper's 'hurt' tier maps to its "healthy" bucket — see the helper's JSDoc).

Next round (author, 2026-07-22). Note the shared design question for the first and last items: today all blood is *derived* from HP and redrawn from scratch — nothing is stored. Hand-drawn blood and trails left behind by movement are real data that must live somewhere (scene flags, most likely) with their own cleanup story, which is a genuine design shift, not another tier row:
- **Draw blood on the canvas**: a GM paint tool to stamp splatter directly on the ground (click or click-drag), independent of any token's HP. Decide persistence (scene-flag storage vs session-only), whether Remove All Blood clears it, and whether it reuses the procedural drawer at a chosen size.
- **Burst style options**: alternative hit-burst treatments beyond blood — old-school comic "POW"/"BAM"-style graphics and other animation styles — selectable via a burst-style setting alongside the existing trigger/sound settings. The burst pipeline (spawn, animate, destroy) is style-agnostic; only the texture generator varies.
- **Blood color by creature type**: for Blood Damage pools, map dnd5e creature type to blood color (e.g. undead ichor, construct oil, ooze slime) with a sensible default for the rest. Decide where the mapping lives (constants vs setting vs taxonomy JSON) and whether Blood Hit bursts follow the same color.
- **Gore level setting**: one global intensity dial scaling pool sizes, splat counts, and opacity across all tiers (subtle table → full Tarantino), multiplying the existing `_BLOOD_TIERS` values rather than adding new tiers.
- **Blood trails on movement**: optionally leave some blood behind when a wounded token moves — droplets along the drag path, heavier at worse tiers. Interacts with the persistence question above and with Blood Cleanup (trails likely want their own, shorter lifetime).
- **Investigation (2026-07-22) — most of the plumbing already exists; LOE ~1 focused day for v1 plus art**:
  - `scripts/manager-token-indicators.js` already runs per-token PIXI overlays on `canvas.interface` (turn indicator, targeted rings, portrait stacks via `PIXI.Sprite.from`) with movement tracking, delete cleanup, `canvasReady` refresh, and HookManager wiring. Blood is one more indicator type in that framework, not a new system.
  - HP % and the exact severity steps are already computed in `manager-combatbar.js:536-566` (healthy >=75 / injured >=50 / bloodied >=25 / critical), with a cross-system HP path watch list at `:652-663`. First step: extract a shared `getHealthPercent(actor)` + severity helper so blood is the second consumer rather than another copy.
  - Quick View's hatch (`utility-quickview.js:542-568`) proves the token-conforming overlay pattern (scaled to `token.w/h`, rotation-aware, non-interactive); `images/overlays/overlay-pattern-*.webp` establishes the bundled overlay-texture pattern.
  - Genuinely new: 3-4 alpha webp splatter textures (or one greyscale splatter tinted/scaled per tier); an `updateActor` hook alongside the existing `updateToken` one (linked actors vs unlinked-token actor deltas both need live testing); an enable setting plus a visibility-scope setting (everyone / GM-only / own-tokens-plus-GM — blood on canvas broadcasts enemy HP state to players, the one real design decision). Phase 2: damage-taken flash reusing the manager's existing PIXI animation pattern. No sockets — each client derives the overlay from actor data it already has; no per-frame work, so §9B-clean by construction.
- **Ownership (resolved by the investigation): Blacksmith.** This is canvas indicator UX driven by HP data, both of which live here; it does not need the rolls-classification event surface (it reacts to HP deltas, not crits). Injury *mechanics* stay in the sibling module.
- **Status**: PENDING — needs a plan first (feature, so per the workflow it gets a `documentation/plans/` entry before code: visual approach, thresholds, settings, dead-state treatment — ties into the "Hide Dead" menubar item below).
- **How to verify**: damage a linked and an unlinked token past each threshold → splatter tier updates on all clients; heal → it recedes; visibility-scope setting hides it from players when set; no per-frame cost when idle (check with the perf monitor); disabled setting → no hooks registered.
- **Priority**: Medium

#### Creature-type / subtype token naming — polish
- **Status**: Data, resolver, wiring, and per-key settings are **shipped**. Design is documented in `documentation/architecture/architecture-token-naming.md`.
- **Remaining**:
  1. **Verify in Foundry** — per-key dropdowns appear; type/subtype tokens resolve to the right table; unset entries cascade to the global table.
  2. **Refresh the key/alias index on table create/delete.** The index is built once at load. New *tables* resolve live (the resolver re-checks `game.tables.getName`), but new *keys* need a reload.
  3. **Grow alias coverage** — expands with real-world use; not blocking.
  4. **Later:** allow the table source to be a **compendium** of RollTables. No cascade change, but switch to UUID refs there (cross-pack refs need them).
- **Priority**: Medium

#### GM Notes — expand beyond items
- **Status**: CORE EXTENSION IMPLEMENTED — synchronous and async document resolution, bulk reads, write capability/typed failures, future-field-preserving envelopes, namespaced persisted sections, live contributed-section providers, JournalPage breadcrumb hook context, locked-pack read-only handling, and the reusable shared `createField()` / `renderField()` controller are available. The legacy dnd5e Item/Container card remains supported.
- **Location**: `scripts/manager-gmnotes.js`, `scripts/api-gmnotes.js`, `scripts/ui-gmnotes-field.js`, `scripts/window-gmnotes.js`, `scripts/ui-gmnotes-sheet.js`, `scripts/parsers/parse-item.js`, `prompts/prompt-item-core.txt`, `styles/notes-gm.css`, `documentation/api/api-gmnotes.md`, `documentation/architecture/architecture-gmnotes.md`.
- **Remaining**: (1) Optional first-party Actor read-card placement. Module-owned Journal/JournalPage sheets should mount the shared component rather than requiring Blacksmith sheet detection. (2) Header-control trigger via AppV2 header controls where a body field is inappropriate. (3) Actor import support — mirror the item `itemGMNotes` field into the actor parser/prompt. (4) `gm:` search integration once a Blacksmith search panel exists. (5) Execute `PRESERVE_ON_REIMPORT` when the proposed Importer update-in-place stage is implemented; current importers create new documents only. (6) Optional truly-private storage if secrecy beyond UI-gating is required.
- **Priority**: Medium

#### Roll system: System selection respect
- **Issue**: `processRoll()` does not respect `diceRollToolSystem`; hardcoded to Blacksmith roll path.
- **Status**: PENDING
- **Location**: `scripts/manager-rolls.js`, `documentation/architecture/architecture-rolls.md`
- **Need**: `processRoll()` respects `diceRollToolSystem`; implement Foundry roll path when selected; document in `api-rolls.md`.

#### Roll outcome classification API (hit/miss/crit/fumble/criteria) — UNIFY the four existing implementations
- **Issue**: consumers (and Blacksmith itself) had no API to ask what a roll *meant*. **Phases 1–3 shipped:** `utility-roll-classification.js`, `module.api.rolls`, skill-check + attack hooks. **Phase 2 done:** internal d20/DC migration in `manager-rolls.js` / `blacksmith.js`. **Remaining:** Bibliosoph/Regent adoption (Phase 4).
- **Status**: IN PROGRESS — Phases 1–3 done; Phase 2 internal migration done; Phase 4 in `documentation/plans/plan-rolls-classification.md`
- **Location**: `scripts/utility-roll-classification.js`, `scripts/api-rolls.js`, the four legacy sites below
- **Legacy sites still to migrate:**
  1. ~~`manager-rolls.js` — cinema/window d20 + hardcoded DC 10~~ **done (Phase 2)**
  2. ~~`blacksmith.js` `handleSkillRollUpdate` — partially migrated~~ **done (Phase 2)**
  3. `utility-message-resolution.js` — used by `classify()`; no hook emission yet
  4. `utility-midi-resolution.js` — used by `classify()` and stats; no hook emission yet
- **Contract (shipped):** subscription-first — `blacksmith.rolls.resolved`, `skillCheckResolved`, `attackResolved`, `damageResolved`, `groupResolved`; pull helper `rolls.classify()`. See `documentation/api/api-rolls.md`.
- **`damageResolved` (shipped 2026-07-26 — pending live verification, per Bibliosoph's API request)**: dnd5e damage-application lane in `manager-roll-outcomes.js` — `dnd5e.calculateDamage` stashes the typed breakdown + pre-application HP by actor uuid, `dnd5e.applyDamage` correlates and emits (GM client; non-GM appliers forward via `cpbRollDamageResolved`). Payload: `kind: 'damage'`, amount, tempAbsorbed, typed damages, isHealing flag (healing delivered flagged, not filtered), actor/token/scene ids, `hp: {before, after, max, temp}` for one-liner thresholds. Deliberately does NOT fire the generic `resolved` hook (that stays d20-shaped). Attacker/item attribution fields exist but are always null — MIDI enrichment is follow-up work below. **How to verify**: as GM, click a damage button on a dnd5e chat card → `Hooks.on('blacksmith.rolls.damageResolved', console.log)` shows amount, typed breakdown, and hp before/after matching the sheet; heal → `isHealing: true`, negative amount; damage a target with temp HP → tempAbsorbed matches; a player applying to their own sheet → the hook fires on the GM client, not the player's; a plain skill check fires `resolved` but not `damageResolved`.
- **Midi-QOL Integration setting (shipped 2026-07-26 — pending live verification)**: `enableMidiIntegration` (world, Roll System > Integrations, default on) gates every Midi lane at runtime via `isMidiIntegrationEnabled()` (`utility-midi-resolution.js`) — rolls API, combat stats, player stats — and flips the core-lane "yield to Midi" branches, so disabling it makes core dnd5e detection reclaim Midi-flagged messages; applies live, like the Dice So Nice toggle. **How to verify**: with Midi active and the setting on, a Midi-automated attack fires `attackResolved` once (Midi lane); toggle off, attack again — still exactly once (core lane) and combat stats keep counting; toggle back on mid-session without a reload and the Midi lane resumes.
- **`damageResolved` attribution follow-up**: carry `attackerTokenId`/`itemUuid` when resolvable — MIDI workflows know both; core chat damage buttons usually do not. Needs a stash keyed to the workflow's damage application, not speculation; null stays the documented default.
- **How to verify**: console-classify rolls against known DC; skill-check hooks fire once per roller; group/contested cards unchanged; MVP crit/fumble counts unchanged after Phase 3 migration.
- **Priority**: High — blocks Bibliosoph crit/fumble/reaction automation

#### Rolls API as first-class surface
- **Issue**: Rolls namespace and docs.
- **Status**: Phase 1 shipped — `module.api.rolls`, `documentation/api/api-rolls.md`
- **Location**: `scripts/api-rolls.js`, `scripts/blacksmith.js`
- **Remaining**: Phase 2 internal migration; stats-combat dedupe consolidation (optional)

#### Unified Flags system (cross-feature)
- **Status**: IN PROGRESS – infrastructure complete; journal pins wired; pins storage migration pending.
- **Architecture doc**: `documentation/architecture/architecture-flags.md`
- **API doc**: `documentation/api/api-flags.md`
- **Completed**:
  - Architecture and API docs written (all design decisions resolved)
  - `scripts/manager-flags.js` (FlagManager), `scripts/api-flags.js` (FlagsAPI), `scripts/widget-flags.js` (FlagWidget)
  - `resources/flag-taxonomy.json` — unified taxonomy for all coffee-pub contexts
  - 5 settings registered: `flagAssignments`, `flagRegistry`, `flagVisibility`, `flagTaxonomyOverrideJson`, `flagsMigrationComplete`
  - `game.modules.get('coffee-pub-blacksmith').api.flags` live on init
  - One-time migration shim: seeds `flagRegistry` from `pinTagRegistry` on first GM load
  - Journal pins taxonomy/registry lookups redirected to FlagsAPI (`ui-journal-pins.js`, `window-pin-configuration.js`) — **verified working**
  - `_mirrorFlagsForPin()` called at all 5 write sites in `manager-pins.js`
  - `_clearFlagsForPin()` called at both delete sites
- **Remaining (pins storage migration)**:
  1. `manager-pins.js` `deleteTagGlobally` / `renameTagGlobally` — also update `flagAssignments` for pin context
  2. `api-pins.js` tag methods — wrap to delegate to FlagsAPI (keep existing signatures)
  3. After one release: drop `pin.tags[]` from schema; read only from `flagAssignments`
  4. Migrate `pinTagRegistry` world setting → `flagRegistry` (shim already seeds on first run)
- **Priority**: Medium – Core system working; remaining work is pins storage migration

#### Menubar API: Move built-in tool registration out of api-menubar.js
- **Issue**: `api-menubar.js` is both the registration surface and a registrar of Blacksmith's own tools, so the file mixes API with content.
- **Status**: PENDING — **much smaller than it was.** The party bar is gone (`api-menubar.js:410` records where its contents went), and with it the six party tools, the party health progressbar, and the refresh logic this item was originally about. What is left is three registrations: `leader-section` (`:431`), `movement` (`:460`), and `timer-section` (`:487`).
- **Need**: Move those three into a manager that calls the public API (`registerMenubarTool`), leaving `api-menubar.js` as registration surface, render, and click/context handling only.
- **Priority**: Low – three registrations, and the file is no longer the mix it was.

#### Toolbar Phase 4: Testing & Validation (architecture-toolbarmanager)
- **Issue**: Toolbar Phases 1–3 are done; Phase 4 (testing and validation) remains.
- **Status**: PENDING
- **Location**: `documentation/architecture/architecture-toolbarmanager.md`, `scripts/manager-toolbar.js`
- **Need**: Test tool registration/unregistration; verify compatibility with existing modules; **Foundry v13+ only** (per project target); validate API stability.

#### Embedded other-module variables (Squire / panel-notes)
- **Issue**: Blacksmith code embeds constants that belong to other modules (e.g. Squire), creating tight coupling and fragility if those modules change IDs or naming.
- **Status**: PENDING – Investigate
- **Location**: `_Migration/panel-notes.js` (e.g. lines 40–45: `NOTE_PIN_ICON`, `NOTE_PIN_CURSOR_CLASS` / `squire-notes-pin-placement`, `NOTE_PIN_TYPE` / `coffee-pub-squire-sticky-notes`).
- **Need**: Understand why these are hardcoded in Blacksmith; consider moving to Squire, consuming via a Squire/Blacksmith API, or documenting the coupling and any migration path.

#### Pins: Full automated tests
- **Issue**: Pins API and rendering are in place; automated tests remain. (Note: the repo has no test framework at all — see CLAUDE.md.)
- **Status**: PENDING
- **Location**: `scripts/manager-pins.js`, `scripts/pins-renderer.js`

#### Pins: measure render/load pressure on dense scenes
- **Issue**: Classification-based pre-filtering shipped (`pins-renderer.js:2135`), but the performance hypothesis behind it was never measured. Suspected pressure points: pin DOM node count, per-pin `_sceneToScreen` work on pan/zoom, icon rendering, event overhead. Establish a baseline on a many-pin scene **before** deciding whether viewport culling is warranted — culling was deliberately deferred (see `architecture-pins.md` → Design rationale).
- **Status**: PENDING
- **Priority**: Low — no reported symptom. Do not build culling without a measurement.

#### Hide Dead and Skip Dead — lists, and the canvas
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-menubar.js`, `scripts/combat-tracker.js`, `scripts/manager-combatbar.js`
- **Two halves.** The **list** half is settings `menubarHideDead`, `menubarSkipDead`, `combatTrackerHideDead` with filtering logic — dead combatants stop cluttering the menubar and tracker, and turn order skips them. The **canvas** half is a toggle on the encounter bar that hides the dead tokens on the map itself. Same trigger, different mechanism; do them as one change so one notion of "dead" serves both.

- **Canvas half — requirements (author, 2026-08-02/03)**:
  - Survives reload.
  - Combatants stay in the encounter, so end-of-combat XP still counts them. Hiding is never removing.
  - **Manual, not automatic**: a button on the encounter bar (`manager-combatbar.js`). Nothing hides a token on its own.
  - One press toggles all dead tokens' visibility, for the GM *and* the players alike.
  - Hidden tokens must not be clickable or selectable.
  - **Scoped per scene**, and **combat ending auto-shows them** — the corpses have to come back so they can be looted or cleared away.

- **Why it exists (author, 2026-08-03)**: not tidiness. Corpses swallow clicks and targeting meant for the living, and a client feels slower with ~20 dead tokens on the canvas. Path blocking was originally listed too and has since been ruled out — see below — so the case now rests on interaction, plus a performance claim that is still unmeasured.

- **Mechanism (author, 2026-08-03): dim, do not hide.** A scene flag is the toggle; each client derives the effect from it — for every dead NPC token, drop `mesh.alpha` and set `interactive = false`, re-applied on `canvasReady` and whenever combat or the flag changes.

  Dimming rather than hiding is the better call for three reasons. It **keeps the corpse as information** — where the body fell matters for looting and for the narrative. It **treats the GM and players identically by construction**, which was the requirement every hiding approach struggled with. And because the effect is client-side and *re-derived* from the flag rather than stored, it mutates no token document: nothing to restore, no position loss, no interference with tokens the GM had already concealed.

  So the toggle is "the dead stop getting in the way", not "the dead disappear".

  Rejected, with reasons, so they are not re-proposed:
  - **Token `hidden` flag** — shows at half alpha to the GM by design, so it never satisfies "both GM and players", and it collides with tokens the GM had deliberately concealed; untoggling would reveal them.
  - **Move to an off-map grave zone** — destroys the position, which is the thing worth keeping. Restoring means stashing coordinates and hoping nothing interrupts the round trip, and moving tokens revalidates collision and drags any light source along, so a pile of corpses off the map edge can change what the living can see.

  Honest limitation either way: the token is still present for targeting macros and AoE template maths. Dimmed, not absent — which is correct, since it is still in the encounter.

- **What counts as dead (author, 2026-08-03)**: the combatant `defeated` flag **or** HP <= 0 — either alone qualifies — **and only for NPCs**. A player token is never hidden, whatever its state. A downed PC is dying, not dead: the party has to see where they fell to reach them, and hiding a body the party is trying to revive would be actively harmful. Use `!actor.hasPlayerOwner` for the NPC test, which is the same predicate the party-stats code uses, and read it from `token.actor` so unlinked tokens resolve their synthetic actor rather than the prototype.
  - Consequence worth being deliberate about: a player-owned companion, familiar, or summon is an NPC by intuition but player-owned by ownership, so this rule leaves dead ones on the map. That is the safe default — never hiding something a player has a stake in — but if a table finds dead summons cluttering, the fix is a narrower NPC test, not an exception carved into the toggle.
  - **Guard the HP read.** A combatant's actor may have no `system.attributes.hp` at all — a dnd5e `group` actor can sit on the canvas and join combat, and Foundry does not prevent it (see `architecture-encounter.md`). It also passes `!actor.hasPlayerOwner`, so it classifies as an NPC and reaches the dead test. No hit points means not dead, and an unguarded read here throws inside a canvas hook.
- **State**: a scene flag, cleared on combat end. A scene flag is world data, so updating it propagates to every client on its own — no socket, and the players' canvases follow the GM's button press for free. `deleteCombat` / combat end clears it, which is what makes the corpses reappear for looting.

- **Dimming solves the interaction half and does nothing for the performance half.** Worth stating plainly, because with path blocking ruled out the interaction half is now most of the case for the feature. `interactive = false` genuinely fixes it — a dead pile stops swallowing clicks and targets meant for the living. But a dimmed token still renders, and alpha blending is marginally *more* work than opaque, so if the twenty-corpse slowdown is real and caused by rendering, this will not touch it.

  **Measure before treating that as unfinished business.** Twenty tokens is not many; Foundry handles hundreds. A client that drags at twenty dead NPCs is more likely paying for their token effects, health bars, auras, or a module doing per-token work than for the sprites. `enablePerformanceMonitor` is already in the module: get a number with the corpses present, delete them, get another, and let the gap say whether rendering is implicated at all. If it is, a second "fully hide" mode can be added later on the same flag — but do not build it speculatively.

- **The three collision complaints, and which the mechanism actually closes (author, 2026-08-03: "blocking their path, getting targeted, clicked on")**:
  - **Clicked on** — closed by `interactive = false`. The corpse stops swallowing clicks meant for the living token beneath it.
  - **Getting targeted** — closed for click and hover targeting by the same flag. *Not* closed for macros or AoE templates that enumerate tokens in an area; those read documents, not interactivity. Probably fine, since a dimmed corpse is still in the encounter, but it is the one gap.
  - **Blocking their path** — **the ruleset does this, not Foundry, and it already exempts the dead.** Verified against v13 core and dnd5e 5.2.5:
    - Core constrains movement by **walls and movement cost only** — `Token#constrainMovementPath(waypoints, {ignoreWalls, ignoreCost})` (`client/canvas/placeables/token.mjs:2689`), and `checkCollision(type: "move")` polls the wall polygon backend (`:2545`). Core tokens never block each other. The GM toggle in the token tools ("Unconstrained Movement", ghost icon) sets exactly `{ignoreWalls, ignoreCost}` (`:4434`) — walls and cost, not tokens.
    - dnd5e adds the token blocking, in `TokenLayer5e.isOccupiedGridSpaceBlocking()`. It blocks only when the occupier is a **creature**, only when **dispositions differ** (allies never block), and **not at all** when the occupier carries a status in `CONFIG.DND5E.neverBlockStatuses` — which is populated from any status effect declaring `neverBlockMovement: true`, namely **`incapacitated`, `dead`, and `ethereal`**.

    **Confirmed by the author 2026-08-03: the dead do not block, the living do.** So path blocking is not a corpse problem and this feature does not need to solve it — living creatures blocking each other is dnd5e enforcing the rule correctly. **Do not design around it.**

- **Remaining open questions**:
  1. How dim is dim? Enough to read as "out of play" without losing where the body is. One value, not a setting, unless play proves otherwise.
  2. Per scene is settled. Whether an already-dimmed pile should re-dim if combat restarts on the same scene is not.
- **How to verify**: kill an NPC mid-combat and press the button. It dims on the GM's *and* a player's client, at the same alpha, and cannot be clicked or box-selected on either — try clicking a living token standing under the corpse and confirm the living one is selected. Reload both clients: still dimmed. End combat: it returns to full alpha and normal selection on its own, and XP still counts it. Press the button again with combat over and confirm nothing breaks.
  Then the case the NPC rule exists for: drop a **PC** to 0 HP, press the button, and confirm the PC stays at full alpha and fully selectable — and that marking that PC `defeated` does not dim it either.
  Finally, confirm nothing was mutated: after a full toggle cycle, a dead NPC that the GM had separately marked `hidden` is still `hidden`, and no token has moved.
- **Related**: the blood-splatter item above notes its dead-state treatment ties into this — settle this first so both use one definition of dead.

#### Query Tool — moved to Regent
- **Note (2026-07-25):** `window-query.js` is **not in Blacksmith** — it lives in `coffee-pub-regent`. Any query-tool UX or roll-integration work belongs in the Regent repo using `openRequestRollDialog` / `module.api.rolls`. Removed stale references to `scripts/window-query.js` in this repo.

#### Expand Rulebook Selection Phase 2
- **Issue**: Phase 1 now uses `Number of Rulebooks`, rulebook compendium dropdowns, and `Custom Rulebooks`; phase 2 may still want curated/common-book shortcuts
- **Status**: PENDING
- **Location**: `scripts/settings.js`, `scripts/manager-campaign.js`
- **Need**: Decide whether to add common-rulebook presets/checkboxes on top of the current compendium-driven model

#### Combat Stats - Review and Refactor
- **Issue**: Combat stats system needs review and potential refactoring
- **Status**: PENDING - Needs investigation and planning
- **Location**: `scripts/stats-combat.js`, potentially `scripts/stats-player.js`
- **Need**: Review implementation, identify unused code/duplicates, check performance, review UI/UX

### Low Priority

#### Party Stats Export — fragile blob download + no UI entry point
- **Issue**: Two problems. (1) The combat/player stats export uses a hand-rolled blob+anchor download that calls `URL.revokeObjectURL(url)` synchronously right after `anchor.click()`. The click is async, so the object URL can be revoked before the download starts — in Foundry's Electron shell this surfaces as the "Get an app to open this 'blob' link" dialog (same bug that was just fixed in `window-json-import.js`). (2) There appears to be no reachable UI control that actually invokes this export — the handler may be orphaned.
- **Status**: PENDING — investigate reachability, then fix the download
- **Location**: `scripts/window-stats-party.js` (export handler ~lines 478–497, `anchor.download` / `URL.revokeObjectURL`)
- **Need**:
  - Confirm whether/how the export is invokable from the UI; if orphaned, either wire up a button or remove the dead handler.
  - Replace the blob+anchor pattern with `foundry.utils.saveDataToFile(jsonString, 'application/json', filename)` (the canonical v13 helper; sets `dataset.downloadurl` and defers the revoke). Mirrors the fix in `window-json-import.js` `_downloadTextFile`.
- **Priority**: Low — pre-existing; impact limited if the export isn't currently reachable

#### Actor import — currency `value: 0` is silently skipped
- **Issue**: `setActorCurrency` guards with `if (!currency?.type || !currency?.value) continue;`, so a legitimate `{ "type": "gp", "value": 0 }` entry is treated as absent and never written. You cannot explicitly zero a denomination on import. Same `undefined`-vs-falsy class of bug as the `toSentenceCase` crash fixed in 13.8.4 — a falsy check standing in for a presence check.
- **Status**: PENDING — pre-existing; surfaced while building the Compendiums API (13.8.4), intentionally left out of scope
- **Location**: `scripts/manager-compendiums.js` (`setActorCurrency`, the `!currency?.value` guard)
- **Need**: Guard on presence rather than truthiness (`currency.value == null`), and coerce to Number so `"0"` and `0` behave the same. Confirm no caller relies on 0 meaning "leave untouched".
- **Priority**: Low — 0 is the default for every denomination, so the visible impact is limited to explicitly zeroing a value the actor doesn't have anyway

#### Encounter journal — monster list resolved twice per import
- **Issue**: Importing a `journaltype: "encounter"` JSON resolves every name in `prepencounter` **twice**. Console shows one `createJournalEntry` call but two complete passes of `Resolved Actor ...` lines for the same list. `importJournalEntries` calls `createJournalEntry` once per entry, and there is exactly one `formatMonsterList` call (`utility-common.js:174`), so something in the encounter path evaluates the list a second time — not yet identified.
- **Status**: PENDING — pre-existing (not introduced by the 13.8.4 resolver work; call-site count is unchanged). Now largely masked: pack indexes are cached after the first pass, so the second pass no longer re-hits `getIndex()`.
- **Location**: `scripts/utility-common.js` (`createJournalEntry` encounter path, `formatMonsterList` line ~174, `createHTMLList`), `scripts/registry-json-import-journals.js` (`importJournalEntries`)
- **Need**: Breakpoint `createHTMLList` during an encounter import to find the second caller; likely a duplicated page/template build. Remove the redundant pass.
- **Priority**: Low — cosmetic since the index cache absorbs the cost; worth resolving so the debug log isn't misleading

#### Configure Pin — Section Checkbox Label Size Inheritance Bug
- **Issue**: The "Update All" / "Default" checkbox labels in section headers render too small. `font-size` overrides in `.blacksmith-pin-config-section-check-label` (including absolute `px` values) have no visible effect, suggesting the label text is controlled by an ancestor rule or Foundry's CSS reset that overrides the element styles.
- **Status**: PENDING — `font-size: 11px`, `text-transform: none`, and `line-height: 1.4` are set on the label but not applying. Needs investigation into Foundry's CSS cascade for Application V2 windows.
- **Location**: `styles/window-pin-config.css` (`.blacksmith-pin-config-section-check-label`), `templates/window-pin-config.hbs`

#### Migrate Combat Hooks to lib-wrapper
- **Issue**: Using Foundry hooks for Combat methods that should be wrapped with lib-wrapper instead
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/stats-combat.js`, `scripts/combat-tracker.js`, `scripts/timer-combat.js`, `scripts/manager-libwrapper.js`
- **Need**: Replace `combatStart`, `updateCombat`, `endCombat`, `deleteCombat` hooks with lib-wrapper wrappers for Combat prototype methods


## TECHNICAL DEBT

### Journal Tools — de-clunk refactor (now CORRECTNESS, not just clunk — see 2026-07-18 review)
- **Issue**: `JournalToolsWindow` is ApplicationV2 (extends `BlacksmithWindowBaseV2`) but opts out of V2 idioms: `ACTION_HANDLERS = null` with hand-wired `_attachLocalListeners()` (silent no-attach on selector miss), runtime partial `fetch()`+`registerPartial()`, `setTimeout` timing hacks (200ms render wait, 0ms reflow poke, 10ms throttles), manual DOM state mutation, `isProcessing`/`shouldStop` flags instead of `AbortController`, and 600/287/180-line mega-methods.
- **Note (2026-07-19)**: the tool was never fully unreachable — the Foundry-toolbar button opens the same window, so the linking path has been **in production use** throughout. That urgency drove the defusal below. The defusal fixes are **shipped but not live-verified** — the author deliberately deferred testing to the rebuild regroup (planned within days of 2026-07-19); verify steps are in `CHANGELOG.md` if needed sooner.
- **Direction (author, 2026-07-19): the rebuild's real frame is "automated cleanup of Foundry artifacts"** — there is a large unmet need for automating world hygiene (broken/stale links, plain-text references that should be documents, and similar artifacts), and Journal Tools' entity linking + search/replace are the seed of that tool, not the whole of it. Scope the rebuild plan with that framing in mind rather than as a 1:1 rewrite of the current window.
- **Code review findings (2026-07-18) — the entity-linking core has real correctness bugs, not just style debt.** Findings 1–3 ✅ FIXED 2026-07-19 (see `CHANGELOG.md`: descending-offset processing + overlap-skip guard; world fallback rewired to the requested type with collection-derived labeling). Findings 4–10 stand for the rebuild:
  1. ✅ **Stale-offset replacement (was CRITICAL)**: scanners record offsets against the *original* page content while the loop mutates `pageContent` per replacement. Fixed by sorting merged entities by descending offset and skipping entities overlapping an already-replaced range.
  2. ✅ **World fallback searched the wrong collection** (`foundEntityType`, always null, instead of `entityType`) — items fell back to searching actors.
  3. ✅ `worldEntity.type === 'Item'` was never true (subtype, not documentName) — world finds were always labeled actor.
  4. **First-occurrence bugs**: bullet entities use `content.indexOf(line)` (duplicate lines resolve to the first); html-list plain-text replacement uses `liContent.replace(entity.name, newLink)` (first occurrence anywhere in the li; `$` in names would inject regex-replacement patterns).
  5. The existing-link li path replaces **all** UUID-pattern matches in the li with the same new link (`:1952-1953` global regex) — an li with two links gets both overwritten.
  6. **Scanning is keyword-luck, not contract**: section gating uses `includes()` on heading keyword lists against *every line* (prose containing "monster" flips the section state, and the state never turns off at an unrelated heading); `_isHeading` treats any Title-Case line as a heading; plain-text acceptance is "2–100 chars, doesn't end in a period"; type disambiguation is a 240-line context-bias heuristic (`_determineEntityTypeFromContext`). What gets linked depends on wording and ordering — this is the "does it do what we want" problem.
  7. Dedupe is by lowercase name only, page-wide, across types.
  8. **No preview and no undo for entity linking** — pages are updated immediately (`page.update` per page); the search-replace half *does* have report-first, the linking half doesn't.
  9. `_renderSearchResults` interpolates document names and matched content into `innerHTML` unescaped — journal content IS html, so OLD/NEW cells render markup instead of displaying it (and can execute it). The escaping concern previously flagged is confirmed real.
  10. Resolution duplicates the Compendiums API across three near-identical ~100-line methods (see the `api.compendiums` item above).
- **Status**: PLANNED — assessment done; phased plan in `documentation/plans/plan-journal-tools-refactor.md`. **The review upgrades Phase 2 from "extract for testability" to "rebuild the linking core"**: parse page HTML with `DOMParser` instead of regex over serialized strings; collect candidates from the DOM; resolve via `api.compendiums.resolveMany`; apply as DOM mutations; show a preview table before writing. Escape all interpolated content in results rendering (finding 9) — small and worth doing ahead of the full refactor.
- **Location**: `scripts/manager-journal-tools.js` (~3,480 lines), `templates/journal-tools-window.hbs` (+ partials).
- **Priority**: Medium-High (was Medium) — the tool writes corrupted or wrong links under real conditions.

### jQuery Detection Pattern is Technical Debt
- **Status**: TECHNICAL DEBT – cleanup target now that **v13+ is the supported platform**
- **Priority**: MEDIUM – Reduce over time as call sites are proven native-DOM-only
- **Location**: Multiple files using jQuery detection pattern

In FoundryVTT v13, jQuery is removed from the core UI stack. `html` parameters should be native DOM elements. The jQuery detection pattern is defensive for legacy callers; prefer fixing at the source.

**Action Item:** Audit all jQuery detection patterns and remove those where the source is guaranteed to be native DOM (e.g., `querySelector()` results).

**Migration Task:**
- [ ] Identify which detections are unnecessary (source is guaranteed native DOM) - **IN PROGRESS** - Testing required
- [ ] Remove unnecessary jQuery detection code - **PENDING** - Awaiting test results
- [ ] Create test cases to verify native DOM is always passed - **PENDING** - See audit report testing plan

**Audit Status:** Initial audit complete. Found 74 instances across 5 categories. Key finding: Inconsistency in `activateListeners(html)` and `this.element` handling suggests some detections may be unnecessary. See `documentation/jquery-detection-audit.md` for full report.

### Socketmanager Becoming Monolithic
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Status**: PENDING - Needs refactoring
- **Proposed Solution**: Socketmanager should ONLY manage socket registration/cleanup (like hookmanager), business logic should be moved elsewhere


## DEFERRED

## BACKLOG

### Targeted By
- Add some way to see who is targeting things

### Token Outfits
- Allow for token outfits - extend token/artwork workflows (historically tied to image replacement; **revisit if/when** a supported image pipeline exists in core or a companion module)

### Rest and Recovery
- Allow for long and short rests with configurable food/water consumption and spell slot recovery

### Auto-Roll Injury Based on Rules
- Automatically trigger injury rolls based on configurable rules/conditions (HP thresholds, critical hits, massive damage, etc.)
- **Ownership note (2026-07-18)**: injuries/crit/fumble handling belongs to Bibliosoph, not Blacksmith. **Phase 1 rolls API shipped** — Bibliosoph should subscribe to `blacksmith.rolls.`* (see `TODO-GLOBAL.md`). This backlog item moves to Bibliosoph when wired.

### Multiple Image Directories for Token Image Replacement
- Allow users to configure multiple image directories with priority order (deferred until a dedicated image pipeline is back in scope for Blacksmith or a companion module)

### No Initiative Mode
- Alternative combat mode where GM manually controls turn order instead of initiative rolls

### Export Compendium as HTML
- Export compendium contents as formatted HTML document for sharing, printing, or archiving

### CODEX-AI Integration
- Integrate CODEX system with AI API for cost-efficient context management, replace conversation history with relevant CODEX entries (likely **outside core Blacksmith** – e.g. Regent or a dedicated AI module; clarify product ownership before implementation)
