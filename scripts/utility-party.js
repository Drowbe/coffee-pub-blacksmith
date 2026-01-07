// ================================================================== 
// ===== PARTY UTILITIES ============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { deployTokens } from './api-tokens.js';

/**
 * Utility functions for party management
 */

/**
 * Get all party members (player characters)
 * @returns {Array} Array of actor documents
 */
export function getPartyMembers() {
    return game.actors.filter(actor => {
        return actor.type === 'character' && actor.hasPlayerOwner;
    });
}

/**
 * Get party member UUIDs
 * @returns {Array<string>} Array of actor UUIDs
 */
export function getPartyMemberUUIDs() {
    return getPartyMembers().map(actor => actor.uuid);
}

/**
 * Deploy party members to the canvas
 * @returns {Promise<Array>} Array of created token documents
 */
export async function deployParty() {
    // Check if user has permission
    if (!game.user.isGM) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Only GMs can deploy party members", "", false, false);
        return [];
    }
    
    // Get party members
    const partyMembers = getPartyMembers();
    
    if (partyMembers.length === 0) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: No party members found", "", false, false);
        ui.notifications.warn("No party members found. Party members must be player characters.");
        return [];
    }
    
    const partyUUIDs = partyMembers.map(actor => actor.uuid);
    
    postConsoleAndNotification(MODULE.NAME, "Party Tools: Deploying party", `${partyMembers.length} members`, true, false);
    
    // Get deployment settings (reuse encounter settings or use defaults)
    const deploymentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern') || 'line';
    const deploymentHidden = false; // Party members should be visible by default
    
    // Custom tooltip content
    const getTooltipContent = (tokenCount, patternName) => {
        return `
            <div class="monster-name">Deploying Party</div>
            <div class="progress">${patternName} - Click to place ${tokenCount} party members</div>
        `;
    };
    
    // Deploy using shared API
    // Note: Party members are world actors, so no compendium handling needed
    const deployedTokens = await deployTokens(partyUUIDs, {
        deploymentPattern: deploymentPattern,
        deploymentHidden: deploymentHidden,
        getTooltipContent: getTooltipContent
    });
    
    if (deployedTokens.length > 0) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Party deployed successfully", `${deployedTokens.length} tokens created`, false, false);
    } else {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Party deployment cancelled or failed", "", false, false);
    }
    
    return deployedTokens;
}

