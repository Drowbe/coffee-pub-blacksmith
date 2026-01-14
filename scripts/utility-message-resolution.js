/**
 * Utility functions for resolving attack and damage events from Foundry chat messages.
 * 
 * This module provides message resolution utilities for dnd5e 5.2.4+ that:
 * - Handle roll hydration (v13 stores rolls as string or object)
 * - Extract stable correlation keys (not using originatingMessage which is unstable)
 * - Resolve attack messages to compute hit/miss per target
 * - Resolve damage messages and classify them (onHit vs other)
 * 
 * Designed to work with both core dnd5e and midi-qol without relying on midi-specific APIs.
 */

/**
 * Hydrate the first roll from a chat message.
 * Handles v13 roll storage formats (string, object, or Roll instance).
 * @param {ChatMessage} message - The chat message containing rolls
 * @returns {Roll|null} The hydrated Roll instance, or null if not found/invalid
 */
export function hydrateFirstRoll(message) {
    const entry = message.rolls?.[0];
    if (!entry) return null;

    // Already a Roll instance
    if (entry instanceof Roll) return entry;

    // Try string format (JSON)
    if (typeof entry === "string") {
        try {
            return Roll.fromJSON(entry);
        } catch {}
        try {
            return Roll.fromData(JSON.parse(entry));
        } catch {}
        return null;
    }

    // Try object format (Roll data)
    if (typeof entry === "object") {
        try {
            return Roll.fromData(entry);
        } catch {}
        return null;
    }

    return null;
}

/**
 * Extract stable key parts from a chat message for correlation.
 * Does NOT use originatingMessage (unstable in dnd5e 5.2.4).
 * @param {ChatMessage} message - The chat message
 * @returns {Object} Key parts: { attackerActorId, itemUuid, activityUuid, targetUuids }
 */
export function getKeyParts(message) {
    const dnd = message.flags?.dnd5e ?? {};
    const attackerActorId = message.speaker?.actor ?? null;

    const itemUuid = dnd.item?.uuid ?? null;
    const activityUuid = dnd.activity?.uuid ?? null;

    // Sort target UUIDs for stable key generation
    const targetUuids = (dnd.targets ?? [])
        .map(t => t.uuid)
        .filter(Boolean)
        .sort();

    return {
        attackerActorId,
        itemUuid,
        activityUuid,
        targetUuids
    };
}

/**
 * Create a stable cache key from key parts or message.
 * Prefers MIDI workflowId when available for better correlation.
 * @param {Object} partsOrMessage - Key parts from getKeyParts() OR the message itself
 * @returns {string} Stable cache key
 */
export function makeKey(partsOrMessage) {
    // If it's a message object, extract MIDI workflowId first
    if (partsOrMessage && typeof partsOrMessage === 'object' && 'flags' in partsOrMessage) {
        const message = partsOrMessage;
        const midi = message.flags?.["midi-qol"];
        const workflowId = midi?.workflowId;
        
        if (workflowId) {
            return `midi:${workflowId}`;
        }
        
        // Fall back to key parts extraction
        const parts = getKeyParts(message);
        return makeKey(parts);
    }
    
    // Otherwise, treat as key parts object
    const parts = partsOrMessage;
    const { attackerActorId, itemUuid, activityUuid, targetUuids } = parts;
    return [
        attackerActorId ?? "none",
        itemUuid ?? "none",
        activityUuid ?? "none",
        targetUuids.join("|") || "none"
    ].join("::");
}

/**
 * Resolve an attack message to compute hit/miss outcomes per target.
 * Supports both core dnd5e and MIDI-QOL message formats.
 * @param {ChatMessage} message - The chat message
 * @returns {AttackResolvedEvent|null} Normalized attack event, or null if not an attack message
 */
export function resolveAttackMessage(message) {
    const dnd = message.flags?.dnd5e ?? {};
    const midi = message.flags?.["midi-qol"] ?? {};
    
    // Check multiple possible locations for workflowId in MIDI flags
    // MIDI may store it in different places depending on message type/stage
    // Only check known/safe locations to avoid grabbing random IDs
    let workflowId = null;
    if (midi && typeof midi === 'object') {
        workflowId = midi.workflowId ?? 
                     midi.workflow?.id ?? 
                     midi.id ?? 
                     midi.messageType; // Some MIDI versions use messageType as identifier
        
        // If still not found, check for ChatMessage-prefixed IDs (safe pattern)
        if (!workflowId) {
            for (const [key, value] of Object.entries(midi)) {
                if (typeof value === "string" && value.startsWith("ChatMessage.")) {
                    workflowId = value;
                    break;
                }
            }
        }
    }
    
    const rolls = message.rolls ?? [];
    
    // Check for d20 roll (attack rolls typically have d20)
    // Also check message content for roll data if rolls array is empty (MIDI might store it differently)
    let hasD20 = false;
    if (rolls.length > 0) {
        hasD20 = rolls.some(r => {
            const roll = hydrateFirstRoll({ rolls: [r] });
            if (!roll) return false;
            return (roll.dice ?? []).some(d => d?.faces === 20) ||
                   (roll.terms ?? []).some(t => t?.faces === 20);
        });
    }
    
    // For MIDI, also check if workflowId exists and message has roll-like content
    // MIDI might create the message before rolls are fully populated
    // Check for workflowId as a strong signal of an attack workflow
    const hasWorkflowId = !!workflowId;
    
    // Check if MIDI flags exist (even without workflowId)
    const hasMidiFlags = midi && typeof midi === 'object' && Object.keys(midi).length > 0;
    
    // ----------------------------
    // Attack classification
    // ----------------------------
    
    // Normalize roll/activity types
    const rollType = (dnd?.roll?.type ?? "").toLowerCase();
    const activityType = (dnd?.activity?.type ?? "").toLowerCase();
    
    // Early exits: these are definitely NOT attacks
    // Check these BEFORE any classification logic to avoid false positives
    if (rollType === "damage" || rollType === "heal" || rollType === "usage") {
        return null;
    }
    if (activityType === "heal" || activityType === "damage" || activityType === "usage") {
        return null;
    }
    
    // Exclusions: these are very commonly misclassified if we get too loose
    const excludedRollTypes = new Set(["check", "save", "damage", "heal", "usage"]);
    const excludedActivityTypes = new Set([
        "check", "save", "damage", "heal",
        // dnd5e uses these too depending on version/content
        "abil", "skill", "tool", "save"
    ]);
    
    const isExcluded =
        excludedRollTypes.has(rollType) ||
        excludedActivityTypes.has(activityType);
    
    // Tier 1: explicit roll type (backward compat)
    const hasExplicitAttackType = rollType === "attack";
    
    // Tier 2: activity types that strongly imply an attack roll
    // These are common dnd5e activity types for attacks/spells
    const activityIsAttack = ["mwak", "rwak", "msak", "rsak", "attack"].includes(activityType);
    
    // Tier 3: heuristic (be careful - do NOT require targets)
    // Core messages may not include dnd.targets even when it's an attack
    const hasItem =
        !!(dnd?.item?.uuid) ||
        !!(midi?.itemUuid) ||
        !!(midi?.item?.uuid);
    
    // Prefer "d20 + item" as the heuristic, but only if not excluded
    const heuristicAttack = hasD20 && hasItem && !isExcluded;
    
    // Core attack if any tier passes
    const isCoreAttack = (hasExplicitAttackType || activityIsAttack || heuristicAttack);
    
    // MIDI attack: allow MIDI lane, but still respect exclusions.
    // workflowId alone is not enough, because heals/features also have workflows.
    const isMidiAttack =
        (hasWorkflowId || hasMidiFlags) &&
        !isExcluded &&
        (hasExplicitAttackType || activityIsAttack || hasD20 || rolls.length > 0);
    
    if (!isCoreAttack && !isMidiAttack) {
        return null;
    }

    // Debug log to help diagnose false positives
    // Note: hasItem is calculated below, so we'll compute it here for the log
    const hasItemForLog = !!(dnd?.item?.uuid) || !!(midi?.itemUuid) || !!(midi?.item?.uuid);
    console.debug("resolveAttackMessage: accepted", {
        id: message.id,
        rollType,
        activityType,
        hasD20,
        hasItem: hasItemForLog,
        hasWorkflowId,
        hasMidiFlags,
        isCoreAttack,
        isMidiAttack
    });

    const roll = hydrateFirstRoll(message);
    const total = roll?.total ?? null;

    // Extract attacker info
    const attackerActorId = message.speaker?.actor ?? null;
    
    // Extract item info (can be in dnd5e or midi flags)
    const itemUuid = dnd?.item?.uuid ?? 
                     midi?.itemUuid ?? 
                     midi?.item?.uuid ?? 
                     null;
    
    const activityUuid = dnd?.activity?.uuid ?? null;
    const itemType = dnd?.item?.type ?? null;

    // Extract targets with AC information
    const targets = Array.isArray(dnd.targets) ? dnd.targets : [];
    const outcomes = targets.map(t => {
        const targetUuid = t.uuid ?? null;
        const ac = typeof t.ac === "number" ? t.ac : null;
        const hit = (typeof total === "number" && typeof ac === "number") 
            ? total >= ac 
            : null;

        return {
            uuid: targetUuid,
            ac: ac,
            hit: hit
        };
    });

    // Separate targets by outcome
    const hitTargets = outcomes.filter(o => o.hit === true).map(o => o.uuid).filter(Boolean);
    const missTargets = outcomes.filter(o => o.hit === false).map(o => o.uuid).filter(Boolean);
    const unknownTargets = outcomes.filter(o => o.hit === null).map(o => o.uuid).filter(Boolean);

    // Use workflowId-based key for MIDI, fallback to key parts for core
    const key = workflowId ? `midi:${workflowId}` : makeKey(getKeyParts(message));

    return {
        type: "attack",
        key: key,
        ts: message.timestamp ?? Date.now(),
        attackerActorId: attackerActorId,
        itemUuid: itemUuid,
        activityUuid: activityUuid,
        targets: outcomes,
        hitTargets: hitTargets,
        missTargets: missTargets,
        unknownTargets: unknownTargets,
        attackTotal: typeof total === "number" ? total : null,
        itemType: itemType,
        attackMsgId: message.id,
        workflowId: workflowId // Store for correlation
    };
}

/**
 * Resolve a damage message and extract damage total.
 * Supports both core dnd5e and MIDI-QOL message formats.
 * Does NOT determine hit/miss - that requires correlation with attack message.
 * @param {ChatMessage} message - The chat message
 * @returns {DamageResolvedEvent|null} Normalized damage event, or null if not a damage message
 */
export function resolveDamageMessage(message) {
    const dnd = message.flags?.dnd5e ?? {};
    const midi = message.flags?.["midi-qol"] ?? {};
    const workflowId = midi.workflowId;
    
    const rolls = message.rolls ?? [];
    if (!rolls.length) return null;
    
    // Check activity type for healing
    const activityType = dnd?.activity?.type;
    const isHeal = activityType === "heal";
    
    // Core dnd5e: check roll type
    const isCoreDamage = (dnd?.roll?.type ?? "").toLowerCase() === "damage";
    
    // MIDI: workflowId + any roll (non-heal) indicates damage
    // Damage messages typically don't have d20 rolls
    const hasD20 = rolls.some(r => {
        const roll = hydrateFirstRoll({ rolls: [r] });
        if (!roll) return false;
        return (roll.dice ?? []).some(d => d?.faces === 20) ||
               (roll.terms ?? []).some(t => t?.faces === 20);
    });
    const isMidiDamage = workflowId && !hasD20 && !isHeal;
    
    if (!isCoreDamage && !isMidiDamage && !isHeal) {
        return null;
    }

    const roll = hydrateFirstRoll(message);
    if (!roll) return null;

    // Extract attacker info
    const attackerActorId = message.speaker?.actor ?? null;
    
    // Extract item info (can be in dnd5e or midi flags)
    const itemUuid = dnd?.item?.uuid ?? 
                     midi?.itemUuid ?? 
                     midi?.item?.uuid ?? 
                     null;
    
    const itemType = dnd?.item?.type ?? null;
    
    // Extract target UUIDs from message flags (most reliable source)
    // Ensure it's always an array, even if empty
    const targetUuids = Array.isArray(dnd.targets)
        ? dnd.targets.map(t => t.uuid).filter(Boolean)
        : [];

    // Use workflowId-based key for MIDI, fallback to key parts for core
    const key = workflowId ? `midi:${workflowId}` : makeKey(getKeyParts(message));

    return {
        type: "damage",
        key: key,
        ts: message.timestamp ?? Date.now(),
        damageTotal: roll.total,
        formula: roll.formula,
        itemType: itemType,
        itemUuid: itemUuid,
        attackerActorId: attackerActorId,
        targetUuids: targetUuids, // Always an array, from message flags
        bucket: isHeal ? "heal" : null, // Will be set during correlation for damage
        damageMsgId: message.id,
        attackMsgId: null, // Will be set during correlation if found
        workflowId: workflowId // Store for correlation
    };
}
