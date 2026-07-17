# Plan — Documentation & Wiki Reset

**Status:** Planned (awaiting author confirmation on the flagged dispositions below)
**Outcome type:** refactor (documentation)
**Created:** 2026-07-17

Kill the stale wiki and rebuild it fresh from clean, accurate source docs. Unify formatting, drop all
emoticons/icons, rename to a flat kebab mirror, and collapse everything back to the five documented kinds.
This is scaffolding — delete this file once the work lands and its content is distributed.

## Locked decisions (author, 2026-07-17)

1. **Naming = literal kebab mirror.** Repo filenames stay kebab (`api-core.md`, `architecture-core.md`);
   wiki pages are the same names, flat, no colons. Dissolves the Windows-checkout blocker (the
   `Architecture:-Core` colon page — the *whole* current wiki uses colon page names) and lets the sync
   be automated. Every intra-doc link to a `wiki/API:-Foo` URL breaks and must be rewritten (P6).
2. **Bugs live in a published Known Issues doc, not as in-doc warnings.** Published docs describe only
   correct current behaviour; defects live in `known-issues.md`. This *resolves* the tension noted below:
   removing in-doc warnings is no longer lossy because the bug info stays public in one authoritative
   place. Docs still must not state a positive falsehood — where a warning guarded a real divergence, the
   prose is restated accurately and the defect goes to Known Issues.
3. **Partition model: three tenses, one gate.** Known Issues = present defects (public). TODO = future
   work AND held-back security issues (private). CHANGELOG = past fixes (public). No item in two places →
   no drift. **No shadow entries:** a bug is never both a Known Issue and a "fix it" TODO; its fix note
   lives inline in the Known Issue. **Sensitivity gate:** a weaponizable defect is NOT published while
   unpatched — it stays in a marked "Security — do not publish" section of TODO and surfaces only in
   CHANGELOG after the fix. The sync publishes only the designated set and runs a secret-scan gate.
4. **Layout:** Known Issues is its own file, `known-issues.md` (present/future boundary = file boundary).
5. **`guides/` → fold into the five kinds** (confirmed; the guides had already drifted from the API docs —
   rectangle "works", `getPinTaxonomyChoices` "merges everything"). Map:
   - `guide-registering-with-blacksmith.md` → promote to the dev Home/Overview (fix its dead `unloadModule` example).
   - `guide-pins-integration.md` + `developer-note-pin-editing-visibility.md` → merge, correct, fold into `api-pins.md` as a Usage section.
   - `guide-chat-card-migration.md` → extract evergreen authoring into `api-chatcards.md`; delete the migration/"Crier lessons"/duplicate-API-section cruft.
   - `blacksmith-apis.md` → delete (the wiki Home replaces its link index).
   - The fresh wiki must NOT recreate the cross-module `API: OpenAI` page (that is Regent's surface). Verify `API: Supplement` is a real Blacksmith surface or drop it too.
6. **`design-system.md` → defer to its own effort, TOP priority after the reset.** Not bundled (unaudited,
   1,219 lines; splitting is a restructuring plus a CSS reality-check). It is the cross-module design-continuity
   source and should become *upstream* of the component docs (chat cards, windows, pins, menubar) rather than
   a standalone reference. Excluded from the first fresh-wiki publish; tracked in `TODO.md` (ENHANCEMENTS →
   High). Split target: architecture-definition + consumer-reference.
7. **`applicationv2-window/` → defer the guidance fold to the design-system/window effort; keep the asset
   files; exclude from the first wiki publish.** The guidance `.md` (how-to) folds into `architecture-window.md`
   (zone contract + rationale) and `api-window.md` (how-to/best-practices/issues) when that effort reconciles
   windows — not now, to avoid double-touching the window docs. Keep `example-window.hbs`/`.js` + the diagram
   images as repo assets the docs point at; delete `README.md` (pointer). The window zone contract currently
   lives in THREE places (`architecture-window.md`, this guidance, `design-system.md` §3.3/§10.5/§10.11) — the
   design-system effort consolidates it to one.
8. **`architecture-socketmanager.md` → exclude from the first wiki publish; rewrite deferred as a tracked TODO.**
   Keep the ⛔ file as the diff target; preserve the god-module analysis when rewritten. **Reprioritized
   (author): the socketmanager rewrite is now the #1 post-reset effort, ahead of the design-system split —
   sockets and hooks are the two most critical systems.** (The hook-system doc was already rewritten from
   source this session.)
9. **`architecture-core.md` → DELETE** (confirmed). Repoint or remove the "Core utilities" cross-reference in
   `architecture-blacksmith.md` and any other referrers.

## The formatting standard (the "unify" target)

Every published doc conforms to this:

- **No emoji or decorative icons** — not in headers, prose, tables, or example output strings. Replace
  `console.log('✅ Foo working')` with `console.log('Foo working')`; drop `📋`, `🔧`, `⭐`, `⚠️`, `⛔`, etc.
- **Uniform header.** Line 1: `# <Name>`. Then one bold audience line, then a one-sentence scope line, then
  a rule about where the authoritative counterpart lives if any. No "Last Updated: Current session" footers,
  no status-theatre ("production-ready", "WORKING PERFECTLY").
- **No notes/warnings/TODOs.** No `> ⚠️` blocks, no "KNOWN BUG", no "we should", no "planned". Prose states
  what is. Anything pending or broken → `TODO.md` only.
- **Point at code, don't copy it.** `file.js:line` pointers over pasted classes/constant-lists/signatures.
  (Existing repo rule; the audits proved every copied block drifts.)
- **Accuracy is not negotiable** (see tension note).

## Tension note — decision #2 vs. the no-lies rule

Decision #2 removes in-context bug warnings. The repo's hardest rule is that a doc must never state
something the code contradicts. These collide when a removed warning would leave a *positive false claim*
(e.g. deleting the "native `emit` doesn't reject" note leaves the doc implying it always does).

**Reconciliation used in this plan:** remove the alarm styling, the icons, and the "this used to say X"
archaeology — but keep the remaining prose *factually accurate*. Where a warning guarded a real divergence,
restate it as plain current-behaviour description (no icon, no "bug", no "should"), and file the fix-task in
`TODO.md`. We do not publish a clean contract the code violates.

Example — `api-sockets.md` `emit`:
- OUT: the `> ⚠️ emit does not reject under the native fallback` block.
- IN: one plain sentence — "Under SocketLib a targeted `emit` to a disconnected user rejects; under the
  native fallback it resolves regardless." (True of both paths, no alarm, no lie.)
- `TODO.md`: keep the existing "make native `emit` reject" task.

**Author: confirm this reading.** The alternative you can pick instead: docs present the *intended* contract
and omit the divergence entirely, accepting the doc is rosier than the code until the bug is fixed. I did not
assume that, because it reintroduces exactly the class of lie we spent three nights removing.

## Per-doc disposition

### Publish to wiki — clean, de-icon, de-note, unify (16 API + surviving architecture)
All `api/*.md` and all `architecture/*.md` except the two below. These are the fresh wiki's body.

### Delete
- `architecture/architecture-core.md` — misnamed, duplicative, wrong on its two unique claims (audited).
  On delete, repoint `architecture-blacksmith.md`'s "Core utilities" cross-reference. **Removing this also
  removes the colon page from the wiki mirror.**

### Rewrite from source before it publishes
- `architecture/architecture-socketmanager.md` — 81% phantom, born fiction. Either rewrite from
  `manager-sockets.js` (outline is in `TODO.md`) or **exclude from the fresh wiki until rewritten**. It must
  not go up as-is. **Author: rewrite now, or exclude-until-later?**

### Not one of the five kinds — needs disposition (FLAGGED)
- `guides/` (5 files): `blacksmith-apis.md` (32), `guide-registering-with-blacksmith.md` (82),
  `guide-pins-integration.md` (198) → consumer how-to; fold into the relevant `api-*.md`.
  `developer-note-pin-editing-visibility.md` (268) → contributor note; fold into `architecture-pins.md`.
  `guide-chat-card-migration.md` (676) → a migration guide for shipped work; per the rule, history →
  `CHANGELOG` and delete. **Author: confirm fold-vs-delete, especially the 676-line migration guide.**
- `design-system/design-system.md` (1219): consumption is API, definition is architecture. **Recommend a
  separate effort** — it's large enough to derail the wiki reset. For now: exclude from the fresh wiki,
  leave in repo, track the split as its own `TODO.md` item. **Author: bundle now or defer?**

### Not published to the wiki (internal working artifacts)
- `TODO.md`, `TODO-GLOBAL.md`, everything in `plans/`. These stay in the repo, out of the mirror.
- `applicationv2-window/` — implementation guidance + example `.hbs`/`.js`/images. Keep the folder as a repo
  asset; clean the `.md` to standard; decide separately whether it belongs on the wiki (leaning no — it's
  build-a-window guidance, adjacent to `architecture-window.md` which can point at it).

### Proposed wiki publish set
`Home` (from README/overview) + `api-*` + surviving `architecture-*` + `CHANGELOG`. Nothing else.
**Author: confirm.**

## Work breakdown (todos land in TODO.md once this is approved)

- **P1 — Definitions.** Lock the standard and the publish set (this file).
- **P2 — Reclassify.** Resolve `guides/` and `design-system/` per the confirmed dispositions.
- **P3 — Delete/rewrite.** Delete `architecture-core.md` (+ repoint); rewrite or exclude `socketmanager`.
- **P4 — Capture-then-strip.** For each correction block being removed: verify its finding is in `TODO.md`
  (add if missing), then remove the block, leaving accurate plain prose. This is the safety-critical pass.
- **P5 — De-icon + unify.** Strip all 234 icon occurrences; apply the uniform header; kill footers/theatre.
- **P6 — Cross-links.** Fix intra-doc links for the flat wiki (no `.md`, no folders); repoint anything that
  named a deleted/folded doc.
- **P7 — Sync mechanism.** With colons gone, build the wiki sync: clone `…wiki.git`, mirror the publish set
  by flattened kebab name, rewrite links, push. Verify a re-run on an unchanged tree is a no-op.
- **P8 — Author actions.** Author kills the current wiki (destructive, public — his to run), then the sync
  populates it fresh. Author does the BUILD commit for the source-doc changes.

## Verification (no test framework — how each phase is checked)

- P4: grep the removed finding's key phrase in `TODO.md` returns a hit before the doc block is deleted.
- P5: the emoji grep (`scratchpad`/the pattern used today) returns **0** across published docs.
- P6: every markdown link in a published doc resolves to an existing target.
- P7: fresh `git clone` of the wiki succeeds on Windows (no colon page); rendered pages match source.
- P8: the wiki renders the current publish set; author confirms visually.

## Author actions vs. Claude actions

- **Claude:** everything in P1–P7 (source-doc cleanup, reclassification, deletions/rewrite, the sync script),
  staged for review.
- **Author:** the BUILD commit; killing the current wiki; the first real wiki push if the sync needs
  credentials/publish rights. (Publishing and destructive GitHub actions remain the author's per `CLAUDE.md`.)
