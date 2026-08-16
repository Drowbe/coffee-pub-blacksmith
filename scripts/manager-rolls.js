import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound, getSettingSafely, getPortraitImage } from './api-core.js';
import { DialogAPI, DIALOG_ACTIONS } from './api-dialog.js';
import { UIContextMenu } from './ui-context-menu.js';
import { handleSkillRollUpdate } from './blacksmith.js';
import { SocketManager } from './manager-sockets.js';
import { resolveRequestRollCinematicBanner, resolveRequestRollSound } from './utility-theme-request-roll.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { extractActiveD20, classifyCritFumble, coerceDc } from './utility-roll-classification.js';

// Import SkillCheckDialog for chat message formatting
import { SkillCheckDialog } from './window-skillcheck.js';

// ==================================================================
// ===== CLEAN UNIFIED ROLL SYSTEM ==================================
// ==================================================================

// /**
//  * 1. requestRoll() - Creates chat card and handles initial flow routing
//  * @param {object} rollDetails - Roll details from SkillCheckDialog
//  * @returns {Promise<object>} Chat card created, flow initiated
//  */
// ==================================================================
// THIS IS A LEGACY FUNCTION AND IS NO LONGER USED.
// IT IS KEPT HERE FOR REFERENCE ONLY.
// Step 1 happens in the skillcheck dialog.
// ==================================================================
// 
// export async function requestRoll(rollDetails) {
//     postConsoleAndNotification(MODULE.NAME, `requestRoll: Starting with roll details`, rollDetails, true, false);
    
    // try {
    //     // Extract the processed actors and roll data from rollDetails
    //     const { 
    //         actors, 
    //         challengerRollType, 
    //         challengerRollValue, 
    //         defenderRollType, 
    //         defenderRollValue,
    //         dc,
    //         showDC,
    //         groupRoll,
    //         label,
    //         description,
    //         rollMode,
    //         isCinematic,
    //         showRollExplanation
    //     } = rollDetails;
        
    //     // Process actors to extract the data needed for the chat card
    //     const processedActors = actors.map(actor => ({
    //         id: actor.tokenId || actor.id,
    //         actorId: actor.actorId,
    //         name: actor.name,
    //         group: actor.group || 1,
    //         toolId: actor.toolId || null
    //     }));
        
    //     // Create message data for the chat card
    //     const messageData = {
    //         skillName: challengerRollType === 'tool' ? challengerRollValue : challengerRollValue,
    //         defenderSkillName: defenderRollType ? (defenderRollType === 'tool' ? defenderRollValue : defenderRollValue) : null,
    //         skillAbbr: challengerRollType === 'tool' ? (processedActors[0]?.toolId || null) : challengerRollValue,
    //         defenderSkillAbbr: defenderRollType ? (defenderRollType === 'tool' ? (processedActors.find(a => a.group === 2)?.toolId || null) : defenderRollValue) : null,
    //         actors: processedActors,
    //         requesterId: game.user.id,
    //         type: 'skillCheck',
    //         dc: dc,
    //         showDC: showDC,
    //         isGroupRoll: groupRoll,
    //         label: label || null,
    //         description: description || null,
    //         skillDescription: null, // Will be filled by formatChatMessage
    //         defenderSkillDescription: null, // Will be filled by formatChatMessage
    //         skillLink: null, // Will be filled by formatChatMessage
    //         defenderSkillLink: null, // Will be filled by formatChatMessage
    //         rollMode,
    //         rollType: challengerRollType,
    //         defenderRollType: defenderRollType || null,
    //         hasMultipleGroups: !!defenderRollType,
    //         showRollExplanation: showRollExplanation || false,
    //         isCinematic: isCinematic || false
    //     };
        
    //     // Create the chat message
    //     const message = await ChatMessage.create({
    //         user: game.user.id,
    //         speaker: ChatMessage.getSpeaker(),
    //         content: await SkillCheckDialog.formatChatMessage(messageData),
    //         flags: { 'coffee-pub-blacksmith': messageData }
    //     });
        
    //     console.log('TESTING: PLAYING SOUND', "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    //     // Play sound for roll request posted to chat
    //     playSound(COFFEEPUB.SOUNDNOTIFICATION02, COFFEEPUB.SOUNDVOLUMENORMAL);
        
    //     // Scroll chat to bottom to show the new roll request
    //     _scrollChatToBottom();
        
    //     // Handle cinematic mode if enabled
    //     if (messageData.isCinematic) {
    //         // Show for the current user who initiated the roll
    //         SkillCheckDialog._showCinematicDisplay(messageData, message.id);
            
    //         // Emit to other users to show the overlay
    //         const socket = SocketManager.getSocket();
    //         if (socket) {
    //             await socket.executeForOthers("showCinematicOverlay", {
    //                 type: "showCinematicOverlay",  // Add type property
    //                 messageId: message.id,
    //                 messageData: messageData
    //             });
    //         }
    //     }
        
    //     postConsoleAndNotification(MODULE.NAME, `requestRoll: Chat card created successfully`, { messageId: message.id, tokenId: processedActors[0]?.id }, true, false);
        
    //     return { 
    //         success: true, 
    //         messageId: message.id, 
    //         tokenId: processedActors[0]?.id,
    //         messageData: messageData
    //     };
        
    // } catch (error) {
    //     postConsoleAndNotification(MODULE.NAME, `requestRoll error:`, error, true, false);
    //     throw error;
    // }
// }

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
            
            // Verify the chat card exists
            const message = game.messages.get(existingMessageId);
            if (!message) {
                throw new Error(`BLACKSMITH | SKILLCHECK | Chat card not found for message ID: ${existingMessageId}`);
            }
            
            chatResult = {
                success: true,
                messageId: existingMessageId,
                tokenId: rollDetails.actors[0]?.tokenId || rollDetails.actors[0]?.id,
                messageData: null // We don't need to recreate the message data
            };
        } else {
            // This should never happen - skillcheck dialog always creates chat cards first
            throw new Error('BLACKSMITH | SKILLCHECK | No existing message ID provided - chat card must be created first by skillcheck dialog.');
        }
        
        // Extract the first actor for roll execution
        const firstActor = rollDetails.actors[0];
        const actor = game.actors.get(firstActor.actorId);
        
        if (!actor) {
            throw new Error(`Could not find actor: ${firstActor.actorId}`);
        }
        
        // Package data for consumption by the rest of the process
        const rollData = await prepareRollData(actor, rollDetails.challengerRollType, rollDetails.challengerRollValue);
        
        // Override the title if provided from the skillcheck dialog
        if (rollDetails.challengerRollTitle) {
            rollData.rollTitle = rollDetails.challengerRollTitle;
        }
        
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
        rollData.rollMode = rollDetails.rollMode || 'roll';
        if (rollDetails.situationalBonus != null) rollData.situationalBonus = rollDetails.situationalBonus;
        if (rollDetails.customModifier != null) rollData.customModifier = rollDetails.customModifier;
        const requestedAdvantage = SkillCheckDialog.normalizeRollAdvantage(rollDetails.rollAdvantage);
        if (requestedAdvantage != null) {
            rollData.rollAdvantage = requestedAdvantage;
            rollData.lockRollAdvantage = !!rollDetails.lockRollAdvantage;
        }
        
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
            const existingOverlay = document.querySelector('#cpb-cinematic-overlay');
            if (!existingOverlay) {
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
            result: resultForSocket,
            rollerUserId: game.user.id
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
            
            // Other clients only — roller already ran updateCinemaOverlay above (avoids double timers / races)
            const socket = SocketManager.getSocket();
            const cinemaPayload = {
                type: "updateCinemaOverlay",
                rollResults: {
                    roll: resultForSocket,
                    rollData: rollData
                },
                context: context
            };
            if (socket?.executeForOthers) {
                await socket.executeForOthers("updateCinemaOverlay", cinemaPayload);
            } else if (socket?.executeForEveryone) {
                await socket.executeForEveryone("updateCinemaOverlay", cinemaPayload);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `deliverRollResults: Not cinema mode, rollData.cinemaMode:`, rollData.cinemaMode, true, false);
            
            // Play sound for normal window mode (same as cinema mode)
            await _playRollResultSound(roll);
        }
        
        postConsoleAndNotification(MODULE.NAME, `deliverRollResults: Results delivered successfully`, null, true, false);
        
        // Scroll chat to bottom to show the updated roll results
        _scrollChatToBottom();
        
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
 * Play crit/fumble/normal sound for a completed roll.
 * @param {Roll|object} roll
 */
async function _playRollResultSound(roll) {
    const d20Roll = extractActiveD20(roll);
    const resolvedIndividualSound = await resolveRequestRollSound(
        d20Roll === 20 ? 'SOUNDROLLCRITICAL' : d20Roll === 1 ? 'SOUNDROLLFUMBLE' : 'SOUNDROLLCOMPLETE'
    );
    if (resolvedIndividualSound) playSound(resolvedIndividualSound, COFFEEPUB.SOUNDVOLUMENORMAL);
}

/**
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
    } else if (type === 'ability') {
        const isProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) > 0;
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
    } else if (type === 'ability') {
        const isProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) > 0;
        if (isProficient) preRollVerboseParts.push(`${profBonus} prof`);
    } else if (type === 'save') {
        const isProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) || false;
        if (isProficient) preRollVerboseParts.push(`${profBonus} prof`);
    }
    
    const preRollVerboseFormula = preRollVerboseParts.join(' + ');
    
    // Generate title and subtitle based on roll type
    let rollTitle = '';
    let rollSubtitle = '';
    
    // Set proper title based on roll type
    if (type === 'skill') {
        rollTitle = skillData?.label || value || 'Unknown Skill';
    } else if (type === 'ability') {
        rollTitle = `${(value || 'Unknown').toUpperCase()} Check`;
    } else if (type === 'save') {
        rollTitle = `${(value || 'Unknown').toUpperCase()} Save`;
    } else if (type === 'tool') {
        rollTitle = `${value || 'Unknown Tool'}`;
    } else {
        rollTitle = 'Dice Roll';
    }
    
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
        abilityKey: abilityKey,
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
            if (options.customModifier) {
                // Parse custom modifier to handle multiple values like "+4 +6"
                const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                customMods.forEach(mod => {
                    if (mod.trim()) {
                        // Remove leading + to avoid double + in formula
                        const cleanMod = mod.trim().replace(/^\+/, '');
                        skillParts.push(cleanMod);
                    }
                });
            }
            
            const skillFormula = skillParts.join(' + ');
            postConsoleAndNotification(MODULE.NAME, `Skill roll formula: ${skillFormula}`, null, true, false);
            
            result = new Roll(skillFormula, actor.getRollData());
            // v13: async option removed, evaluate() is async by default when awaited
            await result.evaluate();
            
            // Create descriptive verbose formula for tooltips
            const verboseParts = [];
            if (options.advantage) verboseParts.push('2d20kh roll');
            else if (options.disadvantage) verboseParts.push('2d20kl roll');
            else verboseParts.push('1d20 roll');
            
            if (skillAbilityMod !== 0) verboseParts.push(`${skillAbilityMod} ${skillAbility}`);
            if (skillIsProficient) verboseParts.push(`${skillProfBonus} prof`);
            
            if (options.situationalBonus && options.situationalBonus !== 0) {
                verboseParts.push(`${options.situationalBonus} bonus`);
            }
            if (options.customModifier) {
                // Parse custom modifier to handle multiple values like "+4 +6"
                const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                customMods.forEach(mod => {
                    if (mod.trim()) {
                        verboseParts.push(`${mod.trim()} mod`);
                    }
                });
            }
            
            result.verboseFormula = verboseParts.join(' + ');
            break;
        case 'ability':
            postConsoleAndNotification(MODULE.NAME, `Creating manual ability roll for: ${value}`, null, true, false);
            // Build ability roll formula manually: 1d20 + abilityMod + profBonus (if proficient)
            const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${value}.mod`) || 0;
            const abilityProfBonus = actor.system.attributes.prof || 0;
            const abilityIsProficient = foundry.utils.getProperty(actor.system.abilities, `${value}.proficient`) > 0;
            
            // Build formula parts
            const abilityParts = [];
            if (options.advantage) abilityParts.push('2d20kh');
            else if (options.disadvantage) abilityParts.push('2d20kl');
            else abilityParts.push('1d20');
            
            if (abilityMod !== 0) abilityParts.push(abilityMod);
            if (abilityIsProficient) abilityParts.push(abilityProfBonus);
            
            // Add situational bonus and custom formula if provided
            if (options.situationalBonus && options.situationalBonus !== 0) {
                abilityParts.push(options.situationalBonus);
            }
            if (options.customModifier) {
                // Parse custom modifier to handle multiple values like "+4 +6"
                const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                customMods.forEach(mod => {
                    if (mod.trim()) {
                        // Remove leading + to avoid double + in formula
                        const cleanMod = mod.trim().replace(/^\+/, '');
                        abilityParts.push(cleanMod);
                    }
                });
            }
            
            const abilityFormula = abilityParts.join(' + ');
            postConsoleAndNotification(MODULE.NAME, `Ability roll formula: ${abilityFormula}`, null, true, false);
            
            result = new Roll(abilityFormula, actor.getRollData());
            // v13: async option removed, evaluate() is async by default when awaited
            await result.evaluate();
            
            // Create descriptive verbose formula for tooltips
            const abilityVerboseParts = [];
            if (options.advantage) abilityVerboseParts.push('2d20kh roll');
            else if (options.disadvantage) abilityVerboseParts.push('2d20kl roll');
            else abilityVerboseParts.push('1d20 roll');
            
            if (abilityMod !== 0) abilityVerboseParts.push(`${abilityMod} ${value}`);
            if (abilityIsProficient) abilityVerboseParts.push(`${abilityProfBonus} prof`);
            
            if (options.situationalBonus && options.situationalBonus !== 0) {
                abilityVerboseParts.push(`${options.situationalBonus} bonus`);
            }
            if (options.customModifier) {
                // Parse custom modifier to handle multiple values like "+4 +6"
                const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                customMods.forEach(mod => {
                    if (mod.trim()) {
                        abilityVerboseParts.push(`${mod.trim()} mod`);
                    }
                });
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
                // v13: async option removed, evaluate() is async by default when awaited
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
                if (options.customModifier) {
                    // Parse custom modifier to handle multiple values like "+4 +6"
                    const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                    customMods.forEach(mod => {
                        if (mod.trim()) {
                            // Remove leading + to avoid double + in formula
                            const cleanMod = mod.trim().replace(/^\+/, '');
                            saveParts.push(cleanMod);
                        }
                    });
                }
                
                const saveFormula = saveParts.join(' + ');
                postConsoleAndNotification(MODULE.NAME, `Save roll formula: ${saveFormula}`, null, true, false);
                
                result = new Roll(saveFormula, actor.getRollData());
                // v13: async option removed, evaluate() is async by default when awaited
            await result.evaluate();
                
                // Create descriptive verbose formula for saving throws
                const saveVerboseParts = [];
                if (options.advantage) saveVerboseParts.push('2d20kh roll');
                else if (options.disadvantage) saveVerboseParts.push('2d20kl roll');
                else saveVerboseParts.push('1d20 roll');
                
                if (saveAbilityMod !== 0) saveVerboseParts.push(`${saveAbilityMod} ${value}`);
                if (saveIsProficient) saveVerboseParts.push(`${saveProfBonus} prof`);
                
                if (options.situationalBonus && options.situationalBonus !== 0) {
                    saveVerboseParts.push(`${options.situationalBonus} bonus`);
                }
                if (options.customModifier) {
                    // Parse custom modifier to handle multiple values like "+4 +6"
                    const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                    customMods.forEach(mod => {
                        if (mod.trim()) {
                            saveVerboseParts.push(`${mod.trim()} mod`);
                        }
                    });
                }
                
                result.verboseFormula = saveVerboseParts.join(' + ');
            }
            break;
        case 'tool':
            postConsoleAndNotification(MODULE.NAME, `Creating manual tool roll for: ${value}`, null, true, false);
            // Create a tool check roll manually: 1d20 + abilityMod + profBonus
            // Try multiple lookup methods: by ID, by baseItem, by name
            let toolItem = actor.items.get(value);
            if (!toolItem) {
                toolItem = actor.items.find(i => i.system.baseItem === value);
            }
            if (!toolItem) {
                // Try finding by name (case-insensitive)
                const toolName = value.toLowerCase();
                toolItem = actor.items.find(i => i.type === 'tool' && i.name?.toLowerCase() === toolName);
            }
            if (!toolItem) {
                // Try finding any tool item as last resort
                const tools = actor.items.filter(i => i.type === 'tool');
                if (tools.length > 0) {
                    postConsoleAndNotification(MODULE.NAME, `Tool item ${value} not found, using first available tool: ${tools[0].name}`, null, true, false);
                    toolItem = tools[0];
                }
            }
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
                if (options.customModifier) {
                    // Parse custom modifier to handle multiple values like "+4 +6"
                    const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                    customMods.forEach(mod => {
                        if (mod.trim()) {
                            // Remove leading + to avoid double + in formula
                            const cleanMod = mod.trim().replace(/^\+/, '');
                            toolParts.push(cleanMod);
                        }
                    });
                }
                
                const toolFormula = toolParts.join(' + ');
                postConsoleAndNotification(MODULE.NAME, `Tool roll formula: ${toolFormula}`, null, true, false);
                
                result = new Roll(toolFormula, actor.getRollData());
                // v13: async option removed, evaluate() is async by default when awaited
            await result.evaluate();
                
                // Create descriptive verbose formula for tool rolls
                const toolVerboseParts = [];
                if (options.advantage) toolVerboseParts.push('2d20kh roll');
                else if (options.disadvantage) toolVerboseParts.push('2d20kl roll');
                else toolVerboseParts.push('1d20 roll');
                
                if (abilityMod !== 0) toolVerboseParts.push(`${abilityMod} ${ability}`);
                if (isProficient) toolVerboseParts.push(`${profBonus} prof`);
                
                if (options.situationalBonus && options.situationalBonus !== 0) {
                    toolVerboseParts.push(`${options.situationalBonus} bonus`);
                }
                if (options.customModifier) {
                    // Parse custom modifier to handle multiple values like "+4 +6"
                    const customMods = options.customModifier.split(/\s+/).filter(mod => mod.trim());
                    customMods.forEach(mod => {
                        if (mod.trim()) {
                            toolVerboseParts.push(`${mod.trim()} mod`);
                        }
                    });
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
            // v13: async option removed, evaluate() is async by default when awaited
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
    await roll.evaluate();
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
        dialogRollData.rollMode = rollData.rollMode || 'roll';
        // A DC box with nothing in it is not a DC of nothing, it is a control that
        // should not be there. `|| ' '` filled it with a space, so the label and the
        // empty frame rendered on every roll without one.
        dialogRollData.dcValue = rollData.dc ?? null;
        dialogRollData.hasDC = rollData.dc != null && rollData.dc !== '';
        
        // Preserve the original title from the skillcheck dialog
        if (rollData.rollTitle) {
            dialogRollData.rollTitle = rollData.rollTitle;
        }
        if (rollData.situationalBonus != null) dialogRollData.situationalBonus = rollData.situationalBonus;
        if (rollData.customModifier != null) dialogRollData.customModifier = rollData.customModifier;

        // Requested advantage mode: pre-selects (and optionally locks) the footer buttons
        const requestedAdvantage = SkillCheckDialog.normalizeRollAdvantage(rollData.rollAdvantage);
        if (requestedAdvantage != null) {
            dialogRollData.rollAdvantage = requestedAdvantage;
            dialogRollData.lockRollAdvantage = !!rollData.lockRollAdvantage;
            dialogRollData.rollAdvantageLabel = SkillCheckDialog.rollAdvantageLabel(requestedAdvantage);
            dialogRollData.isAdvantageRequested = requestedAdvantage === 'advantage';
            dialogRollData.isDisadvantageRequested = requestedAdvantage === 'disadvantage';
            dialogRollData.isNormalRequested = requestedAdvantage === 'normal';
            dialogRollData.showAdvantageButton = !dialogRollData.lockRollAdvantage || requestedAdvantage === 'advantage';
            dialogRollData.showDisadvantageButton = !dialogRollData.lockRollAdvantage || requestedAdvantage === 'disadvantage';
            dialogRollData.showNormalButton = !dialogRollData.lockRollAdvantage || requestedAdvantage === 'normal';
        } else {
            dialogRollData.showAdvantageButton = true;
            dialogRollData.showDisadvantageButton = true;
            dialogRollData.showNormalButton = true;
        }
        
        // THE TOKEN'S ACTOR, NOT THE PROTOTYPE -- and its PORTRAIT, not its token art.
        //
        // Two separate things go wrong here if you take the obvious route twice.
        //
        // `game.actors.get(actorId)` returns the base actor, which for an unlinked
        // NPC is what the token was stamped from: a token renamed "Brialla Mourn"
        // showed as "Cultist" with the prototype's art, while the card that opened
        // this window said "Brialla Mourn". Resolving through the token fixes that,
        // and per-token overrides come with it.
        //
        // But the token's TEXTURE is the map art -- frequently a top-down piece, and
        // for the cultists here a scene illustration. The circle wants a face, which
        // is the portrait, and `getPortraitImage()` is the house resolution for it
        // (`actor.img`, falling back to the prototype token's texture) used in ten
        // other places. Reaching for `token.document.texture.src` put the battle map
        // in the header.
        const token = rollData.tokenId ? canvas?.tokens?.get(rollData.tokenId) : null;
        const actor = token?.actor ?? game.actors.get(rollData.actorId);
        if (actor) {
            dialogRollData.actorPortrait = getPortraitImage(actor) || null;
            dialogRollData.actorName = token?.name || actor.name || 'Unknown Actor';
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
class RollWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'roll-window';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'roll-window',
            classes: ['roll-window'],
            position: { width: 600, height: 500 },
            window: { title: 'Roll Configuration', resizable: true, minimizable: true }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-roll-normal.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(rollData) {
        super();
        this.rollData = rollData;
        postConsoleAndNotification(MODULE.NAME, `RollWindow constructor: Created with roll data`, rollData, true, false);
    }

    /**
     * The named bonuses offered under the modifier field.
     *
     * Named, because a bonus almost always has a reason and the reason is what the
     * roll's breakdown should say -- "2 cover" reads as a ruling, "2 bonus" reads as
     * a number somebody typed. They are also the answer to why nobody found that the
     * modifier field takes dice: Guidance is the most common cantrip in the game and
     * needed `1d4` typed from memory every time.
     *
     * Deliberately short. A preset list long enough to need scanning is slower than
     * typing, and these are the cases that recur every session.
     */
    static MODIFIER_PRESETS = [
        { label: 'Guidance', value: '1d4' },
        { label: 'Bless', value: '1d4' },
        { label: 'Bardic', value: '1d6' },
        { label: 'Cover', value: '+2' },
        { label: 'Obscured', value: '-2' }
    ];

    /** The dice the builder offers, and the token each one appends. */
    static BUILDER_DICE = [
        { token: '1d2', icon: 'fa-solid fa-coin', tooltip: 'd2 — coin flip' },
        { token: '1d4', icon: 'fa-solid fa-dice-d4', tooltip: 'd4' },
        { token: '1d6', icon: 'fa-solid fa-dice-d6', tooltip: 'd6' },
        { token: '1d8', icon: 'fa-solid fa-dice-d8', tooltip: 'd8' },
        { token: '1d10', icon: 'fa-solid fa-dice-d10', tooltip: 'd10' },
        { token: '1d12', icon: 'fa-solid fa-dice-d12', tooltip: 'd12' },
        { token: '1d20', icon: 'fa-solid fa-dice-d20', tooltip: 'd20' },
        { token: '1d100', icon: 'fa-solid fa-hundred-points', tooltip: 'd100' }
    ];

    /**
     * A modifier token carries its label in brackets: `1d4[Bless]`.
     *
     * THE LABEL LIVES IN THE FIELD, not in a side table keyed to the chips. The
     * field is free text a player edits by hand, so any label held elsewhere goes
     * stale the first time somebody deletes a term without telling us. In the text
     * it round-trips: type it, edit it, delete it, and the label goes with it.
     *
     * STRIPPED BEFORE THE FORMULA IS ROLLED. Foundry has its own bracket flavour
     * syntax and would probably accept these, but "probably" is not a thing to
     * build a roll on -- the label is display, so it is removed at the one place
     * the field is read for rolling and never reaches `Roll`.
     */
    static splitModifierToken(token) {
        const match = /^(.*?)\[([^\]]*)\]$/.exec(String(token ?? '').trim());
        if (!match) return { value: String(token ?? '').trim(), label: '' };
        return { value: match[1].trim(), label: match[2].trim() };
    }

    /**
     * Split the field into tokens, keeping a bracketed label with its value.
     *
     * NOT a split on whitespace, which is the obvious implementation and is wrong:
     * a label is prose and prose has spaces, so `+2[Higher Ground]` would come apart
     * into `+2[Higher` and `Ground]` and neither half would parse. The value runs up
     * to the first space or bracket; the label, if there is one, may contain spaces
     * because its brackets say where it ends.
     */
    static tokenizeModifiers(text) {
        return String(text ?? '').match(/[^\s\[]+(?:\[[^\]]*\])?/g) ?? [];
    }

    /**
     * The field as a list of terms: `{ op, value, label }`.
     *
     * AN OPERATOR IS NOT A TERM. The builder's `+` and `-` buttons append a bare
     * operator, and treating those as tokens in their own right produced a term with
     * an empty value and an implied `+` in front of it -- the formula line read
     * `1D8 + + 1D20 - + 1D8`, and the same string reached `Roll` as
     * `... + + + 1d20 + - + 1d8`, which does not evaluate. An operator now sets the
     * sign of the term that FOLLOWS it, which is what clicking it means.
     *
     * A term's own sign wins over a pending operator: typing `-2` after clicking `+`
     * gives a subtraction, because the sign attached to the value is the more
     * specific statement. A trailing operator with nothing after it is dropped --
     * mid-edit is the normal state of a text field, and a half-finished expression
     * should show nothing rather than an error.
     */
    static parseModifierTerms(text) {
        const terms = [];
        let pendingOp = null;

        for (const token of RollWindow.tokenizeModifiers(text)) {
            if (token === '+' || token === '-') { pendingOp = token; continue; }

            const { value, label } = RollWindow.splitModifierToken(token);
            const ownSign = value.startsWith('-') ? '-' : (value.startsWith('+') ? '+' : null);
            const body = value.replace(/^[+-]/, '');
            if (!body) { pendingOp = null; continue; }

            terms.push({ op: ownSign ?? pendingOp ?? '+', value: body, label });
            pendingOp = null;
        }
        return terms;
    }

    /** The field's text as a formula fragment, labels removed, ready for `Roll`. */
    static stripModifierLabels(text) {
        return RollWindow.parseModifierTerms(text)
            .map((term) => `${term.op}${term.value}`)
            .join(' ');
    }

    /**
     * The stored preset list, falling back to the built-ins.
     *
     * Read rather than cached: a GM adding a house rule should reach every window
     * opened afterwards without a reload.
     */
    static getPresets() {
        const stored = getSettingSafely(MODULE.ID, 'rollModifierPresets', null);
        return Array.isArray(stored) && stored.length ? stored : RollWindow.MODIFIER_PRESETS;
    }

    getData() {
        postConsoleAndNotification(MODULE.NAME, `RollWindow getData: Preparing template data`, null, true, false);

        // The window has one modifier field, but two things can arrive pre-set: a
        // `situationalBonus` the GM attached per actor when requesting the roll, and
        // a `customModifier` from the same request. Both seed the same field, so the
        // player sees what was attached and can edit or remove it -- which they could
        // not when the two lived in separate inputs and one of them was a number box.
        const seeded = [];
        const incoming = Number(this.rollData.situationalBonus) || 0;
        if (incoming !== 0) seeded.push(incoming > 0 ? `+${incoming}` : String(incoming));
        if (this.rollData.customModifier) seeded.push(String(this.rollData.customModifier).trim());

        return {
            ...this.rollData,
            modifier: seeded.join(' '),
            presets: RollWindow.getPresets(),
            dice: RollWindow.BUILDER_DICE,
            // The list is world-scoped, so only a GM can write it. Everyone uses it.
            canEditPresets: game.user.isGM
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const el = this.element;
        postConsoleAndNotification(MODULE.NAME, `RollWindow _attachLocalListeners: Setting up event handlers`, null, true, false);

        const rollAdvantage = el.querySelector('.roll-advantage');
        const rollNormal = el.querySelector('.roll-normal');
        const rollDisadvantage = el.querySelector('.roll-disadvantage');
        const cancelRoll = el.querySelector('.cancel-roll');

        if (rollAdvantage) {
            rollAdvantage.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._executeRoll('advantage');
            });
        }

        if (rollNormal) {
            rollNormal.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._executeRoll('normal');
            });
        }

        if (rollDisadvantage) {
            rollDisadvantage.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._executeRoll('disadvantage');
            });
        }

        if (cancelRoll) {
            cancelRoll.addEventListener('click', (event) => {
                event.preventDefault();
                postConsoleAndNotification(MODULE.NAME, `RollWindow: Cancel button clicked, closing window`, null, true, false);
                this.close();
            });
        }

        this._setupFormulaUpdates(el);
    }

    async _executeRoll(rollType) {
        try {
            postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Starting ${rollType} roll execution`, null, true, false);

            const element = this.element;
            if (!element?.querySelectorAll) {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Invalid this.element`, null, true, false);
                return;
            }

            // A locked request removes the other buttons; this is the backstop for a click that
            // reaches the handler anyway (stale DOM, a macro, a modified template).
            const lockedMode = this.rollData.lockRollAdvantage ? this.rollData.rollAdvantage : null;
            if (lockedMode && rollType !== lockedMode) {
                postConsoleAndNotification(MODULE.NAME, `RollWindow _executeRoll: Ignoring ${rollType} roll; this request locks the roll to ${lockedMode}`, null, true, false);
                ui.notifications.warn(`This roll was requested with ${lockedMode === 'normal' ? 'no advantage or disadvantage' : lockedMode}.`);
                return;
            }

            // Get roll options from the form
            const advantage = rollType === 'advantage';
            const disadvantage = rollType === 'disadvantage';
            const modifierInput = element.querySelector('input[name="modifier"]');
            // `rollMode`, not `roll-mode`. The template has always rendered
            // `name="rollMode"`, so this selector never matched and the fallback
            // below silently forced every roll from this window to Public --
            // choosing Private GM Roll or Blind GM Roll did nothing at all. Nothing
            // errors when a querySelector misses; it just returns null, and the
            // `?:` after it reads like a sensible default rather than a dead branch.
            const rollModeSelect = element.querySelector('select[name="rollMode"]');
            // Labels are display only -- see splitModifierToken. This is the one
            // place the field becomes a formula, so it is the one place they go.
            const modifier = RollWindow.stripModifierLabels(modifierInput ? modifierInput.value : '');
            const rollMode = rollModeSelect ? rollModeSelect.value : 'roll';

            // The window has ONE field now, and it goes to `customModifier` because
            // that is the option that accepts dice. `situationalBonus` is not sent
            // from here any more -- it is still a live INBOUND value, since a GM can
            // attach one per actor when requesting a roll, and it arrives pre-filled
            // in this field (see _prepareContext). Sending it as well would apply it
            // twice.
            const rollOptions = {
                advantage: advantage,
                disadvantage: disadvantage,
                customModifier: modifier,
                fastForward: true,
                rollMode: rollMode
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
            // Close the window on error too so the user isn't left with a stuck dialog
            this.close();
        }
    }
    
    /**
     * Edit or remove a named bonus. GM only; see the binding site for why.
     *
     * Identified by INDEX, which is safe because the list is re-read immediately
     * before it is written and the window re-renders after every change -- there is
     * no window in which the index on a chip refers to a different entry than the
     * one the GM right-clicked. A generated id would be more robust against two GMs
     * editing at once, and is what to reach for if that ever happens.
     */
    _presetContextMenu(index, x, y) {
        const preset = RollWindow.getPresets()[index];
        if (!preset) return;

        // `UIContextMenu`, not a dialog. Right-clicking a chip is a context action
        // and should open a menu at the pointer -- a dialog is a window, and the
        // Edit branch opens a second one, so the old version stacked two windows on
        // top of the one you were already in to change two fields.
        UIContextMenu.show({
            id: 'blacksmith-roll-preset-menu',
            x,
            y,
            // `callback`, NOT `onClick`. UIContextMenu invokes `item.callback`;
            // `onClick` is the menubar's own item shape, which it maps across before
            // calling. Passing `onClick` here bound nothing and failed silently --
            // the menu opened, looked right, and both entries did nothing.
            zones: [
                {
                    name: 'Edit',
                    icon: 'fa-solid fa-pen',
                    description: `${preset.label} (${preset.value})`,
                    callback: () => this._promptForPreset(index)
                },
                {
                    name: 'Delete',
                    icon: 'fa-solid fa-trash',
                    callback: async () => {
                        // Re-read: the list may have changed while the menu was open.
                        const next = RollWindow.getPresets().filter((_, i) => i !== index);
                        await game.settings.set(MODULE.ID, 'rollModifierPresets', next);
                        await this.render(false);
                    }
                }
            ],
            zoneClass: 'core'
        });
    }

    /**
     * Add a named bonus to the shared preset list.
     *
     * The list is world-scoped, so this is GM-only and the button that reaches it is
     * rendered for GMs alone -- a player who wants a one-off still types it into the
     * field, which is why nothing here is a gate on rolling.
     *
     * Validation is deliberately thin. A value is checked by asking Foundry whether
     * it can parse it, rather than by a regex of our own: `Roll.validate` already
     * knows every form a term can take, including the ones we have not thought of,
     * and a house rule that fails at roll time because our pattern was narrower than
     * Foundry's is the worst of both.
     *
     * @param {number} [index] - editing an existing entry, or undefined to add.
     */
    async _promptForPreset(index) {
        const existing = Number.isInteger(index) ? RollWindow.getPresets()[index] : null;
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const result = await DialogAPI.prompt({
            title: existing ? 'Edit Named Bonus' : 'Add a Named Bonus',
            content: `
                <p>Named bonuses are shared with the whole table.</p>
                <div class="form-group">
                    <label for="preset-label">Name</label>
                    <input type="text" name="label" id="preset-label" placeholder="Inspiration" value="${esc(existing?.label)}" autofocus>
                </div>
                <div class="form-group">
                    <label for="preset-value">Value</label>
                    <input type="text" name="value" id="preset-value" placeholder="1d4, +2, -1" value="${esc(existing?.value)}">
                </div>`,
            submitLabel: existing ? 'Save' : 'Add',
            submitIcon: existing ? 'fa-solid fa-check' : 'fa-solid fa-plus',
            getValue: (root) => ({
                label: root.elements.label?.value?.trim() ?? '',
                value: root.elements.value?.value?.trim() ?? ''
            }),
            validate: ({ label, value }) => {
                if (!label) return 'Give it a name — the name is what the formula will show.';
                if (!value) return 'Give it a value, such as 1d4 or +2.';
                if (value.includes('[') || value.includes(']')) return 'Square brackets are reserved for the name.';
                // Foundry decides what is rollable, not us.
                if (!Roll.validate(value.replace(/^\+/, ''))) return `"${value}" is not something Foundry can roll.`;
                return null;
            },
            onSubmit: async ({ label, value }) => {
                // Re-read rather than reusing the copy taken when the dialog opened:
                // another GM may have changed the list while it sat there, and
                // writing a stale array would silently drop their entry.
                const presets = [...RollWindow.getPresets()];
                if (Number.isInteger(index) && presets[index]) presets[index] = { label, value };
                else presets.push({ label, value });
                await game.settings.set(MODULE.ID, 'rollModifierPresets', presets);
                return { label, value };
            }
        });

        if (result?.action !== DIALOG_ACTIONS.SUBMIT) return;

        // Re-render so the chip row matches the list. The modifier field keeps
        // whatever was already built -- editing the list is not editing the roll.
        await this.render(false);
    }

    /**
     * Keep the formula line in step with the modifier field.
     *
     * TERMS ARE STRUCTURED, NOT CONCATENATED. Each is `{ op, text, icon, cls }` and
     * the renderer owns the operator between them, which is the only way to keep a
     * value's sign and the separator from both appearing. They did: the proficiency
     * term was built as `${formulaSymbols}+${bonus} prof`, emitting the `+` span AND
     * a literal `+`, so every proficient roll read `1d20 + +5 PROF`. The ability
     * term one line above got it right, which is exactly why nobody caught it --
     * the two lines are only wrong next to each other.
     *
     * A DICE TERM CARRIES ITS DIE. `getDiceIcon()` already existed for the window
     * header; a term that looks like dice gets the matching face, so `1d20` leads
     * with a d20 and a `1d4` from Guidance shows a d4 rather than reading as text.
     */
    _setupFormulaUpdates(html) {
        const htmlElement = html;
        if (!htmlElement?.querySelectorAll) return;

        const formulaElement = htmlElement.querySelector('.roll-formula');
        const modifierInput = htmlElement.querySelector('input[name="modifier"]');
        if (!formulaElement || !modifierInput) return;

        const baseRoll = this.rollData.baseRoll || '1d20';
        const abilityMod = this.rollData.abilityMod || 0;
        const abilityKey = this.rollData.abilityKey || 'dex';
        const proficiencyBonus = this.rollData.proficiencyBonus || 0;

        // The field's value reaches innerHTML, so it is escaped on the way. It is
        // the user's own text in the user's own window, but "mostly harmless input"
        // is how the other holes in this module started.
        const esc = (s) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        /** A parsed modifier term as a renderable one. */
        const modifierTerm = ({ op, value, label }) => ({
            op,
            text: value,
            // The LABEL is why the label travels in the field at all: "1D4 BLESS"
            // says what the term is for, where the old "1D4 MOD" said only that
            // somebody typed something. It renders as a tag rather than as part of
            // the value -- see the note on `.formula-label`.
            label,
            icon: /\d*d\d+/i.test(value) ? getDiceIcon(value) : null,
            cls: 'formula-custom-modifier'
        });

        const updateFormula = () => {
            const terms = [{ text: baseRoll, icon: getDiceIcon(baseRoll) }];

            // `label` is rendered as a tag rather than as more of the value, so the
            // number stays the thing you read and the reason sits beside it.
            if (abilityMod !== 0) {
                terms.push({ op: abilityMod < 0 ? '-' : '+', text: String(Math.abs(abilityMod)), label: abilityKey });
            }
            if (proficiencyBonus > 0) {
                terms.push({ op: '+', text: String(proficiencyBonus), label: 'prof' });
            }
            for (const parsed of RollWindow.parseModifierTerms(modifierInput.value)) {
                terms.push(modifierTerm(parsed));
            }

            formulaElement.innerHTML = terms.map((term, index) => {
                const op = index === 0 ? '' : `<span class="formula-symbols">${term.op ?? '+'}</span>`;
                const icon = term.icon ? `<i class="${term.icon} formula-die"></i>` : '';
                const cls = term.cls ? ` class="${term.cls}"` : '';
                const label = term.label ? `<span class="formula-label">${esc(term.label)}</span>` : '';
                return `${op}<span${cls}>${icon}${esc(term.text)}${label}</span>`;
            }).join(' ');
        };

        modifierInput.addEventListener('input', updateFormula);
        modifierInput.addEventListener('change', updateFormula);

        /**
         * Append a token to the field, keeping it the single source of truth.
         *
         * A TOKEN THAT CARRIES ITS OWN SIGN CONSUMES A PENDING OPERATOR. Clicking
         * `-` and then Cover (`+2`) used to leave `- +2` sitting in the field: the
         * parser resolved it correctly, because a term's own sign wins, but the
         * text said one thing and the formula said another and only one of them was
         * in front of the reader. The operator is dropped rather than the sign,
         * since the sign belongs to the value and the operator was a guess about
         * what came next.
         */
        const append = (token) => {
            let current = modifierInput.value.trim();
            if (/^[+-]/.test(token)) current = current.replace(/\s*[+-]$/, '');
            modifierInput.value = current ? `${current} ${token}` : token;
            modifierInput.focus();
            updateFormula();
        };

        // A preset appends its value WITH ITS LABEL, so several can be stacked and
        // any of them edited by hand afterwards. Nothing is "selected" -- the field
        // remains the single source of what will be rolled.
        for (const preset of htmlElement.querySelectorAll('.roll-preset:not(.roll-preset-add)')) {
            preset.addEventListener('click', () => {
                const label = preset.dataset.label;
                append(label ? `${preset.dataset.value}[${label}]` : preset.dataset.value);
            });
        }

        /**
         * Clicking a die means "one more of these", so a repeat raises the COUNT
         * rather than adding a second term: three clicks on d4 give `3d4`, not
         * `1d4 1d4 1d4`. That is what the button means, and it is also the form a
         * player would have typed.
         *
         * Only the TAIL of the field is touched, by rewriting the trailing `NdX` in
         * the text rather than reparsing and rebuilding the whole expression. That
         * keeps whatever else is in there exactly as typed, and it makes the two
         * cases where stacking would be wrong fall out of the pattern instead of
         * needing to be tested for:
         *
         *   `1d4[Guidance]`  ends in `]`, so it never matches -- a named bonus is
         *                    somebody's ruling, not a pile of dice to add to.
         *   `-1d4`           has `-` where the pattern needs a space or the start,
         *                    so it never matches -- the die buttons add, and
         *                    silently deepening a subtraction is not that.
         *
         * Anything else, including a different die, appends as before.
         */
        const stackDie = (token) => {
            const parsed = /^(\d*)d(\d+)$/i.exec(token);
            if (!parsed) return false;

            const [, addCount, faces] = parsed;
            const trailing = new RegExp(`(^|\\s)(\\d*)d${faces}\\s*$`, 'i');
            const current = modifierInput.value;
            const match = trailing.exec(current);
            if (!match) return false;

            const total = (parseInt(match[2] || '1', 10)) + (parseInt(addCount || '1', 10));
            modifierInput.value = current.replace(trailing, `$1${total}d${faces}`);
            modifierInput.focus();
            updateFormula();
            return true;
        };

        // A die with no label is self-describing -- `1d6` says what it is -- so
        // nothing is invented here that the player would then have to correct.
        for (const die of htmlElement.querySelectorAll('.roll-builder-die')) {
            die.addEventListener('click', () => {
                if (!stackDie(die.dataset.token)) append(die.dataset.token);
            });
        }
        for (const op of htmlElement.querySelectorAll('.roll-builder-op')) {
            op.addEventListener('click', () => append(op.dataset.op === '-' ? '-' : '+'));
        }

        // The clear sits inside the field, because the field is what it clears --
        // not the formula, which also contains the base roll and the ability and
        // proficiency terms that no control here removes.
        const clearButton = htmlElement.querySelector('.roll-modifier-clear');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                modifierInput.value = '';
                modifierInput.focus();
                updateFormula();
            });
        }

        const addButton = htmlElement.querySelector('.roll-preset-add');
        if (addButton) {
            addButton.addEventListener('click', () => this._promptForPreset());
        }

        // EDIT AND DELETE LIVE ON RIGHT-CLICK rather than on a per-chip "x".
        //
        // A delete control on every chip is a permanent target sitting inside a
        // control whose ordinary use is a single click, and the two are a few pixels
        // apart -- the common action and the irreversible one should not be
        // neighbours. Right-click also keeps the row reading as a list of bonuses
        // rather than a list of things to remove.
        //
        // GM only, because the list is world-scoped and a player's write would fail
        // at the setting rather than here. The menu is simply not bound for them.
        if (game.user.isGM) {
            for (const preset of htmlElement.querySelectorAll('.roll-preset')) {
                preset.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    this._presetContextMenu(Number(preset.dataset.index), event.clientX, event.clientY);
                });
            }
        }

        updateFormula();
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
 * Match cinematic card to roll context. Cards use data-token-id from request actors; fall back via message flags if needed.
 * @param {HTMLElement} overlay
 * @param {string} tokenId
 * @param {string} messageId
 * @returns {HTMLElement|null}
 */
function findCinematicActorCard(overlay, tokenId, messageId) {
    if (!overlay || tokenId == null || tokenId === '') return null;
    const id = String(tokenId);
    const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let card = overlay.querySelector(`[data-token-id="${esc}"]`);
    if (card) return card;
    const msg = messageId ? game.messages.get(messageId) : null;
    const actors = msg?.flags?.['coffee-pub-blacksmith']?.actors ?? [];
    const match = actors.find(a => String(a.id) === id || String(a.actorId) === id);
    if (match) {
        const mid = String(match.id);
        const esc2 = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(mid) : mid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        card = overlay.querySelector(`[data-token-id="${esc2}"]`);
    }
    return card ?? null;
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
        const { roll, rollData } = rollResults;
        const { messageId, tokenId } = context;
        const cardDc = coerceDc(
            rollData?.dc ?? game.messages.get(messageId)?.flags?.['coffee-pub-blacksmith']?.dc
        );
        
        // Find the cinema overlay
        const overlay = document.querySelector('#cpb-cinematic-overlay');
        if (!overlay) {
            postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: No cinema overlay found`, null, true, false);
            return;
        }
        
        const actorCard = findCinematicActorCard(overlay, tokenId, messageId);
        if (!actorCard) {
            postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: No actor card found for token ${tokenId}`, null, true, false);
            return;
        }
        
        // Use a timeout to create a delay for the reveal (same as old system)
        const diceSpinTime = 2000;
        const groupResultsTime = 5000;
        const rollResultsTime = 4000;

        setTimeout(async () => {
            await _playRollResultSound(roll);
        }, diceSpinTime);
        
        setTimeout(async () => {
            const d20Roll = extractActiveD20(roll);
            const { isCritical, isFumble } = classifyCritFumble(d20Roll);

            postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: Roll result:', roll, true, false);
            postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: d20Roll value:', d20Roll, true, false);
            if (isCritical) {
                postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: CRITICAL DETECTED!', "", true, false);
            } else if (isFumble) {
                postConsoleAndNotification(MODULE.NAME, 'updateCinemaOverlay: FUMBLE DETECTED!', "", true, false);
            }

            const rollArea = actorCard.querySelector('.cpb-cinematic-roll-area');
            if (!rollArea) return;
            rollArea.innerHTML = '';

            let specialClass = '';
            if (isCritical) specialClass = 'critical';
            else if (isFumble) specialClass = 'fumble';

            let successClass = '';
            if (cardDc !== null && typeof roll.total === 'number') {
                successClass = roll.total >= cardDc ? 'success' : 'failure';
            }
            const resultHtml = `<div class="cpb-cinematic-roll-result ${successClass} ${specialClass}">${roll.total}</div>`;
            rollArea.insertAdjacentHTML('beforeend', resultHtml);

            // Check if all rolls are complete to show group results or hide overlay
            const allCards = overlay.querySelectorAll('.cpb-cinematic-card');
            const allComplete = Array.from(allCards).every(card => {
                return card.querySelector('.cpb-cinematic-roll-result') !== null;
            });
            
            if (allComplete) {
                const fadeOutAndRemove = (delayMs) => {
                    setTimeout(() => {
                        overlay.style.transition = 'opacity 1s';
                        overlay.style.opacity = '0';
                        setTimeout(() => {
                            if (overlay.parentNode) {
                                overlay.remove();
                            }
                        }, 1000);
                    }, delayMs);
                };

                const resolveCinematicEnd = async () => {
                    const message = game.messages.get(messageId);
                    const flags = message?.flags?.['coffee-pub-blacksmith'];
                    if (!flags) {
                        fadeOutAndRemove(rollResultsTime);
                        return;
                    }

                    // groupRollData was never merged onto flags (spread flattens groupRollData); use real fields only
                    const showGroupBanner = flags.contestedRoll
                        || (flags.isGroupRoll && flags.hasOwnProperty('groupSuccess'));

                    if (!showGroupBanner) {
                        fadeOutAndRemove(rollResultsTime);
                        return;
                    }

                    if (overlay.querySelector('#cpb-cinematic-results-bar')) {
                        return;
                    }

                    postConsoleAndNotification(MODULE.NAME, `updateCinemaOverlay: Showing group results`, {
                        contestedRoll: flags.contestedRoll,
                        isGroupRoll: flags.isGroupRoll,
                        groupSuccess: flags.groupSuccess,
                        successCount: flags.successCount,
                        totalCount: flags.totalCount
                    }, true, false);

                    let resultText, resultClass, detailText = '';
                    let resultBackgroundImage;

                    if (flags.contestedRoll) {
                        const { winningGroup, isTie } = flags.contestedRoll;
                        if (isTie) {
                            resultText = 'DRAW';
                            resultClass = 'tie';
                            detailText = 'Both sides are evenly matched';
                            resultBackgroundImage = await resolveRequestRollCinematicBanner('BACKCONTESTDRAW');
                        } else if (winningGroup === 1) {
                            resultText = 'CHALLENGERS WIN';
                            resultClass = 'contested-challengers';
                            resultBackgroundImage = await resolveRequestRollCinematicBanner('BACKCONTESTCHALLENGERS');
                        } else {
                            resultText = 'DEFENDERS WIN';
                            resultClass = 'contested-defenders';
                            resultBackgroundImage = await resolveRequestRollCinematicBanner('BACKCONTESTDEFENDERS');
                        }
                    } else if (flags.isGroupRoll && flags.hasOwnProperty('groupSuccess')) {
                        const { groupSuccess, successCount, totalCount } = flags;
                        resultText = groupSuccess ? 'GROUP SUCCESS' : 'GROUP FAILURE';
                        resultClass = groupSuccess ? 'success' : 'failure';
                        detailText = `${successCount} of ${totalCount} Succeeded`;
                        resultBackgroundImage = resultClass === 'success'
                            ? await resolveRequestRollCinematicBanner('BACKGROUPSUCCESS')
                            : await resolveRequestRollCinematicBanner('BACKGROUPFAILURE');
                    }

                    if (!resultBackgroundImage) {
                        fadeOutAndRemove(rollResultsTime);
                        return;
                    }

                    const resultsBarHtml = `
                            <div id="cpb-cinematic-results-bar" style="background-image: url('${resultBackgroundImage}');">
                                <div class="cpb-cinematic-group-result ${resultClass}">
                                    <div class="cpb-cinematic-group-result-text">${resultText}</div>
                                    ${detailText ? `<div class="cpb-cinematic-group-result-detail">${detailText}</div>` : ''}
                                </div>
                            </div>
                        `;

                    const cinematicBar = overlay.querySelector('#cpb-cinematic-bar');
                    if (cinematicBar) {
                        cinematicBar.insertAdjacentHTML('beforeend', resultsBarHtml);
                    }

                    const resolvedGroupSound = await resolveRequestRollSound(
                        flags.contestedRoll ? 'SOUNDVERSUS' : resultClass === 'success' ? 'SOUNDSUCCESS' : resultClass === 'failure' ? 'SOUNDFAILURE' : 'SOUNDVERSUS'
                    );
                    if (resolvedGroupSound) playSound(resolvedGroupSound, COFFEEPUB.SOUNDVOLUMELOW);
                    fadeOutAndRemove(groupResultsTime);
                };

                // Non-GM clients may receive message sync after the GM processes the roll; brief defer avoids empty flags
                const endDelay = game.user.isGM ? 0 : 160;
                if (endDelay) {
                    setTimeout(resolveCinematicEnd, endDelay);
                } else {
                    resolveCinematicEnd();
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
 * Scroll the Foundry chat log to the bottom
 */
function _scrollChatToBottom() {
    try {
        // Find the chat log container
        const chatLog = document.querySelector('#chat-log');
        if (chatLog) {
            chatLog.scrollTop = chatLog.scrollHeight;
        }
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `_scrollChatToBottom error:`, error, true, false);
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
        const d20Result = extractActiveD20(roll);
        
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
