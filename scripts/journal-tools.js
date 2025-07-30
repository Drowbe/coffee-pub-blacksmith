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
                <div class="form-group">
                    <button id="submit-tools" type="button" class="journal-tools-submit">
                        <i class="fas fa-magic"></i> Submit
                    </button>
                </div>
            </div>
        `;

        // Create and show the dialog
        const dialog = new Dialog({
            title: "Journal Tools",
            content: dialogContent,
            buttons: {
                cancel: {
                    icon: "<i class='fa-solid fa-rectangle-xmark'></i>",
                    label: "Cancel",
                    callback: () => {}
                }
            },
            default: "cancel",
            close: () => {}
        });

        try {
            dialog.render(true);
            
            // Add event listener for submit button
            dialog.element.find('#submit-tools').on('click', async () => {
                const toolType = dialog.element.find('#tool-type').val();
                await this._processToolRequest(journal, toolType);
                dialog.close();
            });
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Dialog opened successfully", "", false, true, false);
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error opening dialog", error, false, false, true);
        }
    }

    // Process the tool request
    static async _processToolRequest(journal, toolType) {
        try {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing tool request", `Type: ${toolType}, Journal: ${journal.name}`, false, true, false);

            switch (toolType) {
                case 'upgrade-actors':
                    await this._upgradeActorLinks(journal);
                    break;
                case 'upgrade-items':
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
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Actor link upgrade functionality will be implemented in the next phase", "", false, true, false);
        
        // TODO: Implement actor link upgrading
        // 1. Scan journal content for actor UUIDs
        // 2. Validate UUIDs against compendiums
        // 3. Update links to point to compendium entries
        // 4. Save the journal entry
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
} 