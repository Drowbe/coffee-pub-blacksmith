// ==================================================================
// ===== MANAGER-ENCOUNTER – CR calculation, reveal, shared encounter logic
// ==================================================================
// Used by encounter toolbar (journal) and Encounter menubar tool.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

export class EncounterManager {
    /**
     * Get party CR from current scene (player character tokens).
     * @returns {string} Formatted CR string (e.g. "63", "1/2")
     */
    static getPartyCR() {
        try {
            if (!canvas?.tokens?.placeables) return '0';
            const playerTokens = canvas.tokens.placeables.filter(
                (token) => token.actor && token.actor.type === 'character' && token.actor.hasPlayerOwner
            );
            if (playerTokens.length === 0) return '0';

            let totalLevel1to4 = 0;
            let totalLevel5to10 = 0;
            let totalLevel11to16 = 0;
            let totalLevel17to20 = 0;

            for (const token of playerTokens) {
                const level = token.actor.system?.details?.level || 1;
                if (level >= 1 && level <= 4) totalLevel1to4 += level;
                else if (level >= 5 && level <= 10) totalLevel5to10 += level;
                else if (level >= 11 && level <= 16) totalLevel11to16 += level;
                else if (level >= 17 && level <= 20) totalLevel17to20 += level;
            }

            const partyLevel =
                totalLevel1to4 / 4 +
                totalLevel5to10 / 2 +
                totalLevel11to16 * 0.75 +
                totalLevel17to20;
            const partyCR = Math.max(1, Math.floor(partyLevel));
            return this.formatCR(partyCR);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'EncounterManager: Error calculating party CR', error?.message ?? error, false, true);
            return '0';
        }
    }

    /**
     * Get monster CR from current scene NPC tokens (or from metadata if provided).
     * @param {Object} [metadata] - Optional { monsters: uuid[], npcs: uuid[] }; if omitted, uses canvas tokens only.
     * @returns {string} Formatted CR string
     */
    static getMonsterCR(metadata = {}) {
        try {
            if (!canvas?.tokens?.placeables) return '0';
            const monsterTokens = canvas.tokens.placeables.filter(
                (token) => token.actor && token.actor.type === 'npc' && !token.actor.hasPlayerOwner
            );
            if (monsterTokens.length === 0) return '0';

            let totalCR = 0;
            let monsterCount = 0;

            for (const token of monsterTokens) {
                try {
                    const actor = token.actor;
                    if (actor?.system) {
                        const crValue = parseFloat(actor.system.details?.cr);
                        if (!Number.isNaN(crValue)) {
                            totalCR += crValue;
                            monsterCount++;
                        }
                    }
                } catch {
                    // skip
                }
            }

            if (monsterCount === 0) return '0';
            return this.formatCR(totalCR);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'EncounterManager: Error calculating monster CR', error?.message ?? error, false, true);
            return '0';
        }
    }

    /**
     * Calculate difficulty from party CR and monster CR (same formula as encounter config).
     * @param {number} partyCR
     * @param {number} monsterCR
     * @returns {{ difficulty: string, difficultyClass: string }}
     */
    static calculateEncounterDifficulty(partyCR, monsterCR) {
        if (partyCR <= 0 || monsterCR <= 0) return { difficulty: 'None', difficultyClass: 'none' };
        const ratio = monsterCR / partyCR;
        if (ratio <= 0) return { difficulty: 'None', difficultyClass: 'none' };
        if (ratio < 0.25) return { difficulty: 'Trivial', difficultyClass: 'trivial' };
        if (ratio < 0.5) return { difficulty: 'Easy', difficultyClass: 'easy' };
        if (ratio < 1.0) return { difficulty: 'Moderate', difficultyClass: 'medium' };
        if (ratio < 1.5) return { difficulty: 'Hard', difficultyClass: 'hard' };
        if (ratio < 2.25) return { difficulty: 'Deadly', difficultyClass: 'deadly' };
        return { difficulty: 'Impossible', difficultyClass: 'impossible' };
    }

    /**
     * Full combat assessment for current canvas (party CR, monster CR, difficulty).
     * @param {Object} [metadata] - Optional encounter metadata for getMonsterCR
     * @returns {{ partyCR: number, monsterCR: number, partyCRDisplay: string, monsterCRDisplay: string, difficulty: string, difficultyClass: string }}
     */
    static getCombatAssessment(metadata = {}) {
        const partyCRDisplay = this.getPartyCR();
        const monsterCRDisplay = this.getMonsterCR(metadata);
        const partyCR = this.parseCR(partyCRDisplay);
        const monsterCR = this.parseCR(monsterCRDisplay);
        const { difficulty, difficultyClass } = this.calculateEncounterDifficulty(partyCR, monsterCR);
        return {
            partyCR,
            monsterCR,
            partyCRDisplay,
            monsterCRDisplay,
            difficulty,
            difficultyClass
        };
    }

    static parseCR(crString) {
        if (crString === '0') return 0;
        if (crString === '1/8') return 0.125;
        if (crString === '1/4') return 0.25;
        if (crString === '1/2') return 0.5;
        return parseFloat(crString) || 0;
    }

    static formatCR(cr) {
        if (cr === 0) return '0';
        if (cr > 0 && cr < 0.125) return '1/8';
        const crValues = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
        return crValues[cr] ?? String(Math.round(cr));
    }

    /**
     * Reveal hidden hostile NPC tokens on the current scene (Reveal button action).
     * GM only.
     */
    static async revealHiddenTokens() {
        if (!game.user?.isGM) return;
        try {
            const allTokens = canvas?.tokens?.placeables ?? [];
            if (allTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, 'No tokens found on the canvas.', '', false, false);
                return;
            }
            const hiddenMonsterTokens = allTokens.filter(
                (token) =>
                    token.actor?.type === 'npc' &&
                    token.document.hidden === true &&
                    token.document.disposition <= -1
            );
            if (hiddenMonsterTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, 'No hidden hostile tokens found on the canvas.', '', false, false);
                return;
            }
            for (const token of hiddenMonsterTokens) {
                await token.document.update({ hidden: false });
            }
            postConsoleAndNotification(MODULE.NAME, 'Reveal: made tokens visible', `${hiddenMonsterTokens.length} token(s)`, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'EncounterManager: Error revealing tokens', error?.message ?? error, false, true);
        }
    }
}
