// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
// -- Import the shared GLOBAL variables --
// COFFEEPUB now available globally via window.COFFEEPUB
// -- Load the shared GLOBAL functions --
import { registerBlacksmithUpdatedHook, postConsoleAndNotification, getActorId, resetModuleSettings, getSettingSafely, setSettingSafely } from './api-core.js';
// -- Import special page variables --
// Load the data sets for the settings dropdowns
import { dataNameplate, dataSounds, dataIcons, dataBackgroundImages, dataTheme } from '../resources/assets.js';



// ================================================================== 
// ===== CONSTANTS ====================================================
// ================================================================== 

const gameSystemChoices = {
    generic: 'Generic tabletop RPG',
    dnd5e: 'Dungeons & Dragons 5th Edition',
    pf2e: 'Pathfinder Second Edition',
    foundryIronsworn: 'Ironsworn'
}
const genericPrompt = "I would like you to help me with running the game by coming up with ideas, answering questions, and improvising. Keep responses as short as possible. Stick to the rules as much as possible.";
const formatPrompt = "Always format each answer as HTML code without CSS. Leverage lists and simple tables. Never use Markdown. Never use the pre html tag.";



// ================================================================== 
// ===== WORKFLOW GROUPS ============================================
// ================================================================== 

const WORKFLOW_GROUPS = {
    GETTING_STARTED: 'getting-started',
    THEMES_AND_EXPERIENCE: 'themes-and-experience',
    RUN_THE_GAME: 'run-the-game',
    MANAGE_CONTENT: 'manage-content',
    ROLLING_AND_PROGRESSION: 'rolling-and-progression',
    AUTOMATION: 'automation',
	ARTIFICIAL_INTELLIGENCE: 'artificial-intelligence',
	DEVELOPER_TOOLS: 'developer-tools'
};

// ================================================================== 
// ===== HELPER FUNCTIONS ===========================================
// ================================================================== 

/**
 * Helper function to register headers with reduced verbosity while preserving CSS styling
 * @param {string} id - Unique identifier for the header
 * @param {string} labelKey - Localization key for the label
 * @param {string} hintKey - Localization key for the hint
 * @param {string} level - Header level (H1, H2, H3, H4)
 * @param {string} group - Workflow group for collapsible sections
 */
function registerHeader(id, labelKey, hintKey, level = 'H2', group = null) {
    game.settings.register(MODULE.ID, `heading${level}${id}`, {
        name: MODULE.ID + `.${labelKey}`,
        hint: MODULE.ID + `.${hintKey}`,
        scope: "world",
        config: true,
        default: "",
        type: String,
        group: group
    });
}

// ================================================================== 
// ===== FUNCTIONS ==================================================
// ================================================================== 

// -- ENABLED COFFEE PUB MODULES  --
function formatMODULE_ID(strModuleID) {
	let splitName = strModuleID.split('-');
	for (let i = 0; i < splitName.length; i++) {
	  splitName[i] = splitName[i].charAt(0).toUpperCase() + splitName[i].slice(1);
	}
	return splitName.join(' ');
}



// -- CHECK INSTALLED COFFEE PUB MODULES  --
function checkInstalledModules() {
	let coffeePubActive = [];
	let coffeePubMissing = [];
	let arrModuleIDs = [
		'coffee-pub-blacksmith',
		'coffee-pub-monarch',
		'coffee-pub-scribe',
		'coffee-pub-squire',
		'coffee-pub-crier',
		'coffee-pub-bibliosoph',
		'coffee-pub-bubo',
		'coffee-pub-lib'
	];

	for(let strModuleID of arrModuleIDs) {
		if(game.modules.has(strModuleID)) {
		coffeePubActive.push(formatMODULE_ID(strModuleID));
		} else {
		coffeePubMissing.push(formatMODULE_ID(strModuleID));
		}
	}

	let strCoffeePubActive = coffeePubActive.length > 0 ? coffeePubActive.join(', ') : 'None';
	let strCoffeePubMissing = coffeePubMissing.length > 0 ? coffeePubMissing.join(', ') : 'None';

	if(coffeePubActive.length > 1) {
		let lastComma = strCoffeePubActive.lastIndexOf(',');
		strCoffeePubActive = `${strCoffeePubActive.slice(0, lastComma)} and${strCoffeePubActive.slice(lastComma + 1)}`;
	}

	if(coffeePubMissing.length > 1) {
		let lastComma = strCoffeePubMissing.lastIndexOf(',');
		strCoffeePubMissing = `${strCoffeePubMissing.slice(0, lastComma)} and${strCoffeePubMissing.slice(lastComma + 1)}`;
	}

	return {
		activeModules: strCoffeePubActive,
		missingModules: strCoffeePubMissing
	};
}

// -- CACHE STATUS
export function getTokenImageReplacementCacheStats() {
	// Read the current cache status from the setting
	const strCacheStatus = game.settings.get(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus');
	
	if(strCacheStatus) {
		return strCacheStatus;
	} else {
		return "Cache not initialized";
	}
}

// -- COMPENDIUM CHOICES  --
async function getCompendiumChoices() {
    postConsoleAndNotification(MODULE.NAME, "Building Compendium List...", "", false, false);

    const choicesArray = Array.from(game.packs.values()).map(compendium => {
        // Try to get a human-readable package label, fallback to package name
        let packageLabel = compendium.metadata.packageLabel || compendium.metadata.package || compendium.metadata.packageName || compendium.metadata.system || compendium.metadata.id.split('.')[0] || "Unknown Source";
        // If the label is the system id, try to make it more readable
        if (packageLabel === "world") packageLabel = "World";
        // Compose the label
        const label = `${packageLabel}: ${compendium.metadata.label}`;
        return {
            id: compendium.metadata.id,
            label: label,
            type: compendium.metadata.type
        };
    });

    // Sort array alphabetically by label
    choicesArray.sort((a, b) => a.label.localeCompare(b.label));

    const choices = choicesArray.reduce((choices, compendium) => {
        const identifier = compendium.id;
        choices[identifier] = compendium.label;
        return choices;
    }, {"none": "-- None --"});

    // BLACKSMITH UPDATER - Make the Compendium Array available to ALL Coffee Pub modules

    // Store the full data array with type information
    BLACKSMITH.updateValue('arrCompendiumChoicesData', choicesArray);
    
    // Store the main choices (backward compatible)
    BLACKSMITH.updateValue('arrCompendiumChoices', choices);
    
    // Helper function to capitalize and pluralize type names
    const getTypeLabel = (type) => {
        const typeMap = {
            'Actor': 'Actors',
            'Item': 'Items',
            'JournalEntry': 'Journal Entries',
            'RollTable': 'Roll Tables',
            'Scene': 'Scenes',
            'Macro': 'Macros',
            'Playlist': 'Playlists',
            'Adventure': 'Adventures',
            'Card': 'Cards',
            'Stack': 'Stacks',
            'Spell': 'Spells',
            'Feature': 'Features'
        };
        return typeMap[type] || type;
    };
    
    // Create and store filtered arrays for each type
    const types = [...new Set(choicesArray.map(c => c.type))];
    types.forEach(type => {
        const filteredChoices = choicesArray
            .filter(compendium => compendium.type === type)
            .reduce((choices, compendium) => {
                choices[compendium.id] = `${getTypeLabel(type)}: ${compendium.label}`;
                return choices;
            }, {"none": "-- None --"});
        
        BLACKSMITH.updateValue(`arrCompendiumChoices${type}`, filteredChoices);
    });
    
    // Spell and Feature now use type-based filtering (all Item compendiums)
    // Same approach as Actor - simpler and works synchronously
    const spellChoices = choicesArray
        .filter(compendium => compendium.type === 'Item')
        .reduce((choices, compendium) => {
            choices[compendium.id] = compendium.label;
            return choices;
        }, {"none": "-- None --"});
    BLACKSMITH.updateValue('arrSpellChoices', spellChoices);
    
    const featureChoices = choicesArray
        .filter(compendium => compendium.type === 'Item')
        .reduce((choices, compendium) => {
            choices[compendium.id] = compendium.label;
            return choices;
        }, {"none": "-- None --"});
    BLACKSMITH.updateValue('arrFeatureChoices', featureChoices);
    
    // Make the array available to these settings.
    return choices;
}

/**
 * Convert Foundry compendium type to setting-friendly prefix
 * @param {string} type - Foundry compendium type (e.g., "Actor", "JournalEntry")
 * @returns {string} Setting prefix (e.g., "monsterCompendium", "journalEntryCompendium")
 */
function getCompendiumSettingPrefix(type) {
    // Special cases for backward compatibility
    const specialCases = {
        'Actor': 'monsterCompendium',
        'Item': 'itemCompendium',
        'Spell': 'spellCompendium',
        'Feature': 'featuresCompendium'
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert Foundry type to camelCase setting prefix
    // "JournalEntry" → "journalEntryCompendium", "RollTable" → "rollTableCompendium"
    const firstChar = type.charAt(0).toLowerCase();
    const rest = type.slice(1);
    return `${firstChar}${rest}Compendium`;
}

/**
 * Convert Foundry compendium type to array name
 * @param {string} type - Foundry compendium type
 * @returns {string} Array name (e.g., "arrSelectedMonsterCompendiums")
 */
function getSelectedArrayName(type) {
    // Special cases for backward compatibility
    const specialCases = {
        'Actor': 'arrSelectedMonsterCompendiums',
        'Item': 'arrSelectedItemCompendiums',
        'Spell': 'arrSelectedSpellCompendiums',
        'Feature': 'arrSelectedFeatureCompendiums'
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert to array name: "JournalEntry" → "arrSelectedJournalEntryCompendiums"
    const firstChar = type.charAt(0);
    const rest = type.slice(1);
    return `arrSelected${firstChar}${rest}Compendiums`;
}

/**
 * Convert Foundry compendium type to numCompendiums setting name
 * @param {string} type - Foundry compendium type
 * @returns {string} Setting name (e.g., "numCompendiumsActor")
 */
function getNumCompendiumsSettingName(type) {
    // Special cases for backward compatibility
    const specialCases = {
        'Actor': 'numCompendiumsActor',
        'Item': 'numCompendiumsItem',
        'Spell': 'numCompendiumsSpell',
        'Feature': 'numCompendiumsFeature'
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert: "JournalEntry" → "numCompendiumsJournalEntry"
    return `numCompendiums${type}`;
}

/**
 * Get choices array key for a compendium type
 * @param {string} type - Foundry compendium type
 * @returns {string} Key name in BLACKSMITH (e.g., "arrMonsterChoices")
 */
function getChoicesArrayKey(type) {
    // Special cases for content-based filtering (Spell, Feature - not direct Foundry types)
    // Actor now uses unified system: arrCompendiumChoicesActor
    // Item now uses unified system: arrCompendiumChoicesItem
    const specialCases = {
        'Spell': 'arrSpellChoices',
        'Feature': 'arrFeatureChoices'
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert: "JournalEntry" → "arrCompendiumChoicesJournalEntry"
    return `arrCompendiumChoices${type}`;
}

/**
 * Convert Foundry type to plural form for searchWorld setting names
 * @param {string} type - Foundry compendium type
 * @returns {string} Plural form for searchWorld setting (e.g., "Actors", "Items", "JournalEntries")
 */
function getSearchWorldPlural(type) {
    const pluralMap = {
        'Actor': 'Actors',
        'Item': 'Items',
        'Spell': 'Spells',
        'Feature': 'Features',
        'JournalEntry': 'JournalEntries',
        'RollTable': 'RollTables',
        'Scene': 'Scenes',
        'Macro': 'Macros',
        'Playlist': 'Playlists',
        'Adventure': 'Adventures',
        'Card': 'Cards',
        'Stack': 'Stacks'
    };
    return pluralMap[type] || `${type}s`;
}

/**
 * Dynamically register compendium settings for ALL types found in the system
 * This replaces all hardcoded compendium registrations
 */
function registerDynamicCompendiumTypes() {
    // Get all types from compendium data
    const compendiumData = BLACKSMITH.arrCompendiumChoicesData || [];
    const foundTypes = [...new Set(compendiumData.map(c => c.type))];
    
    // Add special content-based types (Spell, Feature) that aren't direct Foundry types
    const allTypes = [...new Set([...foundTypes, 'Spell', 'Feature'])];
    
    // Helper function to get human-readable label (using getTypeLabel from getCompendiumChoices)
    const getTypeLabel = (type) => {
        const typeMap = {
            'Actor': 'Actors',
            'Item': 'Items',
            'JournalEntry': 'Journal Entries',
            'RollTable': 'Roll Tables',
            'Scene': 'Scenes',
            'Macro': 'Macros',
            'Playlist': 'Playlists',
            'Adventure': 'Adventures',
            'Card': 'Cards',
            'Stack': 'Stacks',
            'Spell': 'Spells',
            'Feature': 'Features'
        };
        return typeMap[type] || type;
    };
    
    // Register settings for each type
    for (const type of allTypes) {
        const settingPrefix = getCompendiumSettingPrefix(type);
        const numSetting = getNumCompendiumsSettingName(type);
        const choicesKey = getChoicesArrayKey(type);
        const searchWorldPlural = getSearchWorldPlural(type);
        
        // Register header (skip if already exists)
        const headerKey = `headingH3${type}Compendiums`;
        if (!game.settings.settings.has(`${MODULE.ID}.${headerKey}`)) {
            registerHeader(`${type}Compendiums`, 
                `headingH3${type}Compendiums-Label`, 
                `headingH3${type}Compendiums-Hint`, 
                'H3', 
                WORKFLOW_GROUPS.MANAGE_CONTENT);
        }
        
        // Register number setting (skip if already exists)
        if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) {
            game.settings.register(MODULE.ID, numSetting, {
                name: MODULE.ID + '.numCompendiums-Label',
                hint: MODULE.ID + '.numCompendiums-Hint',
                type: Number,
                config: true,
                scope: 'world',
                default: 1,
                range: { min: 1, max: 20 },
                requiresReload: true,
                group: WORKFLOW_GROUPS.MANAGE_CONTENT
            });
        }
        
        // Register Search World First setting (skip if already exists)
        const searchFirstKey = `searchWorld${searchWorldPlural}First`;
        if (!game.settings.settings.has(`${MODULE.ID}.${searchFirstKey}`)) {
            game.settings.register(MODULE.ID, searchFirstKey, {
                name: MODULE.ID + '.searchWorldFirst-Label',
                hint: MODULE.ID + '.searchWorldFirst-Hint',
                type: Boolean,
                config: true,
                scope: 'world',
                default: false,
                group: WORKFLOW_GROUPS.MANAGE_CONTENT
            });
        }
        
        // Register Search World Last setting (skip if already exists)
        const searchLastKey = `searchWorld${searchWorldPlural}Last`;
        if (!game.settings.settings.has(`${MODULE.ID}.${searchLastKey}`)) {
            game.settings.register(MODULE.ID, searchLastKey, {
                name: MODULE.ID + '.searchWorldLast-Label',
                hint: MODULE.ID + '.searchWorldLast-Hint',
                type: Boolean,
                config: true,
                scope: 'world',
                default: false,
                group: WORKFLOW_GROUPS.MANAGE_CONTENT
            });
        }
        
        // Register compendium priority settings
        const numCompendiums = game.settings.get(MODULE.ID, numSetting) || 1;
        for (let i = 1; i <= numCompendiums; i++) {
            const settingKey = `${settingPrefix}${i}`;
            
            // Skip if already registered
            if (game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
                continue;
            }
            
            game.settings.register(MODULE.ID, settingKey, {
                name: `${getTypeLabel(type)}: Priority ${i}`,
                hint: null,
                scope: "world",
                config: true,
                requiresReload: false,
                default: "none",
                choices: BLACKSMITH[choicesKey] || {"none": "-- None --"},
                group: WORKFLOW_GROUPS.MANAGE_CONTENT
            });
        }
    }
}

/**
 * Build arrays of selected/configured compendiums in priority order for each type
 * These arrays contain only compendiums that are actually configured (not "none")
 * Array position = Priority (index 0 = Priority 1, etc.)
 */
export function buildSelectedCompendiumArrays() {
    // Get all types from compendium data
    const compendiumData = BLACKSMITH.arrCompendiumChoicesData || [];
    const foundTypes = [...new Set(compendiumData.map(c => c.type))];
    
    // Add special content-based types (Spell, Feature) that aren't direct Foundry types
    const allTypes = [...new Set([...foundTypes, 'Spell', 'Feature'])];
    
    // Build arrays for each type
    for (const type of allTypes) {
        const numSetting = getNumCompendiumsSettingName(type);
        const settingPrefix = getCompendiumSettingPrefix(type);
        const arrayName = getSelectedArrayName(type);
        
        // Check if setting exists (may not be registered yet on first load)
        if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) {
            continue; // Skip if settings not registered yet
        }
        
        const numCompendiums = game.settings.get(MODULE.ID, numSetting) || 1;
        const selected = [];
        
        for (let i = 1; i <= numCompendiums; i++) {
            const settingKey = `${settingPrefix}${i}`;
            if (!game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
                continue; // Skip if setting not registered
            }
            
            const compendiumId = game.settings.get(MODULE.ID, settingKey);
            if (compendiumId && compendiumId !== 'none' && compendiumId !== '') {
                selected.push(compendiumId);
            }
        }
        
        BLACKSMITH.updateValue(arrayName, selected);
    }
    
    postConsoleAndNotification(MODULE.NAME, "Selected compendium arrays updated", "", false, false);
}

// -- TABLE CHOICES  --
function getTableChoices() {
	postConsoleAndNotification(MODULE.NAME, "Building Table List...", "", false, false);
    const choices = { "none":"-- Choose a Table --" };
    Array.from(game.tables.values()).reduce((choices, table) => {
      choices[table.name] = table.name;
      return choices;
    }, choices);

	// BLACKSMITH UPDATER - Make the Table Array available to ALL Coffee Pub modules

	BLACKSMITH.updateValue('arrTableChoices', choices);
	// Make the array available to these settings.
    return choices;
 }

// -- MACRO CHOICES --
function getMacroChoices() {
	postConsoleAndNotification(MODULE.NAME, "Building Macro List...", "", false, false);
    let choiceObject = { "none":"-- Create A New Macro --" };
    let choiceKeys = Array.from(game.macros.values()).map(macro => macro.name);
    choiceKeys.sort().forEach(key => {
        choiceObject[key] = key;
    }); 

	// BLACKSMITH UPDATER - Make the Macro Array available to ALL Coffee Pub modules
	BLACKSMITH.updateValue('arrMacroChoices', choiceObject);
	// Make the array available to these settings.
    return choiceObject;
}

// -- NAMEPLATE CHOICES --
function getNameplateChoices() {
	postConsoleAndNotification(MODULE.NAME, "Building Nameplate List...", "", false, false);
	let choices = {};
	for(const data of dataNameplate.names) {
		choices[data.id] = data.name;
	}
	BLACKSMITH.updateValue('arrNameChoices', choices);
	return choices;
}

// -- THEME CHOICES  --
// Build the shared theme array to be use by other modules.
function getThemeChoices() {
	postConsoleAndNotification(MODULE.NAME, "Building Theme List...", "", false, false);
	let choices = {};
    // Initialize arrThemeChoicesEnabled array
    BLACKSMITH.arrThemeChoicesEnabled = []; 
    // Sort themes alphabetically and move 'cardsdefault' to the front
    let sortedThemes = dataTheme.themes.sort((a, b) => {
        if(a.value === 'cardsdefault') return -1;
        if(b.value === 'cardsdefault') return 1;
        return a.name.localeCompare(b.name);
      }); 

    for(let theme of sortedThemes) { 
      // Check if the theme is enabled - use safe settings function
      if(getSettingSafely(MODULE.ID, theme.id, true)) {
        choices[theme.value] = theme.name;
        // Add the enabled theme to arrThemeChoicesEnabled array
        BLACKSMITH.arrThemeChoicesEnabled.push(theme.name);
      }
    }
    // BLACKSMITH UPDATER - Make the Themes Array available to ALL Coffee Pub modules
    BLACKSMITH.updateValue('arrThemeChoices', choices);
    // Return it to this modules settings.
    return choices; 
}

// Build out setting for each of the themes so they can be enabled/disabled.
function registerThemes() {
    // Move 'cardsdefault' to front and sort the remaining thematically
    let sortedThemes = dataTheme.themes.sort((a, b) => {
        if(a.value === 'cardsdefault') return -1;
        if(b.value === 'cardsdefault') return 1;
        return a.name.localeCompare(b.name);
    });
    for(let theme of sortedThemes) {
        game.settings.register(MODULE.ID, theme.id, {
            name: theme.name,
            hint: theme.description,
            type: Boolean,
            config: true,
            scope: 'world',
            default: true,
            requiresReload: true
        });   
    }
}

// -- BACKGROUND IMAGE CHOICES --
function getBackgroundImageChoices() {
    postConsoleAndNotification(MODULE.NAME, "Building Background Image List...", "", false, false);
    let choices = {};
    BLACKSMITH.arrBackgroundImageChoicesEnabled = [];
    let sortedImages = dataBackgroundImages.images;
    // Move 'themecolor' to front
    sortedImages.sort((a, b) => {
        if(a.value === 'themecolor') return -1;
        if(b.value === 'themecolor') return 1;
        return a.name.localeCompare(b.name);
    });
    for(let img of sortedImages) { 
        choices[img.value] = img.name;
        // Add the image to arrBackgroundImageChoicesEnabled array
        BLACKSMITH.arrBackgroundImageChoicesEnabled.push(img.name);
    }
    // BLACKSMITH UPDATER
    BLACKSMITH.updateValue('arrBackgroundImageChoices', choices);
    // Return it to this modules settings.
    return choices; 
}

// -- ICON CHOICES --
function getIconChoices() {
    postConsoleAndNotification(MODULE.NAME, "Building Icon List...", "", false, false);
    let choices = {};
    BLACKSMITH.arrIconChoicesEnabled = [];
    
    let sortedIcons = dataIcons.icons;
    // Move 'none' to front
    sortedIcons.sort((a, b) => {
        if(a.id === 'icon-none') return -1;
        if(b.id === 'icon-none') return 1;
        return a.name.localeCompare(b.name);
    });
    for(let icons of sortedIcons) { 
        choices[icons.value] = icons.name;
        // Add the image to arrBackgroundImageChoicesEnabled array
        BLACKSMITH.arrIconChoicesEnabled.push(icons.name);
    }
    // BLACKSMITH UPDATER 
    BLACKSMITH.updateValue('arrIconChoices', choices);
    // Return it to this modules settings.
    return choices; 

}

// -- SOUND CHOICES --
function getSoundChoices() {
    postConsoleAndNotification(MODULE.NAME, "Building Sound List...", "", false, false);
    let choices = {};
    BLACKSMITH.arrSoundChoicesEnabled = [];
    
    // Add the "No Sound" option second
    choices['sound-none'] = 'No Sound';
    // Then add all the sound choices from data collection (excluding sound-none since we already added it)
    let sortedSounds = dataSounds.sounds.filter(sound => sound.id !== 'sound-none');
    // Remove duplicates based on ID
    const uniqueSounds = [];
    const seenIds = new Set();
    for(let sound of sortedSounds) {
        if (!seenIds.has(sound.id)) {
            seenIds.add(sound.id);
            uniqueSounds.push(sound);
        }
    }
    uniqueSounds.sort((a, b) => a.name.localeCompare(b.name));
    for(let sounds of uniqueSounds) { 
        choices[sounds.value] = sounds.name;
        BLACKSMITH.arrSoundChoicesEnabled.push(sounds.name);
    }
    // BLACKSMITH UPDATER 
    BLACKSMITH.updateValue('arrSoundChoices', choices);
    // Return it to this modules settings.
    return choices; 
}

// ====================================================================================================================  
// ===== SETTINGS ===================================================
// ==================================================================================================================== 

export const registerSettings = () => {
    // Settings registration function - called during the 'ready' phase when Foundry is ready

    // Build the Dropdown choices
    getCompendiumChoices(); // Run async in background - don't block settings registration
    getTableChoices();
    getMacroChoices();
    getBackgroundImageChoices();
    getIconChoices();
    getSoundChoices();
    const nameplateChoices = getNameplateChoices();
    

	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == H1: GETTING STARTED
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('GettingStarted', 'headingH1GettingStarted-Label', 'headingH1GettingStarted-Hint', 'H1', WORKFLOW_GROUPS.GETTING_STARTED);

	// --------------------------------------
	// -- H4: INTRODUCTION
	// --------------------------------------
	registerHeader('Introduction', 'headingH4Introduction-Label', 'headingH4Introduction-Hint', 'H4', WORKFLOW_GROUPS.GETTING_STARTED);

	// --------------------------------------
	// -- H2: COFFEE PUB SUITE
	// --------------------------------------
	registerHeader('CoffeePubSuite', 'headingH2CoffeePubSuite-Label', 'headingH2CoffeePubSuite-Hint', 'H2', WORKFLOW_GROUPS.GETTING_STARTED);

	// --------------------------------------
	// -- H2: COFFEE PUB SUITE
	// --------------------------------------
	registerHeader('CoffeePubSuite', 'headingH2CoffeePubSuite-Label', 'headingH2CoffeePubSuite-Hint', 'H2', WORKFLOW_GROUPS.GETTING_STARTED);

	let moduleStatus = checkInstalledModules();

	game.settings.register(MODULE.ID, "headingH4BlacksmithInstalled", {
		name: "Activated Coffee Pub Modules",
		hint: "The following Coffee Pub modules are activated: " + moduleStatus.activeModules + ". If you don't see a module you are expecting, check to see if you've activated it.",
		scope: "world",
		config: true,
		default: "",
		type: String,
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	game.settings.register(MODULE.ID, "headingH4BlacksmithMissing", {
		name: "Other Coffee Pub Modules",
		hint: "The following Coffee Pub modules are currently not installed or activated:  " + moduleStatus.missingModules + ".",
		scope: "world",
		config: true,
		default: "",
		type: String,
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	// ==================================================================================================================== 
	// ===== HR Visual Divider
	// ==================================================================================================================== 
	game.settings.register(MODULE.ID, "headingHR", {
		name: "",
		hint: "",
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

	// --------------------------------------
	// -- H2: DEFAULT PARTY SETTINGS
	// --------------------------------------
	registerHeader('DefaultPartySettings', 'headingH2DefaultPartySettings-Label', 'headingH2DefaultPartySettings-Hint', 'H2', WORKFLOW_GROUPS.GETTING_STARTED);

	game.settings.register(MODULE.ID, 'defaultPartyName', {
		name: MODULE.ID + '.defaultPartyName-Label',
		hint: MODULE.ID + '.defaultPartyName-Hint',
		type: String,
		scope: 'world',
		config: true,
		default: 'Adventurers',
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	game.settings.register(MODULE.ID, 'defaultPartySize', {
		name: MODULE.ID + '.defaultPartySize-Label',
		hint: MODULE.ID + '.defaultPartySize-Hint',
		type: Number,
		scope: 'world',
		config: true,
		range: {
			min: 1,
			max: 20,
			step: 1
		},
		default: 4,
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	game.settings.register(MODULE.ID, 'defaultPartyMakeup', {
		name: MODULE.ID + '.defaultPartyMakeup-Label',
		hint: MODULE.ID + '.defaultPartyMakeup-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	game.settings.register(MODULE.ID, 'defaultPartyLevel', {
		name: MODULE.ID + '.defaultPartyLevel-Label',
		hint: MODULE.ID + '.defaultPartyLevel-Hint',
		type: Number,
		scope: 'world',
		config: true,
		range: {
			min: 1,
			max: 20,
			step: 1
		},
		default: 1,
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	game.settings.register(MODULE.ID, 'defaultRulebooks', {
		name: MODULE.ID + '.defaultRulebooks-Label',
		hint: MODULE.ID + '.defaultRulebooks-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	// -- Party Leader - HIDDEN SETTING -- 
	game.settings.register(MODULE.ID, 'partyLeader', {
		name: 'Party Leader',
		hint: 'The currently selected party leader',
		scope: 'world',
		config: false,
		type: Object,
		default: { userId: '', actorId: '' }
	});

	// --------------------------------------
	// -- H2: CAMPAIGN SETTINGS
	// --------------------------------------
	registerHeader('CampaignSettings', 'headingH2CampaignSettings-Label', 'headingH2CampaignSettings-Hint', 'H2', WORKFLOW_GROUPS.GETTING_STARTED);


	// --------------------------------------
	// -- H3: CAMPAIGN COMMON
	// --------------------------------------
	registerHeader('CampaignCommon', 'headingH3CampaignCommon-Label', 'headingH3CampaignCommon-Hint', 'H3', WORKFLOW_GROUPS.GETTING_STARTED);

	// -- Default Campaign Name --
	game.settings.register(MODULE.ID, 'defaultCampaignName', {
		name: MODULE.ID + '.defaultCampaignName-Label',
		hint: MODULE.ID + '.defaultCampaignName-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.GETTING_STARTED
	});

	// --------------------------------------
	// -- H3: CAMPAIGN GEOGRAPHY
	// --------------------------------------
	registerHeader('CampaignGeography', 'headingH3CampaignGeography-Label', 'headingH3CampaignGeography-Hint', 'H3', WORKFLOW_GROUPS.GETTING_STARTED);


	// -- Default Campaign Realm --
	game.settings.register(MODULE.ID, 'defaultCampaignRealm', {
		name: MODULE.ID + '.defaultCampaignRealm-Label',
		hint: MODULE.ID + '.defaultCampaignRealm-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Campaign Region --
	game.settings.register(MODULE.ID, 'defaultCampaignRegion', {
		name: MODULE.ID + '.defaultCampaignRegion-Label',
		hint: MODULE.ID + '.defaultCampaignRegion-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Campaign Site --
	game.settings.register(MODULE.ID, 'defaultCampaignSite', {	
		name: MODULE.ID + '.defaultCampaignSite-Label',	
		hint: MODULE.ID + '.defaultCampaignSite-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});	

	// -- Default Campaign Area --
	game.settings.register(MODULE.ID, 'defaultCampaignArea', {
		name: MODULE.ID + '.defaultCampaignArea-Label',
		hint: MODULE.ID + '.defaultCampaignArea-Hint',	
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});


	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == H1: LAYOUT AND EXPERIENCE
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('LayoutAndExperience', 'headingH1LayoutAndExperience-Label', 'headingH1LayoutAndExperience-Hint', 'H1', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// --------------------------------------
	// -- H2: THEMES
	// --------------------------------------
	registerHeader('Themes', 'headingH2Themes-Label', 'headingH2Themes-Hint', 'H2', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);
	

	// --------------------------------------
	// -- H3: THEME SELECTIONS
	// --------------------------------------
	registerHeader('ThemeSelections', 'headingH3ThemeSelections-Label', 'headingH3ThemeSelections-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// Build out the themes based on the js file.
	registerThemes();
	// Make them available to other settings.
	getThemeChoices();

	// --------------------------------------
	// -- H3: THEME DEFAULT
	// --------------------------------------
	registerHeader('ThemeDefault', 'headingH3ThemeDefault-Label', 'headingH3ThemeDefault-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	game.settings.register(MODULE.ID, 'defaultCardTheme', {
		name: MODULE.ID + '.defaultCardTheme-Label',
		hint: MODULE.ID + '.defaultCardTheme-Hint',
		scope: 'world',
		config: true,
		requiresReload: true,
		type: String,
		default: 'cardsdefault',
		choices: BLACKSMITH.arrThemeChoices,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H2: FOUNDRY ENHANCEMENTS
	// --------------------------------------
	registerHeader('FoundryEnhancements', 'headingH2FoundryEnhancements-Label', 'headingH2FoundryEnhancements-Hint', 'H2', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// --------------------------------------
	// -- H3: QUALITY OF LIFE
	// --------------------------------------
	registerHeader('QualityOfLife', 'headingH3QualityOfLife-Label', 'headingH3QualityOfLife-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// -- Object Link Style --
	game.settings.register(MODULE.ID, 'objectLinkStyle', {
		name: MODULE.ID + '.objectLinkStyle-Label',
		hint: MODULE.ID + '.objectLinkStyle-Hint',
		scope: 'world',
		config: true,
		requiresReload: true,
		type: String,
		default: 'none',
		choices: {
			'none': 'Foundry Default',
			'text': 'Simple Text',
			'green': 'Green',
			'red': 'Red',
			'blue': 'Blue',
			'light': 'Light Mode',
			'dark': 'Dark Mode',
		},
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H3: CANVAS TOOLS
	// --------------------------------------
	registerHeader('CanvasTools', 'headingH3CanvasTools-Label', 'headingH3CanvasTools-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// -- Left UI --
	game.settings.register(MODULE.ID, 'canvasToolsHideLeftUI', {
		name: MODULE.ID + '.canvasToolsHideLeftUI-Label',
		hint: MODULE.ID + '.canvasToolsHideLeftUI-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'client',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Bottom UI --
	game.settings.register(MODULE.ID, 'canvasToolsHideBottomUI', {
		name: MODULE.ID + '.canvasToolsHideBottomUI-Label',
		hint: MODULE.ID + '.canvasToolsHideBottomUI-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'client',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H3: MENUBAR
	// --------------------------------------
	registerHeader('Menubar', 'headingH3menubar-Label', 'headingH3menubar-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	game.settings.register(MODULE.ID, 'enableMenubar', {
		name: MODULE.ID + '.enableMenubar-Label',
		hint: MODULE.ID + '.enableMenubar-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	game.settings.register(MODULE.ID, 'excludedUsersMenubar', {
		name: MODULE.ID + '.excludedUsersMenubar-Label',
		hint: MODULE.ID + '.excludedUsersMenubar-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H3: TOOLBAR
	// --------------------------------------
	registerHeader('Toolbar', 'headingH3Toolbar-Label', 'headingH3Toolbar-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// -- Show Toolbar Dividers --
	game.settings.register(MODULE.ID, 'toolbarShowDividers', {
		name: MODULE.ID + '.toolbarShowDividers-Label',
		hint: MODULE.ID + '.toolbarShowDividers-Hint',
		scope: "client",
		config: true,
		default: true,
		type: Boolean,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Show Toolbar Labels --
	game.settings.register(MODULE.ID, 'toolbarShowLabels', {
		name: MODULE.ID + '.toolbarShowLabels-Label',
		hint: MODULE.ID + '.toolbarShowLabels-Hint',
		scope: "client",
		config: true,
		default: false,
		type: Boolean,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H3: SCENES
	// --------------------------------------
	registerHeader('Scenes', 'headingH3Scenes-Label', 'headingH3Scenes-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// -- SCENE INTERACTIONS --
	game.settings.register(MODULE.ID, 'enableSceneInteractions', {
		name: MODULE.ID + '.enableSceneInteractions-Label',
		hint: MODULE.ID + '.enableSceneInteractions-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- SCENE BEHAVIORS --
	game.settings.register(MODULE.ID, 'enableSceneClickBehaviors', {
		name: MODULE.ID + '.enableSceneClickBehaviors-Label',
		hint: MODULE.ID + '.enableSceneClickBehaviors-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Scene Text Align --
	game.settings.register(MODULE.ID, 'sceneTextAlign', {
		name: MODULE.ID + '.sceneTextAlign-Label',
		hint: MODULE.ID + '.sceneTextAlign-Hint',
		scope: 'world',
		config: true,
		requiresReload: true,
		type: String,
		default: 'left',
		choices: {
			'center': 'Foundry Default (Center)',
			'left': 'Left Align Scene Title',
			'right': 'Right Align Scene Title',
		},
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});


	// -- Scene Text Size --
	game.settings.register(MODULE.ID, 'sceneFontSize', {
		name: MODULE.ID + '.sceneFontSize-Label',
		hint: MODULE.ID + '.sceneFontSize-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
			min: .5,
			max: 3,
			step: .05,
		},
		default: 1,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Scene Title Padding --
	game.settings.register(MODULE.ID, 'sceneTitlePadding', {
		name: MODULE.ID + '.sceneTitlePadding-Label',
		hint: MODULE.ID + '.sceneTitlePadding-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
			min: -2,
			max: 30,
			step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Scene Panel Height --
	game.settings.register(MODULE.ID, 'scenePanelHeight', {
		name: MODULE.ID + '.scenePanelHeight-Label',
		hint: MODULE.ID + '.scenePanelHeight-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
			min: 30,
			max: 300,
			step: 5,
		},
		default: 100,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H3: CHAT ADJUSTMENTS
	// --------------------------------------
	registerHeader('CardAdjustments', 'headingH3CardAdjustments-Label', 'headingH3CardAdjustments-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	game.settings.register(MODULE.ID, 'hideRollTableIcon', {
		name: MODULE.ID + '.hideRollTableIcon-Label',
		hint: MODULE.ID + '.hideRollTableIcon-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Chat Gap --
	game.settings.register(MODULE.ID, 'chatSpacing', {
		name: MODULE.ID + '.chatSpacing-Label',
		hint: MODULE.ID + '.chatSpacing-Hint',
		scope: "world",
		requiresReload: true,
		config: true,
		type: Number,
		range: {
			min: -20,
			max: 60,
			step: 1,
		},
		default: 3,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Top Offset --
	game.settings.register(MODULE.ID,'cardTopOffset', {
		name: MODULE.ID + '.cardTopOffset-Label',
		hint: MODULE.ID + '.cardTopOffset-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: -80,
		max: 80,
		step: 1,
		},
		default: 50,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Top Margin --
	game.settings.register(MODULE.ID,'cardTopMargin', {
		name: MODULE.ID + '.cardTopMargin-Label',
		hint: MODULE.ID + '.cardTopMargin-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: -20,
		max: 20,
		step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});
	// -- Bottom Margin --
	game.settings.register(MODULE.ID,'cardBottomMargin', {
		name: MODULE.ID + '.cardBottomMargin-Label',
		hint: MODULE.ID + '.cardBottomMargin-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: -20,
		max: 20,
		step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});
	// -- Left Margin --
	game.settings.register(MODULE.ID,'cardLeftMargin', {
		name: MODULE.ID + '.cardLeftMargin-Label',
		hint: MODULE.ID + '.cardLeftMargin-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: -20,
		max: 20,
		step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});
	// -- Right Margin --
	game.settings.register(MODULE.ID,'cardRightMargin', {
		name: MODULE.ID + '.cardRightMargin-Label',
		hint: MODULE.ID + '.cardRightMargin-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: -20,
		max: 20,
		step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// --------------------------------------
	// -- H3: WINDOWS
	// --------------------------------------
	registerHeader('Windows', 'headingH3Windows-Label', 'headingH3Windows-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// -- Titlebar Text Size --
	game.settings.register(MODULE.ID, 'titlebarTextSize', {
		name: MODULE.ID + '.titlebarTextSize-Label',
		hint: MODULE.ID + '.titlebarTextSize-Hint',
		scope: "client",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 25,
		step: 1,
		},
		default: 14,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Titlebar Icon Size --
	game.settings.register(MODULE.ID, 'titlebarIconSize', {
		name: MODULE.ID + '.titlebarIconSize-Label',
		hint: MODULE.ID + '.titlebarIconSize-Hint',
		scope: "client",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 25,
		step: 1,
		},
		default: 14,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// -- Titlebar Spacing --
	game.settings.register(MODULE.ID,"titlebarSpacing", {
		name: MODULE.ID + '.titlebarSpacing-Label',
		hint: MODULE.ID + '.titlebarSpacing-Hint',
		scope: "client",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 25,
		step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});


	// --------------------------------------
	// -- H3: JOURNAL TOOLS
	// --------------------------------------
	registerHeader('JournalTools', 'headingH3JournalTools-Label', 'headingH3JournalTools-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);

	// -- Journal Tools --
	game.settings.register(MODULE.ID, 'enableJournalTools', {
		name: MODULE.ID + '.enableJournalTools-Label',
		hint: MODULE.ID + '.enableJournalTools-Hint',
		type: Boolean,
		config: true,
		scope: 'world',
		default: true,
	});

	// -- Enable Journal Double-Click --
	game.settings.register(MODULE.ID, 'enableJournalDoubleClick', {
		name: MODULE.ID + '.enableJournalDoubleClick-Label',
		hint: MODULE.ID + '.enableJournalDoubleClick-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE
	});

	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == RUN THE GAME
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('RunTheGame', 'headingH1RunTheGame-Label', 'headingH1RunTheGame-Hint', 'H1', WORKFLOW_GROUPS.RUN_THE_GAME);

	// --------------------------------------
	// -- H2: Combat
	// --------------------------------------
	registerHeader('CombatEnhancements', 'headingH2CombatEnhancements-Label', 'headingH2CombatEnhancements-Hint', 'H2', WORKFLOW_GROUPS.RUN_THE_GAME);

	// --------------------------------------
	// -- H3: Combat Tracker Behaviors
	// --------------------------------------
	registerHeader('CombatTrackerBehaviors', 'headingH3CombatTrackerBehaviors-Label', 'headingH3CombatTrackerBehaviors-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Combat Tracker Size Data - HIDDEN SETTING
	game.settings.register(MODULE.ID, 'combatTrackerSize', {
		scope: 'client',
		config: false,
		type: Object,
		default: {},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Open Combat Tracker --
	game.settings.register(MODULE.ID, 'combatTrackerOpen', {
		name: MODULE.ID + '.combatTrackerOpen-Label',
		hint: MODULE.ID + '.combatTrackerOpen-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Make Combat Tracker Resizable --
	game.settings.register(MODULE.ID, 'combatTrackerResizable', {
		name: MODULE.ID + '.combatTrackerResizable-Label',
		hint: MODULE.ID + '.combatTrackerResizable-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});


	// -- Show Health Bar --
	game.settings.register(MODULE.ID, 'combatTrackerShowHealthBar', {
		name: MODULE.ID + '.combatTrackerShowHealthBar-Label',
		hint: MODULE.ID + '.combatTrackerShowHealthBar-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Show Health Bar --
	game.settings.register(MODULE.ID, 'combatTrackerShowPortraits', {
		name: MODULE.ID + '.combatTrackerShowPortraits-Label',
		hint: MODULE.ID + '.combatTrackerShowPortraits-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Combat Tracker Tools
	// --------------------------------------
	registerHeader('CombatTrackerTools', 'headingH3CombatTrackerTools-Label', 'headingH3CombatTrackerTools-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Set Current Combatant Icon --
	game.settings.register(MODULE.ID, 'combatTrackerSetCurrentCombatant', {
		name: MODULE.ID + '.combatTrackerSetCurrentCombatant-Label',
		hint: MODULE.ID + '.combatTrackerSetCurrentCombatant-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});
	
	// -- Clear Initiative --
	game.settings.register(MODULE.ID, 'combatTrackerClearInitiative', {
		name: MODULE.ID + '.combatTrackerClearInitiative-Label',
		hint: MODULE.ID + '.combatTrackerClearInitiative-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});
	
	// -- Auto-Select Current Turn Token --
	game.settings.register(MODULE.ID, 'combatTrackerAutoSelectToken', {
		name: MODULE.ID + '.combatTrackerAutoSelectToken-Label',
		hint: MODULE.ID + '.combatTrackerAutoSelectToken-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});
	
	// -- Set First Combatant --
	game.settings.register(MODULE.ID, 'combatTrackerSetFirstTurn', {
		name: MODULE.ID + '.combatTrackerSetFirstTurn-Label',
		hint: MODULE.ID + '.combatTrackerSetFirstTurn-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});
	
	// -- Roll Initiative for Monstars and NPCs --
	game.settings.register(MODULE.ID, 'combatTrackerRollInitiativeNonPlayer', {
		name: MODULE.ID + '.combatTrackerRollInitiativeNonPlayer-Label',
		hint: MODULE.ID + '.combatTrackerRollInitiativeNonPlayer-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Roll Initiative for Player Characters --
	game.settings.register(MODULE.ID, 'combatTrackerRollInitiativePlayer', {
		name: MODULE.ID + '.combatTrackerRollInitiativePlayer-Label',
		hint: MODULE.ID + '.combatTrackerRollInitiativePlayer-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	
	// -- Clear Targets After Turn --
	game.settings.register(MODULE.ID, 'clearTargetsAfterTurn', {
		name: MODULE.ID + '.clearTargetsAfterTurn-Label',
		hint: MODULE.ID + '.clearTargetsAfterTurn-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Monster/NPC Initiative --
	game.settings.register(MODULE.ID, 'combatTrackerAddInitiative', {
		name: MODULE.ID + '.combatTrackerAddInitiative-Label',
		hint: MODULE.ID + '.combatTrackerAddInitiative-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'none',
		choices: {
			'none': 'Do Nothing: Just add the Monster/NPC to the combat tracker',
			'auto': 'Roll Initiative: Automatically roll initiative for the Monster/NPC',
			'next': 'Set Next: Monster/NPC takes the next available turn',
			'last': 'Last: Monster/NPC gets added to the end of the combat tracker',
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Combat Menubar
	// --------------------------------------
	registerHeader('CombatMenubar', 'headingH3CombatMenubar-Label', 'headingH3CombatMenubar-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Show Combat Menubar Bar --
	game.settings.register(MODULE.ID, 'menubarCombatShow', {
		name: MODULE.ID + '.menubarCombatShow-Label',
		hint: MODULE.ID + '.menubarCombatShow-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Combat Menubar Size --
	game.settings.register(MODULE.ID, 'menubarCombatSize', {
		name: MODULE.ID + '.menubarCombatSize-Label',
		hint: MODULE.ID + '.menubarCombatSize-Hint',
		scope: "client",
		config: true,
		requiresReload: true,	
		type: Number,
		default: 60,
		range: {
			min: 30,
			max: 120,
			step: 2,		
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});


	// --------------------------------------
	// -- H2: Combat Statistics
	// --------------------------------------
	registerHeader('Statistics', 'headingH2Statistics-Label', 'headingH2Statistics-Hint', 'H2', WORKFLOW_GROUPS.RUN_THE_GAME);


	// --------------------------------------
	// -- H3: Combat Tracker Behaviors
	// --------------------------------------
	registerHeader('StatisticsGeneral', 'headingH3StatisticsGeneral-Label', 'headingH3StatisticsGeneral-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Track Player Statistics --
	game.settings.register(MODULE.ID, 'trackPlayerStats', {
		name: MODULE.ID + '.trackPlayerStats-Label',
		hint: MODULE.ID + '.trackPlayerStats-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Track Combat Statistics --
	game.settings.register(MODULE.ID, 'trackCombatStats', {
		name: MODULE.ID + '.trackCombatStats-Label',
		hint: MODULE.ID + '.trackCombatStats-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Statistics Tracking
	// --------------------------------------
	registerHeader('StatisticsSharing', 'headingH3StatisticsSharing-Label', 'headingH3StatisticsSharing-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Share Combat Statistics --
	game.settings.register(MODULE.ID, 'shareCombatStats', {
		name: MODULE.ID + '.shareCombatStats-Label',
		hint: MODULE.ID + '.shareCombatStats-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Show Round Summary --
	game.settings.register(MODULE.ID, 'showRoundSummary', {
		name: MODULE.ID + '.showRoundSummary-Label',
		hint: MODULE.ID + '.showRoundSummary-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	}); 

	// -- Show Round MVP --
	game.settings.register(MODULE.ID, 'showRoundMVP', {
		name: MODULE.ID + '.showRoundMVP-Label',
		hint: MODULE.ID + '.showRoundMVP-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	}); 

	// -- Show Notable Moments --
	game.settings.register(MODULE.ID, 'showNotableMoments', {
		name: MODULE.ID + '.showNotableMoments-Label',
		hint: MODULE.ID + '.showNotableMoments-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	}); 

	// -- Show Party Breakdown --
	game.settings.register(MODULE.ID, 'showPartyBreakdown', {
		name: MODULE.ID + '.showPartyBreakdown-Label',
		hint: MODULE.ID + '.showPartyBreakdown-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});


	// --------------------------------------
	// -- H2: Token Enhancements
	// --------------------------------------
	registerHeader('TokenEnhancements', 'headingH2TokenEnhancements-Label', 'headingH2TokenEnhancements-Hint', 'H2', WORKFLOW_GROUPS.RUN_THE_GAME);

	// --------------------------------------
	// -- H3: GeneralIndicatorSettings	
	// --------------------------------------
	registerHeader('GeneralIndicatorSettings', 'headingH3GeneralIndicatorSettings-Label', 'headingH3GeneralIndicatorSettings-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Turn Indicator Enabled --
	game.settings.register(MODULE.ID, 'generalIndicatorsEnabled', {
		name: MODULE.ID + '.generalIndicatorsEnabled-Label',
		hint: MODULE.ID + '.generalIndicatorsEnabled-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Thickness --
	game.settings.register(MODULE.ID, 'generalIndicatorsThickness', {
		name: MODULE.ID + '.generalIndicatorsThickness-Label',
		hint: MODULE.ID + '.generalIndicatorsThickness-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 10,
		range: {
			min: 5,
			max: 30,
			step: 1
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Offset --
	game.settings.register(MODULE.ID, 'generalIndicatorsOffset', {
		name: MODULE.ID + '.generalIndicatorsOffset-Label',
		hint: MODULE.ID + '.generalIndicatorsOffset-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 8,
		range: {
			min: 0,
			max: 50,
			step: 1
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Min Opacity --
	game.settings.register(MODULE.ID, 'generalIndicatorsOpacityMin', {
		name: MODULE.ID + '.generalIndicatorsOpacityMin-Label',
		hint: MODULE.ID + '.generalIndicatorsOpacityMin-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.3,
		range: {
			min: 0,
			max: 1,
			step: 0.05
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Max Opacity --
	game.settings.register(MODULE.ID, 'generalIndicatorsOpacityMax', {
		name: MODULE.ID + '.generalIndicatorsOpacityMax-Label',
		hint: MODULE.ID + '.generalIndicatorsOpacityMax-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.8,
		range: {
			min: 0,
			max: 1,
			step: 0.05
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Inner Fill Opacity --
	game.settings.register(MODULE.ID, 'generalIndicatorsOpacityInner', {
		name: MODULE.ID + '.generalIndicatorsOpacityInner-Label',
		hint: MODULE.ID + '.generalIndicatorsOpacityInner-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.3,
		range: {
			min: 0,
			max: 1,
			step: 0.05
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Turn Indicators
	// --------------------------------------
	registerHeader('TurnIndicators', 'headingH3TurnIndicators-Label', 'headingH3TurnIndicators-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Turn Indicator Style --
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentStyle', {
		name: MODULE.ID + '.turnIndicatorCurrentStyle-Label',
		hint: MODULE.ID + '.turnIndicatorCurrentStyle-Hint',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			solid: "Solid Circle",
			dashed: "Dashed Circle",
			spikes: "Circle with Spikes",
			spikesIn: "Circle with Inward Spikes",
			roundedSquare: "Rounded Square"
		},
		default: 'solid',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Animation --
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentAnimation', {
		name: MODULE.ID + '.turnIndicatorCurrentAnimation-Label',
		hint: MODULE.ID + '.turnIndicatorCurrentAnimation-Hint',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			pulse: "Pulse (Opacity)",
			rotate: "Rotate",
			wobble: "Wobble (Scale)",
			fixed: "Fixed (No Animation)"
		},
		default: 'pulse',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Animation Speed --
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentAnimationSpeed', {
		name: MODULE.ID + '.turnIndicatorCurrentAnimationSpeed-Label',
		hint: MODULE.ID + '.turnIndicatorCurrentAnimationSpeed-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 5,
		range: {
			min: 1,
			max: 10,
			step: 1
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Border Color --
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentBorderColor', {
		name: MODULE.ID + '.turnIndicatorCurrentBorderColor-Label',
		hint: MODULE.ID + '.turnIndicatorCurrentBorderColor-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '#03c602',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Indicator Inner Fill Color --
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentBackgroundColor', {
		name: MODULE.ID + '.turnIndicatorCurrentBackgroundColor-Label',
		hint: MODULE.ID + '.turnIndicatorCurrentBackgroundColor-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '#03c602',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Target Indicators
	// --------------------------------------
	registerHeader('TargetedIndicator', 'headingH3TargetedIndicator-Label', 'headingH3TargetedIndicator-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Targeted Indicator Enabled --
	game.settings.register(MODULE.ID, 'targetedIndicatorEnabled', {
		name: MODULE.ID + '.targetedIndicatorEnabled-Label',
		hint: MODULE.ID + '.targetedIndicatorEnabled-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// Hide Foundry Default Target Indicators
	game.settings.register(MODULE.ID, 'hideDefaultTargetIndicators', {
		name: 'Hide Default Target Indicators',
		hint: 'Hide Foundry\'s default target indicators (reticles, brackets, pips) to use only custom indicators.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		requiresReload: false
	});

	// -- Targeted Indicator Style --
	game.settings.register(MODULE.ID, 'targetedIndicatorStyle', {
		name: MODULE.ID + '.targetedIndicatorStyle-Label',
		hint: MODULE.ID + '.targetedIndicatorStyle-Hint',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			solid: "Solid Circle",
			dashed: "Dashed Circle",
			spikes: "Circle with Spikes",
			spikesIn: "Circle with Inward Spikes",
			roundedSquare: "Rounded Square"
		},
		default: 'solid',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Targeted Indicator Animation --
	game.settings.register(MODULE.ID, 'targetedIndicatorAnimation', {
		name: MODULE.ID + '.targetedIndicatorAnimation-Label',
		hint: MODULE.ID + '.targetedIndicatorAnimation-Hint',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			pulse: "Pulse (Opacity)",
			rotate: "Rotate",
			wobble: "Wobble (Scale)",
			fixed: "Fixed (No Animation)"
		},
		default: 'pulse',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Targeted Indicator Animation Speed --
	game.settings.register(MODULE.ID, 'targetedIndicatorAnimationSpeed', {
		name: MODULE.ID + '.targetedIndicatorAnimationSpeed-Label',
		hint: MODULE.ID + '.targetedIndicatorAnimationSpeed-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 5,
		range: {
			min: 1,
			max: 10,
			step: 1
		},
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Targeted Indicator Border Color --
	game.settings.register(MODULE.ID, 'targetedIndicatorBorderColor', {
		name: MODULE.ID + '.targetedIndicatorBorderColor-Label',
		hint: MODULE.ID + '.targetedIndicatorBorderColor-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '#a51214',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Targeted Indicator Background Color --
	game.settings.register(MODULE.ID, 'targetedIndicatorBackgroundColor', {
		name: MODULE.ID + '.targetedIndicatorBackgroundColor-Label',
		hint: MODULE.ID + '.targetedIndicatorBackgroundColor-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '#a51214',
		requiresReload: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H2: Timers
	// --------------------------------------
	registerHeader('Timers', 'headingH2Timers-Label', 'headingH2Timers-Hint', 'H2', WORKFLOW_GROUPS.RUN_THE_GAME);

	// --------------------------------------
	// -- H3: Session Timer Settings	
	// --------------------------------------
	registerHeader('GlobalTimerSettings', 'headingH3GlobalTimerSettings-Label', 'headingH3GlobalTimerSettings-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// -- Timer Visibility --
	game.settings.register(MODULE.ID, 'combatTimerGMOnly', {
		name: MODULE.ID + '.combatTimerGMOnly-Label',
		hint: MODULE.ID + '.combatTimerGMOnly-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Timer Show Notifications --
	game.settings.register(MODULE.ID, 'timerShowNotifications', {
		name: MODULE.ID + '.timerShowNotifications-Label',
		hint: MODULE.ID + '.timerShowNotifications-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	// -- Notification Override List --
	game.settings.register(MODULE.ID, 'timerNotificationOverride', {
		name: MODULE.ID + '.timerNotificationOverride-Label',
		hint: MODULE.ID + '.timerNotificationOverride-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Hurry Up Message Sound --
	game.settings.register(MODULE.ID, 'hurryUpSound', {
		name: MODULE.ID + '.hurryUpSound-Label',
		hint: MODULE.ID + '.hurryUpSound-Hint',
		scope: "world",
		config: true,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none",
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Timer Pause/Resume Sound --
	game.settings.register(MODULE.ID, 'timerPauseResumeSound', {
		name: MODULE.ID + '.timerPauseResumeSound-Label',
		hint: MODULE.ID + '.timerPauseResumeSound-Hint',
		scope: "world",
		config: true,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none",
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Timer Sound Volume --
	game.settings.register(MODULE.ID, 'timerSoundVolume', {
		name: MODULE.ID + '.timerSoundVolume-Label',
		hint: MODULE.ID + '.timerSoundVolume-Hint',
		scope: "client",
		config: true,
		type: Number,
		default: 0.8,
		range: {
			min: 0,
			max: 1,
			step: 0.1
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Global Timer Notifications	
	// --------------------------------------
	registerHeader('GlobalTimerNotifications', 'headingH3GlobalTimerNotifications-Label', 'headingH3GlobalTimerNotifications-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

	// Timer Chat Message Settings
	game.settings.register(MODULE.ID, 'timerChatPauseUnpause', {
		name: MODULE.ID + '.timerChatPauseUnpause-Label',
		hint: MODULE.ID + '.timerChatPauseUnpause-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Starting --
	game.settings.register(MODULE.ID, 'timerChatPlanningStart', {
		name: MODULE.ID + '.timerChatPlanningStart-Label',
		hint: MODULE.ID + '.timerChatPlanningStart-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Ending Soon --
	game.settings.register(MODULE.ID, 'timerChatPlanningRunningOut', {
		name: MODULE.ID + '.timerChatPlanningRunningOut-Label',
		hint: MODULE.ID + '.timerChatPlanningRunningOut-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Ended --
	game.settings.register(MODULE.ID, 'timerChatPlanningEnded', {
		name: MODULE.ID + '.timerChatPlanningEnded-Label',
		hint: MODULE.ID + '.timerChatPlanningEnded-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Starting --
	game.settings.register(MODULE.ID, 'timerChatTurnStart', {
		name: MODULE.ID + '.timerChatTurnStart-Label',
		hint: MODULE.ID + '.timerChatTurnStart-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Ending Soon --
	game.settings.register(MODULE.ID, 'timerChatTurnRunningOut', {
		name: MODULE.ID + '.timerChatTurnRunningOut-Label',
		hint: MODULE.ID + '.timerChatTurnRunningOut-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Turn Ended --
	game.settings.register(MODULE.ID, 'timerChatTurnEnded', {
		name: MODULE.ID + '.timerChatTurnEnded-Label',
		hint: MODULE.ID + '.timerChatTurnEnded-Hint',
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Session Timer Settings	
	// --------------------------------------
	registerHeader('SessionTimers', 'headingH3SessionTimers-Label', 'headingH3SessionTimers-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);


	// Session Start Time - HIDDEN SETTINGS
	game.settings.register(MODULE.ID, 'sessionStartTime', {
		scope: 'world',
		config: false,
		type: Number,
		default: 0,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});
	
	// Session End Time - HIDDEN SETTINGS
	game.settings.register(MODULE.ID, 'sessionEndTime', {
		scope: 'world',
		config: false,
		type: Number,
		default: 0,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// Session Timer Date - HIDDEN SETTINGS
	game.settings.register(MODULE.ID, 'sessionTimerDate', {
		scope: 'world',
		config: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// Menubar Settings
	game.settings.register(MODULE.ID, 'sessionTimerDefault', {
		name: MODULE.ID + '.sessionTimerDefault-Label',
		hint: MODULE.ID + '.sessionTimerDefault-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 60,
		range: {
			min: 15,
			max: 600,
			step: 1
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// Menubar Settings
	game.settings.register(MODULE.ID, 'sessionTimerWarningThreshold', {
		name: MODULE.ID + '.sessionTimerWarningThreshold-Label',
		hint: MODULE.ID + '.sessionTimerWarningThreshold-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 15,
		range: {
			min: 1,
			max: 60,
			step: 1
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Session Timer Warning Sound --
	game.settings.register(MODULE.ID, 'sessionTimerWarningSound', {
		name: MODULE.ID + '.sessionTimerWarningSound-Label',
		hint: MODULE.ID + '.sessionTimerWarningSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Session Timer Warning Message --
	game.settings.register(MODULE.ID, 'sessionTimerWarningMessage', {
		name: MODULE.ID + '.sessionTimerWarningMessage-Label',
		hint: MODULE.ID + '.sessionTimerWarningMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'Time is running out in the session. We have about {time} remaining in our session.',
		group: WORKFLOW_GROUPS.RUN_THE_GAME	
	});

	// -- Session Timer Expired Sound --
	game.settings.register(MODULE.ID, 'sessionTimerExpiredSound', {
		name: MODULE.ID + '.sessionTimerExpiredSound-Label',
		hint: MODULE.ID + '.sessionTimerExpiredSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Session Timer Expired Message --
	game.settings.register(MODULE.ID, 'sessionTimerExpiredMessage', {
		name: MODULE.ID + '.sessionTimerExpiredMessage-Label',
		hint: MODULE.ID + '.sessionTimerExpiredMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'Time has run out in this session. Bummer. We can pick up here next time.',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});



	// --------------------------------------
	// -- H3: Round Timer Settings	
	// --------------------------------------
	registerHeader('RoundTimer', 'headingH3RoundTimer-Label', 'headingH3RoundTimer-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);
	
	// -- Show Round Timer --
	game.settings.register(MODULE.ID, 'showRoundTimer', {
		name: MODULE.ID + '.showRoundTimer-Label',
		hint: MODULE.ID + '.showRoundTimer-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// Announce New Rounds
	game.settings.register(MODULE.ID, 'announceNewRounds', {
		name: MODULE.ID + '.announceNewRounds-Label',
		hint: MODULE.ID + '.announceNewRounds-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// New Round Sound Setting
	game.settings.register(MODULE.ID, 'newRoundSound', {
		name: MODULE.ID + '.newRoundSound-Label',
		hint: MODULE.ID + '.newRoundSound-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none",
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Planning Timer Settings	
	// --------------------------------------
	registerHeader('PlanningTimer', 'headingH3PlanningTimer-Label', 'headingH3PlanningTimer-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);
	
	// Planning Timer Settings
	game.settings.register(MODULE.ID, 'planningTimerEnabled', {
		name: MODULE.ID + '.planningTimerEnabled-Label',
		hint: MODULE.ID + '.planningTimerEnabled-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Auto Start --
	game.settings.register(MODULE.ID, 'planningTimerAutoStart', {
		name: MODULE.ID + '.planningTimerAutoStart-Label',
		hint: MODULE.ID + '.planningTimerAutoStart-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Label --
	game.settings.register(MODULE.ID, 'planningTimerLabel', {
		name: MODULE.ID + '.planningTimerLabel-Label',
		hint: MODULE.ID + '.planningTimerLabel-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Duration --
	game.settings.register(MODULE.ID, 'planningTimerDuration', {
		name: MODULE.ID + '.planningTimerDuration-Label',
		hint: MODULE.ID + '.planningTimerDuration-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 120,
		range: {
			min: 5,
			max: 900,
			step: 5
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Ending Soon Threshold --
	game.settings.register(MODULE.ID, 'planningTimerEndingSoonThreshold', {
		name: MODULE.ID + '.planningTimerEndingSoonThreshold-Label',
		hint: MODULE.ID + '.planningTimerEndingSoonThreshold-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 20,
		range: {
			min: 1,
			max: 100,
			step: 1
		},	
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Ending Soon Message --
	game.settings.register(MODULE.ID, 'planningTimerEndingSoonMessage', {
		name: MODULE.ID + '.planningTimerEndingSoonMessage-Label',
		hint: MODULE.ID + '.planningTimerEndingSoonMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning phase ending soon!',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Ending Soon Sound --
	game.settings.register(MODULE.ID, 'planningTimerEndingSoonSound', {
		name: MODULE.ID + '.planningTimerEndingSoonSound-Label',
		hint: MODULE.ID + '.planningTimerEndingSoonSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Expired Message --
	game.settings.register(MODULE.ID, 'planningTimerExpiredMessage', {
		name: MODULE.ID + '.planningTimerExpiredMessage-Label',
		hint: MODULE.ID + '.planningTimerExpiredMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning phase has ended!',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Planning Timer Expired Sound --
	game.settings.register(MODULE.ID, 'planningTimerExpiredSound', {
		name: MODULE.ID + '.planningTimerExpiredSound-Label',
		hint: MODULE.ID + '.planningTimerExpiredSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// --------------------------------------
	// -- H3: Combat Timer Settings	
	// --------------------------------------
	registerHeader('CombatTimer', 'headingH3CombatTimer-Label', 'headingH3CombatTimer-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);
	
	// -- Combat Timer Enabled --
	game.settings.register(MODULE.ID, 'combatTimerEnabled', {
		name: MODULE.ID + '.combatTimerEnabled-Label',
		hint: MODULE.ID + '.combatTimerEnabled-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Auto Start Timer --
	game.settings.register(MODULE.ID, 'combatTimerAutoStart', {
		name: MODULE.ID + '.combatTimerAutoStart-Label',
		hint: MODULE.ID + '.combatTimerAutoStart-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Activity Starts Timer --
	game.settings.register(MODULE.ID, 'combatTimerActivityStart', {
		name: MODULE.ID + '.combatTimerActivityStart-Label',
		hint: MODULE.ID + '.combatTimerActivityStart-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	game.settings.register(MODULE.ID, 'combatTimerDuration', {
		name: MODULE.ID + '.combatTimerDuration-Label',
		hint: MODULE.ID + '.combatTimerDuration-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 120,
		range: {
			min: 10,
			max: 900,
			step: 5
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});


	// Combat Timer Settings
	game.settings.register(MODULE.ID, 'combatTimerStartSound', {
		name: MODULE.ID + '.combatTimerStartSound-Label',
		hint: MODULE.ID + '.combatTimerStartSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});


	// -- Warning Threshold --
	game.settings.register(MODULE.ID, 'combatTimerWarningThreshold', {
		name: MODULE.ID + '.combatTimerWarningThreshold-Label',
		hint: MODULE.ID + '.combatTimerWarningThreshold-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 50,
		range: {
			min: 20,
			max: 80,
			step: 5
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Warning Message --
	game.settings.register(MODULE.ID, 'combatTimerWarningMessage', {
		name: MODULE.ID + '.combatTimerWarningMessage-Label',
		hint: MODULE.ID + '.combatTimerWarningMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '{name} is running out of time!'
	});

	// -- Warning Sound --
	game.settings.register(MODULE.ID, 'combatTimerWarningSound', {
		name: MODULE.ID + '.combatTimerWarningSound-Label',
		hint: MODULE.ID + '.combatTimerWarningSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Critical Threshold --
	game.settings.register(MODULE.ID, 'combatTimerCriticalThreshold', {
		name: MODULE.ID + '.combatTimerCriticalThreshold-Label',
		hint: MODULE.ID + '.combatTimerCriticalThreshold-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 20,
		range: {
			min: 5,
			max: 40,
			step: 5
		},
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Critical Message --
	game.settings.register(MODULE.ID, 'combatTimerCriticalMessage', {
		name: MODULE.ID + '.combatTimerCriticalMessage-Label',
		hint: MODULE.ID + '.combatTimerCriticalMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '{name} is running out of time!',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Critical Sound --
	game.settings.register(MODULE.ID, 'combatTimerCriticalSound', {
		name: MODULE.ID + '.combatTimerCriticalSound-Label',
		hint: MODULE.ID + '.combatTimerCriticalSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
	});

	// -- Expired Message --
	game.settings.register(MODULE.ID, 'combatTimerExpiredMessage', {
		name: MODULE.ID + '.combatTimerExpiredMessage-Label',
		hint: MODULE.ID + '.combatTimerExpiredMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '{name}\'s time has expired!',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Expired Sound --
	game.settings.register(MODULE.ID, 'combatTimeisUpSound', {
		name: MODULE.ID + '.combatTimerExpiredSound-Label',
		hint: MODULE.ID + '.combatTimerExpiredSound-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});


	// -- End Turn on Timer Expiration --
	game.settings.register(MODULE.ID, 'combatTimerEndTurn', {
		name: MODULE.ID + '.combatTimerEndTurn-Label',
		hint: MODULE.ID + '.combatTimerEndTurn-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});

	// -- Auto End Turn Message --
	game.settings.register(MODULE.ID, 'combatTimerAutoAdvanceMessage', {
		name: MODULE.ID + '.combatTimerAutoAdvanceMessage-Label',
		hint: MODULE.ID + '.combatTimerAutoAdvanceMessage-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '{name}\'s turn was automatically ended due to time expiration.',
		group: WORKFLOW_GROUPS.RUN_THE_GAME
	});	



	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == MANAGE CONTENT
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('ManageContent', 'headingH1ManageContent-Label', 'headingH1ManageContent-Hint', 'H1', WORKFLOW_GROUPS.MANAGE_CONTENT);
	

	// --------------------------------------
	// -- H2: Imports
	// --------------------------------------
	registerHeader('ContentImports', 'headingH2ContentImports-Label', 'headingH2ContentImports-Hint', 'H2', WORKFLOW_GROUPS.MANAGE_CONTENT);

	// -- Enhanced Image Guessing --
	game.settings.register(MODULE.ID, 'enableEnhancedImageGuessing', {
		name: MODULE.ID + '.enableEnhancedImageGuessing-Label',
		hint: MODULE.ID + '.enableEnhancedImageGuessing-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// --------------------------------------
	// -- H2: Narratives
	// --------------------------------------
	registerHeader('NarrativeGenerator', 'headingH2NarrativeGenerator-Label', 'headingH2NarrativeGenerator-Hint', 'H2', WORKFLOW_GROUPS.MANAGE_CONTENT);


	// --------------------------------------
	// -- H3: Narrative Configuration	
	// --------------------------------------
	registerHeader('NarrativeConfiguration', 'headingH3NarrativeConfiguration-Label', 'headingH3NarrativeConfiguration-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);
	
	// -- Use Cookies --
	game.settings.register(MODULE.ID, 'narrativeUseCookies', {
		name: MODULE.ID + '.narrativeUseCookies-Label',
		hint: MODULE.ID + '.narrativeUseCookies-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Narrative Folder --
	game.settings.register(MODULE.ID, 'defaultNarrativeFolder', {
		name: MODULE.ID + '.defaultNarrativeFolder-Label',
		hint: MODULE.ID + '.defaultNarrativeFolder-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'New Narratives',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Journal Page Title --
	game.settings.register(MODULE.ID, 'defaultJournalPageTitle', {
		name: MODULE.ID + '.defaultJournalPageTitle-Label',
		hint: MODULE.ID + '.defaultJournalPageTitle-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});


	// -- Default Card Image Selection --
	game.settings.register(MODULE.ID, 'narrativeDefaultCardImage', {
		name: MODULE.ID + '.narrativeDefaultCardImage-Label',
		hint: MODULE.ID + '.narrativeDefaultCardImage-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'none',
		choices: {
			'none': 'No Image',
			'custom': 'Custom: Paste the Path Below',
			'modules/coffee-pub-blacksmith/images/banners/banners-heros-1.webp': 'Heroes 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-heros-2.webp': 'Heroes 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-heros-3.webp': 'Heroes 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-1.webp': 'Location:Crypt 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-2.webp': 'Location:Crypt 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-1.webp': 'Landscape: Forest 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-2.webp': 'Landscape: Forest 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-3.webp': 'Landscape: Forest 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-4.webp': 'Landscape: Forest 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-narration-jungle-1.webp': 'Landscape: Jungle 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-mountains-1.webp': 'Landscape: Mountains 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-mushrooms-1.webp': 'Landscape: Mushrooms 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-mushrooms-2.webp': 'Landscape: Mushrooms 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-path-1.webp': 'Landscape: Path 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-path-2.webp': 'Landscape: Path 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-1.webp': 'Landscape: Winter 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-2.webp': 'Landscape: Winter 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-3.webp': 'Landscape: Winter 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-monsters-dragon-1.webp': 'Monster: Dragon 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-monsters-minotour-1.webp': 'Monster: Minotaur 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-monsters-wraith-1.webp': 'Monster: Wraith 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-monsters-wraith-2.webp': 'Monster: Wraith 2'
		},
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Image Path --
	game.settings.register(MODULE.ID, 'narrativeDefaultImagePath', {
		name: MODULE.ID + '.narrativeDefaultImagePath-Label',
		hint: MODULE.ID + '.narrativeDefaultImagePath-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});


	// --------------------------------------
	// -- H3: Narrative Options	
	// --------------------------------------
	registerHeader('NarrativeOptions', 'headingH3NarrativeOptions-Label', 'headingH3NarrativeOptions-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);
	
	// -- Include Treasure by Default --
	game.settings.register(MODULE.ID, 'narrativeDefaultIncludeTreasure', {
		name: MODULE.ID + '.narrativeDefaultIncludeTreasure-Label',
		hint: MODULE.ID + '.narrativeDefaultIncludeTreasure-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Treasure Details --
	game.settings.register(MODULE.ID, 'narrativeDefaultTreasureDetails', {
		name: MODULE.ID + '.narrativeDefaultTreasureDetails-Label',
		hint: MODULE.ID + '.narrativeDefaultTreasureDetails-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'None',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Include Encounter by Default --
	game.settings.register(MODULE.ID, 'narrativeDefaultIncludeEncounter', {
		name: MODULE.ID + '.narrativeDefaultIncludeEncounter-Label',
		hint: MODULE.ID + '.narrativeDefaultIncludeEncounter-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default XP --
	game.settings.register(MODULE.ID, 'narrativeDefaultXP', {
		name: MODULE.ID + '.narrativeDefaultXP-Label',
		hint: MODULE.ID + '.narrativeDefaultXP-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'None',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Encounter Details --
	game.settings.register(MODULE.ID, 'narrativeDefaultEncounterDetails', {
		name: MODULE.ID + '.narrativeDefaultEncounterDetails-Label',
		hint: MODULE.ID + '.narrativeDefaultEncounterDetails-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// --------------------------------------
	// -- H2: Narratives
	// --------------------------------------
	registerHeader('EncounterGenerator', 'headingH2EncounterGenerator-Label', 'headingH2EncounterGenerator-Hint', 'H2', WORKFLOW_GROUPS.MANAGE_CONTENT);

	// -- Encounter Folder --
	game.settings.register(MODULE.ID, 'encounterFolder', {
		name: MODULE.ID + '.encounterFolder-Label',
		hint: MODULE.ID + '.encounterFolder-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'Encounters',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Encounter Card Image Selection --
	game.settings.register(MODULE.ID, 'encounterDefaultCardImage', {
		name: MODULE.ID + '.encounterDefaultCardImage-Label',
		hint: MODULE.ID + '.encounterDefaultCardImage-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'none',
		choices: {
			'none': 'No Image',
			'custom': 'Custom: Paste the Path Below',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-acid-1.webp': 'Damage: Acid 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-acid-2.webp': 'Damage: Acid 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-acid-3.webp': 'Damage: Acid 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-1.webp': 'Damage: Bludgeoning 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-2.webp': 'Damage: Bludgeoning 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-3.webp': 'Damage: Bludgeoning 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-4.webp': 'Damage: Bludgeoning 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-1.webp': 'Damage: Cold 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-2.webp': 'Damage: Cold 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-3.webp': 'Damage: Cold 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-4.webp': 'Damage: Cold 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-1.webp': 'Damage: Fire 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-2.webp': 'Damage: Fire 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-3.webp': 'Damage: Fire 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-4.webp': 'Damage: Fire 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-5.webp': 'Damage: Fire 5',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-6.webp': 'Damage: Fire 6',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-force-1.webp': 'Damage: Force 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-force-2.webp': 'Damage: Force 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-force-3.webp': 'Damage: Force 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-force-4.webp': 'Damage: Force 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-1.webp': 'Damage: Lightning 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-2.webp': 'Damage: Lightning 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-3.webp': 'Damage: Lightning 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-4.webp': 'Damage: Lightning 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-1.webp': 'Damage: Necrotic 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-2.webp': 'Damage: Necrotic 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-3.webp': 'Damage: Necrotic 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-4.webp': 'Damage: Necrotic 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-5.webp': 'Damage: Necrotic 5',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-1.webp': 'Damage: Oops 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-2.webp': 'Damage: Oops 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-3.webp': 'Damage: Oops 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-4.webp': 'Damage: Oops 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-5.webp': 'Damage: Oops 5',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-6.webp': 'Damage: Oops 6',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-7.webp': 'Damage: Oops 7',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-8.webp': 'Damage: Oops 8',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-9.webp': 'Damage: Oops 9',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-10.webp': 'Damage: Oops 10',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-oops-11.webp': 'Damage: Oops 11',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-piercing-1.webp': 'Damage: Piercing 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-piercing-2.webp': 'Damage: Piercing 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-piercing-3.webp': 'Damage: Piercing 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-1.webp': 'Damage: Poison 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-2.webp': 'Damage: Poison 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-3.webp': 'Damage: Poison 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-4.webp': 'Damage: Poison 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-5.webp': 'Damage: Poison 5',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-1.webp': 'Damage: Psychic 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-2.webp': 'Damage: Psychic 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-3.webp': 'Damage: Psychic 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-4.webp': 'Damage: Psychic 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-1.webp': 'Damage: Radiant 1',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp': 'Damage: Radiant 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-3.webp': 'Damage: Radiant 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-4.webp': 'Damage: Radiant 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-1.webp': 'Damage: Slashing 1',
			'modules/coffee-pub-blacksmith/images/banners-damage-slashing-2.webp': 'Damage: Slashing 2',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-3.webp': 'Damage: Slashing 3',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-4.webp': 'Damage: Slashing 4',
			'modules/coffee-pub-blacksmith/images/banners/banners-damage-thunder-1.webp': 'Damage: Thunder 1'
		},
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// -- Default Encounter Image Path --
	game.settings.register(MODULE.ID, 'encounterDefaultImagePath', {
		name: MODULE.ID + '.encounterDefaultImagePath-Label',
		hint: MODULE.ID + '.encounterDefaultImagePath-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.MANAGE_CONTENT
	});

	// --------------------------------------
	// -- H2: Compendiums
	// --------------------------------------
	registerHeader('CompendiumMapping', 'headingH2CompendiumMapping-Label', 'headingH2CompendiumMapping-Hint', 'H2', WORKFLOW_GROUPS.MANAGE_CONTENT);

	// Dynamically register settings for ALL compendium types found in the system
	// This includes Actor, Item, Spell, Feature, and any other types (JournalEntry, RollTable, etc.)
	registerDynamicCompendiumTypes();




	

	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == ROLLING AND PROGRESSION
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('RollingAndProgression', 'headingH1RollingAndProgression-Label', 'headingH1RollingAndProgression-Hint', 'H1', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);

	// --------------------------------------
	// -- H2: ROLL SYSTEM
	// --------------------------------------
	registerHeader('diceRollTool', 'headingH2diceRollTool-Label', 'headingH2diceRollTool-Hint', 'H2', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);



	// -- Skill Check Preferences - HIDDEN SETTING --
	game.settings.register(MODULE.ID, 'skillCheckPreferences', {
		name: 'Skill Check Preferences',
		hint: 'Default preferences for skill check dialog',
		scope: 'client',
		config: false,
		type: Object,
		default: {
			showRollExplanation: true,
			showDC: true,
			groupRoll: true,
			isCinematic: false
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Chat Roll System Choice --
	game.settings.register(MODULE.ID, 'diceRollToolSystem', {
		name: 'Chat Roll System',
		hint: 'Set the system you wish to use when rolling from the chat card. Note: The Foundry Roll system includes per-player roll cards that can\'t be suppressed.',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			'blacksmith': 'Blacksmith Roll System (Default)',
			'foundry': 'Foundry Roll System'
		},
		default: 'blacksmith',
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	registerHeader('diceRollToolIntegrations', 'headingH3diceRollToolIntegrations-Label', 'headingH3diceRollToolIntegrations-Hint', 'H3', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);

	// -- Enable Dice So Nice Integration --
	game.settings.register(MODULE.ID, 'diceRollToolEnableDiceSoNice', {
		name: MODULE.ID + '.diceRollToolEnableDiceSoNice-Label',
		hint: MODULE.ID + '.diceRollToolEnableDiceSoNice-Hint',
		type: Boolean,
		config: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});


	// --------------------------------------
	// -- H2: XP DISTRIBUTION
	// --------------------------------------
	registerHeader('XpDistribution', 'headingH2XpDistribution-Label', 'headingH2XpDistribution-Hint', 'H2', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);

	// --------------------------------------
	// -- H3: XP Configuration
	// --------------------------------------
	registerHeader('XpConfiguration', 'headingH3XpConfiguration-Label', 'headingH3XpConfiguration-Hint', 'H3', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);

	// -- Enable XP Distribution --
	game.settings.register(MODULE.ID, 'enableXpDistribution', {
		name: MODULE.ID + '.enableXpDistribution-Label',
		hint: MODULE.ID + '.enableXpDistribution-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Auto-distribute XP --
	game.settings.register(MODULE.ID, 'autoDistributeXp', {
		name: MODULE.ID + '.autoDistributeXp-Label',
		hint: MODULE.ID + '.autoDistributeXp-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Share XP Results --
	game.settings.register(MODULE.ID, 'shareXpResults', {
		name: MODULE.ID + '.shareXpResults-Label',
		hint: 	MODULE.ID + '.shareXpResults-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- XP Calculation Method --
	game.settings.register(MODULE.ID, 'xpCalculationMethod', {
		name: MODULE.ID + '.xpCalculationMethod-Label',
		hint: MODULE.ID + '.xpCalculationMethod-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'dnd5e',
		choices: {
			'dnd5e': 'D&D 5e RAW (CR-based XP Calculations)',
			'narrative': 'Narrative/Goal-Based XP (Manual Entry)',
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Party Size Handling --
	game.settings.register(MODULE.ID, 'xpPartySizeHandling', {
		name: MODULE.ID + '.xpPartySizeHandling-Label',
		hint: MODULE.ID + '.xpPartySizeHandling-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'dnd5e',
		choices: {
			'dnd5e': 'D&D 5e RAW (No Multipliers)',
			'multipliers': 'House Rules (Scale for Party Size)'
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// --------------------------------------
	// -- H3: XP Multipliers
	// --------------------------------------
	registerHeader('XpMultipliers', 'headingH3XpMultipliers-Label', 'headingH3XpMultipliers-Hint', 'H3', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);

	// -- Resolution Type XP Multipliers --
	game.settings.register(MODULE.ID, 'xpMultiplierDefeated', {
		name: MODULE.ID + '.xpMultiplierDefeated-Label',
		hint: MODULE.ID + '.xpMultiplierDefeated-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 1.0,
		range: {
			min: 0,
			max: 3,
			step: 0.05
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Negotiated XP Multiplier --
	game.settings.register(MODULE.ID, 'xpMultiplierNegotiated', {
		name: MODULE.ID + '.xpMultiplierNegotiated-Label',
		hint: MODULE.ID + '.xpMultiplierNegotiated-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 1.0,
		range: {
			min: 0,
			max: 3,
			step: 0.05
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Captured XP Multiplier --
	game.settings.register(MODULE.ID, 'xpMultiplierCaptured', {
		name: MODULE.ID + '.xpMultiplierCaptured-Label',
		hint: MODULE.ID + '.xpMultiplierCaptured-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 1.0,
		range: {
		min: 0,
			max: 3,
			step: 0.05
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Escaped XP Multiplier --
	game.settings.register(MODULE.ID, 'xpMultiplierEscaped', {
		name: MODULE.ID + '.xpMultiplierEscaped-Label',
		hint: MODULE.ID + '.xpMultiplierEscaped-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.5,
		range: {
		min: 0,
			max: 3,
			step: 0.05
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});

	// -- Ignored XP Multiplier --
	game.settings.register(MODULE.ID, 'xpMultiplierIgnored', {
		name: MODULE.ID + '.xpMultiplierIgnored-Label',
		hint: MODULE.ID + '.xpMultiplierIgnored-Hint',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.0,
		range: {
		min: 0,
			max: 3,
			step: 0.05
		},
		group: WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION
	});





	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == AUTOMATION
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('Automation', 'headingH1Automation-Label', 'headingH1Automation-Hint', 'H1', WORKFLOW_GROUPS.AUTOMATION);

	// --------------------------------------
	// -- H2: TOKENS
	// --------------------------------------
	registerHeader('Tokens', 'headingH2Tokens-Label', 'headingH2Tokens-Hint', 'H2', WORKFLOW_GROUPS.AUTOMATION);

	// --------------------------------------
	// -- H3: Rotation
	// --------------------------------------
	registerHeader('TokenRotationOptions', 'headingH3TokenRotationOptions-Label', 'headingH3TokenRotationOptions-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	game.settings.register(MODULE.ID, 'enableTokenRotation', {
		name: MODULE.ID + '.enableTokenRotation-Label',
		hint: MODULE.ID + '.enableTokenRotation-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	game.settings.register(MODULE.ID, 'tokenRotationMinDistance', {
		name: MODULE.ID + '.tokenRotationMinDistance-Label',
		hint: MODULE.ID + '.tokenRotationMinDistance-Hint',
		type: Number,
		config: true,
		requiresReload: false,
		scope: 'world',
		range: {
			min: 0.1,
			max: 2.0,
			step: 0.1,
		},
		default: 0.5,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	game.settings.register(MODULE.ID, 'tokenRotationMode', {
		name: MODULE.ID + '.tokenRotationMode-Label',
		hint: MODULE.ID + '.tokenRotationMode-Hint',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		choices: {
			'all': 'All Tokens',
			'playerOnly': 'Player Tokens Only',
			'npcOnly': 'NPC Tokens Only',
			'combatOnly': 'Combat Tokens Only'
		},
		default: 'all',	
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// --------------------------------------
	// -- H3: Token Movement
	// --------------------------------------
	registerHeader('TokenMovementOptions', 'headingH3TokenMovementOptions-Label', 'headingH3TokenMovementOptions-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- Follow Movement Type - HIDDEN SETTING --
	game.settings.register(MODULE.ID, 'movementType', {
		name: MODULE.ID + '.movementType-Label',
		hint: MODULE.ID + '.movementType-Hint',
		scope: 'world',
		config: false,
		type: String,
		default: 'normal-movement',
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Follow Distance Threshold --
	game.settings.register(MODULE.ID, 'movementFollowDistanceThreshold', {
		name: MODULE.ID + '.movementFollowDistanceThreshold-Label',
		hint: MODULE.ID + '.movementFollowDistanceThreshold-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: Number,
		range: {
			min: 8,
			max: 20,
			step: 1,
		},
		default: 10,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Token Spacing --
	game.settings.register(MODULE.ID, 'tokenSpacing', {
		name: MODULE.ID + '.tokenSpacing-Label',
		hint: MODULE.ID + '.tokenSpacing-Hint',
		hint: 'Number of grid spaces to maintain between tokens in formation',
		scope: 'world',
		config: true,
		type: Number,
		range: {
			min: 0,
			max: 3,
			step: 1,
		},
		default: 0,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Movement Type - HIDDEN SETTING --
	game.settings.register(MODULE.ID, 'movementType', {
		name: MODULE.ID + '.movementType-Label',
		hint: MODULE.ID + '.movementType-Hint',
		scope: 'world',
		config: false,
		type: String,
		default: 'no-movement',
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Pre-Combat Movement Mode Storage - HIDDEN SETTING --
	game.settings.register(MODULE.ID, 'preCombatMovementMode', {
		type: String,
		config: false,
		scope: 'world',
		default: null,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// --------------------------------------
	// -- H3: Token Sound
	// --------------------------------------
	registerHeader('TokenMovementSounds', 'headingH3TokenMovementSounds-Label', 'headingH3TokenMovementSounds-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// Enable Movement Sounds
	game.settings.register(MODULE.ID, 'movementSoundsEnabled', {
		name: MODULE.ID + '.movementSoundsEnabled-Label',
		hint: MODULE.ID + '.movementSoundsEnabled-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Player Movement Sound
	game.settings.register(MODULE.ID, 'movementSoundPlayer', {
		name: MODULE.ID + '.movementSoundPlayer-Label',
		hint: MODULE.ID + '.movementSoundPlayer-Hint',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'SOUNDEFFECTGENERAL01', // Rustling Grass
		choices: BLACKSMITH.arrSoundChoices,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Monster Movement Sound
	game.settings.register(MODULE.ID, 'movementSoundMonster', {
		name: MODULE.ID + '.movementSoundMonster-Label',
		hint: MODULE.ID + '.movementSoundMonster-Hint',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'SOUNDEFFECTGENERAL06', // Clatter
		choices: BLACKSMITH.arrSoundChoices,	
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Movement Sound Volume
	game.settings.register(MODULE.ID, 'movementSoundVolume', {
		name: MODULE.ID + '.movementSoundVolume-Label',
		hint: MODULE.ID + '.movementSoundVolume-Hint',
		type: Number,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 0.3,
		range: {
			min: 0.0,
			max: 1.0,
			step: 0.1
		},
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Movement Sound Distance Threshold
	game.settings.register(MODULE.ID, 'movementSoundDistanceThreshold', {
		name: MODULE.ID + '.movementSoundDistanceThreshold-Label',
		hint: MODULE.ID + '.movementSoundDistanceThreshold-Hint',
		type: Number,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 5,
		range: {
			min: 1,
			max: 50,
			step: 1
		},
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// --------------------------------------
	// -- H2: DEAD TOKENS
	// --------------------------------------
	registerHeader('DeadTokens', 'headingH2DeadTokens-Label', 'headingH2DeadTokens-Hint', 'H2', WORKFLOW_GROUPS.AUTOMATION);

	// --------------------------------------
	// -- H3: Dead Configuration
	// --------------------------------------
	registerHeader('DeadConfiguration', 'headingH3DeadConfiguration-Label', 'headingH3DeadConfiguration-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// Enable Dead Token Replacement
	game.settings.register(MODULE.ID, 'enableDeadTokenReplacement', {
		name: MODULE.ID + '.enableDeadTokenReplacement-Label',
		hint: MODULE.ID + '.enableDeadTokenReplacement-Hint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Dead Token Creature Type Filter
	game.settings.register(MODULE.ID, 'deadTokenCreatureTypeFilter', {
		name: MODULE.ID + '.deadTokenCreatureTypeFilter-Label',
		hint: MODULE.ID + '.deadTokenCreatureTypeFilter-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '',
		requiresReload: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	
	// --------------------------------------
	// -- H3: Dead Experience
	// --------------------------------------
	registerHeader('DeadExperience', 'headingH3DeadExperience-Label', 'headingH3DeadExperience-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// Dead Token Image Path (NPC/Monster)
	game.settings.register(MODULE.ID, 'deadTokenImagePath', {
		name: MODULE.ID + '.deadTokenImagePath-Label',
		hint: MODULE.ID + '.deadTokenImagePath-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-npc.webp',
		requiresReload: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	game.settings.register(MODULE.ID, 'deadTokenSoundNPC', {
		name: MODULE.ID + '.deadTokenSoundNPC-Label',
		hint: MODULE.ID + '.deadTokenSoundNPC-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none",
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Dead Token Image Path (Player Character)
	game.settings.register(MODULE.ID, 'deadTokenImagePathPC', {
		name: MODULE.ID + '.deadTokenImagePathPC-Label',
		hint: MODULE.ID + '.deadTokenImagePathPC-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-pc.webp',
		requiresReload: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	game.settings.register(MODULE.ID, 'deadTokenSoundPC', {
		name: MODULE.ID + '.deadTokenSoundPC-Label',
		hint: MODULE.ID + '.deadTokenSoundPC-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none",
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	
	game.settings.register(MODULE.ID, 'deadTokenSoundStable', {
		name: MODULE.ID + '.deadTokenSoundStable-Label',
		hint: MODULE.ID + '.deadTokenSoundStable-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none",
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// --------------------------------------
	// -- H2: CONVERT DEAD TO LOOT 
	// --------------------------------------
	registerHeader('LootTokens', 'headingH2LootTokens-Label', 'headingH2LootTokens-Hint', 'H2', WORKFLOW_GROUPS.AUTOMATION);

	// --------------------------------------
	// -- H3: Loot Configuration
	// --------------------------------------
	registerHeader('LootConfiguration', 'headingH3LootConfiguration-Label', 'headingH3LootConfiguration-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- CONVERT DEAD TO LOOT --
	game.settings.register(MODULE.ID, 'tokenConvertDeadToLoot', {
		name: MODULE.ID + '.tokenConvertDeadToLoot-Label',
		hint: MODULE.ID + '.tokenConvertDeadToLoot-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Loot Delay --
	game.settings.register(MODULE.ID,"tokenConvertDelay", {
		name: MODULE.ID + '.tokenConvertDelay-Label',
		hint: MODULE.ID + '.tokenConvertDelay-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: Number,
		range: {
		min: 5,
		max: 60,
		step: 1,
		},
		default: 10,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Loot Pile Image --
	game.settings.register(MODULE.ID, 'tokenLootPileImage', {
		name: MODULE.ID + '.tokenLootPileImage-Label',
		hint: MODULE.ID + '.tokenLootPileImage-Hint',
        scope: 'world',
        config: true,
        type: String,
		requiresReload: false,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/splat-round-loot-sack.webp',
		group: WORKFLOW_GROUPS.AUTOMATION
    });

	// -- Loot Sound --
	game.settings.register(MODULE.ID, 'tokenLootSound', {
		name: MODULE.ID + '.tokenLootSound-Label',
		hint: MODULE.ID + '.tokenLootSound-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
        choices: BLACKSMITH.arrSoundChoices,
		default: 'modules/coffee-pub-blacksmith/sounds/clatter.mp3',
		group: WORKFLOW_GROUPS.AUTOMATION
    });

	// -- Loot Chat Message --
	game.settings.register(MODULE.ID, 'tokenLootChatMessage', {
		name: MODULE.ID + '.tokenLootChatMessage-Label',
		hint: MODULE.ID + '.tokenLootChatMessage-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// --------------------------------------
	// -- H3: Loot Treasure
	// --------------------------------------
	registerHeader('LootTreasure', 'headingH3LootTreasure-Label', 'headingH3LootTreasure-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- General Loot Table --
	game.settings.register(MODULE.ID,'tokenLootTableGeneral', {
		name: MODULE.ID + '.tokenLootTableGeneral-Label',
		hint: MODULE.ID + '.tokenLootTableGeneral-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		default: '-- Choose a General Loot Table --',
		choices: BLACKSMITH.arrTableChoices,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- General Loot Amount --
	game.settings.register(MODULE.ID,"tokenLootTableGeneralAmount", {
		name: MODULE.ID + '.tokenLootTableGeneralAmount-Label',
		hint: MODULE.ID + '.tokenLootTableGeneralAmount-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 10,
		step: 1,
		},
		default: 3,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Gear Loot Table --
	game.settings.register(MODULE.ID,'tokenLootTableGear', {
		name: MODULE.ID + '.tokenLootTableGear-Label',
		hint: MODULE.ID + '.tokenLootTableGear-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		default: '-- Choose a Gear Loot Table --',
		choices: BLACKSMITH.arrTableChoices,
		group: WORKFLOW_GROUPS.AUTOMATION
	});
	
	// -- Gear Loot Amount --
	game.settings.register(MODULE.ID,"tokenLootTableGearAmount", {
		name: MODULE.ID + '.tokenLootTableGearAmount-Label',
		hint: MODULE.ID + '.tokenLootTableGearAmount-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 10,
		step: 1,
		},
		default: 2,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Treasure Loot Table --
	game.settings.register(MODULE.ID,'tokenLootTableTreasure', {
		name: MODULE.ID + '.tokenLootTableTreasure-Label',
		hint: MODULE.ID + '.tokenLootTableTreasure-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		default: '-- Choose a Treasure Table --',
		choices: BLACKSMITH.arrTableChoices,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Treasure Loot Amount --
	game.settings.register(MODULE.ID,"tokenLootTableTreasureAmount", {
		name: MODULE.ID + '.tokenLootTableTreasureAmount-Label',
		hint: MODULE.ID + '.tokenLootTableTreasureAmount-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 10,
		step: 1,
		},
		default: 1,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// --------------------------------------
	// -- H2: DROPPED TOKENS
	// --------------------------------------
	registerHeader('DroppedTokens', 'headingH2DroppedTokens-Label', 'headingH2DroppedTokens-Hint', 'H2', WORKFLOW_GROUPS.AUTOMATION);

	// --------------------------------------
	// -- H3: Token Movement Overrides
	// --------------------------------------
	registerHeader('TokenOverrides', 'headingH3TokenOverrides-Label', 'headingH3TokenOverrides-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- Unlock Token Rotation --
	game.settings.register(MODULE.ID, 'unlockTokenRotation', {
		name: MODULE.ID + '.unlockTokenRotation-Label',
		hint: MODULE.ID + '.unlockTokenRotation-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Disable Token Ring --
	game.settings.register(MODULE.ID, 'disableTokenRing', {
		name: MODULE.ID + '.disableTokenRing-Label',
		hint: MODULE.ID + '.disableTokenRing-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Set Token Scale --
	game.settings.register(MODULE.ID,'setTokenScale', {
		name: MODULE.ID + '.setTokenScale-Label',
		hint: MODULE.ID + '.setTokenScale-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: Number,
		range: {
		min: 0.2,
		max: 3,
		step: 0.1,
		},
		default: 1,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Fit Mode --
	game.settings.register(MODULE.ID, 'setTokenImageFitMode', {
		name: MODULE.ID + '.setTokenImageFitMode-Label',
		hint: MODULE.ID + '.setTokenImageFitMode-Hint',
		type: String,
		choices: {
			"fill": "Fill",
			"contain": "Contain",
			"cover": "Cover",
			"fullwidth": "Full Width",
			"fullheight": "Full Height"
		},
		config: true,
		scope: 'world',
		default: "contain",
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// --------------------------------------
	// -- H3: Nameplate Style
	// --------------------------------------
	registerHeader('TokenRenamingOptions', 'headingH3TokenRenamingOptions-Label', 'headingH3TokenRenamingOptions-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);
	
	// -- Name Format --
	game.settings.register(MODULE.ID, 'tokenNameFormat', {
		name: MODULE.ID + '.tokenNameFormat-Label',
		hint: MODULE.ID + '.tokenNameFormat-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'none',
		choices: nameplateChoices,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Ignored Tokens --
	game.settings.register(MODULE.ID, 'ignoredTokens', {
		name: MODULE.ID + '.ignoredTokens-Label',
		hint: MODULE.ID + '.ignoredTokens-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Fuzzy Match --
	game.settings.register(MODULE.ID, 'fuzzyMatch', {
		name: MODULE.ID + '.fuzzyMatch-Label',
		hint: MODULE.ID + '.fuzzyMatch-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Rename Table --
	game.settings.register(MODULE.ID, 'tokenNameTable', {
		name: MODULE.ID + '.tokenNameTable-Label',
		hint: MODULE.ID + '.tokenNameTable-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: '-- Select A Table for Names --',
		choices: BLACKSMITH.arrTableChoices,
		group: WORKFLOW_GROUPS.AUTOMATION
	});



	// --------------------------------------
	// -- H3: Nameplate Style
	// --------------------------------------
	registerHeader('TokenNameplateStyle', 'headingH3TokenNameplateStyle-Label', 'headingH3TokenNameplateStyle-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- Font Family --
	game.settings.register(MODULE.ID,'nameplateFontFamily', {
		name: MODULE.ID + '.nameplateFontFamily-Label',
		hint: MODULE.ID + '.nameplateFontFamily-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: String,
		default: 'Signika',
		choices: {
			'Signika': 'Signika (Default)',
			'Arial': 'Arial',
			'IM Fell English': 'IM Fell English',
			'Tahoma': 'Tahoma',
			'Verdana': 'Verdana',
			'Georgia': 'Georgia',
			'Impact': 'Impact',
			'Roboto': 'Roboto',
		},
		group: WORKFLOW_GROUPS.AUTOMATION
	});
	// -- Font Size --
	game.settings.register(MODULE.ID,'nameplateFontSize', {
		name: MODULE.ID + '.nameplateFontSize-Label',
		hint: MODULE.ID + '.nameplateFontSize-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 5,
		max: 70,
		step: 1,
		},
		default: 24,
		group: WORKFLOW_GROUPS.AUTOMATION
	});
	// -- Nameplate color --
	game.settings.register(MODULE.ID, 'nameplateColor', {
		name: MODULE.ID + '.nameplateColor-Label',
		hint: MODULE.ID + '.nameplateColor-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: String,
		default: '#FFFFFF',
		group: WORKFLOW_GROUPS.AUTOMATION
	});
	// -- Outline Size --
	game.settings.register(MODULE.ID,'nameplateOutlineSize', {
		name: MODULE.ID + '.nameplateOutlineSize-Label',
		hint: MODULE.ID + '.nameplateOutlineSize-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 20,
		step: 1,
		},
		default: 2,
		group: WORKFLOW_GROUPS.AUTOMATION
	});
	// -- Nameplate Outline color --
	game.settings.register(MODULE.ID, 'nameplateOutlineColor', {
		name: MODULE.ID + '.nameplateOutlineColor-Label',
		hint: MODULE.ID + '.nameplateOutlineColor-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: String,
		default: '#111111',
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// --------------------------------------
	// -- H3: Image Replacement
	// --------------------------------------
	registerHeader('TokenImageReplacement', 'headingH3TokenImageReplacement-Label', 'headingH3TokenImageReplacement-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- Enable Overall Image Replacement Features --
	game.settings.register(MODULE.ID, 'tokenImageReplacementEnabled', {
		name: MODULE.ID + '.tokenImageReplacementEnabled-Label',
		hint: MODULE.ID + '.tokenImageReplacementEnabled-Hint',
		type: Boolean,
	config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	
	game.settings.register(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', {
		name: MODULE.ID + '.tokenImageReplacementShowInCoffeePubToolbar-Label',
		hint: MODULE.ID + '.tokenImageReplacementShowInCoffeePubToolbar-Hint',
		type: Boolean,
	config: true,
	requiresReload: false,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', {
		name: MODULE.ID + '.tokenImageReplacementShowInFoundryToolbar-Label',
		hint: MODULE.ID + '.tokenImageReplacementShowInFoundryToolbar-Hint',
		type: Boolean,
	config: true,
	requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// Update Dropped Tokens
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateDropped', {
		name: MODULE.ID + '.tokenImageReplacementUpdateDropped-Label',
		hint: MODULE.ID + '.tokenImageReplacementUpdateDropped-Hint',
	type: Boolean,
	config: true,
	requiresReload: false,
	scope: 'world',
	default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Matching Threshold
	game.settings.register(MODULE.ID, 'tokenImageReplacementThreshold', {
		name: MODULE.ID + '.tokenImageReplacementThreshold-Label',
		hint: MODULE.ID + '.tokenImageReplacementThreshold-Hint',
		type: Number,
	config: true,
	requiresReload: false,
		scope: 'world',
		range: {
			min: 0.1,
			max: 1.0,
			step: 0.05
		},
		default: 0.3,
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// Update Monsters
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateMonsters', {
		name: MODULE.ID + '.tokenImageReplacementUpdateMonsters-Label',
		hint: MODULE.ID + '.tokenImageReplacementUpdateMonsters-Hint',
	type: Boolean,
	config: true,
	requiresReload: false,
	scope: 'world',
	default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Update NPCs
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateNPCs', {
		name: MODULE.ID + '.tokenImageReplacementUpdateNPCs-Label', 
		hint: MODULE.ID + '.tokenImageReplacementUpdateNPCs-Hint',
	type: Boolean,
	config: true,
	requiresReload: false,
	scope: 'world',
	default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Update Vehicles
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateVehicles', {
		name: MODULE.ID + '.tokenImageReplacementUpdateVehicles-Label',
		hint: MODULE.ID + '.tokenImageReplacementUpdateVehicles-Hint',
	type: Boolean,
	config: true,
	requiresReload: false,
	scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Update Actors
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateActors', {
		name: MODULE.ID + '.tokenImageReplacementUpdateActors-Label',
		hint: MODULE.ID + '.tokenImageReplacementUpdateActors-Hint',
		type: Boolean,
	config: true,
	requiresReload: false,
	scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Skip Linked Tokens
	game.settings.register(MODULE.ID, 'tokenImageReplacementSkipLinked', {
		name: MODULE.ID + '.tokenImageReplacementSkipLinked-Label',
		hint: MODULE.ID + '.tokenImageReplacementSkipLinked-Hint',
		type: Boolean,
	config: true,
	requiresReload: false,
	scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});



	// --------------------------------------
	// -- H2: Image Replacement Cache
	// --------------------------------------
	registerHeader('TokenImageReplacementCache', 'headingH2TokenImageReplacementCache-Label', 'headingH2TokenImageReplacementCache-Hint', 'H2', WORKFLOW_GROUPS.AUTOMATION);

	// Token Image Replacement Cache (server-side storage) - HIDDEN SETTING
	game.settings.register(MODULE.ID, 'tokenImageReplacementCache', {
		scope: 'world',
		config: false, // Hidden from users - internal use only
		type: String,
		default: '',
		requiresReload: false
	});


	// TOKEN IMAGE REPLACEMENT WINDOW STATE - HIDDEN SETTING
	game.settings.register(MODULE.ID, 'tokenImageReplacementWindowState', {
		scope: 'client',
		config: false,
		type: Object,
		default: {},
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// Cache Status - HIDDEN SETTING
	game.settings.register(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus', {
		scope: 'world',
		config: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Cache Stats
	game.settings.register(MODULE.ID, "headingH4tokenImageReplacementCacheStats", {
		name: MODULE.ID + '.tokenImageReplacementCacheStats-Label',
		hint: getTokenImageReplacementCacheStats() + ". (Updated on client load and cache operations)", 
		scope: "world",
		config: true,
		default: "",
		type: String,
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	
	// --------------------------------------
	// -- H3: Image Replacement Configuration
	// --------------------------------------
	registerHeader('TokenImageReplacementConfiguration', 'headingH3TokenImageReplacementConfiguration-Label', 'headingH3TokenImageReplacementConfiguration-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// Image Replacement Folder
	game.settings.register(MODULE.ID, 'tokenImageReplacementPath', {
		name: MODULE.ID + '.tokenImageReplacementPath-Label',
		hint: MODULE.ID + '.tokenImageReplacementPath-Hint',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: '',
		onChange: (value) => {
			// Trigger cache rebuild when path changes
			if (value && game.modules.get(MODULE.ID)?.active) {
				// We'll implement this in Phase 2
				console.log('Token image replacement path changed to:', value);
			}
		},
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// IGNORED FOLDERS 
	game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredFolders', {
		name: MODULE.ID + '.tokenImageReplacementIgnoredFolders-Label',
		hint: MODULE.ID + '.tokenImageReplacementIgnoredFolders-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '.DS_Store',
		requiresReload: true
	});

	// Automatically Update Image Cache
	game.settings.register(MODULE.ID, 'tokenImageReplacementAutoUpdate', {
		name: MODULE.ID + '.tokenImageReplacementAutoUpdate-Label',
		hint: MODULE.ID + '.tokenImageReplacementAutoUpdate-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Deprioritized Words
	game.settings.register(MODULE.ID, 'tokenImageReplacementDeprioritizedWords', {
		name: MODULE.ID + '.tokenImageReplacementDeprioritizedWords-Label',
		hint: MODULE.ID + '.tokenImageReplacementDeprioritizedWords-Hint',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'spirit',
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Ignored Words (File Exclusion)
	game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredWords', {
		name: MODULE.ID + '.tokenImageReplacementIgnoredWords-Label',
		hint: MODULE.ID + '.tokenImageReplacementIgnoredWords-Hint',
		scope: 'world',
		config: true,
		type: String,
		default: '',
		requiresReload: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// --------------------------------------
	// -- H3: Image Replacement Display
	// --------------------------------------
	registerHeader('TokenImageReplacementDisplay', 'headingH3TokenImageReplacementDisplay-Label', 'headingH3TokenImageReplacementDisplay-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// Cateogry Style
	game.settings.register(MODULE.ID, 'tokenImageReplacementCategoryStyle', {
		name: MODULE.ID + '.tokenImageReplacementCategoryStyle-Label',
		hint: MODULE.ID + '.tokenImageReplacementCategoryStyle-Hint',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			'buttons': 'Buttons',
			'tabs': 'Tabs'
		},
		default: 'buttons',
		requiresReload: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Tag Sort Mode
	game.settings.register(MODULE.ID, 'tokenImageReplacementTagSortMode', {
		name: MODULE.ID + '.tokenImageReplacementTagSortMode-Label',
		hint: MODULE.ID + '.tokenImageReplacementTagSortMode-Hint',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			'count': 'Count (by frequency)',
			'alpha': 'Alpha (alphabetical)',
			'hidden': 'Hidden (hide tags)'
		},
		default: 'count',
		requiresReload: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Fuzzy Search
	game.settings.register(MODULE.ID, 'tokenImageReplacementFuzzySearch', {
		name: MODULE.ID + '.tokenImageReplacementFuzzySearch-Label',
		hint: MODULE.ID + '.tokenImageReplacementFuzzySearch-Hint',
		type: Boolean,
		config: true, // Hidden setting - controlled by UI toggle
		requiresReload: false,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// --------------------------------------
	// -- H3: Image Replacement Data Weights
	// --------------------------------------
	registerHeader('TokenImageReplacementDataWeights', 'headingH3TokenImageReplacementDataWeights-Label', 'headingH3TokenImageReplacementDataWeights-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);


	// Monster Mapping Data - HIDDEN SETTING
	game.settings.register(MODULE.ID, 'targetedIndicatorEnabled', {
		type: Object,
		config: false,
		scope: 'world',
		default: {},
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Actor Name Weight (NEW - most important for clean creature names)
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightActorName', {
		name: MODULE.ID + '.tokenImageReplacementWeightActorName-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightActorName-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 90,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	
	// Token Name Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightTokenName', {
		name: MODULE.ID + '.tokenImageReplacementWeightTokenName-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightTokenName-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 70,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Represented Actor Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor', {
		name: MODULE.ID + '.tokenImageReplacementWeightRepresentedActor-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightRepresentedActor-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 50,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Creature Type Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureType', {
		name: MODULE.ID + '.tokenImageReplacementWeightCreatureType-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightCreatureType-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 15,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Creature Subtype Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype', {
		name: MODULE.ID + '.tokenImageReplacementWeightCreatureSubtype-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightCreatureSubtype-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 15,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Equipment Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightEquipment', {
		name: MODULE.ID + '.tokenImageReplacementWeightEquipment-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightEquipment-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 10,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// Size Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightSize', {
		name: MODULE.ID + '.tokenImageReplacementWeightSize-Label',
		hint: MODULE.ID + '.tokenImageReplacementWeightSize-Hint',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 3,
		group: WORKFLOW_GROUPS.AUTOMATION
	});


	// --------------------------------------
	// -- H2: Encounters
	// --------------------------------------
	registerHeader('AutomatedEncounters', 'headingH2AutomatedEncounters-Label', 'headingH2AutomatedEncounters-Hint', 'H2', WORKFLOW_GROUPS.AUTOMATION);

	// --------------------------------------
	// -- H3: Journal Toolbar
	// --------------------------------------
	registerHeader('JournalEncounterToolbar', 'headingH3JournalEncounterToolbar-Label', 'headingH3JournalEncounterToolbar-Hint', 'H3', WORKFLOW_GROUPS.AUTOMATION);

	// -- Enable Journal Encounter Toolbar --
	game.settings.register(MODULE.ID, 'enableJournalEncounterToolbar', {
		name: MODULE.ID + '.enableJournalEncounterToolbar-Label',
		hint: MODULE.ID + '.enableJournalEncounterToolbar-Hint',
		type: Boolean,
		config: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Content Scanning --
	game.settings.register(MODULE.ID, 'enableEncounterContentScanning', {
		name: MODULE.ID + '.enableEncounterContentScanning-Label',
		hint: MODULE.ID + '.enableEncounterContentScanning-Hint',
		type: Boolean,
		config: true,
		scope: 'world',
		default: true,
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Real-time CR Updates --
	game.settings.register(MODULE.ID, 'enableJournalEncounterToolbarRealTimeUpdates', {
		name: MODULE.ID + '.enableJournalEncounterToolbarRealTimeUpdates-Label',
		hint: MODULE.ID + '.enableJournalEncounterToolbarRealTimeUpdates-Hint',
		type: Boolean,
		config: true,
		scope: 'world',
		default: true,	
		group: WORKFLOW_GROUPS.AUTOMATION
	});



	// -- Deployment Pattern --
	game.settings.register(MODULE.ID, 'encounterToolbarDeploymentPattern', {
		name: MODULE.ID + '.encounterToolbarDeploymentPattern-Label',
		hint: MODULE.ID + '.encounterToolbarDeploymentPattern-Hint',
		type: String,
		choices: {
			"circle": "Circle Formation",
			"line": "Line Formation",
			"scatter": "Scatter Positioning",
			"grid": "Grid Positioning",
			"sequential": "Sequential Positioning"
		},
		config: true,
		scope: 'world',
		default: "grid",
		group: WORKFLOW_GROUPS.AUTOMATION
	});

	// -- Deployment Hidden --
	game.settings.register(MODULE.ID, 'encounterToolbarDeploymentHidden', {
		name: MODULE.ID + '.encounterToolbarDeploymentHidden-Label',
		hint: MODULE.ID + '.encounterToolbarDeploymentHidden-Hint',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
		group: WORKFLOW_GROUPS.AUTOMATION
	});





	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == Artifical Intelligence
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('ArtificialIntelligence', 'headingH1ArtificialIntelligence-Label', 'headingH1ArtificialIntelligence-Hint', 'H1', WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE);

	// --------------------------------------
	// -- H3: Open AI Core
	// --------------------------------------
	registerHeader('OpenAICore', 'headingH3headingH2OpenAICore-Label', 'headingH3headingH2OpenAICore-Hint', 'H3', WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE);

	// -- OPENAI MACRO --
	game.settings.register(MODULE.ID,'openAIMacro', {
		name: MODULE.ID + '.openAIMacro-Label',
		hint: MODULE.ID + '.openAIMacro-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		default: '-- Choose a Macro --',
		choices: BLACKSMITH.arrMacroChoices,
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});

	// -- API KEY --
	game.settings.register(MODULE.ID, 'openAIAPIKey', {
		name: MODULE.ID + '.openAIAPIKey-Label',
		hint: MODULE.ID + '.openAIAPIKey-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});

	// -- PROJECT ID --
	game.settings.register(MODULE.ID, 'openAIProjectId', {
		name: MODULE.ID + '.openAIProjectId-Label',
		hint: MODULE.ID + '.openAIProjectId-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: '',
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});


	// -- MODEL --
	game.settings.register(MODULE.ID, 'openAIModel', {
		name: MODULE.ID + '.openAIModel-Label',
		hint: MODULE.ID + '.openAIModel-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'gpt-4-turbo-preview',
		choices: {
			'gpt-4-turbo-preview': 'GPT-4 Turbo (Latest: Best for D&D, 128K tokens)',
			'gpt-4': 'GPT-4 (8,192 tokens)',
			'gpt-3.5-turbo': 'GPT-3.5 Turbo (16K tokens)',
		},
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});


	// --------------------------------------
	// -- H3: Open AI Context
	// --------------------------------------
	registerHeader('OpenAIContext', 'headingH3headingH2OpenAIContext-Label', 'headingH3headingH2OpenAIContext-Hint', 'H3', WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE);

	// -- GAME SYSTEMS -- IS THIS USED??
	game.settings.register(MODULE.ID, 'openAIGameSystems', {
		name: MODULE.ID + '.openAIGameSystems-Label',
		hint: MODULE.ID + '.openAIGameSystems-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'dnd5e',
		choices: gameSystemChoices,
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});

	// -- PROMPT --
	game.settings.register(MODULE.ID, 'openAIPrompt', {
		name: MODULE.ID + '.openAIPrompt-Label',
		hint: MODULE.ID + '.openAIPrompt-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: genericPrompt + " " + formatPrompt,
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE 
	});

	// -- CONTEXT LENGTH --
	game.settings.register(MODULE.ID,'openAIContextLength', {
		name: MODULE.ID + '.openAIContextLength-Label',
		hint: MODULE.ID + '.openAIContextLength-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
			min: 0,
			max: 100,
			step: 5,
		},
		default: 10,
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});

	// -- TEMPERATURE --
	game.settings.register(MODULE.ID,'openAITemperature', {
		name: MODULE.ID + '.openAITemperature-Label',
		hint: MODULE.ID + '.openAITemperature-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
			min: 0,
			max: 2,
			step: .1,
		},
		default: 1,
		group: WORKFLOW_GROUPS.ARTIFICIAL_INTELLIGENCE
	});

	// ==================================================================================================================== 
	// ==================================================================================================================== 
	// == H1: DEVELOPER TOOLS
	// ==================================================================================================================== 
	// ==================================================================================================================== 
	registerHeader('DeveloperTools', 'headingH1DeveloperTools-Label', 'headingH1DeveloperTools-Hint', 'H1', WORKFLOW_GROUPS.DEVELOPER_TOOLS);

	// --------------------------------------
	// -- H2: CSS CUSTOMIZATION
	// --------------------------------------
	registerHeader('CSS', 'headingH2CSS-Label', 'headingH2CSS-Hint', 'H2', WORKFLOW_GROUPS.DEVELOPER_TOOLS);

	game.settings.register(MODULE.ID, "customCSS", {
		scope: "world",
		config: false,
		type: String,
		default: "",
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	game.settings.register(MODULE.ID, "cssTransition", {
		name: MODULE.ID + ".cssTransition-Label",
		hint: MODULE.ID + ".cssTransition-Hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	game.settings.register(MODULE.ID, "cssDarkMode", {
		name: MODULE.ID + ".cssDarkMode-Label",
		hint: MODULE.ID + ".cssDarkMode-Hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});


	// --------------------------------------
	// -- H2: PERFORMANCE TOOLS
	// --------------------------------------
	registerHeader('PerformanceTools', 'headingH2PerformanceTools-Label', 'headingH2PerformanceTools-Hint', 'H2', WORKFLOW_GROUPS.DEVELOPER_TOOLS);

	// -- H3: PERFORMANCE MENUBAR OPTIONS ---------------
	registerHeader('PerformanceMenubarOptions', 'headingH3PerformanceMenubarOptions-Label', 'headingH3PerformanceMenubarOptions-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);


	// Show Settings Tool
	game.settings.register(MODULE.ID, 'menubarShowSettings', {
		name: MODULE.ID + '.menubarShowSettings-Label',
		hint: MODULE.ID + '.menubarShowSettings-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// Show Refresh Tool
	game.settings.register(MODULE.ID, 'menubarShowRefresh', {
		name: MODULE.ID + '.menubarShowRefresh-Label',
		hint: MODULE.ID + '.menubarShowRefresh-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// Show Performance Monitor Tool
	game.settings.register(MODULE.ID, 'menubarShowPerformance', {
		name: MODULE.ID + '.menubarShowPerformance-Label',
		hint: MODULE.ID + '.menubarShowPerformance-Hint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// Performance Monitor Poll Interval
	game.settings.register(MODULE.ID, 'menubarPerformancePollInterval', {
		name: MODULE.ID + '.menubarPerformancePollInterval-Label',
		hint: MODULE.ID + '.menubarPerformancePollInterval-Hint',
		scope: 'client',
		config: true,
		type: Number,
		default: 5,
		range: {
			min: 5,
			max: 300,
			step: 5
		},
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// -- H3: LATENCY SETTINGS ---------------
	registerHeader('Latency', 'headingH3Latency-Label', 'headingH3Latency-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);

	game.settings.register(MODULE.ID, 'enableLatency', {
		name: MODULE.ID + '.enableLatency-Label',
		hint: MODULE.ID + '.enableLatency-Hint',
		type: Boolean,
		scope: 'world',
		config: true,
		default: true,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	game.settings.register(MODULE.ID, 'latencyCheckInterval', {
		name: MODULE.ID + '.latencyCheckInterval-Label',
		hint: MODULE.ID + '.latencyCheckInterval-Hint',
		type: Number,
		scope: 'world',
		config: true,
		range: {
			min: 5,
			max: 300,
			step: 5
		},
		default: 30,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// --------------------------------------
	// -- H2: CONSOLE SETTINGS
	// --------------------------------------
	registerHeader('ConsoleSettings', 'headingH2ConsoleSettings-Label', 'headingH2ConsoleSettings-Hint', 'H2', WORKFLOW_GROUPS.DEVELOPER_TOOLS);


	// -- H3: CONSOLE SETTINGS ---------------
	registerHeader('Console', 'headingH3Console-Label', 'headingH3Console-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);
	// -------------------------------------

	// -- LOG FANCY CONSOLE --
	game.settings.register(MODULE.ID, 'globalFancyConsole', {
		name: MODULE.ID + '.globalFancyConsole-Label',
		hint: MODULE.ID + '.globalFancyConsole-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'client',
		default: true,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// -- H3: DEBUG SETTINGS ---------------
	registerHeader('DebugSettings', 'headingH3DebugSettings-Label', 'headingH3DebugSettings-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);

	// -- LOG DEBUG SETTINGS --
	game.settings.register(MODULE.ID, 'globalDebugMode', {
		name: MODULE.ID + '.globalDebugMode-Label',
		hint: MODULE.ID + '.globalDebugMode-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'client',
		default: false,
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// -- LOG DEBUG STYLE--
	game.settings.register(MODULE.ID, 'globalConsoleDebugStyle', {
		name: MODULE.ID + '.globalConsoleDebugStyle-Label',
		hint: MODULE.ID + '.globalConsoleDebugStyle-Hint',
		type: String,
		config: true,
		requiresReload: true,
		scope: 'client',
		default: "fancy",
		choices: {
			'fancy': 'Fancy Pants: Large Font and Boxes',
			'simple': 'Simply Delightful: Colorful Text and Variables',
			'plain': 'Boring and Lame: Default console styles',
		},
		group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
	});

	// Build selected compendium arrays after all settings are registered
	buildSelectedCompendiumArrays();

} // END OF "export const registerSettings"
