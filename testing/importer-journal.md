# Testing: Journal import under declarations

**Audience:** us.

Scope: importer step 8, which has shipped and is not yet proven in a running world. This is a transitional
document -- see the testing rules in the documentation standard. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.**

**Status: headless is green and current.** Run All Headless passes **1411/1411** across 19 suites as of
2026-09-02, with Importer Declarations at **307**. That run includes everything from the null-handling fix
onward: the declared folder destination, the composed template options, the fixture build assertions, the
container model, `validateDeclaration` and the legacy injury deletion. Nothing below has been proven by it --
what remains is what a harness cannot reach.

Two things that run found are worth keeping, because neither was found by the suite passing:

- **A declared profile was invisible to the registry.** `getJsonImportKind(kind).templateOptions` returns
  what was REGISTERED -- the static half -- while declared profiles are unioned in at window-render time.
  The profile appeared correctly in the window and nothing that asked the registry could see it. Two readers
  of one contract. `getTemplateOptions(kindId)` is now the composed answer.
- **An assertion that could not pass.** `getDeclarationsForKind('journal').length === 3` is a claim about the
  whole world, and any installed satellite declaring a journal profile falsifies it -- Bibliosoph's injury
  profile does. It failed *because the mechanism works*, which trains a reader to expect a red and explain it
  away. Asserted by id now. See the fifth failure mode in `architecture-importer.md`.

Predict a suite count from the last MEASURED number, never from a previous prediction. This file said 299,
measured 305, then correctly predicted 307 from it.

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


