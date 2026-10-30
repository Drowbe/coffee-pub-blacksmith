// ==================================================================
// ===== MANAGER-DELEGATION: who runs which character ==============
// ==================================================================
//
// When a player misses a session, someone else runs their character. In Foundry that is one thing: the delegate
// is given Owner on the actor. This is the data and the actions; the grid is window-delegation.js. See
// documentation/architecture/architecture-delegation.md.
//
// OWNERSHIP IS THE ONLY TRUTH. A cell in the grid is one player's level on one actor, read straight from
// `actor.ownership`. A player with no entry of their own is on INHERIT, which is "Default" in an actor's ownership
// dropdown: what they can do falls back to the actor's Default level. Nothing is kept beside ownership that could
// disagree with it, apart from one remembered arrangement (`delegationDefaults`), which is only what Reset returns to.
//
// The remembered arrangement is one world setting: { [actorId]: { [userId]: level } }, holding only the players who
// were NOT on Default for that actor when the GM pressed Set as Default. An actor with no entry has never been saved
// and Reset leaves it alone; an actor saved with an empty object means "everyone on Default".

import { MODULE } from './const.js';
import { getPartyMembers, getOwnedNpcs } from './utility-party.js';

const SETTING = 'delegationDefaults';

/**
 * The levels a click steps through, in order, and back to the start. Default first, then Owner, because handing a
 * character over is the thing this window is for: one click from Default is Owner, and the rest of the ring is there
 * for the cases where a player should watch but not run.
 */
function levelRing() {
    const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    return [levels.INHERIT, levels.OWNER, levels.OBSERVER, levels.LIMITED, levels.NONE];
}

export class DelegationManager {

    // ==============================================================
    // ===== THE GRID ===============================================
    // ==============================================================

    /** The players: every user who is not a GM, in name order. */
    static players() {
        return game.users.filter((user) => !user.isGM).sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * The characters to delegate: the party's player characters, then the NPCs players own (familiars, summons,
     * companions). Group actors are never listed: they are routinely owned by everyone.
     */
    static actors() {
        return [...getPartyMembers(), ...getOwnedNpcs()];
    }

    /** A player's own level on an actor: Foundry's number, with no entry (or INHERIT) read as INHERIT. */
    static level(actor, userId) {
        const value = actor?.ownership?.[userId];
        return typeof value === 'number' ? value : CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
    }

    /** True when the user has Owner on the actor in their own right (not by Default, and not as a GM). */
    static owns(actor, userId) {
        return this.level(actor, userId) === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }

    /** The level a click moves to from `level`. A level outside the ring (a stale value) starts the ring again. */
    static nextLevel(level) {
        const ring = levelRing();
        const at = ring.indexOf(level);
        return ring[(at + 1) % ring.length];
    }

    /**
     * The remembered arrangement: `{ actorId: { userId: level } }`, or an empty object when none was ever saved. The
     * first build stored `{ actorId: [userId] }` (owners only); that is read as Owner for each.
     */
    static getDefaults() {
        let raw = null;
        try {
            raw = game.settings.get(MODULE.ID, SETTING);
        } catch (_error) {
            raw = null;
        }
        const valid = new Set(Object.values(CONST.DOCUMENT_OWNERSHIP_LEVELS));
        const out = {};
        for (const [actorId, entry] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
            if (typeof actorId !== 'string') continue;
            if (Array.isArray(entry)) {
                out[actorId] = Object.fromEntries(entry.filter((id) => typeof id === 'string' && id).map((id) => [id, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER]));
            } else if (entry && typeof entry === 'object') {
                out[actorId] = Object.fromEntries(Object.entries(entry).filter(([id, level]) => id && valid.has(level) && level !== CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT));
            }
        }
        return out;
    }

    /** The level the remembered arrangement gives a player on an actor (INHERIT when it says nothing). */
    static _remembered(defaults, actorId, userId) {
        return defaults[actorId]?.[userId] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
    }

    /**
     * The grid view model: the players, the characters, and for every pair the player's level on the character and
     * whether that differs from the remembered arrangement (a delegation in force, when there is one to compare with).
     */
    static grid() {
        const defaults = this.getDefaults();
        const players = this.players().map((user) => ({
            id: user.id,
            name: user.name,
            active: user.active,
            portrait: user.character?.img || user.avatar || null
        }));
        const actors = this.actors().map((actor) => {
            const remembered = Object.hasOwn(defaults, actor.id);
            return {
                id: actor.id,
                name: actor.name,
                img: actor.img || null,
                isNpc: actor.type !== 'character',
                remembered,
                cells: players.map((player) => {
                    const level = this.level(actor, player.id);
                    return {
                        userId: player.id,
                        level,
                        owns: level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
                        changed: remembered && level !== this._remembered(defaults, actor.id, player.id)
                    };
                })
            };
        });
        return { players, actors, hasDefaults: Object.keys(defaults).length > 0 };
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    /** Only a GM changes who owns what. */
    static _requireGM() {
        if (!game.user?.isGM) throw new Error('Only a GM can change who runs a character.');
    }

    /**
     * Set a player's level on a character. INHERIT puts them back on the actor's Default ownership. Does nothing when
     * it already is so.
     * @returns {Promise<boolean>} whether anything was written
     */
    static async setLevel(actorId, userId, level) {
        this._requireGM();
        const actor = game.actors.get(actorId);
        const user = game.users.get(userId);
        if (!actor || !user || user.isGM) return false;
        if (this.level(actor, userId) === level) return false;
        await actor.update({ [`ownership.${userId}`]: level });
        return true;
    }

    /** One click: move the cell to the next level in the ring. */
    static async cycle(actorId, userId) {
        const actor = game.actors.get(actorId);
        if (!actor) return false;
        return this.setLevel(actorId, userId, this.nextLevel(this.level(actor, userId)));
    }

    /** Remember how every listed character is shared right now. Replaces what was remembered. */
    static async saveDefaults() {
        this._requireGM();
        const players = this.players();
        const inherit = CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
        const saved = {};
        for (const actor of this.actors()) {
            saved[actor.id] = {};
            for (const player of players) {
                const level = this.level(actor, player.id);
                if (level !== inherit) saved[actor.id][player.id] = level;
            }
        }
        await game.settings.set(MODULE.ID, SETTING, saved);
        return Object.keys(saved).length;
    }

    /**
     * What Reset would write: one entry per cell that differs from the remembered arrangement. A character with
     * nothing remembered is left alone.
     * @returns {{actorId: string, userId: string, level: number}[]}
     */
    static resetPlan() {
        const defaults = this.getDefaults();
        const players = this.players();
        const plan = [];
        for (const actor of this.actors()) {
            if (!Object.hasOwn(defaults, actor.id)) continue;
            for (const player of players) {
                const want = this._remembered(defaults, actor.id, player.id);
                if (this.level(actor, player.id) !== want) plan.push({ actorId: actor.id, userId: player.id, level: want });
            }
        }
        return plan;
    }

    /**
     * Put every character back to the remembered arrangement, one update per actor.
     * @returns {Promise<number>} how many cells changed
     */
    static async resetToDefaults() {
        this._requireGM();
        const plan = this.resetPlan();
        const byActor = new Map();
        for (const step of plan) {
            if (!byActor.has(step.actorId)) byActor.set(step.actorId, {});
            byActor.get(step.actorId)[`ownership.${step.userId}`] = step.level;
        }
        for (const [actorId, update] of byActor) await game.actors.get(actorId)?.update(update);
        return plan.length;
    }
}
