// ==================================================================
// ===== WINDOW-TOAST-SEND – GM "Send Toast" tool ===================
// ==================================================================
// GM-only window (opened from the party menubar) that sends a large
// styled toast to selected players via the INTERNAL targeted relay
// (sendToastToUsers in api-toast.js). This is a Blacksmith feature
// consuming private plumbing — it is NOT the public cross-client
// toast API, which stays gated on the socket rewrite.
// ==================================================================

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound } from './api-core.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { ToastManager, sendToastToUsers, broadcastToast, isToastExcludedUser } from './api-toast.js';

const APP_ID = 'blacksmith-toast-send-window';
const PREFS_SETTING = 'toastSendPreferences';
const TEMPLATES_SETTING = 'toastSendTemplates';

// Built-in templates are code-side and non-deletable; user templates live in the
// world-scoped toastSendTemplates setting. A template is an APPEARANCE + TARGET
// bundle — recipients and message text are never part of one (text is the
// includeText opt-in), but the publish target IS: a saved "BIG HIT!" template
// can carry Stream with it. Border and background colors are independent
// parameters (derivation was tried and retired); a background image, when set,
// covers the background color.
// A deliberately small set — Information is the everyday default, Announcement and
// Important cover the loud cases, and everything else is Custom / user-saved.
const BUILTIN_TEMPLATES = {
    // NOTE: `sound` is the PATH, not the asset id — the sound dropdown is keyed by
    // path (settings.js getSoundChoices) and playSound() takes a src.
    'Information':   { color: '#ac9f81', backgroundColor: '#141414', icon: 'fa-solid fa-bookmark', image: '', backgroundImage: '', size: '', duration: 10, sound: 'modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3', publish: 'game' },
    'Announcement':  { color: '#a4becc', backgroundColor: '#000e14', icon: 'fa-solid fa-flag', image: '', backgroundImage: '', size: 'small', duration: 30, sound: 'modules/coffee-pub-blacksmith/sounds/interface-button-06.mp3', publish: 'game' },
    'Important':     { color: '#f5d6d6', backgroundColor: '#250909', icon: 'fa-solid fa-shield', image: '', backgroundImage: '', size: 'fullscreen', duration: 0, sound: 'modules/coffee-pub-blacksmith/sounds/synth.mp3', publish: 'game' }
};
const DEFAULT_BG_COLOR = '#141414';
// Template-selector sentinel: shown whenever the form has diverged from a template.
const CUSTOM_TEMPLATE = 'Custom';
// '__image__' is a UI sentinel, never sent as an icon class: selecting it switches the
// visual to a custom image (revealing the path/browse field) — image and icon are
// mutually exclusive by construction.
const IMAGE_MODE = '__image__';
const TOAST_ICONS = [
    [IMAGE_MODE, 'Custom image', 'fa-solid fa-image'],
    ['', 'No icon', 'fa-solid fa-ban'],
    ['fa-solid fa-bullhorn', 'Bullhorn', 'fa-solid fa-bullhorn'],
    ['fa-solid fa-circle-info', 'Information', 'fa-solid fa-circle-info'],
    ['fa-solid fa-circle-check', 'Success', 'fa-solid fa-circle-check'],
    ['fa-solid fa-triangle-exclamation', 'Warning', 'fa-solid fa-triangle-exclamation'],
    ['fa-solid fa-skull', 'Danger', 'fa-solid fa-skull'],
    ['fa-solid fa-book-open', 'Book', 'fa-solid fa-book-open'],
    ['fa-solid fa-map', 'Map', 'fa-solid fa-map'],
    ['fa-solid fa-shield', 'Shield', 'fa-solid fa-shield'],
    ['fa-solid fa-store', 'Store', 'fa-solid fa-store'],
    ['fa-solid fa-basket-shopping', 'Shop', 'fa-solid fa-basket-shopping'],
    ['fa-solid fa-bookmark', 'Bookmark', 'fa-solid fa-bookmark'],
    ['fa-solid fa-droplet', 'Droplet', 'fa-solid fa-droplet'],
    ['fa-solid fa-fire', 'Fire', 'fa-solid fa-fire'],
    ['fa-solid fa-flag', 'Flag', 'fa-solid fa-flag'],
    ['fa-solid fa-flask', 'Flask', 'fa-solid fa-flask'],
    ['fa-solid fa-house', 'House', 'fa-solid fa-house'],
    ['fa-solid fa-seedling', 'Seedling', 'fa-solid fa-seedling'],
    ['fa-solid fa-beer-mug-empty', 'Beer', 'fa-solid fa-beer-mug-empty'],
    ['fa-sharp fa-solid fa-swords', 'Swords', 'fa-sharp fa-solid fa-swords'],
    ['fa-solid fa-treasure-chest', 'Treasure', 'fa-solid fa-treasure-chest'],
    ['fa-solid fa-paw-claws', 'Creature', 'fa-solid fa-paw-claws'],
    ['fa-solid fa-mushroom', 'Mushroom', 'fa-solid fa-mushroom']
];

export class ToastSendWindow extends BlacksmithWindowBaseV2 {

    static ROOT_CLASS = 'blacksmith-window-template-root';
    static _preferenceSaveQueue = Promise.resolve();

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: APP_ID,
            classes: ['blacksmith-toast-send-window'],
            position: { width: 500, height: 'auto' },
            window: { title: 'Send Toast', resizable: true, minimizable: true, icon: 'fas fa-bullhorn' },
            // Base-class constraints (never put min/max on position — Foundry's
            // position object is not extensible). Width stays put; height is the
            // axis worth dragging when the recipient list or icon grid grows.
            windowSizeConstraints: { minWidth: 500, maxWidth: 500, minHeight: 420 }
        }
    );

    static PARTS = {
        body: { template: `modules/${MODULE.ID}/templates/window-template.hbs` }
    };

    static ACTION_HANDLERS = {
        'toast-send': () => ToastSendWindow._ref?._send(),
        'toast-cancel': () => ToastSendWindow._ref?.close(),
        'toast-browse-image': () => ToastSendWindow._ref?._browseImage('toast-image'),
        'toast-browse-background': () => ToastSendWindow._ref?._browseImage('toast-background'),
        'toast-clear-image': () => ToastSendWindow._ref?._clearImage('toast-image'),
        'toast-clear-background': () => ToastSendWindow._ref?._clearImage('toast-background'),
        'toast-select-icon': (_event, target) => ToastSendWindow._ref?._selectIcon(target),
        'toast-template-save': () => ToastSendWindow._ref?._saveTemplateAs(),
        'toast-template-delete': () => ToastSendWindow._ref?._deleteTemplate(),
        'toast-preview-sound': () => ToastSendWindow._ref?._previewSound()
    };

    constructor(options = {}) {
        super(options);
        ToastSendWindow._ref = this;
        try {
            this.preferences = game.settings.get(MODULE.ID, PREFS_SETTING) || {};
        } catch {
            this.preferences = {};
        }
        this.selectedIcon = this.preferences.image
            ? IMAGE_MODE
            : String(this.preferences.icon ?? 'fa-solid fa-bullhorn');
    }

    async getData() {
        const esc = foundry.utils.escapeHTML;
        const prefs = this.preferences;

        // Non-GM users; active ones enabled and pre-checked, offline disabled.
        // Users on the toastExcludedUsers list are left out entirely — the
        // receipt-side gate in show() would drop the toast anyway; hiding them
        // keeps the list honest about who can be reached.
        const recipientRows = game.users
            .filter(u => !u.isGM && !isToastExcludedUser(u))
            .map(u => `
                <label class="blacksmith-toast-send-recipient${u.active ? '' : ' offline'}">
                    <input type="checkbox" name="toast-recipient" value="${esc(u.id)}"
                        ${u.active && (prefs.party || !Array.isArray(prefs.recipients) || prefs.recipients.includes(u.id)) ? 'checked' : ''}
                        ${u.active ? '' : 'disabled'}>
                    <img src="${esc(u.character?.img || u.avatar || 'icons/svg/mystery-man.svg')}" alt="">
                    <span>${esc(u.character?.name || u.name)}${u.active ? '' : ' (offline)'}</span>
                </label>`)
            .join('');

        const templates = this._getTemplates();
        const selectedTemplate = prefs.template === CUSTOM_TEMPLATE ? CUSTOM_TEMPLATE
            : (templates[prefs.template] ? prefs.template : 'Information');
        const templateOptions = [
            `<option value="${CUSTOM_TEMPLATE}"${selectedTemplate === CUSTOM_TEMPLATE ? ' selected' : ''}>— Custom —</option>`,
            ...Object.keys(templates).map(name =>
                `<option value="${esc(name)}"${name === selectedTemplate ? ' selected' : ''}>${esc(name)}</option>`)
        ].join('');
        const soundOptions = Object.entries(BLACKSMITH.arrSoundChoices || { 'sound-none': 'No Sound' })
            .map(([value, label]) => `<option value="${esc(value)}"${String(prefs.sound || 'sound-none') === value ? ' selected' : ''}>${esc(label)}</option>`)
            .join('');
        const iconButtons = TOAST_ICONS.map(([value, label, preview]) => `
            <button type="button" class="blacksmith-toast-send-icon${this.selectedIcon === value ? ' selected' : ''}"
                data-action="toast-select-icon" data-icon="${esc(value)}" data-tooltip="${esc(label)}" aria-label="${esc(label)}">
                <i class="${preview}"></i>
            </button>`).join('');

        const bodyContent = `
            <div class="blacksmith-toast-send-form">
                <div class="blacksmith-window-section blacksmith-toast-send-recipients-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-users"></i>
                        <span>Recipients</span>
                    </div>
                    <label class="blacksmith-toast-send-recipient blacksmith-toast-send-party">
                        <input type="checkbox" name="toast-party" ${prefs.party ? 'checked' : ''}>
                        <i class="fa-solid fa-people-group"></i>
                        <span>Entire Party (everyone online)</span>
                    </label>
                    <div class="blacksmith-toast-send-recipients">${recipientRows || '<em>No players in this world.</em>'}</div>
                </div>

                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-swatchbook"></i>
                        <span>Template</span>
                    </div>
                    <div class="blacksmith-toast-send-image-row">
                        <select class="blacksmith-input" name="toast-template">${templateOptions}</select>
                        <button type="button" class="blacksmith-window-btn-secondary blacksmith-toast-send-browse blacksmith-toast-send-template-save" data-action="toast-template-save"
                            data-tooltip="Save the current settings as a new template" aria-label="Save as template"
                            ${BUILTIN_TEMPLATES[selectedTemplate] ? 'style="display:none"' : ''}><i class="fa-solid fa-floppy-disk"></i></button>
                        <button type="button" class="blacksmith-toast-send-clear blacksmith-toast-send-template-delete" data-action="toast-template-delete"
                            data-tooltip="Delete this template" aria-label="Delete template"
                            ${BUILTIN_TEMPLATES[selectedTemplate] || selectedTemplate === CUSTOM_TEMPLATE ? 'style="display:none"' : ''}><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <label class="blacksmith-toast-send-recipient blacksmith-toast-send-include-text"
                        ${BUILTIN_TEMPLATES[selectedTemplate] ? 'style="display:none"' : ''}>
                        <input type="checkbox" name="toast-include-text" ${prefs.includeText ? 'checked' : ''}>
                        <span>Include title and message in the template</span>
                    </label>
                </div>

                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-crosshairs"></i>
                        <span>Target</span>
                    </div>
                    <div class="blacksmith-field">
                        <select class="blacksmith-input" name="toast-publish" data-tooltip="Which screen shows the toast. Stream is Foundry's chat-only /stream capture page (e.g. an OBS overlay).">
                            <option value="game" ${(prefs.publish ?? 'game') === 'game' ? 'selected' : ''}>Game — the play screen</option>
                            <option value="stream" ${prefs.publish === 'stream' ? 'selected' : ''}>Stream — the chat-only capture page</option>
                            <option value="both" ${prefs.publish === 'both' ? 'selected' : ''}>Both — game and stream</option>
                        </select>
                    </div>
                </div>

                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-message"></i>
                        <span>Message</span>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Title</label>
                        <input type="text" class="blacksmith-input" name="toast-title" placeholder="Title (required)" maxlength="120">
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Message</label>
                        <textarea class="blacksmith-input blacksmith-toast-send-message" name="toast-subtitle" rows="3" maxlength="300" placeholder="Message (optional)"></textarea>
                    </div>
                </div>

                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-palette"></i>
                        <span>Appearance</span>
                    </div>
                    <div class="blacksmith-field-row">
                        <div class="blacksmith-field">
                            <label class="blacksmith-field-label">Size</label>
                            <select class="blacksmith-input" name="toast-size">
                                <option value="" ${!prefs.size ? 'selected' : ''}>Adapt to Content</option>
                                <option value="small" ${prefs.size === 'small' ? 'selected' : ''}>Small</option>
                                <option value="medium" ${prefs.size === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="large" ${prefs.size === 'large' ? 'selected' : ''}>Large</option>
                                <option value="fullscreen" ${prefs.size === 'fullscreen' ? 'selected' : ''}>Fullscreen</option>
                            </select>
                        </div>
                        <div class="blacksmith-field">
                            <label class="blacksmith-field-label">Duration</label>
                            <select class="blacksmith-input" name="toast-duration">
                                ${[0, 3, 10, 20, 30, 60].map(value => `<option value="${value}"${Number(prefs.duration ?? 0) === value ? ' selected' : ''}>${value === 0 ? 'Until closed' : (value === 60 ? '1 minute' : `${value} seconds`)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Sound</label>
                        <div class="blacksmith-toast-send-image-row">
                            <select class="blacksmith-input" name="toast-sound">${soundOptions}</select>
                            <button type="button" class="blacksmith-window-btn-secondary blacksmith-toast-send-browse" data-action="toast-preview-sound"
                                data-tooltip="Preview this sound" aria-label="Preview sound"><i class="fa-solid fa-play"></i></button>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Icon</label>
                        <div class="blacksmith-toast-send-icons">${iconButtons}</div>
                    </div>
                    <div class="blacksmith-field blacksmith-toast-send-image-field${this.selectedIcon === IMAGE_MODE ? '' : ' hidden'}">
                        <label class="blacksmith-field-label">Image</label>
                        <div class="blacksmith-toast-send-image-row">
                            <div class="blacksmith-toast-send-input-wrap">
                                <input type="text" class="blacksmith-input" name="toast-image" value="${esc(prefs.image || '')}" placeholder="Avatar image path">
                                <button type="button" class="blacksmith-toast-send-clear" data-action="toast-clear-image" data-tooltip="Clear image" aria-label="Clear image"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                            <button type="button" class="blacksmith-window-btn-secondary blacksmith-toast-send-browse" data-action="toast-browse-image"
                                data-tooltip="Browse for image" aria-label="Browse for image"><i class="fa-solid fa-folder-open"></i></button>
                        </div>
                    </div>
                    <div class="blacksmith-field-row">
                        <div class="blacksmith-field">
                            <label class="blacksmith-field-label">Border Color</label>
                            <div class="blacksmith-toast-send-color-row">
                                <input type="text" class="blacksmith-input blacksmith-toast-send-color-text" name="toast-border-color-text"
                                    value="${esc(prefs.color || '#ac9f81')}" maxlength="7" placeholder="#ac9f81"
                                    data-tooltip="Border, icon, and title color">
                                <input type="color" class="blacksmith-toast-send-color-picker" name="toast-border-color" value="${esc(prefs.color || '#ac9f81')}">
                            </div>
                        </div>
                        <div class="blacksmith-field">
                            <label class="blacksmith-field-label">Background Color</label>
                            <div class="blacksmith-toast-send-color-row">
                                <input type="text" class="blacksmith-input blacksmith-toast-send-color-text" name="toast-bg-color-text"
                                    value="${esc(prefs.backgroundColor || DEFAULT_BG_COLOR)}" maxlength="7" placeholder="${DEFAULT_BG_COLOR}"
                                    data-tooltip="Box background; a background image covers it">
                                <input type="color" class="blacksmith-toast-send-color-picker" name="toast-bg-color" value="${esc(prefs.backgroundColor || DEFAULT_BG_COLOR)}">
                            </div>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Background Image</label>
                        <div class="blacksmith-toast-send-image-row">
                            <div class="blacksmith-toast-send-input-wrap">
                                <input type="text" class="blacksmith-input" name="toast-background" value="${esc(prefs.backgroundImage || '')}"
                                    placeholder="Optional — covers the background color">
                                <button type="button" class="blacksmith-toast-send-clear" data-action="toast-clear-background" data-tooltip="Clear background" aria-label="Clear background"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                            <button type="button" class="blacksmith-window-btn-secondary blacksmith-toast-send-browse" data-action="toast-browse-background"
                                data-tooltip="Browse for image" aria-label="Browse for image"><i class="fa-solid fa-folder-open"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;

        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: true,
            headerIcon: 'fa-solid fa-bullhorn',
            windowTitle: 'Send Toast',
            subtitle: 'Send an on-screen message to selected players',
            showTools: false,
            showActionBar: true,
            bodyContent,
            actionBarLeft: '<button type="button" class="blacksmith-window-btn-secondary" data-action="toast-cancel"><i class="fas fa-xmark"></i> Cancel</button>',
            actionBarRight: '<button type="button" class="blacksmith-window-btn-primary" data-action="toast-send"><i class="fas fa-bullhorn"></i> Send Toast</button>'
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root) return;
        // "Entire Party" overrides the individual picks: checking it checks and locks
        // every online player's box; unchecking restores individual control.
        const party = root.querySelector('[name="toast-party"]');
        const applyPartyState = () => {
            for (const cb of root.querySelectorAll('[name="toast-recipient"]')) {
                const offline = cb.closest('.blacksmith-toast-send-recipient')?.classList.contains('offline');
                if (offline) continue;
                if (party.checked) {
                    cb.checked = true;
                    cb.disabled = true;
                } else {
                    cb.disabled = false;
                }
            }
        };
        party?.addEventListener('change', () => {
            applyPartyState();
            void this._savePreferences();
        });
        applyPartyState();

        // Target drives whether recipients matter: the stream surface is
        // view-addressed (any /stream client renders a stream-targeted toast,
        // whoever is logged into it), so a stream-only send has no user
        // recipients and the section dims to say so. Preference saving and the
        // divergence-to-Custom flip ride the generic change listener below.
        root.querySelector('[name="toast-publish"]')
            ?.addEventListener('change', () => this._applyPublishState());
        this._applyPublishState();

        // Template-content edits flip the selector to "Custom" — the selector never
        // claims a template the form has diverged from. Recipients and the title/message
        // text are deliberately NOT template content: typing a message is the normal use
        // of a template, not a divergence from it (author decision 2026-07-20). The
        // publish target IS template content (author decision 2026-07-23), so changing
        // it diverges too.
        const APPEARANCE_FIELDS = ['toast-size', 'toast-duration', 'toast-sound', 'toast-border-color', 'toast-border-color-text', 'toast-bg-color', 'toast-bg-color-text', 'toast-image', 'toast-background', 'toast-publish'];
        for (const input of root.querySelectorAll('input, select')) {
            if (['toast-title', 'toast-subtitle', 'toast-party', 'toast-template'].includes(input.name)) continue;
            input.addEventListener('change', () => {
                if (APPEARANCE_FIELDS.includes(input.name)) this._markCustom();
                void this._savePreferences();
            });
        }

        // Color rows: hex text and swatch stay in two-way sync (pin-config pattern)
        const syncColorPair = (textName, pickerName) => {
            const text = root.querySelector(`[name="${textName}"]`);
            const picker = root.querySelector(`[name="${pickerName}"]`);
            picker?.addEventListener('input', () => {
                if (text) text.value = picker.value;
            });
            text?.addEventListener('change', () => {
                const value = text.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                    if (picker) picker.value = value;
                } else if (picker) {
                    text.value = picker.value; // invalid hex: revert to the swatch
                }
            });
        };
        syncColorPair('toast-border-color-text', 'toast-border-color');
        syncColorPair('toast-bg-color-text', 'toast-bg-color');

        // Picking a template stamps its appearance onto the form (then normal editing
        // diverges freely — a template is a starting point, not a binding)
        root.querySelector('[name="toast-template"]')?.addEventListener('change', (event) => {
            this._applyTemplate(event.currentTarget.value);
        });

        // Wording lives only in the DOM (it is deliberately never persisted in
        // preferences), so a remembered template that carries text must stamp it on
        // open — otherwise reopening shows the right template name with empty fields
        // until you toggle away and back. Only fills blanks; never clobbers.
        const selected = root.querySelector('[name="toast-template"]')?.value;
        const remembered = selected && selected !== CUSTOM_TEMPLATE ? this._getTemplates()[selected] : null;
        if (remembered?.includeText) {
            const title = root.querySelector('[name="toast-title"]');
            const subtitle = root.querySelector('[name="toast-subtitle"]');
            if (title && !title.value) title.value = remembered.title ?? '';
            if (subtitle && !subtitle.value) subtitle.value = remembered.subtitle ?? '';
        }

        // Reflect the remembered selection in the contextual controls (in particular the
        // Save tooltip, which reads "Update «name»" for a user's own template).
        this._refreshTemplateControls();
    }

    /**
     * Reflect the Target choice in the Recipients section: a stream-only send is
     * view-addressed and has no user recipients, so the section dims and stops
     * taking input. Called on target changes and after a template stamps one.
     */
    _applyPublishState() {
        const root = this._getRoot();
        root?.querySelector('.blacksmith-toast-send-recipients-section')
            ?.classList.toggle('stream-only', root?.querySelector('[name="toast-publish"]')?.value === 'stream');
    }

    /**
     * An appearance field changed. Built-ins are read-only presets, so editing one
     * forks the form to Custom; a user's own template keeps the edits attached to it
     * (Save then updates that template in place). Custom stays Custom.
     */
    _markCustom() {
        const select = this._getRoot()?.querySelector('[name="toast-template"]');
        if (select && BUILTIN_TEMPLATES[select.value]) select.value = CUSTOM_TEMPLATE;
        this._refreshTemplateControls();
    }

    /**
     * Template controls are contextual: saving (and the include-text choice that
     * governs what a save captures) only applies when the form is NOT showing an
     * untouched built-in; deleting only applies to user-saved templates.
     */
    _refreshTemplateControls() {
        const root = this._getRoot();
        const name = root?.querySelector('[name="toast-template"]')?.value;
        const isBuiltIn = !!BUILTIN_TEMPLATES[name];
        const setShown = (selector, shown) => {
            const el = root?.querySelector(selector);
            if (el) el.style.display = shown ? '' : 'none';
        };
        setShown('.blacksmith-toast-send-template-save', !isBuiltIn);
        setShown('.blacksmith-toast-send-include-text', !isBuiltIn);
        setShown('.blacksmith-toast-send-template-delete', !isBuiltIn && name !== CUSTOM_TEMPLATE);

        // Save means different things by selection — say which in the tooltip
        const save = root?.querySelector('.blacksmith-toast-send-template-save');
        if (save) {
            const updating = !isBuiltIn && name !== CUSTOM_TEMPLATE;
            const label = updating ? `Update "${name}"` : 'Save as a new template';
            save.dataset.tooltip = label;
            save.setAttribute('aria-label', label);
        }
    }

    _getTemplates() {
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, TEMPLATES_SETTING) || {};
        } catch { /* setting not registered yet */ }
        return { ...BUILTIN_TEMPLATES, ...saved };
    }

    _currentAppearance() {
        const root = this._getRoot();
        const imageMode = this.selectedIcon === IMAGE_MODE;
        // Text is opt-in: only a template saved with "Include title and message"
        // carries wording. The built-ins never do — they are look, not content.
        const includeText = root?.querySelector('[name="toast-include-text"]')?.checked === true;
        const text = includeText ? {
            includeText: true,
            title: root?.querySelector('[name="toast-title"]')?.value ?? '',
            subtitle: root?.querySelector('[name="toast-subtitle"]')?.value ?? ''
        } : {};
        return {
            ...text,
            color: root?.querySelector('[name="toast-border-color"]')?.value || '#ac9f81',
            backgroundColor: root?.querySelector('[name="toast-bg-color"]')?.value || DEFAULT_BG_COLOR,
            icon: imageMode ? '' : this.selectedIcon,
            image: imageMode ? (root?.querySelector('[name="toast-image"]')?.value?.trim() || '') : '',
            backgroundImage: root?.querySelector('[name="toast-background"]')?.value?.trim() || '',
            size: root?.querySelector('[name="toast-size"]')?.value || '',
            duration: Number(root?.querySelector('[name="toast-duration"]')?.value ?? 0),
            sound: root?.querySelector('[name="toast-sound"]')?.value || 'sound-none',
            publish: root?.querySelector('[name="toast-publish"]')?.value || 'game'
        };
    }

    _applyTemplate(name) {
        const root = this._getRoot();
        if (!root) return;
        if (name === CUSTOM_TEMPLATE) {
            // "Custom" is a state, not a template — keep the form as it stands
            this._refreshTemplateControls();
            void this._savePreferences();
            return;
        }
        const tpl = this._getTemplates()[name];
        if (!tpl) return;

        const setValue = (selector, value) => {
            const el = root.querySelector(selector);
            if (el) el.value = value;
        };
        setValue('[name="toast-size"]', tpl.size ?? '');
        setValue('[name="toast-duration"]', String(tpl.duration ?? 0));
        setValue('[name="toast-sound"]', tpl.sound ?? 'sound-none');
        setValue('[name="toast-border-color"]', tpl.color || '#ac9f81');
        setValue('[name="toast-border-color-text"]', tpl.color || '#ac9f81');
        setValue('[name="toast-bg-color"]', tpl.backgroundColor || DEFAULT_BG_COLOR);
        setValue('[name="toast-bg-color-text"]', tpl.backgroundColor || DEFAULT_BG_COLOR);
        setValue('[name="toast-background"]', tpl.backgroundImage || '');
        setValue('[name="toast-image"]', tpl.image || '');
        // Templates saved before targets existed carry no publish — default them
        // to the game screen rather than leaving a stale prior choice in place.
        setValue('[name="toast-publish"]', tpl.publish || 'game');
        this._applyPublishState();

        // Only a template saved with text stamps the wording; otherwise whatever the
        // GM has typed is left alone (the built-ins carry no text at all).
        const includeText = tpl.includeText === true;
        const includeBox = root.querySelector('[name="toast-include-text"]');
        if (includeBox) includeBox.checked = includeText;
        if (includeText) {
            setValue('[name="toast-title"]', tpl.title ?? '');
            setValue('[name="toast-subtitle"]', tpl.subtitle ?? '');
        }

        this.selectedIcon = tpl.image ? IMAGE_MODE : String(tpl.icon ?? '');
        this._refreshIconSelection();
        root.querySelector('.blacksmith-toast-send-image-field')
            ?.classList.toggle('hidden', this.selectedIcon !== IMAGE_MODE);
        this._refreshTemplateControls();

        void this._savePreferences();
    }

    async _saveTemplateAs() {
        const selected = this._getRoot()?.querySelector('[name="toast-template"]')?.value;
        // A user's own template is a document: Save updates it in place. Only Custom
        // (an unsaved configuration) asks for a name. Built-ins never reach here —
        // their Save button is hidden.
        const updating = selected && selected !== CUSTOM_TEMPLATE && !BUILTIN_TEMPLATES[selected];

        let name = selected;
        if (!updating) {
            name = await foundry.applications.api.DialogV2.prompt({
                window: { title: 'Save Toast Template' },
                content: '<input type="text" name="template-name" placeholder="Template name" autofocus maxlength="40">',
                ok: {
                    label: 'Save',
                    callback: (_event, button) => button.form.elements['template-name']?.value?.trim()
                }
            }).catch(() => null);
            if (!name) return;
            if (BUILTIN_TEMPLATES[name] || name === CUSTOM_TEMPLATE) {
                ui.notifications.warn(`"${name}" is a reserved template name — pick another.`);
                return;
            }
        }
        const saved = { ...(game.settings.get(MODULE.ID, TEMPLATES_SETTING) || {}) };
        saved[name] = this._currentAppearance();
        await game.settings.set(MODULE.ID, TEMPLATES_SETTING, saved);

        // Update the selector in place rather than re-rendering: a re-render rebuilds
        // the form from preferences, and the title/message deliberately live only in
        // the DOM — so re-rendering here would discard wording the GM just typed
        // (and typing before saving is the normal flow).
        const select = this._getRoot()?.querySelector('[name="toast-template"]');
        if (select) {
            let option = [...select.options].find(o => o.value === name);
            if (!option) {
                option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            }
            select.value = name;
        }
        this._refreshTemplateControls();
        await this._savePreferences();
        ui.notifications.info(updating ? `Updated template "${name}".` : `Saved template "${name}".`);
    }

    async _deleteTemplate() {
        const root = this._getRoot();
        const name = root?.querySelector('[name="toast-template"]')?.value;
        if (!name || name === CUSTOM_TEMPLATE) return;
        if (BUILTIN_TEMPLATES[name]) {
            ui.notifications.warn('Built-in templates cannot be deleted.');
            return;
        }
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Toast Template' },
            content: `<p>Delete the template <strong>${foundry.utils.escapeHTML(name)}</strong>?</p>`
        }).catch(() => false);
        if (!confirmed) return;
        const saved = { ...(game.settings.get(MODULE.ID, TEMPLATES_SETTING) || {}) };
        delete saved[name];
        await game.settings.set(MODULE.ID, TEMPLATES_SETTING, saved);

        // In place, for the same reason as saving: keep the form (and any typed
        // wording) exactly as it is. The settings fall back to Custom — the form still
        // holds what was that template's look.
        const select = root.querySelector('[name="toast-template"]');
        if (select) {
            [...select.options].find(o => o.value === name)?.remove();
            select.value = CUSTOM_TEMPLATE;
        }
        this._refreshTemplateControls();
        await this._savePreferences();
    }

    _browseImage(inputName = 'toast-image') {
        const root = this._getRoot();
        const input = root?.querySelector(`[name="${inputName}"]`);
        if (!input) return;
        const PickerCls = foundry.applications?.apps?.FilePicker?.implementation
            ?? foundry.applications?.apps?.FilePicker;
        if (!PickerCls) return;
        new PickerCls({
            type: 'image',
            current: input.value || '',
            callback: (path) => {
                input.value = path;
                void this._savePreferences();
            }
        }).browse();
    }

    /** Play the currently selected sound locally, so the GM can audition it before sending. */
    _previewSound() {
        const sound = this._getRoot()?.querySelector('[name="toast-sound"]')?.value;
        if (!sound || sound === 'sound-none') return;
        void playSound(sound, window.COFFEEPUB?.SOUNDVOLUMENORMAL ?? 0.7, false, false);
    }

    _clearImage(inputName) {
        const input = this._getRoot()?.querySelector(`[name="${inputName}"]`);
        if (input) input.value = '';
        void this._savePreferences();
    }

    _selectIcon(target) {
        this.selectedIcon = String(target?.dataset?.icon ?? '');
        const root = this._getRoot();
        // Image and icon are mutually exclusive: image mode reveals the path field;
        // picking any icon hides it and clears the path.
        const imageField = root?.querySelector('.blacksmith-toast-send-image-field');
        if (this.selectedIcon === IMAGE_MODE) {
            imageField?.classList.remove('hidden');
        } else {
            imageField?.classList.add('hidden');
            const image = root?.querySelector('[name="toast-image"]');
            if (image) image.value = '';
        }
        this._refreshIconSelection();
        void this._savePreferences();
    }

    _refreshIconSelection() {
        const root = this._getRoot();
        for (const button of root?.querySelectorAll('.blacksmith-toast-send-icon') ?? []) {
            button.classList.toggle('selected', String(button.dataset.icon ?? '') === this.selectedIcon);
        }
    }

    async _savePreferences() {
        const root = this._getRoot();
        if (!root) return;
        const preferences = {
            party: root.querySelector('[name="toast-party"]')?.checked === true,
            recipients: [...root.querySelectorAll('[name="toast-recipient"]:checked')].map(input => input.value),
            publish: root.querySelector('[name="toast-publish"]')?.value || 'game',
            template: root.querySelector('[name="toast-template"]')?.value || 'Information',
            includeText: root.querySelector('[name="toast-include-text"]')?.checked === true,
            color: root.querySelector('[name="toast-border-color"]')?.value || '#ac9f81',
            backgroundColor: root.querySelector('[name="toast-bg-color"]')?.value || DEFAULT_BG_COLOR,
            size: root.querySelector('[name="toast-size"]')?.value || '',
            duration: Number(root.querySelector('[name="toast-duration"]')?.value ?? 0),
            sound: root.querySelector('[name="toast-sound"]')?.value || 'sound-none',
            // The IMAGE_MODE sentinel never persists as an icon — the stored image path is
            // what restores image mode on reopen (see constructor)
            icon: this.selectedIcon === IMAGE_MODE ? '' : this.selectedIcon,
            image: this.selectedIcon === IMAGE_MODE
                ? (root.querySelector('[name="toast-image"]')?.value?.trim() || '')
                : '',
            backgroundImage: root.querySelector('[name="toast-background"]')?.value?.trim() || ''
        };
        this.preferences = preferences;
        ToastSendWindow._preferenceSaveQueue = ToastSendWindow._preferenceSaveQueue.then(async () => {
            try {
                await game.settings.set(MODULE.ID, PREFS_SETTING, preferences);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Send Toast: failed to save preferences', error, false, false);
            }
        });
        await ToastSendWindow._preferenceSaveQueue;
    }

    async _send() {
        try {
            const root = this._getRoot();
            if (!root) return;

            const title = root.querySelector('[name="toast-title"]')?.value?.trim();
            if (!title) {
                ui.notifications.warn('A toast needs a title.');
                return;
            }
            const partyChecked = root.querySelector('[name="toast-party"]')?.checked === true;
            const publish = root.querySelector('[name="toast-publish"]')?.value || 'game';
            // Party resolves at send time to everyone online — minus excluded
            // users, so a camera/stream account is never swept in by the party box.
            // A stream-only send is view-addressed and has no user recipients.
            const recipients = publish === 'stream'
                ? []
                : partyChecked
                    ? game.users.filter(u => !u.isGM && u.active && !isToastExcludedUser(u)).map(u => u.id)
                    : [...root.querySelectorAll('[name="toast-recipient"]:checked')].map(cb => cb.value);
            if (publish !== 'stream' && !recipients.length) {
                ui.notifications.warn(partyChecked ? 'No players are online.' : 'Pick at least one recipient.');
                return;
            }

            const subtitle = root.querySelector('[name="toast-subtitle"]')?.value?.trim() || '';
            const duration = Number(root.querySelector('[name="toast-duration"]')?.value ?? 0);
            const size = root.querySelector('[name="toast-size"]')?.value || null;
            const imageMode = this.selectedIcon === IMAGE_MODE;
            const image = imageMode
                ? (root.querySelector('[name="toast-image"]')?.value?.trim() || null)
                : null;
            // Border and background colors are independent; a background image covers
            // the background color (the border keeps its color either way).
            const color = root.querySelector('[name="toast-border-color"]')?.value || null;
            const backgroundColor = root.querySelector('[name="toast-bg-color"]')?.value || null;
            const backgroundImage = root.querySelector('[name="toast-background"]')?.value?.trim() || null;
            const sound = root.querySelector('[name="toast-sound"]')?.value || null;
            const icon = imageMode ? null : (this.selectedIcon || null);

            await this._savePreferences();

            const payload = {
                title, subtitle, image, backgroundImage, icon, sound,
                color,
                backgroundColor,
                size,
                duration,
                publish,
                moduleId: 'blacksmith-core'
            };
            if (publish === 'stream') {
                // No user recipients — broadcast and let each client's show()
                // gate by view; only /stream pages render it.
                await broadcastToast(payload);
            } else {
                await sendToastToUsers(payload, recipients);
            }

            // Small GM confirmation (author decision 2026-07-19) — not an echo of the
            // announcement. Wears the Information template so the tool's own voice
            // matches the house default look.
            const names = publish === 'stream'
                ? []
                : partyChecked
                    ? ['Entire party']
                    : recipients.map(id => game.users.get(id)).filter(Boolean).map(u => u.character?.name || u.name);
            if (publish !== 'game') names.push('Stream');
            const info = BUILTIN_TEMPLATES['Information'];
            ToastManager.show({
                title: 'Toast sent',
                subtitle: names.join(', '),
                icon: info.icon,
                color: info.color,
                backgroundColor: info.backgroundColor,
                sound: info.sound,
                duration: 5,
                stackKey: 'blacksmith-toast-send-confirm'
            });

            this.close();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Send Toast: error sending', error, false, true);
            ui.notifications.error('Failed to send toast — see console.');
        }
    }
}
