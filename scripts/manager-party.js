// ==================================================================
// ===== MANAGER-PARTY – party health, party bar data, shared party logic
// ==================================================================
// Used by party secondary bar (menubar) and any feature that needs
// party-level aggregates (e.g. total HP for a progressbar).
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { getPartyMembers } from './utility-party.js';

export class PartyManager {

    /**
     * Get current and max HP for an actor (D&D 5e style: system.attributes.hp or system.hitPoints).
     * @param {Actor} actor
     * @returns {{ current: number, max: number }}
     */
    static getActorHp(actor) {
        if (!actor?.system) return { current: 0, max: 0 };
        const hp = actor.system.attributes?.hp ?? actor.system.hitPoints;
        if (!hp) return { current: 0, max: 0 };
        const current = Number(hp.value) || 0;
        const max = Number(hp.max) || 1;
        return { current, max };
    }

    /**
     * Get party-wide HP summary: sum of current HP and sum of max HP across all party members (player characters).
     * Used e.g. for party health progressbar (total current / total max = percent).
     * @returns {{ current: number, max: number, percent: number, currentDisplay: string, maxDisplay: string }}
     */
    static getPartyHealthSummary() {
        try {
            const partyMembers = getPartyMembers();
            let current = 0;
            let max = 0;
            for (const actor of partyMembers) {
                const { current: c, max: m } = this.getActorHp(actor);
                current += c;
                max += m;
            }
            const percent = max > 0 ? Math.round((current / max) * 100) : 100;
            return {
                current,
                max,
                percent: Math.min(100, Math.max(0, percent)),
                currentDisplay: String(current),
                maxDisplay: String(max)
            };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'PartyManager: Error getting party health summary', error?.message ?? error, false, true);
            return { current: 0, max: 0, percent: 0, currentDisplay: '0', maxDisplay: '0' };
        }
    }
}
