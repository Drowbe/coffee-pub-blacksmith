/**
 * MVP scoring and the narrative written from it.
 *
 * Two classes, one topic. `CombatMvp` turns a participant's raw counts into a
 * score and a ranking; `MVPDescriptionGenerator` turns that into the sentence
 * the MVP card prints.
 *
 * This is a leaf. It imports neither the tracker nor the cards, and nothing
 * here reads or writes combat state -- every method takes what it needs as an
 * argument. That is not a design imposed during the extraction; it is what the
 * code already was, hidden inside a 5,000-line class. The scoring methods had
 * no references to tracker state at all.
 *
 * Scoring is relative, which is the one thing worth knowing before changing it:
 * `_computeMvpScore` normalises each contribution against the maxima across the
 * party for that combat (`_computeMvpMaxima`), so a score means "how this
 * character compared to the others in this fight" and not an absolute rating.
 * Weights come from settings via `_getMvpTuningSettings`.
 *
 * Three callers, and they must agree: the round MVP card, the end-of-combat MVP
 * card, and the running-combat aggregate the encounter bar reads. They call the
 * same methods here for that reason -- a bar showing one MVP mid-fight and a
 * card naming another afterwards would be the defect this file exists to
 * prevent.
 */

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely, isPlayerCharacter } from './api-core.js';
// The MVP narrative's sentence templates live in the asset bundle.
import { assetLookup } from './utility-asset-lookup.js';

export class CombatMvp {
    static _getMvpTuningSettings() {
        return {
            normalizeByPartyMax: !!game.settings.get(MODULE.ID, 'mvpNormalizeByPartyMax'),
            weights: {
                hit: Number(game.settings.get(MODULE.ID, 'mvpHitWeight')) || 0,
                miss: Number(game.settings.get(MODULE.ID, 'mvpMissWeight')) || 0,
                crit: Number(game.settings.get(MODULE.ID, 'mvpCritWeight')) || 0,
                fumble: Number(game.settings.get(MODULE.ID, 'mvpFumbleWeight')) || 0,
                damagePer10: Number(game.settings.get(MODULE.ID, 'mvpDamagePer10Weight')) || 0,
                healingPer10: Number(game.settings.get(MODULE.ID, 'mvpHealingPer10Weight')) || 0,
                kills: Number(game.settings.get(MODULE.ID, 'mvpKillWeight')) || 0
            }
        };
    }

    static _computeMvpMaxima(componentsList = []) {
        const maxima = { offenseCount: 0, hits: 0, misses: 0, crits: 0, fumbles: 0, damage: 0, healing: 0, kills: 0 };
        for (const c of componentsList) {
            const hits = Number(c?.hits) || 0;
            const offenseCount = Number.isFinite(Number(c?.offenseCount)) ? (Number(c?.offenseCount) || 0) : hits;
            const attempts = Number(c?.attempts) || 0;
            const misses = Number.isFinite(Number(c?.misses))
                ? (Number(c?.misses) || 0)
                : Math.max(0, attempts - hits);
            const kills = Number(c?.kills) || 0;

            maxima.offenseCount = Math.max(maxima.offenseCount, offenseCount);
            maxima.hits = Math.max(maxima.hits, hits);
            maxima.misses = Math.max(maxima.misses, misses);
            maxima.crits = Math.max(maxima.crits, Number(c?.crits) || 0);
            maxima.fumbles = Math.max(maxima.fumbles, Number(c?.fumbles) || 0);
            maxima.damage = Math.max(maxima.damage, Number(c?.damage) || 0);
            maxima.healing = Math.max(maxima.healing, Number(c?.healing) || 0);
            maxima.kills = Math.max(maxima.kills, kills);
        }
        return maxima;
    }

    static _computeMvpScore(
        { offenseCount = null, hits = 0, misses = null, attempts = 0, crits = 0, fumbles = 0, damage = 0, healing = 0, kills = 0 },
        maxima = null,
        tuning = null
    ) {
        const t = tuning || CombatMvp._getMvpTuningSettings();
        const w = t.weights;

        const useNormalization = !!t.normalizeByPartyMax && maxima && typeof maxima === 'object';

        const safeRatio = (value, max) => {
            const v = Number(value) || 0;
            const m = Number(max) || 0;
            if (m <= 0) return 0;
            return v / m;
        };

        const missesValue = Number.isFinite(Number(misses))
            ? (Number(misses) || 0)
            : Math.max(0, (Number(attempts) || 0) - (Number(hits) || 0));
        
        // MVP "hit lane" is actually "successful offense count" so save-based casters can compete fairly.
        // Raw hits remain tracked separately for accuracy/miss context.
        const offenseValue = Number.isFinite(Number(offenseCount))
            ? (Number(offenseCount) || 0)
            : (Number(hits) || 0);

        let score = 0;
        const breakdown = {
            offense: 0,
            misses: 0,
            crits: 0,
            fumbles: 0,
            damage: 0,
            healing: 0,
            kills: 0
        };

        if (useNormalization) {
            // Normalize each component by the party's best value (max) for this round/combat.
            breakdown.offense = w.hit * safeRatio(offenseValue, maxima.offenseCount ?? maxima.hits);
            breakdown.misses = w.miss * safeRatio(missesValue, maxima.misses);
            breakdown.crits = w.crit * safeRatio(crits, maxima.crits);
            breakdown.fumbles = w.fumble * safeRatio(fumbles, maxima.fumbles);
            breakdown.damage = w.damagePer10 * safeRatio(damage, maxima.damage);
            breakdown.healing = w.healingPer10 * safeRatio(healing, maxima.healing);
            breakdown.kills = w.kills * safeRatio(kills, maxima.kills);
            score = breakdown.offense + breakdown.misses + breakdown.crits + breakdown.fumbles + breakdown.damage + breakdown.healing + breakdown.kills;
        } else {
            // Raw mode: damage/healing are weighted per 10 points to keep slider ranges meaningful.
            breakdown.offense = w.hit * offenseValue;
            breakdown.misses = w.miss * missesValue;
            breakdown.crits = w.crit * (Number(crits) || 0);
            breakdown.fumbles = w.fumble * (Number(fumbles) || 0);
            breakdown.damage = w.damagePer10 * ((Number(damage) || 0) / 10);
            breakdown.healing = w.healingPer10 * ((Number(healing) || 0) / 10);
            breakdown.kills = w.kills * (Number(kills) || 0);
            score = breakdown.offense + breakdown.misses + breakdown.crits + breakdown.fumbles + breakdown.damage + breakdown.healing + breakdown.kills;
        }

        // Store breakdown for debugging (only log if we have a name context)
        if (typeof CombatMvp._lastMvpCalculationName !== 'undefined') {
            postConsoleAndNotification(MODULE.NAME, `MVP - Score Breakdown (${CombatMvp._lastMvpCalculationName}):`, {
                rawStats: { offenseCount: offenseValue, hits, misses: missesValue, crits, fumbles, damage, healing, kills },
                maxima: useNormalization ? maxima : null,
                weights: w,
                breakdown,
                total: Number(score.toFixed(1)),
                normalized: useNormalization
            }, true, false);
        }

        return Number(score.toFixed(1));
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
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error getting actor from UUID', error, false, false);
            return null;
        }
    }

    // Helper method to calculate MVP score
    static async _calculateMVPScore(stats, maxima = null, tuning = null) {
        // Skip anything that is not party. Summons reach this point like anyone else in the
        // participant list, and would otherwise score and rank against the characters.
        const actor = await CombatMvp._getActorFromUuid(stats.uuid);
        if (!isPlayerCharacter(actor)) return -1;

        // Set name context for breakdown logging
        CombatMvp._lastMvpCalculationName = actor.name;
        const score = CombatMvp._computeMvpScore({
            offenseCount: stats.successfulOffenseCount,
            hits: stats.combat?.attacks?.hits || 0,
            misses: stats.combat?.attacks?.misses || 0,
            attempts: stats.combat?.attacks?.attempts || 0,
            crits: stats.combat?.attacks?.crits || 0,
            fumbles: stats.combat?.attacks?.fumbles || 0,
            damage: stats.damage?.dealt || 0,
            healing: stats.healing?.given || 0,
            kills: stats.kills || 0
        }, maxima, tuning);
        CombatMvp._lastMvpCalculationName = undefined;
        return score;
    }

    // Helper method to calculate MVP
    static async _calculateMVP(playerCharacters) {
        if (!playerCharacters?.length) {
            postConsoleAndNotification(MODULE.NAME, 'MVP - No Players:', { message: 'No player characters for MVP calculation' }, true, false);
            return null;
        }

        postConsoleAndNotification(MODULE.NAME, 'MVP - Starting Calculation:', { playerCharacters }, true, false);

        const mvpTuning = CombatMvp._getMvpTuningSettings();
        const rawStats = playerCharacters.map(detail => ({
            offenseCount: Number.isFinite(Number(detail.successfulOffenseCount))
                ? (Number(detail.successfulOffenseCount) || 0)
                : (detail.combat?.attacks?.hits || 0),
            hits: detail.combat?.attacks?.hits || 0,
            misses: detail.combat?.attacks?.misses || 0,
            attempts: detail.combat?.attacks?.attempts || 0,
            crits: detail.combat?.attacks?.crits || 0,
            fumbles: detail.combat?.attacks?.fumbles || 0,
            damage: detail.damage?.dealt || 0,
            healing: detail.healing?.given || 0,
            kills: detail.kills || 0
        }));
        const mvpMaxima = CombatMvp._computeMvpMaxima(rawStats);

        postConsoleAndNotification(MODULE.NAME, 'MVP - Maxima and Tuning:', {
            maxima: mvpMaxima,
            tuning: mvpTuning,
            rawStats: rawStats.map((stats, idx) => ({
                name: playerCharacters[idx]?.name || 'Unknown',
                ...stats
            }))
        }, true, false);

        // Process each character asynchronously
        const mvpCandidates = await Promise.all(playerCharacters.map(async (detail) => {
            const score = await CombatMvp._calculateMVPScore(detail, mvpMaxima, mvpTuning);
            
            if (score <= 0) return null;

            // Get actor from UUID for portrait
            const actor = await CombatMvp._getActorFromUuid(detail.uuid);
            if (!actor) return null;

            postConsoleAndNotification(MODULE.NAME, 'MVP - Processing Character:', {
                name: actor.name,
                score,
                stats: {
                    combat: detail.combat,
                    damage: detail.damage,
                    healing: detail.healing
                }
            }, true, false);

            // Generate MVP description + theme
            const { description, themeLabel, themeKey } = MVPDescriptionGenerator.generateDescription(detail, {
                actorId: actor.id,
                name: actor.name,
                maxima: mvpMaxima,
                tuning: mvpTuning
            });

            postConsoleAndNotification(MODULE.NAME, 'MVP - Generated Description:', {
                name: actor.name,
                description,
                score
            }, true, false);

            return {
                ...detail,
                score,
                description,
                themeLabel,
                themeKey,
                name: actor.name,
                tokenImg: actor.img
            };
        }));

        // Filter out null entries and find the highest score
        const validCandidates = mvpCandidates
            .filter(c => c !== null)
            .map(c => {
                const offenseCount = Number.isFinite(Number(c?.successfulOffenseCount))
                    ? (Number(c.successfulOffenseCount) || 0)
                    : (Number(c?.combat?.attacks?.hits) || 0);
                const damageDealt = Number(c?.damage?.dealt) || 0;
                const healingGiven = Number(c?.healing?.given) || 0;
                const kills = Number(c?.kills) || 0;
                return {
                    ...c,
                    _tiebreak: {
                        offenseCount,
                        impact: damageDealt + healingGiven,
                        kills
                    }
                };
            })
            .sort((a, b) => {
                // 1) highest normalized total (score)
                const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
                if (scoreDiff !== 0) return scoreDiff;
                
                // 2) highest raw successfulOffenseCount
                const offDiff = (Number(b?._tiebreak?.offenseCount) || 0) - (Number(a?._tiebreak?.offenseCount) || 0);
                if (offDiff !== 0) return offDiff;
                
                // 3) highest raw (damage + healing)
                const impactDiff = (Number(b?._tiebreak?.impact) || 0) - (Number(a?._tiebreak?.impact) || 0);
                if (impactDiff !== 0) return impactDiff;
                
                // 4) highest raw kills
                const killDiff = (Number(b?._tiebreak?.kills) || 0) - (Number(a?._tiebreak?.kills) || 0);
                if (killDiff !== 0) return killDiff;
                
                // 5) deterministic seeded tie-break (round + combat id + actor id)
                const seedBase = `${game.combat?.id || 'no-combat'}:${game.combat?.round || 0}`;
                const hash = (s) => {
                    let h = 2166136261;
                    for (let i = 0; i < s.length; i++) {
                        h ^= s.charCodeAt(i);
                        h = Math.imul(h, 16777619);
                    }
                    return h >>> 0;
                };
                const aId = String(a?.uuid || a?.actorId || a?.name || '');
                const bId = String(b?.uuid || b?.actorId || b?.name || '');
                const aRand = hash(`${seedBase}:${aId}`);
                const bRand = hash(`${seedBase}:${bId}`);
                return bRand - aRand;
            });
        const topCandidate = validCandidates.length ? validCandidates[0] : null;

        postConsoleAndNotification(MODULE.NAME, 'MVP - Final Selection:', {
            selectedMVP: topCandidate?.name,
            score: topCandidate?.score,
            description: topCandidate?.description,
            tieBreaker: topCandidate?._tiebreak || null,
            allCandidates: validCandidates.map(c => ({
                name: c.name,
                score: c.score,
                description: c.description,
                tieBreaker: c?._tiebreak || null
            }))
        }, true, false);

        return {
            mvp: topCandidate,
            rankings: validCandidates
        };
    }

}

// ************************************
// ** CLASS MVPDescriptionGenerator
// ************************************
// Generates descriptions for MVPs based on combat stats.

export class MVPDescriptionGenerator {
    static THEMES = {
        healer: { label: 'Clutch Healer', templatesKey: 'healerTemplates' },
        executioner: { label: 'Executioner', templatesKey: 'executionerTemplates' },
        sharpshooter: { label: 'Sharpshooter', templatesKey: 'sharpshooterTemplates' },
        critArtist: { label: 'Crit Artist', templatesKey: 'critArtistTemplates' },
        workhorse: { label: 'Workhorse', templatesKey: 'workhorseTemplates' },
        battleMedic: { label: 'Battle Medic', templatesKey: 'battleMedicTemplates' },
        chaosMvp: { label: 'Still MVP Somehow', templatesKey: 'chaosMvpTemplates' },
        allRounder: { label: 'All‑Rounder', templatesKey: 'allRounderTemplates' },
        noMvp: { label: 'No MVP', templatesKey: 'noMvpTemplates' }
    };

    static _pickRandom(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    static _sanitizeName(value) {
        const v = String(value || '').trim();
        if (!v) return null;
        if (v.toLowerCase() === 'unknown') return null;
        return v;
    }

    static _calculateStats(rawStats) {
        const combat = rawStats?.combat || {};
        const attacks = combat?.attacks || {};
        const damage = rawStats?.damage || {};
        const healing = rawStats?.healing || {};

        const hits = Number(attacks.hits) || 0;
        const attempts = Number(attacks.attempts) || 0;
        const misses = Number.isFinite(Number(attacks.misses))
            ? (Number(attacks.misses) || 0)
            : Math.max(0, attempts - hits);
        const crits = Number(attacks.crits) || 0;
        const fumbles = Number(attacks.fumbles) || 0;

        const damageDealt = Number(damage.dealt) || 0;
        const healingGiven = Number(healing.given) || 0;
        const kills = Number(rawStats?.kills) || 0;

        const accuracy = attempts > 0 ? Math.round((hits / attempts) * 100) : 0;

        return {
            hits,
            misses,
            attempts,
            accuracy,
            crits,
            fumbles,
            damage: damageDealt,
            healing: healingGiven,
            kills
        };
    }

    static _computeContributions(stats, maxima, tuning) {
        const t = tuning || CombatMvp._getMvpTuningSettings();
        const w = t.weights;
        const useNormalization = !!t.normalizeByPartyMax && maxima && typeof maxima === 'object';

        const safeRatio = (value, max) => {
            const v = Number(value) || 0;
            const m = Number(max) || 0;
            if (m <= 0) return 0;
            return v / m;
        };

        if (useNormalization) {
            return {
                hits: w.hit * safeRatio(stats.hits, maxima.hits),
                misses: w.miss * safeRatio(stats.misses, maxima.misses),
                crits: w.crit * safeRatio(stats.crits, maxima.crits),
                fumbles: w.fumble * safeRatio(stats.fumbles, maxima.fumbles),
                damage: w.damagePer10 * safeRatio(stats.damage, maxima.damage),
                healing: w.healingPer10 * safeRatio(stats.healing, maxima.healing),
                kills: w.kills * safeRatio(stats.kills, maxima.kills)
            };
        }

        return {
            hits: w.hit * stats.hits,
            misses: w.miss * stats.misses,
            crits: w.crit * stats.crits,
            fumbles: w.fumble * stats.fumbles,
            damage: w.damagePer10 * (stats.damage / 10),
            healing: w.healingPer10 * (stats.healing / 10),
            kills: w.kills * stats.kills
        };
    }

    static _chooseTheme(stats, contributions) {
        const hasAnyActivity =
            stats.attempts > 0 ||
            stats.damage > 0 ||
            stats.healing > 0 ||
            stats.crits > 0 ||
            stats.fumbles > 0;

        if (!hasAnyActivity) return 'noMvp';

        const noMisses = stats.attempts > 0 && stats.misses === 0;
        const accuracyHigh = stats.accuracy >= 90;

        // If the MVP won while visibly stumbling, lean into the juxtaposition.
        const chaosCandidate = (stats.fumbles > 0) || (stats.misses >= 3);
        if (chaosCandidate) return 'chaosMvp';

        // Primary reason selection uses positive contributions where possible.
        const positives = [
            { k: 'healing', v: contributions.healing },
            { k: 'damage', v: contributions.damage },
            { k: 'crits', v: contributions.crits },
            { k: 'hits', v: contributions.hits }
        ].filter(e => typeof e.v === 'number' && e.v > 0)
         .sort((a, b) => b.v - a.v);

        const top = positives[0]?.k || null;
        const second = positives[1]?.k || null;

        // Healer / Hybrid
        if (top === 'healing') {
            if (stats.damage > 0 && second === 'damage') return 'battleMedic';
            return 'healer';
        }
        if (top === 'damage') {
            if (stats.healing > 0 && second === 'healing') return 'battleMedic';
            return 'executioner';
        }
        if (top === 'crits') return 'critArtist';

        // Accuracy-driven MVP (especially with miss penalty settings)
        if ((accuracyHigh || noMisses) && stats.hits > 0) return 'sharpshooter';

        // Volume-driven MVP
        if (stats.attempts >= 5 || stats.hits >= 3) return 'workhorse';

        return 'allRounder';
    }

    static _extractBestHitMoment(actorId, rawStats, topHits) {
        const aid = String(actorId || '').trim();
        const candidates = [];

        if (Array.isArray(rawStats?.hits) && aid) {
            for (const h of rawStats.hits) {
                if (!h) continue;
                if (String(h.attackerId || '') !== aid) continue;
                const amount = Number(h.amount) || 0;
                if (amount <= 0) continue;
                candidates.push({
                    amount,
                    foe: this._sanitizeName(h.targetName || h.target),
                    weapon: this._sanitizeName(h.weapon || h.weaponName || h.itemName)
                });
            }
        }

        if (Array.isArray(topHits) && aid) {
            for (const h of topHits) {
                if (!h) continue;
                if (String(h.attackerId || '') !== aid) continue;
                const amount = Number(h.amount) || 0;
                if (amount <= 0) continue;
                candidates.push({
                    amount,
                    foe: this._sanitizeName(h.target),
                    weapon: this._sanitizeName(h.weapon)
                });
            }
        }

        if (!candidates.length) return null;
        candidates.sort((a, b) => b.amount - a.amount);
        return candidates[0];
    }

    static _extractBestHealMoment(actorId, topHeals) {
        const aid = String(actorId || '').trim();
        if (!Array.isArray(topHeals) || !aid) return null;

        const candidates = [];
        for (const h of topHeals) {
            if (!h) continue;
            if (String(h.healerId || '') !== aid) continue;
            const amount = Number(h.amount) || 0;
            if (amount <= 0) continue;
            candidates.push({
                amount,
                foe: this._sanitizeName(h.target), // "foe" placeholder is used as "target" in healer lines
                weapon: null
            });
        }

        if (!candidates.length) return null;
        candidates.sort((a, b) => b.amount - a.amount);
        return candidates[0];
    }

    static _renderTemplate(template, tokens) {
        if (!template) return '';

        const parts = String(template).split('||').map(p => p.trim()).filter(Boolean);

        const has = (key) => {
            switch (key) {
                case 'foe': return !!tokens.foe;
                case 'weapon': return !!tokens.weapon;
                case 'noMisses': return (Number(tokens.attempts) || 0) > 0 && (Number(tokens.misses) || 0) === 0;
                case 'accuracyHigh': return (Number(tokens.accuracy) || 0) >= 90;
                default: return (Number(tokens[key]) || 0) > 0;
            }
        };

        const includePart = (part) => {
            if (!part.startsWith('[')) return true;
            const idx = part.indexOf(']');
            if (idx <= 1) return true;
            const cond = part.slice(1, idx).trim();
            if (!cond) return true;

            const ands = cond.split('+').map(s => s.trim()).filter(Boolean);
            return ands.every(has);
        };

        const stripCond = (part) => {
            if (!part.startsWith('[')) return part;
            const idx = part.indexOf(']');
            if (idx === -1) return part;
            return part.slice(idx + 1).trim();
        };

        const chosen = parts.filter(includePart).map(stripCond).filter(Boolean);
        const sentence = chosen.join(' ').replace(/\s+/g, ' ').trim();

        return sentence.replace(/{(\w+)}/g, (match, key) => {
            if (key === 'name') return String(tokens.name || 'Someone');
            if (key === 'foe') return String(tokens.foe || '');
            if (key === 'weapon') return String(tokens.weapon || '');
            if (key === 'damage' || key === 'healing') return (Number(tokens[key]) || 0).toLocaleString();
            return String(tokens[key] ?? '');
        }).replace(/\s+/g, ' ').trim();
    }

    static generateDescription(rawStats, {
        actorId = null,
        name = null,
        maxima = null,
        tuning = null,
        topHits = null,
        topHeals = null
    } = {}) {
        const stats = this._calculateStats(rawStats);
        const contributions = this._computeContributions(stats, maxima, tuning);
        const themeKey = this._chooseTheme(stats, contributions);

        const theme = this.THEMES[themeKey] || this.THEMES.allRounder;

        const moment = (() => {
            if (themeKey === 'healer' || themeKey === 'battleMedic') {
                return this._extractBestHealMoment(actorId, topHeals) || this._extractBestHitMoment(actorId, rawStats, topHits);
            }
            return this._extractBestHitMoment(actorId, rawStats, topHits) || this._extractBestHealMoment(actorId, topHeals);
        })() || {};

        const mvp = assetLookup?.mvpTemplates ?? {};
        const template =
            this._pickRandom(mvp[theme.templatesKey]) || this._pickRandom(mvp.noMvpTemplates) || '';

        const description = this._renderTemplate(template, {
            name: name || rawStats?.name || 'Someone',
            foe: moment.foe,
            weapon: moment.weapon,
            hits: stats.hits,
            misses: stats.misses,
            attempts: stats.attempts,
            accuracy: stats.accuracy,
            crits: stats.crits,
            fumbles: stats.fumbles,
            damage: stats.damage,
            healing: stats.healing,
            kills: stats.kills
        });

        return {
            description,
            themeKey,
            themeLabel: theme.label
        };
    }
} 
