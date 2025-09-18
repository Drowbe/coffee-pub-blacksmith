// ================================================================== 
// ===== TOKEN IMAGE REPLACEMENT CACHING SYSTEM =====================
// ================================================================== 

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';

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
        this.isScanning = false;
        this.isSearching = false;
        this.scanProgress = 0;
        this.sortOrder = 'relevance'; // Default sort order
        this.currentFilter = 'all'; // Track current category filter
        this._cachedSearchTerms = null; // Cache for search terms
        this.scanTotal = 0;
        this.scanStatusText = "Scanning Token Images...";
        this.notificationIcon = null;
        this.notificationText = null;
        
        // Window state management - let Foundry handle it automatically
        this.windowState = {
            width: 700,
            height: 550,
            left: null,
            top: null
        };
        
        // Tag filtering system
        this.selectedTags = new Set(); // Track which tags are currently selected as filters
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
     * UNIFIED MATCHING METHOD
     * Determines whether to use relevance mode or browse mode based on context
     * 
     * @param {Array} filesToSearch - Files to search through
     * @param {Array|string} searchTerms - Search terms (array for token, string for search)
     * @param {Object} tokenDocument - Token document for context weighting
     * @param {string} searchMode - 'token', 'search', or 'browse'
     * @returns {Array} Scored and filtered results
     */
    _applyUnifiedMatching(filesToSearch, searchTerms = null, tokenDocument = null, searchMode = 'browse') {
        const results = [];
        
        // BROWSE MODE: No relevance scoring, just return all files
        if (searchMode === 'browse' || !searchTerms) {
            return filesToSearch.map(file => ({
                ...file,
                searchScore: 0.5, // Neutral score for browsing
                isCurrent: false,
                metadata: file.metadata || null
            }));
        }
        
        // RELEVANCE MODE: Use sophisticated scoring
        const threshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        
        for (const fileInfo of filesToSearch) {
            const relevanceScore = this._calculateRelevanceScore(fileInfo, searchTerms, tokenDocument, searchMode);
            
            // Only include results above threshold
            if (relevanceScore >= threshold) {
                results.push({
                    ...fileInfo,
                    searchScore: relevanceScore,
                    isCurrent: false,
                    metadata: fileInfo.metadata || null
                });
            }
        }
        
        // Sort by relevance score (highest first)
        results.sort((a, b) => b.searchScore - a.searchScore);
        
        return results;
    }


    /**
     * Apply category filter to search results
     */
    _getFilteredFiles() {
        // Get all files from cache
        const allFiles = Array.from(TokenImageReplacement.cache.files.values());
        // Apply category filter to get the subset of files to search
        if (this.currentFilter === 'all') {
            return allFiles;
        }
        
        // Cache search terms for "selected" filter to avoid repeated calls
        let processedTerms = null;
        if (this.currentFilter === 'selected' && this.selectedToken) {
            const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
            processedTerms = searchTerms
                .filter(term => term && term.length >= 2)
                .map(term => term.toLowerCase());
        }
        
        return allFiles.filter(file => {
            const path = file.path || '';
            const fileName = file.name || '';
            
            // Check if the file matches the current category filter
            switch (this.currentFilter) {
                case 'selected':
                    // Only show files that match the selected token's characteristics
                    if (!this.selectedToken || !processedTerms) return false;
                    
                    // Check if file matches any of the token's search terms
                    const fileText = `${path} ${fileName}`.toLowerCase();
                    return processedTerms.some(term => fileText.includes(term));
                default:
                    // For category filters (adventurers, adversaries, creatures, npcs, spirits), 
                    // check if file is in that top-level folder
                    const pathParts = path.split('/');
                    const topLevel = pathParts[0];
                    return topLevel && topLevel.toLowerCase() === this.currentFilter;
            }
        });
    }

    _applyCategoryFilter(results) {
        if (this.currentFilter === 'all') {
            return results;
        }
        
        return results.filter(result => {
            const path = result.path || '';
            const fileName = result.name || '';
            
            // Check if the result matches the current category filter
            switch (this.currentFilter) {
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
                        if (files.includes(fileName) && creatureType.toLowerCase().includes(searchTerm)) {
                            score += 90; // Creature type match
                            foundMatch = true;
                            break;
                        }
                    }
                    
                    // Search by folder categorization
                    for (const [folderPath, files] of TokenImageReplacement.cache.folders.entries()) {
                        if (files.includes(fileName)) {
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
                        name: fileInfo.name,
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
        // Check if the main system is scanning
        const systemScanning = TokenImageReplacement.cache.isScanning;
        
        // Calculate progress percentage
        let progressPercentage = 0;
        if (this.scanTotal > 0 && this.scanProgress > 0) {
            progressPercentage = Math.round((this.scanProgress / this.scanTotal) * 100);
        }
        
        return {
            selectedToken: this.selectedToken,
            matches: this.matches,
            isScanning: this.isScanning || systemScanning,
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
            cacheStatus: getSettingSafely(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus', 'Cache status not available')
        };
    }


    activateListeners(html) {
        super.activateListeners(html);


        // Thumbnail clicks
        html.find('.tir-thumbnail-item').on('click', this._onSelectImage.bind(this));
        
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
        
        // Threshold slider
        html.find('.tir-rangeslider-input').on('input', this._onThresholdSliderChange.bind(this));
        
        // Initialize threshold slider with current value
        this._initializeThresholdSlider();
    }


    async _findMatches() {
        // Reset results
        this.matches = [];
        this.allMatches = [];
        this.currentPage = 0;
        this.recommendedToken = null; // Reset recommended token

        // If we have a selected token, add it as the first match
        if (this.selectedToken) {
        const currentImageSrc = this.selectedToken.texture?.src || this.selectedToken.document.texture?.src || '';
            if (currentImageSrc) {
        const currentImage = {
                    name: currentImageSrc.split('/').pop() || 'Unknown',
            fullPath: currentImageSrc,
                    searchScore: 0, // Will be calculated normally
                    isCurrent: true,
                    metadata: null
        };
                this.allMatches.push(currentImage);
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Added current image to results", `Name: ${currentImage.name}, isCurrent: ${currentImage.isCurrent}`, true, false);
            }
        }

        // Check cache status
        if (TokenImageReplacement.cache.isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (TokenImageReplacement.cache.isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'The Cache is currently loading and may impact performance.';
        } else if (TokenImageReplacement.cache.files.size === 0) {
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'No Cache Found - Please refresh cache.';
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
                
                if (this.currentFilter === 'selected' && this.selectedToken) {
                    // SELECTED TAB: Use token-based matching
                    searchMode = 'token';
                    searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
                    tokenDocument = this.selectedToken.document;
                } else if (this.searchTerm && this.searchTerm.length >= 3) {
                    // SEARCH MODE: Use search term matching
                    searchMode = 'search';
                    searchTerms = this.searchTerm;
                }
                // Otherwise: BROWSE MODE (no search terms)
                
                // Apply unified matching
                const matchedResults = this._applyUnifiedMatching(tagFilteredFiles, searchTerms, tokenDocument, searchMode);
                
                // Filter out any results that are the current image to avoid duplicates
                const filteredResults = matchedResults.filter(result => !result.isCurrent);
                this.allMatches.push(...filteredResults);
                
                // Calculate score for current image if it exists
                if (this.selectedToken && this.allMatches.length > 0) {
                    const currentImage = this.allMatches.find(match => match.isCurrent);
                    if (currentImage) {
                        const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken);
                        const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                            name: currentImage.name,
                            path: currentImage.fullPath,
                            metadata: currentImage.metadata
                        };
                        currentImage.searchScore = this._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token');
                        
                        // Note: Current image (selected token) is always shown regardless of threshold
                        // The threshold only affects other matching images, not the selected token itself
                    }
                }
                
                // Sort results based on current sort order
                this.allMatches = this._sortResults(this.allMatches);
                
                // Calculate recommended token for Selected tab
                if (this.currentFilter === 'selected' && this.selectedToken && this.allMatches.length > 1) {
                    this.recommendedToken = this._calculateRecommendedToken();
                }
            }
        }
        
        // Apply pagination to show only first batch
        this._applyPagination();
        
        // Update results to show proper tags
        this._updateResults();
    }

    async _onSelectImage(event) {
        const imagePath = event.currentTarget.dataset.imagePath;
        const imageName = event.currentTarget.dataset.imageName;
        const isQuickApply = event.target.closest('[data-quick-apply="true"]');
        const isCurrentImage = event.currentTarget.classList.contains('tir-current-image');
        
        if (!this.selectedToken || !imagePath) return;

        // Don't allow clicking on current image
        if (isCurrentImage) {
            return;
        }

        // Handle quick apply for recommended token
        if (isQuickApply) {
            event.stopPropagation();
            await this._applyImageToToken(imagePath, imageName);
            return;
        }

        await this._applyImageToToken(imagePath, imageName);
    }

    /**
     * Apply an image to the selected token
     */
    async _applyImageToToken(imagePath, imageName) {
        try {
            await this.selectedToken.document.update({
                'texture.src': imagePath
            });
            
            // Refresh the selected token object to get the updated image
            this.selectedToken = canvas.tokens.get(this.selectedToken.id);
            
            // Refresh the matches to update current image highlighting
            await this._findMatches();
            
            ui.notifications.info(`Applied image: ${imageName}`);
            this.render();
        } catch (error) {
            ui.notifications.error(`Failed to apply image: ${error.message}`);
        }
    }

    async _onScanImages() {
        this.isScanning = true;
        this.scanProgress = 0;
        this.scanTotal = 0;
        this.render();

        try {
            await TokenImageReplacement.scanForImages();
            ui.notifications.info("Image scan completed");
        } catch (error) {
            ui.notifications.error(`Image scan failed: ${error.message}`);
        } finally {
            this.isScanning = false;
            this.render();
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
        this.isScanning = true;
        this.scanProgress = current;
        this.scanTotal = total;
        if (statusText) {
            this.scanStatusText = statusText;
        }
        this.render();
    }

    // Method to complete scan
    completeScan() {
        this.isScanning = false;
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
                    postConsoleAndNotification(MODULE.NAME, 'Token Image Replacement: Registering controlToken hook', 'token-image-replacement-selection', false, false);
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
        // Remove token selection hook
        if (this._tokenHookRegistered && this._tokenHookId) {
            HookManager.removeCallback(this._tokenHookId);
            this._tokenHookRegistered = false;
            this._tokenHookId = null;
        }
        return super.close(options);
    }

    async _onTokenSelectionChange(token, controlled) {
        // Only proceed if it's a GM (token image replacement is a GM tool)
        if (!game.user.isGM) {
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Token ${token.name} ${controlled ? 'selected' : 'deselected'}`, 'token-image-replacement-selection', false, false);
        
        // Handle token switching when window is already open
        await this._handleTokenSwitch();
    }

    /**
     * Handle token switching when window is already open
     * Preserves current tab and search criteria
     */
    async _handleTokenSwitch() {
        try {
            // Store current state before switching
            const currentSearchTerms = this._cachedSearchTerms;
            
            // Get the newly selected token
            const selectedTokens = canvas?.tokens?.controlled || [];
            
            if (selectedTokens.length > 0) {
                this.selectedToken = selectedTokens[0];
                
                // When a token is selected, switch to "selected" tab and update results
                this.currentFilter = 'selected';
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache empty, cannot perform search`, "", false, false);
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
                    name: currentImageSrc.split('/').pop() || 'Unknown',
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
        const searchResults = this._applyUnifiedMatching(tagFilteredFiles, searchTerm, null, 'search');
        
        // Filter out any results that are the current image to avoid duplicates
        const filteredResults = searchResults.filter(result => !result.isCurrent);
        this.allMatches.push(...filteredResults);
        
        // Step 4: Calculate score for current image if it exists
        if (this.selectedToken && this.allMatches.length > 0) {
            const currentImage = this.allMatches.find(match => match.isCurrent);
            if (currentImage) {
                const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken);
                const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                    name: currentImage.name,
                    path: currentImage.fullPath,
                    metadata: currentImage.metadata
                };
                currentImage.searchScore = this._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token');
                
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
                    if (files.includes(fileName)) {
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
                    if (files.includes(fileName)) {
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
                const extension = fileInfo.name.split('.').pop().toLowerCase();
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
                        name: fileInfo.name,
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
                this.allMatches.push(...filteredBatchResults);
                
                // Sort results based on current sort order
                this.allMatches = this._sortResults(this.allMatches);
                
                // Update display with new results
                this._applyPagination();
                this._updateResults();
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
            const aggregatedTags = this._getAggregatedTags();
            const tagHtml = aggregatedTags.map(tag => {
                const isSelected = this.selectedTags.has(tag);
                const selectedClass = isSelected ? ' selected' : '';
                return `<span class="tir-search-tools-tag${selectedClass}" data-search-term="${tag}">${tag}</span>`;
            }).join('');
            $element.find('#tir-search-tools-tag-container').html(tagHtml);
            
            // Note: Do not call this.render() here as it overwrites the DOM updates
            
            // Show/hide tags row based on whether there are tags
            if (aggregatedTags.length > 0) {
                $element.find('#tir-search-tools-tag-container').show();
            } else {
                $element.find('#tir-search-tools-tag-container').hide();
            }
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
            
            // Also show the results for browsing
            if (this.matches.length > 0) {
                html += this.matches.map(match => {
                    const tags = this._getTagsForMatch(match);
                    const tooltipText = this._generateTooltipText(match, false);
                    const scorePercentage = match.searchScore ? Math.round(match.searchScore * 100) : 0;
                    return `
                        <div class="tir-thumbnail-item ${match.isCurrent ? 'tir-current-image' : ''}" data-image-path="${match.fullPath}" data-tooltip="${tooltipText}" data-image-name="${match.name}">
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
                            </div>
                            <div class="tir-thumbnail-name">${match.name}</div>
                            <div class="tir-thumbnail-score">${scorePercentage}% Match</div>
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
            return `
                <!-- Show "No Matches" message -->
                <div class="tir-thumbnail-item tir-no-matches">
                    <!-- Image -->
                    <div class="tir-no-matches-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <!-- Description -->
                    <div class="tir-no-matches-text">
                        <p>No alternative images found for this token</p>
                        <p><span class="tir-thumbnail-tag">NO MATCHES</span></p>
                    </div>
                </div>
            `;
        }
        // ***** BUILD: MATCHING RESULT *****
        return this.matches.map(match => {
            const tags = this._getTagsForMatch(match);
            const isRecommended = this.recommendedToken && match.fullPath === this.recommendedToken.fullPath;
            const recommendedClass = isRecommended ? 'tir-recommended-image' : '';
            
            // Debug logging for recommended token display 
            if (this.recommendedToken) {
                postConsoleAndNotification(MODULE.NAME, `Image Replacement | Checking match`, `${match.name} (${match.fullPath}) against recommended ${this.recommendedToken.name} (${this.recommendedToken.fullPath}) - isRecommended: ${isRecommended}`, true, false);
            }
            
            const tooltipText = this._generateTooltipText(match, isRecommended);
            const scorePercentage = match.searchScore ? Math.round(match.searchScore * 100) : 0;
            
            return `
                <div class="tir-thumbnail-item ${match.isCurrent ? 'tir-current-image' : ''} ${recommendedClass}" data-image-path="${match.fullPath}" data-tooltip="${tooltipText}" data-image-name="${match.name}">
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
                        ` : `
                            <div class="tir-thumbnail-overlay">
                                <i class="fas fa-check"></i>
                                <span class="tir-overlay-text">Apply to Token</span>
                            </div>
                        `}
                    </div>
                    <div class="tir-thumbnail-name">${match.name}</div>
                    <div class="tir-thumbnail-score">${scorePercentage}% Match</div>
                    <div class="tir-thumbnail-tagset">
                        ${tags.map(tag => `<span class="tir-thumbnail-tag">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    _getTagsForMatch(match) {
        const tags = [];
        
        // Debug: Log for current image to track the issue
        if (match.isCurrent) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - Processing current image: ${match.name}`, `isCurrent: ${match.isCurrent}`, true, false);
        }
        
        // Debug: Only log for problematic files to avoid spam
        if (match.name.includes('HALFORC') || match.name.includes('CORE')) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - _getTagsForMatch called for ${match.name}`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - Has metadata: ${!!match.metadata}`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - Tags: ${match.metadata && match.metadata.tags ? match.metadata.tags.join(', ') : 'none'}`, "", true, false);
        }
        
        // Add current image tag if applicable
        if (match.isCurrent) {
            tags.push('CURRENT IMAGE');
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Added CURRENT IMAGE tag to ${match.name}`, "", true, false);
        }
        
        // Only use metadata-based tags - no fallbacks
        if (match.metadata && match.metadata.tags && match.metadata.tags.length > 0) {
            // Add metadata tags (already processed and formatted)
            match.metadata.tags.forEach(tag => {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            });
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Using metadata tags for ${match.name}: ${match.metadata.tags.join(', ')}`, "", true, false);
        } else {
            // No fallback - this is a critical error that needs to be fixed
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: CRITICAL ERROR - No metadata available for ${match.name}. The scanning process is broken.`, "", false, false);
            console.error(`Token Image Replacement: Missing metadata for file: ${match.name}`, match);
            // Return empty array - no tags means no display
            return [];
        }
        
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
            this.allMatches = this._applyUnifiedMatching(tagFilteredFiles, this.searchTerm, null, 'search');
        } else {
            this.allMatches = this._applyUnifiedMatching(tagFilteredFiles, null, null, 'browse');
        }
        
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
            if (files.includes(fileName)) {
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

    /**
     * WEIGHTED RELEVANCE SCORING ALGORITHM
     * This method provides consistent scoring across all matching scenarios with configurable weights:
     * - Token drop (automatic replacement)
     * - Selected tab (manual selection)
     * - Search mode (any tab + search terms)
     * 
     * @param {Object} fileInfo - The file information object
     * @param {Array|string} searchTerms - Search terms (array for token matching, string for search)
     * @param {Object} tokenDocument - The token document (for context weighting)
     * @param {string} searchMode - 'token' for token matching, 'search' for search terms
     * @returns {number} Relevance score (0.0 to 1.0)
     */
    _calculateRelevanceScore(fileInfo, searchTerms, tokenDocument = null, searchMode = 'search') {
        const fileName = fileInfo.name || '';
        const fileNameLower = fileName.toLowerCase();
        const filePath = fileInfo.path || '';
        const filePathLower = filePath.toLowerCase();
        
        // Get weighted settings
        const weights = {
            representedActor: (game.settings.get(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor') || 80) / 100,
            creatureType: (game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureType') || 15) / 100,
            creatureSubtype: (game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype') || 15) / 100,
            equipment: (game.settings.get(MODULE.ID, 'tokenImageReplacementWeightEquipment') || 10) / 100,
            size: (game.settings.get(MODULE.ID, 'tokenImageReplacementWeightSize') || 3) / 100,
            tokenName: (game.settings.get(MODULE.ID, 'tokenImageReplacementWeightTokenName') || 20) / 100
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
        
        if (searchWords.length === 0) return 0;
        
        // Extract token data for weighted scoring
        let tokenData = {};
        if (tokenDocument && searchMode === 'token') {
            tokenData = TokenImageReplacement._extractTokenData(tokenDocument);
            
        }
        
        // Calculate maximum possible score upfront (only for applicable token data points)
        let maxPossibleScore = 0;
        if (searchMode === 'token' && tokenData) {
            // Token Name weight (always applicable if token has a name)
            if (tokenDocument && tokenDocument.name) {
                maxPossibleScore += weights.tokenName;
            }
            
            // Only add weights for token data that actually exists
            if (tokenData.representedActor) maxPossibleScore += weights.representedActor;
            if (tokenData.creatureType) maxPossibleScore += weights.creatureType;
            if (tokenData.creatureSubtype) maxPossibleScore += weights.creatureSubtype;
            if (tokenData.equipment && tokenData.equipment.length > 0) maxPossibleScore += weights.equipment;
            if (tokenData.size) maxPossibleScore += weights.size;
        }
        
        // Add search terms weight (1.0 per term) - this is the main scoring mechanism
        maxPossibleScore += searchWords.length;
        
        // Add multi-word bonus potential (only if applicable)
        if (searchWords.length > 1) {
            maxPossibleScore += 0.2;
        }
        
        // Add basic creature priority bonus potential (only if applicable)
        if (searchMode === 'token' && tokenData && tokenData.representedActor) {
            maxPossibleScore += 0.1;
        }
        
        // If no token data exists, ensure we have a reasonable max score based on search terms
        if (maxPossibleScore < searchWords.length) {
            maxPossibleScore = searchWords.length + (searchWords.length > 1 ? 0.2 : 0);
        }
        
        
        // 1. TOKEN DATA WEIGHTED SCORING (for token matching mode)
        let tokenNameMatch = 0;
        if (searchMode === 'token' && tokenData) {
            // Token Name (flexible matching for any naming convention)
            if (tokenDocument && tokenDocument.name) {
                tokenNameMatch = this._calculateTokenNameMatch(tokenDocument.name, fileNameLower, filePathLower, fileInfo);
                if (tokenNameMatch > 0) {
                    totalScore += tokenNameMatch * weights.tokenName;
                    foundMatch = true;
                }
                
            }
            
            // Represented Actor (most important)
            if (tokenData.representedActor) {
                const actorMatch = this._calculateTokenDataMatch(tokenData.representedActor, fileNameLower, filePathLower, fileInfo);
                if (actorMatch > 0) {
                    totalScore += actorMatch * weights.representedActor;
                    foundMatch = true;
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
        
        // 2. SEARCH TERMS SCORING (for search mode or fallback)
        if (searchMode === 'search' || !foundMatch) {
            for (const word of searchWords) {
                let wordScore = 0;
                let wordFound = false;
                
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
                    wordScore = 0.65;
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
                
                // Metadata matching
                if (fileInfo.metadata && fileInfo.metadata.tags) {
                    for (const tag of fileInfo.metadata.tags) {
                        const tagLower = tag.toLowerCase();
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
                    }
                }
                
                // Folder path matching
                if (filePathLower.includes(word)) {
                    if (filePathLower.includes(`/${word}/`)) {
                        wordScore = Math.max(wordScore, 0.6);
                    } else {
                        wordScore = Math.max(wordScore, 0.4);
                    }
                    wordFound = true;
                }
                
                if (wordFound) {
                    totalScore += wordScore;
                    foundMatch = true;
                }
            }
        }
        
        // Multi-word bonus
        if (foundMatch && searchWords.length > 1) {
            const matchedWords = searchWords.filter(word => {
                const fileNameWords = fileNameLower.split(/[\s\-_()]+/);
                return fileNameWords.some(fw => fw.includes(word) || word.includes(fw)) ||
                       (fileInfo.metadata && fileInfo.metadata.tags && 
                        fileInfo.metadata.tags.some(tag => tag.toLowerCase().includes(word))) ||
                       (filePathLower.includes(word));
            });
            
            if (matchedWords.length === searchWords.length) {
                totalScore += 0.2;
            }
        }
        
        // Basic creature priority bonus
        if (foundMatch && this._isBasicCreature(fileName, fileInfo)) {
            totalScore += 0.1;
        }
        
        // Debug logging for scoring issues
        if (fileNameLower.includes('brown') && fileNameLower.includes('bear')) {
            postConsoleAndNotification(MODULE.NAME, `DEBUG SCORING for ${fileName}`, `totalScore: ${totalScore.toFixed(3)}, maxPossibleScore: ${maxPossibleScore.toFixed(3)}, finalScore: ${(totalScore / maxPossibleScore).toFixed(3)}`, true, false);
        }
        
        // Normalize score to 0.0-1.0 range
        const finalScore = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
        let clampedScore = Math.min(Math.max(finalScore, 0), 1);
        
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
     * @param {string} tokenValue - The token data value to match
     * @param {string} fileNameLower - Lowercase filename
     * @param {string} filePathLower - Lowercase file path
     * @param {Object} fileInfo - File information object
     * @returns {number} Match score (0.0 to 1.0)
     */
    _calculateTokenDataMatch(tokenValue, fileNameLower, filePathLower, fileInfo) {
        if (!tokenValue) return 0;
        
        const valueLower = tokenValue.toLowerCase();
        let maxScore = 0;
        
        // Filename matching
        if (fileNameLower === valueLower) {
            maxScore = Math.max(maxScore, 1.0);
        } else if (fileNameLower.startsWith(valueLower)) {
            maxScore = Math.max(maxScore, 0.9);
        } else if (fileNameLower.endsWith(valueLower)) {
            maxScore = Math.max(maxScore, 0.8);
        } else if (fileNameLower.includes(valueLower)) {
            maxScore = Math.max(maxScore, 0.7);
        } else {
            // Partial word match
            const fileNameWords = fileNameLower.split(/[\s\-_()]+/);
            for (const fileNameWord of fileNameWords) {
                if (fileNameWord.includes(valueLower) || valueLower.includes(fileNameWord)) {
                    maxScore = Math.max(maxScore, 0.6);
                }
            }
        }
        
        // Metadata matching
        if (fileInfo.metadata && fileInfo.metadata.tags) {
            for (const tag of fileInfo.metadata.tags) {
                const tagLower = tag.toLowerCase();
                if (tagLower === valueLower) {
                    maxScore = Math.max(maxScore, 0.95);
                } else if (tagLower.startsWith(valueLower)) {
                    maxScore = Math.max(maxScore, 0.85);
                } else if (tagLower.includes(valueLower)) {
                    maxScore = Math.max(maxScore, 0.75);
                }
            }
        }
        
        // Specific metadata fields
        if (fileInfo.metadata) {
            const metadataFields = [
                'creatureType', 'subtype', 'specificType', 'weapon', 'armor', 
                'equipment', 'pose', 'action', 'direction', 'quality', 'class', 'profession'
            ];
            
            for (const field of metadataFields) {
                const value = fileInfo.metadata[field];
                if (value && typeof value === 'string') {
                    const fieldValueLower = value.toLowerCase();
                    if (fieldValueLower === valueLower) {
                        maxScore = Math.max(maxScore, 0.9);
                    } else if (fieldValueLower.startsWith(valueLower)) {
                        maxScore = Math.max(maxScore, 0.8);
                    } else if (fieldValueLower.includes(valueLower)) {
                        maxScore = Math.max(maxScore, 0.7);
                    }
                }
            }
        }
        
        // Folder path matching
        if (filePathLower.includes(valueLower)) {
            if (filePathLower.includes(`/${valueLower}/`)) {
                maxScore = Math.max(maxScore, 0.6);
            } else {
                maxScore = Math.max(maxScore, 0.4);
            }
        }
        
        return maxScore;
    }

    /**
     * Calculate match score for token name (flexible matching for any naming convention)
     * @param {string} tokenName - The token name (e.g., "Bob (Creature)", "Creature 1", "Bob")
     * @param {string} fileNameLower - Lowercase filename
     * @param {string} filePathLower - Lowercase file path
     * @param {Object} fileInfo - File information object
     * @returns {number} Match score (0.0 to 1.0)
     */
    _calculateTokenNameMatch(tokenName, fileNameLower, filePathLower, fileInfo) {
        if (!tokenName) return 0;
        
        const tokenNameLower = tokenName.toLowerCase();
        let maxScore = 0;
        
        // Debug: Log token name matching attempt
        
        // Extract potential creature names from token name
        const potentialCreatureNames = [];
        
        // 1. Check for parentheses: "Bob (Creature)" -> "Creature"
        const parenMatch = tokenNameLower.match(/\(([^)]+)\)/);
        if (parenMatch) {
            const parenContent = parenMatch[1].trim();
            potentialCreatureNames.push(parenContent); // Add the whole parenthetical content
        }
        
        // 2. Check for numbers: "Creature 1" -> "Creature"
        const numberMatch = tokenNameLower.match(/^([a-z]+)\s+\d+$/);
        if (numberMatch) {
            potentialCreatureNames.push(numberMatch[1]);
        }
        
        // 3. Check for "the": "Bob the Creature" -> "Creature"
        const theMatch = tokenNameLower.match(/\bthe\s+([a-z]+)$/);
        if (theMatch) {
            potentialCreatureNames.push(theMatch[1]);
        }
        
        // 4. If no patterns match, try splitting by spaces and taking the last word
        if (potentialCreatureNames.length === 0) {
            const words = tokenNameLower.split(/\s+/);
            if (words.length > 1) {
                potentialCreatureNames.push(words[words.length - 1]);
            } else {
                potentialCreatureNames.push(tokenNameLower);
            }
        }
        
        // Remove duplicates and filter out common words
        const uniqueNames = [...new Set(potentialCreatureNames)].filter(name => 
            name.length >= 2 && 
            !['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for'].includes(name)
        );
        
        // Debug: Log extracted creature names
        
        // Test each potential creature name against the file
        for (const creatureName of uniqueNames) {
            // Filename matching
            if (fileNameLower === creatureName) {
                maxScore = Math.max(maxScore, 1.0);
            } else if (fileNameLower.startsWith(creatureName)) {
                maxScore = Math.max(maxScore, 0.9);
            } else if (fileNameLower.endsWith(creatureName)) {
                maxScore = Math.max(maxScore, 0.8);
            } else if (fileNameLower.includes(creatureName)) {
                maxScore = Math.max(maxScore, 0.7);
            } else {
                // Partial word match
                const fileNameWords = fileNameLower.split(/[\s\-_()]+/);
                for (const fileNameWord of fileNameWords) {
                    if (fileNameWord.includes(creatureName) || creatureName.includes(fileNameWord)) {
                        maxScore = Math.max(maxScore, 0.6);
                    }
                }
            }
            
            // Metadata matching
            if (fileInfo.metadata && fileInfo.metadata.tags) {
                for (const tag of fileInfo.metadata.tags) {
                    const tagLower = tag.toLowerCase();
                    if (tagLower === creatureName) {
                        maxScore = Math.max(maxScore, 0.95);
                    } else if (tagLower.startsWith(creatureName)) {
                        maxScore = Math.max(maxScore, 0.85);
                    } else if (tagLower.includes(creatureName)) {
                        maxScore = Math.max(maxScore, 0.75);
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
        const $value = $slider.find('.tir-rangeslider-value');
        
        $fill.css('width', `${percentage}%`);
        $thumb.css('left', `${percentage}%`);
        $value.text(`${percentage}%`);
        
        // Update the setting
        await game.settings.set(MODULE.ID, 'tokenImageReplacementThreshold', threshold);
        
        // Refresh results with new threshold
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
        
        // Basic info
        parts.push(`<strong>${match.name}</strong>`);
        parts.push(`Path: ${match.fullPath}`);
        
        // Score info
        if (match.searchScore !== undefined) {
            parts.push(`Score: ${match.searchScore.toFixed(3)}`);
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
     * Uses the same logic as _findBestMatch but works with the current results
     */
    _calculateRecommendedToken() {
        if (!this.selectedToken || this.allMatches.length === 0) {
            postConsoleAndNotification(MODULE.NAME, 'Image Replacement | Recommended calculation', 'No selected token or no matches for recommended calculation', true, false);
            return null;
        }
        
        const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
        const threshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        
        postConsoleAndNotification(MODULE.NAME, 'Image Replacement | Recommended calculation', `Search terms: ${JSON.stringify(searchTerms)}, Threshold: ${threshold}, Total matches: ${this.allMatches.length}`, true, false);
        
        let bestMatch = null;
        let bestScore = 0;
        
        // Find the best match from current results (excluding current image)
        console.log(`DEBUG: Starting to process ${this.allMatches.length} matches for recommended token`);
        for (const match of this.allMatches) {
            if (match.isCurrent) {
                console.log(`DEBUG: Skipping current image: ${match.name}`);
                continue; // Skip current image
            }
            
            // Get file info from cache with robust lookup
            const fileInfo = this._getFileInfoFromCache(match.name);
            if (!fileInfo) {
                console.log(`DEBUG: No fileInfo found for match: ${match.name}`);
                console.log(`DEBUG: Match object keys: ${Object.keys(match)}`);
                console.log(`DEBUG: Cache files size: ${TokenImageReplacement.cache.files.size}`);
                console.log(`DEBUG: First few cache keys: ${Array.from(TokenImageReplacement.cache.files.keys()).slice(0, 5)}`);
                // Try using the match object directly as fallback
                console.log(`DEBUG: Using match object directly as fallback`);
                const score = this._calculateRelevanceScore(match, searchTerms, this.selectedToken.document, 'token');
                console.log(`DEBUG: Match "${match.name}" scored ${score.toFixed(3)} (threshold: ${threshold}) using match object`);
                
                if (score > bestScore && score >= threshold) {
                    bestScore = score;
                    bestMatch = match;
                    console.log(`DEBUG: New best match: "${match.name}" with score ${score.toFixed(3)}`);
                }
                continue;
            }
            
            // Calculate score using unified algorithm
            const score = this._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token');
            
            console.log(`DEBUG: Match "${match.name}" scored ${score.toFixed(3)} (threshold: ${threshold})`);
            
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = match;
                postConsoleAndNotification(MODULE.NAME, 'Image Replacement | Recommended calculation', `New best match: ${match.name} with score ${score.toFixed(3)}`, true, false);
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, 'Image Replacement | Recommended calculation', `Recommended token result: ${bestMatch ? bestMatch.name : 'NONE'} (score: ${bestScore.toFixed(3)})`, true, false);
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
                const fileCreatureType = fileInfo.metadata.creatureType.toLowerCase();
                if (tokenType.includes(fileCreatureType) || fileCreatureType.includes(tokenType)) {
                    contextBonus += 25; // Strong creature type match
                }
            }
            
            // Check subtype matches
            if (fileInfo.metadata.subtype) {
                const fileSubtype = fileInfo.metadata.subtype.toLowerCase();
                if (tokenName.includes(fileSubtype) || fileSubtype.includes(tokenName)) {
                    contextBonus += 20; // Subtype match
                }
            }
            
            // Check class/profession matches
            if (fileInfo.metadata.class || fileInfo.metadata.profession) {
                const fileClass = (fileInfo.metadata.class || '').toLowerCase();
                const fileProfession = (fileInfo.metadata.profession || '').toLowerCase();
                
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
                const fileSize = fileInfo.metadata.size.toLowerCase();
                const tokenSize = (tokenSystem.traits?.size || '').toLowerCase();
                if (fileSize === tokenSize) {
                    contextBonus += 15; // Size match
                }
            }
            
            // Check weapon/armor matches
            if (fileInfo.metadata.weapon || fileInfo.metadata.armor) {
                const fileWeapon = (fileInfo.metadata.weapon || '').toLowerCase();
                const fileArmor = (fileInfo.metadata.armor || '').toLowerCase();
                
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
            
            // Toggle the active state
            $button.toggleClass('active');
            
            // Toggle tag container visibility
            if ($button.hasClass('active')) {
                $tagContainer.show();
            } else {
                $tagContainer.hide();
            }
        }
    }

    async _onCategoryFilterClick(event) {
        const category = event.currentTarget.dataset.category;
        if (!category || category === this.currentFilter) return;
        
        // Update active filter
        const $element = this.element;
        if ($element) {
            // Remove active class from all filter categories
            $element.find('#tir-filter-category-container .tir-filter-category').removeClass('active');
            $(event.currentTarget).addClass('active');
            
            // Set new filter
            this.currentFilter = category;
            this._cachedSearchTerms = null; // Clear cache when filter changes
            
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
     * Sort results based on current sort order
     */
    _sortResults(results) {
        if (!results || results.length === 0) return results;
        
        return results.sort((a, b) => {
            // Always keep current image at top
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

    _getCategories() {
        // Generate categories from existing folder structure
        const topLevelFolders = new Map();
        
        // Extract top-level folders from the folder cache
        for (const folderPath of TokenImageReplacement.cache.folders.keys()) {
            const pathParts = folderPath.split('/');
            const topLevel = pathParts[0];
            
            // Skip ignored folders
            if (topLevel && !TokenImageReplacement._isFolderIgnored(topLevel)) {
                const files = TokenImageReplacement.cache.folders.get(folderPath);
                const currentCount = topLevelFolders.get(topLevel) || 0;
                topLevelFolders.set(topLevel, currentCount + files.length);
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
                    const path = file.path || '';
                    const pathParts = path.split('/');
                    const topLevel = pathParts[0];
                    return topLevel && topLevel.toLowerCase() === this.currentFilter;
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
                .sort((a, b) => b[1] - a[1]) // Sort by count descending
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
            
            // Sort by frequency and return all tags
            return Array.from(tagCounts.entries())
                .sort((a, b) => {
                    // Selected tags should appear first, then by frequency
                    const aIsSelected = this.selectedTags.has(a[0]);
                    const bIsSelected = this.selectedTags.has(b[0]);
                    if (aIsSelected && !bIsSelected) return -1;
                    if (!aIsSelected && bIsSelected) return 1;
                    return b[1] - a[1]; // Sort by count descending
                })
                .map(([tag]) => tag); // Return just the tag names
        }
    }

}

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
        totalFiles: 0,             // total count for progress tracking
        overallProgress: 0,        // current step in overall process
        totalSteps: 0,             // total steps in overall process
        currentStepName: '',       // name of current step/folder
        currentStepProgress: 0,    // current item in current step
        currentStepTotal: 0,       // total items in current step
        currentPath: '',           // remaining folder path (e.g., "Creatures | Humanoid")
        currentFileName: ''        // current file being processed
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
        return ignoredFolders.includes(folderName.toLowerCase());
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
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Monster mapping data already loaded", "", false, false);
                return;
            }
            
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Loading monster mapping data...", "", false, false);
            
            // Load monster mapping from resources
            const response = await fetch('modules/coffee-pub-blacksmith/resources/monster-mapping.json');
            if (response.ok) {
                const monsterData = await response.json();
                await game.settings.set(MODULE.ID, 'monsterMappingData', monsterData);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Loaded monster mapping data with ${Object.keys(monsterData.monsters).length} monsters`, "", false, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Failed to load monster mapping data - HTTP ${response.status}`, "", false, false);
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

        // 1. Represented Actor (most important)
        if (actor.name) {
            // The actor name IS the creature type
            // Examples: "Creature" -> "Creature"
            //          "Creature Warrior" -> "Creature Warrior" (use first word)
            const name = actor.name;
            const words = name.split(/\s+/);
            data.representedActor = words[0]; // First word is the creature type
            
        }

        // 2. Creature Type (Official D&D5e field)
        if (actor.system?.details?.type?.value) {
            data.creatureType = actor.system.details.type.value.toLowerCase();
        }

        // 3. Creature Subtype (Official D&D5e field)
        if (actor.system?.details?.type?.subtype) {
            data.creatureSubtype = actor.system.details.type.subtype.toLowerCase();
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
        if (actor.system?.details?.background) {
            data.background = actor.system.details.background.toLowerCase();
        }

        // 6. Size (from actor size or token scale)
        if (actor.system?.traits?.size) {
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
        }


        return data;
    }

    /**
     * Test the weighted scoring system with example data
     * Call this from console: TokenImageReplacement.testWeightedScoring()
     */
    static testWeightedScoring() {
        console.log("=== WEIGHTED SCORING TEST ===");
        
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
        
        console.log("Test Token Data:", testTokenData);
        console.log("Test Files:", testFiles.map(f => f.name));
        console.log("");
        
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
            const score = TokenImageReplacement.prototype._calculateRelevanceScore.call(
                TokenImageReplacement.prototype, 
                fileInfo, 
                searchTerms, 
                mockTokenDocument, 
                'token'
            );
            
            console.log(`${fileInfo.name}: ${(score * 100).toFixed(1)}% match`);
        }
        
        console.log("");
        console.log("Expected: Bullywug should score highest, Sea Serpent lowest");
        console.log("=== END TEST ===");
    }

    /**
     * Debug the scoring system
     * Call this from console: TokenImageReplacement.debugScoring()
     */
    static debugScoring() {
        console.log("=== DEBUG SCORING ===");
        
        // Create mock token document for "Test (Creature)"
        const mockTokenDocument = {
            name: "Test (Creature)", // Token name has parentheses
            actor: {
                name: "Creature", // Actor name is just the creature type
                type: "humanoid",
                items: [],
                system: {
                    traits: { size: "small" },
                    details: { alignment: "neutral" }
                }
            },
            scale: 1.0
        };
        
        // Extract token data
        const tokenData = TokenImageReplacement._extractTokenData(mockTokenDocument);
        console.log("Extracted Token Data:", tokenData);
        
        // Test files
        const testFiles = [
            {
                name: "Creature_Archer_A1_Bow_01.webp",
                path: "creatures/creature/",
                metadata: { tags: ["CREATURE", "ARCHER", "BOW", "HUMANOID", "SMALL"] }
            },
            {
                name: "!Core_Ranger_A1_Bow_01.webp",
                path: "creatures/core/",
                metadata: { tags: ["RANGER", "BOW", "HUMANOID", "MEDIUM"] }
            }
        ];
        
        // Create temp window for scoring
        const tempWindow = new TokenImageReplacementWindow();
        
        for (const fileInfo of testFiles) {
            console.log(`\n--- Testing ${fileInfo.name} ---`);
            
            // Test token name matching
            const tokenNameMatch = tempWindow._calculateTokenNameMatch(
                mockTokenDocument.name, 
                fileInfo.name.toLowerCase(), 
                fileInfo.path.toLowerCase(), 
                fileInfo
            );
            console.log(`Token Name "${mockTokenDocument.name}" match: ${tokenNameMatch}`);
            
            // Test token data matching
            if (tokenData.representedActor) {
                const actorMatch = tempWindow._calculateTokenDataMatch(
                    tokenData.representedActor, 
                    fileInfo.name.toLowerCase(), 
                    fileInfo.path.toLowerCase(), 
                    fileInfo
                );
                console.log(`Represented Actor "${tokenData.representedActor}" match: ${actorMatch}`);
            }
            
            // Test full scoring
            const searchTerms = ["Test", "Test (Creature)", "Creature", "test", "creature"];
            const score = tempWindow._calculateRelevanceScore(fileInfo, searchTerms, mockTokenDocument, 'token');
            console.log(`Final Score: ${(score * 100).toFixed(1)}%`);
        }
        
        console.log("\n=== END DEBUG ===");
    }
    
    static async initialize() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Initializing system...", "", false, false);
        
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
            callback: this._onTokenCreated.bind(this)
        });

        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | createToken", "token-image-replacement-creation", true, false);
        
        // Register global controlToken hook for token selection detection
        const controlTokenHookId = HookManager.registerHook({
            name: 'controlToken',
            description: 'Token Image Replacement: Global token selection detection',
            context: 'token-image-replacement-global',
            priority: 3, // Normal priority - UI enhancement
            callback: this._onGlobalTokenSelectionChange.bind(this)
        });

        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | controlToken (global)", "token-image-replacement-global", true, false);
        
        // No Handlebars helpers needed - all calculations done in JavaScript
        
        // Add test function to global scope for debugging
        if (game.user.isGM) {
                game.TokenImageReplacement = this;
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Debug functions available via game.TokenImageReplacement", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Available test functions:", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - testCacheStructure() - Test basic cache functionality", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - testMatchingAlgorithm() - Test matching logic", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - testTokenCreation() - Test token creation hook", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - getIntegrationStatus() - Check overall system status", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - getCacheStorageStatus() - Check persistent cache status", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - refreshCache() - Manually refresh the cache", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - isScanning() - Check if a scan is currently in progress", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - forceRefreshCache() - Force refresh (stops current scan if running)", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - getCacheStats() - View cache statistics", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - cleanupInvalidPaths() - Remove invalid file paths from cache", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - forceCleanupInvalidPaths() - Force cleanup and save cleaned cache", "", true, false);
                postConsoleAndNotification(MODULE.NAME, "  - openWindow() - Open the Token Image Replacement window", "", true, false);
                
                // Add the cleanup functions to the global scope
                game.TokenImageReplacement.cleanupInvalidPaths = this._cleanupInvalidPaths.bind(this);
                game.TokenImageReplacement.forceCleanupInvalidPaths = this.forceCleanupInvalidPaths.bind(this);
                game.TokenImageReplacement.isScanning = this.isScanning.bind(this);
                game.TokenImageReplacement.scanForImages = this.scanForImages.bind(this);
                game.TokenImageReplacement.deleteCache = this.deleteCache.bind(this);
                game.TokenImageReplacement.pauseCache = this.pauseCache.bind(this);
                game.TokenImageReplacement.openWindow = this.openWindow.bind(this);
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cleaned up ${cleanedCount} invalid file paths from cache`, "", false, false);
            if (invalidPaths.length > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Invalid paths found: ${invalidPaths.join(', ')}`, "", false, false);
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
                            label: "Incremental Update",
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
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan cancelled by user", "", false, false);
                return;
            }
            
            // Do incremental update if cache exists
            if (choice === 'incremental') {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting incremental update...", "", false, false);
                const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
                if (basePath) {
                    await this._doIncrementalUpdate(basePath);
                }
                return;
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting full scan...", "", false, false);
        
        if (this.cache.isScanning) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Stopping current scan and starting fresh...", "", false, false);
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
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Stopping current scan for incremental update...", "", false, false);
            this.cache.isScanning = false;
        }
        
        this.cache.isScanning = true;
        this.cache.isPaused = false;
        
        try {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting incremental update...", "", false, false);
            
            // Check if folder structure has changed
            const currentFingerprint = await this._generateFolderFingerprint(basePath);
            const savedCache = localStorage.getItem('tokenImageReplacement_cache');
            
            let needsUpdate = false;
            if (savedCache) {
                const cacheData = JSON.parse(savedCache);
                if (cacheData.folderFingerprint !== currentFingerprint) {
                    needsUpdate = true;
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, files need to be rescanned", "", false, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No changes detected in folder structure", "", false, false);
                }
            }
            
            if (needsUpdate) {
                // If structure changed, we need to do a full rescan
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Changes detected - falling back to full scan", "", false, false);
                this.cache.isScanning = false; // Stop incremental mode
                await this._scanFolderStructure(basePath); // Do full scan
                return;
            } else {
                // No changes detected, just update the timestamp
                const originalFileCount = this.cache.files.size;
                
                // Update lastScan timestamp to current time
                this.cache.lastScan = Date.now();
                this.cache.totalFiles = this.cache.files.size;
                
                // Save the updated cache with new timestamp
                await this._saveCacheToStorage(false); // false = final save
                
                // Update the cache status setting for display
                this._updateCacheStatusSetting();
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ✅ INCREMENTAL UPDATE COMPLETE!`, "", false, false);
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No changes detected. Cache still contains ${originalFileCount} files.`, "", false, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error during incremental update: ${error.message}`, "", true, false);
        } finally {
            this.cache.isScanning = false;
        }
    }
    
    /**
     * Delete the entire cache
     */
    static async deleteCache() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Deleting cache...", "", false, false);
        
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
        
        // Clear persistent storage
        this._clearCacheFromStorage();
        
        // Update status
        this._updateCacheStatusSetting();
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache deleted successfully", "", false, false);
    }
    
    /**
     * Pause the current cache scanning process
     */
    static pauseCache() {
        if (this.cache.isScanning) {
            this.cache.isPaused = true;
            this.cache.isScanning = false;
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache scanning paused. You can resume by refreshing the cache.", "", false, false);
            
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
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting forced cleanup of invalid paths...", "", false, false);
        
        const cleanedCount = this._cleanupInvalidPaths();
        
        if (cleanedCount > 0) {
            // Update total files count
            this.cache.totalFiles = this.cache.files.size;
            
            // Save cleaned cache to storage
            await this._saveCacheToStorage(false);
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Forced cleanup completed. Removed ${cleanedCount} invalid paths and saved cleaned cache.`, "", false, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No invalid paths found in cache.", "", false, false);
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
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Initializing cache system...", "", false, false);
        
        // Only initialize if the feature is enabled
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Feature disabled in settings", "", false, false);
            return;
        }
        
        const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
        if (!basePath) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No base path configured", "", false, false);
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Using base path: ${basePath}`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache files count before initialization: ${this.cache.files.size}`, "", false, false);
        
        // Try to load cache from storage first
        if (await this._loadCacheFromStorage()) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Using cached data, skipping scan", "", false, false);
            
            // Clean up any invalid paths that might be in the cached data
            const cleanedCount = this._cleanupInvalidPaths();
            if (cleanedCount > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cleaned up ${cleanedCount} invalid paths from cached data`, "", false, false);
                
                // Save the cleaned cache back to storage
                await this._saveCacheToStorage();
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Saved cleaned cache to storage", "", false, false);
            }
            
            // Check if we need incremental updates
            await this._checkForIncrementalUpdates(basePath);
            
            return;
        }
        
        // No cache found - show appropriate notification
        const autoUpdate = getSettingSafely(MODULE.ID, 'tokenImageReplacementAutoUpdate', false);
        if (autoUpdate) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No cache found, starting automatic scan...", "", false, false);
            ui.notifications.info("No Token Image Replacement images found. Scanning for images.");
        } else {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No cache found, manual scan needed", "", false, false);
            ui.notifications.info("No Token Image Replacement images found. You need to scan for images before replacements will work.");
        }
        
        // Start background scan if no valid cache found and auto-update is enabled
        if (autoUpdate) {
            await this._scanFolderStructure(basePath);
        }
        
        // Log final cache status
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache initialization completed. Files: ${this.cache.files.size}, Folders: ${this.cache.folders.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", false, false);
    }
    
    /**
     * Scan the folder structure and build the cache
     */
    static async _scanFolderStructure(basePath) {
        if (this.cache.isScanning) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan already in progress - please wait for it to complete", "", false, false);
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: You can check progress in the console above", "", false, false);
            return;
        }
        
        // Check if we were paused
        if (this.cache.isPaused) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan was paused. Use 'Refresh Cache' to resume.", "", false, false);
            return;
        }
        
        this.cache.isScanning = true;
        this.cache.isPaused = false; // Reset pause state when starting
        const startTime = Date.now();
        
        // Clear cache at the start of a complete scan
        this.cache.files.clear();
        this.cache.folders.clear();
        this.cache.creatureTypes.clear();
        
        // Initialize overall progress tracking
        this.cache.overallProgress = 0;
        this.cache.currentStepName = '';
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Starting folder scan...", "", false, false);
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: This may take a few minutes for large token collections...", "", false, false);
        
        try {
            // Update window with initial scan status
            if (this.window && this.window.updateScanProgress) {
                this.window.updateScanProgress(0, 100, "Starting directory scan...");
            }
            
            // Use Foundry's FilePicker to get directory contents
            const files = await this._getDirectoryContents(basePath);
            
            if (files.length === 0) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No supported image files found", "", false, false);
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
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ✅ SCAN COMPLETE!`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${this.cache.totalFiles} files across ${this.cache.folders.size} folders in ${timeString}`, "", false, false);
            
            // Log some statistics about the cache
            this._logCacheStatistics();
            
            // Save cache to persistent storage (final save)
            await this._saveCacheToStorage(false); // false = final save
            
            // Update the cache status setting for display
            this._updateCacheStatusSetting();
            
            // Update window with completion status
            if (this.window && this.window.updateScanProgress) {
                this.window.updateScanProgress(100, 100, "Scan Complete");
            }
            
            // Show completion notification in the window
            if (this.window && this.window.showCompletionNotification) {
                this.window.showCompletionNotification(this.cache.totalFiles, this.cache.folders.size, timeString);
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
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error scanning folders: ${error.message}`, "", true, false);
            
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
            this.cache.isScanning = false;
        }
    }
    
    /**
     * Log cache statistics for debugging
     */
    static _logCacheStatistics() {
        if (this.cache.creatureTypes.size > 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Creature type breakdown:", "", false, false);
            for (const [creatureType, files] of this.cache.creatureTypes) {
                postConsoleAndNotification(MODULE.NAME, `  ${creatureType}: ${files.length} files`, "", false, false);
            }
        }
        
        if (this.cache.folders.size > 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Top folders by file count:`, "", false, false);
            const sortedFolders = Array.from(this.cache.folders.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 5);
            
            for (const [folder, files] of sortedFolders) {
                postConsoleAndNotification(MODULE.NAME, `  ${folder}: ${files.length} files`, "", false, false);
            }
        }
    }
    
    /**
     * Get directory contents using Foundry's FilePicker API
     */
    static async _getDirectoryContents(basePath) {
        const files = [];
        
        try {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Scanning directory: ${basePath}`, "", false, false);
            
            // Use Foundry's FilePicker to browse the directory
            const response = await FilePicker.browse("data", basePath);
            
            // Log what we found for debugging
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Directory scan results - Files: ${response.files?.length || 0}, Subdirectories: ${response.dirs?.length || 0}`, "", false, false);
            
            // Process files in the base directory (if any)
            if (response.files && response.files.length > 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.files.length} files in base directory`, "", false, false);
                
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
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.dirs.length} subdirectories, scanning recursively...`, "", false, false);
                
                // Set total steps for overall progress (1 for base directory + subdirectories)
                this.cache.totalSteps = response.dirs.length + 1;
                this.cache.overallProgress = 0;
                
                for (let i = 0; i < response.dirs.length; i++) {
                    // Check if we should pause
                    if (this.cache.isPaused) {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan paused by user.", "", false, false);
                        return;
                    }
                    
                    const subDir = response.dirs[i];
                    const subDirName = subDir.split('/').pop();
                    
                    // Check if this folder should be ignored
                    if (TokenImageReplacement._isFolderIgnored(subDirName)) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Ignoring folder: ${subDirName}`, "", false, false);
                        continue;
                    }
                    
                    // Update overall progress
                    this.cache.overallProgress = i + 1;
                    this.cache.currentStepName = subDirName;
                    
                    // Update window progress if it exists
                    if (this.window && this.window.updateScanProgress) {
                        const statusText = this._truncateStatusText(`Scanning ${subDirName}: ${files.length} files found`);
                        this.window.updateScanProgress(i + 1, response.dirs.length, statusText);
                        // Small delay to make progress visible
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: [${i + 1}/${response.dirs.length}] Scanning ${subDirName}...`, "", false, false);
                    const subDirFiles = await this._scanSubdirectory(subDir, basePath);
                    files.push(...subDirFiles);
                    
                    // Process files into cache immediately so they're available for incremental saves
                    if (subDirFiles.length > 0) {
                        await this._processFiles(subDirFiles, basePath, false); // Don't clear cache, just add files
                    }
                    
                    // Save cache incrementally after each main folder to prevent data loss
                    if (subDirFiles.length > 0) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Saving progress after ${subDirName} (${subDirFiles.length} files)...`, "", false, false);
                        await this._saveCacheToStorage(true); // true = incremental save
                    }
                    
                    // Log progress with percentage and file count
                    const progressPercent = Math.round(((i + 1) / response.dirs.length) * 100);
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: [${progressPercent}%] Completed ${subDirName} - ${files.length} files total`, "", false, false);
                }
            }
            
            if (files.length === 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No supported image files found in ${basePath} or its subdirectories`, "", false, false);
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error scanning directory ${basePath}: ${error.message}`, "", true, false);
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
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.files.length} files in ${subDir}`, "", false, false);
                
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
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Scan paused by user during file processing.", "", false, false);
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
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found ${response.dirs.length} deeper subdirectories in ${parentDirName}`, "", false, false);
                
                for (let i = 0; i < response.dirs.length; i++) {
                    const deeperDir = response.dirs[i];
                    const deeperDirName = deeperDir.split('/').pop();
                    
                    // Check if this folder should be ignored
                    if (TokenImageReplacement._isFolderIgnored(deeperDirName)) {
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Ignoring subfolder: ${parentDirName}/${deeperDirName}`, "", false, false);
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
                        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: [${progressPercent}%] ${parentDirName}/${deeperDirName} - ${files.length} files`, "", false, false);
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
        // Debug logging for wildcard detection
        if (filePath.includes('*') || filePath.includes('?') || filePath.includes('[') || filePath.includes(']')) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - Wildcard detected in file path: ${filePath}`, "", false, true);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - Base path: ${basePath}`, "", false, true);
        }
        
        // Check if file has supported extension
        const extension = filePath.split('.').pop()?.toLowerCase();
        if (!TokenImageReplacement.SUPPORTED_FORMATS.includes(`.${extension}`)) {
            return null;
        }
        
        // Validate file path - check for invalid characters
        if (this._isInvalidFilePath(filePath)) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping invalid file path: ${filePath}`, "", false, false);
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
        
        // Debug: Only log for problematic files to avoid spam
        if (fileName.includes('HALFORC') || fileName.includes('CORE')) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - Generated metadata for ${fileName}:`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - Tags: ${metadata.tags ? metadata.tags.join(', ') : 'none'}`, "", true, false);
            postConsoleAndNotification(MODULE.NAME, `  - D&D5e Type: ${metadata.dnd5eType || 'none'}`, "", true, false);
        }
        
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
            
            // Validate the full path before storing
            const fullPath = `${basePath}/${filePath}`;
            if (this._isInvalidFilePath(fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping invalid full path: ${fullPath}`, "", false, false);
                skippedFiles++;
                continue;
            }
            
            // Process file info to generate metadata
            const fileInfo = await this._processFileInfo(fullPath, basePath);
            if (!fileInfo) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping file that failed processing: ${fullPath}`, "", false, false);
                skippedFiles++;
                continue;
            }
            
            // Store in main files cache with metadata
            this.cache.files.set(fileName.toLowerCase(), fileInfo);
            
            validFiles++;
            
            // Categorize by folder
            this._categorizeFile(fileName, filePath);
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache built with ${validFiles} valid files, skipped ${skippedFiles} invalid files`, "", false, false);
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
     * Find a matching image for a token
     */
    static findMatchingImage(tokenDocument) {
        // Check if feature is enabled
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            return null;
        }
        
        // Check if we should skip this token type
        if (!this._shouldUpdateToken(tokenDocument)) {
            return null;
        }
        
        // If cache is empty, return null - real-time search will be handled by caller
        if (this.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache empty, skipping automatic matching", "", false, false);
            return null;
        }
        
        // Debug: Log cache status
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache status - files: ${this.cache.files.size}, folders: ${this.cache.folders.size}, creatureTypes: ${this.cache.creatureTypes.size}`, "", false, false);
        
        // Get search terms for this token
        const searchTerms = this._getSearchTerms(tokenDocument);
        
        // Debug: Log token details
        const creatureType = tokenDocument.actor?.system?.details?.type?.value;
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Token details - name: "${tokenDocument.name}", creatureType: "${creatureType}"`, "", false, false);
        
        // Try to find a match
        // Get current filter from any open window
        let currentFilter = 'all';
        const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
        if (openWindow) {
            currentFilter = openWindow.currentFilter;
        }
        
        const match = this._findBestMatch(searchTerms, tokenDocument, currentFilter);
        
        if (match) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Found match for ${tokenDocument.name}: ${match.name}`, "", false, false);
            return match;
        }
        
        return null;
    }
    
    /**
     * Find a match using real-time directory scanning when cache is not ready
     */
    static async _findMatchInRealTime(tokenDocument) {
        try {
            const searchTerms = this._getSearchTerms(tokenDocument);
            const basePath = game.settings.get(MODULE.ID, 'tokenImageReplacementBasePath') || 'assets/images/tokens';
            
            // Try to find matches in common creature type folders first
            const creatureType = tokenDocument.actor?.system?.details?.type;
            let searchPaths = [basePath];
            
            if (creatureType && typeof creatureType === 'object' && creatureType.value) {
                const typeValue = creatureType.value.toLowerCase();
                const creatureFolders = this.CREATURE_TYPE_FOLDERS[typeValue] || [];
                
                // Add creature-specific subdirectories to search
                for (const folder of creatureFolders) {
                    searchPaths.push(`${basePath}/${folder}`);
                }
            }
            
            // Search each path for matching files
            for (const searchPath of searchPaths) {
                try {
                    const files = await FilePicker.browse('data', searchPath);
                    if (files.target && files.files) {
                        // Look for files that match our search terms
                        const matchingFiles = files.files.filter(file => {
                            const fileName = file.toLowerCase();
                            return searchTerms.some(term => 
                                term && term.length > 2 && fileName.includes(term.toLowerCase())
                            );
                        });
                        
                        if (matchingFiles.length > 0) {
                            // Return the first match found
                            const matchFile = matchingFiles[0];
                            const fullPath = `${searchPath}/${matchFile}`;
                            
                            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Real-time match found: ${matchFile}`, "", false, false);
                            
                            return {
                                name: matchFile.replace(/\.[^/.]+$/, ""), // Remove extension
                                fileName: matchFile,
                                fullPath: fullPath
                            };
                        }
                    }
                } catch (error) {
                    // Directory might not exist, continue to next path
                    continue;
                }
            }
            
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: No real-time matches found", "", false, false);
            return null;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Real-time search error: ${error.message}`, "", false, false);
            return null;
        }
    }
    
    /**
     * Determine if we should update this token
     */
    static _shouldUpdateToken(tokenDocument) {
        // Skip linked tokens if setting is enabled
        if (game.settings.get(MODULE.ID, 'tokenImageReplacementSkipLinked') && tokenDocument.actorLink) {
            return false;
        }
        
        // Check token type settings
        const actorType = tokenDocument.actor?.type || 'npc';
        
        switch (actorType) {
            case 'npc':
                return game.settings.get(MODULE.ID, 'tokenImageReplacementUpdateNPCs');
            case 'vehicle':
                return game.settings.get(MODULE.ID, 'tokenImageReplacementUpdateVehicles');
            case 'character':
                return game.settings.get(MODULE.ID, 'tokenImageReplacementUpdateActors');
            default:
                // Assume monster for other types
                return game.settings.get(MODULE.ID, 'tokenImageReplacementUpdateMonsters');
        }
    }
    
    /**
     * Get search terms for finding a matching image
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
        
        // Debug logging for search terms
        if (tokenDocument.actor && tokenDocument.actor.name && tokenDocument.actor.name.toLowerCase().includes('brown')) {
            postConsoleAndNotification(MODULE.NAME, `DEBUG SEARCH TERMS for ${tokenDocument.actor.name}`, `Initial terms: ${JSON.stringify(terms)}`, true, false);
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
        
        // Debug: log all terms before filtering (only once per token)
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Raw search terms: ${JSON.stringify(terms)}`, "", false, false);
        
        // Remove duplicates and empty terms
        const filteredTerms = [...new Set(terms.filter(term => term && typeof term === 'string' && term.trim().length > 0))];
        
        // Debug logging for brown bear specifically
        if (tokenDocument.actor && tokenDocument.actor.name && tokenDocument.actor.name.toLowerCase().includes('brown')) {
            postConsoleAndNotification(MODULE.NAME, `DEBUG BROWN BEAR SEARCH TERMS`, `Actor: ${tokenDocument.actor.name}, Final terms: ${JSON.stringify(filteredTerms)}`, true, false);
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Filtered search terms: ${JSON.stringify(filteredTerms)}`, "", false, false);
        
        // Cache the result
        if (!this._searchTermsCache) {
            this._searchTermsCache = {};
        }
        this._searchTermsCache[cacheKey] = filteredTerms;
        
        return filteredTerms;
    }
    
    /**
     * Find the best matching image for the given search terms
     * @param {Array} searchTerms - Search terms for matching
     * @param {Object} tokenDocument - The token document
     * @param {string} currentFilter - Current filter to apply (optional)
     */
    static _findBestMatch(searchTerms, tokenDocument, currentFilter = 'all') {
        // First, try to optimize search scope using creature type
        let creatureType = tokenDocument.actor?.system?.details?.type;
        // Handle both string and object formats
        if (creatureType && typeof creatureType === 'object' && creatureType.value) {
            creatureType = creatureType.value;
        }
        creatureType = creatureType?.toLowerCase();
        
        // Debug: Log creature type detection
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Detected creature type: "${creatureType}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Available creature types: ${Array.from(this.cache.creatureTypes.keys()).join(', ')}`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Total cache files: ${this.cache.files.size}`, "", false, false);
        
        // Debug: Log cache status
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache contains ${this.cache.files.size} files`, "", false, false);
        
        let searchScope = this.cache.files;
        
        if (creatureType && this.cache.creatureTypes.has(creatureType)) {
            // Use creature type optimization
            const creatureFiles = this.cache.creatureTypes.get(creatureType);
            searchScope = new Map();
            for (const fileName of creatureFiles) {
                if (this.cache.files.has(fileName)) {
                    searchScope.set(fileName, this.cache.files.get(fileName));
                }
            }
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Using creature type optimization: ${searchScope.size} files`, "", false, false);
            
            
            // If creature type optimization returns 0 files, fall back to full cache
            if (searchScope.size === 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Creature type optimization returned 0 files, falling back to full cache`, "", false, false);
                searchScope = this.cache.files;
            }
        } else {
            // If creature type not found, use full cache
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Using full cache: ${searchScope.size} files`, "", false, false);
            if (creatureType) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Creature type "${creatureType}" not found in cache, using full cache`, "", false, false);
            }
        }
        
        // Apply module filter if not 'all'
        if (currentFilter !== 'all') {
            const originalSize = searchScope.size;
            const filteredScope = new Map();
            
            for (const [fileName, fileInfo] of searchScope.entries()) {
                const path = fileInfo.path || '';
                const name = fileInfo.name || '';
                
                // Apply the same filtering logic as _getFilteredFiles
                let shouldInclude = false;
                switch (currentFilter) {
                    case 'selected':
                        // Only show files that match the selected token's characteristics
                        const fileText = `${path} ${name}`.toLowerCase();
                        shouldInclude = searchTerms.some(term => fileText.includes(term.toLowerCase()));
                        break;
                    default:
                        // For category filters (adventurers, adversaries, creatures, npcs, spirits), 
                        // check if file is in that top-level folder
                        const pathParts = path.split('/');
                        const topLevel = pathParts[0];
                        shouldInclude = topLevel && topLevel.toLowerCase() === currentFilter;
                        break;
                }
                
                if (shouldInclude) {
                    filteredScope.set(fileName, fileInfo);
                }
            }
            
            searchScope = filteredScope;
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied filter "${currentFilter}": ${originalSize} → ${searchScope.size} files`, "", false, false);
        }
        
        let bestMatch = null;
        let bestScore = 0;
        const threshold = game.settings.get(MODULE.ID, 'tokenImageReplacementThreshold') || 0.3;
        
        // Create a temporary window instance to use the unified scoring method
        const tempWindow = new TokenImageReplacementWindow();
        
        // Debug: Track scoring for files
        const scoredFiles = [];
        let totalScored = 0;
        
        // Search through the optimized scope using unified scoring
        for (const [fileName, fileInfo] of searchScope.entries()) {
            const score = tempWindow._calculateRelevanceScore(fileInfo, searchTerms, tokenDocument, 'token');
            totalScored++;
            
            
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = {
                    name: fileInfo.name,
                    path: fileInfo.path,
                    fullPath: fileInfo.fullPath,
                    searchScore: score,
                    isCurrent: false,
                    metadata: fileInfo.metadata || null
                };
            }
        }
        
        // Debug: Log search scope details
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Search scope contains ${searchScope.size} files`, "", false, false);
        if (searchScope.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: WARNING - Search scope is empty!`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: This means either cache is empty or creature type optimization failed`, "", false, false);
        }
        
        // Debug logging
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Scored ${totalScored} files`, "", false, false);
        
        if (bestMatch) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Best match found: ${bestMatch.name} (score: ${bestScore.toFixed(3)})`, "", false, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No match found above threshold ${threshold}`, "", false, false);
        }
        
        return bestMatch;
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
     * Hook for when tokens are created
     */
    static async _onTokenCreated(tokenDocument, options, userId) {
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Hook fired for token: ${tokenDocument.name}`, "", false, false);
        
        // Only process if we're a GM and the feature is enabled
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - not GM", "", false, false);
            return;
        }
        
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - feature disabled", "", false, false);
            return;
        }
        
        // Check if cache is ready
        if (this.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - cache not ready", "", false, false);
            return;
        }
        
        // Extract token data and weights
        const tokenData = TokenImageReplacement._extractTokenData(tokenDocument);
        const weights = {
            representedActor: getSettingSafely(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor', 80) / 100,
            tokenName: getSettingSafely(MODULE.ID, 'tokenImageReplacementWeightTokenName', 20) / 100,
            creatureType: getSettingSafely(MODULE.ID, 'tokenImageReplacementWeightCreatureType', 15) / 100,
            creatureSubtype: getSettingSafely(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype', 15) / 100,
            equipment: getSettingSafely(MODULE.ID, 'tokenImageReplacementWeightEquipment', 10) / 100,
            size: getSettingSafely(MODULE.ID, 'tokenImageReplacementWeightSize', 5) / 100,
        };
        
        // Log formatted breakdown
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ===== TOKEN DATA BREAKDOWN =====`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Criteria | Weight | Data from Token`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: representedActor | ${weights.representedActor} | "${tokenData.representedActor || 'none'}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: tokenName | ${weights.tokenName} | "${tokenDocument.name || 'none'}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: creatureType | ${weights.creatureType} | "${tokenData.creatureType || 'none'}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: creatureSubtype | ${weights.creatureSubtype} | "${tokenData.creatureSubtype || 'none'}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: equipment | ${weights.equipment} | [${tokenData.equipment?.join(', ') || 'none'}]`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: size | ${weights.size} | "${tokenData.size || 'none'}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: =================================`, "", false, false);
        
        // Wait a moment for the token to be fully created on the canvas
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Find matching image
        const matchingImage = this.findMatchingImage(tokenDocument);
        
        if (matchingImage) {
            // Validate the image path before applying
            if (this._isInvalidFilePath(matchingImage.fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cannot apply invalid image path to ${tokenDocument.name}: ${matchingImage.fullPath}`, "", false, false);
                
                // Clean up the invalid path from cache to prevent future issues
                this.cache.files.delete(matchingImage.name.toLowerCase());
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Removed invalid path from cache: ${matchingImage.name}`, "", false, false);
                
                // Try to find an alternative match
                // Get current filter from any open window
                let currentFilter = 'all';
                const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
                if (openWindow) {
                    currentFilter = openWindow.currentFilter;
                }
                const alternativeMatch = this._findBestMatch(this._getSearchTerms(tokenDocument), tokenDocument, currentFilter);
                if (alternativeMatch && !this._isInvalidFilePath(alternativeMatch.fullPath)) {
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
                return;
            }
            
            // Apply the image replacement
            try {
                await tokenDocument.update({
                    'texture.src': matchingImage.fullPath
                });
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied ${matchingImage.name} to ${tokenDocument.name} (Score: ${((matchingImage.score || 0) * 100).toFixed(1)}%)`, "", false, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying image: ${error.message}`, "", false, false);
                
                // Check if the error is due to an invalid asset path
                if (error.message.includes('Invalid Asset') || error.message.includes('loadTexture')) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Invalid asset detected, removing from cache: ${matchingImage.fullPath}`, "", false, false);
                    this.cache.files.delete(matchingImage.name.toLowerCase());
                    
                    // Try to find an alternative match
                    // Get current filter from any open window
                    let currentFilter = 'all';
                    const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
                    if (openWindow) {
                        currentFilter = openWindow.currentFilter;
                    }
                    const alternativeMatch = this._findBestMatch(this._getSearchTerms(tokenDocument), tokenDocument, currentFilter);
                    if (alternativeMatch && !this._isInvalidFilePath(alternativeMatch.fullPath)) {
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No matching image found for ${tokenDocument.name}`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Search Summary - Token Data: representedActor="${tokenData.representedActor}", creatureType="${tokenData.creatureType}", creatureSubtype="${tokenData.creatureSubtype}", equipment=[${tokenData.equipment?.join(', ') || 'none'}]`, "", false, false);
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
        
        // Also clear from persistent storage
        this._clearCacheFromStorage();
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache cleared from memory and storage", "", false, false);
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
     * Test function to verify cache structure (for debugging)
     */
    static async testCacheStructure() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Testing cache structure...", "", false, false);
        
        // Test with some dummy data
        const testFiles = [
            { name: 'creature_01.webp', path: 'creatures/creature_01.webp' },
            { name: 'orc_01.webp', path: 'creatures/orc_01.webp' },
            { name: 'dragon_01.webp', path: 'creatures/dragon_01.webp' }
        ];
        
        await this._processFiles(testFiles, 'test/path');
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Test cache built. Files: ${this.cache.files.size}, Folders: ${this.cache.files.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", false, false);
        
        // Test categorization
        if (this.cache.creatureTypes.has('humanoid')) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Humanoid files: ${this.cache.creatureTypes.get('humanoid').join(', ')}`, "", false, false);
        }
        
        // Clear test data
        this.clearCache();
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Test cache cleared", "", false, false);
    }
    
    /**
     * Test the matching algorithm with a mock token
     */
    static async testMatchingAlgorithm() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Testing matching algorithm...", "", false, false);
        
        // First build a test cache
        const testFiles = [
            { name: 'creature_warrior_01.webp', path: 'creatures/creature_warrior_01.webp' },
            { name: 'orc_berserker_01.webp', path: 'creatures/orc_berserker_01.webp' },
            { name: 'red_dragon_01.webp', path: 'creatures/red_dragon_01.webp' },
            { name: 'skeleton_01.webp', path: 'creatures/skeleton_01.webp' },
            { name: 'zombie_01.webp', path: 'creatures/zombie_01.webp' }
        ];
        
        await this._processFiles(testFiles, 'test/path');
        
        // Test with different token types
        const testTokens = [
            {
                name: "Creature Warrior",
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Testing token: ${token.name}`, "", false, false);
            const searchTerms = this._getSearchTerms(token);
            postConsoleAndNotification(MODULE.NAME, `  Search terms: ${searchTerms.join(', ')}`, "", false, false);
            
            const match = this.findMatchingImage(token);
            if (match) {
                postConsoleAndNotification(MODULE.NAME, `  Found match: ${match.name}`, "", false, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `  No match found`, "", false, false);
            }
        }
        
        // Clear test data
        this.clearCache();
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Test matching completed and cache cleared", "", false, false);
    }
    
    /**
     * Test token creation hook integration
     */
    static testTokenCreation() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Testing token creation hook...", "", false, false);
        
        // Check if hook is registered (safe way for different Foundry versions)
        let hookRegistered = false;
        try {
            if (Hooks.all && Hooks.all.get) {
                const hooks = Hooks.all.get('createToken') || [];
                hookRegistered = hooks.some(hook => hook.name === '_onTokenCreated');
            } else {
                // Fallback for older Foundry versions
                hookRegistered = true; // Assume it's working if we can't check
            }
        } catch (error) {
            hookRegistered = true; // Assume it's working if we can't check
        }
        
        if (hookRegistered) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: ✓ Hook 'createToken' is properly registered", "", false, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: ✗ Hook 'createToken' is NOT registered", "", false, false);
        }
        
        // Check if cache is ready
        if (this.cache.files.size > 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: ✓ Cache is ready with ${this.cache.files.size} files`, "", false, false);
        } else {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: ⚠ Cache is not ready yet (still scanning)", "", false, false);
        }
        
        // Check settings
        const enabled = game.settings.get(MODULE.ID, 'tokenImageReplacementEnabled');
        const path = game.settings.get(MODULE.ID, 'tokenImageReplacementPath');
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Feature enabled: ${enabled}`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Base path: ${path || 'Not configured'}`, "", false, false);
        
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Token creation hook test completed", "", false, false);
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
            
            // Only generate fingerprint for final saves, not incremental ones (performance)
            let folderFingerprint = null;
            if (!isIncremental) {
                folderFingerprint = await this._generateFolderFingerprint(basePath);
            }
            
            const cacheData = {
                files: Array.from(this.cache.files.entries()),
                folders: Array.from(this.cache.folders.entries()),
                creatureTypes: Array.from(this.cache.creatureTypes.entries()),
                lastScan: this.cache.lastScan || Date.now(), // Use current time if lastScan is null
                totalFiles: this.cache.totalFiles,
                basePath: basePath,
                folderFingerprint: folderFingerprint,
                version: '1.1', // Bumped version for new cache structure
                isIncremental: isIncremental // Flag to indicate this is a partial save
            };
            
            
            localStorage.setItem('tokenImageReplacement_cache', JSON.stringify(cacheData));
            
            if (isIncremental) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Progress saved (${this.cache.files.size} files so far)`, "", false, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache saved to persistent storage", "", false, false);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error saving cache: ${error.message}`, "", true, false);
        }
    }
    
    /**
     * Load cache from localStorage
     */
    static async _loadCacheFromStorage() {
        try {
            const savedCache = localStorage.getItem('tokenImageReplacement_cache');
            if (!savedCache) {
                return false;
            }
            
            const cacheData = JSON.parse(savedCache);
            
            // Validate cache data structure
            if (!cacheData.version || !cacheData.files || !cacheData.folders || !cacheData.creatureTypes) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Invalid cache data in storage, will rescan", "", false, false);
                return false;
            }
            
            // Check version compatibility
            if (cacheData.version !== '1.1') {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache version mismatch (${cacheData.version} vs 1.1), will rescan`, "", false, false);
                return false;
            }
            
            // Check if base path changed
            const currentBasePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', 'assets/images/tokens');
            if (cacheData.basePath !== currentBasePath) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Base path changed, will rescan", "", false, false);
                return false;
            }
            
            // Check if cache is still valid (less than 30 days old)
            // Only check age if lastScan exists and is not from an incremental save
            if (cacheData.lastScan && !cacheData.isIncremental) {
                const cacheAge = Date.now() - cacheData.lastScan;
                const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
                
                if (cacheAge > maxAge) {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache is stale (older than 30 days), will rescan", "", false, false);
                    return false;
                }
            }
            
            // Check if folder fingerprint changed (file system changes)
            // Only check fingerprint if it exists and is not from an incremental save
            if (cacheData.folderFingerprint && !cacheData.isIncremental) {
                const currentFingerprint = await this._generateFolderFingerprint(currentBasePath);
                if (cacheData.folderFingerprint !== currentFingerprint) {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, will rescan", "", false, false);
                    return false;
                }
            }
            
            // Check if we need to update the cache
            const autoUpdate = getSettingSafely(MODULE.ID, 'tokenImageReplacementAutoUpdate', false);
            const needsUpdate = await this._checkForIncrementalUpdates(currentBasePath);
            
            if (needsUpdate && autoUpdate) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Changes detected, updating cache automatically", "", false, false);
                ui.notifications.info("Token Image Replacement changes detected: Updating token images.");
                return false; // Will trigger update scan
            } else if (needsUpdate && !autoUpdate) {
                postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Changes detected, manual update needed", "", false, false);
                ui.notifications.info("Token Image Replacement changes detected. You should scan for images to get the latest images.");
                // Still load existing cache, just notify user
            }
            
            // Restore cache with debug logging for wildcard detection
            this.cache.files = new Map();
            for (const [fileName, fileInfo] of cacheData.files) {
                // Debug logging for wildcard detection in cached data
                if (fileInfo.fullPath && (fileInfo.fullPath.includes('*') || fileInfo.fullPath.includes('?') || fileInfo.fullPath.includes('[') || fileInfo.fullPath.includes(']'))) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG - Wildcard detected in cached file path: ${fileInfo.fullPath}`, "", false, true);
                }
                this.cache.files.set(fileName, fileInfo);
            }
            this.cache.folders = new Map(cacheData.folders);
            this.cache.creatureTypes = new Map(cacheData.creatureTypes);
            this.cache.lastScan = cacheData.lastScan;
            this.cache.totalFiles = cacheData.totalFiles;
            
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache restored from storage: ${this.cache.files.size} files, last scan: ${new Date(this.cache.lastScan).toLocaleString()}`, "", false, false);
            
            // Update the cache status setting for display
            this._updateCacheStatusSetting();
            
            // Log final cache status after loading from storage
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache loading completed. Files: ${this.cache.files.size}, Folders: ${this.cache.folders.size}, Creature Types: ${this.cache.creatureTypes.size}`, "", false, false);
            
            return true;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error loading cache: ${error.message}`, "", true, false);
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error clearing cache: ${error.message}`, "", true, false);
        }
    }
    
    /**
     * Generate a fingerprint of the folder structure to detect changes
     */
    static async _generateFolderFingerprint(basePath) {
        try {
            if (!basePath) {
                return 'no-path';
            }
            
            // Get a list of all files and folders recursively
            const allPaths = [];
            async function collectPaths(dir) {
                try {
                    const result = await FilePicker.browse('data', dir);
                    // Add directories
                    for (const subdir of result.dirs) {
                        allPaths.push(`dir:${subdir}`);
                        await collectPaths(subdir);
                    }
                    // Add files (only image files)
                    for (const file of result.files) {
                        if (TokenImageReplacement.SUPPORTED_FORMATS.some(format => file.toLowerCase().endsWith(format))) {
                            allPaths.push(`file:${file}`);
                        }
                    }
                } catch (error) {
                    // Skip inaccessible directories
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Warning - cannot access directory ${dir}: ${error.message}`, "", false, false);
                }
            }
            
            await collectPaths.call(this, basePath);
            
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
            
            return hash.toString();
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error generating folder fingerprint: ${error.message}`, "", false, false);
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
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error updating cache status setting: ${error.message}`, "", true, false);
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
                if (cacheData.folderFingerprint !== currentFingerprint) {
                    // Only start scan if auto-update is enabled
                    const autoUpdate = getSettingSafely(MODULE.ID, 'tokenImageReplacementAutoUpdate', false);
                    if (autoUpdate) {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, starting incremental update...", "", false, false);
                        await this._scanFolderStructure(basePath);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Folder structure changed, manual update needed", "", false, false);
                    }
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Cache is up to date", "", false, false);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error checking for incremental updates: ${error.message}`, "", false, false);
        }
    }


}

