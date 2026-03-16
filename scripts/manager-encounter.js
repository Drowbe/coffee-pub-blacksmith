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

    /**
     * Border color for difficulty badge styling (matches menubar CSS).
     * @param {string} difficultyClass - 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly' | 'impossible' | 'none'
     * @returns {string} CSS color
     */
    static getDifficultyBorderColor(difficultyClass) {
        const colors = {
            trivial: '#6b8e6b',
            easy: '#7cba7c',
            medium: '#c9a227',
            hard: '#c95827',
            deadly: '#a02020',
            impossible: '#4a0a0a',
            none: 'rgba(255, 255, 255, 0.2)'
        };
        return colors[difficultyClass] ?? colors.none;
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
     * Reveal hidden NPC tokens on the current scene (Reveal button action).
     * Updates token documents so tokens become visible on the canvas for all clients. GM only.
     */
    static async revealHiddenTokens() {
        if (!game.user?.isGM) return;
        try {
            const scene = canvas?.scene;
            if (!scene) {
                postConsoleAndNotification(MODULE.NAME, 'No active scene.', '', false, false);
                return;
            }
            const allTokens = canvas?.tokens?.placeables ?? [];
            if (allTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, 'No tokens found on the canvas.', '', false, false);
                return;
            }
            // Include any hidden token that is not player-owned (NPCs and unowned actors); disposition not required
            const hiddenMonsterTokens = allTokens.filter(
                (token) =>
                    token.document.hidden === true &&
                    (!token.actor || !token.actor.hasPlayerOwner)
            );
            if (hiddenMonsterTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, 'No hidden NPC tokens found on the canvas.', '', false, false);
                return;
            }
            // Update via scene so the canvas and all clients receive the change; tokens become visible on the canvas
            const updates = hiddenMonsterTokens.map((token) => ({
                _id: token.document.id,
                hidden: false
            }));
            await scene.updateEmbeddedDocuments('Token', updates);
            // Refresh token placeables so the canvas re-renders visibility immediately
            for (const token of hiddenMonsterTokens) {
                if (typeof token.refresh === 'function') token.refresh();
            }
            postConsoleAndNotification(MODULE.NAME, 'Reveal: made tokens visible', `${hiddenMonsterTokens.length} token(s)`, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'EncounterManager: Error revealing tokens', error?.message ?? error, false, true);
        }
    }

    /**
     * Remove from the current scene all NPC tokens that are "monsters" (non-humanoid).
     * Humanoid NPCs (e.g. merchants, guards) are left on the canvas. GM only.
     * D&D 5e: creature type is actor.system.details.type.value (or details.creatureType).
     * If creature type is missing, the token is not removed (safe default).
     * @returns {Promise<number>} Number of tokens removed
     */
    static async clearMonstersFromCanvas() {
        if (!game.user?.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'Clear Monsters: Only GMs can clear monster tokens', '', false, false);
            return 0;
        }
        const scene = canvas?.scene;
        if (!scene) {
            ui.notifications.warn('No active scene.');
            return 0;
        }
        const humanoidType = 'humanoid';
        const toRemove = scene.tokens.filter((token) => {
            const actor = token.actor;
            if (!actor || actor.type !== 'npc') return false;
            const creatureType = actor.system?.details?.type?.value ?? actor.system?.details?.creatureType ?? '';
            if (creatureType === '') return false; // unknown type: do not remove
            return creatureType.toLowerCase() !== humanoidType;
        }).map(t => t.id);
        if (toRemove.length === 0) {
            ui.notifications.info('No monster tokens on the canvas.');
            return 0;
        }
        await scene.deleteEmbeddedDocuments('Token', toRemove);
        postConsoleAndNotification(MODULE.NAME, 'Clear Monsters: Cleared non-humanoid NPCs from canvas', `${toRemove.length} token(s) removed`, false, false);
        ui.notifications.info(`Removed ${toRemove.length} monster token(s) from the canvas.`);
        return toRemove.length;
    }

    /**
     * Remove from the current scene all NPC tokens that are humanoid (e.g. merchants, guards).
     * Does not remove party tokens or monster (non-humanoid) NPCs. GM only.
     * D&D 5e: creature type is actor.system.details.type.value (or details.creatureType).
     * Only tokens with creature type exactly "humanoid" are removed; missing type = not removed.
     * @returns {Promise<number>} Number of tokens removed
     */
    static async clearNpcsFromCanvas() {
        if (!game.user?.isGM) {
            postConsoleAndNotification(MODULE.NAME, 'Clear NPCs: Only GMs can clear NPC tokens', '', false, false);
            return 0;
        }
        const scene = canvas?.scene;
        if (!scene) {
            ui.notifications.warn('No active scene.');
            return 0;
        }
        const humanoidType = 'humanoid';
        const toRemove = scene.tokens.filter((token) => {
            const actor = token.actor;
            if (!actor || actor.type !== 'npc') return false;
            const creatureType = actor.system?.details?.type?.value ?? actor.system?.details?.creatureType ?? '';
            return creatureType.toLowerCase() === humanoidType;
        }).map(t => t.id);
        if (toRemove.length === 0) {
            ui.notifications.info('No humanoid NPC tokens on the canvas.');
            return 0;
        }
        await scene.deleteEmbeddedDocuments('Token', toRemove);
        postConsoleAndNotification(MODULE.NAME, 'Clear NPCs: Cleared humanoid NPCs from canvas', `${toRemove.length} token(s) removed`, false, false);
        ui.notifications.info(`Removed ${toRemove.length} NPC token(s) from the canvas.`);
        return toRemove.length;
    }
}
