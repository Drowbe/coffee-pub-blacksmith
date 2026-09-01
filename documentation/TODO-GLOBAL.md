# TODO-GLOBAL — Coffee Pub cross-module cleanup

**Scope:** Work that spans more than one Coffee Pub module. Blacksmith-only tasks belong in
[TODO.md](TODO.md), not here.

**Why it lives in Blacksmith:** Blacksmith is the hub, so it's the natural coordination point. This file is
process tracking, *not* architecture — it is explicitly NOT a licence to document other modules' internals
here (see Ground Rules). `documentation/` is excluded from the release zip, so nothing here ships.

**Process:** when a task is done, add it to the owning module's `CHANGELOG.md`, then remove it from this
file. Same rule as `TODO.md`.

---

## Ground rules (decided)

1. **Blacksmith is the hub and must stay fast.** Features get extracted to their own modules; Blacksmith
   keeps shared infrastructure and the public API.

   **This rule runs in both directions** (amended 2026-08-09, by the author, who wrote the original).
   Extraction is the usual direction, but things move *in* as well, and a reader who sees only the first
   sentence will conclude that any addition to the hub was a mistake. Four moved in on 2026-08-09.

   The reason is structural rather than a matter of taste: **Blacksmith is the only module every sibling
   already requires.** So "reachable by every module" and "lives in Blacksmith" are currently the same
   statement. A tool parked in an optional module has exactly two outcomes -- nobody else can reach it, or
   everybody rebuilds it. Both had already happened; several modules had grown their own window handling.

   The test that separates the two directions:

   - **A tool is generic over Foundry or dnd5e data, and holds no opinion about why you are looking at it.**
     Dice tray, health, statistics, XP, status effects. Anything holding a token can want one. These belong
     in the hub, because the alternative is every module rolling its own.
   - **A feature encodes what a module is for.** Curator's image replacement, Regent's AI, Herald's
     broadcast, Squire's tray. These get extracted, however reusable a piece of one might look.

   Two things this rule does not license. It bounds *reachability*, not *volume* -- read as "anything
   reusable belongs in Blacksmith" it is a recipe for the god module `blacksmith.js` already is. And it is
   not a promise the hub keeps these forever: a shared "toolbox" module for the utility tools is a live
   idea, deferred rather than rejected.

   **If that toolbox is built, it has to be a required dependency of every sibling**, or Blacksmith has to
   re-export its surface and stay the front door. An optional toolbox recreates the original problem one
   module over. Deferring is cheap -- the migration machinery built on 2026-08-09 (per-scope settings
   adoption, position-key migration, `supersedes`, the window registry making an id an indirection rather
   than a location) makes moving a tool out the same operation as moving it in.
2. **A module's docs describe only that module.** Blacksmith documentation does not describe Curator's
   image replacement, Regent's AI, or Herald's broadcast. Those references get **deleted**, not relinked —
   a corrected cross-module link is still coupling.
   - Legitimate exception: showing how a *consumer* calls Blacksmith's API (e.g. "Squire registers a pin
     type like this"). That documents Blacksmith's surface, not the sibling's internals.
   - **The rule is directional** (amended 2026-08-07, after Bibliosoph argued it). Every example above is
     Blacksmith pointing *outward*, and that is the case it was written for; it was then misapplied to a
     satellite pointing *inward*, which is a different thing.

     | Direction | | Why |
     |---|---|---|
     | satellite → Blacksmith | **allowed** | Blacksmith is a required dependency of every satellite. The coupling already exists and is mandatory; a link only makes it legible. |
     | Blacksmith → satellite | refused | Couples the hub to something optional that may not be installed. |
     | satellite → sibling satellite | refused | Two optional things, neither guaranteed present. |

     `tools/wiki-sync.mjs` **enforces this rather than trusting it to memory**: `siblingWikiUrl` rewrites
     only when the target is the hub and the running module is not, so a copy of the script in the hub
     cannot emit an outbound link even by accident. Consequence: **Blacksmith's `PUBLISH` list is now a
     contract with the satellites.** A doc that leaves it, or is renamed, silently 404s every inbound
     link in the suite.
3. **A module bundles its own compendiums.** No relying on cross-module cohesion for content.
4. **Roll tables ship as shells unless we provide the data** — and a shell may only reference content we
   ship ourselves, or SRD/system content every user has. Never paid/licensed third-party modules.
5. **Docs must reflect the actual code.** A doc claim is not true because it was true once. Verify names,
   paths, and versions against the filesystem before publishing. Evidence this isn't hypothetical: §4.3 of
   `architecture-blacksmith.md` carried 8 pre-rename filenames; §7's CSS list named 5 stylesheets that
   don't exist; the wiki's Home page advertises v12 support for a v13-minimum module.
6. **The wiki is a pure mirror of the repo docs. The repo is law.** Nothing is authored wiki-first. A page
   with no repo source is a bug, not content.
7. **Docs first**, then packs, then tables.

---

## Handed over from Squire (2026-08-31)

Six items Squire removed from its own TODO under the cross-module rule. Restated from Blacksmith's
vantage rather than pasted -- Squire's framing was correct for Squire and is backwards once the item
is ours. Two line references were wrong and are corrected here; both defects are real and I confirmed
them in the source before recording them.

- [ ] **`api.inventory` has no GM-routing escape, so every write fails for a non-owner**
      (`scripts/api-inventory.js`). Confirmed: zero occurrences of `requestGM` in that file, against
      two in `api-pins.js`. The precedent is our own -- `pins.requestGM('create', ...)` already solves
      exactly this shape. With `requestGM` on inventory, a consumer needs no permission checks at all,
      only the approval experience. What it blocks today: player-to-player currency transfer, since
      `transferCurrency` requires ownership of BOTH actors, so it works for a GM or for one player
      moving coins between their own characters and not otherwise. Squire has published this as a
      known issue describing only the behaviour a user hits, per the boundary rule; when this lands,
      that entry moves to their CHANGELOG. Verified by: a non-owner completes a transfer.

- [ ] **`ui-journal-encounter.js:361` reads the bare `JournalSheet` global** --
      `Object.values(ui.windows).find(w => w instanceof JournalSheet && ...)`. Deprecated since v13
      and REMOVED in v15, where it becomes a hard `ReferenceError` inside a hook that fires on every
      journal-page write. Needs `foundry.appv1.sheets.JournalSheet`. `ui.windows` on the same line
      and again at `:377` is separately v13-deprecated in favour of `foundry.applications.instances`.
      **Squire reported this at `:378`, which is a false positive** -- that line is a
      `w?.constructor?.name === 'JournalSheet'` string comparison and is safe. The real one is `:361`.
      Verified by: the encounter injector still runs on a journal render under v14.

- [ ] **Pin renderer leaks an element when an unplaced pin is deleted** (`scripts/manager-pins.js`,
      the `loc.location === 'unplaced'` branch of `delete()`, around `:2310`). Confirmed: that branch
      removes the data and returns, while the `scene` branch immediately below it calls
      `PinRenderer.removePin(pinId)`. Squire cited `:2267`; the line has moved but the defect is
      exactly as described. Fix the asymmetry regardless of whether it causes the symptom below.
      Verified by: deleting an unplaced pin leaves no entry in `PinRenderer._pins`.

- [ ] **Investigate a pin vanishing from a scene's flag list without its element being removed.**
      Squire reproduced this live before dropping pins entirely: after a pin/unpin/re-pin cycle as GM,
      `PinRenderer._pins` holds an element for an id present in neither the scene flags nor the
      unplaced store, so `loadScenePins` logs `updateAllPositions: No pin data for <id>` forever and
      the new pin flickers and disappears. They verified with before/after console dumps that the
      scene list is byte-identical and every id in it resolves, so the leak is renderer-side. Their
      suspicion, unproven: a read-modify-write race on `scene.setFlag(FLAG_KEY, ...)`, since both
      `unplace()` and `delete()` read the list, filter, and write it back -- a stale read would
      clobber a concurrently-added pin. Root cause UNCONFIRMED. Affects any consumer that unplaces.

- [ ] **A throwing card action handler is logged and swallowed** (`bindCardActions`). Continuing is
      right for card robustness, but a handler that retires the card and then throws leaves the card
      asserting success, and that is how a broken GM-approval leg went silent in Squire. Either
      surface the throw or give consumers a "this action failed" path. Verified by: a handler that
      throws after mutating leaves the card showing failure rather than success.

- [ ] **Promote the shared tool-window row and section components out of Squire and Curator.** The
      vocabulary now exists three times: Curator's Loot window, Squire's `styles/window-tool-shared.css`,
      and partially our own `styles/window-list.css`. Squire's copy matches Loot's measurements by
      hand, which is the interim step -- two files that agree because somebody copied numbers will
      disagree the first time either is touched. `.blacksmith-list` already covers the plain row and
      `.blacksmith-entity` the selectable one. Missing: the **section** (bordered box, uppercase accent
      heading, optional count pill, head-actions slot), the **height chain** that lets a capped
      resizable tool window scroll rather than grow, and a **drawn checkbox** so multi-select rows stop
      inheriting Foundry's theming of bare inputs. Less clearly general, decide separately: `-note` /
      `-banner` copy styles, the coin strip (may belong to whoever owns currency), and the totals rule.
      Verified by: Squire's `window-tool-shared.css` shrinks to nothing and is deleted.

- [ ] **Co-sign the dnd5e `updateEncumbrance` upstream report after the v14 migration.**
      `Actor5e#updateEncumbrance` is an unguarded check-then-create against a fixed effect id, so any
      two writes to one actor can collide. The prepared report is below in this file; filing was
      deferred because a report against a system version this world cannot run earns "upgrade and
      retry". Squire has offered to co-sign. `enableEncumbranceGuard` mitigates it meanwhile.

---

## Documentation: who decides

**One session owns the documentation standard and the publishing tooling at a time, and arbitrates
when instructions conflict.** Settled by the author 2026-08-31, after a satellite received opposite
instructions from two hub sessions about whether to copy `check-docs-structure.mjs` -- one of them
relaying advice that had been correct an hour earlier and had since expired.

How it works in practice:

- **A defect in a copied file is fixed in the hub, never patched locally.** A satellite that needs a
  per-module edit to `wiki-sync.mjs`, `check-docs-structure.mjs`, `tools/.gitignore`,
  `.gitattributes` or `sync-wiki.yml` has found a portability bug. Report it and re-copy. This rule
  is the reason the pilot produced twelve fixes instead of twelve forks.
- **Relayed instructions expire.** Advice passed between sessions carries no timestamp and the suite
  moves in hours. A satellite receiving two conflicting instructions should do what Artificer did:
  take the more conservative branch, act on neither silently, and ask which is current.
- **The standard is amended in the hub and published from there.** Satellites link to it, so an
  amendment reaches all fifteen the moment it is pushed. Nothing propagates and nothing needs syncing.

What the owning session does NOT decide: whether files in another module are deleted (that module's
author), what goes on a public README in the author's voice, and when anything is committed, tagged,
or pushed. Those are the author's, and a peer asking for them is not authorisation.

---

## Suite-wide documentation standard — roll out to all 14 modules

**Decided, and Blacksmith is now conformed to it.** The standard is
`global/global-documentation-standard.md` — folder layout, naming, the document kinds, what publishes, the
README product page, and the CHANGELOG/plan/TODO/testing rules, for the whole suite. It supersedes the
documentation sections of every module's `CLAUDE.md`.

What Blacksmith has that the satellites do not yet: user guides as a kind, `global/` for suite-wide
knowledge that satellites **link to rather than copy**, publication by folder membership plus a HOLD map,
a publisher that derives its identity from `module.json`, and `tools/check-docs-structure.mjs`.

Rollout order matters: the publisher and checker are copied unchanged, so they had to be right in the hub
before any satellite took them. They now are.

**Four decisions, settled by the author 2026-08-31:**

1. **`coffee-pub-prototype` becomes its own GitHub repository.** It currently sits tracked and public inside
   Blacksmith's repo, where its `.github/workflows/release.yml` can never fire (GitHub only runs workflows
   from a repository root) and its declared `url` 404s. Splitting it fixes both.
2. **Blacksmith is conformed first, the prototype second.** The template gets copied from a shape proven on
   a real module rather than one designed in the abstract. The thirteen satellites follow the prototype.
3. **The ApplicationV2 example becomes a working example window in the prototype**, not a code block pasted
   into a document. The pasted version had already rotted -- it cites `styles/window-skills.css`, which is
   not in the repository, and a path `documentation/example-applicationv2-window/` that has never existed.
4. **Consequence of 1 and 3 together:** once the prototype is its own repository, Ground Rule 2 forbids
   `api-window.md` from linking to that example. So the example lives in the prototype as runnable proof,
   and the API doc points at a real Blacksmith window for the contract. Neither points at the other.

- [ ] **Write Blacksmith's user guides AFTER the satellites migrate** (decided by the author
      2026-08-31). Blacksmith's are the weakest in the suite and the job is large, so it does not
      block the rollout. A user guide says how to USE the module, not what it is: how to work the
      combat bar and what each action does, that initiative can be dragged to reorder, how encounter
      CR is calculated and where it shows on the canvas, how a vote runs and what players see, how
      the movement modes change what a player can do, and what every control in the roll window is
      for. `userguide-getting-started.md` exists but is an inventory of the interface written from
      source, never walked in a running world, and the product screenshot already contradicts its
      central table -- the bar's labelled buttons are not the six tools it lists, and it omits the
      combat readout row entirely. Treat it as a draft to be replaced, not a base to extend.
- [ ] **Write `userguide-settings.md` after the settings rebuild, not before.** Deferred by the author
      2026-08-31: a guide to 260 controls that are about to change is waste that reads as authoritative.
      It documents the on-screen labels and never edits them — `lang/en.json` is product copy, not doc
      source. `userguide-getting-started.md` is written; it is a draft derived from source and still
      needs walking in a live world.
- [ ] **Split `coffee-pub-prototype` out into its own repository** (decision 1). It is 12 tracked files in
      Blacksmith's root — module.json, README, CHANGELOG, LICENSE, scripts, styles, lang, its own
      documentation, and a release workflow that cannot fire where it sits. Preserve its history when
      extracting rather than copying files. It does not ship today (Blacksmith's zip uses an explicit
      include list), so nothing about the release changes. Verified by: its release workflow runs, its
      `module.json` url resolves, and Blacksmith's zip is unchanged.
- [ ] **Build the standard into the prototype once Blacksmith is conformed** (decision 2). Five folders,
      `assets/`, the publisher, the checker, stub docs, and a product README, plus `SETUP_PROMPT.md`
      updated so a scaffolded module is born conformant. This is the leverage point: every module created
      after it is free, and only the fourteen existing ones need retrofitting.
- [ ] **Roll out to the fourteen satellites** — the folders, the two publisher files, the checker, a
      `home.md`, a product README, and a getting-started guide each. Each README carries the
      AI-assistance disclosure verbatim between its `global:ai-assistance` markers, copied from
      `global/global-ai-assistance.md`; the checker fails if a copy drifts. Delete each satellite's forked copies
      of hub documents outright rather than folding them into `api/`: five carry a `blacksmith-apis.md`,
      one module has two of them, and Artificer additionally forked the ApplicationV2 guidance doc that
      Blacksmith has since dismantled. All of them have diverged. A fork folded under a tidier name is
      still a fork. Verified by: each module's wiki has a Home and a User guides
      group, and `node tools/check-docs-structure.mjs` passes in each.
- [ ] **Strip the duplicated documentation rules from each module's `CLAUDE.md`** and point at the standard
      instead. Leave code conventions, traps, and pointers.
- [ ] **Re-check the Wiki section below before working any of it.** Several of its items — the publish path,
      the sidebar, mirror scope, the Home page — were overtaken by the automated publisher and are stale.

---

## Phase 1 — Documentation cleanup (do first)

### Verification status — read this before trusting any doc

**Verified against code: 2 of 13 architecture docs, 16 of 16 API docs.** The architecture docs are
still assumption.

**All 16 API docs were audited against source on 2026-07-17** and corrected. **Every single one
contained at least one thing that could not work.** Not one was clean. See `CHANGELOG.md` for the
full list; `documentation/TODO.md` holds what was found but deliberately *not* fixed.

Two things worth carrying forward:

1. **The dogfooding rule held again, without exception.** Every API surface Blacksmith does not call
   on itself was broken: `list({includeHiddenByFilter})` (every internal caller passes the flag
   explicitly, so only the documented call hits the inverted default), `registerToolbarTool`'s
   `onClick` contract, hook `context` stats, `createJournalEntry`'s return, native socket `emit`.
   Meanwhile the menubar API — which Blacksmith self-registers through — was fine.
2. **"The doc is wrong" is a bad default.** `ICONSHIELD` was dismissed as a phantom; the icon was
   real and the *data* was missing a field — the only such gap in 183 asset records. The volume
   constants were the same shape. **When a doc and the code disagree, find out which one is lying.**

**Coverage is not uniform.** `api-pins.md` (2,200 lines) had ~100 symbols checked but real gaps —
`reconcile()` internals, the GM tag mutators, the schema migration chain, and most Manage Pins UI
claims are **unverified**. Recorded in `documentation/TODO.md` so silence isn't mistaken for a
clean bill of health.

The 2026-07-16 sweep audited docs for **sibling coupling** — is another module's architecture leaking in.
That is *not* an accuracy audit, and the two were conflated for most of that session. Where accuracy has
actually been checked, the hit rate is dire: **both architecture docs checked were wrong** — one credited
Blacksmith with six tools that had moved to Regent, the other was missing an entire shipped subsystem.
Two more were then found to be fiction (`architecture-socketmanager.md`: 30 of 30 documented symbols do not
exist) or 64% pasted source and dead planning (`architecture-hookmanager.md`).

**Do not assume the API docs are the accurate baseline.** Counter-evidence is in this repo's own history:
`api-sockets.md` correctly specified `emit(..., {userId})` targeting and **the code silently ignored it**
until a consuming module hit it in production (CHANGELOG 13.8.5). So when a doc and the code disagree here,
**decide which is right** — the doc is sometimes the spec and the code is sometimes the bug.

| Doc | Verified? |
|---|---|
| `architecture-pins.md`, `architecture-blacksmith.md` (§3/§4/§5/§7/§9A/§9B/§10) | yes, 2026-07-16 |
| `architecture-token-naming.md` | yes — written from code |
| `api-pins.md` | partially — checked as a baseline for the pins rewrite, not audited end-to-end |
| all other architecture docs | **audited, all substantially wrong — not yet fixed** |
| all other API docs | **audit in progress** |

### Remaining

**Plans are scaffolding** (see CLAUDE.md): transitional, dismantled into TODO/architecture/API/CHANGELOG,
deleted when complete. Three rules — a plan declares its status; a plan is never a source of truth; complete
means delete. **One plan needs dismantling; two are legitimately live** (`migration-v14.md`,
`plan-journal-tools-refactor.md` — both Planned, both keep).

- [ ] **`plan-assets.md` (1,569 lines)** — status line added 2026-08-07 (Planned); the rest of this item stands. Trim the Vault feature spec (~1502–1515)
      to the one sentence stating a rule about *Blacksmith's* API contract; keep §3 and "Working role of
      Blacksmith core", which are legitimate boundary decisions. Then decide whether the rest folds into
      architecture. **Needs the same code-verification pass `plan-pins.md` got** — that one turned out to be
      not just stale but actively misleading, and this is six times the size.
- [ ] **Rename the two remaining docs whose names lie.** They're named "migration" or version-stamped while
      documenting current, shipped behavior; the stamps make correct docs read as obsolete.
      - `resources/guide-chat-card-migration.md` — this migration is *ongoing*, not done. Drop the Crier lessons
        section (4 of its 5 bullets duplicate Best Practices), rename away from "migration".
      - `resources/developer-note-pin-editing-visibility.md` — drop the "13.7.6" framing; consider merging into
        `guide-pins-integration.md`, which it overlaps heavily.
- [ ] **Audit the rest of `architecture/architecture-blacksmith.md`.** §4.3/§5/§7, its doc links, and the
      new §9A/§9B were verified against the filesystem; the other sections were never checked.
- [ ] **Verify doc-claimed filenames across the remaining architecture docs.** §4.3 alone carried 8
      pre-rename names, and `architecture-toolbarmanager.md` credited Blacksmith with six of Regent's tools.
      The `manager-*`/`ui-*`/`window-*` rename left drift that nobody swept. `architecture-pins.md` and
      `architecture-blacksmith.md` are now verified; the other ~10 are not.

#### Clean — no action

`api/api-tags.md` (22 refs, all textbook), `api/api-sockets.md`, `api/api-create-journal-entry.md`,
`architecture/architecture-tags.md` (8 refs, all clean), `TODO.md` (image-replacement backlog items are
correctly hedged as out-of-scope), `primers/primer-registering-with-blacksmith.md`, plus `api-stats.md`,
`api-campaign.md`, and `architecture-chatcards.md` (zero real sibling references — the `scribe` grep lied).

---

### Wiki

**Decided:** the wiki is the official doc hub for consumers and is a **pure mirror** of the Blacksmith repo
docs. **The repo is law.** Nothing is authored wiki-first.

**Reality check:** the wiki is not a mirror today — most pages have drifted from their repo source, several
have no repo source at all, and one is a duplicate published to the wrong filename.

> **Don't trust a count written here — re-measure.** Any snapshot of "how many pages match" is stale the
> moment anyone edits a doc. It was audited as 13-of-25 exact on 2026-07-16; a few hours of doc cleanup that
> same day dropped it to 8, because **editing a repo doc silently drifts its wiki page.** That decay *is*
> the argument for automating the mirror: a manual mirror can't track a repo that changes. To re-measure,
> hash each wiki page (`git clone --bare` + `git show HEAD:<page>`) against every `documentation/**/*.md`.

- [ ] **Write a mapping manifest** (repo path → wiki page) and check it into the repo, so the mapping is
      law rather than guesswork. **The mapping is NOT derivable from filenames** — `API:-Core-Blacksmith`
      ↔ `api-core.md`, but `Architecture:-Core.md` actually mirrors **`architecture-blacksmith.md`**
      (its first line is "Blacksmith Module Overall Architecture"), not `architecture-core.md`. A script
      that guesses by name will publish the wrong content — plausibly how the mis-publish below happened.
- [ ] **Delete `API-OpenAI-DEPRECATED.md`.** It is **byte-identical to `api-toolbar.md`** — a duplicate of
      the Toolbar page published to the wrong filename, not a stale OpenAI page.
- [ ] **Delete `Image-Replacement-Architecture.md`** — Curator's domain (Ground Rule 2).
- [ ] **Republish every drifted page from the repo.** Repo is law, so this is mechanical once the manifest
      and publish path exist — don't hand-fix pages. Long-drifted as of the audit: `API:-Request-Roll`,
      `API:-Window`, `Architecture:-Core`, `Architecture:-Hook-Manager`, `Socket-Manager`, `Todo`. Newly
      drifted by the 2026-07-16 doc cleanup: `API:-Canvas`, `API:-Core-Blacksmith`, `API:-GM-Notes`,
      `API:-Hook-Manager`, `API:-Menubar`, `API:-Pins`. Expect this list to grow with every doc change until
      publishing is automated — re-measure rather than trusting it.
- [ ] **Delete `API:-Migration-Supplement.md` from the wiki.** Traced: it was `documentation/migration-api.md`
      (added 2025-08-30), later `bestpractices-api.md`, **deleted 2026-01-16** in a commit explicitly
      described as *"eliminating obsolete content that is no longer relevant."* The wiki copy is a stale
      2025-09-01 snapshot of it (13,710 chars vs the repo's final 14,247). Already judged obsolete — don't
      recover it.
- [ ] **Decide `Get-Started-AI-Prompt.md`** (1,884 chars, last touched 2025-11-10). **It never existed in
      the repo** — no commit in all of Blacksmith's history contains its text, so it is genuinely
      wiki-authored. Repo is law → either recover it into `documentation/` or delete it. (Possibly related
      to the 38 prompts in `prompts/`.)
- [ ] **Give the wiki a real Home, sourced from the repo.** `Home.md` exists (3,379 chars) but has **no
      repo source and has rotted**: last touched 2025-08-30, it tells users *"FoundryVTT: v12 supported;
      v13-ready design"* when `module.json` is `minimum: 13, verified: 13, maximum: 14`, and calls the
      module "system-agnostic" when it targets dnd5e. **The public front door of the docs is wrong.**
      Proposal: map `README.md` → `Home.md`. README is already user-facing and stays current because it
      ships.
- [ ] **Decide `_Sidebar.md`.** GitHub wiki navigation with no natural repo source. Either generate it from
      the manifest or accept it as the one sanctioned wiki-only exception.
- [ ] **Decide mirror scope — the one decision blocking everything else here.** Most repo docs have no wiki
      page; guides, plans, design-system, and most architecture docs are unmirrored. Folder is a **bad proxy
      for audience**: `api/` is all consumer, but so are `primers/primer-registering-with-blacksmith.md`
      (the integration tutorial), the pins/chat-card guides, `applicationv2-window/`, and
      `design-system.md` (§12 is literally "How Child Modules Extend Blacksmith") — while `architecture/`,
      `plans/`, and `TODO*.md` are contributor-only. So "mirror `api/`" would drop the best consumer docs,
      and "mirror everything" publishes the task list. That's what the manifest is for.
      Note `architecture/architecture-token-naming.md` is new (2026-07-16) and has no wiki page.
- [ ] **Build the publish path.** The wiki **cannot be checked out on Windows** — pages are named
      `API:-Pins.md` and `:` is illegal in NTFS. Clone succeeds, checkout fails. Must go through bare-repo
      git plumbing (verified working: `git clone --bare` + `git show HEAD:<page>` reads fine).
      **Publishing is public: never push without explicit per-push approval.**
- [ ] **Decide whether `TODO.md` belongs on the wiki at all.** The wiki's `Todo.md` is titled "TODO -
      Memory Leaks and Performance Issues" vs the repo's "TODO - Active Work and Future Ideas" — it's an
      old snapshot. Repo is law, so it's either republished or dropped from the mirror. (A consumer-facing
      doc hub arguably shouldn't carry an internal task list.) **`TODO-GLOBAL.md` must never be mirrored.**

## Phase 2 — Packs / compendiums — **DONE, shipped in 13.9.0**

**A compendium is not part of a module.** It's a pack of documents that exists on its own; a module *may*
ship one, but that's a packaging choice, never ownership. Blacksmith now bundles none — not in `module.json`,
not in the release zip, and `packs/` is gitignored. Users already select their own in settings. If we ever
provide content again, we bundle it deliberately, and it isn't part of Blacksmith unless we choose that.

Kept here because it's the rule, not because it's outstanding. Details in `CHANGELOG.md` [13.9.0].

**Open, for Artificer — not Blacksmith:**

- [ ] **Artificer declares 8 packs but has 17 directories on disk** — `beverages`, `blueprints`,
      `containers`, `food`, `ingredients`, `objects`, `poisons`, `potions`, and `recipies` (typo'd, next to
      the declared `recipes-blueprints`) are all undeclared. Whatever pack pattern the suite adopts should
      make that drift impossible. Also revisit the "add more and more pack info to make builds pass" habit —
      believed to be 5-year-old cargo cult.

## Phase 3 — Roll tables

**Resolved for Blacksmith by Phase 2.** The injury/fumble/crit/investigation tables live in
`burden-of-knowledge`'s `bok-roll-tables` (`Fumbles`, `Critical Carnage`, `Investigation: *`), which is the
author's live campaign — and modules point at them through Blacksmith's compendium settings. That's the
intended model working: compendiums exist independently, modules select them. Nothing to migrate.

The cautionary tale, kept because it's the reason Ground Rule 4 exists: the old `blacksmith-tables` pack was
loot/merchant content whose **30 of 30 results were document references** — pointers into the paid D&D DMG
module and into the author's own campaign. It only ever resolved on one machine. A shell is only as good as
the compendium it points into.

- [ ] **Write down the shell rule** (Ground Rule 4) as a documented, checkable convention, so that *if* we
      ever bundle tables again we don't ship pointers into content we don't control.

### Bibliosoph — injuries rebuild (IN PROGRESS as of 2026-07-16)

Being rebuilt, not ported — the old pack data is reference material at most.

- [ ] **Migrate injuries to flags** rather than compendium documents.
- [ ] **Add a creation form** for authoring injuries.
- [ ] Bibliosoph declares **zero packs** and has no `packs/` directory. Decide whether the rebuilt system
      needs a bundled compendium at all, or whether flags + a form make one unnecessary — which would be the
      cleanest outcome and would make Bibliosoph the first module to satisfy Ground Rule 3 by construction
      rather than by cleanup.

---

## Decided 2026-08-09 — Notes to Blacksmith, Codex and Quests to Librarian

Squire is being dismantled. Where each piece lands is settled; the reasoning is here because it is the part
that gets relitigated.

**Codex and Quests go to Librarian** (a module that does not exist yet). Codex is a lore brain whose system of
record is Obsidian — a densely interlinked knowledge graph, imported here rather than authored here. Quests
are the same kind of thing. Both are campaign content: they encode what the module is *for*.

**Notes go to Blacksmith.** A note is not campaign content. It is what a player writes in play — "we need to
get that thing in that place" — and it is about things Foundry already owns.

### The discriminator, because "it feels shared" is not one

**Owning a document subtype means owning a domain. A surface over core documents does not.**

Codex declares `documentTypes: { JournalEntryPage: { codex: {} } }`, so its entries are
`coffee-pub-librarian.codex` with their own data model and sheet. It is a *kind of thing*. Notes writes plain
`type: 'text'` pages — it is a *view*. Pins, Tags, and GM Notes are all views over core documents and all
already live in Blacksmith; none declares a subtype.

This is also why **Blacksmith declares no document subtypes, ever**. That is now a rule rather than a
coincidence, and the import/export phase depends on it — see `TODO.md`.

### Notes must not arrive as a fourth annotation system

Blacksmith already has "note to anything": `GMNotesAPI` attaches rich text to any Document by UUID, with a
section registry so several modules contribute to one document's note without clobbering each other. Squire's
Notes is the other direction — the note *is* a document, with tags and pins, that references targets.

Landing this as `api.notes` beside `api.gmNotes` would give the hub two overlapping annotation systems, each
with its own storage and its own idea of what a note is. The shape to build instead is **one relationship,
several views**:

- a **note** is a document
- an **annotation** is a link from a note to a target
- `gmNotes` is the *notes about this thing* view
- the Notes window is the *the note itself* view
- a **pin** is the *note on the canvas* view — already true, and why Squire's `manager-pins.js` is 2,325 lines
  of wrapper around Blacksmith's pins API

Cartographer is the consumer that proves the model: it already has a hand-rolled annotation system —
freehand markup plus tooltip text anchored to a map region. That is the same primitive with a third anchor.
Document, canvas point, map region.

### The gate — apply it before shipping, not after

**If Notes is a fancy journal, it is nothing.** Foundry journals already exist and are better suited to
narrative and GM authoring than anything we would write. The value has to be in the relationship, not the
document.

The test: **can any surface ask "what is attached to this thing" and get an answer?** If the design cannot do
that — from an actor sheet, a canvas point, a map region, a compendium entry — then it is a journal page with
extra steps and should be abandoned rather than shipped.

`utility-base-parser.js` is shared by Squire's Notes and Codex today. Do **not** hoist it to Blacksmith
pre-emptively: if Notes converges on the annotation model it may not survive the move at all, and Librarian
can simply take it.

## Squire tool adoption — Squire's half (Blacksmith side shipped and verified 2026-08-09)

Dice Tray, Macros, and Health now live in Blacksmith. **The functional pass passed on 2026-08-09** — all
four tools verified in a live world with Squire disabled, per `testing/squire-tool-adoption.md`, which also
records what is still owed on the presentational side. **Squire is cleared to delete its copies.**

Squire:

1. Deletes `panel-dicetray.js`, `window-dicetray.js`, `panel-macros.js`, `window-macros.js`,
   `panel-health.js`, `window-health.js`, their three templates, and their five stylesheets.
2. Removes the menubar and window registrations for the three tools from `squire.js`.
3. Removes the settings that moved (`diceTrayShowRecentRolls`, `userMacros`, `userFavoriteMacros`,
   `showHealthMenubarTool`, `healthAdjustmentAmount`, `healthThresholdInjured` / `Bloodied` / `Critical`)
   and the three dead ones Squire confirmed (`showMacrosPanel`, `showHealthPanel`, `showDiceTrayPanel`).
   Keeps `showHandleHealthBar`, which drives its own tray handle.
4. Replaces `getHealthbarStatusClass` (`helpers.js:97`) with Blacksmith's severity function, mapping the
   returned string to its own `squire-tray-healthbar-*` class names at `manager-handle.js:75` and
   `panel-party.js:73,619`. Surface and severity vocabulary: `api/api-health.md`.
5. Removes the dead favourites context-building at `manager-panel.js:414,490`.

One optional thing on Squire's side: **the conditions button on health rows does not render until some
module registers a window under the id `blacksmith-status-effects`.** Blacksmith has no conditions editor
and will not name Squire's window id; the id names the capability instead, exactly as menubar intents do.
Squire's status effects window can claim it by registering under that id as well as its own.

## Roll outcome API — sibling adoption (Blacksmith Phase 1 shipped)

Blacksmith exposes `module.api.rolls` and `blacksmith.rolls.*` hooks for crit/fumble/hit/miss/success classification. **Request Roll** (`openRequestRollDialog`) is unchanged on `module.api` top-level.

**Blacksmith docs:** `documentation/api/api-rolls.md`, `documentation/plans/plan-rolls-classification.md`

**Not in Blacksmith:** Query Tool (`window-query.js`) — lives in **Regent**. Regent integrates via public API only.

### Bibliosoph (primary consumer)

Uses today: `openRequestRollDialog`, `api.compendiums` (awareness / quick encounters), `blacksmith.requestRollComplete`.

- [ ] Subscribe to `blacksmith.rolls.skillCheckResolved` / `attackResolved` for crit, fumble, injury tables, reactions ("Big Hit!")
- [ ] Replace or supplement `requestRollComplete` handlers where classification fields are needed (`isCritical`, `success`, `dc`)
- [ ] Wire auto-injury / massive-damage rules to hooks (moves "Auto-Roll Injury" out of Blacksmith `TODO.md` BACKLOG)
- [ ] Verify blind/private rolls do not leak outcomes to players
- [ ] **Initiative nat-20, once Blacksmith emits it.** Blacksmith is adding initiative as a rolls kind so a house-rule toast/card can fire on a natural 20 (`documentation/TODO.md`, opened 2026-08-27). Do not detect initiative locally — that is the second detection site `api-rolls` exists to stop. Subscribe when the kind ships; until then there is nothing to adopt.

### Regent

- [ ] Query window roll flows: use `openRequestRollDialog` from Regent's `window-query.js` (not Blacksmith)
- [ ] Optional: `rolls.classify(message)` for skill lookup results already in chat

### Blacksmith (remaining internal work — tracked in `TODO.md`)

- [x] Phase 2: migrate `manager-rolls.js` d20 duplication; fix cinema DC 10
- [x] Phase 3: emit `attackResolved` from core dnd5e chat + optional MIDI (`manager-roll-outcomes.js`)
- [ ] Phase 3 follow-up: stats-combat dedupe consolidation (optional; stats lane unchanged)

---

## Announcement themes removed — Crier and Artificer (2026-08-14)

Blacksmith no longer has `announcement-green`, `announcement-blue` or `announcement-red`, nor
`postAnnouncement()`, `getAnnouncementThemes()`, `getAnnouncementThemeChoices()` or
`getAnnouncementThemeChoicesWithClassNames()`. Each theme now has a `-dark` partner that fills
only the card header; the three announcement grounds survive as the `-dark` grounds of blue,
green and red.

Neither sibling crashes. Both need a small change to look right again.

- **Crier** — observed live 2026-08-14: `TypeError: chatCardsAPI.getAnnouncementThemeChoicesWithClassNames
  is not a function` at `scripts/settings.js:32`. It is inside a try/catch, so nothing crashes; it falls
  back to a hardcoded list of the three old class names, which no longer exist in CSS, and round and
  combat cards render with no theme at all.

  Five edits, then a sixth that is the one that actually matters:

  | Where | Change |
  |---|---|
  | `settings.js:32` | `getAnnouncementThemeChoicesWithClassNames()` → `getCardThemeChoicesWithClassNames()` |
  | `settings.js:44-46` | fallback list → `theme-green-dark`, `theme-red-dark`, `theme-blue-dark` |
  | `settings.js:112`, `:180` | `default: 'theme-announcement-green'` → `'theme-green-dark'` |
  | `crier.js:977`, `:1063` | the `getSettingSafely` fallback argument, same swap |

  **None of that repairs an existing world.** A default applies only when nothing is stored, and any
  world configured before today has `theme-announcement-green` SAVED. `mapRoundCardStyleToTheme`
  (`crier.js:926-929`) passes anything starting with `theme-` straight through, so the dead class reaches
  the card untouched. Normalise there — map `theme-announcement-{green,red,blue}` to
  `theme-{green,red,blue}-dark` on the way through — and every stored value is repaired without a
  migration script. Every path already goes through that function.

  Blacksmith cannot help from its side: Crier applies the class to its own template, so there is nothing
  for the card API to resolve.
- **Artificer — DONE (2026-08-15).** Migrated outright rather than patched: all seven posting sites go
  through `chatCards.post`, both `card-results-*.hbs` templates are deleted, the `gather-result-*` CSS is
  gone, and no `getThemeClassName` / `getTheme` calls remain. The announcement branch was deleted rather
  than migrated — all three callers passed `'card'`, so it had never executed even before the removal.

## Time-bound events across the suite (raised 2026-08-23)

**Blacksmith side planned, not started: `documentation/plans/plan-time-api.md`.** Nothing to adopt yet;
this entry exists so the siblings are asked *before* the surface is fixed rather than after.

Blacksmith is growing a public time surface -- `countdown` (a deadline with tick, pause, persistence and
fire-once), `schedule` (a wall-clock callback), and `session` (session start and end, already synced) --
alongside the existing `worldClock.schedule` for in-world time. The reason is the suite: every module that
wants a timer currently writes its own, and Blacksmith alone has five.

**What we need from the siblings, when the primitive is ready to review:**

- Which of you already run a recurring timer, and for what. A count is enough to start.
- Whether you want to draw your own countdown or want Blacksmith to. The plan currently assumes Blacksmith
  emits ticks and you draw, so it does not become a widget library -- say if that is wrong for you.
- Whether anything wants to schedule against **world** time rather than wall time. `worldClock.schedule`
  exists and is in-memory, which means nothing fires retroactively; if a consumer needs a moment that
  survives the world being closed, say so, because that is a different mechanism.

**The one thing that will not change:** world time and wall time stay separate calls. World time is
server-authoritative, moves in jumps, and runs backwards when a GM rewinds. Blacksmith has now made the
two-clock split twice internally (note reminders, calendar events) and will not collapse it in the API.

## Scene geography — Artificer and Minstrel (raised 2026-08-27)

Blacksmith is pulling scene-level location and geography into Scene Config. The design is in
`plans/plan-scene-geography.md`; the injector that unblocks it is tracked in Blacksmith's `TODO.md` as
"One Scene Config tab injector, registered like a toolbar tool". **Nothing to adopt yet**; this entry exists
so the handoff is named before the injector is built.

Habitat currently lives in Artificer's scene flags
(`flags.coffee-pub-artificer.scene.habitats`) and Minstrel reads that flag raw, gated on Artificer being
installed. Habitat-conditioned playlists therefore do nothing unless a harvesting module is present —
that is the ownership problem, and a raw cross-module flag read rather than an API call.

**Blacksmith has to ship the injector and the API first.** The last module to inject into
`renderSceneConfig` lost its tab between reloads to a render race against Foundry's `_replaceHTML`, so
there will be one injector that both Blacksmith's geography and Artificer's harvest tab use.

### Artificer

- Keep the twelve harvest-specific keys on its own flag (`componentTypes`, `harvestingSkills`, `enabled`,
  `profile`, DCs, gather spots, discovery). Those encode what Artificer is for.
- Hand `habitats` to Blacksmith's scene geography once the API exists. **Settled 2026-08-31: the vocabulary
  stays a closed twelve-value enum**, moved to Blacksmith and exposed as a constant rather than a registry.
  Nothing can be unknown if the list cannot grow, so the harvest-table fallback question is retired and
  Artificer no longer owes an answer on it. A registry, if a world ever forces one, is a later proposal.
- **Both open questions came back 2026-08-31, and both are settled.** Canonical case is **lowercase**, with
  every consumer normalizing at the boundary rather than trusting the stored form — Artificer's condition, and
  the right one: habitat is a join key there, not only a label, and item biomes stay uppercase and do not move.
  And the migration is a **hard cut at `ready`** with no read-through fallback, because a fallback would let a
  half-migrated scene report itself configured and gather against stale data.

**A new coupling lands with Artificer's hard cut, and it will look like their bug.** Once Artificer
refuses to initialise against a degraded Blacksmith, ANY bail-out in Blacksmith's `ready` takes Artificer
down with it -- visibly, and first in the author's own dev world, because that is where Blacksmith is
being iterated on. The report will arrive as "Artificer failed to start". It will not be an Artificer
fault: it is a Blacksmith bail-out surfacing through the consumer that chose to fail loudly rather than
run degraded. Check `BlacksmithAPI.readyStatus` and `readyFailure` before looking anywhere in Artificer.
This is the behaviour both sides chose deliberately -- see the readiness contract in `api/api-core.md` --
and it is recorded here so the first occurrence costs minutes rather than a debugging session.

**What Blacksmith now owes Artificer.** Both follow from the hard cut and are tracked in
`plans/plan-scene-geography.md`, Workstream 3:

- **The environment constant exposes `{key, label}` pairs**, not bare lowercase strings. Confirmed — Artificer
  renders the stored form as a user-facing label in three places, and a bare array would show GMs "underdark".
- **The version floor is `13.22.0`** (named by the author 2026-08-31). Artificer pins
  `relationships.requires[coffee-pub-blacksmith].compatibility.minimum = "13.22.0"`, which its empty
  `compatibility` block does not carry today, and deletes its own biome-vocabulary fallback once pinned.
  **Pin now, release after:** 13.22.0 is an intent until the author tags it, and a module pinning a
  minimum that does not exist yet will not activate against the installed 13.21.1. So the pin can land in
  a branch immediately, and Artificer's release waits on Blacksmith's.
- **A migration-complete signal that a degraded `ready` cannot fake.**
  Artificer's `module.json` `compatibility` block is empty today, and awaiting `BlacksmithAPI.waitForReady()`
  is not sufficient on its own — see the workstream for why. Artificer must not ship the hard cut before the
  floor exists.

**The item sheet soft-locks once the vocabulary is lowercase.** Raised by Blacksmith as a data-loss path and
corrected by Artificer, who were right: nothing is written. In `window-artificer-item.js` the render chain
compares stored biomes against the vocabulary case-sensitively at `:210-214` and `:215-219`, so every habitat
button renders off and the hidden field empties; `:619-622` then filters the same field to an empty array on
submit. The write never lands, because the Component-requires-habitat rule (`:631-641`, shipped in Artificer
13.2.0) catches the empty array, warns, and returns first. The empty write is unreachable in practice: it
needs a guard-less build (13.1.1 or earlier) *and* lowercase item data, and no shipping path produces both --
packs travel inside the module, and the case-sensitive import filter at `utility-artificer-item.js:346` means
lowercase JSON on an old build stores nothing rather than storing lowercase.

The result is a soft lock rather than corruption: every existing Component opens with its habitats apparently
unset and cannot be saved at all -- blocking a rename or any unrelated edit -- while the sheet advises
choosing a habitat that is already stored. Loud and reversible, but it stops Component authoring outright,
which is why the item-sheet reads are fixed before the join sites. A bad join only narrows a result set.

Worth recording because the near miss was structural: a validation rule written to reject bad JSON on import
turned out to be the only write barrier for a read bug three files away, and it was not written with case in
mind.

**One correction to Artificer's plan, and it shrinks their work.** Their compendium re-export is not a
release-window dependency. Normalizing both sides at the join makes stored case irrelevant, and it covers a
case the re-export cannot reach at all: the gather pool is built from compendium items **and** `game.items`
(`coffee-pub-artificer/scripts/cache/cache-items.js:375-378`), so components a GM imported into their world
before the migration keep their old case whatever the packs say. Normalize at the join first; re-export
independently, whenever.
- Register the harvest tab through Blacksmith's Scene Config injector rather than its own
  `renderSceneConfig`. That is what makes the race one problem instead of two.

**Scope is five read sites across three files, not the fieldset alone** (surveyed by Artificer
2026-08-31; the site list lives in their TODO and is not duplicated here). Two of the five are off the
tab entirely -- the gather settings path that feeds every gather, and habitat-based image resolution.
**Removing the fieldset without those leaves files reading a flag nothing writes any more, and both fail
silently**: gather finds nothing, the image resolver falls through to its "any" bucket. This is the fact
that matters for release planning, because it is what makes their side three files rather than one.

### Minstrel

Their whole change is in one function, `getSceneArtificerHabitats`
(`coffee-pub-minstrel/scripts/manager-automation.js:79-92`), and it **deletes** more than it adds.

- **Replace the body with `api.geography.getHabitats(scene)`.** The array/string branch becomes our
  `normalizeHabitats`, the `.toLowerCase()` becomes a no-op because our keys are already lowercase, and
  the sort is ours. Rename the function too -- it is no longer Artificer's anything.
- **Delete the `isArtificerAvailable()` gate** (`:81`, helper at `:673-675`). It returns `[]` whenever
  `coffee-pub-artificer` is not active, so today Minstrel's habitat-conditioned automation does nothing
  at all unless a harvesting module happens to be installed. **That is the user-visible bug this whole
  move exists to fix**, and it is the reason Minstrel is in this release window rather than following
  later.
- **Canonical case is Blacksmith's, and it is lowercase.** Nothing to negotiate; they already lowercase
  on read, so this is one more deletion.

**They are not affected by the checkbox-null defect, and should not go looking for it.** Their read is
`String(entry ?? '').trim().toLowerCase()` then `.filter(Boolean)`, so a `null` becomes `''` and is
dropped. The `[null, null, "FOREST", ...]` shape passes through cleanly -- no throw, no `"null"` string.
Verified in their source 2026-08-31, and worth stating because "we found corruption in the flag you read"
otherwise invites a search that finds nothing.

**VERIFIED 2026-08-31 with Artificer disabled.** `api.geography.getHabitats(canvas.scene)` returned
`['mountain','coastal','underdark']` on a previously-Artificer-tagged scene with Artificer off, and the
automation path was confirmed in the UI. Two things in that evidence beyond non-emptiness: the order is
vocabulary order rather than the alphabetical order their old reader produced, which proves the new
reader is live rather than a stale path; and all three keys survived the closed-vocabulary filter, which
proves the migration wrote canonical keys. This is the first live confirmation that the migration
produces correct data. Minstrel's remaining work is release mechanics only, and their call is
optional-chained end to end, so their timing is independent of ours.

**How it was tested, and why it had to be: with Artificer DISABLED.** The defect is invisible in any world where Artificer
is installed, which is presumably every world they have ever tested in. Verifying the change in such a
world proves nothing, because that world could never have shown the bug.

**How to verify, when it ships:** on a world with existing Artificer habitats, gather still yields the
same component families after migration. With Artificer disabled entirely, Minstrel's habitat automation
still fires. Export a migrated scene to a compendium, re-import it, and confirm environment survives.

## Librarian — tag API follow-ups (Blacksmith 13.20.0 shipped)

Three asks arrived as one gap and shipped as two things, on purpose. Librarian was right not to hardcode
context keys they do not own.

- **`api.tags.getTagCounts(contextKey)`** is the consumer surface: usage counts for one context, only
  tags that are in use. Build the codex tag cloud on it. A declared-but-unapplied taxonomy tag is
  absent, not present with `0` — that is `getChoices`, not this.
- **`utilities/audit-tag-registry.js`** is the GM housekeeping that is deliberately *not* on the API.
  Run it from a script macro; it sorts the registry into in-use, declared-but-unused, and unaccounted,
  and prints the delete command rather than running it. Do not build a consumer-side orphan check.

The pin-tag assignment rows that used to share Librarian's context buckets are gone as of the same
release. A production `getTagCounts('coffee-pub-librarian.codex')` should no longer need to sniff ids
to tell a pin row from a codex page.

**How to verify:** after the production tag migration, `getTagCounts('coffee-pub-librarian.codex')`
returns only codex-page assignments, and the audit utility's unaccounted list is empty or named
campaign tags rather than pin ids.

## Importer step 8 — Journal, and the three siblings it gates (raised 2026-08-31)

Blacksmith's journal importer is the last kind on a parser. The blocker for everyone is the same: pages are
created with a hardcoded `type: "text"`, so Blacksmith cannot construct a module-owned `JournalEntryPage`
subtype. Step 8 builds that seam. **Nothing below starts until it lands** -- the author's decision, so that
holding does not mean each sibling discovers the dependency separately.

### Bibliosoph — injuries (the seam's first real consumer)

Injury journals move to Bibliosoph. They own injuries as a system, they declare the subtype, and they are the
only sibling whose reader already ships. Blacksmith then deletes `buildInjuryJournalEntry`,
`templates/journal-injury.hbs` and its injury profile; theirs appears in Blacksmith's journal importer because
they registered it.

**The format does not currently match, and that is the point.** `window-injury-picker.js` reads a compendium
named by its own `injuryCompendium` setting, takes `journal.name` as the category, and requires each page to
carry `system.severity`, `.image`, `.odds`, `.tick` and `.statuseffect` -- skipping any page without
`severity`. Blacksmith writes `type: 'text'` pages holding compiled HTML, so **every page our injury import
creates is skipped by their reader today.** Their `module.json` declares
`JournalEntryPage: { injury, outcome, inspiration }`.

Two questions worth asking them BEFORE step 8, because both change what gets built:

- Their picker reads a **compendium**; the importer creates in the **world**. Does the injury profile need a
  compendium destination, or does a GM move them by hand? Undecided by anyone so far.
- Are the five system fields final? They become the declaration.

### Regent — encounter and narrative generators

**Held until the seam exists.** Regent is the only live consumer of Blacksmith's encounter journal builder,
through `api.createJournalEntry` on the API root rather than the import window
(`window-query.js:2009`, `:1598`).

The recommendation is NOT that Regent retires its generators. Their CR arithmetic, party/monster/NPC
worksheets, canvas drag-drop, difficulty setting, treasure and linked encounters are encounter DESIGN tooling
that Blacksmith does not do and should not. What Regent should stop owning is the **JSON schema block**, which
it hand-writes in two places (`window-query.js:2191` and `:2410`) -- replaced by
`api.importer.getAuthoringGuide('journal', profile)` composed with their own direction, which is the
`composesOwnAuthoring` pattern Roll Table and Actor already use.

Three defects found in Regent on 2026-08-31 while confirming usage, none yet reported to them:

- Its Narrative Wordsmith instructs the generator to emit `JOURNALTYPE: "Narrative"` (`:2242`), and Blacksmith
  now THROWS on NARRATIVE. **That path cannot work against current Blacksmith** -- two copies of one schema in
  two repos, exactly the divergence the importer exists to end.
- Its `INJURY` branch calls `buildInjuryJournalEntry(journalData)` (`:1603`), which is **imported nowhere in
  Regent**. A free identifier, so `ReferenceError` on first use. Dead on arrival.
- `api.createJournalEntry` is a legacy API-root surface Regent depends on. Step 8 either keeps it working or
  ships Regent a declared replacement in the same release.
- **Regent's four geography fields are dropped on every encounter import, silently.** Both its prompt
  templates instruct the generator to emit `sceneparent`, `scenearea`, `sceneenvironment` and
  `scenelocation` (`window-query.js:2191`, `:2410`). Blacksmith reads **none of those names** anywhere --
  the encounter builder reads `realm`, `region`, `site` and `area`. So the import succeeds, the journal is
  created, and its entire breadcrumb is missing. This is worse than the two defects above because both of
  those fail; this one reports success.

  **The mapping is a decision, not a lookup, and it is the author's.** Regent's own UI labels its
  breadcrumb `LOCATION > PARENT > ENVIRONMENT > AREA` against Blacksmith's `realm > region > site > area`,
  so positionally `scenelocation` is our realm, `sceneparent` our region, `sceneenvironment` our site and
  `scenearea` our area -- but `environment` mapping onto `site` is a guess, and environment is now a
  first-class geography concept of its own with a closed vocabulary. Declaring the Encounter profile needs
  this settled: the four accepted spellings become `acceptsKeys` on the declared fields, which is exactly
  what that mechanism is for, and then a Regent payload works unchanged and is reported rather than dropped.

  **Blocks declaring the Encounter profile**, which is the last Blacksmith journal profile on the parser.

### Librarian and Artificer

Already told: Librarian's codex and quests and Artificer's recipes all want `mapped` against their own
declared subtype, and all three wait on the same seam. Artificer has unblocked item-side work meanwhile
(`api.importer.buildDocumentData` / `buildDocumentUpdate`).

## Sibling deprecation warnings (spotted 2026-07-24)

- **Bibliosoph registers the deprecated `renderChatMessage` hook** (`coffee-pub-bibliosoph/scripts/bibliosoph.js`, raw `Hooks.on`): Foundry v13 logs "The renderChatMessage hook is deprecated. Please use renderChatMessageHTML instead" on every chat message render; support is removed in v15. Not a rename-only fix — `renderChatMessageHTML` passes an `HTMLElement` where the old hook passed jQuery, so the callback body must drop jQuery calls (or wrap the element itself). Fix belongs in the Bibliosoph repo with its own verification. (Blacksmith is clean: its `HookManager` remaps legacy `renderChatMessage` registrations to `renderChatMessageHTML` automatically, and the module's own `CHAT_MESSAGE_TYPES` uses were removed 2026-07-24 — see Blacksmith `CHANGELOG.md`.)

---

## One participation list across the suite (raised 2026-08-05)

**The same "this account is not a person" answer is configured in at least two modules, and would
soon be three.** A camera, stream, or bot account should get no toasts, should not count toward a
vote, and should not see the menubar — one fact, four behaviours, currently no shared home.

The history is the argument. `excludedUsersMenubar` began as a Blacksmith world setting and **now
lives in Herald** (`api-menubar.js:2918`). `toastExcludedUsers` is still in Blacksmith. Bibliosoph's
roll announcements are the next candidate. Each move was locally reasonable and the aggregate is a
GM answering the same question once per module, where forgetting one defeats the point.

**Blacksmith should own the fact; each module keeps its own behaviour.** The API design, the naming
question, and the migration of `toastExcludedUsers` are tracked in Blacksmith's `TODO.md` under
"One participation list". What is cross-module, and belongs here:

- **Herald** — decide whether its per-user menubar hiding goes back to consulting the shared list
  rather than keeping its own. If it stays independent, say why in Herald's docs, because the next
  person will otherwise read it as an oversight.
- **Bibliosoph** — should not add a fourth list. Its roll toasts already reach every client and are
  suppressed receipt-side by Blacksmith; the only thing it adds is a `channel` (see Blacksmith
  `CHANGELOG.md`, toast channels), which is the *event* axis and not the *user* axis.
- **Any sibling tempted to add "excluded users"** — consult the shared predicate instead. A second
  list is how this became a suite problem rather than a module one.

Sequencing: Blacksmith's predicate has to exist before any sibling can adopt it, so nothing here
starts until that lands. Do not migrate Herald and Blacksmith in the same release — a GM's existing
configuration should survive one change at a time.

---

## Secondary bar sizing — sibling adoption (Blacksmith side shipped, 2026-08-01)

Every module's secondary bar was a different height, and the cause was on Blacksmith's side: the house
default variable was `0px` (falsy, so unused), `registerSecondaryBarType` defaulted to an unrelated `50`,
and **group banners were subtractive** — a banner took its space out of the bar's height, leaving 6px
buttons at the 30px default. Since bar height is a master scale factor (every font, icon, gap, and padding
resolves from it), the only remedy a module had was to inflate the bar, which inflated its type. See
`CHANGELOG.md` and `documentation/architecture/architecture-menubar.md`.

Blacksmith now ships a real 30px default matching the primary menubar, additive banners, and a `size`
preset (`'default'` 30 / `'large'` 45 / `'xlarge'` 60). **`height` is no longer accepted** — it is ignored
with a warning naming the presets. Decided 2026-08-01, on the observation that every module in the suite had
taken the escape hatch and that all four bars map onto a preset exactly, so nothing is lost by closing it.

**Every bar that set an explicit height changes size on this release**, since the value is now ignored
rather than merely discouraged. That is the migration signal. Note that a custom template is not an
alternative route to a bespoke size: `templatePath` controls markup only, and the bar still scales from the
same variable.

| Module | Today | Banners | Action |
|---|---|---|---|
| **Artificer** | No height — already correct | Yes | Nothing. Its comment already states the rule. Confirm its buttons grew now that banners are additive. |
| **Cartographer** | `toolbar.height` setting, default 38 (`manager-toolbar.js:66`) | Yes | Drop to `size: 'default'`. The 38 was buying banner room, which is now free — at 38 its items were 14px and are now 26px without it changing a line. **The setting should not survive as a free number**: it is a client-scoped slider with range 15-100 (`settings.js:179`), which under the scale-factor model is a typography control mislabelled as a height, and being client-scoped it gives two people at the same table different-sized text. Remove it, or offer the presets. |
| **Herald** | `broadcastBarHeight` setting, default 60 | Yes | `size: 'xlarge'` if the broadcast bar is genuinely meant to be read across a room, which is the one good reason to be large. Keep or drop the setting as the author prefers. |
| **Minstrel** | `height: 36` | No | `size: 'default'`. No banners, so 36 was a bespoke number with nothing behind it. |

Each fix belongs in that module's repo with its own verification: open the bar, confirm it is as tall as the
menubar above it (or deliberately taller), that its text matches the menubar's, and that the canvas below
clears it with no overlap or gap.

---

## Window base: `ACTION_HANDLERS` delegation (found 2026-07-30)

Blacksmith's `BlacksmithWindowBaseV2` dispatches `data-action` clicks to the **last-rendered** instance of a
class, because handlers are invoked as `fn(event, target)` with no instance and dispatch trusts a single
`static _ref`. Consumer-facing detail is in Blacksmith's `known-issues.md` (Windows); the fix and Blacksmith's
own migration shipped in 13.12.2 — see `CHANGELOG.md`, and `api-window.md` for the consumer contract.

Root cause worth stating suite-wide: because the handler signature never passes the instance, **every**
consumer invented its own instance lookup, and all six inventions are singletons. That is why a Blacksmith-side
fix alone changes nothing for a consumer — each handler body must also stop reading a singleton.

**Blacksmith side is done** (implemented 2026-07-30, awaiting live verification): handlers now receive the
instance as their third argument and as `this`, and the listener binds per instance on the window frame.
`static _ref` survives as a deprecated shim so nothing below breaks before it migrates. Consumer migration is
one edit per handler: `MyWindow._ref?.doThing()` becomes `(event, target, win) => win.doThing()`.

**No separate note files.** They went stale and got missed; asks now live in this file and reach the
sibling as a message. The Regent fork and the Dialog migration each have their own section above.

### Exposure by module

| Module | Uses `ACTION_HANDLERS` | Multi-instance today | Action |
|---|---|---|---|
| **Squire** | 4 files | **Yes — live defect** | `window-codex.js` gives each instance a random id (`:44`) with no singleton guard in `openCodexWindow`, and `_actionSave` reads `CodexWindow._ref` (`:1226`). Open two codex entries, edit the first, Save → submits the **second** window's form; the first window's edits are silently discarded. Notified 2026-07-30. Fix is Squire's, in the Squire repo. |
| **Regent** | 2 files | Unconfirmed | **Forked the base instead of subclassing it.** `regent-window-base-v2.js:11` is an independent `HandlebarsApplicationMixin(ApplicationV2)` subclass, 110 lines, carrying its own `_ref`, `_delegationAttached`, and the same `document.addEventListener` block (`:83`). A Blacksmith fix does not reach Regent. Ask them to delete the fork and subclass `module.api.BlacksmithWindowBaseV2` — same pattern as the Curator HookManager fork below. |
| **Minstrel** | 1 file | Unconfirmed | `MinstrelWindow._withWindow(...)` across ~10 handlers (`window-minstrel.js:717+`), constructed at `manager-minstrel.js:938`. Whether a second instance is possible was not verified. Heads-up so a second instance is not added unknowingly. |
| **Curator** | No | n/a | Not exposed to the dispatch bug, but hand-rolls the same singleton for its own listeners: `TileImageWindow._ref = this` (`tile-image-window.js:179`), `TokenImageReplacementWindow._ref = this` (`token-image-replacement.js:537`). Lowest priority. |
| **Bibliosoph** | 1 file | No — singleton by design | `openMessagesWindow` returns `MessagesWindow.current ?? new MessagesWindow(...)` (`window-messages.js:80`) and `static current` is documented as the singleton. Correct as written. Only becomes a defect if a second instance is ever allowed. |

Crier, Scribe, Vault, Monarch, Herald, Artificer, Cartographer: no `ACTION_HANDLERS`, no base subclassing —
unaffected.

## Suite legacy `Dialog` migration — `api.dialog` is the vehicle

**Recounted 2026-08-07.** Application V1 `Dialog` is deprecated in v13, and `plans/migration-v14.md`
already names finishing the V2 migration as a v14 forcing function. `api.dialog` shipped in 13.12.2; the
contract is `documentation/api/api-dialog.md`.

| Module | `DialogV2` | legacy `Dialog` | Since 2026-07-30 |
|---|---|---|---|
| **Blacksmith** | **57** | **0** | clean, and further ahead |
| Bibliosoph | 10 | 0 | **done** (was 2 legacy) |
| Cartographer | 6 | 0 | done |
| Squire | 1 | 0 | **done** (was 21 legacy) |
| Crier / Herald / Minstrel / Vault | 0 | 0 | none to migrate |
| Monarch | 0 | **11** | barely moved (was 12) |
| Curator | 2 | 2 | one retired (was 3) |
| Artificer | 1 | 2 | unchanged |
| Regent | 0 | 2 | unchanged |
| Scribe | 0 | 1 | unchanged |

~18 legacy call sites left, down from ~43. **Squire finished its 21 and Bibliosoph its 2**, so the warning
that used to head this section — tell them before they port to raw `DialogV2` — is spent for those two.

- **Monarch is now the whole problem**: 11 of the remaining 18, and still zero `DialogV2`. It is the module
  that would benefit most from being told `api.dialog` exists before it starts, and the one nobody has told.
- Artificer, Regent, Scribe and Curator are two-or-fewer each — small enough to fold into whatever else
  touches those files rather than scheduling.

## Regent: delete the forked window base

**Verified still open 2026-08-07.** Regent ships `scripts/regent-window-base-v2.js`, a fork of the
Blacksmith `BlacksmithWindowBaseV2`. The fork predates the `ACTION_HANDLERS` delegation fix that shipped in
13.12.2 (see the section above), which is the bug it was presumably forked around — so it now carries a
copy of a problem Blacksmith has already fixed, and will not pick up anything else that lands in the base.

`window-query.js` already imports the shared base, so Regent is running both. The ask is to delete the
fork and route everything through the shared base.

## Decision: Blacksmith does not own a Transfer/Share workflow window (2026-07-29)

Squire originally proposed a hub-owned Transfer/Share window — `transfer.open`, a mode enum, approval
orchestration, and a separate transfer-flow registry. **Rejected**, and the reasons are recorded here so it is
not re-proposed from scratch:

- The consumer would supply the subject data, the configuration template, `getValue`, `validate`, the
  recipient list, `onSubmit`, the sockets, the permission checks, the revalidation, and the notifications —
  leaving Blacksmith a header, three section wrappers, a list, and an action bar. Everything but the list
  already existed in the window bases and the shared form controls.
- Blacksmith has no way to verify a transfer flow. There is no test framework, verification is running
  Foundry, and the hub has no item-transfer domain to exercise — so every shell bug would surface in Squire
  and be debugged across two repos.
- Approval requires the window to open on a *different* client than the one that called it. Either the
  consumer constructs it there (in which case Blacksmith contributed only the components), or Blacksmith
  listens on sockets and opens windows on modules' behalf, which puts the hub in the transfer business.

What shipped instead: `api.dialog`, `api.entityList`, `api.quantitySplit`, and the per-instance
`ACTION_HANDLERS` fix — all reusable by any module, none of them knowing what a transfer is. Revisit a shared
workflow shell only if two or more modules provably duplicate meaningful shell code.

**Still refused, and the 2026-08-07 decision below does not weaken it.** The revisit condition was met for
*mutation* code, not shell code. No window, no approval orchestration, no recipient selection moved to the
hub, and none should.

## Decision: Blacksmith owns inventory mutation primitives — `api.inventory` (2026-08-07)

**Shipped.** The surface is `documentation/api/api-inventory.md` and the mechanism is
`documentation/architecture/architecture-inventory.md`; both are authoritative and both are on the wiki.
The plan that carried the design has been dismantled into them and deleted. **Do not restate the design
here** — this section tracks only the cross-module coordination.

Six mechanical primitives in Blacksmith: `grantItem`, `grantItems`, `grantCurrency`, `transferItem`,
`transferItems`, `transferCurrency`. They validate, mutate, and return a structured result. They emit no
sockets and own no workflow — each consumer calls them from its own GM-authoritative handler so
authorization stays with the module that has the domain rules.

**Why the hub and not a satellite:** Curator requires only `coffee-pub-blacksmith`; Squire requires
Blacksmith and `socketlib`; neither requires the other, and `coffee-pub-lib` is retired. The hub is the only
place two satellites can share code without one taking a hard dependency on the other, which Ground Rule 2
refuses.

Eleven duplicate mutation sites exist across three modules. Retiring them is per-module work, tracked here,
and **none of it starts until the API ships**:

| Module | Owns | Migrates |
|---|---|---|
| Squire | recipient selection, approval, chat, notifications | four `_completeItemTransfer` copies to `transferItem`; four drop-creates to `grantItem`; eight `game.actors.get` source lookups become UUIDs |
| Curator | corpse interaction, loot permissions, loot window, Take/Take All | `LootUtilities._rollLootTable` to `grantItem`; `_addRandomCoins` to `grantCurrency` |
| Artificer | crafting, gathering, recipes | `addCraftedItemToActor` to `grantItem` with `stack: 'merge'` |

Squire has reviewed the design and landed two fixes ahead of it (their `c28e57b`): a contents-based
container guard matching the API's rule, and quantity re-checks derived from the live document in all three
previously unvalidated copies. Both survive migration or retire cleanly.

Two consumer obligations worth recording because they are easy to miss and silent when missed:

- **Declare transient item flags.** The merge check treats any undeclared flag as identity-bearing, so a
  module writing UI state to item flags must pass those keys or its merges quietly stop happening. Squire
  passes two. Blacksmith deliberately does not hard-code sibling flag keys.
- **Artificer has a live data-loss bug the migration fixes.** `addCraftedItemToActor` stacks on name and
  type alone, so a component whose Artificer taxonomy flags differ from one already held is merged and its
  flags discarded. Whether that costs real data depends on whether their naming makes quirk and affinity
  part of the item name — an open question for them, not us.

**Two invariants must reach `architecture-inventory.md` when the plan is dismantled.** Both are invisible in
a correct implementation and destructive in a plausible one, so neither is recoverable by reading shipped
code: the rollback is quantity-aware (deleting the target row after a merge destroys quantity the recipient
already owned), and the lock spans the whole transfer via unlocked internal cores (a public primitive calling
another public primitive self-deadlocks on every transfer). Someone refactoring the wrappers away for looking
redundant reintroduces the hang, and the code will not argue.


## Consider: report the encumbrance race upstream to dnd5e (suggested 2026-08-08)

**Deferred to after the v14 migration (decided 2026-08-08).** This world is pinned to Foundry v13 and the
dnd5e line has moved past what it can run, so a report against a version we cannot upgrade to earns an
"upgrade and retry". Revisit when we are back on current system releases. The draft below stays because it is
still correct, just not yet actionable.

**Mitigated in the meantime, centrally**, by `scripts/manager-encumbrance-guard.js` - see
`architecture/architecture-inventory.md`. The guard is version-gated, so if a future dnd5e fixes this it
stops installing on its own; that is what makes deferring the report safe rather than trading a temporary
system bug for a permanent local patch.

`Actor5e#updateEncumbrance` (`dnd5e.mjs:39545`) reads
`this.effects.get(ActiveEffect5e.ID.ENCUMBERED)` and, when absent, creates an effect with that same fixed
`_id` and `keepId: true` (`:39563-39566`). Check-then-create, no lock, and no tolerance for losing the race.
It runs on every item create, update and delete on an Actor (`:39357`, `:39371`, `:39385`) and on the Actor's
own update (`:39330`), and Foundry does not await it from the write that triggered it — so any two writes
close together on one Actor produce two recomputes that both try to create `dnd5eencumbered0`. The server
rejects the second.

**Every module that writes twice to an Actor hits this, and most will never work out why**, because the
rejection surfaces from a lifecycle hook rather than the caller's await chain: the write succeeds and the
error is console noise. It cost this suite two modules' worth of investigation — Squire diagnosed it in a
transfer, and it turned out to affect every item created on an owned Actor by anyone.

Two plausible system-side fixes, either sufficient: catch the duplicate-id rejection on the create, or
re-read the effects collection immediately before creating. Squire has offered to co-sign.

We have what a report needs: the mechanism with line numbers, a minimal reproduction (two writes to one
Actor while it crosses an encumbrance threshold), and a harness check that demonstrates it
(`testing/suites/suite-inventory.js`, `one-write-per-actor`). Worth doing because the alternative is every
module in the ecosystem routing around it separately, which is what we and Squire have each just done.

## Suite-wide: a document write inside a timer needs the liveness check INSIDE the callback (2026-08-08)

**Curator's finding, generalised at their suggestion.** The rule is one line: **whatever runs after the delay
needs the check, not whatever scheduled it.** A guard placed before `setTimeout` proves the document was alive
when the timer was set, which is exactly the moment nobody doubted. The delay is the hazard window.

It is worth a suite-wide entry rather than a Curator note because of how it fails. With `await` the hazard is
at least visible in the same function; with a scheduled callback the guard and the write sit far apart and both
read as correct. Curator hit this pattern **five times across three shapes**, including once where a guard was
added, looked sufficient, and covered nothing - the check was on the wrong side of a 150ms `setTimeout` that
TokenMagic wrote a flag from. The symptom is an `Uncaught (in promise)` naming an id that no longer exists in
an embedded collection, with a stack pointing at a library rather than at the module that scheduled the write.

Two fixes Curator made that generalise: resolve liveness through a single `isEmbeddedAlive(doc)` that reads the
parent collection from the document's own `collectionName`, rather than a token-only helper that has to be
copied to cover tiles - that is how forks start; and attach a `.catch()` to the write, because a rejection from
a promise nobody awaits surfaces with nothing useful in the trace even when the liveness check is right.

**The sweep, which is cheap:**

```
grep -rn "setTimeout(" scripts/
```

Then look at what each timer touches when it fires. One that only moves DOM or window state is fine; one that
writes to a document needs the check inside the callback. Curator: 17 timers, 2 write documents, both were
wrong, about a minute to establish.

**Blacksmith: swept 2026-08-08, clean.** 122 `setTimeout` calls outside the vendored CodeMirror bundle;
exactly one writes a document - `ui-combat-tracker.js:705` sets `turn: 0` after a 100ms wait - and it already
re-checks `game.combats.has(combat.id)` after the delay. `xp-manager.js:151` waits a second and then reads a
Combat that is *already* deleted by design, which is the record's whole purpose, and writes nothing to it.

**A guard cannot cover the await it is inside, and that is a second rule.** Curator made this correction on
2026-08-21 after a Blacksmith harness run reported two of their errors under one signature, and it is the
more useful half of the finding:

```
Token Image Utilities: Error applying dead token: Cannot read properties of undefined (reading 'id')
Portrait Image Replacement: Could not store original portrait: undefined id [...] does not exist in
the EmbeddedCollection collection.
```

Identical shape, **two different findings.** The first was a missing guard — the rule above covers it. The
second was already guarded, correctly, and the guard could not help: it proves the Actor was alive when it
ran, and the deletion lands *during* the `setFlag` itself. There is no guard position that fixes that.

So "re-check after every await" is necessary and not sufficient. **The last write also needs a `catch` that
distinguishes gone-from-broken**, because the only place that race can be observed is after the fact. Without
that, a consumer following the rule properly still logs errors under a harness that churns documents, and
goes looking for a bug that does not exist.

That also means a harness error of this shape is not by itself evidence of a defect — it says a write raced a
deletion, which is either a missing guard or an unreported race, and the two look the same from outside.
- [ ] **Squire** - sweep. Curator expects instances, particularly anywhere a visual effect is applied on a delay.
- [ ] **Cartographer** - sweep, same reason.
- [ ] Other satellites - sweep opportunistically; the check costs a minute per module.

## Forked hub code across the suite - swept 2026-08-08

**Curator found two forks in its own tree, fixed both, and supplied the heuristic that found them.** Running
that heuristic plus a stronger one across all twelve modules gives the picture below. The important part is
what the sweep **cannot** see, so nobody reads this as an all-clear.

### Confirmed and resolved

**Curator: `ui-context-menu.js` and `manager-hooks.js`.** Both deleted. Diffed first, and the only lines unique
to Curator's context-menu copy were precisely the four defects fixed upstream on the same day - a strict subset
plus bugs, nothing worth preserving. The hook manager fork was 520 lines, 86% identical, missing three upstream
fixes.

Both files were kept as **thin forwarding accessors rather than deleted outright**, which is a better call than
deletion: the filename is what someone searches for when they want a context menu or a hook manager, and an
empty result invites writing a new one. Each file now states that the fork was removed, why, and where the
shared surface is documented. Worth copying as a pattern for the others.

**One consequence lands on us, not on Curator.** Their hook manager fork did not record `context` on the
callback record, so every hook Curator has ever registered reported as `context: default` in Blacksmith's own
`BlacksmithAPIHookStats` and `HookDetails`. Curator passes a context on every registration; the fork dropped it
before our stats layer saw it. **Any past reading of hook stats that concluded Curator was not using contexts
was wrong.** This is the class of defect that never generates a bug report, because a hook reporting the wrong
context in someone else's diagnostic tool is invisible from both sides.

**The fork is gone** — deleted months ago, and `manager-hooks.js` has been a thin forwarder since. Curator
confirmed 2026-08-21, correcting a note of ours that still had the deletion in the future tense. **The
`canCancel` flag is a no-op for them**: they register no `pre*` hook at all, and the only `preUpdateToken`
left is inside a comment describing the old fork. They have recorded the flag against whoever adds the first
one.

Historical, then: Curator's fork restricted `pre*` cancellation to `preUpdateToken` only. They filed that as a
missing upstream fix, and it is a divergence - but a hard-coded whitelist was accidentally safer than our
"any `pre*` can veto for everyone", and it is the same instinct as the `canCancel` opt-in that has now
shipped upstream. **When they delete the fork, that whitelist goes with it**: their `preUpdateToken`
registration must declare `canCancel: true` or the restriction becomes inert. That is the one behavioural
difference to hand them along with the ask.

### Regent: window base fork - still open

`regent-window-base-v2.js`, tracked in its own section above. **Neither heuristic below detects it**, because it
is renamed on both axes: the file is not `window-base.js` and the class is `RegentWindowBaseV2`, not
`BlacksmithWindowBaseV2`. A renamed fork is a semantic copy, not a textual one, and no filename or symbol match
will find it.

### What the sweep found, and what it means

**Heuristic 1 - shared filename** (Curator's, one line, run from a module directory):

```
for f in scripts/*.js; do n=$(basename "$f"); [ -f "../coffee-pub-blacksmith/scripts/$n" ] && echo "$n"; done
```

Seven hits across six modules. Two were the real Curator forks. The other five are naming collisions or
consumer adapters, and each was checked rather than assumed:

| Module | File | Verdict |
|---|---|---|
| Squire | `manager-pins.js` (2325 lines) | **Consumer adapter.** Exports `getPinsApi`, `isPinsApiAvailable`, `getSquirePinType`; calls our pins API. Squire's own quest and codex pin domain logic. Correct architecture. |
| Artificer | `manager-pins.js` (480) | Own pin logic, no shared exports. |
| Bibliosoph | `manager-toolbar.js` (288) | Own toolbar, no shared exports. |
| Cartographer | `manager-toolbar.js` (631), `manager-sockets.js` (278) | Own, no shared exports. A per-module socketlib registration is the correct pattern, not a fork of ours. |
| Regent | `api-core.js` (16 lines) | A shim, not a copy - it re-exports `getSettingSafely`. Same shape as Curator's forwarding accessors. |

`const.js` and `settings.js` collide legitimately in every module and are excluded.

**Heuristic 2 - shared class name, filename-independent.** Sixty-nine exported class names from
`coffee-pub-blacksmith/scripts/*.js`, grepped for `class <Name>` across every sibling. **One hit:** Artificer's
`TagManager` (`systems/tag-manager.js`, 428 lines). Not a fork of ours - zero references to `blacksmith` or
`api.tags`, and a different size and shape. It is Artificer's crafting taxonomy.

That does raise a separate question rather than a fork finding: **Blacksmith owns a unified Tags system and
Artificer has its own tag manager.** Whether a crafting taxonomy is genuinely a different concept from
document tags, or a missed consolidation, is worth one conversation with Artificer. It is not duplicated code.

### The heuristics are a first pass, not a sweep

Both are textual, and both miss a renamed fork - demonstrated by Regent, the one we already knew about. Between
them they produced eight hits, two of them real: a useful ratio for a one-line command, and not a clean bill of
health.

**The signal that actually worked is behavioural: a module that has a capability the hub exposes, and never
references the hub's API for it.** That is what identified Curator's context menu - zero `uiContextMenu`
references while shipping context menus - and it would identify Regent's window base, which the textual checks
cannot. It needs a per-namespace question rather than a grep:

- For each public surface (`uiContextMenu`, `pins`, `tags`, `dialog`, `sockets`, `toolbar`, the window bases,
  `HookManager`), which modules have that capability in their UI but no reference to ours?

Given this turned up two forks in Curator immediately and Regent's is still open, that per-namespace pass is
worth doing properly rather than trusting the filename check to have covered it.

**Both heuristics only looked at `scripts/*.js`, and a template fork was sitting in plain sight.** Found
2026-08-13 while inventorying chat cards: Squire's `templates/chat-cards.hbs` (505 lines) is a fork of
Blacksmith's `templates/cards-common.hbs` (324 lines) - same variant names in the same order, same invalid
`visibility: none` on line 1, 231 lines now diverged. Neither heuristic could see it, because both were
scoped to JS. **Whatever per-namespace pass gets run, run it over `templates/`, `styles/` and `documentation/` too.**
A second instance turned up the same day in the third of those: Artificer carries its own copy of
`documentation/applicationv2-window/guidance-applicationv2.md`, forked from Blacksmith's. Forked *guidance*
drifts exactly like forked code and is worse to detect, because nothing breaks when it goes stale -- it just
quietly teaches the wrong thing. Its disposition is tracked in Blacksmith's `TODO.md`. This one
is being resolved by the chat cards parts system below rather than separately.

## Chat cards: sibling migration to the parts system (planned 2026-08-13)

Blacksmith's side is steps 1-6 in its own `TODO.md`; the design and its nine decisions are in
`coffee-pub-blacksmith/documentation/plans/plan-chat-cards.md`. This section is step 7 - the siblings.

**What changes for a consuming module.** It stops owning card HTML entirely. It calls
`chatCards.post({ type, composition, data })`, registers any button actions at startup, and deletes its card
templates and card CSS. Prose arrives as structured blocks (paragraph, list, table, quote) with a three-mark
inline subset plus Foundry enricher syntax; HTML built in JS is not accepted, and is escaped on sight rather
than rendered. Document-sourced HTML - a journal page, a roll-table description - goes through the separate
`richtext` part.

**Backwards compatibility is not a goal.** Confirmed by the author. Every module migrates; nothing is
deprecated in place.

**The gate, which applies per module:** delete that module's card templates. If the suite cannot still render
every one of its cards, the parts library is missing a part - and the fix is to add the part in Blacksmith,
never to let the module keep a template.

### Complete — all seven modules, 2026-08-15 and 2026-08-16

Artificer, Bibliosoph, Scribe, Squire, Regent, Crier and Curator. **No module in the suite writes card
HTML.** Cartographer, Herald, Minstrel, Monarch and Vault post no chat cards and were unaffected. Per-module
detail is in Blacksmith's `CHANGELOG.md` under 13.18.0; what follows is only what outlived the work.

**Four lessons for the next inventory of this kind.** Every one of them is a case where the survey described
what a module *declared* rather than what was *reachable*, and the error ran the same direction each time.

- **A fork rots as well as drifts, and the rot is the cheaper half.** Half of Squire's 505-line
  `chat-cards.hbs` was unreachable — nothing had set `isPlanningStart`, `isTimer`, `isLootDrop`,
  `isMovementChange` or `isLeaderChange` in a long time, and it was carried forward on every edit because
  there was never a reason to check. **Count reachable variants, not lines.**
- **Ask whether a module's card CSS actually reaches chat before asking it to port anything.** Regent's
  "4 rules" did not exist; every rule in its `styles/` was scoped to `#coffee-pub-regent-wrapper`, and its
  GM whisper had therefore been rendering unstyled in the chat log for its entire life with nobody
  reporting it. Curator's `curator-loot-card` was styled nowhere at all.
- **For machine-generated content, ask what it actually looks like from real samples — not what the prompt
  asked for, and not whether the format is "constrained".** Regent answered both of those in good faith and
  one answer was wrong: its prompt says "HTML only, never Markdown" and real replies come back with
  headings as tags, emphasis as `*marks*`, and rules and tables as Markdown. The model half-obeys, and the
  half it ignores is whatever Markdown does more conveniently.
- **A hub rule its author steps outside of will not hold.** Two of Blacksmith's own cards were built with a
  capability the API withheld, and Crier had already copied the workaround into production before anyone
  noticed. Both now go through the public method.

**Scope questions this work settled, so they are not reopened:** `richtext` stays narrow (it is enriched,
not sanitised, and inherits its safety from having a human author — generated content gets parsed into
parts instead); the part library stayed closed and no module needed a part that did not exist; and
"everyone except these users" was not built, see below.

**When a style has no visible source, measure instead of grepping.** Removing Scribe's global
`.message-content blockquote` rules -- which restyled every blockquote in every chat message in the world,
other modules' cards included -- took three rounds of grepping the wrong files, because the rules were
reachable only through an `@import` chain. A console pass over `document.styleSheets` that recursed into
imported sheets and tested `el.matches(rule.selectorText)` named the file and the rule in one step. Reach
for that immediately next time. The same pass incidentally found two Scribe themes loading at once, which
no amount of reading the theme-swap code had surfaced.

Cartographer, Herald, Minstrel, Monarch, and Vault post no chat cards and are unaffected.

**"Everyone except these users" is NOT needed — do not build it.** It was raised as the likely gap in
`readableBy` when Squire's transfer cards were inspected, because sender, receiver and bystander each read
differently. Squire's migration answered it: they already whisper a separate message per audience, so each
card carries one unconditional sentence written for its one audience and needs no `readableBy` at all. That
also disposed of the empty-card-body case by construction rather than by patch, since the else-less branches
had nowhere to survive. If a transfer flow is the archetype for reader-varying cards, the gap is less
pressing than it looked. Revisit only if a module has a genuinely single-message case.

**The theme accessors are one deletion away from being removable.** Scanned across all twelve siblings
2026-08-16: **exactly one call to a class-name accessor exists in the suite** --
`crier.js:1359`, inside `resolveThemeClass()`, which is dead code (its only caller assigns a value nothing
reads). Bibliosoph, Regent and Scribe all use `getThemeChoices('card')`, which returns ids and is correct;
Bibliosoph and Crier each have a *local* function named `getCardThemeChoices` that calls it, and an earlier
scan of this matched those names and a comment rather than any call, which is how this list came to claim
two modules were still on the class-name path when neither was.

**So: when Crier deletes `resolveThemeClass`, the whole "theme accessors pending sibling migration" block in
`api-chat-cards.js` can go.** Nothing else reaches it.

A caution for the next scan of this kind: match on a *call* (`\.\s*name\s*\(`), not on the bare identifier.
A bare name matches local wrappers, doc comments and the definition itself, and every one of those reads as
a live dependency. Migration replaces card *markup*; it does not touch
a module's theme-choice *setting*, which is where the class-name variants are used. So removal needs its own
sweep with its own criterion -- no module builds theme choices from class names -- and each of those settings
stores a CSS class where `post()` wants an id. `resolveThemeId` now falls back to the world default rather
than Tan, so those worlds degrade gracefully instead of pinning every card to Tan, but the settings still
want converting to `getThemeChoices()` with their stored values normalised on read.

**How to verify, per module**: trigger every card that module posts in a live world with a second client
connected; confirm each renders, each button works on the clicking client only, and whisper and GM-only cards
still reach the right audience. Then delete that module's card templates and CSS and confirm nothing changed.

## Decision: no selector-based context menu variant (declined 2026-08-08)

Offered to Squire and **declined by them**, which is worth recording because the offer will look obvious again
later. Foundry's `ContextMenu` binds to a container plus a selector and delegates across rows; ours takes
explicit coordinates and a fixed item list. Squire is still on Foundry's for `panel-favorites.js`, so adding a
delegated variant looked like the way to bring them across.

Their reason for declining is the useful part: **their favourites panel replaces its own `innerHTML` on every
render, so a delegated binding would not survive anyway** - the code already comments that it always creates a
fresh menu. They pay the per-render cost delegation would have saved, so the feature would buy them nothing.
They explicitly asked not to be counted toward the case for it.

`condition` predicates are the other thing Foundry's has that ours lacks. Also not a blocker: Squire gates
three reorder entries on list position, and filtering at build time is fine - arguably better, since inside a
`contextmenu` handler the row is already in hand rather than a predicate re-deriving it per open.

**What actually sells the shared menu to them is zones.** A flat list where GM-only entries look identical to
player ones is the gap Foundry's version cannot close. Descriptions and image icons are nice-to-have.

So: build neither on this evidence. If a second module asks for delegated binding, weigh it on that module's
case alone. Squire's migration is scheduled with their panel work heading toward Librarian rather than as a
standalone change, because they do not want to migrate `panel-favorites.js` twice.

## Suite-wide: api.dialog stopped being modal by default (changed 2026-08-08)

**Decided and shipped.** `api.dialog`'s `openDialog`, `choose`, `prompt`, and `wait` now default to
`modal: false`. `confirm` defaults to `modal: destructive`. `modal: true` is still accepted everywhere.
Rationale and mechanics are in `api/api-dialog.md` under Modality — do not restate them here.

**Every satellite inherits this**, so it is worth one look per module rather than an assumption:

- **A prompt or picker raised from inside your own window: change nothing.** The new default is what you
  wanted, and the old one froze the window that raised it. This is most call sites.
- **A confirmation that deletes something: pass `destructive: true`** if you are not already. It styles the
  button as critical and makes the dialog modal in one flag, which are two things you want together.
- **Anything that genuinely must block the whole interface: pass `modal: true` explicitly.** It now has to
  say so.

Found by Curator combining `api.dialog` with `api.quantitySplit` in its loot window
(`window-loot.js:_askQuantity`): a quantity slider locked the entire interface, including the loot window
that raised it. Neither API was misused — the default was wrong, and `quantitySplit` was blamed first because
that is what the user could see. It builds markup only and has no window or modality of its own.

Note for anyone auditing: Monarch still has 11 legacy `Dialog` call sites and zero `DialogV2`. When those
migrate they land on the new default, which is the right one for them; no extra work, just do not port a
`modal: true` assumption across from the old `Dialog` behaviour.

## Squire: the createItem hook breaks every module's item writes (found 2026-08-07)

**Found by the Blacksmith inventory harness, verified in Squire's source.** Squire's `createItem` hook
(`squire.js:500-513`) does `await item.setFlag(MODULE.ID, 'isNew', true)` for **every** item created on an
owned Actor — by any module, in a second write that lands asynchronously after the create returns.

Two consequences, both affecting other modules rather than Squire:

1. **It reintroduces the encumbrance collision globally.** dnd5e recomputes encumbrance on every item write
   as a check-then-create against one fixed effect id with no lock, and Foundry does not await that hook from
   the `createEmbeddedDocuments` promise. Squire's `setFlag` is therefore a second write to the same Actor,
   and the server rejects the duplicate effect id. This is the same bug Squire diagnosed and fixed on its own
   transfer path; the generic hook still does it for everyone. Reproduced in the harness: one grant produced
   one collision, a three-item batch produced three.
2. **It makes merge identity timing-dependent for every consumer.** An item stamped with `isNew` and an
   otherwise identical one that has not been stamped yet compare as different, so identical items merge or do
   not merge according to whether Squire's write has landed. Consumers cannot compensate, because a consumer
   has no way to know Squire does this.

**The fix for both is the same one Squire already applied to its transfer path: do not make a follow-up
write.** Inject the flag into the creation data from `preCreateItem` (`document.updateSource({flags: ...})`),
so it is part of the original write. Zero extra writes, same persistence, no behaviour change for the badge.

**Second ask, independent of the fix:** call
`blacksmith.inventory.registerTransientFlag('coffee-pub-squire.isNew')` during ready. That tells the merge
predicate the flag is not identity, for every consumer, without any of them knowing Squire exists. The
registry was added because of this finding — see `api/api-inventory.md`. The harness currently registers it
on Squire's behalf as a stopgap; that line should be deleted once Squire declares it.

The `isNew` flag itself is correct and should stay. It is the durable half of a two-tier badge
(`manager-panel.js:54` — "flags persist; the map doesn't"), and only the extra write is the problem.

## Curator: token interaction claim registry (approved 2026-08-07)

**Shipped.** The surface is `documentation/api/api-tokens.md` and the mechanism is
`documentation/architecture/architecture-token-interactions.md`; both are authoritative and both are on the
wiki. The plan that carried the design has been dismantled into them and deleted. **Do not restate the design
here** - this section tracks only the cross-module coordination.

`blacksmith.tokens.registerInteraction` lets a module claim a gesture on a token it does not own. The
outcome Curator needs: a player double-clicks a lootable corpse and gets Curator's loot window, and the
Actor sheet does not open.

**Why an API and not a hook**, recorded so it is not re-litigated: Foundry evaluates the permission
predicate *before* the handler (`mouse-handler.mjs:494`, with `clickLeft2` bound to `_canView` at
`placeable-object.mjs:792`, requiring LIMITED at `token.mjs:4254`). A player has no permission on a corpse,
so the gesture is rejected before any handler could run. There is nothing to subscribe to. Verified against
the installed v13 source, not taken on trust. `HookManager` is not the obstacle - it accepts any hook name
(`manager-hooks.js:94`); Foundry never emits one.

**Ownership split:**

| | Owns |
|---|---|
| Blacksmith | the registry, the per-instance patch, conflict resolution, fail-closed behavior |
| Curator | corpse interaction, loot permissions, the window, Take/Take All, distance checks |

**Sequencing.** Independent of `api.inventory` - no shared code. Build the registry first: it is much
smaller and closes Curator's last open design question. `api.inventory`'s `grantItem` remains the thing
Curator needs to actually function, and Curator's Phase 1 chat-card entry point needs neither.

**Consumer obligations:** gestures are named with Foundry's own keys, so Curator's requested `doubleClick`
is `clickLeft2`. v1 accepts `clickLeft2` and `clickRight2` only; the others break selection, dragging, or
the HUD and are rejected until something justifies them.

## Bibliosoph effects/wiki note (revised, received 2026-08-07)

Item A is **done** — `architecture-effects.md` gained a "Duration is rewritten" section and its non-goals
list now says which items are non-goals *of the layer* versus of the module, with owners named. The rest
are decisions. Everything below was verified against the installed code, not taken on trust.

### B. Adapt the effects ecosystem the way the rolls layer adapts MIDI — the real decision

**Their diagnosis is correct and the mechanism is confirmed.** Times Up is installed in this world.
`setDurationRounds` (`times-up/module/handleUpdates.js:15`) rewrites any effect under its threshold
(default 10 rounds x `CONFIG.time.roundTime`) into a rounds duration, **nulls `duration.seconds`**, and
stashes the original in `flags.times-up.durationSeconds`. Our `formatDuration` then takes the non-seconds
branch and passes core's `N Rounds, M Turns` through. Identical authored data, two displays, decided by
what else is installed.

A second, independent source of the same variance exists and is unrelated to Times Up: dnd5e's
`DurationData.getEffectDuration()` maps a source item's own units, so `round`/`turn` units produce
`{rounds}`/`{turns}` at creation. Any fix has to handle both, and only one of them is a third party.

**The precedent they cite is real**: `utility-midi-resolution.js` is 440 lines gated on
`enableMidiIntegration`, and consumers of `rolls.on('damageResolved')` never learn whether MIDI is
present. The analogy is sound as far as it goes, with one asymmetry worth weighing: MIDI *reports*
outcomes, so adapting to it means reading an event source. Times Up *mutates the document and owns
expiry*, so adapting to it fully means owning a clock.

**ALL THREE ASKS ARE ALREADY IMPLEMENTED. This section spent weeks weighing a decision that had been
made in code.** Bibliosoph went looking to scope the work, found it done, and sent the citations back
2026-08-21; every one was verified in `api-effects.js` the same day:

| Ask | Where it lives |
|---|---|
| Normalized `remaining`, carrying value **and** unit | `getEffectRemaining()` (`:144`), on the `getDisplayEffects` DTO and on the expired payload |
| `enableTimesUpIntegration` runtime check | `isTimesUpIntegrationEnabled()` (`:100`), defaulting to true when Times Up is active but the setting is not registered yet |
| GM-authoritative `effects.expired` | `sweepExpired()`, GM-gated at call time, deduped by uuid through `ANNOUNCED_EXPIRED`, arbitrated against Times Up via `deletedBy: 'times-up' \| 'blacksmith'`, driven by both `updateWorldTime` and `updateCombat`; `onExpired()` is the subscription |

So the expensive one is not pending on its merits: the clock, the dedupe and the Times Up interleaving are
written. Bibliosoph already consumes it -- `manager-injury-ticks.js` subscribes behind a feature check and
honours "consumers must not delete on expiry", with a comment reading "EXPIRY IS BLACKSMITH'S... we used to
do this ourselves and raced them."

**The lesson is about these notes, not about the effects layer.** Bibliosoph flagged this as the second
time in one week that the API turned out to be ahead of its own notes — the other being
`getAllPacks`/`getAllChoices`, which they had adopted before our "tell them it exists" note reached them.
A cross-module list that records asks but not deliveries manufactures work. **Check the code before
restating an ask as open**, the same way the doc-accuracy rule already says to check code before trusting
a doc.

**The principle behind it stands and is written down** in `architecture/architecture-ownership.md`:
Blacksmith absorbs third-party variance, satellites never branch on it, and a non-goal is a decision rather
than a default. The hub may read `flags.times-up.*` — that is what an adapter is for — and a satellite may
not.

### C. Two wiki-sync backports — one yes, one conflicts with our own rules

- *Windows EPERM*: verified, `publish()` does `fs.rmSync` on git's read-only object store. Their fix is
  sound. Low value here — the Action runs on Linux and CLAUDE.md says not to clone the wiki locally on
  this machine — so take it as portability for the script siblings copy, not to unblock anything. Note
  the `Architecture:-Core` colon warning in CLAUDE.md refers to a legacy page; nothing in the current
  `PUBLISH` list generates a colon-bearing name.
- *Sibling wiki URLs*: **contradicts Ground Rule 2** — cross-module references get deleted, not
  relinked, because a corrected cross-module link is still coupling. If we want it, the rule changes
  first; it is not a tooling decision.

### D. Classifier cannot set `durationLabel` — no change needed, and the fix is per-kind

The boundary is intended and documented. The need is met without widening the contract: write
`{rounds: N}` instead of `{seconds: N}` and the duration says rounds, because the branch keys off the
document.

**Bibliosoph accepted this 2026-08-21, with a correction worth keeping: it is a per-kind split, not a
global swap.** Measured across their authored content — 54 crit/fumble durations, 6 to 600 seconds with 46
at a minute or under, combat-scoped and wanting `{rounds}`; and 125 injuries, 60 to 7200 seconds with 36
over ten minutes, wall-clock and wanting `{seconds}`. Writing rounds unconditionally would reintroduce a
bug they had already fixed once: "100 rounds remain" on a ten-minute wound while the party shops.
`getEffectRemaining` supports the split — a natively-authored rounds duration carries no
`timesUpOriginalSeconds` flag, so `api-effects.js:154` does not un-convert it and it reports
`{ value, unit: 'rounds' }` as intended.

**Standing requests** (public cross-client toast delivery, stats query API, MIDI attacker attribution on
`damageResolved`, advantage/disadvantage on requested rolls) are tracked in Bibliosoph's own TODO.

## Bibliosoph — unfiltered compendium list (2026-08-02)

**Delivered, unverified.** `api.compendiums.getAllPacks(type)` and `getAllChoices(type)` return every installed
compendium that can hold a type, ignoring both the enabled-source checkboxes and the content heuristics
`getChoices()` applies. Bibliosoph can now offer any journal compendium for its injury setting, including one
the GM deliberately kept out of Blacksmith's search mapping — which was the case the old surface could not
express. Tell Bibliosoph it exists, and that `getChoices()` remains the right call for anything that should
respect the search configuration.

## Squire integration — what Blacksmith still owes (2026-07-30)

Squire has migrated all 22 legacy `Dialog` call sites to `api.dialog` and live-tested them; a source audit
confirms zero `new Dialog` / `Dialog.confirm` / `Dialog.prompt` / `Dialog.wait` remain. Their five transfer
surfaces run on `api.dialog` as an **interim** state; the end state is still one ephemeral Squire-owned
`BlacksmithToolWindowBaseV2` Transfer Tool. Four Blacksmith surfaces remain between here and there:

| Ask | State |
|---|---|
| Selectable-entity component | **Implemented, unverified.** `api.entityList`, both modes, with the Tool-window Light/Dark/Glass check in the harness still to run. That check is the one Squire specifically named. |
| Per-instance action delegation | **Done and verified 2026-07-30.** 7 headless assertions in the harness's Window Delegation suite plus a two-window interactive check: two instances each handle their own clicks, the older survives the newer's close, and a reopened instance rebinds. Squire had already removed static `_ref` routing on their side. |
| Quantity/split control | **Delivered and implemented, unverified.** Squire contributed it 2026-07-30; landed as `api.quantitySplit`. Once verified, tell Squire to delete their local copy — the round-trip is not finished while both exist. |
| Public importer API | **Shipped 2026-08-20.** See below. |
| Compendium search for a quick-add picker | **Delivered and verified 2026-08-02.** `api.compendiums.search(query, type, options)` — many candidates for one query, grouped by source, with `img` now on the cached index entries. 57/57 headless assertions in the harness's Compendium Search suite, grouping proven across 10 configured sources, ~5ms per warm query. Squire can build the quick-add tray on it; they must not build a second index cache over `getSelected()`, which is the whole reason it lives here. Blacksmith's own `window-compendium-search.js` palette is the reference consumer, including the drag-to-sheet payload. Squire shipped their tray on it and fed back two gaps, both closed 2026-08-02: `documentClass` on each result (they were deriving the drag payload's class from the type token, having merged three searches into one list), and `searchDetailed()` reporting `truncated` / `scannedSources` / `skippedSources` (they were inferring truncation from `results.length === limit`, which over-reports). Tell them both are available. |

### Importer API — shipped 2026-08-20, and smaller than the thing that was gated

`module.api.importer` exposes the existing kind registry: `registerKind`, `getKind`, `openWindow`,
`parsePayload`, `attachButton` (`scripts/api-importer.js`). `api-importer.md` documents it and is now in
the `PUBLISH` list.

**What shipped is not what was gated, and that is the point.** The gate was on the large drafted contract
— capability discovery, template and prompt outputs, `validateJson` / `importJson` — which still does not
exist and is now parked in `documentation/plans/plan-importer-api.md` pending a decision on whether it is
wanted at all. The registry needed no gate because it inverts the dependency: a kind supplies its own
`onValidateEntry` and `onImportEntry`, so the caller constructs its own documents and Blacksmith never
learns the consumer's data model. Librarian asked for exactly this in preference to the larger surface,
and it deletes ~600 lines of duplicated import dialog on their side.

The three requirements recorded for the larger design still stand if it is ever built: **validation
reporting**, **progress/error reporting**, and **scene-pin handling extension points** for Quest import.
Note that codex and quests are Librarian's now, not Squire's.

Two descriptor fields a consumer will want: `onProfileName(entry)` names the profile field (defaults to
`entry.type`), and `showInSwitcher: false` keeps a kind out of the import window's dropdown so a
consumer's importer does not appear in the list a GM sees from the Item directory.

### Squire deep-imports Blacksmith script paths — RESOLVED 2026-07-30

Four Squire files resolved the window base with a `/modules/coffee-pub-blacksmith/scripts/window-base.js`
path fallback. Flagged, and Squire removed all four the same day. (`squire.js:38` importing
`/modules/coffee-pub-blacksmith/api/blacksmith-api.js` was never a problem — that is a real published entry
point.)

**The advice attached to this entry was wrong, and it cost Merchant a live world on 2026-08-19.** It said
the base classes are on `module.api` before `init`, so a path fallback buys nothing. They are — but
`module.api` cannot be read at module *evaluation* time, which is when `extends` runs: `game` does not
exist yet, a top-level `game.modules.get(...)` throws, and ESM caches the failed evaluation, so the throw
disables the consuming module for the whole session. Squire's dynamic-import-at-point-of-use was not
belt-and-braces; it was the only thing that worked, and `panel-control.js:499` says so in a comment.

Fixed 2026-08-20: the base classes and the three style-constant objects are re-exported from
`api/blacksmith-api.js`, which is a real ES module and resolves at evaluation time. **Tell every consumer:
`import { BlacksmithWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js'`.** The rule
about `scripts/` paths not being the contract still holds; the bridge is the supported path for this one
purpose.

## `attach()` failed silently on the embedded controls - ANSWERED, shipped (raised by Merchant 2026-08-19)

Shipped as `readFrom` / `readIdsFrom`, an `attached` property on both controls, and a warning from
`api.dialog` when one reports a failed bind. Merchant and Curator can delete their fallbacks. Kept only
until the release note lands; reasoning is in `api/api-entity-list.md` and `api/api-quantity-split.md`.

One consequence for the `_askQuantity` extraction below: the fallback was the part Merchant called the
subtle bit, and it is now unnecessary. Their line count and similarity figures need remeasuring once they
have deleted it, before that extraction is decided either way.

## `omitFlags` - ANSWERED, shipped (raised by Merchant 2026-08-18)

Resolved as `omitFlags`, shipped. Kept only until the next release note lands: the option is call-level on
all five item-moving primitives, strips before the caller's `flags` merge, and stays separate from
`ignoreFlags`. Original reasoning is in `api/api-inventory.md`; delete this heading once that is on the wiki.

## Merchant/Curator duplication handback (received 2026-08-18)

Merchant's phase-1b comparison offered the hub four things with two real consumers each, agreeing close to
line-for-line. Two consumers is the revisit bar the 2026-07-29 decision set, so these qualified on evidence
rather than on taste. **None is started, and each needs a decision before it does** - the shapes below are
the asks as received, not accepted designs.

**Check the consumers still exist before re-measuring how alike they are.** A fifth entry, a shared quantity
dialog, was tracked here and re-measured three times across one thread before Merchant found that one of its
two consumers had been deleted months earlier and the survey's line reference had been stale ever since. One
consumer fails the bar outright, so no similarity figure was ever going to settle it. A number that moves is
interesting; a consumer that is gone is decisive, and it is much the cheaper thing to check first.

**An actor picker -- SHIPPED 2026-08-22 as `dialog.pickActor`.** Merchant restated the ask with the
measurement: `merchant/window-shop.js:366` and `curator/window-loot.js:349`, 99% identical over ~1,150
characters, the whole difference being two strings.

It landed as a helper rather than a documented recipe, which is the opposite of the call made for the
quantity dialog, and the reason is what got copied: the *list rendering* -- portraits, empty state, the
one-entry case -- not a wrapper around a call. Built on `api.entityList` in single mode, because `choose`
renders options as DialogV2 buttons and passes `icon` through as a CSS class, so a portrait is not
expressible there at all.

Returns a UUID or null. Surface in `api/api-dialog.md`. **Merchant's extraction plan deletes when they
adopt it.**

- [ ] **Adopt `openFor` in Curator.** Shipped on `BlacksmithToolWindowBaseV2`: the per-target registry,
      `isOpenFor` / `openWindowFor` / `openWindows` / `closeFor`, and a `keyFor` hook. Curator can delete its
      `_windows` map and its `static open`. Registries are per subclass, so a Loot window and a Shop window on
      one token no longer contend. Surface is in `api/api-window.md`.

      **Merchant adopted it 2026-08-19, and it closed a live bug** — worth repeating to Curator, whose
      hand-rolled registry has the same shape. Their map was written before the first render and cleared only
      in `_onClose`, so a window whose first render threw stayed registered, and every later open took the
      "already open, focus it" branch on an instance that had never opened. The window was unopenable for that
      actor until the page reloaded, which is why it read as unreproducible: a static map dies with the page.
      `openFor` deletes the entry when a render throws (`window-tool-base.js:136`).
- [ ] **Adopt `blacksmith.party` in Merchant and Curator.** Shipped as two rosters rather than one, because
      the check came back saying it is two policies: `resting()` is the party's creatures and includes NPC
      members, `acting()` is its player characters and does not. Both carry the no-primary-party fallback.
      Merchant's `playerCharacters` + fallback becomes `party.acting()`. Surface is in `api/api-party.md`.

## Toast presets, so a consumer does not have to invent a palette (raised by Merchant 2026-08-19)

`api.toast` takes a caller-supplied hex `color` that drives border, icon and title together, and there are
no presets. So a module wanting an error to look like an error has to pick colours that read against a
surface it does not own - Merchant reused its own parchment window tones on a toast painted
`rgba(20, 20, 20, 0.9)`, and it took a user saying "hard to read" to catch it.

The ask is `type: 'info' | 'success' | 'warn' | 'error'` selecting accents already known to sit on the toast
background, with `color` kept for anything deliberate. Nothing is blocked; Merchant's are fixed.

**Blacksmith now wants this too, and at volume.** Moving our own player-facing messages off
`ui.notifications` is filed in `TODO.md`, and it is 194 call sites. Without presets that sweep means
choosing a colour 194 times, so this entry stops being purely a consumer nicety and becomes the thing
that work waits on. Presets first.

**This is the fifth instance of the section 9C pattern and the first that is purely presentational**:
nothing failed, no code was wrong, it just quietly looked wrong, and only a consumer was positioned to
notice. Worth deciding whether the rule generalises from values to appearance - a hex that renders is the
visual form of a plausible default, and "the caller must reason about contrast against a surface it does not
own" is the same shape as "the caller must reason about a value it cannot verify".

**Already answered, no work needed:** Merchant also flagged that their `registerInteraction` call sites
carry 19 identical lines including two warning comments - that `matches` must be synchronous and stable,
and that `bypassPermission` is required because Foundry's predicate runs before dispatch. Both are already
in `api/api-tokens.md`, under "What it is for", "matches", and "bypassPermission", and that doc is in the
publish set so it is on the wiki. The call-site comments are duplicating documentation that exists; they
can be deleted in favour of a pointer. Worth noting as a discoverability result rather than a documentation
gap - the doc was right and two consumers still wrote the comments out by hand.

## `compendiums.query()` - ANSWERED, shipped (raised by Merchant 2026-08-23)

**Yes, it was ours, and it is built.** Merchant stocks shops from roll tables, which store references and
therefore rot -- a dead row resolved to `null` and was dropped silently, so a GM asked for twenty draws, got
fourteen, and was told nothing. `api.compendiums.query()` resolves against what exists when it runs, so it
cannot dangle. Surface in `api/api-compendiums.md`, design in `architecture/architecture-compendiums.md`.
Verified 2026-08-23: 931/931 headless, and the palette facets exercised in a running world.

Their reasoning was right and there were two further reasons they did not have. Foundry's `getIndex({fields})`
re-fetches a pack's entire index for every distinct field set, so uncoordinated consumers do not conflict --
they each cost another full re-fetch; and our own index cache was a lossy projection, so a consumer could not
have shared it even if it tried. Both are written up in the architecture doc.

**Three things about the proposed signature changed, and Merchant needs all three.**

- `limit` caps the OUTPUT; the scan is always complete. Their proposal inherited `search()`'s stop-scan
  limit, which would have stocked every shop out of the first configured pack and never opened the sixth --
  indistinguishable from a correct result.
- Rarity takes a `mundane` token. `system.rarity` is blank for non-magical gear, so their
  `['common', 'uncommon']` example would have returned magic items only.
- The price parameter is `priceGp`, not "base units", and unpriced entries are excluded by default. dnd5e
  stores a denomination (50 sp is 5 gp) and cannot distinguish unpriced from free.

`normalizeRarity()` and `toGp()` are exposed beside it so Merchant and Curator do not each reimplement the
conversion.

**Remaining:** Merchant adopts it and reports back; delete this entry when they have. Worth telling Curator
too -- loot generation is the same question.

## Open questions for Drowbe

1. **Mirror scope** — all 48 docs, or only the consumer-facing API surface + README-as-Home?
2. **`Get-Started-AI-Prompt`** — recover into the repo, or delete? (It never existed in the repo.)
3. **`plan-assets.md`** — trim the Vault spec and keep it, or fold the whole 1,569 lines into architecture
   and delete it?

---

## Done

- [x] **Fixed `ModuleManager.registerModule()`, which had never worked.** It gated on a registry populated
      from `window.COFFEEPUB.MODULES` — a key nothing has ever assigned — so it returned `false` for all
      nine sibling modules that call it, silently (the error is debug-gated). Detection now reads
      `game.modules` directly by `coffee-pub-` prefix, and `registerModule()` self-registers on demand.
      `manager-modules.js`. **Shipped in 13.9.0 and verified in a running Foundry.**
- [x] **Unbundled the compendiums — shipped in 13.9.0** with a changelog entry rather than a deprecation
      release (injuries are being rebuilt in Bibliosoph anyway, so the old pack was on its way out).
- [x] **Found the injury/fumble/crit tables** — `burden-of-knowledge`'s `bok-roll-tables`. Resolved by
      design rather than migration: modules point at them through Blacksmith's compendium settings.
- [x] Corrected `architecture-blacksmith.md` §4.3/§5 filenames and rewrote §7's CSS list from the actual 48
      `@import`s; all doc links now resolve. Removed the Curator image-replacement cross-reference per
      Ground Rule 2.
- [x] Untracked LevelDB runtime artifacts (`LOCK`, `LOG`, `LOG.old`) and **72 orphaned `lost/MANIFEST-*`
      files that were shipping to users in the release zip** (`packs/` is zipped; `documentation/` is not).
- [x] Scoped the `*.log` gitignore rule so it no longer swallows LevelDB write-ahead logs — a latent
      data-loss bug (harmless today only because every WAL happens to be 0 bytes).
- [x] Added `CLAUDE.md`.
- [x] **Phase 1 doc cleanup executed** (2026-07-16). Removed the ~30 lines of real sibling coupling
      (Regent's file paths and config values in `api-window.md`, Squire's `PanelManager` internals in
      `api-pins.md`, Herald's broadcast feature in `api-menubar.md`, Curator/Herald/Regent subsystem entries
      throughout `architecture-blacksmith.md`, sibling CSS class names in `design-system.md`, Artificer as
      the authority for the zone contract in `guidance-applicationv2.md`). Fixed 4 factual errors and all 5
      broken links; deleted `request-registerapi.md`. Kept the ~250 legitimate references — siblings as
      example *callers*. Retitled `architecture-pins.md` §160 to "Design rationale" rather than deleting the
      body, which is real Blacksmith reasoning.
- [x] **Rescued 18 KB of lost performance documentation.** `documentation/performance.md` had been
      overwritten by a 459-char stub that pointed at *itself* — the classic Windows case-insensitivity trap
      (`PERFORMANCE.md` and `performance.md` are the same file on NTFS, so "renaming" it destroyed the
      content). Recovered from `7d88618f` and split per the five-kind taxonomy: open items → `TODO.md`,
      design + measurement method → `architecture-blacksmith.md` §9A/§9B, history → dropped. File deleted.
- [x] **Fixed 17 stale flat doc paths** across 8 files (`documentation/api-x.md` →
      `documentation/api/api-x.md`, etc.). `CHANGELOG.md` deliberately untouched — it's history.
- [x] **Thinned `CLAUDE.md`.** It had grown into a sixth document type duplicating architecture's job. The
      hard-won facts moved into `architecture-blacksmith.md` §9A (Traps) and §9B (Performance-critical
      design); CLAUDE.md keeps conventions, boundaries, the five-kind taxonomy, and pointers.
- [x] **Dismantled 4 of 7 plans** (2026-07-16), each verified against code first, not just deleted:
      - `plan-rename.md` — said `Status: Complete` since 2026-04-17. Its one live item was removing the
        `window-base-v2.js` shim — **which no longer exists**. But two live docs still described it, and
        `design-system.md` told module authors to `import { WindowBase } from './window-base-v2.js'` — a
        file that isn't there. **A completed plan nobody deleted kept a broken instruction alive in the
        API docs.** Fixed both, deleted the plan.
      - `plan-settings.md` — items 1–4 verified done in code. The load-gate vs on/off model → architecture
        §8; open items (incl. one only the plan had) → `TODO.md` with their detail. Deleted.
      - `plan-token-naming.md` — design → new `architecture/architecture-token-naming.md`; phases 3–4 →
        `TODO.md`. The plan hardcoded "18 keys"; `resources/naming-taxonomy.json` has **20** — so the new
        doc points at the file instead of copying it.
      - `plan-pins.md` — **dead and actively harmful.** Its "Locked Decisions" locked in a `group` field
        that schema **v4 deleted**; anyone following it would be led backwards. Every plan-vs-doc
        contradiction went to the docs. Migrated 3 rationale items (three-concerns model,
        pre-filter-over-culling, why `group` died) → `architecture-pins.md`; filed 3 TODOs. Deleted.
- [x] **Rewrote `architecture-pins.md`** (127 → 294 lines). It predated the whole layers/tags/filtering
      system — a contributor would have concluded none of it was built and might have rebuilt it.
      `api-pins.md` was accurate throughout, so this was contributor-facing drift only. Added the Layers
      window and journal pins to Components, a Classification section (three-tier taxonomy merge; taxonomy
      is advisory, so unregistered tags are legal), a View state section, the render **pre-filter** step
      that was previously invisible, `tags: []` in defaults, and the schema migration history. Every symbol
      verified against source; the doc defers to `api-pins.md` and `pin-taxonomy.json` rather than
      duplicating them.
- [x] **Shipped 13.9.0** and verified in a running Foundry — the `registerModule` fix works. That was the
      one thing with no test coverage (the repo has no test framework).
- [x] **Deleted the public `Drowbe/Burden-of-Knowledge` GitHub repo** (2026-07-16). It was **PUBLIC and
      1.29 GB**, republishing the campaign's raw assets — 2,616 `.webp`, 519 `.mp3`, 82 `.png`/`.jpg`.
      Provenance was fine (homebrew and illustrations are the author's; tokens via a Forgotten Adventures
      sub, maps via Heroic Maps), but a sub grants the right to *use* an asset, not to *redistribute* it,
      and a public repo is a redistribution channel. It had also stopped being a real backup: last push
      2026-02-27 vs. ~350 uncommitted local changes since — the author moves data over the network now.
      The live campaign is untouched (11,416 files / 1.4 GB / 35 packs, local git history intact); the dead
      `origin` remote was removed. GitHub keeps deleted personal repos restorable for ~90 days at
      `github.com/settings/deleted_repositories` if ever needed.
