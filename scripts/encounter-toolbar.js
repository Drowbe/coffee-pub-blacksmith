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



        // Check if toolbar already exists, if not create it
        let toolbar = html.find('.encounter-toolbar');
        if (toolbar.length === 0) {
            // Create the toolbar container
            const journalHeader = html.find('.journal-header');
            const journalEntryPages = html.find('.journal-entry-pages');
            
            if (journalHeader.length && journalEntryPages.length) {
                const toolbarContainer = $('<div class="encounter-toolbar"></div>');
                journalHeader.after(toolbarContainer);
                toolbar = toolbarContainer;
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Created toolbar container", "", false, true, false);
            } else {
                return; // Can't create toolbar
            }
        }

        // Look for metadata div inside the journal page content section (the green-circled area)
        let metadataDiv = html.find('section.journal-page-content div[data-journal-metadata]');
        
        // Debug: Let's see what we're finding
        postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Looking for metadata", `Found ${metadataDiv.length} metadata divs`, false, true, false);
        
        // Also try looking in the document as a fallback
        if (metadataDiv.length === 0) {
            const docMetadataDiv = $(document).find('section.journal-page-content div[data-journal-metadata]');
            postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Fallback search in document", `Found ${docMetadataDiv.length} metadata divs`, false, true, false);
            
            if (docMetadataDiv.length > 0) {
                // Use the document version if html doesn't have it
                metadataDiv = docMetadataDiv;
            }
        }
        
        if (metadataDiv.length > 0) {
            const journalType = metadataDiv.data('journal-type');
            if (journalType && journalType.toLowerCase() === 'encounter') {
                // We have encounter data - use the full toolbar
                postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Found encounter metadata, updating toolbar", "", false, true, false);
                
                try {
                    // Parse the metadata
                    const encodedData = metadataDiv.data('journal-metadata');
                    const metadata = JSON.parse(decodeURIComponent(encodedData));
                    
                    // Check if we have monsters
                    const hasMonsters = metadata.monsters && metadata.monsters.length > 0;
                    
                    // Determine difficulty class for styling
                    let difficultyClass = '';
                    if (metadata.difficulty) {
                        const difficulty = metadata.difficulty.toLowerCase();
                        if (difficulty.includes('easy')) difficultyClass = 'easy';
                        else if (difficulty.includes('medium')) difficultyClass = 'medium';
                        else if (difficulty.includes('hard')) difficultyClass = 'hard';
                        else if (difficulty.includes('deadly')) difficultyClass = 'deadly';
                    }

                    // Get the template
                    const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
                    getCachedTemplate(templatePath).then(template => {
                        // Prepare the data for the template
                        const templateData = {
                            journalId: metadataDiv.closest('.journal-sheet').data('document-id') || 'unknown',
                            hasMonsters,
                            difficulty: metadata.difficulty,
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
                    postConsoleAndNotification("BLACKSMITH | Encounter Toolbar: Error processing encounter metadata", error, false, true, false);
                    // Fall through to create "no encounter" toolbar
                }
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
        // Deploy monsters button
        html.find('.deploy-monsters').click(async (event) => {
            event.preventDefault();
            this._deployMonsters(metadata);
        });
        
        // Roll initiative button
        html.find('.roll-initiative').click(async (event) => {
            event.preventDefault();
            this._rollInitiative(metadata);
        });
        
        // Create combat button
        html.find('.create-combat').click(async (event) => {
            event.preventDefault();
            this._createCombat(metadata);
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
            for (const monsterId of metadata.monsters) {
                try {
                    const actor = await fromUuid(monsterId);
                    if (actor) {
                        const token = await actor.getActiveTokens().pop() || await actor.getToken();
                        if (token) {
                            // Create the token at the target position
                            await token.document.update({
                                x: position.x,
                                y: position.y
                            });
                            
                            // Add some offset for multiple monsters
                            position.x += 100;
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to deploy monster ${monsterId}:`, error);
                }
            }

            ui.notifications.info(`Deployed ${metadata.monsters.length} monsters.`);
            
        } catch (error) {
            console.error("Error deploying monsters:", error);
            ui.notifications.error("Failed to deploy monsters.");
        }
    }

    static async _getTargetPosition() {
        return new Promise((resolve) => {
            ui.notifications.info("Click on the canvas to place monsters.");
            
            const handler = (event) => {
                event.preventDefault();
                const position = canvas.grid.getSnappedPosition(event.data.x, event.data.y);
                canvas.app.stage.off('click', handler);
                resolve(position);
            };
            
            canvas.app.stage.on('click', handler);
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
            // Create a new combat encounter
            const combat = await Combat.create({
                scene: canvas.scene.id,
                name: metadata.title || "Encounter",
                active: true
            });

            // Add monsters to combat
            for (const monsterId of metadata.monsters) {
                try {
                    const actor = await fromUuid(monsterId);
                    if (actor) {
                        const token = await actor.getActiveTokens().pop() || await actor.getToken();
                        if (token) {
                            await combat.createEmbeddedDocuments("Combatant", [{
                                tokenId: token.id,
                                actorId: actor.id,
                                sceneId: canvas.scene.id
                            }]);
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to add ${monsterId} to combat:`, error);
                }
            }

            ui.notifications.info("Combat encounter created.");
            
        } catch (error) {
            console.error("Error creating combat:", error);
            ui.notifications.error("Failed to create combat encounter.");
        }
    }
}