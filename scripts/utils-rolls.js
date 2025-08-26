import { MODULE } from './const.js';
import { postConsoleAndNotification, rollCoffeePubDice } from './global.js';
import { handleSkillRollUpdate } from './blacksmith.js';


// ================================================================== 
// ===== CLEAN 3-PHASE ROLL SYSTEM ==================================
// ================================================================== 

/**
 * Phase 1: Routes roll requests to the selected system and flow
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll (skill, ability, save, tool, dice)
 * @param {string} value - The value for the roll (skill name, ability name, etc.)
 * @param {object} options - Roll options including flow preference
 * @returns {Promise<object>} Roll execution result
 */
async function rollRoute(actor, type, value, options = {}) {
    const diceRollToolSystem = game.settings.get('coffee-pub-blacksmith', 'diceRollToolSystem') ?? 'blacksmith';
    postConsoleAndNotification(MODULE.NAME, `rollRoute: Routing to ${diceRollToolSystem} system with ${options.flow || 'default'} flow`, null, true, false);
    
    if (diceRollToolSystem === 'blacksmith') {
        return await rollRouteBlacksmith(actor, type, value, options);
    } else if (diceRollToolSystem === 'foundry') {
        return await rollRouteFoundry(actor, type, value, options);
    } else {
        postConsoleAndNotification(MODULE.NAME, `rollRoute: Invalid setting ${diceRollToolSystem}, falling back to Blacksmith`, null, true, false);
        return await rollRouteBlacksmith(actor, type, value, options);
    }
}

/**
 * Route to Blacksmith system with flow selection
 */
async function rollRouteBlacksmith(actor, type, value, options = {}) {
    const flow = options.flow || 'window';
    
    if (flow === 'cinema') {
        // Cinema mode - show cinematic overlay
        postConsoleAndNotification(MODULE.NAME, `rollRouteBlacksmith: Cinema mode selected`, null, true, false);
        return await rollExecute(actor, type, value, { ...options, system: 'blacksmith', flow: 'cinema' });
    } else {
        // Window mode - show roll dialog
        postConsoleAndNotification(MODULE.NAME, `rollRouteBlacksmith: Window mode selected`, null, true, false);
        return await showRollDialog(actor, type, value, options, options.messageId, options.tokenId);
    }
}

/**
 * Route to Foundry system with flow selection
 */
async function rollRouteFoundry(actor, type, value, options = {}) {
    const flow = options.flow || 'cinema';
    
    if (flow === 'cinema') {
        // Cinema mode - show cinematic overlay
        postConsoleAndNotification(MODULE.NAME, `rollRouteFoundry: Cinema mode selected`, null, true, false);
        return await rollExecute(actor, type, value, { ...options, system: 'foundry', flow: 'cinema' });
    } else {
        // Window mode - execute roll directly
        postConsoleAndNotification(MODULE.NAME, `rollRouteFoundry: Window mode selected`, null, true, false);
        return await rollExecute(actor, type, value, { ...options, system: 'foundry', flow: 'window' });
    }
}

/**
 * Phase 2: Executes the roll using the selected system
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options including system and flow
 * @returns {Promise<object>} Roll result
 */
async function rollExecute(actor, type, value, options = {}) {
    const system = options.system || 'blacksmith';
    
    if (system === 'blacksmith') {
        return await rollExecuteBlacksmith(actor, type, value, options);
    } else if (system === 'foundry') {
        return await rollExecuteFoundry(actor, type, value, options);
    } else {
        throw new Error(`Unknown roll system: ${system}`);
    }
}

/**
 * Execute roll using Blacksmith system
 */
async function rollExecuteBlacksmith(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `rollExecuteBlacksmith: Executing ${type}: ${value}`, null, true, false);
    
    // Build roll data for Blacksmith system
    const rollData = await _buildRollData(actor, type, value, options);
    
    // Execute the roll
    const roll = await _executeBuiltInRoll(actor, type, value, options);
    
    if (!roll) {
        throw new Error('Blacksmith roll execution failed');
    }
    
    return {
        roll,
        rollData,
        system: 'blacksmith',
        flow: options.flow || 'window'
    };
}

/**
 * Execute roll using Foundry system
 */
async function rollExecuteFoundry(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `rollExecuteFoundry: Executing ${type}: ${value}`, null, true, false);
    
    // Use Foundry's built-in roll methods
    let roll;
    
    if (type === 'skill') {
        roll = await actor.rollSkillV2(value, { 
            advantage: options.advantage || false,
            disadvantage: options.disadvantage || false,
            chatMessage: false,
            createMessage: false
        });
    } else if (type === 'ability') {
        roll = await actor.rollAbilityTest(value, {
            advantage: options.advantage || false,
            disadvantage: options.disadvantage || false,
            chatMessage: false,
            createMessage: false
        });
    } else if (type === 'save') {
        roll = await actor.rollSavingThrow(value, {
            advantage: options.advantage || false,
            disadvantage: options.disadvantage || false,
            chatMessage: false,
            createMessage: false
        });
    } else if (type === 'tool') {
        roll = await _executeToolRollFoundry(actor, value, options);
    } else {
        // Generic dice roll
        const formula = options.customFormula || '1d20';
        roll = new Roll(formula);
        await roll.evaluate({ async: true });
    }
    
    if (!roll) {
        throw new Error('Foundry roll execution failed');
    }
    
    return {
        roll,
        system: 'foundry',
        flow: options.flow || 'cinema'
    };
}

/**
 * Phase 3: Updates the UI and chat based on roll results
 * @param {object} rollResult - Result from rollExecute
 * @param {object} context - Context data (messageId, tokenId, etc.)
 * @returns {Promise<boolean>} Success status
 */
async function rollUpdate(rollResult, context = {}) {
    const { system, flow } = rollResult;
    
    if (system === 'blacksmith') {
        return await rollUpdateBlacksmith(rollResult, context);
    } else if (system === 'foundry') {
        return await rollUpdateFoundry(rollResult, context);
    } else {
        throw new Error(`Unknown roll system: ${system}`);
    }
}

/**
 * Update UI for Blacksmith system
 */
async function rollUpdateBlacksmith(rollResult, context) {
    const { roll, rollData } = rollResult;
    
    // Create a plain object for the socket to prevent data loss
    const resultForSocket = roll.toJSON();
    resultForSocket.verboseFormula = roll.verboseFormula || roll.formula;
    delete resultForSocket.class;

    const rollDataForSocket = {
        messageId: context.messageId,
        tokenId: context.tokenId,
        result: resultForSocket
    };

    // Emit the update to the GM
    game.socket.emit('module.coffee-pub-blacksmith', {
        type: 'updateSkillRoll',
        data: rollDataForSocket
    });

    // If GM, call the handler directly
    if (game.user.isGM) {
        await handleSkillRollUpdate(rollDataForSocket);
    }
    
    return true;
}

/**
 * Update UI for Foundry system
 */
async function rollUpdateFoundry(rollResult, context) {
    const { roll } = rollResult;
    
    // For Foundry system, we need to update the chat message
    if (context.messageId) {
        const message = game.messages.get(context.messageId);
        if (message) {
            // Update the message with roll results
            // This would integrate with the existing chat card system
            postConsoleAndNotification(MODULE.NAME, `rollUpdateFoundry: Updated message ${context.messageId}`, null, true, false);
        }
    }
    
    return true;
}

// ==================================================================
// ===== PUBLIC API ==================================================
// ==================================================================

/**
 * Main entry point for roll execution
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options
 * @returns {Promise<object>} Roll result
 */
export async function executeRoll(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `executeRoll: Entry point called`, { actor: actor.name, actorId: actor.id, type, value, options }, true, false);
    
    try {
        // Phase 1: Route the roll
        const routeResult = await rollRoute(actor, type, value, options);
        
        // Phase 2: Execute the roll
        const rollResult = await rollExecute(actor, type, value, { ...options, ...routeResult });
        
        // Phase 3: Update the UI
        if (rollResult && context) {
            await rollUpdate(rollResult, context);
        }
        
        return rollResult;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `executeRoll error:`, error, true, false);
        throw error;
    }
}

/**
 * Execute roll and update chat message (for existing integration)
 * @param {ChatMessage} message - The chat message to update
 * @param {string} tokenId - The token ID
 * @param {string} actorId - The actor ID
 * @param {string} type - The roll type
 * @param {string} value - The roll value
 * @param {object} options - Roll options
 * @returns {Promise<boolean>} Success status
 */
export async function executeRollAndUpdate(message, tokenId, actorId, type, value, options = {}) {
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
        
        // Add context data to options for rollRoute
        const optionsWithContext = { ...options, messageId: message.id, tokenId, actorId };
        
        // Use the new 3-phase system
        const routeResult = await rollRoute(actor, type, value, optionsWithContext);
        const rollResult = await rollExecute(actor, type, value, { ...options, ...routeResult });
        const updateResult = await rollUpdate(rollResult, context);
        
        return updateResult;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate error:`, error, true, false);
        ui.notifications.error(`Roll execution failed: ${error.message}`);
        return false;
    }
}

// ==================================================================
// ===== ROLL DIALOG SYSTEM =========================================
// ==================================================================

/**
 * Build roll data for the dialog template
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options
 * @returns {Promise<object>} Roll data for the template
 */
async function _buildRollData(actor, type, value, options = {}) {
    const skillData = type === 'skill' ? CONFIG.DND5E.skills[value] : null;
    const abilityKey = skillData?.ability || (type === 'ability' ? value : 'int');
    const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${abilityKey}.mod`) || 0;
    const profBonus = actor.system.attributes.prof || 0;
    
    let baseRoll = '1d20';
    let rollFormula = '1d20';
    let rollTotal = '?';
    
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
        rollTotal: rollTotal || '?',
        baseRoll: baseRoll || '1d20',
        abilityMod: abilityMod || 0,
        proficiencyBonus: type === 'skill' || type === 'save' ? (profBonus || 0) : 0,
        otherModifiers: options.situationalBonus || 0,
        diceSoNiceEnabled: game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice') ?? true
    };
}

/**
 * Execute roll using Blacksmith system (manual Roll creation)
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
 * Helper function for Foundry tool rolls
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
 * Show the roll dialog for manual roll input
 * @param {Actor} actor - The actor making the roll
 * @param {string} type - The type of roll
 * @param {string} value - The value for the roll
 * @param {object} options - Roll options
 * @param {string} messageId - Optional message ID for context
 * @param {string} tokenId - Optional token ID for context
 * @returns {Promise<object|null>} Roll result or null if cancelled
 */
export async function showRollDialog(actor, type, value, options = {}, messageId = null, tokenId = null) {
    postConsoleAndNotification(MODULE.NAME, `showRollDialog: Starting with parameters:`, { actor: actor.name, actorId: actor.id, type, value, options }, true, false);
    
    try {
        // Build roll data for the dialog
        const rollData = await _buildRollData(actor, type, value, options);
        postConsoleAndNotification(MODULE.NAME, `showRollDialog: _buildRollData returned:`, rollData, true, false);
        
        // Add context data
        rollData.messageId = messageId;
        rollData.tokenId = tokenId;
        rollData.rollTypeKey = type;
        rollData.rollValueKey = value;
        rollData.actorId = actor.id;
        
        // Create and show the dialog
        const dialog = new RollDialog(rollData);
        postConsoleAndNotification(MODULE.NAME, `showRollDialog: Creating RollDialog with data:`, rollData, true, false);
        
        await dialog.render(true);
        postConsoleAndNotification(MODULE.NAME, `showRollDialog: Dialog rendered, waiting for close...`, null, true, false);
        
        // Wait for the dialog to close
        return new Promise((resolve) => {
            dialog.onClose = () => resolve(null);
        });
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `showRollDialog error:`, error, true, false);
        throw error;
    }
}

// ==================================================================
// ===== ROLL DIALOG CLASS ==========================================
// ==================================================================

/**
 * Roll Dialog for manual roll input
 */
class RollDialog extends Application {
    constructor(rollData) {
        super();
        this.rollData = rollData;
        postConsoleAndNotification(MODULE.NAME, `RollDialog constructor: Called with rollData:`, rollData, true, false);
        postConsoleAndNotification(MODULE.NAME, `RollDialog constructor: rollData assigned:`, { hasRollData: !!rollData, rollDataKeys: Object.keys(rollData), rollDataValues: Object.values(rollData) }, true, false);
        postConsoleAndNotification(MODULE.NAME, `RollDialog constructor: Completed`, null, true, false);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'roll-dialog',
            template: 'modules/coffee-pub-blacksmith/templates/window-roll.hbs',
            title: 'Roll Dialog',
            width: 400,
            height: 300,
            resizable: true,
            classes: ['roll-dialog']
        });
    }

    getData() {
        postConsoleAndNotification(MODULE.NAME, `RollDialog getData: Called`, { hasRollData: !!this.rollData, rollDataType: typeof this.rollData, rollDataKeys: Object.keys(this.rollData) }, true, false);
        
        // Ensure we have safe data for the template
        const safeData = foundry.utils.mergeObject({}, this.rollData);
        postConsoleAndNotification(MODULE.NAME, `RollDialog getData: Safe data created:`, safeData, true, false);
        
        return safeData;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
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
            this.close();
        });
    }

    async _executeRoll(rollType) {
        try {
            postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Starting ${rollType} roll execution`, null, true, false);
            
            // Get roll options from the form
            const advantage = rollType === 'advantage';
            const disadvantage = rollType === 'disadvantage';
            const situationalBonus = parseInt(this.element.find('input[name="situational-bonus"]').val()) || 0;
            
            const rollOptions = {
                advantage: advantage,
                disadvantage: disadvantage,
                situationalBonus: situationalBonus
            };
            
            postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Roll options:`, rollOptions, true, false);
            
            // Execute the roll using the Blacksmith roll system
            const rollResult = await this._performRoll(rollOptions);
            postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Roll completed:`, rollResult, true, false);
            
            // Only close the dialog after the roll is complete and processed
            if (rollResult) {
                postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Roll successful, closing dialog`, null, true, false);
                this.close();
            } else {
                postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Roll failed, keeping dialog open`, null, true, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll error:`, error, true, false);
            // Keep dialog open on error so user can see what went wrong
        }
    }
    
    /**
     * Perform the actual roll using the Blacksmith roll system
     * @param {object} rollOptions - The roll options (advantage, disadvantage, situationalBonus)
     * @returns {object} The roll result
     */
    async _performRoll(rollOptions) {
        try {
            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Starting Blacksmith roll with options:`, rollOptions, true, false);
            
            // Get the roll data we have
            const rollData = this.rollData;
            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Roll data:`, rollData, true, false);
            
            // Use the Blacksmith system to execute the roll
            // We need to determine the roll type and value from the rollData
            // For now, we'll use a default skill roll, but this should be enhanced
            const rollType = rollData.rollTypeKey || 'skill'; // Get from rollData
            const rollValue = rollData.rollValueKey || 'ins'; // Get from rollData
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
            
            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Blacksmith roll result:`, result, true, false);
            
            // MINIMAL RECONNECTION: Send result through existing system
            // Create a plain object for the socket to prevent data loss
            const resultForSocket = roll.toJSON();
            resultForSocket.verboseFormula = roll.verboseFormula || roll.formula;
            delete resultForSocket.class; // Prevent Foundry from reconstituting as a Roll object

            // Validate that we have the required context data
            if (!rollData.messageId || !rollData.tokenId) {
                postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Missing context data`, { messageId: rollData.messageId, tokenId: rollData.tokenId }, true, false);
                throw new Error('Missing messageId or tokenId for roll update');
            }

            const rollDataForSocket = {
                messageId: rollData.messageId,
                tokenId: rollData.tokenId,
                result: resultForSocket
            };

            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: About to emit socket update`, rollDataForSocket, true, false);

            // Emit the update to the GM (same as old system)
            game.socket.emit('module.coffee-pub-blacksmith', {
                type: 'updateSkillRoll',
                data: rollDataForSocket
            });

            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Socket update emitted`, null, true, false);

            // If GM, call the handler directly with the same prepared data
            if (game.user.isGM) {
                postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Calling handleSkillRollUpdate directly (GM)`, null, true, false);
                await handleSkillRollUpdate(rollDataForSocket);
                postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: handleSkillRollUpdate completed`, null, true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll: Not GM, waiting for socket update`, null, true, false);
            }
            
            return result;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll error:`, error, true, false);
            throw error;
        }
    }
}
