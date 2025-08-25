// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE, BLACKSMITH } from './const.js';
// -- Import the shared GLOBAL variables --
import { COFFEEPUB } from './global.js';
// -- Load the shared GLOBAL functions --
import { registerBlacksmithUpdatedHook, postConsoleAndNotification, getActorId, resetModuleSettings, getSettingSafely, setSettingSafely } from './global.js';
// -- Import special page variables --
// Load the data sets for the settings dropdowns
import { dataNameplate, dataSounds, dataIcons, dataBackgroundImages, dataTheme } from './data-collections.js';

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
    postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrCompendiumChoices to:", BLACKSMITH.arrCompendiumChoices, false, false);
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
	postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrTableChoices to:", BLACKSMITH.arrTableChoices, false, false);
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
	postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrMacroChoices to:", BLACKSMITH.arrMacroChoices, false, false);
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
	postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrNameChoices to:", BLACKSMITH.arrNameChoices, false, false);
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
        if(a.id === 'cardsdefault') return -1;
        if(b.id === 'cardsdefault') return 1;
        return a.name.localeCompare(b.name);
      }); 

    for(let theme of sortedThemes) { 
      // Check if the theme is enabled - use safe settings function
      if(getSettingSafely(MODULE.ID, theme.id, true)) {
        choices[theme.id] = theme.name;
        // Add the enabled theme to arrThemeChoicesEnabled array
        BLACKSMITH.arrThemeChoicesEnabled.push(theme.name);
      }
    }
    // BLACKSMITH UPDATER - Make the Themes Array available to ALL Coffee Pub modules
    BLACKSMITH.updateValue('arrThemeChoices', choices);
	postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrThemeChoices to:", BLACKSMITH.arrThemeChoices, false, false);
    // Return it to this modules settings.
    return choices; 
}
// Build out setting for each of the themes so they can be enabled/disabled.
function registerThemes() {
    // Move 'cardsdefault' to front and sort the remaining thematically
    let sortedThemes = dataTheme.themes.sort((a, b) => {
        if(a.id === 'cardsdefault') return -1;
        if(b.id === 'cardsdefault') return 1;
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
        if(a.id === 'themecolor') return -1;
        if(b.id === 'themecolor') return 1;
        return a.name.localeCompare(b.name);
    });
    for(let img of sortedImages) { 
        choices[img.id] = img.name;
        // Add the image to arrBackgroundImageChoicesEnabled array
        BLACKSMITH.arrBackgroundImageChoicesEnabled.push(img.name);
    }
    // BLACKSMITH UPDATER
    BLACKSMITH.updateValue('arrBackgroundImageChoices', choices);
    postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrBackgroundImageChoices to:", BLACKSMITH.arrBackgroundImageChoices, false, false);    
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
        if(a.id === 'none') return -1;
        if(b.id === 'none') return 1;
        return a.name.localeCompare(b.name);
    });
    for(let icons of sortedIcons) { 
        choices[icons.id] = icons.name;
        // Add the image to arrBackgroundImageChoicesEnabled array
        BLACKSMITH.arrIconChoicesEnabled.push(icons.name);
    }
    // BLACKSMITH UPDATER 
    BLACKSMITH.updateValue('arrIconChoices', choices);
    postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrIconChoices to:", BLACKSMITH.arrIconChoices, false, false);    
    // Return it to this modules settings.
    return choices; 
}

// -- SOUND CHOICES --
function getSoundChoices() {
    postConsoleAndNotification(MODULE.NAME, "Building Sound List...", "", false, false);
    let choices = {};
    BLACKSMITH.arrSoundChoicesEnabled = [];
    let sortedSounds = dataSounds.sounds;
    // Move 'none' to front
    sortedSounds.sort((a, b) => {
        if(a.id === 'none') return -1;
        if(b.id === 'none') return 1;
        return a.name.localeCompare(b.name);
    });
    for(let sounds of sortedSounds) { 
        choices[sounds.id] = sounds.name;
        BLACKSMITH.arrSoundChoicesEnabled.push(sounds.name);
    }
    // BLACKSMITH UPDATER 
    BLACKSMITH.updateValue('arrSoundChoices', choices);
    postConsoleAndNotification(MODULE.NAME, "Updated BLACKSMITH.arrSoundChoices to:", BLACKSMITH.arrSoundChoices, false, false);    
    // Return it to this modules settings.
    return choices; 
}



// ================================================================== 
// ===== SETTINGS ===================================================
// ================================================================== 

//export const registerSettings = () => {
export const registerSettings = async () => {
    // Settings registration function - called during the 'ready' phase when Foundry is ready
    
    console.log('Blacksmith: Starting settings registration...');
    
    // 'world' scope settings are available only to GMs

    // Build the Dropdown choices
    getCompendiumChoices();
    getTableChoices();
    getMacroChoices();
    getBackgroundImageChoices();
    getIconChoices();
    getSoundChoices();
    const nameplateChoices = getNameplateChoices();
    


		// *** INTRODUCTION ***
		// ---------- TITLE ----------
		game.settings.register(MODULE.ID, "headingH1Blacksmith", {
			name: MODULE.ID + '.headingH1Blacksmith-Label',
			hint: MODULE.ID + '.headingH1Blacksmith-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// *** COFFEEE PUB MODULES ***
		let moduleStatus = checkInstalledModules();
		

		// ---------- Installed Modules ----------
		game.settings.register(MODULE.ID, "headingH4BlacksmithInstalled", {
			name: "Activated Coffee Pub Modules",
			hint: "The following Coffee Pub modules are activated: " + moduleStatus.activeModules + ". If you don't see a module you are expecting, check to see if you've activated it.",
			scope: "world",
			config: true,
			default: "",
			type: String,
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
		});
		// -------------------------------------




		// *** GENERAL ***
		// ---------- HEADING - GENERAL  ----------
		game.settings.register(MODULE.ID, "headingH2General", {
			name: MODULE.ID + '.headingH2General-Label',
			hint: MODULE.ID + '.headingH2General-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// *** CSS CUSTOMIZATION ***
		game.settings.register(MODULE.ID, "headingH3CSS", {
			name: "CSS Customization",
			hint: "Customize the FoundryVTT interface with custom CSS",
			scope: "world",
			config: true,
			type: String,
			default: "CSS Customization"
		});

		game.settings.register(MODULE.ID, "customCSS", {
			scope: "world",
			config: false,
			type: String,
			default: ""
		});

		game.settings.register(MODULE.ID, "cssTransition", {
			name: "Smooth Trasnition",
			hint: "Ease the new css styles into place with a smooth transition",
			scope: "world",
			config: true,
			type: Boolean,
			default: true
		});

		game.settings.register(MODULE.ID, "cssDarkMode", {
			name: "Dark Mode",
			hint: "Enable dark mode for the css editor",
			scope: "world",
			config: true,
			type: Boolean,
			default: true
		});




		// ---------- LATENCY CHECKER ----------
		game.settings.register(MODULE.ID, "headingH3Latency", {
			name: MODULE.ID + '.headingH3Latency-Label',
			hint: MODULE.ID + '.headingH3Latency-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// Latency Settings
		game.settings.register(MODULE.ID, 'enableLatency', {
			name: MODULE.ID + '.enableLatency-Label',
			hint: MODULE.ID + '.enableLatency-Hint',
			type: Boolean,
			scope: 'world',
			config: true,
			default: true,
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
		});


		// *** THEMES ***
		// ---------- HEADING - THEMES  ----------
		game.settings.register(MODULE.ID, "headingH2Themes", {
			name: MODULE.ID + '.headingH2Themes-Label',
			hint: MODULE.ID + '.headingH2Themes-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		// ---------- SUBHEADING - ENABLE/DISABLE ----------
		game.settings.register(MODULE.ID, "headingH3simpleThemeSelections", {
			name: MODULE.ID + '.headingH3simpleThemeSelections-Label',
			hint: MODULE.ID + '.headingH3simpleThemeSelections-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		+
		// Build out the themes based on the js file.
		
		registerThemes();
		// Make them available to other settings.
		
		getThemeChoices();

		// ---------- SUBHEADING - ENABLE/DISABLE ----------
		game.settings.register(MODULE.ID, "headingH3simpleThemeDefault", {
			name: MODULE.ID + '.headingH3simpleThemeDefault-Label',
			hint: MODULE.ID + '.headingH3simpleThemeDefault-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
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
			choices: BLACKSMITH.arrThemeChoices
		});

		// *** CHAT ***

		// ---------- HEADING - CHAT  ----------
		game.settings.register(MODULE.ID, "headingH2Chat", {
			name: MODULE.ID + '.headingH2Chat-Label',
			hint: MODULE.ID + '.headingH2Chat-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// *** CHAT PANEL SETTINGS ***
		// ---------- SUBHEADING - CHAT PANEL ----------
		game.settings.register(MODULE.ID, "headingH3simplechatPanel", {
			name: 'BLACKSMITH CHAT PANEL',
			hint: 'Settings for the panel that appears in the chat log.',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});

		game.settings.register(MODULE.ID, 'enableChatPanel', {
			name: 'Show Blacksmith Panel',
			hint: 'Show the Blacksmith panel in the chat log.',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});

		game.settings.register(MODULE.ID, 'excludedUsersChatPanel', {
			name: 'Excluded Chat Panel Users',
			hint: 'List of userIDs that should not show up as selections in voting, rolls, or other tools. (comma-separated)',
			scope: 'world',
			config: true,
			type: String,
			default: '',
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

		// Chat Panel Settings
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

		// Chat Panel Settings
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
				showRollExplanationLink: true,
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

	// *** TOKEN IMAGE REPLACEMENT ***

	game.settings.register(MODULE.ID, 'tokenImageReplacementEnabled', {
		name: 'Enable Token Image Replacement',
		hint: 'Replace token images with custom images from a specified folder when tokens are dropped from compendiums.',
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



	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateMonsters', {
		name: 'Update Monsters',
		hint: 'Replace images for monster tokens (non-NPC creatures with Challenge Rating).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateNPCs', {
		name: 'Update NPCs', 
		hint: 'Replace images for friendly NPC tokens (non-hostile NPCs).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateVehicles', {
		name: 'Update Vehicles',
		hint: 'Replace images for vehicle tokens.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateActors', {
		name: 'Update Actors',
		hint: 'Replace images for character/actor tokens (usually player characters).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: false,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementSkipLinked', {
		name: 'Skip Linked Tokens',
		hint: 'Do not replace images for tokens linked to actors (usually player characters).',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementStrictValidation', {
		name: 'Strict Path Validation',
		hint: 'Enable strict validation of file paths to prevent invalid characters and patterns from being used.',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// Cache Management Buttons
	game.settings.register(MODULE.ID, 'tokenImageReplacementCacheStats', {
		name: 'Cache Status',
		hint: 'Current status of the token image replacement cache.',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'Cache not initialized',
		onChange: (value) => {
			// This will be updated dynamically
		}
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementRefreshCache', {
		name: 'Refresh Cache',
		hint: 'Manually refresh the token image replacement cache.',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'Click to refresh cache',
		onChange: (value) => {
			// This will be updated dynamically
		}
	});

	game.settings.register(MODULE.ID, 'tokenImageReplacementClearCache', {
		name: 'Clear Cache',
		hint: 'Clear the token image replacement cache.',
		type: String,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: 'Click to clear cache',
		onChange: (value) => {
			// This will be updated dynamically
		}
	});

	// ---------- Token Image Replacement ----------
	game.settings.register(MODULE.ID, "headingH3TokenImageReplacement", {
		name: 'Token Image Replacement',
		hint: 'Automatically replace token images with custom images from your specified folder.',
		scope: "world",
		config: true,
		default: "",
		type: String,
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


	// -- Fuzzy Match --
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
		min: 0,
		max: 30,
		step: 1,
		},
		default: 10,
	});

	// *** TREASURE LOOT ***

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

	game.settings.register(MODULE.ID, 'tokenLootSound', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/sounds/clatter.mp3'
    });

	game.settings.register(MODULE.ID, 'tokenLootPileImage', {
        scope: 'client',
        config: false,
        type: String,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/splat-round-loot-sack.webp'
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

	// -- Open Combat Tracker -- move into tools
	game.settings.register(MODULE.ID, 'combatTrackerOpen', {
		name: 'Open Combat Tracker',
		hint: 'When enabled, the combat tracker will be open by default when a combat starts',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
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

	// *** DEBUG SETTINGS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE.ID, "headingH2Debug", {
		name: MODULE.ID + '.headingH2Debug-Label',
		hint: MODULE.ID + '.headingH2Debug-Hint',
		scope: "client",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	
	// ---------- CONSOLE SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3simpleConsole", {
		name: MODULE.ID + '.headingH3simpleConsole-Label',
		hint: MODULE.ID + '.headingH3simpleConsole-Hint',
		scope: "client",
		config: true,
		default: "",
		type: String,
	});
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
	});
	// ---------- DEBUG SETTINGS ----------
	game.settings.register(MODULE.ID, "headingH3simpleDebug", {
		name: MODULE.ID + '.headingH3simpleDebug-Label',
		hint: MODULE.ID + '.headingH3simpleDebug-Hint',
		scope: "client",
		config: true,
		default: "",
		type: String,
	});
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
		}
	});

	

	// --------------------------------------------------------
    console.log('Blacksmith: Settings registration complete');
    // Settings registration complete
	// --------------------------------------------------------

	







} // END OF "export const registerSettings"

