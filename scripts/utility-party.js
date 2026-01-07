// ================================================================== 
// ===== PARTY UTILITIES ============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { deployTokens, deployTokensSequential } from './api-tokens.js';

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
    postConsoleAndNotification(MODULE.NAME, "Party Tools: Party UUIDs", partyUUIDs, true, false);
    
    // Get deployment settings (reuse encounter settings or use defaults)
    const deploymentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern') || 'line';
    const deploymentHidden = false; // Party members should be visible by default
    
    // Deploy using shared API
    // Note: Party members are world actors, so no compendium handling needed
    let deployedTokens = [];
    
    if (deploymentPattern === "sequential") {
        // Sequential deployment (one-by-one)
        const getTooltipContent = (actorName, index, total) => {
            return `
                <div class="monster-name">${actorName}</div>
                <div class="progress">Click to place (${index} of ${total})</div>
            `;
        };
        
        deployedTokens = await deployTokensSequential(partyUUIDs, {
            deploymentHidden: deploymentHidden,
            getTooltipContent: getTooltipContent
        });
    } else {
        // Batch deployment (pattern-based)
        const getTooltipContent = (tokenCount, patternName) => {
            return `
                <div class="monster-name">Deploying Party</div>
                <div class="progress">${patternName} - Click to place ${tokenCount} party members</div>
            `;
        };
        
        // Show notification that user needs to click on canvas
        ui.notifications.info("Click on the canvas to place party members. Right-click to cancel.");
        
        deployedTokens = await deployTokens(partyUUIDs, {
            deploymentPattern: deploymentPattern,
            deploymentHidden: deploymentHidden,
            getTooltipContent: getTooltipContent
        });
    }
    
    if (deployedTokens.length > 0) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Party deployed successfully", `${deployedTokens.length} tokens created`, false, false);
        ui.notifications.info(`Successfully deployed ${deployedTokens.length} party member(s) to the canvas.`);
    } else {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Party deployment cancelled or failed", "", false, false);
        // Don't show error notification - user may have intentionally cancelled
    }
    
    return deployedTokens;
}

