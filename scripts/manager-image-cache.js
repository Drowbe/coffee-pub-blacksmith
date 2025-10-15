// ================================================================== 
// ===== IMAGE CACHE MANAGEMENT SYSTEM ==============================
// ================================================================== 

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { TokenImageReplacementWindow } from './token-image-replacement.js';
import { ImageMatching } from './manager-image-matching.js';

/**
 * Token Image Replacement Cache Management System
 * Handles all cache operations, file scanning, and storage
 */
export class TokenImageReplacement {
    static ID = 'token-image-replacement';
    
    // Cache structure for storing file information
    static cache = {
        files: new Map(),           // filename -> full path mapping
        folders: new Map(),         // folder path -> array of files
        creatureTypes: new Map(),   // creature type -> array of files
        lastScan: null,            // timestamp of last scan
        isScanning: false,         // prevent multiple simultaneous scans
        isPaused: false,           // pause state for scanning
        justCompleted: false,      // flag to show completion notification
        completionData: null,      // data for completion notification
        totalFiles: 0,             // total count for progress tracking
        overallProgress: 0,        // current step in overall process
        totalSteps: 0,             // total steps in overall process
        currentStepName: '',       // name of current step/folder
        currentStepProgress: 0,    // current item in current step
        currentStepTotal: 0,       // total items in current step
        currentPath: '',           // remaining folder path (e.g., "Creatures | Humanoid")
        currentFileName: '',       // current file being processed
        ignoredFilesCount: 0       // count of files ignored by ignored words filter
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
        'humanoid': ['humanoids', 'humanoid', 'creatures', 'npcs', 'adversaries'],
        'monstrosity': ['monstrosities', 'monstrosity', 'creatures'],
        'ooze': ['oozes', 'ooze', 'creatures'],
        'plant': ['plants', 'plant', 'creatures'],
        'undead': ['undead', 'creatures'],
        'vehicle': ['vehicles', 'vehicle'],
        'npc': ['npcs', 'npc', 'humanoids', 'humanoid']
    };
    
    // Metadata extraction patterns and constants
    static METADATA_PATTERNS = {
        // Sizes
        size: /^(tiny|small|medium|large|huge|giant)$/i,
        
        // Scales
        scale: /^scale(\d+)$/i,
        
        // Creature types
        creatureType: /^(beast|humanoid|dragon|elemental|undead|fiend|celestial|construct|plant|monstrosity|aberration|fey|giant|ooze)$/i,
        
        // Classes
        class: /^(archer|fighter|wizard|mage|merchant|rogue|cleric|paladin|ranger|barbarian|monk|sorcerer|warlock|druid|bard|knight|warrior|assassin|thief|priest|shaman|necromancer|enchanter|illusionist|conjurer|evoker|abjurer|diviner|transmuter)$/i,
        
        // Professions
        profession: /^(merchant|guard|noble|peasant|soldier|knight|lord|lady|king|queen|prince|princess|duke|duchess|baron|baroness|count|countess|earl|viscount|mayor|sheriff|captain|lieutenant|sergeant|corporal|private|recruit|veteran|elite|master|apprentice|novice|expert|grandmaster)$/i,
        
        // Equipment
        weapon: /^(sword|bow|staff|axe|spear|mace|dagger|crossbow|wand|orb|hammer|flail|whip|sling|javelin|trident|halberd|glaive|scythe|scimitar|rapier|longsword|shortsword|greatsword|battleaxe|handaxe|warhammer|maul|club|quarterstaff|shortbow|longbow|heavy_crossbow|light_crossbow|hand_crossbow|dual|swords)$/i,
        armor: /^(leather|chain|plate|robe|cloth|hide|scale|ring|splint|banded|studded|padded|quilted|brigandine|lamellar|scale_mail|chain_mail|splint_mail|banded_mail|plate_mail|full_plate|half_plate|breastplate|field_plate|gothic_plate|maximilian_plate)$/i,
        
        // Actions/Poses
        action: /^(attacking|defending|casting|idle|flying|sitting|crouching)$/i,
        direction: /^(front|side|back|three-quarter|profile)$/i,
        
        // Quality
        quality: /^(high|medium|low|premium|standard)$/i
    };
    
    // Subtype patterns for folder-based extraction
    static SUBTYPE_PATTERNS = [
        /dragonborn/i,
        /tieflings?/i,
        /aasimar/i,
        /genasi/i,
        /goliaths?/i,
        /halflings?/i,
        /gnomes?/i,
        /dwarves?/i,
        /elves?/i,
        /orcs?/i,
        /lizardfolk/i,
        /tritons?/i,
        /yuan-ti/i,
        /aarakocra/i,
        /kenku/i,
        /tabaxi/i,
        /tortles?/i,
        /bugbears?/i,
        /kobolds?/i,
        /lizardfolk/i,
        /minotaurs?/i,
        /centaurs?/i,
        /satyrs?/i,
        /shifters?/i,
        /changelings?/i,
        /kalashtar/i,
        /warforged/i
    ];
    
    // Words to ignore when extracting tags
    static IGNORED_WORDS = [
        // Articles
        'the', 'a', 'an',
        
        // Numbers (standalone) - but keep size numbers
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
        '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
        '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
        
        // Common symbols
        '-', '_', '.', '(', ')', '[', ']', '{', '}',
        
        // File extensions
        'webp', 'png', 'jpg', 'jpeg', 'gif',
        
        // Common filler words
        'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
        
        // Generic descriptors
        'image', 'pic', 'photo', 'img', 'token', 'icon',
        
        // Version identifiers
        'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
    ];
    
    /**
     * Check if a folder should be ignored based on settings
     */
    static _isFolderIgnored(folderName) {
        const ignoredFoldersSetting = getSettingSafely(MODULE.ID, 'tokenImageReplacementIgnoredFolders', '_gsdata_,Build_a_Token,.DS_Store');
        const ignoredFolders = ignoredFoldersSetting.split(',').map(folder => folder.trim().toLowerCase());
        const folderNameLower = folderName.toLowerCase();
        const isIgnored = ignoredFolders.includes(folderNameLower);
        
        return isIgnored;
    }

    /**
     * Clean up category names by removing special characters and underscores
     */
    static _cleanCategoryName(categoryName) {
        if (!categoryName) return '';
        
        return categoryName
            .replace(/[-_]/g, ' ')           // Replace hyphens and underscores with spaces
            .replace(/[^\w\s]/g, '')         // Remove special characters except word chars and spaces
            .replace(/\s+/g, ' ')            // Replace multiple spaces with single space
            .trim()                          // Remove leading/trailing spaces
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case
            .join(' ');
    }



    /**
     * Load monster mapping data from resources and store in settings
     */
    static async _loadMonsterMappingData() {
        try {
            // Check if we already have the data
            const existingData = game.settings.get(MODULE.ID, 'monsterMappingData');
            if (existingData && Object.keys(existingData).length > 0) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_loadMonsterMappingData) - Monster mapping data already loaded", "", true, false);
                return;
            }
            
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Loading monster mapping data...", "", true, false);
            
            // Load monster mapping from resources
            const response = await fetch('modules/coffee-pub-blacksmith/resources/monster-mapping.json');
            if (response.ok) {
                const monsterData = await response.json();
                await game.settings.set(MODULE.ID, 'monsterMappingData', monsterData);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Loaded monster mapping data with ${Object.keys(monsterData.monsters).length} monsters`, "", true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Failed to load monster mapping data - HTTP ${response.status}`, "", true, false);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error loading monster mapping data: ${error.message}`, "", false, false);
            console.error('Monster mapping error:', error);
        }
    }

    /**
     * Load monster mapping data
     */
    static _loadMonsterMapping() {
        if (this.monsterMapping) {
            return this.monsterMapping;
        }
        
        try {
            // Load monster mapping from resources
            const mappingPath = 'modules/coffee-pub-blacksmith/resources/monster-mapping.json';
            const mappingData = game.settings.get(MODULE.ID, 'monsterMappingData');
            
            if (mappingData) {
                this.monsterMapping = mappingData;
            } else {
                // Fallback: try to load from file system (for development)
                console.warn('Monster mapping not found in settings, using empty mapping');
                this.monsterMapping = { monsters: {} };
            }
        } catch (error) {
            console.warn('Failed to load monster mapping:', error);
            this.monsterMapping = { monsters: {} };
        }
        
        return this.monsterMapping;
    }

    /**
     * Identify monster type from filename using monster mapping
     */
    static _identifyMonsterFromFilename(filename) {
        const mapping = this._loadMonsterMapping();
        const filenameLower = filename.toLowerCase();
        
        // Try to find a matching monster in the mapping
        for (const [monsterName, monsterData] of Object.entries(mapping.monsters)) {
            // Check if filename contains the monster name or any of its variations
            const variations = [monsterName, ...(monsterData.variations || [])];
            
            for (const variation of variations) {
                if (filenameLower.includes(variation.toLowerCase())) {
                    return monsterData;
                }
            }
        }
        
        return null;
    }

    /**
     * Extract comprehensive metadata from filename and path
     */
    static _extractMetadata(fileName, filePath) {
        const metadata = {
            // Basic info
            name: fileName,
            path: filePath,
            fullPath: null,
            
        // D&D 5e data (for matching with tokens)
        dnd5eType: null,
        dnd5eSubtype: null,
        size: null,
        challengeRating: null,
        alignment: null,
        
        // Creature name (for matching)
        creatureName: null,
        
        // Class information (for matching)
        class: null,
        
        // Equipment (for matching) - arrays to match token data
        weapons: [],
        armor: [],
            
            // Generated tags (for display and filtering)
            tags: []
        };
        
        // Extract folder path information (for filtering)
        const pathParts = filePath.split('/');
        metadata.fullPath = pathParts.slice(0, -1).join('/');
        metadata.folderPath = pathParts.slice(0, -1); // Array of folder names
        metadata.topLevelFolder = pathParts[0] || ''; // First folder (for category filtering)
        
        // Extract filename without extension
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        const nameParts = nameWithoutExt.split(/[-_]/).filter(part => part.length > 0);
        
        // Try to identify monster type from filename using monster mapping
        const monsterData = this._identifyMonsterFromFilename(nameWithoutExt);
        if (monsterData) {
            metadata.dnd5eType = monsterData.dnd5eType;
            metadata.dnd5eSubtype = monsterData.dnd5eSubtype;
            metadata.size = this._normalizeSize(monsterData.size);
            metadata.challengeRating = monsterData.challengeRating;
            metadata.alignment = monsterData.alignment;
            metadata.creatureName = monsterData.name || nameWithoutExt;
        }
        
        // Process each part of the filename - only extract what we need for matching
        for (const part of nameParts) {
            const cleanPart = part.toLowerCase();
            
            // Skip ignored words
            if (this.IGNORED_WORDS.includes(cleanPart)) {
                continue;
            }
            
            // Only check patterns that matter for token matching
            if (this.METADATA_PATTERNS.class.test(cleanPart)) {
                metadata.class = cleanPart;
            } else if (this.METADATA_PATTERNS.weapon.test(cleanPart)) {
                if (!metadata.weapons.includes(cleanPart)) {
                    metadata.weapons.push(cleanPart);
                }
            } else if (this.METADATA_PATTERNS.armor.test(cleanPart)) {
                if (!metadata.armor.includes(cleanPart)) {
                    metadata.armor.push(cleanPart);
                }
            } else if (this.METADATA_PATTERNS.size.test(cleanPart)) {
                metadata.size = this._normalizeSize(cleanPart);
            }
        }
        
        
        // Generate tags from metadata
        metadata.tags = this._generateTagsFromMetadata(metadata);
        
        return metadata;
    }
    
    
    /**
     * Normalize size abbreviations to full names
     * @param {string} size - Size abbreviation or full name
     * @returns {string} Normalized size
     */
    static _normalizeSize(size) {
        if (!size) return null;
        
        const sizeMap = {
            'tiny': 'tiny',
            'sm': 'small',
            'small': 'small',
            'med': 'medium',
            'medium': 'medium',
            'lg': 'large',
            'large': 'large',
            'huge': 'huge',
            'garg': 'gargantuan',
            'gargantuan': 'gargantuan'
        };
        
        return sizeMap[size.toLowerCase()] || size.toLowerCase();
    }

    /**
     * Generate tags from extracted metadata
     */
    static _generateTagsFromMetadata(metadata) {
        const tags = [];
        
        // Add D&D 5e data tags (for matching)
        if (metadata.dnd5eType) tags.push(metadata.dnd5eType.toUpperCase());
        if (metadata.dnd5eSubtype) tags.push(metadata.dnd5eSubtype.toUpperCase());
        if (metadata.size) tags.push(metadata.size.toUpperCase());
        if (metadata.alignment) tags.push(metadata.alignment.toUpperCase());
        
        // Add class tags (for matching)
        if (metadata.class) tags.push(metadata.class.toUpperCase());
        
        // Add equipment tags (for matching)
        if (metadata.weapons && metadata.weapons.length > 0) {
            metadata.weapons.forEach(weapon => tags.push(weapon.toUpperCase()));
        }
        if (metadata.armor && metadata.armor.length > 0) {
            metadata.armor.forEach(armor => tags.push(armor.toUpperCase()));
        }
        
        // Add folder tags (for filtering)
        if (metadata.folderPath && metadata.folderPath.length > 0) {
            metadata.folderPath.forEach(folder => {
                if (folder && folder !== 'assets' && folder !== 'images' && folder !== 'tokens') {
                    const cleanFolder = this._cleanCategoryName(folder);
                    if (cleanFolder) {
                        tags.push(cleanFolder.toUpperCase());
                    }
                }
            });
        }
        
        return [...new Set(tags)]; // Remove duplicates
    }

    /**
     * Extract token data points for weighted scoring
     * @param {Object} tokenDocument - The token document
     * @returns {Object} Token data points with their values
     */
    static _extractTokenData(tokenDocument) {
        if (!tokenDocument) return {};

        const actor = tokenDocument.actor;
        if (!actor) return {};

        const data = {
            representedActor: null,
            creatureType: null,
            creatureSubtype: null,
            equipment: [],
            background: null,
            size: null,
            alignment: null
        };

        // Check if this is a player character or NPC
        const actorType = actor.type || 'npc';
        const isPlayerCharacter = actorType === 'character';

        // 1. Represented Actor (most important)
        if (actor.name) {
            // Use the full actor name for better matching
            // Examples: "Frost Giant" -> "Frost Giant"
            //          "Cloud Giant" -> "Cloud Giant"
            data.representedActor = actor.name;
        }

        // 2. Creature Type (Official D&D5e field)
        if (actor.system?.details?.type?.value && typeof actor.system.details.type.value === 'string') {
            data.creatureType = actor.system.details.type.value.toLowerCase();
        } else if (isPlayerCharacter) {
            // For player characters, use "humanoid" as default creature type
            data.creatureType = 'humanoid';
        }

        // 3. Creature Subtype (Official D&D5e field)
        if (actor.system?.details?.type?.subtype && typeof actor.system.details.type.subtype === 'string') {
            data.creatureSubtype = actor.system.details.type.subtype.toLowerCase();
        } else if (isPlayerCharacter) {
            // For player characters, try to get race/ancestry
            const race = actor.system?.details?.race || actor.system?.details?.ancestry;
            if (race && typeof race === 'string') {
                data.creatureSubtype = race.toLowerCase();
            }
        }

        // 4. Equipment (from actor items)
        if (actor.items) {
            const equipment = [];
            for (const item of actor.items) {
                if (item.type === 'weapon' || item.type === 'equipment') {
                    const itemName = item.name?.toLowerCase() || '';
                    if (itemName.includes('sword')) equipment.push('sword');
                    else if (itemName.includes('bow')) equipment.push('bow');
                    else if (itemName.includes('staff')) equipment.push('staff');
                    else if (itemName.includes('axe')) equipment.push('axe');
                    else if (itemName.includes('spear')) equipment.push('spear');
                    else if (itemName.includes('shield')) equipment.push('shield');
                    else if (itemName.includes('dagger')) equipment.push('dagger');
                    else if (itemName.includes('mace')) equipment.push('mace');
                    else if (itemName.includes('hammer')) equipment.push('hammer');
                    else if (itemName.includes('crossbow')) equipment.push('crossbow');
                }
            }
            data.equipment = [...new Set(equipment)]; // Remove duplicates
        }

        // 5. Background/Profession (from actor details)
        if (actor.system?.details?.background && typeof actor.system.details.background === 'string') {
            data.background = actor.system.details.background.toLowerCase();
        } else if (isPlayerCharacter) {
            // For player characters, try to get class as background
            const characterClass = actor.system?.details?.class || actor.system?.classes;
            if (characterClass) {
                if (typeof characterClass === 'string') {
                    data.background = characterClass.toLowerCase();
                } else if (characterClass.primary && typeof characterClass.primary === 'string') {
                    data.background = characterClass.primary.toLowerCase();
                }
            }
        }

        // 6. Size (from actor size or token scale)
        if (actor.system?.traits?.size && typeof actor.system.traits.size === 'string') {
            data.size = actor.system.traits.size.toLowerCase();
        } else if (tokenDocument.scale) {
            // Convert scale to size category
            const scale = tokenDocument.scale;
            if (scale <= 0.5) data.size = 'tiny';
            else if (scale <= 0.75) data.size = 'small';
            else if (scale <= 1.25) data.size = 'medium';
            else if (scale <= 1.5) data.size = 'large';
            else if (scale <= 2) data.size = 'huge';
            else data.size = 'gargantuan';
        } else if (isPlayerCharacter) {
            // For player characters, default to medium size
            data.size = 'medium';
        }


        return data;
    }

    /**
     * Test the weighted scoring system with example data
     * Call this from console: TokenImageReplacement.testWeightedScoring()
     */
    static async testWeightedScoring() {
        
        // Test data: Bullywug Warrior token
        const testTokenData = {
            representedActor: "bullywug",
            creatureType: "monstrosity",
            creatureSubtype: "bullywug", 
            equipment: ["sword"],
            background: null,
            size: "large",
            alignment: null
        };
        
        // Test files
        const testFiles = [
            {
                name: "Bullywug_Warrior_A1_Sword_01.webp",
                path: "creatures/bullywug/",
                metadata: { tags: ["BULLYWUG", "WARRIOR", "SWORD", "MONSTROSITY", "LARGE"] }
            },
            {
                name: "Sea_Serpent_A1_Segment_A_Huge_Dragon_01.webp", 
                path: "creatures/sea/",
                metadata: { tags: ["SEA", "SERPENT", "DRAGON", "MONSTROSITY", "HUGE"] }
            },
            {
                name: "Creature_Archer_A1_Bow_01.webp",
                path: "creatures/creature/", 
                metadata: { tags: ["CREATURE", "ARCHER", "BOW", "HUMANOID", "SMALL"] }
            }
        ];
        
        
        // Create a mock token document
        const mockTokenDocument = {
            actor: {
                name: "Rinian (Bullywug Warrior)",
                type: "monstrosity",
                items: [
                    { type: "weapon", name: "Longsword" }
                ],
                system: {
                    traits: { size: "large" },
                    details: { alignment: "neutral" }
                }
            },
            scale: 1.2
        };
        
        // Test each file
        for (const fileInfo of testFiles) {
            const searchTerms = ["Rinian (Bullywug Warrior)", "Bullywug", "Warrior"];
                const score = await ImageMatching._calculateRelevanceScore(
                fileInfo, 
                searchTerms, 
                mockTokenDocument, 
                    'token',
                    this.cache
                );
            
        }
        
    }

    
    
    /**
     * Add console commands for cache debugging
     */
    static _addConsoleCommands() {
        // Add to global scope for easy access
        window.coffeePubCache = {
            // Basic cache info
            info: () => {
                const c = this.cache;
                postConsoleAndNotification(MODULE.NAME, `📊 Cache Stats:
- Files: ${c.files.size}
- Folders: ${c.folders.size}
- Creature Types: ${c.creatureTypes.size}
- Last Scan: ${c.lastScan ? new Date(c.lastScan).toLocaleString() : 'Never'}
- Scanning: ${c.isScanning}
- Ignored Files: ${c.ignoredFilesCount || 0}`, "", true, false);
                return c;
            },
            
            // Check server-side cache size
            size: () => {
                const cacheData = game.settings.get(MODULE.ID, 'tokenImageReplacementCache');
                if (cacheData) {
                    const compressedSizeMB = (new Blob([cacheData]).size / (1024 * 1024)).toFixed(2);
                    
                    // Try to decompress to show original size
                    try {
                        const decompressed = TokenImageReplacement._decompressCacheData(cacheData);
                        const uncompressedSizeMB = (new Blob([decompressed]).size / (1024 * 1024)).toFixed(2);
                        const compressionRatio = ((1 - cacheData.length / decompressed.length) * 100).toFixed(1);
                        postConsoleAndNotification(MODULE.NAME, `💾 Server Cache Size: ${uncompressedSizeMB}MB → ${compressedSizeMB}MB (${compressionRatio}% compression)`, "", true, false);
                        return { compressed: compressedSizeMB, uncompressed: uncompressedSizeMB, ratio: compressionRatio };
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, `💾 Server Cache Size: ${compressedSizeMB}MB (uncompressed data)`, "", true, false);
                        return { compressed: compressedSizeMB, uncompressed: compressedSizeMB, ratio: 0 };
                    }
                } else {
                    postConsoleAndNotification(MODULE.NAME, '❌ No cache in server settings', '', true, false);
                    return 0;
                }
            },
            
            // Show cache version and basic info
            version: () => {
                try {
                    const cacheData = JSON.parse(game.settings.get(MODULE.ID, 'tokenImageReplacementCache'));
                    postConsoleAndNotification(MODULE.NAME, `🔢 Cache Version: ${cacheData.version}`, "", true, false);
                    postConsoleAndNotification(MODULE.NAME, `📁 Files Count: ${cacheData.files ? cacheData.files.length : 'N/A'}`, "", true, false);
                    postConsoleAndNotification(MODULE.NAME, `📅 Last Scan: ${cacheData.lastScan ? new Date(cacheData.lastScan).toLocaleString() : 'Never'}`, "", true, false);
                    return cacheData;
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `❌ Error reading cache: ${error.message}`, '', true, false);
                    return null;
                }
            },
            
            // Clear cache
            clear: async () => {
                localStorage.removeItem('tokenImageReplacement_cache');
                await game.settings.set(MODULE.ID, 'tokenImageReplacementCache', '');
                postConsoleAndNotification(MODULE.NAME, '🗑️ Cache cleared from localStorage and server settings', '', true, false);
            },
            
            // Show storage quota info
            quota: () => {
                try {
                    const testData = 'x'.repeat(1024 * 1024); // 1MB test
                    localStorage.setItem('quota_test', testData);
                    localStorage.removeItem('quota_test');
                    postConsoleAndNotification(MODULE.NAME, '✅ localStorage is writable', '', true, false);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `❌ localStorage error: ${error.message}`, "", true, false);
                }
            },
            
            // Test word combination matching
            testMatch: (tokenName, filename) => {
                postConsoleAndNotification(MODULE.NAME, `\n🧪 Testing word combination matching:`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Token Name: "${tokenName}"`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Filename: "${filename}"`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `\n--- Processing ---`, "", true, false);
                
                const words = ImageMatching._extractWords(tokenName);
                postConsoleAndNotification(MODULE.NAME, `Extracted words: [${words.join(', ')}]`, "", true, false);
                
                const combinations = ImageMatching._generateCombinations(words);
                postConsoleAndNotification(MODULE.NAME, `Generated combinations: [${combinations.join(', ')}]`, "", true, false);
                
                const result = ImageMatching._matchCombinations(words, filename, true);
                postConsoleAndNotification(MODULE.NAME, `\n--- Result ---`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Matched: ${result.matched}`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Score: ${result.score}`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Match Type: ${result.matchType}`, "", true, false);
                
                return result;
            },
            
        };
        
        postConsoleAndNotification(MODULE.NAME, "Console commands added: coffeePubCache.info(), coffeePubCache.size(), coffeePubCache.version(), coffeePubCache.clear(), coffeePubCache.quota(), coffeePubCache.testMatch(tokenName, filename)", "", true, false);
    }
    
    static async initialize() {
        // Add console commands for debugging
        this._addConsoleCommands();
        
        // Load monster mapping data
        await this._loadMonsterMappingData();
        
        // Initialize the caching system immediately since we're already in the ready hook
        await this._initializeCache();
        
        // Register createToken hook for image replacement
        const createTokenHookId = HookManager.registerHook({
            name: 'createToken',
            description: 'Token Image Replacement: Handle token creation for image replacement',
            context: 'token-image-replacement-creation',
            priority: 3, // Normal priority - token processing
            callback: TokenImageReplacementWindow._onTokenCreated
        });

        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | createToken", "token-image-replacement-creation", true, false);
        
        // Register global controlToken hook for token selection detection
        const controlTokenHookId = HookManager.registerHook({
            name: 'controlToken',
            description: 'Token Image Replacement: Global token selection detection',
            context: 'token-image-replacement-global',
            priority: 3, // Normal priority - UI enhancement
            callback: TokenImageReplacementWindow._onGlobalTokenSelectionChange
        });

        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | controlToken (global)", "token-image-replacement-global", true, false);
        
        // Register updateActor hook for dead token replacement
        const updateActorHookId = HookManager.registerHook({
            name: 'updateActor',
            description: 'Token Image Replacement: Monitor actor HP changes for dead token replacement',
            context: 'token-image-replacement-dead-tokens',
            priority: 3, // Normal priority - token processing
            callback: TokenImageReplacementWindow._onActorUpdateForDeadToken
        });

        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | updateActor (dead tokens)", "token-image-replacement-dead-tokens", true, false);
        
        // Add double-middle-click handler for tokens using HookManager
        TokenImageReplacementWindow._addMiddleClickHandler();
        
        // Set up cleanup when module is disabled using HookManager
        const readyHookId = HookManager.registerHook({
            name: 'ready',
            description: 'TokenImageReplacement: Setup cleanup hooks',
            context: 'token-image-replacement-cleanup',
            priority: 3, // Normal priority - cleanup setup
            callback: () => {
                // Register cleanup hook for when module is disabled
                const unloadHookId = HookManager.registerHook({
                    name: 'unloadModule',
                    description: 'TokenImageReplacement: Cleanup on module unload',
                    context: 'token-image-replacement-unload',
                    priority: 3, // Normal priority - cleanup
                    callback: (moduleId) => {
                        if (moduleId === MODULE.ID) {
                            TokenImageReplacementWindow._removeMiddleClickHandler();
                        }
                    }
                });
            }
        });
        
        // No Handlebars helpers needed - all calculations done in JavaScript
        
        // Add test function to global scope for debugging
        if (game.user.isGM) {
                game.TokenImageReplacement = this;
                
                // Add the cleanup functions to the global scope
                game.TokenImageReplacement.cleanupInvalidPaths = this._cleanupInvalidPaths.bind(this);
                game.TokenImageReplacement.forceCleanupInvalidPaths = this.forceCleanupInvalidPaths.bind(this);
                game.TokenImageReplacement.isScanning = this.isScanning.bind(this);
                game.TokenImageReplacement.scanForImages = this.scanForImages.bind(this);
                game.TokenImageReplacement.deleteCache = this.deleteCache.bind(this);
                game.TokenImageReplacement.pauseCache = this.pauseCache.bind(this);
                game.TokenImageReplacement.openWindow = this.openWindow.bind(this);
                game.TokenImageReplacement.cleanup = TokenImageReplacementWindow._removeMiddleClickHandler;
            }
    }
    
    /**
     * Clean up invalid file paths from the cache
     */
    static _cleanupInvalidPaths() {
        let cleanedCount = 0;
        const invalidPaths = [];
        
        // Clean up files cache
        for (const [fileName, fileInfo] of this.cache.files.entries()) {
            if (this._isInvalidFilePath(fileInfo.fullPath)) {
                invalidPaths.push(fileInfo.fullPath);
                this.cache.files.delete(fileName);
                cleanedCount++;
            }
        }
        
        // Clean up folders cache
        for (const [folderPath, files] of this.cache.folders.entries()) {
            if (!Array.isArray(files)) continue; // Skip if not an array
            const validFiles = files.filter(fileName => {
                const fileInfo = this.cache.files.get(fileName.toLowerCase());
                return fileInfo && !this._isInvalidFilePath(fileInfo.fullPath);
            });
            
            if (validFiles.length !== files.length) {
                this.cache.folders.set(folderPath, validFiles);
                cleanedCount += (files.length - validFiles.length);
            }
        }
        
        // Clean up creature types cache
        for (const [creatureType, files] of this.cache.creatureTypes.entries()) {
            if (!Array.isArray(files)) continue; // Skip if not an array
            const validFiles = files.filter(fileName => {
                const fileInfo = this.cache.files.get(fileName.toLowerCase());
                return fileInfo && !this._isInvalidFilePath(fileInfo.fullPath);
            });
            
            if (validFiles.length !== files.length) {
                this.cache.creatureTypes.set(creatureType, validFiles);
                cleanedCount += (files.length - validFiles.length);
            }
        }
        
        if (cleanedCount > 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cleaned up ${cleanedCount} invalid file paths from cache`, "", true, false);
            if (invalidPaths.length > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Invalid paths found: ${invalidPaths.join(', ')}`, "", true, false);
            }
        }
        
        return cleanedCount;
    }
    
    /**
     * Check if a scan is currently in progress
     */
    static isScanning() {
        return this.cache.isScanning;
    }
    
    /**
     * Scan for images and update the cache (non-destructive)
     */
    static async scanForImages() {
        // Check if we already have a working cache
        if (this.cache.files.size > 0) {
            const choice = await new Promise((resolve) => {
                new Dialog({
                    title: "Token Image Replacement",
                    content: `<p>You already have ${this.cache.files.size} images in your cache.</p><p>Choose your scan type:</p><ul><li><strong>Incremental Update:</strong> Only scan for new/changed images (faster)</li><li><strong>Full Rescan:</strong> Start over and scan everything (slower)</li></ul>`,
                    buttons: {
                        incremental: {
                            icon: '<i class="fas fa-sync-alt"></i>',
                            label: "Incremental",
                            callback: () => resolve('incremental')
                        },
                        full: {
                            icon: '<i class="fas fa-redo"></i>',
                            label: "Full Rescan",
                            callback: () => resolve('full')
                        },
                        cancel: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Cancel",
                            callback: () => resolve(false)
                        }
                    },
                    default: "incremental"
                }).render(true);
            });
            
            if (choice === false) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan cancelled by user", "", true, false);
                return;
            }
            
            // Do incremental update if cache exists
            if (choice === 'incremental') {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting incremental update...", "", true, false);
                const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
                if (basePath) {
                    await this._doIncrementalUpdate(basePath);
                }
                return;
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting full scan...", "", true, false);
        
        if (this.cache.isScanning) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Stopping current scan and starting fresh...", "", true, false);
            this.cache.isScanning = false; // Stop current scan
        }
        
        // Reset pause state when scanning
        this.cache.isPaused = false;
        
        const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
        if (basePath) {
            await this._scanFolderStructure(basePath);
        }
    }
    
    /**
     * Do an incremental update without clearing existing cache
     */
    static async _doIncrementalUpdate(basePath) {
        if (this.cache.isScanning) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Stopping current scan for incremental update...", "", true, false);
            this.cache.isScanning = false;
        }
        
        this.cache.isScanning = true;
        this.cache.isPaused = false;
        this.cache.justCompleted = false;
        this.cache.completionData = null;
        
        try {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting incremental update...", "", true, false);
            
            // Check if folder structure has changed
            const currentFingerprint = await this._generateFolderFingerprint(basePath);
            const savedCache = localStorage.getItem('tokenImageReplacement_cache');
            
            let needsUpdate = false;
            if (savedCache) {
                const cacheData = JSON.parse(savedCache);
                const savedFingerprint = cacheData.folderFingerprint;
                
                // CRITICAL FIX: Handle null/invalid fingerprints from previous failed scans
                if (!savedFingerprint || savedFingerprint === 'null' || savedFingerprint === 'error' || savedFingerprint === 'no-path') {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Saved cache has invalid fingerprint, will update it", "", true, false);
                    // Don't trigger full rescan, just update the fingerprint
                    needsUpdate = false;
                } else if (savedFingerprint !== currentFingerprint) {
                    needsUpdate = true;
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, files need to be rescanned", "", true, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No changes detected in folder structure", "", true, false);
                }
            }
            
            if (needsUpdate) {
                // If structure changed, we need to do a full rescan
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Changes detected - falling back to full scan", "", true, false);
                this.cache.isScanning = false; // Stop incremental mode
                await this._scanFolderStructure(basePath); // Do full scan
                return;
            } else {
                // No changes detected, just update the timestamp
                const originalFileCount = this.cache.files.size;
                const startTime = Date.now();
                
                // Update lastScan timestamp to current time
                this.cache.lastScan = Date.now();
                this.cache.totalFiles = this.cache.files.size;
                
                // Save the updated cache with new timestamp
                await this._saveCacheToStorage(false); // false = final save
                
                // Update the cache status setting for display
                this._updateCacheStatusSetting();
                
                // Set completion state for UI updates
                this.cache.isScanning = false;
                this.cache.justCompleted = true;
                this.cache.completionData = {
                    totalFiles: originalFileCount,
                    totalFolders: this.cache.totalFoldersScanned || this.cache.folders.size,
                    timeString: "less than a second" // Incremental updates are very fast
                };
                
                // Force window refresh to show updated cache status and button state
                if (this.window && this.window.render) {
                    this.window.render();
                }
                
                // Clear completion state after 3 seconds (shorter for incremental)
                setTimeout(() => {
                    this.cache.justCompleted = false;
                    this.cache.completionData = null;
                    if (this.window && this.window.render) {
                        this.window.render();
                    }
                }, 3000);
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ✅ INCREMENTAL UPDATE COMPLETE!`, "", false, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No changes detected. Cache still contains ${originalFileCount} files.`, "", false, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error during incremental update: ${error.message}`, "", false, false);
        } finally {
            // Ensure scanning is false even if there was an error
            if (this.cache.isScanning) {
                this.cache.isScanning = false;
                
                // Force window refresh to show updated button state
                if (this.window && this.window.render) {
                    this.window.render();
                }
            }
        }
    }
    
    /**
     * Pause the current cache scanning process
     */
    static pauseCache() {
        if (this.cache.isScanning) {
            this.cache.isPaused = true;
            this.cache.isScanning = false;
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache scanning paused. You can resume by refreshing the cache.", "", true, false);
            return true;
        }
        return false;
    }

    /**
     * Delete the entire cache
     */
    static async deleteCache() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Deleting cache...", "", true, false);
        
        // Stop any ongoing scan
        if (this.cache.isScanning) {
            this.cache.isScanning = false;
        }
        
        // Clear memory cache
        this.cache.files.clear();
        this.cache.folders.clear();
        this.cache.creatureTypes.clear();
        this.cache.lastScan = null;
        this.cache.totalFiles = 0;
        this.cache.isPaused = false;
        
        // Clear persistent storage (both localStorage and game.settings)
        this._clearCacheFromStorage();
        await game.settings.set(MODULE.ID, 'tokenImageReplacementCache', '');
        
        // Update status
        this._updateCacheStatusSetting();
        
        // Force window refresh to show updated cache status
        if (this.window && this.window.render) {
            this.window.render();
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache deleted successfully", "", true, false);
    }
    
    /**
     * Pause the current cache scanning process
     */
    static pauseCache() {
        if (this.cache.isScanning) {
            this.cache.isPaused = true;
            this.cache.isScanning = false;
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache scanning paused. You can resume by refreshing the cache.", "", true, false);
            
            // Update window if it exists
            if (this.window && this.window.updateScanProgress) {
                this.window.updateScanProgress(0, 100, "Scanning paused");
            }
            
            return true;
        }
        return false;
    }
    
    /**
     * Force cleanup of invalid paths and rebuild cache if needed
     */
    static async forceCleanupInvalidPaths() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting forced cleanup of invalid paths...", "", true, false);
        
        const cleanedCount = this._cleanupInvalidPaths();
        
        if (cleanedCount > 0) {
            // Update total files count
            this.cache.totalFiles = this.cache.files.size;
            
            // Save cleaned cache to storage
            await this._saveCacheToStorage(false);
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Forced cleanup completed. Removed ${cleanedCount} invalid paths and saved cleaned cache.`, "", true, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No invalid paths found in cache.", "", true, false);
        }
        
        return cleanedCount;
    }
    
    /**
     * Open the Token Image Replacement window
     */
    static async openWindow() {
        if (!game.user.isGM) {
            ui.notifications.warn("Only GMs can use the Token Image Replacement window");
            return;
        }
        
        if (!this.window) {
            this.window = new TokenImageReplacementWindow();
        }
        
        // Check for selected token before rendering
        await this.window._checkForSelectedToken();
        
        this.window.render(true);
    }
    
    /**
     * Initialize the cache system
     */
    static async _initializeCache() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache) - Initializing cache system...", "", true, false);
        
        // Only initialize if the feature is enabled
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache)Feature disabled in settings", "", true, false);
            return;
        }
        
        const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_initializeCache) - Retrieved basePath: "${basePath}"`, "", true, false);
        if (!basePath) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache)No base path configured", "", true, false);
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_initializeCache) Using base path: ${basePath}`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_initializeCache) - Cache files count before initialization: ${this.cache.files.size}`, "", true, false);
        
        // Try to load cache from storage first
        if (await this._loadCacheFromStorage()) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache) Using cached data, skipping scan", "", true, false);
            
            // Clean up any invalid paths that might be in the cached data
            const cleanedCount = this._cleanupInvalidPaths();
            if (cleanedCount > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_initializeCache) Cleaned up ${cleanedCount} invalid paths from cached data`, "", true, false);
                
                // Save the cleaned cache back to storage
                await this._saveCacheToStorage();
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache) Saved cleaned cache to storage", "", true, false);
            }
            
            // Check if we need incremental updates
            await this._checkForIncrementalUpdates(basePath);
            
            return;
        }
        
        // No cache found - show appropriate notification
        const autoUpdate = getSettingSafely(MODULE.ID, 'tokenImageReplacementAutoUpdate', false);
        if (autoUpdate) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache) No image cache found, starting automatic scan...", "", true, false);
            ui.notifications.info("No Token Image Replacement images found. Scanning for images.");
        } else {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_initializeCache) - No image cache found, manual scan needed", "", true, false);
            ui.notifications.info("No Token Image Replacement images found. You need to scan for images before replacements will work.");
        }
        
        // Start background scan if no valid cache found and auto-update is enabled
        if (autoUpdate) {
            await this._scanFolderStructure(basePath);
        }
        
        // Log final cache status
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_initializeCache) - Cache initialization completed. Files: ${this.cache.files.size}, Folders: ${this.cache.folders.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", true, false);
    }
    
    /**
     * Scan the folder structure and build the cache
     */
    static async _scanFolderStructure(basePath) {
        if (this.cache.isScanning) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_scanFolderStructure) Scan already in progress - please wait for it to complete", "", true, false);
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: You can check progress in the console above", "", true, false);
            return;
        }
        
        // Check if we were paused
        if (this.cache.isPaused) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan was paused. Use 'Refresh Cache' to resume.", "", true, false);
            return;
        }
        
        this.cache.isScanning = true;
        this.cache.isPaused = false;
        this.cache.justCompleted = false;
        this.cache.completionData = null; // Reset pause state when starting
        this.cache.ignoredFilesCount = 0; // Reset ignored files counter
        const startTime = Date.now();
        
        // Set up timeout protection (3 hours max)
        const maxScanTime = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        const timeoutId = setTimeout(() => {
            if (this.cache.isScanning) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: SCAN TIMEOUT - Forcing completion after 3 hours", "", true, false);
                this.cache.isScanning = false;
                this.cache.overallProgress = this.cache.totalSteps;
                this.cache.currentStepName = "Timeout - Forced Complete";
                
                // Force window update
                const windows = Object.values(ui.windows).filter(w => w instanceof TokenImageReplacementWindow);
                if (windows.length > 0) {
                    windows[0].render();
                }
            }
        }, maxScanTime);
        
        // Clear cache at the start of a complete scan
        this.cache.files.clear();
        this.cache.folders.clear();
        this.cache.creatureTypes.clear();
        
        // Initialize overall progress tracking
        this.cache.overallProgress = 0;
        this.cache.currentStepName = '';
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting folder scan...", "", true, false);
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: This may take a few minutes for large token collections...", "", true, false);
        
        try {
            // Update window with initial scan status
            if (this.window && this.window.updateScanProgress) {
                this.window.updateScanProgress(0, 100, "Starting directory scan...");
            }
            
            // Use Foundry's FilePicker to get directory contents
            const files = await this._getDirectoryContents(basePath);
            
            if (files.length === 0) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No supported image files found", "", true, false);
                return;
            }
            
            // Update window with processing status
            if (this.window && this.window.updateScanProgress) {
                this.window.updateScanProgress(95, 100, `Scan completed - files already processed incrementally`);
            }
            
            this.cache.lastScan = Date.now();
            this.cache.totalFiles = this.cache.files.size;
            
            const scanTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const minutes = Math.floor(scanTime / 60);
            const seconds = (scanTime % 60).toFixed(1);
            const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ✅ SCAN COMPLETE!`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${this.cache.totalFiles} files across ${this.cache.folders.size} folders in ${timeString}`, "", true, false);
            
            // Log some statistics about the cache
            this._logCacheStatistics();
            
            // Save cache to persistent storage (final save)
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Performing final cache save...", "", false, false);
            await this._saveCacheToStorage(false); // false = final save
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Final cache save completed!", "", false, false);
            
            // Note: Window refresh will happen when UI is next accessed
            
            // Update window with completion status
            if (this.window && this.window.updateScanProgress) {
                this.window.updateScanProgress(100, 100, "Scan Complete");
            }
            
            // Show completion notification in the window
            if (this.window && this.window.showCompletionNotification) {
                this.window.showCompletionNotification(this.cache.totalFiles, this.cache.folders.size, timeString);
            }
            
            // Complete the scan and update window state
            if (this.window && this.window.completeScan) {
                this.window.completeScan();
            }
            
            // Hide progress bars after a delay
            if (this.window && this.window.hideProgressBars) {
                setTimeout(() => {
                    this.window.hideProgressBars();
                }, 3000); // Hide after 3 seconds
            }
            
            // Refresh any open windows now that cache is ready
            if (this.window && this.window.refreshMatches) {
                await this.window.refreshMatches();
            }
            
            // Validate completion before setting final state
            if (this.cache.overallProgress !== this.cache.totalSteps) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: WARNING - Progress mismatch detected. Expected ${this.cache.totalSteps} steps but completed ${this.cache.overallProgress}`, "", true, false);
                // Force completion
                this.cache.overallProgress = this.cache.totalSteps;
            }
            
            // Set scanning to false before final render
            this.cache.isScanning = false;
            
            // Set completion state for in-window notification
            this.cache.justCompleted = true;
            this.cache.completionData = {
                totalFiles: this.cache.totalFiles,
                totalFolders: this.cache.totalFoldersScanned || this.cache.folders.size,
                timeString: timeString,
                ignoredFiles: this.cache.ignoredFilesCount
            };
            
            // Completion notification will be sent by the button handler
            
            // Force a full window render to update cache status and button state
            if (this.window && this.window.render) {
                this.window.render();
            }
            
            // Clear completion state after 5 seconds
            setTimeout(() => {
                this.cache.justCompleted = false;
                this.cache.completionData = null;
                if (this.window && this.window.render) {
                    this.window.render();
                }
            }, 5000);
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error scanning folders: ${error.message}`, "", false, false);
            
            // CRITICAL FIX: Save whatever cache data we have with proper fingerprint
            // This prevents losing incremental progress when errors occur
            try {
                this.cache.lastScan = Date.now();
                this.cache.totalFiles = this.cache.files.size;
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Saving partial cache (${this.cache.files.size} files) despite error...`, "", false, false);
                await this._saveCacheToStorage(false); // false = final save with fingerprint
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Partial cache saved successfully", "", false, false);
            } catch (saveError) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Failed to save partial cache: ${saveError.message}`, "", false, false);
            }
            
            // Show error notification in the window
            if (this.window && this.window.showErrorNotification) {
                this.window.showErrorNotification(error.message);
            }
            
            // Hide progress bars after error
            if (this.window && this.window.hideProgressBars) {
                setTimeout(() => {
                    this.window.hideProgressBars();
                }, 3000); // Hide after 3 seconds
            }
        } finally {
            // Clear timeout since scan is complete
            if (typeof timeoutId !== 'undefined') {
                clearTimeout(timeoutId);
            }
            
            // Ensure scanning is false even if there was an error
            if (this.cache.isScanning) {
                this.cache.isScanning = false;
            }
            
            // Update cache status setting for display
            this._updateCacheStatusSetting();
                
                // Force window refresh to show updated notification and button state
                const windows = Object.values(ui.windows).filter(w => w instanceof TokenImageReplacementWindow);
                if (windows.length > 0) {
                    windows[0].render();
            }
        }
    }
    
    /**
     * Log cache statistics for debugging
     */
    static _logCacheStatistics() {
        if (this.cache.creatureTypes.size > 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Creature type breakdown:", "", true, false);
            for (const [creatureType, files] of this.cache.creatureTypes) {
                postConsoleAndNotification(MODULE.NAME, `  ${creatureType}: ${files.length} files`, "", true, false);
            }
        }
        
        if (this.cache.folders.size > 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Top folders by file count:`, "", true, false);
            const sortedFolders = Array.from(this.cache.folders.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 5);
            
            for (const [folder, files] of sortedFolders) {
                postConsoleAndNotification(MODULE.NAME, `  ${folder}: ${files.length} files`, "", true, false);
            }
        }
    }
    
    /**
     * Get directory contents using Foundry's FilePicker API
     */
    static async _getDirectoryContents(basePath) {
        const files = [];
        
        try {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Scanning directory: ${basePath}`, "", true, false);
            
            // Use Foundry's FilePicker to browse the directory
            const response = await FilePicker.browse("data", basePath);
            
            // Log what we found for debugging
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Directory scan results - Files: ${response.files?.length || 0}, Subdirectories: ${response.dirs?.length || 0}`, "", true, false);
            
            // Process files in the base directory (if any)
            if (response.files && response.files.length > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.files.length} files in base directory`, "", true, false);
                
                const baseFiles = [];
                for (const filePath of response.files) {
                    const fileInfo = await this._processFileInfo(filePath, basePath);
                    if (fileInfo) {
                        files.push(fileInfo);
                        baseFiles.push(fileInfo);
                    }
                }
                
                // Process base directory files into cache immediately
                if (baseFiles.length > 0) {
                    await this._processFiles(baseFiles, basePath, false); // Don't clear cache, just add files
                }
            }
            
            // Always scan subdirectories (this is where most token files will be)
            if (response.dirs && response.dirs.length > 0) {
                // Log all directories found
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.dirs.length} subdirectories:`, "", true, false);
                const ignoredDirs = [];
                const scanDirs = [];
                for (let i = 0; i < response.dirs.length; i++) {
                    const dirName = response.dirs[i].split('/').pop();
                    const isIgnored = TokenImageReplacement._isFolderIgnored(dirName);
                    if (isIgnored) {
                        ignoredDirs.push(dirName);
                    } else {
                        scanDirs.push(dirName);
                    }
                }
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Will scan: [${scanDirs.join(', ')}]`, "", true, false);
                if (ignoredDirs.length > 0) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Ignoring: [${ignoredDirs.join(', ')}]`, "", true, false);
                }
                
                // Count non-ignored directories for accurate progress tracking
                const nonIgnoredDirs = response.dirs.filter(dir => {
                    const dirName = dir.split('/').pop();
                    return !TokenImageReplacement._isFolderIgnored(dirName);
                });
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ${nonIgnoredDirs.length} directories will be scanned (${response.dirs.length - nonIgnoredDirs.length} ignored)`, "", true, false);
                
                // Set total steps for overall progress (non-ignored subdirectories only)
                this.cache.totalSteps = nonIgnoredDirs.length;
                this.cache.overallProgress = 0;
                this.cache.totalFoldersScanned = nonIgnoredDirs.length; // Track actual folder count
                
                let processedCount = 0;
                for (let i = 0; i < response.dirs.length; i++) {
                    // Check if we should pause
                    if (this.cache.isPaused) {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan paused by user.", "", true, false);
                        return;
                    }
                    
                    const subDir = response.dirs[i];
                    const subDirName = subDir.split('/').pop();
                    
                    // Check if this folder should be ignored
                    if (TokenImageReplacement._isFolderIgnored(subDirName)) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Ignoring folder: ${subDirName}`, "", true, false);
                        continue;
                    }
                    
                    // Update overall progress (only count non-ignored directories)
                    processedCount++;
                    this.cache.overallProgress = processedCount;
                    this.cache.currentStepName = subDirName;
                    
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Processing folder ${processedCount}/${nonIgnoredDirs.length}: ${subDirName}`, "", true, false);
                    
                    // Update window progress if it exists
                    if (this.window && this.window.updateScanProgress) {
                        const statusText = this._truncateStatusText(`Scanning ${subDirName}: ${files.length} files found`);
                        this.window.updateScanProgress(processedCount, nonIgnoredDirs.length, statusText);
                        // Small delay to make progress visible
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                    // Progress logging is now handled above
                    const subDirFiles = await this._scanSubdirectory(subDir, basePath);
                    files.push(...subDirFiles);
                    
                    // Process files into cache immediately so they're available for incremental saves
                    if (subDirFiles.length > 0) {
                        await this._processFiles(subDirFiles, basePath, false); // Don't clear cache, just add files
                        
                        // Save more frequently for large subdirectories (every 500 files)
                        if (this.cache.files.size % 500 === 0 && this.cache.files.size > 0) {
                            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Frequent save checkpoint - ${this.cache.files.size} files processed`, "", false, false);
                            try {
                                await this._saveCacheToStorage(true); // Incremental save
                            } catch (saveError) {
                                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Checkpoint save failed: ${saveError.message}`, "", false, false);
                                // Continue with scan
                            }
                        }
                    }
                    
                    // Save cache incrementally after each main folder to prevent data loss
                    if (subDirFiles.length > 0) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Saving progress after ${subDirName} (${subDirFiles.length} files)...`, "", false, false);
                        try {
                        await this._saveCacheToStorage(true); // true = incremental save
                            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Successfully saved progress after ${subDirName}`, "", false, false);
                        } catch (saveError) {
                            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL - Failed to save progress after ${subDirName}: ${saveError.message}`, "", false, false);
                            // Continue with scan even if save fails
                        }
                    }
                    
                    // Log progress with percentage and file count
                    const progressPercent = Math.round((processedCount / nonIgnoredDirs.length) * 100);
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: [${progressPercent}%] Completed ${subDirName} - ${files.length} files total`, "", false, false);
                }
            }
            
            // Validate that we've processed all expected directories
            if (processedCount !== nonIgnoredDirs.length) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: WARNING - Expected to process ${nonIgnoredDirs.length} directories but only processed ${processedCount}`, "", true, false);
            }
            
            // Ensure progress is complete
            this.cache.overallProgress = nonIgnoredDirs.length;
            this.cache.currentStepName = "Complete";
            
            if (files.length === 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No supported image files found in ${basePath} or its subdirectories`, "", true, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error scanning directory ${basePath}: ${error.message}`, "", false, false);
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
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.files.length} files in ${subDir}`, "", true, false);
                
                // Categories will be generated from folder structure when window opens
                
                // Update progress tracking for current step
                this.cache.currentStepTotal = response.files.length;
                this.cache.currentStepProgress = 0;
                
                // Build the current path for display
                const pathParts = subDir.replace(basePath + '/', '').split('/');
                this.cache.currentPath = pathParts.join(' | ');
                
                for (let i = 0; i < response.files.length; i++) {
                    // Check if we should pause
                    if (this.cache.isPaused) {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan paused by user during file processing.", "", true, false);
                        return files;
                    }
                    
                    const filePath = response.files[i];
                    const fileName = filePath.split('/').pop();
                    
                    // Update current file being processed
                    this.cache.currentStepProgress = i + 1;
                    this.cache.currentFileName = fileName;
                    
                    // Update window with detailed progress
                    if (this.window && this.window.updateScanProgress) {
                        this.window.updateScanProgress(i + 1, response.files.length, `${this.cache.currentPath} | ${i + 1} of ${response.files.length} | ${fileName}`);
                        // Small delay to make progress visible
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                    
                    const fileInfo = await this._processFileInfo(filePath, basePath);
                    if (fileInfo) {
                        files.push(fileInfo);
                    }
                }
            }
            
            // Recursively scan deeper subdirectories
            if (response.dirs && response.dirs.length > 0) {
                const parentDirName = subDir.split('/').pop();
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.dirs.length} deeper subdirectories in ${parentDirName}`, "", true, false);
                
                for (let i = 0; i < response.dirs.length; i++) {
                    const deeperDir = response.dirs[i];
                    const deeperDirName = deeperDir.split('/').pop();
                    
                    // Check if this folder should be ignored
                    if (TokenImageReplacement._isFolderIgnored(deeperDirName)) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Ignoring subfolder: ${parentDirName}/${deeperDirName}`, "", true, false);
                        continue;
                    }
                    
                    // Update window progress with detailed subdirectory info
                    if (this.window && this.window.updateScanProgress) {
                        const statusText = this._truncateStatusText(`Scanning ${parentDirName}/${deeperDirName}: ${files.length} files found`);
                        this.window.updateScanProgress(i + 1, response.dirs.length, statusText);
                    }
                    
                    const deeperFiles = await this._scanSubdirectory(deeperDir, basePath);
                    files.push(...deeperFiles);
                    
                    // Categories will be generated from folder structure when window opens
                    
                    // Log progress more frequently - every 3 items or at the end
                    if ((i + 1) % 3 === 0 || i === response.dirs.length - 1) {
                        const progressPercent = Math.round(((i + 1) / response.dirs.length) * 100);
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: [${progressPercent}%] ${parentDirName}/${deeperDirName} - ${files.length} files`, "", true, false);
                    }
                }
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error scanning subdirectory ${subDir}: ${error.message}`, "", false, false);
        }
        
        return files;
    }
    
    /**
     * Process file information and filter for supported formats
     */
    static async _processFileInfo(filePath, basePath) {
        
        // Check if file has supported extension
        const extension = filePath.split('.').pop()?.toLowerCase();
        if (!TokenImageReplacement.SUPPORTED_FORMATS.includes(`.${extension}`)) {
            return null;
        }
        
        // Validate file path - check for invalid characters
        if (this._isInvalidFilePath(filePath)) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping invalid file path: ${filePath}`, "", true, false);
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Could not get file info for ${filePath}: ${error.message}`, "", false, false);
        }
        
        // Extract metadata from filename and path
        const metadata = TokenImageReplacement._extractMetadata(fileName, relativePath);
        
        
        return {
            name: fileName,
            path: relativePath,
            fullPath: filePath,
            size: fileSize,
            lastModified: lastModified,
            metadata: metadata
        };
    }
    
    /**
     * Check if a file path contains invalid characters or patterns
     */
    static _isInvalidFilePath(filePath) {
        // Always check for wildcards and other invalid characters - these should never be allowed
        if (filePath.includes('*') || filePath.includes('?') || filePath.includes('[') || filePath.includes(']')) {
            return true;
        }
        
        // Check for other potentially problematic patterns
        if (filePath.includes('..') || filePath.includes('//')) {
            return true;
        }
        
        // Check if the path looks like a valid Foundry path
        if (!filePath.startsWith('modules/') && !filePath.startsWith('assets/') && !filePath.startsWith('data/')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Process and categorize files for the cache
     */
    static async _processFiles(files, basePath, clearCache = false) {
        
        // Only clear existing cache if explicitly requested (for complete rescans)
        if (clearCache) {
            this.cache.files.clear();
            this.cache.folders.clear();
            this.cache.creatureTypes.clear();
        }
        
        let validFiles = 0;
        let skippedFiles = 0;
        
        for (const file of files) {
            // Extract filename and path information
            const fileName = file.name || file;
            const filePath = file.path || file;
            
            // Check if file should be ignored based on ignored words patterns
            if (this._shouldIgnoreFile(fileName)) {
                skippedFiles++;
                this.cache.ignoredFilesCount++;
                continue;
            }
            
            // Validate the full path before storing
            const fullPath = `${basePath}/${filePath}`;
            if (this._isInvalidFilePath(fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping invalid full path: ${fullPath}`, "", true, false);
                skippedFiles++;
                continue;
            }
            
            // Process file info to generate metadata
            const fileInfo = await this._processFileInfo(fullPath, basePath);
            if (!fileInfo) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping file that failed processing: ${fullPath}`, "", true, false);
                skippedFiles++;
                continue;
            }
            
            // Store in main files cache with metadata
            this.cache.files.set(fileName.toLowerCase(), fileInfo);
            
            validFiles++;
            
            // Categorize by folder
            this._categorizeFile(fileName, filePath);
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache built with ${validFiles} valid files, skipped ${skippedFiles} invalid files`, "", true, false);
    }
    
    /**
     * Check if a filename matches any ignored word patterns
     * Supports wildcards: "spirit" (exact), "*spirit" (ends with), "spirit*" (starts with), "*spirit*" (contains)
     * @param {string} fileName - The filename to check
     * @returns {boolean} True if the file should be ignored
     */
    static _shouldIgnoreFile(fileName) {
        const ignoredWords = getSettingSafely(MODULE.ID, 'tokenImageReplacementIgnoredWords', '');
        if (!ignoredWords || ignoredWords.trim() === '') {
            return false;
        }
        
        const patterns = ignoredWords.split(',').map(p => p.trim()).filter(p => p.length > 0);
        const fileNameLower = fileName.toLowerCase();
        
        for (const pattern of patterns) {
            const patternLower = pattern.toLowerCase();
            
            // Handle different wildcard patterns
            if (patternLower.startsWith('*') && patternLower.endsWith('*')) {
                // *spirit* - contains
                const searchTerm = patternLower.slice(1, -1);
                if (fileNameLower.includes(searchTerm)) {
                    return true;
                }
            } else if (patternLower.startsWith('*')) {
                // *spirit - ends with
                const searchTerm = patternLower.slice(1);
                if (fileNameLower.endsWith(searchTerm)) {
                    return true;
                }
            } else if (patternLower.endsWith('*')) {
                // spirit* - starts with
                const searchTerm = patternLower.slice(0, -1);
                if (fileNameLower.startsWith(searchTerm)) {
                    return true;
                }
            } else {
                // spirit - exact match (as a word or part of filename)
                if (fileNameLower.includes(patternLower)) {
                    return true;
                }
            }
        }
        
        return false;
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
     * Categorize files by creature type based on folder structure and filename
     */
    static _categorizeByCreatureType(fileName, folderPath) {
        const folderLower = folderPath.toLowerCase();
        const fileNameLower = fileName.toLowerCase();
        
        // First try folder-based categorization
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
        
        // Fallback: categorize by filename keywords
        const creatureKeywords = {
            'orc': ['orc', 'orcs'],
            'elf': ['elf', 'elves', 'elven'],
            'dwarf': ['dwarf', 'dwarves', 'dwarven'],
            'human': ['human', 'humans'],
            'dragon': ['dragon', 'drake', 'wyrm'],
            'beast': ['bear', 'wolf', 'tiger', 'lion', 'eagle', 'hawk'],
            'undead': ['skeleton', 'zombie', 'ghost', 'wraith', 'lich'],
            'construct': ['golem', 'automaton', 'construct'],
            'elemental': ['fire', 'water', 'earth', 'air', 'elemental']
        };
        
        for (const [creatureType, keywords] of Object.entries(creatureKeywords)) {
            for (const keyword of keywords) {
                if (fileNameLower.includes(keyword)) {
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
     * Get search terms for finding a matching image (always uses exact matching for token data)
     */
    static _getSearchTerms(tokenDocument) {
        // Cache search terms to avoid repeated logging
        const cacheKey = `${tokenDocument.id || tokenDocument.name}`;
        if (this._searchTermsCache && this._searchTermsCache[cacheKey]) {
            return this._searchTermsCache[cacheKey];
        }
        
        const terms = [];
        
        // Priority 1: Represented Actor name (most reliable for determining what the token is)
        if (tokenDocument.actor && tokenDocument.actor.name) {
            terms.push(tokenDocument.actor.name);
        }
        
        
        // Priority 2: Token name (may contain additional context)
        terms.push(tokenDocument.name);
        
        // Priority 3: Creature subtype from the actor's system data
        if (tokenDocument.actor?.system?.details?.type) {
            const creatureType = tokenDocument.actor.system.details.type;
            if (typeof creatureType === 'object' && creatureType.subtype) {
                terms.push(creatureType.subtype);
            }
        }
        
        // Priority 4: Base name from represented actor (remove parentheticals and numbers)
        if (tokenDocument.actor && tokenDocument.actor.name) {
            const baseName = tokenDocument.actor.name.replace(/\([^)]*\)/g, '').replace(/\s*\d+$/, '').trim();
            if (baseName && baseName !== tokenDocument.actor.name) {
            terms.push(baseName);
            }
        }
        
        // Priority 5: Individual words from the represented actor name for better matching
        if (tokenDocument.actor && tokenDocument.actor.name) {
            const words = tokenDocument.actor.name.toLowerCase().split(/[\s\-_()]+/).filter(word => word.length > 2);
        terms.push(...words);
        }
        
        // Priority 6: Individual words from token name (as fallback)
        const tokenWords = tokenDocument.name.toLowerCase().split(/[\s\-_()]+/).filter(word => word.length > 2);
        terms.push(...tokenWords);
        
        // Remove duplicates and empty terms
        const filteredTerms = [...new Set(terms.filter(term => term && typeof term === 'string' && term.trim().length > 0))];
        
        // Cache the result
        if (!this._searchTermsCache) {
            this._searchTermsCache = {};
        }
        this._searchTermsCache[cacheKey] = filteredTerms;
        
        return filteredTerms;
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
        
        // Also clear from persistent storage
        this._clearCacheFromStorage();
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache cleared from memory and storage", "", true, false);
    }
    
    /**
     * Refresh the cache
     */
    static async refreshCache() {
        const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
        if (basePath) {
            await this._scanFolderStructure(basePath);
        }
    }
    
    
    /**
     * Check overall integration status
     */
    static getIntegrationStatus() {
        const status = {
            featureEnabled: game.settings.get(MODULE.ID, 'tokenImageReplacementEnabled'),
            basePathConfigured: !!game.settings.get(MODULE.ID, 'tokenImageReplacementPath'),
            cacheReady: this.cache.files.size > 0,
            hookRegistered: false,
            totalFiles: this.cache.files.size,
            lastScan: this.cache.lastScan
        };
        


        // Check if hook is registered (safe way for different Foundry versions)
        try {
            if (Hooks.all && Hooks.all.get) {
                const hooks = Hooks.all.get('createToken') || [];
                status.hookRegistered = hooks.some(hook => hook.name === '_onTokenCreated');
            } else {
                status.hookRegistered = true; // Assume it's working if we can't check
            }
        } catch (error) {
            status.hookRegistered = true; // Assume it's working if we can't check
        }
        
        return status;
    }
    
    /**
     * Save cache to localStorage
     * @param {boolean} isIncremental - If true, this is an incremental save during scanning
     */
    static async _saveCacheToStorage(isIncremental = false) {
        try {
            const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_saveCacheToStorage) - Retrieved basePath: "${basePath}"`, "", true, false);
            
            // Only generate fingerprint for final saves, not incremental ones (performance)
            let folderFingerprint = null;
            if (!isIncremental) {
                try {
                    // Add timeout to prevent hanging on large directories
                    const fingerprintPromise = this._generateFolderFingerprint(basePath);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Fingerprint generation timeout after 30 seconds')), 30000)
                    );
                    
                    folderFingerprint = await Promise.race([fingerprintPromise, timeoutPromise]);
                    
                    // CRITICAL FIX: Validate fingerprint for final saves
                    if (!folderFingerprint || folderFingerprint === 'error' || folderFingerprint === 'no-path') {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: WARNING - Invalid fingerprint generated: ${folderFingerprint}. This may cause issues on next load.`, "", false, false);
                    }
                } catch (fingerprintError) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Fingerprint generation failed: ${fingerprintError.message}. Using timestamp-based fingerprint.`, "", false, false);
                    // Use timestamp as fallback fingerprint
                    folderFingerprint = `timestamp_${Date.now()}`;
                }
            } else {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Incremental save - fingerprint will be null (will be generated on final save)", "", false, false);
            }
            
            // Build cache data with streaming compression to avoid memory issues
            const compressedData = await this._buildCompressedCacheData(basePath, folderFingerprint, isIncremental);
            const compressedSizeMB = (new Blob([compressedData]).size / (1024 * 1024)).toFixed(2);
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache saved: ${compressedSizeMB}MB (${this.cache.files.size} files)`, "", false, false);
            
            try {
                // Store cache in game.settings (server-side) instead of localStorage (browser-side)
                // This persists across browser refreshes and different players on Molten hosting
                await game.settings.set(MODULE.ID, 'tokenImageReplacementCache', compressedData);
                
                if (isIncremental) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Progress saved (${this.cache.files.size} files so far)`, "", false, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache saved to persistent storage", "", false, false);
                }
            } catch (storageError) {
                if (storageError.name === 'QuotaExceededError') {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL - Storage quota exceeded even after compression! Cache size: ${compressedSizeMB}MB. Consider reducing image collection size.`, "", false, false);
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Files in cache: ${this.cache.files.size}, Folders: ${this.cache.folders.size}`, "", false, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL - Storage error: ${storageError.message}`, "", false, false);
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error name: ${storageError.name}, Stack: ${storageError.stack}`, "", false, false);
                }
                throw storageError;
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL ERROR saving cache: ${error.message}`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache data - Files: ${this.cache.files.size}, Folders: ${this.cache.folders.size}, isIncremental: ${isIncremental}`, "", false, false);
        }
    }
    
    /**
     * Build compressed cache data without creating full JSON in memory
     * @param {string} basePath - The base path for the cache
     * @param {string} folderFingerprint - The folder fingerprint
     * @param {boolean} isIncremental - Whether this is an incremental save
     * @returns {Promise<string>} Compressed cache data
     */
    static async _buildCompressedCacheData(basePath, folderFingerprint, isIncremental) {
        try {
            // Build cache data in streaming fashion to avoid memory issues
            let compressedData = '{';
            
            // Add metadata first (small objects)
            const metadata = {
                v: '1.4',
                ls: this.cache.lastScan || Date.now(),
                bp: basePath,
                ff: folderFingerprint,
                ii: isIncremental,
                tf: this.cache.totalFiles,
                ifc: this.cache.ignoredFilesCount || 0
            };
            
            compressedData += `"v":"${metadata.v}","ls":${metadata.ls},"bp":"${metadata.bp}","ff":"${metadata.ff}","ii":${metadata.ii},"tf":${metadata.tf},"ifc":${metadata.ifc},`;
            
            // Add files in chunks to avoid memory issues
            compressedData += '"f":[';
            let firstFile = true;
            for (const [fileName, fileData] of this.cache.files.entries()) {
                if (!firstFile) compressedData += ',';
                firstFile = false;
                
                // Compress file data inline
                const compressedFileData = this._compressFileData(fileData);
                compressedData += `["${fileName}",${compressedFileData}]`;
            }
            compressedData += '],';
            
            // Add folders in chunks
            compressedData += '"fo":[';
            let firstFolder = true;
            for (const [folderPath, folderData] of this.cache.folders.entries()) {
                if (!firstFolder) compressedData += ',';
                firstFolder = false;
                
                const compressedFolderData = this._compressFolderData(folderData);
                compressedData += `["${folderPath}",${compressedFolderData}]`;
            }
            compressedData += '],';
            
            // Add creature types in chunks
            compressedData += '"ct":[';
            let firstCreature = true;
            for (const [creatureType, creatureData] of this.cache.creatureTypes.entries()) {
                if (!firstCreature) compressedData += ',';
                firstCreature = false;
                
                const compressedCreatureData = this._compressCreatureData(creatureData);
                compressedData += `["${creatureType}",${compressedCreatureData}]`;
            }
            compressedData += ']';
            
            compressedData += '}';
            
            return compressedData;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Streaming compression failed: ${error.message}. Falling back to standard method.`, "", false, false);
            
            // Fallback to standard method (may still fail on very large caches)
            const cacheData = {
                version: '1.4',
                lastScan: this.cache.lastScan || Date.now(),
                basePath: basePath,
                folderFingerprint: folderFingerprint,
                isIncremental: isIncremental,
                totalFiles: this.cache.totalFiles,
                ignoredFilesCount: this.cache.ignoredFilesCount || 0,
                files: Array.from(this.cache.files.entries()),
                folders: Array.from(this.cache.folders.entries()),
                creatureTypes: Array.from(this.cache.creatureTypes.entries())
            };
            
            const cacheJson = JSON.stringify(cacheData);
            return this._compressCacheData(cacheJson);
        }
    }
    
    /**
     * Compress individual file data
     */
    static _compressFileData(fileData) {
        const compressed = {
            fp: fileData.fullPath,
            fn: fileData.fileName,
            fe: fileData.fileExtension,
            fs: fileData.fileSize,
            lm: fileData.lastModified
        };
        
        if (fileData.metadata) {
            compressed.m = {
                t: fileData.metadata.tags || [],
                ct: fileData.metadata.creatureType || ''
            };
        }
        
        return JSON.stringify(compressed);
    }
    
    /**
     * Compress folder data
     */
    static _compressFolderData(folderData) {
        return JSON.stringify({
            id: folderData.isDirectory,
            sd: folderData.subdirectories || [],
            fp: folderData.folderPath
        });
    }
    
    /**
     * Compress creature type data
     */
    static _compressCreatureData(creatureData) {
        return JSON.stringify(creatureData || []);
    }
    
    /**
     * Estimate uncompressed size without building full JSON
     */
    static _estimateUncompressedSize() {
        // More realistic estimation based on actual data patterns
        // Real file entries are much larger due to full paths and metadata
        const avgFileDataSize = 400; // Increased from 200 - real entries are ~400-600 bytes
        const avgFolderDataSize = 150; // Increased from 100 - folder paths can be long
        const avgCreatureDataSize = 100; // Increased from 50 - creature type arrays
        const metadataSize = 1000; // Increased from 500 - more metadata fields
        
        const estimatedSize = (this.cache.files.size * avgFileDataSize) +
                             (this.cache.folders.size * avgFolderDataSize) +
                             (this.cache.creatureTypes.size * avgCreatureDataSize) +
                             metadataSize;
        
        return (estimatedSize / (1024 * 1024)).toFixed(2);
    }

    /**
     * Compress cache data using simple string compression
     * @param {string} jsonData - The JSON string to compress
     * @returns {string} Compressed data
     */
    static _compressCacheData(jsonData) {
        try {
            // Simple compression: remove extra whitespace and use shorter property names
            let compressed = jsonData
                // Remove unnecessary whitespace
                .replace(/\s+/g, ' ')
                .replace(/,\s+/g, ',')
                .replace(/:\s+/g, ':')
                // Shorten common property names (reversible)
                .replace(/"fullPath"/g, '"fp"')
                .replace(/"fileName"/g, '"fn"')
                .replace(/"fileExtension"/g, '"fe"')
                .replace(/"fileSize"/g, '"fs"')
                .replace(/"lastModified"/g, '"lm"')
                .replace(/"folderPath"/g, '"fp"')
                .replace(/"creatureType"/g, '"ct"')
                .replace(/"isDirectory"/g, '"id"')
                .replace(/"subdirectories"/g, '"sd"')
                .replace(/"lastScan"/g, '"ls"')
                .replace(/"basePath"/g, '"bp"')
                .replace(/"folderFingerprint"/g, '"ff"')
                .replace(/"isIncremental"/g, '"ii"')
                .replace(/"totalFiles"/g, '"tf"')
                .replace(/"version"/g, '"v"')
                .replace(/"files"/g, '"f"')
                .replace(/"folders"/g, '"fo"')
                .replace(/"creatureTypes"/g, '"ct"')
                .replace(/"metadata"/g, '"m"')
                .replace(/"tags"/g, '"t"');
            
            return compressed;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Compression failed: ${error.message}. Using uncompressed data.`, "", false, false);
            return jsonData;
        }
    }
    
    /**
     * Decompress cache data
     * @param {string} compressedData - The compressed data to decompress
     * @returns {string} Decompressed JSON string
     */
    static _decompressCacheData(compressedData) {
        try {
            // Reverse the compression
            let decompressed = compressedData
                // Restore property names
                .replace(/"fp"/g, '"fullPath"')
                .replace(/"fn"/g, '"fileName"')
                .replace(/"fe"/g, '"fileExtension"')
                .replace(/"fs"/g, '"fileSize"')
                .replace(/"lm"/g, '"lastModified"')
                .replace(/"fp"/g, '"folderPath"')
                .replace(/"ct"/g, '"creatureType"')
                .replace(/"id"/g, '"isDirectory"')
                .replace(/"sd"/g, '"subdirectories"')
                .replace(/"ls"/g, '"lastScan"')
                .replace(/"bp"/g, '"basePath"')
                .replace(/"ff"/g, '"folderFingerprint"')
                .replace(/"ii"/g, '"isIncremental"')
                .replace(/"tf"/g, '"totalFiles"')
                .replace(/"v"/g, '"version"')
                .replace(/"f"/g, '"files"')
                .replace(/"fo"/g, '"folders"')
                .replace(/"ct"/g, '"creatureTypes"')
                .replace(/"m"/g, '"metadata"')
                .replace(/"t"/g, '"tags"');
            
            return decompressed;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Decompression failed: ${error.message}. Using raw data.`, "", false, false);
            return compressedData;
        }
    }

    /**
     * Monitor cache size and warn if approaching localStorage limits
     * @param {Object} cacheData - The cache data to monitor
     * @returns {string} Cache size in MB
     */
    static _monitorCacheSize(cacheData) {
        const cacheJson = JSON.stringify(cacheData);
        const cacheSizeMB = (new Blob([cacheJson]).size / (1024 * 1024)).toFixed(2);
        
        if (cacheSizeMB > 8) {
            // Warn at 8MB (approaching 10MB limit)
            postConsoleAndNotification(MODULE.NAME, 
                `WARNING: Cache size ${cacheSizeMB}MB approaching localStorage limit. Consider reducing image collection.`, 
                "", true, false);
        }
        return cacheSizeMB;
    }
    
    /**
     * Load cache from localStorage
     */
    static async _loadCacheFromStorage() {
        try {
            // Load cache from game.settings (server-side) instead of localStorage (browser-side)
            const savedCache = game.settings.get(MODULE.ID, 'tokenImageReplacementCache');
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_loadCacheFromStorage) - Loading cache - exists: ${!!savedCache}, size: ${savedCache?.length || 0}`, "", true, false);
            if (!savedCache) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No cache data found in server settings", "", true, false);
                return false;
            }
            
            // Try to decompress the cache data (handles both compressed and uncompressed data)
            let decompressedCache;
            try {
                decompressedCache = this._decompressCacheData(savedCache);
            } catch (decompressionError) {
                // If decompression fails, try parsing as-is (might be uncompressed)
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Decompression failed, trying uncompressed format: ${decompressionError.message}`, "", true, false);
                decompressedCache = savedCache;
            }
            
            const cacheData = JSON.parse(decompressedCache);
            
            // Validate cache data structure (handle both old and new compressed formats)
            const hasVersion = cacheData.version || cacheData.v;
            const hasFiles = cacheData.files || cacheData.f;
            const hasFolders = cacheData.folders || cacheData.fo;
            const hasCreatureTypes = cacheData.creatureTypes || cacheData.ct || cacheData.creatureType;
            
            // Debug logging to see what we actually have
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_loadCacheFromStorage) - Cached basePath: "${cacheData.basePath}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_loadCacheFromStorage) - Cached fingerprint: "${cacheData.folderFingerprint}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache validation - Version: ${hasVersion}, Files: ${hasFiles?.length || 'missing'}, Folders: ${hasFolders?.length || 'missing'}, CreatureTypes: ${hasCreatureTypes?.length || 'missing'}`, "", true, false);
            
            // Debug: Log the actual cache data structure
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: (in loadCacheFromStorage) Cache data keys: ${Object.keys(cacheData).join(', ')}`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: (in loadCacheFromStorage) CreatureTypes check - creatureTypes: ${!!cacheData.creatureTypes}, ct: ${!!cacheData.ct}, ct length: ${cacheData.ct?.length || 'undefined'}`, "", true, false);
            
            // TEMPORARY FIX: Allow cache with missing creatureTypes (can be empty array)
            if (!hasVersion || !hasFiles || !hasFolders) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: (in loadCacheFromStorage) Invalid cache data in storage, will rescan", "", false, false);
                return false;
            }
            
            // CreatureTypes can be missing/empty - that's OK
            if (!hasCreatureTypes) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement:  (in loadCacheFromStorage) CreatureTypes missing, but cache is valid - proceeding", "", true, false);
            }
            
            // Check version compatibility
            const version = cacheData.version || cacheData.v;
            if (!version || !version.startsWith('1.')) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache version incompatible (${version}), will rescan`, "", false, false);
                return false;
            }
            
            // Check if base path changed
            const currentBasePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
            const cacheBasePath = cacheData.basePath || cacheData.bp;
            if (cacheBasePath !== currentBasePath) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Base path changed, will rescan", "", true, false);
                return false;
            }
            
            // Check if cache is still valid (less than 30 days old)
            // Only check age if lastScan exists and is not from an incremental save
            const lastScan = cacheData.lastScan || cacheData.ls;
            const isIncremental = cacheData.isIncremental || cacheData.ii;
            if (lastScan && !isIncremental) {
                const cacheAge = Date.now() - lastScan;
                const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
                
                if (cacheAge > maxAge) {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache is stale (older than 30 days), will rescan", "", false, false);
                    return false;
                }
            }
            
            // Check if folder fingerprint changed (file system changes)
            // Only check fingerprint if it exists and is not from an incremental save
            if (cacheData.folderFingerprint && !cacheData.isIncremental) {
                const savedFingerprint = cacheData.folderFingerprint;
                
                // CRITICAL FIX: Validate saved fingerprint
                if (savedFingerprint === 'error' || savedFingerprint === 'no-path') {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Saved cache has invalid fingerprint (${savedFingerprint}), will update cache`, "", false, false);
                    // Don't force rescan, just need to update fingerprint via incremental update
                } else {
                const currentFingerprint = await this._generateFolderFingerprint(currentBasePath);
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_loadCacheFromStorage) - Fingerprint comparison: cached="${savedFingerprint}" vs current="${currentFingerprint}"`, "", true, false);
                    if (savedFingerprint !== currentFingerprint) {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG (_loadCacheFromStorage) - Folder structure changed, will rescan", "", true, false);
                    return false;
                }
                }
            } else if (!cacheData.folderFingerprint && !cacheData.isIncremental) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Saved cache missing fingerprint (likely from failed scan), cache may be incomplete", "", false, false);
            }
            
            // Check if we need to update the cache
            const autoUpdate = getSettingSafely(MODULE.ID, 'tokenImageReplacementAutoUpdate', false);
            const needsUpdate = await this._checkForIncrementalUpdates(currentBasePath);
            
            if (needsUpdate && autoUpdate) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Changes detected, performing automatic incremental update", "", false, false);
                ui.notifications.info("Token Image Replacement changes detected: Performing incremental update.");
                await this._doIncrementalUpdate(currentBasePath);
                return true; // Cache was updated, proceed with loaded cache
            } else if (needsUpdate && !autoUpdate) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Changes detected, manual update needed", "", false, true);
                ui.notifications.info("Token Image Replacement changes detected. You should scan for images to get the latest images.");
                // Still load existing cache, just notify user
            }
            
            // Restore cache (handle both old and new compressed formats)
            this.cache.files = new Map();
            const filesData = cacheData.files || cacheData.f;
            for (const [fileName, fileInfo] of filesData) {
                this.cache.files.set(fileName, fileInfo);
            }
            
            this.cache.folders = new Map(cacheData.folders || cacheData.fo);
            
            // Debug: Log creature types data structure
            const creatureTypesData = cacheData.creatureTypes || cacheData.ct || cacheData.creatureType;
           
            this.cache.creatureTypes = new Map(creatureTypesData);
            
            this.cache.lastScan = cacheData.lastScan || cacheData.ls;
            this.cache.totalFiles = cacheData.totalFiles || cacheData.tf;
            this.cache.ignoredFilesCount = cacheData.ignoredFilesCount || cacheData.ifc || 0;
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache restored from storage: ${this.cache.files.size} files, last scan: ${new Date(this.cache.lastScan).toLocaleString()}`, "", false, false);
            
            // Update the cache status setting for display
            this._updateCacheStatusSetting();
            
            // Log final cache status after loading from storage
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache loading completed. Files: ${this.cache.files.size}, Folders: ${this.cache.folders.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", false, false);
            
            return true;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL ERROR loading cache: ${error.message}`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error stack: ${error.stack}`, "", false, false);
            
            // Try to get cache info for diagnostics
            try {
                const savedCache = localStorage.getItem('tokenImageReplacement_cache');
                if (savedCache) {
                    const cacheSize = new Blob([savedCache]).size;
                    const cacheSizeMB = (cacheSize / (1024 * 1024)).toFixed(2);
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Corrupted cache size: ${cacheSizeMB}MB`, "", false, false);
                }
            } catch (diagError) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Could not get cache diagnostics: ${diagError.message}`, "", false, false);
            }
            
            return false;
        }
    }
    
    /**
     * Clear cache from localStorage
     */
    static _clearCacheFromStorage() {
        try {
            localStorage.removeItem('tokenImageReplacement_cache');
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache cleared from persistent storage", "", false, false);
            
            // Update the cache status setting to reflect cleared state
            this._updateCacheStatusSetting();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error clearing cache: ${error.message}`, "", false, false);
        }
    }
    
    
    /**
     * Generate a fingerprint of the folder structure to detect changes
     */
    static async _generateFolderFingerprint(basePath) {
        try {
            if (!basePath) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cannot generate fingerprint - no basePath provided", "", false, false);
                return 'no-path';
            }
            
            // Get a list of all files and folders recursively
            const allPaths = [];
            let errorCount = 0;
            async function collectPaths(dir) {
                try {
                    const result = await FilePicker.browse('data', dir);
                    // Add directories (for traversal only, not for fingerprint)
                    for (const subdir of result.dirs) {
                        await collectPaths(subdir);
                    }
                    // Add files (only image files) - these are what matter for fingerprint
                    for (const file of result.files) {
                        if (TokenImageReplacement.SUPPORTED_FORMATS.some(format => file.toLowerCase().endsWith(format))) {
                            allPaths.push(file); // Just the file path, no prefix
                        }
                    }
                } catch (error) {
                    // Skip inaccessible directories but count errors
                    errorCount++;
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Warning - cannot access directory ${dir}: ${error.message}`, "", false, false);
                }
            }
            
            await collectPaths.call(this, basePath);
            
            // Debug: Log what we're actually counting
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_generateFolderFingerprint) - Collected ${allPaths.length} paths for fingerprint`, "", true, false);
            if (allPaths.length > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_generateFolderFingerprint) - Sample paths: ${allPaths.slice(0, 5).join(', ')}`, "", true, false);
            }
            
            if (allPaths.length === 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: WARNING - No paths found for fingerprint at ${basePath}`, "", false, false);
            }
            
            if (errorCount > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Fingerprint generated with ${errorCount} directory access errors`, "", false, false);
            }
            
            // Sort paths for consistent fingerprint
            allPaths.sort();
            
            // Create a simple hash of the paths
            const pathsString = allPaths.join('|');
            let hash = 0;
            for (let i = 0; i < pathsString.length; i++) {
                const char = pathsString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            
            const fingerprint = hash.toString();
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_generateFolderFingerprint) - Fingerprint generated: ${fingerprint} (${allPaths.length} paths)`, "", false, false);
            
            return fingerprint;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL ERROR generating folder fingerprint: ${error.message}`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Stack trace: ${error.stack}`, "", false, false);
            return 'error';
        }
    }
    
    /**
     * Force cache refresh (ignores stored cache)
     */
    static async forceRefreshCache() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Force refreshing cache...", "", false, false);
        this._clearCacheFromStorage();
        const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
        if (basePath) {
            await this._scanFolderStructure(basePath);
        }
    }
    
    /**
     * Check cache storage status
     */
    static getCacheStorageStatus() {
        const savedCache = localStorage.getItem('tokenImageReplacement_cache');
        if (!savedCache) {
            return { hasStoredCache: false, message: "No cache in storage" };
        }
        
        try {
            const cacheData = JSON.parse(savedCache);
        } catch (error) {
        }
        
        try {
            const cacheData = JSON.parse(savedCache);
            
            // Handle the case where lastScan is null, 0, or invalid
            let lastScanTime = cacheData.lastScan;
            if (!lastScanTime || lastScanTime === 0) {
                lastScanTime = Date.now(); // Use current time as fallback
            }
            
            const cacheAge = Date.now() - lastScanTime;
            const ageHours = (cacheAge / (1000 * 60 * 60)).toFixed(1);
            
            // Cap the age display at a reasonable maximum (e.g., 9999 hours)
            const displayAge = Math.min(parseFloat(ageHours), 9999);
            
            return {
                hasStoredCache: true,
                fileCount: cacheData.files?.length || 0,
                lastScan: lastScanTime,
                ageHours: displayAge,
                message: `${cacheData.files?.length || 0} files, ${displayAge} hours old`
            };
        } catch (error) {
            return { hasStoredCache: false, message: `Error reading cache: ${error.message}` };
        }
    }

    /**
     * Update the cache status setting for display in module settings
     */
    static _updateCacheStatusSetting() {
        try {
            if (game.settings && game.settings.set) {
                const status = this.getCacheStorageStatus();
                game.settings.set('coffee-pub-blacksmith', 'tokenImageReplacementDisplayCacheStatus', status.message);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache status updated: ${status.message}`, "", false, false);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error updating cache status setting: ${error.message}`, "", false, false);
        }
    }

    /**
     * Truncate status text to fit in the progress bar
     */
    static _truncateStatusText(text, maxLength = 80) {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Check for incremental updates to the cache
     */
    static async _checkForIncrementalUpdates(basePath) {
        try {
            // Check if folder fingerprint changed (file system changes)
            const currentFingerprint = await this._generateFolderFingerprint(basePath);
            const savedCache = localStorage.getItem('tokenImageReplacement_cache');
            
            if (savedCache) {
                const cacheData = JSON.parse(savedCache);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_checkForIncrementalUpdates) - Comparing paths: cached="${cacheData.basePath}" vs current="${basePath}"`, "", true, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_checkForIncrementalUpdates) - Comparing fingerprints: cached="${cacheData.folderFingerprint}" vs current="${currentFingerprint}"`, "", true, false);
                if (cacheData.folderFingerprint !== currentFingerprint) {
                    // Only start scan if auto-update is enabled
                    const autoUpdate = getSettingSafely(MODULE.ID, 'tokenImageReplacementAutoUpdate', false);
                    if (autoUpdate) {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, performing incremental update...", "", false, false);
                        await this._doIncrementalUpdate(basePath);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, manual update needed", "", false, true);
                    }
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache is up to date", "", true, false);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error checking for incremental updates: ${error.message}`, "", false, false);
        }
    }



}
