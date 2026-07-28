// ==================================================================
// ===== UI-GMNOTES-FIELD – Reusable GM Notes sheet component =======
// ==================================================================

import { GMNotesManager } from './manager-gmnotes.js';
import { GMNotesWindow } from './window-gmnotes.js';

export class GMNotesFieldController {
    static async create(uuidOrDoc, options = {}) {
        const controller = new this(uuidOrDoc, options);
        await controller.initialize();
        return controller;
    }

    constructor(uuidOrDoc, options = {}) {
        this.target = uuidOrDoc;
        this.options = {
            label: 'GM Notes',
            collapsed: undefined,
            editable: true,
            replace: true,
            className: '',
            ...options
        };
        this.document = null;
        this.capability = null;
        this.element = document.createElement('section');
        this._hookId = null;
        this._destroyed = false;
    }

    async initialize() {
        this.document = await GMNotesManager._resolveDocAsync(this.target);
        this.target = this.document ?? this.target;
        this.capability = await GMNotesManager.canSet(this.target);
        this._build();
        await this.refresh();
        this._hookId = Hooks.on(GMNotesManager.CHANGE_HOOK, ({ uuid }) => {
            if (uuid === this.document?.uuid) void this.refresh();
        });
        return this;
    }

    _build() {
        const extraClass = String(this.options.className || '').trim();
        this.element.className = [
            'blacksmith-gm-notes-field',
            'blacksmith-window-section',
            extraClass
        ].filter(Boolean).join(' ');
        if (this.document?.uuid) this.element.dataset.docUuid = this.document.uuid;
        this.element.innerHTML = `
            <header class="blacksmith-gm-notes-field-header">
                <button type="button" class="blacksmith-gm-notes-field-collapse"
                        data-tooltip="Toggle GM Notes" aria-expanded="true">
                    <i class="fa-solid fa-feather" inert></i>
                    <span></span>
                </button>
                <button type="button" class="blacksmith-gm-notes-field-edit"
                        data-tooltip="Edit GM Notes" aria-label="Edit GM Notes">
                    <i class="fa-solid fa-pen-to-square" inert></i>
                </button>
            </header>
            <div class="blacksmith-gm-notes-field-status" role="status"></div>
            <div class="blacksmith-gm-notes-field-content"></div>
        `;
        this.element.querySelector('.blacksmith-gm-notes-field-collapse span').textContent =
            String(this.options.label || 'GM Notes');

        const saved = this._getCollapseState();
        const collapsed = saved ?? Boolean(this.options.collapsed);
        this._setCollapsed(collapsed, false);

        this.element.querySelector('.blacksmith-gm-notes-field-collapse')
            .addEventListener('click', () => this._setCollapsed(!this.isCollapsed));
        this.element.querySelector('.blacksmith-gm-notes-field-edit')
            .addEventListener('click', () => this.openEditor());
    }

    get isCollapsed() {
        return this.element.classList.contains('collapsed');
    }

    get readOnly() {
        return this.options.editable === false || !this.capability?.allowed;
    }

    _applyReadOnlyState() {
        this.element.classList.toggle('read-only', this.readOnly);
        this.element.dataset.gmNotesReadOnly = String(this.readOnly);
    }

    _setCollapsed(collapsed, persist = true) {
        this.element.classList.toggle('collapsed', Boolean(collapsed));
        this.element.querySelector('.blacksmith-gm-notes-field-collapse')
            ?.setAttribute('aria-expanded', String(!collapsed));
        if (persist) this._setCollapseState(Boolean(collapsed));
    }

    _collapseKey() {
        return `blacksmith-gm-notes-field-collapse-${this.document?.uuid ?? String(this.target)}`;
    }

    _getCollapseState() {
        try {
            const value = localStorage.getItem(this._collapseKey());
            return value == null ? undefined : value === 'true';
        } catch (_) {
            return undefined;
        }
    }

    _setCollapseState(collapsed) {
        try {
            localStorage.setItem(this._collapseKey(), String(collapsed));
        } catch (_) {}
    }

    async refresh() {
        if (this._destroyed) return this;
        const content = this.element.querySelector('.blacksmith-gm-notes-field-content');
        const status = this.element.querySelector('.blacksmith-gm-notes-field-status');
        const edit = this.element.querySelector('.blacksmith-gm-notes-field-edit');

        if (!game.user?.isGM) {
            this.element.hidden = true;
            return this;
        }
        this.element.hidden = false;

        if (!this.document) {
            this._applyReadOnlyState();
            status.textContent = 'The target document could not be resolved.';
            content.replaceChildren();
            edit.disabled = true;
            return this;
        }

        this.capability = await GMNotesManager.canSet(this.document);
        this._applyReadOnlyState();
        const mayEdit = this.options.editable !== false && this.capability.allowed;
        const unavailableMessage = this.options.editable === false
            ? 'This GM Notes field is read only.'
            : this.capability.message;
        edit.disabled = !mayEdit;
        edit.dataset.tooltip = mayEdit ? 'Edit GM Notes' : unavailableMessage;
        status.textContent = mayEdit ? '' : unavailableMessage;
        status.hidden = !status.textContent;

        const note = await GMNotesManager.getNoteAsync(this.document);
        const hasContent = !!(note?.text?.trim() || note?.html?.trim());
        this.element.classList.toggle('has-notes', hasContent);
        this.element.classList.toggle('empty', !hasContent);
        content.innerHTML = hasContent
            ? await this._enrich(note.html)
            : '<p class="blacksmith-gm-notes-field-empty">No GM notes.</p>';
        return this;
    }

    async _enrich(html) {
        const ns = foundry?.applications?.ux?.TextEditor;
        const TE = ns?.implementation ?? ns ?? globalThis.TextEditor;
        try {
            return await TE.enrichHTML(html, { relativeTo: this.document, secrets: true });
        } catch (_) {
            return html || '';
        }
    }

    openEditor() {
        if (!this.document || !this.capability?.allowed || this.options.editable === false) return null;
        const app = new GMNotesWindow({
            uuid: this.document.uuid,
            title: this.document.name
        });
        app.render(true);
        return app;
    }

    mount(root, { replace = this.options.replace } = {}) {
        if (!root || typeof root.replaceChildren !== 'function' || typeof root.appendChild !== 'function') {
            throw new TypeError('GMNotesFieldController.mount requires an HTMLElement');
        }
        if (replace) root.replaceChildren(this.element);
        else root.appendChild(this.element);
        return this;
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this._hookId != null) Hooks.off(GMNotesManager.CHANGE_HOOK, this._hookId);
        this._hookId = null;
        this.element.remove();
    }
}
