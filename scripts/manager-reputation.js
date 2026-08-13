// ==================================================================
// ===== MANAGER-REPUTATION – scene/campaign and party/player reputation
// ==================================================================
// Party reputation is stored in world setting blacksmithPartyData, per scene
// (blacksmithPartyData.scenes[sceneId].reputation). Uses resources/reputation.json
// for scale labels and descriptions.
//
// NO UI LIVES HERE. The balancebar this manager used to register on the party bar
// is gone with that bar; Squire's Party tab shows the value through the API, which
// is the shape the module split is built on -- Blacksmith owns the capability, a
// satellite renders it. What remains is the value, the scale, the chat cards, and
// the blacksmith.partyReputationChanged broadcast.
// Future: campaign reputation, player-level reputation.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { ChatCardsAPI } from './api-chat-cards.js';

const REPUTATION_MIN = -100;
const REPUTATION_MAX = 100;
const SETTING_PARTY_DATA = 'blacksmithPartyData';
const REPUTATION_JSON_PATH = `modules/${MODULE.ID}/resources/reputation.json`;

/** @type {{ reputationScale: Array<{ key: string, label: string, min: number, max: number, description: string, effects?: object }> } | null } */
let _reputationData = null;

export class ReputationManager {

    /**
     * Emit `blacksmith.partyReputationChanged` on every client.
     *
     * Deliberately driven off Foundry's `updateSetting` rather than called from
     * setPartyReputation. `Hooks.callAll` only fires on the client that ran it, so
     * emitting from the setter would reach the GM who made the change and nobody
     * else -- which is precisely the client that already knows. `updateSetting`
     * arrives everywhere the setting landed, so consumers get it in both
     * directions and however the value was changed, including from settings.
     *
     * Called once from ready.
     */
    static initialize() {
        HookManager.registerHook({
            name: 'updateSetting',
            description: 'Reputation: broadcast party reputation changes to consumers',
            priority: 4,
            context: 'reputation',
            callback: (setting) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (setting?.key !== `${MODULE.ID}.${SETTING_PARTY_DATA}`) return;
                const sceneId = canvas?.scene?.id ?? null;
                Hooks.callAll('blacksmith.partyReputationChanged', {
                    sceneId,
                    reputation: sceneId ? this.getPartyReputation() : null
                });
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    /**
     * Load reputation scale from resources/reputation.json. Cached after first load.
     * @returns {Promise<{ reputationScale: Array }>}
     */
    static async _loadReputationData() {
        if (_reputationData) return _reputationData;
        try {
            const response = await fetch(REPUTATION_JSON_PATH);
            if (!response.ok) throw new Error(response.statusText);
            _reputationData = await response.json();
            return _reputationData;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ReputationManager: Error loading reputation.json', error?.message ?? error, false, true);
            return { reputationScale: [] };
        }
    }

    /**
     * Get the scale entry (label, description, effects) for a reputation value.
     * @param {number} value - Reputation value (-100 to 100).
     * @returns {Promise<{ key: string, label: string, min: number, max: number, description: string, effects?: object } | null>}
     */
    static async getScaleEntry(value) {
        const data = await this._loadReputationData();
        const scale = data?.reputationScale ?? [];
        const v = Math.round(Number(value));
        const entry = scale.find(e => v >= e.min && v <= e.max);
        return entry ?? null;
    }

    /**
     * Get party reputation for a scene (-100 to +100). Stored in world setting blacksmithPartyData.
     * @param {Scene|null} [scene] - Scene to read from; defaults to current canvas scene.
     * @returns {number} Clamped value, or 0 if no scene or no value stored.
     */
    static getPartyReputation(scene = null) {
        const s = scene ?? canvas?.scene;
        if (!s?.id) return 0;
        try {
            const data = game.settings.get(MODULE.ID, SETTING_PARTY_DATA) ?? {};
            const scenes = data.scenes ?? {};
            const entry = scenes[s.id];
            const value = entry?.reputation;
            if (value == null || value === '') return 0;
            const n = Number(value);
            if (Number.isNaN(n)) return 0;
            return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Math.round(n)));
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ReputationManager: Error reading party reputation', error?.message ?? error, false, true);
            return 0;
        }
    }

    /**
     * Set party reputation for a scene. GM only. Clamps to -100..+100.
     * Stored in world setting blacksmithPartyData (reputation is a subset of per-scene data).
     * @param {number} value - Reputation value.
     * @param {Scene|null} [scene] - Scene to write to; defaults to current canvas scene.
     * @returns {Promise<boolean>} True if set, false if skipped (e.g. not GM or no scene).
     */
    static async setPartyReputation(value, scene = null) {
        if (!game.user?.isGM) return false;
        const s = scene ?? canvas?.scene;
        if (!s?.id) return false;
        const clamped = Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Math.round(Number(value) || 0)));
        try {
            const data = foundry.utils.deepClone(game.settings.get(MODULE.ID, SETTING_PARTY_DATA) ?? { scenes: {} });
            if (!data.scenes) data.scenes = {};
            data.scenes[s.id] = {
                uuid: s.uuid ?? data.scenes[s.id]?.uuid,
                title: s.name ?? data.scenes[s.id]?.title,
                reputation: clamped
            };
            await game.settings.set(MODULE.ID, SETTING_PARTY_DATA, data);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ReputationManager: Error setting party reputation', error?.message ?? error, false, true);
            return false;
        }
    }

    /**
     * Post a "Current Reputation" chat card: scene name, current value, and scale data from reputation.json.
     * @returns {Promise<void>}
     */
    static async postCurrentReputationCard() {
        const scene = canvas?.scene;
        const sceneName = scene?.name ?? 'Unknown Scene';
        const value = this.getPartyReputation(scene);
        const scaleEntry = await this.getScaleEntry(value);
        const scaleLabel = scaleEntry?.label ?? '-';

        const blocks = [{
            type: 'paragraph',
            text: `The party's current reputation is at **${value}** points, so they are **${scaleLabel}** in this area.`
        }];
        if (scaleEntry?.description) blocks.push({ type: 'paragraph', text: scaleEntry.description });

        await ChatCardsAPI.post({
            moduleId: MODULE.ID,
            type: 'reputation-current',
            parts: [
                { part: 'header', icon: 'fa-solid fa-medal', title: `Reputation: ${scaleLabel}` },
                { part: 'section', label: sceneName },
                { part: 'prose', blocks }
            ],
            speaker: ChatMessage.getSpeaker({ alias: game.user?.name })
        });
    }

    /**
     * Post a "New Reputation" chat card: scene name, change in reputation, new total, and scale data.
     * @param {number} change - Delta (e.g. +5, -1).
     * @param {number} previousValue - Value before the change.
     * @param {number} newValue - Value after the change.
     * @returns {Promise<void>}
     */
    static async postNewReputationCard(change, previousValue, newValue) {
        const scene = canvas?.scene;
        const sceneName = scene?.name ?? 'Unknown Scene';
        const scaleEntry = await this.getScaleEntry(newValue);
        const scaleLabel = scaleEntry?.label ?? '-';
        const changeText = change >= 0 ? `+${change}` : String(change);

        const blocks = [{
            type: 'paragraph',
            text: `The party has had a **${changeText}** change in their reputation. `
                + `Their reputation has gone from **${previousValue}** to **${newValue}** points, `
                + `making them **${scaleLabel}** in this area.`
        }];
        if (scaleEntry?.description) blocks.push({ type: 'paragraph', text: scaleEntry.description });

        await ChatCardsAPI.post({
            moduleId: MODULE.ID,
            type: 'reputation-change',
            parts: [
                { part: 'header', icon: 'fa-solid fa-arrow-trend-up', title: 'Reputation Change' },
                { part: 'section', label: sceneName },
                { part: 'prose', blocks }
            ],
            speaker: ChatMessage.getSpeaker({ alias: game.user?.name })
        });
    }

}
