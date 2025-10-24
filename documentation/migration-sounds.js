/**
 * SOUND MIGRATION TRACKING
 * 
 * This file tracks sound files that were moved from root folders to organized subfolders
 * during the sound library expansion in version 12.1.18.
 * 
 * These duplicate files can be safely removed from the root sounds/ directory
 * as they have been replaced by organized versions in subfolders.
 */

export const soundMigrations = {
    "version": "12.1.18",
    "description": "Sound library reorganization - moved sounds from root to organized subfolders",
    "migrations": [
        {
            "originalPath": "sounds/general-cocktail-ice.mp3",
            "newPath": "sounds/general/general-cocktail-ice.mp3",
            "reason": "Moved to general/ subfolder for better organization",
            "status": "migrated",
            "canDelete": true
        },
        {
            "originalPath": "sounds/general-toilet-flushing.mp3", 
            "newPath": "sounds/general/general-toilet-flushing.mp3",
            "reason": "Moved to general/ subfolder for better organization",
            "status": "migrated",
            "canDelete": true
        },
        {
            "originalPath": "sounds/reaction-ahhhhh.mp3",
            "newPath": "sounds/reactions/reaction-ahhhhh.mp3", 
            "reason": "Moved to reactions/ subfolder for better organization",
            "status": "migrated",
            "canDelete": true
        },
        {
            "originalPath": "sounds/reaction-oooooh.mp3",
            "newPath": "sounds/reactions/reaction-oooooh.mp3",
            "reason": "Moved to reactions/ subfolder for better organization", 
            "status": "migrated",
            "canDelete": true
        }
    ],
    
    "summary": {
        "totalMigrations": 4,
        "filesToDelete": 4,
        "categoriesAffected": ["general", "reactions"],
        "migrationDate": "2024-12-19"
    },
    
    "notes": [
        "All migrated sounds maintain the same functionality",
        "Assets.js has been updated to point to new subfolder locations",
        "Old root folder files can be safely deleted",
        "No breaking changes - all sound references updated automatically"
    ]
};

/**
 * UTILITY FUNCTIONS
 */

/**
 * Get list of files that can be safely deleted
 * @returns {Array} Array of file paths that can be deleted
 */
export function getFilesToDelete() {
    return soundMigrations.migrations
        .filter(migration => migration.canDelete)
        .map(migration => migration.originalPath);
}

/**
 * Get migration summary
 * @returns {Object} Summary of migration data
 */
export function getMigrationSummary() {
    return soundMigrations.summary;
}

/**
 * Check if a file was migrated
 * @param {string} filePath - Path to check
 * @returns {Object|null} Migration data if found, null otherwise
 */
export function getMigrationInfo(filePath) {
    return soundMigrations.migrations.find(migration => 
        migration.originalPath === filePath || migration.newPath === filePath
    );
}
