// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound } from './global.js';

/**
 * CombatTracker - Handles combat management functionality for player characters
 * This class focuses specifically on initiative management for player characters,
 * ensuring permissions are handled correctly while allowing players to automate
 * their initiative rolls based on client settings.
 */
class CombatTracker {
    static ID = 'combat-tracker';
    
    /**
     * Initialize the Combat Tracker functionality
     * Sets up hooks for combat events
     */
    static initialize() {
        Hooks.once('ready', () => {
            try {
                postConsoleAndNotification("Initializing Combat Tracker", "", false, false, false);
                
                // Hook into combat round changes
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
                
                // Hook into combat start
                Hooks.on('combatStart', (combat) => {
                    // When combat starts, check if we should roll for player characters
                    setTimeout(() => {
                        this._rollInitiativeForPlayerCharacters(combat);
                    }, 500);
                });
                
            } catch (error) {
                console.error(`${MODULE_TITLE} | Could not initialize Combat Tracker:`, error);
            }
        });
    }
    
    /**
     * Roll initiative for player-owned combatants
     * This is the core method that safely handles initiative rolling for players
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