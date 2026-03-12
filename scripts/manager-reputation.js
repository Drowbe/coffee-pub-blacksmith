// ==================================================================
// ===== MANAGER-REPUTATION – scene/campaign and party/player reputation
// ==================================================================
// Party reputation is stored per scene (scene flag). The party bar
// balancebar shows the current scene's reputation. Uses resources/reputation.json
// for scale labels and descriptions. Future: campaign reputation (aggregate of
// scenes), player-level reputation (party as aggregate of players).
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const REPUTATION_MIN = -100;
const REPUTATION_MAX = 100;
const FLAG_PARTY_REPUTATION = 'partyReputation';
const REPUTATION_JSON_PATH = `modules/${MODULE.ID}/resources/reputation.json`;

/** @type {{ reputationScale: Array<{ key: string, label: string, min: number, max: number, description: string, effects?: object }> } | null } */
let _reputationData = null;

export class ReputationManager {

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
     * Get party reputation for a scene (-100 to +100). Stored on the scene flag.
     * @param {Scene|null} [scene] - Scene to read from; defaults to current canvas scene.
     * @returns {number} Clamped value, or 0 if no scene / no flag.
     */
    static getPartyReputation(scene = null) {
        const s = scene ?? canvas?.scene;
        if (!s?.id) return 0;
        try {
            const value = s.getFlag(MODULE.ID, FLAG_PARTY_REPUTATION);
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
            await s.setFlag(MODULE.ID, FLAG_PARTY_REPUTATION, clamped);
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ReputationManager: Error setting party reputation', error?.message ?? error, false, true);
            return false;
        }
    }

    /**
     * Post a "Current Reputation" chat card: scene name, current value, and scale data from reputation.json.
     * @param {Object} [api] - Optional; if provided and bar is open, no need to pass for card posting. Used for chatCards theme.
     */
    static async postCurrentReputationCard(api = null) {
        const scene = canvas?.scene;
        const sceneName = scene?.name ?? 'Unknown Scene';
        const value = this.getPartyReputation(scene);
        const scaleEntry = await this.getScaleEntry(value);
        const chatCardsAPI = api ?? game.modules.get(MODULE.ID)?.api?.chatCards;
        const themeClassName = chatCardsAPI?.getThemeClassName?.('default') ?? 'theme-default';
        const templateData = {
            sceneName,
            value,
            scaleLabel: scaleEntry?.label ?? '—',
            scaleDescription: scaleEntry?.description ?? ''
        };
        try {
            const html = await foundry.applications.handlebars.renderTemplate(
                `modules/${MODULE.ID}/templates/cards-reputation-current.hbs`,
                { ...templateData, themeClassName }
            );
            await ChatMessage.create({
                content: html,
                speaker: ChatMessage.getSpeaker({ alias: game.user?.name }),
                type: CONST.CHAT_MESSAGE_TYPES.OTHER
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ReputationManager: Error posting current reputation card', error?.message ?? error, false, true);
        }
    }

    /**
     * Post a "New Reputation" chat card: scene name, change in reputation, new total, and scale data.
     * @param {number} change - Delta (e.g. +5, -1).
     * @param {number} previousValue - Value before the change.
     * @param {number} newValue - Value after the change.
     * @param {Object} [api] - Optional; for chatCards theme.
     */
    static async postNewReputationCard(change, previousValue, newValue, api = null) {
        const scene = canvas?.scene;
        const sceneName = scene?.name ?? 'Unknown Scene';
        const scaleEntry = await this.getScaleEntry(newValue);
        const chatCardsAPI = api ?? game.modules.get(MODULE.ID)?.api?.chatCards;
        const themeClassName = chatCardsAPI?.getThemeClassName?.('default') ?? 'theme-default';
        const changeText = change >= 0 ? `+${change}` : String(change);
        const templateData = {
            sceneName,
            change: changeText,
            previousValue,
            newValue,
            scaleLabel: scaleEntry?.label ?? '—',
            scaleDescription: scaleEntry?.description ?? ''
        };
        try {
            const html = await foundry.applications.handlebars.renderTemplate(
                `modules/${MODULE.ID}/templates/cards-reputation-new.hbs`,
                { ...templateData, themeClassName }
            );
            await ChatMessage.create({
                content: html,
                speaker: ChatMessage.getSpeaker({ alias: game.user?.name }),
                type: CONST.CHAT_MESSAGE_TYPES.OTHER
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ReputationManager: Error posting new reputation card', error?.message ?? error, false, true);
        }
    }

    /**
     * Register the Reputation balancebar with the party secondary bar. Call once when setting up the party bar (e.g. from api-menubar).
     * @param {Object} api - Blacksmith module API (registerSecondaryBarItem, updateSecondaryBarItemInfo, setPartyReputation).
     */
    static registerPartyBarItem(api) {
        if (!api?.registerSecondaryBarItem) return;
        const itemConfig = {
            kind: 'balancebar',
            zone: 'left',
            title: 'Reputation',
            icon: '',
            width: 300,
            height: 20,
            borderColor: 'rgba(0,0,0,0.5)',
            barColorLeft: 'rgba(167, 76, 54, 0.8)',
            barColorRight: 'rgba(26, 62, 30, 0.8)',
            markerColor: 'rgba(255, 255, 255, 0.8)',
            percentProgress: this.getPartyReputation(),
            leftIcon: 'fa-solid fa-face-angry-horns',
            rightIcon: 'fa-solid fa-face-smile-halo',
            leftLabel: '',
            rightLabel: '',
            group: 'health',
            order: 1,
            tooltip: 'Party reputation (scene). Right-click to set.',
            contextMenuItems: this._getReputationContextMenuItems(api)
        };
        api.registerSecondaryBarItem('party', 'reputation', itemConfig);
    }

    /**
     * Context menu items for the reputation balancebar (right-click).
     * @param {Object} api - Blacksmith module API.
     * @returns {Array<{ name: string, icon: string, onClick: Function }>}
     * @private
     */
    static _getReputationContextMenuItems(api) {
        if (!api?.setPartyReputation || !api?.updateSecondaryBarItemInfo) return [];
        return [
            {
                name: 'Send Current Reputation',
                icon: 'fas fa-message',
                onClick: async () => { await this.postCurrentReputationCard(api); }
            },
            {
                name: 'Increase Reputation by 5',
                icon: 'fas fa-arrow-up',
                onClick: async () => {
                    const prev = this.getPartyReputation();
                    const next = Math.min(REPUTATION_MAX, prev + 5);
                    await api.setPartyReputation(next);
                    api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: next });
                    await this.postNewReputationCard(5, prev, next, api);
                }
            },
            {
                name: 'Increase Reputation by 1',
                icon: 'fas fa-chevron-up',
                onClick: async () => {
                    const prev = this.getPartyReputation();
                    const next = Math.min(REPUTATION_MAX, prev + 1);
                    await api.setPartyReputation(next);
                    api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: next });
                    await this.postNewReputationCard(1, prev, next, api);
                }
            },
            {
                name: 'Reset Reputation to 0',
                icon: 'fas fa-equals',
                onClick: async () => {
                    const prev = this.getPartyReputation();
                    await api.setPartyReputation(0);
                    api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: 0 });
                    await this.postNewReputationCard(-prev, prev, 0, api);
                }
            },
            {
                name: 'Decrease Reputation by 1',
                icon: 'fas fa-chevron-down',
                onClick: async () => {
                    const prev = this.getPartyReputation();
                    const next = Math.max(REPUTATION_MIN, prev - 1);
                    await api.setPartyReputation(next);
                    api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: next });
                    await this.postNewReputationCard(-1, prev, next, api);
                }
            },
            {
                name: 'Decrease Reputation by 5',
                icon: 'fas fa-arrow-down',
                onClick: async () => {
                    const prev = this.getPartyReputation();
                    const next = Math.max(REPUTATION_MIN, prev - 5);
                    await api.setPartyReputation(next);
                    api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: next });
                    await this.postNewReputationCard(-5, prev, next, api);
                }
            }
        ];
    }

    /**
     * Refresh the party bar reputation item with the current scene's value. Call when the party bar is refreshed (e.g. from api-menubar _refreshPartyBarInfo).
     * @param {Object} api - Blacksmith module API (updateSecondaryBarItemInfo).
     */
    static refreshPartyBarReputation(api) {
        if (!api?.updateSecondaryBarItemInfo) return;
        const value = this.getPartyReputation();
        api.updateSecondaryBarItemInfo('party', 'reputation', { percentProgress: value });
    }
}
