// ================================================================== 
// ===== EXPORTS ====================================================
// ================================================================== 

// Import module.json
import moduleData from '../module.json' assert { type: 'json' };

export const MODULE = {
    ID: moduleData.id, // coffee-pub-blacksmith
    NAME: 'BLACKSMITH', // BLACKSMITH or moduleData.title.toUpperCase().replace(/\s+/g, '_')
    TITLE: moduleData.title, // Coffee Pub Blacksmith
    AUTHOR: moduleData.authors[0]?.name || 'COFFEE PUB',
    VERSION: moduleData.version, 
    DESCRIPTION: moduleData.description 
};

// API Version
export const API_VERSION = '1.0.0';

export const BLACKSMITH = {
    BOT_NAME: "Regent",
    FANCY_DATE_TIME: "",
    WINDOW_QUERY_TITLE: "Consult the Regent",
    WINDOW_QUERY_FORMTITLE: "Title",
    WINDOW_QUERY: `modules/${MODULE.ID}/templates/window-query.hbs`,
    WINDOW_QUERY_MESSAGE: `modules/${MODULE.ID}/templates/window-element-message.hbs`,

    JOURNAL_NARRATIVE_TEMPLATE: `modules/${MODULE.ID}/templates/journal-narrative.hbs`,
    JOURNAL_ENCOUNTER_TEMPLATE: `modules/${MODULE.ID}/templates/journal-encounter.hbs`,
    JOURNAL_INJURY_TEMPLATE: `modules/${MODULE.ID}/templates/journal-injury.hbs`,
    JOURNAL_TOOLS_ENTITY_REPLACEMENT_PARTIAL: `modules/${MODULE.ID}/templates/partials/entity-replacement.hbs`,
    JOURNAL_TOOLS_SEARCH_REPLACE_PARTIAL: `modules/${MODULE.ID}/templates/partials/search-replace.hbs`,
    // These get overriden as soon as the settings and everything else loads.
    blnDebugOn: false, // Display debug messages
    blnFancyConsole: false, // Display Colorful Console
    strConsoleDebugStyle: "simple", // Display colors but not boxes
    
    // Unified Roll System API
    rolls: {
        execute: null // Will be set during initialization
    }
}

