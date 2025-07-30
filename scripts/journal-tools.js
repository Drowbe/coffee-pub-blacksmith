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
                
                // Debug: Show the content we're working with
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Page content preview", 
                    `Page: ${page.name}, Content length: ${pageContent.length}`, false, true, false);
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Content sample", 
                    pageContent.substring(0, 500) + "...", false, true, false);
                
                // Scan for existing actor links in this page
                const actorLinks = this._scanJournalForActorLinks(pageContent);
                
                // Scan for plain text monsters in bullet lists
                const bulletListMonsters = this._scanJournalForBulletListMonsters(pageContent);
                
                // Scan for manual link requests
                const manualLinkMonsters = this._scanJournalForManualLinkMonsters(pageContent);
                
                // Also try to find monsters in the HTML content if available
                const htmlMonsters = this._scanJournalForHtmlMonsters(page);
                const allMonsters = [...actorLinks, ...bulletListMonsters, ...manualLinkMonsters, ...htmlMonsters];
                
                if (allMonsters.length === 0) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: No monsters found in page", page.name, false, true, false);
                    continue;
                }
                
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found monsters in page", 
                    `${actorLinks.length} existing links, ${bulletListMonsters.length} bullet list monsters, ${manualLinkMonsters.length} manual link requests, ${htmlMonsters.length} HTML monsters in ${page.name}`, false, true, false);
                
                let pageContentUpdated = pageContent;
                let pageUpgraded = 0;
                let pageSkipped = 0;
                
                // Sort all monsters by startIndex in descending order to avoid position shifting issues
                allMonsters.sort((a, b) => b.startIndex - a.startIndex);
                
                // Process each monster
                for (const monster of allMonsters) {
                    try {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing monster", 
                            `Type: ${monster.type}, Name: "${monster.actorName}"`, false, true, false);
                        
                        const result = await this._upgradeActorLink(monster, pageContentUpdated);
                        if (result.success) {
                            pageContentUpdated = result.newContent;
                            pageUpgraded++;
                            totalUpgraded++;
                        } else {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Monster upgrade failed", 
                                `${monster.actorName}: ${result.reason}`, false, true, false);
                            pageSkipped++;
                            totalSkipped++;
                        }
                    } catch (error) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Error upgrading monster", 
                            `${monster.actorName}: ${error.message}`, false, false, true);
                        pageSkipped++;
                        totalErrors++;
                    }
                }
                
                // Update the page if any monsters were upgraded
                if (pageUpgraded > 0) {
                    await page.update({ text: { content: pageContentUpdated } });
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Updated page", 
                        `${page.name}: ${pageUpgraded} upgraded, ${pageSkipped} skipped`, false, true, false);
                }
            }
            
            // Final summary
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Actor link upgrade complete", 
                `Total: ${totalUpgraded} upgraded, ${totalSkipped} skipped, ${totalErrors} errors`, false, true, false);
                
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error during actor link upgrade", error, false, false, true);
        }
    }

    // Upgrade a single item link
    static async _upgradeItemLink(link, content) {
        try {
            // Find the item in compendiums
            const newUuid = await this._findItemInCompendiums(link.itemName);
            
            if (!newUuid) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Item not found in compendiums", link.itemName, false, true, false);
                return { success: false, reason: 'Item not found in compendiums' };
            }
            
            // Create new UUID link
            const newLink = `@UUID[${newUuid}]{${link.itemName}}`;
            
            // For HTML content items, we need to be more careful about replacement
            if (link.type === 'html-content') {
                // Use the stored <li> tag boundaries
                if (link.liStart !== undefined && link.liEnd !== undefined) {
                    // Get the full <li> content
                    const fullLi = content.substring(link.liStart, link.liEnd);
                    
                    // Replace just the item name within the <li> tag
                    const beforeItem = fullLi.substring(0, link.startIndex - link.liStart);
                    const afterItem = fullLi.substring(link.endIndex - link.liStart);
                    const newLi = beforeItem + newLink + afterItem;
                    
                    // Replace the entire <li> tag
                    const newContent = content.substring(0, link.liStart) + newLi + content.substring(link.liEnd);
                    
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Upgraded HTML item", 
                        `${link.itemName}: plain text → ${newUuid}`, false, true, false);
                    
                    return { success: true, newContent };
                }
            }
            
            // For other types, use the standard replacement
            const newContent = content.substring(0, link.startIndex) + 
                             newLink + 
                             content.substring(link.endIndex);
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Upgraded item link", 
                `${link.itemName}: ${link.uuid || 'plain text'} → ${newUuid}`, false, true, false);
            
            return { success: true, newContent };
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error upgrading item link", 
                `${link.itemName}: ${error.message}`, false, false, true);
            return { success: false, reason: error.message };
        }
    }

    // Find item in compendiums
    static async _findItemInCompendiums(itemName) {
        try {
            const searchWorldItemsFirst = game.settings.get(MODULE_ID, 'searchWorldItemsFirst') || false;
            
            // Clean up the item name (same logic as buildCompendiumLinkItem)
            let strItemName = itemName.replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)|\s*\(CR\s*[0-9/]+\)/g, '').trim();
            
            // Handle colon-separated items (like "Gem: Diamond")
            if (strItemName.includes(':')) {
                const parts = strItemName.split(':');
                if (parts.length >= 2) {
                    strItemName = parts[1].trim();
                }
            }
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Searching for item", `Original: "${itemName}" -> Cleaned: "${strItemName}"`, false, true, false);
            
            // Search world items first if enabled
            if (searchWorldItemsFirst) {
                let foundItem;
                try {
                    foundItem = game.items.getName(strItemName);
                } catch (error) {
                    foundItem = null;
                }
                if (foundItem) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found item in world", 
                        `${strItemName} in world items`, false, true, false);
                    return foundItem.uuid;
                }
            }
            
            // Debug: Show all available compendiums
            const allPacks = Array.from(game.packs.entries()).filter(([key, pack]) => pack.documentName === 'Item');
            const packNames = allPacks.map(([key, pack]) => `${key} (${pack.metadata.label})`);
            postConsoleAndNotification("BLACKSMITH | Journal Tools: All available item compendiums", 
                packNames.join(', '), false, true, false);
            
            // Search compendiums in order
            for (let i = 1; i <= 8; i++) {
                const compendiumKey = `itemCompendium${i}`;
                const compendiumName = game.settings.get(MODULE_ID, compendiumKey);
                
                if (!compendiumName) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: No item compendium configured", 
                        `itemCompendium${i} not set`, false, true, false);
                    continue;
                }
                
                try {
                    const pack = game.packs.get(compendiumName);
                    if (!pack) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Item compendium not found", 
                            `${compendiumName}`, false, true, false);
                        continue;
                    }
                    
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Got pack", 
                        `${compendiumName} - pack type: ${pack.constructor.name}`, false, true, false);
                    
                    const index = await pack.getIndex();
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Got index", 
                        `${compendiumName} - index type: ${index ? index.constructor.name : 'null'}`, false, true, false);
                    
                    // Debug: Show first few entries for Tasha's compendium
                    if (compendiumName === 'dnd-tashas-cauldron.tcoe-magic-items' && index) {
                        const entries = Array.from(index.values ? index.values() : index);
                        const firstFew = entries.slice(0, 5).map(e => `${e.name} (${e.type})`);
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: First few entries in Tasha's", 
                            firstFew.join(', '), false, true, false);
                        
                        // Also check if Primal Fruit exists in this compendium
                        const primalFruitEntry = entries.find(e => e.name.toLowerCase().includes('primal fruit'));
                        if (primalFruitEntry) {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Found Primal Fruit in Tasha's", 
                                `${primalFruitEntry.name} (${primalFruitEntry.type})`, false, true, false);
                        } else {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Primal Fruit not in Tasha's magic items", 
                                `Searched ${entries.length} entries`, false, true, false);
                        }
                    }
                    
                    // Try exact match first (don't check type - any entry in item compendium is an item)
                    let entry = index.find(e => 
                        e.name.toLowerCase() === strItemName.toLowerCase()
                    );
                    
                    // If no exact match, try partial match
                    if (!entry) {
                        entry = index.find(e => 
                            e.name.toLowerCase().includes(strItemName.toLowerCase())
                        );
                    }
                    
                    // If still no match, try reverse partial match
                    if (!entry) {
                        entry = index.find(e => 
                            strItemName.toLowerCase().includes(e.name.toLowerCase())
                        );
                    }
                    
                    if (entry) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Found item in compendium", 
                            `${strItemName} -> ${entry.name} in ${compendiumName}`, false, true, false);
                        return `Compendium.${compendiumName}.Item.${entry._id}`;
                    } else {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Item not found in compendium", 
                            `${strItemName} not found in ${compendiumName}`, false, true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Error searching compendium", 
                        `${compendiumName}: ${error.message}`, false, true, false);
                }
            }
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Item not found in any compendium", strItemName, false, true, false);
            return null;
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error finding item in compendiums", 
                `${itemName}: ${error.message}`, false, false, true);
            return null;
        }
    }

    // Upgrade item links in the journal
    static async _upgradeItemLinks(journal) {
        try {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting item link upgrade", `Journal: ${journal.name}`, false, true, false);
            
            // Get all pages in the journal
            const pages = journal.pages.contents;
            let totalUpgraded = 0;
            let totalSkipped = 0;
            let totalErrors = 0;
            
            for (const page of pages) {
                const pageContent = page.text.content;
                if (!pageContent) continue;
                
                // Debug: Show the content we're working with
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Page content preview", 
                    `Page: ${page.name}, Content length: ${pageContent.length}`, false, true, false);
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Content sample", 
                    pageContent.substring(0, 500) + "...", false, true, false);
                
                // Scan for existing item links in this page
                const itemLinks = this._scanJournalForItemLinks(pageContent);
                
                // Scan for plain text items in bullet lists
                const bulletListItems = this._scanJournalForBulletListItems(pageContent);
                
                // Scan for manual link requests
                const manualLinkItems = this._scanJournalForManualLinkItems(pageContent);
                
                // Also try to find items in the HTML content if available
                const htmlItems = this._scanJournalForHtmlItems(page);
                const allItems = [...itemLinks, ...bulletListItems, ...manualLinkItems, ...htmlItems];
                
                if (allItems.length === 0) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: No items found in page", page.name, false, true, false);
                    continue;
                }
                
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found items in page", 
                    `${itemLinks.length} existing links, ${bulletListItems.length} bullet list items, ${manualLinkItems.length} manual link requests, ${htmlItems.length} HTML items in ${page.name}`, false, true, false);
                
                let pageContentUpdated = pageContent;
                let pageUpgraded = 0;
                let pageSkipped = 0;
                
                // Sort all items by startIndex in descending order to avoid position shifting issues
                allItems.sort((a, b) => b.startIndex - a.startIndex);
                
                // Process each item
                for (const item of allItems) {
                    try {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing item", 
                            `Type: ${item.type}, Name: "${item.itemName}"`, false, true, false);
                        
                        const result = await this._upgradeItemLink(item, pageContentUpdated);
                        if (result.success) {
                            pageContentUpdated = result.newContent;
                            pageUpgraded++;
                            totalUpgraded++;
                        } else {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Item upgrade failed", 
                                `${item.itemName}: ${result.reason}`, false, true, false);
                            pageSkipped++;
                            totalSkipped++;
                        }
                    } catch (error) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Error upgrading item", 
                            `${item.itemName}: ${error.message}`, false, false, true);
                        pageSkipped++;
                        totalErrors++;
                    }
                }
                
                // Update the page if any items were upgraded
                if (pageUpgraded > 0) {
                    await page.update({ text: { content: pageContentUpdated } });
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Updated page", 
                        `${page.name}: ${pageUpgraded} upgraded, ${pageSkipped} skipped`, false, true, false);
                }
            }
            
            // Final summary
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Item link upgrade complete", 
                `Total: ${totalUpgraded} upgraded, ${totalSkipped} skipped, ${totalErrors} errors`, false, true, false);
                
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error during item link upgrade", error, false, false, true);
        }
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
                    endIndex: match.index + fullMatch.length,
                    type: 'existing-link'
                });
            }
        }
        
        // Also find @Actor patterns
        const actorRegex = /@Actor\[([^\]]+)\]\{([^}]+)\}/gi;
        while ((match = actorRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const uuid = match[1];
            const actorName = match[2];
            
            actorLinks.push({
                fullMatch,
                uuid,
                actorName,
                startIndex: match.index,
                endIndex: match.index + fullMatch.length,
                type: 'existing-link'
            });
        }
        
        // Sort by startIndex in descending order to avoid position shifting issues
        actorLinks.sort((a, b) => b.startIndex - a.startIndex);
        
        return actorLinks;
    }

    // Scan journal content for plain text monsters in bullet lists
    static _scanJournalForBulletListMonsters(content) {
        const bulletListMonsters = [];
        
        // Split content into lines
        const lines = content.split('\n');
        let inEncounterSection = false;
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Scanning content", `Total lines: ${lines.length}`, false, true, false);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Debug: log each line
            if (line.length > 0) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing line", `Line ${i}: "${line}"`, false, true, false);
            }
            
            // Check if we're in an encounter section
            if (this._isEncounterHeading(line)) {
                inEncounterSection = true;
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found encounter section", line, false, true, false);
                continue;
            }
            
            // If we're in an encounter section, look for bullet list items or plain text monsters
            if (inEncounterSection) {
                let monsterName = null;
                let isBulletItem = false;
                
                // Check if it's a bullet list item
                if (this._isBulletListItem(line)) {
                    monsterName = this._extractMonsterNameFromBullet(line);
                    isBulletItem = true;
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found bullet item", `"${line}" -> "${monsterName}"`, false, true, false);
                }
                // Check if it's a plain text monster (not empty, not a heading, not already a link)
                else if (line.length > 0 && !this._isHeading(line) && !this._isExistingLink(line)) {
                    monsterName = this._extractMonsterNameFromPlainText(line);
                    if (monsterName) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Found plain text monster", `"${line}" -> "${monsterName}"`, false, true, false);
                    }
                }
                
                if (monsterName) {
                    // Find the position of this line in the original content
                    const lineStart = content.indexOf(lines[i]);
                    const monsterStart = lineStart + lines[i].indexOf(monsterName);
                    const monsterEnd = monsterStart + monsterName.length;
                    
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found monster in encounter section", 
                        `${isBulletItem ? 'Bullet' : 'Plain text'}: "${monsterName}"`, false, true, false);
                    
                    bulletListMonsters.push({
                        fullMatch: monsterName,
                        uuid: null,
                        actorName: monsterName,
                        startIndex: monsterStart,
                        endIndex: monsterEnd,
                        type: isBulletItem ? 'bullet-list' : 'plain-text'
                    });
                }
            }
        }
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Bullet list scan complete", 
            `Found ${bulletListMonsters.length} monsters`, false, true, false);
        
        return bulletListMonsters;
    }

    // Scan journal content for manual link requests
    static _scanJournalForManualLinkMonsters(content) {
        const manualLinkMonsters = [];
        
        // Regex to find text with "(link manually)" or similar (case insensitive)
        const manualLinkRegex = /([^(]+?)\s*\(link\s+manually\)/gi;
        let match;
        
        while ((match = manualLinkRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const monsterName = match[1].trim();
            
            if (monsterName) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found manual link request", 
                    `"${fullMatch}" -> "${monsterName}"`, false, true, false);
                
                manualLinkMonsters.push({
                    fullMatch,
                    uuid: null,
                    actorName: monsterName,
                    startIndex: match.index,
                    endIndex: match.index + fullMatch.length,
                    type: 'manual-link'
                });
            }
        }
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Manual link scan complete", 
            `Found ${manualLinkMonsters.length} manual link requests`, false, true, false);
        
        return manualLinkMonsters;
    }

    // Scan journal content for monsters in HTML format
    static _scanJournalForHtmlMonsters(page) {
        const htmlMonsters = [];
        
        try {
            // Try to get the rendered HTML content
            const htmlContent = page.text.content;
            if (!htmlContent) return htmlMonsters;
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Scanning HTML content", 
                `Content length: ${htmlContent.length}`, false, true, false);
            
            // Look for plain text in <li> tags that don't have links
            const liRegex = /<li[^>]*>([^<]*?)<\/li>/gi;
            let match;
            
            while ((match = liRegex.exec(htmlContent)) !== null) {
                const liContent = match[1].trim();
                
                // Skip if it's empty or contains links
                if (liContent === '' || liContent.includes('@UUID') || liContent.includes('@Actor')) {
                    continue;
                }
                
                // Check if it looks like a monster name
                const monsterName = this._extractMonsterNameFromPlainText(liContent);
                if (monsterName) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found HTML monster", 
                        `"${liContent}" -> "${monsterName}"`, false, true, false);
                    
                    htmlMonsters.push({
                        fullMatch: liContent,
                        uuid: null,
                        actorName: monsterName,
                        startIndex: match.index + match[0].indexOf(liContent),
                        endIndex: match.index + match[0].indexOf(liContent) + liContent.length,
                        type: 'html-content',
                        liStart: match.index,
                        liEnd: match.index + match[0].length
                    });
                }
            }
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: HTML scan complete", 
                `Found ${htmlMonsters.length} HTML monsters`, false, true, false);
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error scanning HTML", 
                error.message, false, false, true);
        }
        
        return htmlMonsters;
    }

    // Scan journal content for item links
    static _scanJournalForItemLinks(content) {
        const itemLinks = [];
        
        // Regex to find @UUID patterns with Item type
        const uuidRegex = /@UUID\[([^\]]+)\]\{([^}]+)\}/gi;
        let match;
        
        while ((match = uuidRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const uuid = match[1];
            const itemName = match[2];
            
            // Check if this is an Item UUID (case insensitive)
            if (uuid.toLowerCase().includes('item')) {
                itemLinks.push({
                    fullMatch,
                    uuid,
                    itemName,
                    startIndex: match.index,
                    endIndex: match.index + fullMatch.length,
                    type: 'existing-link'
                });
            }
        }
        
        // Also find @Item patterns
        const itemRegex = /@Item\[([^\]]+)\]\{([^}]+)\}/gi;
        while ((match = itemRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const uuid = match[1];
            const itemName = match[2];
            
            itemLinks.push({
                fullMatch,
                uuid,
                itemName,
                startIndex: match.index,
                endIndex: match.index + fullMatch.length,
                type: 'existing-link'
            });
        }
        
        // Sort by startIndex in descending order to avoid position shifting issues
        itemLinks.sort((a, b) => b.startIndex - a.startIndex);
        
        return itemLinks;
    }

    // Scan journal content for plain text items in bullet lists
    static _scanJournalForBulletListItems(content) {
        const bulletListItems = [];
        
        // Check if content is HTML
        if (content.includes('<') && content.includes('>')) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Content appears to be HTML, skipping plain text scan", 
                "Use HTML scan instead", false, true, false);
            return bulletListItems;
        }
        
        // Split content into lines
        const lines = content.split('\n');
        let inItemSection = false;
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Scanning content for items", `Total lines: ${lines.length}`, false, true, false);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Debug: log each line
            if (line.length > 0) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing line for items", `Line ${i}: "${line}"`, false, true, false);
            }
            
            // Check if we're in an item section
            if (this._isItemHeading(line)) {
                inItemSection = true;
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found item section", line, false, true, false);
                continue;
            }
            
            // Debug: log when we're in an item section
            if (inItemSection && line.length > 0) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: In item section, processing line", `"${line}"`, false, true, false);
            }
            
            // If we're in an item section, look for bullet list items or plain text items
            if (inItemSection) {
                let itemName = null;
                let isBulletItem = false;
                
                // Check if it's a bullet list item
                if (this._isBulletListItem(line)) {
                    itemName = this._extractItemNameFromBullet(line);
                    isBulletItem = true;
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found bullet item", `"${line}" -> "${itemName}"`, false, true, false);
                }
                // Check if it's a plain text item (not empty, not a heading, not already a link)
                else if (line.length > 0 && !this._isHeading(line) && !this._isExistingItemLink(line)) {
                    itemName = this._extractItemNameFromPlainText(line);
                    if (itemName) {
                        postConsoleAndNotification("BLACKSMITH | Journal Tools: Found plain text item", `"${line}" -> "${itemName}"`, false, true, false);
                    }
                }
                
                // Also check if it's a colon-separated item (like "Gold: 50 gp")
                if (!itemName && line.includes(':') && !this._isHeading(line) && !this._isExistingItemLink(line)) {
                    const colonParts = line.split(':');
                    if (colonParts.length >= 2) {
                        const potentialItem = colonParts[1].trim();
                        itemName = this._extractItemNameFromPlainText(potentialItem);
                        if (itemName) {
                            postConsoleAndNotification("BLACKSMITH | Journal Tools: Found colon-separated item", `"${line}" -> "${itemName}"`, false, true, false);
                        }
                    }
                }
                
                if (itemName) {
                    // Find the position of this line in the original content
                    const lineStart = content.indexOf(lines[i]);
                    const itemStart = lineStart + lines[i].indexOf(itemName);
                    const itemEnd = itemStart + itemName.length;
                    
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found item in item section", 
                        `${isBulletItem ? 'Bullet' : 'Plain text'}: "${itemName}"`, false, true, false);
                    
                    bulletListItems.push({
                        fullMatch: itemName,
                        uuid: null,
                        itemName: itemName,
                        startIndex: itemStart,
                        endIndex: itemEnd,
                        type: isBulletItem ? 'bullet-list' : 'plain-text'
                    });
                }
            }
        }
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Bullet list item scan complete", 
            `Found ${bulletListItems.length} items`, false, true, false);
        
        return bulletListItems;
    }

    // Scan journal content for manual item link requests
    static _scanJournalForManualLinkItems(content) {
        const manualLinkItems = [];
        
        // Regex to find text with "(link manually)" or similar (case insensitive)
        const manualLinkRegex = /([^(]+?)\s*\(link\s+manually\)/gi;
        let match;
        
        while ((match = manualLinkRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const itemName = match[1].trim();
            
            if (itemName) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found manual item link request", 
                    `"${fullMatch}" -> "${itemName}"`, false, true, false);
                
                manualLinkItems.push({
                    fullMatch,
                    uuid: null,
                    itemName: itemName,
                    startIndex: match.index,
                    endIndex: match.index + fullMatch.length,
                    type: 'manual-link'
                });
            }
        }
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Manual item link scan complete", 
            `Found ${manualLinkItems.length} manual item link requests`, false, true, false);
        
        return manualLinkItems;
    }

    // Scan journal content for items in HTML format
    static _scanJournalForHtmlItems(page) {
        const htmlItems = [];
        
        try {
            // Try to get the rendered HTML content
            const htmlContent = page.text.content;
            if (!htmlContent) return htmlItems;
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Scanning HTML content for items", 
                `Content length: ${htmlContent.length}`, false, true, false);
            
            // Look for plain text in <li> tags that don't have links
            const liRegex = /<li[^>]*>([^<]*?)<\/li>/gi;
            let match;
            
            while ((match = liRegex.exec(htmlContent)) !== null) {
                const liContent = match[1].trim();
                
                // Skip if it's empty or contains links
                if (liContent === '' || liContent.includes('@UUID') || liContent.includes('@Item')) {
                    continue;
                }
                
                // Check if it looks like an item name
                const itemName = this._extractItemNameFromPlainText(liContent);
                if (itemName) {
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Found HTML item", 
                        `"${liContent}" -> "${itemName}"`, false, true, false);
                    
                    htmlItems.push({
                        fullMatch: liContent,
                        uuid: null,
                        itemName: itemName,
                        startIndex: match.index + match[0].indexOf(liContent),
                        endIndex: match.index + match[0].indexOf(liContent) + liContent.length,
                        type: 'html-content',
                        liStart: match.index,
                        liEnd: match.index + match[0].length
                    });
                }
            }
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: HTML item scan complete", 
                `Found ${htmlItems.length} HTML items`, false, true, false);
            
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error scanning HTML for items", 
                error.message, false, false, true);
        }
        
        return htmlItems;
    }

    // Check if a line is an encounter heading
    static _isEncounterHeading(line) {
        const encounterKeywords = [
            'encounters and monsters',
            'encounters',
            'monsters and npcs',
            'monsters',
            'npcs',
            'enemies',
            'opponents'
        ];
        
        const lowerLine = line.toLowerCase();
        return encounterKeywords.some(keyword => lowerLine.includes(keyword));
    }

    // Check if a line is a bullet list item
    static _isBulletListItem(line) {
        return line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || line.startsWith('+');
    }

    // Extract monster name from bullet list item
    static _extractMonsterNameFromBullet(line) {
        // Remove bullet and common prefixes
        let monsterName = line.replace(/^[•\-*+]\s*/, '').trim();
        
        // Remove common suffixes like "(CR X)" or "(x2)" etc.
        monsterName = monsterName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        monsterName = monsterName.replace(/[.,;:]$/, '').trim();
        
        return monsterName.length > 0 ? monsterName : null;
    }

    // Extract monster name from plain text
    static _extractMonsterNameFromPlainText(line) {
        let monsterName = line.trim();
        
        // Skip if it's too short or too long
        if (monsterName.length < 2 || monsterName.length > 100) {
            return null;
        }
        
        // Skip if it's just whitespace or common non-monster text
        if (monsterName === '' || monsterName.toLowerCase().includes('difficulty') || 
            monsterName.toLowerCase().includes('cr') || monsterName.toLowerCase().includes('xp')) {
            return null;
        }
        
        // Remove common suffixes like "(CR X)" or "(x2)" etc.
        monsterName = monsterName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        monsterName = monsterName.replace(/[.,;:]$/, '').trim();
        
        // Skip if it's too short after cleaning
        if (monsterName.length < 2) {
            return null;
        }
        
        return monsterName.length > 0 ? monsterName : null;
    }

    // Check if a line is a heading
    static _isHeading(line) {
        // Check for markdown headings (# ## ### etc.)
        if (line.startsWith('#')) return true;
        
        // Check for all caps (likely a heading)
        if (line === line.toUpperCase() && line.length > 3) return true;
        
        // Check for common heading patterns
        const headingPatterns = [
            /^[A-Z][A-Z\s]+$/,
            /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/
        ];
        
        return headingPatterns.some(pattern => pattern.test(line));
    }

    // Check if a line contains an existing link
    static _isExistingLink(line) {
        return line.includes('@UUID[') || line.includes('@Actor[');
    }

    // Check if a line contains an existing item link
    static _isExistingItemLink(line) {
        return line.includes('@UUID[') || line.includes('@Item[');
    }

    // Check if a line is an item heading
    static _isItemHeading(line) {
        const itemKeywords = [
            'items',
            'treasure',
            'loot',
            'equipment',
            'gear',
            'weapons',
            'armor',
            'magic items',
            'consumables',
            'rewards',
            'rewards and treasure'
        ];
        
        const lowerLine = line.toLowerCase();
        return itemKeywords.some(keyword => lowerLine.includes(keyword));
    }

    // Extract item name from bullet list item
    static _extractItemNameFromBullet(line) {
        // Remove bullet and common prefixes
        let itemName = line.replace(/^[•\-*+]\s*/, '').trim();
        
        // Remove common suffixes like "(x2)" etc.
        itemName = itemName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        itemName = itemName.replace(/[.,;:]$/, '').trim();
        
        return itemName.length > 0 ? itemName : null;
    }

    // Extract item name from plain text
    static _extractItemNameFromPlainText(line) {
        let itemName = line.trim();
        
        // Skip if it's too short or too long
        if (itemName.length < 2 || itemName.length > 100) {
            return null;
        }
        
        // Skip if it's just whitespace or common non-item text
        if (itemName === '' || itemName.toLowerCase().includes('difficulty') || 
            itemName.toLowerCase().includes('cr') || itemName.toLowerCase().includes('xp') ||
            itemName.toLowerCase().includes('gold') || itemName.toLowerCase().includes('magic') ||
            itemName.toLowerCase().includes('synopsis') || itemName.toLowerCase().includes('key moments')) {
            return null;
        }
        
        // Skip if it's just numbers or currency
        if (/^[0-9]+$/.test(itemName) || /^[0-9]+\s*gp$/.test(itemName)) {
            return null;
        }
        
        // Remove common suffixes like "(x2)" etc.
        itemName = itemName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        itemName = itemName.replace(/[.,;:]$/, '').trim();
        
        // Skip if it's too short after cleaning
        if (itemName.length < 2) {
            return null;
        }
        
        // Skip if it looks like a category label (ends with colon)
        if (itemName.endsWith(':')) {
            return null;
        }
        
        return itemName.length > 0 ? itemName : null;
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
            
            // For HTML content monsters, we need to be more careful about replacement
            if (link.type === 'html-content') {
                // Use the stored <li> tag boundaries
                if (link.liStart !== undefined && link.liEnd !== undefined) {
                    // Get the full <li> content
                    const fullLi = content.substring(link.liStart, link.liEnd);
                    
                    // Replace just the monster name within the <li> tag
                    const beforeMonster = fullLi.substring(0, link.startIndex - link.liStart);
                    const afterMonster = fullLi.substring(link.endIndex - link.liStart);
                    const newLi = beforeMonster + newLink + afterMonster;
                    
                    // Replace the entire <li> tag
                    const newContent = content.substring(0, link.liStart) + newLi + content.substring(link.liEnd);
                    
                    postConsoleAndNotification("BLACKSMITH | Journal Tools: Upgraded HTML monster", 
                        `${link.actorName}: plain text → ${newUuid}`, false, true, false);
                    
                    return { success: true, newContent };
                }
            }
            
            // For other types, use the standard replacement
            const newContent = content.substring(0, link.startIndex) + 
                             newLink + 
                             content.substring(link.endIndex);
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Upgraded actor link", 
                `${link.actorName}: ${link.uuid || 'plain text'} → ${newUuid}`, false, true, false);
            
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

    // Find treasure sections in HTML content
    static _findTreasureSections(htmlContent) {
        const treasureSections = [];
        
        // Look for treasure section headings
        const treasureHeadingRegex = /<h[1-6][^>]*>([^<]*?(?:rewards?|treasure|loot|items?)[^<]*?)<\/h[1-6]>/gi;
        let match;
        
        while ((match = treasureHeadingRegex.exec(htmlContent)) !== null) {
            const headingText = match[1].trim();
            const headingStart = match.index;
            
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Found treasure heading", 
                `"${headingText}" at position ${headingStart}`, false, true, false);
            
            // Find the content after this heading until the next heading
            const nextHeadingRegex = /<h[1-6][^>]*>/gi;
            nextHeadingRegex.lastIndex = headingStart + match[0].length;
            const nextMatch = nextHeadingRegex.exec(htmlContent);
            
            const sectionEnd = nextMatch ? nextMatch.index : htmlContent.length;
            const sectionContent = htmlContent.substring(headingStart + match[0].length, sectionEnd);
            
            treasureSections.push({
                title: headingText,
                content: sectionContent,
                startIndex: headingStart + match[0].length,
                endIndex: sectionEnd
            });
        }
        
        return treasureSections;
    }

    // Extract treasure item name with better filtering
    static _extractTreasureItemName(text) {
        let itemName = text.trim();
        
        // Skip if it's too short or too long
        if (itemName.length < 2 || itemName.length > 100) {
            return null;
        }
        
        // Skip common non-treasure text
        const nonTreasurePatterns = [
            /^[0-9]+$/, // Just numbers
            /^[0-9]+\s*gp$/, // Currency
            /^[0-9]+\s*xp$/, // Experience
            /^difficulty$/i, // Difficulty
            /^cr$/i, // Challenge Rating
            /^synopsis$/i, // Synopsis
            /^key\s+moments$/i, // Key Moments
            /^gold$/i, // Gold
            /^magic$/i, // Magic
            /^items$/i, // Items
            /^rewards$/i, // Rewards
            /^treasure$/i, // Treasure
            /^loot$/i, // Loot
            /^equipment$/i, // Equipment
            /^gear$/i, // Gear
            /^weapons$/i, // Weapons
            /^armor$/i, // Armor
            /^consumables$/i, // Consumables
            /^strong$/i, // HTML tags
            /^[a-z\s]+$/i // All lowercase (likely not an item)
        ];
        
        for (const pattern of nonTreasurePatterns) {
            if (pattern.test(itemName)) {
                return null;
            }
        }
        
        // Skip if it looks like narrative text (too long, contains common narrative words)
        const narrativeWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'within', 'without', 'against', 'toward', 'towards', 'into', 'onto', 'upon', 'across', 'behind', 'beneath', 'beside', 'beyond', 'inside', 'outside', 'underneath'];
        const words = itemName.toLowerCase().split(/\s+/);
        const narrativeWordCount = words.filter(word => narrativeWords.includes(word)).length;
        
        if (words.length > 5 && narrativeWordCount > words.length * 0.6) {
            return null; // Too many narrative words
        }
        
        // Remove common suffixes like "(x2)" etc.
        itemName = itemName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        itemName = itemName.replace(/[.,;:]$/, '').trim();
        
        // Skip if it's too short after cleaning
        if (itemName.length < 2) {
            return null;
        }
        
        // Skip if it looks like a category label (ends with colon)
        if (itemName.endsWith(':')) {
            return null;
        }
        
        return itemName.length > 0 ? itemName : null;
    }

} 