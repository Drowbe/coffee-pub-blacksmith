import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { StatsAPI } from './api-stats.js';

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
            let history = StatsAPI.combat.getCombatHistory(20) || [];
            if (!history.length) {
                const latest = StatsAPI.combat.getCombatSummary();
                if (latest) history = [latest];
            }
            const combats = history.map((summary, index) => this._mapCombatSummary(summary, index, history.length));

            const leaderboard = await this._buildLeaderboard();
            const highlights = this._buildHighlights(history);

            const summary = this._buildSummary(combats, leaderboard);

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
                    averageHitRate: '0.0',
                    topMvp: '—',
                    bestScore: '0.0',
                    lastCombatDate: '—'
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
    }

    _mapCombatSummary(summary, index, totalCombats) {
        const totals = summary?.totals || {};
        const hitRateValue = Number(totals.hitRate ?? 0).toFixed(1);
        const durationSeconds = summary?.durationSeconds ?? Math.round((summary?.duration || 0) / 1000);
        const mvp = summary?.notableMoments?.mvp || { name: '—', score: 0 };

        return {
            combatId: summary?.combatId || `combat-${index}`,
            label: summary?.sceneName || `Combat ${totalCombats - index}`,
            dateFormatted: summary?.date ? this._formatDate(summary.date) : '—',
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

                leaderboard.push({
                    actorId: actor.id,
                    name: actor.name,
                    img: actor.img,
                    mvp: {
                        totalScore: Number(mvp.totalScore || 0).toFixed(1),
                        combats: mvp.combats || 0,
                        averageScore: Number(mvp.averageScore || 0).toFixed(2),
                        highScore: Number(mvp.highScore || 0).toFixed(1)
                    }
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

    _buildSummary(combats, leaderboard) {
        const totalCombats = combats.length;
        const averageHitRate = totalCombats
            ? (combats.reduce((sum, combat) => sum + parseFloat(combat.hitRate), 0) / totalCombats).toFixed(1)
            : '0.0';
        const topMvpEntry = leaderboard[0];
        const topMvp = topMvpEntry ? `${topMvpEntry.name}` : '—';
        const bestScore = topMvpEntry ? topMvpEntry.mvp.highScore : '0.0';
        const lastCombatDate = combats[0]?.dateFormatted || '—';

        return {
            totalCombats,
            averageHitRate,
            topMvp,
            bestScore,
            lastCombatDate
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
        const history = StatsAPI.combat.getCombatHistory(20) || [];
        const payload = JSON.stringify(history, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'blacksmith-combat-history.json';
        anchor.click();
        URL.revokeObjectURL(url);
        ui.notifications.info('Combat history exported.');
    }
}
