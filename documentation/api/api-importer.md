# Blacksmith Importer API

**Audience:** Module authors whose content should be importable from JSON.

**Scope:** `api.importer` lets a module declare the SHAPE of its content as data. Blacksmith derives the JSON template, the validation, the conversion and the document from that declaration, and builds the document itself.

**Architecture:** See `../architecture/architecture-importer.md`.

## The model in one paragraph

A module does not write import code. It registers a **declaration** -- a list of fields, each naming where it lands on the document, what it accepts, and one sentence of guidance -- and Blacksmith derives everything else. Adding a field to a declaration adds it to the authoring template, the guide, the prompt, the validation and the export, with no other edit anywhere.

**Blacksmith builds the document.** A module shapes its own data and never calls `create`. That is what makes destination, permissions, rollback, GM-note preservation and document-type preservation enforceable in one place rather than reimplemented per module.

## Reaching it

```javascript
const importer = game.modules.get('coffee-pub-blacksmith')?.api?.importer;
if (!importer?.registerDeclaration) return;   // older Blacksmith
```

Register during your module's `ready`. There is no `waitForReady()` on the API root -- only on `api.sockets` -- so feature-detect the method you need rather than awaiting readiness.

| Method | Behavior |
|---|---|
| `registerDeclaration(declaration)` | Registers one profile. Throws, naming the offending field, when the declaration is malformed. |
| `getDeclaration(kindId, profileId)` | The registered declaration, or `undefined`. |
| `getDeclarationsForKind(kindId)` | Every profile of one kind, in registration order. |
| `listDeclarations()` | Every registered profile. |
| `registerFieldGroup(group)` | Registers fields contributed to profiles a module does not own. |
| `getFieldGroupsFor(kindId, profileId)` | Every group attaching to one profile. |
| `listFieldGroups()` | Every registered group. |
| `getJsonTemplate(kindId, profileId, options?)` | The derived authoring template, as formatted JSON text. |
| `getJsonTemplateObject(kindId, profileId, options?)` | The same template as an object. |
| `getAuthoringGuide(kindId, profileId, options?)` | The derived guide: every field, every rule, and the template. |
| `validateEntry(kindId, profileId, entry)` | Shape validation. Pure and synchronous; no world access, nothing created. |
| `validateEntryDeep(kindId, profileId, entry)` | Shape validation plus a dry conversion. Returns the assembled data on `data`. Nothing created. |
| `buildDocumentData(kindId, profileId, entry)` | Document source data for one entry, ready for `createDocuments`. Nothing created. |
| `buildDocumentUpdate(kindId, profileId, entry)` | A partial document from the fields the entry supplies, ready for `Document#update`. Nothing created. |
| `declarationFromModel(schema, options)` | A declaration derived from a Foundry DataModel schema, so a module that already has a `TypeDataModel` does not transcribe it a second time. |

`buildDocumentData` is the primitive that lets a module stop maintaining its own builder, and it is **not only for JSON import**. Any surface that collects friendly fields -- a form in your own window, a macro, a generator -- can map them to an entry and get the same document data the importer produces, from the same declaration. Declaring a shape once is the point; a second builder beside it is what the model exists to remove.

**Creating and editing are two modes of one assembler, not two builders.** `buildDocumentUpdate` reads the same declaration and runs the same transforms, and omits the three things creation does that an edit must not:

- the document `type` and every `const` -- rewriting a type the document already has fails the whole save, not just the field
- defaults for absent fields -- an edit must not assert `quantity: 1` and `identified: true` because the form did not mention them
- derivations -- they assemble whole content from the whole entry and cannot express "leave the rest alone"

A field present but empty still clears, because that is a value you supplied. Nested paths come back as nested objects, which is what `Document#update` merges; an array field replaces, as everywhere else.

This exists because moving only a create path onto declarations, while keeping a hand-written builder for edits, takes a module from one builder to two -- worse than the duplication being removed.

If you call `createDocuments` yourself, you own what follows. Destination, permissions, rollback and GM-note preservation are promises the **import path** makes, and they do not travel with the data. Use the import path where they matter.

A malformed declaration fails at **registration**, not at import. An unknown transform name, a rule referencing a field the profile does not declare, a default that does not match its own field's type -- all rejected when you register, with the field named.

## Declaring a profile

```javascript
importer.registerDeclaration({
    kind: 'item',                 // the host kind
    id: 'potion',                 // unique within the kind
    label: 'Potion',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'Item', type: 'consumable' },
    fields: [ /* below */ ],
    rules: [ /* below */ ],
    derive: [ /* named derivations */ ],
    preamble: 'Prose that does not reduce to per-field guidance.'   // optional, below
});
```

### The profile `preamble`

`preamble` is profile-level prose: the role a generator is given, what to do first, and the relationships between fields that no single field's one-sentence `guidance` can hold. It is a non-empty string, rejected at registration if blank or not a string.

It is rendered in two places from the one declaration, so they cannot disagree. In the generation prompt it comes **before** the `FIELDS` list, because framing read after forty field lines reads as a footnote. In the authoring guide it comes after the rules. A field group's own `preamble` is separate and follows it.

It exists so a module hosts no prompt text of its own. It does not make the prompt a hand-authored one: the derived prompt is still the field list, the rules, the author's answers and the template, with your prose added. Write what a generator needs to know that the fields cannot say, and keep it short. A preamble that restates the field list will drift from it.

### Forms

A profile declares how its fields reach the document.

| Form | Meaning |
|---|---|
| `mapped` | Each field lands at a declared path. The common case, and what a module-owned document type wants. |
| `passthrough` | The payload already is document source data, plus declared envelope fields consumed into it. |

On a `passthrough` profile the payload is the seed: every key reaches the document unless a declaration claims it, which is the inverse of `mapped`. Declare only the envelope -- the keys an author writes that are not document data -- and a `role: 'envelope'` field is consumed by a derivation and removed. Undeclared keys are not reported, because on this form they are the content rather than a mistake, and the authoring guide says so rather than saying the opposite.

### The document descriptor

`document` says what to build and where it goes. `documentName` is required; everything else depends on what
you are building.

| Key | Meaning |
|---|---|
| `documentName` | The Foundry document class: `Item`, `Actor`, `JournalEntry`, `JournalEntryPage`, `RollTable`. |
| `type` | The document subtype. **Yours may be namespaced** -- `coffee-pub-librarian.codex` -- and Blacksmith will build it. |
| `pageType` | For a profile whose `documentName` is `JournalEntry`: the subtype stamped on the pages a derivation produces. Defaults to `text`. |
| `containerName` | For a `JournalEntryPage` profile: a constant naming the entry the page files into. |
| `containerNameFrom` | The same, read from a declared field instead of fixed. Exactly one of the two. |
| `containerNameTransform` | A named Blacksmith transform applied to that value. Untransformed by default. |
| `containerNameMap` | A lookup from the field's value to a container name, as data. Alternative to a transform. |
| `folderName` | A constant naming the folder the entry files under. |
| `folderNameFrom` | The same, read from a declared field. Exactly one of the two. |

**Foundry namespaces the DECLARATION of a subtype, not its creation.** Your module declares
`coffee-pub-yours.thing` in its own `module.json`; Blacksmith can then build pages of that type without
knowing anything about it. That is the seam -- every journal builder used to hardcode `type: "text"`, which
is what blocked module-owned page types entirely.

**Two shapes, and picking the wrong one fails quietly.** A profile whose `documentName` is `JournalEntry`
builds an entry and its derivations produce the pages. A profile whose `documentName` is `JournalEntryPage`
**is** the page -- its fields land on the page itself, and `containerName`/`containerNameFrom` says which
entry receives it. Declaring `JournalEntry` when you meant the page produces an entry named after your
record, carrying a stray `system` object and no pages at all, reporting success.

**A destination value is yours and is not reshaped.** Container names are untransformed unless you name a
transform, because only you know whether the entry you have to match is spelled the way your enum is. Folder
names match case-insensitively and are created verbatim, so an existing `Injuries` is found by `injuries`
without a second folder appearing and without yours being renamed.

Declaring a folder is optional -- the root is a legitimate destination, and Blacksmith's own profiles take
theirs from the import dialog. But if your pages must not land at the root, declare it: a folder supplied by
naming a field `foldername` by convention is not checkable, and the first module to write a profile without
knowing that convention existed imported every page to the world root while every import reported success.

### Fields

```javascript
{
    name: 'potionRarity',            // the authoring key
    path: 'system.rarity',           // MANDATORY on a mapped profile
    type: 'string',                  // string | number | integer | boolean | array | object | formula
    required: false,
    nullable: false,                 // whether null is a VALUE rather than an absence
    default: 'common',               // applied when the field is absent
    example: 'common',               // shown in the template
    values: ['common', 'rare'],      // allowed canonical values; matching folds case
    min: 1, max: 20,                 // inclusive bounds; number and integer fields only
    aliases: { ordinary: 'common' }, // other spellings of a VALUE
    acceptsKeys: ['rarity'],         // other KEYS this field arrives under
    transform: 'price',              // a named, Blacksmith-owned conversion
    guidance: 'How rare the potion is.'
}
```

`path` is mandatory and never inferred from `name`: a document can have both a native `category` and a `system.category`, and only the declaration can say which is meant.

`default` and `example` are **both in authored shape** -- what a person types, never what a transform produces. Transforms run over a default too, so a default already in converted shape is converted twice. The registry rejects one that does not match its own field's declared type.

`type: 'formula'` is a dnd5e FormulaField, which accepts a number or a roll-formula string. Use it wherever both are legitimate -- a save DC is `15` or `8 + @prof + @abilities.cha.mod` -- because `integer` rejects every formula and `string` rejects every plain number.

`values` is a canonical vocabulary and matching it **folds case**: a payload saying `Recharge` satisfies a list containing `recharge`, and the canonical spelling is what reaches the document. `min` and `max` are rejected at registration on anything but a number or integer field.

**`aliases` and `acceptsKeys` are different mechanisms.** `aliases` renames a *value*; `acceptsKeys` names other *keys* the field may arrive under. Both are permanent compatibility surface, not migration conveniences.

Other field properties:

- `authorable: false` -- declared, never offered for authoring, never written from a payload, preserved across re-import. For state a subsystem maintains.
- `const` -- a fixed value always written and never authored.
- `role: 'selector' | 'input' | 'envelope'` -- fields that do not land on a path of their own. An `input` is read by a sibling field's transform, which is how two authored fields feed one document path.
- `requiresOption` / `suppressedByOption` -- gate on an import option a person ticks.
- `requiresWhen: 'otherField:value'` -- gate on another FIELD's value.
- `fields` -- a nested declaration for object and array-of-object fields. Nested fields are validated exactly as top-level ones are, to any depth, and an error names its own path (`sidekick.role`, `results[2].resultType`). The template's worked example is derived from the same declaration, so the example cannot drift from what validation accepts.

### The selector: how a payload names its profile

The Unified Import window routes each journal entry by its top-level `journaltype` string, matched against the registered profile ids (`area`, `location`, `recipe`, ...). A payload without it fails validation with `Missing 'journaltype' field`, which lists the registered ids.

**Declare the selector yourself.** Nothing adds it for you. Declare one field with `role: 'selector'` named `journaltype`, whose `values` include your profile id, and give it an `example`; the generated template, guide and prompt are built from `declaration.fields`, so a profile without it produces templates that never mention the key an author must write.

**`declarationFromModel` does not add it either.** The walk covers the model's own schema, which has no `journaltype`, so pass it in `extraFields`.

**A profile with no selector still registers.** It routes only when an author writes `journaltype` by hand, and it never appears in a template. A module that files pages through its own window and calls `buildDocumentData` directly does not need one. A module that wants the Unified Import window to work for it does.

**What the Unified Import window does with a page profile.** It files the page under the declared `containerName` / `containerNameFrom`, and ignores any destination the module resolves for its own window. A placeholder `containerName` meant only to satisfy registration becomes a real journal name the first time a payload arrives through the Unified Import window.

### A concrete example in `guidance` is read as the answer

`guidance` is one sentence and a generator treats it as instruction, so naming a specific VALUE there
tends to produce that value rather than that shape. A consumer put a real icon path in an image field's
guidance as an illustration and got the same dagger on two quite different records, because the example
read as the answer rather than the format.

Say what the field IS and, where a format needs showing, choose an illustration nothing would plausibly
want: `such as 1d8` is safe for damage dice because the value is dictated by the item, while a complete
file path or a full sentence of prose is not. If you need a starting value rather than a description,
that is what `example` is for -- it goes in the template, where an author edits it, instead of into the
prompt where a model obeys it.

### Images: resolve what the generator wrote

A field carrying an image path can declare `transform: 'resolveImage'`, and Blacksmith turns whatever was
written into a path that exists.

```javascript
{ name: 'img', path: 'img', type: 'string', transform: 'resolveImage',
  imageRoots: ['icons/skills/wounds'],          // where to look
  imageFallback: 'icons/svg/blood.svg' }        // REQUIRED: where a miss lands
```

| Key | Meaning |
|---|---|
| `imageRoots` | Directories searched, recursively. Omit to verify only. |
| `imageFallback` | The path used when nothing matches. **Required** -- a resolver whose miss produces nothing has kept the defect it was added to prevent. |

**An existing path is always kept**, whether or not it sits under a declared root, so your own artwork is
never replaced by a core icon that happens to share three words. A path that does NOT exist is matched
against the roots on shared filename words, and anything below two words in common falls back rather than
guessing. Every substitution and every fallback logs a line naming the field and the value.

**Why matching rather than a catalog in the prompt.** There are 6,193 core icons, so a list cannot be
complete; any subset is a guess about what your content needs; and a generator handed a list still has to
match meaning to filename, which is the same problem moved somewhere it is done worse. Core icon filenames
are already descriptive -- `injury-face-impact-orange.webp` -- so the tokens are the description. The
failure this exists for was `injury-mouth-teeth-red.webp` against a real `injury-mouth-tooth-red.webp`:
one word out of four, with no way for the generator to know.

**A miss must never fail the import.** Wrong art is cosmetic; a record that failed to import is a missing
mechanic; a dead path is worse than both, because it looks like success.

### Rules

Cross-field validation comes from a **closed vocabulary**. Blacksmith derives the check, the guide line and the prompt sentence from the same entry, which is why a module selects a rule and never supplies a predicate.

| Kind | Shape |
|---|---|
| `requiresTogether` | `{ kind, fields: [a, b] }` |
| `mutuallyExclusive` | `{ kind, fields: [a, b] }` |
| `impliedBy` | `{ kind, when, then: [...] }` -- both directions |
| `requires` | `{ kind, when, then: [...] }` |
| `mustBeEmpty` | `{ kind, field }` |

A reference is a field name, meaning "supplied and non-empty", or `field:value`, meaning "this field has this value" -- which covers a list containing the value and a scalar equalling it.

A rule referencing a field the profile does not declare is rejected at registration. Such a rule is silently inert, and an inert rule reads as enforced while enforcing nothing.

Where the vocabulary genuinely cannot reach -- a rule about a value the author never wrote -- Blacksmith adds a **named rule** carrying its own sentence, and a declaration selects it: `{ named: 'weaponRangeRequired' }`. Ask for one rather than working around its absence.

### Transforms and derivations

Both are named, Blacksmith-owned, and **selected but never supplied**. Blacksmith owns compatibility with Foundry and the game system, so a system-shaped conversion belongs here rather than in each module.

- A **transform** converts one field's authored value on the way to its path.
- A **derivation** runs after every field resolves, over the assembled document, for content that is generated rather than authored.

Needing one that does not exist is a request, not a blocker. This is one of the two places where negotiation with Blacksmith survives; the other is fragments.

## Field groups

For fields that are **orthogonal to the host's type** -- content that is a loot, or a consumable, or a tool, *with* your fields added. Registering a profile would compete with the host's rather than compose with it, and declaring the same block once per host profile duplicates it and still cannot be opted into per import.

```javascript
importer.registerFieldGroup({
    id: 'artificer',
    module: 'coffee-pub-artificer',        // required: a group must say whose fields these are
    kind: 'item',
    appliesTo: '*',                        // or ['loot', 'consumable', 'tool']
    option: { id: 'artificerItem', label: 'Artificer Item' },
    preamble: 'Prompt text that does not reduce to per-field guidance.',
    fields: [ /* declared exactly as a profile's are */ ],
    rules: [ /* the same vocabulary */ ]
});
```

A group's fields are merged into every profile it applies to, and are indistinguishable from declared fields downstream. Its rules are evaluated against the composed field set, so a rule over a contributed field works.

**Two behaviours worth knowing:**

The group's `option` gates the whole group in authoring output -- declare the gate once rather than on each field.

**In validation and construction the group applies when the PAYLOAD engages it**, meaning the entry carries at least one of its fields. Validation sees only JSON and has no options to consult. A payload that never mentions the group is unaffected by it; a payload carrying part of it is a genuine error and reported as one.

A profile's own fields win a name collision. The host owns its schema.

`preamble` exists so a module's prompt text has a home in its own declaration. A module should not need to host prompt files, and Blacksmith should not host another module's.

## Asking the author a question

A profile can put its own fields on the prompt with `promptFields`. Before this, construction,
validation, routing and the template dropdown all read the registry and the prompt did not -- so a module
could describe its data completely and could not ask one question about it.

```js
promptFields: [
    { id: 'category', label: 'Damage type', inputType: 'select',
      options: [{ value: 'slashing', label: 'Slashing' }, { value: 'fire', label: 'Fire' }],
      hint: 'Which journal the generated pages are filed into.' },
    { id: 'count', label: 'How many', value: '10' }
]
```

The author's answers arrive in the `promptOptions` your `onBuildPrompt` already receives, keyed by `id`.

**If your profile has no `onBuildPrompt` -- which is the normal case for a declared profile, since
Blacksmith derives the prompt from the declaration -- the answers reach the generated text on their own,
and how depends on the id:**

- **An id matching a declared field's `name` becomes a CONSTRAINT on that field.** The prompt states it
  as a fixed value and the JSON template carries the same value, so the two cannot disagree. Use this
  where the answer decides something structural: a `severity` or `category` that selects the destination
  journal is not a preference, and a generator treating it as one files pages in the wrong place.
- **Any other id is quoted in the author's own words**, using the label the control showed -- `How many:
  2`. Nothing in the format claims to know that "how many" means records rather than a field, so say what
  you mean in the label.
- **An unanswered field contributes nothing.** A default presented to a generator as a choice cannot be
  told apart from one the author made.

**`value` is a prefill, and an untouched prefill IS the answer.** It is rendered into the control, so if
the author does not change it, that is what they submitted and that is what the prompt will say. Use it
for a value that is genuinely the common case, not as an illustration of the format -- the format belongs
in `hint`.

| Key | |
|---|---|
| `id`, `label` | Required. `id` must be unique within the profile. |
| `inputType` | `text` (default), `select`, `textarea`, `item`, `items` or `tags`. `item` and `items` are drop targets and `tags` is a chip picker, below. |
| `options` | Required for `select`, refused otherwise. Each needs a `value`. |
| `dynamicOptions` | `true` on a `select` or `tags` field whose list changes while the world is live. Carries no `options`; the module supplies them, below. |
| `value` | Prefilled answer. |
| `hint` | One sentence, shown as a help tooltip beside the label. |
| `placeholder`, `rows` | Text and textarea presentation. |
| `fullWidth` | Give the row the full grid width. |
| `group`, `groupIcon` | Put related fields under a shared heading. |

**Every one of those is rendered** -- the allowed set is read off the prompt window rather than chosen,
because a key nothing renders would let a profile register, validate, and silently never show the field.
Anything else is rejected by name at registration.

**Two rules you do not control:**

- **The kind's fields win a collision.** A declaration ADDS a field; it cannot redefine one the kind
  already offers. Two profiles may both use the id `severity` -- each is scoped to its own template and
  only one profile is ever selected.
- **`showForTemplate` is stamped for you, and declaring it is an error**, as is `showForField`. A prompt
  field is not self-identifying the way a template option is, so an unscoped field would appear on every
  other profile's prompt -- your `severity` question turning up while somebody imports a Realm.

### Dropping real items: `item` and `items`

A name the author types can be wrong, and a name a generator invents is worse. Two input types let the author
drag a Foundry Item from the sidebar or a compendium onto the prompt instead:

- **`item`** is one item. Dropping writes its name into the field.
- **`items`** is a list, one `Name xQuantity` per line. Dropping adds a line, or raises the quantity by one when
  the item is already listed.

Both are ordinary text controls that also accept a dropped item. Each entry is shown beneath the control with its
icon and name and an × to remove it, the icon coming from the drop, or else from an exact-name lookup in the GM's Compendium Mapping and
the world, with a placeholder when nothing matches. The author can still type a name, correct a
quantity or delete a line. They carry no `options`. A drop of anything but an Item is refused with a warning.

Both follow the constraint rule above. If the `id` matches a declared field's `name`, the answer constrains that
field in the prompt and seeds the JSON template. An `item` answer is a string. An `items` answer becomes a list of
`{ name, quantity }` entries, and the prompt says the field must contain exactly those entries and that the
generator fills every other field on each. Only the name is captured, so the generator supplies anything else the
entry needs; Blacksmith reads nothing off the dropped item that a module's own flags would carry.

A numeric or boolean field's answer is converted to the field's type before it reaches the template and the
prompt, so a typed `1000` is the number `1000`. A field that is a list of plain strings takes a textarea:
entries separated by commas or new lines become the array, so `Herbal, Medicinal` is `["Herbal", "Medicinal"]`.
A list of objects is not converted this way; it has its own control, `items`.

### Open-ended lists you build by picking or typing: `tags`

For a list of short strings with no fixed vocabulary, such as a recipe's traits, `inputType: 'tags'` gives a text entry
with suggestions and a removable chip for each tag. Typing a tag that is not suggested and pressing Enter or comma, or
leaving the box, still adds it: **the suggestions are help, never a closed set.** Choosing a suggestion adds it at once.

The answer is one comma-separated string, so a field that is an array of plain strings receives it as an array, the
same conversion a textarea gets. Suggestions come from `options` (static, `[{ value }]`) or from `dynamicOptions: true`
and `setPromptFieldOptions` (below). A `tags` field with neither is simply open text with chips. Unlike a select it
gets no blank entry, since there is nothing to leave unchosen.

### A select whose list changes: `dynamicOptions`

A declaration registers once, at load, and a static `options` list is frozen with it. A vocabulary a GM can edit
while the world is open, such as a skills mapping, cannot live there. Declare the select without a list and
push the list when you have it:

```js
promptFields: [{ id: 'skill', label: 'Skill', inputType: 'select', dynamicOptions: true }]

importer.setPromptFieldOptions({
    kind: 'journal', profile: 'recipe', field: 'skill',
    options: ['Alchemy', { value: 'herbalism', label: 'Herbalism' }]
});
```

Call it once your list is ready and again whenever the list changes. Each call **replaces** the previous list.
Blacksmith reads it every time the prompt window opens, so a window opened after a change shows the new list; one
already open does not update. The select always starts with a blank *No preference* entry, and a blank answer is an
unanswered question, omitted from the prompt like any other.

This is a value you hand Blacksmith, not a function it calls and not a setting it reads. It is rejected for a
profile that is not registered, for a field not declared with `dynamicOptions: true`, and for an option with no
value.

## Offering real content to the prompt: `promptCatalogs`

A generator told only the schema writes plausible names for things that do not exist. A recipe naming an
ingredient the world does not have cannot be crafted. Area Narrative's prompt already offers the GM's real
actors and items for that reason, and a journal profile can ask for the same:

```js
promptCatalogs: ['items']          // or ['actors', 'items']
```

**This reuses the controls Area Narrative has; it adds none.** Naming `items` shows the prompt window's existing
Compendium Items section (one checkbox per compendium in the GM's Compendium Mapping, Select All / None, the
selection remembered between sessions) and the World section's *Include world items* checkbox on your profile's
prompt, and embeds the same list Area embeds. `actors` does the same for actors. Nothing is scoped to your
profile but visibility: the checkboxes are the same ones, so a choice made on one prompt is the choice on the
other.

**The source is the GM's Compendium Mapping, and you cannot name another.** A module's own compendium settings
say what that module uses to process content, not what the GM wants offered to a generator, and Blacksmith does
not read another module's settings. If your bundled packs should appear, the GM maps them in Blacksmith's
Compendium Mapping like any other.

**Journal profiles only.** The item and actor prompt routes do not carry the author's checkbox answers to the
builder, so a catalog named there would show its checkboxes and never reach the text. Registration rejects it,
and rejects any name other than `actors` or `items`.

**What the generator is told.** Each ticked catalog adds a section, `AVAILABLE ITEMS -- USE THESE EXACT NAMES`,
before the author's answers, holding the same lists Area embeds: item names grouped by compendium and rarity,
then the world's items under `WORLD`. Names only; there is no per-item metadata and no grouping by a module's
own flags.

## Checking a declaration before you ship it

Three entry points under `api/` run in **Node, offline, with no Foundry and no Blacksmith runtime**, so your
build can gate on them. Import these paths and not the implementation behind them.

| Path | Answers |
|---|---|
| `api/declaration-from-model.mjs` | Build a declaration from your DataModel schema. |
| `api/validate-declaration.mjs` | Will the registry accept it? The real registration rules, not an approximation. |
| `api/check-declaration-mirrors-model.mjs` | Does it still describe your model? Pairs fields both ways and rejects a declared constraint stricter than the model's. |

```javascript
import { validateDeclaration } from '../coffee-pub-blacksmith/api/validate-declaration.mjs';

try { validateDeclaration(declaration); }
catch (error) { console.error(error.message); process.exit(1); }
```

**Use all three, because they answer different questions.** A declaration can mirror your model exactly and
still be rejected at registration -- that happened: a walked declaration carried an `ArrayField`'s
element-count `min` on an array-typed field, the mirror check passed, and the registry refused it in a live
world with every profile unregistered.

**Your DataModel is the senior schema.** The declaration describes it and can drift from it; the model
cannot be wrong about itself. When they disagree, the model wins and the declaration is the thing to fix.

## What Blacksmith owns, and what you own

**Yours:** the shape of your content, which field lands where, what values you accept, your own rules, and any follow-up only you can do.

**Blacksmith's:** the template, guide and prompt derived from your declaration; validation and the structured result; document construction, destination, permissions and rollback; the transform and rule libraries; and export, which inverts the same declaration.

A module never calls `create`. If that seems to block something, say so -- it usually means a derivation or transform is missing rather than that the boundary is wrong.

## Errors

Every issue carries `code`, `stage`, `path`, `message` and `details`. `code` is stable and safe to branch on; `message` may improve. `path` names the authored field, which is what makes a failure actionable rather than a blanket rejection.

## The kind registry, being replaced

`registerKind`, `getKind`, `openWindow`, `parsePayload` and `attachButton` remain on the namespace and still work. They are the callback surface the declaration model replaces: a kind supplying `onValidateEntry` and `onImportEntry` builds its own documents, which is what puts destination, rollback and preservation beyond Blacksmith's reach.

**Do not build new consumers on them.** Declare a profile or a field group instead.
