// ================================================================== 
// ===== OPENAI API ================================================
// ================================================================== 

// ================================================================== 
// ===== VARIABLE IMPORTS ===========================================
// ================================================================== 

// Grab the module data
import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

// ================================================================== 
// ===== OPENAI API CLASS ===========================================
// ================================================================== 

export class OpenAIAPI {
    static history = [];
    static sessionHistories = new Map(); // Store history per user/session
    static STORAGE_KEY = 'blacksmith-openai-memories'; // Key for persistent storage
    static PROJECT_HEADER = 'OpenAI-Project'; // Header for project requests
    
    /**
     * Push messages to history with length management
     * @param {...Object} args - Messages to add to history
     * @returns {Array} Updated history array
     */
    static pushHistory(...args) {
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        
        this.history.push(...args);
        // Only limit history if maxHistoryLength is greater than 0
        if (maxHistoryLength > 0 && this.history.length > maxHistoryLength) {
            this.history = this.history.slice(this.history.length - maxHistoryLength);
        }
        
        return this.history;
    }

    /**
     * Get or create session history for a user
     * @param {string} sessionId - Unique session identifier (e.g., user ID)
     * @returns {Array} Session history array
     */
    static getSessionHistory(sessionId) {
        if (!this.sessionHistories.has(sessionId)) {
            this.sessionHistories.set(sessionId, []);
        }
        return this.sessionHistories.get(sessionId);
    }

    /**
     * Push messages to session history with length management
     * @param {string} sessionId - Unique session identifier
     * @param {...Object} args - Messages to add to history
     * @returns {Array} Updated session history array
     */
    static pushSessionHistory(sessionId, ...args) {
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        const sessionHistory = this.getSessionHistory(sessionId);
        
        sessionHistory.push(...args);
        // Only limit history if maxHistoryLength is greater than 0
        if (maxHistoryLength > 0 && sessionHistory.length > maxHistoryLength) {
            const trimmedHistory = sessionHistory.slice(sessionHistory.length - maxHistoryLength);
            this.sessionHistories.set(sessionId, trimmedHistory);
        }
        
        // Auto-save to persistent storage
        this.saveSessionHistories();
        
        return sessionHistory;
    }

    /**
     * Clear session history
     * @param {string} sessionId - Unique session identifier
     */
    static clearSessionHistory(sessionId) {
        this.sessionHistories.delete(sessionId);
        this.saveSessionHistories();
    }

    /**
     * Clear all session histories
     */
    static clearAllSessionHistories() {
        this.sessionHistories.clear();
        this.saveSessionHistories();
    }

    /**
     * Load session histories from persistent storage
     */
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

    /**
     * Save session histories to persistent storage
     */
    static saveSessionHistories() {
        try {
            const data = Array.from(this.sessionHistories.entries());
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            postConsoleAndNotification(MODULE.NAME, `Saved ${this.sessionHistories.size} session histories to storage`, "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error saving session histories:`, error, true, false);
        }
    }

    /**
     * Initialize the memory system (call this when module loads)
     */
    static initializeMemory() {
        this.loadSessionHistories();
        postConsoleAndNotification(MODULE.NAME, "OpenAI Memory System initialized", "", true, false);
    }

    /**
     * Get memory statistics
     * @returns {Object} Memory usage statistics
     */
    static getMemoryStats() {
        const stats = {
            totalSessions: this.sessionHistories.size,
            totalMessages: 0,
            sessions: []
        };

        for (const [sessionId, history] of this.sessionHistories) {
            const sessionStats = {
                sessionId,
                messageCount: history.length,
                lastMessage: history.length > 0 ? history[history.length - 1] : null
            };
            stats.sessions.push(sessionStats);
            stats.totalMessages += history.length;
        }

        return stats;
    }

    /**
     * Export session history for backup
     * @param {string} sessionId - Session to export (optional, exports all if not provided)
     * @returns {Object} Exported data
     */
    static exportSessionHistory(sessionId = null) {
        if (sessionId) {
            return {
                sessionId,
                history: this.getSessionHistory(sessionId),
                exportedAt: new Date().toISOString()
            };
        } else {
            return {
                allSessions: Array.from(this.sessionHistories.entries()),
                exportedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Get storage size information
     * @returns {Object} Storage size statistics
     */
    static getStorageSize() {
        const data = Array.from(this.sessionHistories.entries());
        const jsonString = JSON.stringify(data);
        const sizeInBytes = new Blob([jsonString]).size;
        const sizeInKB = (sizeInBytes / 1024).toFixed(2);
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
        
        return {
            sizeInBytes,
            sizeInKB,
            sizeInMB,
            estimatedTokens: Math.ceil(jsonString.length / 4), // Rough estimate: 4 chars per token
            localStorageLimit: '5-10MB',
            isNearLimit: sizeInBytes > 4 * 1024 * 1024 // Warning if over 4MB
        };
    }

    /**
     * Clean up old sessions based on age or size
     * @param {number} maxAgeDays - Maximum age in days (default: 30)
     * @param {number} maxSessions - Maximum number of sessions to keep (default: 50)
     */
    static cleanupOldSessions(maxAgeDays = 30, maxSessions = 50) {
        const now = Date.now();
        const maxAge = maxAgeDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
        let cleanedCount = 0;
        
        // Get sessions sorted by last activity
        const sessions = Array.from(this.sessionHistories.entries()).map(([id, history]) => ({
            id,
            history,
            lastActivity: history.length > 0 ? new Date(history[history.length - 1].timestamp || now).getTime() : now
        })).sort((a, b) => b.lastActivity - a.lastActivity);
        
        // Remove old sessions
        for (const session of sessions) {
            if (now - session.lastActivity > maxAge) {
                this.sessionHistories.delete(session.id);
                cleanedCount++;
            }
        }
        
        // If still too many sessions, remove oldest ones
        if (this.sessionHistories.size > maxSessions) {
            const remainingSessions = Array.from(this.sessionHistories.entries())
                .map(([id, history]) => ({
                    id,
                    history,
                    lastActivity: history.length > 0 ? new Date(history[history.length - 1].timestamp || now).getTime() : now
                }))
                .sort((a, b) => a.lastActivity - b.lastActivity);
            
            const toRemove = remainingSessions.slice(0, this.sessionHistories.size - maxSessions);
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

    /**
     * Optimize storage by compressing old messages
     * @param {string} sessionId - Session to optimize (optional, optimizes all if not provided)
     */
    static optimizeStorage(sessionId = null) {
        const sessionsToOptimize = sessionId ? [sessionId] : Array.from(this.sessionHistories.keys());
        let optimizedCount = 0;
        
        for (const id of sessionsToOptimize) {
            const history = this.getSessionHistory(id);
            if (history.length > 20) { // Only optimize if there are many messages
                // Keep first 5 and last 15 messages, compress middle ones
                const keepFirst = 5;
                const keepLast = 15;
                const compressMiddle = history.slice(keepFirst, history.length - keepLast);
                
                if (compressMiddle.length > 0) {
                    // Create a summary of compressed messages
                    const summary = {
                        role: 'system',
                        content: `[${compressMiddle.length} previous messages compressed for storage optimization]`,
                        timestamp: new Date().toISOString(),
                        compressed: true
                    };
                    
                    const optimizedHistory = [
                        ...history.slice(0, keepFirst),
                        summary,
                        ...history.slice(history.length - keepLast)
                    ];
                    
                    this.sessionHistories.set(id, optimizedHistory);
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

    /**
     * Get OpenAI project ID from settings
     * @returns {string|null} Project ID if configured, null otherwise
     */
    static getProjectId() {
        return game.settings.get(MODULE.ID, 'openAIProjectId') || null;
    }

    /**
     * Check if OpenAI Projects is enabled
     * @returns {boolean} True if project ID is configured
     */
    static isProjectEnabled() {
        return this.getProjectId() !== null;
    }

    /**
     * Call OpenAI text completion API with session memory
     * @param {string} query - The query to send to OpenAI
     * @param {string} sessionId - Unique session identifier for memory
     * @param {string} projectId - Optional project ID override
     * @returns {Promise<Object>} OpenAI response object
     */
    static async callGptApiTextWithMemory(query, sessionId = 'default', projectId = null) {
        // Use session history instead of global history
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        const sessionHistory = maxHistoryLength > 0 ? this.getSessionHistory(sessionId).slice(-maxHistoryLength) : this.getSessionHistory(sessionId);
        
        // Call the regular method but with session history and project ID
        const result = await this.callGptApiText(query, sessionHistory, projectId);
        
        // Update session history with the exchange
        if (result && result.content) {
            const queryMessage = {role: 'user', content: query};
            const replyMessage = {role: 'assistant', content: result.content};
            this.pushSessionHistory(sessionId, queryMessage, replyMessage);
        }
        
        return result;
    }

    /**
     * Call OpenAI text completion API
     * @param {string} query - The query to send to OpenAI
     * @param {Array} customHistory - Optional custom history array
     * @param {string} projectId - Optional project ID for OpenAI Projects
     * @returns {Promise<Object>} OpenAI response object
     */
    static async callGptApiText(query, customHistory = null, projectId = null) {
        // right off make sure there is data to process.
        if (!query) {
            return "What madness is this? You query me with silence? I received no words.";
        }
       
        var strErrorMessage = "";
        const apiKey = game.settings.get(MODULE.ID, 'openAIAPIKey');
        const model = game.settings.get(MODULE.ID, 'openAIModel');
        const prompt = game.settings.get(MODULE.ID, 'openAIPrompt');
        const temperature = game.settings.get(MODULE.ID, 'openAITemperature');
        const apiUrl = 'https://api.openai.com/v1/chat/completions';
        const promptMessage = {role: 'user', content: prompt};
        const queryMessage = {role: 'user', content: query};

        // Validate API key
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            postConsoleAndNotification(MODULE.NAME, `Invalid API key:`, apiKey, true, false);
            return "My mind is clouded. Invalid API key configuration.";
        }

        // Validate prompt
        if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
            postConsoleAndNotification(MODULE.NAME, `Invalid prompt:`, prompt, true, false);
            return "My mind is clouded. Invalid prompt configuration.";
        }

        // Get message history based on context length setting
        const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
        const history = customHistory || (maxHistoryLength > 0 ? this.pushHistory().slice(-maxHistoryLength) : this.pushHistory());
        const messages = history.concat(promptMessage, queryMessage);

        // Validate messages array
        if (!Array.isArray(messages) || messages.length === 0) {
            postConsoleAndNotification(MODULE.NAME, `Invalid messages array:`, messages, true, false);
            return "My mind is clouded. Invalid message configuration.";
        }

        // Validate each message has required fields
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.role || !msg.content) {
                postConsoleAndNotification(MODULE.NAME, `Invalid message at index ${i}:`, msg, true, false);
                return "My mind is clouded. Invalid message format.";
            }
        }

        // Set max tokens based on model (updated December 2024)
        let max_tokens;
        if (model.includes('gpt-5')) {
            max_tokens = 4096;  // GPT-5 max completion tokens
        } else if (model.includes('gpt-4o')) {
            max_tokens = 4096;  // GPT-4o max completion tokens
        } else if (model.includes('gpt-4-turbo')) {
            max_tokens = 4096;  // GPT-4 Turbo max completion tokens
        } else if (model.includes('gpt-4')) {
            max_tokens = 4096;  // Standard GPT-4 max completion tokens
        } else if (model.includes('gpt-3.5-turbo')) {
            max_tokens = 4096;  // GPT-3.5 Turbo max completion tokens
        } else if (model.includes('o1-preview') || model.includes('o1-mini')) {
            max_tokens = 4096;  // O1 models max completion tokens
        } else {
            max_tokens = 4096;  // Default for other models
        }

        postConsoleAndNotification(MODULE.NAME, `Using model ${model} with max_tokens ${max_tokens}`, "", true, false);

        // Validate temperature parameter
        const tempValue = parseFloat(temperature);
        const validTemperature = isNaN(tempValue) ? 0.7 : Math.max(0, Math.min(2, tempValue));

        // Validate model name
        if (!model || typeof model !== 'string') {
            postConsoleAndNotification(MODULE.NAME, `Invalid model name: ${model}`, "", true, false);
            return "My mind is clouded. Invalid model configuration.";
        }

        // Check if model name looks valid (support GPT and O1 models)
        if (!model.startsWith('gpt-') && !model.startsWith('o1-')) {
            postConsoleAndNotification(MODULE.NAME, `Warning: Model name doesn't start with 'gpt-' or 'o1-': ${model}`, "", true, false);
        }

        const requestBody = {
            model: model.trim(),
            messages,
            temperature: validTemperature,
            max_tokens: max_tokens
        };

        // Debug logging
        postConsoleAndNotification(MODULE.NAME, `Request body:`, {
            model: requestBody.model,
            messageCount: requestBody.messages.length,
            temperature: requestBody.temperature,
            max_tokens: requestBody.max_tokens,
            originalTemperature: temperature,
            validatedTemperature: validTemperature
        }, true, false);

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };

        // Add project header if project ID is provided or configured
        const effectiveProjectId = projectId || this.getProjectId();
        if (effectiveProjectId) {
            headers[this.PROJECT_HEADER] = effectiveProjectId;
            postConsoleAndNotification(MODULE.NAME, `Using OpenAI Project: ${effectiveProjectId}`, "", true, false);
        }

        const requestOptions = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(120000) // Increased to 120 second timeout
        };

        // Enhanced error handling
        const handleError = async (response, error = null) => {
            let errorMessage = "";
            
            if (error) {
                if (error.name === "AbortError") {
                    errorMessage = "The request timed out. The response may be too large - try breaking your request into smaller parts.";
                } else {
                    errorMessage = `An unexpected error occurred: ${error.message}`;
                }
            } else if (response) {
                const status = response.status;
                try {
                    const data = await response.json();
                    postConsoleAndNotification(MODULE.NAME, `OpenAI API Error Response:`, data, true, false);
                    switch (status) {
                        case 400:
                            errorMessage = `Bad Request: ${data?.error?.message || "Invalid request parameters"}`;
                            break;
                        case 401:
                            errorMessage = "Invalid API key. Please check your OpenAI API key in settings.";
                            break;
                        case 429:
                            errorMessage = "Rate limit exceeded. Please wait a moment before trying again.";
                            break;
                        case 500:
                            errorMessage = "OpenAI server error. Please try again later.";
                            break;
                        case 413:
                            errorMessage = "The request is too large. Try breaking it into smaller parts.";
                            break;
                        default:
                            errorMessage = data?.error?.message || "Unknown error occurred";
                    }
                } catch (e) {
                    errorMessage = "Could not decode API response";
                    postConsoleAndNotification(MODULE.NAME, `Error decoding API response:`, e, true, false);
                }
            }
            
            return `My mind is clouded. ${errorMessage}`;
        };

        try {
            let response = null;
            // Implement exponential backoff for retries with longer initial wait
            for (let retries = 0, backoffTime = 2000; retries < 4; retries++, backoffTime *= 2) {
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, backoffTime));
                    postConsoleAndNotification(MODULE.NAME, `Retry attempt ${retries} after ${backoffTime}ms wait`, "", true, false);
                }
                
                try {
                    response = await fetch(apiUrl, requestOptions);
                    
                    // Log response status for debugging
                    postConsoleAndNotification(MODULE.NAME, `API Response Status: ${response.status}`, "", true, false);
                    
                    if (response.ok) {
                        const data = await response.json();
                        const replyMessage = data.choices[0].message;
                        const usage = data.usage;
                        
                        // Calculate cost based on model (updated December 2024)
                        let cost = 0;
                        if (model.includes('gpt-5')) {
                            // GPT-5 - Latest flagship model
                            cost = (usage.prompt_tokens * 0.00125 + usage.completion_tokens * 0.01) / 1000;
                        } else if (model.includes('gpt-4o-mini')) {
                            // GPT-4o Mini - Most cost-effective option
                            cost = (usage.prompt_tokens * 0.00015 + usage.completion_tokens * 0.0006) / 1000;
                        } else if (model.includes('gpt-4o')) {
                            // GPT-4o - Current flagship model
                            cost = (usage.prompt_tokens * 0.005 + usage.completion_tokens * 0.015) / 1000;
                        } else if (model.includes('gpt-4-turbo')) {
                            // GPT-4 Turbo - Legacy but still supported
                            cost = (usage.prompt_tokens * 0.01 + usage.completion_tokens * 0.03) / 1000;
                        } else if (model.includes('gpt-4')) {
                            // Other GPT-4 variants
                            cost = (usage.prompt_tokens * 0.03 + usage.completion_tokens * 0.06) / 1000;
                        } else if (model.includes('gpt-3.5-turbo')) {
                            // GPT-3.5 Turbo - Budget option
                            cost = (usage.prompt_tokens * 0.0005 + usage.completion_tokens * 0.0015) / 1000;
                        } else if (model.includes('o1-preview') || model.includes('o1-mini')) {
                            // O1 models - Reasoning models with different pricing
                            cost = (usage.prompt_tokens * 0.015 + usage.completion_tokens * 0.06) / 1000;
                        } else {
                            // Fallback for unknown models - conservative estimate
                            cost = (usage.prompt_tokens * 0.001 + usage.completion_tokens * 0.002) / 1000;
                        }
                        
                        // Add usage and cost to the message
                        replyMessage.usage = usage;
                        replyMessage.cost = cost;
                        
                        // Update history with the latest exchange
                        this.pushHistory(queryMessage, replyMessage);
                        return replyMessage;
                    }
                    
                    // If we get a 429 (rate limit) or 500 (server error), retry with backoff
                    if (response.status !== 429 && response.status !== 500) {
                        break;
                    }
                } catch (fetchError) {
                    // If it's not a timeout error, break the retry loop
                    if (fetchError.name !== "AbortError") {
                        throw fetchError;
                    }
                    // For timeout errors, continue with retry
                    postConsoleAndNotification(MODULE.NAME, `Request timed out, will retry`, "", true, false);
                }
            }
            
            // If we get here, all retries failed or we got a non-retryable error
            return await handleError(response);
        } catch (error) {
            return await handleError(null, error);
        }
    }

    /**
     * Call OpenAI image generation API
     * @param {string} query - The image prompt
     * @returns {Promise<string>} Image URL
     */
    static async callGptApiImage(query) {
        const apiKey = game.settings.get(MODULE.ID, 'openAIAPIKey');
        const apiUrl = 'https://api.openai.com/v1/images';
        const requestBody = {
            model: "dall-e-3",
            prompt: query,
            n: 1,
            size: "1024x1024",
        };
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        };
        const response = await fetch(apiUrl, requestOptions);
        const data = await response.json();
        const image_url = data.data[0].url;
        return image_url;  // Returns an URL to the Draft response where it could be used 
    }

    /**
     * Get OpenAI reply as HTML formatted response with session memory
     * @param {string} query - The query to send to OpenAI
     * @param {string} sessionId - Unique session identifier for memory
     * @param {string} projectId - Optional project ID for OpenAI Projects
     * @returns {Promise<Object>} Formatted response object
     */
    static async getOpenAIReplyAsHtmlWithMemory(query, sessionId = 'default', projectId = null) {
        postConsoleAndNotification(MODULE.NAME, "In getOpenAIReplyAsHtmlWithMemory(query, sessionId): query =", query, true, false);  
        postConsoleAndNotification(MODULE.NAME, "Session ID =", sessionId, true, false);
	
        const response = await this.callGptApiTextWithMemory(query, sessionId, projectId);
        
        if (typeof response === 'string') {
            // If it's an error message or simple string
            return response;
        }

        let content = response.content;

        // Clean up JSON responses
        if (content.includes('{') && content.includes('}')) {
            try {
                // Find the first { and last }
                const startIndex = content.indexOf('{');
                const endIndex = content.lastIndexOf('}') + 1;
                
                // Extract just the JSON part
                content = content.substring(startIndex, endIndex);
                
                // Remove any trailing quotes or text
                content = content.replace(/['"`]+$/, '');

                // Parse and validate the JSON
                const jsonObj = JSON.parse(content);
                
                // Ensure linkedEncounters is properly formatted
                if (jsonObj.linkedEncounters) {
                    jsonObj.linkedEncounters = jsonObj.linkedEncounters.map(encounter => ({
                        uuid: encounter.uuid || "",
                        name: encounter.name || "",
                        synopsis: encounter.synopsis || "",
                        keyMoments: Array.isArray(encounter.keyMoments) ? encounter.keyMoments : []
                    }));
                }
                
                // Convert back to string
                content = JSON.stringify(jsonObj, null, 2);
            } catch (e) {
                postConsoleAndNotification(MODULE.NAME, "Error processing JSON", e, false, true);
                // Keep the original content if JSON processing fails
            }
        } else {
            // For non-JSON content, format as HTML
            content = /<\/?[a-z][\s\S]*>/i.test(content) || !content.includes('\n') ?
                content : content.replace(/\n/g, "<br>");
                
            // Clean up empty paragraphs and code blocks
            content = content.replaceAll("<p></p>", "")
                            .replace(/```\w*\n?/g, "") // Removes any code block markers with optional language
                            .trim();
        }

        response.content = content;
        return response;
    }

    /**
     * Get OpenAI reply as HTML formatted response (legacy method without memory)
     * @param {string} query - The query to send to OpenAI
     * @returns {Promise<Object>} Formatted response object
     */
    static async getOpenAIReplyAsHtml(query) {
        postConsoleAndNotification(MODULE.NAME, "In getOpenAIReplyAsHtml(query): query =", query, true, false);  
	
        const response = await this.callGptApiText(query);
        
        if (typeof response === 'string') {
            // If it's an error message or simple string
            return response;
        }

        let content = response.content;

        // Clean up JSON responses
        if (content.includes('{') && content.includes('}')) {
            try {
                // Find the first { and last }
                const startIndex = content.indexOf('{');
                const endIndex = content.lastIndexOf('}') + 1;
                
                // Extract just the JSON part
                content = content.substring(startIndex, endIndex);
                
                // Remove any trailing quotes or text
                content = content.replace(/['"`]+$/, '');

                // Parse and validate the JSON
                const jsonObj = JSON.parse(content);
                
                // Ensure linkedEncounters is properly formatted
                if (jsonObj.linkedEncounters) {
                    jsonObj.linkedEncounters = jsonObj.linkedEncounters.map(encounter => ({
                        uuid: encounter.uuid || "",
                        name: encounter.name || "",
                        synopsis: encounter.synopsis || "",
                        keyMoments: Array.isArray(encounter.keyMoments) ? encounter.keyMoments : []
                    }));
                }
                
                // Convert back to string
                content = JSON.stringify(jsonObj, null, 2);
            } catch (e) {
                postConsoleAndNotification(MODULE.NAME, "Error processing JSON", e, false, true);
                // Keep the original content if JSON processing fails
            }
        } else {
            // For non-JSON content, format as HTML
            content = /<\/?[a-z][\s\S]*>/i.test(content) || !content.includes('\n') ?
                content : content.replace(/\n/g, "<br>");
                
            // Clean up empty paragraphs and code blocks
            content = content.replaceAll("<p></p>", "")
                            .replace(/```\w*\n?/g, "") // Removes any code block markers with optional language
                            .trim();
        }

        response.content = content;
        return response;
    }
}
