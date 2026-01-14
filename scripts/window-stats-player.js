import { MODULE } from './const.js';
import { postConsoleAndNotification, getPortraitImage } from './api-core.js';
import { StatsAPI } from './api-stats.js';

export class PlayerStatsWindow extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'blacksmith-player-stats-window',
            title: 'Player Statistics',
            template: `modules/${MODULE.ID}/templates/window-stats-player.hbs`,
            width: 750,
            height: 700,
            resizable: true,
            minimizable: true,
            classes: ['blacksmith-stats', 'blacksmith-player-stats'],
            submitOnChange: false,
            closeOnSubmit: false
        });
    }

    constructor(actorId, options = {}) {
        super(options);
        this.actorId = actorId;
    }

    static async show(actorId) {
        const win = new PlayerStatsWindow(actorId);
        win.render(true);
    }

    async getData(options = {}) {
        try {
            const actor = game.actors.get(this.actorId);
            if (!actor) {
                postConsoleAndNotification(MODULE.NAME, 'Player Stats Window: Actor not found', { actorId: this.actorId }, false, false);
                return this._getEmptyData();
            }

            const stats = await StatsAPI.player.getStats(this.actorId);
            if (!stats) {
                postConsoleAndNotification(MODULE.NAME, 'Player Stats Window: No stats found', { actorId: this.actorId }, true, false);
                return this._getEmptyData(actor);
            }

            const lifetime = stats.lifetime || {};
            const attacks = lifetime.attacks || {};
            const healing = lifetime.healing || {};
            const mvp = lifetime.mvp || {};
            const revives = lifetime.revives || {};
            const unconscious = lifetime.unconscious || {};

            // Calculate hit rate
            const totalHits = attacks.totalHits || 0;
            const totalMisses = attacks.totalMisses || 0;
            const totalAttacks = totalHits + totalMisses;
            const hitRate = totalAttacks > 0
                ? ((totalHits / totalAttacks) * 100).toFixed(1)
                : '0.0';
            const hitRateValue = totalAttacks > 0
                ? (totalHits / totalAttacks) * 100
                : 0;

            // Build summary cards data
            const summary = {
                biggestHit: {
                    amount: attacks.biggest?.amount || 0
                },
                mvpTotal: Number(mvp.totalScore || 0).toFixed(1),
                crits: attacks.criticals || 0,
                fumbles: attacks.fumbles || 0,
                deaths: unconscious.count || 0,
                totalDamage: attacks.totalDamage || 0,
                totalHealing: (healing.total || 0) + (healing.received || 0),
                hitRate: hitRate,
                hitRateValue: hitRateValue
            };

            // Format damage by weapon (remove zero entries)
            const damageByWeapon = {};
            if (attacks.damageByWeapon) {
                for (const [weapon, damage] of Object.entries(attacks.damageByWeapon)) {
                    if (damage > 0) {
                        damageByWeapon[weapon] = damage;
                    }
                }
            }

            // Format damage by type (remove zero entries)
            const damageByType = {};
            if (attacks.damageByType) {
                for (const [type, damage] of Object.entries(attacks.damageByType)) {
                    if (damage > 0) {
                        damageByType[type] = damage;
                    }
                }
            }

            return {
                actor: {
                    id: actor.id,
                    name: actor.name,
                    img: getPortraitImage(actor) || 'icons/svg/mystery-man.svg'
                },
                summary,
                attacks: {
                    totalHits: totalHits,
                    totalMisses: totalMisses,
                    hitMissRatio: attacks.hitMissRatio ? Number(attacks.hitMissRatio).toFixed(1) : '0.0',
                    totalDamage: attacks.totalDamage || 0,
                    criticals: attacks.criticals || 0,
                    fumbles: attacks.fumbles || 0,
                    damageByWeapon: damageByWeapon,
                    damageByType: damageByType
                },
                healing: {
                    total: healing.total || 0,
                    received: healing.received || 0,
                    revives: revives.received || 0
                },
                mvp: {
                    totalScore: Number(mvp.totalScore || 0).toFixed(1),
                    highScore: Number(mvp.highScore || 0).toFixed(1),
                    averageScore: Number(mvp.averageScore || 0).toFixed(1),
                    combats: mvp.combats || 0
                }
            };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Player Stats Window: Failed to prepare data', { actorId: this.actorId, error }, false, false);
            return this._getEmptyData();
        }
    }

    _getEmptyData(actor = null) {
        const defaultActor = actor || { id: this.actorId, name: 'Unknown', img: 'icons/svg/mystery-man.svg' };
        return {
            actor: {
                id: defaultActor.id,
                name: defaultActor.name,
                img: defaultActor.img || 'icons/svg/mystery-man.svg'
            },
            summary: {
                biggestHit: { amount: 0 },
                mvpTotal: '0.0',
                crits: 0,
                fumbles: 0,
                deaths: 0,
                totalDamage: 0,
                totalHealing: 0,
                hitRate: '0.0',
                hitRateValue: 0
            },
            attacks: {
                totalHits: 0,
                totalMisses: 0,
                hitMissRatio: 0,
                totalDamage: 0,
                criticals: 0,
                fumbles: 0,
                damageByWeapon: {},
                damageByType: {}
            },
            healing: {
                total: 0,
                received: 0,
                revives: 0
            },
            mvp: {
                totalScore: '0.0',
                highScore: '0.0',
                averageScore: '0.0',
                combats: 0
            }
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        const element = html?.[0];
        if (!element) return;

        element.querySelectorAll('.close-player-stats').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });
    }
}
