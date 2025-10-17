// ================================================================== 
// ===== TOKEN IMAGE REPLACEMENT CACHING SYSTEM =====================
// ================================================================== 

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { ImageMatching } from './manager-image-matching.js';
import { TokenImageUtilities } from './token-image-utilities.js';

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
        if (!ImageCacheManager.cache || !ImageCacheManager.cache.files) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache not available in _getFilteredFiles`, "", true, false);
            return [];
        }
        
        // Get all files from cache
        const allFiles = Array.from(ImageCacheManager.cache.files.values());
        
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
            const searchTerms = ImageCacheManager._getSearchTerms(this.selectedToken.document);
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Selected filter - Search terms: ${searchTerms.join(', ')}`, "", true, false);
            processedTerms = searchTerms
                .filter(term => term && term.length >= 2)
                .map(term => term.toLowerCase());
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Selected filter - Processed terms: ${processedTerms.join(', ')}`, "", true, false);
        }
        
        const filteredFiles = allFiles.filter((file, index) => {
        
            // Extract relative path from fullPath if path is empty
            let path = file.path || '';
            if (!path && file.fullPath) {
                const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', '');
                path = file.fullPath.replace(`${basePath}/`, '');
            }
            const fileName = file.name || '';
            
            // Check if the file matches the current category filter
            switch (this.currentFilter) {
                case 'favorites':
                    // Only show files that have the FAVORITE tag
                    // Use the file object directly (we're already iterating over cache.files.values())
                    const hasFavorite = file.metadata?.tags?.includes('FAVORITE') || false;
                    
                    return hasFavorite;
                case 'selected':
                    // Only show files that match the selected token's characteristics
                    if (!this.selectedToken || !processedTerms) return false;
                    
                    // Check if file matches any of the token's search terms
                    const fileText = `${path} ${fileName}`.toLowerCase();
                    return processedTerms.some(term => fileText.includes(term));
                default:
                    // For category filters, check if file is in that category folder
                    // Cache stores RELATIVE paths, so first part is the category
                    const pathParts = path.split('/').filter(p => p);
                    
                    // Category is first part of relative path
                    let categoryFolder = null;
                    if (pathParts.length > 0) {
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
                        const searchTerms = ImageCacheManager._getSearchTerms(this.selectedToken.document);
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

    getData() {
        // Use only the static cache state as source of truth
        const systemScanning = ImageCacheManager.cache.isScanning;
        
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
            overallProgress: ImageCacheManager.cache.overallProgress,
            totalSteps: ImageCacheManager.cache.totalSteps,
            overallProgressPercentage: ImageCacheManager.cache.totalSteps > 0 ? Math.round((ImageCacheManager.cache.overallProgress / ImageCacheManager.cache.totalSteps) * 100) : 0,
            currentStepName: ImageCacheManager.cache.currentStepName,
            currentStepProgress: ImageCacheManager.cache.currentStepProgress,
            currentStepTotal: ImageCacheManager.cache.currentStepTotal,
            currentStepProgressPercentage: ImageCacheManager.cache.currentStepTotal > 0 ? Math.round((ImageCacheManager.cache.currentStepProgress / ImageCacheManager.cache.currentStepTotal) * 100) : 0,
            currentPath: ImageCacheManager.cache.currentPath,
            currentFileName: ImageCacheManager.cache.currentFileName,
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
        // ALWAYS show original/current images when a token is selected, regardless of search mode
        if (this.selectedToken) {
            // Add original image as the very first card
            const originalImage = TokenImageUtilities.getOriginalImage(this.selectedToken.document);
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
        if (!ImageCacheManager.cache) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache not initialized in _findMatches`, "", true, false);
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'Cache not initialized. Please wait for cache to load.';
            this._updateResults();
            return;
        }
        
        if (ImageCacheManager.cache.isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (ImageCacheManager.cache.isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'Images are being scanned to build the image cache and may impact performance.';
        } else if (ImageCacheManager.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache check - files.size: ${ImageCacheManager.cache.files.size}, cache exists: ${!!ImageCacheManager.cache}`, "", true, false);
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
                
                if (this.searchTerm && this.searchTerm.length >= 3) {
                    // SEARCH MODE: Use search term matching (highest priority)
                    searchMode = 'search';
                    searchTerms = this.searchTerm;
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Using SEARCH MODE (search term takes priority)`, "", true, false);
                } else if (this.currentFilter === 'selected' && this.selectedToken) {
                    // SELECTED TAB + token selected: Use token-based matching
                    searchMode = 'token';
                    searchTerms = null; // Use token-based matching instead of search terms
                    tokenDocument = this.selectedToken.document;
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Using TOKEN MODE (SELECTED tab with token)`, "", true, false);
                } else if (this.currentFilter === 'selected' && !this.selectedToken) {
                    // SELECTED TAB but no token selected: Show no results
                    this.allMatches = [];
                    this._updateResults();
                    return;
                } else {
                    // ALL tabs or other tabs: Use browse mode (no scores)
                    searchMode = 'browse';
                    postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: DEBUG (_findMatches) - Using BROWSE MODE (no scores)`, "", true, false);
                }
                
                // Otherwise: BROWSE MODE (no search terms)
                
                // Apply unified matching
                // Apply threshold only on SELECTED tab
                const applyThreshold = this.currentFilter === 'selected';
                const matchedResults = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, searchTerms, tokenDocument, searchMode, ImageCacheManager.cache, ImageCacheManager._extractTokenData, applyThreshold);
                
                // Filter out any results that are the current image to avoid duplicates
                const filteredResults = matchedResults.filter(result => !result.isCurrent);
                this.allMatches.push(...filteredResults);
                
                // Deduplicate results to prevent same file appearing multiple times
                this.allMatches = this._deduplicateResults(this.allMatches);
                
                
                // Calculate score for current image if it exists
                if (this.selectedToken && this.allMatches.length > 0) {
                    const currentImage = this.allMatches.find(match => match.isCurrent);
                    if (currentImage) {
                        const searchTerms = ImageCacheManager._getSearchTerms(this.selectedToken.document);
                        const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                            name: currentImage.name,
                            path: currentImage.fullPath,
                            metadata: currentImage.metadata
                        };
                        currentImage.searchScore = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', ImageCacheManager.cache);
                        
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
            await ImageCacheManager._saveCacheToStorage(true); // Incremental save

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
            const existingOriginal = TokenImageUtilities.getOriginalImage(this.selectedToken.document);
            if (!existingOriginal) {
                await TokenImageUtilities.storeOriginalImage(this.selectedToken.document);
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
            await ImageCacheManager.scanForImages();
            
            // Check if we have completion data to show
            if (ImageCacheManager.cache.justCompleted && ImageCacheManager.cache.completionData) {
                const data = ImageCacheManager.cache.completionData;
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
        const paused = ImageCacheManager.pauseCache();
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
                await ImageCacheManager.deleteCache();
                ui.notifications.info("Cache deleted successfully");
                this.render();
            } catch (error) {
                ui.notifications.error(`Failed to delete cache: ${error.message}`);
            }
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
        
        // Update cache properties so template can read them
        ImageCacheManager.cache.currentStepProgress = current;
        ImageCacheManager.cache.currentStepTotal = total;
        
        this.render();
    }

    // Method to complete scan
    completeScan() {
        this.scanProgress = 0;
        this.scanTotal = 0;
        this.scanStatusText = "Scanning Token Images...";
        
        // Reset cache properties
        ImageCacheManager.cache.currentStepProgress = 0;
        ImageCacheManager.cache.currentStepTotal = 0;
        
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
            if (!ImageCacheManager.cache || ImageCacheManager.cache.files.size === 0) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cache not initialized, initializing...`, "", true, false);
                await ImageCacheManager._initializeCache();
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


    async _performSearch(searchTerm) {
        if (ImageCacheManager.cache.files.size === 0) {
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
        const searchResults = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, searchTerm, null, 'search', ImageCacheManager.cache, ImageCacheManager._extractTokenData, false);
        
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
                const searchTerms = ImageCacheManager._getSearchTerms(this.selectedToken.document);
                const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                    name: currentImage.name,
                    path: currentImage.fullPath,
                    metadata: currentImage.metadata
                };
                currentImage.searchScore = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', ImageCacheManager.cache);
                
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
                for (const [creatureType, files] of ImageCacheManager.cache.creatureTypes.entries()) {
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
                for (const [folderPath, files] of ImageCacheManager.cache.folders.entries()) {
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
        const isSearchMode = this.searchTerm && this.searchTerm.length >= 3;
        const hasOnlyOriginalCurrent = this.matches.length > 0 && this.matches.every(match => match.isOriginal || match.isCurrent);
        
        if (this.matches.length === 0) {
            // Check if we're in search mode with no results
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
        let html = this.matches.map(match => {
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
                        <!-- DEBUG: Tags count: ${tags.length} -->
                    </div>
                </div>
            `;
        }).join('');
        
        // If we have matches but only original/current in search mode, add "No Results" message after them
        if (isSearchMode && hasOnlyOriginalCurrent) {
            html += `
                <!-- Show "No Results" message for search -->
                <div class="tir-thumbnail-item tir-no-matches">
                    <!-- Image -->
                    <div class="tir-no-matches-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <!-- Description -->
                    <div class="tir-no-matches-text">
                        <p>No Results</p>
                        <p><span class="tir-thumbnail-tag">NO RESULTS</span></p>
                    </div>
                </div>
            `;
        }
        
        return html;
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
        
        // Add metadata tags
        if (match.metadata && match.metadata.tags) {
            match.metadata.tags.forEach(tag => {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            });
        }
        
        // Add creature type tags (same logic as _getTagsForFile)
        const fileName = match.name || '';
        for (const [creatureType, files] of ImageCacheManager.cache.creatureTypes.entries()) {
            if (Array.isArray(files) && files.includes(fileName)) {
                const cleanType = creatureType.toLowerCase().replace(/\s+/g, '');
                if (!tags.includes(cleanType)) {
                    tags.push(cleanType);
                }
            }
        }
        
        // Add folder path tags (same logic as _getTagsForFile)
        if (match.path) {
            // Cache stores RELATIVE paths, so first part is the category
            const pathParts = match.path.split('/').filter(p => p);
            
            // Category is first part of relative path
            let topLevel = null;
            if (pathParts.length > 0) {
                topLevel = pathParts[0];
            }
            
            // Skip ignored folders (use user setting)
            const ignoredFoldersSetting = getSettingSafely(MODULE.ID, 'tokenImageReplacementIgnoredFolders', '');
            const ignoredFolders = ignoredFoldersSetting 
                ? ignoredFoldersSetting.split(',').map(f => f.trim()).filter(f => f)
                : [];
            if (topLevel && !ignoredFolders.includes(topLevel)) {
                const cleanFolder = topLevel.toLowerCase().replace(/\s+/g, '');
                if (!tags.includes(cleanFolder)) {
                    tags.push(cleanFolder);
                }
            }
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
            // Search mode never applies threshold
            this.allMatches = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, this.searchTerm, null, 'search', ImageCacheManager.cache, ImageCacheManager._extractTokenData, false);
        } else {
            // Browse mode never applies threshold
            this.allMatches = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, null, null, 'browse', ImageCacheManager.cache, ImageCacheManager._extractTokenData, false);
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
        let fileInfo = ImageCacheManager.cache.files.get(exactKey);
        if (fileInfo) {
            return fileInfo;
        }
        
        // Try removing special characters and matching
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
        if (cleanFileName !== exactKey) {
            fileInfo = ImageCacheManager.cache.files.get(cleanFileName);
            if (fileInfo) {
                return fileInfo;
            }
        }
        
        // Try fuzzy matching by iterating through cache keys
        for (const [cacheKey, cacheValue] of ImageCacheManager.cache.files.entries()) {
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
        for (const [creatureType, files] of ImageCacheManager.cache.creatureTypes.entries()) {
            if (Array.isArray(files) && files.includes(fileName)) {
                const cleanType = creatureType.toLowerCase().replace(/\s+/g, '');
                if (!tags.includes(cleanType)) {
                    tags.push(cleanType);
                }
            }
        }
        
        // Add folder path tags (use ignored folders setting)
        if (file.path) {
            // Cache stores RELATIVE paths, so first part is the category
            const pathParts = file.path.split('/').filter(p => p);
            const ignoredFoldersSetting = getSettingSafely(MODULE.ID, 'tokenImageReplacementIgnoredFolders', '');
            const ignoredFolders = ignoredFoldersSetting 
                ? ignoredFoldersSetting.split(',').map(f => f.trim()).filter(f => f)
                : [];
            
            // Only add the category folder (first part of relative path)
            if (pathParts.length > 0) {
                const category = pathParts[0];
                if (category && !ignoredFolders.includes(category)) {
                    const cleanCategory = category.toLowerCase().replace(/\s+/g, '');
                    if (!tags.includes(cleanCategory)) {
                        tags.push(cleanCategory);
                    }
                }
            }
        }
        
        return tags;
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
                const score = await ImageMatching._calculateRelevanceScore(match, searchTerms, this.selectedToken.document, 'token', ImageCacheManager.cache);
                
                if (score > bestScore && score >= threshold) {
                    bestScore = score;
                    bestMatch = match;
                }
                continue;
            }
            
            // Calculate score using unified algorithm
            const score = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', ImageCacheManager.cache);
            
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = match;
            }
        }
        
        // Log recommended token breakdown if we found a match
        if (bestMatch) {
            const tokenData = ImageCacheManager._extractTokenData(this.selectedToken.document);
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
        if (ImageCacheManager.cache.files.size === 0) {
            return "No cache in storage";
        }
        
        const fileCount = ImageCacheManager.cache.files.size;
        const lastScan = ImageCacheManager.cache.lastScan;
        
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
        if (ImageCacheManager.cache.isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (ImageCacheManager.cache.isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'Images are being scanned to build the image cache and may impact performance.';
        } else if (ImageCacheManager.cache.justCompleted && ImageCacheManager.cache.completionData) {
            this.notificationIcon = 'fas fa-check-circle';
            let notificationText = `Scan Complete! Found ${ImageCacheManager.cache.completionData.totalFiles} files across ${ImageCacheManager.cache.completionData.totalFolders} folders in ${ImageCacheManager.cache.completionData.timeString}`;
            if (ImageCacheManager.cache.completionData.ignoredFiles > 0) {
                notificationText += ` (${ImageCacheManager.cache.completionData.ignoredFiles} files ignored)`;
            }
            this.notificationText = notificationText;
        } else if (ImageCacheManager.cache.files.size === 0) {
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'No Image Cache Found - Please scan for images.';
        } else {
            // Cache exists and is working normally - no notification needed
            this.notificationIcon = null;
            this.notificationText = null;
        }
    }

    _getCategories() {
        // Use the new cache-based category discovery
        const discoveredCategories = ImageCacheManager.getDiscoveredCategories();
        
        // Convert to array of category objects for template
        const categories = [];
        for (const categoryName of discoveredCategories) {
            // Count files in this category
            const fileCount = this._countFilesInCategory(categoryName);
            
            categories.push({
                name: ImageCacheManager._cleanCategoryName(categoryName),
                key: categoryName.toLowerCase(),
                count: fileCount,
                isActive: this.currentFilter === categoryName.toLowerCase()
            });
        }
        
        return categories;
    }

    /**
     * Count files in a specific category
     * @param {string} categoryName - The category name to count files for
     * @returns {number} The number of files in this category
     */
    _countFilesInCategory(categoryName) {
        let count = 0;
        
        for (const fileInfo of ImageCacheManager.cache.files.values()) {
            // Extract relative path from fullPath if path is empty
            let relativePath = fileInfo.path || '';
            if (!relativePath && fileInfo.fullPath) {
                const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', '');
                relativePath = fileInfo.fullPath.replace(`${basePath}/`, '');
            }
            
            // First part of relative path is the category
            const pathParts = relativePath.split('/').filter(p => p);
            let fileCategory = null;
            if (pathParts.length > 0) {
                fileCategory = pathParts[0];
            }
            
            if (fileCategory === categoryName) {
                count++;
            }
        }
        
        return count;
    }

    _getAggregatedTags() {
        const tagCounts = new Map();
        
        // Check if we're in category mode (no search term)
        const isCategoryMode = !this.searchTerm;
        
        if (isCategoryMode) {
            // Category mode: Show ALL tags for this category
            const allFiles = Array.from(ImageCacheManager.cache.files.values());
            let categoryFiles;
            if (this.currentFilter === 'all') {
                categoryFiles = allFiles;  // For 'all', use all files
            } else if (this.currentFilter === 'selected') {
                // For 'selected', filter by token characteristics
                if (!this.selectedToken) {
                    categoryFiles = []; // No files if no token selected
                } else {
                    const searchTerms = ImageCacheManager._getSearchTerms(this.selectedToken.document);
                    const processedTerms = searchTerms
                        .filter(term => term && term.length >= 2)
                        .map(term => term.toLowerCase());
                    
                    categoryFiles = allFiles.filter(file => {
                        // Extract relative path from fullPath if path is empty
                        let path = file.path || '';
                        if (!path && file.fullPath) {
                            const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', '');
                            path = file.fullPath.replace(`${basePath}/`, '');
                        }
                        const fileName = file.name || '';
                        const fileText = `${path} ${fileName}`.toLowerCase();
                        return processedTerms.some(term => fileText.includes(term));
                    });
                }
            } else if (this.currentFilter === 'favorites') {
                // For favorites, filter by FAVORITE tag
                categoryFiles = allFiles.filter(file => {
                    return file.metadata?.tags?.includes('FAVORITE') || false;
                });
            } else {
                // For other categories, filter by folder
                categoryFiles = allFiles.filter(file => {
                    // Extract relative path from fullPath if path is empty
                    let path = file.path || '';
                    if (!path && file.fullPath) {
                        const basePath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', '');
                        path = file.fullPath.replace(`${basePath}/`, '');
                    }
                    // First part of relative path is the category
                    const pathParts = path.split('/').filter(p => p);
                    
                    let categoryFolder = null;
                    if (pathParts.length > 0) {
                        categoryFolder = pathParts[0];
                    }
                    
                    return categoryFolder ? categoryFolder.toLowerCase() === this.currentFilter : false;
                });
            }
            
            // Count ALL tags from all files in this category (metadata + creature types + folders)
            categoryFiles.forEach(file => {
                const allTags = this._getTagsForFile(file);  // Gets ALL tag types!
                allTags.forEach(tag => {
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                });
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
     * Add double-middle-click handler for tokens
     */
    static _addMiddleClickHandler() {
        // Store the handler function so we can remove it later
        this._middleClickHandler = (event) => {
            // Check if it's a double-middle-click (button 1 with double-click timing)
            if (event.button === 1 && event.detail === 2) {
                // Find the token under the mouse
                const token = canvas.tokens.placeables.find(t => t.hover);
                if (token) {
                    event.preventDefault();
                    // Select the token first
                    token.control({ releaseOthers: true });
                    // Then open the window
                    ImageCacheManager.openWindow();
                }
            }
        };
        
        // Add event listener directly
        document.addEventListener('mousedown', this._middleClickHandler);
    }

    /**
     * Remove double-middle-click handler
     */
    static _removeMiddleClickHandler() {
        if (this._middleClickHandler) {
            document.removeEventListener('mousedown', this._middleClickHandler);
            this._middleClickHandler = null;
        }
    }

    /**
     * Open the Token Image Replacement window
     */
    static async openWindow() {
        if (!game.user.isGM) {
            ui.notifications.warn("Only GMs can use the Token Image Replacement window");
            return;
        }
        
        // Check if there's already an open window
        const existingWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
        if (existingWindow) {
            existingWindow.render(true);
            return;
        }
        
        // Create new window
        const window = new TokenImageReplacementWindow();
        
        // Check for selected token before rendering
        await window._checkForSelectedToken();
        
        window.render(true);
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
        postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Hook fired for token: ${tokenDocument.name}`, "", true, false);
        
        // Only GMs can update tokens - skip for non-GM users
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - user is not GM", "", true, false);
            return;
        }
        
        // Store the original image before any updates
        await TokenImageUtilities.storeOriginalImage(tokenDocument);
        
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
        if (ImageCacheManager.cache.files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - cache not ready", "", true, false);
            return;
        }
        
        // Extract token data
        const tokenData = ImageCacheManager._extractTokenData(tokenDocument);
        
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
        
        // Find matching image using unified matching system (same as SELECTED mode)
        // Get all files from cache (no UI filtering for dropped tokens)
        const allFiles = Array.from(ImageCacheManager.cache.files.values());
        
        // Use unified matching with token mode (same parameters as SELECTED mode)
        const matches = await ImageMatching._applyUnifiedMatching(allFiles, null, tokenDocument, 'token', ImageCacheManager.cache, ImageCacheManager._extractTokenData, true);
        
        // Get the best match (highest score)
        const matchingImage = matches.length > 0 ? matches[0] : null;
        
        if (matchingImage) {
            // Validate the image path before applying
            if (ImageCacheManager._isInvalidFilePath(matchingImage.fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cannot apply invalid image path to ${tokenDocument.name}: ${matchingImage.fullPath}`, "", true, false);
                
                // Clean up the invalid path from cache to prevent future issues
                ImageCacheManager.cache.files.delete(matchingImage.name.toLowerCase());
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Removed invalid path from cache: ${matchingImage.name}`, "", true, false);
                
                // Try to find an alternative match using unified matching system
                // Get current filter from any open window
                let currentFilter = 'all';
                const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
                if (openWindow) {
                    currentFilter = openWindow.currentFilter;
                }
                
                // Get all files from cache (no UI filtering for error recovery)
                const filesToSearch = Array.from(ImageCacheManager.cache.files.values());
                // Apply threshold based on current filter (like main window)
                const applyThreshold = currentFilter === 'selected';
                const matches = await ImageMatching._applyUnifiedMatching(filesToSearch, null, tokenDocument, 'token', ImageCacheManager.cache, ImageCacheManager._extractTokenData, applyThreshold);
                const alternativeMatch = matches.length > 0 ? matches[0] : null;
                if (alternativeMatch && !ImageCacheManager._isInvalidFilePath(alternativeMatch.fullPath)) {
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
                    ImageCacheManager.cache.files.delete(matchingImage.name.toLowerCase());
                    
                    // Try to find an alternative match using unified matching system
                    // Get current filter from any open window
                    let currentFilter = 'all';
                    const openWindow = Object.values(ui.windows).find(w => w instanceof TokenImageReplacementWindow);
                    if (openWindow) {
                        currentFilter = openWindow.currentFilter;
                    }
                    
                    // Get all files from cache (no UI filtering for error recovery)
                    const filesToSearch = Array.from(ImageCacheManager.cache.files.values());
                    // Apply threshold based on current filter (like main window)
                    const applyThreshold = currentFilter === 'selected';
                    const matches = await ImageMatching._applyUnifiedMatching(filesToSearch, null, tokenDocument, 'token', ImageCacheManager.cache, ImageCacheManager._extractTokenData, applyThreshold);
                    const alternativeMatch = matches.length > 0 ? matches[0] : null;
                    if (alternativeMatch && !ImageCacheManager._isInvalidFilePath(alternativeMatch.fullPath)) {
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

