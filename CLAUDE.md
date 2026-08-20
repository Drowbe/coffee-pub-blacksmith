# Coffee Pub Blacksmith

Foundry VTT module (`coffee-pub-blacksmith`), and the **API hub** of the Coffee Pub suite — it declares
`"library": true` and the other modules consume it. Changing its public surface breaks siblings, so treat
the API as a contract, not internal code.

D&D 5e / Foundry v13 (`minimum: 13`, `verified: 13`, `maximum: 14`). Requires `socketlib` and `lib-wrapper`.

**Before starting: confirm the session's working directory is this module's folder.** The Claude app's
Code -> New session flow does not prompt for a folder, so a session can silently inherit an unrelated
project's directory — the only tell is a small badge next to the session name. Reaching this repo through
an additional working directory works fine, which is what makes the mismatch easy to miss: editing
succeeds, but the session reads and writes the *wrong project's* memory and scratchpad. This happened
across a full session on 2026-07-19/20. If the working directory is not this module, say so before doing
the work rather than after.

## Suite context

Sibling modules live next to this one in `Data/modules/` and are wired in as readable directories:
artificer, bibliosoph, cartographer, crier, curator, herald, librarian, minstrel, monarch, regent, scribe,
squire, vault. All are public repos under `github.com/Drowbe`.

- `coffee-pub-librarian` owns **codex, quests, and objectives** — they moved out of Squire in Librarian 13.0.0,
  and Librarian declares the `JournalEntryPage` subtype, so those entries are `coffee-pub-librarian.codex`.
  Squire keeps the character-facing panels. Notes are **Blacksmith's**, not either module's.

- `coffee-pub-lib` and `coffee-pub-bubo` exist on GitHub but are **retired** — ignore them.
- `coffee-pub-campaigns` is a **backup**, not live code. Never edit it.
- `burden-of-knowledge` is **live campaign data, not code, and not ours to touch.** The folder here is the
  author's actual campaign narrative (1.4 GB: 27 declared packs — scenes, actors, items, playlists, and
  199 roll tables). It is a real Foundry module that loads every launch. Never edit it, and don't treat it
  as a code dependency. Its GitHub repo is a stale backup of the same data (last pushed 2026-02, ~350
  uncommitted local changes since) — the author moves data over the network now, not via git.
  - Note: `bok-roll-tables` holds `Fumbles`, `Critical Carnage`, and the `Investigation:*` tables. Modules
    point at them through Blacksmith's compendium settings — the intended model. This is also why the old
    `blacksmith-tables` pack pointed into this module, and why shipping that pack was broken for everyone
    but the author.

**Direction of travel:** features are being pulled *out* of Blacksmith into their own modules to keep the
hub fast. Don't add feature code here that belongs in a sibling.

**Module boundaries (enforced):**

- **Blacksmith's docs describe Blacksmith only.** Do not document Curator's image replacement, Regent's AI,
  or Herald's broadcast here. Delete such references — don't "fix" them to point at the sibling's repo; a
  corrected cross-module link is still coupling. Showing how a consumer *calls* Blacksmith's API is fine —
  that documents our surface, not theirs.
  **This governs links pointing OUT of Blacksmith, and only those.** A satellite linking *into* our wiki is
  allowed — Blacksmith is its required dependency, so the coupling already exists. Do not extend this rule
  to a sibling's docs; that mistake has been made once. The three directions are stated in TODO-GLOBAL
  Ground Rule 2 and enforced by `siblingWikiUrl` in `tools/wiki-sync.mjs`.
- **Each module bundles its own compendiums.** Don't rely on cross-module content cohesion.

## No build, no tests

This is a plain no-build Foundry module — Foundry loads the ES modules directly. There is nothing to compile
and **no test suite, linter, or formatter**. Don't go looking for one, and don't add a build step casually.

The single exception: `npm run build:cm6` bundles CodeMirror 6 via `build-codemirror.mjs`. Its output
`scripts/vendor/codemirror.mjs` is **committed**, and CI does not rebuild it — if you change the editor
vendor entry, rebuild and commit the bundle yourself.

`testing/` holds everything that exists to check the module, and it runs **inside Foundry**, by a person, 
pasted into a script macro. It is not an automated suite and there is no runner.

| Path | What it is |
|---|---|
| `testing/test-harness.js` | The entry point. Paste into a script macro; it loads the suites and opens a tabbed dialog. See its own header. |
| `testing/harness-lib.js` | Shared helpers and the contract a suite must export. |
| `testing/suites/suite-*.js` | The suites themselves, loaded by the harness. |
| `testing/data/` | JSON fixtures fed to the importer by hand. Data, not code. |
| `testing/*.md` | Verification owed: what has shipped and is not yet proven, and how to prove it. Never published — see the testing-doc rules below. |

**Do not confuse `testing/` with the other four directories that look adjacent.** They differ by *who runs
them and where*:

| Path | Runs where | Runs when |
|---|---|---|
| `tools/*.mjs` | Node, on the command line | You run it, or the wiki Action does |
| `testing/` | Foundry, pasted into a macro | A person checking the module |
| `utilities/` | Foundry, pasted into a macro | A person performing a one-off action — repair, fetch, delete. Not checks. |
| `themes/` | Foundry, at runtime | **Shipped content.** `theme-requestroll.json` plus its images and sounds; `settings.js` points at it. Nothing to do with testing. |
| `packs/` | nowhere | Gitignored, untracked, and not ours — see Packs below. |
| `node_modules/` | Node | Gitignored. Only `npm run build:cm6` needs it. |

What *is* automated is a small set of **invariant checks** in `tools/`, each runnable standalone and each
exiting non-zero on a violation. They verify things a reader cannot reasonably hold in their head, not
behavior:

| Check | Guards |
|---|---|
| `node tools/check-design-tokens.mjs` | `styles/vars.css` and `design-system/design-tokens.md` agree, both ways |
| `node tools/check-settings-headings.mjs` | no settings heading hides itself from players who can see settings under it |
| `node tools/check-card-contracts.mjs` | a consumer cannot inject presentation into a chat card: prose is escaped, and caller-supplied colour stays confined to data-visualisation parts |
| `node tools/check-card-text.mjs` | card copy conventions |
| `node tools/check-harness-paths.mjs` | the test harness will load: paths resolve, every suite on disk is registered, imports resolve, and `expect()` calls pass their label first |
| `node tools/check-styles-loaded.mjs` | every stylesheet is reachable from the load path, and every `@import` resolves — a CSS file nothing imports is silently dead |
| `node tools/check-worldclock.mjs` | the clock's cross-file couplings: sky variables, the stop table, class names, the partial name, and the two coordinate spaces |
| `node tools/check-rest-clients.mjs` | the rest flow across **two clients**: a player's rest reaches the GM, one card carries both phases, grouped rests move the clock once |
| `node tools/check-dnd5e-citations.mjs` | our `dnd5e.mjs:NNNN` pointers still refer to the dnd5e version they were verified against |

Run the relevant one after touching what it guards. CI (`.github/workflows/release.yml`) only zips and
releases on `v*` tags; **it runs no checks**, so nothing runs these but you.

**Citing dnd5e: give the version, and expect the line to rot.** A `dnd5e.mjs:NNNN` pointer is only true of
one release. dnd5e 5.2.5 to 5.3.3 moved roughly four thousand lines and silently invalidated all 76 pointers
in this repo — nothing threw and no doc was edited. `check-dnd5e-citations.mjs` now catches the version
change, but it cannot tell you whether a relocated pointer is *right*. When it fires, re-verify the **claim**
and not just the location: a correctly-relocated pointer to changed behaviour is worse than a broken one,
because it looks right.

## Documentation — there are only six kinds

This repo has repeatedly accumulated plans, migration guides, inventories, and "lessons learned" that
nobody deletes. **Everything that isn't one of these six is noise.** Don't create a seventh kind, and don't
add to a category by inventing a parallel file.

Two of the six are **transitional**: plans and testing docs both exist to be dismantled and deleted. The
other four are permanent. See the two scaffolding sections below.

| Kind | Where | Audience | Rule |
|---|---|---|---|
| **Overview** | `README.md` (users), Home (devs) | README: someone deciding whether to *use* the module. Overview: a developer building *against* it. | Neither mentions architecture or internals. |
| **TODO** | `documentation/TODO.md` | us | **Single source of truth for what we will do.** When it's done, it is **deleted** from here and lives only in `CHANGELOG.md`. Never keep a done item "for reference". |
| **CHANGELOG** | `CHANGELOG.md` | everyone | What we did and fixed. Keep-a-Changelog + SemVer; long prose entries citing file paths. Match the existing style. **Code changes are the priority — be rigorous there.** Doc changes are nice to note but not the point: the docs themselves are what matter, and a reader can just go read them. A one-line mention beats a paragraph reconstructing the doc. **Never add to a version that has already shipped** — see the section rule below. |

**Never write into a released version's section.** A section is open only until its `BUILD x.y.z` commit
lands; after that it is published history. When work starts again, open a fresh heading at the top —
**`## [Unreleased]`**, or the next version number if the author has already named it — and the author
settles the number at BUILD time.

**Do not use `module.json` to decide which section to write into.** The version there deliberately lags,
sitting at the last *shipped* number for the whole of development, so the section matching it is exactly the
one you must not touch. Check `git log --oneline | grep BUILD` instead: if the top section already has a
BUILD commit, open a new heading above it.
| **Architecture** | `documentation/architecture/` | us, and the other Coffee Pub modules | How the module is built and why. **This is the anti-crawl artifact** — the place for things you can only learn by reading code. `architecture-blacksmith.md` is the map. |
| **API** | `documentation/api/` | anyone leveraging Blacksmith — mostly the other Coffee Pub modules, and Blacksmith itself | The public surface. Authoritative. Update it when you change the surface. |
| **Testing** | `testing/` | us | **Transitional.** What has shipped and is not yet proven, and how to prove it. Deleted when empty. Never a record of what passed — that is the `CHANGELOG.md` verification line. See below. |

Cross-module work spanning the suite goes in `documentation/TODO-GLOBAL.md`, not `TODO.md`.

**Migration guides and inventories are not a category.** If such a doc has content worth keeping, fold it
into **architecture** and delete the original. If a "migration" is complete, it's history — it belongs in
`CHANGELOG.md`, not in a guide named after a version that shipped two releases ago.

### Plans are scaffolding, not documents

`documentation/plans/` is the one exception, and it is **transitional by definition**. A plan exists to be
dismantled into the five kinds above: work → `TODO.md`, design → architecture, surface → API, history →
`CHANGELOG.md`. It exists until it doesn't. Three rules keep scaffolding from becoming ruins:

1. **A plan must declare its status** at the top (Planned / In progress / Implemented (phase N) / Complete).
   Without it nobody can tell live scaffolding from debris without reading the whole thing.
2. **A plan is never a source of truth.** The moment another doc cites a plan as canonical, the plan has
   overstayed — move that content to its real home.
3. **Complete means delete.** Not archive, not "keep for reference". Distribute the content, then remove the
   file. Anything already landed in a TODO or an architecture doc must be *removed from the plan*.

### Testing docs are scaffolding too

`testing/` holds the other transitional kind, added 2026-08-08. A testing doc holds **verification that is
owed** — code that has shipped and has not been proven in a running world — and the steps to discharge it.
Same lifecycle as a plan: it exists until it doesn't.

**It lives in `testing/` rather than `documentation/`, next to the harness and the suites that discharge it.**
A verification backlog and the scripts that clear it are one job, and splitting them across two trees meant
reading a checklist in one place and running it from another. It is also the only doc kind that is never
published — `tools/wiki-sync.mjs` only scans `documentation/`, so being outside that tree means a
verification backlog cannot leak to the wiki by accident rather than merely by policy.

It exists because the two homes that already existed are both wrong for it. `TODO.md` is *work we will do*, and
unverified code is not work — the work is finished, the confidence is missing. `CHANGELOG.md` records what was
verified in one line, not a live checklist. A verification backlog put in either one either bloats the backlog
or rots inside a released section.

Five rules:

1. **It declares what is proven and what is not** at the top. A reader must be able to tell in one glance
   whether anything here is still owed.
2. **Checkboxes belong here.** This is the one kind where a task list is correct, because ticking items off is
   the entire purpose. Everywhere else a checkbox means the content is in the wrong file.
3. **Passing means delete.** Remove the item, not tick it and leave it. When the file is empty, delete the file.
   A testing doc full of ticked boxes is indistinguishable from one nobody has run.
4. **It is never a source of truth about behaviour.** It says "this is unproven", never "this is how it works".
   The moment it explains a mechanism, that belongs in architecture.
5. **Only for what a harness cannot do.** `testing/suites/` covers what can be asserted automatically, and a
   suite is better than a checklist because it runs again next month. A testing doc is for the rest: a second
   client, a browser reload, cross-module integration, and anything needing a human to judge what it looks
   like. If a step could be a harness check, write the check instead.

**Internal, like plans and TODO.** Never added to the `PUBLISH` list in `tools/wiki-sync.mjs` — a verification
backlog is not a consumer document, and publishing "we have not tested this yet" to the wiki is worse than
useless.

Prefer these docs over re-deriving from source. Point at them; don't duplicate them.

## The change workflow

Idea → live has been the weak link here: stale docs and ad-hoc changes are what produced the rot this
repo has been digging out of. **Every change follows this pipeline.** The docs are the source of truth;
the code is reality. They stay honest only if updating them is *part of the change*, not a later chore.

Name the outcome first — **bug fix / feature / performance / refactor** — because it sets the bar
(a bug fix skips the plan step; nothing else does).

1. **Orient in the docs.** Read the relevant architecture, API, and `TODO.md` entries for the area with the
   outcome in mind. These are the anti-crawl artifacts — start here, not in the code.
2. **Reality-check against the code.** Grep and read the actual source. Docs have been wrong often enough
   that you verify before trusting — and when a doc and the code disagree, *decide which is right* (the doc
   has been the correct spec against buggy code more than once).
3. **Plan — anything larger than a bug fix.** Write it in `documentation/plans/` under the "Plans are
   scaffolding" rules above. A bug fix needs no plan. The plan is deleted once implemented and its content
   distributed to the five doc kinds.
4. **Break the work into `TODO.md` items.** Each one carries how it will be verified (step 6).
5. **Make the change.**
6. **Test it — and state how.** There is no test framework beyond running Foundry, so every change names its
   verification: the exact steps to confirm in a live world, or the console check, or the file exercised.
   "How you test" is part of the change and travels with it into the `TODO.md` item and the `CHANGELOG.md`
   entry. If the only check is "client loads with no errors," say exactly that — don't imply more.
7. **Milestone check-in — author.** When a milestone's tests pass, the author reviews the diff in Cursor and
   commits. Claude prepares reviewable changes; the author commits.
8. **Update the docs to reflect progress.** Architecture and API now describe the new reality; finished
   `TODO.md` items are removed (step 11), not left checked-off.
9. **Final doc pass** when the whole plan/bug is done — architecture and API fully reconciled to shipped code.
10. **Update `CHANGELOG.md`** for the next release — code changes first, per the CHANGELOG rule.
11. **Delete completed TODOs.** They live in the CHANGELOG now. Never keep a done item "for reference."
12. **Version bump + BUILD commit — author, after final tests.** The author bumps `module.json` and makes the
    BUILD commit, which bundles the final docs, `CHANGELOG.md`, and the todo deletions with the bump. See
    the BUILD rule in Git for the exact shape.
13. **Wiki sync is automatic.** A GitHub Action (`.github/workflows/sync-wiki.yml`) mirrors the publish set
    to the wiki on every push to `master` that touches `documentation/`. What publishes is the `PUBLISH`
    list in `tools/wiki-sync.mjs` — a new doc goes live only when added there. See the wiki note in Git.

**Never hold TODOs in the API or architecture docs.** That is precisely how they drift out of sync with the
code. Those docs describe what *is* — including "this is currently broken, and here is the truth" when that
is the reality. Anything shaped like "we should…", "TODO:", "planned", or a task list belongs in `TODO.md`
and nowhere else. Documenting current broken behavior is allowed — as plain behavioral prose, not a styled callout — but it is
**transitional**: when the code is fixed, step 8 updates the sentence to the new reality. It is a description
of reality with a short shelf life, not a parking spot for work.

### The formatting standard for published docs

Every doc published to the wiki conforms to this. It is checkable, so check it before publishing:

- **No emoji or decorative icons** — not in headings, prose, tables, or example output. Write
  `console.log('Foo working')`, not `console.log('✅ Foo working')`. No `📋`, `🔧`, `⭐`, `⚠️`, `⛔`.
- **No styled callout blocks.** A `>` block with a bold warning header is still a note about the code;
  state it as prose. (Ordinary blockquotes for actual quotations are fine.)
- **ASCII quotes and apostrophes**, not curly ones.
- **Uniform header.** Line 1 `# <Name>`, then one bold audience line, then a one-sentence scope line,
  then where the authoritative counterpart lives if there is one.
- **No footers or status-theatre** — no "Last Updated: Current session", no "Status: production ready",
  no "Version History" section (that is what `CHANGELOG.md` is for), no "Support" boilerplate.
- **No task lists or checkboxes.** Anything shaped like work belongs in `TODO.md`.
- **Point at code, don't copy it.** `file.js:line` pointers beat pasted classes, constant lists, and
  signature tables. Every copied block found in the audits had drifted; every pointer had not.

### Behavior, not commentary — what an API or architecture doc says

These docs specify what the code **does**, as the contract: specific, present tense, neutral. When current
behavior is a defect, state the behavior — that *is* the truth a consumer needs — but keep it to behavior.
Leave out:

- **Implementation narration / root cause.** "All three builders `await X` and discard the result" belongs in
  `known-issues.md`, not the spec.
- **History.** "Used to be documented", "removed in 13.9.x" belongs in `CHANGELOG.md`.
- **Fix status.** "The fix is tracked in…", "intended contract", "open design question" belongs in `TODO.md`.

Where behavior is a known defect that may change, signal it with at most a one-clause hint — "the entry is
not *currently* returned" — and nothing more.

**Reference direction: link only stable-to-stable, and structural.** A doc may link **code** (`file:line`)
and another **stable doc** (the api-to-architecture pair). A doc must **not** link the transient lists —
`known-issues.md` or `TODO.md` — nor carry an "Open work / Remaining work" section. Those lists exist to be
emptied as things are fixed, so every inbound link is a future broken reference, and it breaks at exactly the
moment you update the doc after the fix. The transient lists point outward (they cite code and docs); the
durable docs never point back at them. A reader who wants the backlog opens `TODO.md` or `known-issues.md`
directly — both stand on their own.

> ⚠️ **The docs in this repo are not trustworthy yet.** Where accuracy has been checked against code, most
> were substantially wrong — one architecture doc had **zero** real symbols across 24 code blocks. See the
> verification table in `documentation/TODO-GLOBAL.md` for what has actually been checked. **Verify before
> you rely on a doc claim, and fix it when you find it wrong.**
>
> **When a doc and the code disagree, do not assume the doc is wrong.** Decide which is right. Real example:
> `api-sockets.md` correctly specified `emit(..., {userId})` targeting and the *code* silently ignored it
> until a consuming module hit it in production — the doc was the spec, the code was the bug.
>
> **A doc that copies code drifts; a doc that points at code doesn't.** Every wrong doc found so far failed
> the same way — it pasted a class, a constant list, a key set, or a signature table instead of naming where
> to look. Describe the mechanism; point at the source.

## Conventions

**File naming** — `scripts/` is flat and prefix-organized. Follow the existing prefix:

| Prefix | Role |
|---|---|
| `api-*` | public API layers |
| `manager-*` | subsystem managers (static classes) |
| `window-*` | ApplicationV2 windows |
| `ui-*` | UI injection / sheets / sidebar |
| `utility-*`, `timer-*`, `stats-*`, `registry-*`, `pins-*`, `widget-*` | as named |

There are no `panel-*.js` files here — that's a Squire pattern.

**Style** — ES modules (`"type": "module"`), semicolons, 4-space indent, JSDoc on exported members.
The dominant unit is a **static-only class** (`class HookManager { static … }`); a few APIs are plain object
literals (`CampaignAPI`, `CompendiumsAPI`). Section banners (`// ===== SECTION =====`) and
`// --- BEGIN/END - HOOKMANAGER CALLBACK ---` markers wrap callback bodies.

**Logging** — use `postConsoleAndNotification(moduleName, message, result, blnDebug, blnNotification)`
from `scripts/api-core.js`. It **throws if `message` is falsy**. Debug output is gated by the
`globalDebugMode` setting.

**Hooks** — register through `HookManager.registerHook({name, description, priority, callback, context})`
(`scripts/manager-hooks.js`), not raw `Hooks.on`. Priority 1–5, 1 = critical. Use `context` so
`disposeByContext` can clean up.

**Settings** — `scripts/settings.js` (~286 `game.settings.register` calls, no `registerMenu`). Assign a
`group: WORKFLOW_GROUPS.*`. Names/hints are localization keys in `lang/en.json`.

Headings are ordinary String settings registered through `registerHeader(id, label, hint, level, group,
scope)`, so they obey Foundry's visibility rule like anything else: **only `world` is hidden from non-GM**
(`client/applications/settings/config.mjs:67`); `client` and `user` both render. So **a heading must be
`'user'` if any setting a player can see sits under it — the whole ancestor chain, not just the nearest
heading.** An H1 that stays `'world'` orphans every player-visible setting below it however correct the H2
between them is, and the player gets bare controls with no context: two "Enable" toggles from different
sections, indistinguishable. Conversely a heading whose subtree is entirely `world` should stay `world`, or
players see an empty heading. This is about heading scope only — a setting's own scope is a functional
decision about who owns the value and never changes to satisfy it.

`node tools/check-settings-headings.mjs` enforces this and exits non-zero on a violation. Run it after
touching settings. Note that `registerHeader`'s **level argument is authoritative for nesting, not the
H-number in the label key** — they disagree in places (`headingH3CampaignCommon` registers at level H2).

**Tooltips** — use **`data-tooltip`** and nothing else. Never a bare `title=`, and never both on
the same element: Foundry renders `data-tooltip` in its own styled tooltip while the browser renders
`title` natively, so an element carrying both shows two tooltips.

**CSS** — `styles/default.css` is the only real entry; ~50 other files are `@import`ed from it. **A new CSS
file without an `@import` is silently unstyled.**

## Before you crawl the code — read the architecture doc

The recurring failure mode in this repo is re-discovering by grep what a doc should have told you. If you
learn something non-obvious by reading code, **write it into the architecture doc** so the next person
doesn't pay for it again. That is what those docs are for.

`architecture/architecture-blacksmith.md` in particular:

- **§3** — bootstrap and lifecycle. The `init`/`ready` ordering is **load-bearing and fragile**:
  `module.api` is assigned synchronously before any `await`; settings register in `ready`, not `init` (so
  anything in `init` must use `getSettingSafely`); every early-return in `ready` must call
  `LoadingProgressManager.forceHide()` or the UI stalls at "Finalizing…".
- **§9B** — performance-critical design. Shared journal watchdog, menubar fingerprinting, timer DOM
  caching, and **dead observer paths that look live**. Read before "fixing" any of it.
- **§9A** — traps. `api.version` ≠ `module.json` version; `window.COFFEEPUB` isn't a config object; the
  menubar API is bound in three places; `HookManager` remaps `renderChatMessage`; and more.
- **§7** — the CSS `@import` chain.
- **§11** — the god-module cleanup plan. `blacksmith.js` is ~2,700 lines and self-described as such.

## Packs

**Blacksmith bundles no compendiums.** None are declared in `module.json`, none ship in the release zip,
and `packs/` is gitignored. A compendium is not part of a module — users select their own in settings
(`settings.js` builds the choices from `game.packs.values()`; `manager-compendiums.js` resolves them). If
you are tempted to add a `packs` array, that's a decision to re-litigate, not a routine change.

## Git

**This repo is public.** Never commit machine-specific paths, local absolute paths, or personal config.
Personal Claude Code settings belong in `.claude/settings.local.json` (gitignored) — the committed
`.claude/settings.json` grants nothing, since permissions there would apply to anyone who clones the repo.

**It holds `{}`, not `{"permissions": {"allow": []}}`.** Those are not the same thing. An explicit empty
allow-list at project scope reads as "this project permits nothing" and appears to override what the local
file grants, which is why this module prompted for every shell command while the ten siblings with no
project settings file at all did not. Changed 2026-08-15. If prompting returns, check this file first.

Do not commit or push to the main repo unless asked. The author reviews diffs in Cursor and commits himself —
this covers both the milestone check-ins and the final release commit in the workflow above. Claude stages
reviewable changes; the author commits.

**Never bump the version in `module.json`.** The version stays at the last shipped number for the whole of
development; the author bumps it himself when he decides a release is ready, after his own final tests.

**The `BUILD x.y.z` commit closes the release: the bump together with the final doc pass,
`CHANGELOG.md`, and the todo deletions.** One commit, so everything that makes a version *be* that
version lands at the same point in history:

```
BUILD 13.15.0                          <- module.json + CHANGELOG.md + TODO.md + TODO-GLOBAL.md
Refactor party membership logic and improve statistics handling
Fix summoned creature tracking and combat history storage
```

(Settled 2026-08-05 by the author. This had contradicted itself: the workflow's step 12 said bundled while
this section said `module.json` alone, so whichever a reader found first was wrong. **Do not change it
again without being asked directly** — it has moved more than once, and both shapes work; what does not
work is the two of them disagreeing.)

Claude writes the CHANGELOG entry and stages the final doc changes; the author makes the BUILD commit and
the tag. Because the version in `module.json` lags the work in progress, it is **not** a signal for which
CHANGELOG section to write into — see the CHANGELOG rule above.

**Releases are the author's.** Tagging (`v*` fires `.github/workflows/release.yml`), pushing the main repo,
and anything that publishes to GitHub are his. The workflow runs no lint, tests, or build — the tag is the
only gate.

**Nobody syncs the wiki by hand — the Action does it.** The GitHub wiki is a **pure mirror** of
`documentation/`; the author writes nothing wiki-specific, so it never leads, it only follows.
`.github/workflows/sync-wiki.yml` rebuilds and pushes the publish set on every push to `master` touching
`documentation/` or `tools/wiki-sync.mjs`, and what goes live is the `PUBLISH` list in `tools/wiki-sync.mjs`
— never what merely changed, so a commit touching a held doc cannot leak it. See workflow step 13.

The old warning here — that the wiki could not be cloned on Windows, because the page `Architecture:-Core`
has a `:` in its filename and NTFS forbids it — was true of a *local* clone and is irrelevant to how the
sync actually happens. The Action runs on `ubuntu-latest`, where that filename is legal. Verified
2026-08-05: six consecutive successful `Sync Wiki` runs, including the `BUILD 13.15.0` push. **Do not
attempt a local wiki clone on this machine; there is no reason to, and it will still fail.**
