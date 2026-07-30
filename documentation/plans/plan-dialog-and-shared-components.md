# Plan: Dialog API and Shared Selection / Quantity Components

**Status: Spec settled with Squire 2026-07-29. Nothing implemented. Steps 1-3 are unblocked.**

Supersedes Squire's earlier proposal for a hub-owned Transfer/Share workflow window (`transfer.open`, mode
enum, approval orchestration, transfer-flow registry). That proposal is dead; do not revive it from this file.

Blacksmith ships three things: `api.dialog`, a shared selectable-entity component, and a shared
quantity/split control. Squire builds and owns its Transfer tool on `BlacksmithToolWindowBaseV2` plus those
components, and owns both sides of recipient approval through its own sockets.

Reconsider a shared workflow shell, or a dialog-opening picker helper, only if real duplication remains
across two or more consumer modules after these components are in use.

## Why the components and not the workflow

Recorded so it is not re-argued. The rejected shell would have had Squire supply the subject data, the
configuration template, `getValue`, `validate`, the recipient list, `onSubmit`, the sockets, the permission
checks, the revalidation, and the notifications — leaving Blacksmith a header, three section wrappers, a
list, and an action bar. Blacksmith already ships all of that except the list:

- `window-base.js` — Application V2 lifecycle, position persistence, scroll restore, and size constraints,
  all inherited by the Tool base. Squire's Cancel / primary pair goes in the Tool template's
  `toolFooterLeft` / `toolFooterRight` zones, styled with `blacksmith-window-btn-primary` / `-secondary` /
  `-critical`.
- `styles/window-form-controls.css` — `.blacksmith-field`, `.blacksmith-field-label`, `.blacksmith-slider`,
  `.blacksmith-input`, `.blacksmith-badge`.

Two further reasons the shell was refused:

1. Blacksmith has no way to verify a transfer flow. There is no test framework; verification is running
   Foundry, and Blacksmith has no item-transfer domain to exercise. Every shell bug would surface in Squire
   and be debugged across two repos.
2. Approval requires the window to open on a *different* client than the one that called it. Either the
   consumer constructs it there (in which case Blacksmith contributed only these components), or Blacksmith
   listens on sockets and opens windows for modules — which puts the hub in the transfer business and drags
   in the broadcast-then-filter receipt model in `manager-sockets.js` (`_isLocalRecipient`).

## Settled scope questions

Four points were corrected during review and accepted by Squire. They are settled, not open:

- **The Transfer tool is a Tool window, and Light/Dark/Glass therefore stays in scope.** Corrected
  2026-07-30. An earlier draft of this plan named `BlacksmithWindowBaseV2`; that was an unexamined choice on
  Blacksmith's side, and the theme criterion was wrongly dropped to accommodate it. "How many, and to whom,
  then send" is a compact canvas utility in the Dice Tray / Health family, not a document editor.
  `BlacksmithToolWindowBaseV2` is the right base, it supplies Micro/Full chrome and the Light/Dark/Glass
  trio, and no standard-base theme work is required or wanted here. Whether the *standard* base should ever
  gain themes remains a separate design-system question, tracked in `TODO.md`.
- **Single-select is verified first.** `window-toast-send.js` is multi-select only, so it validates half the
  component; single-select is the mode Squire's transfer actually needs. `MenuBar.showLeaderDialog` is the
  single-select target and comes first.
- **`window-skillcheck.js` is not a validation target.** It extends `BlacksmithWindowBaseV2`
  (`window-skillcheck.js:11`), but at ~2,700 lines with level/class/type/HP rows and four filters
  (`templates/window-skillcheck.hbs:48-59`) converting it is a refactor of that window, not a component
  test. Later, opportunistically, alongside `window-stats-party.js`. That template also uses the `cpb-`
  prefix rather than `blacksmith-`.
- **The embedded component has no action vocabulary.** `{ action: 'submit' | 'cancel' | 'close' }` belongs
  to something that owns an open/close lifecycle. Embedded in a host window, the component reports selection
  changes instead.

## Tool base: ephemeral, non-menubar use is supported — with four caveats

Squire asked whether `BlacksmithToolWindowBaseV2` assumes every Tool window is registered and persistent.
It does not. Verified against `window-tool-base.js` and `window-base.js` on 2026-07-30:

- No menubar coupling anywhere in either base. The `registerWindow` / `openWindow` registry
  (`api-windows.js`, 63 lines) is a separate, optional surface whose only purpose is letting *something else*
  open a window by id.
- No singleton enforcement, no static instance tracking, no fixed `id` in `DEFAULT_OPTIONS`.
- `new TransferTool(opts).render(true)` is the supported path, and it is already how Blacksmith opens
  `ToastSendWindow` (`api-menubar.js:4113`).

So Squire should **not** register the Transfer tool. Registration exists to expose a launcher; a tool that
should only ever open from a transfer/give/share action has nothing to gain from it.

Four caveats matter specifically because this is the first *ephemeral, possibly multi-instance* Tool consumer.
The only existing Tool consumer, `CombatantCardToolWindow` (`manager-combatbar.js:11`), is a single instance
that already sets `rememberPosition: false` (`:33`) — so none of this has been exercised.

1. **Do not use `ACTION_HANDLERS` for a class that can have two instances open at once.** `static _ref` and
   `static _delegationAttached` are per-class, so clicks in either window resolve against whichever instance
   rendered last. A player initiating a transfer while an incoming approval window is open hits this
   directly, and the failure mode is acting on the wrong transfer. Full detail and the workaround are in
   `known-issues.md` under Windows. Bind per-instance listeners on `this.element` in `_onRender` instead.
2. **Set `rememberPosition: false`.** `_positionKey` defaults to the class name (`window-base.js:95`), so two
   instances share one key and fight over it through the 250ms debounced save (`:117-122`) — the second opens
   on top of the first and each move overwrites the other. This does not cost theme persistence: the theme
   and titlebar keys derive from `_positionKey` as a string (`window-tool-base.js:119`, `:123`) and are gated
   by their own `rememberToolTheme` / `rememberTitlebarMode` flags, so a user's Glass choice still persists
   across transfers.
3. **Options are frozen.** Use `setToolTheme()` / `setToolTitlebarMode()`; never assign
   `this.options.toolTheme`.
4. **The recipient list is the growth axis.** `height: 'auto'` with `resizable: false` is the Tool default
   (`window-tool-base.js:35-39`); `.blacksmith-window-tool-body` is `overflow: auto`
   (`styles/window-tool.css:200-204`) and the base clamps to `maxHeight: calc(100vh - 16px)`. Verify with a
   large party before assuming it is comfortable.

## 1. `api.dialog`

Thin wrapper over `foundry.applications.api.DialogV2` for confirmations, choices, prompts, and short custom
interactions. Presentation and promise semantics only: no domain logic, no cross-client state, no template
loading.

Blacksmith is the primary consumer. Current raw usage, counted 2026-07-29: **33 call sites across 11
files** — 20 `DialogV2.confirm`, 4 `.wait`, 1 `.prompt`, 8 `new DialogV2`. Zero legacy `Dialog`, so this is
consolidation, not migration. Largest clusters: `window-pin-layers.js` (12), `api-menubar.js` (4 hand-built),
`window-stats-party.js` (4).

There is no dialog stylesheet in the repo. The only DialogV2 styling that exists is a one-off at
`styles/vote.css:274` for `.blacksmith-leader-tie-breaker`. Every Blacksmith dialog today is unthemed
Foundry default.

### Surface

`confirm(options)`, `choose(options)`, `prompt(options)`, `wait(options)`.

### Dismissal contract — the main value

User dismissal never rejects. Escape and the title-bar close button resolve `closeValue`; an explicit Cancel
button resolves `cancelValue`; where a helper does not distinguish the two, both resolve one documented
fallback. Exceptions thrown by consumer callbacks and framework failures may still reject. Every helper sets
or internally enforces the equivalent of `rejectClose: false`.

This is the single most valuable thing the wrapper adds — the raw statics' reject-on-dismiss behavior is
what call sites get wrong.

### Result vocabulary

```js
{ action: 'submit', value, result }
{ action: 'cancel', value: cancelValue }
{ action: 'close',  value: closeValue }
```

`confirm` resolves a boolean instead, matching `DialogV2.confirm` — all 20 existing Blacksmith sites consume
a boolean, and an object would churn every one of them for nothing.

### Content contract

`content` accepts `string | HTMLElement | Promise<string | HTMLElement>`. DOM support is required, not
optional: `utility-common.js:808` already builds its content as DOM specifically so a copied snippet is not
interpreted as markup. A string-only helper re-introduces that bug suite-wide.

Consumers render their own Handlebars before calling. The dialog API does not own template loading.

### Shared behavior

Foundry `DialogV2` only; async callbacks; buttons disabled while a callback runs; duplicate submission
prevented; destructive button treatment; inline validation; Blacksmith dialog styling and action
conventions; focus restored on close.

### `choose`

The only genuinely new surface — the other three map onto DialogV2 statics. Each choice accepts
`{ id, label, icon, description, disabled, destructive, callback }`.

## 2. Shared selectable-entity component

Single- and multi-select entity presentation, owning none of the workflow that consumes the selection.

Descriptor: `{ id, uuid, name, img, type, disabled, disabledReason, badges, metadata }`.

Capabilities: single and multi select; image plus name; optional type treatment, badges, and metadata;
disabled entries with an accessible reason; keyboard navigation; selected-state styling; consumer filtering;
empty state. Compact/list/grid variants only if an actual in-repo consumer needs them — do not build all
three speculatively.

Optional convenience adapters for Users, Actors, canvas Tokens, and campaign party members. Consumers can
always pass descriptor arrays directly.

### Embedded contract

The component renders into a host container and reports selection. It does not submit, cancel, or close:

```js
onSelectionChange: ({ selected, changed, sourceEvent }) => {}
getSelection: () => selectedEntities
setSelection: (ids) => {}
```

In single-select mode `selected` holds zero or one entity; in multi-select mode it may hold many.

The component opens and closes no window, submits no form, opens no sockets, mutates no documents, changes
no ownership, and sends no notifications.

A dialog-opening picker helper — the component inside `api.dialog`, resolving with the shared action
vocabulary — is deferred until a second real consumer needs it. `MenuBar.showLeaderDialog` composes the two
by hand in the meantime, which is the point of using it as the verification target.

### Consumers

Blacksmith: leader selection (`api-menubar.js` `showLeaderDialog`, single), user selection
(`window-toast-send.js`, multi). Squire: character selection for transfers, user selection for private notes.
Later opportunistic: `window-skillcheck.js`, `window-stats-party.js`.

## 3. Shared quantity/split control

Upstream Squire's existing selector rather than recreating it from a description — that is also the only way
the "no degradation" criterion is actually guaranteed. Squire contributes markup and CSS; Blacksmith owns the
naming, the shared contract, `styles/window-form-controls.css`, the documentation in
`design-system/design-components.md`, and any value/update helper.

Baseline behavior to preserve: clear Give and Keep values, slider between valid bounds, immediate visual
update, correct singular/plural, keyboard accessible, compact.

Consumers own min/max/initial values, labels, domain validation, and what the number means.

Squire's illustrative markup uses `blacksmith-quantity-split` / `blacksmith-quantity-value` with
`data-quantity-give` / `data-quantity-keep` around an existing `.blacksmith-slider`. Final naming is
Blacksmith's; that shape is a reasonable starting point.

**Blocked on Squire's contribution.**

## Verification

No test framework — every item states its live check.

| Item | Verification |
|---|---|
| `api.dialog` semantics | Convert the 13-dialog cluster in `window-pin-layers.js` (11 confirms, 2 prompts). Exercise each converted path in a live world: confirm accept, confirm cancel, Escape, title-bar close. Confirm no path rejects on dismissal. |
| `api.dialog` styling | New `styles/dialog.css` **with an `@import` in `styles/default.css`** — a CSS file without the import is silently unstyled. Visually check one confirm, one choose, one prompt. |
| `choose` | Exercise via a real converted site (the pin-layers scope choices are the natural fit), including a disabled choice and a destructive choice. |
| Entity component — single-select | Convert `MenuBar.showLeaderDialog` (`api-menubar.js:4129-4190`) from its bare `<select>` in a raw DialogV2 to `api.dialog` plus the component. Verify setting a leader, clearing to None, and that the stored `partyLeader` setting shape is unchanged. |
| Entity component — multi-select | Convert the user list in `window-toast-send.js:130-171`. Verify party toggle, offline dimming, per-user checkboxes, and that a send still addresses the right users. |
| Entity component — disabled | A disabled entry cannot be selected by mouse or keyboard and surfaces its `disabledReason`. |
| Entity component — Tool hosting | **Gap opened by the base-class correction.** Both targets above are non-Tool surfaces: `showLeaderDialog` is a DialogV2 and `ToastSendWindow` extends the standard base (`window-toast-send.js:73`). Squire hosts the component in a Tool window under Light, Dark, and **Glass**, so that combination would ship unverified. Render the component in a scratch Tool window in all three themes and confirm portraits, names, badges, and selected state stay legible against the translucent Glass surface. The component must inherit `--blacksmith-tool-*` rather than hard-coding a surface. |
| Quantity control | Reproduce Squire's current interaction with the contributed markup before Squire removes its local version. Check bounds, singular/plural, keyboard, immediate update, and give+keep always summing to the stack. |

## Docs on completion

- New `documentation/api/api-dialog.md`. Add it to the `PUBLISH` list in `tools/wiki-sync.mjs` — a new doc
  goes live only when listed there.
- Entity component and quantity control documented in `design-system/design-components.md`.
- `api-window.md` gains a pointer to the components if consumers reach them through `module.api`.
- Distribute this plan and delete it.

## Sequence

1. Blacksmith: `api.dialog` + `styles/dialog.css`, verified against `window-pin-layers.js`.
2. Blacksmith: entity component, single-select, verified via `MenuBar.showLeaderDialog` on `api.dialog`.
3. Blacksmith: same component, multi-select, verified via `window-toast-send.js`.
4. Squire contributes quantity markup and CSS; Blacksmith names, documents, and verifies it.
5. Squire builds its Transfer tool on `BlacksmithToolWindowBaseV2` plus items 2 and 3, unregistered, opened
   only from transfer/give/share actions.
6. Squire migrates its simple legacy dialogs to `api.dialog`.
7. Squire moves JSON imports to `window-json-import.js` / `registry-json-import-*.js`. Independent of
   everything above; can proceed now.

Steps 1-3 are Blacksmith's whole commitment and depend on nothing external. Step 4 is blocked on Squire.

## Out of scope

Transfer semantics, mode enumeration, a transfer-flow registry, approval orchestration, socket coordination
between sender and recipient, themes on the standard window base, and a dialog-opening picker helper.
