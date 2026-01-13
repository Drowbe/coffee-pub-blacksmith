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
 * Create a stable cache key from key parts.
 * @param {Object} parts - Key parts from getKeyParts()
 * @returns {string} Stable cache key
 */
export function makeKey(parts) {
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
 * @param {ChatMessage} message - The chat message (must be an attack message)
 * @returns {AttackResolvedEvent|null} Normalized attack event, or null if not an attack message
 */
export function resolveAttackMessage(message) {
    const dnd = message.flags?.dnd5e;
    if ((dnd?.roll?.type ?? "").toLowerCase() !== "attack") {
        return null;
    }

    const roll = hydrateFirstRoll(message);
    const total = roll?.total ?? null;

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

    const parts = getKeyParts(message);

    return {
        type: "attack",
        key: makeKey(parts),
        ts: Date.now(),
        attackerActorId: parts.attackerActorId,
        itemUuid: parts.itemUuid,
        activityUuid: parts.activityUuid,
        targets: outcomes,
        hitTargets: hitTargets,
        missTargets: missTargets,
        unknownTargets: unknownTargets,
        attackTotal: typeof total === "number" ? total : null,
        itemType: dnd.item?.type ?? null,
        attackMsgId: message.id
    };
}

/**
 * Resolve a damage message and extract damage total.
 * Does NOT determine hit/miss - that requires correlation with attack message.
 * @param {ChatMessage} message - The chat message (must be a damage message)
 * @returns {DamageResolvedEvent|null} Normalized damage event, or null if not a damage message
 */
export function resolveDamageMessage(message) {
    const dnd = message.flags?.dnd5e;
    if ((dnd?.roll?.type ?? "").toLowerCase() !== "damage") {
        return null;
    }

    const roll = hydrateFirstRoll(message);
    if (!roll) return null;

    const parts = getKeyParts(message);
    
    // Extract target UUIDs from message flags (most reliable source)
    // Ensure it's always an array, even if empty
    const targetUuids = (dnd.targets ?? [])
        .map(t => t.uuid)
        .filter(Boolean) ?? [];

    return {
        type: "damage",
        key: makeKey(parts),
        ts: Date.now(),
        damageTotal: roll.total,
        formula: roll.formula,
        itemType: dnd.item?.type ?? null,
        itemUuid: parts.itemUuid,
        attackerActorId: parts.attackerActorId,
        targetUuids: targetUuids, // Always an array, from message flags
        bucket: null, // Will be set during correlation
        damageMsgId: message.id,
        attackMsgId: null // Will be set during correlation if found
    };
}
