import { MVPTemplates } from './mvp-templates.js';
import { postConsoleAndNotification } from './global.js';

export class MVPDescriptionGenerator {
    static THRESHOLDS = {
        COMBAT_EXCELLENCE: {
            accuracy: 75,
            hits: 2,
            crits: 1
        },
        DAMAGE_FOCUS: {
            damage: 5,
            hits: 1
        },
        PRECISION: {
            accuracy: 90,
            hits: 1
        },
        MIXED: {
            fumbles: 1,
            damage: 5
        }
    };

    static calculateStats(rawStats) {
        return {
            hits: rawStats.combat.attacks.hits,
            attempts: rawStats.combat.attacks.attempts,
            accuracy: Math.round((rawStats.combat.attacks.hits / rawStats.combat.attacks.attempts) * 100) || 0,
            damage: rawStats.damage.dealt,
            crits: rawStats.combat.attacks.crits,
            healing: rawStats.healing.given,
            fumbles: rawStats.combat.attacks.fumbles
        };
    }

    static determinePattern(stats) {
        const accuracy = (stats.hits / stats.attempts) * 100;

        // Combat Excellence: High accuracy + crits + multiple hits
        if (accuracy >= this.THRESHOLDS.COMBAT_EXCELLENCE.accuracy && 
            stats.hits >= this.THRESHOLDS.COMBAT_EXCELLENCE.hits &&
            stats.crits >= this.THRESHOLDS.COMBAT_EXCELLENCE.crits) {
            return 'combatExcellence';
        }
        
        // Damage Focus: High damage output
        if (stats.damage >= this.THRESHOLDS.DAMAGE_FOCUS.damage &&
            stats.hits >= this.THRESHOLDS.DAMAGE_FOCUS.hits) {
            return 'damage';
        }

        // Precision: Very high accuracy
        if (accuracy >= this.THRESHOLDS.PRECISION.accuracy &&
            stats.hits >= this.THRESHOLDS.PRECISION.hits) {
            return 'precision';
        }

        // Mixed: Has fumbles but still contributed
        if (stats.fumbles >= this.THRESHOLDS.MIXED.fumbles &&
            stats.damage >= this.THRESHOLDS.MIXED.damage) {
            return 'mixed';
        }

        return null; // No pattern matches - will trigger "no MVP" message
    }

    static getRandomTemplate(pattern) {
        const templates = pattern ? MVPTemplates[`${pattern}Templates`] : MVPTemplates.noMVPTemplates;
        return templates[Math.floor(Math.random() * templates.length)];
    }

    static formatDescription(template, stats) {
        return template.replace(/{(\w+)}/g, (match, stat) => {
            // Handle special formatting
            if (stat === 'accuracy') {
                return `${stats[stat]}%`;
            }
            if (stat === 'damage' || stat === 'healing') {
                return stats[stat].toLocaleString();
            }
            return stats[stat]?.toString() || '0';
        });
    }

    static generateDescription(rawStats) {
        // Calculate derived stats
        const stats = this.calculateStats(rawStats);
        
        postConsoleAndNotification("MVP Description - Processing:", {
            rawStats,
            calculatedStats: stats
        }, false, true, false);
        
        // Determine which pattern to use
        const pattern = this.determinePattern(stats);
        
        // Get a random template
        const template = this.getRandomTemplate(pattern);
        
        // Format the description with actual values
        const description = this.formatDescription(template, stats);
        
        postConsoleAndNotification("MVP Description - Result:", {
            pattern,
            description
        }, false, true, false);
        
        return description;
    }

} 