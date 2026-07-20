// ==================================================================
// ===== WINDOW-TOAST-SEND – GM "Send Toast" tool ===================
// ==================================================================
// GM-only window (opened from the party menubar) that sends a large
// styled toast to selected players via the INTERNAL targeted relay
// (sendToastToUsers in api-toast.js). This is a Blacksmith feature
// consuming private plumbing — it is NOT the public cross-client
// toast API, which stays gated on the socket rewrite.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { ToastManager, sendToastToUsers } from './api-toast.js';

const APP_ID = 'blacksmith-toast-send-window';

export class ToastSendWindow extends BlacksmithWindowBaseV2 {

    static ROOT_CLASS = 'blacksmith-window-template-root';

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
        'toast-browse-background': () => ToastSendWindow._ref?._browseImage('toast-background')
    };

    constructor(options = {}) {
        super(options);
        ToastSendWindow._ref = this;
    }

    async getData() {
        const esc = foundry.utils.escapeHTML;

        // Non-GM users; active ones enabled and pre-checked, offline disabled.
        const recipientRows = game.users
            .filter(u => !u.isGM)
            .map(u => `
                <label class="blacksmith-toast-send-recipient${u.active ? '' : ' offline'}">
                    <input type="checkbox" name="toast-recipient" value="${esc(u.id)}"
                        ${u.active ? 'checked' : 'disabled'}>
                    <img src="${esc(u.character?.img || u.avatar || 'icons/svg/mystery-man.svg')}" alt="">
                    <span>${esc(u.character?.name || u.name)}${u.active ? '' : ' (offline)'}</span>
                </label>`)
            .join('');

        const styleOptions = ['announcement', ...ToastManager.STYLES.filter(s => s !== 'announcement'), '']
            .map(s => `<option value="${s}">${s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Default'}</option>`)
            .join('');

        const bodyContent = `
            <div class="blacksmith-toast-send-form">
                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-users"></i>
                        <span>Recipients</span>
                    </div>
                    <label class="blacksmith-toast-send-recipient blacksmith-toast-send-party">
                        <input type="checkbox" name="toast-party">
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
                                <option value="large" selected>Large</option>
                                <option value="">Default (fits content)</option>
                                <option value="vw40">40% of screen</option>
                                <option value="vw60">60% of screen</option>
                                <option value="vw80">80% of screen</option>
                                <option value="fullscreen">Fullscreen overlay</option>
                            </select>
                        </div>
                        <div class="blacksmith-field">
                            <label class="blacksmith-field-label">Duration</label>
                            <select class="blacksmith-input" name="toast-duration">
                                <option value="0">Until closed</option>
                                <option value="10">10 seconds</option>
                                <option value="20">20 seconds</option>
                                <option value="30">30 seconds</option>
                                <option value="60">1 minute</option>
                            </select>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Image</label>
                        <div class="blacksmith-toast-send-image-row">
                            <input type="text" class="blacksmith-input" name="toast-image" placeholder="Avatar image path (optional)">
                            <button type="button" class="blacksmith-window-btn-secondary" data-action="toast-browse-image"
                                title="Browse for image"><i class="fa-solid fa-folder-open"></i> Browse</button>
                        </div>
                    </div>
                    <div class="blacksmith-field">
                        <label class="blacksmith-field-label">Background</label>
                        <div class="blacksmith-toast-send-image-row">
                            <input type="text" class="blacksmith-input" name="toast-background" placeholder="Background image path (optional)">
                            <button type="button" class="blacksmith-window-btn-secondary" data-action="toast-browse-background"
                                title="Browse for image"><i class="fa-solid fa-folder-open"></i> Browse</button>
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
        party?.addEventListener('change', () => {
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
        });
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
            callback: (path) => { input.value = path; }
        }).browse();
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
            const image = root.querySelector('[name="toast-image"]')?.value?.trim() || null;
            const backgroundImage = root.querySelector('[name="toast-background"]')?.value?.trim() || null;

            await sendToastToUsers({
                title, subtitle, image, backgroundImage,
                // No image chosen → give the announcement a visual anchor anyway
                icon: image ? null : 'fas fa-bullhorn',
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
