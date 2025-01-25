// Import MODULE variables
import { MODULE_TITLE, MODULE_ID } from './const.js';
import { getPortraitImage, isPlayerCharacter, playSound } from './global.js';
import { CombatStatsDebug } from './debug.js';
import { PlanningTimer } from './planning-timer.js';
import { CombatTimer } from './combat-timer.js';

// Helper function to get actor portrait
function getActorPortrait(combatant) {
    if (!combatant) return "icons/svg/mystery-man.svg";
    const actor = combatant.actor;
    if (!actor) return "icons/svg/mystery-man.svg";
    return getPortraitImage(actor) || "icons/svg/mystery-man.svg";
}

class CombatStats {
    static DEFAULTS = {
        roundStats: {
            roundStartTime: Date.now(),
            roundStartTimestamp: 0,  // New field to track actual wall-clock start time
            planningStartTime: Date.now(),
            turnStartTime: Date.now(),
            actualRoundStartTime: 0,
            actualPlanningStartTime: 0,
            actualPlanningEndTime: 0,
            firstPlayerStartTime: 0,
            activeRoundTime: 0,
            activePlanningTime: 0,
            lastUnpauseTime: 0,
            hits: [],
            misses: [],
            expiredTurns: [],
            partyStats: {
                hits: 0,
                misses: 0,
                damageDealt: 0,
                damageTaken: 0,
                healingDone: 0,
                turnTimes: [],
                averageTurnTime: 0
            },
            notableMoments: {
                biggestHit: { amount: 0, actor: null },
                mostDamage: { amount: 0 },
                biggestHeal: { amount: 0 },
                longestTurn: { duration: 0 },
                mostHurt: { amount: 0 },
                weakestHit: { amount: 0, actor: null },
                mostHealing: { amount: 0, actor: null },
                quickestTurn: { duration: 0, actor: null }
            }
        },
        combatStats: {
            startTime: Date.now(),
            hits: [],
            misses: [],
            participantStats: {},
            longestTurn: { duration: 0 },
            fastestTurn: { duration: Infinity }
        }
    };

    static initialize() {
        // Only initialize if this is the GM and stats tracking is enabled
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.COMBAT.START, {
            message: 'Initializing Combat Stats',
            settings: {
                trackCombatStats: game.settings.get(MODULE_ID, 'trackCombatStats')
            }
        });

        // Initialize stats objects
        this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        
        // Ensure Maps are properly initialized
        this.currentStats.turnStartTimes = new Map();
        this.currentStats.turnEndTimes = new Map();

        console.log('Blacksmith | Initialize Stats:', {
            currentStats: this.currentStats,
            notableMoments: this.currentStats.notableMoments
        });

        // Register Handlebars helpers
        this.registerHelpers();

        // Register hooks
        this._registerHooks();
    }

    static async _onUpdateCombat(combat, changed, options, userId) {
        // Only process combat updates if this is the GM
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        console.log('Blacksmith | Combat Stats - Combat Update:', {
            changed,
            currentStats: this.currentStats,
            combatStats: this.combatStats
        });

        const currentCombatant = combat.combatant;
        const previousCombatant = combat.turns[combat.previous?.turn] || null;

        // Track round changes - only trigger at the end of a round
        if (changed.round && changed.round > combat.previous.round) {
            console.log('Blacksmith | Combat Stats - Round Change Detected:', {
                from: combat.previous.round,
                to: changed.round,
                currentStats: this.currentStats
            });
            
            // Only call _onRoundEnd when we're actually ending a round (not starting a new one)
            if (combat.previous.round > 0) {
                await this._onRoundEnd();
            }
            this._onRoundStart(combat);
        }

        // Track turn changes
        if (changed.turn !== undefined && changed.turn !== combat.previous.turn) {
            this._onTurnChange(combat, currentCombatant, previousCombatant);
        }
    }

    static _onRoundStart(combat) {
        // Handle stats tracking if enabled
        if (game.user.isGM && game.settings.get(MODULE_ID, 'trackCombatStats')) {
            // Initialize new round stats
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            // Ensure Maps are properly initialized
            this.currentStats.turnStartTimes = new Map();
            this.currentStats.turnEndTimes = new Map();
            this.currentStats.roundStartTime = Date.now();
            this.currentStats.roundStartTimestamp = Date.now();  // Set the wall-clock start time
            this.currentStats.planningStartTime = Date.now();

            // Save the stats to combat flags
            game.combat.setFlag(MODULE_ID, 'stats', this.currentStats);

            CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.COMBAT.ROUND, {
                message: 'Round started',
                round: {
                    number: combat.round,
                    startTime: this.currentStats.roundStartTime,
                    combatants: combat.turns.map(t => ({
                        name: t.name,
                        initiative: t.initiative
                    }))
                }
            });
        }

        // Handle round announcement if enabled (independent of stats tracking)
        if (game.user.isGM && game.settings.get(MODULE_ID, 'announceNewRounds')) {
            this._announceNewRound(combat);
        }
    }

    // New method to handle round announcements
    static async _announceNewRound(combat) {
        try {
            // Use the current round number (no need to subtract 1 since this is announcing the start)
            const roundNumber = combat.round;

            // Prepare template data
            const templateData = {
                roundNumber: roundNumber  // Use the same property name as in _onRoundEnd
            };

            // Render the template
            const content = await renderTemplate('modules/' + MODULE_ID + '/templates/round-announcement.hbs', templateData);

            // Create chat message
            await ChatMessage.create({
                content: content,
                speaker: { alias: "Game Master" }
            });

            // Play sound if configured
            const soundId = game.settings.get(MODULE_ID, 'newRoundSound');
            if (soundId && soundId !== 'none') {
                const volume = game.settings.get(MODULE_ID, 'timerSoundVolume');
                playSound(soundId, volume);
            }
        } catch (error) {
            console.error('Blacksmith | Error announcing new round:', error);
        }
    }

    static _onTurnChange(combat, currentCombatant, previousCombatant) {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        const turnDuration = Date.now() - this.currentStats.turnStartTime;
        
        // Record expired turn if it exceeded the time limit
        if (previousCombatant && turnDuration > game.settings.get(MODULE_ID, 'combatTimerDuration') * 1000) {
            this.currentStats.expiredTurns.push({
                actor: previousCombatant.name,
                round: combat.round,
                duration: turnDuration
            });
        }

        // Update timing stats
        this.currentStats.turnStartTime = Date.now();

        CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.STATS.TURNS, {
            message: 'Turn changed',
            turn: {
                current: currentCombatant?.name,
                previous: previousCombatant?.name,
                round: combat.round,
                duration: turnDuration,
                expired: turnDuration > game.settings.get(MODULE_ID, 'combatTimerDuration') * 1000
            }
        });

        // Add notable moment tracking for turn duration
        if (previousCombatant) {
            this._updateNotableMoments('turn', {
                actorId: previousCombatant.actorId,
                actorName: previousCombatant.name,
                duration: turnDuration
            });
        }

        // Only include player character turns in the average
        if (previousCombatant && this._isPlayerCharacter(previousCombatant)) {
            // Initialize turnTimes as an object if it's still an array
            if (Array.isArray(this.currentStats.partyStats.turnTimes)) {
                this.currentStats.partyStats.turnTimes = {};
            }
            
            // Store duration by combatant ID
            this.currentStats.partyStats.turnTimes[previousCombatant.id] = turnDuration;
            
            // Calculate average from all player character turns
            const turnTimes = Object.values(this.currentStats.partyStats.turnTimes);
            this.currentStats.partyStats.averageTurnTime = 
                turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length;

            console.log('Blacksmith | Average Turn Time Update:', {
                turnDuration,
                allTurnTimes: this.currentStats.partyStats.turnTimes,
                newAverage: this.currentStats.partyStats.averageTurnTime
            });
        }
    }

    static _onCombatEnd(combat, options, userId) {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        const combatDuration = Date.now() - this.combatStats.startTime;
        
        CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.COMBAT.END, {
            message: 'Combat ended',
                combat: {
                duration: combatDuration,
                rounds: combat.round,
                totalHits: this.combatStats.hits.length,
                expiredTurns: this.currentStats.expiredTurns.length,
                participantStats: this.combatStats.participantStats
            }
        });

        // Reset stats
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
    }

    // Method to record when a turn starts
    static recordTurnStart(combatant) {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) {
            console.log('Blacksmith | Timer Debug - Turn Start Skipped:', {
                reason: !game.user.isGM ? 'Not GM' : 'Stats Disabled',
                isGM: game.user.isGM,
                statsEnabled: game.settings.get(MODULE_ID, 'trackCombatStats')
            });
            return;
        }
        
        // We no longer need to track start times since we only use progress bar position
        console.log('Blacksmith | Timer Debug - Turn Start:', {
            combatant: combat?.name,
            id: combat?.id
        });
    }

    // Method to record when a turn ends
    static recordTurnEnd(combatant) {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        
        if (combatant) {
            // Calculate duration based on progress bar position only
            const totalAllowedTime = game.settings.get(MODULE_ID, 'combatTimerDuration');
            const remainingTime = CombatTimer.state?.remaining ?? 0;
            const timeUsed = totalAllowedTime - remainingTime;  // Calculate in seconds
            const duration = timeUsed * 1000;  // Convert to ms after calculation
            const isExpired = timeUsed === totalAllowedTime;  // Check if all time was used
            
            console.log('Blacksmith | Timer Debug - Recording Turn End:', {
                combatant: combatant.name,
                id: combatant.id,
                totalAllowedTime,
                remainingTime,
                timeUsed,
                duration,
                isExpired
            });
            
            // Update turn times for player characters
            if (this._isPlayerCharacter(combatant)) {
                // Initialize turnTimes as an object if it's still an array
                if (Array.isArray(this.currentStats.partyStats.turnTimes)) {
                    this.currentStats.partyStats.turnTimes = {};
                }
                
                // Store duration by combatant ID
                this.currentStats.partyStats.turnTimes[combatant.id] = duration;
                
                // Store the expired state
                if (!this.currentStats.turnStats) {
                    this.currentStats.turnStats = {};
                }
                if (!this.currentStats.turnStats[combatant.id]) {
                    this.currentStats.turnStats[combatant.id] = {};
                }
                this.currentStats.turnStats[combatant.id].expired = isExpired;
                
                // Calculate average from all turn times
                const turnTimes = Object.values(this.currentStats.partyStats.turnTimes);
                this.currentStats.partyStats.averageTurnTime = 
                    turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length;
                
                console.log('Blacksmith | Timer Debug - Updated Turn Stats:', {
                    combatant: combatant.name,
                    duration,
                    isExpired,
                    turnTimes: this.currentStats.partyStats.turnTimes,
                    averageTurnTime: this.currentStats.partyStats.averageTurnTime
                });
            }
        }
    }

    // Method to record timer expiration
    static recordTimerExpired(isPlanning = false) {
        if (!game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        
        if (isPlanning) {
            // Ensure planning time object exists
            if (!this.currentStats.planningTime) {
                this.currentStats.planningTime = {
                    expired: false,
                    endTime: 0
                };
            }
            this.currentStats.planningTime.expired = true;
            this.currentStats.planningTime.endTime = Date.now();
            
            console.log('Blacksmith | Timer Debug - Planning Timer Expired:', {
                planningTime: this.currentStats.planningTime,
                currentStats: this.currentStats
            });
        } else {
            const currentCombatant = game.combat?.combatant;
            if (currentCombatant) {
                // Initialize turn stats if needed
                if (!this.currentStats.turnStats) {
                    this.currentStats.turnStats = {};
                }
                if (!this.currentStats.turnStats[currentCombatant.id]) {
                    this.currentStats.turnStats[currentCombatant.id] = {
                        expired: false,
                        endTime: 0
                    };
                }
                this.currentStats.turnStats[currentCombatant.id].expired = true;
                // Don't set the end time here as the turn might continue
            }
        }
    }

    // Register Handlebars helpers
    static registerHelpers() {
        // Helper to round numbers
        Handlebars.registerHelper('round', function(number) {
            return Math.round(number);
        });

        // Helper to format damage numbers
        Handlebars.registerHelper('formatDamage', function(amount, isHealing = false) {
            if (typeof amount !== 'number') return '0';
            return `${isHealing ? '+' : ''}${amount}`;
        });

        // Helper to format time in a readable way
        Handlebars.registerHelper('formatTime', function(ms, context) {
            console.log('Blacksmith | formatTime Helper Debug:', {
                value: ms,
                type: typeof ms,
                context: this,
                hasPlanning: this.planningDuration !== undefined,
                hasId: this.id !== undefined
            });

            // If no duration provided
            if (ms === undefined || ms === null) return 'SKIPPED';
            
            // Convert to number if it's a string
            ms = Number(ms);
            
            // Handle invalid numbers
            if (isNaN(ms)) return 'SKIPPED';

            // Only apply special handling if this is actually a planning time or turn time
            // Planning times are passed with planningDuration property AND this is the planningDuration field
            if (this.planningDuration !== undefined && this.planningDuration === ms) {
                console.log('Blacksmith | formatTime - Planning Time Branch:', {
                    ms,
                    planningDuration: this.planningDuration,
                    maxTime: game.settings.get(MODULE_ID, 'planningTimerDuration') * 1000
                });
                if (ms === 0) return 'SKIPPED';
                const maxPlanningTime = game.settings.get(MODULE_ID, 'planningTimerDuration') * 1000;
                if (ms >= maxPlanningTime) return 'EXPIRED';
            }
            // Turn times are passed with id property AND this is the turnDuration field
            else if (this.id !== undefined && this.turnDuration === ms) {
                console.log('Blacksmith | formatTime - Turn Time Branch:', {
                    ms,
                    id: this.id,
                    maxTime: game.settings.get(MODULE_ID, 'combatTimerDuration') * 1000
                });
                if (ms === 0) return 'SKIPPED';
                const maxTurnTime = game.settings.get(MODULE_ID, 'combatTimerDuration') * 1000;
                if (ms >= maxTurnTime) return 'EXPIRED';
            }
            
            const seconds = Math.floor(ms / 1000);
            const result = seconds < 60 ? `${seconds}s` : 
                          `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
            
            console.log('Blacksmith | formatTime - Final Result:', {
                ms,
                seconds,
                result
            });
            
            return result;
        });

        // Helper to multiply numbers
        Handlebars.registerHelper('multiply', function(a, b) {
            return a * b;
        });

        // Helper to divide numbers
        Handlebars.registerHelper('divide', function(a, b) {
            return a / b;
        });

        // Helper to add numbers
        Handlebars.registerHelper('add', function(a, b) {
            return a + b;
        });

        // Helper to check equality
        Handlebars.registerHelper('eq', function(a, b) {
            return a === b;
        });

        // Helper for greater than
        Handlebars.registerHelper('gt', function(a, b) {
            return a > b;
        });
    }

    // Helper method to format time
    static _formatTime(timeValue) {
        if (typeof timeValue !== 'number' || isNaN(timeValue)) return '0s';
        
        // Convert milliseconds to seconds if needed
        const seconds = timeValue > 1000 ? Math.round(timeValue / 1000) : Math.round(timeValue);
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
        timeString += `${remainingSeconds}s`;
        
        return timeString;
    }

    // Helper method to format damage
    static _formatDamage(amount, isHeal = false) {
        if (typeof amount !== 'number' || isNaN(amount)) return '0';
        amount = Math.round(amount); // Remove decimals
        return isHeal ? `${amount} HP` : `${amount}`;
    }

    // Helper method to get actor from UUID (v12/v13 compatible)
    static async _getActorFromUuid(uuid) {
        try {
            // Try v13 method first
            const actor = await fromUuid(uuid).catch(() => null);
            if (actor) return actor;

            // Fallback for v12
            const actorId = uuid.split('.')[1];
            return game.actors.get(actorId);
        } catch (error) {
            console.error('Blacksmith | Combat Stats - Error getting actor from UUID:', error);
            return null;
        }
    }

    // Helper method to calculate MVP score
    static async _calculateMVPScore(stats) {
        // Skip if not a player character
        const actor = await this._getActorFromUuid(stats.uuid);
        if (!actor || (!actor.hasPlayerOwner && actor.type !== 'character')) return -1;

        let score = 0;
        
        // Add points for hits
        score += (stats.combat?.attacks?.hits || 0) * 2;
        
        // Add points for critical hits
        score += (stats.combat?.attacks?.crits || 0) * 3;
        
        // Add points for damage
        score += (stats.damage?.dealt || 0) * 0.1;
        
        // Add points for healing
        score += (stats.healing?.given || 0) * 0.2;
        
        // Subtract points for fumbles
        score -= (stats.combat?.attacks?.fumbles || 0) * 2;

        return score;
    }

    // Helper method to calculate MVP
    static async _calculateMVP(playerCharacters) {
        if (!playerCharacters?.length) {
            this._debugLog('MVP Calculation - No Players', { message: 'No player characters for MVP calculation' });
            return null;
        }

        this._debugLog('MVP Calculation - Starting', { playerCharacters });

        // Process each character asynchronously
        const mvpCandidates = await Promise.all(playerCharacters.map(async (detail) => {
            const score = await this._calculateMVPScore(detail);
            
            if (score <= 0) return null;

            // Get actor from UUID for portrait
            const actor = await this._getActorFromUuid(detail.uuid);
            const portraitImg = actor ? getPortraitImage(actor) : detail.img || "icons/svg/mystery-man.svg";

            // Format stats to match template structure
            const formattedStats = {
                damage: detail.damage,
                healing: detail.healing,
                combat: {
                    attacks: {
                        ...detail.combat.attacks,
                        criticals: detail.combat.attacks.crits  // Rename crits to criticals
                    },
                    rolls: detail.combat.rolls
                },
                efficiency: detail.efficiency
            };

            this._debugLog('MVP Candidate Processing', {
                name: detail.name,
                score,
                uuid: detail.uuid,
                portraitImg,
                stats: formattedStats
            });

            // Generate MVP description with all stats
            const descriptions = [];
            
            // Combat Performance
            if (detail.combat?.attacks) {
                const { attempts, hits } = detail.combat.attacks;
                if (attempts > 0) {
                    const accuracy = ((hits / attempts) * 100).toFixed(1);
                    descriptions.push(`${hits}/${attempts} hits (${accuracy}% accuracy)`);
                }
            }

            // Damage
            if (detail.damage?.dealt > 0) {
                descriptions.push(`damage, highest roll: ${detail.combat.rolls.highest}`);
            }

            return {
                name: detail.name,
                score,
                uuid: detail.uuid,
                img: portraitImg,
                description: descriptions.join(', '),
                stats: formattedStats  // Nest all stats under 'stats' property
            };
        }));

        // Filter out null entries and find the highest score
        const validCandidates = mvpCandidates.filter(c => c !== null);
        const mvp = validCandidates.reduce((max, current) => 
            (!max || current.score > max.score) ? current : max, null);

        this._debugLog('MVP Calculation - Result', { mvp });
        return mvp;
    }

    // Helper method to check if an actor is a player character
    static _isPlayerCharacter(input) {
        // If input is a string (name), use the existing check
        if (typeof input === 'string') {
            return isPlayerCharacter(input);
        }
        
        // If input is a combatant object
        if (input?.actor) {
            return input.actor.hasPlayerOwner || input.actor.type === 'character';
        }
        
        // If input is an actor object
        if (input?.hasPlayerOwner !== undefined) {
            return input.hasPlayerOwner || input.type === 'character';
        }

        console.warn('Blacksmith | Timer Debug - Invalid input for _isPlayerCharacter:', input);
        return false;
    }

    // Helper method to generate MVP description
    static _generateMVPDescription(stats) {
        const hits = stats.hits?.length || 0;
        const damageDealt = stats.damage?.dealt || 0;
        const healingGiven = stats.healing?.given || 0;
        const healingReceived = stats.healing?.received || 0;

        let description = '';
        if (hits > 0) description += `Had ${hits} hits `;
        if (damageDealt > 0) {
            if (hits > 0) description += `totaling ${this._formatDamage(damageDealt)} resulting in ${damageDealt} HP total damage `;
            else description += `Dealt ${damageDealt} HP damage `;
        }
        if (healingGiven > 0 || healingReceived > 0) {
            if (healingReceived > 0) description += `and only needed ${healingReceived} HP in healing`;
            else if (healingGiven > 0) description += `and gave ${healingGiven} HP in healing`;
        }
        return description.trim();
    }

    // Add new method to track damage rolls
    static async _onDamageRoll(item, roll) {
        // Only process damage rolls if this is the GM
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        if (!game.combat?.started) {
            console.log('Blacksmith | Combat Stats - Skipping damage roll (combat not started)');
            return;
        }

        console.log('Blacksmith | Combat Stats - Processing Damage Roll (FULL):', {
            roll,
            rollJSON: roll[0]?.toJSON(),
            terms: roll[0]?.terms,
            total: roll[0]?.total,
            result: roll[0]?.result,
                formula: roll[0]?.formula,
            item: {
                name: item.name,
                type: item.type,
                actionType: item.system.actionType,
                damage: item.system.damage
            }
        });

        const actor = item.actor;
        if (!actor) {
            console.log('Blacksmith | Combat Stats - Skipping damage roll (no actor)');
            return;
        }
        
        // Initialize stats objects if they don't exist
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }

        // Initialize participant stats if needed
        if (!this.currentStats.participantStats) this.currentStats.participantStats = {};
        if (!this.combatStats.participantStats) this.combatStats.participantStats = {};
        
        if (!this.currentStats.participantStats[actor.id]) {
            this.currentStats.participantStats[actor.id] = {
                name: actor.name,
                damage: { dealt: 0, taken: 0 },
                healing: { given: 0, received: 0 },
                combat: {
                    attacks: {
                        hits: 0,
                        misses: 0,
                        crits: 0,
                        fumbles: 0,
                        attempts: 0
                    }
                },
                hits: [],
                misses: []
            };
        }
        if (!this.combatStats.participantStats[actor.id]) {
            this.combatStats.participantStats[actor.id] = {
                name: actor.name,
                damage: { dealt: 0, taken: 0 },
                healing: { given: 0, received: 0 },
                combat: {
                    attacks: {
                        hits: 0,
                        misses: 0,
                        crits: 0,
                        fumbles: 0,
                        attempts: 0
                    }
                },
                hits: [],
                misses: []
            };
        }

        // Get attacker stats
        const attackerStats = this.currentStats.participantStats[actor.id];
        const attackerCombatStats = this.combatStats.participantStats[actor.id];

        // Determine if this is healing or damage
        const isHealing = item.system.actionType === 'heal' || 
                         item.name.toLowerCase().includes('heal') || 
                         item.name.toLowerCase().includes('cure');

        // Get the amount - roll is an array of rolls, get the first one's total
        const amount = roll[0]?.total || 0;

        console.log('Blacksmith | Combat Stats - Damage Roll Details:', {
            actor: actor.name,
            isHealing,
            amount,
            currentDamageDealt: attackerStats.damage.dealt,
            statsBeforeUpdate: { ...attackerStats }
        });

        // Update the appropriate stats
        if (isHealing) {
            // Update healing stats for the healer
            attackerStats.healing.given += amount;
            attackerCombatStats.healing.given += amount;

            // Get targets safely
            const targets = game.user.targets;
            if (targets.size > 0) {
                targets.forEach(target => {
                    const targetActor = target.actor;
                    if (!targetActor) return;

                    // Initialize target stats if needed
                    if (!this.currentStats.participantStats[targetActor.id]) {
                        this.currentStats.participantStats[targetActor.id] = {
                            name: targetActor.name,
                            damage: { dealt: 0, taken: 0 },
                            healing: { given: 0, received: 0 },
                            hits: [],
                            misses: []
                        };
                    }
                    if (!this.combatStats.participantStats[targetActor.id]) {
                        this.combatStats.participantStats[targetActor.id] = {
                            name: targetActor.name,
                            damage: { dealt: 0, taken: 0 },
                            healing: { given: 0, received: 0 },
                            hits: [],
                            misses: []
                        };
                    }

                    // Update healing received
                    this.currentStats.participantStats[targetActor.id].healing.received += amount;
                    this.combatStats.participantStats[targetActor.id].healing.received += amount;

                    // Add notable moment tracking for healing for each target
                    this._updateNotableMoments('healing', {
                        healerId: actor.id,
                        healer: actor.name,
                        targetId: targetActor.id,
                        targetName: targetActor.name,
                        amount: amount
                    });
                });
            } else {
                // Self-healing case
                this._updateNotableMoments('healing', {
                    healerId: actor.id,
                    healer: actor.name,
                    targetId: actor.id,
                    targetName: actor.name,
                    amount: amount
                });
            }

            if (this._isPlayerCharacter(actor)) {
                this.currentStats.partyStats.healingDone += amount;
            }
        } else {
            // Update damage stats for the attacker
            attackerStats.damage.dealt += amount;
            attackerCombatStats.damage.dealt += amount;

            console.log('Blacksmith | Combat Stats - Updated Damage Stats:', {
                actor: actor.name,
                newDamageDealt: attackerStats.damage.dealt,
                amount,
                statsAfterUpdate: { ...attackerStats }
            });

            // Get targets safely
            const targets = game.user.targets;
            if (targets.size > 0) {
                targets.forEach(target => {
                    const targetActor = target.actor;
                    if (!targetActor) return;

                    // Initialize target stats if needed
                    if (!this.currentStats.participantStats[targetActor.id]) {
                        this.currentStats.participantStats[targetActor.id] = {
                            name: targetActor.name,
                        damage: { dealt: 0, taken: 0 },
                        healing: { given: 0, received: 0 },
                            hits: [],
                            misses: []
                        };
                    }
                    if (!this.combatStats.participantStats[targetActor.id]) {
                        this.combatStats.participantStats[targetActor.id] = {
                            name: targetActor.name,
                            damage: { dealt: 0, taken: 0 },
                            healing: { given: 0, received: 0 },
                            hits: [],
                            misses: []
                        };
                    }

                    // Update damage taken
                    this.currentStats.participantStats[targetActor.id].damage.taken += amount;
                    this.combatStats.participantStats[targetActor.id].damage.taken += amount;

                    // Add notable moment tracking for damage for each target
                    this._updateNotableMoments('damage', {
                        attackerId: actor.id,
                        attacker: actor.name,
                        targetId: targetActor.id,
                        targetName: targetActor.name,
                        amount: amount,
                        isCritical: this._lastRollWasCritical || false
                    });
                });
            }

            if (this._isPlayerCharacter(actor)) {
                this.currentStats.partyStats.damageDealt += amount;
            }
        }

        CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.COMBAT.DAMAGE, {
            message: isHealing ? 'Healing roll processed' : 'Damage roll processed',
            actor: actor.name,
            roll: {
                total: amount,
                isHealing
            },
            attackerStats
        });
    }

    // Add new method to track pre-damage rolls
    static _onPreDamageRoll(item, config) {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        if (config.critical) {
            this._lastRollWasCritical = true;
            console.log('Blacksmith | Combat Stats - Critical hit detected');
        }
    }

    // Add new method to track attack rolls
    static async _onAttackRoll(item, roll) {
        // Only process attack rolls if this is the GM
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        const actor = item.actor;
        if (!actor) return;

        // Initialize stats objects if they don't exist
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }

        // Ensure arrays exist
        if (!this.currentStats.hits) this.currentStats.hits = [];
        if (!this.currentStats.misses) this.currentStats.misses = [];
        if (!this.combatStats.hits) this.combatStats.hits = [];
        if (!this.combatStats.misses) this.combatStats.misses = [];

        // Initialize participant stats if needed
        if (!this.currentStats.participantStats) {
            this.currentStats.participantStats = {};
        }
        if (!this.combatStats.participantStats) {
            this.combatStats.participantStats = {};
        }

        // Initialize participant combat stats if needed
        const defaultParticipantStats = {
            name: actor.name,
            damage: { dealt: 0, taken: 0 },
            healing: { given: 0, received: 0 },
            combat: {
                attacks: {
                    hits: 0,
                    misses: 0,
                    crits: 0,
                    fumbles: 0,
                    attempts: 0
                }
            },
            hits: [],
            misses: []
        };

        // Ensure current stats exist with complete structure
        if (!this.currentStats.participantStats[actor.id]) {
            this.currentStats.participantStats[actor.id] = foundry.utils.deepClone(defaultParticipantStats);
        } else if (!this.currentStats.participantStats[actor.id].combat?.attacks) {
            // Ensure combat stats structure exists
            this.currentStats.participantStats[actor.id].combat = {
                attacks: {
                    hits: 0,
                    misses: 0,
                    crits: 0,
                    fumbles: 0,
                    attempts: 0
                }
            };
        }

        // Ensure combat stats exist with complete structure
        if (!this.combatStats.participantStats[actor.id]) {
            this.combatStats.participantStats[actor.id] = foundry.utils.deepClone(defaultParticipantStats);
        } else if (!this.combatStats.participantStats[actor.id].combat?.attacks) {
            // Ensure combat stats structure exists
            this.combatStats.participantStats[actor.id].combat = {
                attacks: {
                    hits: 0,
                    misses: 0,
                    crits: 0,
                    fumbles: 0,
                    attempts: 0
                }
            };
        }

        // Get attacker stats
        const attackerStats = this.currentStats.participantStats[actor.id];
        const attackerCombatStats = this.combatStats.participantStats[actor.id];

        // Store attack roll information
        const attackRoll = roll.total;
        const d20Results = roll.terms[0].results.map(r => r.result);
        const isCritical = d20Results.includes(20);
        const isFumble = d20Results.includes(1) && d20Results.length === 1;
        const isHit = roll.total >= (item.target?.value || 10);

        // Store hit/miss information
        const hitInfo = {
            attackRoll: roll.total,
            isCritical,
            isFumble,
            isHit,
            timestamp: Date.now(),
            actorId: actor.id,
            actorName: actor.name
        };

        // Update combat stats
        attackerStats.combat.attacks.attempts++;
        attackerCombatStats.combat.attacks.attempts++;

        if (isHit) {
            this.currentStats.hits.push(hitInfo);
            this.combatStats.hits.push(hitInfo);
            attackerStats.combat.attacks.hits++;
            attackerCombatStats.combat.attacks.hits++;
            if (isCritical) {
                attackerStats.combat.attacks.crits++;
                attackerCombatStats.combat.attacks.crits++;
            }
        } else {
            this.currentStats.misses.push(hitInfo);
            this.combatStats.misses.push(hitInfo);
            attackerStats.combat.attacks.misses++;
            attackerCombatStats.combat.attacks.misses++;
        }

        if (isFumble) {
            attackerStats.combat.attacks.fumbles++;
            attackerCombatStats.combat.attacks.fumbles++;
        }

        // Store the critical hit state for damage roll
        this._lastRollWasCritical = isCritical;

        CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.COMBAT.ATTACK, {
            message: 'Attack roll processed',
            actor: actor.name,
            roll: {
                total: attackRoll,
                isCritical,
                isFumble,
                isHit
            },
            attackerStats
        });

        if (this._isPlayerCharacter(actor)) {
            if (isHit) {
                this.currentStats.partyStats.hits++;
            } else {
                this.currentStats.partyStats.misses++;
            }
        }
    }

    // Register all necessary hooks
    static _registerHooks() {
        // Register combat hooks
        Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
        Hooks.on('deleteCombat', this._onCombatEnd.bind(this));
        Hooks.on('endCombat', this._onCombatEnd.bind(this));

        // Register damage tracking hooks
        console.log('Blacksmith | Combat Stats - Registering attack and damage hooks');
        
        // Attack roll hooks
        Hooks.on('dnd5e.preRollAttack', (item, config) => {
            console.log('Blacksmith | Combat Stats - Pre-Attack Roll detected:', { item, config });
        });
        
        Hooks.on('dnd5e.rollAttack', (item, roll) => {
            console.log('Blacksmith | Combat Stats - Attack Roll detected:', { item, roll });
            this._onAttackRoll(item, roll);
        });

        // Damage roll hooks
        Hooks.on('dnd5e.preRollDamage', (item, config) => {
            console.log('Blacksmith | Combat Stats - Pre-Damage Roll detected:', { item, config });
            this._onPreDamageRoll(item, config);
        });
        
        Hooks.on('dnd5e.rollDamage', (item, roll) => {
            console.log('Blacksmith | Combat Stats - Damage Roll detected:', { item, roll });
            this._onDamageRoll(item, roll);
        });

        // Additional debug hooks
        Hooks.on('createChatMessage', (message) => {
            if (message.isRoll) {
                console.log('Blacksmith | Combat Stats - Roll Chat Message:', {
                    flavor: message.flavor,
                    type: message.type,
                    roll: message.roll
                });
            }
        });

        console.log('Blacksmith | Combat Stats - Hooks registered');
    }


    static recordHit(hitData) {
        if (!game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        console.log('Blacksmith | Combat Stats - Recording hit:', {
            hitData,
            currentStats: this.currentStats,
            combatStats: this.combatStats,
            currentRound: game.combat?.round,
            currentTurn: game.combat?.turn,
            currentCombatant: game.combat?.combatant?.name
        });

        // Initialize stats objects if they don't exist
        if (!this.currentStats) {
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        }
        if (!this.combatStats) {
            this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        }

        // Initialize hits arrays if needed
        if (!this.currentStats.hits) this.currentStats.hits = [];
        if (!this.combatStats.hits) this.combatStats.hits = [];

        // Ensure hit data has all required fields
        const processedHitData = {
            ...hitData,
            round: game.combat?.round || 1,
            turn: game.combat?.turn || 0,
            attacker: hitData.attacker || game.actors.get(hitData.attackerId)?.name,
            targetName: hitData.targetName || game.actors.get(hitData.targetId)?.name,
            amount: Number(hitData.amount) || 0,
            isCritical: Boolean(hitData.isCritical),
            hit: Boolean(hitData.hit),
            timestamp: Date.now()
        };

        console.log('Blacksmith | Combat Stats - Processed hit data:', {
            original: hitData,
            processed: processedHitData,
            currentHits: this.currentStats.hits.length
        });

        // Add hit to current round stats
        this.currentStats.hits.push(processedHitData);

        // Initialize participant stats if needed
        if (!this.combatStats.participantStats[hitData.attackerId]) {
            this.combatStats.participantStats[hitData.attackerId] = {
                name: processedHitData.attacker,
                damage: { dealt: 0, taken: 0 },
                healing: { given: 0, received: 0 },
                hits: [],
                turns: []
            };
        }

        // Update attacker's stats
        const attackerStats = this.combatStats.participantStats[hitData.attackerId];
        attackerStats.damage.dealt += processedHitData.amount;
        attackerStats.hits.push(processedHitData);

        // Update target's stats if it exists
        if (hitData.targetId && this.combatStats.participantStats[hitData.targetId]) {
            this.combatStats.participantStats[hitData.targetId].damage.taken += processedHitData.amount;
        }

        console.log('Blacksmith | Combat Stats - Stats after hit:', {
            currentStats: {
                hits: this.currentStats.hits.length,
                lastHit: this.currentStats.hits[this.currentStats.hits.length - 1]
            },
            combatStats: {
                participantStats: Object.fromEntries(
                    Object.entries(this.combatStats.participantStats).map(([id, stats]) => [
                        id,
                        {
                            name: stats.name,
                            damage: stats.damage,
                            hits: stats.hits.length
                        }
                    ])
                )
            }
        });
    }

    // Helper method for debug logging
    static _debugLog(title, data) {
        CombatStatsDebug.debugLog('STATS.DEBUG', {
            title,
            data
        });
    }

    // Combat flow tracking methods
    static _onCombatStart(combat) {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        CombatStatsDebug.debugLog(CombatStatsDebug.DEBUG_CATEGORIES.COMBAT.START, {
            message: 'Combat started',
            combat: {
                id: combat.id,
                round: combat.round,
                turn: combat.turn,
                combatants: combat.combatants.map(c => ({
                    name: c.name,
                    id: c.id,
                    initiative: c.initiative
                }))
            }
        });

        // Initialize combat stats
        this.combatStats = foundry.utils.deepClone(this.DEFAULTS.combatStats);
        this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
        
        // Record combat start time
        this.combatStats.startTime = Date.now();
        this.currentStats.roundStartTime = Date.now();
    }

    static async _onRoundEnd() {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // Record the last turn's duration using the last combatant in the turns array
        const lastTurn = game.combat.turns?.length - 1;
        const lastCombatant = game.combat.turns?.[lastTurn];
        if (lastCombatant) {
            console.log('Blacksmith | Recording last turn of round:', {
                combatant: lastCombatant.name,
                id: lastCombatant.id,
                turn: lastTurn
            });
            this.recordTurnEnd(lastCombatant);
        }

        // Calculate total round duration (real wall-clock time)
        const roundEndTimestamp = Date.now();
        const totalRoundDuration = roundEndTimestamp - this.currentStats.roundStartTimestamp;
        this.currentStats.roundDuration = totalRoundDuration;
        
        console.log('Blacksmith | Round Duration Debug - Setting Duration:', {
            startTimestamp: this.currentStats.roundStartTimestamp,
            endTimestamp: roundEndTimestamp,
            totalDuration: totalRoundDuration
        });

        console.log('Blacksmith | Timer Debug - Round End Starting:', {
            currentStats: this.currentStats,
            combatStats: this.combatStats,
            combat: {
                round: game.combat.round,
                turn: game.combat.turn,
                current: game.combat?.current,
                combatant: game.combat?.combatant
            }
        });

        // Calculate round statistics
        const roundStats = {
            round: game.combat.round - 1,  // Use the previous round number
            hits: this.currentStats.hits.length,
            expiredTurns: this.currentStats.expiredTurns.length,
            turnTimes: this.currentStats.partyStats.turnTimes
        };

        try {
            // Prepare template data
            const templateData = await this._prepareTemplateData(this.currentStats.participantStats);

            // Store round stats if needed
            if (!this.combatStats.rounds) {
                this.combatStats.rounds = [];
            }
            this.combatStats.rounds.push(roundStats);

            // Set the round number for the template
            templateData.roundNumber = roundStats.round;
            
            console.log('Blacksmith | Round Number Debug:', {
                roundStatsRound: roundStats.round,
                templateRoundNumber: templateData.roundNumber,
                currentRound: game.combat.round,
                timingData: {
                    turnTimes: templateData.turnTimes
                }
            });

            // Render the template
            const content = await renderTemplate('modules/' + MODULE_ID + '/templates/stats-round.hbs', templateData);

            // Post to chat
            const isShared = game.settings.get(MODULE_ID, 'shareCombatStats');
            await ChatMessage.create({
                content: content,
                whisper: isShared ? [] : [game.user.id],
                speaker: { alias: "Game Master", user: game.user.id }
            });

            // Reset current stats
            this.currentStats = foundry.utils.deepClone(this.DEFAULTS.roundStats);
            
            // Ensure partyStats.turnTimes is initialized as an empty object (not array)
            this.currentStats.partyStats.turnTimes = {};
            
            // Reset activePlanningTime to 0 explicitly
            this.currentStats.activePlanningTime = 0;
            
            console.log('Blacksmith | Timer Debug - Round End Stats Reset:', {
                newStats: this.currentStats
            });
        } catch (error) {
            console.error('Blacksmith | Timer Debug - Error creating round report:', error);
            console.error(error);
        }
    }

    static async _prepareTemplateData(participantStats) {
        console.log(`Blacksmith | Timer Debug [${new Date().toISOString()}] - ENTER _prepareTemplateData`, {
            hasParticipantStats: !!this.currentStats.participantStats,
            participantCount: this.currentStats.participantStats ? Object.keys(this.currentStats.participantStats).length : 0,
            rawStats: this.currentStats.participantStats,
            turnTimes: this.currentStats.partyStats.turnTimes
        });

        const participantMap = new Map();
        const timerDuration = game.settings.get(MODULE_ID, 'combatTimerDuration');

        // First pass: Get all player characters from the combat
        if (game.combat?.turns) {
            for (const turn of game.combat.turns) {
                // Skip if no actor or not a player character
                if (!turn?.actor || !this._isPlayerCharacter(turn.actor)) continue;
                
                const id = turn.id; // Use combatant ID instead of actor ID
                if (!id) continue;

                // Get this combatant's specific turn duration
                const turnDuration = this.currentStats.partyStats.turnTimes[id] || 0;

                console.log(`Blacksmith | Turn Duration for ${turn.actor.name}:`, {
                    turnDuration,
                    combatantId: id,
                    actorId: turn.actor.id,
                    turnTimes: this.currentStats.partyStats.turnTimes
                });

                // Safely get stats, defaulting to empty structure if not found
                const stats = this.currentStats?.participantStats?.[turn.actor.id] || {
                    name: turn.actor.name,
                    damage: { dealt: 0, taken: 0 },
                    healing: { given: 0, received: 0 },
                    combat: {
                        attacks: {
                            attempts: 0,
                            hits: 0,
                            misses: 0,
                            crits: 0,
                            fumbles: 0
                        }
                    },
                    hits: [],
                    misses: [],
                    turnDuration: turnDuration,
                    lastTurnExpired: turnDuration >= (timerDuration * 1000),
                    combatantId: id // Store the combatant ID
                };

                const existingStats = participantMap.get(stats.name) || {
                    ids: new Set(),
                    name: stats.name,
                    damage: { dealt: 0, taken: 0 },
                    healing: { given: 0, received: 0 },
                    combat: {
                        attacks: {
                            attempts: 0,
                            hits: 0,
                            misses: 0,
                            crits: 0,
                            fumbles: 0
                        }
                    },
                    hits: [],
                    misses: [],
                    turnDuration: turnDuration,
                    lastTurnExpired: turnDuration >= (timerDuration * 1000),
                    score: 0
                };

                // Add this ID to the set
                existingStats.ids.add(id);

                // Safely merge damage and healing
                existingStats.damage.dealt += stats.damage?.dealt || 0;
                existingStats.damage.taken += stats.damage?.taken || 0;
                existingStats.healing.given += stats.healing?.given || 0;
                existingStats.healing.received += stats.healing?.received || 0;

                // Safely merge combat stats
                if (stats.combat?.attacks) {
                    existingStats.combat.attacks.attempts += stats.combat.attacks.attempts || 0;
                    existingStats.combat.attacks.hits += stats.combat.attacks.hits || 0;
                    existingStats.combat.attacks.misses += stats.combat.attacks.misses || 0;
                    existingStats.combat.attacks.crits += stats.combat.attacks.crits || 0;
                    existingStats.combat.attacks.fumbles += stats.combat.attacks.fumbles || 0;
                }

                // Safely merge hits and misses arrays
                if (Array.isArray(stats.hits)) existingStats.hits.push(...stats.hits);
                if (Array.isArray(stats.misses)) existingStats.misses.push(...stats.misses);

                participantMap.set(stats.name, existingStats);
            }
        }

        // Second pass: Calculate final scores and prepare for template
        const sortedParticipants = Array.from(participantMap.values()).map(stats => {
            // Calculate MVP score
            const score = Number(((stats.combat.attacks.hits * 2) + 
                         (stats.combat.attacks.crits * 3) + 
                         (stats.damage.dealt * 0.1) + 
                         (stats.healing.given * 0.2) - 
                         (stats.combat.attacks.fumbles * 2)).toFixed(1));

            // Get token image
            const tokenImg = (() => {
                const actor = game.actors.find(a => a.name === stats.name && (a.hasPlayerOwner || a.type === 'character'));
                const combatant = game.combat?.turns?.find(t => t.name === stats.name);
                return actor ? getPortraitImage(actor) : getActorPortrait(combatant);
            })();

            // Convert timerDuration to milliseconds for comparison
            const timerDurationMs = timerDuration * 1000;
            
            return {
                id: Array.from(stats.ids)[0],
                name: stats.name,
                damage: stats.damage,
                healing: stats.healing,
                combat: stats.combat,
                score,
                tokenImg,
                turnDuration: stats.turnDuration,
                lastTurnExpired: stats.turnDuration >= timerDurationMs
            };
        }).sort((a, b) => b.score - a.score);

        // Calculate total party time by summing all turn durations
        const totalPartyTime = Object.values(this.currentStats.partyStats.turnTimes).reduce((sum, duration) => sum + duration, 0);

        console.log('Blacksmith | Planning Time Debug:', {
            activePlanningTime: this.currentStats.activePlanningTime,
            totalPartyTime: totalPartyTime,
            formattedTime: this._formatTime(this.currentStats.activePlanningTime)
        });

        // Calculate active duration by combining total party time and planning time
        const activeRoundDuration = totalPartyTime + (this.currentStats.activePlanningTime || 0);

        const templateData = {
            roundDurationActive: activeRoundDuration,  // Combined party time + planning
            roundDurationActual: this.currentStats.roundDuration,  // Wall-clock time
            planningDuration: this.currentStats.activePlanningTime,  // Pass raw number
            turnDetails: sortedParticipants,
            roundMVP: sortedParticipants[0],
            timerDuration: timerDuration * 1000,  // Convert to milliseconds to match turnDuration
            totalPartyTime: totalPartyTime,
            partyStats: {
                hitMissRatio: this.currentStats.partyStats.hits / 
                    (this.currentStats.partyStats.hits + this.currentStats.partyStats.misses) * 100 || 0,
                totalHits: this.currentStats.partyStats.hits,
                totalMisses: this.currentStats.partyStats.misses,
                damageDealt: sortedParticipants.reduce((sum, p) => sum + (p.damage?.dealt || 0), 0),
                damageTaken: sortedParticipants.reduce((sum, p) => sum + (p.damage?.taken || 0), 0),
                healingDone: this.currentStats.partyStats.healingDone,
                averageTurnTime: this._formatTime(this.currentStats.partyStats.averageTurnTime),
                criticalHits: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.crits || 0), 0),
                fumbles: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.fumbles || 0), 0)
            },
            settings: {
                showRoundSummary: game.settings.get(MODULE_ID, 'showRoundSummary'),
                showRoundMVP: game.settings.get(MODULE_ID, 'showRoundMVP'),
                showNotableMoments: game.settings.get(MODULE_ID, 'showNotableMoments'),
                showPartyBreakdown: game.settings.get(MODULE_ID, 'showPartyBreakdown'),
                showRoundTimingStats: game.settings.get(MODULE_ID, 'showRoundTimingStats'),
                showRoundTurnTimes: game.settings.get(MODULE_ID, 'showRoundTurnTimes')
            },
            notableMoments: this.currentStats.notableMoments,
            hasNotableMoments: Object.values(this.currentStats.notableMoments)
                .some(moment => moment.amount > 0 || moment.duration > 0)
        };

        // Add debug log
        console.log('Blacksmith | Notable Moments Debug:', {
            notableMoments: this.currentStats.notableMoments,
            hasNotableMoments: templateData.hasNotableMoments,
            currentStats: this.currentStats
        });

        // Add debug log for settings
        console.log('Blacksmith | Template Settings:', {
            settings: templateData.settings,
            showNotableMoments: game.settings.get(MODULE_ID, 'showNotableMoments')
        });

        console.log('Blacksmith | Round Duration Debug - Template Prep:', {
            rawDuration: this.currentStats.roundDuration,
            formattedDuration: this._formatTime(this.currentStats.roundDuration)
        });

        console.log(`Blacksmith | Timer Debug [${new Date().toISOString()}] - EXIT _prepareTemplateData`, {
            participants: sortedParticipants.map(p => ({
                name: p.name,
                turnDuration: p.turnDuration,
                barWidth: `${(p.turnDuration / timerDuration) * 100}%`
            })),
            timerDuration,
            templateData
        });

        return templateData;
    }

    // Add new method to track notable moments
    static _updateNotableMoments(type, data) {
        console.log('Blacksmith | Update Notable Moments:', {
            type,
            data,
            currentStats: this.currentStats,
            notableMoments: this.currentStats?.notableMoments
        });

        if (!this.currentStats?.notableMoments) {
            console.warn('Blacksmith | Notable Moments structure not initialized');
            return;
        }
        
        const moments = this.currentStats.notableMoments;
        
        switch (type) {
            case 'damage':
                // Track biggest hit
                if (data.amount > moments.biggestHit.amount) {
                    moments.biggestHit = {
                        actorId: data.attackerId,
                        actorName: data.attacker,
                        targetId: data.targetId,
                        targetName: data.targetName,
                        amount: data.amount,
                        isCritical: data.isCritical,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                
                // Track weakest hit (non-zero)
                if (data.amount > 0 && (moments.weakestHit.amount === 0 || data.amount < moments.weakestHit.amount)) {
                    moments.weakestHit = {
                        actorId: data.attackerId,
                        actorName: data.attacker,
                        targetId: data.targetId,
                        targetName: data.targetName,
                        amount: data.amount,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                
                // Update most damage (cumulative)
                const attacker = this.currentStats.participantStats[data.attackerId];
                if (attacker && attacker.damage.dealt > moments.mostDamage.amount) {
                    moments.mostDamage = {
                        actorId: data.attackerId,
                        actorName: data.attacker,
                        amount: attacker.damage.dealt
                    };
                }
                
                // Update most hurt (cumulative damage taken)
                const target = this.currentStats.participantStats[data.targetId];
                if (target && target.damage.taken > moments.mostHurt.amount) {
                    moments.mostHurt = {
                        actorId: data.targetId,
                        actorName: data.targetName,
                        amount: target.damage.taken
                    };
                }
                break;
                
            case 'healing':
                // Track biggest heal
                if (data.amount > moments.biggestHeal.amount) {
                    moments.biggestHeal = {
                        actorId: data.healerId,
                        actorName: data.healer,
                        targetId: data.targetId,
                        targetName: data.targetName,
                        amount: data.amount,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                break;
                
            case 'turn':
                // Track longest turn
                if (data.duration > moments.longestTurn.duration) {
                    moments.longestTurn = {
                        actorId: data.actorId,
                        actorName: data.actorName,
                        duration: data.duration,
                        round: game.combat?.round,
                        turn: game.combat?.turn
                    };
                }
                break;
        }
    }

    // Record when planning phase starts
    static recordPlanningStart() {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        
        const now = Date.now();
        this.currentStats.actualPlanningStartTime = now;
        this.currentStats.lastUnpauseTime = now; // Track when we start for active time
        if (!this.currentStats.actualRoundStartTime) {
            this.currentStats.actualRoundStartTime = now;
        }
        
        console.log('Blacksmith | Planning Timer Start:', {
            startTime: now,
            currentStats: this.currentStats
        });
    }

    // Record when planning phase ends
    static recordPlanningEnd() {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        
        const now = Date.now();
        this.currentStats.actualPlanningEndTime = now;
        
        // Calculate planning time based on progress bar position
        const totalDuration = game.settings.get(MODULE_ID, 'planningTimerDuration');
        const remainingTime = PlanningTimer.state.remaining;
        this.currentStats.activePlanningTime = (totalDuration - remainingTime) * 1000; // Convert to ms

        console.log('Blacksmith | Planning Timer End Stats:', {
            actualStart: this.currentStats.actualPlanningStartTime,
            actualEnd: this.currentStats.actualPlanningEndTime,
            totalDuration,
            remainingTime,
            activeDuration: this.currentStats.activePlanningTime,
            expired: this.currentStats.planningTime?.expired
        });
    }

    // Record when first player's turn starts
    static recordFirstPlayerStart() {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;
        
        const now = Date.now();
        this.currentStats.firstPlayerStartTime = now;
        if (!this.currentStats.actualRoundStartTime) {
            this.currentStats.actualRoundStartTime = now;
        }
    }

    static recordTimerPause() {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        const now = Date.now();
        // Add the active time since last unpause
        if (this.currentStats.lastUnpauseTime) {
            if (game.combat?.turn === 0) {
                // Planning phase
                this.currentStats.activePlanningTime += now - this.currentStats.lastUnpauseTime;
                console.log('Blacksmith | Timer Pause - Planning Phase:', {
                    activePlanningTime: this.currentStats.activePlanningTime,
                    lastUnpauseTime: this.currentStats.lastUnpauseTime,
                    pauseTime: now
                });
            } else {
                // Regular turn
                this.currentStats.activeRoundTime += now - this.currentStats.lastUnpauseTime;
                console.log('Blacksmith | Timer Pause - Turn Phase:', {
                    activeRoundTime: this.currentStats.activeRoundTime,
                    lastUnpauseTime: this.currentStats.lastUnpauseTime,
                    pauseTime: now
                });
            }
        }
        this.currentStats.lastUnpauseTime = 0; // Clear the unpause time while paused
    }

    static recordTimerUnpause() {
        if (!game.user.isGM || !game.settings.get(MODULE_ID, 'trackCombatStats')) return;

        const now = Date.now();
        this.currentStats.lastUnpauseTime = now;
        
        console.log('Blacksmith | Timer Unpause:', {
            phase: game.combat?.turn === 0 ? 'Planning' : 'Turn',
            unPauseTime: now,
            currentStats: {
                activePlanningTime: this.currentStats.activePlanningTime,
                activeRoundTime: this.currentStats.activeRoundTime
            }
        });
    }
}

export { CombatStats };