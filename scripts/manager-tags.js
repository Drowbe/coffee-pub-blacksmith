// ==================================================================
// ===== MANAGER-TAGS – Unified tag registry, taxonomy, CRUD =======
// ==================================================================
// Central labeling infrastructure. Any coffee-pub module can register
// a taxonomy and attach tags to records via the central assignment
// store. See documentation/architecture/architecture-tags.md.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { normalizePinGroup } from './pins-schema.js';

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
                const tags = Array.isArray(entry?.flags)
                    ? entry.flags
                        .filter(f => f && (typeof f === 'string' || typeof f?.key === 'string'))
                        .map(f => typeof f === 'string'
                            ? { key: normalizeTag(f), protected: false }
                            : { key: normalizeTag(f.key), protected: !!f.protected })
                        .filter(f => f.key)
                    : [];
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
                        const tags = Array.isArray(entry?.tags)
                            ? entry.tags.map(t => ({ key: normalizeTag(t), protected: false })).filter(f => f.key)
                            : [];
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
     * Register or merge a taxonomy entry at runtime.
     * Prefer adding entries to tag-taxonomy.json for shipped modules.
     * @param {string} contextKey
     * @param {{ label?: string, tags: Array<string | {key: string, protected?: boolean}> }} taxonomy
     */
    static register(contextKey, taxonomy = {}) {
        if (!contextKey || typeof contextKey !== 'string') return;
        const tags = Array.isArray(taxonomy?.tags)
            ? taxonomy.tags
                .filter(f => f && (typeof f === 'string' || typeof f?.key === 'string'))
                .map(f => typeof f === 'string'
                    ? { key: normalizeTag(f), protected: false }
                    : { key: normalizeTag(f.key), protected: !!f.protected })
                .filter(f => f.key)
            : [];
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
    // Central assignment store
    // ============================================================

    static _getAssignments() {
        const raw = getSettingSafely(MODULE.ID, TAG_ASSIGNMENTS_KEY, {});
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    }

    static async _writeAssignments(data) {
        if (game.user?.isGM) {
            await game.settings.set(MODULE.ID, TAG_ASSIGNMENTS_KEY, data);
        } else {
            await this._requestGM('writeAssignments', { data });
        }
    }

    static async setTags(contextKey, recordId, tagArray) {
        if (!contextKey || !recordId) return;
        const normalized = normalizeTagArray(tagArray);
        const assignments = foundry.utils.deepClone(this._getAssignments());
        if (!assignments[contextKey]) assignments[contextKey] = {};
        if (normalized.length > 0) {
            assignments[contextKey][recordId] = normalized;
        } else {
            delete assignments[contextKey][recordId];
        }
        await this._writeAssignments(assignments);
        if (normalized.length > 0) await this._addToRegistry(normalized);
        Hooks.callAll('blacksmith.tags.changed', { contextKey, recordId, tags: normalized });
    }

    static getTags(contextKey, recordId) {
        if (!contextKey || !recordId) return [];
        const assignments = this._getAssignments();
        return Array.isArray(assignments?.[contextKey]?.[recordId])
            ? [...assignments[contextKey][recordId]]
            : [];
    }

    static async addTags(contextKey, recordId, tagArray) {
        const current = this.getTags(contextKey, recordId);
        const toAdd   = normalizeTagArray(tagArray).filter(f => !current.includes(f));
        if (toAdd.length === 0) return;
        await this.setTags(contextKey, recordId, [...current, ...toAdd]);
    }

    static async removeTags(contextKey, recordId, tagArray) {
        const remove  = new Set(normalizeTagArray(tagArray));
        const current = this.getTags(contextKey, recordId).filter(f => !remove.has(f));
        await this.setTags(contextKey, recordId, current);
    }

    static async deleteRecordTags(contextKey, recordId) {
        if (!contextKey || !recordId) return;
        const assignments = foundry.utils.deepClone(this._getAssignments());
        if (!assignments[contextKey]?.[recordId]) return;
        delete assignments[contextKey][recordId];
        if (Object.keys(assignments[contextKey]).length === 0) delete assignments[contextKey];
        await this._writeAssignments(assignments);
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

    static async _writeRegistry(tags) {
        if (game.user?.isGM) {
            await game.settings.set(MODULE.ID, TAG_REGISTRY_KEY, tags);
        } else {
            await this._requestGM('writeRegistry', { tags });
        }
    }

    static getRegistry() {
        return [...this._getRegistry()];
    }

    static async _addToRegistry(tags) {
        const normalized = normalizeTagArray(tags).filter(Boolean);
        if (normalized.length === 0) return;
        const current = this._getRegistry();
        const toAdd   = normalized.filter(f => !current.includes(f));
        if (toAdd.length === 0) return;
        await this._writeRegistry([...current, ...toAdd].sort());
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

        const assignments = foundry.utils.deepClone(this._getAssignments());
        let updated = 0;
        for (const ctx of Object.values(assignments)) {
            for (const [recordId, tags] of Object.entries(ctx)) {
                if (!Array.isArray(tags) || !tags.includes(oldNorm)) continue;
                ctx[recordId] = [...new Set(tags.map(f => f === oldNorm ? newNorm : f))];
                updated++;
            }
        }
        await this._writeAssignments(assignments);

        const registry = this._getRegistry();
        const updatedRegistry = [...new Set(registry.map(f => f === oldNorm ? newNorm : f))].sort();
        await this._writeRegistry(updatedRegistry);

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

        const assignments = foundry.utils.deepClone(this._getAssignments());
        let removed = 0;
        for (const ctx of Object.values(assignments)) {
            for (const [recordId, tags] of Object.entries(ctx)) {
                if (!Array.isArray(tags) || !tags.includes(k)) continue;
                ctx[recordId] = tags.filter(f => f !== k);
                removed++;
            }
        }
        await this._writeAssignments(assignments);

        const registry = this._getRegistry().filter(f => f !== k);
        await this._writeRegistry(registry);

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
        if (!game.user?.isGM) return;
        if (!Array.isArray(existingTagArrays)) return;
        const all = [];
        for (const arr of existingTagArrays) {
            for (const f of normalizeTagArray(arr)) all.push(f);
        }
        if (all.length > 0) await this._addToRegistry(all);
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
                const oldRegistry = getSettingSafely(MODULE.ID, 'flagRegistry', []);
                if (Array.isArray(oldRegistry) && oldRegistry.length > 0 && this._getRegistry().length === 0) {
                    await this._writeRegistry(oldRegistry);
                }
                const oldAssignments = getSettingSafely(MODULE.ID, 'flagAssignments', {});
                if (typeof oldAssignments === 'object' && Object.keys(oldAssignments).length > 0
                    && Object.keys(this._getAssignments()).length === 0) {
                    await this._writeAssignments(oldAssignments);
                }
                await game.settings.set(MODULE.ID, TAG_MIGRATION_KEY, true);
            }
            return;
        }

        try {
            const pinRegistry = getSettingSafely(MODULE.ID, 'pinTagRegistry', []);
            if (Array.isArray(pinRegistry) && pinRegistry.length > 0) {
                await this._addToRegistry(pinRegistry);
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

    static async _executeGMAction(action, params) {
        switch (action) {
            case 'writeAssignments':
                await game.settings.set(MODULE.ID, TAG_ASSIGNMENTS_KEY, params.data);
                return;
            case 'writeRegistry':
                await game.settings.set(MODULE.ID, TAG_REGISTRY_KEY, params.tags);
                return;
            default:
                throw new Error(`Unknown tags GM proxy action: ${action}`);
        }
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
