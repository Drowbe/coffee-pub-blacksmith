# Blacksmith Importer Architecture

**Audience:** Contributors to Blacksmith, and maintainers of modules whose content Blacksmith imports.

**Scope:** How the JSON importer is built and why it is shaped this way.

**Public surface:** See `../api/api-importer.md`.

**Status:** The declaration model is live for Item, Roll Table and Actor -- fourteen profiles route through it. Journal still uses its per-profile parser functions and moves at its own step. Both paths coexist by design, and which one runs is decided by whether a declaration exists.

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
| `scripts/declarations/declaration-rolltable.js` | The two Roll Table result profiles, as data |
| `scripts/declarations/declaration-actor.js` | The three Actor profiles -- the envelope only |
| `scripts/parsers/parse-actor.js` | Consuming the Actor envelope, and the post-create link step |

`manager-declarations.js` knows nothing about items, journals or any content type. It reads a declaration and emits. That is the property to protect: anything content-specific belongs in a declaration or a named transform, never in the manager.

## Blacksmith builds the document

A module shapes its own data and never calls `create`. This is the boundary everything else rests on.

Destination, permissions, rollback, GM-note preservation and document-type preservation are all promises the importer makes. **None of them is enforceable if the module creates the document.** The evidence was internal before it was external: of the four kinds on the old callback path, only Actor rolled back on partial failure. One module, one author, four kinds, already inconsistent.

Foundry namespaces a module-declared subtype as `${module.id}.${subtype}`, so Blacksmith cannot *declare* another module's type. It can *create* one -- the registered data model validates whoever calls create, and a partial `system` is completed by the model. Verified against Foundry 13.351: a page created with a foreign subtype comes back with its system data intact. Declaration and construction are separate questions, and only the first is namespaced.

## Two profile forms

Derived by expressing Blacksmith's own kinds against the model rather than by specifying it in advance -- which is also how the third form was removed.

**There was a `rendered` form, and expressing Journal against the model deleted it.** It was specified as fields feeding a template, the whole payload becoming one HTML string, and no profile ever used it. Area turns out to be `mapped`: every field is `role: 'input'` because none lands at a path on its own, and one derivation composes the HTML -- structurally identical to what a Roll Table's rows and an Actor's envelope already do. A form living in a registry and a documentation table but in no profile is indistinguishable from a rule that can never fire, which is this repo's most common defect shape.

| Form | Fields reach the document by | Used by |
|---|---|---|
| `mapped` | landing at a declared path | Item profiles, and every module-owned type |
| `passthrough` | already being document source data, plus a declared envelope consumed into it | Actor profiles, and the Item kind's native branch |

Every satellite that has asked -- Librarian's codex and quests, Artificer's recipes, Bibliosoph's injuries -- wants `mapped` against its own declared subtype, which is now simply the ordinary case.

A kind may support more than one form; the Item kind is mapped or passthrough depending on whether the payload is already document-shaped.

## A foreign subtype's DataModel is the validator, not the declaration

Blacksmith can construct a page subtype another module declares -- Foundry namespaces the declaration of a
subtype, not its creation -- and a profile says which one through `document.pageType`.

**What that does not mean is that our declaration decides the shape.** Foundry runs the registered
`DataModel.defineSchema()` against whatever is created, so for a foreign subtype there are two schemas in
play and ours is the junior one. A declaration that describes fewer fields than the model does not fail
loudly: the document lands, and every undescribed field is silently set to the model's `initial`.

Raised by Bibliosoph on 2026-09-02, and the numbers are what make it concrete. Their injury page model
declares **sixteen** fields; the five Blacksmith had been working from were the five their *picker* reads for
a summary row -- a display projection mistaken for a schema. A profile built on those five would have
imported successfully and written eleven defaulted fields, including a `treatmentdc` of 0 where null means
"use the severity ladder" and an empty `modifiers` array where the injury's whole mechanical effect lives.

So the rule for any module-owned subtype: **the declaration must mirror the model, and where they disagree
the model wins silently.** The safest construction is to derive the declaration from the model itself, which
`api.importer.declarationFromModel` does -- and `api/declaration-from-model.mjs` is the stable path a module
can import in its own build tooling, offline, to do it before shipping.

**The part that cannot self-heal is the field SET, not the enums.** A well-built profile already imports its
own vocabularies, so an added enum value flows through. A seventeenth field added to a model simply never
appears in a hand-written declaration, and nobody knows it is missing -- where a stale enum is at least a bad
value someone eventually sees. Bounds, defaults and nullability duplicate the same way.

### Two shapes, and the second was missing

A journal profile builds one of two things, and conflating them is silent:

- **An entry with pages.** `documentName: 'JournalEntry'`, a derivation composes the pages, and
  `document.pageType` is stamped onto each. Area, Location and Encounter.
- **A page filed into a container entry.** `documentName: 'JournalEntryPage'`, the declaration's own fields
  are the page, `document.type` is the subtype, and `document.containerNameFrom` names the declared field
  whose VALUE names the entry it joins. This is the satellite shape -- the entry is a category, each page is
  one record under it.

The second did not exist until 2026-09-02 and its absence did not throw: a profile declaring the first shape
while meaning the second produced an entry named after the record, carrying a stray `system` object, and no
pages. `containerNameFrom` is therefore required and validated at registration, since a page with nowhere to
go is built correctly, lands nowhere, and reports success.

Paths are verbatim in both shapes: nothing is prefixed.

**A page profile names its container one of three ways**, and the shape was widened twice by consumers whose
content the first version could not express:

| | For |
|---|---|
| `containerName` | a constant -- one journal, no category-like field to name |
| `containerNameFrom` + `containerNameTransform` | the name derives from a field by a named operation |
| `containerNameFrom` + `containerNameMap` | the name is not derivable from the value at all |

The first version was `containerNameFrom` plus a casing transform, built against a content type whose
category maps to its journal by casing alone. It looked general and was the easiest of that module's three
types. **A model built against one example looks general because the example is the only test of it.**

The lookup is DATA rather than a module-supplied function, which the consumer argued for over their own
earlier ask: a declaration that is pure data stays serializable, inspectable and checkable, where a registered
function is opaque to all three. It also keeps the ownership split -- a map is Blacksmith-owned mechanism
carrying module-owned data; a function would be module-owned mechanism. Being data bought a check a function
could not: registration requires every enumerated value of the source field to be mapped.

The container name is untransformed by default, and a profile that needs otherwise names a
**Blacksmith transform** through `document.containerNameTransform` -- the same vocabulary a field's
`transform` uses. The first consumer needed title case, and a two-value casing enum would have covered it,
which is precisely why it would have been wrong: the second consumer wanting a slug would have had to widen
a mechanism existing nowhere else. Transforms are already the extension point for "Blacksmith owns the
operation, the profile selects it", so a future need is a transform someone adds rather than a shape someone
invents.

Untransformed is the default because a container value is the owning module's key, and reshaping one
uninvited is how a lookup silently stops matching. Which way that cuts is the module's to declare: the first
consumer's page carries the lowercase enum `fire` while the journal its own picker looks for is `Fire`.

### Two constraints the vocabulary cannot express

Found against the same schema, and both now have a real consumer rather than being hypothetical:

- **A bound that depends on a sibling field.** `damage` is 0-5 when `severity` is minor, 6-10 when moderate,
  11-18 when major. `min`/`max` are static per field, and `requiresWhen` gates a field's PRESENCE on another
  field's value rather than its RANGE.
- **A conditional emptiness.** `flavor` is ignored whenever `statuseffect` is not `none`. `mustBeEmpty` is
  unconditional.

Until those exist, a profile declares the widest legal envelope and states the scoping in `guidance` -- which
validates the outside and documents the inside, and is at least honest about which is which.

### Destination is declared, and never reshaped

A declaration says what a document SAYS. Where it GOES is separate, and there are two levels of it:

- **The container** -- which `JournalEntry` a page is filed into. `document.containerName` for a constant,
  or `containerNameFrom` plus an optional `containerNameTransform` or `containerNameMap`.
- **The folder** -- where that entry files in the sidebar. `document.folderName` for a constant, or
  `folderNameFrom` naming a field.

The folder half was, for a while, supplied by **convention**: a field named exactly `foldername`, written
down nowhere. Blacksmith's own three journal profiles each declared it verbatim, which is what a kind-level
constant looks like when it is wearing a per-profile costume -- and the first outside consumer did not know
the key existed. Their profile registered clean, every import reported success, and every page landed at the
world root. Forgetting a convention is indistinguishable from choosing the default, which is why the
convention is now only the fallback and the declaration is the rule.

It is deliberately **not required**. The root is a legitimate destination and Blacksmith's own profiles take
their folder from the import dialog, so requiring it would make the honest case unwritable. Declaring it
makes the intent sayable, and therefore checkable by a consumer's build gate -- which a convention never was.

**A destination value belongs to the module that supplied it, and must not be transformed on the way
through.** This rule was learned twice, one level apart. Container names were fixed first: a page carrying
the enum `fire` files into a journal the owning module spells `Fire`, and only that module knows which, so
the default is untransformed and a transform is named explicitly. Folders had exactly the same bug and kept
it longer -- `ensureJournalFolder` sentence-cased the name before **both** matching and creating, so it
compared a transformed needle against untransformed haystacks (a GM's `INJURIES` got a second folder called
`Injuries`) and renamed the caller's folder on creation (`McDonald` files under `Mcdonald`).

The resolution generalises past folders: **match loosely, write exactly.** Case-insensitive matching is what
prevents the duplicate; verbatim creation is what respects the caller. Either alone is a bug.

### Appending into an existing document is the destructive default

Find-or-create matches on name AND folder together. Name alone collides across folders, which was the injury
builder's bug. But the correct rule has a blind spot worth stating, because it was reached in review by
advice that looked right: a payload naming a folder that holds a same-named journal will **append into it**,
and there is no distinction between "add to the journal I mean" and "add to a journal that happens to share
its name". A review of exactly this nearly put two test pages into nine pages of a GM's real content, and the
only thing that prevented it was an unrelated defect sending the import to the root instead.

So a creation beside an existing same-named journal warns, naming the other one's folder. It is not a
rejection -- a payload naming a folder means that folder. What the warning buys is that the GM finds out
now rather than when `game.journal.getName()` hands them the wrong entry.

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

## Two derivations of one schema, built independently

The counterpart to the section below, and the only technique that has actually caught a bug neither author
could see in their own work.

While adopting the seam, Bibliosoph wrote a declaration by hand and Blacksmith wrote one by walking the same
`DataModel`. Comparing them found **two** bugs in one exchange: the hand-written nested descriptors carried
document paths that registration would have rejected, and the walk dropped the path from a top-level field
with nested shape -- which would have silently stripped `modifiers` from 135 of their 144 shipped injuries.

Neither author found their own. Both had read their own version several times. Reviewing harder would not
have worked, and neither would testing harder in isolation: this repo's own test for the walk exercised the
broken branch every run and asserted the wrong half of it, checking that the CHILDREN carried no path while
never asking whether the parent had one. **An assertion about a container's children is not an assertion
about the container** -- and a passing assertion that reads as coverage is worse than an absent one.

**The boundary, which is what stops this being over-applied.** It works only when the two derivations are
genuinely INDEPENDENT. Had the hand list been generated from the walk, or the walk sanity-checked against the
list, the comparison would have agreed and proven nothing. What did the work was two answers built from one
source by parties who had not seen each other's. The value is in the independence, not the diligence -- so
the technique is worth reaching for wherever a second derivation is cheap, and worth nothing where it is
really one derivation checked twice.

## Proving a check can fail, and the five ways that goes wrong

A check that has only ever passed is indistinguishable from one that cannot fail, so every check here was
proved by injecting the fault it claims to catch. Five failure modes showed up in doing that. Four produced
a green result that meant nothing; the fifth produced a red one that meant nothing, which is rarer and
teaches a worse habit.

**An assertion can exercise the broken path and ask the wrong question.** The test for the model walk had a
nested `modifiers` field and asserted its CHILDREN carried no document path -- which was true, and which
said nothing about the parent, whose missing path was the bug. It ran the defective branch every time and
passed. A passing assertion that reads as coverage is worse than an absent one, because it forecloses the
question.

**An injected fault can be unexpressible in the data.** Injecting the wrong container transform produced no
errors -- not because the check was broken, but because every category in that vocabulary is a single word,
where the two transforms produce identical output. A true negative wearing a failed test's clothes. Injecting
a transform that genuinely diverges produced fifteen errors, one per container.

**A third: the fixture can lack the thing the test is about.** "Import twice and confirm the siblings
survive" cannot fail against a journal holding one page -- there is no sibling to lose, so it passes by
construction. Both this repo and the consuming module planned that check against single-page data and would
each have reported a green that meant nothing. It took a second fixture, deliberately different, to make the
append path expressible at all.

**A fourth, and the most expensive: the assertion can test the far side of a gate it never opens.** The
suite covered a `nullable: true, min: 1` field holding `null` -- the consumer's real shape, the exact field --
and asserted the BUILT page kept it null. That passed while the importer rejected the value outright, because
the assertion called `buildDocumentData` and the defect was in `validateEntry`. In a running world those are
in series: construction is unreachable until validation passes. So the suite proved the second half of a path
whose first half was closed, and the closure was the bug. A consumer's user found it by importing a file.

This one generalises past the importer. Wherever two stages run in series and only the later one is
interesting to assert, testing the later alone will report a system as working while the earlier one refuses
every real input. **Construction is usually the interesting half, which is exactly why the validating half
goes unwritten.** The rule that catches it is to assert both halves against ONE declaration, so the fixture
that proves the build also has to get past the gate.

**A fifth, pointing the other way: a test that cannot PASS.** An assertion read
`getDeclarationsForKind('journal').length === 3`, meaning "Blacksmith's own three still register". That is a
claim about the whole world rather than about Blacksmith, and it became false the moment a satellite declared
a journal profile -- which is the entire point of the registry. It failed in a live world **because the
mechanism works**, which is close to the worst signal a suite can produce: it trains the reader to expect a
red and explain it away, so the day a profile genuinely goes missing the failure looks identical to the noise.
Asserted by id instead, which also names *which* profile went missing when it legitimately fails, where a
count only ever says a number moved.

The first four could not fail; this one could not pass. Both are the same underlying error -- a test encoding
an assumption about its ENVIRONMENT rather than the behaviour it means to check -- and the fifth is the
easier one to spot, because it announces itself.

All five are the same error in different clothes, and the consumer stated the principle better than any of
the incidents did:

> A test that cannot distinguish success from the failure it was written for is worse than no test,
> because it is reported as evidence.

The practical form: when an injected fault produces nothing, establish that the fault is EXPRESSIBLE before
concluding the check is broken -- and when a check passes, establish that the data could have made it fail.

And a small companion habit, learned by getting it wrong twice in one evening: **predict a suite's assertion
count from the last MEASURED number, never from a previous prediction.** A doc here said 299, measured 305,
then correctly predicted 307 from that. The failure mode is not the arithmetic -- it is that a wrong expected
count makes a genuine regression look like sloppy counting, so the next red gets explained away instead of
read.

### A checker cannot see an exemption it never exercises

The registry exempted any top-level field with nested shape from needing a document path, so such a field
registered cleanly and was then dropped from every document in silence. Two independent checkers missed it
for the same reason: both were reading declarations that already carried the field. The hole was invisible
from either side until two derivations of one schema disagreed about that specific field -- which is the
argument for the section above, in its strongest form.

## Read the other tree; do not predict it

The counterpart to the section above, and the cheaper half.

Adopting the seam across two modules produced a run of confident, wrong statements about code the speaker
had not just looked at. Blacksmith described a consumer's five-field picker projection as their sixteen-field
schema. Blacksmith told them their registration was inert against a key they had already renamed. A consumer
reported both test stubs as flat when one was not. Another cited an accepted-values list as evidence a path
was wired, when that list belonged to the path that had failed. Every one was reasoning from a model of
someone else's code rather than from the code.

Every fix came from opening the file. That is the whole finding, and it is worth stating plainly because the
cost of checking is a single `grep` and the cost of not checking was, in one case, a bug that would have
stripped the mechanical effect from 135 of 144 shipped documents.

It joins the note above rather than repeating it: independence is what makes a second derivation worth
having, and reading rather than predicting is what keeps the second derivation independent. A review
conducted from memory is not a second derivation at all.

**A read is evidence about a MOMENT, and the moment is part of the claim.** Reading another tree tells you
what the last writer left, not what any session intends, and it can change between the read and the quote
with no event either party sees. One file changed three times inside ninety seconds while two sessions
improved it through each other, and a `grep`, a `sed` and a `diff` run against it each returned a different
version -- both parties then reported defects that had been fixed before the message arrived, and neither
report was careless.

So the honest form is "as of a few minutes ago that file declared X", never "your file declares X". When a
claim built on a read turns out to be contested, **re-run the read rather than re-quoting it**: the second
reading costs a command and the first one has an expiry nobody can see. Every wrong claim exchanged during
this migration was either a prediction instead of a read, or a read whose moment had passed.

### Report the observation; label the inference separately

A finding crossing a module boundary carries two things, and they have very different reliability. What was
SEEN -- a value, a name, a log line -- and what the reporter thinks it MEANS. The second is a guess about
somebody else's code, made without having read it.

Both of this migration's best cross-module findings came in with the inference wrong and the observation
right, and the observation was what mattered. A consumer reported "folder resolution may be case-sensitive",
having seen a journal reporting `folder: "injuries"` beside a folder named `Injuries`. The inference was
wrong. The real defect was `toSentenceCase` applied before BOTH matching and creation -- which is worse,
because it renamed the caller's folder as well as failing to match it -- and it was found only because the
observation was filed rather than withheld for lacking an explanation.

The same instinct, unlabelled, nearly produced a false blocker in the other direction: a hardcoded
journaltype list read as a bug by someone who had not checked that both callers return before reaching it.
What prevented that was reading the call sites -- and what would have made it harmless either way was
saying which half was observed.

So the rule is not "file everything" and not "file only what you can explain". It is: **file the
observation, and mark plainly which part you saw and which part you inferred.** The finding travels; the
reporter's explanation of it does not need to be right, and pretending otherwise is what makes a wrong
diagnosis expensive instead of merely incomplete.

## A prompt is a third reader, and `guidance` is the wrong size for it

The generation prompts read the same contract the template and the guide do, and deriving them was attempted
in step 8. It produced a finding rather than a feature.

`buildPromptSchemaText` was fixed in passing: it described only the top level and omitted `min`/`max`
entirely while `guideLine` described nested shapes and bounds both -- two derived outputs of one declaration
disagreeing about what that declaration says. It mattered most in this output of the three, because the
prompt is what a generator is TOLD the schema is, so a field it never mentions is a field the generator never
emits.

**But a prompt's SCHEMA LOCK is not a field list, and swapping one for the other would be a downgrade.**
`prompt-journal-profile-area.txt` spends 96 of its 294 lines on it; the derived equivalent is about 40 lines
of `FIELD: (TYPE) guidance`. The difference is not verbosity:

- **Anti-patterns.** "Never use `text`, `body`, or `content` instead of `description`." A declaration can say
  what a field IS. It has no way to say what a generator wrongly reaches for.
- **Relationships between fields.** That `scenetitle` is the page label and may carry an ordering prefix,
  while `blocks.area.title` is the same name with the prefix stripped, and the envelope `area` is the clean
  geographic name. Three fields, one paragraph; no single field's `guidance` can hold it.
- **Worked negative examples** -- which is what caught the bare-string `narrative` the declaration got wrong.

`guidance` is ONE sentence by design, and that design is right for a template comment and a guide line. A
prompt wants a paragraph. **The gap is in the model, not the wiring.** Field groups already carry a
`preamble` for exactly this reason -- profile-level prose that does not reduce to per-field guidance -- and
the same affordance at profile level is the shape that would let a SCHEMA LOCK derive without losing what
makes it work.

Deliberately not built. An affordance with no user is the defect that got `rendered` deleted, and this one
cannot be judged without a generation run, because the only measure of a prompt is what a generator produces
from it.

## Two readers of one contract is the recurring defect

Almost every bug this migration surfaced has one shape: two implementations of the same question, maintained separately, with nothing comparing them.

The item parser and the authoring template were written apart, so the template offered a spell four limited-uses fields the spell parser never read -- limited uses on a spell silently did nothing. Consumable had a second activity builder emitting `type: 'util'`, which is not a dnd5e activity type, beside a shared builder using `utility`. The three code paths answering "what does no activities look like" gave three different answers. Two source fields were invented rather than left blank, in two different builders.

None of them threw. All were invisible to reading and obvious to diffing, which is why `testing/suites/suite-importer-declarations.js` compares derived construction against the parser it replaces rather than asserting the derived output alone. **Keep that comparison until a kind's parser is deleted**; it is the evidence the migration was faithful, and deleting the baseline first removes the only thing that could show otherwise.

## A rule that never fires emits nothing

Three never-firing bugs have shipped in the rule machinery: a `field:value` reference
that was array-only and so was false forever against a string, a field group whose rules
were composed apart from its fields and so were never evaluated, and a gate naming the
wrong field. Each read as enforced and enforced nothing.

They are hard to see because a rule that fires wrongly announces itself, while one that
never fires produces no output at all -- indistinguishable from a rule with nothing to
complain about. No amount of happy-path testing separates them; all three were found by
reading a predicate against the real vocabulary and asking whether it could ever be true.

**Every rule is therefore asserted in both directions** -- the payload it must reject and
the payload it must accept. `manager-declaration-rules.js` carries the same note where a
rule gets added.

## Errors

Every issue carries `code`, `stage`, `path`, `message` and `details`. `issueFromError` in `registry-json-import.js` has always read the first three off a thrown error, and no kind on the callback path ever supplied them, so every failure surfaced as a blanket `VALIDATE_FAILED` with a blank path. Under declarations they are derived: a field that fails its declared type knows its own path, and a named rule knows its own code.

## Passthrough: declaring the envelope, not the document

Actor is the case that defines the form, and the decision worth recording is what a
passthrough declaration deliberately leaves out.

An Actor payload is dnd5e Actor source data. Declaring its abilities, attributes, traits
and skills would put a second copy of dnd5e's schema in this repo, to drift from the real
one the next time the system changed. So the declaration describes only the ENVELOPE --
the keys an author writes that are not Actor data and must be consumed into it and removed:
`token` on every profile, `sidekick` on one, the four plain-name foundations on another.

Three consequences follow, and each was a bug before it was a rule:

**The seed is the payload.** Under `mapped` a key reaches the document only by being
declared; under `passthrough` every key does unless a declaration claims it. A declared key
is removed from the seed, because a field that lands on a path is written from its declared
value and a field that lands nowhere is read by a derivation -- leaving the author's raw key
in the seed carries it onto the document beside the consumed form of itself.

**The undeclared-key warning is suppressed.** On a mapped profile an undeclared key is a
typo worth naming. Here it is the import, and warning on them would name thirty native
fields on a stock NPC.

**The guide's closing sentence is chosen by form.** The mapped one -- "anything else is
reported and ignored" -- tells a passthrough author their stat block is discarded.

The worked stat block an author starts from is therefore NOT derived, and this is the same
call Roll Table's row count settled: which ability scores to show at 10 and which hit die to
suggest is an authoring choice, not schema. The kind composes it, merging the derived
envelope in so the two halves cannot drift.

## Actor import specifics

Actor is also the only kind with work AFTER the document exists, and so the only one that rolls back. A Character's foundations are authored as plain names, become ordinary entries in `items[]`, and can only have their Actor-local ids written into dnd5e's relationship fields once the items are embedded -- so a failure there leaves an Actor that exists and is wrong, which is worse than none.

Actor Import treats sidekicks as static dnd5e NPC snapshots. The Sidekick authoring profile records role, current level, narrative base creature, exact mechanical base-stat-block Actor name, and optional spellcasting ability in Blacksmith flags, while the supplied NPC system data and embedded items remain authoritative. Final HP, AC, proficiency, and features are accepted rather than inferred from CR. Validation warns when sidekick level and proficiency disagree, creature size and the HP formula's Hit Die disagree, the exact base Actor cannot be resolved, or supplied CR differs from the unscaled base Actor CR; it never silently recalculates the snapshot. Imported sidekicks are marked as important NPCs so dnd5e exposes death saves, and Blacksmith excludes their cosmetic CR/XP values from its monster encounter and XP calculations. Sidekick progression and automatic leveling are explicitly outside the current importer contract.

The friendly payload places `sidekick` at the Actor JSON root. This is an import envelope, not a native Foundry field: Blacksmith consumes it before creation and writes the normalized metadata to `flags["coffee-pub-blacksmith"].sidekick`. The block's shape -- the three roles, the level bound, the spellcasting keys -- is declared and validated as nested fields; `parsers/parse-actor.js` only consumes it, and re-checking it there would be two readers of one contract. Already-native payloads using that flag location are also accepted. Spellcaster snapshots must use the same `int`, `wis`, or `cha` key in both `sidekick.spellcastingAbility` and `system.attributes.spellcasting`; validation warns when they diverge.

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
