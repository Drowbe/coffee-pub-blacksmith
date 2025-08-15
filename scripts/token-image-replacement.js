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
                postConsoleAndNotification("Token Image Replacement: Available test functions:", "", false, false, false);
                postConsoleAndNotification("  - testCacheStructure() - Test basic cache functionality", "", false, false, false);
                postConsoleAndNotification("  - testMatchingAlgorithm() - Test matching logic", "", false, false, false);
                postConsoleAndNotification("  - refreshCache() - Manually refresh the cache", "", false, false, false);
                postConsoleAndNotification("  - getCacheStats() - View cache statistics", "", false, false, false);
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
        const startTime = Date.now();
        postConsoleAndNotification("Token Image Replacement: Starting folder scan...", "", false, false, false);
        
        try {
            // Use Foundry's FilePicker to get directory contents
            const files = await this._getDirectoryContents(basePath);
            
            if (files.length === 0) {
                postConsoleAndNotification("Token Image Replacement: No supported image files found", "", false, false, false);
                return;
            }
            
            // Process and categorize files
            this._processFiles(files, basePath);
            
            this.cache.lastScan = Date.now();
            this.cache.totalFiles = this.cache.files.size;
            
            const scanTime = ((Date.now() - startTime) / 1000).toFixed(2);
            postConsoleAndNotification(`Token Image Replacement: Cache built successfully in ${scanTime}s. Found ${this.cache.totalFiles} files across ${this.cache.folders.size} folders.`, "", false, false, false);
            
            // Log some statistics about the cache
            this._logCacheStatistics();
            
        } catch (error) {
            postConsoleAndNotification(`Token Image Replacement: Error scanning folders: ${error.message}`, "", false, true, false);
        } finally {
            this.cache.isScanning = false;
        }
    }
    
    /**
     * Log cache statistics for debugging
     */
    static _logCacheStatistics() {
        if (this.cache.creatureTypes.size > 0) {
            postConsoleAndNotification("Token Image Replacement: Creature type breakdown:", "", false, false, false);
            for (const [creatureType, files] of this.cache.creatureTypes) {
                postConsoleAndNotification(`  ${creatureType}: ${files.length} files`, "", false, false, false);
            }
        }
        
        if (this.cache.folders.size > 0) {
            postConsoleAndNotification(`Token Image Replacement: Top folders by file count:`, "", false, false, false);
            const sortedFolders = Array.from(this.cache.folders.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 5);
            
            for (const [folder, files] of sortedFolders) {
                postConsoleAndNotification(`  ${folder}: ${files.length} files`, "", false, false, false);
            }
        }
    }
    
    /**
     * Get directory contents using Foundry's FilePicker API
     */
    static async _getDirectoryContents(basePath) {
        const files = [];
        
        try {
            postConsoleAndNotification(`Token Image Replacement: Scanning directory: ${basePath}`, "", false, false, false);
            
            // Use Foundry's FilePicker to browse the directory
            const response = await FilePicker.browse("data", basePath);
            
            // Log what we found for debugging
            postConsoleAndNotification(`Token Image Replacement: Directory scan results - Files: ${response.files?.length || 0}, Subdirectories: ${response.dirs?.length || 0}`, "", false, false, false);
            
            // Process files in the base directory (if any)
            if (response.files && response.files.length > 0) {
                postConsoleAndNotification(`Token Image Replacement: Found ${response.files.length} files in base directory`, "", false, false, false);
                
                for (const filePath of response.files) {
                    const fileInfo = await this._processFileInfo(filePath, basePath);
                    if (fileInfo) {
                        files.push(fileInfo);
                    }
                }
            }
            
            // Always scan subdirectories (this is where most token files will be)
            if (response.dirs && response.dirs.length > 0) {
                postConsoleAndNotification(`Token Image Replacement: Found ${response.dirs.length} subdirectories, scanning recursively...`, "", false, false, false);
                
                for (let i = 0; i < response.dirs.length; i++) {
                    const subDir = response.dirs[i];
                    postConsoleAndNotification(`Token Image Replacement: Scanning subdirectory ${i + 1} of ${response.dirs.length}: ${subDir}`, "", false, false, false);
                    const subDirFiles = await this._scanSubdirectory(subDir, basePath);
                    files.push(...subDirFiles);
                    
                    // Log progress every few subdirectories
                    if ((i + 1) % 2 === 0 || i === response.dirs.length - 1) {
                        postConsoleAndNotification(`Token Image Replacement: Progress: ${i + 1}/${response.dirs.length} subdirectories scanned, ${files.length} files found so far`, "", false, false, false);
                    }
                }
            }
            
            if (files.length === 0) {
                postConsoleAndNotification(`Token Image Replacement: No supported image files found in ${basePath} or its subdirectories`, "", false, false, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(`Token Image Replacement: Error scanning directory ${basePath}: ${error.message}`, "", false, true, false);
        }
        
        return files;
    }
    
    /**
     * Scan a subdirectory recursively
     */
    static async _scanSubdirectory(subDir, basePath) {
        const files = [];
        
        try {
            const response = await FilePicker.browse("data", subDir);
            
            if (response.files && response.files.length > 0) {
                postConsoleAndNotification(`Token Image Replacement: Found ${response.files.length} files in ${subDir}`, "", false, false, false);
                
                for (const filePath of response.files) {
                    const fileInfo = await this._processFileInfo(filePath, basePath);
                    if (fileInfo) {
                        files.push(fileInfo);
                    }
                }
            }
            
            // Recursively scan deeper subdirectories
            if (response.dirs && response.dirs.length > 0) {
                postConsoleAndNotification(`Token Image Replacement: Found ${response.dirs.length} deeper subdirectories in ${subDir}`, "", false, false, false);
                
                for (const deeperDir of response.dirs) {
                    const deeperFiles = await this._scanSubdirectory(deeperDir, basePath);
                    files.push(...deeperFiles);
                }
            }
            
        } catch (error) {
            postConsoleAndNotification(`Token Image Replacement: Error scanning subdirectory ${subDir}: ${error.message}`, "", false, false, false);
        }
        
        return files;
    }
    
    /**
     * Process file information and filter for supported formats
     */
    static async _processFileInfo(filePath, basePath) {
        // Check if file has supported extension
        const extension = filePath.split('.').pop()?.toLowerCase();
        if (!this.SUPPORTED_FORMATS.includes(`.${extension}`)) {
            return null;
        }
        
        // Extract relative path from base path
        const relativePath = filePath.replace(`${basePath}/`, '');
        const fileName = filePath.split('/').pop();
        
        // Get file stats if possible
        let fileSize = 0;
        let lastModified = Date.now();
        
        try {
            // Try to get file information using FilePicker
            const fileInfo = await FilePicker.browse("data", filePath);
            if (fileInfo && fileInfo.files && fileInfo.files.length > 0) {
                // For now, we'll use basic info - in a real implementation,
                // we might want to get actual file size and modification date
                fileSize = 0; // Placeholder
                lastModified = Date.now(); // Placeholder
            }
        } catch (error) {
            // File info not available, use defaults
            postConsoleAndNotification(`Token Image Replacement: Could not get file info for ${filePath}: ${error.message}`, "", false, false, false);
        }
        
        return {
            name: fileName,
            path: relativePath,
            fullPath: filePath,
            size: fileSize,
            lastModified: lastModified
        };
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
        
        // Priority 4: Individual words from the name for better matching
        const words = tokenDocument.name.toLowerCase().split(/[\s\-_()]+/).filter(word => word.length > 2);
        terms.push(...words);
        
        // Priority 5: Creature type for folder optimization
        if (tokenDocument.actor?.system?.details?.type) {
            terms.push(tokenDocument.actor.system.details.type);
        }
        
        // Remove duplicates and empty terms
        return [...new Set(terms.filter(term => term && term.trim().length > 0))];
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
        
        // Score-based matching system
        let bestMatch = null;
        let bestScore = 0;
        
        for (const [fileName, fileInfo] of searchScope) {
            const score = this._calculateMatchScore(fileName, searchTerms, tokenDocument);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = fileInfo;
            }
        }
        
        // Only return matches with a reasonable score
        if (bestScore >= 0.3) {
            postConsoleAndNotification(`Token Image Replacement: Best match for ${tokenDocument.name}: ${bestMatch.name} (score: ${bestScore.toFixed(2)})`, "", false, false, false);
            return bestMatch;
        }
        
        return null;
    }
    
    /**
     * Calculate a match score for a filename against search terms
     */
    static _calculateMatchScore(fileName, searchTerms, tokenDocument) {
        const fileNameLower = fileName.toLowerCase();
        let totalScore = 0;
        let termCount = 0;
        
        for (const term of searchTerms) {
            if (!term || term.length < 2) continue;
            
            const termLower = term.toLowerCase();
            let termScore = 0;
            
            // Exact filename match (highest priority)
            if (fileNameLower === termLower) {
                termScore = 1.0;
            }
            // Exact match without extension
            else if (fileNameLower.replace(/\.[^.]*$/, '') === termLower) {
                termScore = 0.9;
            }
            // Filename starts with term
            else if (fileNameLower.startsWith(termLower)) {
                termScore = 0.8;
            }
            // Filename ends with term
            else if (fileNameLower.endsWith(termLower)) {
                termScore = 0.7;
            }
            // Term is contained within filename
            else if (fileNameLower.includes(termLower)) {
                termScore = 0.6;
            }
            // Partial word match (for compound terms)
            else {
                const fileNameWords = fileNameLower.split(/[\s\-_()]+/);
                for (const word of fileNameWords) {
                    if (word.includes(termLower) || termLower.includes(word)) {
                        termScore = Math.max(termScore, 0.4);
                    }
                }
            }
            
            // Bonus for creature type matches
            if (tokenDocument.actor?.system?.details?.type) {
                const creatureType = tokenDocument.actor.system.details.type.toLowerCase();
                if (fileNameLower.includes(creatureType) || fileNameLower.includes(creatureType + 's')) {
                    termScore += 0.2;
                }
            }
            
            totalScore += termScore;
            termCount++;
        }
        
        // Normalize score by number of terms
        return termCount > 0 ? totalScore / termCount : 0;
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
        
        postConsoleAndNotification(`Token Image Replacement: Test cache built. Files: ${this.cache.files.size}, Folders: ${this.cache.files.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", false, false, false);
        
        // Test categorization
        if (this.cache.creatureTypes.has('humanoid')) {
            postConsoleAndNotification(`Token Image Replacement: Humanoid files: ${this.cache.creatureTypes.get('humanoid').join(', ')}`, "", false, false, false);
        }
        
        // Clear test data
        this.clearCache();
        postConsoleAndNotification("Token Image Replacement: Test cache cleared", "", false, false, false);
    }
    
    /**
     * Test the matching algorithm with a mock token
     */
    static testMatchingAlgorithm() {
        postConsoleAndNotification("Token Image Replacement: Testing matching algorithm...", "", false, false, false);
        
        // First build a test cache
        const testFiles = [
            { name: 'goblin_warrior_01.webp', path: 'creatures/goblin_warrior_01.webp' },
            { name: 'orc_berserker_01.webp', path: 'creatures/orc_berserker_01.webp' },
            { name: 'red_dragon_01.webp', path: 'creatures/red_dragon_01.webp' },
            { name: 'skeleton_01.webp', path: 'creatures/skeleton_01.webp' },
            { name: 'zombie_01.webp', path: 'creatures/zombie_01.webp' }
        ];
        
        this._processFiles(testFiles, 'test/path');
        
        // Test with different token types
        const testTokens = [
            {
                name: "Goblin Warrior",
                actor: { type: "npc", system: { details: { type: "humanoid" } } }
            },
            {
                name: "Red Dragon",
                actor: { type: "npc", system: { details: { type: "dragon" } } }
            },
            {
                name: "Skeleton Archer",
                actor: { type: "npc", system: { details: { type: "undead" } } }
            }
        ];
        
        for (const token of testTokens) {
            postConsoleAndNotification(`Token Image Replacement: Testing token: ${token.name}`, "", false, false, false);
            const searchTerms = this._getSearchTerms(token);
            postConsoleAndNotification(`  Search terms: ${searchTerms.join(', ')}`, "", false, false, false);
            
            const match = this.findMatchingImage(token);
            if (match) {
                postConsoleAndNotification(`  Found match: ${match.name}`, "", false, false, false);
            } else {
                postConsoleAndNotification(`  No match found`, "", false, false, false);
            }
        }
        
        // Clear test data
        this.clearCache();
        postConsoleAndNotification("Token Image Replacement: Test matching completed and cache cleared", "", false, false, false);
    }
}
