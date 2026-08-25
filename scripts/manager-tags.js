// ==================================================================
// ===== MANAGER-TAGS – Unified tag registry, taxonomy, CRUD =======
// ==================================================================
// Central labeling infrastructure. Any coffee-pub module can register
// a taxonomy and attach tags to records via the central assignment
// store. See documentation/architecture/architecture-tags.md.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { normalizePinGroup } from './manager-pins-schema.js';

// ----------------------------------------------------------------
// Setting keys
// ----------------------------------------------------------------
const TAG_ASSIGNMENTS_KEY = 'tagAssignments';
const TAG_REGISTRY_KEY    = 'tagRegistry';
const TAG_VISIBILITY_KEY  = 'tagVisibility';
const TAG_MIGRATION_KEY   = 'tagsMigrationComplete';

// SocketLib handler name for the GM proxy
const GM_PROXY_HANDLER = 'blacksmith-tags-gm-proxy';

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

/** Normalize a single tag string: lowercase, spaces → hyphens. */
function normalizeTag(value) {
    return normalizePinGroup(value);
}

/** Normalize an array of raw tag values. Deduplicates and filters empties. */
function normalizeTagArray(input) {
    const arr = Array.isArray(input)
        ? input
        : (typeof input === 'string' ? input.split(',') : []);
    const seen = new Set();
    const result = [];
    for (const raw of arr) {
        const k = normalizeTag(raw);
        if (k && !seen.has(k)) { seen.add(k); result.push(k); }
    }
    return result;
}

// ----------------------------------------------------------------
// TagManager
// ----------------------------------------------------------------

export class TagManager {

    // In-memory taxonomy registries
    static _builtinRegistry  = new Map(); // contextKey → { label, tags: [{key, protected}] }
    static _overrideRegistry = new Map();
    static _runtimeRegistry  = new Map();
    static _globalTags       = [];        // From "globalTags" in taxonomy JSON

    // Load state
    static _taxonomyLoaded      = false;
    static _taxonomyLoadPromise = null;

    // GM proxy registration flag
    static _gmProxyRegistered = false;

    // ============================================================
    // Taxonomy – load & register
    // ============================================================

    static async ensureTaxonomyLoaded() {
        if (this._taxonomyLoaded) return;
        if (this._taxonomyLoadPromise) { await this._taxonomyLoadPromise; return; }
        this._taxonomyLoadPromise = (async () => {
            try {
                this._builtinRegistry.clear();
                this._overrideRegistry.clear();
                this._globalTags = [];
                await this._loadTaxonomyJson(
                    `modules/${MODULE.ID}/resources/tag-taxonomy.json`,
                    this._builtinRegistry
                );
                // Compatibility: also load pin-taxonomy.json contexts
                await this._loadPinTaxonomyCompat();
                // Load optional override JSON
                const overridePath = String(getSettingSafely(MODULE.ID, 'tagTaxonomyOverrideJson', '') || '').trim();
                if (overridePath) {
                    await this._loadTaxonomyJson(overridePath, this._overrideRegistry).catch(() => {});
                }
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | TAGS Failed to load tag taxonomy.', err?.message || err, false, true);
            } finally {
                this._taxonomyLoaded      = true;
                this._taxonomyLoadPromise = null;
            }
        })();
        await this._taxonomyLoadPromise;
    }

    /** Load tag-taxonomy.json (v1 format: { version, globalTags, contexts }). */
    static async _loadTaxonomyJson(path, registry) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load tag taxonomy from ${path}: ${response.status}`);
        const payload = await response.json();

        // Support both globalTags (new) and globalFlags (old) key names
        const globals = payload?.globalTags ?? payload?.globalFlags ?? [];
        if (Array.isArray(globals)) {
            for (const raw of globals) {
                const k = normalizeTag(raw);
                if (k && !this._globalTags.includes(k)) this._globalTags.push(k);
            }
        }

        if (payload?.contexts && typeof payload.contexts === 'object') {
            for (const [contextKey, entry] of Object.entries(payload.contexts)) {
                if (!contextKey || typeof contextKey !== 'string') continue;
                const tags = this._normalizeTagList(entry);
                registry.set(contextKey, {
                    label: (typeof entry?.label === 'string' && entry.label.trim()) ? entry.label.trim() : '',
                    tags
                });
            }
        }
    }

    /** Compatibility shim: read pin-taxonomy.json and register each pin context. */
    static async _loadPinTaxonomyCompat() {
        try {
            const path = `modules/${MODULE.ID}/resources/pin-taxonomy.json`;
            const response = await fetch(path);
            if (!response.ok) return;
            const payload = await response.json();

            if (payload?.modules && typeof payload.modules === 'object') {
                for (const [moduleId, moduleEntry] of Object.entries(payload.modules)) {
                    const cats = moduleEntry?.pinCategories;
                    if (!cats || typeof cats !== 'object') continue;
                    for (const [type, entry] of Object.entries(cats)) {
                        const contextKey = `${moduleId}.${type}`;
                        if (this._builtinRegistry.has(contextKey)) continue;
                        const tags = this._normalizeTagList(entry);
                        this._builtinRegistry.set(contextKey, {
                            label: (typeof entry?.label === 'string' && entry.label.trim()) ? entry.label.trim() : '',
                            tags
                        });
                    }
                }
            }
        } catch (_) {
            // Pin taxonomy compat is best-effort
        }
    }

    /** Invalidate taxonomy cache (e.g., on override JSON change). */
    static invalidateTaxonomy() {
        this._taxonomyLoaded      = false;
        this._taxonomyLoadPromise = null;
        this._builtinRegistry.clear();
        this._overrideRegistry.clear();
        this._globalTags = [];
    }

    /**
     * Normalize a taxonomy entry's tag list into `{ key, protected }[]`.
     *
     * Accepts `tags` or `flags` as the source key: `tags` is the documented shape for runtime
     * `register()` and `pin-taxonomy.json`, while the shipped `tag-taxonomy.json` uses `flags`.
     * Reading both means a caller cannot get a silently-empty taxonomy by picking the wrong key.
     * Entries may be plain strings or `{ key, protected }` objects.
     *
     * @param {{ tags?: Array, flags?: Array }} entry
     * @returns {Array<{key: string, protected: boolean}>}
     */
    static _normalizeTagList(entry) {
        const src = Array.isArray(entry?.tags) ? entry.tags
                  : Array.isArray(entry?.flags) ? entry.flags
                  : null;
        if (!src) return [];
        return src
            .filter(f => f && (typeof f === 'string' || typeof f?.key === 'string'))
            .map(f => typeof f === 'string'
                ? { key: normalizeTag(f), protected: false }
                : { key: normalizeTag(f.key), protected: !!f.protected })
            .filter(f => f.key);
    }

    /**
     * Register or merge a taxonomy entry at runtime.
     * Prefer adding entries to tag-taxonomy.json for shipped modules.
     * @param {string} contextKey
     * @param {{ label?: string, tags: Array<string | {key: string, protected?: boolean}> }} taxonomy
     */
    static register(contextKey, taxonomy = {}) {
        if (!contextKey || typeof contextKey !== 'string') return;
        const tags = this._normalizeTagList(taxonomy);
        const existing = this._runtimeRegistry.get(contextKey);
        if (existing) {
            const existingKeys = new Set(existing.tags.map(f => f.key));
            const merged = [...existing.tags];
            for (const f of tags) if (!existingKeys.has(f.key)) merged.push(f);
            this._runtimeRegistry.set(contextKey, { label: taxonomy.label || existing.label, tags: merged });
        } else {
            this._runtimeRegistry.set(contextKey, {
                label: (typeof taxonomy.label === 'string' && taxonomy.label.trim()) ? taxonomy.label.trim() : '',
                tags
            });
        }
        Hooks.callAll('blacksmith.tags.registered', { contextKey, taxonomy });
    }

    /** Merge builtin, override, and runtime entries for a context key. */
    static _mergeTaxonomy(contextKey) {
        const builtin  = this._builtinRegistry.get(contextKey);
        const override = this._overrideRegistry.get(contextKey);
        const runtime  = this._runtimeRegistry.get(contextKey);
        if (!builtin && !override && !runtime) return null;

        const tagMap = new Map();
        for (const source of [builtin, override, runtime]) {
            if (!source) continue;
            for (const f of source.tags ?? []) tagMap.set(f.key, f);
        }
        const label = (runtime?.label || override?.label || builtin?.label) ?? '';
        return { label, tags: [...tagMap.values()] };
    }

    /**
     * Get the merged tag list for a context, including global tags.
     * @param {string} contextKey
     * @returns {Array<{key: string, label: string, protected: boolean, tier: 'taxonomy'|'global'}>}
     */
    static getChoices(contextKey) {
        const taxonomy = this._mergeTaxonomy(contextKey);
        const taxonomyKeys = new Set();
        const result = [];

        for (const f of taxonomy?.tags ?? []) {
            if (!f.key) continue;
            taxonomyKeys.add(f.key);
            result.push({
                key: f.key,
                label: f.key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                protected: !!f.protected,
                tier: 'taxonomy'
            });
        }
        for (const k of this._globalTags) {
            if (!taxonomyKeys.has(k)) {
                result.push({
                    key: k,
                    label: k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    protected: false,
                    tier: 'global'
                });
            }
        }
        return result;
    }

    // ============================================================
    // Normalization
    // ============================================================

    static normalize(input) {
        if (typeof input === 'string') return normalizeTag(input);
        return normalizeTagArray(input);
    }

    // ============================================================
    // Protected tag check
    // ============================================================

    static _isProtected(tag) {
        const k = normalizeTag(tag);
        for (const registry of [this._builtinRegistry, this._overrideRegistry, this._runtimeRegistry]) {
            for (const [, entry] of registry) {
                if (entry.tags?.some(f => f.key === k && f.protected)) return true;
            }
        }
        return false;
    }

    // ============================================================
    // Serialized write path
    // ============================================================
    //
    // Every mutation of `tagAssignments` or `tagRegistry` is a read-modify-write of
    // the WHOLE setting: read the object, clone it, change one key, write it back.
    // That is only safe if exactly one such cycle is in flight at a time, and two
    // things used to break that guarantee:
    //
    //   1. Concurrent callers on one client. Two un-awaited `setTags` calls -- a loop
    //      of pin mirrors, or a consumer's `Promise.all` -- each cloned the same stale
    //      snapshot, so the last write silently discarded every earlier one.
    //   2. Players. A non-GM used to compute the entire assignments object locally and
    //      ship it to the GM, who wrote it verbatim. A player holding a snapshot from
    //      before a GM edit did not merely lose a race -- they overwrote every context
    //      key for every module with their stale copy.
    //
    // Both are fixed here. `_mutate` is the single entry point for every write: on the
    // GM it queues the cycle behind any cycle already running, and on a player it sends
    // the DELTA (what changed, not the resulting object) so the GM performs its own
    // read-modify-write against current data -- also queued, since several players'
    // requests can land together.
    //
    // The invariant to preserve: nothing outside `_applyMutation` may call
    // `game.settings.set` on either key, and `_applyMutation` runs only inside `_enqueue`.

    /** Tail of the serialized write chain. Never rejects, so one failure cannot stall the queue. */
    static _writeChain = Promise.resolve();

    /**
     * Run a read-modify-write cycle after all previously queued cycles have settled.
     * @param {() => Promise<any>} task
     * @returns {Promise<any>} the task's own result, rejecting as the task rejects
     */
    static _enqueue(task) {
        const run = this._writeChain.then(() => task());
        this._writeChain = run.then(() => {}, () => {});
        return run;
    }

    /**
     * Single entry point for every tag mutation.
     * GM: queue it locally. Player: send the delta to the GM, who queues it there.
     */
    static async _mutate(action, params) {
        if (game.user?.isGM) return this._enqueue(() => this._applyMutation(action, params));
        return this._requestGM(action, params);
    }

    /**
     * Perform one mutation against current setting data. GM-side only, and only ever
     * called from inside `_enqueue`.
     */
    static async _applyMutation(action, params) {
        switch (action) {
            case 'setRecordTags':    return this._applySetRecordTags(params);
            case 'mergeRecordTags':  return this._applyMergeRecordTags(params);
            case 'deleteRecordTags': return this._applyDeleteRecordTags(params);
            case 'addRegistryTags':  return this._applyAddRegistryTags(params);
            case 'purgeRecords':     return this._applyPurgeRecords(params);
            case 'adoptLegacyStore': return this._applyAdoptLegacyStore(params);
            case 'renameTag':        return this._applyRenameTag(params);
            case 'deleteTag':        return this._applyDeleteTag(params);
            default:
                throw new Error(`Unknown tags mutation: ${action}`);
        }
    }

    // ============================================================
    // Central assignment store
    // ============================================================

    static _getAssignments() {
        const raw = getSettingSafely(MODULE.ID, TAG_ASSIGNMENTS_KEY, {});
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    }

    /**
     * Write assignments, pruning context buckets left with no records.
     *
     * `pruneContexts` NAMES WHAT THIS WRITE TOUCHED, and pruning is confined to it.
     * Sweeping the whole object instead would be tidier and is wrong: a write to one
     * context would then also edit unrelated contexts, which destroys the one property
     * worth asserting about this path -- that a write changes nothing outside its own
     * scope. That assertion is the guard against a stale client overwriting the store,
     * so it has to stay sharp. A caller that genuinely visits every context (rename,
     * delete, legacy adoption) passes `null` to mean all of them.
     *
     * Empty buckets left elsewhere by older versions are inert and are cleaned when
     * their own context is next written.
     *
     * Inside `_enqueue` only.
     *
     * @param {object} assignments
     * @param {string[]|null} pruneContexts context keys this write touched, or null for all
     */
    static async _putAssignments(assignments, pruneContexts) {
        const scope = pruneContexts === null ? Object.keys(assignments) : (pruneContexts ?? []);
        for (const contextKey of scope) {
            const records = assignments[contextKey];
            if (records && typeof records === 'object' && Object.keys(records).length === 0) {
                delete assignments[contextKey];
            }
        }
        await game.settings.set(MODULE.ID, TAG_ASSIGNMENTS_KEY, assignments);
    }

    static async _applySetRecordTags({ contextKey, recordId, tags }) {
        const normalized  = normalizeTagArray(tags);
        const assignments = foundry.utils.deepClone(this._getAssignments());
        if (!assignments[contextKey]) assignments[contextKey] = {};
        if (normalized.length > 0) {
            assignments[contextKey][recordId] = normalized;
        } else {
            delete assignments[contextKey][recordId];
        }
        await this._putAssignments(assignments, [contextKey]);
        if (normalized.length > 0) await this._applyAddRegistryTags({ tags: normalized });
        return normalized;
    }

    /**
     * Add or remove tags on a record, resolved against current data rather than against
     * a snapshot the caller read earlier. This is why `addTags` / `removeTags` are their
     * own delta operations instead of a read followed by `setTags`.
     */
    static async _applyMergeRecordTags({ contextKey, recordId, tags, op }) {
        const delta   = normalizeTagArray(tags);
        const current = this.getTags(contextKey, recordId);
        const next = op === 'remove'
            ? current.filter(t => !delta.includes(t))
            : [...current, ...delta.filter(t => !current.includes(t))];

        // `changed` travels back to the caller -- across the socket for a player -- because
        // only this side knows it. `blacksmith.tags.changed` must not fire for adding a tag
        // a record already carries: a consumer re-rendering on the hook would do the work
        // for nothing, and the pre-delta `addTags` did not fire it either.
        if (next.length === current.length) return { tags: current, changed: false };

        const written = await this._applySetRecordTags({ contextKey, recordId, tags: next });
        return { tags: written, changed: true };
    }

    /**
     * Drop many records in one cycle.
     *
     * One write, not one per record: purging N rows through `deleteRecordTags` would be
     * N full read-modify-writes of the whole setting, which for a world with hundreds of
     * pins is the cost this write path exists to make unnecessary.
     *
     * @param {{records: Array<{contextKey: string, recordId: string}>}} params
     * @returns {Promise<number>} how many rows were actually present and removed
     */
    static async _applyPurgeRecords({ records }) {
        if (!Array.isArray(records) || records.length === 0) return 0;
        const assignments = foundry.utils.deepClone(this._getAssignments());
        const touched = new Set();
        let removed = 0;
        for (const { contextKey, recordId } of records) {
            if (!contextKey || !recordId) continue;
            if (!assignments[contextKey]?.[recordId]) continue;
            delete assignments[contextKey][recordId];
            touched.add(contextKey);
            removed++;
        }
        if (removed === 0) return 0;
        await this._putAssignments(assignments, [...touched]);
        return removed;
    }

    static async _applyDeleteRecordTags({ contextKey, recordId }) {
        const assignments = foundry.utils.deepClone(this._getAssignments());
        if (!assignments[contextKey]?.[recordId]) return false;
        delete assignments[contextKey][recordId];
        await this._putAssignments(assignments, [contextKey]);
        return true;
    }

    static async setTags(contextKey, recordId, tagArray) {
        if (!contextKey || !recordId) return;
        const tags = await this._mutate('setRecordTags', { contextKey, recordId, tags: tagArray });
        Hooks.callAll('blacksmith.tags.changed', { contextKey, recordId, tags: tags ?? [] });
    }

    static getTags(contextKey, recordId) {
        if (!contextKey || !recordId) return [];
        const assignments = this._getAssignments();
        return Array.isArray(assignments?.[contextKey]?.[recordId])
            ? [...assignments[contextKey][recordId]]
            : [];
    }

    static async addTags(contextKey, recordId, tagArray) {
        if (!contextKey || !recordId) return;
        const toAdd = normalizeTagArray(tagArray);
        if (toAdd.length === 0) return;
        const result = await this._mutate('mergeRecordTags', { contextKey, recordId, tags: toAdd, op: 'add' });
        if (result?.changed) {
            Hooks.callAll('blacksmith.tags.changed', { contextKey, recordId, tags: result.tags ?? [] });
        }
    }

    static async removeTags(contextKey, recordId, tagArray) {
        if (!contextKey || !recordId) return;
        const toRemove = normalizeTagArray(tagArray);
        if (toRemove.length === 0) return;
        const result = await this._mutate('mergeRecordTags', { contextKey, recordId, tags: toRemove, op: 'remove' });
        if (result?.changed) {
            Hooks.callAll('blacksmith.tags.changed', { contextKey, recordId, tags: result.tags ?? [] });
        }
    }

    static async deleteRecordTags(contextKey, recordId) {
        if (!contextKey || !recordId) return;
        await this._mutate('deleteRecordTags', { contextKey, recordId });
    }

    /**
     * Contribute tags to the world registry WITHOUT attaching them to a record.
     *
     * For a caller whose tags are worth offering as suggestions but whose records are not
     * the assignment store's business -- pins, whose tags live in pin data and are read
     * from there. See the Pins note in architecture-tags.md.
     */
    static async addRegistryTags(tagArray) {
        const tags = normalizeTagArray(tagArray);
        if (tags.length === 0) return;
        await this._mutate('addRegistryTags', { tags });
    }

    /**
     * Remove many records at once. Takes `[{contextKey, recordId}]` and costs one write.
     * @returns {Promise<number>} rows actually removed
     */
    static async purgeRecords(records) {
        if (!Array.isArray(records) || records.length === 0) return 0;
        return (await this._mutate('purgeRecords', { records })) ?? 0;
    }

    static getRecordsByTag(contextKey, tag) {
        if (!contextKey || !tag) return [];
        const k = normalizeTag(tag);
        const ctx = this._getAssignments()[contextKey];
        if (!ctx) return [];
        return Object.entries(ctx)
            .filter(([, tags]) => Array.isArray(tags) && tags.includes(k))
            .map(([recordId]) => recordId);
    }

    // ============================================================
    // Registry
    // ============================================================

    static _getRegistry() {
        const raw = getSettingSafely(MODULE.ID, TAG_REGISTRY_KEY, []);
        return Array.isArray(raw) ? raw : [];
    }

    static getRegistry() {
        return [...this._getRegistry()];
    }

    static async _applyAddRegistryTags({ tags }) {
        const normalized = normalizeTagArray(tags).filter(Boolean);
        if (normalized.length === 0) return [];
        const current = this._getRegistry();
        const toAdd   = normalized.filter(f => !current.includes(f));
        if (toAdd.length === 0) return current;
        const next = [...current, ...toAdd].sort();
        await game.settings.set(MODULE.ID, TAG_REGISTRY_KEY, next);
        return next;
    }

    /**
     * Adopt a whole legacy blob into a store that is still empty -- the one case where
     * writing a complete object is correct rather than a stale-snapshot overwrite.
     *
     * The emptiness check is re-done HERE, inside the queued unit, not by the caller.
     * A caller checking first and writing second is the exact read-modify-write split
     * this whole path exists to close.
     */
    static async _applyAdoptLegacyStore({ registry, assignments }) {
        if (Array.isArray(registry) && registry.length > 0 && this._getRegistry().length === 0) {
            await game.settings.set(MODULE.ID, TAG_REGISTRY_KEY, [...registry]);
        }
        if (assignments && typeof assignments === 'object'
            && Object.keys(assignments).length > 0
            && Object.keys(this._getAssignments()).length === 0) {
            await this._putAssignments(foundry.utils.deepClone(assignments), null);
        }
    }

    /**
     * Rewrite one tag across every assignment and the registry.
     *
     * Assignments and registry are two settings, so this is two writes and cannot be
     * atomic -- but running as one queued unit means no other mutation interleaves
     * between them, which is what previously let a concurrent `setTags` reintroduce
     * the old tag after the sweep had passed its record.
     */
    static async _applyRenameTag({ oldTag, newTag }) {
        const assignments = foundry.utils.deepClone(this._getAssignments());
        let updated = 0;
        for (const ctx of Object.values(assignments)) {
            for (const [recordId, tags] of Object.entries(ctx)) {
                if (!Array.isArray(tags) || !tags.includes(oldTag)) continue;
                ctx[recordId] = [...new Set(tags.map(f => f === oldTag ? newTag : f))];
                updated++;
            }
        }
        await this._putAssignments(assignments, null);

        const registry = this._getRegistry();
        await game.settings.set(
            MODULE.ID,
            TAG_REGISTRY_KEY,
            [...new Set(registry.map(f => f === oldTag ? newTag : f))].sort()
        );
        return { updated };
    }

    static async _applyDeleteTag({ tag }) {
        const assignments = foundry.utils.deepClone(this._getAssignments());
        let removed = 0;
        for (const ctx of Object.values(assignments)) {
            for (const [recordId, tags] of Object.entries(ctx)) {
                if (!Array.isArray(tags) || !tags.includes(tag)) continue;
                const next = tags.filter(f => f !== tag);
                // Deleting a record's last tag deletes the record. Leaving `[]` behind
                // would be residue every other write path prunes.
                if (next.length > 0) ctx[recordId] = next;
                else delete ctx[recordId];
                removed++;
            }
        }
        await this._putAssignments(assignments, null);

        await game.settings.set(MODULE.ID, TAG_REGISTRY_KEY, this._getRegistry().filter(f => f !== tag));
        return { removed };
    }

    static async rename(oldTag, newTag) {
        if (!game.user?.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | TAGS rename() requires GM.', '', false, false);
            return null;
        }
        const oldNorm = normalizeTag(oldTag);
        const newNorm = normalizeTag(newTag);
        if (!oldNorm || !newNorm || oldNorm === newNorm) return null;
        if (this._isProtected(oldNorm)) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | TAGS Cannot rename protected tag "${oldNorm}".`, '', false, false);
            return null;
        }

        const { updated } = await this._mutate('renameTag', { oldTag: oldNorm, newTag: newNorm });
        Hooks.callAll('blacksmith.tags.renamed', { oldTag: oldNorm, newTag: newNorm, updated });
        return { updated };
    }

    static async delete(tag) {
        if (!game.user?.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | TAGS delete() requires GM.', '', false, false);
            return null;
        }
        const k = normalizeTag(tag);
        if (!k) return null;
        if (this._isProtected(k)) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | TAGS Cannot delete protected tag "${k}".`, '', false, false);
            return null;
        }

        const { removed } = await this._mutate('deleteTag', { tag: k });

        // Visibility is user-scope, so it is this client's own data and never contends
        // with the shared write chain.
        const vis = { ...this._getVisibilityMap() };
        let visChanged = false;
        for (const key of Object.keys(vis)) {
            if (key === k || key.endsWith(`.${k}`)) { delete vis[key]; visChanged = true; }
        }
        if (visChanged) game.settings.set(MODULE.ID, TAG_VISIBILITY_KEY, vis);

        Hooks.callAll('blacksmith.tags.deleted', { tag: k, removed });
        return { removed };
    }

    static async seedRegistry(contextKey, existingTagArrays) {
        // No GM guard: the write routes through _mutate, which proxies to the GM for
        // non-GM clients. Guarding here only stopped a player-client first-run seed.
        if (!Array.isArray(existingTagArrays)) return;
        const all = [];
        for (const arr of existingTagArrays) {
            for (const f of normalizeTagArray(arr)) all.push(f);
        }
        if (all.length > 0) await this._mutate('addRegistryTags', { tags: all });
    }

    // ============================================================
    // Visibility
    // ============================================================

    static _getVisibilityMap() {
        const raw = getSettingSafely(MODULE.ID, TAG_VISIBILITY_KEY, {});
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    }

    static setVisibility(tag, visible, contextKey) {
        const k   = normalizeTag(tag);
        if (!k) return;
        const map = { ...this._getVisibilityMap() };
        const key = contextKey ? `${contextKey}.${k}` : k;
        if (visible) {
            delete map[key];
        } else {
            map[key] = false;
        }
        game.settings.set(MODULE.ID, TAG_VISIBILITY_KEY, map);
    }

    static getVisibility(tag, contextKey) {
        const k   = normalizeTag(tag);
        const map = this._getVisibilityMap();
        if (contextKey) {
            const ctxKey = `${contextKey}.${k}`;
            if (ctxKey in map) return !!map[ctxKey];
        }
        if (k in map) return !!map[k];
        return true;
    }

    // ============================================================
    // One-time migration from pin tag system
    // ============================================================

    static async runMigration() {
        if (!game.user?.isGM) return;

        // Accept either the new sentinel or the old 'flagsMigrationComplete' (worlds that ran before rename)
        const alreadyDone = getSettingSafely(MODULE.ID, TAG_MIGRATION_KEY, false)
            || getSettingSafely(MODULE.ID, 'flagsMigrationComplete', false);

        if (alreadyDone) {
            // If done under old key name, copy existing data to new keys and set new sentinel
            if (!getSettingSafely(MODULE.ID, TAG_MIGRATION_KEY, false)) {
                await this._mutate('adoptLegacyStore', {
                    registry:    getSettingSafely(MODULE.ID, 'flagRegistry', []),
                    assignments: getSettingSafely(MODULE.ID, 'flagAssignments', {})
                });
                await game.settings.set(MODULE.ID, TAG_MIGRATION_KEY, true);
            }
            return;
        }

        try {
            const pinRegistry = getSettingSafely(MODULE.ID, 'pinTagRegistry', []);
            if (Array.isArray(pinRegistry) && pinRegistry.length > 0) {
                await this._mutate('addRegistryTags', { tags: pinRegistry });
            }
            await game.settings.set(MODULE.ID, TAG_MIGRATION_KEY, true);
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | TAGS Migration failed.', err?.message || err, false, true);
        }
    }

    // ============================================================
    // GM Proxy
    // ============================================================

    static async _requestGM(action, params) {
        if (game.user?.isGM) {
            return this._executeGMAction(action, params);
        }

        const gms = game.users?.filter(u => u.isGM && u.active) || [];
        if (gms.length === 0) throw new Error('No GM is currently online to process this tag request.');

        const { SocketManager } = await import('./manager-sockets.js');
        await SocketManager.waitForReady();
        const socket = SocketManager.getSocket();
        if (!socket) throw new Error('Socket system not available for tags GM proxy.');

        if (!this._gmProxyRegistered && socket.register) {
            socket.register(GM_PROXY_HANDLER, async (data) => TagManager._handleGMProxy(data));
            this._gmProxyRegistered = true;
        }

        if (socket.executeAsGM) {
            const result = await socket.executeAsGM(GM_PROXY_HANDLER, { action, params });
            if (result?.error) throw new Error(result.error);
            return result?.data;
        } else {
            socket.emit(GM_PROXY_HANDLER, { action, params });
            throw new Error('Tags GM proxy requires SocketLib with executeAsGM support.');
        }
    }

    static async _handleGMProxy({ action, params }) {
        try {
            const result = await this._executeGMAction(action, params);
            return { data: result };
        } catch (err) {
            return { error: err?.message || String(err) };
        }
    }

    /**
     * Execute a proxied mutation GM-side.
     *
     * The payload is a DELTA, never a finished settings object: the GM reads current
     * data and applies the change itself, so a player's stale snapshot can no longer
     * overwrite concurrent edits. Queued for the same reason local writes are --
     * several players' requests can arrive together.
     */
    static async _executeGMAction(action, params) {
        return this._enqueue(() => this._applyMutation(action, params));
    }

    static async registerGMProxy() {
        try {
            const { SocketManager } = await import('./manager-sockets.js');
            await SocketManager.waitForReady();
            const socket = SocketManager.getSocket();
            if (socket?.register && !this._gmProxyRegistered) {
                socket.register(GM_PROXY_HANDLER, async (data) => TagManager._handleGMProxy(data));
                this._gmProxyRegistered = true;
            }
        } catch (_) {
            // Socket not available yet; lazy registration in _requestGM() will handle it
        }
    }

    // ============================================================
    // Availability
    // ============================================================

    static isAvailable() {
        return !!(game.modules.get(MODULE.ID)?.api?.tags);
    }
}
