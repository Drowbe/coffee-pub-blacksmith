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
     * Call OpenAI text completion API
     * @param {string} query - The query to send to OpenAI
     * @returns {Promise<Object>} OpenAI response object
     */
    static async callGptApiText(query) {
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
        const history = maxHistoryLength > 0 ? this.pushHistory().slice(-maxHistoryLength) : this.pushHistory();
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

        // Set max tokens based on model
        let max_tokens;
        if (model.includes('gpt-4-turbo') || model.includes('gpt-4o')) {
            max_tokens = 4096;  // GPT-4 Turbo/GPT-4o max completion tokens
        } else if (model.includes('gpt-4')) {
            max_tokens = 4096;  // Standard GPT-4 max completion tokens (reduced from 8192)
        } else if (model.includes('gpt-3.5-turbo')) {
            max_tokens = 4096;  // GPT-3.5 Turbo max completion tokens
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

        // Check if model name looks valid
        if (!model.startsWith('gpt-')) {
            postConsoleAndNotification(MODULE.NAME, `Warning: Model name doesn't start with 'gpt-': ${model}`, "", true, false);
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

        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
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
                        
                        // Calculate cost based on model
                        let cost = 0;
                        if (model === 'gpt-4-turbo-preview') {
                            cost = (usage.prompt_tokens * 0.01 + usage.completion_tokens * 0.03) / 1000;
                        } else if (model === 'gpt-4') {
                            cost = (usage.prompt_tokens * 0.03 + usage.completion_tokens * 0.06) / 1000;
                        } else if (model === 'gpt-3.5-turbo') {
                            cost = (usage.prompt_tokens * 0.0005 + usage.completion_tokens * 0.0015) / 1000;
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
     * Get OpenAI reply as HTML formatted response
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
