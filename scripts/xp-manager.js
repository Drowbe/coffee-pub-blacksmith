// ================================================================== 
// ===== XP MANAGER =================================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, playSound } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { registerWindow } from './api-windows.js';
import { ChatCardsAPI } from './api-chat-cards.js';
import { AdversaryRecord, getAdversaryRecord, ADVERSARY_FLAG_PATH } from './stats-adversaries.js';

/** Registry id for the XP Distribution window. */
export const XP_WINDOW_ID = 'blacksmith-xp';

/** Header icon per monster resolution, as the XP card renders it. */
const RESOLUTION_ICONS = Object.freeze({
    DEFEATED: 'fas fa-skull',
    NEGOTIATED: 'fas fa-people-arrows',
    ESCAPED: 'fas fa-running',
    IGNORED: 'fas fa-person-walking-arrow-loop-left',
    CAPTURED: 'fas fa-person-praying'
});

export class XpManager {
    // Standard D&D 5e CR to XP mapping (using decimal keys for math operations)
    static CR_TO_XP = {
        0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
        5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
        13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
        21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000,
        29: 135000, 30: 155000
    };

    // Resolution type XP multipliers
    static RESOLUTION_XP_MULTIPLIERS = {
        DEFEATED: 1.0,      // Full XP
        NEGOTIATED: 1.0,    // Full XP for diplomatic success
        ESCAPED: 0.5,        // Half XP
        IGNORED: 0.0,        // No XP
        CAPTURED: 1.0,       // Full XP for tactical success
        REMOVED: 0.0         // No XP - monster excluded from distribution
    };

    // Party size multipliers (D&D 5e standard)
    static PARTY_SIZE_MULTIPLIERS = {
        1: 1, 2: 1.5, 3: 2, 4: 2.5, 5: 2, 6: 1.5, 7: 1.25, 8: 1
    };

    static initialize() {
        // Register deleteCombat hook for XP distribution
        const deleteCombatHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'XP Manager: Handle combat end and trigger XP distribution',
            context: 'xp-manager-combat-end',
            priority: 3, // Normal priority - XP processing
            callback: this._onCombatEnd.bind(this)
        });

        // Register combatRound hook for round tracking
        const combatRoundHookId = HookManager.registerHook({
            name: 'combatRound',
            description: 'XP Manager: Track combat rounds for XP calculations',
            context: 'xp-manager-combat-round',
            priority: 3, // Normal priority - round tracking
            callback: this._onCombatRound.bind(this)
        });

        // Register combatTurn hook for turn tracking
        const combatTurnHookId = HookManager.registerHook({
            name: 'combatTurn',
            description: 'XP Manager: Track combat turns for XP calculations',
            context: 'xp-manager-combat-turn',
            priority: 3, // Normal priority - turn tracking
            callback: this._onCombatTurn.bind(this)
        });

        // Log hook registrations
        // Record what happens to each adversary AS IT HAPPENS, so resolution does not have to be
        // re-derived from live documents at award time. See stats-adversaries.js for why.
        //
        // preDeleteToken, not deleteToken: afterwards the token is gone, Combatant#actor falls back
        // to the base prototype, and the hit points this exists to preserve are unrecoverable.
        const preDeleteTokenHookId = HookManager.registerHook({
            name: 'preDeleteToken',
            description: 'XP Manager: preserve adversary evidence before a token is destroyed',
            context: 'xp-manager-adversary-record',
            priority: 2,
            callback: (tokenDocument) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Deliberately not awaited: a pre-hook returning a promise does not delay the
                // delete, and returning a non-undefined value from a pre* hook can cancel it.
                AdversaryRecord.captureForToken(tokenDocument);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // A GM toggling a corpse out of the tracker deletes the combatant outright, which is the one
        // action that loses the row entirely rather than just its resolution.
        const preDeleteCombatantHookId = HookManager.registerHook({
            name: 'preDeleteCombatant',
            description: 'XP Manager: preserve adversary evidence before a combatant is removed',
            context: 'xp-manager-adversary-record',
            priority: 2,
            callback: (combatant) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                AdversaryRecord.capture(combatant);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // A sweep each round catches everything the two targeted hooks cannot: damage taken, a GM
        // marking something defeated, a combatant added mid-fight.
        const adversarySweepHookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'XP Manager: refresh adversary evidence as the fight progresses',
            context: 'xp-manager-adversary-record',
            priority: 3,
            callback: (combat, changed) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Our own flag write updates the Combat, which fires this hook. Recognising it and
                // returning avoids a pointless round trip; the no-op guard inside the record is what
                // actually makes the cycle terminate. Both, because relying on either alone means
                // one edit away from a write loop.
                if (changed && foundry.utils.hasProperty(changed, ADVERSARY_FLAG_PATH)) return;
                AdversaryRecord.captureAll(combat);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        postConsoleAndNotification(MODULE.NAME, "Hook Manager | deleteCombat", "xp-manager-combat-end", true, false);
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | combatRound", "xp-manager-combat-round", true, false);
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | combatTurn", "xp-manager-combat-turn", true, false);

        // Register Handlebars helper for prettifying resolution types
        if (typeof Handlebars !== 'undefined') {
            Handlebars.registerHelper('prettifyResolution', function(resolution) {
                if (!resolution || typeof resolution !== 'string') return resolution;
                return resolution.charAt(0).toUpperCase() + resolution.slice(1).toLowerCase();
            });
        }

        // Register Handlebars helper for formatting XP multipliers
        Handlebars.registerHelper('formatMultiplier', function(multiplier) {
            if (typeof multiplier !== 'number') return '0.00';
            return multiplier.toFixed(2);
        });

        // Make the window openable by id from any module or macro.
        registerWindow(XP_WINDOW_ID, {
            moduleId: MODULE.ID,
            title: 'XP Distribution',
            open: async () => XpManager.openXpDistributionWindow()
        });
    }

    /**
     * Handle combat deletion and trigger XP distribution
     */
    static async _onCombatEnd(combat, options, userId) {
        if (!game.user.isGM) {
            return;
        }
        
        // Check if XP distribution is enabled
        const isEnabled = game.settings.get(MODULE.ID, 'enableXpDistribution');
        if (!isEnabled) {
            return;
        }

        // Wait a moment for combat to fully end
        setTimeout(async () => {
            await this.showXpDistributionWindow(combat);
        }, 1000);
    }

    /**
     * Show the XP distribution window
     */
    static async showXpDistributionWindow(combat) {
        const xpData = await this.calculateXpData(combat);
        
        postConsoleAndNotification(MODULE.NAME, 'XP data calculated', { 
            totalXp: xpData.totalXp, 
            monsters: xpData.monsters.length, 
            players: xpData.players.length 
        }, true, false);
        
        // Check if auto-distribute is enabled
        const autoDistribute = game.settings.get(MODULE.ID, 'autoDistributeXp');
        if (autoDistribute) {
            // Auto-distribute without showing the window
            await this.autoDistributeXp(xpData);
            return;
        }
        
        // Create and show the XP distribution window
        const xpWindow = new XpDistributionWindow(xpData);
        xpWindow.render(true);
    }

    /**
     * Automatically distribute XP without showing the window
     * This mimics clicking the distribute button with default values
     */
    static async autoDistributeXp(xpData) {
        try {
            // Initialize milestone data with defaults (if milestone mode is active)
            if (!xpData.milestoneData) {
                xpData.milestoneData = {
                    category: 'narrative',
                    title: '',
                    description: '',
                    xpAmount: '0'
                };
            }
            
            // Reset adjustments to the default state, but keep each player's inclusion —
            // calculateXpData defaults it to combat participation, same as the window's toggles
            xpData.players = xpData.players.map(player => ({
                ...player,
                included: player.included !== false,
                adjustment: 0,  // No adjustments by default
                adjustmentSign: '+',
                signedAdjustment: 0,
                calculatedXp: 0, // Will be calculated
                finalXp: 0       // Will be calculated
            }));
            
            // Create a temporary window instance to use its calculation methods
            // We won't render it, just use it for calculations
            const tempWindow = new XpDistributionWindow(xpData);
            
            // Update XP calculations (this sets xpPerPlayer and combinedXp)
            tempWindow.updateXpCalculations();
            
            // Calculate final XP for each included player (no adjustments); excluded players get 0
            xpData.players = xpData.players.map(player => {
                const finalXp = player.included
                    ? Math.max(0, xpData.xpPerPlayer + (player.signedAdjustment || 0))
                    : 0;
                return {
                    ...player,
                    calculatedXp: finalXp,
                    finalXp: finalXp
                };
            });
            
            // Apply XP to players
            const results = await this.applyXpToPlayersFromData(xpData);
            
            // Post results to chat
            await this.postXpResults(xpData, results);
            
            // Create notification message based on active modes
            let modeText = [];
            if (xpData.modeExperiencePoints) modeText.push('Experience Points');
            if (xpData.modeMilestone) modeText.push('Milestones');
            const modeString = modeText.length > 0 ? ` (${modeText.join(' + ')})` : '';
            
            ui.notifications.info(`XP distributed automatically! Total XP: ${xpData.combinedXp}${modeString}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error auto-distributing XP', error, false, true);
            ui.notifications.error(`Error auto-distributing XP: ${error.message}`);
        }
    }

    /**
     * Open the XP Distribution window.
     *
     * Reached from the menubar tool and, through the window registry, from any module as
     * `openWindow('blacksmith-xp')`.
     *
     * @returns {XpDistributionWindow|undefined}
     */
    static openXpDistributionWindow() {
        try {
            // Raise rather than rebuild. The window is a working surface -- the GM toggles
            // players and adversaries in and out of the award -- so recomputing on a second
            // open would silently discard whatever they had set up.
            if (XpDistributionWindow.activeWindow) {
                XpDistributionWindow.activeWindow.bringToFront?.();
                return XpDistributionWindow.activeWindow;
            }

            // Check if there's an active combat
            const combat = game.combat;
            const hasCombat = combat && combat.started;
            
            // Create XP data based on whether there's combat or not
            const players = this.loadPartyMembers();
            let monsters = [];
            
            if (hasCombat) {
                // Shaped, not raw. The window renders cr/baseXp/multiplier/finalXp;
                // handing it Combatants gave it none of those.
                monsters = this.buildMonsterRows(this.getCombatMonsters(combat), combat);
            } else {
                // No active combat: this shows what is ON THE CANVAS, not what was fought. A corpse
                // that was looted and cleared during the fight is simply absent, and anything
                // wandered in since is present. Say so rather than presenting the scene as the
                // encounter -- awarding at combat end reads the recorded adversaries and is correct;
                // this path is best-effort by nature.
                monsters = this.getCanvasMonsters();
                postConsoleAndNotification(MODULE.NAME, 'XP: no active combat -- listing canvas tokens rather than a recorded encounter', '', false, false);
            }
            
            const xpData = {
                modeExperiencePoints: hasCombat,  // Experience Points on if combat, off if no combat
                modeMilestone: !hasCombat,        // Milestones off if combat, on if no combat
                milestoneXp: 0,
                milestoneData: {
                    category: 'narrative',
                    title: '',
                    description: '',
                    xpAmount: '0'
                },
                monsters: monsters,
                players: players,
                partySize: players.length,
                partyMultiplier: 1,   // Default party multiplier
                totalXp: 0,           // Will be calculated
                adjustedTotalXp: 0,   // Will be calculated
                combinedXp: 0,        // Will be calculated by updateXpCalculations
                xpPerPlayer: 0        // Will be calculated by updateXpCalculations
            };
            
            
            // Create and show the XP distribution window
            const xpWindow = new XpDistributionWindow(xpData);
            XpDistributionWindow.activeWindow = xpWindow;
            xpWindow.render(true);

            // Ensure calculations are performed after window is created
            xpWindow.updateXpCalculations();
            return xpWindow;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error opening XP Distribution window", error, false, false);
            ui.notifications.error("Failed to open XP Distribution window");
        }
    }

    /**
     * Calculate XP data for the combat
     */
    static async calculateXpData(combat) {
        const monsters = this.getCombatMonsters(combat);
        const players = this.loadPartyMembers();

        // The whole party is listed, but only actual combat participants default to
        // included — the GM can still toggle anyone in from the window.
        const combatantActorIds = new Set(
            combat.combatants
                .filter(c => c.actor && (c.actor.hasPlayerOwner || c.actor.type === 'character'))
                .map(c => c.actor.id)
        );
        for (const player of players) {
            player.included = combatantActorIds.has(player.actorId);
        }

        const partySizeHandling = game.settings.get(MODULE.ID, 'xpPartySizeHandling');

        // Calculate monster XP data
            const partySizeMultipliers = this.getPartySizeMultipliers();

        const monsterXpData = this.buildMonsterRows(monsters, combat);

        const monsterXp = monsterXpData.reduce((sum, monster) => sum + monster.finalXp, 0);
            // Size the distribution by who is actually included, matching the toggles the window opens with
            const partySize = players.filter(p => p.included).length;
        let partyMultiplier = 1;
        
            if (partySizeHandling === 'multipliers') {
                partyMultiplier = partySizeMultipliers[partySize] || 1;
        }
        
        const adjustedMonsterXp = Math.floor(monsterXp * partyMultiplier);

        return {
            combat: combat,
            monsters: monsterXpData,
            players: players,
            totalXp: monsterXp,
            adjustedTotalXp: adjustedMonsterXp,
            xpPerPlayer: 0, // Will be calculated based on active modes
            partySize: partySize,
            partyMultiplier: partyMultiplier,
            modeExperiencePoints: true, // Default to Experience Points mode
            modeMilestone: false, // Default to Milestone mode off
            milestoneXp: 0, // Milestone XP will be set when milestone mode is active
            combinedXp: adjustedMonsterXp // Combined XP from both modes
        };
    }

    /**
     * Calculate XP needed for a player to reach their next level
     */
    static getXpToNextLevel(actor) {
        const currentLevel = actor.system.details.level || 1;
        const currentXp = actor.system.details.xp || 0;
        const nextLevel = currentLevel + 1;
        const xpForNextLevel = this.getXpForLevel(nextLevel);
        return Math.max(0, xpForNextLevel - currentXp);
    }

    /**
     * Calculate milestone XP based on mode and settings
     */


    /**
     * Get all monsters from the combat
     */
    /**
     * Shape combatants into the rows the XP window renders.
     *
     * `getCombatMonsters` returns raw Combatants, which carry `name` and nothing
     * else this window needs. Handed straight to the window they rendered as a
     * blank CR, an empty base XP, and an `undefined` finalXp -- and one undefined
     * in the finalXp sum makes the total NaN, which is what put NaN in Per Player
     * and every player row. The shaping used to exist only inside
     * calculateXpDistribution, so the window path silently skipped it.
     *
     * @param {Combatant[]} combatants
     * @param {Combat} combat
     * @returns {object[]} rows with cr, baseXp, resolutionType, multiplier, finalXp
     */
    static buildMonsterRows(combatants, combat) {
        const resolutionMultipliers = this.getResolutionMultipliers();
        return combatants.map((monster) => {
            const baseXp = this.getMonsterBaseXp(monster, combat);
            const resolutionType = this.detectMonsterResolution(monster, combat);
            const multiplier = resolutionMultipliers[resolutionType] || 0;
            // Coerced rather than trusted: a row whose XP is not a number poisons
            // every total downstream, and 0 is the honest answer for "we could not
            // work this one out".
            const safeBase = Number.isFinite(Number(baseXp)) ? Number(baseXp) : 0;
            return {
                id: monster.id,
                name: this.getMonsterDisplayName(monster, combat),
                cr: this.getMonsterCR(monster, combat),
                baseXp: safeBase,
                resolutionType,
                multiplier,
                finalXp: Math.floor(safeBase * multiplier),
                actorId: monster.actorId
            };
        });
    }

    static getCombatMonsters(combat) {
        const record = getAdversaryRecord(combat);
        return combat.combatants.filter(combatant => {
            const actor = combatant.actor;
            // Fall back to the record when the live actor is unavailable. A combatant whose token
            // was deleted usually still resolves to its prototype, but an unlinked token of a
            // deleted prototype resolves to nothing -- and dropping it silently is how a kill
            // disappears from the award with no trace that it was ever there.
            const evidence = record[combatant.id] ?? null;
            if (!actor) {
                return Boolean(evidence)
                    && evidence.actorType === 'npc'
                    && !evidence.hasPlayerOwner;
            }
            return actor.type === 'npc'
                && !actor.hasPlayerOwner
                && !actor.getFlag('coffee-pub-blacksmith', 'sidekick');
        });
    }

    /**
     * Get all player characters from the combat
     */
    static getCombatPlayers(combat) {
        if (combat) {
            // Get players from combat and process them the same way as loadPartyMembers
            const combatants = combat.combatants.filter(combatant => {
            const actor = combatant.actor;
            return actor && (actor.hasPlayerOwner || actor.type === 'character');
        });
            
            return combatants.map(combatant => {
                const actor = combatant.actor;
                // Get current XP and level
                const currentXp = actor.system?.details?.xp?.value || 0;
                const level = actor.system?.details?.level || 1;
                
                // Calculate next level XP
                const nextLevel = level + 1;
                const nextLevelXp = this.getXpForLevel(nextLevel);
                const xpToNextLevel = nextLevelXp - currentXp;

                return {
                    // Don't store the full actor object - just store what we need for templates
                    actorId: actor.id,
                    name: actor.name,
                    img: actor.img, // Store img for template access
                    level: level,
                    currentXp: currentXp,
                    nextLevel: nextLevel,
                    nextLevelXp: nextLevelXp,
                    xpToNextLevel: xpToNextLevel,
                    included: true, // Default to included
                    adjustment: 0,
                    adjustmentSign: '+',
                    calculatedXp: 0, // Will be calculated by updateXpCalculations
                    finalXp: 0 // Will be calculated by updateXpCalculations
                };
            });
        } else {
            // Get all player characters from the game (for milestone mode)
            return game.actors.filter(actor => {
                return actor.type === 'character' && actor.hasPlayerOwner;
            });
        }
    }

    /**
     * Get all monsters from the canvas (when no combat is active)
     * All monsters are set to "Removed" status (0 XP) but have full data for resolution changes
     */
    static getCanvasMonsters() {
        // Get all tokens on the current scene
        const scene = game.scenes.active;
        if (!scene) {
            return [];
        }

        const tokens = scene.tokens.contents;
        const monsters = [];

        for (const token of tokens) {
            const actor = token.actor;
            if (actor
                && actor.type === 'npc'
                && !actor.hasPlayerOwner
                && !actor.getFlag('coffee-pub-blacksmith', 'sidekick')) {
                // Get base XP for this monster (pass token, not actor)
                const cr = actor.system.details.cr;
                const baseXp = this.getMonsterBaseXp(token);
                
                // Debug logging
                
                // Create monster data with "REMOVED" status but full calculation data
                const monsterData = {
                    id: actor.id, // Template expects 'id' field
                    actorId: actor.id,
                    name: actor.name,
                    img: actor.img,
                    cr: actor.system.details.cr || 0,
                    baseXp: baseXp, // Full base XP for calculations
                    resolutionType: 'REMOVED', // Set to "Removed" by default
                    multiplier: 0.0, // REMOVED has 0.0 multiplier
                    finalXp: 0, // Will be 0 because of REMOVED status
                    isIncluded: true // Include in calculations (but 0 XP due to REMOVED)
                };
                
                monsters.push(monsterData);
            }
        }

        return monsters;
    }

    /**
     * Load party members with full character data (for non-combat XP distribution)
     */
    static loadPartyMembers() {
        const partyMembers = game.actors.filter(actor => {
            return actor.type === 'character' && actor.hasPlayerOwner;
        });


        return partyMembers.map(actor => {
            // Get current XP and level
            const currentXp = actor.system?.details?.xp?.value || 0;
            const level = actor.system?.details?.level || 1;
            
            // Debug logging
            
            // Calculate next level XP
            const nextLevel = level + 1;
            const nextLevelXp = this.getXpForLevel(nextLevel);
            const xpToNextLevel = nextLevelXp - currentXp;

            return {
                // Don't store the full actor object - just store what we need for templates
                actorId: actor.id,
                name: actor.name,
                img: actor.img, // Store img for template access
                level: level,
                currentXp: currentXp,
                nextLevel: nextLevel,
                nextLevelXp: nextLevelXp,
                xpToNextLevel: xpToNextLevel,
                included: true, // Default to included
                adjustment: 0,
                adjustmentSign: '+',
                signedAdjustment: 0,
                calculatedXp: 0, // Will be calculated by updateXpCalculations
                finalXp: 0, // Will be calculated by updateXpCalculations
                leveledUp: false // Will be calculated when XP is applied
            };
        });
    }

    /**
     * Convert CR to decimal for consistent lookup
     */
    static convertCRToDecimal(cr) {
        if (typeof cr === 'number') return cr;
        if (cr === '1/8') return 0.125;
        if (cr === '1/4') return 0.25;
        if (cr === '1/2') return 0.5;
        return parseFloat(cr) || 0;
    }

    /**
     * Get monster's base XP from CR
     */
    static getMonsterBaseXp(monster, combat = null) {
        const cr = this.getMonsterCR(monster, combat);
        const decimalCR = this.convertCRToDecimal(cr);
        return this.CR_TO_XP[decimalCR] || 0;
    }

    /**
     * The adversary's name as it was fought.
     *
     * `Combatant#name` reads the token's name and falls back to the actor's once the token is gone.
     * For an unlinked token that fallback is the PROTOTYPE name -- so a "Cult Leader (BCOD)" placed
     * and renamed to "Elra Keene" reverts to the prototype in the XP window the moment its token is
     * deleted, which is the same class of problem as the resolution reverting.
     *
     * Live while the token exists, so a rename mid-combat is picked up immediately. Recorded only
     * once there is no token left to ask.
     *
     * @param {Combatant} monster
     * @param {Combat} combat
     * @returns {string}
     */
    static getMonsterDisplayName(monster, combat = null) {
        if (monster?.token) return monster.name;
        const recorded = combat ? (getAdversaryRecord(combat)[monster?.id] ?? null) : null;
        return recorded?.name ?? monster?.name ?? 'Unknown';
    }

    /**
     * Get monster's CR
     */
    static getMonsterCR(monster, combat = null) {
        const actor = monster.actor;

        // Live CR is preferred while the actor exists, so a GM correcting a wrong CR still applies.
        // The record is the fallback for when it does not: returning 0 there is a silent zero-XP
        // award, which reads as "this monster was worth nothing" rather than "we lost its CR".
        //
        // Note this differs from resolution, which prefers the record unconditionally -- there the
        // live document is actively wrong after a token is deleted, whereas a prototype's CR is
        // normally the CR that was fought.
        if (!actor) {
            const recorded = combat ? (getAdversaryRecord(combat)[monster.id] ?? null) : null;
            return recorded?.cr ?? 0;
        }

        const cr = actor.system.details.cr;
        if (typeof cr === 'number') return cr;
        if (typeof cr === 'string') {
            // Handle fractional CRs like "1/8", "1/4", "1/2"
            if (cr.includes('/')) {
                return cr; // Return as string for lookup
            }
            return parseFloat(cr) || 0;
        }
        return 0;
    }

    /**
     * Detect how a monster was resolved in combat
     */
    static detectMonsterResolution(monster, combat) {
        const actor = monster.actor;

        // Recorded evidence wins over the live document, because the live document lies once a token
        // is gone: Combatant#actor falls back to the base prototype, which is at full health because
        // the damage lived in the token's delta. A monster killed and then looted-and-cleared
        // mid-fight would otherwise re-derive as untouched and earn nothing.
        //
        // Evidence, not verdict: this supplies hit points and defeated state, and the same rules
        // below decide what they mean. A GM correcting a resolution in the window, or a table
        // changing its multipliers later, is not arguing with a frozen answer.
        // `defeated` is a stored BooleanField on the Combatant (common/documents/combatant.mjs:56),
        // so it survives both token deletion and a reload without any help from the record. Consult
        // it FIRST and directly: the previous version reached it only through the record, which made
        // a correct answer depend on capture timing for no reason. The record is still needed for the
        // name, the CR fallback, and telling ESCAPED from IGNORED -- none of which is stored anywhere.
        if (monster?.isDefeated === true) return 'DEFEATED';

        const recorded = getAdversaryRecord(combat)[monster.id] ?? null;
        if (recorded?.defeated === true) return 'DEFEATED';

        const hp = recorded ? null : actor?.system?.attributes?.hp;
        const current = recorded ? Number(recorded.hp) : Number(hp?.value);
        const max = recorded ? Number(recorded.maxHp) : Number(hp?.max);

        if (!actor && !recorded) return 'UNKNOWN';

        // Hit points are optional on an actor -- a dnd5e `group` has members rather
        // than HP -- and every branch below reads them. Without a value there is no
        // evidence either way, which is what UNKNOWN means.
        if (!Number.isFinite(current)) return 'UNKNOWN';

        // 1. Defeated: If dead (HP <= 0)
        if (current <= 0) {
            return 'DEFEATED';
        }

        // 2. Escaped: If not dead and lost any HP
        if (Number.isFinite(max) && current < max) {
            return 'ESCAPED';
        }

        // 3. Ignored: If not dead and took no damage
        if (Number.isFinite(max) && current === max) {
            return 'IGNORED';
        }

        // Never auto-assign NEGOTIATED or CAPTURED
        // Default for non-dead monsters is ESCAPED (should not reach here)
        return 'ESCAPED';
    }

    /**
     * Apply XP to player characters
     */

    /**
     * Apply XP to players using pre-calculated data from xpData.players
     */
    static async applyXpToPlayersFromData(xpData) {
        try {
        
        // Validate player data before processing
        const validPlayers = xpData.players.filter(player => {
            if (!player || !player.actorId) {
                return false;
            }
            const actor = game.actors.get(player.actorId);
            if (!actor) {
                postConsoleAndNotification(MODULE.NAME, "XP Distribution | Actor not found", { actorId: player.actorId }, false, false);
                return false;
            }
            return true;
        });
        
        
        const results = [];
        
        for (const player of validPlayers) {
            const actor = game.actors.get(player.actorId);

            // Use the pre-calculated final XP for this player, with safety check
            const playerXp = Math.max(0, parseInt(player.finalXp) || 0);
            

            if (playerXp > 0) {
                            // Add XP to character - ensure we have valid numbers
                            const previousXp = Number(actor.system?.details?.xp?.value ?? 0);
                            const newXp = previousXp + playerXp;
                            
                            // Use a controlled update to avoid reactivity issues
                            try {
                await actor.update({
                    'system.details.xp.value': newXp
                                }, { 
                                    render: false  // Don't re-render immediately
                                });
                                
                            } catch (updateError) {
                                postConsoleAndNotification(MODULE.NAME, "XP Distribution | Error updating actor", { 
                                    actorId: player.actorId, 
                                    error: updateError.message 
                                }, false, false);
                                continue;
                            }

                // Small delay to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 10));

                // Get XP needed for next level
                const currentLevel = actor.system.details.level || 1;
                const nextLevel = currentLevel + 1;
                const nextLevelTotalXp = this.getXpForLevel(nextLevel);
                const nextLevelXp = nextLevelTotalXp - newXp;

                results.push({
                    name: actor.name,
                    img: actor.img,
                    xpGained: playerXp,
                    totalXp: newXp,
                    nextLevel: nextLevel,
                    nextLevelXp: nextLevelXp,
                    leveledUp: this.checkLevelUp(actor, previousXp, newXp)
                });
            } else {
                // Still include in results but with 0 XP; excluded players are labeled
                // "No Combat" on the card rather than shown as a 0 XP award
                const previousXp = actor.system.details.xp.value || 0;
                const currentLevel = actor.system.details.level || 1;
                const nextLevel = currentLevel + 1;
                const nextLevelTotalXp = this.getXpForLevel(nextLevel);
                const nextLevelXp = nextLevelTotalXp - previousXp;

                results.push({
                    name: actor.name,
                    img: actor.img,
                    xpGained: 0,
                    totalXp: previousXp,
                    nextLevel: nextLevel,
                    nextLevelXp: nextLevelXp,
                    leveledUp: false,
                    excluded: player.included === false
                });
            }
        }

        return results;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "XP Distribution | Error in applyXpToPlayersFromData", error, false, true);
            throw error;
        }
    }

    /**
     * Check if a character leveled up
     */
    static checkLevelUp(actor, previousXp, newXp) {
        // Get current level and calculate what level the new XP would give
        const currentLevel = actor.system.details.level || 1;
        const newLevel = this.getLevelFromXp(newXp);
        
        // Level up if new level is higher than current level
        return newLevel > currentLevel;
    }

    /**
     * Get XP required for a specific level (D&D 5e standard)
     */
    static getXpForLevel(level) {
        const xpTable = {
            1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000,
            9: 48000, 10: 64000, 11: 85000, 12: 100000, 13: 120000, 14: 140000,
            15: 165000, 16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000
        };
        return xpTable[level] || 355000; // Cap at level 20
    }

    /**
     * Get level from XP amount (D&D 5e standard)
     */
    static getLevelFromXp(xp) {
        const xpTable = {
            0: 1, 300: 2, 900: 3, 2700: 4, 6500: 5, 14000: 6, 23000: 7, 34000: 8,
            48000: 9, 64000: 10, 85000: 11, 100000: 12, 120000: 13, 140000: 14,
            165000: 15, 195000: 16, 225000: 17, 265000: 18, 305000: 19, 355000: 20
        };
        
        // Find the highest level they qualify for
        let level = 1;
        for (const [requiredXp, levelNum] of Object.entries(xpTable)) {
            if (xp >= parseInt(requiredXp)) {
                level = levelNum;
            } else {
                break;
            }
        }
        return level;
    }

    /**
     * Post XP distribution results to chat
     */
    static async postXpResults(xpData, results) {
        try {
            playSound(window.COFFEEPUB?.SOUNDNOTIFICATION02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

            const gmUser = game.users.find(u => u.isGM);
            if (!gmUser) {
                postConsoleAndNotification(MODULE.NAME, 'No GM user found', "", false, false);
                return;
            }

            const isShared = game.settings.get(MODULE.ID, 'shareXpResults');

            await ChatCardsAPI.post({
                moduleId: MODULE.ID,
                type: 'xp-distribution',
                parts: this._buildXpCardParts(xpData, results),
                speaker: ChatMessage.getSpeaker({ user: gmUser }),
                whisper: isShared ? [] : [game.user.id],
                flags: { type: 'xpDistribution', xpData, results }
            });

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error posting XP results', error, false, false);

            // Fallback: a plain notice, so the numbers still reach the table even
            // if composing the full card failed.
            const gmUser = game.users.find(u => u.isGM);
            if (gmUser) {
                await ChatCardsAPI.post({
                    moduleId: MODULE.ID,
                    type: 'xp-distribution-fallback',
                    parts: [
                        { part: 'header', icon: 'fas fa-star', title: 'XP Distribution Complete' },
                        { part: 'prose', blocks: [
                            { type: 'table', rows: [
                                ['Total XP', String(xpData.adjustedTotalXp)],
                                ...results.map(r => [r.name, `+${r.xpGained} XP`])
                            ] }
                        ] }
                    ],
                    speaker: ChatMessage.getSpeaker({ user: gmUser }),
                    whisper: [game.user.id]
                });
            }
        }
    }

    /**
     * Compose the XP distribution card.
     *
     * Summary and milestone are key/value tables; monsters and players are status
     * rows, which carry an icon or portrait plus a trailing value.
     */
    static _buildXpCardParts(xpData, results) {
        const parts = [
            { part: 'header', icon: 'fas fa-star', title: 'XP Distribution' },
            { part: 'section', icon: 'fas fa-list-ol', label: 'XP Summary' }
        ];

        const summary = [['Distribution', `${xpData.partySize} Players x ${Number(xpData.partyMultiplier ?? 0).toFixed(2)} Multiplier`]];
        if (xpData.modeExperiencePoints) summary.push(['Monster XP', String(xpData.adjustedTotalXp)]);
        if (xpData.modeMilestone) summary.push(['Milestone XP', String(xpData.milestoneXp)]);
        summary.push(['Total XP', String(xpData.combinedXp)], ['Per Player', String(xpData.xpPerPlayer)]);
        parts.push({ part: 'prose', blocks: [{ type: 'table', rows: summary }] });

        if (xpData.modeMilestone) {
            const milestone = xpData.milestoneData ?? {};
            const rows = [];
            if (milestone.title) rows.push(['Milestone', milestone.title]);
            if (milestone.description) rows.push(['Detail', milestone.description]);
            if (milestone.xpAmount) rows.push(['Milestone XP', String(xpData.milestoneXp)]);
            parts.push({ part: 'section', icon: 'fas fa-star', label: `${milestone.category ?? ''} Milestone`.trim() });
            if (rows.length) parts.push({ part: 'prose', blocks: [{ type: 'table', rows }] });
        }

        if (xpData.modeExperiencePoints) {
            const monsters = (xpData.monsters ?? []).filter(m => m.resolutionType !== 'REMOVED');
            if (monsters.length) {
                parts.push({ part: 'section', icon: 'fas fa-dragon', label: 'Monster Resolutions' });
                parts.push({
                    part: 'status',
                    items: monsters.map(m => ({
                        icon: RESOLUTION_ICONS[m.resolutionType] ?? 'fas fa-question',
                        label: m.name,
                        trailing: `${m.finalXp} XP`
                    }))
                });
            }
        }

        if (results?.length) {
            parts.push({ part: 'section', icon: 'fas fa-users', label: 'Experience Allocations' });
            parts.push({
                part: 'status',
                items: results.map(r => ({
                    img: r.img,
                    label: r.name,
                    sublabel: (r.leveledUp || r.nextLevelXp <= 0)
                        ? `${r.totalXp} XP | LEVEL UP!`
                        : `${r.totalXp} XP | ${r.nextLevelXp} to lvl ${r.nextLevel}`,
                    trailing: r.excluded ? 'No Combat' : (r.xpGained > 0 ? `+${r.xpGained} XP` : '0 XP')
                }))
            });
        }

        return parts;
    }

    /**
     * Get resolution type XP multipliers from settings
     */
    static getResolutionMultipliers() {
        return {
            DEFEATED: game.settings.get(MODULE.ID, 'xpMultiplierDefeated'),
            NEGOTIATED: game.settings.get(MODULE.ID, 'xpMultiplierNegotiated'),
            ESCAPED: game.settings.get(MODULE.ID, 'xpMultiplierEscaped'),
            IGNORED: game.settings.get(MODULE.ID, 'xpMultiplierIgnored'),
            CAPTURED: game.settings.get(MODULE.ID, 'xpMultiplierCaptured'),
            REMOVED: 0.0  // Always 0 - no XP for removed monsters
        };
    }

    /**
     * Get party size multipliers based on settings
     */
    static getPartySizeMultipliers() {
        const handling = game.settings.get(MODULE.ID, 'xpPartySizeHandling');
        
        if (handling === 'equal') {
            // Equal division - no multipliers
            return {
                1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1
            };
        }
        
        // Default to D&D 5e standard multipliers
        return this.PARTY_SIZE_MULTIPLIERS;
    }

    /**
     * Debug hook for combat round
     */
    static _onCombatRound(combat, round, userId) {
        // Combat round hook - no action needed
    }

    /**
     * Debug hook for combat turn
     */
    static _onCombatTurn(combat, turn, userId) {
        // Combat turn hook - no action needed
    }
}

// ================================================================== 
// ===== XP DISTRIBUTION WINDOW =====================================
// ================================================================== 

class XpDistributionWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'xp-distribution-window';

    /**
     * The open instance, so a second open raises it rather than stacking another.
     *
     * `DEFAULT_OPTIONS.id` is fixed, and ApplicationV2 keys its own registry on that id
     * (`client/applications/api/application.mjs:512`), so a second instance overwrites the
     * first in `foundry.applications.instances` and leaves it orphaned in the DOM with a
     * duplicate id. Reachable today by clicking the menubar tool twice; guaranteed once
     * other modules can open the window through the registry.
     */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'xp-distribution-window',
            classes: ['xp-distribution-window'],
            position: { width: 600, height: 700 },
            window: { title: 'XP Distribution', resizable: true, minimizable: true }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-xp.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(xpData) {
        super();
        this.xpData = xpData;

        if (!this.xpData.milestoneData) {
            this.xpData.milestoneData = {
                category: '',
                title: '',
                description: '',
                xpAmount: '0'
            };
        }

        this.updateXpCalculations();
    }

    _onClose(options) {
        if (XpDistributionWindow.activeWindow === this) XpDistributionWindow.activeWindow = null;
        super._onClose?.(options);
    }

    getData() {
        const multipliers = XpManager.getResolutionMultipliers();
        // New labels and legend descriptions
        const resolutionTypeLabels = {
            DEFEATED: { label: "Defeated", desc: "Combat Victory" },
            NEGOTIATED: { label: "Negotiated", desc: "Diplomatic Success" },
            ESCAPED: { label: "Escaped", desc: "Monster Retreated" },
            IGNORED: { label: "Ignored", desc: "Avoided Entirely" },
            CAPTURED: { label: "Captured", desc: "Tactical Success" },
            REMOVED: { label: "Removed", desc: "Excluded Entirely" }
        };
        // Order for dropdowns and legend
        const resolutionTypes = ["DEFEATED", "NEGOTIATED", "ESCAPED", "IGNORED", "CAPTURED", "REMOVED"];
        // For dropdowns
        const dropdownTypes = resolutionTypes;
        // For legend
        const legendTypes = resolutionTypes.map(key => ({
            key,
            label: resolutionTypeLabels[key].label,
            desc: resolutionTypeLabels[key].desc,
            multiplier: multipliers[key]
        }));
        return {
            xpData: this.xpData,
            resolutionTypes: dropdownTypes,
            legendTypes,
            multipliers,
            modeExperiencePoints: this.xpData.modeExperiencePoints || false,
            modeMilestone: this.xpData.modeMilestone || false
        };
    }

    /**
     * Update XP calculations based on active modes
     */
    updateXpCalculations() {
        // Calculate monster bucket from current monster data
        let monsterBucket = 0;
        if (this.xpData.modeExperiencePoints) {
            // Calculate total XP from current monster finalXp values
            // Coerced per row: one non-numeric finalXp used to turn the whole sum
            // into NaN, and NaN then propagated through combinedXp to Per Player
            // and every player row. A row that cannot be worth a number is worth 0.
            const totalMonsterXp = this.xpData.monsters.reduce(
                (sum, monster) => sum + (Number.isFinite(Number(monster?.finalXp)) ? Number(monster.finalXp) : 0), 0);
            // Apply party multiplier
            monsterBucket = Math.floor(totalMonsterXp * (this.xpData.partyMultiplier || 1));
        }
        
        // Calculate milestone bucket
        let milestoneBucket = this.xpData.modeMilestone ? (this.xpData.milestoneXp || 0) : 0;
        
        // Total XP is always the sum of both buckets
        this.xpData.combinedXp = monsterBucket + milestoneBucket;
        const perPlayer = this.xpData.partySize > 0
            ? Math.floor(this.xpData.combinedXp / this.xpData.partySize)
            : 0;
        // Last line of defence: this value is rendered directly and added to every
        // player's adjustment, so a NaN reaching here shows up in six places at once.
        this.xpData.xpPerPlayer = Number.isFinite(perPlayer) ? perPlayer : 0;
        
        // Debug logging
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const el = this.element;

        const modeExperiencePoints = el.querySelector('#modeExperiencePoints');
        const modeMilestone = el.querySelector('#modeMilestone');
        if (modeExperiencePoints) modeExperiencePoints.addEventListener('change', this._onModeToggleChange.bind(this));
        if (modeMilestone) modeMilestone.addEventListener('change', this._onModeToggleChange.bind(this));

        const milestoneXp = el.querySelector('#milestone-xp');
        if (milestoneXp) milestoneXp.addEventListener('input', this._onMilestoneXpChange.bind(this));
        el.querySelectorAll('.milestone-input, .milestone-textarea, .milestone-select').forEach(input => {
            input.addEventListener('input', this._onMilestoneDataChange.bind(this));
            input.addEventListener('change', this._onMilestoneDataChange.bind(this));
        });

        el.querySelectorAll('.player-adjustment').forEach(input => {
            input.addEventListener('input', this._onPlayerAdjustmentChange.bind(this));
        });
        el.querySelectorAll('.adjustment-sign').forEach(input => {
            input.addEventListener('click', this._onPlayerAdjustmentSignClick.bind(this));
        });

        const applyXp = el.querySelector('.apply-xp');
        const cancelXp = el.querySelector('.cancel-xp');
        if (applyXp) applyXp.addEventListener('click', this._onApplyXp.bind(this));
        if (cancelXp) cancelXp.addEventListener('click', this._onCancelXp.bind(this));

        el.querySelectorAll('[data-table-type="monsters"] .resolution-icon').forEach(icon => {
            icon.addEventListener('click', this._onMonsterResolutionIconClick.bind(this));
            icon.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    this._onMonsterResolutionIconClick(event);
                }
            });
        });

        el.querySelectorAll('[data-table-type="players"] .inclusion-toggle').forEach(icon => {
            icon.addEventListener('click', this._onPlayerInclusionClick.bind(this));
        });

        this._updateXpDataPlayers();
    }

    _onPlayerAdjustmentChange(event) {
        // Update display when player adjustments change
        this._updateXpDisplay();
        
        // Then update xpData.players with new adjustment
        this._updateXpDataPlayers();
    }

    _onPlayerAdjustmentSignClick(event) {
        const clickedIcon = event.currentTarget;
        const playerRow = clickedIcon.closest('[data-row-type="player"]');
        if (!playerRow) return;
        const playerId = playerRow.getAttribute('data-player-id');
        
        // Remove active class from both icons in this row
        playerRow.querySelectorAll('.adjustment-sign').forEach(icon => {
            icon.classList.remove('active');
        });
        
        // Add active class to clicked icon
        clickedIcon.classList.add('active');
        
        // Update the player's sign preference
        const player = this.xpData.players.find(p => p.actorId === playerId);
        if (player) {
            player.adjustmentSign = clickedIcon.getAttribute('data-sign');
            this._updateXpDataPlayers();
            this._updateXpDisplay();
        }
    }

    _onModeToggleChange(event) {
        const toggle = event.currentTarget;
        const mode = toggle.id.replace('mode', '').toLowerCase();
        const isChecked = toggle.checked;

        const modeKey = mode === 'experiencepoints' ? 'modeExperiencePoints' : `mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
        this.xpData[modeKey] = isChecked;

        const element = this.element;

        // Simple show/hide logic - no re-rendering
        if (mode === 'experiencepoints') {
            const expSection = element.querySelector('[data-section="experience-points"]');
            const resolutionSection = element.querySelector('[data-section="resolution-types"]');
            if (isChecked) {
                if (expSection) expSection.classList.remove('hidden');
                if (resolutionSection) resolutionSection.classList.remove('hidden');
            } else {
                if (expSection) expSection.classList.add('hidden');
                if (resolutionSection) resolutionSection.classList.add('hidden');
            }
        } else if (mode === 'milestone') {
            const milestoneSection = element.querySelector('[data-section="milestones"]');
            if (milestoneSection) {
                if (isChecked) {
                    milestoneSection.classList.remove('hidden');
                } else {
                    milestoneSection.classList.add('hidden');
                }
            }
        }
        
        // Always ensure Player Adjustments section is visible
        const playerAdjustmentsSection = element.querySelector('[data-section="player-adjustments"]');
        if (playerAdjustmentsSection) playerAdjustmentsSection.classList.remove('hidden');
        
        // Debug logging
        
        // Recalculate XP based on active modes
        this.updateXpCalculations();
        
        // Update display
        this._updateXpDisplay();
    }


    _onMilestoneXpChange(event) {
        const xpAmount = parseInt(event.currentTarget.value) || 0;
        this.xpData.milestoneXp = xpAmount;
        
        // Recalculate and update display
        this.updateXpCalculations();
        this._updateXpDisplay();
    }

    _onMilestoneDataChange(event) {
        // Store milestone data for later use in chat/application
        this._collectMilestoneData();
    }

    _collectMilestoneData() {
        const element = this.element;

        // Collect milestone data directly from input elements since there's no form wrapper
        const categoryEl = element.querySelector('#milestone-category');
        const titleEl = element.querySelector('#milestone-title');
        const descriptionEl = element.querySelector('#milestone-description');
        const xpAmountEl = element.querySelector('#milestone-xp');
        const category = categoryEl ? categoryEl.value : '';
        const title = titleEl ? titleEl.value : '';
        const description = descriptionEl ? descriptionEl.value : '';
        const xpAmount = xpAmountEl ? xpAmountEl.value : '0';
        
        this.xpData.milestoneData = {
            category: category,
            title: title,
            description: description,
            xpAmount: xpAmount
        };
        
    }

    async _onApplyXp(event) {
        event.preventDefault();
        event.stopPropagation();
        try {
            
            // Collect milestone data before processing
            this._collectMilestoneData();
            
            // Ensure XP calculations are up to date
            this.updateXpCalculations();
            
            // Update player data with current UI state before applying XP
            this._updateXpDataPlayers();
            
            
            // Apply XP to players using the calculated data from xpData.players
            const results = await XpManager.applyXpToPlayersFromData(this.xpData);
            
            
            await XpManager.postXpResults(this.xpData, results);
            this.close();
            
            // Create notification message based on active modes
            let modeText = [];
            if (this.xpData.modeExperiencePoints) modeText.push('Experience Points');
            if (this.xpData.modeMilestone) modeText.push('Milestones');
            const modeString = modeText.length > 0 ? ` (${modeText.join(' + ')})` : '';
            
            ui.notifications.info(`XP distributed successfully! Total XP: ${this.xpData.combinedXp}${modeString}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Error applying XP', error, false, true);
            ui.notifications.error(`Error distributing XP: ${error.message}`);
        }
    }

    _onCancelXp(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Close the window without applying XP
        this.close();
    }

    _updateXpDisplay() {
        // First update the core calculations
        this.updateXpCalculations();
        
        // Calculate totals for display (updateXpCalculations now handles the main logic)
        this.xpData.totalXp = this.xpData.monsters.reduce(
            (sum, monster) => sum + (Number.isFinite(Number(monster?.finalXp)) ? Number(monster.finalXp) : 0), 0);
        this.xpData.adjustedTotalXp = Math.floor(this.xpData.totalXp * (this.xpData.partyMultiplier || 1));

        // Get included count for display purposes
        const includedCount = this._getIncludedPlayerCount();

        // Update summary display
        const html = this.element;
        const summaryItems = html.querySelectorAll('.xp-summary-item');
        if (summaryItems.length > 0) {
            const spans0 = summaryItems[0].querySelectorAll('span');
            if (spans0.length > 0) spans0[spans0.length - 1].textContent = this.xpData.totalXp;
        }
        if (summaryItems.length > 1) {
            const spans1 = summaryItems[1].querySelectorAll('span');
            if (spans1.length > 0) spans1[spans1.length - 1].textContent = includedCount;
        }
        if (summaryItems.length > 2) {
            const spans2 = summaryItems[2].querySelectorAll('span');
            if (spans2.length > 0) spans2[spans2.length - 1].textContent = (this.xpData.partyMultiplier || 1) + 'x';
        }
        if (summaryItems.length > 3) {
            const spans3 = summaryItems[3].querySelectorAll('span');
            if (spans3.length > 0) spans3[spans3.length - 1].textContent = this.xpData.adjustedTotalXp;
        }
        if (summaryItems.length > 4) {
            const spans4 = summaryItems[4].querySelectorAll('span');
            if (spans4.length > 0) spans4[spans4.length - 1].textContent = this.xpData.xpPerPlayer;
        }

        // Update monster rows
        const monsterRows = html.querySelectorAll('[data-table-type="monsters"] [data-row-type="monster"]');
        this.xpData.monsters.forEach((monster, i) => {
            if (i >= monsterRows.length) return;
            const row = monsterRows[i];
            const xpField = row.querySelector('[data-field="xp"]');
            if (!xpField) return;
            
            // Show the calculation based on current resolution
            if (monster.resolutionType === 'REMOVED') {
                // Show red "0" for removed monsters
                xpField.innerHTML = '<span class="excluded-xp">0</span>';
            } else {
                // Show the full calculation
                xpField.innerHTML = `${monster.baseXp} x ${monster.multiplier.toFixed(2)} = <strong>${monster.finalXp}</strong>`;
            }
        });

        // Update player rows
        const playerRows = html.querySelectorAll('[data-table-type="players"] [data-row-type="player"]');
        this.xpData.players.forEach((player, i) => {
            if (i >= playerRows.length) return;
            const row = playerRows[i];
            const inclusionIcon = row.querySelector('.inclusion-toggle');
            const isIncluded = inclusionIcon && inclusionIcon.classList.contains('active');
            
            if (isIncluded) {
            // Get adjustment value from input
            const adjInput = row.querySelector('.player-adjustment');
            let adjustment = adjInput ? parseInt(adjInput.value, 10) : 0;
            if (isNaN(adjustment)) adjustment = 0;
                
                // Get adjustment sign from active icon
                const activeSignEl = row.querySelector('.adjustment-sign.active');
                const activeSign = activeSignEl ? activeSignEl.getAttribute('data-sign') : '+';
                const signedAdjustment = activeSign === '-' ? -adjustment : adjustment;
                
                // Calculate total for this player (minimum 0)
                const calculatedTotal = this.xpData.xpPerPlayer + signedAdjustment;
                const total = Math.max(0, calculatedTotal);
            const baseXpEl = row.querySelector('.player-base-xp');
            const totalEl = row.querySelector('.calculated-total');
            if (baseXpEl) baseXpEl.textContent = this.xpData.xpPerPlayer;
            if (totalEl) totalEl.textContent = total;
            } else {
                // Show 0 for disabled players
                const baseXpEl = row.querySelector('.player-base-xp');
                const totalEl = row.querySelector('.calculated-total');
                if (baseXpEl) baseXpEl.textContent = '0';
                if (totalEl) totalEl.textContent = '0';
            }
        });
    }


    _onMonsterResolutionIconClick(event) {
        event.preventDefault();
        const icon = event.currentTarget;
        const monsterId = icon.getAttribute('data-monster-id');
        const resolution = icon.getAttribute('data-resolution');
        const monster = this.xpData.monsters.find(m => m.id === monsterId);
        if (monster && resolution) {
            // Update monster resolution and XP
            const resolutionMultipliers = XpManager.getResolutionMultipliers();
            monster.resolutionType = resolution;
            monster.multiplier = resolutionMultipliers[resolution] || 0;
            monster.finalXp = Math.floor(monster.baseXp * monster.multiplier);
            
            // Debug logging
            
            // Update the visual state of all icons for this monster
            const monsterRow = icon.closest('[data-row-type="monster"]');
            if (monsterRow) {
                monsterRow.querySelectorAll('.resolution-icon').forEach((element) => {
                    const iconResolution = element.getAttribute('data-resolution');
                    if (iconResolution === resolution) {
                        element.classList.remove('dimmed');
                        element.classList.add('active');
                    } else {
                        element.classList.remove('active');
                        element.classList.add('dimmed');
                    }
                });
            }
            
            // Update all XP calculations and display
            this._updateXpDisplay();
            
            // Update player data with new calculated values
            this._updateXpDataPlayers();
        }
    }

    _onPlayerInclusionClick(event) {
        const icon = event.currentTarget;
        const playerId = icon.getAttribute('data-player-id');
        
        // Toggle the icon state
        if (icon.classList.contains('active')) {
            icon.classList.remove('active');
            icon.classList.add('dimmed');
        } else {
            icon.classList.remove('dimmed');
            icon.classList.add('active');
        }
        
        // Update xpData to reflect included players
        const includedCount = this._getIncludedPlayerCount();
        this.xpData.partySize = includedCount;
        
        // Recalculate totals and update display
        this._updateXpDisplay();
        
        // Then update xpData.players with current inclusion status and calculated totals
        this._updateXpDataPlayers();
    }


    _getIncludedPlayerCount() {
        return this.element.querySelectorAll('[data-table-type="players"] .inclusion-toggle.active').length;
    }

    _updateXpDataPlayers() {
        const element = this.element;

        // Update xpData.players with current inclusion status and calculated totals
        this.xpData.players = this.xpData.players.map(player => {
            // Skip if player is undefined
            if (!player) {
                return player;
            }
            
            // Use actorId to find the row (from the logged data structure)
            const playerEl = element.querySelector(`[data-player-id="${player.actorId}"]`);
            const row = playerEl ? playerEl.closest('[data-row-type="player"]') : null;
            if (!row) return player;
            const inclusionIcon = row.querySelector('.inclusion-toggle');
            const isIncluded = inclusionIcon && inclusionIcon.classList.contains('active');
            
            // Get adjustment value from input
            const adjInput = row.querySelector('.player-adjustment');
            let adjustment = adjInput ? parseInt(adjInput.value, 10) : 0;
            if (isNaN(adjustment)) adjustment = 0;
            
            // Get adjustment sign from active icon
            const activeSignEl = row.querySelector('.adjustment-sign.active');
            const activeSign = activeSignEl ? activeSignEl.getAttribute('data-sign') : '+';
            const signedAdjustment = activeSign === '-' ? -adjustment : adjustment;
            
            // Calculate final XP for this player (minimum 0)
            const calculatedXp = isIncluded ? this.xpData.xpPerPlayer + signedAdjustment : 0;
            const finalXp = Math.max(0, calculatedXp);
            
            return {
                ...player,
                included: isIncluded,
                adjustment: adjustment,
                adjustmentSign: player.adjustmentSign || '+',
                finalXp: finalXp
            };
        });
    }
} 
