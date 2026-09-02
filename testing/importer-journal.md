# Testing: Journal import under declarations

**Audience:** us.

Scope: importer step 8, which has shipped and is not yet proven in a running world. This is a transitional
document -- see the testing rules in the documentation standard. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.**

**Status: the last full green is STALE, and should not be read as current.** Run All Headless passed
**1379/1379** across 19 suites on 2026-09-02, but that run predates the container model, `validateDeclaration`,
the `templateOptions` union, the ArrayField bounds fix, the legacy injury deletion, and the null-handling fix
below. The suite has grown since and nothing has re-run it. **Re-running it is the first item, not a
formality** -- every number quoted anywhere else in this file is from the stale run.

A live blocking bug was found by Bibliosoph's user on 2026-09-02, after that run, in the part of the engine the
suite covered most heavily. `validateEntry` rejected a legal `null` and accepted an illegal one: the guard read
`if (raw === null && field.nullable !== true) return;`, so a `nullable: true` field fell through to a bounds
check where `Number(null)` is 0 and failed its own `min: 1`, while a field that forbade null returned early
with no error at all. Fixed in both directions, and the bounds check no longer coerces -- `Number(undefined)`
is NaN, where every comparison is false and an out-of-range value passed in silence.

**The suite could not have caught it, and that is the part worth keeping.** The `journal-page-profile` group
already carried the exact fixture -- `treatmentdc`, `nullable: true`, `min: 1`, value `null` -- and asserted the
built page kept it null. That assertion passed throughout, because it called `buildDocumentData` while the bug
was in `validateEntry`, and in a running world construction is never reached until validation passes. It tested
the second half of a path that could not reach it. This is the fourth instance of one pattern: a test that
cannot distinguish success from the failure the code actually has. The validating half has been added against
the same declaration (five assertions, verified offline against the real registry and validator).

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

## Owed

- [x] **Import** `testing/import-json/journal-import-area.json` **a SECOND time.** Owed from the previous round
  ```
  and never run. The page must be **updated, not duplicated** -- that is the behaviour the injury builder
  got wrong and the reason find-or-create was unified. One entry, one page, revised content.
  ```

- [x] **Check the Area page's Narrative section.** It should carry three bullets: Description, Layout,
  ```
  Atmosphere. This is the field the declaration got wrong (declared a string, is an object of three), so
  it is the one worth looking at rather than trusting.
  ```

- [x] **Import a Location payload.** Nothing has exercised the Location profile in a world since it was
  ```
  declared. Every location page files into ONE shared entry named by `journalname`, defaulting to
  "Locations" -- so a second location should join the first entry rather than create its own.
  ```

- [x] **Encounter, through Regent's shape.** Take a Regent-generated encounter payload, or hand-write one
  ```
  using `scenelocation` / `sceneparent` / `scenearea` rather than realm/region/area. It should import,
  report three "accepted for compatibility" warnings naming those keys, and **render a breadcrumb** --
  which is the fix: those three names were read nowhere, so every Regent encounter imported with its
  whole breadcrumb silently missing.

  `sceneenvironment` in the same payload should be reported as an unknown field. That is correct and
  deliberate: it is a habitat, which belongs on the scene rather than in the journal, and it lands with
  the scene-geography write.
  ```

- [x] **Read one generated prompt.** Open Import Journal -> Area -> Prompt Template and confirm the schema
  ```
  section now describes nested fields to three levels (`blocks.area.narrative.description` and
  similar). Previously only the top level was described, so a generator was guessing at every nested
  shape. This is a read-and-judge check, not a pass/fail assertion.
  ```

- [ ] **Folder matching is case-insensitive and creation is verbatim.** Cannot be asserted headless without
  ```
  creating folders in a real world, so it is a live check. `ensureJournalFolder` used to sentence-case the
  name before both matching and creating, so a GM whose folder is `INJURIES` got a second one called
  `Injuries`, and a module asking for `injuries` had its folder renamed. Make a folder named `ZZTEST` and
  import a payload naming `zztest`: it must file into the existing folder, and the folder must still be
  called `ZZTEST` afterwards. Then delete the folder.
  ```

- [ ] **A same-named journal in another folder warns rather than passing silently.** With a journal named
  ```
  `Fire` already in one folder, import a payload that files `Fire` into a different one. It must create the
  second entry -- that is correct, the payload named a folder -- and must now say so in a notification
  naming the existing entry's folder. Bibliosoph's world gained a competing `Fire` with no signal at all,
  and their human only noticed because `game.journal.getName("Fire")` handed back the wrong one.
  ```

## Owed jointly with Bibliosoph

Bibliosoph ran the import in a live world on 2026-09-02 and the core of it passed: correct page subtype, both
pages present, append into an existing journal, update-in-place on re-import, and a null `treatmentdc`
surviving. What that run did NOT cover is below -- it was made with `treatmentdc` deleted from the payload to
get past the null bug, and it exposed three folder defects that are now fixed and unverified.

- [ ] **Re-run Run All Headless, before any live check in this file.** The Importer Declarations suite should
  ```
  read **299** -- 275, plus five null and bounds assertions, eleven that build each shipped fixture rather
  than only validating it, and eight for the declared folder destination. The total should be above 1379.
  A failure here outranks every live check, and the NUMBER is the thing to report: "all green" cannot be
  compared against a stale figure.

  The eleven build assertions are new and have never run, so they are the likeliest source of a red. If one
  fails, the log line carries the thrown message; that is a real defect in the profile it names rather than
  a flaky test, since the fixture beside it validates.
  ```

- [ ] **Import an injury JSON end to end.** Steps 1-5 of this ran on 2026-09-02 and passed -- parse, routing on
  ```
  `journaltype`, declaration resolution, and field validation all reached with the entry correctly named --
  but only with the `treatmentdc` line DELETED from the payload to get past the null bug. It must run again
  with that line restored, since the null path is the half that was broken and it has not been exercised
  live once. Bibliosoph has been told to restore it.

  The page should land in the TITLE-CASED journal named for its
  category -- `Fire`, not `fire` -- carrying `system.severity`, as a page of type
  `coffee-pub-bibliosoph.injury` rather than `text`. Then export to the compendium and confirm their
  injury picker lists it.

  That last step is the one that matters: every page Blacksmith's old injury import created was invisible
  to that picker, for two reasons at once -- the wrong page type, and the world/compendium two-step. The
  type is fixed; the two-step is normal and still required.
  ```


