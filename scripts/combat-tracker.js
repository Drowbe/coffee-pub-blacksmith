// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, playSound } from './api-core.js';
import { HookManager } from './manager-hooks.js';

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
    
    // Track Roll Remaining button and handler for cleanup
    static _rollRemainingButton = null;
    static _rollRemainingClickHandler = null;
    
    // Track pending setTimeout calls for cleanup
    static _pendingTimeouts = new Set();
    
    /**
     * Initialize the Combat Tracker functionality
     * Sets up hooks for combat events
     */
    static initialize() {
        // Handle auto-open on client load if combat is already active (outside ready hook)
        Hooks.once('ready', () => {
            // Check if the setting exists before accessing it
            if (game.settings.settings.has(`${MODULE.ID}.combatTrackerOpen`) && game.settings.get(MODULE.ID, 'combatTrackerOpen')) {

                const combat = game.combat;

                if (combat && combat.combatants.size > 0) {
                    // Small delay to ensure UI is fully initialized
                    this._trackedSetTimeout(() => {
                        CombatTracker.openCombatTracker();
                    }, 500);
                } else {
                }
            } else {
            }
        });

        Hooks.once('ready', () => {
            try {
                
                // Reset last processed round
                this._lastProcessedRound = 0;
                
                // Register cleanup hook for module unload
                HookManager.registerHook({
                    name: 'unloadModule',
                    description: 'Combat Tracker: Cleanup on module unload',
                    context: 'combat-tracker-cleanup',
                    priority: 3,
                    callback: (moduleId) => {
                        // --- BEGIN - HOOKMANAGER CALLBACK ---
                        if (moduleId === MODULE.ID) {
                            this._removeRollRemainingButton();
                            this._clearAllTimeouts();
                        }
                        // --- END - HOOKMANAGER CALLBACK ---
                    }
                });
                
                // Hook for detecting when all initiatives have been rolled
                const updateCombatantHookId = HookManager.registerHook({
					name: 'updateCombatant',
					description: 'Combat Tracker: Monitor combatant initiative updates',
					context: 'combat-tracker-combatant-updates',
					priority: 3,
					callback: (combatant, data, options, userId) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						// Only process if initiative was changed and we're the GM
						if (!game.user.isGM || !('initiative' in data)) return;
						
						// Skip if combat doesn't exist (combat might have been deleted)
						if (!combatant.combat || !game.combats.has(combatant.combat.id)) return;
						
						// Reset the flag when any initiative is set to null
						if (data.initiative === null) {
							this._hasSetFirstCombatant = false;
						}
						
						this._checkAllInitiativesRolled(combatant.combat);
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
                // Reset first combatant flag when a new combat is created and handle auto-open
                const createCombatHookId = HookManager.registerHook({
					name: 'createCombat',
					description: 'Combat Tracker: Handle new combat creation and auto-open',
					context: 'combat-tracker-combat-creation',
					priority: 3,
					callback: async (combat) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						this._hasSetFirstCombatant = false;
						
						// Auto-open combat tracker for all users when setting is enabled
						if (game.settings.settings.has(`${MODULE.ID}.combatTrackerOpen`) && game.settings.get(MODULE.ID, 'combatTrackerOpen')) {
							// Small delay to ensure combat is fully initialized
							this._trackedSetTimeout(() => {
								CombatTracker.openCombatTracker();
							}, 100);
						}
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
                // Reset first combatant flag when combat is deleted or ended
                const deleteCombatHookId = HookManager.registerHook({
					name: 'deleteCombat',
					description: 'Combat Tracker: Handle combat deletion and cleanup',
					context: 'combat-tracker-combat-deletion',
					priority: 3,
					callback: async () => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						this._hasSetFirstCombatant = false;
						
						// No encounter / ended — close any tracker UI
						// Add a small delay to ensure combat deletion is fully processed
						this._trackedSetTimeout(async () => {
							await CombatTracker.closeCombatTracker();
						}, 200);

						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
                const endCombatHookId = HookManager.registerHook({
					name: 'endCombat',
					description: 'Combat Tracker: Handle combat end and cleanup',
					context: 'combat-tracker-combat-end',
					priority: 3,
					callback: async () => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						this._hasSetFirstCombatant = false;
						
						// Close the combat tracker when combat ends
						await CombatTracker.closeCombatTracker();
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
                // Check when a combat starts
                const combatStartHookId = HookManager.registerHook({
					name: 'combatStart',
					description: 'Combat Tracker: Handle combat start and initiative checking',
					context: 'combat-tracker-combat-start',
					priority: 3,
					callback: (combat) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						// Wait a small delay to ensure all combatants are fully initialized
						this._trackedSetTimeout(() => this._checkAllInitiativesRolled(combat), 100);
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
                // Check when combat round changes
                const roundChangeHookId = HookManager.registerHook({
                    name: 'updateCombat',
                    description: 'Combat Tracker: Handle round changes and initiative checking',
                    context: 'combat-tracker-round-change',
                    priority: 2, // High priority - core combat functionality
                    callback: (combat, changed) => {
                        // Skip if combat doesn't exist (combat might have been deleted)
                        if (!combat || !game.combats.has(combat.id)) return;
                        
                        // If the round changes, reset the flag and check initiatives
                        if ('round' in changed && combat.round > 0) {
                            // Wait a small delay to ensure all combat state is updated
                            this._trackedSetTimeout(() => this._checkAllInitiativesRolled(combat), 100);
                            
                            // Only for GM: Clear initiative and roll for NPCs if enabled
                            if (game.user.isGM) {
                                this._handleRoundChange(combat);
                            }
                        }
                    }
                });
                
                // Log hook registration
                postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "combat-tracker-round-change", true, false);
                
                // Handle player initiative rolling
                const playerInitiativeHookId = HookManager.registerHook({
                    name: 'updateCombat',
                    description: 'Combat Tracker: Handle player initiative rolling on round changes',
                    context: 'combat-tracker-player-initiative',
                    priority: 2, // High priority - core combat functionality
                    callback: (combat, changed, options, userId) => {
                        // Skip if combat doesn't exist (combat might have been deleted)
                        if (!combat || !game.combats.has(combat.id)) return;
                        
                        // Only process round changes (when the combat updates with a new round)
                        if (!("round" in changed)) return;
                        
                        // Skip if this is the first round (initial creation)
                        if (combat.round <= 1) return;
                        
                        // Check the initiative clearing setting - only proceed if initiative is being cleared
                        if (!game.settings.get(MODULE.ID, 'combatTrackerClearInitiative')) return;
                        
                        // Add a slight delay to ensure the GM has time to clear initiatives first
                        this._trackedSetTimeout(() => {
                            // Now roll initiative for player-owned characters
                            this._rollInitiativeForPlayerCharacters(combat);
                        }, 1000);
                    }
                });
                
                // Log hook registration
                postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat", "combat-tracker-player-initiative", true, false);
                
                // Handle automatic token selection on turn change
                const autoSelectTokenHookId = HookManager.registerHook({
                    name: 'updateCombat',
                    description: 'Combat Tracker: Auto-select token when turn changes',
                    context: 'combat-tracker-auto-select-token',
                    priority: 3,
                    callback: (combat, changed, options, userId) => {
                        // --- BEGIN - HOOKMANAGER CALLBACK ---
                        // Skip if combat doesn't exist (combat might have been deleted)
                        if (!combat || !game.combats.has(combat.id)) return;
                        
                        // Only process if setting is enabled
                        if (!game.settings.get(MODULE.ID, 'combatTrackerAutoSelectToken')) return;
                        
                        // Only process turn changes
                        if (!('turn' in changed)) return;
                        
                        // Only process if combat is started
                        if (!combat?.started) return;
                        
                        // Get current combatant
                        const currentCombatant = combat.combatant;
                        if (!currentCombatant || !currentCombatant.token) return;
                        
                        // Get the token on the canvas
                        const token = canvas.tokens.get(currentCombatant.token.id);
                        if (!token) return;
                        
                        // Check if user has permission to control this token
                        // For GM: can control any token
                        // For players: can only control tokens they own
                        const canControl = game.user.isGM || token.actor?.hasPlayerOwner;
                        if (!canControl) return;
                        
                        // Select the token
                        token.control({ releaseOthers: true });
                        
                        postConsoleAndNotification(MODULE.NAME, `Auto-selected token for ${currentCombatant.name}`, "", true, false);
                        // --- END - HOOKMANAGER CALLBACK ---
                    }
                });
                
                // Log hook registration
                postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateCombat (auto-select token)", "combat-tracker-auto-select-token", true, false);
                
                // Hook into combat start for player initiative
                const combatStartPlayerInitiativeHookId = HookManager.registerHook({
					name: 'combatStart',
					description: 'Combat Tracker: Handle player initiative rolling on combat start',
					context: 'combat-tracker-player-initiative-start',
					priority: 3,
					callback: (combat) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						// When combat starts, check if we should roll for player characters
						this._trackedSetTimeout(() => {
							this._rollInitiativeForPlayerCharacters(combat);
						}, 500);
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
                // Handle player auto-roll when their combatants are created
                const createCombatantHookId = HookManager.registerHook({
					name: 'createCombatant',
					description: 'Combat Tracker: Handle new combatant creation and initiative management',
					context: 'combat-tracker-combatant-creation',
					priority: 3,
					callback: async (combatant, options, userId) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						// Handle player auto-roll
						if (!game.user.isGM) {
							// Only process if:
							// 1. The combatant has an actor
							// 2. The actor is player-owned
							// 3. The current user owns the actor
							// 4. The combatant has null initiative
							// 5. Auto-roll is enabled for this user
							// Check if combatant is actually dead based on D&D5e rules
							let isActuallyDead = false;
							if (combatant.actor) {
								if (combatant.actor.type === "character") {
									// For PCs: Only dead if marked as defeated (failed 3 death saves)
									isActuallyDead = combatant.isDefeated || false;
								} else {
									// For NPCs/Monsters: Dead if HP <= 0
									const currentHP = combatant.actor.system?.attributes?.hp?.value || 0;
									isActuallyDead = currentHP <= 0;
								}
							}

							if (combatant.actor && 
								combatant.actor.hasPlayerOwner && 
								combatant.actor.isOwner && 
								combatant.initiative === null &&
								!isActuallyDead &&
								game.settings.get(MODULE.ID, 'combatTrackerRollInitiativePlayer')) {
								
								await combatant.rollInitiative();
							}
							return;
						}

						// Handle GM auto-roll and initiative modes for NPCs
						// Get NPC initiative setting
						const initiativeMode = game.settings.get(MODULE.ID, 'combatTrackerAddInitiative');
						
						// Check if we should auto-roll initiative for non-player combatants when added to tracker
						const shouldAutoRoll = game.settings.get(MODULE.ID, 'combatTrackerRollInitiativeNonPlayer');
						
						// Skip player-controlled combatants
						const actor = combatant.actor;
						if (!actor || actor.hasPlayerOwner) return;
						
						const combat = combatant.combat;
						
						// CASE 1: Combat hasn't started yet - auto-roll for NPCs/monsters when setting is enabled
						if (shouldAutoRoll && (!combat?.started || combat.round === 0)) {
							// Don't roll if initiative is already set
							if (combatant.initiative === null) {
								await combatant.rollInitiative();
							}
							return;
						}
						
						// CASE 2: Combat is in progress - use the combatTrackerAddInitiative setting
						// Skip processing if the setting is 'none' or combat isn't started
						if (initiativeMode === 'none' || !combat?.started) return;
						
						
						// Process based on setting
						switch (initiativeMode) {
							case 'auto':
								// Roll initiative automatically
								await combatant.rollInitiative();
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
								} else {
									// If there's no active combat or turn, just roll
									await combatant.rollInitiative();
								}
								break;
							
							case 'last':
								// Find the lowest initiative in combat
								if (combat.turns && combat.turns.length > 0) {
									const validTurns = combat.turns.filter(t => t.id !== combatant.id && t.initiative !== null);
									if (validTurns.length > 0) {
										const lowestInit = Math.min(...validTurns.map(t => t.initiative));
										await combatant.update({initiative: lowestInit - 1});
									} else {
										// If no other combatants, just roll
										await combatant.rollInitiative();
									}
								} else {
									// If there's no other combatants, just roll
									await combatant.rollInitiative();
								}
								break;
						}
						// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                

                                
                // Add Roll Remaining button to combat tracker
                // Use higher priority (5) to ensure it runs after planning timer (priority 3)
                const renderCombatTrackerButtonHookId = HookManager.registerHook({
					name: 'renderCombatTracker',
					description: 'Combat Tracker: Add Roll Remaining button to combat tracker',
					context: 'combat-tracker-button-add',
					priority: 5,
					callback: (app, html) => {
						// --- BEGIN - HOOKMANAGER CALLBACK ---
						// Only add for GM
						if (!game.user.isGM) return;

						// Only add if there's an active combat
						if (!game.combat) return;

						// v13: Use app.element (the actual rendered element) instead of html
						// html might be a temporary element that gets replaced
						// Insert immediately - no delay needed since we check for existing buttons
							// v13: Detect and convert jQuery to native DOM if needed
							let nativeHtml = html;
							if (html && (html.jquery || typeof html.find === 'function')) {
								// jQuery object - get the native element
								nativeHtml = html[0] || html.get?.(0) || html;
							}
							
							// Get app.element (the actual rendered application element)
							let appElement = app?.element;
							if (appElement && (appElement.jquery || typeof appElement.find === 'function')) {
								appElement = appElement[0] || appElement.get?.(0) || appElement;
							}
							
							// Build search roots: prefer app.element, fallback to html, also check ui.combat.element
							const searchRoots = [];
							if (appElement) searchRoots.push(appElement);
							if (nativeHtml && nativeHtml !== appElement) searchRoots.push(nativeHtml);
							if (ui.combat?.element) {
								let combatElement = ui.combat.element;
								if (combatElement && (combatElement.jquery || typeof combatElement.find === 'function')) {
									combatElement = combatElement[0] || combatElement.get?.(0) || combatElement;
								}
								if (combatElement && combatElement !== appElement && combatElement !== nativeHtml) {
									searchRoots.push(combatElement);
								}
							}
							
							if (searchRoots.length === 0) {
								return;
							}
							
							// Simple approach: remove any existing buttons in the current render's DOM
							// This ensures we don't have duplicates
							for (const root of searchRoots) {
								const existingButtons = root.querySelectorAll('.combat-control[data-control="rollRemaining"], .combat-control[data-action="rollRemaining"]');
								existingButtons.forEach(btn => {
									// Remove event listener if it's our tracked button
									if (btn === this._rollRemainingButton && this._rollRemainingClickHandler) {
										btn.removeEventListener('click', this._rollRemainingClickHandler);
									}
									btn.remove();
								});
							}
							
							// Clear tracked references if button was removed
							if (this._rollRemainingButton && !this._rollRemainingButton.parentElement) {
								this._rollRemainingButton = null;
								this._rollRemainingClickHandler = null;
							}

							// Find the Roll NPCs button (v13: html is native DOM element)
							// v13: Changed from data-control to data-action
							// Try multiple selectors to find the button - must match the exact structure
							let rollNPCButton = null;
							let foundRoot = null;
							for (const root of searchRoots) {
								rollNPCButton = root.querySelector('button.inline-control.combat-control[data-action="rollNPC"]') ||
								                root.querySelector('button.combat-control[data-action="rollNPC"]') ||
								                root.querySelector('.combat-control[data-action="rollNPC"]') ||
								                root.querySelector('button[data-action="rollNPC"]') ||
								                root.querySelector('.combat-control[data-control="rollNPC"]') ||
								                root.querySelector('button.combat-control[data-control="rollNPC"]');
								if (rollNPCButton) {
									foundRoot = root;
									break;
								}
							}
							
							if (!rollNPCButton) {
								// Don't return early - try to find the container and insert anyway
								// Try to find the left controls container and append there
								let leftControls = null;
								for (const root of searchRoots) {
									leftControls = root.querySelector('.control-buttons.left');
									if (leftControls) break;
								}
								if (leftControls) {
									// Create and insert button
									const rollRemainingButton = document.createElement('button');
									rollRemainingButton.type = 'button';
									rollRemainingButton.className = 'inline-control combat-control icon fa-solid fa-users-medical';
									rollRemainingButton.setAttribute('aria-label', 'Roll Remaining');
									rollRemainingButton.setAttribute('data-tooltip', 'Roll Remaining');
									rollRemainingButton.setAttribute('data-control', 'rollRemaining');
									rollRemainingButton.setAttribute('data-action', 'rollRemaining');
									
									leftControls.appendChild(rollRemainingButton);
																	
									// Add click handler
									const clickHandler = async (event) => {
										event.preventDefault();
										await this._rollRemainingInitiatives();
									};
									this._rollRemainingButton = rollRemainingButton;
									this._rollRemainingClickHandler = clickHandler;
									rollRemainingButton.addEventListener('click', clickHandler);
									return;
								}
								return;
							}

							// Old button already removed above

							// Create and insert our new button (v13: native DOM)
							// v13: Use button element to match Foundry's structure
							const rollRemainingButton = document.createElement('button');
							rollRemainingButton.type = 'button';
							rollRemainingButton.className = 'inline-control combat-control icon fa-solid fa-users-medical';
							rollRemainingButton.setAttribute('aria-label', 'Roll Remaining');
							rollRemainingButton.setAttribute('data-tooltip', 'Roll Remaining');
							rollRemainingButton.setAttribute('data-control', 'rollRemaining');
							rollRemainingButton.setAttribute('data-action', 'rollRemaining');

							// Insert after the Roll NPCs button (v13: native DOM)
							// Use the same root where we found the button to ensure we're inserting into the correct DOM tree
							// IMPORTANT: Insert into the actual rendered element, not a temporary one
							if (rollNPCButton.parentElement) {
								rollNPCButton.insertAdjacentElement('afterend', rollRemainingButton);
								
							} else {
								postConsoleAndNotification(MODULE.NAME, `Combat Tracker: ERROR - Roll NPC button has no parent!`, "", true, false);
							}
							
							// Create click handler function
							const clickHandler = async (event) => {
								event.preventDefault();
								event.stopPropagation();
								await this._rollRemainingInitiatives();
							};

							// Store button and handler references for cleanup
							this._rollRemainingButton = rollRemainingButton;
							this._rollRemainingClickHandler = clickHandler;

							// Add click handler (v13: native DOM)
							rollRemainingButton.addEventListener('click', clickHandler);
							// --- END - HOOKMANAGER CALLBACK ---
					}
				});
                
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Could not initialize Combat Tracker`, error, false, false);
            }
        });
    }
    
    /**
     * Handle round changes in combat - clears initiatives if enabled
     * @param {Combat} combat - The combat instance
     */
    static async _handleRoundChange(combat) {
        if (!game.user.isGM) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!combat || !game.combats.has(combat.id)) return;
        
        // Check if we should clear initiative when round changes
        // ONLY clear initiative when changing to round 2 or higher
        if (game.settings.get(MODULE.ID, 'combatTrackerClearInitiative') && combat.round > 1) {
            
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
                // Double-check combat still exists before updating
                if (!combat || !game.combats.has(combat.id)) return;
                
                await combat.updateEmbeddedDocuments("Combatant", updates);
                
                // After clearing initiative, auto-roll for non-player combatants if enabled
                if (game.settings.get(MODULE.ID, 'combatTrackerRollInitiativeNonPlayer')) {
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
        if (!combat || !game.user.isGM) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!game.combats.has(combat.id)) return;
        
        // Don't proceed if the setting is not enabled
        if (!game.settings.get(MODULE.ID, 'combatTrackerSetFirstTurn')) {
            return;
        }
        
        // Use the turns array to get combatants
        const combatants = combat.turns || [];
        
        // Skip empty combats
        if (combatants.length === 0) {
            return;
        }
        
        // Get combatants that need initiative (not defeated and without initiative)
        const combatantsNeedingInitiative = combatants.filter(c => c.initiative === null && !c.isDefeated);
        
        
        // If no combatants need initiative, all have been rolled
        if (combatantsNeedingInitiative.length === 0) {
            // Only proceed if combat has actually started
            if (!combat.started) {
                return;
            }

            // Don't check if we've already set the first combatant for this round
            if (this._hasSetFirstCombatant) {
                return;
            }

            
            try {
                // Wait a moment for the combat tracker to finish sorting
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Double-check combat still exists after the delay
                if (!combat || !game.combats.has(combat.id)) return;
                
                // Set turn to 0 after the sort (first combatant at top of list)
                await combat.update({turn: 0}, {diff: false});
                
                // Only set the flag after successfully setting the turn
                this._hasSetFirstCombatant = true;
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Error setting first combatant", error, false, false);
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
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!game.combats.has(combat.id)) return;
        
        // Get all combatants with null initiative that are not player-controlled
        const nonPlayerCombatants = combat.turns?.filter(c => 
            c.initiative === null && 
            c.actor && 
            !c.actor.hasPlayerOwner
        );
        
        if (!nonPlayerCombatants || nonPlayerCombatants.length === 0) {
            return;
        }
        
        
        // Roll initiative for each non-player combatant
        const ids = nonPlayerCombatants.map(c => c.id);
        await combat.rollInitiative(ids);
        
    }
    
    /**
     * Roll initiative for player-owned combatants
     * For players: Rolls initiative for their own characters
     * For GMs: Rolls initiative for player characters where owners aren't logged in
     * Handles the 'combatTrackerRollInitiativePlayer' setting
     * @param {Combat} combat - The combat instance
     */
    static async _rollInitiativeForPlayerCharacters(combat) {
        // Return early if there's no combat
        if (!combat) return;
        
        // Skip if combat doesn't exist (combat might have been deleted)
        if (!game.combats.has(combat.id)) return;
                
        // Check if the setting is enabled for this user
        if (!game.settings.get(MODULE.ID, 'combatTrackerRollInitiativePlayer')) {
            return;
        }
        
        
        // Flag to track if we found any combatants needing initiative
        let foundCombatants = false;
        
        
        for (const combatant of combat.turns) {
            try {
                // Only process if:
                // 1. The combatant has an actor
                // 2. The actor is player-owned
                // 3. The current user owns the actor
                // 4. The combatant has null initiative
                // Check if combatant is actually dead based on D&D5e rules
                let isActuallyDead = false;
                if (combatant.actor) {
                    if (combatant.actor.type === "character") {
                        // For PCs: Only dead if marked as defeated (failed 3 death saves)
                        isActuallyDead = combatant.isDefeated || false;
                    } else {
                        // For NPCs/Monsters: Dead if HP <= 0
                        const currentHP = combatant.actor.system?.attributes?.hp?.value || 0;
                        isActuallyDead = currentHP <= 0;
                    }
                }

                // Determine if we should roll initiative for this combatant
                let shouldRollInitiative = false;
                
                if (game.user.isGM) {
                    // For GMs: Roll for player characters where owners aren't logged in
                    // Check if any owner of this actor is currently active/logged in
                    const hasActiveOwner = combatant.actor && combatant.actor.ownership && 
                        Object.keys(combatant.actor.ownership).some(userId => {
                            const user = game.users.get(userId);
                            return user && user.active && combatant.actor.ownership[userId] === 3; // OWNER level
                        });
                                        
                    shouldRollInitiative = combatant.actor && 
                        combatant.actor.hasPlayerOwner && 
                        combatant.actor.type === "character" &&
                        combatant.initiative === null &&
                        !isActuallyDead &&
                        !hasActiveOwner; // No active owner is logged in
                } else {
                    // For players: Roll for their own characters
                    shouldRollInitiative = combatant.actor && 
                        combatant.actor.hasPlayerOwner && 
                        combatant.actor.isOwner && 
                        combatant.initiative === null &&
                        !isActuallyDead;
                }

                if (shouldRollInitiative) {
                    // Roll initiative for this specific combatant
                    postConsoleAndNotification(MODULE.NAME, `Combat Tracker: Rolling initiative for ${combatant.name} (${game.user.isGM ? 'GM rolling for offline player' : 'Player rolling for own character'})`, "", true, false);
                    
                    // Use the combatant's own rollInitiative method (this is permission-safe)
                    await combatant.rollInitiative();
                    
                    // Mark that we found at least one combatant
                    foundCombatants = true;
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Combat Tracker: Error rolling initiative for ${combatant?.name}`, error, true, false);
            }
        }
        
        // Provide feedback based on results
        if (!foundCombatants) {
        } else {
        }
    }

    /**
     * Remove Roll Remaining button and its click handler
     * Called before adding new button to prevent duplicates
     */
    static _removeRollRemainingButton() {
        // Remove click handler if it exists (v13: native DOM)
        if (this._rollRemainingButton && this._rollRemainingClickHandler) {
            this._rollRemainingButton.removeEventListener('click', this._rollRemainingClickHandler);
        }
        
        // Remove button from DOM if it exists
        if (this._rollRemainingButton) {
            this._rollRemainingButton.remove();
            this._rollRemainingButton = null;
        }
        
        // Clear handler reference
        this._rollRemainingClickHandler = null;
    }
    
    /**
     * Create a tracked setTimeout that can be cleared on cleanup
     * @param {Function} callback - Function to call after delay
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Timeout ID
     */
    static _trackedSetTimeout(callback, delay) {
        const timeoutId = setTimeout(() => {
            // Remove from tracking when timeout completes
            this._pendingTimeouts.delete(timeoutId);
            callback();
        }, delay);
        this._pendingTimeouts.add(timeoutId);
        return timeoutId;
    }
    
    /**
     * Clear all pending setTimeout calls
     */
    static _clearAllTimeouts() {
        const count = this._pendingTimeouts.size;
        for (const timeoutId of this._pendingTimeouts) {
            clearTimeout(timeoutId);
        }
        this._pendingTimeouts.clear();
        if (count > 0) {
            postConsoleAndNotification(MODULE.NAME, `Cleared ${count} pending timeouts`, "", true, false);
        }
    }

    /**
     * Roll initiative for any combatants that haven't rolled initiative
     */
    static async _rollRemainingInitiatives() {
        const combat = game.combat;
        if (!combat) return;

        // Find all combatants that haven't rolled initiative
        const remainingCombatants = combat.combatants.filter(c => c.initiative === null);
        
        if (remainingCombatants.length === 0) {
            ui.notifications.info("All combatants have already rolled initiative!");
            return;
        }

        postConsoleAndNotification(MODULE.NAME, `Rolling initiative for ${remainingCombatants.length} remaining combatants`, "", true, false);

        // Roll initiative for each remaining combatant
        for (const combatant of remainingCombatants) {
            await combatant.rollInitiative();
            postConsoleAndNotification(MODULE.NAME, `Rolled initiative for ${combatant.name}`, "", true, false);
        }
    }

    /**
     * Check if the FoundryVTT Combat Tracker window is open
     * @returns {boolean} True if combat tracker is open
     */
    static isCombatTrackerOpen() {
        try {
            const tracker = ui.combat;
            
            // Check if combat tracker exists and is rendered
            if (!tracker || !tracker.rendered) {
                return false;
            }
            
            // Check for popout windows
            const popoutRendered = tracker._popOut?.rendered || false;
            const altPopoutRendered = tracker._popout?.rendered || false;
            
            // Check for any combat tracker windows in ui.windows
            let windowRendered = false;
            for (const app of Object.values(ui.windows)) {
                const el = app?.element?.[0] ?? app?.element;
                if (el?.querySelector?.('[data-tab="combat"], .tab.combat, .combat-tracker, [aria-label="Combat Tracker"]')) {
                    windowRendered = true;
                    break;
                }
            }
            
            const isOpen = popoutRendered || altPopoutRendered || windowRendered;
            
            return isOpen;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error checking combat tracker state", error, false, false);
            return false;
        }
    }

    /**
     * Open the FoundryVTT Combat Tracker window
     */
    static openCombatTracker() {
        try {
            
            // Try to open combat tracker without switching sidebar tabs
            const tabApp = ui["combat"];
            if (tabApp) {
                try {
                    if (tabApp.renderPopout) {
                        tabApp.renderPopout(tabApp);
                    } else if (tabApp.render) {
                        tabApp.render();
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Tracker: Error with popout methods", error, false, false);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error opening combat tracker", error, false, false);
        }
    }

    /**
     * Close the FoundryVTT Combat Tracker window
     */
    static async closeCombatTracker() {
        try {
            
            // Add a small delay to ensure any pending hover events are processed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Close any popout windows without switching sidebar tabs
            if (ui.combat?._popOut?.rendered) {
                await ui.combat._popOut.close({force: true});
            }
            
            // Close any alternative popout windows (different spelling)
            if (ui.combat?._popout?.rendered) {
                await ui.combat._popout.close({force: true});
            }
            
            // Also check for popout window by ID (v13: direct DOM check)
            // The popout element itself is the window element
            const combatPopout = document.querySelector('#combat-popout');
            if (combatPopout) {
                let popoutClosed = false;
                
                // Find the window application that owns this element
                for (const app of Object.values(ui.windows)) {
                    const el = app?.element?.[0] ?? app?.element;
                    // Check if this app's element is the popout or contains it
                    if (el && (el === combatPopout || el.id === 'combat-popout' || el.contains(combatPopout))) {
                        await app.close({force: true});
                        popoutClosed = true;
                        break;
                    }
                }
                
                // Fallback: If we found the popout but couldn't find the app, try clicking the close button
                if (!popoutClosed && combatPopout.parentNode) {
                    const closeButton = combatPopout.querySelector('button[data-action="close"]');
                    if (closeButton) {
                        closeButton.click();
                        // Wait a moment for the close to process
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
            
            // Close any other combat tracker windows that might exist
            for (const app of Object.values(ui.windows)) {
                const el = app?.element?.[0] ?? app?.element;
                if (el?.querySelector?.('[data-tab="combat"], .tab.combat, .combat-tracker, [aria-label="Combat Tracker"]')) {
                    await app.close({force: true});
                }
            }
            
            // Only re-render if combat still exists (not when combat has been deleted)
            if (ui.combat && game.combat) {
                ui.combat.render();
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error closing combat tracker", error, false, false);
        }
    }
}

export { CombatTracker }; 
