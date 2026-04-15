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
        closeLayers: () => _pinLayersWindowRef?.close(),
        hideAll: () => _pinLayersWindowRef?._hideAll(),
        showAll: () => _pinLayersWindowRef?._showAll(),
        saveProfile: () => _pinLayersWindowRef?._saveProfile(),
        applyProfile: () => _pinLayersWindowRef?._applyProfile(),
        deleteProfile: () => _pinLayersWindowRef?._deleteProfile(),
        clearProfile: () => _pinLayersWindowRef?._clearActiveProfile(),
        panToPin: (_event, target) => _pinLayersWindowRef?._panToPin(target),
        toggleType: (_event, target) => _pinLayersWindowRef?._toggleType(target),
        toggleGroup: (_event, target) => _pinLayersWindowRef?._toggleGroup(target),
        toggleTag: (_event, target) => _pinLayersWindowRef?._toggleTag(target)
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
        const allSummary = sceneId ? PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: true }) : { total: 0, types: [], groups: [], tags: [] };
        const visibleSummary = sceneId ? PinManager.getSceneFilterSummary(sceneId, { includeHiddenByFilter: false }) : { total: 0, types: [], groups: [], tags: [] };
        const profiles = PinManager.listVisibilityProfiles();
        const activeProfileName = PinManager.getActiveFilterProfileName();
        const searchResults = sceneId
            ? PinManager.getScenePinSearchResults(sceneId, {
                query: this.searchQuery,
                includeHiddenByFilter: this.includeHiddenSearch,
                limit: 30
            })
            : [];
        const profileOptions = profiles.map((entry) => `
            <option value="${esc(entry.name)}" ${entry.name === activeProfileName ? 'selected' : ''}>${esc(entry.name)}</option>
        `).join('');
        const searchRows = searchResults.map((entry) => `
            <div class="blacksmith-pin-layers-search-row ${entry.hiddenByFilter ? 'is-hidden' : ''}">
                <div class="blacksmith-pin-layers-search-main">
                    <div class="blacksmith-pin-layers-search-title">${esc(entry.text)}</div>
                    <div class="blacksmith-pin-layers-search-meta">
                        <span>${esc(entry.typeLabel || entry.type)}</span>
                        ${entry.group ? `<span>group:${esc(entry.group)}</span>` : ''}
                        ${entry.tags.length ? `<span>${esc(entry.tags.join(', '))}</span>` : ''}
                        ${entry.hiddenByFilter ? '<span>filtered</span>' : ''}
                    </div>
                </div>
                <button type="button" class="blacksmith-window-template-btn-secondary" data-action="panToPin" data-pin-id="${esc(entry.id)}">
                    <i class="fa-solid fa-location-crosshairs"></i> Pan
                </button>
            </div>
        `).join('');

        const typeRows = allSummary.types.map((entry) => {
            const [moduleId, type] = String(entry.key || '').split('|');
            const hidden = PinManager.isModuleTypeHidden(moduleId, type);
            const friendlyName = PinManager.getPinTypeLabel(moduleId, type);
            const moduleTitle = game.modules.get(moduleId)?.title ?? moduleId;
            const label = friendlyName || `${moduleTitle} - ${type || 'default'}`;
            return this._buildToggleRow({
                action: 'toggleType',
                keyLabel: label,
                count: entry.count,
                hidden,
                attrs: {
                    'data-module-id': moduleId,
                    'data-type': type || 'default'
                }
            });
        }).join('');

        const groupRows = allSummary.groups.map((entry) => this._buildToggleRow({
            action: 'toggleGroup',
            keyLabel: entry.key,
            count: entry.count,
            hidden: PinManager.isGroupHidden(entry.key),
            attrs: { 'data-group': entry.key }
        })).join('');

        const tagRows = allSummary.tags.map((entry) => this._buildToggleRow({
            action: 'toggleTag',
            keyLabel: entry.key,
            count: entry.count,
            hidden: PinManager.isTagHidden(entry.key),
            attrs: { 'data-tag': entry.key }
        })).join('');

        return {
            appId: this.id,
            showOptionBar: true,
            showHeader: true,
            showTools: false,
            showActionBar: true,
            optionBarLeft: `
                <div class="blacksmith-pin-layers-profile-bar">
                    <select class="blacksmith-input blacksmith-pin-layers-profile-select">
                        <option value="">${profiles.length ? 'Choose profile' : 'No saved profiles'}</option>
                        ${profileOptions}
                    </select>
                    <input type="text" class="blacksmith-input blacksmith-pin-layers-profile-name" value="${esc(activeProfileName)}" placeholder="Profile name">
                    <button type="button" class="blacksmith-window-template-btn-secondary" data-action="saveProfile">
                        <i class="fa-solid fa-floppy-disk"></i> Save Profile
                    </button>
                    <button type="button" class="blacksmith-window-template-btn-secondary" data-action="applyProfile">
                        <i class="fa-solid fa-layer-group"></i> Apply
                    </button>
                    <button type="button" class="blacksmith-window-template-btn-secondary" data-action="deleteProfile">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </div>
            `,
            optionBarRight: `
                <button type="button" class="blacksmith-window-template-btn-secondary" data-action="hideAll">
                    <i class="fa-solid fa-eye-slash"></i> Hide All
                </button>
                <button type="button" class="blacksmith-window-template-btn-secondary" data-action="showAll">
                    <i class="fa-solid fa-eye"></i> Show All
                </button>
                <button type="button" class="blacksmith-window-template-btn-secondary" data-action="clearProfile">
                    <i class="fa-solid fa-ban"></i> Custom View
                </button>
                <button type="button" class="blacksmith-window-template-btn-secondary" data-action="refresh">
                    <i class="fa-solid fa-rotate"></i> Refresh
                </button>
            `,
            headerIcon: 'fa-solid fa-layer-group',
            windowTitle: 'Pin Layers',
            subtitle: scene?.name ? `Scene: ${scene.name}` : 'No active scene',
            headerRight: `
                <div class="blacksmith-pin-layers-summary">
                    <span>${activeProfileName ? `Profile: ${esc(activeProfileName)}` : 'Profile: Custom'}</span>
                    <span>Visible: ${visibleSummary.total}</span>
                    <span>Total: ${allSummary.total}</span>
                </div>
            `,
            bodyContent: `
                <div class="blacksmith-pin-layers-root">
                    <section class="blacksmith-pin-layers-section">
                        <h3>Pin Search</h3>
                        <div class="blacksmith-pin-layers-search">
                            <div class="blacksmith-pin-layers-search-controls">
                                <input type="text" class="blacksmith-input blacksmith-pin-layers-search-query" value="${esc(this.searchQuery)}" placeholder="Search pin text, type, group, or tags">
                                <label class="blacksmith-pin-layers-search-toggle">
                                    <input type="checkbox" class="blacksmith-pin-layers-search-hidden" ${this.includeHiddenSearch ? 'checked' : ''}>
                                    Include filtered pins
                                </label>
                            </div>
                            <div class="blacksmith-pin-layers-search-results">
                                ${this.searchQuery
                                    ? (searchRows || '<div class="blacksmith-pin-layers-empty">No pins matched the current search.</div>')
                                    : '<div class="blacksmith-pin-layers-empty">Search defaults to currently visible pins. Enable "Include filtered pins" to recover hidden matches intentionally.</div>'}
                            </div>
                        </div>
                    </section>
                    <section class="blacksmith-pin-layers-section">
                        <h3>Types</h3>
                        <div class="blacksmith-pin-layers-list">${typeRows || '<div class="blacksmith-pin-layers-empty">No pin types on this scene.</div>'}</div>
                    </section>
                    <section class="blacksmith-pin-layers-section">
                        <h3>Groups</h3>
                        <div class="blacksmith-pin-layers-list">${groupRows || '<div class="blacksmith-pin-layers-empty">No groups assigned yet.</div>'}</div>
                    </section>
                    <section class="blacksmith-pin-layers-section">
                        <h3>Tags</h3>
                        <div class="blacksmith-pin-layers-list">${tagRows || '<div class="blacksmith-pin-layers-empty">No tags assigned yet.</div>'}</div>
                    </section>
                </div>
            `,
            actionBarLeft: `<div class="blacksmith-pin-layers-hint">Groups and tags are filtered before pin DOM is created.</div>`,
            actionBarRight: `
                <button type="button" class="blacksmith-window-template-btn-secondary" data-action="closeLayers">
                    <i class="fa-solid fa-xmark"></i> Close
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
                    <div class="blacksmith-pin-layers-row-count">${count}</div>
                </div>
                <button
                    type="button"
                    class="blacksmith-window-template-btn-secondary blacksmith-pin-layers-toggle"
                    data-action="${action}"
                    ${attrString}>
                    <i class="fa-solid ${hidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                    ${hidden ? 'Show' : 'Hide'}
                </button>
            </div>
        `;
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

    _getProfileControls() {
        const root = this._getRoot();
        return {
            select: root?.querySelector?.('.blacksmith-pin-layers-profile-select') ?? null,
            input: root?.querySelector?.('.blacksmith-pin-layers-profile-name') ?? null
        };
    }

    _getPendingProfileName() {
        const { select, input } = this._getProfileControls();
        const inputName = input?.value?.trim?.() || '';
        const selectedName = select?.value?.trim?.() || '';
        return inputName || selectedName;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const root = html?.[0] || html;
        const select = root?.querySelector?.('.blacksmith-pin-layers-profile-select');
        const input = root?.querySelector?.('.blacksmith-pin-layers-profile-name');
        const searchInput = root?.querySelector?.('.blacksmith-pin-layers-search-query');
        const hiddenToggle = root?.querySelector?.('.blacksmith-pin-layers-search-hidden');
        select?.addEventListener('change', () => {
            if (input && select.value) input.value = select.value;
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
                try {
                    searchInput.setSelectionRange(cursor, cursor);
                } catch (_err) {
                    // Non-fatal for browsers that do not support selection here.
                }
            });
        }
    }

    async _saveProfile() {
        const name = this._getPendingProfileName();
        if (!name) {
            ui.notifications?.warn('Enter a profile name to save.');
            return;
        }
        await PinManager.saveVisibilityProfile(name);
        ui.notifications?.info(`Saved pin profile: ${name}`);
        await this.render(true);
    }

    async _applyProfile() {
        const { select } = this._getProfileControls();
        const name = select?.value?.trim?.() || this._getPendingProfileName();
        if (!name) {
            ui.notifications?.warn('Choose a saved profile to apply.');
            return;
        }
        await PinManager.applyVisibilityProfile(name);
        ui.notifications?.info(`Applied pin profile: ${name}`);
        await this.render(true);
    }

    async _deleteProfile() {
        const { select } = this._getProfileControls();
        const name = select?.value?.trim?.() || this._getPendingProfileName();
        if (!name) {
            ui.notifications?.warn('Choose a saved profile to delete.');
            return;
        }
        const removed = await PinManager.deleteVisibilityProfile(name);
        if (!removed) {
            ui.notifications?.warn(`Profile not found: ${name}`);
            return;
        }
        ui.notifications?.info(`Deleted pin profile: ${name}`);
        await this.render(true);
    }

    async _clearActiveProfile() {
        await game.settings.set(MODULE.ID, PinManager.ACTIVE_FILTER_PROFILE_SETTING_KEY, '');
        ui.notifications?.info('Pin layers are now in custom view mode.');
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
