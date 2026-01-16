// ================================================================== 
// ===== SIDEBAR STYLE ==============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class SidebarStyle {
    static initialized = false;
    static styleClass = 'blacksmith-sidebar-styled';
    static manualRollButton = null;

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
            // Create manual roll button for all users if setting is enabled
            if (this._shouldShowManualRollButton()) {
                this._createManualRollButton();
            } else {
                // Setting disabled - remove button if it exists
                this._removeManualRollButton();
            }
        } else {
            // Wait for Foundry to be ready
            Hooks.once('ready', () => {
                this._applySidebarStyle();
                this._registerSettingChangeHook();
                // Create manual roll button for all users if setting is enabled
                if (this._shouldShowManualRollButton()) {
                    this._createManualRollButton();
                } else {
                    // Setting disabled - remove button if it exists
                    this._removeManualRollButton();
                }
            });
        }

        this.initialized = true;
    }

    static _shouldShowManualRollButton() {
        const clientWantsButton = getSettingSafely(MODULE.ID, 'sidebarManualRollsEnabled', true);
        if (game.user.isGM) return !!clientWantsButton;

        const playersFeatureEnabledByGM = getSettingSafely(MODULE.ID, 'sidebarManualRollsPlayersEnabled', true);
        return !!clientWantsButton && !!playersFeatureEnabledByGM;
    }

    /**
     * Register hook for setting changes
     */
    static _registerSettingChangeHook() {
        // Register settingChange hook to handle external setting changes
        const settingChangeHookId = HookManager.registerHook({
            name: 'settingChange',
            description: 'Sidebar Style: Handle setting changes for sidebar style and manual rolls',
            context: 'sidebar-style-settings',
            priority: 3,
            callback: (moduleId, settingKey, value) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                
                if (moduleId === MODULE.ID && settingKey === 'sidebarStyleUI') {
                    this._applySidebarStyle();
                }
                
                // Handle manual rolls enabled/disabled setting
                if (moduleId === MODULE.ID && settingKey === 'sidebarManualRollsEnabled') {
                    if (this._shouldShowManualRollButton()) this._createManualRollButton();
                    else this._removeManualRollButton();
                }

                // Handle GM feature gate for player visibility
                if (moduleId === MODULE.ID && settingKey === 'sidebarManualRollsPlayersEnabled') {
                    if (this._shouldShowManualRollButton()) this._createManualRollButton();
                    else this._removeManualRollButton();
                }
                
                // Update manual roll button when core dice configuration changes
                if (moduleId === 'core' && settingKey === 'diceConfiguration') {
                    if (this.manualRollButton) {
                        this._updateManualRollButtonState(this.manualRollButton);
                    }
                }
                
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });
    }

    /**
     * Remove the manual roll button if it exists
     */
    static _removeManualRollButton() {
        if (this.manualRollButton) {
            const buttonLi = this.manualRollButton.closest('li');
            if (buttonLi) {
                buttonLi.remove();
            }
            this.manualRollButton = null;
        } else {
            // Also check if button exists in DOM but not in our reference
            const existingButton = document.querySelector('.blacksmith-manual-rolls');
            if (existingButton) {
                const buttonLi = existingButton.closest('li');
                if (buttonLi) {
                    buttonLi.remove();
                }
            }
        }
    }

    /**
     * Create the manual roll button in sidebar tabs (below pin button)
     * Only visible for GMs
     */
    static _createManualRollButton() {
        // Check if button already exists
        if (document.querySelector('.blacksmith-manual-rolls')) {
            this.manualRollButton = document.querySelector('.blacksmith-manual-rolls');
            this._updateManualRollButtonState(this.manualRollButton);
            return;
        }

        // Find the pin button (if it exists) or chat button
        const pinButton = document.querySelector('.blacksmith-sidebar-pin');
        const chatButton = document.querySelector('button[data-action="tab"][data-tab="chat"]');
        
        let referenceElement = null;
        if (pinButton) {
            // Pin button exists, add below it
            referenceElement = pinButton.closest('li');
        } else if (chatButton) {
            // No pin button, use chat button as reference
            referenceElement = chatButton.closest('li');
        } else {
            postConsoleAndNotification(MODULE.NAME, 'Manual Roll Button: Could not find pin or chat button', '', true, false);
            // Try again after a delay
            setTimeout(() => {
                this._createManualRollButton();
            }, 500);
            return;
        }

        if (!referenceElement) {
            postConsoleAndNotification(MODULE.NAME, 'Manual Roll Button: Could not find reference element parent', '', true, false);
            setTimeout(() => {
                this._createManualRollButton();
            }, 500);
            return;
        }

        // Create new list item for manual roll button
        const manualRollButtonLi = document.createElement('li');
        
        // Create the manual roll button
        const manualRollButton = document.createElement('button');
        manualRollButton.type = 'button';
        manualRollButton.className = 'blacksmith-manual-rolls ui-control plain icon';
        manualRollButton.setAttribute('data-tooltip', '');
        manualRollButton.setAttribute('aria-label', 'Toggle Manual Rolls');
        manualRollButton.setAttribute('data-action', 'toggleManualRolls');
        
        // Update button state based on current setting
        this._updateManualRollButtonState(manualRollButton);
        
        // Add click handler
        manualRollButton.addEventListener('click', async (event) => {
            event.preventDefault();
            await this._toggleManualRolls(manualRollButton);
        });

        // Append button to list item
        manualRollButtonLi.appendChild(manualRollButton);
        
        // Insert after the reference element (below pin button or chat button)
        if (pinButton) {
            referenceElement.insertAdjacentElement('afterend', manualRollButtonLi);
        } else {
            referenceElement.insertAdjacentElement('afterend', manualRollButtonLi);
        }
        
        this.manualRollButton = manualRollButton;
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

    /**
     * Update manual roll button state based on current dice configuration
     */
    static _updateManualRollButtonState(button) {
        const isManualRollsEnabled = this._isManualRollsEnabled();
        
        // Clear existing icon classes
        button.classList.remove('fa-solid', 'fa-regular', 'fa-dice-d20', 'fa-hand-pointer');
        
        // Clear button content
        button.innerHTML = '';
        
        // Create icon element
        const icon = document.createElement('i');
        if (isManualRollsEnabled) {
            icon.className = 'fa-solid fa-dice-d20';
            button.setAttribute('aria-pressed', 'true');
            button.setAttribute('data-tooltip', 'Manual Rolls: Enabled (Click to disable)');
            button.setAttribute('aria-label', 'Manual Rolls: Enabled');
            button.classList.add('active');
        } else {
            icon.className = 'fa-solid fa-dice-d20';
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('data-tooltip', 'Manual Rolls: Disabled (Click to enable)');
            button.setAttribute('aria-label', 'Manual Rolls: Disabled');
            button.classList.remove('active');
        }
        
        button.appendChild(icon);
    }

    static async _whisperGmManualRollsToggled(enabled) {
        try {
            const gmRecipients = ChatMessage.getWhisperRecipients('GM');
            if (!gmRecipients?.length) return;

            const msg = `${game.user.name} ${enabled ? 'enabled' : 'disabled'} Manual Rolls.`;

            await ChatMessage.create({
                content: msg,
                whisper: gmRecipients.map(u => u.id),
                speaker: ChatMessage.getSpeaker({ user: game.user }),
                type: CONST.CHAT_MESSAGE_TYPES.OTHER
            });
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Failed to whisper GM about manual rolls toggle', e, false, true);
        }
    }

    /**
     * Toggle manual rolls setting
     * Only available for GMs
     */
    static async _toggleManualRolls(button) {
        const enabled = await this._toggleManualAllDice();
        this._updateManualRollButtonState(button);

        if (!game.user.isGM) {
            await this._whisperGmManualRollsToggled(enabled);
        }

        postConsoleAndNotification(MODULE.NAME, `Manual rolls ${enabled ? 'enabled' : 'disabled'}`, '', true, false);
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

