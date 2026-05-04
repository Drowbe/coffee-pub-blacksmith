// ==================================================================
// ===== MANAGER-FLAGS – Unified flag registry, taxonomy, CRUD =====
// ==================================================================
// Central labeling infrastructure. Any coffee-pub module can register
// a taxonomy and attach flags to records via the central assignment
// store. See documentation/architecture/architecture-flags.md.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { normalizePinGroup } from './pins-schema.js';

// ----------------------------------------------------------------
// Setting keys
// ----------------------------------------------------------------
const FLAG_ASSIGNMENTS_KEY = 'flagAssignments';
const FLAG_REGISTRY_KEY    = 'flagRegistry';
const FLAG_VISIBILITY_KEY  = 'flagVisibility';
const FLAG_MIGRATION_KEY   = 'flagsMigrationComplete';

// SocketLib handler name for the GM proxy
const GM_PROXY_HANDLER = 'blacksmith-flags-gm-proxy';

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

/** Normalize a single flag string: lowercase, spaces → hyphens. */
function normalizeFlag(value) {
    return normalizePinGroup(value);
}

/** Normalize an array of raw flag values. Deduplicates and filters empties. */
function normalizeFlagArray(input) {
    const arr = Array.isArray(input)
        ? input
        : (typeof input === 'string' ? input.split(',') : []);
    const seen = new Set();
    const result = [];
    for (const raw of arr) {
        const k = normalizeFlag(raw);
        if (k && !seen.has(k)) { seen.add(k); result.push(k); }
    }
    return result;
}

// ----------------------------------------------------------------
// FlagManager
// ----------------------------------------------------------------

export class FlagManager {

    // In-memory taxonomy registries
    static _builtinRegistry  = new Map(); // contextKey → { label, flags: [{key, protected}] }
    static _overrideRegistry = new Map();
    static _runtimeRegistry  = new Map();
    static _globalFlags      = [];        // From "globalFlags" in taxonomy JSON

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
                this._globalFlags = [];
                // Load the new unified taxonomy
                await this._loadTaxonomyJson(
                    `modules/${MODULE.ID}/resources/flag-taxonomy.json`,
                    this._builtinRegistry
                );
                // Compatibility: also load pin-taxonomy.json contexts so pins data stays available
                await this._loadPinTaxonomyCompat();
                // Load optional override JSON
                const overridePath = String(getSettingSafely(MODULE.ID, 'flagTaxonomyOverrideJson', '') || '').trim();
                if (overridePath) {
                    await this._loadTaxonomyJson(overridePath, this._overrideRegistry).catch(() => {});
                }
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | FLAGS Failed to load flag taxonomy.', err?.message || err, false, true);
            } finally {
                this._taxonomyLoaded      = true;
                this._taxonomyLoadPromise = null;
            }
        })();
        await this._taxonomyLoadPromise;
    }

    /** Load flag-taxonomy.json (v1 format: { version, globalFlags, contexts }). */
    static async _loadTaxonomyJson(path, registry) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load flag taxonomy from ${path}: ${response.status}`);
        const payload = await response.json();

        if (Array.isArray(payload?.globalFlags)) {
            for (const raw of payload.globalFlags) {
                const k = normalizeFlag(raw);
                if (k && !this._globalFlags.includes(k)) this._globalFlags.push(k);
            }
        }

        if (payload?.contexts && typeof payload.contexts === 'object') {
            for (const [contextKey, entry] of Object.entries(payload.contexts)) {
                if (!contextKey || typeof contextKey !== 'string') continue;
                const flags = Array.isArray(entry?.flags)
                    ? entry.flags
                        .filter(f => f && (typeof f === 'string' || typeof f?.key === 'string'))
                        .map(f => typeof f === 'string'
                            ? { key: normalizeFlag(f), protected: false }
                            : { key: normalizeFlag(f.key), protected: !!f.protected })
                        .filter(f => f.key)
                    : [];
                registry.set(contextKey, {
                    label: (typeof entry?.label === 'string' && entry.label.trim()) ? entry.label.trim() : '',
                    flags
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

            // v3 format: modules.{moduleId}.pinCategories.{type}
            if (payload?.modules && typeof payload.modules === 'object') {
                for (const [moduleId, moduleEntry] of Object.entries(payload.modules)) {
                    const cats = moduleEntry?.pinCategories;
                    if (!cats || typeof cats !== 'object') continue;
                    for (const [type, entry] of Object.entries(cats)) {
                        const contextKey = `${moduleId}.${type}`;
                        // Don't overwrite if already defined in flag-taxonomy.json
                        if (this._builtinRegistry.has(contextKey)) continue;
                        const flags = Array.isArray(entry?.tags)
                            ? entry.tags.map(t => ({ key: normalizeFlag(t), protected: false })).filter(f => f.key)
                            : [];
                        this._builtinRegistry.set(contextKey, {
                            label: (typeof entry?.label === 'string' && entry.label.trim()) ? entry.label.trim() : '',
                            flags
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
        this._globalFlags = [];
    }

    /**
     * Register or merge a taxonomy entry at runtime.
     * Use this as a convenience path; flag-taxonomy.json is the canonical source.
     * @param {string} contextKey
     * @param {{ label?: string, flags: Array<string | {key: string, protected?: boolean}> }} taxonomy
     */
    static register(contextKey, taxonomy = {}) {
        if (!contextKey || typeof contextKey !== 'string') return;
        const flags = Array.isArray(taxonomy?.flags)
            ? taxonomy.flags
                .filter(f => f && (typeof f === 'string' || typeof f?.key === 'string'))
                .map(f => typeof f === 'string'
                    ? { key: normalizeFlag(f), protected: false }
                    : { key: normalizeFlag(f.key), protected: !!f.protected })
                .filter(f => f.key)
            : [];
        const existing = this._runtimeRegistry.get(contextKey);
        if (existing) {
            // Merge: runtime entries that already exist win on collision
            const existingKeys = new Set(existing.flags.map(f => f.key));
            const merged = [...existing.flags];
            for (const f of flags) if (!existingKeys.has(f.key)) merged.push(f);
            this._runtimeRegistry.set(contextKey, {
                label: taxonomy.label || existing.label,
                flags: merged
            });
        } else {
            this._runtimeRegistry.set(contextKey, {
                label: (typeof taxonomy.label === 'string' && taxonomy.label.trim()) ? taxonomy.label.trim() : '',
                flags
            });
        }
        Hooks.callAll('blacksmith.flags.registered', { contextKey, taxonomy });
    }

    /** Merge builtin, override, and runtime entries for a context key. */
    static _mergeTaxonomy(contextKey) {
        const builtin  = this._builtinRegistry.get(contextKey);
        const override = this._overrideRegistry.get(contextKey);
        const runtime  = this._runtimeRegistry.get(contextKey);
        if (!builtin && !override && !runtime) return null;

        const flagMap = new Map();
        for (const source of [builtin, override, runtime]) {
            if (!source) continue;
            for (const f of source.flags ?? []) {
                flagMap.set(f.key, f); // later sources win
            }
        }
        const label = (runtime?.label || override?.label || builtin?.label) ?? '';
        return { label, flags: [...flagMap.values()] };
    }

    /**
     * Get the merged flag list for a context, including global flags.
     * Returns objects with { key, label, protected, tier }.
     * @param {string} contextKey
     * @returns {Array<{key: string, label: string, protected: boolean, tier: 'taxonomy'|'global'}>}
     */
    static getChoices(contextKey) {
        const taxonomy = this._mergeTaxonomy(contextKey);
        const taxonomyKeys = new Set();
        const result = [];

        for (const f of taxonomy?.flags ?? []) {
            if (!f.key) continue;
            taxonomyKeys.add(f.key);
            result.push({
                key: f.key,
                label: f.key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                protected: !!f.protected,
                tier: 'taxonomy'
            });
        }
        for (const k of this._globalFlags) {
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

    /** Normalize a flag string or array. */
    static normalize(input) {
        if (typeof input === 'string') return normalizeFlag(input);
        return normalizeFlagArray(input);
    }

    // ============================================================
    // Protected flag check
    // ============================================================

    /** Returns true if the flag is marked protected in any taxonomy registry. */
    static _isProtected(flag) {
        const k = normalizeFlag(flag);
        for (const registry of [this._builtinRegistry, this._overrideRegistry, this._runtimeRegistry]) {
            for (const [, entry] of registry) {
                if (entry.flags?.some(f => f.key === k && f.protected)) return true;
            }
        }
        return false;
    }

    // ============================================================
    // Central assignment store
    // ============================================================

    static _getAssignments() {
        const raw = getSettingSafely(MODULE.ID, FLAG_ASSIGNMENTS_KEY, {});
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    }

    static async _writeAssignments(data) {
        if (game.user?.isGM) {
            await game.settings.set(MODULE.ID, FLAG_ASSIGNMENTS_KEY, data);
        } else {
            await this._requestGM('writeAssignments', { data });
        }
    }

    /**
     * Replace the flag set for a record.
     * @param {string} contextKey
     * @param {string} recordId
     * @param {string[]} flagArray
     */
    static async setFlags(contextKey, recordId, flagArray) {
        if (!contextKey || !recordId) return;
        const normalized = normalizeFlagArray(flagArray);
        const assignments = foundry.utils.deepClone(this._getAssignments());
        if (!assignments[contextKey]) assignments[contextKey] = {};
        if (normalized.length > 0) {
            assignments[contextKey][recordId] = normalized;
        } else {
            delete assignments[contextKey][recordId];
        }
        await this._writeAssignments(assignments);
        if (normalized.length > 0) await this._addToRegistry(normalized);
        Hooks.callAll('blacksmith.flags.changed', { contextKey, recordId, flags: normalized });
    }

    /**
     * Get the current flags for a record.
     * @param {string} contextKey
     * @param {string} recordId
     * @returns {string[]}
     */
    static getFlags(contextKey, recordId) {
        if (!contextKey || !recordId) return [];
        const assignments = this._getAssignments();
        return Array.isArray(assignments?.[contextKey]?.[recordId])
            ? [...assignments[contextKey][recordId]]
            : [];
    }

    /**
     * Add flags to a record without replacing existing flags.
     * @param {string} contextKey
     * @param {string} recordId
     * @param {string[]} flagArray
     */
    static async addFlags(contextKey, recordId, flagArray) {
        const current = this.getFlags(contextKey, recordId);
        const toAdd   = normalizeFlagArray(flagArray).filter(f => !current.includes(f));
        if (toAdd.length === 0) return;
        await this.setFlags(contextKey, recordId, [...current, ...toAdd]);
    }

    /**
     * Remove specific flags from a record.
     * @param {string} contextKey
     * @param {string} recordId
     * @param {string[]} flagArray
     */
    static async removeFlags(contextKey, recordId, flagArray) {
        const remove  = new Set(normalizeFlagArray(flagArray));
        const current = this.getFlags(contextKey, recordId).filter(f => !remove.has(f));
        await this.setFlags(contextKey, recordId, current);
    }

    /**
     * Remove all flag data for a record. Call when the record is deleted.
     * @param {string} contextKey
     * @param {string} recordId
     */
    static async deleteRecordFlags(contextKey, recordId) {
        if (!contextKey || !recordId) return;
        const assignments = foundry.utils.deepClone(this._getAssignments());
        if (!assignments[contextKey]?.[recordId]) return;
        delete assignments[contextKey][recordId];
        if (Object.keys(assignments[contextKey]).length === 0) delete assignments[contextKey];
        await this._writeAssignments(assignments);
    }

    /**
     * Get all record IDs in a context that have a specific flag.
     * @param {string} contextKey
     * @param {string} flag
     * @returns {string[]}
     */
    static getRecordsByFlag(contextKey, flag) {
        if (!contextKey || !flag) return [];
        const k = normalizeFlag(flag);
        const ctx = this._getAssignments()[contextKey];
        if (!ctx) return [];
        return Object.entries(ctx)
            .filter(([, flags]) => Array.isArray(flags) && flags.includes(k))
            .map(([recordId]) => recordId);
    }

    // ============================================================
    // Registry
    // ============================================================

    static _getRegistry() {
        const raw = getSettingSafely(MODULE.ID, FLAG_REGISTRY_KEY, []);
        return Array.isArray(raw) ? raw : [];
    }

    static async _writeRegistry(flags) {
        if (game.user?.isGM) {
            await game.settings.set(MODULE.ID, FLAG_REGISTRY_KEY, flags);
        } else {
            await this._requestGM('writeRegistry', { flags });
        }
    }

    /** Get the full world flag list (sorted copy). */
    static getRegistry() {
        return [...this._getRegistry()];
    }

    static async _addToRegistry(flags) {
        const normalized = normalizeFlagArray(flags).filter(Boolean);
        if (normalized.length === 0) return;
        const current = this._getRegistry();
        const toAdd   = normalized.filter(f => !current.includes(f));
        if (toAdd.length === 0) return;
        await this._writeRegistry([...current, ...toAdd].sort());
    }

    /**
     * Rename a flag globally. Updates all assignment records and the registry.
     * GM only. Silently rejected for protected flags.
     * @param {string} oldFlag
     * @param {string} newFlag
     * @returns {Promise<{updated: number}|null>}
     */
    static async rename(oldFlag, newFlag) {
        if (!game.user?.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | FLAGS rename() requires GM.', '', false, false);
            return null;
        }
        const oldNorm = normalizeFlag(oldFlag);
        const newNorm = normalizeFlag(newFlag);
        if (!oldNorm || !newNorm || oldNorm === newNorm) return null;
        if (this._isProtected(oldNorm)) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | FLAGS Cannot rename protected flag "${oldNorm}".`, '', false, false);
            return null;
        }

        const assignments = foundry.utils.deepClone(this._getAssignments());
        let updated = 0;
        for (const ctx of Object.values(assignments)) {
            for (const [recordId, flags] of Object.entries(ctx)) {
                if (!Array.isArray(flags) || !flags.includes(oldNorm)) continue;
                ctx[recordId] = [...new Set(flags.map(f => f === oldNorm ? newNorm : f))];
                updated++;
            }
        }
        await this._writeAssignments(assignments);

        const registry = this._getRegistry();
        const updatedRegistry = [...new Set(registry.map(f => f === oldNorm ? newNorm : f))].sort();
        await this._writeRegistry(updatedRegistry);

        Hooks.callAll('blacksmith.flags.renamed', { oldFlag: oldNorm, newFlag: newNorm, updated });
        return { updated };
    }

    /**
     * Delete a flag globally. Strips from all records and removes from registry.
     * GM only. Silently rejected for protected flags.
     * @param {string} flag
     * @returns {Promise<{removed: number}|null>}
     */
    static async delete(flag) {
        if (!game.user?.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | FLAGS delete() requires GM.', '', false, false);
            return null;
        }
        const k = normalizeFlag(flag);
        if (!k) return null;
        if (this._isProtected(k)) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | FLAGS Cannot delete protected flag "${k}".`, '', false, false);
            return null;
        }

        const assignments = foundry.utils.deepClone(this._getAssignments());
        let removed = 0;
        for (const ctx of Object.values(assignments)) {
            for (const [recordId, flags] of Object.entries(ctx)) {
                if (!Array.isArray(flags) || !flags.includes(k)) continue;
                ctx[recordId] = flags.filter(f => f !== k);
                removed++;
            }
        }
        await this._writeAssignments(assignments);

        const registry = this._getRegistry().filter(f => f !== k);
        await this._writeRegistry(registry);

        // Also clean visibility map
        const vis = { ...this._getVisibilityMap() };
        let visChanged = false;
        for (const key of Object.keys(vis)) {
            if (key === k || key.endsWith(`.${k}`)) { delete vis[key]; visChanged = true; }
        }
        if (visChanged) game.settings.set(MODULE.ID, FLAG_VISIBILITY_KEY, vis);

        Hooks.callAll('blacksmith.flags.deleted', { flag: k, removed });
        return { removed };
    }

    /**
     * Seed the registry from a flat list of flag arrays (e.g., from existing records on first load).
     * @param {string} contextKey - Used for logging only
     * @param {string[][]} existingFlagArrays
     */
    static async seedRegistry(contextKey, existingFlagArrays) {
        if (!game.user?.isGM) return;
        if (!Array.isArray(existingFlagArrays)) return;
        const all = [];
        for (const arr of existingFlagArrays) {
            for (const f of normalizeFlagArray(arr)) all.push(f);
        }
        if (all.length > 0) await this._addToRegistry(all);
    }

    // ============================================================
    // Visibility
    // ============================================================

    static _getVisibilityMap() {
        const raw = getSettingSafely(MODULE.ID, FLAG_VISIBILITY_KEY, {});
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    }

    /**
     * Set visibility for a flag. If contextKey is provided, sets a context-specific override.
     * Visibility defaults to true, so setting visible=true removes the entry rather than storing it.
     * @param {string} flag
     * @param {boolean} visible
     * @param {string} [contextKey]
     */
    static setVisibility(flag, visible, contextKey) {
        const k   = normalizeFlag(flag);
        if (!k) return;
        const map = { ...this._getVisibilityMap() };
        const key = contextKey ? `${contextKey}.${k}` : k;
        if (visible) {
            delete map[key]; // default is visible; remove entry to restore default
        } else {
            map[key] = false;
        }
        game.settings.set(MODULE.ID, FLAG_VISIBILITY_KEY, map);
    }

    /**
     * Get effective visibility for a flag.
     * Resolution: context override → global default → true.
     * @param {string} flag
     * @param {string} [contextKey]
     * @returns {boolean}
     */
    static getVisibility(flag, contextKey) {
        const k   = normalizeFlag(flag);
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

    /**
     * Run the one-time migration from the pin tag registry.
     * Seeds flagRegistry from pinTagRegistry if flagsMigrationComplete is not set.
     * Idempotent — safe to call on every init; noop after first run.
     */
    static async runMigration() {
        if (!game.user?.isGM) return;
        const done = getSettingSafely(MODULE.ID, FLAG_MIGRATION_KEY, false);
        if (done) return;

        try {
            // Seed flagRegistry from pinTagRegistry
            const pinRegistry = getSettingSafely(MODULE.ID, 'pinTagRegistry', []);
            if (Array.isArray(pinRegistry) && pinRegistry.length > 0) {
                await this._addToRegistry(pinRegistry);
            }
            await game.settings.set(MODULE.ID, FLAG_MIGRATION_KEY, true);
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | FLAGS Migration failed.', err?.message || err, false, true);
        }
    }

    // ============================================================
    // GM Proxy
    // ============================================================

    /**
     * Route a write action through the GM when the current user is not a GM.
     * Actions: 'writeAssignments', 'writeRegistry'
     */
    static async _requestGM(action, params) {
        if (game.user?.isGM) {
            return this._executeGMAction(action, params);
        }

        const gms = game.users?.filter(u => u.isGM && u.active) || [];
        if (gms.length === 0) throw new Error('No GM is currently online to process this flag request.');

        const { SocketManager } = await import('./manager-sockets.js');
        await SocketManager.waitForReady();
        const socket = SocketManager.getSocket();
        if (!socket) throw new Error('Socket system not available for flags GM proxy.');

        if (!this._gmProxyRegistered && socket.register) {
            socket.register(GM_PROXY_HANDLER, async (data) => FlagManager._handleGMProxy(data));
            this._gmProxyRegistered = true;
        }

        if (socket.executeAsGM) {
            const result = await socket.executeAsGM(GM_PROXY_HANDLER, { action, params });
            if (result?.error) throw new Error(result.error);
            return result?.data;
        } else {
            socket.emit(GM_PROXY_HANDLER, { action, params });
            throw new Error('Flags GM proxy requires SocketLib with executeAsGM support.');
        }
    }

    /** GM-side handler for the socket proxy. */
    static async _handleGMProxy({ action, params }) {
        try {
            const result = await this._executeGMAction(action, params);
            return { data: result };
        } catch (err) {
            return { error: err?.message || String(err) };
        }
    }

    /** Execute a GM-only write action directly. */
    static async _executeGMAction(action, params) {
        switch (action) {
            case 'writeAssignments':
                await game.settings.set(MODULE.ID, FLAG_ASSIGNMENTS_KEY, params.data);
                return;
            case 'writeRegistry':
                await game.settings.set(MODULE.ID, FLAG_REGISTRY_KEY, params.flags);
                return;
            default:
                throw new Error(`Unknown flags GM proxy action: ${action}`);
        }
    }

    /**
     * Register the GM proxy socket handler early (during init, before any non-GM call).
     * Mirrors the early registration pattern used by PinManager.
     */
    static async registerGMProxy() {
        try {
            const { SocketManager } = await import('./manager-sockets.js');
            await SocketManager.waitForReady();
            const socket = SocketManager.getSocket();
            if (socket?.register && !this._gmProxyRegistered) {
                socket.register(GM_PROXY_HANDLER, async (data) => FlagManager._handleGMProxy(data));
                this._gmProxyRegistered = true;
            }
        } catch (_) {
            // Socket not available yet; lazy registration in _requestGM() will handle it
        }
    }

    // ============================================================
    // Availability
    // ============================================================

    /** Returns true when the FlagsAPI is exposed on module.api. */
    static isAvailable() {
        return !!(game.modules.get(MODULE.ID)?.api?.flags);
    }
}
