# Blacksmith Importer Architecture

**Audience:** Contributors to Blacksmith, and maintainers of modules whose content Blacksmith imports.

**Scope:** How the JSON importer is built and why it is shaped this way.

**Public surface:** See `../api/api-importer.md`.

**Status:** The declaration model is live for the Item kind -- all eight Item profiles route through it. Roll Table, Actor and Journal still use the per-profile parser functions, and move one at a time. Both paths coexist by design, and which one runs is decided by whether a declaration exists.

## Why it is shaped this way

The importer exists for four reasons, and they are worth keeping in view because they decide arguments:

1. Every module was writing its own code to build an item or a journal, and that code already existed in Blacksmith.
2. Every module did it differently.
3. Users were handed authoring prompts of completely different shapes.
4. The core shapes turned out to be the same, with the exceptions normalisable.

The first implementation had a kind register **behavior** -- `onValidateEntry`, `onImportEntry`, `onBuildPrompt`, `onBuildJsonTemplate`, `onBuildAuthoringGuide`. Five callbacks is five places for every module to differ, so it guaranteed the divergence it existed to end. Measured against those four reasons it answers none of them.

A kind now registers a **declaration**: its shape, as data. Blacksmith derives the JSON template, the validation, the conversion checks, the document and eventually the export from that one source. Nobody builds, so nothing is built differently; two modules' prompts are structurally identical by construction rather than convention; and a field added to a declaration reaches every output with no other edit.

## The pieces

| File | Owns |
|---|---|
| `scripts/registry-declarations.js` | Declarations and field groups; validating both at registration |
| `scripts/manager-declarations.js` | Derivation: template, validation, construction, field composition |
| `scripts/manager-declaration-transforms.js` | Named conversions a declaration selects |
| `scripts/manager-declaration-rules.js` | The closed cross-field vocabulary, and named rules |
| `scripts/manager-declaration-derivations.js` | Content generated after fields resolve |
| `scripts/utility-import-issues.js` | The structured error vocabulary |
| `scripts/declarations/declaration-item.js` | Blacksmith's own eight Item profiles, as data |

`manager-declarations.js` knows nothing about items, journals or any content type. It reads a declaration and emits. That is the property to protect: anything content-specific belongs in a declaration or a named transform, never in the manager.

## Blacksmith builds the document

A module shapes its own data and never calls `create`. This is the boundary everything else rests on.

Destination, permissions, rollback, GM-note preservation and document-type preservation are all promises the importer makes. **None of them is enforceable if the module creates the document.** The evidence was internal before it was external: of the four kinds on the old callback path, only Actor rolled back on partial failure. One module, one author, four kinds, already inconsistent.

Foundry namespaces a module-declared subtype as `${module.id}.${subtype}`, so Blacksmith cannot *declare* another module's type. It can *create* one -- the registered data model validates whoever calls create, and a partial `system` is completed by the model. Verified against Foundry 13.351: a page created with a foreign subtype comes back with its system data intact. Declaration and construction are separate questions, and only the first is namespaced.

## Three profile forms

Derived by expressing all four of Blacksmith's own kinds -- nineteen profiles -- against the model rather than by specifying it in advance.

| Form | Fields reach the document by | Used by |
|---|---|---|
| `mapped` | landing at a declared path | Item profiles, and every module-owned type |
| `rendered` | feeding a template; the whole payload becomes one HTML string | Journal profiles (`journal-area.hbs` and siblings) |
| `passthrough` | already being document source data, plus a declared envelope consumed into it | Actor, and the Item kind's native branch |

**Rendered is Blacksmith-internal.** Every satellite that has asked -- Librarian's codex and quests, Artificer's recipes -- wants `mapped` against its own declared subtype. Rendered exists for Area, Location, Encounter and Injury, which are ours. Designing the satellite path around rendered would have designed it around the thing those modules most want to stop doing.

A kind may support more than one form; the Item kind is mapped or passthrough depending on whether the payload is already document-shaped.

## Composition: field groups

A module whose fields are **orthogonal to the host's type** cannot register a profile. An Artificer item is a loot, or a consumable, or a tool, *with* their fields added -- so there is no profile id to register under, and declaring the block once per host duplicates it while still not being opt-in per import.

A field group is its own registry, merged into a host profile's fields when that profile is derived. Two properties are load-bearing and were each a bug first:

**Composition happens on the whole declaration, not on the field list.** Rule evaluation resolves key aliases by looking a field up by name, so a group's rules must be evaluated against a field set that includes the group's fields. Composing the two separately put a group's fields in the template while its rules silently never fired.

**In validation and construction, a group applies when the payload engages it** -- the entry carries at least one of its fields. Authoring gates on an import option a person ticks; validation sees only JSON and has no options to consult. With every group always in play, a group's `required` field is demanded of every entry of the kind, and a plain weapon fails for want of an Artificer type.

## What a module selects and what it supplies

Transforms, rules and derivations are **named, Blacksmith-owned, and selected but never supplied**.

The reason is not tidiness. Blacksmith derives the validation, the guide line and the prompt sentence from the same declaration; a module supplying its own predicate gives us validation we cannot describe to a generator, which is reason 3 above returning by another route.

The rule vocabulary is **closed**, and keeping extension expensive is doing work rather than obstructing it. A consumer needing a scalar equality test wrote down why they wanted a new operator before asking for one, at which point the existing `field:value` notation turned out to already mean it and to be only half-implemented. A cheap extension point would have bolted an operator beside a rule that could never fire, and the never-firing rule would have survived.

Where the vocabulary genuinely cannot reach, a **named rule** carries its own sentence, so the prompt stays derivable. `weaponRangeRequired` is the first: ranged-ness is derived from the weapon subtype through a lookup table, so it is a rule about a value the author never wrote.

## Two readers of one contract is the recurring defect

Almost every bug this migration surfaced has one shape: two implementations of the same question, maintained separately, with nothing comparing them.

The item parser and the authoring template were written apart, so the template offered a spell four limited-uses fields the spell parser never read -- limited uses on a spell silently did nothing. Consumable had a second activity builder emitting `type: 'util'`, which is not a dnd5e activity type, beside a shared builder using `utility`. The three code paths answering "what does no activities look like" gave three different answers. Two source fields were invented rather than left blank, in two different builders.

None of them threw. All were invisible to reading and obvious to diffing, which is why `testing/suites/suite-importer-declarations.js` compares derived construction against the parser it replaces rather than asserting the derived output alone. **Keep that comparison until a kind's parser is deleted**; it is the evidence the migration was faithful, and deleting the baseline first removes the only thing that could show otherwise.

## Errors

Every issue carries `code`, `stage`, `path`, `message` and `details`. `issueFromError` in `registry-json-import.js` has always read the first three off a thrown error, and no kind on the callback path ever supplied them, so every failure surfaced as a blanket `VALIDATE_FAILED` with a blank path. Under declarations they are derived: a field that fails its declared type knows its own path, and a named rule knows its own code.

## Actor import specifics

These describe the Actor kind, which is still on the parser and moves at its own step.

Actor Import treats sidekicks as static dnd5e NPC snapshots. The Sidekick authoring profile records role, current level, narrative base creature, exact mechanical base-stat-block Actor name, and optional spellcasting ability in Blacksmith flags, while the supplied NPC system data and embedded items remain authoritative. Final HP, AC, proficiency, and features are accepted rather than inferred from CR. Validation warns when sidekick level and proficiency disagree, creature size and the HP formula's Hit Die disagree, the exact base Actor cannot be resolved, or supplied CR differs from the unscaled base Actor CR; it never silently recalculates the snapshot. Imported sidekicks are marked as important NPCs so dnd5e exposes death saves, and Blacksmith excludes their cosmetic CR/XP values from its monster encounter and XP calculations. Sidekick progression and automatic leveling are explicitly outside the current importer contract.

The friendly payload places `sidekick` at the Actor JSON root. This is an import envelope, not a native Foundry field: Blacksmith consumes it before creation and writes the normalized metadata to `flags["coffee-pub-blacksmith"].sidekick`. Already-native payloads using that flag location are also accepted. Spellcaster snapshots must use the same `int`, `wis`, or `cha` key in both `sidekick.spellcastingAbility` and `system.attributes.spellcasting`; validation warns when they diverge.

The friendly Actor schema's `token` block is likewise an authoring convenience. Before Foundry v13 Actor creation, Blacksmith merges it into `prototypeToken` (with explicitly supplied `prototypeToken` values taking precedence) and removes the legacy root key. This preserves generated token names, linkage, disposition, vision, bars, dimensions, and texture settings.

Character Snapshot authoring uses the same readable reference contract as other importers. Race/species, background, and subclasses are exact plain Item names or inline native definitions. Referenced classes add their final level count (`{ "name": "Barbarian", "levels": 15 }`), while inline native Class definitions carry `system.levels`; arrays support multiclass distributions. Although Foundry stores all four as Item documents, Blacksmith resolves them through independent prioritized Species, Background, Class, and Subclass mappings, embeds the documents, applies class levels, and writes their new Actor-local IDs into dnd5e's relationship fields. Prompt preferences default to Auto, meaning the generator makes the choice and emits its exact resolved name rather than the word `Auto`. Snapshot import does not execute advancements, make choices, or auto-level.

Resolved Actor content may carry Actor-local state without becoming an inline definition: `{ "itemName": "Cloak of Protection", "itemType": "Equipment", "equipped": true, "attuned": true, "quantity": 1 }`, and Spell wrappers may add `prepared`. The resolver copies the exact world/compendium document, then applies only those state overrides (`system.quantity`, `equipped`, `attuned`, or numeric spell `prepared`). Plain strings remain references with source defaults. Wrapper validation rejects invalid quantity and `prepared` on non-Spells.

Actor prompt authoring exposes independently selectable configured Species/Race, Background, Class, Subclass, Item, Feature, and Spell compendiums plus optional world content. Foundation selectors appear for Character Snapshot authoring; Item catalogs contain equipment, tools, consumables, and other inventory while excluding foundation, feat, and spell entries supplied by dedicated catalogs. Actor compendiums are intentionally absent: Actor construction references Item documents, while Sidekick base-stat-block Actor resolution continues through the configured global Actor mapping. Selected catalogs are appended to prompts with exact plain names and metadata; generated JSON never contains their UUIDs. Prompt selection and import resolution use the same mappings, so showing a source to the generator never creates a source the importer cannot search.

Compendium Mapping is always represented by ordinary manual priority settings. Blacksmith generates one independent inclusion checkbox per installed Foundry package/source, not per individual pack; this source allowlist filters both the choices and effective sources of every mapping after settings are saved and Foundry reloads. **Auto-map Compendiums on Next Load** is an explicit one-shot initializer: the next active GM load inspects indexes, replaces every priority mapping from the enabled sources, orders candidates by official supplement/update, core PHB/DMG/MM, third-party/imported/homebrew, then bundled SRD, clears the request, and notifies the GM. From that point onward the generated settings are manual and authoritative. Disabled-source values may remain stored but are inactive.

Manual mapping sections derive their number of priority selectors from the number of compatible compendiums currently available for that type. The GM does not configure a count: every eligible pack receives a possible priority slot, and unused slots remain None. Legacy count settings stay hidden and registered solely for compatibility with existing worlds and external readers.

Raw native Character exports are a distinct future ingestion profile because their Actor details, containers, Active Effect origins, and other embedded data contain an interconnected graph of Actor-local IDs. Until that graph is remapped losslessly, the friendly Character Snapshot parser rejects native exports rather than producing a superficially successful but internally broken character.

**Related documentation:**

- `../api/api-importer.md` -- the public `api.importer` registry surface
- `../api/api-window.md` -- shared Application V2 window contract
- `../../prompts/` -- current prompt parts and profile contracts

## Window information architecture

Importer windows use three tabs, in this order: **Import JSON**, **JSON Template**, **Prompt Template**. The ordering communicates that AI is optional and the importer is the product. A header switcher moves between kinds, saving each one's authoring choices independently; the switcher changes content kind while the tabs change authoring workflow.

The window stays open after processing and reports per-entry results, so a failed entry can be corrected and retried without re-opening or re-pasting. Retry Failed submits only the failed entries and does not recreate successes.

Every authoring output supports Copy and Save As plain text. Authoring choices are remembered per user and per importer; campaign-owned defaults such as journal geography are world state.

## Related documentation

- `../api/api-importer.md` -- the public surface
- `../api/api-window.md` -- the shared Application V2 window contract
- `../../prompts/` -- prompt parts, until profiles carry their own guidance
