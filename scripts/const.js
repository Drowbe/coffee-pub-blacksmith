// ================================================================== 
// ===== EXTRACTIONS ================================================
// ================================================================== 

// Get Module Data
export async function getModuleJson(relative = "../module.json") {
    const url = new URL(relative, import.meta.url).href; // resolves relative to THIS file
    // return await foundry.utils.fetchJsonWithTimeout(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.json();
}
const moduleData = await getModuleJson();
/**
 * Extracts the last segment of a module id and uppercases it.
 * Example: "coffee-pub-blacksmith" -> "BLACKSMITH"
 */
function getModuleCodeName(moduleId) {
    if (!moduleId || typeof moduleId !== "string") return "";
    const parts = moduleId.split("-");
    return parts.at(-1)?.toUpperCase() ?? "";
}
const strName = getModuleCodeName(moduleData.id);
// Post the data
console.log(moduleData.title, `Module ID: `, moduleData.id);
console.log(moduleData.title, `Module Name: `, strName);
console.log(moduleData.title, `Module Title: `, moduleData.title);
console.log(moduleData.title, `Module Version: `, moduleData.version);
console.log(moduleData.title, `Module Author: `, moduleData.authors[0]?.name);
console.log(moduleData.title, `Module Description: `, moduleData.description);

// ================================================================== 
// ===== EXPORTS ====================================================
// ================================================================== 

// MODULE CONSTANTS
export const MODULE = {
    ID: moduleData.id, 
    NAME: strName, // Extracted from moduleData.title
    TITLE: moduleData.title,
    VERSION: moduleData.version, 
    AUTHOR: moduleData.authors[0]?.name || 'COFFEE PUB',
    DESCRIPTION: moduleData.description,
    APIVERSION: "12.2.0"
};

export const BLACKSMITH = {
    BOT_NAME: "Regent",
    FANCY_DATE_TIME: "",
    WINDOW_QUERY_TITLE: "Consult the Regent",
    WINDOW_QUERY_FORMTITLE: "Title",
    WINDOW_QUERY: `modules/${MODULE.ID}/templates/window-query.hbs`,
    WINDOW_QUERY_MESSAGE: `modules/${MODULE.ID}/templates/partial-message.hbs`,

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

