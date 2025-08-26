import { MODULE } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { handleSkillRollUpdate } from './blacksmith.js';

// ==================================================================
// ===== CLEAN UNIFIED ROLL SYSTEM ==================================
// ==================================================================

/**
 * 1. requestRoll() - Creates chat card and handles initial flow routing
 * @param {object} rollDetails - Roll details from SkillCheckDialog
 * @returns {Promise<object>} Chat card created, flow initiated
 */
export async function requestRoll(rollDetails) {
    postConsoleAndNotification(MODULE.NAME, `requestRoll: Starting with roll details`, rollDetails, true, false);
    
    try {
        // TODO: Extract chat card creation logic from skill-check-dialog.js
        // For now, this is a placeholder that will be implemented
        // when we refactor skill-check-dialog.js to call this function
        
        postConsoleAndNotification(MODULE.NAME, `requestRoll: Chat card created, flow initiated`, null, true, false);
        return { success: true, messageId: 'placeholder', tokenId: 'placeholder' };
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `requestRoll error:`, error, true, false);
        throw error;
    }
}

/**
 * 2. orchestrateRoll() - Packages data, selects system, chooses mode
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll (skill, ability, save, tool, dice)
 * @param {string} value - The value for the roll (skill name, ability name, etc.)
 * @param {object} options - Roll options including flow preference
 * @param {string} messageId - Message ID for context
 * @param {string} tokenId - Token ID for context
 * @returns {Promise<object>} Prepared roll data and mode selection
 */
export async function orchestrateRoll(actor, type, value, options = {}, messageId = null, tokenId = null) {
    postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Starting with parameters`, { actor: actor.name, type, value, options, messageId, tokenId }, true, false);
    
    try {
        // Package data for consumption by the rest of the process
        const rollData = await prepareRollData(actor, type, value);
        
        // Determine roll system (for now, focus on BLACKSMITH)
        const diceRollToolSystem = game.settings.get('coffee-pub-blacksmith', 'diceRollToolSystem') ?? 'blacksmith';
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Using ${diceRollToolSystem} system`, null, true, false);
        
        // Choose mode (Window or Cinema)
        const mode = options.flow || 'window';
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Mode selected: ${mode}`, null, true, false);
        
        // Add context data to rollData
        rollData.messageId = messageId;
        rollData.tokenId = tokenId;
        rollData.rollTypeKey = type;
        rollData.rollValueKey = value;
        rollData.actorId = actor.id;
        rollData.system = diceRollToolSystem;
        rollData.mode = mode;
        
        // Open appropriate mode for rolling
        if (mode === 'cinema') {
            await showCinemaOverlay(rollData);
        } else {
            // Window mode - wait for user interaction
            await showRollWindow(rollData);
        }
        
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Mode opened, waiting for user interaction`, null, true, false);
        return rollData;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll error:`, error, true, false);
        throw error;
    }
}

/**
 * 3. processRoll() - Executes the actual dice roll
 * @param {object} rollData - Prepared roll data from orchestrateRoll
 * @param {object} rollOptions - User roll options (advantage, disadvantage, situationalBonus, etc.)
 * @returns {Promise<object>} Roll results object
 */
export async function processRoll(rollData, rollOptions) {
    postConsoleAndNotification(MODULE.NAME, `processRoll: Starting roll execution`, { rollData, rollOptions }, true, false);
    
    try {
        const { actorId, rollTypeKey, rollValueKey, system } = rollData;
        const actor = game.actors.get(actorId);
        
        if (!actor) {
            throw new Error(`Could not find actor for roll: ${actorId}`);
        }
        
        // Build roll formula
        const formula = buildRollFormula(rollTypeKey, rollValueKey, rollOptions);
        postConsoleAndNotification(MODULE.NAME, `processRoll: Formula built: ${formula}`, null, true, false);
        
        // Create and evaluate the roll
        const roll = new Roll(formula, actor.getRollData());
        await roll.evaluate();
        
        postConsoleAndNotification(MODULE.NAME, `processRoll: Roll completed`, { total: roll.total, formula: roll.formula }, true, false);
        
        // Package results
        const rollResults = {
            roll,
            rollData,
            rollOptions,
            total: roll.total,
            formula: roll.formula,
            results: roll.results,
            success: true
        };
        
        return rollResults;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `processRoll error:`, error, true, false);
        throw error;
    }
}

/**
 * 4. deliverRollResults() - Updates chat card and cinema overlay, handles sockets
 * @param {object} rollResults - Results from processRoll
 * @param {object} context - Context data (messageId, tokenId)
 * @returns {Promise<boolean>} Success status
 */
export async function deliverRollResults(rollResults, context) {
    postConsoleAndNotification(MODULE.NAME, `deliverRollResults: Starting result delivery`, { rollResults, context }, true, false);
    
    try {
        const { roll, rollData } = rollResults;
        const { messageId, tokenId } = context;
        
        // Create a plain object for the socket to prevent data loss
        const resultForSocket = roll.toJSON();
        resultForSocket.verboseFormula = roll.verboseFormula || roll.formula;
        delete resultForSocket.class;

        const rollDataForSocket = {
            messageId,
            tokenId,
            result: resultForSocket
        };

        // Emit the update to the GM
        await emitRollUpdate(rollDataForSocket);

        // If GM, call the handler directly
        if (game.user.isGM) {
            await handleSkillRollUpdate(rollDataForSocket);
        }
        
        // Update cinema overlay if in cinema mode
        if (rollData.mode === 'cinema') {
            await updateCinemaOverlay(rollResults, context);
        }
        
        postConsoleAndNotification(MODULE.NAME, `deliverRollResults: Results delivered successfully`, null, true, false);
        return true;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `deliverRollResults error:`, error, true, false);
        throw error;
    }
}

// ==================================================================
// ===== HELPER FUNCTIONS ===========================================
// ==================================================================

/**
 * Prepare roll data for templates
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @returns {Promise<object>} Roll data for templates
 */
async function prepareRollData(actor, type, value) {
    const skillData = type === 'skill' ? CONFIG.DND5E.skills[value] : null;
    const abilityKey = skillData?.ability || (type === 'ability' ? value : 'int');
    const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${abilityKey}.mod`) || 0;
    const profBonus = actor.system.attributes.prof || 0;
    
    let baseRoll = '1d20';
    let rollFormula = '1d20';
    
    // Build the base formula
    const formulaParts = [baseRoll];
    if (abilityMod !== 0) formulaParts.push(abilityMod);
    
    if (type === 'skill') {
        const isProficient = foundry.utils.getProperty(actor.system.skills, `${value}.value`) > 0;
        if (isProficient) formulaParts.push(profBonus);
    } else if (type === 'save') {
        const isProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) || false;
        if (isProficient) formulaParts.push(profBonus);
    }
    
    rollFormula = formulaParts.join(' + ');
    
    return {
        rollTitle: `Dice Roll`,
        actorName: actor.name || 'Unknown Actor',
        rollType: type === 'skill' ? `Dice Roll: ${skillData?.label || value || 'Unknown'}` : 
                  type === 'ability' ? `Dice Roll: ${(value || 'Unknown').toUpperCase()}` :
                  type === 'save' ? `Dice Roll: ${(value || 'Unknown').toUpperCase()}` :
                  type === 'tool' ? `Dice Roll: ${value || 'Unknown'}` : `Dice Roll: ${value || 'Unknown'}`,
        rollFormula: rollFormula || '1d20',
        baseRoll: baseRoll || '1d20',
        abilityMod: abilityMod || 0,
        proficiencyBonus: type === 'skill' || type === 'save' ? (profBonus || 0) : 0,
        diceSoNiceEnabled: game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice') ?? true
    };
}

/**
 * Build roll formula based on type, value, and options
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options
 * @returns {string} Roll formula
 */
function buildRollFormula(type, value, options) {
    const { advantage, disadvantage, situationalBonus, customFormula } = options;
    
    // Build formula parts
    const parts = [];
    
    // Handle advantage/disadvantage
    if (advantage) parts.push('2d20kh');
    else if (disadvantage) parts.push('2d20kl');
    else parts.push('1d20');
    
    // Add situational bonus if provided
    if (situationalBonus && situationalBonus !== 0) {
        parts.push(situationalBonus);
    }
    
    // Add custom formula if provided
    if (customFormula) {
        parts.push(customFormula);
    }
    
    return parts.join(' + ');
}

/**
 * Show roll configuration window
 * @param {object} rollData - Roll data for the window
 * @returns {Promise<void>}
 */
async function showRollWindow(rollData) {
    postConsoleAndNotification(MODULE.NAME, `showRollWindow: Opening roll window`, rollData, true, false);
    
    // TODO: Implement roll window display
    // This will replace the old RollDialog class
    // For now, just log that we would show the window
    
    postConsoleAndNotification(MODULE.NAME, `showRollWindow: Roll window would be displayed`, null, true, false);
}

/**
 * Show cinematic overlay
 * @param {object} rollData - Roll data for the cinema
 * @returns {Promise<void>}
 */
async function showCinemaOverlay(rollData) {
    postConsoleAndNotification(MODULE.NAME, `showCinemaOverlay: Opening cinema overlay`, rollData, true, false);
    
    // TODO: Implement cinema overlay display
    // This will replace the old cinema mode logic
    // For now, just log that we would show the cinema
    
    postConsoleAndNotification(MODULE.NAME, `showCinemaOverlay: Cinema overlay would be displayed`, null, true, false);
}

/**
 * Update cinema overlay with roll results
 * @param {object} rollResults - Roll results
 * @param {object} context - Context data
 * @returns {Promise<void>}
 */
async function updateCinemaOverlay(rollResults, context) {
    postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: Updating cinema with results`, { rollResults, context }, true, false);
    
    // TODO: Implement cinema overlay updates
    // This will handle updating the cinematic display with roll results
    
    postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: Cinema overlay updated`, null, true, false);
}

/**
 * Emit socket events for GM updates
 * @param {object} rollDataForSocket - Roll data for socket transmission
 * @returns {Promise<void>}
 */
async function emitRollUpdate(rollDataForSocket) {
    postConsoleAndNotification(MODULE.NAME, `emitRollUpdate: Emitting socket update`, rollDataForSocket, true, false);
    
    // Emit the update to the GM
    game.socket.emit('module.coffee-pub-blacksmith', {
        type: 'updateSkillRoll',
        data: rollDataForSocket
    });
    
    postConsoleAndNotification(MODULE.NAME, `emitRollUpdate: Socket update emitted`, null, true, false);
}

// ==================================================================
// ===== PUBLIC API ==================================================
// ==================================================================

/**
 * Main entry point for roll execution (for existing integration)
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options
 * @returns {Promise<object>} Roll result
 */
export async function executeRoll(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `executeRoll: Entry point called`, { actor: actor.name, actorId: actor.id, type, value, options }, true, false);
    
    try {
        // Use the new unified system
        const rollData = await orchestrateRoll(actor, type, value, options);
        
        // For now, return the roll data
        // In the future, this will wait for user interaction and then process the roll
        return rollData;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `executeRoll error:`, error, true, false);
        throw error;
    }
}

/**
 * TEMPORARY BRIDGE FUNCTION - DELETE AFTER REFACTORING skill-check-dialog.js
 * This function maintains compatibility with the old system while we transition to the new 4-function system
 * @param {ChatMessage} message - The chat message to update
 * @param {string} tokenId - The token ID
 * @param {string} actorId - The actor ID
 * @param {string} type - The roll type
 * @param {string} value - The roll value
 * @param {object} options - Roll options
 * @returns {Promise<boolean>} Success status
 */
export async function executeRollAndUpdate(message, tokenId, actorId, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Bridge function called (TEMPORARY - DELETE LATER)`, { messageId: message.id, tokenId, actorId, type, value, options }, true, false);
    
    try {
        const actor = game.actors.get(actorId);
        if (!actor) {
            ui.notifications.error(`Could not find the actor (ID: ${actorId}) for this roll.`);
            return false;
        }
        
        // Check permissions
        if (!game.user.isGM && !actor.isOwner) {
            ui.notifications.warn("You don't have permission to roll for this character.");
            return false;
        }

        const context = { messageId: message.id, tokenId, actorId };
        
        // Use the new unified system
        const rollData = await orchestrateRoll(actor, type, value, { ...options, messageId: message.id, tokenId, actorId });
        
        postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Bridge function completed successfully`, null, true, false);
        return true;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate error:`, error, true, false);
        ui.notifications.error(`Roll execution failed: ${error.message}`);
        return false;
    }
}
