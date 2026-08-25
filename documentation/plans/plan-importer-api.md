# Plan: the Importer API

**Status: Planned.** Nothing in this document is implemented.

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

### Dynamic vocabularies: three cases, two shapes

A field's `values` list is fixed at declaration time. Three consumer fields are not, and
they are not all the same problem -- which is why the mechanism gets designed against all
three rather than against the first one to arrive.

| Field | Where the values come from | Shape |
|---|---|---|
| Artificer `skill` | a user-configurable mapping JSON read at runtime; differs per world | runtime set |
| Artificer `artificerFamily` | selected by the value of `artificerType` | conditional set |
| Librarian codex `category` | user-extensible: a GM types a new one and it exists | runtime set, **members carry data** |

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
