# Architecture: Tool Windows

**Audience:** us, and the other Coffee Pub modules.

How the Dice Tray, Macros, and Health windows are built, and the two pieces of shared machinery they
introduced: settings adoption from a sibling module, and menubar tool supersession.

The public surface is in `documentation/api/api-window.md` and `documentation/api/api-menubar.md`.

## The three windows

Each is a single file extending `BlacksmithToolWindowBaseV2`, with a template and a stylesheet of the same
name. There is no panel class. In Squire, where these came from, each was a panel plus a window shell; two
of the three panels existed largely to reach `PanelManager` for the current actor, and that need does not
exist here.

| Tool | Script | Menubar id | Window id |
|---|---|---|---|
| Dice Tray | `scripts/window-dicetray.js` | `dice-tray` | `blacksmith-dice-tray` |
| Macros | `scripts/window-macros.js` | `macros` | `blacksmith-macros` |
| Health | `scripts/window-health.js` | `health` | `blacksmith-health` |

**The `dice-tray` menubar tool is no longer only a dice tray opener.** It is the single menubar entry for
everything to do with rolling: a player's left click opens the Dice Tray, a GM's opens Request a Roll, and
its context menu carries both plus the manual-rolls toggle and the quick roll library. Its icon also reports
whether Foundry's manual rolls are on. The WINDOW in the table above is unchanged; the tool that opens it is
not. See `architecture-rolls.md`, "One menubar entry for rolling".

**A fourth Tool window exists that is not in this table:** the Roll Builder
(`scripts/window-rollbuilder.js`). It is deliberately absent, because it is ephemeral rather than
persistent — opened from an in-flow action, unregistered, a distinct id per instance and
`rememberPosition: false`, per the "Ephemeral tools" rules in `../api/api-window.md`. Nothing here assumes a
Tool window is registered, and it is the worked example of that.

Registration happens explicitly from `ready` in `scripts/blacksmith.js`, not from each file's own `ready`
hook, so ordering against settings registration is decided in one place. Each `register*` function imports
`registerWindow` from `api-windows.js` and `MenuBar` directly rather than going through `module.api` --
the window methods attach to `module.api` from an async dynamic import, so they are not guaranteed to be
present at any particular moment.

### Three id namespaces, not one

Worth stating because conflating them caused a wrong assumption during the move -- the id that looked
at-risk was not the one that was:

- The **registry id** is what `openWindow` takes. Renaming it breaks callers.
- The **ApplicationV2 id** (`DEFAULT_OPTIONS.id`) is the DOM id. Nothing persists against it.
- The **`windowPositionKey`** is what position persists against, plus the titlebar-mode and theme
  preference keys derived from it. Renaming it silently resets all three.

`BlacksmithWindowBaseV2.migratePositionKey(oldKey, newKey)` moves the three localStorage keys once and
deletes the originals. It refuses to overwrite a value already present under the new key, so a second call
after the user has moved the window cannot undo their change.

### Which actor a window names

Dice Tray and Macros title themselves with an actor, resolved by
`canvas.tokens.controlled[0]?.actor ?? game.user.character`. This is cosmetic in both cases: dice rolls use
`ChatMessage.getSpeaker()` with no argument, so Foundry resolves the speaker from the user's own token, and
a macro runs whatever its own script resolves.

Health is the one that reads its selection as data rather than decoration -- see below.

### Health owns its selection

The window registers a `controlToken` hook through `HookManager` with a per-instance context, so closing it
disposes the hook rather than leaking a listener. The callback is debounced by one tick, because
`Token#control` fires the hook once per token and a multi-select would otherwise re-render once per token
in the selection.

Callers that need a set of tokens shown *without* changing what the GM has selected pass
`openWindow('blacksmith-health', { tokens })`. That is an option on the opener rather than a method on the
instance, so the surface stays a registry call and no caller needs to hold the window object.

`_registeredActors` is the unregister list, and it is load-bearing rather than tidy. With nothing selected
the window registers itself into `actor.apps` for **every token on the scene that has hit points**, so that
damage anywhere refreshes the Party and NPC summary rows. Without the set those entries cannot be found
again, and closing the window would leave `apps` references across the whole scene pointing at a dead
window.

### The conditions button

Each individual health row can carry a button that opens a conditions editor. Blacksmith has no such
window, so the button renders only when some module has registered one under the window id
`blacksmith-status-effects`.

Naming a capability rather than a module is the same rule the `party-health` menubar intent follows: when
nobody provides it the button does not render, which is the correct behaviour for an optional integration
and avoids offering a click that would do nothing.

### The dice tray's two heights

With the roll history hidden the window has no content tall enough to size against, so it opens at a fixed
150px and `_fitHiddenHistoryHeight()` measures the real content once rendered -- taking the last child's
bottom edge rather than the content box, because the content box keeps the height it had while the history
was visible. The pair is load-bearing: port both or neither.

### The macros drop guard

`_addDroppedMacro` is guarded against re-entry. ApplicationV2 windows share Foundry's global drag surface,
so two handlers can observe one drop, and the body is a read-modify-write on the `userMacros` setting --
two concurrent adds lose one. External drops are captured at the content boundary so canvas and sidebar
handlers cannot also process them; internal reordering is allowed to reach the individual slot handlers.

## Health severity is defined once

`scripts/utility-health.js` holds the single definition of what "bloodied" means. It is read by the combat
bar portrait rings, the token blood indicators, and the Health window, and is exported so a consuming
module can use it instead of growing a fourth copy.

Boundaries come from the `healthThresholdInjured` / `Bloodied` / `Critical` world settings rather than
constants, and are inclusive: a creature at exactly the bloodied threshold is bloodied, which matches how
the settings describe themselves. `getHealthThresholds` reads settings directly with a hardcoded fallback,
so it works before settings registration and needs no window or manager instance -- a consuming module's
tray handle rebuilds on every render and cannot depend on a window being open.

`hurt` has no threshold of its own. It means "has taken damage but is above the injured line", which
distinguishes a scratch from an untouched creature; the blood indicators use it and the health bars do not.

## Settings adoption

`scripts/manager-settings-adoption.js` moves a setting from a sibling module's namespace into Blacksmith's,
once. It runs from `ready` after `registerSettings()`, and is deliberately non-fatal: a failed adoption
costs the user their old preferences, not the module, so it must not be able to stall loading.

Blacksmith owns this rather than the departing module because a departing module can only migrate if the
user installs the one release carrying the migration before removing it, and nothing guarantees that
ordering. Reading the old key from here is order-independent.

Reads take the registered path when the sibling is still installed, because that applies its declared type
and default, and fall back to the raw store otherwise -- `game.settings.get` throws on an unregistered key,
and uninstalling a module does not delete its stored settings. World and user scope share one store
(`client-settings.mjs:42-46`), distinguished by user id; client scope is localStorage holding the
serialised form.

There is one ledger per scope, because "has this been adopted" has a different answer for different people:

| Scope | Ledger | Why |
|---|---|---|
| `world` | `adoptedSettingsWorld` setting | Adopted once for the world. GM only -- players cannot write world settings, and skipping them is correct rather than an error. |
| `user` | `adoptedSettingsUser` setting | Each user owns their own value and can only write their own. |
| `client` | `blacksmith-adopted-settings` in localStorage | Per browser, because that is where the values live. |

A row is marked done even when the source had nothing to adopt, so an absent key is not re-checked on every
load forever, and it is left marked when a write fails -- a value that fails once fails every time.

**A `client`-scope setting is per browser and no migration changes that.** `userFavoriteMacros` is the case
that matters: a user logging in from a second machine starts with an empty favourites list.

Window-open state is adopted separately in `scripts/manager-tool-windows.js`, because it is a user flag
rather than a setting and the shape does not fit the table.

## Menubar supersession

`registerMenubarTool` accepts `supersedes: [toolId, ...]`. A listed id already registered is dropped; a
listed id registering later is refused. Both halves are needed because module load order is not something
either module controls, so a rule that works only one way round is not a rule.

This exists for the window during which a tool has moved between modules and a user has updated one module
but not the other -- without it they see two identical icons. `unregisterMenubarTool` releases the claims a
tool made, or unregistering the new owner would leave the old one permanently unable to register.

**Nothing declares `supersedes` today.** The Squire adoption that prompted it shipped both modules together,
so no overlap ever reached a world. The mechanism is kept because the next extraction hits the same problem,
and because a `supersedes` entry is meant to be transient: it is a migration affordance with a defined end,
not a priority system, and it is removed once the old owner's release has shipped.
