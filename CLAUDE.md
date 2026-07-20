# Coffee Pub Blacksmith

Foundry VTT module (`coffee-pub-blacksmith`), and the **API hub** of the Coffee Pub suite — it declares
`"library": true` and the other modules consume it. Changing its public surface breaks siblings, so treat
the API as a contract, not internal code.

D&D 5e / Foundry v13 (`minimum: 13`, `verified: 13`, `maximum: 14`). Requires `socketlib` and `lib-wrapper`.

## Suite context

Sibling modules live next to this one in `Data/modules/` and are wired in as readable directories:
artificer, bibliosoph, cartographer, crier, curator, herald, minstrel, monarch, regent, scribe, squire, vault.
All are public repos under `github.com/Drowbe`.

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
- **Each module bundles its own compendiums.** Don't rely on cross-module content cohesion.

## No build, no tests

This is a plain no-build Foundry module — Foundry loads the ES modules directly. There is nothing to compile
and **no test suite, linter, or formatter**. Don't go looking for one, and don't add a build step casually.

The single exception: `npm run build:cm6` bundles CodeMirror 6 via `build-codemirror.mjs`. Its output
`scripts/vendor/codemirror.mjs` is **committed**, and CI does not rebuild it — if you change the editor
vendor entry, rebuild and commit the bundle yourself.

`utilities/` and `test-data/` are manual console scripts and fixtures, not an automated suite.
CI (`.github/workflows/release.yml`) only zips and releases on `v*` tags; it runs no checks.

## Documentation — there are only five kinds

This repo has repeatedly accumulated plans, migration guides, inventories, and "lessons learned" that
nobody deletes. **Everything that isn't one of these five is noise.** Don't create a sixth kind, and don't
add to a category by inventing a parallel file.

| Kind | Where | Audience | Rule |
|---|---|---|---|
| **Overview** | `README.md` (users), Home (devs) | README: someone deciding whether to *use* the module. Overview: a developer building *against* it. | Neither mentions architecture or internals. |
| **TODO** | `documentation/TODO.md` | us | **Single source of truth for what we will do.** When it's done, it is **deleted** from here and lives only in `CHANGELOG.md`. Never keep a done item "for reference". |
| **CHANGELOG** | `CHANGELOG.md` | everyone | What we did and fixed. Keep-a-Changelog + SemVer; long prose entries citing file paths. Match the existing style. **Code changes are the priority — be rigorous there.** Doc changes are nice to note but not the point: the docs themselves are what matter, and a reader can just go read them. A one-line mention beats a paragraph reconstructing the doc. |
| **Architecture** | `documentation/architecture/` | us, and the other Coffee Pub modules | How the module is built and why. **This is the anti-crawl artifact** — the place for things you can only learn by reading code. `architecture-blacksmith.md` is the map. |
| **API** | `documentation/api/` | anyone leveraging Blacksmith — mostly the other Coffee Pub modules, and Blacksmith itself | The public surface. Authoritative. Update it when you change the surface. |

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
    BUILD commit. See Git: BUILD now bundles the final docs + changelog + todo deletions + the bump.
13. **Sync the wiki — Claude.** Once the BUILD commit has landed the doc changes, Claude pushes them to the
    wiki (a pure mirror of `documentation/`). See the wiki note in Git — the mechanism is not solved yet.

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

**Settings** — `scripts/settings.js` (~259 `game.settings.register` calls, no `registerMenu`). Assign a
`group: WORKFLOW_GROUPS.*`. Names/hints are localization keys in `lang/en.json`.

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
`.claude/settings.json` should stay empty, since permissions there would apply to anyone who clones the repo.

Do not commit or push to the main repo unless asked. The author reviews diffs in Cursor and commits himself —
this covers both the milestone check-ins and the final release commit in the workflow above. Claude stages
reviewable changes; the author commits.

**Never bump the version in `module.json`.** The author bumps it and makes the release commit himself, after
his own final tests. **The `BUILD x.y.z` commit bundles the final doc updates, `CHANGELOG.md`, and todo
deletions together with the version bump** — one commit per release. (Changed 2026-07-17. It used to be a
*lone* single-change bump for a clean history marker; the author folded the final doc pass into it. Do not
"restore" the lone-bump rule — this supersedes it.) Claude writes the CHANGELOG entry and stages the final
doc changes; the author makes the BUILD commit and the tag.

**Releases are the author's.** Tagging (`v*` fires `.github/workflows/release.yml`), pushing the main repo,
and anything that publishes to GitHub are his. The workflow runs no lint, tests, or build — the tag is the
only gate.

**The wiki is Claude's to sync — after the BUILD commit.** The GitHub wiki is a **pure mirror** of
`documentation/`; the author writes nothing wiki-specific, so it never leads, it only follows. Once a BUILD
commit lands doc changes in the main repo, Claude pushes the same docs to the wiki.
> ⚠️ **Unsolved mechanical blocker.** The wiki is a bare git repo (`…coffee-pub-blacksmith.wiki.git`) that
> would not check out on Windows: at least one page (`Architecture:-Core`) has a `:` in its filename, which
> is illegal in NTFS, so a plain `git clone` of the wiki fails on this machine. The push path has to be
> worked out — sparse checkout, filename mapping, or generating the wiki files without a full checkout —
> before the first real sync. Do not assume `git clone …​.wiki.git && cp && push` works here; it doesn't yet.
