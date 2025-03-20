// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound } from './global.js';

/**
 * CombatTracker - Handles combat management functionality for player characters
 * This class focuses on initiative management and combat tracker features
 * that are separate from the actual timer functionality.
 */
class CombatTracker {
    static ID = 'combat-tracker';
    
    // Track if we've set the first combatant for this combat
    static _hasSetFirstCombatant = false;
    
    // Track the last processed round
    static _lastProcessedRound = 0;
    
    /**
     * Initialize the Combat Tracker functionality
     * Sets up hooks for combat events
     */
    static initialize() {
        Hooks.once('ready', () => {
            try {
                postConsoleAndNotification("Initializing Combat Tracker", "", false, false, false);
                
                // Reset last processed round
                this._lastProcessedRound = 0;
                
                // Hook for detecting when all initiatives have been rolled
                Hooks.on('updateCombatant', (combatant, data, options, userId) => {
                    // Only process if initiative was changed and we're the GM
                    if (!game.user.isGM || !('initiative' in data) || data.initiative === null) return;
                    
                    postConsoleAndNotification("Combat Tracker: Combatant initiative updated", {
                        combatantName: combatant.name,
                        initiative: data.initiative
                    }, false, true, false);
                    
                    this._checkAllInitiativesRolled(combatant.combat);
                });
                
                // Reset first combatant flag when a new combat is created
                Hooks.on('createCombat', async (combat) => {
                    postConsoleAndNotification("Combat Tracker: New combat created, resetting first combatant flag", "", false, true, false);
                    this._hasSetFirstCombatant = false;
                    
                    // Auto-open combat tracker when combat is created
                    if (game.settings.get(MODULE_ID, 'combatTrackerOpen')) {
                        // Check if this user owns any combatants in the combat
                        if (combat.combatants.find(c => c.isOwner)) {
                            postConsoleAndNotification("Auto-opening combat tracker for player with combatant in new combat", "", false, true, false);
                            const tabApp = ui["combat"];
                            tabApp.renderPopout(tabApp);
                        }
                    }
                });
                
                // Reset first combatant flag when combat is deleted or ended
                Hooks.on('deleteCombat', () => {
                    postConsoleAndNotification("Combat Tracker: Combat deleted, resetting first combatant flag", "", false, true, false);
                    this._hasSetFirstCombatant = false;
                });
                
                Hooks.on('endCombat', () => {
                    postConsoleAndNotification("Combat Tracker: Combat ended, resetting first combatant flag", "", false, true, false);
                    this._hasSetFirstCombatant = false;
                });
                
                // Check when a combat starts
                Hooks.on('combatStart', (combat) => {
                    postConsoleAndNotification("Combat Tracker: Combat started, checking if all initiatives are already rolled", "", false, true, false);
                    // Wait a small delay to ensure all combatants are fully initialized
                    setTimeout(() => this._checkAllInitiativesRolled(combat), 100);
                });
                
                // Check when combat round changes
                Hooks.on('updateCombat', (combat, changed) => {
                    // If the round changes, reset the flag and check initiatives
                    if ('round' in changed && combat.round > 0) {
                        postConsoleAndNotification("Combat Tracker: Round changed to " + combat.round + ", checking initiatives", "", false, true, false);
                        // Wait a small delay to ensure all combat state is updated
                        setTimeout(() => this._checkAllInitiativesRolled(combat), 100);
                        
                        // Only for GM: Clear initiative and roll for NPCs if enabled
                        if (game.user.isGM) {
                            this._handleRoundChange(combat);
                        }
                    }
                });
                
                // Handle player initiative rolling
                Hooks.on('updateCombat', (combat, changed, options, userId) => {
                    // Only process round changes (when the combat updates with a new round)
                    if (!("round" in changed)) return;
                    
                    // Skip if this is the first round (initial creation)
                    if (combat.round <= 1) return;
                    
                    // Check the initiative clearing setting - only proceed if initiative is being cleared
                    if (!game.settings.get(MODULE_ID, 'combatTrackerClearInitiative')) return;
                    
                    // Add a slight delay to ensure the GM has time to clear initiatives first
                    setTimeout(() => {
                        // Now roll initiative for player-owned characters
                        this._rollInitiativeForPlayerCharacters(combat);
                    }, 1000);
                });
                
                // Hook into combat start for player initiative
                Hooks.on('combatStart', (combat) => {
                    // When combat starts, check if we should roll for player characters
                    setTimeout(() => {
                        this._rollInitiativeForPlayerCharacters(combat);
                    }, 500);
                });
                
                // Handle player auto-roll when their combatants are created
                Hooks.on('createCombatant', async (combatant, options, userId) => {
                    // Handle player auto-roll
                    if (!game.user.isGM) {
                        // Only process if:
                        // 1. The combatant has an actor
                        // 2. The actor is player-owned
                        // 3. The current user owns the actor
                        // 4. The combatant has null initiative
                        // 5. Auto-roll is enabled for this user
                        if (combatant.actor && 
                            combatant.actor.hasPlayerOwner && 
                            combatant.actor.isOwner && 
                            combatant.initiative === null &&
                            game.settings.get(MODULE_ID, 'combatTrackerRollInitiativePlayer')) {
                            
                            postConsoleAndNotification(`Combat Tracker: Auto-rolling initiative for new player combatant ${combatant.name}`, "", false, true, false);
                            await combatant.rollInitiative();
                        }
                        return;
                    }

                    // Handle GM auto-roll and initiative modes for NPCs
                    // Get NPC initiative setting
                    const initiativeMode = game.settings.get(MODULE_ID, 'combatTrackerAddInitiative');
                    
                    // Check if we should auto-roll initiative for non-player combatants when added to tracker
                    const shouldAutoRoll = game.settings.get(MODULE_ID, 'combatTrackerRollInitiativeNonPlayer');
                    
                    // Skip player-controlled combatants
                    const actor = combatant.actor;
                    if (!actor || actor.hasPlayerOwner) return;
                    
                    const combat = combatant.combat;
                    
                    // CASE 1: Combat hasn't started yet - auto-roll for NPCs/monsters when setting is enabled
                    if (shouldAutoRoll && (!combat?.started || combat.round === 0)) {
                        // Don't roll if initiative is already set
                        if (combatant.initiative === null) {
                            await combatant.rollInitiative();
                            postConsoleAndNotification("Combat Tracker: Auto-rolled initiative for " + combatant.name + " (combat not started yet)", "", false, true, false);
                        }
                        return;
                    }
                    
                    // CASE 2: Combat is in progress - use the combatTrackerAddInitiative setting
                    // Skip processing if the setting is 'none' or combat isn't started
                    if (initiativeMode === 'none' || !combat?.started) return;
                    
                    postConsoleAndNotification("Combat Tracker: NPC/Monster added to combat", {
                        name: combatant.name,
                        mode: initiativeMode
                    }, false, true, false);
                    
                    // Process based on setting
                    switch (initiativeMode) {
                        case 'auto':
                            // Roll initiative automatically
                            await combatant.rollInitiative();
                            postConsoleAndNotification("Combat Tracker: Rolled initiative for " + combatant.name, "", false, true, false);
                            break;
                        
                        case 'next': 
                            // Set initiative to act immediately after current turn
                            if (combat.turn !== undefined && combat.turns) {
                                const currentCombatantIndex = combat.turn;
                                const nextCombatantIndex = (currentCombatantIndex + 1) % combat.turns.length;
                                const currentInit = combat.turns[currentCombatantIndex]?.initiative || 0;
                                const nextInit = combat.turns[nextCombatantIndex]?.initiative || 0;
                                
                                // If next combatant has the same initiative as the current one
                                // add a small decimal to place after current but before next with same init
                                let newInit = currentInit;
                                if (currentInit === nextInit) {
                                    newInit = currentInit - 0.01;
                                } else {
                                    // Set halfway between current and next initiative
                                    newInit = (currentInit + nextInit) / 2;
                                }
                                
                                await combatant.update({initiative: newInit});
                                postConsoleAndNotification("Combat Tracker: Set " + combatant.name + " to act next with initiative " + newInit, "", false, true, false);
                            } else {
                                // If there's no active combat or turn, just roll
                                await combatant.rollInitiative();
                                postConsoleAndNotification("Combat Tracker: No active turn, rolled initiative for " + combatant.name, "", false, true, false);
                            }
                            break;
                        
                        case 'last':
                            // Find the lowest initiative in combat
                            if (combat.turns && combat.turns.length > 0) {
                                const validTurns = combat.turns.filter(t => t.id !== combatant.id && t.initiative !== null);
                                if (validTurns.length > 0) {
                                    const lowestInit = Math.min(...validTurns.map(t => t.initiative));
                                    await combatant.update({initiative: lowestInit - 1});
                                    postConsoleAndNotification("Combat Tracker: Set " + combatant.name + " to act last with initiative " + (lowestInit - 1), "", false, true, false);
                                } else {
                                    // If no other combatants, just roll
                                    await combatant.rollInitiative();
                                    postConsoleAndNotification("Combat Tracker: No other combatants with initiative, rolled for " + combatant.name, "", false, true, false);
                                }
                            } else {
                                // If there's no other combatants, just roll
                                await combatant.rollInitiative();
                                postConsoleAndNotification("Combat Tracker: No other combatants, rolled initiative for " + combatant.name, "", false, true, false);
                            }
                            break;
                    }
                });
                
                // Handle auto-open for both new combats and client reloads
                Hooks.on('renderCombatTracker', () => {
                    // Only proceed if the setting is enabled
                    if (!game.settings.get(MODULE_ID, 'combatTrackerOpen')) return;

                    const combat = game.combat;
                    // Check if there are combatants in the combat
                    if (combat?.combatants.size > 0) {
                        // Check if this user owns any combatants in the combat
                        if (combat.combatants.find(c => c.isOwner)) {
                            postConsoleAndNotification("Auto-opening combat tracker for player with combatant in combat", "", false, true, false);
                            const tabApp = ui["combat"];
                            tabApp.renderPopout(tabApp);
                        }
                    }
                });
                
            } catch (error) {
                console.error(`${MODULE_TITLE} | Could not initialize Combat Tracker:`, error);
            }
        });
    }
    
    /**
     * Handle round changes in combat - clears initiatives if enabled
     * @param {Combat} combat - The combat instance
     */
    static async _handleRoundChange(combat) {
        if (!game.user.isGM) return;
        
        // Check if we should clear initiative when round changes
        // ONLY clear initiative when changing to round 2 or higher
        if (game.settings.get(MODULE_ID, 'combatTrackerClearInitiative') && combat.round > 1) {
            postConsoleAndNotification("Combat Tracker: Clearing initiative for all combatants (round > 1)", "", false, true, false);
            
            // Create an array of updates to apply to all combatants
            // Use the turns array instead of combatants since combatants might not be an array
            const combatants = combat.turns || [];
            const updates = combatants.map(c => {
                return {
                    _id: c.id,
                    initiative: null
                };
            });
            
            // Apply the updates
            if (updates.length > 0) {
                await combat.updateEmbeddedDocuments("Combatant", updates);
                postConsoleAndNotification("Combat Tracker: Initiative cleared for " + updates.length + " combatants", "", false, true, false);
                
                // After clearing initiative, auto-roll for non-player combatants if enabled
                if (game.settings.get(MODULE_ID, 'combatTrackerRollInitiativeNonPlayer')) {
                    postConsoleAndNotification("Combat Tracker: Auto-rolling initiative for non-player combatants after clearing", "", false, true, false);
                    await this._rollInitiativeForNonPlayers(combat);
                }
            }
        }
    }
    
    /**
     * Helper method to check if all combatants have initiative values and set first combatant if needed
     * Handles the 'combatTrackerSetFirstTurn' setting
     * @param {Combat} combat - The combat instance
     */
    static async _checkAllInitiativesRolled(combat) {
        if (!combat || !combat.started || !game.user.isGM) return;
        
        // Don't check if we've already set the first combatant for this round
        if (this._hasSetFirstCombatant) {
            postConsoleAndNotification("Combat Tracker: First combatant already set for this round, skipping check", "", false, true, false);
            return;
        }
        
        // Don't proceed if the setting is not enabled
        if (!game.settings.get(MODULE_ID, 'combatTrackerSetFirstTurn')) {
            postConsoleAndNotification("Combat Tracker: Setting not enabled, skipping check", "", false, true, false);
            return;
        }
        
        // Use the turns array to get combatants
        const combatants = combat.turns || [];
        
        // Skip empty combats
        if (combatants.length === 0) {
            postConsoleAndNotification("Combat Tracker: No combatants found, skipping", "", false, true, false);
            return;
        }
        
        // Log combatant initiatives for debugging
        const initiativeValues = combatants.map(c => ({ 
            id: c.id, 
            name: c.name, 
            initiative: c.initiative,
            isDefeated: c.isDefeated
        }));
        
        postConsoleAndNotification("Combat Tracker: Checking all initiatives:", initiativeValues, false, true, false);
        
        // Get combatants that need initiative (not defeated and without initiative)
        const combatantsNeedingInitiative = combatants.filter(c => c.initiative === null && !c.isDefeated);
        
        postConsoleAndNotification("Combat Tracker: Combatants needing initiative:", 
            combatantsNeedingInitiative.map(c => c.name), false, true, false);
        
        // If no combatants need initiative, all have been rolled
        if (combatantsNeedingInitiative.length === 0) {
            postConsoleAndNotification("Combat Tracker: All combatants have initiative in round " + combat.round + ", setting first combatant", "", false, true, false);
            
            // Mark that we've set the first combatant for this round BEFORE making the async call
            // This prevents potential race conditions
            this._hasSetFirstCombatant = true;
            
            try {
                // Set the turn to 0 (first combatant)
                await combat.update({turn: 0}, {diff: false});
                
                postConsoleAndNotification("Combat Tracker: First combatant set to: " + combatants[0]?.name, "", false, true, false);
            } catch (error) {
                console.error("Error setting first combatant:", error);
                // Reset the flag if we failed
                this._hasSetFirstCombatant = false;
            }
        }
    }
    
    /**
     * Helper method to roll initiative for non-player combatants
     * Handles the 'combatTrackerRollInitiativeNonPlayer' setting
     * @param {Combat} combat - The combat instance
     */
    static async _rollInitiativeForNonPlayers(combat) {
        if (!game.user.isGM || !combat) return;
        
        // Get all combatants with null initiative that are not player-controlled
        const nonPlayerCombatants = combat.turns?.filter(c => 
            c.initiative === null && 
            c.actor && 
            !c.actor.hasPlayerOwner
        );
        
        if (!nonPlayerCombatants || nonPlayerCombatants.length === 0) {
            postConsoleAndNotification("Combat Tracker: No non-player combatants found that need initiative", "", false, true, false);
            return;
        }
        
        postConsoleAndNotification("Combat Tracker: Rolling initiative for " + nonPlayerCombatants.length + " non-player combatants", "", false, true, false);
        
        // Roll initiative for each non-player combatant
        const ids = nonPlayerCombatants.map(c => c.id);
        await combat.rollInitiative(ids);
        
        postConsoleAndNotification("Combat Tracker: Finished rolling initiative for non-player combatants", "", false, true, false);
    }
    
    /**
     * Roll initiative for player-owned combatants
     * This is the core method that safely handles initiative rolling for players
     * Handles the 'combatTrackerRollInitiativePlayer' setting
     * @param {Combat} combat - The combat instance
     */
    static async _rollInitiativeForPlayerCharacters(combat) {
        // Return early if there's no combat
        if (!combat) return;
        
        // Skip for GMs - they don't need this automation
        if (game.user.isGM) return;
        
        // Check if the setting is enabled for this user
        if (!game.settings.get(MODULE_ID, 'combatTrackerRollInitiativePlayer')) {
            postConsoleAndNotification("Combat Tracker: Auto-roll for players is disabled", "", false, true, false);
            return;
        }
        
        postConsoleAndNotification("Combat Tracker: Checking for player characters that need initiative", "", false, true, false);
        
        // Flag to track if we found any combatants needing initiative
        let foundCombatants = false;
        
        // Process each combatant individually instead of in batch
        for (const combatant of combat.turns) {
            try {
                // Only process if:
                // 1. The combatant has an actor
                // 2. The actor is player-owned
                // 3. The current user owns the actor
                // 4. The combatant has null initiative
                if (combatant.actor && 
                    combatant.actor.hasPlayerOwner && 
                    combatant.actor.isOwner && 
                    combatant.initiative === null) {
                    
                    // Roll initiative for this specific combatant
                    postConsoleAndNotification(`Combat Tracker: Rolling initiative for ${combatant.name}`, "", false, true, false);
                    
                    // Use the combatant's own rollInitiative method (this is permission-safe)
                    await combatant.rollInitiative();
                    
                    // Mark that we found at least one combatant
                    foundCombatants = true;
                }
            } catch (error) {
                postConsoleAndNotification(`Combat Tracker: Error rolling initiative for ${combatant?.name}`, error, false, true, false);
            }
        }
        
        // Provide feedback based on results
        if (!foundCombatants) {
            postConsoleAndNotification("Combat Tracker: No player-owned combatants found needing initiative", "", false, true, false);
        } else {
            postConsoleAndNotification("Combat Tracker: Finished rolling initiative for player-owned combatants", "", false, true, false);
        }
    }
}

export { CombatTracker }; 