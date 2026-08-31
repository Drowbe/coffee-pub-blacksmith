# Documentation Standard

**Audience: anyone writing or organising documentation for a Coffee Pub module.**

Every module in the suite -- the hub and all thirteen satellites -- lays out, names, writes, and publishes
its documentation the same way, so what a reader learns navigating one module holds for all of them.

This is the counterpart to [architecture-ownership.md](../architecture/architecture-ownership.md): that one decides which
module a feature belongs in, this one decides where its documentation goes, what it may say, and whether it
reaches the wiki. It is authoritative for the whole suite and supersedes the documentation sections of any
module's `CLAUDE.md`.

---

## Why this exists

Four failures, all of them currently live in the suite:

1. **Every module invented its own layout.** Nothing is where you expect it, so nobody looks, so docs rot
   unread.
2. **Only Blacksmith publishes.** A satellite's documentation exists only for someone who clones the repo.
   The wiki is where people actually read.
3. **No module documents how to use it.** Every document in the suite is written for a developer. A GM
   installing a module gets a feature list in a README and nothing else. This is the largest single gap in
   the suite, and it is what `userguides/` exists to close.
4. **The rules that keep documentation honest lived in one module's `CLAUDE.md`.** They were never wrong,
   they were just unreachable from the other thirteen repos. They are below.

**Clean documentation is critical, and it is the part that rots without anyone noticing.** Code that is
wrong breaks. A document that is wrong is believed.

---

## The tree every module has

```
<module>/
  README.md                       ships in the release zip; the product page
  CHANGELOG.md                    ships in the release zip; what changed, per release
  documentation/                  never ships; the only tree the wiki publisher reads
    home.md                       becomes the wiki Home page
    known-issues.md               published
    TODO.md                       never published
    api/
      api-<topic>.md
    architecture/
      architecture-<topic>.md
    designsystem/
      design-<topic>.md
    plans/
      plan-<topic>.md             never published
    resources/
      resource-<topic>.md
    userguides/
      userguide-<topic>.md
      images/                     screenshots, referenced relatively
  testing/                        repo root; never published, by construction
```

**All five folders exist in every module, even when the module has nothing to put in them yet.** An empty
folder makes the missing work visible; a missing folder makes it invisible.

Git cannot track an empty directory, so "exists" means it holds either its first real document or a
`.gitkeep` until it does. Prefer the first: every module owes a `userguides/userguide-getting-started.md`
regardless, so start there rather than with a placeholder.

**`testing/` sits at the repo root, not inside `documentation/`.** Keeping it outside is what makes it
unpublishable by construction rather than merely by policy: the publisher never looks there, so a
verification backlog cannot leak to the wiki by accident.

---

## One folder, one prefix

| Folder | File prefix | Audience | Publishes |
|---|---|---|---|
| `api/` | `api-` | Someone writing code against the module | yes |
| `architecture/` | `architecture-` | Someone changing the module, and the rest of the suite | yes |
| `designsystem/` | `design-` | Someone styling against the module | yes |
| `resources/` | `resource-` | Someone integrating: tutorials, references, worked examples | yes |
| `userguides/` | `userguide-` | Someone playing or running a game with the module | yes |
| `plans/` | `plan-` | Us, while the work is in flight | never |
| `documentation/` root | `home.md`, `known-issues.md`, `TODO.md` | mixed | home and known-issues only |

This table is the authority. Do not derive the prefix from the folder name -- `designsystem/` takes
`design-`, and that irregularity is deliberate: the files were named before the folder was.

**A file whose prefix disagrees with its folder is misfiled.** The structure checker reports it as an error
rather than guessing which half is right, because both halves have been wrong before.

Filenames are lowercase kebab-case, because **the filename becomes the wiki page name**. `api-pins.md`
publishes as the page `api-pins`, and satellites link to hub pages by that name -- so renaming a published
file breaks every inbound link in the suite. `TODO.md` keeps its shouted name because it is a landmark in
the repo, never a page.

---

## The seven kinds of document

Nothing that is not one of these seven is documentation; it is noise, and it gets deleted rather than filed.
**Do not create an eighth kind, and do not add to a kind by inventing a parallel file.**

| Kind | Where | What it is | Lifecycle |
|---|---|---|---|
| **Overview** | `README.md`, `documentation/home.md` | Enough to decide whether to install, and where to go next | permanent |
| **User guide** | `userguides/` | How to use the module at the table, as a player or a GM | permanent |
| **API** | `api/` | The public surface, authoritative; update it when the surface changes | permanent |
| **Architecture** | `architecture/` | How the module is built and why -- the things you can only learn by reading code | permanent |
| **Design system** | `designsystem/` | Tokens, components, and patterns another module styles against | permanent |
| **Resource** | `resources/` | Tutorials, integration walkthroughs, and reference material for module authors | permanent |
| **CHANGELOG** | `CHANGELOG.md` | What we did and fixed, per release | permanent |

Two kinds are **transitional** -- they exist to be dismantled and deleted, never to accumulate:

| Kind | Where | Deleted when |
|---|---|---|
| **Plan** | `plans/` | Its content has been distributed to the permanent kinds. Implemented is not the trigger; absorbed is. |
| **Testing** | `testing/` | The verification is discharged. Passing means delete the item, not tick it. |

And two standing lists, which are neither permanent documents nor scaffolding: `TODO.md` (work we will do)
and `known-issues.md` (defects we have not fixed). Both exist to be emptied.

**User guides are the seventh kind, added by this standard.** The suite previously ran on six, and the rule
was that you do not invent a seventh. This is that amendment, made deliberately and once.

**Migration guides and inventories are not a kind.** If such a document has content worth keeping, fold it
into architecture and delete the original. If a migration is complete, it is history, and history lives in
the CHANGELOG -- not in a guide named after a version that shipped two releases ago.

**Reference direction: stable to stable only.** A permanent document may link code (`file.js:120`) and
another permanent document. It must never link `TODO.md`, `known-issues.md`, or a plan, and must never carry
an "Open work" or "Remaining work" section -- those lists exist to be emptied, so every inbound link is a
future broken reference that breaks at exactly the moment someone fixes the thing. The transient lists point
outward; the durable documents never point back. A reader who wants the backlog opens it directly.

---

## What publishes, and what cannot

**Publication is decided by folder membership, not by a list somebody remembers to update.** Every `.md`
under `api/`, `architecture/`, `designsystem/`, `resources/`, and `userguides/`, plus `home.md` and
`known-issues.md`, publishes to the wiki. A new document goes live by existing.

Two escapes, in this order:

- **Never publishable.** `plans/`, `TODO.md`, `TODO-GLOBAL.md`, `testing/`, and everything outside
  `documentation/`. This is structural, not a list -- the publisher cannot reach them.
- **HOLD.** A short list in the publisher naming documents deliberately withheld, each with a one-line
  reason. Held documents are for work in progress and for documents known to be wrong. A HOLD entry is a
  debt, so it carries a reason or it does not belong there.

Blacksmith previously ran the opposite rule -- a hand-maintained list of 69 paths, where nothing published
until it was named. That rule fails in the direction nobody notices: `architecture-effects.md` was written,
finished, and invisible for months because no one added the line. Multiply one such list by fourteen modules
and the failure is guaranteed rather than likely. Convention publishing inverts the risk into one that is
visible -- a document that should have been held is on the wiki, where somebody reads it and says so.

**The publish set is a contract with the other modules, not a local preference.** A satellite links into the
hub's wiki by page name. A hub page that is renamed, or dropped into HOLD, silently 404s every inbound link
in the suite.

**The wiki is a pure mirror, and the repo is law.** Nothing is authored wiki-first. A wiki page with no repo
source is a bug, not content, and gets deleted rather than back-ported.

---

## README: the product page

The README ships in every release zip and is the GitHub landing page. **It is the only document most people
will ever read**, and for many it is the whole basis of the decision to install.

**It answers one question: what is this, and do I want it?** Then it gets out of the way and points at the
wiki.

What it contains, in this order:

1. **The module's name and one sentence** saying what it does for a person, in their words. Not "a
   Foundry VTT module providing an extensible framework for" -- say what changes at the table.
2. **A screenshot or two.** This is a visual product. Show it.
3. **What it does** -- three to eight bullets, each a capability a user would recognise, written the way a
   user would describe it rather than the way the code is organised.
4. **Requirements** -- Foundry version, game system, and any required modules, stated plainly.
5. **Install** -- the manifest URL and the one-line instruction.
6. **Where to read more** -- links into the wiki: the user guides for players and GMs, the API for
   developers. Depth lives there, not here.
7. **Licence and credits.**

What it is not: a feature dump, an API reference, an architecture summary, a changelog, a roadmap, or a task
list. Every one of those has a home, and none of them is the front door.

**It ships, so it must stay clean.** No machine-specific paths, no internal notes, no "coming soon". And
because it ships with every release, an entry that goes stale ships stale -- keep it to claims that will
still be true in six months, and let the wiki carry the detail that moves.

**`home.md` is the wiki's front door and routes rather than explains**: a paragraph on what the module is,
then links to the user guides, the API, and the architecture. It overlaps the README deliberately and
briefly; the moment it starts explaining a feature, that explanation belongs in a user guide.

---

## User guides

The gap this standard exists to close. A user guide is written for a person at a table who has installed the
module and wants to do something with it. They are not reading code, they do not know what a hook is, and
they will not find a feature that is not described in terms of what they can see.

**Every module owes these:**

| File | Required | Contents |
|---|---|---|
| `userguide-getting-started.md` | always | What the module does, what it needs installed, and what changes on screen the moment it is enabled. The first five minutes. |
| `userguide-settings.md` | always | Every setting, by its on-screen name: what it does, who it affects, what happens if you change it. |
| `userguide-gm.md` | if the module has GM-only behaviour | The GM's workflows, in the order a session actually runs. |
| `userguide-player.md` | if players see anything at all | What a player sees and can do, and what they cannot. |
| `userguide-<feature>.md` | as needed | One per feature large enough that the guides above would otherwise swallow it. |

**Nine rules, all checkable:**

1. **Write for the table, not the repo.** No class names, no file paths, no API method names, no code
   blocks -- except text the user literally types or pastes, such as a chat command or a macro.
2. **Name what is on screen.** Use the rendered English label as it appears in Foundry, taken from
   `lang/en.json` -- never the localisation key. A user searching the settings window for
   `settingCombatTimerEnabled` finds nothing.
3. **Task headings, not subsystem headings.** "Roll initiative for the whole party" tells a reader whether
   to keep reading; "Combat Timer Manager" does not.
4. **Say who can do it.** GM only, any player, or the owner of the token. This is the single most common
   question and the most commonly omitted answer.
5. **Every claim is something you can do in a running world.** If you cannot walk the steps yourself, the
   steps are wrong.
6. **A dependency gets one clause, and no more.** If a behaviour only exists when another Coffee Pub module
   is installed, name that module and stop -- no link, no description of what it does, no instructions for
   it. That module's user guide is its own. This is the one place a user guide may name a sibling at all.
7. **Screenshots live in `userguides/images/`** and are referenced relatively (`images/combat-timer.webp`),
   so they render in the repo, in an editor, and -- after the publisher rewrites them -- on the wiki.
8. **No design rationale.** Why it works this way is architecture. A user guide says what happens.
9. **The formatting standard below applies in full.** User guides are the most-read documents in the suite;
   they are not the place to relax it.

---

## CHANGELOG

**Audience: everyone.** What we did and fixed, per release. Keep a Changelog plus SemVer, with prose
entries that cite the files they touched. Match the style already in the file.

- **Code changes are the priority.** Be rigorous there: what changed, in which file, and why. Documentation
  changes are worth a line, not a paragraph -- the documents themselves are the point, and a reader can go
  read them.
- **Every entry names its verification.** There is no test framework beyond running Foundry, so an entry
  that does not say how the change was confirmed is an entry nobody can trust. If the only check was that
  the client loaded with no errors, say exactly that and imply nothing more.
- **Never write into a released version's section.** A section is open only until its `BUILD x.y.z` commit
  lands; after that it is published history. When work starts again, open a fresh heading at the top --
  `## [Unreleased]`, or the next version number if the author has already named it.
- **Do not use `module.json` to decide which section to write into.** The version there deliberately lags,
  sitting at the last shipped number for the whole of development, so the section matching it is exactly the
  one you must not touch. Check `git log --oneline | grep BUILD` instead: if the top section already has a
  BUILD commit, open a new heading above it.
- **The `BUILD x.y.z` commit closes the release** -- the version bump together with the final documentation
  pass, the CHANGELOG, and the TODO deletions, in one commit, so everything that makes a version be that
  version lands at the same point in history. The version bump, that commit, and the tag are the author's.

---

## Plans

**A plan is scaffolding, not a document.** It exists to be dismantled into the permanent kinds: work goes to
`TODO.md`, design to architecture, surface to API, history to the CHANGELOG. Write one for anything larger
than a bug fix; a bug fix needs no plan.

Three rules keep scaffolding from becoming ruins:

1. **A plan declares its status at the top** -- Planned, In progress, Implemented (phase N), or Complete.
   Without it nobody can tell live scaffolding from debris without reading the whole thing.
2. **A plan is never a source of truth.** The moment another document cites a plan as canonical, the plan
   has overstayed -- move that content to its real home.
3. **Complete means delete.** Not archive, not "keep for reference". Distribute the content, then remove the
   file. Anything already landed in a TODO or an architecture document must be removed from the plan.
   **Implemented is not the trigger; absorbed is.** A plan whose code has shipped but whose design still
   lives only in the plan is not finished -- it is a source of truth wearing scaffolding's label, which is
   rule 2. Distribute first, then delete.

Plans never publish. They are for us, while the work is in flight.

---

## TODO and known-issues

**`TODO.md` is the single source of truth for what we will do.** Nothing shaped like work lives anywhere
else.

- **An entry is short**: title, what and why, the file it touches, and how it will be verified. If it needs
  more than that, the extra is design and belongs in a plan -- link the plan and keep the entry short.
- **When it is done it is deleted**, and lives only in the CHANGELOG. Never keep a done item for reference.
  **Two conditions, not one:** the CHANGELOG entry exists, and anything durable the item carried has landed
  in architecture or API, in context. A TODO deleted while it was the only place a design decision was
  written loses that decision.
- **Cross-module work goes in the hub's `TODO-GLOBAL.md`**, not a module's own `TODO.md`. That file is
  process tracking and is never a licence to document another module's internals.

**`known-issues.md` is the counterpart to the CHANGELOG**: the CHANGELOG records what was fixed, this
records what is still broken. Each entry describes the defect, its workaround if there is one, and a short
pointer to where a fix would start. When an item is fixed it moves to the CHANGELOG and leaves this list.
Security-sensitive issues are never listed; they are handled privately until patched.

**Never hold TODOs in an API or architecture document.** That is precisely how they drift out of sync with
the code. Anything shaped like "we should", "TODO:", "planned", or a task list belongs in `TODO.md` and
nowhere else. Documenting current broken behaviour is allowed -- as plain behavioural prose, not a styled
callout -- but it is transitional: when the code is fixed, the sentence is updated to the new reality.

---

## Testing documents

`testing/` holds verification that is owed -- code that has shipped and has not been proven in a running
world -- and the steps to discharge it. Same lifecycle as a plan: it exists until it does not.

It lives at the repo root rather than in `documentation/`, next to the harness and the suites that discharge
it, because a verification backlog and the scripts that clear it are one job. It exists because the two
homes that already existed are both wrong for it: `TODO.md` is work we will do, and unverified code is not
work -- the work is finished, the confidence is missing; and the CHANGELOG records what was verified in one
line, not a live checklist.

Five rules:

1. **It declares what is proven and what is not, at the top.** A reader must be able to tell in one glance
   whether anything here is still owed.
2. **Checkboxes belong here.** This is the one kind where a task list is correct, because ticking items off
   is the entire purpose. Everywhere else a checkbox means the content is in the wrong file.
3. **Passing means delete.** Remove the item, do not tick it and leave it. When the file is empty, delete
   the file. A testing document full of ticked boxes is indistinguishable from one nobody has run.
4. **It is never a source of truth about behaviour.** It says "this is unproven", never "this is how it
   works". The moment it explains a mechanism, that belongs in architecture.
5. **Only for what a harness cannot do.** An automated suite is better than a checklist because it runs
   again next month. A testing document is for the rest: a second client, a browser reload, cross-module
   integration, and anything needing a human to judge what it looks like. If a step could be a check, write
   the check instead.

---

## Documentation is part of the change, not a chore after it

Idea to live is the weak link in every one of these repos, and stale documents are what it produces. **The
documents are the source of truth; the code is reality.** They stay honest only if updating them travels
with the change.

Name the outcome first -- bug fix, feature, performance, or refactor -- because it sets the bar. Then:

1. **Orient in the documents.** Read the architecture, API, and TODO entries for the area with that outcome
   in mind. These are the anti-crawl artifacts: start here, not in the code.
2. **Reality-check against the code.** Grep and read the actual source before trusting what you just read.
3. **Plan it**, unless it is a bug fix, under the plan rules above.
4. **Break the work into TODO entries**, each carrying how it will be verified.
5. **Make the change.**
6. **Verify it, and state how.** The verification travels into the TODO entry and then into the CHANGELOG.
7. **Update architecture and API to describe the new reality** in the same change.
8. **Write the CHANGELOG entry.**
9. **Delete the finished TODO entries and any plan that is now absorbed.**

Steps 7 to 9 are the ones that get skipped, and they are the ones that keep the permanent documents
trustworthy. Take them in the same change, not later.

**When a document and the code disagree, decide which is right.** Do not assume the document is wrong. A
real case from this suite: an API document correctly specified user-targeted socket emission and the code
silently ignored it, until a consuming module hit it in production. The document was the spec; the code was
the bug.

**If you learn something non-obvious by reading code, write it into the architecture document** so the next
person does not pay for it again. That is what those documents are for.

---

## The uniform header, and the formatting standard

Every published document, without exception. The emoji rule below binds every document in the repository,
published or not; the rest of this list binds what publishes:

- **Line 1 is `# <Name>`.** Then one bold audience line. Then a one-sentence scope line. Then, if there is
  an authoritative counterpart, where it lives.
- **No emoji or decorative icons, ever, in any document** -- published or not, and including the README,
  the CHANGELOG, `TODO.md`, plans, and testing documents. Not in headings, prose, tables, example output,
  or as a status marker in a list. The rule is absolute so that nobody has to adjudicate whether a
  particular icon is decorative or load-bearing; if a mark is carrying meaning, write the meaning.
  Checkably: no pictographic or dingbat character. Typographic punctuation -- em dashes, arrows, section
  marks -- is not an icon and is unaffected.
- **No styled callout blocks.** A blockquote with a bold warning header is still a note about the module;
  state it as prose. Ordinary blockquotes for actual quotations are fine.
- **ASCII quotes and apostrophes**, not curly ones.
- **No task lists or checkboxes.** Anything shaped like work belongs in `TODO.md`. The one exception is a
  testing document, and those never publish.
- **No footers or status theatre.** No "Last updated", no "Status: production ready", no "Version history"
  (that is the CHANGELOG), no support boilerplate.
- **Point at code, do not copy it.** A `file.js:120` pointer beats a pasted class, constant list, or
  signature table. Every wrong document found in the suite's audits had pasted something; every pointer had
  survived.

**Behaviour, not commentary.** An API or architecture document specifies what the code does, in the present
tense, neutrally. When current behaviour is a defect, state the behaviour -- that is the truth a consumer
needs -- and leave out the implementation narration and root cause (that is `known-issues.md`), the history
(that is the CHANGELOG), and the fix status (that is `TODO.md`). Where behaviour is a known defect that may
change, signal it with at most a one-clause hint and nothing more.

---

## The publisher

Each module carries two files, copied from the hub and changed in no way:

| File | What it does |
|---|---|
| `tools/wiki-sync.mjs` | Builds flat wiki pages from `documentation/`, rewrites links, writes the sidebar |
| `.github/workflows/sync-wiki.yml` | Runs the build and pushes to the module's wiki on every commit to the default branch that touches `documentation/` |

**Nothing in either file is edited per module.** Everything module-specific is derived at run time:

- **Module identity comes from `module.json`.** The publisher reads `id` and derives both the wiki URL and
  its own answer to "am I the hub?". Nothing is hardcoded. The version this replaces held the module id in a
  `THIS_MODULE` constant, which is a trap for a copied file: a satellite that forgets to change it believes
  it is the hub, and the hub is the one module forbidden to link outward, so every one of that satellite's
  legitimate links into the hub wiki is silently downgraded to plain text. Nothing errors and no page looks
  broken -- the links simply are not links.
- **The branch comes from the repository's default branch**, so a module on `main` and a module on `master`
  both work.

What it does, in order:

1. **Collects** every `.md` in the five published folders, plus `home.md` and `known-issues.md`, minus HOLD.
2. **Flattens** each to a top-level page named by its basename -- `api-pins.md` becomes the page `api-pins`.
   No colons and no subdirectories, which is also what keeps the wiki cloneable on Windows.
3. **Rewrites links.** A link to another published document becomes a page link. A link to code or an asset
   is downgraded to plain text, so the wiki carries no broken red links. A link to a held or non-existent
   document is likewise downgraded, and becomes a link again automatically the day its target publishes.
4. **Rewrites image paths** from repo-relative to absolute raw URLs, so screenshots render on the wiki while
   the source document keeps a relative path that renders everywhere else.
5. **Enforces the boundary rule in code**, in all three directions -- see below.
6. **Writes `_Sidebar.md`** with groups in a fixed order: Getting started, User guides, Resources, API,
   Architecture, Design system. User guides sit directly under Home because they serve the largest audience.
7. **Writes `Home.md`** from `documentation/home.md`.

**Source documents are never modified.** Every rewrite happens on the way out.

**A `.md` target is resolved as a document before any code-path test is applied.** The order matters
because `resources/` is also the name of the shipped code folder at every module's root: tested the other
way round, every link into `documentation/resources/` is silently turned into plain text. Nothing errors;
the links simply stop being links.

### The boundary rule, enforced rather than remembered

**A module's documentation describes that module only.** A satellite's internals do not appear in the hub's
documents, and vice versa. Such references get deleted, not relinked -- a corrected cross-module link is
still coupling. Showing how a consumer calls the hub's API is fine: that documents the hub's surface, not
the caller's internals.

Stated as directions, because it is directional and has been misapplied in exactly one direction before:

| Direction | | Why |
|---|---|---|
| satellite to hub | allowed | The hub is a required dependency of every satellite. The coupling already exists and is mandatory; a link only makes it legible. |
| hub to satellite | refused | Couples the hub to something optional that may not be installed. |
| satellite to satellite | refused | Two optional things, neither guaranteed present. |

One predicate in the publisher covers all three: rewrite a cross-module link only when the target is the hub
and the running module is not. In the hub's own copy those conditions can never both hold, so the hub cannot
link outward even by accident. This rule lived in prose for a year and was misapplied at least once, which
is why it now lives in code.

### The structure checker

`tools/check-docs-structure.mjs` runs standalone and exits non-zero on a violation. It verifies what a
reader cannot hold in their head:

- The five folders exist.
- Every file's prefix matches its folder.
- No published document links a transient list, and none carries an "Open work" section.
- Every HOLD entry names a file that exists and carries a reason.
- Every published document has the uniform header.
- No document anywhere in the repository contains an emoji or dingbat -- the whole tree, not the publish
  set, since the rule is absolute.
- Every relative image link resolves to a file that is actually committed.

Run it after touching documentation. Nothing else runs it -- the release workflow only zips and releases on
a tag.

---

## Adopting this in an existing module

In order, because each step depends on the one before:

1. **Create the five folders** and move what already exists into them, using `git mv` so history follows.
2. **Rename files to match their folder's prefix.** Anything already published keeps its old page name until
   step 6, so do the renames before the publisher goes live rather than after.
3. **Fold the strays.** Anything that is not one of the seven kinds either folds into a kind that exists or
   is deleted.
4. **Write `home.md`** and rewrite `README.md` as the product page. Without them the wiki has no front door
   and the repo has no pitch.
5. **Write `userguide-getting-started.md` and `userguide-settings.md`.** These two are owed by every module
   and are where the gap is widest. The rest follow as the module's features warrant.
6. **Copy in the two publisher files and the structure checker, and push.** The first run publishes
   everything at once.

---

## What stays in a module's CLAUDE.md

This standard governs documentation. A module's `CLAUDE.md` keeps what is specific to that module and its
code: source file naming and prefixes, coding style, logging and hook conventions, settings rules, the
traps particular to that codebase, and pointers into its own architecture documents. Where the two ever
disagree about documentation, this standard wins -- and the `CLAUDE.md` gets fixed, because two documents
disagreeing is worse than either one being wrong.
