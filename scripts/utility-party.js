// ================================================================== 
// ===== PARTY UTILITIES ============================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification, isPlayerCharacter } from './api-core.js';
import { deployTokens, deployTokensSequential, getDeploymentPatternName } from './api-tokens.js';
import { DialogAPI } from './api-dialog.js';
import { ToastAPI } from './api-toast.js';

/**
 * Utility functions for party management
 */

/**
 * Get all party members (player characters)
 * @returns {Array} Array of actor documents
 */
export function getPartyMembers() {
    return game.actors.filter(actor => isPlayerCharacter(actor));
}

/**
 * Player-owned actors that are not player characters.
 *
 * Familiars, summons, companions, animated weapons -- the things a player owns
 * and expects to appear beside them. `isPlayerCharacter` deliberately excludes
 * them because it answers "is this a party member"; this answers the separate
 * question of what else belongs on the table.
 *
 * GROUP ACTORS ARE EXCLUDED and that is load-bearing: a dnd5e group actor is
 * routinely owned by every player at the table, so ownership alone would drag the
 * party roster itself onto the canvas as a token.
 *
 * @returns {Array} Array of actor documents
 */
export function getOwnedNpcs() {
    return game.actors.filter(actor => (
        actor.type !== 'character'
        && actor.type !== 'group'
        && actor.hasPlayerOwner
    ));
}

/**
 * Party actors that already have a token on a scene.
 *
 * Matches on `token.actorId`, the same test clearPartyFromCanvas uses to decide
 * what to remove. Keeping the two symmetric is the point: deploy adds exactly
 * what clear would take away, so the pair round-trips instead of drifting into
 * "deployed a duplicate" or "left one behind".
 *
 * @param {Scene} [scene] defaults to the active scene
 * @returns {Set<string>} actor ids present on the scene
 */
export function getPartyActorIdsOnCanvas(scene = canvas?.scene) {
    const ids = new Set();
    for (const token of scene?.tokens ?? []) {
        if (token.actorId) ids.add(token.actorId);
    }
    return ids;
}

/**
 * Get party member UUIDs
 * @returns {Array<string>} Array of actor UUIDs
 */
export function getPartyMemberUUIDs() {
    return getPartyMembers().map(actor => actor.uuid);
}

/** The deployment patterns offered, in the order they are shown. */
const DEPLOYMENT_PATTERNS = ['grid', 'circle', 'line', 'scatter', 'sequential'];

/** Icons for the pattern picker, one per DEPLOYMENT_PATTERNS entry. */
const DEPLOYMENT_PATTERN_ICONS = {
    grid: 'fa-solid fa-grid-2',
    circle: 'fa-solid fa-circle-dot',
    line: 'fa-solid fa-grip-lines',
    scatter: 'fa-solid fa-shuffle',
    sequential: 'fa-solid fa-arrow-progress'
};

/** What each pattern actually does, so the choice does not require prior knowledge. */
const DEPLOYMENT_PATTERN_HINTS = {
    grid: 'Rows and columns around the point you click',
    circle: 'A ring around the point you click',
    line: 'A single row from the point you click',
    scatter: 'Loosely spread around the point you click',
    sequential: 'Place each member individually, one click each'
};

/**
 * Ask which formation to deploy in.
 *
 * Asking beats remembering: the pattern used to live in a world setting cycled
 * from a menubar button, which meant the answer to "how will this deploy" was
 * somewhere else entirely and you had to go and look. It is a per-deployment
 * decision, so it is asked per deployment.
 *
 * The chosen pattern is written back to the setting so it becomes the default
 * next time, which is what the cycling button was really providing.
 *
 * @returns {Promise<string|null>} the pattern, or null if dismissed
 */
async function promptDeploymentPattern({ npcCount = 0 } = {}) {
    const current = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern') || 'grid';
    const includeDefault = !!game.settings.get(MODULE.ID, 'partyDeployIncludeOwnedNpcs');

    // Tracked through a change listener rather than read off the element after the
    // dialog resolves: the node is detached by then, and depending on a detached
    // node still reporting its state is the kind of thing that works until it does
    // not. The listener also means the value is correct even if DialogV2 moves the
    // content around.
    let includeNpcs = includeDefault;

    const npcRow = npcCount
        ? `<label class="blacksmith-deploy-npcs">
               <input type="checkbox" name="include-owned-npcs"${includeDefault ? ' checked' : ''}>
               <span>Include owned NPCs (${npcCount})</span>
           </label>`
        : '';

    const outcome = await DialogAPI.choose({
        title: 'Deploy Party',
        content: `<p>How should the party be placed?</p>${npcRow}`,
        choices: DEPLOYMENT_PATTERNS.map((pattern) => ({
            id: pattern,
            label: getDeploymentPatternName(pattern),
            icon: DEPLOYMENT_PATTERN_ICONS[pattern],
            description: DEPLOYMENT_PATTERN_HINTS[pattern],
            default: pattern === current
        })),
        closeValue: null,
        onRender: (element) => {
            element?.querySelector('[name="include-owned-npcs"]')
                ?.addEventListener('change', (event) => {
                    includeNpcs = !!event.target.checked;
                });
        }
    });

    if (outcome?.action !== 'submit' || !outcome.value) return null;

    // Both answers are remembered, so the next deployment defaults to this one.
    try {
        if (outcome.value !== current) {
            await game.settings.set(MODULE.ID, 'encounterToolbarDeploymentPattern', outcome.value);
        }
        if (npcCount && includeNpcs !== includeDefault) {
            await game.settings.set(MODULE.ID, 'partyDeployIncludeOwnedNpcs', includeNpcs);
        }
    } catch (error) {
        // Not fatal: this deployment still uses what was chosen, it just will not
        // be the default next time.
        postConsoleAndNotification(MODULE.NAME, 'Party Tools: could not save the deployment choices', error?.message ?? error, false, false);
    }

    return { pattern: outcome.value, includeNpcs };
}

/**
 * Deploy party members to the canvas.
 *
 * @param {object} [options]
 * @param {string} [options.pattern] One of grid/circle/line/scatter/sequential.
 *   Supplying it SKIPS the picker -- a scripted caller must never be blocked on a
 *   dialog it did not ask for.
 * @param {boolean} [options.prompt=true] Set false to use the saved default
 *   silently without asking.
 * @param {boolean} [options.includeOwnedNpcs] Also deploy player-owned NPCs
 *   (familiars, summons, companions). Defaults to the remembered answer.
 * @returns {Promise<Array>} Array of created token documents
 */
export async function deployParty({ pattern = null, prompt = true, includeOwnedNpcs = null } = {}) {
    // Check if user has permission
    if (!game.user.isGM) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Only GMs can deploy party members", "", false, false);
        return [];
    }
    
    // Get party members
    const partyMembers = getPartyMembers();
    
    if (partyMembers.length === 0) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: No party members found", "", false, false);
        ToastAPI.show({
            title: 'Deploy Party',
            subtitle: 'No party members found. Party members are player characters.',
            icon: 'fa-solid fa-triangle-exclamation',
            duration: 4,
            moduleId: 'blacksmith-core',
            stackKey: 'blacksmith-encounter-tokens'
        });
        return [];
    }
    
    // Only the ones not already standing on the scene. Deploying the whole party
    // over the top of itself produced duplicate tokens, and the GM's only recourse
    // was to clear everyone and start again.
    const onCanvas = getPartyActorIdsOnCanvas();
    const pending = partyMembers.filter(actor => !onCanvas.has(actor.id));

    // Owned NPCs get the same already-placed treatment, so ticking the box twice
    // in a row cannot duplicate a familiar either.
    const ownedNpcs = getOwnedNpcs();
    const pendingNpcs = ownedNpcs.filter(actor => !onCanvas.has(actor.id));

    if (pending.length === 0 && pendingNpcs.length === 0) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Everyone is already on the canvas", "", true, false);
        ToastAPI.show({
            title: 'Deploy Party',
            subtitle: 'Everyone is already on this scene.',
            icon: 'fa-solid fa-users',
            duration: 4,
            moduleId: 'blacksmith-core',
            stackKey: 'blacksmith-encounter-tokens'
        });
        return [];
    }

    // An explicit pattern wins; otherwise ask, unless the caller opted out. The
    // checkbox is only offered when there is something for it to include.
    let deploymentPattern = pattern;
    let withNpcs = includeOwnedNpcs ?? !!game.settings.get(MODULE.ID, 'partyDeployIncludeOwnedNpcs');

    if (!deploymentPattern && prompt) {
        const answer = await promptDeploymentPattern({ npcCount: pendingNpcs.length });
        if (!answer) {
            postConsoleAndNotification(MODULE.NAME, 'Party Tools: deployment cancelled at the pattern picker', '', true, false);
            return [];
        }
        deploymentPattern = answer.pattern;
        // An explicit argument still wins over what the dialog reported, so a
        // caller passing includeOwnedNpcs gets what it asked for either way.
        if (includeOwnedNpcs === null) withNpcs = answer.includeNpcs;
    }
    if (!deploymentPattern) {
        deploymentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern') || 'grid';
    }

    const roster = withNpcs ? [...pending, ...pendingNpcs] : pending;
    if (roster.length === 0) {
        // Only reachable by declining the NPCs when the characters were all placed.
        postConsoleAndNotification(MODULE.NAME, 'Party Tools: nothing left to deploy', '', true, false);
        ToastAPI.show({
            title: 'Deploy Party',
            subtitle: 'Every party member is already on this scene.',
            icon: 'fa-solid fa-users',
            duration: 4,
            moduleId: 'blacksmith-core',
            stackKey: 'blacksmith-encounter-tokens'
        });
        return [];
    }

    // Counted against the roster actually being deployed, so declining the NPCs
    // does not report them as "already placed".
    const considered = withNpcs
        ? partyMembers.length + ownedNpcs.length
        : partyMembers.length;
    const alreadyPlaced = considered - roster.length;

    const partyUUIDs = roster.map(actor => actor.uuid);

    postConsoleAndNotification(MODULE.NAME, "Party Tools: Deploying party",
        `${roster.length} actor(s)${alreadyPlaced ? `, ${alreadyPlaced} already placed` : ''}`, true, false);
    postConsoleAndNotification(MODULE.NAME, "Party Tools: Party UUIDs", partyUUIDs, true, false);

    const deploymentHidden = false; // Party members should be visible by default
    
    // Deploy using shared API
    // Note: Party members are world actors, so no compendium handling needed
    let deployedTokens = [];
    
    if (deploymentPattern === "sequential") {
        // Sequential deployment (one-by-one)
        const getTooltipContent = (actorName, index, total) => {
            return `
                <div class="monster-name">${actorName}</div>
                <div class="progress">Click to place (${index} of ${total})</div>
            `;
        };
        
        deployedTokens = await deployTokensSequential(partyUUIDs, {
            deploymentHidden: deploymentHidden,
            getTooltipContent: getTooltipContent
        });
    } else {
        // Batch deployment (pattern-based)
        const getTooltipContent = (tokenCount, patternName) => {
            return `
                <div class="monster-name">Deploying Party</div>
                <div class="progress">${patternName} - Click to place ${tokenCount} party members</div>
            `;
        };
        
        // Show notification that user needs to click on canvas
        ToastAPI.show({
            title: 'Deploy Party',
            subtitle: 'Click the canvas to place the party. Right-click cancels.',
            icon: 'fa-solid fa-map-marker-alt',
            duration: 4,
            moduleId: 'blacksmith-core',
            stackKey: 'blacksmith-encounter-tokens'
        });
        
        deployedTokens = await deployTokens(partyUUIDs, {
            deploymentPattern: deploymentPattern,
            deploymentHidden: deploymentHidden,
            getTooltipContent: getTooltipContent
        });
    }
    
    if (deployedTokens.length > 0) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Party deployed successfully", `${deployedTokens.length} tokens created`, false, false);
        ToastAPI.show({
            title: 'Deploy Party',
            subtitle: `${deployedTokens.length} deployed`
                + (alreadyPlaced ? `, ${alreadyPlaced} already on the scene.` : '.'),
            icon: 'fa-solid fa-map-marker-alt',
            duration: 4,
            moduleId: 'blacksmith-core',
            stackKey: 'blacksmith-encounter-tokens'
        });
    } else {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Party deployment cancelled or failed", "", false, false);
        // Don't show error notification - user may have intentionally cancelled
    }
    
    return deployedTokens;
}

/**
 * Remove all party member tokens from the current scene.
 * GM only. Party members = player-owned characters (same as getPartyMembers).
 * @returns {Promise<number>} Number of tokens removed
 */
export async function clearPartyFromCanvas() {
    if (!game.user.isGM) {
        postConsoleAndNotification(MODULE.NAME, "Party Tools: Only GMs can clear party tokens", "", false, false);
        return 0;
    }
    // Same toast stack as the other canvas token actions (manager-encounter.js)
    // so consecutive clears replace one another rather than stacking up.
    const toast = (subtitle, icon = 'fa-solid fa-users-slash') => ToastAPI.show({
        title: 'Remove Party',
        subtitle,
        icon,
        duration: 4,
        moduleId: 'blacksmith-core',
        stackKey: 'blacksmith-encounter-tokens'
    });

    const scene = canvas?.scene;
    if (!scene) {
        toast('No active scene.', 'fa-solid fa-triangle-exclamation');
        return 0;
    }
    const partyMembers = getPartyMembers();
    const partyActorIds = new Set(partyMembers.map(a => a.id));
    const toRemove = scene.tokens.filter(t => t.actorId && partyActorIds.has(t.actorId)).map(t => t.id);
    if (toRemove.length === 0) {
        toast('No party tokens on the canvas.');
        return 0;
    }
    await scene.deleteEmbeddedDocuments('Token', toRemove);
    postConsoleAndNotification(MODULE.NAME, "Party Tools: Cleared party from canvas", `${toRemove.length} token(s) removed`, false, false);
    toast(`${toRemove.length} party token(s) removed.`);
    return toRemove.length;
}

