// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
// -- Import the shared GLOBAL variables --
import { COFFEEPUB, MODULE_AUTHOR } from './global.js';
// -- Load the shared GLOBAL functions --
import { registerBlacksmithUpdatedHook, postConsoleAndNotification, getActorId, resetModuleSettings} from './global.js';
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
function formatMODULE_ID(MODULE_ID) {
	let splitName = MODULE_ID.split('-');
	for (let i = 0; i < splitName.length; i++) {
	  splitName[i] = splitName[i].charAt(0).toUpperCase() + splitName[i].slice(1);
	}
	return splitName.join(' ');
}

function checkInstalledModules() {
	let coffeePubActive = [];
	let coffeePubMissing = [];
	let MODULE_IDs = [
		'coffee-pub-blacksmith',
		'coffee-pub-bubo',
		'coffee-pub-scribe',
		'coffee-pub-crier',
		'coffee-pub-bibliosoph',
		'coffee-pub-lib'
	];

	for(let MODULE_ID of MODULE_IDs) {
		if(game.modules.has(MODULE_ID)) {
		coffeePubActive.push(formatMODULE_ID(MODULE_ID));
		} else {
		coffeePubMissing.push(formatMODULE_ID(MODULE_ID));
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
    postConsoleAndNotification("Building Compendium List...", "", false, false, false);

    const choicesArray = Array.from(game.packs.values()).map(compendium => {
        return { 
            id: compendium.metadata.id, 
            label: compendium.metadata.label 
        };
    });

    // Sort array alphabetically by label
    choicesArray.sort((a, b) => a.label.localeCompare(b.label));

    const choices = choicesArray.reduce((choices, compendium) => {
        const identifier = compendium.id;
        choices[identifier] = compendium.label;
        return choices;
    }, {"none": "-- Choose a Compendium --"});

    // BLACKSMITH UPDATER - Make the Compendium Array available to ALL Coffee Pub modules
    postConsoleAndNotification("choices:", choices, false, true, false);
    postConsoleAndNotification("BLACKSMITH:", BLACKSMITH, false, true, false);

    BLACKSMITH.updateValue('arrCompendiumChoices', choices);
    postConsoleAndNotification("Updated BLACKSMITH.arrCompendiumChoices to:", BLACKSMITH.arrCompendiumChoices, false, false, false);
    // Make the array available to these settings.
    return choices;
}


// -- TABLE CHOICES  --
function getTableChoices() {
	postConsoleAndNotification("Building Table List...", "", false, false, false);
    const choices = { "none":"-- Choose a Table --" };
    Array.from(game.tables.values()).reduce((choices, table) => {
      choices[table.name] = table.name;
      return choices;
    }, choices);

	// BLACKSMITH UPDATER - Make the Table Array available to ALL Coffee Pub modules

	postConsoleAndNotification("choices:", choices, false, true, false);
	postConsoleAndNotification("BLACKSMITH:", BLACKSMITH, false, true, false);

	BLACKSMITH.updateValue('arrTableChoices', choices);
	postConsoleAndNotification("Updated BLACKSMITH.arrTableChoices to:", BLACKSMITH.arrTableChoices, false, false, false);
	// Make the array available to these settings.
    return choices;
 }
// -- MACRO CHOICES --
function getMacroChoices() {
	postConsoleAndNotification("Building Maco List...", "", false, false, false);
    let choiceObject = { "none":"-- Create A New Macro --" };
    let choiceKeys = Array.from(game.macros.values()).map(macro => macro.name);
    choiceKeys.sort().forEach(key => {
        choiceObject[key] = key;
    }); 

	// BLACKSMITH UPDATER - Make the Macro Array available to ALL Coffee Pub modules
	BLACKSMITH.updateValue('arrMacroChoices', choiceObject);
	postConsoleAndNotification("Updated BLACKSMITH.arrMacroChoices to:", BLACKSMITH.arrMacroChoices, false, false, false);
	// Make the array available to these settings.
    return choiceObject;
}
// -- NAMEPLATE CHOICES --
function getNameplateChoices() {
	postConsoleAndNotification("Building Nameplate List...", "", false, false, false);
	let choices = {};
	for(const data of dataNameplate.names) {
		choices[data.id] = data.name;
	}
	BLACKSMITH.updateValue('arrNameChoices', choices);
	postConsoleAndNotification("Updated BLACKSMITH.arrNameChoices to:", BLACKSMITH.arrNameChoices, false, false, false);
	return choices;
}

// -- THEME CHOICES  --
// Build the shared theme array to be use by other modules.
function getThemeChoices() {
	postConsoleAndNotification("Building Theme List...", "", false, false, false);
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
      // Check if the theme is enabled
      if(game.settings.get(MODULE_ID, theme.id)) {
        choices[theme.id] = theme.name;
        // Add the enabled theme to arrThemeChoicesEnabled array
        BLACKSMITH.arrThemeChoicesEnabled.push(theme.name);
      }
    }
    // BLACKSMITH UPDATER - Make the Themes Array available to ALL Coffee Pub modules
    BLACKSMITH.updateValue('arrThemeChoices', choices);
	postConsoleAndNotification("Updated BLACKSMITH.arrThemeChoices to:", BLACKSMITH.arrThemeChoices, false, false, false);
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
        game.settings.register(MODULE_ID, theme.id, {
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
    postConsoleAndNotification("Building Background Image List...", "", false, false, false);
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
    postConsoleAndNotification("Updated BLACKSMITH.arrBackgroundImageChoices to:", BLACKSMITH.arrBackgroundImageChoices, false, false, false);    
    // Return it to this modules settings.
    return choices; 
}

// -- ICON CHOICES --
function getIconChoices() {
    postConsoleAndNotification("Building Icon List...", "", false, false, false);
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
    postConsoleAndNotification("Updated BLACKSMITH.arrIconChoices to:", BLACKSMITH.arrIconChoices, false, false, false);    
    // Return it to this modules settings.
    return choices; 
}

// -- SOUND CHOICES --
function getSoundChoices() {
    postConsoleAndNotification("Building Sound List...", "", false, false, false);
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
    postConsoleAndNotification("Updated BLACKSMITH.arrSoundChoices to:", BLACKSMITH.arrSoundChoices, false, false, false);    
    // Return it to this modules settings.
    return choices; 
}



// ================================================================== 
// ===== SETTINGS ===================================================
// ================================================================== 

//export const registerSettings = () => {
export const registerSettings = async () => {
// --------------------------------------------------------
	Hooks.once('ready', async() => {
	// --------------------------------------------------------

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
		game.settings.register(MODULE_ID, "headingH1Blacksmith", {
			name: MODULE_ID + '.headingH1Blacksmith-Label',
			hint: MODULE_ID + '.headingH1Blacksmith-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// *** COFFEEE PUB MODULES ***
		let moduleStatus = checkInstalledModules();
		postConsoleAndNotification("Installed modules:", moduleStatus.activeModules, false, true, false);
		postConsoleAndNotification("Missing modules:", moduleStatus.missingModules, false, true, false);

		// ---------- Installed Modules ----------
		game.settings.register(MODULE_ID, "headingH4BlacksmithInstalled", {
			name: "Activated Coffee Pub Modules",
			hint: "The following Coffee Pub modules are activated: " + moduleStatus.activeModules + ". If you don't see a module you are expecting, check to see if you've activated it.",
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// ---------- Missing Modules ----------
		game.settings.register(MODULE_ID, "headingH4BlacksmithMissing", {
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
		game.settings.register(MODULE_ID, "headingH2General", {
			name: MODULE_ID + '.headingH2General-Label',
			hint: MODULE_ID + '.headingH2General-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------



		// ---------- TOOLBAR ----------
		game.settings.register(MODULE_ID, "headingH3simpleToolbar", {
			name: MODULE_ID + '.headingH3simpleToolbar-Label',
			hint: MODULE_ID + '.headingH3simpleToolbar-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Show Dashboard --
		game.settings.register(MODULE_ID, 'showDashboard', {
			name: MODULE_ID + '.showDashboard-Label',
			hint: MODULE_ID + '.showDashboard-Hint',
			type: Boolean,
			config: true,
			requiresReload: false,
			scope: 'world',
			default: true,
		});






		// *** THEMES ***
		// ---------- HEADING - THEMES  ----------
		game.settings.register(MODULE_ID, "headingH2Themes", {
			name: MODULE_ID + '.headingH2Themes-Label',
			hint: MODULE_ID + '.headingH2Themes-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		// ---------- SUBHEADING - ENABLE/DISABLE ----------
		game.settings.register(MODULE_ID, "headingH3simpleThemeSelections", {
			name: MODULE_ID + '.headingH3simpleThemeSelections-Label',
			hint: MODULE_ID + '.headingH3simpleThemeSelections-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		+
		// Build out the themes based on the js file.
		postConsoleAndNotification("Registering the themes from the themes file.", "", false, true, false);
		registerThemes();
		// Make them available to other settings.
		postConsoleAndNotification("Building the theme selections for global use in Coffee Pub modules.", "", false, true, false);
		getThemeChoices();

		// ---------- SUBHEADING - ENABLE/DISABLE ----------
		game.settings.register(MODULE_ID, "headingH3simpleThemeDefault", {
			name: MODULE_ID + '.headingH3simpleThemeDefault-Label',
			hint: MODULE_ID + '.headingH3simpleThemeDefault-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Default Card Theme --
		game.settings.register(MODULE_ID, 'defaultCardTheme', {
			name: MODULE_ID + '.defaultCardTheme-Label',
			hint: MODULE_ID + '.defaultCardTheme-Hint',
			scope: 'world',
			config: true,
			requiresReload: true,
			type: String,
			default: 'cardsdefault',
			choices: BLACKSMITH.arrThemeChoices
		});

		// *** CHAT ***

		// ---------- HEADING - CHAT  ----------
		game.settings.register(MODULE_ID, "headingH2Chat", {
			name: MODULE_ID + '.headingH2Chat-Label',
			hint: MODULE_ID + '.headingH2Chat-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// *** CHAT PANEL SETTINGS ***
		// ---------- SUBHEADING - CHAT PANEL ----------
		game.settings.register(MODULE_ID, "headingH3chatPanel", {
			name: 'BLACKSMITH CHAT PANEL',
			hint: 'Settings for the panel that appears in the chat log.',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});

		game.settings.register(MODULE_ID, 'enableChatPanel', {
			name: 'Show Blacksmith Panel',
			hint: 'Show the Blacksmith panel in the chat log.',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});

		// -- Party Leader -- 
		game.settings.register(MODULE_ID, 'partyLeader', {
			name: 'Party Leader',
			hint: 'The currently selected party leader',
			scope: 'world',
			config: false,
			type: String,
			default: ''
		});


		// Add this with your other settings registrations:
		game.settings.register(MODULE_ID, 'partyLeader', {
			name: "Party Leader",
			hint: "The currently selected party leader",
			scope: "world",
			config: false,
			type: String,
			default: ""
		});



		// Session Timer Settings
		game.settings.register(MODULE_ID, 'sessionEndTime', {
			name: 'Session End Time',
			hint: 'When the current session timer will end (in milliseconds)',
			scope: 'world',
			config: false,
			type: Number,
			default: 0
		});

		game.settings.register(MODULE_ID, 'sessionStartTime', {
			name: 'Session Start Time',
			hint: 'When the current session timer was started (in milliseconds)',
			scope: 'world',
			config: false,
			type: Number,
			default: 0
		});

		game.settings.register(MODULE_ID, 'sessionTimerDate', {
			name: 'Session Timer Date',
			hint: 'The date when the session timer was last set',
			scope: 'world',
			config: false,
			type: String,
			default: ''
		});

		// Chat Panel Settings
		game.settings.register(MODULE_ID, 'sessionTimerDefault', {
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
		game.settings.register(MODULE_ID, 'sessionTimerWarningThreshold', {
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

		game.settings.register(MODULE_ID, 'sessionTimerWarningSound', {
			name: 'Session Timer Warning Sound',
			hint: 'Sound to play when time is running out',
			scope: 'world',
			config: true,
			type: String,
			default: 'none',
			choices: dataSounds.sounds.reduce((obj, sound) => {
				obj[sound.id] = sound.name;
				return obj;
			}, {})
		});

		game.settings.register(MODULE_ID, 'sessionTimerWarningMessage', {
			name: 'Session Timer Warning Message',
			hint: 'Message to display when time is running out. Use {time} for remaining time.',
			scope: 'world',
			config: true,
			type: String,
			default: 'Time is running out in the session. We have about {time} remaining in our session.'
		});

		game.settings.register(MODULE_ID, 'sessionTimerExpiredSound', {
			name: 'Session Timer Expired Sound',
			hint: 'Sound to play when time has run out',
			scope: 'world',
			config: true,
			type: String,
			default: 'none',
			choices: dataSounds.sounds.reduce((obj, sound) => {
				obj[sound.id] = sound.name;
				return obj;
			}, {})
		});

		game.settings.register(MODULE_ID, 'sessionTimerExpiredMessage', {
			name: 'Session Timer Expired Message',
			hint: 'Message to display when time has run out',
			scope: 'world',
			config: true,
			type: String,
			default: 'Time has run out in this session. It\'s a bummer, but let\'s get to a good stopping point. We can pick up here next time.'
		});











		// *** CHAT SETTINGS ***
		// ---------- SUBHEADING - CARD ADJUSTMENTS ----------
		game.settings.register(MODULE_ID, "headingH3simpleCardAdjustments", {
			name: MODULE_ID + '.headingH3CardAdjustments-Label',
			hint: MODULE_ID + '.headingH3CardAdjustments-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		// -- Chat Gap --
		game.settings.register(MODULE_ID, 'chatSpacing', {
			name: MODULE_ID + '.chatSpacing-Label',
			hint: MODULE_ID + '.chatSpacing-Hint',
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
		game.settings.register(MODULE_ID,'cardTopMargin', {
			name: MODULE_ID + '.cardTopMargin-Label',
			hint: MODULE_ID + '.cardTopMargin-Hint',
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
		game.settings.register(MODULE_ID,'cardBottomMargin', {
			name: MODULE_ID + '.cardBottomMargin-Label',
			hint: MODULE_ID + '.cardBottomMargin-Hint',
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
		game.settings.register(MODULE_ID,'cardLeftMargin', {
			name: MODULE_ID + '.cardLeftMargin-Label',
			hint: MODULE_ID + '.cardLeftMargin-Hint',
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
		game.settings.register(MODULE_ID,'cardRightMargin', {
			name: MODULE_ID + '.cardRightMargin-Label',
			hint: MODULE_ID + '.cardRightMargin-Hint',
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
		game.settings.register(MODULE_ID,'cardTopOffset', {
			name: MODULE_ID + '.cardTopOffset-Label',
			hint: MODULE_ID + '.cardTopOffset-Hint',
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
		game.settings.register(MODULE_ID, "headingH3simpleCardSettings", {
			name: MODULE_ID + '.headingH3CardSettings-Label',
			hint: MODULE_ID + '.headingH3CardSettings-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Remove Leading Icon from Roll Tables --
		game.settings.register(MODULE_ID, 'hideRollTableIcon', {
			name: MODULE_ID + '.hideRollTableIcon-Label',
			hint: MODULE_ID + '.hideRollTableIcon-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});
		// *** LINK THEME ***
		game.settings.register(MODULE_ID, 'objectLinkStyle', {
			name: MODULE_ID + '.objectLinkStyle-Label',
			hint: MODULE_ID + '.objectLinkStyle-Hint',
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
		game.settings.register(MODULE_ID, "headingH2Journals", {
			name: MODULE_ID + '.headingH2Journals-Label',
			hint: MODULE_ID + '.headingH2Journals-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// -- JOURNAL INTERACTIONS --
		game.settings.register(MODULE_ID, 'enableJournalDoubleClick', {
			name: MODULE_ID + '.enableJournalDoubleClick-Label',
			hint: MODULE_ID + '.enableJournalDoubleClick-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});

		// *** SCENE SETTINGS ***

		// ---------- HEADING - SCENES  ----------
		game.settings.register(MODULE_ID, "headingH2Scenes", {
			name: MODULE_ID + '.headingH2Scenes-Label',
			hint: MODULE_ID + '.headingH2Scenes-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------


		// ---------- SUBHEADING - SCENE INTERACTIONS ----------
		game.settings.register(MODULE_ID, "headingH3simpleSceneInteraction", {
			name: MODULE_ID + '.headingH3simpleSceneInteraction-Label',
			hint: MODULE_ID + '.headingH3simpleSceneInteraction-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});

		// -- SCENE INTERACTIONS --
		game.settings.register(MODULE_ID, 'enableSceneInteractions', {
			name: MODULE_ID + '.enableSceneInteractions-Label',
			hint: MODULE_ID + '.enableSceneInteractions-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});

		// -- SCENE BEHAVIORS --
		game.settings.register(MODULE_ID, 'enableSceneClickBehaviors', {
			name: MODULE_ID + '.enableSceneClickBehaviors-Label',
			hint: MODULE_ID + '.enableSceneClickBehaviors-Hint',
			type: Boolean,
			config: true,
			requiresReload: true,
			scope: 'world',
			default: true,
		});

		// ---------- SUBHEADING - SCENE SETTINGS ----------
		game.settings.register(MODULE_ID, "headingH3simpleSceneSettings", {
			name: MODULE_ID + '.headingH3SceneSettings-Label',
			hint: MODULE_ID + '.headingH3SceneSettings-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		// -- Scene Text Align --
		game.settings.register(MODULE_ID, 'sceneTextAlign', {
			name: MODULE_ID + '.sceneTextAlign-Label',
			hint: MODULE_ID + '.sceneTextAlign-Hint',
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
		game.settings.register(MODULE_ID, 'sceneFontSize', {
			name: MODULE_ID + '.sceneFontSize-Label',
			hint: MODULE_ID + '.sceneFontSize-Hint',
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
		game.settings.register(MODULE_ID, 'sceneTitlePadding', {
			name: MODULE_ID + '.sceneTitlePadding-Label',
			hint: MODULE_ID + '.sceneTitlePadding-Hint',
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

		// *** TITLEBAR ***

		// ---------- HEADING - WINDOWS  ----------
		game.settings.register(MODULE_ID, "headingH2Windows", {
			name: MODULE_ID + '.headingH2Windows-Label',
			hint: MODULE_ID + '.headingH2Windows-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// ---------- SUBHEADING - TITLEBAR SETTINGS ----------
		game.settings.register(MODULE_ID, "headingH3TitlebarSettings", {
			name: MODULE_ID + '.headingH3TitlebarSettings-Label',
			hint: MODULE_ID + '.headingH3TitlebarSettings-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------
		// -- Titlebar Text Size --
		game.settings.register(MODULE_ID, "titlebarTextSize", {
			name: MODULE_ID + '.titlebarTextSize-Label',
			hint: MODULE_ID + '.titlebarTextSize-Hint',
			scope: "world",
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
		game.settings.register(MODULE_ID,"titlebarIconSize", {
			name: MODULE_ID + '.titlebarIconSize-Label',
			hint: MODULE_ID + '.titlebarIconSize-Hint',
			scope: "world",
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
		game.settings.register(MODULE_ID,"titlebarSpacing", {
			name: MODULE_ID + '.titlebarSpacing-Label',
			hint: MODULE_ID + '.titlebarSpacing-Hint',
			scope: "world",
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


		// *** TOKEN NAMEPLATES ***

		// ---------- HEADING - TOKENS  ----------
		game.settings.register(MODULE_ID, "headingH2Tokens", {
			name: MODULE_ID + '.headingH2Tokens-Label',
			hint: MODULE_ID + '.headingH2Tokens-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// ---------- SUBHEADING - NAMEPLATE SETTINGS ----------
		game.settings.register(MODULE_ID, "headingH3Nameplate", {
			name: MODULE_ID + '.headingH3Nameplate-Label',
			hint: MODULE_ID + '.headingH3Nameplate-Hint',
			scope: "world",
			config: true,
			default: "",
			type: String,
		});
		// -------------------------------------

		// -- Font Family --
		game.settings.register(MODULE_ID,'nameplateFontFamily', {
			name: MODULE_ID + '.nameplateFontFamily-Label',
			hint: MODULE_ID + '.nameplateFontFamily-Hint',
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
		game.settings.register(MODULE_ID,'nameplateFontSize', {
			name: MODULE_ID + '.nameplateFontSize-Label',
			hint: MODULE_ID + '.nameplateFontSize-Hint',
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
		game.settings.register(MODULE_ID, 'nameplateColor', {
			name: MODULE_ID + '.nameplateColor-Label',
			hint: MODULE_ID + '.nameplateColor-Hint',
			scope: "world",
			config: true,
			requiresReload: true,
			type: String,
			default: '#FFFFFF'
		});
		// -- Outline Size --
		game.settings.register(MODULE_ID,'nameplateOutlineSize', {
			name: MODULE_ID + '.nameplateOutlineSize-Label',
			hint: MODULE_ID + '.nameplateOutlineSize-Hint',
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
		game.settings.register(MODULE_ID, 'nameplateOutlineColor', {
			name: MODULE_ID + '.nameplateOutlineColor-Label',
			hint: MODULE_ID + '.nameplateOutlineColor-Hint',
			scope: "world",
			config: true,
			requiresReload: true,
			type: String,
			default: '#111111'
		});
	
	// *** TOKEN SETTINGS ***

	// ---------- SUBHEADING - TOKEN SETTINGS ----------
	game.settings.register(MODULE_ID, "headingH3TokenSettings", {
		name: MODULE_ID + '.headingH3TokenSettings-Label',
		hint: MODULE_ID + '.headingH3TokenSettings-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	// -- Rename Table --
	game.settings.register(MODULE_ID, 'tokenNameTable', {
		name: MODULE_ID + '.tokenNameTable-Label',
		hint: MODULE_ID + '.tokenNameTable-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: '-- Select A Table for Names --',
		choices: BLACKSMITH.arrTableChoices
	});

	// -- Ignored Tokens --
	game.settings.register(MODULE_ID, 'ignoredTokens', {
		name: MODULE_ID + '.ignoredTokens-Label',
		hint: MODULE_ID + '.ignoredTokens-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});
	// -- Fuzzy Match --
	game.settings.register(MODULE_ID, 'fuzzyMatch', {
		name: MODULE_ID + '.fuzzyMatch-Label',
		hint: MODULE_ID + '.fuzzyMatch-Hint',
		type: Boolean,
		config: true,
		requiresReload: false,
		scope: 'world',
		default: true,
	});

	// *** TOKEN NAMING ***

	game.settings.register(MODULE_ID, 'tokenNameFormat', {
		name: MODULE_ID + '.tokenNameFormat-Label',
		hint: MODULE_ID + '.tokenNameFormat-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'none',
		choices: nameplateChoices,
	});


	// *** OPEN AI SETTINGS ***


	// ---------- SUBHEADING ----------
	game.settings.register(MODULE_ID, "headingH2OpenAI", {
		name: MODULE_ID + '.headingH2OpenAI-Label',
		hint: MODULE_ID + '.headingH2OpenAI-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	
	// ---------- OpenAI SETTINGS ----------
	game.settings.register(MODULE_ID, "headingH3simpleheadingH2OpenAICore", {
		name: MODULE_ID + '.headingH3simpleheadingH2OpenAICore-Label',
		hint: MODULE_ID + '.headingH3simpleheadingH2OpenAICore-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- OPENAI MACRO --
	game.settings.register(MODULE_ID,'openAIMacro', {
		name: MODULE_ID + '.openAIMacro-Label',
		hint: MODULE_ID + '.openAIMacro-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		default: '-- Choose a Macro --',
		choices: COFFEEPUB.arrMACROCHOICES
	});

	// -- API KEY --
	game.settings.register(MODULE_ID, 'openAIAPIKey', {
		name: MODULE_ID + '.openAIAPIKey-Label',
		hint: MODULE_ID + '.openAIAPIKey-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: ''
	});

	// -- MODEL --
	game.settings.register(MODULE_ID, 'openAIModel', {
		name: MODULE_ID + '.openAIModel-Label',
		hint: MODULE_ID + '.openAIModel-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'gpt-3.5-turbo',
		choices: {
			'gpt-4o': 'GPT-4o (Expensive: 128,000 tokens in/16,384 tokens out)',  // https://platform.openai.com/docs/models/#gpt-4o-mini
			'o1-mini': 'GPT-4o-mini (Cheaper: 128,000 tokens in/32,768 tokens out)', // https://platform.openai.com/docs/models/#gpt-4o-mini
			'gpt-4': 'GPT-4 (8,192 tokens in/8,192 tokens out)', // https://platform.openai.com/docs/models/gpt-4
			'gpt-3.5-turbo': 'GPT-3.5 Turbo 16,385 tokens in/4,096 tokens out)', // https://platform.openai.com/docs/models/gpt-3-5
		}
	});

	// ---------- Context Settings ----------
	game.settings.register(MODULE_ID, "headingH3simpleheadingH2OpenAIContext", {
		name: MODULE_ID + '.headingH3simpleheadingH2OpenAIContext-Label',
		hint: MODULE_ID + '.headingH3simpleheadingH2OpenAIContext-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


	// -- GAME SYSTEMS -- IS THIS USED??
	game.settings.register(MODULE_ID, 'openAIGameSystems', {
		name: MODULE_ID + '.openAIGameSystems-Label',
		hint: MODULE_ID + '.openAIGameSystems-Hint',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: String,
		default: 'dnd5e',
		choices: gameSystemChoices,
	});

	// -- PROMPT --
	game.settings.register(MODULE_ID, 'openAIPrompt', {
		name: MODULE_ID + '.openAIPrompt-Label',
		hint: MODULE_ID + '.openAIPrompt-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: genericPrompt + " " + formatPrompt 
	});
	// -- CONTEXT LENGTH --
	game.settings.register(MODULE_ID,'openAIContextLength', {
		name: MODULE_ID + '.openAIContextLength-Label',
		hint: MODULE_ID + '.openAIContextLength-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 50,
		step: 1,
		},
		default: 0,
	});
	// -- TEMPERATURE --
	game.settings.register(MODULE_ID,'openAITemperature', {
		name: MODULE_ID + '.openAITemperature-Label',
		hint: MODULE_ID + '.openAITemperature-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		type: Number,
		range: {
		min: 0,
		max: 2,
		step: .1,
		},
		default: .1,
	});


// ---------- Narratvie Generator ----------
game.settings.register(MODULE_ID, "headingH3simpleheadingH2NarrativeGenerator", {
	name: MODULE_ID + '.headingH3simpleheadingH2NarrativeGenerator-Label',
	hint: MODULE_ID + '.headingH3simpleheadingH2NarrativeGenerator-Hint',
	scope: "world",
	config: true,
	default: "",
	type: String,
});
// -------------------------------------

// -- Default Narrative Folder --
game.settings.register(MODULE_ID, 'defaultNarrativeFolder', {
	name: MODULE_ID + '.defaultNarrativeFolder-Label',
	hint: MODULE_ID + '.defaultNarrativeFolder-Hint',
	scope: "world",
	config: true,
	requiresReload: false,
	type: String,
	default: 'New Narratives'
});

// -- Default Journal Page Title --
game.settings.register(MODULE_ID, 'defaultJournalPageTitle', {
	name: MODULE_ID + '.defaultJournalPageTitle-Label',
	hint: MODULE_ID + '.defaultJournalPageTitle-Hint',
	scope: "world",
	config: true,
	requiresReload: false,
	type: String,
	default: ''	
});

// -- Default Scene Location --
game.settings.register(MODULE_ID, 'defaultSceneLocation', {
	name: MODULE_ID + '.defaultSceneLocation-Label',
	hint: MODULE_ID + '.defaultSceneLocation-Hint',
	scope: "world",
	config: true,
	requiresReload: false,
	type: String,
	default: ''
});

// -- Default Scene Parent --
game.settings.register(MODULE_ID, 'defaultSceneParent', {
	name: MODULE_ID + '.defaultSceneParent-Label',
	hint: MODULE_ID + '.defaultSceneParent-Hint',
	scope: "world",
	config: true,
	requiresReload: false,
	type: String,
	default: ''
});

// -- Default Scene Area --
game.settings.register(MODULE_ID, 'defaultSceneArea', {
	name: MODULE_ID + '.defaultSceneArea-Label',
	hint: MODULE_ID + '.defaultSceneArea-Hint',	
	scope: "world",
	config: true,
	requiresReload: false,
	type: String,
	default: ''
});

// -- Default Scene Environment --
game.settings.register(MODULE_ID, 'defaultSceneEnvironment', {	
	name: MODULE_ID + '.defaultSceneEnvironment-Label',	
	hint: MODULE_ID + '.defaultSceneEnvironment-Hint',
	scope: "world",
	config: true,
	requiresReload: false,
	type: String,
	default: ''
});	

// -- Use Cookies --
game.settings.register(MODULE_ID, 'narrativeUseCookies', {
    name: MODULE_ID + '.narrativeUseCookies-Label',
    hint: MODULE_ID + '.narrativeUseCookies-Hint',
    type: Boolean,
    config: true,
    requiresReload: false,
    scope: 'world',
    default: false,
});

// -- Default Card Image Selection --
game.settings.register(MODULE_ID, 'narrativeDefaultCardImage', {
    name: MODULE_ID + '.narrativeDefaultCardImage-Label',
    hint: MODULE_ID + '.narrativeDefaultCardImage-Hint',
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
game.settings.register(MODULE_ID, 'narrativeDefaultImagePath', {
    name: MODULE_ID + '.narrativeDefaultImagePath-Label',
    hint: MODULE_ID + '.narrativeDefaultImagePath-Hint',
    scope: "world",
    config: true,
    requiresReload: false,
    type: String,
    default: ''
});

// -- Include Encounter by Default --
game.settings.register(MODULE_ID, 'narrativeDefaultIncludeEncounter', {
    name: MODULE_ID + '.narrativeDefaultIncludeEncounter-Label',
    hint: MODULE_ID + '.narrativeDefaultIncludeEncounter-Hint',
    type: Boolean,
    config: true,
    requiresReload: false,
    scope: 'world',
    default: false,
});

// -- Default Encounter Details --
game.settings.register(MODULE_ID, 'narrativeDefaultEncounterDetails', {
    name: MODULE_ID + '.narrativeDefaultEncounterDetails-Label',
    hint: MODULE_ID + '.narrativeDefaultEncounterDetails-Hint',
    scope: "world",
    config: true,
    requiresReload: false,
    type: String,
    default: ''
});

// -- Include Treasure by Default --
game.settings.register(MODULE_ID, 'narrativeDefaultIncludeTreasure', {
    name: MODULE_ID + '.narrativeDefaultIncludeTreasure-Label',
    hint: MODULE_ID + '.narrativeDefaultIncludeTreasure-Hint',
    type: Boolean,
    config: true,
    requiresReload: false,
    scope: 'world',
    default: false,
});

// -- Default XP --
game.settings.register(MODULE_ID, 'narrativeDefaultXP', {
    name: MODULE_ID + '.narrativeDefaultXP-Label',
    hint: MODULE_ID + '.narrativeDefaultXP-Hint',
    scope: "world",
    config: true,
    requiresReload: false,
    type: String,
    default: 'None'
});

// -- Default Treasure Details --
game.settings.register(MODULE_ID, 'narrativeDefaultTreasureDetails', {
    name: MODULE_ID + '.narrativeDefaultTreasureDetails-Label',
    hint: MODULE_ID + '.narrativeDefaultTreasureDetails-Hint',
    scope: "world",
    config: true,
    requiresReload: false,
    type: String,
    default: ''
});












	// ---------- SUBHEADING - BROWSER ----------
	game.settings.register(MODULE_ID, "headingH2Browser", {
		name: MODULE_ID + '.headingH2Browser-Label',
		hint: MODULE_ID + '.headingH2Browser-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- OPENAI MACRO --
	game.settings.register(MODULE_ID,'browserMacro', {
		name: MODULE_ID + '.browserMacro-Label',
		hint: MODULE_ID + '.browserMacro-Hint',
		scope: "world",
		config: true,
		requiresReload: true,
		default: '-- Choose a Macro --',
		choices: COFFEEPUB.arrMACROCHOICES
	});

	// -- URL --
	game.settings.register(MODULE_ID, 'browserURL', {
		name: MODULE_ID + '.browserURL-Label',
		hint: MODULE_ID + '.browserURL-Hint',
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		default: 'google.com'
	});


	


	// *** ROUND ANNOUNCMENTS ***

	// ---------- ROUND ANNOUNCMENTS HEADING ----------
	game.settings.register(MODULE_ID, "headingH2RoundAnnouncments", {
		name: 'ROUND ANNOUNCEMENTS',
		hint: 'Add anouncements for rounds to the chat.',
		scope: "world",
		config: true,
		requiresReload: false,
		default: "",
		type: String,
	});


	// Announce New Rounds Setting
	game.settings.register(MODULE_ID, 'announceNewRounds', {
		name: 'Announce New Rounds',
		hint: 'Post an announcement card to chat when a new round begins',
		scope: 'world',
		config: true,
		requiresReload: false,
		type: Boolean,
		default: true
	});

	// New Round Sound Setting
	game.settings.register(MODULE_ID, 'newRoundSound', {
		name: "New Round Sound",
		hint: "Sound to play when a new round begins",
		scope: "world",
		config: true,
		requiresReload: false,
		type: String,
		choices: dataSounds.sounds.reduce((obj, sound) => {
			obj[sound.id] = sound.name;
			return obj;
		}, {}),
		default: "none"
	});
	// -------------------------------------

	// *** COMBAT TRACKER SETTINGS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE_ID, "headingH2CombatTracker", {
		name: 'COMBAT TRACKER',
		hint: 'These settings will allow you to add both combat and planning timers into the combat tracker. They can be used to keep the players on track and to keep the GM in control.',
		scope: "client",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- Open Combat Tracker --
	game.settings.register(MODULE_ID, 'combatTrackerOpen', {
		name: 'Open Combat Tracker',
		hint: 'When enabled, the combat tracker will be open by default when a combat starts',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});


	// *** TIMER SETTINGS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE_ID, "headingH2Timers", {
		name: 'TIMERS',
		hint: 'These settings will allow you to add both combat and planning timers into the combat tracker. They can be used to keep the players on track and to keep the GM in control.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	


	// ---------- GLOBAL TIMER SETTINGS ----------
	game.settings.register(MODULE_ID, "headingH3GlobalTimer", {
		name: 'SHARED TIMER SETTINGS',
		hint: 'These settings will allow you to set the default timer settings for both the combat and planning timers.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


	// -- Timer Visibility --
	game.settings.register(MODULE_ID, 'combatTimerGMOnly', {
		name: 'GM-Only Timers',
		hint: 'When enabled, the timers will only be visible to the GM in the combat tracker',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});


	// Add shared notification setting under "SHARED TIMER SETTINGS"
	game.settings.register(MODULE_ID, 'timerShowNotifications', {
		name: 'Show Timer Notifications',
		hint: 'Show notifications for timer events (expiration, warnings, etc.)',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	// -- Notification Override List --
	game.settings.register(MODULE_ID, 'timerNotificationOverride', {
		name: 'Notification Override List',
		hint: 'Always show notifications to these actors (comma-separated names), even if notifications are disabled',
		scope: 'world',
		config: true,
		type: String,
		default: ''
	});

	// Add this with the other shared timer settings under "SHARED TIMER SETTINGS"
	game.settings.register(MODULE_ID, 'hurryUpSound', {
		name: "Hurry Up Message Sound",
		hint: "Sound to play when a player sends a hurry up message",
		scope: "world",
		config: true,
		type: String,
		choices: dataSounds.sounds.reduce((obj, sound) => {
			obj[sound.id] = sound.name;
			return obj;
		}, {}),
		default: "none"
	});

	// Add this with the other shared timer settings under "SHARED TIMER SETTINGS"
	game.settings.register(MODULE_ID, 'timerPauseResumeSound', {
		name: "Timer Pause/Resume Sound",
		hint: "Sound to play when either timer is paused or resumed",
		scope: "world",
		config: true,
		type: String,
		choices: dataSounds.sounds.reduce((obj, sound) => {
			obj[sound.id] = sound.name;
			return obj;
		}, {}),
		default: "none"
	});

	// Add shared volume control for all timer sounds
	game.settings.register(MODULE_ID, 'timerSoundVolume', {
		name: 'Timer Sound Volume',
		hint: 'Adjust the volume for all timer sounds (0 = silent, 1 = full volume)',
		scope: 'world',
		config: true,
		type: Number,
		default: 0.5,
		range: {
			min: 0,
			max: 1,
			step: 0.1
		}
	});



	// ---------- ROUND TIMER ----------
	game.settings.register(MODULE_ID, "headingH3RoundTimer", {
		name: 'ROUND TIMER',
		hint: 'This timer keeps track of the actual real-world round time.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	game.settings.register(MODULE_ID, 'showRoundTimer', {
		name: 'Show Round Timer',
		hint: 'When enabled, the round timer will be displayed during combat.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});




	

	
	// ---------- PLANNING TIMER ----------
	game.settings.register(MODULE_ID, "headingH3PlanningTimer", {
		name: 'PLANNING TIMER',
		hint: 'At the start of each round, a planning timer will be displayed. This timer will allow the players to plan their actions for the round.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// Planning Timer Settings
	game.settings.register(MODULE_ID, 'planningTimerEnabled', {
		name: 'Enable Planning Timer',
		hint: 'Enable or disable the planning timer for the first turn of each round',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	game.settings.register(MODULE_ID, 'planningTimerAutoStart', {
		name: 'Auto-Start Planning Timer',
		hint: 'When enabled, the planning timer will start automatically instead of being paused by default',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE_ID, 'planningTimerLabel', {
		name: 'Planning Timer Label',
		hint: 'Text label shown during planning phase',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning'
	});

	game.settings.register(MODULE_ID, 'planningTimerDuration', {
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

	game.settings.register(MODULE_ID, 'planningTimerEndingSoonThreshold', {
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

	game.settings.register(MODULE_ID, 'planningTimerEndingSoonMessage', {
		name: 'Planning Timer Ending Soon Message',
		hint: 'Message shown when planning timer is about to expire',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning phase ending soon!'
	});


	game.settings.register(MODULE_ID, 'planningTimerEndingSoonSound', {
		name: 'Planning Timer Ending Soon Sound',
		hint: 'Sound to play when planning timer is about to expire',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices
	});



	game.settings.register(MODULE_ID, 'planningTimerExpiredMessage', {
		name: 'Planning Timer Expired Message',
		hint: 'Message shown when planning timer expires',
		scope: 'world',
		config: true,
		type: String,
		default: 'Planning phase has ended!'
	});

	
	game.settings.register(MODULE_ID, 'planningTimerExpiredSound', {
		name: 'Planning Timer Expired Sound',
		hint: 'Sound to play when planning timer expires',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: BLACKSMITH.arrSoundChoices
	});



	// ---------- COMBAT TIMER ----------
	game.settings.register(MODULE_ID, "headingH3CombatTimer", {
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
	game.settings.register(MODULE_ID, 'combatTimerEnabled', {
		name: 'Enable Combat Timer',
		hint: 'Enable or disable the combat timer',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});


	// -- Auto Start Timer --
	game.settings.register(MODULE_ID, 'combatTimerAutoStart', {
		name: 'Auto Start Timer',
		hint: 'Automatically start the timer when a new turn begins. If disabled, timer will load paused.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});


	game.settings.register(MODULE_ID, 'combatTimerDuration', {
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
	game.settings.register(MODULE_ID, 'combatTimerStartSound', {
		name: 'Timer Start Sound',
		hint: 'The sound to play when the timer starts.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: COFFEEPUB.arrSOUNDCHOICES,
	});


	// -- Warning Threshold --
	game.settings.register(MODULE_ID, 'combatTimerWarningThreshold', {
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
	game.settings.register(MODULE_ID, 'combatTimerWarningMessage', {
		name: 'Warning Message',
		hint: 'Custom message to show when timer reaches the Warning Threshold. Use {name} to insert current combatant name.',
		scope: 'world',
		config: true,
		type: String,
		default: '{name} is running out of time!'
	});

	// -- Warning Sound --
	game.settings.register(MODULE_ID, 'combatTimerWarningSound', {
		name: 'Warning Sound',
		hint: 'The sound to play when the timer reaches the Warning Threshold.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: COFFEEPUB.arrSOUNDCHOICES,
	});

	// -- Critical Threshold --
	game.settings.register(MODULE_ID, 'combatTimerCriticalThreshold', {
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
	game.settings.register(MODULE_ID, 'combatTimerCriticalMessage', {
		name: 'Critical Message',
		hint: 'Custom message to show when timer is running critically low. Use {name} to insert current combatant name.',
		scope: 'world',
		config: true,
		type: String,
		default: '{name} is running out of time!'
	});

	// -- Critical Sound --
	game.settings.register(MODULE_ID, 'combatTimerCriticalSound', {
		name: 'Critical Sound',
		hint: 'The sound to play when the timer is critical and has almost run out.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: COFFEEPUB.arrSOUNDCHOICES,
	});


	// -- Expired Message --
	game.settings.register(MODULE_ID, 'combatTimerExpiredMessage', {
		name: 'Time Expired Message',
		hint: 'Custom message to show when timer runs out. Use {name} to insert current combatant name.',
		scope: 'world',
		config: true,
		type: String,
		default: '{name}\'s time has expired!'
	});

	// -- Expired Sound --
	game.settings.register(MODULE_ID, 'combatTimeisUpSound', {
		name: 'Expired Sound',
		hint: 'The sound to play when the timer runs out.',
		scope: 'world',
		config: true,
		type: String,
		default: 'none',
		choices: COFFEEPUB.arrSOUNDCHOICES,
	});


	// -- End Turn on Timer Expiration --
	game.settings.register(MODULE_ID, 'combatTimerEndTurn', {
		name: 'End Turn on Expiration',
		hint: 'Automatically end the current turn when the timer expires',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	// -- Auto End Turn Message --
	game.settings.register(MODULE_ID, 'combatTimerAutoAdvanceMessage', {
		name: 'End Turn Message',
		hint: 'Message to show when turn is automatically advanced (use {name} for current combatant)',
		scope: 'world',
		config: true,
		type: String,
		default: '{name}\'s turn was automatically ended due to time expiration.'
	});


	
	// *** STATISTICS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE_ID, "headingH2Statistics", {
		name: 'Combat Statistics',
		hint: 'These settings will allow you to track and share combat statistics.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// ---------- SHARED STAT SETTINGS ----------
	game.settings.register(MODULE_ID, "headingH3SharedStats", {
		name: 'Global Settings',
		hint: 'These settings apply to both Round Stats and Combat Stats that can be shared at the end of each round or combat session.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------


	// Combat Statistics Settings
	game.settings.register(MODULE_ID, 'trackCombatStats', {
		name: 'Track Combat Statistics',
		hint: 'Enable tracking and reporting of combat round statistics (turn durations, timer expirations, etc.)',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});



	game.settings.register(MODULE_ID, 'trackPlayerStats', {
		name: 'Track Player Statistics',
		hint: 'Enable detailed tracking of player statistics including attacks, healing, and more. This data persists between sessions.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});

	game.settings.register(MODULE_ID, 'shareCombatStats', {
		name: 'Share With Players',
		hint: 'If enabled, combat statistics will be shared to all players. If disabled, only the GM will see them.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE_ID, 'cookiesRememberCardStates', {
		name: 'Remember Card States',
		hint: 'If enabled, the collapsed/expanded state of cards will be remembered between sessions using cookies.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});



	// ---------- ROUND STATS ----------
	game.settings.register(MODULE_ID, "headingH3RoundStats", {
		name: 'ROUND Statistics',
		hint: 'These settings apply to the End-of-Round statistics.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	game.settings.register(MODULE_ID, 'showRoundSummary', {
		name: 'Show Round Summary',
		hint: 'Show the round summary section with duration, planning, accuracy, and other key metrics.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	}); 

	game.settings.register(MODULE_ID, 'showRoundMVP', {
		name: 'Show Round MVP',
		hint: 'Show the MVP section highlighting the best performer of the round.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	}); 

	game.settings.register(MODULE_ID, 'showNotableMoments', {
		name: 'Show Notable Moments',
		hint: 'Show the notable moments section in combat statistics.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	}); 

	game.settings.register(MODULE_ID, 'showPartyBreakdown', {
		name: 'Show Party Breakdown',
		hint: 'Show the detailed breakdown of each party member performance.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});


	// THESE ARE OLD SETTINGS FOR COMBAT STATS THAT WE HAVEN"T USED YET. THEY ARE IN THE COMBAT_STATS.JS FILE, BUT WE WILL REUILB IT.

	// ---------- COMBAT STATS ----------
	game.settings.register(MODULE_ID, "headingH3CombatStats", {
		name: 'Combat Stats',
		hint: '(COMIN SOON) These settings apply to Combat Stats that can be shared at the end of each combat session.',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------





	// *** DEBUG SETTINGS ***

	// ---------- SUBHEADING ----------
	game.settings.register(MODULE_ID, "headingH2Debug", {
		name: MODULE_ID + '.headingH2Debug-Label',
		hint: MODULE_ID + '.headingH2Debug-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	
	// ---------- CONSOLE SETTINGS ----------
	game.settings.register(MODULE_ID, "headingH3simpleConsole", {
		name: MODULE_ID + '.headingH3simpleConsole-Label',
		hint: MODULE_ID + '.headingH3simpleConsole-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------

	// -- LOG FANCY CONSOLE --
	game.settings.register(MODULE_ID, 'globalFancyConsole', {
		name: MODULE_ID + '.globalFancyConsole-Label',
		hint: MODULE_ID + '.globalFancyConsole-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: true,
	});
	// ---------- DEBUG SETTINGS ----------
	game.settings.register(MODULE_ID, "headingH3simpleDebug", {
		name: MODULE_ID + '.headingH3simpleDebug-Label',
		hint: MODULE_ID + '.headingH3simpleDebug-Hint',
		scope: "world",
		config: true,
		default: "",
		type: String,
	});
	// -------------------------------------
	// -- LOG DEBUG SETTINGS --
	game.settings.register(MODULE_ID, 'globalDebugMode', {
		name: MODULE_ID + '.globalDebugMode-Label',
		hint: MODULE_ID + '.globalDebugMode-Hint',
		type: Boolean,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: false,
	});

	// -- LOG DEBUG STYLE--
	game.settings.register(MODULE_ID, 'globalConsoleDebugStyle', {
		name: MODULE_ID + '.globalConsoleDebugStyle-Label',
		hint: MODULE_ID + '.globalConsoleDebugStyle-Hint',
		type: String,
		config: true,
		requiresReload: true,
		scope: 'world',
		default: "fancy",
		choices: {
			'fancy': 'Fancy Pants: Large Font and Boxes',
			'simple': 'Simply Delightful: Colorful Text and Variables',
			'plain': 'Boring and Lame: Default console styles',
		}
	});

	

	// --------------------------------------------------------
	}); // END OF "Hooks.once('ready', async()"
// --------------------------------------------------------


} // END OF "export const registerSettings"

