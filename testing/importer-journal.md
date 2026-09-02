# Testing: Journal import under declarations

**Audience:** us.

Scope: importer step 8, which has shipped and is not yet proven in a running world. This is a transitional
document -- see the testing rules in the documentation standard. **Remove an item when it passes rather than
ticking it, and delete this file when it is empty.**

**Status: headless is green across every suite; nothing below has run in a world.** A full Run All Headless
passes **1379/1379** across 19 suites as of 2026-09-02, with the Importer Declarations suite at **275** -- up
33 from the 242 of 2026-08-31, covering all six groups added since: `shipped-fixtures-validate`,
`prompt-schema-depth`, `journal-encounter-regent`, `declaration-from-model`, `journal-page-profile` and
`journal-subtype-seam`.

That gate has passed, so the page-building path Bibliosoph's injuries depend on is proven as far as anything
headless can prove it. What remains is everything a harness cannot reach.

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

## Owed jointly with Bibliosoph

The injury handover is complete on both sides in code and **static verification only**. Neither session has
imported an injury in a running world, and neither is calling it working. Bibliosoph's session will ask their
user for this run once Blacksmith's harness is green.

- [ ] **Import an injury JSON end to end.** The page should land in the TITLE-CASED journal named for its
  ```
  category -- `Fire`, not `fire` -- carrying `system.severity`, as a page of type
  `coffee-pub-bibliosoph.injury` rather than `text`. Then export to the compendium and confirm their
  injury picker lists it.

  That last step is the one that matters: every page Blacksmith's old injury import created was invisible
  to that picker, for two reasons at once -- the wrong page type, and the world/compendium two-step. The
  type is fixed; the two-step is normal and still required.
  ```

- [ ] **Delete Blacksmith's injury import.** Eight sites, inventoried in `TODO-GLOBAL.md`. Only after the
  ```
  above passes, since it is the evidence the replacement works.
  ```

