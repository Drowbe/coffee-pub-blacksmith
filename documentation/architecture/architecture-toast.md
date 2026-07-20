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

There is no public cross-client send on this API — the rendering primitive takes no sockets at all.
Keeping delivery out of it is what let it ship without a socket dependency, and it is also why
callbacks can be stored as plain function references: toasts are per-client state that never
serializes.

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
2. **The cap** (`MAX_STACK`) — applies to **transient** toasts only: the oldest transient is evicted
   instantly when full. Persistent (`duration: 0`) toasts sit outside the cap and are never evicted —
   "until closed" means it (author decision 2026-07-19; a GM announcement must survive timer noise).
   The unbounded-persistent case is accepted: persistent toasts come from deliberate acts, and each
   still has its × button.
3. Neither path fires `onDismiss` — see the dismissal contract below.

## Styles and sizes — class-only

`style` (semantic set) and `size` values are whitelisted (`STYLES`/`SIZES` in `api-toast.js`) and
mapped to `blacksmith-toast-style-*` / `blacksmith-toast-size-*` classes — a consumer can never
inject an arbitrary class or CSS through the config. Accent colors in `styles/toast.css` are
hardcoded hex for now, to be mapped onto design-system tokens when that migration lands
(author decision 2026-07-19: semantic set now, token mapping later).

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

## The internal broadcast relay (pre-Phase-3)

`broadcastToast(config)` in `api-toast.js` shows a toast on **every** connected client: locally via
`show()`, remotely via the `showToast` socketlib handler in `manager-sockets.js`. It exists for
announcements that originate on one client (the GM's timer helpers) where the chat card used to be
the transport to players. It is **deliberately not on `ToastAPI`**: there is no public cross-client
toast surface, and this relay is Blacksmith-private plumbing — data-only by construction (callbacks
are stripped before the socket). `SocketManager` is imported dynamically inside `broadcastToast` to
avoid a static import cycle (`manager-sockets` statically imports `api-toast` for the handler).

`timer-notifications.js` is the first consumer: `routeTimerNotification(settingKey, label,
stackKey, data)` is the shared channel router for the three timer announcement helpers — it maps
the timer payload flags to toast content, broadcasts the toast half, and returns whether the caller
should still post its chat card. The per-kind toggles in each timer's own settings section gate the
calls *before* they reach the router: the timer section decides *what* fires, the Notifications
section decides *where* it goes.

`sendToastToUsers(config, userIds)` is the relay's **targeted** sibling, same internal-only
standing. Targeting is receipt-side per the socket privacy rule (both transports broadcast):
`_recipients` rides the payload and the `showToast` handler renders only on listed clients — so
the payload must never carry secrets; a GM announcement is non-secret by contract. The sender's
own client renders locally only if it is in the list. First consumer: the GM **Send Toast** tool
(`window-toast-send.js`, opened from the party menubar, GM-only) — it sends `size: 'large'`
toasts to selected players and shows the sending GM a small confirmation toast rather than an
echo of the announcement. That tool is a Blacksmith feature consuming private plumbing; the
public `send({recipients})` surface remains gated on the socket rewrite.

## Delivery channels: the `notifyX` setting pattern

Each feature migrated from chat cards to toasts gets a world-scoped channel setting in the
**Notifications** settings section (`settings.js`, `NOTIFICATION_CHANNEL_CHOICES`): `toast` /
`chat` / `both` / `none`, defaulting to `toast`. The gate lives at **both ends** — the toast half
is checked receipt-side inside the feature's `updateSetting` hook (every client reads the same
world value), the chat half GM-side at the `ChatMessage.create` site. Live examples:
`notifyLeaderChange` (`api-menubar.js`) and `notifyMovementChange` (`token-movement.js`).

## First consumers (dogfood): leader change, movement change

`_registerLeaderChangeHook` in `api-menubar.js` listens to the core `updateSetting` /
`createSetting` **document** hooks for the `partyLeader` world setting — those fire on every
client, so the toast is receipt-side: the new leader's client gets "You are now the party leader",
everyone else gets the actor's name, `stackKey: "blacksmith-party-leader"` so rapid re-picks
replace rather than stack. (This site originally listened to `settingChange`, a hook that **does
not exist in Foundry** — see `architecture-blacksmith.md` §9B.2 for the suite-wide
fallout; the leader *display* had always synced via the socketlib `updateLeader` broadcast, which
masked it.) Movement follows the identical shape in `token-movement.js`: `movementType` is a world
setting, its hook toasts receipt-side from the shared `MOVEMENT_TYPES` catalog,
`stackKey: "blacksmith-movement"`. Both features' chat cards still exist but are gated by their
`notifyX` channel setting (default `toast` — so chat is off unless the GM opts back in).

## Boundaries

The primitive renders; **policy stays in the consumer.** Which events toast, per-user enable
settings, mention rules, auto-open fallbacks, whose avatar to show — all consumer-side (Bibliosoph
keeps its splash settings; Squire keeps its dedup policy). Blacksmith owns only the rendering,
stacking, and the dismissal contract.
