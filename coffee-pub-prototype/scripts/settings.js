// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE } from './const.js';


// ================================================================== 
// ===== CONSTANTS ====================================================
// ================================================================== 

/**
 * WROKFLOW GROUPS
 * Use workflow groups to organize settings into visual sections
 * This will allow the global CSS rules to style the settings window.
 */
const WORKFLOW_GROUPS = {
    GETTING_STARTED: 'getting-started',
    COMMON_SETTINGS: 'common-settings',
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
// ===== SETTINGS REGISTRATION ======================================
// ================================================================== 

/**
 * STYLING AND FORMATTING
 * Use registerHeader() to register headers with reduced verbosity while preserving CSS styling
 * This function will register the header with the following parameters:
 * - id: Unique identifier for the header
 * - labelKey: Localization key for the label
 * - hintKey: Localization key for the hint
 * - level: Header level (H1, H2, H3, H4, or HR)
 * - group: Workflow group for collapsible sections
 * Example: registerHeader('ExampleSubheader', 'headingH3ExampleSubheader-Label', 'headingH3ExampleSubheader-Hint', 'H3', WORKFLOW_GROUPS.COMMON_SETTINGS);
 * This will register the header with the following parameters:
 * - id: ExampleSubheader
 * - labelKey: headingH3ExampleSubheader-Label
 * - hintKey: headingH3ExampleSubheader-Hint
 * - level: H3
 * - group: COMMON_SETTINGS
 */



/**
 * Register all module settings
 * Called during the 'ready' phase when Foundry is ready
 */
export const registerSettings = () => {
   
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
	// -- H2: COMMON SETTINGS
	// --------------------------------------
	registerHeader('CommonSettings', 'headingH2CommonSettings-Label', 'headingH2CommonSettings-Hint', 'H2', WORKFLOW_GROUPS.COMMON_SETTINGS);


    // --------------------------------------
	// -- H3: EXAMPLE SUBHEADER
	// --------------------------------------
	registerHeader('ExampleSubheader', 'headingH3ExampleSubheader-Label', 'headingH3ExampleSubheader-Hint', 'H3', WORKFLOW_GROUPS.COMMON_SETTINGS);

    // -- Example Setting --
	game.settings.register(MODULE.ID, 'exampleSetting', {
        name: MODULE.ID + '.exampleSetting-Label',
        hint: MODULE.ID + '.exampleSetting-Hint',
        scope: 'world',
        config: true,
        default: "Example Value",
        type: String,
		group: WORKFLOW_GROUPS.COMMON_SETTINGS
	});

    // Add more settings here as needed
    



    // *** REPORT SETTINGS LOADED ***
    // Note: BlacksmithUtils is available globally after importing BlacksmithAPI in the main file
    if (typeof BlacksmithUtils !== 'undefined' && BlacksmithUtils.postConsoleAndNotification) {
        BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `${MODULE.NAME}: Settings registered.`, null, false, false);
    } else {
        console.log(`${MODULE.NAME}: Settings registered.`);
    }
};

