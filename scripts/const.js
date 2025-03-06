// ================================================================== 
// ===== EXPORTS ====================================================
// ================================================================== 

export const MODULE_TITLE = 'BLACKSMITH';
export const MODULE_ID = 'coffee-pub-blacksmith';

// Coffee Pub Module IDs
export const COFFEE_PUB_MODULES = {
    BLACKSMITH: MODULE_ID,
    BIBLIOSOPH: 'coffee-pub-bibliosoph',
    CRIER: 'coffee-pub-crier',
    SCRIBE: 'coffee-pub-scribe'
};

// API Version
export const API_VERSION = '1.0.0';

export const BLACKSMITH = {
    BOT_NAME: "Regent",
    FANCY_DATE_TIME: "",
    WINDOW_QUERY_TITLE: "Consult the Regent",
    WINDOW_QUERY_FORMTITLE: "Title",
    WINDOW_QUERY: `modules/${MODULE_ID}/templates/window-query.hbs`,
    WINDOW_QUERY_MESSAGE: `modules/${MODULE_ID}/templates/window-element-message.hbs`,

    JOURNAL_NARRATIVE_TEMPLATE: `modules/${MODULE_ID}/templates/journal-narrative.hbs`,
    JOURNAL_INJURY_TEMPLATE: `modules/${MODULE_ID}/templates/journal-injury.hbs`,
    // These get overriden as soon as the settings and everything else loads.
    blnDebugOn: false, // Display debug messages
    blnFancyConsole: false, // Display Colorful Console
    strConsoleDebugStyle: "simple" // Display colors but not boxes
}

