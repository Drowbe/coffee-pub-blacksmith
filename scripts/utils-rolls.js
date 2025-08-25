// ================================================================== 
// ===== UNIFIED ROLL SYSTEM ========================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, rollCoffeePubDice } from './global.js';

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

    // Debug logging
    postConsoleAndNotification(MODULE.NAME, `executeRoll called with:`, {
        type, value, diceRollToolSystem, useDialog, advantage, disadvantage,
        actorName: actor.name, actorType: actor.type
    }, true, false);

    try {
        let roll;

        // Show roll dialog if using Blacksmith system
        if (useDialog && diceRollToolSystem === 'blacksmith') {
            const dialogOptions = await showRollDialog(actor, type, value, options);
            if (dialogOptions) {
                // Update our options with dialog results
                advantage = dialogOptions.advantage;
                disadvantage = dialogOptions.disadvantage;
                useDiceSoNice = dialogOptions.useDiceSoNice;
                situationalBonus = dialogOptions.situationalBonus;
                customFormula = dialogOptions.customModifier;
            } else {
                // User cancelled the dialog
                return null;
            }
        } else if (diceRollToolSystem === 'foundry') {
            // TODO: Implement Foundry roll system integration
            postConsoleAndNotification(MODULE.NAME, `Foundry roll system not yet implemented, falling back to Blacksmith system`, null, true, false);
            // For now, fall back to Blacksmith system
            const dialogOptions = await showRollDialog(actor, type, value, options);
            if (dialogOptions) {
                advantage = dialogOptions.advantage;
                disadvantage = dialogOptions.disadvantage;
                useDiceSoNice = dialogOptions.useDiceSoNice;
                situationalBonus = dialogOptions.situationalBonus;
                customFormula = dialogOptions.customModifier;
            } else {
                return null;
            }
        }

        // Always use manual roll creation for complete control and chat suppression
        postConsoleAndNotification(MODULE.NAME, `Using manual roll method (complete control)`, null, true, false);
        roll = await _executeBuiltInRoll(actor, type, value, { 
            ...options, 
            advantage, 
            disadvantage, 
            useDiceSoNice, 
            situationalBonus,
            customFormula
        });

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

// Removed _executeManualRoll function - no longer needed since we always use built-in methods

// Removed _buildRollFormula function - no longer needed since we always use built-in methods

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

/**
 * Test function to demonstrate the roll dialog functionality.
 * This can be called from the console or used in macros.
 * @param {string} actorId - The actor to roll for.
 * @param {string} type - The type of roll (skill, ability, save, tool, dice).
 * @param {string} value - The value for the roll.
 * @param {boolean} showDialog - Whether to show the roll dialog.
 */
export async function testRollDialog(actorId, type = 'skill', value = 'ins', showDialog = true) {
    const actor = game.actors.get(actorId);
    if (!actor) {
        console.error('Actor not found:', actorId);
        return;
    }
    
    const options = {
        useDialog: showDialog,
        advantage: false,
        disadvantage: false
    };
    
    postConsoleAndNotification(MODULE.NAME, `Testing roll dialog for ${actor.name} - ${type}: ${value}`, null, true, false);
    const result = await executeRoll(actor, type, value, options);
    
    if (result) {
        postConsoleAndNotification(MODULE.NAME, `Roll result:`, result, true, false);
        console.log('Roll result:', result);
        console.log('Roll total:', result.total);
        console.log('Roll formula:', result.verboseFormula);
    } else {
        postConsoleAndNotification(MODULE.NAME, `Roll was cancelled or failed`, null, true, false);
        console.log('Roll was cancelled or failed');
    }
    
    return result;
}

// All roll types now use manual Roll creation for complete control and chat suppression

/**
 * Shows a roll configuration dialog for the user to configure roll options.
 * @param {Actor} actor - The actor making the roll.
 * @param {string} type - The type of roll (skill, ability, save, tool, dice).
 * @param {string} value - The value for the roll (skill name, ability name, etc.).
 * @param {object} options - Initial roll options.
 * @returns {Promise<object|null>} The configured roll options or null if cancelled.
 */
export async function showRollDialog(actor, type, value, options = {}) {
    try {
        // Build the roll data for the template
        const rollData = await _buildRollData(actor, type, value, options);
        
        // Debug logging
        postConsoleAndNotification(MODULE.NAME, `showRollDialog: Built roll data:`, rollData, true, false);
        
        // Create and render the dialog
        const dialog = new RollDialog(rollData);
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
async function _buildRollData(actor, type, value, options) {
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
        rollTitle: `${type.charAt(0).toUpperCase() + type.slice(1)} Check`,
        actorName: actor.name || 'Unknown Actor',
        rollType: type === 'skill' ? `Skill: ${skillData?.label || value || 'Unknown'}` : 
                  type === 'ability' ? `Ability: ${(value || 'Unknown').toUpperCase()}` :
                  type === 'save' ? `Saving Throw: ${(value || 'Unknown').toUpperCase()}` :
                  type === 'tool' ? `Tool: ${value || 'Unknown'}` : `Dice: ${value || 'Unknown'}`,
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
 * Roll Dialog Application class for handling the roll configuration UI.
 */
class RollDialog extends Application {
    constructor(rollData) {
        super();
        this.rollData = rollData;
        this.options = {
            advantage: false,
            disadvantage: false,
            situationalBonus: 0,
            customModifier: '',
            rollMode: 'public',
            useDiceSoNice: true
        };
    }
    
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'roll-dialog-window',
            template: 'modules/coffee-pub-blacksmith/templates/window-roll.hbs',
            popOut: true,
            minimizable: false,
            resizable: true,
            width: 600,
            height: 500,
            classes: ['roll-dialog-window']
        });
    }
    
    getData() {
        try {
            // Ensure all required fields have fallback values
            const safeData = {
                rollTitle: this.rollData?.rollTitle || 'Roll Check',
                actorName: this.rollData?.actorName || 'Unknown Actor',
                rollType: this.rollData?.rollType || 'Unknown Type',
                rollFormula: this.rollData?.rollFormula || '1d20',
                rollTotal: this.rollData?.rollTotal || '?',
                baseRoll: this.rollData?.baseRoll || '1d20',
                abilityMod: this.rollData?.abilityMod || 0,
                proficiencyBonus: this.rollData?.proficiencyBonus || 0,
                otherModifiers: this.rollData?.otherModifiers || 0,
                diceSoNiceEnabled: this.rollData?.diceSoNiceEnabled ?? true
            };
            
            postConsoleAndNotification(MODULE.NAME, `RollDialog getData:`, safeData, true, false);
            return safeData;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollDialog getData error:`, error, true, false);
            // Return safe fallback data
            return {
                rollTitle: 'Roll Check',
                actorName: 'Unknown Actor',
                rollType: 'Unknown Type',
                rollFormula: '1d20',
                rollTotal: '?',
                baseRoll: '1d20',
                abilityMod: 0,
                proficiencyBonus: 0,
                otherModifiers: 0,
                diceSoNiceEnabled: true
            };
        }
    }
    
    activateListeners(html) {
        super.activateListeners(html);
        
        // Situational bonus input
        html.find('.roll-situational-bonus').on('change', (event) => {
            this.options.situationalBonus = parseInt(event.target.value) || 0;
        });
        
        // Custom modifier input
        html.find('.roll-custom-modifier').on('change', (event) => {
            this.options.customModifier = event.target.value;
        });
        
        // Roll mode select
        html.find('.roll-mode-select').on('change', (event) => {
            this.options.rollMode = event.target.value;
        });
        
        // Dice So Nice checkbox
        html.find('.roll-dice-so-nice').on('change', (event) => {
            this.options.useDiceSoNice = event.target.checked;
        });
        
        
        
        // Roll buttons
        html.find('.roll-advantage').on('click', () => {
            this.options.advantage = true;
            this.options.disadvantage = false;
            if (this.options.onClose) this.options.onClose(this.options);
            this.close();
        });
        
        html.find('.roll-normal').on('click', () => {
            this.options.advantage = false;
            this.options.disadvantage = false;
            if (this.options.onClose) this.options.onClose(this.options);
            this.close();
        });
        
        html.find('.roll-disadvantage').on('click', () => {
            this.options.advantage = false;
            this.options.disadvantage = true;
            if (this.options.onClose) this.options.onClose(this.options);
            this.close();
        });
        
        html.find('.cancel-roll').on('click', () => {
            if (this.options.onClose) this.options.onClose(null);
            this.close();
        });
    }
    
    async close(options = {}) {
        await super.close(options);
        return this.options;
    }
    
    async render(force = false, options = {}) {
        try {
            return await super.render(force, options);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollDialog render error:`, error, true, false);
            throw error;
        }
    }
}
