# Plan: Importer step 8 — Journal

**Status: In progress.** `rendered` is removed. Area, Location and Encounter are declared and routing, find-or-create is unified, the page-subtype seam is built, and `api.createJournalEntry` routes a declared profile through the engine for Regent. Remaining: the SCHEMA LOCK derivation, and the injury handover to Bibliosoph.

Scope: move the Journal kind onto the declaration model, and build the subtype seam three siblings are
waiting on. This plan is scaffolding — when it is implemented its design goes to
`architecture/architecture-importer.md`, its surface to `api/api-importer.md`, its work to `TODO.md`, and
this file is deleted.

Contract: `plan-importer-api.md`. Cross-module coordination: `TODO-GLOBAL.md`, "Importer step 8".

## What is actually here

The kind offers five profiles, but only **two import JSON**: `area` and `location`. `illustration` is
prompt-only image generation. `encounter` and `injury` are labelled "(Legacy)" and are prompt-only in the
window — yet `validateJournalEntry` still accepts `ENCOUNTER` and `INJURY` as a `journaltype`, so a
hand-written payload reaches builders the UI does not offer.

Neither is dead. **Regent drives the encounter builder** through `api.createJournalEntry` on the API root
rather than through the window, and **Bibliosoph consumes injury journals** — see `TODO-GLOBAL.md` for both,
including the three Regent defects found while confirming it.

## The recurring defect, four times

Every builder implements "find or create the entry, then find or update the page", and no two agree.

| | Entry match | Page write | Page format | Returns |
|---|---|---|---|---|
| Encounter | name + folder | `createEmbeddedDocuments` | `HTML` | the entry |
| Area | name + folder | `createEmbeddedDocuments` | `HTML` | the entry |
| Location | name + folder | `createEmbeddedDocuments` | `HTML` | the entry |
| Injury | **name only** | **`update({pages})`** | **none** | **nothing** |

Injury is the outlier on every column, and its page write looks like a defect rather than a variation:
`Array.isArray(existingEntry.pages) ? existingEntry.pages : []` guards a value that is an EmbeddedCollection
and never an Array, so the guard always takes the empty branch and submits an array holding only the new
page. It also sets `type: 'html'` on the JournalEntry, which has no `type` field. **One console check
settles whether that silently fails to append or replaces the sibling pages** — do that before deciding how
much of it to preserve, and do it before the code is deleted, because afterwards nobody can tell which it was.

Unifying find-or-create is therefore part of this step, not a tidy-up after it.

## The seam: constructing a module-owned page subtype

This is the deliverable everything else waits on. Pages are created with a hardcoded `type: "text"` in every
builder, so Blacksmith cannot construct a subtype another module declares.

Foundry namespaces a module-declared subtype as `${module.id}.${subtype}` — but it namespaces the
**declaration**, not the **creation**. Blacksmith can create `coffee-pub-bibliosoph.injury` because the
registered data model validates whoever calls create. Already verified against Foundry 13.351 and recorded in
`architecture-importer.md`; this step is the first use.

Two shapes a journal profile must express, and both are real:

1. **An entry with pages** — Area and Location: one page, named for the scene.
2. **A page into an entry that groups it** — Bibliosoph's injuries: the entry is the category, each page is
   one injury. The entry is found or created as a container; the page carries the payload.

The second is what a satellite wants, and it is why "which document does a journal profile create" cannot be
answered once for the kind.

## Settled: `rendered` does not exist (2026-08-31)

It was specified as a third form -- fields feed a template and the whole payload becomes one HTML string --
and nothing ever used it. Writing the Area profile settled it by construction: every field is `role: 'input'`
because none lands at a path on its own, and one derivation composes the HTML. That is exactly what
`rollTableResults` does for a table's rows and `actorContent` does for an Actor's envelope, both `mapped`.

`rendered` is removed from `FORMS`, from `api-importer.md` and from `architecture-importer.md`. Two forms now,
and the satellite case -- `mapped` against a declared subtype -- is simply the ordinary one.

## Requirements inherited from scene geography

Settled 2026-08-31 by the geography work and recorded in `TODO.md`, "Geography and the journal importer:
three changes owed by importer step 8". Not restated here -- three requirements, all with call sites inside
the `area` and `location` builders this plan re-founds, which is why they were left for this step rather than
done separately.

One edge was left open there and is now **settled: it warns.** An Area import launched with no scene in
context records geography nowhere, and says so on the result screen rather than succeeding quietly. The
importer already has a warnings channel that names a field, and this is exactly what it is for -- an import
that quietly did not do half of what was asked reads as a success and is not one. Agreed with the geography
session 2026-08-31.

**The geography vocabulary has one source, and all three copies are collapsed.** It lives in
`utility-geography-vocabulary.js`, a leaf with zero imports so the declaration layer stays headless --
`manager-geography.js` itself reaches `const.js`, which fetches `module.json` at load, and importing the
manager from a declaration would have cost validation and template derivation their headless assertability.
The importer's `GEOGRAPHY_SETTING_KEYS` is now built from `GEOGRAPHY_FIELD_LIST`, and the declaration's four
fields are derived from the same list; the declaration keeps only the authoring guidance and `breadcrumb`,
which overrides the derived path and so is not vocabulary.

**No habitat field is declared, deliberately.** `HABITAT_KEYS` is available as a literal and could be
declared today, but nothing composes it: `parse-journal-area.js` reads realm, region, site, area, scenetitle,
breadcrumb and blocks, and no template renders a habitat. Declaring a field no composer reads is the
same defect as a rule that can never fire, in the other direction -- offered to an author, and ignored.
It lands when something renders it, and then its `values` are `HABITAT_KEYS` and its incoming value goes
through `normalizeHabitats`, which drops nulls and dedupes: a checkbox group submits null, and
`String(null)` is the perfectly good string `"null"` that case folding does not catch.

## The schema exists in four languages, not one

Found 2026-08-31 by counting across FILE TYPES rather than sweeping `.js`, after the geography session
relayed the same lesson from three separate instances of it in one day. Journal surfaces:

| Type | Files | What they carry |
|---|---|---|
| `.js` | 14 | builders, declarations, the importer |
| `.txt` | 5 | the generation prompts, including a SCHEMA LOCK stating the field list in prose |
| `.hbs` | 4 | the journal templates, and the import window's geography fields |
| `.json` | 3 | shipped fixtures and examples |
| `.css` | 1 | the scene-geography styling |

**Every sweep run while declaring the Journal profiles saw only the 14.** That is the whole finding, and it
is not abstract: `prompts/prompt-journal-profile-area.txt:34` says `blocks.area.narrative` MUST be an object
of exactly three strings and explicitly forbids a bare string, and `:36` names `narrativecard`'s four fields
including `image`. Both are things the declaration got WRONG and that a live import then failed on. The
contract already said so, in a language nothing was searching.

The rule, in the form worth keeping: **any narrowing performed before you know the total is unsafe** -- a
head limit, a `grep -v`, a path filter, reading the first screen. Count first, and count across file types,
because a contract can leave the language you are searching without leaving the repository.

**The consequence for this step:** the prompt files are a THIRD reader of the declaration's contract,
alongside the guide and the validator. Step 5 derived the guide and deliberately left the prompt
hand-written, which was defensible when the prompt was the only statement of the schema; it is not
defensible now that a declaration states the same thing and has already drifted from it in the wrong
direction. The SCHEMA LOCK sections are the part to derive.

Two smaller items the count surfaced:

- `templates/journal-location.hbs:46-48` renders a `strGeography` section, and
  `templates/window-json-import-body.hbs:60,133` render the import window's own geography fields. Anyone
  rebuilding the builders from the `TODO.md` entry alone would never look at either.
- `examples/example-narrative-multi-card.json` was worse than unvalidated and is **deleted**. It declared
  `journaltype: "narrative"`, which both the validator and the builder now THROW on, and it used Regent's
  field spellings throughout -- an example of a format that cannot be imported, shipped as guidance. An
  archived copy remains at `testing/import-json/archive/journal-import-narrative-legacy.json`, so nothing is
  lost. `examples/` now holds nothing the importer reads, so the fixture assertion stays scoped to
  `testing/import-json/`.

- **The count was still too narrow.** Re-run with a PROSE-shaped pattern rather than a code-shaped one --
  Artificer's addition to the rule, that the pattern has to stop being code-shaped too -- `.js` went from 14
  to 28 and `.md` appeared with 14 files. A property access cannot match a tooltip, a prompt sentence or a
  doc table. Counting across file types is half of it; the other half is not searching for the shape the
  code happens to take.

## Sequence

1. ~~Verify the injury page-write defect.~~ Done 2026-08-31: `Array.isArray(j.pages)` is `false`,
   `EmbeddedCollection`, 9 pages. The guard always takes the empty branch, so appending has never worked
   through that path. Nothing about it was worth preserving.
2. ~~Settle `rendered`.~~ Done -- see above. Removed.
3. ~~Declare `area` and `location`.~~ Done. Both derive template, guide and validation; the Location
   composer moved to `parsers/parse-journal-location.js` beside its Area counterpart. The HTML composition
   stays in the parsers — it is one algorithm over the whole payload, and splitting it per field would be
   the model driving the code rather than describing it, the same call Roll Table's ranges settled.
   **Not yet routed**: `onImportEntry` still calls the parser, so nothing has changed for a user.
4. ~~Unify find-or-create.~~ Done -- `utility-journal-destination.js`, one implementation replacing four.
5. ~~Build the subtype seam.~~ Done -- `document.pageType`, stamped after derivations, defaulting to `text`.
6. **Move the kind out of `registry-json-import-journals.js`'s parser tail**, as Actor moved.
7. **Keep `api.createJournalEntry` working**, or ship Regent a declared replacement in the same release. It
   is a legacy API-root surface with a live consumer.
8. **Encounter and injury.** Encounter stays, because Regent drives it through `api.createJournalEntry`.
   Its declaration is **written and verified against the composer's CARDDATA, and deliberately not
   registered**: the composer is still inside `utility-common.js`'s encounter branch, and a profile whose
   derivation cannot run is worse than one that does not exist -- it registers, validates, and then fails at
   construction. Registering it is one mechanical step behind extracting
   `parsers/parse-journal-encounter.js`, which is ~340 intertwined lines and the largest remaining piece.

   **Regent's field names are settled** (2026-08-31, by the author): `scenelocation` is our realm,
   `sceneparent` our region, `scenearea` our area, and Regent supplies no site. They are declared as
   `acceptsKeys`, which is what stops them being dropped -- Blacksmith read none of those names anywhere, so
   every Regent encounter imported successfully with its whole breadcrumb missing.

   `sceneenvironment` is NOT among them. It is a **habitat** -- the name Regent got wrong, which core rules,
   Artificer and every conversation call habitat, and which geography has since renamed to match. A habitat
   is a scene-geography field with its own closed vocabulary rather than a step in the breadcrumb, so it
   lands with the scene-geography write, not as a journal field. Until then it is reported as an unknown
   field, which is the truth.

   Injury moves to Bibliosoph, who declare the profile and the subtype; Blacksmith deletes
   `buildInjuryJournalEntry`, `templates/journal-injury.hbs` and its injury profile.

## Verification

Every step names its own check; the ones that cannot be a harness assertion go to a `testing/` doc.

- Parity against the parser for `area` and `location`, as Item, Roll Table and Actor each have — comparing
  derived construction against the builder it replaces, kept until the parser is deleted.
- A page created with a foreign subtype comes back with its `system` data intact.
- The find-or-create behaviour: a second page into an existing entry does not disturb the first. This is the
  one the injury builder appears to get wrong, so it is asserted rather than assumed.
