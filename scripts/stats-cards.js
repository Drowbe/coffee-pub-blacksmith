/**
 * Chat cards for the combat statistics system.
 *
 * Every card Blacksmith posts about a combat is built here: the start
 * announcement, the five round cards, and the six end-of-combat cards. Eleven
 * templates in two families (`card-stats-round-*` and `card-stats-combat-*`),
 * which is the honest measure of how much presentation had accumulated inside
 * the tracker.
 *
 * This is presentation only. It reads statistics and posts messages; it never
 * records anything. `stats-combat.js` owns tracking and calls in here when a
 * round or a combat ends.
 *
 * WHY THE IMPORT GOES THIS WAY. This file imports `CombatStats` statically and
 * `stats-combat.js` imports this one *dynamically* at its call sites. That is
 * deliberate: a static cycle between the two would be safe by the letter of the
 * spec (neither touches the other at module-evaluation time) but `stats-combat.js`
 * sits in the bootstrap path, whose load ordering is documented as fragile in
 * §3 of `architecture-blacksmith.md`. A lazy import on one side removes the
 * cycle rather than relying on it being the harmless kind.
 *
 * WHAT THIS EXTRACTION DID NOT FIX. Card preparation reads tracker state
 * directly -- `CombatStats.currentStats` appears dozens of times below, and
 * several tracker helpers are called across the boundary. That entanglement is
 * unchanged; it is only visible now, spelled `CombatStats.` instead of hidden
 * behind `this.`. Handing these methods their data instead of letting them
 * reach for it is the phase 4 question in
 * `documentation/plans/plan-stats-decomposition.md`.
 */

import { MODULE } from './const.js';
import { getPortraitImage, postConsoleAndNotification, getSettingSafely, playSound } from './api-core.js';
import { CombatStats } from './stats-combat.js';
// stats-mvp.js is a leaf — it imports neither this file nor the tracker — so
// this one is static rather than lazy.
import { CombatMvp, MVPDescriptionGenerator } from './stats-mvp.js';

export class CombatCards {
    /**
     * Send combat start announcement card when combat is created
     */
    static async _sendCombatStartCard() {
        if (!game.user.isGM) return;
        
        // Check if combat start announcement is enabled
        if (!game.settings.get(MODULE.ID, 'announceCombatStart')) return;
        
        try {
            const startContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-combat-start.hbs',
                {}
            );
            
            const isShared = game.settings.get(MODULE.ID, 'shareCombatStats');
            const whisper = isShared ? [] : [game.user.id];
            const speaker = { alias: "Game Master", user: game.user.id };
            
            await ChatMessage.create({
                content: startContent,
                whisper,
                speaker
            });
            
            // Play combat start sound if configured
            const soundId = game.settings.get(MODULE.ID, 'combatStartSound');
            if (soundId && soundId !== 'none') {
                const volume = game.settings.get(MODULE.ID, 'timerSoundVolume');
                try {
                    await playSound(soundId, volume);
                } catch (soundError) {
                    // Silently handle sound playback errors (non-critical)
                    // Errors are already logged by playSound function
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error sending combat start card', error, false, false);
        }
    }

    static async _prepareTemplateData(participantStats, combat = null) {
        // Ensure currentStats is initialized
        if (!CombatStats.currentStats) {
            CombatStats.currentStats = foundry.utils.deepClone(CombatStats.DEFAULTS.roundStats);
        }

        // Use provided combat object or fall back to game.combat
        const combatToUse = combat || game.combat;

        postConsoleAndNotification(MODULE.NAME, `Timer Debug [${new Date().toISOString()}] - ENTER _prepareTemplateData`, {
            hasParticipantStats: !!CombatStats.currentStats.participantStats,
            participantCount: CombatStats.currentStats.participantStats ? Object.keys(CombatStats.currentStats.participantStats).length : 0,
            rawStats: CombatStats.currentStats.participantStats,
            turnTimes: CombatStats.currentStats.partyStats?.turnTimes || {}
        }, true, false);

        const participantMap = new Map();

        // First pass: Get all player characters from the combat
        if (combatToUse?.turns) {
            for (const turn of combatToUse.turns) {
                // Skip if no actor or not a player character
                if (!turn?.actor || !CombatStats._isPlayerCharacter(turn.actor)) continue;
                
                const actorId = turn.actor.id;
                const actorUuid = turn.actor.uuid;
                const combatantId = turn.id; // Use combatant ID for per-round timing
                if (!actorId || !combatantId) continue;

                // Get this combatant's specific turn duration
                const turnDuration = CombatStats.currentStats.partyStats?.turnTimes?.[combatantId] || 0;

                postConsoleAndNotification(MODULE.NAME, `Turn Duration for ${turn.actor.name}:`, {
                    turnDuration,
                    combatantId,
                    actorId,
                    turnTimes: CombatStats.currentStats.partyStats?.turnTimes || {}
                }, true, false);

                // Safely get stats, defaulting to empty structure if not found
                const stats = CombatStats.currentStats?.participantStats?.[actorId] || {
                    name: turn.actor.name,
                    kills: 0,
                    successfulOffenseCount: 0,
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
                    combatantId
                };

                const existingStats = participantMap.get(actorId) || {
                    actorId,
                    actorUuid,
                    name: stats.name,
                    kills: 0,
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
                    combatantIds: new Set()
                };

                // Track combatant IDs encountered (for timing data)
                existingStats.combatantIds.add(combatantId);
                existingStats.actorUuid = actorUuid;
                existingStats.name = stats.name;

                // Safely merge damage and healing
                existingStats.kills += Number(stats.kills) || 0;
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

                // Safely merge hits and misses arrays with bounded push
                if (Array.isArray(stats.hits)) {
                    for (const hit of stats.hits) {
                        CombatStats._boundedPush(existingStats.hits, hit);
                    }
                }
                if (Array.isArray(stats.misses)) {
                    for (const miss of stats.misses) {
                        CombatStats._boundedPush(existingStats.misses, miss);
                    }
                }

                participantMap.set(actorId, existingStats);
            }
        }

        // Second pass: Calculate final scores and prepare for template
        const mvpTuning = CombatMvp._getMvpTuningSettings();
        const mvpMaxima = CombatMvp._computeMvpMaxima(Array.from(participantMap.values()).map(stats => ({
            offenseCount: Number.isFinite(Number(stats.successfulOffenseCount))
                ? (Number(stats.successfulOffenseCount) || 0)
                : (stats.combat?.attacks?.hits || 0),
            hits: stats.combat?.attacks?.hits || 0,
            misses: stats.combat?.attacks?.misses || 0,
            attempts: stats.combat?.attacks?.attempts || 0,
            crits: stats.combat?.attacks?.crits || 0,
            fumbles: stats.combat?.attacks?.fumbles || 0,
            damage: stats.damage?.dealt || 0,
            healing: stats.healing?.given || 0,
            kills: stats.kills || 0
        })));

        const sortedParticipants = Array.from(participantMap.values()).map(stats => {
            // Calculate MVP score
            const score = CombatMvp._computeMvpScore({
                offenseCount: Number.isFinite(Number(stats.successfulOffenseCount))
                    ? (Number(stats.successfulOffenseCount) || 0)
                    : (stats.combat?.attacks?.hits || 0),
                hits: stats.combat?.attacks?.hits || 0,
                misses: stats.combat?.attacks?.misses || 0,
                attempts: stats.combat?.attacks?.attempts || 0,
                crits: stats.combat?.attacks?.crits || 0,
                fumbles: stats.combat?.attacks?.fumbles || 0,
                damage: stats.damage?.dealt || 0,
                healing: stats.healing?.given || 0,
                kills: stats.kills || 0
            }, mvpMaxima, mvpTuning);

            // Get token image
            const tokenImg = (() => {
                const actor = game.actors.get(stats.actorId);
                if (actor) return getPortraitImage(actor);
                const combatantId = Array.from(stats.combatantIds || [])[0];
                const combatant = combatantId ? game.combat?.combatants?.get(combatantId) : null;
                return getActorPortrait(combatant);
            })();

            // Calculate damage ratio: show green (dealt) vs red (taken)
            // 50/50 = balanced, more green = more DPS, more red = more tank
            // If both are 0, default to 50/50 split
            const damageDealt = stats.damage?.dealt || 0;
            const damageTaken = stats.damage?.taken || 0;
            // Include healing given as "damage given" for the ratio
            const healingGiven = stats.healing?.given || 0;
            const totalGiven = damageDealt + healingGiven;
            const totalTaken = damageTaken;
            const totalActivity = totalGiven + totalTaken;
            
            // Calculate percentages: green = given (damage + healing), red = taken
            // Default to 50/50 if both are 0
            const greenPercent = totalActivity > 0 
                ? (totalGiven / totalActivity) * 100 
                : 50;
            const redPercent = totalActivity > 0 
                ? (totalTaken / totalActivity) * 100 
                : 50;
            
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Damage Ratio Calculation:', {
                name: stats.name,
                damageDealt,
                healingGiven,
                totalGiven,
                damageTaken,
                totalTaken,
                totalActivity,
                greenPercent: greenPercent.toFixed(2),
                redPercent: redPercent.toFixed(2)
            }, true, false);
            
            return {
                actorId: stats.actorId,
                actorUuid: stats.actorUuid,
                combatantIds: Array.from(stats.combatantIds || []),
                name: stats.name,
                kills: stats.kills || 0,
                damage: stats.damage,
                healing: stats.healing,
                combat: stats.combat,
                score,
                tokenImg,
                turnDuration: stats.turnDuration,
                damageRatioGreen: Math.round(greenPercent * 100) / 100, // Round to 2 decimals
                damageRatioRed: Math.round(redPercent * 100) / 100    // Round to 2 decimals
            };
        }).sort((a, b) => b.score - a.score);

        // Calculate total party time by summing all turn durations
        const totalPartyTime = Object.values(CombatStats.currentStats.partyStats.turnTimes).reduce((sum, duration) => sum + duration, 0);

        postConsoleAndNotification(MODULE.NAME, 'Planning Time Debug:', {
            activePlanningTime: CombatStats.currentStats.activePlanningTime,
            totalPartyTime: totalPartyTime,
            formattedTime: CombatStats._formatTime(CombatStats.currentStats.activePlanningTime)
        }, true, false);

        // Calculate active duration by combining total party time and planning time
        const activeRoundDuration = totalPartyTime + (CombatStats.currentStats.activePlanningTime || 0);

        const templateData = {
            roundDurationActive: activeRoundDuration,  // Combined party time + planning
            roundDurationActual: CombatStats.currentStats.roundDuration,  // Wall-clock time
            planningDuration: CombatStats.currentStats.activePlanningTime,  // Pass raw number
            turnDetails: sortedParticipants,
            roundMVP: sortedParticipants[0],
            totalPartyTime: totalPartyTime,
            partyStats: {
                hitMissRatio: CombatStats.currentStats.partyStats.hits /
                    (CombatStats.currentStats.partyStats.hits + CombatStats.currentStats.partyStats.misses) * 100 || 0,
                totalHits: CombatStats.currentStats.partyStats.hits,
                totalMisses: CombatStats.currentStats.partyStats.misses,
                totalAttacks: (CombatStats.currentStats.partyStats.hits || 0) + (CombatStats.currentStats.partyStats.misses || 0),
                kills: CombatStats.currentStats.partyStats.kills || 0,
                damageDealt: sortedParticipants.reduce((sum, p) => sum + (p.damage?.dealt || 0), 0),
                damageTaken: sortedParticipants.reduce((sum, p) => sum + (p.damage?.taken || 0), 0),
                healingDone: CombatStats.currentStats.partyStats.healingDone,
                averageTurnTime: CombatStats._formatTime(CombatStats.currentStats.partyStats.averageTurnTime),
                criticalHits: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.crits || 0), 0),
                fumbles: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.fumbles || 0), 0),
            },
            settings: {
                showRoundSummary: game.settings.get(MODULE.ID, 'showRoundSummary'),
                showRoundMVP: game.settings.get(MODULE.ID, 'showRoundMVP'),
                showNotableMoments: game.settings.get(MODULE.ID, 'showNotableMoments'),
                showPartyBreakdown: game.settings.get(MODULE.ID, 'showPartyBreakdown'),
                showRoundTimer: game.settings.get(MODULE.ID, 'showRoundTimer'),
                planningTimerEnabled: game.settings.get(MODULE.ID, 'planningTimerEnabled'),
                combatTimerEnabled: game.settings.get(MODULE.ID, 'combatTimerEnabled')
            },
            notableMoments: await CombatCards._enrichNotableMomentsWithPortraits(CombatStats.currentStats.notableMoments),
            hasNotableMoments: Object.values(CombatStats.currentStats.notableMoments)
                .some(moment => moment.amount > 0 || moment.duration > 0)
        };

        const actorScores = sortedParticipants.map((participant, index) => ({
            name: participant.name,
            actorId: participant.actorId,
            actorUuid: participant.actorUuid,
            score: participant.score,
            rank: index + 1
        }));

        postConsoleAndNotification(
            MODULE.NAME,
            'COMBAT STATS: Round MVP rankings computed',
            {
                round: game.combat?.round ?? 0,
                actorScores
            },
            true,
            false
        );

        actorScores.forEach(entry => {
            if (!entry.actorId) return;
            Hooks.callAll('blacksmith.roundMvpScore', entry);
        });

        return {
            roundDurationActive: activeRoundDuration,  // Combined party time + planning
            roundDurationActual: CombatStats.currentStats.roundDuration,  // Wall-clock time
            planningDuration: CombatStats.currentStats.activePlanningTime,  // Pass raw number
            turnDetails: sortedParticipants,
            roundMVP: sortedParticipants[0],
            totalPartyTime: totalPartyTime,
            partyStats: {
                hitMissRatio: CombatStats.currentStats.partyStats.hits /
                    (CombatStats.currentStats.partyStats.hits + CombatStats.currentStats.partyStats.misses) * 100 || 0,
                totalHits: CombatStats.currentStats.partyStats.hits,
                totalMisses: CombatStats.currentStats.partyStats.misses,
                totalAttacks: (CombatStats.currentStats.partyStats.hits || 0) + (CombatStats.currentStats.partyStats.misses || 0),
                kills: CombatStats.currentStats.partyStats.kills || 0,
                damageDealt: sortedParticipants.reduce((sum, p) => sum + (p.damage?.dealt || 0), 0),
                damageTaken: sortedParticipants.reduce((sum, p) => sum + (p.damage?.taken || 0), 0),
                healingDone: CombatStats.currentStats.partyStats.healingDone,
                averageTurnTime: CombatStats._formatTime(CombatStats.currentStats.partyStats.averageTurnTime),
                criticalHits: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.crits || 0), 0),
                fumbles: sortedParticipants.reduce((sum, p) => sum + (p.combat?.attacks?.fumbles || 0), 0),
            },
            settings: {
                showRoundSummary: game.settings.get(MODULE.ID, 'showRoundSummary'),
                showRoundMVP: game.settings.get(MODULE.ID, 'showRoundMVP'),
                showNotableMoments: game.settings.get(MODULE.ID, 'showNotableMoments'),
                showPartyBreakdown: game.settings.get(MODULE.ID, 'showPartyBreakdown'),
                showRoundTimer: game.settings.get(MODULE.ID, 'showRoundTimer'),
                planningTimerEnabled: game.settings.get(MODULE.ID, 'planningTimerEnabled'),
                combatTimerEnabled: game.settings.get(MODULE.ID, 'combatTimerEnabled')
            },
            notableMoments: await CombatCards._enrichNotableMomentsWithPortraits(CombatStats.currentStats.notableMoments),
            hasNotableMoments: Object.values(CombatStats.currentStats.notableMoments)
                .some(moment => moment.amount > 0 || moment.duration > 0)
        };
    }

    /**
     * Send round cards as separate chat messages
     * Order: Round End, Round Summary, Round MVP, Notable Moments, Party Breakdown
     */
    static async _sendRoundCards(templateData, roundNumber) {
        const isShared = game.settings.get(MODULE.ID, 'shareCombatStats');
        const whisper = isShared ? [] : [game.user.id];
        const speaker = { alias: "Game Master", user: game.user.id };

        // 1. Round End Card (always send if no other cards are being sent)
        const showAnyCard = templateData.settings.showRoundSummary || 
                           templateData.settings.showRoundMVP || 
                           templateData.settings.showNotableMoments || 
                           templateData.settings.showPartyBreakdown;
        
        if (!showAnyCard) {
            const endContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-start.hbs',
                { roundNumber }
            );
            await ChatMessage.create({ content: endContent, whisper, speaker });
            return;
        }

        // Collect all message promises to send them simultaneously
        const messagePromises = [];

        // 2. Round Summary Card
        if (templateData.settings.showRoundSummary) {
            const summaryContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-summary.hbs',
                templateData
            );
            messagePromises.push(ChatMessage.create({ content: summaryContent, whisper, speaker }));
        }

        // 3. Round MVP Card
        if (templateData.settings.showRoundMVP) {
            const mvpContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-mvp.hbs',
                templateData
            );
            messagePromises.push(ChatMessage.create({ content: mvpContent, whisper, speaker }));
        }

        // 4. Notable Moments Card
        if (templateData.settings.showNotableMoments) {
            const momentsContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-moments.hbs',
                templateData
            );
            messagePromises.push(ChatMessage.create({ content: momentsContent, whisper, speaker }));
        }

        // 5. Party Breakdown Card
        if (templateData.settings.showPartyBreakdown) {
            const breakdownContent = await foundry.applications.handlebars.renderTemplate(
                'modules/' + MODULE.ID + '/templates/card-stats-round-breakdown.hbs',
                templateData
            );
            messagePromises.push(ChatMessage.create({ content: breakdownContent, whisper, speaker }));
        }

        // Send all messages simultaneously
        await Promise.all(messagePromises);
    }

    /**
     * Prepare template data for combat cards with damage ratios
     * Formats participants exactly like round breakdown (turnDetails structure)
     * @param {Object} combatSummary - The combat summary object
     * @returns {Object} Template data with enriched participant data
     */
    static async _prepareCombatTemplateData(combatSummary) {
        // Filter to only player characters and format like turnDetails
        const eligibleParticipants = (combatSummary.participants || [])
            .filter(participant => {
                const actor = game.actors.get(participant.actorId);
                return actor && CombatStats._isPlayerCharacter(actor);
            });

        // Ensure summary totals always have numeric defaults so templates never render blanks.
        const rawTotals = combatSummary?.totals || {};
        const totalsHits = Number(rawTotals.hits) || 0;
        const totalsMisses = Number(rawTotals.misses) || 0;
        const totalsAttacks = Number(rawTotals.totalAttacks) || (totalsHits + totalsMisses);
        const normalizedTotals = {
            hits: totalsHits,
            misses: totalsMisses,
            totalAttacks: totalsAttacks,
            kills: Number(rawTotals.kills) || 0,
            damageDealt: Number(rawTotals.damageDealt) || 0,
            damageTaken: Number(rawTotals.damageTaken) || 0,
            healingGiven: Number(rawTotals.healingGiven) || 0,
            criticals: Number(rawTotals.criticals) || 0,
            fumbles: Number(rawTotals.fumbles) || 0,
            hitRate: rawTotals.hitRate ?? (totalsAttacks > 0 ? ((totalsHits / totalsAttacks) * 100).toFixed(1) : 0)
        };

        const mvpTuning = CombatMvp._getMvpTuningSettings();
        const mvpMaxima = CombatMvp._computeMvpMaxima(eligibleParticipants.map(participant => ({
            offenseCount: Number.isFinite(Number(participant.successfulOffenseCount))
                ? (Number(participant.successfulOffenseCount) || 0)
                : (participant.hits || 0),
            hits: participant.hits || 0,
            misses: participant.misses || 0,
            attempts: participant.totalAttacks || 0,
            crits: participant.criticals || 0,
            fumbles: participant.fumbles || 0,
            damage: participant.damageDealt || 0,
            healing: participant.healingGiven || 0,
            kills: participant.kills || 0
        })));

        const turnDetails = eligibleParticipants
            .map(participant => {
                const actor = game.actors.get(participant.actorId);

                // Get token image
                const tokenImg = actor ? getPortraitImage(actor) : "icons/svg/mystery-man.svg";

                // Calculate MVP score (same formula as round)
                const score = CombatMvp._computeMvpScore({
                    offenseCount: Number.isFinite(Number(participant.successfulOffenseCount))
                        ? (Number(participant.successfulOffenseCount) || 0)
                        : (participant.hits || 0),
                    hits: participant.hits || 0,
                    misses: participant.misses || 0,
                    attempts: participant.totalAttacks || 0,
                    crits: participant.criticals || 0,
                    fumbles: participant.fumbles || 0,
                    damage: participant.damageDealt || 0,
                    healing: participant.healingGiven || 0,
                    kills: participant.kills || 0
                }, mvpMaxima, mvpTuning);

                // Calculate damage ratio: show green (dealt + healing) vs red (taken)
                const damageDealt = participant.damageDealt || 0;
                const damageTaken = participant.damageTaken || 0;
                const healingGiven = participant.healingGiven || 0;
                const totalGiven = damageDealt + healingGiven;
                const totalTaken = damageTaken;
                const totalActivity = totalGiven + totalTaken;

                // Calculate percentages: green = given (damage + healing), red = taken
                // Default to 50/50 if both are 0
                const greenPercent = totalActivity > 0
                    ? (totalGiven / totalActivity) * 100
                    : 50;

                // Get total turn duration for this actor across all rounds
                // Try to get from combatStats, but if not available, default to 0
                // (Turn durations are tracked per round, so we'd need to accumulate them)
                let turnDuration = 0;
                const combatStatsForActor = CombatStats.combatStats?.participantStats?.[participant.actorId];
                if (combatStatsForActor?.turnDuration) {
                    turnDuration = combatStatsForActor.turnDuration;
                }
                // Note: If turn durations aren't accumulated in combatStats, they'll be 0
                // This is acceptable as combat-level turn tracking may not be fully implemented

                // Format exactly like turnDetails from round breakdown
                return {
                    actorId: participant.actorId,
                    name: participant.name,
                    tokenImg,
                    score,
                    kills: participant.kills || 0,
                    damage: {
                        dealt: participant.damageDealt || 0,
                        taken: participant.damageTaken || 0
                    },
                    healing: {
                        given: participant.healingGiven || 0,
                        received: participant.healingReceived || 0
                    },
                    combat: {
                        attacks: {
                            hits: participant.hits || 0,
                            misses: participant.misses || 0,
                            attempts: participant.totalAttacks || 0,
                            crits: participant.criticals || 0,
                            fumbles: participant.fumbles || 0
                        }
                    },
                    turnDuration,
                    damageRatioGreen: Math.round(greenPercent * 100) / 100
                };
            })
            .sort((a, b) => b.score - a.score); // Sort by MVP score descending

        // Calculate total party time and average turn time
        const totalPartyTime = turnDetails.reduce((sum, p) => sum + (p.turnDuration || 0), 0);
        const totalTurns = turnDetails.length;
        const averageTurnTime = totalTurns > 0 ? totalPartyTime / totalTurns : 0;

        // Calculate notable moments from combat data (same structure as round version)
        const topHits = combatSummary.notableMoments?.topHits || [];
        const topHeals = combatSummary.notableMoments?.topHeals || [];
        
        // Biggest hit (already calculated as topHits[0])
        const biggestHit = topHits.length > 0 ? {
            actorId: topHits[0].attackerId,
            actorName: topHits[0].attacker,
            targetId: topHits[0].targetId,
            targetName: topHits[0].target,
            amount: topHits[0].amount,
            isCritical: topHits[0].isCritical
        } : { amount: 0 };

        // Weakest hit (smallest non-zero hit)
        const weakestHit = (() => {
            const nonZeroHits = topHits.filter(h => h.amount > 0);
            if (nonZeroHits.length === 0) return { amount: 0 };
            const weakest = nonZeroHits.reduce((min, hit) => hit.amount < min.amount ? hit : min, nonZeroHits[0]);
            return {
                actorId: weakest.attackerId,
                actorName: weakest.attacker,
                targetId: weakest.targetId,
                targetName: weakest.target,
                amount: weakest.amount
            };
        })();

        // Most damage (participant with highest damageDealt)
        const mostDamage = (() => {
            if (turnDetails.length === 0) return { amount: 0 };
            const top = turnDetails.reduce((max, p) => (p.damage.dealt || 0) > (max.damage.dealt || 0) ? p : max, turnDetails[0]);
            return {
                actorId: top.actorId,
                actorName: top.name,
                amount: top.damage.dealt || 0
            };
        })();

        // Most hurt (participant with highest damageTaken)
        const mostHurt = (() => {
            if (turnDetails.length === 0) return { amount: 0 };
            const top = turnDetails.reduce((max, p) => (p.damage.taken || 0) > (max.damage.taken || 0) ? p : max, turnDetails[0]);
            return {
                actorId: top.actorId,
                actorName: top.name,
                amount: top.damage.taken || 0
            };
        })();

        // Biggest heal (already calculated as topHeals[0])
        const biggestHeal = topHeals.length > 0 ? {
            actorId: topHeals[0].healerId,
            actorName: topHeals[0].healer,
            targetId: topHeals[0].targetId,
            targetName: topHeals[0].target,
            amount: topHeals[0].amount
        } : { amount: 0 };

        // Longest turn (from combatStats)
        let longestTurn = combatSummary.notableMoments?.longestTurn || { duration: 0 };
        // Ensure it has actorName if it has actorId
        if (longestTurn.actorId && !longestTurn.actorName) {
            const actor = game.actors.get(longestTurn.actorId);
            if (actor) {
                longestTurn.actorName = actor.name;
            }
        }

        // Build notable moments object (same structure as round version)
        // Preserve MVP and mvpRankings from original combat summary
        const notableMoments = {
            biggestHit,
            weakestHit,
            mostDamage,
            mostHurt,
            biggestHeal,
            longestTurn,
            // Preserve MVP data from combat summary
            mvp: combatSummary.notableMoments?.mvp || null,
            mvpRankings: combatSummary.notableMoments?.mvpRankings || []
        };

        // Enrich with portraits
        const enrichedNotableMoments = await CombatCards._enrichNotableMomentsWithPortraits(notableMoments);
        
        // Check if there are any notable moments
        const hasNotableMoments = Object.values(enrichedNotableMoments)
            .some(moment => moment && ((moment.amount > 0) || (moment.duration > 0)));

        // Format combat MVP like round MVP (use top participant from turnDetails)
        let combatMVP = null;
        if (turnDetails.length > 0 && turnDetails[0].score > 0) {
            const topParticipant = turnDetails[0];
            // Generate description + theme using MVPDescriptionGenerator (moment-aware via topHits/topHeals)
            const { description, themeLabel, themeKey } = MVPDescriptionGenerator.generateDescription({
                combat: topParticipant.combat,
                damage: topParticipant.damage,
                healing: topParticipant.healing
            }, {
                actorId: topParticipant.actorId,
                name: topParticipant.name,
                maxima: mvpMaxima,
                tuning: mvpTuning,
                topHits: combatSummary.notableMoments?.topHits || [],
                topHeals: combatSummary.notableMoments?.topHeals || []
            });
            
            combatMVP = {
                ...topParticipant,
                description,
                themeLabel,
                themeKey
            };
        }

        return {
            ...combatSummary,
            totals: normalizedTotals,
            turnDetails, // Use turnDetails like round version
            participants: turnDetails, // Keep for backward compatibility
            combatMVP, // Single MVP formatted like roundMVP
            totalPartyTime,
            partyStats: {
                averageTurnTime: CombatStats._formatTime(averageTurnTime)
            },
            notableMoments: enrichedNotableMoments,
            hasNotableMoments,
            mvpRankings: enrichedNotableMoments.mvpRankings || [],
            settings: {
                showCombatSummary: game.settings.get(MODULE.ID, 'showCombatSummary'),
                showCombatMVP: game.settings.get(MODULE.ID, 'showCombatMVP'),
                showCombatNotableMoments: game.settings.get(MODULE.ID, 'showCombatNotableMoments'),
                showCombatPartyBreakdown: game.settings.get(MODULE.ID, 'showCombatPartyBreakdown'),
                combatTimerEnabled: game.settings.get(MODULE.ID, 'combatTimerEnabled')
            }
        };
    }

    /**
     * Send combat cards as separate chat messages
     * Order: Combat Summary, Combat MVP, Notable Moments, Party Breakdown
     * @param {Object} templateData - Prepared template data
     */
    static async _sendCombatCards(templateData) {
        const isShared = game.settings.get(MODULE.ID, 'shareCombatStats');
        const whisper = isShared ? [] : [game.user.id];
        const speaker = { alias: "Game Master", user: game.user.id };

        // Debug: Log settings and data availability
        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Sending combat cards', {
            showCombatSummary: templateData.settings.showCombatSummary,
            showCombatMVP: templateData.settings.showCombatMVP,
            showCombatNotableMoments: templateData.settings.showCombatNotableMoments,
            showCombatPartyBreakdown: templateData.settings.showCombatPartyBreakdown,
            hasMVP: !!templateData.notableMoments?.mvp,
            hasTopHits: Array.isArray(templateData.notableMoments?.topHits) && templateData.notableMoments.topHits.length > 0,
            hasTopHeals: Array.isArray(templateData.notableMoments?.topHeals) && templateData.notableMoments.topHeals.length > 0,
            participantsCount: templateData.participants?.length || 0
        }, true, false);

        // Check if combat end announcement is enabled
        const announceCombatEnd = game.settings.get(MODULE.ID, 'announceCombatEnd');
        
        // Collect all message promises to send them simultaneously
        const messagePromises = [];

        // 0. End of Combat Card (send first if enabled)
        if (announceCombatEnd) {
            try {
                const endContent = await foundry.applications.handlebars.renderTemplate(
                    'modules/' + MODULE.ID + '/templates/card-stats-combat-end.hbs',
                    {}
                );
                messagePromises.push(ChatMessage.create({ content: endContent, whisper, speaker }));
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Error rendering combat end card', error, false, false);
            }
        }

        // 1. Combat Summary Card
        if (templateData.settings.showCombatSummary) {
            try {
                const summaryContent = await foundry.applications.handlebars.renderTemplate(
                    'modules/' + MODULE.ID + '/templates/card-stats-combat-summary.hbs',
                    templateData
                );
                messagePromises.push(ChatMessage.create({ content: summaryContent, whisper, speaker }));
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Error rendering combat summary card', error, false, false);
            }
        }

        // 2. Combat MVP Card
        if (templateData.settings.showCombatMVP) {
            try {
                const mvpContent = await foundry.applications.handlebars.renderTemplate(
                    'modules/' + MODULE.ID + '/templates/card-stats-combat-mvp.hbs',
                    templateData
                );
                messagePromises.push(ChatMessage.create({ content: mvpContent, whisper, speaker }));
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Error rendering combat MVP card', error, false, false);
            }
        }

        // 3. Notable Moments Card
        if (templateData.settings.showCombatNotableMoments) {
            try {
                const momentsContent = await foundry.applications.handlebars.renderTemplate(
                    'modules/' + MODULE.ID + '/templates/card-stats-combat-moments.hbs',
                    templateData
                );
                messagePromises.push(ChatMessage.create({ content: momentsContent, whisper, speaker }));
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Error rendering combat notable moments card', error, false, false);
            }
        }

        // 4. Party Breakdown Card
        if (templateData.settings.showCombatPartyBreakdown) {
            try {
                const breakdownContent = await foundry.applications.handlebars.renderTemplate(
                    'modules/' + MODULE.ID + '/templates/card-stats-combat-breakdown.hbs',
                    templateData
                );
                messagePromises.push(ChatMessage.create({ content: breakdownContent, whisper, speaker }));
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Error rendering combat party breakdown card', error, false, false);
            }
        }

        // Send all messages simultaneously
        await Promise.all(messagePromises);
        
        // Play combat end sound if configured and announcement is enabled
        if (announceCombatEnd) {
            const soundId = game.settings.get(MODULE.ID, 'combatEndSound');
            if (soundId && soundId !== 'none') {
                const volume = game.settings.get(MODULE.ID, 'timerSoundVolume');
                try {
                    await playSound(soundId, volume);
                } catch (soundError) {
                    // Silently handle sound playback errors (non-critical)
                    // Errors are already logged by playSound function
                }
            }
        }
    }

    // Enrich notable moments with portrait images
    static async _enrichNotableMomentsWithPortraits(notableMoments) {
        if (!notableMoments) return notableMoments;
        
        const enriched = foundry.utils.deepClone(notableMoments);
        
        // Helper to add portrait to a moment
        const addPortrait = async (moment) => {
            if (!moment || !moment.actorId) return moment;
            const actor = game.actors.get(moment.actorId);
            if (actor) {
                moment.actorImg = getPortraitImage(actor) || "icons/svg/mystery-man.svg";
            } else {
                moment.actorImg = "icons/svg/mystery-man.svg";
            }
            return moment;
        };
        
        // Add portraits to all notable moments that have actorId
        if (enriched.biggestHit?.actorId) await addPortrait(enriched.biggestHit);
        if (enriched.weakestHit?.actorId) await addPortrait(enriched.weakestHit);
        if (enriched.mostDamage?.actorId) await addPortrait(enriched.mostDamage);
        if (enriched.biggestHeal?.actorId) await addPortrait(enriched.biggestHeal);
        if (enriched.mostHurt?.actorId) await addPortrait(enriched.mostHurt);
        if (enriched.longestTurn?.actorId) await addPortrait(enriched.longestTurn);
        
        return enriched;
    }

}
