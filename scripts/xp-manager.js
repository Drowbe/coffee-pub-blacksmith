// ================================================================== 
// ===== XP MANAGER =================================================
// ================================================================== 

console.log('XP Manager: Script file loaded');

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification, playSound, COFFEEPUB } from './global.js';

export class XpManager {
    // Standard D&D 5e CR to XP mapping
    static CR_TO_XP = {
        0: 10, "1/8": 25, "1/4": 50, "1/2": 100, 1: 200, 2: 450, 3: 700, 4: 1100,
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
        CAPTURED: 1.0        // Full XP for tactical success
    };

    // Party size multipliers (D&D 5e standard)
    static PARTY_SIZE_MULTIPLIERS = {
        1: 1, 2: 1.5, 3: 2, 4: 2.5, 5: 2, 6: 1.5, 7: 1.25, 8: 1
    };

    static initialize() {
        console.log('XP Manager: Initialize method called');
        postConsoleAndNotification('XP Manager: Initializing...', '', false, true, false);
        
        // Register multiple combat hooks to see which ones are triggered
        Hooks.on('deleteCombat', this._onCombatEnd.bind(this));
        Hooks.on('combatRound', this._onCombatRound.bind(this));
        Hooks.on('combatTurn', this._onCombatTurn.bind(this));
        
        postConsoleAndNotification('XP Manager: Hook registered for deleteCombat', '', false, true, false);
        postConsoleAndNotification('XP Manager initialized', '', false, true, false);

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
        console.log('XP Manager: Combat delete hook triggered', { 
            combat: combat?.id, 
            userId: userId,
            combatExists: !!combat,
            combatData: combat ? {
                id: combat.id,
                scene: combat.scene?.id,
                combatants: combat.combatants?.length,
                round: combat.round,
                turn: combat.turn
            } : null
        });
        
        postConsoleAndNotification('XP Manager: Combat deletion detected', { combat: combat?.id, userId: userId }, false, true, false);
        
        if (!game.user.isGM) {
            console.log('XP Manager: Not GM, skipping');
            postConsoleAndNotification('XP Manager: Not GM, skipping', '', false, true, false);
            return;
        }
        
        // Check if XP distribution is enabled
        const isEnabled = game.settings.get(MODULE_ID, 'enableXpDistribution');
        console.log('XP Manager: XP distribution enabled?', isEnabled);
        postConsoleAndNotification('XP Manager: XP distribution enabled?', isEnabled, false, true, false);
        
        if (!isEnabled) {
            console.log('XP Manager: XP distribution disabled in settings');
            postConsoleAndNotification('XP Manager: XP distribution disabled in settings', '', false, true, false);
            return;
        }

        // Wait a moment for combat to fully end
        setTimeout(async () => {
            console.log('XP Manager: Showing XP distribution window');
            postConsoleAndNotification('XP Manager: Showing XP distribution window', '', false, true, false);
            await this.showXpDistributionWindow(combat);
        }, 1000);
    }

    /**
     * Show the XP distribution window
     */
    static async showXpDistributionWindow(combat) {
        postConsoleAndNotification('XP Manager: Starting XP calculation', { combatId: combat.id }, false, true, false);
        
        const xpData = await this.calculateXpData(combat);
        
        postConsoleAndNotification('XP Manager: XP data calculated', { 
            totalXp: xpData.totalXp, 
            monsters: xpData.monsters.length, 
            players: xpData.players.length 
        }, false, true, false);
        
        // Create and show the XP distribution window
        const xpWindow = new XpDistributionWindow(xpData);
        xpWindow.render(true);
        
        postConsoleAndNotification('XP Manager: XP distribution window rendered', '', false, true, false);
    }

    /**
     * Calculate XP data for the combat
     */
    static async calculateXpData(combat) {
        const monsters = this.getCombatMonsters(combat);
        const players = this.getCombatPlayers(combat);

        const xpCalculationMethod = game.settings.get(MODULE_ID, 'xpCalculationMethod');
        const partySizeHandling = game.settings.get(MODULE_ID, 'xpPartySizeHandling');

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
     * Get monster's base XP from CR
     */
    static getMonsterBaseXp(monster) {
        const cr = this.getMonsterCR(monster);
        return this.CR_TO_XP[cr] || 0;
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
    static async applyXpToPlayers(xpData, playerAdjustments = {}) {
        const results = [];
        
        for (const player of xpData.players) {
            const actor = player.actor;
            if (!actor) continue;

            // Get base XP for this player
            let playerXp = xpData.xpPerPlayer;
            
            // Apply any adjustments
            if (playerAdjustments[actor.id]) {
                playerXp += playerAdjustments[actor.id];
            }

            if (playerXp > 0) {
                // Add XP to character
                const currentXp = actor.system.details.xp.value || 0;
                const newXp = currentXp + playerXp;
                
                await actor.update({
                    'system.details.xp.value': newXp
                });

                results.push({
                    name: actor.name,
                    img: actor.img,
                    xpGained: playerXp,
                    totalXp: newXp,
                    leveledUp: this.checkLevelUp(actor, currentXp, newXp)
                });
            }
        }

        return results;
    }

    /**
     * Check if a character leveled up
     */
    static checkLevelUp(actor, oldXp, newXp) {
        // This is a simplified check - you might want to implement proper level-up logic
        // based on your game system's XP requirements
        return false; // Placeholder
    }

    /**
     * Post XP distribution results to chat
     */
    static async postXpResults(xpData, results) {
        try {
            console.log('XP Manager: Generating chat message', { xpData, results });
            
            const content = await this.generateXpChatMessage(xpData, results);
            
            console.log('XP Manager: Chat message generated', { content: content.substring(0, 100) + '...' });
            
            // Play notification sound
            playSound(COFFEEPUB.SOUNDNOTIFICATION02, COFFEEPUB.SOUNDVOLUMENORMAL);
            
            // Get the GM user for the speaker (messages always appear from GM)
            const gmUser = game.users.find(u => u.isGM);
            if (!gmUser) {
                console.error('XP Manager: No GM user found');
                return;
            }
            
            const isShared = game.settings.get(MODULE_ID, 'shareXpResults');
            
            // Create chat message using the same pattern as other systems
            await ChatMessage.create({
                content: content,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER,
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
            
            console.log('XP Manager: Chat message posted successfully');
        } catch (error) {
            console.error('XP Manager: Error posting XP results', error);
            
            // Fallback: post a simple text message instead
            const fallbackMessage = `XP Distribution Complete!\nTotal XP: ${xpData.adjustedTotalXp}\nPlayers: ${results.map(r => `${r.name}: +${r.xpGained} XP`).join(', ')}`;
            
            const gmUser = game.users.find(u => u.isGM);
            if (gmUser) {
                await ChatMessage.create({
                    content: fallbackMessage,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
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
            console.log('XP Manager: Rendering template with data', { 
                xpDataKeys: Object.keys(xpData),
                resultsLength: results.length 
            });
            
            const template = await renderTemplate('modules/coffee-pub-blacksmith/templates/xp-distribution-chat.hbs', {
                xpData: xpData,
                results: results
            });
            
            console.log('XP Manager: Template rendered successfully');
            return template;
        } catch (error) {
            console.error('XP Manager: Error rendering template', error);
            throw error;
        }
    }

    /**
     * Get resolution type XP multipliers from settings
     */
    static getResolutionMultipliers() {
        return {
            DEFEATED: game.settings.get(MODULE_ID, 'xpMultiplierDefeated'),
            NEGOTIATED: game.settings.get(MODULE_ID, 'xpMultiplierNegotiated'),
            ESCAPED: game.settings.get(MODULE_ID, 'xpMultiplierEscaped'),
            IGNORED: game.settings.get(MODULE_ID, 'xpMultiplierIgnored'),
            CAPTURED: game.settings.get(MODULE_ID, 'xpMultiplierCaptured')
        };
    }

    /**
     * Get party size multipliers based on settings
     */
    static getPartySizeMultipliers() {
        const handling = game.settings.get(MODULE_ID, 'xpPartySizeHandling');
        
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
        console.log('XP Manager: Combat round hook triggered', { combat: combat.id, round, userId });
    }

    /**
     * Debug hook for combat turn
     */
    static _onCombatTurn(combat, turn, userId) {
        console.log('XP Manager: Combat turn hook triggered', { combat: combat.id, turn, userId });
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
        return mergeObject(super.defaultOptions, {
            id: 'xp-distribution-window',
            template: 'modules/coffee-pub-blacksmith/templates/xp-distribution.hbs',
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
            CAPTURED: { label: "Captured", desc: "Tactical Success" }
        };
        // Order for dropdowns and legend
        const resolutionTypes = ["DEFEATED", "NEGOTIATED", "ESCAPED", "IGNORED", "CAPTURED"];
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
            console.error('XP Manager: Error in _updateObject', error);
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
        html.find('.monster-resolution-icon').on('click', this._onMonsterResolutionIconClick.bind(this));
        html.find('.monster-resolution-icon').on('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                this._onMonsterResolutionIconClick(event);
            }
        });
    }

    _onPlayerAdjustmentChange(event) {
        // Update display when player adjustments change
        this._updateXpDisplay();
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

            // Get player adjustments directly from the input fields
            const html = this.element;
            const playerAdjustments = {};
            for (const player of this.xpData.players) {
                const adjustmentInput = html.find(`input[name="player-adjustment-${player.actorId}"]`);
                const adjustment = adjustmentInput.val();
                if (adjustment) {
                    playerAdjustments[player.actorId] = parseInt(adjustment, 10) || 0;
                }
            }

            // The monster resolutions are already updated in this.xpData by the click handlers.
            // No need to re-read from the form. Recalculate totals using the latest data.
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
            console.error('XP Manager: Error applying XP', error);
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
        // Recalculate totals
        this.xpData.totalXp = this.xpData.monsters.reduce((sum, monster) => sum + monster.finalXp, 0);
        this.xpData.adjustedTotalXp = Math.floor(this.xpData.totalXp * this.xpData.partyMultiplier);
        this.xpData.xpPerPlayer = this.xpData.players.length > 0 ? Math.floor(this.xpData.adjustedTotalXp / this.xpData.players.length) : 0;

        // Update summary
        const html = this.element;
        html.find('.xp-summary-item').eq(0).find('span').last().text(this.xpData.totalXp);
        html.find('.xp-summary-item').eq(1).find('span').last().text(this.xpData.partySize);
        html.find('.xp-summary-item').eq(2).find('span').last().text(this.xpData.partyMultiplier + 'x');
        html.find('.xp-summary-item').eq(3).find('span').last().text(this.xpData.adjustedTotalXp);
        html.find('.xp-summary-item').eq(4).find('span').last().text(this.xpData.xpPerPlayer);

        // Update monster rows
        this.xpData.monsters.forEach((monster, i) => {
            const row = html.find('.xp-monster-row').eq(i);
            row.find('.monster-xp-calc').html(`${monster.baseXp} x ${monster.multiplier.toFixed(2)} = <strong>${monster.finalXp}</strong>`);
        });

        // Update player rows
        this.xpData.players.forEach((player, i) => {
            const row = html.find('.xp-player-row').eq(i);
            // Get adjustment value from input
            const adjInput = row.find('.player-adjustment');
            let adjustment = parseInt(adjInput.val(), 10);
            if (isNaN(adjustment)) adjustment = 0;
            // Calculate total for this player
            const total = this.xpData.xpPerPlayer + adjustment;
            row.find('.player-base-xp').text(this.xpData.xpPerPlayer);
            row.find('.calculated-total').text(total);
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
            const monsterRow = icon.closest('.xp-monster-row');
            monsterRow.find('.monster-resolution-icon').each((index, element) => {
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
        }
    }
} 