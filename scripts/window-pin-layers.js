import { MODULE } from './const.js';
import { PinManager } from './manager-pins.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';

const APP_ID = 'blacksmith-pin-layers';
let _pinLayersWindowRef = null;

function esc(value) {
    return foundry.utils.escapeHTML(String(value ?? ''));
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
        refresh: () => _pinLayersWindowRef?._refresh(),
        hideAll: () => _pinLayersWindowRef?._hideAll(),
        showAll: () => _pinLayersWindowRef?._showAll(),
        saveProfile: () => _pinLayersWindowRef?._saveProfile(),
        applyProfile: () => _pinLayersWindowRef?._applyProfile(),
        updateProfile: () => _pinLayersWindowRef?._updateProfile(),
        deleteProfile: () => _pinLayersWindowRef?._deleteProfile(),
        clearSearch: () => { if (_pinLayersWindowRef) { _pinLayersWindowRef.searchQuery = ''; _pinLayersWindowRef.render(true); } },
        panToPin: (_event, target) => _pinLayersWindowRef?._panToPin(target),
        toggleType: (_event, target) => _pinLayersWindowRef?._toggleType(target),
        toggleGroup: (_event, target) => _pinLayersWindowRef?._toggleGroup(target),
        toggleTag: (_event, target) => _pinLayersWindowRef?._toggleTag(target),
        deleteGroup: (_event, target) => _pinLayersWindowRef?._deleteGroup(target)
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        const bounds = game.settings.get(MODULE.ID, 'pinLayersWindowBounds') || {};
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, PinLayersWindow.DEFAULT_OPTIONS.position ?? {}),
            bounds
        );
        super(opts);
        this.sceneId = options.sceneId ?? canvas?.scene?.id ?? null;
        this.searchQuery = options.searchQuery ?? '';
        this.includeHiddenSearch = options.includeHiddenSearch === true;
        this._selectedProfileValue = null; // null = uninitialized; '' = New Profile; name = saved profile
        this._searchDebounce = null;
        this._restoreSearchFocus = false;
    }

    static async open(options = {}) {
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
                height: pos.height
            });
        } catch (_err) {
            // Non-fatal UI preference write.
        }
        if (_pinLayersWindowRef === this) _pinLayersWindowRef = null;
        return super.close(options);
    }

    async getData() {
        await PinManager.ensureBuiltinTaxonomyLoaded();
        const scene = this.sceneId ? game.scenes?.get(this.sceneId) : canvas?.scene;
        const sceneId = scene?.id ?? canvas?.scene?.id ?? null;
        const allSummary = sceneId
            ? PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: true })
            : { total: 0, types: [], groups: [], tags: [] };
        const visibleSummary = sceneId
            ? PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: false })
            : { total: 0, types: [], groups: [], tags: [] };
        const profiles = PinManager.listVisibilityProfiles();
        const activeProfileName = PinManager.getActiveFilterProfileName();
        // Initialize selected profile to the active one on first render
        if (this._selectedProfileValue === null) {
            this._selectedProfileValue = activeProfileName || '';
        }
        const selectedProfile = this._selectedProfileValue;
        const isNewProfile = selectedProfile === '';
        const searchResults = sceneId
            ? PinManager.getScenePinSearchResults(sceneId, {
                query: this.searchQuery,
                includeHiddenByFilter: this.includeHiddenSearch,
                limit: 30
            })
            : [];

        const profileOptions = [
            `<option value="" ${isNewProfile ? 'selected' : ''}>New Profile</option>`,
            ...profiles.map((entry) =>
                `<option value="${esc(entry.name)}" ${entry.name === selectedProfile ? 'selected' : ''}>${esc(entry.name)}</option>`)
        ].join('');

        const typeRows = allSummary.types.map((entry) => {
            const [moduleId, type] = String(entry.key || '').split('|');
            const hidden = PinManager.isModuleTypeHidden(moduleId, type);
            const friendlyName = PinManager.getPinTypeLabel(moduleId, type);
            const moduleTitle = game.modules.get(moduleId)?.title ?? moduleId;
            const label = friendlyName || `${moduleTitle} - ${type || 'default'}`;
            return this._buildToggleRow({ action: 'toggleType', keyLabel: label, count: entry.count, hidden, attrs: { 'data-module-id': moduleId, 'data-type': type || 'default' } });
        }).join('');

        const groupRows = allSummary.groups.map((entry) => this._buildGroupRow(entry)).join('');

        const tagRows = allSummary.tags.map((entry) => this._buildToggleRow({
            action: 'toggleTag', keyLabel: entry.key, count: entry.count, hidden: PinManager.isTagHidden(entry.key), attrs: { 'data-tag': entry.key }
        })).join('');

        const searchResultRows = searchResults.map((entry) => `
            <div class="blacksmith-pin-layers-row ${entry.hiddenByFilter ? 'is-hidden' : ''}">
                <div class="blacksmith-pin-layers-row-main">
                    <div class="blacksmith-pin-layers-row-label">${esc(entry.text)}</div>
                    <div class="blacksmith-pin-layers-row-submeta">
                        <span>${esc(entry.typeLabel || entry.type)}</span>
                        ${entry.group ? `<span>${esc(entry.group)}</span>` : ''}
                        ${entry.tags.length ? `<span>${esc(entry.tags.join(', '))}</span>` : ''}
                        ${entry.hiddenByFilter ? `<span class="blacksmith-pin-layers-filtered-tag">filtered</span>` : ''}
                    </div>
                </div>
                <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-pan-btn" data-action="panToPin" data-pin-id="${esc(entry.id)}">
                    <i class="fa-solid fa-location-crosshairs"></i> Pan
                </button>
            </div>
        `).join('');

        const bodyContent = this.searchQuery
            ? `<div class="blacksmith-pin-layers-root">
                <div class="blacksmith-pin-layers-section-header blacksmith-pin-layers-section-header-first">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <span>Search Results</span>
                    <span class="blacksmith-badge">${searchResults.length}</span>
                </div>
                <div class="blacksmith-pin-layers-list">
                    ${searchResultRows || '<div class="blacksmith-pin-layers-empty">No pins matched.</div>'}
                </div>
               </div>`
            : `<div class="blacksmith-pin-layers-root">
                <div class="blacksmith-pin-layers-section-header blacksmith-pin-layers-section-header-first">
                    <i class="fa-solid fa-tag"></i>
                    <span>Types</span>
                    <span class="blacksmith-badge">${allSummary.types.length}</span>
                </div>
                <div class="blacksmith-pin-layers-list">
                    ${typeRows || '<div class="blacksmith-pin-layers-empty">No pin types on this scene.</div>'}
                </div>
                <div class="blacksmith-pin-layers-section-header">
                    <i class="fa-solid fa-layer-group"></i>
                    <span>Groups</span>
                    <span class="blacksmith-badge">${allSummary.groups.length}</span>
                </div>
                <div class="blacksmith-pin-layers-list">
                    ${groupRows || '<div class="blacksmith-pin-layers-empty">No groups assigned yet.</div>'}
                </div>
                <div class="blacksmith-pin-layers-section-header">
                    <i class="fa-solid fa-tags"></i>
                    <span>Tags</span>
                    <span class="blacksmith-badge">${allSummary.tags.length}</span>
                </div>
                <div class="blacksmith-pin-layers-list">
                    ${tagRows || '<div class="blacksmith-pin-layers-empty">No tags assigned yet.</div>'}
                </div>
               </div>`;

        return {
            appId: this.id,
            showOptionBar: true,
            showHeader: true,
            showTools: true,
            showActionBar: true,
            optionBarLeft: `
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
                        <button type="button" class="blacksmith-window-btn-secondary blacksmith-pin-layers-btn-sm" data-action="updateProfile" title="Save current filters over this profile">
                            <i class="fa-solid fa-floppy-disk"></i> Update
                        </button>
                        <button type="button" class="blacksmith-window-btn-critical blacksmith-pin-layers-btn-icon blacksmith-pin-layers-btn-sm" data-action="deleteProfile" title="Delete this profile">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    `}
                </div>
            `,
            toolsContent: `
                <div class="blacksmith-pin-layers-search-bar">
                    <div class="blacksmith-pin-layers-search-wrap">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" class="blacksmith-input blacksmith-pin-layers-search-query" value="${esc(this.searchQuery)}" placeholder="Search pins by name, type, group, or tag...">
                        ${this.searchQuery ? `<button type="button" class="blacksmith-pin-layers-search-clear" data-action="clearSearch" title="Clear search"><i class="fa-solid fa-xmark"></i></button>` : ''}
                    </div>
                    <div class="blacksmith-toggle-row">
                        <span class="blacksmith-toggle-label">Hidden</span>
                        <label class="blacksmith-toggle">
                            <input type="checkbox" class="blacksmith-toggle-input blacksmith-pin-layers-search-hidden" ${this.includeHiddenSearch ? 'checked' : ''}>
                            <span class="blacksmith-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            `,
            headerIcon: 'fa-solid fa-layer-group',
            windowTitle: 'Pin Layers',
            subtitle: scene?.name ? `Scene: ${scene.name}` : 'No active scene',
            headerRight: `
                <div class="blacksmith-pin-layers-summary">
                    ${activeProfileName ? `<span class="blacksmith-badge blacksmith-badge-accent"><i class="fa-solid fa-layer-group"></i> ${esc(activeProfileName)}</span>` : `<span class="blacksmith-badge">Custom</span>`}
                    <span class="blacksmith-badge blacksmith-badge-success"><i class="fa-solid fa-eye"></i> ${visibleSummary.total}</span>
                    <span class="blacksmith-badge">${allSummary.total} total</span>
                </div>
            `,
            bodyContent,
            actionBarLeft: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="refresh">
                    <i class="fa-solid fa-rotate"></i> Refresh
                </button>
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

    _buildToggleRow({ action, keyLabel, count, hidden, attrs = {} }) {
        const attrString = Object.entries(attrs)
            .map(([key, value]) => `${key}="${esc(value)}"`)
            .join(' ');
        return `
            <div class="blacksmith-pin-layers-row ${hidden ? 'is-hidden' : ''}">
                <div class="blacksmith-pin-layers-row-main">
                    <div class="blacksmith-pin-layers-row-label">${esc(keyLabel)}</div>
                    <span class="blacksmith-badge">${count}</span>
                </div>
                <button
                    type="button"
                    class="blacksmith-pin-layers-eye ${hidden ? 'is-hidden' : ''}"
                    data-action="${action}"
                    title="${hidden ? 'Show' : 'Hide'}"
                    ${attrString}>
                    <i class="fa-solid ${hidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
            </div>
        `;
    }

    _buildGroupRow(entry) {
        const hidden = PinManager.isGroupHidden(entry.key);
        const attr = `data-group="${esc(entry.key)}"`;
        return `
            <div class="blacksmith-pin-layers-row ${hidden ? 'is-hidden' : ''}">
                <div class="blacksmith-pin-layers-row-main">
                    <div class="blacksmith-pin-layers-row-label">${esc(entry.key)}</div>
                    <span class="blacksmith-badge">${entry.count}</span>
                </div>
                <button type="button" class="blacksmith-pin-layers-eye ${hidden ? 'is-hidden' : ''}"
                    data-action="toggleGroup" title="${hidden ? 'Show' : 'Hide'}" ${attr}>
                    <i class="fa-solid ${hidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button type="button" class="blacksmith-pin-layers-eye blacksmith-pin-layers-eye-delete"
                    data-action="deleteGroup" title="Remove group from all pins" ${attr}>
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }

    // Called after every render in ApplicationV2 — the correct place to attach DOM listeners.
    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    // Kept for compatibility with any V1-style render paths.
    activateListeners(html) {
        super.activateListeners(html);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const root = this._getRoot();
        const select = root?.querySelector('.blacksmith-pin-layers-profile-select');
        const input = root?.querySelector('.blacksmith-pin-layers-profile-name');
        const searchInput = root?.querySelector('.blacksmith-pin-layers-search-query');
        const hiddenToggle = root?.querySelector('.blacksmith-pin-layers-search-hidden');

        select?.addEventListener('change', () => {
            this._selectedProfileValue = select.value;
            void this.render(true);
        });

        searchInput?.addEventListener('input', () => {
            const nextValue = searchInput.value || '';
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.searchQuery = nextValue;
                this._restoreSearchFocus = true;
                void this.render(true);
            }, 180);
        });

        hiddenToggle?.addEventListener('change', () => {
            this.includeHiddenSearch = !!hiddenToggle.checked;
            void this.render(true);
        });

        if (this._restoreSearchFocus && searchInput) {
            this._restoreSearchFocus = false;
            const cursor = searchInput.value.length;
            requestAnimationFrame(() => {
                searchInput.focus();
                try { searchInput.setSelectionRange(cursor, cursor); } catch (_err) {}
            });
        }
    }

    async _refresh() {
        await this.render(true);
    }

    async _hideAll() {
        await PinManager.setGlobalHidden(true);
        await this.render(true);
    }

    async _showAll() {
        await PinManager.setGlobalHidden(false);
        const summary = PinManager.getSceneFilterSummary(this.sceneId ?? canvas?.scene?.id, { includeHiddenByFilter: true });
        for (const entry of summary.types) {
            const [moduleId, type] = String(entry.key || '').split('|');
            await PinManager.setModuleTypeHidden(moduleId, type || 'default', false);
        }
        for (const entry of summary.groups) await PinManager.setGroupHidden(entry.key, false);
        for (const entry of summary.tags) await PinManager.setTagHidden(entry.key, false);
        await this.render(true);
    }

    _getPendingProfileName() {
        const root = this._getRoot();
        return root?.querySelector('.blacksmith-pin-layers-profile-name')?.value?.trim() || '';
    }

    async _saveProfile() {
        const name = this._getPendingProfileName();
        if (!name) { ui.notifications?.warn('Enter a profile name to save.'); return; }
        await PinManager.saveVisibilityProfile(name);
        this._selectedProfileValue = name;
        ui.notifications?.info(`Saved pin profile: ${name}`);
        await this.render(true);
    }

    async _applyProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('Choose a saved profile to apply.'); return; }
        await PinManager.applyVisibilityProfile(name);
        ui.notifications?.info(`Applied pin profile: ${name}`);
        await this.render(true);
    }

    async _updateProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('No profile selected to update.'); return; }
        await PinManager.saveVisibilityProfile(name);
        ui.notifications?.info(`Updated pin profile: ${name}`);
        await this.render(true);
    }

    async _deleteProfile() {
        const name = this._selectedProfileValue;
        if (!name) { ui.notifications?.warn('Choose a saved profile to delete.'); return; }
        const removed = await PinManager.deleteVisibilityProfile(name);
        if (!removed) { ui.notifications?.warn(`Profile not found: ${name}`); return; }
        this._selectedProfileValue = '';
        ui.notifications?.info(`Deleted pin profile: ${name}`);
        await this.render(true);
    }

    async _deleteGroup(target) {
        const group = target?.dataset?.group || '';
        if (!group) return;
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        if (!sceneId) return;
        const pins = (PinManager.list({ sceneId, includeHiddenByFilter: true }) || [])
            .filter(p => (p.group || '').toLowerCase().trim() === group.toLowerCase().trim());
        for (const pin of pins) {
            await PinManager.update(pin.id, { group: '' });
        }
        await PinManager.setGroupHidden(group, false);
        ui.notifications?.info(`Removed group "${group}" from ${pins.length} pin${pins.length !== 1 ? 's' : ''}.`);
        await this.render(true);
    }

    async _panToPin(target) {
        const pinId = target?.dataset?.pinId || '';
        if (!pinId) return;
        const api = game.modules.get(MODULE.ID)?.api?.pins;
        await api?.panTo?.(pinId, { sceneId: this.sceneId, ping: true });
    }

    async _toggleType(target) {
        const moduleId = target?.dataset?.moduleId || '';
        const type = target?.dataset?.type || 'default';
        if (!moduleId) return;
        const visible = !PinManager.isModuleTypeHidden(moduleId, type);
        await PinManager.setModuleTypeHidden(moduleId, type, visible);
        await this.render(true);
    }

    async _toggleGroup(target) {
        const group = target?.dataset?.group || '';
        if (!group) return;
        const visible = !PinManager.isGroupHidden(group);
        await PinManager.setGroupHidden(group, visible);
        await this.render(true);
    }

    async _toggleTag(target) {
        const tag = target?.dataset?.tag || '';
        if (!tag) return;
        const visible = !PinManager.isTagHidden(tag);
        await PinManager.setTagHidden(tag, visible);
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
