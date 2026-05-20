import { MODULE } from './const.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';

export class JsonImportWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-json-import-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-json-import-window',
            classes: ['coffee-pub-blacksmith', 'blacksmith-json-import-window-app'],
            position: { width: 920, height: 680 },
            window: { title: 'Import JSON', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 760, minHeight: 520 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-json-import.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        const idSuffix = String(opts.idSuffix || opts.kind || 'generic')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (idSuffix) opts.id = `blacksmith-json-import-window-${idSuffix}`;
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
        this.textareaPlaceholder = opts.textareaPlaceholder || 'Paste JSON here or select a file above...';
        this.fileInputAccept = opts.fileInputAccept || '.json,application/json';
        this.initialJson = opts.initialJson || '';
        this.copyTemplateLabel = opts.copyTemplateLabel || 'Copy to Clipboard';
        this.selectFileLabel = opts.selectFileLabel || 'Select JSON File';
        this.importLabel = opts.importLabel || 'Import JSON';
        this.onCopyTemplate = typeof opts.onCopyTemplate === 'function' ? opts.onCopyTemplate : null;
        this.onImport = typeof opts.onImport === 'function' ? opts.onImport : null;
        this.promptCheckboxes = Array.isArray(opts.promptCheckboxes) ? opts.promptCheckboxes : [];
        this.promptFields = Array.isArray(opts.promptFields) ? opts.promptFields : [];
        this.journalAreaUi = opts.journalAreaUi && typeof opts.journalAreaUi === 'object'
            ? opts.journalAreaUi
            : null;
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

    _getJournalAreaFieldState() {
        const state = {};
        const ui = this.journalAreaUi;
        const root = this.element;
        if (!ui || !root) return state;

        const folderId = String(ui.folder?.id || '').trim();
        if (folderId) {
            const folderInput = root.querySelector(`[data-prompt-field="${folderId}"]`);
            state[folderId] = folderInput
                ? String(folderInput.value ?? '').trim()
                : String(ui.folder?.value ?? '').trim();
        }

        for (const field of ui.geography ?? []) {
            const id = String(field?.id || '').trim();
            if (!id) continue;
            const input = root.querySelector(`[data-prompt-field="${id}"]`);
            state[id] = input ? String(input.value ?? '').trim() : String(field.value ?? '').trim();
        }

        for (const row of ui.images ?? []) {
            const fieldId = String(row?.fieldId || '').trim();
            if (!fieldId) continue;
            const input = root.querySelector(`[data-prompt-field="${fieldId}"]`);
            state[fieldId] = input ? String(input.value ?? '').trim() : String(row.value ?? '').trim();
        }

        const defaultId = String(ui.geographyDefault?.id || 'geographyDefault').trim();
        const defaultInput = root.querySelector(`[data-prompt-checkbox="${defaultId}"]`);
        state[defaultId] = !!defaultInput?.checked;

        for (const row of ui.images ?? []) {
            const checkboxId = String(row?.checkboxId || '').trim();
            if (checkboxId) {
                const input = root.querySelector(`[data-prompt-checkbox="${checkboxId}"]`);
                state[checkboxId] = !!input?.checked;
            }
            const defaultCheckboxId = String(row?.defaultCheckboxId || '').trim();
            if (defaultCheckboxId) {
                const defaultInput = root.querySelector(`[data-prompt-checkbox="${defaultCheckboxId}"]`);
                state[defaultCheckboxId] = !!defaultInput?.checked;
            }
        }

        return state;
    }

    _getPromptOptions() {
        return {
            ...this._getPromptCheckboxState(),
            ...this._getPromptFieldState(),
            ...this._getJournalAreaFieldState()
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
                '.blacksmith-json-import-prompt-field-row, .blacksmith-json-import-prompt-fields-header[data-for-template]'
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
                '.blacksmith-json-import-prompt-checkbox, .blacksmith-json-import-prompt-options-hint'
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

        const journalBlock = root.querySelector('.blacksmith-json-import-journal-area');
        if (journalBlock) {
            const forTemplate = journalBlock.getAttribute('data-for-template') || 'area';
            journalBlock.hidden = forTemplate !== template;
        }
    }

    getData() {
        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: true,
            showTools: false,
            showActionBar: true,
            windowTitle: this.headerTitle,
            subtitle: this.windowSubtitle,
            headerIcon: this.windowIcon,
            templateOptions: this.templateOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
                selected: opt.value === this.selectedTemplate
            })),
            hasTemplates: this.templateOptions.length > 0,
            textareaPlaceholder: this.textareaPlaceholder,
            fileInputAccept: this.fileInputAccept,
            initialJson: this.initialJson,
            copyTemplateLabel: this.copyTemplateLabel,
            selectFileLabel: this.selectFileLabel,
            importLabel: this.importLabel,
            promptCheckboxes: this.promptCheckboxes.map((cb) => ({
                id: cb.id,
                label: cb.label,
                checked: !!cb.checked,
                disabled: !!cb.disabled,
                showForTemplate: cb.showForTemplate ?? ''
            })),
            hasPromptCheckboxes: this.promptCheckboxes.length > 0,
            promptFields: this.promptFields.map((field) => this._formatPromptFieldForTemplate(field)),
            hasPromptFields: this.promptFields.length > 0,
            journalAreaUi: this._formatJournalAreaUiData()
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
            options
        };
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
            }))
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const root = this.element;
        if (!root) return;

        const selectButton = root.querySelector('.blacksmith-json-import-select-file');
        const fileInput = root.querySelector('.blacksmith-json-import-file-input');
        const textarea = root.querySelector('.blacksmith-json-import-textarea');
        const copyButton = root.querySelector('.blacksmith-json-import-copy-template');
        const templateSelect = root.querySelector('.blacksmith-json-import-template-select');
        const importButton = root.querySelector('.blacksmith-json-import-submit');

        selectButton?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (!file || !textarea) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                textarea.value = String(ev.target?.result || '');
                fileInput.value = '';
            };
            reader.readAsText(file);
        });

        templateSelect?.addEventListener('change', () => {
            this.selectedTemplate = templateSelect.value || '';
            this._updatePromptFieldVisibility();
        });

        copyButton?.addEventListener('click', async () => {
            if (!this.onCopyTemplate) return;
            ui.notifications.info('Gathering data to put on the clipboard, please wait...');
            copyButton.disabled = true;
            try {
                const copied = await this.onCopyTemplate(this.selectedTemplate, this._getPromptOptions());
                if (copied !== false) {
                    ui.notifications.info('Prompt copied to the clipboard');
                }
            } catch (error) {
                const message = error?.message || String(error);
                ui.notifications.error(`Failed to copy prompt: ${message}`);
            } finally {
                copyButton.disabled = false;
            }
        });

        this._updatePromptFieldVisibility();
        this._attachImageBrowseListeners(root);

        importButton?.addEventListener('click', async () => {
            if (!this.onImport) {
                this.close();
                return;
            }
            const payload = textarea?.value || '';
            const ok = await this.onImport(payload);
            if (ok !== false) {
                this.close();
            }
        });
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
