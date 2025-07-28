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
            this._updateToolbarContent(html);
            
            // Retry after delay if requested (for renderJournalSheet)
            if (shouldRetry) {
                setTimeout(() => {
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Retrying metadata search after delay", "", false, true, false);
                    this._updateToolbarContent(html);
                }, 500);
            }
        }
    }

    // Helper method to check if we're in edit mode
    static _isEditMode(html) {
        // Check if the specific journal sheet has editor-container (is in edit mode)
        return html.find('.editor-container').length > 0;
    }

    // Simple method to update toolbar content
    static _updateToolbarContent(html) {
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

        // Look for encounter data attributes inside the specific journal page content section
        let encounterDiv = html.find(`article[data-page-id="${pageId}"] section.journal-page-content div[data-journal-type="encounter"]`);
        
        // Debug: Let's see what we're finding
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Looking for encounter data", `Found ${encounterDiv.length} encounter divs for page ${pageId}`, false, true, false);
        
        // Also try looking in the document as a fallback, but still scoped to this page
        if (encounterDiv.length === 0) {
            const docEncounterDiv = $(document).find(`article[data-page-id="${pageId}"] section.journal-page-content div[data-journal-type="encounter"]`);
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Fallback search in document", `Found ${docEncounterDiv.length} encounter divs for page ${pageId}`, false, true, false);
            
            if (docEncounterDiv.length > 0) {
                // Use the document version if html doesn't have it
                encounterDiv = docEncounterDiv;
            }
        }
        
        if (encounterDiv.length > 0) {
            // We have encounter data - use the full toolbar
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found encounter data, updating toolbar", "", false, true, false);
            
            try {
                // Extract data from attributes
                const monsterUUIDs = encounterDiv.data('encounter-monsters');
                const difficulty = encounterDiv.data('encounter-difficulty');
                
                // Check if we have monsters
                const hasMonsters = monsterUUIDs && monsterUUIDs.length > 0;
                
                // Determine difficulty class for styling
                let difficultyClass = '';
                if (difficulty) {
                    const difficultyLower = difficulty.toLowerCase();
                    if (difficultyLower.includes('easy')) difficultyClass = 'easy';
                    else if (difficultyLower.includes('medium')) difficultyClass = 'medium';
                    else if (difficultyLower.includes('hard')) difficultyClass = 'hard';
                    else if (difficultyLower.includes('deadly')) difficultyClass = 'deadly';
                }

                // Create metadata object for event listeners
                const metadata = {
                    monsters: hasMonsters ? monsterUUIDs.split(',') : [],
                    difficulty: difficulty
                };

                // Get the template
                const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
                getCachedTemplate(templatePath).then(template => {
                    // Prepare the data for the template
                    const templateData = {
                        journalId: encounterDiv.closest('.journal-sheet').data('document-id') || 'unknown',
                        hasMonsters,
                        difficulty: difficulty,
                        difficultyClass,
                        autoCreateCombat: game.settings.get(MODULE_ID, 'autoCreateCombatForEncounters')
                    };
                    
                    // Render the toolbar
                    const html = template(templateData);
                    toolbar.html(html);
                    
                    // Add event listeners to the buttons
                    this._addEventListeners($(document), metadata);
                    
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Updated with encounter data", "", false, true, false);
                });
                
                return; // Exit early since we're handling this asynchronously
                
            } catch (error) {
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error processing encounter data", error, false, true, false);
                // Fall through to create "no encounter" toolbar
            }
        }
        
        // If we don't have encounter data or there was an error, create a "no encounter" toolbar
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: No encounter data found, showing placeholder", "", false, true, false);
        
        toolbar.html(`
            <div class="encounter-toolbar no-encounter" style="background: #f0f0f0; border: 1px solid #ccc; padding: 10px; margin: 10px 0; border-radius: 5px; text-align: center;">
                <h3 style="margin: 0 0 10px 0; color: #666;">⚔️ Encounter Tools</h3>
                <p style="margin: 0; color: #888; font-style: italic;">No encounter data found in this journal entry.</p>
                <p style="margin: 5px 0 0 0; color: #888; font-size: 0.9em;">
                    <em>Future: Quick encounter creation will be available here.</em>
                </p>
            </div>
        `);
    }

    static _addEventListeners(html, metadata) {
        console.log("BLACKSMITH | Encounter Toolbar: Setting up event listeners with metadata:", metadata);
        
        // Deploy monsters button
        html.find('.deploy-monsters').click(async (event) => {
            console.log("BLACKSMITH | Encounter Toolbar: Deploy monsters button clicked!");
            event.preventDefault();
            EncounterToolbar._deployMonsters(metadata);
        });
        
        // Roll initiative button
        html.find('.roll-initiative').click(async (event) => {
            console.log("BLACKSMITH | Encounter Toolbar: Roll initiative button clicked!");
            event.preventDefault();
            EncounterToolbar._rollInitiative(metadata);
        });
        
        // Create combat button
        html.find('.create-combat').click(async (event) => {
            console.log("BLACKSMITH | Encounter Toolbar: Create combat button clicked!");
            event.preventDefault();
            EncounterToolbar._createCombat(metadata);
        });
    }

    static async _deployMonsters(metadata) {
        if (!metadata.monsters || metadata.monsters.length === 0) {
            ui.notifications.warn("No monsters found in encounter data.");
            return;
        }

        try {
            // Get the target position (where the user clicked)
            const position = await this._getTargetPosition();
            
            if (!position) {
                ui.notifications.warn("Please click on the canvas to place monsters.");
                return;
            }

            // Deploy each monster
            for (let i = 0; i < metadata.monsters.length; i++) {
                const monsterId = metadata.monsters[i];
                
                try {
                    const actor = await fromUuid(monsterId);
                    console.log("BLACKSMITH | Encounter Toolbar: Loaded actor:", actor);
                    
                    if (actor) {
                        console.log("BLACKSMITH | Encounter Toolbar: Actor ID:", actor.id);
                        
                        // First, create a world copy of the actor if it's from a compendium
                        let worldActor = actor;
                        if (actor.pack) {
                            console.log("BLACKSMITH | Encounter Toolbar: Creating world copy of compendium actor");
                            const actorData = actor.toObject();
                            worldActor = await Actor.create(actorData);
                            console.log("BLACKSMITH | Encounter Toolbar: World actor created:", worldActor.id);
                            
                            // Update the actor's prototype token to use GM's default settings
                            const defaultTokenData = game.settings.get("core", "defaultToken");
                            await worldActor.update({
                                "prototypeToken.displayName": defaultTokenData.displayName,
                                "prototypeToken.displayBars": defaultTokenData.displayBars,
                                "prototypeToken.disposition": defaultTokenData.disposition,
                                "prototypeToken.vision": defaultTokenData.vision
                            });
                        }
                        
                        // Get the GM's default token settings and merge with actor's prototype token
                        const defaultTokenData = foundry.utils.deepClone(game.settings.get("core", "defaultToken"));
                        const tokenData = foundry.utils.mergeObject(defaultTokenData, worldActor.prototypeToken.toObject(), { overwrite: false });
                        
                        // Override position and linking settings
                        tokenData.x = position.x;
                        tokenData.y = position.y;
                        tokenData.actorId = worldActor.id;
                        tokenData.actorLink = true;
                        
                        console.log("BLACKSMITH | Encounter Toolbar: Creating token with data:", tokenData);
                        
                        // Create the token on the canvas
                        const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                        console.log("BLACKSMITH | Encounter Toolbar: Token creation result:", createdTokens);
                        
                        // Verify the token was created and is visible
                        if (createdTokens && createdTokens.length > 0) {
                            const token = createdTokens[0];
                            console.log("BLACKSMITH | Encounter Toolbar: Created token:", token);
                            console.log("BLACKSMITH | Encounter Toolbar: Token position:", {x: token.x, y: token.y});
                            console.log("BLACKSMITH | Encounter Toolbar: Token visible:", token.visible);
                            console.log("BLACKSMITH | Encounter Toolbar: Token actor:", token.actor);
                            console.log("BLACKSMITH | Encounter Toolbar: Token actorId:", token.actorId);
                        }
                        
                        // Add some offset for multiple monsters
                        position.x += 100;
                    }
                } catch (error) {
                    console.error(`BLACKSMITH | Encounter Toolbar: Failed to deploy monster ${monsterId}:`, error);
                }
            }

            ui.notifications.info(`Deployed ${metadata.monsters.length} monsters.`);
            
        } catch (error) {
            console.error("BLACKSMITH | Encounter Toolbar: Error deploying monsters:", error);
            ui.notifications.error("Failed to deploy monsters.");
        }
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
                
                // Snap to grid
                let position = canvas.grid.getSnappedPoint(localPoint.x, localPoint.y);
                console.log("BLACKSMITH | Encounter Toolbar: getSnappedPoint result:", position);
                
                // If that fails, fall back to the deprecated but working method
                if (!position) {
                    console.log("BLACKSMITH | Encounter Toolbar: getSnappedPoint failed, trying getSnappedPosition");
                    position = canvas.grid.getSnappedPosition(localPoint.x, localPoint.y);
                    console.log("BLACKSMITH | Encounter Toolbar: getSnappedPosition result:", position);
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

    static async _rollInitiative(metadata) {
        if (!metadata.monsters || metadata.monsters.length === 0) {
            ui.notifications.warn("No monsters found in encounter data.");
            return;
        }

        try {
            // Roll initiative for each monster
            for (const monsterId of metadata.monsters) {
                try {
                    const actor = await fromUuid(monsterId);
                    if (actor) {
                        await actor.rollInitiative();
                    }
                } catch (error) {
                    console.warn(`Failed to roll initiative for ${monsterId}:`, error);
                }
            }

            ui.notifications.info("Initiative rolled for all monsters.");
            
        } catch (error) {
            console.error("Error rolling initiative:", error);
            ui.notifications.error("Failed to roll initiative.");
        }
    }

    static async _createCombat(metadata) {
        if (!metadata.monsters || metadata.monsters.length === 0) {
            ui.notifications.warn("No monsters found in encounter data.");
            return;
        }

        try {
            // First deploy the monsters to get tokens on the canvas
            await this._deployMonsters(metadata);
            
            // Wait a moment for tokens to be created
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Create a new combat encounter
            const combat = await Combat.create({
                scene: canvas.scene.id,
                name: metadata.title || "Encounter",
                active: true
            });

            // Add deployed tokens to combat
            const deployedTokens = canvas.tokens.placeables.filter(token => 
                metadata.monsters.some(monsterId => {
                    const actorId = monsterId.split('.').pop(); // Extract actor ID from UUID
                    return token.actor?.id === actorId;
                })
            );

            for (const token of deployedTokens) {
                try {
                    await combat.createEmbeddedDocuments("Combatant", [{
                        tokenId: token.id,
                        actorId: token.actor.id,
                        sceneId: canvas.scene.id
                    }]);
                } catch (error) {
                    console.warn(`Failed to add ${token.name} to combat:`, error);
                }
            }

            ui.notifications.info("Combat encounter created with deployed monsters.");
            
        } catch (error) {
            console.error("Error creating combat:", error);
            ui.notifications.error("Failed to create combat encounter.");
        }
    }
}