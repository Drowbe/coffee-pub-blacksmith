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
    const useDialog = options.useDialog ?? game.settings.get('coffee-pub-blacksmith', 'rollSystemDefaultShowDialog') ?? false;
    const advantage = options.advantage ?? false;
    const disadvantage = options.disadvantage ?? false;
    const useDiceSoNice = options.useDiceSoNice ?? game.settings.get('coffee-pub-blacksmith', 'rollSystemEnableDiceSoNice') ?? true;
    const useMidiQOL = options.useMidiQOL ?? game.settings.get('coffee-pub-blacksmith', 'rollSystemEnableMidiQOL') ?? true;
    const customFormula = options.customFormula ?? null;
    const additionalModifiers = options.additionalModifiers ?? [];
    const situationalBonus = options.situationalBonus ?? 0;
    const enableCustomModifiers = game.settings.get('coffee-pub-blacksmith', 'rollSystemEnableCustomModifiers') ?? true;
    const enableSituationalBonuses = game.settings.get('coffee-pub-blacksmith', 'rollSystemEnableSituationalBonuses') ?? true;
    const enableAdvantageDisadvantage = game.settings.get('coffee-pub-blacksmith', 'rollSystemEnableAdvantageDisadvantage') ?? true;
    const enableCustomFormulas = game.settings.get('coffee-pub-blacksmith', 'rollSystemEnableCustomFormulas') ?? true;

    try {
        let roll;

        if (useDialog) {
            // Use DnD5e built-in methods (show dialog)
            roll = await _executeBuiltInRoll(actor, type, value, { ...options, useDialog, useDiceSoNice, useMidiQOL });
        } else {
            // Use manual roll (bypass dialog, full control)
            roll = await _executeManualRoll(actor, type, value, { ...options, useDialog, useDiceSoNice, useMidiQOL, customFormula, additionalModifiers, situationalBonus });
        }

                    if (roll) {
            // Add verbose formula for display
            roll.verboseFormula = _buildVerboseFormula(roll, actor, 
                type === 'skill' ? CONFIG.DND5E.skills[value]?.ability : value);
            
            // Ensure the roll object has the necessary methods for chat card updates
            if (!roll.toJSON) {
                // If it's a built-in roll result, wrap it to ensure compatibility
                roll = _ensureRollCompatibility(roll);
            }
            
            // Debug logging
            postConsoleAndNotification(MODULE.NAME, `Roll object after compatibility check:`, {
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
 * Executes a built-in DnD5e roll (shows dialog).
 * @private
 */
async function _executeBuiltInRoll(actor, type, value, options = {}) {
    postConsoleAndNotification(MODULE.NAME, `Executing built-in roll for ${type}: ${value}`, null, true, false);
    
    let result;
    switch (type) {
        case 'skill':
            result = await actor.rollSkill({ skill: value });
            break;
        case 'ability':
            result = await actor.rollAbilityCheck({ ability: value });
            break;
        case 'save':
            if (value === 'death') {
                result = await actor.rollDeathSave();
            } else {
                result = await actor.rollSavingThrow({ ability: value });
            }
            break;
        case 'tool':
            if (typeof actor.rollToolCheck === 'function') {
                result = await actor.rollToolCheck(value, options);
            } else {
                // Fall through to manual roll if rollToolCheck not available
                result = await _executeManualRoll(actor, type, value, options);
            }
            break;
        case 'dice':
        default:
            // Fall back to manual roll for unsupported types
            result = await _executeManualRoll(actor, type, value, options);
            break;
    }
    
    postConsoleAndNotification(MODULE.NAME, `Built-in roll result:`, {
        type: result?.constructor.name,
        hasToJSON: !!result?.toJSON,
        hasRoll: !!result?.roll,
        total: result?.total,
        rollTotal: result?.roll?.total
    }, true, false);
    
    return result;
}

/**
 * Executes a manual roll (bypasses dialog, full control).
 * @private
 */
async function _executeManualRoll(actor, type, value, options = {}) {
    const {
        advantage = false,
        disadvantage = false,
        useDiceSoNice = true,
        useMidiQOL = true,
        customFormula = null,
        additionalModifiers = [],
        situationalBonus = 0
    } = options;

    let formula = _buildRollFormula(actor, type, value, advantage, disadvantage);
    
    // Add situational bonuses
    if (situationalBonus !== 0) {
        formula += ` + ${situationalBonus}`;
    }

    // Add custom modifiers
    if (additionalModifiers?.length) {
        for (const mod of additionalModifiers) {
            if (typeof mod.value === 'number') {
                formula += ` + ${mod.value}`;
            } else if (typeof mod.value === 'string') {
                formula += ` + ${mod.value}`;
            }
        }
    }

    // Override with custom formula if provided
    if (customFormula) {
        formula = customFormula;
    }

    // Create and evaluate the roll
    const roll = new Roll(formula, actor.getRollData());
    await roll.evaluate({ async: true });

    // Integrate with Dice So Nice if enabled and available
    if (useDiceSoNice && game.dice3d) {
        // Dice So Nice will automatically handle the roll display
    }

    // Integrate with MidiQOL if enabled and available
    if (useMidiQOL && game.modules.get('midi-qol')?.active) {
        // MidiQOL will automatically process the roll
    }

    // Use our custom dice rolling system
    rollCoffeePubDice(roll);

    return roll;
}

/**
 * Builds the base roll formula for a given type and value.
 * @private
 */
function _buildRollFormula(actor, type, value, advantage = false, disadvantage = false) {
    const parts = [];

    // Base roll
    if (advantage) parts.push('2d20kh');
    else if (disadvantage) parts.push('2d20kl');
    else parts.push('1d20');

    switch (type) {
        case 'skill':
            // Get the skill's total modifier (includes all bonuses)
            const skillMod = actor.system.skills[value]?.total || 0;
            if (skillMod !== 0) {
                parts.push(skillMod);
            } else {
                // Fallback: calculate manually if total is not available
                const skillData = CONFIG.DND5E.skills[value];
                if (skillData) {
                    const ability = skillData.ability;
                    const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${ability}.mod`) || 0;
                    if (abilityMod !== 0) parts.push(abilityMod);
                    
                    const profBonus = actor.system.attributes.prof || 0;
                    const skillProf = foundry.utils.getProperty(actor.system.skills, `${value}.value`) || 0;
                    if (skillProf > 0) parts.push(profBonus);
                    
                    const skillBonus = foundry.utils.getProperty(actor.system.skills, `${value}.bonuses.check`) || 0;
                    if (skillBonus !== 0) parts.push(skillBonus);
                }
            }
            break;

        case 'ability':
            const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${value}.mod`) || 0;
            if (abilityMod !== 0) parts.push(abilityMod);
            break;

        case 'save':
            const saveMod = actor.system.abilities[value]?.save || 0;
            if (saveMod !== 0) parts.push(saveMod);
            break;

        case 'tool':
            const item = actor.items.get(value) || actor.items.find(i => i.system.baseItem === value);
            if (item) {
                const ability = item.system.ability || "int";
                const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${ability}.mod`) || 0;
                if (abilityMod !== 0) parts.push(abilityMod);
                
                const profBonus = actor.system.attributes.prof || 0;
                if (item.system.proficient > 0) {
                    parts.push(profBonus);
                }
            }
            break;

        case 'dice':
            // For custom dice, the formula is already set in the parts array
            break;
    }

    return parts.join(' + ');
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

/**
 * Ensures roll objects from built-in DnD5e methods are compatible with our chat card system.
 * @private
 */
function _ensureRollCompatibility(rollResult) {
    // Debug logging
    postConsoleAndNotification(MODULE.NAME, `Ensuring roll compatibility for:`, {
        type: rollResult.constructor.name,
        hasToJSON: !!rollResult.toJSON,
        hasRoll: !!rollResult.roll,
        rollType: rollResult.roll?.constructor.name,
        total: rollResult.total,
        rollTotal: rollResult.roll?.total,
        isArray: Array.isArray(rollResult),
        arrayLength: Array.isArray(rollResult) ? rollResult.length : 'N/A'
    }, true, false);

    // If it already has toJSON, it's already compatible
    if (rollResult.toJSON) {
        postConsoleAndNotification(MODULE.NAME, `Roll already compatible, returning as-is`, null, true, false);
        return rollResult;
    }

    // For DnD5e built-in rolls, we need to extract the actual Roll object
    let actualRoll = rollResult;
    
    // Handle Array-type roll results (unexpected but observed)
    if (Array.isArray(rollResult)) {
        postConsoleAndNotification(MODULE.NAME, `Roll result is an Array, examining contents:`, rollResult, true, false);
        
        // Look for Roll objects or roll data in the array
        let foundRoll = null;
        let foundTotal = null;
        
        // Log the full array structure for debugging
        postConsoleAndNotification(MODULE.NAME, `Full array structure:`, JSON.stringify(rollResult, null, 2), true, false);
        
        for (let i = 0; i < rollResult.length; i++) {
            const item = rollResult[i];
            postConsoleAndNotification(MODULE.NAME, `Array item ${i}:`, {
                type: item?.constructor.name,
                hasTotal: 'total' in item,
                total: item?.total,
                isRoll: item instanceof Roll,
                keys: item ? Object.keys(item) : [],
                fullItem: item
            }, true, false);
            
            if (item instanceof Roll) {
                foundRoll = item;
                postConsoleAndNotification(MODULE.NAME, `Found Roll instance at index ${i}`, null, true, false);
                break;
            } else if (item && typeof item === 'object' && 'total' in item) {
                foundTotal = item.total;
                postConsoleAndNotification(MODULE.NAME, `Found total value at index ${i}: ${foundTotal}`, null, true, false);
            } else if (item && typeof item === 'object' && 'result' in item) {
                // Some roll systems use 'result' instead of 'total'
                foundTotal = item.result;
                postConsoleAndNotification(MODULE.NAME, `Found result value at index ${i}: ${foundTotal}`, null, true, false);
            } else if (typeof item === 'number') {
                // Direct numeric value
                foundTotal = item;
                postConsoleAndNotification(MODULE.NAME, `Found numeric value at index ${i}: ${foundTotal}`, null, true, false);
            }
        }
        
        if (foundRoll) {
            actualRoll = foundRoll;
        } else {
            // Create a new Roll instance with the found total
            const formula = '1d20'; // Default formula for skill checks
            actualRoll = new Roll(formula);
            actualRoll.total = foundTotal || 0;
            postConsoleAndNotification(MODULE.NAME, `Created new Roll instance from array data with total: ${actualRoll.total}`, null, true, false);
        }
    } else if (rollResult.roll && rollResult.roll instanceof Roll) {
        actualRoll = rollResult.roll;
        postConsoleAndNotification(MODULE.NAME, `Found Roll instance in roll.roll`, null, true, false);
    } else if (rollResult.roll && typeof rollResult.roll === 'object') {
        // If roll.roll exists but isn't a Roll instance, try to create one
        const formula = rollResult.roll.formula || '1d20';
        const data = rollResult.roll.data || {};
        actualRoll = new Roll(formula, data);
        actualRoll.total = rollResult.roll.total || rollResult.total || 0;
        actualRoll.terms = rollResult.roll.terms || [];
        postConsoleAndNotification(MODULE.NAME, `Created new Roll instance from roll.roll data`, null, true, false);
    } else {
        // Fallback: create a basic Roll instance
        actualRoll = new Roll('1d20');
        actualRoll.total = 0;
        postConsoleAndNotification(MODULE.NAME, `Created fallback Roll instance`, null, true, false);
    }

    // Create a wrapper object that provides the necessary methods
    const compatibleRoll = {
        // Copy all properties from the original roll result
        ...rollResult,
        
        // Add the missing toJSON method
        toJSON() {
            // Extract the essential roll data for chat card updates
            return {
                total: actualRoll.total || rollResult.total || rollResult.roll?.total || 0,
                formula: actualRoll.formula || rollResult.formula || rollResult.roll?.formula || '',
                terms: actualRoll.terms || rollResult.terms || rollResult.roll?.terms || [],
                dice: actualRoll.dice || rollResult.dice || rollResult.roll?.dice || [],
                results: actualRoll.results || rollResult.results || rollResult.roll?.results || [],
                success: rollResult.success,
                failure: rollResult.failure,
                critical: rollResult.critical,
                fumble: rollResult.fumble
            };
        },
        
        // Ensure we have the verboseFormula property
        get verboseFormula() {
            return this._verboseFormula || '';
        },
        
        set verboseFormula(value) {
            this._verboseFormula = value;
        },
        
        // Add other essential Roll properties
        get total() {
            return actualRoll.total || rollResult.total || rollResult.roll?.total || 0;
        },
        
        get formula() {
            return actualRoll.formula || rollResult.formula || rollResult.roll?.formula || '';
        },
        
        get terms() {
            return actualRoll.terms || rollResult.terms || rollResult.roll?.terms || [];
        }
    };

    return compatibleRoll;
}
