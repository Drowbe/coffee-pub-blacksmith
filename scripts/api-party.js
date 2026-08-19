// ==================================================================
// ===== API-PARTY.JS ===============================================
// ==================================================================
// Who counts as the party. Two answers, not one, because the question
// has two forms and modules were quietly disagreeing about which they
// meant.
//
// The FACT belongs to the hub; the BEHAVIOUR belongs to each module.
// This exposes the rosters and decides nothing about what a consumer
// does with them.
//
// See documentation/api/api-party.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * The primary party actor, or null when a world has not set one.
 * @returns {Actor|null}
 */
function actor() {
    return game.actors?.party ?? null;
}

/**
 * Every member that can rest: the party's creatures.
 *
 * `system.creatures` is the party's own answer (`dnd5e.mjs:72635`) and is precisely who dnd5e
 * offers on its own party rest. It INCLUDES NPC members - a familiar, a companion, a hired hand
 * travelling with the group rests with the group. It excludes the party actor itself, because a
 * group is not a creature.
 *
 * @returns {Array<Actor>}
 */
function resting() {
    const fromParty = actor()?.system?.creatures ?? [];
    if (fromParty.length) return [...fromParty];
    return _fallback((candidate) => candidate?.system?.isCreature);
}

/**
 * Every member that can act on their own behalf: the party's player characters.
 *
 * `system.playerCharacters` (`dnd5e.mjs:72655`) filters on `system.isCharacter`, so it EXCLUDES the
 * NPC members `resting()` includes. That difference is the entire reason both exist: a familiar
 * rests with the party and cannot buy a sword.
 *
 * @returns {Array<Actor>}
 */
function acting() {
    const fromParty = actor()?.system?.playerCharacters ?? [];
    if (fromParty.length) return [...fromParty];
    return _fallback((candidate) => candidate?.system?.isCharacter);
}

/**
 * Whether either roster is coming from a curated primary party rather than from the fallback.
 * Worth surfacing in a GM-facing window: "no primary party set" explains an odd roster better
 * than the roster does.
 * @returns {boolean}
 */
function hasPrimaryParty() {
    const party = actor();
    return Boolean(party?.system?.creatures?.length || party?.system?.playerCharacters?.length);
}

/**
 * Every player-owned actor passing a test, used when no primary party is set.
 *
 * A world that has not curated a party still needs a usable answer rather than an empty one, and
 * "player-owned" is the only signal available without one. This is the part every consumer
 * reinvents slightly differently, which is most of why it is here.
 *
 * @param {Function} test - (actor) => boolean
 * @returns {Array<Actor>}
 */
function _fallback(test) {
    try {
        return (game.actors?.contents ?? []).filter((candidate) => candidate?.hasPlayerOwner && test(candidate));
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Party: fallback roster failed', error, false, false);
        return [];
    }
}

const PartyAPI = {
    actor,
    resting,
    acting,
    hasPrimaryParty
};

export { PartyAPI, actor, resting, acting, hasPrimaryParty };
