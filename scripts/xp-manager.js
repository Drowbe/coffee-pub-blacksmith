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
        
        // Create and show the XP distribution window
        const xpWindow = new XpDistributionWindow(xpData);
        xpWindow.render(true);
        

    }

    /**
     * Calculate XP data for the combat
     */
    static async calculateXpData(combat) {
        const monsters = this.getCombatMonsters(combat);
        const players = this.getCombatPlayers(combat);

        const xpCalculationMethod = game.settings.get(MODULE.ID, 'xpCalculationMethod');
        const partySizeHandling = game.settings.get(MODULE.ID, 'xpPartySizeHandling');

        let monsterXpData = [];
        let totalXp = 0;
        let adjustedTotalXp = 0;
        let xpPerPlayer = 0;
        let partyMultiplier = 1;

        if (xpCalculationMethod === 'narrative') {
            // Narrative/Goal-Based XP: no monster XP calculation
            // XP will be entered manually per player in the UI
            // All XP values start at 0
            monsterXpData = [];
            totalXp = 0;
            adjustedTotalXp = 0;
            xpPerPlayer = 0;
        } else {
            // Standard or custom: calculate as before
            const resolutionMultipliers = this.getResolutionMultipliers();
            const partySizeMultipliers = this.getPartySizeMultipliers();

            monsterXpData = monsters.map(monster => {
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

            totalXp = monsterXpData.reduce((sum, monster) => sum + monster.finalXp, 0);
            const partySize = players.length;
            if (partySizeHandling === 'multipliers') {
                partyMultiplier = partySizeMultipliers[partySize] || 1;
                adjustedTotalXp = Math.floor(totalXp * partyMultiplier);
            } else {
                adjustedTotalXp = totalXp;
            }
            xpPerPlayer = partySize > 0 ? Math.floor(adjustedTotalXp / partySize) : 0;
        }

        return {
            combat: combat,
            monsters: monsterXpData,
            players: players,
            totalXp: totalXp,
            adjustedTotalXp: adjustedTotalXp,
            xpPerPlayer: xpPerPlayer,
            partySize: players.length,
            partyMultiplier: partyMultiplier,
            narrativeMode: xpCalculationMethod === 'narrative'
        };
    }

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
        return combat.combatants.filter(combatant => {
            const actor = combatant.actor;
            return actor && (actor.hasPlayerOwner || actor.type === 'character');
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
        const results = [];
        
        for (const player of xpData.players) {
            const actor = game.actors.get(player.actorId);
            if (!actor) continue;

            // Use the pre-calculated final XP for this player
            const playerXp = player.finalXp || 0;

            if (playerXp > 0) {
                // Add XP to character
                const previousXp = actor.system.details.xp.value || 0;
                const newXp = previousXp + playerXp;
                
                await actor.update({
                    'system.details.xp.value': newXp
                });

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
            postConsoleAndNotification(MODULE.NAME, "XP Distribution | Final xpData:", xpData, false, false);
    
            
            const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/xp-distribution-chat.hbs', {
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
            
            const template = await renderTemplate('modules/coffee-pub-blacksmith/templates/xp-distribution-chat.hbs', {
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
            narrativeMode: this.xpData.narrativeMode
        };
    }

    async _updateObject(event, formData) {
        try {
            if (this.xpData.narrativeMode) {
                // Narrative mode: award XP as entered per player
                const playerAdjustments = {};
                for (const player of this.xpData.players) {
                    const xp = formData[`player-narrative-xp-${player.actorId}`];
                    if (xp) {
                        playerAdjustments[player.actorId] = parseInt(xp) || 0;
                    }
                }
                // Apply XP to players
                const results = await XpManager.applyXpToPlayers({ ...this.xpData, xpPerPlayer: 0 }, playerAdjustments);
                await XpManager.postXpResults(this.xpData, results);
                this.close();
                ui.notifications.info(`XP distributed successfully! (Narrative Mode)`);
                return;
            }
            // Handle form submission
            const playerAdjustments = {};
            // Get player adjustments
            for (const player of this.xpData.players) {
                const adjustment = formData[`player-adjustment-${player.actorId}`];
                if (adjustment) {
                    playerAdjustments[player.actorId] = parseInt(adjustment) || 0;
                }
            }
            // Update monster resolution types
            for (const monster of this.xpData.monsters) {
                const newResolution = formData[`monster-resolution-${monster.id}`];
                if (newResolution && newResolution !== monster.resolutionType) {
                    const resolutionMultipliers = XpManager.getResolutionMultipliers();
                    monster.resolutionType = newResolution;
                    monster.multiplier = resolutionMultipliers[newResolution] || 0;
                    monster.finalXp = Math.floor(monster.baseXp * monster.multiplier);
                }
            }
            // Recalculate totals
            this.xpData.totalXp = this.xpData.monsters.reduce((sum, monster) => sum + monster.finalXp, 0);
            this.xpData.adjustedTotalXp = Math.floor(this.xpData.totalXp * this.xpData.partyMultiplier);
            this.xpData.xpPerPlayer = this.xpData.players.length > 0 ? 
                Math.floor(this.xpData.adjustedTotalXp / this.xpData.players.length) : 0;
            // Apply XP to players
            const results = await XpManager.applyXpToPlayers(this.xpData, playerAdjustments);
            await XpManager.postXpResults(this.xpData, results);
            this.close();
            ui.notifications.info(`XP distributed successfully! Total XP: ${this.xpData.adjustedTotalXp}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error in _updateObject', error, false, false);
            ui.notifications.error(`Error distributing XP: ${error.message}`);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Set initial selected values for monster resolution dropdowns (remove old dropdown logic)
        // Add event listeners for dynamic updates
        html.find('.player-adjustment').on('input', this._onPlayerAdjustmentChange.bind(this));
        html.find('.apply-xp').click(this._onApplyXp.bind(this));
        html.find('.cancel-xp').click(this._onCancelXp.bind(this));
        // Add event listeners for narrative XP input changes
        if (this.xpData.narrativeMode) {
            html.find('.player-narrative-xp').on('input', this._onNarrativeXpChange.bind(this));
        }
        // Add event listeners for monster resolution icons
        html.find('[data-table-type="monsters"] .resolution-icon').on('click', this._onMonsterResolutionIconClick.bind(this));
        html.find('[data-table-type="monsters"] .resolution-icon').on('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                this._onMonsterResolutionIconClick(event);
            }
        });
        
        // Add event listeners for player inclusion icons
        html.find('[data-table-type="players"] .inclusion-toggle').on('click', this._onPlayerInclusionClick.bind(this));
        
        // Add event listeners for monster inclusion icons
        
        // Initialize xpData.players with current state
        this._updateXpDataPlayers();
    }

    _onPlayerAdjustmentChange(event) {
        // Update display when player adjustments change
        this._updateXpDisplay();
        
        // Then update xpData.players with new adjustment
        this._updateXpDataPlayers();
    }

    async _onApplyXp(event) {
        event.preventDefault();
        event.stopPropagation();
        try {
            if (this.xpData.narrativeMode) {
                // Narrative mode: get XP from per-player fields
                const formData = new FormData(this.element.find('form')[0]);
                const playerAdjustments = {};
                for (const player of this.xpData.players) {
                    const xp = formData.get(`player-narrative-xp-${player.actorId}`);
                    if (xp) {
                        playerAdjustments[player.actorId] = parseInt(xp) || 0;
                    }
                }
                // Apply XP to players
                const results = await XpManager.applyXpToPlayers({ ...this.xpData, xpPerPlayer: 0 }, playerAdjustments);
                await XpManager.postXpResults(this.xpData, results);
                this.close();
                ui.notifications.info(`XP distributed successfully! (Narrative Mode)`);
                return;
            }

            // The monster resolutions and player data are already updated in this.xpData by the click handlers.
            // No need to re-read from the form or recalculate - use the data we already have.
            
            // Ensure xpData.xpPerPlayer is correct for the chat message
            const includedCount = this._getIncludedPlayerCount();
            this.xpData.xpPerPlayer = includedCount > 0 ? Math.floor(this.xpData.adjustedTotalXp / includedCount) : 0;
            
            // Apply XP to players using the calculated data from xpData.players
            const results = await XpManager.applyXpToPlayersFromData(this.xpData);
            await XpManager.postXpResults(this.xpData, results);
            this.close();
            ui.notifications.info(`XP distributed successfully! Total XP: ${this.xpData.adjustedTotalXp}`);
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
        // Recalculate totals based on monster finalXp values (which now reflect inclusion status)
        this.xpData.totalXp = this.xpData.monsters.reduce((sum, monster) => sum + monster.finalXp, 0);
        this.xpData.adjustedTotalXp = Math.floor(this.xpData.totalXp * this.xpData.partyMultiplier);
        
        // Get included count and update xpPerPlayer based on INCLUDED players only
        const includedCount = this._getIncludedPlayerCount();
        this.xpData.xpPerPlayer = includedCount > 0 ? Math.floor(this.xpData.adjustedTotalXp / includedCount) : 0;

        // Update summary display
        const html = this.element;
        html.find('.xp-summary-item').eq(0).find('span').last().text(this.xpData.totalXp);
        html.find('.xp-summary-item').eq(1).find('span').last().text(includedCount);
        html.find('.xp-summary-item').eq(2).find('span').last().text(this.xpData.partyMultiplier + 'x');
        html.find('.xp-summary-item').eq(3).find('span').last().text(this.xpData.adjustedTotalXp);
        html.find('.xp-summary-item').eq(4).find('span').last().text(this.xpData.xpPerPlayer);

        // Update monster rows
        this.xpData.monsters.forEach((monster, i) => {
            const row = html.find('[data-table-type="monsters"] [data-row-type="monster"]').eq(i);
            
            // Show the calculation based on current resolution
            if (monster.resolutionType === 'REMOVED') {
                // Show red "0" for removed monsters
                row.find('[data-field="xp"]').html('<span class="excluded-xp">0</span>');
            } else {
                // Show the full calculation
                row.find('[data-field="xp"]').html(`${monster.baseXp} x ${monster.multiplier.toFixed(2)} = <strong>${monster.finalXp}</strong>`);
            }
        });

        // Update player rows
        this.xpData.players.forEach((player, i) => {
            const row = html.find('[data-table-type="players"] [data-row-type="player"]').eq(i);
            const inclusionIcon = row.find('.inclusion-toggle');
            const isIncluded = inclusionIcon.hasClass('active');
            
            if (isIncluded) {
                // Get adjustment value from input
                const adjInput = row.find('.player-adjustment');
                let adjustment = parseInt(adjInput.val(), 10);
                if (isNaN(adjustment)) adjustment = 0;
                // Calculate total for this player
                const total = this.xpData.xpPerPlayer + adjustment;
                row.find('.player-base-xp').text(this.xpData.xpPerPlayer);
                row.find('.calculated-total').text(total);
            } else {
                // Show 0 for disabled players
                row.find('.player-base-xp').text('0');
                row.find('.calculated-total').text('0');
            }
        });
    }

    _onNarrativeXpChange(event) {
        // Calculate total XP from all narrative XP inputs
        let totalXp = 0;
        this.element.find('.player-narrative-xp').each(function() {
            const value = parseInt($(this).val()) || 0;
            totalXp += value;
        });
        
        // Update the total XP display
        this.element.find('#xp-total-display').text(totalXp);
    }

    _onMonsterResolutionIconClick(event) {
        event.preventDefault();
        const icon = $(event.currentTarget);
        const monsterId = icon.data('monster-id');
        const resolution = icon.data('resolution');
        const monster = this.xpData.monsters.find(m => m.id === monsterId);
        if (monster && resolution) {
            // Update monster resolution and XP
            const resolutionMultipliers = XpManager.getResolutionMultipliers();
            monster.resolutionType = resolution;
            monster.multiplier = resolutionMultipliers[resolution] || 0;
            monster.finalXp = Math.floor(monster.baseXp * monster.multiplier);
            
            // Update the visual state of all icons for this monster
            const monsterRow = icon.closest('[data-row-type="monster"]');
            monsterRow.find('.resolution-icon').each((index, element) => {
                const $element = $(element);
                const iconResolution = $element.data('resolution');
                if (iconResolution === resolution) {
                    $element.removeClass('dimmed').addClass('active');
                } else {
                    $element.removeClass('active').addClass('dimmed');
                }
            });
            
            // Update all XP calculations and display
            this._updateXpDisplay();
            
            // Update player data with new calculated values
            this._updateXpDataPlayers();
        }
    }

    _onPlayerInclusionClick(event) {
        const icon = $(event.currentTarget);
        const playerId = icon.data('player-id');
        
        // Toggle the icon state
        if (icon.hasClass('active')) {
            icon.removeClass('active').addClass('dimmed');
        } else {
            icon.removeClass('dimmed').addClass('active');
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
        return this.element.find('[data-table-type="players"] .inclusion-toggle.active').length;
    }

    _updateXpDataPlayers() {
        // Update xpData.players with current inclusion status and calculated totals
        this.xpData.players = this.xpData.players.map(player => {
            // Skip if player is undefined
            if (!player) {
                return player;
            }
            
            // Use actorId to find the row (from the logged data structure)
            const row = this.element.find(`[data-player-id="${player.actorId}"]`).closest('[data-row-type="player"]');
            const inclusionIcon = row.find('.inclusion-toggle');
            const isIncluded = inclusionIcon.hasClass('active');
            
            // Get adjustment value from input
            const adjInput = row.find('.player-adjustment');
            let adjustment = parseInt(adjInput.val(), 10);
            if (isNaN(adjustment)) adjustment = 0;
            
            // Calculate final XP for this player
            const finalXp = isIncluded ? this.xpData.xpPerPlayer + adjustment : 0;
            
            return {
                ...player,
                included: isIncluded,
                adjustment: adjustment,
                finalXp: finalXp
            };
        });
    }
} 
