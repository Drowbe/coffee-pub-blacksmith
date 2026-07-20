# Socket Manager Architecture

**Audience:** Contributors to the Blacksmith codebase. For the consumer-facing API, see `../api/api-sockets.md`.

`SocketManager` (`scripts/manager-sockets.js`, ~650 lines) is Blacksmith's cross-client message layer. It selects a transport, registers Blacksmith's own handlers, and exposes a small facade that other modules reach through `module.api.sockets`.

## Two transports, not three

There are exactly two paths, chosen once at startup:

- **SocketLib** (preferred) — `_initializeSocket()` (`:147`), used when the `socketlib` module is present and its API is available.
- **Native Foundry fallback** — `_initializeNativeSockets()` (`:257`), used when SocketLib never appears. It listens on `game.socket` under the channel prefix `module.coffee-pub-blacksmith.` (`:261`).

`isUsingSocketLib()` (`:637`) reports which one is live. There is no local-only or in-memory third mode.

## Startup and readiness

`initialize()` (`:39`) runs from `Hooks.once('init')` at the bottom of the file (`:643`), guarded by `isInitialized` so a second call is a no-op.

SocketLib may load after Blacksmith, so initialization is opportunistic:

1. `_tryInitializeImmediately()` (`:133`) attempts SocketLib right away.
2. Failing that, a fallback timer (`:78`) polls `_getSocketLib()` every 500ms for up to 20 attempts (10 seconds). If SocketLib appears, it stops the timer and initializes through it.
3. If the attempts run out, it falls back to native sockets.

Both paths end by firing the `blacksmith.socketReady` hook. `waitForReady()` (`:623`) short-circuits on `isSocketReady` and otherwise resolves on that hook — consumers should await it before registering or emitting. `_stopFallbackTimer()` (`:357`) clears the interval; `_teardownNativeSocketListener()` (`:370`) removes the native listener.

Class state lives at `:27-37`: `socket`, `isInitialized`, `isSocketReady`, `_fallbackTimer`, `_usingSocketLib`, `_externalEventHandlers`, `_nativeInboundHandler`, `_latencySocketHandlersRegistered`.

## The SocketLib adapter multiplexes

Blacksmith does not register one SocketLib handler per event. It registers a **single** handler named `__blacksmithGenericEvent` (`:173`) and routes everything through it: the payload carries an `eventName`, and the adapter dispatches to the matching entry in the `_externalEventHandlers` map (`:183-187`).

The emitted envelope is `{ eventName, data, userId, options }` (`:206-209`) — `userId` is the *sender's* id, and `options` carries the targeting the receiver will evaluate.

## Targeting is receipt-side, not wire-level

This is the most important property of this layer, and the easiest to get wrong.

`_isLocalRecipient(options)` (`:126`) decides whether *this* client dispatches an incoming event:

- no options: dispatch.
- `options.userId`: dispatch only if it equals `game.user.id`.
- `options.recipients` array: dispatch only if it includes `game.user.id`.

Filtering happens **on receipt, not on send**. Under both transports the payload reaches every connected client, and each client decides whether to hand it to its handlers. Targeting therefore controls *dispatch*, not delivery, and it is not privacy — anyone inspecting socket traffic sees the payload regardless.

The source states the resulting contract twice, at `:204` and `:307`: **`emit()` must never carry secrets.** Treat that as a hard rule when adding events. If something must not reach a client, it cannot travel through this layer at all.

## Registered events

`registerSocketFunctions()` (`:382`) registers Blacksmith's own handlers — 24 at present. Read the function for the current list rather than trusting a copy here; they group roughly as:

- **Timers** — `syncTimerState`, `syncPlanningTimerState`, `updateTimer`, `timerCleanup`, `combatTimerAdjusted`, `planningTimerAdjusted`
- **Rolls / cinema** — `updateSkillRoll`, `skillRollFinalized`, `updateCinemaOverlay`, `showCinematicOverlay`, `closeCinematicOverlay`
- **Votes** — `receiveVoteStart`, `receiveVoteUpdate`, `receiveVoteClose`
- **Movement** — `movementChange`, `movementRequestAskGM`, `movementRequestDenied`
- **Sound** — `playSoundLooping`, `playSoundWithDuration`, `stopSoundByKey`, `stopSoundByPath`
- **UI** — `updateCSS`, `updateLeader`, `showToast`

### Latency handlers register first, deliberately

`ensureLatencySocketHandlers()` (`:575`) runs **before** `registerSocketFunctions()` (`:234` before `:236`). This ordering is intentional and load-bearing: a ping arriving from another client during `Game.setupGame` would otherwise throw `SocketlibUnregisteredHandlerError`. `_latencySocketHandlersRegistered` guards it so the handlers attach once. Do not reorder these two calls.

External modules register their own events through the `module.api.sockets` facade rather than here. Under the native fallback those external handlers share the same map as the internal ones above, so an external module registering one of those names displaces Blacksmith's handler — see `../api/api-sockets.md`.

## Public surface

- `getSocket()` (`:602`) — the underlying transport object, or `null`. Advanced use only; available methods differ between transports.
- `waitForReady()` (`:623`) — resolves once the socket layer is up.
- `isUsingSocketLib()` (`:637`) — which transport is live.

These reach other modules via `module.api.sockets`, assembled during Blacksmith's `init`.

## Known structural problem: this module imports the UI

`manager-sockets.js` is a transport layer, but it imports seven feature and UI subsystems directly (`:14-20`): `CombatTimer`, `PlanningTimer`, `MenuBar`, `VoteManager`, `CSSEditor`, `LatencyChecker`, and `ToastAPI`.

That inverts the dependency direction it should have. A message layer should not know what a vote or a menubar is; features should register their own handlers with it. The costs today:

- **Load coupling** — pulling in the socket layer pulls in the timers, menubar, vote manager, and toast API with it.
- **Circular-import risk** — those subsystems reach back toward core, which is part of why several imports elsewhere are dynamic.
- **Change blast radius** — a handler signature change in a feature edits this file, so unrelated socket work keeps touching it.

The shape of the fix is inversion: `SocketManager` keeps transport selection, readiness, targeting, and dispatch; each feature registers its own handlers at its own initialization — the pattern external modules already use through `module.api.sockets`. This section records the coupling so it is not mistaken for intended design.
