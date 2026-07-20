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
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { ToastManager, sendToastToUsers } from './api-toast.js';

const APP_ID = 'blacksmith-toast-send-window';
const PREFS_SETTING = 'toastSendPreferences';
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
            position: { width: 520, height: 'auto' },
            window: { title: 'Send Toast', resizable: false, minimizable: true, icon: 'fas fa-bullhorn' }
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
        'toast-select-icon': (_event, target) => ToastSendWindow._ref?._selectIcon(target)
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
        const recipientRows = game.users
            .filter(u => !u.isGM)
            .map(u => `
                <label class="blacksmith-toast-send-recipient${u.active ? '' : ' offline'}">
                    <input type="checkbox" name="toast-recipient" value="${esc(u.id)}"
                        ${u.active && (prefs.party || !Array.isArray(prefs.recipients) || prefs.recipients.includes(u.id)) ? 'checked' : ''}
                        ${u.active ? '' : 'disabled'}>
                    <img src="${esc(u.character?.img || u.avatar || 'icons/svg/mystery-man.svg')}" alt="">
                    <span>${esc(u.character?.name || u.name)}${u.active ? '' : ' (offline)'}</span>
                </label>`)
            .join('');

        const styleOptions = ['announcement', ...ToastManager.STYLES.filter(s => s !== 'announcement'), '']
            .map(s => `<option value="${s}"${String(prefs.style ?? 'announcement') === s ? ' selected' : ''}>${s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Default'}</option>`)
            .join('');
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
                <div class="blacksmith-window-section">
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
                            <label class="blacksmith-field-label">Style</label>
                            <select class="blacksmith-input" name="toast-style">${styleOptions}</select>
                        </div>
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
                                ${[0, 10, 20, 30, 60].map(value => `<option value="${value}"${Number(prefs.duration ?? 0) === value ? ' selected' : ''}>${value === 0 ? 'Until closed' : (value === 60 ? '1 minute' : `${value} seconds`)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Sound</label>
                        <select class="blacksmith-input" name="toast-sound">${soundOptions}</select>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Icon</label>
                        <div class="blacksmith-toast-send-icons">${iconButtons}</div>
                    </div>
                    <div class="blacksmith-field blacksmith-toast-send-image-field${this.selectedIcon === IMAGE_MODE ? '' : ' hidden'}">
                        <label class="blacksmith-field-label">Image</label>
                        <div class="blacksmith-toast-send-image-row">
                            <input type="text" class="blacksmith-input" name="toast-image" value="${esc(prefs.image || '')}" placeholder="Avatar image path">
                            <button type="button" class="blacksmith-toast-send-clear" data-action="toast-clear-image" data-tooltip="Clear image" aria-label="Clear image"><i class="fa-solid fa-xmark"></i></button>
                            <button type="button" class="blacksmith-window-btn-secondary" data-action="toast-browse-image"
                                data-tooltip="Browse for image"><i class="fa-solid fa-folder-open"></i> Browse</button>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Background</label>
                        <div class="blacksmith-toast-send-image-row">
                            <input type="text" class="blacksmith-input" name="toast-background" value="${esc(prefs.backgroundImage || '')}" placeholder="Background image path (optional)">
                            <button type="button" class="blacksmith-toast-send-clear" data-action="toast-clear-background" data-tooltip="Clear background" aria-label="Clear background"><i class="fa-solid fa-xmark"></i></button>
                            <button type="button" class="blacksmith-window-btn-secondary" data-action="toast-browse-background"
                                data-tooltip="Browse for image"><i class="fa-solid fa-folder-open"></i> Browse</button>
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

        for (const input of root.querySelectorAll('input, select')) {
            if (['toast-title', 'toast-subtitle', 'toast-party'].includes(input.name)) continue;
            input.addEventListener('change', () => {
                void this._savePreferences();
            });
        }
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
            style: root.querySelector('[name="toast-style"]')?.value || '',
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
            const recipients = partyChecked
                ? game.users.filter(u => !u.isGM && u.active).map(u => u.id)
                : [...root.querySelectorAll('[name="toast-recipient"]:checked')].map(cb => cb.value);
            if (!recipients.length) {
                ui.notifications.warn(partyChecked ? 'No players are online.' : 'Pick at least one recipient.');
                return;
            }

            const subtitle = root.querySelector('[name="toast-subtitle"]')?.value?.trim() || '';
            const style = root.querySelector('[name="toast-style"]')?.value || null;
            const duration = Number(root.querySelector('[name="toast-duration"]')?.value ?? 0);
            const size = root.querySelector('[name="toast-size"]')?.value || null;
            const imageMode = this.selectedIcon === IMAGE_MODE;
            const image = imageMode
                ? (root.querySelector('[name="toast-image"]')?.value?.trim() || null)
                : null;
            const backgroundImage = root.querySelector('[name="toast-background"]')?.value?.trim() || null;
            const sound = root.querySelector('[name="toast-sound"]')?.value || null;
            const icon = imageMode ? null : (this.selectedIcon || null);

            await this._savePreferences();

            await sendToastToUsers({
                title, subtitle, image, backgroundImage, icon, sound,
                style: style || null,
                size,
                duration,
                moduleId: 'blacksmith-core'
            }, recipients);

            // Small GM confirmation (author decision 2026-07-19) — not an echo of the announcement
            const names = partyChecked
                ? ['Entire party']
                : recipients.map(id => game.users.get(id)).filter(Boolean).map(u => u.character?.name || u.name);
            ToastManager.show({
                title: 'Toast sent',
                subtitle: names.join(', '),
                icon: 'fas fa-bullhorn',
                style: 'info',
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
