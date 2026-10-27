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
import { StageManager } from './manager-stage.js';
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

/** How each status looks on a chip. No status is the plain bell, shown faintly until the chip is hovered. */
const STATUS_LOOK = {
    away: { icon: 'fa-mug-hot', label: 'Away' },
    dnd: { icon: 'fa-bell-slash', label: 'Do Not Disturb' }
};

/** The tooltip on a chip's status button: what it is now, and what pressing it sets. */
function statusTip(current) {
    const next = StageManager.nextStatus(current);
    return `${current ? STATUS_LOOK[current].label : 'Available'}. Click to set ${next ? STATUS_LOOK[next].label : 'Available'}.`;
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
        'stage-activate': (_event, target, win) => win?._activate(target?.dataset?.sceneId),
        'stage-edit': (_event, target, win) => win?._edit(target?.dataset?.sceneId),
        'stage-deploy-one': (_event, target, win) => win?._deployOne(target?.dataset?.sceneId, target?.dataset?.actorId),
        'stage-deploy-all': (_event, target, win) => win?._deployAll(target?.dataset?.sceneId),
        'stage-remove': (_event, target, win) => win?._remove(target?.dataset?.sceneId),
        'stage-release': (_event, target, win) => win?._release(target?.dataset?.userId),
        'stage-status': (_event, target, win) => win?._cycleStatus(target?.dataset?.userId),
        'stage-lobby-mark': (_event, target, win) => win?._markLobbyScene(target?.dataset?.sceneId),
        'stage-talk': (_event, target, win) => win?._talk(target?.dataset?.sceneId),
        'stage-lobby': (_event, _target, win) => win?._toggleLobby(),
        'stage-return-all': (_event, _target, win) => win?._returnAll()
    };

    /** True while a chip is being dragged, so a redraw triggered by someone else does not drop it. */
    _dragging = false;

    /** True while a card is being dragged to a new place, for the same reason. */
    _reordering = false;

    _hookContext = `stage-window:${APP_ID}`;

    // ==============================================================
    // ===== RENDERING ==============================================
    // ==============================================================

    async getData() {
        const esc = foundry.utils.escapeHTML;
        const stages = StageManager.stages();
        const lobby = StageManager.lobbyOn();

        const cards = stages.map((stage) => {
            const badges = [
                stage.isActive ? '<span class="blacksmith-badge blacksmith-badge-accent">Active</span>' : '',
                stage.isLobby && lobby ? '<span class="blacksmith-badge blacksmith-badge-accent"><i class="fa-solid fa-door-open"></i> Lobby</span>' : '',
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
                // The bell sets Away or Do Not Disturb, cycling. A GM takes no status.
                const status = p.isGM
                    ? ''
                    : `<button type="button" class="blacksmith-stage-status${p.status ? ' is-set' : ''}" data-action="stage-status" data-user-id="${esc(p.id)}" data-tooltip="${esc(statusTip(p.status))}"><i class="fa-solid ${p.status ? STATUS_LOOK[p.status].icon : 'fa-bell'}"></i></button>`;
                const tip = [
                    p.name,
                    p.active ? '' : 'Not connected.',
                    p.status ? `${STATUS_LOOK[p.status].label}.` : '',
                    p.assigned ? 'Held on this scene: comes back here when they reload' : ''
                ].filter(Boolean).join(' ');
                return `<span class="blacksmith-tool-chip${p.active ? '' : ' is-offline'}${p.status ? ` has-status-${p.status}` : ''}" ${draggable ? `draggable="true" data-user-chip data-user-id="${esc(p.id)}"` : ''}
                    data-tooltip="${esc(tip)}">${face}${held}${status}${release}</span>`;
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
            const group = (list, icon) => (list.length
                ? `<div class="blacksmith-stage-token-group"><button type="button" class="blacksmith-stage-token-icon" data-action="stage-deploy-all" data-scene-id="${esc(stage.id)}" data-tooltip="Deploy the party to this scene, choosing a formation"><i class="fa-solid ${icon}"></i></button>${list.map(tokenButton).join('')}</div>`
                : '');
            const tokenRow = stage.tokens.show
                ? `<div class="blacksmith-stage-tokens">${group(stage.tokens.actors, 'fa-user-shield')}${stage.tokens.actors.length && stage.tokens.npcs.length ? '<span class="blacksmith-stage-token-divider"></span>' : ''}${group(stage.tokens.npcs, 'fa-paw')}</div>`
                : '';

            // The chat button sends a toast to the players here, so it is only offered when someone is connected.
            const hearers = stage.people.filter((p) => !p.isGM && p.active).length;

            const remove = stage.isExtra && !stage.isActive && !stage.people.length
                ? `<button type="button" class="blacksmith-tool-btn is-icon" data-action="stage-remove" data-scene-id="${esc(stage.id)}" data-tooltip="Take this stage off the list"><i class="fa-solid fa-xmark"></i></button>`
                : '';

            return `
                <div class="blacksmith-tool-card is-static blacksmith-stage-card" data-stage-id="${esc(stage.id)}"${stage.thumb ? ` style="--stage-thumb: url('${esc(encodeURI(thumbnailUrl(stage.thumb)).replace(/'/g, '%27'))}')"` : ''}>
                    <div class="blacksmith-tool-card-head">
                        <span class="blacksmith-tool-card-summary">
                            <span class="blacksmith-stage-grip" draggable="true" data-stage-grip="${esc(stage.id)}" data-tooltip="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
                            <span class="blacksmith-tool-card-title">${esc(stage.name)}${stage.navName && stage.navName !== stage.name ? ` (${esc(stage.navName)})` : ''}</span>
                            <span class="blacksmith-tool-card-badges">${badges}</span>
                        </span>
                        <span class="blacksmith-tool-card-actions">
                            <button type="button" class="blacksmith-tool-btn is-icon${stage.isActive ? ' is-active' : ''}" data-action="stage-activate" data-scene-id="${esc(stage.id)}" data-tooltip="${stage.isActive ? 'This is the active scene' : 'Make this the active scene'}"${stage.isActive ? ' disabled' : ''}><i class="fa-solid fa-bullseye"></i></button>
                            <button type="button" class="blacksmith-tool-btn is-icon${stage.isGMView ? ' is-active' : ''}" data-action="stage-view" data-scene-id="${esc(stage.id)}" data-tooltip="Look at this scene yourself"><i class="fa-solid fa-eye"></i></button>
                            <button type="button" class="blacksmith-tool-btn is-icon" data-action="stage-edit" data-scene-id="${esc(stage.id)}" data-tooltip="Edit this scene's configuration"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" class="blacksmith-tool-btn is-icon${stage.isLobby ? ' is-active' : ''}" data-action="stage-lobby-mark" data-scene-id="${esc(stage.id)}" data-tooltip="${stage.isLobby ? 'This is the lobby scene. Click to clear it' : 'Make this the lobby scene, where players land when Lobby Mode is on'}"><i class="fa-solid fa-door-open"></i></button>
                            <button type="button" class="blacksmith-tool-btn is-icon" data-action="stage-talk" data-scene-id="${esc(stage.id)}" data-tooltip="${hearers ? 'Send a toast to the players here' : 'Nobody is connected on this scene'}"${hearers ? '' : ' disabled'}><i class="fa-solid fa-comment"></i></button>
                            ${remove}
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
                ${cards || '<div class="blacksmith-tool-empty">No scenes in use. Drag a scene here to add it.</div>'}
            </div>`,
            // Scenes are added by dragging them onto the window, so the left of the action bar is only a reminder.
            toolFooterLeft: '<span class="blacksmith-stage-add-hint"><i class="fa-solid fa-arrow-down-to-line"></i> Drag a scene here to add it</span>',
            toolFooterRight: `<button type="button" class="blacksmith-tool-btn${lobby ? ' is-active' : ''}" data-action="stage-lobby"${lobbyScene || lobby ? '' : ' disabled'} data-tooltip="${lobby ? 'Lobby mode is on: anyone who loads in lands on the lobby scene. Click to turn it off' : lobbyScene ? 'Turn on lobby mode: anyone who loads in lands on the lobby scene' : 'Mark a stage as the lobby scene first, with the door icon on its card'}"><i class="fa-solid fa-door-open"></i> Lobby Mode</button><button type="button" class="blacksmith-window-btn-secondary" data-action="stage-return-all" data-tooltip="Clear every hold and send every connected player to the active scene"><i class="fa-solid fa-arrow-rotate-left"></i> Return Everyone</button>`
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root) return;
        this._bindDrag(root);
        this._followChanges();
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
                    const left = [];
                    for (const user of users) {
                        if (!(await StageManager.moveUser(user.id, zone.dataset.stageDrop)) && StageManager.statusOf(user.id) === 'dnd') left.push(user.name);
                    }
                    this._noteLeftAlone(left);
                } catch (error) {
                    ui.notifications?.warn(error.message);
                }
                this.render();
            });
        }
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

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

    /** Add a dropped scene to the panel. A scene that already has a card is left alone and said so. */
    async _addScene(scene) {
        const name = scene.name;
        if (StageManager.stages().some((stage) => stage.id === scene.id)) {
            ui.notifications?.info(`${name} is already on the panel.`);
            return;
        }
        try {
            await StageManager.addStage(scene.id);
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
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Return Everyone' },
            content: '<p>Clear every hold and send every connected player to the active scene?</p>',
            rejectClose: false,
            modal: true
        });
        if (!confirmed) return;
        const { skipped } = await StageManager.returnEveryone();
        this._noteLeftAlone(skipped);
        this.render();
    }

    /** Tell the GM who a move or a message did not reach because they are on Do Not Disturb. */
    _noteLeftAlone(names) {
        if (names?.length) ui.notifications?.warn(`Left alone (Do Not Disturb): ${names.join(', ')}.`);
    }

    async _cycleStatus(userId) {
        if (!userId) return;
        try {
            await StageManager.setStatus(userId, StageManager.nextStatus(StageManager.statusOf(userId)));
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
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
     * sound, the size and the delivery. A player on Do Not Disturb is left unticked and named; the GM can still tick
     * them in that window, which is a deliberate choice.
     */
    async _talk(sceneId) {
        if (!sceneId) return;
        const { recipients, skipped } = StageManager.talkRecipients(sceneId);
        this._noteLeftAlone(skipped);
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
        if (!game.user?.isGM) {
            ui.notifications?.warn('Only a GM can manage stages.');
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
        tooltip: 'Stage Manager: who is on which scene',
        onClick: () => StageWindow.open(),
        zone: 'left',
        group: 'general',
        order: 210,
        moduleId: MODULE.ID,
        gmOnly: true,
        leaderOnly: false,
        visible: true
    });
}

export { APP_ID as STAGE_WINDOW_ID };
