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

### Inventory — DONE (2026-07-16)

Swept all 30 docs mentioning a sibling (~280 real references) plus a behavior-word sweep for stale content
that names no sibling. **Finding: sibling contamination is mostly a non-problem.** The large majority of
references are siblings used as example *callers* — the KEEP case. Real coupling is ~30 lines plus two
misplaced files. The bigger problems are **factual errors** and **stale naming**.

Counts inflated by a bad grep: `scribe` matches `subscribe`/`describe`. **`api-stats.md`,
`api-campaign.md`, and `architecture-chatcards.md` have ZERO real sibling references.** Use `\b` word
boundaries next time — `vault`, `crier`, `monarch`, `herald` have the same trap.

#### Whole-file decisions

- [ ] **`design-system/pattern-inventory.md` — remove from Blacksmith.** Its own line 2: *"Audit of
      coffee-pub-minstrel and coffee-pub-artificer vs coffee-pub-blacksmith"*; titled "Cross-Module Pattern
      Inventory". It is a suite-wide CSS audit **of two siblings**, not a Blacksmith doc — 52 sibling
      mentions in 165 lines, and §§1A–1I/2/3A–3F are *entirely* sibling internals. Line-by-line triage
      would delete the document. Its conclusions already landed in `design-system.md` §10.11–10.20
      (verified). **Needs a destination decision — there is no suite-level repo today.**
- [x] **`request-registerapi.md` — DELETE.** A feature *request* asking Blacksmith to proxy Curator's API
      via `registerModule`. Answered "no", three ways: `manager-modules.js` has no `api` branch;
      `BlacksmithAPI.curator` doesn't exist; the inverse pattern shipped instead
      (`manager-combatbar.js:1458` reads Curator's api directly; Curator registers inward via
      toolbar/menubar). Bottom two-thirds is a Curator API spec. Not parked in `plans/` — keeping it would
      imply the registry is still roadmap.

#### Factual errors (higher priority than coupling — wrong docs cost more than coupled docs)

- [ ] **`architecture/architecture-toolbarmanager.md:14`** claims Blacksmith's toolbar has predefined tools
      `regent, lookup, character, assistant, encounter, narrative, css, journal-tools, refresh`. **Six of
      nine moved to Regent** — `manager-toolbar.js:229`: *"Regent/lookup/character/assistant/encounter/
      narrative are in coffee-pub-regent"*. Only `css`, `journal-tools`, `refresh` are accurate.
- [ ] **`architecture/architecture-blacksmith.md` contradicts itself.** §4.4/§5/§7 document the Regent
      extraction as **done**; §11.3 (line 276) and §11.4 (line 321) list it as **planned future work**.
      Reconcile §11 — don't just strip names.
- [ ] **`api/api-menubar.md:238`** presents "Broadcast View Mode tool" as a Blacksmith tool. It's Herald's.
      **Names no sibling, so a name-based grep will never find it** — found only via a behavior-word sweep.
- [ ] **`architecture/architecture-window.md:63`** still lists `TokenImageReplacementWindow` as a Blacksmith
      window pending ApplicationV2 migration. It moved to Curator.

#### Broken links (5 real markdown links; verified)

- [ ] `api/api-canvas.md` → `./cartographer.md` — target does not exist (2 places: 332, 560)
- [ ] `api/api-core.md` → `cartographer.md` (2277) — does not exist
- [ ] `api/api-core.md` → `../../coffee-pub-regent/documentation/api-openai.md` (2264) — wrong depth **and**
      cross-module; deletes under Ground Rule 2
- [ ] `api/api-hookmanager.md` → `architecture-hookmanager.md` — flat path, needs `../architecture/`
- [ ] `guides/blacksmith-apis.md:23,44` — prose references to `documentation/api-window.md`. **The file
      exists** at `documentation/api/api-window.md`; the path is stale. (Not markdown links, so not
      "broken" — just wrong.)

#### Line-level deletions (sibling internals)

- [ ] `api/api-window.md` — 95 (Regent's config value), 201 (hardcodes Regent's file path), 281 (describes
      Regent's implementation strategy). Lines 185/199/205/206/241/243/244/271 are KEEP.
- [ ] `api/api-core.md` — 1255 ("Newly exposed functions for Scribe"), 2264, 2277.
- [ ] `api/api-canvas.md` — 332, 560 (Cartographer doc links).
- [ ] `api/api-gmnotes.md:5` — explains Squire's sticky-notes architecture to draw a contrast.
- [ ] `api/api-pins.md:1968` — reaches into Squire's internals
      (`PanelManager.instance.notesPanel._refreshData()`). `1489` — genericize the Artificer taxonomy payload.
- [ ] `api/api-menubar.md:356` — describes Herald's broadcast/cameraman feature. (359 is KEEP — caller id.)
- [ ] `architecture/architecture-blacksmith.md` — 13, 130, 135, 150, 158, 163, 196, 230, 236. **Careful at
      163**: `MovementConfig`/`VoteConfig` share the line and must survive.
- [ ] `design-system/design-system.md` — 889, 967, 1056. Mechanical: drop the trailing "Replaces `...`"
      clause naming sibling CSS classes. §12 is clean (generic `my-module` placeholders).
- [ ] `applicationv2-window/guidance-applicationv2.md:3` — grounds Blacksmith's zone contract in
      Artificer's Skills Window as the source of authority.

#### Handle with care — real content wrapped in sibling framing

- [ ] **`architecture/architecture-pins.md:160`** — "Lessons learned (from Squire implementation)". The body
      (162–175) is genuine Blacksmith rationale: why pins are DOM not PIXI, why two stores, why AbortSignal
      cleanup. **Retitle to "Design rationale"; keep the body.** A naive delete destroys good docs.
- [ ] **`architecture/architecture-window.md:43`** — only the final sentence citing Regent's
      `regent-encounter-worksheet.js` goes. The surrounding two-patterns guidance is valuable and stays.
- [ ] **`plans/plan-assets.md`** — deciding what Blacksmith core ships vs. what moves out is a legitimate
      Blacksmith question; you can't define a boundary without naming the other side. Keep §3 and "Working
      role of Blacksmith core". Trim "Working role of Vault" (1502–1515) — a feature spec for a sibling —
      down to line 1515, which states a rule about *Blacksmith's* API contract.

#### Rename — stale framing on substantively correct docs

These are named "migration" or version-stamped when they document current, shipped behavior. At 13.8.5 the
stamps make correct docs read as obsolete.

- [ ] `guides/guide-pin-migration.md` — cut the three "What changed in 13.x" tables (9–61) and §3 (127–141)
      as completed history; rename to `guide-pins-integration.md`. Header says "as of v13.6.3".
      **Caveat RESOLVED — safe to cut.** Checked every sibling repo: **no module writes the legacy
      `'owner'` value or a pin `group:` field.** The only pins consumers are Squire
      (`scripts/manager-pins.js`), Artificer (`scripts/manager-pins.js`), and Curator (`scripts/curator.js`,
      `scripts/tile-image-window.js`), and Squire writes the v7 values (`blacksmithAccess: 'gm'`,
      `blacksmithVisibility: 'visible'`). The "stop using" tables are pure history.
- [ ] `guides/guide-chat-card-migration.md` — this migration is *ongoing*, not done (`TODO.md:29`). Drop the
      Crier lessons section (581–590; 4 of 5 bullets duplicate Best Practices), rename away from "migration".
- [ ] `guides/developer-note-pin-editing-visibility.md` — drop the "13.7.6" framing. Overlaps heavily with
      the pins guide; consider merging.

#### No action needed

`api/api-tags.md` (22 refs, all textbook), `api/api-sockets.md`, `api/api-create-journal-entry.md`,
`architecture/architecture-tags.md` (8 refs, all clean), `TODO.md` (image-replacement backlog items are
correctly hedged as out-of-scope), `guides/guide-registering-with-blacksmith.md`, plus the three
zero-reference files above.
- [ ] **Audit the rest of `architecture/architecture-blacksmith.md`.** §4.3/§5/§7 and its doc links were
      corrected against the filesystem; the other sections were never verified.
- [ ] **Verify doc-claimed filenames across all architecture docs.** §4.3 alone had 8 pre-rename names.
      The rename to `manager-*`/`ui-*`/`window-*` left drift elsewhere.
### Wiki

**Decided:** the wiki is the official doc hub for consumers and is a **pure mirror** of the Blacksmith repo
docs. **The repo is law.** Nothing is authored wiki-first.

**Reality check (audited):** of 25 wiki pages, only **13 are exact mirrors**. The rest have drifted.

- [ ] **Write a mapping manifest** (repo path → wiki page) and check it into the repo, so the mapping is
      law rather than guesswork. **The mapping is NOT derivable from filenames** — `API:-Core-Blacksmith`
      ↔ `api-core.md`, but `Architecture:-Core.md` actually mirrors **`architecture-blacksmith.md`**
      (its first line is "Blacksmith Module Overall Architecture"), not `architecture-core.md`. A script
      that guesses by name will publish the wrong content — plausibly how the mis-publish below happened.
- [ ] **Delete `API-OpenAI-DEPRECATED.md`.** It is **byte-identical to `api-toolbar.md`** — a duplicate of
      the Toolbar page published to the wrong filename, not a stale OpenAI page.
- [ ] **Delete `Image-Replacement-Architecture.md`** — Curator's domain (Ground Rule 2).
- [ ] **Resolve 6 drifted pages** (repo counterpart exists, wiki content differs): `API:-Request-Roll`,
      `API:-Window`, `Architecture:-Core`, `Architecture:-Hook-Manager`, `Socket-Manager`, `Todo`.
      Repo is law → republish from repo. Confirm nothing valuable exists only on the wiki copy first.
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
- [ ] **Decide mirror scope.** 48 docs live under `documentation/`; only ~19 have wiki pages. Guides,
      plans, design-system, PERFORMANCE.md and most architecture docs are unmirrored. Mirror everything,
      or only the consumer-facing API surface?
- [ ] **Build the publish path.** The wiki **cannot be checked out on Windows** — pages are named
      `API:-Pins.md` and `:` is illegal in NTFS. Clone succeeds, checkout fails. Must go through bare-repo
      git plumbing (verified working: `git clone --bare` + `git show HEAD:<page>` reads fine).
      **Publishing is public: never push without explicit per-push approval.**
- [ ] **Decide whether `TODO.md` belongs on the wiki at all.** The wiki's `Todo.md` is titled "TODO -
      Memory Leaks and Performance Issues" vs the repo's "TODO - Active Work and Future Ideas" — it's an
      old snapshot. Repo is law, so it's either republished or dropped from the mirror. (A consumer-facing
      doc hub arguably shouldn't carry an internal task list.) **`TODO-GLOBAL.md` must never be mirrored.**

## Phase 2 — Packs / compendiums

**DECIDED: Blacksmith stops bundling compendiums. For now, it bundles none.**

**A compendium is not part of a module.** It's a pack of documents that exists on its own; a module *may*
ship one, but that's a packaging choice, never ownership. Compendiums don't need to be "moved" or "rehomed"
when we unbundle — they simply stop riding along in Blacksmith's zip. If we later choose to provide content,
we bundle it deliberately, from wherever we decide — and it won't be part of Blacksmith unless we choose that.

Users already select their compendiums and roll tables in Blacksmith's settings, so the module has no reason
to carry a payload.

**Evidence this is safe:**

- `settings.js:188` builds compendium choices from **`game.packs.values()`** — every pack the user has.
  `manager-compendiums.js:77` resolves the chosen pack from user settings (`${prefix}${i}`), never from a
  bundled pack. Settings exist for Actor, Item, Spell, Feature, JournalEntry, **RollTable**, and Cards.
- No Blacksmith code references `blacksmith-tables`, `blacksmith-injuries`, `treatments`, or `user-manual`.
- No sibling module references them either. Verified by grep across all 13 repos.

**Tasks:**

- [ ] Remove the `packs` array from `module.json`.
- [ ] Drop `packs/` from the release zip allowlist in `.github/workflows/release.yml`.
- [ ] Remove `packs/` from the repo. (Also kills the LevelDB churn, the `lost/` repair detritus, and the
      undeclared `packs/injuries` in one move.)
- [x] **Data is safe.** The compendium contents were imported into the world from the production site.
      Nothing needs rescuing from `packs/` before it goes. (The 154 files also remain on disk, ignored by
      git, and in git history.)
- [ ] **Release note — this is the one user-visible consequence.** A module compendium exists *only*
      because `module.json` declares it. Removing the declaration makes the pack vanish from Foundry even
      though the files are still on disk. So on update, users simply lose `blacksmith-injuries`,
      `blacksmith-tables`, `treatments`, and `user-manual` — and unlike us, they can't import the content
      afterward. Anyone who wants to keep it must import to a **world** compendium *before* updating.
      Decide: changelog line, or a deprecation release that still ships the packs but announces removal?
      (Weakened by the fact that injuries are being rebuilt in Bibliosoph anyway — see below.)

**Note for later, if we ever bundle content again:** Artificer declares 8 packs but has 17 directories on
disk (`beverages`, `blueprints`, `containers`, `food`, `ingredients`, `objects`, `poisons`, `potions`,
`recipies` — typo'd, alongside the declared `recipes-blueprints`). Whatever pattern we adopt should prevent
that drift. Also revisit the "add more and more pack info to make builds pass" habit — believed to be
5-year-old cargo cult.

## Phase 3 — Roll tables

**Key finding: `blacksmith-tables` is loot/merchant content, not injuries/fumbles/crits.** Table names:
`Loot Tables`, `Loot: Treasure`, `Merchant: Crafted Potions`, `Potion of Poison`, `Burnt Othur Fumes`,
`Serpent Venom`, `Fine Clothes`.

**All 30 results are `type: "document"` — zero text results.** These tables are already pure shells. They
point at:

- `Compendium.dnd-dungeon-masters-guide.equipment.Item.*` — **official licensed D&D content.** Users
  without the DMG module get broken UUIDs.
- `Compendium.burden-of-knowledge.bok-roll-tables.RollTable.*` — **a module treated as a backup**, likely
  never published.

Blacksmith currently ships a compendium that only resolves if the user owns a paid module *and* has a
retired one. **Phase 2 makes this moot for Blacksmith** — unbundling removes the broken shipment entirely.
What remains is the rule for any future bundling, and the open question of where the injury/fumble/crit
content actually is.

- [x] **ANSWERED: the injury/fumble/crit/investigation tables live in `burden-of-knowledge`**, in its
      `bok-roll-tables` pack (199 roll tables). Found by name: `Fumbles`, `Critical Carnage`,
      `Investigation: Common`, `Investigation: Very Rare`, `Purple Worm Poison (Injury)`. This is the same
      compendium the old `blacksmith-tables` pack pointed into
      (`Compendium.burden-of-knowledge.bok-roll-tables.RollTable.*`), which is why those pointers only ever
      resolved on the author's own machine.
      **Resolved by design, not by migration.** The tables live in the author's Burden of Knowledge
      campaign, and modules point at them through Blacksmith's compendium settings — exactly the intended
      model (compendiums exist independently; modules select them). Nothing for Blacksmith to do.
      `burden-of-knowledge` is the author's live campaign data — a real 1.4 GB module with 27 declared
      packs, not a backup (the *GitHub repo* is the stale backup).

### Bibliosoph — injuries rebuild (IN PROGRESS as of 2026-07-16)

Being redesigned now. The injuries content is **not** being ported as-is from the old compendium; it's
being rebuilt. The old pack data is reference material at most.

- [ ] **Migrate injuries to flags** rather than compendium documents.
- [ ] **Add a creation form** for authoring injuries.
- [ ] Bibliosoph currently declares **zero packs** and has no `packs/` directory. Decide whether the
      rebuilt system needs a bundled compendium at all, or whether flags + a form make one unnecessary —
      which would be the cleanest outcome and consistent with Ground Rule 3.
- [ ] **Write down the shell rule** (Ground Rule 4) as a documented, checkable convention, so that *if* we
      ever bundle tables again we don't ship pointers into content we don't control. `blacksmith-tables` is
      the cautionary example: 30/30 results are document references, aimed at the DMG and a backup module.

---

---

## Open questions for Drowbe

1. **Mirror scope** — all 48 docs, or only the consumer-facing API surface + README-as-Home?
2. **`Get-Started-AI-Prompt`** — recover into the repo, or delete? (It never existed in the repo.)
3. **Does unbundling warrant a deprecation release**, or just a changelog line? Users lose four
   compendiums and cannot recover them post-update.
4. **Do the injury/fumble/crit tables exist anywhere we still control?** Not in `blacksmith-tables`;
   possibly only in `burden-of-knowledge` (a backup). Matters for Bibliosoph, not for Blacksmith.

---

## Done

- [x] **Fixed `ModuleManager.registerModule()`, which had never worked.** It gated on a registry populated
      from `window.COFFEEPUB.MODULES` — a key nothing has ever assigned — so it returned `false` for all
      nine sibling modules that call it, silently (the error is debug-gated). Detection now reads
      `game.modules` directly by `coffee-pub-` prefix, and `registerModule()` self-registers on demand.
      `manager-modules.js`. **Not yet verified in a running Foundry — no test suite exists.**
- [x] Corrected `architecture-blacksmith.md` §4.3/§5 filenames and rewrote §7's CSS list from the actual 48
      `@import`s; all doc links now resolve. Removed the Curator image-replacement cross-reference per
      Ground Rule 2.
- [x] Untracked LevelDB runtime artifacts (`LOCK`, `LOG`, `LOG.old`) and **72 orphaned `lost/MANIFEST-*`
      files that were shipping to users in the release zip** (`packs/` is zipped; `documentation/` is not).
- [x] Scoped the `*.log` gitignore rule so it no longer swallows LevelDB write-ahead logs — a latent
      data-loss bug (harmless today only because every WAL happens to be 0 bytes).
- [x] Added `CLAUDE.md`.
- [x] **Deleted the public `Drowbe/Burden-of-Knowledge` GitHub repo** (2026-07-16). It was **PUBLIC and
      1.29 GB**, republishing the campaign's raw assets — 2,616 `.webp`, 519 `.mp3`, 82 `.png`/`.jpg`.
      Provenance was fine (homebrew and illustrations are the author's; tokens via a Forgotten Adventures
      sub, maps via Heroic Maps), but a sub grants the right to *use* an asset, not to *redistribute* it,
      and a public repo is a redistribution channel. It had also stopped being a real backup: last push
      2026-02-27 vs. ~350 uncommitted local changes since — the author moves data over the network now.
      The live campaign is untouched (11,416 files / 1.4 GB / 35 packs, local git history intact); the dead
      `origin` remote was removed. GitHub keeps deleted personal repos restorable for ~90 days at
      `github.com/settings/deleted_repositories` if ever needed.
