// ================================================================== 
// ===== TOKEN IMAGE REPLACEMENT CACHING SYSTEM =====================
// ================================================================== 

import { MODULE_ID, MODULE_TITLE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class TokenImageReplacement {
    static ID = 'token-image-replacement';
    
    // Cache structure for storing file information
    static cache = {
        files: new Map(),           // filename -> full path mapping
        folders: new Map(),         // folder path -> array of files
        creatureTypes: new Map(),   // creature type -> array of files
        lastScan: null,            // timestamp of last scan
        isScanning: false,         // prevent multiple simultaneous scans
        totalFiles: 0              // total count for progress tracking
    };
    
    // Supported image formats
    static SUPPORTED_FORMATS = ['.webp', '.png', '.jpg', '.jpeg'];
    
    // Creature type to folder mapping (D&D 5e common types)
    static CREATURE_TYPE_FOLDERS = {
        'aberration': ['aberrations', 'aberration', 'creatures'],
        'beast': ['beasts', 'beast', 'creatures', 'animals'],
        'celestial': ['celestials', 'celestial', 'creatures'],
        'construct': ['constructs', 'construct', 'creatures'],
        'dragon': ['dragons', 'dragon', 'creatures'],
        'elemental': ['elementals', 'elemental', 'creatures'],
        'fey': ['fey', 'creatures'],
        'fiend': ['fiends', 'fiend', 'creatures', 'demons', 'devils'],
        'giant': ['giants', 'giant', 'creatures'],
        'humanoid': ['humanoids', 'humanoid', 'creatures', 'npcs'],
        'monstrosity': ['monstrosities', 'monstrosity', 'creatures'],
        'ooze': ['oozes', 'ooze', 'creatures'],
        'plant': ['plants', 'plant', 'creatures'],
        'undead': ['undead', 'creatures'],
        'vehicle': ['vehicles', 'vehicle'],
        'npc': ['npcs', 'npc', 'humanoids', 'humanoid']
    };
    
    static initialize() {
        // Initialize the caching system when the module is ready
        Hooks.once('ready', this._initializeCache.bind(this));
        
        // Hook into token creation for image replacement
        Hooks.on('createToken', this._onTokenCreated.bind(this));
        
        // Add test function to global scope for debugging (moved to ready hook)
        Hooks.once('ready', () => {
            if (game.user.isGM) {
                game.TokenImageReplacement = this;
                postConsoleAndNotification("Token Image Replacement: Debug functions available via game.TokenImageReplacement", "", false, false, false);
            }
        });
    }
    
    /**
     * Initialize the cache system
     */
    static async _initializeCache() {
        postConsoleAndNotification("Token Image Replacement: Initializing cache system...", "", false, false, false);
        
        // Only initialize if the feature is enabled
        if (!game.settings.get(MODULE_ID, 'tokenImageReplacementEnabled')) {
            postConsoleAndNotification("Token Image Replacement: Feature disabled in settings", "", false, false, false);
            return;
        }
        
        const basePath = game.settings.get(MODULE_ID, 'tokenImageReplacementPath');
        if (!basePath) {
            postConsoleAndNotification("Token Image Replacement: No base path configured", "", false, false, false);
            return;
        }
        
        postConsoleAndNotification(`Token Image Replacement: Using base path: ${basePath}`, "", false, false, false);
        
        // Start background scan
        this._scanFolderStructure(basePath);
    }
    
    /**
     * Scan the folder structure and build the cache
     */
    static async _scanFolderStructure(basePath) {
        if (this.cache.isScanning) {
            postConsoleAndNotification("Token Image Replacement: Scan already in progress", "", false, false, false);
            return;
        }
        
        this.cache.isScanning = true;
        postConsoleAndNotification("Token Image Replacement: Starting folder scan...", "", false, false, false);
        
        try {
            // Use Foundry's FilePicker to get directory contents
            const files = await this._getDirectoryContents(basePath);
            
            // Process and categorize files
            this._processFiles(files, basePath);
            
            this.cache.lastScan = Date.now();
            this.cache.totalFiles = this.cache.files.size;
            
            postConsoleAndNotification(`Token Image Replacement: Cache built successfully. Found ${this.cache.totalFiles} files.`, "", false, false, false);
            
        } catch (error) {
            postConsoleAndNotification(`Token Image Replacement: Error scanning folders: ${error.message}`, "", false, true, false);
        } finally {
            this.cache.isScanning = false;
        }
    }
    
    /**
     * Get directory contents using Foundry's FilePicker API
     */
    static async _getDirectoryContents(basePath) {
        const files = [];
        
        try {
            // For now, we'll use a simple approach - in a real implementation,
            // we'd need to recursively scan directories
            // This is a placeholder for the actual directory scanning logic
            
            // TODO: Implement actual directory scanning
            // For Phase 2, we'll focus on the cache structure and basic functionality
            
            postConsoleAndNotification("Token Image Replacement: Directory scanning placeholder - will implement in next phase", "", false, false, false);
            
        } catch (error) {
            postConsoleAndNotification(`Token Image Replacement: Error getting directory contents: ${error.message}`, "", false, true, false);
        }
        
        return files;
    }
    
    /**
     * Process and categorize files for the cache
     */
    static _processFiles(files, basePath) {
        // Clear existing cache
        this.cache.files.clear();
        this.cache.folders.clear();
        this.cache.creatureTypes.clear();
        
        for (const file of files) {
            // Extract filename and path information
            const fileName = file.name || file;
            const filePath = file.path || file;
            
            // Store in main files cache
            this.cache.files.set(fileName.toLowerCase(), {
                name: fileName,
                path: filePath,
                fullPath: `${basePath}/${filePath}`,
                size: file.size || 0,
                lastModified: file.lastModified || Date.now()
            });
            
            // Categorize by folder
            this._categorizeFile(fileName, filePath);
        }
    }
    
    /**
     * Categorize a file by its folder structure
     */
    static _categorizeFile(fileName, filePath) {
        // Extract folder path
        const folderPath = filePath.split('/').slice(0, -1).join('/');
        
        // Add to folders cache
        if (!this.cache.folders.has(folderPath)) {
            this.cache.folders.set(folderPath, []);
        }
        this.cache.folders.get(folderPath).push(fileName);
        
        // Try to categorize by creature type based on folder names
        this._categorizeByCreatureType(fileName, folderPath);
    }
    
    /**
     * Categorize files by creature type based on folder structure
     */
    static _categorizeByCreatureType(fileName, folderPath) {
        const folderLower = folderPath.toLowerCase();
        
        for (const [creatureType, folderNames] of Object.entries(this.CREATURE_TYPE_FOLDERS)) {
            for (const folderName of folderNames) {
                if (folderLower.includes(folderName.toLowerCase())) {
                    if (!this.cache.creatureTypes.has(creatureType)) {
                        this.cache.creatureTypes.set(creatureType, []);
                    }
                    this.cache.creatureTypes.get(creatureType).push(fileName);
                    return; // Found a match, no need to check other types
                }
            }
        }
    }
    
    /**
     * Find a matching image for a token
     */
    static findMatchingImage(tokenDocument) {
        // Check if feature is enabled
        if (!game.settings.get(MODULE_ID, 'tokenImageReplacementEnabled')) {
            return null;
        }
        
        // Check if we should skip this token type
        if (!this._shouldUpdateToken(tokenDocument)) {
            return null;
        }
        
        // Check if cache is ready
        if (this.cache.files.size === 0) {
            postConsoleAndNotification("Token Image Replacement: Cache not ready, skipping image replacement", "", false, false, false);
            return null;
        }
        
        // Get search terms for this token
        const searchTerms = this._getSearchTerms(tokenDocument);
        
        // Try to find a match
        const match = this._findBestMatch(searchTerms, tokenDocument);
        
        if (match) {
            postConsoleAndNotification(`Token Image Replacement: Found match for ${tokenDocument.name}: ${match.name}`, "", false, false, false);
            return match;
        }
        
        return null;
    }
    
    /**
     * Determine if we should update this token
     */
    static _shouldUpdateToken(tokenDocument) {
        // Skip linked tokens if setting is enabled
        if (game.settings.get(MODULE_ID, 'tokenImageReplacementSkipLinked') && tokenDocument.actorLink) {
            return false;
        }
        
        // Check token type settings
        const actorType = tokenDocument.actor?.type || 'npc';
        
        switch (actorType) {
            case 'npc':
                return game.settings.get(MODULE_ID, 'tokenImageReplacementUpdateNPCs');
            case 'vehicle':
                return game.settings.get(MODULE_ID, 'tokenImageReplacementUpdateVehicles');
            case 'character':
                return game.settings.get(MODULE_ID, 'tokenImageReplacementUpdateActors');
            default:
                // Assume monster for other types
                return game.settings.get(MODULE_ID, 'tokenImageReplacementUpdateMonsters');
        }
    }
    
    /**
     * Get search terms for finding a matching image
     */
    static _getSearchTerms(tokenDocument) {
        const terms = [];
        
        // Priority 1: Represented Actor name (if different from token name)
        if (tokenDocument.actor && tokenDocument.actor.name !== tokenDocument.name) {
            terms.push(tokenDocument.actor.name);
        }
        
        // Priority 2: Token name
        terms.push(tokenDocument.name);
        
        // Priority 3: Base name (remove parentheticals and numbers)
        const baseName = tokenDocument.name.replace(/\([^)]*\)/g, '').replace(/\s*\d+$/, '').trim();
        if (baseName && baseName !== tokenDocument.name) {
            terms.push(baseName);
        }
        
        // Priority 4: Creature type for folder optimization
        if (tokenDocument.actor?.system?.details?.type) {
            terms.push(tokenDocument.actor.system.details.type);
        }
        
        return terms;
    }
    
    /**
     * Find the best matching image for the given search terms
     */
    static _findBestMatch(searchTerms, tokenDocument) {
        // First, try to optimize search scope using creature type
        const creatureType = tokenDocument.actor?.system?.details?.type?.toLowerCase();
        let searchScope = this.cache.files;
        
        if (creatureType && this.cache.creatureTypes.has(creatureType)) {
            // Use creature type specific files for faster searching
            const creatureFiles = this.cache.creatureTypes.get(creatureType);
            searchScope = new Map();
            for (const fileName of creatureFiles) {
                const fileInfo = this.cache.files.get(fileName.toLowerCase());
                if (fileInfo) {
                    searchScope.set(fileName.toLowerCase(), fileInfo);
                }
            }
        }
        
        // Try exact matches first
        for (const term of searchTerms) {
            if (!term) continue;
            
            const exactMatch = this._findExactMatch(term, searchScope);
            if (exactMatch) {
                return exactMatch;
            }
        }
        
        // Try partial matches
        for (const term of searchTerms) {
            if (!term) continue;
            
            const partialMatch = this._findPartialMatch(term, searchScope);
            if (partialMatch) {
                return partialMatch;
            }
        }
        
        return null;
    }
    
    /**
     * Find exact match for a search term
     */
    static _findExactMatch(term, searchScope) {
        const termLower = term.toLowerCase();
        
        // Try exact filename match
        if (searchScope.has(termLower)) {
            return searchScope.get(termLower);
        }
        
        // Try exact match with file extension
        for (const ext of this.SUPPORTED_FORMATS) {
            const fileNameWithExt = termLower + ext;
            if (searchScope.has(fileNameWithExt)) {
                return searchScope.get(fileNameWithExt);
            }
        }
        
        return null;
    }
    
    /**
     * Find partial match for a search term
     */
    static _findPartialMatch(term, searchScope) {
        const termLower = term.toLowerCase();
        
        // Look for files that contain the search term
        for (const [fileName, fileInfo] of searchScope) {
            if (fileName.includes(termLower)) {
                return fileInfo;
            }
        }
        
        return null;
    }
    
    /**
     * Hook for when tokens are created
     */
    static async _onTokenCreated(tokenDocument, options, userId) {
        postConsoleAndNotification(`Token Image Replacement: Token created: ${tokenDocument.name}`, "", false, false, false);
        
        // Only process if we're a GM and the feature is enabled
        if (!game.user.isGM) {
            postConsoleAndNotification("Token Image Replacement: Not a GM, skipping", "", false, false, false);
            return;
        }
        
        if (!game.settings.get(MODULE_ID, 'tokenImageReplacementEnabled')) {
            postConsoleAndNotification("Token Image Replacement: Feature disabled, skipping", "", false, false, false);
            return;
        }
        
        // Find matching image
        const matchingImage = this.findMatchingImage(tokenDocument);
        
        if (matchingImage) {
            // Apply the image replacement
            try {
                await tokenDocument.update({
                    'texture.src': matchingImage.fullPath
                });
                
                postConsoleAndNotification(`Token Image Replacement: Applied ${matchingImage.name} to ${tokenDocument.name}`, "", false, false, false);
            } catch (error) {
                postConsoleAndNotification(`Token Image Replacement: Error applying image: ${error.message}`, "", false, true, false);
            }
        } else {
            postConsoleAndNotification(`Token Image Replacement: No matching image found for ${tokenDocument.name}`, "", false, false, false);
        }
    }
    
    /**
     * Get cache statistics
     */
    static getCacheStats() {
        return {
            totalFiles: this.cache.totalFiles,
            folders: this.cache.folders.size,
            creatureTypes: this.cache.creatureTypes.size,
            lastScan: this.cache.lastScan,
            isScanning: this.cache.isScanning
        };
    }
    
    /**
     * Clear the cache
     */
    static clearCache() {
        this.cache.files.clear();
        this.cache.folders.clear();
        this.cache.creatureTypes.clear();
        this.cache.lastScan = null;
        this.cache.totalFiles = 0;
        
        postConsoleAndNotification("Token Image Replacement: Cache cleared", "", false, false, false);
    }
    
    /**
     * Refresh the cache
     */
    static async refreshCache() {
        const basePath = game.settings.get(MODULE_ID, 'tokenImageReplacementPath');
        if (basePath) {
            await this._scanFolderStructure(basePath);
        }
    }
    
    /**
     * Test function to verify cache structure (for debugging)
     */
    static testCacheStructure() {
        postConsoleAndNotification("Token Image Replacement: Testing cache structure...", "", false, false, false);
        
        // Test with some dummy data
        const testFiles = [
            { name: 'goblin_01.webp', path: 'creatures/goblin_01.webp' },
            { name: 'orc_01.webp', path: 'creatures/orc_01.webp' },
            { name: 'dragon_01.webp', path: 'creatures/dragon_01.webp' }
        ];
        
        this._processFiles(testFiles, 'test/path');
        
        postConsoleAndNotification(`Token Image Replacement: Test cache built. Files: ${this.cache.files.size}, Folders: ${this.cache.folders.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", false, false, false);
        
        // Test categorization
        if (this.cache.creatureTypes.has('humanoid')) {
            postConsoleAndNotification(`Token Image Replacement: Humanoid files: ${this.cache.creatureTypes.get('humanoid').join(', ')}`, "", false, false, false);
        }
        
        // Clear test data
        this.clearCache();
        postConsoleAndNotification("Token Image Replacement: Test cache cleared", "", false, false, false);
    }
}
