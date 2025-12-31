// ================================================================== 
// ===== XP MANAGER =================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class XpManager {
    // Standard D&D 5e CR to XP mapping (using decimal keys for math operations)
    static CR_TO_XP = {
        0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
        5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
        13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
        21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000,
        29: 135000, 30: 155000
    };

    // Resolution type XP multipliers
    static RESOLUTION_XP_MULTIPLIERS = {
        DEFEATED: 1.0,      // Full XP
        NEGOTIATED: 1.0,    // Full XP for diplomatic success
        ESCAPED: 0.5,        // Half XP
        IGNORED: 0.0,        // No XP
        CAPTURED: 1.0,       // Full XP for tactical success
        REMOVED: 0.0         // No XP - monster excluded from distribution
    };

    // Party size multipliers (D&D 5e standard)
    static PARTY_SIZE_MULTIPLIERS = {
        1: 1, 2: 1.5, 3: 2, 4: 2.5, 5: 2, 6: 1.5, 7: 1.25, 8: 1
    };

    static initialize() {
        // Register deleteCombat hook for XP distribution
        const deleteCombatHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'XP Manager: Handle combat end and trigger XP distribution',
            context: 'xp-manager-combat-end',
            priority: 3, // Normal priority - XP processing
            callback: this._onCombatEnd.bind(this)
        });

        // Register combatRound hook for round tracking
        const combatRoundHookId = HookManager.registerHook({
            name: 'combatRound',
            description: 'XP Manager: Track combat rounds for XP calculations',
            context: 'xp-manager-combat-round',
            priority: 3, // Normal priority - round tracking
            callback: this._onCombatRound.bind(this)
        });

        // Register combatTurn hook for turn tracking
        const combatTurnHookId = HookManager.registerHook({
            name: 'combatTurn',
            description: 'XP Manager: Track combat turns for XP calculations',
            context: 'xp-manager-combat-turn',
            priority: 3, // Normal priority - turn tracking
            callback: this._onCombatTurn.bind(this)
        });

        // Log hook registrations
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | deleteCombat", "xp-manager-combat-end", true, false);
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | combatRound", "xp-manager-combat-round", true, false);
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | combatTurn", "xp-manager-combat-turn", true, false);

        // Register Handlebars helper for prettifying resolution types
        if (typeof Handlebars !== 'undefined') {
            Handlebars.registerHelper('prettifyResolution', function(resolution) {
                if (!resolution || typeof resolution !== 'string') return resolution;
                return resolution.charAt(0).toUpperCase() + resolution.slice(1).toLowerCase();
            });
        }

        // Register Handlebars helper for formatting XP multipliers
        Handlebars.registerHelper('formatMultiplier', function(multiplier) {
            if (typeof multiplier !== 'number') return '0.00';
            return multiplier.toFixed(2);
        });
    }

    /**
     * Handle combat deletion and trigger XP distribution
     */
    static async _onCombatEnd(combat, options, userId) {
        if (!game.user.isGM) {
            return;
        }
        
        // Check if XP distribution is enabled
        const isEnabled = game.settings.get(MODULE.ID, 'enableXpDistribution');
        if (!isEnabled) {
            return;
        }

        // Wait a moment for combat to fully end
        setTimeout(async () => {
            await this.showXpDistributionWindow(combat);
        }, 1000);
    }

    /**
     * Show the XP distribution window
     */
    static async showXpDistributionWindow(combat) {
        const xpData = await this.calculateXpData(combat);
        
        postConsoleAndNotification(MODULE.NAME, 'XP data calculated', { 
            totalXp: xpData.totalXp, 
            monsters: xpData.monsters.length, 
            players: xpData.players.length 
        }, true, false);
        
        // Check if auto-distribute is enabled
        const autoDistribute = game.settings.get(MODULE.ID, 'autoDistributeXp');
        if (autoDistribute) {
            // Auto-distribute without showing the window
            await this.autoDistributeXp(xpData);
            return;
        }
        
        // Create and show the XP distribution window
        const xpWindow = new XpDistributionWindow(xpData);
        xpWindow.render(true);
    }

    /**
     * Automatically distribute XP without showing the window
     * This mimics clicking the distribute button with default values
     */
    static async autoDistributeXp(xpData) {
        try {
            // Initialize milestone data with defaults (if milestone mode is active)
            if (!xpData.milestoneData) {
                xpData.milestoneData = {
                    category: 'narrative',
                    title: '',
                    description: '',
                    xpAmount: '0'
                };
            }
            
            // Initialize all players as included with no adjustments (default state)
            xpData.players = xpData.players.map(player => ({
                ...player,
                included: true, // All players included by default
                adjustment: 0,  // No adjustments by default
                adjustmentSign: '+',
                signedAdjustment: 0,
                calculatedXp: 0, // Will be calculated
                finalXp: 0       // Will be calculated
            }));
            
            // Create a temporary window instance to use its calculation methods
            // We won't render it, just use it for calculations
            const tempWindow = new XpDistributionWindow(xpData);
            
            // Update XP calculations (this sets xpPerPlayer and combinedXp)
            tempWindow.updateXpCalculations();
            
            // Calculate final XP for each player (all included, no adjustments)
            xpData.players = xpData.players.map(player => {
                const finalXp = Math.max(0, xpData.xpPerPlayer + (player.signedAdjustment || 0));
                return {
                    ...player,
                    calculatedXp: finalXp,
                    finalXp: finalXp
                };
            });
            
            // Apply XP to players
            const results = await this.applyXpToPlayersFromData(xpData);
            
            // Post results to chat
            await this.postXpResults(xpData, results);
            
            // Create notification message based on active modes
            let modeText = [];
            if (xpData.modeExperiencePoints) modeText.push('Experience Points');
            if (xpData.modeMilestone) modeText.push('Milestones');
            const modeString = modeText.length > 0 ? ` (${modeText.join(' + ')})` : '';
            
            ui.notifications.info(`XP distributed automatically! Total XP: ${xpData.combinedXp}${modeString}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error auto-distributing XP', error, false, true);
            ui.notifications.error(`Error auto-distributing XP: ${error.message}`);
        }
    }

    /**
     * Open the XP Distribution window (for menubar access)
     */
    static openXpDistributionWindow() {
        try {
            // Check if there's an active combat
            const combat = game.combat;
            const hasCombat = combat && combat.started;
            
            // Create XP data based on whether there's combat or not
            const players = this.loadPartyMembers();
            let monsters = [];
            
            if (hasCombat) {
                // If there's combat, use existing combat logic (no changes)
                monsters = this.getCombatMonsters(combat);
            } else {
                // If no combat, get all monsters from canvas and set them to "Removed"
                monsters = this.getCanvasMonsters();
            }
            
            const xpData = {
                modeExperiencePoints: hasCombat,  // Experience Points on if combat, off if no combat
                modeMilestone: !hasCombat,        // Milestones off if combat, on if no combat
                milestoneXp: 0,
                milestoneData: {
                    category: 'narrative',
                    title: '',
                    description: '',
                    xpAmount: '0'
                },
                monsters: monsters,
                players: players,
                partySize: players.length,
                partyMultiplier: 1,   // Default party multiplier
                totalXp: 0,           // Will be calculated
                adjustedTotalXp: 0,   // Will be calculated
                combinedXp: 0,        // Will be calculated by updateXpCalculations
                xpPerPlayer: 0        // Will be calculated by updateXpCalculations
            };
            
            
            // Create and show the XP distribution window
            const xpWindow = new XpDistributionWindow(xpData);
            xpWindow.render(true);
            
            // Ensure calculations are performed after window is created
            xpWindow.updateXpCalculations();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error opening XP Distribution window", error, false, false);
            ui.notifications.error("Failed to open XP Distribution window");
        }
    }

    /**
     * Calculate XP data for the combat
     */
    static async calculateXpData(combat) {
        const monsters = this.getCombatMonsters(combat);
        const players = this.loadPartyMembers();

        const partySizeHandling = game.settings.get(MODULE.ID, 'xpPartySizeHandling');

        // Calculate monster XP data
            const resolutionMultipliers = this.getResolutionMultipliers();
            const partySizeMultipliers = this.getPartySizeMultipliers();

        const monsterXpData = monsters.map(monster => {
                const baseXp = this.getMonsterBaseXp(monster);
                const resolutionType = this.detectMonsterResolution(monster, combat);
                const multiplier = resolutionMultipliers[resolutionType] || 0;
                const finalXp = Math.floor(baseXp * multiplier);

                return {
                    id: monster.id,
                    name: monster.name,
                    cr: this.getMonsterCR(monster),
                    baseXp: baseXp,
                    resolutionType: resolutionType,
                    multiplier: multiplier,
                    finalXp: finalXp,
                    actorId: monster.actorId
                };
            });

        const monsterXp = monsterXpData.reduce((sum, monster) => sum + monster.finalXp, 0);
            const partySize = players.length;
        let partyMultiplier = 1;
        
            if (partySizeHandling === 'multipliers') {
                partyMultiplier = partySizeMultipliers[partySize] || 1;
        }
        
        const adjustedMonsterXp = Math.floor(monsterXp * partyMultiplier);

        return {
            combat: combat,
            monsters: monsterXpData,
            players: players,
            totalXp: monsterXp,
            adjustedTotalXp: adjustedMonsterXp,
            xpPerPlayer: 0, // Will be calculated based on active modes
            partySize: players.length,
            partyMultiplier: partyMultiplier,
            modeExperiencePoints: true, // Default to Experience Points mode
            modeMilestone: false, // Default to Milestone mode off
            milestoneXp: 0, // Milestone XP will be set when milestone mode is active
            combinedXp: adjustedMonsterXp // Combined XP from both modes
        };
    }

    /**
     * Calculate XP needed for a player to reach their next level
     */
    static getXpToNextLevel(actor) {
        const currentLevel = actor.system.details.level || 1;
        const currentXp = actor.system.details.xp || 0;
        const nextLevel = currentLevel + 1;
        const xpForNextLevel = this.getXpForLevel(nextLevel);
        return Math.max(0, xpForNextLevel - currentXp);
    }

    /**
     * Calculate milestone XP based on mode and settings
     */


    /**
     * Get all monsters from the combat
     */
    static getCombatMonsters(combat) {
        return combat.combatants.filter(combatant => {
            const actor = combatant.actor;
            return actor && actor.type === 'npc' && !actor.hasPlayerOwner;
        });
    }

    /**
     * Get all player characters from the combat
     */
    static getCombatPlayers(combat) {
        if (combat) {
            // Get players from combat and process them the same way as loadPartyMembers
            const combatants = combat.combatants.filter(combatant => {
            const actor = combatant.actor;
            return actor && (actor.hasPlayerOwner || actor.type === 'character');
        });
            
            return combatants.map(combatant => {
                const actor = combatant.actor;
                // Get current XP and level
                const currentXp = actor.system?.details?.xp?.value || 0;
                const level = actor.system?.details?.level || 1;
                
                // Calculate next level XP
                const nextLevel = level + 1;
                const nextLevelXp = this.getXpForLevel(nextLevel);
                const xpToNextLevel = nextLevelXp - currentXp;

                return {
                    // Don't store the full actor object - just store what we need for templates
                    actorId: actor.id,
                    name: actor.name,
                    img: actor.img, // Store img for template access
                    level: level,
                    currentXp: currentXp,
                    nextLevel: nextLevel,
                    nextLevelXp: nextLevelXp,
                    xpToNextLevel: xpToNextLevel,
                    included: true, // Default to included
                    adjustment: 0,
                    adjustmentSign: '+',
                    calculatedXp: 0, // Will be calculated by updateXpCalculations
                    finalXp: 0 // Will be calculated by updateXpCalculations
                };
            });
        } else {
            // Get all player characters from the game (for milestone mode)
            return game.actors.filter(actor => {
                return actor.type === 'character' && actor.hasPlayerOwner;
            });
        }
    }

    /**
     * Get all monsters from the canvas (when no combat is active)
     * All monsters are set to "Removed" status (0 XP) but have full data for resolution changes
     */
    static getCanvasMonsters() {
        // Get all tokens on the current scene
        const scene = game.scenes.active;
        if (!scene) {
            return [];
        }

        const tokens = scene.tokens.contents;
        const monsters = [];

        for (const token of tokens) {
            const actor = token.actor;
            if (actor && actor.type === 'npc' && !actor.hasPlayerOwner) {
                // Get base XP for this monster (pass token, not actor)
                const cr = actor.system.details.cr;
                const baseXp = this.getMonsterBaseXp(token);
                
                // Debug logging
                
                // Create monster data with "REMOVED" status but full calculation data
                const monsterData = {
                    id: actor.id, // Template expects 'id' field
                    actorId: actor.id,
                    name: actor.name,
                    img: actor.img,
                    cr: actor.system.details.cr || 0,
                    baseXp: baseXp, // Full base XP for calculations
                    resolutionType: 'REMOVED', // Set to "Removed" by default
                    multiplier: 0.0, // REMOVED has 0.0 multiplier
                    finalXp: 0, // Will be 0 because of REMOVED status
                    isIncluded: true // Include in calculations (but 0 XP due to REMOVED)
                };
                
                monsters.push(monsterData);
            }
        }

        return monsters;
    }

    /**
     * Load party members with full character data (for non-combat XP distribution)
     */
    static loadPartyMembers() {
        const partyMembers = game.actors.filter(actor => {
            return actor.type === 'character' && actor.hasPlayerOwner;
        });


        return partyMembers.map(actor => {
            // Get current XP and level
            const currentXp = actor.system?.details?.xp?.value || 0;
            const level = actor.system?.details?.level || 1;
            
            // Debug logging
            
            // Calculate next level XP
            const nextLevel = level + 1;
            const nextLevelXp = this.getXpForLevel(nextLevel);
            const xpToNextLevel = nextLevelXp - currentXp;

            return {
                // Don't store the full actor object - just store what we need for templates
                actorId: actor.id,
                name: actor.name,
                img: actor.img, // Store img for template access
                level: level,
                currentXp: currentXp,
                nextLevel: nextLevel,
                nextLevelXp: nextLevelXp,
                xpToNextLevel: xpToNextLevel,
                included: true, // Default to included
                adjustment: 0,
                adjustmentSign: '+',
                signedAdjustment: 0,
                calculatedXp: 0, // Will be calculated by updateXpCalculations
                finalXp: 0, // Will be calculated by updateXpCalculations
                leveledUp: false // Will be calculated when XP is applied
            };
        });
    }

    /**
     * Convert CR to decimal for consistent lookup
     */
    static convertCRToDecimal(cr) {
        if (typeof cr === 'number') return cr;
        if (cr === '1/8') return 0.125;
        if (cr === '1/4') return 0.25;
        if (cr === '1/2') return 0.5;
        return parseFloat(cr) || 0;
    }

    /**
     * Get monster's base XP from CR
     */
    static getMonsterBaseXp(monster) {
        const cr = this.getMonsterCR(monster);
        const decimalCR = this.convertCRToDecimal(cr);
        return this.CR_TO_XP[decimalCR] || 0;
    }

    /**
     * Get monster's CR
     */
    static getMonsterCR(monster) {
        const actor = monster.actor;
        if (!actor) return 0;
        
        const cr = actor.system.details.cr;
        if (typeof cr === 'number') return cr;
        if (typeof cr === 'string') {
            // Handle fractional CRs like "1/8", "1/4", "1/2"
            if (cr.includes('/')) {
                return cr; // Return as string for lookup
            }
            return parseFloat(cr) || 0;
        }
        return 0;
    }

    /**
     * Detect how a monster was resolved in combat
     */
    static detectMonsterResolution(monster, combat) {
        const actor = monster.actor;
        if (!actor) return 'UNKNOWN';

        // 1. Defeated: If dead (HP <= 0)
        if (actor.system.attributes.hp.value <= 0) {
            return 'DEFEATED';
        }

        // 2. Escaped: If not dead and lost any HP
        if (actor.system.attributes.hp.value < actor.system.attributes.hp.max) {
            return 'ESCAPED';
        }

        // 3. Ignored: If not dead and took no damage
        if (actor.system.attributes.hp.value === actor.system.attributes.hp.max) {
            return 'IGNORED';
        }

        // Never auto-assign NEGOTIATED or CAPTURED
        // Default for non-dead monsters is ESCAPED (should not reach here)
        return 'ESCAPED';
    }

    /**
     * Apply XP to player characters
     */

    /**
     * Apply XP to players using pre-calculated data from xpData.players
     */
    static async applyXpToPlayersFromData(xpData) {
        try {
        
        // Validate player data before processing
        const validPlayers = xpData.players.filter(player => {
            if (!player || !player.actorId) {
                return false;
            }
            const actor = game.actors.get(player.actorId);
            if (!actor) {
                postConsoleAndNotification(MODULE.NAME, "XP Distribution | Actor not found", { actorId: player.actorId }, false, false);
                return false;
            }
            return true;
        });
        
        
        const results = [];
        
        for (const player of validPlayers) {
            const actor = game.actors.get(player.actorId);

            // Use the pre-calculated final XP for this player, with safety check
            const playerXp = Math.max(0, parseInt(player.finalXp) || 0);
            

            if (playerXp > 0) {
                            // Add XP to character - ensure we have valid numbers
                            const previousXp = Number(actor.system?.details?.xp?.value ?? 0);
                            const newXp = previousXp + playerXp;
                            
                            // Use a controlled update to avoid reactivity issues
                            try {
                await actor.update({
                    'system.details.xp.value': newXp
                                }, { 
                                    render: false  // Don't re-render immediately
                                });
                                
                            } catch (updateError) {
                                postConsoleAndNotification(MODULE.NAME, "XP Distribution | Error updating actor", { 
                                    actorId: player.actorId, 
                                    error: updateError.message 
                                }, false, false);
                                continue;
                            }

                // Small delay to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 10));

                // Get XP needed for next level
                const currentLevel = actor.system.details.level || 1;
                const nextLevel = currentLevel + 1;
                const nextLevelTotalXp = this.getXpForLevel(nextLevel);
                const nextLevelXp = nextLevelTotalXp - newXp;

                results.push({
                    name: actor.name,
                    img: actor.img,
                    xpGained: playerXp,
                    totalXp: newXp,
                    nextLevel: nextLevel,
                    nextLevelXp: nextLevelXp,
                    leveledUp: this.checkLevelUp(actor, previousXp, newXp)
                });
            } else {
                // Still include in results but with 0 XP
                const previousXp = actor.system.details.xp.value || 0;
                const currentLevel = actor.system.details.level || 1;
                const nextLevel = currentLevel + 1;
                const nextLevelTotalXp = this.getXpForLevel(nextLevel);
                const nextLevelXp = nextLevelTotalXp - previousXp;
                
                results.push({
                    name: actor.name,
                    img: actor.img,
                    xpGained: 0,
                    totalXp: previousXp,
                    nextLevel: nextLevel,
                    nextLevelXp: nextLevelXp,
                    leveledUp: false
                });
            }
        }

        return results;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "XP Distribution | Error in applyXpToPlayersFromData", error, false, true);
            throw error;
        }
    }

    /**
     * Check if a character leveled up
     */
    static checkLevelUp(actor, previousXp, newXp) {
        // Get current level and calculate what level the new XP would give
        const currentLevel = actor.system.details.level || 1;
        const newLevel = this.getLevelFromXp(newXp);
        
        // Level up if new level is higher than current level
        return newLevel > currentLevel;
    }

    /**
     * Get XP required for a specific level (D&D 5e standard)
     */
    static getXpForLevel(level) {
        const xpTable = {
            1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000,
            9: 48000, 10: 64000, 11: 85000, 12: 100000, 13: 120000, 14: 140000,
            15: 165000, 16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000
        };
        return xpTable[level] || 355000; // Cap at level 20
    }

    /**
     * Get level from XP amount (D&D 5e standard)
     */
    static getLevelFromXp(xp) {
        const xpTable = {
            0: 1, 300: 2, 900: 3, 2700: 4, 6500: 5, 14000: 6, 23000: 7, 34000: 8,
            48000: 9, 64000: 10, 85000: 11, 100000: 12, 120000: 13, 140000: 14,
            165000: 15, 195000: 16, 225000: 17, 265000: 18, 305000: 19, 355000: 20
        };
        
        // Find the highest level they qualify for
        let level = 1;
        for (const [requiredXp, levelNum] of Object.entries(xpTable)) {
            if (xp >= parseInt(requiredXp)) {
                level = levelNum;
            } else {
                break;
            }
        }
        return level;
    }

    /**
     * Post XP distribution results to chat
     */
    static async postXpResults(xpData, results) {
        try {
            // Log the final xpData for debugging
    

            const content = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-xp.hbs', {
                xpData: xpData,
                results: results
            });
            

            
            // Play notification sound
            playSound(window.COFFEEPUB?.SOUNDNOTIFICATION02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
            
            // Get the GM user for the speaker (messages always appear from GM)
            const gmUser = game.users.find(u => u.isGM);
            if (!gmUser) {
                postConsoleAndNotification(MODULE.NAME, 'No GM user found', "", false, false);
                return;
            }
            
            const isShared = game.settings.get(MODULE.ID, 'shareXpResults');
            
            // Create chat message using the same pattern as other systems
            await ChatMessage.create({
                content: content,
                type: CONST.CHAT_MESSAGE_STYLES.OTHER,
                speaker: ChatMessage.getSpeaker({ user: gmUser }),
                whisper: isShared ? [] : [game.user.id], // Empty array means visible to all
                flags: {
                    'coffee-pub-blacksmith': {
                        type: 'xpDistribution',
                        xpData: xpData,
                        results: results
                    }
                }
            });
            

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error posting XP results', error, false, false);
            
            // Fallback: post a simple text message instead
            const fallbackMessage = `XP Distribution Complete!\nTotal XP: ${xpData.adjustedTotalXp}\nPlayers: ${results.map(r => `${r.name}: +${r.xpGained} XP`).join(', ')}`;
            
            const gmUser = game.users.find(u => u.isGM);
            if (gmUser) {
                await ChatMessage.create({
                    content: fallbackMessage,
                    type: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    speaker: ChatMessage.getSpeaker({ user: gmUser }),
                    whisper: [game.user.id]
                });
            }
        }
    }

    /**
     * Generate XP distribution chat message
     */
    static async generateXpChatMessage(xpData, results) {
        try {
            postConsoleAndNotification(MODULE.NAME, 'Rendering template with data', { 
                xpDataKeys: Object.keys(xpData),
                resultsLength: results.length 
            }, true, false);
            
            const template = await foundry.applications.handlebars.renderTemplate('modules/coffee-pub-blacksmith/templates/cards-xp.hbs', {
                xpData: xpData,
                results: results
            });
            

            return template;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error rendering template', error, false, false);
            throw error;
        }
    }

    /**
     * Get resolution type XP multipliers from settings
     */
    static getResolutionMultipliers() {
        return {
            DEFEATED: game.settings.get(MODULE.ID, 'xpMultiplierDefeated'),
            NEGOTIATED: game.settings.get(MODULE.ID, 'xpMultiplierNegotiated'),
            ESCAPED: game.settings.get(MODULE.ID, 'xpMultiplierEscaped'),
            IGNORED: game.settings.get(MODULE.ID, 'xpMultiplierIgnored'),
            CAPTURED: game.settings.get(MODULE.ID, 'xpMultiplierCaptured'),
            REMOVED: 0.0  // Always 0 - no XP for removed monsters
        };
    }

    /**
     * Get party size multipliers based on settings
     */
    static getPartySizeMultipliers() {
        const handling = game.settings.get(MODULE.ID, 'xpPartySizeHandling');
        
        if (handling === 'equal') {
            // Equal division - no multipliers
            return {
                1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1
            };
        }
        
        // Default to D&D 5e standard multipliers
        return this.PARTY_SIZE_MULTIPLIERS;
    }

    /**
     * Debug hook for combat round
     */
    static _onCombatRound(combat, round, userId) {
        // Combat round hook - no action needed
    }

    /**
     * Debug hook for combat turn
     */
    static _onCombatTurn(combat, turn, userId) {
        // Combat turn hook - no action needed
    }
}

// ================================================================== 
// ===== XP DISTRIBUTION WINDOW =====================================
// ================================================================== 

class XpDistributionWindow extends FormApplication {
    constructor(xpData) {
        super(xpData);
        this.xpData = xpData;
        
        // Initialize milestone data if not present
        if (!this.xpData.milestoneData) {
            this.xpData.milestoneData = {
                category: '',
                title: '',
                description: '',
                xpAmount: '0'
            };
        }
        
        // Initialize XP calculations on startup
        this.updateXpCalculations();
        
        // Debug logging for player section
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'xp-distribution-window',
            template: 'modules/coffee-pub-blacksmith/templates/window-xp.hbs',
            title: 'XP Distribution',
            width: 600,
            height: 700,
            resizable: true,
            closeOnSubmit: false
        });
    }

    getData() {
        const multipliers = XpManager.getResolutionMultipliers();
        // New labels and legend descriptions
        const resolutionTypeLabels = {
            DEFEATED: { label: "Defeated", desc: "Combat Victory" },
            NEGOTIATED: { label: "Negotiated", desc: "Diplomatic Success" },
            ESCAPED: { label: "Escaped", desc: "Monster Retreated" },
            IGNORED: { label: "Ignored", desc: "Avoided Entirely" },
            CAPTURED: { label: "Captured", desc: "Tactical Success" },
            REMOVED: { label: "Removed", desc: "Excluded Entirely" }
        };
        // Order for dropdowns and legend
        const resolutionTypes = ["DEFEATED", "NEGOTIATED", "ESCAPED", "IGNORED", "CAPTURED", "REMOVED"];
        // For dropdowns
        const dropdownTypes = resolutionTypes;
        // For legend
        const legendTypes = resolutionTypes.map(key => ({
            key,
            label: resolutionTypeLabels[key].label,
            desc: resolutionTypeLabels[key].desc,
            multiplier: multipliers[key]
        }));
        return {
            xpData: this.xpData,
            resolutionTypes: dropdownTypes,
            legendTypes,
            multipliers,
            modeExperiencePoints: this.xpData.modeExperiencePoints || false,
            modeMilestone: this.xpData.modeMilestone || false
        };
    }

    /**
     * Update XP calculations based on active modes
     */
    updateXpCalculations() {
        // Calculate monster bucket from current monster data
        let monsterBucket = 0;
        if (this.xpData.modeExperiencePoints) {
            // Calculate total XP from current monster finalXp values
            const totalMonsterXp = this.xpData.monsters.reduce((sum, monster) => sum + monster.finalXp, 0);
            // Apply party multiplier
            monsterBucket = Math.floor(totalMonsterXp * (this.xpData.partyMultiplier || 1));
        }
        
        // Calculate milestone bucket
        let milestoneBucket = this.xpData.modeMilestone ? (this.xpData.milestoneXp || 0) : 0;
        
        // Total XP is always the sum of both buckets
        this.xpData.combinedXp = monsterBucket + milestoneBucket;
        this.xpData.xpPerPlayer = this.xpData.partySize > 0 ? Math.floor(this.xpData.combinedXp / this.xpData.partySize) : 0;
        
        // Debug logging
    }

    async _updateObject(event, formData) {
        try {
            // This method is no longer used since we handle everything through _onApplyXp
            // Keep it for compatibility but redirect to the new method
            await this._onApplyXp(event);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error in _updateObject', error, false, false);
            ui.notifications.error(`Error distributing XP: ${error.message}`);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // v13: FormApplication.activateListeners may still receive jQuery in some cases
        // Convert to native DOM if needed
        let htmlElement = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            htmlElement = html[0] || html.get?.(0) || html;
        } else if (html && typeof html.querySelectorAll !== 'function') {
            // Not a valid DOM element
            return;
        }
        
        if (!htmlElement) {
            return;
        }
        
        // Add event listeners for mode toggles
        const modeExperiencePoints = htmlElement.querySelector('#modeExperiencePoints');
        const modeMilestone = htmlElement.querySelector('#modeMilestone');
        if (modeExperiencePoints) modeExperiencePoints.addEventListener('change', this._onModeToggleChange.bind(this));
        if (modeMilestone) modeMilestone.addEventListener('change', this._onModeToggleChange.bind(this));
        
        // Add event listeners for milestone form
        const milestoneXp = htmlElement.querySelector('#milestone-xp');
        if (milestoneXp) milestoneXp.addEventListener('input', this._onMilestoneXpChange.bind(this));
        htmlElement.querySelectorAll('.milestone-input, .milestone-textarea, .milestone-select').forEach(el => {
            el.addEventListener('input', this._onMilestoneDataChange.bind(this));
            el.addEventListener('change', this._onMilestoneDataChange.bind(this));
        });
        
        // Add event listeners for player adjustments
        htmlElement.querySelectorAll('.player-adjustment').forEach(el => {
            el.addEventListener('input', this._onPlayerAdjustmentChange.bind(this));
        });
        htmlElement.querySelectorAll('.adjustment-sign').forEach(el => {
            el.addEventListener('click', this._onPlayerAdjustmentSignClick.bind(this));
        });
        
        // Add event listeners for action buttons
        const applyXp = htmlElement.querySelector('.apply-xp');
        const cancelXp = htmlElement.querySelector('.cancel-xp');
        if (applyXp) applyXp.addEventListener('click', this._onApplyXp.bind(this));
        if (cancelXp) cancelXp.addEventListener('click', this._onCancelXp.bind(this));
        
        // Add event listeners for monster resolution icons
        htmlElement.querySelectorAll('[data-table-type="monsters"] .resolution-icon').forEach(el => {
            el.addEventListener('click', this._onMonsterResolutionIconClick.bind(this));
            el.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    this._onMonsterResolutionIconClick(event);
                }
            });
        });
        
        // Add event listeners for player inclusion icons
        htmlElement.querySelectorAll('[data-table-type="players"] .inclusion-toggle').forEach(el => {
            el.addEventListener('click', this._onPlayerInclusionClick.bind(this));
        });
        
        // Initialize xpData.players with current state
        this._updateXpDataPlayers();
    }

    _onPlayerAdjustmentChange(event) {
        // Update display when player adjustments change
        this._updateXpDisplay();
        
        // Then update xpData.players with new adjustment
        this._updateXpDataPlayers();
    }

    _onPlayerAdjustmentSignClick(event) {
        const clickedIcon = event.currentTarget;
        const playerRow = clickedIcon.closest('[data-row-type="player"]');
        if (!playerRow) return;
        const playerId = playerRow.getAttribute('data-player-id');
        
        // Remove active class from both icons in this row
        playerRow.querySelectorAll('.adjustment-sign').forEach(icon => {
            icon.classList.remove('active');
        });
        
        // Add active class to clicked icon
        clickedIcon.classList.add('active');
        
        // Update the player's sign preference
        const player = this.xpData.players.find(p => p.actorId === playerId);
        if (player) {
            player.adjustmentSign = clickedIcon.getAttribute('data-sign');
            this._updateXpDataPlayers();
            this._updateXpDisplay();
        }
    }

    _onModeToggleChange(event) {
        const toggle = event.currentTarget;
        const mode = toggle.id.replace('mode', '').toLowerCase();
        const isChecked = toggle.checked;
        
        // Update the mode in xpData - handle camelCase conversion properly
        const modeKey = mode === 'experiencepoints' ? 'modeExperiencePoints' : `mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
        this.xpData[modeKey] = isChecked;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let element = this.element;
        if (element && (element.jquery || typeof element.find === 'function')) {
            element = element[0] || element.get?.(0) || element;
        }
        
        // Simple show/hide logic - no re-rendering
        if (mode === 'experiencepoints') {
            const expSection = element.querySelector('[data-section="experience-points"]');
            const resolutionSection = element.querySelector('[data-section="resolution-types"]');
            if (isChecked) {
                if (expSection) expSection.classList.remove('hidden');
                if (resolutionSection) resolutionSection.classList.remove('hidden');
            } else {
                if (expSection) expSection.classList.add('hidden');
                if (resolutionSection) resolutionSection.classList.add('hidden');
            }
        } else if (mode === 'milestone') {
            const milestoneSection = element.querySelector('[data-section="milestones"]');
            if (milestoneSection) {
                if (isChecked) {
                    milestoneSection.classList.remove('hidden');
                } else {
                    milestoneSection.classList.add('hidden');
                }
            }
        }
        
        // Always ensure Player Adjustments section is visible
        const playerAdjustmentsSection = element.querySelector('[data-section="player-adjustments"]');
        if (playerAdjustmentsSection) playerAdjustmentsSection.classList.remove('hidden');
        
        // Debug logging
        
        // Recalculate XP based on active modes
        this.updateXpCalculations();
        
        // Update display
        this._updateXpDisplay();
    }


    _onMilestoneXpChange(event) {
        const xpAmount = parseInt(event.currentTarget.value) || 0;
        this.xpData.milestoneXp = xpAmount;
        
        // Recalculate and update display
        this.updateXpCalculations();
        this._updateXpDisplay();
    }

    _onMilestoneDataChange(event) {
        // Store milestone data for later use in chat/application
        this._collectMilestoneData();
    }

    _collectMilestoneData() {
        // v13: Detect and convert jQuery to native DOM if needed
        let element = this.element;
        if (element && (element.jquery || typeof element.find === 'function')) {
            element = element[0] || element.get?.(0) || element;
        }
        
        // Collect milestone data directly from input elements since there's no form wrapper
        const categoryEl = element.querySelector('#milestone-category');
        const titleEl = element.querySelector('#milestone-title');
        const descriptionEl = element.querySelector('#milestone-description');
        const xpAmountEl = element.querySelector('#milestone-xp');
        const category = categoryEl ? categoryEl.value : '';
        const title = titleEl ? titleEl.value : '';
        const description = descriptionEl ? descriptionEl.value : '';
        const xpAmount = xpAmountEl ? xpAmountEl.value : '0';
        
        this.xpData.milestoneData = {
            category: category,
            title: title,
            description: description,
            xpAmount: xpAmount
        };
        
    }

    async _onApplyXp(event) {
        event.preventDefault();
        event.stopPropagation();
        try {
            
            // Collect milestone data before processing
            this._collectMilestoneData();
            
            // Ensure XP calculations are up to date
            this.updateXpCalculations();
            
            // Update player data with current UI state before applying XP
            this._updateXpDataPlayers();
            
            
            // Apply XP to players using the calculated data from xpData.players
            const results = await XpManager.applyXpToPlayersFromData(this.xpData);
            
            
            await XpManager.postXpResults(this.xpData, results);
            this.close();
            
            // Create notification message based on active modes
            let modeText = [];
            if (this.xpData.modeExperiencePoints) modeText.push('Experience Points');
            if (this.xpData.modeMilestone) modeText.push('Milestones');
            const modeString = modeText.length > 0 ? ` (${modeText.join(' + ')})` : '';
            
            ui.notifications.info(`XP distributed successfully! Total XP: ${this.xpData.combinedXp}${modeString}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error applying XP', error, false, true);
            ui.notifications.error(`Error distributing XP: ${error.message}`);
        }
    }

    _onCancelXp(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Close the window without applying XP
        this.close();
    }

    _updateXpDisplay() {
        // First update the core calculations
        this.updateXpCalculations();
        
        // Calculate totals for display (updateXpCalculations now handles the main logic)
        this.xpData.totalXp = this.xpData.monsters.reduce((sum, monster) => sum + monster.finalXp, 0);
        this.xpData.adjustedTotalXp = Math.floor(this.xpData.totalXp * (this.xpData.partyMultiplier || 1));

        // Get included count for display purposes
        const includedCount = this._getIncludedPlayerCount();

        // Update summary display
        // v13: Detect and convert jQuery to native DOM if needed
        let html = this.element;
        if (html && (html.jquery || typeof html.find === 'function')) {
            html = html[0] || html.get?.(0) || html;
        }
        const summaryItems = html.querySelectorAll('.xp-summary-item');
        if (summaryItems.length > 0) {
            const spans0 = summaryItems[0].querySelectorAll('span');
            if (spans0.length > 0) spans0[spans0.length - 1].textContent = this.xpData.totalXp;
        }
        if (summaryItems.length > 1) {
            const spans1 = summaryItems[1].querySelectorAll('span');
            if (spans1.length > 0) spans1[spans1.length - 1].textContent = includedCount;
        }
        if (summaryItems.length > 2) {
            const spans2 = summaryItems[2].querySelectorAll('span');
            if (spans2.length > 0) spans2[spans2.length - 1].textContent = (this.xpData.partyMultiplier || 1) + 'x';
        }
        if (summaryItems.length > 3) {
            const spans3 = summaryItems[3].querySelectorAll('span');
            if (spans3.length > 0) spans3[spans3.length - 1].textContent = this.xpData.adjustedTotalXp;
        }
        if (summaryItems.length > 4) {
            const spans4 = summaryItems[4].querySelectorAll('span');
            if (spans4.length > 0) spans4[spans4.length - 1].textContent = this.xpData.xpPerPlayer;
        }

        // Update monster rows
        const monsterRows = html.querySelectorAll('[data-table-type="monsters"] [data-row-type="monster"]');
        this.xpData.monsters.forEach((monster, i) => {
            if (i >= monsterRows.length) return;
            const row = monsterRows[i];
            const xpField = row.querySelector('[data-field="xp"]');
            if (!xpField) return;
            
            // Show the calculation based on current resolution
            if (monster.resolutionType === 'REMOVED') {
                // Show red "0" for removed monsters
                xpField.innerHTML = '<span class="excluded-xp">0</span>';
            } else {
                // Show the full calculation
                xpField.innerHTML = `${monster.baseXp} x ${monster.multiplier.toFixed(2)} = <strong>${monster.finalXp}</strong>`;
            }
        });

        // Update player rows
        const playerRows = html.querySelectorAll('[data-table-type="players"] [data-row-type="player"]');
        this.xpData.players.forEach((player, i) => {
            if (i >= playerRows.length) return;
            const row = playerRows[i];
            const inclusionIcon = row.querySelector('.inclusion-toggle');
            const isIncluded = inclusionIcon && inclusionIcon.classList.contains('active');
            
            if (isIncluded) {
            // Get adjustment value from input
            const adjInput = row.querySelector('.player-adjustment');
            let adjustment = adjInput ? parseInt(adjInput.value, 10) : 0;
            if (isNaN(adjustment)) adjustment = 0;
                
                // Get adjustment sign from active icon
                const activeSignEl = row.querySelector('.adjustment-sign.active');
                const activeSign = activeSignEl ? activeSignEl.getAttribute('data-sign') : '+';
                const signedAdjustment = activeSign === '-' ? -adjustment : adjustment;
                
                // Calculate total for this player (minimum 0)
                const calculatedTotal = this.xpData.xpPerPlayer + signedAdjustment;
                const total = Math.max(0, calculatedTotal);
            const baseXpEl = row.querySelector('.player-base-xp');
            const totalEl = row.querySelector('.calculated-total');
            if (baseXpEl) baseXpEl.textContent = this.xpData.xpPerPlayer;
            if (totalEl) totalEl.textContent = total;
            } else {
                // Show 0 for disabled players
                const baseXpEl = row.querySelector('.player-base-xp');
                const totalEl = row.querySelector('.calculated-total');
                if (baseXpEl) baseXpEl.textContent = '0';
                if (totalEl) totalEl.textContent = '0';
            }
        });
    }


    _onMonsterResolutionIconClick(event) {
        event.preventDefault();
        const icon = event.currentTarget;
        const monsterId = icon.getAttribute('data-monster-id');
        const resolution = icon.getAttribute('data-resolution');
        const monster = this.xpData.monsters.find(m => m.id === monsterId);
        if (monster && resolution) {
            // Update monster resolution and XP
            const resolutionMultipliers = XpManager.getResolutionMultipliers();
            monster.resolutionType = resolution;
            monster.multiplier = resolutionMultipliers[resolution] || 0;
            monster.finalXp = Math.floor(monster.baseXp * monster.multiplier);
            
            // Debug logging
            
            // Update the visual state of all icons for this monster
            const monsterRow = icon.closest('[data-row-type="monster"]');
            if (monsterRow) {
                monsterRow.querySelectorAll('.resolution-icon').forEach((element) => {
                    const iconResolution = element.getAttribute('data-resolution');
                    if (iconResolution === resolution) {
                        element.classList.remove('dimmed');
                        element.classList.add('active');
                    } else {
                        element.classList.remove('active');
                        element.classList.add('dimmed');
                    }
                });
            }
            
            // Update all XP calculations and display
            this._updateXpDisplay();
            
            // Update player data with new calculated values
            this._updateXpDataPlayers();
        }
    }

    _onPlayerInclusionClick(event) {
        const icon = event.currentTarget;
        const playerId = icon.getAttribute('data-player-id');
        
        // Toggle the icon state
        if (icon.classList.contains('active')) {
            icon.classList.remove('active');
            icon.classList.add('dimmed');
        } else {
            icon.classList.remove('dimmed');
            icon.classList.add('active');
        }
        
        // Update xpData to reflect included players
        const includedCount = this._getIncludedPlayerCount();
        this.xpData.partySize = includedCount;
        
        // Recalculate totals and update display
        this._updateXpDisplay();
        
        // Then update xpData.players with current inclusion status and calculated totals
        this._updateXpDataPlayers();
    }


    _getIncludedPlayerCount() {
        // v13: Detect and convert jQuery to native DOM if needed
        let element = this.element;
        if (element && (element.jquery || typeof element.find === 'function')) {
            element = element[0] || element.get?.(0) || element;
        }
        return element.querySelectorAll('[data-table-type="players"] .inclusion-toggle.active').length;
    }

    _updateXpDataPlayers() {
        // v13: Detect and convert jQuery to native DOM if needed
        let element = this.element;
        if (element && (element.jquery || typeof element.find === 'function')) {
            element = element[0] || element.get?.(0) || element;
        }
        
        // Update xpData.players with current inclusion status and calculated totals
        this.xpData.players = this.xpData.players.map(player => {
            // Skip if player is undefined
            if (!player) {
                return player;
            }
            
            // Use actorId to find the row (from the logged data structure)
            const playerEl = element.querySelector(`[data-player-id="${player.actorId}"]`);
            const row = playerEl ? playerEl.closest('[data-row-type="player"]') : null;
            if (!row) return player;
            const inclusionIcon = row.querySelector('.inclusion-toggle');
            const isIncluded = inclusionIcon && inclusionIcon.classList.contains('active');
            
            // Get adjustment value from input
            const adjInput = row.querySelector('.player-adjustment');
            let adjustment = adjInput ? parseInt(adjInput.value, 10) : 0;
            if (isNaN(adjustment)) adjustment = 0;
            
            // Get adjustment sign from active icon
            const activeSignEl = row.querySelector('.adjustment-sign.active');
            const activeSign = activeSignEl ? activeSignEl.getAttribute('data-sign') : '+';
            const signedAdjustment = activeSign === '-' ? -adjustment : adjustment;
            
            // Calculate final XP for this player (minimum 0)
            const calculatedXp = isIncluded ? this.xpData.xpPerPlayer + signedAdjustment : 0;
            const finalXp = Math.max(0, calculatedXp);
            
            return {
                ...player,
                included: isIncluded,
                adjustment: adjustment,
                adjustmentSign: player.adjustmentSign || '+',
                finalXp: finalXp
            };
        });
    }
} 
