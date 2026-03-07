// ==================================================================
// ===== HERALD CONSTANTS ============================================
// ==================================================================

const moduleData = {
    id: "coffee-pub-herald",
    title: "Coffee Pub Herald",
    version: "1.0.0",
    authors: [{ name: "COFFEE PUB" }]
};

export const MODULE = {
    ID: moduleData.id,
    NAME: "HERALD",
    TITLE: moduleData.title,
    VERSION: moduleData.version,
    AUTHOR: moduleData.authors[0]?.name || "COFFEE PUB",
    APIVERSION: "13.0.0"
};
