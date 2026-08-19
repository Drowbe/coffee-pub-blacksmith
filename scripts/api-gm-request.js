// ==================================================================
// ===== API-GM-REQUEST.JS ==========================================
// ==================================================================
// A player asks the GM to do something; one GM answers; the answer
// comes back. Built on Foundry v13's own query API rather than on
// sockets, and deliberately NOT part of api.sockets — see below.
//
// It routes and it elects. It does not authorize. What it DOES give a
// handler is a caller identity the requester could not have forged,
// which is the one thing no consumer can obtain for itself.
//
// Three things here are invisible in correct code:
//   1. The verified caller is captured from a socket listener that
//      must run BEFORE core's, not from the query payload.
//   2. Identity failure is closed, never degraded to the claim.
//   3. The requester-side timeout is ours; core does not enforce one.
//
// See documentation/api/api-gm-request.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * The single core query this module registers. Core reserves unprefixed names
 * (foundry.mjs:180301), so this is prefixed like every other consumer's.
 */
const QUERY_NAME = `${MODULE.ID}.gmRequest`;

/** Default wait before a request gives up. Core enforces no timeout of its own. */
const DEFAULT_TIMEOUT_MS = 15000;

/** How long a captured identity may sit unclaimed before it is swept. */
const IDENTITY_TTL_MS = 60000;

const CODES = Object.freeze({
    NO_ACTIVE_GM: 'NO_ACTIVE_GM',
    NO_QUERY_PERMISSION: 'NO_QUERY_PERMISSION',
    QUERY_UNAVAILABLE: 'QUERY_UNAVAILABLE',
    UNKNOWN_OP: 'UNKNOWN_OP',
    TIMEOUT: 'TIMEOUT',
    HANDLER_ERROR: 'HANDLER_ERROR',
    IDENTITY_UNVERIFIED: 'IDENTITY_UNVERIFIED'
});

/** op -> { handler, module } */
const _ops = new Map();

/** correlationId -> { userId, at }. Populated by the socket listener, read once by the handler. */
const _verifiedCallers = new Map();

let _installed = false;
let _identityCaptureActive = false;

function fail(code, extra = {}) {
    return { ok: false, code, ...extra };
}

// ==================================================================
// ===== VERIFIED IDENTITY ==========================================
// ==================================================================

/**
 * Capture the querying user's id straight off the socket, ahead of core.
 *
 * WHY THIS IS NECESSARY. Foundry knows who sent a query and knows it in a way no client can
 * forge: the sender never transmits its own id (`User#query` emits only the TARGET's id,
 * foundry.mjs:47824), so the id the receiving client sees is supplied by the server from the
 * authenticated socket. Core then resolves that user, throws if it does not exist, and
 * **drops it** — `#handleUserQuery` calls `queryHandler(queryData, queryOptions)` with
 * `queryOptions` holding only `timeout` (foundry.mjs:41082-41094).
 *
 * So a query handler cannot learn who called it. Every consumer that needs to know has instead
 * put the caller's id in its own payload, which is exactly the step that converts a verified
 * identity into a client-asserted one. That is the hole this closes, and no consumer can close
 * it alone.
 *
 * WHY THE ORDERING MATTERS. Core's listener invokes our query handler synchronously, so a
 * listener registered after core's would record the id too late to be read. component-emitter
 * has no `prependListener`, so the only way to run first is to lift core's listeners off,
 * install ours, and put them back in their original order.
 *
 * FAILS CLOSED. If this cannot be installed, `_identityCaptureActive` stays false and every
 * request is refused with IDENTITY_UNVERIFIED rather than falling back to the payload's claim.
 * A degraded identity is worse than none, because callers would not know which they had.
 *
 * @returns {boolean} True if the capture is in place.
 */
function _installIdentityCapture() {
    const socket = game?.socket;
    if (!socket || typeof socket.listeners !== 'function' || typeof socket.on !== 'function'
        || typeof socket.off !== 'function') {
        postConsoleAndNotification(MODULE.NAME,
            'GM request: socket emitter does not expose listeners()/off(); verified identity unavailable',
            '', false, false);
        return false;
    }

    // Copied, not referenced: `off` clears the emitter's own array.
    const existing = [...socket.listeners('userQuery')];
    if (!existing.length) {
        // Core has not registered yet. Installing now would put us first and then never see core
        // arrive, which is fine, but it more likely means we are running too early to trust.
        postConsoleAndNotification(MODULE.NAME,
            'GM request: no core userQuery listener present yet; verified identity unavailable', '', false, false);
        return false;
    }

    try {
        socket.off('userQuery');
        socket.on('userQuery', (userId, queryId, queryName, queryData) => {
            if (queryName !== QUERY_NAME) return;
            const correlationId = queryData?.correlationId;
            if (!correlationId || typeof userId !== 'string') return;
            _sweepIdentities();
            _verifiedCallers.set(correlationId, { userId, at: Date.now() });
        });
        for (const listener of existing) socket.on('userQuery', listener);
        return true;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'GM request: identity capture failed to install', error, false, false);
        return false;
    }
}

/** Drop identities nothing came to claim, so a dropped query cannot grow the map forever. */
function _sweepIdentities() {
    if (_verifiedCallers.size < 50) return;
    const cutoff = Date.now() - IDENTITY_TTL_MS;
    for (const [key, entry] of _verifiedCallers) {
        if (entry.at < cutoff) _verifiedCallers.delete(key);
    }
}

/**
 * Take the verified caller for one correlation id. Single-use: an id is consumed on read, so a
 * replayed correlation id finds nothing and is refused.
 * @param {string} correlationId
 * @returns {User|null}
 */
function _takeVerifiedCaller(correlationId) {
    const entry = _verifiedCallers.get(correlationId);
    if (!entry) return null;
    _verifiedCallers.delete(correlationId);
    return game.users.get(entry.userId) ?? null;
}

// ==================================================================
// ===== DISPATCH ===================================================
// ==================================================================

/**
 * Run one op on this client. The `user` is the verified caller, never a claim from the payload.
 * @param {string} op
 * @param {*} payload
 * @param {User} user
 * @returns {Promise<object>}
 */
async function _dispatch(op, payload, user) {
    const entry = _ops.get(op);
    if (!entry) return fail(CODES.UNKNOWN_OP, { op });
    try {
        const result = await entry.handler(payload, user);
        // A handler that returns nothing has succeeded and said nothing about it.
        return result ?? { ok: true };
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `GM request: handler for "${op}" threw`, error, false, false);
        return fail(CODES.HANDLER_ERROR, { op, message: error?.message });
    }
}

// ==================================================================
// ===== PUBLIC SURFACE =============================================
// ==================================================================

/**
 * Register an op the GM will answer. Call it on every client, not only the GM's: any client may
 * become the answering GM, and a client that registered nothing answers UNKNOWN_OP.
 *
 * Unlike `api.sockets.register`, this REFUSES to replace an existing op rather than overwriting it
 * silently. Two modules claiming one op is a collision worth hearing about, and there is an
 * `unregisterOp` for the case where replacement is meant.
 *
 * @param {object} options
 * @param {string} options.op - Must be module-prefixed, e.g. 'coffee-pub-merchant.buy'.
 * @param {Function} options.handler - `(payload, user) => result`. `user` is the VERIFIED caller.
 *   Re-resolve and re-validate everything in `payload`; it comes from a client.
 * @param {string} [options.module] - Registering module id, for diagnostics.
 * @returns {boolean} False if the op was malformed or already taken.
 */
function registerOp({ op, handler, module } = {}) {
    if (!op || typeof op !== 'string' || !op.includes('.')) {
        postConsoleAndNotification(MODULE.NAME,
            'GM request: op must be a module-prefixed string, e.g. "my-module.doThing"', op, false, false);
        return false;
    }
    if (typeof handler !== 'function') {
        postConsoleAndNotification(MODULE.NAME, `GM request: handler for "${op}" is not a function`, '', false, false);
        return false;
    }
    if (_ops.has(op)) {
        postConsoleAndNotification(MODULE.NAME,
            `GM request: "${op}" is already registered by ${_ops.get(op).module ?? 'an unknown module'}; refusing to replace it`,
            '', false, false);
        return false;
    }
    _ops.set(op, { handler, module: module ?? null });
    postConsoleAndNotification(MODULE.NAME, `GM request: registered op "${op}"`, '', true, false);
    return true;
}

/**
 * Remove an op. Returns false if it was not registered.
 * @param {string} op
 * @returns {boolean}
 */
function unregisterOp(op) {
    return _ops.delete(op);
}

/** Registered ops. Diagnostics. */
function getRegisteredOps() {
    return [..._ops.entries()].map(([op, entry]) => ({ op, module: entry.module }));
}

/**
 * Ask the GM to run an op, and wait for the answer.
 *
 * A GM calling this runs the handler locally with no round trip, which is what makes an op work in
 * a world with no other clients connected and what keeps a GM's own actions out of the socket.
 *
 * @param {string} op
 * @param {*} [payload] - Must be JSON-serializable. Treated as untrusted by the handler.
 * @param {object} [options]
 * @param {number} [options.timeout=15000] - Milliseconds before giving up.
 * @returns {Promise<object>} The handler's result, or `{ ok: false, code }`.
 */
async function request(op, payload = null, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    if (!_ops.has(op) && game.user?.isGM) return fail(CODES.UNKNOWN_OP, { op });

    // The GM answers itself. No socket, no election, and it works alone in a world.
    if (game.user?.isGM) return _dispatch(op, payload, game.user);

    if (!_installed) return fail(CODES.QUERY_UNAVAILABLE, { reason: 'GM request API did not initialize' });

    const gm = game.users?.activeGM ?? null;
    if (!gm) return fail(CODES.NO_ACTIVE_GM);

    // Core throws for this, and a thrown permission error is harder to branch on than a code.
    if (!game.user?.hasPermission?.('QUERY_USER')) return fail(CODES.NO_QUERY_PERMISSION);

    const correlationId = foundry.utils.randomID();
    let timer = null;

    try {
        // The timeout is OURS. `User#query` passes `timeout` to the receiving client as
        // information and resolves only when the ack arrives (foundry.mjs:47823-47831), so a GM
        // that drops mid-request leaves the promise pending forever without this race.
        const answered = await Promise.race([
            gm.query(QUERY_NAME, { op, payload, correlationId }, { timeout }),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(fail(CODES.TIMEOUT, { op, waitedMs: timeout })), timeout);
            })
        ]);
        return answered ?? fail(CODES.HANDLER_ERROR, { op, reason: 'handler returned nothing' });
    } catch (error) {
        // query() rejects for an unregistered name, a disconnected target, or a rejected handler.
        postConsoleAndNotification(MODULE.NAME, `GM request: "${op}" failed`, error, false, false);
        return fail(CODES.HANDLER_ERROR, { op, message: error?.message });
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * True when a handler can be given a caller identity the requester could not have forged. False
 * means every request is refused rather than answered with a claimed one.
 */
function hasVerifiedIdentity() {
    return _identityCaptureActive;
}

/**
 * Install the query handler and the identity capture. Called once from `ready`, after core has
 * registered its own socket listeners.
 */
function initialize() {
    if (_installed) return;

    if (!globalThis.CONFIG?.queries) {
        postConsoleAndNotification(MODULE.NAME,
            'GM request: CONFIG.queries is absent; this needs Foundry v13 or newer', '', false, false);
        return;
    }

    _identityCaptureActive = _installIdentityCapture();

    CONFIG.queries[QUERY_NAME] = async (data) => {
        const { op, payload, correlationId } = data ?? {};

        // Closed, not degraded. Falling back to a claimed id here would hand every handler in the
        // suite an identity that any client could choose, which is the defect this exists to fix.
        if (!_identityCaptureActive) return fail(CODES.IDENTITY_UNVERIFIED, { reason: 'capture not installed' });

        const user = _takeVerifiedCaller(correlationId);
        if (!user) return fail(CODES.IDENTITY_UNVERIFIED, { op: op ?? null });

        return _dispatch(op, payload, user);
    };

    _installed = true;
    postConsoleAndNotification(MODULE.NAME,
        `GM request: ready (verified identity ${_identityCaptureActive ? 'active' : 'UNAVAILABLE'})`, '', true, false);
}

const GMRequestAPI = {
    initialize,
    registerOp,
    unregisterOp,
    getRegisteredOps,
    request,
    hasVerifiedIdentity,
    CODES,
    QUERY_NAME
};

export { GMRequestAPI, initialize, registerOp, unregisterOp, getRegisteredOps, request, hasVerifiedIdentity, CODES };
