// ==================================================================
// ===== WINDOW-DELEGATION: the character delegation grid ===========
// ==================================================================
//
// A Tool window with a grid of players (rows) and characters (columns). Pressing a character's portrait in a
// player's row steps that player's level on the character through Default, Owner, Observer, Limited and None. Set as
// Default remembers the arrangement; Reset to Default returns to it. The data and the actions are
// manager-delegation.js; this is only the presentation. See documentation/architecture/architecture-delegation.md.

import { MODULE } from './const.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow } from './api-windows.js';
import { DelegationManager } from './manager-delegation.js';

const APP_ID = 'blacksmith-delegation-window';

/** How each level reads: its name, and the icon in the corner of a cell. Keyed by Foundry's ownership numbers. */
function levelInfo() {
    const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    return {
        [levels.INHERIT]: { label: 'Default', icon: 'fa-solid fa-users', key: 'default' },
        [levels.OWNER]: { label: 'Owner', icon: 'fa-solid fa-user', key: 'owner' },
        [levels.OBSERVER]: { label: 'Observer', icon: 'fa-solid fa-eye', key: 'observer' },
        [levels.LIMITED]: { label: 'Limited', icon: 'fa-solid fa-eye-low-vision', key: 'limited' },
        [levels.NONE]: { label: 'None', icon: 'fa-solid fa-ban', key: 'none' }
    };
}

export class DelegationWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        {},
        {
            id: APP_ID,
            classes: ['blacksmith-window-tool', 'blacksmith-delegation-tool-window'],
            position: { width: 560, height: 'auto' },
            window: { title: 'Character Delegation', icon: 'fa-solid fa-people-arrows', resizable: true },
            windowSizeConstraints: { minHeight: 220 }
        }
    );

    /** The single instance, so reopening does not stack windows. */
    static _ref = null;

    static ACTION_HANDLERS = {
        'delegation-cycle': (_event, target, win) => win?._cycle(target?.dataset?.actorId, target?.dataset?.userId),
        'delegation-user': (_event, target, win) => win?._openUser(target?.dataset?.userId),
        'delegation-save': (_event, _target, win) => win?._save(),
        'delegation-reset': (_event, _target, win) => win?._reset()
    };

    _hookContext = `delegation-window:${APP_ID}`;

    // ==============================================================
    // ===== RENDERING ==============================================
    // ==============================================================

    async getData() {
        const esc = foundry.utils.escapeHTML;
        const { players, actors, hasDefaults } = DelegationManager.grid();
        const planned = DelegationManager.resetPlan().length;

        let body;
        if (!players.length || !actors.length) {
            body = `<div class="blacksmith-tool-empty">${players.length ? 'No player characters to delegate yet.' : 'There are no players in this world.'}</div>`;
        } else {
            const info = levelInfo();
            const rows = players.map((player, row) => {
                const face = player.portrait
                    ? `<img class="blacksmith-delegation-avatar" src="${esc(player.portrait)}" alt="">`
                    : '<span class="blacksmith-delegation-avatar is-icon"><i class="fa-solid fa-user"></i></span>';
                const cells = actors.map((actor) => {
                    const cell = actor.cells[row];
                    const now = info[cell.level] ?? info[CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT];
                    const next = info[DelegationManager.nextLevel(cell.level)];
                    const tip = `${player.name} on ${actor.name}${actor.isNpc ? ' (player-owned NPC)' : ''}: ${now.label}. Click for ${next.label}.${cell.changed ? ' Differs from the default.' : ''}`;
                    const portrait = actor.img
                        ? `<img src="${esc(actor.img)}" alt="">`
                        : '<i class="fa-solid fa-user"></i>';
                    return `<button type="button" class="blacksmith-delegation-cell is-${now.key}${cell.changed ? ' is-changed' : ''}" data-action="delegation-cycle" data-actor-id="${esc(actor.id)}" data-user-id="${esc(player.id)}" data-tooltip="${esc(tip)}">${portrait}<span class="blacksmith-delegation-level"><i class="${now.icon}"></i></span></button>`;
                }).join('');
                return `<button type="button" class="blacksmith-delegation-rowhead${player.active ? '' : ' is-offline'}" data-action="delegation-user" data-user-id="${esc(player.id)}" data-tooltip="Open ${esc(player.name)}'s player configuration${player.active ? '' : ' (not connected)'}">${face}<span class="blacksmith-delegation-name">${esc(player.name)}</span></button>${cells}`;
            }).join('');
            body = `<div class="blacksmith-delegation-scroll"><div class="blacksmith-delegation-grid" style="--delegation-cols: ${actors.length}">${rows}</div></div>`;
        }

        const resetTip = !hasDefaults
            ? 'Nothing has been set as the default yet'
            : planned ? `Put ${planned} character${planned === 1 ? '' : 's'} back to the default arrangement` : 'Everything already matches the default';
        return {
            appId: APP_ID,
            bodyContent: `<div class="blacksmith-delegation-body">${body}</div>`,
            toolFooterRight: `<button type="button" class="blacksmith-window-btn-secondary" data-action="delegation-save" data-tooltip="Remember how the characters are shared now as the default arrangement"><i class="fa-solid fa-floppy-disk"></i> Set as Default</button><button type="button" class="blacksmith-window-btn-primary" data-action="delegation-reset" data-tooltip="${esc(resetTip)}"${planned ? '' : ' disabled'}><i class="fa-solid fa-arrow-rotate-left"></i> Reset to Default</button>`
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._followChanges();
    }

    /** Re-render when ownership, the roster or the remembered arrangement changes. Registered once, disposed on close. */
    _followChanges() {
        if (this._following) return;
        this._following = true;
        const refresh = () => {
            if (!this.rendered) return;
            clearTimeout(this._refreshTimer);
            this._refreshTimer = setTimeout(() => this.render(), 120);
        };
        for (const name of ['createActor', 'updateActor', 'deleteActor', 'createUser', 'updateUser', 'deleteUser', 'userConnected']) {
            HookManager.registerHook({
                name,
                description: `Delegation window: refresh on ${name}`,
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
            description: 'Delegation window: refresh when the remembered arrangement changes',
            context: this._hookContext,
            priority: 5,
            callback: (moduleId, settingKey) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (moduleId === MODULE.ID && settingKey === 'delegationDefaults') refresh();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    _onClose(options) {
        clearTimeout(this._refreshTimer);
        HookManager.disposeByContext(this._hookContext);
        this._following = false;
        if (DelegationWindow._ref === this) DelegationWindow._ref = null;
        return super._onClose?.(options);
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    async _cycle(actorId, userId) {
        if (!actorId || !userId) return;
        try {
            await DelegationManager.cycle(actorId, userId);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** Open the player's own configuration (name, avatar, colour, pronouns, assigned character). */
    _openUser(userId) {
        game.users.get(userId)?.sheet?.render({ force: true });
    }

    async _save() {
        try {
            const count = await DelegationManager.saveDefaults();
            ui.notifications?.info(`Default arrangement saved for ${count} character${count === 1 ? '' : 's'}.`);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    async _reset() {
        const planned = DelegationManager.resetPlan().length;
        if (!planned) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Reset to Default' },
            content: `<p>Change ${planned} assignment${planned === 1 ? '' : 's'} back to the default arrangement?</p>`,
            rejectClose: false,
            modal: true
        });
        if (!confirmed) return;
        try {
            await DelegationManager.resetToDefaults();
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
        this.render();
    }

    /** Open the window, reusing the instance if it is already up. GM only. */
    static open() {
        if (!game.user?.isGM) {
            ui.notifications?.warn('Only a GM can change who runs a character.');
            return null;
        }
        DelegationWindow._ref ??= new DelegationWindow();
        DelegationWindow._ref.render(true);
        return DelegationWindow._ref;
    }
}

/** Called from `blacksmith.js` once the window registry exists, as the stage window is. */
export function registerDelegationWindow() {
    registerWindow(APP_ID, {
        moduleId: MODULE.ID,
        title: 'Character Delegation',
        open: () => DelegationWindow.open()
    });
}

export { APP_ID as DELEGATION_WINDOW_ID };
