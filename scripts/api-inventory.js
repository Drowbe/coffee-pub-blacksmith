// ==================================================================
// ===== API-INVENTORY.JS ===========================================
// ==================================================================
// Authoritative inventory mutation primitives. Four public methods:
// grantItem / grantItems / grantCurrency put content ONTO an Actor,
// transferItem / transferCurrency move it BETWEEN two Actors.
//
// These own no workflow. No sockets, no permission checks, no windows,
// no chat, no notifications — a consumer calls them from its own
// GM-authoritative handler after its own authorization has passed.
//
// Three things here are invisible in correct code and destructive when
// "simplified". Read documentation/architecture/architecture-inventory.md
// before touching them:
//   1. Rollback is quantity-aware. Deleting the target row after a MERGE
//      destroys quantity the recipient already owned.
//   2. The public methods hold the locks; the cores do not. A public
//      method calling another public method self-deadlocks.
//   3. Arrival flags are folded into the item write. A follow-up write
//      to the same Actor collides with dnd5e's encumbrance recompute.
//
// dnd5e-specific by construction: system.quantity, system.currency, the
// system.container model, and the physical-type whitelist.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

// Item types that may be moved. A raw create of anything else bypasses dnd5e's singleton
// check and the advancement manager (dnd5e.mjs:57530-57574), so a loot window handing a
// player a `class` item is unrecoverable.
const PHYSICAL_TYPES = Object.freeze(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']);

// Cleared on arrival, mirroring dnd5e's own _onDropResetData (dnd5e.mjs:57594). Without this
// a handed-over weapon arrives equipped and a magic item arrives attuned without consuming a
// slot. Also excluded from the merge comparison, since we deliberately change them.
const RESET_PATHS = Object.freeze(['equipped', 'attuned', 'prepared', 'crew.value']);

// `system.container` is NOT in RESET_PATHS, because it is WRITTEN on arrival rather than
// deleted. dnd5e's reset set does not mention containment either, and that is not an omission
// to copy: every core creation path sets the field explicitly instead. Item5e.createWithContents
// does `mergeObject(newItemData, {"system.container": containerId})` on every create
// (dnd5e.mjs:24171), and moving an item out of a container nulls it (dnd5e.mjs:57414).
// Containment is an argument of the arrival, never inherited from the source.
//
// Inheriting it was a real defect, not a theoretical one. dnd5e keeps containment on the CHILD,
// so an item taken out of a bag carried the SOURCE actor's bag id onto the recipient, where no
// such row exists — and because container participates in merge identity, it also matched
// nothing and landed as a separate dangling row. The visible symptom was arrows looted from a
// corpse's pack refusing to stack with the arrows the looter already carried.
//
// Deleting the key would not do: dnd5e writes null, and an absent key is not the same value.
const MAX_CONTAINER_DEPTH = 5; // dnd5e.mjs:14087 (PhysicalItemTemplate.MAX_DEPTH)

// dnd5e currency denominations. Order is presentation-irrelevant; this is the key set.
const DENOMINATIONS = Object.freeze(['pp', 'gp', 'ep', 'sp', 'cp']);

const CODES = Object.freeze({
    SOURCE_ACTOR_NOT_FOUND: 'SOURCE_ACTOR_NOT_FOUND',
    TARGET_ACTOR_NOT_FOUND: 'TARGET_ACTOR_NOT_FOUND',
    SOURCE_ITEM_NOT_FOUND: 'SOURCE_ITEM_NOT_FOUND',
    ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
    SAME_ACTOR: 'SAME_ACTOR',
    INVALID_QUANTITY: 'INVALID_QUANTITY',
    INSUFFICIENT_QUANTITY: 'INSUFFICIENT_QUANTITY',
    INVALID_CURRENCY: 'INVALID_CURRENCY',
    INSUFFICIENT_CURRENCY: 'INSUFFICIENT_CURRENCY',
    ITEM_NOT_TRANSFERABLE: 'ITEM_NOT_TRANSFERABLE',
    CONTAINER_HAS_CONTENTS: 'CONTAINER_HAS_CONTENTS',
    CONTAINER_NOT_FOUND: 'CONTAINER_NOT_FOUND',
    CONTAINER_MAX_DEPTH: 'CONTAINER_MAX_DEPTH',
    TARGET_CREATE_FAILED: 'TARGET_CREATE_FAILED',
    SOURCE_UPDATE_FAILED: 'SOURCE_UPDATE_FAILED',
    ROLLBACK_FAILED: 'ROLLBACK_FAILED',
    LOCK_TIMEOUT: 'LOCK_TIMEOUT',
    DUPLICATE_ITEM: 'DUPLICATE_ITEM',
    EXCHANGE_EMPTY: 'EXCHANGE_EMPTY'
});

// How long a public method waits for an Actor lock before giving up. A bounded wait exists so
// an unbounded queue behind one stuck operation cannot produce a hang with no error; it is not
// there to survive a crashed peer, because the mutex lives in this client's memory and a client
// that drops takes its locks with it.
const LOCK_TIMEOUT_MS = 10000;

// Actor UUID -> promise chain tail. In-process only.
const _locks = new Map();

// Flag paths every merge comparison ignores, declared by the module that WRITES them.
//
// `ignoreFlags` alone is not sufficient, and testing proved it: Squire's createItem hook stamps
// `coffee-pub-squire.isNew` on every item created on an owned Actor, by any module, in a second
// write that lands asynchronously. A consumer such as Curator has no way to know that, so its
// merges would silently become timing-dependent - identical items merging or not depending on
// whether another module's write had landed yet.
//
// Requiring the WRITER to declare its own transient flags fixes that without the hub hard-coding
// a sibling's key, which Ground Rule 2 forbids and which the hub could not keep current anyway.
const _transientFlags = new Set();

function fail(code, extra = {}) {
    return { ok: false, code, ...extra };
}

// ==================================================================
// ===== LOCKING ====================================================
// ==================================================================

/**
 * Acquire one Actor lock, resolving to a release function.
 *
 * On timeout the waiter removes itself from the queue but does NOT resolve its own tail until
 * the real holder finishes. Resolving early would let the next waiter's race succeed while the
 * holder still holds the lock - two holders, which is the exact thing the lock exists to stop.
 *
 * @param {string} uuid
 * @returns {Promise<Function|null>} Release function, or null on timeout.
 */
async function _acquireOne(uuid) {
    let entry = _locks.get(uuid);
    if (!entry) {
        entry = { tail: Promise.resolve(), waiters: 0 };
        _locks.set(uuid, entry);
    }
    entry.waiters++;

    const previous = entry.tail;
    let release;
    entry.tail = new Promise(resolve => { release = resolve; });

    const settle = () => {
        release();
        entry.waiters--;
        if (entry.waiters === 0 && _locks.get(uuid) === entry) _locks.delete(uuid);
    };

    let timer;
    const acquired = await Promise.race([
        previous.then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), LOCK_TIMEOUT_MS); })
    ]);
    clearTimeout(timer);

    if (!acquired) {
        previous.then(settle, settle);
        return null;
    }
    return settle;
}

/**
 * Acquire locks for every Actor a mutation writes, in sorted UUID order.
 *
 * Sorting is what makes a simultaneous A-to-B and B-to-A transfer safe: the pair can never be
 * held crosswise, so the two callers cannot each wait on the lock the other holds. Two players
 * swapping items is exactly the case a party panel invites, and a deadlock here hangs both
 * clients with no error.
 *
 * @param {string[]} uuids
 * @returns {Promise<{release: Function, contended: string|null}>}
 */
async function _acquire(uuids) {
    const ordered = Array.from(new Set(uuids.filter(Boolean))).sort();
    const releases = [];
    for (const uuid of ordered) {
        const release = await _acquireOne(uuid);
        if (!release) {
            for (const undo of releases.reverse()) undo();
            return { release: () => {}, contended: uuid };
        }
        releases.push(release);
    }
    return {
        release: () => { for (const undo of releases.reverse()) undo(); },
        contended: null
    };
}

// ==================================================================
// ===== RESOLUTION AND VALIDATION ==================================
// ==================================================================

/**
 * Resolve an Actor from a UUID. Accepts synthetic token actors
 * (`Scene.x.Token.y.Actor.z`), which `game.actors.get` cannot — that is the case a corpse on
 * the canvas always is.
 * @param {string} uuid
 * @returns {Promise<Actor|null>}
 */
async function _resolveActor(uuid) {
    if (!uuid || typeof uuid !== 'string') return null;
    try {
        const document = await fromUuid(uuid);
        if (!document) return null;
        // A token UUID resolves to the TokenDocument; its actor is what we mutate.
        if (document.documentName === 'Token') return document.actor ?? null;
        return document.documentName === 'Actor' ? document : null;
    } catch {
        return null;
    }
}

/**
 * True when the item is a physical type this API will move.
 * @param {Item} item
 * @returns {boolean}
 */
function _isTransferable(item) {
    return PHYSICAL_TYPES.includes(item?.type);
}

/**
 * How many items a container holds. Zero means it is safe to move.
 *
 * An empty container transfers normally; a packed one is refused, because moving it would create
 * the container on the target under a new id and leave its contents behind pointing at an id
 * that no longer exists (dnd5e keeps containment on the CHILD as `system.container`,
 * dnd5e.mjs:14055).
 *
 * Uses dnd5e's own `system.contents` getter rather than scanning an actor's items, because a
 * container resolved from a compendium or the Items directory has no actor to scan - and that is
 * exactly the case a naive check reports as empty while it is not.
 *
 * Returns -1 when emptiness cannot be determined. Callers refuse on -1: an unverifiable
 * container is treated as packed, because a refused bag is a visible annoyance and an orphaned
 * one is silent corruption.
 *
 * @param {Item} item
 * @returns {Promise<number>}
 */
async function _containedCount(item) {
    if (item?.type !== 'container') return 0;
    try {
        const contents = await item.system?.contents;
        if (contents === undefined || contents === null) {
            // No getter available: fall back to an actor scan, which is correct for embedded items.
            if (!item.actor) return -1;
            return item.actor.items.filter(candidate => candidate.system?.container === item.id).length;
        }
        return contents.size ?? contents.length ?? 0;
    } catch {
        return -1;
    }
}

/**
 * Validate a requested arrival container against the Actor that will hold it.
 *
 * Must run INSIDE the target Actor's lock and against the live document: an id validated before
 * the lock can be deleted before the write, which recreates the dangling pointer this exists to
 * prevent.
 *
 * Refusing an unresolvable id rather than silently dropping to root is deliberate. A caller that
 * names a container has a reason, and quietly ignoring it puts bought stock loose on an NPC or
 * loot in the wrong bag, with nothing in the result saying so.
 *
 * @param {Actor} targetActor
 * @param {string|null|undefined} containerId - Null or undefined means the root inventory.
 * @returns {Promise<object|null>} A failure result, or null when the container is usable.
 */
async function _validateContainer(targetActor, containerId) {
    if (containerId === undefined || containerId === null) return null;
    if (typeof containerId !== 'string') return fail(CODES.CONTAINER_NOT_FOUND, { containerId });

    const container = targetActor.items.get(containerId);
    if (!container) return fail(CODES.CONTAINER_NOT_FOUND, { containerId });
    if (container.type !== 'container') {
        return fail(CODES.CONTAINER_NOT_FOUND, { containerId, type: container.type });
    }

    // dnd5e refuses a drop that would nest past MAX_DEPTH (dnd5e.mjs:24156-24160), and it counts
    // the arrival as `1 + ancestors`. Feature-detected rather than assumed: if the getter has
    // moved, skip the check instead of refusing every container grant.
    try {
        const ancestors = await container.system?.allContainers?.();
        if (Array.isArray(ancestors)) {
            const depth = 1 + ancestors.length;
            if (depth > MAX_CONTAINER_DEPTH) {
                return fail(CODES.CONTAINER_MAX_DEPTH, { containerId, depth, max: MAX_CONTAINER_DEPTH });
            }
        }
    } catch { /* depth unverifiable: existence and type already rule out the dangling case */ }

    return null;
}

/**
 * Validate every distinct container named by a batch, once each.
 * @param {Actor} targetActor
 * @param {Array<string|null|undefined>} containerIds - Index-aligned with the batch entries.
 * @returns {Promise<Map<string, object>>} Container id -> failure result, for ids that failed.
 */
async function _validateContainers(targetActor, containerIds) {
    const failures = new Map();
    for (const containerId of new Set(containerIds)) {
        if (containerId === undefined || containerId === null) continue;
        const error = await _validateContainer(targetActor, containerId);
        if (error) failures.set(containerId, error);
    }
    return failures;
}

/**
 * Validate a requested quantity against what the item actually has.
 * Stackability is derived from the document and never accepted from a caller: that flag decides
 * delete-the-whole-item versus decrement, so a wrong value destroys a stack.
 *
 * `drawsDown` says whether the source stack is a CEILING, and it is the whole difference between
 * a transfer and a grant. A transfer takes from a live stack, so asking for more than it holds is
 * an error the caller must see. A grant has no source Actor and writes nothing back - the "source"
 * is a compendium entry, a loot-table result, or another Actor's row read for its shape. Its
 * `system.quantity` is a property of the document, not a count of stock: an SRD crowbar reads 1
 * because that is what one crowbar is, and treating it as a limit lets the SRD's authoring
 * decisions cap what any consumer may create.
 *
 * This is the same rule an `exchange` copy leg already states, applied to the paths that share the
 * reasoning. `INVALID_QUANTITY` still applies either way: it describes the document's nature rather
 * than its stock, and it is the check that actually protects a caller.
 *
 * @param {Item} item
 * @param {number|undefined} requested
 * @param {object} [options]
 * @param {boolean} [options.drawsDown=true] - False when nothing is taken from the source.
 * @returns {{stackable: boolean, quantity: number, available: number, error: object|null}}
 */
function _resolveQuantity(item, requested, { drawsDown = true } = {}) {
    const source = item?._source?.system ?? item?.system ?? {};
    const stackable = typeof source.quantity === 'number';
    const available = stackable ? source.quantity : 1;

    if (requested === undefined || requested === null) {
        return { stackable, quantity: available, available, error: null };
    }
    const quantity = Number(requested);
    if (!Number.isInteger(quantity) || quantity < 1) {
        return { stackable, quantity: 0, available, error: fail(CODES.INVALID_QUANTITY, { requested }) };
    }
    if (!stackable && quantity > 1) {
        return { stackable, quantity: 0, available, error: fail(CODES.INVALID_QUANTITY, { requested, available: 1 }) };
    }
    if (drawsDown && quantity > available) {
        return { stackable, quantity: 0, available, error: fail(CODES.INSUFFICIENT_QUANTITY, { requested: quantity, available }) };
    }
    return { stackable, quantity, available, error: null };
}

// ==================================================================
// ===== MERGE PREDICATE ============================================
// ==================================================================

/**
 * Delete a dot path AND any parent objects it leaves empty.
 *
 * `foundry.utils.deleteProperty` removes the leaf and leaves the parent behind
 * (`common/utils/helpers.mjs:772`), which breaks identity comparison in a way that is easy to
 * miss: an item that never carried `scope.key` compares as `{}`, while one that carried it and
 * had it stripped compares as `{scope: {}}`. Those are not equal, so excluding a key would stop
 * the very merges the exclusion exists to allow - a freshly created item against one that
 * recently arrived carrying a transient flag.
 *
 * @param {object} object - Mutated in place.
 * @param {string} path
 */
function _deletePathAndEmptyParents(object, path) {
    if (!foundry.utils.deleteProperty(object, path)) return;
    const parts = path.split('.');
    for (let depth = parts.length - 1; depth > 0; depth--) {
        const parentPath = parts.slice(0, depth).join('.');
        const parent = foundry.utils.getProperty(object, parentPath);
        if (!parent || typeof parent !== 'object' || Object.keys(parent).length) return;
        foundry.utils.deleteProperty(object, parentPath);
    }
}

/**
 * Source-data system object with the fields that must not participate in identity removed:
 * `quantity` is the thing being added, and the reset set is deliberately cleared on arrival.
 *
 * Reads `_source`, never the prepared model. `item.system` after data preparation holds derived
 * values (`uses.value` is computed at dnd5e.mjs:11539), and those differ between two otherwise
 * identical items for reasons that have nothing to do with identity - comparing them would
 * merge almost nothing.
 *
 * @param {object} systemSource
 * @returns {object}
 */
function _identitySystem(systemSource) {
    const copy = foundry.utils.deepClone(systemSource ?? {});
    delete copy.quantity;
    for (const path of RESET_PATHS) _deletePathAndEmptyParents(copy, path);
    // Containment STAYS in identity — two otherwise identical stacks in different bags are in
    // different places and must not merge. Normalised because absent and null mean the same
    // thing here and would otherwise compare unequal: our payloads always write the field, while
    // a row created by another module or an older dnd5e may simply not carry it.
    copy.container = copy.container ?? null;
    return copy;
}

/**
 * Flags with the caller's declared transient keys removed.
 *
 * Anything not declared is treated as identity-bearing, so a module writing UI state to item
 * flags must declare those keys or its merges quietly stop happening. Blacksmith does not
 * hard-code sibling flag keys: the hub cannot know which of a consumer's flags matter.
 *
 * @param {object} flags
 * @param {string[]} ignoreFlags - dot paths, e.g. 'coffee-pub-squire.isNew'
 * @returns {object}
 */
function _identityFlags(flags, ignoreFlags) {
    const copy = foundry.utils.deepClone(flags ?? {});
    for (const path of new Set([...(ignoreFlags ?? []), ..._transientFlags])) {
        _deletePathAndEmptyParents(copy, path);
    }
    return copy;
}

/**
 * Whether an incoming item payload may merge into an existing item on the target.
 *
 * Gated on item STATE, not item type. dnd5e stacks consumables only
 * (dnd5e.mjs:57609-57617), which is a proxy for "types unlikely to carry per-item state" and
 * is why two identical daggers do not stack on a sheet. Checking the state directly is
 * strictly better and lets them.
 *
 * Any unresolvable difference returns false. Strictness costs a player an extra inventory row;
 * looseness costs data.
 *
 * @param {Item} existing - Candidate on the target actor.
 * @param {object} incoming - Prepared creation payload (already reset, flags already folded in).
 * @param {string[]} ignoreFlags
 * @returns {boolean}
 */
function _canMerge(existing, incoming, ignoreFlags) {
    if (!existing || !incoming) return false;
    if (existing.name !== incoming.name) return false;
    if (existing.type !== incoming.type) return false;
    if (!PHYSICAL_TYPES.includes(existing.type)) return false;

    const existingSource = existing._source?.system ?? {};
    const incomingSystem = incoming.system ?? {};
    if (typeof existingSource.quantity !== 'number' || typeof incomingSystem.quantity !== 'number') return false;

    // Provenance blocks only when both sides know their origin and the origins disagree. A
    // missing source is an artifact of how a document was imported, not a fact about the item:
    // a GM dragging a pack into the world produces a sourced copy of an unsourced pack item,
    // byte-identical in every other respect, and refusing to merge those would make stacking a
    // coin flip in any configured world.
    const existingSourceId = existing._source?._stats?.compendiumSource ?? existing._source?.flags?.dnd5e?.sourceId ?? null;
    const incomingSourceId = incoming._stats?.compendiumSource ?? incoming.flags?.dnd5e?.sourceId ?? null;
    if (existingSourceId && incomingSourceId && existingSourceId !== incomingSourceId) return false;

    // Enchantments are ActiveEffects on the item, so they sit outside `system` and need their own
    // check. This is the case that justifies dnd5e's caution: a +1 dagger and a plain dagger can
    // share both name and compendiumSource, and merging would destroy an enchantment or grant
    // one free.
    try {
        if (existing.appliedEnchantments?.length) return false;
    } catch {
        return false;
    }
    if ((incoming.effects ?? []).length) return false;

    if (!foundry.utils.objectsEqual(_identitySystem(existingSource), _identitySystem(incomingSystem))) return false;
    if (!foundry.utils.objectsEqual(_identityFlags(existing._source?.flags, ignoreFlags), _identityFlags(incoming.flags, ignoreFlags))) return false;

    return true;
}

// ==================================================================
// ===== CORES (NO LOCKS — CALLER MUST HOLD THEM) ===================
// ==================================================================

/**
 * Build the creation payload for an item arriving on an Actor.
 *
 * `flags` is folded in here rather than left to the caller. A caller setting a flag as a
 * follow-up write reintroduces a live dnd5e bug: encumbrance is recomputed on every item
 * create/update/delete (dnd5e.mjs:39357) as a check-then-create against one fixed effect id
 * with no lock (dnd5e.mjs:39554-39566), and Foundry does not await that hook from the promise
 * `createEmbeddedDocuments` returns — so two sequential, individually awaited writes to one
 * Actor both try to create `dnd5eencumbered0` and the server rejects the second. Awaiting
 * correctly cannot avoid it and neither can our mutex, because the recompute completes outside
 * the critical section. One write is the only fix.
 *
 * @param {Item} item - Resolved source document.
 * @param {number} quantity
 * @param {boolean} stackable
 * @param {object} flags
 * @param {string|null} [container=null] - Arrival container id on the TARGET Actor, or null for root.
 * @param {string[]} [omitFlags=[]] - Flag paths dropped from the arrival, before `flags` is merged.
 * @returns {object}
 */
function _buildPayload(item, quantity, stackable, flags, container = null, omitFlags = []) {
    const data = item.toObject();
    delete data._id;
    data.system = data.system ?? {};
    if (stackable) data.system.quantity = quantity;
    for (const path of RESET_PATHS) foundry.utils.deleteProperty(data.system, path);
    // Always written, never inherited — see the note beside RESET_PATHS. The source's value
    // names a row on the SOURCE Actor and is meaningless on the target.
    data.system.container = container ?? null;
    // Dropped BEFORE the caller's arrival flags are merged, so declaring a path in both is
    // coherent: the omission clears what rode along from the source, the addition writes what was
    // meant to arrive. Empty parents go too, or an item that never carried the scope and one that
    // had it stripped would compare unequal and stop merging.
    if (omitFlags?.length && data.flags) {
        for (const path of omitFlags) _deletePathAndEmptyParents(data.flags, path);
    }
    if (flags && Object.keys(flags).length) {
        data.flags = foundry.utils.mergeObject(data.flags ?? {}, flags, { inplace: false });
    }
    return data;
}

/**
 * Put one prepared payload onto an Actor, merging into an existing row when eligible.
 * Assumes the caller holds the target Actor's lock.
 * @param {Actor} targetActor
 * @param {object} payload
 * @param {number} quantity
 * @param {string} stack - 'merge' | 'separate'
 * @param {string[]} ignoreFlags
 * @returns {Promise<object>}
 */
async function _grantItemCore(targetActor, payload, quantity, stack, ignoreFlags, arrivalFlags = {}) {
    if (stack === 'merge') {
        const candidate = targetActor.items.find(existing => _canMerge(existing, payload, ignoreFlags));
        if (candidate) {
            const current = candidate._source?.system?.quantity ?? 0;
            const update = { 'system.quantity': current + quantity };
            // ONLY the arrival flags, never the payload's whole flag set — that set belongs to
            // the incoming document and writing it would mutate the row that already existed.
            // They ride the SAME update as the quantity change, for the reason in _buildPayload:
            // the merge branch has the identical one-write requirement.
            if (arrivalFlags && Object.keys(arrivalFlags).length) update.flags = arrivalFlags;
            await candidate.update(update);
            return { ok: true, targetItemId: candidate.id, quantity, merged: true };
        }
    }
    const created = await targetActor.createEmbeddedDocuments('Item', [payload]);
    const targetItemId = created?.[0]?.id;
    if (!targetItemId) return fail(CODES.TARGET_CREATE_FAILED);
    return { ok: true, targetItemId, quantity, merged: false };
}

/**
 * Reduce or delete the source item. Assumes the caller holds the source Actor's lock.
 * @param {Item} sourceItem
 * @param {number} quantity
 * @param {boolean} stackable
 * @param {number} available
 * @returns {Promise<{sourceRemaining: number, sourceDeleted: boolean}>}
 */
async function _reduceSourceCore(sourceItem, quantity, stackable, available) {
    if (stackable && quantity < available) {
        await sourceItem.update({ 'system.quantity': available - quantity });
        return { sourceRemaining: available - quantity, sourceDeleted: false };
    }
    await sourceItem.delete();
    return { sourceRemaining: 0, sourceDeleted: true };
}

/**
 * Undo a grant after the source reduction failed.
 *
 * Branches on what the grant actually did, and this is the invariant that matters most in this
 * file. If the grant MERGED, deleting the row destroys quantity the recipient already owned —
 * three arrows into a stack of twenty, then a delete, loses twenty items that were never part
 * of the transfer, and it fails looking like successful cleanup.
 *
 * @param {Actor} targetActor
 * @param {object} grant - Result from _grantItemCore.
 * @returns {Promise<boolean>} True if the rollback succeeded.
 */
async function _rollbackGrant(targetActor, grant) {
    try {
        const item = targetActor.items.get(grant.targetItemId);
        if (!item) return false;
        if (!grant.merged) {
            await item.delete();
            return true;
        }
        const current = item._source?.system?.quantity ?? 0;
        await item.update({ 'system.quantity': Math.max(0, current - grant.quantity) });
        return true;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: rollback failed', error, false, false);
        return false;
    }
}

/**
 * Normalise a currency object, rejecting anything that is not a non-negative integer amount of a
 * real denomination.
 *
 * `allowZero` separates the two readings of the same shape. For a DELTA, zero says nothing and a
 * call carrying only zeroes has asked for no work, so it is refused rather than silently doing
 * nothing. For an ABSOLUTE value, zero is a real instruction - an empty till - and dropping it
 * would silently ignore the one write a GM most obviously means.
 *
 * @param {object} currency
 * @param {object} [options]
 * @param {boolean} [options.allowZero=false] - Keep zeroes, and permit an all-zero object.
 * @returns {{deltas: object, error: object|null}}
 */
function _normalizeCurrency(currency, { allowZero = false } = {}) {
    if (!currency || typeof currency !== 'object') {
        return { deltas: {}, error: fail(CODES.INVALID_CURRENCY, { currency }) };
    }
    const deltas = {};
    for (const [denomination, rawAmount] of Object.entries(currency)) {
        if (!DENOMINATIONS.includes(denomination)) {
            return { deltas: {}, error: fail(CODES.INVALID_CURRENCY, { denomination }) };
        }
        const amount = Number(rawAmount);
        if (!Number.isInteger(amount) || amount < 0) {
            return { deltas: {}, error: fail(CODES.INVALID_CURRENCY, { denomination, amount: rawAmount }) };
        }
        if (amount > 0 || allowZero) deltas[denomination] = amount;
    }
    if (!Object.keys(deltas).length) {
        return {
            deltas: {},
            error: fail(CODES.INVALID_CURRENCY, { reason: allowZero ? 'no denominations given' : 'no positive amounts' })
        };
    }
    return { deltas, error: null };
}

// ==================================================================
// ===== PUBLIC SURFACE (ACQUIRES LOCKS) ============================
// ==================================================================

/**
 * Put an item onto an Actor from a compendium, world item, or constructed data. No source Actor
 * is involved, so nothing is taken from anywhere.
 * @param {object} options
 * @param {string} options.targetActorUuid
 * @param {string} [options.itemUuid] - Anything fromUuid resolves.
 * @param {object} [options.itemData] - For an item assembled in memory. Ignored if itemUuid resolves.
 * @param {number} [options.quantity] - Defaults to the source item's own quantity.
 * @param {string} [options.stack='merge']
 * @param {string[]} [options.ignoreFlags=[]]
 * @param {object} [options.flags={}] - Written in the same operation as the item.
 * @param {string} [options.container=null] - Container id on the target Actor. Null lands at root.
 * @returns {Promise<object>}
 */
async function grantItem({ targetActorUuid, itemUuid, itemData, quantity, stack = 'merge', ignoreFlags = [], flags = {}, container = null, omitFlags = [] } = {}) {
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });

    const prepared = await _prepareGrant({ itemUuid, itemData, quantity, flags, container, omitFlags });
    if (!prepared.ok) return prepared;

    const { release, contended } = await _acquire([targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        const containerError = await _validateContainer(targetActor, container);
        if (containerError) return containerError;
        return await _grantItemCore(targetActor, prepared.payload, prepared.quantity, stack, ignoreFlags, flags);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: grantItem failed', error, false, false);
        return fail(CODES.TARGET_CREATE_FAILED, { message: error?.message });
    } finally {
        release();
    }
}

/**
 * Put several items onto one Actor under a single lock.
 *
 * Not a convenience wrapper over grantItem: N separate calls are N writes to one Actor and N
 * encumbrance recomputes, which is the shape of the collision documented in _buildPayload.
 * Everything that can be created rather than merged goes in one createEmbeddedDocuments.
 *
 * @param {object} options
 * @param {string} options.targetActorUuid
 * @param {object[]} options.items - [{ itemUuid | itemData, quantity, flags }]
 * @param {string} [options.stack='merge']
 * @param {string[]} [options.ignoreFlags=[]]
 * @returns {Promise<object>} { ok, results: [] }
 */
/**
 * Put many prepared payloads onto one Actor in as few writes as possible.
 *
 * Shared by grantItems and transferItems so the coalescing rules exist once. Assumes the caller
 * holds the target Actor's lock.
 *
 * Two writes at most, whatever the item count: one batched update for rows that already existed,
 * one batched create for everything else. That matters beyond tidiness - dnd5e recomputes
 * encumbrance per write and the recompute outlives the write, so N writes to one Actor are N
 * racing recomputes against a single fixed effect id.
 *
 * @param {Actor} targetActor
 * @param {object[]} prepared - Index-aligned; failure entries pass straight through.
 * @param {string} stack
 * @param {string[]} ignoreFlags
 * @returns {Promise<{results: object[], undo: {created: string[], merges: object[]}}>}
 *   `undo` describes what to reverse if a later step fails. Callers that cannot fail ignore it.
 */
async function _grantBatchCore(targetActor, prepared, stack, ignoreFlags) {
    const results = new Array(prepared.length);
    const toCreate = [];             // payloads for the single create call
    const createIndexes = [];        // result index owning each payload
    const coalescedInto = new Map(); // result index -> payload slot it was folded into
    const mergeUpdates = [];         // batched updates for rows that already existed
    const undo = { created: [], merges: [] };

    for (let index = 0; index < prepared.length; index++) {
        const entry = prepared[index];
        if (!entry?.ok) { results[index] = entry ?? fail(CODES.ITEM_NOT_FOUND); continue; }

        if (stack === 'merge') {
            const candidate = targetActor.items.find(existing => _canMerge(existing, entry.payload, ignoreFlags));
            if (candidate) {
                // Accumulate rather than write: several entries can target the same existing row.
                const pending = mergeUpdates.find(update => update._id === candidate.id);
                if (pending) {
                    pending['system.quantity'] += entry.quantity;
                } else {
                    const current = candidate._source?.system?.quantity ?? 0;
                    const update = { _id: candidate.id, 'system.quantity': current + entry.quantity };
                    if (entry.arrivalFlags && Object.keys(entry.arrivalFlags).length) update.flags = entry.arrivalFlags;
                    mergeUpdates.push(update);
                }
                undo.merges.push({ itemId: candidate.id, quantity: entry.quantity });
                results[index] = { ok: true, targetItemId: candidate.id, quantity: entry.quantity, merged: true };
                continue;
            }

            // Nothing on the Actor matches, but an earlier entry in THIS batch may already have
            // queued an identical payload. Without this, several takes of one item in a single call
            // produce several rows: the candidate search only sees documents that exist, and a
            // queued payload does not exist yet.
            const slot = toCreate.findIndex(queued => _canMerge(
                { name: queued.name, type: queued.type, _source: queued, appliedEnchantments: [] },
                entry.payload,
                ignoreFlags
            ));
            if (slot >= 0) {
                toCreate[slot].system.quantity = (toCreate[slot].system.quantity ?? 0) + entry.quantity;
                coalescedInto.set(index, slot);
                continue;
            }
        }
        createIndexes.push(index);
        toCreate.push(entry.payload);
    }

    if (mergeUpdates.length) await targetActor.updateEmbeddedDocuments('Item', mergeUpdates);

    if (toCreate.length) {
        const created = await targetActor.createEmbeddedDocuments('Item', toCreate);
        for (let slot = 0; slot < createIndexes.length; slot++) {
            const index = createIndexes[slot];
            const targetItemId = created?.[slot]?.id;
            if (targetItemId) undo.created.push(targetItemId);
            results[index] = targetItemId
                ? { ok: true, targetItemId, quantity: prepared[index].quantity, merged: false }
                : fail(CODES.TARGET_CREATE_FAILED);
        }
        // An entry folded into a sibling reports the row it landed in. `merged` stays false -
        // nothing that already existed was grown - and `coalesced` says what did happen.
        // toCreate, createIndexes and created are pushed in lockstep, so toCreate[slot] is
        // created[slot]; mapping through createIndexes would return another item's row.
        for (const [index, slot] of coalescedInto) {
            const targetItemId = created?.[slot]?.id;
            results[index] = targetItemId
                ? { ok: true, targetItemId, quantity: prepared[index].quantity, merged: false, coalesced: true }
                : fail(CODES.TARGET_CREATE_FAILED);
        }
    }

    return { results, undo };
}

/**
 * Reverse a batch grant after a later step failed.
 *
 * Created rows are deleted; merged rows are DECREMENTED by exactly what was added. Deleting a
 * merged row would destroy quantity the recipient already owned - the same invariant as the
 * single-item rollback, and the same reason it is spelled out rather than inferred.
 *
 * @param {Actor} targetActor
 * @param {{created: string[], merges: object[]}} undo
 * @returns {Promise<boolean>} True if everything reversed cleanly.
 */
async function _rollbackBatch(targetActor, undo) {
    let clean = true;
    try {
        if (undo.merges.length) {
            const byItem = new Map();
            for (const entry of undo.merges) {
                byItem.set(entry.itemId, (byItem.get(entry.itemId) ?? 0) + entry.quantity);
            }
            const updates = [];
            for (const [itemId, quantity] of byItem) {
                const item = targetActor.items.get(itemId);
                if (!item) { clean = false; continue; }
                const current = item._source?.system?.quantity ?? 0;
                updates.push({ _id: itemId, 'system.quantity': Math.max(0, current - quantity) });
            }
            if (updates.length) await targetActor.updateEmbeddedDocuments('Item', updates);
        }
        const present = undo.created.filter(id => targetActor.items.get(id));
        if (present.length !== undo.created.length) clean = false;
        if (present.length) await targetActor.deleteEmbeddedDocuments('Item', present);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: batch rollback failed', error, false, false);
        return false;
    }
    return clean;
}

/**
 * Put several items onto one Actor under a single lock.
 *
 * Not a convenience wrapper over grantItem: N separate calls are N writes to one Actor and N
 * encumbrance recomputes. See _grantBatchCore.
 *
 * @param {object} options
 * @param {string} options.targetActorUuid
 * @param {object[]} options.items - [{ itemUuid | itemData, quantity, flags, container }]
 * @param {string} [options.stack='merge']
 * @param {string[]} [options.ignoreFlags=[]]
 * @param {string} [options.container=null] - Default arrival container for every entry.
 * @returns {Promise<object>} { ok, results: [] }
 */
async function grantItems({ targetActorUuid, items = [], stack = 'merge', ignoreFlags = [], container = null, omitFlags = [] } = {}) {
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });
    if (!Array.isArray(items) || !items.length) return fail(CODES.ITEM_NOT_FOUND, { reason: 'items must be a non-empty array' });

    const prepared = [];
    const containers = [];
    for (const entry of items) {
        // `undefined` means "not stated, use the batch default"; an explicit null means root, so
        // an entry can opt out of a batch-wide container. ?? would conflate the two.
        const entryContainer = entry?.container === undefined ? container : entry.container;
        containers.push(entryContainer);
        prepared.push(await _prepareGrant({
            itemUuid: entry?.itemUuid,
            itemData: entry?.itemData,
            quantity: entry?.quantity,
            flags: entry?.flags ?? {},
            container: entryContainer,
            omitFlags
        }));
    }

    const { release, contended } = await _acquire([targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        // Per entry, like every other validation here: one bad container id must not stop the
        // rest of the batch. Failed entries become failure results the batch core passes through.
        const containerFailures = await _validateContainers(targetActor, containers);
        if (containerFailures.size) {
            for (let index = 0; index < prepared.length; index++) {
                // An entry that already failed keeps its own code: it was refused before the
                // container was ever relevant, and overwriting would mislabel why.
                if (!prepared[index]?.ok) continue;
                const error = containerFailures.get(containers[index]);
                if (error) prepared[index] = { ...error };
            }
        }

        const { results } = await _grantBatchCore(targetActor, prepared, stack, ignoreFlags);
        return { ok: results.every(result => result.ok), results };
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: grantItems failed', error, false, false);
        return fail(CODES.TARGET_CREATE_FAILED, { message: error?.message });
    } finally {
        release();
    }
}

/**
 * Resolve and validate one grant, producing a creation payload. Shared by grantItem, grantItems,
 * transferItem and transferItems.
 * @param {object} options
 * @returns {Promise<object>} { ok: true, payload, quantity, arrivalFlags } or a failure result.
 */
async function _prepareGrant({ itemUuid, itemData, quantity, flags, container = null, omitFlags = [] }) {
    let item = null;
    if (itemUuid) {
        try {
            const resolved = await fromUuid(itemUuid);
            if (resolved?.documentName === 'Item') item = resolved;
        } catch { /* fall through to ITEM_NOT_FOUND */ }
        if (!item) return fail(CODES.ITEM_NOT_FOUND, { itemUuid });
    }

    if (item) {
        if (!_isTransferable(item)) return fail(CODES.ITEM_NOT_TRANSFERABLE, { type: item.type, allowed: PHYSICAL_TYPES });
        const contentCount = await _containedCount(item);
        if (contentCount !== 0) return fail(CODES.CONTAINER_HAS_CONTENTS, { contentCount: contentCount < 0 ? null : contentCount });

        // A grant takes nothing, so the resolved document's own quantity is not a ceiling.
        // INSUFFICIENT_QUANTITY is unreachable from here by design.
        const resolved = _resolveQuantity(item, quantity, { drawsDown: false });
        if (resolved.error) return resolved.error;

        const payload = _buildPayload(item, resolved.quantity, resolved.stackable, flags, container, omitFlags);
        // A compendium document keeps its provenance, which the hand-rolled paths lose. This
        // cannot split a stack: the merge predicate only blocks when BOTH sides know their
        // origin and the origins disagree.
        if (item.pack) foundry.utils.setProperty(payload, '_stats.compendiumSource', item.uuid);
        return { ok: true, payload, quantity: resolved.quantity, arrivalFlags: flags ?? {}, container: container ?? null };
    }

    if (!itemData || typeof itemData !== 'object') return fail(CODES.ITEM_NOT_FOUND, { reason: 'itemUuid or itemData required' });
    if (!PHYSICAL_TYPES.includes(itemData.type)) return fail(CODES.ITEM_NOT_TRANSFERABLE, { type: itemData.type, allowed: PHYSICAL_TYPES });

    const data = foundry.utils.deepClone(itemData);
    delete data._id;
    data.system = data.system ?? {};
    const stackable = typeof data.system.quantity === 'number';
    const available = stackable ? data.system.quantity : 1;
    const requested = quantity === undefined || quantity === null ? available : Number(quantity);
    if (!Number.isInteger(requested) || requested < 1) return fail(CODES.INVALID_QUANTITY, { requested: quantity });
    // Matches the resolved-document branch, which this had drifted from. Without it a caller asking
    // for five of an unstackable item got ONE row created and a result reporting five - a silent
    // wrong answer rather than a refusal. There is no availability check here for the same reason
    // there is none there: constructed data has no stock either.
    if (!stackable && requested > 1) return fail(CODES.INVALID_QUANTITY, { requested, available: 1 });
    if (stackable) data.system.quantity = requested;
    for (const path of RESET_PATHS) foundry.utils.deleteProperty(data.system, path);
    // Same rule as the resolved-document branch: containment is written, never carried over.
    // Constructed data is the likelier place for a stale id, not the safer one.
    data.system.container = container ?? null;
    if (omitFlags?.length && data.flags) {
        for (const path of omitFlags) _deletePathAndEmptyParents(data.flags, path);
    }
    if (flags && Object.keys(flags).length) {
        data.flags = foundry.utils.mergeObject(data.flags ?? {}, flags, { inplace: false });
    }
    return { ok: true, payload: data, quantity: requested, arrivalFlags: flags ?? {}, container: container ?? null };
}

/**
 * Move an item between two Actors.
 *
 * Grants on the target first, then reduces the source. The opposite order fails toward a
 * vanished item; this order fails toward a visible duplicate, which is recoverable.
 *
 * @param {object} options
 * @param {string} options.sourceActorUuid - Accepts a synthetic token actor UUID.
 * @param {string} options.targetActorUuid
 * @param {string} options.itemId - Embedded item id on the source Actor.
 * @param {number} [options.quantity]
 * @param {string} [options.stack='merge']
 * @param {string[]} [options.ignoreFlags=[]]
 * @param {object} [options.flags={}]
 * @param {string} [options.container=null] - Container id on the target Actor. Null lands at root.
 * @returns {Promise<object>}
 */
async function transferItem({ sourceActorUuid, targetActorUuid, itemId, quantity, stack = 'merge', ignoreFlags = [], flags = {}, container = null, omitFlags = [] } = {}) {
    const sourceActor = await _resolveActor(sourceActorUuid);
    if (!sourceActor) return fail(CODES.SOURCE_ACTOR_NOT_FOUND, { sourceActorUuid });
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });
    if (sourceActor.uuid === targetActor.uuid) return fail(CODES.SAME_ACTOR, { actorUuid: sourceActor.uuid });

    const { release, contended } = await _acquire([sourceActor.uuid, targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        // Resolved INSIDE the lock and against the live document, so a stale client-side
        // quantity cannot create more on the target than the source actually holds.
        const sourceItem = sourceActor.items.get(itemId);
        if (!sourceItem) return fail(CODES.SOURCE_ITEM_NOT_FOUND, { itemId });
        if (!_isTransferable(sourceItem)) return fail(CODES.ITEM_NOT_TRANSFERABLE, { type: sourceItem.type, allowed: PHYSICAL_TYPES });
        const contentCount = await _containedCount(sourceItem);
        if (contentCount !== 0) return fail(CODES.CONTAINER_HAS_CONTENTS, { contentCount: contentCount < 0 ? null : contentCount });

        const resolved = _resolveQuantity(sourceItem, quantity);
        if (resolved.error) return resolved.error;

        const containerError = await _validateContainer(targetActor, container);
        if (containerError) return containerError;

        const payload = _buildPayload(sourceItem, resolved.quantity, resolved.stackable, flags, container, omitFlags);

        let grant;
        try {
            grant = await _grantItemCore(targetActor, payload, resolved.quantity, stack, ignoreFlags, flags);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Inventory: target create failed', error, false, false);
            return fail(CODES.TARGET_CREATE_FAILED, { message: error?.message });
        }
        if (!grant.ok) return grant;

        try {
            const reduction = await _reduceSourceCore(sourceItem, resolved.quantity, resolved.stackable, resolved.available);
            return {
                ok: true,
                sourceItemId: sourceItem.id,
                targetItemId: grant.targetItemId,
                quantity: resolved.quantity,
                sourceRemaining: reduction.sourceRemaining,
                sourceDeleted: reduction.sourceDeleted,
                merged: grant.merged
            };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Inventory: source reduction failed, rolling back', error, false, false);
            const rolledBack = await _rollbackGrant(targetActor, grant);
            const observed = targetActor.items.get(grant.targetItemId)?._source?.system?.quantity ?? null;
            return fail(rolledBack ? CODES.SOURCE_UPDATE_FAILED : CODES.ROLLBACK_FAILED, {
                targetItemId: grant.targetItemId,
                merged: grant.merged,
                quantity: resolved.quantity,
                observedTargetQuantity: observed,
                observedSourceQuantity: sourceActor.items.get(itemId)?._source?.system?.quantity ?? null,
                message: error?.message
            });
        }
    } finally {
        release();
    }
}

/**
 * Move several items from one Actor to another in as few writes as possible.
 *
 * This is the Take All primitive, and it is not sugar over transferItem. N single transfers are N
 * writes to the recipient and N to the source, which is N racing encumbrance recomputes on each -
 * see _grantBatchCore. This does at most two writes per Actor regardless of item count.
 *
 * Per-item validation, not all-or-nothing: one packed container on a corpse must not stop the
 * other twelve rows from being taken. Each entry reports its own result, index-aligned with
 * `items`. A batch where every entry fails validation writes nothing.
 *
 * @param {object} options
 * @param {string} options.sourceActorUuid - Accepts a synthetic token-actor UUID.
 * @param {string} options.targetActorUuid
 * @param {object[]} options.items - [{ itemId, quantity?, flags?, container? }]. Omit quantity to take the whole stack.
 * @param {string} [options.stack='merge']
 * @param {string[]} [options.ignoreFlags=[]]
 * @param {string} [options.container=null] - Default arrival container on the target Actor.
 * @returns {Promise<object>} { ok, results: [] }
 */
async function transferItems({ sourceActorUuid, targetActorUuid, items = [], stack = 'merge', ignoreFlags = [], container = null, omitFlags = [] } = {}) {
    const sourceActor = await _resolveActor(sourceActorUuid);
    if (!sourceActor) return fail(CODES.SOURCE_ACTOR_NOT_FOUND, { sourceActorUuid });
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });
    if (sourceActor.uuid === targetActor.uuid) return fail(CODES.SAME_ACTOR, { actorUuid: sourceActor.uuid });
    if (!Array.isArray(items) || !items.length) return fail(CODES.SOURCE_ITEM_NOT_FOUND, { reason: 'items must be a non-empty array' });

    const { release, contended } = await _acquire([sourceActor.uuid, targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        const results = new Array(items.length);
        const prepared = new Array(items.length);
        const reductions = [];   // { index, item, quantity, stackable, available }
        const seen = new Set();

        // Every distinct arrival container checked once, against the live target, inside the
        // lock. `undefined` means "use the batch default"; an explicit null means root.
        const containers = items.map(request => (request?.container === undefined ? container : request.container));
        const containerFailures = await _validateContainers(targetActor, containers);

        for (let index = 0; index < items.length; index++) {
            const request = items[index];
            const itemId = request?.itemId;

            // Two entries for one item make the per-entry quantity checks meaningless: each would
            // validate against the full stack and together they could over-draw it. Reject rather
            // than silently summing, because summing guesses at intent a caller can state exactly.
            if (itemId && seen.has(itemId)) {
                results[index] = fail(CODES.DUPLICATE_ITEM, { itemId });
                continue;
            }
            if (itemId) seen.add(itemId);

            // Resolved inside the lock against the live document, so a stale client-side quantity
            // cannot take more than the source holds.
            const sourceItem = itemId ? sourceActor.items.get(itemId) : null;
            if (!sourceItem) { results[index] = fail(CODES.SOURCE_ITEM_NOT_FOUND, { itemId }); continue; }
            if (!_isTransferable(sourceItem)) {
                results[index] = fail(CODES.ITEM_NOT_TRANSFERABLE, { itemId, type: sourceItem.type, allowed: PHYSICAL_TYPES });
                continue;
            }
            const contentCount = await _containedCount(sourceItem);
            if (contentCount !== 0) {
                results[index] = fail(CODES.CONTAINER_HAS_CONTENTS, { itemId, contentCount: contentCount < 0 ? null : contentCount });
                continue;
            }
            const resolved = _resolveQuantity(sourceItem, request?.quantity);
            if (resolved.error) { results[index] = { ...resolved.error, itemId }; continue; }

            const containerError = containerFailures.get(containers[index]);
            if (containerError) { results[index] = { ...containerError, itemId }; continue; }

            const flags = request?.flags ?? {};
            prepared[index] = {
                ok: true,
                payload: _buildPayload(sourceItem, resolved.quantity, resolved.stackable, flags, containers[index], omitFlags),
                quantity: resolved.quantity,
                arrivalFlags: flags
            };
            reductions.push({
                index,
                item: sourceItem,
                quantity: resolved.quantity,
                stackable: resolved.stackable,
                available: resolved.available
            });
        }

        if (!reductions.length) return { ok: false, results };

        // Grant everything valid on the target first. Failing this way leaves a visible duplicate,
        // which is recoverable; reducing the source first would fail toward vanished items.
        let batch;
        try {
            batch = await _grantBatchCore(targetActor, prepared, stack, ignoreFlags);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Inventory: transferItems target write failed', error, false, false);
            for (const entry of reductions) results[entry.index] = fail(CODES.TARGET_CREATE_FAILED, { itemId: entry.item.id, message: error?.message });
            return { ok: false, results };
        }

        // Reduce the source in two writes: one batched update for partial takes, one batched delete
        // for whole ones.
        const sourceUpdates = [];
        const sourceDeletes = [];
        for (const entry of reductions) {
            if (entry.stackable && entry.quantity < entry.available) {
                sourceUpdates.push({ _id: entry.item.id, 'system.quantity': entry.available - entry.quantity });
            } else {
                sourceDeletes.push(entry.item.id);
            }
        }

        try {
            if (sourceUpdates.length) await sourceActor.updateEmbeddedDocuments('Item', sourceUpdates);
            if (sourceDeletes.length) await sourceActor.deleteEmbeddedDocuments('Item', sourceDeletes);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Inventory: transferItems source reduction failed, rolling back', error, false, false);
            const rolledBack = await _rollbackBatch(targetActor, batch.undo);
            for (const entry of reductions) {
                const granted = batch.results[entry.index];
                results[entry.index] = fail(rolledBack ? CODES.SOURCE_UPDATE_FAILED : CODES.ROLLBACK_FAILED, {
                    itemId: entry.item.id,
                    targetItemId: granted?.targetItemId ?? null,
                    merged: granted?.merged ?? null,
                    quantity: entry.quantity,
                    observedTargetQuantity: targetActor.items.get(granted?.targetItemId)?._source?.system?.quantity ?? null,
                    observedSourceQuantity: sourceActor.items.get(entry.item.id)?._source?.system?.quantity ?? null,
                    message: error?.message
                });
            }
            return { ok: false, results };
        }

        // Source reduction succeeded, so fold the grant results in with the source side reported.
        for (const entry of reductions) {
            const granted = batch.results[entry.index];
            const deleted = sourceDeletes.includes(entry.item.id);
            results[entry.index] = granted?.ok
                ? {
                    ...granted,
                    sourceItemId: entry.item.id,
                    sourceRemaining: deleted ? 0 : entry.available - entry.quantity,
                    sourceDeleted: deleted
                }
                : granted ?? fail(CODES.TARGET_CREATE_FAILED, { itemId: entry.item.id });
        }

        return { ok: results.every(result => result?.ok), results };
    } finally {
        release();
    }
}

/**
 * Settle several directed transfers as ONE operation: everything commits, or nothing does.
 *
 * This is the primitive a purchase needs. A shop transaction is not reliably two-sided - the
 * shopper always pays, so buying for someone else routes goods to a recipient, coin from a payer,
 * and change back to that payer. Three parties, and a two-sided shape cannot express it: "what A
 * gives" only means "what B receives" while there is exactly one other party. A directed transfer
 * carries the routing explicitly, and the two-party case is simply two transfers.
 *
 * ALL-OR-NOTHING, unlike `transferItems`. That method reports per item because one packed bag on a
 * corpse must not stop the other twelve rows; here a partially applied settlement is the failure
 * being prevented, so any refusal fails the whole call and writes nothing. Every failure result
 * carries `index` (and `entryIndex` where an item is at fault) so a caller can say which leg.
 *
 * @param {object} options
 * @param {object[]} options.transfers - Directed movements:
 *   `{ from, to, items?, currency?, container?, copy?, preserveEmptySource? }`.
 *   `items` entries are `{ itemId, quantity?, flags? }`; `container` is an arrival container on
 *   `to`; `copy` grants without touching the source; `preserveEmptySource` leaves an emptied
 *   stackable row at quantity 0 rather than deleting it.
 * @param {string} [options.stack='merge']
 * @param {string[]} [options.ignoreFlags=[]]
 * @returns {Promise<object>} `{ ok: true, results: [] }`, or a single failure describing the leg.
 */
async function exchange({ transfers = [], stack = 'merge', ignoreFlags = [], omitFlags = [] } = {}) {
    if (!Array.isArray(transfers) || !transfers.length) {
        return fail(CODES.EXCHANGE_EMPTY, { reason: 'transfers must be a non-empty array' });
    }

    // Resolved before the lock; every live re-read happens inside it. Keyed on the resolved
    // Actor uuid rather than the caller's string, because a token uuid and its actor uuid are
    // different strings naming one Actor and must share a lock, a purse, and a write.
    const actorsByUuid = new Map();
    const resolved = [];
    const resolveCache = new Map(); // caller's string -> Actor|null; one Actor names two strings
    const resolveOnce = async (uuid) => {
        if (!resolveCache.has(uuid)) resolveCache.set(uuid, await _resolveActor(uuid));
        return resolveCache.get(uuid);
    };
    for (const transfer of transfers) {
        const fromActor = await resolveOnce(transfer?.from);
        const toActor = await resolveOnce(transfer?.to);
        if (fromActor) actorsByUuid.set(fromActor.uuid, fromActor);
        if (toActor) actorsByUuid.set(toActor.uuid, toActor);
        resolved.push({ fromActor, toActor });
    }

    for (let index = 0; index < transfers.length; index++) {
        const { fromActor, toActor } = resolved[index];
        if (!fromActor) return fail(CODES.SOURCE_ACTOR_NOT_FOUND, { index, sourceActorUuid: transfers[index]?.from ?? null });
        if (!toActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { index, targetActorUuid: transfers[index]?.to ?? null });
        // Per LEG, never per call: the merchant sends goods and receives coin in the same
        // settlement, so an Actor appearing in several transfers is the ordinary case.
        if (fromActor.uuid === toActor.uuid) return fail(CODES.SAME_ACTOR, { index, actorUuid: fromActor.uuid });
    }

    // One acquisition for every Actor named anywhere. _acquire sorts and dedupes, so the ordering
    // that makes a simultaneous A-to-B and B-to-A safe generalises to N parties unchanged.
    // Acquiring per transfer instead would reopen the window this method exists to close.
    const { release, contended } = await _acquire(Array.from(actorsByUuid.keys()));
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });

    try {
        const arrivals = new Map();      // target uuid -> [{ prepared, index, entryIndex, itemId, copied }]
        const departures = new Map();    // source uuid -> [{ item, quantity, stackable, available, index, entryIndex, preserveEmpty }]
        const currencyOut = new Map();   // actor uuid -> { denomination: total }
        const currencyIn = new Map();
        const perTransferCurrency = new Array(transfers.length);
        const drawn = new Set();         // `${actorUuid}:${itemId}` for legs that actually take
        const containerChecks = new Map();

        // ---------- plan: everything validated against the state at the START of the call ----------
        for (let index = 0; index < transfers.length; index++) {
            const transfer = transfers[index];
            const { fromActor, toActor } = resolved[index];
            const copy = transfer?.copy === true;
            const preserveEmpty = transfer?.preserveEmptySource === true;
            const container = transfer?.container ?? null;

            if (container !== null && container !== undefined) {
                const key = `${toActor.uuid}:${container}`;
                if (!containerChecks.has(key)) containerChecks.set(key, await _validateContainer(toActor, container));
                const containerError = containerChecks.get(key);
                if (containerError) return { ...containerError, index };
            }

            const items = Array.isArray(transfer?.items) ? transfer.items : [];
            for (let entryIndex = 0; entryIndex < items.length; entryIndex++) {
                const request = items[entryIndex];
                const itemId = request?.itemId;
                const sourceItem = itemId ? fromActor.items.get(itemId) : null;
                if (!sourceItem) return fail(CODES.SOURCE_ITEM_NOT_FOUND, { index, entryIndex, itemId: itemId ?? null });
                if (!_isTransferable(sourceItem)) {
                    return fail(CODES.ITEM_NOT_TRANSFERABLE, { index, entryIndex, itemId, type: sourceItem.type, allowed: PHYSICAL_TYPES });
                }
                const contentCount = await _containedCount(sourceItem);
                if (contentCount !== 0) {
                    return fail(CODES.CONTAINER_HAS_CONTENTS, { index, entryIndex, itemId, contentCount: contentCount < 0 ? null : contentCount });
                }

                let quantity;
                let stackable;
                let available;
                if (copy) {
                    // A copied source is a template with no count, so its stack is NOT a ceiling -
                    // a shop with infinite stock sells three from a row that reads one. Same rule
                    // the grant paths use, and it shares their code rather than restating it.
                    const check = _resolveQuantity(sourceItem, request?.quantity, { drawsDown: false });
                    if (check.error) return { ...check.error, index, entryIndex, itemId };
                    quantity = check.quantity;
                    stackable = check.stackable;
                    available = check.available;
                } else {
                    // Same reasoning as transferItems: two draws on one item make each per-entry
                    // quantity check meaningless, and together they could over-draw the stack.
                    const key = `${fromActor.uuid}:${itemId}`;
                    if (drawn.has(key)) return fail(CODES.DUPLICATE_ITEM, { index, entryIndex, itemId });
                    drawn.add(key);

                    const check = _resolveQuantity(sourceItem, request?.quantity);
                    if (check.error) return { ...check.error, index, entryIndex, itemId };
                    quantity = check.quantity;
                    stackable = check.stackable;
                    available = check.available;
                }

                const flags = request?.flags ?? {};
                if (!arrivals.has(toActor.uuid)) arrivals.set(toActor.uuid, []);
                arrivals.get(toActor.uuid).push({
                    prepared: {
                        ok: true,
                        payload: _buildPayload(sourceItem, quantity, stackable, flags, container, omitFlags),
                        quantity,
                        arrivalFlags: flags,
                        container
                    },
                    index, entryIndex, itemId, copied: copy
                });

                if (!copy) {
                    if (!departures.has(fromActor.uuid)) departures.set(fromActor.uuid, []);
                    departures.get(fromActor.uuid).push({
                        item: sourceItem, quantity, stackable, available, index, entryIndex, preserveEmpty
                    });
                }
            }

            const currency = transfer?.currency;
            if (currency && typeof currency === 'object' && Object.keys(currency).length) {
                const { deltas, error } = _normalizeCurrency(currency);
                if (error) return { ...error, index };
                perTransferCurrency[index] = deltas;
                const out = currencyOut.get(fromActor.uuid) ?? {};
                const into = currencyIn.get(toActor.uuid) ?? {};
                for (const [denomination, amount] of Object.entries(deltas)) {
                    out[denomination] = (out[denomination] ?? 0) + amount;
                    into[denomination] = (into[denomination] ?? 0) + amount;
                }
                currencyOut.set(fromActor.uuid, out);
                currencyIn.set(toActor.uuid, into);
            }
        }

        // Affordability is checked on the TOTAL each Actor pays out, against its balance at the
        // start of the call. Change arriving in the same settlement cannot fund the payment - the
        // payer must actually hold what they hand over, which is what happens at a counter.
        for (const [uuid, out] of currencyOut) {
            const actor = actorsByUuid.get(uuid);
            const shortfalls = {};
            for (const [denomination, amount] of Object.entries(out)) {
                const availableCoin = Number(actor._source?.system?.currency?.[denomination] ?? 0);
                if (availableCoin < amount) shortfalls[denomination] = { requested: amount, available: availableCoin };
            }
            if (Object.keys(shortfalls).length) return fail(CODES.INSUFFICIENT_CURRENCY, { actorUuid: uuid, shortfalls });
        }

        // ---------- apply: currency, then arrivals, then departures ----------
        //
        // That order is the multi-party form of "grant before you reduce". Every step can be
        // reversed by the step that follows it failing: currency is a numeric delta, arrivals have
        // a quantity-aware undo, and departures - the only irreversible half, since a deleted row
        // cannot be restored with its id - happen last, when nothing after them can fail.
        const currencyUndo = [];
        const arrivalUndo = [];

        const netByActor = new Map();
        const addNet = (uuid, denomination, delta) => {
            const net = netByActor.get(uuid) ?? {};
            net[denomination] = (net[denomination] ?? 0) + delta;
            netByActor.set(uuid, net);
        };
        for (const [uuid, out] of currencyOut) for (const [d, amount] of Object.entries(out)) addNet(uuid, d, -amount);
        for (const [uuid, into] of currencyIn) for (const [d, amount] of Object.entries(into)) addNet(uuid, d, amount);

        const undoEverything = async () => {
            let clean = true;
            // Copied, not reversed in place: the arrays are still read for the failure result.
            for (const entry of [...arrivalUndo].reverse()) {
                if (!await _rollbackBatch(entry.actor, entry.undo)) clean = false;
            }
            for (const entry of [...currencyUndo].reverse()) {
                try { await entry.actor.update(entry.restore); } catch { clean = false; }
            }
            return clean;
        };

        try {
            for (const [uuid, net] of netByActor) {
                const actor = actorsByUuid.get(uuid);
                const update = {};
                const restore = {};
                for (const [denomination, delta] of Object.entries(net)) {
                    // A leg paying 30 and a leg receiving 30 net to nothing. Skipping the write is
                    // not netting the VALIDATION - that already happened against the full amount.
                    if (!delta) continue;
                    const current = Number(actor._source?.system?.currency?.[denomination] ?? 0);
                    update[`system.currency.${denomination}`] = current + delta;
                    restore[`system.currency.${denomination}`] = current;
                }
                if (!Object.keys(update).length) continue;
                await actor.update(update);
                currencyUndo.push({ actor, restore });
            }

            for (const [uuid, list] of arrivals) {
                const actor = actorsByUuid.get(uuid);
                const batch = await _grantBatchCore(actor, list.map(entry => entry.prepared), stack, ignoreFlags);
                arrivalUndo.push({ actor, undo: batch.undo });
                for (let slot = 0; slot < list.length; slot++) list[slot].result = batch.results[slot];
                const failed = batch.results.findIndex(result => !result?.ok);
                if (failed >= 0) {
                    const rolledBack = await undoEverything();
                    return fail(rolledBack ? CODES.TARGET_CREATE_FAILED : CODES.ROLLBACK_FAILED, {
                        index: list[failed].index,
                        entryIndex: list[failed].entryIndex,
                        itemId: list[failed].itemId,
                        targetActorUuid: uuid
                    });
                }
            }

            for (const [uuid, list] of departures) {
                const actor = actorsByUuid.get(uuid);
                const updates = [];
                const deletes = [];
                for (const entry of list) {
                    const emptied = !entry.stackable || entry.quantity >= entry.available;
                    // preserveEmptySource keeps a shelf row visible at zero so a GM can see what
                    // the shop normally carries and a restock has something to restock. It cannot
                    // apply to an unstackable item, which has no quantity to leave at zero.
                    if (emptied && entry.preserveEmpty && entry.stackable) {
                        updates.push({ _id: entry.item.id, 'system.quantity': 0 });
                    } else if (emptied) {
                        deletes.push(entry.item.id);
                    } else {
                        updates.push({ _id: entry.item.id, 'system.quantity': entry.available - entry.quantity });
                    }
                    entry.deleted = emptied && !(entry.preserveEmpty && entry.stackable);
                    entry.remaining = entry.deleted ? 0 : Math.max(0, entry.available - entry.quantity);
                }
                if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
                if (deletes.length) await actor.deleteEmbeddedDocuments('Item', deletes);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Inventory: exchange failed, rolling back', error, false, false);
            const rolledBack = await undoEverything();
            return fail(rolledBack ? CODES.SOURCE_UPDATE_FAILED : CODES.ROLLBACK_FAILED, { message: error?.message });
        }

        // ---------- results ----------
        const results = transfers.map((transfer, index) => ({
            ok: true,
            from: resolved[index].fromActor.uuid,
            to: resolved[index].toActor.uuid,
            items: [],
            currency: perTransferCurrency[index] ?? {}
        }));

        for (const list of arrivals.values()) {
            for (const entry of list) {
                results[entry.index].items[entry.entryIndex] = {
                    itemId: entry.itemId,
                    targetItemId: entry.result?.targetItemId ?? null,
                    quantity: entry.prepared.quantity,
                    merged: entry.result?.merged ?? false,
                    coalesced: entry.result?.coalesced,
                    copied: entry.copied,
                    // A copied source is untouched by definition, so it reports no remainder
                    // rather than a stale one. The departures pass fills these in otherwise.
                    ...(entry.copied ? { sourceRemaining: null, sourceDeleted: false } : {})
                };
            }
        }
        for (const list of departures.values()) {
            for (const entry of list) {
                const row = results[entry.index].items[entry.entryIndex];
                if (!row) continue;
                row.sourceRemaining = entry.remaining;
                row.sourceDeleted = entry.deleted;
            }
        }

        return { ok: true, results };
    } finally {
        release();
    }
}

/**
 * Add coins to an Actor. Deltas, never absolute totals — absolute writes race the way a
 * read-modify-write on system.currency always does.
 * @param {object} options
 * @param {string} options.targetActorUuid
 * @param {object} options.currency - { gp: 12, sp: 4 }
 * @returns {Promise<object>}
 */
async function grantCurrency({ targetActorUuid, currency } = {}) {
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });
    const { deltas, error } = _normalizeCurrency(currency);
    if (error) return error;

    const { release, contended } = await _acquire([targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        const update = {};
        const applied = {};
        for (const [denomination, amount] of Object.entries(deltas)) {
            const current = Number(targetActor._source?.system?.currency?.[denomination] ?? 0);
            update[`system.currency.${denomination}`] = current + amount;
            applied[denomination] = amount;
        }
        await targetActor.update(update);
        return { ok: true, currency: applied };
    } catch (err) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: grantCurrency failed', err, false, false);
        return fail(CODES.TARGET_CREATE_FAILED, { message: err?.message });
    } finally {
        release();
    }
}

/**
 * Write an Actor's purse to absolute values. No counterparty, no affordability check.
 *
 * This is the one currency method that is not a delta, and the distinction is narrower than it
 * looks. Deltas exist because a total computed from a stale read OUTSIDE a lock races: two clients
 * both read 100, both write 100 plus their own change, and one change is lost. A GM typing 250
 * means 250 - there is no read to go stale - so taking the lock and writing it is consistent with
 * that rule rather than an exception to it.
 *
 * It exists because the alternative is a raw `actor.update()`, which takes no lock at all. Since
 * `exchange` shipped, an NPC purse can be read under a lock and written a moment later, so an
 * unlocked edit landing in between is silently discarded: the settlement writes `stale + delta`
 * over it. A GM adjusting a till mid-session is exactly when that happens, and nothing reports it.
 *
 * ONLY the denominations named are written. Omitted ones are left alone rather than zeroed, because
 * the destructive reading of a partial object would be both surprising and unrecoverable.
 *
 * No permission check, like every primitive here - call it from a GM-authoritative handler after
 * your own authorization has passed.
 *
 * @param {object} options
 * @param {string} options.targetActorUuid
 * @param {object} options.currency - Absolute values, e.g. `{ gp: 250 }`. Zero is meaningful.
 * @returns {Promise<object>} `{ ok: true, currency, previous }` - `previous` holds what each named
 *   denomination read before the write, which is what a GM needs to undo it.
 */
async function setCurrency({ targetActorUuid, currency } = {}) {
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });

    const { deltas: values, error } = _normalizeCurrency(currency, { allowZero: true });
    if (error) return error;

    const { release, contended } = await _acquire([targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        const update = {};
        const previous = {};
        for (const [denomination, amount] of Object.entries(values)) {
            previous[denomination] = Number(targetActor._source?.system?.currency?.[denomination] ?? 0);
            update[`system.currency.${denomination}`] = amount;
        }
        await targetActor.update(update);
        return { ok: true, currency: values, previous };
    } catch (err) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: setCurrency failed', err, false, false);
        return fail(CODES.TARGET_CREATE_FAILED, { message: err?.message });
    } finally {
        release();
    }
}

/**
 * Move coins between two Actors.
 *
 * Denominations are never converted. Paying 2 gp from a purse holding only 20 sp fails rather
 * than silently exchanging: an automatic exchange is a house rule, not a mechanic, and it is
 * not this API's to impose.
 *
 * @param {object} options
 * @param {string} options.sourceActorUuid
 * @param {string} options.targetActorUuid
 * @param {object} options.currency - Deltas to move.
 * @returns {Promise<object>}
 */
async function transferCurrency({ sourceActorUuid, targetActorUuid, currency } = {}) {
    const sourceActor = await _resolveActor(sourceActorUuid);
    if (!sourceActor) return fail(CODES.SOURCE_ACTOR_NOT_FOUND, { sourceActorUuid });
    const targetActor = await _resolveActor(targetActorUuid);
    if (!targetActor) return fail(CODES.TARGET_ACTOR_NOT_FOUND, { targetActorUuid });
    if (sourceActor.uuid === targetActor.uuid) return fail(CODES.SAME_ACTOR, { actorUuid: sourceActor.uuid });
    const { deltas, error } = _normalizeCurrency(currency);
    if (error) return error;

    const { release, contended } = await _acquire([sourceActor.uuid, targetActor.uuid]);
    if (contended) return fail(CODES.LOCK_TIMEOUT, { actorUuid: contended, waitedMs: LOCK_TIMEOUT_MS });
    try {
        // Checked inside the lock against live values, and checked in full before anything is
        // written: a partial currency move is not something a rollback can express cleanly.
        const shortfalls = {};
        for (const [denomination, amount] of Object.entries(deltas)) {
            const available = Number(sourceActor._source?.system?.currency?.[denomination] ?? 0);
            if (available < amount) shortfalls[denomination] = { requested: amount, available };
        }
        if (Object.keys(shortfalls).length) return fail(CODES.INSUFFICIENT_CURRENCY, { shortfalls });

        const sourceUpdate = {};
        const targetUpdate = {};
        for (const [denomination, amount] of Object.entries(deltas)) {
            const fromSource = Number(sourceActor._source?.system?.currency?.[denomination] ?? 0);
            const onTarget = Number(targetActor._source?.system?.currency?.[denomination] ?? 0);
            sourceUpdate[`system.currency.${denomination}`] = fromSource - amount;
            targetUpdate[`system.currency.${denomination}`] = onTarget + amount;
        }

        await targetActor.update(targetUpdate);
        try {
            await sourceActor.update(sourceUpdate);
        } catch (err) {
            // Same create-then-reduce shape as transferItem, same rollback obligation.
            const undo = {};
            for (const [denomination, amount] of Object.entries(deltas)) {
                const onTarget = Number(targetActor._source?.system?.currency?.[denomination] ?? 0);
                undo[`system.currency.${denomination}`] = Math.max(0, onTarget - amount);
            }
            let rolledBack = true;
            try { await targetActor.update(undo); } catch { rolledBack = false; }
            return fail(rolledBack ? CODES.SOURCE_UPDATE_FAILED : CODES.ROLLBACK_FAILED, {
                currency: deltas,
                message: err?.message
            });
        }
        return { ok: true, currency: deltas };
    } finally {
        release();
    }
}

/**
 * Declare a flag path this module writes as transient UI state, so no consumer's merge is broken
 * by it. Call once during ready.
 *
 * Declare a flag if you write it AFTER an item is created and it does not describe what the item
 * IS. A "recently arrived" badge is transient; a crafting quirk is not.
 *
 * @param {string} path - Dot path, e.g. 'coffee-pub-squire.isNew'. The scope must be your module.
 * @returns {boolean} False if the path was malformed.
 */
function registerTransientFlag(path) {
    if (!path || typeof path !== 'string' || !path.includes('.')) {
        postConsoleAndNotification(MODULE.NAME, 'Inventory: registerTransientFlag needs a "scope.key" path', path, false, false);
        return false;
    }
    _transientFlags.add(path);
    postConsoleAndNotification(MODULE.NAME, `Inventory: transient flag registered: ${path}`, '', true, false);
    return true;
}

/** Flag paths currently excluded from merge identity for every caller. Diagnostics. */
function getTransientFlags() {
    return Array.from(_transientFlags);
}

const InventoryAPI = {
    registerTransientFlag,
    getTransientFlags,
    grantItem,
    grantItems,
    grantCurrency,
    setCurrency,
    transferItem,
    transferItems,
    transferCurrency,
    exchange,
    CODES,
    PHYSICAL_TYPES,
    DENOMINATIONS
};

export { InventoryAPI, registerTransientFlag, getTransientFlags, grantItem, grantItems, grantCurrency, setCurrency, transferItem, transferItems, transferCurrency, exchange };
