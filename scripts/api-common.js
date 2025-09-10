// ================================================================== 
// ===== COMMON API =================================================
// ================================================================== 


// ================================================================== 
// ===== VARIABLE IMPORTS ===========================================
// ================================================================== 

// Grab the module data
import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';


// ================================================================== 
// ===== SAFE SETTINGS ACCESS =======================================
// ================================================================== 

/**
 * Safely get a setting value, returning a default if the setting isn't registered yet
 * @param {string} moduleId - The module ID
 * @param {string} settingKey - The setting key
 * @param {*} defaultValue - Default value to return if setting isn't ready
 * @returns {*} The setting value or default
 */
export function getSettingSafely(moduleId, settingKey, defaultValue = null) {
    if (!game?.settings?.settings?.has(`${moduleId}.${settingKey}`)) {
        return defaultValue;
    }
    return game.settings.get(moduleId, settingKey);
}

/**
 * Safely set a setting value, only if the setting is registered
 * @param {string} moduleId - The module ID
 * @param {string} settingKey - The setting key
 * @param {*} value - The value to set
 * @returns {Promise<boolean>} True if successful, false if setting not ready
 */
export async function setSettingSafely(moduleId, settingKey, value) {
    if (!game?.settings?.settings?.has(`${moduleId}.${settingKey}`)) {
        return false;
    }
    try {
        await game.settings.set(moduleId, settingKey, value);
        return true;
    } catch (error) {
        return false;
    }
}

// GLOBAL VARS
export const COFFEEPUB = {
    // SHARED MODULE VARIABLES
    blnDebugOn: false, // Display debug messages
    strDEFAULTCARDTHEME: "cardsdefault", // Default Card Theme
}

// ================================================================== 
// ===== GLOBAL FUNCTIONS ===========================================
// ================================================================== 

/**
 * Format milliseconds into a time string
 * @param {number} ms - milliseconds to format
 * @param {string} format - "colon", "verbose", "extended", "rounds", or any format+rounds (e.g. "verbose+rounds") (default: "colon")
 * @returns {string} formatted time string
 */
export function formatTime(ms, format = "colon") {
    // Ensure we're working with a positive number
    ms = Math.max(0, ms);
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // Check if we need to append rounds
    const includeRounds = format.includes("+rounds");
    const baseFormat = format.replace("+rounds", "");
    
    let timeString = "";
    
    if (baseFormat === "verbose") {
        timeString = `${minutes}m ${seconds}s`;
    }
    else if (baseFormat === "extended") {
        let remainingSeconds = totalSeconds;
        let years, months, weeks, days, hours, mins;
        
        mins = Math.floor(remainingSeconds / 60);
        remainingSeconds %= 60;
        hours = Math.floor(mins / 60);
        mins %= 60;
        days = Math.floor(hours / 24);
        hours %= 24;
        weeks = Math.floor(days / 7);
        days %= 7;
        months = Math.floor(weeks / 4.34524);
        weeks %= 4.34524;
        years = Math.floor(months / 12);
        months %= 12;

        timeString = '';
        if (years > 0) timeString += `${years} YR `;
        if (months > 0) timeString += `${months} MO `;
        if (weeks > 0) timeString += `${Math.floor(weeks)} WK `;
        if (days > 0) timeString += `${days} DAY `;
        if (hours > 0) timeString += `${hours} HR `;
        if (mins > 0) timeString += `${mins} MIN `;
        if (remainingSeconds > 0) timeString += `${remainingSeconds} SEC`;
        
        timeString = timeString.trim() || '0 SEC';
    }
    else if (baseFormat === "rounds") {
        const rounds = Math.floor(totalSeconds / 6);
        return `${rounds} ROUNDS`;
    }
    else {
        // Default to colon format
        timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Append rounds if requested
    if (includeRounds) {
        const rounds = Math.floor(totalSeconds / 6);
        timeString += ` (${rounds} ROUNDS)`;
    }
    
    return timeString;
}

// ************************************
// ** UTILITY Convert Seconds
// ************************************
export function convertSecondsToRounds(numSeconds) {
    if (numSeconds === "0" || isNaN(numSeconds)) {
        return "Permanent";
    }
    return Math.floor(numSeconds / 6);
}


// ************************************
// ** UTILITY Convert Seconds
// ************************************
/**
 * Convert seconds to a human-readable string format
 * @param {number|string} numSeconds - Number of seconds to convert
 * @returns {string} - Formatted time string (e.g., "2 HR 30 MIN (25 ROUNDS)")
 */
export function convertSecondsToString(numSeconds) {
    if (numSeconds === "0" || isNaN(numSeconds)) {
        return "Permanent";
    }
    // Calculate the total number of rounds
    let rounds = Math.floor(numSeconds / 6);
    let years, months, weeks, days, hours, minutes, seconds;
    minutes = Math.floor(numSeconds / 60);
    numSeconds %= 60;
    hours = Math.floor(minutes / 60);
    minutes %= 60;
    days = Math.floor(hours / 24);
    hours %= 24;
    weeks = Math.floor(days / 7);
    days %= 7;
    months = Math.floor(weeks / 4.34524);
    weeks %= 4.34524;
    years = Math.floor(months / 12);
    months %= 12;
    let timeString = '';
    if (years > 0) timeString += `${years} YR `;
    if (months > 0) timeString += `${months} MO `;
    if (weeks > 0) timeString += `${Math.floor(weeks)} WK `;
    if (days > 0) timeString += `${days} DAY `;
    if (hours > 0) timeString += `${hours} HR `;
    if (minutes > 0) timeString += `${minutes} MIN `;
    if (numSeconds > 0) timeString += `${numSeconds} SEC `;
    // Add rounds to the output string
    timeString += `(${rounds} ROUNDS)`;
    return timeString;
}

// ************************************
// ** UTILITY Convert Array to String
// ************************************

export function objectToString(obj) {
    let str = '';
    for (let key in obj) {
        if (str !== '') {
            str += '|'; 
        }
        str += key + '=' + obj[key];
    }
    return str;
}


// ************************************
// ** UTILITY Convert String to Array
// ************************************

export function stringToObject(str) {

    let obj = {};
    if (str) {
        let pairs = str.split('|');
        for (let pair of pairs) {
            let [key, value] = pair.split('=');
            obj[key] = value;
        }
    } else {
        postConsoleAndNotification(MODULE.NAME, "Can't convert an empty string: ", str, false, false);
    }
    return obj;
}

// ************************************
// ** UTILITY Convert string to Sentence Case
// ************************************ 
export function toSentenceCase(str) {
    if ((str === null) || (str === ''))
        return false;
    else
        str = str.toString();
 
    return str.replace(/\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() +
                txt.substr(1).toLowerCase();
        });
}

// ************************************
// ** UTILITY Get Actor ID by Name
// ************************************ 
export function getActorId(actorName) {
    return game.actors.getName(actorName)?.id ?? "";
}



// ************************************
// ** UTILITY Get Token Image with Name
// ************************************ 
export function getTokenImage(tokenDoc) {
    if (!tokenDoc) return null;
    
    // For V12, first try to get img directly
    if (tokenDoc.img) return tokenDoc.img;
    
    // If no direct img, try texture path
    if (tokenDoc.texture?.src) return tokenDoc.texture.src;
    
    // If neither exists, return null
    return null;
}

// ************************************
// ** UTILITY Get Portrait Image with Name
// ************************************ 
export function getPortraitImage(actor) {
    // Get the actor's portrait data.
    const portraitData = actor.img || actor.prototypeToken.texture.src; // Check both possible fields

    // If the portrait data is not set, return an empty string.
    if (!portraitData) {
        return "";
    }
    // Return the portrait image URL.
    return portraitData;
}

// ************************************
// ** UTILITY Get Token ID with Name
// ************************************ 
export function getTokenId(tokenName) {
    // Get the list of all tokens on the canvas.
    const tokens = canvas.tokens.placeables;
  
    // Find the token with the given name.
    const token = tokens.find(e => e.name === tokenName);
  
    // If the token was found, return its ID.
    if (token) {
        return token.id;
    }
    // If the token was not found, return an empty string.
    return "";
}

// ************************************
// ** UTILITY Truncate String
// ************************************ 
// adds a "..." to a string if it is too long
export function trimString(str, maxLength) {
    // check if the string length is more than the maximum length
    if (str.length > maxLength) {
        // if more, cut the string at the maximum length and append with '...'
        str = str.substring(0, maxLength - 3) + '...';
    }
    // if not, return the original string
    return str;
}

// ************************************
// ** UTILITY Convert date to words
// ************************************ 
export function generateFormattedDate(format) {
    // Format the current date to: "(year-month-day hour:minute AM/PM)"
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // January is 0!
    const day = now.getDate();
    const hours = now.getHours() <= 12 ? now.getHours() : now.getHours() - 12;
    const minutes = now.getMinutes();
    const am_pm = now.getHours() >= 12 ? 'PM' : 'AM';
    // If hours or minutes are less than 10, prepend a '0'
    const paddedHours = hours < 10 ? `0${hours}` : hours;
    const paddedMinutes = minutes < 10 ? `0${minutes}` : minutes;

    // Formatted time in 12-hour format
    const formattedTime = `${paddedHours}:${paddedMinutes} ${am_pm}`;
    const formattedDate = `${year}-${month}-${day}`;
    const formattedDateTime = `${formattedDate} ${formattedTime}`;

    // Return based on the format parameter
    if (format === 'time') {
        return formattedTime;
    } else if (format === 'date') {
        return formattedDate;
    } else {
        return formattedDateTime;
    }
}


// ************************************
// ** UTILITY Reset Settings
// ************************************

export function resetModuleSettings(moduleId) {
    // Get the module
    const module = game.modules.get(moduleId);
            postConsoleAndNotification(MODULE.NAME, "A Setting Reset has been called for: ", module, false, true) 
    // Reset all settings to their default values
    module.settings.reset();
            postConsoleAndNotification(MODULE.NAME, "Module settings reset: ", module, false, true) 
} 

// ************************************
// ** BLACKSMITH VARIABLE SHARING
// ************************************
// This code will be executed whenever any BLACKSMITH variable in the "coffee-pub-blacksmith" module is pushed
export function registerBlacksmithUpdatedHook() {
	HookManager.registerHook({
		name: 'blacksmithUpdated',
		description: 'API Common: Handle blacksmith variable updates and sync to COFFEEPUB global',
		context: 'api-common-blacksmith-sync',
		priority: 3,
		callback: (newBlacksmith) => {
			// --- BEGIN - HOOKMANAGER CALLBACK ---

			// BLACKSMITH VARIABLE COLLECTION
			// RICH CONSOLE - Removed, only used internally in postConsoleAndNotification
			// DEBUG ON/OFF
			COFFEEPUB.blnDebugOn = newBlacksmith.blnDebugOn;
			// Get the default theme
			COFFEEPUB.strDEFAULTCARDTHEME = newBlacksmith.strDefaultCardTheme;
			// Get the Themes list
			COFFEEPUB.arrTHEMECHOICES = newBlacksmith.arrThemeChoices;
			// Get the Macro list
			COFFEEPUB.arrMACROCHOICES = newBlacksmith.arrMacroChoices;
			// Get the Table list
			COFFEEPUB.arrCOMPENDIUMCHOICES = newBlacksmith.arrCompendiumChoices;
			// Get the Table list
			COFFEEPUB.arrTABLECHOICES = newBlacksmith.arrTableChoices;
			// Get the Image list
			COFFEEPUB.arrBACKGROUNDIMAGECHOICES = newBlacksmith.arrBackgroundImageChoices;
			// Get the Image list
			COFFEEPUB.arrICONCHOICES = newBlacksmith.arrIconChoices;
			// Get the Sound list
			COFFEEPUB.arrSOUNDCHOICES = newBlacksmith.arrSoundChoices;
			// Get the OpenAI Variables
			COFFEEPUB.strOpenAIAPIKey = newBlacksmith.strOpenAIAPIKey;
			COFFEEPUB.strOpenAIModel = newBlacksmith.strOpenAIModel;
			COFFEEPUB.strOpenAIGameSystems = newBlacksmith.strOpenAIGameSystems;
			COFFEEPUB.strOpenAIPrompt = newBlacksmith.strOpenAITemperature;
			// --- END - HOOKMANAGER CALLBACK ---
		}
	});
}

// ************************************
// ** UTILITY Play Sound 
// ************************************

/**
 * Clamp a number between a minimum and maximum value.
 * @param {number} value - The number to clamp.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} - The clamped value.
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Play a sound with specified path and volume.
 * @param {string} [sound='sound'] - The path to the sound file.
 * @param {number} [volume=0.7] - The volume of the sound (0 to 1).
 * @param {boolean} [loop=false] - Whether the sound should loop.
 * @param {boolean|object} [broadcast=true] - If true, plays for all clients. If false, plays only for the local client.
 *                                           Can also be an object to configure specific recipients.
 * @returns {Promise<void>}
 */
export async function playSound(sound = 'sound', volume = 0.7, loop = false, broadcast = true) {
    if (sound === 'none' || sound === 'sound-none') return;
    
    // Safety check for undefined constants
    if (!sound || sound === 'sound' || sound === 'undefined') {
        console.warn('playSound called with invalid sound:', sound);
        return;
    }

    try {
        await foundry.audio.AudioHelper.play({
            src: sound,
            volume: clamp(volume, 0, 1),
            autoplay: true,
            loop: loop
        }, broadcast);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Global.js | Failed to play sound: ${sound}`, error, false, false);
    }
}

// // ************************************
// // ** UTILITY Roll Dice 
// // ************************************
/**
 * Show the 3D Dice animation for the Roll made by the User.
 *
 * @param {Roll} roll an instance of Roll class to show 3D dice animation.
 * @param {User} user the user who made the roll (game.user by default).
 * @param {Boolean} synchronize if the animation needs to be shown to other players. Default: false
 * @param {Array} whisper list of users or userId who can see the roll, set it to null if everyone can see. Default: null
 * @param {Boolean} blind if the roll is blind for the current user. Default: false 
 * @param {String} A chatMessage ID to reveal when the roll ends. Default: null
 * @param {Object} An object using the same data schema than ChatSpeakerData. 
 *        Needed to hide NPCs roll when the GM enables this setting.
 * @param options Object with 2 booleans: ghost (default: false) and secret (default: false)
 * @returns {Promise<boolean>} when resolved true if the animation was displayed, false if not.
 *game.dice3d.showForRoll(roll, user, synchronize, whisper, blind, chatMessageID, speaker, {ghost:false, secret:false})
 * @param {Roll|string|null} roll - Optional. Either a Roll object or a string defining the dice roll (like "2d20"). 
 * If not provided it will default roll "2d20".
 * EXAMPLES:
 * rollCoffeePubDice(); // here roll is undefined, so inside the function it'll default to null.
 * rollCoffeePubDice("3d20"); // roll parameter will be "3d20" inside the function.
 * rollCoffeePubDice(new Roll("1d8")); // roll parameter will be a Roll object inside the function.
 */
 export async function rollCoffeePubDice(roll = null) {
    // Only do this if they have Dice So Nice
    if(game.dice3d) {
        // Check if roll is passed in, if not generate a roll
        if (!roll) {
            roll = await new Roll("2d20").evaluate();
        } 
        // If a string is passed, parse it into a roll
        else if (typeof roll === 'string') {
            roll = await new Roll(roll).evaluate();
        }

        var user = game.user;
        var synchronize = true;
        var whisper = null;
        var blind = false;
        var chatMessageID = null;
        var speaker = null;

        // Show dice roll
        try {
            let displayed = await game.dice3d.showForRoll(roll, user, synchronize, whisper, blind, chatMessageID, speaker, {ghost:false, secret:false});
            if(!displayed) {
                postConsoleAndNotification(MODULE.NAME, `Dice So Nice roll was not displayed for dice type ${roll}`, undefined, true, false);
            }
        } catch(err) {
            // Use my custom error function
            postConsoleAndNotification(MODULE.NAME, `Error occurred in Dice So Nice`, err.message, true, false);
        };
    }
}

// ************************************
// ** UTILITY OPEN AI
// ************************************
// Not all of this is exported and is just used in the global.js file
// these are not exported.
let history = [];
function pushHistory(...args) {
	const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');

	history.push(...args);
	// Only limit history if maxHistoryLength is greater than 0
	if (maxHistoryLength > 0 && history.length > maxHistoryLength) {
		history = history.slice(history.length - maxHistoryLength);
	}

	return history;
}
// -- FUNCTION TO CALL OPENAI TXT --
async function callGptApiText(query) {
    // right off make sure there is data to process.
    if (!query) {
        return "What madness is this? You query me with silence? I received no words.";
    }
   
    var strErrorMessage = "";
    const apiKey = COFFEEPUB.strOpenAIAPIKey;
    const model = COFFEEPUB.strOpenAIModel;
    const prompt = COFFEEPUB.strOpenAIPrompt;
    const temperature = COFFEEPUB.strOpenAITemperature;
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const promptMessage = {role: 'user', content: prompt};
    const queryMessage = {role: 'user', content: query};

    // Get message history based on context length setting
    const maxHistoryLength = game.settings.get(MODULE.ID, 'openAIContextLength');
    const history = maxHistoryLength > 0 ? pushHistory().slice(-maxHistoryLength) : pushHistory();
    const messages = history.concat(promptMessage, queryMessage);

    // Set max tokens based on model
    let max_tokens;
    if (model.includes('gpt-4-turbo')) {
        max_tokens = 4096;  // GPT-4 Turbo max completion tokens
    } else if (model.includes('gpt-4')) {
        max_tokens = 8192;  // Standard GPT-4 max completion tokens
    } else {
        max_tokens = 4096;  // Default for other models
    }

            postConsoleAndNotification(MODULE.NAME, `Using model ${model} with max_tokens ${max_tokens}`, "", true, false);

    const requestBody = {
        model,
        messages,
        temperature: temperature,
        max_tokens: max_tokens,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        top_p: 1
    };

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
                switch (status) {
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
                    pushHistory(queryMessage, replyMessage);
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
// -- FUNCTION TO CALL OPENAI IMAGE --
async function callGptApiImage(query) {
    const apiKey = COFFEEPUB.strOpenAIAPIKey;
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
// This is Exported
// -- CALL FOR OPENAI QUERY --
export async function getOpenAIReplyAsHtml(query) {
            postConsoleAndNotification(MODULE.NAME, "In getOpenAIReplyAsHtml(query): query =", query, true, false);  
	
    const response = await callGptApiText(query);
    
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
 * Checks if a combatant or actor is a player character
 * @param {Object} entity - The combatant or actor to check
 * @returns {boolean} - True if the entity is a player character
 */
export function isPlayerCharacter(entity) {
    postConsoleAndNotification(MODULE.NAME, 'isPlayerCharacter - Checking entity:', entity, true, false);

    // If we're passed a combatant, check its actor
    if (entity?.actor) {
        const result = entity.actor.hasPlayerOwner || 
                      entity.actor.type === 'character' ||
                      game.users.find(u => u.character?.name === entity.name);
        postConsoleAndNotification(MODULE.NAME, 'isPlayerCharacter - Combatant check result:', {
            name: entity.name,
            hasPlayerOwner: entity.actor.hasPlayerOwner,
            type: entity.actor.type,
            isPC: result
        }, true, false);
        return result;
    }
    
    // If we're passed an actor directly
    if (entity?.type === 'actor') {
        const result = entity.hasPlayerOwner || 
                      entity.type === 'character' ||
                      game.users.find(u => u.character?.id === entity.id);
        postConsoleAndNotification(MODULE.NAME, 'isPlayerCharacter - Actor check result:', {
            name: entity.name,
            hasPlayerOwner: entity.hasPlayerOwner,
            type: entity.type,
            isPC: result
        }, true, false);
        return result;
    }
    
    // If we're passed just a name
    if (typeof entity === 'string') {
        // First try to find a player character with this name
        const playerActor = game.actors.find(a => 
            a.name === entity && 
            (a.hasPlayerOwner || a.type === 'character' || game.users.find(u => u.character?.id === a.id))
        );
        
        // If no player character found, check if any user has this character name
        const isUserCharacter = game.users.some(u => u.character?.name === entity);
        
        postConsoleAndNotification(MODULE.NAME, 'isPlayerCharacter - Name check result:', {
            name: entity,
            foundPlayerActor: !!playerActor,
            isUserCharacter,
            isPC: !!playerActor || isUserCharacter
        }, true, false);
        
        return !!playerActor || isUserCharacter;
    }
    
    postConsoleAndNotification(MODULE.NAME, 'isPlayerCharacter - No valid entity type found', "", true, false);
    return false;
}



// ************************************
// ** UTILITY: Post to Console (+ optional notification)
// ************************************
// Obvious Note: Do not "debug" the "debug" using this function as it will call itself.

// USAGE NOTES
// -----------
// postConsoleAndNotification("BLACKSMITH", "Auto-opening combat tracker...", null, true, false);
// postConsoleAndNotification("BLACKSMITH", "Combat Stats - Combat Update:", { rounds: 3 }, true, false);
// postConsoleAndNotification("SQUIRE", "Loaded.", false, true);

// ENV EXPECTATIONS
// ----------------
// - Global MODULE.AUTHOR (string)
// - Global COFFEEPUB config with:
//   - blnDebugOn (boolean)
//   - blnFancyConsole (boolean)
//   - strConsoleDebugStyle ∈ {"fancy","simple","plain"}  (optional; defaults to "fancy")
// - Foundry's ui.notifications (optional)

export function postConsoleAndNotification(
    strModuleName = "BLACKSMITH",
    message = null,
    result = null,
    blnDebug = false,
    blnNotification = false
  ) {

    // ----- Validation -----
    if (!message) {
        throw new Error("Message parameter is mandatory for the Blacksmith function postConsoleAndNotification.");
    }
    const strMessage = message;
    const hasResult = !(result === "" || result === undefined || result === null);

    // ----- Configurable style packs per module label (key must be uppercase) -----
    const moduleStyles = {
      BLACKSMITH: {
        titleColor: "color: #FF7340",
        captionBorder: "border: 1px dotted #A4C76A",
        captionBackground: "background: #2D3F11",
        captionFontColor: "color: #A4C76A",
      },
      CRIER: {
        titleColor: "color: #9999ff",
        captionBorder: "border: 1px dotted #7B7BBF",
        captionBackground: "background: #2B2B94",
        captionFontColor: "color: #9999ff",
      },
      BIBLIOSOPH: {
        titleColor: "color: #cccc00",
        captionBorder: "border: 1px dotted #E9E936",
        captionBackground: "background: #64640A",
        captionFontColor: "color: #cccc00",
      },
      SCRIBE: {
        titleColor: "color: #33cccc",
        captionBorder: "border: 1px dotted #2C9090",
        captionBackground: "background: #104545",
        captionFontColor: "color: #33cccc",
      },
      SQUIRE: {
        titleColor: "color: #A333CC",
        captionBorder: "border: 1px dotted #732D88",
        captionBackground: "background: #670B83",
        captionFontColor: "color: #CAA5DA",
      },
      BUBO: {
        titleColor: "color: #ff3377",
        captionBorder: "border: 1px dotted #ED6B96",
        captionBackground: "background: #550922",
        captionFontColor: "color: #ff3377",
      },
    };
  
    // Normalize module key lookup
    const moduleKey = String(strModuleName || "BLACKSMITH").toUpperCase();
    const stylesForModule = moduleStyles[moduleKey] || moduleStyles.BLACKSMITH;
  
    // Unpack current theme
    const strTitleColor = stylesForModule.titleColor;
    const strFancyCaptionBorder = stylesForModule.captionBorder;
    const strFancyCaptionBackground = stylesForModule.captionBackground;
    const strFancyCaptionFontColor = stylesForModule.captionFontColor;
  
    // === COMMON ICONS ===
    const ICON_FLAME = String.fromCodePoint(0x1f525);
    const ICON_MARTINI = String.fromCodePoint(0x1f378);
    const ICON_TUMBLER = String.fromCodePoint(0x1f943);
    const ICON_COFFEE = String.fromCodePoint(0x2615);
    const ICON_BUG = String.fromCodePoint(0x1fab0);
    const ICON_SKULL = String.fromCodePoint(0x1f480);
    const ICON_MAGNIFYING = String.fromCodePoint(0x1f50e);
    const PIPE = "•";
  
    const STYLE_PIPE = [
      "color: #D9D7CD",
      "font-weight:900",
      "margin-right: 3px",
      "margin-left: 3px",
    ].join(";");
  
    // === NORMAL CONSOLE STYLES ===
    const STYLE_NORMAL_AUTHOR = [
      strFancyCaptionFontColor,
      "font-weight:900",
      "margin-right: 0px",
    ].join(";");
  
    const STYLE_NORMAL_MODULE = [
      strTitleColor,
      "font-weight:900",
      "margin-right: 8px",
    ].join(";");
  
    const STYLE_NORMAL_TEXT = ["color: #c1c1c1"].join(";");
  
    // === DEBUG CONSOLE STYLES ===
  
    // FANCY HEADER (capsule)
    const STYLE_DEBUG_FANCY_CAPTION = [
      strFancyCaptionFontColor,
      strFancyCaptionBackground,
      strFancyCaptionBorder,
      "font-size: 14px",
      "font-weight:900",
      "border-radius: 4px",
      "padding-top: 6px",
      "padding-bottom: 3px",
      "padding-left: 10px",
      "padding-right: 10px",
      "margin-top: 8px",
      "margin-bottom: 8px",
      "margin-left: 0px",
      "margin-right: 8px",
    ].join(";");
  
    // Labels
    const STYLE_LABEL_MESSAGE_FANCY = ["color: #FF7340", "font-weight:900", "margin-right: 3px"].join(";");
    const STYLE_LABEL_RESULT_FANCY = ["color: #5CC9F5", "font-weight:900", "margin-right: 3px"].join(";");
  
    // Message / result text styles — avoid 'all: unset' to keep devtools legible
    const STYLE_TEXT_MESSAGE_FANCY = ["color: inherit", "font: inherit"].join(";");
    const STYLE_TEXT_RESULT_FANCY = ["color: inherit", "font: inherit"].join(";");
  
    // SIMPLE
    const STYLE_DEBUG_SIMPLE_AUTHOR = [
      strFancyCaptionFontColor,
      "font-weight:900",
      "margin-right: 0px",
    ].join(";");
  
    const STYLE_DEBUG_SIMPLE_MODULE = [
      strTitleColor,
      "font-weight:900",
      "margin-right: 8px",
    ].join(";");
  
    const STYLE_DEBUG_SIMPLE_LABEL_MESSAGE = [strTitleColor, "font-weight:900", "margin-right: 3px"].join(";");
    const STYLE_DEBUG_SIMPLE_TEXT_MESSAGE = ["color: #D8E8D9"].join(";");
    const STYLE_DEBUG_SIMPLE_LABEL_RESULT = ["color: #5CC9F5", "font-weight:900", "margin-right: 3px"].join(";");
    const STYLE_DEBUG_SIMPLE_TEXT_RESULT = ["color: inherit", "font: inherit"].join(";");
  
    // PLAIN
    const STYLE_DEBUG_PLAIN_AUTHOR = ["color: #A4C76A", "font-weight:900", "margin-right: 0px"].join(";");
    const STYLE_DEBUG_PLAIN_MODULE = [strTitleColor, "font-weight:900", "margin-right: 8px"].join(";");
    const STYLE_DEBUG_PLAIN_TEXT = ["color: inherit", "font: inherit"].join(";");
  

  
    // ----- Compose notification line (non-styled) -----
    // NOTE: expects global MODULE.AUTHOR and COFFEEPUB flags to exist in your env
    const notificationLine =
      MODULE.AUTHOR + " " + PIPE + " " + moduleKey + ": " + strMessage + (hasResult ? " | " : "") + (hasResult ? String(result) : "");
  
    // ----- DEBUG vs NORMAL flow -----
    if (blnDebug === true && COFFEEPUB?.blnDebugOn) {
      // === DEBUG MODE ===
      // Read console styling settings using our safe wrapper
      const blnFancyConsole = getSettingSafely('coffee-pub-blacksmith', 'globalFancyConsole', false);
      if (blnFancyConsole) {
        const styleMode = getSettingSafely('coffee-pub-blacksmith', 'globalConsoleDebugStyle', 'fancy');
  
        if (styleMode === "fancy") {
          // FANCY STYLE
          let fmt = `%c${ICON_BUG} ${MODULE.AUTHOR} ${PIPE} ${moduleKey} DEBUG`;
          const styles = [STYLE_DEBUG_FANCY_CAPTION];
  
          if (strMessage) {
            fmt += `%c\nMESSAGE:%c${strMessage}`;
            styles.push(STYLE_LABEL_MESSAGE_FANCY, STYLE_TEXT_MESSAGE_FANCY);
          }
  
          if (hasResult) {
            fmt += `%c\nRESULTS:%c`;
            styles.push(STYLE_LABEL_RESULT_FANCY, STYLE_TEXT_RESULT_FANCY);
          }
  
          if (hasResult) {
            console.info(fmt, ...styles, result);
          } else {
            console.info(fmt, ...styles);
          }
        } else if (styleMode === "simple") {
          // SIMPLE STYLE
          let fmt = `%c${MODULE.AUTHOR}%c${PIPE}%c${moduleKey} DEBUG`;
          const styles = [STYLE_DEBUG_SIMPLE_AUTHOR, STYLE_PIPE, STYLE_DEBUG_SIMPLE_MODULE];
  
          if (strMessage) {
            fmt += `%c\nMESSAGE:%c${strMessage}`;
            styles.push(STYLE_DEBUG_SIMPLE_LABEL_MESSAGE, STYLE_DEBUG_SIMPLE_TEXT_MESSAGE);
          }
  
          if (hasResult) {
            fmt += `%c\nRESULTS:%c`;
            styles.push(STYLE_DEBUG_SIMPLE_LABEL_RESULT, STYLE_DEBUG_SIMPLE_TEXT_RESULT);
          }
  
          if (hasResult) {
            console.info(fmt, ...styles, result);
          } else {
            console.info(fmt, ...styles);
          }
        } else {
          // PLAIN STYLE
          let fmt = `%c${MODULE.AUTHOR} %c${PIPE}%c ${moduleKey} DEBUG:%c ${strMessage}`;
          const styles = [STYLE_DEBUG_PLAIN_AUTHOR, STYLE_PIPE, STYLE_DEBUG_PLAIN_MODULE, STYLE_DEBUG_PLAIN_TEXT];
  
          if (hasResult) {
            // append a separator then pass result object/value last
            fmt += `\n`;
            console.info(fmt, ...styles, result);
          } else {
            console.info(fmt, ...styles);
          }
        }
      } else {
        // UNSTYLED DEBUG
        const line = `${MODULE.AUTHOR} ${PIPE} ${moduleKey} DEBUG: ${strMessage}`;
        if (hasResult) console.info(line, result);
        else console.info(line);
      }
  
      if (blnNotification) {
        try {
          ui.notifications?.warn(notificationLine, { permanent: true, console: false });
        } catch (_e) {
          /* ignore if notifications are unavailable */
        }
      }
    } else {
      // === NORMAL MODE (not debug) ===
      // Read console styling settings using our safe wrapper
      const blnFancyConsole = getSettingSafely('coffee-pub-blacksmith', 'globalFancyConsole', false);
      if (blnFancyConsole) {
        let fmt = `%c${MODULE.AUTHOR}%c${PIPE}%c${moduleKey}%c ${strMessage}`;
        const styles = [STYLE_NORMAL_AUTHOR, STYLE_PIPE, STYLE_NORMAL_MODULE, STYLE_NORMAL_TEXT];
  
        if (hasResult) {
          console.info(fmt, ...styles, result);
        } else {
          console.info(fmt, ...styles);
        }
      } else {
        const line = `${MODULE.AUTHOR} ${PIPE} ${moduleKey}: ${strMessage}`;
        if (hasResult) console.info(line, result);
        else console.info(line);
      }
  
      if (blnNotification) {
        try {
          ui.notifications?.info(notificationLine, { permanent: false, console: false });
        } catch (_e) {
          /* ignore if notifications are unavailable */
        }
      }
    }
  }