import { MODULE } from './const.js';
import { PinManager } from './manager-pins.js';
import { normalizePinTags } from './pins-schema.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { HookManager } from './manager-hooks.js';
import { PIN_ACCESS_ICONS, PIN_VISIBILITY_ICONS } from './pin-permission-icons.js';

const APP_ID = 'blacksmith-pin-layers';
const BULK_TAGS_APP_ID = 'blacksmith-bulk-pin-tags';
const CUSTOM_TAGS_APP_ID = 'blacksmith-custom-pin-tags';
const PROFILE_ACTION_NEW = '__blacksmith_new_profile__';
const SYSTEM_PROFILE_ALL = PinManager.SYSTEM_PROFILE_ALL ?? '__blacksmith_all_pins__';
const SYSTEM_PROFILE_NONE = PinManager.SYSTEM_PROFILE_NONE ?? '__blacksmith_no_pins__';
let _pinLayersWindowRef = null;
let _bulkPinTagsWindowRef = null;
let _customPinTagsWindowRef = null;

function esc(value) {
    return foundry.utils.escapeHTML(String(value ?? ''));
}

/** Access preset for a pin; matches Configure Pin (`window-pin-configuration.js`). */
function browsePinAccessMode(p) {
    const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : 0;
    const LIMITED = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED : 1;
    const OBSERVER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 2;
    const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER : 3;
    const rawDefault = typeof p?.ownership?.default === 'number' ? p.ownership.default : NONE;
    const ownershipDefault = rawDefault === LIMITED ? OBSERVER : rawDefault;
    const rawAccessMode = String(p.config?.blacksmithAccess || '').trim().toLowerCase();
    if (ownershipDefault <= NONE) return 'none';
    if (ownershipDefault >= OWNER) return 'full';
    if (rawAccessMode === 'pin') return 'pin';
    return 'read';
}

const BROWSE_ACCESS_TOOLTIP = Object.freeze({
    none: 'Access: None (GM only)',
    read: 'Access: Read only — all open / GM edit',
    pin: 'Access: Pin — all see pin / GM and owner edit',
    full: 'Access: Full — all view and edit'
});

function getProfileDisplayName(value) {
    if (value === SYSTEM_PROFILE_ALL) return 'All Pins';
    if (value === SYSTEM_PROFILE_NONE) return 'No Pins';
    return String(value || '');
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

class ManageCustomPinTagsWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-template-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: CUSTOM_TAGS_APP_ID,
            classes: ['blacksmith-pin-layers-window', 'blacksmith-custom-pin-tags-window'],
            position: { width: 820, height: 640 },
            window: { title: 'Manage Custom Pin Tags', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 640, minHeight: 460, maxWidth: 1200, maxHeight: 1000 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-template.hbs`
        }
    };

    static ACTION_HANDLERS = {
        close: () => _customPinTagsWindowRef?.close(),
        refreshCustomTags: () => _customPinTagsWindowRef?.render(true),
        addCustomTag: () => _customPinTagsWindowRef?._addCustomTag(),
        renameCustomTag: (_event, target) => _customPinTagsWindowRef?._renameTag(target),
        stripCustomTagCurrentScene: (_event, target) => _customPinTagsWindowRef?._stripTagFromCurrentScene(target),
        stripCustomTagAllScenes: (_event, target) => _customPinTagsWindowRef?._stripTagFromAllScenes(target),
        deleteCustomTagGlobal: (_event, target) => _customPinTagsWindowRef?._deleteTagGlobally(target)
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? CUSTOM_TAGS_APP_ID;
        super(opts);
        this.sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
    }

    static async open(options = {}) {
        const existing = _customPinTagsWindowRef;
        if (existing?.element?.isConnected) {
            existing.sceneId = options.sceneId ?? canvas?.scene?.id ?? existing.sceneId;
            await existing.render(true);
            await Promise.resolve(existing.bringToFront?.());
            return existing;
        }
        if (existing && !existing.element?.isConnected) _customPinTagsWindowRef = null;
        const win = new ManageCustomPinTagsWindow(options);
        _customPinTagsWindowRef = win;
        return win.render(true);
    }

    async close(options) {
        if (_customPinTagsWindowRef === this) _customPinTagsWindowRef = null;
        return super.close(options);
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const input = this._getRoot()?.querySelector('.blacksmith-custom-pin-tags-add-input');
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void this._addCustomTag();
        });
    }

    async getData() {
        await PinManager.ensureBuiltinTaxonomyLoaded();
        const rows = this._getCustomTagRows();
        const scene = this.sceneId ? game.scenes?.get(this.sceneId) : canvas?.scene;
        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: true,
            showTools: false,
            showActionBar: true,
            headerIcon: 'fa-solid fa-tags',
            windowTitle: 'Manage Custom Pin Tags',
            subtitle: scene?.name ? `Scene: ${esc(scene.name)}` : 'No active scene',
            headerRight: `<span class="blacksmith-pin-layers-summary-stat">${rows.length} custom</span>`,
            bodyContent: this._buildBody(rows),
            actionBarLeft: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="refreshCustomTags">
                    <i class="fa-solid fa-rotate"></i> Refresh
                </button>
            `,
            actionBarRight: `
                <button type="button" class="blacksmith-window-btn-primary" data-action="close">
                    <i class="fa-solid fa-check"></i> Done
                </button>
            `
        };
    }

    _getTaxonomyTagSet() {
        const tags = new Set(PinManager.getGlobalTaxonomyTags());
        for (const types of Object.values(PinManager.getAllTaxonomies())) {
            for (const entry of Object.values(types)) {
                for (const tag of (entry.tags || [])) tags.add(tag);
            }
        }
        return tags;
    }

    _getAllPinSources() {
        const sources = [];
        for (const scene of game.scenes || []) {
            const pins = PinManager.list({ sceneId: scene.id, includeHiddenByFilter: true }) || [];
            for (const pin of pins) sources.push({ pin, sceneId: scene.id });
        }
        const unplaced = PinManager.list({ unplacedOnly: true, includeHiddenByFilter: true }) || [];
        for (const pin of unplaced) sources.push({ pin, sceneId: null });
        return sources;
    }

    _getPinTypeLabel(pin) {
        return PinManager.getPinTypeLabel(pin.moduleId, pin.type)
            || PinManager.getPinTaxonomy?.(pin.moduleId, pin.type)?.label
            || pin.type
            || 'default';
    }

    _getCustomTagRows() {
        const taxonomyTags = this._getTaxonomyTagSet();
        const tagsApi = game.modules.get(MODULE.ID)?.api?.tags;
        const registryTags = [
            ...PinManager.getTagRegistry(),
            ...(tagsApi?.getRegistry?.() ?? [])
        ];
        const rows = new Map();
        const ensure = (tag) => {
            if (!tag || taxonomyTags.has(tag)) return null;
            if (!rows.has(tag)) {
                rows.set(tag, { tag, currentSceneCount: 0, globalCount: 0, typeLabels: new Set() });
            }
            return rows.get(tag);
        };

        for (const tag of normalizePinTags(registryTags)) ensure(tag);

        for (const { pin, sceneId } of this._getAllPinSources()) {
            for (const tag of normalizePinTags(pin.tags || [])) {
                const row = ensure(tag);
                if (!row) continue;
                row.globalCount += 1;
                if (sceneId && sceneId === this.sceneId) row.currentSceneCount += 1;
                row.typeLabels.add(this._getPinTypeLabel(pin));
            }
        }

        return [...rows.values()]
            .map(row => ({
                ...row,
                typeLabelText: [...row.typeLabels].sort((a, b) => a.localeCompare(b)).join(', ') || 'Not currently used'
            }))
            .sort((a, b) => a.tag.localeCompare(b.tag));
    }

    _buildBody(rows) {
        const scene = this.sceneId ? game.scenes?.get(this.sceneId) : canvas?.scene;
        const rowHtml = rows.map(row => `
            <div class="blacksmith-custom-pin-tags-row">
                <div class="blacksmith-custom-pin-tags-tag">
                    <span class="blacksmith-tag active">${esc(row.tag)}</span>
                </div>
                <div class="blacksmith-custom-pin-tags-count">${row.currentSceneCount}</div>
                <div class="blacksmith-custom-pin-tags-count">${row.globalCount}</div>
                <div class="blacksmith-custom-pin-tags-types">${esc(row.typeLabelText)}</div>
                <div class="blacksmith-custom-pin-tags-actions">
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm"
                        data-action="renameCustomTag" data-tag="${esc(row.tag)}"
                        data-tooltip="Rename this tag everywhere it is used" aria-label="Rename tag">
                        <i class="fa-solid fa-pen"></i> Rename
                    </button>
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm"
                        data-action="stripCustomTagCurrentScene" data-tag="${esc(row.tag)}" ${row.currentSceneCount ? '' : 'disabled'}
                        data-tooltip="Remove this tag from all pins on ${esc(scene?.name || 'the current scene')} but keep the tag available" aria-label="Strip tag from current scene">
                        <i class="fa-solid fa-broom"></i> Scene
                    </button>
                    <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm"
                        data-action="stripCustomTagAllScenes" data-tag="${esc(row.tag)}" ${row.globalCount ? '' : 'disabled'}
                        data-tooltip="Remove this tag from all pins on all scenes but keep the tag available" aria-label="Strip tag from all scenes">
                        <i class="fa-solid fa-eraser"></i> All Scene
                    </button>
                    <button type="button" class="blacksmith-window-btn-critical blacksmith-pin-layers-btn-sm blacksmith-pin-layers-btn-icon"
                        data-action="deleteCustomTagGlobal" data-tag="${esc(row.tag)}"
                        data-tooltip="Delete this tag from the registry and remove it from all pins everywhere" aria-label="Delete tag globally">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        return `<div class="blacksmith-pin-layers-root blacksmith-custom-pin-tags-root">
            <div class="blacksmith-pin-layers-section-header blacksmith-pin-layers-section-header-first">
                <i class="fa-solid fa-tags"></i>
                <span>Custom Pin Tags</span>
                <span class="blacksmith-pin-layers-tag-count">${rows.length}</span>
            </div>
            <div class="blacksmith-custom-pin-tags-add-row">
                <input type="text" class="blacksmith-input blacksmith-custom-pin-tags-add-input" placeholder="Add custom tags, separated by commas">
                <button type="button" class="blacksmith-window-btn-primary blacksmith-pin-layers-btn-sm"
                    data-action="addCustomTag" data-tooltip="Add one or more custom tags to the registry without assigning them to pins">
                    <i class="fa-solid fa-plus"></i> Add
                </button>
            </div>
            <div class="blacksmith-custom-pin-tags-grid">
                <div class="blacksmith-custom-pin-tags-header">Tag</div>
                <div class="blacksmith-custom-pin-tags-header">Scene</div>
                <div class="blacksmith-custom-pin-tags-header">Global</div>
                <div class="blacksmith-custom-pin-tags-header">Pin Types</div>
                <div class="blacksmith-custom-pin-tags-header">Actions</div>
                ${rowHtml || '<div class="blacksmith-pin-layers-empty blacksmith-custom-pin-tags-empty">No custom pin tags found.</div>'}
            </div>
        </div>`;
    }

    async _addCustomTag() {
        const input = this._getRoot()?.querySelector('.blacksmith-custom-pin-tags-add-input');
        const tags = normalizePinTags(input?.value || '');
        if (!tags.length) {
            ui.notifications?.warn('Enter one or more tag names to add.');
            return;
        }
        const taxonomyTags = this._getTaxonomyTagSet();
        const customTags = tags.filter(tag => !taxonomyTags.has(tag));
        if (!customTags.length) {
            ui.notifications?.warn('All entered tags are already taxonomy tags.');
            return;
        }
        const existing = new Set(this._getCustomTagRows().map(row => row.tag));
        for (const tag of customTags) await PinManager.addTagToRegistry(tag);
        if (input) input.value = '';
        const added = customTags.filter(tag => !existing.has(tag));
        const skippedCount = tags.length - customTags.length;
        const addedText = added.length
            ? `Added ${added.length} custom pin tag${added.length !== 1 ? 's' : ''}.`
            : 'All entered custom tags were already available.';
        const skippedText = skippedCount ? ` ${skippedCount} taxonomy tag${skippedCount !== 1 ? 's were' : ' was'} skipped.` : '';
        ui.notifications?.info(`${addedText}${skippedText}`);
        await this.render(true);
        await _pinLayersWindowRef?.render(true);
    }

    async _promptRenameTag(tag) {
        const current = normalizePinTags(tag)[0] || '';
        if (!current) return '';
        const content = `
            <form>
                <div class="blacksmith-field">
                    <span class="blacksmith-field-label">New tag name</span>
                    <input type="text" class="blacksmith-input blacksmith-custom-pin-tags-rename-input" value="${esc(current)}">
                </div>
            </form>`;
        return foundry.applications.api.DialogV2.wait({
            window: { title: 'Rename Pin Tag Globally' },
            content,
            rejectClose: false,
            buttons: [
                { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark', callback: () => '' },
                {
                    action: 'rename',
                    label: 'Rename',
                    icon: 'fa-solid fa-check',
                    default: true,
                    callback: (_event, _button, dialog) => {
                        const root = dialog.form || dialog.element;
                        return normalizePinTags(root?.querySelector('.blacksmith-custom-pin-tags-rename-input')?.value || '')[0] || '';
                    }
                }
            ]
        });
    }

    async _renameTag(target) {
        const tag = target?.dataset?.tag || '';
        if (!tag) return;
        const next = await this._promptRenameTag(tag);
        if (!next || next === tag) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Rename Pin Tag Globally' },
            content: `<p>Rename <strong>${esc(tag)}</strong> to <strong>${esc(next)}</strong> on all pins and saved tag records?</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        await PinManager.renameTagGlobally(tag, next);
        await this.render(true);
        await _pinLayersWindowRef?.render(true);
    }

    async _stripTagFromCurrentScene(target) {
        const tag = target?.dataset?.tag || '';
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        if (!tag || !sceneId) return;
        const scene = game.scenes?.get(sceneId);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Strip Tag From Current Scene' },
            content: `<p>Remove <strong>${esc(tag)}</strong> from all pins on <strong>${esc(scene?.name || 'this scene')}</strong>?</p><p>The tag remains available globally.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        const key = normalizePinTags(tag)[0];
        const count = await PinManager.stripTagFromScene(key, sceneId);
        ui.notifications?.info(`Stripped "${key}" from ${count} pin${count !== 1 ? 's' : ''} on ${scene?.name || 'this scene'}.`);
        await this.render(true);
        await _pinLayersWindowRef?.render(true);
    }

    async _stripTagFromAllScenes(target) {
        const tag = target?.dataset?.tag || '';
        if (!tag) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Strip Tag From All Scenes' },
            content: `<p>Remove <strong>${esc(tag)}</strong> from all pins on all scenes?</p><p>The tag remains available globally.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        const key = normalizePinTags(tag)[0];
        const count = await PinManager.stripTagFromAllScenes(key);
        ui.notifications?.info(`Stripped "${key}" from ${count} pin${count !== 1 ? 's' : ''} across all scenes.`);
        await this.render(true);
        await _pinLayersWindowRef?.render(true);
    }

    async _deleteTagGlobally(target) {
        const tag = target?.dataset?.tag || '';
        if (!tag) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Pin Tag Globally' },
            content: `<p>Delete <strong>${esc(tag)}</strong> from the tag registry and all pins on all scenes?</p><p>This cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
        await PinManager.deleteTagGlobally(tag);
        await this.render(true);
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
            window: { title: 'Manage Pins', resizable: true, minimizable: true },
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
        openCustomPinTags: () => _pinLayersWindowRef?._openCustomPinTags(),
        toggleTypeTag:           (_event, target) => _pinLayersWindowRef?._toggleTypeTag(target),
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
        const { lastProfile, lastTab, layersHideUnused, ...positionBounds } = bounds;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, PinLayersWindow.DEFAULT_OPTIONS.position ?? {}),
            positionBounds
        );
        super(opts);
        this.sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
        this.activeTab = lastTab || 'layers';
        this.browseQuery = '';
        this.browseIncludeHidden = false;
        const activeProfileName = PinManager.getActiveFilterProfileName();
        this._selectedProfileValue = activeProfileName || (lastProfile ?? '');
        this._browseDebounce = null;
        this._restoreBrowseFocus = false;
        this._browseSelectMode = false;
        this._selectedBrowsePinIds = new Set();
        this._lastBrowsePinIds = [];
        this._lastBrowsePinsById = new Map();
        this.layersHideUnused = !!layersHideUnused;
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
            if (this._browseDebounce) {
                clearTimeout(this._browseDebounce);
                this._browseDebounce = null;
            }
            const pos = this.position ?? {};
            await game.settings.set(MODULE.ID, 'pinLayersWindowBounds', {
                left: pos.left,
                top: pos.top,
                width: pos.width,
                height: pos.height,
                lastProfile: this._selectedProfileValue ?? '',
                lastTab: this.activeTab ?? 'layers',
                layersHideUnused: !!this.layersHideUnused
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
        if (activeProfileName && activeProfileName !== this._selectedProfileValue) {
            this._selectedProfileValue = activeProfileName;
        }
        const profileNames = new Set(profiles.map(entry => entry.name));
        const systemProfiles = new Set([SYSTEM_PROFILE_ALL, SYSTEM_PROFILE_NONE]);
        const isSelectedSystemProfile = systemProfiles.has(this._selectedProfileValue);
        const selectedProfile = isSelectedSystemProfile || profileNames.has(this._selectedProfileValue) ? this._selectedProfileValue : '';
        if (selectedProfile !== this._selectedProfileValue) this._selectedProfileValue = selectedProfile;
        const hasSelectedProfile = selectedProfile !== '';
        const isSystemProfile = systemProfiles.has(selectedProfile);
        const hasSavedProfile = hasSelectedProfile && !isSystemProfile;
        const profileMatchesCurrent = isSystemProfile
            ? this._visibilityStateMatchesState(this._getSystemProfileState(selectedProfile))
            : (hasSavedProfile && PinManager.visibilityStateMatchesProfile(selectedProfile));
        const profileStatus = hasSelectedProfile
            ? (profileMatchesCurrent ? 'Active' : 'Unsaved Changes')
            : 'Custom';
        const profileOptions = [
            !hasSelectedProfile ? '<option value="" selected hidden>Custom / Current View</option>' : '',
            `<option value="${PROFILE_ACTION_NEW}">+ New Profile</option>`,
            `<optgroup label="System">
                <option value="${SYSTEM_PROFILE_ALL}" ${selectedProfile === SYSTEM_PROFILE_ALL ? 'selected' : ''}>All Pins</option>
                <option value="${SYSTEM_PROFILE_NONE}" ${selectedProfile === SYSTEM_PROFILE_NONE ? 'selected' : ''}>No Pins</option>
            </optgroup>`,
            `<optgroup label="Custom">
                ${profiles.map((entry) =>
                    `<option value="${esc(entry.name)}" ${entry.name === selectedProfile ? 'selected' : ''}>${esc(entry.name)}</option>`).join('')}
                ${profiles.length ? '' : '<option value="" disabled>No custom profiles</option>'}
            </optgroup>`
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
                    <i class="fa-solid fa-layer-group"></i><span>Manage Pin Layers</span>
                </button>
                <button type="button" class="blacksmith-tab ${!isLayers ? 'is-active' : ''}" data-action="selectTab" data-value="browse">
                    <i class="fa-solid fa-magnifying-glass"></i><span>Manage Pin Tags</span>
                    <span class="blacksmith-pin-layers-tag-count">${allSummary.total}</span>
                </button>
            </nav>
        `;

        const bodyContent = isLayers
            ? this._buildLayersBody()
            : this._buildBrowseBody(browsePins, allSummary.total);
        const selectionMode = !isLayers && game.user?.isGM && this._browseSelectMode;
        const selectedCount = this._selectedBrowsePinIds.size;
        const visibleBrowseCount = browsePins.length;

        const profileBar = `
            <div class="blacksmith-pin-layers-profile-bar">
                <div class="blacksmith-pin-layers-profile-bar-main">
                    <select class="blacksmith-input blacksmith-pin-layers-profile-select">
                        ${profileOptions}
                    </select>
                    <span class="blacksmith-pin-layers-profile-status ${profileMatchesCurrent ? 'is-active' : 'is-custom'}">${esc(profileStatus)}</span>
                    ${hasSavedProfile && !profileMatchesCurrent ? `
                        <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm"
                            data-action="updateProfile" data-tooltip="Overwrite this profile with the current hidden pins, categories, and tags">
                            <i class="fa-solid fa-rotate"></i> Update
                        </button>` : ''}
                    ${hasSavedProfile ? `
                        <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-icon blacksmith-pin-layers-btn-sm"
                            data-action="deleteProfile" data-tooltip="Delete this saved profile" aria-label="Delete profile">
                            <i class="fa-solid fa-trash"></i>
                        </button>` : ''}
                </div>
                <div class="blacksmith-pin-layers-profile-bar-side">
                    <div class="blacksmith-toggle-row blacksmith-pin-layers-hide-unused-row">
                        <span class="blacksmith-toggle-label" data-tooltip="Hide tag chips with no pins on this scene. Taxonomy groups always stay visible.">Hide unused</span>
                        <label class="blacksmith-toggle">
                            <input type="checkbox" class="blacksmith-toggle-input blacksmith-pin-layers-hide-unused" ${this.layersHideUnused ? 'checked' : ''}>
                            <span class="blacksmith-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: true,
            showTools: true,
            showActionBar: true,
            toolsContent: `
                <div class="blacksmith-pin-layers-tools-stack">
                    <div class="blacksmith-pin-layers-tools-row blacksmith-pin-layers-tabs-row">
                        ${tabNav}
                    </div>
                    <div class="blacksmith-pin-layers-tools-row">
                        ${isLayers ? profileBar : `
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
                </div>`}
                    </div>
                </div>
            `,
            headerIcon: 'fa-solid fa-layer-group',
            windowTitle: scene?.name || 'No active scene',
            subtitle: 'Scene Pins',
            headerRight: `
                <div class="blacksmith-pin-layers-summary">
                    <span class="blacksmith-pin-layers-summary-profile">${activeProfileName ? esc(getProfileDisplayName(activeProfileName)) : 'Custom'}</span>
                    <span class="blacksmith-pin-layers-summary-stat"><i class="${PIN_VISIBILITY_ICONS.visible}"></i> ${visibleSummary.total}</span>
                    <span class="blacksmith-pin-layers-summary-stat">${allSummary.total} total</span>
                </div>
            `,
            bodyContent,
            actionBarLeft: selectionMode ? `
                <span class="blacksmith-pin-layers-bulk-count">${selectedCount} selected</span>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="selectVisibleBrowsePins" ${visibleBrowseCount ? '' : 'disabled'}>
                    <i class="fa-solid fa-list-check"></i> Select Visible
                </button>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="clearBrowseSelection" ${selectedCount ? '' : 'disabled'}>
                    <i class="fa-solid fa-eraser"></i> Clear
                </button>
            ` : `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="refresh">
                    <i class="fa-solid fa-rotate"></i> Refresh
                </button>
                ${game.user?.isGM ? `<button type="button" class="blacksmith-window-btn-secondary" data-action="openCustomPinTags" title="Manage custom pin tags globally and for this scene">
                    <i class="fa-solid fa-tags"></i> Manage Custom Pin Tags
                </button>` : ''}
                ${game.user?.isGM ? `<button type="button" class="blacksmith-window-btn-critical" data-action="deleteAllPins" title="Delete all pins on this scene">
                    <i class="fa-solid fa-trash"></i> Delete All
                </button>` : ''}
            `,
            actionBarRight: selectionMode ? `
                <button type="button" class="blacksmith-window-btn-primary" data-action="bulkEditSelectedTags" ${selectedCount ? '' : 'disabled'}>
                    <i class="fa-solid fa-tags"></i> Bulk Edit Tags
                </button>
            ` : `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="hideAll">
                    <i class="${PIN_VISIBILITY_ICONS.hidden}"></i> Hide All
                </button>
                <button type="button" class="blacksmith-window-btn-primary" data-action="showAll">
                    <i class="${PIN_VISIBILITY_ICONS.visible}"></i> Show All
                </button>
            `
        };
    }

    _buildLayersBody() {
        // Build scene pin counts per type and per (type, tag)
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        const scenePins = sceneId ? (PinManager.list({ sceneId, includeHiddenByFilter: true }) || []) : [];
        const typeTagCounts = new Map();   // 'moduleId|type|tag' → count
        const typeCounts = new Map();      // 'moduleId|type' → count
        for (const p of scenePins) {
            const typeKey = `${p.moduleId}|${PinManager.getVisibilityPinType(p.moduleId, p.type)}`;
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

        const chipVisible = (count) =>
            !this.layersHideUnused || (count ?? 0) > 0;

        // GLOBAL group — predefined global tags + global custom registry tags
        if (globalTags.length || orphanRegistryTags.length) {
            const globalSectionTags = [...new Set([...globalTags, ...orphanRegistryTags])];
            const hiddenCount = globalSectionTags.filter(tag => PinManager.isTagHidden(tag)).length;
            const hidden = hiddenCount === globalSectionTags.length;
            const partial = hiddenCount > 0 && !hidden;
            const predefinedChips = [...globalTags].sort()
                .filter(tag => chipVisible(globalTagSceneCounts.get(tag) ?? 0))
                .map(tag => {
                    const tagHidden = PinManager.isTagHidden(tag);
                    const count = globalTagSceneCounts.get(tag) ?? 0;
                    return this._buildTagChip({ tag, hidden: tagHidden, count, isGlobal: true });
                }).join('');
            const customChips = [...orphanRegistryTags].sort((a, b) => a.localeCompare(b))
                .filter(tag => chipVisible(globalTagSceneCounts.get(tag) ?? 0))
                .map(tag => {
                    const tagHidden = PinManager.isTagHidden(tag);
                    const count = globalTagSceneCounts.get(tag) ?? 0;
                    return this._buildTagChip({ tag, hidden: tagHidden, count, isGlobal: true });
                }).join('');
            sections.push(this._buildTaxonomyGroup({
                label: 'Global',
                predefinedChips,
                customChips,
                hidden,
                partial,
                toggleScope: 'global'
            }));
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
                    if (p.moduleId !== moduleId || PinManager.getVisibilityPinType(p.moduleId, p.type) !== PinManager.getVisibilityPinType(moduleId, type)) continue;
                    for (const tag of (p.tags || [])) {
                        if (!taxonomyTagSet.has(tag)) customTagCounts.set(tag, (customTagCounts.get(tag) || 0) + 1);
                    }
                }

                const sectionTags = new Set([...(entry.tags || []), ...customTagCounts.keys()]);
                const hiddenTagCount = [...sectionTags].filter(tag => PinManager.isTypeTagHidden(moduleId, type, tag)).length;
                const typeRowHidden = PinManager.isModuleTypeHidden(moduleId, type);
                const partial = !typeRowHidden && hiddenTagCount > 0;

                const predefinedChips = (entry.tags || [])
                    .filter(tag => chipVisible(typeTagCounts.get(`${typeKey}|${tag}`) ?? 0))
                    .map(tag => {
                        const count = typeTagCounts.get(`${typeKey}|${tag}`) ?? 0;
                        const tagHidden = PinManager.isTypeTagHidden(moduleId, type, tag);
                        return this._buildTagChip({ tag, count, hidden: tagHidden, isGlobal: false, moduleId, type });
                    }).join('');

                const customChips = [...customTagCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
                    .filter(([, count]) => chipVisible(count))
                    .map(([tag, count]) => {
                        const tagHidden = PinManager.isTypeTagHidden(moduleId, type, tag);
                        return this._buildTagChip({ tag, count, hidden: tagHidden, isGlobal: false, moduleId, type });
                    }).join('');

                sections.push(this._buildTaxonomyGroup({
                    label: entry.label || type,
                    count: typeCount,
                    predefinedChips,
                    customChips,
                    hidden: typeRowHidden,
                    partial,
                    toggleScope: 'type',
                    moduleId,
                    type
                }));
            }
        }

        return `<div class="blacksmith-pin-layers-root">
            <div class="blacksmith-pin-layers-section-header blacksmith-pin-layers-section-header-first">
                <i class="fa-solid fa-tags"></i><span>Taxonomy</span>
            </div>
            <div class="blacksmith-pin-layers-taxonomy-sections">
                ${sections.join('') || '<div class="blacksmith-pin-layers-empty">No taxonomy registered.</div>'}
            </div>
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
        const dashCloud = '<span class="blacksmith-pin-layers-empty-inline">—</span>';
        const hideUnusedHint = `<span class="blacksmith-pin-layers-hide-unused-empty">${esc('Unused tags hidden. Nothing to show.')}</span>`;
        let body;
        if (predefinedChips !== undefined || customChips !== undefined) {
            const predefined = predefinedChips || '';
            const custom = customChips || '';
            if (this.layersHideUnused && !predefined && !custom) {
                body = `<div class="blacksmith-pin-layers-tag-cloud blacksmith-pin-layers-hide-unused-group-hint">${hideUnusedHint}</div>`;
            } else {
                const emptySystem = this.layersHideUnused ? hideUnusedHint : dashCloud;
                const emptyCustom = this.layersHideUnused ? hideUnusedHint : dashCloud;
                body = `
                <div class="blacksmith-pin-layers-taxonomy-subgroup">
                    <div class="blacksmith-pin-layers-taxonomy-subgroup-label">System</div>
                    <div class="blacksmith-pin-layers-tag-cloud">
                        ${predefined || emptySystem}
                    </div>
                </div>
                <div class="blacksmith-pin-layers-taxonomy-subgroup">
                    <div class="blacksmith-pin-layers-taxonomy-subgroup-label">Custom</div>
                    <div class="blacksmith-pin-layers-tag-cloud">
                        ${custom || emptyCustom}
                    </div>
                </div>`;
            }
        } else {
            body = `<div class="blacksmith-pin-layers-tag-cloud">
                ${chips || (this.layersHideUnused ? hideUnusedHint : dashCloud)}
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
                    <i class="${hidden ? PIN_VISIBILITY_ICONS.hidden : (partial ? 'fa-solid fa-eye-low-vision' : PIN_VISIBILITY_ICONS.visible)}"></i>
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

    _buildTagChip({ tag, count, hidden, isGlobal, moduleId, type }) {
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
            const visIconClass = PIN_VISIBILITY_ICONS[visState] || PIN_VISIBILITY_ICONS.visible;
            const visTitle = visState === 'hidden'
                ? 'Visibility: Hidden — click for Owner'
                : (visState === 'owner' ? 'Visibility: Owner — click for Visible' : 'Visibility: Visible — click for Hidden');
            const accessMode = browsePinAccessMode(p);
            const accessIconClass = PIN_ACCESS_ICONS[accessMode] || PIN_ACCESS_ICONS.read;
            const accessTitle = esc(BROWSE_ACCESS_TOOLTIP[accessMode] || BROWSE_ACCESS_TOOLTIP.read);
            const gmActions = isGM ? `
                <span class="blacksmith-pin-layers-access-chip" title="${accessTitle}"><i class="${accessIconClass}"></i></span>
                <button type="button" class="blacksmith-icon-action ${visState === 'hidden' ? '' : 'is-active'}"
                    data-action="setBrowsePinVisibility" data-pin-id="${esc(p.id)}" data-vis-state="${esc(visState)}" title="${visTitle}">
                    <i class="${visIconClass}"></i>
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
            </div>
            <div class="blacksmith-pin-layers-list">
                ${pinRows || '<div class="blacksmith-pin-layers-empty">No pins matched.</div>'}
            </div>
        </div>`;
    }

    _isPinHiddenByFilter(p) {
        return PinManager._isHiddenByFilter(p);
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
                    <i class="${hidden ? PIN_VISIBILITY_ICONS.hidden : PIN_VISIBILITY_ICONS.visible}"></i>
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
                    <i class="${hidden ? PIN_VISIBILITY_ICONS.hidden : PIN_VISIBILITY_ICONS.visible}"></i>
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
                void this._selectProfile(e.target.value);
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

        root?.querySelector('.blacksmith-pin-layers-hide-unused')
            ?.addEventListener('change', (e) => {
                this.layersHideUnused = !!e.target.checked;
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
        this._selectedProfileValue = SYSTEM_PROFILE_NONE;
        await this._persistLastProfile();
        await this._applySystemProfile(SYSTEM_PROFILE_NONE);
        await this.render(true);
    }

    async _showAll() {
        this._selectedProfileValue = SYSTEM_PROFILE_ALL;
        await this._persistLastProfile();
        await this._applySystemProfile(SYSTEM_PROFILE_ALL);
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

    async _selectProfile(name) {
        if (name === PROFILE_ACTION_NEW) {
            await this._saveProfile();
            await this.render(true);
            return;
        }
        this._selectedProfileValue = name || '';
        await this._persistLastProfile();
        if (!this._selectedProfileValue) {
            await PinManager.applyVisibilityProfileState(PinManager.getVisibilityProfileState(), { activeProfileName: '' });
            await this.render(true);
            return;
        }
        if (this._isSystemProfile(this._selectedProfileValue)) {
            await this._applySystemProfile(this._selectedProfileValue);
            ui.notifications?.info(`Loaded pin profile: ${getProfileDisplayName(this._selectedProfileValue)}`);
            await this.render(true);
            return;
        }
        try {
            await PinManager.applyVisibilityProfile(this._selectedProfileValue, { sceneId: this.sceneId ?? canvas?.scene?.id });
            ui.notifications?.info(`Loaded pin profile: ${this._selectedProfileValue}`);
        } catch (err) {
            ui.notifications?.warn(err?.message || `Unable to load pin profile: ${this._selectedProfileValue}`);
            this._selectedProfileValue = '';
            await this._persistLastProfile();
        }
        await this.render(true);
    }

    _isSystemProfile(value) {
        return value === SYSTEM_PROFILE_ALL || value === SYSTEM_PROFILE_NONE;
    }

    _visibilityStateMatchesState(state) {
        if (!state) return false;
        const current = PinManager.getVisibilityProfileState();
        const stable = (obj) => JSON.stringify(Object.fromEntries(Object.entries(obj ?? {}).sort()));
        return current.hideAll === !!state.hideAll
            && stable(current.hiddenModules) === stable(state.hiddenModules)
            && stable(current.hiddenModuleTypes) === stable(state.hiddenModuleTypes)
            && stable(current.hiddenTags) === stable(state.hiddenTags)
            && stable(current.hiddenTypeTags) === stable(state.hiddenTypeTags);
    }

    _getSystemProfileState(value) {
        return PinManager.getSystemVisibilityProfileState(value, { sceneId: this.sceneId ?? canvas?.scene?.id });
    }

    async _applySystemProfile(value) {
        await PinManager.applySystemVisibilityProfile(value, { sceneId: this.sceneId ?? canvas?.scene?.id });
    }

    _isReservedProfileName(name) {
        const normalized = String(name || '').trim().toLowerCase();
        return normalized === 'all pins' || normalized === 'no pins';
    }

    async _promptProfileName(defaultName = '') {
        const content = `
            <form>
                <div class="blacksmith-field">
                    <span class="blacksmith-field-label">Profile name</span>
                    <input type="text" class="blacksmith-input blacksmith-pin-layers-profile-name" value="${esc(defaultName)}" placeholder="Custom profile name">
                </div>
            </form>`;
        return foundry.applications.api.DialogV2.wait({
            window: { title: 'New Pin Visibility Profile' },
            content,
            rejectClose: false,
            buttons: [
                { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark', callback: () => '' },
                {
                    action: 'save',
                    label: 'Save',
                    icon: 'fa-solid fa-floppy-disk',
                    default: true,
                    callback: (_event, _button, dialog) => {
                        const root = dialog.form || dialog.element;
                        return root?.querySelector('.blacksmith-pin-layers-profile-name')?.value?.trim() || '';
                    }
                }
            ]
        });
    }

    async _saveProfile() {
        const name = await this._promptProfileName();
        if (!name) return;
        if (this._isReservedProfileName(name)) {
            ui.notifications?.warn('All Pins and No Pins are built-in profiles and cannot be overwritten.');
            return;
        }
        const existing = PinManager.getVisibilityProfile(name);
        if (existing) {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: 'Overwrite Pin Profile' },
                content: `<p>A pin visibility profile named <strong>${esc(name)}</strong> already exists.</p><p>Overwrite it with the current layer visibility?</p>`,
                rejectClose: false,
                modal: true,
                yes: { default: false },
                no: { default: true }
            });
            if (!confirmed) return;
        }
        await PinManager.saveVisibilityProfile(name);
        this._selectedProfileValue = name;
        await this._persistLastProfile();
        ui.notifications?.info(`Saved pin profile: ${name}`);
        await this.render(true);
    }

    async _updateProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('No profile selected to update.'); return; }
        if (this._isSystemProfile(name)) { ui.notifications?.warn('Built-in profiles cannot be updated.'); return; }
        await PinManager.saveVisibilityProfile(name);
        await this._persistLastProfile();
        ui.notifications?.info(`Updated pin profile: ${name}`);
        await this.render(true);
    }

    async _deleteProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('Choose a saved profile to delete.'); return; }
        if (this._isSystemProfile(name)) { ui.notifications?.warn('Built-in profiles cannot be deleted.'); return; }
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Pin Profile' },
            content: `<p>Delete saved pin visibility profile <strong>${esc(name)}</strong>?</p><p>The current layer visibility will not be changed.</p>`,
            rejectClose: false,
            modal: true,
            yes: { default: false },
            no: { default: true }
        });
        if (!confirmed) return;
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
        const currentlyHidden = PinManager.isModuleTypeHidden(moduleId, type);
        const taxonomyTags = PinManager.getPinTaxonomy(moduleId, type)?.tags || [];
        const hasHiddenTypeTags = taxonomyTags.some(tag => PinManager.isTypeTagHidden(moduleId, type, tag));
        if (currentlyHidden || hasHiddenTypeTags) {
            if (PinManager.isGlobalHidden()) await PinManager.setGlobalHidden(false);
            if (taxonomyTags.length) await PinManager.setTypeTagsHidden(moduleId, type, taxonomyTags, false);
            await PinManager.setModuleTypeHidden(moduleId, type, false);
        } else {
            await PinManager.setModuleTypeHidden(moduleId, type, true);
        }
        await this.render(true);
    }

    async _toggleTag(target) {
        const tag = target?.dataset?.tag || '';
        if (!tag) return;
        const currentlyHidden = PinManager.isTagHidden(tag);
        if (currentlyHidden) {
            if (PinManager.isGlobalHidden()) await PinManager.setGlobalHidden(false);
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
            const currentlyHidden = PinManager.isModuleTypeHidden(moduleId, type);
            const taxonomyTags = PinManager.getPinTaxonomy(moduleId, type)?.tags || [];
            const hasHiddenTypeTags = taxonomyTags.some(tag => PinManager.isTypeTagHidden(moduleId, type, tag));
            if (currentlyHidden || hasHiddenTypeTags) {
                if (PinManager.isGlobalHidden()) await PinManager.setGlobalHidden(false);
                if (taxonomyTags.length) await PinManager.setTypeTagsHidden(moduleId, type, taxonomyTags, false);
                await PinManager.setModuleTypeHidden(moduleId, type, false);
            } else {
                await PinManager.setModuleTypeHidden(moduleId, type, true);
            }
            await this.render(true);
            return;
        }

        await PinManager.ensureBuiltinTaxonomyLoaded();
        const tags = scope === 'global'
            ? [...new Set([...PinManager.getGlobalTaxonomyTags(), ...this._getOrphanRegistryTags()])]
            : (scope === 'custom' ? this._getOrphanRegistryTags() : []);
        if (!tags.length) return;
        const nextHidden = !tags.every(tag => PinManager.isTagHidden(tag));
        if (!nextHidden && PinManager.isGlobalHidden()) await PinManager.setGlobalHidden(false);
        for (const tag of tags) {
            await PinManager.setTagHidden(tag, nextHidden);
        }
        await this.render(true);
    }

    async _openCustomPinTags() {
        if (!game.user?.isGM) return;
        await ManageCustomPinTagsWindow.open({ sceneId: this.sceneId ?? canvas?.scene?.id });
    }

    async _toggleTypeTag(target) {
        const tag = target?.dataset?.tag || '';
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!tag || !moduleId) return;
        const currentlyHidden = PinManager.isTypeTagHidden(moduleId, type, tag);
        if (currentlyHidden) {
            if (PinManager.isGlobalHidden()) await PinManager.setGlobalHidden(false);
            if (PinManager.isModuleTypeHidden(moduleId, type)) await PinManager.setModuleTypeHidden(moduleId, type, false);
        }
        await PinManager.setTypeTagHidden(moduleId, type, tag, !currentlyHidden);
        await this.render(true);
    }

}

HookManager.registerHook({
    name: 'ready',
    description: 'Manage Pins: Register Application V2 window API',
    context: 'manage-pins-window-registration',
    priority: 3,
    options: { once: true },
    callback: () => {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.registerWindow) return;
        api.registerWindow('blacksmith-pin-layers', {
            open: (options = {}) => PinLayersWindow.open(options),
            title: 'Manage Pins',
            moduleId: MODULE.ID
        });
    }
});

HookManager.registerHook({
    name: 'canvasReady',
    description: 'Manage Pins: Refresh scene-derived system profile state after scene load',
    context: 'manage-pins-profile-sync',
    priority: 3,
    callback: async () => {
        try {
            const profileName = PinManager.getActiveFilterProfileName();
            if (!PinManager.isSystemVisibilityProfileName(profileName)) return;
            await PinManager.applySystemVisibilityProfile(profileName, { sceneId: canvas?.scene?.id });
        } catch (_err) {}
    }
});
