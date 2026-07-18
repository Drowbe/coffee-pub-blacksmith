# HookManager — Internals

**Audience:** Blacksmith contributors.
**Consumer API:** see **[api-hookmanager.md](../api/api-hookmanager.md)** — how to *use* HookManager lives there and is not repeated here.

Implementation: **`scripts/manager-hooks.js`** (~550 lines). This document describes how it works and why; it deliberately does not copy the code. Line numbers are anchors — if one drifts, trust the file.

---

## 1. Scope

HookManager is a thin orchestration layer over Foundry's `Hooks`. It owns registration, priority ordering, dedupe, throttle/debounce, and batch cleanup. It holds no business logic.

**When NOT to use it:** the Foundry lifecycle hooks `init`, `setup`, and `ready` fire once during boot, before or while Blacksmith is still assembling itself. Register those directly with `Hooks.once(...)`. HookManager is for recurring, cleanup-bearing hooks.

`registerHook` takes a single destructured object (`:33`) — `{ name, description, priority, callback, options, key, context }`. Key order is irrelevant.

---

## 2. Registry structure

Two static Maps (`:9-10`):

| Map | Shape | Purpose |
|---|---|---|
| `hooks` | `hookName → { hookId, callbacks: [], registeredAt }` | One entry per hook name, holding an array of callback records |
| `contexts` | `context → Set(callbackId)` | Reverse index for batch cleanup |

One `Hooks.on` per hook name, not per callback (`:62-96`). The first registration for a name creates a single `hookRunner` wrapper and stores its `hookId`; later registrations for that name just append to `callbacks[]`. This is why several modules can register the same hook without evicting each other.

A callback record (`:124-137`) carries: `callbackId`, `callback` (the wrapped function), `description`, `priority`, `registeredAt`, `options`, `key`, `context`, `teardown`.

The `context` field on the record is load-bearing: it is also tracked in the `contexts` map, but the stats readers (`BlacksmithAPIHookStats`, hook details) read it off the record, so a callback record that omits `context` makes the context breakdown collapse to a single `default` bucket.

---

## 3. Dispatch — `hookRunner`

The wrapper at `:63-92`:

1. **Snapshot** — `entry.callbacks.slice()`. Iterate a copy, because `once` removal mutates the array mid-dispatch.
2. **Per-callback `try/catch`** — one throwing callback logs and does not abort the others.
3. **`once` is deferred** — matching ids are collected during the loop and removed after it (`:88-91`), never during.
4. **`pre*` cancellation** — for any hook whose name starts with `pre`, a callback returning `false` makes the runner return `false` immediately, cancelling the action and skipping remaining callbacks. This is Foundry's convention (`:79-82`).

---

## 4. Priority and sort-on-insert

Priorities are 1–5, default 3, ascending (1 runs first). Ties break by `registeredAt`, so order is stable within a level.

The sort happens on insert (`:142`), not on dispatch. `hookRunner` depends on this — it only `slice()`s. Any new code path that mutates `callbacks[]` must preserve the ordering invariant.

Nothing validates the incoming value. A hook registered at `priority: 50` is accepted, sorts last, and is then invisible to `showHookDetails()`, which only walks 1..5 (`:408`).

---

## 5. Throttle, debounce, and teardown

Both are inlined in `registerHook` (`:105-122`), wrapping `callback` into `finalCallback`.

- **`throttleMs`** — leading edge, timestamp comparison. No timer, so no teardown needed.
- **`debounceMs`** — trailing edge `setTimeout`. Sets `teardown = () => clearTimeout(timeout)`.

`teardown` is invoked by `removeCallback` (`:224-228`) to cancel work still pending at removal.

Two behaviours fall out of this and surprise people:

- **`throttleMs` beats `debounceMs`.** The branch is `if (options.throttleMs) … else if (options.debounceMs)` — pass both and `debounceMs` is silently discarded.
- **`once` + `debounceMs` means the callback never fires.** Debounce only schedules. `once` then removes the callback as soon as the hook fires, and removal runs `teardown`, clearing the pending timer before it elapses. Registration returns a valid id and nothing warns.

`_throttle()` (`:466`) and `_debounce()` (`:480`) are defined but never called — `registerHook` inlines both, so they are dead code, not the live path.

---

## 6. Dedupe `key`

If `key` is supplied and the hook name already exists, a matching key returns the existing `callbackId` and registers nothing (`:56-59`).

Keys are scoped per hook name, not globally — the same key under two hook names is two registrations. Use it to make registration idempotent across re-entrant setup paths.

---

## 7. Context lifecycle

`context` is an arbitrary string grouping callbacks for bulk removal.

- `disposeByContext(context)` (`:321`) iterates the id set, delegates to `removeCallback`, then drops the context entry.
- `_removeFromContexts(callbackId)` (`:491`) breaks on first match — a callback is assumed to live in at most one context.
- `HookContext` (`:543-548`) provides the canonical string builders: `scene()`, `token()`, `journalPage()`, `app()`. Prefer these over hand-rolled strings so auto-dispose can match them.

Auto-dispose is wired in `initialize()` (`:508-515`) for exactly two lifecycles:

| Foundry hook | Disposes |
|---|---|
| `canvasTearDown` | `scene:<previous scene id>` |
| `deleteToken` | `token:<token id>` |

There is no module-unload auto-dispose, and there cannot be one. `closeGame` and `unloadModule` are both dead names — neither appears anywhere in Foundry v13, and nothing (Foundry, Blacksmith, or any installed module) ever fires them. Foundry has no runtime module-unload event: enabling or disabling a module reloads the world, which tears everything down regardless. Do not add a listener for either and assume cleanup runs.

---

## 8. The callback-id invariant

Ids are generated as `` `${name}_${Date.now()}_${rand}` `` (`_makeCallbackId`, `:17`).

`removeCallback` finds the owning hook by searching the registry (`:198-218`). It must never parse the id. This is not stylistic: it previously did `callbackId.split('_')[0]` to recover the hook name, which silently returned the wrong name for any hook containing an underscore, and module-defined hooks commonly do (`myModule_dataReady`). The lookup missed, `removeCallback` returned `false`, and the callback leaked forever. Because `disposeByContext` delegates here, context cleanup silently failed too — the exact guarantee `context` exists to provide.

The id format is not a contract. Do not document it as one, and do not depend on it.

---

## 9. Removal paths

| Method | Behaviour |
|---|---|
| `removeHook(name)` (`:169`) | Drops every callback for the name, unhooks Foundry, deletes the entry. `false` if unknown, `true` on success. |
| `removeCallback(id)` (`:198`) | Removes one callback: runs `teardown`, unlinks context, splices. When the last callback goes, the Foundry hook is removed and the entry deleted (`:237-239`). `false` if not found. |
| `unregisterHook(...)` (`:271`) | Dual signature — `('name', callbackId)` or `({ name, callbackId })`. With a `callbackId` it delegates to `removeCallback`; without, to `removeHook`. |
| `disposeByContext(ctx)` (`:321`) | Bulk removal via `removeCallback`. |
| `cleanup()` (`:334`) | Unhooks everything. |

---

## 10. Foundry v13 hook-name remap

Registering `renderChatMessage` is silently rewritten to `renderChatMessageHTML` (`:40-49`), with a one-time `console.warn` guarded by `_didWarnRenderChatMessageRemap` (`:12`).

This matters beyond the name: v13 passes a native `HTMLElement`, not jQuery. Blacksmith bolts a `.find()` compatibility shim onto the element from a priority-1 hook in `blacksmith.js`, but that shim returns a plain Array carrying only `.click` — so `.find()` works and `.addClass()` throws. New code should register `renderChatMessageHTML` and use DOM methods.

---

## 11. Debug surface

`initialize()` (`:526-536`) installs `window.blacksmithHooks()`, `blacksmithHookDetails()`, `blacksmithHookStats()`, plus short aliases `showHooks()`, `showHookDetails()`, `hookStats()`.

Introspection: `getStats()` (`:358`), `getHookStats()` (`:373`), `hasHook()` (`:382`), `getHooksByPriority()` (`:440`).

Two of these are stubs, so read their output with that in mind:

- `getHooksByCategory(category)` (`:454`) ignores its argument and returns every hook — there is no category system.
- `showHookDetails()` prints a hardcoded `Categories: [general]` (`:419`) for the same reason, and walks priorities 1..5 only, so out-of-range hooks do not appear in it.
