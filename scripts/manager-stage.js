// ==================================================================
// ===== MANAGER-STAGE: where each player is, and putting them there ==
// ==================================================================
//
// A "stage" is a scene the table is using. When the party splits, the GM needs to see who is on which scene
// and move a person without going through the scenes tab and back to chat each time. This is the data and the
// actions; the panel is window-stage.js. See documentation/plans/plan-stage-manager.md and
// documentation/architecture/architecture-stage-manager.md.
//
// THREE FACTS FROM FOUNDRY SHAPE IT, each checked in the v14 client:
//
//  1. WHERE A PLAYER IS comes from Foundry, not from us. Every client keeps `user.viewedScene` for every user,
//     kept current through the `userActivity` socket event. The panel reads it; it does not track locations.
//  2. A PULL IS NOT REMEMBERED. `Scene#pullUsers` makes a player's client view a scene, but a player who reloads
//     lands on the active scene. So what the GM decided has to be stored (`assignments`) and re-applied when the
//     player loads.
//  3. THE PLAYER APPLIES IT, NOT THE GM. Each player's own client reads the world setting on its first scene
//     draw and views its assigned scene. That needs no GM connected, has no timing race with the player's canvas
//     loading, and is the only client that knows when it is ready. `Scene#view` has no permission check.
//
// The state is one world setting, `stageState`: { assignments: { userId: sceneId }, extras: [sceneId] }.
// `extras` are scenes the GM added to the panel by hand, for a stage nobody is on yet.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

const SETTING = 'stageState';

/** Wait before a player's client applies its assignment, so the first draw has settled. */
const APPLY_DELAY_MS = 400;

export class StageManager {
    static _initialized = false;

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        // Every non-GM client, once, on its first scene draw after load: go where the GM left this player.
        // Once, not on every draw, so a GM who pulls a player somewhere with core's own tools is not undone.
        if (!game.user?.isGM) {
            HookManager.registerHook({
                name: 'canvasReady',
                description: 'Stage manager: go to the scene the GM assigned to this player',
                context: 'stage-manager',
                priority: 4,
                options: { once: true },
                callback: () => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    setTimeout(() => this.applyOwnAssignment(), APPLY_DELAY_MS);
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }
        postConsoleAndNotification(MODULE.NAME, 'Stage manager: initialized', '', true, false);
    }

    // ==============================================================
    // ===== STATE ==================================================
    // ==============================================================

    /** The stored state, always in full shape. */
    static getState() {
        let raw = null;
        try {
            raw = game.settings.get(MODULE.ID, SETTING);
        } catch (_error) {
            raw = null;
        }
        return this.normalizeState(raw);
    }

    /** @param {*} raw @returns {{assignments: Record<string,string>, extras: string[]}} */
    static normalizeState(raw) {
        const assignments = {};
        if (raw?.assignments && typeof raw.assignments === 'object') {
            for (const [userId, sceneId] of Object.entries(raw.assignments)) {
                if (typeof userId === 'string' && typeof sceneId === 'string' && sceneId) assignments[userId] = sceneId;
            }
        }
        const extras = Array.isArray(raw?.extras)
            ? [...new Set(raw.extras.filter((id) => typeof id === 'string' && id))]
            : [];
        return { assignments, extras };
    }

    static async _save(state) {
        await game.settings.set(MODULE.ID, SETTING, this.normalizeState(state));
    }

    /**
     * Record that a user belongs on a scene. State only: no pull, no check that the user exists. Assigning a user to
     * the active scene clears the assignment, since the active scene is where everyone lands anyway.
     */
    static async setAssignment(userId, sceneId) {
        const state = this.getState();
        if (!sceneId || sceneId === game.scenes?.active?.id) delete state.assignments[userId];
        else state.assignments[userId] = sceneId;
        await this._save(state);
    }

    // ==============================================================
    // ===== THE PLAYER'S OWN CLIENT ================================
    // ==============================================================

    /** Go to the scene assigned to this user, if there is one and it is not where they already are. */
    static applyOwnAssignment() {
        const sceneId = this.getState().assignments[game.user?.id];
        const scene = sceneId ? game.scenes.get(sceneId) : null;
        if (!scene || scene.id === canvas.scene?.id) return;
        scene.view();
    }

    // ==============================================================
    // ===== THE GM'S ACTIONS =======================================
    // ==============================================================

    static _requireGM() {
        if (!game.user?.isGM) throw new Error('Only a GM can move players between scenes.');
    }

    /**
     * Put a player on a stage: store it, and pull them there now if they are connected. A GM user cannot be
     * assigned; a GM moves themselves with `viewStage`.
     * @param {string} userId
     * @param {string} sceneId
     */
    static async moveUser(userId, sceneId) {
        this._requireGM();
        const user = game.users.get(userId);
        const scene = game.scenes.get(sceneId);
        if (!user || !scene) throw new Error('Stage manager: unknown player or scene.');
        if (user.isGM) return false;
        await this.setAssignment(user.id, scene.id);
        if (user.active) scene.pullUsers([user]);
        return true;
    }

    /** Forget a player's assignment. They stay where they are until they reload, then land on the active scene. */
    static async releaseUser(userId) {
        this._requireGM();
        await this.setAssignment(userId, null);
    }

    /** Clear every assignment and send every connected player back to the active scene. */
    static async returnEveryone() {
        this._requireGM();
        const state = this.getState();
        state.assignments = {};
        await this._save(state);
        const active = game.scenes.active;
        if (!active) return;
        const players = game.users.filter((u) => u.active && !u.isGM);
        if (players.length) active.pullUsers(players);
    }

    /** The GM looks at a stage. Moves only their own view. */
    static viewStage(sceneId) {
        this._requireGM();
        const scene = game.scenes.get(sceneId);
        if (scene) scene.view();
    }

    static async addStage(sceneId) {
        this._requireGM();
        if (!game.scenes.get(sceneId)) return;
        const state = this.getState();
        if (!state.extras.includes(sceneId)) state.extras.push(sceneId);
        await this._save(state);
    }

    static async removeStage(sceneId) {
        this._requireGM();
        const state = this.getState();
        state.extras = state.extras.filter((id) => id !== sceneId);
        await this._save(state);
    }

    // ==============================================================
    // ===== THE VIEW MODEL =========================================
    // ==============================================================

    /**
     * The stages to show, each with the people on it. A scene is a stage when it is active, when the GM is looking
     * at it, when someone is looking at it, when someone is assigned to it, or when the GM added it by hand.
     * Where a connected person IS comes from Foundry (`viewedScene`); a person who is not connected is shown on
     * the scene they are assigned to, if any.
     */
    static stages() {
        const state = this.getState();
        const activeId = game.scenes.active?.id ?? null;
        const gmViewId = canvas?.scene?.id ?? null;
        const ids = new Set([activeId, gmViewId, ...state.extras, ...Object.values(state.assignments)].filter(Boolean));
        const people = new Map();

        for (const user of game.users) {
            let sceneId = null;
            if (user.active) sceneId = user.viewedScene ?? null;
            else if (state.assignments[user.id]) sceneId = state.assignments[user.id];
            if (!sceneId || !game.scenes.get(sceneId)) continue;
            ids.add(sceneId);
            if (!people.has(sceneId)) people.set(sceneId, []);
            people.get(sceneId).push({
                id: user.id,
                name: user.name,
                isGM: user.isGM,
                active: user.active,
                isSelf: user.id === game.user.id,
                assigned: state.assignments[user.id] === sceneId
            });
        }

        const stages = [];
        for (const id of ids) {
            const scene = game.scenes.get(id);
            if (!scene) continue;
            const combats = game.combats.filter((c) => c.scene?.id === id && c.started).length;
            stages.push({
                id,
                name: scene.navName || scene.name,
                isActive: id === activeId,
                isGMView: id === gmViewId,
                isExtra: state.extras.includes(id),
                combats,
                people: (people.get(id) ?? []).sort((a, b) => Number(b.isGM) - Number(a.isGM) || a.name.localeCompare(b.name))
            });
        }
        return stages.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
    }
}
