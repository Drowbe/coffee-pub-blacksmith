// ==================================================================
// ===== ILLUMINATOR CONSTANTS ======================================
// ==================================================================

const moduleData = {
    id: "coffee-pub-illuminator",
    title: "Coffee Pub Illuminator",
    version: "13.0.0",
    authors: [{ name: "COFFEE PUB" }]
};

export const MODULE = {
    ID: moduleData.id,
    NAME: "ILLUMINATOR",
    TITLE: moduleData.title,
    VERSION: moduleData.version,
    AUTHOR: moduleData.authors[0]?.name || "COFFEE PUB",
    APIVERSION: "13.0.0"
};
