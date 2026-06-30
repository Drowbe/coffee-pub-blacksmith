import { MODULE } from './const.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { copyToClipboard } from './utility-common.js';

const BODY_TEMPLATE = `modules/${MODULE.ID}/templates/window-json-import-body.hbs`;

export class JsonImportWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-template-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-json-import-window',
            classes: ['coffee-pub-blacksmith', 'blacksmith-json-import-window-app', 'blacksmith-json-import-window'],
            position: { width: 920, height: 680 },
            window: { title: 'Import JSON', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 760, minHeight: 520 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-template.hbs`
        }
    };

    static ACTION_HANDLERS = {
        selectTab: (_event, target) => JsonImportWindow._ref?._selectTab(target),
        copyTemplate: () => JsonImportWindow._ref?._copyTemplate(),
        saveTemplate: () => JsonImportWindow._ref?._saveTemplate(),
        selectFile: () => JsonImportWindow._ref?._selectFile(),
        importJson: () => JsonImportWindow._ref?._importJson()
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        const idSuffix = String(opts.idSuffix || opts.kind || 'generic')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (idSuffix) opts.id = `blacksmith-json-import-window-${idSuffix}`;
        opts.promptFilePrefix = opts.promptFilePrefix || idSuffix || 'prompt';
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, JsonImportWindow.DEFAULT_OPTIONS.window ?? {}),
            { title: opts.windowTitle || 'Import JSON' }
        );
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, JsonImportWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        super(opts);

        this.windowTitle = opts.windowTitle || 'Import JSON';
        this.headerTitle = opts.headerTitle || this.windowTitle;
        this.windowSubtitle = opts.windowSubtitle || '';
        this.windowIcon = opts.windowIcon || 'fa-solid fa-file-import';
        this.templateOptions = Array.isArray(opts.templateOptions) ? opts.templateOptions : [];
        this.selectedTemplate = opts.selectedTemplate || this.templateOptions[0]?.value || '';
        this.textareaPlaceholder = opts.textareaPlaceholder || 'Paste JSON here, or use Select JSON File below.';
        this.fileInputAccept = opts.fileInputAccept || '.json,application/json';
        this.initialJson = opts.initialJson || '';
        this.copyTemplateLabel = opts.copyTemplateLabel || 'Copy to Clipboard';
        this.saveTemplateLabel = opts.saveTemplateLabel || 'Save as Text File';
        this.selectFileLabel = opts.selectFileLabel || 'Select JSON File';
        this.importLabel = opts.importLabel || 'Import JSON';
        this.promptFilePrefix = opts.promptFilePrefix || 'prompt';
        this.onBuildPrompt = typeof opts.onBuildPrompt === 'function' ? opts.onBuildPrompt : null;
        this.onImport = typeof opts.onImport === 'function' ? opts.onImport : null;
        this.promptCheckboxes = Array.isArray(opts.promptCheckboxes) ? opts.promptCheckboxes : [];
        this.promptFields = Array.isArray(opts.promptFields) ? opts.promptFields : [];
        this.journalAreaUi = opts.journalAreaUi && typeof opts.journalAreaUi === 'object'
            ? opts.journalAreaUi
            : null;
        this.journalLocationUi = opts.journalLocationUi && typeof opts.journalLocationUi === 'object'
            ? opts.journalLocationUi
            : null;
        this.activeTab = opts.activeTab === 'import' ? 'import' : 'copy';
    }

    _buildToolsContent(isCopyTab) {
        return `
            <div class="blacksmith-json-import-tools-stack">
                <div class="blacksmith-json-import-tools-row blacksmith-json-import-tabs-row">
                    <nav class="blacksmith-tabs" role="tablist">
                        <button type="button" class="blacksmith-tab ${isCopyTab ? 'is-active' : ''}" data-action="selectTab" data-value="copy" role="tab" aria-selected="${isCopyTab}">
                            <i class="fa-solid fa-clipboard"></i><span>Copy Prompt</span>
                        </button>
                        <button type="button" class="blacksmith-tab ${!isCopyTab ? 'is-active' : ''}" data-action="selectTab" data-value="import" role="tab" aria-selected="${!isCopyTab}">
                            <i class="fa-solid fa-file-import"></i><span>Import JSON</span>
                        </button>
                    </nav>
                </div>
            </div>
        `;
    }

    _buildActionBarLeft(isCopyTab) {
        if (isCopyTab) return '';
        const accept = String(this.fileInputAccept || '.json,application/json')
            .replace(/"/g, '&quot;');
        return `
            <input class="blacksmith-json-import-file-input" type="file" accept="${accept}" hidden>
            <button type="button" class="blacksmith-window-btn-secondary blacksmith-json-import-select-file" data-action="selectFile">
                <i class="fa-solid fa-folder-open"></i> ${this.selectFileLabel}
            </button>
        `;
    }

    _buildActionBarRight(isCopyTab) {
        if (isCopyTab) {
            const disabled = this.templateOptions.length === 0 ? ' disabled' : '';
            return `
                <button type="button" class="blacksmith-window-btn-secondary blacksmith-json-import-save-template" data-action="saveTemplate"${disabled}>
                    <i class="fa-solid fa-file-arrow-down"></i> ${this.saveTemplateLabel}
                </button>
                <button type="button" class="blacksmith-window-btn-primary blacksmith-json-import-copy-template" data-action="copyTemplate"${disabled}>
                    <i class="fa-solid fa-clipboard"></i> ${this.copyTemplateLabel}
                </button>
            `;
        }
        return `
            <button type="button" class="blacksmith-window-btn-primary blacksmith-json-import-submit" data-action="importJson">
                <i class="fa-solid fa-file-import"></i> ${this.importLabel}
            </button>
        `;
    }

    _persistFormStateFromDom() {
        const root = this.element;
        if (!root) return;

        const textarea = root.querySelector('.blacksmith-json-import-textarea');
        if (textarea) this.initialJson = String(textarea.value ?? '');

        const templateSelect = root.querySelector('.blacksmith-json-import-template-select');
        if (templateSelect) this.selectedTemplate = templateSelect.value || this.selectedTemplate;

        for (const field of this.promptFields) {
            const id = String(field?.id || '').trim();
            if (!id) continue;
            const input = root.querySelector(`[data-prompt-field="${id}"]`);
            if (input) field.value = String(input.value ?? '').trim();
        }

        for (const cb of this.promptCheckboxes) {
            const id = String(cb?.id || '').trim();
            if (!id) continue;
            const input = root.querySelector(`[data-prompt-checkbox="${id}"]`);
            if (input) cb.checked = !!input.checked;
        }

        this._persistJournalUiFromDom(this.journalAreaUi);
        this._persistJournalUiFromDom(this.journalLocationUi);
    }

    /**
     * @param {object|null} ui
     */
    _persistJournalUiFromDom(ui) {
        if (!ui) return;
        const state = this._getJournalTemplateUiFieldState(ui);
        if (ui.folder?.id && state[ui.folder.id] !== undefined) {
            ui.folder.value = state[ui.folder.id];
        }
        if (ui.journal?.id && state[ui.journal.id] !== undefined) {
            ui.journal.value = state[ui.journal.id];
        }
        if (ui.title?.id && state[ui.title.id] !== undefined) {
            ui.title.value = state[ui.title.id];
        }
        if (ui.additionalContext?.id && state[ui.additionalContext.id] !== undefined) {
            ui.additionalContext.value = state[ui.additionalContext.id];
        }
        for (const field of ui.geography ?? []) {
            if (field.id && state[field.id] !== undefined) field.value = state[field.id];
        }
        const defaultId = String(ui.geographyDefault?.id || 'geographyDefault').trim();
        if (ui.geographyDefault && defaultId in state) {
            ui.geographyDefault.checked = !!state[defaultId];
        }
        if (ui.locationImage?.fieldId && state[ui.locationImage.fieldId] !== undefined) {
            ui.locationImage.value = state[ui.locationImage.fieldId];
        }
        for (const row of ui.images ?? []) {
            if (row.fieldId && state[row.fieldId] !== undefined) row.value = state[row.fieldId];
            const checkboxId = String(row?.checkboxId || '').trim();
            if (checkboxId && checkboxId in state) row.checked = !!state[checkboxId];
        }
    }

    /**
     * @param {HTMLElement|null} target
     */
    _selectTab(target) {
        this._persistFormStateFromDom();
        const tab = target?.dataset?.value === 'import' ? 'import' : 'copy';
        this.activeTab = tab;
        void this.render(true);
    }

    _selectFile() {
        const root = this.element;
        const fileInput = root?.querySelector('.blacksmith-json-import-file-input');
        fileInput?.click();
    }

    async _copyTemplate() {
        if (!this.onBuildPrompt) return;
        const root = this.element;
        const copyButton = root?.querySelector('.blacksmith-json-import-copy-template');
        ui.notifications.info('Gathering data to put on the clipboard, please wait...');
        if (copyButton) copyButton.disabled = true;
        try {
            const prompt = await this.onBuildPrompt(this.selectedTemplate, this._getPromptOptions());
            const copied = await copyToClipboard(String(prompt ?? ''), { notify: false });
            if (copied !== false) {
                ui.notifications.info('Prompt copied to the clipboard');
            }
        } catch (error) {
            const message = error?.message || String(error);
            ui.notifications.error(`Failed to copy prompt: ${message}`);
        } finally {
            if (copyButton) copyButton.disabled = false;
        }
    }

    async _saveTemplate() {
        if (!this.onBuildPrompt) return;
        const root = this.element;
        const saveButton = root?.querySelector('.blacksmith-json-import-save-template');
        ui.notifications.info('Gathering data to save, please wait...');
        if (saveButton) saveButton.disabled = true;
        try {
            const prompt = String((await this.onBuildPrompt(this.selectedTemplate, this._getPromptOptions())) ?? '');
            const template = String(this.selectedTemplate || 'prompt')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            const filename = `blacksmith-${this.promptFilePrefix}-${template || 'prompt'}.txt`;
            this._downloadTextFile(filename, prompt);
            ui.notifications.info(`Prompt saved as ${filename}`);
        } catch (error) {
            const message = error?.message || String(error);
            ui.notifications.error(`Failed to save prompt: ${message}`);
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    }

    /**
     * Trigger a download of plain text content. Uses Foundry's saveDataToFile,
     * which sets the dataset.downloadurl hint and defers revoking the object URL
     * so the download works inside Foundry's Electron shell.
     * @param {string} filename
     * @param {string} text
     */
    _downloadTextFile(filename, text) {
        foundry.utils.saveDataToFile(text, 'text/plain', filename);
    }

    async _importJson() {
        if (!this.onImport) {
            this.close();
            return;
        }
        const root = this.element;
        const textarea = root?.querySelector('.blacksmith-json-import-textarea');
        const payload = textarea?.value || '';
        const ok = await this.onImport(payload);
        if (ok !== false) {
            this.close();
        }
    }

    _getPromptCheckboxState() {
        const state = {};
        const root = this.element;
        if (!root) return state;
        for (const cb of this.promptCheckboxes) {
            const id = String(cb?.id || '').trim();
            if (!id) continue;
            const input = root.querySelector(`[data-prompt-checkbox="${id}"]`);
            state[id] = !!input?.checked;
        }
        return state;
    }

    _getPromptFieldState() {
        const state = {};
        const root = this.element;
        if (!root) return state;
        for (const field of this.promptFields) {
            const id = String(field?.id || '').trim();
            if (!id) continue;
            const input = root.querySelector(`[data-prompt-field="${id}"]`);
            state[id] = input ? String(input.value ?? '').trim() : String(field.value ?? '').trim();
        }
        return state;
    }

    /**
     * @param {object|null} ui
     * @returns {Record<string, string|boolean>}
     */
    _getJournalTemplateUiFieldState(ui) {
        const state = {};
        const root = this.element;
        if (!ui || !root) return state;

        const templateKey = String(ui.showForTemplate || '').trim();
        const container = templateKey
            ? root.querySelector(`[data-for-template="${templateKey}"]`)
            : root;
        if (!container) return state;

        const readField = (id, fallback = '') => {
            const key = String(id || '').trim();
            if (!key) return;
            const input = container.querySelector(`[data-prompt-field="${key}"]`);
            state[key] = input ? String(input.value ?? '').trim() : String(fallback).trim();
        };

        readField(ui.folder?.id, ui.folder?.value);
        readField(ui.journal?.id, ui.journal?.value);
        readField(ui.title?.id, ui.title?.value);
        readField(ui.additionalContext?.id, ui.additionalContext?.value);

        for (const field of ui.geography ?? []) {
            readField(field.id, field.value);
        }

        const defaultId = String(ui.geographyDefault?.id || 'geographyDefault').trim();
        const defaultInput = container.querySelector(`[data-prompt-checkbox="${defaultId}"]`);
        state[defaultId] = !!defaultInput?.checked;

        if (ui.locationImage?.fieldId) {
            readField(ui.locationImage.fieldId, ui.locationImage.value);
        }

        for (const row of ui.images ?? []) {
            readField(row.fieldId, row.value);
            const checkboxId = String(row?.checkboxId || '').trim();
            if (checkboxId) {
                const input = container.querySelector(`[data-prompt-checkbox="${checkboxId}"]`);
                state[checkboxId] = !!input?.checked;
            }
            const defaultCheckboxId = String(row?.defaultCheckboxId || '').trim();
            if (defaultCheckboxId) {
                const imageDefaultInput = container.querySelector(
                    `[data-prompt-checkbox="${defaultCheckboxId}"]`
                );
                state[defaultCheckboxId] = !!imageDefaultInput?.checked;
            }
        }

        return state;
    }

    _getPromptOptions() {
        return {
            ...this._getPromptCheckboxState(),
            ...this._getPromptFieldState(),
            ...this._getJournalTemplateUiFieldState(this.journalAreaUi),
            ...this._getJournalTemplateUiFieldState(this.journalLocationUi)
        };
    }

    _templateMatchesForAttribute(forTemplateAttr, template) {
        const tokens = String(forTemplateAttr ?? '').trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) return true;
        return tokens.includes(template);
    }

    _updatePromptFieldVisibility() {
        const root = this.element;
        if (!root) return;
        const template = this.selectedTemplate || '';

        if (this.promptFields.length) {
            for (const row of root.querySelectorAll(
                '.blacksmith-json-import-prompt-field-row, .blacksmith-json-import-prompt-fields-header[data-for-template], .blacksmith-json-import-prompt-field-group-header'
            )) {
                const forTemplate = row.getAttribute('data-for-template') || '';
                const show = this._templateMatchesForAttribute(forTemplate, template);
                row.hidden = !show;
            }
            const block = root.querySelector('.blacksmith-json-import-prompt-fields');
            if (block) {
                const anyVisible = !!root.querySelector('.blacksmith-json-import-prompt-field-row:not([hidden])');
                block.hidden = !anyVisible;
            }
        }

        if (this.promptCheckboxes.length) {
            for (const row of root.querySelectorAll(
                '.blacksmith-json-import-prompt-checkbox, .blacksmith-json-import-prompt-options-hint, .blacksmith-json-import-prompt-section-header'
            )) {
                const forTemplate = row.getAttribute('data-for-template') || '';
                const show = !forTemplate || forTemplate === template;
                row.hidden = !show;
            }
            const optionsBlock = root.querySelector('.blacksmith-json-import-prompt-options');
            if (optionsBlock) {
                const anyVisible = !!root.querySelector('.blacksmith-json-import-prompt-checkbox:not([hidden])');
                optionsBlock.hidden = !anyVisible;
            }
        }

        for (const journalBlock of root.querySelectorAll(
            '.blacksmith-json-import-journal-area, .blacksmith-json-import-journal-location'
        )) {
            const forTemplate = journalBlock.getAttribute('data-for-template') || '';
            journalBlock.hidden = forTemplate !== template;
        }
    }

    /**
     * Group the flat prompt-checkbox list into ordered display sections. Consecutive
     * checkboxes sharing a `section` label render under one header; checkboxes with no
     * section (e.g. the world options) render headerless after the sections.
     * @returns {Array<object>}
     */
    _buildPromptCheckboxGroups() {
        const groups = [];
        let current = null;
        for (const cb of this.promptCheckboxes) {
            const section = String(cb.section || '');
            if (!current || current.section !== section) {
                current = {
                    section,
                    hasSection: !!section,
                    sectionIcon: cb.sectionIcon || 'fa-solid fa-book',
                    stacked: !!cb.stacked,
                    showForTemplate: cb.showForTemplate ?? '',
                    items: []
                };
                groups.push(current);
            }
            current.items.push({
                id: cb.id,
                label: cb.label,
                checked: !!cb.checked,
                disabled: !!cb.disabled,
                isNote: !!cb.isNote,
                showForTemplate: cb.showForTemplate ?? ''
            });
        }
        return groups;
    }

    _buildBodyContext() {
        const isCopyTab = this.activeTab !== 'import';
        return {
            isCopyTab,
            isImportTab: !isCopyTab,
            templateOptions: this.templateOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
                selected: opt.value === this.selectedTemplate
            })),
            hasTemplates: this.templateOptions.length > 0,
            textareaPlaceholder: this.textareaPlaceholder,
            initialJson: this.initialJson,
            promptCheckboxGroups: this._buildPromptCheckboxGroups(),
            hasPromptCheckboxes: this.promptCheckboxes.length > 0,
            promptFieldGroups: this._buildPromptFieldGroups(),
            hasPromptFields: this.promptFields.length > 0,
            journalAreaUi: this._formatJournalAreaUiData(),
            journalLocationUi: this._formatJournalLocationUiData()
        };
    }

    async getData() {
        const isCopyTab = this.activeTab !== 'import';
        const bodyContent = await foundry.applications.handlebars.renderTemplate(
            BODY_TEMPLATE,
            this._buildBodyContext()
        );
        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: true,
            showTools: true,
            showActionBar: true,
            windowTitle: this.headerTitle,
            subtitle: this.windowSubtitle,
            headerIcon: this.windowIcon,
            toolsContent: this._buildToolsContent(isCopyTab),
            bodyContent,
            actionBarLeft: this._buildActionBarLeft(isCopyTab),
            actionBarRight: this._buildActionBarRight(isCopyTab)
        };
    }

    /**
     * @param {object} field
     * @returns {object}
     */
    _formatPromptFieldForTemplate(field) {
        const inputType = field.inputType || 'text';
        const value = String(field.value ?? '');
        const options = (field.options ?? []).map((opt) => ({
            value: opt.value,
            label: opt.label,
            selected: String(opt.value) === value
        }));
        return {
            id: field.id,
            label: field.label,
            value,
            showForTemplate: field.showForTemplate ?? '',
            inputType,
            isSelect: inputType === 'select',
            isTextarea: inputType === 'textarea',
            isText: inputType !== 'select' && inputType !== 'textarea',
            fullWidth: !!field.fullWidth,
            rows: field.rows || 5,
            group: field.group ?? '',
            groupIcon: field.groupIcon || 'fa-solid fa-list',
            options
        };
    }

    /**
     * Group formatted prompt fields into ordered display sections. Consecutive fields
     * sharing a (group, template) render under one sub-header; fields with no group
     * render headerless. Keeps illustration and portrait groups from merging.
     * @returns {Array<object>}
     */
    _buildPromptFieldGroups() {
        const groups = [];
        let current = null;
        for (const field of this.promptFields) {
            const formatted = this._formatPromptFieldForTemplate(field);
            const groupKey = `${formatted.showForTemplate}::${formatted.group}`;
            if (!current || current.groupKey !== groupKey) {
                current = {
                    groupKey,
                    group: formatted.group,
                    hasGroup: !!formatted.group,
                    groupIcon: formatted.groupIcon,
                    showForTemplate: formatted.showForTemplate,
                    items: []
                };
                groups.push(current);
            }
            current.items.push(formatted);
        }
        return groups;
    }

    _formatJournalAreaUiData() {
        const ui = this.journalAreaUi;
        if (!ui) {
            return { hasJournalAreaUi: false };
        }
        return {
            hasJournalAreaUi: true,
            showForTemplate: ui.showForTemplate ?? 'area',
            folder: {
                id: ui.folder?.id ?? 'foldername',
                label: ui.folder?.label ?? 'Narrative Folder',
                value: ui.folder?.value ?? ''
            },
            geography: (ui.geography ?? []).map((field) => ({
                id: field.id,
                label: field.label,
                value: field.value ?? ''
            })),
            geographyDefault: {
                id: ui.geographyDefault?.id ?? 'geographyDefault',
                label: ui.geographyDefault?.label ?? 'Default'
            },
            images: (ui.images ?? []).map((row) => ({
                fieldId: row.fieldId,
                checkboxId: row.checkboxId,
                defaultCheckboxId: row.defaultCheckboxId,
                fieldLabel: row.fieldLabel,
                checkboxLabel: row.checkboxLabel,
                defaultLabel: row.defaultLabel ?? 'Default',
                value: row.value ?? '',
                checked: !!row.checked
            })),
            additionalContext: {
                id: ui.additionalContext?.id ?? 'additionalContext',
                label: ui.additionalContext?.label ?? 'Additional context',
                value: ui.additionalContext?.value ?? ''
            }
        };
    }

    _formatJournalLocationUiData() {
        const ui = this.journalLocationUi;
        if (!ui) {
            return { hasJournalLocationUi: false };
        }
        return {
            hasJournalLocationUi: true,
            showForTemplate: ui.showForTemplate ?? 'location',
            folder: {
                id: ui.folder?.id ?? 'locationFoldername',
                label: ui.folder?.label ?? 'Journal folder',
                value: ui.folder?.value ?? 'Libraries'
            },
            journal: {
                id: ui.journal?.id ?? 'locationJournalname',
                label: ui.journal?.label ?? 'Journal name',
                value: ui.journal?.value ?? 'Locations'
            },
            title: {
                id: ui.title?.id ?? 'locationTitle',
                label: ui.title?.label ?? 'Location title',
                value: ui.title?.value ?? ''
            },
            geography: (ui.geography ?? []).map((field) => ({
                id: field.id,
                label: field.label,
                value: field.value ?? ''
            })),
            geographyDefault: {
                id: ui.geographyDefault?.id ?? 'geographyDefault',
                label: ui.geographyDefault?.label ?? 'Default'
            },
            locationImage: {
                fieldId: ui.locationImage?.fieldId ?? 'locationimage',
                fieldLabel: ui.locationImage?.fieldLabel ?? 'Location image path',
                value: ui.locationImage?.value ?? ''
            },
            additionalContext: {
                id: ui.additionalContext?.id ?? 'additionalContext',
                label: ui.additionalContext?.label ?? 'Additional context',
                value: ui.additionalContext?.value ?? ''
            }
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const root = this.element;
        if (!root) return;

        const fileInput = root.querySelector('.blacksmith-json-import-file-input');
        const textarea = root.querySelector('.blacksmith-json-import-textarea');
        const templateSelect = root.querySelector('.blacksmith-json-import-template-select');

        fileInput?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (!file || !textarea) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                textarea.value = String(ev.target?.result || '');
                this.initialJson = textarea.value;
                fileInput.value = '';
            };
            reader.readAsText(file);
        });

        templateSelect?.addEventListener('change', () => {
            this.selectedTemplate = templateSelect.value || '';
            this._updatePromptFieldVisibility();
        });

        this._updatePromptFieldVisibility();
        this._attachImageBrowseListeners(root);
    }

    _attachImageBrowseListeners(root) {
        if (!root) return;
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        for (const button of root.querySelectorAll('.blacksmith-json-import-image-browse')) {
            button.addEventListener('click', async () => {
                const fieldId = button.dataset.promptFieldTarget;
                if (!fieldId) return;
                const input = root.querySelector(`[data-prompt-field="${fieldId}"]`);
                const picker = new FilePicker({
                    type: 'image',
                    current: input?.value?.trim() || '',
                    callback: (path) => {
                        if (input) input.value = path;
                    }
                });
                await picker.browse();
            });
        }
    }

    static async open(options = {}) {
        const win = new JsonImportWindow(options);
        await win.render(true);
        return win;
    }
}
