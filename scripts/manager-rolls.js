import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-common.js';
import { handleSkillRollUpdate } from './blacksmith.js';
import { SocketManager } from './manager-sockets.js';

// Import SkillCheckDialog for chat message formatting
import { SkillCheckDialog } from './window-skillcheck.js';

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
        // Extract the processed actors and roll data from rollDetails
        const { 
            actors, 
            challengerRollType, 
            challengerRollValue, 
            defenderRollType, 
            defenderRollValue,
            dc,
            showDC,
            groupRoll,
            label,
            description,
            rollMode,
            isCinematic,
            showRollExplanation,
            showRollExplanationLink
        } = rollDetails;
        
        // Process actors to extract the data needed for the chat card
        const processedActors = actors.map(actor => ({
            id: actor.tokenId || actor.id,
            actorId: actor.actorId,
            name: actor.name,
            group: actor.group || 1,
            toolId: actor.toolId || null
        }));
        
        // Create message data for the chat card
        const messageData = {
            skillName: challengerRollType === 'tool' ? challengerRollValue : challengerRollValue,
            defenderSkillName: defenderRollType ? (defenderRollType === 'tool' ? defenderRollValue : defenderRollValue) : null,
            skillAbbr: challengerRollType === 'tool' ? (processedActors[0]?.toolId || null) : challengerRollValue,
            defenderSkillAbbr: defenderRollType ? (defenderRollType === 'tool' ? (processedActors.find(a => a.group === 2)?.toolId || null) : defenderRollValue) : null,
            actors: processedActors,
            requesterId: game.user.id,
            type: 'skillCheck',
            dc: dc,
            showDC: showDC,
            isGroupRoll: groupRoll,
            label: label || null,
            description: description || null,
            skillDescription: null, // Will be filled by formatChatMessage
            defenderSkillDescription: null, // Will be filled by formatChatMessage
            skillLink: null, // Will be filled by formatChatMessage
            defenderSkillLink: null, // Will be filled by formatChatMessage
            rollMode,
            rollType: challengerRollType,
            defenderRollType: defenderRollType || null,
            hasMultipleGroups: !!defenderRollType,
            showRollExplanation: showRollExplanation || false,
            showRollExplanationLink: showRollExplanationLink || false,
            isCinematic: isCinematic || false
        };
        
        // Create the chat message
        const message = await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: await SkillCheckDialog.formatChatMessage(messageData),
            flags: { 'coffee-pub-blacksmith': messageData }
        });
        
        // Handle cinematic mode if enabled
        if (messageData.isCinematic) {
            // Show for the current user who initiated the roll
            SkillCheckDialog._showCinematicDisplay(messageData, message.id);
            
            // Emit to other users to show the overlay
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("showCinematicOverlay", {
                    type: "showCinematicOverlay",  // Add type property
                    messageId: message.id,
                    messageData: messageData
                });
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `requestRoll: Chat card created successfully`, { messageId: message.id, tokenId: processedActors[0]?.id }, true, false);
        
        return { 
            success: true, 
            messageId: message.id, 
            tokenId: processedActors[0]?.id,
            messageData: messageData
        };
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `requestRoll error:`, error, true, false);
        throw error;
    }
}

/**
 * 2. orchestrateRoll() - Packages data, selects system, chooses mode
 * @param {object} rollDetails - Complete roll details including actors, roll types, etc.
 * @param {string} existingMessageId - Optional existing message ID to update instead of creating new card
 * @returns {Promise<object>} Prepared roll data and mode selection
 */
export async function orchestrateRoll(rollDetails, existingMessageId = null) {
    postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Starting with roll details`, rollDetails, true, false);
    
    try {
        let chatResult;
        
        if (existingMessageId) {
            // Use existing chat card instead of creating a new one
            postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Using existing message ID: ${existingMessageId}`, null, true, false);
            chatResult = {
                success: true,
                messageId: existingMessageId,
                tokenId: rollDetails.actors[0]?.tokenId || rollDetails.actors[0]?.id,
                messageData: null // We don't need to recreate the message data
            };
        } else {
            // Create new chat card using requestRoll
            postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Creating new chat card`, null, true, false);
            chatResult = await requestRoll(rollDetails);
            
            if (!chatResult.success) {
                throw new Error('Failed to create chat card');
            }
        }
        
        // Extract the first actor for roll execution
        const firstActor = rollDetails.actors[0];
        const actor = game.actors.get(firstActor.actorId);
        
        if (!actor) {
            throw new Error(`Could not find actor: ${firstActor.actorId}`);
        }
        
        // Package data for consumption by the rest of the process
        const rollData = await prepareRollData(actor, rollDetails.challengerRollType, rollDetails.challengerRollValue);
        
        // Determine roll system (for now, focus on BLACKSMITH)
        const diceRollToolSystem = game.settings.get('coffee-pub-blacksmith', 'diceRollToolSystem') ?? 'blacksmith';
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Using ${diceRollToolSystem} system`, null, true, false);
        
        // Choose mode (Window or Cinema)
        const mode = rollDetails.isCinematic ? 'cinema' : 'window';
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Mode selected: ${mode}`, null, true, false);
        
        // Add context data to rollData
        rollData.messageId = chatResult.messageId;
        rollData.tokenId = chatResult.tokenId;
        rollData.rollTypeKey = rollDetails.challengerRollType;
        rollData.rollValueKey = rollDetails.challengerRollValue;
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
        
        // Execute the roll using the working Blacksmith system logic
        const roll = await _executeBuiltInRoll(actor, rollTypeKey, rollValueKey, rollOptions);
        
        if (!roll) {
            throw new Error('Roll execution failed');
        }
        
        // Show 3D dice animation if Dice So Nice is available
        if (game.dice3d) {
            try {
                await game.dice3d.showForRoll(roll, game.user, true, null, false, null, null, {ghost: false, secret: false});
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Dice animation error:`, error, true, false);
            }
        }
        
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
        rollTotal: '?',
        baseRoll: baseRoll || '1d20',
        abilityMod: abilityMod || 0,
        proficiencyBonus: type === 'skill' || type === 'save' ? (profBonus || 0) : 0,
        otherModifiers: 0, // Will be set by rollOptions
        diceSoNiceEnabled: game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice') ?? true
    };
}

/**
 * Execute roll using Blacksmith system (manual Roll creation) - MIGRATED FROM OLD SYSTEM
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options
 * @returns {Promise<Roll>} The roll result
 */
async function _executeBuiltInRoll(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `Executing manual roll for ${type}: ${value}`, null, true, false);
    
    const rollOptions = { ...options };
    postConsoleAndNotification(MODULE.NAME, `Roll options:`, rollOptions, true, false);
    
    let result;
    switch (type) {
        case 'skill':
            postConsoleAndNotification(MODULE.NAME, `Creating manual skill roll for: ${value}`, null, true, false);
            // Build skill roll formula manually: 1d20 + abilityMod + profBonus
            const skillData = CONFIG.DND5E.skills[value];
            const skillAbility = skillData?.ability || 'int';
            const skillAbilityMod = foundry.utils.getProperty(actor.system.abilities, `${skillAbility}.mod`) || 0;
            const skillProfBonus = actor.system.attributes.prof || 0;
            const skillIsProficient = foundry.utils.getProperty(actor.system.skills, `${value}.value`) > 0;
            
            // Build formula parts
            const skillParts = [];
            if (options.advantage) skillParts.push('2d20kh');
            else if (options.disadvantage) skillParts.push('2d20kl');
            else skillParts.push('1d20');
            
            if (skillAbilityMod !== 0) skillParts.push(skillAbilityMod);
            if (skillIsProficient) skillParts.push(skillProfBonus);
            
            // Add situational bonus and custom formula if provided
            if (options.situationalBonus && options.situationalBonus !== 0) {
                skillParts.push(options.situationalBonus);
            }
            if (options.customFormula) {
                skillParts.push(options.customFormula);
            }
            
            const skillFormula = skillParts.join(' + ');
            postConsoleAndNotification(MODULE.NAME, `Skill roll formula: ${skillFormula}`, null, true, false);
            
            result = new Roll(skillFormula, actor.getRollData());
            await result.evaluate();
            break;
        case 'ability':
            postConsoleAndNotification(MODULE.NAME, `Creating manual ability roll for: ${value}`, null, true, false);
            // Build ability roll formula manually: 1d20 + abilityMod
            const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${value}.mod`) || 0;
            
            // Build formula parts
            const abilityParts = [];
            if (options.advantage) abilityParts.push('2d20kh');
            else if (options.disadvantage) abilityParts.push('2d20kl');
            else abilityParts.push('1d20');
            
            if (abilityMod !== 0) abilityParts.push(abilityMod);
            
            // Add situational bonus and custom formula if provided
            if (options.situationalBonus && options.situationalBonus !== 0) {
                abilityParts.push(options.situationalBonus);
            }
            if (options.customFormula) {
                abilityParts.push(options.customFormula);
            }
            
            const abilityFormula = abilityParts.join(' + ');
            postConsoleAndNotification(MODULE.NAME, `Ability roll formula: ${abilityFormula}`, null, true, false);
            
            result = new Roll(abilityFormula, actor.getRollData());
            await result.evaluate();
            break;
        case 'save':
            postConsoleAndNotification(MODULE.NAME, `Creating manual save roll for: ${value}`, null, true, false);
            if (value === 'death') {
                // Death saves are special: 1d20, no modifiers
                const deathParts = [];
                if (options.advantage) deathParts.push('2d20kh');
                else if (options.disadvantage) deathParts.push('2d20kl');
                else deathParts.push('1d20');
                
                const deathFormula = deathParts.join(' + ');
                postConsoleAndNotification(MODULE.NAME, `Death save formula: ${deathFormula}`, null, true, false);
                
                result = new Roll(deathFormula, actor.getRollData());
                await result.evaluate();
            } else {
                // Build saving throw formula manually: 1d20 + abilityMod + profBonus
                const saveAbilityMod = foundry.utils.getProperty(actor.system.abilities, `${value}.mod`) || 0;
                const saveProfBonus = actor.system.attributes.prof || 0;
                const saveIsProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) || false;
                
                // Build formula parts
                const saveParts = [];
                if (options.advantage) saveParts.push('2d20kh');
                else if (options.disadvantage) saveParts.push('2d20kl');
                else saveParts.push('1d20');
                
                if (saveAbilityMod !== 0) saveParts.push(saveAbilityMod);
                if (saveIsProficient) saveParts.push(saveProfBonus);
                
                // Add situational bonus and custom formula if provided
                if (options.situationalBonus && options.situationalBonus !== 0) {
                    saveParts.push(options.situationalBonus);
                }
                if (options.customFormula) {
                    saveParts.push(options.customFormula);
                }
                
                const saveFormula = saveParts.join(' + ');
                postConsoleAndNotification(MODULE.NAME, `Save roll formula: ${saveFormula}`, null, true, false);
                
                result = new Roll(saveFormula, actor.getRollData());
                await result.evaluate();
            }
            break;
        case 'tool':
            postConsoleAndNotification(MODULE.NAME, `Creating manual tool roll for: ${value}`, null, true, false);
            // Create a tool check roll manually: 1d20 + abilityMod + profBonus
            const toolItem = actor.items.get(value) || actor.items.find(i => i.system.baseItem === value);
            if (toolItem) {
                const ability = toolItem.system.ability || "int";
                const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${ability}.mod`) || 0;
                const profBonus = actor.system.attributes.prof || 0;
                const isProficient = toolItem.system.proficient > 0;
                
                // Build formula parts
                const toolParts = [];
                if (options.advantage) toolParts.push('2d20kh');
                else if (options.disadvantage) toolParts.push('2d20kl');
                else toolParts.push('1d20');
                
                if (abilityMod !== 0) toolParts.push(abilityMod);
                if (isProficient) toolParts.push(profBonus);
                
                // Add situational bonus and custom formula if provided
                if (options.situationalBonus && options.situationalBonus !== 0) {
                    toolParts.push(options.situationalBonus);
                }
                if (options.customFormula) {
                    toolParts.push(options.customFormula);
                }
                
                const toolFormula = toolParts.join(' + ');
                postConsoleAndNotification(MODULE.NAME, `Tool roll formula: ${toolFormula}`, null, true, false);
                
                result = new Roll(toolFormula, actor.getRollData());
                await result.evaluate();
            } else {
                throw new Error(`Tool item not found: ${value}`);
            }
            break;
        case 'dice':
        default:
            // For dice and other types, create a simple roll
            postConsoleAndNotification(MODULE.NAME, `Creating simple roll for type: ${type}`, null, true, false);
            let diceFormula = value || '1d20';
            
            // Handle advantage/disadvantage for d20 rolls
            if (diceFormula === '1d20' || diceFormula === 'd20') {
                if (options.advantage) diceFormula = '2d20kh';
                else if (options.disadvantage) diceFormula = '2d20kl';
            }
            
            postConsoleAndNotification(MODULE.NAME, `Dice roll formula: ${diceFormula}`, null, true, false);
            result = new Roll(diceFormula, actor.getRollData());
            await result.evaluate();
            break;
    }
    
    postConsoleAndNotification(MODULE.NAME, `Manual roll result:`, {
        type: result?.constructor.name,
        hasToJSON: !!result?.toJSON,
        hasTotal: 'total' in result,
        total: result?.total,
        isRoll: result instanceof Roll
    }, true, false);
    
    return result;
}

/**
 * Helper function for Foundry tool rolls - MIGRATED FROM OLD SYSTEM
 * @param {Actor} actor - The actor making the roll
 * @param {string} toolIdentifier - The tool identifier
 * @param {object} rollOptions - Roll options
 * @returns {Promise<Roll>} The roll result
 */
async function _executeToolRollFoundry(actor, toolIdentifier, rollOptions) {
    if (!toolIdentifier) throw new Error(`No tool identifier provided for actor ${actor.name}`);
    
    // Attempt to use the modern dnd5e API for tool checks
    if (typeof actor.rollToolCheck === 'function') {
        try {
            return await actor.rollToolCheck(toolIdentifier, rollOptions);
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, `actor.rollToolCheck failed, falling back to manual roll`, err, true, false);
        }
    }

    // Fallback to manual roll creation
    const item = actor.items.get(toolIdentifier) || actor.items.find(i => i.system.baseItem === toolIdentifier);
    if (!item) throw new Error(`Tool item not found on actor: ${toolIdentifier}`);
    
    const rollData = actor.getRollData();
    const ability = item.system.ability || "int";
    
    const parts = [];
    if (rollOptions.advantage) parts.push('2d20kh');
    else if (rollOptions.disadvantage) parts.push('2d20kl');
    else parts.push("1d20");

    const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${ability}.mod`) || 0;
    if (abilityMod !== 0) parts.push(abilityMod);
    
    const profBonus = actor.system.attributes.prof || 0;
    let actualProfBonus = 0;
    
    if (item.system.proficient > 0) {
        actualProfBonus = profBonus;
    } else {
        // Check if the actor has proficiency in this tool
        const toolProficiency = foundry.utils.getProperty(actor.system.toolProficiencies, toolIdentifier);
        if (toolProficiency) actualProfBonus = profBonus;
    }
    
    if (actualProfBonus !== 0) parts.push(actualProfBonus);
    
    const formula = parts.join(" + ");
    postConsoleAndNotification(MODULE.NAME, `Manual tool roll formula: ${formula}`, "", true, false);
    
    const roll = new Roll(formula, rollData);
    await roll.evaluate({ async: true });
    return roll;
}



/**
 * Show roll configuration window - MIGRATED FROM OLD SYSTEM
 * @param {object} rollData - Roll data for the window
 * @returns {Promise<object|null>} Roll result or null if cancelled
 */
async function showRollWindow(rollData) {
    postConsoleAndNotification(MODULE.NAME, `showRollWindow: Starting with parameters:`, { actor: rollData.actorName, actorId: rollData.actorId, type: rollData.rollTypeKey, value: rollData.rollValueKey, options: {} }, true, false);
    
    try {
        // Build roll data for the dialog
        const dialogRollData = await prepareRollData(game.actors.get(rollData.actorId), rollData.rollTypeKey, rollData.rollValueKey);
        postConsoleAndNotification(MODULE.NAME, `showRollWindow: prepareRollData returned:`, dialogRollData, true, false);
        
        // Add context data
        dialogRollData.messageId = rollData.messageId;
        dialogRollData.tokenId = rollData.tokenId;
        dialogRollData.rollTypeKey = rollData.rollTypeKey;
        dialogRollData.rollValueKey = rollData.rollValueKey;
        dialogRollData.actorId = rollData.actorId;
        
        postConsoleAndNotification(MODULE.NAME, `showRollWindow: Context data added:`, { messageId: dialogRollData.messageId, tokenId: dialogRollData.tokenId }, true, false);
        
        // Create and show the dialog
        const dialog = new RollWindow(dialogRollData);
        postConsoleAndNotification(MODULE.NAME, `showRollWindow: Creating RollWindow with data:`, dialogRollData, true, false);
        
        await dialog.render(true);
        postConsoleAndNotification(MODULE.NAME, `showRollWindow: Dialog rendered, waiting for close...`, null, true, false);
        
        // Wait for the dialog to close
        return new Promise((resolve) => {
            dialog.onClose = () => resolve(null);
        });
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `showRollWindow error:`, error, true, false);
        throw error;
    }
}

/**
 * Roll Window Class - Handles the roll configuration interface
 */
class RollWindow extends Application {
    constructor(rollData) {
        super();
        this.rollData = rollData;
        postConsoleAndNotification(MODULE.NAME, `RollWindow constructor: Created with roll data`, rollData, true, false);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'roll-window',
            template: 'modules/coffee-pub-blacksmith/templates/window-roll-normal.hbs',
            title: 'Roll Configuration',
            width: 450,
            height: 400,
            resizable: true,
            classes: ['roll-window']
        });
    }

    getData() {
        postConsoleAndNotification(MODULE.NAME, `RollWindow getData: Preparing template data`, null, true, false);
        
        // Return the roll data for the template
        return this.rollData;
    }

    activateListeners(html) {
        super.activateListeners(html);
        postConsoleAndNotification(MODULE.NAME, `RollWindow activateListeners: Setting up event handlers`, null, true, false);
        
        // Roll buttons - each button triggers a roll with different advantage/disadvantage
        html.find('.roll-advantage').on('click', async (event) => {
            event.preventDefault();
            await this._executeRoll('advantage');
        });
        
        html.find('.roll-normal').on('click', async (event) => {
            event.preventDefault();
            await this._executeRoll('normal');
        });
        
        html.find('.roll-disadvantage').on('click', async (event) => {
            event.preventDefault();
            await this._executeRoll('disadvantage');
        });
        
        // Cancel button
        html.find('.cancel-roll').on('click', (event) => {
            event.preventDefault();
            postConsoleAndNotification(MODULE.NAME, `RollWindow: Cancel button clicked, closing window`, null, true, false);
            this.close();
        });
    }

    async _executeRoll(rollType) {
        try {
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Starting ${rollType} roll execution`, null, true, false);
            
            // Get roll options from the form
            const advantage = rollType === 'advantage';
            const disadvantage = rollType === 'disadvantage';
            const situationalBonus = parseInt(this.element.find('input[name="situational-bonus"]').val()) || 0;
            
            const rollOptions = {
                advantage: advantage,
                disadvantage: disadvantage,
                situationalBonus: situationalBonus
            };
            
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll options:`, rollOptions, true, false);
            
            // Execute the roll using the Blacksmith roll system
            const rollResult = await this._performRoll(rollOptions);
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll completed:`, rollResult, true, false);
            
            // Only close the dialog after the roll is complete and processed
            if (rollResult) {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll successful, closing dialog`, null, true, false);
                this.close();
            } else {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll failed, keeping dialog open`, null, true, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll error:`, error, true, false);
            // Keep dialog open on error so user can see what went wrong
        }
    }
    
    /**
     * Perform the actual roll using the Blacksmith roll system - MIGRATED FROM OLD SYSTEM
     * @param {object} rollOptions - The roll options (advantage, disadvantage, situationalBonus)
     * @returns {object} The roll result
     */
    async _performRoll(rollOptions) {
        try {
            postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Starting Blacksmith roll with options:`, rollOptions, true, false);
            
            // Get the roll data we have
            const rollData = this.rollData;
            postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Roll data:`, rollData, true, false);
            
            // Use the Blacksmith system to execute the roll
            const rollType = rollData.rollTypeKey || 'skill';
            const rollValue = rollData.rollValueKey || 'ins';
            const actor = game.actors.get(rollData.actorId) || game.actors.getName(rollData.actorName);
            
            if (!actor) {
                throw new Error(`Could not find actor for roll: ${rollData.actorName}`);
            }
            
            // Execute the roll using the Blacksmith system
            const roll = await _executeBuiltInRoll(actor, rollType, rollValue, rollOptions);
            
            if (!roll) {
                throw new Error('Roll execution failed');
            }
            
            // Get the result
            const result = {
                total: roll.total,
                formula: roll.formula,
                results: roll.results,
                advantage: rollOptions.advantage,
                disadvantage: rollOptions.disadvantage,
                situationalBonus: rollOptions.situationalBonus
            };
            
            postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Blacksmith roll result:`, result, true, false);
            
            // MINIMAL RECONNECTION: Send result through existing system
            // Create a plain object for the socket to prevent data loss
            const resultForSocket = roll.toJSON();
            resultForSocket.verboseFormula = roll.verboseFormula || roll.formula;
            delete resultForSocket.class; // Prevent Foundry from reconstituting as a Roll object

            // Validate that we have the required context data
            if (!rollData.messageId || !rollData.tokenId) {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Missing context data`, { messageId: rollData.messageId, tokenId: rollData.tokenId }, true, false);
                throw new Error('Missing messageId or tokenId for roll update');
            }

            const rollDataForSocket = {
                messageId: rollData.messageId,
                tokenId: rollData.tokenId,
                result: resultForSocket
            };

            postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: About to emit socket update`, rollDataForSocket, true, false);

            // Emit the update to the GM (same as old system)
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("updateSkillRoll", {
                    type: "updateSkillRoll",  // Add type property
                    data: rollDataForSocket
                });
            }

            postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Socket update emitted`, null, true, false);

            // If GM, call the handler directly with the same prepared data
            if (game.user.isGM) {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Calling handleSkillRollUpdate directly (GM)`, null, true, false);
                await handleSkillRollUpdate(rollDataForSocket);
                postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: handleSkillRollUpdate completed`, null, true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll: Not GM, waiting for socket update`, null, true, false);
            }
            
            return result;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollWindow _performRoll error:`, error, true, false);
            throw error;
        }
    }
}

/**
 * Show cinematic overlay
 * @param {object} rollData - Roll data for the cinema
 * @returns {Promise<void>}
 */
async function showCinemaOverlay(rollData) {
    postConsoleAndNotification(MODULE.NAME, `showCinemaOverlay: Opening cinema overlay`, rollData, true, false);
    
    try {
        // Import SkillCheckDialog to access the existing cinema display
        const { SkillCheckDialog } = await import('./window-skillcheck.js');
        
        // Convert rollData to messageData format expected by _showCinematicDisplay
        const messageData = {
            actors: [{
                id: rollData.tokenId,
                actorId: rollData.actorId,
                name: rollData.actorName || 'Unknown Actor',
                group: 1,
                result: null
            }],
            rollType: rollData.rollTypeKey,
            skillAbbr: rollData.rollValueKey,
            defenderRollType: null,
            defenderSkillAbbr: null,
            hasMultipleGroups: false,
            isCinematic: true
        };
        
        // Show the cinematic display using the existing method
        SkillCheckDialog._showCinematicDisplay(messageData, rollData.messageId);
        
        postConsoleAndNotification(MODULE.NAME, `showCinemaOverlay: Cinema overlay displayed successfully`, null, true, false);
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `showCinemaOverlay error:`, error, true, false);
        throw error;
    }
}

/**
 * Update cinema overlay with roll results
 * @param {object} rollResults - Roll results
 * @param {object} context - Context data
 * @returns {Promise<void>}
 */
async function updateCinemaOverlay(rollResults, context) {
    postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: Updating cinema with results`, { rollResults, context }, true, false);
    
    try {
        const { roll } = rollResults;
        const { messageId, tokenId } = context;
        
        // Find the cinema overlay
        const overlay = $('#cpb-cinematic-overlay');
        if (overlay.length === 0) {
            postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: No cinema overlay found`, null, true, false);
            return;
        }
        
        // Find the specific actor card
        const actorCard = overlay.find(`[data-token-id="${tokenId}"]`);
        if (actorCard.length === 0) {
            postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: No actor card found for token ${tokenId}`, null, true, false);
            return;
        }
        
        // Update the roll area with results
        const rollArea = actorCard.find('.cpb-cinematic-roll-area');
        if (rollArea.length > 0) {
            // Create result display
            const total = roll.total;
            const isSuccess = total >= 10; // Assuming DC 10 for now
            const resultClass = isSuccess ? 'success' : 'failure';
            
            rollArea.html(`
                <div class="cpb-cinematic-result ${resultClass}">
                    <div class="cpb-cinematic-result-total">${total}</div>
                    <div class="cpb-cinematic-result-label">${isSuccess ? 'Success!' : 'Failure'}</div>
                </div>
            `);
        }
        
        // Auto-close the cinema overlay after a delay
        setTimeout(() => {
            overlay.fadeOut(1000, () => {
                overlay.remove();
            });
        }, 3000);
        
        postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: Cinema overlay updated successfully`, null, true, false);
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay error:`, error, true, false);
        throw error;
    }
}

/**
 * Emit socket events for GM updates
 * @param {object} rollDataForSocket - Roll data for socket transmission
 * @returns {Promise<void>}
 */
async function emitRollUpdate(rollDataForSocket) {
    postConsoleAndNotification(MODULE.NAME, `emitRollUpdate: Emitting socket update`, rollDataForSocket, true, false);
    
    // Emit the update to the GM
    const socket = SocketManager.getSocket();
    if (socket) {
        await socket.executeForOthers("updateSkillRoll", {
            type: "updateSkillRoll",  // Add type property
            data: rollDataForSocket
        });
    }
    
    postConsoleAndNotification(MODULE.NAME, `emitRollUpdate: Socket update emitted`, null, true, false);
}

// ==================================================================
// ===== PUBLIC API ==================================================
// ==================================================================




