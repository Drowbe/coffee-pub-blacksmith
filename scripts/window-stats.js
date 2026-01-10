import { MODULE } from './const.js';
import { postConsoleAndNotification, getPortraitImage } from './api-core.js';
import { StatsAPI } from './api-stats.js';
import { CPBPlayerStats } from './stats-player.js';

export class StatsWindow extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'blacksmith-stats-window',
            title: 'Party Statistics',
            template: `modules/${MODULE.ID}/templates/window-stats.hbs`,
            width: 960,
            height: 720,
            resizable: true,
            minimizable: true,
            classes: ['blacksmith-stats'],
            submitOnChange: false,
            closeOnSubmit: false
        });
    }

    static async show() {
        const win = new StatsWindow();
        win.render(true);
    }

    async getData(options = {}) {
        try {
            // Get all combat history for summary (all-time stats)
            const allHistory = StatsAPI.combat.getCombatHistory() || [];
            
            // Get last 20 for display table (paging will be added later)
            let displayHistory = StatsAPI.combat.getCombatHistory(20) || [];
            if (!displayHistory.length && allHistory.length) {
                displayHistory = allHistory.slice(0, 20);
            }
            
            const combats = displayHistory.map((summary, index) => this._mapCombatSummary(summary, index, displayHistory.length));

            const leaderboard = await this._buildLeaderboard();
            const highlights = this._buildHighlights(displayHistory);

            // Build summary from ALL history (all-time stats)
            const summary = await this._buildSummary(allHistory, leaderboard);

            return {
                summary,
                combats,
                leaderboard,
                highlights,
                filters: {
                    showCombats: true,
                    showLifetime: true
                }
            };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'COMBAT STATS: Failed to prepare stats window context', error, false, false);
            return {
                summary: {
                    totalCombats: 0,
                    totalRounds: 0,
                    averageHitRate: '0.0',
                    averageHitRateValue: 0,
                    topMvp: {
                        name: '—',
                        img: 'icons/svg/mystery-man.svg'
                    },
                    biggestHit: {
                        name: '—',
                        img: 'icons/svg/mystery-man.svg',
                        amount: 0
                    },
                    mostCrits: {
                        name: '—',
                        img: 'icons/svg/mystery-man.svg',
                        count: 0
                    },
                    mostFumbles: {
                        name: '—',
                        img: 'icons/svg/mystery-man.svg',
                        count: 0
                    },
                    mostHits: {
                        name: '—',
                        img: 'icons/svg/mystery-man.svg',
                        count: 0
                    },
                    mostMisses: {
                        name: '—',
                        img: 'icons/svg/mystery-man.svg',
                        count: 0
                    },
                    totalCriticals: 0,
                    totalFumbles: 0,
                    totalDamageGiven: 0,
                    totalDamageTaken: 0,
                    totalHealsGiven: 0
                },
                combats: [],
                leaderboard: [],
                highlights: [],
                filters: {
                    showCombats: true,
                    showLifetime: true
                }
            };
        }
    }

    activateListeners(html) {
        super.activateListeners(html);

        const element = html?.[0];
        if (!element) return;

        const combatSection = element.querySelector('[data-section="combat-history"]');
        const lifetimeSection = element.querySelector('[data-section="lifetime-leaderboard"]');

        const toggleCombats = element.querySelector('#toggleCombats');
        if (toggleCombats) {
            toggleCombats.addEventListener('change', (event) => {
                combatSection?.classList.toggle('hidden', !event.currentTarget.checked);
            });
        }

        const toggleLifetime = element.querySelector('#toggleLifetime');
        if (toggleLifetime) {
            toggleLifetime.addEventListener('change', (event) => {
                lifetimeSection?.classList.toggle('hidden', !event.currentTarget.checked);
            });
        }

        element.querySelector('.close-stats')?.addEventListener('click', () => this.close());
        element.querySelector('.export-history')?.addEventListener('click', () => this._exportHistory());
        element.querySelector('.import-history')?.addEventListener('click', () => this._importHistory());
        
        // Delete history link
        element.querySelector('.delete-history-btn')?.addEventListener('click', (event) => {
            event.preventDefault();
            this._onDeleteAllHistory();
        });

        // Delete individual combat buttons
        element.querySelectorAll('.delete-combat-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const combatId = btn.closest('[data-combat-id]')?.dataset.combatId;
                if (combatId) {
                    this._onDeleteCombat(combatId);
                }
            });
        });
    }

    _mapCombatSummary(summary, index, totalCombats) {
        const totals = summary?.totals || {};
        const hitRateValue = Number(totals.hitRate ?? 0).toFixed(1);
        const durationSeconds = summary?.durationSeconds ?? Math.round((summary?.duration || 0) / 1000);
        const mvp = summary?.notableMoments?.mvp || { name: '—', score: 0 };
        const rounds = summary?.totalRounds ?? 0;

        return {
            combatId: summary?.combatId || `combat-${index}`,
            label: summary?.sceneName || `Combat ${totalCombats - index}`,
            dateFormatted: summary?.date ? this._formatDate(summary.date) : '—',
            rounds: rounds > 0 ? rounds.toString() : '—',
            hitRate: `${hitRateValue}%`,
            mvpName: mvp?.name || '—',
            mvpScore: Number(mvp?.score ?? 0).toFixed(1),
            duration: this._formatDuration(durationSeconds)
        };
    }

    async _buildLeaderboard() {
        const actors = game.actors.filter(actor => actor.hasPlayerOwner && !actor.isToken);
        const leaderboard = [];

        for (const actor of actors) {
            try {
                const stats = await StatsAPI.player.getStats(actor.id);
                const mvp = stats?.lifetime?.mvp;
                if (!mvp || !mvp.combats) continue;

                const attacks = stats?.lifetime?.attacks || {};
                const crits = attacks.criticals || 0;
                const fumbles = attacks.fumbles || 0;
                const biggestHit = attacks.biggest?.amount || 0;

                leaderboard.push({
                    actorId: actor.id,
                    name: actor.name,
                    img: getPortraitImage(actor) || 'icons/svg/mystery-man.svg',
                    mvp: {
                        totalScore: Number(mvp.totalScore || 0).toFixed(1),
                        combats: mvp.combats || 0,
                        averageScore: Number(mvp.averageScore || 0).toFixed(2),
                        highScore: Number(mvp.highScore || 0).toFixed(1)
                    },
                    crits: crits,
                    fumbles: fumbles,
                    biggestHit: biggestHit > 0 ? biggestHit : '—'
                });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'COMBAT STATS: Failed to load player stats', { actorId: actor.id, error }, true, false);
            }
        }

        leaderboard.sort((a, b) => Number(b.mvp.totalScore) - Number(a.mvp.totalScore));
        leaderboard.forEach((entry, index) => entry.rank = index + 1);

        return leaderboard;
    }

    _buildHighlights(history) {
        const highlights = [];
        history.slice(0, 5).forEach((summary, index) => {
            const mvp = summary?.notableMoments?.mvp;
            if (!mvp?.name) return;

            highlights.push({
                player: mvp.name,
                score: Number(mvp.score || 0).toFixed(1),
                combat: summary?.sceneName || `Combat ${index + 1}`,
                damage: summary?.totals?.damageDealt || 0,
                healing: summary?.totals?.healingGiven || 0,
                notes: mvp?.description || '—',
                img: this._getActorPortrait(mvp.actorId)
            });
        });
        return highlights;
    }

    async _buildSummary(allHistory, leaderboard) {
        // Calculate all-time stats from ALL combat history (not just displayed)
        const totalCombats = allHistory.length;
        
        // Calculate aggregates across all combats
        let totalHits = 0;
        let totalMisses = 0;
        let totalDamageGiven = 0;
        let totalDamageTaken = 0;
        let totalHealsGiven = 0;
        let totalCriticals = 0;
        let totalFumbles = 0;
        let totalRounds = 0;

        for (const summary of allHistory) {
            const totals = summary?.totals || {};
            totalHits += totals.hits || 0;
            totalMisses += totals.misses || 0;
            totalDamageGiven += totals.damageDealt || 0;
            totalDamageTaken += totals.damageTaken || 0;
            totalHealsGiven += totals.healingGiven || 0;
            totalCriticals += totals.criticals || 0;
            totalFumbles += totals.fumbles || 0;
            totalRounds += summary?.totalRounds || 0;
        }

        const totalAttacks = totalHits + totalMisses;
        const averageHitRate = totalAttacks > 0
            ? ((totalHits / totalAttacks) * 100).toFixed(1)
            : '0.0';

        // Top MVP (highest total MVP score)
        const topMvpEntry = leaderboard[0];
        const topMvp = topMvpEntry ? {
            name: topMvpEntry.name,
            img: topMvpEntry.img
        } : {
            name: '—',
            img: 'icons/svg/mystery-man.svg'
        };

        // Find Biggest Hit, Most Crits, Most Fumbles, Most Hits, and Most Misses from all players
        // Need to check all actors, not just those in leaderboard
        const actors = game.actors.filter(actor => actor.hasPlayerOwner && !actor.isToken);
        let biggestHitEntry = null;
        let biggestHitAmount = 0;
        let mostCritsEntry = null;
        let mostCritsCount = 0;
        let mostFumblesEntry = null;
        let mostFumblesCount = 0;
        let mostHitsEntry = null;
        let mostHitsCount = 0;
        let mostMissesEntry = null;
        let mostMissesCount = 0;

        for (const actor of actors) {
            try {
                const stats = await StatsAPI.player.getStats(actor.id);
                if (!stats) continue;

                const attacks = stats?.lifetime?.attacks || {};
                const mvp = stats?.lifetime?.mvp || {};
                const biggestHit = attacks.biggest?.amount || 0;
                const crits = attacks.criticals || 0;
                const fumbles = attacks.fumbles || 0;
                const hits = attacks.totalHits || 0;
                const misses = attacks.totalMisses || 0;
                const mvpTotalScore = Number(mvp.totalScore || 0);

                const entry = {
                    actorId: actor.id,
                    name: actor.name,
                    img: getPortraitImage(actor) || 'icons/svg/mystery-man.svg',
                    biggestHit,
                    crits,
                    fumbles,
                    hits,
                    misses,
                    mvp: { totalScore: mvpTotalScore }
                };

                // Biggest Hit
                if (biggestHit > biggestHitAmount) {
                    biggestHitAmount = biggestHit;
                    biggestHitEntry = entry;
                }

                // Most Crits (tie-breaker: highest MVP totalScore)
                if (crits > mostCritsCount) {
                    mostCritsCount = crits;
                    mostCritsEntry = entry;
                } else if (crits === mostCritsCount) {
                    if (!mostCritsEntry || mvpTotalScore > Number(mostCritsEntry.mvp.totalScore || 0)) {
                        mostCritsEntry = entry;
                    }
                }

                // Most Fumbles (tie-breaker: lowest MVP totalScore)
                if (fumbles > mostFumblesCount) {
                    mostFumblesCount = fumbles;
                    mostFumblesEntry = entry;
                } else if (fumbles === mostFumblesCount) {
                    if (!mostFumblesEntry || mvpTotalScore < Number(mostFumblesEntry.mvp.totalScore || 0)) {
                        mostFumblesEntry = entry;
                    }
                }

                // Most Hits (tie-breaker: highest MVP totalScore)
                if (hits > mostHitsCount) {
                    mostHitsCount = hits;
                    mostHitsEntry = entry;
                } else if (hits === mostHitsCount) {
                    if (!mostHitsEntry || mvpTotalScore > Number(mostHitsEntry.mvp.totalScore || 0)) {
                        mostHitsEntry = entry;
                    }
                }

                // Most Misses (tie-breaker: lowest MVP totalScore)
                if (misses > mostMissesCount) {
                    mostMissesCount = misses;
                    mostMissesEntry = entry;
                } else if (misses === mostMissesCount) {
                    if (!mostMissesEntry || mvpTotalScore < Number(mostMissesEntry.mvp.totalScore || 0)) {
                        mostMissesEntry = entry;
                    }
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'COMBAT STATS: Failed to load player stats for summary', { actorId: actor.id, error }, true, false);
            }
        }

        return {
            totalCombats,
            totalRounds,
            averageHitRate,
            averageHitRateValue: parseFloat(averageHitRate), // For progress bar
            topMvp,
            biggestHit: {
                name: biggestHitEntry ? biggestHitEntry.name : '—',
                img: biggestHitEntry ? biggestHitEntry.img : 'icons/svg/mystery-man.svg',
                amount: biggestHitAmount > 0 ? biggestHitAmount : 0
            },
            mostCrits: {
                name: mostCritsEntry ? mostCritsEntry.name : '—',
                img: mostCritsEntry ? mostCritsEntry.img : 'icons/svg/mystery-man.svg',
                count: mostCritsCount
            },
            mostFumbles: {
                name: mostFumblesEntry ? mostFumblesEntry.name : '—',
                img: mostFumblesEntry ? mostFumblesEntry.img : 'icons/svg/mystery-man.svg',
                count: mostFumblesCount
            },
            mostHits: {
                name: mostHitsEntry ? mostHitsEntry.name : '—',
                img: mostHitsEntry ? mostHitsEntry.img : 'icons/svg/mystery-man.svg',
                count: mostHitsCount
            },
            mostMisses: {
                name: mostMissesEntry ? mostMissesEntry.name : '—',
                img: mostMissesEntry ? mostMissesEntry.img : 'icons/svg/mystery-man.svg',
                count: mostMissesCount
            },
            totalCriticals,
            totalFumbles,
            totalDamageGiven,
            totalDamageTaken,
            totalHealsGiven
        };
    }

    _formatDate(dateString) {
        if (!dateString) return '—';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString();
    }

    _formatDuration(seconds) {
        if (!seconds || seconds < 0) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins <= 0) return `${secs}s`;
        return `${mins}m ${secs}s`;
    }

    _getActorPortrait(actorId) {
        const actor = actorId ? game.actors.get(actorId) : null;
        return actor?.img || 'icons/svg/mystery-man.svg';
    }

    async _exportHistory() {
        if (!game.user.isGM) {
            ui.notifications.warn('Only GMs can export statistics.');
            return;
        }

        try {
            // Get all combat history for export
            const history = StatsAPI.combat.getCombatHistory() || [];
            
            // Get all player stats
            const actors = game.actors.filter(actor => actor.hasPlayerOwner && !actor.isToken);
            const playerStats = [];
            
            for (const actor of actors) {
                try {
                    const stats = await StatsAPI.player.getStats(actor.id);
                    if (stats) {
                        playerStats.push({
                            actorId: actor.id,
                            actorName: actor.name,
                            stats: {
                                lifetime: stats.lifetime || null
                            }
                        });
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Failed to export stats for actor', { actorId: actor.id, error }, true, false);
                }
            }

            // Create export payload
            const payload = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                combatHistory: history,
                playerStats: playerStats
            };

            const jsonString = JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
            anchor.download = `blacksmith-stats-export-${new Date().toISOString().split('T')[0]}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
            ui.notifications.info(`Exported ${history.length} combat(s) and ${playerStats.length} player stat(s).`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Failed to export statistics', error, false, false);
            ui.notifications.error('Failed to export statistics.');
        }
    }

    async _onDeleteAllHistory() {
        if (!game.user.isGM) {
            ui.notifications.warn('Only GMs can delete combat history.');
            return;
        }

        const confirmed = await Dialog.confirm({
            title: 'Delete All Combat History',
            content: '<p>Are you sure you want to delete all combat history?</p><p>This will also clear all player statistics. This action cannot be undone.</p>',
            yes: () => true,
            no: () => false,
            defaultYes: false
        });

        if (!confirmed) return;

        try {
            // Clear combat history
            await StatsAPI.combat.clearHistory();
            
            // Clear all player stats
            await StatsAPI.player.clearAllStats();
            
            ui.notifications.info('All combat history and player statistics have been cleared.');
            this.render();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Failed to clear combat history', error, false, false);
            ui.notifications.error('Failed to clear combat history.');
        }
    }

    async _onDeleteCombat(combatId) {
        if (!game.user.isGM) {
            ui.notifications.warn('Only GMs can delete combat history.');
            return;
        }

        if (!combatId) return;

        // Get the combat summary before removing it (search all history)
        const history = StatsAPI.combat.getCombatHistory() || [];
        const combatSummary = history.find(s => s.combatId === combatId);

        const confirmed = await Dialog.confirm({
            title: 'Delete Combat Entry',
            content: `<p>Are you sure you want to delete this combat from history?</p><p>This will also remove this combat's contribution from all player statistics. This action cannot be undone.</p>`,
            yes: () => true,
            no: () => false,
            defaultYes: false
        });

        if (!confirmed) return;

        try {
            // Remove from combat history
            const removed = await StatsAPI.combat.removeCombat(combatId);
            
            if (removed && combatSummary) {
                // Remove from all players' stats
                await CPBPlayerStats.removeCombatFromAllPlayers(combatId, combatSummary);
            }
            
            ui.notifications.info('Combat entry removed from history.');
            this.render();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Failed to remove combat from history', error, false, false);
            ui.notifications.error('Failed to remove combat from history.');
        }
    }

    async _importHistory() {
        if (!game.user.isGM) {
            ui.notifications.warn('Only GMs can import statistics.');
            return;
        }

        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                let imported = JSON.parse(text);

                // Support backward compatibility: old format was just an array of combat summaries
                if (Array.isArray(imported)) {
                    imported = {
                        version: '0.9',
                        combatHistory: imported,
                        playerStats: []
                    };
                }

                // Validate structure
                if (!imported.combatHistory && !imported.playerStats) {
                    ui.notifications.error('Invalid statistics file format.');
                    return;
                }

                const confirmed = await Dialog.confirm({
                    title: 'Import Statistics',
                    content: `<p>This will merge imported statistics with existing data.</p>
                              <p><strong>Combat History:</strong> ${imported.combatHistory?.length || 0} combat(s)</p>
                              <p><strong>Player Stats:</strong> ${imported.playerStats?.length || 0} player(s)</p>
                              <p>Continue with import?</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });

                if (!confirmed) {
                    input.remove();
                    return;
                }

                await this._processImport(imported);
                input.remove();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Failed to import statistics', error, false, false);
                ui.notifications.error('Failed to import statistics. Check console for details.');
                input.remove();
            }
        });

        document.body.appendChild(input);
        input.click();
    }

    async _processImport(imported) {
        let combatCount = 0;
        let playerCount = 0;
        let skippedCombats = 0;
        let skippedPlayers = 0;

        // Import combat history
        if (imported.combatHistory && Array.isArray(imported.combatHistory)) {
            const currentHistory = StatsAPI.combat.getCombatHistory() || [];
            const historyMap = new Map();
            
            // Index existing history by combatId
            currentHistory.forEach(combat => {
                if (combat.combatId) {
                    historyMap.set(combat.combatId, combat);
                }
            });

            // Merge imported combats
            for (const importedCombat of imported.combatHistory) {
                if (!importedCombat.combatId) {
                    skippedCombats++;
                    continue;
                }

                const existing = historyMap.get(importedCombat.combatId);
                if (existing) {
                    // Compare dates - keep the more recent one, or merge if same
                    const existingDate = existing.date ? new Date(existing.date).getTime() : 0;
                    const importedDate = importedCombat.date ? new Date(importedCombat.date).getTime() : 0;
                    
                    if (importedDate > existingDate) {
                        // Imported is newer, replace
                        historyMap.set(importedCombat.combatId, importedCombat);
                        combatCount++;
                    } else {
                        // Existing is newer or same, skip
                        skippedCombats++;
                    }
                } else {
                    // New combat, add it
                    historyMap.set(importedCombat.combatId, importedCombat);
                    combatCount++;
                }
            }

            // Convert back to array and store (keep all history for verification)
            const mergedHistory = Array.from(historyMap.values())
                .sort((a, b) => {
                    const dateA = a.date ? new Date(a.date).getTime() : 0;
                    const dateB = b.date ? new Date(b.date).getTime() : 0;
                    return dateB - dateA; // Most recent first
                });

            await game.settings.set(MODULE.ID, 'combatHistory', mergedHistory);
        }

        // Import player stats
        if (imported.playerStats && Array.isArray(imported.playerStats)) {
            for (const importedPlayer of imported.playerStats) {
                if (!importedPlayer.stats?.lifetime) {
                    skippedPlayers++;
                    continue;
                }

                // Try to find actor by ID first, then by name
                let actor = importedPlayer.actorId ? game.actors.get(importedPlayer.actorId) : null;
                
                if (!actor && importedPlayer.actorName) {
                    actor = game.actors.find(a => 
                        a.hasPlayerOwner && 
                        !a.isToken && 
                        a.name === importedPlayer.actorName
                    );
                }

                if (!actor) {
                    skippedPlayers++;
                    postConsoleAndNotification(MODULE.NAME, 'Import: Actor not found', {
                        actorId: importedPlayer.actorId,
                        actorName: importedPlayer.actorName
                    }, true, false);
                    continue;
                }

                // Merge player stats
                const merged = await this._mergePlayerStats(actor.id, importedPlayer.stats.lifetime);
                if (merged) {
                    playerCount++;
                } else {
                    skippedPlayers++;
                }
            }
        }

        // Refresh window and notify
        ui.notifications.info(
            `Import complete: ${combatCount} combat(s) imported, ${playerCount} player(s) updated. ` +
            `Skipped: ${skippedCombats} combat(s), ${skippedPlayers} player(s).`
        );
        this.render();
    }

    async _mergePlayerStats(actorId, importedLifetime) {
        try {
            const currentStats = await StatsAPI.player.getStats(actorId);
            if (!currentStats) {
                // Initialize if doesn't exist
                await CPBPlayerStats.initializeActorStats(actorId);
                const initialized = await StatsAPI.player.getStats(actorId);
                if (!initialized) return false;
            }

            const current = await StatsAPI.player.getStats(actorId);
            const merged = foundry.utils.deepClone(current);

            // Merge attacks totals (additive)
            if (importedLifetime.attacks) {
                const currentAttacks = merged.lifetime.attacks || {};
                const importedAttacks = importedLifetime.attacks;

                merged.lifetime.attacks = {
                    ...currentAttacks,
                    totalHits: (currentAttacks.totalHits || 0) + (importedAttacks.totalHits || 0),
                    totalMisses: (currentAttacks.totalMisses || 0) + (importedAttacks.totalMisses || 0),
                    criticals: (currentAttacks.criticals || 0) + (importedAttacks.criticals || 0),
                    fumbles: (currentAttacks.fumbles || 0) + (importedAttacks.fumbles || 0),
                    totalDamage: (currentAttacks.totalDamage || 0) + (importedAttacks.totalDamage || 0)
                };

                // Merge biggest/weakest (compare)
                if (importedAttacks.biggest) {
                    if (!currentAttacks.biggest || 
                        (importedAttacks.biggest.amount || 0) > (currentAttacks.biggest.amount || 0)) {
                        merged.lifetime.attacks.biggest = importedAttacks.biggest;
                    }
                }

                if (importedAttacks.weakest) {
                    if (!currentAttacks.weakest || 
                        (importedAttacks.weakest.amount || 0) < (currentAttacks.weakest.amount || 0) ||
                        currentAttacks.weakest.amount === 0) {
                        merged.lifetime.attacks.weakest = importedAttacks.weakest;
                    }
                }

                // Merge hitLog (combine and keep most recent 20)
                const combinedHitLog = [
                    ...(importedAttacks.hitLog || []),
                    ...(currentAttacks.hitLog || [])
                ].sort((a, b) => {
                    const dateA = a.date ? new Date(a.date).getTime() : 0;
                    const dateB = b.date ? new Date(b.date).getTime() : 0;
                    return dateB - dateA; // Most recent first
                }).slice(0, 20);
                merged.lifetime.attacks.hitLog = combinedHitLog;

                // Merge damageByWeapon (additive)
                merged.lifetime.attacks.damageByWeapon = { ...(currentAttacks.damageByWeapon || {}) };
                if (importedAttacks.damageByWeapon) {
                    for (const [weapon, damage] of Object.entries(importedAttacks.damageByWeapon)) {
                        merged.lifetime.attacks.damageByWeapon[weapon] = 
                            (merged.lifetime.attacks.damageByWeapon[weapon] || 0) + (damage || 0);
                    }
                }

                // Merge damageByType (additive)
                merged.lifetime.attacks.damageByType = { ...(currentAttacks.damageByType || {}) };
                if (importedAttacks.damageByType) {
                    for (const [type, damage] of Object.entries(importedAttacks.damageByType)) {
                        merged.lifetime.attacks.damageByType[type] = 
                            (merged.lifetime.attacks.damageByType[type] || 0) + (damage || 0);
                    }
                }

                // Recalculate hitMissRatio
                const totalHits = merged.lifetime.attacks.totalHits || 0;
                const totalMisses = merged.lifetime.attacks.totalMisses || 0;
                merged.lifetime.attacks.hitMissRatio = (totalHits + totalMisses) > 0 
                    ? (totalHits / (totalHits + totalMisses)) * 100 
                    : 0;
            }

            // Merge healing (additive)
            if (importedLifetime.healing) {
                const currentHealing = merged.lifetime.healing || {};
                const importedHealing = importedLifetime.healing;

                merged.lifetime.healing = {
                    ...currentHealing,
                    total: (currentHealing.total || 0) + (importedHealing.total || 0),
                    received: (currentHealing.received || 0) + (importedHealing.received || 0)
                };

                // Merge byTarget (additive)
                merged.lifetime.healing.byTarget = { ...(currentHealing.byTarget || {}) };
                if (importedHealing.byTarget) {
                    for (const [target, amount] of Object.entries(importedHealing.byTarget)) {
                        merged.lifetime.healing.byTarget[target] = 
                            (merged.lifetime.healing.byTarget[target] || 0) + (amount || 0);
                    }
                }
            }

            // Merge turnStats (recalculate averages)
            if (importedLifetime.turnStats) {
                const currentTurnStats = merged.lifetime.turnStats || {};
                const importedTurnStats = importedLifetime.turnStats;

                const totalTime = (currentTurnStats.total || 0) + (importedTurnStats.total || 0);
                const totalCount = (currentTurnStats.count || 0) + (importedTurnStats.count || 0);

                merged.lifetime.turnStats = {
                    total: totalTime,
                    count: totalCount,
                    average: totalCount > 0 ? totalTime / totalCount : 0
                };

                // Compare fastest/slowest
                if (importedTurnStats.fastest) {
                    if (!currentTurnStats.fastest || 
                        (importedTurnStats.fastest.duration || Infinity) < (currentTurnStats.fastest.duration || Infinity)) {
                        merged.lifetime.turnStats.fastest = importedTurnStats.fastest;
                    }
                }

                if (importedTurnStats.slowest) {
                    if (!currentTurnStats.slowest || 
                        (importedTurnStats.slowest.duration || 0) > (currentTurnStats.slowest.duration || 0)) {
                        merged.lifetime.turnStats.slowest = importedTurnStats.slowest;
                    }
                }
            }

            // Merge MVP stats (additive totals, compare records)
            if (importedLifetime.mvp) {
                const currentMvp = merged.lifetime.mvp || {};
                const importedMvp = importedLifetime.mvp;

                const totalScore = (currentMvp.totalScore || 0) + (importedMvp.totalScore || 0);
                const combats = (currentMvp.combats || 0) + (importedMvp.combats || 0);

                merged.lifetime.mvp = {
                    totalScore: totalScore,
                    combats: combats,
                    averageScore: combats > 0 ? Number((totalScore / combats).toFixed(2)) : 0,
                    highScore: Math.max(currentMvp.highScore || 0, importedMvp.highScore || 0),
                    lastScore: importedMvp.lastScore || currentMvp.lastScore || 0,
                    lastRank: importedMvp.lastRank || currentMvp.lastRank || null
                };
            }

            // Update lastUpdated timestamp
            merged.lifetime.lastUpdated = new Date().toISOString();

            // Save merged stats
            const actor = game.actors.get(actorId);
            if (actor) {
                await actor.setFlag(MODULE.ID, 'playerStats', merged);
                return true;
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Failed to merge player stats', { actorId, error }, false, false);
        }

        return false;
    }
}
