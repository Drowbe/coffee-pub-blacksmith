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
// The state is one world setting, `stageState`: { assignments: { userId: sceneId }, extras: [sceneId], order: [sceneId],
// statuses: { userId: 'away' | 'dnd' }, hold: sceneId | null, lobby: boolean }.
// `extras` are scenes the GM added to the panel by hand, for a stage nobody is on yet. `order` is the order the GM
// arranged the cards in; a stage that is not in it goes after the ones that are. `statuses` is what the GM marked a
// player as: Away is only a mark, Do Not Disturb keeps this manager from moving or messaging that player. `hold` is
// the scene the GM parks everyone on while preparing. `lobby` is a mode: while it is on, anyone who loads in goes to
// the hold scene.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { deployParty, getPartyMembers, getOwnedNpcs, getPartyActorIdsOnCanvas } from './utility-party.js';

const SETTING = 'stageState';

/** Wait before a player's client applies its assignment, so the first draw has settled. */
const APPLY_DELAY_MS = 400;

/** If no scene has been drawn by now (no active scene, so no `canvasReady`), the load-time move runs anyway. */
const FALLBACK_APPLY_MS = 5000;

/** The statuses a player can be marked with, in the order the chip cycles through them. No status means available. */
export const STAGE_STATUSES = ['away', 'dnd'];

export class StageManager {
    static _initialized = false;

    /** True once this client has run its one load-time move, so the two triggers (canvasReady, the fallback) cannot both. */
    static _applied = false;

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
            // With no active scene nothing is drawn and `canvasReady` never fires, which would leave the lobby (or a hold)
            // unapplied for exactly the table that is parked with no scene running.
            setTimeout(() => this.applyOwnAssignment(), FALLBACK_APPLY_MS);
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

    /** @param {*} raw @returns {{assignments: Record<string,string>, extras: string[], order: string[], statuses: Record<string,string>, hold: string|null, lobby: boolean}} */
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
        const statuses = {};
        if (raw?.statuses && typeof raw.statuses === 'object') {
            for (const [userId, status] of Object.entries(raw.statuses)) {
                if (typeof userId === 'string' && STAGE_STATUSES.includes(status)) statuses[userId] = status;
            }
        }
        const hold = typeof raw?.hold === 'string' && raw.hold ? raw.hold : null;
        return { assignments, extras, order, statuses, hold, lobby: raw?.lobby === true };
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
        this._assign(state, userId, sceneId);
        await this._save(state);
    }

    /** The assignment rule, on a state object that is about to be saved: the active scene (or none) clears the hold. */
    static _assign(state, userId, sceneId) {
        if (!sceneId || sceneId === game.scenes?.active?.id) delete state.assignments[userId];
        else state.assignments[userId] = sceneId;
    }

    // ==============================================================
    // ===== THE PLAYER'S OWN CLIENT ================================
    // ==============================================================

    /**
     * Go to the scene this user belongs on, if it is not where they already are. Once per load. Lobby mode wins over a
     * stored hold: it is a mode the GM turned on for the whole table, and turning it off is how they leave it.
     */
    static applyOwnAssignment() {
        if (this._applied) return;
        this._applied = true;
        if (game.user?.isGM) return;
        const state = this.getState();
        // Do Not Disturb: the GM asked that this player not be moved, and that includes being put back on load.
        if (state.statuses[game.user?.id] === 'dnd') return;
        const sceneId = (state.lobby ? this.holdScene()?.id : null) ?? state.assignments[game.user?.id];
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
     * another GM is left alone. A player on Do Not Disturb is not moved and nothing is stored for them (false).
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
        if (this.statusOf(user.id) === 'dnd') return false;
        await this.setAssignment(user.id, scene.id);
        if (user.active) scene.pullUsers([user]);
        return true;
    }

    /** Forget a player's assignment. They stay where they are until they reload, then land on the active scene. */
    static async releaseUser(userId) {
        this._requireGM();
        await this.setAssignment(userId, null);
    }

    /**
     * Clear every assignment and send every connected player back to the active scene. A player on Do Not Disturb is
     * not pulled.
     * @returns {Promise<{moved: string[], skipped: string[]}>} the names pulled, and the names left alone
     */
    static async returnEveryone() {
        this._requireGM();
        const state = this.getState();
        state.assignments = {};
        await this._save(state);
        const live = game.users.filter((u) => u.active && !u.isGM);
        const skipped = live.filter((u) => state.statuses[u.id] === 'dnd');
        const moving = live.filter((u) => state.statuses[u.id] !== 'dnd');
        const active = game.scenes.active;
        if (active && moving.length) active.pullUsers(moving);
        return { moved: moving.map((u) => u.name), skipped: skipped.map((u) => u.name) };
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
     * the same test the deploy action uses, so what this shows is what deploying would add. Every stage gets the
     * row: a character either has a token on that scene or does not, whoever is looking at it.
     * @param {Scene} scene
     */
    static _tokenStatus(scene) {
        const onScene = getPartyActorIdsOnCanvas(scene);
        // The actor's portrait, always: it is a real picture, where a token's own image can be a wildcard path or
        // top-down art that does not read at this size. Whether the token is there is shown by the dimming.
        const row = (actor) => ({ id: actor.id, name: actor.name, img: actor.img || null, present: onScene.has(actor.id) });
        const actors = getPartyMembers().map(row);
        const npcs = getOwnedNpcs().map(row);
        return { actors, npcs, show: actors.length > 0 || npcs.length > 0 };
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
    // ===== STATUS, HOLD AND SPEAKING ==============================
    // ==============================================================

    /** A player's status: 'away', 'dnd', or null for available. */
    static statusOf(userId) {
        return this.getState().statuses[userId] ?? null;
    }

    /** The status after this one in the cycle the chip runs: available, away, do not disturb, available. */
    static nextStatus(current) {
        const at = STAGE_STATUSES.indexOf(current);
        return at < 0 ? STAGE_STATUSES[0] : (STAGE_STATUSES[at + 1] ?? null);
    }

    /**
     * Mark a player Away or Do Not Disturb, or clear it with null. A GM takes no status.
     * @returns {Promise<boolean>} whether it was stored
     */
    static async setStatus(userId, status) {
        this._requireGM();
        const user = game.users.get(userId);
        if (!user || user.isGM) return false;
        const state = this.getState();
        if (STAGE_STATUSES.includes(status)) state.statuses[userId] = status;
        else delete state.statuses[userId];
        await this._save(state);
        return true;
    }

    /** The hold scene, or null when none is marked or the marked one no longer exists. */
    static holdScene() {
        const id = this.getState().hold;
        return id ? game.scenes.get(id) ?? null : null;
    }

    /** Mark a scene as the hold scene, or clear it with null. */
    static async setHold(sceneId) {
        this._requireGM();
        const state = this.getState();
        state.hold = sceneId && game.scenes.get(sceneId) ? sceneId : null;
        // Lobby mode is about the hold scene, so it cannot outlive it.
        if (!state.hold) state.lobby = false;
        await this._save(state);
    }

    /** Whether lobby mode is on: the switch is set and there is a hold scene for it to send people to. */
    static lobbyOn() {
        return this.getState().lobby && !!this.holdScene();
    }

    /**
     * Turn lobby mode on or off. While it is on, anyone who loads in goes to the hold scene. It moves nobody who is
     * already connected (Hold Everyone does that), and turning it off moves nobody.
     */
    static async setLobby(on) {
        this._requireGM();
        if (on && !this.holdScene()) throw new Error('Stage manager: mark a hold scene first.');
        const state = this.getState();
        state.lobby = !!on;
        await this._save(state);
    }

    /**
     * Park every player on the hold scene: store the assignment for all of them, so a player who reloads comes back to
     * it, and pull the connected ones. A player on Do Not Disturb is left alone. Return Everyone is the way back.
     * @returns {Promise<{moved: string[], skipped: string[]}>} the names held, and the names left alone
     */
    static async holdEveryone() {
        this._requireGM();
        const scene = this.holdScene();
        if (!scene) throw new Error('Stage manager: mark a hold scene first.');
        const state = this.getState();
        const players = game.users.filter((u) => !u.isGM);
        const skipped = players.filter((u) => state.statuses[u.id] === 'dnd');
        const moving = players.filter((u) => state.statuses[u.id] !== 'dnd');
        for (const user of moving) this._assign(state, user.id, scene.id);
        await this._save(state);
        const live = moving.filter((u) => u.active);
        if (live.length) scene.pullUsers(live);
        return { moved: moving.map((u) => u.name), skipped: skipped.map((u) => u.name) };
    }

    /**
     * Who a toast from a stage should go to: the connected players looking at that scene, less anyone on Do Not
     * Disturb. The Send Toast window takes it from there, so the look and the delivery are the toast system's and the
     * GM can still tick anyone else.
     * @returns {{recipients: string[], skipped: string[]}} user ids, and the names left out
     */
    static talkRecipients(sceneId) {
        this._requireGM();
        const state = this.getState();
        const here = game.users.filter((u) => !u.isGM && u.active && u.viewedScene === sceneId);
        return {
            recipients: here.filter((u) => state.statuses[u.id] !== 'dnd').map((u) => u.id),
            skipped: here.filter((u) => state.statuses[u.id] === 'dnd').map((u) => u.name)
        };
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
        const holdId = this.holdScene()?.id ?? null;
        const ids = new Set([activeId, gmViewId, holdId, ...state.extras, ...Object.values(state.assignments)].filter(Boolean));
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
                assigned: state.assignments[user.id] === sceneId,
                status: user.isGM ? null : (state.statuses[user.id] ?? null)
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
                // The scene's own Permissions setting (Scene Configuration, Basics): GM only, or All Players.
                access: (scene.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? 'all' : 'gm',
                isActive: id === activeId,
                isGMView: id === gmViewId,
                isExtra: state.extras.includes(id),
                isHold: id === holdId,
                combats,
                tokens: this._tokenStatus(scene),
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
