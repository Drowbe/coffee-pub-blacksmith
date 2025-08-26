// ================================================================== 
// ===== UNIFIED ROLL SYSTEM ========================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, rollCoffeePubDice } from './global.js';
import { handleSkillRollUpdate } from './blacksmith.js';

/**
 * Helper function to process roll results and update the chat message.
 * Used by both Blacksmith and Foundry systems.
 * @private
 */
async function _processRollResultAndUpdate(message, tokenId, actorId, type, value, roll, options) {
    if (!roll) {
        postConsoleAndNotification(MODULE.NAME, `_processRollResultAndUpdate: No roll to process`, null, true, false);
        return;
    }

    // Create a plain object for the socket to prevent data loss
    const resultForSocket = roll.toJSON();
    resultForSocket.verboseFormula = roll.verboseFormula || roll.formula;
    delete resultForSocket.class; // Prevent Foundry from reconstituting as a Roll object

    const rollData = {
        messageId: message.id,
        tokenId: tokenId,
        result: resultForSocket
    };

    // Emit the update to the GM
    game.socket.emit('module.coffee-pub-blacksmith', {
        type: 'updateSkillRoll',
        data: rollData
    });

    // If GM, call the handler directly with the same prepared data
    if (game.user.isGM) {
        await handleSkillRollUpdate(rollData);
    }
}

// ================================================================== 
// ===== FOUNDRY ROLL SYSTEM ========================================
// ================================================================== 

/**
 * Foundry Roll System - Uses D&D5e APIs with robust fallbacks
 * This is the system users can choose when they want Foundry's default roll behavior
 */

/**
 * Core roll execution method for the Foundry roll system.
 * This is the robust, battle-tested roll execution logic with D&D5e API integration.
 * @param {object} message - The chat message object
 * @param {string} tokenId - The ID of the token being rolled for
 * @param {string} actorId - The ID of the actor being rolled for
 * @param {string} type - The type of roll being executed
 * @param {string} value - The value being rolled
 * @param {object} options - Roll options (e.g., { advantage: true })
 * @returns {Promise<object|null>} The roll result or null if failed
 */
export async function executeRollAndUpdate(message, tokenId, actorId, type, value, options = {}) {
    try {
        const flags = message.flags['coffee-pub-blacksmith'];
        if (!flags) return null;

        // Get the token and actor
        const actor = game.actors.get(actorId);
        if (!actor) {
            ui.notifications.error(`Could not find the actor (ID: ${actorId}) for this roll.`);
            return null;
        }
        
        // Check permissions
        if (!game.user.isGM && !actor.isOwner) {
            ui.notifications.warn("You don't have permission to roll for this character.");
            return null;
        }

        // Get user preference for roll system
        const diceRollToolSystem = game.settings.get('coffee-pub-blacksmith', 'diceRollToolSystem') ?? 'blacksmith';
        
        postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Using ${diceRollToolSystem} system for ${type}: ${value}`, null, true, false);

        // ROUTING LOGIC: Route to the selected system based on setting
        if (diceRollToolSystem === 'blacksmith') {
            // BLACKSMITH SYSTEM: Use our custom roll system
            postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Routing to BLACKSMITH roll system`, null, true, false);
            
            // Create roll options for Blacksmith system
            const rollOptions = { 
                advantage: options.advantage || false,
                disadvantage: options.disadvantage || false,
                situationalBonus: options.situationalBonus || 0,
                customFormula: options.customFormula || null
            };
            
            // Execute using Blacksmith system
            const roll = await _executeBuiltInRoll(actor, type, value, rollOptions);
            
            if (roll) {
                // Process the roll result and update the message
                await _processRollResultAndUpdate(message, tokenId, actorId, type, value, roll, options);
            }
            
        } else if (diceRollToolSystem === 'foundry') {
            // FOUNDRY SYSTEM: Use Foundry's built-in roll system
            postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Routing to FOUNDRY roll system`, null, true, false);
            
            // Create roll options for Foundry with chat suppression
            const rollOptions = { 
                chatMessage: false, 
                createMessage: false,
                advantage: options.advantage || false,
                disadvantage: options.disadvantage || false
            };
            
            let roll;

            // Execute the roll based on type (robust fallback system)
            switch (type) {
                case 'dice':
                    let formula = value;
                    if (options.advantage) formula = `2d20kh`;
                    else if (options.disadvantage) formula = `2d20kl`;
                    roll = new Roll(formula, actor.getRollData());
                    await roll.evaluate({ async: true });
                    rollCoffeePubDice(roll);
                    if (roll) roll.verboseFormula = _buildVerboseFormula(roll, actor);
                    break;
                case 'skill':
                    if (typeof game.dnd5e?.actions?.rollSkill === 'function') {
                        roll = await game.dnd5e.actions.rollSkill({ actor, skill: value, options: rollOptions });
                    } else if (typeof actor.rollSkillV2 === 'function') {
                        roll = await actor.rollSkillV2(value, rollOptions);
                    } else if (typeof actor.doRollSkill === 'function') {
                        roll = await actor.doRollSkill(value, rollOptions);
                    } else {
                        // Legacy fallback (may emit deprecation warnings in dnd5e >= 4.1)
                        roll = await actor.rollSkill(value, rollOptions);
                    }
                    if (roll) roll.verboseFormula = _buildVerboseFormula(roll, actor, CONFIG.DND5E.skills[value]?.ability);
                    break;
                case 'ability':
                    roll = await actor.rollAbilityTest(value, rollOptions);
                    if (roll) roll.verboseFormula = _buildVerboseFormula(roll, actor, value);
                    break;
                case 'save':
                    roll = (value === 'death') 
                        ? await actor.rollDeathSave(rollOptions) 
                        : await actor.rollSavingThrow(value, rollOptions);
                    if (roll) roll.verboseFormula = _buildVerboseFormula(roll, actor, value);
                    break;
                case 'tool': {
                    const toolIdentifier = value;
                    if (!toolIdentifier) throw new Error(`No tool identifier provided for actor ${actor.name}`);
                    
                    // Attempt to use the modern dnd5e API for tool checks
                    if (typeof actor.rollToolCheck === 'function') {
                        try {
                            postConsoleAndNotification(MODULE.NAME, `Attempting to roll tool '${toolIdentifier}' with rollToolCheck.`, "", true, false);
                            roll = await actor.rollToolCheck(toolIdentifier, rollOptions);
                        } catch (err) {
                            postConsoleAndNotification(MODULE.NAME, `actor.rollToolCheck failed for tool '${toolIdentifier}'. Falling back to manual roll. Error:`, err, true, false);
                            roll = undefined;
                        }
                    }

                    // If rollToolCheck is not available or failed, construct the roll manually
                    if (!roll) {
                        const item = actor.items.get(toolIdentifier) || actor.items.find(i => i.system.baseItem === toolIdentifier);
                        if (!item) throw new Error(`Tool item not found on actor: ${toolIdentifier}`);
                        
                        const rollData = actor.getRollData();
                        const ability = item.system.ability || "int";
                        
                        const parts = [];
                        if (options.advantage) parts.push('2d20kh');
                        else if (options.disadvantage) parts.push('2d20kl');
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
                        
                        roll = new Roll(formula, rollData);
                        await roll.evaluate({ async: true });
                        rollCoffeePubDice(roll);
                        if (roll) roll.verboseFormula = _buildVerboseFormula(roll, actor);
                    }
                    break;
                }
                default:
                    throw new Error(`Unsupported roll type: ${type}`);
            }
            
            if (roll) {
                // Process the roll result and update the message
                await _processRollResultAndUpdate(message, tokenId, actorId, type, value, roll, options);
            }
            
        } else {
            // Invalid setting, fall back to Blacksmith
            postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Invalid diceRollToolSystem setting: ${diceRollToolSystem}, falling back to Blacksmith`, null, true, false);
            
            const rollOptions = { 
                advantage: options.advantage || false,
                disadvantage: options.disadvantage || false,
                situationalBonus: options.situationalBonus || 0,
                customFormula: options.customFormula || null
            };
            
            const roll = await _executeBuiltInRoll(actor, type, value, rollOptions);
            
            if (roll) {
                // Process the roll result and update the message
                await _processRollResultAndUpdate(message, tokenId, actorId, type, value, roll, options);
            }
        }

        postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate: Roll completed successfully`, { type, value, system: diceRollToolSystem }, true, false);
        return true;
    } catch (err) {
        postConsoleAndNotification(MODULE.NAME, `executeRollAndUpdate error:`, err, true, false);
        ui.notifications.error(`Roll execution failed: ${err.message}`);
        return false;
    }
}

// ================================================================== 
// ===== BLACKSMITH ROLL SYSTEM ======================================
// ================================================================== 

/**
 * Blacksmith Roll System - Manual Roll creation with complete control
 * This is our custom system that users can choose for maximum control
 */

/**
 * Unified roll system that can handle both built-in and manual rolls.
 * @param {Actor} actor - The actor making the roll.
 * @param {string} type - The type of roll (skill, ability, save, tool, dice).
 * @param {string} value - The value for the roll (skill name, ability name, etc.).
 * @param {object} options - Roll options including useDialog, integrations, and custom modifiers.
 * @returns {Promise<Roll|null>} The roll result or null if failed.
 */
export async function executeRoll(actor, type, value, options = {}) {
    // Get user preferences for roll system integrations
    const diceRollToolSystem = game.settings.get('coffee-pub-blacksmith', 'diceRollToolSystem') ?? 'blacksmith';
    const useDialog = options.useDialog ?? (diceRollToolSystem === 'blacksmith');
    let advantage = options.advantage ?? false;
    let disadvantage = options.disadvantage ?? false;
    let useDiceSoNice = options.useDiceSoNice ?? game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice') ?? true;
    let customFormula = options.customFormula ?? null;
    let additionalModifiers = options.additionalModifiers ?? [];
    let situationalBonus = options.situationalBonus ?? 0;
    
    // Extract context for roll dialog
    const messageId = options.messageId;
    const tokenId = options.tokenId;

    // Debug logging
    postConsoleAndNotification(MODULE.NAME, `executeRoll called with:`, {
        type, value, diceRollToolSystem, useDialog, advantage, disadvantage,
        actorName: actor.name, actorType: actor.type
    }, true, false);

    try {
        let roll;

        // ROUTING LOGIC: Route to the selected system based on setting
        if (diceRollToolSystem === 'blacksmith') {
            // BLACKSMITH SYSTEM: Use our custom roll system with dialog
            postConsoleAndNotification(MODULE.NAME, `Routing to BLACKSMITH roll system`, null, true, false);
            
            if (useDialog) {
                // Show the RollDialog and let it handle the roll execution
                // The dialog will call _performRoll() internally and update the chat card
                postConsoleAndNotification(MODULE.NAME, `Showing RollDialog for Blacksmith system`, null, true, false);
                await showRollDialog(actor, type, value, options, messageId, tokenId);
                
                // The RollDialog handles everything, so we return null
                // The actual roll result will be processed by the dialog
                return null;
            } else {
                // No dialog requested, execute roll directly
                postConsoleAndNotification(MODULE.NAME, `Executing Blacksmith roll system without dialog`, null, true, false);
                roll = await _executeBuiltInRoll(actor, type, value, { 
                    ...options, 
                    advantage, 
                    disadvantage, 
                    useDiceSoNice, 
                    situationalBonus,
                    customFormula
                });
            }
        } else if (diceRollToolSystem === 'foundry') {
            // FOUNDRY SYSTEM: Use Foundry's built-in roll system
            postConsoleAndNotification(MODULE.NAME, `Routing to FOUNDRY roll system`, null, true, false);
            
            // For Foundry system, we need to call executeRollAndUpdate directly
            // This bypasses the dialog and uses Foundry's system
            if (messageId && tokenId) {
                // We have context, use the robust Foundry system
                postConsoleAndNotification(MODULE.NAME, `Using Foundry system with context (messageId: ${messageId}, tokenId: ${tokenId})`, null, true, false);
                
                // Call the Foundry system directly
                await executeRollAndUpdate(
                    game.messages.get(messageId), 
                    tokenId, 
                    actor.id, 
                    type, 
                    value, 
                    { ...options, advantage, disadvantage, situationalBonus, customFormula }
                );
                
                // Foundry system handles everything, return null to indicate success
                return null;
            } else {
                // No context, fall back to manual roll creation
                postConsoleAndNotification(MODULE.NAME, `No context for Foundry system, falling back to manual roll`, null, true, false);
                roll = await _executeBuiltInRoll(actor, type, value, { 
                    ...options, 
                    advantage, 
                    disadvantage, 
                    useDiceSoNice, 
                    situationalBonus,
                    customFormula
                });
            }
        } else {
            // Invalid setting, fall back to Blacksmith
            postConsoleAndNotification(MODULE.NAME, `Invalid diceRollToolSystem setting: ${diceRollToolSystem}, falling back to Blacksmith`, null, true, false);
            roll = await _executeBuiltInRoll(actor, type, value, { 
                ...options, 
                advantage, 
                disadvantage, 
                useDiceSoNice, 
                situationalBonus,
                customFormula
            });
        }

        // Process roll result if we have one (Blacksmith system or fallback)
        if (roll) {
            // Add verbose formula for display
            roll.verboseFormula = _buildVerboseFormula(roll, actor, 
                type === 'skill' ? CONFIG.DND5E.skills[value]?.ability : value);
            
            // Debug logging
            postConsoleAndNotification(MODULE.NAME, `Roll object ready:`, {
                hasToJSON: !!roll.toJSON,
                hasTotal: 'total' in roll,
                total: roll.total,
                type: roll.constructor.name,
                isRoll: roll instanceof Roll
            }, true, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, `Roll execution returned null/undefined`, null, true, false);
        }

        return roll;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Roll execution failed:`, error, true, false);
        return null;
    }
}

/**
 * Executes a roll by creating manual Roll objects for complete control.
 * This function handles all roll types by building formulas manually using DnD5e data.
 * @private
 */
async function _executeBuiltInRoll(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `Executing manual roll for ${type}: ${value}`, null, true, false);
    
    // We no longer need DnD5e options since we're creating manual rolls
    // Just pass through any additional options
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
        isRoll: result instanceof Roll,
        resultKeys: result ? Object.keys(result) : [],
        resultStructure: result ? JSON.stringify(result, null, 2) : 'null'
    }, true, false);
    
    return result;
}

/**
 * Builds a verbose formula string for tooltips from a Roll object.
 * Example: "12 (Roll) + 3 (Dexterity) + 2 (Proficiency) = 17"
 * @param {Roll} roll - The Roll object to parse.
 * @param {Actor} actor - The Actor performing the roll.
 * @param {string|null} abilityKey - The key for the ability score used (e.g., 'dex').
 * @returns {string} The verbose formula string.
 */
function _buildVerboseFormula(roll, actor, abilityKey = null) {
    if (!roll) return '';

    // Handle different roll object structures
    let terms = roll.terms;
    let total = roll.total;
    
    // If terms don't exist, try to extract from different properties
    if (!terms) {
        if (roll.roll?.terms) {
            terms = roll.roll.terms;
        } else if (roll.dice) {
            // For built-in rolls, we might have dice array instead of terms
            terms = roll.dice.flatMap(die => die.results || []);
        }
    }
    
    // If total doesn't exist, try to extract from different properties
    if (total === undefined) {
        total = roll.roll?.total || roll.total || 0;
    }

    if (!terms || terms.length === 0) {
        // Fallback: just show the total
        return `Total: ${total}`;
    }

    const parts = [];
    let calculatedTotal = 0;

    for (const term of terms) {
        if (term && typeof term === 'object' && 'total' in term) {
            // This looks like a DiceTerm
            parts.push(`${term.total} (Roll)`);
            calculatedTotal += term.total;
        } else if (typeof term === 'number') {
            if (term !== 0) {
                let label = '';
                if (abilityKey && Math.abs(term) === Math.abs(actor.system.abilities[abilityKey]?.mod || 0)) {
                    label = ` (${abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1)})`;
                } else if (Math.abs(term) === (actor.system.attributes.prof || 0)) {
                    label = ' (Proficiency)';
                }
                parts.push(`${term}${label}`);
                calculatedTotal += term;
            }
        } else if (term.result !== undefined) {
            // Handle dice results from built-in rolls
            parts.push(`${term.result} (Roll)`);
            calculatedTotal += term.result;
        }
    }

    return parts.length > 0 ? `${parts.join(' + ')} = ${calculatedTotal}` : `Total: ${total}`;
}

// ================================================================== 
// ===== ROLL DIALOG SYSTEM =========================================
// ================================================================== 

/**
 * Shows a roll configuration dialog for the user to configure roll options.
 * @param {Actor} actor - The actor making the roll.
 * @param {string} type - The type of roll (skill, ability, save, tool, dice).
 * @param {string} value - The value for the roll (skill name, ability name, etc.).
 * @param {object} options - Initial roll options.
 * @returns {Promise<object|null>} The configured roll options or null if cancelled.
 */
export async function showRollDialog(actor, type, value, options = {}, messageId = null, tokenId = null) {
    try {
        // Build the roll data for the template
        const rollData = await _buildRollData(actor, type, value, options, messageId, tokenId);
        
        // Debug logging
        postConsoleAndNotification(MODULE.NAME, `showRollDialog: Built roll data:`, rollData, true, false);
        
        // Create and render the dialog
        const dialog = new RollDialog({ rollData });
        await dialog.render(true);
        
        // Wait for the dialog to close and return the options
        return new Promise((resolve) => {
            dialog.options.onClose = resolve;
        });
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `showRollDialog error:`, error, true, false);
        return null;
    }
}

/**
 * Builds the data needed for the roll dialog template.
 * @private
 */
async function _buildRollData(actor, type, value, options, messageId = null, tokenId = null) {
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
        diceSoNiceEnabled: game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice') ?? true,
        // CRITICAL: Add context for existing system
        messageId: messageId,
        tokenId: tokenId,
        // CRITICAL: Add roll type and value for Blacksmith system
        rollTypeKey: type,
        rollValueKey: value,
        actorId: actor.id
    };
}

// ================================================================== 
// ===== ROLL DIALOG CLASS ===========================================
// ================================================================== 

/**
 * Roll Dialog Application V2 class for handling the roll configuration UI.
 * Based on the working SkillCheckDialog pattern.
 */
export class RollDialog extends Application {
    constructor(data = {}) {
        super();
        this.rollData = data.rollData || {};
        
        // Set default preferences (no settings call needed)
        this.userPreferences = {
            showRollExplanation: true,
            showDC: true,
            useDiceSoNice: true
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'roll-dialog-window',
            template: 'modules/coffee-pub-blacksmith/templates/roll-dialog.hbs',
            classes: ['coffee-pub-blacksmith', 'roll-dialog-window'],
            title: 'Roll Configuration',
            width: 800,
            height: 650,
            resizable: true
        });
    }

    getData() {
        // Debug: Log what we actually have
        postConsoleAndNotification(MODULE.NAME, `RollDialog getData: this.rollData =`, this.rollData, true, false);
        postConsoleAndNotification(MODULE.NAME, `RollDialog getData: this.rollData keys =`, Object.keys(this.rollData), true, false);
        
        // Return the roll data for the template
        return {
            rollTitle: this.rollData.rollTitle || 'Roll Check',
            actorName: this.rollData.actorName || 'Unknown Actor',
            rollType: this.rollData.rollType || 'Unknown Type',
            rollFormula: this.rollData.rollFormula || '1d20',
            rollTotal: this.rollData.rollTotal || '?',
            baseRoll: this.rollData.baseRoll || '1d20',
            abilityMod: this.rollData.abilityMod || 0,
            proficiencyBonus: this.rollData.proficiencyBonus || 0,
            otherModifiers: this.rollData.otherModifiers || 0,
            diceSoNiceEnabled: this.rollData.diceSoNiceEnabled ?? true
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Find and bind the roll buttons
        html.find('.roll-advantage').on('click', () => {
            postConsoleAndNotification(MODULE.NAME, `RollDialog: Roll Advantage clicked`, null, true, false);
            // Execute the roll with advantage
            this._executeRoll('advantage');
        });
        
        html.find('.roll-normal').on('click', () => {
            postConsoleAndNotification(MODULE.NAME, `RollDialog: Roll Normal clicked`, null, true, false);
            // Execute the roll normally
            this._executeRoll('normal');
        });
        
        html.find('.roll-disadvantage').on('click', () => {
            postConsoleAndNotification(MODULE.NAME, `RollDialog: Roll Disadvantage clicked`, null, true, false);
            // Execute the roll with disadvantage
            this._executeRoll('disadvantage');
        });
        
        postConsoleAndNotification(MODULE.NAME, `RollDialog activateListeners: All buttons bound`, null, true, false);
    }
    
    /**
     * Execute the actual roll based on the selected option
     * @param {string} rollType - 'normal', 'advantage', or 'disadvantage'
     */
    async _executeRoll(rollType) {
        try {
            postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Starting ${rollType} roll`, null, true, false);
            
            // Get situational bonus from input
            const situationalBonus = parseInt(this.element.find('.roll-situational-bonus').val()) || 0;
            
            // Create roll options
            const rollOptions = {
                advantage: rollType === 'advantage',
                disadvantage: rollType === 'disadvantage',
                situationalBonus: situationalBonus
            };
            
            postConsoleAndNotification(MODULE.NAME, `RollDialog _executeRoll: Roll options:`, rollOptions, true, false);
            
            // Actually execute the roll using the Blacksmith roll system
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

            const rollDataForSocket = {
                messageId: rollData.messageId,
                tokenId: rollData.tokenId,
                result: resultForSocket
            };

            // Emit the update to the GM (same as old system)
            game.socket.emit('module.coffee-pub-blacksmith', {
                type: 'updateSkillRoll',
                data: rollDataForSocket
            });

            // If GM, call the handler directly with the same prepared data
            if (game.user.isGM) {
                await handleSkillRollUpdate(rollDataForSocket);
            }
            
            return result;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollDialog _performRoll error:`, error, true, false);
            throw error;
        }
    }
}
