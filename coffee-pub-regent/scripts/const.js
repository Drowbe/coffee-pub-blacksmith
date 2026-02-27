// ==================================================================
// ===== REGENT MODULE CONSTANTS ====================================
// ==================================================================

const MODULE_ID = 'coffee-pub-regent';

export async function getModuleJson(relative = "../module.json") {
    const url = new URL(relative, import.meta.url).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.json();
}

function getModuleCodeName(moduleId) {
    if (!moduleId || typeof moduleId !== "string") return "";
    const parts = moduleId.split("-");
    return parts.at(-1)?.toUpperCase() ?? "";
}

let moduleData;
try {
    moduleData = await getModuleJson();
} catch (_) {
    moduleData = {
        id: MODULE_ID,
        title: "Coffee Pub Regent",
        version: "1.0.0",
        description: "Optional AI tools for Coffee Pub.",
        authors: [{ name: "COFFEE PUB" }]
    };
}

const strName = getModuleCodeName(moduleData.id);

export const MODULE = {
    ID: moduleData.id,
    NAME: strName,
    TITLE: moduleData.title,
    VERSION: moduleData.version,
    AUTHOR: moduleData.authors?.[0]?.name || "COFFEE PUB",
    DESCRIPTION: moduleData.description,
    APIVERSION: "13.0.0"
};

export const REGENT = {
    BOT_NAME: "Regent",
    WINDOW_QUERY_TITLE: "Consult the Regent",
    WINDOW_QUERY: `modules/${MODULE.ID}/templates/window-query.hbs`,
    WINDOW_QUERY_MESSAGE: `modules/${MODULE.ID}/templates/partial-message.hbs`
};
