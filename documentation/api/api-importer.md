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
    derive: [ /* named derivations */ ]
});
```

### Forms

A profile declares how its fields reach the document.

| Form | Meaning |
|---|---|
| `mapped` | Each field lands at a declared path. The common case, and what a module-owned document type wants. |
| `rendered` | Fields feed a template and the whole payload lands as one HTML string. Blacksmith's own journal profiles; not offered to consumers. |
| `passthrough` | The payload already is document source data, plus declared envelope fields consumed into it. |

On a `passthrough` profile the payload is the seed: every key reaches the document unless a declaration claims it, which is the inverse of `mapped`. Declare only the envelope -- the keys an author writes that are not document data -- and a `role: 'envelope'` field is consumed by a derivation and removed. Undeclared keys are not reported, because on this form they are the content rather than a mistake, and the authoring guide says so rather than saying the opposite.

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

## What Blacksmith owns, and what you own

**Yours:** the shape of your content, which field lands where, what values you accept, your own rules, and any follow-up only you can do.

**Blacksmith's:** the template, guide and prompt derived from your declaration; validation and the structured result; document construction, destination, permissions and rollback; the transform and rule libraries; and export, which inverts the same declaration.

A module never calls `create`. If that seems to block something, say so -- it usually means a derivation or transform is missing rather than that the boundary is wrong.

## Errors

Every issue carries `code`, `stage`, `path`, `message` and `details`. `code` is stable and safe to branch on; `message` may improve. `path` names the authored field, which is what makes a failure actionable rather than a blanket rejection.

## The kind registry, being replaced

`registerKind`, `getKind`, `openWindow`, `parsePayload` and `attachButton` remain on the namespace and still work. They are the callback surface the declaration model replaces: a kind supplying `onValidateEntry` and `onImportEntry` builds its own documents, which is what puts destination, rollback and preservation beyond Blacksmith's reach.

**Do not build new consumers on them.** Declare a profile or a field group instead.
