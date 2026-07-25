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
    getCritFumbleFromWorkflow
} from './utility-midi-resolution.js';

export class RollOutcomesManager {
    static _initialized = false;
    static _chatDedupe = createDedupeTracker(30_000);
    static _midiDedupe = createDedupeTracker(20_000);
    /** @type {Map<string, { isCritical: boolean, isFumble: boolean, ts: number }>} */
    static _pendingMidiCrit = new Map();

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;
        this._registerHooks();
        this._registerSocketHandlers();
    }

    static _emitAttackOnce(dedupeKey, outcome, meta = {}) {
        if (!outcome || outcome.kind !== 'attack') return;
        if (this._midiDedupe.isDuplicate(dedupeKey) || this._chatDedupe.isDuplicate(dedupeKey)) return;
        this._midiDedupe.markProcessed(dedupeKey);
        this._chatDedupe.markProcessed(dedupeKey);
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

        if (game.modules.get('midi-qol')?.active && hasMidiFlags) return;

        const outcome = classify(message);
        if (!outcome || outcome.kind !== 'attack') return;

        this._emitAttackOnce(`rolls:chat:${message.id}`, outcome, {
            trigger: 'dnd5e.chatMessage',
            messageId: message.id
        });
    }

    /**
     * Optional MIDI lane: hitsChecked (authoritative hit/miss when midi-qol is active).
     * @param {object} workflow
     */
    static async _onMidiHitsChecked(workflow) {
        if (!game.modules.get('midi-qol')?.active) return;

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

        const dedupeKey = `rolls:midi:${key}`;
        const meta = { trigger: 'midi.hitsChecked', workflowKey: key, messageId: outcome.messageId ?? null };

        if (!game.user.isGM) {
            await this._forwardToGM('cpbRollAttackResolved', { outcome, meta, dedupeKey });
            return;
        }

        this._emitAttackOnce(dedupeKey, outcome, meta);
    }

    /**
     * Optional MIDI lane: RollComplete — stage crit/fumble for hitsChecked (same pattern as stats-combat).
     * @param {object} workflow
     */
    static _onMidiRollComplete(workflow) {
        if (!game.modules.get('midi-qol')?.active) return;

        const key = getWorkflowKey(workflow);
        if (!key || key.toLowerCase() === 'midi:unknown') return;
        if (!workflow?.attackRoll) return;

        const { isCritical, isFumble } = getCritFumbleFromWorkflow({
            workflow,
            attackRoll: workflow.attackRoll
        });

        const dedupeKey = `rolls:midi:${key}`;
        if (this._midiDedupe.isDuplicate(dedupeKey) || this._chatDedupe.isDuplicate(dedupeKey)) return;

        this._pendingMidiCrit.set(key, { isCritical, isFumble, ts: Date.now() });
    }

    static _onSocketRollAttackResolved(payload) {
        if (!game.user.isGM) return;
        const { outcome, meta, dedupeKey } = payload ?? {};
        if (!outcome || !dedupeKey) return;
        this._emitAttackOnce(dedupeKey, outcome, meta ?? {});
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

        if (game.modules.get('midi-qol')?.active) {
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
            }
        });
    }
}
