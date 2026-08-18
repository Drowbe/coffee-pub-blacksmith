// ==================================================================
// ===== MANAGER-ENCUMBRANCE-GUARD.JS ===============================
// ==================================================================
// Mitigates a race in dnd5e's encumbrance recompute. This is a guard
// against a SYSTEM bug, not a Blacksmith feature, and it is written to
// remove itself: version-gated, feature-detected, and switchable off.
//
// THE BUG. `Actor5e#updateEncumbrance` (dnd5e.mjs:39545 in 5.3.3) reads
// `this.effects.get(ActiveEffect5e.ID.ENCUMBERED)` and, when absent,
// creates an effect with that same fixed `_id` and `keepId: true`
// (:36235-36238). Check-then-create, no lock, nothing between the read
// and the write. It runs on every item create/update/delete on an Actor
// (:36073, :36082, :36094) and on the Actor's own update (:36009), and
// Foundry does not await it from the write that triggered it -- so any
// two writes close together on one Actor produce two recomputes that
// both try to create `dnd5eencumbered0`. The server rejects the second:
//
//   The _id [dnd5eencumbered0] already exists within the parent
//   collection: Actor [...] effects
//
// WHY THIS LIVES IN THE HUB. A per-module fix only removes that
// module's contribution. Two different modules writing to one Actor in
// the same moment collide with neither doing anything wrong, so
// "no module trips it alone" is strictly weaker than "it cannot
// happen". Blacksmith is loaded wherever this matters, already owns the
// libWrapper layer, and writes to Actors itself through api.inventory.
//
// See documentation/architecture/architecture-inventory.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

/**
 * dnd5e version at which this guard stops installing.
 *
 * `null` means no released version is known to fix it. Set this to the fixing version when one
 * ships and the guard disappears on its own rather than becoming a patch nobody remembers.
 *
 * Deliberately NOT feature-detected. Detecting the absence of a race means matching against a
 * method body, which is more fragile than the thing it protects.
 */
const FIXED_IN_DND5E = null;

// Actor UUID -> { active, pending, options }. Keyed on UUID, not id: a synthetic token actor
// carries the BASE actor's id (see client/documents/actor-delta.mjs:28), so keying on id would
// put every unlinked corpse derived from one prototype, and the world actor itself, on a single
// queue. Safe but needlessly coarse, and the same mistake api.inventory's mutex avoids.
const _state = new Map();

let _installed = false;
let _announced = false;

/** True when the message is the duplicate-effect-id rejection this guard exists for. */
function _isDuplicateIdRejection(error) {
    const message = String(error?.message ?? error ?? '');
    return message.includes('already exists') && message.includes('dnd5eencumbered');
}

/**
 * Run one recompute for an Actor, swallowing ONLY the duplicate-id rejection.
 *
 * Nothing broader is caught. A real failure inside a code path nobody watches is exactly the kind
 * of thing that should still surface, and widening this catch while debugging would hide it.
 */
function _run(key, entry, invoke) {
    const promise = Promise.resolve()
        .then(() => invoke(entry.options))
        .catch((error) => {
            if (_isDuplicateIdRejection(error)) {
                postConsoleAndNotification(MODULE.NAME, 'Encumbrance Guard: suppressed a duplicate-id rejection that slipped past serialisation', key, true, false);
                return undefined;
            }
            throw error;
        })
        .finally(() => {
            if (entry.active === promise) entry.active = null;
            if (!entry.active && !entry.pending) _state.delete(key);
        });
    entry.active = promise;
    return promise;
}

/**
 * Serialise and COALESCE recomputes for one Actor.
 *
 * Serialising alone would close the race but still run N recomputes for N writes. Only the last
 * one's result matters: `updateEncumbrance` reads `this.system.attributes.encumbrance` and
 * `this.effects` fresh at call time, so running it once after the final write produces the same
 * state as running it after each. So at most one runs and one waits; further calls collapse into
 * the waiting one.
 *
 * What makes collapsing provably safe rather than a guess: `updateEncumbrance(options)` accepts an
 * options argument and **never reads it** in 5.2.5. Two calls differing only in options are
 * therefore interchangeable. The latest options are still carried through in case that changes --
 * and if a future dnd5e does read them, this guard must be re-examined, not just re-gated.
 *
 * @param {string} key - Actor UUID.
 * @param {object} options - Options from the most recent call.
 * @param {Function} invoke - Calls the original method.
 * @returns {Promise}
 */
function _schedule(key, options, invoke) {
    let entry = _state.get(key);
    if (!entry) {
        entry = { active: null, pending: null, options };
        _state.set(key, entry);
    }
    entry.options = options;

    if (!entry.active) return _run(key, entry, invoke);
    if (entry.pending) return entry.pending;

    entry.pending = entry.active
        .catch(() => {})                 // a failed predecessor must not cancel the follow-up
        .then(() => {
            entry.pending = null;
            return _run(key, entry, invoke);
        });
    return entry.pending;
}

export class EncumbranceGuard {
    /**
     * Install the guard, unless it is switched off, the system has fixed the bug, or the shape we
     * depend on is not where we expect it.
     *
     * Called from WrapperManager after libWrapper is confirmed available, so it registers through
     * libWrapper rather than assigning to the prototype: some worlds will have other modules
     * wrapping the same method, and libWrapper is what makes that visible instead of last-writer-wins.
     *
     * @returns {boolean} True if the wrapper was registered.
     */
    static install() {
        if (_installed) return true;

        if (!getSettingSafely(MODULE.ID, 'enableEncumbranceGuard', true)) {
            postConsoleAndNotification(MODULE.NAME, 'Encumbrance Guard: disabled by setting', '', true, false);
            return false;
        }

        const systemVersion = game.system?.version ?? '';
        if (FIXED_IN_DND5E && !foundry.utils.isNewerVersion(FIXED_IN_DND5E, systemVersion)) {
            postConsoleAndNotification(MODULE.NAME, `Encumbrance Guard: not needed on dnd5e ${systemVersion}`, '', true, false);
            return false;
        }

        // Feature-detect before patching. If either of these has moved, the bug we are guarding is
        // not the bug in front of us, and wrapping blindly would be worse than not wrapping.
        const actorClass = CONFIG?.Actor?.documentClass;
        if (typeof actorClass?.prototype?.updateEncumbrance !== 'function') {
            postConsoleAndNotification(MODULE.NAME, 'Encumbrance Guard: Actor#updateEncumbrance not found -- not installing', systemVersion, false, false);
            return false;
        }
        const encumberedId = CONFIG?.ActiveEffect?.documentClass?.ID?.ENCUMBERED;
        if (!encumberedId) {
            postConsoleAndNotification(MODULE.NAME, 'Encumbrance Guard: ActiveEffect ID.ENCUMBERED not found -- not installing', systemVersion, false, false);
            return false;
        }

        try {
            libWrapper.register(
                MODULE.ID,
                'CONFIG.Actor.documentClass.prototype.updateEncumbrance',
                function (wrapped, ...args) {
                    const key = this.uuid;
                    if (!key) return wrapped(...args);
                    if (!_announced) {
                        _announced = true;
                        postConsoleAndNotification(MODULE.NAME, `Encumbrance Guard active: serialising dnd5e encumbrance recomputes per actor (dnd5e ${systemVersion})`, '', false, false);
                    }
                    return _schedule(key, args[0], (options) => wrapped(options));
                },
                'WRAPPER'
            );
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Encumbrance Guard: libWrapper registration failed', error, false, false);
            return false;
        }

        _installed = true;
        postConsoleAndNotification(MODULE.NAME, `Encumbrance Guard: installed for dnd5e ${systemVersion}`, '', true, false);
        return true;
    }

    /** Whether the wrapper is registered. Diagnostics and tests. */
    static get installed() {
        return _installed;
    }

    /** Actors with a recompute in flight or queued. Diagnostics and tests. */
    static get pendingActors() {
        return Array.from(_state.keys());
    }
}
