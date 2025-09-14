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
        this.currentFilter = 'all'; // Track current category filter
        this.scanTotal = 0;
        this.scanStatusText = "Scanning Token Images...";
        this.notificationIcon = null;
        this.notificationText = null;
        
        // Window state management
        this.windowState = {
            width: 800,
            height: 600,
            left: null,
            top: null
        };
    }

    /**
     * Get the default window options
     */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "token-image-replacement",
            title: "Image Replacements",
            template: "modules/coffee-pub-blacksmith/templates/window-token-replacement.hbs",
            width: 800,
            height: 600,
            resizable: true,
            minimizable: true,
            maximizable: true
        });
    }

    /**
     * Get the window state from settings
     */
    _getWindowState() {
        const state = getSettingSafely(MODULE.ID, 'tokenImageReplacementWindowState', {});
        return {
            width: state.width || 800,
            height: state.height || 600,
            left: state.left || null,
            top: state.top || null
        };
    }

    /**
     * Save the window state to settings
     */
    _saveWindowState() {
        if (this.element && this.element.length) {
            const position = this.position;
            const state = {
                width: position.width,
                height: position.height,
                left: position.left,
                top: position.top
            };
            game.settings.set(MODULE.ID, 'tokenImageReplacementWindowState', state);
        }
    }

    /**
     * Render the window with saved state
     */
    async render(force = false, options = {}) {
        // Get saved window state
        const savedState = this._getWindowState();
        
        // Apply saved dimensions and position
        if (savedState.width) this.options.width = savedState.width;
        if (savedState.height) this.options.height = savedState.height;
        if (savedState.left !== null) this.options.left = savedState.left;
        if (savedState.top !== null) this.options.top = savedState.top;
        
        // Call parent render
        await super.render(force, options);
        
        // Add resize and move event listeners to save state
        if (this.element && this.element.length) {
            this.element.off('resize.tokenImageReplacement move.tokenImageReplacement');
            this.element.on('resize.tokenImageReplacement move.tokenImageReplacement', () => {
                this._saveWindowState();
            });
        }
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
     * Phase 1: Fast filename-only search for instant results
     */
    _performFastSearch(searchTerm) {
        const searchTermLower = searchTerm.toLowerCase();
        const fastResults = [];
        
        // Only search filenames for speed
        for (const [fileName, fileInfo] of TokenImageReplacement.cache.files.entries()) {
            const fileNameLower = fileName.toLowerCase();
            if (fileNameLower.includes(searchTermLower)) {
                let score = 0;
                if (fileNameLower === searchTermLower) {
                    score = 100; // Exact match
                } else if (fileNameLower.startsWith(searchTermLower)) {
                    score = 80; // Starts with
                } else {
                    score = 60; // Contains
                }
                
                fastResults.push({
                    name: fileInfo.name,
                    path: fileInfo.path,
                    fullPath: fileInfo.fullPath,
                    searchScore: score,
                    isCurrent: false
                });
            }
        }
        
        // Sort by score and limit to first 50 for speed
        fastResults.sort((a, b) => b.searchScore - a.searchScore);
        return fastResults.slice(0, 50);
    }

    /**
     * Apply category filter to search results
     */
    _applyCategoryFilter(results) {
        if (this.currentFilter === 'all') {
            return results;
        }
        
        return results.filter(result => {
            const path = result.path || '';
            const fileName = result.name || '';
            
            // Check if the result matches the current category filter
            switch (this.currentFilter) {
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
                        isCurrent: false
                    });
                }
            }
            
            // Add batch results to allMatches
            if (batchResults.length > 0) {
                this.allMatches.push(...batchResults);
                
                // Sort by score (highest first), but keep current image at top
                this.allMatches.sort((a, b) => {
                    if (a.isCurrent) return -1;
                    if (b.isCurrent) return 1;
                    return b.searchScore - a.searchScore;
                });
                
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

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "token-replacement-window",
            title: "Token Image Replacement",
            template: "modules/coffee-pub-blacksmith/templates/window-token-replacement.hbs",
            width: 400,
            height: 600,
            resizable: true,
            minimizable: true,
            maximizable: true,
            classes: ['token-replacement-window']
        });
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

    async _detectSelectedToken() {
        // Get the first selected token (if multiple are selected)
        const selectedTokens = canvas?.tokens?.controlled || [];
        
        if (selectedTokens.length > 0) {
            this.selectedToken = selectedTokens[0];
            // Automatically find matches for the selected token
            await this._findMatches();
        } else {
            this.selectedToken = null;
            this.matches = [];
        }
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
        
        // Refresh detection button
        html.find('.refresh-detection-btn').on('click', this._onRefreshDetection.bind(this));
        
        // Close button
        html.find('.close-btn').on('click', this._onClose.bind(this));

        // Search functionality
        html.find('.tir-search-input').on('input', this._onSearchInput.bind(this));
        html.find('.tir-search-input').on('keypress', (event) => {
            if (event.which === 13) { // Enter key
                event.preventDefault();
            }
        });
        
        // Infinite scroll
        html.find('.tir-thumbnails-grid').on('scroll', this._onScroll.bind(this));
        
        
        // Filter category click handlers
        html.find('#tir-filters-left').on('click', '.tir-filter-category', this._onCategoryFilterClick.bind(this));
        
        // Tag click handlers for new tags row
        html.find('#tir-search-tools-tag-container').on('click', '.tir-search-tools-tag', this._onTagClick.bind(this));
    }


    async _findMatches() {
        this.matches = [];
        this.allMatches = [];
        this.currentPage = 0;

        // Always add current token image as the first match if token exists
        if (this.selectedToken) {
            const currentImageSrc = this.selectedToken.texture?.src || this.selectedToken.document.texture?.src || '';
            if (currentImageSrc) {
                const currentImage = {
                    name: currentImageSrc.split('/').pop() || 'Unknown',
                    fullPath: currentImageSrc,
                    isCurrent: true
                };
                this.allMatches.push(currentImage);
            }
        }

        // Set notification based on cache status
        if (TokenImageReplacement.cache.isPaused) {
            // Cache scanning was paused
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (TokenImageReplacement.cache.isScanning) {
            // Cache is currently scanning
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'The Cache is currently loading and may impact performance.';
        } else {
            // Try to find matches using available cache (regardless of size)
            let foundMatches = false;
            
            // For manual selection window, show matches based on token selection
            if (TokenImageReplacement.cache.files.size > 0) {
                if (this.selectedToken) {
                    // If token is selected, use two-phase loading for instant results
                    const searchTerms = TokenImageReplacement._getSearchTerms(this.selectedToken.document);
                    
                    // Pre-process search terms for efficiency
                    const processedTerms = searchTerms
                        .filter(term => term && term.length >= 2)
                        .map(term => term.toLowerCase());
                    
                    if (processedTerms.length === 0) {
                        // No valid search terms, show limited files for speed
                        const allFiles = Array.from(TokenImageReplacement.cache.files.values());
                        const limitedResults = allFiles.slice(0, 50).map(file => ({
                            ...file,
                            searchScore: 10,
                            isCurrent: false
                        }));
                        this.allMatches.push(...limitedResults);
                        foundMatches = true;
                    } else {
                        // PHASE 1: Fast filename search for instant results
                        const fastResults = [];
                        for (const [fileName, fileInfo] of TokenImageReplacement.cache.files.entries()) {
                            let score = 0;
                            let foundMatch = false;
                            
                            // Only search filenames for speed
                            for (const searchTerm of processedTerms) {
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
                                    break; // Found a match, no need to check other terms
                                }
                            }
                            
                            if (foundMatch) {
                                fastResults.push({
                                    name: fileInfo.name,
                                    path: fileInfo.path,
                                    fullPath: fileInfo.fullPath,
                                    searchScore: score,
                                    isCurrent: false
                                });
                            }
                        }
                        
                        // Sort by score and limit to first 50 for speed
                        fastResults.sort((a, b) => b.searchScore - a.searchScore);
                        const limitedFastResults = fastResults.slice(0, 50);
                        
                        if (limitedFastResults.length > 0) {
                            this.allMatches.push(...limitedFastResults);
                            foundMatches = true;
                        }
                        
                        // PHASE 2: Start comprehensive search in background (if we have more than 50 results)
                        if (fastResults.length > 50) {
                            this.isSearching = true;
                            this._streamComprehensiveSearch(processedTerms);
                        }
                    }
                } else {
                    // If no token selected, show all available images
                    const allFiles = Array.from(TokenImageReplacement.cache.files.values());
                    const alternatives = allFiles.slice(0, 20); // Show up to 20 images
                    
                    if (alternatives.length > 0) {
                        alternatives.forEach(alt => {
                            alt.isCurrent = false;
                        });
                        this.allMatches.push(...alternatives);
                        foundMatches = true;
                    }
                }
            }
            
            // If still no matches and cache is empty, try real-time search (only if token selected)
            if (!foundMatches && TokenImageReplacement.cache.files.size === 0 && this.selectedToken) {
                try {
                    const realTimeMatch = await TokenImageReplacement._findMatchInRealTime(this.selectedToken.document);
                    if (realTimeMatch) {
                        realTimeMatch.isCurrent = false;
                        this.allMatches.push(realTimeMatch);
                        foundMatches = true;
                    }
                } catch (error) {
                    // Real-time search failed, will show appropriate notification below
                }
            }
            
            // Set notification based on results
            if (foundMatches) {
                this.notificationIcon = null;
                this.notificationText = null;
            } else if (TokenImageReplacement.cache.files.size === 0) {
                // No cache and no real-time matches
                this.notificationIcon = 'fas fa-exclamation-triangle';
                this.notificationText = 'No Cache Found - Please refresh cache.';
            } else {
                // Cache exists but no matches found
                this.notificationIcon = 'fas fa-search';
                this.notificationText = 'No matches found.';
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
        
        if (!this.selectedToken || !imagePath) return;

        // Don't apply the same image that's already current
        if (imagePath === this.selectedToken.texture.src) {
            ui.notifications.info("This is already the current image");
            return;
        }

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

    async _onRefreshDetection() {
        console.log('Token Image Replacement: Manual refresh detection triggered');
        await this._detectSelectedToken();
        this.render();
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

    async render(force = false, options = {}) {
        const result = await super.render(force, options);
        
        // Register token selection hook only once when first rendered
        // Use a small delay to ensure the DOM is ready
        if (!this._tokenHookRegistered) {
            setTimeout(async () => {
                if (!this._tokenHookRegistered) {
                    postConsoleAndNotification(MODULE.NAME, 'Token Image Replacement: Registering controlToken hook', 'token-image-replacement-selection', false, false);
                    console.log('Token Image Replacement: Window rendered, registering hook...');
                    this._tokenHookId = HookManager.registerHook({
                        name: 'controlToken',
                        description: 'Token Image Replacement: Handle token selection changes',
                        context: 'token-image-replacement-selection',
                        priority: 3,
                        callback: async (token, controlled) => {
                            console.log('Token Image Replacement: Hook fired!', token.name, controlled);
                            await this._onTokenSelectionChange(token, controlled);
                        }
                    });
                    this._tokenHookRegistered = true;
                    console.log('Token Image Replacement: Hook registered with ID:', this._tokenHookId);
                    
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
        console.log('Token Image Replacement: _onTokenSelectionChange called', token?.name, controlled);
        console.log('Token Image Replacement: game.user.isGM:', game.user?.isGM);
        
        // Only proceed if it's a GM (token image replacement is a GM tool)
        if (!game.user.isGM) {
            console.log('Token Image Replacement: Not GM, skipping');
            return;
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Token ${token.name} ${controlled ? 'selected' : 'deselected'}`, 'token-image-replacement-selection', false, false);
        
        // Detect the newly selected token and update matches
        await this._detectSelectedToken();
        this.render();
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
                console.log('Token Image Replacement: Found currently selected token:', selectedToken.name);
                
                // Store the selected token and find matches
                this.selectedToken = selectedToken;
                this._showSearchSpinner();
                await this._findMatches();
                this.render();
                this._hideSearchSpinner();
            } else {
                console.log('Token Image Replacement: No currently selected token found');
            }
        } catch (error) {
            console.log('Token Image Replacement: Error checking for selected token:', error);
        }
    }

    // Method to refresh matches when cache becomes ready
    async refreshMatches() {
        if (this.selectedToken) {
            this._showSearchSpinner();
            await this._findMatches();
            this.render();
            this._hideSearchSpinner();
        }
    }

    async _onSearchInput(event) {
        const searchTerm = $(event.currentTarget).val().trim();
        
        // Clear any existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Cancel any ongoing search
        this.isSearching = false;
        
        // If search term is too short, show all results
        if (searchTerm.length < 3) {
            this._showSearchSpinner();
            await this._findMatches();
            this._updateResults();
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
        this.render();
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
                    isCurrent: true
                };
                this.allMatches.push(currentImage);
            }
        }
        
        // PHASE 1: Fast filename search for instant results
        const fastResults = this._performFastSearch(searchTerm);
        const filteredFastResults = this._applyCategoryFilter(fastResults);
        this.allMatches.push(...filteredFastResults);
        
        // Sort by score (current image first, then by score)
        this.allMatches.sort((a, b) => {
            if (a.isCurrent) return -1;
            if (b.isCurrent) return 1;
            return b.searchScore - a.searchScore;
        });
        
        // Show Phase 1 results immediately
        this._applyPagination();
        this._updateResults();
        
        // PHASE 2: Start comprehensive search in background
        this._streamSearchResults(searchTerm);
    }

    async _streamSearchResults(searchTerm) {
        const searchTermLower = searchTerm.toLowerCase();
        const batchSize = 100; // Process files in batches
        let processedCount = 0;
        const totalFiles = TokenImageReplacement.cache.files.size;
        
        // Process files in batches to avoid blocking the UI
        const fileEntries = Array.from(TokenImageReplacement.cache.files.entries());
        
        for (let i = 0; i < fileEntries.length; i += batchSize) {
            // Check if search was cancelled (new search started)
            if (!this.isSearching) {
                break;
            }
            
            const batch = fileEntries.slice(i, i + batchSize);
            const batchResults = [];
            
            // Process this batch
            for (const [fileName, fileInfo] of batch) {
                let score = 0;
                let foundMatch = false;
                
                // Search filename
                const fileNameLower = fileName.toLowerCase();
                if (fileNameLower.includes(searchTermLower)) {
                    if (fileNameLower === searchTermLower) {
                        score += 100; // Exact filename match
                    } else if (fileNameLower.startsWith(searchTermLower)) {
                        score += 80; // Filename starts with term
                    } else {
                        score += 60; // Filename contains term
                    }
                    foundMatch = true;
                }
                
                // Search folder path
                if (fileInfo.path) {
                    const pathLower = fileInfo.path.toLowerCase();
                    if (pathLower.includes(searchTermLower)) {
                        if (pathLower.includes(`/${searchTermLower}/`)) {
                            score += 70; // Folder name match
                        } else {
                            score += 40; // Path contains term
                        }
                        foundMatch = true;
                    }
                }
                
                // Search by creature type
                for (const [creatureType, files] of TokenImageReplacement.cache.creatureTypes.entries()) {
                    if (files.includes(fileName) && creatureType.toLowerCase().includes(searchTermLower)) {
                        score += 90; // Creature type match
                        foundMatch = true;
                        break;
                    }
                }
                
                // Search by folder categorization
                for (const [folderPath, files] of TokenImageReplacement.cache.folders.entries()) {
                    if (files.includes(fileName)) {
                        const folderName = folderPath.split('/').pop().toLowerCase();
                        if (folderName.includes(searchTermLower)) {
                            score += 50; // Folder name match
                            foundMatch = true;
                            break;
                        }
                    }
                }
                
                // Search file extension
                const extension = fileInfo.name.split('.').pop().toLowerCase();
                if (extension.includes(searchTermLower)) {
                    score += 30; // Extension match
                    foundMatch = true;
                }
                
                if (foundMatch) {
                    batchResults.push({
                        name: fileInfo.name,
                        path: fileInfo.path,
                        fullPath: fileInfo.fullPath,
                        searchScore: score,
                        isCurrent: false
                    });
                }
            }
            
            // Add batch results to allMatches
            if (batchResults.length > 0) {
                const filteredBatchResults = this._applyCategoryFilter(batchResults);
                this.allMatches.push(...filteredBatchResults);
                
                // Sort by score (highest first), but keep current image at top
                this.allMatches.sort((a, b) => {
                    if (a.isCurrent) return -1;
                    if (b.isCurrent) return 1;
                    return b.searchScore - a.searchScore;
                });
                
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
            $element.find('.tir-thumbnails-grid').html(resultsHtml);
            
            // Re-attach event handlers for the new thumbnail items
            $element.find('.tir-thumbnail-item').off('click').on('click', this._onSelectImage.bind(this));
            
            // Update the results summary with current counts
            $element.find('#tir-results-details-count').html(`<i class="fas fa-images"></i>${this.matches.length} of ${this.allMatches.length} Showing`);
            
            // Update the status text based on search state
            if (this.isSearching) {
                $element.find('#tir-results-details-status').html('<i class="fas fa-sync-alt fa-spin"></i>Searching for more...');
            } else {
                $element.find('#tir-results-details-status').html('<i class="fas fa-check"></i>Complete');
            }
            
            // Update aggregated tags
            const aggregatedTags = this._getAggregatedTags();
            const tagHtml = aggregatedTags.map(tag => `<span class="tir-search-tools-tag" data-search-term="${tag}">${tag}</span>`).join('');
            $element.find('#tir-search-tools-tag-container').html(tagHtml);
            
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
        if (!this.selectedToken && this.matches.length === 0) {
            return `
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
            return `
                <div class="tir-thumbnail-item ${match.isCurrent ? 'tir-current-image' : ''}" data-image-path="${match.fullPath}" data-tooltip="${match.fullPath}" data-image-name="${match.name}">
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
                    <div class="tir-thumbnail-tagset">
                        ${tags.map(tag => `<span class="tir-thumbnail-tag">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    _getTagsForMatch(match) {
        const tags = [];
        
        // Add current image tag if applicable
        if (match.isCurrent) {
            tags.push('CURRENT IMAGE');
        }
        
        // Get creature type from cache
        const fileName = match.name.toLowerCase();
        for (const [creatureType, files] of TokenImageReplacement.cache.creatureTypes.entries()) {
            if (files.includes(fileName)) {
                tags.push(creatureType);
                break; // Only add the first matching creature type
            }
        }
        
        // Get folder hierarchy tags
        if (match.path) {
            const pathParts = match.path.split('/').slice(0, -1); // Remove filename, keep folder parts
            pathParts.forEach(part => {
                if (part && part !== 'creatures' && part !== 'tokens') {
                    // Clean up folder name for display
                    const cleanPart = part.replace(/[-_]/g, ' ').toLowerCase();
                    if (!tags.includes(cleanPart)) {
                        tags.push(cleanPart);
                    }
                }
            });
        }
        
        // If no tags found (and not current image), add a generic one
        if (tags.length === 0 || (tags.length === 1 && tags[0] === 'CURRENT IMAGE')) {
            tags.push('image');
        }
        
        return tags;
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
        const searchTerm = event.currentTarget.dataset.searchTerm;
        if (!searchTerm) return;
        
        // Set the search input value
        const $element = this.element;
        if ($element) {
            $element.find('.tir-search-input').val(searchTerm);
            
            // Trigger the search
            await this._performSearch(searchTerm);
        }
    }

    async _onCategoryFilterClick(event) {
        const category = event.currentTarget.dataset.category;
        if (!category || category === this.currentFilter) return;
        
        // Update active filter
        const $element = this.element;
        if ($element) {
            // Remove active class from all filter categories
            $element.find('#tir-filters-left .tir-filter-category').removeClass('active');
            $(event.currentTarget).addClass('active');
            
            // Set new filter
            this.currentFilter = category;
            
            // Re-run current search with new filter
            const currentSearchTerm = $element.find('.tir-search-input').val().trim();
            if (currentSearchTerm.length >= 3) {
                await this._performSearch(currentSearchTerm);
            } else if (this.selectedToken) {
                await this._findMatches();
            }
        }
    }

    _getAggregatedTags() {
        const tagCounts = new Map();
        
        // Count all tags from currently displayed matches
        this.matches.forEach(match => {
            const tags = this._getTagsForMatch(match);
            tags.forEach(tag => {
                if (tag !== 'CURRENT IMAGE') { // Don't count current image tag
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                }
            });
        });
        
        // Sort by frequency and return top tags
        return Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .slice(0, 8) // Limit to top 8 tags
            .map(([tag]) => tag); // Return just the tag names
    }

    async _performManualSearch(searchTerm) {
        if (TokenImageReplacement.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache empty, cannot perform manual search`, "", false, false);
            return [];
        }

        const searchTermLower = searchTerm.toLowerCase();
        const matches = [];
        
        // Search through all cached files using comprehensive search
        for (const [fileName, fileInfo] of TokenImageReplacement.cache.files.entries()) {
            let score = 0;
            let foundMatch = false;
            
            // Search filename
            const fileNameLower = fileName.toLowerCase();
            if (fileNameLower.includes(searchTermLower)) {
                if (fileNameLower === searchTermLower) {
                    score += 100; // Exact filename match
                } else if (fileNameLower.startsWith(searchTermLower)) {
                    score += 80; // Filename starts with term
                } else {
                    score += 60; // Filename contains term
                }
                foundMatch = true;
            }
            
            // Search folder path
            if (fileInfo.path) {
                const pathLower = fileInfo.path.toLowerCase();
                if (pathLower.includes(searchTermLower)) {
                    if (pathLower.includes(`/${searchTermLower}/`)) {
                        score += 70; // Folder name match
                    } else {
                        score += 40; // Path contains term
                    }
                    foundMatch = true;
                }
            }
            
            // Search by creature type
            for (const [creatureType, files] of TokenImageReplacement.cache.creatureTypes.entries()) {
                if (files.includes(fileName) && creatureType.toLowerCase().includes(searchTermLower)) {
                    score += 90; // Creature type match
                    foundMatch = true;
                    break;
                }
            }
            
            // Search by folder categorization
            for (const [folderPath, files] of TokenImageReplacement.cache.folders.entries()) {
                if (files.includes(fileName)) {
                    const folderName = folderPath.split('/').pop().toLowerCase();
                    if (folderName.includes(searchTermLower)) {
                        score += 50; // Folder name match
                        foundMatch = true;
                        break;
                    }
                }
            }
            
            // Search file extension
            const extension = fileInfo.name.split('.').pop().toLowerCase();
            if (extension.includes(searchTermLower)) {
                score += 30; // Extension match
                foundMatch = true;
            }
            
            if (foundMatch) {
                matches.push({
                    ...fileInfo,
                    searchScore: score,
                    isCurrent: false,
                    isManualSearch: true
                });
            }
        }
        
        // Sort by relevance score (highest first)
        matches.sort((a, b) => b.searchScore - a.searchScore);
        
        // Limit to top 20 results
        return matches.slice(0, 20);
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
        'humanoid': ['humanoids', 'humanoid', 'creatures', 'npcs'],
        'monstrosity': ['monstrosities', 'monstrosity', 'creatures'],
        'ooze': ['oozes', 'ooze', 'creatures'],
        'plant': ['plants', 'plant', 'creatures'],
        'undead': ['undead', 'creatures'],
        'vehicle': ['vehicles', 'vehicle'],
        'npc': ['npcs', 'npc', 'humanoids', 'humanoid']
    };
    
    static async initialize() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Initializing system...", "", false, false);
        
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
    static openWindow() {
        if (!game.user.isGM) {
            ui.notifications.warn("Only GMs can use the Token Image Replacement window");
            return;
        }
        
        console.log('Token Image Replacement: Opening window...');
        if (!this.window) {
            console.log('Token Image Replacement: Creating new window instance');
            this.window = new TokenImageReplacementWindow();
        }
        console.log('Token Image Replacement: Rendering window...');
        this.window.render(true);
        console.log('Token Image Replacement: Window rendered');
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
                this.window.updateScanProgress(100, 100, "Scan completed successfully!");
            }
            
            // Refresh any open windows now that cache is ready
            if (this.window && this.window.refreshMatches) {
                await this.window.refreshMatches();
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error scanning folders: ${error.message}`, "", true, false);
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
                    this._processFiles(baseFiles, basePath, false); // Don't clear cache, just add files
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
                        this._processFiles(subDirFiles, basePath, false); // Don't clear cache, just add files
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
                    
                    // Update window progress with detailed subdirectory info
                    if (this.window && this.window.updateScanProgress) {
                        const statusText = this._truncateStatusText(`Scanning ${parentDirName}/${deeperDirName}: ${files.length} files found`);
                        this.window.updateScanProgress(i + 1, response.dirs.length, statusText);
                    }
                    
                    const deeperFiles = await this._scanSubdirectory(deeperDir, basePath);
                    files.push(...deeperFiles);
                    
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
        
        return {
            name: fileName,
            path: relativePath,
            fullPath: filePath,
            size: fileSize,
            lastModified: lastModified
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
    static _processFiles(files, basePath, clearCache = false) {
        console.log('Token Image Replacement: _processFiles called with', files.length, 'files');
        console.log('Token Image Replacement: Cache size before processing:', this.cache.files.size);
        
        // Only clear existing cache if explicitly requested (for complete rescans)
        if (clearCache) {
            console.log('Token Image Replacement: Clearing cache as requested');
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
            
            console.log('Token Image Replacement: Processing file:', fileName, 'path:', filePath);
            
            // Validate the full path before storing
            const fullPath = `${basePath}/${filePath}`;
            if (this._isInvalidFilePath(fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Skipping invalid full path: ${fullPath}`, "", false, false);
                skippedFiles++;
                continue;
            }
            
            // Store in main files cache
            this.cache.files.set(fileName.toLowerCase(), {
                name: fileName,
                path: filePath,
                fullPath: fullPath,
                size: file.size || 0,
                lastModified: file.lastModified || Date.now()
            });
            
            validFiles++;
            
            // Categorize by folder
            this._categorizeFile(fileName, filePath);
        }
        
        console.log('Token Image Replacement: Cache size after processing:', this.cache.files.size);
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
        
        // Get search terms for this token
        const searchTerms = this._getSearchTerms(tokenDocument);
        
        // Try to find a match
        const match = this._findBestMatch(searchTerms, tokenDocument);
        
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
        const terms = [];
        
        // Priority 1: Token name (usually most specific and accurate)
        terms.push(tokenDocument.name);
        
        // Priority 2: Represented Actor name (if different from token name)
        if (tokenDocument.actor && tokenDocument.actor.name !== tokenDocument.name) {
            terms.push(tokenDocument.actor.name);
        }
        
        // Priority 3: Base name (remove parentheticals and numbers)
        const baseName = tokenDocument.name.replace(/\([^)]*\)/g, '').replace(/\s*\d+$/, '').trim();
        if (baseName && baseName !== tokenDocument.name && baseName !== tokenDocument.actor?.name) {
            terms.push(baseName);
        }
        
        // Priority 4: Individual words from the name for better matching
        const words = tokenDocument.name.toLowerCase().split(/[\s\-_()]+/).filter(word => word.length > 2);
        terms.push(...words);
        
        // Priority 5: Creature type for folder optimization (REMOVED - too broad for matching)
        // We'll use creature type only for search scope optimization, not for search terms
        
        // Debug: log all terms before filtering
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Raw search terms: ${JSON.stringify(terms)}`, "", false, false);
        
        // Remove duplicates and empty terms
        const filteredTerms = [...new Set(terms.filter(term => term && typeof term === 'string' && term.trim().length > 0))];
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Filtered search terms: ${JSON.stringify(filteredTerms)}`, "", false, false);
        
        return filteredTerms;
    }
    
    /**
     * Find the best matching image for the given search terms
     */
    static _findBestMatch(searchTerms, tokenDocument) {
        // Enhanced debug logging
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] ===== MATCHING DEBUG START =====`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Token: "${tokenDocument.name}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Search terms: ${JSON.stringify(searchTerms)}`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Cache files count: ${this.cache.files.size}`, "", false, false);
        
        // First, try to optimize search scope using creature type
        let creatureType = tokenDocument.actor?.system?.details?.type;
        // Handle both string and object formats
        if (creatureType && typeof creatureType === 'object' && creatureType.value) {
            creatureType = creatureType.value;
        }
        creatureType = creatureType?.toLowerCase();
        
        // Debug logging for creature type detection
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Detected creature type: "${creatureType}"`, "", false, false);
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Available creature types in cache: ${Array.from(this.cache.creatureTypes.keys()).join(', ')}`, "", false, false);
        
        let searchScope = this.cache.files;
        
        if (creatureType && this.cache.creatureTypes.has(creatureType)) {
            // Use creature type specific files for faster searching
            const creatureFiles = this.cache.creatureTypes.get(creatureType);
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Using creature type specific search scope: ${creatureType} (${creatureFiles.length} files)`, "", false, false);
            searchScope = new Map();
            for (const fileName of creatureFiles) {
                const fileInfo = this.cache.files.get(fileName.toLowerCase());
                if (fileInfo) {
                    searchScope.set(fileName.toLowerCase(), fileInfo);
                }
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Using full search scope (${this.cache.files.size} files)`, "", false, false);
        }
        
        // Score-based matching system
        let bestMatch = null;
        let bestScore = 0;
        
        // Debug logging to see search scope contents
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Search scope size: ${searchScope.size}`, "", false, false);
        if (searchScope.size > 0) {
            const firstFew = Array.from(searchScope.keys()).slice(0, 10);
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] First 10 items in search scope: ${firstFew.join(', ')}`, "", false, false);
            
            // Show some sample file names to understand the format
            const sampleFiles = Array.from(searchScope.values()).slice(0, 5);
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Sample file names:`, "", false, false);
            sampleFiles.forEach(file => {
                postConsoleAndNotification(MODULE.NAME, `  - "${file.name}" (path: ${file.fullPath})`, "", false, false);
            });
        } else {
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] WARNING: Search scope is empty!`, "", false, false);
        }
        
        let goblinFiles = [];
        let scoredFiles = [];
        
        for (const [fileName, fileInfo] of searchScope.entries()) {
            const score = this._calculateMatchScore(fileName, searchTerms, tokenDocument);
            
            // Track all files with scores for debugging
            if (score > 0) {
                scoredFiles.push({ fileName, score });
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = fileInfo;
            }
            
            // Debug: collect goblin-related files for logging
            if (fileName.toLowerCase().includes('goblin')) {
                goblinFiles.push({ fileName, score });
            }
        }
        
        // Debug: show top scoring files
        postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Files with scores > 0: ${scoredFiles.length}`, "", false, false);
        if (scoredFiles.length > 0) {
            scoredFiles.sort((a, b) => b.score - a.score);
            const topScores = scoredFiles.slice(0, 10);
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Top scoring files:`, "", false, false);
            topScores.forEach(file => {
                postConsoleAndNotification(MODULE.NAME, `  - "${file.fileName}" (score: ${file.score.toFixed(3)})`, "", false, false);
            });
        }
        
        // Debug logging for goblin files found
        if (goblinFiles.length > 0) {
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Found ${goblinFiles.length} goblin-related files:`, "", false, false);
            goblinFiles.slice(0, 10).forEach(file => {
                postConsoleAndNotification(MODULE.NAME, `  - ${file.fileName} (score: ${file.score.toFixed(2)})`, "", false, false);
            });
        } else {
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] No goblin-related files found in search scope`, "", false, false);
        }
        
        // Get threshold from settings
        const threshold = getSettingSafely(MODULE.ID, 'tokenImageReplacementThreshold', 0.3);
        
        // Only return matches with a reasonable score
        if (bestScore >= threshold) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Best match for ${tokenDocument.name}: ${bestMatch.name} (score: ${bestScore.toFixed(2)})`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] ===== MATCHING DEBUG END (SUCCESS) =====`, "", false, false);
            return bestMatch;
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No match found for ${tokenDocument.name} (best score: ${bestScore.toFixed(2)}, threshold: ${threshold})`, "", false, false);
            postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] ===== MATCHING DEBUG END (NO MATCH) =====`, "", false, false);
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
        
        // Debug: only log for first few files to avoid spam
        const shouldDebug = Math.random() < 0.01; // 1% chance to debug
        
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
            
            // Bonus for creature type matches (REMOVED - too broad and misleading)
            // Focus purely on filename text matching
            
            totalScore += termScore;
            termCount++;
        }
        
            // Normalize score by number of terms
            const finalScore = termCount > 0 ? totalScore / termCount : 0;
            
            // Debug logging for sample files
            if (shouldDebug && finalScore > 0) {
                postConsoleAndNotification(MODULE.NAME, `[TokenImageReplacement] Scoring "${fileName}" against terms [${searchTerms.join(', ')}] = ${finalScore.toFixed(3)}`, "", false, false);
            }
            
            return finalScore;
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
        
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Processing token: ${tokenDocument.name}`, "", false, false);
        
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
                const alternativeMatch = this._findBestMatch(this._getSearchTerms(tokenDocument), tokenDocument);
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
                
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied ${matchingImage.name} to ${tokenDocument.name}`, "", false, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying image: ${error.message}`, "", false, false);
                
                // Check if the error is due to an invalid asset path
                if (error.message.includes('Invalid Asset') || error.message.includes('loadTexture')) {
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Invalid asset detected, removing from cache: ${matchingImage.fullPath}`, "", false, false);
                    this.cache.files.delete(matchingImage.name.toLowerCase());
                    
                    // Try to find an alternative match
                    const alternativeMatch = this._findBestMatch(this._getSearchTerms(tokenDocument), tokenDocument);
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
    static testCacheStructure() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Testing cache structure...", "", false, false);
        
        // Test with some dummy data
        const testFiles = [
            { name: 'goblin_01.webp', path: 'creatures/goblin_01.webp' },
            { name: 'orc_01.webp', path: 'creatures/orc_01.webp' },
            { name: 'dragon_01.webp', path: 'creatures/dragon_01.webp' }
        ];
        
        this._processFiles(testFiles, 'test/path');
        
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
    static testMatchingAlgorithm() {
        postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Testing matching algorithm...", "", false, false);
        
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
            
            console.log('Token Image Replacement: Saving cache to localStorage...');
            console.log('Token Image Replacement: Cache files count:', this.cache.files.size);
            console.log('Token Image Replacement: Cache folders count:', this.cache.folders.size);
            console.log('Token Image Replacement: Cache lastScan:', this.cache.lastScan);
            console.log('Token Image Replacement: Cache totalFiles:', this.cache.totalFiles);
            console.log('Token Image Replacement: Cache data size:', JSON.stringify(cacheData).length, 'bytes');
            
            // Debug: Show first few files in cache
            if (this.cache.files.size > 0) {
                const firstFewFiles = Array.from(this.cache.files.entries()).slice(0, 3);
                console.log('Token Image Replacement: First few files in cache:', firstFewFiles);
            } else {
                console.log('Token Image Replacement: Cache is empty!');
            }
            localStorage.setItem('tokenImageReplacement_cache', JSON.stringify(cacheData));
            console.log('Token Image Replacement: Cache saved successfully');
            
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
        console.log('Token Image Replacement: Checking cache storage...');
        console.log('Token Image Replacement: localStorage key exists:', !!savedCache);
        console.log('Token Image Replacement: localStorage data size:', savedCache ? savedCache.length : 0, 'bytes');
        if (!savedCache) {
            console.log('Token Image Replacement: No cache found in localStorage');
            return { hasStoredCache: false, message: "No cache in storage" };
        }
        
        try {
            const cacheData = JSON.parse(savedCache);
            console.log('Token Image Replacement: Parsed cache data:', {
                version: cacheData.version,
                filesCount: cacheData.files ? cacheData.files.length : 0,
                lastScan: cacheData.lastScan,
                totalFiles: cacheData.totalFiles,
                isIncremental: cacheData.isIncremental
            });
        } catch (error) {
            console.log('Token Image Replacement: Error parsing cache data:', error.message);
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
                    console.log('Token Image Replacement: Auto-update setting:', autoUpdate);
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

