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
// The state is one world setting, `stageState`: { assignments: { userId: sceneId }, extras: [sceneId], order: [sceneId] }.
// `extras` are scenes the GM added to the panel by hand, for a stage nobody is on yet. `order` is the order the GM
// arranged the cards in; a stage that is not in it goes after the ones that are.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { deployParty, getPartyMembers, getOwnedNpcs, getPartyActorIdsOnCanvas } from './utility-party.js';

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

    /** @param {*} raw @returns {{assignments: Record<string,string>, extras: string[], order: string[]}} */
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
        const order = Array.isArray(raw?.order)
            ? [...new Set(raw.order.filter((id) => typeof id === 'string' && id))]
            : [];
        return { assignments, extras, order };
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
     * Put a player on a stage: store it, and pull them there now if they are connected. A GM cannot be held
     * anywhere, so dropping the GM's own chip only moves the GM's own view, exactly as `viewStage` does, and
     * another GM is left alone.
     * @param {string} userId
     * @param {string} sceneId
     */
    static async moveUser(userId, sceneId) {
        this._requireGM();
        const user = game.users.get(userId);
        const scene = game.scenes.get(sceneId);
        if (!user || !scene) throw new Error('Stage manager: unknown player or scene.');
        if (user.isGM) {
            if (user.id !== game.user.id) return false;
            scene.view();
            return true;
        }
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

    /**
     * Make a stage the active scene. Foundry then moves everyone to it, as it does from the scene navigation; a
     * player held on another scene stays held and returns there the next time they load.
     */
    static async activateStage(sceneId) {
        this._requireGM();
        const scene = game.scenes.get(sceneId);
        if (scene && !scene.active) await scene.activate();
    }

    /**
     * Deploy ONE actor's token to a stage, with Blacksmith's own deploy action. The scene has to be on the GM's canvas
     * for the placement click, so the GM is taken there first. The formation picker is skipped (one token has no
     * formation): it is placed with a single click.
     * @returns {Promise<Array>} the tokens created
     */
    static async deployActor(sceneId, actorId) {
        this._requireGM();
        const scene = game.scenes.get(sceneId);
        if (!scene || !actorId) return [];
        if (canvas.scene?.id !== scene.id) await scene.view();
        return deployParty({ only: [actorId], pattern: 'sequential' });
    }

    /**
     * The full deploy: Blacksmith's own party deploy for a stage, with its formation picker and its choice to include
     * the player-owned NPCs. The GM is taken to the scene first, as for one actor.
     * @returns {Promise<Array>} the tokens created
     */
    static async deployPartyTo(sceneId) {
        this._requireGM();
        const scene = game.scenes.get(sceneId);
        if (!scene) return [];
        if (canvas.scene?.id !== scene.id) await scene.view();
        return deployParty();
    }

    /**
     * The party's characters and the player-owned NPCs, and whether each has a token on the scene. "Has a token" is
     * the same test the deploy action uses, so what this shows is what deploying would add. The row is shown when a
     * player is on the stage (so the GM can see what is missing for them) or when any of these already has a token
     * there (so the GM can see who is on the map); a stage with neither stays plain.
     * @param {Scene} scene
     * @param {boolean} hasPlayers - Whether a player is on this stage
     */
    static _tokenStatus(scene, hasPlayers) {
        const onScene = getPartyActorIdsOnCanvas(scene);
        // The actor's portrait, always: it is a real picture, where a token's own image can be a wildcard path or
        // top-down art that does not read at this size. Whether the token is there is shown by the dimming.
        const row = (actor) => ({ id: actor.id, name: actor.name, img: actor.img || null, present: onScene.has(actor.id) });
        const actors = getPartyMembers().map(row);
        const npcs = getOwnedNpcs().map(row);
        const anyPresent = [...actors, ...npcs].some((t) => t.present);
        return { actors, npcs, show: (hasPlayers || anyPresent) && (actors.length > 0 || npcs.length > 0) };
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

    /** Save the order the GM arranged the cards in. Stages left out of the list go after the ones in it. */
    static async setOrder(sceneIds) {
        this._requireGM();
        const state = this.getState();
        state.order = Array.isArray(sceneIds) ? sceneIds : [];
        await this._save(state);
    }

    static async removeStage(sceneId) {
        this._requireGM();
        const state = this.getState();
        state.extras = state.extras.filter((id) => id !== sceneId);
        await this._save(state);
    }

    /**
     * Work out which players a drop means. Accepts what the panel's own chips carry (a user id) and what Foundry
     * puts on a drag from its sidebar: a User, an Actor (the player or players who own it), or a Token (its actor's
     * owners). A character assigned to a player wins over plain ownership, so a GM-owned NPC never matches a
     * player just because the GM shares it. Returns players, plus the GM themselves when their own chip is dropped;
     * another GM never matches. An empty list means nothing matched.
     * @param {string} raw - The drop's text/plain payload
     * @returns {User[]}
     */
    static usersFromDrop(raw) {
        if (!raw || typeof raw !== 'string') return [];
        const direct = game.users.get(raw);
        if (direct) return direct.isGM && direct.id !== game.user.id ? [] : [direct];

        let data;
        try {
            data = JSON.parse(raw);
        } catch (_error) {
            return [];
        }
        if (data?.type === 'User') {
            const user = game.users.get(data.id ?? String(data.uuid ?? '').split('.').pop());
            return user && !user.isGM ? [user] : [];
        }
        let actor = null;
        if (data?.type === 'Actor') actor = fromUuidSync(data.uuid ?? '', { strict: false });
        else if (data?.type === 'Token') actor = fromUuidSync(data.uuid ?? '', { strict: false })?.actor ?? null;
        if (!actor) return [];

        const players = game.users.filter((u) => !u.isGM);
        const assigned = players.filter((u) => u.character?.id === actor.id);
        if (assigned.length) return assigned;
        return players.filter((u) => actor.testUserPermission(u, 'OWNER'));
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
                // The character's portrait when they have one, else the user's own avatar; null when neither.
                portrait: user.character?.img || user.avatar || null,
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
                thumb: scene.thumb || null,
                isActive: id === activeId,
                isGMView: id === gmViewId,
                isExtra: state.extras.includes(id),
                combats,
                tokens: this._tokenStatus(scene, (people.get(id) ?? []).some((p) => !p.isGM)),
                people: (people.get(id) ?? []).sort((a, b) => Number(b.isGM) - Number(a.isGM) || a.name.localeCompare(b.name))
            });
        }
        // The GM's own order first. A stage they have not placed yet goes after the placed ones: the active scene
        // first, then by name. (`Infinity - Infinity` is NaN, which is falsy, so ties fall through to those.)
        const rank = (id) => {
            const index = state.order.indexOf(id);
            return index < 0 ? Infinity : index;
        };
        return stages.sort((a, b) => rank(a.id) - rank(b.id)
            || Number(b.isActive) - Number(a.isActive)
            || a.name.localeCompare(b.name));
    }
}
