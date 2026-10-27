// ==================================================================
// ===== MANAGER-AWAY: a player has stepped away from the table ======
// ==================================================================
//
// "Away" is a fact about a person at the table, so it belongs to the module and not to any one window. It is a flag on
// the person's own User document, `flags.coffee-pub-blacksmith.away = { since, message }`, and absent when they are
// back. A player can update their own user and every client already receives user updates, so setting it needs no
// socket and no GM connected, which a world setting could not give (a player cannot write one).
//
// What reacts to it, each from `updateUser` on its own client: the menubar icon (the person's own status), the toast
// that tells everyone present, the Stage Manager chips, and the `blacksmith.away.changed` hook for other modules.
// It is only a mark and a message: nothing here stops anyone being moved, toasted or asked for a roll. A consumer that
// needs a person's input reads `api.away` and decides what to do about an absent one.
//
// See documentation/plans/plan-away-status.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { ToastAPI } from './api-toast.js';
import { UIContextMenu } from './ui-context-menu.js';
import { MenuBar } from './api-menubar.js';

const FLAG = 'away';
const TOOL_ID = 'away-status';
const MENU_ID = 'blacksmith-away-menu';
const MAX_MESSAGE = 200;

const ICON_AWAY = 'fa-solid fa-user-clock';
const ICON_AVAILABLE = 'fa-solid fa-user-check';
const COLOR_AWAY = 'var(--blacksmith-color-brand-accent)';

export class AwayManager {
    static _initialized = false;

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        HookManager.registerHook({
            name: 'updateUser',
            description: 'Away: react when a user goes away, changes the message, or comes back',
            context: 'away',
            priority: 3,
            callback: (user, changes) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                const mine = changes?.flags?.[MODULE.ID];
                if (!mine || !(FLAG in mine || `-=${FLAG}` in mine)) return;
                this._onChanged(user);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
        postConsoleAndNotification(MODULE.NAME, 'Away: initialized', '', true, false);
    }

    // ==============================================================
    // ===== READ ===================================================
    // ==============================================================

    /** A user's away state, or null when they are available. */
    static get(userId) {
        const raw = game.users?.get(userId)?.getFlag(MODULE.ID, FLAG);
        if (!raw || typeof raw !== 'object') return null;
        return { since: Number(raw.since) || 0, message: typeof raw.message === 'string' ? raw.message : '' };
    }

    static isAway(userId) {
        return !!this.get(userId);
    }

    /** Every user with where they stand: `{ userId, name, isGM, active, away }`, away being null when available. */
    static list() {
        return game.users.map((user) => ({
            userId: user.id, name: user.name, isGM: user.isGM, active: user.active, away: this.get(user.id)
        }));
    }

    // ==============================================================
    // ===== WRITE ==================================================
    // ==============================================================

    /** A person may change their own status, and a GM may change anyone's. */
    static _requireEditable(userId) {
        const user = game.users?.get(userId);
        if (!user) throw new Error('Away: unknown user.');
        if (!game.user?.isGM && userId !== game.user?.id) throw new Error('Away: you can only change your own status.');
        return user;
    }

    /**
     * Mark a user away, with an optional message. Setting it again replaces the message.
     * @param {string} userId
     * @param {{message?: string}} [options]
     */
    static async set(userId, { message = '' } = {}) {
        const user = this._requireEditable(userId);
        await user.setFlag(MODULE.ID, FLAG, { since: Date.now(), message: String(message ?? '').trim().slice(0, MAX_MESSAGE) });
    }

    /** Mark a user back. @returns {Promise<boolean>} false when they were not away. */
    static async clear(userId) {
        const user = this._requireEditable(userId);
        if (!this.isAway(userId)) return false;
        await user.unsetFlag(MODULE.ID, FLAG);
        return true;
    }

    // ==============================================================
    // ===== REACTIONS ==============================================
    // ==============================================================

    /** One user's status changed: tell this client's own surfaces, and tell other modules. */
    static _onChanged(user) {
        const state = this.get(user.id);
        Hooks.callAll('blacksmith.away.changed', {
            userId: user.id, away: !!state, message: state?.message ?? '', since: state?.since ?? null
        });

        if (user.id === game.user.id) {
            MenuBar.updateMenubarToolIconColor(TOOL_ID, state ? COLOR_AWAY : null);
        }

        // Everyone present hears that someone has gone away. Coming back is shown by the indicators, not announced.
        if (!state) return;
        ToastAPI.show({
            title: user.id === game.user.id ? 'You are away' : `${user.name} is away`,
            subtitle: state.message,
            icon: ICON_AWAY,
            duration: 6,
            moduleId: 'blacksmith-core',
            stackKey: `blacksmith-away-${user.id}`
        });
    }

    // ==============================================================
    // ===== THE MENUBAR ICON =======================================
    // ==============================================================

    /** The icon beside the Stage Manager: it shows this person's own status, and opens the party's. */
    static registerMenubarTool() {
        const mine = () => this.get(game.user.id);
        MenuBar.registerMenubarTool(TOOL_ID, {
            icon: () => (mine() ? ICON_AWAY : ICON_AVAILABLE),
            name: TOOL_ID,
            title: null,
            tooltip: () => (mine() ? `You are away${mine().message ? `: ${mine().message}` : ''}. Click to change` : 'You are available. Click to see the party and set your status'),
            iconColor: mine() ? COLOR_AWAY : null,
            onClick: (event) => this._openMenu(event),
            zone: 'left',
            group: 'general',
            order: 211,
            moduleId: MODULE.ID,
            gmOnly: false,
            leaderOnly: false,
            visible: true
        });
    }

    /** The party and where each connected person stands, then the three things this person can set. */
    static _menuItems() {
        const me = game.user.id;
        const mine = this.get(me);
        const people = this.list().filter((row) => row.active).map((row) => ({
            information: true,
            icon: row.away ? ICON_AWAY : ICON_AVAILABLE,
            name: row.userId === me ? `${row.name} (you)` : row.name,
            description: row.away ? (row.away.message ? `Away: ${row.away.message}` : 'Away') : 'Available'
        }));
        return [
            ...people,
            { separator: true },
            { name: 'Available', icon: ICON_AVAILABLE, description: mine ? '' : 'Your status', callback: () => this._run(() => this.clear(me)) },
            { name: 'Away', icon: ICON_AWAY, description: mine && !mine.message ? 'Your status' : '', callback: () => this._run(() => this.set(me)) },
            { name: 'Away with a message...', icon: 'fa-solid fa-comment-dots', description: mine?.message ? 'Your status' : '', callback: () => this._run(() => this._promptAway()) }
        ];
    }

    static _openMenu(event) {
        const button = event?.target?.closest?.('[data-tool-id]');
        const rect = button?.getBoundingClientRect();
        UIContextMenu.show({
            id: MENU_ID,
            x: rect ? rect.left : (event?.clientX ?? 0),
            y: rect ? rect.bottom + 4 : (event?.clientY ?? 0),
            zones: this._menuItems(),
            zoneClass: 'core',
            maxWidth: 320
        });
    }

    static async _promptAway() {
        const message = await foundry.applications.api.DialogV2.prompt({
            window: { title: 'Away', icon: ICON_AWAY },
            content: '<div class="form-group"><label>Message</label><div class="form-fields"><input type="text" name="message" maxlength="200" placeholder="Back in ten minutes" autofocus></div></div>',
            ok: {
                label: 'Go away',
                icon: ICON_AWAY,
                callback: (_event, button) => button.form.elements.message.value
            },
            rejectClose: false,
            modal: true
        });
        if (typeof message !== 'string') return;
        await this.set(game.user.id, { message });
    }

    /** A menu click that fails says so, rather than failing silently. */
    static async _run(action) {
        try {
            await action();
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
    }
}

/** The public surface, bound as `api.away`. Everything on AwayManager that starts with an underscore is private. */
export const AwayAPI = Object.freeze({
    get: (userId) => AwayManager.get(userId),
    isAway: (userId) => AwayManager.isAway(userId),
    list: () => AwayManager.list(),
    set: (userId, options) => AwayManager.set(userId, options),
    clear: (userId) => AwayManager.clear(userId)
});
