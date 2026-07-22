import { MODULE } from './const.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { copyToClipboard } from './utility-common.js';
import { appendAdditionalUserGuidance, prepareJsonImportText } from './utility-json-import-prompts.js';

const BODY_TEMPLATE = `modules/${MODULE.ID}/templates/window-json-import-body.hbs`;
const AUTHORING_STATE_SETTING = 'jsonImporterAuthoringState';

export class JsonImportWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-template-root';
    static _authoringSaveQueue = Promise.resolve();
    static _sessionAdditionalGuidance = '';

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
        validateJson: () => JsonImportWindow._ref?._validateJson(),
        importJson: () => JsonImportWindow._ref?._importJson(),
        editJson: () => JsonImportWindow._ref?._editJson(),
        importAnother: () => JsonImportWindow._ref?._importAnother(),
        retryFailed: () => JsonImportWindow._ref?._retryFailed(),
        copyReport: () => JsonImportWindow._ref?._copyReport(),
        copyEntryIssues: (_event, target) => JsonImportWindow._ref?._copyEntryIssues(target),
        openAllDocuments: () => JsonImportWindow._ref?._openAllDocuments(),
        openDocument: (_event, target) => JsonImportWindow._ref?._openDocument(target)
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
        this.importerOptions = Array.isArray(opts.importerOptions) ? opts.importerOptions : [];
        this.selectedImporter = String(opts.selectedImporter || idSuffix || '');
        this.onSwitchImporter = typeof opts.onSwitchImporter === 'function' ? opts.onSwitchImporter : null;
        this.templateOptions = Array.isArray(opts.templateOptions) ? opts.templateOptions : [];
        this.selectedTemplate = opts.selectedTemplate || this.templateOptions[0]?.value || '';
        this.textareaPlaceholder = opts.textareaPlaceholder || 'Paste JSON here, or use Select JSON File below.';
        this.fileInputAccept = opts.fileInputAccept || '.json,application/json';
        this.initialJson = opts.initialJson || '';
        this.copyTemplateLabel = opts.copyTemplateLabel || 'Copy';
        this.saveTemplateLabel = opts.saveTemplateLabel || 'Save As…';
        this.selectFileLabel = opts.selectFileLabel || 'Select JSON File';
        this.importLabel = opts.importLabel || 'Import JSON';
        this.promptFilePrefix = opts.promptFilePrefix || 'prompt';
        this.onBuildPrompt = typeof opts.onBuildPrompt === 'function' ? opts.onBuildPrompt : null;
        this.onBuildJsonTemplate = typeof opts.onBuildJsonTemplate === 'function' ? opts.onBuildJsonTemplate : null;
        this.onBuildAuthoringGuide = typeof opts.onBuildAuthoringGuide === 'function' ? opts.onBuildAuthoringGuide : null;
        this.selectedJsonOutput = opts.selectedJsonOutput === 'guided' ? 'guided' : 'clean';
        this.onImport = typeof opts.onImport === 'function' ? opts.onImport : null;
        this.onValidate = typeof opts.onValidate === 'function' ? opts.onValidate : null;
        this.importResult = null;
        this.showImportResults = false;
        this.promptCheckboxes = Array.isArray(opts.promptCheckboxes) ? opts.promptCheckboxes : [];
        this.promptFields = Array.isArray(opts.promptFields) ? opts.promptFields : [];
        this.additionalGuidance = JsonImportWindow._sessionAdditionalGuidance;
        this.importerStateKey = idSuffix || 'generic';
        this._restoreAuthoringState();
        this.journalAreaUi = opts.journalAreaUi && typeof opts.journalAreaUi === 'object'
            ? opts.journalAreaUi
            : null;
        this.journalLocationUi = opts.journalLocationUi && typeof opts.journalLocationUi === 'object'
            ? opts.journalLocationUi
            : null;
        const requestedTab = String(opts.activeTab || 'import').toLowerCase();
        this.activeTab = ['import', 'json', 'prompt'].includes(requestedTab) ? requestedTab : 'import';
        if (this.activeTab === 'json' && !this.onBuildJsonTemplate) this.activeTab = 'import';
    }

    _restoreAuthoringState() {
        let saved = null;
        try {
            saved = game.settings.get(MODULE.ID, AUTHORING_STATE_SETTING)?.[this.importerStateKey] ?? null;
        } catch {
            return;
        }
        if (!saved || typeof saved !== 'object') return;
        if (this.templateOptions.some(option => option.value === saved.selectedTemplate)) {
            this.selectedTemplate = saved.selectedTemplate;
        }
        if (saved.selectedJsonOutput === 'guided' || saved.selectedJsonOutput === 'clean') {
            this.selectedJsonOutput = saved.selectedJsonOutput;
        }
        const fields = saved.fields && typeof saved.fields === 'object' ? saved.fields : {};
        for (const field of this.promptFields) {
            if (field.id in fields) field.value = String(fields[field.id] ?? '');
        }
        const checkboxes = saved.checkboxes && typeof saved.checkboxes === 'object' ? saved.checkboxes : {};
        for (const checkbox of this.promptCheckboxes) {
            if (checkbox.id in checkboxes) checkbox.checked = !!checkboxes[checkbox.id];
        }
    }

    async _saveAuthoringState() {
        const fields = Object.fromEntries(this.promptFields.filter(field => field?.id).map(field => [field.id, String(field.value ?? '')]));
        const checkboxes = Object.fromEntries(this.promptCheckboxes.filter(checkbox => checkbox?.id).map(checkbox => [checkbox.id, !!checkbox.checked]));
        const snapshot = {
            selectedTemplate: this.selectedTemplate,
            selectedJsonOutput: this.selectedJsonOutput,
            fields,
            checkboxes
        };
        JsonImportWindow._authoringSaveQueue = JsonImportWindow._authoringSaveQueue.then(async () => {
            try {
                const allState = game.settings.get(MODULE.ID, AUTHORING_STATE_SETTING) ?? {};
                await game.settings.set(MODULE.ID, AUTHORING_STATE_SETTING, {
                    ...allState,
                    [this.importerStateKey]: snapshot
                });
            } catch {
                // A missing/unavailable client setting should never block authoring.
            }
        });
        return JsonImportWindow._authoringSaveQueue;
    }

    _buildToolsContent() {
        const isImport = this.activeTab === 'import';
        const isJson = this.activeTab === 'json';
        const isPrompt = this.activeTab === 'prompt';
        const jsonDisabled = this.onBuildJsonTemplate ? '' : ' disabled aria-disabled="true" title="JSON templates are not available for this importer yet."';
        return `
            <div class="blacksmith-json-import-tools-stack">
                <div class="blacksmith-json-import-tools-row blacksmith-json-import-tabs-row">
                    <nav class="blacksmith-tabs" role="tablist">
                        <button type="button" class="blacksmith-tab ${isImport ? 'is-active' : ''}" data-action="selectTab" data-value="import" role="tab" aria-selected="${isImport}">
                            <i class="fa-solid fa-file-import"></i><span>Import JSON</span>
                        </button>
                        <button type="button" class="blacksmith-tab ${isJson ? 'is-active' : ''}" data-action="selectTab" data-value="json" role="tab" aria-selected="${isJson}"${jsonDisabled}>
                            <i class="fa-solid fa-code"></i><span>JSON Template</span>
                        </button>
                        <button type="button" class="blacksmith-tab ${isPrompt ? 'is-active' : ''}" data-action="selectTab" data-value="prompt" role="tab" aria-selected="${isPrompt}">
                            <i class="fa-solid fa-wand-magic-sparkles"></i><span>Prompt Template</span>
                        </button>
                    </nav>
                </div>
            </div>
        `;
    }

    _buildActionBarLeft() {
        if (this.activeTab !== 'import') return '';
        if (this.showImportResults && this.importResult) {
            const openAll = this.importResult.entries?.filter(entry => entry.document?.uuid).length > 1
                ? `<button type="button" class="blacksmith-window-btn-secondary" data-action="openAllDocuments"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open All</button>`
                : '';
            return `<button type="button" class="blacksmith-window-btn-secondary" data-action="importAnother">
                    <i class="fa-solid fa-plus"></i> Import Another
                </button>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="copyReport">
                    <i class="fa-solid fa-clipboard"></i> Copy Report
                </button>${openAll}`;
        }
        const accept = String(this.fileInputAccept || '.json,application/json')
            .replace(/"/g, '&quot;');
        return `
            <input class="blacksmith-json-import-file-input" type="file" accept="${accept}" hidden>
            <button type="button" class="blacksmith-window-btn-secondary blacksmith-json-import-select-file" data-action="selectFile">
                <i class="fa-solid fa-folder-open"></i> ${this.selectFileLabel}
            </button>
            <button type="button" class="blacksmith-window-btn-secondary" data-action="validateJson">
                <i class="fa-solid fa-check-double"></i> Validate
            </button>
        `;
    }

    _buildActionBarRight() {
        if (this.activeTab !== 'import') {
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
        if (this.showImportResults && this.importResult) {
            const retry = this.importResult.operation === 'import'
                && this.importResult.failed > 0
                && this.importResult.entries?.some(entry => entry.retryable && entry.index >= 0)
                ? `<button type="button" class="blacksmith-window-btn-secondary" data-action="retryFailed"><i class="fa-solid fa-rotate-right"></i> Retry Failed</button>`
                : '';
            const editLabel = this.importResult.operation === 'import' && this.importResult.failed > 0 ? 'Edit and Retry' : 'Edit JSON';
            return `${retry}<button type="button" class="blacksmith-window-btn-primary" data-action="editJson"><i class="fa-solid fa-pen"></i> ${editLabel}</button>`;
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

        const jsonOutputSelect = root.querySelector('.blacksmith-json-import-json-output-select');
        if (jsonOutputSelect) this.selectedJsonOutput = jsonOutputSelect.value === 'guided' ? 'guided' : 'clean';

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

        const guidance = root.querySelector('[data-additional-guidance]');
        if (guidance) {
            this.additionalGuidance = String(guidance.value ?? '');
            JsonImportWindow._sessionAdditionalGuidance = this.additionalGuidance;
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
        for (const field of ui.generationOptions ?? []) {
            if (field.id && state[field.id] !== undefined) field.value = state[field.id];
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
        const tab = String(target?.dataset?.value || '').toLowerCase();
        if (!['import', 'json', 'prompt'].includes(tab)) return;
        if (tab === 'json' && !this.onBuildJsonTemplate) return;
        this.activeTab = tab;
        const available = this._availableTemplateOptions(tab);
        if (!available.some((template) => template.value === this.selectedTemplate)) {
            this.selectedTemplate = available[0]?.value || '';
        }
        void this.render(true);
    }

    _selectFile() {
        const root = this.element;
        const fileInput = root?.querySelector('.blacksmith-json-import-file-input');
        fileInput?.click();
    }

    /**
     * Show/hide a "working" overlay over the window. Building a prompt can be slow when it
     * pulls large compendium actor/item catalogs, so give the user visible feedback.
     * @param {boolean} busy
     * @param {string} [message]
     */
    _setBusy(busy, message = 'Working…') {
        const root = this.element;
        if (!root) return;
        let overlay = root.querySelector('.blacksmith-json-import-busy');
        if (busy) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'blacksmith-json-import-busy';
                overlay.innerHTML = '<div class="blacksmith-json-import-busy-inner">'
                    + '<i class="fa-solid fa-spinner fa-spin"></i>'
                    + '<span class="blacksmith-json-import-busy-text"></span>'
                    + '</div>';
                root.appendChild(overlay);
            }
            const text = overlay.querySelector('.blacksmith-json-import-busy-text');
            if (text) text.textContent = message;
            overlay.hidden = false;
        } else if (overlay) {
            overlay.hidden = true;
        }
    }

    async _copyTemplate() {
        if (!this.onBuildPrompt) return;
        const root = this.element;
        const copyButton = root?.querySelector('.blacksmith-json-import-copy-template');
        this._setBusy(true, 'Building output…');
        if (copyButton) copyButton.disabled = true;
        try {
            const prompt = await this._buildSelectedPrompt();
            const copied = await copyToClipboard(String(prompt ?? ''), { notify: false });
            if (copied !== false) {
                ui.notifications.info(this.activeTab === 'json'
                    ? `${this.selectedJsonOutput === 'guided' ? 'Guided JSON template' : 'JSON template'} copied to the clipboard`
                    : 'Full prompt copied to the clipboard');
            }
        } catch (error) {
            const message = error?.message || String(error);
            ui.notifications.error(`Failed to copy prompt: ${message}`);
        } finally {
            if (copyButton) copyButton.disabled = false;
            this._setBusy(false);
        }
    }

    async _saveTemplate() {
        if (!this.onBuildPrompt) return;
        const root = this.element;
        const saveButton = root?.querySelector('.blacksmith-json-import-save-template');
        this._setBusy(true, 'Building output…');
        if (saveButton) saveButton.disabled = true;
        try {
            const prompt = String((await this._buildSelectedPrompt()) ?? '');
            const template = String(this.selectedTemplate || 'prompt')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            const jsonOnly = this.activeTab === 'json';
            const suffix = jsonOnly
                ? (this.selectedJsonOutput === 'guided' ? 'json-template-guided' : 'json-template')
                : 'full-prompt';
            const filename = `blacksmith-${this.promptFilePrefix}-${template || 'prompt'}-${suffix}.txt`;
            this._downloadTextFile(filename, prompt, 'text/plain');
            ui.notifications.info(`${jsonOnly ? 'JSON template' : 'Prompt'} saved as ${filename}`);
        } catch (error) {
            const message = error?.message || String(error);
            ui.notifications.error(`Failed to save prompt: ${message}`);
        } finally {
            if (saveButton) saveButton.disabled = false;
            this._setBusy(false);
        }
    }

    async _buildSelectedPrompt() {
        this._persistFormStateFromDom();
        await this._saveAuthoringState();
        const builder = this.activeTab === 'json'
            ? (this.selectedJsonOutput === 'guided' && this.onBuildAuthoringGuide
                ? this.onBuildAuthoringGuide
                : this.onBuildJsonTemplate)
            : this.onBuildPrompt;
        if (!builder) return '';
        const output = await builder(
            this.selectedTemplate,
            this._getPromptOptions(),
            (msg) => this._setBusy(true, msg)
        );
        return this.activeTab === 'prompt'
            ? appendAdditionalUserGuidance(output, this.additionalGuidance)
            : output;
    }

    /**
     * Trigger a download of plain text content. Uses Foundry's saveDataToFile,
     * which sets the dataset.downloadurl hint and defers revoking the object URL
     * so the download works inside Foundry's Electron shell.
     * @param {string} filename
     * @param {string} text
     * @param {string} [mimeType]
     */
    _downloadTextFile(filename, text, mimeType = 'text/plain') {
        foundry.utils.saveDataToFile(text, mimeType, filename);
    }

    async _importJson() {
        if (!this.onImport) {
            this.close();
            return;
        }
        const root = this.element;
        const textarea = root?.querySelector('.blacksmith-json-import-textarea');
        const payload = textarea?.value || '';
        this._setBusy(true, 'Importing…');
        try {
            this.initialJson = String(payload);
            this.importResult = await this.onImport(payload);
            this.showImportResults = true;
        } finally {
            this._setBusy(false);
        }
        await this.render(true);
    }

    async _validateJson() {
        if (!this.onValidate) return;
        const textarea = this.element?.querySelector('.blacksmith-json-import-textarea');
        const payload = textarea?.value || '';
        this._setBusy(true, 'Validating…');
        try {
            this.initialJson = String(payload);
            this.importResult = await this.onValidate(payload);
            this.showImportResults = true;
        } finally {
            this._setBusy(false);
        }
        await this.render(true);
    }

    async _retryFailed() {
        if (!this.onImport || !this.importResult) return;
        const retryEntries = this._failedPayloadEntries();
        if (!retryEntries.length) return;
        this._setBusy(true, `Retrying ${retryEntries.length} failed entr${retryEntries.length === 1 ? 'y' : 'ies'}…`);
        try {
            this.initialJson = JSON.stringify(retryEntries, null, 2);
            this.importResult = await this.onImport(this.initialJson);
            this.showImportResults = true;
        } finally {
            this._setBusy(false);
        }
        await this.render(true);
    }

    _editJson() {
        if (this.importResult?.operation === 'import' && this.importResult.failed > 0) {
            const failedEntries = this._failedPayloadEntries();
            if (failedEntries.length) this.initialJson = JSON.stringify(failedEntries, null, 2);
        }
        this.showImportResults = false;
        void this.render(true);
    }

    _failedPayloadEntries() {
        if (!this.importResult) return [];
        try {
            const parsed = JSON.parse(prepareJsonImportText(this.initialJson));
            const entries = Array.isArray(parsed) ? parsed : [parsed];
            return this.importResult.entries
                .filter(entry => entry.status === 'error' && entry.retryable && entry.index >= 0)
                .map(entry => entries[entry.index])
                .filter(Boolean);
        } catch (error) {
            ui.notifications.error(`Cannot prepare failed entries until the JSON parses: ${error.message}`);
            return [];
        }
    }

    _importAnother() {
        this.initialJson = '';
        this.importResult = null;
        this.showImportResults = false;
        void this.render(true);
    }

    async _copyReport() {
        if (!this.importResult) return;
        const copied = await copyToClipboard(JSON.stringify(this.importResult, null, 2), { notify: false });
        if (copied !== false) ui.notifications.info('Import report copied to the clipboard');
    }

    async _copyEntryIssues(target) {
        const index = Number.parseInt(String(target?.dataset?.entryIndex ?? ''), 10);
        const entry = this.importResult?.entries?.find(candidate => candidate.index === index);
        if (!entry) return;
        const issues = [...(entry.errors ?? []), ...(entry.warnings ?? [])];
        const text = issues.map(issue => `[${issue.stage || 'unknown'}] ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`).join('\n');
        const copied = await copyToClipboard(text, { notify: false });
        if (copied !== false) ui.notifications.info('Entry issues copied to the clipboard');
    }

    async _openAllDocuments() {
        const uuids = this.importResult?.entries?.map(entry => entry.document?.uuid).filter(Boolean) ?? [];
        for (const uuid of uuids) {
            const document = await fromUuid(uuid);
            document?.sheet?.render(true);
        }
    }

    async _openDocument(target) {
        const uuid = String(target?.dataset?.uuid || '');
        if (!uuid) return;
        const document = await fromUuid(uuid);
        document?.sheet?.render(true);
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
        // Only read the block for the currently selected template. The area and location blocks
        // share field ids (realm/region/…), and both are always in the DOM; reading the inactive
        // (hidden) block would let its stale values override the active one when options merge.
        if (templateKey && templateKey !== this.selectedTemplate) return state;
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
        for (const field of ui.generationOptions ?? []) {
            readField(field.id, field.value);
        }

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
        }

        return state;
    }

    _getPromptOptions() {
        return {
            additionalGuidance: String(this.additionalGuidance ?? '').trim(),
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

    _optionSupportsActiveAuthoringTab(option = {}) {
        if (this.activeTab === 'import') return false;
        const modes = String(option.authoringModes ?? 'prompt').trim().split(/\s+/).filter(Boolean);
        return modes.includes(this.activeTab);
    }

    _templateSupportsTab(template, tab = this.activeTab) {
        if (tab === 'import') return true;
        const modes = String(template?.authoringModes ?? 'json prompt').trim().split(/\s+/).filter(Boolean);
        return modes.includes(tab);
    }

    _availableTemplateOptions(tab = this.activeTab) {
        return this.templateOptions.filter((template) => this._templateSupportsTab(template, tab));
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
                const showForField = row.getAttribute('data-for-field') || '';
                const show = this._templateMatchesForAttribute(forTemplate, template)
                    && this._promptFieldConditionMatches(showForField);
                row.hidden = !show;
            }
            const block = root.querySelector('.blacksmith-json-import-prompt-fields');
            if (block) {
                for (const section of block.querySelectorAll('.blacksmith-json-import-prompt-field-section')) {
                    const templateAllowed = this._templateMatchesForAttribute(section.getAttribute('data-for-template') || '', template);
                    const fieldAllowed = this._promptFieldConditionMatches(section.getAttribute('data-for-field') || '');
                    const hasVisibleControl = !!section.querySelector('.blacksmith-json-import-prompt-field-row:not([hidden])');
                    section.hidden = !(templateAllowed && fieldAllowed && hasVisibleControl);
                }
                const anyVisible = !!block.querySelector('.blacksmith-json-import-prompt-field-row:not([hidden])');
                block.hidden = !anyVisible;
            }
        }

        if (this.promptCheckboxes.length) {
            for (const row of root.querySelectorAll(
                '.blacksmith-json-import-prompt-checkbox'
            )) {
                const forTemplate = row.getAttribute('data-for-template') || '';
                const showForField = row.getAttribute('data-for-field') || '';
                const show = this._templateMatchesForAttribute(forTemplate, template)
                    && this._promptFieldConditionMatches(showForField);
                row.hidden = !show;
            }
            const optionsBlock = root.querySelector('.blacksmith-json-import-prompt-options');
            if (optionsBlock) {
                for (const group of optionsBlock.querySelectorAll('.blacksmith-json-import-prompt-group')) {
                    const templateAllowed = this._templateMatchesForAttribute(group.getAttribute('data-for-template') || '', template);
                    const fieldAllowed = this._promptFieldConditionMatches(group.getAttribute('data-for-field') || '');
                    const hasVisibleControl = !!group.querySelector('.blacksmith-json-import-prompt-checkbox:not([hidden])');
                    group.hidden = !(templateAllowed && fieldAllowed && hasVisibleControl);
                }
                const anyVisible = !!optionsBlock.querySelector('.blacksmith-json-import-prompt-checkbox:not([hidden])');
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

    _promptFieldConditionMatches(condition) {
        const [fieldId, ...expectedParts] = String(condition ?? '').split('=');
        if (!fieldId || !expectedParts.length) return true;
        const input = this.element?.querySelector(`[data-prompt-field="${fieldId}"]`);
        const actual = String(input?.value ?? '');
        return expectedParts.join('=').split('|').includes(actual);
    }

    _buildHeaderRight() {
        if (!this.onSwitchImporter || this.importerOptions.length < 2) return '';
        const options = this.importerOptions.map(option => {
            const selected = String(option.value) === this.selectedImporter ? ' selected' : '';
            return `<option value="${String(option.value)}"${selected}>${String(option.label)}</option>`;
        }).join('');
        return `<label class="blacksmith-json-import-switcher" title="Switch importer">
            <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
            <span class="sr-only">Importer</span>
            <select class="blacksmith-select blacksmith-json-import-switcher-select" aria-label="Switch importer">${options}</select>
        </label>`;
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
            if (!this._optionSupportsActiveAuthoringTab(cb)) continue;
            const section = String(cb.section || 'Options');
            if (!current || current.section !== section) {
                current = {
                    section,
                    hasSection: true,
                    sectionIcon: cb.sectionIcon || 'fa-solid fa-sliders',
                    stacked: !!cb.stacked,
                    showForTemplate: cb.showForTemplate ?? '',
                    showForField: cb.showForField ?? '',
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
                showForTemplate: cb.showForTemplate ?? '',
                showForField: cb.showForField ?? ''
            });
        }
        return groups;
    }

    _buildBodyContext() {
        const isImportTab = this.activeTab === 'import';
        const isJsonTab = this.activeTab === 'json';
        const isPromptTab = this.activeTab === 'prompt';
        const promptCheckboxGroups = this._buildPromptCheckboxGroups();
        const promptFieldGroups = this._buildPromptFieldGroups();
        const availableTemplates = this._availableTemplateOptions();
        const result = this.importResult;
        const resultEntries = (result?.entries ?? []).map(entry => ({
            ...entry,
            statusLabel: entry.status === 'error'
                ? 'Failed'
                : (entry.status === 'warning'
                    ? (result.operation === 'validate' ? 'Valid with warnings' : 'Imported with warnings')
                    : (result.operation === 'validate' ? 'Valid' : 'Imported')),
            statusIcon: entry.status === 'error' ? 'fa-solid fa-circle-xmark' : (entry.status === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-check'),
            canOpen: !!entry.document?.uuid,
            hasIssues: !!(entry.errors?.length || entry.warnings?.length),
            documentLabel: entry.document?.name || entry.inputName
        }));
        return {
            isAuthoringTab: isJsonTab || isPromptTab,
            isImportTab,
            isJsonTab,
            isPromptTab,
            authoringHeading: isJsonTab ? 'Select JSON Template' : 'Select Prompt Template',
            hasAuthoringGuide: isJsonTab && !!this.onBuildAuthoringGuide,
            jsonOutputOptions: [
                { value: 'clean', label: 'Template Only', selected: this.selectedJsonOutput !== 'guided' },
                { value: 'guided', label: 'Template + Instructions', selected: this.selectedJsonOutput === 'guided' }
            ],
            templateOptions: availableTemplates.map((opt) => ({
                value: opt.value,
                label: opt.label,
                selected: opt.value === this.selectedTemplate
            })),
            hasTemplates: availableTemplates.length > 0,
            textareaPlaceholder: this.textareaPlaceholder,
            initialJson: this.initialJson,
            showImportResults: this.showImportResults && !!result,
            importResult: result ? { ...result, entries: resultEntries, operationLabel: result.operation === 'validate' ? 'Validation' : 'Import' } : null,
            promptCheckboxGroups,
            hasPromptCheckboxes: promptCheckboxGroups.length > 0,
            promptFieldGroups,
            hasPromptFields: promptFieldGroups.length > 0,
            additionalGuidance: this.additionalGuidance,
            journalAreaUi: this._formatJournalAreaUiData(),
            journalLocationUi: this._formatJournalLocationUiData()
        };
    }

    async getData() {
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
            headerRight: this._buildHeaderRight(),
            toolsContent: this._buildToolsContent(),
            bodyContent,
            actionBarLeft: this._buildActionBarLeft(),
            actionBarRight: this._buildActionBarRight()
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
            placeholder: field.placeholder ?? '',
            hint: field.hint ?? '',
            hasHint: !!field.hint,
            showForTemplate: field.showForTemplate ?? '',
            showForField: field.showForField ?? '',
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
            if (!this._optionSupportsActiveAuthoringTab(field)) continue;
            const formatted = this._formatPromptFieldForTemplate(field);
            const fallbackGroup = ({
                illustration: ['Scene facets (prefill before copy)', 'fa-solid fa-image'],
                portrait: ['Portrait facets (prefill before copy)', 'fa-solid fa-user']
            })[formatted.showForTemplate] || ['Options', 'fa-solid fa-sliders'];
            const group = formatted.group || fallbackGroup[0];
            const groupIcon = formatted.group ? formatted.groupIcon : fallbackGroup[1];
            const groupKey = `${formatted.showForTemplate}::${formatted.showForField}::${group}`;
            if (!current || current.groupKey !== groupKey) {
                current = {
                    groupKey,
                    group,
                    hasGroup: true,
                    groupIcon,
                    showForTemplate: formatted.showForTemplate,
                    showForField: formatted.showForField,
                    items: []
                };
                groups.push(current);
            }
            current.items.push(formatted);
        }
        for (const group of groups) group.singleItem = group.items.length === 1;
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
            generationOptions: (ui.generationOptions ?? [])
                .filter((field) => this._optionSupportsActiveAuthoringTab(field))
                .map((field) => ({
                id: field.id,
                label: field.label,
                options: (field.options ?? []).map((option) => ({
                    value: option.value,
                    label: option.label,
                    selected: String(option.value) === String(field.value ?? '')
                }))
                })),
            images: (ui.images ?? []).map((row) => ({
                fieldId: row.fieldId,
                checkboxId: row.checkboxId,
                fieldLabel: row.fieldLabel,
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
        const jsonOutputSelect = root.querySelector('.blacksmith-json-import-json-output-select');
        const importerSelect = root.querySelector('.blacksmith-json-import-switcher-select');
        const additionalGuidance = root.querySelector('[data-additional-guidance]');

        importerSelect?.addEventListener('change', async () => {
            const nextImporter = importerSelect.value;
            if (!nextImporter || nextImporter === this.selectedImporter) return;
            this._persistFormStateFromDom();
            await this._saveAuthoringState();
            await this.close();
            this.onSwitchImporter(nextImporter);
        });

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
            this._persistFormStateFromDom();
            void this._saveAuthoringState();
        });

        jsonOutputSelect?.addEventListener('change', () => {
            this.selectedJsonOutput = jsonOutputSelect.value === 'guided' ? 'guided' : 'clean';
            void this._saveAuthoringState();
        });

        additionalGuidance?.addEventListener('input', () => {
            this.additionalGuidance = String(additionalGuidance.value ?? '');
            JsonImportWindow._sessionAdditionalGuidance = this.additionalGuidance;
        });

        for (const input of root.querySelectorAll('[data-prompt-field]')) {
            input.addEventListener('change', () => {
                this._persistFormStateFromDom();
                this._updatePromptFieldVisibility();
                void this._saveAuthoringState();
            });
        }
        for (const input of root.querySelectorAll('[data-prompt-checkbox]')) {
            input.addEventListener('change', () => {
                this._persistFormStateFromDom();
                void this._saveAuthoringState();
            });
        }


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
