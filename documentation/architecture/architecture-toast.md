# Architecture — Toast System

How the on-screen toast primitive is built and why it is shaped the way it is. The public surface
is documented in `api/api-toast.md`; this doc covers the mechanism and the decisions.

Source: `scripts/api-toast.js` (`ToastManager` static class + `ToastAPI` bound-object surface).
Styles: `styles/toast.css`, `@import`ed from `styles/default.css` (the mandatory import — a CSS
file outside that chain is silently unstyled).

## Local-first: why `show()` has no recipients

The toast system was designed against two real implementations: Bibliosoph's message splash
(`coffee-pub-bibliosoph/scripts/manager-conversations.js`, `_showSplash`) and the sketch in the
player-facing toast TODO. The load-bearing observation: **the cross-client part of a "toast to a
player" always already happened.** Bibliosoph's splash renders on the receiving client after the
message arrived through Bibliosoph's own transport; Blacksmith's leader toast renders after the
`partyLeader` world-setting sync reached every client. The rendering primitive needs no sockets —
so it doesn't get any. Consumers call `show()` receipt-side, wherever their event lands.

A cross-client `send({recipients})` layer is planned as a thin wrapper over this primitive, gated
on the socket rewrite (see `TODO.md`). Keeping delivery out of Phase 1 is what let it ship without
that dependency. This is also why callbacks can be stored as plain function references: toasts are
per-client state that never serializes.

## DOM-direct rendering — deliberately not the menubar model

The menubar re-renders a Handlebars template into replaced DOM and guards the cost with a structure
fingerprint (`api-menubar.js`, §9B of `architecture-blacksmith.md`). Toasts do the opposite:
each toast element is **built once with `createElement` and removed once** — no template, no
re-render cycle, and therefore no fingerprint to keep honest (a class of bug the menubar
notifications work had to specifically fix). The tradeoff is that a toast is immutable after
`show()`; there is no `update()`. The `stackKey` replace-in-place covers the "latest state wins"
use case that an update API would otherwise serve. If an `update()` is ever added, it must rebuild
the element, not patch it.

Consumer strings (`title`, `subtitle`) land via `textContent`, never `innerHTML` — consumer data is
not parsed as HTML.

## The container and the stack

A single fixed container (`#blacksmith-toast-container`, top-center) is **lazily created on first
`show()`** and never removed; it has `pointer-events: none` so the empty space between toasts never
blocks canvas interaction (each toast re-enables its own pointer events). Active toasts live in a
`Map` keyed by toast id — insertion order is the visual stack order, newest at the bottom.

Three bounds keep the stack sane, all resolved inside `show()`:
1. **`stackKey` replacement** — an existing toast with the same key is removed instantly before the
   new one is added (instant, not faded: a fade-out would overlap the incoming replacement).
2. **The cap** (`MAX_STACK`) — oldest evicted instantly when full.
3. Neither path fires `onDismiss` — see the dismissal contract below.

## The dismissal contract (shared with menubar notifications)

`onDismiss` means one thing: *the user let this go by* — auto-timeout or the × button. Every other
removal is silent: post-`onClick` removal, programmatic `remove()`, `clearByModule()`, `stackKey`
replacement, cap eviction. This is the same contract shipped for menubar notifications
(`api-menubar.md` dismiss table) — one contract across both transient surfaces, so a consumer
handling "went away unread" bookkeeping (Bibliosoph unread counts, Squire notification-id tracking)
writes the same logic for either.

Internally that contract is a two-method split, mirroring `api-menubar.js`: `_dismiss()` (fires
`onDismiss`, then removes) is called only from the timeout and the × handler; `_remove()` is the
silent workhorse everything else uses. The × handler calls `stopPropagation()` so a close click
never reaches the body's `onClick` listener.

## Animation

Enter/exit is CSS-transition driven: the element is appended, then `.visible` is added on the next
`requestAnimationFrame` (so the transition actually runs); exit removes `.visible` and deletes the
element after `ANIMATION_MS`. **`ANIMATION_MS` in `api-toast.js` and the `transition` duration in
`styles/toast.css` must stay in sync** — the JS value is how long the element lingers for the CSS
fade to finish.

## First consumer (dogfood): leader change

`_registerLeaderChangeHook` in `api-menubar.js` listens to the core `updateSetting` /
`createSetting` **document** hooks for the `partyLeader` world setting — those fire on every
client, so the toast is receipt-side: the new leader's client gets "You are now the party leader",
everyone else gets the actor's name, `stackKey: "blacksmith-party-leader"` so rapid re-picks
replace rather than stack. (This site originally listened to `settingChange`, a hook that **does
not exist in Foundry** — see the ⚠️ block in `architecture-blacksmith.md` §9B.2 for the suite-wide
fallout; the leader *display* had always synced via the socketlib `updateLeader` broadcast, which
masked it.) The toast runs alongside the existing leader chat cards from `setNewLeader` — replacing
that chat noise with toasts is a planned later step, tracked in `TODO.md`, not something this
system does yet.

## Boundaries

The primitive renders; **policy stays in the consumer.** Which events toast, per-user enable
settings, mention rules, auto-open fallbacks, whose avatar to show — all consumer-side (Bibliosoph
keeps its splash settings; Squire keeps its dedup policy). Blacksmith owns only the rendering,
stacking, and the dismissal contract.
