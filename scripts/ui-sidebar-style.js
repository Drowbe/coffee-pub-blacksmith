// ================================================================== 
// ===== SIDEBAR STYLE ==============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class SidebarStyle {
    static initialized = false;
    static styleClass = 'blacksmith-sidebar-styled';

    /**
     * Initialize the sidebar style functionality
     */
    static initialize() {
        if (this.initialized) {
            return;
        }

        // Check if ready has already fired
        if (game.ready) {
            // Ready has already fired, setup immediately
            this._applySidebarStyle();
            this._registerSettingChangeHook();
        } else {
            // Wait for Foundry to be ready
            Hooks.once('ready', () => {
                this._applySidebarStyle();
                this._registerSettingChangeHook();
            });
        }

        this.initialized = true;
    }

    // ===== MANUAL ROLLS ===========================================
    //
    // The CONTROL moved: it was a button this class drew below the sidebar's pin
    // button, and it is now an entry on the dice tool's context menu, where it sits
    // beside the dice tray and Request a Roll rather than in a sidebar that has
    // nothing else to do with dice.
    //
    // The ENGINE stayed. Rewriting core's `diceConfiguration` and then coaxing Foundry
    // into actually applying it is fiddly and version-sensitive, and none of that has
    // anything to do with where the control is drawn.

    /**
     * Whether this user may be offered the toggle.
     *
     * The same two settings that used to decide whether the button appeared: the
     * user's own preference, and the GM's world-level permission for players. Their
     * keys still say "sidebar" because they are the author's settings text and they
     * gate the same capability -- only its home changed.
     */
    static canToggleManualRolls() {
        const clientWantsButton = getSettingSafely(MODULE.ID, 'sidebarManualRollsEnabled', true);
        if (game.user.isGM) return !!clientWantsButton;

        const playersFeatureEnabledByGM = getSettingSafely(MODULE.ID, 'sidebarManualRollsPlayersEnabled', true);
        return !!clientWantsButton && !!playersFeatureEnabledByGM;
    }

    /** Whether every die is currently set to manual entry. */
    static isManualRollsEnabled() {
        return this._isManualRollsEnabled();
    }

    /**
     * Flip manual rolls, and tell the GM when a player did it.
     * @returns {Promise<boolean>} whether manual rolls are on afterwards
     */
    static async toggleManualRolls() {
        const enabled = await this._toggleManualAllDice();
        if (!game.user.isGM) {
            await this._whisperGmManualRollsToggled(enabled);
        }
        postConsoleAndNotification(MODULE.NAME, `Manual rolls ${enabled ? 'enabled' : 'disabled'}`, '', true, false);
        return enabled;
    }

    /**
     * Register hook for setting changes
     */
    static _registerSettingChangeHook() {
        // Register setting-change callback to handle external setting changes
        // (covers world/user settings via updateSetting/createSetting AND the client-scoped
        // core.diceConfiguration via clientSettingChanged)
        const settingChangeHookIds = HookManager.registerSettingChangeCallback({
            description: 'Sidebar Style: Handle setting changes for sidebar style and manual rolls',
            context: 'sidebar-style-settings',
            priority: 3,
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'sidebarStyleUI') {
                    this._applySidebarStyle();
                }
                
                // NOTHING HERE WATCHES MANUAL ROLLS ANY MORE. The three branches that
                // did existed to keep a persistent button in step with three settings;
                // a context menu is built when it opens, so it reads all three fresh
                // and cannot be stale.

                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    /**
     * Toggle all dice between manual and digital modes
     * @returns {Promise<boolean>} True if manual mode is now enabled
     */
    static async _toggleManualAllDice() {
        const NAMESPACE = 'core';
        const KEY = 'diceConfiguration';

        const original = foundry.utils.duplicate(game.settings.get(NAMESPACE, KEY));
        const isManual = this._isManualDiceConfig(original);
        const nextMode = isManual ? 'off' : 'manual';

        const updated = this._setAllDiceModes(original, nextMode);

        await game.settings.set(NAMESPACE, KEY, updated);

        // Re-read after set so the UI reflects the actual stored value
        const afterSet = game.settings.get(NAMESPACE, KEY);

        // In Foundry v13+, dice configuration can be lazily applied until the Dice Configuration app
        // is opened/saved once. Attempt to apply the same "reconfigure" step programmatically.
        await this._applyDiceConfigurationRuntime(afterSet);

        // Re-read after runtime apply attempts (some implementations mutate runtime state rather than stored value)
        const afterApply = game.settings.get(NAMESPACE, KEY);
        const isManualNow = this._isManualDiceConfig(afterApply);

        // Debug-only breadcrumbs for diagnosing strange client-side shapes
        postConsoleAndNotification(MODULE.NAME, 'Manual rolls toggle: diceConfiguration before/after', {
            before: this._summarizeDiceConfig(original),
            updatedWritten: this._summarizeDiceConfig(updated),
            afterSet: this._summarizeDiceConfig(afterSet),
            afterApply: this._summarizeDiceConfig(afterApply),
            isManualBefore: isManual,
            isManualAfter: isManualNow
        }, true, false);

        return isManualNow;
    }

    static async _applyDiceConfigurationRuntime(cfg) {
        // Best-effort, no-throw: Foundry internals may change across minor versions.
        try {
            const attempts = [];

            const tryCall = async (label, fn) => {
                if (typeof fn !== 'function') return;
                try {
                    const r = fn();
                    if (r instanceof Promise) await r;
                    attempts.push({ label, ok: true });
                } catch (e) {
                    attempts.push({ label, ok: false, error: String(e?.message || e) });
                }
            };

            // Common patterns across versions (feature-detected)
            await tryCall('CONFIG.Dice.configure(cfg)', () => globalThis.CONFIG?.Dice?.configure?.(cfg));
            await tryCall('CONFIG.Dice.configure()', () => globalThis.CONFIG?.Dice?.configure?.());

            await tryCall('foundry.dice.DiceTerm.configure(cfg)', () => globalThis.foundry?.dice?.DiceTerm?.configure?.(cfg));
            await tryCall('foundry.dice.DiceTerm.configure()', () => globalThis.foundry?.dice?.DiceTerm?.configure?.());

            // Some builds keep a dice config helper on CONFIG.Dice (rare, but harmless to probe)
            await tryCall('CONFIG.Dice.DiceTerm.configure(cfg)', () => globalThis.CONFIG?.Dice?.DiceTerm?.configure?.(cfg));

            // Fire a hook in case something in-core or another module listens for it.
            await tryCall('Hooks.callAll(diceConfigurationChanged)', () => globalThis.Hooks?.callAll?.('diceConfigurationChanged', cfg));

            postConsoleAndNotification(MODULE.NAME, 'Manual rolls: attempted to apply dice configuration runtime', { attempts }, true, false);
        } catch (e) {
            // Never block toggling because of this best-effort step
            postConsoleAndNotification(MODULE.NAME, 'Manual rolls: failed to apply dice configuration runtime (non-fatal)', e, true, false);
        }
    }

    static _getDiceModeFromEntry(entry) {
        if (entry === 'manual') return 'manual';
        if (!entry) return '';

        if (typeof entry === 'boolean') return entry ? 'manual' : '';

        if (typeof entry === 'string') return entry;

        if (typeof entry === 'object') {
            // Common patterns: { mode: "manual" } or similar
            const candidates = [
                entry.mode,
                entry.rollMode,
                entry.method,
                entry.diceMode,
                entry.value,
                entry.setting,
                entry.type
            ];
            const hit = candidates.find(v => typeof v === 'string' && v.length);
            return hit || '';
        }

        return '';
    }

    static _setDiceModeOnEntry(entry, nextMode, offModeHint = '') {
        const next = nextMode === 'manual' ? 'manual' : (offModeHint || '');

        if (!entry || typeof entry === 'string') return next;
        if (typeof entry === 'boolean') return nextMode === 'manual';

        if (typeof entry === 'object') {
            const cloned = foundry.utils.duplicate(entry);

            // If there's an explicit boolean flag, prefer that
            if (typeof cloned.manual === 'boolean' || 'manual' in cloned) {
                cloned.manual = nextMode === 'manual';
                return cloned;
            }

            if (typeof cloned.mode === 'string' || 'mode' in cloned) cloned.mode = next;
            else if (typeof cloned.rollMode === 'string' || 'rollMode' in cloned) cloned.rollMode = next;
            else if (typeof cloned.method === 'string' || 'method' in cloned) cloned.method = next;
            else if (typeof cloned.diceMode === 'string' || 'diceMode' in cloned) cloned.diceMode = next;
            else if (typeof cloned.value === 'string' || 'value' in cloned) cloned.value = next;
            else cloned.mode = next; // last resort, keep object shape
            return cloned;
        }

        return next;
    }

    static _summarizeDiceConfig(cfg) {
        try {
            if (!cfg) return { kind: typeof cfg, isManual: false };

            if (typeof cfg === 'string') return { kind: 'string', value: cfg, isManual: cfg === 'manual' };
            if (typeof cfg === 'boolean') return { kind: 'boolean', value: cfg, isManual: !!cfg };

            if (cfg instanceof Map) {
                const modes = {};
                for (const [k, v] of cfg.entries()) modes[String(k)] = this._getDiceModeFromEntry(v);
                const values = Object.values(modes);
                return { kind: 'Map', keys: Object.keys(modes), modes, isManual: values.length ? values.every(m => m === 'manual') : false };
            }

            // Collection-like
            if (typeof cfg === 'object' && typeof cfg.entries === 'function' && typeof cfg.get === 'function') {
                const modes = {};
                for (const [k, v] of cfg.entries()) modes[String(k)] = this._getDiceModeFromEntry(v);
                const values = Object.values(modes);
                return { kind: cfg.constructor?.name || 'Collection', keys: Object.keys(modes), modes, isManual: values.length ? values.every(m => m === 'manual') : false };
            }

            if (Array.isArray(cfg)) {
                const modes = cfg.map(v => this._getDiceModeFromEntry(v));
                return { kind: 'Array', length: cfg.length, modes, isManual: modes.length ? modes.every(m => m === 'manual') : false };
            }

            if (typeof cfg === 'object') {
                const modes = {};
                for (const [k, v] of Object.entries(cfg)) modes[String(k)] = this._getDiceModeFromEntry(v);
                const values = Object.values(modes);
                return { kind: 'Object', keys: Object.keys(modes), modes, isManual: values.length ? values.every(m => m === 'manual') : false };
            }

            return { kind: typeof cfg, isManual: this._isManualDiceConfig(cfg) };
        } catch (e) {
            return { kind: 'unknown', error: String(e) };
        }
    }

    static _isManualDiceConfig(cfg) {
        if (!cfg) return false;

        if (typeof cfg === 'string') return cfg === 'manual';
        if (typeof cfg === 'boolean') return !!cfg;

        if (cfg instanceof Map) {
            if (!cfg.size) return false;
            return Array.from(cfg.values()).every(v => this._getDiceModeFromEntry(v) === 'manual');
        }

        if (Array.isArray(cfg)) {
            if (!cfg.length) return false;
            return cfg.every(e => this._getDiceModeFromEntry(e) === 'manual');
        }

        if (typeof cfg === 'object') {
            // Collection-like
            if (typeof cfg.entries === 'function' && typeof cfg.get === 'function') {
                const entries = Array.from(cfg.entries());
                if (!entries.length) return false;
                return entries.every(([, v]) => this._getDiceModeFromEntry(v) === 'manual');
            }

            const values = Object.values(cfg);
            if (!values.length) return false;
            return values.every(v => this._getDiceModeFromEntry(v) === 'manual');
        }

        return false;
    }

    static _setAllDiceModes(cfg, nextMode) {
        if (!cfg) return cfg;

        // Preserve the existing "off" mode (e.g. '', 'digital', etc.) so we don't invent invalid values.
        const getOffHint = (entry) => {
            const mode = this._getDiceModeFromEntry(entry);
            if (!mode || mode === 'manual') return '';
            return mode;
        };

        const buildAllDiceObjectFromDefaults = () => {
            const setting = game?.settings?.settings?.get('core.diceConfiguration');
            const def = setting?.default;

            // Prefer the core setting default shape if it exists and has keys
            if (def && typeof def === 'object' && !Array.isArray(def)) {
                const keys = Object.keys(def);
                if (keys.length) {
                    const out = foundry.utils.duplicate(def);
                    for (const [k, v] of Object.entries(out)) {
                        out[k] = this._setDiceModeOnEntry(v, nextMode, getOffHint(v));
                    }
                    return out;
                }
            }

            // Fallback: use the configured dice terms (d4, d6, d8, ...), supporting both Objects and Map/Collection-ish.
            let termKeys = [];
            const terms = globalThis.CONFIG?.Dice?.terms;
            if (terms) {
                if (terms instanceof Map) {
                    termKeys = Array.from(terms.keys()).map(String);
                } else if (typeof terms.entries === 'function') {
                    termKeys = Array.from(terms.entries()).map(([k]) => String(k));
                } else if (typeof terms === 'object') {
                    termKeys = Object.keys(terms);
                }
            }
            termKeys = termKeys.filter(k => /^d\d+$/i.test(k));

            // Last-resort: a sane default list Foundry will accept even before the user has saved Dice Configuration once.
            if (!termKeys.length) {
                termKeys = ['d2', 'd3', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
            }

            const out = {};
            for (const k of termKeys) {
                // Default "off" mode is implicit when missing; when enabling, explicitly set manual.
                out[k] = nextMode === 'manual' ? 'manual' : '';
            }
            return out;
        };

        if (typeof cfg === 'string') {
            const offHint = cfg === 'manual' ? '' : cfg;
            return nextMode === 'manual' ? 'manual' : (offHint || '');
        }

        if (typeof cfg === 'boolean') {
            return nextMode === 'manual';
        }

        if (cfg instanceof Map) {
            const out = new Map();
            for (const [k, v] of cfg.entries()) {
                out.set(k, this._setDiceModeOnEntry(v, nextMode, getOffHint(v)));
            }
            return out;
        }

        if (Array.isArray(cfg)) {
            return cfg.map(entry => this._setDiceModeOnEntry(entry, nextMode, getOffHint(entry)));
        }

        if (typeof cfg === 'object') {
            // Collection-like: convert to plain object so game.settings.set accepts it
            if (typeof cfg.entries === 'function' && typeof cfg.get === 'function') {
                const out = {};
                const entries = Array.from(cfg.entries());
                if (!entries.length) {
                    if (nextMode === 'manual') return buildAllDiceObjectFromDefaults();
                    return {}; // clearing overrides
                }

                for (const [k, v] of entries) {
                    out[String(k)] = this._setDiceModeOnEntry(v, nextMode, getOffHint(v));
                }
                return out;
            }

            const out = foundry.utils.duplicate(cfg);
            const keys = Object.keys(out);
            if (!keys.length) {
                if (nextMode === 'manual') return buildAllDiceObjectFromDefaults();
                return {}; // clearing overrides
            }
            for (const [k, v] of Object.entries(out)) {
                out[k] = this._setDiceModeOnEntry(v, nextMode, getOffHint(v));
            }
            return out;
        }

        return cfg;
    }

    /**
     * Check if manual rolls are currently enabled
     * @returns {boolean} True if all dice are set to manual
     */
    static _isManualRollsEnabled() {
        try {
            const cfg = game.settings.get('core', 'diceConfiguration');
            return this._isManualDiceConfig(cfg);
        } catch (error) {
            return false;
        }
    }

    static async _whisperGmManualRollsToggled(enabled) {
        try {
            const gmRecipients = ChatMessage.getWhisperRecipients('GM');
            if (!gmRecipients?.length) return;

            const msg = `${game.user.name} ${enabled ? 'enabled' : 'disabled'} Manual Rolls.`;

            // No style field: OTHER is the default, and CHAT_MESSAGE_TYPES is
            // deprecated in v12+ (renamed to CHAT_MESSAGE_STYLES).
            await ChatMessage.create({
                content: msg,
                whisper: gmRecipients.map(u => u.id),
                speaker: ChatMessage.getSpeaker({ user: game.user })
            });
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Failed to whisper GM about manual rolls toggle', e, false, true);
        }
    }

    /**
     * Apply or remove sidebar styles based on setting
     */
    static _applySidebarStyle() {
        const isEnabled = getSettingSafely(MODULE.ID, 'sidebarStyleUI', false);
        const sidebar = document.getElementById('sidebar');
        const sidebarTabs = document.getElementById('sidebar-tabs');
        const chatControls = document.getElementById('chat-controls');
        const rollPrivacy = document.getElementById('roll-privacy');
        
        if (!sidebar) {
            // Sidebar not found yet, try again after a delay
            setTimeout(() => {
                this._applySidebarStyle();
            }, 500);
            return;
        }

        if (isEnabled) {
            sidebar.classList.add(this.styleClass);
            if (sidebarTabs) {
                sidebarTabs.classList.add(this.styleClass);
            }
            if (chatControls) {
                chatControls.classList.add(this.styleClass);
            }
            if (rollPrivacy && rollPrivacy.classList.contains('vertical')) {
                rollPrivacy.classList.add(this.styleClass);
            }
        } else {
            sidebar.classList.remove(this.styleClass);
            if (sidebarTabs) {
                sidebarTabs.classList.remove(this.styleClass);
            }
            if (chatControls) {
                chatControls.classList.remove(this.styleClass);
            }
            if (rollPrivacy) {
                rollPrivacy.classList.remove(this.styleClass);
            }
        }
    }
}

