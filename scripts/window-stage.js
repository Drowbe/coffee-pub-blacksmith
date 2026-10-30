// ==================================================================
// ===== WINDOW-STAGE: the Stage Manager panel ======================
// ==================================================================
//
// A Tool window listing the scenes in use as cards, each with the people on it as chips. Drag a person's chip onto
// another card to send them there; click a card's eye to look at that scene yourself. The data and the actions are
// manager-stage.js; this is only the presentation. See documentation/plans/plan-stage-manager.md.
//
// Built from the shared Tool controls (styles/window-tool-controls.css): cards, chips, a drop target, hints.
// Where anyone IS is Foundry's own `user.viewedScene`, so this window re-renders when Foundry re-renders its
// scene navigation (which it does when anyone changes scene), when someone connects or drops, and when the stored
// assignments change.

import { MODULE } from './const.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow } from './api-windows.js';
import { MenuBar } from './api-menubar.js';
import { DialogAPI } from './api-dialog.js';
import { StageManager } from './manager-stage.js';
import { AwayManager } from './manager-away.js';
import { setToolWindowState } from './manager-tool-windows.js';
import { openToastSendWindow } from './window-toast-send.js';

const APP_ID = 'blacksmith-stage-window';

/** The drag type a card's grip carries, so a reorder is never mistaken for moving a person. */
const STAGE_MIME = 'application/x-blacksmith-stage';

/**
 * A scene's thumbnail as a URL a stylesheet can use. A `url()` inside a CSS custom property is resolved against
 * the stylesheet that USES the variable, not against the page, so a bare Foundry path such as
 * `worlds/my-world/thumb.webp` lands under this module's styles folder and 404s. Rooting it with `getRoute`
 * makes it absolute from the server root (and adds a route prefix if the server has one). Anything that is
 * already absolute is left alone.
 */
function thumbnailUrl(path) {
    if (!path) return null;
    return /^(https?:|data:|\/)/.test(path) ? path : foundry.utils.getRoute(path);
}
const TOOL_ID = 'stage-manager';


/** The tooltip on a chip's away button: what it is now, and what pressing it does. */
function awayTip(away) {
    return away ? `Away${away.message ? `: ${away.message}` : ''}. Click to mark them back.` : 'Available. Click to mark them away.';
}

export class StageWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        {},
        {
            id: APP_ID,
            classes: ['blacksmith-window-tool', 'blacksmith-stage-tool-window'],
            position: { width: 500, height: 'auto' },
            window: { title: 'Stage Manager', icon: 'fa-solid fa-masks-theater', resizable: true },
            windowSizeConstraints: { minHeight: 220 }
        }
    );

    /** The single instance, so reopening does not stack windows. */
    static _ref = null;

    static ACTION_HANDLERS = {
        'stage-view': (_event, target, win) => win?._view(target?.dataset?.sceneId),
        'stage-go': (_event, target, win) => win?._go(target?.dataset?.sceneId),
        'stage-activate': (_event, target, win) => win?._activate(target?.dataset?.sceneId),
        'stage-menu': (event, target, win) => win?._openMenu(event, target),
        'stage-deploy-one': (_event, target, win) => win?._deployOne(target?.dataset?.sceneId, target?.dataset?.actorId),
        'stage-release': (_event, target, win) => win?._release(target?.dataset?.userId),
        'stage-away': (_event, target, win) => win?._toggleAway(target?.dataset?.userId),
        'stage-set-menu': (event, target, win) => win?._openSetMenu(event, target),
        'stage-lobby': (_event, _target, win) => win?._toggleLobby(),
        'stage-return-all': (_event, _target, win) => win?._returnAll()
    };

    /** True while a chip is being dragged, so a redraw triggered by someone else does not drop it. */
    _dragging = false;

    /** True while a card is being dragged to a new place, for the same reason. */
    _reordering = false;

    /** The set the panel is filtered to, or null for every scene. Per window: it is a way of looking, not state to keep. */
    _setFilter = null;

    _hookContext = `stage-window:${APP_ID}`;

    // ==============================================================
    // ===== RENDERING ==============================================
    // ==============================================================

    async getData() {
        if (!game.user?.isGM) return this._getPlayerData();
        const esc = foundry.utils.escapeHTML;
        const sets = StageManager.sets();
        // A set that was deleted (here or by another GM) drops the filter rather than showing an empty panel.
        if (this._setFilter && !sets.some((set) => set.id === this._setFilter)) this._setFilter = null;
        const stages = StageManager.stages({ setId: this._setFilter });
        const lobby = StageManager.lobbyOn();

        const cards = stages.map((stage) => {
            const badges = [
                stage.isActive ? '<span class="blacksmith-badge blacksmith-badge-accent">Active</span>' : '',
                stage.isLobby && lobby ? '<span class="blacksmith-badge blacksmith-badge-info">Lobby</span>' : '',
                stage.combats ? `<span class="blacksmith-badge blacksmith-badge-warning"><i class="fa-solid fa-shield-halved"></i> ${stage.combats}</span>` : ''
            ].join('');

            const chips = stage.people.map((p) => {
                // A player, and the GM's own chip: dropping that one moves the GM's own view, like the eye.
                const draggable = !p.isGM || p.isSelf;
                const mark = p.isGM ? 'fa-crown' : 'fa-user';
                const face = p.portrait
                    ? `<img class="blacksmith-stage-portrait" src="${esc(p.portrait)}" alt="">`
                    : `<i class="fa-solid ${mark}"></i>`;
                const held = p.assigned ? '<i class="fa-solid fa-thumbtack blacksmith-stage-held"></i>' : '';
                const release = p.assigned
                    ? `<button type="button" class="blacksmith-tool-chip-remove" data-action="stage-release" data-user-id="${esc(p.id)}" data-tooltip="Stop holding ${esc(p.name)} here"><i class="fa-solid fa-xmark"></i></button>`
                    : '';
                // The clock sits in the corner of the portrait and marks a person away and back. It is the same Away the
                // person sets from their own menubar.
                const status = `<button type="button" class="blacksmith-stage-status${p.away ? ' is-set' : ''}" data-action="stage-away" data-user-id="${esc(p.id)}" data-tooltip="${esc(awayTip(p.away))}"><i class="fa-solid ${p.away ? 'fa-user-clock' : 'fa-clock'}"></i></button>`;
                const tip = [
                    p.name,
                    p.active ? '' : 'Not connected.',
                    p.away ? `Away${p.away.message ? `: ${p.away.message}` : ''}.` : '',
                    p.assigned ? 'Held on this scene: comes back here when they reload' : ''
                ].filter(Boolean).join(' ');
                return `<span class="blacksmith-tool-chip${p.active ? '' : ' is-offline'}${p.away ? ' is-away' : ''}" ${draggable ? `draggable="true" data-user-chip data-user-id="${esc(p.id)}"` : ''}
                    data-tooltip="${esc(tip)}"><span class="blacksmith-stage-face">${face}${status}</span>${held}${release}</span>`;
            }).join('');

            // The second row: do the characters and owned NPCs of the people here have tokens on this scene? A
            // missing one is dimmed with a plus, and pressing it runs Blacksmith's deploy action for what is missing.
            const access = stage.access === 'all'
                ? { icon: 'fa-users', label: 'Scene permission: all players can see this scene' }
                : { icon: 'fa-user-lock', label: 'Scene permission: GM only' };
            const tokenFace = (t) => (t.img ? `<img src="${esc(t.img)}" alt="">` : '<i class="fa-solid fa-user"></i>');
            const tokenButton = (t) => t.present
                ? `<span class="blacksmith-stage-token" data-tooltip="${esc(t.name)}: has a token on this scene">${tokenFace(t)}</span>`
                : `<button type="button" class="blacksmith-stage-token is-missing" data-action="stage-deploy-one" data-scene-id="${esc(stage.id)}" data-actor-id="${esc(t.id)}" data-tooltip="${esc(t.name)}: no token on this scene. Click to deploy."><span class="blacksmith-stage-token-face">${tokenFace(t)}</span></button>`;
            const tokenRow = stage.tokens.show
                ? `<div class="blacksmith-stage-tokens">${[...stage.tokens.actors, ...stage.tokens.npcs].map(tokenButton).join('')}</div>`
                : '';

            return `
                <div class="blacksmith-tool-card is-static blacksmith-stage-card${stage.isActive ? ' is-active-stage' : ''}" data-stage-id="${esc(stage.id)}"${stage.thumb ? ` style="--stage-thumb: url('${esc(encodeURI(thumbnailUrl(stage.thumb)).replace(/'/g, '%27'))}')"` : ''}>
                    <div class="blacksmith-tool-card-head">
                        <span class="blacksmith-tool-card-summary">
                            <span class="blacksmith-stage-grip" draggable="true" data-stage-grip="${esc(stage.id)}" data-tooltip="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
                            <span class="blacksmith-tool-card-title">${esc(stage.name)}${stage.navName && stage.navName !== stage.name ? ` (${esc(stage.navName)})` : ''}</span>
                            ${stage.isFavorite ? '<i class="fa-solid fa-heart blacksmith-stage-favorite" data-tooltip="Favorite: always listed first"></i>' : ''}
                            <span class="blacksmith-tool-card-badges">${badges}</span>
                        </span>
                        <span class="blacksmith-tool-card-actions">
                            <button type="button" class="blacksmith-tool-btn is-icon${stage.isActive ? ' is-active' : ''}" data-action="stage-activate" data-scene-id="${esc(stage.id)}" data-tooltip="${stage.isActive ? 'This is the active scene' : 'Make this the active scene'}"${stage.isActive ? ' disabled' : ''}><i class="fa-solid fa-bullseye"></i></button>
                            <button type="button" class="blacksmith-tool-btn is-icon${stage.isGMView ? ' is-active' : ''}" data-action="stage-view" data-scene-id="${esc(stage.id)}" data-tooltip="Look at this scene yourself"><i class="fa-solid fa-eye"></i></button>
                            <button type="button" class="blacksmith-tool-btn is-icon" data-action="stage-menu" data-scene-id="${esc(stage.id)}" data-tooltip="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                        </span>
                    </div>
                    <div class="blacksmith-tool-card-body blacksmith-stage-content">
                        <div class="blacksmith-tool-dropzone blacksmith-stage-drop${chips ? '' : ' is-empty'}" data-stage-drop="${esc(stage.id)}">
                            ${chips
                                ? `<div class="blacksmith-tool-chips">${chips}</div>`
                                : '<span class="blacksmith-tool-dropzone-hint">Nobody here. Drop a player to send them.</span>'}
                        </div>
                        ${tokenRow}
                    </div>
                    <span class="blacksmith-stage-permission" data-tooltip="${access.label}"><i class="fa-solid ${access.icon}"></i></span>
                </div>`;
        }).join('');

        const lobbyScene = StageManager.lobbyScene();

        return {
            appId: APP_ID,
            bodyContent: `<div class="blacksmith-stage-body">
                ${this._setsBar(sets)}
                ${cards || `<div class="blacksmith-tool-empty">${this._setFilter ? 'Nothing in this set yet. Drag a scene onto its name above to add it.' : 'No scenes in use.'}</div>`}
                <div class="blacksmith-tool-dropzone blacksmith-stage-add-slot"><i class="fa-solid fa-arrow-down-to-line"></i> <span class="blacksmith-tool-dropzone-hint">Drag a scene here to add it</span></div>
            </div>`,
            toolFooterLeft: `<div class="blacksmith-toggle-row blacksmith-stage-lobby-switch${lobbyScene || lobby ? '' : ' is-disabled'}" data-tooltip="${lobby ? 'Lobby mode is on: anyone who loads in lands on the lobby scene. Switch it off to stop' : lobbyScene ? 'Turn on lobby mode: anyone who loads in lands on the lobby scene' : 'Mark a stage as the lobby scene first, with the door icon on its card'}"><span class="blacksmith-toggle-label">Lobby Mode</span><label class="blacksmith-toggle"><input type="checkbox" class="blacksmith-toggle-input" data-action="stage-lobby"${lobby ? ' checked' : ''}${lobbyScene || lobby ? '' : ' disabled'}><span class="blacksmith-toggle-slider"></span></label></div>`,
            toolFooterRight: `<button type="button" class="blacksmith-window-btn-primary" data-action="stage-return-all" data-tooltip="Clear every hold and send every connected player to the active scene"><i class="fa-solid fa-arrow-rotate-left"></i> Return Everyone</button>`
        };
    }

    /**
     * The row above the cards: a dropdown that picks which set the panel shows, a pencil to rename or delete the set
     * shown, and a button to make a new one.
     */
    _setsBar(sets) {
        const esc = foundry.utils.escapeHTML;
        // A set holding the active scene is marked with a dot, so the GM can tell where the table is from the list.
        const activeId = game.scenes.active?.id;
        const options = [
            `<option value=""${this._setFilter ? '' : ' selected'}>All scenes</option>`,
            ...sets.map((set) => `<option value="${esc(set.id)}"${this._setFilter === set.id ? ' selected' : ''}>${esc(set.name)} (${set.scenes.length})${activeId && set.scenes.includes(activeId) ? ' \u25CF' : ''}</option>`)
        ].join('');
        return `<div class="blacksmith-stage-sets">
            <select class="blacksmith-stage-set-select" data-stage-set-select data-tooltip="Show a set of scenes">${options}</select>
            <button type="button" class="blacksmith-tool-btn is-icon" data-action="stage-set-menu" data-tooltip="Make a new set${this._setFilter ? ', or rename or delete this one' : ''}"><i class="fa-solid fa-pen"></i></button>
        </div>`;
    }

    /**
     * What a player sees: the scenes they may use, as cards with the connected players on them, read only. They can
     * look at a scene themselves (the eye, or a double-click on its card) and nothing else: no moving, no holds, no
     * adding or removing, no lobby.
     */
    _getPlayerData() {
        const esc = foundry.utils.escapeHTML;
        const cards = StageManager.playerStages().map((stage) => {
            const badges = stage.isActive ? '<span class="blacksmith-badge blacksmith-badge-accent">Active</span>' : '';
            const chips = stage.people.map((p) => {
                const face = p.portrait
                    ? `<img class="blacksmith-stage-portrait" src="${esc(p.portrait)}" alt="">`
                    : '<i class="fa-solid fa-user"></i>';
                const status = p.away ? `<span class="blacksmith-stage-status is-set"><i class="fa-solid fa-user-clock"></i></span>` : '';
                const tip = [p.name, p.away ? `Away${p.away.message ? `: ${p.away.message}` : ''}.` : ''].filter(Boolean).join(' ');
                return `<span class="blacksmith-tool-chip${p.away ? ' is-away' : ''}" data-tooltip="${esc(tip)}"><span class="blacksmith-stage-face">${face}${status}</span></span>`;
            }).join('');
            return `
                <div class="blacksmith-tool-card is-static blacksmith-stage-card${stage.isActive ? ' is-active-stage' : ''}" data-stage-id="${esc(stage.id)}"${stage.thumb ? ` style="--stage-thumb: url('${esc(encodeURI(thumbnailUrl(stage.thumb)).replace(/'/g, '%27'))}')"` : ''}>
                    <div class="blacksmith-tool-card-head">
                        <span class="blacksmith-tool-card-summary">
                            <span class="blacksmith-tool-card-title">${esc(stage.name)}</span>
                            <span class="blacksmith-tool-card-badges">${badges}</span>
                        </span>
                        <span class="blacksmith-tool-card-actions">
                            <button type="button" class="blacksmith-tool-btn is-icon${stage.isView ? ' is-active' : ''}" data-action="stage-go" data-scene-id="${esc(stage.id)}" data-tooltip="${stage.isView ? 'You are looking at this scene' : stage.canGo ? 'Go to this scene' : 'You cannot go to this scene'}"${stage.isView || !stage.canGo ? ' disabled' : ''}><i class="fa-solid fa-eye"></i></button>
                        </span>
                    </div>
                    <div class="blacksmith-tool-card-body blacksmith-stage-content">
                        <div class="blacksmith-tool-dropzone blacksmith-stage-drop${chips ? '' : ' is-empty'}">
                            ${chips ? `<div class="blacksmith-tool-chips">${chips}</div>` : ''}
                        </div>
                    </div>
                </div>`;
        }).join('');
        return {
            appId: APP_ID,
            bodyContent: `<div class="blacksmith-stage-body">
                ${cards || '<div class="blacksmith-tool-empty">There are no scenes you can go to yet.</div>'}
            </div>`,
            toolFooterLeft: '<span class="blacksmith-stage-add-hint"><i class="fa-solid fa-eye"></i> Double-click a scene to go there</span>'
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root) return;
        if (game.user?.isGM) {
            this._bindDrag(root);
            this._bindSets(root);
        } else this._bindPlayer(root);
        this._followChanges();
    }

    /** A player's card: double-click it to go to that scene. A button or a person is theirs and does nothing here. */
    _bindPlayer(root) {
        for (const card of root.querySelectorAll('[data-stage-id]')) {
            card.addEventListener('dblclick', (event) => {
                if (event.target.closest('button, [data-action], .blacksmith-tool-chip')) return;
                this._go(card.dataset.stageId);
            });
        }
    }

    /** Go to a scene, as a player: only one they may use. Looking at it moves nobody else. */
    async _go(sceneId) {
        if (!sceneId || canvas.scene?.id === sceneId) return;
        try {
            await StageManager.viewPermitted(sceneId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** Re-render when anything that changes who is where changes. Registered once per window, disposed on close. */
    _followChanges() {
        if (this._following) return;
        this._following = true;
        const refresh = () => {
            // A redraw mid-drag would drop the chip the GM is holding; the drop re-renders anyway.
            if (this._dragging || this._reordering || !this.rendered) return;
            clearTimeout(this._refreshTimer);
            this._refreshTimer = setTimeout(() => this.render(), 120);
        };
        for (const name of [
            'renderSceneNavigation', 'userConnected', 'updateScene', 'createScene', 'deleteScene',
            'createCombat', 'updateCombat', 'deleteCombat',
            // Someone went away or came back.
            'updateUser',
            // The token row: a token added to or removed from a scene, and an actor whose portrait or owners change.
            // Not updateToken: that fires on every step a token takes and changes nothing the row shows.
            'createToken', 'deleteToken', 'createActor', 'updateActor', 'deleteActor'
        ]) {
            HookManager.registerHook({
                name,
                description: `Stage manager window: refresh on ${name}`,
                context: this._hookContext,
                priority: 5,
                callback: () => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    refresh();
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }
        HookManager.registerSettingChangeCallback({
            description: 'Stage manager window: refresh when the stored assignments change',
            context: this._hookContext,
            priority: 5,
            callback: (moduleId, settingKey) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (moduleId === MODULE.ID && settingKey === 'stageState') refresh();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    _onClose(options) {
        clearTimeout(this._refreshTimer);
        if (this._hideDragHint) document.removeEventListener('dragend', this._hideDragHint);
        this._dragBound = false;
        HookManager.disposeByContext(this._hookContext);
        this._following = false;
        if (StageWindow._ref === this) StageWindow._ref = null;
        void setToolWindowState('stage', false);
        return super._onClose?.(options);
    }

    // ==============================================================
    // ===== DRAG AND DROP ==========================================
    // ==============================================================

    _bindDrag(root) {
        // While anything is being dragged over the window, the drop zones show themselves; otherwise they are
        // just the margin around the people. Covers the panel's own chips and drags out of Foundry's sidebar,
        // so it listens on the window, once, not on the chips. The listeners live on the window element, which
        // survives a re-render, so they are added only the first time.
        if (!this._dragBound) {
            this._dragBound = true;
            const win = this.element;
            // A card being reordered is not a drop onto a person's zone, so the zones stay hidden for it.
            const show = () => {
                if (!this._reordering) win.classList.add('is-dragging');
            };
            const hide = () => {
                win.classList.remove('is-dragging');
                for (const zone of win.querySelectorAll('.blacksmith-stage-drop.is-over')) zone.classList.remove('is-over');
            };
            win.addEventListener('dragenter', show);
            win.addEventListener('dragleave', (event) => {
                if (!win.contains(event.relatedTarget)) hide();
            });
            win.addEventListener('drop', hide);
            // A scene dragged onto the window anywhere adds it. A drop zone that takes the payload (a person) has already
            // handled it and prevented the default; a card being reordered carries its own type. The drag has to be
            // accepted on the way over, and only its types can be read then, so anything but a reorder is accepted.
            win.addEventListener('dragover', (event) => {
                if (event.dataTransfer.types.includes(STAGE_MIME)) return;
                event.preventDefault();
            });
            win.addEventListener('drop', (event) => {
                if (event.defaultPrevented || event.dataTransfer.types.includes(STAGE_MIME)) return;
                const scene = StageManager.sceneFromDrop(event.dataTransfer.getData('text/plain'));
                if (!scene) return;
                event.preventDefault();
                void this._addScene(scene);
            });
            win.addEventListener('dragend', hide);
            document.addEventListener('dragend', hide);
            this._hideDragHint = hide;
        }

        for (const chip of root.querySelectorAll('[data-user-chip]')) {
            chip.addEventListener('dragstart', (event) => {
                this._dragging = true;
                event.dataTransfer.setData('text/plain', chip.dataset.userId);
                event.dataTransfer.effectAllowed = 'move';
            });
            chip.addEventListener('dragend', () => {
                this._dragging = false;
                for (const zone of root.querySelectorAll('.blacksmith-stage-drop.is-over')) zone.classList.remove('is-over');
            });
        }
        // Reordering: drag a card by its grip, and drop it above or below another card.
        for (const grip of root.querySelectorAll('[data-stage-grip]')) {
            grip.addEventListener('dragstart', (event) => {
                this._reordering = true;
                event.dataTransfer.setData(STAGE_MIME, grip.dataset.stageGrip);
                event.dataTransfer.effectAllowed = 'move';
                const card = grip.closest('[data-stage-id]');
                if (card) {
                    event.dataTransfer.setDragImage(card, 24, 16);
                    card.classList.add('is-reordering');
                }
            });
            grip.addEventListener('dragend', () => {
                this._reordering = false;
                for (const card of root.querySelectorAll('[data-stage-id]')) {
                    card.classList.remove('is-reordering', 'is-drop-before', 'is-drop-after');
                }
            });
        }
        for (const card of root.querySelectorAll('[data-stage-id]')) {
            // Double-click the card itself to make it the active scene. A double-click on a button, a person or the
            // token row is theirs and does nothing here.
            card.addEventListener('dblclick', (event) => {
                if (event.target.closest('button, [data-action], .blacksmith-tool-chip, .blacksmith-stage-tokens, .blacksmith-stage-grip, select, input, a')) return;
                if (game.scenes.get(card.dataset.stageId)?.active) return;
                this._activate(card.dataset.stageId);
            });
            card.addEventListener('dragover', (event) => {
                if (!event.dataTransfer.types.includes(STAGE_MIME)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const box = card.getBoundingClientRect();
                const after = event.clientY > box.top + box.height / 2;
                card.classList.toggle('is-drop-after', after);
                card.classList.toggle('is-drop-before', !after);
            });
            card.addEventListener('dragleave', (event) => {
                if (!card.contains(event.relatedTarget)) card.classList.remove('is-drop-before', 'is-drop-after');
            });
            card.addEventListener('drop', async (event) => {
                if (!event.dataTransfer.types.includes(STAGE_MIME)) return;
                event.preventDefault();
                event.stopPropagation();
                const draggedId = event.dataTransfer.getData(STAGE_MIME);
                const after = card.classList.contains('is-drop-after');
                card.classList.remove('is-drop-before', 'is-drop-after');
                this._reordering = false;
                await this._reorder(root, draggedId, card.dataset.stageId, after);
            });
        }

        for (const zone of root.querySelectorAll('[data-stage-drop]')) {
            zone.addEventListener('dragover', (event) => {
                if (this._reordering) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                zone.classList.add('is-over');
            });
            zone.addEventListener('dragleave', (event) => {
                if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-over');
            });
            zone.addEventListener('drop', async (event) => {
                if (event.dataTransfer.types.includes(STAGE_MIME)) return;
                // A scene dropped on a card is not for this zone; the window adds it.
                if (StageManager.sceneFromDrop(event.dataTransfer.getData('text/plain'))) {
                    zone.classList.remove('is-over');
                    return;
                }
                event.preventDefault();
                zone.classList.remove('is-over');
                this._dragging = false;
                const users = StageManager.usersFromDrop(event.dataTransfer.getData('text/plain'));
                if (!users.length) {
                    ui.notifications?.warn('Drop a player chip here, or a player or a character from the sidebar.');
                    return;
                }
                try {
                    for (const user of users) await StageManager.moveUser(user.id, zone.dataset.stageDrop);
                } catch (error) {
                    ui.notifications?.warn(error.message);
                }
                this.render();
            });
        }
    }

    /** The dropdown picks which set the panel shows. */
    _bindSets(root) {
        root.querySelector('[data-stage-set-select]')?.addEventListener('change', (event) => this._pickSet(event.currentTarget.value));
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    /** Show one set, or every scene (a falsy id). */
    _pickSet(setId) {
        this._setFilter = setId || null;
        this.render();
    }

    /** Ask for a name, make the set and show it. Cancelling leaves the dropdown where it was. */
    async _newSet() {
        const name = await this._askSetName('New Set', '');
        if (name) {
            try {
                this._setFilter = await StageManager.createSet(name);
            } catch (error) {
                ui.notifications?.warn(error.message);
            }
        }
        this.render();
    }

    /** A one-field dialog for a set's name. Resolves to the trimmed name, or null when cancelled or left empty. */
    async _askSetName(title, current) {
        const esc = foundry.utils.escapeHTML;
        const { action, value } = await DialogAPI.prompt({
            title,
            content: ({ value: previous }) => `<input type="text" class="blacksmith-input" name="set-name" placeholder="Set name" value="${esc(previous ?? current)}" maxlength="40">`,
            submitLabel: 'Save',
            focusSelector: '[name="set-name"]',
            getValue: (root) => root.elements['set-name']?.value?.trim() ?? '',
            validate: (name) => name ? null : 'Enter a set name.'
        });
        return action === DialogAPI.ACTIONS.SUBMIT ? (value || null) : null;
    }

    /** The "..." beside the dropdown: rename or delete the set being shown. */
    _openSetMenu(event, target) {
        const set = StageManager.sets().find((s) => s.id === this._setFilter);
        const items = [{ name: 'New Set', icon: 'fa-solid fa-plus', onClick: () => this._newSet() }];
        // Rename and delete act on the set being shown, so they are only there when one is.
        if (set) {
            items.push(
                { separator: true },
                { name: 'Rename set', icon: 'fa-solid fa-pen', onClick: () => this._renameSet(set) },
                { name: 'Delete set', icon: 'fa-solid fa-trash', description: 'The scenes themselves are not deleted', onClick: () => this._deleteSet(set) }
            );
        }
        const rect = target?.getBoundingClientRect?.();
        MenuBar.showMenubarContextMenu(items, rect ? rect.left : event.clientX, rect ? rect.bottom + 4 : event.clientY);
    }

    async _renameSet(set) {
        const name = await this._askSetName('Rename Set', set.name);
        if (name && name !== set.name) {
            try {
                await StageManager.renameSet(set.id, name);
            } catch (error) {
                ui.notifications?.warn(error.message);
            }
        }
        this.render();
    }

    async _deleteSet(set) {
        const confirmed = await DialogAPI.confirm({
            title: 'Delete Set',
            content: `<p>Delete the set "${foundry.utils.escapeHTML(set.name)}"? The scenes in it are not deleted.</p>`,
            confirmLabel: 'Delete',
            confirmIcon: 'fa-solid fa-trash',
            destructive: true
        });
        if (!confirmed) return;
        await StageManager.deleteSet(set.id);
        this._setFilter = null;
        this.render();
    }

    async _toggleFavorite(sceneId, favorite) {
        try {
            await StageManager.setFavorite(sceneId, favorite);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    async _toggleInSet(setId, sceneId, member) {
        try {
            await StageManager.setInSet(setId, sceneId, member);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** Put the dragged card before or after the target, and save the new order of every card on screen. */
    async _reorder(root, draggedId, targetId, after) {
        if (!draggedId || draggedId === targetId) return;
        const ids = [...root.querySelectorAll('[data-stage-id]')].map((card) => card.dataset.stageId).filter((id) => id !== draggedId);
        const at = ids.indexOf(targetId);
        if (at < 0) return;
        ids.splice(after ? at + 1 : at, 0, draggedId);
        try {
            await StageManager.setOrder(ids);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    _view(sceneId) {
        if (sceneId) StageManager.viewStage(sceneId);
    }

    async _activate(sceneId) {
        if (!sceneId) return;
        try {
            // Activating a scene while lobby mode is on pulls everyone out of the lobby and leaves the mode on, so a player
            // who reloads goes straight back to it. The GM decides which they meant. The lobby scene itself conflicts with
            // nothing, so it is activated without asking.
            if (StageManager.lobbyOn() && StageManager.lobbyScene()?.id !== sceneId && !game.scenes.get(sceneId)?.active) {
                // Escape and the title-bar close resolve `close`, and Cancel resolves `cancel`; only a pressed choice is a value.
                const { action, value: choice } = await DialogAPI.wait({
                    title: 'Lobby Mode',
                    content: '<p>Lobby Mode is on. What do you want to do?</p>',
                    buttons: [
                        { action: 'off', label: 'Turn off lobby mode and activate', icon: 'fa-solid fa-toggle-off' },
                        { action: 'view', label: 'Leave on lobby mode and view', icon: 'fa-solid fa-eye' },
                        { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark', default: true }
                    ],
                    modal: true
                });
                if (action !== DialogAPI.ACTIONS.SUBMIT) return;
                if (choice === 'view') {
                    StageManager.viewStage(sceneId);
                    return;
                }
                if (choice !== 'off') return;
                await StageManager.setLobby(false, { release: false });
            }
            await StageManager.activateStage(sceneId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** Open the scene's own configuration sheet. It does not change where anyone is looking. */
    _edit(sceneId) {
        game.scenes.get(sceneId)?.sheet?.render(true);
    }

    async _deployOne(sceneId, actorId) {
        if (!sceneId || !actorId) return;
        try {
            await StageManager.deployActor(sceneId, actorId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    async _deployAll(sceneId) {
        if (!sceneId) return;
        try {
            await StageManager.deployPartyTo(sceneId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /**
     * Add a dropped scene to the panel, and to the set being shown when there is one. A scene that already has a card
     * and is already in that set is left alone and said so.
     */
    async _addScene(scene) {
        const name = scene.name;
        const set = StageManager.sets().find((s) => s.id === this._setFilter);
        const onPanel = StageManager.stages().some((stage) => stage.id === scene.id);
        if (onPanel && (!set || set.scenes.includes(scene.id))) {
            ui.notifications?.info(set ? `${name} is already in ${set.name}.` : `${name} is already on the panel.`);
            return;
        }
        try {
            if (set) await StageManager.setInSet(set.id, scene.id, true);
            else await StageManager.addStage(scene.id);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    async _remove(sceneId) {
        if (sceneId) await StageManager.removeStage(sceneId);
        this.render();
    }

    async _release(userId) {
        if (userId) await StageManager.releaseUser(userId);
        this.render();
    }

    async _returnAll() {
        const confirmed = await DialogAPI.confirm({
            title: 'Return Everyone',
            content: '<p>Clear every hold and send every connected player to the active scene?</p>',
            confirmLabel: 'Return Everyone',
            confirmIcon: 'fa-solid fa-arrow-rotate-left',
            modal: true
        });
        if (!confirmed) return;
        await StageManager.returnEveryone();
        this.render();
    }

    /** Mark a person away, or back when they already are. A GM may do it for anyone. */
    async _toggleAway(userId) {
        if (!userId) return;
        try {
            if (AwayManager.isAway(userId)) await AwayManager.clear(userId);
            else await AwayManager.set(userId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** The "..." on a card: what is done to a scene, in the shared context menu, to keep the card's own buttons few. */
    _openMenu(event, target) {
        const stage = StageManager.stages().find((s) => s.id === target?.dataset?.sceneId);
        if (!stage) return;
        const hearers = stage.people.filter((p) => !p.isGM && p.active).length;
        const sets = StageManager.sets();
        const items = [
            { name: 'Edit scene configuration', icon: 'fa-solid fa-pen', onClick: () => this._edit(stage.id) },
            {
                name: stage.isFavorite ? 'Remove from favorites' : 'Favorite',
                icon: stage.isFavorite ? 'fa-regular fa-heart' : 'fa-solid fa-heart',
                description: stage.isFavorite ? '' : 'Always listed first',
                onClick: () => this._toggleFavorite(stage.id, !stage.isFavorite)
            },
            {
                name: stage.isLobby ? 'Clear the lobby scene' : 'Make this the lobby scene',
                icon: 'fa-solid fa-door-open',
                description: stage.isLobby ? '' : 'Where players land when Lobby Mode is on',
                onClick: () => this._markLobbyScene(stage.id)
            },
            {
                name: 'Deploy Party',
                icon: 'fa-solid fa-user-shield',
                description: stage.tokens.show ? 'Place the party on this scene, choosing a formation' : 'There is no party to deploy',
                disabled: !stage.tokens.show,
                onClick: () => this._deployAll(stage.id)
            },
            {
                name: 'Send a toast to the players here',
                icon: 'fa-solid fa-comment',
                description: hearers ? '' : 'Nobody is connected on this scene',
                disabled: !hearers,
                onClick: () => this._talk(stage.id)
            }
        ];
        // Sets: one line each, ticked when the scene is in it. Pressing it joins or leaves.
        if (sets.length) {
            items.push({ separator: true });
            for (const set of sets) {
                const inSet = stage.sets.includes(set.id);
                items.push({
                    name: inSet ? `In ${set.name}` : `Add to ${set.name}`,
                    icon: inSet ? 'fa-solid fa-square-check' : 'fa-regular fa-square',
                    description: inSet ? 'Press to take it out of this set' : '',
                    onClick: () => this._toggleInSet(set.id, stage.id, !inSet)
                });
            }
        }
        // Only a scene the GM put on the panel (by hand, or into a set) that is empty and not active can be taken off it.
        if ((stage.isExtra || stage.sets.length) && !stage.isActive && !stage.people.length) {
            items.push({ separator: true }, { name: 'Remove', icon: 'fa-solid fa-xmark', onClick: () => this._remove(stage.id) });
        }
        const rect = target?.getBoundingClientRect?.();
        MenuBar.showMenubarContextMenu(items, rect ? rect.right : event.clientX, rect ? rect.bottom + 4 : event.clientY);
    }

    /** Mark this stage as the lobby scene, or clear it when it already is. */
    async _markLobbyScene(sceneId) {
        if (!sceneId) return;
        try {
            await StageManager.setLobbyScene(StageManager.lobbyScene()?.id === sceneId ? null : sceneId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /**
     * Open Send Toast with the connected players on this stage ticked. The toast system does the rest: the look, the
     * sound, the size and the delivery.
     */
    async _talk(sceneId) {
        if (!sceneId) return;
        const recipients = StageManager.talkRecipients(sceneId);
        if (!recipients.length) {
            ui.notifications?.warn('Nobody is connected on this scene to send a toast to.');
            return;
        }
        await openToastSendWindow({ recipients });
    }

    async _toggleLobby() {
        try {
            await StageManager.setLobby(!StageManager.lobbyOn());
            const lobby = StageManager.lobbyScene();
            // A player's client is only sent the scenes their Permissions allow, so a GM-only lobby scene cannot be reached.
            if (StageManager.lobbyOn() && (lobby?.ownership?.default ?? 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                ui.notifications?.warn(`${lobby.name} is GM only, so players cannot be sent there. Set its Permissions to All Players.`);
            }
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** Open the window, reusing the instance if it is already up. */
    static open() {
        if (!game.user?.isGM && !StageManager.playerScenes().length) {
            ui.notifications?.warn('There are no scenes you can go to yet.');
            return null;
        }
        StageWindow._ref ??= new StageWindow();
        StageWindow._ref.render(true);
        // Remembered per user, so a reload reopens it (see manager-tool-windows.js).
        void setToolWindowState('stage', true);
        return StageWindow._ref;
    }
}

/**
 * Called from `blacksmith.js` once the window registry exists, as the rest window does, rather than at import time.
 */
export function registerStageWindow() {
    registerWindow(APP_ID, {
        moduleId: MODULE.ID,
        title: 'Stage Manager',
        open: () => StageWindow.open()
    });

    MenuBar.registerMenubarTool(TOOL_ID, {
        icon: 'fa-solid fa-masks-theater',
        name: TOOL_ID,
        title: null,
        tooltip: () => (game.user.isGM ? 'Stage Manager: who is on which scene' : 'Scenes you can go to'),
        onClick: () => StageWindow.open(),
        zone: 'left',
        group: 'general',
        order: 210,
        moduleId: MODULE.ID,
        gmOnly: false,
        leaderOnly: false,
        // A player gets it only when there is a scene they may use. A GM always does.
        visible: () => game.user.isGM || StageManager.playerScenes().length > 0
    });

    // A player's permissions on a scene are a change nothing else redraws the menubar for, so the icon follows them.
    if (!game.user.isGM) {
        let timer = null;
        for (const name of ['createScene', 'updateScene', 'deleteScene']) {
            HookManager.registerHook({
                name,
                description: `Stage manager: show or hide the player's icon when scene permissions change (${name})`,
                context: 'stage-manager-icon',
                priority: 5,
                callback: () => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    clearTimeout(timer);
                    timer = setTimeout(() => MenuBar.renderMenubar(true), 300);
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }
    }
}

export { APP_ID as STAGE_WINDOW_ID };
