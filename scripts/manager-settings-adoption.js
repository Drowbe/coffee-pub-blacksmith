// ==================================================================
// ===== MANAGER-SETTINGS-ADOPTION - adopt a satellite's settings ====
// ==================================================================
//
// When a feature moves out of a sibling module and into Blacksmith, its
// settings have to come with it or the user silently loses whatever they had
// configured -- and for the settings that hold data rather than preferences,
// that is their content, not their taste.
//
// Blacksmith owns this rather than the departing module because the departing
// module can only migrate if the user happens to install the one release that
// carries the migration before removing it, and nothing guarantees that
// ordering. Reading the old key from here is order-independent: it works
// whether the sibling is still installed, was skipped over, or is already gone.
//
// Adoption is one-way and one-shot. It never writes back to the source and
// never runs twice for the same key, so a user who deliberately changes an
// adopted value does not have it overwritten on the next load.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

// ==================================================================
// ===== THE TABLE ==================================================
// ==================================================================

/**
 * One row per setting being adopted.
 *
 * `scope` is the scope the setting has in BOTH modules -- adoption does not
 * change a setting's scope, because scope decides who owns the value and
 * changing it mid-migration would move the value to a different owner. Any row
 * whose two scopes disagree is a design error, not something to paper over here.
 *
 * @type {Array<{fromModule: string, fromKey: string, toKey: string, scope: 'world'|'user'|'client'}>}
 */
const ADOPTIONS = [
    // --- Dice Tray (adopted from Squire) ---
    { fromModule: 'coffee-pub-squire', fromKey: 'diceTrayShowRecentRolls', toKey: 'diceTrayShowRecentRolls', scope: 'client' },

    // --- Macros (adopted from Squire). These two hold data, not preferences. ---
    { fromModule: 'coffee-pub-squire', fromKey: 'userMacros', toKey: 'userMacros', scope: 'user' },
    { fromModule: 'coffee-pub-squire', fromKey: 'userFavoriteMacros', toKey: 'userFavoriteMacros', scope: 'client' },

    // --- Health (adopted from Squire) ---
    { fromModule: 'coffee-pub-squire', fromKey: 'showHealthMenubarTool', toKey: 'showHealthMenubarTool', scope: 'user' },
    { fromModule: 'coffee-pub-squire', fromKey: 'healthAdjustmentAmount', toKey: 'healthAdjustmentAmount', scope: 'client' },
    { fromModule: 'coffee-pub-squire', fromKey: 'healthThresholdInjured', toKey: 'healthThresholdInjured', scope: 'world' },
    { fromModule: 'coffee-pub-squire', fromKey: 'healthThresholdBloodied', toKey: 'healthThresholdBloodied', scope: 'world' },
    { fromModule: 'coffee-pub-squire', fromKey: 'healthThresholdCritical', toKey: 'healthThresholdCritical', scope: 'world' }
];

/** localStorage key holding the adopted-row list for `client` scope. */
const CLIENT_LEDGER_KEY = 'blacksmith-adopted-settings';

export class SettingsAdoptionManager {

    // ==============================================================
    // ===== READING THE SOURCE =====================================
    // ==============================================================

    /**
     * Read a setting belonging to another module.
     *
     * Two paths, because the sibling may or may not still be installed. When it
     * is, its setting is registered and `game.settings.get` applies the
     * registered type and default. When it is not, `game.settings.get` throws
     * on the unregistered key, so the value has to come off the raw store --
     * which is where it still is, because uninstalling a module does not delete
     * its settings.
     *
     * @returns {any|undefined} undefined when the source has no stored value
     */
    static _readSource({ fromModule, fromKey, scope }) {
        const settingId = `${fromModule}.${fromKey}`;

        // Preferred path: the sibling is installed and the setting is registered.
        if (game.settings?.settings?.has?.(settingId)) {
            try {
                return game.settings.get(fromModule, fromKey);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Settings adoption: registered read failed, falling back to raw store', { settingId, error: error?.message ?? error }, true, false);
            }
        }

        // Fallback: read the stored Setting directly. `world` and `user` share one
        // store (client-settings.mjs:42-46); user-scoped rows are distinguished by
        // the user id, world-scoped ones carry null.
        try {
            if (scope === 'client') {
                const raw = game.settings?.storage?.get?.('client')?.getItem?.(settingId);
                if (raw === null || raw === undefined) return undefined;
                // Client storage holds the serialised form; the Setting document
                // would normally do this parse via its JSONField.
                return JSON.parse(raw);
            }
            const userId = scope === 'user' ? game.userId : null;
            // `.value` is a JSONField, so it comes back already parsed.
            return game.settings?.storage?.get?.('world')?.getSetting?.(settingId, userId)?.value ?? undefined;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Settings adoption: raw store read failed', { settingId, error: error?.message ?? error }, true, false);
            return undefined;
        }
    }

    // ==============================================================
    // ===== THE LEDGER =============================================
    // ==============================================================
    //
    // One ledger per scope, because "has this been adopted" has a different
    // answer for different people. A world setting is adopted once for the
    // whole world; a user setting is adopted once per user, since each user has
    // their own value and can only write their own; a client setting is adopted
    // once per browser, because that is where it lives.

    /** @returns {Set<string>} row ids already adopted at this scope, for this user/browser. */
    static _readLedger(scope) {
        try {
            if (scope === 'client') {
                const raw = localStorage.getItem(CLIENT_LEDGER_KEY);
                return new Set(raw ? JSON.parse(raw) : []);
            }
            const key = scope === 'user' ? 'adoptedSettingsUser' : 'adoptedSettingsWorld';
            return new Set(game.settings.get(MODULE.ID, key) ?? []);
        } catch (_) {
            return new Set();
        }
    }

    static async _writeLedger(scope, ledger) {
        const list = [...ledger];
        try {
            if (scope === 'client') {
                localStorage.setItem(CLIENT_LEDGER_KEY, JSON.stringify(list));
                return;
            }
            const key = scope === 'user' ? 'adoptedSettingsUser' : 'adoptedSettingsWorld';
            await game.settings.set(MODULE.ID, key, list);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Settings adoption: could not record the ledger', { scope, error: error?.message ?? error }, false, false);
        }
    }

    // ==============================================================
    // ===== RUN ====================================================
    // ==============================================================

    /**
     * Adopt anything in the table that has not been adopted yet.
     *
     * Called from `ready` AFTER settings registration, since it writes through
     * `game.settings.set` on this module's own keys.
     *
     * @returns {Promise<number>} how many settings were adopted this run
     */
    static async run() {
        let adopted = 0;

        for (const scope of ['world', 'user', 'client']) {
            const rows = ADOPTIONS.filter(row => row.scope === scope);
            if (!rows.length) continue;

            // Only a GM can write world-scope settings. A player reaching this
            // point is not an error -- there is simply nothing for them to do,
            // and the GM's client will have done it.
            if (scope === 'world' && !game.user?.isGM) continue;

            const ledger = this._readLedger(scope);
            let ledgerChanged = false;

            for (const row of rows) {
                const rowId = `${row.fromModule}:${row.fromKey}`;
                if (ledger.has(rowId)) continue;

                const value = this._readSource(row);

                // Mark the row done even when there was nothing to adopt. A user
                // who never used the feature has no stored value, and re-checking
                // an absent key on every load forever is pointless.
                ledger.add(rowId);
                ledgerChanged = true;

                if (value === undefined || value === null) continue;

                try {
                    await game.settings.set(MODULE.ID, row.toKey, value);
                    adopted++;
                    postConsoleAndNotification(MODULE.NAME, 'Settings adoption: adopted a setting', { from: rowId, to: row.toKey, scope }, true, false);
                } catch (error) {
                    // Do not un-mark the row. A value that fails to write once --
                    // wrong type against our registration, say -- fails every time,
                    // and retrying it on every load would just repeat the error.
                    postConsoleAndNotification(MODULE.NAME, 'Settings adoption: could not write the adopted value', { from: rowId, to: row.toKey, error: error?.message ?? error }, false, false);
                }
            }

            if (ledgerChanged) await this._writeLedger(scope, ledger);
        }

        if (adopted > 0) {
            postConsoleAndNotification(MODULE.NAME, `Settings adoption: adopted ${adopted} setting(s) from sibling modules`, '', true, false);
        }
        return adopted;
    }
}
