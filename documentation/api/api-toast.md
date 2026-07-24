# Toast API

On-screen transient toasts, exposed as `module.api.toast`. A toast pops up over the play area
(top-center stack), shows a title/subtitle with an icon or image, and auto-dismisses — optionally
clickable to run a consumer action.

**This is a local, per-client primitive.** `show()` renders on the client that calls it, nothing
more. There is no cross-client delivery in this API: a consumer whose event already reached this
client (its own socket message, a world-setting sync, a document hook) calls `show()` receipt-side.
Because toasts never cross the socket, `onClick`/`onDismiss` are plain function references.

This is deliberately not Foundry's `ui.notifications`: that is a core-styled top-center text queue —
not actionable, not themeable, and it has no image slot.

Source: `scripts/api-toast.js`. Styles: `styles/toast.css`.

## Accessing

```javascript
const toast = game.modules.get('coffee-pub-blacksmith')?.api?.toast;
```

Available from `init` (assigned in the early synchronous API block — see the bootstrap notes in
`architecture-blacksmith.md` §3).

## `show(config)`

Show a toast on this client. Returns a toast ID (string), or `null` on error.

If the current user's name appears in the Excluded Users world setting (`toastExcludedUsers`,
Notifications settings — a comma-separated, case-insensitive list of Foundry user names), `show()`
renders nothing and returns `null` on the tabletop (`/game`). The check runs on the receiving
client, so it suppresses every delivery path — direct consumer calls and Blacksmith's internal
cross-client relays alike. It exists for accounts that cannot interact with the screen, e.g. a
camera or stream login. The `/stream` view is exempt: a stream-targeted toast (see `publish`)
renders there even when the logged-in account is on the exclusion list — exclusion protects a
passive account from tabletop noise, while publishing to the stream is deliberate.

`show()` also renders only on the view its `publish` config targets: by default toasts appear on
the active tabletop (`/game`) and never on Foundry's chat-only `/stream` capture view — on a
non-targeted view `show()` renders nothing and returns `null`. See the `publish` config below to
target the stream view or both.

**Config:**
- `title` (string, **required**): headline text
- `subtitle` (string, optional): second line
- `icon` (string, optional): FontAwesome icon class
- `image` (string, optional): image path/URL, rendered as a round avatar. Wins over `icon`.
- `duration` (number, optional): seconds before auto-dismiss; `0` = until closed (default: 8).
  A `0`-duration toast is **persistent**: it does not count toward the stack cap and is never
  evicted — only the × button, a matching `stackKey` replacement, or programmatic removal ends it.
- `color` (string, optional): accent color as **strict hex** (`#rgb` or `#rrggbb`; anything else
  renders the default look). Drives the border, icon, and title. Validated and applied as a CSS
  custom property — arbitrary CSS cannot be injected.
- `backgroundColor` (string, optional): box background color as strict hex, **independent of the
  accent** (default: the dark base). Rendered slightly translucent (alpha 0.9) so the play area
  reads through, matching the default look. A `backgroundImage` covers it when both are set.
- `size` (string, optional): omit for a normal toast (content-fit, stacks top-center). `'small'` |
  `'medium'` | `'large'` | `'fullscreen'` render a **billboard** instead: a viewport-proportional
  box (both dimensions — roughly 26×18 / 40×28 / 58×42 percent, fullscreen 100×100 with a dark
  scrim), centered on screen, with typography scaling relationally with the box. Billboards are
  **singletons** (a new one replaces the current, whatever its size), exempt from the stack cap,
  and — with no `onClick` — clicking anywhere dismisses (that counts as a dismissal — `onDismiss`
  fires). Long messages scroll inside the box rather than growing it.
- `animation` (string, optional): content animation, **billboards only** — ignored without a
  `size`, so stacked toasts always render still. `'pop'` scales the content in with a springy
  bounce; `'reveal'` stages the entrance (icon, then title, then subtitle); `'pulse'` is a subtle
  infinite breathe meant for persistent (`duration: 0`) billboards. Anything else renders without
  animation. Pure CSS on the content children, and honors `prefers-reduced-motion` (reduced-motion
  users get instant content).
- `backgroundImage` (string, optional): image path/URL rendered as a cover background behind the
  toast content, with an automatic dark scrim so text stays legible. Combines with `image` (the
  avatar floats over it); best with the larger sizes and fullscreen.
- `sound` (string, optional): audio path played locally when the toast appears. Cross-client
  Blacksmith relays carry the path as data and each recipient plays it locally.
- `moduleId` (string, optional): owning module, used by `clearByModule` (default: `"blacksmith-core"`)
- `onClick` (Function, optional): makes the toast clickable (pointer cursor, hover affordance,
  button sound on click). Called with the click event when the user clicks the toast body; the toast
  is then removed. `onDismiss` does **not** fire after `onClick`. Runs in Blacksmith's context —
  keep it self-contained, same rule as menubar tool `onClick`.
- `onDismiss` (Function, optional): fires only when the toast goes away *without being acted on* —
  see the dismiss semantics below.
- `stackKey` (string, optional): toasts stack by default (capped; oldest evicted). A new toast with
  the same `stackKey` **replaces** the existing one in place — use for "latest state wins" toasts
  (unread counters, current leader) instead of stacking duplicates.
- `publish` (string, optional): which Foundry view renders the toast — `'game'` (the active
  tabletop, **default**), `'stream'` (the chat-only `/stream` capture page, typically recorded by
  OBS), or `'both'`. Anything else falls back to `'game'`. Checked receipt-side against
  `game.view`, so it holds across every delivery path; plain data, so it rides Blacksmith's
  cross-client relays unchanged.

Title and subtitle are rendered as text, never parsed as HTML.

**Dismiss semantics** — the same contract as menubar notifications (`api-menubar.md`,
`addNotification`), extended with the toast-only paths:

| Removal path | `onDismiss` fires? |
|---|---|
| Auto-timeout (`duration` elapses) | **Yes** |
| User clicks the × close button | **Yes** |
| User clicks the body (`onClick` ran) | No — the click already told you |
| Consumer calls `remove(id)` | No — you initiated it |
| `clearByModule(moduleId)` | No — bulk teardown |
| Replaced via `stackKey` | No — superseded, not dismissed |
| Evicted by the stack cap | No |

**Examples:**

```javascript
const toast = game.modules.get('coffee-pub-blacksmith').api.toast;

// Passive toast
toast.show({
    title: "Quest complete",
    subtitle: "The Ruined Tower",
    icon: "fa-solid fa-trophy",
    moduleId: "my-module"
});

// Actionable message splash with an avatar — click opens the conversation
toast.show({
    title: `Message from ${senderUser.name}`,
    subtitle: "Click to open the conversation",
    image: senderUser.avatar,
    duration: 8,
    moduleId: "my-module",
    stackKey: "my-module-incoming-message",   // a newer message replaces this splash
    onClick: () => openMessagesWindow({ conversationId }),
    onDismiss: () => { /* went away unread */ }
});
```

## `remove(toastId)`

Remove a toast programmatically. Silent — `onDismiss` does not fire. Returns `boolean`.

## `clearByModule(moduleId)`

Remove all toasts owned by a module (e.g. on your module's cleanup). Silent. Returns the count removed.

## `getActive()`

Returns `Array<{ id, moduleId, stackKey, persistent, color, backgroundColor, size, animation }>`
for the toasts currently on screen — display metadata only, no elements or callbacks.

## Stacking model

Toasts stack vertically at top-center, newest at the bottom of the stack. The cap (see `MAX_STACK`
in `scripts/api-toast.js`) applies to **transient** toasts only: when full, the oldest transient
toast is evicted silently. Persistent (`duration: 0`) toasts sit outside the cap and are never
evicted. Same-`stackKey` toasts replace in place regardless of persistence. Rendering is
DOM-direct — there is no template or re-render cycle; see `architecture-toast.md` for the
mechanism.
