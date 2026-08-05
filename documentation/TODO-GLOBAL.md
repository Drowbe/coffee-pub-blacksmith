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
2. **A module's docs describe only that module.** Blacksmith documentation does not describe Curator's
   image replacement, Regent's AI, or Herald's broadcast. Those references get **deleted**, not relinked —
   a corrected cross-module link is still coupling.
   - Legitimate exception: showing how a *consumer* calls Blacksmith's API (e.g. "Squire registers a pin
     type like this"). That documents Blacksmith's surface, not the sibling's internals.
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

- [ ] **`plan-assets.md` (1,569 lines, no status)** — the last one. Trim the Vault feature spec (~1502–1515)
      to the one sentence stating a rule about *Blacksmith's* API contract; keep §3 and "Working role of
      Blacksmith core", which are legitimate boundary decisions. Then decide whether the rest folds into
      architecture. **Needs the same code-verification pass `plan-pins.md` got** — that one turned out to be
      not just stale but actively misleading, and this is six times the size.
- [ ] **Rename the two remaining docs whose names lie.** They're named "migration" or version-stamped while
      documenting current, shipped behavior; the stamps make correct docs read as obsolete.
      - `guides/guide-chat-card-migration.md` — this migration is *ongoing*, not done. Drop the Crier lessons
        section (4 of its 5 bullets duplicate Best Practices), rename away from "migration".
      - `guides/developer-note-pin-editing-visibility.md` — drop the "13.7.6" framing; consider merging into
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
correctly hedged as out-of-scope), `guides/guide-registering-with-blacksmith.md`, plus `api-stats.md`,
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
      for audience**: `api/` is all consumer, but so are `guides/guide-registering-with-blacksmith.md`
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

### Regent

- [ ] Query window roll flows: use `openRequestRollDialog` from Regent's `window-query.js` (not Blacksmith)
- [ ] Optional: `rolls.classify(message)` for skill lookup results already in chat

### Blacksmith (remaining internal work — tracked in `TODO.md`)

- [x] Phase 2: migrate `manager-rolls.js` d20 duplication; fix cinema DC 10
- [x] Phase 3: emit `attackResolved` from core dnd5e chat + optional MIDI (`manager-roll-outcomes.js`)
- [ ] Phase 3 follow-up: stats-combat dedupe consolidation (optional; stats lane unchanged)

---

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

**Ready-to-send notes** live alongside this file: `plans/note-regent-window-base-fork.md` and
`plans/note-suite-dialog-migration.md`.

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

Counted 2026-07-30. Application V1 `Dialog` is deprecated in v13, and `plans/migration-v14.md:158` already
names finishing the V2 migration for remaining dialogs as a v14 forcing function.

| Module | `DialogV2` | legacy `Dialog` |
|---|---|---|
| Squire | 0 | **21** |
| Monarch | 0 | **12** |
| Curator | 2 | 3 |
| Bibliosoph | 2 | 2 |
| Artificer | 1 | 2 |
| Regent | 0 | 2 |
| Scribe | 0 | 1 |
| **Blacksmith** | **33** | **0** |

~43 legacy V1 call sites across the siblings; Blacksmith is already clean. Blacksmith is building
`api.dialog` — shipped in 13.12.2; the contract is `documentation/api/api-dialog.md`.

- **Tell Monarch and Squire before they migrate.** Both are entirely on V1 and would otherwise each port to
  raw `DialogV2` independently — work that `api.dialog` would then undo. Squire is already engaged on the
  dialog API but has not been told its own code is 21 V1 sites with zero V2.
- Sequencing: `api.dialog` ships before the delegation fix above, because its audience is much wider.

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
| Public importer API | **Gated, not started.** See below. |
| Compendium search for a quick-add picker | **Delivered and verified 2026-08-02.** `api.compendiums.search(query, type, options)` — many candidates for one query, grouped by source, with `img` now on the cached index entries. 57/57 headless assertions in the harness's Compendium Search suite, grouping proven across 10 configured sources, ~5ms per warm query. Squire can build the quick-add tray on it; they must not build a second index cache over `getSelected()`, which is the whole reason it lives here. Blacksmith's own `window-compendium-search.js` palette is the reference consumer, including the drag-to-sheet payload. Squire shipped their tray on it and fed back two gaps, both closed 2026-08-02: `documentClass` on each result (they were deriving the drag payload's class from the type token, having merged three searches into one list), and `searchDetailed()` reporting `truncated` / `scannedSources` / `skippedSources` (they were inferring truncation from `results.length === limit`, which over-reports). Tell them both are available. |

### Importer API — the gate is real and already tracked

Squire is correct that `documentation/api/api-importer.md` still reads "Proposed contract", and that
`api.importer` does not exist on `module.api` — there are zero references in `blacksmith.js`. This is
deliberate, not an oversight: `tools/wiki-sync.mjs:83` holds both `api-importer.md` and
`architecture-importer.md` out of the publish set with an explicit gate, **"JSON import verified"**, which is
the "Live-verify the shipped 13.10.0 batch" item at the top of `TODO.md`.

So the sequence is: verify the 13.10.0 import batch in a live world -> publish the two importer docs ->
expose `api.importer`. Squire now being a waiting consumer raises that item's priority, and adds three
requirements to scope when it is designed: **validation reporting**, **progress/error reporting**, and
**scene-pin handling extension points** for Quest import. Until then Squire keeps its own import behavior
rather than deep-importing Blacksmith internals, which is the right call.

### Squire deep-imports Blacksmith script paths — RESOLVED 2026-07-30

Four Squire files resolved the window base with a `/modules/coffee-pub-blacksmith/scripts/window-base.js`
path fallback. Flagged, and Squire removed all four the same day. (`squire.js:38` importing
`/modules/coffee-pub-blacksmith/api/blacksmith-api.js` was never a problem — that is a real published entry
point.) Keep the rule in mind for the next consumer: `api-window.md` is explicit that file paths are not the
stable contract, and the base classes are on `module.api` before `init`, so a path fallback buys nothing and
breaks silently if a file moves.

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
