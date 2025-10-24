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
    AUTOMATION_AND_AI: 'automation-and-ai',
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
function getTokenImageReplacementCacheStats() {
	// Read the current cache status from the setting
	const strCacheStatus = game.settings.get(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus');
	
	if(strCacheStatus) {
		return strCacheStatus;
	} else {
		return "Cache not initialized";
	}
}

// -- COMPENDIUM CHOICES  --
function getCompendiumChoices() {
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
            label: label
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

    BLACKSMITH.updateValue('arrCompendiumChoices', choices);
    // Make the array available to these settings.
    return choices;
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

// ================================================================== 
// ===== SETTINGS ===================================================
// ================================================================== 

//export const registerSettings = () => {
export const registerSettings = async () => {
    // Settings registration function - called during the 'ready' phase when Foundry is ready

    // Build the Dropdown choices
    getCompendiumChoices();
    getTableChoices();
    getMacroChoices();
    getBackgroundImageChoices();
    getIconChoices();
    getSoundChoices();
    const nameplateChoices = getNameplateChoices();
    


		// ================================================================== 
		// == GETTING STARTED 
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('GettingStarted', 'headingH1GettingStarted-Label', 'headingH1GettingStarted-Hint', 'H1', WORKFLOW_GROUPS.GETTING_STARTED);
		// -------------------------------------

		// *** COFFEE PUB MODULES ***
		let moduleStatus = checkInstalledModules();
		

		// ---------- Installed Modules ----------
		game.settings.register(MODULE.ID, "headingH4BlacksmithInstalled", {
			name: "Activated Coffee Pub Modules",
			hint: "The following Coffee Pub modules are activated: " + moduleStatus.activeModules + ". If you don't see a module you are expecting, check to see if you've activated it.",
			scope: "world",
			config: true,
			default: "",
			type: String,
			group: WORKFLOW_GROUPS.GETTING_STARTED
		});
		// -------------------------------------

		// ---------- Missing Modules ----------
		game.settings.register(MODULE.ID, "headingH4BlacksmithMissing", {
			name: "Other Coffee Pub Modules",
			hint: "The following Coffee Pub modules are currently not installed or activated:  " + moduleStatus.missingModules + ".",
			scope: "world",
			config: true,
			default: "",
			type: String,
			group: WORKFLOW_GROUPS.GETTING_STARTED
		});
		// -------------------------------------

		// *** GENERAL SETTINGS ***
		registerHeader('General', 'headingH2General-Label', 'headingH2General-Hint', 'H2', WORKFLOW_GROUPS.GETTING_STARTED);

		




		// ================================================================== 
		// == THEMES AND EXPERIENCE 
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('ThemesAndExperience', 'headingH1ThemesAndExperience-Label', 'headingH1ThemesAndExperience-Hint', 'H1', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);



		// *** THEMES AND EXPERIENCE ***
		registerHeader('Themes', 'headingH2Themes-Label', 'headingH2Themes-Hint', 'H2', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);
		// -------------------------------------

		




		// ================================================================== 
		// == RUN THE GAME
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('RunTheGame', 'headingH1RunTheGame-Label', 'headingH1RunTheGame-Hint', 'H1', WORKFLOW_GROUPS.RUN_THE_GAME);





		// ================================================================== 
		// == MANAGE CONTENT
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('ManageContent', 'headingH1ManageContent-Label', 'headingH1ManageContent-Hint', 'H1', WORKFLOW_GROUPS.MANAGE_CONTENT);





		// ================================================================== 
		// == ROLLING AND PROGRESSION
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('RollingAndProgression', 'headingH1RollingAndProgression-Label', 'headingH1RollingAndProgression-Hint', 'H1', WORKFLOW_GROUPS.ROLLING_AND_PROGRESSION);



			
		// *** XP DISTRIBUTION SETTINGS ***

		// ---------- SUBHEADING ----------
		game.settings.register(MODULE.ID, "headingH2XpDistribution", {
			name: 'XP DISTRIBUTION',
			hint: 'These settings control the automatic XP distribution system that triggers when combat ends.',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Enable XP Distribution --
		game.settings.register(MODULE.ID, 'enableXpDistribution', {
			name: 'Enable XP Distribution',
			hint: 'When enabled, automatically show XP distribution window when combat ends',
			scope: 'world',
			config: true,
			type: Boolean,
			default: true
		});

		// -- Auto-distribute XP --
		game.settings.register(MODULE.ID, 'autoDistributeXp', {
			name: 'Auto-distribute XP',
			hint: 'When enabled, automatically distribute XP without showing the distribution window',
			scope: 'world',
			config: true,
			type: Boolean,
			default: false
		});

		// -- Share XP Results --
		game.settings.register(MODULE.ID, 'shareXpResults', {
			name: 'Share XP Results',
			hint: 'If enabled, XP distribution results will be shared to all players. If disabled, only the GM will see them.',
			scope: 'world',
			config: true,
			type: Boolean,
			default: true
		});

		// -- XP Calculation Method --
		game.settings.register(MODULE.ID, 'xpCalculationMethod', {
			name: 'XP Calculation Method',
			hint: 'Choose the method for calculating XP from monster CR. "Narrative/Goal-Based XP" allows you to enter XP for each player directly.',
			scope: 'world',
			config: true,
			type: String,
			default: 'dnd5e',
			choices: {
				'dnd5e': 'D&D 5e RAW (CR-based XP Calculations)',
				'narrative': 'Narrative/Goal-Based XP (Manual Entry)',
			}
		});

		// -- Party Size Handling --
		game.settings.register(MODULE.ID, 'xpPartySizeHandling', {
			name: 'Party Size Handling',
			hint: 'Choose how XP is divided among the party. "D&D 5e RAW (No Multipliers)" divides total base XP among players (official rules). "House Rules (Scale for Party Size)" applies a party size multiplier to XP awarded (not RAW).',
			scope: 'world',
			config: true,
			type: String,
			default: 'dnd5e',
			choices: {
				'dnd5e': 'D&D 5e RAW (No Multipliers)',
				'multipliers': 'House Rules (Scale for Party Size)'
			}
		});


		// -- Resolution Type XP Multipliers --
		game.settings.register(MODULE.ID, 'xpMultiplierDefeated', {
			name: 'Defeated XP Multiplier',
			hint: 'Multiplier for defeated monsters (Default: 1.0)',
			scope: 'world',
			config: true,
			type: Number,
			default: 1.0,
			range: {
				min: 0,
				max: 3,
				step: 0.05
			}
		});

		game.settings.register(MODULE.ID, 'xpMultiplierNegotiated', {
			name: 'Negotiated XP Multiplier',
			hint: 'Multiplier for negotiated monsters (Default: 1.0)',
			scope: 'world',
			config: true,
			type: Number,
			default: 1.0,
			range: {
				min: 0,
				max: 3,
				step: 0.05
			}
		});

		game.settings.register(MODULE.ID, 'xpMultiplierEscaped', {
			name: 'Escaped XP Multiplier',
			hint: 'Multiplier for monsters that escaped (Default: 1.0)',
			scope: 'world',
			config: true,
			type: Number,
			default: 0.5,
			range: {
				min: 0,
				max: 3,
				step: 0.05
			}
		});

		game.settings.register(MODULE.ID, 'xpMultiplierIgnored', {
			name: 'Ignored XP Multiplier',
			hint: 'Multiplier for ignored monsters (Default: 0.0)',
			scope: 'world',
			config: true,
			type: Number,
			default: 0.0,
			range: {
				min: 0,
				max: 3,
				step: 0.05
			}
		});

		game.settings.register(MODULE.ID, 'xpMultiplierCaptured', {
			name: 'Captured XP Multiplier',
			hint: 'Multiplier for captured monsters (Default: 1.0)',
			scope: 'world',
			config: true,
			type: Number,
			default: 1.0,
			range: {
				min: 0,
				max: 3,
				step: 0.05
			}
		});








		// ================================================================== 
		// == AUTOMATION AND AI
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('AutomationAndAI', 'headingH1AutomationAndAI-Label', 'headingH1AutomationAndAI-Hint', 'H1', WORKFLOW_GROUPS.AUTOMATION_AND_AI);





		// ================================================================== 
		// == DEVELOPER TOOLS
		// ================================================================== 

		// ---------- MAIN SECTION HEADER ----------
		registerHeader('DeveloperTools', 'headingH1DeveloperTools-Label', 'headingH1DeveloperTools-Hint', 'H1', WORKFLOW_GROUPS.DEVELOPER_TOOLS);


		// *** CSS CUSTOMIZATION ***
		registerHeader('CSS', 'headingH3CSS-Label', 'headingH3CSS-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);

		game.settings.register(MODULE.ID, "customCSS", {
			scope: "world",
			config: false,
			type: String,
			default: "",
			group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
		});

		game.settings.register(MODULE.ID, "cssTransition", {
			name: "Smooth Transition",
			hint: "Ease the new css styles into place with a smooth transition",
			scope: "world",
			config: true,
			type: Boolean,
			default: true,
			group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
		});

		game.settings.register(MODULE.ID, "cssDarkMode", {
			name: "Dark Mode",
			hint: "Enable dark mode for the css editor",
			scope: "world",
			config: true,
			type: Boolean,
			default: true,
			group: WORKFLOW_GROUPS.DEVELOPER_TOOLS
		});

		// *** DEBUG SETTINGS ***
		registerHeader('DebugSettings', 'headingH3simpleDebug-Label', 'headingH3simpleDebug-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);
		// -------------------------------------

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





		// *** DEBUG SETTINGS ***
		registerHeader('Debug', 'headingH2Debug-Label', 'headingH2Debug-Hint', 'H2', WORKFLOW_GROUPS.DEVELOPER_TOOLS);
		// -------------------------------------

		// ---------- CONSOLE SETTINGS ----------
		registerHeader('Console', 'headingH3simpleConsole-Label', 'headingH3simpleConsole-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);
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

		// *** LATENCY SETTINGS ***
		registerHeader('Latency', 'headingH3Latency-Label', 'headingH3Latency-Hint', 'H3', WORKFLOW_GROUPS.DEVELOPER_TOOLS);
		// -------------------------------------

		// Latency Settings
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












		// ================================================================== 
		// ===== TEMPORARY DIVIDER - NEW VS OLD ORGANIZATION ===============
		// ================================================================== 
		// *** END OF NEW WORKFLOW-BASED ORGANIZATION ***
		// Everything above this line uses the new helper functions and workflow groups
		// Everything below this line is still using the old organization
		// ================================================================== 

		// *** VISUAL DIVIDER IN SETTINGS ***
		game.settings.register(MODULE.ID, "headingHR", {
			name: "** END OF NEW WORKFLOW **",
			hint: "END OF NEW WORKFLOW-BASED ORGANIZATION - Everything below this line is still using the old organization",
			scope: "world",
			config: true,
			default: "",
			type: String,
		});

		// *** RUN THE GAME ***
		// ---------- FOUNDRY TOOLBAR ----------
		registerHeader('Toolbar', 'headingH2Toolbar-Label', 'headingH2Toolbar-Hint', 'H2', WORKFLOW_GROUPS.RUN_THE_GAME);
		
		// ---------- TOOLBAR DIVIDERS ----------
		game.settings.register(MODULE.ID, "toolbarShowDividers", {
			name: MODULE.ID + '.toolbarShowDividers-Label',
			hint: MODULE.ID + '.toolbarShowDividers-Hint',
			scope: "client",
			config: true,
			default: true,
			type: Boolean,
			group: WORKFLOW_GROUPS.RUN_THE_GAME
		});

		// ---------- TOOLBAR LABELS ----------
		game.settings.register(MODULE.ID, "toolbarShowLabels", {
			name: MODULE.ID + '.toolbarShowLabels-Label',
			hint: MODULE.ID + '.toolbarShowLabels-Hint',
			scope: "client",
			config: true,
			default: false,
			type: Boolean,
			group: WORKFLOW_GROUPS.RUN_THE_GAME
		});

		// ---------- MENUBAR PANEL ----------
		registerHeader('Menubar', 'headingH3simplemenubar-Label', 'headingH3simplemenubar-Hint', 'H3', WORKFLOW_GROUPS.RUN_THE_GAME);

		game.settings.register(MODULE.ID, 'enableMenubar', {
			name: 'Show Blacksmith Panel',
			hint: 'Show the Blacksmith panel in the chat log.',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
			group: WORKFLOW_GROUPS.RUN_THE_GAME
		});

		game.settings.register(MODULE.ID, 'excludedUsersMenubar', {
			name: 'Excluded Menubar Users',
			hint: 'List of userIDs that should not show up as selections in voting, rolls, or other tools. (comma-separated)',
			scope: 'world',
			config: true,
			type: String,
			default: '',
			group: WORKFLOW_GROUPS.RUN_THE_GAME
		});

		// ---------- CHAT ----------
		registerHeader('Chat', 'headingH2Chat-Label', 'headingH2Chat-Hint', 'H2', WORKFLOW_GROUPS.RUN_THE_GAME);
		// -------------------------------------




		// *** THEMES AND EXPERIENCE ***
		// ---------- THEMES ----------
		registerHeader('Themes', 'headingH2Themes-Label', 'headingH2Themes-Hint', 'H2', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);
		// -------------------------------------
		// ---------- SUBHEADING - ENABLE/DISABLE ----------
		registerHeader('ThemeSelections', 'headingH3simpleThemeSelections-Label', 'headingH3simpleThemeSelections-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);
		// -------------------------------------
		
		// Build out the themes based on the js file.
		
		registerThemes();
		// Make them available to other settings.
		
		getThemeChoices();

		// ---------- SUBHEADING - DEFAULT THEME ----------
		registerHeader('ThemeDefault', 'headingH3simpleThemeDefault-Label', 'headingH3simpleThemeDefault-Hint', 'H3', WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE);
		// -------------------------------------

		// -- Default Card Theme --
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

		// -- Party Leader -- 
		game.settings.register(MODULE.ID, 'partyLeader', {
			name: 'Party Leader',
			hint: 'The currently selected party leader',
			scope: 'world',
			config: false,
			type: Object,
			default: { userId: '', actorId: '' }
		});



		// Session Timer Settings
		game.settings.register(MODULE.ID, 'sessionEndTime', {
			name: 'Session End Time',
			hint: 'When the current session timer will end (in milliseconds)',
			scope: 'world',
			config: false,
			type: Number,
			default: 0
		});

		game.settings.register(MODULE.ID, 'sessionStartTime', {
			name: 'Session Start Time',
			hint: 'When the current session timer was started (in milliseconds)',
			scope: 'world',
			config: false,
			type: Number,
			default: 0
		});

		game.settings.register(MODULE.ID, 'sessionTimerDate', {
			name: 'Session Timer Date',
			hint: 'The date when the session timer was last set',
			scope: 'world',
			config: false,
			type: String,
			default: ''
		});

		// Menubar Settings
		game.settings.register(MODULE.ID, 'sessionTimerDefault', {
			name: 'Default Session Time',
			hint: 'The default duration of the session. (Up to 10 hours)',
			scope: 'world',
			config: true,
			type: Number,
			default: 60,
			range: {
				min: 15,
				max: 600,
				step: 1
			}
		});

		// Menubar Settings
		game.settings.register(MODULE.ID, 'sessionTimerWarningThreshold', {
			name: 'Session Timer Warning Time',
			hint: 'How many minutes before the end to show the warning (1-60 minutes)',
			scope: 'world',
			config: true,
			type: Number,
			default: 15,
			range: {
				min: 1,
				max: 60,
				step: 1
			}
		});

		game.settings.register(MODULE.ID, 'sessionTimerWarningSound', {
			name: 'Session Timer Warning Sound',
			hint: 'Sound to play when time is running out',
			scope: 'world',
			config: true,
			type: String,
			default: 'none',
			choices: BLACKSMITH.arrSoundChoices
		});

		game.settings.register(MODULE.ID, 'sessionTimerWarningMessage', {
			name: 'Session Timer Warning Message',
			hint: 'Message to display when time is running out. Use {time} for remaining time.',
			scope: 'world',
			config: true,
			type: String,
			default: 'Time is running out in the session. We have about {time} remaining in our session.'
		});

		game.settings.register(MODULE.ID, 'sessionTimerExpiredSound', {
			name: 'Session Timer Expired Sound',
			hint: 'Sound to play when time has run out',
			scope: 'world',
			config: true,
			type: String,
			default: 'none',
			choices: BLACKSMITH.arrSoundChoices
		});

		game.settings.register(MODULE.ID, 'sessionTimerExpiredMessage', {
			name: 'Session Timer Expired Message',
			hint: 'Message to display when time has run out',
			scope: 'world',
			config: true,
			type: String,
			default: 'Time has run out in this session. Bummer. We can pick up here next time.'
		});




		// Movement 
		game.settings.register(MODULE.ID, 'movementType', {
			name: 'Current Movement Type',
			hint: 'The current movement restriction type for all players',
			scope: 'world',
			config: false,
			type: String,
			default: 'normal-movement'
		});

		// *** CHAT SETTINGS ***
		// ---------- SUBHEADING - CARD ADJUSTMENTS ----------
		game.settings.register(MODULE.ID, "headingH3simpleCardAdjustments", {
			name: MODULE.ID + '.headingH3CardAdjustments-Label',
			hint: MODULE.ID + '.headingH3CardAdjustments-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
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
		});

		// *** ROLL TABLE OVERRIDES ***

		// ---------- SUBHEADING - CARD SETTINGS ----------
		game.settings.register(MODULE.ID, "headingH3simpleCardSettings", {
			name: MODULE.ID + '.headingH3CardSettings-Label',
			hint: MODULE.ID + '.headingH3CardSettings-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Remove Leading Icon from Roll Tables --
		game.settings.register(MODULE.ID, 'hideRollTableIcon', {
			name: MODULE.ID + '.hideRollTableIcon-Label',
			hint: MODULE.ID + '.hideRollTableIcon-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});
		// *** LINK THEME ***
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
			}
		});


		// *** SCENE SETTINGS ***

		// ---------- HEADING - JOURNALS  ----------
		game.settings.register(MODULE.ID, "headingH2Journals", {
			name: MODULE.ID + '.headingH2Journals-Label',
			hint: MODULE.ID + '.headingH2Journals-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// ---------- SUBHEADING - JOURNAL QOL ----------
		game.settings.register(MODULE.ID, "headingH3simpleJournalQOL", {
			name: 'Quality of Life Settings',
			hint: '',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// -- JOURNAL INTERACTIONS --
		game.settings.register(MODULE.ID, 'enableJournalDoubleClick', {
			name: MODULE.ID + '.enableJournalDoubleClick-Label',
			hint: MODULE.ID + '.enableJournalDoubleClick-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});



		// ---------- SUBHEADING - AUTOMATED ENCOUNTERS ----------
		game.settings.register(MODULE.ID, "headingH3simpleEncounterSettings", {
			name: 'Automated Encounter Settings',
			hint: '',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// -- ENCOUNTER TOOLBAR --
		game.settings.register(MODULE.ID, 'enableEncounterToolbar', {
			name: MODULE.ID + '.enableEncounterToolbar-Label',
			hint: MODULE.ID + '.enableEncounterToolbar-Hint',
			type: Boolean,
			config: true,
			scope: 'world',
			default: true,
		});

		// -- Encounter Folder --
		game.settings.register(MODULE.ID, 'encounterFolder', {
			name: 'Encounter Folder',
			hint: 'Folder in which to add actors when deloying from the journal. Leave blank to not put them in a folder.',
			scope: 'world',
			config: true,
			type: String,
			default: 'Encounters'
		});



		// -- Deployment Hidden --
		game.settings.register(MODULE.ID, 'encounterToolbarDeploymentHidden', {
			name: MODULE.ID + '.encounterToolbarDeploymentHidden-Label',
			hint: MODULE.ID + '.encounterToolbarDeploymentHidden-Hint',
			type: Boolean,
			config: true,
			scope: 'world',
			default: false,
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
		});

		// -- Content Scanning --
		game.settings.register(MODULE.ID, 'enableEncounterContentScanning', {
			name: MODULE.ID + '.enableEncounterContentScanning-Label',
			hint: MODULE.ID + '.enableEncounterContentScanning-Hint',
			type: Boolean,
			config: true,
			scope: 'world',
			default: true,
		});

		// -- Real-time CR Updates --
		game.settings.register(MODULE.ID, 'enableEncounterToolbarRealTimeUpdates', {
			name: MODULE.ID + '.enableEncounterToolbarRealTimeUpdates-Label',
			hint: MODULE.ID + '.enableEncounterToolbarRealTimeUpdates-Hint',
			type: Boolean,
			config: true,
			scope: 'world',
			default: true,
		});

		// *** JOURNAL TOOLS SETTINGS ***

		// -- Journal Tools --
		game.settings.register(MODULE.ID, 'enableJournalTools', {
			name: MODULE.ID + '.enableJournalTools-Label',
			hint: MODULE.ID + '.enableJournalTools-Hint',
			type: Boolean,
			config: true,
			scope: 'world',
			default: true,
		});



		// *** ROLL SYSTEM SETTINGS ***

		// ---------- HEADING - ROLL SYSTEM  ----------
		game.settings.register(MODULE.ID, "headingH2diceRollTool", {
			name: MODULE.ID + '.headingH2diceRollTool-Label',
			hint: MODULE.ID + '.headingH2diceRollTool-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// ---------- SUBHEADING - CHAT ROLL SYSTEM ----------
		game.settings.register(MODULE.ID, "headingH3diceRollToolSystem", {
			name: MODULE.ID + '.headingH3diceRollToolSystem-Label',
			hint: MODULE.ID + '.headingH3diceRollToolSystem-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

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
			default: 'blacksmith'
		});

		// ---------- SUBHEADING - ROLL INTEGRATIONS ----------
		game.settings.register(MODULE.ID, "headingH3diceRollToolIntegrations", {
			name: MODULE.ID + '.headingH3diceRollToolIntegrations-Label',
			hint: MODULE.ID + '.headingH3diceRollToolIntegrations-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Enable Dice So Nice Integration --
		game.settings.register(MODULE.ID, 'diceRollToolEnableDiceSoNice', {
			name: MODULE.ID + '.diceRollToolEnableDiceSoNice-Label',
			hint: MODULE.ID + '.diceRollToolEnableDiceSoNice-Hint',
			type: Boolean,
			config: true,
			scope: 'world',
			default: true,
		});


		// -- Hidden Setting -- Skill Check 
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
			}
		});


		// *** SCENE SETTINGS ***

		// ---------- HEADING - SCENES  ----------
		game.settings.register(MODULE.ID, "headingH2Scenes", {
			name: MODULE.ID + '.headingH2Scenes-Label',
			hint: MODULE.ID + '.headingH2Scenes-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// ---------- SUBHEADING - SCENE INTERACTIONS ----------
		game.settings.register(MODULE.ID, "headingH3simpleSceneInteraction", {
			name: MODULE.ID + '.headingH3simpleSceneInteraction-Label',
			hint: MODULE.ID + '.headingH3simpleSceneInteraction-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});

		// -- SCENE INTERACTIONS --
		game.settings.register(MODULE.ID, 'enableSceneInteractions', {
			name: MODULE.ID + '.enableSceneInteractions-Label',
			hint: MODULE.ID + '.enableSceneInteractions-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
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
		});

		// ---------- SUBHEADING - SCENE SETTINGS ----------
		game.settings.register(MODULE.ID, "headingH3simpleSceneSettings", {
			name: MODULE.ID + '.headingH3SceneSettings-Label',
			hint: MODULE.ID + '.headingH3SceneSettings-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
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
			}
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
		});

		// *** TITLEBAR ***

		// ---------- HEADING - WINDOWS  ----------
		game.settings.register(MODULE.ID, "headingH2Windows", {
			name: MODULE.ID + '.headingH2Windows-Label',
			hint: MODULE.ID + '.headingH2Windows-Hint',
			scope: "client",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// ---------- SUBHEADING - TITLEBAR SETTINGS ----------
		game.settings.register(MODULE.ID, "headingH3TitlebarSettings", {
			name: MODULE.ID + '.headingH3TitlebarSettings-Label',
			hint: MODULE.ID + '.headingH3TitlebarSettings-Hint',
			scope: "client",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		// -- Titlebar Text Size --
		game.settings.register(MODULE.ID, "titlebarTextSize", {
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
		});
		// -- Titlebar Icon Size --
		game.settings.register(MODULE.ID,"titlebarIconSize", {
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
		});

		// *** CANVAS ***

		// ---------- HEADING - CANVAS  ----------
		game.settings.register(MODULE.ID, "headingH2Canvas", {
			name: 'Canvas',
			hint: 'Blacksmith includes a number of tools that make managing things on the canvas easier.',
			scope: "client",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// ---------- SUBHEADING - MOVEMENT SETTINGS ----------
		game.settings.register(MODULE.ID, "headingH3CanvasTools", {
			name: 'Canvas Tools',
			hint: 'Control which bits of the interface hide and show when toggled.',
			scope: "client",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// -- Left UI --
		game.settings.register(MODULE.ID, 'canvasToolsHideLeftUI', {
			name: 'Hide Left UI',
			hint: 'When enabled, the left side of the interface, including the branding, toolbar, and player list will be hidden when the toggle is activated. Be warned, if other modules have added items to this area, they will also be hidden.',
			type: Boolean,
			config: true,
			requiresReload: false,
			scope: 'client',
			default: true,
		});

		// -- Bottom UI --
		game.settings.register(MODULE.ID, 'canvasToolsHideBottomUI', {
			name: 'Hide Bottom UI',
			hint: 'When enabled, the bottom of the interface, including the macrobar, will be hidden when the toggle is activated. Be warned, if other modules have added items to this area, they will also be hidden.',
			type: Boolean,
			config: true,
			requiresReload: false,
			scope: 'client',
			default: true,
		});

		// ---------- SUBHEADING - MOVEMENT SETTINGS ----------
		game.settings.register(MODULE.ID, "headingH3Movement", {
			name: 'Movement',
			hint: 'Configures the way tokens move around on the canvas specific to the movement modes.',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Too Far --
		game.settings.register(MODULE.ID, 'movementTooFarDistance', {
			name: '"Too Far" Tiles',
			hint: 'The number of tiles a token can be from the leader before it is considered too far away to be included in the Conga or Follow marching order. A best practice is to at least have as many tiles as the number of party tokens on the canvas.',
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
		});


        game.settings.register(MODULE.ID, 'tokenSpacing', {
            name: 'Token Spacing',
            hint: 'Number of grid spaces to maintain between tokens in formation',
            scope: 'world',
            config: true,
            type: Number,
			range: {
				min: 0,
				max: 3,
				step: 1,
			},
            default: 0
        });

		// -- Movement Type (internal config) --
        game.settings.register(MODULE.ID, 'movementType', {
            name: 'Current Movement Type',
            hint: 'The current movement restriction type for all players',
            scope: 'world',
            config: false,
            type: String,
            default: 'no-movement'
        });



		// *** TOKEN NAMEPLATES ***

		// ---------- HEADING - TOKENS  ----------
		game.settings.register(MODULE.ID, "headingH2Tokens", {
			name: MODULE.ID + '.headingH2Tokens-Label',
			hint: MODULE.ID + '.headingH2Tokens-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// ---------- SUBHEADING - NAMEPLATE SETTINGS ----------
		game.settings.register(MODULE.ID, "headingH3Nameplate", {
			name: MODULE.ID + '.headingH3Nameplate-Label',
			hint: MODULE.ID + '.headingH3Nameplate-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

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
			}
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
		});
		// -- Nameplate color --
		game.settings.register(MODULE.ID, 'nameplateColor', {
			name: MODULE.ID + '.nameplateColor-Label',
			hint: MODULE.ID + '.nameplateColor-Hint',
			scope: "world",
			config: true,
			requiresReload: true,
			type: String,
			default: '#FFFFFF'
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
		});
		// -- Nameplate Outline color --
		game.settings.register(MODULE.ID, 'nameplateOutlineColor', {
			name: MODULE.ID + '.nameplateOutlineColor-Label',
			hint: MODULE.ID + '.nameplateOutlineColor-Hint',
			scope: "world",
			config: true,
			requiresReload: true,
			type: String,
			default: '#111111'
		});
	
	// *** TOKEN SETTINGS ***

	// ---------- SUBHEADING - TOKEN SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3TokenSettings", {
		name: MODULE.ID + '.headingH3TokenSettings-Label',
		hint: MODULE.ID + '.headingH3TokenSettings-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	
	// -- Rename Table --
	game.settings.register(MODULE.ID, 'tokenNameTable', {
		name: MODULE.ID + '.tokenNameTable-Label',
		hint: MODULE.ID + '.tokenNameTable-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: '-- Select A Table for Names --',
		choices: BLACKSMITH.arrTableChoices
	});

	// -- Ignored Tokens --
	game.settings.register(MODULE.ID, 'ignoredTokens', {
		name: MODULE.ID + '.ignoredTokens-Label',
		hint: MODULE.ID + '.ignoredTokens-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
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
	});

	// *** TOKEN NAMING ***

	game.settings.register(MODULE.ID, 'tokenNameFormat', {
		name: MODULE.ID + '.tokenNameFormat-Label',
		hint: MODULE.ID + '.tokenNameFormat-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'none',
		choices: nameplateChoices,
	});

	// *** TOKEN BEHAVIOR OVERRIDES ***
	// These settings override Foundry's default token behavior when tokens are dropped from compendiums

	game.settings.register(MODULE.ID, 'unlockTokenRotation', {
		name: 'Unlock Token Rotation',
		hint: 'Override Foundry\'s default "lock rotation" setting for all new tokens. This will allow tokens to be rotated freely.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'disableTokenRing', {
		name: 'Disable Token Ring',
		hint: 'Override Foundry\'s default "enable ring" setting for all new tokens. This will disable the dynamic token ring display. Note: This setting only affects Foundry\'s ring system and will not remove rings that are part of the token image itself.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'enableTokenFacing', {
		name: 'Enable Token Facing Direction',
		hint: 'Automatically rotate tokens to face the direction they move. Tokens with "Lock Rotation" enabled will not be affected.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	game.settings.register(MODULE.ID, 'tokenFacingMinDistance', {
		name: 'Minimum Movement Distance',
		hint: 'Minimum distance a token must move (in grid units) before it rotates to face the movement direction. Prevents tiny adjustments from causing unwanted rotation.',
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
	});

	game.settings.register(MODULE.ID, 'tokenFacingMode', {
		name: 'Facing Mode',
		hint: 'Which tokens should automatically face their movement direction.',
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
	});


	// -- Scale Size --
	game.settings.register(MODULE.ID,'setTokenScale', {
		name: 'Set Token Scale',
		hint: 'Set the default scale size for dropped tokens.',
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
	});


	// -- Fit Mode --
	game.settings.register(MODULE.ID, 'setTokenImageFitMode', {
		name: 'Image Fit Mode',
		hint: 'Set the image fit mode for dropped tokens. (default is Contain)',
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
	});

	// -- Pre-Combat Movement Mode Storage --
	game.settings.register(MODULE.ID, 'preCombatMovementMode', {
		name: 'Pre-Combat Movement Mode',
		hint: 'Stores the movement mode that was active before combat started (for client refresh restoration)',
		type: String,
		config: false, // Hidden setting - not shown in UI
		scope: 'world',
		default: null,
	});


	// *** TOKEN IMAGE REPLACEMENT ***

	// ---------- Token Image Replacement ----------
	game.settings.register(MODULE.ID, "headingH3TokenImageReplacement", {
		name: 'Token Image Replacement',
		hint: 'Automatically replace token images with custom images from your specified folder.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus', {
        scope: 'world',
        config: false,
        type: String,
        default: ''
    });

	game.settings.register(MODULE.ID, "headingH4tokenImageReplacementCacheStats", {
		name: "Token Image Replacement",
		hint: "Cache Status: " + getTokenImageReplacementCacheStats() + ". (Updated on client load.)", 
		scope: "world",
		config: true,
		default: "",
		type: String,
	});


	game.settings.register(MODULE.ID, 'tokenImageReplacementEnabled', {
		name: 'Enable Token Image Replacement',
		hint: 'Replace token images with custom images from a specified folder when tokens are dropped from compendiums.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', {
		name: 'Show in CoffeePub Toolbar',
		hint: 'Show the Token Image Replacement button in the CoffeePub toolbar.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', {
		name: 'Show in FoundryVTT Toolbar',
		hint: 'Show the Token Image Replacement button in the FoundryVTT native toolbar.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementPath', {
		name: 'Image Replacement Folder',
		hint: 'Base folder path containing replacement token images. This folder will be scanned for matching images. Use Foundry relative paths like: assets/images/tokens/FA_Tokens_Webp',
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
		}
	});

	// ---------- TOKEN IMAGE REPLACEMENT WINDOW STATE ----------
	game.settings.register(MODULE.ID, 'tokenImageReplacementWindowState', {
		name: 'Token Image Replacement Window State',
		hint: 'Stores the size and position of the Token Image Replacement window',
		scope: 'client',
		config: false,
		type: Object,
		default: {}
	});

	// ---------- TOKEN IMAGE REPLACEMENT IGNORED FOLDERS ----------
	game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredFolders', {
		name: 'Token Image Replacement: Ignored Folders',
		hint: 'Comma-separated list of folder names to ignore when scanning for token images (e.g., _gsdata_, Build_a_Token, .DS_Store)',
		scope: 'world',
		config: true,
		type: String,
		default: '_gsdata_,Build_a_Token,.DS_Store',
		requiresReload: true
	});
	// Deprioritized Words
	game.settings.register(MODULE.ID, 'tokenImageReplacementDeprioritizedWords', {
		name: 'Deprioritized Words',
		hint: 'Comma-separated list of words that should reduce the match score of images containing them. Use this to prefer base creature types over specialized variants (e.g., "spirit,ghost,undead,shadow").',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'spirit',
	});
	
	// Tag Sort Mode
	game.settings.register(MODULE.ID, 'tokenImageReplacementTagSortMode', {
		name: 'Tag Sort Mode',
		hint: 'How to sort and display tags: Count (by frequency), Alpha (alphabetical), or Hidden (hide tags completely)',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			'count': 'Count (by frequency)',
			'alpha': 'Alpha (alphabetical)',
			'hidden': 'Hidden (hide tags)'
		},
		default: 'count',
		requiresReload: false
	});
	
	// Ignored Words (File Exclusion)
	game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredWords', {
		name: 'Ignored Words (File Exclusion)',
		hint: 'Comma-separated list of patterns to completely exclude files from cache. Supports wildcards: "spirit" (exact), "*spirit" (ends with), "spirit*" (starts with), "*spirit*" (contains), "*.png" (extension). Files matching any pattern will not be scanned or cached.',
		scope: 'world',
		config: true,
		type: String,
		default: '',
		requiresReload: true
	});
	// Cateogry Style
	game.settings.register(MODULE.ID, 'tokenImageReplacementCategoryStyle', {
		name: 'Token Image Replacement: Category Style',
		hint: 'Choose how category filters are displayed in the Token Image Replacement window',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			'buttons': 'Buttons',
			'tabs': 'Tabs'
		},
		default: 'buttons',
		requiresReload: true
	});

	// SET THE KIND OF TOKENS WE UPDATE

	// Update Monsters
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateMonsters', {
		name: 'Update Monsters',
		hint: 'Replace images for monster tokens (non-NPC creatures with Challenge Rating).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// Update NPCs
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateNPCs', {
		name: 'Update NPCs', 
		hint: 'Replace images for friendly NPC tokens (non-hostile NPCs).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// Update Vehicles
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateVehicles', {
		name: 'Update Vehicles',
		hint: 'Replace images for vehicle tokens.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// Update Actors
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateActors', {
		name: 'Update Actors',
		hint: 'Replace images for character/actor tokens (usually player characters).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	// Skip Linked Tokens
	game.settings.register(MODULE.ID, 'tokenImageReplacementSkipLinked', {
		name: 'Skip Linked Tokens',
		hint: 'Do not replace images for tokens linked to actors (usually player characters).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});


	// CACHE SETTINGS

	// Automatically Update Image Cache
	game.settings.register(MODULE.ID, 'tokenImageReplacementAutoUpdate', {
		name: 'Automatically Update Image Cache',
		hint: 'Automatically scan for new or changed token images when changes are detected.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	// Matching Threshold
	game.settings.register(MODULE.ID, 'tokenImageReplacementThreshold', {
		name: 'Matching Threshold',
		hint: 'How strict the matching algorithm should be. Lower values = more fuzzy matching, higher values = more exact matching.',
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
	});

	// Update Dropped Tokens
	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateDropped', {
		name: 'Update Dropped Tokens',
		hint: 'Automatically update token images when tokens are dropped on the canvas. When disabled, only manual updates via the Image Replacements window will work.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// Fuzzy Search
	game.settings.register(MODULE.ID, 'tokenImageReplacementFuzzySearch', {
		name: 'Fuzzy Search',
		hint: 'When enabled, searches for individual words independently. When disabled, searches for exact string matches.',
		type: Boolean,
		config: false, // Hidden setting - controlled by UI toggle
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	

	// Token Image Replacement Cache (server-side storage)
	game.settings.register(MODULE.ID, 'tokenImageReplacementCache', {
		name: 'Token Image Replacement Cache',
		hint: 'Internal cache storage for token image replacement system (server-side)',
		scope: 'world',
		config: false, // Hidden from users - internal use only
		type: String,
		default: '',
		requiresReload: false
	});

	// TOKEN DATA WEIGHTING

	// Actor Name Weight (NEW - most important for clean creature names)
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightActorName', {
		name: 'Actor Name Weight',
		hint: 'Weigting of the actor name when calulating matches. Weight the fiels with the most clean creature name the highest priority (e.g., "Frost Giant", "Goblin")',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 90
	});

	
	// Token Name Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightTokenName', {
		name: 'Token Name Weight',
		hint: 'Weigting of the actor name when calulating matches. This field often contains the display name of the token (e.g., "Bob (Goblin)", "Goblin 1", "Bob")',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 70
	});

	// Represented Actor Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor', {
		name: 'Represented Actor Weight',
		hint: 'Weigting of the represented actor when calulating matches. This field usually represents the name of a linked token.',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 50
	});


	// Creature Type Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureType', {
		name: 'Creature Type Weight',
		hint: 'How important the creature type is for matching (e.g., "Humanoid", "Dragon", "Beast") - Official D&D5e type',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 15
	});

	// Creature Subtype Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype', {
		name: 'Creature Subtype Weight',
		hint: 'How important the creature subtype is for matching (e.g., "Goblinoid", "Orc", "Elf") - Official D&D5e subtype',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 15
	});

	// Equipment Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightEquipment', {
		name: 'Equipment Weight',
		hint: 'How important equipment is for matching (e.g., "Sword", "Bow", "Staff")',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 10
	});



	// Size Weight
	game.settings.register(MODULE.ID, 'tokenImageReplacementWeightSize', {
		name: 'Size Weight',
		hint: 'How important size is for matching (e.g., "Large", "Medium", "Huge")',
		type: Number,
		config: true,
		scope: 'world',
		range: { min: 0, max: 100, step: 5 },
		default: 3
	});


	// Monster Mapping Data
	game.settings.register(MODULE.ID, 'monsterMappingData', {
		name: 'Monster Mapping Data',
		hint: 'Internal setting for monster type mapping data',
		type: Object,
		config: false,
		scope: 'world',
		default: {}
	});

	// ---------- Dead Tokens ----------
	game.settings.register(MODULE.ID, "headingH3TokenActions", {
		name: 'Token Actions',
		hint: 'Automation of token actions.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});







	// DEAD TOKEN REPLACEMENT

	
	// Enable Dead Token Replacement
	game.settings.register(MODULE.ID, 'enableDeadTokenReplacement', {
		name: 'Enable Dead Token Replacement',
		hint: 'Choose which types of tokens should automatically change to "dead" versions when they reach 0 HP (NPCs die immediately, PCs die after 3 failed death saves)',
		scope: 'world',
		config: true,
		type: String,
		choices: {
			'disabled': 'Disabled',
			'both': 'NPCs and PCs',
			'npcs': 'NPCs Only',
			'pcs': 'PCs Only'
		},
		default: 'disabled',
		requiresReload: false
	});

	// Dead Token Image Path (NPC/Monster)
	game.settings.register(MODULE.ID, 'deadTokenImagePath', {
		name: 'Dead Token Image Path (NPC)',
		hint: 'Full path to dead token image for NPCs/Monsters (applied immediately at 0 HP)',
		scope: 'world',
		config: true,
		type: String,
		default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-npc.webp',
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'deadTokenSoundNPC', {
		name: "Dead NPC Sound",
		hint: "Sound to play when an NPC dies.",
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none"
	});

	// Dead Token Image Path (Player Character)
	game.settings.register(MODULE.ID, 'deadTokenImagePathPC', {
		name: 'Dead Token Image Path (PC)',
		hint: 'Full path to dead token image for Player Characters (applied after 3 failed death saves)',
		scope: 'world',
		config: true,
		type: String,
		default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-pc.webp',
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'deadTokenSoundPC', {
		name: "Dead PC Sound",
		hint: "Sound to play when an Player Character dies.",
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none"
	});

	// Dead Token Creature Type Filter
	game.settings.register(MODULE.ID, 'deadTokenCreatureTypeFilter', {
		name: 'Dead Token Creature Types (NPC)',
		hint: 'Comma-separated creature types to apply dead tokens to for NPCs (leave empty for all). Example: humanoid,beast,dragon',
		scope: 'world',
		config: true,
		type: String,
		default: '',
		requiresReload: false
	});



	game.settings.register(MODULE.ID, 'deadTokenSoundStable', {
		name: "Stable PC Sound",
		hint: "Sound to play when an Player Character becomes stable.",
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none"
	});




	// *** TREASURE LOOT ***

	// -- CONVERT DEAD TO LOOT --
	game.settings.register(MODULE.ID, 'tokenConvertDeadToLoot', {
		name: 'Convert Dead to Loot',
		hint: 'If you have the module "Item Piles" installed, this will convert dead tokens to loot piles.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	// -- Loot Delay --
	game.settings.register(MODULE.ID,"tokenConvertDelay", {
		name: 'Loot Delay',
		hint: 'How many seconds to wait before the loot is converted to a pile?',
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
	});

	// -- Loot Sound --
	game.settings.register(MODULE.ID, 'tokenLootSound', {
		name: "Loot Conversion Sound",
		hint: "Sound to play when a token is turned into loot.",
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: 'modules/coffee-pub-blacksmith/sounds/clatter.mp3'
    });

	game.settings.register(MODULE.ID, 'tokenLootPileImage', {
		name: 'Loot Token Image Path',
		hint: 'Full path to loot token image for tokens (applied after token converted to loot pile)',
		scope: 'world',
		config: true,
		type: String,
		requiresReload: false,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/splat-round-loot-sack.webp'
    });



	game.settings.register(MODULE.ID,'tokenLootTableTreasure', {
		name: 'Treasure Loot Table',
		hint: 'When a token is converted to a loot pile, this is the table that will be used to create the treasure loot, aside from what they were carrying.',
		scope: "world",
		config: true,
		requiresReload: false,
		default: '-- Choose a Treasure Table --',
		choices: BLACKSMITH.arrTableChoices
	});

	// -- Treasure Loot Amount --
	game.settings.register(MODULE.ID,"tokenLootTableTreasureAmount", {
		name: 'Treasure Loot Amount',
		hint: 'How many of this type of treasure should be added to the loot pile?',
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
	});

	// *** GEAR LOOT ***

	game.settings.register(MODULE.ID,'tokenLootTableGear', {
		name: 'Gear Loot Table',
		hint: 'When a token is converted to a loot pile, this is the table that will be used to create the gear loot, aside from what they were carrying.',
		scope: "world",
		config: true,
		requiresReload: false,
		default: '-- Choose a Gear Loot Table --',
		choices: BLACKSMITH.arrTableChoices
	});
	
	// -- Gear Loot Amount --
	game.settings.register(MODULE.ID,"tokenLootTableGearAmount", {
		name: 'Gear Loot Amount',
		hint: 'How many of this type of Gear loot should be added to the loot pile?',
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
	});

	// *** General LOOT ***

	game.settings.register(MODULE.ID,'tokenLootTableGeneral', {
		name: 'General Loot Table',
		hint: 'When a token is converted to a loot pile, this is the table that will be used to create the general loot, aside from what they were carrying.',
		scope: "world",
		config: true,
		requiresReload: false,
		default: '-- Choose a General Loot Table --',
		choices: BLACKSMITH.arrTableChoices
	});

	// -- General Loot Amount --
	game.settings.register(MODULE.ID,"tokenLootTableGeneralAmount", {
		name: 'General Loot Amount',
		hint: 'How many of this type of General loot should be added to the loot pile?',
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
	});



	game.settings.register(MODULE.ID, 'tokenLootChatMessage', {
		name: 'Loot Chat Message',
		hint: 'Send loot updates to the chat log.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});












	// Current Turn Indicator Settings
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentEnabled', {
		name: 'Enable Turn Indicator',
		hint: 'Display a ring around the token whose turn it is in combat.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorCurrentStyle', {
		name: 'Turn Indicator Style',
		hint: 'The visual style of the turn indicator ring.',
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
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorCurrentAnimation', {
		name: 'Turn Indicator Animation',
		hint: 'The animation style for the turn indicator.',
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
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorCurrentAnimationSpeed', {
		name: 'Turn Indicator Animation Speed',
		hint: 'Animation speed from 1 (very slow) to 10 (very fast).',
		scope: 'world',
		config: true,
		type: Number,
		default: 5,
		range: {
			min: 1,
			max: 10,
			step: 1
		},
		requiresReload: false
	});
	game.settings.register(MODULE.ID, 'turnIndicatorCurrentBorderColor', {
		name: 'Turn Indicator border Color',
		hint: 'The color of the turn indicator ring.',
		scope: 'world',
		config: true,
		type: String,
		default: '#03c602',
		requiresReload: false
	});


	game.settings.register(MODULE.ID, 'turnIndicatorCurrentBackgroundColor', {
		name: 'Turn Indicator Inner Fill Color',
		hint: 'Color for the inner fill of the turn indicator ring.',
		scope: 'world',
		config: true,
		type: String,
		default: '#03c602',
		requiresReload: false
	});








	
	// Current Turn Indicator Settings
	game.settings.register(MODULE.ID, 'turnIndicatorTargetedEnabled', {
		name: 'Enable Targeted Indicator',
		hint: 'Display a ring around the Targeted tokens in combat.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorTargetedStyle', {
		name: 'Targeted Indicator Style',
		hint: 'The visual style of the Targeted indicator ring.',
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
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorTargetedAnimation', {
		name: 'Targeted Indicator Animation',
		hint: 'The animation style for the Targeted indicator.',
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
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorTargetedAnimationSpeed', {
		name: 'Targeted Indicator Animation Speed',
		hint: 'Animation speed from 1 (very slow) to 10 (very fast).',
		scope: 'world',
		config: true,
		type: Number,
		default: 5,
		range: {
			min: 1,
			max: 10,
			step: 1
		},
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorTargetedBorderColor', {
		name: 'Targeted Indicator Border Color',
		hint: 'The color of the Targeted indicator ring.',
		scope: 'world',
		config: true,
		type: String,
		default: '#a51214',
		requiresReload: false
	});


	game.settings.register(MODULE.ID, 'turnIndicatorTargetedBackgroundColor', {
		name: 'Targeted Indicator Inner Fill Color',
		hint: 'Color for the inner fill of the Targeted indicator ring.',
		scope: 'world',
		config: true,
		type: String,
		default: '#a51214',
		requiresReload: false
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

	// Clear Targets After Turn
	game.settings.register(MODULE.ID, 'clearTargetsAfterTurn', {
		name: 'Clear Targets After Turn',
		hint: 'Automatically clear all targets when the turn changes in combat.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false,
		requiresReload: false
	});




	




	game.settings.register(MODULE.ID, 'turnIndicatorThickness', {
		name: 'Turn Indicator Thickness',
		hint: 'The thickness of the turn indicator ring in pixels.',
		scope: 'world',
		config: true,
		type: Number,
		default: 10,
		range: {
			min: 5,
			max: 30,
			step: 1
		},
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorOffset', {
		name: 'Turn Indicator Distance',
		hint: 'How far the ring extends beyond the token edge in pixels.',
		scope: 'world',
		config: true,
		type: Number,
		default: 8,
		range: {
			min: 0,
			max: 50,
			step: 1
		},
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorOpacityMin', {
		name: 'Turn Indicator Min Opacity',
		hint: 'Minimum opacity when animating (0 = invisible, 1 = fully visible).',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.3,
		range: {
			min: 0,
			max: 1,
			step: 0.05
		},
		requiresReload: false
	});

	game.settings.register(MODULE.ID, 'turnIndicatorOpacityMax', {
		name: 'Turn Indicator Max Opacity',
		hint: 'Maximum opacity for indicator ring (0 = invisible, 1 = fully visible).',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.8,
		range: {
			min: 0,
			max: 1,
			step: 0.05
		},
		requiresReload: false
	});


	game.settings.register(MODULE.ID, 'turnIndicatorInnerOpacity', {
		name: 'Turn Indicator Inner Fill Opacity',
		hint: 'Opacity for the inner fill of the turn indicator ring (0 = invisible, 1 = fully visible).',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.3,
		range: {
			min: 0,
			max: 1,
			step: 0.05
		},
		requiresReload: false
	});




























	// *** OPEN AI SETTINGS ***


	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2OpenAI", {
		name: MODULE.ID + '.headingH2OpenAI-Label',
		hint: MODULE.ID + '.headingH2OpenAI-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	
	// ---------- OpenAI SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3simpleheadingH2OpenAICore", {
		name: MODULE.ID + '.headingH3simpleheadingH2OpenAICore-Label',
		hint: MODULE.ID + '.headingH3simpleheadingH2OpenAICore-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- OPENAI MACRO --
	game.settings.register(MODULE.ID,'openAIMacro', {
		name: MODULE.ID + '.openAIMacro-Label',
		hint: MODULE.ID + '.openAIMacro-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		default: '-- Choose a Macro --',
		choices: BLACKSMITH.arrMacroChoices
	});

	// -- API KEY --
	game.settings.register(MODULE.ID, 'openAIAPIKey', {
		name: MODULE.ID + '.openAIAPIKey-Label',
		hint: MODULE.ID + '.openAIAPIKey-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- PROJECT ID --
	game.settings.register(MODULE.ID, 'openAIProjectId', {
		name: MODULE.ID + '.openAIProjectId-Label',
		hint: MODULE.ID + '.openAIProjectId-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
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
		}
	});

	// ---------- Context Settings ----------
	game.settings.register(MODULE.ID, "headingH3simpleheadingH2OpenAIContext", {
		name: MODULE.ID + '.headingH3simpleheadingH2OpenAIContext-Label',
		hint: MODULE.ID + '.headingH3simpleheadingH2OpenAIContext-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


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
	});

	// -- PROMPT --
	game.settings.register(MODULE.ID, 'openAIPrompt', {
		name: MODULE.ID + '.openAIPrompt-Label',
		hint: MODULE.ID + '.openAIPrompt-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: genericPrompt + " " + formatPrompt 
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
	});


	
	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2CampaignSettings", {
		name: 'Campaign Settings',
		hint: 'These settings are used to power both any AI generated content as well as augment any JSON imports for items, journal entries, characters, etc.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------



	
	// ---------- CAMPAIGN COMMON ----------
	game.settings.register(MODULE.ID, "headingH3CampaignCommon", {
		name: 'Campaign Common',
		hint: 'General campaign settings that are common to all narratives.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


	// -- Use Cookies --
	game.settings.register(MODULE.ID, 'narrativeUseCookies', {
		name: MODULE.ID + '.narrativeUseCookies-Label',
		hint: MODULE.ID + '.narrativeUseCookies-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	// -- Default Campaign Name --
	game.settings.register(MODULE.ID, 'defaultCampaignName', {
		name:'Default Campaign Name',
		hint: 'The default campaign name to use when creating new narratives.',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Party Name --
	game.settings.register(MODULE.ID, 'defaultPartyName', {
		name:'Default Party Name',
		hint: 'The default party name to use when creating new narratives.',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Party Size --
	game.settings.register(MODULE.ID, 'defaultPartySize', {
		name:'Default Party Size',
		hint: 'The default party size to use when creating new narratives.',
		scope: "world",
		config: true,
		requiresReload: false,
		type: Number,
		default: 4,
		range: {
			min: 1,
			max: 10,
			step: 1,
		},
	});


	// -- Default Party Makeup --
	game.settings.register(MODULE.ID, 'defaultPartyMakeup', {
		name:'Default Party Makeup',
		hint: 'The default party makeup to use when creating new narratives. (e.g. 1 Fighter, 1 Rogue, 1 Wizard, 1 Cleric)',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Party Level --
	game.settings.register(MODULE.ID, 'defaultPartyLevel', {
		name:'Default Party Level',
		hint: 'The default party level to use when creating new narratives.',
		scope: "world",
		config: true,
		requiresReload: false,	
		type: Number,
		default: 1,
		range: {
			min: 1,
			max: 20,
			step: 1,		
		},
	});

	// -- Default Rulebooks Folder --
	game.settings.register(MODULE.ID, 'defaultRulebooks', {
		name:'Default Rulebooks',
		hint: 'A comma separated list of default rule books to use when creating new narratives. (e.g. 2024 Monster Manual, 2024 Player\'s Handbook, etc.)',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// ---------- Narratvie Generator ----------
	game.settings.register(MODULE.ID, "headingH3NarrativeGenerator", {
		name: MODULE.ID + '.headingH3NarrativeGenerator-Label',
		hint: MODULE.ID + '.headingH3NarrativeGenerator-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- Default Narrative Folder --
	game.settings.register(MODULE.ID, 'defaultNarrativeFolder', {
		name: MODULE.ID + '.defaultNarrativeFolder-Label',
		hint: MODULE.ID + '.defaultNarrativeFolder-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'New Narratives'
	});

	// -- Default Journal Page Title --
	game.settings.register(MODULE.ID, 'defaultJournalPageTitle', {
		name: MODULE.ID + '.defaultJournalPageTitle-Label',
		hint: MODULE.ID + '.defaultJournalPageTitle-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''	
	});

	// -- Default Scene Location --
	game.settings.register(MODULE.ID, 'defaultSceneLocation', {
		name: MODULE.ID + '.defaultSceneLocation-Label',
		hint: MODULE.ID + '.defaultSceneLocation-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Scene Parent --
	game.settings.register(MODULE.ID, 'defaultSceneParent', {
		name: MODULE.ID + '.defaultSceneParent-Label',
		hint: MODULE.ID + '.defaultSceneParent-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Scene Area --
	game.settings.register(MODULE.ID, 'defaultSceneArea', {
		name: MODULE.ID + '.defaultSceneArea-Label',
		hint: MODULE.ID + '.defaultSceneArea-Hint',	
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- Default Scene Environment --
	game.settings.register(MODULE.ID, 'defaultSceneEnvironment', {	
		name: MODULE.ID + '.defaultSceneEnvironment-Label',	
		hint: MODULE.ID + '.defaultSceneEnvironment-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
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
		}
	});

	// -- Default Image Path --
	game.settings.register(MODULE.ID, 'narrativeDefaultImagePath', {
		name: MODULE.ID + '.narrativeDefaultImagePath-Label',
		hint: MODULE.ID + '.narrativeDefaultImagePath-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
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
	});

	// -- Default Encounter Details --
	game.settings.register(MODULE.ID, 'narrativeDefaultEncounterDetails', {
		name: MODULE.ID + '.narrativeDefaultEncounterDetails-Label',
		hint: MODULE.ID + '.narrativeDefaultEncounterDetails-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});


	// -- Include Treasure by Default --
	game.settings.register(MODULE.ID, 'narrativeDefaultIncludeTreasure', {
		name: MODULE.ID + '.narrativeDefaultIncludeTreasure-Label',
		hint: MODULE.ID + '.narrativeDefaultIncludeTreasure-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});



	// -- Default XP --
	game.settings.register(MODULE.ID, 'narrativeDefaultXP', {
		name: MODULE.ID + '.narrativeDefaultXP-Label',
		hint: MODULE.ID + '.narrativeDefaultXP-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'None'
	});

	// -- Default Treasure Details --
	game.settings.register(MODULE.ID, 'narrativeDefaultTreasureDetails', {
		name: MODULE.ID + '.narrativeDefaultTreasureDetails-Label',
		hint: MODULE.ID + '.narrativeDefaultTreasureDetails-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// ---------- ENCOUNTER DEFAULTS ----------
	game.settings.register(MODULE.ID, "headingH3EncounterDefaults", {
		name: 'Encounter Defaults',
		hint: 'These settings control default values for encounter templates.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- Default Encounter Folder --
	game.settings.register(MODULE.ID, 'defaultEncounterFolder', {
		name: MODULE.ID + '.defaultEncounterFolder-Label',
		hint: MODULE.ID + '.defaultEncounterFolder-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'New Encounters'
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
		}
	});

	// -- Default Encounter Image Path --
	game.settings.register(MODULE.ID, 'encounterDefaultImagePath', {
		name: MODULE.ID + '.encounterDefaultImagePath-Label',
		hint: MODULE.ID + '.encounterDefaultImagePath-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});
	
	// ---------- ITEM IMPORT ----------
	game.settings.register(MODULE.ID, "headingH3ItemImport", {
		name: 'Item Import',
		hint: 'These settings control how you to import items into the game.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


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





	// *** COMPENDIUM MAPPING ***

	// ---------- HEADING - TOKENS  ----------
	game.settings.register(MODULE.ID, "headingH2CompendiumMapping", {
		name: 'Compendium Mapping',
		hint: 'These settings will allow you to map the compendiums to be leveraged by automatic linking.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// ---------- ACTOR COMPENDIUMS ----------
	game.settings.register(MODULE.ID, "headingH3ActorCompendiums", {
		name: 'Actor Compendiums',
		hint: 'These settings control how you to link actors in the game.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- Search World Actors First --
	game.settings.register(MODULE.ID, 'searchWorldActorsFirst', {
		name: 'Search World Actors First',
		hint: 'When enabled, will search for actors in the world before looking in compendiums. When disabled, will only search in the selected compendiums.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Search World Actors Last --
	game.settings.register(MODULE.ID, 'searchWorldActorsLast', {
		name: 'Search World Actors Last',
		hint: 'When enabled, will search for actors in the world after looking in compendiums if no results found. When disabled, will not search world actors as fallback.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

			// -- Monster Lookup Compendiums (up to 8) --
		for (let i = 1; i <= 8; i++) {
			game.settings.register(MODULE.ID, `monsterCompendium${i}` , {
				name: `Monster Lookup ${i}`,
				hint: `The #${i} compendium to use for monster linking. Searched in order. Set to 'None' to skip.`,
				scope: "world",
				config: true,
				requiresReload: false,
				default: "none",
				choices: BLACKSMITH.arrCompendiumChoices
			});
		}

	// ---------- ITEM COMPENDIUMS ----------
	game.settings.register(MODULE.ID, "headingH3ItemCompendiums", {
		name: 'Item Compendiums',
		hint: 'These settings control how you to link items in the game.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// ------------------------------------- 

	// -- Search World Items First --
	game.settings.register(MODULE.ID, 'searchWorldItemsFirst', {
		name: 'Search World Items First',
		hint: 'When enabled, will search for items in the world before looking in compendiums. When disabled, will only search in the selected compendiums.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Search World Items Last --
	game.settings.register(MODULE.ID, 'searchWorldItemsLast', {
		name: 'Search World Items Last',
		hint: 'When enabled, will search for items in the world after looking in compendiums if no results found. When disabled, will not search world items as fallback.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

		// -- Item Lookup Compendiums (up to 8) --
	for (let i = 1; i <= 8; i++) {
		game.settings.register(MODULE.ID, `itemCompendium${i}` , {
			name: `Item Lookup ${i}`,
			hint: `The #${i} compendium to use for item linking. Searched in order. Set to 'None' to skip.`,
			scope: "world",
			config: true,
			requiresReload: false,
			default: "none",
			choices: BLACKSMITH.arrCompendiumChoices
		});
	}

	// ---------- FEATURE COMPENDIUMS ----------
	game.settings.register(MODULE.ID, "headingH3FeatureCompendiums", {
		name: 'Feature Compendiums',
		hint: 'These settings control how you to link features in the game.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// ------------------------------------- 

	// -- Search World Features First --
	game.settings.register(MODULE.ID, 'searchWorldFeaturesFirst', {
		name: 'Search World Features First',
		hint: 'When enabled, will search for features in the world before looking in compendiums. When disabled, will only search in the selected compendiums.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Search World Features Last --
	game.settings.register(MODULE.ID, 'searchWorldFeaturesLast', {
		name: 'Search World Features Last',
		hint: 'When enabled, will search for Features in the world after looking in compendiums if no results found. When disabled, will not search world items as fallback.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Features Lookup Compendiums (up to 8) --
	for (let i = 1; i <= 8; i++) {
		game.settings.register(MODULE.ID, `featuresCompendium${i}` , {
			name: `Feature Lookup ${i}`,
			hint: `The #${i} compendium to use for feature linking. Searched in order. Set to 'None' to skip.`,
			scope: "world",
			config: true,
			requiresReload: false,
			default: "none",
			choices: BLACKSMITH.arrCompendiumChoices
		});
	}


	// ---------- SPELL COMPENDIUMS ----------
	game.settings.register(MODULE.ID, "headingH3SpellCompendiums", {
		name: 'Spell Compendiums',
		hint: 'These settings control how you to link spells in the game.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// ------------------------------------- 
	
	// -- Search World Spells First --
	game.settings.register(MODULE.ID, 'searchWorldSpellsFirst', {
		name: 'Search World Features First',
		hint: 'When enabled, will search for features in the world before looking in compendiums. When disabled, will only search in the selected compendiums.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Search World Spells Last --
	game.settings.register(MODULE.ID, 'searchWorldSpellsLast', {
		name: 'Search World Features Last',
		hint: 'When enabled, will search for Features in the world after looking in compendiums if no results found. When disabled, will not search world items as fallback.',
		type: Boolean,
		config: true,
		scope: 'world',
		default: false,
	});

	// -- Spell Lookup Compendiums (up to 8) --
	for (let i = 1; i <= 8; i++) {
		game.settings.register(MODULE.ID, `spellCompendium${i}` , {
			name: `Spell Lookup ${i}`,
			hint: `The #${i} compendium to use for spell linking. Searched in order. Set to 'None' to skip.`,
			scope: "world",
			config: true,
			requiresReload: false,
			default: "none",
			choices: BLACKSMITH.arrCompendiumChoices
		});
	}




	// *** ROUND ANNOUNCMENTS ***

	// ---------- ROUND ANNOUNCMENTS HEADING ----------
	game.settings.register(MODULE.ID, "headingH2RoundAnnouncments", {
		name: 'ROUND ANNOUNCEMENTS',
		hint: 'Add anouncements for rounds to the chat.',
		scope: "world",
		config: true,
		requiresReload: false,
		default: "",
		type: String,
	});


	// Announce New Rounds Setting
	game.settings.register(MODULE.ID, 'announceNewRounds', {
		name: 'Announce New Rounds',
		hint: 'Post an announcement card to chat when a new round begins',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: Boolean,
		default: true
	});

	// New Round Sound Setting
	game.settings.register(MODULE.ID, 'newRoundSound', {
		name: "New Round Sound",
		hint: "Sound to play when a new round begins",
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none"
	});


	// -------------------------------------

	// *** COMBAT TRACKER SETTINGS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2CombatTracker", {
		name: 'COMBAT TRACKER',
		hint: 'These settings will allow you to add both combat and planning timers into the combat tracker. They can be used to keep the players on track and to keep the GM in control.',
		scope: "client",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- Set Current Combatant Icon --
	game.settings.register(MODULE.ID, 'combatTrackerSetCurrentCombatant', {
		name: 'Show Set Current Combatant Icon',
		hint: 'When enabled an icon will show up for each combatant that allows you to set them as the current combatant.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});
	
	// -- Clear Initiative --
	game.settings.register(MODULE.ID, 'combatTrackerClearInitiative', {
		name: 'Clear Initiative',
		hint: 'When enabled the combat tracker will clear the initiative each round.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});
	
	// -- Set First Combatant --
	game.settings.register(MODULE.ID, 'combatTrackerSetFirstTurn', {
		name: 'Set First Combatant',
		hint: 'When enabled the combat tracker will set the first combatant as the current combatant.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});
	
	// -- Roll Initiative for Monstars and NPCs --
	game.settings.register(MODULE.ID, 'combatTrackerRollInitiativeNonPlayer', {
		name: 'Roll Monster/NPC Initiative',
		hint: 'When enabled the combat tracker will roll initiative for all monsters and NPCs automatically each round.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	// -- Roll Initiative for Player Characters --
	game.settings.register(MODULE.ID, 'combatTrackerRollInitiativePlayer', {
		name: 'Roll Player Character Initiative',
		hint: 'When enabled, players will automatically roll initiative for their characters each round.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});

	// -- Monster/NPC Initiative --
	game.settings.register(MODULE.ID, 'combatTrackerAddInitiative', {
		name: 'Monster/NPC Mid-combat Initiative',
		hint: 'When an NPC or Monster is added to the combat tracker mid combat, this setting will determine what happens to their initiative.',
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
		}
	});

	// -- Open Combat Tracker --
	game.settings.register(MODULE.ID, 'combatTrackerOpen', {
		name: 'Open Combat Tracker',
		hint: 'When enabled, the combat tracker will be open by default when a combat starts',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});

	// -- Make Combat Tracker Resizable --
	game.settings.register(MODULE.ID, 'combatTrackerResizable', {
		name: 'Make it Resizable',
		hint: 'When enabled, the combat tracker window can be resized by dragging the corner',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
	});






	// -- Combat Tracker Size Data (Internal) --
	game.settings.register(MODULE.ID, 'combatTrackerSize', {
		name: 'Combat Tracker Size Data',
		hint: 'Internal setting to store combat tracker size and position',
		scope: 'client',
		config: false,
		type: Object,
		default: {}
	});

	// -- Show Health Bar --
	game.settings.register(MODULE.ID, 'combatTrackerShowHealthBar', {
		name: 'Show Health Bar',
		hint: 'When enabled, combatants in the combat tracker will have a health bar around the token.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
	});

	// -- Show Health Bar --
	game.settings.register(MODULE.ID, 'combatTrackerShowPortraits', {
		name: 'Show Portraits in Combat Tracker',
		hint: 'When enabled, combatants in the combat tracker will have a portrait icon.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
	});



	// -- Show Combat Menubar Bar --
	game.settings.register(MODULE.ID, 'menubarCombatShow', {
		name: 'Automatically Show Combat Menu Bar',
		hint: 'When enabled, the combat bar will automatically show when a combat starts.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
	});

	// -- Default Party Level --
	game.settings.register(MODULE.ID, 'menubarCombatSize', {
		name:'Combat Menubar Size',
		hint: 'The verticle size of the combat menubar.',
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
	});

	// Show Settings Tool
	game.settings.register(MODULE.ID, 'menubarShowSettings', {
		name: 'Show Settings Tool',
		hint: 'Show the settings tool in the menubar left zone.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});

	// Show Refresh Tool
	game.settings.register(MODULE.ID, 'menubarShowRefresh', {
		name: 'Show Refresh Tool',
		hint: 'Show the refresh tool in the menubar left zone.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});

	// Show Performance Monitor Tool
	game.settings.register(MODULE.ID, 'menubarShowPerformance', {
		name: 'Show Performance Monitor Tool',
		hint: 'Show the performance monitor tool in the menubar left zone.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});

	// Performance Monitor Poll Interval
	game.settings.register(MODULE.ID, 'menubarPerformancePollInterval', {
		name: 'Performance Monitor Poll Interval',
		hint: 'How often to update the performance monitor data (in seconds).',
		scope: 'client',
		config: true,
		type: Number,
		default: 5,
		range: {
			min: 5,
			max: 300,
			step: 5
		}
	});



	// *** TIMER SETTINGS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2Timers", {
		name: 'TIMERS',
		hint: 'These settings will allow you to add both combat and planning timers into the combat tracker. They can be used to keep the players on track and to keep the GM in control.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	


	// ---------- GLOBAL TIMER SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3simpleGlobalTimer", {
		name: 'SHARED TIMER SETTINGS',
		hint: 'These settings will allow you to set the default timer settings for both the combat and planning timers.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


	// -- Timer Visibility --
	game.settings.register(MODULE.ID, 'combatTimerGMOnly', {
		name: 'GM-Only Timers',
		hint: 'When enabled, the timers will only be visible to the GM in the combat tracker',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});


	// Add shared notification setting under "SHARED TIMER SETTINGS"
	game.settings.register(MODULE.ID, 'timerShowNotifications', {
		name: 'Show Timer Notifications',
		hint: 'Show notifications for timer events (expiration, warnings, etc.)',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	// -- Notification Override List --
	game.settings.register(MODULE.ID, 'timerNotificationOverride', {
		name: 'Notification Override List',
		hint: 'Always show notifications to these actors (comma-separated names), even if notifications are disabled',
		scope: 'world',
		config: true,
		type: String,
		default: ''
	});

	// Add this with the other shared timer settings under "SHARED TIMER SETTINGS"
	game.settings.register(MODULE.ID, 'hurryUpSound', {
		name: "Hurry Up Message Sound",
		hint: "Sound to play when a player sends a hurry up message",
		scope: "world",
		config: true,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none"
	});

	// Add this with the other shared timer settings under "SHARED TIMER SETTINGS"
	game.settings.register(MODULE.ID, 'timerPauseResumeSound', {
		name: "Timer Pause/Resume Sound",
		hint: "Sound to play when either timer is paused or resumed",
		scope: "world",
		config: true,
		type: String,
		choices: BLACKSMITH.arrSoundChoices,
		default: "none"
	});

	// Add shared volume control for all timer sounds
	game.settings.register(MODULE.ID, 'timerSoundVolume', {
		name: "Timer Sound Volume",
		hint: "Volume level for timer sounds (0-1)",
		scope: "client",
		config: true,
		type: Number,
		default: 0.8,
		range: {
			min: 0,
			max: 1,
			step: 0.1
		}
	});

	// ---------- GLOBAL TIMER SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3simpleGlobalTimerMessaging", {
		name: 'TIMER NOTIFICATIONS',
		hint: 'These settings will allow you to control the notifications that are sent to the players when the timers are running out.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// Timer Chat Message Settings
	game.settings.register(MODULE.ID, 'timerChatPauseUnpause', {
		name: "Send Pause/Unpause Messages to Chat",
		hint: "When enabled, sends messages to chat when timers are paused or unpaused",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'timerChatPlanningStart', {
		name: "Send Planning Starting Messages to Chat",
		hint: "When enabled, sends messages to chat when planning phase begins",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'timerChatTurnStart', {
		name: "Send Turn Starting Messages to Chat",
		hint: "When enabled, sends messages to chat when a new turn begins",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'timerChatPlanningRunningOut', {
		name: "Send Planning Running Out Messages to Chat",
		hint: "When enabled, sends warning messages to chat when planning time is running low",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'timerChatTurnRunningOut', {
		name: "Send Turn Running Out Messages to Chat",
		hint: "When enabled, sends warning messages to chat when turn time is running low",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'timerChatPlanningEnded', {
		name: "Send Planning Ended Messages to Chat",
		hint: "When enabled, sends messages to chat when planning phase ends",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'timerChatTurnEnded', {
		name: "Send Turn Ended Messages to Chat",
		hint: "When enabled, sends messages to chat when a turn ends",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});





	


	// ---------- ROUND TIMER ----------
	game.settings.register(MODULE.ID, "headingH3RoundTimer", {
		name: 'ROUND TIMER',
		hint: 'This timer keeps track of the actual real-world round time.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	game.settings.register(MODULE.ID, 'showRoundTimer', {
		name: 'Show Round Timer',
		hint: 'When enabled, the round timer will be displayed during combat.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});




	

	
	// ---------- PLANNING TIMER ----------
	game.settings.register(MODULE.ID, "headingH3PlanningTimer", {
		name: 'PLANNING TIMER',
		hint: 'At the start of each round, a planning timer will be displayed. This timer will allow the players to plan their actions for the round.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// Planning Timer Settings
	game.settings.register(MODULE.ID, 'planningTimerEnabled', {
		name: 'Enable Planning Timer',
		hint: 'Enable or disable the planning timer for the first turn of each round',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	game.settings.register(MODULE.ID, 'planningTimerAutoStart', {
		name: 'Auto-Start Planning Timer',
		hint: 'When enabled, the planning timer will start automatically instead of being paused by default',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'planningTimerLabel', {
		name: 'Planning Timer Label',
		hint: 'Text label shown during planning phase',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning'
	});

	game.settings.register(MODULE.ID, 'planningTimerDuration', {
		name: 'Planning Timer Duration',
		hint: 'How long the planning timer should run for (in seconds)',
		scope: 'world',
		config: true,
		type: Number,
		default: 120,
		range: {
			min: 5,
			max: 900,
			step: 5
		}
	});

	game.settings.register(MODULE.ID, 'planningTimerEndingSoonThreshold', {
		name: 'Planning Timer "Ending Soon" Threshold',
		hint: 'Percentage of time remaining when "ending soon" warning appears (1-100)',
		scope: 'world',
		config: true,
		type: Number,
		default: 20,
		range: {
			min: 1,
			max: 100,
			step: 1
		}
	});

	game.settings.register(MODULE.ID, 'planningTimerEndingSoonMessage', {
		name: 'Planning Timer Ending Soon Message',
		hint: 'Message shown when planning timer is about to expire',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning phase ending soon!'
	});


	game.settings.register(MODULE.ID, 'planningTimerEndingSoonSound', {
		name: 'Planning Timer Ending Soon Sound',
		hint: 'Sound to play when planning timer is about to expire',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices
	});



	game.settings.register(MODULE.ID, 'planningTimerExpiredMessage', {
		name: 'Planning Timer Expired Message',
		hint: 'Message shown when planning timer expires',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning phase has ended!'
	});

	
	game.settings.register(MODULE.ID, 'planningTimerExpiredSound', {
		name: 'Planning Timer Expired Sound',
		hint: 'Sound to play when planning timer expires',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices
	});



	// ---------- COMBAT TIMER ----------
	game.settings.register(MODULE.ID, "headingH3CombatTimer", {
		name: 'COMBAT TIMER',
		hint: 'At the start of each round, a combat timer will be displayed. This timer will allow the players to track the time remaining for each combatant.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	
	// COMBAT TIMER
	// Add these to your existing settings registration
	game.settings.register(MODULE.ID, 'combatTimerEnabled', {
		name: 'Enable Combat Timer',
		hint: 'Enable or disable the combat timer',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});


	// -- Auto Start Timer --
	game.settings.register(MODULE.ID, 'combatTimerAutoStart', {
		name: 'Auto Start Timer',
		hint: 'Automatically start the timer when a new turn begins. If disabled, timer will load paused.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	// -- Activity Starts Timer --
	game.settings.register(MODULE.ID, 'combatTimerActivityStart', {
		name: 'Activity Starts Timer',
		hint: 'Automatically start the timer when the active combatant moves their token or takes any action (attack, heal, or roll)',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	game.settings.register(MODULE.ID, 'combatTimerDuration', {
		name: 'Combat Timer Duration',
		hint: 'Number of seconds for each turn',
		scope: 'world',
		config: true,
		type: Number,
		default: 120,
		range: {
			min: 10,
			max: 900,
			step: 5
		}
	});


	// Combat Timer Settings
	game.settings.register(MODULE.ID, 'combatTimerStartSound', {
		name: 'Timer Start Sound',
		hint: 'The sound to play when the timer starts.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
	});


	// -- Warning Threshold --
	game.settings.register(MODULE.ID, 'combatTimerWarningThreshold', {
		name: 'Warning Threshold',
		hint: 'Percentage of time remaining when the time warning triggers (default 50%)',
		scope: 'world',
		config: true,
		type: Number,
		default: 50,
		range: {
			min: 20,
			max: 80,
			step: 5
		}
	});

	// -- Warning Message --
	game.settings.register(MODULE.ID, 'combatTimerWarningMessage', {
		name: 'Warning Message',
		hint: 'Custom message to show when timer reaches the Warning Threshold. Use {name} to insert current combatant name.',
		scope: 'world',
		config: true,
		type: String,
		default: '{name} is running out of time!'
	});

	// -- Warning Sound --
	game.settings.register(MODULE.ID, 'combatTimerWarningSound', {
		name: 'Warning Sound',
		hint: 'The sound to play when the timer reaches the Warning Threshold.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
	});

	// -- Critical Threshold --
	game.settings.register(MODULE.ID, 'combatTimerCriticalThreshold', {
		name: 'Critical Threshold',
		hint: 'Percentage of time remaining when the critical time warning triggers (default 20%)',
		scope: 'world',
		config: true,
		type: Number,
		default: 20,
		range: {
			min: 5,
			max: 40,
			step: 5
		}
	});

	// -- Critical Message --
	game.settings.register(MODULE.ID, 'combatTimerCriticalMessage', {
		name: 'Critical Message',
		hint: 'Custom message to show when timer is running critically low. Use {name} to insert current combatant name.',
		scope: 'world',
		config: true,
		type: String,
		default: '{name} is running out of time!'
	});

	// -- Critical Sound --
	game.settings.register(MODULE.ID, 'combatTimerCriticalSound', {
		name: 'Critical Sound',
		hint: 'The sound to play when the timer is critical and has almost run out.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
	});


	// -- Expired Message --
	game.settings.register(MODULE.ID, 'combatTimerExpiredMessage', {
		name: 'Time Expired Message',
		hint: 'Custom message to show when timer runs out. Use {name} to insert current combatant name.',
		scope: 'world',
		config: true,
		type: String,
		default: '{name}\'s time has expired!'
	});

	// -- Expired Sound --
	game.settings.register(MODULE.ID, 'combatTimeisUpSound', {
		name: 'Expired Sound',
		hint: 'The sound to play when the timer runs out.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices,
	});


	// -- End Turn on Timer Expiration --
	game.settings.register(MODULE.ID, 'combatTimerEndTurn', {
		name: 'End Turn on Expiration',
		hint: 'Automatically end the current turn when the timer expires',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	// -- Auto End Turn Message --
	game.settings.register(MODULE.ID, 'combatTimerAutoAdvanceMessage', {
		name: 'End Turn Message',
		hint: 'Message to show when turn is automatically advanced (use {name} for current combatant)',
		scope: 'world',
		config: true,
		type: String,
		default: '{name}\'s turn was automatically ended due to time expiration.'
	});


	
	// *** STATISTICS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2Statistics", {
		name: 'Combat Statistics',
		hint: 'These settings will allow you to track and share combat statistics.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// ---------- SHARED STAT SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3SharedStats", {
		name: 'Global Settings',
		hint: 'These settings apply to both Round Stats and Combat Stats that can be shared at the end of each round or combat session.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


	// Combat Statistics Settings
	game.settings.register(MODULE.ID, 'trackCombatStats', {
		name: 'Track Combat Statistics',
		hint: 'Enable tracking and reporting of combat round statistics (turn durations, timer expirations, etc.)',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});



	game.settings.register(MODULE.ID, 'trackPlayerStats', {
		name: 'Track Player Statistics',
		hint: 'Enable detailed tracking of player statistics including attacks, healing, and more. This data persists between sessions.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	game.settings.register(MODULE.ID, 'shareCombatStats', {
		name: 'Share With Players',
		hint: 'If enabled, combat statistics will be shared to all players. If disabled, only the GM will see them.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE.ID, 'cookiesRememberCardStates', {
		name: 'Remember Card States',
		hint: 'If enabled, the collapsed/expanded state of cards will be remembered between sessions using cookies.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});



	// ---------- ROUND STATS ----------
	game.settings.register(MODULE.ID, "headingH3RoundStats", {
		name: 'ROUND Statistics',
		hint: 'These settings apply to the End-of-Round statistics.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	game.settings.register(MODULE.ID, 'showRoundSummary', {
		name: 'Show Round Summary',
		hint: 'Show the round summary section with duration, planning, accuracy, and other key metrics.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	}); 

	game.settings.register(MODULE.ID, 'showRoundMVP', {
		name: 'Show Round MVP',
		hint: 'Show the MVP section highlighting the best performer of the round.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	}); 

	game.settings.register(MODULE.ID, 'showNotableMoments', {
		name: 'Show Notable Moments',
		hint: 'Show the notable moments section in combat statistics.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	}); 

	game.settings.register(MODULE.ID, 'showPartyBreakdown', {
		name: 'Show Party Breakdown',
		hint: 'Show the detailed breakdown of each party member performance.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});











	// THESE ARE OLD SETTINGS FOR COMBAT STATS THAT WE HAVEN"T USED YET. THEY ARE IN THE COMBAT_STATS.JS FILE, BUT WE WILL REUILB IT.

	// ---------- COMBAT STATS ----------
	game.settings.register(MODULE.ID, "headingH3CombatStats", {
		name: 'Combat Stats',
		hint: '(COMIN SOON) These settings apply to Combat Stats that can be shared at the end of each combat session.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------










	// *** TOKEN MOVEMENT SOUNDS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2MovementSounds", {
		name: MODULE.ID + '.headingH2MovementSounds-Label',
		hint: MODULE.ID + '.headingH2MovementSounds-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// Enable Movement Sounds
	game.settings.register(MODULE.ID, 'movementSoundsEnabled', {
		name: 'Enable Movement Sounds',
		hint: 'Play audio feedback when tokens are moved on the canvas.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	// Player Movement Sound
	game.settings.register(MODULE.ID, 'movementSoundPlayer', {
		name: 'Player Movement Sound',
		hint: 'Sound to play when player tokens are moved.',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'SOUNDEFFECTGENERAL01', // Rustling Grass
		choices: BLACKSMITH.arrSoundChoices,
	});

	// Monster Movement Sound
	game.settings.register(MODULE.ID, 'movementSoundMonster', {
		name: 'Monster Movement Sound',
		hint: 'Sound to play when monster/NPC tokens are moved.',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'SOUNDEFFECTGENERAL06', // Clatter
		choices: BLACKSMITH.arrSoundChoices,
	});

	// Movement Sound Volume
	game.settings.register(MODULE.ID, 'movementSoundVolume', {
		name: 'Movement Sound Volume',
		hint: 'Volume level for movement sounds (0.0 = silent, 1.0 = full volume).',
		type: Number,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 0.3,
		range: {
			min: 0.0,
			max: 1.0,
			step: 0.1
		}
	});

	// Movement Sound Distance Threshold
	game.settings.register(MODULE.ID, 'movementSoundDistanceThreshold', {
		name: 'Movement Sound Distance Threshold',
		hint: 'Minimum distance in feet that a token must move to trigger a sound (1-50 feet).',
		type: Number,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 5,
		range: {
			min: 1,
			max: 50,
			step: 1
		}
	});

} // END OF "export const registerSettings"

