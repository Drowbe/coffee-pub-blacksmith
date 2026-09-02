# Documentation Standard

**Audience:** anyone writing or organising documentation for a Coffee Pub module.

Every module in the suite -- the hub and all fourteen satellites -- lays out, names, writes, and
publishes its documentation the same way, so what a reader learns navigating one module holds for all
of them.

This is the counterpart to [architecture-ownership.md](../architecture/architecture-ownership.md):
that one decides which module a feature belongs in, this one decides where its documentation goes,
what it may say, and whether it reaches the wiki. It is authoritative for the whole suite and
supersedes the documentation sections of any module's `CLAUDE.md`.

---

## Why this exists

Four failures, all of them live in the suite when this was written:

1. **Every module invented its own layout.** Nothing is where you expect it, so nobody looks, so
   documents rot unread.
3. **Only the hub publishes.** A satellite's documentation exists only for someone who clones the
   repository. The wiki is where people actually read.
4. **No module documents how to use it.** Every document in the suite is written for a developer. A
   GM installing a module gets a feature list in a README and nothing else. This is the largest
   single gap in the suite, and it is what `userguides/` exists to close.
5. **Shared knowledge got copied instead of linked.** Five satellites carry their own forked copy of
   the hub's API notes, one of them twice, and they have already diverged. That is what `global/`
   exists to stop.

**Clean documentation is critical, and it is the part that rots without anyone noticing.** Code that
is wrong breaks. A document that is wrong is believed.

---

## The tree

```
<module>/
  README.md                       ships in the release zip; the product page
  CHANGELOG.md                    ships in the release zip; what changed, per release
  documentation/                  never ships; the only tree the publisher reads
    home.md                       becomes the wiki Home page
    known-issues.md               published
    TODO.md                       never published
    TODO-GLOBAL.md                hub only; never published
    assets/                       images every document draws on, product screens included
    api/           api-
    architecture/  architecture-
    designsystem/  design-
    userguides/    userguide-
    global/        global-        HUB ONLY; suite-wide knowledge
    plans/         plan-          never published
  testing/                        repo root; never published, by construction
```

**The documentation root holds exactly those four files.** It is an enumerated set, not a prefix
rule, and nothing else belongs there. This is stated because the root is where a junk drawer forms:
satellites today carry `BLACKSMITH_API_REVIEW.md`, `SOCKET_API_TESTING.md`, `SOCKET_SYNC_PLAN.md` and
`getting-started.md` loose at that level.

**Three folders exist in every module even when empty: `architecture/`, `userguides/`, and
`assets/`.** Every module has internals, has users, and owes screenshots, so an empty one there is a
real gap made visible. An empty folder makes a gap visible; it does not follow that every module owes
every kind.

**`api/`, `designsystem/`, and `plans/` exist only when the module has something to put in them.** A
leaf consumer -- one that calls the hub and is called by nobody -- exposes no API and publishes no
tokens for anyone else, and having no work in flight is a state rather than an omission. Requiring
those folders advertises work that does not exist, and pushes a maintainer into creating an empty
folder purely to satisfy the checker, which is the opposite of the point.

**`global/` and `TODO-GLOBAL.md` are the hub's alone.** A satellite carrying either is documenting
other modules, which the boundary rule refuses. Of everything in this section that is the one worth
checking by hand, because it is the only one that fails quietly: a folder wrongly required breaks
loudly and gets noticed in the first minute, whereas a satellite carrying a `TODO-GLOBAL.md` passes
every check while tracking cross-module work in a file it is not allowed to have. It would have
created, silently, exactly the coupling the boundary rule exists to prevent.

**Before adding a check, ask which DOCUMENTS it governs, not only which modules.** A hub-only rule
about published documents was first written to scan every markdown file, and fired twenty times on
`plans/`, `TODO.md` and `TODO-GLOBAL.md` -- where cross-module references are not merely allowed but
are the entire purpose. Same mistake as the one below, on the other axis.

**A rule that is true of the hub is not automatically true of a satellite.** That mistake has now been
made three times -- the shared-block check, the `api/` requirement, and `TODO-GLOBAL.md` at the root --
and each time the satellite could satisfy the rule only by doing the wrong thing. Before adding a
check, ask whether it holds off the hub. An empty folder makes missing work visible; a missing
folder makes it invisible. Git cannot track an empty directory, so "exists" means it holds either its
first real document or a `.gitkeep` until it does. Prefer the first -- every module owes a
`userguides/userguide-getting-started.md` regardless, so start there rather than with a placeholder.

**`testing/` sits at the repository root, not inside `documentation/`.** Keeping it outside is what
makes it unpublishable by construction rather than by policy: the publisher never looks there, so a
verification backlog cannot leak to the wiki by accident.

---

## One folder, one prefix

| Folder | Prefix | Audience | Publishes |
|---|---|---|---|
| `api/` | `api-` | Someone writing code against the module | yes |
| `architecture/` | `architecture-` | Someone changing the module, and the rest of the suite | yes |
| `designsystem/` | `design-` | Someone styling against the module | yes |
| `userguides/` | `userguide-` | Someone playing or running a game with the module | yes |
| `global/` | `global-` | The whole suite. Hub only | yes, from the hub only |
| `plans/` | `plan-` | Us, while the work is in flight | never |
| `assets/` | named for its owner | Images, not documents | as part of the page referencing it |
| root | `home.md`, `known-issues.md`, `TODO.md`, `TODO-GLOBAL.md` | mixed | home and known-issues only |

This table is the authority. Do not derive the prefix from the folder name -- `designsystem/` takes
`design-`, and that irregularity is deliberate: the files were named before the folder was.

**Basenames after the prefix must be unique across ALL published folders, not just within one.**
`userguide-drawing.md` and `architecture-drawing.md` both reduce to "drawing", and the sidebar then
qualifies both by kind -- which works, but degrades the entry of the document that was there first
and did nothing wrong. `api-pins.md` against `architecture-pins.md` is the likeliest pair. The
checker reports collisions; the moment to fix one is before the first push, because afterwards it is
a rename of a published page and therefore a breaking change. Renaming is usually the right fix and
usually improves the name: one module's `architecture-drawing.md` became `architecture-toolbar-
discovery.md`, and another's guide became `userguide-sketching.md`, both more accurate than what they
replaced.

**A file whose prefix disagrees with its folder is misfiled.** The structure checker reports it as an
error rather than guessing which half is right, because both halves have been wrong before.

Filenames are lowercase kebab-case, because **the filename becomes the wiki page name**.
`api-pins.md` publishes as the page `api-pins`, and satellites link to hub pages by that name -- so
renaming a published file breaks every inbound link in the suite. `TODO.md` keeps its shouted name
because it is a landmark in the repository, never a page.

---

## The kinds of document

Nothing outside these is documentation; it is noise, and it gets deleted rather than filed. **Do not
invent a new kind, and do not add to a kind by inventing a parallel file.** There are three families.

**Permanent -- seven kinds, which exist as long as the module does:**

| Kind | Where | What it is |
|---|---|---|
| **Overview** | `README.md`, `home.md` | Enough to decide whether to install, and where to go next |
| **User guide** | `userguides/` | How to use the module at the table, as a player or a GM |
| **API** | `api/` | The public surface, authoritative; update it when the surface changes |
| **Architecture** | `architecture/` | How the module is built and why -- what you can only learn by reading code |
| **Design system** | `designsystem/` | Tokens, components, and patterns another module styles against |
| **Global** | `global/` | Knowledge belonging to the suite rather than to any one module. Hub only |
| **CHANGELOG** | `CHANGELOG.md` | What we did and fixed, per release |

**Transitional -- two kinds, which exist to be dismantled and deleted:**

| Kind | Where | Deleted when |
|---|---|---|
| **Plan** | `plans/` | Its content has been distributed to the permanent kinds. Implemented is not the trigger; absorbed is. |
| **Testing** | `testing/` | The verification is discharged. Passing means delete the item, not tick it. |

**Standing lists -- two files, which are emptied but never deleted:** `TODO.md`, the work we will do,
and `known-issues.md`, the defects we have not fixed.

**User guides and Global are recent additions**, made deliberately. User guides close the suite's
largest gap. Global replaced a `primers/` folder whose definition was a negation -- everything that
is not this module -- and a category defined by what it excludes becomes a junk drawer. Its contents
split cleanly: knowledge belonging to the suite went to `global/`, and the one file documenting the
hub's own surface was deleted as a duplicate of the API reference that already covered it.

**A cross-module data contract is documented by whichever module's API absorbs it.** Modules couple
through flags, settings keys and document types as well as through function calls, and the temptation
is to give the writing module an `api/` folder to declare them in. Do not. If a consuming module's API
already registers the contract, that is its home -- it documents that module's surface, and the other
module's participation is one string of data inside it. If no API absorbs it, it belongs in the
writing module's architecture document. A parallel declaration in the writer's `api/` is a second
source of truth for one string.

**Archaeology is not a contract.** A read into another module's namespace is often a one-way migration
of frozen historical data as a feature moves between modules -- deliberately built to keep working
after the writing module is uninstalled. Documenting that as a public surface asserts the opposite of
the truth: that the module must keep writing data it is actively retiring. Check which one you have
before writing anything down; the test is whether the writer is still expected to produce it.

**Module-local knowledge about the platform is architecture.** If a single module needs a note on how
Foundry or the game system behaves, that is context for changing that module, and architecture is
already the home for things you can only learn the hard way. It does not need a kind of its own.

**Repository metadata is not documentation and the standard does not govern it.** `LICENSE`,
`CONTRIBUTING.md`, and GitHub's issue and pull-request templates are platform conventions -- GitHub
surfaces them in its own interface, and they describe how to work with the repository rather than how
the module behaves. They live at the repository root, outside `documentation/`, and no rule here
applies to them. The test is whether GitHub gives the file a job: if it does, it is metadata; if the
file only means something to a reader of ours, it is documentation and it is one of the kinds.

**The verification BACKLOG is `testing/`, at the repository root.** That is where the testing
documents live -- what has shipped unproven, and the steps to discharge it.

**Testing document filenames are free-form, deliberately.** Every other folder takes a prefix
because the filename becomes the wiki page name; `testing/` never publishes, so that reason does not
reach it and a prefix would be ceremony. Name them for what they verify. The hub's own folder holds
four different styles and none of it matters.

**A module with an automated suite keeps it wherever its code lives, and `tests/` is a fine name for
it.** This is not the same folder and must not be merged into it. Merchant has ten dependency-free
Node suites in `tests/`, cited from its architecture document as code pointers in nine places;
renaming them for a documentation reason would break those pointers and put `.mjs` files in a folder
this standard defines as prose. Where a suite exists, prefer it: the testing-document rule already
says a testing document is only for what a harness cannot do, which presumes a harness may exist.

**Migration guides and inventories are not a kind.** If such a document has content worth keeping,
fold it into architecture and delete the original. If a migration is complete, it is history, and
history lives in the CHANGELOG -- not in a guide named after a version that shipped two releases ago.

---

## Global documents, and how a satellite gets them

Some knowledge belongs to the suite rather than to any module: this standard, and hard-won notes
about the platform or the game system that every module needs. That knowledge is **authored once, in
the hub, and published once, from the hub's wiki.**

**A satellite links to it. A satellite never carries a copy.** This is not a preference; copying is
the failure behind the fourth item above. Five satellites forked the hub's API notes, and by the time
anyone looked one fork had grown to 101 lines against the others' 62, and one module was carrying
two of them.

Linking is already legal under the boundary rule below -- satellite to hub is the allowed direction,
because the hub is a required dependency of every satellite. The rule needs no exception, only
stating.

**One exception, and it is mechanical rather than a matter of judgement: a README cannot link.** It
ships in the release zip and is the GitHub landing page, so text that has to be read *there* has to be
*there* -- a link to the hub wiki does not do the job. The AI-assistance disclosure is that case: the
same paragraphs in all fifteen READMEs. The copy is allowed; the drift is not. The canonical text lives
in `global/`, each README carries it verbatim between HTML-comment markers, and
`check-docs-structure.mjs` fails the build if a copy stops matching. Edit the canonical file and copy
it out; never edit a README's block directly. Do not extend this to anything a link would serve.

**Amending a global document is a hub change.** It is edited in the hub, it publishes from the hub,
and every satellite sees the new version the moment it is pushed, because they linked rather than
copied. Nothing propagates and nothing needs syncing.

---

## What publishes, and what cannot

**Publication is decided by folder membership, not by a list somebody remembers to update.** Every
`.md` under `api/`, `architecture/`, `designsystem/`, `userguides/`, and -- in the hub -- `global/`,
plus `home.md` and `known-issues.md`, publishes to the wiki. A new document goes live by existing.

Two escapes, in this order:

- **Never publishable.** `plans/`, `TODO.md`, `TODO-GLOBAL.md`, `testing/`, and everything outside
  `documentation/`. This is structural, not a list -- the publisher cannot reach them.
- **HOLD.** A short list in the publisher naming documents deliberately withheld, each with a
  one-line reason. Held documents are for work in progress and for documents known to be wrong. A
  HOLD entry is a debt, so it carries a reason or it does not belong there.

The hub previously ran the opposite rule -- a hand-maintained list where nothing published until it
was named. That rule fails in the direction nobody notices: `architecture-effects.md` was written,
finished, and invisible for months because no one added the line. Multiply one such list by fifteen
modules and the failure is guaranteed rather than likely.

Convention publishing inverts that risk into a visible one, but be honest about the size of the
inversion. On the hub, a document that should have been held goes live where thirteen consumers read
it and somebody says so. On a satellite whose wiki nobody reads yet, a wrongly published document is
as invisible as an unpublished one, and now wrong in public. The rule still stands -- silence about a
finished document is the worse failure -- but on a satellite HOLD carries more weight, not less.

**Renaming a published document is a breaking change for every module that links into this wiki.**
A page name is its filename, so a rename is a rename of the page, and every inbound link 404s. This is
a larger hazard than the publish list it replaced, not a smaller one: editing a list was a ceremony
that at least prompted a thought, and renaming a file is one of the most ordinary things anyone does.
Dropping a document into HOLD does the same thing. Announce either to the satellites before it lands.

**Nothing on the producer's side fails.** The hub renames, the satellite breaks, and only the
satellite can see it -- so it is discovered by a reader, or not at all. That asymmetry is why this is
a coordination rule rather than a checker rule: a tool in this repository cannot see the damage, and a
tool in the satellite cannot distinguish a dead cross-module link from one it merely cannot resolve.
Fourteen dead links sat in one satellite for months before a relay found them.

**Folder publishing removes the ceremony to publish, so guard the other end.** A file created in
`api/` is live the moment it exists. `api/` is the public surface other modules code against and
nothing else: not notes toward a surface, not a design sketch, not a review of somebody else's API.
Those are a plan, or architecture, or they do not exist. The header check catches a malformed
document; nothing catches a misplaced one.

**The wiki is a pure mirror, and the repository is law.** Nothing is authored wiki-first. A wiki page
with no repository source is a bug, not content, and gets deleted rather than back-ported. This runs
in one direction only: pulling a page off the wiki to seed a source document imports the publisher's
own outbound rewrites -- wiki-form links that resolve nowhere in the repository -- and that has
already happened once.

---

## README: the product page

The README ships in every release zip and is the GitHub landing page. **It is the only document most
people will ever read**, and for many it is the whole basis of the decision to install.

**It answers one question: what is this, and do I want it?** Then it gets out of the way and points
at the wiki.

What it contains, in this order:

1. **The module's name and one sentence** saying what it does for a person, in their words. Not "a
   Foundry VTT module providing an extensible framework for" -- say what changes at the table.
2. **A screenshot or two.** This is a visual product. Show it.
3. **What it does** -- three to eight bullets, each a capability a user would recognise, written the
   way a user would describe it rather than the way the code is organised.
4. **Requirements** -- Foundry version, game system, and every required module, stated plainly and
   completely. A dependency missing here is a failed install.
6. **Install** -- the manifest URL and the one-line instruction.
7. **Where to read more** -- links into the wiki: the user guides for players and GMs, the API for
   developers. Depth lives there, not here.
8. **The suite** -- the other Coffee Pub modules, one line each. See the carve-out below.
9. **Licence and credits.**

What it is not: a feature dump, an API reference, an architecture summary, a changelog, a roadmap, a
development setup guide, or a task list. Every one of those has a home, and none of them is the front
door.

**It ships, so it must stay clean.** No machine-specific paths, no internal notes, no "coming soon".
And because it ships with every release, an entry that goes stale ships stale -- keep it to claims
that will still be true in six months, and let the wiki carry the detail that moves.

**Describe a sibling from its own `module.json`, not from its name.** Every wrong row in the hub's
suite table was written by guessing from the module's name; one described a player-messaging module
as "library and reference management".

**`home.md` is the wiki's front door and routes rather than explains**: a paragraph on what the
module is, a screenshot, then links to the user guides, the API, and the architecture. It overlaps
the README deliberately and briefly; the moment it starts explaining a feature, that explanation
belongs in a user guide.

---

## User guides

The gap this standard exists to close. A user guide is written for a person at a table who has
installed the module and wants to do something with it. They are not reading code, they do not know
what a hook is, and they will not find a feature that is not described in terms of what they can see.

**A user guide says how to USE the thing, not what the thing IS.** This is the distinction the first
two attempts in this suite both missed, in the same way: they described the interface -- here is a
bar, here is what sits on it, here is what the module adds -- and never told anyone how to do
anything with it. A reader who has already installed the module can see that a bar exists. What they
cannot see is that initiative can be dragged to reorder it, what the actions on the combat bar
actually do, how encounter difficulty is calculated and where it shows on the canvas, how to run a
vote and what the players see while it is open, how the movement modes change what a player can do,
or what each control in the roll window is for.

Write from the verb. Every section is something a person does, and the test is whether a reader
finishes it able to do that thing. An inventory of the interface is not a user guide -- it is a
screenshot with more words, and it is what you produce by writing from the source instead of from
the table.

**The bar is COMPLETE COVERAGE, not a file count.** Together, a module's user guides must let a
person understand what it does, set it up, and use every part of it. That is the test. A single
getting-started guide has never met it for any module in this suite, and stopping at one is the most
common failure of this section -- five of the first nine modules to adopt did exactly that, and each
had to be sent back. If a feature is visible to a user and no guide says how to use it, the set is
incomplete, however many files it contains.

**Work out the list from the module, not from this table.** Open the settings window and the module's
own interface, list what a person can actually do, and write until every item is covered. The table
below is a floor and a naming convention, not a scope:

| File | When | Contents |
|---|---|---|
| `userguide-getting-started.md` | always | What the module does, what it needs installed, and what changes on screen the moment it is enabled. The first five minutes -- and ONLY the first five minutes. It is the shallowest guide, not a summary of the others. |
| `userguide-settings.md` | always, unless the settings are being reworked | Every setting, by its on-screen name: what it does, who it affects, what happens if you change it. |
| `userguide-gm.md` | whenever the module has GM-only behaviour | The GM's workflows, in the order a session actually runs. |
| `userguide-player.md` | whenever players see anything at all | What a player sees and can do, and what they cannot. |
| `userguide-<feature>.md` | one per feature a user would name | Not "as needed" -- if a user would call it a thing, it gets a guide. A module with six features has six of these, or a very good reason. |

**Splitting by audience is what exposes mechanism errors.** A guide written for "GMs and players"
together is where they hide, because neither reader's questions get asked. One module's single page
said a setting was "the usual way to keep a monster's hit points off the table" -- true about the
outcome and wrong about the mechanism, since a card is posted once and read by everyone, so the
setting means the card never had a health bar rather than that the party cannot see one. Writing the
GM guide separately forced the precise statement and exposed it. The one-pager would have taught a
model that breaks the moment a GM wonders why there is no per-player version.

**Err toward coverage, not toward certainty.** Writing eight guides you have not walked multiplies
the unverified surface eightfold, and the question is fair: is that better than one guide you have
walked? Yes. A missing guide gives a reader nothing, while an unverified one gives them something
mostly right plus a recorded note saying which parts to distrust -- and the unverified surface is
discoverable and fixable, where absence is neither. Write the coverage, record what is unwalked in
`TODO.md` per guide rather than as one blanket line, and name the guide most likely to be wrong. That
is usually the player guide, because its claims are read off permission checks rather than seen from
a player's client, and it is the one a player actually reads.

**Architecture length is not feature size.** A feature with a short architecture document can be a
large thing to a user, and the reverse is common. One module nearly omitted a guide for a toolbar
button any player can press that writes to their character sheet, because its architecture document
was brief. Judge the guide list by what a user does, never by how much was written for developers.

**The cheap diagnostic: if getting-started is growing a section per feature, those features want
guides.** Two modules independently reported reading that crowding as "this guide is a bit long"
rather than "these are seven guides", and both were writing the sections that should have been the
missing files. The symptom arrives before the realisation.

**No count can tell you whether the guides are any good.** Eight guides that each restate the
settings window score identically to eight that each answer a different reader's questions. The
coverage bar is about whether a question got answered, which is not countable -- so the checker's
ratio is a prompt to run the coverage test by hand, never a target, and a module that games it has
only lied to itself. The ratio also has the wrong denominator: architecture is organised by
subsystem and guides by verb, so a module with two architecture documents can easily have eight
user-facing features. The count that matters is features a user would name, and no tool can see it.

**The one-guide module is almost always wrong.** A module worth installing does more than one thing,
and a reader who wants to do the second thing has nowhere to go. Before calling the set finished,
name every feature aloud and point at the guide that covers it; the gaps are the remaining work.
The module that got this right first wrote seven guides for seven features.

**Nine rules, all checkable:**

1. **Write for the table, not the repository.** No class names, no file paths, no API method names,
   no code blocks -- except text the user literally types or pastes, such as a chat command or a
   macro.
2. **Name what is on screen.** Use the rendered English label as it appears in Foundry, taken from
   `lang/en.json` -- never the localisation key. A user searching the settings window for
   `settingCombatTimerEnabled` finds nothing. **Quote those labels; never edit them.** They are the
   product's own copy, and a documentation task is not a licence to reword the interface. A label
   that is missing or wrong is a bug to report, not a string to fix in passing.
   **This covers HINTS as much as labels, and hints are where the rot is.** A label names a thing; a
   hint makes a CLAIM about what happens, so it can go stale while the label stays correct. Every
   wrong string found across nine adoptions was a hint, not a label. One shipped hint still described
   a design its module had abandoned -- the same false claim its architecture document carried, and
   visible to every GM in the settings window. Do not repeat a claim you have found to be false, do
   not reword it, and file it as product copy for the author.
3. **Task headings, not subsystem headings.** "Roll initiative for the whole party" tells a reader
   whether to keep reading; "Combat Timer Manager" does not.
4. **Say who can do it.** GM only, any player, or the owner of the token. This is the single most
   common question and the most commonly omitted answer.
5. **Every claim is something you can do in a running world.** If you cannot walk the steps
   yourself, the steps are wrong. A guide derived from reading source is a draft until somebody has
   walked it, and which claims have not been walked is worth saying out loud.
   **Record the unwalked claims in `TODO.md`, not in the guide.** Saying so inside the document is
   status theatre, and a reader at the table cannot act on it. Walking the guide is work, so it is a
   TODO entry naming the guide and what specifically is unverified -- usually the ordering claims and
   anything about what a player sees, since source cannot tell you either.
   **A product screenshot of a live game is a photograph of real people.** Player names, character
   names and chat messages all end up in a capture of a running world, and a product screen is
   published to a public wiki and a public landing page. Check what is in the frame, and prefer a
   scratch world. This is a second, independent reason to delete a stale capture and does not depend
   on the image being wrong: three of one module's four retired screenshots showed real players'
   real names.
   **"Check the frame" is easy to read as "check the chat log", and that is not where it hides.** In
   the clearest case found so far, six real players' names and their character names sat in a
   RECIPIENT PICKER -- interface chrome nobody thinks of as content. Player lists, target selectors,
   permission dialogs and combat trackers all carry names.
   **No screenshot beats a wrong one.** A stale product image is replaced or deleted, never
   republished -- and this rule overrides both the instruction below and the README's "show it".
   An image is believed harder than a document, and a reader who sees five tabs in a capture and two
   on screen concludes the module is broken rather than the picture is old. Squire had seven captures
   predating a module split, every one showing tabs that no longer exist; publishing none and writing
   a TODO was correct.
   **Screenshots are how the wrong claims surface, and they surface reliably.** The first guide
   written this way looked correct and carried four errors, every one invisible in the source and
   obvious in an image: the tabs render in a different order from the one the code declares them in,
   a readout labelled one thing internally says another on screen, and two features are called by
   their internal names rather than the words a user sees. Source tells you what exists. It does not
   tell you what it is called or what order it appears in, and those are the only two things a reader
   navigates by. Add the screenshots before calling a guide finished, and re-read every label against
   them.
6. **A dependency gets one clause, and no more.** If a behaviour only exists when another Coffee Pub
   module is installed, name that module and stop -- no link, no description of what it does, no
   instructions for it. That module's user guide is its own.
7. **Screenshots live in `documentation/assets/`** and are referenced relatively, so they render in
   the repository, in an editor, and -- after the publisher rewrites them -- on the wiki.
8. **No design rationale.** Why it works this way is architecture. A user guide says what happens.
10. **The formatting standard below applies in full.** User guides are the most-read documents in the
   suite; they are not the place to relax it.

**Write the settings guide after a settings rework, not before.** A guide to controls that are about
to be renamed or removed is waste, and worse, it is waste that reads as authoritative. A module
rebuilding its settings may hold this one file; it may not hold the getting-started guide, which does
not depend on that detail.

---

## Assets

Images live in one folder, `documentation/assets/`, shared by every document that needs them. A
screenshot used by both a user guide and an overview has one home rather than a copy in each.

**An asset must not be named after a document that does not own it.** That is the rule, and it is
the checkable part: a file prefixed `userguide-`, `architecture-`, `api-`, `design-`, `global-` or
`plan-` is claimed by that kind, and referencing it from a different kind is a misfiling the checker
reports. Everything else is free-form -- prefix by module, by feature, by `product-`, whatever groups
the folder for the people who look at it.

The earlier version of this rule mandated `product-` for screens shared by the README and `home.md`.
It had no enforcement, and a rule with no teeth loses to whatever a human names a file at the moment
they create it -- which is the right outcome, because a human naming their own screenshot beats a
convention nobody checks. `merchant-hero.webp` sorts as well as `product-hero.webp` and lies about
nothing.

**There are exactly two homes for an image, and any third is a stray.** Runtime content the module
loads lives in `images/` and ships; everything a document or a landing page draws on lives in
`documentation/assets/` and does not. A root-level `product/`, `screenshots/` or similar is neither:
it does not ship, and the publisher cannot see it, so its contents render nowhere and rot unobserved.
Move them into `assets/` or delete them.

**Product screens do not go in the module's shipped `images/` folder.** That folder is runtime
content and ships in the release zip to every user; `documentation/` does not ship, so a product
screenshot in `assets/` costs a user nothing and still renders on the GitHub landing page and the
wiki. Putting one in `images/` adds weight to every download for a picture no running module ever
loads.

**WebP, not PNG.** The same screenshot is routinely twenty to thirty times larger as a PNG: this
suite carried one at 3.3 MB alongside WebP captures of comparable content at 87 KB and 102 KB. Git
keeps every version of a binary forever, so the cost is permanent and paid by everyone who clones.

**No video files.** Two reasons, and the first is decisive: a GitHub wiki renders a link to a
committed `.mp4`, not a player, so the file buys nothing on the surface being published to. And an
already-compressed format does not delta, so each re-recording is stored whole, permanently, in a
history that cannot be trimmed without rewriting every repository in the suite. Use an **animated
WebP** for a short interface loop, and host anything longer externally.

**An asset that no document references is deleted, and a document referencing a deleted asset is
fixed in the same change.** The checker enforces both directions, because each catches a different
rot. Both have already happened here: 3.5 MB of images nothing pointed at, and -- after those were
removed -- four documents still linking two of them, two of those published, showing broken images on
the wiki.

**Reference assets as links, not as prose.** Write a markdown link to the file; never "see
**some-file.webp**" in bold. A filename in bold is not reachable from anywhere -- not in the
repository, not in an editor, not on the wiki.

---

## CHANGELOG

**Audience: everyone.** What we did and fixed, per release. Keep a Changelog plus SemVer, with prose
entries that cite the files they touched. Match the style already in the file.

- **Code changes are the priority.** Be rigorous there: what changed, in which file, and why.
  Documentation changes are worth a line, not a paragraph -- the documents themselves are the point,
  and a reader can go read them.
- **Every entry names its verification.** There is no test framework beyond running Foundry, so an
  entry that does not say how the change was confirmed is an entry nobody can trust. If the only
  check was that the client loaded with no errors, say exactly that and imply nothing more. This line
  records the verification; it does not replace telling the author how to run it.
- **The emoji rule wins over this one, and a conformance fix is not "writing into" a section.**
  A released section containing an emoji makes the two rules unsatisfiable together: the emoji rule is
  absolute and covers the whole repository, and this rule forbids touching the section. Strip the
  glyph, keep the words, and note it in the open entry. History is preserved by keeping the meaning,
  not the character. This is the only edit a released section ever takes.
- **Never write into a released version's section.** A section is open only until its `BUILD x.y.z`
  commit lands; after that it is published history. When work starts again, open a fresh heading at
  the top -- `## [Unreleased]`, or the next version number if the author has already named it.
- **Do not use `module.json` to decide which section to write into.** The version there deliberately
  lags, sitting at the last shipped number for the whole of development, so the section matching it
  is exactly the one you must not touch. Check `git log --oneline | grep BUILD` instead: if the top
  section already has a BUILD commit, open a new heading above it. Check again before every entry --
  a BUILD can land mid-session.
- **The `BUILD x.y.z` commit closes the release** -- the version bump together with the final
  documentation pass, the CHANGELOG, and the TODO deletions, in one commit, so everything that makes
  a version be that version lands at the same point in history. The version bump, that commit, and
  the tag are the author's.

---

## Plans

**A plan is scaffolding, not a document.** It exists to be dismantled into the permanent kinds: work
goes to `TODO.md`, design to architecture, surface to API, history to the CHANGELOG. Write one for
anything larger than a bug fix; a bug fix needs no plan.

Three rules keep scaffolding from becoming ruins:

1. **A plan declares its status at the top** -- Planned, In progress, Implemented (phase N), or
   Complete. Without it nobody can tell live scaffolding from debris without reading the whole thing.
2. **A plan is never a source of truth.** The moment another document cites a plan as canonical, the
   plan has overstayed -- move that content to its real home.
3. **Complete means delete.** Not archive, not "keep for reference". Distribute the content, then
   remove the file. Anything already landed in a TODO or an architecture document must be removed
   from the plan. **Implemented is not the trigger; absorbed is.** A plan whose code has shipped but
   whose design still lives only in the plan is not finished -- it is a source of truth wearing
   scaffolding's label, which is rule 2. Distribute first, then delete.

Plans never publish. They are for us, while the work is in flight.

---

## TODO and known-issues

**`TODO.md` is the single source of truth for what we will do.** Nothing shaped like work lives
anywhere else.

- **An entry is short**: title, what and why, the file it touches, and how it will be verified. If it
  needs more than that, the extra is design and belongs in a plan -- link the plan and keep the entry
  short.
- **When it is done it is deleted**, and lives only in the CHANGELOG. Never keep a done item for
  reference. **Two conditions, not one:** the CHANGELOG entry exists, and anything durable the item
  carried has landed in architecture or API, in context. A TODO deleted while it was the only place a
  design decision was written loses that decision.
- **Cross-module work goes in the hub's `TODO-GLOBAL.md`**, not a module's own `TODO.md`. That file
  is process tracking and is never a licence to document another module's internals.
  **Re-verify every `file.js:120` reference at the moment you hand it over.** A line number is the
  one kind of claim that goes stale without anybody editing it, and "verbatim" preserves wording
  rather than truth. Both references in the first cross-module handover had rotted: one defect had
  simply moved down the file, and the other pointed at a line that was safe while the real bug sat
  seventeen lines above it -- the worse shape, because someone fixes the cited line, sees no change,
  and closes the item as done.
  **A satellite cannot write that file, so the move is a handoff, not a deletion.** Extract the
  entries verbatim, send them to whoever owns the hub's documentation, and delete them locally only
  once they have landed there. Stated because the unstated version has one realistic outcome: the
  satellite keeps the entries, which is where they already were.
  **A satellite MAY hold a marked staging section for findings not yet handed over** -- "Owed to the
  hub", or similar. The interval between finding something and the hub accepting it is real, and the
  alternative to a staging section is not a clean TODO, it is the finding dying in conversation
  scrollback. The section is legitimate precisely because it empties: an entry sits there until the
  handoff lands, and a section that never empties has stopped being a staging area and become a
  second backlog.

**A known issue is OBSERVED, never inferred.** The stale-screenshot rule has a prose form and this
is where it bites: an entry reasoned out from reading source rather than watched happening sends
someone hunting a bug that may not exist, and it carries the authority of a defect report while
resting on the evidence of a guess. One adopter drafted an entry about tooltips rendering line breaks
as spaces, inferred from CSS they had written and never watched render, and deleted it before it
landed. If you have not seen it, it is a suspicion, and it goes in `TODO.md` as something to check.

**`known-issues.md` is the counterpart to the CHANGELOG**: the CHANGELOG records what was fixed, this
records what is still broken. Each entry describes the defect, its workaround if there is one, and a
short pointer to where a fix would start. When an item is fixed it moves to the CHANGELOG and leaves
this list. Security-sensitive issues are never listed; they are handled privately until patched.

**Never hold TODOs in an API or architecture document.** That is precisely how they drift out of sync
with the code. Anything shaped like "we should", "TODO:", "planned", or a task list belongs in
`TODO.md` and nowhere else. Documenting current broken behaviour is allowed -- as plain behavioural
prose, not a styled callout -- but it is transitional: when the code is fixed, the sentence is updated
to the new reality.

**Reference direction: stable to stable only.** A permanent document may cite code (`file.js:120`)
and another permanent document. It must never point a reader at `TODO.md`, `TODO-GLOBAL.md`, or a
plan, and must never carry an "Open work" or "Remaining work" section. Those never publish, so every
inbound reference is a future broken pointer, and it breaks at exactly the moment somebody fixes the
thing.

**`known-issues.md` is the one exception, and only from the front door.** It publishes, and the file
itself is emptied rather than deleted, so a link to it never rots -- `home.md` routes to it exactly
as it routes to the API. But an API or architecture document still must not cite it: a spec that says
"this is listed in known-issues" has wandered from behaviour into fix status, which the
behaviour-not-commentary rule already forbids.

**This bans the reference, not merely the hyperlink.** A bare mention in backticks is the same debt
as a link, and it is the form the debt actually takes, because the publisher downgrades a link to an
unpublished document into exactly that. The transient lists point outward; the durable documents
never point back. A reader who wants the backlog opens it directly.

---

## Testing documents

`testing/` holds verification that is owed -- code that has shipped and has not been proven in a
running world -- and the steps to discharge it. Same lifecycle as a plan: it exists until it does
not.

It lives at the repository root rather than in `documentation/`, next to the harness and the suites
that discharge it, because a verification backlog and the scripts that clear it are one job. It
exists because the two homes that already existed are both wrong for it: `TODO.md` is work we will
do, and unverified code is not work -- the work is finished, the confidence is missing; and the
CHANGELOG records what was verified in one line, not a live checklist.

Five rules:

1. **It declares what is proven and what is not, at the top.** A reader must be able to tell in one
   glance whether anything here is still owed.
2. **Checkboxes belong here.** This is the one kind where a task list is correct, because ticking
   items off is the entire purpose. Everywhere else a checkbox means the content is in the wrong
   file.
3. **Passing means delete.** Remove the item, do not tick it and leave it. When the file is empty,
   delete the file. A testing document full of ticked boxes is indistinguishable from one nobody has
   run.
   **This binds the BACKLOG and never an automated suite, wherever either lives.** A suite is
   permanent by nature -- a passing check is the reason to keep it, and deleting it because it went
   green removes the thing that stops the failure recurring. A backlog is transitional by nature. The
   folder does not decide which one a file is; the kind does. This matters because the two commonly
   share a folder: Squire's `testing/` holds a manual checklist beside four automated checks, and
   Blacksmith's holds its verification documents beside the harness, its suites, and its fixtures.
   A careless reading of this rule in either repository deletes the checks that stop broken builds
   shipping.
4. **It is never a source of truth about behaviour.** It says "this is unproven", never "this is how
   it works". The moment it explains a mechanism, that belongs in architecture.
5. **Only for what a harness cannot do.** An automated suite is better than a checklist because it
   runs again next month. A testing document is for the rest: a second client, a browser reload,
   cross-module integration, and anything needing a human to judge what it looks like. If a step
   could be a check, write the check instead.

---

## Documentation is part of the change, not a chore after it

Idea to live is the weak link in every one of these repositories, and stale documents are what it
produces. **The documents are the source of truth; the code is reality.** They stay honest only if
updating them travels with the change.

Name the outcome first -- bug fix, feature, performance, or refactor -- because it sets the bar.
Then:

1. **Orient in the documents.** Read the architecture, API, and TODO entries for the area with that
   outcome in mind. These are the anti-crawl artifacts: start here, not in the code.
2. **Reality-check against the code.** Grep and read the actual source before trusting what you just
   read.
3. **Plan it**, unless it is a bug fix, under the plan rules above.
4. **Break the work into TODO entries**, each carrying how it will be verified.
5. **Make the change.**
6. **Verify it, and state how.** Tell the author the steps and the expected result. The verification
   then travels into the TODO entry and the CHANGELOG.
7. **Update architecture and API to describe the new reality** in the same change.
8. **Write the CHANGELOG entry.**
9. **Delete the finished TODO entries and any plan that is now absorbed.**

Steps 7 to 9 are the ones that get skipped, and they are the ones that keep the permanent documents
trustworthy. Take them in the same change, not later.

**When a document and the code disagree, decide which is right.** Do not assume the document is
wrong. A real case from this suite: an API document correctly specified user-targeted socket emission
and the code silently ignored it, until a consuming module hit it in production. The document was the
spec; the code was the bug.

**If you learn something non-obvious by reading code, write it into the architecture document** so
the next person does not pay for it again. That is what those documents are for.

---

## The uniform header, and the formatting standard

Every published document, without exception. The emoji rule binds every document in the repository,
published or not; the rest of this list binds what publishes:

- **Line 1 is `# <Name>`.** Line 2 is blank. **Line 3 is the audience line, written as
  `**Audience:** <who>`** -- the label bold, the description plain. Then a one-sentence scope line,
  and then, if there is an authoritative counterpart, where it lives. The exact form is specified
  because it was not, and the suite grew four variants of the same line.
- **No emoji or decorative icons, ever, in any document** -- published or not, and including the
  README, the CHANGELOG, `TODO.md`, plans, and testing documents. Not in headings, prose, tables,
  example output, or as a status marker in a list. The rule is absolute so that nobody has to
  adjudicate whether a particular icon is decorative or load-bearing; if a mark is carrying meaning,
  write the meaning. Checkably: no pictographic or dingbat character. Typographic punctuation -- em
  dashes, arrows, section marks -- is not an icon and is unaffected.
- **No styled callout blocks.** A blockquote with a bold warning header is still a note about the
  module; state it as prose. Ordinary blockquotes for actual quotations are fine.
- **ASCII quotes and apostrophes**, not curly ones.
- **No task lists or checkboxes.** Anything shaped like work belongs in `TODO.md`, which does not use
  them either -- an entry is prose. The one exception is a testing document, where ticking items off
  is the whole point, and those never publish.
- **No footers or status theatre.** No "Last updated", no "Status: production ready", no "Version
  history" (that is the CHANGELOG), no support boilerplate.
- **Point at code, do not copy it.** A `file.js:120` pointer beats a pasted class, constant list, or
  signature table. Every wrong document found in the suite's audits had pasted something; every
  pointer had survived.

**Behaviour, not commentary.** An API or architecture document specifies what the code does, in the
present tense, neutrally. When current behaviour is a defect, state the behaviour -- that is the
truth a consumer needs -- and leave out the implementation narration and root cause (that is
`known-issues.md`), the history (that is the CHANGELOG), and the fix status (that is `TODO.md`).
Where behaviour is a known defect that may change, signal it with at most a one-clause hint and
nothing more.

---

## The publisher

Each module carries five files, copied from the hub and changed in no way:

| File | What it does |
|---|---|
| `.gitattributes` | Pins line endings, so the four files below stay byte-identical to the hub's. **Copy this one first** |
| `tools/wiki-sync.mjs` | Builds flat wiki pages from `documentation/`, rewrites links, writes the sidebar |
| `tools/check-docs-structure.mjs` | Enforces this standard; imports the publish rules from the publisher rather than restating them |
| `tools/.gitignore` | Keeps `.wiki-build/` and `.wiki-repo/` out of the repository. Easy to miss, because it is not the root `.gitignore`; without it a module commits its own wiki build output |
| `.github/workflows/sync-wiki.yml` | Runs the build and pushes to the module's wiki on every commit to the default branch that touches `documentation/` |

**`.gitattributes` comes first, and the reason is not obvious.** The suite is developed on Windows
with `core.autocrlf=true`. Without the pinned line endings, a copied tool file is LF only until the
next checkout converts it to CRLF -- at which point `diff` against the hub reports every line of both
tools as changed. Nothing errors and the checker still passes, because it reads its own local files
and does not care. The only thing that breaks is the byte-identity comparison, and it breaks looking
exactly like a local edit: a maintainer diffing after a fresh clone concludes somebody patched the
tools and goes hunting for a change that was never made. Copy it after the tools and the first
checkout normalises them, so the copy that follows also looks like a change.

This is the second defect of its kind, after `TODO-GLOBAL.md` at the root: it fails silently, in a
place nobody is watching, and the symptom points away from the cause. It also cannot be found by
copying and diffing in one sitting -- only by a second session, or by reading git's warning during
`git add`.

### Line endings and the commit boundary

One property, four places it bites. Stated once here because a caveat repeated in four sections is
the drift this standard exists to prevent.

**The property.** Git's line-ending rules apply from the COMMIT that introduces them, and a working
tree is normalised per checkout. So any comparison between two working trees, or between a working
tree and a commit, can differ for reasons that are not drift -- and can agree while drift is pending.
Every consequence below is that one fact seen from a different side.

1. **`.gitattributes` cannot protect itself on the first pass.** The copy sitting in a working tree
   before its own commit is subject to whatever `core.autocrlf` already says. Copying it first is
   still the best available order; the guarantee starts one commit later.
2. **A working-tree `diff` lies about the copied files.** It reports "identical" and keeps doing so
   right up until the checkout that makes it false. Compare what git STORES instead -- staged blobs
   -- which is normalisation-independent by construction and works before any commit.
3. **A mismatch against the hub's `HEAD` has two causes.** While a hub fix is staged but uncommitted,
   `HEAD:` is the previous version, so a faithful copy reports a DIFF indistinguishable from real
   drift. Adopters copy precisely during that window, because that is when the hub has just fixed
   something for them. Compare against both:

        md5sum tools/wiki-sync.mjs                                                # your copy
        git -C ../coffee-pub-blacksmith show "HEAD:tools/wiki-sync.mjs" | md5sum  # hub, committed
        md5sum ../coffee-pub-blacksmith/tools/wiki-sync.mjs                       # hub, working tree

     matches both                    correct, and the hub is not mid-change.
     matches worktree, differs HEAD  correct. The hub has not committed. Benign; re-run later.
     matches HEAD, differs worktree  STALE. The hub changed the file after you copied it.
                                     Re-copy, then re-run.
     differs from both               a real problem: a bad copy, or line-ending drift.

   Say which side you compared against. "All five match" is a claim that goes stale without anyone
   editing it, which makes it worse than no claim, because the next person stops checking.
   **And compare every time, not only when you suspect drift.** A notice from the hub that a file is
   committed says nothing about whether YOUR copy predates its last change -- the file can be settled
   and your copy still stale. That is a TRUE difference arriving alongside a message implying there
   is none, which is the one variant of this that a reassurance actively conceals. The satellite that
   caught it did so by running the comparison instead of taking "safe to verify" at face value.
4. **A tool comparing raw bytes across repositories manufactures drift.** The shared-block check
   reported a satellite's disclosure as drifted when it was character-for-character identical: their
   README was CRLF, the canonical file LF. This is the nastiest of the four, because the other three
   produce a false DIFF that sends someone looking, while this one ACCUSES a compliant module. A
   tool that manufactures a defect costs more than one that misses a real one. Any check comparing
   text across repositories normalises line endings first, and any check that can be wrong needs a
   stated way to confirm its verdict -- here, diff the two blocks by hand before believing it.

**And the ordering rule that follows: when a hub change and an adoption are in flight together, the
hub commits first.** Otherwise the suite briefly holds a satellite shipping publisher files its hub
has never committed, and anyone auditing in that window sees the DIFFs in the module most likely to be
blamed for them. Same property once more: the guarantee starts at the commit, so the commit comes
first.

**A module that already has a `.gitattributes` gets the hub's rules ADDED, not the file replaced.**
Everything the standard needs is additive -- `text=auto` plus `eol=lf` on the text kinds -- and it
never requires removing a rule a module added for itself. Diff the two, add what is missing, keep what
is extra. This matters because `.gitattributes` decides whether a file is text or binary, and marking
a genuinely binary format as text corrupts it on checkout, silently, with the damage baked into the
working tree where no check will find it. Artificer is the live case: it declares eight compendium
packs and carries `packs/** binary`, which is the only thing standing between its LevelDB files and
line-ending conversion. Copying the hub's file over it would have destroyed them.

**Order matters inside the file, and getting it wrong is silent.** Git takes the LAST matching rule,
and most files inside a LevelDB pack -- `LOG`, `CURRENT`, `MANIFEST-000123` -- have no extension, so
`* text=auto` is the only other rule that reaches them. A `binary` rule therefore has to come after
`text=auto`, never before. Appending the hub's rules to the end of an existing file would invert
exactly this protection while appearing to do the safe, additive thing.

Of the fifteen modules, eleven carry no `.gitattributes` at all -- the loud, easy case, where a
verbatim copy is correct. The other four are the ones needing a human to look, and a count of "has
one" makes them look like the modules that are nearly fine when they are the two that need the most
care.

**Nothing in any of these files is edited per module.** Everything module-specific is derived at run time:

- **Module identity comes from `module.json`.** The publisher reads `id` and derives both the wiki
  URL and its own answer to "am I the hub?". Nothing is hardcoded. Holding the module id in a
  constant is a trap for a copied file: a satellite that forgets to change it believes it is the hub,
  and the hub is the one module forbidden to link outward, so every one of that satellite's
  legitimate links into the hub wiki is silently downgraded to plain text. Nothing errors and no page
  looks broken -- the links simply are not links.
- **The branch comes from the repository's default branch**, so a module on `main` and a module on
  `master` both work, and so raw asset URLs resolve.

What it does, in order:

1. **Collects** every `.md` in the published folders, plus `home.md` and `known-issues.md`, minus
   HOLD.
2. **Flattens** each to a top-level page named by its basename -- `api-pins.md` becomes the page
   `api-pins`. No colons and no subdirectories, which is also what keeps the wiki cloneable on
   Windows.
3. **Rewrites links.** A link to another published document becomes a page link. A link to code or an
   asset is downgraded to plain text, so the wiki carries no broken red links. A link to a held or
   non-existent document is likewise downgraded, and becomes a link again automatically the day its
   target publishes.
4. **Rewrites `assets/` paths** from repository-relative to absolute raw URLs, so images render on
   the wiki while the source document keeps a relative path that renders everywhere else.
5. **Enforces the boundary rule in code**, in all three directions -- see below.
6. **Writes `_Sidebar.md`** with groups in a fixed order: Getting started, User guides, Global, API,
   Architecture, Design system. User guides sit directly under Home because they serve the largest
   audience; Getting started is `home.md` and `known-issues.md`.
7. **Writes `Home.md`** from `documentation/home.md`.

**Source documents are never modified.** Every rewrite happens on the way out.

**A `.md` target is resolved as a document before any code-path test is applied.** A documentation
folder shares a name with a code folder in the hub today -- `api/` is both `documentation/api/` and a
shipped source directory -- and the other ordering downgrades every link into the documentation
folder to plain text as though it were source. Nothing errors; the links simply stop being links.

### The boundary rule, enforced rather than remembered

**A module's documentation describes that module only.** A satellite's internals do not appear in the
hub's documents, and vice versa. Such references get deleted, not relinked -- a corrected
cross-module link is still coupling. Showing how a consumer calls the hub's API is fine: that
documents the hub's surface, not the caller's internals.

Stated as directions, because it is directional and has been misapplied in exactly one direction
before:

| Direction | | Why |
|---|---|---|
| satellite to hub | allowed | The hub is a required dependency of every satellite. The coupling already exists and is mandatory; a link only makes it legible. |
| hub to satellite | refused | Couples the hub to something optional that may not be installed. |
| satellite to satellite | refused | Two optional things, neither guaranteed present. |

One predicate in the publisher covers all three: rewrite a cross-module link only when the target is
the hub and the running module is not. In the hub's own copy those conditions can never both hold, so
the hub cannot link outward even by accident. This rule lived in prose for a year and was misapplied
at least once, which is why it now lives in code.

**The carve-out: `README.md` and `home.md` may name the whole suite and link every sibling
repository.** They are product pages, and saying which family a module belongs to is part of their
job. The boundary rule governs documentation about how a module works -- the API, the architecture,
the design system, the user guides -- not the front door telling a reader what else exists. Without
this stated, every satellite README that says "part of the Coffee Pub suite" violates a rule nobody
intends to enforce there.

### The structure checker

`tools/check-docs-structure.mjs` runs standalone and exits non-zero on a violation. It verifies what
a reader cannot hold in their head:

- The published folders exist, and `global/` exists in the hub alone.
- Every file's prefix matches its folder, and the documentation root holds only its four named files.
- No published document references a transient list, and none carries an "Open work" section.
- Every HOLD entry names a file that exists and carries a reason.
- Every published document has the uniform header, audience line included.
- No document anywhere in the repository contains an emoji or dingbat -- the whole tree, not the
  publish set, since the rule is absolute.
- Every relative image link resolves to a file that is actually committed, **and every file in
  `assets/` is referenced by at least one document.** Both directions, because each catches a
  different rot.
- No video file is committed anywhere under `documentation/`.

The checker has to exempt this document, which states the rules it enforces and therefore contains
the strings it looks for. Exempt it by name and say so in the code, rather than weakening the check
for everything else.

Run it after touching documentation. Nothing else runs it -- the release workflow only zips and
releases on a tag.

---

## Adopting this in an existing module

In order, because each step depends on the one before:

1. **Copy `.gitattributes` FIRST, before touching anything else.** It carries `*.md text eol=lf`,
   so every document the later steps create or move is staged under whatever `core.autocrlf` says
   until this file lands. The ordering warning in the publisher section is written about the five
   copied tool files and is equally true of the documents these steps produce -- and because the
   steps are numbered, working down them in order guarantees the wrong result. If the module already
   has a `.gitattributes`, ADD the hub's rules rather than replacing it.
2. **Create the folders** and move what already exists into them, using `git mv` so history follows.
   **Then sweep for inbound references to the old paths.** A rename that history follows still breaks
   every pointer at it: code comments, workflow files, TODO entries, plans, and links from other
   documents. Grep for the old folder name and the old filenames, fix the live pointers, and leave
   released CHANGELOG sections alone -- a naive find-and-replace rewrites published history.
   On Windows -- which is where this suite is developed -- renaming `todo.md` to `TODO.md` fails with
   "destination exists", because the filesystem is case-insensitive and git sees a collision. Rename
   through a temporary name: `git mv documentation/todo.md documentation/todo-tmp.md`, then
   `git mv documentation/todo-tmp.md documentation/TODO.md`.
   **Decide `api/` and `designsystem/` deliberately, here, rather than by default.** Two questions,
   answered out loud: does anything outside this module call into it, and does anything style against
   it? Making those folders optional moved the decision from a failing check to an unasked question,
   which is the right trade and a quieter one -- a leaf consumer is easy to be right about, and a
   larger module may genuinely have surfaces it has never written down.
   **Put a `.gitkeep` in any required folder you leave empty.** Git does not track an empty directory,
   so a tree that passes locally arrives at a fresh clone missing the folder and fails there instead --
   the one place nobody is watching.
3. **Rename files to match their folder's prefix.** Anything already published keeps its old page
   name until step 7, so do the renames before the publisher goes live rather than after.
4. **Delete the forks outright.** A satellite's own copy of the hub's API notes -- typically named
   something like `blacksmith-apis.md` -- is deleted and replaced by a link to the hub's wiki. It is
   not folded into `api/`: folding preserves the fork under a tidier name, and this is the single
   most common stray in the suite. The same goes for any local copy of a `global/` document.
5. **Fold the remaining strays.** Anything that is not one of the kinds either folds into a kind that
   exists or is deleted. **When a stray duplicates a document of the kind it would fold into,
   reconcile BOTH against the code before folding.** The stray is not automatically the stale one.
   In one module's three pairs the verdict differed every time: the stray was stale and
   self-contradicting; the architecture document was publishing an abandoned design the stray had
   correctly retired; and the third was split, with a stale body and a correct addendum. Neither the
   filename, the folder, nor which file is older predicts it, and a fold in the wrong direction
   silently deletes the correct text and publishes the wrong text.
   **Then `git grep` the old filename across `scripts/` and `tools/`, not just the documents.**
   Folding a stray leaves dangling pointers in the CODE that referenced it -- one module found six
   such comments, two naming files deleted a month earlier. Ten seconds, and the easiest step to skip.
6. **Check that the existing user guide is one before moving it.** The one-line test: does its H1
   name THIS module? Three modules carried a `getting-started.md` that was starter-template
   scaffolding about how to BUILD a Coffee Pub module -- one titled "Getting Started with Coffee Pub
   Module DEVELOPMENT" -- and one carried two such files. The first module to adopt this had
   a `user-guide.md` whose sections were "Recommended Data Model", "Fastest High-Value Features", and
   "Product Direction" -- a product plan wearing a user guide's filename. Moving it to `userguides/`
   would have published a design document to the wiki as though it told a GM how to play. It went to
   `plans/` and a real guide was written from scratch. A filename is not evidence of a kind.
7. **Write `home.md`** and rewrite `README.md` as the product page. Write `home.md` from scratch;
   never seed it from the wiki. Without them the wiki has no front door and the repository has no
   pitch.
8. **Write `userguide-getting-started.md`.** Add `userguide-settings.md` too, unless the module's
   settings are being reworked, in which case it waits for the rework.
9. **Move defects out of `TODO.md` into `known-issues.md`.** An adopting module will have some,
   because until now there was nowhere else to put them; the split reads as obvious once stated and
   is genuinely new to a satellite. While there, delete the completed entries -- one module's only
   dangling pointer in the entire repository sat in a finished item nobody had removed, because the
   CHANGELOG entry had felt like the completion.
10. **Copy in the five publisher files, `.gitattributes` first, and push.** If the module already has
   a `.gitattributes`, add the hub's rules to it rather than replacing it -- see the warning above.
   The first run publishes everything at once.
11. **Do not silence git's warnings, and run the checker once more before committing** rather than only
   after each step. Two of the defects found on the first adoption surfaced no other way: one from
   reading a `git add` warning instead of scrolling past it, one from running the check again on a
   later day. Neither survives an adoption done in one sitting by someone working down a checklist,
   which is how every remaining module will be done.

---

## What stays in a module's CLAUDE.md

This standard governs documentation. A module's `CLAUDE.md` keeps what is specific to that module and
its code: source file naming and prefixes, coding style, logging and hook conventions, settings
rules, the traps particular to that codebase, and pointers into its own architecture documents. Where
the two ever disagree about documentation, this standard wins -- and the `CLAUDE.md` gets fixed,
because two documents disagreeing is worse than either one being wrong.
