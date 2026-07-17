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

**Config:**
- `title` (string, **required**): headline text
- `subtitle` (string, optional): second line
- `icon` (string, optional): FontAwesome icon class
- `image` (string, optional): image path/URL, rendered as a round avatar. Wins over `icon`.
- `duration` (number, optional): seconds before auto-dismiss; `0` = until closed (default: 8)
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

Returns `Array<{ id, moduleId, stackKey }>` for the toasts currently on screen — display metadata
only, no elements or callbacks.

## Stacking model

Toasts stack vertically at top-center, newest at the bottom of the stack, capped (see `MAX_STACK`
in `scripts/api-toast.js`); when full, the oldest is evicted silently. Same-`stackKey` toasts
replace in place. Rendering is DOM-direct — there is no template or re-render cycle; see
`architecture-toast.md` for the mechanism.
