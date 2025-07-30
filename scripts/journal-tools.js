// ================================================================== 
// ===== JOURNAL TOOLS ==============================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class JournalTools {
    
    static init() {
        // Listen for journal sheet rendering
        Hooks.on('renderJournalSheet', this._onRenderJournalSheet.bind(this));
        
        // Listen for setting changes
        Hooks.on('settingChange', this._onSettingChange.bind(this));
    }

    // Hook for setting changes
    static _onSettingChange(moduleId, key, value) {
        if (moduleId === MODULE_ID && key === 'enableJournalTools') {
            // Refresh all open journal sheets when setting changes
            Object.values(ui.windows).forEach(window => {
                if (window instanceof JournalSheet) {
                    window.render(true);
                }
            });
        }
    }

    // Hook for journal sheet rendering
    static async _onRenderJournalSheet(app, html, data) {
        // Check if journal tools are enabled
        if (!game.settings.get(MODULE_ID, 'enableJournalTools')) {
            return;
        }

        // Only add tools icon in normal view, not edit view
        if (this._isEditMode(html)) {
            return;
        }

        // Store the app instance for later use
        html.data('journal-app', app);

        // Add the tools icon to the window header
        this._addToolsIcon(html);
    }

    // Helper method to check if we're in edit mode
    static _isEditMode(html) {
        return html.find('.editor-container').length > 0;
    }

    // Add the tools icon to the journal window header
    static _addToolsIcon(html) {
        // Find the window header
        const windowHeader = html.find('.window-header');
        if (!windowHeader.length) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: No window header found", "", false, true, false);
            return;
        }

        // Check if tools icon already exists
        const existingToolsIcon = windowHeader.find('.journal-tools-icon');
        if (existingToolsIcon.length > 0) {
            return; // Already added
        }

        // Debug: Log the HTML structure
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Adding icon to header", `Header found: ${windowHeader.length}`, false, true, false);

        // Create the tools icon
        const toolsIcon = $(`
            <a class="journal-tools-icon" title="Journal Tools" style="cursor: pointer; margin-left: 8px;">
                <i class="fas fa-feather"></i>
            </a>
        `);

        // Add click handler
        toolsIcon.on('click', (event) => {
            event.preventDefault();
            this._openToolsDialog(html);
        });

        // Insert the icon before the close button (if it exists) or at the end
        const closeButton = windowHeader.find('.header-button.close');
        const configureButton = windowHeader.find('.header-button.configure-sheet');
        
        // Try to place it before the close button, then before configure button, then at the end
        if (closeButton.length > 0) {
            closeButton.before(toolsIcon);
        } else if (configureButton.length > 0) {
            configureButton.before(toolsIcon);
        } else {
            windowHeader.append(toolsIcon);
        }

        postConsoleAndNotification("BLACKSMITH | Journal Tools: Added tools icon to journal window", "", false, true, false);
    }

    // Open the tools dialog
    static _openToolsDialog(html) {
        // Get the journal entry - try multiple methods
        let journal = null;
        let journalId = null;

        // Method 0: Try to get from stored app instance (most reliable)
        const storedApp = html.data('journal-app');
        if (storedApp && storedApp.document) {
            journal = storedApp.document;
            journalId = journal.id;
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Found journal from stored app", `Journal: ${journal.name}`, false, true, false);
        }

        // Method 1: Try to get from the app instance
        if (!journal) {
            const journalSheet = html.closest('.journal-sheet');
            if (journalSheet.length > 0) {
                journalId = journalSheet.data('document-id');
                if (journalId) {
                    journal = game.journal.get(journalId);
                }
            }
        }

        // Method 2: Try to find any element with data-document-id
        if (!journal) {
            const journalElement = html.find('[data-document-id]').first();
            if (journalElement.length > 0) {
                journalId = journalElement.data('document-id');
                if (journalId) {
                    journal = game.journal.get(journalId);
                }
            }
        }

        // Method 3: Try to get from the window header
        if (!journal) {
            const windowHeader = html.find('.window-header');
            if (windowHeader.length > 0) {
                journalId = windowHeader.data('document-id');
                if (journalId) {
                    journal = game.journal.get(journalId);
                }
            }
        }

        // Method 4: Try to get from the app instance directly
        if (!journal) {
            // Look for any journal sheet in the UI windows
            Object.values(ui.windows).forEach(window => {
                if (window instanceof JournalSheet && window.element && window.element[0] === html[0]) {
                    journal = window.document;
                    journalId = journal.id;
                }
            });
        }

        if (!journal) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Could not find journal entry", `Tried multiple methods, no journal found`, false, false, true);
            return;
        }

        postConsoleAndNotification("BLACKSMITH | Journal Tools: Found journal", `Journal: ${journal.name} (ID: ${journalId})`, false, true, false);

        // Create dialog content
        const dialogContent = `
            <div class="journal-tools-dialog">
                <div class="form-group">
                    <label for="tool-type">Select Tool:</label>
                    <select id="tool-type" class="journal-tools-select">
                        <option value="upgrade-actors">Upgrade Actor Links</option>
                        <option value="upgrade-items">Upgrade Item Links</option>
                    </select>
                </div>
            </div>
        `;

        // Create and show the dialog
        const dialog = new Dialog({
            title: "Journal Tools",
            content: dialogContent,
            buttons: {
                submit: {
                    icon: "<i class='fas fa-magic'></i>",
                    label: "Submit",
                    callback: async (html) => {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Submit button clicked", "", false, true, false);
                        
                        const toolType = html.find('#tool-type').val();
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Selected tool type", toolType, false, true, false);
                        
                        try {
                            await this._processToolRequest(journal, toolType);
                        } catch (error) {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error in submit handler", error, false, false, true);
                        }
                    }
                },
                cancel: {
                    icon: "<i class='fa-solid fa-rectangle-xmark'></i>",
                    label: "Cancel",
                    callback: () => {}
                }
            },
            default: "submit",
            close: () => {}
        });

        try {
            dialog.render(true);
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Dialog opened successfully", "", false, true, false);
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error opening dialog", error, false, false, true);
        }
    }

    // Process the tool request
    static async _processToolRequest(journal, toolType) {
        try {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing tool request", `Type: ${toolType}, Journal: ${journal.name}`, false, true, false);

            if (!journal) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: No journal provided", "", false, false, true);
                return;
            }

            switch (toolType) {
                case 'upgrade-actors':
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting actor upgrade", "", false, true, false);
                    await this._upgradeActorLinks(journal);
                    break;
                case 'upgrade-items':
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting item upgrade", "", false, true, false);
                    await this._upgradeItemLinks(journal);
                    break;
                default:
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Unknown tool type", toolType, false, false, true);
            }
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error processing tool request", error, false, false, true);
        }
    }

    // Upgrade actor links in the journal
    static async _upgradeActorLinks(journal) {
        try {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting actor link upgrade", `Journal: ${journal.name}`, false, true, false);
            
            // Get all pages in the journal
            const pages = journal.pages.contents;
            let totalUpgraded = 0;
            let totalSkipped = 0;
            let totalErrors = 0;
            
            for (const page of pages) {
                const pageContent = page.text.content;
                if (!pageContent) continue;
                
                // Scan for actor links in this page
                const actorLinks = this._scanJournalForActorLinks(pageContent);
                
                if (actorLinks.length === 0) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: No actor links found in page", page.name, false, true, false);
                    continue;
                }
                
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found actor links in page", `${actorLinks.length} links in ${page.name}`, false, true, false);
                
                let pageContentUpdated = pageContent;
                let pageUpgraded = 0;
                let pageSkipped = 0;
                
                // Process each actor link
                for (const link of actorLinks) {
                    try {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing link", `Actor: "${link.actorName}", UUID: ${link.uuid}`, false, true, false);
                        
                        const result = await this._upgradeActorLink(link, pageContentUpdated);
                        if (result.success) {
                            pageContentUpdated = result.newContent;
                            pageUpgraded++;
                            totalUpgraded++;
                        } else {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Link upgrade failed", `${link.actorName}: ${result.reason}`, false, true, false);
                            pageSkipped++;
                            totalSkipped++;
                        }
                    } catch (error) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Error upgrading actor link", `${link.actorName}: ${error.message}`, false, false, true);
                        pageSkipped++;
                        totalErrors++;
                    }
                }
                
                // Update the page if any links were upgraded
                if (pageUpgraded > 0) {
                    await page.update({ text: { content: pageContentUpdated } });
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Updated page", `${page.name}: ${pageUpgraded} upgraded, ${pageSkipped} skipped`, false, true, false);
                }
            }
            
            // Final summary
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Actor link upgrade complete", 
                `Total: ${totalUpgraded} upgraded, ${totalSkipped} skipped, ${totalErrors} errors`, false, true, false);
                
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error during actor link upgrade", error, false, false, true);
        }
    }

    // Upgrade item links in the journal
    static async _upgradeItemLinks(journal) {
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Item link upgrade functionality will be implemented in the next phase", "", false, true, false);
        
        // TODO: Implement item link upgrading
        // 1. Scan journal content for item UUIDs
        // 2. Validate UUIDs against compendiums
        // 3. Update links to point to compendium entries
        // 4. Save the journal entry
    }

    // Scan journal content for actor links
    static _scanJournalForActorLinks(content) {
        const actorLinks = [];
        
        // Regex to find @UUID patterns with Actor type
        const uuidRegex = /@UUID\[([^\]]+)\]\{([^}]+)\}/gi;
        let match;
        
        while ((match = uuidRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const uuid = match[1];
            const actorName = match[2];
            
            // Check if this is an Actor UUID (case insensitive)
            if (uuid.toLowerCase().includes('actor')) {
                actorLinks.push({
                    fullMatch,
                    uuid,
                    actorName,
                    startIndex: match.index,
                    endIndex: match.index + fullMatch.length
                });
            }
        }
        
        // Sort by startIndex in descending order to avoid position shifting issues
        actorLinks.sort((a, b) => b.startIndex - a.startIndex);
        
        return actorLinks;
    }

    // Upgrade a single actor link
    static async _upgradeActorLink(link, content) {
        try {
            // Find the actor in compendiums
            const newUuid = await this._findActorInCompendiums(link.actorName);
            
            if (!newUuid) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Actor not found in compendiums", link.actorName, false, true, false);
                return { success: false, reason: 'Actor not found in compendiums' };
            }
            
            // Create new UUID link
            const newLink = `@UUID[${newUuid}]{${link.actorName}}`;
            
            // Replace the old link with the new one
            const newContent = content.substring(0, link.startIndex) + 
                             newLink + 
                             content.substring(link.endIndex);
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Upgraded actor link", 
                `${link.actorName}: ${link.uuid} → ${newUuid}`, false, true, false);
            
            return { success: true, newContent };
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error upgrading actor link", 
                `${link.actorName}: ${error.message}`, false, false, true);
            return { success: false, reason: error.message };
        }
    }

    // Find actor in compendiums
    static async _findActorInCompendiums(actorName) {
        try {
            const searchWorldActorsFirst = game.settings.get(MODULE_ID, 'searchWorldActorsFirst') || false;
            
            // Clean up the actor name (same logic as buildCompendiumLinkActor)
            const strActorName = actorName.replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)|\s*\(CR\s*[0-9/]+\)/g, '').trim();
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Searching for actor", `Original: "${actorName}" -> Cleaned: "${strActorName}"`, false, true, false);
            
            // Search world actors first if enabled
            if (searchWorldActorsFirst) {
                let foundActor;
                try {
                    foundActor = game.actors.getName(strActorName);
                } catch (error) {
                    foundActor = null;
                }
                if (foundActor) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found actor in world", strActorName, false, true, false);
                    return `Actor.${foundActor.system._id}`;
                }
            }
            
            // Check up to 8 compendium settings in order (same as buildCompendiumLinkActor)
            for (let i = 1; i <= 8; i++) {
                const compendiumSetting = game.settings.get(MODULE_ID, `monsterCompendium${i}`);
                if (!compendiumSetting || compendiumSetting === 'none') continue;
                
                const compendium = game.packs.get(compendiumSetting);
                if (compendium) {
                    let index = await compendium.getIndex();
                    let entry = index.find(e => e.name === strActorName);
                    if (entry) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Found actor in compendium", `${strActorName} in ${compendiumSetting}`, false, true, false);
                        return `Compendium.${compendiumSetting}.Actor.${entry._id}`;
                    }
                }
            }
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Actor not found in any compendium", strActorName, false, true, false);
            return null; // Not found
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error finding actor in compendiums", error, false, false, true);
            return null;
        }
    }

} 