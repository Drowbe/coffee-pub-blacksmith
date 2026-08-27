# Plan: the architecture-doc audit

**Status: Planned -- findings recorded 2026-07-17, most fixes unstarted.** Live scaffolding. All thirteen
architecture docs were read against source; two are substantially fiction and three describe shipped work as
plans. The per-doc findings below are the work list.

**On completion:** each doc is corrected in place, the coverage table in `TODO-GLOBAL.md` records what has
been verified, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## ARCHITECTURE DOCS — audit results (2026-07-17)

All 13 audited against source. **Two are fiction, three are shipped-work-described-as-plans, and the pattern is consistent enough to name.**

> **The finding that explains almost all of it:** the house rule *"a doc that copies code drifts; a doc that points at code doesn't"* held as a **natural experiment**. In `architecture-blacksmith.md`, everything that *points* (file inventory 45/46 correct, the style list exactly right, the §9A trap list 7/9, all cross-links) survived intact. Everything that *narrates or copies* (§3.1's hand-maintained call sequence, §2.1's transcribed esmodules array) rotted. Same doc, same author, same age — the only variable was pointer vs copy.

### `architecture-rolls.md` — ASCII diagrams and API Reference still encode the wrong flow
- The trim and the correction block shipped (see `CHANGELOG.md`, architecture-docs audit). Remaining: the ASCII diagrams and the API Reference section still encode the old 4-function/public-internal model. The real flow is 3-function (`requestRoll()` is commented-out legacy), `orchestrateRoll` throws without an existing message id rather than creating cards, and the socket direction is inverted (roller→GM). Rewriting the diagrams needs a session with the code.

### ⛔ `architecture-socketmanager.md` — 81% fiction, BORN fiction. REWRITE NEEDED — #1 POST-RESET EFFORT
- **Priority (author, 2026-07-17): #1 after the wiki reset**, ahead of the design-system effort — sockets and hooks are the two most critical systems. (The hook-system doc, `architecture-hookmanager.md`, was already rewritten from source this session; sockets is the remaining critical one.) Excluded from the first wiki publish; rewrite from `manager-sockets.js` preserving the god-module analysis.
- **67 of 83 symbols phantom.** Proven never-real by `git log -S`: `_handleIncomingMessage`, `performanceMetrics`, `_initializeLocal`, `_detectSocketLib` have **only ever existed in this doc file, in any commit**. Added whole 2025-08-28, when `manager-sockets.js` already looked as it does now. Never described this codebase.
- Invented: a third "Local Mode" transport, batching, reconnection/backoff, replay-attack validation, latency metrics, a config system, four debug globals.
- **Most dangerous:** it invents a security model. Reality is `_isLocalRecipient()` (`:125`) filtering **on receipt** — both transports broadcast to every client. Source: *"emit() must never carry secrets"* (`:306`).
- **Header added; body left for diffing.** Do NOT delete: the socket layer has no other contributor doc, and the **"Migration Plan" section is real** — the god-module problem (SocketManager imports 6 UI subsystems at `:14-19`) is live and correct. Its status is stale (`module.api` exposure shipped at `blacksmith.js:1298`).

### `architecture-blacksmith.md` — KEEP, fix §3.1 (the map a new contributor reads first)
- **§9A is right and §3.1 is wrong — the doc contradicts itself and the correct half loses.** §3.1 claims `hookCanvas()` registers canvasInit/canvasReady/updateScene/dropCanvasData. It registers **no hooks** (`:821-837` only injects the layer class); those live in `initializeSceneInteractions()` (`:617`, called during `ready`) and three are gated on `enableSceneClickBehaviors`. §9A says so correctly.
- **§3.1 lists lifecycle phases in the wrong order** (`setup → init → ready → canvasReady`; Foundry runs `init → setup → canvasReady → ready`). Its own phase *numbers* are right — only the list order is wrong. Worst possible place for it.
- §3.1 also self-contradicts §4.3 on `BLACKSMITH.rolls.execute` (§4.3 correctly says removed), and names phantoms `ConstantsGenerator`, `registerWindowQueryPartials`, `executeRoll`, `_setupDomObserver`.
- §9A's `removeCallback` "trap" is now **stale — we fixed that code today**. Delete it.
- §2.1 drift: esmodules omits 2 files (9, not 7); ships **two** style entries, not one.
- §11 (~89 lines) is a migration plan — honestly fenced, but belongs in this file.
- **Verified excellent and worth protecting:** file inventory 45/46, style list exact (48 imports, names and order), §9A Quick View line-for-line, §4.3 roll exports exact, §9B.2 dead-code table (its `_setupActivePageChecker` row looks like a false positive but is **transitively dead** — the doc is right).
- **Live bug it predicted:** §7 warns "a new stylesheet is silently unstyled unless added to `default.css`". `styles/widget-tags.css` is on disk, imported by nothing — it matters because `TagWidget.registerPartial()` is live at `blacksmith.js:543`. (A second instance, `journal-toolbars.css`, was genuinely dead and has since been deleted.)

### `architecture-toolbarmanager.md` — 20 phantoms; ~60% is a superseded plan
- 8 phantom API names (`registerBlacksmithTool`, `BlacksmithToolbarManager`, `TokenControlToolbarManager`, …) presented as the design to implement; that design was abandoned for what shipped. It **documents and disclaims the same phantom class** 160 lines apart.
- Says **"9 default tools"** — actual is **5**. Third wrong count in this file's history; note line 14 already warns readers not to trust its lists, then line 150 supplies one.
- Copied `request-roll` block says `zone: 'rolls'`; actual is `gmtools`. Tool Data Structure omits `onCoffeePub`/`onFoundry`/`toggle` (load-bearing). Claims `icon`/`title` required; both default — only `onClick` is (now validated).
- 3 wrong file paths, 1 fictional CSS selector.
- **Doc arguably right vs code:** its "Tool Visibility System" implies parity, but `getFoundryToolbarTools()` ignores `tool.visible` while `getVisibleTools()` honors it. Fix belongs in code.

### `architecture-tags.md` — MAJOR-REWRITE, but **fix the code split first**
- Root cause: the system was renamed **Flags → Tags**; the code finished, the doc didn't. Its title says Tags, its body says flags — so it names 5 phantom files (`widget-flags.js` → real `widget-tags.js`, etc.) and a phantom `api.flags` namespace.
- **Do not rewrite it yet.** The doc's JSON section is *correct* for the shipped `tag-taxonomy.json` (which really does use `flags`). Rewriting to `tags` while the JSON ships `flags` just moves the lie. Fix the three-shape split first (see the Tags entry below), then document one schema.
- Also: four-tier classification is fiction (code has `taxonomy`|`global` only); `TagWidget.prepareData` is documented positional but takes an **object**; `activate()` omitted (widget renders inert without it); context key documented `.quests`, shipped JSON has `.quest`.

### `architecture-stats.md` — MAJOR-REWRITE (~66% is a decision memo)
- **Its central storage claim is inverted.** It says "**NO PERSISTENCE** — all combat data is lost" and recommends *against* storing summaries. The code stores every one, deliberately unbounded, in the `combatHistory` world setting (`stats-combat.js:1090`, `settings.js:2141`). Option C was chosen and shipped; the doc still presents it as an open question.
- It proposes "keep last 10-20, prune oldest" — **the pruning lie in proposal form.** Delete it or it regenerates.
- §2 misattributes an entire subsystem: claims `stats-player.js` owns `combat.setFlag('combatStats')`. That file has **zero** combat setFlag/getFlag/unsetFlag; its only flag is `actor.setFlag('playerStats')`. 8 phantoms.
- Asserts clean ownership of the `stats` flag; reality is the known three-way collision — and **worse than recorded**: `timer-round.js:233` also writes *wholesale*, clobbering `currentStats` in the other direction.
- Never mentions that **all writes are GM-gated** — a real gap. Keep the data-flow diagram (L726-752, verifies almost perfectly); add the `combatHistory` write.

### `architecture-xp.md` — KEEP-WITH-FIXES (weakest of the "real" docs)
- Resolution multipliers wrong on **4 of 6**, and wrong in *mechanism*: they're GM-configurable settings (`xpMultiplierDefeated` etc.), not the fixed constants the doc lists.
- Calls `XpDistributionWindow` a `FormApplication`; it extends `BlacksmithWindowBaseV2` (`xp-manager.js:806`).
- Its "Known Issues" section describes a circular-dependency bug **that is already fixed** — the code at `:878` implements the exact proposed fix. Delete.
- Possible latent code bug: two entry points produce different monster shapes (`openXpDistributionWindow` → raw Combatants; `calculateXpData` → the documented shape). The doc may be describing correct *intent*.

### `architecture-pins.md` — KEEP-WITH-FIXES (the recent rewrite mostly holds)
- Verified strong: schema v7, all 6 migration rows exact, all 9 schema defaults byte-exact, permissions model exact, all 5 lifecycle hooks.
- **"No canvas layer is used for pins" is false** — `canvas-layer.js` defines `BlacksmithLayer`, registered at `blacksmith.js:830`, and it is a pin lifecycle entry point (`_draw()` → `PinRenderer.initialize()`, `activate()` → `loadScenePins`). Absent from Components entirely.
- **`pinTagRegistry` is filed under "client settings"; it is `scope: 'world'`** (`settings.js:3451`) — and this contradicts the doc's own three-concerns spine, since it's shared vocabulary, not view state. Highest-value fix.
- Shape list omits `rectangle` — note it matches the **buggy** `update()` whitelist rather than the design. Don't "correct" the doc to the bug.
- `_getPinLocation` → real name `_findPinLocation`. Event list omits 7 of 16. Filter-change mechanism misdescribed (it's `applyVisibilityFilters()`, not a reload).

### `architecture-token-naming.md` — REAL. The model doc.
- Promoted from a plan **properly**: describes built behavior, and its "Do not enumerate the keys" callout applies the house rule correctly *and is self-aware about the prior failure* ("The plan this doc replaced hardcoded '18 keys'; the file had 20" — the file has 20).
- One phantom: `flag-taxonomy.json` → real `tag-taxonomy.json`.
- Its §3 pseudocode **drops rung 2** of the cascade and contradicts its own §2 — the copy-drifts rule biting an otherwise good doc. Replace the block with a pointer to `utility-token-naming.js:231`.

### Audit coverage gaps — what was NOT checked (2026-07-17)
Recorded so a future pass doesn't mistake silence for a clean bill of health.
- **`api-pins.md`** (~100 symbols checked, largest doc): NOT verified — `reconcile()` internals; the five GM tag mutators' bodies (so doc claims about scrubbing saved visibility-profile snapshots are **unverified**); `seedTagRegistryIfEmpty` semantics; arc-text layout / `textMaxWidth`; `imageFit`/`imageZoom`; the v4→v7 schema migration chain; most `window-pin-layers.js` UI claims. Given the reserved-profile-name finding, **the profile/UI-layer claims are the least trustworthy area**.
- **`architecture-*.md`**: 10 docs, still substantially unverified. `architecture-socketmanager.md` is known fiction (30/30 symbols phantom). `architecture-hookmanager.md` needs ~900 of 1411 lines cut.
- **Fence checker**: `scratchpad/check-fences.ps1` syntax-checks all 378 JS fences across the API docs (tries whole-module, function-body, class-body, and object-literal readings before reporting). ~29 remaining hits are pseudo-code fragments, not defects. Worth keeping if you want it in the repo.
