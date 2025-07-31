// ================================================================== 
// ===== JOURNAL TOOLS ==============================================
// ================================================================== 

import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class JournalTools {
    static init() {
        Hooks.on('renderJournalSheet', this._onRenderJournalSheet.bind(this));
        Hooks.on('settingChange', this._onSettingChange.bind(this));
    }

    static _onSettingChange(moduleId, key, value) {
        if (moduleId === 'coffee-pub-blacksmith') {
            if (key === 'enableJournalTools') {
                // Refresh any open journal sheets to show/hide the tools icon
                Object.values(ui.windows).forEach(window => {
                    if (window instanceof JournalSheet) {
                        window.render(true);
                    }
                });
            }
        }
    }

    static async _onRenderJournalSheet(app, html, data) {
        // Only add the tools icon if the feature is enabled
        const enableJournalTools = game.settings.get('coffee-pub-blacksmith', 'enableJournalTools');
        postConsoleAndNotification("BLACKSMITH | Journal Tools: renderJournalSheet hook called", 
            `enableJournalTools: ${enableJournalTools}`, false, true, false);
        
        if (!enableJournalTools) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Feature disabled", 
                "enableJournalTools setting is false", false, true, false);
            return;
        }

        // Only add tools icon in normal view, not edit view (same as old code)
        const isEditMode = this._isEditMode(html);
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Edit mode check", 
            `isEditMode: ${isEditMode}`, false, true, false);
        
        if (isEditMode) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: In edit mode", 
                "Journal is in edit mode, not showing tools icon", false, true, false);
            return;
        }

        // Store the app instance for reliable journal retrieval
        html.data('journal-app', app);

        // Add the tools icon
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Adding tools icon", 
            `Journal: ${app?.document?.name || 'Unknown'}`, false, true, false);
        this._addToolsIcon(html);
    }

    static _isEditMode(html) {
        return html.find('.editor-container').length > 0;
    }

    static _addToolsIcon(html) {
        // Find the window header
        const windowHeader = html.find('.window-header');
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Looking for window header", 
            `header found: ${windowHeader.length > 0}`, false, true, false);
        
        if (!windowHeader.length) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: No window header found", 
                "Cannot add tools icon", false, true, false);
            return;
        }

        // Check if tools icon already exists
        const existingToolsIcon = windowHeader.find('.journal-tools-icon');
        if (existingToolsIcon.length > 0) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Icon already exists", 
                "Skipping icon addition", false, true, false);
            return; // Already added
        }

        // Debug: Log the HTML structure
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Adding icon to header", 
            `Header found: ${windowHeader.length}`, false, true, false);

        // Create the tools icon
        const toolsIcon = $(`
            <a class="journal-tools-icon" title="Journal Tools" style="cursor: pointer; margin-left: 8px;">
                <i class="fas fa-feather"></i>
            </a>
        `);
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Created tools icon", 
            "Icon element created", false, true, false);

        // Add click handler
        toolsIcon.on('click', (event) => {
            event.preventDefault();
            this._openToolsDialog(html);
        });

        // Insert the icon before the close button (if it exists) or at the end
        const closeButton = windowHeader.find('.header-button.close');
        const configureButton = windowHeader.find('.header-button.configure-sheet');
        
        postConsoleAndNotification("BLACKSMITH | Journal Tools: Looking for buttons", 
            `close button: ${closeButton.length > 0}, configure button: ${configureButton.length > 0}`, false, true, false);
        
        // Try to place it before the close button, then before configure button, then at the end
        if (closeButton.length > 0) {
            closeButton.before(toolsIcon);
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Icon inserted before close button", 
                "Icon placement successful", false, true, false);
        } else if (configureButton.length > 0) {
            configureButton.before(toolsIcon);
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Icon inserted before configure button", 
                "Icon placement successful", false, true, false);
        } else {
            windowHeader.append(toolsIcon);
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Icon appended to header", 
                "Icon placement successful", false, true, false);
        }

        postConsoleAndNotification("BLACKSMITH | Journal Tools: Added tools icon to journal window", "", false, true, false);
    }

    static _openToolsDialog(html) {
        try {
            // Get the journal from the stored app instance
            const app = html.data('journal-app');
            let journal = null;

            if (app && app.document) {
                journal = app.document;
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found journal via app", 
                    `Journal: ${journal.name}`, false, true, false);
            } else {
                // Fallback: try to get from the HTML data
                journal = html.data('journal');
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Found journal via HTML data", 
                    journal ? `Journal: ${journal.name}` : 'No journal found', false, true, false);
            }

            if (!journal) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Could not find journal entry", 
                    `Primary: ${app?.document?.name}, Alternative: ${html.data('journal')?.name}`, false, true, false);
                ui.notifications.error("Could not find journal entry");
                return;
            }

            // Create and show the tools window
            new JournalToolsWindow(journal).render(true);

        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error opening tools dialog", 
                error.message, false, false, true);
            ui.notifications.error(`Error opening journal tools: ${error.message}`);
        }
    }

    // Generic method to process tool requests
    static async _processToolRequest(journal, upgradeActors, upgradeItems) {
        try {
            if (upgradeActors || upgradeItems) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting unified upgrade", 
                    `Journal: ${journal.name}, Actors: ${upgradeActors}, Items: ${upgradeItems}`, false, true, false);
                await this._upgradeJournalLinksUnified(journal, upgradeActors, upgradeItems);
            }

        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error processing tool request", 
                error.message, false, false, true);
            throw error;
        }
    }

    // Unified method to upgrade journal links for any entity type
    static async _upgradeJournalLinks(journal, entityType) {
        try {
            const entityLabel = entityType === 'actor' ? 'Actor' : 'Item';
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Starting ${entityType} link upgrade`, 
                `Journal: ${journal.name}`, false, true, false);
            
            // Get all pages in the journal
            const pages = journal.pages.contents;
            let totalUpgraded = 0;
            let totalSkipped = 0;
            let totalErrors = 0;
            
            for (const page of pages) {
                let pageContent = page.text.content;
                if (!pageContent) continue;
                
                // Debug: Show the content we're working with
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: Page content preview`, 
                    `Page: ${page.name}, Content length: ${pageContent.length}`, false, true, false);
                
                // Scan for existing links in this page
                const existingLinks = this._scanJournalForLinks(pageContent, entityType);
                
                // Scan for plain text entities in bullet lists
                const bulletListEntities = this._scanJournalForBulletListEntities(pageContent, entityType);
                
                // Scan for manual link entities
                const manualLinkEntities = this._scanJournalForManualLinkEntities(pageContent, entityType);
                
                // Scan for HTML entities
                const htmlEntities = this._scanJournalForHtmlEntities(page, entityType);
                
                // Combine all entities to process
                const allEntities = [
                    ...existingLinks,
                    ...bulletListEntities,
                    ...manualLinkEntities,
                    ...htmlEntities
                ];
                
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: Found ${allEntities.length} ${entityType}s to process`, 
                    `Page: ${page.name}`, false, true, false);
                
                // Process each entity
                let contentChanged = false;
                
                for (const entity of allEntities) {
                    try {
                        const newContent = await this._upgradeEntityLink(entity, pageContent, entityType);
                        if (newContent !== pageContent) {
                            pageContent = newContent;
                            contentChanged = true;
                            totalUpgraded++;
                        } else {
                            totalSkipped++;
                        }
                    } catch (error) {
                        postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error upgrading ${entityType}`, 
                            `${entity.name}: ${error.message}`, false, false, true);
                        totalErrors++;
                    }
                }
                
                // Update the page if content changed
                if (contentChanged) {
                    await page.update({ 'text.content': pageContent });
                    postConsoleAndNotification(`BLACKSMITH | Journal Tools: Updated page`, 
                        `${page.name} - ${totalUpgraded} ${entityType}s upgraded`, false, true, false);
                }
            }
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: ${entityLabel} upgrade complete`, 
                `Upgraded: ${totalUpgraded}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`, false, true, false);
            
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error in ${entityType} upgrade`, 
                error.message, false, false, true);
            throw error;
        }
    }

    // New unified method that processes all entities in one pass
    static async _upgradeJournalLinksUnified(journal, upgradeActors, upgradeItems) {
        try {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Starting unified link upgrade`, 
                `Journal: ${journal.name}`, false, true, false);
            
            // Get all pages in the journal
            const pages = journal.pages.contents;
            let totalUpgraded = 0;
            let totalSkipped = 0;
            let totalErrors = 0;
            
            for (const page of pages) {
                let pageContent = page.text.content;
                if (!pageContent) continue;
                
                // Debug: Show the content we're working with
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: Page content preview`, 
                    `Page: ${page.name}, Content length: ${pageContent.length}`, false, true, false);
                
                // Collect all potential entities from all scanning methods
                const allEntities = [];
                
                if (upgradeActors) {
                    // Scan for actor-specific entities
                    const existingActorLinks = this._scanJournalForLinks(pageContent, 'actor');
                    const bulletListActors = this._scanJournalForBulletListEntities(pageContent, 'actor');
                    const manualLinkActors = this._scanJournalForManualLinkEntities(pageContent, 'actor');
                    const htmlActors = this._scanJournalForHtmlEntities(page, 'actor');
                    
                    allEntities.push(...existingActorLinks, ...bulletListActors, ...manualLinkActors, ...htmlActors);
                }
                
                if (upgradeItems) {
                    // Scan for item-specific entities
                    const existingItemLinks = this._scanJournalForLinks(pageContent, 'item');
                    const bulletListItems = this._scanJournalForBulletListEntities(pageContent, 'item');
                    const manualLinkItems = this._scanJournalForManualLinkEntities(pageContent, 'item');
                    const htmlItems = this._scanJournalForHtmlEntities(page, 'item');
                    
                    allEntities.push(...existingItemLinks, ...bulletListItems, ...manualLinkItems, ...htmlItems);
                }
                
                // Remove duplicates based on name and position
                const uniqueEntities = [];
                const seen = new Set();
                
                for (const entity of allEntities) {
                    const key = `${entity.name}-${entity.startIndex}-${entity.endIndex}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueEntities.push(entity);
                    }
                }
                
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: Found ${uniqueEntities.length} unique entities to process`, 
                    `Page: ${page.name}`, false, true, false);
                
                // Process each unique entity
                let contentChanged = false;
                
                for (const entity of uniqueEntities) {
                    try {
                        // Determine entity type based on where it was found and context
                        let entityType = this._determineEntityTypeFromContext(entity, pageContent, uniqueEntities);
                        
                        const newContent = await this._upgradeEntityLinkUnified(entity, pageContent, entityType);
                        if (newContent !== pageContent) {
                            pageContent = newContent;
                            contentChanged = true;
                            totalUpgraded++;
                        } else {
                            totalSkipped++;
                        }
                    } catch (error) {
                        postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error upgrading entity`, 
                            `${entity.name}: ${error.message}`, false, false, true);
                        totalErrors++;
                    }
                }
                
                // Update the page if content changed
                if (contentChanged) {
                    await page.update({ 'text.content': pageContent });
                    postConsoleAndNotification(`BLACKSMITH | Journal Tools: Updated page`, 
                        `${page.name} - ${totalUpgraded} entities upgraded`, false, true, false);
                }
            }
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Unified upgrade complete`, 
                `Upgraded: ${totalUpgraded}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`, false, true, false);
            
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error in unified upgrade`, 
                error.message, false, false, true);
            throw error;
        }
    }

    // Generic method to scan for existing links
    static _scanJournalForLinks(content, entityType) {
        const links = [];
        const linkPattern = entityType === 'actor' 
            ? /@UUID\[([^\]]+)\]\{([^}]+)\}|@Actor\[([^\]]+)\]\{([^}]+)\}/gi
            : /@UUID\[([^\]]+)\]\{([^}]+)\}|@Item\[([^\]]+)\]\{([^}]+)\}/gi;
        
        let match;
        while ((match = linkPattern.exec(content)) !== null) {
            const uuid = match[1] || match[3];
            const name = match[2] || match[4];
            links.push({
                type: 'existing-link',
                name: name,
                uuid: uuid,
                startIndex: match.index,
                endIndex: match.index + match[0].length,
                fullMatch: match[0]
            });
        }
        
        // Sort by startIndex descending to avoid replacement issues
        return links.sort((a, b) => b.startIndex - a.startIndex);
    }

    // Generic method to scan for bullet list entities
    static _scanJournalForBulletListEntities(content, entityType) {
        const entities = [];
        const lines = content.split('\n');
        
        let inRelevantSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if we're entering a relevant section
            if (entityType === 'actor' ? this._isEncounterHeading(line) : this._isItemHeading(line)) {
                inRelevantSection = true;
                continue;
            }
            
            // Skip if not in a relevant section
            if (!inRelevantSection) continue;
            
            // Check if this is a bullet list item
            if (this._isBulletListItem(line)) {
                const entityName = this._extractEntityNameFromBullet(line, entityType);
                
                if (entityName) {
                    entities.push({
                        type: 'bullet-list',
                        name: entityName,
                        startIndex: content.indexOf(line),
                        endIndex: content.indexOf(line) + line.length,
                        fullMatch: line
                    });
                }
            }
        }
        
        return entities;
    }

    // Generic method to scan for manual link entities
    static _scanJournalForManualLinkEntities(content, entityType) {
        const entities = [];
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Look for pattern like "Entity Name (link manually)"
            const manualLinkPattern = /^(.+?)\s*\(link\s+manually\)\s*$/i;
            const match = trimmedLine.match(manualLinkPattern);
            
            if (match) {
                const entityName = match[1].trim();
                if (entityName) {
                    entities.push({
                        type: 'manual-link',
                        name: entityName,
                        startIndex: content.indexOf(line),
                        endIndex: content.indexOf(line) + line.length,
                        fullMatch: line
                    });
                }
            }
        }
        
        return entities;
    }

    // Generic method to scan for HTML entities
    static _scanJournalForHtmlEntities(page, entityType) {
        const entities = [];
        
        // Only process if this is an HTML content page
        if (page.text.content && page.text.content.includes('<')) {
            const htmlContent = page.text.content;
            
            // Find all <li> tags
            const liPattern = /<li[^>]*>(.*?)<\/li>/gi;
            let match;
            
            while ((match = liPattern.exec(htmlContent)) !== null) {
                const liContent = match[1];
                const strippedContent = liContent.replace(/<[^>]+>/g, '').trim();
                
                if (strippedContent) {
                    // Handle colon-separated items like "Items: Shortsword, Leather armor"
                    if (strippedContent.includes(':')) {
                        const [prefix, itemsPart] = strippedContent.split(':', 2);
                        if (itemsPart) {
                            // Strip HTML tags from itemsPart before processing
                            const cleanItemsPart = itemsPart.replace(/<[^>]+>/g, '').trim();
                            const itemNames = cleanItemsPart.split(',').map(item => item.trim());
                            
                            for (const itemName of itemNames) {
                                if (itemName) {
                                    const entityName = this._extractEntityNameFromPlainText(itemName, entityType);
                                    
                                    if (entityName) {
                                        entities.push({
                                            type: 'html-list',
                                            name: entityName,
                                            startIndex: match.index,
                                            endIndex: match.index + match[0].length,
                                            fullMatch: match[0],
                                            liStart: match.index,
                                            liEnd: match.index + match[0].length,
                                            originalContent: liContent
                                        });
                                    }
                                }
                            }
                        }
                    } else {
                        // Single entity in the list item
                        const entityName = this._extractEntityNameFromPlainText(strippedContent, entityType);
                        
                        if (entityName) {
                            entities.push({
                                type: 'html-list',
                                name: entityName,
                                startIndex: match.index,
                                endIndex: match.index + match[0].length,
                                fullMatch: match[0],
                                liStart: match.index,
                                liEnd: match.index + match[0].length,
                                originalContent: liContent
                            });
                        }
                    }
                }
            }
        }
        
        return entities;
    }

    // Check if a line is an encounter heading
    static _isEncounterHeading(line) {
        const encounterKeywords = [
            'encounters',
            'monsters',
            'npcs',
            'enemies',
            'foes',
            'adversaries',
            'creatures'
        ];
        
        const lowerLine = line.toLowerCase();
        return encounterKeywords.some(keyword => lowerLine.includes(keyword));
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

    // Check if a line is a bullet list item
    static _isBulletListItem(line) {
        return /^[•\-*+]\s/.test(line);
    }

    // Check if content looks like an entity list item
    static _isEntityListItem(content, entityType) {
        // Skip if it's too short
        if (content.length < 2) return false;
        
        // Skip if it's just whitespace
        if (content.trim() === '') return false;
        
        // Skip if it's a heading
        if (this._isHeading(content)) return false;
        
        // Skip if it already contains a link
        if (this._isExistingLink(content, entityType)) return false;
        
        return true;
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
    static _isExistingLink(line, entityType) {
        if (entityType === 'actor') {
            return line.includes('@UUID[') || line.includes('@Actor[');
        } else {
            return line.includes('@UUID[') || line.includes('@Item[');
        }
    }

    // Generic method to extract entity name from bullet list item
    static _extractEntityNameFromBullet(line, entityType) {
        // Remove bullet and common prefixes
        let entityName = line.replace(/^[•\-*+]\s*/, '').trim();
        
        // Remove common suffixes like "(x2)" etc.
        entityName = entityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        entityName = entityName.replace(/[.,;:]$/, '').trim();
        
        return entityName.length > 0 ? entityName : null;
    }

    // Generic method to extract entity name from plain text
    static _extractEntityNameFromPlainText(line, entityType) {
        let entityName = line.trim();
        
        // Skip if it's too short or too long
        if (entityName.length < 2 || entityName.length > 100) {
            return null;
        }
        
        // Skip if it's just whitespace
        if (entityName === '') {
            return null;
        }
        
        // Remove common suffixes like "(x2)" etc.
        entityName = entityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation
        entityName = entityName.replace(/[.,;:]$/, '').trim();
        
        // Skip if it's too short after cleaning
        if (entityName.length < 2) {
            return null;
        }
        
        // Skip if it looks like a category label (ends with colon)
        if (entityName.endsWith(':')) {
            return null;
        }
        
        return entityName.length > 0 ? entityName : null;
    }

    // Generic method to upgrade a single entity link
    static async _upgradeEntityLink(entity, content, entityType) {
        try {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Processing ${entityType}`, 
                `${entity.name} (${entity.type})`, false, true, false);
            
            // Find the entity in compendiums
            let uuid = await this._findEntityInCompendiums(entity.name, entityType);
            
            // If not found in the specific entity type compendiums, try searching both
            if (!uuid) {
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: ${entityType} not found, trying both compendiums`, 
                    entity.name, false, true, false);
                uuid = await this._findEntityInBothCompendiums(entity.name);
            }
            
            if (!uuid) {
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: Entity not found in any compendium`, 
                    entity.name, false, true, false);
                return content;
            }
            
            // Create the new link
            const newLink = `@UUID[${uuid}]{${entity.name}}`;
            
            // Replace the old content with the new link
            let newContent = content;
            
            if (entity.type === 'html-list') {
                // For HTML list items, we need to be more careful to preserve the <li> structure
                const liStart = entity.liStart;
                const liEnd = entity.liEnd;
                const liContent = content.substring(liStart, liEnd);
                
                // Replace the entity name within the <li> content
                const updatedLiContent = liContent.replace(entity.name, newLink);
                newContent = content.substring(0, liStart) + updatedLiContent + content.substring(liEnd);
            } else {
                // For other types, replace the full match
                newContent = content.substring(0, entity.startIndex) + newLink + content.substring(entity.endIndex);
            }
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Successfully upgraded ${entityType}`, 
                `${entity.name} -> ${newLink}`, false, true, false);
            
            return newContent;
            
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error upgrading ${entityType}`, 
                `${entity.name}: ${error.message}`, false, false, true);
            return content;
        }
    }

    // Generic method to find entity in compendiums
    static async _findEntityInCompendiums(entityName, entityType) {
        try {
            // Clean the entity name
            let strEntityName = entityName.trim();
            
            // Remove HTML tags if present
            strEntityName = strEntityName.replace(/<[^>]+>/g, '').trim();
            
            // Remove common suffixes like "(CR X)" or "(number)"
            strEntityName = strEntityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Searching for ${entityType}`, 
                `"${strEntityName}"`, false, true, false);
            
            // Get settings based on entity type
            const searchWorldFirst = entityType === 'actor' 
                ? game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsFirst')
                : game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsFirst');
            
            // Search world entities first if enabled
            if (searchWorldFirst) {
                const worldEntities = entityType === 'actor' ? game.actors : game.items;
                const worldEntity = worldEntities.find(e => 
                    e.name.toLowerCase() === strEntityName.toLowerCase()
                );
                
                if (worldEntity) {
                    postConsoleAndNotification(`BLACKSMITH | Journal Tools: Found ${entityType} in world`, 
                        `${strEntityName} -> ${worldEntity.uuid}`, false, true, false);
                    return worldEntity.uuid;
                }
            }
            
            // Handle colon-separated names (e.g., "Gem: Diamond")
            let searchNames = [strEntityName];
            if (strEntityName.includes(':')) {
                const parts = strEntityName.split(':');
                if (parts.length > 1) {
                    // Try with colon first, then without
                    searchNames = [strEntityName, parts[1].trim()];
                }
            }
            
            // Search compendiums based on entity type
            const compendiumSettings = entityType === 'actor' 
                ? ['monsterCompendium1', 'monsterCompendium2', 'monsterCompendium3', 'monsterCompendium4', 
                   'monsterCompendium5', 'monsterCompendium6', 'monsterCompendium7', 'monsterCompendium8']
                : ['itemCompendium1', 'itemCompendium2', 'itemCompendium3', 'itemCompendium4',
                   'itemCompendium5', 'itemCompendium6', 'itemCompendium7', 'itemCompendium8'];
            
            // Try each search name
            for (const searchName of searchNames) {
                for (const settingKey of compendiumSettings) {
                    const compendiumName = game.settings.get('coffee-pub-blacksmith', settingKey);
                    
                    if (!compendiumName || compendiumName === '') {
                        postConsoleAndNotification(`BLACKSMITH | Journal Tools: ${settingKey} not set`, 
                            `${settingKey} not set`, false, true, false);
                        continue;
                    }
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) {
                            postConsoleAndNotification(`BLACKSMITH | Journal Tools: ${entityType} compendium not found`, 
                                `${compendiumName}`, false, true, false);
                            continue;
                        }
                        
                        const index = await pack.getIndex();
                        
                        // Only use exact match - no partial matching to avoid false positives
                        let entry = index.find(e => 
                            e.name.toLowerCase() === searchName.toLowerCase()
                        );
                        
                        if (entry) {
                            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Found ${entityType} in compendium`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, true, false);
                            return `Compendium.${compendiumName}.${entityType === 'actor' ? 'Actor' : 'Item'}.${entry._id}`;
                        } else {
                            postConsoleAndNotification(`BLACKSMITH | Journal Tools: ${entityType} not found in compendium`, 
                                `${searchName} not found in ${compendiumName}`, false, true, false);
                        }
                    } catch (error) {
                        postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error searching compendium`, 
                            `${compendiumName}: ${error.message}`, false, true, false);
                    }
                }
            }
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: ${entityType} not found in any compendium`, 
                strEntityName, false, true, false);
            return null;
            
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error finding ${entityType} in compendiums`, 
                `${entityName}: ${error.message}`, false, false, true);
            return null;
        }
    }

    // Search both actor and item compendiums when entity type is uncertain
    static async _findEntityInBothCompendiums(entityName) {
        try {
            // Clean the entity name
            let strEntityName = entityName.trim();
            
            // Remove HTML tags if present
            strEntityName = strEntityName.replace(/<[^>]+>/g, '').trim();
            
            // Remove common suffixes like "(CR X)" or "(number)"
            strEntityName = strEntityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Searching both compendiums`, 
                `"${strEntityName}"`, false, true, false);
            
            // Handle colon-separated names (e.g., "Gem: Diamond")
            let searchNames = [strEntityName];
            if (strEntityName.includes(':')) {
                const parts = strEntityName.split(':');
                if (parts.length > 1) {
                    // Try with colon first, then without
                    searchNames = [strEntityName, parts[1].trim()];
                }
            }
            
            // Try each search name
            for (const searchName of searchNames) {
                // Try actor compendiums first (default bias)
                const actorCompendiums = ['monsterCompendium1', 'monsterCompendium2', 'monsterCompendium3', 'monsterCompendium4', 
                                         'monsterCompendium5', 'monsterCompendium6', 'monsterCompendium7', 'monsterCompendium8'];
                
                for (const settingKey of actorCompendiums) {
                    const compendiumName = game.settings.get('coffee-pub-blacksmith', settingKey);
                    
                    if (!compendiumName || compendiumName === '') continue;
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) continue;
                        
                        const index = await pack.getIndex();
                        let entry = index.find(e => e.name.toLowerCase() === searchName.toLowerCase());
                        
                        if (entry) {
                            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Found in actor compendium`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, true, false);
                            return `Compendium.${compendiumName}.Actor.${entry._id}`;
                        }
                    } catch (error) {
                        // Continue to next compendium
                    }
                }
                
                // Try item compendiums second
                const itemCompendiums = ['itemCompendium1', 'itemCompendium2', 'itemCompendium3', 'itemCompendium4',
                                        'itemCompendium5', 'itemCompendium6', 'itemCompendium7', 'itemCompendium8'];
                
                for (const settingKey of itemCompendiums) {
                    const compendiumName = game.settings.get('coffee-pub-blacksmith', settingKey);
                    
                    if (!compendiumName || compendiumName === '') continue;
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) continue;
                        
                        const index = await pack.getIndex();
                        let entry = index.find(e => e.name.toLowerCase() === searchName.toLowerCase());
                        
                        if (entry) {
                            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Found in item compendium`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, true, false);
                            return `Compendium.${compendiumName}.Item.${entry._id}`;
                        }
                    } catch (error) {
                        // Continue to next compendium
                    }
                }
            }
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Not found in any compendium`, 
                strEntityName, false, true, false);
            return null;
            
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error searching both compendiums`, 
                `${entityName}: ${error.message}`, false, false, true);
            return null;
        }
    }

    // Determine entity type based on context and existing links
    static _determineEntityTypeFromContext(entity, pageContent, allEntities) {
        // If it's an existing link, determine type from the link itself
        if (entity.type === 'existing-link') {
            if (entity.fullMatch.includes('@Actor[') || entity.fullMatch.includes('Actor.')) {
                return 'actor';
            } else if (entity.fullMatch.includes('@Item[') || entity.fullMatch.includes('Item.')) {
                return 'item';
            }
        }
        
        // Look for context clues in nearby entities
        const contextRange = 1000; // Look within 1000 characters before and after
        const entityPosition = entity.startIndex;
        const contextStart = Math.max(0, entityPosition - contextRange);
        const contextEnd = Math.min(pageContent.length, entityPosition + contextRange);
        const contextContent = pageContent.substring(contextStart, contextEnd);
        
        // Count actor vs item links in the context
        let actorLinks = 0;
        let itemLinks = 0;
        
        // Look for existing UUID links in the context
        const uuidPattern = /@UUID\[([^\]]+)\]/g;
        let match;
        while ((match = uuidPattern.exec(contextContent)) !== null) {
            const uuid = match[1];
            if (uuid.includes('.Actor.') || uuid.includes('@Actor[')) {
                actorLinks++;
            } else if (uuid.includes('.Item.') || uuid.includes('@Item[')) {
                itemLinks++;
            }
        }
        
        // Look for other entities in the same list/area
        for (const otherEntity of allEntities) {
            if (otherEntity === entity) continue; // Skip self
            
            const distance = Math.abs(otherEntity.startIndex - entityPosition);
            if (distance <= contextRange) {
                // If this other entity is an existing link, count it
                if (otherEntity.type === 'existing-link') {
                    if (otherEntity.fullMatch.includes('@Actor[') || otherEntity.fullMatch.includes('Actor.')) {
                        actorLinks++;
                    } else if (otherEntity.fullMatch.includes('@Item[') || otherEntity.fullMatch.includes('Item.')) {
                        itemLinks++;
                    }
                }
            }
        }
        
        // Determine bias based on context
        if (actorLinks > itemLinks) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Context bias towards actor`, 
                `${entity.name}: ${actorLinks} actor links vs ${itemLinks} item links in context`, false, true, false);
            return 'actor';
        } else if (itemLinks > actorLinks) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Context bias towards item`, 
                `${entity.name}: ${itemLinks} item links vs ${actorLinks} actor links in context`, false, true, false);
            return 'item';
        } else {
            // No clear bias, default to searching actors first, then items
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: No context bias, defaulting to actor-first search`, 
                `${entity.name}: ${actorLinks} actor links, ${itemLinks} item links in context`, false, true, false);
            return 'both';
        }
    }

    // Unified method to upgrade a single entity link
    static async _upgradeEntityLinkUnified(entity, content, entityType) {
        try {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Processing unified entity`, 
                `${entity.name} (${entity.type}, ${entityType})`, false, true, false);
            
            let uuid = null;
            
            // Search based on entity type
            if (entityType === 'actor') {
                uuid = await this._findEntityInCompendiums(entity.name, 'actor');
            } else if (entityType === 'item') {
                uuid = await this._findEntityInCompendiums(entity.name, 'item');
            } else {
                // Search both compendiums
                uuid = await this._findEntityInBothCompendiums(entity.name);
            }
            
            if (!uuid) {
                postConsoleAndNotification(`BLACKSMITH | Journal Tools: Entity not found in any compendium`, 
                    entity.name, false, true, false);
                return content;
            }
            
            // Create the new link
            const newLink = `@UUID[${uuid}]{${entity.name}}`;
            
            // Replace the old content with the new link
            let newContent = content;
            
            if (entity.type === 'html-list') {
                // For HTML list items, we need to be more careful to preserve the <li> structure
                const liStart = entity.liStart;
                const liEnd = entity.liEnd;
                const liContent = content.substring(liStart, liEnd);
                
                // Replace the entity name within the <li> content
                const updatedLiContent = liContent.replace(entity.name, newLink);
                newContent = content.substring(0, liStart) + updatedLiContent + content.substring(liEnd);
            } else {
                // For other types, replace the full match
                newContent = content.substring(0, entity.startIndex) + newLink + content.substring(entity.endIndex);
            }
            
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Successfully upgraded unified entity`, 
                `${entity.name} -> ${newLink}`, false, true, false);
            
            return newContent;
            
        } catch (error) {
            postConsoleAndNotification(`BLACKSMITH | Journal Tools: Error upgrading unified entity`, 
                `${entity.name}: ${error.message}`, false, false, true);
            return content;
        }
    }
} 

// ================================================================== 
// ===== JOURNAL TOOLS WINDOW =======================================
// ================================================================== 

class JournalToolsWindow extends FormApplication {
    constructor(journal) {
        super();
        this.journal = journal;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "journal-tools-window",
            title: "Journal Tools",
            template: "modules/coffee-pub-blacksmith/templates/journal-tools-window.hbs",
            width: 400,
            height: 300,
            resizable: true,
            classes: ["journal-tools-window"]
        });
    }

    getData() {
        return {
            journalName: this.journal.name,
            journalId: this.journal.id
        };
    }

    async _updateObject(event, formData) {
        const upgradeActors = formData.upgradeActors || false;
        const upgradeItems = formData.upgradeItems || false;

        postConsoleAndNotification("BLACKSMITH | Journal Tools: Processing window submission", 
            `Actors: ${upgradeActors}, Items: ${upgradeItems}`, false, true, false);

        try {
            if (upgradeActors) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting actor upgrade", "", false, true, false);
                await JournalTools._upgradeJournalLinks(this.journal, 'actor');
            }

            if (upgradeItems) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting item upgrade", "", false, true, false);
                await JournalTools._upgradeJournalLinks(this.journal, 'item');
            }

            if (!upgradeActors && !upgradeItems) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: No tools selected", "Please select at least one tool to run", false, true, false);
                return;
            }

            this.close();
            ui.notifications.info(`Journal tools applied successfully!`);
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error processing window submission", error, false, false, true);
            ui.notifications.error(`Error applying journal tools: ${error.message}`);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Add event listeners for the custom buttons
        html.find('.apply-tools').click(this._onApplyTools.bind(this));
        html.find('.cancel-tools').click(this._onCancelTools.bind(this));
    }

    async _onApplyTools(event) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
            // Get form data from checkboxes
            const upgradeActors = this.element.find('#upgrade-actors').is(':checked');
            const upgradeItems = this.element.find('#upgrade-items').is(':checked');

            postConsoleAndNotification("BLACKSMITH | Journal Tools: Apply button clicked", 
                `Actors: ${upgradeActors}, Items: ${upgradeItems}`, false, true, false);

            if (upgradeActors) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting actor upgrade", "", false, true, false);
                await JournalTools._upgradeJournalLinks(this.journal, 'actor');
            }

            if (upgradeItems) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: Starting item upgrade", "", false, true, false);
                await JournalTools._upgradeJournalLinks(this.journal, 'item');
            }

            if (!upgradeActors && !upgradeItems) {
                postConsoleAndNotification("BLACKSMITH | Journal Tools: No tools selected", "Please select at least one tool to run", false, true, false);
                ui.notifications.warn("Please select at least one tool to run");
                return;
            }

            this.close();
            ui.notifications.info(`Journal tools applied successfully!`);
        } catch (error) {
            postConsoleAndNotification("BLACKSMITH | Journal Tools: Error applying tools", error, false, false, true);
            ui.notifications.error(`Error applying journal tools: ${error.message}`);
        }
    }

    _onCancelTools(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Close the window without applying tools
        this.close();
    }
} 