// ================================================================== 
// ===== IMAGE MATCHING LOGIC =======================================
// ================================================================== 

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

/**
 * Image Matching Logic
 * Handles all matching and scoring algorithms
 */
export class ImageMatching {
    /**
     * Normalize text for consistent matching
     * @param {string} text - Text to normalize
     * @returns {string} Normalized text
     */
    static _normalizeText(text) {
        if (!text || typeof text !== 'string') return '';
        // Replace all special characters with spaces, then normalize
        return text.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
    }
    
    /**
     * Extract words from text, splitting on common separators
     * @param {string} text - Text to extract words from
     * @returns {Array<string>} Array of words
     */
    static _extractWords(text) {
        if (!text || typeof text !== 'string') return [];
        // Since we normalize special characters to spaces, we only need to split on spaces
        return text.split(/\s+/).filter(word => word.length > 0);
    }
    
    /**
     * Generate word combinations for matching - simplified approach
     * Since we normalize all special characters to spaces, we only need space-separated combinations
     * Examples:
     *   ["frost", "giant"] -> ["frost giant"]
     * @param {Array<string>} words - Array of words to combine
     * @returns {Array<string>} Array of combinations
     */
    static _generateCombinations(words) {
        if (!Array.isArray(words) || words.length === 0) return [];
        if (words.length === 1) return [words[0]]; // Single word, no combinations needed
        
        const combinations = [];
        
        // Only generate space-separated combinations since we normalize special characters
        combinations.push(words.join(' '));      // frost giant
        
        return combinations;
    }
    
    /**
     * Check if any combination of source words matches in target text
     * Returns the best match score found
     * @param {Array<string>} sourceWords - Words to match
     * @param {string} targetText - Text to search in
     * @param {boolean} debug - Enable debug logging
     * @returns {Object} { matched: boolean, score: number, matchType: string }
     */
    static _matchCombinations(sourceWords, targetText, debug = false) {
        if (!Array.isArray(sourceWords) || sourceWords.length === 0 || !targetText) {
            return { matched: false, score: 0, matchType: 'none' };
        }
        
        const targetLower = this._normalizeText(targetText);
        
        
        // Single word matching
        if (sourceWords.length === 1) {
            const word = sourceWords[0];
            if (targetLower === word) {
                return { matched: true, score: 1.0, matchType: 'exact' };
            }
            if (targetLower.startsWith(word)) {
                return { matched: true, score: 0.9, matchType: 'starts' };
            }
            if (targetLower.endsWith(word)) {
                return { matched: true, score: 0.85, matchType: 'ends' };
            }
            if (targetLower.includes(word)) {
                return { matched: true, score: 0.8, matchType: 'contains' };
            }
            return { matched: false, score: 0, matchType: 'none' };
        }
        
        // PRIORITY 1: Exact phrase matching (most important)
        const phrase = sourceWords.join(' ');
        if (targetLower === phrase) {
            return { matched: true, score: 1.0, matchType: 'exact-phrase' };
        }
        if (targetLower.includes(phrase)) {
            return { matched: true, score: 0.95, matchType: 'phrase-contains' };
        }
        
        // PRIORITY 2: Check if target contains the phrase as separate words in sequence
        const targetWords = this._extractWords(targetLower);
        const sourcePhrase = sourceWords.join(' ');
        
        // Look for the phrase as consecutive words in the target
        for (let i = 0; i <= targetWords.length - sourceWords.length; i++) {
            const targetPhrase = targetWords.slice(i, i + sourceWords.length).join(' ');
            if (targetPhrase === sourcePhrase) {
                return { matched: true, score: 0.9, matchType: 'consecutive-words' };
            }
        }
        
        // PRIORITY 3: Individual word matching (only as last resort)
        let exactWordMatches = 0;
        let partialWordMatches = 0;
        
        for (const sourceWord of sourceWords) {
            let foundExact = false;
            let foundPartial = false;
            
            for (const targetWord of targetWords) {
                if (targetWord === sourceWord) {
                    exactWordMatches++;
                    foundExact = true;
                    break;
                } else if (targetWord.includes(sourceWord) || sourceWord.includes(targetWord)) {
                    partialWordMatches++;
                    foundPartial = true;
                    break;
                }
            }
            
        }
        
        // Only return individual word matches if we found at least some words
        if (exactWordMatches > 0 || partialWordMatches > 0) {
            const score = (exactWordMatches + partialWordMatches * 0.3) / sourceWords.length;
            return { matched: true, score: Math.max(score, 0.1), matchType: 'individual-words' };
        }
        
        return { matched: false, score: 0, matchType: 'none' };
    }

    /**
     * Calculate match score for token data (creature type, subtype, equipment, etc.)
     * Uses word combination utilities for improved multi-word matching
     * @param {string} tokenValue - The token data value to match
     * @param {string} fileNameLower - Lowercase filename
     * @param {string} filePathLower - Lowercase file path
     * @param {Object} fileInfo - File information object
     * @returns {number} Match score (0.0 to 1.0)
     */
    static _calculateTokenDataMatch(tokenValue, fileNameLower, filePathLower, fileInfo) {
        if (!tokenValue) return 0;
        
        const valueLower = this._normalizeText(tokenValue);
        const valueWords = this._extractWords(valueLower);
        let maxScore = 0;
        
        // Primary filename matching using word combination utilities
        const filenameMatch = this._matchCombinations(valueWords, fileNameLower);
        if (filenameMatch.matched) {
            maxScore = Math.max(maxScore, filenameMatch.score);
        }
        
        // Metadata tag matching
        if (fileInfo.metadata && fileInfo.metadata.tags) {
            for (const tag of fileInfo.metadata.tags) {
                const tagMatch = this._matchCombinations(valueWords, tag);
                if (tagMatch.matched) {
                    // Tags are high-value matches, boost score slightly
                    maxScore = Math.max(maxScore, tagMatch.score * 1.0);
                }
            }
        }
        
        // Specific metadata fields matching
        if (fileInfo.metadata) {
            const metadataFields = [
                'creatureType', 'subtype', 'specificType', 'weapon', 'armor', 
                'equipment', 'pose', 'action', 'direction', 'quality', 'class', 'profession'
            ];
            
            for (const field of metadataFields) {
                const value = fileInfo.metadata[field];
                if (value && typeof value === 'string') {
                    const metadataMatch = this._matchCombinations(valueWords, value);
                    if (metadataMatch.matched) {
                        maxScore = Math.max(maxScore, metadataMatch.score * 0.95);
                    }
                }
            }
        }
        
        // Folder path matching (lower priority)
        const pathMatch = this._matchCombinations(valueWords, filePathLower);
        if (pathMatch.matched) {
            // Path matches are less valuable, reduce score
            maxScore = Math.max(maxScore, pathMatch.score * 0.6);
        }
        
        return maxScore;
    }

    /**
     * Calculate match score for token name (flexible matching for any naming convention)
     * Uses word combination utilities for improved multi-word matching
     * @param {string} tokenName - The token name (e.g., "Bob (Creature)", "Creature 1", "Bob")
     * @param {string} fileNameLower - Lowercase filename
     * @param {string} filePathLower - Lowercase file path
     * @param {Object} fileInfo - File information object
     * @returns {number} Match score (0.0 to 1.0)
     */
    static _calculateTokenNameMatch(tokenName, fileNameLower, filePathLower, fileInfo) {
        if (!tokenName) return 0;
        
        const tokenNameLower = this._normalizeText(tokenName);
        let maxScore = 0;
        
        // Extract potential creature names from token name
        const potentialCreatureNames = [];
        
        // 1. Check for parentheses: "Bob (Creature)" -> "Creature" or "Bob (Frost Giant)" -> "Frost Giant"
        const parenMatch = tokenNameLower.match(/\(([^)]+)\)/);
        if (parenMatch) {
            const parenContent = parenMatch[1].trim();
            potentialCreatureNames.push(parenContent); // Keep full multi-word names
        }
        
        // 2. Check for numbers: "Creature 1" -> "Creature" or "Frost Giant 2" -> "Frost Giant"
        const numberMatch = tokenNameLower.match(/^(.+?)\s+\d+$/);
        if (numberMatch) {
            potentialCreatureNames.push(numberMatch[1].trim());
        }
        
        // 3. Check for "the": "Bob the Creature" -> "Creature" or "Bob the Frost Giant" -> "Frost Giant"
        const theMatch = tokenNameLower.match(/\bthe\s+(.+)$/);
        if (theMatch) {
            potentialCreatureNames.push(theMatch[1].trim());
        }
        
        // 4. If no patterns match, use the full token name
        if (potentialCreatureNames.length === 0) {
            potentialCreatureNames.push(tokenNameLower);
        }
        
        // Remove duplicates and filter out common words
        const uniqueNames = [...new Set(potentialCreatureNames)].filter(name => 
            name.length >= 2 && 
            !['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for'].includes(name)
        );
        
        // Test each potential creature name against the filename
        for (const creatureName of uniqueNames) {
            const nameWords = this._extractWords(creatureName);
            const nameMatch = this._matchCombinations(nameWords, fileNameLower);
            
            if (nameMatch.matched) {
                maxScore = Math.max(maxScore, nameMatch.score);
            }
            
            // Also test against file path for additional context
            const pathMatch = this._matchCombinations(nameWords, filePathLower);
            if (pathMatch.matched) {
                maxScore = Math.max(maxScore, pathMatch.score * 0.7);
            }
        }
        
        return maxScore;
    }

    /**
     * Calculate relevance score for a file against search terms or token data
     * This is the main scoring function that orchestrates all matching
     * @param {Object} fileInfo - File information object
     * @param {Array|string} searchTerms - Search terms (array for token matching, string for search)
     * @param {Object} tokenDocument - The token document (for context weighting)
     * @param {string} searchMode - 'token', 'search', or 'browse'
     * @returns {number} Relevance score (0.0 to 1.0)
     */
    static async _calculateRelevanceScore(fileInfo, searchTerms, tokenDocument = null, searchMode = 'search', cache = null) {
        const fileName = fileInfo.name || fileInfo.fullPath?.split('/').pop() || '';
        const fileNameLower = fileName.toLowerCase();
        const filePath = fileInfo.path || fileInfo.fullPath || '';
        const filePathLower = filePath.toLowerCase();
        
        // Get weighted settings - no hardcoded defaults, values must come from settings
        const weights = {
            actorName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightActorName') / 100,
            tokenName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightTokenName') / 100,
            representedActor: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor') / 100,
            creatureType: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureType') / 100,
            creatureSubtype: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype') / 100,
            equipment: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightEquipment') / 100,
            size: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightSize') / 100
        };
        
        let totalScore = 0;
        let foundMatch = false;
        
        // Normalize search terms
        let searchWords = [];
        if (Array.isArray(searchTerms)) {
            searchWords = searchTerms.filter(term => term && term.length >= 2).map(term => term.toLowerCase());
        } else if (typeof searchTerms === 'string') {
            searchWords = searchTerms.toLowerCase().split(/\s+/).filter(word => word.length >= 2);
        }
        
        if (searchMode !== 'token' && searchWords.length === 0) return 0;
        
        // Extract token data for weighted scoring
        let tokenData = {};
        if (tokenDocument && searchMode === 'token') {
            // Access TokenImageReplacement through cache parameter
            const { TokenImageReplacement } = await import('./manager-image-cache.js');
            tokenData = TokenImageReplacement._extractTokenData(tokenDocument);
        }
        
        // Calculate maximum possible score using weighted system
        let maxPossibleScore = 0;
        
        // Token data categories (only if token data exists) - use user-configured weights
        if (searchMode === 'token' && tokenData) {
            if (tokenDocument && tokenDocument.actor && tokenDocument.actor.name) maxPossibleScore += weights.actorName;
            if (tokenDocument && tokenDocument.name) maxPossibleScore += weights.tokenName;
            if (tokenData.representedActor) maxPossibleScore += weights.representedActor;
            if (tokenData.creatureType) maxPossibleScore += weights.creatureType;
            if (tokenData.creatureSubtype) maxPossibleScore += weights.creatureSubtype;
            if (tokenData.equipment && tokenData.equipment.length > 0) maxPossibleScore += weights.equipment;
            if (tokenData.size) maxPossibleScore += weights.size;
        }
        
        // Ensure maxPossibleScore is never zero
        if (maxPossibleScore === 0) {
            maxPossibleScore = 1.0;
        }
        
        
        // 1. TOKEN DATA WEIGHTED SCORING (for token matching mode)
        let tokenNameMatch = 0;
        if (searchMode === 'token' && tokenData) {
            // Actor Name (most important - clean creature name)
            if (tokenDocument && tokenDocument.actor && tokenDocument.actor.name) {
                const actorNameMatch = this._calculateTokenNameMatch(tokenDocument.actor.name, fileNameLower, filePathLower, fileInfo);
                if (actorNameMatch > 0) {
                    totalScore += actorNameMatch * weights.actorName;
                    foundMatch = true;
                    
                    // Debug: Log scoring for goblin files
                }
            }
            
            // Token Name (flexible matching for any naming convention)
            if (tokenDocument && tokenDocument.name) {
                tokenNameMatch = this._calculateTokenNameMatch(tokenDocument.name, fileNameLower, filePathLower, fileInfo);
                if (tokenNameMatch > 0) {
                    totalScore += tokenNameMatch * weights.tokenName;
                    foundMatch = true;
                    
                    // Debug: Log scoring for goblin files
                }
                
            }
            
            // Represented Actor (most important)
            if (tokenData.representedActor) {
                const actorMatch = this._calculateTokenDataMatch(tokenData.representedActor, fileNameLower, filePathLower, fileInfo);
                if (actorMatch > 0) {
                    totalScore += actorMatch * weights.representedActor;
                    foundMatch = true;
                    
                    // Debug: Log scoring for goblin files
                }
                
            }
            
            // Creature Type (Official D&D5e field) - match with file metadata
            if (tokenData.creatureType) {
                let typeMatch = 0;
                
                // Try to match with file's D&D5e type if available
                if (fileInfo.metadata?.dnd5eType) {
                    if (tokenData.creatureType === fileInfo.metadata.dnd5eType) {
                        typeMatch = 1.0; // Perfect match
                    } else {
                        typeMatch = 0; // No match
                    }
                } else {
                    // Fallback to string matching
                    typeMatch = this._calculateTokenDataMatch(tokenData.creatureType, fileNameLower, filePathLower, fileInfo);
                }
                
                if (typeMatch > 0) {
                    totalScore += typeMatch * weights.creatureType;
                    foundMatch = true;
                    
                }
            }
            
            // Creature Subtype (Official D&D5e field) - match with file metadata
            if (tokenData.creatureSubtype) {
                let subtypeMatch = 0;
                
                // Try to match with file's D&D5e subtype if available
                if (fileInfo.metadata?.dnd5eSubtype) {
                    if (tokenData.creatureSubtype === fileInfo.metadata.dnd5eSubtype) {
                        subtypeMatch = 1.0; // Perfect match
                    } else {
                        subtypeMatch = 0; // No match
                    }
                } else {
                    // Fallback to string matching
                    subtypeMatch = this._calculateTokenDataMatch(tokenData.creatureSubtype, fileNameLower, filePathLower, fileInfo);
                }
                
                if (subtypeMatch > 0) {
                    totalScore += subtypeMatch * weights.creatureSubtype;
                    foundMatch = true;
                }
            }
            
            // Equipment
            if (tokenData.equipment && tokenData.equipment.length > 0) {
                for (const equipment of tokenData.equipment) {
                    const equipmentMatch = this._calculateTokenDataMatch(equipment, fileNameLower, filePathLower, fileInfo);
                    if (equipmentMatch > 0) {
                        totalScore += equipmentMatch * weights.equipment;
                        foundMatch = true;
                        break; // Only count first equipment match
                    }
                }
            }
            
            
            // Background
            if (tokenData.background) {
                const backgroundMatch = this._calculateTokenDataMatch(tokenData.background, fileNameLower, filePathLower, fileInfo);
                if (backgroundMatch > 0) {
                    totalScore += backgroundMatch * weights.background;
                    foundMatch = true;
                }
            }
            
            // Size
            if (tokenData.size) {
                const sizeMatch = this._calculateTokenDataMatch(tokenData.size, fileNameLower, filePathLower, fileInfo);
                if (sizeMatch > 0) {
                    totalScore += sizeMatch * weights.size;
                    foundMatch = true;
                }
            }
            
        }
        
        // 2. SEARCH TERMS SCORING (only apply in search mode)
        if (searchMode === 'search') { // Only apply search terms scoring in search mode
            // Check if fuzzy search is enabled (only for manual search mode)
            const fuzzySearch = (searchMode === 'search') ? getSettingSafely(MODULE.ID, 'tokenImageReplacementFuzzySearch', false) : false;
            
            let searchTermsScore = 0;
            let searchTermsFound = 0;
            
            for (const word of searchWords) {
                let wordScore = 0;
                let wordFound = false;
                
                if (fuzzySearch) {
                    // FUZZY SEARCH: Individual word matching
                    // Filename matching
                    if (fileNameLower === word) {
                        wordScore = 1.0;
                        wordFound = true;
                    } else if (fileNameLower.replace(/\.[^.]*$/, '') === word) {
                        wordScore = 0.95;
                        wordFound = true;
                    } else if (fileNameLower.startsWith(word)) {
                        wordScore = 0.85;
                        wordFound = true;
                    } else if (fileNameLower.endsWith(word)) {
                        wordScore = 0.75;
                        wordFound = true;
                    } else if (fileNameLower.includes(word)) {
                        wordScore = 0.85; // Increased from 0.65 for better filename matching
                        wordFound = true;
                    } else {
                        // Partial word match
                        const fileNameWords = fileNameLower.split(/[\s\-_()]+/);
                        for (const fileNameWord of fileNameWords) {
                            if (fileNameWord.includes(word) || word.includes(fileNameWord)) {
                                wordScore = Math.max(wordScore, 0.45);
                                wordFound = true;
                            }
                        }
                    }
                } else {
                    // EXACT SEARCH: String matching with separator normalization
                    const normalizedWord = word.toLowerCase().replace(/[\-_()]+/g, ' ').trim();
                    const normalizedFileName = fileNameLower.replace(/[\-_()]+/g, ' ').trim();
                    
                    // Exact match
                    if (normalizedFileName === normalizedWord) {
                        wordScore = 1.0;
                        wordFound = true;
                    } else if (normalizedFileName.startsWith(normalizedWord)) {
                        wordScore = 0.9;
                        wordFound = true;
                    } else if (normalizedFileName.endsWith(normalizedWord)) {
                        wordScore = 0.8;
                        wordFound = true;
                    } else if (normalizedFileName.includes(normalizedWord)) {
                        wordScore = 0.7;
                        wordFound = true;
                    }
                    // No partial word matching for exact search
                }
                
                // Metadata matching
                if (fileInfo.metadata && fileInfo.metadata.tags) {
                    for (const tag of fileInfo.metadata.tags) {
                        const tagLower = tag.toLowerCase();
                        
                        if (fuzzySearch) {
                            // FUZZY SEARCH: Individual word matching in tags
                            if (tagLower === word) {
                                wordScore = Math.max(wordScore, 0.9);
                                wordFound = true;
                            } else if (tagLower.startsWith(word)) {
                                wordScore = Math.max(wordScore, 0.8);
                                wordFound = true;
                            } else if (tagLower.includes(word)) {
                                wordScore = Math.max(wordScore, 0.7);
                                wordFound = true;
                            }
                        } else {
                            // EXACT SEARCH: String matching in tags
                            const normalizedTag = tagLower.replace(/[\-_()]+/g, ' ').trim();
                            const normalizedWord = word.toLowerCase().replace(/[\-_()]+/g, ' ').trim();
                            
                            if (normalizedTag.includes(normalizedWord)) {
                                wordScore = Math.max(wordScore, 0.8);
                                wordFound = true;
                            }
                        }
                    }
                }
                
                if (wordFound) {
                    searchTermsScore = Math.max(searchTermsScore, wordScore); // Take best word score
                    searchTermsFound++;
                    foundMatch = true;
                }
            }
            
            // Add search terms score as a single category (max 1.0)
            if (searchTermsFound > 0) {
                totalScore += searchTermsScore * 1.0; // Fixed weight for search terms
            }
        }
        
        // Note: Multi-word bonus and basic creature priority bonus removed for simpler percentage-based scoring

        // Normalize score to 0.0-1.0 range
        const finalScore = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
        let clampedScore = Math.min(Math.max(finalScore, 0), 1);
        
        // Debug: Log final scoring for files containing "giant"
        if (fileNameLower.includes('giant')) {
        }
        
        // Skip files with empty names
        if (!fileName || fileName.trim() === '') {
            return 0; // Return 0 score for files with empty names
        }
        
        // Apply deprioritized words penalty
        const deprioritizedWords = game.settings.get(MODULE.ID, 'tokenImageReplacementDeprioritizedWords') || '';
        if (deprioritizedWords && deprioritizedWords.trim().length > 0) {
            const words = deprioritizedWords.toLowerCase().split(',').map(word => word.trim()).filter(word => word.length > 0);
            const fileNameAndPath = `${fileName} ${filePath}`.toLowerCase();
            
            for (const word of words) {
                if (fileNameAndPath.includes(word)) {
                    clampedScore *= 0.75;
                    break;
                }
            }
        }
        
        
        return clampedScore;
    }

    /**
     * Apply unified matching algorithm to files
     * @param {Array} filesToSearch - Array of file objects to search through
     * @param {Array|string} searchTerms - Search terms (array for token matching, string for search)
     * @param {Object} tokenDocument - The token document (for context weighting)
     * @param {string} searchMode - 'token', 'search', or 'browse'
     * @returns {Array} Array of matching files with scores
     */
    static async _applyUnifiedMatching(filesToSearch, searchTerms = null, tokenDocument = null, searchMode = 'browse', cache = null) {
        const results = [];
        
        // BROWSE MODE: No relevance scoring, just return all files
        if (searchMode === 'browse') {
            return filesToSearch.map(file => ({
                ...file,
                name: file.name || file.fullPath?.split('/').pop() || 'Unknown File',
                searchScore: 0.5, // Neutral score for browsing
                score: 0.5, // Also set score for consistency
                isCurrent: false,
                metadata: file.metadata || null
            }));
        }
        
        // RELEVANCE MODE: Use sophisticated scoring
        const threshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_applyUnifiedMatching) - Threshold: ${(threshold * 100).toFixed(1)}%, Files to search: ${filesToSearch.length}`, "", true, false);
                
        for (let i = 0; i < filesToSearch.length; i++) {
            const fileInfo = filesToSearch[i]; 
            const relevanceScore = await this._calculateRelevanceScore(fileInfo, searchTerms, tokenDocument, searchMode, cache);
            
            // Debug: Log first few scores to see what's happening (only for debugging)
            if (i < 3) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_applyUnifiedMatching) - File ${i+1}: "${fileInfo.name || fileInfo.fullPath?.split('/').pop()}" scored ${(relevanceScore * 100).toFixed(1)}%`, "", true, false);
            }
                        
            // Only include results above threshold
            if (relevanceScore >= threshold) {
                // Log token data breakdown ONLY for files that actually MATCH
                if (tokenDocument && searchMode === 'token') {
                    // Access TokenImageReplacement through cache parameter
                    const { TokenImageReplacement } = await import('./manager-image-cache.js');
                    const tokenData = TokenImageReplacement._extractTokenData(tokenDocument);
                    const weights = {
                        actorName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightActorName') / 100,
                        tokenName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightTokenName') / 100,
                        representedActor: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor') / 100,
                        creatureType: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureType') / 100,
                        creatureSubtype: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype') / 100,
                        equipment: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightEquipment') / 100,
                        size: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightSize') / 100
                    };
                    
                    // Removed excessive logging - was generating 30,000+ messages
                }
                
                results.push({
                    ...fileInfo,
                    name: fileInfo.name || fileInfo.fullPath?.split('/').pop() || 'Unknown File',
                    searchScore: relevanceScore,
                    score: relevanceScore, // Also set score for consistency
                    isCurrent: false,
                    metadata: fileInfo.metadata || null
                });
            }
        }
        
        // Sort by relevance score (highest first)
        results.sort((a, b) => b.searchScore - a.searchScore);
        
        
        return results;
    }
}
