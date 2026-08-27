# Plan: the Importer API

**Status: Implemented through step 4 of 11.** All eight Item profiles -- loot, weapon, equipment,
tool, container, feature, spell and consumable -- are declared and **live**: the Item importer routes
an entry to the derived path when a declaration exists for its profile, and every one now does.
Construction is asserted equivalent to the parser it replaces across thirteen cases in
`testing/suites/suite-importer-declarations.js`. The parser's per-profile builders are retained
deliberately as the comparison baseline and become deletable when the remaining kinds move.
Steps 5-11 -- guide and prompt derivation, Roll Table, Actor, Journal, fragments, export, and the
parity check -- are unstarted. Live scaffolding; delete this file when the migration is complete and
its content has been distributed.

**Scope changed 2026-08-23.** This was written as a *wider* contract layered on top of the shipped
callback registry. It is now the contract for a **re-founding of the importer**: a kind registers a
declaration of its shape, and Blacksmith derives the template, guide, prompt, validation, document
construction, result envelope and export from it. The callback registry -- `registerKind` with
`onValidateEntry` / `onImportEntry` / `onBuildPrompt` / `onBuildJsonTemplate` / `onBuildAuthoringGuide`,
documented in `../api/api-importer.md` -- is what this replaces, not what it extends. The work items and
migration order live in `../TODO.md`; this file holds the contract shapes.

**The Goals section below is the spec.** An earlier version of this header argued the opposite -- that the
callback registry already sufficed because Blacksmith never learns a consuming module's data model, and
that this file could be deleted if that property was worth keeping. That contradicted Goals twelve lines
later, and the shipped registry resolved the contradiction toward module-side construction without anyone
deciding to. Blacksmith owns document construction. A module never calls `create`.

Two things a declaration cannot express, and which therefore keep narrowly-scoped hooks: content that must
be computed (generated HTML bodies) and cross-entry work (pins referencing entries, embedded documents
linked after creation). Both run over already-declared data; neither substitutes for construction.

Per the plans rule: when it is built, distribute it -- surface to `../api/api-importer.md`, design to
`../architecture/architecture-importer.md`, history to `CHANGELOG.md` -- and delete this file.


---
## Goals

The Importer API would let another tool:

- Discover supported kinds, profiles, and options.
- Request a clean JSON template.
- Request a human-guided template.
- Request a complete AI prompt or composable prompt parts.
- Validate JSON without creating documents.
- Import JSON and receive structured results.

Blacksmith owns schema compatibility and Foundry document construction. Callers own how they collect intent and how JSON is authored.

## Access

The proposed methods would live on the same `api.importer` namespace as the registry surface above. Callers
feature-detect the method they need.

## Core concepts

### Kind

Top-level document family, such as `item`, `actor`, `journal`, or `rolltable`.

### Profile

A schema specialization within a kind, such as:

- `item.weapon`
- `item.feature`
- `actor.npc`
- `journal.area`

### Options

Validated selections declared by the profile. Options have one of three scopes:

- `schema` — affects JSON Template and Prompt Template.
- `creative` — affects Prompt Template only.
- `import` — affects validation/creation only.

### Payload

A JavaScript object, array of objects, or JSON string accepted for validation/import.

### Catalog query

A reusable request for existing content. The planned API exposes the same query contract used by Roll Table prompts/guides and the future Utility tab:

```javascript
const result = await importer.queryCatalog({
  kind: 'actor',
  source: 'compendium',
  compendiumIds: ['dnd5e.monsters'],
  filters: { actorCrMin: 2, actorCrMax: 4, actorType: 'humanoid', nameSearch: '' },
  format: 'text'
});
```

Item filters include item type, rarity, magical status, and name. Actor filters include exact/minimum/maximum CR, creature type, size, and name. Results retain exact document names, ids/UUIDs, pack ids, images, and relevant filter metadata. This method is proposed until published on `module.api`.

Roll Table authoring exposes only `text` and `document`. For a Document result, callers provide the exact catalog name, canonical document type, and optionally the selected source id. They do not provide a UUID. Blacksmith resolves the friendly reference through `api.compendiums.resolve(..., { exact: true, sources })` during import and writes Foundry's document collection/id fields.

## The declaration

A profile is declared as data. Blacksmith derives the JSON template, the authoring guide, the prompt, the
validation, the document, the result envelope and the export from it. Nothing below is code a module writes.

Derived bottom-up from Blacksmith's own Item kind (`scripts/parsers/parse-item.js`, eight profiles), which
is the reference implementation because it is the one kind already built the intended way.

### Field

```javascript
{
  name: 'itemRarity',                 // the friendly authoring key
  path: 'system.rarity',              // MANDATORY target on the document
  type: 'string',
  required: false,
  default: 'common',
  values: ['common', 'uncommon', 'rare', 'very rare', 'legendary'],
  aliases: { 'veryrare': 'very rare' },
  guidance: 'How hard this item is to come by.'
}
```

**`path` is mandatory and never inferred from `name`.** Proven by a real collision: a Foundry v13
`JournalEntryPage` has a native `category`, and Librarian's codex data model has `system.category`. The name
alone is ambiguous, so the declaration must say which.

**`guidance` is one sentence and is used twice** -- it becomes the authoring guide's line for this field and
the prompt's line for this field. One source means the two cannot drift, which is the failure that produced
differently-shaped prompts per module.

**`values` plus `aliases` replaces the hand-written lookup tables.** `WEAPON_TYPES`, `WEAPON_PROPERTIES`,
`RECOVERY_PERIODS`, `SPELL_SCHOOLS` and `FEATURE_TYPES` in `parse-item.js` are already exactly this shape --
canonical values with accepted spellings mapping onto them (`"simple melee"` and `"simplem"` both reach
`simpleM`).

Additional field forms the Item kind requires:

- **`const`** -- emitted, never authored. `disabled: false`, `transfer: true`, `changes: []` and the null
  duration block on a passive effect are fixed output, not fields a user fills in. They belong in the
  declaration so the created document is fully described by it, but they never appear in a template.
- **`generated`** -- a Blacksmith-owned generator rather than an author value. `_id` uses
  `foundry.utils.randomID()` in three places today. Declared as `generated: 'id'`; modules never generate.
- **`default` as a fallback chain**, including ancestor paths. A passive effect's image is
  `effect.img || <the item's img> || 'icons/svg/aura.svg'`.
- **`fields` nested, recursively.** `passiveEffects` and `activities` are arrays of objects with their own
  declared fields. A field's type may be `object` or `array<object>` carrying its own `fields` block.

### Cross-field rules

Validation that spans fields comes from a **closed vocabulary**, never an arbitrary predicate:

| Rule | Example from the Item kind |
|---|---|
| `requiresTogether` | Weapon `ver` property and `weaponVersatileDamageFormula` -- supplying either alone is an error |
| `mutuallyExclusive` | Weapon cannot be both `ver` and `two` |
| `impliedBy` | `itemIsMagical` true implies the `mgc` property, and `mgc` implies `itemIsMagical` |
| `requires` | `weaponMagicalBonus` greater than zero requires `itemIsMagical` |
| `mustBeEmpty` | Weapon `activities` must be `[]`; Blacksmith generates the standard Attack activity |
| `requiresWhen` | A passive effect's `equippedAndAttuned` activation requires the parent item to be magical with attunement required |

**Closed is the point.** From `requiresTogether: ['ver', 'weaponVersatileDamageFormula']` Blacksmith emits
the validation, the guide line and the prompt sentence -- identically for every module. A module supplying
its own predicate gives us validation we cannot describe to a generator, which is the "every module handed
users a differently shaped prompt" problem returning by another route.

Rules address fields by path and may reference an ancestor, because `requiresWhen` above spans a nesting
level. They never execute module code.

**Closed is also what makes the vocabulary self-correcting, which was not the argument for
it.** Artificer, 2026-08-25, on why they filed a bug rather than requesting a feature: their
rules needed a scalar equality test, adding an operator would have been easy, and *because
extending the set is deliberately expensive they wrote down why they wanted one first* --
at which point it was obvious the existing `field:value` notation already meant that and
was only half-implemented. A cheap extension point would have got an `=` operator bolted
beside a rule that could never fire, and the never-firing rule would have survived. Keep
extension expensive; the friction is doing work.

**The structured error envelope falls out of this.** A declared field that fails its declared type already
knows its own `path`; a named rule already knows its own `code`. The `code` / `stage` / `path` / `details`
shape specified later in this document stops being something a kind has to opt into by throwing richly, and
becomes a property of the engine.

### onReplace: the four paths, answered from a real conversion

Artificer converted 266 recipe pages from `text` to a declared subtype 2026-08-26. A page's
type cannot be changed by update, so every one was deleted and recreated. What
`onReplace: { preserve: [...] }` had to hold:

| Path | Why |
|---|---|
| `_id` | **The one that matters most and is easiest to skip.** Without `keepId`, every `@UUID` link a GM wrote to that page breaks silently -- no error, just a link that stops resolving. The *journal* id survives regardless, so a document-level check looks clean. |
| `sort` | A mixed journal must not reorder. |
| `ownership` | A hidden entry must not become visible. |
| `title` | `{ show, level }` is per-page display state nothing else carries; losing it silently changes how the page renders. |

Two rules for the conversion runner itself, both learned by running it:

- **Verify before deleting, and stop the whole journal on the first mismatch.** A converter
  getting one page wrong is probably getting others wrong. Read the recreated page back and
  compare before moving on; continuing turns one bad page into thirty.
- **Under-convert rather than over-convert, and split the skipped bucket.** A page converts
  only if the reader parses it and the result validates, so unrelated pages fall out
  naturally. But "did not parse" and "is not one of these" both return nothing, which makes
  "skipped" a bucket holding two very different meanings. A shape check separates them, so a
  page carrying the right markers that still failed to parse is reported rather than left
  behind unnoticed.

### Conditional FIELDS, not conditional values

Artificer's Process family, 2026-08-26. Four fields -- level positions with names and colours,
a named animation, a sound, and whether full intensity destabilises -- exist only when
`artificerFamily` is `Process` and are meaningless on anything else.

This is one step past the conditional-vocabulary case: there the field always exists and its
allowed values vary; here **the field itself should not appear in the template, guide or prompt
unless another field's value calls for it.** `requiresOption` is close but gates on an import
option a person ticks, not on a field's value.

The notation already exists: `field:value` references in the rule vocabulary mean exactly
"this field has this value", and that reference gained scalar support when Artificer found it
was array-only. A field-level `requiresWhen: 'artificerFamily:Process'` would reuse it rather
than inventing a second way to say the same thing.

Not blocking -- the fields are declared, optional and defaulted, so they are simply blank on
every non-Process item. A worse authoring experience, not a correctness problem.

### Dynamic vocabularies: four cases, three shapes

A field's `values` list is fixed at declaration time. Three consumer fields are not, and
they are not all the same problem -- which is why the mechanism gets designed against all
three rather than against the first one to arrive.

| Field | Where the values come from | Shape |
|---|---|---|
| Artificer `skill` | a user-configurable mapping JSON read at runtime; differs per world | runtime set |
| Artificer `artificerFamily` | selected by the value of `artificerType` | conditional set |
| Librarian codex `category` | user-extensible: a GM types a new one and it exists | runtime set, **members carry data** |
| Artificer `artificerProcessAnimation` | a manifest an art pack extends by shipping CSS plus an entry | runtime set, third-party source |

The third is the one that breaks a naive design. A codex category is the grouping key for
their whole browser, and `categoryIcon` travels with it -- creating a category means
choosing an icon for it. So a member is not just an allowed string; it is a string with an
associated value, and `categoryIcon` is declared non-authorable precisely because it is
derived from the category rather than typed.

A mechanism that only answers "is this value allowed" covers two of the three. Do not
design it against the runtime-set cases alone and discover the third at step 8.

**Reported by Librarian 2026-08-25, correcting their own earlier answer.** Their field
mappings described codex `category` as "free text, no fixed vocabulary", which reads as an
absence of constraint rather than a vocabulary that is populated at runtime. Worth noting
as a reporting hazard: an unconstrained field and a dynamically-constrained one look
identical in a field table.

### Absent and blank are different, everywhere

Three independent instances in three modules, which is what makes it a rule rather
than a quirk:

- Librarian's codex `expandedDetails`: absent PRESERVES the page text, present-and-empty
  REPLACES it with empty. Indistinguishable in JSON without saying which is meant.
- Blacksmith's field model: `absentMeans: 'default' | 'preserve'`, which exists for
  exactly that.
- Artificer's recipe parser (found 2026-08-25): a modern page with a blank `Apparatus:`
  label and a legacy page with NO `Apparatus:` label are different documents. The legacy
  page predates the field split, so its container genuinely is the apparatus. Their code
  tested the parsed value, which cannot tell blank from absent, and so applied the legacy
  reading to modern pages.
- Librarian's quest reader (2026-08-26): **four instances in one file** -- a writer
  skipping a field for `''` as for `undefined`, a reader whose "nothing found" fallback
  fired on an empty value and discarded the whole document, an extractor defaulting status
  to a truthy literal so re-import could never change it, and a participant parser that
  had this exact bug *in the helper written to fix it*.

Four occurrences in one file is what moves this from a pattern to something worth
checking for mechanically rather than remembering.

**Testing a parsed value cannot answer the question.** Whether a key, a label or a field
was *present* has to be tracked separately from what it contained, at the point of
reading, or the two collapse and one of them silently takes the other's behaviour. A
declaration says which it means; a reader has to record it.

### A conversion inherits every defect of the reader that feeds it

Contributed by Artificer 2026-08-25 while sequencing their own text-to-subtype migration.

Converting untyped pages to a declared subtype means reading them with the existing
parser and writing the result into the new schema. **Any bug in that reader stops being
a bug and becomes data**, permanently, at the moment of conversion -- it is no longer
something a later parser fix can correct, because the source it was derived from is gone.

So a reader defect must be fixed before conversion, not merely before the profile is
declared. It applies to every consumer taking this path, and the exposure scales with how
much the reader infers: Artificer's parser matches bolded labels, Librarian's is a regex
over generated HTML.

**The stronger form, from Librarian 2026-08-26 after auditing their own reader: a
conversion must read with the parser and write to the schema DIRECTLY, never round-trip
through the writer.** Fixing known reader defects only addresses the ones you found.
Removing the writer from the conversion path removes the entire class, because a writer
that cannot express what the reader can read will silently flatten every value it has no
form for -- and it does so uniformly, so the result looks consistent rather than broken.

Their measurement is the argument: their writer emitted tasks as bare `<li>` while their
reader decodes `<s>`, `<code>` and `<em>` for task state. Had their conversion run before
the audit, **all thirty production quests would have been permanently rewritten to active
with zero progress**, with the source gone. Every task in the world, uniformly, with
nothing to compare against afterwards.

### Defaults may supply a zero, never an attribution

Contributed by Librarian 2026-08-25, after the same class of bug was found three
times in Blacksmith's own parser and four times in Artificer's.

**A default that supplies a zero value is fine; a default that invents an attribution
is not.** A quest status defaulting to its initial state is a state machine's starting
point, not a claim about the world. `source.custom ?? 'Artificer'` asserts who made the
thing. The first is a schema default; the second is fabricated data wearing a default's
clothes.

The distinction is what makes the failure so hard to see. An empty category is
*visibly* absent -- it groups under "No Category" and a reader notices. An invented
source is *invisibly wrong*: the field looks filled in, plausibly, and nothing ever
flags it. Blacksmith shipped two of these (`'Artificer'` on every sourceless item,
`'Blacksmith Import'` on every feature and spell) and neither was noticed until
something diffed the output against a declaration.

Applied to a declaration: a `default` states what the field holds when the author
says nothing, and for anything describing provenance -- source, author, creator,
licence -- that value is empty. A profile wanting to stamp its own name is describing
an authoring tool's behaviour, not an import default, and belongs wherever that tool
creates the document rather than in the schema. Artificer's authoring window stamping
its own items is the legitimate form of this and stays.

### Transforms

Some values are converted rather than mapped: a price string into `{value, denomination}`, a name into a
slug identifier, uses and recovery into dnd5e's structure, a damage formula into a damage part.

**Transforms are named and Blacksmith-owned.** A declaration selects one; it never supplies one. This is
deliberate: Blacksmith owns compatibility with Foundry and dnd5e, so a system-shaped derivation is ours by
definition. The library grows as kinds need it.

**The one genuine gap, named rather than papered over:** `_activityBase` derives `consumptionTargets` from
whether the activity declares its own uses *or* the parent item does. That is not validation and not a field
mapping -- it is output structure derived from input presence. It becomes a named transform (`consumption`)
rather than an escape hatch, for the same reason as above.

### Where negotiation actually remains

The goal is that a module never negotiates with Blacksmith about its **shape**, and the declaration delivers
that: a module adds a field and gets a template entry, a guide line, a prompt line, validation and an export
field with no Blacksmith change.

Negotiation remains in exactly two narrow places, and both are Blacksmith-owned libraries rather than
per-module code:

1. **Transforms** -- a module needing one that does not exist asks for it.
2. **Fragments** -- the shared parts backed by a Blacksmith subsystem (`tags`, `xp`, `links`, `gmNotes`).

Both are small, closed and shared. That is a far narrower surface than five callbacks per kind, and it is
honest to say so rather than claiming the negotiation is gone entirely.

### What a declaration cannot express

Two things, which keep narrowly-scoped hooks:

- **Computed content** -- a generated HTML body, an assembled journal page. A transform over already-declared
  data, run before construction.
- **Cross-entry work** -- pins referencing entries, embedded documents linked after creation. A post-create
  hook.

Neither substitutes for construction. **A module may shape its own data and may never call `create`.**

### Profile forms: mapped, rendered, passthrough

Expressing Blacksmith's Journal kind after the Item kind produced the first structural extension the model
needs. **Not every profile maps fields onto document paths.** A third form, passthrough, follows from the
Actor kind below.

An Item profile is **mapped**: `itemRarity` lands at `system.rarity`, `itemQuantity` at `system.quantity`.
Every authored field has a target, which is why `path` is mandatory.

A Journal profile is **rendered**: `area`, `scenetitle` and the `blocks` envelope do not land anywhere
individually. They are template data. `createAreaJournalEntry` (`utility-common.js:439`) compiles
`templates/journal-area.hbs`, normalises the result, and the entire authored payload arrives at the document
as **one HTML string** at `pages[].text.content`. Encounter and Location do the same through
`journal-encounter.hbs` and `journal-location.hbs` (`const.js:49-52`).

Both are declarations; only construction differs, and both constructions are Blacksmith's:

```javascript
// mapped
{ form: 'mapped', fields: [ { name: 'itemRarity', path: 'system.rarity', ... } ] }

// rendered
{
  form: 'rendered',
  template: 'journal-area',
  output: { path: 'pages[].text.content', format: 'HTML' },
  fields: [ { name: 'scenetitle', type: 'string', guidance: '...' } ]   // no path; template data
}
```

A rendered profile's fields are still declared -- they still produce the JSON template, the authoring guide,
the prompt lines and the validation. They simply have no individual destination, so `path` is required on
mapped profiles and absent on rendered ones.

**This is why the Journal kind never migrated while the Item kind did.** Items decompose into paths;
journals decompose into a template. The callback registry hid that difference behind `onImportEntry` instead
of resolving it, so nobody had to notice the two kinds were shaped differently.

**Librarian's codex is mapped, not rendered.** Its data model exposes `summary`, `category`, `plotHook`,
`location`, `links`, `related`, `tags`, `img` and `discoveredBy` as `system` fields, so the codex profile
takes the simpler of the two forms. Their quest profile needs checking against the same question before the
contract is sent.

### What the Journal kind surfaces beyond the forms

- **Destination is currently a side effect of construction.** `createJournalEntry` (`utility-common.js:54`)
  finds or creates a `Folder` by name before dispatching to a profile builder. That is destination handling,
  which the declaration model makes Blacksmith's responsibility explicitly -- it already is Blacksmith code,
  but it is tangled into the builder rather than declared. Folder-by-name becomes a declared destination
  rule, shared with every kind rather than reimplemented per profile.

- **Duplicate policy is hardcoded and differs per kind, undeclared.** The Area profile finds an existing
  entry by name and folder and updates the page in place (`utility-common.js:465-487`), while every Item
  profile always creates. Two different policies in one module, neither of them declared, and the plan's
  `duplicatePolicy` option describes a choice that already exists implicitly. Note the in-place update is a
  merge, so flags outside the payload -- including `gmNotes` -- do survive today; the exposure is that
  nothing states the policy or guarantees it.

- **Compendium link resolution is hand-rolled per profile.** The Encounter profile splits free text on
  commas or `<li>` tags and resolves each fragment through `buildCompendiumLinkItem`
  (`utility-common.js:97-120`). That is the `links` fragment, implemented once here and again in Librarian,
  with its own heuristics. It is the second-strongest fragment candidate after `tags`.

- **`playSound` fires inside document construction** (`utility-common.js:463`). A side effect in a builder,
  not declarable, and not obviously wanted there. Decide during migration whether import feedback belongs in
  the engine's reporting rather than in a profile's create path.

### Field forms the first consumer's mappings forced

Derived from Librarian's codex and quest mappings, supplied 2026-08-23
(`coffee-pub-librarian/documents/plans/declaration-field-mappings.md`). Each is a real case in shipped
content, not a hypothetical.

- **`authorable: false`** -- a field that is declared but never appears in the JSON template, the guide or
  the prompt, and is never written from a payload. Codex has three: `system.categoryIcon` (set in the
  editor), `system.discoveredBy` (written by auto-discovery), and their `codexUuid` flag. **Declaring
  `discoveredBy` as an ordinary mappable field would wipe discovery state on every re-import**, which is
  exactly the class of loss `preserveOnReimport` exists to prevent for `gmNotes`. The two are the same
  mechanism: `authorable: false` generalises the gmNotes preservation path from one hardcoded flag to a
  declared property any field can carry.

- **Tri-state absence.** Most fields treat an absent value as "apply the default". Codex `expandedDetails`
  does not: absent or null **preserves** what is on the document, while present-and-empty **replaces** with
  empty. A field declares which, because the two are indistinguishable in JSON and getting it wrong either
  destroys hand-edited page text or makes clearing a field impossible.

- **Array merge policy, per field.** Codex `links[]` must **union** on re-import, not replace: links added by
  hand are unrecoverable from the payload. Identity is name-first with uuid as fallback -- keying on uuid
  gives one link two identities either side of resolution and emits it twice. Foundry replaces arrays
  wholesale, so the engine computes the merged array; a merge-update will not do it.

- **Projections.** A quest's `visible` boolean is not stored anywhere; it maps onto `ownership.default`
  through a transform. That needs no model extension -- it is a mapped field with a `visibility` transform --
  but the **default is safety-critical**: codex entries are created `{ default: NONE }` deliberately, because
  they are revealed on purpose. A declaration defaulting to world-visible spoils a campaign on first import.
  Ownership defaults are declared per profile and never inherited from a kind.

- **Replace-preserving-paths.** Converting a legacy untyped `text` page to a declared subtype means delete
  and recreate, because an untyped page cannot receive `system` data. Ownership and sort must survive. A
  profile declares `onReplace: { preserve: [...] }`, which is the same preservation vocabulary as
  `authorable: false` applied at document rather than field level.

**Aliases resolve after discrimination, never before.** Codex accepts legacy `description` as an alias for
`summary`, while `description` is the quest's own body field. If aliasing ran first, every legacy codex entry
would look like a quest. The discriminator sees the raw entry; aliases are a profile's own concern and apply
only once a profile has claimed it.

**Vocabularies must keep their aliases indefinitely.** Quest `status` normalises to
`Available | Active | Succeeded | Failed` but must keep accepting `Not Started`, `In Progress` and
`Complete` -- `Complete` is live in production data. This is the `values` plus `aliases` shape already in the
field model, and it confirms aliases are permanent compatibility surface rather than a migration convenience.

### Export completeness is an engine invariant, not a declaration

Librarian asked whether a declaration can express "this profile knows how many documents it should have
found, and refuses to emit a partial". **It can, but it should not have to** -- the guarantee belongs in the
engine, where it also protects the modules that did not think to ask for it.

The risk is new and real. Today a subtype owner's export is protected by accident: with the owner disabled,
its pages do not load *and its exporter does not exist*, so nothing runs. A derived exporter changes that --
Blacksmith's export runs whether or not the owner is present, finds nothing, and reports success. **A file
that is silently missing every page of a profile looks exactly like a file that had none.** Nobody finds out
until a restore.

Three layers, all engine behavior:

1. **Owner precondition.** A profile declares its owning module. Export of that profile refuses when the
   module is absent or disabled, and says which module and why. This is the disabled-Librarian case and it is
   the dangerous one.
2. **Type-registration precondition.** The profile's declared document type must have a registered data
   model. Catches the case where the module is active but its subtype did not register.
3. **Invalid-document refusal, from two independent sources.** Export refuses when the source collection
   holds documents Foundry could not construct, and on success reports counts so the check is visible rather
   than only firing on failure -- Librarian's "N of N" behavior, generalised.

   **Verified 2026-08-24** by Librarian on Foundry 13.351: `invalidDocumentIds` *is* populated on an
   **embedded** collection, not only on world collections, through
   `EmbeddedCollection.initialize` to `_initializeDocument` to `createDocument` throwing to
   `_handleInvalidDocument`. Their probe is at `coffee-pub-librarian/testing/macro-invalid-page-probe.js`.

   Use **both** available sources, because they fail differently. `invalidDocumentIds` carries ids, so an
   export can name which documents are missing rather than only counting them -- which matters when a GM is
   looking at hundreds of entries. Comparing `_source.length` against the collection size is the cross-check
   and is the more robust of the two, because it needs no knowledge of *why* a document failed.

*Two traps if we write our own probe for this*, both of which cost Librarian a wrong first result that
reported EMPTY. `_initializeDocument` short-circuits on `this.get(data._id)`, so a document already in the
collection is re-initialised in place and construction never runs -- the source row must be dropped with
`delete(id, { modifySource: false })` first. And passing `{ strict: false }` to `initialize()` sets the
fallback path in `DocumentTypeField._validateType`, which explicitly permits unrecognised types. The tell
that their first probe was wrong: the "broken" page came back carrying an undeclared type *and* an intact
system object, which a failed construction cannot produce.

This is the failure mode already recorded in `TODO.md` under **Import/export and module-owned document
subtypes** -- "an export would produce a file missing every codex page and report success". It is the same
one, and the declaration model is what finally makes it enforceable in one place instead of per module.

### Quest is a proposal, not a mapping

Librarian's quest column describes target paths that **do not exist yet**: quests are still plain `text`
pages with fields regex'd out of generated HTML, and giving them a data model is their own TODO A1. Do not
build the quest declaration against those paths as though they were real.

The useful consequence is the opposite one: **if the declaration model lands first, it is what A1 should
build against**, rather than Librarian inventing a third shape that then has to be reconciled. Say so
explicitly when the contract is sent.

Codex is a mapped profile and can be declared today. Quest cannot, and the two should not be gated on each
other.

### The third form: passthrough

Expressing the Actor kind produced one more form. The payload is **already document source data**; the
declaration's job is to describe the small envelope of authoring conveniences layered on top of it, each of
which is consumed into the document and then removed.

`parseActorJSONToFoundry` (`blacksmith.js:2873`) starts `const data = { ...actorData }` and works in place.
Four envelope fields are consumed and deleted:

| Envelope field | Consumed into | Then |
|---|---|---|
| `sidekick` | `flags.coffee-pub-blacksmith.sidekick` plus `system.traits.important` | deleted |
| `characterRace` / `characterBackground` / `characterClasses` / `characterSubclasses` | appended to `items[]`, recorded for post-create linking | deleted |
| `token` | merged into `prototypeToken`, explicit `prototypeToken` values winning | deleted |

So a passthrough profile declares `passthrough: true`, the identity and placement fields to strip, and its
envelope fields as ordinary declared fields carrying `consumedInto` rather than `path`.

**Passthrough already exists in two kinds, which is why it is a form and not a special case.** The Item
kind's native branch does the same thing: `isNativeFoundryItemData` detects document-shaped input and
`prepareNativeItemForCreation` strips `_id`, `folder`, `ownership`, `_stats` and `pack`
(`parse-item.js:722-747`). It is also the mechanism that lets Blacksmith construct a foreign subtype without
knowing its data model, so the Journal kind needs it too.

A kind may support more than one form. Item is mapped **or** passthrough depending on the payload; the
declaration says which shapes it accepts and the engine picks by detection, exactly as the item parser does
today.

**The `_`-prefixed scratch fields go away.** `_characterFoundations`, `_originalItems`, `_originalSpells`,
`_originalFeatures` and `_originalCurrency` are stripped by hand before creation (`blacksmith.js:3131`).
They exist only to carry state from the parse to the create because the two are separate calls over the same
raw entry. Converting once removes the need; that state is run context, not payload.

### What the Roll Table kind adds

Roll Table is mapped and mostly ordinary -- `tableName` to `name`, `drawWithReplacement` to `replacement`,
a nested `results[]`. Three things it forces:

- **Ordered derivation across array elements.** A result's range is taken from a running cursor when not
  supplied, so element N's value depends on element N-1 (`parse-rolltable.js:28-51`). That is not per-field
  validation and not a per-element transform; it is a transform over the array in order. Named and
  Blacksmith-owned, like the others.

- **Element-scoped rules.** Ranges must not overlap *between* elements. The cross-field vocabulary as
  declared holds between siblings in one object; this holds across elements of one array. The vocabulary
  needs the scope stated on each rule -- `siblings`, `elements`, or `ancestors` -- rather than a fourth rule
  type.

- **Derived fields reading nested data.** `formula` is emitted as a constant and then recomputed from the
  highest range across all results. A declared field whose value derives from a nested collection.

**One migration item found here.** `missingDocumentPolicy` (`error` | `text`) is carried **in the payload**
(`parse-rolltable.js:13`), but it is an import option by the plan's own definition -- it controls what
happens when a reference cannot be resolved, not what the content is. It belongs on the Import JSON tab.
Move it, and keep accepting it in the payload as a compatibility alias, because existing authored tables
carry it.

### Coverage against Blacksmith's own kinds

The model is tested by expressing Blacksmith's own kinds, not a consumer's. Item first, then Journal:

| Profile | Exercises | Gap |
|---|---|---|
| Loot | shared fields, `values`, price transform | none |
| Consumable | shared fields, uses/recovery transforms | none |
| Tool | shared fields, identifier transform | none |
| Container | shared fields, capacity fields | none |
| Equipment | nested `passiveEffects`, `const`, `generated`, `requiresWhen`, ancestor default chain | none |
| Weapon | every cross-field rule in the vocabulary, alias tables, `mustBeEmpty` | none |
| Feature | nested `activities`, `values` over feature types | `consumption` transform |
| Spell | nested `activities`, school enum, level/scaling | `consumption` transform |

Nothing in the eight requires a construct outside the model. The `consumption` transform is the only
addition the Item survey produced.

| Journal profile | Form | Exercises | Gap |
|---|---|---|---|
| Area | rendered | `journal-area.hbs`, blocks envelope, folder destination, in-place duplicate policy | none |
| Location | rendered | `journal-location.hbs` | none |
| Encounter | rendered | `journal-encounter.hbs`, inline compendium link resolution | `links` fragment |
| Injury | rendered | `buildInjuryJournalEntry`, separate construction path | none |

| Actor profile | Form | Exercises | Gap |
|---|---|---|---|
| NPC | passthrough | strip identity/placement, `token` envelope | none |
| Sidekick | passthrough | `sidekick` envelope consumed into flags and system | none |
| Character Snapshot | passthrough | foundations envelope appended to `items[]`, post-create relationship linking | none |

| Roll Table profile | Form | Exercises | Gap |
|---|---|---|---|
| Text | mapped | nested `results[]`, ordered range derivation, element-scoped overlap rule | rule scoping |
| Document | mapped | the same plus name-to-UUID resolution | `links` fragment |

**Survey complete: four kinds, nineteen profiles, three forms.** Nothing required a construct outside the
model. What the survey added, in the order it was found: the `consumption` transform (Item); the
mapped/rendered split (Journal); `authorable: false`, tri-state absence, per-field array merge, projections
and replace-preserving-paths (Librarian's mappings); the passthrough form (Actor); and rule scoping plus
ordered array derivation (Roll Table).

Two fragments are confirmed by more than one kind and should be built first: `tags` and `links`.

## Capability discovery

### `getCapabilities(request?)`

Returns supported kinds/profiles and their option definitions.

```javascript
const capabilities = importer.getCapabilities({ kind: 'item', profile: 'weapon' });
```

Proposed response:

```javascript
{
  apiVersion: 1,
  kinds: [
    {
      id: 'item',
      label: 'Item',
      profiles: [
        {
          id: 'weapon',
          label: 'Weapon',
          schemaVersion: 1,
          outputs: ['json', 'guided', 'prompt'],
          acceptsNativeFoundryJson: true,
          options: [
            {
              id: 'includePassiveEffects',
              label: 'Include Passive Effects',
              scope: 'schema',
              type: 'boolean',
              default: false
            }
          ]
        }
      ]
    }
  ]
}
```

Callers should render options from capability metadata rather than hardcoding current Blacksmith choices.

## Authoring outputs

All authoring methods return text. Callers may copy it, save it as plain text, display it, or send it to another service.

### `getJsonTemplate(request)`

Returns directly parseable JSON with neutral values.

```javascript
const result = await importer.getJsonTemplate({
  kind: 'item',
  profile: 'weapon',
  options: {
    includePassiveEffects: true,
    includeArtificer: false
  }
});
```

Proposed result:

```javascript
{
  format: 'json',
  mimeType: 'text/plain',
  suggestedFilename: 'blacksmith-item-weapon-template.txt',
  text: '{\n  "itemName": "",\n  ...\n}',
  summary: 'Weapon template · passive effects included · Artificer omitted',
  kind: 'item',
  profile: 'weapon',
  schemaVersion: 1
}
```

`text` contains raw JSON only. It must parse without removing comments, fences, or instructions.

### `getAuthoringGuide(request)`

Returns a human-oriented plain-text authoring document containing a clearly delimited JSON template plus instructions.

```javascript
const result = await importer.getAuthoringGuide({
  kind: 'item',
  profile: 'weapon',
  options: { includePassiveEffects: true }
});
```

The guide explains required fields, allowed values, relationships, automatic behavior, and limitations. The complete guide is not itself an import payload.

### `getPromptTemplate(request)`

Returns a complete plain-text prompt for an AI or other instruction-driven generator.

```javascript
const result = await importer.getPromptTemplate({
  kind: 'actor',
  profile: 'npc',
  options: {
    actorPurpose: 'boss',
    rulesPosture: 'balanced',
    inventoryPolicy: 'complete'
  },
  context: {
    additionalInstructions: 'A harbor cult leader who fears open water.'
  }
});
```

The result uses the same envelope as `getJsonTemplate`, with `format: 'prompt'`.

### `getPromptParts(request)`

Optional advanced surface for tools that supply their own system/task framing but want Blacksmith-owned schema parts.

```javascript
const parts = await importer.getPromptParts({
  kind: 'journal',
  profile: 'area',
  options: { sceneEmphasis: 'social' }
});
```

Proposed response:

```javascript
{
  kind: 'journal',
  profile: 'area',
  schemaVersion: 1,
  parts: [
    { id: 'schema', role: 'schema', text: '...' },
    { id: 'profile', role: 'schema', text: '...' },
    { id: 'generation-direction', role: 'instruction', text: '...' },
    { id: 'campaign-context', role: 'context', text: '...' }
  ]
}
```

Part ids and roles must be versioned before this method becomes stable. Callers should prefer `getPromptTemplate` unless composition is necessary.

## Validation

The shared Blacksmith window and internal importer registry now use this result model. Publication as `api.importer.validateJson()` remains pending until the public namespace and capability/version surfaces are implemented.

### `validateJson(request)`

Validates without creating documents.

```javascript
const result = await importer.validateJson({
  kind: 'item',
  profile: 'weapon',
  payload: jsonText
});
```

Validation performs parsing, normalization, schema checks, and conversion checks. It may resolve references read-only when the profile requires them.

Proposed result:

```javascript
{
  operation: 'validate',
  status: 'warning',
  processed: 2,
  succeeded: 1,
  warned: 1,
  failed: 0,
  entries: [
    {
      index: 0,
      status: 'success',
      inputName: 'Tideknot Trident',
      kind: 'item',
      profile: 'weapon',
      warnings: [],
      errors: []
    },
    {
      index: 1,
      status: 'warning',
      inputName: 'Harbor Key',
      kind: 'item',
      profile: 'loot',
      warnings: [
        {
          code: 'UNRESOLVED_REFERENCE',
          stage: 'validate',
          path: 'items[0]',
          message: 'No matching Item named Old Harbor Map was found.'
        }
      ],
      errors: []
    }
  ]
}
```

Validation does not reserve ids or guarantee that external state remains unchanged before a later import.

## Import

The shared window currently performs per-entry validation/import and renders this envelope internally. The public `api.importer.importJson()` method described below is still proposed.

### `importJson(request)`

Validates, converts, creates, post-processes, and reports.

```javascript
const result = await importer.importJson({
  kind: 'item',
  profile: 'weapon',
  payload: jsonText,
  options: {
    destination: { type: 'world', folderId: null },
    duplicatePolicy: 'create',
    batchPolicy: 'continue'
  }
});
```

When a future duplicate policy updates an existing document in place, importer profiles may add preservation paths. Blacksmith-owned GM Notes are user-authored data and are preserved by default for every kind:

```javascript
preserveOnReimport: [
  ...blacksmith.gmNotes.PRESERVE_ON_REIMPORT
]
// flags.coffee-pub-blacksmith.gmNotes
```

Callers may add profile-specific paths but must not remove this default. The currently implemented importers use `duplicatePolicy: "create"` semantics and therefore have no existing-document merge stage yet.

Proposed successful entry:

```javascript
{
  index: 0,
  status: 'success',
  inputName: 'Tideknot Trident',
  kind: 'item',
  profile: 'weapon',
  document: {
    uuid: 'Item.abc123',
    id: 'abc123',
    name: 'Tideknot Trident',
    documentName: 'Item',
    type: 'weapon',
    destination: { type: 'world', folderId: null, packId: null }
  },
  warnings: [],
  errors: [],
  retryable: false
}
```

Proposed failed entry:

```javascript
{
  index: 1,
  status: 'error',
  inputName: 'Broken Spear',
  kind: 'item',
  profile: 'weapon',
  document: null,
  warnings: [],
  errors: [
    {
      code: 'INCONSISTENT_FIELDS',
      stage: 'validate',
      path: 'weaponVersatileDamageFormula',
      message: 'Versatile property and weaponVersatileDamageFormula must be supplied together.'
    }
  ],
  retryable: true
}
```

## Status rules

Operation status is:

- `success` — every entry succeeded without warnings.
- `warning` — no entry failed, but one or more entries produced warnings.
- `partial` — at least one entry succeeded or warned and at least one entry failed.
- `error` — every entry failed or the operation could not begin.

Entry status is exactly `success`, `warning`, or `error`.

Counts must match entry statuses:

```javascript
processed === succeeded + warned + failed
```

## Error shape

```javascript
{
  code: 'STABLE_MACHINE_CODE',
  stage: 'parse' | 'normalize' | 'validate' | 'convert' | 'create' | 'postProcess',
  path: 'activities[0].saveDC',
  message: 'Human-readable explanation.',
  details: {}
}
```

`code` is stable for programmatic handling. `message` may improve over time. `details` must remain serializable and must not contain document secrets unrelated to the request.

## Warnings

Warnings use the same shape as errors but do not prevent creation. Common categories include:

- Unresolved optional references.
- Ignored fields documented as irrelevant to the selected profile.
- Mechanics retained in prose because the friendly schema cannot automate them.
- Destination fallback.
- Backward-compatible alias use.

Warnings must be returned to the caller and displayed in Blacksmith. Console-only warnings are insufficient.

## Retry

Retry is a caller workflow built from entry results. A stable implementation may later expose `retryImport`, but the initial API should let callers select failed original entries and call `importJson` again.

Callers must not resubmit successful entries unless they intentionally want duplicates.

## Batch behavior

Default `batchPolicy` is `continue`: process entries independently and report all outcomes.

Future supported values may include:

- `continue` — keep processing after entry failure.
- `stop` — stop before processing later entries after the first failure.
- `atomic` — create all or none, only when a kind can guarantee rollback safely.

Do not advertise `atomic` until implemented for the requested kind/destination.

## Destinations

Capability metadata declares supported destinations. A request must not assume all kinds can write directly to compendiums.

Proposed shape:

```javascript
{
  type: 'world' | 'compendium',
  folderId: null,
  packId: null
}
```

Permission and pack-lock failures are create-stage errors.

## UI parity

Blacksmith's own importer window is a client of the same builders and result contract:

- JSON Template -> `getJsonTemplate` / `getAuthoringGuide`
- Prompt Template -> `getPromptTemplate`
- Validate -> `validateJson`
- Import -> `importJson`

The UI must not have hidden behavior unavailable to API callers except presentation concerns such as clipboard access, file dialogs, and opening a created sheet.

## Permissions

- Capability and authoring-output methods are read-only.
- Validation is read-only except unavoidable system preparation; it creates no documents.
- Import requires the Foundry permissions declared by the selected kind/destination and is expected to be GM-only initially.
- An external module cannot use Blacksmith to bypass Foundry permissions.

## Versioning

The namespace exposes `apiVersion`. Each profile exposes `schemaVersion`.

Callers should:

1. Feature-detect methods.
2. Inspect capabilities.
3. Supply only declared options.
4. Preserve unknown result fields.
5. Avoid parsing human-readable error messages when a machine `code` exists.

Breaking API changes require an `apiVersion` increment. Profile-only schema changes increment that profile's `schemaVersion`.

## Not yet guaranteed

Until this document's status changes to **Implemented**:

- `api.importer` may be absent.
- Method names and result details may still change during implementation.
- Current internal prompt builders are not a substitute for the public contract.
- External modules should not deep-import Blacksmith's internal registry or parser files.


---

## Material moved from `TODO.md` (2026-08-27)

Moved here verbatim when `TODO.md` was restructured into a stack-ranked list. It is design and
rationale, which is plan material; the work items it implies live in `TODO.md` as short entries
pointing back at this file. Reconcile it into the sections above when this plan is next worked on --
some of it restates what is already here.

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

**Steps 0 to 4 are implemented and recorded in `CHANGELOG.md`; they are removed from this list.** All
eight Item profiles -- loot, weapon, equipment, tool, container, feature, spell and consumable -- are
declared, with construction asserted equivalent to the parser across thirteen cases.
`testing/suites/suite-importer-declarations.js` stands at 107 assertions.

**It is gated off and is not running.** `registry-json-import-items.js` has the declaration import
commented out, so nothing registers and every entry routes to the parser. That was deliberate: the
importer is not being leveraged in production yet and must not silently change what a GM's import
produces. Uncommenting one line is the whole switch, because routing is by declaration presence.

### Turn the declaration engine on

Its own item because it is a decision rather than a step, and because the sequence below reads as
though the engine were already live otherwise.

Everything needed is built and asserted. What is NOT yet proven is behaviour in a running world:
thirteen parity cases compare document *source data*, not what Foundry stores once a document is
created. Before uncommenting, import each fixture in `testing/data/import-json/` and confirm the
created document -- particularly the generated weapon activity, equipment passive effects, and a
spell's template and materials.

Expect two visible changes on the day it goes on, both intended and both listed in `CHANGELOG.md`:
imports get stricter (an invalid `itemRarity` or a non-numeric `itemQuantity` now fail, naming the
field), and the retired `coffee-pub` flag and `system.consumableType` stop being written.

**How to verify:** `api.importer.listDeclarations()` returns eight profiles rather than `[]`, every
fixture imports, and a deliberately malformed payload fails naming the offending field instead of
reporting a blanket validation failure.

### Build sequence

**Vertical slices, never a horizontal layer.** Each step leaves the module working, is verifiable on its
own, and the old path keeps running until the step that replaces it. The engine is a data transformation
with no world state, so most of it is assertable in `testing/suites/` -- which is the first time any part of
the importer has been. Add `suite-importer-declarations.js` in step 1 and grow it with each step; the
long-standing "no automated coverage" defect is fixed by the re-founding rather than alongside it.

Steps 0-4 are done. What remains:

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

- **The result screen reads as a failure when nothing failed** (`scripts/window-json-import.js`, the summary
  line and its status banner). An entry that imports with warnings shows
  `1 processed - 0 succeeded - 1 warnings - 0 failed` under a **WARNING** banner. Every number is correct --
  the counts split success from warning, per the status rules in `plans/plan-importer-api.md` -- but
  "0 succeeded" beside a warning banner reads as "nothing worked", and on 2026-08-25 that stopped a live
  import of `testing/data/import-json/item-import-equipment-passive.json` that would have succeeded.

  **The trigger has been fixed and the presentation has not.** The nine warnings that prompted it were
  template residue reported one per field, now collapsed to a single line. But any entry importing with a
  genuine warning still reads the same way, so this is about the summary rather than about what produced it.

  Deliberately not touched during step 4: it is the shared result screen every kind renders, and five Item
  profiles are being verified against it right now. Fix it once the Item profiles are done, before the window
  moves to derived templates in step 5.

  **How to verify:** import an entry that produces one warning and no errors. The summary makes clear that
  the entry imported, and the banner does not claim otherwise.

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
