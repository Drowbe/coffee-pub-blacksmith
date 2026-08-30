// ==================================================================
// ===== SETTINGS FORM CONTROLS =====================================
// ==================================================================
//
// Small affordances added to Foundry's own settings form. Only what Foundry
// cannot render on its own belongs here.
//
// TWO THINGS ARE ADDED HERE: a play button beside every sound choice, and a
// colour swatch beside every colour setting. A third case raised with them is
// NOT here, because Foundry renders it once the setting is declared correctly --
// **image settings** declare `filePicker: 'image'` and get a browse button
// scoped to images (client/applications/settings/config.mjs:93-103). Declaring
// beats injecting every time it is available.
//
// **Colour is injected rather than declared, and that is deliberate.**
// `foundry.data.fields.ColorField` renders a native picker and is the obvious
// answer, which is why it keeps being proposed. It validates on read --
// `_validateType` throws for anything `isColorString` rejects -- and
// `registerSettings` runs early in `ready`, outside any try/catch. One world
// holding a legacy or empty value in one colour key would then fail to load,
// before anything could report why. Tried and reverted twice. A swatch driving
// the existing text input cannot break world load; its worst case is no swatch.
//
// Injected markup is the last resort, not the first:
// an earlier build drew a checklist into this form with this hook and got it
// wrong -- the markup landed inside `.form-fields` and shared one flex cell with
// the control, which is why toast channels became ordinary Boolean settings
// instead (`api-toast.js:145-152`). A button *is* a control and belongs in that
// container; a checklist was not and did not.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { coerceColorToHex } from './utility-color.js';

/** The value the sound list uses for "no sound". Nothing to preview. */
const NO_SOUND = 'sound-none';

/** Volume for a preview. Not the volume the feature will use -- see `_onPreview`. */
const PREVIEW_VOLUME = 0.7;

/** What a colour setting's stored value looks like. Three, six or eight hex digits. */
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export class SettingsControls {
    static _initialized = false;

    /**
     * Registered at IMPORT time, not from the `ready` chain.
     *
     * `renderSettingsConfig` cannot fire until a user opens the settings sheet,
     * which is long after any startup step, so there is nothing to wait for -- and
     * registering here means the button does not depend on this file's initializer
     * being reached in a ~270-line `ready` handler with six early returns in it.
     * `blacksmith.js` still calls `initialize()`; it is idempotent and only logs.
     */
    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        HookManager.registerHook({
            name: 'renderSettingsConfig',
            description: 'Settings: add sound previews and colour swatches to the settings form',
            context: 'settings-controls',
            priority: 3,
            callback: (_app, element) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                SettingsControls.injectControls(element);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        postConsoleAndNotification(MODULE.NAME, 'Settings: form controls initialized', '', true, false);
    }

    /**
     * Add every control this file knows how to improve, in ONE pass over the form.
     *
     * Scans for controls whose `name` starts with our namespace and looks each one
     * up in the settings registry, rather than building a selector per setting key.
     * That is deliberate: a per-key selector encodes an assumption about how the
     * name is spelled, and when the assumption is wrong it matches nothing and
     * reports nothing -- a silent no-op that looks exactly like the feature not
     * being installed. Scanning cannot be wrong about the name, because it reads
     * the name off the element.
     *
     * @param {HTMLElement} element - The settings form's root, as the hook supplies it.
     */
    static injectControls(element) {
        try {
            // NOT `element?.[0] ?? element`. That is the usual jQuery-compat idiom and it
            // is WRONG here: this application's root is a `<form>`, and HTMLFormElement is
            // indexable -- `form[0]` returns its first control. The idiom therefore
            // narrowed the entire settings sheet down to a single `<input>`, and every
            // query below found nothing, with no error and a cheerful "decorated 0".
            // Test for the element first and fall back to unwrapping only if it is not one.
            const root = element instanceof HTMLElement ? element : (element?.[0] ?? element?.element ?? null);
            if (!root?.querySelectorAll) {
                postConsoleAndNotification(MODULE.NAME, 'Settings: no form element to decorate', '', true, false);
                return;
            }

            const controls = root.querySelectorAll(`[name^="${MODULE.ID}."]`);
            let sounds = 0;
            let colors = 0;

            for (const control of controls) {
                const config = game.settings?.settings?.get?.(control.name);
                if (!config) continue;

                const fields = control.closest('.form-fields') ?? control.parentElement;
                if (!fields) continue;

                if (this._isSoundSetting(config) && !fields.querySelector('.blacksmith-setting-preview')) {
                    this._addSoundPreview(fields, control);
                    sounds++;
                } else if (this._isColorSetting(config) && !fields.querySelector('.blacksmith-setting-swatch')) {
                    this._addColorSwatch(fields, control);
                    colors++;
                }
            }

            // Loud when it finds our settings and improves none of them: that is the
            // shape of every assumption in here being wrong at once, and it is worth
            // more than a silent zero.
            if (controls.length && !sounds && !colors) {
                postConsoleAndNotification(
                    MODULE.NAME,
                    `Settings: found ${controls.length} of our controls and decorated none`,
                    'No sound or colour settings matched. Check `soundSettingKeys`/`colorSettingKeys`.',
                    false,
                    false
                );
                return;
            }

            postConsoleAndNotification(MODULE.NAME, 'Settings: controls decorated', { controls: controls.length, sounds, colors }, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Settings: error decorating the settings form', error?.message || error, false, false);
        }
    }

    /**
     * A sound setting is one whose choices are the sound list, recognised by the
     * list's own `sound-none` entry rather than by object identity with
     * `BLACKSMITH.arrSoundChoices` -- that object is rebuilt when the asset
     * collection reloads, and identity would quietly stop matching.
     */
    static _isSoundSetting(config) {
        const choices = config?.choices;
        return !!choices && typeof choices === 'object' && NO_SOUND in choices;
    }

    /**
     * A colour setting is a free-text String whose registered default looks like a
     * hex colour. Derived rather than listed, so a colour setting added later gets
     * its swatch for free. The default is used rather than the current value, so a
     * key a user has cleared is still recognised as a colour.
     */
    static _isColorSetting(config) {
        if (config?.type !== String || config?.choices) return false;
        const dflt = config?.default;
        return typeof dflt === 'string' && HEX_COLOR.test(dflt.trim());
    }

    /** A preview button that plays whatever the control is currently showing. */
    static _addSoundPreview(fields, control) {
        const button = document.createElement('button');
        button.type = 'button'; // Not a submit: this form saves on submit.
        button.className = 'blacksmith-setting-preview';
        button.setAttribute('data-tooltip', 'Preview this sound');
        button.setAttribute('aria-label', 'Preview this sound');
        button.innerHTML = '<i class="fas fa-play"></i>';
        button.disabled = this._isSilent(control.value);

        button.addEventListener('click', (event) => this._onPreview(event, control));
        // Follows the control, not the saved value: the point is auditioning a
        // choice before it is saved.
        control.addEventListener('change', () => {
            button.disabled = this._isSilent(control.value);
        });

        fields.appendChild(button);
    }

    /**
     * A native colour swatch that DRIVES the text input rather than replacing it.
     *
     * The text input keeps the setting's `name`, so it stays what the form submits,
     * and a GM who would rather paste a hex value still can. Two-way, because a
     * swatch showing a different colour from the field beside it is worse than no
     * swatch.
     */
    static _addColorSwatch(fields, control) {
        const swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'blacksmith-setting-swatch';
        swatch.setAttribute('data-tooltip', 'Pick a colour');
        swatch.setAttribute('aria-label', 'Pick a colour');
        // Deliberately no `name`: the text input is what the form submits, and a
        // second control carrying the same name would submit the value twice.
        swatch.value = this._toSwatchValue(control.value);

        swatch.addEventListener('input', () => {
            control.value = swatch.value;
            // The form watches its own controls for change, so the text input has to
            // say it changed or the picked value is never submitted.
            control.dispatchEvent(new Event('change', { bubbles: true }));
        });
        control.addEventListener('change', () => {
            swatch.value = this._toSwatchValue(control.value);
        });

        fields.appendChild(swatch);
    }

    /**
     * What an `input[type=color]` will accept: exactly six hex digits, never
     * shorthand and never an alpha channel. Anything else it silently shows as
     * black, which would misreport the stored value -- so an unreadable value
     * shows mid grey and the text input is left exactly as the user typed it.
     */
    static _toSwatchValue(raw) {
        const hex = coerceColorToHex(raw, '#808080');
        return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#808080';
    }

    /** Whether this value has nothing to play. */
    static _isSilent(value) {
        return !value || value === NO_SOUND || value === 'none';
    }

    /**
     * Play the currently selected sound, on this client only.
     *
     * `broadcast: false` is not a detail. `playSound` broadcasts by default
     * (`api-core.js:1043`), and a GM browsing the settings sheet would otherwise
     * fire every sound they clicked at the whole table.
     *
     * The volume is a fixed preview level rather than the feature's own: the
     * settings that carry a volume (`timerSoundVolume`, `movementSoundVolume`)
     * do not map one-to-one onto the sounds, and guessing the pairing would make
     * some previews quieter than what the GM will actually hear. A preview
     * answers "which sound is this", not "how loud will it be".
     */
    static async _onPreview(event, select) {
        event.preventDefault();
        event.stopPropagation();
        const value = select?.value;
        if (this._isSilent(value)) return;
        try {
            await playSound(value, PREVIEW_VOLUME, false, false, 0);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Settings: error previewing sound', error?.message || error, false, false);
        }
    }
}

// Register as soon as this module is imported. See `initialize()` for why.
SettingsControls.initialize();
