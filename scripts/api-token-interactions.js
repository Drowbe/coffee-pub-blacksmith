// ==================================================================
// ===== API-TOKEN-INTERACTIONS.JS ==================================
// ==================================================================
// Token interaction claim registry. Lets a consuming module claim a
// canvas gesture on a token it does not own — the case Foundry cannot
// express, because the permission predicate is evaluated BEFORE any
// handler runs, so no hook can participate in the decision.
//
// The mechanism is deliberately NOT a class-level wrapper. Foundry
// rebuilds a per-placeable MouseInteractionManager inside draw()
// (client/canvas/placeables/placeable-object.mjs:434 -> :775) whose
// `permissions` and `callbacks` are plain objects read per gesture
// (client/canvas/interaction/mouse-handler.mjs:294, :311). Blacksmith
// already wraps Token.prototype.draw and fires postCoffeePubTokenDraw
// once that manager exists (manager-libwrapper.js), so a claim patches
// per-instance gesture keys rather than anything on a prototype.
//
// `matches` is resolved at GESTURE time, not at draw time, and the patch
// is applied to every drawn token while any claim exists. That costs a
// pass-through closure on two keys per token, and it is the only correct
// choice: a creature that dies mid-session becomes lootable without
// redrawing, so a draw-time decision would leave the corpse unclaimable
// until something happened to redraw it. The claimable gestures are
// double-click only — human-rate events, not the mousemove path — so
// resolving per gesture costs nothing that matters.
//
// Until the first registerInteraction call this module touches nothing:
// no hook is registered and no token is patched.
//
// See documentation/architecture/architecture-token-interactions.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// Gestures a claim may take. Deliberately narrow: these are the two "open something"
// gestures, and they are the only ones whose permission predicate can be relaxed
// without breaking a core canvas behaviour. `clickLeft` drives token control and
// selection, `dragStart`/`dragLeftStart` drive dragging, `hoverIn` drives hover
// state — claiming any of those bypasses machinery no consumer has justified
// needing. Adding a gesture here is a one-line change when a use case exists.
const ALLOWED_GESTURES = Object.freeze(['clickLeft2', 'clickRight2']);

// Marks a function as one of ours, so a second patch pass on the same instance captures
// Foundry's real entry rather than our own replacement — which would make the pass-through
// path recurse. draw() builds a fresh manager each time, so without this the correctness of
// re-capture would rest on Token.prototype methods happening to be identical references.
const OURS = Symbol('blacksmith.tokenInteraction');

// Registration id -> claim record. Insertion order is meaningful: it breaks priority ties.
const _claims = new Map();

// Context string -> Set of registration ids, for disposeByContext.
const _contexts = new Map();

// Token placeable -> { gesture: { permission, callback } } holding the ORIGINAL entries we
// displaced, so unregistering restores a token already on the canvas instead of leaving a
// dead claim until something redraws it. WeakMap so a torn-down scene's placeables are not
// retained by this registry.
const _patched = new WeakMap();

let _claimSequence = 0;
let _hookRegistered = false;

/**
 * Sort claims for a gesture strongest-first: highest priority wins, and on a tie the
 * earliest registration wins. Insertion order of `_claims` supplies the tiebreak, so
 * resolution is fully deterministic rather than dependent on Map iteration luck.
 * @param {string} gesture
 * @returns {object[]}
 */
function _claimsForGesture(gesture) {
    const matching = [];
    for (const claim of _claims.values()) {
        if (claim.gesture === gesture) matching.push(claim);
    }
    return matching.sort((a, b) => (b.priority - a.priority) || (a.sequence - b.sequence));
}

/**
 * Evaluate a claim's `matches` against a token. Throwing is treated as "does not match":
 * a broken predicate must never widen access, and must never take Foundry's own behaviour
 * down with it.
 * @param {object} claim
 * @param {Token} token
 * @param {User} user
 * @returns {boolean}
 */
function _safeMatches(claim, token, user) {
    try {
        return claim.matches(token.document, user) === true;
    } catch (error) {
        postConsoleAndNotification(
            MODULE.NAME,
            `Token Interactions: matches() threw for claim "${claim.id}" — treating as no match`,
            error,
            false,
            false
        );
        return false;
    }
}

/**
 * Find the strongest claim matching this token for a gesture, or null.
 * @param {string} gesture
 * @param {Token} token
 * @param {User} user
 * @returns {object|null}
 */
function _resolveClaim(gesture, token, user) {
    for (const claim of _claimsForGesture(gesture)) {
        if (_safeMatches(claim, token, user)) return claim;
    }
    return null;
}

/**
 * Replace one gesture's permission predicate and callback on a single token's interaction
 * manager, remembering what was displaced.
 *
 * Both replacements are invoked by Foundry with the token as `this`
 * (`fn.call(this.object, ...)` at mouse-handler.mjs:296 and :314), so they are written as
 * ordinary functions rather than arrows and read the token from `this`.
 *
 * @param {Token} token
 * @param {string} gesture
 */
function _patchToken(token, gesture) {
    const manager = token?.mouseInteractionManager;
    if (!manager?.permissions || !manager?.callbacks) return;

    const currentPermission = manager.permissions[gesture];
    const currentCallback = manager.callbacks[gesture];

    // Nothing to do if this exact manager already carries our replacement.
    if (currentPermission?.[OURS] && currentCallback?.[OURS]) return;

    const record = _patched.get(token) ?? {};
    // Capture only genuine Foundry entries. draw() rebuilds the manager, so this runs again
    // with fresh originals; a replacement of ours reaching the capture would make the
    // pass-through path call itself.
    record[gesture] = {
        permission: currentPermission?.[OURS] ? record[gesture]?.permission : currentPermission,
        callback: currentCallback?.[OURS] ? record[gesture]?.callback : currentCallback
    };
    _patched.set(token, record);
    const originals = record[gesture];

    manager.permissions[gesture] = function (user, event) {
        const claim = _resolveClaim(gesture, this, user);
        if (!claim) {
            return typeof originals.permission === 'function'
                ? originals.permission.call(this, user, event)
                : originals.permission ?? false;
        }
        if (claim.bypassPermission) return true;
        return typeof originals.permission === 'function'
            ? originals.permission.call(this, user, event)
            : originals.permission ?? false;
    };
    manager.permissions[gesture][OURS] = true;

    manager.callbacks[gesture] = function (event, ...args) {
        const claim = _resolveClaim(gesture, this, game.user);
        if (!claim) {
            // Foundry evaluated permission in a separate call, so a claim could have matched
            // there (granting the gesture via bypassPermission) and stopped matching before
            // dispatch. Falling straight through would then run Foundry's handler on a gesture
            // only the bypass allowed. Re-check the real predicate and stay closed if it denies.
            const permitted = typeof originals.permission === 'function'
                ? originals.permission.call(this, game.user, event) === true
                : originals.permission === true;
            if (!permitted) {
                postConsoleAndNotification(
                    MODULE.NAME,
                    `Token Interactions: ${gesture} claim stopped matching between permission and dispatch - suppressed`,
                    '',
                    true,
                    false
                );
                return true;
            }
            return typeof originals.callback === 'function'
                ? originals.callback.call(this, event, ...args)
                : true;
        }
        try {
            claim.handler(this, event);
        } catch (error) {
            // Fail closed. Permission for this gesture may already have been relaxed by the
            // predicate above, so falling through to Foundry's handler would open the Actor
            // sheet to a user who could not otherwise open it. A thrown claimant means the
            // gesture does nothing.
            postConsoleAndNotification(
                MODULE.NAME,
                `Token Interactions: handler threw for claim "${claim.id}" — gesture suppressed`,
                error,
                false,
                false
            );
        }
        return true;
    };
    manager.callbacks[gesture][OURS] = true;
}

/**
 * Restore every gesture we displaced on a token, if any.
 * @param {Token} token
 */
function _restoreToken(token) {
    const record = _patched.get(token);
    const manager = token?.mouseInteractionManager;
    if (!record) return;
    if (manager?.permissions && manager?.callbacks) {
        for (const [gesture, originals] of Object.entries(record)) {
            if (manager.permissions[gesture]?.[OURS]) manager.permissions[gesture] = originals.permission;
            if (manager.callbacks[gesture]?.[OURS]) manager.callbacks[gesture] = originals.callback;
        }
    }
    _patched.delete(token);
}

/**
 * Every token currently on the canvas. Used to apply a late registration and to restore on
 * teardown, so neither waits for a redraw.
 * @returns {Token[]}
 */
function _placedTokens() {
    return canvas?.tokens?.placeables ?? [];
}

/**
 * Patch a token for each gesture that has at least one claim. `matches` is NOT consulted
 * here — the replacement resolves the claim at gesture time, so a token whose lootable
 * state changes after it draws behaves correctly without a redraw. What is decided per draw
 * is only whether a gesture is claimable at all, which is why this stays cheap.
 * @param {Token} token
 */
function _applyClaims(token) {
    if (!_claims.size) return;
    const claimed = new Set();
    for (const claim of _claims.values()) claimed.add(claim.gesture);
    for (const gesture of claimed) _patchToken(token, gesture);
}

/**
 * Register the draw hook once, and only once something has been claimed. Before the first
 * registration this module adds no work to any canvas path at all.
 */
function _ensureHook() {
    if (_hookRegistered) return;
    _hookRegistered = true;
    HookManager.registerHook({
        name: 'postCoffeePubTokenDraw',
        description: 'Token Interactions: apply gesture claims to a freshly drawn token',
        priority: 3,
        context: 'token-interactions',
        callback: (token) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            try {
                _applyClaims(token);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Token Interactions: failed to apply claims on draw', error, false, false);
            }
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });
}

/**
 * Claim a canvas gesture on tokens a module does not own.
 *
 * A matching claim REPLACES Foundry's handler rather than running before it, so the Actor
 * sheet does not also open. With `bypassPermission`, the claim also relaxes the gesture's
 * permission predicate — scoped to the matching token and the claimed gesture only.
 *
 * @param {object} options
 * @param {string} options.id - Consumer-chosen identifier, used in log messages.
 * @param {string} options.module - Registering module id, for diagnostics.
 * @param {string} options.gesture - Foundry gesture key: 'clickLeft2' or 'clickRight2'.
 * @param {Function} options.matches - (tokenDocument, user) => boolean. Must be synchronous
 *   and cheap; it runs on every evaluation of the claimed gesture. Throwing counts as no match.
 * @param {Function} options.handler - (token, event) => void. Throwing suppresses the gesture;
 *   it never falls through to Foundry's handler.
 * @param {number} [options.priority=3] - Higher wins; ties break by registration order.
 * @param {boolean} [options.bypassPermission=false] - Relax the gesture's permission predicate
 *   for a matching token.
 * @param {string} [options.context] - Grouping key for disposeByContext.
 * @returns {string} Registration id for unregisterInteraction.
 */
function registerInteraction({ id, module, gesture, matches, handler, priority = 3, bypassPermission = false, context } = {}) {
    if (!id || typeof id !== 'string') {
        throw new Error('registerInteraction: id must be a non-empty string');
    }
    if (!ALLOWED_GESTURES.includes(gesture)) {
        throw new Error(
            `registerInteraction: gesture "${gesture}" is not claimable. ` +
            `Supported: ${ALLOWED_GESTURES.join(', ')}. ` +
            'Gestures that drive selection, dragging, or hover are deliberately excluded.'
        );
    }
    if (typeof matches !== 'function') {
        throw new Error(`registerInteraction: matches must be a function for claim "${id}"`);
    }
    if (typeof handler !== 'function') {
        throw new Error(`registerInteraction: handler must be a function for claim "${id}"`);
    }

    const registrationId = `${gesture}-${id}-${++_claimSequence}`;
    _claims.set(registrationId, {
        registrationId,
        id,
        module: module ?? 'unknown',
        gesture,
        matches,
        handler,
        priority: Number(priority) || 0,
        bypassPermission: bypassPermission === true,
        context,
        sequence: _claimSequence
    });

    if (context) {
        if (!_contexts.has(context)) _contexts.set(context, new Set());
        _contexts.get(context).add(registrationId);
    }

    _ensureHook();
    // Apply to tokens already drawn, so a claim registered after canvas ready takes effect
    // without waiting for a redraw.
    for (const token of _placedTokens()) _applyClaims(token);

    postConsoleAndNotification(
        MODULE.NAME,
        `Token Interactions: registered claim "${id}" on ${gesture}`,
        { module, priority, bypassPermission },
        true,
        false
    );
    return registrationId;
}

/**
 * Drop a claim and restore any token it is currently affecting.
 * @param {string} registrationId - Value returned by registerInteraction.
 * @returns {boolean} True if a claim was removed.
 */
function unregisterInteraction(registrationId) {
    const claim = _claims.get(registrationId);
    if (!claim) return false;
    _claims.delete(registrationId);
    if (claim.context) {
        const set = _contexts.get(claim.context);
        if (set) {
            set.delete(registrationId);
            if (!set.size) _contexts.delete(claim.context);
        }
    }

    // Restore every token, then re-apply whatever claims remain. Restoring unconditionally is
    // what makes teardown immediate rather than redraw-dependent; re-applying keeps other
    // modules' claims live.
    for (const token of _placedTokens()) {
        _restoreToken(token);
        _applyClaims(token);
    }

    postConsoleAndNotification(MODULE.NAME, `Token Interactions: unregistered claim "${claim.id}"`, '', true, false);
    return true;
}

/**
 * Drop every claim sharing a context, mirroring HookManager.disposeByContext.
 * @param {string} context
 * @returns {number} How many claims were removed.
 */
function disposeByContext(context) {
    const set = _contexts.get(context);
    if (!set) return 0;
    let removed = 0;
    for (const registrationId of Array.from(set)) {
        if (unregisterInteraction(registrationId)) removed++;
    }
    return removed;
}

/**
 * Currently registered claims, strongest-first per gesture. Diagnostics only — this is what
 * is loaded right now, never a record of what a world has configured.
 * @returns {object[]}
 */
function getRegisteredInteractions() {
    return Array.from(_claims.values()).map(({ registrationId, id, module, gesture, priority, bypassPermission, context }) => ({
        registrationId, id, module, gesture, priority, bypassPermission, context
    }));
}

const TokenInteractionsAPI = {
    registerInteraction,
    unregisterInteraction,
    disposeByContext,
    getRegisteredInteractions,
    ALLOWED_GESTURES
};

export { TokenInteractionsAPI, registerInteraction, unregisterInteraction, disposeByContext, getRegisteredInteractions };
