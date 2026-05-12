import { MODULE } from './const.js';
import { PinManager } from './manager-pins.js';
import { normalizePinTags } from './pins-schema.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';

const APP_ID = 'blacksmith-pin-layers';
const BULK_TAGS_APP_ID = 'blacksmith-bulk-pin-tags';
let _pinLayersWindowRef = null;
let _bulkPinTagsWindowRef = null;

function esc(value) {
    return foundry.utils.escapeHTML(String(value ?? ''));
}

class BulkPinTagsWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-template-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: BULK_TAGS_APP_ID,
            classes: ['blacksmith-pin-layers-window', 'blacksmith-pin-bulk-tags-window'],
            position: { width: 720, height: 560 },
            window: { title: 'Bulk Edit Pin Tags', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 560, minHeight: 420, maxWidth: 1100, maxHeight: 1000 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-template.hbs`
        }
    };

    static ACTION_HANDLERS = {
        cancel: () => _bulkPinTagsWindowRef?.close(),
        deleteAllTags: () => _bulkPinTagsWindowRef?._deleteAllTags(),
        updateTags: () => _bulkPinTagsWindowRef?._updateTags()
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? BULK_TAGS_APP_ID;
        super(opts);
        this.sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
        this.pinIds = (options.pins || []).map(pin => pin?.id).filter(Boolean);
        this._selectedPinsById = new Map((options.pins || []).filter(pin => pin?.id).map(pin => [pin.id, pin]));
    }

    static async open(options = {}) {
        const existing = _bulkPinTagsWindowRef;
        if (existing?.element?.isConnected) {
            existing.sceneId = options.sceneId ?? existing.sceneId;
            existing.pinIds = (options.pins || []).map(pin => pin?.id).filter(Boolean);
            existing._selectedPinsById = new Map((options.pins || []).filter(pin => pin?.id).map(pin => [pin.id, pin]));
            await existing.render(true);
            await Promise.resolve(existing.bringToFront?.());
            return existing;
        }
        if (existing && !existing.element?.isConnected) _bulkPinTagsWindowRef = null;
        const win = new BulkPinTagsWindow(options);
        _bulkPinTagsWindowRef = win;
        return win.render(true);
    }

    async close(options) {
        if (_bulkPinTagsWindowRef === this) _bulkPinTagsWindowRef = null;
        return super.close(options);
    }

    async getData() {
        const selectedPins = this._getSelectedPins();
        const bodyContent = this._buildBulkTagEditorContent(selectedPins);
        const count = selectedPins.length;
        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: true,
            showTools: false,
            showActionBar: true,
            headerIcon: 'fa-solid fa-tags',
            windowTitle: 'Bulk Edit Pin Tags',
            subtitle: `${count} Selected Pin${count !== 1 ? 's' : ''}`,
            headerRight: `<span class="blacksmith-pin-layers-summary-stat">${count} selected</span>`,
            bodyContent,
            actionBarLeft: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="cancel">
                    <i class="fa-solid fa-xmark"></i> Cancel
                </button>
            `,
            actionBarRight: `
                <button type="button" class="blacksmith-window-btn-critical" data-action="deleteAllTags">
                    <i class="fa-solid fa-trash"></i> Delete All Tags
                </button>
                <button type="button" class="blacksmith-window-btn-primary" data-action="updateTags">
                    <i class="fa-solid fa-check"></i> Update
                </button>
            `
        };
    }

    _getSelectedPins() {
        return this.pinIds
            .map(pinId => this._selectedPinsById.get(pinId) || PinManager.get(pinId, { sceneId: this.sceneId }))
            .filter(Boolean);
    }

    _buildBulkTagEditorContent(selectedPins) {
        const tagCounts = new Map();
        const total = selectedPins.length;
        for (const pin of selectedPins) {
            for (const tag of this._getAllTagsForPin(pin)) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }
        const existingTags = [...tagCounts.keys()].sort((a, b) => a.localeCompare(b));
        const suggestedTags = this._getBulkSuggestedTags(selectedPins, tagCounts);
        const otherTags = this._getBulkOtherTags(suggestedTags, tagCounts);
        const suggestedChips = this._buildBulkTagEditorChips(suggestedTags, tagCounts, total);
        const otherChips = this._buildBulkTagEditorChips(otherTags, tagCounts, total);

        return `
            <form class="blacksmith-pin-layers-bulk-tags-form">
                <div class="blacksmith-window-section blacksmith-pin-layers-bulk-classification-section">
                    <div class="blacksmith-window-section-header">
                        <span class="blacksmith-pin-config-section-title"><i class="fa-solid fa-tags"></i> Classification</span>
                    </div>
                    <div class="blacksmith-window-section-body">
                        <p class="blacksmith-pin-layers-bulk-help">
                            Editing <strong>${total}</strong> selected pin${total !== 1 ? 's' : ''}. The field starts with every tag currently used by the selection.
                        </p>
                        <div class="blacksmith-field-row">
                            <div class="blacksmith-field">
                                <span class="blacksmith-field-label">Tags</span>
                                <input type="text" class="blacksmith-input blacksmith-pin-layers-bulk-tags" value="${esc(existingTags.join(', '))}" placeholder="tag1, tag2">
                                ${suggestedTags.length ? `
                                <div class="blacksmith-pin-config-tag-group-label">Suggested</div>
                                <div class="blacksmith-tags" data-chip-type="tag">
                                    ${suggestedChips}
                                </div>` : ''}
                                ${otherTags.length ? `
                                <div class="blacksmith-pin-config-tag-group-label">Other</div>
                                <div class="blacksmith-tags" data-chip-type="tag">
                                    ${otherChips}
                                </div>` : ''}
                            </div>
                        </div>
                        <p class="blacksmith-pin-layers-bulk-hint">Chip counts show how many selected pins currently have that tag. Update replaces each selected pin's tags with the tags in the field.</p>
                    </div>
                </div>
            </form>`;
    }

    _getBulkSuggestedTags(selectedPins, tagCounts) {
        const tagsApi = game.modules.get(MODULE.ID)?.api?.tags;
        const suggested = new Set();
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        for (const pin of selectedPins) {
            const contextKey = `${pin.moduleId}.${pin.type || 'default'}`;
            for (const choice of (tagsApi?.getChoices?.(contextKey) ?? [])) {
                if (choice?.tier === 'taxonomy' && choice.key) suggested.add(choice.key);
            }
            const taxonomy = PinManager.getPinTaxonomy?.(pin.moduleId, pin.type);
            for (const tag of (taxonomy?.tags || [])) suggested.add(tag);
        }
        if (sceneId) {
            const scenePins = PinManager.list({ sceneId, includeHiddenByFilter: true }) || [];
            const selectedContexts = new Set(selectedPins.map(pin => `${pin.moduleId}|${pin.type || 'default'}`));
            for (const pin of scenePins) {
                if (!selectedContexts.has(`${pin.moduleId}|${pin.type || 'default'}`)) continue;
                for (const tag of this._getAllTagsForPin(pin)) suggested.add(tag);
            }
        }
        for (const tag of tagCounts.keys()) suggested.add(tag);
        return [...suggested].sort((a, b) => a.localeCompare(b));
    }

    _getAllTagsForPin(pin) {
        if (!pin) return [];
        const tagsApi = game.modules.get(MODULE.ID)?.api?.tags;
        const contextKey = `${pin.moduleId}.${pin.type || 'default'}`;
        const tags = [
            ...normalizePinTags(pin.tags || []),
            ...normalizePinTags(tagsApi?.getTags?.(contextKey, pin.id) || [])
        ];
        return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
    }

    _getBulkOtherTags(suggestedTags, tagCounts) {
        const tagsApi = game.modules.get(MODULE.ID)?.api?.tags;
        const suggested = new Set(suggestedTags);
        const registry = [
            ...(tagsApi?.getRegistry?.() ?? []),
            ...PinManager.getTagRegistry()
        ];
        for (const tag of tagCounts.keys()) {
            if (!suggested.has(tag)) registry.push(tag);
        }
        return [...new Set(registry)]
            .filter(tag => !suggested.has(tag))
            .sort((a, b) => a.localeCompare(b));
    }

    _buildBulkTagEditorChips(tags, tagCounts, total) {
        return tags.map(tag => {
            const count = tagCounts.get(tag) || 0;
            const partial = count > 0 && count < total;
            return `<span
                class="blacksmith-tag ${count === total ? 'active' : ''} ${partial ? 'is-partial' : ''} ${count === 0 ? 'is-empty' : ''}"
                data-value="${esc(tag)}"
                title="${esc(tag)} (${count} of ${total})">
                ${esc(tag)} <span class="blacksmith-pin-layers-tag-count">${count}</span>
            </span>`;
        }).join('');
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const root = this._getRoot();
        const input = root?.querySelector('.blacksmith-pin-layers-bulk-tags');
        if (!root || !input) return;
        const getTagsArray = () => normalizePinTags(input.value || '');
        const updateTagChips = () => {
            const current = new Set(getTagsArray());
            root.querySelectorAll('.blacksmith-tags[data-chip-type="tag"] .blacksmith-tag').forEach(chip => {
                chip.classList.toggle('active', current.has(chip.dataset.value));
            });
        };
        root.querySelectorAll('.blacksmith-tags[data-chip-type="tag"] .blacksmith-tag').forEach(chip => {
            chip.addEventListener('click', () => {
                const tags = getTagsArray();
                const value = chip.dataset.value;
                const idx = tags.indexOf(value);
                if (idx >= 0) tags.splice(idx, 1);
                else tags.push(value);
                input.value = tags.join(', ');
                updateTagChips();
            });
        });
        input.addEventListener('input', updateTagChips);
        updateTagChips();
    }

    async _deleteAllTags() {
        const selectedPins = this._getSelectedPins();
        if (!selectedPins.length) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete All Tags' },
            content: `<p>Delete <strong>all tags</strong> from <strong>${selectedPins.length}</strong> selected pin${selectedPins.length !== 1 ? 's' : ''}?</p><p>This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        await this._applyBulkTagSet(selectedPins.map(pin => pin.id), []);
        await this.close();
    }

    async _updateTags() {
        const selectedPins = this._getSelectedPins();
        if (!selectedPins.length) return;
        const root = this._getRoot();
        const tags = normalizePinTags(root?.querySelector('.blacksmith-pin-layers-bulk-tags')?.value || '');
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Confirm Bulk Tag Edit' },
            content: `<p>Replace tags on <strong>${selectedPins.length}</strong> selected pin${selectedPins.length !== 1 ? 's' : ''} with:</p><p><strong>${tags.length ? esc(tags.join(', ')) : 'No tags'}</strong></p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        await this._applyBulkTagSet(selectedPins.map(pin => pin.id), tags);
        await this.close();
    }

    async _applyBulkTagSet(pinIds, nextTags) {
        let updated = 0;
        let failed = 0;
        const normalizedNext = normalizePinTags(nextTags);
        for (const pinId of pinIds) {
            const pin = PinManager.get(pinId, { sceneId: this.sceneId });
            if (!pin) {
                failed++;
                continue;
            }
            const current = normalizePinTags(pin.tags || []);
            const next = [...normalizedNext];
            if (next.length === current.length && next.every((tag, idx) => tag === current[idx])) continue;
            try {
                await PinManager.update(pinId, { tags: next }, { sceneId: this.sceneId });
                updated++;
            } catch (_err) {
                failed++;
            }
        }
        const failureText = failed ? ` ${failed} failed.` : '';
        ui.notifications?.info(`Updated tags on ${updated} pin${updated !== 1 ? 's' : ''}.${failureText}`);
        await _pinLayersWindowRef?.render(true);
    }
}

export class PinLayersWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-template-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: APP_ID,
            classes: ['blacksmith-pin-layers-window'],
            position: { width: 720, height: 760 },
            window: { title: 'Pin Layers', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 560, minHeight: 520, maxWidth: 1100, maxHeight: 1000 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-template.hbs`
        }
    };

    static ACTION_HANDLERS = {
        selectTab:     (_event, target) => _pinLayersWindowRef?._selectTab(target),
        refresh:       () => _pinLayersWindowRef?._refresh(),
        hideAll:       () => _pinLayersWindowRef?._hideAll(),
        showAll:       () => _pinLayersWindowRef?._showAll(),
        saveProfile:   () => _pinLayersWindowRef?._saveProfile(),
        applyProfile:  () => _pinLayersWindowRef?._applyProfile(),
        updateProfile: () => _pinLayersWindowRef?._updateProfile(),
        deleteProfile: () => _pinLayersWindowRef?._deleteProfile(),
        clearBrowse:   () => { if (_pinLayersWindowRef) { _pinLayersWindowRef.browseQuery = ''; _pinLayersWindowRef.render(true); } },
        panToPin:      (_event, target) => _pinLayersWindowRef?._panToPin(target),
        toggleBrowseSelectMode: () => _pinLayersWindowRef?._toggleBrowseSelectMode(),
        selectVisibleBrowsePins: () => _pinLayersWindowRef?._selectVisibleBrowsePins(),
        clearBrowseSelection: () => _pinLayersWindowRef?._clearBrowseSelection(),
        bulkEditSelectedTags: () => _pinLayersWindowRef?._bulkEditSelectedTags(),
        toggleType:    (_event, target) => _pinLayersWindowRef?._toggleType(target),
        toggleTag:       (_event, target) => _pinLayersWindowRef?._toggleTag(target),
        toggleTaxonomyGroup:     (_event, target) => _pinLayersWindowRef?._toggleTaxonomyGroup(target),
        deleteType:      (_event, target) => _pinLayersWindowRef?._deleteType(target),
        toggleTagManage:         () => _pinLayersWindowRef?._toggleTagManage(),
        deleteTagChip:           (_event, target) => _pinLayersWindowRef?._deleteTagChip(target),
        toggleTypeTag:           (_event, target) => _pinLayersWindowRef?._toggleTypeTag(target),
        deleteSelectedCustomTypeTags: () => _pinLayersWindowRef?._deleteSelectedCustomTypeTags(),
        deleteCustomTypeTag:     (_event, target) => _pinLayersWindowRef?._deleteCustomTypeTag(target),
        stripTypeTagFromScene:   (_event, target) => _pinLayersWindowRef?._stripTypeTagFromScene(target),
        deleteAllPins:         () => _pinLayersWindowRef?._deleteAllPins(),
        configurePin:          (_event, target) => _pinLayersWindowRef?._configurePin(target),
        deleteBrowsePin:       (_event, target) => _pinLayersWindowRef?._deleteBrowsePin(target),
        setBrowsePinVisibility:(_event, target) => _pinLayersWindowRef?._setBrowsePinVisibility(target)
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        // Stable id so only one Pin Layers window exists (singleton).
        opts.id = opts.id ?? APP_ID;
        const bounds = game.settings.get(MODULE.ID, 'pinLayersWindowBounds') || {};
        const { lastProfile, lastTab, ...positionBounds } = bounds;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, PinLayersWindow.DEFAULT_OPTIONS.position ?? {}),
            positionBounds
        );
        super(opts);
        this.sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
        this.activeTab = lastTab || 'layers';
        this.browseQuery = '';
        this.browseIncludeHidden = false;
        this._selectedProfileValue = lastProfile !== undefined
            ? lastProfile
            : (PinManager.getActiveFilterProfileName() || '');
        this._browseDebounce = null;
        this._restoreBrowseFocus = false;
        this._tagManageMode = false;
        this._browseSelectMode = false;
        this._selectedBrowsePinIds = new Set();
        this._lastBrowsePinIds = [];
        this._lastBrowsePinsById = new Map();
    }

    static async open(options = {}) {
        const existing = _pinLayersWindowRef;
        if (existing?.element?.isConnected) {
            existing.sceneId = options.sceneId ?? canvas?.scene?.id ?? existing.sceneId;
            await existing.render(true);
            await Promise.resolve(existing.bringToFront?.());
            return existing;
        }
        if (existing && !existing.element?.isConnected) _pinLayersWindowRef = null;
        const win = new PinLayersWindow(options);
        _pinLayersWindowRef = win;
        return win.render(true);
    }

    async close(options) {
        try {
            const pos = this.position ?? {};
            await game.settings.set(MODULE.ID, 'pinLayersWindowBounds', {
                left: pos.left,
                top: pos.top,
                width: pos.width,
                height: pos.height,
                lastProfile: this._selectedProfileValue ?? '',
                lastTab: this.activeTab ?? 'layers'
            });
        } catch (_err) {
            // Non-fatal UI preference write.
        }
        if (_pinLayersWindowRef === this) _pinLayersWindowRef = null;
        return super.close(options);
    }

    async getData() {
        this._canBulkMutatePins = !!game.user?.isGM;
        await PinManager.ensureBuiltinTaxonomyLoaded();
        const scene = this.sceneId ? game.scenes?.get(this.sceneId) : canvas?.scene;
        const sceneId = scene?.id ?? canvas?.scene?.id ?? null;
        const isLayers = this.activeTab !== 'browse';

        // --- Layers tab data ---
        const allSummary = sceneId
            ? PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: true })
            : { total: 0, types: [], groups: [], tags: [] };
        const visibleSummary = sceneId
            ? PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: false })
            : { total: 0, types: [], groups: [], tags: [] };

        // --- Profile data ---
        const profiles = PinManager.listVisibilityProfiles();
        const activeProfileName = PinManager.getActiveFilterProfileName();
        const selectedProfile = this._selectedProfileValue;
        const isNewProfile = selectedProfile === '';
        const profileMatchesCurrent = !isNewProfile && PinManager.visibilityStateMatchesProfile(selectedProfile);
        const profileOptions = [
            `<option value="" ${isNewProfile ? 'selected' : ''}>New Profile</option>`,
            ...profiles.map((entry) =>
                `<option value="${esc(entry.name)}" ${entry.name === selectedProfile ? 'selected' : ''}>${esc(entry.name)}</option>`)
        ].join('');

        // --- Browse tab data ---
        let browsePins = [];
        if (!isLayers && sceneId) {
            const allPins = PinManager.list({ sceneId, includeHiddenByFilter: true }) || [];
            const q = this.browseQuery.toLowerCase().trim();
            browsePins = q
                ? allPins.filter(p =>
                    (p.text || '').toLowerCase().includes(q) ||
                    (PinManager.getPinTypeLabel(p.moduleId, p.type) || p.type || '').toLowerCase().includes(q) ||
                    (p.tags || []).some(t => t.toLowerCase().includes(q)))
                : allPins;
            if (!this.browseIncludeHidden) {
                browsePins = browsePins.filter(p => !this._isPinHiddenByFilter(p));
            }
            this._lastBrowsePinIds = browsePins.map(p => p.id).filter(Boolean);
            this._lastBrowsePinsById = new Map(browsePins.filter(p => p?.id).map(p => [p.id, p]));
            this._pruneBrowseSelection(allPins.map(p => p.id));
        } else {
            this._lastBrowsePinIds = [];
            this._lastBrowsePinsById = new Map();
        }

        // --- Build HTML ---
        const tabNav = `
            <nav class="blacksmith-tabs">
                <button type="button" class="blacksmith-tab ${isLayers ? 'is-active' : ''}" data-action="selectTab" data-value="layers">
                    <i class="fa-solid fa-layer-group"></i><span>Layers</span>
                </button>
                <button type="button" class="blacksmith-tab ${!isLayers ? 'is-active' : ''}" data-action="selectTab" data-value="browse">
                    <i class="fa-solid fa-magnifying-glass"></i><span>Browse</span>
                    <span class="blacksmith-pin-layers-tag-count">${allSummary.total}</span>
                </button>
            </nav>
        `;

        const bodyContent = isLayers
            ? this._buildLayersBody(allSummary)
            : this._buildBrowseBody(browsePins, allSummary.total);

        const profileBar = `
            <div class="blacksmith-pin-layers-profile-bar">
                <select class="blacksmith-input blacksmith-pin-layers-profile-select">
                    ${profileOptions}
                </select>
                ${isNewProfile ? `
                    <input type="text" class="blacksmith-input blacksmith-pin-layers-profile-name" value="" placeholder="Profile name">
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm" data-action="saveProfile" title="Save as new profile">
                        <i class="fa-solid fa-floppy-disk"></i> Save
                    </button>
                ` : `
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm" data-action="applyProfile" title="Restore this profile's saved filters">
                        <i class="fa-solid fa-check"></i> Apply
                    </button>
                    ${!profileMatchesCurrent ? `
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm" data-action="updateProfile" title="Save current filters over this profile">
                        <i class="fa-solid fa-floppy-disk"></i> Update
                    </button>` : ''}
                    <button type="button" class="blacksmith-window-btn-critical blacksmith-pin-layers-btn-icon blacksmith-pin-layers-btn-sm" data-action="deleteProfile" title="Delete this profile">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `}
            </div>
        `;

        return {
            appId: this.id,
            showOptionBar: true,
            showHeader: true,
            showTools: true,
            showActionBar: true,
            optionBarLeft: tabNav,
            toolsContent: isLayers ? profileBar : `
                <div class="blacksmith-pin-layers-browse-toolbar">
                    <div class="blacksmith-pin-layers-search-wrap">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" class="blacksmith-input blacksmith-pin-layers-browse-input"
                            value="${esc(this.browseQuery)}" placeholder="Filter pins by name, category, or tag…">
                        ${this.browseQuery ? `<button type="button" class="blacksmith-pin-layers-search-clear" data-action="clearBrowse" title="Clear filter"><i class="fa-solid fa-xmark"></i></button>` : ''}
                    </div>
                    <div class="blacksmith-toggle-row">
                        <span class="blacksmith-toggle-label">Show hidden</span>
                        <label class="blacksmith-toggle">
                            <input type="checkbox" class="blacksmith-toggle-input blacksmith-pin-layers-browse-hidden" ${this.browseIncludeHidden ? 'checked' : ''}>
                            <span class="blacksmith-toggle-slider"></span>
                        </label>
                    </div>
                    ${game.user?.isGM ? `
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm ${this._browseSelectMode ? 'is-active' : ''}"
                        data-action="toggleBrowseSelectMode" title="${this._browseSelectMode ? 'Exit select mode' : 'Select pins for bulk editing'}">
                        <i class="fa-solid ${this._browseSelectMode ? 'fa-check-square' : 'fa-square-check'}"></i> ${this._browseSelectMode ? 'Done' : 'Select'}
                    </button>` : ''}
                </div>
            `,
            headerIcon: 'fa-solid fa-layer-group',
            windowTitle: scene?.name || 'No active scene',
            subtitle: 'Scene Pins',
            headerRight: `
                <div class="blacksmith-pin-layers-summary">
                    <span class="blacksmith-pin-layers-summary-profile">${activeProfileName ? esc(activeProfileName) : 'Custom'}</span>
                    <span class="blacksmith-pin-layers-summary-stat"><i class="fa-solid fa-eye"></i> ${visibleSummary.total}</span>
                    <span class="blacksmith-pin-layers-summary-stat">${allSummary.total} total</span>
                </div>
            `,
            bodyContent,
            actionBarLeft: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="refresh">
                    <i class="fa-solid fa-rotate"></i> Refresh
                </button>
                ${game.user?.isGM ? `<button type="button" class="blacksmith-window-btn-critical" data-action="deleteAllPins" title="Delete all pins on this scene">
                    <i class="fa-solid fa-trash"></i> Delete All
                </button>` : ''}
            `,
            actionBarRight: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="hideAll">
                    <i class="fa-solid fa-eye-slash"></i> Hide All
                </button>
                <button type="button" class="blacksmith-window-btn-primary" data-action="showAll">
                    <i class="fa-solid fa-eye"></i> Show All
                </button>
            `
        };
    }

    _buildLayersBody(allSummary) {
        const isGM = !!game.user?.isGM;
        const managing = isGM && this._tagManageMode;

        // Build scene pin counts per type and per (type, tag)
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        const scenePins = sceneId ? (PinManager.list({ sceneId, includeHiddenByFilter: true }) || []) : [];
        const typeTagCounts = new Map();   // 'moduleId|type|tag' → count
        const typeCounts = new Map();      // 'moduleId|type' → count
        for (const p of scenePins) {
            const typeKey = `${p.moduleId}|${p.type || 'default'}`;
            typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);
            for (const tag of (p.tags || [])) {
                const k = `${typeKey}|${tag}`;
                typeTagCounts.set(k, (typeTagCounts.get(k) || 0) + 1);
            }
        }

        const allTaxonomies = PinManager.getAllTaxonomies();
        const globalTags = PinManager.getGlobalTaxonomyTags();

        const sections = [];

        // Build a global scene-pin tag count (for global section)
        const globalTagSceneCounts = new Map();
        for (const p of scenePins) {
            for (const tag of (p.tags || [])) {
                globalTagSceneCounts.set(tag, (globalTagSceneCounts.get(tag) || 0) + 1);
            }
        }

        // World registry orphan tags (not in any taxonomy) — used as the base for custom sections
        const orphanRegistryTags = this._getOrphanRegistryTags(allTaxonomies, globalTags);

        // GLOBAL group
        if (globalTags.length) {
            const hiddenCount = globalTags.filter(tag => PinManager.isTagHidden(tag)).length;
            const hidden = hiddenCount === globalTags.length;
            const partial = hiddenCount > 0 && !hidden;
            const chips = [...globalTags].sort().map(tag => {
                const hidden = PinManager.isTagHidden(tag);
                const count = globalTagSceneCounts.get(tag) ?? 0;
                return this._buildTagChip({ tag, hidden, count, isCustom: false, managing, isGlobal: true });
            }).join('');
            sections.push(this._buildTaxonomyGroup({ label: 'Global', chips, hidden, partial, toggleScope: 'global' }));
        }

        // Per-type groups
        for (const [moduleId, types] of Object.entries(allTaxonomies)) {
            for (const [type, entry] of Object.entries(types)) {
                const taxonomyTagSet = new Set(entry.tags || []);
                const typeKey = `${moduleId}|${type}`;
                const typeCount = typeCounts.get(typeKey) ?? null;

                // Seed custom tags from orphan registry (count=0) so stripped tags stay visible
                const customTagCounts = new Map();
                for (const tag of orphanRegistryTags) customTagCounts.set(tag, 0);

                // Overlay counts from current scene pins of this type
                for (const p of scenePins) {
                    if (p.moduleId !== moduleId || (p.type || 'default') !== (type || 'default')) continue;
                    for (const tag of (p.tags || [])) {
                        if (!taxonomyTagSet.has(tag)) customTagCounts.set(tag, (customTagCounts.get(tag) || 0) + 1);
                    }
                }

                const predefinedChips = (entry.tags || []).map(tag => {
                    const count = typeTagCounts.get(`${typeKey}|${tag}`) ?? 0;
                    const hidden = PinManager.isTypeTagHidden(moduleId, type, tag);
                    return this._buildTagChip({ tag, count, hidden, isCustom: false, managing, isGlobal: false, moduleId, type });
                }).join('');

                const customChips = [...customTagCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tag, count]) => {
                    const hidden = PinManager.isTypeTagHidden(moduleId, type, tag);
                    return this._buildTagChip({ tag, count, hidden, isCustom: true, managing, isGlobal: false, moduleId, type });
                }).join('');

                const sectionTags = new Set([...(entry.tags || []), ...customTagCounts.keys()]);
                const hiddenTagCount = [...sectionTags].filter(tag => PinManager.isTypeTagHidden(moduleId, type, tag)).length;
                const hidden = PinManager.isModuleTypeHidden(moduleId, type);
                const partial = !hidden && hiddenTagCount > 0;

                sections.push(this._buildTaxonomyGroup({
                    label: entry.label || type,
                    count: typeCount,
                    predefinedChips,
                    customChips,
                    hidden,
                    partial,
                    toggleScope: 'type',
                    moduleId,
                    type
                }));
            }
        }

        // CUSTOM (orphan) group — registry tags not in any taxonomy (catch-all with total scene counts)
        if (orphanRegistryTags.length) {
            const hiddenCount = orphanRegistryTags.filter(tag => PinManager.isTagHidden(tag)).length;
            const hidden = hiddenCount === orphanRegistryTags.length;
            const partial = hiddenCount > 0 && !hidden;
            const chips = orphanRegistryTags.sort((a, b) => a.localeCompare(b)).map(tag => {
                const hidden = PinManager.isTagHidden(tag);
                const count = globalTagSceneCounts.get(tag) ?? 0;
                return this._buildTagChip({ tag, hidden, count, isCustom: true, managing, isGlobal: true });
            }).join('');
            sections.push(this._buildTaxonomyGroup({ label: 'Custom', chips, hidden, partial, toggleScope: 'custom' }));
        }

        // GLOBAL PIN MANAGEMENT section (GM only)
        let managementSection = '';
        if (isGM) {
            const typeOptions = Object.entries(allTaxonomies).flatMap(([moduleId, types]) =>
                Object.entries(types).map(([type, entry]) =>
                    `<option value="${esc(`${moduleId}|${type}`)}" data-module-id="${esc(moduleId)}" data-type="${esc(type)}">${esc(entry.label || type)}</option>`
                )
            ).join('');
            const controls = typeOptions
                ? `<div class="blacksmith-pin-layers-mgmt-control">
                    <select class="blacksmith-input blacksmith-pin-layers-mgmt-type-select" title="Choose a pin category">
                        ${typeOptions}
                    </select>
                    <button type="button" class="blacksmith-window-btn-critical blacksmith-pin-layers-mgmt-btn"
                        data-action="deleteSelectedCustomTypeTags"
                        title="Remove non-taxonomy tags from the selected pin category globally">
                        <i class="fa-solid fa-trash"></i> Delete Custom Tags
                    </button>
                </div>`
                : '<div class="blacksmith-pin-layers-empty">No pin types registered.</div>';
            managementSection = `
                <div class="blacksmith-pin-layers-section-header">
                    <i class="fa-solid fa-wrench"></i><span>Global Pin Management</span>
                </div>
                <div class="blacksmith-pin-layers-mgmt-actions">
                    ${controls}
                </div>`;
        }

        const manageNote = managing
            ? `<div class="blacksmith-pin-layers-manage-note"><i class="fa-solid fa-lock"></i> Taxonomy tags are protected. Only custom tags show <i class="fa-solid fa-xmark"></i> buttons.</div>`
            : '';

        return `<div class="blacksmith-pin-layers-root">
            <div class="blacksmith-pin-layers-section-header blacksmith-pin-layers-section-header-first">
                <i class="fa-solid fa-tags"></i><span>Taxonomy</span>
                ${isGM ? `<button type="button" class="blacksmith-icon-action blacksmith-pin-layers-manage-tags ${managing ? 'is-active' : ''}" data-action="toggleTagManage" title="${managing ? 'Done managing' : 'Manage tags'}"><i class="fa-solid fa-pencil"></i></button>` : ''}
            </div>
            ${manageNote}
            <div class="blacksmith-pin-layers-taxonomy-sections">
                ${sections.join('') || '<div class="blacksmith-pin-layers-empty">No taxonomy registered.</div>'}
            </div>
            ${managementSection}
        </div>`;
    }

    _getOrphanRegistryTags(allTaxonomies = PinManager.getAllTaxonomies(), globalTags = PinManager.getGlobalTaxonomyTags()) {
        const allTaxonomyTagSet = new Set(globalTags);
        for (const types of Object.values(allTaxonomies)) {
            for (const entry of Object.values(types)) {
                for (const tag of (entry.tags || [])) allTaxonomyTagSet.add(tag);
            }
        }
        return PinManager.getTagRegistry().filter(tag => !allTaxonomyTagSet.has(tag));
    }

    _buildTaxonomyGroup({ label, count, chips, predefinedChips, customChips, hidden = false, partial = false, toggleScope = '', moduleId = '', type = '' }) {
        let body;
        if (predefinedChips !== undefined || customChips !== undefined) {
            const predefined = predefinedChips || '';
            const custom = customChips || '';
            body = `
                <div class="blacksmith-pin-layers-taxonomy-subgroup">
                    <div class="blacksmith-pin-layers-taxonomy-subgroup-label">Predefined</div>
                    <div class="blacksmith-pin-layers-tag-cloud">
                        ${predefined || '<span class="blacksmith-pin-layers-empty-inline">—</span>'}
                    </div>
                </div>
                <div class="blacksmith-pin-layers-taxonomy-subgroup">
                    <div class="blacksmith-pin-layers-taxonomy-subgroup-label">Custom</div>
                    <div class="blacksmith-pin-layers-tag-cloud">
                        ${custom || '<span class="blacksmith-pin-layers-empty-inline">—</span>'}
                    </div>
                </div>`;
        } else {
            body = `<div class="blacksmith-pin-layers-tag-cloud">
                ${chips || '<span class="blacksmith-pin-layers-empty-inline">—</span>'}
            </div>`;
        }
        const toggleAttrs = toggleScope
            ? `data-scope="${esc(toggleScope)}"${moduleId ? ` data-module-id="${esc(moduleId)}"` : ''}${type ? ` data-type="${esc(type)}"` : ''}`
            : '';
        const toggleButton = toggleScope ? `
                <button type="button"
                    class="blacksmith-icon-action blacksmith-pin-layers-section-toggle ${hidden ? '' : 'is-active'} ${partial ? 'is-partial' : ''}"
                    data-action="toggleTaxonomyGroup" ${toggleAttrs}
                    title="${hidden ? 'Show' : 'Hide'} ${esc(label)}">
                    <i class="fa-solid ${hidden ? 'fa-eye-slash' : (partial ? 'fa-eye-low-vision' : 'fa-eye')}"></i>
                </button>` : '';
        return `<div class="blacksmith-pin-layers-taxonomy-group ${hidden ? 'is-hidden' : ''} ${partial ? 'is-partial' : ''}">
            <div class="blacksmith-pin-layers-taxonomy-group-label">
                <span>${esc(label)}</span>
                ${count != null ? `<span class="blacksmith-pin-layers-tag-count">${count}</span>` : ''}
                ${toggleButton}
            </div>
            ${body}
        </div>`;
    }

    _buildTagChip({ tag, count, hidden, isCustom, managing, isGlobal, moduleId, type }) {
        if (managing && isCustom) {
            const baseAttrs = isGlobal ? `data-tag="${esc(tag)}"` : `data-tag="${esc(tag)}" data-module-id="${esc(moduleId)}" data-type="${esc(type)}"`;
            if (!isGlobal) {
                // Type-scoped custom tag: strip from scene OR delete globally
                return `<span class="blacksmith-tag blacksmith-tag-manage ${count === 0 ? 'is-empty' : ''}">
                    ${esc(tag)}
                    <button type="button" class="blacksmith-tag-delete" data-action="stripTypeTagFromScene" ${baseAttrs} title="Strip '${esc(tag)}' from pins on this scene"><i class="fa-solid fa-xmark"></i></button>
                    <button type="button" class="blacksmith-tag-delete blacksmith-tag-delete-global" data-action="deleteTagChip" ${baseAttrs} title="Delete '${esc(tag)}' from all scenes globally"><i class="fa-solid fa-trash"></i></button>
                </span>`;
            }
            return `<span class="blacksmith-tag blacksmith-tag-manage ${count === 0 ? 'is-empty' : ''}">
                ${esc(tag)}<button type="button" class="blacksmith-tag-delete" data-action="deleteTagChip" ${baseAttrs} title="Delete '${esc(tag)}' globally"><i class="fa-solid fa-trash"></i></button>
            </span>`;
        }
        if (managing) {
            return `<span class="blacksmith-tag blacksmith-tag-protected ${hidden ? 'is-hidden' : ''} ${count === 0 ? 'is-empty' : ''}">
                ${esc(tag)}${count != null ? `<span class="blacksmith-pin-layers-tag-count">${count}</span>` : ''}
            </span>`;
        }
        const action = isGlobal ? 'toggleTag' : 'toggleTypeTag';
        const attrs = isGlobal
            ? `data-tag="${esc(tag)}"`
            : `data-tag="${esc(tag)}" data-module-id="${esc(moduleId)}" data-type="${esc(type)}"`;
        return `<button type="button"
            class="blacksmith-tag ${hidden ? '' : 'active'} ${count === 0 ? 'is-empty' : ''}"
            data-action="${action}" ${attrs}
            title="${hidden ? 'Show' : 'Hide'} '${esc(tag)}'${count != null ? ` (${count})` : ''}">
            ${esc(tag)}${count != null ? `<span class="blacksmith-pin-layers-tag-count">${count}</span>` : ''}
        </button>`;
    }

    _buildBrowseBody(pins, totalPins) {
        const isGM = !!game.user?.isGM;
        const selectMode = isGM && this._browseSelectMode;
        const selectedCount = this._selectedBrowsePinIds.size;
        const pinRows = pins.map((p) => {
            const hidden = this._isPinHiddenByFilter(p);
            const selected = this._selectedBrowsePinIds.has(p.id);
            const typeLabel = PinManager.getPinTypeLabel(p.moduleId, p.type) || p.type || '';
            const typeHidden = PinManager.isModuleTypeHidden(p.moduleId, p.type);
            const tagChips = (p.tags || []).map(t => {
                const tagHidden = PinManager.isTagHidden(t);
                return `<span class="blacksmith-tag ${tagHidden ? 'is-hidden' : ''}">${esc(t)}</span>`;
            }).join('');
            const categoryChip = typeLabel
                ? `<span class="blacksmith-tag blacksmith-tag-category ${typeHidden ? 'is-hidden' : ''}"><i class="fa-solid fa-layer-group"></i> ${esc(typeLabel)}</span>`
                : '';
            const hasMeta = typeLabel || (p.tags && p.tags.length);
            const visStateRaw = String(p.config?.blacksmithVisibility || 'visible').toLowerCase();
            const visState = ['visible', 'hidden', 'owner'].includes(visStateRaw) ? visStateRaw : 'visible';
            const visIcon = visState === 'hidden' ? 'fa-users-slash' : (visState === 'owner' ? 'fa-user-shield' : 'fa-users');
            const visTitle = visState === 'hidden'
                ? 'Visibility: Hidden — click for Owner'
                : (visState === 'owner' ? 'Visibility: Owner — click for Visible' : 'Visibility: Visible — click for Hidden');
            const gmActions = isGM ? `
                <button type="button" class="blacksmith-icon-action ${visState === 'hidden' ? '' : 'is-active'}"
                    data-action="setBrowsePinVisibility" data-pin-id="${esc(p.id)}" data-vis-state="${esc(visState)}" title="${visTitle}">
                    <i class="fa-solid ${visIcon}"></i>
                </button>
                <button type="button" class="blacksmith-icon-action"
                    data-action="configurePin" data-pin-id="${esc(p.id)}" title="Configure pin">
                    <i class="fa-solid fa-cog"></i>
                </button>
                <button type="button" class="blacksmith-icon-action blacksmith-icon-action-danger"
                    data-action="deleteBrowsePin" data-pin-id="${esc(p.id)}" title="Delete pin">
                    <i class="fa-solid fa-trash"></i>
                </button>` : '';
            return `
                <div class="blacksmith-pin-layers-row ${hidden ? 'is-hidden' : ''} ${selected ? 'is-selected' : ''}">
                    ${selectMode ? `
                    <label class="blacksmith-pin-layers-select-cell" title="${selected ? 'Deselect' : 'Select'} pin">
                        <input type="checkbox" class="blacksmith-pin-layers-pin-select" data-pin-id="${esc(p.id)}" ${selected ? 'checked' : ''}>
                    </label>` : ''}
                    <div class="blacksmith-pin-layers-row-content">
                        <div class="blacksmith-pin-layers-row-top">
                            <div class="blacksmith-pin-layers-row-label">${esc(p.text || '(unnamed)')}</div>
                            <button type="button" class="blacksmith-icon-action"
                                data-action="panToPin" data-pin-id="${esc(p.id)}" title="Pan to pin">
                                <i class="fa-solid fa-location-crosshairs"></i>
                            </button>
                            ${gmActions}
                        </div>
                        ${hasMeta ? `
                        <div class="blacksmith-pin-layers-row-submeta">
                            ${categoryChip}${tagChips}
                        </div>` : ''}
                    </div>
                </div>`;
        }).join('');

        return `<div class="blacksmith-pin-layers-root">
            <div class="blacksmith-pin-layers-section-header blacksmith-pin-layers-section-header-first">
                <i class="fa-solid fa-map-pin"></i>
                <span>${this.browseQuery ? 'Filtered Pins' : 'All Pins'}</span>
                <span class="blacksmith-pin-layers-tag-count">${pins.length}${pins.length < totalPins ? ` of ${totalPins}` : ''}</span>
                ${selectMode ? `
                <div class="blacksmith-pin-layers-bulk-bar">
                    <span class="blacksmith-pin-layers-bulk-count">${selectedCount} selected</span>
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm" data-action="selectVisibleBrowsePins" ${pins.length ? '' : 'disabled'}>
                        <i class="fa-solid fa-list-check"></i> Select Visible
                    </button>
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm" data-action="clearBrowseSelection" ${selectedCount ? '' : 'disabled'}>
                        <i class="fa-solid fa-eraser"></i> Clear
                    </button>
                    <button type="button" class="blacksmith-window-btn-primary blacksmith-pin-layers-btn-sm" data-action="bulkEditSelectedTags" ${selectedCount ? '' : 'disabled'}>
                        <i class="fa-solid fa-tags"></i> Bulk Tags
                    </button>
                </div>` : ''}
            </div>
            <div class="blacksmith-pin-layers-list">
                ${pinRows || '<div class="blacksmith-pin-layers-empty">No pins matched.</div>'}
            </div>
        </div>`;
    }

    _isPinHiddenByFilter(p) {
        if (PinManager.isGlobalHidden()) return true;
        if (PinManager.isModuleTypeHidden(p.moduleId, p.type)) return true;
        const tags = p.tags || [];
        if (tags.some(t => PinManager.isTagHidden(t))) return true;
        if (tags.some(t => PinManager.isTypeTagHidden(p.moduleId, p.type, t))) return true;
        return false;
    }

    _buildToggleRow({ action, keyLabel, count, hidden, attrs = {} }) {
        const attrString = Object.entries(attrs)
            .map(([key, value]) => `${key}="${esc(value)}"`)
            .join(' ');
        return `
            <div class="blacksmith-pin-layers-row ${hidden ? 'is-hidden' : ''}">
                <div class="blacksmith-pin-layers-row-main">
                    <div class="blacksmith-pin-layers-row-label">
                        ${esc(keyLabel)}<span class="blacksmith-pin-layers-tag-count">${count}</span>
                    </div>
                </div>
                <button type="button" class="blacksmith-icon-action ${hidden ? '' : 'is-active'}"
                    data-action="${action}" title="${hidden ? 'Show' : 'Hide'}" ${attrString}>
                    <i class="fa-solid fa-eye"></i>
                </button>
            </div>`;
    }

    _buildTypeRow({ label, count, hidden, moduleId, type }) {
        const attrs = `data-module-id="${esc(moduleId)}" data-type="${esc(type)}"`;
        return `
            <div class="blacksmith-pin-layers-row ${hidden ? 'is-hidden' : ''}">
                <div class="blacksmith-pin-layers-row-main">
                    <div class="blacksmith-pin-layers-row-label">
                        ${esc(label)}<span class="blacksmith-pin-layers-tag-count">${count}</span>
                    </div>
                </div>
                <button type="button" class="blacksmith-icon-action ${hidden ? '' : 'is-active'}"
                    data-action="toggleType" title="${hidden ? 'Show' : 'Hide'}" ${attrs}>
                    <i class="fa-solid fa-eye"></i>
                </button>
                ${this._canBulkMutatePins ? `
                <button type="button" class="blacksmith-icon-action"
                    data-action="deleteType" title="Delete all ${esc(label)} pins" ${attrs}>
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </div>`;
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const root = this._getRoot();

        // Profile select (Layers tab)
        root?.querySelector('.blacksmith-pin-layers-profile-select')
            ?.addEventListener('change', (e) => {
                this._selectedProfileValue = e.target.value;
                void this._persistLastProfile();
                void this.render(true);
            });

        // Browse filter input
        const browseInput = root?.querySelector('.blacksmith-pin-layers-browse-input');
        browseInput?.addEventListener('input', () => {
            const next = browseInput.value || '';
            if (this._browseDebounce) clearTimeout(this._browseDebounce);
            this._browseDebounce = setTimeout(() => {
                this.browseQuery = next;
                this._restoreBrowseFocus = true;
                void this.render(true);
            }, 180);
        });

        // Browse hidden toggle
        root?.querySelector('.blacksmith-pin-layers-browse-hidden')
            ?.addEventListener('change', (e) => {
                this.browseIncludeHidden = !!e.target.checked;
                void this.render(true);
            });

        root?.querySelectorAll('.blacksmith-pin-layers-pin-select')
            ?.forEach((input) => {
                input.addEventListener('change', (e) => {
                    const pinId = e.target?.dataset?.pinId || '';
                    if (!pinId) return;
                    if (e.target.checked) this._selectedBrowsePinIds.add(pinId);
                    else this._selectedBrowsePinIds.delete(pinId);
                    void this.render(true);
                });
            });

        // Restore focus to browse input after re-render
        if (this._restoreBrowseFocus && browseInput) {
            this._restoreBrowseFocus = false;
            const cursor = browseInput.value.length;
            requestAnimationFrame(() => {
                browseInput.focus();
                try { browseInput.setSelectionRange(cursor, cursor); } catch (_e) {}
            });
        }
    }

    _selectTab(target) {
        const tab = target?.dataset?.value || 'layers';
        this.activeTab = tab;
        void this.render(true);
    }

    _pruneBrowseSelection(validPinIds = []) {
        const valid = new Set(validPinIds.filter(Boolean));
        for (const pinId of [...this._selectedBrowsePinIds]) {
            if (!valid.has(pinId)) this._selectedBrowsePinIds.delete(pinId);
        }
    }

    _toggleBrowseSelectMode() {
        if (!game.user?.isGM) return;
        this._browseSelectMode = !this._browseSelectMode;
        if (!this._browseSelectMode) this._selectedBrowsePinIds.clear();
        void this.render(true);
    }

    _selectVisibleBrowsePins() {
        if (!game.user?.isGM || !this._browseSelectMode) return;
        for (const pinId of this._lastBrowsePinIds) {
            if (pinId) this._selectedBrowsePinIds.add(pinId);
        }
        void this.render(true);
    }

    _clearBrowseSelection() {
        this._selectedBrowsePinIds.clear();
        void this.render(true);
    }

    async _refresh() { await this.render(true); }

    async _hideAll() {
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        const summary = PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: true });
        for (const entry of summary.types) {
            const [moduleId, type] = String(entry.key || '').split('|');
            await PinManager.setModuleTypeHidden(moduleId, type || 'default', true);
        }
        for (const tag of PinManager.getTagRegistry()) await PinManager.setTagHidden(tag, true);
        for (const entry of summary.tags) await PinManager.setTagHidden(entry.key, true);
        // Hide all type-tag combos from the full taxonomy
        const allTaxonomies = PinManager.getAllTaxonomies();
        for (const [moduleId, types] of Object.entries(allTaxonomies)) {
            for (const [type, entry] of Object.entries(types)) {
                for (const tag of (entry.tags || [])) {
                    await PinManager.setTypeTagHidden(moduleId, type, tag, true);
                }
            }
        }
        await this.render(true);
    }

    async _showAll() {
        await PinManager.setGlobalHidden(false);
        const summary = PinManager.getSceneFilterSummary(this.sceneId ?? canvas?.scene?.id, { includeHiddenByFilter: true });
        for (const entry of summary.types) {
            const [moduleId, type] = String(entry.key || '').split('|');
            await PinManager.setModuleTypeHidden(moduleId, type || 'default', false);
        }
        for (const tag of PinManager.getTagRegistry()) await PinManager.setTagHidden(tag, false);
        for (const entry of summary.tags) await PinManager.setTagHidden(entry.key, false);
        await PinManager.clearTypeTagHiddenState();
        await this.render(true);
    }

    async _persistLastProfile() {
        try {
            const bounds = game.settings.get(MODULE.ID, 'pinLayersWindowBounds') || {};
            await game.settings.set(MODULE.ID, 'pinLayersWindowBounds', {
                ...bounds,
                lastProfile: this._selectedProfileValue ?? ''
            });
        } catch (_err) {}
    }

    _getPendingProfileName() {
        return this._getRoot()?.querySelector('.blacksmith-pin-layers-profile-name')?.value?.trim() || '';
    }

    async _saveProfile() {
        const name = this._getPendingProfileName();
        if (!name) { ui.notifications?.warn('Enter a profile name to save.'); return; }
        await PinManager.saveVisibilityProfile(name);
        this._selectedProfileValue = name;
        await this._persistLastProfile();
        ui.notifications?.info(`Saved pin profile: ${name}`);
        await this.render(true);
    }

    async _applyProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('Choose a saved profile to apply.'); return; }
        await PinManager.applyVisibilityProfile(name);
        await this._persistLastProfile();
        ui.notifications?.info(`Applied pin profile: ${name}`);
        await this.render(true);
    }

    async _updateProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('No profile selected to update.'); return; }
        await PinManager.saveVisibilityProfile(name);
        await this._persistLastProfile();
        ui.notifications?.info(`Updated pin profile: ${name}`);
        await this.render(true);
    }

    async _deleteProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('Choose a saved profile to delete.'); return; }
        const removed = await PinManager.deleteVisibilityProfile(name);
        if (!removed) { ui.notifications?.warn(`Profile not found: ${name}`); return; }
        this._selectedProfileValue = '';
        await this._persistLastProfile();
        ui.notifications?.info(`Deleted pin profile: ${name}`);
        await this.render(true);
    }

    async _deleteType(target) {
        if (!game.user?.isGM) {
            ui.notifications?.warn('Only a Gamemaster can delete pins from this panel.');
            return;
        }
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!moduleId) return;
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        if (!sceneId) return;
        const friendlyName = PinManager.getPinTypeLabel(moduleId, type) || type;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Pin Type' },
            content: `<p>Delete all <strong>${friendlyName}</strong> pins on this scene? This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        const count = await PinManager.deleteAllByType(type, { sceneId, moduleId });
        ui.notifications?.info(`Deleted ${count} ${friendlyName} pin${count !== 1 ? 's' : ''}.`);
        await this.render(true);
    }

    async _panToPin(target) {
        const pinId = target?.dataset?.pinId || '';
        if (!pinId) return;
        const api = game.modules.get(MODULE.ID)?.api?.pins;
        await api?.panTo?.(pinId, { sceneId: this.sceneId, ping: true });
    }

    async _deleteAllPins() {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete All Pins' },
            content: '<p>Are you sure you want to delete <strong>ALL</strong> pins on this scene?</p><p>This action cannot be undone.</p>',
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        const count = await PinManager.deleteAll({ sceneId: this.sceneId });
        ui.notifications?.info(`Deleted ${count} pin${count !== 1 ? 's' : ''}.`);
        await this.render(true);
    }

    async _configurePin(target) {
        const pinId = target?.dataset?.pinId || '';
        if (!pinId) return;
        const api = game.modules.get(MODULE.ID)?.api?.pins;
        await api?.configure?.(pinId, { sceneId: this.sceneId });
    }

    async _deleteBrowsePin(target) {
        const pinId = target?.dataset?.pinId || '';
        if (!pinId) return;
        const pin = PinManager.get(pinId);
        const label = pin?.text || 'this pin';
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Pin' },
            content: `<p>Delete <strong>${label}</strong>? This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        await PinManager.delete(pinId);
        await this.render(true);
    }

    async _bulkEditSelectedTags() {
        if (!game.user?.isGM) return;
        const selectedIds = [...this._selectedBrowsePinIds].filter(Boolean);
        if (!selectedIds.length) {
            ui.notifications?.warn('Select one or more pins first.');
            return;
        }
        const selectedPins = selectedIds
            .map(pinId => this._lastBrowsePinsById.get(pinId) || PinManager.get(pinId, { sceneId: this.sceneId }))
            .filter(Boolean);
        if (!selectedPins.length) {
            ui.notifications?.warn('Selected pins were not found.');
            return;
        }
        await BulkPinTagsWindow.open({ sceneId: this.sceneId, pins: selectedPins });
    }

    async _setBrowsePinVisibility(target) {
        const pinId = target?.dataset?.pinId || '';
        const currentRaw = String(target?.dataset?.visState || 'visible').toLowerCase();
        const current = ['visible', 'hidden', 'owner'].includes(currentRaw) ? currentRaw : 'visible';
        if (!pinId) return;
        const pin = PinManager.get(pinId);
        if (!pin) return;
        const next = current === 'visible' ? 'hidden' : (current === 'hidden' ? 'owner' : 'visible');
        await PinManager.update(pinId, { config: { ...(pin.config || {}), blacksmithVisibility: next } });
        await this.render(true);
    }

    async _toggleType(target) {
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!moduleId) return;
        await PinManager.setModuleTypeHidden(moduleId, type, !PinManager.isModuleTypeHidden(moduleId, type));
        await this.render(true);
    }

    async _toggleTag(target) {
        const tag = target?.dataset?.tag || '';
        if (!tag) return;
        const currentlyHidden = PinManager.isTagHidden(tag);
        if (currentlyHidden) {
            // Showing this tag — unblock the categories of its pins so they can actually appear
            const sceneId = this.sceneId ?? canvas?.scene?.id;
            const pins = (PinManager.list({ sceneId, includeHiddenByFilter: true }) || [])
                .filter(p => (p.tags || []).some(t => t.toLowerCase().trim() === tag.toLowerCase().trim()));
            for (const pin of pins) {
                if (pin.moduleId && PinManager.isModuleTypeHidden(pin.moduleId, pin.type)) {
                    await PinManager.setModuleTypeHidden(pin.moduleId, pin.type || 'default', false);
                }
            }
        }
        await PinManager.setTagHidden(tag, !currentlyHidden);
        await this.render(true);
    }

    async _toggleTaxonomyGroup(target) {
        const scope = target?.dataset?.scope || '';
        if (scope === 'type') {
            const moduleId = target?.dataset?.moduleId || '';
            const type = target?.dataset?.type || 'default';
            if (!moduleId) return;
            await PinManager.setModuleTypeHidden(moduleId, type, !PinManager.isModuleTypeHidden(moduleId, type));
            await this.render(true);
            return;
        }

        await PinManager.ensureBuiltinTaxonomyLoaded();
        const tags = scope === 'global'
            ? PinManager.getGlobalTaxonomyTags()
            : (scope === 'custom' ? this._getOrphanRegistryTags() : []);
        if (!tags.length) return;
        const nextHidden = !tags.every(tag => PinManager.isTagHidden(tag));
        for (const tag of tags) {
            await PinManager.setTagHidden(tag, nextHidden);
        }
        await this.render(true);
    }

    _toggleTagManage() {
        if (!game.user?.isGM) return;
        this._tagManageMode = !this._tagManageMode;
        void this.render(true);
    }

    async _deleteTagChip(target) {
        if (!game.user?.isGM) return;
        const tag = target?.dataset?.tag;
        if (!tag) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Tag Globally' },
            content: `<p>Remove tag <strong>${tag}</strong> from all pins on all scenes? This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        await PinManager.deleteTagGlobally(tag);
        ui.notifications?.info(`Deleted tag "${tag}" from all scenes.`);
        await this.render(true);
    }

    async _toggleTypeTag(target) {
        const tag = target?.dataset?.tag || '';
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!tag || !moduleId) return;
        await PinManager.setTypeTagHidden(moduleId, type, tag, !PinManager.isTypeTagHidden(moduleId, type, tag));
        await this.render(true);
    }

    async _deleteCustomTypeTag(target) {
        if (!game.user?.isGM) return;
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!moduleId) return;
        await this._deleteCustomTagsForType(moduleId, type);
    }

    async _deleteSelectedCustomTypeTags() {
        if (!game.user?.isGM) return;
        const select = this._getRoot()?.querySelector('.blacksmith-pin-layers-mgmt-type-select');
        const selected = select?.selectedOptions?.[0];
        const moduleId = selected?.dataset?.moduleId || '';
        const type = selected?.dataset?.type || 'default';
        if (!moduleId) {
            ui.notifications?.warn('Choose a pin category first.');
            return;
        }
        await this._deleteCustomTagsForType(moduleId, type);
    }

    async _deleteCustomTagsForType(moduleId, type) {
        const taxonomy = PinManager.getPinTaxonomy(moduleId, type);
        const label = taxonomy?.label || type;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Custom Tags' },
            content: `<p>Remove all non-taxonomy tags from <strong>${label}</strong> pins across all scenes?</p><p>Taxonomy-defined tags on these pins are preserved. This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        const count = await PinManager.deleteCustomTagsForType(moduleId, type);
        ui.notifications?.info(count > 0
            ? `Removed ${count} custom tag instance${count !== 1 ? 's' : ''} from ${label} pins.`
            : `No custom tags found on ${label} pins.`);
        await this.render(true);
    }

    async _stripTypeTagFromScene(target) {
        if (!game.user?.isGM) return;
        const tag = target?.dataset?.tag || '';
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!tag || !moduleId) return;
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        if (!sceneId) return;
        const taxonomy = PinManager.getPinTaxonomy?.(moduleId, type);
        const label = taxonomy?.label || type;
        const sceneName = game.scenes?.get(sceneId)?.name || 'this scene';
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Strip Tag From Scene' },
            content: `<p>Remove tag <strong>${tag}</strong> from all <strong>${label}</strong> pins on <strong>${sceneName}</strong>?</p><p>Pins are not deleted. This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        const count = await PinManager.removeTagFromTypeOnScene(moduleId, type, tag, sceneId);
        ui.notifications?.info(count > 0
            ? `Stripped tag "${tag}" from ${count} pin${count !== 1 ? 's' : ''} on ${sceneName}.`
            : `Tag "${tag}" was not found on any ${label} pins on ${sceneName}.`);
        await this.render(true);
    }
}

Hooks.once('ready', () => {
    const api = game.modules.get(MODULE.ID)?.api;
    if (!api?.registerWindow) return;
    api.registerWindow('blacksmith-pin-layers', {
        open: (options = {}) => PinLayersWindow.open(options),
        title: 'Pin Layers',
        moduleId: MODULE.ID
    });
});

// On each canvas load, re-apply the last selected profile so filter state is consistent after reload.
Hooks.on('canvasReady', async () => {
    try {
        const bounds = game.settings.get(MODULE.ID, 'pinLayersWindowBounds') || {};
        const profileName = bounds.lastProfile;
        if (!profileName) return;
        const profiles = PinManager.listVisibilityProfiles();
        if (profiles.some(p => p.name === profileName)) {
            await PinManager.applyVisibilityProfile(profileName);
        }
    } catch (_err) {}
});
