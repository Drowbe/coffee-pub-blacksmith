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
        this._providersHookId = null;
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
        this._providersHookId = Hooks.on(GMNotesManager.PROVIDERS_HOOK, () => void this.refresh());
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
            <div class="blacksmith-gm-notes-field-body">
                <div class="blacksmith-gm-notes-field-content"></div>
                <div class="blacksmith-gm-notes-sections"></div>
            </div>
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
        const sectionsHost = this.element.querySelector('.blacksmith-gm-notes-sections');
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
            sectionsHost.replaceChildren();
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

        const [note, sections] = await Promise.all([
            GMNotesManager.getNoteAsync(this.document),
            GMNotesManager.getSections(this.document)
        ]);
        const hasContent = !!(note?.text?.trim() || note?.html?.trim());
        const hasSections = sections.length > 0;
        this.element.classList.toggle('has-notes', hasContent || hasSections);
        this.element.classList.toggle('empty', !hasContent && !hasSections);
        content.innerHTML = hasContent
            ? await this._enrich(note.html)
            : '<p class="blacksmith-gm-notes-field-empty">No GM notes.</p>';
        await this._renderSections(sectionsHost, sections);
        return this;
    }

    async _renderSections(host, sections) {
        host.replaceChildren();
        const ordered = [
            ...sections.filter(section => section.source === 'persisted'),
            ...sections.filter(section => section.source === 'contributed')
        ];
        for (const section of ordered) {
            const state = this._getSectionState(section);
            const card = document.createElement('section');
            card.className = 'blacksmith-gm-notes-section';
            card.dataset.moduleId = section.moduleId;
            card.dataset.sectionId = section.id;
            card.classList.toggle('collapsed', state.collapsed);
            card.classList.toggle('hidden-content', state.hidden);

            const header = document.createElement('header');
            header.className = 'blacksmith-gm-notes-section-header';
            const title = document.createElement('button');
            title.type = 'button';
            title.className = 'blacksmith-gm-notes-section-collapse';
            title.dataset.tooltip = 'Collapse or expand this section';
            title.setAttribute('aria-expanded', String(!state.collapsed));
            const icon = document.createElement('i');
            icon.className = this._iconClasses(section.icon);
            icon.setAttribute('inert', '');
            const label = document.createElement('span');
            label.textContent = section.label || section.id;
            title.append(icon, label);

            const attribution = document.createElement('span');
            attribution.className = 'blacksmith-gm-notes-section-attribution';
            attribution.textContent = game.modules?.get(section.moduleId)?.title ?? section.moduleId;
            const visibility = document.createElement('button');
            visibility.type = 'button';
            visibility.className = 'blacksmith-gm-notes-section-visibility';
            visibility.dataset.tooltip = state.hidden ? 'Show this section' : 'Hide this section';
            visibility.setAttribute('aria-label', visibility.dataset.tooltip);
            visibility.innerHTML = `<i class="fa-solid ${state.hidden ? 'fa-eye-slash' : 'fa-eye'}" inert></i>`;
            header.append(title, attribution, visibility);

            const body = document.createElement('div');
            body.className = 'blacksmith-gm-notes-section-content';
            body.innerHTML = await this._enrich(section.html);
            title.addEventListener('click', () => {
                const collapsed = !card.classList.contains('collapsed');
                card.classList.toggle('collapsed', collapsed);
                title.setAttribute('aria-expanded', String(!collapsed));
                this._setSectionState(section, { ...this._getSectionState(section), collapsed });
            });
            visibility.addEventListener('click', () => {
                const hidden = !card.classList.contains('hidden-content');
                card.classList.toggle('hidden-content', hidden);
                visibility.dataset.tooltip = hidden ? 'Show this section' : 'Hide this section';
                visibility.setAttribute('aria-label', visibility.dataset.tooltip);
                visibility.innerHTML = `<i class="fa-solid ${hidden ? 'fa-eye-slash' : 'fa-eye'}" inert></i>`;
                this._setSectionState(section, { ...this._getSectionState(section), hidden });
            });
            card.append(header, body);
            host.append(card);
        }
    }

    _iconClasses(icon) {
        const classes = String(icon || '').trim().split(/\s+/).filter(Boolean);
        if (!classes.length) return 'fa-solid fa-puzzle-piece';
        if (!classes.some(value => value.startsWith('fa-'))) classes.unshift('fa-solid');
        else if (!classes.some(value => ['fa-solid', 'fa-regular', 'fa-brands'].includes(value))) classes.unshift('fa-solid');
        return classes.join(' ');
    }

    _sectionStateKey(section) {
        return `blacksmith-gm-notes-section-${this.document?.uuid}-${section.moduleId}-${section.id}`;
    }

    _getSectionState(section) {
        try {
            return JSON.parse(localStorage.getItem(this._sectionStateKey(section))) || {};
        } catch (_) {
            return {};
        }
    }

    _setSectionState(section, state) {
        try {
            localStorage.setItem(this._sectionStateKey(section), JSON.stringify(state));
        } catch (_) {}
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
        if (this._providersHookId != null) Hooks.off(GMNotesManager.PROVIDERS_HOOK, this._providersHookId);
        this._hookId = null;
        this._providersHookId = null;
        this.element.remove();
    }
}
