/**
 * Utility functions for resolving MIDI-QOL workflow events to normalized attack/damage events.
 * 
 * This module provides workflow resolution utilities that:
 * - Extract workflow IDs and build stable correlation keys
 * - Detect crit/fumble from multiple sources (workflow flags, roll flags, d20 inspection)
 * - Detect healing from workflow and dnd5e flags
 * - Convert MIDI workflows to normalized event shapes (matching message resolution output)
 * - Provide deduplication helpers for per-target processing
 * 
 * Designed to be shared by both player stats (lifetime) and combat stats (round/combat).
 * 
 * NOTE: This module does NOT import utility-message-resolution.js to avoid circular dependencies.
 * If callers need message-based fallback keying, they should import makeKey/getKeyParts directly.
 */

/**
 * Extract workflow ID from MIDI workflow object.
 * Conservative approach: only check known properties, don't guess.
 * Only accepts IDs that look like real workflow/message identifiers, not semantic labels.
 * @param {Object} workflow - MIDI workflow object
 * @returns {string|null} Workflow ID or null if not found
 */
export function getWorkflowId(workflow) {
    if (!workflow || typeof workflow !== 'object') return null;
    
    // Known semantic labels that are NOT IDs (reject these)
    const BAD_IDS = new Set(["attack", "damage", "heal", "usage", "check", "save"]);
    
    /**
     * Validate if a string looks like a real workflow/message ID.
     * Accepts:
     * - ChatMessage. prefixed strings
     * - Foundry-style IDs (alphanumeric, length 10+)
     * - UUID-like strings (contains dots and segments)
     * Rejects:
     * - Semantic labels (attack, damage, heal, etc.)
     * - Short strings (< 10 chars)
     * - Strings with spaces
     */
    function isProbablyId(s) {
        if (!s || typeof s !== "string") return false;
        const v = s.trim();
        if (!v) return false;
        
        // Reject known semantic labels
        if (BAD_IDS.has(v.toLowerCase())) return false;
        
        // Reject short strings (not likely to be IDs)
        if (v.length < 10) return false;
        
        // Reject strings with spaces (not IDs)
        if (/\s/.test(v)) return false;
        
        // Accept ChatMessage. prefixed strings (safe pattern)
        if (v.startsWith("ChatMessage.")) return true;
        
        // Accept Foundry-style IDs (alphanumeric, long-ish)
        if (/^[a-zA-Z0-9]{10,}$/.test(v)) return true;
        
        // Accept UUID-like strings (contains dots and segments, like Scene.X.Token.Y)
        // Though workflow IDs usually aren't this format, some MIDI versions might use it
        if (v.includes(".") && v.split(".").length >= 2) {
            return true;
        }
        
        return false;
    }
    
    // Check known properties in order of preference
    const candidates = [
        workflow.workflowId,
        workflow.id,
        workflow.uuid,
        workflow.itemCardId,
        workflow.chatMessageId,
        workflow.messageId
    ];
    
    // Return first candidate that passes validation
    for (const candidate of candidates) {
        if (isProbablyId(candidate)) {
            return candidate;
        }
    }
    
    return null;
}

/**
 * Get stable correlation key from MIDI workflow.
 * Returns workflowId-based key, or null if workflowId cannot be determined.
 * 
 * NOTE: This function does NOT fall back to message-based keying to avoid circular dependencies.
 * If callers need a fallback, they should call this first, and if it returns null, then call
 * `makeKey(getKeyParts(message))` from utility-message-resolution.js.
 * 
 * @param {Object} workflow - MIDI workflow object
 * @returns {string|null} Stable cache key (`midi:${workflowId}`) or null if cannot be determined
 */
export function getWorkflowKey(workflow) {
    const workflowId = getWorkflowId(workflow);
    
    if (workflowId) {
        return `midi:${workflowId}`;
    }
    
    // No workflowId - return null (caller should handle fallback if needed)
    return null;
}

/**
 * Extract and normalize preTargetDamageApplication hook arguments.
 * Handles MIDI version variations in argument shapes.
 * @param {*} arg1 - First argument (token or combined object)
 * @param {*} arg2 - Second argument (data object, if present)
 * @returns {Object|null} { token, data, workflow } or null if invalid
 */
export function extractPreTargetDamageArgs(arg1, arg2) {
    let token = null;
    let data = null;
    
    // Format 1: (token, data) where data is an object
    if (arg1 && arg2 && typeof arg2 === 'object') {
        token = arg1;
        data = arg2;
    }
    // Format 2: (combinedObject) where object has token, workflow, or damageItem properties
    else if (arg1 && typeof arg1 === 'object' && (arg1.token || arg1.workflow || arg1.damageItem)) {
        token = arg1.token ?? null;
        data = arg1;
    }
    else {
        return null;
    }
    
    const workflow = data?.workflow;
    if (!workflow) return null;
    
    return { token, data, workflow };
}

/**
 * Detect crit/fumble from MIDI workflow using multiple sources.
 * Checks workflow flags, roll flags, and d20 inspection (handles advantage/disadvantage).
 * @param {Object} options - Options object
 * @param {Object} options.workflow - MIDI workflow object
 * @param {Roll|null} options.attackRoll - Attack roll object (may be null)
 * @returns {Object} { isCritical, isFumble, sources: {...} }
 */
export function getCritFumbleFromWorkflow({ workflow, attackRoll = null }) {
    // Source 1: Workflow flags (primary signal)
    const wfCrit = !!workflow?.isCritical;
    const wfFumble = !!workflow?.isFumble;
    
    // Source 2: Roll flags (secondary signal)
    const rollCrit = !!attackRoll?.isCritical || !!attackRoll?.options?.critical;
    const rollFumble = !!attackRoll?.isFumble || !!attackRoll?.options?.fumble;
    
    // Source 3: Fallback - inspect d20 results (handles advantage/disadvantage)
    let d20Results = [];
    let d20Active = [];
    let natCrit = false;
    let natFumble = false;
    
    try {
        const d20Dice = (attackRoll?.dice ?? []).filter(d => d?.faces === 20);
        for (const die of d20Dice) {
            const results = Array.isArray(die?.results) ? die.results : [];
            for (const r of results) {
                if (typeof r?.result === "number") {
                    d20Results.push(r.result);
                    // Active/kept results (for advantage/disadvantage)
                    if (r.active !== false) {
                        d20Active.push(r.result);
                    }
                }
            }
        }
        
        // Use active results if available, otherwise all results
        const d20Used = d20Active.length > 0 ? d20Active : d20Results;
        natCrit = d20Used.includes(20);
        natFumble = d20Used.includes(1);
    } catch (_) {
        // If d20 inspection fails, rely on flags only
    }
    
    // Combine all sources (any source indicating crit/fumble is sufficient)
    const isCritical = wfCrit || rollCrit || natCrit;
    const isFumble = wfFumble || rollFumble || natFumble;
    
    return {
        isCritical,
        isFumble,
        sources: {
            wfCrit,
            wfFumble,
            rollCrit,
            rollFumble,
            natCrit,
            natFumble,
            d20Used: d20Active.length > 0 ? d20Active : d20Results
        }
    };
}

/**
 * Detect if workflow represents healing.
 * Simple and consistent: checks dnd5e activity type and MIDI isHealing flag.
 * @param {Object} options - Options object
 * @param {Object} options.workflow - MIDI workflow object
 * @param {Object|null} options.dndFlags - dnd5e flags object (from message.flags.dnd5e)
 * @returns {boolean} True if healing, false otherwise
 */
export function isHealingFromWorkflow({ workflow, dndFlags = null }) {
    // Core: activity.type === "heal" is the reliable signal
    if (dndFlags?.activity?.type === "heal") {
        return true;
    }
    
    // MIDI: workflow.isHealing flag (if MIDI exposes it reliably)
    if (workflow?.isHealing === true) {
        return true;
    }
    
    // For preTargetDamageApplication: negative damage indicates healing
    // (This is handled by the caller, not here, to keep this function simple)
    
    return false;
}

/**
 * Build normalized AttackResolvedEvent from MIDI workflow.
 * Converts workflow to same shape as resolveAttackMessage() output.
 * @param {Object} workflow - MIDI workflow object
 * @returns {Object|null} AttackResolvedEvent or null if workflow invalid
 */
export function buildAttackEventFromWorkflow(workflow) {
    if (!workflow || typeof workflow !== 'object') return null;
    
    const attacker = workflow.actor;
    if (!attacker) return null;
    
    const workflowId = getWorkflowId(workflow);
    if (!workflowId) return null;
    
    const key = `midi:${workflowId}`;
    
    // Extract item
    const item = workflow.item;
    const itemUuid = item?.uuid ?? workflow.itemUuid ?? null;
    const itemType = item?.type ?? null;
    
    // Extract attack roll total
    const attackRoll = workflow.attackRoll;
    const attackTotal = (typeof attackRoll?.total === 'number') ? attackRoll.total : null;
    
    // Extract targets - reliable miss list calculation
    // Helper to normalize target UUIDs
    const toUuid = (t) => t?.document?.uuid ?? t?.uuid ?? t?.actor?.uuid ?? null;
    
    // Get all targets and hit targets
    const allTargets = Array.from(workflow.targets ?? []).map(toUuid).filter(Boolean);
    const hitTargets = Array.from(workflow.hitTargets ?? []).map(toUuid).filter(Boolean);
    
    // Calculate miss targets: all targets minus hit targets
    // (Don't rely on workflow.missTargets/missedTargets as MIDI versions vary)
    const missTargets = allTargets.filter(uuid => !hitTargets.includes(uuid));
    
    // Check for explicit miss list (some MIDI versions provide this)
    const explicitMiss = Array.from(workflow.missedTargets ?? workflow.missTargets ?? []).map(toUuid).filter(Boolean);
    const finalMissTargets = explicitMiss.length > 0 ? explicitMiss : missTargets;
    
    // Build targets array with outcomes (for compatibility with message resolution format)
    const targets = allTargets.map(uuid => {
        const isHit = hitTargets.includes(uuid);
        const isMiss = finalMissTargets.includes(uuid);
        return {
            uuid,
            ac: null, // AC not available from workflow
            hit: isHit ? true : (isMiss ? false : null)
        };
    });
    
    return {
        type: 'attack',
        key,
        ts: Date.now(),
        attackerActorId: attacker.id,
        itemUuid,
        activityUuid: null, // Not available from workflow
        targets,
        hitTargets,
        missTargets: finalMissTargets,
        unknownTargets: [], // All targets are known from workflow
        attackTotal,
        itemType,
        attackMsgId: workflow.itemCardId ?? null,
        workflowId
    };
}

/**
 * Build normalized DamageResolvedEvent from MIDI workflow and target.
 * Converts workflow + target to same shape as resolveDamageMessage() output.
 * @param {Object} workflow - MIDI workflow object
 * @param {string} targetUuid - Target UUID (token or actor)
 * @param {number} amount - Damage/healing amount (absolute value)
 * @param {string|null} bucket - Damage bucket ("onHit", "other", "heal", or null)
 * @returns {Object|null} DamageResolvedEvent or null if workflow invalid
 */
export function buildDamageEventFromWorkflow(workflow, targetUuid, amount, bucket = null) {
    if (!workflow || typeof workflow !== 'object') return null;
    if (!targetUuid || typeof targetUuid !== 'string') return null;
    if (typeof amount !== 'number' || amount <= 0) return null;
    
    const workflowId = getWorkflowId(workflow);
    if (!workflowId) return null;
    
    const key = `midi:${workflowId}`;
    
    // Extract attacker
    const attacker = workflow.actor;
    if (!attacker) return null;
    
    // Extract item
    const item = workflow.item;
    const itemUuid = item?.uuid ?? workflow.itemUuid ?? null;
    const itemType = item?.type ?? null;
    
    // Determine bucket if not provided
    // If bucket is null, infer from workflow (healing vs damage)
    let finalBucket = bucket;
    if (finalBucket === null) {
        // Check if this is healing (negative damage in MIDI)
        // Note: amount is already absolute value, so we check workflow flags
        const isHealing = isHealingFromWorkflow({ workflow });
        finalBucket = isHealing ? "heal" : null; // Will be set during correlation for damage
    }
    
    return {
        type: "damage",
        key,
        ts: Date.now(),
        damageTotal: amount,
        formula: null, // Not available from workflow directly
        itemType,
        itemUuid,
        attackerActorId: attacker.id,
        targetUuids: [targetUuid], // Single target per call
        bucket: finalBucket,
        damageMsgId: null, // Not available from workflow
        attackMsgId: null, // Will be set during correlation
        workflowId
    };
}

/**
 * Create a TTL-based deduplication tracker.
 * Prevents double-counting when hooks fire multiple times for the same event.
 * @param {number} ttlMs - Time-to-live in milliseconds (default: 20000 = 20 seconds)
 * @returns {Object} { isDuplicate(key), markProcessed(key) }
 */
export function createDedupeTracker(ttlMs = 20000) {
    const cache = new Map(); // key -> timestamp
    
    /**
     * Check if key is duplicate (exists and not expired).
     * Also prunes expired entries.
     * @param {string} key - Deduplication key
     * @returns {boolean} True if duplicate, false if new
     */
    function isDuplicate(key) {
        if (typeof key !== 'string' || !key.length) return false;
        
        const now = Date.now();
        
        // Prune expired entries
        for (const [k, ts] of cache.entries()) {
            if (now - ts > ttlMs) {
                cache.delete(k);
            }
        }
        
        // Check if key exists and is not expired
        const cached = cache.get(key);
        if (cached && (now - cached) <= ttlMs) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Mark key as processed (add to cache with current timestamp).
     * @param {string} key - Deduplication key
     */
    function markProcessed(key) {
        if (typeof key !== 'string' || !key.length) return;
        cache.set(key, Date.now());
    }
    
    return {
        isDuplicate,
        markProcessed
    };
}
