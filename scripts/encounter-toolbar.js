// ================================================================== 
// ===== ENCOUNTER TOOLBAR ==========================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { getCachedTemplate } from './blacksmith.js';
import { postConsoleAndNotification } from './global.js';

export class EncounterToolbar {
    
    // Debounce timer for CR updates
    static _crUpdateTimer = null;
    
    static init() {
        // Listen for journal sheet rendering (normal view only)
        Hooks.on('renderJournalSheet', this._onRenderJournalSheet.bind(this));
        
        // Also listen for when journal content is updated (saves)
        Hooks.on('updateJournalEntryPage', this._onUpdateJournalEntryPage.bind(this));
        
        // Listen for token changes to update CR values in real-time
        this._setupTokenChangeHooks();
        
        // Listen for setting changes
        Hooks.on('settingChange', this._onSettingChange.bind(this));
    }

    // Setup or remove token change hooks based on setting
    static _setupTokenChangeHooks() {
        // Remove existing hooks first
        Hooks.off('createToken', this._onTokenChange);
        Hooks.off('updateToken', this._onTokenChange);
        Hooks.off('deleteToken', this._onTokenChange);
        
        // Add hooks if setting is enabled
        if (game.settings.get(MODULE_ID, 'enableEncounterToolbarRealTimeUpdates')) {
            Hooks.on('createToken', this._onTokenChange.bind(this));
            Hooks.on('updateToken', this._onTokenChange.bind(this));
            Hooks.on('deleteToken', this._onTokenChange.bind(this));
        }
    }

    // Handle setting changes
    static _onSettingChange(moduleId, key, value) {
        if (moduleId === MODULE_ID) {
            if (key === 'enableEncounterToolbarRealTimeUpdates') {
                this._setupTokenChangeHooks();
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Real-time updates", value ? "enabled" : "disabled", false, true, false);
            } else if (key === 'encounterToolbarDeploymentPattern') {
                // Update all open journal toolbars when deployment pattern changes
                this._updateAllToolbarCRs();
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment pattern setting changed", value, false, true, false);
            } else if (key === 'encounterToolbarDeploymentHidden') {
                // Update all open journal toolbars when deployment visibility changes
                this._updateAllToolbarCRs();
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment visibility setting changed", value, false, true, false);
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
            // Find all open journal sheets
            const journalSheets = Object.values(ui.windows).filter(w => w instanceof JournalSheet);
            
            for (const journalSheet of journalSheets) {
                // Check if this journal has encounter toolbars
                const toolbars = journalSheet.element.find('.encounter-toolbar');
                if (toolbars.length > 0) {
                    this._updateToolbarCRs(journalSheet.element);
                }
            }
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error updating CR values", error, false, false, true);
        }
    }

    // Update CR values for a specific journal toolbar
    static _updateToolbarCRs(html) {
        try {
            // Find all toolbars in this journal
            const toolbars = html.find('.encounter-toolbar');
            
            toolbars.each((index, toolbarElement) => {
                const $toolbar = $(toolbarElement);
                const pageId = $toolbar.data('page-id');
                
                if (pageId) {
                    // Recalculate CR values
                    const partyCR = this.getPartyCR();
                    const monsterCR = this.getMonsterCR({ monsters: [] }); // Empty metadata for canvas-only calculation
                    
                    // Update the CR badges with icons intact
                    $toolbar.find('.encounter-party-cr').html(`<i class="fas fa-helmet-battle"></i>${partyCR}`);
                    $toolbar.find('.encounter-monster-cr').html(`<i class="fas fa-dragon"></i>${monsterCR}`);
                    
                    // Update the deployment pattern badge
                    const currentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
                    const patternName = this._getDeploymentPatternName(currentPattern);
                    $toolbar.find('.deploy-type').html(`<i class="fas fa-grid-2-plus"></i>${patternName}`);
                    
                    // Update the deployment visibility badge
                    const currentHidden = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden');
                    const visibilityName = this._getDeploymentVisibilityName(currentHidden);
                    $toolbar.find('.deploy-visibility').html(`<i class="fas fa-eye"></i>${visibilityName}`);
                    
                    // Update the difficulty badge based on current CR values
                    const difficultyData = this._calculateEncounterDifficulty(partyCR, monsterCR);
                    $toolbar.find('.difficulty-badge').html(`<i class="fa-solid fa-swords"></i>${difficultyData.difficulty}`);
                    $toolbar.find('.difficulty-badge').removeClass().addClass(`difficulty-badge ${difficultyData.difficultyClass}`);
                    
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Updated CR values", { pageId, partyCR, monsterCR }, false, true, false);
                }
            });
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error updating toolbar CRs", error, false, false, true);
        }
    }

    // Hook for journal sheet rendering (normal view only)
    static async _onRenderJournalSheet(app, html, data) {
        // Use unified method with immediate retry
        this._processJournalSheet(html, true);
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

    // Unified method to process journal sheets
    static _processJournalSheet(html, shouldRetry = false) {
        // Only create toolbar in normal view, not edit view
        if (!this._isEditMode(html)) {
            // Try immediately first
            this._updateToolbarContent(html).catch(error => {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error in initial update", error, false, false, true);
            });
            
            // Retry after delay if requested (for renderJournalSheet)
            if (shouldRetry) {
                // Multiple retries with increasing delays
                const retryDelays = [500, 1000, 2000];
                retryDelays.forEach((delay, index) => {
                    setTimeout(() => {
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Retrying metadata search after delay", `Attempt ${index + 2}`, false, true, false);
                        this._updateToolbarContent(html).catch(error => {
                            postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Error in retry ${index + 2}`, error, false, false, true);
                        });
                    }, delay);
                });
            }
        }
    }

    // Helper method to check if we're in edit mode
    static _isEditMode(html) {
        // Check if the specific journal sheet has editor-container (is in edit mode)
        return html.find('.editor-container').length > 0;
    }

    // Helper method to validate UUIDs
    static async _validateUUID(uuid) {
        try {
            // Check if it's a valid UUID format for actors
            // Accept both compendium references (Compendium.module.collection.Actor.id) and world actors (Actor.id)
            if (!uuid.includes('Compendium.') && !uuid.startsWith('Actor.')) {
                postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Invalid UUID format`, uuid, false, false, false);
                return null;
            }
            
            // Try to load the actor to validate it exists
            const actor = await fromUuid(uuid);
            if (!actor) {
                postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Could not load actor with UUID`, uuid, false, false, false);
                return null;
            }
            
            return uuid;
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Error validating UUID`, { uuid, error }, false, false, true);
            return null;
        }
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
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Actor ${actor.name} classified as monster (monster compendium)`, "", false, true, false);
                    return true;
                }
                
                // Check disposition (hostile = monster, friendly/neutral = NPC)
                if (actor.prototypeToken && actor.prototypeToken.disposition !== undefined) {
                    const isMonster = actor.prototypeToken.disposition <= -1; // Hostile
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Actor ${actor.name} classified as ${isMonster ? 'monster' : 'npc'} (disposition: ${actor.prototypeToken.disposition})`, "", false, true, false);
                    return isMonster;
                }
                
                // Default: assume it's a monster if we can't determine
                postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Actor ${actor.name} classified as monster (default)`, "", false, true, false);
                return true;
            }
            postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Actor ${uuid} classified as monster (no actor found)`, "", false, true, false);
            return true; // Default to monster if we can't determine
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Error checking actor type for ${uuid}`, error, false, false, true);
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
                    
                    // Get portrait - try multiple sources
                    let portrait = null;
                    if (actor.img) {
                        portrait = actor.img;
                    } else if (actor.prototypeToken?.texture?.src) {
                        portrait = actor.prototypeToken.texture.src;
                    }
                    
                    monsterDetails.push({ uuid, name, cr, portrait });
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Monster details", { name, cr, portrait }, false, true, false);
                }
            } catch (error) {
                postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Error getting details for ${uuid}`, error, false, false, true);
            }
        }
        
        return monsterDetails;
    }

    // Enhanced method to scan journal content for encounter data
    static async _scanJournalContent(html, pageId) {
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Starting content scan for page", pageId, false, true, false);
        
        // Get the journal page content - try different selectors
        let pageContent = html.find(`article[data-page-id="${pageId}"] section.journal-page-content`);
        
        if (pageContent.length === 0) {
            // If that doesn't work, try finding the article first, then the section
            const article = html.find(`article[data-page-id="${pageId}"]`);
            if (article.length > 0) {
                pageContent = article.find('section.journal-page-content');
            }
        }
        
        if (pageContent.length === 0) {
            // Try finding any section
            pageContent = html.find('section.journal-page-content');
        }
        
        if (pageContent.length === 0) {
            // Last resort: search the entire document
            pageContent = $(document).find(`article[data-page-id="${pageId}"] section.journal-page-content`);
        }
        
        if (pageContent.length === 0) {
            // Try a broader search for any content
            pageContent = $(document).find('.journal-page-content');
        }
        
        if (pageContent.length === 0) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: No page content found", "", false, true, false);
            return null;
        }

        // Check if content scanning is enabled
        if (!game.settings.get(MODULE_ID, 'enableEncounterContentScanning')) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Content scanning disabled", "", false, true, false);
            return null;
        }

        // Extract both text and HTML content
        const textContent = pageContent.text() || '';
        const htmlContent = pageContent.html() || '';
        
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Text content length", textContent.length, false, true, false);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: HTML content length", htmlContent.length, false, true, false);

        // Try JSON format first (for structured data)
        let encounterData = this._parseJSONEncounter(htmlContent);
        if (encounterData) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found JSON encounter data", "", false, true, false);
            return encounterData;
        }

        // Use the new pattern-based detection
        encounterData = await this._parsePatternBasedEncounter(textContent, htmlContent);
        if (encounterData) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found pattern-based encounter data", "", false, true, false);
            return encounterData;
        }

        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: No encounter data found", "", false, true, false);
        return null;
    }

    // Pattern-based encounter detection
    static async _parsePatternBasedEncounter(textContent, htmlContent) {
        const encounterData = {
            monsters: [],
            npcs: [],
            difficulty: null
        };

        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Scanning text content for patterns", { textLength: textContent.length, htmlLength: htmlContent.length }, false, true, false);

        // 1. Find all data-uuid attributes in the content (Foundry renders links as <a> tags)
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Looking for data-uuid attributes in HTML content", "", false, true, false);
        const uuidMatches = htmlContent.match(/data-uuid="([^"]+)"/g);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found UUID matches", uuidMatches?.length || 0, false, true, false);

        if (uuidMatches) {
            for (const match of uuidMatches) {
                const uuidMatch = match.match(/data-uuid="([^"]+)"/);
                if (uuidMatch) {
                    const uuid = uuidMatch[1];
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Processing UUID", uuid, false, true, false);
                    
                    // 2. Check if this UUID contains "Actor" (case-insensitive)
                    if (uuid.toLowerCase().includes('actor')) {
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found Actor UUID", uuid, false, true, false);
                        
                        // 3. Look for quantity indicators near this UUID
                        let quantity = 1;
                        
                        // Find the context around this UUID (within 100 characters)
                        const uuidIndex = htmlContent.indexOf(match);
                        const contextStart = Math.max(0, uuidIndex - 100);
                        const contextEnd = Math.min(htmlContent.length, uuidIndex + match.length + 100);
                        const context = htmlContent.substring(contextStart, contextEnd);
                        
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Context around UUID", context.substring(0, 100), false, true, false);

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
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found quantity", quantity, false, true, false);
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
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: UUID is not an Actor type", uuid, false, true, false);
                    }
                }
            }
        }

        // 4. Look for difficulty patterns (case-insensitive)
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Looking for difficulty patterns", "", false, true, false);
        const difficultyPatterns = [
            /difficulty\s*:\s*(easy|medium|hard|deadly)/i,
            /difficulty\s*=\s*(easy|medium|hard|deadly)/i,
            /(easy|medium|hard|deadly)\s*difficulty/i
        ];

        for (const pattern of difficultyPatterns) {
            const difficultyMatch = textContent.match(pattern);
            if (difficultyMatch) {
                encounterData.difficulty = difficultyMatch[1].toLowerCase();
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found difficulty", encounterData.difficulty, false, true, false);
                break;
            }
        }

        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Final encounter data", encounterData, false, true, false);
        return (encounterData.monsters.length > 0 || encounterData.npcs.length > 0 || encounterData.difficulty) ? encounterData : null;
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
        if (!game.settings.get(MODULE_ID, 'enableEncounterToolbar')) {
            return;
        }

        // Check if we're in a journal sheet context
        if (!html || !html.length) {
            return;
        }

        // Get the page ID to scope the toolbar
        const journalPage = html.find('article.journal-entry-page');
        const pageId = journalPage.data('page-id');
        
        if (!pageId) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: No page ID found", "", false, true, false);
            return; // Can't create toolbar without page ID
        }
        
        // Check if toolbar already exists for this specific page, if not create it
        const toolbarSelector = `.encounter-toolbar[data-page-id="${pageId}"]`;
        let toolbar = html.find(toolbarSelector);
        
        if (toolbar.length === 0) {
            // Create the toolbar container
            const journalHeader = html.find('.journal-header');
            const journalEntryPages = html.find('.journal-entry-pages');
            
            if (journalHeader.length && journalEntryPages.length) {
                const toolbarContainer = $(`<div class="encounter-toolbar" data-page-id="${pageId}"></div>`);
                journalHeader.after(toolbarContainer);
                toolbar = toolbarContainer;
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Created toolbar container", `Page ID: ${pageId}`, false, true, false);
            } else {
                return; // Can't create toolbar
            }
        }

        // Try content scanning for encounter data (check all journals, not just encounter type)
        let encounterData = await this._scanJournalContent(html, pageId);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Content scan result", encounterData, false, true, false);
        
        if (encounterData) {
            // We have encounter data - use the full toolbar
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found encounter data, updating toolbar", "", false, true, false);
            
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
                const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
                getCachedTemplate(templatePath).then(template => {
                    // Prepare the data for the template
                    const templateData = {
                        journalId: html.closest('.journal-sheet').data('document-id') || 'unknown',
                        hasEncounterData: true,
                        hasMonsters,
                        hasNpcs,
                        monsters: monsterDetails,
                        npcs: npcDetails,
                        difficulty: difficultyData.difficulty,
                        difficultyClass: difficultyData.difficultyClass,
                        partyCR: partyCR,
                        monsterCR: monsterCR,
                        autoCreateCombat: game.settings.get(MODULE_ID, 'autoCreateCombatForEncounters'),
                        deploymentPattern: this._getDeploymentPatternName(game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern')),
                        deploymentVisibility: this._getDeploymentVisibilityName(game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden')),
                        isGM: game.user.isGM
                    };
                    
                    // Render the toolbar
                    const renderedHtml = template(templateData);
                    toolbar.html(renderedHtml);
                    
                    // Add event listeners to the buttons
                    this._addEventListeners(toolbar, encounterData);
                    
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Updated with encounter data", "", false, true, false);
                });
                
                return; // Exit early since we're handling this asynchronously
                
            } catch (error) {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error processing encounter data", error, false, true, false);
                // Fall through to create "no encounter" toolbar
            }
        }
        
        // If we don't have encounter data or there was an error, create a "no encounter" toolbar using the template
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: No encounter data found, showing placeholder", "", false, true, false);
        
        // Calculate CR values even when there's no encounter data
        const partyCR = this.getPartyCR();
        const monsterCR = this.getMonsterCR({ monsters: [] }); // Pass empty metadata for canvas-only calculation
        
        // Calculate difficulty based on canvas tokens
        const difficultyData = this._calculateEncounterDifficulty(partyCR, monsterCR);
        
        // Get the template
        const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
        getCachedTemplate(templatePath).then(template => {
            // Prepare the data for the template (no encounter case)
            const templateData = {
                journalId: html.closest('.journal-sheet').data('document-id') || 'unknown',
                hasEncounterData: false,
                hasMonsters: false,
                hasNpcs: false,
                difficulty: difficultyData.difficulty,
                difficultyClass: difficultyData.difficultyClass,
                partyCR: partyCR,
                monsterCR: monsterCR,
                deploymentPattern: this._getDeploymentPatternName(game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern')),
                deploymentVisibility: this._getDeploymentVisibilityName(game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden')),
                isGM: game.user.isGM
            };
            
            // Render the toolbar
            const renderedHtml = template(templateData);
            toolbar.html(renderedHtml);
            
            // Add event listeners even when there's no encounter data (for the Reveal button)
            this._addEventListeners(toolbar, { monsters: [], npcs: [] });
            
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Updated with no encounter data", "", false, true, false);
        });
    }

    static _addEventListeners(toolbar, metadata) {
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Setting up event listeners with metadata", metadata, false, true, false);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Metadata monsters array", metadata.monsters || [], false, true, false);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Metadata npcs array", metadata.npcs || [], false, true, false);
        
        // Deploy monsters button - scope to this toolbar only
        toolbar.find('.deploy-monsters').off('click').on('click', async (event) => {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deploy monsters button clicked!", "", false, true, false);
            event.preventDefault();
            event.stopPropagation();
            EncounterToolbar._deployMonsters(metadata);
        });
        
        // Create combat button - scope to this toolbar only
        toolbar.find('.create-combat').off('click').on('click', async (event) => {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Create combat button clicked!", "", false, true, false);
            event.preventDefault();
            event.stopPropagation();
            
            // Deploy monsters first, then create combat
            const deployedTokens = await EncounterToolbar._deployMonsters(metadata);
            if (deployedTokens && deployedTokens.length > 0) {
                await EncounterToolbar._createCombatWithTokens(deployedTokens, metadata);
            }
        });

        // Toggle visibility button - scope to this toolbar only
        toolbar.find('.toggle-visibility').off('click').on('click', async (event) => {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Toggle visibility button clicked!", "", false, true, false);
            event.preventDefault();
            event.stopPropagation();
            
            await EncounterToolbar._toggleTokenVisibility();
        });

        // Deployment type badge - cycle through deployment patterns
        toolbar.find('.deploy-type').off('click').on('click', async (event) => {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment type badge clicked!", "", false, true, false);
            event.preventDefault();
            event.stopPropagation();
            
            await EncounterToolbar._cycleDeploymentPattern();
        });

        // Deployment visibility badge - toggle visibility setting
        toolbar.find('.deploy-visibility').off('click').on('click', async (event) => {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment visibility badge clicked!", "", false, true, false);
            event.preventDefault();
            event.stopPropagation();
            
            await EncounterToolbar._toggleDeploymentVisibility();
        });

        // Monster icon clicks - deploy individual monsters
        toolbar.find('.encounter-icon-monster').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const $monsterIcon = $(event.currentTarget);
            const monsterUUID = $monsterIcon.data('uuid');
            
            if (monsterUUID) {
                const isCtrlHeld = event.ctrlKey;
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Monster icon clicked!", `UUID: ${monsterUUID}, CTRL: ${isCtrlHeld}`, false, true, false);
                
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

        // NPC icon clicks - deploy individual NPCs
        toolbar.find('.encounter-icon-npc').off('click').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const $npcIcon = $(event.currentTarget);
            const npcUUID = $npcIcon.data('uuid');
            
            if (npcUUID) {
                const isCtrlHeld = event.ctrlKey;
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: NPC icon clicked!", `UUID: ${npcUUID}, CTRL: ${isCtrlHeld}`, false, true, false);
                
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
    }

    static async _deployMonsters(metadata) {
        // Check if user has permission to create tokens
        if (!game.user.isGM) {
            return [];
        }
        
        // Combine monsters and NPCs for deployment
        const allTokens = [...(metadata.monsters || []), ...(metadata.npcs || [])];
        
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment - monsters array", metadata.monsters || [], false, true, false);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment - npcs array", metadata.npcs || [], false, true, false);
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment - combined allTokens", allTokens, false, true, false);
        
        if (allTokens.length === 0) {
            return [];
        }

        // Get the deployment pattern setting
        const deploymentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Deployment pattern", deploymentPattern, false, true, false);

        // Create tooltip for non-sequential deployments
        let tooltip = null;
        let mouseMoveHandler = null;
        const deployedTokens = [];

        try {
            
            if (deploymentPattern !== "sequential") {
                tooltip = document.createElement('div');
                tooltip.className = 'encounter-tooltip';
                document.body.appendChild(tooltip);
                
                mouseMoveHandler = (event) => {
                    tooltip.style.left = (event.data.global.x + 15) + 'px';
                    tooltip.style.top = (event.data.global.y - 40) + 'px';
                };
                
                // Show initial tooltip
                const patternName = this._getDeploymentPatternName(deploymentPattern);
                
                // Check if this is a single token deployment
                if (allTokens.length === 1) {
                    // For single token, get the details for the tooltip
                    const tokenDetails = await this._getMonsterDetails(allTokens);
                    if (tokenDetails.length > 0) {
                        const token = tokenDetails[0];
                        tooltip.innerHTML = `
                            <div class="monster-name">Deploy ${token.name} (CR ${token.cr})</div>
                            <div class="progress">${patternName} - Click to place</div>
                        `;
                    } else {
                        tooltip.innerHTML = `
                            <div class="monster-name">Deploying Token</div>
                            <div class="progress">${patternName} - Click to place</div>
                        `;
                    }
                } else {
                    // For multiple tokens, show the original tooltip
                    tooltip.innerHTML = `
                        <div class="monster-name">Deploying Tokens</div>
                        <div class="progress">${patternName} - Click to place ${allTokens.length} tokens</div>
                    `;
                }
                tooltip.classList.add('show');
                canvas.stage.on('mousemove', mouseMoveHandler);
            }

            // Handle sequential deployment
            if (deploymentPattern === "sequential") {
                return await this._deploySequential(metadata, null);
            } else {
                // Check if this is a single token deployment (for CTRL functionality)
                const isSingleToken = allTokens.length === 1;
                
                // Get the target position (where the user clicked)
                const positionResult = await this._getTargetPosition(isSingleToken);
                
                if (!positionResult) {
                    // User cancelled or no position obtained
                    if (isSingleToken) {
                        postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Token deployment cancelled.`, '', false, true, false);
                    } else {
                        postConsoleAndNotification(`Please click on the canvas to place tokens.`, '', false, false, true);
                    }
                    return [];
                }
                
                const position = positionResult.position;
                const isAltHeld = positionResult.isAltHeld;
                
                // First, count valid tokens to get the total
                let validTokenCount = 0;
                for (let i = 0; i < allTokens.length; i++) {
                    const tokenId = allTokens[i];
                    const validatedId = await this._validateUUID(tokenId);
                    if (validatedId) {
                        const actor = await fromUuid(validatedId);
                        if (actor) {
                            validTokenCount++;
                        }
                    }
                }
                
                // Deploy each token at this position
                let validTokenIndex = 0; // Counter for valid tokens only
                for (let i = 0; i < allTokens.length; i++) {
                    const tokenId = allTokens[i];
                    
                    try {
                        // Validate the UUID
                        const validatedId = await this._validateUUID(tokenId);
                        if (!validatedId) {
                            postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Could not validate UUID, skipping`, tokenId, false, false, false);
                            continue;
                        }
                        
                        const actor = await fromUuid(validatedId);
                        
                        if (actor) {
                            // First, create a world copy of the actor if it's from a compendium
                            let worldActor = actor;
                            if (actor.pack) {
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Creating world copy of compendium actor", "", false, true, false);
                                const actorData = actor.toObject();
                                
                                // Get or create the encounter folder
                                const folderName = game.settings.get(MODULE_ID, 'encounterFolder');
                                let encounterFolder = null;
                                
                                // Only create/find folder if folderName is not empty
                                if (folderName && folderName.trim() !== '') {
                                    encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                                    
                                    if (!encounterFolder) {
                                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Creating encounter folder", folderName, false, true, false);
                                        encounterFolder = await Folder.create({
                                            name: folderName,
                                            type: 'Actor',
                                            color: '#ff0000'
                                        });
                                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Encounter folder created", encounterFolder.id, false, true, false);
                                    }
                                }
                                
                                // Create the world actor
                                const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                                worldActor = await Actor.create(actorData, createOptions);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: World actor created", worldActor.id, false, true, false);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Actor folder", worldActor.folder, false, true, false);
                                
                                // Ensure folder is assigned (sometimes it doesn't get set during creation)
                                if (encounterFolder && !worldActor.folder) {
                                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Folder not assigned during creation, updating actor...", "", false, true, false);
                                    await worldActor.update({ folder: encounterFolder.id });
                                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Actor folder after update", worldActor.folder, false, true, false);
                                }
                                
                                // Update the prototype token to honor GM defaults
                                const defaultTokenData = foundry.utils.deepClone(game.settings.get("core", "defaultToken"));
                                const prototypeTokenData = foundry.utils.mergeObject(defaultTokenData, worldActor.prototypeToken.toObject(), { overwrite: false });
                                await worldActor.update({ prototypeToken: prototypeTokenData });
                            }
                            
                            // Get the deployment pattern setting for positioning
                            const deploymentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
                            const deploymentHidden = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden');
                            
                            // Calculate position based on pattern
                            let tokenPosition;
                            if (deploymentPattern === "circle") {
                                tokenPosition = this._calculateCirclePosition(position, validTokenIndex, validTokenCount);
                            } else if (deploymentPattern === "scatter") {
                                tokenPosition = this._calculateScatterPosition(position, validTokenIndex, validTokenCount);
                            } else if (deploymentPattern === "grid") {
                                tokenPosition = this._calculateSquarePosition(position, validTokenIndex, validTokenCount);
                            } else {
                                // Default to line formation - place in grid square centers
                                const gridSize = canvas.scene.grid.size;
                                // The position is already the center of a grid square, so we just offset by grid size
                                tokenPosition = {
                                    x: position.x + (validTokenIndex * gridSize),
                                    y: position.y
                                };
                            }
                            
                            // Create token data
                            const tokenData = foundry.utils.mergeObject(
                                foundry.utils.deepClone(game.settings.get("core", "defaultToken")),
                                worldActor.prototypeToken.toObject(),
                                { overwrite: false }
                            );
                            
                            // Set token properties
                            tokenData.x = tokenPosition.x;
                            tokenData.y = tokenPosition.y;
                            tokenData.actorId = worldActor.id;
                            // Honor the original actor's linked setting
                            tokenData.actorLink = worldActor.prototypeToken.actorLink;
                            // Set hidden based on ALT key or deployment setting
                            tokenData.hidden = isAltHeld ? true : deploymentHidden;
                            
                            // Honor lock rotation setting
                            const lockRotation = game.settings.get("core", "defaultToken").lockRotation;
                            if (lockRotation !== undefined) {
                                tokenData.lockRotation = lockRotation;
                            }
                            
                            // Create the token on the canvas
                            const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Token creation result", createdTokens, false, true, false);
                            
                            // Verify the token was created and is visible
                            if (createdTokens && createdTokens.length > 0) {
                                const token = createdTokens[0];
                                deployedTokens.push(token);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Created token", token, false, true, false);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Token position", {x: token.x, y: token.y}, false, true, false);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Token visible", token.visible, false, true, false);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Token actor", token.actor, false, true, false);
                                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Token actorId", token.actorId, false, true, false);
                                
                                // Increment the valid token index for pattern positioning
                                validTokenIndex++;
                            }
                        }
                    } catch (error) {
                        postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Failed to deploy monster ${monsterId}`, error, false, false, true);
                    }
                }
                
                // Update tooltip to show completion
                if (tooltip) {
                    const patternName = this._getDeploymentPatternName(deploymentPattern);
                    tooltip.innerHTML = `
                        <div class="monster-name">Deployment Complete</div>
                        <div class="progress">${patternName} - Deployed ${metadata.monsters.length} monsters</div>
                    `;
                    
                    // Remove tooltip after a short delay
                    setTimeout(() => {
                        if (tooltip && tooltip.parentNode) {
                            tooltip.remove();
                        }
                        if (mouseMoveHandler) {
                            canvas.stage.off('mousemove', mouseMoveHandler);
                        }
                    }, 2000);
                }
                
                return deployedTokens;
            }
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error deploying monsters", error, false, false, true);
            return [];
        } finally {
            // Clean up tooltip and handlers for non-sequential deployments
            if (deploymentPattern !== "sequential" && tooltip) {
                if (tooltip.parentNode) {
                    tooltip.remove();
                }
                if (mouseMoveHandler) {
                    canvas.stage.off('mousemove', mouseMoveHandler);
                }
            }
        }
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
                postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Could not validate UUID`, tokenUUID, false, false, false);
                return [];
            }
            
            const actor = await fromUuid(validatedId);
            
            if (!actor) {
                return [];
            }

            // Get the deployment pattern setting for positioning
            const deploymentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
            const deploymentHidden = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden');
            
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
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Creating world copy of compendium actor", "", false, true, false);
                const actorData = actor.toObject();
                
                // Get or create the encounter folder
                const folderName = game.settings.get(MODULE_ID, 'encounterFolder');
                let encounterFolder = null;
                
                if (folderName && folderName.trim() !== '') {
                    encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                    
                    if (!encounterFolder) {
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Creating encounter folder", folderName, false, true, false);
                        encounterFolder = await Folder.create({
                            name: folderName,
                            type: 'Actor',
                            color: '#ff0000'
                        });
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Encounter folder created", encounterFolder.id, false, true, false);
                    }
                }
                
                // Create the world actor
                const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                worldActor = await Actor.create(actorData, createOptions);
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: World actor created", worldActor.id, false, true, false);
                
                // Ensure folder is assigned
                if (encounterFolder && !worldActor.folder) {
                    await worldActor.update({ folder: encounterFolder.id });
                }
                
                // Update the prototype token to honor GM defaults
                const defaultTokenData = foundry.utils.deepClone(game.settings.get("core", "defaultToken"));
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
                    foundry.utils.deepClone(game.settings.get("core", "defaultToken")),
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
                const lockRotation = game.settings.get("core", "defaultToken").lockRotation;
                if (lockRotation !== undefined) {
                    tokenData.lockRotation = lockRotation;
                }
                
                // Create the token on the canvas
                const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Single monster token creation result", createdTokens, false, true, false);
                
                // Verify the token was created
                if (createdTokens && createdTokens.length > 0) {
                    const token = createdTokens[0];
                    deployedTokens.push(token);
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Created single monster token", token, false, true, false);
                    
                    // Update tooltip to show success and continue instruction
                    tooltip.innerHTML = `
                        <div class="monster-name">${actor.name} Deployed</div>
                        <div class="progress">Hold CTRL and click to place another, release CTRL to finish</div>
                    `;
                }
            }
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error deploying single monster multiple times", error, false, true, true);
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
                postConsoleAndNotification("No tokens found on the canvas.", "", false, false, true);
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
                postConsoleAndNotification("No hidden tokens found on the canvas.", "", false, false, true);
                return;
            }

            // Update each token to make it visible
            for (const token of hiddenMonsterTokens) {
                await token.document.update({ hidden: false });
            }
            
            // Show notification with results
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Made monster tokens visible", `${hiddenMonsterTokens.length} tokens`, false, true, true);
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error making monster tokens visible", error, false, false, true);
        }
    }

    static _calculateCirclePosition(centerPosition, index, totalTokens) {
        if (index === 0) {
            return { x: centerPosition.x, y: centerPosition.y };
        }
        const radius = 100;
        const angleStep = (2 * Math.PI) / (totalTokens - 1);
        const angle = (index - 1) * angleStep;
        const x = centerPosition.x + (radius * Math.cos(angle));
        const y = centerPosition.y + (radius * Math.sin(angle));
        return { x, y };
    }

    static _calculateScatterPosition(centerPosition, index, totalTokens) {
        // Calculate scatter formation using grid-based random placement
        const gridSize = canvas.scene.grid.size;
        
        // If this is the first token (index 0), place it exactly at the clicked position
        if (index === 0) {
            postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Scatter position ${index} (first token at clicked position)`, centerPosition, false, true, false);
            return centerPosition;
        }
        
        // For subsequent tokens, use random scatter placement
        // Create a grid that is 1x the number of tokens in width and height
        const gridWidth = totalTokens;
        const gridHeight = totalTokens;
        
        // Calculate the total grid area
        const totalGridCells = gridWidth * gridHeight;
        
        postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Scatter grid setup`, `Tokens: ${totalTokens}, Grid: ${gridWidth}x${gridHeight}, Cells: ${totalGridCells}, GridSize: ${gridSize}px`, false, true, false);
        
        // Create an array of all possible positions
        const allPositions = [];
        for (let row = 0; row < gridHeight; row++) {
            for (let col = 0; col < gridWidth; col++) {
                allPositions.push({ row, col });
            }
        }
        
        // Shuffle the positions randomly
        for (let i = allPositions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
        }
        
        // Take the first 'totalTokens' positions
        const selectedPositions = allPositions.slice(0, totalTokens);
        
        // Get the position for this specific token (adjust index since first token is already placed)
        const tokenPosition = selectedPositions[index];
        
        postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Scatter position selection`, `Token ${index}: Grid cell (${tokenPosition.row}, ${tokenPosition.col})`, false, true, false);
        
        // Calculate the actual position using scene grid size - snap to top-left of grid squares
        // Calculate the base position in grid coordinates
        let x = centerPosition.x + (tokenPosition.col * gridSize);
        let y = centerPosition.y + (tokenPosition.row * gridSize);
        
        // Snap to top-left of the grid square
        x = Math.floor(x / gridSize) * gridSize;
        y = Math.floor(y / gridSize) * gridSize;
        
        postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Scatter position ${index} (grid ${gridWidth}x${gridHeight}, cell ${tokenPosition.row},${tokenPosition.col}, gridSize: ${gridSize}px)`, { x, y }, false, true, false);
        return { x, y };
    }

    static _calculateSquarePosition(centerPosition, index, totalTokens) {
        // Calculate square formation - grid-based square block
        const gridSize = canvas.scene.grid.size; // Use actual scene grid size
        const spacing = gridSize; // Use exact grid size for proper grid alignment
        
        // Calculate the dimensions of the square
        const sideLength = Math.ceil(Math.sqrt(totalTokens));
        
        // Calculate row and column for this token
        const row = Math.floor(index / sideLength);
        const col = index % sideLength;
        
        // Calculate position in grid square centers
        // Calculate the base position in grid coordinates
        let x = centerPosition.x + (col * spacing);
        let y = centerPosition.y + (row * spacing);
        
        // Snap to top-left of the grid square
        x = Math.floor(x / gridSize) * gridSize;
        y = Math.floor(y / gridSize) * gridSize;
        
        postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Square position ${index} (row ${row}, col ${col}, sideLength ${sideLength}, gridSize ${gridSize})`, { x, y }, false, true, false);
        return { x, y };
    }

    static _getDeploymentPatternName(pattern) {
        const patternNames = {
            "circle": "Circle",
            "line": "Linear", 
            "scatter": "Scattered",
            "grid": "Grid",
            "sequential": "Sequential"
        };
        return patternNames[pattern] || "Unknown Pattern";
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

    static async _cycleDeploymentPattern() {
        // Check if user has permission to change settings
        if (!game.user.isGM) {
            return;
        }

        try {
            // Get current deployment pattern
            const currentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
            
            // Define the order of patterns to cycle through
            const patternOrder = ["circle", "line", "scatter", "grid", "sequential"];
            
            // Find current pattern index
            const currentIndex = patternOrder.indexOf(currentPattern);
            
            // Calculate next pattern index (cycle back to 0 if at end)
            const nextIndex = (currentIndex + 1) % patternOrder.length;
            const nextPattern = patternOrder[nextIndex];
            
            // Update the setting
            await game.settings.set(MODULE_ID, 'encounterToolbarDeploymentPattern', nextPattern);
            
            // Get the display name for the new pattern
            const newPatternName = this._getDeploymentPatternName(nextPattern);
            
            // Update all open journal toolbars to reflect the change
            this._updateAllToolbarCRs();
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error cycling deployment pattern", error, false, false, true);
        }
    }

    static async _toggleDeploymentVisibility() {
        // Check if user has permission to change settings
        if (!game.user.isGM) {
            return;
        }

        try {
            // Get current visibility setting
            const currentHidden = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden');
            
            // Toggle the setting
            const newHidden = !currentHidden;
            
            // Update the setting
            await game.settings.set(MODULE_ID, 'encounterToolbarDeploymentHidden', newHidden);
            
            // Get the display name for the new visibility
            const newVisibilityName = this._getDeploymentVisibilityName(newHidden);
            
            // Update all open journal toolbars to reflect the change
            this._updateAllToolbarCRs();
            
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error toggling deployment visibility", error, false, false, true);
        }
    }

    static async _deploySequential(metadata, initialPosition) {
        // Set cursor to indicate placement mode
        canvas.stage.cursor = 'crosshair';
        
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'encounter-tooltip';
        document.body.appendChild(tooltip);
        
        // Mouse move handler for tooltip
        const mouseMoveHandler = (event) => {
            tooltip.style.left = (event.data.global.x + 15) + 'px';
            tooltip.style.top = (event.data.global.y - 40) + 'px';
        };
        
        const deployedTokens = [];
        
        try {
            // Combine monsters and NPCs for sequential deployment
            const allTokens = [...(metadata.monsters || []), ...(metadata.npcs || [])];
            
            // Create all actors first (without placing tokens)
            const actors = [];
            for (let i = 0; i < allTokens.length; i++) {
                const tokenId = allTokens[i];
                
                // Validate the UUID
                const validatedId = await this._validateUUID(tokenId);
                if (!validatedId) {
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Could not validate UUID, skipping`, tokenId, false, false, false);
                    continue;
                }
                
                const actor = await fromUuid(validatedId);
                
                if (actor) {
                    // Create world copy if from compendium
                    let worldActor = actor;
                    if (actor.pack) {
                        const actorData = actor.toObject();
                        
                        // Get or create the encounter folder
                        const folderName = game.settings.get(MODULE_ID, 'encounterFolder');
                        let encounterFolder = null;
                        
                        if (folderName && folderName.trim() !== '') {
                            encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                            
                            if (!encounterFolder) {
                                try {
                                    encounterFolder = await Folder.create({
                                        name: folderName,
                                        type: 'Actor',
                                        color: '#ff0000'
                                    });
                                } catch (error) {
                                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Failed to create encounter folder", error, false, false, true);
                                    encounterFolder = null;
                                }
                            }
                        }
                        
                        const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                        worldActor = await Actor.create(actorData, createOptions);
                        
                        if (encounterFolder && !worldActor.folder) {
                            await worldActor.update({ folder: encounterFolder.id });
                        }
                        
                        // Update prototype token settings
                        const defaultTokenData = game.settings.get("core", "defaultToken");
                        await worldActor.update({
                            "prototypeToken.displayName": defaultTokenData.displayName,
                            "prototypeToken.displayBars": defaultTokenData.displayBars,
                            "prototypeToken.disposition": defaultTokenData.disposition,
                            "prototypeToken.vision": defaultTokenData.vision
                        });
                    }
                    
                    actors.push(worldActor);
                }
            }
            
            // Now place tokens one by one
            for (let i = 0; i < actors.length; i++) {
                const actor = actors[i];
                const monsterName = actor.name;
                
                // Update tooltip content
                tooltip.innerHTML = `
                    <div class="monster-name">${monsterName}</div>
                    <div class="progress">Click to place (${i + 1} of ${actors.length})</div>
                `;
                tooltip.classList.add('show');
                
                // Add mouse move handler
                canvas.stage.on('mousemove', mouseMoveHandler);
                
                // Get position for this token
                const positionResult = await this._getTargetPosition();
                
                // Remove mouse move handler
                canvas.stage.off('mousemove', mouseMoveHandler);
                
                // Check if user cancelled (ESC pressed)
                if (!positionResult) {
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Sequential deployment cancelled by user", "", false, true, false);
                    break; // Exit the loop and return deployed tokens so far
                }
                
                const position = positionResult.position;
                const isAltHeld = positionResult.isAltHeld;
                
                // Create token data
                const defaultTokenData = foundry.utils.deepClone(game.settings.get("core", "defaultToken"));
                const tokenData = foundry.utils.mergeObject(defaultTokenData, actor.prototypeToken.toObject(), { overwrite: false });
                
                // Set position and linking
                tokenData.x = position.x;
                tokenData.y = position.y;
                tokenData.actorId = actor.id;
                // Honor the original actor's linked setting
                tokenData.actorLink = actor.prototypeToken.actorLink;
                
                // Set hidden based on ALT key or deployment setting
                const deploymentHidden = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden');
                tokenData.hidden = isAltHeld ? true : deploymentHidden;
                
                // Create the token
                const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                if (createdTokens && createdTokens.length > 0) {
                    deployedTokens.push(createdTokens[0]);
                }
            }
                     
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error in sequential deployment", error, false, false, true);
        } finally {
            // Clean up
            canvas.stage.off('mousemove', mouseMoveHandler);
            tooltip.remove();
            canvas.stage.cursor = 'default';
        }
        
        return deployedTokens;
    }

    static async _getTargetPosition(allowMultiple = false) {
        return new Promise((resolve) => {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Setting up click handler for target position", `Allow multiple: ${allowMultiple}`, false, true, false);
            
            // Use FoundryVTT's canvas pointer handling
            const handler = (event) => {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Canvas pointer event! Event type", event.type, false, true, false);
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Event global", event.global, false, true, false);
                
                // Only handle pointerdown events (clicks)
                if (event.type !== 'pointerdown') {
                    return;
                }
                
                // Ignore right-clicks (button 2) - let the rightClickHandler deal with them
                if (event.data.originalEvent && event.data.originalEvent.button === 2) {
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Right-click ignored by main handler", "", false, true, false);
                    return;
                }
                
                // Use FoundryVTT's built-in coordinate conversion
                // Convert global coordinates to scene coordinates using canvas stage
                const stage = canvas.stage;
                const globalPoint = new PIXI.Point(event.global.x, event.global.y);
                const localPoint = stage.toLocal(globalPoint);
                
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Event global coordinates", event.global, false, true, false);
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Local coordinates from stage", localPoint, false, true, false);
                
                // Use the exact click position first, then snap to grid square center
                let position = { x: localPoint.x, y: localPoint.y };
                
                // Get the grid size and calculate grid square center
                const gridSize = canvas.scene.grid.size;
                
                // Snap to top-left of the grid square (token coordinates are top-left, not center)
                const snappedX = Math.floor(localPoint.x / gridSize) * gridSize;
                const snappedY = Math.floor(localPoint.y / gridSize) * gridSize;
                
                position = { x: snappedX, y: snappedY };
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Grid square top-left position", position, false, true, false);
                
                // Check if CTRL is held down for multiple deployments
                const isCtrlHeld = event.data.originalEvent && event.data.originalEvent.ctrlKey;
                // Check if ALT is held down for invisible deployment
                const isAltHeld = event.data.originalEvent && event.data.originalEvent.altKey;
                
                // If not allowing multiple or CTRL not held, remove the handler
                if (!allowMultiple || !isCtrlHeld) {
                    canvas.stage.off('pointerdown', handler);
                    document.removeEventListener('keyup', keyUpHandler);
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Click handler removed, resolving position", "", false, true, false);
                } else {
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: CTRL held, keeping handler for multiple deployments", "", false, true, false);
                }
                
                // Resolve with the position and key states
                if (position) {
                    const result = {
                        position: position,
                        isAltHeld: isAltHeld
                    };
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Resolving position", result, false, true, false);
                    resolve(result);
                } else {
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: No valid position obtained, resolving null", "", false, false, false);
                    resolve(null);
                }
            };
            
            // Key up handler to detect when CTRL is released
            const keyUpHandler = (event) => {
                if (event.key === 'Control' && allowMultiple) {
                    canvas.stage.off('pointerdown', handler);
                    document.removeEventListener('keyup', keyUpHandler);
                    resolve(null);
                }
            };
            
            // Right-click handler to detect cancellation
            const rightClickHandler = (event) => {
                if (event.data.originalEvent && event.data.originalEvent.button === 2) { // Right mouse button
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Right-click detected, cancelling deployment", "", false, true, false);
                    canvas.stage.off('pointerdown', handler);
                    canvas.stage.off('pointerdown', rightClickHandler);
                    document.removeEventListener('keyup', keyUpHandler);
                    resolve(null);
                }
            };
            
            // Add the event listeners
            canvas.stage.on('pointerdown', handler);
            canvas.stage.on('pointerdown', rightClickHandler);
            document.addEventListener('keyup', keyUpHandler);
        });
    }





    static async _createCombatWithTokens(deployedTokens, metadata) {
        // Check if user has permission to create combat
        if (!game.user.isGM) {
            return;
        }
        
        if (!deployedTokens || deployedTokens.length === 0) {
            postConsoleAndNotification("No tokens were deployed.", "", false, false, true);
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
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Created new combat encounter", "", false, true, false);
            } else {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Adding to existing combat encounter", "", false, true, false);
            }

            // Add deployed tokens to combat using their actual IDs
            for (const token of deployedTokens) {
                try {
                    await combat.createEmbeddedDocuments("Combatant", [{
                        tokenId: token.id,
                        actorId: token.actor.id,
                        sceneId: canvas.scene.id
                    }]);
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Added ${token.name} to combat`, "", false, true, false);
                } catch (error) {
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Failed to add ${token.name} to combat:`, error, false, false, false);
                }
            }

            const action = combat === game.combats.active ? "added to existing" : "created new";
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error creating combat", error, false, false, true);
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
                postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: No tokens were deployed, cancelling combat creation.`, "", false, true, false);
                
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
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Combat creation cancelled by user.`, "", false, true, false);
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
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Added ${token.name} to combat`, "", false, true, false);
                } catch (error) {
                    postConsoleAndNotification(`BLACKSMITH | Encounter Toolbar: Failed to add ${token.name} to combat:`, error, false, false, false);
                }
            }

        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error creating combat", error, false, false, true);
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
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error calculating party CR", error, false, false, true);
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
                            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Monster CR", `${actor.name}: ${crValue}`, false, true, false);
                        } else {
                            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Warning", `No CR found for ${actor.name}`, false, false, false);
                        }
                    }
                } catch (error) {
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error", `Error calculating CR for monster ${token.name}: ${error}`, false, false, true);
                }
            }

            if (monsterCount === 0) {
                return "0";
            }

            // Return total CR for multiple monsters (not average)
            return this.formatCR(totalCR);
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error", `Error calculating monster CR: ${error}`, false, false, true);
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