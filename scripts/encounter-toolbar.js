// ================================================================== 
// ===== ENCOUNTER TOOLBAR ==========================================
// ================================================================== 

import { MODULE } from './const.js';
import { getCachedTemplate } from './blacksmith.js';
import { postConsoleAndNotification, resolveWildcardPath } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { deployTokens, deployTokensSequential, getDefaultTokenData, validateActorUUID, getTargetPosition, calculateCirclePosition, calculateScatterPosition, calculateSquarePosition, getDeploymentPatternName } from './api-tokens.js';

export class EncounterToolbar {
    
    // Debounce timer for CR updates
    static _crUpdateTimer = null;
    
    // Store hook IDs for proper removal
    static _tokenHookIds = [];
    
    /**
     * Get default token data for v13 compatibility
     * In v13, core.defaultToken setting was removed, so we use CONFIG.Token.defaults
     * @returns {Object} Default token data object
     * @deprecated Use getDefaultTokenData from api-tokens.js instead
     */
    static _getDefaultTokenData() {
        return getDefaultTokenData();
    }
    
    static init() {
        // Listen for journal sheet rendering (normal view only)
        const renderJournalSheetHookId = HookManager.registerHook({
            name: 'renderJournalSheet',
            description: 'Encounter Toolbar: Add encounter toolbars to journal sheets',
            context: 'encounter-toolbar-journal',
            priority: 3, // Normal priority - UI enhancement
            callback: this._onRenderJournalSheet.bind(this)
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderJournalSheet", "encounter-toolbar-journal", true, false);
        
        // Also try renderJournalPageSheet hook (page-level, may fire in v13 ApplicationV2)
        const renderJournalPageSheetHookId = HookManager.registerHook({
            name: 'renderJournalPageSheet',
            description: 'Encounter Toolbar: Add encounter toolbars to journal pages (v13 ApplicationV2)',
            context: 'encounter-toolbar-journal-page',
            priority: 3, // Normal priority - UI enhancement
            callback: this._onRenderJournalPageSheet.bind(this)
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | renderJournalPageSheet", "encounter-toolbar-journal-page", true, false);
        
        // Global MutationObserver fallback (when hooks don't fire in v13)
        // Note: This is NOT a hook - it's a DOM observer, so it doesn't go through HookManager
        this._setupGlobalObserver();
        
        // Also listen for when journal content is updated (saves)
        const updateJournalEntryPageHookId = HookManager.registerHook({
			name: 'updateJournalEntryPage',
			description: 'Encounter Toolbar: Handle journal entry page updates for toolbar refresh',
			context: 'encounter-toolbar-journal-updates',
			priority: 3,
			callback: this._onUpdateJournalEntryPage.bind(this)
		});
        
        // Listen for token changes to update CR values in real-time
        this._setupTokenChangeHooks();
        
        // Listen for setting changes
        const settingChangeHookId = HookManager.registerHook({
			name: 'settingChange',
			description: 'Encounter Toolbar: Handle setting changes for toolbar configuration',
			context: 'encounter-toolbar-settings',
			priority: 3,
			callback: this._onSettingChange.bind(this)
		});
    }

    // Setup or remove token change hooks based on setting
    static _setupTokenChangeHooks() {
        // Remove existing hooks first using stored IDs
        if (this._tokenHookIds.length > 0) {
            this._tokenHookIds.forEach(id => HookManager.removeCallback(id));
            this._tokenHookIds = [];
        }
        
        // Add hooks if setting is enabled and store IDs
        if (game.settings.get(MODULE.ID, 'enableJournalEncounterToolbarRealTimeUpdates')) {
            this._tokenHookIds = [
                HookManager.registerHook({
					name: 'createToken',
					description: 'Encounter Toolbar: Monitor token creation for CR updates',
					context: 'encounter-toolbar-token-create',
					priority: 3,
					callback: this._onTokenChange.bind(this)
				}),
				HookManager.registerHook({
					name: 'updateToken',
					description: 'Encounter Toolbar: Monitor token updates for CR updates',
					context: 'encounter-toolbar-token-update',
					priority: 3,
					callback: this._onTokenChange.bind(this)
				}),
				HookManager.registerHook({
					name: 'deleteToken',
					description: 'Encounter Toolbar: Monitor token deletion for CR updates',
					context: 'encounter-toolbar-token-delete',
					priority: 3,
					callback: this._onTokenChange.bind(this)
				})
			];
        }
    }

    // Handle setting changes
    static _onSettingChange(moduleId, key, value) {
        if (moduleId === MODULE.ID) {
            if (key === 'enableJournalEncounterToolbarRealTimeUpdates') {
                this._setupTokenChangeHooks();
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Real-time updates", value ? "enabled" : "disabled", true, false);
            } else if (key === 'encounterToolbarDeploymentPattern') {
                // Update all open journal toolbars when deployment pattern changes
                this._updateAllToolbarCRs();
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment pattern setting changed", value, true, false);
            } else if (key === 'encounterToolbarDeploymentHidden') {
                // Update all open journal toolbars when deployment visibility changes
                this._updateAllToolbarCRs();
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment visibility setting changed", value, true, false);
            }
        }
    }

    // Hook for token changes (create, update, delete)
    static _onTokenChange(tokenDocument, change, options, userId) {
        // Debounce the update to prevent excessive recalculations
        if (this._crUpdateTimer) {
            clearTimeout(this._crUpdateTimer);
        }
        
        this._crUpdateTimer = setTimeout(() => {
            this._updateAllToolbarCRs();
        }, 250); // 250ms debounce
    }

    // Update CR values for all open journal toolbars
    static _updateAllToolbarCRs() {
        try {
            // Find all journal sheet elements in the DOM (same approach as MutationObserver)
            // This works for both Application and ApplicationV2
            const journalSheetElements = document.querySelectorAll('.journal-sheet, .journal-entry');
            
            for (const sheetElement of journalSheetElements) {
                // Check if this journal has encounter toolbars
                const toolbars = sheetElement.querySelectorAll('.encounter-toolbar');
                
                if (toolbars.length > 0) {
                    this._updateToolbarCRs(sheetElement);
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error updating CR values", error, true, false);
        }
    }

    // Update CR values for a specific journal toolbar
    static _updateToolbarCRs(html) {
        try {
            // v13: Detect and convert jQuery to native DOM if needed
            let nativeHtml = html;
            if (html && (html.jquery || typeof html.find === 'function')) {
                nativeHtml = html[0] || html.get?.(0) || html;
            }
            
            // Find all toolbars in this journal
            const toolbars = nativeHtml.querySelectorAll('.encounter-toolbar');
            
            toolbars.forEach((toolbarElement) => {
                const pageId = toolbarElement.getAttribute('data-page-id');
                
                if (pageId) {
                    // Recalculate CR values
                    const partyCR = this.getPartyCR();
                    const monsterCR = this.getMonsterCR({ monsters: [] }); // Empty metadata for canvas-only calculation
                    
                    // Update the CR badges with icons intact
                    const partyCrElement = toolbarElement.querySelector('.encounter-party-cr');
                    const monsterCrElement = toolbarElement.querySelector('.encounter-monster-cr');
                    if (partyCrElement) partyCrElement.innerHTML = `<i class="fas fa-helmet-battle"></i>${partyCR}`;
                    if (monsterCrElement) monsterCrElement.innerHTML = `<i class="fas fa-dragon"></i>${monsterCR}`;
                    
                    // Update the deployment pattern badge
                    const currentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern');
                    const patternName = this._getDeploymentPatternName(currentPattern);
                    const deployTypeElement = toolbarElement.querySelector('.deploy-type');
                    if (deployTypeElement) deployTypeElement.innerHTML = `<i class="fas fa-grid-2-plus"></i>${patternName}`;
                    
                    // Update the deployment visibility badge
                    const currentHidden = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden');
                    const visibilityName = this._getDeploymentVisibilityName(currentHidden);
                    const deployVisibilityElement = toolbarElement.querySelector('.deploy-visibility');
                    if (deployVisibilityElement) deployVisibilityElement.innerHTML = `<i class="fas fa-eye"></i>${visibilityName}`;
                    
                    // Update the difficulty badge based on current CR values
                    const difficultyData = this._calculateEncounterDifficulty(partyCR, monsterCR);
                    const difficultyBadge = toolbarElement.querySelector('.difficulty-badge');
                    if (difficultyBadge) {
                        difficultyBadge.innerHTML = `<i class="fa-solid fa-swords"></i>${difficultyData.difficulty}`;
                        difficultyBadge.className = `difficulty-badge ${difficultyData.difficultyClass}`;
                    }
                    
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Updated CR values", { pageId, partyCR, monsterCR }, true, false);
                }
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error updating toolbar CRs", error, true, false);
        }
    }

    // Hook for journal sheet rendering (normal view only)
    static async _onRenderJournalSheet(app, html, data) {
        // Use unified method with immediate retry
        this._processJournalSheet(html, true);
    }

    // Hook for journal page sheet rendering (v13 ApplicationV2 - page-level)
    static async _onRenderJournalPageSheet(app, html, data) {
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: renderJournalPageSheet hook fired", 
            `App: ${app?.constructor?.name}, HTML type: ${html?.constructor?.name}, Tag: ${html?.tagName}`, true, false);
        
        // In v13 ApplicationV2, html is the page element, not the sheet element
        // We need to get the parent journal sheet element to process it correctly
        let sheetElement = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            sheetElement = html[0] || html.get?.(0) || html;
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Converted jQuery to native DOM", 
                `Sheet element: ${sheetElement?.tagName}.${sheetElement?.className}`, true, false);
        }
        
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Initial sheetElement", 
            `Tag: ${sheetElement?.tagName}, Classes: ${sheetElement?.className}`, true, false);
        
        // If html is just the page (article), find the parent journal sheet
        if (sheetElement && (sheetElement.tagName === 'ARTICLE' || sheetElement.classList?.contains('journal-entry-page'))) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Detected page element (article), finding parent sheet", "", true, false);
            
            // Try to get the sheet element from the app
            if (app && app.element) {
                let appElement = app.element;
                if (appElement && (appElement.jquery || typeof appElement.find === 'function')) {
                    appElement = appElement[0] || appElement.get?.(0) || appElement;
                }
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: App.element", 
                    `Tag: ${appElement?.tagName}, Classes: ${appElement?.className}`, true, false);
                
                if (appElement && (appElement.classList?.contains('journal-sheet') || appElement.classList?.contains('journal-entry'))) {
                    sheetElement = appElement;
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Using app.element for journal sheet", 
                        `Sheet element: ${sheetElement.tagName}.${sheetElement.className}`, true, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: app.element is not journal sheet, trying DOM traversal", "", true, false);
                    // Try traversing up the DOM tree
                    let parent = sheetElement.parentElement;
                    let depth = 0;
                    while (parent && !parent.classList?.contains('journal-sheet') && !parent.classList?.contains('journal-entry') && depth < 10) {
                        parent = parent.parentElement;
                        depth++;
                    }
                    if (parent) {
                        sheetElement = parent;
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found journal sheet via DOM traversal", 
                            `Sheet element: ${sheetElement.tagName}.${sheetElement.className}, Depth: ${depth}`, true, false);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Could not find journal sheet via DOM traversal", 
                            `Stopped at depth ${depth}`, false, true);
                    }
                }
            } else {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No app.element available, trying DOM traversal", "", true, false);
                // Try traversing up the DOM tree
                let parent = sheetElement.parentElement;
                let depth = 0;
                while (parent && !parent.classList?.contains('journal-sheet') && !parent.classList?.contains('journal-entry') && depth < 10) {
                    parent = parent.parentElement;
                    depth++;
                }
                if (parent) {
                    sheetElement = parent;
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found journal sheet via DOM traversal", 
                        `Sheet element: ${sheetElement.tagName}.${sheetElement.className}, Depth: ${depth}`, true, false);
                } else {
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Could not find journal sheet via DOM traversal", 
                        `Stopped at depth ${depth}`, false, true);
                }
            }
        } else {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: SheetElement is NOT an article/page element", 
                `Tag: ${sheetElement?.tagName}, Classes: ${sheetElement?.className}`, true, false);
        }
        
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Final sheetElement before processing", 
            `Tag: ${sheetElement?.tagName}, Classes: ${sheetElement?.className}, Has journal-header: ${sheetElement?.querySelector?.('.journal-header') ? 'yes' : 'no'}`, true, false);
        
        // Use unified method with immediate retry
        this._processJournalSheet(sheetElement, true);
    }

    // Hook for when journal entry pages are updated (saves)
    static async _onUpdateJournalEntryPage(page, change, options, userId) {
        // Find the journal sheet and use unified method
        setTimeout(() => {
            const journalSheet = Object.values(ui.windows).find(w => w instanceof JournalSheet && w.document.id === page.parent.id);
            if (journalSheet) {
                this._processJournalSheet(journalSheet.element, false);
            }
        }, 100);
    }

    // Track active page IDs per journal sheet to detect navigation
    static _activePageTracker = new Map();

    // Setup global MutationObserver to catch journal sheets when hooks don't fire
    static _setupGlobalObserver() {
        // Check existing journal sheets on ready
        function checkExistingSheets() {
            const journalSheets = Object.values(ui.windows).filter(w => 
                w?.constructor?.name === 'JournalSheet' || 
                w?.element?.classList?.contains('journal-sheet')
            );
            
            for (const sheet of journalSheets) {
                if (sheet.element && !sheet.element._encounterToolbarProcessed) {
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found existing journal sheet via observer", 
                        `Sheet: ${sheet.constructor.name}`, true, false);
                    sheet.element._encounterToolbarProcessed = true;
                    this._processJournalSheet(sheet.element, true);
                }
            }
        }
        
        // Check on ready
        if (game.ready) {
            checkExistingSheets.call(this);
        } else {
            Hooks.once('ready', () => checkExistingSheets.call(this));
        }
        
        // Watch for new journal sheets being added AND page navigation within existing sheets
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Watch for added nodes (new journal sheets)
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if this is a journal sheet (try multiple selectors)
                        let journalSheet = null;
                        
                        // Try direct class check
                        if (node.classList?.contains('journal-sheet') || node.classList?.contains('journal-entry')) {
                            journalSheet = node;
                        }
                        // Try querySelector for nested sheets
                        if (!journalSheet) {
                            journalSheet = node.querySelector?.('.journal-sheet') || 
                                          node.querySelector?.('.journal-entry');
                        }
                        // Try checking if it's a form with journal classes
                        if (!journalSheet && node.tagName === 'FORM') {
                            if (node.classList?.contains('journal-sheet') || node.classList?.contains('journal-entry')) {
                                journalSheet = node;
                            }
                        }
                        
                        if (journalSheet) {
                            // Find the corresponding app in ui.windows
                            const sheetId = journalSheet.id || journalSheet.getAttribute('data-app-id');
                            const sheet = Object.values(ui.windows).find(w => {
                                if (!w || !w.element) return false;
                                const wElement = w.element.jquery ? w.element[0] : w.element;
                                return wElement === journalSheet || 
                                       wElement?.id === sheetId ||
                                       wElement?.contains?.(journalSheet) ||
                                       journalSheet.contains?.(wElement);
                            });
                            
                            if (sheet && !journalSheet._encounterToolbarProcessed) {
                                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: New journal sheet detected via observer", 
                                    `Sheet: ${sheet.constructor.name}, Element: ${journalSheet.tagName}.${journalSheet.className}`, true, false);
                                journalSheet._encounterToolbarProcessed = true;
                                this._processJournalSheet(journalSheet, true);
                            } else if (journalSheet && !journalSheet._encounterToolbarProcessed) {
                                // Sheet element found but no app - try processing anyway
                                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Journal sheet element found but no app", 
                                    `Element: ${journalSheet.tagName}.${journalSheet.className}`, true, false);
                                journalSheet._encounterToolbarProcessed = true;
                                this._processJournalSheet(journalSheet, true);
                            }
                        }
                    }
                }
                
                // Watch for attribute changes on journal page articles (page navigation)
                // ONLY log if it's actually journal-related to reduce noise
                if (mutation.type === 'attributes' && mutation.target) {
                    const target = mutation.target;
                    
                    // Filter: Only check journal-related elements
                    if (target.tagName === 'ARTICLE' && target.classList?.contains('journal-entry-page')) {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Journal page article attribute change detected", 
                            `Page ID: ${target.getAttribute('data-page-id')}, Attribute: ${mutation.attributeName}`, true, false);
                        
                        // Check if this is within a journal sheet
                        const journalSheet = target.closest('.journal-sheet, .journal-entry');
                        if (journalSheet) {
                            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found parent journal sheet", 
                                `Sheet: ${journalSheet.tagName}.${journalSheet.className}`, true, false);
        
                            // Find the corresponding app (optional - we can process without it)
                            const sheet = Object.values(ui.windows).find(w => {
                                if (!w || !w.element) return false;
                                const wElement = w.element.jquery ? w.element[0] : w.element;
                                return wElement === journalSheet || wElement?.contains?.(journalSheet);
                            });
                            
                            if (sheet) {
                                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found corresponding app window", 
                                    `App: ${sheet.constructor.name}`, true, false);
                            } else {
                                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No corresponding app window found, processing anyway", "", true, false);
                            }
                            
                            // Process the journal sheet regardless of whether we found the app
                            // (The app lookup is optional - _processJournalSheet works with just the DOM element)
                            // Use longer delay to ensure active page class has settled
                            if (journalSheet._pageChangeTimer) {
                                clearTimeout(journalSheet._pageChangeTimer);
                            }
                            journalSheet._pageChangeTimer = setTimeout(() => {
                                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Page navigation detected via observer", 
                                    `Page ID: ${target.getAttribute('data-page-id')}`, true, false);
                                this._processJournalSheet(journalSheet, true);
                            }, 300);
                        }
                    }
                    // Skip logging for non-journal elements - they're just noise
                }
                
                // Also watch for added nodes that might be journal pages
                // Note: This catches when new pages are added, but attribute changes catch when pages become active
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'ARTICLE' && node.classList?.contains('journal-entry-page')) {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: New journal page article added", 
                            `Page ID: ${node.getAttribute('data-page-id')}`, true, false);
                        
                        const journalSheet = node.closest('.journal-sheet, .journal-entry');
                        if (journalSheet) {
                            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Processing new page in existing journal sheet", 
                                `Page ID: ${node.getAttribute('data-page-id')}`, true, false);
                            
                            // Debounce rapid page changes - use longer delay to let active page class settle
                            if (journalSheet._pageChangeTimer) {
                                clearTimeout(journalSheet._pageChangeTimer);
                            }
                            journalSheet._pageChangeTimer = setTimeout(() => {
                                this._processJournalSheet(journalSheet, true);
                            }, 300);
                        }
                    }
                }
            }
        });
        
        // Observe the document body for new journal sheets and page navigation
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-page-id'] // Watch for class changes (active page) and page ID changes
        });
        
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Global MutationObserver setup complete", "", true, false);
        
        // Also set up a periodic check for active page changes (since hooks don't fire)
        // This is a fallback when renderJournalPageSheet doesn't fire
        this._setupActivePageChecker();
        
        // Listen for clicks on journal page navigation buttons
        this._setupPageNavigationListener();
    }
    
    // Set up periodic check for active page changes
    static _setupActivePageChecker() {
        setInterval(() => {
            // Check all open journal sheets for active page changes
            const journalSheets = Object.values(ui.windows).filter(w => {
                if (!w) return false;
                if (w?.constructor?.name === 'JournalSheet') return true;
                if (!w?.element) return false;
                const element = w.element.jquery ? w.element[0] : w.element;
                return element && element.classList && element.classList.contains('journal-sheet');
            });
            
            for (const sheet of journalSheets) {
                const sheetElement = sheet.element?.jquery ? sheet.element[0] : sheet.element;
                if (!sheetElement) continue;
                
                // Find the currently active/visible page
                const activePage = sheetElement.querySelector('article.journal-entry-page.active, article.journal-entry-page:not([style*="display: none"])');
                if (activePage) {
                    const pageId = activePage.getAttribute('data-page-id');
                    const sheetKey = sheetElement.id || sheet.document?.id || 'unknown';
                    const lastKnownPage = this._activePageTracker.get(sheetKey);
                    
                    if (pageId && pageId !== lastKnownPage) {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Active page changed detected", 
                            `Sheet: ${sheetKey}, Old Page: ${lastKnownPage}, New Page: ${pageId}`, true, false);
                        
                        this._activePageTracker.set(sheetKey, pageId);
                        this._processJournalSheet(sheetElement, true);
                    }
                }
            }
        }, 500); // Check every 500ms
    }
    
    // Listen for clicks on journal page navigation
    static _setupPageNavigationListener() {
        document.addEventListener('click', (event) => {
            // Check if click is on a journal page navigation button/tab
            const target = event.target.closest('a[data-page-id], .journal-page-nav a, .journal-entry-page-header a');
            if (target && target.getAttribute('data-page-id')) {
                const pageId = target.getAttribute('data-page-id');
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Journal page navigation clicked", 
                    `Page ID: ${pageId}`, true, false);
                
                // Find the journal sheet containing this navigation
                const journalSheet = target.closest('.journal-sheet, .journal-entry');
                if (journalSheet) {
                    // Small delay to let the page render
                    setTimeout(() => {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Processing after page navigation click", 
                            `Page ID: ${pageId}`, true, false);
                        this._processJournalSheet(journalSheet, true);
                    }, 200);
                }
            }
        }, true); // Use capture phase to catch early
    }

    // Unified method to process journal sheets
    static _processJournalSheet(html, shouldRetry = false) {
        // Only create toolbar in normal view, not edit view
        if (!this._isEditMode(html)) {
            // Try immediately first
            this._updateToolbarContent(html).catch(error => {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error in initial update", error, true, false);
            });
            
            // Retry after delay if requested (for renderJournalSheet)
            if (shouldRetry) {
                // Multiple retries with increasing delays
                const retryDelays = [500, 1000, 2000];
                retryDelays.forEach((delay, index) => {
                    setTimeout(() => {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Retrying metadata search after delay", `Attempt ${index + 2}`, true, false);
                        this._updateToolbarContent(html).catch(error => {
                                                          postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Error in retry ${index + 2}`, error, true, false);
                        });
                    }, delay);
                });
            }
        }
    }

    // Helper method to check if we're in edit mode
    static _isEditMode(html) {
        // Check if the specific journal sheet has editor-container (is in edit mode)
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        return nativeHtml.querySelector('.editor-container') !== null;
    }

    // Helper method to validate UUIDs
    /**
     * Validate a UUID
     * @deprecated Use validateActorUUID from api-tokens.js instead
     */
    static async _validateUUID(uuid) {
        return await validateActorUUID(uuid);
    }

    // Helper method to determine if an actor is a monster (vs NPC)
    static async _isActorMonster(uuid) {
        try {
            const actor = await fromUuid(uuid);
            if (actor) {
                // In FoundryVTT, both monsters and NPCs are typically of type 'npc'
                // The distinction is usually made by disposition or other properties
                // For now, let's use a simple heuristic: if the actor has a hostile disposition or is from a monster compendium, it's a monster
                // Otherwise, it's an NPC
                
                // Check if it's from a monster compendium
                if (actor.pack && actor.pack.includes('monster')) {
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Actor ${actor.name} classified as monster (monster compendium)`, "", true, false);
                    return true;
                }
                
                // Check disposition (hostile = monster, friendly/neutral = NPC)
                if (actor.prototypeToken && actor.prototypeToken.disposition !== undefined) {
                    const isMonster = actor.prototypeToken.disposition <= -1; // Hostile
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Actor ${actor.name} classified as ${isMonster ? 'monster' : 'npc'} (disposition: ${actor.prototypeToken.disposition})`, "", true, false);
                    return isMonster;
                }
                
                // Default: assume it's a monster if we can't determine
                postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Actor ${actor.name} classified as monster (default)`, "", true, false);
                return true;
            }
            postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Actor ${uuid} classified as monster (no actor found)`, "", true, false);
            return true; // Default to monster if we can't determine
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Error checking actor type for ${uuid}`, error, false, false);
            return true; // Default to monster on error
        }
    }

    // Helper method to get monster details for display
    static async _getMonsterDetails(monsterUUIDs) {
        const monsterDetails = [];
        
        for (const uuid of monsterUUIDs) {
            try {
                const actor = await fromUuid(uuid);
                if (actor) {
                    // Get the name
                    const name = actor.name || 'Unknown Monster';
                    
                    // Get CR value - try multiple paths
                    let cr = 0;
                    if (actor.system?.details?.cr?.value !== undefined) {
                        cr = actor.system.details.cr.value;
                    } else if (actor.system?.details?.cr !== undefined) {
                        cr = actor.system.details.cr;
                    } else if (actor.system?.cr !== undefined) {
                        cr = actor.system.cr;
                    }
                    
                    // Get portrait - try multiple sources; resolve wildcards for display (multiple-variant tokens)
                    let portrait = null;
                    if (actor.img) {
                        portrait = actor.img;
                    } else if (actor.prototypeToken?.texture?.src) {
                        portrait = actor.prototypeToken.texture.src;
                    }
                    if (portrait && typeof portrait === 'string' && portrait.includes('*')) {
                        portrait = await resolveWildcardPath(portrait);
                    }
                    
                    monsterDetails.push({ uuid, name, cr, portrait });
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Monster details", { name, cr, portrait }, true, false);
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Error getting details for ${uuid}`, error, false, false);
            }
        }
        
        return monsterDetails;
    }

    // Enhanced method to scan journal content for encounter data
    static async _scanJournalContent(html, pageId) {
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Starting content scan for page", pageId, true, false);
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Get the journal page content - try different selectors
        let pageContent = nativeHtml.querySelector(`article[data-page-id="${pageId}"] section.journal-page-content`);
        
        if (!pageContent) {
            // If that doesn't work, try finding the article first, then the section
            const article = nativeHtml.querySelector(`article[data-page-id="${pageId}"]`);
            if (article) {
                pageContent = article.querySelector('section.journal-page-content');
            }
        }
        
        if (!pageContent) {
            // Try finding any section
            pageContent = nativeHtml.querySelector('section.journal-page-content');
        }
        
        if (!pageContent) {
            // Last resort: search the entire document
            pageContent = document.querySelector(`article[data-page-id="${pageId}"] section.journal-page-content`);
        }
        
        if (!pageContent) {
            // Try a broader search for any content
            pageContent = document.querySelector('.journal-page-content');
        }
        
        if (!pageContent) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No page content found", "", true, false);
            return null;
        }

        // Check if content scanning is enabled
        if (!game.settings.get(MODULE.ID, 'enableEncounterContentScanning')) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Content scanning disabled", "", true, false);
            return null;
        }

        // Extract both text and HTML content
        const textContent = pageContent.textContent || '';
        const htmlContent = pageContent.innerHTML || '';
        
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Text content length", textContent.length, true, false);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: HTML content length", htmlContent.length, true, false);

        // Try JSON format first (for structured data)
        let encounterData = this._parseJSONEncounter(htmlContent);
        if (encounterData) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found JSON encounter data", "", true, false);
            return encounterData;
        }

        // Use the new pattern-based detection
        encounterData = await this._parsePatternBasedEncounter(textContent, htmlContent);
        if (encounterData) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found pattern-based encounter data", "", true, false);
            return encounterData;
        }

        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No encounter data found", "", true, false);
        return null;
    }

    // Pattern-based encounter detection
    static async _parsePatternBasedEncounter(textContent, htmlContent) {
        const encounterData = {
            monsters: [],
            npcs: [],
            difficulty: null
        };

        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Scanning text content for patterns", { textLength: textContent.length, htmlLength: htmlContent.length }, true, false);

        // 1. Find all data-uuid attributes in the content (Foundry renders links as <a> tags)
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Looking for data-uuid attributes in HTML content", "", true, false);
        const uuidMatches = htmlContent.match(/data-uuid="([^"]+)"/g);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found UUID matches", uuidMatches?.length || 0, true, false);

        if (uuidMatches) {
            for (const match of uuidMatches) {
                const uuidMatch = match.match(/data-uuid="([^"]+)"/);
                if (uuidMatch) {
                    const uuid = uuidMatch[1];
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Processing UUID", uuid, true, false);
                    
                    // 2. Check if this UUID contains "Actor" (case-insensitive)
                    if (uuid.toLowerCase().includes('actor')) {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found Actor UUID", uuid, true, false);
                        
                        // 3. Look for quantity indicators near this UUID
                        let quantity = 1;
                        
                        // Find the context around this UUID (within 100 characters)
                        const uuidIndex = htmlContent.indexOf(match);
                        const contextStart = Math.max(0, uuidIndex - 100);
                        const contextEnd = Math.min(htmlContent.length, uuidIndex + match.length + 100);
                        const context = htmlContent.substring(contextStart, contextEnd);
                        
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Context around UUID", context.substring(0, 100), false, false);

                        // Look for quantity patterns
                        const quantityPatterns = [
                            /(\d+)\s*x\s*$/i,           // "3 x" at end
                            /x\s*(\d+)/i,               // "x 3"
                            /\((\d+)\)/i,               // "(3)"
                            /\s(\d+)\s*$/i              // " 3 " at end
                        ];
                        
                        for (const pattern of quantityPatterns) {
                            const quantityMatch = context.match(pattern);
                            if (quantityMatch) {
                                quantity = parseInt(quantityMatch[1]);
                                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found quantity", quantity, true, false);
                                break;
                            }
                        }
                        
                        // Determine if this is a monster or NPC and add to appropriate array
                        const isMonster = await this._isActorMonster(uuid);
                        for (let i = 0; i < quantity; i++) {
                            if (isMonster) {
                                encounterData.monsters.push(uuid);
                            } else {
                                encounterData.npcs.push(uuid);
                            }
                        }
                    } else {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: UUID is not an Actor type", uuid, true, false);
                    }
                }
            }
        }

        // 4. Look for difficulty patterns (case-insensitive)
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Looking for difficulty patterns", "", true, false);
        const difficultyPatterns = [
            /difficulty\s*:\s*(easy|medium|hard|deadly)/i,
            /difficulty\s*=\s*(easy|medium|hard|deadly)/i,
            /(easy|medium|hard|deadly)\s*difficulty/i
        ];

        for (const pattern of difficultyPatterns) {
            const difficultyMatch = textContent.match(pattern);
            if (difficultyMatch) {
                encounterData.difficulty = difficultyMatch[1].toLowerCase();
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found difficulty", encounterData.difficulty, true, false);
                break;
            }
        }

        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Final encounter data", encounterData, true, false);
        return (encounterData.monsters.length > 0 || encounterData.npcs.length > 0 || encounterData.difficulty) ? encounterData : null;
    }

    static _hasEncounterCombatants(encounterData) {
        if (!encounterData) return false;
        const monsterCount = Array.isArray(encounterData.monsters) ? encounterData.monsters.length : 0;
        const npcCount = Array.isArray(encounterData.npcs) ? encounterData.npcs.length : 0;
        return (monsterCount + npcCount) > 0;
    }

    // Parse JSON encounter data
    static _parseJSONEncounter(htmlContent) {
        try {
            // Look for JSON blocks in the content
            const jsonMatches = htmlContent.match(/```json\s*([\s\S]*?)\s*```/g);
            if (!jsonMatches) return null;

            for (const match of jsonMatches) {
                const jsonContent = match.replace(/```json\s*/, '').replace(/\s*```/, '');
                const data = JSON.parse(jsonContent);
                
                if (data.encounter && (data.encounter.monsters || data.encounter.npcs || data.encounter.difficulty)) {
                    return {
                        monsters: data.encounter.monsters || [],
                        npcs: data.encounter.npcs || [],
                        difficulty: data.encounter.difficulty || null
                    };
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }



    // Simple method to update toolbar content
    static async _updateToolbarContent(html) {
        // Check if toolbar is enabled in settings
        if (!game.settings.get(MODULE.ID, 'enableJournalEncounterToolbar')) {
            return;
        }

        // Check if we're in a journal sheet context
        if (!html) {
            return;
        }

        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Get the ACTIVE page ID to scope the toolbar
        // Find the active/visible page (not just any page)
        const journalPage = nativeHtml.querySelector('article.journal-entry-page.active, article.journal-entry-page:not([style*="display: none"])');
        const pageId = journalPage ? journalPage.getAttribute('data-page-id') : null;
        
        if (!pageId) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No active page ID found", "", true, false);
            return; // Can't create toolbar without page ID
        }
        
        // Clean up any old toolbars from other pages (only one toolbar should exist at a time)
        const allToolbars = nativeHtml.querySelectorAll('.encounter-toolbar');
        for (const oldToolbar of allToolbars) {
            const oldPageId = oldToolbar.getAttribute('data-page-id');
            if (oldPageId && oldPageId !== pageId) {
                oldToolbar.remove();
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Removed old toolbar", `Old Page ID: ${oldPageId}`, true, false);
            }
        }
        
        // Check if toolbar already exists for this specific page, if not create it
        const toolbarSelector = `.encounter-toolbar[data-page-id="${pageId}"]`;
        let toolbar = nativeHtml.querySelector(toolbarSelector);
        
        if (!toolbar) {
            // Create the toolbar container
            const journalHeader = nativeHtml.querySelector('.journal-header');
            const journalEntryPages = nativeHtml.querySelector('.journal-entry-pages');
            
            if (journalHeader && journalEntryPages) {
                const toolbarContainer = document.createElement('div');
                toolbarContainer.className = 'encounter-toolbar';
                toolbarContainer.setAttribute('data-page-id', pageId);
                journalHeader.insertAdjacentElement('afterend', toolbarContainer);
                toolbar = toolbarContainer;
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Created toolbar container", `Page ID: ${pageId}`, true, false);
            } else {
                return; // Can't create toolbar
            }
        }

        // Try content scanning for encounter data (check all journals, not just encounter type)
        let encounterData = await this._scanJournalContent(html, pageId);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Content scan result", encounterData, true, false);
        
        const hasCombatants = this._hasEncounterCombatants(encounterData);
        if (!hasCombatants) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No combatants detected, removing toolbar", { pageId, encounterData }, true, false);
            toolbar?.remove();
            return;
        }
        
        if (encounterData) {
            // We have encounter data - use the full toolbar
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Found encounter data, updating toolbar", "", true, false);
            
            try {
                // Check if we have monsters and NPCs
                const hasMonsters = encounterData.monsters && encounterData.monsters.length > 0;
                const hasNpcs = encounterData.npcs && encounterData.npcs.length > 0;
                
                // Get monster details for display
                let monsterDetails = [];
                if (hasMonsters) {
                    monsterDetails = await this._getMonsterDetails(encounterData.monsters);
                }
                
                // Get NPC details for display
                let npcDetails = [];
                if (hasNpcs) {
                    npcDetails = await this._getMonsterDetails(encounterData.npcs);
                }
                
                // Calculate CR values
                const partyCR = this.getPartyCR();
                const monsterCR = this.getMonsterCR(encounterData);
                
                // Calculate difficulty based on canvas tokens using the same formula as encounter configuration
                const difficultyData = this._calculateEncounterDifficulty(partyCR, monsterCR);

                // Get the template
                const templatePath = `modules/${MODULE.ID}/templates/encounter-toolbar.hbs`;
                getCachedTemplate(templatePath).then(template => {
                    // Prepare the data for the template
                    // v13: Detect and convert jQuery to native DOM if needed
                    let nativeHtml = html;
                    if (html && (html.jquery || typeof html.find === 'function')) {
                        nativeHtml = html[0] || html.get?.(0) || html;
                    }
                    const journalSheet = nativeHtml.closest('.journal-sheet');
                    const journalId = journalSheet ? journalSheet.getAttribute('data-document-id') : 'unknown';
                    const templateData = {
                        journalId: journalId,
                        hasEncounterData: true,
                        hasMonsters,
                        hasNpcs,
                        monsters: monsterDetails,
                        npcs: npcDetails,
                        difficulty: difficultyData.difficulty,
                        difficultyClass: difficultyData.difficultyClass,
                        partyCR: partyCR,
                        monsterCR: monsterCR,
                        deploymentPattern: this._getDeploymentPatternName(game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern')),
                        deploymentVisibility: this._getDeploymentVisibilityName(game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden')),
                        isGM: game.user.isGM
                    };
                    
                    // Render the toolbar
                    const renderedHtml = template(templateData);
                    toolbar.innerHTML = renderedHtml;
                    
                    // Add event listeners to the buttons
                    this._addEventListeners(toolbar, encounterData);
                    
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Updated with encounter data", "", true, false);
                });
                
                return; // Exit early since we're handling this asynchronously
                
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error processing encounter data", error, true, false);
                toolbar?.remove();
                return;
            }
        }
    }

    static _addEventListeners(toolbar, metadata) {
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Setting up event listeners with metadata", metadata, true, false);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Metadata monsters array", metadata.monsters || [], true, false);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Metadata npcs array", metadata.npcs || [], true, false);
        
        // Deploy monsters button - scope to this toolbar only
        const deployMonstersButton = toolbar.querySelector('.deploy-monsters');
        if (deployMonstersButton) {
            deployMonstersButton.addEventListener('click', async (event) => {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deploy monsters button clicked!", "", true, false);
                event.preventDefault();
                event.stopPropagation();
                EncounterToolbar._deployMonsters(metadata);
            });
        }
        
        // Create combat button - scope to this toolbar only
        const createCombatButton = toolbar.querySelector('.create-combat');
        if (createCombatButton) {
            createCombatButton.addEventListener('click', async (event) => {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Create combat button clicked!", "", true, false);
                event.preventDefault();
                event.stopPropagation();
                
                // Deploy monsters first, then create combat
                const deployedTokens = await EncounterToolbar._deployMonsters(metadata);
                if (deployedTokens && deployedTokens.length > 0) {
                    await EncounterToolbar._createCombatWithTokens(deployedTokens, metadata);
                }
            });
        }

        // Toggle visibility button - scope to this toolbar only
        const toggleVisibilityButton = toolbar.querySelector('.toggle-visibility');
        if (toggleVisibilityButton) {
            toggleVisibilityButton.addEventListener('click', async (event) => {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Toggle visibility button clicked!", "", true, false);
                event.preventDefault();
                event.stopPropagation();
                
                await EncounterToolbar._toggleTokenVisibility();
            });
        }

        // Deployment type badge - cycle through deployment patterns
        const deployTypeBadge = toolbar.querySelector('.deploy-type');
        if (deployTypeBadge) {
            deployTypeBadge.addEventListener('click', async (event) => {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment type badge clicked!", "", true, false);
                event.preventDefault();
                event.stopPropagation();
                
                await EncounterToolbar._cycleDeploymentPattern();
                
                // Immediately update THIS button's text
                const newPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern');
                const patternName = EncounterToolbar._getDeploymentPatternName(newPattern);
                deployTypeBadge.innerHTML = `<i class="fas fa-grid-2-plus"></i>${patternName}`;
            });
        }

        // Deployment visibility badge - toggle visibility setting
        const deployVisibilityBadge = toolbar.querySelector('.deploy-visibility');
        if (deployVisibilityBadge) {
            deployVisibilityBadge.addEventListener('click', async (event) => {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment visibility badge clicked!", "", true, false);
                event.preventDefault();
                event.stopPropagation();
                
                await EncounterToolbar._toggleDeploymentVisibility();
                
                // Immediately update THIS button's text
                const newHidden = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden');
                const visibilityName = EncounterToolbar._getDeploymentVisibilityName(newHidden);
                deployVisibilityBadge.innerHTML = `<i class="fas fa-eye"></i>${visibilityName}`;
            });
        }

        // Monster icon clicks - deploy individual monsters
        toolbar.querySelectorAll('.encounter-icon-monster').forEach((monsterIcon) => {
            monsterIcon.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const monsterUUID = monsterIcon.getAttribute('data-uuid');
                
                if (monsterUUID) {
                    const isCtrlHeld = event.ctrlKey;
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Monster icon clicked!", `UUID: ${monsterUUID}, CTRL: ${isCtrlHeld}`, true, false);
                    
                    // Create metadata for just this one monster
                    const singleMonsterMetadata = {
                        ...metadata,
                        monsters: [monsterUUID],
                        npcs: []
                    };
                    
                    // Use multiple deployment only if CTRL is held, otherwise use regular deployment
                    if (isCtrlHeld) {
                        await EncounterToolbar._deploySingleMonsterMultiple(singleMonsterMetadata);
                    } else {
                        await EncounterToolbar._deployMonsters(singleMonsterMetadata);
                    }
                }
            });
        });

        // NPC icon clicks - deploy individual NPCs
        toolbar.querySelectorAll('.encounter-icon-npc').forEach((npcIcon) => {
            npcIcon.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const npcUUID = npcIcon.getAttribute('data-uuid');
                
                if (npcUUID) {
                    const isCtrlHeld = event.ctrlKey;
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: NPC icon clicked!", `UUID: ${npcUUID}, CTRL: ${isCtrlHeld}`, true, false);
                    
                    // Create metadata for just this one NPC
                    const singleNpcMetadata = {
                        ...metadata,
                        monsters: [],
                        npcs: [npcUUID]
                    };
                    
                    // Use multiple deployment only if CTRL is held, otherwise use regular deployment
                    if (isCtrlHeld) {
                        await EncounterToolbar._deploySingleMonsterMultiple(singleNpcMetadata);
                    } else {
                        await EncounterToolbar._deployMonsters(singleNpcMetadata);
                    }
                }
            });
        });
    }

    /**
     * Public API: Deploy monsters/NPCs to the canvas (same logic as the journal toolbar).
     * @param {Object} metadata - Encounter data: { monsters?: Array<string|{uuid: string, name?, cr?, portrait?}>, npcs?: Array<...> }
     * @param {Object} [options] - Overrides: deploymentPattern, deploymentHidden, position {x,y} (skips click), sceneId (future)
     * @returns {Promise<Array>} Created token documents
     */
    static async deployMonsters(metadata, options = {}) {
        return this._deployMonsters(metadata, options);
    }

    static async _deployMonsters(metadata, overrides = {}) {
        // Check if user has permission to create tokens
        if (!game.user.isGM) {
            return [];
        }

        // Combine monsters and NPCs for deployment
        const allTokens = [...(metadata.monsters || []), ...(metadata.npcs || [])];

        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment - monsters array", metadata.monsters || [], true, false);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment - npcs array", metadata.npcs || [], true, false);
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment - combined allTokens", allTokens, true, false);

        if (allTokens.length === 0) {
            return [];
        }

        // Deployment pattern and visibility: overrides or module settings
        const deploymentPattern = overrides.deploymentPattern ?? game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern');
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Deployment pattern", deploymentPattern, true, false);

        // Handle sequential deployment (now uses shared API)
        if (deploymentPattern === "sequential") {
            // Actor preparation callback - handles compendium actors and encounter folder
            const onActorPrepared = async (actor, worldActor) => {
                // First, create a world copy of the actor if it's from a compendium
                if (actor.pack) {
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Creating world copy of compendium actor", "", true, false);
                    const actorData = actor.toObject();
                    
                    // Get or create the encounter folder
                    const folderName = game.settings.get(MODULE.ID, 'encounterFolder');
                    let encounterFolder = null;
                    
                    // Only create/find folder if folderName is not empty
                    if (folderName && folderName.trim() !== '') {
                        encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                        
                        if (!encounterFolder) {
                            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Creating encounter folder", folderName, true, false);
                            encounterFolder = await Folder.create({
                                name: folderName,
                                type: 'Actor',
                                color: '#ff0000'
                            });
                            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Encounter folder created", encounterFolder.id, true, false);
                        }
                    }
                    
                    // Create the world actor
                    const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                    worldActor = await Actor.create(actorData, createOptions);
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: World actor created", worldActor.id, true, false);
                    
                    // Ensure folder is assigned
                    if (encounterFolder && !worldActor.folder) {
                        await worldActor.update({ folder: encounterFolder.id });
                    }
                }
                
                return worldActor;
            };
            
            // Custom tooltip content for sequential deployment
            const getTooltipContent = (actorName, index, total) => {
                return `
                    <div class="monster-name">${actorName}</div>
                    <div class="progress">Click to place (${index} of ${total})</div>
                `;
            };
            
            const deploymentHidden = overrides.deploymentHidden ?? game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden');

            return await deployTokensSequential(allTokens, {
                deploymentHidden,
                onActorPrepared,
                getTooltipContent
            });
        }

        // Use shared deployment API for non-sequential deployments
        const deploymentHidden = overrides.deploymentHidden ?? game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden');
        const isSingleToken = allTokens.length === 1;
        
        // Custom tooltip content function
        const getTooltipContent = async (tokenCount, patternName) => {
            if (tokenCount === 1) {
                // For single token, get the details for the tooltip
                const tokenDetails = await this._getMonsterDetails(allTokens);
                if (tokenDetails.length > 0) {
                    const token = tokenDetails[0];
                    return `
                        <div class="monster-name">Deploy ${token.name} (CR ${token.cr})</div>
                        <div class="progress">${patternName} - Click to place</div>
                    `;
                } else {
                    return `
                        <div class="monster-name">Deploying Token</div>
                        <div class="progress">${patternName} - Click to place</div>
                    `;
                }
            } else {
                return `
                    <div class="monster-name">Deploying Tokens</div>
                    <div class="progress">${patternName} - Click to place ${tokenCount} tokens</div>
                `;
            }
        };
        
        // Actor preparation callback - handles compendium actors and encounter folder
        const onActorPrepared = async (actor, worldActor) => {
            // First, create a world copy of the actor if it's from a compendium
            if (actor.pack) {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Creating world copy of compendium actor", "", true, false);
                const actorData = actor.toObject();
                
                // Get or create the encounter folder
                const folderName = game.settings.get(MODULE.ID, 'encounterFolder');
                let encounterFolder = null;
                
                // Only create/find folder if folderName is not empty
                if (folderName && folderName.trim() !== '') {
                    encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                    
                    if (!encounterFolder) {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Creating encounter folder", folderName, true, false);
                        encounterFolder = await Folder.create({
                            name: folderName,
                            type: 'Actor',
                            color: '#ff0000'
                        });
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Encounter folder created", encounterFolder.id, true, false);
                    }
                }
                
                // Create the world actor
                const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                worldActor = await Actor.create(actorData, createOptions);
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: World actor created", worldActor.id, true, false);
                
                // Ensure folder is assigned (sometimes it doesn't get set during creation)
                if (encounterFolder && !worldActor.folder) {
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Folder not assigned during creation, updating actor...", "", true, false);
                    await worldActor.update({ folder: encounterFolder.id });
                }
                
                // Update the prototype token to honor GM defaults
                const defaultTokenData = getDefaultTokenData();
                const prototypeTokenData = foundry.utils.mergeObject(defaultTokenData, worldActor.prototypeToken.toObject(), { overwrite: false });
                await worldActor.update({ prototypeToken: prototypeTokenData });
            }
            
            return worldActor;
        };
        
        // Deploy using shared API (optionally use provided position to skip click)
        const deployOptions = {
            deploymentPattern,
            deploymentHidden,
            getTooltipContent: getTooltipContent,
            onActorPrepared: onActorPrepared
        };
        if (overrides.position != null) {
            deployOptions.position = overrides.position;
            deployOptions.isAltHeld = overrides.isAltHeld ?? false;
        }
        const deployedTokens = await deployTokens(allTokens, deployOptions);

        return deployedTokens;
    }

    // Deploy a single token multiple times with CTRL key support
    static async _deploySingleMonsterMultiple(metadata) {
        // Check if user has permission to create tokens
        if (!game.user.isGM) {
            return [];
        }
        
        // Get the token UUID (either monster or NPC)
        const allTokens = [...(metadata.monsters || []), ...(metadata.npcs || [])];
        
        if (allTokens.length === 0) {
            return [];
        }

        const deployedTokens = [];
        const tokenUUID = allTokens[0]; // Single token
        
        // Declare variables in outer scope for cleanup
        let tooltip = null;
        let mouseMoveHandler = null;
        
        try {
            // Validate the UUID
            const validatedId = await this._validateUUID(tokenUUID);
            if (!validatedId) {
                postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Could not validate UUID`, tokenUUID, true, false);
                return [];
            }
            
            const actor = await fromUuid(validatedId);
            
            if (!actor) {
                return [];
            }

            // Get the deployment pattern setting for positioning
            const deploymentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern');
            const deploymentHidden = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden');
            
            // Create tooltip for deployment
            tooltip = document.createElement('div');
            tooltip.className = 'encounter-tooltip';
            document.body.appendChild(tooltip);
            
            mouseMoveHandler = (event) => {
                tooltip.style.left = (event.data.global.x + 15) + 'px';
                tooltip.style.top = (event.data.global.y - 40) + 'px';
            };
            
            // Show initial tooltip
            const patternName = this._getDeploymentPatternName(deploymentPattern);
            tooltip.innerHTML = `
                <div class="monster-name">Deploy ${actor.name} (CR ${actor.system.details.cr})</div>
                <div class="progress">${patternName} - Click to place, release CTRL to finish</div>
            `;
            tooltip.classList.add('show');
            canvas.stage.on('mousemove', mouseMoveHandler);

            // First, create a world copy of the actor if it's from a compendium
            let worldActor = actor;
            if (actor.pack) {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Creating world copy of compendium actor", "", true, false);
                const actorData = actor.toObject();
                
                // Get or create the encounter folder
                const folderName = game.settings.get(MODULE.ID, 'encounterFolder');
                let encounterFolder = null;
                
                if (folderName && folderName.trim() !== '') {
                    encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                    
                    if (!encounterFolder) {
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Creating encounter folder", folderName, true, false);
                        encounterFolder = await Folder.create({
                            name: folderName,
                            type: 'Actor',
                            color: '#ff0000'
                        });
                        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Encounter folder created", encounterFolder.id, true, false);
                    }
                }
                
                // Create the world actor
                const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                worldActor = await Actor.create(actorData, createOptions);
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: World actor created", worldActor.id, true, false);
                
                // Ensure folder is assigned
                if (encounterFolder && !worldActor.folder) {
                    await worldActor.update({ folder: encounterFolder.id });
                }
                
                // Update the prototype token to honor GM defaults
                const defaultTokenData = this._getDefaultTokenData();
                const prototypeTokenData = foundry.utils.mergeObject(defaultTokenData, worldActor.prototypeToken.toObject(), { overwrite: false });
                await worldActor.update({ prototypeToken: prototypeTokenData });
            }

            // Deploy multiple instances
            let continueDeploying = true;
            while (continueDeploying) {
                // Get the target position (where the user clicked)
                const positionResult = await this._getTargetPosition(true); // Allow multiple
                
                if (!positionResult) {
                    // User cancelled or no position obtained
                    // Clean up tooltip immediately when deployment ends
                    if (tooltip && tooltip.parentNode) {
                        tooltip.remove();
                    }
                    if (mouseMoveHandler) {
                        canvas.stage.off('mousemove', mouseMoveHandler);
                    }
                    break;
                }
                
                const position = positionResult.position;
                const isAltHeld = positionResult.isAltHeld;
                
                // Create token data
                const tokenData = foundry.utils.mergeObject(
                    this._getDefaultTokenData(),
                    worldActor.prototypeToken.toObject(),
                    { overwrite: false }
                );
                
                // Set token properties
                tokenData.x = position.x;
                tokenData.y = position.y;
                tokenData.actorId = worldActor.id;
                // Honor the original actor's linked setting
                tokenData.actorLink = worldActor.prototypeToken.actorLink;
                // Set hidden based on ALT key or deployment setting
                tokenData.hidden = isAltHeld ? true : deploymentHidden;
                
                // Honor lock rotation setting
                const defaultTokenData = this._getDefaultTokenData();
                if (defaultTokenData.lockRotation !== undefined) {
                    tokenData.lockRotation = defaultTokenData.lockRotation;
                }
                
                // Create the token on the canvas
                const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Single monster token creation result", createdTokens, true, false);
                
                // Verify the token was created
                if (createdTokens && createdTokens.length > 0) {
                    const token = createdTokens[0];
                    deployedTokens.push(token);
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Created single monster token", token, true, false);
                    
                    // Update tooltip to show success and continue instruction
                    tooltip.innerHTML = `
                        <div class="monster-name">${actor.name} Deployed</div>
                        <div class="progress">Hold CTRL and click to place another, release CTRL to finish</div>
                    `;
                }
            }
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error deploying single monster multiple times", error, true, false);
        } finally {
            // Clean up tooltip and handlers
            if (tooltip && tooltip.parentNode) {
                tooltip.remove();
            }
            if (mouseMoveHandler) {
                canvas.stage.off('mousemove', mouseMoveHandler);
            }
        }
        
        return deployedTokens;
    }

    // Make hidden monster tokens visible
    static async _toggleTokenVisibility() {
        // Check if user has permission to modify tokens
        if (!game.user.isGM) {
            return;
        }

        try {
            // Get all tokens on the current scene
            const allTokens = canvas.tokens.placeables;
            
            if (allTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, "No tokens found on the canvas.", "", false, false);
                return;
            }

            // Filter for hidden monster tokens only (hostile NPCs)
            const hiddenMonsterTokens = allTokens.filter(token => {
                const type = token.actor?.type;
                // Must be an NPC
                if (type !== "npc") return false;
                
                // Must be hidden
                if (!token.document.hidden) return false;
                
                // Must be hostile (not friendly/neutral)
                const disposition = token.document.disposition;
                return disposition <= -1; // Hostile tokens have disposition -1 or lower
            });
            
            if (hiddenMonsterTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, "No hidden tokens found on the canvas.", "", false, false);
                return;
            }

            // Update each token to make it visible
            for (const token of hiddenMonsterTokens) {
                await token.document.update({ hidden: false });
            }
            
            // Show notification with results
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Made monster tokens visible", `${hiddenMonsterTokens.length} tokens`, true, false);
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error making monster tokens visible", error, true, false);
        }
    }

    /**
     * Calculate circle position
     * @deprecated Use calculateCirclePosition from api-tokens.js instead
     */
    static _calculateCirclePosition(centerPosition, index, totalTokens) {
        return calculateCirclePosition(centerPosition, index, totalTokens);
    }

    /**
     * Calculate scatter position
     * @deprecated Use calculateScatterPosition from api-tokens.js instead
     */
    static _calculateScatterPosition(centerPosition, index, totalTokens) {
        return calculateScatterPosition(centerPosition, index, totalTokens);
    }

    // Helper function to check if a grid square is occupied
    // Note: This is still used internally by calculateScatterPosition, so we keep it
    // but it's also exported from api-tokens.js as isGridSquareOccupied
    static _isGridSquareOccupied(x, y, gridSize) {
        const snappedX = Math.floor(x / gridSize) * gridSize;
        const snappedY = Math.floor(y / gridSize) * gridSize;

        return canvas.tokens.placeables.some(token => {
            const tokenX = Math.floor(token.x / gridSize) * gridSize;
            const tokenY = Math.floor(token.y / gridSize) * gridSize;
            return tokenX === snappedX && tokenY === snappedY;
        });
    }

    /**
     * Calculate square position
     * @deprecated Use calculateSquarePosition from api-tokens.js instead
     */
    static _calculateSquarePosition(centerPosition, index, totalTokens) {
        return calculateSquarePosition(centerPosition, index, totalTokens);
    }

    /**
     * Get deployment pattern name
     * @deprecated Use getDeploymentPatternName from api-tokens.js instead
     */
    static _getDeploymentPatternName(pattern) {
        return getDeploymentPatternName(pattern);
    }

    static _getDeploymentVisibilityName(isHidden) {
        return isHidden ? "Hidden" : "Visible";
    }

    static _calculateEncounterDifficulty(partyCR, monsterCR) {
        // Calculate difficulty based on the ratio of monster CR to party CR
        // Using the same formula as the encounter configuration system

        if (partyCR <= 0 || monsterCR <= 0) {
            return { difficulty: "None", difficultyClass: "none" };
        }

        const ratio = monsterCR / partyCR;

        if (ratio <= 0) {
            return { difficulty: "None", difficultyClass: "none" };
        } else if (ratio < 0.25) {
            return { difficulty: "Trivial", difficultyClass: "trivial" };
        } else if (ratio < 0.5) {
            return { difficulty: "Easy", difficultyClass: "easy" };
        } else if (ratio < 1.0) {
            return { difficulty: "Moderate", difficultyClass: "medium" };
        } else if (ratio < 1.5) {
            return { difficulty: "Hard", difficultyClass: "hard" };
        } else if (ratio < 1.75) {
            return { difficulty: "Deadly", difficultyClass: "deadly" };
        } else if (ratio < 2.0) {
            return { difficulty: "Deadly", difficultyClass: "deadly" };
        } else if (ratio < 2.25) {
            return { difficulty: "Deadly", difficultyClass: "deadly" };
        } else {
            return { difficulty: "Impossible", difficultyClass: "impossible" };
        }
    }

    /**
     * Public API: Calculate encounter difficulty from party CR and monster CR (numeric or parseable).
     * @param {number|string} partyCR - Party challenge rating (number or string e.g. "39", "1/2")
     * @param {number|string} monsterCR - Monster challenge rating (number or string)
     * @returns {{ difficulty: string, difficultyClass: string }}
     */
    static calculateEncounterDifficulty(partyCR, monsterCR) {
        const p = typeof partyCR === 'number' ? partyCR : this.parseCR(String(partyCR ?? '0'));
        const m = typeof monsterCR === 'number' ? monsterCR : this.parseCR(String(monsterCR ?? '0'));
        return this._calculateEncounterDifficulty(p, m);
    }

    /**
     * Public API: Get full combat assessment (party CR, monster CR, difficulty) for the current canvas.
     * Uses tokens on the current scene: player-owned character tokens for party CR, NPC tokens for monster CR.
     * @param {Object} [metadata] - Optional encounter metadata; if provided with monsters/npcs, getMonsterCR may use it (toolbar uses {} for canvas-only).
     * @returns {{ partyCR: number, monsterCR: number, partyCRDisplay: string, monsterCRDisplay: string, difficulty: string, difficultyClass: string }}
     */
    static getCombatAssessment(metadata = {}) {
        const partyCRDisplay = this.getPartyCR();
        const monsterCRDisplay = this.getMonsterCR(metadata);
        const partyCR = this.parseCR(partyCRDisplay);
        const monsterCR = this.parseCR(monsterCRDisplay);
        const { difficulty, difficultyClass } = this.calculateEncounterDifficulty(partyCR, monsterCR);
        return {
            partyCR,
            monsterCR,
            partyCRDisplay,
            monsterCRDisplay,
            difficulty,
            difficultyClass
        };
    }

    static async _cycleDeploymentPattern() {
        // Check if user has permission to change settings
        if (!game.user.isGM) {
            return;
        }

        try {
            // Get current deployment pattern
            const currentPattern = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentPattern');
            
            // Define the order of patterns to cycle through
            const patternOrder = ["circle", "line", "scatter", "grid", "sequential"];
            
            // Find current pattern index
            const currentIndex = patternOrder.indexOf(currentPattern);
            
            // Calculate next pattern index (cycle back to 0 if at end)
            const nextIndex = (currentIndex + 1) % patternOrder.length;
            const nextPattern = patternOrder[nextIndex];
            
            // Update the setting
            await game.settings.set(MODULE.ID, 'encounterToolbarDeploymentPattern', nextPattern);
            
            // Get the display name for the new pattern
            const newPatternName = this._getDeploymentPatternName(nextPattern);
            
            // Immediately update all open journal toolbars to reflect the change
            this._updateAllToolbarCRs();
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error cycling deployment pattern", error, true, false);
        }
    }

    static async _toggleDeploymentVisibility() {
        // Check if user has permission to change settings
        if (!game.user.isGM) {
            return;
        }

        try {
            // Get current visibility setting
            const currentHidden = game.settings.get(MODULE.ID, 'encounterToolbarDeploymentHidden');
            
            // Toggle the setting
            const newHidden = !currentHidden;
            
            // Update the setting
            await game.settings.set(MODULE.ID, 'encounterToolbarDeploymentHidden', newHidden);
            
            // Get the display name for the new visibility
            const newVisibilityName = this._getDeploymentVisibilityName(newHidden);
            
            // Immediately update all open journal toolbars to reflect the change
            this._updateAllToolbarCRs();
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error toggling deployment visibility", error, true, false);
        }
    }

    /**
     * @deprecated Use deployTokensSequential from api-tokens.js instead
     * This method is kept for backwards compatibility but is no longer used
     */
    static async _deploySequential(metadata, initialPosition) {
        // This method is deprecated - sequential deployment is now handled by the shared API
        // Keeping this stub to prevent breaking any external references
        postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: _deploySequential is deprecated, use deployTokensSequential from api-tokens.js", "", true, false);
        return [];
    }

    /**
     * Get target position from canvas
     * @deprecated Use getTargetPosition from api-tokens.js instead
     */
    static async _getTargetPosition(allowMultiple = false) {
        return await getTargetPosition(allowMultiple);
    }





    static async _createCombatWithTokens(deployedTokens, metadata) {
        // Check if user has permission to create combat
        if (!game.user.isGM) {
            return;
        }
        
        if (!deployedTokens || deployedTokens.length === 0) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: No tokens were deployed.", "", true, false);
            return;
        }

        try {
            // Check if there's already an active combat encounter
            let combat = game.combats.active;
            
            if (!combat) {
                // Create a new combat encounter if none exists
                combat = await Combat.create({
                    scene: canvas.scene.id,
                    name: metadata.title || "Encounter",
                    active: true
                });
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Created new combat encounter", "", true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Adding to existing combat encounter", "", true, false);
            }

            // Add deployed tokens to combat using their actual IDs
            for (const token of deployedTokens) {
                try {
                    await combat.createEmbeddedDocuments("Combatant", [{
                        tokenId: token.id,
                        actorId: token.actor.id,
                        sceneId: canvas.scene.id
                    }]);
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Added ${token.name} to combat`, "", true, false);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Failed to add ${token.name} to combat:`, error, true, false);
                }
            }

            const action = combat === game.combats.active ? "added to existing" : "created new";
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error creating combat", error, true, false);
        }
    }

    static async _createCombat(metadata) {
        // Check if user has permission to create combat
        if (!game.user.isGM) {
            return;
        }
        
        if (!metadata.monsters || metadata.monsters.length === 0) {
            return;
        }

        try {
            // First deploy the monsters to get tokens on the canvas
            const deployedTokens = await this._deployMonsters(metadata);
            
            if (!deployedTokens || deployedTokens.length === 0) {
                postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: No tokens were deployed, cancelling combat creation.`, "", true, false);
                
                return;
            }
            
            // Check if this was a partial deployment (user cancelled mid-deployment)
            const totalExpectedTokens = (metadata.monsters || []).length + (metadata.npcs || []).length;
            if (deployedTokens.length < totalExpectedTokens) {
                const createCombatWithPartial = await new Promise((resolve) => {
                    new Dialog({
                        title: "Partial Deployment",
                        content: `<p>Only ${deployedTokens.length} out of ${totalExpectedTokens} tokens were deployed. Do you want to create combat with the deployed tokens?</p>`,
                        buttons: {
                            yes: {
                                icon: '<i class="fas fa-check"></i>',
                                label: "Yes, Create Combat",
                                callback: () => resolve(true)
                            },
                            no: {
                                icon: '<i class="fas fa-times"></i>',
                                label: "No, Cancel",
                                callback: () => resolve(false)
                            }
                        },
                        default: "no"
                    }).render(true);
                });
                
                if (!createCombatWithPartial) {
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Combat creation cancelled by user.`, "", true, false);
                    return;
                }
            }
            
            // Create a new combat encounter
            const combat = await Combat.create({
                scene: canvas.scene.id,
                name: metadata.title || "Encounter",
                active: true
            });

            // Add deployed tokens to combat using their actual IDs
            for (const token of deployedTokens) {
                try {
                    await combat.createEmbeddedDocuments("Combatant", [{
                        tokenId: token.id,
                        actorId: token.actor.id,
                        sceneId: canvas.scene.id
                    }]);
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Added ${token.name} to combat`, "", true, false);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Encounter Toolbar: Failed to add ${token.name} to combat:`, error, true, false);
                }
            }

        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error creating combat", error, true, false);
        }
    }

    // CR Calculation Functions
    static getPartyCR() {
        try {
            // Get all player tokens on the current scene
            const playerTokens = canvas.tokens.placeables.filter(token => 
                token.actor && token.actor.type === 'character' && token.actor.hasPlayerOwner
            );

            if (playerTokens.length === 0) {
                return "0";
            }

            // Calculate weighted party level using tiered formula
            let totalLevel1to4 = 0;
            let totalLevel5to10 = 0;
            let totalLevel11to16 = 0;
            let totalLevel17to20 = 0;

            for (const token of playerTokens) {
                const level = token.actor.system.details.level || 1;
                
                // Categorize by level brackets
                if (level >= 1 && level <= 4) {
                    totalLevel1to4 += level;
                } else if (level >= 5 && level <= 10) {
                    totalLevel5to10 += level;
                } else if (level >= 11 && level <= 16) {
                    totalLevel11to16 += level;
                } else if (level >= 17 && level <= 20) {
                    totalLevel17to20 += level;
                }
            }

            // Apply weighted formula
            const partyLevel = 
                (totalLevel1to4 / 4) +
                (totalLevel5to10 / 2) +
                (totalLevel11to16 * 0.75) +
                totalLevel17to20;

            // Convert party level to approximate CR (party level is already weighted)
            const partyCR = Math.max(1, Math.floor(partyLevel));
            
            return this.formatCR(partyCR);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error calculating party CR", error, true, false);
            return "0";
        }
    }

    static getMonsterCR(metadata) {
        try {
            // Get all monster tokens on the current scene (not player tokens)
            const monsterTokens = canvas.tokens.placeables.filter(token => 
                token.actor && token.actor.type === 'npc' && !token.actor.hasPlayerOwner
            );

            if (monsterTokens.length === 0) {
                return "0";
            }

            let totalCR = 0;
            let monsterCount = 0;

            for (const token of monsterTokens) {
                try {
                    const actor = token.actor;
                    if (actor && actor.system) {
                        // Get the actual CR from the monster's data
                        const crValue = parseFloat(actor.system.details.cr);
                        if (!isNaN(crValue)) {
                            totalCR += crValue;
                            monsterCount++;
                            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Monster CR", `${actor.name}: ${crValue}`, true, false);
                        } else {
                            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Warning", `No CR found for ${actor.name}`, true, false);
                        }
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error", `Error calculating CR for monster ${token.name}: ${error}`, true, false);
                }
            }

            if (monsterCount === 0) {
                return "0";
            }

            // Return total CR for multiple monsters (not average)
            return this.formatCR(totalCR);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Encounter Toolbar: Error", `Error calculating monster CR: ${error}`, true, false);
            return "0";
        }
    }

    static calculateNPCCR(actor) {
        // Get actor data
        const actorData = actor.system;
        
        // Calculate Defensive CR
        const hp = foundry.utils.getProperty(actorData, "attributes.hp.value") || 0;
        const ac = foundry.utils.getProperty(actorData, "attributes.ac.value") || 10;
        let defensiveCR = this.calculateDefensiveCR(hp, ac);
        
        // Calculate Offensive CR
        const spellDC = foundry.utils.getProperty(actorData, "attributes.spell.dc") || foundry.utils.getProperty(actorData, "attributes.spelldc") || 0;
        const spells = foundry.utils.getProperty(actorData, "spells") || {};
        const spellLevel = Math.max(...Object.values(spells).map(s => parseInt(foundry.utils.getProperty(s, "value") || 0)));
        let offensiveCR = this.calculateOffensiveCR(spellDC, spellLevel);
        
        // Calculate final CR
        const finalCR = (defensiveCR + offensiveCR) / 2;
        
        // Format CR
        return this.formatCR(finalCR);
    }

    static calculateDefensiveCR(hp, ac) {
        // Simplified CR calculation based on HP and AC
        let cr = 0;
        
        // HP-based CR (very simplified)
        if (hp <= 35) cr = 1/8;
        else if (hp <= 49) cr = 1/4;
        else if (hp <= 70) cr = 1/2;
        else if (hp <= 85) cr = 1;
        else if (hp <= 100) cr = 2;
        
        // Adjust for AC
        if (ac >= 15) cr += 1;
        
        return cr;
    }

    static calculateOffensiveCR(spellDC, spellLevel) {
        // Simplified CR calculation based on spell DC and level
        let cr = 0;
        
        // Base CR on spell level
        cr = spellLevel;
        
        // Adjust for spell DC
        if (spellDC >= 15) cr += 1;
        
        return cr;
    }

    static parseCR(crString) {
        // Parse CR string to numeric value
        if (crString === "0") return 0;
        if (crString === "1/8") return 0.125;
        if (crString === "1/4") return 0.25;
        if (crString === "1/2") return 0.5;
        return parseFloat(crString) || 0;
    }

    static formatCR(cr) {
        // Handle special cases
        if (cr === 0) return "0";
        if (cr > 0 && cr < 0.125) return "1/8";  // Round up very low CRs
        
        // Format standard CR values
        const crValues = {
            0.125: "1/8",
            0.25: "1/4",
            0.5: "1/2"
        };
        
        return crValues[cr] || Math.round(cr).toString();
    }
}
