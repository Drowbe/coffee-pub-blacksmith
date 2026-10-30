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
// favorites: [sceneId], sets: [{ id, name, scenes: [sceneId] }], lobbyScene: sceneId | null, lobby: boolean }.
// `extras` are scenes the GM added to the panel by hand, for a stage nobody is on yet. `order` is the order the GM
// arranged the cards in; a stage that is not in it goes after the ones that are. `favorites` always sort above the
// rest. A set is a named group of scenes the panel can be filtered to; a scene may be in any number of them, and being
// in one puts it on the panel like `extras` does. Whether a player is away is not kept
// here: it is the module's Away status (manager-away.js), shown on the chips and never changing what this manager does.
// `lobbyScene`
// is the scene the GM marked as the waiting room. `lobby` is a mode: while it is on, anyone who loads in goes to the
// lobby scene.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { AwayManager } from './manager-away.js';
import { HookManager } from './manager-hooks.js';
import { ToastAPI } from './api-toast.js';
import { deployParty, getPartyMembers, getOwnedNpcs, getPartyActorIdsOnCanvas } from './utility-party.js';

const SETTING = 'stageState';

/** The longest name a set may have. */
const SET_NAME_MAX = 40;

/** Wait before a player's client applies its assignment, so the rest of `ready` has settled. */
const APPLY_DELAY_MS = 400;

/** If the canvas is still loading when the move is due, try again this often, this many times. */
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 15;

export class StageManager {
    static _initialized = false;

    /** True once this client has run its one load-time move. */
    static _applied = false;

    /** How many times the move has found the canvas still loading. */
    static _attempts = 0;

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        // Every non-GM client, once, as it finishes loading: go where the GM left this player. This runs in `ready`,
        // which Foundry only calls after the first scene draw has finished, so there is no `canvasReady` to wait for (a
        // hook registered now would miss that draw and fire on a later one) and a table with no active scene is covered
        // by the same path. Once, not on every draw, so a GM who pulls a player somewhere with core's own tools is not undone.
        if (!game.user?.isGM) setTimeout(() => this.applyOwnAssignment(), APPLY_DELAY_MS);

        // A player is told when the GM turns lobby mode on while they are connected. Each client reads the stored switch
        // itself, so it needs no socket; the GM, who flipped it, is not toasted.
        if (!game.user?.isGM) {
            this._lobbyWas = this.lobbyOn();
            HookManager.registerSettingChangeCallback({
                description: 'Stage manager: toast a player when lobby mode is turned on',
                context: 'stage-manager-lobby',
                priority: 4,
                callback: (moduleId, settingKey) => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    if (moduleId !== MODULE.ID || settingKey !== 'stageState') return;
                    const on = this.lobbyOn();
                    if (on && !this._lobbyWas) this._toastLobby('The GM has sent everyone to');
                    this._lobbyWas = on;
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

    /** @param {*} raw @returns {{assignments: Record<string,string>, extras: string[], order: string[], favorites: string[], sets: {id: string, name: string, scenes: string[]}[], lobbyScene: string|null, lobby: boolean}} */
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
        const favorites = Array.isArray(raw?.favorites)
            ? [...new Set(raw.favorites.filter((id) => typeof id === 'string' && id))]
            : [];
        const sets = [];
        for (const entry of Array.isArray(raw?.sets) ? raw.sets : []) {
            const id = typeof entry?.id === 'string' ? entry.id : '';
            const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, SET_NAME_MAX) : '';
            if (!id || !name || sets.some((set) => set.id === id)) continue;
            const scenes = Array.isArray(entry.scenes) ? [...new Set(entry.scenes.filter((sceneId) => typeof sceneId === 'string' && sceneId))] : [];
            sets.push({ id, name, scenes });
        }
        const lobbyScene = typeof raw?.lobbyScene === 'string' && raw.lobbyScene ? raw.lobbyScene : null;
        return { assignments, extras, order, favorites, sets, lobbyScene, lobby: raw?.lobby === true };
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
        if (game.user?.isGM) return;
        // `Scene#view` refuses, with a warning, while the canvas is still loading. Wait for it rather than lose the move.
        if (canvas?.loading && this._attempts++ < MAX_ATTEMPTS) {
            setTimeout(() => this.applyOwnAssignment(), RETRY_DELAY_MS);
            return;
        }
        this._applied = true;
        const state = this.getState();
        const lobbyId = state.lobby ? state.lobbyScene : null;
        const sceneId = lobbyId ?? state.assignments[game.user?.id];
        const scene = sceneId ? game.scenes.get(sceneId) : null;
        postConsoleAndNotification(MODULE.NAME, 'Stage manager: load-time move', {
            lobby: state.lobby, lobbyScene: state.lobbyScene, assigned: state.assignments[game.user?.id] ?? null,
            target: sceneId ?? null, visibleToThisPlayer: !!scene, viewing: canvas.scene?.id ?? null
        }, true, false);
        if (lobbyId && scene) this._toastLobby('Lobby mode is on. You are waiting in');
        if (!scene || scene.id === canvas.scene?.id) return;
        scene.view();
    }

    /** Tell this player they are in the lobby. The scene is named by what a player sees for it (navigation name, else name). */
    static _toastLobby(lead) {
        const scene = this.lobbyScene();
        ToastAPI.show({
            title: 'Lobby',
            subtitle: scene ? `${lead} ${scene.navName || scene.name}.` : `${lead} the lobby.`,
            icon: 'fa-solid fa-door-open',
            duration: 8,
            moduleId: MODULE.ID,
            stackKey: 'blacksmith-lobby'
        });
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
     * another GM is left alone (false).
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

    /**
     * Clear every assignment and send every connected player back to the active scene.
     * @returns {Promise<string[]>} the names pulled
     */
    static async returnEveryone() {
        this._requireGM();
        const state = this.getState();
        state.assignments = {};
        await this._save(state);
        const moving = game.users.filter((u) => u.active && !u.isGM);
        const active = game.scenes.active;
        if (active && moving.length) active.pullUsers(moving);
        return moving.map((u) => u.name);
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

    // ==============================================================
    // ===== WHAT A PLAYER SEES =====================================
    // ==============================================================

    /**
     * The scenes a non-GM may use: the active scene, and any scene their Permissions let them see, which is the same
     * test Foundry's own scene navigation applies (`visible`, Limited or better).
     */
    static playerScenes() {
        return game.scenes.filter((scene) => scene.active || scene.visible);
    }

    /**
     * The player's read-only panel: each scene they may use, under the name the navigation shows (the navigation name,
     * else the scene name), with the connected players on it. Everyone may see where the other connected players are,
     * so a scene a player is on that this player cannot use is listed too (`canGo` false): under its name if this
     * client holds the scene, else as "Another scene", since Foundry sends a player only the scenes their Permissions
     * show. Nobody who is not connected is listed, and no holds, tokens or permissions are, since those are the GM's.
     */
    static playerStages() {
        const order = this.getState().order;
        const rank = (id) => {
            const index = order.indexOf(id);
            return index < 0 ? Infinity : index;
        };
        const people = new Map();
        for (const user of game.users) {
            if (user.isGM || !user.active || !user.viewedScene) continue;
            if (!people.has(user.viewedScene)) people.set(user.viewedScene, []);
            people.get(user.viewedScene).push({
                id: user.id,
                name: user.name,
                isSelf: user.id === game.user.id,
                portrait: user.character?.img || user.avatar || null,
                away: AwayManager.get(user.id)
            });
        }
        const viewId = canvas?.scene?.id ?? null;
        const usable = new Set(this.playerScenes().map((scene) => scene.id));
        const ids = new Set([...usable, ...people.keys()]);
        return [...ids].map((id) => {
            const scene = game.scenes.get(id);
            return {
                id,
                name: scene ? (scene.navName || scene.name) : 'Another scene',
                thumb: scene?.thumb || null,
                isActive: !!scene?.active,
                isView: id === viewId,
                canGo: usable.has(id),
                people: (people.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name))
            };
        }).sort((a, b) => rank(a.id) - rank(b.id)
            || Number(b.isActive) - Number(a.isActive)
            || a.name.localeCompare(b.name));
    }

    /** Look at a scene yourself. A player may only look at one they may use; moving anyone else stays the GM's. */
    static viewPermitted(sceneId) {
        const scene = game.scenes.get(sceneId);
        if (!scene || !(game.user.isGM || scene.active || scene.visible)) throw new Error('You cannot use that scene.');
        return scene.view();
    }

    static async addStage(sceneId) {
        this._requireGM();
        if (!game.scenes.get(sceneId)) return;
        const state = this.getState();
        if (!state.extras.includes(sceneId)) state.extras.push(sceneId);
        await this._save(state);
    }

    /**
     * Save the order the GM arranged the cards in. Stages left out of the list go after the ones in it. A panel
     * filtered to a set shows only some of the cards, so the shown ones are written into the places the shown ones
     * already held and every hidden card keeps its place.
     */
    static async setOrder(sceneIds) {
        this._requireGM();
        const state = this.getState();
        const shown = Array.isArray(sceneIds) ? sceneIds : [];
        const visible = new Set(shown);
        const queue = [...shown];
        const merged = [];
        for (const id of state.order) merged.push(visible.has(id) ? queue.shift() : id);
        merged.push(...queue);
        state.order = merged;
        await this._save(state);
    }

    /** Take a scene off the panel: out of the hand-added list, the favorites and every set. */
    static async removeStage(sceneId) {
        this._requireGM();
        const state = this.getState();
        state.extras = state.extras.filter((id) => id !== sceneId);
        state.favorites = state.favorites.filter((id) => id !== sceneId);
        for (const set of state.sets) set.scenes = set.scenes.filter((id) => id !== sceneId);
        await this._save(state);
    }

    /** Pin a scene above the rest of the cards, or let it go back to its place. */
    static async setFavorite(sceneId, favorite) {
        this._requireGM();
        const state = this.getState();
        state.favorites = state.favorites.filter((id) => id !== sceneId);
        if (favorite && game.scenes.get(sceneId)) state.favorites.push(sceneId);
        await this._save(state);
    }

    // ==============================================================
    // ===== SETS ===================================================
    // ==============================================================

    /** The sets, in the order they were made. */
    static sets() {
        return this.getState().sets;
    }

    /**
     * Make a set. A name that is empty or already used (ignoring case) is refused.
     * @returns {Promise<string>} the new set's id
     */
    static async createSet(name) {
        this._requireGM();
        const state = this.getState();
        const clean = this._cleanSetName(state, name);
        const id = foundry.utils.randomID();
        state.sets.push({ id, name: clean, scenes: [] });
        await this._save(state);
        return id;
    }

    static async renameSet(setId, name) {
        this._requireGM();
        const state = this.getState();
        const set = state.sets.find((s) => s.id === setId);
        if (!set) return;
        set.name = this._cleanSetName(state, name, setId);
        await this._save(state);
    }

    /** Delete a set. A scene that was on the panel only because it was in it goes off the panel. */
    static async deleteSet(setId) {
        this._requireGM();
        const state = this.getState();
        state.sets = state.sets.filter((s) => s.id !== setId);
        await this._save(state);
    }

    /** Put a scene in a set, or take it out. A scene may be in any number of sets. */
    static async setInSet(setId, sceneId, member) {
        this._requireGM();
        const state = this.getState();
        const set = state.sets.find((s) => s.id === setId);
        if (!set || !game.scenes.get(sceneId)) return;
        set.scenes = set.scenes.filter((id) => id !== sceneId);
        if (member) set.scenes.push(sceneId);
        await this._save(state);
    }

    /** @throws {Error} when the name is empty or another set already has it */
    static _cleanSetName(state, name, ownId = null) {
        const clean = String(name ?? '').trim().slice(0, SET_NAME_MAX);
        if (!clean) throw new Error('A set needs a name.');
        if (state.sets.some((s) => s.id !== ownId && s.name.toLowerCase() === clean.toLowerCase())) {
            throw new Error(`There is already a set called "${clean}".`);
        }
        return clean;
    }

    /**
     * The world scene a drop carries, or null. Accepts what Foundry puts on a drag of a scene from its sidebar or its
     * scene navigation. A scene in a compendium is not a world scene and is ignored.
     * @param {string} raw - The drop's text/plain payload
     * @returns {Scene|null}
     */
    static sceneFromDrop(raw) {
        if (!raw || typeof raw !== 'string') return null;
        let data;
        try {
            data = JSON.parse(raw);
        } catch (_error) {
            return null;
        }
        if (data?.type !== 'Scene' || typeof data.uuid !== 'string' || !data.uuid.startsWith('Scene.')) return null;
        return game.scenes.get(data.uuid.slice('Scene.'.length)) ?? null;
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
    // ===== LOBBY AND SPEAKING =====================================
    // ==============================================================

    /** The lobby scene, or null when none is marked or the marked one no longer exists. */
    static lobbyScene() {
        const id = this.getState().lobbyScene;
        return id ? game.scenes.get(id) ?? null : null;
    }

    /** Mark a scene as the lobby scene, or clear it with null. */
    static async setLobbyScene(sceneId) {
        this._requireGM();
        const state = this.getState();
        state.lobbyScene = sceneId && game.scenes.get(sceneId) ? sceneId : null;
        // Lobby mode is about the lobby scene, so it cannot outlive it.
        if (!state.lobbyScene) state.lobby = false;
        await this._save(state);
    }

    /** Whether lobby mode is on: the switch is set and there is a lobby scene for it to send people to. */
    static lobbyOn() {
        return this.getState().lobby && !!this.lobbyScene();
    }

    /**
     * Turn lobby mode on or off. While it is on, anyone who loads in goes to the lobby scene, and turning it on
     * sends the players connected now there too. Turning it off lets them out: each connected player goes to the
     * scene they are held on, else to the active scene. `release: false` skips that, for a caller about to activate a
     * scene, which pulls everyone itself.
     */
    static async setLobby(on, { release = true } = {}) {
        this._requireGM();
        if (on && !this.lobbyScene()) throw new Error('Stage manager: mark a lobby scene first.');
        const state = this.getState();
        state.lobby = !!on;
        await this._save(state);
        // Switching it on also sends the connected players there now; people who load in later are caught by
        // applyOwnAssignment. Nothing is held by it, so switching it off sends each player where they would have gone
        // without it: their own hold, else the active scene.
        const players = game.users.filter((u) => u.active && !u.isGM);
        if (on) {
            if (players.length) this.lobbyScene().pullUsers(players);
        } else if (release) {
            const byScene = new Map();
            for (const user of players) {
                const held = game.scenes.get(state.assignments[user.id]);
                const scene = held ?? game.scenes.active;
                if (!scene) continue;
                if (!byScene.has(scene)) byScene.set(scene, []);
                byScene.get(scene).push(user);
            }
            for (const [scene, users] of byScene) scene.pullUsers(users);
        }
    }

    /**
     * Who a toast from a stage should go to: the connected players looking at that scene. The Send Toast window takes
     * it from there, so the look and the delivery are the toast system's and the GM can still tick anyone else.
     * @returns {string[]} user ids
     */
    static talkRecipients(sceneId) {
        this._requireGM();
        return game.users.filter((u) => !u.isGM && u.active && u.viewedScene === sceneId).map((u) => u.id);
    }

    // ==============================================================
    // ===== THE VIEW MODEL =========================================
    // ==============================================================

    /**
     * The stages to show, each with the people on it. A scene is a stage when it is active, when the GM is looking
     * at it, when someone is looking at it, when someone is assigned to it, when the GM added it by hand, or when it
     * is in a set. Favorites come first. With a `setId` only that set's scenes are shown, and any scene with people on it.
     * Where a connected person IS comes from Foundry (`viewedScene`); a person who is not connected is shown on
     * the scene they are assigned to, if any.
     */
    static stages({ setId = null } = {}) {
        const state = this.getState();
        const filter = setId ? state.sets.find((set) => set.id === setId) ?? null : null;
        const activeId = game.scenes.active?.id ?? null;
        const gmViewId = canvas?.scene?.id ?? null;
        const lobbyId = this.lobbyScene()?.id ?? null;
        const ids = new Set([activeId, gmViewId, lobbyId, ...state.extras, ...state.sets.flatMap((set) => set.scenes), ...Object.values(state.assignments)].filter(Boolean));
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
                away: AwayManager.get(user.id)
            });
        }

        const stages = [];
        for (const id of ids) {
            const scene = game.scenes.get(id);
            if (!scene) continue;
            // Filtered to a set: that set's scenes, and any scene somebody is on so nobody drops out of sight.
            if (filter && !filter.scenes.includes(id) && !people.get(id)?.length) continue;
            const combats = game.combats.filter((c) => c.scene?.id === id && c.started).length;
            stages.push({
                id,
                name: scene.name,
                navName: scene.navName || '',
                thumb: scene.thumb || null,
                // The scene's own Permissions setting (Scene Configuration, Basics): GM only, or All Players.
                access: (scene.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? 'all' : 'gm',
                isActive: id === activeId,
                isGMView: id === gmViewId,
                isExtra: state.extras.includes(id),
                isFavorite: state.favorites.includes(id),
                sets: state.sets.filter((set) => set.scenes.includes(id)).map((set) => set.id),
                isLobby: id === lobbyId,
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
        return stages.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)
            || rank(a.id) - rank(b.id)
            || Number(b.isActive) - Number(a.isActive)
            || a.name.localeCompare(b.name));
    }
}
