// ================================================================== 
// ===== TOKEN IMAGE REPLACEMENT CACHING SYSTEM =====================
// ================================================================== 

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { TokenImageReplacement } from './manager-image-cache.js';
import { ImageMatching } from './manager-image-matching.js';

/**
 * Token Image Replacement Window
 */
export class TokenImageReplacementWindow extends Application {
    constructor(options = {}) {
        super(options);
        this.selectedToken = null;
        this.matches = [];
        this.allMatches = []; // Store all matches for pagination
        this.currentPage = 0;
        this.resultsPerPage = 50;
        this.isLoadingMore = false;
        this.hasMoreResults = false;
        this.isSearching = false;
        this.scanProgress = 0;
        this.sortOrder = 'relevance'; // Default sort order
        this.currentFilter = 'all'; // Track current category filter
        this._cachedSearchTerms = null; // Cache for search terms
        this.scanTotal = 0;
        this.scanStatusText = "Scanning Token Images...";
        this.notificationIcon = null;
        this.notificationText = null;
        
        // Debouncing for token selection changes
        this._tokenSelectionDebounceTimer = null;
        this._lastProcessedTokenId = null;
        
        // Window state management - let Foundry handle it automatically
        this.windowState = {
            width: 700,
            height: 550,
            left: null,
            top: null
        };
        
        // Tag filtering system
        this.selectedTags = new Set(); // Track which tags are currently selected as filters
        this.tagSortMode = getSettingSafely(MODULE.ID, 'tokenImageReplacementTagSortMode', 'count'); // Current tag sort mode
    }

    /**
     * Get the default window options
     */
    static get defaultOptions() {
        // Try to load saved position/size
        let saved = {};
        try {
            // Check if game.settings is available and the setting exists
            if (game.settings && game.settings.get) {
                saved = game.settings.get(MODULE.ID, 'tokenImageReplacementWindowState') || {};
            }
        } catch (e) {
            saved = {};
        }
        
        // Use saved values or defaults
        const width = saved.width ?? 700;  // Default width
        const height = saved.height ?? 500; // Default height
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - height) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);
        
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "token-image-replacement",
            title: "Image Replacements",
            template: "modules/coffee-pub-blacksmith/templates/window-token-replacement.hbs",
            width,
            height,
            top,
            left,
            resizable: true,
            minimizable: true,
            maximizable: true,
            classes: ['token-replacement-window']
        });
    }

    /**
     * Override setPosition to save window position and size
     */
    setPosition(options={}) {
        const pos = super.setPosition(options);
        
        // Save position/size to settings
        if (this.rendered) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'tokenImageReplacementWindowState', { top, left, width, height });
        }
        return pos;
    }

    /**
     * Show the search spinner overlay
     */
    _showSearchSpinner() {
        const html = this.element;
        html.find('.tir-search-spinner').removeClass('hidden');
    }

    /**
     * Hide the search spinner overlay
     */
    _hideSearchSpinner() {
        const html = this.element;
        html.find('.tir-search-spinner').addClass('hidden');
    }



    /**
     * Apply category filter to search results
     */
    _getFilteredFiles() {
        // Safety check for cache
        if (!TokenImageReplacement.cache || !TokenImageReplacement.cache.files) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache not available in _getFilteredFiles`, "", true, false);
            return [];
        }
        
        // Get all files from cache
        const allFiles = Array.from(TokenImageReplacement.cache.files.values());
        
        // Debug: Show sample paths
        if (allFiles.length > 0) {
            const samplePaths = allFiles.slice(0, 3).map(f => f.path || f.fullPath || 'NO_PATH').join(', ');
        }
        
        // Apply category filter to get the subset of files to search
        if (this.currentFilter === 'all') {
            return allFiles;
        }
        
        // Cache search terms for "selected" filter to avoid repeated calls
        let processedTerms = null;
        if (this.currentFilter === 'selected' && this.selectedToken) {
            const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Selected filter - Search terms: ${searchTerms.join(', ')}`, "", true, false);
            processedTerms = searchTerms
                .filter(term => term && term.length >= 2)
                .map(term => term.toLowerCase());
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Selected filter - Processed terms: ${processedTerms.join(', ')}`, "", true, false);
        }
        
        const filteredFiles = allFiles.filter((file, index) => {
        
            const path = file.path || file.fullPath || '';
            const fileName = file.name || file.fileName || file.fullPath?.split('/').pop() || '';
            
            // Check if the file matches the current category filter
            switch (this.currentFilter) {
                case 'favorites':
                    // Only show files that have the FAVORITE tag
                    const fileInfo = this._getFileInfoFromCache(fileName);
                    const hasFavorite = fileInfo?.metadata?.tags?.includes('FAVORITE') || false;
                    return hasFavorite;
                case 'selected':
                    // Only show files that match the selected token's characteristics
                    if (!this.selectedToken || !processedTerms) return false;
                    
                    // Check if file matches any of the token's search terms
                    const fileText = `${path} ${fileName}`.toLowerCase();
                    return processedTerms.some(term => fileText.includes(term));
                default:
                    // For category filters (adventurers, adversaries, creatures, npcs, spirits), 
                    // check if file is in that top-level folder
                    // Path format can be either:
                    // - Relative: "Adventurers/!Core_Adventurers/..."
                    // - Full: "assets/images/tokens/FA_Tokens_Webp/Adventurers/..."
                    const pathParts = path.split('/');
                    
                    // Try both formats
                    let categoryFolder;
                    if (pathParts.length > 4 && pathParts[3] === 'FA_Tokens_Webp') {
                        // Full path format
                        categoryFolder = pathParts[4];
                    } else {
                        // Relative path format - first part is the category
                        categoryFolder = pathParts[0];
                    }
                    
                    return categoryFolder ? categoryFolder.toLowerCase() === this.currentFilter : false;
            }
        });
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Filtered to ${filteredFiles.length} files`, "", true, false);
        return filteredFiles;
    }

    _applyCategoryFilter(results) {
        if (this.currentFilter === 'all') {
            return results;
        }
        
        return results.filter(result => {
            const path = result.path || result.fullPath || '';
            
            // Debug removed to prevent console spam
            const fileName = result.name || '';
            
            // Check if the result matches the current category filter
            switch (this.currentFilter) {
                case 'favorites':
                    // Only show results that have the FAVORITE tag
                    return result.metadata?.tags?.includes('FAVORITE') || false;
                case 'selected':
                    // Only show results that match the selected token's characteristics
                    if (!this.selectedToken) return false;
                    
                    // Use cached search terms if available, otherwise get them
                    if (!this._cachedSearchTerms) {
                        const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
                        this._cachedSearchTerms = searchTerms
                            .filter(term => term && term.length >= 2)
                            .map(term => term.toLowerCase());
                    }
                    
                    // Check if result matches any of the token's search terms
                    const resultText = `${path} ${fileName}`.toLowerCase();
                    return this._cachedSearchTerms.some(term => resultText.includes(term));
                case 'adversaries':
                    return path.toLowerCase().includes('adversaries') || 
                           path.toLowerCase().includes('enemies') ||
                           fileName.toLowerCase().includes('adversary') ||
                           fileName.toLowerCase().includes('enemy');
                case 'creatures':
                    return path.toLowerCase().includes('creatures') || 
                           fileName.toLowerCase().includes('creature');
                case 'npcs':
                    return path.toLowerCase().includes('npcs') || 
                           path.toLowerCase().includes('npc') ||
                           fileName.toLowerCase().includes('npc');
                case 'monsters':
                    return path.toLowerCase().includes('monsters') || 
                           fileName.toLowerCase().includes('monster');
                case 'bosses':
                    return path.toLowerCase().includes('bosses') || 
                           path.toLowerCase().includes('boss') ||
                           fileName.toLowerCase().includes('boss');
                default:
                    return true;
            }
        });
    }

    /**
     * Phase 2: Comprehensive search in background for token selection
     */
    async _streamComprehensiveSearch(processedTerms) {
        const batchSize = 100;
        const fileEntries = Array.from(TokenImageReplacement.cache.files.entries());
        
        for (let i = 0; i < fileEntries.length; i += batchSize) {
            // Check if search was cancelled
            if (!this.isSearching) {
                break;
            }
            
            const batch = fileEntries.slice(i, i + batchSize);
            const batchResults = [];
            
            // Process this batch with comprehensive search
            for (const [fileName, fileInfo] of batch) {
                let score = 0;
                let foundMatch = false;
                
                // Search each term from the token
                for (const searchTerm of processedTerms) {
                    // Search filename
                    const fileNameLower = fileName.toLowerCase();
                    if (fileNameLower.includes(searchTerm)) {
                        if (fileNameLower === searchTerm) {
                            score += 100; // Exact filename match
                        } else if (fileNameLower.startsWith(searchTerm)) {
                            score += 80; // Filename starts with term
                        } else {
                            score += 60; // Filename contains term
                        }
                        foundMatch = true;
                    }
                    
                    // Search folder path
                    if (fileInfo.path) {
                        const pathLower = fileInfo.path.toLowerCase();
                        if (pathLower.includes(searchTerm)) {
                            if (pathLower.includes(`/${searchTerm}/`)) {
                                score += 70; // Folder name match
                            } else {
                                score += 40; // Path contains term
                            }
                            foundMatch = true;
                        }
                    }
                    
                    // Search by creature type
                    for (const [creatureType, files] of TokenImageReplacement.cache.creatureTypes.entries()) {
                        if (Array.isArray(files) && files.includes(fileName) && creatureType.toLowerCase().includes(searchTerm)) {
                            score += 90; // Creature type match
                            foundMatch = true;
                            break;
                        }
                    }
                    
                    // Search by folder categorization
                    for (const [folderPath, files] of TokenImageReplacement.cache.folders.entries()) {
                        if (Array.isArray(files) && files.includes(fileName)) {
                            const folderName = folderPath.split('/').pop().toLowerCase();
                            if (folderName.includes(searchTerm)) {
                                score += 50; // Folder name match
                                foundMatch = true;
                                break;
                            }
                        }
                    }
                }
                
                if (foundMatch) {
                    batchResults.push({
                        name: fileInfo.name || fileInfo.fullPath?.split('/').pop() || 'Unknown File',
                        path: fileInfo.path,
                        fullPath: fileInfo.fullPath,
                        searchScore: score,
                        isCurrent: false,
                        metadata: fileInfo.metadata || null
                    });
                }
            }
            
            // Add batch results to allMatches
            if (batchResults.length > 0) {
                this.allMatches.push(...batchResults);
                
                // Sort results based on current sort order
                this.allMatches = this._sortResults(this.allMatches);
                
                // Update display with new results
                this._applyPagination();
                this._updateResults();
            }
            
            // Small delay to allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Search complete
        this.isSearching = false;
        this._applyPagination();
        this._updateResults();
    }



    getData() {
        // Use only the static cache state as source of truth
        const systemScanning = TokenImageReplacement.cache.isScanning;
        
        // Calculate progress percentage
        let progressPercentage = 0;
        if (this.scanTotal > 0 && this.scanProgress > 0) {
            progressPercentage = Math.round((this.scanProgress / this.scanTotal) * 100);
        }
        
        // Update notification data dynamically based on current state
        this._updateNotificationData();
        
        return {
            selectedToken: this.selectedToken,
            matches: this.matches,
            isScanning: systemScanning,
            scanProgress: this.scanProgress,
            scanTotal: this.scanTotal,
            scanProgressPercentage: progressPercentage,
            scanStatusText: this.scanStatusText || "Scanning Token Images...",
            hasMatches: this.matches.length > 1, // More than just the current image
            hasAlternatives: this.matches.some(match => !match.isCurrent),
            notificationIcon: this.notificationIcon,
            notificationText: this.notificationText,
            hasNotification: !!(this.notificationIcon && this.notificationText),
            hasMoreResults: this.hasMoreResults,
            currentResults: this.matches.length,
            totalResults: this.allMatches.length,
            isLoadingMore: this.isLoadingMore,
            isSearching: this.isSearching,
            currentFilter: this.currentFilter,
            sortOrder: this.sortOrder,
            categoryStyle: getSettingSafely(MODULE.ID, 'tokenImageReplacementCategoryStyle', 'buttons'),
            categories: this._getCategories(),
            aggregatedTags: this._getAggregatedTags(),
            hasAggregatedTags: this._getAggregatedTags().length > 0,
            overallProgress: TokenImageReplacement.cache.overallProgress,
            totalSteps: TokenImageReplacement.cache.totalSteps,
            overallProgressPercentage: TokenImageReplacement.cache.totalSteps > 0 ? Math.round((TokenImageReplacement.cache.overallProgress / TokenImageReplacement.cache.totalSteps) * 100) : 0,
            currentStepName: TokenImageReplacement.cache.currentStepName,
            currentStepProgress: TokenImageReplacement.cache.currentStepProgress,
            currentStepTotal: TokenImageReplacement.cache.currentStepTotal,
            currentStepProgressPercentage: TokenImageReplacement.cache.currentStepTotal > 0 ? Math.round((TokenImageReplacement.cache.currentStepProgress / TokenImageReplacement.cache.currentStepTotal) * 100) : 0,
            currentPath: TokenImageReplacement.cache.currentPath,
            currentFileName: TokenImageReplacement.cache.currentFileName,
            cacheStatus: this._getCacheStatus(),
            updateDropped: getSettingSafely(MODULE.ID, 'tokenImageReplacementUpdateDropped', true),
            fuzzySearch: getSettingSafely(MODULE.ID, 'tokenImageReplacementFuzzySearch', false),
            tagSortMode: getSettingSafely(MODULE.ID, 'tokenImageReplacementTagSortMode', 'count')
        };
    }


    activateListeners(html) {
        super.activateListeners(html);


        // Thumbnail clicks
        html.find('.tir-thumbnail-item').on('click', this._onSelectImage.bind(this));
        html.find('.tir-thumbnail-item').on('contextmenu', this._onImageRightClick.bind(this));
        
        // Pause cache button
        html.find('.button-pause-cache').on('click', this._onPauseCache.bind(this));
        
        // Scan images button
        html.find('.button-scan-images').on('click', this._onScanImages.bind(this));
        
        // Delete cache button
        html.find('.button-delete-cache').on('click', this._onDeleteCache.bind(this));
        
        
        // Close button
        html.find('.close-btn').on('click', this._onClose.bind(this));

        // Search functionality
        html.find('.tir-search-input').on('input', this._onSearchInput.bind(this));
        
        // Sort order change
        html.find('.tir-select').on('change', this._onSortOrderChange.bind(this));
        html.find('.tir-search-input').on('keypress', (event) => {
            if (event.which === 13) { // Enter key
                event.preventDefault();
            }
        });
        
        // Infinite scroll
        html.find('.tir-thumbnails-grid').on('scroll', this._onScroll.bind(this));
        
        
        // Filter category click handlers
        html.find('#tir-filter-category-container').on('click', '.tir-filter-category', this._onCategoryFilterClick.bind(this));
        
        // Tag click handlers for new tags row
        html.find('#tir-search-tools-tag-container').on('click', '.tir-search-tools-tag', this._onTagClick.bind(this));
        
        // Clear search button
        html.find('.tir-clear-search-btn').on('click', this._onClearSearch.bind(this));
        
        // Filter toggle button
        html.find('.tir-filter-toggle-btn').on('click', this._onFilterToggle.bind(this));
        
        // Initialize filter toggle button state
        this._initializeFilterToggleButton();
        
        // Threshold slider
        html.find('.tir-rangeslider-input').on('input', this._onThresholdSliderChange.bind(this));
        
        // Set initial threshold value in label
        const currentThreshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        const thresholdPercentage = Math.round(currentThreshold * 100);
        html.find('.tir-threshold-value').text(`${thresholdPercentage}%`);
        
        // Update Dropped Tokens toggle
        html.find('#updateDropped').on('change', this._onUpdateDroppedToggle.bind(this));
        
        // Fuzzy Search toggle
        html.find('#fuzzySearch').on('change', this._onFuzzySearchToggle.bind(this));
        
        // Initialize threshold slider with current value
        this._initializeThresholdSlider();
    }


    async _findMatches() {
        try {
            // Reset results
            this.matches = [];
            this.allMatches = [];
            this.currentPage = 0;
            this.recommendedToken = null; // Reset recommended token

        // If we have a selected token, add original and current images as the first matches
        if (this.selectedToken) {
            // Add original image as the very first card
            const originalImage = TokenImageReplacementWindow._getOriginalImage(this.selectedToken.document);
            if (originalImage) {
                const originalImageCard = {
                    name: originalImage.name || originalImage.path?.split('/').pop() || 'Original Image',
                    fullPath: originalImage.path,
                    searchScore: 0, // Will be calculated normally
                    isOriginal: true,
                    metadata: null
                };
                this.allMatches.push(originalImageCard);
            }
            
            // Add current image as the second card
            const currentImageSrc = this.selectedToken.texture?.src || this.selectedToken.document.texture?.src || '';
            if (currentImageSrc) {
                const currentImage = {
                    name: currentImageSrc.split('/').pop() || 'Current Image',
                    fullPath: currentImageSrc,
                    searchScore: 0, // Will be calculated normally
                    isCurrent: true,
                    metadata: null
                };
                this.allMatches.push(currentImage);
            }
        }

        // Check cache status
        if (!TokenImageReplacement.cache) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache not initialized in _findMatches`, "", true, false);
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'Cache not initialized. Please wait for cache to load.';
            this._updateResults();
            return;
        }
        
        if (TokenImageReplacement.cache.isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (TokenImageReplacement.cache.isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'Images are being scanned to build the image cache and may impact performance.';
        } else if (TokenImageReplacement.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache check - files.size: ${TokenImageReplacement.cache.files.size}, cache exists: ${!!TokenImageReplacement.cache}`, "", true, false);
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'No Image Cache Found - Please scan for images.';
        } else {
            // Get filtered files based on current category filter
            const filteredFiles = this._getFilteredFiles();
            
            if (filteredFiles.length > 0) {
                // Apply tag filters if any are selected
                let tagFilteredFiles = filteredFiles;
                if (this.selectedTags.size > 0) {
                    tagFilteredFiles = filteredFiles.filter(file => {
                        const fileTags = this._getTagsForFile(file);
                        return Array.from(this.selectedTags).some(selectedTag => 
                            fileTags.includes(selectedTag)
                        );
                    });
                }
                
                // Determine matching mode and search terms
                let searchMode = 'browse';
                let searchTerms = null;
                let tokenDocument = null;
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Filter: ${this.currentFilter}, Has Token: ${!!this.selectedToken}, Search Term: "${this.searchTerm}"`, "", true, false);
                
                if (this.selectedToken) {
                    // If a token is selected, always use token-based matching regardless of filter
                    searchMode = 'token';
                    searchTerms = null; // Use token-based matching instead of search terms
                    tokenDocument = this.selectedToken.document;
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Using TOKEN MODE (token selected)`, "", true, false);
                } else if (this.currentFilter === 'selected' && !this.selectedToken) {
                    // SELECTED TAB but no token selected: Show no results
                    this.allMatches = [];
                    this._updateResults();
                    return;
                } else if (this.searchTerm && this.searchTerm.length >= 3) {
                    // SEARCH MODE: Use search term matching
                    searchMode = 'search';
                    searchTerms = this.searchTerm;
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Using SEARCH MODE`, "", true, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Using BROWSE MODE (no scores)`, "", true, false);
                }
                
                // Otherwise: BROWSE MODE (no search terms)
                
                // Apply unified matching
                // Apply threshold only on SELECTED tab
                const applyThreshold = this.currentFilter === 'selected';
                const matchedResults = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, searchTerms, tokenDocument, searchMode, TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, applyThreshold);
                
                // Filter out any results that are the current image to avoid duplicates
                const filteredResults = matchedResults.filter(result => !result.isCurrent);
                this.allMatches.push(...filteredResults);
                
                // Deduplicate results to prevent same file appearing multiple times
                this.allMatches = this._deduplicateResults(this.allMatches);
                
                
                // Calculate score for current image if it exists
                if (this.selectedToken && this.allMatches.length > 0) {
                    const currentImage = this.allMatches.find(match => match.isCurrent);
                    if (currentImage) {
                        const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
                        const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                            name: currentImage.name,
                            path: currentImage.fullPath,
                            metadata: currentImage.metadata
                        };
                        currentImage.searchScore = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', TokenImageReplacement.cache);
                        
                        // Note: Current image (selected token) is always shown regardless of threshold
                        // The threshold only affects other matching images, not the selected token itself
                    }
                }
                
                // Sort results based on current sort order
                this.allMatches = this._sortResults(this.allMatches);
                
                // Calculate recommended token for Selected tab
                if (this.currentFilter === 'selected' && this.selectedToken && this.allMatches.length > 1) {
                    this.recommendedToken = await this._calculateRecommendedToken();
                }
            }
        }
        
            // Apply pagination to show only first batch
            this._applyPagination();
            
            // Update results to show proper tags
            this._updateResults();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error in _findMatches: ${error.message}`, "", true, false);
            console.error('Token Image Replacement: Error in _findMatches:', error);
            // Show error state in UI
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = `Error loading matches: ${error.message}`;
            this._updateResults();
        }
    }

    async _onSelectImage(event) {
        const imagePath = event.currentTarget.dataset.imagePath;
        const imageName = event.currentTarget.dataset.imageName;
        const isQuickApply = event.target.closest('[data-quick-apply="true"]');
        const isCurrentImage = event.currentTarget.classList.contains('tir-current-image');
        const isOriginalImage = event.currentTarget.classList.contains('tir-original-image');
        
        if (!this.selectedToken || !imagePath) return;

        // Don't allow clicking on current image
        if (isCurrentImage) {
            return;
        }
        
        // Allow clicking on original image to apply it

        // Handle quick apply for recommended token
        if (isQuickApply) {
            event.stopPropagation();
            await this._applyImageToToken(imagePath, imageName);
            return;
        }

        await this._applyImageToToken(imagePath, imageName);
    }

    /**
     * Handle right-click on image to toggle favorite status
     */
    async _onImageRightClick(event) {
        event.preventDefault();
        
        const imagePath = event.currentTarget.dataset.imagePath;
        const imageName = event.currentTarget.dataset.imageName;
        
        if (!imagePath) return;

        try {
            // Get the file info from cache
            const fileInfo = this._getFileInfoFromCache(imageName);
            if (!fileInfo) {
                ui.notifications.warn(`Could not find file info for ${imageName}`);
                return;
            }

            // Ensure metadata and tags exist
            if (!fileInfo.metadata) {
                fileInfo.metadata = {};
            }
            if (!fileInfo.metadata.tags) {
                fileInfo.metadata.tags = [];
            }

            // Toggle favorite status
            const isFavorited = fileInfo.metadata.tags.includes('FAVORITE');
            if (isFavorited) {
                // Remove favorite
                fileInfo.metadata.tags = fileInfo.metadata.tags.filter(tag => tag !== 'FAVORITE');
                ui.notifications.info(`Removed ${imageName} from favorites`);
            } else {
                // Add favorite
                fileInfo.metadata.tags.push('FAVORITE');
                ui.notifications.info(`Added ${imageName} to favorites`);
            }

            // Save the updated cache
            await TokenImageReplacement._saveCacheToStorage(true); // Incremental save

            // Refresh the current view if we're on favorites
            if (this.currentFilter === 'favorites') {
                this._showSearchSpinner();
                await this._findMatches();
                this._hideSearchSpinner();
            } else {
                // Just update the current view to show the heart icon
                this._updateResults();
            }

        } catch (error) {
            ui.notifications.error(`Failed to toggle favorite: ${error.message}`);
        }
    }

    /**
     * Apply an image to the selected token
     */
    async _applyImageToToken(imagePath, imageName) {
        try {
            // Store the original image before applying the new one (only if it doesn't already exist)
            const existingOriginal = TokenImageReplacementWindow._getOriginalImage(this.selectedToken.document);
            if (!existingOriginal) {
                await TokenImageReplacementWindow._storeOriginalImage(this.selectedToken.document);
            }
            
            // Update the token
            await this.selectedToken.document.update({
                'texture.src': imagePath
            });
            
            // Show success notification
            ui.notifications.info(`Applied image: ${imageName}`);
            
            // Close the window
            this.close();
            
        } catch (error) {
            ui.notifications.error(`Failed to apply image: ${error.message}`);
        }
    }

    async _onScanImages() {
        this.scanProgress = 0;
        this.scanTotal = 0;
        this.render();

        try {
            await TokenImageReplacement.scanForImages();
            
            // Check if we have completion data to show
            if (TokenImageReplacement.cache.justCompleted && TokenImageReplacement.cache.completionData) {
                const data = TokenImageReplacement.cache.completionData;
                let message = `Token Image Replacement: Scan completed! Found ${data.totalFiles} files across ${data.totalFolders} folders in ${data.timeString}`;
                if (data.ignoredFiles > 0) {
                    message += ` (${data.ignoredFiles} files ignored by filter)`;
                }
                ui.notifications.info(message);
            } else {
                ui.notifications.info("Image scan completed");
            }
        } catch (error) {
            ui.notifications.error(`Image scan failed: ${error.message}`);
        }
    }

    async _onPauseCache() {
        const paused = TokenImageReplacement.pauseCache();
        if (paused) {
            this.render();
            ui.notifications.info("Cache scanning paused");
        } else {
            ui.notifications.warn("No active scan to pause");
        }
    }

    async _onDeleteCache() {
        // Show confirmation dialog
        const confirmed = await Dialog.confirm({
            title: "Delete Cache",
            content: "<p>Are you sure you want to delete the entire token image cache?</p><p><strong>This action cannot be undone.</strong></p>",
            yes: () => true,
            no: () => false,
            defaultYes: false
        });

        if (confirmed) {
            try {
                await TokenImageReplacement.deleteCache();
                ui.notifications.info("Cache deleted successfully");
                this.render();
            } catch (error) {
                ui.notifications.error(`Failed to delete cache: ${error.message}`);
            }
        }
    }

    _onPauseCache() {
        const paused = TokenImageReplacement.pauseCache();
        if (paused) {
            ui.notifications.info("Cache scanning paused. You can resume by refreshing the cache.");
            this.render();
        } else {
            ui.notifications.warn("No cache scanning in progress to pause.");
        }
    }


    _onClose() {
        this.close();
    }


    // Method to update scan progress
    updateScanProgress(current, total, statusText = null) {
        this.scanProgress = current;
        this.scanTotal = total;
        if (statusText) {
            this.scanStatusText = statusText;
        }
        this.render();
    }

    // Method to complete scan
    completeScan() {
        this.scanProgress = 0;
        this.scanTotal = 0;
        this.scanStatusText = "Scanning Token Images...";
        this.render();
    }

    // Show completion notification in the window
    showCompletionNotification(totalFiles, totalFolders, timeString) {
        const $element = this.element;
        if (!$element) return;
        
        // Update the notification area with completion info
        this.notificationIcon = 'fas fa-check-circle';
        this.notificationText = `Scan Complete! Found ${totalFiles} files across ${totalFolders} folders in ${timeString}`;
        
        // Update the notification display
        const $notification = $element.find('.tir-notification');
        if ($notification.length > 0) {
            $notification.html(`
                <i class="${this.notificationIcon}"></i>
                <span>${this.notificationText}</span>
            `).show();
        }
    }

    // Show error notification in the window
    showErrorNotification(errorMessage) {
        const $element = this.element;
        if (!$element) return;
        
        // Update the notification area with error info
        this.notificationIcon = 'fas fa-exclamation-triangle';
        this.notificationText = `Scan Failed: ${errorMessage}`;
        
        // Update the notification display
        const $notification = $element.find('.tir-notification');
        if ($notification.length > 0) {
            $notification.html(`
                <i class="${this.notificationIcon}"></i>
                <span>${this.notificationText}</span>
            `).show();
        }
    }

    // Hide progress bars after completion
    hideProgressBars() {
        const $element = this.element;
        if (!$element) return;
        
        // Hide the progress bars
        $element.find('.tir-scan-progress').hide();
        
        // Clear the notification after a delay
        setTimeout(() => {
            const $notification = $element.find('.tir-notification');
            if ($notification.length > 0) {
                $notification.fadeOut(500);
            }
        }, 2000); // Hide notification after 2 more seconds
    }

    async render(force = false, options = {}) {
        const result = await super.render(force, options);
        
        // Register token selection hook only once when first rendered
        // Use a small delay to ensure the DOM is ready
        if (!this._tokenHookRegistered) {
            setTimeout(async () => {
                if (!this._tokenHookRegistered) {
                    postConsoleAndNotification(MODULE.NAME, 'Token Image Replacement: Registering controlToken hook', 'token-image-replacement-selection', true, false);
                    this._tokenHookId = HookManager.registerHook({
                        name: 'controlToken',
                        description: 'Token Image Replacement: Handle token selection changes',
                        context: 'token-image-replacement-selection',
                        priority: 3,
                        callback: async (token, controlled) => {
                            await this._onTokenSelectionChange(token, controlled);
                        }
                    });
                    this._tokenHookRegistered = true;
                    
                    // Check for currently selected token after hook registration
                    await this._checkForSelectedToken();
                }
            }, 100);
        }
        
        return result;
    }

    async close(options = {}) {
        // Cancel any ongoing search
        this.isSearching = false;
        
        // Clear search timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }
        
        // Remove token selection hook
        if (this._tokenHookRegistered && this._tokenHookId) {
            HookManager.removeCallback(this._tokenHookId);
            this._tokenHookRegistered = false;
            this._tokenHookId = null;
        }
        
        // Clear debounce timer
        if (this._tokenSelectionDebounceTimer) {
            clearTimeout(this._tokenSelectionDebounceTimer);
            this._tokenSelectionDebounceTimer = null;
        }
        
        // MEMORY CLEANUP: Clear all arrays and references
        this.matches = [];
        this.allMatches = [];
        this.selectedToken = null;
        this._cachedSearchTerms = null;
        this.selectedTags.clear();
        this._lastProcessedTokenId = null;
        
        // MEMORY CLEANUP: Remove all image elements from DOM to free memory
        const $element = this.element;
        if ($element) {
            // Remove all img tags to release decoded image data
            $element.find('img').each(function() {
                this.src = ''; // Clear src to free memory
                $(this).remove();
            });
            
            // Remove all event listeners
            $element.find('.tir-thumbnail-item').off();
            $element.find('.tir-search-input').off();
            $element.find('.tir-clear-search').off();
        }
        
        postConsoleAndNotification(MODULE.NAME, 'Token Image Replacement: Window closed, memory cleaned up', '', true, false);
        
        return super.close(options);
    }

    async _onTokenSelectionChange(token, controlled) {
        // Only proceed if it's a GM (token image replacement is a GM tool)
        if (!game.user.isGM) {
            return;
        }
        
        // Clear any existing debounce timer
        if (this._tokenSelectionDebounceTimer) {
            clearTimeout(this._tokenSelectionDebounceTimer);
        }
        
        // Debounce token selection changes to prevent multiple rapid-fire executions
        this._tokenSelectionDebounceTimer = setTimeout(async () => {
            await this._handleTokenSwitch();
        }, 100); // 100ms debounce
    }

    /**
     * Handle token switching when window is already open
     * Preserves current tab and search criteria
     */
    async _handleTokenSwitch() {
        try {
            // Get the newly selected token
            const selectedTokens = canvas?.tokens?.controlled || [];
            const newTokenId = selectedTokens.length > 0 ? selectedTokens[0].id : null;
            
            // Prevent processing the same token multiple times
            if (newTokenId === this._lastProcessedTokenId) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping duplicate token selection for ${newTokenId}`, "", true, false);
                return;
            }
            
            this._lastProcessedTokenId = newTokenId;
            
            if (selectedTokens.length > 0) {
                this.selectedToken = selectedTokens[0];
                
                // When a token is selected, switch to "selected" tab and update results
                this.currentFilter = 'selected';
                this._cachedSearchTerms = null; // Clear cache for new token
                this._showSearchSpinner();
                await this._findMatches();
                this._hideSearchSpinner();
            } else {
                this.selectedToken = null;
                // When no token is selected, switch to "all" tab and update results
                this.currentFilter = 'all';
                this._showSearchSpinner();
                await this._findMatches();
                this._hideSearchSpinner();
            }
            
            // Update the header with new token info and active tab without full re-render
            // The DOM is already updated by _findMatches() -> _updateResults()
            // We just need to update the tab states and token info in the header
            this._updateTabStates();
            this._updateTokenInfo();
            
        } catch (error) {
            // Always hide the spinner, even if there's an error
            this._hideSearchSpinner();
            
            // Log the error for debugging
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error during token selection: ${error.message}`, "", false, false);
        }
    }

    /**
     * Update tab states without full re-render
     */
    _updateTabStates() {
        const $element = this.element;
        if (!$element) return;
        
        // Update active tab states
        $element.find('.tir-filter-category').removeClass('active');
        $element.find(`[data-category="${this.currentFilter}"]`).addClass('active');
    }

    /**
     * Update token info in header without full re-render
     */
    _updateTokenInfo() {
        const $element = this.element;
        if (!$element) return;
        
        // Update token name and image in header
        if (this.selectedToken) {
            const tokenName = this.selectedToken.name || 'Unknown Token';
            const tokenImage = this.selectedToken.texture?.src || this.selectedToken.document.texture?.src || '';
            
            // Update token name
            $element.find('.tir-main-title').text(tokenName);
            
            // Update token image - ensure image element exists and is visible
            const $headerIcon = $element.find('.tir-header-icon');
            let $tokenImage = $headerIcon.find('img');
            
            if ($tokenImage.length === 0) {
                // Create image element if it doesn't exist
                $tokenImage = $('<img>').appendTo($headerIcon);
            }
            
            // Hide the icon and show the image
            $headerIcon.find('i').hide();
            $tokenImage.attr('src', tokenImage).show();
            
            // Update subtitle with actor info
            const actorName = this.selectedToken.actor?.name || '';
            const actorType = this.selectedToken.actor?.type || '';
            const actorSubtype = this.selectedToken.actor?.system?.details?.type?.subtype || '';
            const actorValue = this.selectedToken.actor?.system?.details?.type?.value || '';
            
            let subtitle = '';
            if (actorName) subtitle += actorName;
            if (actorType) subtitle += (subtitle ? '  •  ' : '') + actorType;
            if (actorValue) subtitle += (subtitle ? '  •  ' : '') + actorValue;
            if (actorSubtype) subtitle += (subtitle ? '  •  ' : '') + actorSubtype;
            
            $element.find('.tir-subtitle').text(subtitle);
        } else {
            // Clear token info when no token selected
            $element.find('.tir-main-title').text('No Token Selected');
            $element.find('.tir-subtitle').text('Select a token on the canvas');
            
            // Hide the image and show the icon
            const $headerIcon = $element.find('.tir-header-icon');
            $headerIcon.find('img').hide();
            $headerIcon.find('i').show();
        }
    }

    /**
     * Check for currently selected token when window opens
     */
    async _checkForSelectedToken() {
        try {
            
            // Ensure cache is initialized
            if (!TokenImageReplacement.cache || TokenImageReplacement.cache.files.size === 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache not initialized, initializing...`, "", true, false);
                await TokenImageReplacement._initializeCache();
            }
            
            // Check if there are any controlled tokens
            const controlledTokens = canvas.tokens.controlled;
            if (controlledTokens.length > 0) {
                const selectedToken = controlledTokens[0];
                
                // Store the selected token and set filter
                this.selectedToken = selectedToken;
                this.currentFilter = 'selected';
                this._cachedSearchTerms = null; // Clear cache for new token
                this._showSearchSpinner();
                await this._findMatches();
                this._hideSearchSpinner();
            } else {
                // Reset to "all" filter when no token selected
                this.selectedToken = null;
                this.currentFilter = 'all';
                this._cachedSearchTerms = null; // Clear cache
                this._showSearchSpinner();
                await this._findMatches();
                this._hideSearchSpinner();
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error during token check: ${error.message}`, "", true, false);
            console.error('Token Image Replacement: Error during token check:', error);
        }
    }

    // Method to refresh matches when cache becomes ready
    async refreshMatches() {
        if (this.selectedToken) {
        this._showSearchSpinner();
            await this._findMatches();
        this._hideSearchSpinner();
        }
    }

    async _onSearchInput(event) {
        const searchTerm = $(event.currentTarget).val().trim();
        this.searchTerm = searchTerm; // Store the search term
        
        // Clear any existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Cancel any ongoing search
        this.isSearching = false;
        
        // If search term is too short, show all results (with tag filters applied)
        if (searchTerm.length < 3) {
            this._showSearchSpinner();
            await this._findMatches();
            this._hideSearchSpinner();
            return;
        }

        // Debounce search to avoid too many calls
        this.searchTimeout = setTimeout(async () => {
            this._showSearchSpinner();
            await this._performSearch(searchTerm);
            this._hideSearchSpinner();
        }, 300);
    }

    async _onClearSearch(event) {
        // Clear the search input
        $(event.currentTarget).closest('.tir-search-container').find('.tir-search-input').val('');
        
        // Clear any pending search timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Restore automatic matches
        await this._findMatches();
    }

    async _performSearch(searchTerm) {
        if (TokenImageReplacement.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache empty, cannot perform search`, "", true, false);
            this.matches = [];
            this.allMatches = [];
            this.currentPage = 0;
        this.render();
            return;
        }

        // Clear previous results
        this.allMatches = [];
        this.currentPage = 0;
        this.isSearching = true;
        
        // Always add current token image first if it exists
        if (this.selectedToken) {
            const currentImageSrc = this.selectedToken.texture?.src || this.selectedToken.document.texture?.src || '';
            if (currentImageSrc) {
                const currentImage = {
                    name: currentImageSrc.split('/').pop() || 'Current Image',
                    fullPath: currentImageSrc,
                    searchScore: 0, // Will be calculated normally
                    isCurrent: true,
                    metadata: null
                };
                this.allMatches.push(currentImage);
            }
        }
        
        // Step 1: Get files filtered by category (Selected, Creatures, etc.)
        const categoryFiles = this._getFilteredFiles();
        
        // Step 2: Apply tag filters to category files
        let tagFilteredFiles = categoryFiles;
        if (this.selectedTags.size > 0) {
            tagFilteredFiles = categoryFiles.filter(file => {
                const fileTags = this._getTagsForFile(file);
                return Array.from(this.selectedTags).some(selectedTag => 
                    fileTags.includes(selectedTag)
                );
            });
        }
        
        // Step 3: Apply unified matching with search terms
        // Search mode never applies threshold
        const searchResults = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, searchTerm, null, 'search', TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, false);
        
        // Filter out any results that are the current image to avoid duplicates
        const filteredResults = searchResults.filter(result => !result.isCurrent);
        
        // In exact search mode (fuzzy search OFF), filter out 0% matches
        const fuzzySearch = getSettingSafely(MODULE.ID, 'tokenImageReplacementFuzzySearch', false);
        if (!fuzzySearch) {
            // Exact search mode: only show files that actually match the search term
            const exactMatches = filteredResults.filter(result => 
                result.searchScore !== null && result.searchScore > 0
            );
            this.allMatches.push(...exactMatches);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Exact search found ${exactMatches.length} matches out of ${filteredResults.length} files`, "", true, false);
        } else {
            // Fuzzy search mode: show all results (including 0% matches)
            this.allMatches.push(...filteredResults);
        }
        
        // Deduplicate results to prevent same file appearing multiple times
        this.allMatches = this._deduplicateResults(this.allMatches);
        
        // Step 4: Calculate score for current image if it exists
        if (this.selectedToken && this.allMatches.length > 0) {
            const currentImage = this.allMatches.find(match => match.isCurrent);
            if (currentImage) {
                const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
                const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                    name: currentImage.name,
                    path: currentImage.fullPath,
                    metadata: currentImage.metadata
                };
                currentImage.searchScore = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', TokenImageReplacement.cache);
                
                // Note: Current image (selected token) is always shown regardless of threshold
                // The threshold only affects other matching images, not the selected token itself
            }
        }
        
        // Sort results based on current sort order
        this.allMatches = this._sortResults(this.allMatches);
        
        // Show results immediately
        this._applyPagination();
        this._updateResults();
        
        // PHASE 2: Start comprehensive search in background
        this._streamSearchResults(searchTerm);
    }

    async _streamSearchResults(searchTerm) {
        const searchTermLower = searchTerm.toLowerCase();
        const batchSize = 100; // Process files in batches
        let processedCount = 0;
        
        // Get filtered files based on current category filter
        const filteredFiles = this._getFilteredFiles();
        const totalFiles = filteredFiles.length;
        
        // Split search term into individual words
        const searchWords = searchTermLower.split(/\s+/).filter(word => word.length > 0);
        
        // Process files in batches to avoid blocking the UI
        const fileEntries = filteredFiles;
        
        for (let i = 0; i < fileEntries.length; i += batchSize) {
            // Check if search was cancelled (new search started)
            if (!this.isSearching) {
                break;
            }
            
            const batch = fileEntries.slice(i, i + batchSize);
            const batchResults = [];
            
            // Process this batch
            for (const fileInfo of batch) {
                const fileName = fileInfo.name || '';
                let score = 0;
                let foundMatch = false;
                let matchedWords = 0;
                
                // Search filename with multi-word support
                const fileNameLower = fileName.toLowerCase();
                for (const word of searchWords) {
                    if (fileNameLower.includes(word)) {
                        matchedWords++;
                        if (fileNameLower === word) {
                            score += 100; // Exact filename match
                        } else if (fileNameLower.startsWith(word)) {
                            score += 80; // Filename starts with term
                        } else {
                            score += 60; // Filename contains term
                        }
                        foundMatch = true;
                    }
                }
                
                // Bonus for matching all words
                if (matchedWords === searchWords.length && searchWords.length > 1) {
                    score += 20; // Multi-word bonus
                }
                
                // Search folder path with multi-word support
                if (fileInfo.path) {
                    const pathLower = fileInfo.path.toLowerCase();
                    for (const word of searchWords) {
                        if (pathLower.includes(word)) {
                            if (pathLower.includes(`/${word}/`)) {
                                score += 70; // Folder name match
                            } else {
                                score += 40; // Path contains term
                            }
                            foundMatch = true;
                        }
                    }
                }
                
                // Search by creature type with multi-word support
                for (const [creatureType, files] of TokenImageReplacement.cache.creatureTypes.entries()) {
                    if (Array.isArray(files) && files.includes(fileName)) {
                        const creatureTypeLower = creatureType.toLowerCase();
                        for (const word of searchWords) {
                            if (creatureTypeLower.includes(word)) {
                                score += 90; // Creature type match
                                foundMatch = true;
                                break;
                            }
                        }
                        if (foundMatch) break;
                    }
                }
                
                // Search by folder categorization with multi-word support
                for (const [folderPath, files] of TokenImageReplacement.cache.folders.entries()) {
                    if (Array.isArray(files) && files.includes(fileName)) {
                        const folderName = folderPath.split('/').pop().toLowerCase();
                        for (const word of searchWords) {
                            if (folderName.includes(word)) {
                                score += 50; // Folder name match
                                foundMatch = true;
                                break;
                            }
                        }
                        if (foundMatch) break;
                    }
                }
                
                // Search file extension with multi-word support
                const extension = fileName ? fileName.split('.').pop().toLowerCase() : '';
                for (const word of searchWords) {
                    if (extension.includes(word)) {
                        score += 30; // Extension match
                        foundMatch = true;
                        break;
                    }
                }
                
                // Search metadata tags with multi-word support
                if (fileInfo.metadata && fileInfo.metadata.tags) {
                    for (const tag of fileInfo.metadata.tags) {
                        const tagLower = tag.toLowerCase();
                        for (const word of searchWords) {
                            if (tagLower.includes(word)) {
                                if (tagLower === word) {
                                    score += 95; // Exact metadata tag match
                                } else if (tagLower.startsWith(word)) {
                                    score += 85; // Metadata tag starts with term
                                } else {
                                    score += 75; // Metadata tag contains term
                                }
                                foundMatch = true;
                            }
                        }
                    }
                }
                
                // Search specific metadata fields with multi-word support
                if (fileInfo.metadata) {
                    const metadataFields = [
                        'creatureType', 'subtype', 'specificType', 'weapon', 'armor', 
                        'equipment', 'pose', 'action', 'direction', 'quality', 'class', 'profession'
                    ];
                    
                    for (const field of metadataFields) {
                        const value = fileInfo.metadata[field];
                        if (value && typeof value === 'string') {
                            const valueLower = value.toLowerCase();
                            for (const word of searchWords) {
                                if (valueLower.includes(word)) {
                                    if (valueLower === word) {
                                        score += 90; // Exact metadata field match
                                    } else if (valueLower.startsWith(word)) {
                                        score += 80; // Metadata field starts with term
                                    } else {
                                        score += 70; // Metadata field contains term
                                    }
                                    foundMatch = true;
                                }
                            }
                        }
                    }
                }
                
                // Apply token context weighting if a token is selected
                if (foundMatch && this.selectedToken) {
                    const contextBonus = this._calculateTokenContextBonus(fileInfo, searchTermLower);
                    score += contextBonus;
                }
                
                if (foundMatch) {
                    batchResults.push({
                        name: fileInfo.name || fileInfo.fullPath?.split('/').pop() || 'Unknown File',
                        path: fileInfo.path,
                        fullPath: fileInfo.fullPath,
                        searchScore: score,
                        isCurrent: false,
                        metadata: fileInfo.metadata || null
                    });
                }
        }
        
            // Add batch results to allMatches
            if (batchResults.length > 0) {
                const filteredBatchResults = this._applyCategoryFilter(batchResults);
                
                // MEMORY FIX: Check for duplicates before adding to prevent memory leak
                const existingPaths = new Set(this.allMatches.map(m => m.fullPath));
                const newResults = filteredBatchResults.filter(r => !existingPaths.has(r.fullPath));
                
                // MEMORY FIX: Limit total results to prevent unbounded growth
                const MAX_RESULTS = 2000; // Reasonable limit for performance
                if (this.allMatches.length < MAX_RESULTS) {
                    const remainingSpace = MAX_RESULTS - this.allMatches.length;
                    const resultsToAdd = newResults.slice(0, remainingSpace);
                    
                    this.allMatches.push(...resultsToAdd);
                    
                    // Deduplicate results to prevent same file appearing multiple times
                    this.allMatches = this._deduplicateResults(this.allMatches);
                    
                    // Sort results based on current sort order
                    this.allMatches = this._sortResults(this.allMatches);
                    
                    // Update display with new results
                    this._applyPagination();
                    this._updateResults();
                } else {
                    // Stop searching if we've hit the limit
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Result limit reached (${MAX_RESULTS}), stopping search`, '', true, false);
                    break;
                }
            }
            
            processedCount += batch.length;
            
            // Small delay to allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Search complete
        this.isSearching = false;
        this._applyPagination();
        this._updateResults();
    }

    _updateResults() {
        // Update the results grid and the results summary
        const resultsHtml = this._renderResults();
        const $element = this.element;
        if ($element) {
            const $grid = $element.find('.tir-thumbnails-grid');
            $grid.html(resultsHtml);
            
            // Re-attach event handlers for the new thumbnail items
            $element.find('.tir-thumbnail-item').off('click').on('click', this._onSelectImage.bind(this));
            $element.find('.tir-thumbnail-item').off('contextmenu').on('contextmenu', this._onImageRightClick.bind(this));
            
            // Update the results summary with current counts
            const $countElement = $element.find('#tir-results-details-count');
            $countElement.html(`<i class="fas fa-images"></i>${this.matches.length} of ${this.allMatches.length} Showing`);
            
            
            // Update the status text based on search state
            if (this.isSearching) {
                $element.find('#tir-results-details-status').html('<i class="fas fa-sync-alt fa-spin"></i>Searching for more...');
            } else {
                $element.find('#tir-results-details-status').html('<i class="fas fa-check"></i>Complete');
            }
            
            // Update aggregated tags
            this._updateTagContainer();
            
            // Note: Do not call this.render() here as it overwrites the DOM updates
        }
    }

    _renderResults() {
        
        // ***** BUILD: NO TOKEN SELECTED *****
        if (!this.selectedToken) {
            let html = `
                <!-- Show "No TOKEN" message -->
                <div class="tir-thumbnail-item tir-no-token">
                    <!-- Image -->
                    <div class="tir-no-token-icon">
                        <i class="fas fa-user-group-crown"></i>
                    </div>
                    <!-- Description -->
                    <div class="tir-no-matches-text">
                        <p>Select a token to replace its image.</p>
                        <p><span class="tir-thumbnail-tag">NO TOKEN</span></p>
                    </div>
                </div>
            `;
            
            // Check if we're in search mode with no results
            const isSearchMode = this.searchTerm && this.searchTerm.length >= 3;
            
            if (isSearchMode && this.matches.length === 0) {
                // Show "No Results" message for search with no token selected
                html += `
                    <div class="tir-thumbnail-item tir-no-matches">
                        <div class="tir-no-matches-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <div class="tir-no-matches-text">
                            <p>No Results</p>
                            <p><span class="tir-thumbnail-tag">NO RESULTS</span></p>
                        </div>
                    </div>
                `;
            } else if (this.matches.length > 0) {
                // Show the results for browsing
                html += this.matches.map(match => {
                    const tags = this._getTagsForMatch(match);
                    const tooltipText = this._generateTooltipText(match, false);
                    const scorePercentage = match.searchScore ? Math.round(match.searchScore * 100) : 0;
                    const isBrowseMode = match.isBrowseMode || false;
                    return `
                        <div class="tir-thumbnail-item ${match.isCurrent ? 'tir-current-image' : ''} ${match.isOriginal ? 'tir-original-image' : ''} ${match.metadata?.tags?.includes('FAVORITE') ? 'tir-favorite-image' : ''}" data-image-path="${match.fullPath}" data-tooltip="${tooltipText}" data-image-name="${match.name}">
                            <div class="tir-thumbnail-image">
                                <img src="${match.fullPath}" alt="${match.name}" loading="lazy">
                                ${match.isCurrent ? `
                                    <div class="tir-thumbnail-current-badge">
                                        <i class="fas fa-check"></i>
                                    </div>
                                ` : `
                                    <div class="tir-thumbnail-overlay">
                                        <i class="fas fa-check"></i>
                                        <span class="tir-overlay-text">Apply to Token</span>
                                    </div>
                                `}
                                ${match.metadata?.tags?.includes('FAVORITE') ? `
                                    <div class="tir-thumbnail-favorite-badge">
                                        <i class="fas fa-heart"></i>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="tir-thumbnail-name">${match.name}</div>
                            <div class="tir-thumbnail-score">
                                ${isBrowseMode ? `
                                    <div class="tir-score-text">Browse</div>
                                    <div class="tir-score-bar">
                                        <div class="tir-score-fill" style="width: 0%"></div>
                                    </div>
                                ` : `
                                    <div class="tir-score-text">${scorePercentage}% Match</div>
                                    <div class="tir-score-bar">
                                        <div class="tir-score-fill" style="width: ${scorePercentage}%"></div>
                                    </div>
                                `}
                            </div>
                            <div class="tir-thumbnail-tagset">
                                ${tags.map(tag => `<span class="tir-thumbnail-tag">${tag}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            return html;
        }
        // ***** BUILD: NO MATCHING RESULTS *****
        if (this.matches.length === 0) {
            // Check if we're in search mode with no results
            const isSearchMode = this.searchTerm && this.searchTerm.length >= 3;
            const fuzzySearch = getSettingSafely(MODULE.ID, 'tokenImageReplacementFuzzySearch', false);
            
            let message = "No alternative images found for this token";
            let tag = "NO MATCHES";
            
            if (isSearchMode) {
                message = "No Results";
                tag = "NO RESULTS";
            }
            
            return `
                <!-- Show "No Matches" message -->
                <div class="tir-thumbnail-item tir-no-matches">
                    <!-- Image -->
                    <div class="tir-no-matches-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <!-- Description -->
                    <div class="tir-no-matches-text">
                        <p>${message}</p>
                        <p><span class="tir-thumbnail-tag">${tag}</span></p>
                    </div>
                </div>
            `;
        }
        // ***** BUILD: MATCHING RESULT *****
        return this.matches.map(match => {
            const tags = this._getTagsForMatch(match);
            const isRecommended = this.recommendedToken && match.fullPath === this.recommendedToken.fullPath;
            const recommendedClass = isRecommended ? 'tir-recommended-image' : '';
            
            
            const tooltipText = this._generateTooltipText(match, isRecommended);
            const scorePercentage = match.searchScore ? Math.round(match.searchScore * 100) : 0;
            const isBrowseMode = match.isBrowseMode || false;
            
            return `
                <div class="tir-thumbnail-item ${match.isCurrent ? 'tir-current-image' : ''} ${match.isOriginal ? 'tir-original-image' : ''} ${match.metadata?.tags?.includes('FAVORITE') ? 'tir-favorite-image' : ''} ${recommendedClass}" data-image-path="${match.fullPath}" data-tooltip="${tooltipText}" data-image-name="${match.name}">
                    <div class="tir-thumbnail-image">
                        <img src="${match.fullPath}" alt="${match.name}" loading="lazy">
                        ${match.isCurrent ? `
                            <div class="tir-thumbnail-current-badge">
                                <i class="fas fa-check"></i>
                            </div>
                        ` : isRecommended ? `
                            <div class="tir-thumbnail-recommended-badge" data-quick-apply="true">
                                <i class="fas fa-star"></i>
                            </div>
                            <div class="tir-thumbnail-overlay">
                                <i class="fas fa-check"></i>
                                <span class="tir-overlay-text">Apply to Token</span>
                            </div>
                        ` : `
                            <div class="tir-thumbnail-overlay">
                                <i class="fas fa-check"></i>
                                <span class="tir-overlay-text">Apply to Token</span>
                            </div>
                        `}
                        ${match.metadata?.tags?.includes('FAVORITE') ? `
                            <div class="tir-thumbnail-favorite-badge">
                                <i class="fas fa-heart"></i>
                            </div>
                        ` : ''}
                    </div>
                    <div class="tir-thumbnail-name">${match.name}</div>
                    <div class="tir-thumbnail-score">
                        ${isBrowseMode ? `
                            <div class="tir-score-text">Browse</div>
                            <div class="tir-score-bar">
                                <div class="tir-score-fill" style="width: 0%"></div>
                            </div>
                        ` : `
                            <div class="tir-score-text">${scorePercentage}% Match</div>
                            <div class="tir-score-bar">
                                <div class="tir-score-fill" style="width: ${scorePercentage}%"></div>
                            </div>
                        `}
                    </div>
                    <div class="tir-thumbnail-tagset">
                        ${tags.map(tag => `<span class="tir-thumbnail-tag">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    _getTagsForMatch(match) {
        const tags = [];
        
        // Add original image tag if applicable
        if (match.isOriginal) {
            tags.push('ORIGINAL IMAGE');
        }
        
        // Add current image tag if applicable
        if (match.isCurrent) {
            tags.push('CURRENT IMAGE');
        }
        
        // Add favorite tag if applicable
        if (match.metadata?.tags?.includes('FAVORITE')) {
            tags.push('FAVORITE');
        }
        
        // Only use metadata-based tags - no fallbacks
        if (match.metadata && match.metadata.tags && match.metadata.tags.length > 0) {
            // Add metadata tags (already processed and formatted)
            match.metadata.tags.forEach(tag => {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            });
        } else if (!match.isCurrent && !match.isOriginal) {
            // No fallback for non-current/non-original images - this is a critical error that needs to be fixed
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL ERROR - No metadata available for ${match.name}. The scanning process is broken.`, "", true, false);
            console.error(`Token Image Replacement: Missing metadata for file: ${match.name}`, match);
            // Return empty array - no tags means no display
            return [];
        }
        // For current/original images without metadata, we still return their respective tags
        
        return [...new Set(tags)]; // Remove duplicates
    }

    _applyPagination() {
        const startIndex = 0; // Always start from beginning for infinite scroll
        const endIndex = (this.currentPage + 1) * this.resultsPerPage;
        this.matches = this.allMatches.slice(startIndex, endIndex);
        this.hasMoreResults = this.allMatches.length > this.matches.length;
        
    }

    async _onScroll(event) {
        const element = event.currentTarget;
        const threshold = 100; // Load more when 100px from bottom
        
        if (element.scrollTop + element.clientHeight >= element.scrollHeight - threshold) {
            if (this.hasMoreResults && !this.isLoadingMore) {
                await this._loadMoreResults();
            }
        }
    }

    async _loadMoreResults() {
        this.isLoadingMore = true;
        this.currentPage++;
        this._applyPagination();
        this._updateResults();
        this.isLoadingMore = false;
    }

    async _onTagClick(event) {
        const tagName = event.currentTarget.dataset.searchTerm;
        if (!tagName) return;
        
        const $element = this.element;
        if (!$element) return;
        
        // Toggle the tag in the selected tags set
        if (this.selectedTags.has(tagName)) {
            this.selectedTags.delete(tagName);
        } else {
            this.selectedTags.add(tagName);
        }
        
        // Update the visual state of the tag
        const $tag = $(event.currentTarget);
        if (this.selectedTags.has(tagName)) {
            $tag.addClass('selected');
        } else {
            $tag.removeClass('selected');
        }
        
        // Apply the tag filters and refresh results
        await this._applyTagFilters();
    }

    /**
     * Apply tag filters to current results
     */
    async _applyTagFilters() {
        // Get the base filtered files (by category)
        const baseFiles = this._getFilteredFiles();
        
        // Apply tag filters
        let tagFilteredFiles = baseFiles;
        if (this.selectedTags.size > 0) {
            tagFilteredFiles = baseFiles.filter(file => {
                const fileTags = this._getTagsForFile(file);
                return Array.from(this.selectedTags).some(selectedTag => 
                    fileTags.includes(selectedTag)
                );
            });
        }
        
        // Apply search term if any
        if (this.searchTerm && this.searchTerm.length >= 3) {
            // Search mode never applies threshold
            this.allMatches = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, this.searchTerm, null, 'search', TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, false);
        } else {
            // Browse mode never applies threshold
            this.allMatches = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, null, null, 'browse', TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, false);
        }
        
        // Deduplicate results to prevent same file appearing multiple times
        this.allMatches = this._deduplicateResults(this.allMatches);
        
        // Apply pagination and update results
        this._applyPagination();
        this._updateResults();
    }

    /**
     * Robust cache lookup that handles special characters and case differences
     * @param {string} fileName - The filename to look up
     * @returns {Object|null} - The file info from cache or null if not found
     */
    _getFileInfoFromCache(fileName) {
        // Guard against undefined/null fileName
        if (!fileName) {
            return null;
        }
        
        // First try exact match (case-insensitive)
        const exactKey = fileName.toLowerCase();
        let fileInfo = TokenImageReplacement.cache.files.get(exactKey);
        if (fileInfo) {
            return fileInfo;
        }
        
        // Try removing special characters and matching
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
        if (cleanFileName !== exactKey) {
            fileInfo = TokenImageReplacement.cache.files.get(cleanFileName);
            if (fileInfo) {
                return fileInfo;
            }
        }
        
        // Try fuzzy matching by iterating through cache keys
        for (const [cacheKey, cacheValue] of TokenImageReplacement.cache.files.entries()) {
            // Remove special characters from both names for comparison
            const cleanCacheKey = cacheKey.replace(/[^a-zA-Z0-9._-]/g, '');
            const cleanMatchName = fileName.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
            
            if (cleanCacheKey === cleanMatchName) {
                return cacheValue;
            }
        }
        
        return null;
    }

    /**
     * Get tags for a specific file
     */
    _getTagsForFile(file) {
        const tags = [];
        
        // Add current image tag if this is the current token's image
        if (file.isCurrent) {
            tags.push('CURRENT IMAGE');
        }
        
        // Add metadata tags
        if (file.metadata && file.metadata.tags) {
            file.metadata.tags.forEach(tag => {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            });
        }
        
        // Add creature type tags
        const fileName = file.name || '';
        for (const [creatureType, files] of TokenImageReplacement.cache.creatureTypes.entries()) {
            if (Array.isArray(files) && files.includes(fileName)) {
                const cleanType = creatureType.toLowerCase().replace(/\s+/g, '');
                if (!tags.includes(cleanType)) {
                    tags.push(cleanType);
                }
            }
        }
        
        // Add folder path tags
        if (file.path) {
            const pathParts = file.path.split('/');
            pathParts.forEach(part => {
                if (part && part !== 'creatures' && part !== 'tokens') {
                    const cleanPart = part.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanPart && !tags.includes(cleanPart)) {
                        tags.push(cleanPart);
                    }
                }
            });
        }
        
        return tags;
    }

    // ================================================================== 
    // ===== WORD COMBINATION UTILITIES =================================
    // ================================================================== 
    
    /**
     * Normalize text for matching - lowercase and standardize separators
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
     * Initialize threshold slider with current setting value
     */
    _initializeThresholdSlider() {
               
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
                const actorNameMatch = TokenImageReplacement._calculateTokenNameMatch(tokenDocument.actor.name, fileNameLower, filePathLower, fileInfo);
                if (actorNameMatch > 0) {
                    totalScore += actorNameMatch * weights.actorName;
                    foundMatch = true;
                    
                    // Debug: Log scoring for goblin files
                }
            }
            
            // Token Name (flexible matching for any naming convention)
            if (tokenDocument && tokenDocument.name) {
                tokenNameMatch = TokenImageReplacement._calculateTokenNameMatch(tokenDocument.name, fileNameLower, filePathLower, fileInfo);
                if (tokenNameMatch > 0) {
                    totalScore += tokenNameMatch * weights.tokenName;
                    foundMatch = true;
                    
                    // Debug: Log scoring for goblin files
                }
                
            }
            
            // Represented Actor (most important)
            if (tokenData.representedActor) {
                const actorMatch = TokenImageReplacement._calculateTokenDataMatch(tokenData.representedActor, fileNameLower, filePathLower, fileInfo);
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
                    typeMatch = TokenImageReplacement._calculateTokenDataMatch(tokenData.creatureType, fileNameLower, filePathLower, fileInfo);
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
                    subtypeMatch = TokenImageReplacement._calculateTokenDataMatch(tokenData.creatureSubtype, fileNameLower, filePathLower, fileInfo);
                }
                
                if (subtypeMatch > 0) {
                    totalScore += subtypeMatch * weights.creatureSubtype;
                    foundMatch = true;
                }
            }
            
            // Equipment
            if (tokenData.equipment && tokenData.equipment.length > 0) {
                for (const equipment of tokenData.equipment) {
                    const equipmentMatch = TokenImageReplacement._calculateTokenDataMatch(equipment, fileNameLower, filePathLower, fileInfo);
                    if (equipmentMatch > 0) {
                        totalScore += equipmentMatch * weights.equipment;
                        foundMatch = true;
                        break; // Only count first equipment match
                    }
                }
            }
            
            
            // Background
            if (tokenData.background) {
                const backgroundMatch = TokenImageReplacement._calculateTokenDataMatch(tokenData.background, fileNameLower, filePathLower, fileInfo);
                if (backgroundMatch > 0) {
                    totalScore += backgroundMatch * weights.background;
                    foundMatch = true;
                }
            }
            
            // Size
            if (tokenData.size) {
                const sizeMatch = TokenImageReplacement._calculateTokenDataMatch(tokenData.size, fileNameLower, filePathLower, fileInfo);
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
                            // EXACT SEARCH: Normalized string matching in tags
                            const normalizedTag = tagLower.replace(/[\-_()]+/g, ' ').trim();
                            const normalizedWord = word.toLowerCase().replace(/[\-_()]+/g, ' ').trim();
                            
                            if (normalizedTag === normalizedWord) {
                                wordScore = Math.max(wordScore, 0.9);
                                wordFound = true;
                            } else if (normalizedTag.startsWith(normalizedWord)) {
                                wordScore = Math.max(wordScore, 0.8);
                                wordFound = true;
                            } else if (normalizedTag.includes(normalizedWord)) {
                                wordScore = Math.max(wordScore, 0.7);
                                wordFound = true;
                            }
                        }
                    }
                }
                
                // Folder path matching
                if (fuzzySearch) {
                    // FUZZY SEARCH: Individual word matching in paths
                    if (filePathLower.includes(word)) {
                        if (filePathLower.includes(`/${word}/`)) {
                            wordScore = Math.max(wordScore, 0.6);
                        } else {
                            wordScore = Math.max(wordScore, 0.4);
                        }
                        wordFound = true;
                    }
                } else {
                    // EXACT SEARCH: Normalized string matching in paths
                    const normalizedPath = filePathLower.replace(/[\-_()]+/g, ' ').trim();
                    const normalizedWord = word.toLowerCase().replace(/[\-_()]+/g, ' ').trim();
                    
                    if (normalizedPath.includes(normalizedWord)) {
                        if (normalizedPath.includes(`/${normalizedWord}/`)) {
                            wordScore = Math.max(wordScore, 0.6);
                        } else {
                            wordScore = Math.max(wordScore, 0.4);
                        }
                        wordFound = true;
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
        
        
        // Debug: Log scoring for frost giant files (for token dropping)
        if (fileNameLower.includes('frost') && fileNameLower.includes('giant')) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: FROST GIANT FILE - "${fileName}" - totalScore: ${totalScore.toFixed(3)}, maxPossibleScore: ${maxPossibleScore.toFixed(3)}, finalScore: ${finalScore.toFixed(3)}`, "", true, false);
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
     * Calculate match score for a specific token data point
     * Uses word combination utilities for improved multi-word matching
     * @param {string} tokenValue - The token data value to match
     * @param {string} fileNameLower - Lowercase filename
     * @param {string} filePathLower - Lowercase file path
     * @param {Object} fileInfo - File information object
     * @returns {number} Match score (0.0 to 1.0)
     */
    _calculateTokenDataMatch(tokenValue, fileNameLower, filePathLower, fileInfo) {
        if (!tokenValue) return 0;
        
        const valueLower = ImageMatching._normalizeText(tokenValue);
        const valueWords = ImageMatching._extractWords(valueLower);
        let maxScore = 0;
        
        // Primary filename matching using word combination utilities
        const filenameMatch = ImageMatching._matchCombinations(valueWords, fileNameLower);
        if (filenameMatch.matched) {
            maxScore = Math.max(maxScore, filenameMatch.score);
        }
        
        // Metadata tag matching
        if (fileInfo.metadata && fileInfo.metadata.tags) {
            for (const tag of fileInfo.metadata.tags) {
                const tagMatch = ImageMatching._matchCombinations(valueWords, tag);
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
                    const metadataMatch = ImageMatching._matchCombinations(valueWords, value);
                    if (metadataMatch.matched) {
                        maxScore = Math.max(maxScore, metadataMatch.score * 0.95);
                    }
                }
            }
        }
        
        // Folder path matching (lower priority)
        const pathMatch = ImageMatching._matchCombinations(valueWords, filePathLower);
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
    _calculateTokenNameMatch(tokenName, fileNameLower, filePathLower, fileInfo) {
        if (!tokenName) return 0;
        
        const tokenNameLower = ImageMatching._normalizeText(tokenName);
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
        
        // Test each potential creature name against the file using word combination utilities
        for (const creatureName of uniqueNames) {
            const creatureWords = ImageMatching._extractWords(creatureName);
            
            // Filename matching using word combinations
            const filenameMatch = ImageMatching._matchCombinations(creatureWords, fileNameLower);
            if (filenameMatch.matched) {
                maxScore = Math.max(maxScore, filenameMatch.score);
            }
            
            // Metadata tag matching
            if (fileInfo.metadata && fileInfo.metadata.tags) {
                for (const tag of fileInfo.metadata.tags) {
                    const tagMatch = ImageMatching._matchCombinations(creatureWords, tag);
                    if (tagMatch.matched) {
                        maxScore = Math.max(maxScore, tagMatch.score * 1.0);
                    }
                }
            }
        }
        
        return maxScore;
    }

    /**
     * Initialize threshold slider with current setting value
     */
    _initializeThresholdSlider() {
        const currentThreshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        const percentage = Math.round(currentThreshold * 100);
        
        const $slider = this.element.find('.tir-rangeslider');
        const $input = $slider.find('.tir-rangeslider-input');
        const $fill = $slider.find('.tir-rangeslider-fill');
        const $thumb = $slider.find('.tir-rangeslider-thumb');
        const $value = $slider.find('.tir-rangeslider-value');
        
        $input.val(percentage);
        $fill.css('width', `${percentage}%`);
        $thumb.css('left', `${percentage}%`);
        $value.text(`${percentage}%`);
    }

    /**
     * Handle threshold slider change
     */
    async _onThresholdSliderChange(event) {
        const value = parseInt(event.target.value);
        const percentage = value;
        const threshold = value / 100; // Convert percentage to decimal
        
        // Update the visual elements
        const $slider = $(event.target).closest('.tir-rangeslider');
        const $fill = $slider.find('.tir-rangeslider-fill');
        const $thumb = $slider.find('.tir-rangeslider-thumb');
        const $thresholdValue = $('.tir-threshold-value');
        
        $fill.css('width', `${percentage}%`);
        $thumb.css('left', `${percentage}%`);
        $thresholdValue.text(`${percentage}%`);
        
        // Update the setting
        game.settings.set(MODULE.ID, 'tokenImageReplacementThreshold', threshold);
        
        // Refresh results with new threshold
        await this._findMatches();
    }

    /**
     * Handle Update Dropped Tokens toggle change
     */
    async _onUpdateDroppedToggle(event) {
        const isEnabled = event.target.checked;
        await game.settings.set(MODULE.ID, 'tokenImageReplacementUpdateDropped', isEnabled);
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Update Dropped Tokens ${isEnabled ? 'enabled' : 'disabled'}`, 
            isEnabled ? 'Tokens dropped on canvas will be automatically updated' : 'Only manual updates via this window will work', 
            false, false);
    }

    /**
     * Handle Fuzzy Search toggle change
     */
    async _onFuzzySearchToggle(event) {
        const isEnabled = event.target.checked;
        game.settings.set(MODULE.ID, 'tokenImageReplacementFuzzySearch', isEnabled);
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Fuzzy Search ${isEnabled ? 'enabled' : 'disabled'}`, 
            isEnabled ? 'Searching for individual words independently' : 'Searching for exact string matches', 
            false, false);
        
        // Refresh results with new search mode
        await this._findMatches();
    }

    /**
     * Handle threshold click to adjust matching threshold
     */
    async _onThresholdClick(event) {
        event.preventDefault();
        
        const currentThreshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        
        // Create a simple prompt dialog
        const newThreshold = await Dialog.prompt({
            title: "Adjust Matching Threshold",
            content: `
                <div style="margin-bottom: 10px;">
                    <p>Adjust the matching threshold for image relevance scoring.</p>
                    <p><strong>Current threshold:</strong> ${currentThreshold}</p>
                    <p><strong>Range:</strong> 0.0 (very loose) to 1.0 (very strict)</p>
                </div>
                <div class="form-group">
                    <label for="threshold-input">New Threshold:</label>
                    <input type="number" id="threshold-input" name="threshold" 
                           min="0.0" max="1.0" step="0.1" value="${currentThreshold}"
                           style="width: 100%; margin-top: 5px;">
                </div>
            `,
            label: "Update Threshold",
            callback: (html) => {
                const input = html.find('#threshold-input');
                const value = parseFloat(input.val());
                
                if (isNaN(value) || value < 0 || value > 1) {
                    ui.notifications.error("Please enter a valid threshold between 0.0 and 1.0");
                    return false;
                }
                
                return value;
            }
        });
        
        if (newThreshold !== false && newThreshold !== currentThreshold) {
            await game.settings.set(MODULE.ID, 'tokenImageReplacementThreshold', newThreshold);
            ui.notifications.info(`Matching threshold updated to ${newThreshold}`);
            
            // Refresh results with new threshold
            await this._findMatches();
        }
    }

    /**
     * Generate detailed tooltip text for a match
     */
    _generateTooltipText(match, isRecommended) {
        const parts = [];
        
        // Basic info - ensure name is always valid
        const displayName = match.name || match.fullPath?.split('/').pop() || 'Unknown File';
        parts.push(`<strong>${displayName}</strong>`);
        parts.push(`Path: ${match.fullPath}`);
        
        // Score info
        if (match.searchScore !== undefined && match.searchScore !== null) {
            parts.push(`Score: ${match.searchScore.toFixed(3)}`);
        } else if (match.isBrowseMode) {
            parts.push(`Score: Browse Mode`);
        }
        
        
        // Metadata info
        if (match.metadata) {
            const metadataParts = [];
            if (match.metadata.creatureType) metadataParts.push(`Type: ${match.metadata.creatureType}`);
            if (match.metadata.subtype) metadataParts.push(`Subtype: ${match.metadata.subtype}`);
            if (match.metadata.size) metadataParts.push(`Size: ${match.metadata.size}`);
            if (match.metadata.class) metadataParts.push(`Class: ${match.metadata.class}`);
            if (match.metadata.weapon) metadataParts.push(`Weapon: ${match.metadata.weapon}`);
            if (match.metadata.armor) metadataParts.push(`Armor: ${match.metadata.armor}`);
            
            if (metadataParts.length > 0) {
                parts.push(`Metadata: ${metadataParts.join(', ')}`);
            }
        }
        
        return parts.join('<br>');
    }

    /**
     * Calculate the recommended token for automatic replacement
     * Uses the same unified matching logic as the window system
     */
    async _calculateRecommendedToken() {
        if (!this.selectedToken || this.allMatches.length === 0) {
            return null;
        }
        
        // Use the same parameters as the window system for token-based matching
        // searchTerms = null for token-based matching (same as window system)
        const searchTerms = null;
        const threshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        
        let bestMatch = null;
        let bestScore = 0;
        
        // Find the best match from current results (excluding current image and original image)
        for (const match of this.allMatches) {
            if (match.isCurrent || match.isOriginal) {
                continue; // Skip current image and original image
            }
            
            // Get file info from cache with robust lookup
            const fileInfo = this._getFileInfoFromCache(match.name);
            if (!fileInfo) {
                // Try using the match object directly as fallback
                const score = await ImageMatching._calculateRelevanceScore(match, searchTerms, this.selectedToken.document, 'token', TokenImageReplacement.cache);
                
                if (score > bestScore && score >= threshold) {
                    bestScore = score;
                    bestMatch = match;
                }
                continue;
            }
            
            // Calculate score using unified algorithm
            const score = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', TokenImageReplacement.cache);
            
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = match;
            }
        }
        
        // Log recommended token breakdown if we found a match
        if (bestMatch) {
            const tokenData = TokenImageReplacement._extractTokenData(this.selectedToken.document);
            const weights = {
                actorName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightActorName') / 100,
                tokenName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightTokenName') / 100,
                representedActor: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor') / 100,
                creatureType: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureType') / 100,
                creatureSubtype: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype') / 100,
                equipment: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightEquipment') / 100,
                size: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightSize') / 100
            };
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ===== RECOMMENDED TOKEN BREAKDOWN =====`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: RECOMMENDED: "${bestMatch.name}" scored ${(bestScore * 100).toFixed(1)}%`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: TOKEN DATA:`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - ACTOR NAME: "${this.selectedToken.document?.actor?.name || 'NOT_FOUND'}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - TOKEN NAME: "${this.selectedToken.document?.name || 'NOT_FOUND'}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - REPRESENTED ACTOR: "${tokenData?.representedActor || 'NOT_FOUND'}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - CREATURE TYPE: "${tokenData?.creatureType || 'NOT_FOUND'}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - CREATURE SUBTYPE: "${tokenData?.creatureSubtype || 'NOT_FOUND'}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - EQUIPMENT: [${tokenData?.equipment?.join(', ') || 'NOT_FOUND'}]`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - SIZE: "${tokenData?.size || 'NOT_FOUND'}"`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - WEIGHTS: {actorName: ${weights.actorName}, tokenName: ${weights.tokenName}, representedActor: ${weights.representedActor}, creatureType: ${weights.creatureType}, creatureSubtype: ${weights.creatureSubtype}, equipment: ${weights.equipment}, size: ${weights.size}}`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ======================================`, "", true, false);
        }
        
        return bestMatch;
    }

    /**
     * Check if a file represents a basic creature (not a specialized variant)
     */
    _isBasicCreature(fileName, fileInfo) {
        const fileNameLower = fileName.toLowerCase();
        
        // Check if filename contains specialization indicators
        const specializationIndicators = [
            'archer', 'barbarian', 'fighter', 'rogue', 'wizard', 'cleric', 'druid', 'ranger',
            'bomber', 'spellcaster', 'psion', 'impersonator', 'warlord',
            'bow', 'axe', 'sword', 'spear', 'mace', 'dagger', 'crossbow',
            'shield', 'armor', 'leather', 'chain', 'plate',
            'magic', 'spirit', 'medium', 'small', 'large'
        ];
        
        // If filename contains any specialization indicators, it's not basic
        for (const indicator of specializationIndicators) {
            if (fileNameLower.includes(indicator)) {
                return false;
            }
        }
        
        // Check metadata for specialization
        if (fileInfo.metadata) {
            const specializationFields = ['class', 'weapon', 'armor', 'action', 'pose'];
            for (const field of specializationFields) {
                if (fileInfo.metadata[field]) {
                    return false; // Has specialization metadata
                }
            }
        }
        
        // If we get here, it's likely a basic creature
        return true;
    }

    /**
     * Calculate token context bonus for search relevance
     */
    _calculateTokenContextBonus(fileInfo, searchTermLower) {
        if (!this.selectedToken) return 0;
        
        let contextBonus = 0;
        const tokenDoc = this.selectedToken.document;
        
        // Get token characteristics
        const tokenName = (tokenDoc.name || '').toLowerCase();
        const tokenType = (tokenDoc.type || '').toLowerCase();
        const tokenSystem = tokenDoc.system || {};
        
        // Check if file metadata matches token characteristics
        if (fileInfo.metadata) {
            // Check creature type matches
            if (fileInfo.metadata.creatureType) {
                const fileCreatureType = (typeof fileInfo.metadata.creatureType === 'string' ? fileInfo.metadata.creatureType : '').toLowerCase();
                if (tokenType.includes(fileCreatureType) || fileCreatureType.includes(tokenType)) {
                    contextBonus += 25; // Strong creature type match
                }
            }
            
            // Check subtype matches
            if (fileInfo.metadata.subtype) {
                const fileSubtype = (typeof fileInfo.metadata.subtype === 'string' ? fileInfo.metadata.subtype : '').toLowerCase();
                if (tokenName.includes(fileSubtype) || fileSubtype.includes(tokenName)) {
                    contextBonus += 20; // Subtype match
                }
            }
            
            // Check class/profession matches
            if (fileInfo.metadata.class || fileInfo.metadata.profession) {
                const fileClass = (typeof fileInfo.metadata.class === 'string' ? fileInfo.metadata.class : '').toLowerCase();
                const fileProfession = (typeof fileInfo.metadata.profession === 'string' ? fileInfo.metadata.profession : '').toLowerCase();
                
                // Check against token system data
                if (tokenSystem.classes) {
                    for (const className of Object.keys(tokenSystem.classes)) {
                        if (fileClass.includes(className.toLowerCase()) || className.toLowerCase().includes(fileClass)) {
                            contextBonus += 20; // Class match
                        }
                    }
                }
                
                if (fileProfession && tokenName.includes(fileProfession)) {
                    contextBonus += 15; // Profession match
                }
            }
            
            // Check size matches
            if (fileInfo.metadata.size) {
                const fileSize = (typeof fileInfo.metadata.size === 'string' ? fileInfo.metadata.size : '').toLowerCase();
                const tokenSize = (tokenSystem.traits?.size || '').toLowerCase();
                if (fileSize === tokenSize) {
                    contextBonus += 15; // Size match
                }
            }
            
            // Check weapon/armor matches
            if (fileInfo.metadata.weapon || fileInfo.metadata.armor) {
                const fileWeapon = (typeof fileInfo.metadata.weapon === 'string' ? fileInfo.metadata.weapon : '').toLowerCase();
                const fileArmor = (typeof fileInfo.metadata.armor === 'string' ? fileInfo.metadata.armor : '').toLowerCase();
                
                // Check against token equipment
                if (tokenSystem.equipment) {
                    const equipment = JSON.stringify(tokenSystem.equipment).toLowerCase();
                    if (equipment.includes(fileWeapon) || equipment.includes(fileArmor)) {
                        contextBonus += 15; // Equipment match
                    }
                }
            }
        }
        
        // Check if filename contains token name or type
        const fileName = (fileInfo.name || '').toLowerCase();
        if (tokenName && fileName.includes(tokenName)) {
            contextBonus += 30; // Filename contains token name
        }
        if (tokenType && fileName.includes(tokenType)) {
            contextBonus += 25; // Filename contains token type
        }
        
        // Check if search term matches token characteristics
        if (searchTermLower === tokenName || searchTermLower === tokenType) {
            contextBonus += 20; // Search term matches token name/type
        }
        
        return Math.min(contextBonus, 50); // Cap at 50 points to avoid overwhelming other scores
    }

    async _onClearSearch(event) {
        event.preventDefault();
        
        const $element = this.element;
        if ($element) {
            // Clear the search input
            $element.find('.tir-search-input').val('');
            this.searchTerm = '';
            
            // Clear selected tags
            this.selectedTags.clear();
            $element.find('.tir-search-tools-tag').removeClass('selected');
            
            // Clear any pending search timeout
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }
            
            // Refresh results
            this._showSearchSpinner();
            await this._findMatches();
            this._hideSearchSpinner();
        }
    }

    _onFilterToggle(event) {
        event.preventDefault();
        
        const $element = this.element;
        if ($element) {
            const $button = $(event.currentTarget);
            const $tagContainer = $element.find('#tir-search-tools-tag-container');
            
            // Cycle through the 3 states: count -> alpha -> hidden -> count
            if (this.tagSortMode === 'count') {
                this.tagSortMode = 'alpha';
                $button.attr('title', 'Tag Sort: Alpha');
                $button.find('i').removeClass('fa-filter').addClass('fa-filter-list');
                $tagContainer.show();
            } else if (this.tagSortMode === 'alpha') {
                this.tagSortMode = 'hidden';
                $button.attr('title', 'Tag Sort: Hidden');
                $button.find('i').removeClass('fa-filter-list').addClass('fa-filter-circle-xmark');
                $tagContainer.hide();
            } else { // hidden
                this.tagSortMode = 'count';
                $button.attr('title', 'Tag Sort: Count');
                $button.find('i').removeClass('fa-filter-circle-xmark').addClass('fa-filter');
                $tagContainer.show();
            }
            
            // Save the setting
            game.settings.set(MODULE.ID, 'tokenImageReplacementTagSortMode', this.tagSortMode);
            
            // Update the tag container with new sorting
            if (this.tagSortMode !== 'hidden') {
                this._updateTagContainer();
            }
        }
    }

    async _onCategoryFilterClick(event) {
        const category = event.currentTarget.dataset.category;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Category filter clicked: ${category}`, "", true, false);
        
        if (!category || category === this.currentFilter) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Filter click ignored - category: ${category}, current: ${this.currentFilter}`, "", true, false);
            return;
        }
        
        // Update active filter
        const $element = this.element;
        if ($element) {
            // Remove active class from all filter categories
            $element.find('#tir-filter-category-container .tir-filter-category').removeClass('active');
            $(event.currentTarget).addClass('active');
            
            // Set new filter
            this.currentFilter = category;
            this._cachedSearchTerms = null; // Clear cache when filter changes
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Filter changed to: ${category}`, "", true, false);
            
            // Re-run search with new filter
            await this._findMatches();
        }
    }

    async _onSortOrderChange(event) {
        const newSortOrder = event.currentTarget.value;
        if (!newSortOrder || newSortOrder === this.sortOrder) return;
        
        
        // Update sort order
        this.sortOrder = newSortOrder;
        
        // Re-sort and update results for current tab
        this._showSearchSpinner();
        await this._findMatches();
        this._hideSearchSpinner();
    }



    /**
     * Deduplicate results to prevent same file appearing multiple times
     */
    _deduplicateResults(results) {
        const seen = new Set();
        return results.filter(result => {
            const key = result.fullPath || result.name;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Sort results based on current sort order
     */
    _sortResults(results) {
        if (!results || results.length === 0) return results;
        
        return results.sort((a, b) => {
            // Always keep original image at the very top
            if (a.isOriginal) return -1;
            if (b.isOriginal) return 1;
            
            // Then keep current image second
            if (a.isCurrent) return -1;
            if (b.isCurrent) return 1;
            
            // Apply sort order
            switch (this.sortOrder) {
                case 'atoz':
                    return a.name.localeCompare(b.name);
                case 'ztoa':
                    return b.name.localeCompare(a.name);
                case 'relevance':
                default:
                    return b.searchScore - a.searchScore;
            }
        });
    }

    _getCacheStatus() {
        // Read directly from the actual cache, not from settings
        if (TokenImageReplacement.cache.files.size === 0) {
            return "No cache in storage";
        }
        
        const fileCount = TokenImageReplacement.cache.files.size;
        const lastScan = TokenImageReplacement.cache.lastScan;
        
        // Get cache size from server settings (not localStorage)
        let cacheSizeText = '';
        try {
            const cacheData = game.settings.get(MODULE.ID, 'tokenImageReplacementCache');
            if (cacheData) {
                const sizeMB = (new Blob([cacheData]).size / (1024 * 1024)).toFixed(2);
                cacheSizeText = `, ${sizeMB}MB`;
            }
        } catch (error) {
            // Ignore size calculation errors
        }
        
        if (!lastScan) {
            return `${fileCount} files, unknown age${cacheSizeText}`;
        }
        
        const cacheAge = Date.now() - lastScan;
        const ageHours = (cacheAge / (1000 * 60 * 60)).toFixed(1);
        const displayAge = Math.min(parseFloat(ageHours), 9999);
        
        return `${fileCount} files, ${displayAge} hours old${cacheSizeText}`;
    }

    _updateNotificationData() {
        // Only show notifications when there's something the user needs to know about
        if (TokenImageReplacement.cache.isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (TokenImageReplacement.cache.isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'Images are being scanned to build the image cache and may impact performance.';
        } else if (TokenImageReplacement.cache.justCompleted && TokenImageReplacement.cache.completionData) {
            this.notificationIcon = 'fas fa-check-circle';
            let notificationText = `Scan Complete! Found ${TokenImageReplacement.cache.completionData.totalFiles} files across ${TokenImageReplacement.cache.completionData.totalFolders} folders in ${TokenImageReplacement.cache.completionData.timeString}`;
            if (TokenImageReplacement.cache.completionData.ignoredFiles > 0) {
                notificationText += ` (${TokenImageReplacement.cache.completionData.ignoredFiles} files ignored)`;
            }
            this.notificationText = notificationText;
        } else if (TokenImageReplacement.cache.files.size === 0) {
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'No Image Cache Found - Please scan for images.';
        } else {
            // Cache exists and is working normally - no notification needed
            this.notificationIcon = null;
            this.notificationText = null;
        }
    }

    _getCategories() {
        // Generate categories from existing folder structure
        const topLevelFolders = new Map();
        
        // Count files directly from the file cache using the same path parsing logic as filtering
        for (const fileInfo of TokenImageReplacement.cache.files.values()) {
            const path = fileInfo.path || fileInfo.fullPath || '';
            const pathParts = path.split('/');
            
            // Handle both relative and full path formats (same logic as _getFilteredFiles)
            let topLevel;
            if (pathParts.length > 4 && pathParts[3] === 'FA_Tokens_Webp') {
                // Full path format: assets/images/tokens/FA_Tokens_Webp/Adventurers/...
                topLevel = pathParts[4];
            } else {
                // Relative path format: Adventurers/...
                topLevel = pathParts[0];
            }
            
            // Skip ignored folders
            if (topLevel && !TokenImageReplacement._isFolderIgnored(topLevel)) {
                const currentCount = topLevelFolders.get(topLevel) || 0;
                topLevelFolders.set(topLevel, currentCount + 1);
            }
        }
        
        // Convert to array of category objects for template
        const categories = [];
        for (const [categoryName, fileCount] of topLevelFolders) {
            categories.push({
                name: TokenImageReplacement._cleanCategoryName(categoryName),
                key: categoryName.toLowerCase(),
                count: fileCount,
                isActive: this.currentFilter === categoryName.toLowerCase()
            });
        }
        
        return categories;
    }

    _getAggregatedTags() {
        const tagCounts = new Map();
        
        // Check if we're in category mode (no search term)
        const isCategoryMode = !this.searchTerm;
        
        if (isCategoryMode) {
            // Category mode: Show ALL tags for this category
            const allFiles = Array.from(TokenImageReplacement.cache.files.values());
            let categoryFiles;
            if (this.currentFilter === 'all') {
                categoryFiles = allFiles;  // For 'all', use all files
            } else if (this.currentFilter === 'selected') {
                // For 'selected', filter by token characteristics
                if (!this.selectedToken) {
                    categoryFiles = []; // No files if no token selected
                } else {
                    const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
                    const processedTerms = searchTerms
                        .filter(term => term && term.length >= 2)
                        .map(term => term.toLowerCase());
                    
                    categoryFiles = allFiles.filter(file => {
                        const path = file.path || '';
                        const fileName = file.name || '';
                        const fileText = `${path} ${fileName}`.toLowerCase();
                        return processedTerms.some(term => fileText.includes(term));
                    });
                }
            } else {
                // For other categories, filter by folder
                categoryFiles = allFiles.filter(file => {
                    const path = file.path || file.fullPath || '';
                    const pathParts = path.split('/');
                    
                    // Handle both relative and full path formats
                    let categoryFolder;
                    if (pathParts.length > 4 && pathParts[3] === 'FA_Tokens_Webp') {
                        // Full path format
                        categoryFolder = pathParts[4];
                    } else {
                        // Relative path format - first part is the category
                        categoryFolder = pathParts[0];
                    }
                    
                    return categoryFolder ? categoryFolder.toLowerCase() === this.currentFilter : false;
                });
            }
            
            // Count tags from all files in this category
            categoryFiles.forEach(file => {
                if (file.metadata && file.metadata.tags) {
                    file.metadata.tags.forEach(tag => {
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    });
                }
            });
            
            // Return ALL tags for category (no limit)
            return Array.from(tagCounts.entries())
                .sort((a, b) => this._sortTagsByMode(a, b)) // Sort by current mode
                .map(([tag]) => tag); // Return just the tag names
        } else {
            // Search/Selected mode: Show tags from currently displayed results
            this.matches.forEach(match => {
                const tags = this._getTagsForMatch(match);
                tags.forEach(tag => {
                    if (tag !== 'CURRENT IMAGE') { // Don't count current image tag
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    }
                });
            });
            
            // ALWAYS include selected tags, even if they don't appear in current results
            this.selectedTags.forEach(selectedTag => {
                if (!tagCounts.has(selectedTag)) {
                    tagCounts.set(selectedTag, 0); // Add with 0 count but still show it
                }
            });
            
            // Sort by current mode and return all tags
            return Array.from(tagCounts.entries())
                .sort((a, b) => {
                    // Selected tags should appear first, then by current sort mode
                    const aIsSelected = this.selectedTags.has(a[0]);
                    const bIsSelected = this.selectedTags.has(b[0]);
                    if (aIsSelected && !bIsSelected) return -1;
                    if (!aIsSelected && bIsSelected) return 1;
                    return this._sortTagsByMode(a, b);
                })
                .map(([tag]) => tag); // Return just the tag names
        }
    }

    /**
     * Sort tags based on current sort mode
     * @param {Array} a - First tag entry [tag, count]
     * @param {Array} b - Second tag entry [tag, count]
     * @returns {number} Sort comparison result
     */
    _sortTagsByMode(a, b) {
        switch (this.tagSortMode) {
            case 'alpha':
                return a[0].localeCompare(b[0]); // Alphabetical
            case 'count':
            default:
                return b[1] - a[1]; // Count descending
        }
    }

    /**
     * Initialize the filter toggle button state based on current setting
     */
    _initializeFilterToggleButton() {
        const $element = this.element;
        if (!$element) return;

        const $button = $element.find('.tir-filter-toggle-btn');
        const $tagContainer = $element.find('#tir-search-tools-tag-container');
        
        // Set the correct icon, title, and visibility based on current mode
        switch (this.tagSortMode) {
            case 'count':
                $button.attr('title', 'Tag Sort: Count');
                $button.find('i').removeClass('fa-filter-list fa-filter-circle-xmark').addClass('fa-filter');
                $tagContainer.show();
                break;
            case 'alpha':
                $button.attr('title', 'Tag Sort: Alpha');
                $button.find('i').removeClass('fa-filter fa-filter-circle-xmark').addClass('fa-filter-list');
                $tagContainer.show();
                break;
            case 'hidden':
                $button.attr('title', 'Tag Sort: Hidden');
                $button.find('i').removeClass('fa-filter fa-filter-list').addClass('fa-filter-circle-xmark');
                $tagContainer.hide();
                break;
        }
    }

    /**
     * Update the tag container with current tags and sorting
     */
    _updateTagContainer() {
        const $element = this.element;
        if (!$element) return;

        const aggregatedTags = this._getAggregatedTags();
        const tagHtml = aggregatedTags.map(tag => {
            const isSelected = this.selectedTags.has(tag);
            const selectedClass = isSelected ? ' selected' : '';
            return `<span class="tir-search-tools-tag${selectedClass}" data-search-term="${tag}">${tag}</span>`;
        }).join('');
        
        $element.find('#tir-search-tools-tag-container').html(tagHtml);
        
        // Show/hide tags row based on whether there are tags and current mode
        if (aggregatedTags.length > 0 && this.tagSortMode !== 'hidden') {
            $element.find('#tir-search-tools-tag-container').show();
        } else {
            $element.find('#tir-search-tools-tag-container').hide();
        }
    }

    /**
     * Find a matching image for a token
     */
    static async findMatchingImage(tokenDocument) {
        
        // Check if feature is enabled
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            return null;
        }
        
        // Check if we should skip this token type
        if (!TokenImageReplacement._shouldUpdateToken(tokenDocument)) {
            return null;
        }
        
        // If cache is empty, return null - real-time search will be handled by caller
        if (TokenImageReplacement.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache empty, skipping automatic matching", "", true, false);
            return null;
        }
        
        // Debug: Log cache status
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache status - files: ${TokenImageReplacement.cache.files.size}, folders: ${TokenImageReplacement.cache.folders.size}, creatureTypes: ${TokenImageReplacement.cache.creatureTypes.size}`, "", true, false);
        
        // Debug: Log token details
        const creatureType = tokenDocument.actor?.system?.details?.type?.value;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Token details - name: "${tokenDocument.name}", creatureType: "${creatureType}"`, "", true, false);
        
        // Debug: Log timing - are we matching before or after nameplate change?
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: MATCHING TIMING - Current token name: "${tokenDocument.name}", Actor name: "${tokenDocument.actor?.name}"`, "", true, false);
        
        // For token dropping, use actor name instead of token name (before nameplate change)
        const originalTokenName = tokenDocument.name;
        tokenDocument.name = tokenDocument.actor?.name || tokenDocument.name;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Using actor name for matching: "${tokenDocument.name}"`, "", true, false);
        
        // Debug: Log some sample filenames to see what's in cache
        const sampleFiles = Array.from(TokenImageReplacement.cache.files.keys()).slice(0, 10);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Sample cached files: ${sampleFiles.join(', ')}`, "", true, false);
        
        
        // Use unified matching system (same as WINDOW)
        // For DROP, always search ALL files (no UI filtering)
        // Create temporary window instance to access unified matching methods
        const tempWindow = new TokenImageReplacementWindow();
        tempWindow.currentFilter = 'all'; // Always use 'all' for DROP to search complete file set
        
        // Get all files (no filtering for DROP - let scoring determine best match)
        const filesToSearch = tempWindow._getFilteredFiles();
        
        // Use unified matching with token mode (same parameters as WINDOW)
        // For token-based matching, searchTerms should be null (same as WINDOW system)
        // Token drop should apply threshold (it's like SELECTED tab behavior)
        const matches = await ImageMatching._applyUnifiedMatching(filesToSearch, null, tokenDocument, 'token', TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, true);
        
        // Restore original token name
        tokenDocument.name = originalTokenName;
        
        // Return the best match (highest score)
        const match = matches.length > 0 ? matches[0] : null;
        
        if (match) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found match for ${tokenDocument.name}: ${match.name} (score: ${(match.searchScore * 100).toFixed(1)}%)`, "", true, false);
            return match;
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No match found above threshold for ${tokenDocument.name}`, "", true, false);
        return null;
    }

    /**
     * Handle global token selection changes
     */
    static async _onGlobalTokenSelectionChange(token, controlled) {
        //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
        
        // Find any open Token Image Replacement windows and update them
        const openWindows = Object.values(ui.windows).filter(w => w instanceof TokenImageReplacementWindow);
        
        for (const window of openWindows) {
            if (window._onTokenSelectionChange) {
                await window._onTokenSelectionChange(token, controlled);
            }
        }
        
        //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
    }

    /**
     * Store the original image for a token before any updates
     */
    static async _storeOriginalImage(tokenDocument) {
        if (!tokenDocument || !tokenDocument.texture) {
            return;
        }
        
        const originalImage = {
            path: tokenDocument.texture.src,
            name: tokenDocument.texture.src.split('/').pop(),
            timestamp: Date.now()
        };
        
        // Store in token flags for persistence
        await tokenDocument.setFlag(MODULE.ID, 'originalImage', originalImage);
    }

    /**
     * Get the original image for a token
     */
    static _getOriginalImage(tokenDocument) {
        if (!tokenDocument) {
            return null;
        }
        
        // Get from token flags for persistence
        return tokenDocument.getFlag(MODULE.ID, 'originalImage') || null;
    }

    /**
     * Store the previous image for a token before applying dead token
     * This allows restoration to the replaced image (not original) when revived
     */
    static async _storePreviousImage(tokenDocument) {
        if (!tokenDocument || !tokenDocument.texture) {
            return;
        }
        
        const previousImage = {
            path: tokenDocument.texture.src,
            name: tokenDocument.texture.src.split('/').pop(),
            timestamp: Date.now()
        };
        
        // Store in token flags for persistence
        await tokenDocument.setFlag(MODULE.ID, 'previousImage', previousImage);
    }

    /**
     * Get the previous image for a token (image before dead token was applied)
     */
    static _getPreviousImage(tokenDocument) {
        if (!tokenDocument) {
            return null;
        }
        
        // Get from token flags for persistence
        return tokenDocument.getFlag(MODULE.ID, 'previousImage') || null;
    }

    /**
     * Restore the previous token image (used when token is revived)
     */
    static async _restorePreviousTokenImage(tokenDocument) {
        if (!tokenDocument) {
            return;
        }
        
        const previousImage = TokenImageReplacementWindow._getPreviousImage(tokenDocument);
        if (previousImage) {
            try {
                await tokenDocument.update({ 'texture.src': previousImage.path });
                await tokenDocument.setFlag(MODULE.ID, 'isDeadTokenApplied', false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Restored previous image for ${tokenDocument.name}`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error restoring previous image: ${error.message}`, "", true, false);
            }
        }
    }

    /**
     * Get the dead token image path (single image for all dead tokens)
     */
    static _getDeadTokenImagePath() {
        const deadTokenPath = getSettingSafely(MODULE.ID, 'deadTokenImagePath', 'assets/images/tokens/dead_token.png');
        
        // Check if the file exists in our cache (only if cache is available)
        if (TokenImageReplacement.cache && TokenImageReplacement.cache.files) {
            const fileName = deadTokenPath.split('/').pop();
            const cachedFile = TokenImageReplacement.cache.files.get(fileName.toLowerCase());
            
            if (cachedFile) {
                return cachedFile.fullPath;
            }
        }
        
        // If not in cache or cache not available, return the path as-is (might be a custom path)
        return deadTokenPath;
    }

    /**
     * Apply dead token image to a token
     */
    static async _applyDeadTokenImage(tokenDocument, actor) {
        // Check if feature is enabled
        if (!getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', false)) {
            return;
        }
        
        // Check if dead token is already applied
        if (tokenDocument.getFlag(MODULE.ID, 'isDeadTokenApplied')) {
            return;
        }
        
        // Check creature type filter
        const creatureType = actor?.system?.details?.type?.value?.toLowerCase() || '';
        const allowedTypes = getSettingSafely(MODULE.ID, 'deadTokenCreatureTypeFilter', '');
        
        if (allowedTypes && allowedTypes.trim() !== '') {
            const types = allowedTypes.split(',').map(t => t.trim().toLowerCase());
            if (!types.includes(creatureType)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping dead token for ${tokenDocument.name} - creature type ${creatureType} not in filter`, "", true, false);
                return;
            }
        }
        
        // Store current image as "previous" before applying dead token
        await TokenImageReplacementWindow._storePreviousImage(tokenDocument);
        
        // Get the dead token image path
        const deadTokenPath = TokenImageReplacementWindow._getDeadTokenImagePath();
        
        if (deadTokenPath) {
            try {
                await tokenDocument.update({ 'texture.src': deadTokenPath });
                await tokenDocument.setFlag(MODULE.ID, 'isDeadTokenApplied', true);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied dead token to ${tokenDocument.name}`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying dead token: ${error.message}`, "", true, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Dead token image path not configured for ${tokenDocument.name}`, "", true, false);
        }
    }

    /**
     * Hook for actor updates - monitor HP changes for dead token replacement
     */
    static async _onActorUpdateForDeadToken(actor, changes, options, userId) {
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - _onActorUpdateForDeadToken called for ${actor.name}`, "", true, false);
        
        // Check if feature is enabled
        if (!getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG - Dead token replacement disabled", "", true, false);
            return;
        }
        
        // Only GMs can update tokens
        if (!game.user.isGM) {
            return;
        }
        
        // Check if HP changed
        if (!changes.system?.attributes?.hp) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: DEBUG - No HP change detected", "", true, false);
            return;
        }
        
        // Get current HP
        const currentHP = actor.system.attributes.hp.value;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - HP changed to ${currentHP}`, "", true, false);
        
        // Find all tokens for this actor on current scene
        if (!canvas.scene) {
            return;
        }
        
        const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
        
        for (const token of tokens) {
            if (currentHP <= 0) {
                // Token died - apply dead image
                await TokenImageReplacementWindow._applyDeadTokenImage(token.document, actor);
            } else if (token.document.getFlag(MODULE.ID, 'isDeadTokenApplied')) {
                // Token was revived - restore previous image
                await TokenImageReplacementWindow._restorePreviousTokenImage(token.document);
            }
        }
    }

    /**
     * Hook for when tokens are created
     */
    static async _onTokenCreated(tokenDocument, options, userId) {
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Hook fired for token: ${tokenDocument.name}`, "", true, false);
        
        // Only GMs can update tokens - skip for non-GM users
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - user is not GM", "", true, false);
            return;
        }
        
        // Store the original image before any updates
        await TokenImageReplacementWindow._storeOriginalImage(tokenDocument);
        
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - feature disabled", "", true, false);
            return;
        }
        
        // Check if Update Dropped Tokens is enabled
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementUpdateDropped', true)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - Update Dropped Tokens disabled", "", true, false);
            return;
        }
        
        // Check if cache is ready
        if (TokenImageReplacement.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - cache not ready", "", true, false);
            return;
        }
        
        // Extract token data
        const tokenData = TokenImageReplacement._extractTokenData(tokenDocument);
        
        // Log formatted breakdown (simplified for new scoring system)
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ===== TOKEN DATA BREAKDOWN =====`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Criteria | Data from Token`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: representedActor | "${tokenData.representedActor || 'none'}"`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: tokenName | "${tokenDocument.name || 'none'}"`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: creatureType | "${tokenData.creatureType || 'none'}"`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: creatureSubtype | "${tokenData.creatureSubtype || 'none'}"`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: equipment | [${tokenData.equipment?.join(', ') || 'none'}]`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: size | "${tokenData.size || 'none'}"`, "", true, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: =================================`, "", true, false);
        
        // Wait a moment for the token to be fully created on the canvas
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Find matching image
        const matchingImage = await TokenImageReplacementWindow.findMatchingImage(tokenDocument);
        
        if (matchingImage) {
            // Validate the image path before applying
            if (TokenImageReplacement._isInvalidFilePath(matchingImage.fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cannot apply invalid image path to ${tokenDocument.name}: ${matchingImage.fullPath}`, "", true, false);
                
                // Clean up the invalid path from cache to prevent future issues
                TokenImageReplacement.cache.files.delete(matchingImage.name.toLowerCase());
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Removed invalid path from cache: ${matchingImage.name}`, "", true, false);
                
                // Try to find an alternative match using unified matching system
                // Get current filter from any open window
                let currentFilter = 'all';
                const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
                if (openWindow) {
                    currentFilter = openWindow.currentFilter;
                }
                
                // Create temporary window instance to access unified matching methods
                const tempWindow = new TokenImageReplacementWindow();
                tempWindow.currentFilter = currentFilter;
                
                // Get filtered files and find alternative match
                const filesToSearch = tempWindow._getFilteredFiles();
                // Apply threshold based on current filter (like main window)
                const applyThreshold = currentFilter === 'selected';
                const matches = await ImageMatching._applyUnifiedMatching(filesToSearch, null, tokenDocument, 'token', TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, applyThreshold);
                const alternativeMatch = matches.length > 0 ? matches[0] : null;
                if (alternativeMatch && !TokenImageReplacement._isInvalidFilePath(alternativeMatch.fullPath)) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found alternative match for ${tokenDocument.name}: ${alternativeMatch.name}`, "", true, false);
                    try {
                        await tokenDocument.update({
                            'texture.src': alternativeMatch.fullPath
                        });
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied alternative image ${alternativeMatch.name} to ${tokenDocument.name}`, "", true, false);
                    } catch (altError) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying alternative image: ${altError.message}`, "", true, false);
                    }
                }
                return;
            }
            
            // Apply the image replacement
            try {
                await tokenDocument.update({
                    'texture.src': matchingImage.fullPath
                });
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied ${matchingImage.name} to ${tokenDocument.name} (Score: ${((matchingImage.score || 0) * 100).toFixed(1)}%)`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying image: ${error.message}`, "", false, false);
                
                // Check if the error is due to an invalid asset path
                if (error.message.includes('Invalid Asset') || error.message.includes('loadTexture')) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Invalid asset detected, removing from cache: ${matchingImage.fullPath}`, "", false, false);
                    TokenImageReplacement.cache.files.delete(matchingImage.name.toLowerCase());
                    
                    // Try to find an alternative match using unified matching system
                    // Get current filter from any open window
                    let currentFilter = 'all';
                    const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
                    if (openWindow) {
                        currentFilter = openWindow.currentFilter;
                    }
                    
                    // Create temporary window instance to access unified matching methods
                    const tempWindow = new TokenImageReplacementWindow();
                    tempWindow.currentFilter = currentFilter;
                    
                    // Get filtered files and find alternative match
                    const filesToSearch = tempWindow._getFilteredFiles();
                    // Apply threshold based on current filter (like main window)
                    const applyThreshold = currentFilter === 'selected';
                    const matches = await ImageMatching._applyUnifiedMatching(filesToSearch, null, tokenDocument, 'token', TokenImageReplacement.cache, TokenImageReplacement._extractTokenData, applyThreshold);
                    const alternativeMatch = matches.length > 0 ? matches[0] : null;
                    if (alternativeMatch && !TokenImageReplacement._isInvalidFilePath(alternativeMatch.fullPath)) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found alternative match for ${tokenDocument.name}: ${alternativeMatch.name}`, "", false, false);
                        try {
                            await tokenDocument.update({
                                'texture.src': alternativeMatch.fullPath
                            });
                            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied alternative image ${alternativeMatch.name} to ${tokenDocument.name}`, "", false, false);
                        } catch (altError) {
                            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying alternative image: ${altError.message}`, "", false, false);
                        }
                    }
                }
                
                // Notify the GM about the failure
                if (game.user.isGM) {
                    ui.notifications.warn(`Token Image Replacement failed for ${tokenDocument.name}. Check console for details.`);
                }
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No matching image found for ${tokenDocument.name}`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Search Summary - Token Data: representedActor="${tokenData.representedActor}", creatureType="${tokenData.creatureType}", creatureSubtype="${tokenData.creatureSubtype}", equipment=[${tokenData.equipment?.join(', ') || 'none'}]`, "", true, false);
        }
    }

}

