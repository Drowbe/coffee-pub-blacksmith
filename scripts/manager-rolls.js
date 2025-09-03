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
        rollData.cinemaMode = rollDetails.isCinematic;
        rollData.label = rollDetails.label; // Pass the roll title from data-roll-title
        
        // Add additional context for subtitle building
        postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Original rollDetails for context:`, {
            dc: rollDetails.dc,
            groupRoll: rollDetails.groupRoll,
            actorsLength: rollDetails.actors.length,
            defenderRollType: rollDetails.defenderRollType,
            defenderRollValue: rollDetails.defenderRollValue
        }, true, false);
        
        rollData.dc = rollDetails.dc;
        rollData.isGroupRoll = rollDetails.groupRoll;
        rollData.hasMultipleGroups = rollDetails.actors.length > 1 || (rollDetails.defenderRollType && rollDetails.defenderRollValue);
        rollData.skillName = rollData.rollSubtitle; // This will be the skill name from prepareRollData
        
        // Get defender skill name properly formatted
        if (rollDetails.defenderRollType && rollDetails.defenderRollValue) {
            if (rollDetails.defenderRollType === 'skill') {
                const defenderActor = game.actors.get(rollDetails.actors[0]?.actorId); // Assuming same actor for now
                const defenderSkillData = defenderActor?.system?.skills?.[rollDetails.defenderRollValue];
                rollData.defenderSkillName = defenderSkillData?.label || rollDetails.defenderRollValue;
            } else {
                rollData.defenderSkillName = rollDetails.defenderRollValue.toUpperCase();
            }
        }
        
        // Open appropriate mode for rolling
        if (mode === 'cinema') {
            // Check if cinema overlay already exists (from initial request)
            const existingOverlay = $('#cpb-cinematic-overlay');
            if (existingOverlay.length === 0) {
            await showCinemaOverlay(rollData);
            } else {
                postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Cinema overlay already exists, skipping creation`, null, true, false);
            }
        } else {
            // Window mode - wait for user interaction
            postConsoleAndNotification(MODULE.NAME, `orchestrateRoll: Passing data to showRollWindow:`, {
                dc: rollData.dc,
                isGroupRoll: rollData.isGroupRoll,
                hasMultipleGroups: rollData.hasMultipleGroups,
                skillName: rollData.skillName,
                defenderSkillName: rollData.defenderSkillName,
                label: rollData.label
            }, true, false);
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
        postConsoleAndNotification(MODULE.NAME, `processRoll: About to check dice animation`, { 
            hasDice3d: !!game.dice3d, 
            rollFormula: roll.formula, 
            rollTotal: roll.total,
            diceArray: roll.dice,
            diceLength: roll.dice?.length 
        }, true, false);
        
        // Check if Dice So Nice is enabled and available
        const diceSoNiceEnabled = game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice');
        if (game.dice3d && diceSoNiceEnabled) {
            try {
                postConsoleAndNotification(MODULE.NAME, `processRoll: Showing dice animation for roll`, { formula: roll.formula, total: roll.total }, true, false);
                const animationShown = await game.dice3d.showForRoll(roll, game.user, true, null, false, null, null, {ghost: false, secret: false});
                postConsoleAndNotification(MODULE.NAME, `processRoll: Dice animation result`, { animationShown }, true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Dice animation error:`, error, true, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `processRoll: Dice So Nice not available or disabled`, { dice3d: !!game.dice3d, enabled: diceSoNiceEnabled }, true, false);
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
        
        // Create post-roll verbose formula showing actual dice results
        const postRollVerboseFormula = createPostRollVerboseFormula(roll, rollData);
        resultForSocket.verboseFormula = postRollVerboseFormula;
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
        
        // Cinema overlay updates are now handled by the new system
        if (rollData.cinemaMode) {
            postConsoleAndNotification(MODULE.NAME, `deliverRollResults: Cinema mode detected, calling updateCinemaOverlay`, null, true, false);
            await updateCinemaOverlay(rollResults, context);
            
            // Emit cinema update to all clients for synchronization
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForEveryone("updateCinemaOverlay", {
                    type: "updateCinemaOverlay",
                    rollResults: {
                        roll: resultForSocket,
                        rollData: rollData
                    },
                    context: context
                });
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `deliverRollResults: Not cinema mode, rollData.cinemaMode:`, rollData.cinemaMode, true, false);
            
            // Play sound for normal window mode (same as cinema mode)
            let d20Roll = null;
            
            // First try the terms structure (newer Foundry format)
            if (roll?.terms) {
                for (const term of roll.terms) {
                    if ((term.class === 'D20Die' || (term.class === 'Die' && term.faces === 20)) && term.results && term.results.length > 0) {
                        // For advantage/disadvantage, find the active result
                        if (term.results.length === 2) {
                            // This is advantage/disadvantage - find the active result
                            const activeResult = term.results.find(r => r.active === true);
                            if (activeResult) {
                                d20Roll = activeResult.result;
                            } else {
                                // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                                const isDisadvantage = term.modifiers && term.modifiers.includes('kl');
                                d20Roll = isDisadvantage ? term.results[0].result : term.results[term.results.length - 1].result;
                            }
                        } else {
                            // Single d20 roll
                            d20Roll = term.results[0].result;
                        }
                        break;
                    }
                }
            }
            
            // Fallback to dice structure (older format)
            if (d20Roll === null && roll?.dice) {
                for (const die of roll.dice) {
                    if (die.faces === 20 && die.results && die.results.length > 0) {
                        // For advantage/disadvantage, find the active result
                        if (die.results.length === 2) {
                            // This is advantage/disadvantage - find the active result
                            const activeResult = die.results.find(r => r.active === true);
                            if (activeResult) {
                                d20Roll = activeResult.result;
                            } else {
                                // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                                const isDisadvantage = die.modifiers && die.modifiers.includes('kl');
                                d20Roll = isDisadvantage ? die.results[0].result : die.results[die.results.length - 1].result;
                            }
                        } else {
                            // Single d20 roll
                            d20Roll = die.results[0].result;
                        }
                        break;
                    }
                }
            }
            
            // Play sound based on d20 result (same logic as cinema mode)
            let individualSound;
            if (d20Roll === 20) {
                individualSound = COFFEEPUB.SOUNDROLLCRITICAL;
            } else if (d20Roll === 1) {
                individualSound = COFFEEPUB.SOUNDROLLFUMBLE;
            } else {
                individualSound = COFFEEPUB.SOUNDROLLCOMPLETE;
            }
            
            import('./api-common.js').then(({ playSound }) => {
                playSound(individualSound, COFFEEPUB.SOUNDVOLUMENORMAL);
            });
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
 * Get the appropriate FontAwesome dice icon based on the roll formula
 * @param {string} rollFormula - The roll formula (e.g., "1d20", "2d6", "1d100", "d100")
 * @returns {string} FontAwesome icon class
 */
function getDiceIcon(rollFormula) {
    // Extract the dice type from the formula
    // Handle both formats: "1d20" and "d20"
    const diceMatch = rollFormula.match(/(\d*)d(\d+)/);
    if (!diceMatch) {
        return 'fas fa-dice-d20'; // Default to d20
    }
    
    const diceType = parseInt(diceMatch[2]);
    
    switch (diceType) {
        case 2:
            return 'fas fa-coin';
        case 4:
            return 'fas fa-dice-d4';
        case 6:
            return 'fas fa-dice-d6';
        case 8:
            return 'fas fa-dice-d8';
        case 10:
            return 'fas fa-dice-d10';
        case 12:
            return 'fas fa-dice-d12';
        case 20:
            return 'fas fa-dice-d20';
        case 100:
            return 'fas fa-hundred-points';
        default:
            return 'fas fa-dice-d20'; // Default fallback
    }
}

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
    
    // Create pre-roll verbose formula for tooltips
    const preRollVerboseParts = [];
    preRollVerboseParts.push('1d20 roll');
    
    if (abilityMod !== 0) preRollVerboseParts.push(`${abilityMod} ${abilityKey}`);
    
    if (type === 'skill') {
        const isProficient = foundry.utils.getProperty(actor.system.skills, `${value}.value`) > 0;
        if (isProficient) preRollVerboseParts.push(`${profBonus} prof`);
    } else if (type === 'save') {
        const isProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) || false;
        if (isProficient) preRollVerboseParts.push(`${profBonus} prof`);
    }
    
    const preRollVerboseFormula = preRollVerboseParts.join(' + ');
    
    // Generate title and subtitle based on roll type
    // Title will be set from data-roll-title in the calling code
    let rollTitle = 'Dice Roll';
    let rollSubtitle = '';
    
    // Build subtitle with skill info, DC, group status, etc.
    const subtitleParts = [];
    
    if (type === 'skill') {
        subtitleParts.push(skillData?.label || value || 'Unknown');
    } else if (type === 'ability') {
        subtitleParts.push((value || 'Unknown').toUpperCase());
    } else if (type === 'save') {
        subtitleParts.push((value || 'Unknown').toUpperCase());
    } else if (type === 'tool') {
        subtitleParts.push(value || 'Unknown');
    } else {
        subtitleParts.push(value || 'Unknown');
    }
    
    // Note: DC, group roll, and contested roll info will be added by the calling function
    // since prepareRollData doesn't have access to that context yet
    
    rollSubtitle = subtitleParts.join(' • ');
    
    // Determine dice icon based on the roll value (which might contain different dice types)
    // For skill/ability/save rolls, use baseRoll (1d20), but for dice rolls, use the actual value
    const diceFormula = type === 'dice' ? value : baseRoll;
    const diceIcon = getDiceIcon(diceFormula);
    
    postConsoleAndNotification(MODULE.NAME, `prepareRollData: Dice icon selection:`, {
        type: type,
        value: value,
        baseRoll: baseRoll,
        diceFormula: diceFormula,
        diceIcon: diceIcon
    }, true, false);
    
    return {
        rollTitle: rollTitle,
        rollSubtitle: rollSubtitle,
        actorName: actor.name || 'Unknown Actor',
        rollType: type === 'skill' ? `${skillData?.label || value || 'Unknown'}` : 
                  type === 'ability' ? `${(value || 'Unknown').toUpperCase()}` :
                  type === 'save' ? `${(value || 'Unknown').toUpperCase()}` :
                  type === 'tool' ? `${value || 'Unknown'}` : `${value || 'Unknown'}`,
        rollFormula: preRollVerboseFormula || '1d20 roll',
        baseRoll: baseRoll || '1d20',
        abilityMod: abilityMod || 0,
        proficiencyBonus: type === 'skill' || type === 'save' ? (profBonus || 0) : 0,
        otherModifiers: 0, // Will be set by rollOptions
        diceSoNiceEnabled: game.settings.get('coffee-pub-blacksmith', 'diceRollToolEnableDiceSoNice') ?? true,
        preRollVerboseFormula: preRollVerboseFormula,
        diceIcon: diceIcon
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
            
            // Create descriptive verbose formula for tooltips
            const verboseParts = [];
            if (options.advantage) verboseParts.push('2d20kh roll');
            else if (options.disadvantage) verboseParts.push('2d20kl roll');
            else verboseParts.push('1d20 roll');
            
            if (skillAbilityMod !== 0) verboseParts.push(`${skillAbilityMod} ${skillAbility}`);
            if (skillIsProficient) verboseParts.push(`${skillProfBonus} prof`);
            
            if (options.situationalBonus && options.situationalBonus !== 0) {
                verboseParts.push(`${options.situationalBonus} situational`);
            }
            if (options.customFormula) {
                verboseParts.push(`${options.customFormula} custom`);
            }
            
            result.verboseFormula = verboseParts.join(' + ');
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
            
            // Create descriptive verbose formula for tooltips
            const abilityVerboseParts = [];
            if (options.advantage) abilityVerboseParts.push('2d20kh roll');
            else if (options.disadvantage) abilityVerboseParts.push('2d20kl roll');
            else abilityVerboseParts.push('1d20 roll');
            
            if (abilityMod !== 0) abilityVerboseParts.push(`${abilityMod} ${value}`);
            
            if (options.situationalBonus && options.situationalBonus !== 0) {
                abilityVerboseParts.push(`${options.situationalBonus} situational`);
            }
            if (options.customFormula) {
                abilityVerboseParts.push(`${options.customFormula} custom`);
            }
            
            result.verboseFormula = abilityVerboseParts.join(' + ');
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
                
                // Create descriptive verbose formula for death saves
                const deathVerboseParts = [];
                if (options.advantage) deathVerboseParts.push('2d20kh roll');
                else if (options.disadvantage) deathVerboseParts.push('2d20kl roll');
                else deathVerboseParts.push('1d20 roll');
                
                result.verboseFormula = deathVerboseParts.join(' + ');
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
                
                // Create descriptive verbose formula for saving throws
                const saveVerboseParts = [];
                if (options.advantage) saveVerboseParts.push('2d20kh roll');
                else if (options.disadvantage) saveVerboseParts.push('2d20kl roll');
                else saveVerboseParts.push('1d20 roll');
                
                if (saveAbilityMod !== 0) saveVerboseParts.push(`${saveAbilityMod} ${value}`);
                if (saveIsProficient) saveVerboseParts.push(`${saveProfBonus} prof`);
                
                if (options.situationalBonus && options.situationalBonus !== 0) {
                    saveVerboseParts.push(`${options.situationalBonus} situational`);
                }
                if (options.customFormula) {
                    saveVerboseParts.push(`${options.customFormula} custom`);
                }
                
                result.verboseFormula = saveVerboseParts.join(' + ');
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
                
                // Create descriptive verbose formula for tool rolls
                const toolVerboseParts = [];
                if (options.advantage) toolVerboseParts.push('2d20kh roll');
                else if (options.disadvantage) toolVerboseParts.push('2d20kl roll');
                else toolVerboseParts.push('1d20 roll');
                
                if (abilityMod !== 0) toolVerboseParts.push(`${abilityMod} ${ability}`);
                if (isProficient) toolVerboseParts.push(`${profBonus} prof`);
                
                if (options.situationalBonus && options.situationalBonus !== 0) {
                    toolVerboseParts.push(`${options.situationalBonus} situational`);
                }
                if (options.customFormula) {
                    toolVerboseParts.push(`${options.customFormula} custom`);
                }
                
                result.verboseFormula = toolVerboseParts.join(' + ');
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
            
            // Create descriptive verbose formula for dice rolls
            const diceVerboseParts = [];
            if (options.advantage) diceVerboseParts.push('2d20kh roll');
            else if (options.disadvantage) diceVerboseParts.push('2d20kl roll');
            else diceVerboseParts.push(`${diceFormula} roll`);
            
            result.verboseFormula = diceVerboseParts.join(' + ');
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
    postConsoleAndNotification(MODULE.NAME, `showRollWindow: Starting with parameters:`, { 
        actor: rollData.actorName, 
        actorId: rollData.actorId, 
        type: rollData.rollTypeKey, 
        value: rollData.rollValueKey, 
        dc: rollData.dc,
        isGroupRoll: rollData.isGroupRoll,
        hasMultipleGroups: rollData.hasMultipleGroups,
        skillName: rollData.skillName,
        defenderSkillName: rollData.defenderSkillName,
        label: rollData.label,
        options: {} 
    }, true, false);
    
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
        
        // Override title with data-roll-title if available
        if (rollData.label) {
            dialogRollData.rollTitle = rollData.label;
        }
        
        // Build complete subtitle with additional context
        const subtitleParts = [];
        
        // Start with the skill/ability name from prepareRollData
        subtitleParts.push(dialogRollData.rollSubtitle);
        
        // Add DC if present
        if (rollData.dc) {
            subtitleParts.push(`DC ${rollData.dc}`);
        }
        
        // Add group roll info if applicable
        if (rollData.isGroupRoll) {
            subtitleParts.push('Group Roll');
        }
        
        // Add contested roll info if applicable
        if (rollData.hasMultipleGroups) {
            subtitleParts.push(`${rollData.skillName} vs ${rollData.defenderSkillName}`);
        }
        
        dialogRollData.rollSubtitle = subtitleParts.join(' • ');
        
        postConsoleAndNotification(MODULE.NAME, `showRollWindow: Subtitle building:`, {
            originalSubtitle: dialogRollData.rollSubtitle,
            dc: rollData.dc,
            isGroupRoll: rollData.isGroupRoll,
            hasMultipleGroups: rollData.hasMultipleGroups,
            skillName: rollData.skillName,
            defenderSkillName: rollData.defenderSkillName,
            finalSubtitle: dialogRollData.rollSubtitle
        }, true, false);
        
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
            width: 500,
            height: 450,
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
                situationalBonus: situationalBonus,
                fastForward: true
            };
            
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll options:`, rollOptions, true, false);
            
            // Use the shared roll system (same as cinema mode)
            const { processRoll, deliverRollResults } = await import('./manager-rolls.js');
            
            // Execute the roll using the shared processRoll function (includes 3D dice animation)
            const rollResults = await processRoll(this.rollData, rollOptions);
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll completed:`, rollResults, true, false);
            
            // Deliver the results using the shared deliverRollResults function
            await deliverRollResults(rollResults, { 
                messageId: this.rollData.messageId, 
                tokenId: this.rollData.tokenId 
            });
            
            // Close the dialog after the roll is complete
                postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Roll successful, closing dialog`, null, true, false);
                this.close();
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll error:`, error, true, false);
            // Keep dialog open on error so user can see what went wrong
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
export async function updateCinemaOverlay(rollResults, context) {
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
        
        // Use a timeout to create a delay for the reveal (same as old system)
        const diceSpinTime = 2000;
        const groupResultsTime = 5000;
        const rollResultsTime = 4000;

        setTimeout(() => {
            // Play individual roll sound (crit/fumble/normal) - same as old system
            let d20Roll = null;
            
            // First try the terms structure (newer Foundry format)
            if (roll?.terms) {
                for (const term of roll.terms) {
                    if (term.class === 'D20Die' && term.results && term.results.length > 0) {
                        // For advantage/disadvantage, find the active result
                        if (term.results.length === 2) {
                            // This is advantage/disadvantage - find the active result
                            const activeResult = term.results.find(r => r.active === true);
                            if (activeResult) {
                                d20Roll = activeResult.result;
                            } else {
                                // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                                const isDisadvantage = term.modifiers && term.modifiers.includes('kl');
                                d20Roll = isDisadvantage ? term.results[0].result : term.results[term.results.length - 1].result;
                            }
                        } else {
                            // Single d20 roll
                            d20Roll = term.results[0].result;
                        }
                        break;
                    }
                }
            }
            
            // Fallback to dice structure (older format)
            if (d20Roll === null && roll?.dice) {
                for (const die of roll.dice) {
                    if (die.faces === 20 && die.results && die.results.length > 0) {
                        // For advantage/disadvantage, find the active result
                        if (die.results.length === 2) {
                            // This is advantage/disadvantage - find the active result
                            const activeResult = die.results.find(r => r.active === true);
                            if (activeResult) {
                                d20Roll = activeResult.result;
                            } else {
                                // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                                const isDisadvantage = die.modifiers && die.modifiers.includes('kl');
                                d20Roll = isDisadvantage ? die.results[0].result : die.results[die.results.length - 1].result;
                            }
                        } else {
                            // Single d20 roll
                            d20Roll = die.results[0].result;
                        }
                        break;
                    }
                }
            }
            
            // Play individual roll sound based on d20 result
            let individualSound;
            if (d20Roll === 20) {
                individualSound = COFFEEPUB.SOUNDROLLCRITICAL;
            } else if (d20Roll === 1) {
                individualSound = COFFEEPUB.SOUNDROLLFUMBLE;
            } else {
                individualSound = COFFEEPUB.SOUNDROLLCOMPLETE;
            }
            
            import('./api-common.js').then(({ playSound }) => {
                playSound(individualSound, COFFEEPUB.SOUNDVOLUMENORMAL);
            });
            
        }, diceSpinTime); // Small delay for reveal effect
        
        setTimeout(() => {
            // Determine the sound to play based on the roll result
            // Improved d20 roll detection to handle different roll types
            let d20Roll = null;
            
            // First try the terms structure (newer Foundry format)
            if (roll?.terms) {
                for (const term of roll.terms) {
                    if ((term.class === 'D20Die' || (term.class === 'Die' && term.faces === 20)) && term.results && term.results.length > 0) {
                        // For advantage/disadvantage, find the active result
                        if (term.results.length === 2) {
                            // This is advantage/disadvantage - find the active result
                            const activeResult = term.results.find(r => r.active === true);
                            if (activeResult) {
                                d20Roll = activeResult.result;
            } else {
                                // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                                const isDisadvantage = term.modifiers && term.modifiers.includes('kl');
                                d20Roll = isDisadvantage ? term.results[0].result : term.results[term.results.length - 1].result;
                            }
                        } else {
                            // Single d20 roll
                            d20Roll = term.results[0].result;
                        }
                        break;
                    }
                }
            }
            
            // Fallback to dice structure (older format)
            if (d20Roll === null && roll?.dice) {
                for (const die of roll.dice) {
                    if (die.faces === 20 && die.results && die.results.length > 0) {
                        // For advantage/disadvantage, find the active result
                        if (die.results.length === 2) {
                            // This is advantage/disadvantage - find the active result
                            const activeResult = die.results.find(r => r.active === true);
                            if (activeResult) {
                                d20Roll = activeResult.result;
                            } else {
                                // Fallback: for disadvantage (kl), use first result; for advantage (kh), use last result
                                const isDisadvantage = die.modifiers && die.modifiers.includes('kl');
                                d20Roll = isDisadvantage ? die.results[0].result : die.results[die.results.length - 1].result;
                            }
                        } else {
                            // Single d20 roll
                            d20Roll = die.results[0].result;
                        }
                        break;
                    }
                }
            }
            
            postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: Roll result:', roll, true, false);
            postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: d20Roll value:', d20Roll, true, false);
            if (d20Roll === 20) {
                postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: CRITICAL DETECTED!', "", true, false);
            } else if (d20Roll === 1) {
                postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: FUMBLE DETECTED!', "", true, false);
            }

            const rollArea = actorCard.find('.cpb-cinematic-roll-area');
            rollArea.empty(); // Clear the button or pending icon

            let specialClass = '';
            if (d20Roll === 20) specialClass = 'critical';
            else if (d20Roll === 1) specialClass = 'fumble';

            const successClass = roll.total >= 10 ? 'success' : 'failure'; // TODO: get actual DC from context
            const resultHtml = `<div class="cpb-cinematic-roll-result ${successClass} ${specialClass}">${roll.total}</div>`;
            rollArea.append(resultHtml);

            // Check if all rolls are complete to show group results or hide overlay
            const allCards = overlay.find('.cpb-cinematic-card');
            const allComplete = allCards.toArray().every(card => {
                return $(card).find('.cpb-cinematic-roll-result').length > 0;
            });
            
            if (allComplete) {
                // Check for group results in the chat message
                const message = game.messages.get(messageId);
                if (message && message.flags && message.flags['coffee-pub-blacksmith']) {
                    const flags = message.flags['coffee-pub-blacksmith'];
                    
                    // Show group results if available
                    if (flags.contestedRoll || flags.groupRollData || (flags.isGroupRoll && flags.hasOwnProperty('groupSuccess'))) {
                        postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: Showing group results`, { 
                            contestedRoll: flags.contestedRoll, 
                            groupRollData: flags.groupRollData,
                            isGroupRoll: flags.isGroupRoll,
                            groupSuccess: flags.groupSuccess,
                            successCount: flags.successCount,
                            totalCount: flags.totalCount
                        }, true, false);
                        
                        // Create and show the group results overlay
                        let resultText, resultClass, detailText = '';
                        let resultBackgroundImage;
                        
                        if (flags.contestedRoll) {
                            // Contested roll results
                            const { winningGroup, isTie } = flags.contestedRoll;
                            if (isTie) {
                                resultText = 'DRAW';
                                resultClass = 'tie';
                                detailText = 'Both sides are evenly matched';
                                resultBackgroundImage = 'modules/coffee-pub-blacksmith/images/banners/banners-contest-draw.webp';
                            } else if (winningGroup === 1) {
                                resultText = 'CHALLENGERS WIN';
                                resultClass = 'contested-challengers';
                                resultBackgroundImage = 'modules/coffee-pub-blacksmith/images/banners/banners-contest-versus-challengers.webp';
                            } else {
                                resultText = 'DEFENDERS WIN';
                                resultClass = 'contested-defenders';
                                resultBackgroundImage = 'modules/coffee-pub-blacksmith/images/banners/banners-contest-versus-defenders.webp';
                            }
                        } else if (flags.isGroupRoll && flags.hasOwnProperty('groupSuccess')) {
                            // Group roll results
                            const { groupSuccess, successCount, totalCount } = flags;
                            resultText = groupSuccess ? 'GROUP SUCCESS' : 'GROUP FAILURE';
                            resultClass = groupSuccess ? 'success' : 'failure';
                            detailText = `${successCount} of ${totalCount} Succeeded`;
                            
                            // Determine background image for group results
                            if (resultClass === 'success') {
                                resultBackgroundImage = 'modules/coffee-pub-blacksmith/images/banners/banners-contest-success.webp';
                            } else {
                                resultBackgroundImage = 'modules/coffee-pub-blacksmith/images/banners/banners-contest-failure.webp';
                            }
                        }
                        
                        // Create the results bar HTML
                        const resultsBarHtml = `
                            <div id="cpb-cinematic-results-bar" style="background-image: url('${resultBackgroundImage}');">
                                <div class="cpb-cinematic-group-result ${resultClass}">
                                    <div class="cpb-cinematic-group-result-text">${resultText}</div>
                                    ${detailText ? `<div class="cpb-cinematic-group-result-detail">${detailText}</div>` : ''}
                                </div>
                            </div>
                        `;
                        
                        // Append the results bar to the main cinematic bar
                        overlay.find('#cpb-cinematic-bar').append(resultsBarHtml);
                        
                        // Play sound for group results
                        let groupSound;
                        if (flags.contestedRoll) {
                            // Contested roll - always use SOUNDVERSUS
                            groupSound = COFFEEPUB.SOUNDVERSUS;
                        } else if (resultClass === 'success') {
                            groupSound = COFFEEPUB.SOUNDSUCCESS;
                        } else if (resultClass === 'failure') {
                            groupSound = COFFEEPUB.SOUNDFAILURE;
                        } else {
                            groupSound = COFFEEPUB.SOUNDVERSUS; // For ties
                        }
                        
                        import('./api-common.js').then(({ playSound }) => {
                            playSound(groupSound, COFFEEPUB.SOUNDVOLUMENORMAL);
                        });
                        
                        // Auto-close after showing group results
                        setTimeout(() => {
                            overlay.fadeOut(1000, () => {
                                overlay.remove();
                            });
                        }, groupResultsTime); // Longer delay for group results
                    } else {
                        // No group results, just auto-close
                        setTimeout(() => {
                            overlay.fadeOut(1000, () => {
                                overlay.remove();
                            });
                        }, rollResultsTime);
                    }
                } else {
                    // No message data, just auto-close
                    setTimeout(() => {
                        overlay.fadeOut(1000, () => {
                            overlay.remove();
                        });
                    }, rollResultsTime);
                }
            }
        }, diceSpinTime); // Small delay for reveal effect
        
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

/**
 * Create post-roll verbose formula showing actual dice results
 * @param {Roll} roll - The completed roll
 * @param {object} rollData - The roll data
 * @returns {string} Post-roll verbose formula
 */
function createPostRollVerboseFormula(roll, rollData) {
    try {
        // Get the dice results
        const dice = roll.dice || [];
        const terms = roll.terms || [];
        
        // Find the d20 roll result
        let d20Result = null;
        let d20Index = -1;
        
        for (let i = 0; i < dice.length; i++) {
            if (dice[i].faces === 20) {
                d20Result = dice[i].results[0]?.result || dice[i].total;
                d20Index = i;
                break;
            }
        }
        
        // If no d20 found, try to find it in terms
        if (d20Result === null) {
            for (let i = 0; i < terms.length; i++) {
                if (terms[i].faces === 20) {
                    d20Result = terms[i].results[0]?.result || terms[i].total;
                    d20Index = i;
                    break;
                }
            }
        }
        
        // Build the post-roll verbose formula
        const postRollParts = [];
        
        // Add the actual dice result
        if (d20Result !== null) {
            postRollParts.push(`${d20Result} roll`);
        } else {
            // Fallback to showing the dice formula if we can't find the result
            postRollParts.push(`${roll.formula.split(' + ')[0]} roll`);
        }
        
        // Add modifiers from the original verbose formula
        const originalVerbose = roll.verboseFormula || roll.formula;
        const verboseParts = originalVerbose.split(' + ');
        
        // Skip the first part (the dice) and add the rest, removing parentheses
        for (let i = 1; i < verboseParts.length; i++) {
            const part = verboseParts[i].replace(/[()]/g, ''); // Remove parentheses
            postRollParts.push(part);
        }
        
        // Add the total
        const postRollFormula = postRollParts.join(' + ');
        return `${postRollFormula} = ${roll.total}`;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Error creating post-roll verbose formula:`, error, true, false);
        return roll.verboseFormula || roll.formula;
    }
}

// ==================================================================
// ===== PUBLIC API ==================================================
// ==================================================================




