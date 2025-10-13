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
}
