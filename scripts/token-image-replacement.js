// ================================================================== 
// ===== TOKEN IMAGE REPLACEMENT CACHING SYSTEM =====================
// ================================================================== 

import { MODULE, BLACKSMITH } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { ImageMatching } from './manager-image-matching.js';
import { TokenImageUtilities } from './token-image-utilities.js';
import { getImagePaths, getPortraitImagePaths } from './settings.js';

/**
 * Token Image Replacement Window
 */
export class TokenImageReplacementWindow extends Application {
    constructor(options = {}) {
        super(options);
        // Get last used mode from settings, default to 'token'
        this.mode = game.settings.get(MODULE.ID, 'tokenImageReplacementLastMode') || 'token';
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
        this.scanStatusText = this.mode === ImageCacheManager.MODES.PORTRAIT ? "Scanning Portrait Images..." : "Scanning Token Images...";
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
        
        // Tag sort mode
        this.tagSortMode = getSettingSafely(MODULE.ID, 'tokenImageReplacementTagSortMode', 'count'); // Current tag sort mode
        
        // Search result caching (Phase 1.1 Optimization)
        this._searchResultCache = new Map(); // Cache: searchKey → {results, timestamp}
        this._searchCacheMaxSize = 50; // Maximum cached searches
        this._searchCacheTTL = 300000; // Cache lifetime: 5 minutes (300000ms)

        // Lifecycle tracking for cleanup
        this._domEventDisposers = [];
        this._trackedTimeouts = new Set();
        this._teardownExecuted = false;
        this._hookRegistrationTimeoutId = null;
        this._activeImageElements = new Set();
    }

    /**
     * Get mode-specific label for messages
     * @returns {string} "Token" or "Portrait"
     */
    _getModeLabel() {
        return this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
    }

    /**
     * Get mode-specific prefix for log messages
     * @returns {string} "Portrait Image Replacement:" or "Token Image Replacement:"
     */
    _getModePrefix() {
        return `${this._getModeLabel()} Image Replacement:`;
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
     * Track DOM event bindings for cleanup
     * @param {JQuery} html - root element
     * @param {string} selector - target selector
     * @param {string} eventName - event to bind
     * @param {Function} handler - handler bound to this instance
     * @param {boolean} delegate - whether to delegate from root
     */
    _registerDomEvent(html, selector, eventName, handler, delegate = false) {
        if (!html) return;
        
        // v13: Handle both jQuery and native DOM (html parameter may still be jQuery)
        let htmlElement;
        if (html && typeof html.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            htmlElement = html[0] || html.get?.(0);
        } else if (html && typeof html.querySelectorAll === 'function') {
            // It's already a native DOM element
            htmlElement = html;
        } else {
            return;
        }
        
        if (!htmlElement) {
            return;
        }
        
        const boundHandler = handler.bind(this);
        if (delegate) {
            // Event delegation: listen on htmlElement, check if target matches selector
            const delegatedHandler = (event) => {
                const target = event.target.closest(selector);
                if (target) {
                    // Create a synthetic event with currentTarget set to the matched element
                    // This ensures handlers can use event.currentTarget correctly
                    // Use a Proxy to intercept currentTarget access while preserving all other event properties
                    const syntheticEvent = new Proxy(event, {
                        get: (obj, prop) => {
                            if (prop === 'currentTarget') {
                                return target;
                            }
                            // For methods, bind them to the original event object to preserve 'this' context
                            const value = obj[prop];
                            if (typeof value === 'function') {
                                return value.bind(obj);
                            }
                            return value;
                        },
                        has: (obj, prop) => {
                            if (prop === 'currentTarget') {
                                return true;
                            }
                            return prop in obj;
                        },
                        ownKeys: (obj) => {
                            const keys = Reflect.ownKeys(obj);
                            if (!keys.includes('currentTarget')) {
                                return [...keys, 'currentTarget'];
                            }
                            return keys;
                        },
                        getOwnPropertyDescriptor: (obj, prop) => {
                            if (prop === 'currentTarget') {
                                return {
                                    enumerable: true,
                                    configurable: true,
                                    value: target,
                                    writable: false
                                };
                            }
                            return Reflect.getOwnPropertyDescriptor(obj, prop);
                        }
                    });
                    boundHandler.call(this, syntheticEvent);
                }
            };
            htmlElement.addEventListener(eventName, delegatedHandler);
            this._domEventDisposers.push(() => htmlElement.removeEventListener(eventName, delegatedHandler));
            return;
        }
        const targets = htmlElement.querySelectorAll(selector);
        if (targets.length === 0) return;
        targets.forEach(target => {
            target.addEventListener(eventName, boundHandler);
            this._domEventDisposers.push(() => target.removeEventListener(eventName, boundHandler));
        });
    }

    /**
     * Remove all tracked DOM event bindings
     */
    _clearDomEvents() {
        while (this._domEventDisposers.length > 0) {
            const disposer = this._domEventDisposers.pop();
            try {
                disposer();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Error clearing DOM event: ${error.message}`, "", false, false);
            }
        }
    }

    /**
     * Track timeouts for cleanup
     */
    _scheduleTrackedTimeout(callback, delay) {
        const timeoutId = window.setTimeout(() => {
            this._trackedTimeouts.delete(timeoutId);
            callback();
        }, delay);
        this._trackedTimeouts.add(timeoutId);
        return timeoutId;
    }

    _cancelTrackedTimeout(timeoutId) {
        if (!timeoutId) return null;
        clearTimeout(timeoutId);
        this._trackedTimeouts.delete(timeoutId);
        return null;
    }

    _cancelAllTrackedTimeouts() {
        for (const timeoutId of this._trackedTimeouts) {
            clearTimeout(timeoutId);
        }
        this._trackedTimeouts.clear();
    }

    /**
     * Tear down DOM references, listeners, and timers so the window releases memory
     */
    _teardownWindowResources() {
        if (this._teardownExecuted) {
            return;
        }
        this._teardownExecuted = true;

        // Ensure no DOM events remain bound to detached nodes
        this._clearDomEvents();

        // Cancel timers
        this.searchTimeout = this._cancelTrackedTimeout(this.searchTimeout);
        this._hookRegistrationTimeoutId = this._cancelTrackedTimeout(this._hookRegistrationTimeoutId);
        this._tokenSelectionDebounceTimer = this._cancelTrackedTimeout(this._tokenSelectionDebounceTimer);
        this._cancelAllTrackedTimeouts();

        // Release image references so decoded textures can be GC'd
        this._activeImageElements.forEach(img => {
            try {
                img.src = '';
            } catch (error) {
                // Ignore cleanup errors so teardown always finishes
            }
        });
        this._activeImageElements.clear();

        const element = this.element;
        if (element) {
            // Remove any lingering listeners that were attached outside _registerDomEvent
            // (Already handled by _clearDomEvents above)
            if (element.parentNode) {
                element.remove();
            }
        }

        // Drop heavy references
        this.matches = [];
        this.allMatches = [];
        this.selectedToken = null;
        this._cachedSearchTerms = null;
        this.selectedTags.clear();
        this._lastProcessedTokenId = null;
        this._searchResultCache.clear();
    }

    /**
     * Show the search spinner overlay
     */
    _showSearchSpinner() {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let htmlElement;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            htmlElement = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            htmlElement = this.element;
        } else {
            return;
        }
        
        if (!htmlElement) {
            return;
        }
        
        const spinner = htmlElement.querySelector('.tir-search-spinner');
        if (spinner) spinner.classList.remove('hidden');
    }

    /**
     * Hide the search spinner overlay
     */
    _hideSearchSpinner() {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let htmlElement;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            htmlElement = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            htmlElement = this.element;
        } else {
            return;
        }
        
        if (!htmlElement) {
            return;
        }
        
        const spinner = htmlElement.querySelector('.tir-search-spinner');
        if (spinner) spinner.classList.add('hidden');
    }



    /**
     * Apply category filter to search results
     */
    _getFilteredFiles() {
        // Safety check for cache
        if (!ImageCacheManager.getCache(this.mode) || !ImageCacheManager.getCache(this.mode).files) {
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Cache not available in _getFilteredFiles`, "", true, false);
            return [];
        }
        
        // Get all files from cache
        const allFiles = Array.from(ImageCacheManager.getCache(this.mode).files.values());
        
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
            const searchTerms = this.mode === ImageCacheManager.MODES.PORTRAIT 
                ? ImageCacheManager._getSearchTerms(this.selectedToken, this.mode)
                : ImageCacheManager._getSearchTerms(this.selectedToken.document, this.mode);
            processedTerms = searchTerms
                .filter(term => term && term.length >= 2)
                .map(term => term.toLowerCase());
        }
        
        const filteredFiles = allFiles.filter((file, index) => {
        
            // Extract relative path from fullPath if path is empty
            let path = file.path || '';
            if (!path && file.fullPath) {
                // Use sourcePath from metadata if available, otherwise try first configured path
                const imagePaths = this.mode === ImageCacheManager.MODES.PORTRAIT ? getPortraitImagePaths() : getImagePaths();
                const basePath = file.metadata?.sourcePath || (imagePaths[0] || '');
                if (basePath) {
                    path = file.fullPath.replace(`${basePath}/`, '');
                }
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
                        const searchTerms = this.mode === ImageCacheManager.MODES.PORTRAIT 
                ? ImageCacheManager._getSearchTerms(this.selectedToken, this.mode)
                : ImageCacheManager._getSearchTerms(this.selectedToken.document, this.mode);
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
        const systemScanning = ImageCacheManager.getCache(this.mode).isScanning;
        
        // Calculate progress percentage
        let progressPercentage = 0;
        if (this.scanTotal > 0 && this.scanProgress > 0) {
            progressPercentage = Math.round((this.scanProgress / this.scanTotal) * 100);
        }
        
        // Update notification data dynamically based on current state
        this._updateNotificationData();
        
        // Prepare selectedToken data for template - format differently based on mode
        let selectedTokenData = null;
        if (this.selectedToken) {
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: this.selectedToken is actually an Actor
                const actor = this.selectedToken;
                selectedTokenData = {
                    name: actor.name || 'Unknown Actor',
                    actor: {
                        name: actor.name || '',
                        type: actor.type || '',
                        system: {
                            details: {
                                type: {
                                    value: actor.system?.details?.type?.value || '',
                                    subtype: actor.system?.details?.type?.subtype || ''
                                }
                            }
                        }
                    },
                    document: {
                        texture: {
                            src: actor.img || ''
                        }
                    }
                };
            } else {
                // Token mode: this.selectedToken is a Token
                selectedTokenData = this.selectedToken;
            }
        }
        
        return {
            selectedToken: selectedTokenData,
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
            overallProgress: ImageCacheManager.getCache(this.mode).overallProgress,
            totalSteps: ImageCacheManager.getCache(this.mode).totalSteps,
            overallProgressPercentage: ImageCacheManager.getCache(this.mode).totalSteps > 0 ? Math.round((ImageCacheManager.getCache(this.mode).overallProgress / ImageCacheManager.getCache(this.mode).totalSteps) * 100) : 0,
            currentStepName: ImageCacheManager.getCache(this.mode).currentStepName,
            currentStepProgress: ImageCacheManager.getCache(this.mode).currentStepProgress,
            currentStepTotal: ImageCacheManager.getCache(this.mode).currentStepTotal,
            currentStepProgressPercentage: ImageCacheManager.getCache(this.mode).currentStepTotal > 0 ? Math.round((ImageCacheManager.getCache(this.mode).currentStepProgress / ImageCacheManager.getCache(this.mode).currentStepTotal) * 100) : 0,
            currentPath: ImageCacheManager.getCache(this.mode).currentPath,
            currentFileName: ImageCacheManager.getCache(this.mode).currentFileName,
            cacheStatus: this._getCacheStatus(),
            updateDropped: getSettingSafely(MODULE.ID, this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementUpdateDropped' : 'tokenImageReplacementUpdateDropped', true),
            fuzzySearch: getSettingSafely(MODULE.ID, this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementFuzzySearch' : 'tokenImageReplacementFuzzySearch', false),
            tagSortMode: getSettingSafely(MODULE.ID, 'tokenImageReplacementTagSortMode', 'count'),
            convertDeadToLoot: getSettingSafely(MODULE.ID, 'tokenConvertDeadToLoot', false),
            deadTokenReplacement: getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', false),
            itemPilesInstalled: game.modules.get("item-piles")?.active || false,
            mode: this.mode,
            isTokenMode: this.mode === ImageCacheManager.MODES.TOKEN,
            isPortraitMode: this.mode === ImageCacheManager.MODES.PORTRAIT,
            portraitEnabled: getSettingSafely(MODULE.ID, 'portraitImageReplacementEnabled', false)
        };
    }


    activateListeners(html) {
        super.activateListeners(html);

        // v13: Application.activateListeners may still receive jQuery in some cases
        // Convert to native DOM if needed
        let htmlElement = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            htmlElement = html[0] || html.get?.(0) || html;
        } else if (html && typeof html.querySelectorAll !== 'function') {
            // Not a valid DOM element
            return;
        }
        
        if (!htmlElement) {
            return;
        }

        this._clearDomEvents();

        // Thumbnail clicks
        this._registerDomEvent(htmlElement, '.tir-thumbnail-item', 'click', this._onSelectImage, true);
        this._registerDomEvent(htmlElement, '.tir-thumbnail-item', 'contextmenu', this._onImageRightClick, true);
        
        // Pause cache button
        this._registerDomEvent(htmlElement, '.button-pause-cache', 'click', this._onPauseCache);
        
        // Scan images button
        this._registerDomEvent(htmlElement, '.button-scan-images', 'click', this._onScanImages);
        
        // Delete cache button
        this._registerDomEvent(htmlElement, '.button-delete-cache', 'click', this._onDeleteCache);
        
        
        // Close button
        this._registerDomEvent(htmlElement, '.close-btn', 'click', this._onClose);

        // Search functionality
        this._registerDomEvent(htmlElement, '.tir-search-input', 'input', this._onSearchInput);
        
        // Sort order change
        this._registerDomEvent(htmlElement, '.tir-select', 'change', this._onSortOrderChange);
        this._registerDomEvent(htmlElement, '.tir-search-input', 'keypress', (event) => {
            if (event.which === 13) { // Enter key
                event.preventDefault();
            }
        });
        
        // Infinite scroll
        this._registerDomEvent(htmlElement, '.tir-thumbnails-grid', 'scroll', this._onScroll);
        
        
        // Filter category click handlers
        this._registerDomEvent(htmlElement, '.tir-filter-category', 'click', this._onCategoryFilterClick, true);
        
        // Tag click handlers for new tags row
        this._registerDomEvent(htmlElement, '.tir-search-tools-tag', 'click', this._onTagClick, true);
        
        // Clear search button
        this._registerDomEvent(htmlElement, '.tir-clear-search-btn', 'click', this._onClearSearch);
        
        // Filter toggle button
        this._registerDomEvent(htmlElement, '.tir-filter-toggle-btn', 'click', this._onFilterToggle);
        
        // Initialize filter toggle button state
        this._initializeFilterToggleButton();
        
        // Threshold slider
        this._registerDomEvent(htmlElement, '.tir-rangeslider-input', 'input', this._onThresholdSliderChange);
        
        // Set initial threshold value in label (mode-specific)
        const thresholdSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementThreshold' : 'tokenImageReplacementThreshold';
        const currentThreshold = game.settings.get(MODULE.ID, thresholdSettingKey) || 0.3;
        const thresholdPercentage = Math.round(currentThreshold * 100);
        const thresholdValue = htmlElement.querySelector('.tir-threshold-value');
        if (thresholdValue) thresholdValue.textContent = `${thresholdPercentage}%`;
        
        // Update Dropped Tokens toggle
        this._registerDomEvent(htmlElement, '#updateDropped', 'change', this._onUpdateDroppedToggle);
        this._registerDomEvent(htmlElement, '#modeToggle', 'change', this._onModeToggle);
        
        // Fuzzy Search toggle
        this._registerDomEvent(html, '#fuzzySearch', 'change', this._onFuzzySearchToggle);
        
        // Convert Dead To Loot toggle
        this._registerDomEvent(html, '#convertDeadToLoot', 'change', this._onConvertDeadToLootToggle);
        
        // Dead Token Replacement toggle
        this._registerDomEvent(html, '#deadTokenReplacement', 'change', this._onDeadTokenReplacementToggle);
        
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

        // If we have a selected token/actor, add original and current images as the first matches
        // ALWAYS show original/current images when a token/actor is selected, regardless of search mode
        if (this.selectedToken) {
            // Add original image as the very first card
            let originalImage = null;
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: get from actor flags
                // Ensure we have an Actor document (not a token)
                let actor = this.selectedToken;
                if (actor.actor) {
                    // If it's a token, get the actor
                    actor = actor.actor;
                }
                if (actor && typeof actor.getFlag === 'function') {
                    originalImage = actor.getFlag(MODULE.ID, 'originalPortrait') || null;
                }
            } else {
                // Token mode: get from token flags
                originalImage = TokenImageUtilities.getOriginalImage(this.selectedToken.document);
            }
            
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
            let currentImageSrc = '';
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: get from actor.img
                // Ensure we have an Actor document (not a token)
                let actor = this.selectedToken;
                if (actor && actor.actor) {
                    // If it's a token, get the actor
                    actor = actor.actor;
                }
                currentImageSrc = actor?.img || '';
            } else {
                // Token mode: get from token texture
                currentImageSrc = this.selectedToken?.texture?.src || this.selectedToken?.document?.texture?.src || '';
            }
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
        if (!ImageCacheManager.getCache(this.mode)) {
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Cache not initialized in _findMatches`, "", true, false);
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = 'Cache not initialized. Please wait for cache to load.';
            this._updateResults();
            return;
        }
        
        if (ImageCacheManager.getCache(this.mode).isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = 'Cache scanning paused. Use "Refresh Cache" to resume.';
        } else if (ImageCacheManager.getCache(this.mode).isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = 'Images are being scanned to build the image cache and may impact performance.';
        } else if (ImageCacheManager.getCache(this.mode).files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Cache check - files.size: ${ImageCacheManager.getCache(this.mode).files.size}, cache exists: ${!!ImageCacheManager.getCache(this.mode)}`, "", true, false);
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
                
                if (this.searchTerm && this.searchTerm.length >= 3) {
                    // SEARCH MODE: Use search term matching (highest priority)
                    searchMode = 'search';
                    searchTerms = this.searchTerm;
                } else if (this.selectedToken) {
                    // TOKEN/ACTOR SELECTED: Always use token/actor-based matching to show match percentages
                    // This applies regardless of which filter button is active (ALL, category, etc.)
                    searchMode = 'token';
                    searchTerms = null; // Use token/actor-based matching instead of search terms
                    
                    if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                        // Portrait mode: create a fake tokenDocument-like object from actor
                        // _extractTokenData expects tokenDocument.actor, so we create a wrapper
                        let actor = this.selectedToken;
                        if (actor && actor.actor) {
                            // If it's a token, get the actor
                            actor = actor.actor;
                        }
                        // Create a fake tokenDocument that has an actor property
                        tokenDocument = { actor: actor };
                    } else {
                        // Token mode: use token document
                        tokenDocument = this.selectedToken.document;
                    }
                } else if (this.currentFilter === 'selected' && !this.selectedToken) {
                    // SELECTED TAB but no token/actor selected: Show no results
                    this.allMatches = [];
                    this._updateResults();
                    return;
                } else {
                    // No token/actor selected and not in search mode: Use browse mode (no scores)
                    searchMode = 'browse';
                }
                
                // Apply unified matching
                // Apply threshold only on SELECTED tab (but still calculate scores for all tabs when token/actor is selected)
                const applyThreshold = this.currentFilter === 'selected';
                const matchedResults = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, searchTerms, tokenDocument, searchMode, ImageCacheManager.getCache(this.mode), ImageCacheManager._extractTokenData, applyThreshold);
                
                // Filter out any results that are the current image to avoid duplicates
                const filteredResults = matchedResults.filter(result => !result.isCurrent);
                this.allMatches.push(...filteredResults);
                
                // Deduplicate results to prevent same file appearing multiple times
                this.allMatches = this._deduplicateResults(this.allMatches);
                
                
                // Calculate score for current image if it exists
                if (this.selectedToken && this.allMatches.length > 0) {
                    const currentImage = this.allMatches.find(match => match.isCurrent);
                    if (currentImage) {
                        const searchTerms = this.mode === ImageCacheManager.MODES.PORTRAIT 
                ? ImageCacheManager._getSearchTerms(this.selectedToken, this.mode)
                : ImageCacheManager._getSearchTerms(this.selectedToken.document, this.mode);
                        const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                            name: currentImage.name,
                            path: currentImage.fullPath,
                            metadata: currentImage.metadata
                        };
                        currentImage.searchScore = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', ImageCacheManager.getCache(this.mode));
                        
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
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Error in _findMatches: ${error.message}`, "", true, false);
            console.error(`${this._getModePrefix()} Error in _findMatches:`, error);
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
            const fileInfo = this._getFileInfoFromCache(imageName);
            if (!fileInfo) {
                ui.notifications.warn(`Could not find file info for ${imageName}`);
                return;
            }

            if (!fileInfo.metadata) {
                fileInfo.metadata = {};
            }
        if (!Array.isArray(fileInfo.metadata.tags)) {
                fileInfo.metadata.tags = [];
            }

            const isFavorited = fileInfo.metadata.tags.includes('FAVORITE');

            if (isFavorited) {
                fileInfo.metadata.tags = fileInfo.metadata.tags.filter(tag => tag !== 'FAVORITE');
                ui.notifications.info(`Removed ${imageName} from favorites`);
            } else {
                fileInfo.metadata.tags.push('FAVORITE');
                ui.notifications.info(`Added ${imageName} to favorites`);
            }

        await ImageCacheManager._saveCacheToStorage(true);

            if (this.currentFilter === 'favorites') {
                this._showSearchSpinner();
                await this._findMatches();
                this._hideSearchSpinner();
            } else {
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
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: update actor's portrait image
                // Re-check for selected actor if not already set
                let selectedActor = this.selectedToken;
                
                if (!selectedActor || typeof selectedActor.update !== 'function') {
                    // Try to find the actor from actor directory or selected token
                    if (ui.actors?.viewed?.length > 0) {
                        selectedActor = ui.actors.viewed[0];
                    } else if (canvas.tokens.controlled.length > 0) {
                        selectedActor = canvas.tokens.controlled[0].actor;
                    }
                }
                
                if (!selectedActor || typeof selectedActor.update !== 'function') {
                    ui.notifications.error('No actor selected for portrait replacement. Please select an actor from the directory or a token on the canvas.');
                    return;
                }
                
                // Store original portrait if not already stored
                const existingOriginal = selectedActor.getFlag(MODULE.ID, 'originalPortrait');
                if (!existingOriginal && selectedActor.img) {
                    const originalPortrait = {
                        path: selectedActor.img,
                        name: selectedActor.img.split('/').pop(),
                        timestamp: Date.now()
                    };
                    await selectedActor.setFlag(MODULE.ID, 'originalPortrait', originalPortrait);
                }
                
                // Update the actor's portrait
                await selectedActor.update({
                    img: imagePath
                });
                
                // Show success notification
                ui.notifications.info(`Applied portrait: ${imageName}`);
            } else {
                // Token mode: update token's texture
                if (!this.selectedToken || !this.selectedToken.document) {
                    ui.notifications.error('No token selected for replacement');
                    return;
                }
                
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
            }
            
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
            await ImageCacheManager.scanForImages(this.mode);
            
            // Check if we have completion data to show
            const cache = ImageCacheManager.getCache(this.mode);
            const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
            
            if (cache.justCompleted && cache.completionData) {
                const data = cache.completionData;
                let message = `${modeLabel} Image Replacement: Scan completed! Found ${data.totalFiles} files across ${data.totalFolders} folders in ${data.timeString}`;
                if (data.ignoredFiles > 0) {
                    message += ` (${data.ignoredFiles} files ignored by filter)`;
                }
                ui.notifications.info(message);
            } else {
                ui.notifications.info(`${modeLabel} image scan completed`);
            }
        } catch (error) {
            const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
            ui.notifications.error(`${modeLabel} image scan failed: ${error.message}`);
        }
    }

    async _onPauseCache() {
        const paused = ImageCacheManager.pauseCache(this.mode);
        const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
        
        if (paused) {
            this.render();
            ui.notifications.info(`${modeLabel} cache scanning paused`);
        } else {
            ui.notifications.warn(`No active ${modeLabel.toLowerCase()} scan to pause`);
        }
    }

    async _onDeleteCache() {
        const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
        const cache = ImageCacheManager.getCache(this.mode);
        const fileCount = cache.files.size;
        
        // Show confirmation dialog using ApplicationV2-compatible approach
        const confirmed = await new Promise((resolve) => {
            new Dialog({
                title: `Delete ${modeLabel} Cache`,
                content: `<p>Are you sure you want to delete the entire ${modeLabel.toLowerCase()} image cache?</p><p>This will remove ${fileCount} cached ${modeLabel.toLowerCase()} images.</p><p><strong>This action cannot be undone.</strong></p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: 'Delete',
                        callback: () => resolve(true)
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                        callback: () => resolve(false)
                    }
                },
                default: 'no',
                close: () => resolve(false)
            }).render(true);
        });

        if (confirmed) {
            try {
                await ImageCacheManager.deleteCache(this.mode);
                ui.notifications.info(`${modeLabel} cache deleted successfully`);
                this.render();
            } catch (error) {
                ui.notifications.error(`Failed to delete ${modeLabel.toLowerCase()} cache: ${error.message}`);
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
        ImageCacheManager.getCache(this.mode).currentStepProgress = current;
        ImageCacheManager.getCache(this.mode).currentStepTotal = total;
        
        this.render();
    }

    // Method to complete scan
    completeScan() {
        this.scanProgress = 0;
        this.scanTotal = 0;
        this.scanStatusText = "Scanning Token Images...";
        
        // Reset cache properties
        ImageCacheManager.getCache(this.mode).currentStepProgress = 0;
        ImageCacheManager.getCache(this.mode).currentStepTotal = 0;
        
        this.render();
    }

    // Show completion notification in the window
    showCompletionNotification(totalFiles, totalFolders, timeString) {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;
        
        // Update the notification area with completion info
        this.notificationIcon = 'fas fa-check-circle';
        this.notificationText = `Scan Complete! Found ${totalFiles} files across ${totalFolders} folders in ${timeString}`;
        
        // Update the notification display
        const notification = element.querySelector('.tir-notification');
        if (notification) {
            notification.innerHTML = `
                <i class="${this.notificationIcon}"></i>
                <span>${this.notificationText}</span>
            `;
            notification.style.display = '';
        }
    }

    // Show error notification in the window
    showErrorNotification(errorMessage) {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;
        
        // Update the notification area with error info
        this.notificationIcon = 'fas fa-exclamation-triangle';
        this.notificationText = `Scan Failed: ${errorMessage}`;
        
        // Update the notification display
        const notification = element.querySelector('.tir-notification');
        if (notification) {
            notification.innerHTML = `
                <i class="${this.notificationIcon}"></i>
                <span>${this.notificationText}</span>
            `;
            notification.style.display = '';
        }
    }

    // Hide progress bars after completion
    hideProgressBars() {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;
        
        // Hide the progress bars
        const scanProgress = element.querySelector('.tir-scan-progress');
        if (scanProgress) scanProgress.style.display = 'none';
        
        // Clear the notification after a delay
        this._scheduleTrackedTimeout(() => {
            const notification = element.querySelector('.tir-notification');
            if (notification) {
                // Fade out using CSS transition
                notification.style.transition = 'opacity 0.5s';
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.style.display = 'none';
                    }
                }, 500);
            }
        }, 2000); // Hide notification after 2 more seconds
    }

    async render(force = false, options = {}) {
        const result = await super.render(force, options);
        
        // Register token selection hook only once when first rendered
        // Use a small delay to ensure the DOM is ready
        if (!this._tokenHookRegistered) {
            this._hookRegistrationTimeoutId = this._scheduleTrackedTimeout(async () => {
                this._hookRegistrationTimeoutId = null;
                if (!this._tokenHookRegistered) {
                    postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Registering controlToken hook`, 'token-image-replacement-selection', true, false);
                    this._tokenHookId = HookManager.registerHook({
                        name: 'controlToken',
                        description: `${this._getModePrefix()} Handle token selection changes`,
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
        
        // Remove token selection hook
        if (this._tokenHookRegistered && this._tokenHookId) {
            HookManager.unregisterHook({
                name: 'controlToken',
                callbackId: this._tokenHookId
            });
            this._tokenHookRegistered = false;
            this._tokenHookId = null;
        }
        
        // Tear down DOM, listeners, and cached references
        this._teardownWindowResources();
        
        postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Window closed, memory cleaned up`, '', true, false);
        
        return super.close(options);
    }

    async _onTokenSelectionChange(token, controlled) {
        // Only proceed if it's a GM (token image replacement is a GM tool)
        if (!game.user.isGM) {
            return;
        }
        
        // Clear any existing debounce timer
        this._tokenSelectionDebounceTimer = this._cancelTrackedTimeout(this._tokenSelectionDebounceTimer);
        
        // Debounce token selection changes to prevent multiple rapid-fire executions
        this._tokenSelectionDebounceTimer = this._scheduleTrackedTimeout(async () => {
        await this._handleTokenSwitch();
        }, 100); // 100ms debounce
    }

    /**
     * Handle token switching when window is already open
     * Preserves current tab and search criteria
     */
    async _handleTokenSwitch() {
        try {
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: check for actor directory or selected token's actor
                let selectedActor = null;
                
                // First check if actor directory is open
                if (ui.actors?.viewed?.length > 0) {
                    selectedActor = ui.actors.viewed[0];
                } 
                // Fallback: check for selected token's actor
                else if (canvas.tokens.controlled.length > 0) {
                    selectedActor = canvas.tokens.controlled[0].actor;
                }
                
                const newActorId = selectedActor ? selectedActor.id : null;
                
                // Prevent processing the same actor multiple times
                if (newActorId === this._lastProcessedTokenId) {
                    postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Skipping duplicate actor selection for ${newActorId}`, "", true, false);
                    return;
                }
                
                this._lastProcessedTokenId = newActorId;
                
                if (selectedActor) {
                    this.selectedToken = selectedActor;
                    
                    // Store original portrait if not already stored
                    const existingOriginal = selectedActor.getFlag(MODULE.ID, 'originalPortrait');
                    if (!existingOriginal && selectedActor.img) {
                        const originalPortrait = {
                            path: selectedActor.img,
                            name: selectedActor.img.split('/').pop(),
                            timestamp: Date.now()
                        };
                        await selectedActor.setFlag(MODULE.ID, 'originalPortrait', originalPortrait);
                    }
                    
                    // When an actor is selected, switch to "selected" tab and update results
                    this.currentFilter = 'selected';
                    this._cachedSearchTerms = null; // Clear cache for new actor
                    this._showSearchSpinner();
                    await this._findMatches();
                    this._hideSearchSpinner();
                } else {
                    this.selectedToken = null;
                    // When no actor is selected, switch to "all" tab and update results
                    this.currentFilter = 'all';
                    this._showSearchSpinner();
                    await this._findMatches();
                    this._hideSearchSpinner();
                }
            } else {
                // Token mode: check for controlled tokens
                const selectedTokens = canvas?.tokens?.controlled || [];
                const newTokenId = selectedTokens.length > 0 ? selectedTokens[0].id : null;
                
                // Prevent processing the same token multiple times
                if (newTokenId === this._lastProcessedTokenId) {
                    postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Skipping duplicate token selection for ${newTokenId}`, "", true, false);
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
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Error during token selection: ${error.message}`, "", false, false);
        }
    }

    /**
     * Update tab states without full re-render
     */
    _updateTabStates() {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;
        
        // Update active tab states
        element.querySelectorAll('.tir-filter-category').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = element.querySelector(`[data-category="${this.currentFilter}"]`);
        if (activeTab) activeTab.classList.add('active');
    }

    /**
     * Update token info in header without full re-render
     */
    _updateTokenInfo() {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;
        
        // Update token/actor name and image in header
        if (this.selectedToken) {
            let displayName, displayImage, subtitle;
            
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: this.selectedToken is actually an Actor
                const actor = this.selectedToken;
                displayName = actor.name || 'Unknown Actor';
                displayImage = actor.img || '';
                
                // Build subtitle from actor info
                const actorName = actor.name || '';
                const actorType = actor.type || '';
                const actorSubtype = actor.system?.details?.type?.subtype || '';
                const actorValue = actor.system?.details?.type?.value || '';
                
                subtitle = '';
                if (actorName) subtitle += actorName;
                if (actorType) subtitle += (subtitle ? '  •  ' : '') + actorType;
                if (actorValue) subtitle += (subtitle ? '  •  ' : '') + actorValue;
                if (actorSubtype) subtitle += (subtitle ? '  •  ' : '') + actorSubtype;
            } else {
                // Token mode: this.selectedToken is a Token
                displayName = this.selectedToken.name || 'Unknown Token';
                displayImage = this.selectedToken.texture?.src || this.selectedToken.document?.texture?.src || '';
                
                // Build subtitle from token's actor info
                const actorName = this.selectedToken.actor?.name || '';
                const actorType = this.selectedToken.actor?.type || '';
                const actorSubtype = this.selectedToken.actor?.system?.details?.type?.subtype || '';
                const actorValue = this.selectedToken.actor?.system?.details?.type?.value || '';
                
                subtitle = '';
                if (actorName) subtitle += actorName;
                if (actorType) subtitle += (subtitle ? '  •  ' : '') + actorType;
                if (actorValue) subtitle += (subtitle ? '  •  ' : '') + actorValue;
                if (actorSubtype) subtitle += (subtitle ? '  •  ' : '') + actorSubtype;
            }
            
            // Update name
            const mainTitle = element.querySelector('.tir-main-title');
            if (mainTitle) mainTitle.textContent = displayName;
            
            // Update image - ensure image element exists and is visible
            const headerIcon = element.querySelector('.tir-header-icon');
            if (headerIcon) {
                let imageEl = headerIcon.querySelector('img');
                
                if (!imageEl) {
                    // Create image element if it doesn't exist
                    imageEl = document.createElement('img');
                    headerIcon.appendChild(imageEl);
                }
                
                // Hide the icon and show the image
                const icon = headerIcon.querySelector('i');
                if (icon) icon.style.display = 'none';
                imageEl.setAttribute('src', displayImage);
                imageEl.style.display = '';
            }
            
            // Update subtitle
            const subtitleElement = element.querySelector('.tir-subtitle');
            if (subtitleElement) subtitleElement.textContent = subtitle;
        } else {
            // Clear token/actor info when nothing selected
            const mainTitle = element.querySelector('.tir-main-title');
            const subtitleElement = element.querySelector('.tir-subtitle');
            const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Actor' : 'Token';
            if (mainTitle) mainTitle.textContent = `No ${modeLabel} Selected`;
            if (subtitleElement) subtitleElement.textContent = 'Select a token on the canvas';
            
            // Hide the image and show the icon
            const headerIcon = element.querySelector('.tir-header-icon');
            if (headerIcon) {
                const img = headerIcon.querySelector('img');
                const icon = headerIcon.querySelector('i');
                if (img) img.style.display = 'none';
                if (icon) icon.style.display = '';
            }
        }
    }

    /**
     * Check for currently selected token/actor when window opens
     */
    async _checkForSelectedToken() {
        try {
            const cache = ImageCacheManager.getCache(this.mode);
            const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
            
            // Ensure cache is initialized
            if (!cache || cache.files.size === 0) {
                postConsoleAndNotification(MODULE.NAME, `${modeLabel} Image Replacement: Cache not initialized, initializing...`, "", true, false);
                await ImageCacheManager._initializeCache(this.mode);
            }
            
            if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
                // Portrait mode: check for actor directory or selected token's actor
                let selectedActor = null;
                
                // First check if actor directory is open
                if (ui.actors?.viewed?.length > 0) {
                    selectedActor = ui.actors.viewed[0];
                } 
                // Fallback: check for selected token's actor
                else if (canvas.tokens.controlled.length > 0) {
                    selectedActor = canvas.tokens.controlled[0].actor;
                }
                
                if (selectedActor) {
                    // Store the selected actor and set filter
                    this.selectedToken = selectedActor; // Reuse selectedToken property for actor
                    
                    // Store original portrait if not already stored
                    const existingOriginal = selectedActor.getFlag(MODULE.ID, 'originalPortrait');
                    if (!existingOriginal && selectedActor.img) {
                        const originalPortrait = {
                            path: selectedActor.img,
                            name: selectedActor.img.split('/').pop(),
                            timestamp: Date.now()
                        };
                        await selectedActor.setFlag(MODULE.ID, 'originalPortrait', originalPortrait);
                    }
                    
                    this.currentFilter = 'selected';
                    this._cachedSearchTerms = null; // Clear cache for new actor
                    this._showSearchSpinner();
                    await this._findMatches();
                    this._hideSearchSpinner();
                } else {
                    // Reset to "all" filter when no actor selected
                    this.selectedToken = null;
                    this.currentFilter = 'all';
                    this._cachedSearchTerms = null; // Clear cache
                    this._showSearchSpinner();
                    await this._findMatches();
                    this._hideSearchSpinner();
                }
            } else {
                // Token mode: check for controlled tokens
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
            }
        } catch (error) {
            const modeLabel = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
            postConsoleAndNotification(MODULE.NAME, `${modeLabel} Image Replacement: Error during selection check: ${error.message}`, "", true, false);
            console.error(`${modeLabel} Image Replacement: Error during selection check:`, error);
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
        const searchTerm = event.currentTarget.value.trim();
        this.searchTerm = searchTerm; // Store the search term
        
        // Clear any existing timeout
        this.searchTimeout = this._cancelTrackedTimeout(this.searchTimeout);
        
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
        this.searchTimeout = this._scheduleTrackedTimeout(async () => {
            this._showSearchSpinner();
            await this._performSearch(searchTerm);
            this._hideSearchSpinner();
        }, 300);
    }


    /**
     * Generate cache key for search results
     * @private
     */
    _generateSearchCacheKey(searchTerm, categoryFilter, selectedTags, sortOrder) {
        const tagsArray = Array.from(selectedTags).sort();
        return `${searchTerm}|${categoryFilter}|${tagsArray.join(',')}|${sortOrder}`;
    }

    /**
     * Get cached search results if available and not expired
     * @private
     */
    _getCachedSearchResults(cacheKey) {
        const cached = this._searchResultCache.get(cacheKey);
        if (!cached) return null;
        
        // Check if cache is expired
        const now = Date.now();
        if (now - cached.timestamp > this._searchCacheTTL) {
            this._searchResultCache.delete(cacheKey);
            return null;
        }
        
        return cached.results;
    }

    /**
     * Store search results in cache
     * @private
     */
    _cacheSearchResults(cacheKey, results) {
        // Implement LRU eviction if cache is full
        if (this._searchResultCache.size >= this._searchCacheMaxSize) {
            // Remove oldest entry
            const firstKey = this._searchResultCache.keys().next().value;
            this._searchResultCache.delete(firstKey);
        }
        
        this._searchResultCache.set(cacheKey, {
            results: [...results], // Deep copy to prevent mutation
            timestamp: Date.now()
        });
    }

    /**
     * Invalidate search cache (called when filters/categories change)
     * @private
     */
    _invalidateSearchCache() {
        this._searchResultCache.clear();
        postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Search cache cleared`, "", true, false);
    }

    async _performSearch(searchTerm) {
        if (ImageCacheManager.getCache(this.mode).files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Cache empty, cannot perform search`, "", true, false);
            this.matches = [];
            this.allMatches = [];
            this.currentPage = 0;
        this.render();
            return;
        }

        // Generate cache key
        const cacheKey = this._generateSearchCacheKey(searchTerm, this.currentFilter, this.selectedTags, this.sortOrder);
        
        // Check cache first
        const cachedResults = this._getCachedSearchResults(cacheKey);
        if (cachedResults) {
            console.time(`${this._getModePrefix()} Search (cached)`);
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Using cached results for search`, "", true, false);
            
            this.allMatches = cachedResults;
            this.currentPage = 0;
            this.isSearching = true;
            
            // Show cached results immediately
            this._applyPagination();
            this._updateResults();
            
            this.isSearching = false;
            console.timeEnd(`${this._getModePrefix()} Search (cached)`);
            return;
        }

        // Cache miss - perform full search
        console.time(`${this._getModePrefix()} Search (full)`);
        
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
        const searchResults = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, searchTerm, null, 'search', ImageCacheManager.getCache(this.mode), ImageCacheManager._extractTokenData, false);
        
        // Filter out any results that are the current image to avoid duplicates
        const filteredResults = searchResults.filter(result => !result.isCurrent);
        
        // In exact search mode (fuzzy search OFF), filter out 0% matches
        const fuzzySearchSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementFuzzySearch' : 'tokenImageReplacementFuzzySearch';
        const fuzzySearch = getSettingSafely(MODULE.ID, fuzzySearchSettingKey, false);
        if (!fuzzySearch) {
            // Exact search mode: only show files that actually match the search term
            const exactMatches = filteredResults.filter(result => 
                result.searchScore !== null && result.searchScore > 0
            );
            this.allMatches.push(...exactMatches);
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Exact search found ${exactMatches.length} matches out of ${filteredResults.length} files`, "", true, false);
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
                const searchTerms = this.mode === ImageCacheManager.MODES.PORTRAIT 
                ? ImageCacheManager._getSearchTerms(this.selectedToken, this.mode)
                : ImageCacheManager._getSearchTerms(this.selectedToken.document, this.mode);
                const fileInfo = this._getFileInfoFromCache(currentImage.name) || {
                    name: currentImage.name,
                    path: currentImage.fullPath,
                    metadata: currentImage.metadata
                };
                currentImage.searchScore = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, this.selectedToken.document, 'token', ImageCacheManager.getCache(this.mode));
                
                // Note: Current image (selected token) is always shown regardless of threshold
                // The threshold only affects other matching images, not the selected token itself
            }
        }
        
        // Sort results based on current sort order
        this.allMatches = this._sortResults(this.allMatches);
        
        // Cache the results before showing them
        this._cacheSearchResults(cacheKey, this.allMatches);
        
        // Show results immediately
        this._applyPagination();
        this._updateResults();
        
        console.timeEnd(`${this._getModePrefix()} Search (full)`);
    }

    _updateResults() {
        // Update the results grid and the results summary
        const resultsHtml = this._renderResults();
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (element) {
            const grid = element.querySelector('.tir-thumbnails-grid');
            if (grid) {
                // Clear previous references so old DOM nodes can be GC'd
                this._activeImageElements.forEach(img => {
                    try {
                        img.src = '';
                    } catch (error) {
                        // Ignore cleanup errors to avoid blocking render
                    }
                });
                this._activeImageElements.clear();

                grid.innerHTML = resultsHtml;
                grid.querySelectorAll('img').forEach((img) => {
                    this._activeImageElements.add(img);
                });
            }
            
            // Update the results summary with current counts
            const countElement = element.querySelector('#tir-results-details-count');
            if (countElement) {
                countElement.innerHTML = `<i class="fas fa-images"></i>${this.matches.length} of ${this.allMatches.length} Showing`;
            }
            
            
            // Update the status text based on search state
            const statusElement = element.querySelector('#tir-results-details-status');
            if (statusElement) {
                if (this.isSearching) {
                    statusElement.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>Searching for more...';
                } else {
                    statusElement.innerHTML = '<i class="fas fa-check"></i>Complete';
                }
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
                                        <span class="tir-overlay-text">Apply to ${this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token'}</span>
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
            const fuzzySearchSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementFuzzySearch' : 'tokenImageReplacementFuzzySearch';
        const fuzzySearch = getSettingSafely(MODULE.ID, fuzzySearchSettingKey, false);
            
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
                                <span class="tir-overlay-text">Apply to ${this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token'}</span>
                            </div>
                        ` : `
                            <div class="tir-thumbnail-overlay">
                                <i class="fas fa-check"></i>
                                <span class="tir-overlay-text">Apply to ${this.mode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token'}</span>
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

    /**
     * Get tags for a match (includes special UI tags)
     * OPTIMIZED: Uses pre-computed tags from metadata (Phase 1.2)
     */
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
        
        // OPTIMIZATION: All other tags (metadata, creature types, categories) are pre-computed
        // during cache build and stored in file.metadata.tags
        if (match.metadata && match.metadata.tags) {
            tags.push(...match.metadata.tags);
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
        
        // Note: This method doesn't actually use this.element, but keeping for consistency
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        }
        // Note: We don't return early here since we don't actually use element in this method
        
        // Toggle the tag in the selected tags set
        if (this.selectedTags.has(tagName)) {
            this.selectedTags.delete(tagName);
        } else {
            this.selectedTags.add(tagName);
        }
        
        // Invalidate search cache when tags change
        this._invalidateSearchCache();
        
        // Update the visual state of the tag
        const tag = event.currentTarget;
        if (this.selectedTags.has(tagName)) {
            tag.classList.add('selected');
        } else {
            tag.classList.remove('selected');
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
            this.allMatches = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, this.searchTerm, null, 'search', ImageCacheManager.getCache(this.mode), ImageCacheManager._extractTokenData, false);
        } else {
            // Browse mode never applies threshold
            this.allMatches = await ImageMatching._applyUnifiedMatching(tagFilteredFiles, null, null, 'browse', ImageCacheManager.getCache(this.mode), ImageCacheManager._extractTokenData, false);
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
        
        const cache = ImageCacheManager.getCache(this.mode);
        const fileNameKey = fileName.toLowerCase();
        
        // First try using filesByFileName index (supports multiple files with same name)
        if (cache.filesByFileName && cache.filesByFileName.has(fileNameKey)) {
            const cacheKeys = cache.filesByFileName.get(fileNameKey);
            // Return the first file found (or could return all if needed)
            if (cacheKeys.length > 0) {
                const fileInfo = cache.files.get(cacheKeys[0]);
                if (fileInfo) {
                    return fileInfo;
                }
            }
        }
        
        // Try exact match by filename (case-insensitive) - for backward compatibility
        let fileInfo = cache.files.get(fileNameKey);
        if (fileInfo) {
            return fileInfo;
        }
        
        // Try removing special characters and matching
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
        if (cleanFileName !== fileNameKey) {
            if (cache.filesByFileName && cache.filesByFileName.has(cleanFileName)) {
                const cacheKeys = cache.filesByFileName.get(cleanFileName);
                if (cacheKeys.length > 0) {
                    fileInfo = cache.files.get(cacheKeys[0]);
                    if (fileInfo) {
                        return fileInfo;
                    }
                }
            }
            fileInfo = cache.files.get(cleanFileName);
            if (fileInfo) {
                return fileInfo;
            }
        }
        
        // Try fuzzy matching by iterating through cache keys
        // Now cache keys include path, so we need to check the filename part
        for (const [cacheKey, cacheValue] of ImageCacheManager.getCache(this.mode).files.entries()) {
            // Extract filename from cache key (last part after /)
            const keyFileName = cacheKey.split('/').pop();
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
     * OPTIMIZED: Uses pre-computed tags from metadata (Phase 1.2)
     */
    _getTagsForFile(file) {
        const tags = [];
        
        // Add current image tag if this is the current token's image
        if (file.isCurrent) {
            tags.push('CURRENT IMAGE');
        }
        
        // OPTIMIZATION: Tags are now pre-computed during cache build
        // This includes: metadata tags, creature types, and category folders
        if (file.metadata && file.metadata.tags) {
            tags.push(...file.metadata.tags);
        }
        
        return [...new Set(tags)]; // Remove duplicates
    }





    /**
     * Initialize threshold slider with current setting value
     */
    _initializeThresholdSlider() {
        // Don't re-initialize during scanning - it's not needed
        if (ImageCacheManager.getCache(this.mode)?.isScanning) return;
        
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;
        
        // Get mode-specific threshold
        const thresholdSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementThreshold' : 'tokenImageReplacementThreshold';
        const currentThreshold = game.settings.get(MODULE.ID, thresholdSettingKey) || 0.3;
        const percentage = Math.round(currentThreshold * 100);
        
        const slider = element.querySelector('.tir-rangeslider');
        if (!slider) return;
        const input = slider.querySelector('.tir-rangeslider-input');
        const fill = slider.querySelector('.tir-rangeslider-fill');
        const thumb = slider.querySelector('.tir-rangeslider-thumb');
        const value = slider.querySelector('.tir-rangeslider-value');
        
        if (input) input.value = percentage;
        if (fill) fill.style.width = `${percentage}%`;
        if (thumb) thumb.style.left = `${percentage}%`;
        if (value) value.textContent = `${percentage}%`;
    }

    /**
     * Handle threshold slider change
     */
    async _onThresholdSliderChange(event) {
        const value = parseInt(event.target.value);
        const percentage = value;
        const threshold = value / 100; // Convert percentage to decimal
        
        // Update the visual elements
        const slider = event.target.closest('.tir-rangeslider');
        if (!slider) return;
        const fill = slider.querySelector('.tir-rangeslider-fill');
        const thumb = slider.querySelector('.tir-rangeslider-thumb');
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        }
        const thresholdValue = element ? element.querySelector('.tir-threshold-value') : null;
        
        if (fill) fill.style.width = `${percentage}%`;
        if (thumb) thumb.style.left = `${percentage}%`;
        if (thresholdValue) thresholdValue.textContent = `${percentage}%`;
        
        // Update the mode-specific setting
        const thresholdSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementThreshold' : 'tokenImageReplacementThreshold';
        await game.settings.set(MODULE.ID, thresholdSettingKey, threshold);
        
        // Refresh results with new threshold
        await this._findMatches();
    }

    /**
     * Handle Update Dropped Tokens/Portraits toggle change
     */
    async _onUpdateDroppedToggle(event) {
        const isEnabled = event.target.checked;
        const updateDroppedSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementUpdateDropped' : 'tokenImageReplacementUpdateDropped';
        await game.settings.set(MODULE.ID, updateDroppedSettingKey, isEnabled);
        
        const modeLabel = this._getModeLabel().toLowerCase();
        postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Update Dropped ${modeLabel === 'portrait' ? 'Portraits' : 'Tokens'} ${isEnabled ? 'enabled' : 'disabled'}`, 
            isEnabled ? `${modeLabel === 'portrait' ? 'Portraits' : 'Tokens'} will be automatically updated when ${modeLabel === 'portrait' ? 'actors are created' : 'tokens are dropped'}` : 'Only manual updates via this window will work', 
            false, false);
    }

    /**
     * Handle Fuzzy Search toggle change
     */
    async _onFuzzySearchToggle(event) {
        const isEnabled = event.target.checked;
        const fuzzySearchSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementFuzzySearch' : 'tokenImageReplacementFuzzySearch';
        await game.settings.set(MODULE.ID, fuzzySearchSettingKey, isEnabled);
        
        postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Fuzzy Search ${isEnabled ? 'enabled' : 'disabled'}`, 
            isEnabled ? 'Searching for individual words independently' : 'Searching for exact string matches', 
            false, false);
        
        // Refresh results with new search mode
        await this._findMatches();
    }

    /**
     * Handle Mode toggle change (Token/Portrait)
     */
    async _onModeToggle(event) {
        const isPortraitMode = event.target.checked;
        const newMode = isPortraitMode ? ImageCacheManager.MODES.PORTRAIT : ImageCacheManager.MODES.TOKEN;
        const modeLabel = newMode === ImageCacheManager.MODES.PORTRAIT ? 'Portrait' : 'Token';
        
        // Update mode
        this.mode = newMode;
        
        // Save mode preference
        await game.settings.set(MODULE.ID, 'tokenImageReplacementLastMode', newMode);
        
        // Update scan status text
        this.scanStatusText = newMode === ImageCacheManager.MODES.PORTRAIT ? "Scanning Portrait Images..." : "Scanning Token Images...";
        
        postConsoleAndNotification(MODULE.NAME, `${modeLabel} Image Replacement: Switched to ${modeLabel} mode`, 
            `Now searching for ${modeLabel.toLowerCase()} images`, 
            false, false);
        
        // Clear current selection
        this.selectedToken = null;
        this.currentFilter = 'all';
        this._cachedSearchTerms = null;
        this.matches = [];
        this.allMatches = [];
        
        // Redetect selected token/actor in new mode
        await this._checkForSelectedToken();
        
        // Update threshold slider and fuzzy search toggle to reflect new mode's values
        this._initializeThresholdSlider();
        
        // Re-render to update UI
        this.render();
    }

    /**
     * Handle Convert Dead To Loot toggle change
     */
    async _onConvertDeadToLootToggle(event) {
        const isEnabled = event.target.checked;
        await game.settings.set(MODULE.ID, 'tokenConvertDeadToLoot', isEnabled);
        
        postConsoleAndNotification(MODULE.NAME, `Convert Dead To Loot ${isEnabled ? 'enabled' : 'disabled'}`, 
            isEnabled ? 'Dead tokens will be converted to loot piles' : 'Dead tokens will not be converted to loot piles', 
            false, true);
    }

    /**
     * Handle Dead Token Replacement toggle change
     */
    async _onDeadTokenReplacementToggle(event) {
        const isEnabled = event.target.checked;
        await game.settings.set(MODULE.ID, 'enableDeadTokenReplacement', isEnabled);
        
        postConsoleAndNotification(MODULE.NAME, `Dead Token Replacement ${isEnabled ? 'enabled' : 'disabled'}`, 
            isEnabled ? 'Tokens will change to dead versions at 0 HP' : 'Tokens will not change when dead', 
            false, true);
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
     * Calculate the recommended token/portrait for automatic replacement
     * Uses the same unified matching logic as the window system
     */
    async _calculateRecommendedToken() {
        if (!this.selectedToken || this.allMatches.length === 0) {
            return null;
        }
        
        // Use the same parameters as the window system for token/actor-based matching
        // searchTerms = null for token/actor-based matching (same as window system)
        const searchTerms = null;
        const thresholdSettingKey = this.mode === ImageCacheManager.MODES.PORTRAIT ? 'portraitImageReplacementThreshold' : 'tokenImageReplacementThreshold';
        const threshold = game.settings.get(MODULE.ID, thresholdSettingKey) || 0.3;
        
        // Get the appropriate document for matching
        let tokenDocument = null;
        if (this.mode === ImageCacheManager.MODES.PORTRAIT) {
            // Portrait mode: create a fake tokenDocument-like object from actor
            let actor = this.selectedToken;
            if (actor && actor.actor) {
                // If it's a token, get the actor
                actor = actor.actor;
            }
            // Create a fake tokenDocument that has an actor property
            tokenDocument = { actor: actor };
        } else {
            // Token mode: use token document
            tokenDocument = this.selectedToken.document;
        }
        
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
                const score = await ImageMatching._calculateRelevanceScore(match, searchTerms, tokenDocument, 'token', ImageCacheManager.getCache(this.mode));
                
                if (score > bestScore && score >= threshold) {
                    bestScore = score;
                    bestMatch = match;
                }
                continue;
            }
            
            // Calculate score using unified algorithm
            const score = await ImageMatching._calculateRelevanceScore(fileInfo, searchTerms, tokenDocument, 'token', ImageCacheManager.getCache(this.mode));
            
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = match;
            }
        }
        
        // Log recommended token/portrait breakdown if we found a match
        if (bestMatch) {
            const tokenData = ImageCacheManager._extractTokenData(tokenDocument);
            const weights = {
                actorName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightActorName') / 100,
                tokenName: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightTokenName') / 100,
                representedActor: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor') / 100,
                creatureType: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureType') / 100,
                creatureSubtype: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype') / 100,
                equipment: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightEquipment') / 100,
                size: game.settings.get(MODULE.ID, 'tokenImageReplacementWeightSize') / 100
            };
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
        
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (element) {
            // Clear the search input
            const searchInput = element.querySelector('.tir-search-input');
            if (searchInput) searchInput.value = '';
            this.searchTerm = '';
            
            // Clear selected tags
            this.selectedTags.clear();
            element.querySelectorAll('.tir-search-tools-tag').forEach(tag => {
                tag.classList.remove('selected');
            });
            
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
        
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (element) {
            const button = event.currentTarget;
            const tagContainer = element.querySelector('#tir-search-tools-tag-container');
            const icon = button.querySelector('i');
            
            // Cycle through the 3 states: count -> alpha -> hidden -> count
            if (this.tagSortMode === 'count') {
                this.tagSortMode = 'alpha';
                button.setAttribute('title', 'Tag Sort: Alpha');
                if (icon) {
                    icon.classList.remove('fa-filter');
                    icon.classList.add('fa-filter-list');
                }
                if (tagContainer) tagContainer.style.display = '';
            } else if (this.tagSortMode === 'alpha') {
                this.tagSortMode = 'hidden';
                button.setAttribute('title', 'Tag Sort: Hidden');
                if (icon) {
                    icon.classList.remove('fa-filter-list');
                    icon.classList.add('fa-filter-circle-xmark');
                }
                if (tagContainer) tagContainer.style.display = 'none';
            } else { // hidden
                this.tagSortMode = 'count';
                button.setAttribute('title', 'Tag Sort: Count');
                if (icon) {
                    icon.classList.remove('fa-filter-circle-xmark');
                    icon.classList.add('fa-filter');
                }
                if (tagContainer) tagContainer.style.display = '';
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
        postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Category filter clicked: ${category}`, "", true, false);
        
        if (!category || category === this.currentFilter) {
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Filter click ignored - category: ${category}, current: ${this.currentFilter}`, "", true, false);
            return;
        }
        
        // Update active filter
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (element) {
            // Remove active class from all filter categories
            element.querySelectorAll('#tir-filter-category-container .tir-filter-category').forEach(cat => {
                cat.classList.remove('active');
            });
            event.currentTarget.classList.add('active');
            
            // Set new filter
            this.currentFilter = category;
            this._cachedSearchTerms = null; // Clear cache when filter changes
            this._invalidateSearchCache(); // Invalidate search cache when filter changes
            
            postConsoleAndNotification(MODULE.NAME, `${this._getModePrefix()} Filter changed to: ${category}`, "", true, false);
            
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
        if (ImageCacheManager.getCache(this.mode).files.size === 0) {
            return "No cache in storage";
        }
        
        const fileCount = ImageCacheManager.getCache(this.mode).files.size;
        const lastScan = ImageCacheManager.getCache(this.mode).lastScan;
        
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
        const modeLabel = this._getModeLabel();
        const cache = ImageCacheManager.getCache(this.mode);
        
        if (cache.isPaused) {
            this.notificationIcon = 'fas fa-pause';
            this.notificationText = `${modeLabel} cache scanning paused. Use "Refresh Cache" to resume.`;
        } else if (cache.isScanning) {
            this.notificationIcon = 'fas fa-sync-alt';
            this.notificationText = `${modeLabel} images are being scanned to build the image cache and may impact performance.`;
        } else if (cache.justCompleted && cache.completionData) {
            this.notificationIcon = 'fas fa-check-circle';
            let notificationText = `${modeLabel} scan complete! Found ${cache.completionData.totalFiles} files across ${cache.completionData.totalFolders} folders in ${cache.completionData.timeString}`;
            if (cache.completionData.ignoredFiles > 0) {
                notificationText += ` (${cache.completionData.ignoredFiles} files ignored)`;
            }
            this.notificationText = notificationText;
        } else if (cache.files.size === 0) {
            this.notificationIcon = 'fas fa-exclamation-triangle';
            this.notificationText = `No ${modeLabel.toLowerCase()} image cache found - Please scan for images.`;
        } else {
            // Cache exists and is working normally - no notification needed
            this.notificationIcon = null;
            this.notificationText = null;
        }
    }

    _getCategories() {
        // Use the new cache-based category discovery with mode
        const discoveredCategories = ImageCacheManager.getDiscoveredCategories(this.mode);
        
        // Convert to array of category objects for template
        const categories = [];
        
        for (const categoryName of discoveredCategories) {
            // Count files in this category
            const fileCount = this._countFilesInCategory(categoryName);
            const cleanName = ImageCacheManager._cleanCategoryName(categoryName);
            
            categories.push({
                name: cleanName,
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
        
        for (const fileInfo of ImageCacheManager.getCache(this.mode).files.values()) {
            // Extract relative path from fullPath if path is empty
            let relativePath = fileInfo.path || '';
            if (!relativePath && fileInfo.fullPath) {
                // Use sourcePath from metadata if available, otherwise try first configured path
                const imagePaths = this.mode === ImageCacheManager.MODES.PORTRAIT ? getPortraitImagePaths() : getImagePaths();
                const basePath = fileInfo.metadata?.sourcePath || (imagePaths[0] || '');
                if (basePath) {
                    relativePath = fileInfo.fullPath.replace(`${basePath}/`, '');
                }
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
            const allFiles = Array.from(ImageCacheManager.getCache(this.mode).files.values());
            let categoryFiles;
            if (this.currentFilter === 'all') {
                categoryFiles = allFiles;  // For 'all', use all files
            } else if (this.currentFilter === 'selected') {
                // For 'selected', filter by token characteristics
                if (!this.selectedToken) {
                    categoryFiles = []; // No files if no token selected
                } else {
                    const searchTerms = this.mode === ImageCacheManager.MODES.PORTRAIT 
                ? ImageCacheManager._getSearchTerms(this.selectedToken, this.mode)
                : ImageCacheManager._getSearchTerms(this.selectedToken.document, this.mode);
                    const processedTerms = searchTerms
                        .filter(term => term && term.length >= 2)
                        .map(term => term.toLowerCase());
                    
                    categoryFiles = allFiles.filter(file => {
                        // Extract relative path from fullPath if path is empty
                        let path = file.path || '';
                        if (!path && file.fullPath) {
                            // Use sourcePath from metadata if available, otherwise try first configured path
                            const basePath = file.metadata?.sourcePath || (getImagePaths()[0] || '');
                            if (basePath) {
                                path = file.fullPath.replace(`${basePath}/`, '');
                            }
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
                        // Use sourcePath from metadata if available, otherwise try first configured path
                        const basePath = file.metadata?.sourcePath || (getImagePaths()[0] || '');
                        if (basePath) {
                            path = file.fullPath.replace(`${basePath}/`, '');
                        }
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
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;

        const button = element.querySelector('.tir-filter-toggle-btn');
        const tagContainer = element.querySelector('#tir-search-tools-tag-container');
        const icon = button ? button.querySelector('i') : null;
        
        // Set the correct icon, title, and visibility based on current mode
        switch (this.tagSortMode) {
            case 'count':
                if (button) button.setAttribute('title', 'Tag Sort: Count');
                if (icon) {
                    icon.classList.remove('fa-filter-list', 'fa-filter-circle-xmark');
                    icon.classList.add('fa-filter');
                }
                if (tagContainer) tagContainer.style.display = '';
                break;
            case 'alpha':
                if (button) button.setAttribute('title', 'Tag Sort: Alpha');
                if (icon) {
                    icon.classList.remove('fa-filter', 'fa-filter-circle-xmark');
                    icon.classList.add('fa-filter-list');
                }
                if (tagContainer) tagContainer.style.display = '';
                break;
            case 'hidden':
                if (button) button.setAttribute('title', 'Tag Sort: Hidden');
                if (icon) {
                    icon.classList.remove('fa-filter', 'fa-filter-list');
                    icon.classList.add('fa-filter-circle-xmark');
                }
                if (tagContainer) tagContainer.style.display = 'none';
                break;
        }
    }

    /**
     * Update the tag container with current tags and sorting
     */
    _updateTagContainer() {
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            return;
        }
        if (!element) return;

        const aggregatedTags = this._getAggregatedTags();
        const tagHtml = aggregatedTags.map(tag => {
            const isSelected = this.selectedTags.has(tag);
            const selectedClass = isSelected ? ' selected' : '';
            return `<span class="tir-search-tools-tag${selectedClass}" data-search-term="${tag}">${tag}</span>`;
        }).join('');
        
        const tagContainer = element.querySelector('#tir-search-tools-tag-container');
        if (tagContainer) {
            tagContainer.innerHTML = tagHtml;
            
            // Show/hide tags row based on whether there are tags and current mode
            if (aggregatedTags.length > 0 && this.tagSortMode !== 'hidden') {
                tagContainer.style.display = '';
            } else {
                tagContainer.style.display = 'none';
            }
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
        
        // Store the original image before any updates (for token mode)
        await TokenImageUtilities.storeOriginalImage(tokenDocument);
        
        // Get the actor from the token
        const actor = tokenDocument.actor;
        if (!actor) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - token has no actor", "", true, false);
            return;
        }
        
        // Check if token image replacement is enabled
        if (!getSettingSafely(MODULE.ID, 'tokenImageReplacementEnabled', false)) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - feature disabled", "", true, false);
            return;
        }
        
        // Check if Update Dropped Tokens is enabled
        const updateDroppedTokens = getSettingSafely(MODULE.ID, 'tokenImageReplacementUpdateDropped', true);
        
        // Check if Update Dropped Portraits is enabled
        const updateDroppedPortraits = getSettingSafely(MODULE.ID, 'portraitImageReplacementUpdateDropped', true);
        
        // Check if portrait image replacement is enabled
        const portraitEnabled = getSettingSafely(MODULE.ID, 'portraitImageReplacementEnabled', false);
        
        // Process token image replacement if enabled
        if (updateDroppedTokens) {
            await TokenImageReplacementWindow._processTokenImageReplacement(tokenDocument);
        }
        
        // Process portrait image replacement if enabled
        if (portraitEnabled && updateDroppedPortraits) {
            await TokenImageReplacementWindow._processPortraitImageReplacement(actor);
        }
    }
    
    /**
     * Process token image replacement for a dropped token
     */
    static async _processTokenImageReplacement(tokenDocument) {
        // Check if cache is ready
        const tokenMode = ImageCacheManager.MODES.TOKEN;
        if (ImageCacheManager.getCache(tokenMode).files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token Image Replacement: Skipping - cache not ready", "", true, false);
            return;
        }
        
        // Extract token data
        const tokenData = ImageCacheManager._extractTokenData(tokenDocument);
        
        // Wait a moment for the token to be fully created on the canvas
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Find matching image using unified matching system
        const allFiles = Array.from(ImageCacheManager.getCache(tokenMode).files.values());
        const matches = await ImageMatching._applyUnifiedMatching(allFiles, null, tokenDocument, 'token', ImageCacheManager.getCache(tokenMode), ImageCacheManager._extractTokenData, true);
        
        // Get the best match (highest score)
        const matchingImage = matches.length > 0 ? matches[0] : null;
        
        if (matchingImage) {
            // Validate and apply token image
            if (ImageCacheManager._isInvalidFilePath(matchingImage.fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Cannot apply invalid image path to ${tokenDocument.name}: ${matchingImage.fullPath}`, "", true, false);
                ImageCacheManager.getCache(tokenMode).files.delete(matchingImage.name.toLowerCase());
                return;
            }
            
            try {
                await tokenDocument.update({
                    'texture.src': matchingImage.fullPath
                });
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Applied ${matchingImage.name} to ${tokenDocument.name} (Score: ${((matchingImage.score || 0) * 100).toFixed(1)}%)`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error applying image: ${error.message}`, "", false, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: No matching image found for ${tokenDocument.name}`, "", true, false);
        }
    }
    
    /**
     * Process portrait image replacement for a dropped token's actor
     */
    static async _processPortraitImageReplacement(actor) {
        // Check if cache is ready
        const portraitMode = ImageCacheManager.MODES.PORTRAIT;
        if (ImageCacheManager.getCache(portraitMode).files.size === 0) {
            postConsoleAndNotification(MODULE.NAME, "Portrait Image Replacement: Skipping - cache not ready", "", true, false);
            return;
        }
        
        // Store original portrait if not already stored
        const existingOriginal = actor.getFlag(MODULE.ID, 'originalPortrait');
        if (!existingOriginal && actor.img) {
            const originalPortrait = {
                path: actor.img,
                name: actor.img.split('/').pop(),
                timestamp: Date.now()
            };
            await actor.setFlag(MODULE.ID, 'originalPortrait', originalPortrait);
        }
        
        // Create a fake tokenDocument-like object for matching
        const tokenDocument = { actor: actor };
        
        // Wait a moment for the actor to be fully ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Find matching image using unified matching system
        const allFiles = Array.from(ImageCacheManager.getCache(portraitMode).files.values());
        const matches = await ImageMatching._applyUnifiedMatching(allFiles, null, tokenDocument, 'token', ImageCacheManager.getCache(portraitMode), ImageCacheManager._extractTokenData, true);
        
        // Get the best match (highest score)
        const matchingImage = matches.length > 0 ? matches[0] : null;
        
        if (matchingImage) {
            // Validate and apply portrait image
            if (ImageCacheManager._isInvalidFilePath(matchingImage.fullPath)) {
                postConsoleAndNotification(MODULE.NAME, `Portrait Image Replacement: Cannot apply invalid image path to ${actor.name}: ${matchingImage.fullPath}`, "", true, false);
                ImageCacheManager.getCache(portraitMode).files.delete(matchingImage.name.toLowerCase());
                return;
            }
            
            try {
                await actor.update({
                    img: matchingImage.fullPath
                });
                postConsoleAndNotification(MODULE.NAME, `Portrait Image Replacement: Applied ${matchingImage.name} to ${actor.name} (Score: ${((matchingImage.score || 0) * 100).toFixed(1)}%)`, "", true, false);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Portrait Image Replacement: Error applying image: ${error.message}`, "", false, false);
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, `Portrait Image Replacement: No matching image found for ${actor.name}`, "", true, false);
        }
    }

}

