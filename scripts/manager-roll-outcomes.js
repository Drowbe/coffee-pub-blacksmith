/**
 * Roll outcome hook emission — core dnd5e chat lane first, optional MIDI lane when present.
 * Does not require combat stats or MIDI to be installed.
 */

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { SocketManager } from './manager-sockets.js';
import { RollsAPI } from './api-rolls.js';
import { classify } from './utility-roll-classification.js';
import {
    createDedupeTracker,
    getWorkflowKey,
    getCritFumbleFromWorkflow,
    isMidiIntegrationEnabled
} from './utility-midi-resolution.js';

export class RollOutcomesManager {
    static _initialized = false;
    /**
     * ONE tracker, because there is one key space now. Two trackers in two namespaces
     * was how the lanes failed to see each other -- see `_emitAttackOnce`.
     * The longer of the two old windows: an attack's two lanes can be seconds apart.
     */
    static _attackDedupe = createDedupeTracker(30_000);
    /** Initiative, which is single-lane and keyed by message id. */
    static _chatDedupe = createDedupeTracker(30_000);
    /** @type {Map<string, { isCritical: boolean, isFumble: boolean, ts: number }>} */
    static _pendingMidiCrit = new Map();

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;
        this._registerHooks();
        this._registerSocketHandlers();
    }

    /**
     * Emit an attack outcome at most once, however many lanes saw it.
     *
     * THE LANES NO LONGER TAKE TURNS, SO THIS HAS TO BE REAL.
     *
     * The core dnd5e lane used to return early for any midi-flagged message and leave
     * the whole attack to the MIDI lane. That is the shape that cost a table nineteen
     * rounds elsewhere in this module: when the lane we deferred to did not run,
     * nothing did. Both lanes now run, always -- which makes THIS function the only
     * thing standing between a table and every attack being counted twice.
     *
     * The old version could not have done it. It took a single pre-built key and
     * checked two trackers, but the callers built keys in different namespaces --
     * `rolls:chat:<messageId>` against `rolls:midi:<workflowKey>` -- which can never be
     * equal, so the same attack down both paths deduped against nothing.
     *
     * So identity is plural now. Every name we can put to an attack is checked, and
     * every one of them is marked: the chat message it belongs to, the midi workflow
     * that produced it, and our own system-level key (attacker, item, activity,
     * targets). A hit on ANY of them means we have already emitted this attack. That
     * tolerates either lane being unable to name it the same way -- midi's card id
     * missing, a workflow with no id, a message whose activity flag never arrived --
     * without either double-emitting or falling silent.
     *
     * @param {object|null} outcome
     * @param {object} [meta]
     */
    static _emitAttackOnce(outcome, meta = {}) {
        if (!outcome || outcome.kind !== 'attack') return;

        const identities = [
            outcome.messageId ? `msg:${outcome.messageId}` : null,
            meta.messageId ? `msg:${meta.messageId}` : null,
            meta.workflowKey ? `wf:${meta.workflowKey}` : null,
            outcome.key ? `key:${outcome.key}` : null
        ].filter(Boolean);

        // Nothing to dedupe on. Emitting is the lesser error: a missing event is
        // invisible and permanent, a duplicated one is visible and reportable.
        if (!identities.length) {
            RollsAPI.emitResolved(outcome, meta);
            return;
        }

        if (identities.some((id) => this._attackDedupe.isDuplicate(id))) return;
        for (const id of identities) this._attackDedupe.markProcessed(id);

        RollsAPI.emitResolved(outcome, meta);
    }

    static async _forwardToGM(eventName, payload) {
        try {
            await SocketManager.waitForReady();
            const socket = SocketManager.getSocket();
            if (typeof socket?.executeAsGM === 'function') {
                await socket.executeAsGM(eventName, payload);
                return true;
            }
        } catch (e) {
            postConsoleAndNotification(MODULE.NAME, 'Roll outcomes | forward to GM failed', e, true, false);
        }
        return false;
    }

    /**
     * Core lane: dnd5e attack chat messages (no MIDI module required).
     * @param {ChatMessage} message
     */
    static _onChatMessage(message) {
        if (!game.user.isGM) return;

        const hasDnd5e = !!message.flags?.dnd5e;
        const hasMidiFlags = !!message.flags?.['midi-qol'];
        const hasRolls = (message.rolls?.length ?? 0) > 0;
        if (!hasDnd5e && !hasMidiFlags && !hasRolls) return;

        // NO YIELD HERE ANY MORE. This used to return for any midi-flagged message
        // when integration was on, handing the whole attack to the other lane. That is
        // the "leverage midi INSTEAD of ours" shape the author ruled out on 2026-09-03:
        // our lane stopped, and if the lane we deferred to did not run, nothing did.
        // `DefeatedManager` made the same bet about the same module and a table played
        // nineteen rounds with the dead taking turns.
        //
        // Our lane is now always the lane. The MIDI lane still runs and can still be
        // first, which is fine and sometimes better -- it knows hit and miss
        // authoritatively -- but whichever arrives first, `_emitAttackOnce` makes sure
        // exactly one event reaches consumers. `hasMidiFlags` is still read above only
        // to recognise a message worth classifying at all.
        const outcome = classify(message);

        // Initiative resolves here rather than in the attack path below: it has no
        // targets, no hit or miss, and none of the provisional-card handling that
        // path exists for. dnd5e writes an initiative message once, complete.
        if (outcome?.kind === 'initiative') {
            if (this._chatDedupe.isDuplicate(`initiative:${message.id}`)) return;
            this._chatDedupe.markProcessed(`initiative:${message.id}`);
            RollsAPI.emitResolved(outcome, { trigger: 'initiativeRoll' });
            return;
        }

        if (!outcome || outcome.kind !== 'attack') return;

        // dnd5e creates an activity card before attaching the attack roll, then
        // updates that same ChatMessage with the d20 result. Do not emit or mark
        // the provisional card as processed: doing so publishes a false
        // non-critical outcome and causes the real rolled update (including a
        // natural 20/1) to be discarded by the message-id dedupe below.
        if (typeof outcome.total !== 'number') return;

        this._emitAttackOnce(outcome, {
            trigger: 'dnd5e.chatMessage',
            messageId: message.id
        });
    }

    /**
     * Optional MIDI lane: hitsChecked (authoritative hit/miss when midi-qol is active).
     * @param {object} workflow
     */
    static async _onMidiHitsChecked(workflow) {
        if (!isMidiIntegrationEnabled()) return;

        const attackRoll = workflow?.attackRoll ?? null;
        if (!attackRoll) return;

        const key = getWorkflowKey(workflow);
        if (!key || key.toLowerCase() === 'midi:unknown') return;

        let outcome = classify({ workflow, attackRoll });
        if (!outcome || outcome.kind !== 'attack') return;

        const pending = this._pendingMidiCrit.get(key);
        if (pending) {
            outcome = {
                ...outcome,
                isCritical: pending.isCritical,
                isFumble: pending.isFumble
            };
            this._pendingMidiCrit.delete(key);
        }

        const meta = { trigger: 'midi.hitsChecked', workflowKey: key, messageId: outcome.messageId ?? null };

        if (!game.user.isGM) {
            await this._forwardToGM('cpbRollAttackResolved', { outcome, meta });
            return;
        }

        this._emitAttackOnce(outcome, meta);
    }

    /**
     * Optional MIDI lane: RollComplete — stage crit/fumble for hitsChecked (same pattern as stats-combat).
     * @param {object} workflow
     */
    static _onMidiRollComplete(workflow) {
        if (!isMidiIntegrationEnabled()) return;

        const key = getWorkflowKey(workflow);
        if (!key || key.toLowerCase() === 'midi:unknown') return;
        if (!workflow?.attackRoll) return;

        const { isCritical, isFumble } = getCritFumbleFromWorkflow({
            workflow,
            attackRoll: workflow.attackRoll
        });

        // Staging only -- this records crit/fumble for `hitsChecked` to pick up and
        // emits nothing itself, so it must NOT consult the emit dedupe. It used to,
        // and that was a bug waiting for both lanes to be live: once the chat lane has
        // emitted this attack, the workflow identity is marked, so this would skip
        // staging and a later `hitsChecked` for the same workflow would carry no crit.
        this._pendingMidiCrit.set(key, { isCritical, isFumble, ts: Date.now() });
    }

    static _onSocketRollAttackResolved(payload) {
        if (!game.user.isGM) return;
        const { outcome, meta } = payload ?? {};
        if (!outcome) return;
        this._emitAttackOnce(outcome, meta ?? {});
    }

    // ===== DAMAGE LANE (dnd5e.calculateDamage + dnd5e.applyDamage) =====
    // dnd5e fires calculateDamage (typed breakdown, pre-application) and then
    // applyDamage (final amount, post-application) inside one Actor#applyDamage
    // call, both on the applying client. We stash the breakdown and the
    // pre-application HP by actor uuid, then correlate in applyDamage — the
    // same two-hook dance Bibliosoph proved out for its injury triggers,
    // centralized here so every consumer gets one normalized damageResolved
    // event instead of re-implementing it. Non-GM appliers (a player using
    // their own sheet) forward to the GM client, matching the attack lane's
    // delivery promise: outcome hooks fire on the GM client.

    /** @type {Map<string, { damages: Array<{value: number, type: string}>|null, hp: object, ts: number }>} */
    static _pendingDamage = new Map();
    static DAMAGE_STASH_TTL = 5000;

    static _stashDamageCalculation(actor, damages) {
        if (!actor?.uuid) return;
        const now = Date.now();
        for (const [key, entry] of this._pendingDamage) {
            if (now - entry.ts > this.DAMAGE_STASH_TTL) this._pendingDamage.delete(key);
        }
        const hp = actor.system?.attributes?.hp ?? {};
        this._pendingDamage.set(actor.uuid, {
            damages: Array.isArray(damages)
                ? damages.map((d) => ({ value: d?.value ?? 0, type: d?.type ?? '' }))
                : null,
            hp: { value: hp.value ?? null, temp: hp.temp ?? 0, max: hp.max ?? null },
            ts: now
        });
    }

    static async _onDamageApplied(actor, amount) {
        if (!actor?.uuid) return;

        const stash = this._pendingDamage.get(actor.uuid) ?? null;
        this._pendingDamage.delete(actor.uuid);
        const fresh = stash && (Date.now() - stash.ts) <= this.DAMAGE_STASH_TTL ? stash : null;

        const hpNow = actor.system?.attributes?.hp ?? {};
        const isHealing = typeof amount === 'number' && amount < 0;
        const tempAbsorbed = fresh && !isHealing
            ? Math.max(0, (fresh.hp.temp ?? 0) - (hpNow.temp ?? 0))
            : null;

        // Synthetic token actors know their token directly; linked actors
        // resolve best-effort through their active tokens.
        const tokenDoc = actor.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;

        const outcome = {
            kind: 'damage',
            source: 'dnd5e.applyDamage',
            amount: typeof amount === 'number' ? amount : null,
            tempAbsorbed,
            damages: fresh?.damages ?? null,
            isHealing,
            actorId: actor.id ?? null,
            actorUuid: actor.uuid,
            tokenId: tokenDoc?.id ?? null,
            sceneId: tokenDoc?.parent?.id ?? null,
            hp: {
                before: fresh?.hp?.value ?? null,
                after: hpNow.value ?? null,
                max: hpNow.max ?? null,
                temp: hpNow.temp ?? 0
            },
            // Best-effort attribution not wired yet: core damage buttons do
            // not know their attacker, and MIDI enrichment is future work.
            attackerTokenId: null,
            itemUuid: null,
            visibility: 'public'
        };
        const meta = { trigger: 'dnd5e.applyDamage', actorUuid: actor.uuid };

        if (!game.user.isGM) {
            await this._forwardToGM('cpbRollDamageResolved', { outcome, meta });
            return;
        }
        RollsAPI.emitResolved(outcome, meta);
    }

    static _onSocketRollDamageResolved(payload) {
        if (!game.user.isGM) return;
        const { outcome, meta } = payload ?? {};
        if (!outcome || outcome.kind !== 'damage') return;
        RollsAPI.emitResolved(outcome, meta ?? {});
    }

    static _registerHooks() {
        HookManager.registerHook({
            name: 'createChatMessage',
            description: 'Roll outcomes: emit attackResolved from dnd5e chat messages (core lane)',
            context: 'roll-outcomes-chat',
            priority: 4,
            callback: (message) => this._onChatMessage(message)
        });

        HookManager.registerHook({
            name: 'updateChatMessage',
            description: 'Roll outcomes: re-process chat messages when rolls/flags arrive (core lane)',
            context: 'roll-outcomes-chat-update',
            priority: 4,
            callback: (message, changed) => {
                const changedKeys = Object.keys(changed ?? {});
                const relevant = changedKeys.includes('rolls')
                    || changedKeys.includes('flags')
                    || changedKeys.some((k) => k.startsWith('flags.'));
                if (!relevant) return;
                this._onChatMessage(message);
            }
        });

        if (game.system?.id === 'dnd5e') {
            HookManager.registerHook({
                name: 'dnd5e.calculateDamage',
                description: 'Roll outcomes: stash typed damage breakdown + pre-application HP for damageResolved',
                context: 'roll-outcomes-damage-calc',
                priority: 4,
                callback: (actor, damages) => this._stashDamageCalculation(actor, damages)
            });

            HookManager.registerHook({
                name: 'dnd5e.applyDamage',
                description: 'Roll outcomes: emit damageResolved when damage or healing is applied',
                context: 'roll-outcomes-damage-apply',
                priority: 4,
                callback: (actor, amount) => {
                    this._onDamageApplied(actor, amount).catch((e) => {
                        postConsoleAndNotification(MODULE.NAME, 'Roll outcomes | applyDamage error', e, true, false);
                    });
                }
            });
        }

        // Registered unconditionally. A hook nothing ever fires costs nothing, and the
        // presence check that used to wrap these was Blacksmith asking whether another
        // module existed before deciding what to do -- the shape TODO-GLOBAL Ground
        // Rule 8 refuses. The handlers gate themselves on our OWN `enableMidiIntegration`
        // setting, which is the correct gate and the only one.
        {
            HookManager.registerHook({
                name: 'midi-qol.hitsChecked',
                description: 'Roll outcomes: emit attackResolved from MIDI workflow (optional lane)',
                context: 'roll-outcomes-midi-hits',
                priority: 4,
                callback: (workflow) => {
                    this._onMidiHitsChecked(workflow).catch((e) => {
                        postConsoleAndNotification(MODULE.NAME, 'Roll outcomes | MIDI hitsChecked error', e, true, false);
                    });
                }
            });

            HookManager.registerHook({
                name: 'midi-qol.RollComplete',
                description: 'Roll outcomes: stage MIDI crit/fumble for hitsChecked (optional lane)',
                context: 'roll-outcomes-midi-complete',
                priority: 4,
                callback: (workflow) => this._onMidiRollComplete(workflow)
            });
        }
    }

    static _registerSocketHandlers() {
        SocketManager.waitForReady().then(() => {
            const socket = SocketManager.getSocket();
            if (socket?.register) {
                socket.register('cpbRollAttackResolved', this._onSocketRollAttackResolved.bind(this));
                socket.register('cpbRollDamageResolved', this._onSocketRollDamageResolved.bind(this));
            }
        });
    }
}
