# Plan: Adopt Squire's Dice Tray, Macros, and Health tools

**Status: Implemented, partly verified.** All three windows load and work with Squire disabled, confirmed by
the author on 2026-08-09. What is still owed is data-level rather than functional -- that the adopted macro
list, favourites, and thresholds are the user's own values rather than defaults, and the threshold
unification across the combat bar, blood indicators, and health bars. Those are in
`testing/testing-squire-tool-adoption.md`.

The content of this plan has been distributed: design to `architecture/architecture-tool-windows.md`,
surface to `api/api-health.md`, `api/api-window.md`, and `api/api-menubar.md`, history to the
`[Unreleased]` section of `CHANGELOG.md`, and Squire's remaining half to `TODO-GLOBAL.md`.

**What is left here is only the reasoning that has no other home: what was decided, what was wrong, and
what got built and then removed. Delete this file once the testing document is empty.**

Four deviations from the plan below, all deliberate:

- **No `manager-health.js`.** Selection tracking is 30 lines and belongs to the window that uses it; a
  manager would have been a file whose only caller is one constructor.
- **`manager-tool-windows.js` was not planned.** Squire's `windowStates` user flag reopens tool windows on
  load, and the handover note did not list it because it is a flag rather than a setting -- so it would have
  been silently orphaned. Found while reading `panel-dicetray.js`.
- **The health rows' conditions button opened a Squire window.** Not something the plan anticipated. It now
  renders only when a module registers `blacksmith-status-effects`, naming a capability rather than a
  sibling.
- **The window-id aliases and the three `supersedes` entries were built, then removed** on 2026-08-09 once
  the author confirmed a single consumer and a simultaneous release. See Decisions 1, 6, and E.

Blacksmith adopts three tools that currently live in Squire but serve every module's audience: Dice Tray,
Macros, and Health. Settled 2026-08-09: **Blacksmith pulls; Squire does not write Blacksmith code.** Every
remaining decision is about Blacksmith's shape - file prefixes, HookManager registration, settings groups
and heading scope, the CSS import chain, the severity source of truth - and a session working in Squire
would be guessing at all of them.

Squire's half was two things only: answer the behavioural questions, then delete and release. Both modules
ship together.

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

**Superseded 2026-08-09: the Squire registry ids are NOT kept as aliases.** They were, briefly, on the
reasoning that a rename would silently kill a user's macro. That reasoning assumed users. There is one
consumer, both modules release together, and a search of the world's macro database found no call to any
of the three ids -- so the aliases protected a caller that does not exist, and by the repo's own
delete-dead-code rule they came out.

Menubar tool ids were never aliased. `toolbarIcons` is also a `Map` but it renders, so a second entry is a
second visible icon.

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
`registerMenubarTool` gained an optional `supersedes: [toolId]` for this - whichever registers second wins,
deterministically, in either order.

**Superseded 2026-08-09: nothing declares it.** With one consumer releasing both modules together, that
window never opens, so the three `supersedes: ['squire-*']` entries were dead on arrival and came out. The
mechanism stays, documented in `api/api-menubar.md`, because the Librarian extraction meets the same
problem -- and because it is the kind of thing that is cheap now and awkward to retrofit under time
pressure later.

Confirmed by grep across all eleven siblings: nothing outside Squire references `party-health`,
`squire-health`, `squire-dice-tray`, `squire-macros`, or any of the three window ids. The only consumer of
the `party-health` intent is Blacksmith's own combat bar (`scripts/manager-combatbar.js:1108` and `:2652`),
which goes through `hasIntentHandler`/`invokeIntent` and never names Squire. The intent contract survives
untouched provided the new health tool declares `intents: ['party-health']`.

## Phases 0-3 - removed

The four phase sections listed files to create, settings to register, and verification steps. All of it has
landed or moved on: the shipped design is in `architecture/architecture-tool-windows.md`, the surface in
`api/api-health.md`, `api/api-window.md`, and `api/api-menubar.md`, the history in `CHANGELOG.md`, and the
verification still owed in `testing/testing-squire-tool-adoption.md`. Squire's remaining half is in
`TODO-GLOBAL.md`.

Leaving them here would have left instructions that contradict the code -- several named an alias and a
`supersedes` entry that no longer exist.

## Resolved by Squire, 2026-08-09

**A. The actor source. Confirmed a behaviour change, and the divergence is not selection.**
`PanelManager.instance.actor` is a "current character" with four inputs, not canvas selection:

- Startup fallback chain (`squire/scripts/manager-panel.js:2014-2048`): controlled token, then
  `game.user.character`, then first owned character token, then any owned token.
- `controlToken`, gain only (`squire/scripts/squire.js:2449`). Release deliberately never re-initialises -
  doing so resurrected the previous actor and swallowed character-switcher clicks.
- `renderActorSheet5e` (`squire/scripts/squire.js:180-193`). Opening any actor sheet re-points the tray with
  no canvas selection involved.
- The character switcher (`squire/scripts/manager-panel.js:1550-1556`), which controls the token and
  force-initialises.

Blacksmith uses canvas selection with a `game.user.character` fallback; Squire confirms that is right for a
hub tool and is not asking for its semantics to be reproduced. **The CHANGELOG line calls out the
sheet-open case, not selection** - a GM who opened an NPC sheet to check something used to re-point the
dice tray without touching the canvas, and will no longer.

**B. Three of the four are load-bearing; the fourth is dropped.**

- Dice tray 280/150 - **keep.** `diceTrayShowRecentRolls` hides the history block and the window then has
  no content to size against. Paired with `_fitHiddenHistoryHeight()`, which measures the last child and
  sets height from it. Port both or neither.
- `dropInProgress` - **keep.** Guards a read-modify-write on `userMacros`
  (`squire/scripts/panel-macros.js:186-189`). AppV2 windows share Foundry's global drag surface and two
  handlers can see one drop; two concurrent adds would lose one.
- `_registeredActors` - **keep**, and it is subtler than it looks. It is the unregister list. Registration
  writes `actor.apps[this.id] = this`, and with nothing selected it registers **every token on the scene
  with HP** (`_registerCurrentActors`, `squire/scripts/window-health.js:186-192`). Without the set those
  cannot be cleaned up, leaving `apps` entries across the scene pointing at a closed window.
- The spin loop - **drop.** Incidental; it arrived with the menubar fallback itself (Squire commit
  `4198b7c`) as belt-and-braces around Squire's own async init, not a Foundry race. Severing `PanelManager`
  removes what it was waiting for. Anything resembling it after the move is a real signal, not this
  recurring.

**C. Thresholds - agreed, with one requirement.** Squire consumes Blacksmith's severity function and maps
the returned string to its own `squire-tray-healthbar-*` classes at `manager-handle.js:75` and
`panel-party.js:73,619`. **The thresholds must be readable without a window open**, since the handle renders
on every tray build - so severity lives in `utility-health.js` and reads settings directly, with no window
or manager instance required. The severity vocabulary goes to Squire when Phase 3 lands.

**D. The three dead settings are confirmed dead**, as is the favourites context-building at
`squire/scripts/manager-panel.js:414,490`. Squire deletes all four its side. Not ported.

**E. Alias lifetime -- resolved by removal, 2026-08-09.** The aliases and the three `supersedes` entries
were both stripped once the author confirmed there is a single consumer and both modules ship together.
See the amendments to Decisions 1 and 6.

The general lesson, since Librarian is next: **both were written to protect users who do not exist.** The
handover framing carried an implicit "in the wild" that was never true here, and it cost two mechanisms
that then had to be removed. Ask who the affected user is before building the affordance.

