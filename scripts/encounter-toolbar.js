// ================================================================== 
// ===== ENCOUNTER TOOLBAR ==========================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { getCachedTemplate } from './blacksmith.js';
import { postConsoleAndNotification } from './global.js';

export class EncounterToolbar {
    
    static init() {
        // Listen for journal sheet rendering (normal view only)
        Hooks.on('renderJournalSheet', this._onRenderJournalSheet.bind(this));
        
        // Also listen for when journal content is updated (saves)
        Hooks.on('updateJournalEntryPage', this._onUpdateJournalEntryPage.bind(this));
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
                console.error("BLACKSMITH | Encounter Toolbar: Error in initial update:", error);
            });
            
            // Retry after delay if requested (for renderJournalSheet)
            if (shouldRetry) {
                // Multiple retries with increasing delays
                const retryDelays = [500, 1000, 2000];
                retryDelays.forEach((delay, index) => {
                    setTimeout(() => {
                        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Retrying metadata search after delay", `Attempt ${index + 2}`, false, true, false);
                        this._updateToolbarContent(html).catch(error => {
                            console.error(`BLACKSMITH | Encounter Toolbar: Error in retry ${index + 2}:`, error);
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
            // Check if it's a valid UUID format
            if (!uuid.includes('Compendium.')) {
                console.warn(`BLACKSMITH | Encounter Toolbar: Invalid UUID format: "${uuid}"`);
                return null;
            }
            
            // Try to load the actor to validate it exists
            const actor = await fromUuid(uuid);
            if (!actor) {
                console.warn(`BLACKSMITH | Encounter Toolbar: Could not load actor with UUID: "${uuid}"`);
                return null;
            }
            
            return uuid;
        } catch (error) {
            console.error(`BLACKSMITH | Encounter Toolbar: Error validating UUID "${uuid}":`, error);
            return null;
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
                    console.log("BLACKSMITH | Encounter Toolbar: Monster details:", { name, cr, portrait });
                }
            } catch (error) {
                console.error(`BLACKSMITH | Encounter Toolbar: Error getting details for ${uuid}:`, error);
            }
        }
        
        return monsterDetails;
    }

    // Enhanced method to scan journal content for encounter data
    static _scanJournalContent(html, pageId) {
        try {
            console.log("BLACKSMITH | Encounter Toolbar: Starting content scan for page:", pageId);
            
            // Get the journal page content - try different selectors
            let pageContent = html.find(`article[data-page-id="${pageId}"] section.journal-page-content`);
            console.log("BLACKSMITH | Encounter Toolbar: Found page content:", pageContent.length > 0);
            console.log("BLACKSMITH | Encounter Toolbar: Looking for selector:", `article[data-page-id="${pageId}"] section.journal-page-content`);
            
            // If that doesn't work, try finding the article first, then the section
            if (!pageContent.length) {
                const article = html.find(`article[data-page-id="${pageId}"]`);
                console.log("BLACKSMITH | Encounter Toolbar: Found article:", article.length > 0);
                if (article.length > 0) {
                    console.log("BLACKSMITH | Encounter Toolbar: All sections in article:", article.find('section').length);
                    console.log("BLACKSMITH | Encounter Toolbar: Section classes:", article.find('section').map((i, el) => $(el).attr('class')).get());
                    pageContent = article.find('section.journal-page-content');
                    console.log("BLACKSMITH | Encounter Toolbar: Found section in article:", pageContent.length > 0);
                    
                    // If still not found, try without the class
                    if (!pageContent.length) {
                        pageContent = article.find('section');
                        console.log("BLACKSMITH | Encounter Toolbar: Found any section:", pageContent.length > 0);
                    }
                }
            }
            
            console.log("BLACKSMITH | Encounter Toolbar: Total articles found:", html.find('article').length);
            console.log("BLACKSMITH | Encounter Toolbar: Articles with data-page-id:", html.find('article[data-page-id]').length);
            console.log("BLACKSMITH | Encounter Toolbar: All articles:", html.find('article').map((i, el) => $(el).attr('data-page-id')).get());
            
            if (!pageContent.length) {
                console.log("BLACKSMITH | Encounter Toolbar: No page content found");
                return null;
            }

            // Check if content scanning is enabled
            if (!game.settings.get(MODULE_ID, 'enableEncounterContentScanning')) {
                console.log("BLACKSMITH | Encounter Toolbar: Content scanning disabled");
                return null;
            }

            // Extract both text and HTML content
            const textContent = pageContent.text();
            const htmlContent = pageContent.html();
            
            console.log("BLACKSMITH | Encounter Toolbar: Text content length:", textContent.length);
            console.log("BLACKSMITH | Encounter Toolbar: HTML content length:", htmlContent.length);

            // Try JSON format first (for structured data)
            let encounterData = this._parseJSONEncounter(htmlContent);
            if (encounterData) {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found JSON encounter data", "", false, true, false);
                return encounterData;
            }

            // Use the new pattern-based detection
            encounterData = this._parsePatternBasedEncounter(textContent, htmlContent);
            if (encounterData) {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found pattern-based encounter data", "", false, true, false);
                return encounterData;
            }

            console.log("BLACKSMITH | Encounter Toolbar: No encounter data found");
            return null;
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error scanning journal content", error, false, true, false);
            return null;
        }
    }

    // Pattern-based encounter detection
    static _parsePatternBasedEncounter(textContent, htmlContent) {
        try {
            const encounterData = {
                monsters: [],
                difficulty: null
            };

            // Debug: Log what we're scanning
            console.log("BLACKSMITH | Encounter Toolbar: Scanning text content for patterns");
            console.log("BLACKSMITH | Encounter Toolbar: Text content length:", textContent.length);
            console.log("BLACKSMITH | Encounter Toolbar: Sample of text content:", textContent.substring(0, 500));
            console.log("BLACKSMITH | Encounter Toolbar: HTML content length:", htmlContent.length);
            console.log("BLACKSMITH | Encounter Toolbar: Sample of HTML content:", htmlContent.substring(0, 1000));

            // 1. Find all data-uuid attributes in the content (Foundry renders links as <a> tags)
            console.log("BLACKSMITH | Encounter Toolbar: Looking for data-uuid attributes in HTML content");
            const uuidMatches = htmlContent.match(/data-uuid="([^"]+)"/g);
            console.log("BLACKSMITH | Encounter Toolbar: Found UUID matches:", uuidMatches);
            
            if (uuidMatches) {
                for (const match of uuidMatches) {
                    const uuidMatch = match.match(/data-uuid="([^"]+)"/);
                    if (uuidMatch) {
                        const uuid = uuidMatch[1];
                        console.log("BLACKSMITH | Encounter Toolbar: Processing UUID:", uuid);
                        
                        // 2. Check if this UUID contains "Actor" (case-insensitive)
                        if (uuid.toLowerCase().includes('actor')) {
                            console.log("BLACKSMITH | Encounter Toolbar: Found Actor UUID:", uuid);
                            
                            // 3. Look for quantity indicators near this UUID
                            let quantity = 1;
                            
                            // Find the context around this UUID (within 100 characters)
                            const uuidIndex = htmlContent.indexOf(match);
                            const contextStart = Math.max(0, uuidIndex - 100);
                            const contextEnd = Math.min(htmlContent.length, uuidIndex + match.length + 100);
                            const context = htmlContent.substring(contextStart, contextEnd);
                            console.log("BLACKSMITH | Encounter Toolbar: Context around UUID:", context);
                            
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
                                    console.log("BLACKSMITH | Encounter Toolbar: Found quantity:", quantity);
                                    break;
                                }
                            }
                            
                            // Add the monster the specified number of times
                            for (let i = 0; i < quantity; i++) {
                                encounterData.monsters.push(uuid);
                            }
                        } else {
                            console.log("BLACKSMITH | Encounter Toolbar: UUID is not an Actor type:", uuid);
                        }
                    }
                }
            }

            // 4. Look for difficulty patterns (case-insensitive)
            const difficultyPatterns = [
                /difficulty\s*:\s*(easy|medium|hard|deadly)/i,
                /difficulty\s*=\s*(easy|medium|hard|deadly)/i,
                /(easy|medium|hard|deadly)\s*difficulty/i
            ];
            
            console.log("BLACKSMITH | Encounter Toolbar: Looking for difficulty patterns");
            for (const pattern of difficultyPatterns) {
                const difficultyMatch = textContent.match(pattern);
                if (difficultyMatch) {
                    encounterData.difficulty = difficultyMatch[1].toLowerCase();
                    console.log("BLACKSMITH | Encounter Toolbar: Found difficulty:", encounterData.difficulty);
                    break;
                }
            }

            // Return data if we found monsters or difficulty
            console.log("BLACKSMITH | Encounter Toolbar: Final encounter data:", encounterData);
            console.log("BLACKSMITH | Encounter Toolbar: Has monsters:", encounterData.monsters.length > 0);
            console.log("BLACKSMITH | Encounter Toolbar: Has difficulty:", !!encounterData.difficulty);
            return (encounterData.monsters.length > 0 || encounterData.difficulty) ? encounterData : null;
        } catch (error) {
            console.error("BLACKSMITH | Encounter Toolbar: Error in pattern-based parsing:", error);
            return null;
        }
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
                
                if (data.encounter && (data.encounter.monsters || data.encounter.difficulty)) {
                    return {
                        monsters: data.encounter.monsters || [],
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
        let encounterData = this._scanJournalContent(html, pageId);
        console.log("BLACKSMITH | Encounter Toolbar: Content scan result:", encounterData);
        
        if (encounterData) {
            // We have encounter data - use the full toolbar
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found encounter data, updating toolbar", "", false, true, false);
            console.log("BLACKSMITH | Encounter Toolbar: Encounter data:", encounterData);
            
            try {
                // Check if we have monsters
                const hasMonsters = encounterData.monsters && encounterData.monsters.length > 0;
                console.log("BLACKSMITH | Encounter Toolbar: Has monsters:", hasMonsters);
                console.log("BLACKSMITH | Encounter Toolbar: Monsters array:", encounterData.monsters);
                
                // Get monster details for display
                let monsterDetails = [];
                if (hasMonsters) {
                    monsterDetails = await this._getMonsterDetails(encounterData.monsters);
                }
                
                // Determine difficulty class for styling
                let difficultyClass = '';
                if (encounterData.difficulty) {
                    const difficultyLower = encounterData.difficulty.toLowerCase();
                    if (difficultyLower.includes('easy')) difficultyClass = 'easy';
                    else if (difficultyLower.includes('medium')) difficultyClass = 'medium';
                    else if (difficultyLower.includes('hard')) difficultyClass = 'hard';
                    else if (difficultyLower.includes('deadly')) difficultyClass = 'deadly';
                }

                // Calculate CR values
                const partyCR = this.getPartyCR();
                const monsterCR = this.getMonsterCR(encounterData);

                // Get the template
                const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
                getCachedTemplate(templatePath).then(template => {
                    // Prepare the data for the template
                    const templateData = {
                        journalId: html.closest('.journal-sheet').data('document-id') || 'unknown',
                        hasEncounterData: true,
                        hasMonsters,
                        monsters: monsterDetails,
                        difficulty: encounterData.difficulty,
                        difficultyClass,
                        partyCR: partyCR,
                        monsterCR: monsterCR,
                        autoCreateCombat: game.settings.get(MODULE_ID, 'autoCreateCombatForEncounters')
                    };
                    
                    // Render the toolbar
                    const renderedHtml = template(templateData);
                    toolbar.html(renderedHtml);
                    
                    // Add event listeners to the buttons
                    this._addEventListeners($(document), encounterData);
                    
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
        
        // Get the template
        const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
        getCachedTemplate(templatePath).then(template => {
            // Prepare the data for the template (no encounter case)
            const templateData = {
                journalId: html.closest('.journal-sheet').data('document-id') || 'unknown',
                hasEncounterData: false,
                hasMonsters: false,
                difficulty: null,
                difficultyClass: null,
                partyCR: partyCR,
                monsterCR: monsterCR
            };
            
            // Render the toolbar
            const renderedHtml = template(templateData);
            toolbar.html(renderedHtml);
            
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Updated with no encounter data", "", false, true, false);
        });
    }

    static _addEventListeners(html, metadata) {
        console.log("BLACKSMITH | Encounter Toolbar: Setting up event listeners with metadata:", metadata);
        
        // Deploy monsters button
        html.find('.deploy-monsters').click(async (event) => {
            console.log("BLACKSMITH | Encounter Toolbar: Deploy monsters button clicked!");
            event.preventDefault();
            EncounterToolbar._deployMonsters(metadata);
        });
        

        
        // Create combat button
        html.find('.create-combat').click(async (event) => {
            console.log("BLACKSMITH | Encounter Toolbar: Create combat button clicked!");
            event.preventDefault();
            
            // Deploy monsters first, then create combat
            const deployedTokens = await EncounterToolbar._deployMonsters(metadata);
            if (deployedTokens && deployedTokens.length > 0) {
                await EncounterToolbar._createCombatWithTokens(deployedTokens, metadata);
            }
        });
    }

    static async _deployMonsters(metadata) {
        if (!metadata.monsters || metadata.monsters.length === 0) {
            ui.notifications.warn("No monsters found in encounter data.");
            return [];
        }

        // Get the deployment pattern setting
        const deploymentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
        console.log("BLACKSMITH | Encounter Toolbar: Deployment pattern:", deploymentPattern);

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
                tooltip.innerHTML = `
                    <div class="monster-name">Deploying Monsters</div>
                    <div class="progress">${patternName} - Click to place ${metadata.monsters.length} monsters</div>
                `;
                tooltip.classList.add('show');
                canvas.stage.on('mousemove', mouseMoveHandler);
            }

            // Handle sequential deployment
            if (deploymentPattern === "sequential") {
                return await this._deploySequential(metadata, null);
            } else {
                // Get the target position (where the user clicked)
                const position = await this._getTargetPosition();
                
                if (!position) {
                    ui.notifications.warn("Please click on the canvas to place monsters.");
                    return [];
                }
                
                // Deploy each monster
                for (let i = 0; i < metadata.monsters.length; i++) {
                    const monsterId = metadata.monsters[i];
                    
                    try {
                        // Validate the UUID
                        const validatedId = await this._validateUUID(monsterId);
                        if (!validatedId) {
                            console.warn(`BLACKSMITH | Encounter Toolbar: Could not validate UUID "${monsterId}", skipping`);
                            continue;
                        }
                        
                        const actor = await fromUuid(validatedId);
                        console.log("BLACKSMITH | Encounter Toolbar: Loaded actor:", actor);
                        
                        if (actor) {
                            console.log("BLACKSMITH | Encounter Toolbar: Actor ID:", actor.id);
                            
                            // First, create a world copy of the actor if it's from a compendium
                            let worldActor = actor;
                            if (actor.pack) {
                                console.log("BLACKSMITH | Encounter Toolbar: Creating world copy of compendium actor");
                                const actorData = actor.toObject();
                                
                                // Get or create the encounter folder
                                const folderName = game.settings.get(MODULE_ID, 'encounterFolder');
                                let encounterFolder = null;
                                
                                // Only create/find folder if folderName is not empty
                                if (folderName && folderName.trim() !== '') {
                                    encounterFolder = game.folders.find(f => f.name === folderName && f.type === 'Actor');
                                    
                                    if (!encounterFolder) {
                                        console.log("BLACKSMITH | Encounter Toolbar: Creating encounter folder:", folderName);
                                        encounterFolder = await Folder.create({
                                            name: folderName,
                                            type: 'Actor',
                                            color: '#ff0000'
                                        });
                                        console.log("BLACKSMITH | Encounter Toolbar: Encounter folder created:", encounterFolder.id);
                                    }
                                }
                                
                                // Create the world actor
                                const createOptions = encounterFolder ? { folder: encounterFolder.id } : {};
                                console.log("BLACKSMITH | Encounter Toolbar: Creating actor with options:", createOptions);
                                worldActor = await Actor.create(actorData, createOptions);
                                console.log("BLACKSMITH | Encounter Toolbar: World actor created:", worldActor.id);
                                console.log("BLACKSMITH | Encounter Toolbar: Actor folder:", worldActor.folder);
                                
                                // Ensure folder is assigned (sometimes it doesn't get set during creation)
                                if (encounterFolder && !worldActor.folder) {
                                    console.log("BLACKSMITH | Encounter Toolbar: Folder not assigned during creation, updating actor...");
                                    await worldActor.update({ folder: encounterFolder.id });
                                    console.log("BLACKSMITH | Encounter Toolbar: Actor folder after update:", worldActor.folder);
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
                                tokenPosition = this._calculateCirclePosition(position, i, metadata.monsters.length);
                            } else if (deploymentPattern === "scatter") {
                                tokenPosition = this._calculateScatterPosition(position, i);
                            } else if (deploymentPattern === "grid") {
                                tokenPosition = this._calculateSquarePosition(position, i, metadata.monsters.length);
                            } else {
                                // Default to line formation
                                const gridSize = canvas.scene.grid.size;
                                tokenPosition = {
                                    x: position.x + (i * gridSize),
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
                            tokenData.actorLink = false; // Create unlinked tokens
                            tokenData.hidden = deploymentHidden;
                            
                            // Honor lock rotation setting
                            const lockRotation = game.settings.get("core", "defaultToken").lockRotation;
                            if (lockRotation !== undefined) {
                                tokenData.lockRotation = lockRotation;
                            }
                            
                            // Create the token on the canvas
                            const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                            console.log("BLACKSMITH | Encounter Toolbar: Token creation result:", createdTokens);
                            
                            // Verify the token was created and is visible
                            if (createdTokens && createdTokens.length > 0) {
                                const token = createdTokens[0];
                                deployedTokens.push(token);
                                console.log("BLACKSMITH | Encounter Toolbar: Created token:", token);
                                console.log("BLACKSMITH | Encounter Toolbar: Token position:", {x: token.x, y: token.y});
                                console.log("BLACKSMITH | Encounter Toolbar: Token visible:", token.visible);
                                console.log("BLACKSMITH | Encounter Toolbar: Token actor:", token.actor);
                                console.log("BLACKSMITH | Encounter Toolbar: Token actorId:", token.actorId);
                            }
                        }
                    } catch (error) {
                        console.error(`BLACKSMITH | Encounter Toolbar: Failed to deploy monster ${monsterId}:`, error);
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
            console.error("BLACKSMITH | Encounter Toolbar: Error deploying monsters:", error);
            ui.notifications.error("Failed to deploy monsters.");
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



    static _calculateCirclePosition(centerPosition, index, totalTokens) {
        // Calculate circle formation
        const radius = 100; // Base radius in pixels
        const angleStep = (2 * Math.PI) / totalTokens;
        const angle = index * angleStep;
        
        const x = centerPosition.x + (radius * Math.cos(angle));
        const y = centerPosition.y + (radius * Math.sin(angle));
        
        return { x, y };
    }

    static _calculateScatterPosition(centerPosition, index) {
        // Calculate scatter formation using spiral pattern to prevent overlaps
        const gridSize = canvas.scene.grid.size;
        const spacing = gridSize * 1.5; // Minimum spacing between tokens
        
        // Use spiral pattern for better distribution
        const spiralRadius = spacing * (index + 1);
        const spiralAngle = index * Math.PI / 3; // Golden angle approximation
        
        // Add some randomness to the spiral
        const randomOffset = (Math.random() - 0.5) * spacing * 0.5;
        
        // Calculate position
        let x = centerPosition.x + (spiralRadius * Math.cos(spiralAngle)) + randomOffset;
        let y = centerPosition.y + (spiralRadius * Math.sin(spiralAngle)) + randomOffset;
        
        // Snap to grid
        const snappedPosition = canvas.grid.getSnappedPoint(x, y);
        if (snappedPosition) {
            x = snappedPosition.x;
            y = snappedPosition.y;
        }
        
        console.log(`BLACKSMITH | Encounter Toolbar: Scatter position ${index} (gridSize ${gridSize}):`, { x, y });
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
        
        // Calculate offset from center to make the square centered on the click point
        const offsetX = (sideLength - 1) * spacing / 2;
        const offsetY = (sideLength - 1) * spacing / 2;
        
        let x = centerPosition.x + (col * spacing) - offsetX;
        let y = centerPosition.y + (row * spacing) - offsetY;
        
        // Snap to grid
        const snappedPosition = canvas.grid.getSnappedPoint(x, y);
        if (snappedPosition) {
            x = snappedPosition.x;
            y = snappedPosition.y;
        }
        
        console.log(`BLACKSMITH | Encounter Toolbar: Square position ${index} (row ${row}, col ${col}, sideLength ${sideLength}, gridSize ${gridSize}):`, { x, y });
        return { x, y };
    }

    static _getDeploymentPatternName(pattern) {
        const patternNames = {
            "circle": "Circle Formation",
            "line": "Line Formation", 
            "scatter": "Scatter Positioning",
            "grid": "Grid Positioning",
            "sequential": "Sequential Positioning"
        };
        return patternNames[pattern] || "Unknown Pattern";
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
            // Create all actors first (without placing tokens)
            const actors = [];
            for (let i = 0; i < metadata.monsters.length; i++) {
                const monsterId = metadata.monsters[i];
                
                // Validate the UUID
                const validatedId = await this._validateUUID(monsterId);
                if (!validatedId) {
                    console.warn(`BLACKSMITH | Encounter Toolbar: Could not validate UUID "${monsterId}", skipping`);
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
                                    console.error("BLACKSMITH | Encounter Toolbar: Failed to create encounter folder:", error);
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
                const position = await this._getTargetPosition();
                
                // Remove mouse move handler
                canvas.stage.off('mousemove', mouseMoveHandler);
                
                // Create token data
                const defaultTokenData = foundry.utils.deepClone(game.settings.get("core", "defaultToken"));
                const tokenData = foundry.utils.mergeObject(defaultTokenData, actor.prototypeToken.toObject(), { overwrite: false });
                
                // Set position and linking
                tokenData.x = position.x;
                tokenData.y = position.y;
                tokenData.actorId = actor.id;
                tokenData.actorLink = false;
                
                // Honor deployment hidden setting
                const deploymentHidden = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentHidden');
                if (deploymentHidden) {
                    tokenData.hidden = true;
                }
                
                // Create the token
                const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                if (createdTokens && createdTokens.length > 0) {
                    deployedTokens.push(createdTokens[0]);
                }
            }
            
            ui.notifications.info(`Sequentially deployed ${actors.length} monsters.`);
            
        } catch (error) {
            console.error("BLACKSMITH | Encounter Toolbar: Error in sequential deployment:", error);
            ui.notifications.error("Failed to deploy monsters sequentially.");
        } finally {
            // Clean up
            canvas.stage.off('mousemove', mouseMoveHandler);
            tooltip.remove();
            canvas.stage.cursor = 'default';
        }
        
        return deployedTokens;
    }

    static async _getTargetPosition() {
        return new Promise((resolve) => {
            console.log("BLACKSMITH | Encounter Toolbar: Setting up click handler for target position");
            ui.notifications.info("Click on the canvas to place monsters.");
            
            // Use FoundryVTT's canvas pointer handling
            const handler = (event) => {
                console.log("BLACKSMITH | Encounter Toolbar: Canvas pointer event! Event type:", event.type);
                console.log("BLACKSMITH | Encounter Toolbar: Event global:", event.global);
                
                // Only handle pointerdown events (clicks)
                if (event.type !== 'pointerdown') {
                    return;
                }
                
                // Use FoundryVTT's built-in coordinate conversion
                // Convert global coordinates to scene coordinates using canvas stage
                const stage = canvas.app.stage;
                const globalPoint = new PIXI.Point(event.global.x, event.global.y);
                const localPoint = stage.toLocal(globalPoint);
                
                console.log("BLACKSMITH | Encounter Toolbar: Local coordinates from stage:", localPoint);
                
                // Use the exact click position first, then snap to grid
                let position = { x: localPoint.x, y: localPoint.y };
                
                // Snap to grid using the more reliable method
                const snappedPosition = canvas.grid.getSnappedPoint(localPoint.x, localPoint.y);
                if (snappedPosition) {
                    position = snappedPosition;
                    console.log("BLACKSMITH | Encounter Toolbar: getSnappedPoint result:", position);
                } else {
                    // Fall back to deprecated method if needed
                    console.log("BLACKSMITH | Encounter Toolbar: getSnappedPoint failed, trying getSnappedPosition");
                    const fallbackPosition = canvas.grid.getSnappedPosition(localPoint.x, localPoint.y);
                    if (fallbackPosition) {
                        position = fallbackPosition;
                        console.log("BLACKSMITH | Encounter Toolbar: getSnappedPosition result:", position);
                    }
                }
                
                // Remove the event listener immediately
                canvas.app.stage.off('pointerdown', handler);
                console.log("BLACKSMITH | Encounter Toolbar: Click handler removed, resolving position");
                
                // Resolve with the position
                if (position) {
                    console.log("BLACKSMITH | Encounter Toolbar: Resolving position:", position);
                    resolve(position);
                } else {
                    console.warn("BLACKSMITH | Encounter Toolbar: No valid position obtained, resolving null");
                    resolve(null);
                }
            };
            
            // Add the event listener to the canvas stage
            console.log("BLACKSMITH | Encounter Toolbar: Adding pointerdown handler to canvas stage");
            canvas.app.stage.on('pointerdown', handler);
        });
    }





    static async _createCombatWithTokens(deployedTokens, metadata) {
        if (!deployedTokens || deployedTokens.length === 0) {
            ui.notifications.warn("No tokens were deployed.");
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
                console.log("BLACKSMITH | Encounter Toolbar: Created new combat encounter");
            } else {
                console.log("BLACKSMITH | Encounter Toolbar: Adding to existing combat encounter");
            }

            // Add deployed tokens to combat using their actual IDs
            for (const token of deployedTokens) {
                try {
                    await combat.createEmbeddedDocuments("Combatant", [{
                        tokenId: token.id,
                        actorId: token.actor.id,
                        sceneId: canvas.scene.id
                    }]);
                    console.log(`BLACKSMITH | Encounter Toolbar: Added ${token.name} to combat`);
                } catch (error) {
                    console.warn(`BLACKSMITH | Encounter Toolbar: Failed to add ${token.name} to combat:`, error);
                }
            }

            const action = combat === game.combats.active ? "added to existing" : "created new";
            ui.notifications.info(`${deployedTokens.length} monsters ${action} combat encounter.`);
            
        } catch (error) {
            console.error("BLACKSMITH | Encounter Toolbar: Error creating combat:", error);
            ui.notifications.error("Failed to create combat encounter.");
        }
    }

    static async _createCombat(metadata) {
        if (!metadata.monsters || metadata.monsters.length === 0) {
            ui.notifications.warn("No monsters found in encounter data.");
            return;
        }

        try {
            // First deploy the monsters to get tokens on the canvas
            const deployedTokens = await this._deployMonsters(metadata);
            
            if (!deployedTokens || deployedTokens.length === 0) {
                ui.notifications.warn("No tokens were deployed.");
                return;
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
                    console.log(`BLACKSMITH | Encounter Toolbar: Added ${token.name} to combat`);
                } catch (error) {
                    console.warn(`BLACKSMITH | Encounter Toolbar: Failed to add ${token.name} to combat:`, error);
                }
            }

            ui.notifications.info(`Combat encounter created with ${deployedTokens.length} deployed monsters.`);
            
        } catch (error) {
            console.error("BLACKSMITH | Encounter Toolbar: Error creating combat:", error);
            ui.notifications.error("Failed to create combat encounter.");
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
            console.warn("BLACKSMITH | Encounter Toolbar: Error calculating party CR:", error);
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
                            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Warning", `No CR found for ${actor.name}`, false, false, true);
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