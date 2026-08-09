# Plan: Adopt Squire's Dice Tray, Macros, and Health tools

**Status:** Planned. No phase started.

Blacksmith adopts three tools that currently live in Squire but serve every module's audience: Dice Tray,
Macros, and Health. Settled 2026-08-09: **Blacksmith pulls; Squire does not write Blacksmith code.** Every
remaining decision is about Blacksmith's shape - file prefixes, HookManager registration, settings groups
and heading scope, the CSS import chain, the severity source of truth - and a session working in Squire
would be guessing at all of them.

Squire's half is two things only: answer the behavioural questions under Standing assumptions, then delete
and release once each Blacksmith phase is verified in a live world.

This plan is scaffolding. When a phase lands, its content moves to `TODO.md` (work), architecture and API
docs (design and surface), and `CHANGELOG.md` (history), and the phase section is deleted from here. When
all three phases are done the file goes.

## What actually moves

Squire's handover note counted 2,075 lines of JS. Templates and CSS bring it to roughly 3,000. The CSS
matters specifically because `styles/default.css` is Blacksmith's only entry point and a stylesheet with no
`@import` line is silently unstyled.

| Tool | Squire JS | Template | CSS |
|---|---|---|---|
| Dice Tray | `panel-dicetray.js` 613, `window-dicetray.js` 183 | `window-dicetray.hbs` 56 | `panel-dicetray.css` 271, `window-dicetray.css` 26 |
| Macros | `panel-macros.js` 528, `window-macros.js` 158 | `window-macros.hbs` 21 | `panel-macros.css` 145, `window-macros.css` 32 |
| Health | `panel-health.js` 320, `window-health.js` 273 | `window-health.hbs` 75 | `window-health.css` 301 |

### Settings: twelve named, five move

Squire's note said eleven and listed twelve. Traced individually they fall into four groups:

| Setting | Disposition |
|---|---|
| `showMacrosPanel` | Dead. No reference anywhere outside `squire/scripts/settings.js`. Do not port. |
| `showHealthPanel` | Dead. Same. Do not port. |
| `showDiceTrayPanel` | Dead. Built into the tray template context at `squire/scripts/manager-panel.js:431` and `:507`; no template reads it. Do not port. |
| `showHandleHealthBar` | Stays in Squire. Drives `handle-party.hbs`, `handle-player.hbs`, and `panel-party.js:100` - the tray handle, not the window. |
| `healthThresholdInjured` / `Bloodied` / `Critical` | Shared - see Decision 5. Read by the moving `window-health.js:88,146` and by Squire's own `manager-handle.js:75` and `panel-party.js:73,619`, all through `getHealthbarStatusClass` at `squire/scripts/helpers.js:97`. These cannot simply move; Squire still needs them afterwards. |
| `diceTrayShowRecentRolls` | Moves. Window-local (`window-dicetray.js:45,89`). |
| `showHealthMenubarTool` | Moves. Gates tool visibility (`squire.js:2207`). |
| `healthAdjustmentAmount` | Moves. Window-local (`panel-health.js:149,240`, `window-health.js:163`). |
| `userMacros` | Moves, with data. `scope: 'user'`. |
| `userFavoriteMacros` | Moves, with data. `scope: 'client'`. |

`userMacros` holds `[{id, name, img}]` - pointers to Macro documents plus cached display fields
(`squire/scripts/panel-macros.js:188`), not macro content. Orphaning it loses a curated ordered list, not
anyone's macros. Migrate it; do not gold-plate it.

`userFavoriteMacros` is also built into Squire's tray context at `manager-panel.js:414,490`, but no tray
template consumes the result - favourites really are menubar-only now. That dead context-building is
Squire's to remove.

### The dependency tail, and where the real coupling is

Imports are nearly nothing: `const.js` (MODULE, TEMPLATES), four helpers (`renderTemplate`,
`getNativeElement`, `getTokenDisplayName`, `getHealthbarStatusClass`), and `trackModuleTimeout`. All have
Blacksmith equivalents or are a few lines.

The real coupling is `PanelManager`, and it sits opposite to where the handover note put it:

- `panel-dicetray.js:8-19` and `panel-macros.js:16-27` call `PanelManager.ensureReadyForMenubar()` and then
  read `PanelManager.instance.actor`. That function (`squire/scripts/manager-panel.js:139`) boots Squire's
  whole panel stack, with two init attempts and 120x50ms spin loops each, purely so the tool can learn
  which actor to act on.
- `panel-health.js` imports no `PanelManager` at all. It is driven from outside via `updateTokens`.

So Dice Tray - picked as the proving run because it looked self-contained - is the one wired into Squire's
tray lifecycle, and Health's panel is the clean one. Severing that wire is the substantive work in Phases 1
and 2, and it is a Blacksmith-side decision: what replaces `PanelManager.instance.actor`.

The running order still holds. Dice Tray is the cheapest to get wrong and carries no user data.

## Decisions settled before starting

**1. Ids - three namespaces, not one.** Squire's note conflated them. They are independent:

- Registry id passed to `openWindow`: `coffee-pub-squire-dice-tray-window`. This is what a user's macro
  would call.
- ApplicationV2 DOM id: `squire-dicetray-window`. Already differs from the above (`dicetray`, not
  `dice-tray`). Internal; no persistence hangs off it.
- `windowPositionKey`: `squire-dice-tray-micro-position`. See Decision 2.

Blacksmith registers canonical ids matching its own convention - internal menubar tools are bare
(`combat-bar`, `settings`, `skillcheck`), and the one existing `registerWindow` caller uses
`blacksmith-pin-layers` (`scripts/window-pin-layers.js:1956`).

| | Menubar tool id | Window registry id |
|---|---|---|
| Dice Tray | `dice-tray` | `blacksmith-dice-tray` |
| Macros | `macros` | `blacksmith-macros` |
| Health | `health` | `blacksmith-health` |

The three Squire registry ids are kept as aliases: `scripts/api-windows.js` is a plain `Map`, so an alias
is one extra `registerWindow` call with the same descriptor. A rename that silently kills someone's macro
is not worth saving three lines.

Do not alias the menubar tool ids. `toolbarIcons` is also a Map but it renders, so a second entry is a
second visible icon. Nothing needs the alias anyway - see Decision 6.

**2. Position keys migrate, they do not travel.** Position does not key off the window id.
`scripts/window-base.js:134` reads `options.windowPositionKey`, and `scripts/window-tool-base.js:119,123`
derive the titlebar-mode and theme preference keys from it with `-titlebar` and `-theme` suffixes. That is
three localStorage keys per window, nine in total. Blacksmith adopts its own key names and runs a one-time
localStorage migration - read old, write new, delete old - so position, titlebar mode, and theme survive.
Keeping `squire-*` strings inside Blacksmith forever is the alternative and it is worse.

**3. Blacksmith owns the settings adoption, on first load.** A Squire-side migration would require the user
to install one specific Squire version before removing it, which cannot be relied on. Blacksmith reading
the old keys is order-independent. Three constraints shape the implementation:

- `userMacros` is `scope: 'user'` - per-user, world-stored. Each user adopts their own, so the
  "already adopted" guard is a per-user flag, not a world flag.
- `userFavoriteMacros` is `scope: 'client'` - localStorage, per browser. It adopts per browser on first
  load. A user logging in from a second machine gets an empty list regardless. State this in the docs
  rather than implying it is covered.
- Reads must not go through `game.settings.get('coffee-pub-squire', ...)`, which throws once Squire is
  uninstalled. Read the raw store.

Built as a general path, kept dumb: a table of `{fromModule, fromKey, toKey, scope}` run in `ready` after
registration. It will be reused for Librarian.

**4. Blacksmith owns health selection end-to-end.** The pieces are already here: `PartyManager`
(`scripts/manager-party.js`), `getPartyMembers()` in `scripts/utility-party.js`,
`scripts/utility-health.js`, `scripts/api-tokens.js`, and the intent wiring. The window self-drives off a
`controlToken` hook registered through `HookManager`, which deletes most of Squire's eight-plus call sites
- the party panel's "select the whole party" and the handle's HP-bar click are selection actions, so they
select and let the window follow.

Two call sites are not selection: the `force: true` pushes at `squire/scripts/manager-panel.js:329` and
`squire/scripts/panel-party.js:222`. Those are served by an option on the opener -
`openWindow('blacksmith-health', { tokens })` - not by a public `updateTokens()` on the instance. Keeps the
surface a registry call rather than an object handle.

**5. One definition of "bloodied".** `scripts/utility-health.js:38-48` already hardcodes severity tiers at
75/50/25/0, used by the combat bar portrait rings and the token blood indicators. Squire's three threshold
settings arrive describing the same concept. Two definitions inside one module is not defensible.

Resolution: the three settings move to Blacksmith and become what `utility-health.js` reads, with the
current hardcoded values as defaults. Squire's handle and party panel then consume Blacksmith's severity
function instead of their local `getHealthbarStatusClass`.

This is a visible behaviour change for users whose thresholds differ from 75/50/25 - their combat bar rings
will start agreeing with their health bars. That is the point, but it gets a CHANGELOG line saying so. It
also makes Phase 3 a two-module change, which is why it lands last.

**6. Overlap.** Order is: Blacksmith adds, verify in a live world, then Squire deletes and releases. Squire
cannot delete first or there is a release with no dice tray at all.

For the window where both modules are installed and only one is updated, the user sees two identical icons.
Rather than depend on tight release timing, `registerMenubarTool` gains an optional
`supersedes: ['squire-dice-tray']` - whichever registers second wins, deterministically, in either order.
It is reusable for Librarian. The tradeoff is a sibling's tool id as a string literal in the hub; this is a
migration affordance with a defined end - removed when Squire's release ships - not a standing dependency.
Flagged for the author; if rejected, fall back to sequencing the releases and accepting the duplicate icon.

Confirmed by grep across all eleven siblings: nothing outside Squire references `party-health`,
`squire-health`, `squire-dice-tray`, `squire-macros`, or any of the three window ids. The only consumer of
the `party-health` intent is Blacksmith's own combat bar (`scripts/manager-combatbar.js:1108` and `:2652`),
which goes through `hasIntentHandler`/`invokeIntent` and never names Squire. The intent contract survives
untouched provided the new health tool declares `intents: ['party-health']`.

## Phase 0 - groundwork

Shared machinery. Nothing user-visible ships in this phase.

- `scripts/manager-settings-adoption.js` (new). Table-driven adoption per Decision 3: raw-store reads,
  per-user guard flag for `user` scope, per-client guard for `client` scope, no-op when the source key is
  absent. Logs adopted keys through `postConsoleAndNotification`. Called from `ready` in `blacksmith.js`
  after settings registration.
- `scripts/window-base.js` - add a `migratePositionKey(oldKey, newKey)` helper covering the key and its
  `-titlebar` and `-theme` derivatives, per Decision 2.
- `scripts/api-menubar.js` - add `supersedes` handling to `registerMenubarTool` per Decision 6: on
  registration, drop any already-registered tool whose id is listed; on later registration of a superseded
  id, reject it. Order-independent.
- `scripts/api-windows.js` - no change needed; aliasing is just a second `registerWindow` call.

**Verification.** Client loads with no console errors. In the console,
`game.modules.get('coffee-pub-blacksmith').api.registerMenubarTool` accepts a `supersedes` array without
throwing, and registering a superseded id afterwards returns false. That is the whole of it - Phase 0 has
no UI.

## Phase 1 - Dice Tray

No user data, no shared settings. The proving run for the pattern.

**Files added**

- `scripts/window-dicetray.js` - panel folded into the window. Blacksmith has no `panel-*` prefix and that
  is deliberate; at 613+183 lines the combined file is unremarkable here.
- `templates/window-dicetray.hbs`
- `styles/window-dicetray.css` - both Squire stylesheets merged, plus the `@import` line in
  `styles/default.css`. The import is the step that is silently skippable, so it is called out.

**Files touched**

- `scripts/blacksmith.js` - register the window (`blacksmith-dice-tray` plus the
  `coffee-pub-squire-dice-tray-window` alias) and the `dice-tray` menubar tool with
  `supersedes: ['squire-dice-tray']`.
- `scripts/settings.js` - register `diceTrayShowRecentRolls`. Assign a `WORKFLOW_GROUPS` value and check
  the heading scope rule: this is player-visible, so every heading in its ancestor chain must be `'user'`.
  Run `node tools/check-settings-headings.mjs` afterwards.
- `scripts/manager-settings-adoption.js` - add the `diceTrayShowRecentRolls` row.

**Work**

- Sever `PanelManager.ensureReadyForMenubar()` and `PanelManager.instance.actor`. Replace with the
  selection source per Standing assumption A. This is the substantive change; everything else is
  transcription.
- Convert any raw `Hooks.on` to `HookManager.registerHook` with a `context` so `disposeByContext` works.
- Convert logging to `postConsoleAndNotification` - note it throws on a falsy message.
- Run the one-time position-key migration for `squire-dice-tray-micro-position`.

**Verification - live world**

1. Load a world with both modules active. Exactly one dice icon in the menubar, not two.
2. Click it. The tray opens, positioned where Squire's was, with the same titlebar mode and theme.
3. Roll each die type; results post to chat and the recent-rolls strip updates.
4. Toggle recent rolls off, close, reopen. Window height goes to 150 and the setting persisted.
5. Select a different token, then roll. Confirm the roll attributes to the actor named in Standing
   assumption A, and say which one it was.
6. Log in as a player. The tool is visible and functional; no console errors.
7. Disable Squire entirely. The dice tray still works and
   `openWindow('coffee-pub-squire-dice-tray-window')` still opens it.

Squire releases its deletion only after all seven pass.

## Phase 2 - Macros

Brings the two data settings.

**Files added**

- `scripts/window-macros.js` - panel folded in.
- `templates/window-macros.hbs`
- `styles/window-macros.css` - both Squire stylesheets merged, plus the `@import` line.

**Files touched**

- `scripts/blacksmith.js` - window `blacksmith-macros` plus the `coffee-pub-squire-macros-window` alias;
  `macros` menubar tool with `supersedes: ['squire-macros']` and the favourites context menu ported from
  `squire/scripts/squire.js:2222`.
- `scripts/settings.js` - `userMacros` (`scope: 'user'`, `config: false`) and `userFavoriteMacros`
  (`scope: 'client'`, `config: false`).
- `scripts/manager-settings-adoption.js` - rows for both, with the per-user and per-client guards.

**Work**

- Sever `PanelManager` as in Phase 1.
- Port `trackModuleTimeout` usage to Blacksmith's equivalent, or inline it if there is no equivalent.
- Preserve the `dropInProgress` re-entrancy guard (`squire/scripts/panel-macros.js:180`) - see Standing
  assumption B.
- Position-key migration for the macros window keys.

**Verification - live world**

1. Before updating, note the exact contents and order of the macro list and the favourites.
2. Update. Open the macros window: the list and its order are identical to step 1.
3. Right-click the menubar icon: favourites are listed, in order, with their macro artwork.
4. Click a favourite; it executes.
5. Drag a macro from the hotbar into the window; it appends. Reorder by dragging; the order persists across
   a reload.
6. Toggle a favourite on and off; the context menu reflects it without a reload.
7. As a second user, confirm that user's own macro list is theirs and not the first user's - this is the
   `scope: 'user'` guard doing its job.
8. In a second browser, confirm favourites are empty and the docs say so.

## Phase 3 - Health

The largest piece: selection ownership plus the threshold unification, and the only phase that requires a
matching Squire code change rather than a deletion.

**Files added**

- `scripts/window-health.js` - panel folded in.
- `scripts/manager-health.js` - selection tracking per Decision 4: a `controlToken` hook through
  `HookManager`, the current token set, and the `{ tokens }` opener option for the two force cases.
- `templates/window-health.hbs`
- `styles/window-health.css` plus the `@import` line.

**Files touched**

- `scripts/utility-health.js` - `getHealthSeverity` reads the three threshold settings instead of the
  hardcoded 75/50/25, defaults unchanged. Every existing caller keeps working; the combat bar rings and
  token blood indicators start honouring the settings, which is Decision 5.
- `scripts/settings.js` - `healthThresholdInjured` / `Bloodied` / `Critical` and `healthAdjustmentAmount`.
  Thresholds are `world`; check the heading chain scope for the adjustment amount, then run
  `node tools/check-settings-headings.mjs`.
- `scripts/blacksmith.js` - window `blacksmith-health` plus the `coffee-pub-squire-health-window` alias;
  `health` menubar tool with `intents: ['party-health']`, `supersedes: ['squire-health']`, and
  `visible: () => showHealthMenubarTool`.
- `scripts/manager-settings-adoption.js` - rows for the four settings.
- API doc for the severity function, which is now settings-driven and consumed cross-module, so it is
  public surface.

**Work**

- Sever the eight-plus Squire drive points by self-driving from selection.
- Expose severity for Squire's handle and party panel to consume in place of `getHealthbarStatusClass`.
  Squire's classes are named `squire-tray-healthbar-*`, so Squire maps Blacksmith's severity string to its
  own class names - Blacksmith does not learn Squire's CSS class names.

**Verification - live world**

1. Select one token. The health window follows the selection and titles with the actor's name.
2. Select three tokens. The window shows three entries and titles "Health: 3 Selected".
3. Deselect everything. The window shows the empty state rather than stale entries.
4. Apply damage and healing at several amounts; the adjustment amount persists across a reopen.
5. Click the combat bar's party health bar. The window opens - this is the `party-health` intent still
   resolving, now to Blacksmith's own tool.
6. Change `healthThresholdBloodied`. Confirm the health window bar colour, the combat bar portrait ring,
   and Squire's tray handle bar all change together. This is the whole point of Decision 5 and the one step
   that proves it.
7. Disable Squire. Health still works, the intent still resolves, no console errors.
8. As a player with `showHealthMenubarTool` off, the icon is absent; on, it is present.

## Standing assumptions for unattended work

Each is an open question for Squire. Work proceeds on the stated assumption if unanswered; each is cheap to
reverse and is called out in the phase's CHANGELOG entry so a wrong guess is visible rather than silent.

**A. What replaces `PanelManager.instance.actor`.** Squire's tray actor follows the tray's own tab
selection, which is not always the canvas selection. Assumption: use canvas selection -
`canvas.tokens.controlled[0]?.actor`, falling back to `game.user.character`. This is the semantics a
Blacksmith-level tool should have, and it is what Health already uses. If Squire wanted tray semantics
preserved, that is a Squire-specific behaviour and does not belong in the hub. The behaviour change is
called out in the CHANGELOG either way.

**B. Which oddities are load-bearing.** Four things look arbitrary and may be fixes for something.
Assumption: preserve all four verbatim, comment them as inherited, and ask afterwards.

- The dice tray's 280/150 height juggling in the constructor (`squire/scripts/window-dicetray.js:45-52`).
- The `dropInProgress` re-entrancy guard (`squire/scripts/panel-macros.js:180`).
- The `_registeredActors` Set in `squire/scripts/window-health.js:56`.
- The double-init-with-spin-loop in `ensureReadyForMenubar` (`squire/scripts/manager-panel.js:139-162`).
  This one dies with the `PanelManager` severance - but if it is guarding a real race, that race may
  reappear in Blacksmith. Watch for it in Phase 1 step 7.

**C. Alias lifetime.** Assumption: the three window-id aliases are permanent and undocumented - they cost
one Map entry each and exist so nobody's macro breaks. The `supersedes` entries are temporary and get
removed once Squire's deletion release has shipped.

**D. The three dead settings.** Assumption: genuinely dead, not about to be wired up. Not ported. Squire
removes them its side.

## Squire's half, per phase

Blacksmith does not touch Squire's repo. After each Blacksmith phase is verified:

1. Delete the panel, window, template, and stylesheets for that tool.
2. Remove the menubar and window registrations from `squire.js`.
3. Remove the settings that moved, and the three dead ones.
4. Phase 3 only: replace `getHealthbarStatusClass` with a call to Blacksmith's severity function, mapping
   the returned severity to Squire's `squire-tray-healthbar-*` class names. Keep `showHandleHealthBar`.
5. Remove the dead favourites context-building at `manager-panel.js:414,490`.
6. Release.
