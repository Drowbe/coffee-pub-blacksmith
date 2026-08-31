# TODO - Active Work

**Master list of what we will do.** Restructured 2026-08-27, when this file had reached 2,400 lines and had
become the place design memos went to live.

**What an entry looks like:** a title, enough to know what the work is and why it matters, the file or
setting it touches, and how it will be verified. Three to eight lines. If an entry needs more than that, the
extra is design and belongs in a plan -- link the plan and keep the entry short.

**What does not belong here:**

| Content | Where it goes |
|---|---|
| Design, rationale, phasing, rejected alternatives | `documentation/plans/` |
| How the code works | `documentation/architecture/` |
| The public surface | `documentation/api/` |
| Verification owed on shipped code | `testing/` |
| Anything finished | `CHANGELOG.md`, and deleted from here |
| Work spanning the Coffee Pub suite | `documentation/TODO-GLOBAL.md` |

**When an item is done it is deleted, not ticked.** A file of completed items cannot be told apart from one
nobody reads.

---

## Now - stack ranked

The order the author would pick work up in today, and **the only place priority is expressed** -- the
sections below are the same list grouped by area. An item leaves this table when it is deleted from the
file, not when it is finished, since those are the same moment.

**Status vocabulary**, so a glance is enough: **Not started** - nothing written. **In progress** - partly
shipped, and the row says what is left. **Blocked** - waiting on something named in the next column.
**Diagnosing** - the cause is not known and the next step is a measurement, not a fix.

| # | Item | Status | Next step | Area |
|---|---|---|---|---|
| 1 | The socket architecture doc is fiction -- 67 of 83 symbols phantom, and it invents a security model | Not started | Write the sockets harness suite first, so the rewrite has a regression net | [Documentation](#documentation) |
| 2 | `T` over an enemy targeted nothing, on the player's own turn | Diagnosing | Two console lines at the table the next time it happens; three outcomes, three different owners | [Critical bugs](#critical-bugs) |
| 3 | Protect the live campaign statistics | In progress -- backup done, version stamp not | Write the version stamp. It blocks the damage-semantics change | [Statistics](#statistics) |
| 4 | The window framework does not own the frame | Not started -- plan written | Audit Minstrel and Artificer first, not last | [Windows](#windows-menubar-and-toolbars) |
| 5 | Finish the importer re-founding | In progress -- steps 0-4 shipped and live | Step 5, guide and prompt derivation | [Importer](#importer) |
| 6 | Statistics are midi-first in load-bearing places | Not started -- audited 2026-08-04 | Per-statistic fix; the audit is in the plan | [Statistics](#statistics) |
| 7 | Save-based offense drags hit rate toward 100% | Blocked -- phase 1 shipped, unverified | Read the phase 1 log in a live combat; what phase 2 does depends on it | [Statistics](#statistics) |
| 8 | The canvas surfaces have no contract | Not started -- plan written | Turn `getCanvasLayer()` into an API, with Herald's box as the second tenant | [Canvas](#canvas-pins-and-notes) |
| 9 | Stylesheet cleanup -- retrofit the neutral overlay tokens | Not started | The token-adoption pass; verify no hex in `styles/` matches a `vars.css` value | [Design system](#design-system-and-css) |
| 10 | Player frame rate | Not started, deliberately | Measure. Nothing is a confirmed defect yet and nothing should be optimised before it is | [Performance](#performance) |

---

## Critical bugs

### `T` over an enemy targeted nothing, on the player's own turn (opened 2026-08-27)

Seen live 2026-08-26. A player on their turn moused over an enemy, pressed **T**, nothing was targeted, no
error. They own more than one token; the turn indicator was on the correct one.

The `T` path is entirely core's and dnd5e does not touch it. `ClientKeybindings.#onTarget`
(`client/helpers/interaction/client-keybindings.mjs:720-728`) is four silent gates: canvas ready, active
layer is `TokenLayer`, `canvas.tokens.hover` set, and the token not `isSecret`. Hover is established by the
pointer *entering* a token and is never recomputed from where the mouse sits, so anything that moves the
world under a stationary pointer can leave it null -- and `combatTrackerPanToCombatant` and
`combatTrackerAutoSelectToken` both move the world at turn start. Our scene control group was investigated
and cleared: its `onChange` is empty, so it never deactivates the token layer.

**Diagnose before building.** At the moment it fails, in the player's console:
`canvas.activeLayer?.constructor.name` (expect `TokenLayer`) and `canvas.tokens.hover?.name` (expect the
enemy). Wrong layer, null hover, and both-correct are three different bugs and three different owners.

### Something writes an invalid `properties` value onto items created on NPCs (opened 2026-08-21)

An item created on an NPC with no `properties` in its payload stores `properties: ["gear"]`; the identical
payload on a character stores `[]`. `"gear"` is valid for neither (`dnd5e.mjs:45532`, dnd5e 5.3.3) and it
lands on containers too, so it is not type-specific. Not us and not the obvious suspects: no Coffee Pub
sibling writes `system.properties`, and chris-premades, DAE and automated-conditions-5e are clean on it.

Invalid data in a live world rather than a broken feature, which is why it is filed rather than chased.
**The way in:** a temporary `preCreateItem` hook logging `item._source.system.properties` on entry, which
separates "already present" from "written by something in the chain".

### Advantage/disadvantage discards a built formula's keep modifier (opened 2026-08-16)

Reported from play: build `4d6kh3` in the dice tray, click Disadvantage, and the `kh3` is gone. Normal
works. `manager-rolls.js:902-903` replaces the formula outright for the `dice` roll type rather than
wrapping the existing dice term. Mechanism confirmed in source, behaviour not yet confirmed in a world.

**Verify:** build `4d6kh3`, click each of the three buttons, and read the formula in the result tooltip.

### Retry Failed silently retries the wrong entry on an envelope payload

`_failedPayloadEntries` (`window-json-import.js:505-516`) re-parses raw text with its own array-or-object
rule instead of calling the registry parser. Given an envelope, `entries` is `[envelope]`, so index 0
resolves to the whole envelope and the rest resolve to `undefined` and are filtered away -- one wrong object
is retried, the rest are dropped, with no error and a plausible result screen. Retry must go through the
same unwrap, and payload context must live on the window rather than round-trip through the textarea.

### The import result screen reads as a failure when nothing failed

An entry importing with warnings shows `1 processed - 0 succeeded - 1 warnings - 0 failed` under a WARNING
banner. Every number is correct; the presentation is not, and on 2026-08-25 it stopped a live import that
would have succeeded. The trigger that produced those particular warnings is fixed; the summary is not.

The same line has a second symptom, found on 2026-08-31: a FAILED entry carrying warnings reads
`0 warnings` while five warning rows render directly beneath it. Both symptoms are one cause. `summarize`
in `registry-json-import.js` counts mutually exclusive entry STATES -- an entry is success, warning or
error -- while the labels name MESSAGES and the renderer shows every message an entry carries whatever its
state. Fix the vocabulary rather than the arithmetic: the counts are of entries, so either say so or count
messages instead.

**Verify:** import an entry producing one warning and no errors -- the summary says it imported. Then
import one that fails while carrying warnings -- the warning count matches the rows shown.

### Dead `render` option on directly-constructed DialogV2 instances

`render` and `close` are `DialogV2WaitOptions` -- options of the static `wait()`/`confirm()`/`prompt()`
methods, not constructor options -- so `new DialogV2({ render })` silently ignores the callback.
`window-vote-config.js:148` uses it to focus the title field, which has therefore never happened. Audit the
other `new DialogV2` sites (`api-menubar.js` x4, `manager-vote.js` x2, `utility-common.js` x1).

### Configure Pin - section checkbox labels render too small

`font-size: 11px`, `text-transform: none` and `line-height: 1.4` are set on
`.blacksmith-pin-config-section-check-label` and not applying (`styles/window-pin-config.css`,
`templates/window-pin-config.hbs`). Find the winning selector rather than adding `!important`.

---

## Importer

Design, contract and build sequence: **`documentation/plans/plan-importer-api.md`**.

### Finish the re-founding: steps 8-11

Steps 0-7 are shipped and live: Item, Roll Table and Actor are declared and routing -- fourteen profiles --
each asserted against the parser it replaced and round-tripped through Foundry itself. What remains,
in order, each leaving the module working: **8.** Journal, the `rendered` form plus the passthrough seam
that lets us construct a module-owned subtype -- today's hardcoded `type: "text"` is what prevents it, and
Librarian's codex and quests and Artificer's recipes are all waiting on it. **9.** fragments, `tags` first.
**10.** export derivation and the three completeness layers. **11.** the parity check, then a consumer.

**Verify:** a field added to a declaration appears in the template, the guide, the prompt and the export
with no other edit. That single check is the whole point of the model.

### Blacksmith is consumer zero, and it must be checkable

Blacksmith's own kinds must register through the same public path an external module uses -- no internal
back door, no capability off the public surface, no internal import a consumer cannot reach.
`tools/check-importer-parity.mjs` fails the build if a Blacksmith kind reaches past it. A principle nobody
can run stops being true within two releases.

### The structured error envelope is always empty

`issueFromError` reads `error.code`, `error.path` and `error.details` (`registry-json-import.js:114`) and
every kind throws a plain `Error`, so `code` is permanently `VALIDATE_FAILED` or `CREATE_FAILED` and the
rest are blank. Build the typed issue helper as part of the engine -- under declarations most errors are
derivable, since a field that fails its declared type knows its own path.

**Verify:** import a roll table fixture with `results` deleted; the row names a code and the offending path.

### Validation is parallel and import is sequential

`Promise.all` at `registry-json-import.js:181` against the `for` loop at `:191`, so a validator touching
shared resolver state can behave differently under Validate than under Import. Make validation sequential
unless there is a measured reason not to.

### Librarian is the forcing function

They are replacing ~600 lines of duplicated import dialog across codex and quest and asked to build against
a branch. **Do not give them the callback contract** -- `onImportEntry` has never been used externally, and
Librarian would institutionalise the pattern this effort exists to end. Fixtures they supplied are in
`coffee-pub-librarian/testing/`. Two discrepancies still to settle with them: `exportVersion` is `2` in
their message and `"1.1"` in the fixture, and the fixture pins carry `questIndex`/`questCategory`, which are
not in the stable core they named.

### Import/export and module-owned document subtypes

The import half is settled by the declaration model. The export half is not, and its constraints -- owner
precondition, type-registration precondition, invalid-document refusal -- become enforceable only once
export inverts the same declaration. Step 10 above.

### Actor import: currency `value: 0` is silently skipped

`setActorCurrency` guards `if (!currency?.type || !currency?.value) continue`, so a legitimate
`{ "type": "gp", "value": 0 }` is dropped (`manager-compendiums.js`). Guard on presence
(`currency.value == null`) and coerce to Number so `"0"` and `0` behave alike.

### Encounter journal: monster list resolved twice per import

A `journaltype: "encounter"` import resolves every name in `prepencounter` twice
(`utility-common.js`, `createHTMLList` ~:174). Largely masked by the index cache, so cosmetic -- worth
fixing so the debug log stops misleading. Breakpoint `createHTMLList` to find the second caller.

### Item import expansion

Plan: `documentation/plans/plan-item-import-expansion.md`.

---

## Statistics

Data-integrity constraints and the midi asymmetry: **`documentation/plans/plan-statistics-integrity.md`**.
Save delivery: **`documentation/plans/plan-save-delivery.md`**.

### Protect the live campaign data before changing anything further

Real, irreplaceable campaign data is in the live world. The backup is done. What remains blocks the
**damage-semantics change**, which must not land until the version stamp is being written: an export exists
(`window-stats-party.js:243`) with a matching import, and the stamp is what lets an old export be read
correctly after the semantics change.

### The system is midi-first in load-bearing places

midi-qol is not a dependency, but several statistics are written **only** by midi handlers, so two tables
get different numbers from the same fight and nothing errors on either. Errors run in both directions, which
makes cross-table comparison meaningless. Audit is in the plan; the fix is per-statistic.

### Save-based offense: fix the accuracy bug

midi sets `workflow.hitTargets` to every target for an activity with no attack roll, and we read it as "was
hit" (`utility-midi-resolution.js:285`, `stats-sources.js:416`). A Fireball on five goblins records five
hits and zero misses even when all five save. Phase 1 (carry `delivery` and `landedTargets`) is done pending
live verification; phase 2 counts from `landedTargets` and is blocked on what that phase 1 log shows.

### A round view and a combat view (opened 2026-08-27)

The end-of-round card's **View Details** opens `StatsWindow.show()` with no arguments
(`blacksmith.js:750`, `cards-stats.js:30`) -- the lifetime window. Either the label is wrong or the view is
missing. Settle what is stored first: a per-round record for every combat grows without bound, and this
system is the one most in need of not growing. A round view that needs a new store is a bigger decision than
the button that prompted it.

### Adapters still write tracker state through live references

`CombatStats._ensureParticipantStats` and `_ensureCombatTotals` return live references into `currentStats`
and `combatStats`, and handlers in `stats-sources.js` write through them -- so mutation is authored in two
files and ordered by whichever handler runs. The shape it wants: the adapter returns an event, the tracker
applies it. **A behaviour change, not a move**, on the socket path, so it needs its own verification pass:
multi-round combat with midi on, with `enableMidiIntegration` off, and with a player rolling.
`stats-player.js` (2,606 lines) wants its own audit and is deliberately not bundled in.

### `manager-roll-outcomes.js` duplicates the stats socket forwarder

Both it and `stats-sources.js` define `_forwardToGM` over the same SocketLib socket. The forwarding
equivalent of the four detection sites named in `plans/plan-rolls-classification.md`.

### Party Stats Export is fragile and possibly unreachable

The export uses a hand-rolled blob+anchor download that revokes the object URL too early
(`window-stats-party.js` ~:478-497), and it is not clear it is invokable from the UI at all. Confirm
reachability first, then replace with `foundry.utils.saveDataToFile`.

### Combat Stats review and refactor

`stats-combat.js` wants a pass for unused code, duplicates, performance and UI.

---

## Combat

### Two drag-to-reorder implementations, and they do not agree (opened 2026-08-27)

The combat bar uses a pointer trio with injected dropzones (`manager-combatbar.js:4856-5010`); the tracker
uses HTML5 drag with injected `li.drop-target` rows (`ui-combat-tools.js`). Core Foundry's tracker has no
drag of its own -- both are ours. They compute different numbers: dropping at the top gives `first + 2` in
the tracker and `right + 1` on the bar. One shared "initiative for this slot" helper is the worthwhile half;
merging the two interactions probably is not.

While there: the tracker's drop handler returns silently in three places and the third
(`draggedIndex === -1`) is reachable, since `game.combat` is `ui.combat.viewed` and need not be the combat
whose rows are on screen. A silent return is indistinguishable from the feature being broken.

### Hide Dead and Skip Dead: the canvas half

Plan: **`documentation/plans/plan-hide-the-dead.md`** -- the mechanism (dim, do not hide), two rejected
alternatives with reasons, and the verified finding that the dead do not block movement in dnd5e. Note the
plan predates `manager-defeated.js`, which now gives "what counts as dead" one answer in code.

### Migrate combat hooks to lib-wrapper

Replace `combatStart`, `updateCombat`, `endCombat` and `deleteCombat` hooks with lib-wrapper wrappers on the
Combat prototype (`stats-combat.js`, `timer-combat.js`, `manager-libwrapper.js`).

---

## Canvas, pins and notes

### The canvas surfaces have no contract (opened 2026-08-27)

Plan: **`documentation/plans/plan-canvas-surfaces.md`**. Two surfaces exist -- `BlacksmithLayer` for
scene-space PIXI, the DOM overlay over `#board` for screen-space -- and neither is documented.
`getCanvasLayer()` hands out the raw container and says nothing, so Cartographer (its only tenant) invents
its own z-ordering and cleanup, and a second tenant has no way not to collide. Four defects listed in the
plan, including `_draw()` initialising the pin renderer and `deactivate()` clearing pins while leaving
Cartographer's drawings.

### The pin context menu offers no note actions (opened 2026-08-27)

`api.pins.registerContextMenuItem` (`api-pins.js:314`) feeds the menu's `module` zone, the renderer already
builds that zone, and **nothing anywhere calls it** -- so it is always empty and every pin menu is pin
actions only. Consumer-zero failure: Notes are ours and should be the first caller. Settle what Delete Pin
means for a note pin while building it; today it deletes the pin and leaves the note, silently.

### Pins should respect sight, or deliberately not

Pin visibility is permission-only -- `blacksmithVisibility`, `blacksmithAccess`, ownership -- with no sight
test anywhere in the renderer, so a player-visible pin shows through unexplored map. If that is wrong, copy
`Note#isVisible` (`client/canvas/placeables/note.mjs:85-92`) into the update that already runs on every pan.
If a GM marking a pin visible is meant to be final, close this and say so in the architecture doc.

### Pins: single-click selection, and double-click landing in drag mode

Clicking a pin should select it with a visible ring so keyboard actions can operate on it. Separately, for
editable pins mousedown enters the drag system and any movement past `DRAG_THRESHOLD` swallows the
double-click.

### Pins: automated tests, and a measurement before any culling

The API and renderer are in place with no suite. Separately, classification-based pre-filtering shipped
(`pins-renderer.js:2135`) but the performance hypothesis behind it was never measured. **No reported
symptom: do not build culling without a measurement.**

### Find something on the canvas by name (opened 2026-08-27)

Type a name and be taken to it, or browse what is on the scene and pick from a list. Selecting a result pans
via `canvas.animatePan`, which the combat bar's Pan to Token already does. **Settle what "name" means
first** -- token name, actor name, or the name a player sees -- since searching a name the searcher cannot
see is a leak if this is ever offered to players.

### GM Notes: expand beyond items

Core extension is implemented. Remaining: optional first-party Actor read-card placement, and
module-owned Journal and JournalPage sheets mounting the shared component.

### Token shadows on drop, as an option in the Dropped Tokens section (opened 2026-08-27)

Give a dropped token a drop shadow, switched on beside the overrides that already exist -- rotation lock,
token ring, scale, image fit mode -- under the **Dropped Tokens** heading (`settings.js:5018`), world scope
like its neighbours.

**Understand the mechanism before writing the setting, because it is not the same kind of thing as its
neighbours.** All four existing overrides write to `tokenData` at `preCreateToken`
(`manager-canvas.js:87-130`, re-applied at `:155` and `:216`) and persist as token document properties. A
shadow is not a document property in Foundry -- it is a render-time effect -- so it cannot be applied the
same way, and the setting cannot simply join the list.

That makes the first question the real one: is this **per token**, written as a flag on drop and rendered by
us for tokens that carry it, or a **scene-wide render option** that has nothing to do with dropping at all?
Only the first belongs in the Dropped Tokens section; the second is a display setting that happens to have
been noticed while dropping.

**Prefer a sprite beneath the token over a PIXI filter.** `manager-token-indicators.js` already runs
per-token overlays on `canvas.interface` with `eventMode = 'none'`, and Quick View's hatch proves the
token-conforming pattern -- scaled to `token.w/h`, rotation-aware. A drop-shadow filter is per-object
expensive and would have to coexist with the dynamic ring shader, which the existing `disableTokenRing`
setting says this table already turns off.

**Verify:** drop a token with the option on and off; confirm the shadow appears beneath the token and not
above it, follows the token on move and rotate, renders identically on a player client, and does not appear
on tokens dropped while the option was off.

### Token blood: remaining work

Plan: **`documentation/plans/plan-token-blood.md`**, which now carries the remaining list -- the live
verification pass, optional authored splatter art, rewiring the combat bar onto `utility-health.js`, and the
next round of ideas. Ties into Hide Dead: settle that definition first so both use one.

### Creature-type token naming: polish

Shipped and documented in `architecture-token-naming.md`. Remaining: verify per-key dropdowns in Foundry;
refresh the key/alias index when tables are created or deleted (it is built once at load); grow alias
coverage with use; later, allow a compendium of RollTables as the source, which needs UUID refs.

---

## Windows, menubar and toolbars

### The window framework does not own the frame

Plan: **`documentation/plans/plan-window-framework.md`**. Not started. Of 15 `BlacksmithWindowBaseV2`
subclasses, 4 render `window-template.hbs`; two header systems exist and the button vocabulary is used by 3
of 15. **Critical rather than tidy:** on 2026-08-16 the roll window rendered *Regent's* header, because
`Handlebars.partials` is global, both modules registered `partial-unified-header`, and both registrations
await a fetch -- so the winner was a race. Our side is namespaced; the conditions are not gone. Every window
shipped against the current contract is another copy to migrate. **Audit Minstrel and Artificer first**, not
last: a frame validated only on simple windows fails on them after everything has moved.

### Geography and the journal importer: three changes owed by importer step 8 (opened 2026-08-31)

Scene geography shipped its data model, API and Scene Config tab, but the importer half is deliberately
NOT done, because every call site sits in `registry-json-import-journals.js` inside the `area` and
`location` builders that `plans/plan-importer-journal.md` re-founds. Doing it now would conflict with
that rewrite and be absorbed by it. **These are requirements on step 8, not separate work:**

- **`saveCampaignGeography()` (`:694`) loses its unconditional write-back.** An import records geography
  onto the scene flag it was launched from; the four world settings are written only by the settings UI.
  Today every import overwrites them, which is why they describe wherever the last import pointed.
- **The Area/Location prompt prefills from the active scene**, via `api.geography.get(scene)`, falling
  back to the campaign defaults when there is no scene in context. `buildLocationPathHint()` (`:731`) and
  `applyAreaJournalGeography()` (`:750`) are the substitution points.
- **The Area importer populates `locationUuid`** when one run creates both a scene and a Location entry.
  That kills the `scenetitle` string match (`:597`) as the only join between the two.

One edge left open deliberately: an Area import launched with no scene in context records geography
nowhere. Defensible, but silent -- decide during step 8 whether it warrants a notice.

### A Scene Config button, for a module that wants its own window (opened 2026-08-31)

Asked for by Artificer, who want to own their submit: a tab cannot guard its own fields, because the sheet
owns the form. Deliberately **not** an extension of `registerSceneConfigTab` -- Foundry already fires
`getHeaderControls` with `hookResponse: true` (`client/applications/api/application.mjs:641-644`), so a
header control needs no DOM surgery and cannot lose a render race. The tab injector exists to survive
`_replaceHTML`; a button does not have that problem and should not inherit that machinery.

Shape: `api.registerSceneConfigButton(id, {label, icon, onClick, visible})`, wrapping the hook. Not urgent
-- Artificer will not build against it until after the environment migration, since habitats are the part
leaving their tab.

**Verify:** a registered button appears in the Scene Config header, opens the consumer's window, and
survives the sheet re-rendering; unregistering removes it.

### Window presentation is per device and should be per user

Favourites, sorting and window sizes are user settings, remembered across every device a person logs in
from. Notes favourites and the notes sort already are, as User flags. `BlacksmithWindowBase` writes position
and size to `localStorage` (`window-base.js`, `_positionKey`), so a second machine starts fresh.

### Macro windows: more than one, and holding more than macros (opened 2026-08-27)

Two asks against `window-macros.js`. **Multiple named sets** -- Soundboard, Combat, and so on, open at once:
blocked by `MacrosWindow.activeWindow` being one static slot, the fixed `DEFAULT_OPTIONS.id` that
ApplicationV2 keys its registry on, and one `userMacros` setting rather than one per window. Migrate the
existing list into a default set rather than stranding it. **Anything with a UUID** -- items, journals,
actors, tables, scenes -- a slot holds a document reference and does the sensible thing with it; the drop
handler, the run action and the empty-slot rendering are the three places that assume Macro.

### More control over the left menubar zone versus the hamburger (opened 2026-08-27)

Tools are placed by `zone` at registration and the hamburger is overflow the user cannot influence. A user
should decide which tools sit as icons without a module changing its registration. Per user, not per world.
Note the trap at `api-menubar.js:3057-3110`: the layout signature decides whether a rebuild happens at all,
so anything moving a tool between zones must change that signature or the move will not render.

### Display-only secondary bar items are styled as buttons

`.secondary-bar-item` styles every item as a button -- fill, border, radius, pointer cursor, hover lift --
so `info`, `progressbar` and `balancebar` each strip it locally. A hover lift on a number that cannot be
clicked is an affordance that lies. The four-part sequence, including state-driven colour and the sizing
basis that forces the combat bar to redeclare five variables per row, is in
**`documentation/plans/plan-readout-widgets.md`**. Worth doing now: real-time stats are about to make heavy
use of the readout vocabulary.

### Contributed actions by subject

Plan: **`documentation/plans/plan-contributed-actions.md`**. A module declares an action belongs to a
subject, a surface declares it displays that subject, Blacksmith matches them without knowing what either
means. Folds in three hand-wired sibling references that are this feature special-cased. Has a prerequisite:
confirm the `hasCustomTemplate` gate on the secondary-bar context-menu path works for hybrid bars.

### Menubar API: move built-in tool registration out

`api-menubar.js` is both the registration surface and a registrar of Blacksmith's own tools. **Much smaller
than it was** -- three registrations remain. Move them into a manager that calls `registerMenubarTool`.

### Toolbar phase 4: testing and validation

Phases 1-3 are done. Test registration and unregistration, and verify compatibility with existing modules.

### Journal Tools: rebuild, not refactor

Plan: **`documentation/plans/plan-journal-tools-refactor.md`**. Correctness, not clunk: findings 4-10 of the
2026-07-18 review stand, including first-occurrence replacement bugs, an li with two links having both
overwritten, keyword-luck section gating, no preview and no undo for entity linking, and unescaped
interpolation of journal HTML into results (`_renderSearchResults`). **Direction (author, 2026-07-19): the
real frame is automated cleanup of Foundry artifacts** -- entity linking and search/replace are the seed of
that tool, not the whole of it. Escaping (finding 9) is small and worth doing ahead of the refactor.

### Request Roll cannot be fully disabled

`requestRollShowInFoundryToolbar` only hides the Foundry-toolbar button; there is no master off-switch, and
the toggle implies more off than it delivers. Design the gate first against the §8 load-gate model, then
implement across the button surfaces and the API entry points.

---

## Rolls and cards

### Chat cards: finish the parts system

Plan: **`documentation/plans/plan-chat-cards.md`**, which now carries the full remaining list -- stats
simplification, the interactive cards, the skill-check and stats-card migrations awaiting live verification,
imported journal page styling, and the CSS consolidation that cannot happen until they are verified.
Verification owed is in `testing/chat-cards.md`.

### Roll outcome classification: migrate the last two detection sites

Phases 1-3 shipped; phase 4 is in `plans/plan-rolls-classification.md`. Remaining legacy sites:
`utility-message-resolution.js` and `utility-midi-resolution.js`, both used by `classify()` with no hook
emission. **Blocks Bibliosoph's crit/fumble/reaction automation.** Follow-up: carry
`attackerTokenId`/`itemUuid` on `damageResolved` where resolvable.

### Rolls API: phase 2

`module.api.rolls` and `api-rolls.md` shipped. Remaining: internal migration, and optional stats-combat
dedupe consolidation.

### Roll system: respect the selected system

`processRoll()` ignores `diceRollToolSystem` and is hardcoded to the Blacksmith roll path
(`manager-rolls.js`). Implement the Foundry path when selected and document it in `api-rolls.md`.

### Request-side roll modes and explainer: live verification

Both shipped (`rollAdvantage` with `lockRollAdvantage`, and `explanation`). Bibliosoph's treatment rolls
currently state the required mode in the title and sniff the formula for `2d20kh`/`2d20kl`; both items exist
to let them delete that. Verification steps are in `testing/verification-queue.md`.

### Player-facing messages should be toasts, not Foundry notifications

Blocking a player's move warns through `ui.notifications.warn` -- Foundry's chrome in Foundry's voice --
while the movement-mode change two hundred lines earlier announces through `ToastAPI.show` with our icon.
One file, two vocabularies, and the one the player sees more often is the borrowed one.

### Toast system: phases 2 and 3

Phase 1 shipped and verified. **Phase 2** -- an `actions: [{label, onClick}]` button row for multi-choice
toasts -- is unblocked. **Phase 3** -- `api.toast.send({recipients})` riding `api.sockets` -- is gated on
the socket rewrite. Chat-noise migration candidates and the "stays in chat" list are in
`architecture-toast.md`; each migration is its own change with its own verification. The turn-notification
toast is **on hold by author decision**.

### Readout widgets: `segmentchip`

Not scheduled. Its justification was width and that has been met by other means. **What would change the
answer:** a readout with three or more parts whose proportions matter -- damage by type, party composition.

---

## Tags and flags

### Tags: the gaps Librarian's adoption exposed

Codex adoption shipped 2026-08-25 (342 entries); **quests have not migrated**. Do not build these
speculatively -- each waits for a consumer to say what shape it needs.

- **Tag changes are not announced to other clients.** All three hooks fire with `Hooks.callAll` locally
  (`manager-tags.js:464`, `:656`, `:683`) and nothing emits. The data reaches every client via
  `updateSetting`; the announcement does not, so a UI built on the hooks goes stale. **This is
  player-visible** -- a GM renaming a tag leaves every player's cloud showing the old vocabulary, which is
  the failure least likely to be reported. Workaround given to consumers: listen to `updateSetting`. A real
  fix means the GM announcing after `_applyMutation` so the payload survives the socket.
- **`moveRecord(contextKey, oldRecordId, newRecordId)`** is hand-rolled by one consumer. Librarian carries
  tags across a document replacement in three calls, correctly. **One shipped consumer is not the bar** -- a
  second is the trigger. Whatever is built must preserve their ordering: the delete comes last, so an
  interruption duplicates rather than orphans.
- **A bulk assignment write** is O(N) settings writes; Librarian's migration was 342. Wait for evidence it
  is too slow.
- **A bulk rename is not wanted on current evidence.** Recorded because the opposite is easy to assume from
  vocabulary size. Do not read a singleton count as a rename count -- that inference was made here once and
  Librarian corrected it.

### `TagWidget` `mode: 'filter'` is declared and inert

`activate()` returns immediately because the filter branch renders no `input[data-tag-value]`
(`widget-tags.js:88`), so the toggles are wired to nothing. Implement it or delete the branch and the
`filterItems` half of `prepareData` -- do not leave it. **It is not a record filter**: it toggles
`tagVisibility`, a per-user display preference, and should not be sold as one in `api-tags.md`.

### Unified Flags: finish the pins storage migration

Infrastructure is complete and journal pins are wired; docs are in `architecture-flags.md` and
`api-flags.md`. Remaining: `deleteTagGlobally`/`renameTagGlobally` must also update `flagAssignments` for
the pin context; `api-pins.js` tag methods delegate to `FlagsAPI` behind their existing signatures; after
one release drop `pin.tags[]` from the schema; migrate the `pinTagRegistry` setting to `flagRegistry`.

---

## World clock and time

### One time surface, exposed to the suite

Plan: **`documentation/plans/plan-time-api.md`**. Five table-facing wall-clock timers, each with its own
tick, persistence and pause semantics, and "fire the warning once" implemented twice independently. Three
surfaces, deliberately not one: `countdown`, `schedule`, `session`. **World time and wall time stay
separate** -- merging them would be the third time that mistake was made. Each step is finished when the
old interval is *deleted*, and consumers come before further migration.

### The interruptible rest

Plan: **`documentation/plans/plan-interruptible-rest.md`**. The one genuinely novel piece of what remains
of the world clock. Weather, calendar events and a morning briefing are siblings' work, not ours, and are
tracked in `TODO-GLOBAL.md`.

### A Scene Config notice for clock-driven darkness

A GM opening Scene Config on a clock-driven scene sees the Darkness Level slider at a value they did not set
with nothing saying why. Deferred because it means injecting into `renderSceneConfig`, and the last module
to do so lost its tab to a render race against `_replaceHTML`. Read the same scene flag the driver uses
(`DarknessManager.FLAG`) and survive the sheet re-rendering underneath. Shares a surface with the scene
geography work in `plans/plan-scene-geography.md` -- build one injector, not two.

---

## Design system and CSS

### Stylesheet cleanup: retrofit the neutral overlay tokens

Flagged by the author as a critical effort soon; this is the mechanical part. Four neutral overlay tokens
were added 2026-08-08 because the token set had no translucent neutral at all, and only the context menu
icons use them. **Verify:** after the pass, no hex literal in `styles/` matches a value defined in
`vars.css`.

### Design system: make it upstream of the component docs

Typography is partly tokenised; the `cpb-`/`blacksmith-` prefix split is resolved for the parts system; the
`.bh-` namespace is unused and its reservation is dropped. What remains is the token-adoption pass that
makes the design system govern the CSS rather than describe it.

### Dead CSS from the design-system audit

`--blacksmith-variant-timeline-*` duplicates `--blacksmith-variant-info-*` -- both are the same rgba.
**`styles/widget-tags.css` (154 lines) is unlanded, not dead -- do not delete it**; it appears in no import
chain because the widget has not landed.

### `applicationv2-window/` - decide its disposition

`documentation/applicationv2-window/guidance-applicationv2.md` (539 lines) has never been audited and is not
published. Either audit and publish it, or fold it into the design-system split. **Artificer has its own
copy**, so whichever happens has to account for that or one gets fixed and the other drifts -- same shape as
the `cards-common.hbs` fork, one layer up. Tracked in `TODO-GLOBAL.md`.

---

## Performance

### Player frame rate: investigate before optimising anything

**Not started, deliberately.** In the 2026-08-19 session the GM ran at 30-45 fps with a max framerate cap
set, and two players reported slow graphics -- one at roughly 10 fps on an older MacBook Pro. Nothing here
is a confirmed defect in this module. Establish what is actually slow, on whose hardware, before changing
anything.

### Scene "burden" calculator

No way to quantify how expensive a scene is before players hit it, and the costly scenes are the
counter-intuitive ones. Three phases: score the current scene from its document and canvas state; calibrate
against known-good and known-bad scenes; then optionally advise on `canvasReady`. Nearest pattern is
`utility-performance.js` -- dynamically imported, surfaced via the hamburger, gated behind its setting.

### Settings and feature gating

The load-gate model is `architecture-blacksmith.md` §8. Open: combat and player stats stay in the bundle via
static imports even when tracking is off; the combat timer is correctly gated but still statically imported.
Both are dynamic-import candidates that would shrink the cold path.

### Audit `requiresReload` now that change handlers are live

Many settings carry `requiresReload: true` from the era when change handlers were dead. Per-setting
decision: drop it where the live handler fully applies the change.

---

## Cross-cutting surfaces

### One participation list, owned by Blacksmith

Plan: **`documentation/plans/plan-participation-list.md`**. A camera, stream or bot account is not a person,
and at least four modules derive different behaviour from that one fact. The list has already been built
twice with different homes. Three things settle before code: the name, migration of `toastExcludedUsers`,
and whether Herald migrates back.

### Voting: who can vote, and who can be voted for

Two separate filters. **Who can vote** has a rule -- a logged-in non-GM owning at least one `character`,
snapshotted per vote -- and no configuration. **Who can be voted for** has no concept at all. The open
question is per-vote configuration in the Create Vote dialog versus a standing world setting. The standing
"not a person" case belongs to the participation list above, which voting should consult.

### A consumer cannot tell a degraded `ready` from a healthy one (opened 2026-08-31)

`BlacksmithAPI.waitForReady()` only ever resolves, and `bailOutOfReady` (`blacksmith.js:470-492`) calls
`markReadyForConsumers()` after a failure on purpose, so a consumer that fails loudly beats one that hangs
forever. That part is right. What is missing is the other half: nothing on the public surface says *which*
resolution a consumer got, so "Blacksmith is up" and "Blacksmith gave up and handed you a half-built API"
are the same await. A consumer that hard-cuts to our data instead of its own then reads absence as truth.

Raised by Artificer while scoping the scene-geography hard cut (`plans/plan-scene-geography.md`,
workstream 3), which needs a migration-complete signal built on this. Wider than that plan, so it is here.

**Verify:** force a bail-out (throw in one `ready` stage) and confirm a consumer awaiting readiness can
distinguish degraded from healthy without reading the console.

### Overall party reputation, for external consumers

Reputation is per-scene and nothing aggregates it. Squire wants an overall value, so this is **API surface,
not an internal helper** -- get the shape right rather than widening it later.

**Settle the sentinel first, because the aggregate cannot be honest without it.**
`getPartyReputation` returns `0` for a scene with no entry (`manager-reputation.js:99`, `:105-107`), and `0`
is also the centre of the -100..+100 scale, so "neutral" and "never set" are the same value and any mean
drags toward zero. Absence has to be representable -- a missing key, not a number. Storage moves onto the
scene flag in `plans/plan-scene-geography.md` (workstream 4), which is where the distinction becomes
possible; whether that lands first or the API is written against the current storage is the open call.
Also open: whether reputation is party-keyed (`{partyId: value}`) from the start -- cheap now, a second
migration later -- and whether "overall" means the mean of scenes with an entry or a campaign-level value
with scene reputation as local colour.

**Verify:** a scene never set reports unset rather than 0; a scene explicitly set to 0 reports neutral; the
aggregate excludes the unset ones.

### Compendium mapping wants a custom settings panel

The real fix, and why automatic mapping and the source checkboxes were removed rather than repaired: a row
of numbered dropdowns is the wrong control for an ordered list. One panel per type, drag-and-drop ordering,
add and remove, no slot count. Two things to carry over: the ordinary settings page keeps working for anyone
who does not open the panel, and the panel needs the full unfiltered `getAllPacks(type)`.

### Asset sources: let a module supply the image library

Image and sound choices in settings should be able to come from Coffee Pub Vault when it is installed and
selected, and a user should be able to point them at their own library instead. Plan:
`documentation/plans/plan-assets.md`.

### Consider `api.inventory.transferContainer()`

Deliberately left out: one-to-many creates plus many source deletes breaks the singular return shape, makes
quantity splitting meaningless, and turns rollback into N deletes plus N restores. That reasoning still
holds; recorded so it is not re-litigated without new evidence.

### Move media under a single `assets/` folder

`images/` (466 files), `sounds/` (135) and `themes/request-roll/{images,sounds}` (16) into `assets/`.
**Deferred 2026-08-13, and it needs a migration tool rather than a `git mv`**: 95 code references are
greppable, but world settings, journals, tiles and playlists already hold paths at the old locations, and
only a tool that walks those documents can move the files without breaking a live world. Writing the tool is
the bulk of the work; it belongs in `utilities/` and should report what it changed.

---

## Foundry v14

`documentation/plans/migration-v14.md` is the migration guidance for the whole suite. This is the narrower
list: v14 breakage observed in a running world. `module.json` declares `maximum: 14`, so these are ours.

- **The world clock's darkness control does not change darkness in v14.** The driver writes
  `{ environment: { darknessLevel: target } }` with an animation duration and returns early on
  `scene.environment.darknessLock` (`manager-darkness.js:234`, `:250-252`). Establish which of those v14
  changed before changing any of them, and keep the v13 path working -- `minimum` is still 13.

---

## Documentation

Per-doc audit findings: **`documentation/plans/plan-doc-audit.md`**.

### Rewrite `architecture-socketmanager.md`

**#1 post-reset effort (author, 2026-07-17)**, ahead of the design-system work: sockets and hooks are the
two systems siblings actually break against, and the hook doc has already been rewritten. 67 of 83 symbols
are phantom and four have only ever existed in that file, in any commit. Most dangerous: it invents a
security model, where reality is `_isLocalRecipient()` filtering **on receipt** and both transports
broadcasting to every client. **Do not delete it** -- the socket layer has no other contributor doc and its
migration-plan section is real. Write a sockets harness suite before the rewrite so it has a regression net.

### Fix `architecture-blacksmith.md` §3.1

The map a new contributor reads first, and it contradicts itself: §3.1 claims `hookCanvas()` registers four
hooks (it registers none) while §9A says so correctly, and it lists the lifecycle phases in the wrong order
with the phase numbers right. Also names four phantoms. §9A's `removeCallback` trap is stale -- delete it.

### The rest of the audit

`architecture-rolls.md` diagrams and API reference still encode the old four-function flow.
`architecture-toolbarmanager.md` is 20 phantoms and ~60% superseded plan. `architecture-tags.md` needs a
rewrite but **fix the code split first**. `architecture-stats.md` is ~66% decision memo. `architecture-xp.md`
and `architecture-pins.md` are keep-with-fixes. `architecture-token-naming.md` is the model doc.

### Publish the importer docs

`api/api-importer.md` and `architecture/architecture-importer.md` are the only held pair, and a published
doc already links the held one -- a live broken wiki link. **Gate:** the import work lands and passes live
testing, then both are audited against the finished code and added to `PUBLISH`.

### Grow the harness as APIs are touched

**The rule that keeps it honest:** a harness asserting a stale contract is worse than none, because it
manufactures confidence. Update the suite as *part of* the change that alters an API. Next suites, in order:
`hookManager` and `sockets`, then `tags` and `toast`. **Not covered anywhere: cross-client behaviour** --
every check runs on one client, so socket targeting and receipt-side filtering cannot be asserted
headlessly. Candidates to absorb: `utilities/api-toolbar-test.js` and `utilities/toolbar-targeting-test.js`.

---

## Technical debt

### jQuery detection pattern

v13 removed jQuery from the core UI stack, so `html` parameters are native DOM. 74 detection instances
across 5 categories; the audit report is `documentation/jquery-detection-audit.md`. Remove those where the
source is guaranteed native (a `querySelector()` result), and fix at the source rather than defending.

### SocketManager is becoming a god class

It both manages sockets and holds business logic, and it imports six UI subsystems at
`manager-sockets.js:14-19`. It should only manage registration and cleanup, the way `HookManager` does.
Bundle with the socket doc rewrite above.

### Embedded other-module constants

`_Migration/panel-notes.js` embeds Squire's constants (`NOTE_PIN_ICON`, `squire-notes-pin-placement`).
Understand why, then move them to Squire, consume through an API, or document the coupling deliberately.

### Expand rulebook selection, phase 2

Phase 1 is compendium-driven. Decide whether curated presets are wanted on top of it.

---

## Backlog - unscheduled ideas

Not committed to, and carrying no design. Anything here that gains a design gains a plan first.

- **Targeted By** - some way to see who is targeting what.
- **Token outfits** - extend token artwork workflows. Historically tied to image replacement; revisit if a
  supported image pipeline exists in core or a companion module.
- **Multiple image directories** for token image replacement, with priority order. Same deferral.
- **Rest and recovery** - long and short rests with configurable food and water consumption and spell slot
  recovery.
- **No initiative mode** - GM manually controls turn order instead of rolling.
- **Export compendium as HTML** - for sharing, printing or archiving.
- **Auto-roll injury based on rules** - HP thresholds, criticals, massive damage. **Belongs to Bibliosoph,
  not here**; the rolls API they subscribe to has shipped. Moves to their list when wired.
- **CODEX-AI integration** - likely outside core Blacksmith. Clarify ownership before any implementation.
