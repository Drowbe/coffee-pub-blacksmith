// ==================================================================
// ===== OPENAI API (Regent) ========================================
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

export class OpenAIAPI {
    static history = [];
    static sessionHistories = new Map();
    static STORAGE_KEY = 'regent-openai-memories';
    static PROJECT_HEADER = 'OpenAI-Project';

    static pushHistory(...args) {
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        this.history.push(...args);
        if (maxHistoryLength > 0 && this.history.length > maxHistoryLength) {
            this.history = this.history.slice(this.history.length - maxHistoryLength);
        }
        return this.history;
    }

    static getSessionHistory(sessionId) {
        if (!this.sessionHistories.has(sessionId)) {
            this.sessionHistories.set(sessionId, []);
        }
        return this.sessionHistories.get(sessionId);
    }

    static pushSessionHistory(sessionId, ...args) {
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        const sessionHistory = this.getSessionHistory(sessionId);
        sessionHistory.push(...args);
        if (maxHistoryLength > 0 && sessionHistory.length > maxHistoryLength) {
            const trimmedHistory = sessionHistory.slice(sessionHistory.length - maxHistoryLength);
            this.sessionHistories.set(sessionId, trimmedHistory);
        }
        this.saveSessionHistories();
        return sessionHistory;
    }

    static clearSessionHistory(sessionId) {
        this.sessionHistories.delete(sessionId);
        this.saveSessionHistories();
    }

    static clearAllSessionHistories() {
        this.sessionHistories.clear();
        this.saveSessionHistories();
    }

    static loadSessionHistories() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                this.sessionHistories = new Map(data);
                postConsoleAndNotification(MODULE.NAME, `Loaded ${this.sessionHistories.size} session histories from storage`, "", true, false);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error loading session histories:`, error, true, false);
            this.sessionHistories = new Map();
        }
    }

    static saveSessionHistories() {
        try {
            const data = Array.from(this.sessionHistories.entries());
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            postConsoleAndNotification(MODULE.NAME, `Saved ${this.sessionHistories.size} session histories to storage`, "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error saving session histories:`, error, true, false);
        }
    }

    static initializeMemory() {
        this.loadSessionHistories();
        postConsoleAndNotification(MODULE.NAME, "OpenAI Memory System initialized", "", true, false);
    }

    static getMemoryStats() {
        const stats = { totalSessions: this.sessionHistories.size, totalMessages: 0, sessions: [] };
        for (const [sessionId, history] of this.sessionHistories) {
            stats.sessions.push({ sessionId, messageCount: history.length, lastMessage: history.length > 0 ? history[history.length - 1] : null });
            stats.totalMessages += history.length;
        }
        return stats;
    }

    static exportSessionHistory(sessionId = null) {
        if (sessionId) {
            return { sessionId, history: this.getSessionHistory(sessionId), exportedAt: new Date().toISOString() };
        }
        return { allSessions: Array.from(this.sessionHistories.entries()), exportedAt: new Date().toISOString() };
    }

    static getStorageSize() {
        const data = Array.from(this.sessionHistories.entries());
        const jsonString = JSON.stringify(data);
        const sizeInBytes = new Blob([jsonString]).size;
        return {
            sizeInBytes,
            sizeInKB: (sizeInBytes / 1024).toFixed(2),
            sizeInMB: (sizeInBytes / (1024 * 1024)).toFixed(2),
            estimatedTokens: Math.ceil(jsonString.length / 4),
            localStorageLimit: '5-10MB',
            isNearLimit: sizeInBytes > 4 * 1024 * 1024
        };
    }

    static cleanupOldSessions(maxAgeDays = 30, maxSessions = 50) {
        const now = Date.now();
        const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
        let cleanedCount = 0;
        const sessions = Array.from(this.sessionHistories.entries()).map(([id, history]) => ({
            id, history,
            lastActivity: history.length > 0 ? new Date(history[history.length - 1].timestamp || now).getTime() : now
        })).sort((a, b) => b.lastActivity - a.lastActivity);
        for (const session of sessions) {
            if (now - session.lastActivity > maxAge) {
                this.sessionHistories.delete(session.id);
                cleanedCount++;
            }
        }
        if (this.sessionHistories.size > maxSessions) {
            const remaining = Array.from(this.sessionHistories.entries())
                .map(([id, history]) => ({ id, history, lastActivity: history.length > 0 ? new Date(history[history.length - 1].timestamp || now).getTime() : now }))
                .sort((a, b) => a.lastActivity - b.lastActivity);
            const toRemove = remaining.slice(0, this.sessionHistories.size - maxSessions);
            for (const session of toRemove) {
                this.sessionHistories.delete(session.id);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.saveSessionHistories();
            postConsoleAndNotification(MODULE.NAME, `Cleaned up ${cleanedCount} old sessions`, "", true, false);
        }
        return cleanedCount;
    }

    static optimizeStorage(sessionId = null) {
        const sessionsToOptimize = sessionId ? [sessionId] : Array.from(this.sessionHistories.keys());
        let optimizedCount = 0;
        for (const id of sessionsToOptimize) {
            const history = this.getSessionHistory(id);
            if (history.length > 20) {
                const keepFirst = 5, keepLast = 15;
                const compressMiddle = history.slice(keepFirst, history.length - keepLast);
                if (compressMiddle.length > 0) {
                    const summary = { role: 'system', content: `[${compressMiddle.length} previous messages compressed for storage optimization]`, timestamp: new Date().toISOString(), compressed: true };
                    this.sessionHistories.set(id, [...history.slice(0, keepFirst), summary, ...history.slice(history.length - keepLast)]);
                    optimizedCount++;
                }
            }
        }
        if (optimizedCount > 0) {
            this.saveSessionHistories();
            postConsoleAndNotification(MODULE.NAME, `Optimized ${optimizedCount} sessions for storage`, "", true, false);
        }
        return optimizedCount;
    }

    static getProjectId() {
        return game.settings.get(MODULE.ID, 'openAIProjectId') || null;
    }

    static isProjectEnabled() {
        return this.getProjectId() !== null;
    }

    static async callGptApiTextWithMemory(query, sessionId = 'default', projectId = null) {
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        const sessionHistory = maxHistoryLength > 0 ? this.getSessionHistory(sessionId).slice(-maxHistoryLength) : this.getSessionHistory(sessionId);
        const result = await this.callGptApiText(query, sessionHistory, projectId);
        if (result && result.content) {
            this.pushSessionHistory(sessionId, { role: 'user', content: query }, { role: 'assistant', content: result.content });
        }
        return result;
    }

    static async callGptApiText(query, customHistory = null, projectId = null) {
        if (!query) return "What madness is this? You query me with silence? I received no words.";
        const apiKey = game.settings.get(MODULE.ID, 'openAIAPIKey');
        const model = game.settings.get(MODULE.ID, 'openAIModel');
        const prompt = game.settings.get(MODULE.ID, 'openAIPrompt');
        const temperature = game.settings.get(MODULE.ID, 'openAITemperature');
        const apiUrl = 'https://api.openai.com/v1/chat/completions';
        const promptMessage = { role: 'user', content: prompt };
        const queryMessage = { role: 'user', content: query };

        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            postConsoleAndNotification(MODULE.NAME, `Invalid API key:`, apiKey, true, false);
            return "My mind is clouded. Invalid API key configuration.";
        }
        if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
            postConsoleAndNotification(MODULE.NAME, `Invalid prompt:`, prompt, true, false);
            return "My mind is clouded. Invalid prompt configuration.";
        }

        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        const history = customHistory || (maxHistoryLength > 0 ? this.pushHistory().slice(-maxHistoryLength) : this.pushHistory());
        const messages = history.concat(promptMessage, queryMessage);

        if (!Array.isArray(messages) || messages.length === 0) {
            postConsoleAndNotification(MODULE.NAME, `Invalid messages array:`, messages, true, false);
            return "My mind is clouded. Invalid message configuration.";
        }
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.role || !msg.content) {
                postConsoleAndNotification(MODULE.NAME, `Invalid message at index ${i}:`, msg, true, false);
                return "My mind is clouded. Invalid message format.";
            }
        }

        let max_tokens = 4096;
        postConsoleAndNotification(MODULE.NAME, `Using model ${model} with max_tokens ${max_tokens}`, "", true, false);
        const tempValue = parseFloat(temperature);
        const validTemperature = isNaN(tempValue) ? 0.7 : Math.max(0, Math.min(2, tempValue));

        if (!model || typeof model !== 'string') {
            postConsoleAndNotification(MODULE.NAME, `Invalid model name: ${model}`, "", true, false);
            return "My mind is clouded. Invalid model configuration.";
        }
        if (!model.startsWith('gpt-') && !model.startsWith('o1-')) {
            postConsoleAndNotification(MODULE.NAME, `Warning: Model name doesn't start with 'gpt-' or 'o1-': ${model}`, "", true, false);
        }

        const requestBody = { model: model.trim(), messages, temperature: validTemperature, max_tokens };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        const effectiveProjectId = projectId || this.getProjectId();
        if (effectiveProjectId) {
            headers[this.PROJECT_HEADER] = effectiveProjectId;
        }

        const requestOptions = { method: 'POST', headers, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(120000) };

        const handleError = async (response, error = null) => {
            let errorMessage = "";
            if (error) {
                errorMessage = error.name === "AbortError" ? "The request timed out." : error.message;
            } else if (response) {
                try {
                    const data = await response.json();
                    if (response.status === 401) errorMessage = "Invalid API key.";
                    else if (response.status === 429) errorMessage = "Rate limit exceeded.";
                    else errorMessage = data?.error?.message || "Unknown error";
                } catch (e) { errorMessage = "Could not decode API response"; }
            }
            return `My mind is clouded. ${errorMessage}`;
        };

        try {
            let response = null;
            for (let retries = 0, backoffTime = 2000; retries < 4; retries++, backoffTime *= 2) {
                if (retries > 0) await new Promise(r => setTimeout(r, backoffTime));
                try {
                    response = await fetch(apiUrl, requestOptions);
                    if (response.ok) {
                        const data = await response.json();
                        const replyMessage = data.choices[0].message;
                        const usage = data.usage;
                        let cost = (usage.prompt_tokens * 0.001 + usage.completion_tokens * 0.002) / 1000;
                        if (model.includes('gpt-4o-mini')) cost = (usage.prompt_tokens * 0.00015 + usage.completion_tokens * 0.0006) / 1000;
                        else if (model.includes('gpt-4o')) cost = (usage.prompt_tokens * 0.005 + usage.completion_tokens * 0.015) / 1000;
                        else if (model.includes('gpt-4')) cost = (usage.prompt_tokens * 0.03 + usage.completion_tokens * 0.06) / 1000;
                        else if (model.includes('gpt-3.5-turbo')) cost = (usage.prompt_tokens * 0.0005 + usage.completion_tokens * 0.0015) / 1000;
                        replyMessage.usage = usage;
                        replyMessage.cost = cost;
                        this.pushHistory(queryMessage, replyMessage);
                        return replyMessage;
                    }
                    if (response.status !== 429 && response.status !== 500) break;
                } catch (fetchError) {
                    if (fetchError.name !== "AbortError") throw fetchError;
                }
            }
            return await handleError(response);
        } catch (error) {
            return await handleError(null, error);
        }
    }

    static async callGptApiImage(query) {
        const apiKey = game.settings.get(MODULE.ID, 'openAIAPIKey');
        const response = await fetch('https://api.openai.com/v1/images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: "dall-e-3", prompt: query, n: 1, size: "1024x1024" })
        });
        const data = await response.json();
        return data.data[0].url;
    }

    static async getOpenAIReplyAsHtmlWithMemory(query, sessionId = 'default', projectId = null) {
        const response = await this.callGptApiTextWithMemory(query, sessionId, projectId);
        if (typeof response === 'string') return response;
        return this._formatReplyContent(response);
    }

    static async getOpenAIReplyAsHtml(query) {
        const response = await this.callGptApiText(query);
        if (typeof response === 'string') return response;
        return this._formatReplyContent(response);
    }

    static _formatReplyContent(response) {
        let content = response.content;
        if (content.includes('{') && content.includes('}')) {
            try {
                const startIndex = content.indexOf('{');
                const endIndex = content.lastIndexOf('}') + 1;
                content = content.substring(startIndex, endIndex).replace(/['"`]+$/, '');
                const jsonObj = JSON.parse(content);
                if (jsonObj.linkedEncounters) {
                    jsonObj.linkedEncounters = jsonObj.linkedEncounters.map(enc => ({
                        uuid: enc.uuid || "", name: enc.name || "", synopsis: enc.synopsis || "",
                        keyMoments: Array.isArray(enc.keyMoments) ? enc.keyMoments : []
                    }));
                }
                content = JSON.stringify(jsonObj, null, 2);
            } catch (e) {
                postConsoleAndNotification(MODULE.NAME, "Error processing JSON", e, false, true);
            }
        } else {
            content = /<\/?[a-z][\s\S]*>/i.test(content) || !content.includes('\n') ? content : content.replace(/\n/g, "<br>");
            content = content.replaceAll("<p></p>", "").replace(/```\w*\n?/g, "").trim();
        }
        response.content = content;
        return response;
    }
}
