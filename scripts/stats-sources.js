/**
 * Where combat statistics come from: the dnd5e system, midi-qol, chat messages,
 * and the socket that carries a player's rolls to the GM.
 *
 * Everything in here is an ADAPTER. It listens to something Blacksmith does not
 * own, works out what happened, and tells the tracker. It decides nothing about
 * what a statistic means -- `stats-combat.js` owns the accumulator and the
 * rules; this file owns the translation. The practical payoff is that a
 * midi-qol release breaks one file instead of an arbitrary slice of a
 * 5,000-line class.
 *
 * THREE SOURCES FOR THE SAME EVENT, deliberately. An attack can arrive as a
 * dnd5e roll hook, as a midi-qol workflow, or as a chat message, depending on
 * what the world has installed. They are not redundant and they do not all fire
 * -- the handlers dedupe through `_pruneAttackCache` and the resolution
 * utilities so one swing is counted once.
 *
 * PLAYERS FORWARD, THE GM RECORDS. Tracking is GM-gated so there is a single
 * writer, but a player's client is where their own roll happens. `_forwardToGM`
 * sends the event over SocketLib and the `_onSocket*` handlers are the GM-side
 * receivers. So this is a distributed path: a bug here can look like "stats
 * only work when the GM rolls", which is the shape to recognise.
 *
 * WHY THE IMPORT IS A CYCLE, AND WHY THAT IS THE SAFE CHOICE HERE. This file
 * imports `CombatStats` and `stats-combat.js` imports `CombatSources` back --
 * unlike `stats-cards.js`, which is loaded lazily to avoid exactly that. The
 * difference is when the dependency is needed. Cards are needed when a card is
 * sent, so a lazy import there costs nothing. These handlers are needed during
 * hook and socket REGISTRATION, inside `_registerHooks`, which `initialize()`
 * calls synchronously; a lazy import would force that path to become async,
 * putting an await into the bootstrap sequence that §3 of
 * `architecture-blacksmith.md` warns about. The cycle is the harmless kind --
 * neither module touches the other while its own body evaluates, every
 * cross-reference being inside a method that runs later -- and no static field
 * initializer crosses the boundary. That last condition is what makes it safe;
 * if you add a `static X = CombatStats.something` here, it will break.
 *
 * WHAT IS LEFT. Phase 4 moved this file's own state here -- the caches above --
 * so the tracker no longer holds bookkeeping it never used. What remains is the
 * mutation path: `_ensureParticipantStats` and `_ensureCombatTotals` hand back
 * live references into the accumulator, and the handlers write through them.
 * The shape that wants is an event this file returns and the tracker applies,
 * with every mutation owned by one side. That is a behaviour change rather than
 * a move, so it is deliberately not done here; it is tracked in `TODO.md` and
 * described in `documentation/architecture/architecture-stats.md`.
 *
 * The `_process*` calls are already the right shape and should stay: they say
 * what happened and let the tracker decide what it means.
 */

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { resolveAttackMessage, resolveDamageMessage, makeKey, hydrateFirstRoll } from './utility-message-resolution.js';
import {
    buildAttackEventFromWorkflow,
    createDedupeTracker,
    extractPreTargetDamageArgs,
    getCritFumbleFromWorkflow,
    getWorkflowKey,
    isMidiIntegrationEnabled
} from './utility-midi-resolution.js';
import { CombatStats } from './stats-combat.js';

export class CombatSources {
    // ===== CORRELATION AND DEDUPE STATE =====
    //
    // This is the adapter's own bookkeeping and it lives here rather than on the
    // tracker, which is where it used to sit. Its whole purpose is to reconcile
    // the several ways one swing reaches us -- a dnd5e roll hook, a midi-qol
    // workflow, and a chat message can all describe the same attack, arriving in
    // any order and sometimes more than once. Deciding "these are the same event"
    // and "this one already counted" is a translation problem, not a statistics
    // problem, and the accumulator is better off never knowing about it.
    //
    // The tracker reaches back for three of these through the accessors below.
    // Those calls are deliberate and few; if the list grows, the boundary is
    // being eroded again.

    /** Attack events awaiting their damage event. key -> { attackEvent, processedDamageMsgIds, ts } */
    static _attackCache = new Map();
    /** How long an unmatched attack stays correlatable. */
    static ATTACK_TTL_MS = 15_000;

    /** midi-qol reports crit before damage; hold it until the damage arrives. */
    static _pendingMidiCrit = new Map();
    static _midiDedupe = createDedupeTracker(20_000);

    /** createChatMessage and updateChatMessage can both describe one message. */
    static _chatDedupe = createDedupeTracker(30_000);

    /** MVP fairness: one successful offensive activation per workflow per round. */
    static _roundOffenseCache = new Set();

    /**
     * Crit-ness of the most recent attack, for the damage roll that follows it.
     *
     * The non-midi path splits one attack across two system events with nothing
     * linking them, so this carries the answer forward. It is correlation, which
     * is why it belongs here -- the tracker only ever wrote it and never read it,
     * which is to say it was pushing state to this file through a shared field.
     */
    static _lastRollWasCritical = false;

    /** The attack event cached for `key`, if it has not expired. */
    static getCachedAttack(key) {
        return CombatSources._attackCache.get(key) ?? null;
    }

    /** Called by the tracker when a new round starts. */
    static resetRound() {
        CombatSources._roundOffenseCache = new Set();
    }

    /** Called by the tracker after it processes an attack, for the damage that follows. */
    static noteAttackCritical(isCritical) {
        CombatSources._lastRollWasCritical = !!isCritical;
    }

    /**
     * The kept d20 face from a roll, or null. Reading a system's roll structure is
     * translation, which is why it moved here with the rest -- the tracker declared
     * it and never called it.
     */
    static _getD20ResultFromRoll(roll) {
        if (!roll) return null;

        // DiceTerm may appear in roll.dice or roll.terms depending on context/system
        const d20Term =
            roll.dice?.find(t => t?.faces === 20) ??
            roll.terms?.find(t => t?.faces === 20) ??
            null;

        if (!d20Term?.results?.length) return null;

        // Foundry marks kept die results as active
        const active = d20Term.results.find(r => r?.active);
        if (active?.result != null) return active.result;

        // Fallback: if nothing is marked active, take the first numeric result
        const first = d20Term.results.find(r => typeof r?.result === "number");
        return first?.result ?? null;
    }

    static async _forwardToGM(eventName, payload) {
        try {
            const socket = SocketManager.getSocket();
            if (!socket) return false;

            // Preferred (SocketLib): execute on GM only
            if (typeof socket.executeAsGM === 'function') {
                postConsoleAndNotification(MODULE.NAME, 'STATS SOCKETS | Forward (executeAsGM)', { eventName }, true, false);
                await socket.executeAsGM(eventName, payload);
                return true;
            }

            // Fallback: broadcast to others; GM-side handler should ignore if not GM.
            if (typeof socket.emit === 'function') {
                postConsoleAndNotification(MODULE.NAME, 'STATS SOCKETS | Forward (emit fallback)', { eventName }, true, false);
                socket.emit(eventName, payload);
                return true;
            }
        } catch (_) {}
        return false;
    }

    // Get crit/fumble flags from roll, context, or d20 result
    static _getCritFumbleFlags({ roll, context, d20Result }) {
        // If the system tells us directly, trust it
        const ctxCrit = context?.isCritical ?? context?.critical;
        const ctxFumble = context?.isFumble ?? context?.fumble;

        // Some rolls expose helpers
        const rollCrit = roll?.isCritical;
        const rollFumble = roll?.isFumble;

        const isCritical =
            (typeof ctxCrit === "boolean" ? ctxCrit : undefined) ??
            (typeof rollCrit === "boolean" ? rollCrit : undefined) ??
            (typeof d20Result === "number" ? d20Result === 20 : false);

        const isFumble =
            (typeof ctxFumble === "boolean" ? ctxFumble : undefined) ??
            (typeof rollFumble === "boolean" ? rollFumble : undefined) ??
            (typeof d20Result === "number" ? d20Result === 1 : false);

        return { isCritical, isFumble };
    }

    /**
     * Derive crit/fumble from a hydrated chat attack roll.
     * Prefer explicit flags when present; fallback to kept/active d20 results.
     * @param {Roll|null} roll
     * @returns {{isCritical: boolean, isFumble: boolean}}
     */
    static _getCritFumbleFromChatAttackRoll(roll) {
        if (!roll) return { isCritical: false, isFumble: false };
        
        // If the roll already exposes crit/fumble helpers, trust them.
        const rollCrit = roll?.isCritical ?? roll?.options?.critical;
        const rollFumble = roll?.isFumble ?? roll?.options?.fumble;
        if (typeof rollCrit === "boolean" || typeof rollFumble === "boolean") {
            return {
                isCritical: typeof rollCrit === "boolean" ? rollCrit : false,
                isFumble: typeof rollFumble === "boolean" ? rollFumble : false
            };
        }
        
        // Fallback: inspect d20 results, preferring active/kept for adv/dis.
        try {
            const d20Dice = (roll?.dice ?? []).filter(d => d?.faces === 20);
            const all = [];
            const active = [];
            
            for (const die of d20Dice) {
                const results = Array.isArray(die?.results) ? die.results : [];
                for (const r of results) {
                    if (typeof r?.result !== "number") continue;
                    all.push(r.result);
                    if (r.active !== false) active.push(r.result);
                }
            }
            
            const used = active.length ? active : all;
            return {
                isCritical: used.includes(20),
                isFumble: used.includes(1)
            };
        } catch (_) {
            return { isCritical: false, isFumble: false };
        }
    }

    // Normalize roll hook arguments for dnd5e v5.2.x
    // In v5.2.x: first arg is array of Rolls, second arg is context object
    static _normalizeRollHookArgs(a, b) {
        const rolls =
            Array.isArray(a) ? a :
            Array.isArray(b) ? b :
            [a, b].filter(r => r && typeof r.total === "number");

        const context =
            Array.isArray(a) ? b :
            Array.isArray(b) ? a :
            (b && typeof b === "object" ? b : null);

        // Try hard to find the Item
        const item =
            (a instanceof Item) ? a :
            (b instanceof Item) ? b :
            context?.item ??
            context?.subject?.item ??
            context?.subject?.parent?.parent ??   // activity -> activities -> item
            context?.activity?.parent ??
            null;

        return { rolls, context, item };
    }

    // Damage roll handler - NARROWED to only socket forwarding for non-GM clients
    // Damage tracking is now handled by createChatMessage hook (_processResolvedDamage)
    static async _onDamageRoll(a, b) {
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // MIDI lane is authoritative for damage; avoid double counting by also forwarding core damage rolls.
        if (isMidiIntegrationEnabled()) {
            if (!game.user.isGM) {
                postConsoleAndNotification(MODULE.NAME, 'STATS SOCKETS | Skip cpbTrackDamage (MIDI active)', {}, true, false);
            }
            return;
        }

        try {
            const { rolls, context, item } = CombatSources._normalizeRollHookArgs(a, b);
            if (!item || !item.id) return;

            const validRolls = (rolls || []).filter(r => r && typeof r.total === "number");
            if (!validRolls.length) return;

            // Get amount - sum all rolls if multiple damage lines
            const amount = validRolls.reduce((sum, r) => sum + r.total, 0);
            if (!amount || amount <= 0) return;

            // Forward to GM if needed (for socket handlers - non-GM clients forward to GM)
            if (!game.user.isGM) {
                const socket = SocketManager.getSocket();
                if (socket?.executeAsGM) {
                    const targetTokenUuids = Array.from(game.user.targets || [])
                        .map(t => t?.document?.uuid)
                        .filter(Boolean);

                    await socket.executeAsGM("cpbTrackDamage", {
                        itemUuid: item.uuid,
                        total: amount,
                        rolls: validRolls.map(r => ({ total: r.total, formula: r.formula })),
                        targetTokenUuids
                    });
                }
                return;
            }

            // GM path: Damage tracking is now handled by createChatMessage hook via _processResolvedDamage
            // This hook is narrowed to only socket forwarding to avoid double-counting
        } catch (error) {
            // Catch any errors to prevent breaking the hook chain for other modules (e.g., midi-qol)
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error in _onDamageRoll:', error, false, false);
            console.error('Combat Stats - _onDamageRoll error:', error);
        }
    }

    // Add new method to track pre-damage rolls
    static _onPreDamageRoll(item, config) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        if (config.critical) {
            CombatSources._lastRollWasCritical = true;
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Critical hit detected', "", true, false);
        }
    }

    // Attack roll handler - NARROWED to only crit/fumble detection and socket forwarding
    // Hit/miss tracking is now handled by createChatMessage hook (_processResolvedAttack)
    static async _onAttackRoll(a, b) {
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // MIDI lane is authoritative for crit/fumble; avoid double counting
        if (isMidiIntegrationEnabled()) return;

        const { rolls, context, item } = CombatSources._normalizeRollHookArgs(a, b);
        const rollObj = rolls?.[0];

        if (!rollObj || rollObj.total === undefined) return;
        if (!item || !item.id) return;

        // Forward to GM if needed (for socket handlers - non-GM clients forward to GM)
        if (!game.user.isGM) {
            const socket = SocketManager.getSocket();
            if (socket?.executeAsGM) {
                const d20Result = CombatSources._getD20ResultFromRoll(rollObj);
                const { isCritical, isFumble } = CombatSources._getCritFumbleFlags({ roll: rollObj, context, d20Result });

                await socket.executeAsGM("cpbTrackAttack", {
                    itemUuid: item.uuid,
                    rollTotal: rollObj.total,
                    d20Result: d20Result,
                    isCritical: isCritical,
                    isFumble: isFumble
                });
            }
            return;
        }

        // GM path: only track crit/fumble (set _lastRollWasCritical flag for damage processing)
        const d20Result = CombatSources._getD20ResultFromRoll(rollObj);
        const { isCritical, isFumble } = CombatSources._getCritFumbleFlags({ roll: rollObj, context, d20Result });

        // Set flag for damage processing (used by _processResolvedDamage and socket handlers)
        CombatSources._lastRollWasCritical = isCritical;

        // Note: Hit/miss tracking is now handled by createChatMessage hook via _processResolvedAttack
        // This hook is narrowed to only crit/fumble detection to avoid double-counting
    }

    /**
     * MIDI: hitsChecked hook - authoritative source for hit/miss outcomes (per workflow).
     * Builds an AttackResolvedEvent from workflow, caches it for damage correlation, and processes it.
     * @param {Object} workflow
     */
    static async _onMidiHitsChecked(workflow) {
        if (!isMidiIntegrationEnabled()) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        const attackEvent = buildAttackEventFromWorkflow(workflow);
        if (!attackEvent?.key) return;

        const key = attackEvent.key;
        if (typeof key !== 'string' || !key.length || key.toLowerCase() === 'midi:unknown') {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats | OffenseCount skipped (invalid workflow key)', { key }, true, false);
            return;
        }

        // If we're not the GM, forward a compact event to the GM for authoritative processing.
        if (!game.user.isGM) {
            const forwarded = await CombatSources._forwardToGM('cpbMidiHitsChecked', { attackEvent });
            if (!forwarded) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI hitsChecked forward failed (no socket)', { key }, true, false);
            }
            return;
        }

        // Dedupe: some setups may deliver MIDI hook events to GM and via socket forwarding
        const hcDedupeKey = `midiHitsChecked::${key}`;
        if (CombatSources._midiDedupe.isDuplicate(hcDedupeKey)) return;
        CombatSources._midiDedupe.markProcessed(hcDedupeKey);

        // Apply staged crit/fumble if RollComplete fired before hitsChecked
        const pending = CombatSources._pendingMidiCrit?.get(key);
        if (pending) {
            attackEvent.isCritical = !!pending.isCritical;
            attackEvent.isFumble = !!pending.isFumble;
            CombatSources._pendingMidiCrit.delete(key);
        }

        // Cache the attack resolution for damage correlation
        CombatSources._attackCache.set(key, {
            attackEvent,
            processedDamageMsgIds: new Set(),
            ts: attackEvent.ts
        });

        // Process the resolved attack event (records attempts, hits, misses per target)
        await CombatStats._processResolvedAttack(attackEvent);
        
        // MVP fairness: count successful offensive activations (attack-roll path)
        if (attackEvent.hitTargets?.length > 0) {
            const offenseKey = `offense:${key}`;
            if (!CombatSources._roundOffenseCache) CombatSources._roundOffenseCache = new Set();
            if (!CombatSources._roundOffenseCache.has(offenseKey)) {
                CombatSources._roundOffenseCache.add(offenseKey);
                const attackerActor = game.actors.get(attackEvent.attackerActorId);
                if (attackerActor) {
                    const { current: cur, combat: com } = CombatStats._ensureParticipantStats(attackerActor, { includeCurrent: true, includeCombat: true });
                    if (cur) cur.successfulOffenseCount = (Number(cur.successfulOffenseCount) || 0) + 1;
                    if (com) com.successfulOffenseCount = (Number(com.successfulOffenseCount) || 0) + 1;
                    postConsoleAndNotification(MODULE.NAME, 'Combat Stats | OffenseCount +1 (hitsChecked)', { key, attacker: attackerActor.name }, true, false);
                }
            }
        }

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI hitsChecked resolved', {
            key,
            attackerActorId: attackEvent.attackerActorId,
            hits: attackEvent.hitTargets.length,
            misses: attackEvent.missTargets.length,
            attackTotal: attackEvent.attackTotal
        }, true, false);
    }

    /**
     * MIDI: preTargetDamageApplication hook - authoritative per-target damage/heal amounts.
     * We count damage/heal per target and use cached attackEvent (same workflow key) to decide whether it's onHit.
     * @param {*} arg1
     * @param {*} arg2
     */
    static async _onMidiPreTargetDamageApplication(arg1, arg2) {
        if (!isMidiIntegrationEnabled()) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        const extracted = extractPreTargetDamageArgs(arg1, arg2);
        if (!extracted) return;

        const { token, data, workflow } = extracted;

        const key = getWorkflowKey(workflow);
        if (!key || typeof key !== 'string' || !key.length || key.toLowerCase() === 'midi:unknown') {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats | OffenseCount skipped (missing/invalid workflow key)', { key }, true, false);
            return;
        }

        const attacker = workflow?.actor ?? null;
        if (!attacker) return;

        // Extract hpDamage from known locations (matches player-stats lane)
        const damageItem = data?.damageItem ?? workflow?.damageItem ?? {};
        const hpDamageRaw =
            damageItem?.hpDamage ??
            damageItem?.totalDamage ??
            damageItem?.damageTotal ??
            damageItem?.appliedDamage ??
            null;

        // Some MIDI healing workflows don't populate damageItem hpDamage reliably (can be 0),
        // but DO provide the signed total on workflow.healingAdjustedDamageTotal.
        const wfHealingAdjusted = workflow?.healingAdjustedDamageTotal;

        let hpDamage = (typeof hpDamageRaw === 'number') ? hpDamageRaw : null;
        if ((hpDamage === null || hpDamage === 0) && typeof wfHealingAdjusted === 'number' && wfHealingAdjusted !== 0) {
            hpDamage = wfHealingAdjusted;
        }

        if (hpDamage === null || hpDamage === 0) return;

        const isHealing = hpDamage < 0;
        const amount = Math.abs(hpDamage);

        const targetUuid = token?.document?.uuid ?? token?.uuid ?? null;
        if (!targetUuid) return;

        // If we're not the GM, forward a compact payload to the GM for authoritative processing.
        if (!game.user.isGM) {
            const { isCritical, isFumble } = getCritFumbleFromWorkflow({
                workflow,
                attackRoll: workflow?.attackRoll ?? null
            });

            const itemUuid = workflow?.item?.uuid ?? data?.item?.uuid ?? workflow?.itemUuid ?? null;
            const forwarded = await CombatSources._forwardToGM('cpbMidiPreTargetDamageApplication', {
                key,
                attackerActorId: attacker.id,
                itemUuid,
                targetUuid,
                hpDamage,
                isCritical: !!isCritical,
                isFumble: !!isFumble
            });
            if (!forwarded) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI preTargetDamageApplication forward failed (no socket)', { key }, true, false);
            }
            return;
        }

        // Dedupe: MIDI can fire multiple times per target
        const dedupeKey = `${key}::${targetUuid}::${isHealing ? 'heal' : 'dmg'}::${amount}`;
        if (CombatSources._midiDedupe.isDuplicate(dedupeKey)) return;
        CombatSources._midiDedupe.markProcessed(dedupeKey);

        // Stamp crit/fumble ASAP (event order can be: hitsChecked -> preTargetDamage -> RollComplete)
        const { isCritical, isFumble } = getCritFumbleFromWorkflow({
            workflow,
            attackRoll: workflow?.attackRoll ?? null
        });

        const cachedAttackEntry = CombatSources._attackCache.get(key);
        if (cachedAttackEntry?.attackEvent) {
            cachedAttackEntry.attackEvent.isCritical = isCritical;
            cachedAttackEntry.attackEvent.isFumble = isFumble;
            cachedAttackEntry.ts = Date.now();
            CombatSources._attackCache.set(key, cachedAttackEntry);
        } else {
            CombatSources._pendingMidiCrit.set(key, { isCritical, isFumble, ts: Date.now() });
        }

        // Resolve item (prefer workflow.item)
        let item = workflow?.item ?? null;
        if (!item) {
            const itemUuid = data?.item?.uuid ?? workflow?.item?.uuid ?? workflow?.itemUuid ?? null;
            if (itemUuid) {
                try { item = await fromUuid(itemUuid); } catch (_) {}
            }
        }
        if (!item) return;

        // Resolve target actor ids (single-target per hook call)
        const targetActorIds = [];
        const targetTokenUuids = [targetUuid];

        const targetActorId = token?.actor?.id ?? null;
        if (targetActorId) {
            targetActorIds.push(targetActorId);
        } else {
            try {
                const targetDoc = await fromUuid(targetUuid);
                const targetActorDoc = targetDoc?.actor ?? targetDoc;
                if (targetActorDoc?.id) targetActorIds.push(targetActorDoc.id);
            } catch (_) {}
        }

        if (isHealing) {
            // Healing: count regardless of onHit; combat stats tracks healing given/received.
            await CombatStats._processDamageOrHealing({
                item,
                amount,
                isHealing: true,
                isCritical: false,
                targetActorIds,
                targetTokenUuids,
                timestamp: Date.now()
            });

            postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI healing processed', {
                key,
                attackerActorId: attacker.id,
                targetUuid,
                amount
            }, true, false);

            return;
        }

        // Damage: totals should count for all buckets, but "hit moments" are onHit-only.
        const hitTargets = cachedAttackEntry?.attackEvent?.hitTargets ?? [];
        const isOnHit = hitTargets.includes(targetUuid);
        
        // MVP fairness: count successful offensive activations (non-attack-roll path)
        // Only count if:
        // - not healing
        // - amount > 0 (already ensured)
        // - bucket is NOT onHit (prevents double counting attack-roll damage)
        // - once per workflow key per round
        if (!isHealing && !isOnHit) {
            const offenseKey = `offense:${key}`;
            if (!CombatSources._roundOffenseCache) CombatSources._roundOffenseCache = new Set();
            if (!CombatSources._roundOffenseCache.has(offenseKey)) {
                CombatSources._roundOffenseCache.add(offenseKey);
                const { current: cur, combat: com } = CombatStats._ensureParticipantStats(attacker, { includeCurrent: true, includeCombat: true });
                if (cur) cur.successfulOffenseCount = (Number(cur.successfulOffenseCount) || 0) + 1;
                if (com) com.successfulOffenseCount = (Number(com.successfulOffenseCount) || 0) + 1;
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats | OffenseCount +1 (preTargetDamageApplication)', { key, attacker: attacker.name }, true, false);
            }
        }

        await CombatStats._processDamageOrHealing({
            item,
            amount,
            isHealing: false,
            isCritical: isOnHit ? !!isCritical : false,
            targetActorIds,
            targetTokenUuids,
            timestamp: Date.now(),
            trackDamageMoments: isOnHit
        });

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI damage processed', {
            key,
            targetUuid,
            amount,
            bucket: isOnHit ? "onHit" : "other",
            isCritical: isOnHit ? !!isCritical : false
        }, true, false);
    }

    /**
     * MIDI: RollComplete hook - authoritative crit/fumble detection.
     * Stamps crit/fumble onto cached attackEvent (or stages it) and increments combat crit/fumble totals.
     * @param {Object} workflow
     */
    static async _onMidiRollComplete(workflow) {
        if (!isMidiIntegrationEnabled()) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        const key = getWorkflowKey(workflow);
        if (!key) return;

        const attacker = workflow?.actor ?? null;
        if (!attacker) return;

        const { isCritical, isFumble } = getCritFumbleFromWorkflow({
            workflow,
            attackRoll: workflow?.attackRoll ?? null
        });

        // If we're not the GM, forward the crit/fumble stamp to the GM (compact payload).
        if (!game.user.isGM) {
            const forwarded = await CombatSources._forwardToGM('cpbMidiRollComplete', {
                key,
                attackerActorId: attacker.id,
                isCritical: !!isCritical,
                isFumble: !!isFumble
            });
            if (!forwarded) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI RollComplete forward failed (no socket)', { key }, true, false);
            }
            return;
        }

        // Dedupe: avoid double counting if GM also receives forwarded event
        const rcDedupeKey = `midiRollComplete::${key}::${isCritical ? 'C' : ''}${isFumble ? 'F' : ''}`;
        if (CombatSources._midiDedupe.isDuplicate(rcDedupeKey)) return;
        CombatSources._midiDedupe.markProcessed(rcDedupeKey);

        // Always stamp it for downstream consumers (damage path may use it)
        const entry = CombatSources._attackCache.get(key);
        if (entry?.attackEvent) {
            entry.attackEvent.isCritical = !!isCritical;
            entry.attackEvent.isFumble = !!isFumble;
            entry.ts = Date.now();
            CombatSources._attackCache.set(key, entry);
        } else {
            CombatSources._pendingMidiCrit.set(key, { isCritical, isFumble, ts: Date.now() });
        }

        // Only increment counters when there is a crit/fumble
        if (!isCritical && !isFumble) return;

        const { current: attackerStats, combat: attackerCombatStats } = CombatStats._ensureParticipantStats(attacker, {
            includeCurrent: true,
            includeCombat: true
        });
        CombatStats._ensureCombatTotals();
        const combatTotals = CombatStats.combatStats.totals;

        // Ensure attack containers exist
        attackerStats.combat.attacks ??= { hits: 0, misses: 0, crits: 0, fumbles: 0, attempts: 0 };
        attackerCombatStats.combat.attacks ??= { hits: 0, misses: 0, crits: 0, fumbles: 0, attempts: 0 };
        combatTotals.attacks ??= { attempts: 0, hits: 0, misses: 0, crits: 0, fumbles: 0 };

        if (isCritical) {
            attackerStats.combat.attacks.crits++;
            attackerCombatStats.combat.attacks.crits++;
            combatTotals.attacks.crits++;
        }
        if (isFumble) {
            attackerStats.combat.attacks.fumbles++;
            attackerCombatStats.combat.attacks.fumbles++;
            combatTotals.attacks.fumbles++;
        }

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats | MIDI RollComplete crit/fumble', {
            key,
            attackerActorId: attacker.id,
            isCritical: !!isCritical,
            isFumble: !!isFumble
        }, true, false);
    }

    /**
     * Prune expired entries from the attack cache.
     * Should be called periodically (e.g., on each createChatMessage).
     */
    static _pruneAttackCache() {
        const now = Date.now();
        for (const [key, entry] of CombatSources._attackCache.entries()) {
            if (now - entry.ts > CombatSources.ATTACK_TTL_MS) {
                CombatSources._attackCache.delete(key);
            }
        }
    }

    /**
     * Core lane: Process chat messages for attacks/damage/healing.
     * This is shared by createChatMessage and updateChatMessage (when rolls/flags arrive late).
     * @param {ChatMessage} message
     */
    static async _onChatMessage(message) {
        if (!game.user.isGM || !game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        // Early guard: only process system-ish roll messages (reduces noise)
        const hasDnd5e = !!message.flags?.dnd5e;
        const hasMidi = !!message.flags?.["midi-qol"];
        const hasRolls = (message.rolls?.length ?? 0) > 0;
        if (!hasDnd5e && !hasMidi && !hasRolls) return;

        // If MIDI integration is on and this message is part of a MIDI workflow, ignore it
        // here. MIDI lane hooks (hitsChecked + preTargetDamageApplication + RollComplete) are
        // authoritative; with integration disabled the core lane reclaims these messages.
        if (isMidiIntegrationEnabled() && hasMidi) return;

        // Prune expired cache entries
        CombatSources._pruneAttackCache();

        // 1) Try to resolve as attack message
        const attackEvent = resolveAttackMessage(message);
        if (attackEvent) {
            const dedupeKey = `chat:attack:${message.id}`;
            if (CombatSources._chatDedupe.isDuplicate(dedupeKey)) return;
            CombatSources._chatDedupe.markProcessed(dedupeKey);

            // Stamp crit/fumble from the chat roll (core-only)
            const roll = hydrateFirstRoll(message);
            const { isCritical, isFumble } = CombatSources._getCritFumbleFromChatAttackRoll(roll);
            attackEvent.isCritical = !!isCritical;
            attackEvent.isFumble = !!isFumble;

            // Cache the attack resolution for damage correlation
            CombatSources._attackCache.set(attackEvent.key, {
                attackEvent,
                processedDamageMsgIds: new Set(),
                ts: attackEvent.ts
            });

            await CombatStats._processResolvedAttack(attackEvent);

            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Attack Resolved:', {
                key: attackEvent.key,
                attackTotal: attackEvent.attackTotal,
                hitTargetsCount: attackEvent.hitTargets.length,
                missTargetsCount: attackEvent.missTargets.length,
                unknownTargetsCount: attackEvent.unknownTargets.length
            }, true, false);

            return;
        }

        // 2) Try to resolve as damage/healing message
        const damageEvent = resolveDamageMessage(message);
        if (!damageEvent) return;

        // Healing never requires attack correlation; preserve heal bucket.
        if (damageEvent.bucket === "heal") {
            const dedupeKey = `chat:heal:${message.id}`;
            if (CombatSources._chatDedupe.isDuplicate(dedupeKey)) return;
            CombatSources._chatDedupe.markProcessed(dedupeKey);

            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Damage Resolved:', {
                key: damageEvent.key,
                bucket: "heal",
                damageTotal: damageEvent.damageTotal,
                attackMsgId: damageEvent.attackMsgId
            }, true, false);

            await CombatStats._processResolvedDamage(damageEvent);
            return;
        }

        // Correlate damage to cached attack
        const cacheEntry = CombatSources._attackCache.get(damageEvent.key);

        if (!cacheEntry) {
            // Unlinked damage: still counts for totals, but no onHit moments.
            const dedupeKey = `chat:unlinked:${message.id}`;
            if (CombatSources._chatDedupe.isDuplicate(dedupeKey)) return;
            CombatSources._chatDedupe.markProcessed(dedupeKey);

            damageEvent.bucket = "unlinked";
            damageEvent.attackMsgId = null;

            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Unlinked Damage:', {
                key: damageEvent.key,
                damageTotal: damageEvent.damageTotal
            }, true, false);

            await CombatStats._processResolvedDamage(damageEvent);
            return;
        }

        // Dedupe per damage message ID (supports multiple damage messages per attack)
        if (cacheEntry.processedDamageMsgIds.has(damageEvent.damageMsgId)) return;
        cacheEntry.processedDamageMsgIds.add(damageEvent.damageMsgId);

        // Classify damage based on attack outcome (moments only for onHit, totals always count)
        const hadHit = (cacheEntry.attackEvent?.hitTargets?.length ?? 0) > 0;
        damageEvent.bucket = hadHit ? "onHit" : "other";
        damageEvent.attackMsgId = cacheEntry.attackEvent.attackMsgId;

        postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Damage Resolved:', {
            key: damageEvent.key,
            bucket: damageEvent.bucket,
            damageTotal: damageEvent.damageTotal,
            attackMsgId: damageEvent.attackMsgId
        }, true, false);

        await CombatStats._processResolvedDamage(damageEvent);
    }

    // Socket handler for damage rolls forwarded from non-GM clients
    static async _onSocketTrackDamage(payload) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            const item = await fromUuid(payload.itemUuid);
            if (!item) return;

            const amount =
                typeof payload.total === "number"
                    ? payload.total
                    : (payload.rolls || []).reduce((s, r) => s + (Number(r.total) || 0), 0);

            // Determine healing on GM side (or accept payload.isHealing if you include it)
            const itemNameLower = (item.name || "").toLowerCase();
            const actionType = (item.system?.actionType ?? "").toString().toLowerCase();
            
            // Check activities system (dnd5e v5.2.4) for healing activities
            const hasHealingActivity = item.system?.activities && Object.values(item.system.activities).some(activity => {
                const activityType = (activity.type || "").toLowerCase();
                return activityType === "heal" || activity.healing || activity.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
            });
            
            // Check damage parts for healing type
            const hasHealingDamage = item.system?.damage?.parts?.some?.(p => `${p?.[1]}`.toLowerCase() === "healing");
            
            // Check item name for healing keywords
            const nameIndicatesHealing = itemNameLower.includes("heal") || itemNameLower.includes("cure") || itemNameLower.includes("restore");
            
            const isHealing =
                payload.isHealing === true ||
                actionType === "heal" || actionType === "healing" ||
                hasHealingActivity ||
                hasHealingDamage ||
                nameIndicatesHealing;

            await CombatStats._processDamageOrHealing({
                item,
                amount,
                isHealing,
                isCritical: CombatSources._lastRollWasCritical || false,
                targetTokenUuids: payload.targetTokenUuids || [],
                timestamp: Date.now()
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error in socket damage handler:', error, false, false);
            console.error(error);
        }
    }

    // Socket handler for attack rolls forwarded from non-GM clients
    static async _onSocketTrackAttack(payload) {
        if (!game.user.isGM) return; // Only GM processes
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            const item = await fromUuid(payload.itemUuid);
            if (!item || !item.id) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Socket attack: item not found', { itemUuid: payload.itemUuid }, true, false);
                return;
            }

            await CombatStats._processAttackRoll({
                item,
                rollTotal: Number(payload.rollTotal) || 0,
                d20Result: (payload.d20Result ?? null),
                timestamp: Date.now()
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats - Error in socket attack handler:', error, false, false);
            console.error(error);
        }
    }

    // Socket handler: MIDI hitsChecked forwarded from non-GM clients
    static async _onSocketMidiHitsChecked(payload) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            postConsoleAndNotification(MODULE.NAME, 'STATS SOCKETS | Receive cpbMidiHitsChecked', { fromUserId: payload?.userId ?? null }, true, false);
            const attackEvent = payload?.attackEvent;
            const key = attackEvent?.key;
            if (typeof key !== 'string' || !key.length || key.toLowerCase() === 'midi:unknown') return;

            // Dedupe with GM hook path
            const hcDedupeKey = `midiHitsChecked::${key}`;
            if (CombatSources._midiDedupe.isDuplicate(hcDedupeKey)) return;
            CombatSources._midiDedupe.markProcessed(hcDedupeKey);

            // Apply staged crit/fumble if RollComplete arrived first
            const pending = CombatSources._pendingMidiCrit?.get(key);
            if (pending) {
                attackEvent.isCritical = !!pending.isCritical;
                attackEvent.isFumble = !!pending.isFumble;
                CombatSources._pendingMidiCrit.delete(key);
            }

            CombatSources._attackCache.set(key, {
                attackEvent,
                processedDamageMsgIds: new Set(),
                ts: attackEvent.ts ?? Date.now()
            });

            await CombatStats._processResolvedAttack(attackEvent);

            // MVP fairness: count successful offensive activations (attack-roll path)
            if (attackEvent.hitTargets?.length > 0) {
                const offenseKey = `offense:${key}`;
                if (!CombatSources._roundOffenseCache) CombatSources._roundOffenseCache = new Set();
                if (!CombatSources._roundOffenseCache.has(offenseKey)) {
                    CombatSources._roundOffenseCache.add(offenseKey);
                    const attackerActor = game.actors.get(attackEvent.attackerActorId);
                    if (attackerActor) {
                        const { current: cur, combat: com } = CombatStats._ensureParticipantStats(attackerActor, { includeCurrent: true, includeCombat: true });
                        if (cur) cur.successfulOffenseCount = (Number(cur.successfulOffenseCount) || 0) + 1;
                        if (com) com.successfulOffenseCount = (Number(com.successfulOffenseCount) || 0) + 1;
                    }
                }
            }
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats | Socket MIDI hitsChecked error', e, false, false);
        }
    }

    // Socket handler: MIDI preTargetDamageApplication forwarded from non-GM clients
    static async _onSocketMidiPreTargetDamageApplication(payload) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            postConsoleAndNotification(MODULE.NAME, 'STATS SOCKETS | Receive cpbMidiPreTargetDamageApplication', { key: payload?.key ?? null }, true, false);
            const key = payload?.key;
            if (!key || typeof key !== 'string' || !key.length || key.toLowerCase() === 'midi:unknown') return;

            const attacker = payload?.attackerActorId ? game.actors.get(payload.attackerActorId) : null;
            if (!attacker) return;

            const hpDamage = (typeof payload.hpDamage === 'number') ? payload.hpDamage : null;
            if (hpDamage === null || hpDamage === 0) return;
            const isHealing = hpDamage < 0;
            const amount = Math.abs(hpDamage);

            const targetUuid = payload?.targetUuid ?? null;
            if (!targetUuid) return;

            // Dedupe per target (same scheme as GM hook)
            const dedupeKey = `${key}::${targetUuid}::${isHealing ? 'heal' : 'dmg'}::${amount}`;
            if (CombatSources._midiDedupe.isDuplicate(dedupeKey)) return;
            CombatSources._midiDedupe.markProcessed(dedupeKey);

            // Stamp crit/fumble
            const isCritical = !!payload?.isCritical;
            const isFumble = !!payload?.isFumble;
            const cachedAttackEntry = CombatSources._attackCache.get(key);
            if (cachedAttackEntry?.attackEvent) {
                cachedAttackEntry.attackEvent.isCritical = isCritical;
                cachedAttackEntry.attackEvent.isFumble = isFumble;
                cachedAttackEntry.ts = Date.now();
                CombatSources._attackCache.set(key, cachedAttackEntry);
            } else {
                CombatSources._pendingMidiCrit.set(key, { isCritical, isFumble, ts: Date.now() });
            }

            const itemUuid = payload?.itemUuid ?? null;
            if (!itemUuid) return;
            let item = null;
            try { item = await fromUuid(itemUuid); } catch (_) {}
            if (!item) return;

            const targetTokenUuids = [targetUuid];

            if (isHealing) {
                await CombatStats._processDamageOrHealing({
                    item,
                    amount,
                    isHealing: true,
                    isCritical: false,
                    targetTokenUuids,
                    timestamp: Date.now()
                });
                return;
            }

            const hitTargets = cachedAttackEntry?.attackEvent?.hitTargets ?? [];
            const isOnHit = hitTargets.includes(targetUuid);

            // MVP fairness: count successful offensive activations (non-attack-roll path)
            if (!isOnHit) {
                const offenseKey = `offense:${key}`;
                if (!CombatSources._roundOffenseCache) CombatSources._roundOffenseCache = new Set();
                if (!CombatSources._roundOffenseCache.has(offenseKey)) {
                    CombatSources._roundOffenseCache.add(offenseKey);
                    const { current: cur, combat: com } = CombatStats._ensureParticipantStats(attacker, { includeCurrent: true, includeCombat: true });
                    if (cur) cur.successfulOffenseCount = (Number(cur.successfulOffenseCount) || 0) + 1;
                    if (com) com.successfulOffenseCount = (Number(com.successfulOffenseCount) || 0) + 1;
                }
            }

            await CombatStats._processDamageOrHealing({
                item,
                amount,
                isHealing: false,
                isCritical: isOnHit ? isCritical : false,
                targetTokenUuids,
                timestamp: Date.now(),
                trackDamageMoments: isOnHit
            });
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats | Socket MIDI preTargetDamageApplication error', e, false, false);
        }
    }

    // Socket handler: MIDI RollComplete forwarded from non-GM clients
    static async _onSocketMidiRollComplete(payload) {
        if (!game.user.isGM) return;
        if (!game.settings.get(MODULE.ID, 'trackCombatStats')) return;
        if (!game.combat?.started) return;

        try {
            postConsoleAndNotification(MODULE.NAME, 'STATS SOCKETS | Receive cpbMidiRollComplete', { key: payload?.key ?? null }, true, false);
            const key = payload?.key;
            if (!key || typeof key !== 'string' || !key.length || key.toLowerCase() === 'midi:unknown') return;

            const attacker = payload?.attackerActorId ? game.actors.get(payload.attackerActorId) : null;
            if (!attacker) return;

            const isCritical = !!payload?.isCritical;
            const isFumble = !!payload?.isFumble;

            const rcDedupeKey = `midiRollComplete::${key}::${isCritical ? 'C' : ''}${isFumble ? 'F' : ''}`;
            if (CombatSources._midiDedupe.isDuplicate(rcDedupeKey)) return;
            CombatSources._midiDedupe.markProcessed(rcDedupeKey);

            const entry = CombatSources._attackCache.get(key);
            if (entry?.attackEvent) {
                entry.attackEvent.isCritical = isCritical;
                entry.attackEvent.isFumble = isFumble;
                entry.ts = Date.now();
                CombatSources._attackCache.set(key, entry);
            } else {
                CombatSources._pendingMidiCrit.set(key, { isCritical, isFumble, ts: Date.now() });
            }

            if (!isCritical && !isFumble) return;

            const { current: attackerStats, combat: attackerCombatStats } = CombatStats._ensureParticipantStats(attacker, {
                includeCurrent: true,
                includeCombat: true
            });
            CombatStats._ensureCombatTotals();
            const combatTotals = CombatStats.combatStats.totals;

            if (isCritical) {
                attackerStats.combat.attacks.crits++;
                attackerCombatStats.combat.attacks.crits++;
                combatTotals.attacks.crits++;
            }

            if (isFumble) {
                attackerStats.combat.attacks.fumbles++;
                attackerCombatStats.combat.attacks.fumbles++;
                combatTotals.attacks.fumbles++;
            }

            CombatStats._schedulePersistCombatStats('midiRollCompleteSocket');
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Stats | Socket MIDI RollComplete error', e, false, false);
        }
    }

}
