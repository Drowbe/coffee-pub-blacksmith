// ================================================================== 
// ===== JOURNAL TOOLS ==============================================
// ================================================================== 

import { MODULE_ID, BLACKSMITH } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class JournalTools {
    static async init() {
        Hooks.on('renderJournalSheet', this._onRenderJournalSheet.bind(this));
        Hooks.on('settingChange', this._onSettingChange.bind(this));
        
        // Register Handlebars partials
        await this._registerPartials();
    }

    static async _registerPartials() {
        try {
            // Load and register the entity replacement partial
            const entityReplacementTemplate = await fetch(BLACKSMITH.JOURNAL_TOOLS_ENTITY_REPLACEMENT_PARTIAL).then(response => response.text());
            Handlebars.registerPartial('partials/entity-replacement', entityReplacementTemplate);
            
            // Load and register the search & replace partial
            const searchReplaceTemplate = await fetch(BLACKSMITH.JOURNAL_TOOLS_SEARCH_REPLACE_PARTIAL).then(response => response.text());
            Handlebars.registerPartial('partials/search-replace', searchReplaceTemplate);
            
            postConsoleAndNotification("Journal Tools: Partials registered successfully", "", false, false, false);
        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error registering partials", error.message, false, false, false);
        }
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
        postConsoleAndNotification("Journal Tools: renderJournalSheet hook called", 
            `enableJournalTools: ${enableJournalTools}`, false, true, false);
        
        if (!enableJournalTools) {
            postConsoleAndNotification("Journal Tools: Feature disabled", 
                "enableJournalTools setting is false", false, true, false);
            return;
        }

        // Only add tools icon in normal view, not edit view (same as old code)
        const isEditMode = this._isEditMode(html);
        if (isEditMode) {
            return;
        }

        // Store the app instance for reliable journal retrieval
        html.data('journal-app', app);

        // Add the tools icon
        this._addToolsIcon(html);
    }

    static _isEditMode(html) {
        return html.find('.editor-container').length > 0;
    }

    static _addToolsIcon(html) {
        // Find the window header
        const windowHeader = html.find('.window-header');
        
        if (!windowHeader.length) {
            return;
        }

        // Check if tools icon already exists
        const existingToolsIcon = windowHeader.find('.journal-tools-icon');
        if (existingToolsIcon.length > 0) {
            return; // Already added
        }

        // Create the tools icon
        const toolsIcon = $(`
            <a class="journal-tools-icon" title="Journal Tools" style="cursor: pointer; margin-left: 8px;">
                <i class="fas fa-feather"></i>
            </a>
        `);
        postConsoleAndNotification("Journal Tools: Created tools icon", 
            "Icon element created", false, true, false);

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

        postConsoleAndNotification("Journal Tools: Added tools icon to journal window", "", false, false, false);
    }

    static _openToolsDialog(html) {
        try {
            // Get the journal from the stored app instance
            const app = html.data('journal-app');
            let journal = null;

            if (app && app.document) {
                journal = app.document;
            } else {
                // Fallback: try to get from the HTML data
                journal = html.data('journal');
                postConsoleAndNotification("Journal Tools: Found journal via HTML data", 
                    journal ? `Journal: ${journal.name}` : 'No journal found', false, true, false);
            }

            if (!journal) {
                postConsoleAndNotification("Journal Tools: Could not find journal entry", 
                    `Primary: ${app?.document?.name}, Alternative: ${html.data('journal')?.name}`, false, true, false);
                ui.notifications.error("Could not find journal entry");
                return;
            }

            // Create and show the tools window
            new JournalToolsWindow(journal).render(true);

        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error opening tools dialog", 
                error.message, false, false, true);
            ui.notifications.error(`Error opening journal tools: ${error.message}`);
        }
    }

    // Generic method to process tool requests
    static async _processToolRequest(journal, upgradeActors, upgradeItems) {
        try {
            if (upgradeActors || upgradeItems) {
                postConsoleAndNotification("Journal Tools: Starting unified upgrade", 
                    `Journal: ${journal.name}, Actors: ${upgradeActors}, Items: ${upgradeItems}`, false, true, false);
                await this._upgradeJournalLinksUnified(journal, upgradeActors, upgradeItems);
            }

        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error processing tool request", 
                error.message, false, false, false);
            throw error;
        }
    }

    // Unified method to upgrade journal links for any entity type
    static async _upgradeJournalLinks(journal, entityType) {
        try {
            const entityLabel = entityType === 'actor' ? 'Actor' : 'Item';
            postConsoleAndNotification(`Journal Tools: Starting ${entityType} link upgrade`, 
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
                postConsoleAndNotification(`Journal Tools: Page content preview`, 
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
                
                postConsoleAndNotification(`Journal Tools: Found ${allEntities.length} ${entityType}s to process`, 
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
                        postConsoleAndNotification(`Journal Tools: Error upgrading ${entityType}`, 
                            `${entity.name}: ${error.message}`, false, false, false);
                        totalErrors++;
                    }
                }
                
                // Update the page if content changed
                if (contentChanged) {
                    await page.update({ 'text.content': pageContent });
                    postConsoleAndNotification(`Journal Tools: Updated page`, 
                        `${page.name} - ${totalUpgraded} ${entityType}s upgraded`, false, true, false);
                }
            }
            
            postConsoleAndNotification(`Journal Tools: ${entityLabel} upgrade complete`, 
                `Upgraded: ${totalUpgraded}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`, false, true, false);
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error in ${entityType} upgrade`, 
                error.message, false, false, false);
            throw error;
        }
    }

    // New unified method that processes all entities in one pass
    static async _upgradeJournalLinksUnified(journal, upgradeActors, upgradeItems, upgradeMacros, overallProgressCallback = null, pageProgressCallback = null, statusCallback = null, stopCallback = null) {
        try {
            const logStatus = (message, type = "info") => {
                if (statusCallback) statusCallback(message, type);
                
                // Send condensed version to console to reduce noise
                let consoleMessage = message;
                
                // Skip empty lines and separators for console
                if (message.trim() === "" || message.includes("========================================================") || message.includes("--------------------------------------------------------")) {
                    return;
                }
                
                // Condense entity counts
                if (message.includes("Found") && message.includes("Unique Entities") && message.includes("Generic UUID Links")) {
                    // Extract numbers and combine
                    const entityMatch = message.match(/Found (\d+) Unique Entities/);
                    const uuidMatch = message.match(/(\d+) Generic UUID Links/);
                    if (entityMatch && uuidMatch) {
                        consoleMessage = `Found ${entityMatch[1]} Unique Entities, ${uuidMatch[1]} Generic UUID Links`;
                    }
                }
                
                // Condense actor/item breakdowns
                if (message.startsWith("ACTORS") || message.startsWith("ITEMS")) {
                    const section = message.startsWith("ACTORS") ? "ACTORS" : "ITEMS";
                    const actorLinksMatch = message.match(/(\d+) Actor Links/);
                    const itemLinksMatch = message.match(/(\d+) Item Links/);
                    const potentialActorsMatch = message.match(/(\d+) Potential Actors/);
                    const potentialItemsMatch = message.match(/(\d+) Potential Items/);
                    
                    if (section === "ACTORS" && actorLinksMatch && potentialActorsMatch) {
                        consoleMessage = `ACTORS: ${actorLinksMatch[1]} Actor Links, ${potentialActorsMatch[1]} Potential Actors`;
                    } else if (section === "ITEMS" && itemLinksMatch && potentialItemsMatch) {
                        consoleMessage = `ITEMS: ${itemLinksMatch[1]} Item Links, ${potentialItemsMatch[1]} Potential Items`;
                    }
                }
                
                // Condense page results
                if (message.includes("Upgraded,") && message.includes("Skipped,") && message.includes("Created,") && message.includes("Errors")) {
                    // Keep as is - already condensed
                }
                
                // Condense final report headers
                if (message.startsWith("FINAL REPORT:")) {
                    // Keep as is
                }
                
                // Condense final report sections - only the main summary lines, not the detailed breakdowns
                if (message.startsWith("ACTORS") && message.includes("Links Skipped") && message.includes("Links Upgraded") && !message.includes("•")) {
                    // Extract all the numbers and combine
                    const skippedMatch = message.match(/(\d+) Actor Links Skipped/);
                    const upgradedMatch = message.match(/(\d+) Actor Links Upgraded/);
                    const createdMatch = message.match(/(\d+) Actor Links Created/);
                    const errorsMatch = message.match(/(\d+) Actor Errors/);
                    
                    if (skippedMatch && upgradedMatch && createdMatch && errorsMatch) {
                        consoleMessage = `ACTORS: ${skippedMatch[1]} Actor Links Skipped, ${upgradedMatch[1]} Actor Links Upgraded, ${createdMatch[1]} Actor Links Created, ${errorsMatch[1]} Actor Errors`;
                    }
                }
                
                if (message.startsWith("ITEMS") && message.includes("Links Skipped") && message.includes("Links Upgraded") && !message.includes("•")) {
                    // Extract all the numbers and combine
                    const skippedMatch = message.match(/(\d+) Item Links Skipped/);
                    const upgradedMatch = message.match(/(\d+) Item Links Upgraded/);
                    const createdMatch = message.match(/(\d+) Item Links Created/);
                    const errorsMatch = message.match(/(\d+) Item Errors/);
                    
                    if (skippedMatch && upgradedMatch && createdMatch && errorsMatch) {
                        consoleMessage = `ITEMS: ${skippedMatch[1]} Item Links Skipped, ${upgradedMatch[1]} Item Links Upgraded, ${createdMatch[1]} Item Links Created, ${errorsMatch[1]} Item Errors`;
                    }
                }
                
                if (message.startsWith("MACROS") && message.includes("Links Skipped") && message.includes("Links Upgraded") && !message.includes("•")) {
                    // Extract all the numbers and combine
                    const skippedMatch = message.match(/(\d+) Macro Links Skipped/);
                    const upgradedMatch = message.match(/(\d+) Macro Links Upgraded/);
                    const createdMatch = message.match(/(\d+) Macro Links Created/);
                    const errorsMatch = message.match(/(\d+) Macro Errors/);
                    
                    if (skippedMatch && upgradedMatch && createdMatch && errorsMatch) {
                        consoleMessage = `MACROS: ${skippedMatch[1]} Macro Links Skipped, ${upgradedMatch[1]} Macro Links Upgraded, ${createdMatch[1]} Macro Links Created, ${errorsMatch[1]} Macro Errors`;
                    }
                }
                
                // Condense settings section
                if (message.startsWith("SETTINGS")) {
                    // Keep as is - already condensed
                }
                
                // Skip individual setting lines (they'll be combined in the main SETTINGS line)
                if (message.startsWith("- Actors=") || message.startsWith("- Items=") || message.startsWith("- Macros=") || 
                    message.startsWith("- Search World Items First:") || message.startsWith("- Search World Actors First:") ||
                    message.startsWith("- Search World Items Last:") || message.startsWith("- Search World Actors Last:")) {
                    return;
                }
                
                // Skip individual totals lines (they'll be combined in the main TOTALS line)
                if (message.startsWith("- ") && (message.includes("Pages Processed") || message.includes("Entities Processed") || 
                    message.includes("Links Skipped") || message.includes("Links Upgraded") || 
                    message.includes("Links Created") || message.includes("Errors"))) {
                    return;
                }
                
                // Condense totals section
                if (message.startsWith("TOTALS")) {
                    // Keep as is - already condensed
                }
                
                // Skip sub-bullet points in final report
                if (message.trim().startsWith("•")) {
                    return;
                }
                
                // Skip sub-headers in final report
                if (message === "ACTORS" || message === "ITEMS" || message === "MACROS" || message === "SETTINGS" || message === "TOTALS") {
                    return;
                }
                
                // Skip processing headers
                if (message.startsWith("PROCESSING:")) {
                    return;
                }
                
                // Skip results headers
                if (message.startsWith("RESULTS:")) {
                    return;
                }
                
                postConsoleAndNotification("Journal Tools: " + consoleMessage, "", false, false, false);
            };
            
            const updateOverallProgress = (percentage, message) => {
                if (overallProgressCallback) overallProgressCallback(percentage, message);
            };
            
            const updatePageProgress = (percentage, message) => {
                if (pageProgressCallback) pageProgressCallback(percentage, message);
            };
            
            const checkStopRequest = () => {
                if (stopCallback && stopCallback()) {
                    throw new Error("Processing stopped by user");
                }
            };
            
            logStatus("Starting unified link upgrade...");
            updateOverallProgress(5, "Initializing...");
            updatePageProgress(0, "Ready...");
            
            // Get all pages in the journal
            const pages = journal.pages.contents;
            let totalUpgraded = 0;
            let totalSkipped = 0;
            let totalErrors = 0;
            
            updateOverallProgress(10, "Scanning pages...");
            logStatus(`Processing ${pages.length} page(s) in journal`);
            
            // Initialize tracking variables
            let totalFoundInWorld = 0;
            let totalFoundInCompendium = 0;
            
            // Track actor vs item results separately
            let actorLinksSkipped = 0, actorLinksUpgraded = 0, actorLinksCreated = 0, actorErrors = 0, actorLinksFailed = 0;
            let itemLinksSkipped = 0, itemLinksUpgraded = 0, itemLinksCreated = 0, itemErrors = 0, itemLinksFailed = 0;
            let macroLinksSkipped = 0, macroLinksUpgraded = 0, macroLinksCreated = 0, macroErrors = 0, macroLinksFailed = 0;
            
            // Track skip reasons
            let skipReasons = {
                actors: { alreadyOptimal: 0, failed: 0, duplicate: 0, invalidName: 0, compendiumNone: 0 },
                items: { alreadyOptimal: 0, failed: 0, duplicate: 0, invalidName: 0, compendiumNone: 0 },
                macros: { alreadyOptimal: 0, failed: 0, duplicate: 0, invalidName: 0 }
            };
            
            for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
                // Check for stop request
                if (checkStopRequest()) {
                    logStatus("Processing stopped by user request.", "warning");
                    break;
                }
                
                const page = pages[pageIndex];
                const overallProgress = 10 + (pageIndex / pages.length) * 80; // 10-90% for pages
                updateOverallProgress(overallProgress, `Processing Entry ${pageIndex + 1} of ${pages.length}: ${page.name}`);
                updatePageProgress(0, `Starting page: ${page.name}`);
                let pageContent = page.text.content;
                if (!pageContent) {
                    logStatus(`Skipping empty entry: ${page.name}`, "warning");
                    continue;
                }
                
                logStatus(`Processing entry: ${page.name} (${pageContent.length} chars)`);
                
                // Force UI update after each page starts
                await new Promise(resolve => setTimeout(resolve, 10));
                
                // Page processing header
                logStatus("========================================================", "report-line-thick");
                logStatus(`PROCESSING: ${page.name.toUpperCase()}`, "report-header");
                logStatus("========================================================", "report-line-thick");
                
                // Collect all potential entities from all scanning methods
                const allEntities = [];
                
                updatePageProgress(10, "Scanning for entities...");
                
                // Initialize page-level counters
                let pageActorUpgraded = 0, pageActorSkipped = 0, pageActorCreated = 0, pageActorErrors = 0, pageActorFailed = 0;
                let pageItemUpgraded = 0, pageItemSkipped = 0, pageItemCreated = 0, pageItemErrors = 0, pageItemFailed = 0;
                let pageMacroUpgraded = 0, pageMacroSkipped = 0, pageMacroCreated = 0, pageMacroErrors = 0, pageMacroFailed = 0;
                
                // Only scan for actors/items if those tools are enabled
                if (upgradeActors || upgradeItems) {
                    // Scan for all entities (both actors and items) in one pass
                    const existingLinks = this._scanJournalForLinks(pageContent, 'both');
                    const bulletListEntities = this._scanJournalForBulletListEntities(pageContent, 'both');
                    const manualLinkEntities = this._scanJournalForManualLinkEntities(pageContent, 'both');
                    const htmlEntities = this._scanJournalForHtmlEntities(page, 'both');
                    
                    allEntities.push(...existingLinks, ...bulletListEntities, ...manualLinkEntities, ...htmlEntities);
                    
                    // Analyze what we found and categorize them
                    const actorLinks = existingLinks.filter(e => e.fullMatch.includes('@Actor[') || e.fullMatch.includes('.Actor.'));
                    const itemLinks = existingLinks.filter(e => e.fullMatch.includes('@Item[') || e.fullMatch.includes('.Item.'));
                    const uuidLinks = existingLinks.filter(e => e.fullMatch.includes('@UUID[') && !e.fullMatch.includes('@Actor[') && !e.fullMatch.includes('@Item['));
                    
                    // Count potential actors vs items in other categories
                    let potentialActors = 0;
                    let potentialItems = 0;
                    
                    // Analyze bullet list entities
                    for (const entity of bulletListEntities) {
                        // Simple heuristic: if it's in an encounter section, likely actor; if in treasure section, likely item
                        const contextBefore = pageContent.substring(Math.max(0, entity.startIndex - 500), entity.startIndex);
                        if (this._isEncounterHeading(contextBefore.split('\n').pop() || '')) {
                            potentialActors++;
                        } else if (this._isItemHeading(contextBefore.split('\n').pop() || '')) {
                            potentialItems++;
                        } else {
                            // Default to actor for bullet lists (most common)
                            potentialActors++;
                        }
                    }
                    
                    // Analyze manual link entities
                    for (const entity of manualLinkEntities) {
                        // Default to actor for manual links (most common)
                        potentialActors++;
                    }
                    
                    // Analyze HTML entities
                    for (const entity of htmlEntities) {
                        // Check if it's in a treasure/reward context
                        const contextBefore = pageContent.substring(Math.max(0, entity.startIndex - 500), entity.startIndex);
                        if (this._isItemHeading(contextBefore.split('\n').pop() || '')) {
                            potentialItems++;
                        } else {
                            // Default to actor for HTML entities
                            potentialActors++;
                        }
                    }
                    
                    const totalCandidates = existingLinks.length + bulletListEntities.length + manualLinkEntities.length + htmlEntities.length;
                    
                    logStatus(`Found ${totalCandidates} Unique Entities`);
                    if (uuidLinks.length > 0) {
                        logStatus(`${uuidLinks.length} Generic UUID Links`);
                    }
                    logStatus("");
                    logStatus("ACTORS");
                    logStatus(`- ${actorLinks.length} Actor Links`);
                    logStatus(`- ${potentialActors} Potential Actors`);
                    logStatus("");
                    logStatus("ITEMS");
                    logStatus(`- ${itemLinks.length} Item Links`);
                    logStatus(`- ${potentialItems} Potential Items`);
                } else {
                    logStatus("No actor/item scanning - only macros enabled");
                }
                
                updatePageProgress(30, "Removing duplicates...");
                
                // Remove duplicates - prioritize existing links over plain text
                const uniqueEntities = [];
                const seen = new Map(); // Map to track best version of each entity
                
                for (const entity of allEntities) {
                    const key = entity.name.toLowerCase();
                    
                    if (!seen.has(key)) {
                        // First time seeing this entity
                        seen.set(key, entity);
                    } else {
                        // We've seen this entity before - keep the better version
                        const existing = seen.get(key);
                        
                        // Prioritize existing links over plain text
                        if (entity.type === 'existing-link' && existing.type !== 'existing-link') {
                            seen.set(key, entity);
                            logStatus(`Replacing plain text with existing link: ${entity.name}`, "info");
                        } else                         if (entity.type === 'existing-link' && existing.type === 'existing-link') {
                            // Both are existing links - keep the first one
                            const entityType = this._determineEntityTypeFromContext(entity, pageContent, allEntities);
                            const typeLabel = entityType === 'actor' ? 'Actor' : entityType === 'item' ? 'Item' : 'Entity';
                            logStatus(`${typeLabel}: Skipped (Duplicate): ${entity.name}`, "warning");
                            // Track skip reason
                            if (entityType === 'actor' || entityType === 'both') {
                                skipReasons.actors.duplicate++;
                            } else {
                                skipReasons.items.duplicate++;
                            }
                        } else {
                            // Both are plain text or other types - keep the first one
                            const entityType = this._determineEntityTypeFromContext(entity, pageContent, allEntities);
                            const typeLabel = entityType === 'actor' ? 'Actor' : entityType === 'item' ? 'Item' : 'Entity';
                            logStatus(`${typeLabel}: Skipped (Duplicate): ${entity.name}`, "warning");
                            // Track skip reason
                            if (entityType === 'actor' || entityType === 'both') {
                                skipReasons.actors.duplicate++;
                            } else {
                                skipReasons.items.duplicate++;
                            }
                        }
                    }
                }
                
                // Convert map values back to array
                uniqueEntities.push(...seen.values());
                
                logStatus(`Found ${uniqueEntities.length} unique entities to process`);
                
                updatePageProgress(40, "Processing entities...");
                
                // Process each unique entity (only if actors/items are enabled)
                let contentChanged = false;
                
                if (upgradeActors || upgradeItems) {
                    for (let i = 0; i < uniqueEntities.length; i++) {
                        // Check for stop request
                        if (checkStopRequest()) {
                            logStatus("Processing stopped by user request.", "warning");
                            break;
                        }
                        
                        const entity = uniqueEntities[i];
                        const pageProgress = 40 + (i / uniqueEntities.length) * 40; // 40-80% for entities
                        updatePageProgress(pageProgress, `Processing ${entity.name}...`);
                        
                        // Add a small delay to make progress visible
                        if (i % 3 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 10));
                        }
                        
                        try {
                            // Determine entity type based on where it was found and context
                            let entityType = this._determineEntityTypeFromContext(entity, pageContent, uniqueEntities);
                            
                            logStatus(`Processing: ${entity.name} (${entity.type}) -> ${entityType} bias`);
                            
                            const result = await this._upgradeEntityLinkUnified(entity, pageContent, entityType);
                            
                            // Track different types of results
                            if (result.skipReason) {
                                // Handle skip reasons
                                totalSkipped++;
                                const typeLabel = entityType === 'actor' ? 'Actor' : entityType === 'item' ? 'Item' : 'Entity';
                                                            if (result.skipReason === 'alreadyOptimal') {
                                logStatus(`${typeLabel}: Skipped (Already Optimal): ${entity.name}`, "skipped");
                                if (entityType === 'actor' || entityType === 'both') {
                                    pageActorSkipped++;
                                    skipReasons.actors.alreadyOptimal++;
                                } else {
                                    pageItemSkipped++;
                                    skipReasons.items.alreadyOptimal++;
                                }
                            } else if (result.skipReason === 'notFound') {
                                logStatus(`${typeLabel}: Failed (Not Found): ${entity.name}`, "failed");
                                if (entityType === 'actor' || entityType === 'both') {
                                    pageActorFailed++;
                                    skipReasons.actors.failed++;
                                } else {
                                    pageItemFailed++;
                                    skipReasons.items.failed++;
                                }
                            }
                            } else if (result.foundInWorld && !result.foundInCompendium) {
                                totalFoundInWorld++;
                                const typeLabel = result.foundEntityType === 'actor' ? 'Actor' : 'Item';
                                logStatus(`✓ ${typeLabel}: Found in world: ${entity.name}`, "success");
                            } else if (result.foundInCompendium) {
                                totalFoundInCompendium++;
                                const typeLabel = result.foundEntityType === 'actor' ? 'Actor' : 'Item';
                                if (entity.type === 'existing-link') {
                                    logStatus(`✓ ${typeLabel}: Upgraded to ${result.compendiumName}: ${entity.name}`, "success");
                                    if (result.foundEntityType === 'actor') {
                                        pageActorUpgraded++;
                                    } else if (result.foundEntityType === 'item') {
                                        pageItemUpgraded++;
                                    }
                                } else {
                                    logStatus(`✓ ${typeLabel}: Linked to ${result.compendiumName}: ${entity.name}`, "success");
                                    if (result.foundEntityType === 'actor') {
                                        pageActorCreated++;
                                    } else if (result.foundEntityType === 'item') {
                                        pageItemCreated++;
                                    }
                                }
                            }
                            
                            // Update content if changed
                            if (result.newContent !== pageContent) {
                                pageContent = result.newContent;
                                contentChanged = true;
                                totalUpgraded++;
                            }
                        } catch (error) {
                            totalErrors++;
                            // Log errors to console instead of UI
                            postConsoleAndNotification(`Journal Tools: Error processing entity`, 
                                `${entity.name}: ${error.message}`, false, false, false);
                            logStatus(`✗ Error processing ${entity.name}`, "error");
                            
                            // Track actor vs item errors
                            if (entityType === 'actor' || entityType === 'both') {
                                pageActorErrors++;
                            } else {
                                pageItemErrors++;
                            }
                        }
                    }
                } else {
                    logStatus("Skipping entity processing - only macros enabled");
                }
                
                updatePageProgress(80, "Processing macros...");
                
                // Process macros if requested
                if (upgradeMacros) {
                    const macros = this._scanJournalForMacros(pageContent);
                    logStatus(`Found ${macros.length} macro links to process`);
                    
                    for (let i = 0; i < macros.length; i++) {
                        // Check for stop request
                        if (checkStopRequest()) {
                            logStatus("Macro processing stopped by user request.", "warning");
                            break;
                        }
                        
                        const macro = macros[i];
                        const macroProgress = 80 + (i / macros.length) * 10; // 80-90% for macros
                        updatePageProgress(macroProgress, `Processing macro: ${macro.name}...`);
                        
                        // Force UI update for each macro
                        await new Promise(resolve => setTimeout(resolve, 10));
                        
                        try {
                            const result = await this._upgradeMacroLink(macro, pageContent);
                            
                            if (result.success) {
                                pageContent = result.newContent;
                                contentChanged = true;
                                pageMacroUpgraded++;
                                logStatus(`✓ Macro: Upgraded: ${macro.name}`, "success");
                            } else {
                                pageMacroFailed++;
                                skipReasons.macros.failed++;
                                logStatus(`Macro: Failed (Not Found): ${macro.name}`, "failed");
                            }
                        } catch (error) {
                            pageMacroErrors++;
                            logStatus(`✗ Error processing macro ${macro.name}: ${error.message}`, "error");
                        }
                    }
                    
                    logStatus(`Macros: ${pageMacroUpgraded} upgraded, ${pageMacroSkipped} skipped, ${pageMacroErrors} errors`);
                }
                
                updatePageProgress(90, "Updating journal...");
                
                // Update the page if content changed
                if (contentChanged) {
                    await page.update({ 'text.content': pageContent });
                    logStatus(`✓ Updated page: ${page.name}`, "success");
                } else {
                    logStatus(`- No changes made to page: ${page.name}`, "warning");
                }
                
                updatePageProgress(100, "Page complete!");
                
                // Page report
                logStatus("========================================================", "report-line-thick");
                logStatus(`RESULTS: ${page.name.toUpperCase()}`, "report-header");
                logStatus("========================================================", "report-line-thick");
                logStatus(`ACTORS: ${pageActorUpgraded} Upgraded, ${pageActorSkipped} Skipped, ${pageActorFailed} Failed, ${pageActorCreated} Created, ${pageActorErrors} Errors`, "report-content");
                logStatus(`ITEMS:  ${pageItemUpgraded} Upgraded, ${pageItemSkipped} Skipped, ${pageItemFailed} Failed, ${pageItemCreated} Created, ${pageItemErrors} Errors`, "report-content");
                logStatus(`MACROS: ${pageMacroUpgraded} Upgraded, ${pageMacroSkipped} Skipped, ${pageMacroFailed} Failed, ${pageMacroCreated} Created, ${pageMacroErrors} Errors`, "report-content");
                logStatus("========================================================", "report-line-thick");
                
                // Accumulate page-level counters to global counters
                actorLinksSkipped += pageActorSkipped;
                actorLinksUpgraded += pageActorUpgraded;
                actorLinksCreated += pageActorCreated;
                actorErrors += pageActorErrors;
                actorLinksFailed += pageActorFailed;
                
                itemLinksSkipped += pageItemSkipped;
                itemLinksUpgraded += pageItemUpgraded;
                itemLinksCreated += pageItemCreated;
                itemErrors += pageItemErrors;
                itemLinksFailed += pageItemFailed;
                
                macroLinksSkipped += pageMacroSkipped;
                macroLinksUpgraded += pageMacroUpgraded;
                macroLinksCreated += pageMacroCreated;
                macroErrors += pageMacroErrors;
                macroLinksFailed += pageMacroFailed;
            }
            
            updateOverallProgress(100, "Complete!");
            logStatus("");
            logStatus("");
            logStatus("Journal tools processing completed successfully!", "system");
            logStatus("");
            logStatus("========================================================", "report-line-thick");
            logStatus(`FINAL REPORT: ${journal.name.toUpperCase()}`, "report-header");
            logStatus("========================================================", "report-line-thick");
            logStatus("ACTORS", "report-subheader");
            logStatus(`- ${actorLinksSkipped} Actor Links Skipped`, "report-content");
            if (actorLinksSkipped > 0) {
                if (skipReasons.actors.alreadyOptimal > 0) logStatus(`  • ${skipReasons.actors.alreadyOptimal} Already Optimal`, "report-content");
                if (skipReasons.actors.duplicate > 0) logStatus(`  • ${skipReasons.actors.duplicate} Duplicate`, "report-content");
                if (skipReasons.actors.invalidName > 0) logStatus(`  • ${skipReasons.actors.invalidName} Invalid Name`, "report-content");
                if (skipReasons.actors.compendiumNone > 0) logStatus(`  • ${skipReasons.actors.compendiumNone} Compendium None`, "report-content");
            }
            logStatus(`- ${actorLinksFailed} Actor Links Failed`, "report-content");
            if (actorLinksFailed > 0) {
                if (skipReasons.actors.failed > 0) logStatus(`  • ${skipReasons.actors.failed} Not Found`, "report-content");
            }
            logStatus(`- ${actorLinksUpgraded} Actor Links Upgraded`, "report-content");
            logStatus(`- ${actorLinksCreated} Actor Links Created`, "report-content");
            logStatus(`- ${actorErrors} Actor Errors`, "report-content");
            logStatus("--------------------------------------------------------", "report-line-thin");
            logStatus("ITEMS", "report-subheader");
            logStatus(`- ${itemLinksSkipped} Item Links Skipped`, "report-content");
            if (itemLinksSkipped > 0) {
                if (skipReasons.items.alreadyOptimal > 0) logStatus(`  • ${skipReasons.items.alreadyOptimal} Already Optimal`, "report-content");
                if (skipReasons.items.duplicate > 0) logStatus(`  • ${skipReasons.items.duplicate} Duplicate`, "report-content");
                if (skipReasons.items.invalidName > 0) logStatus(`  • ${skipReasons.items.invalidName} Invalid Name`, "report-content");
                if (skipReasons.items.compendiumNone > 0) logStatus(`  • ${skipReasons.items.compendiumNone} Compendium None`, "report-content");
            }
            logStatus(`- ${itemLinksFailed} Item Links Failed`, "report-content");
            if (itemLinksFailed > 0) {
                if (skipReasons.items.failed > 0) logStatus(`  • ${skipReasons.items.failed} Not Found`, "report-content");
            }
            logStatus(`- ${itemLinksUpgraded} Item Links Upgraded`, "report-content");
            logStatus(`- ${itemLinksCreated} Item Links Created`, "report-content");
            logStatus(`- ${itemErrors} Item Errors`, "report-content");
            logStatus("--------------------------------------------------------", "report-line-thin");
            logStatus("MACROS", "report-subheader");
            logStatus(`- ${macroLinksSkipped || 0} Macro Links Skipped`, "report-content");
            if ((macroLinksSkipped || 0) > 0) {
                if (skipReasons.macros.alreadyOptimal > 0) logStatus(`  • ${skipReasons.macros.alreadyOptimal} Already Optimal`, "report-content");
                if (skipReasons.macros.duplicate > 0) logStatus(`  • ${skipReasons.macros.duplicate} Duplicate`, "report-content");
                if (skipReasons.macros.invalidName > 0) logStatus(`  • ${skipReasons.macros.invalidName} Invalid Name`, "report-content");
            }
            logStatus(`- ${macroLinksFailed || 0} Macro Links Failed`, "report-content");
            if ((macroLinksFailed || 0) > 0) {
                if (skipReasons.macros.failed > 0) logStatus(`  • ${skipReasons.macros.failed} Not Found`, "report-content");
            }
            logStatus(`- ${macroLinksUpgraded || 0} Macro Links Upgraded`, "report-content");
            logStatus(`- ${macroLinksCreated || 0} Macro Links Created`, "report-content");
            logStatus(`- ${macroErrors || 0} Macro Errors`, "report-content");
            logStatus("--------------------------------------------------------", "report-line-thin");
            logStatus("SETTINGS", "report-subheader");
            logStatus(`- Actors=${upgradeActors}`, "report-content");
            logStatus(`- Items=${upgradeItems}`, "report-content");
            logStatus(`- Macros=${upgradeMacros}`, "report-content");
            logStatus(`- Search World Items First: ${game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsFirst')}`, "report-content");
            logStatus(`- Search World Actors First: ${game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsFirst')}`, "report-content");
            logStatus(`- Search World Items Last: ${game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsLast')}`, "report-content");
            logStatus(`- Search World Actors Last: ${game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsLast')}`, "report-content");
            logStatus("--------------------------------------------------------", "report-line-thin");
            logStatus("TOTALS", "report-subheader");
            logStatus(`- ${pages.length} Pages Processed`, "report-content");
            logStatus(`- ${totalFoundInCompendium + totalFoundInWorld} Entities Processed`, "report-content");
            logStatus(`- ${actorLinksSkipped + itemLinksSkipped + (macroLinksSkipped || 0)} Links Skipped`, "report-content");
            logStatus(`- ${actorLinksFailed + itemLinksFailed + (macroLinksFailed || 0)} Links Failed`, "report-content");
            logStatus(`- ${actorLinksUpgraded + itemLinksUpgraded + (macroLinksUpgraded || 0)} Links Upgraded`, "report-content");
            logStatus(`- ${actorLinksCreated + itemLinksCreated + (macroLinksCreated || 0)} Links Created`, "report-content");
            logStatus(`- ${actorErrors + itemErrors + (macroErrors || 0)} Errors`, "report-content");
            logStatus("========================================================", "report-line-thick");
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error in unified upgrade`, 
                error.message, false, false, false);
            throw error;
        }
    }

    // Generic method to scan for existing links
    static _scanJournalForLinks(content, entityType) {
        const links = [];
        let linkPattern;
        
        if (entityType === 'actor') {
            linkPattern = /@UUID\[([^\]]+)\]\{([^}]+)\}|@Actor\[([^\]]+)\]\{([^}]+)\}/gi;
        } else if (entityType === 'item') {
            linkPattern = /@UUID\[([^\]]+)\]\{([^}]+)\}|@Item\[([^\]]+)\]\{([^}]+)\}/gi;
        } else {
            // 'both' - scan for all types of links
            linkPattern = /@UUID\[([^\]]+)\]\{([^}]+)\}|@Actor\[([^\]]+)\]\{([^}]+)\}|@Item\[([^\]]+)\]\{([^}]+)\}/gi;
        }
        
        let match;
        while ((match = linkPattern.exec(content)) !== null) {
            const uuid = match[1] || match[3] || match[5];
            const name = match[2] || match[4] || match[6];
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
        let foundAnySection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if we're entering a relevant section
            let isRelevantSection = false;
            if (entityType === 'actor') {
                isRelevantSection = this._isEncounterHeading(line);
            } else if (entityType === 'item') {
                isRelevantSection = this._isItemHeading(line);
            } else {
                // 'both' - check for either type of section
                isRelevantSection = this._isEncounterHeading(line) || this._isItemHeading(line);
            }
            
            if (isRelevantSection) {
                inRelevantSection = true;
                foundAnySection = true;
                postConsoleAndNotification(`Journal Tools: Found relevant section`, 
                    `${line}`, false, true, false);
                continue;
            }
            
            // Only scan if we're in a relevant section - no more scanning everything
            if (!foundAnySection) {
                inRelevantSection = false;
            }
            
            // Skip if not in a relevant section
            if (!inRelevantSection) continue;
            
            // Check if this is a bullet list item
            if (this._isBulletListItem(line)) {
                postConsoleAndNotification(`Journal Tools: Found bullet item`, 
                    `Line ${i}: "${line}"`, false, true, false);
                
                // First, try to extract from the bullet line itself
                let entityName = this._extractEntityNameFromBullet(line, entityType);
                
                // If no entity found on the bullet line, look at subsequent lines
                if (!entityName) {
                    // Look ahead up to 3 lines to find the entity name
                    for (let j = 1; j <= 3 && i + j < lines.length; j++) {
                        const nextLine = lines[i + j].trim();
                        postConsoleAndNotification(`Journal Tools: Checking line ${i + j}`, 
                            `"${nextLine}"`, false, true, false);
                        
                        // If we hit another bullet or heading, stop looking
                        if (this._isBulletListItem(nextLine) || this._isHeading(nextLine)) {
                            break;
                        }
                        
                        // If the line has content, try to extract an entity name
                        if (nextLine) {
                            entityName = this._extractEntityNameFromPlainText(nextLine, entityType);
                            
                            if (entityName) {
                                postConsoleAndNotification(`Journal Tools: Found entity on line ${i + j}`, 
                                    `${entityName}`, false, true, false);
                                entities.push({
                                    type: 'bullet-list',
                                    name: entityName,
                                    startIndex: content.indexOf(lines[i + j]),
                                    endIndex: content.indexOf(lines[i + j]) + lines[i + j].length,
                                    fullMatch: lines[i + j]
                                });
                                break;
                            }
                        }
                    }
                } else if (entityName) {
                    postConsoleAndNotification(`Journal Tools: Found entity on bullet line`, 
                        `${entityName}`, false, true, false);
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
            let previousEntityType = null; // Track previous entity type for context
            
            while ((match = liPattern.exec(htmlContent)) !== null) {
                const liContent = match[1];
                const strippedContent = liContent.replace(/<[^>]+>/g, '').trim();
                
                if (strippedContent) {
                    // Check if this <li> contains a UUID link (including malformed ones)
                    const uuidPattern = /@UUID\[([^\]]+)\]\{([^}]+)\}|@Actor\[([^\]]+)\]\{([^}]+)\}|@Item\[([^\]]+)\]\{([^}]+)\}|@UUID\{([^}]+)\}/gi;
                    const uuidMatch = strippedContent.match(uuidPattern);
                    
                    if (uuidMatch) {
                        // Extract the display name from the UUID link
                        const displayNameMatch = strippedContent.match(/\{([^}]+)\}/);
                        if (displayNameMatch) {
                            const displayName = displayNameMatch[1];
                            
                            // Determine entity type from UUID for contextual bias
                            let detectedEntityType = null;
                            if (entityType === 'both') {
                                if (strippedContent.toLowerCase().includes('actor')) {
                                    detectedEntityType = 'actor';
                                    previousEntityType = 'actor';
                                    postConsoleAndNotification(`Journal Tools: Found Actor UUID`, 
                                        `"${displayName}" - bypassing validation`, false, true, false);
                                } else if (strippedContent.toLowerCase().includes('item')) {
                                    detectedEntityType = 'item';
                                    previousEntityType = 'item';
                                    postConsoleAndNotification(`Journal Tools: Found Item UUID`, 
                                        `"${displayName}" - bypassing validation`, false, true, false);
                                } else {
                                    postConsoleAndNotification(`Journal Tools: Found generic UUID`, 
                                        `"${displayName}" - processing as potential entity`, false, true, false);
                                }
                            }
                            
                            entities.push({
                                type: 'html-list',
                                name: displayName,
                                startIndex: match.index,
                                endIndex: match.index + match[0].length,
                                fullMatch: match[0],
                                liStart: match.index,
                                liEnd: match.index + match[0].length,
                                originalContent: liContent,
                                isUuidLink: true,
                                detectedEntityType: detectedEntityType
                            });
                        }
                    } else {
                        // Check if this li tag contains actual entity candidates before processing
                        if (!this._containsEntityCandidates(liContent)) {
                            postConsoleAndNotification(`Journal Tools: Skipping li tag - no entity candidates`, 
                                `"${strippedContent}"`, false, true, false);
                            continue;
                        }
                        
                        // Handle colon-separated items like "Items: Shortsword, Leather armor"
                        if (strippedContent.includes(':')) {
                            const [prefix, itemsPart] = strippedContent.split(':', 2);
                            if (itemsPart) {
                                // Strip HTML tags from itemsPart before processing
                                const cleanItemsPart = itemsPart.replace(/<[^>]+>/g, '').trim();
                                const itemNames = cleanItemsPart.split(',').map(item => item.trim());
                                
                                for (const itemName of itemNames) {
                                    if (itemName) {
                                        // For 'both' entity type, try both actor and item extraction
                                        let entityName = null;
                                        if (entityType === 'both') {
                                            entityName = this._extractEntityNameFromPlainText(itemName, 'actor') || 
                                                       this._extractEntityNameFromPlainText(itemName, 'item');
                                        } else {
                                            entityName = this._extractEntityNameFromPlainText(itemName, entityType);
                                        }
                                        
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
                            let entityName = null;
                            let currentEntityType = entityType;
                            
                            // Use contextual bias if available and entityType is 'both'
                            if (entityType === 'both' && previousEntityType) {
                                // Try the previous entity type first
                                entityName = this._extractEntityNameFromPlainText(strippedContent, previousEntityType);
                                if (entityName) {
                                    currentEntityType = previousEntityType;
                                    postConsoleAndNotification(`Journal Tools: Using contextual bias`, 
                                        `"${strippedContent}" -> ${previousEntityType} (previous was ${previousEntityType})`, false, true, false);
                                }
                            }
                            
                            // If no contextual match or no context, try both types
                            if (!entityName && entityType === 'both') {
                                entityName = this._extractEntityNameFromPlainText(strippedContent, 'actor') || 
                                           this._extractEntityNameFromPlainText(strippedContent, 'item');
                            } else if (!entityName) {
                                entityName = this._extractEntityNameFromPlainText(strippedContent, entityType);
                            }
                            
                            if (entityName) {
                                // Update previous entity type for next iteration
                                if (entityType === 'both') {
                                    previousEntityType = currentEntityType;
                                }
                                
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
                            } else {
                                // Debug logging for rejected entities
                                postConsoleAndNotification(`Journal Tools: Rejected entity in HTML list`, 
                                    `"${strippedContent}" -> null`, false, true, false);
                            }
                        }
                    }
                }
            }
        }
        
        return entities;
    }

    // Method to scan for macro links
    static _scanJournalForMacros(content) {
        const macros = [];
        
        // Look for macro UUID patterns: @UUID[Macro.xxx]{Name}
        const macroPattern = /@UUID\[Macro\.([^\]]+)\]\{([^}]+)\}/gi;
        let match;
        
        while ((match = macroPattern.exec(content)) !== null) {
            const macroId = match[1];
            const macroName = match[2];
            
            macros.push({
                type: 'macro-link',
                name: macroName,
                macroId: macroId,
                startIndex: match.index,
                endIndex: match.index + match[0].length,
                fullMatch: match[0]
            });
        }
        
        return macros;
    }

    // Check if a line is an encounter heading
    static _isEncounterHeading(line) {
        const encounterKeywords = [
            'encounter',
            'encounters',
            'monster',
            'monsters',
            'npc',
            'npcs',
            'combat',
            'enemies',
            'foes',
            'adversaries',
            'creatures',
            'monsters and npcs',
            'combat encounter',
            'combat encounters'
        ];
        
        const lowerLine = line.toLowerCase();
        return encounterKeywords.some(keyword => lowerLine.includes(keyword));
    }

    // Check if a line is an item heading
    static _isItemHeading(line) {
        const itemKeywords = [
            'treasure',
            'treasures',
            'reward',
            'rewards',
            'xp',
            'experience',
            'loot',
            'items',
            'equipment',
            'gear',
            'weapons',
            'armor',
            'magic items',
            'consumables',
            'treasure and experience',
            'treasure and xp',
            'loot and xp',
            'loot and experience',
            'rewards and treasure',
            'rewards and xp'
        ];
        
        const lowerLine = line.toLowerCase();
        return itemKeywords.some(keyword => lowerLine.includes(keyword));
    }

    // Check if a line is a bullet list item
    static _isBulletListItem(line) {
        return /^[•*+]\s/.test(line);
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
        // Remove bullet and common prefixes (no more dashes)
        let entityName = line.replace(/^[•*+]\s*/, '').trim();
        
        // Remove common suffixes like "(x2)" etc.
        entityName = entityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation (but not colons, as items might be "Gem: Diamond")
        entityName = entityName.replace(/[.,;]$/, '').trim();
        
        // Skip if it ends with a period (likely a sentence)
        if (entityName.endsWith('.')) {
            return null;
        }
        
        // Count words - must be less than 5 words
        const wordCount = entityName.split(/\s+/).length;
        if (wordCount >= 5) {
            return null;
        }
        
        // Skip if it looks like a category label (ends with colon and no content after)
        if (entityName.endsWith(':') && entityName.split(':').length === 2 && entityName.split(':')[1].trim() === '') {
            return null;
        }
        
        return entityName.length > 0 ? entityName : null;
    }

    // Generic method to extract entity name from plain text
    static _extractEntityNameFromPlainText(line, entityType) {
        let entityName = line.trim();
        
        // Debug logging for entity extraction
        postConsoleAndNotification(`Journal Tools: Extracting entity from plain text`, 
            `"${entityName}" (${entityType})`, false, true, false);
        
        // Skip if it's too short or too long
        if (entityName.length < 2 || entityName.length > 100) {
            postConsoleAndNotification(`Journal Tools: Rejected - length check`, 
                `${entityName.length} chars`, false, true, false);
            return null;
        }
        
        // Skip if it's just whitespace
        if (entityName === '') {
            postConsoleAndNotification(`Journal Tools: Rejected - empty`, 
                `"${entityName}"`, false, true, false);
            return null;
        }
        
        // Skip if it ends with a period (likely a sentence)
        if (entityName.endsWith('.')) {
            postConsoleAndNotification(`Journal Tools: Rejected - ends with period`, 
                `"${entityName}"`, false, true, false);
            return null;
        }
        
        // Removed word count check - using character count instead
        
        // Remove common suffixes like "(x2)" etc.
        entityName = entityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Remove trailing punctuation (but not colons, as items might be "Gem: Diamond")
        entityName = entityName.replace(/[.,;]$/, '').trim();
        
        // Skip if it's too short after cleaning
        if (entityName.length < 2) {
            return null;
        }
        
        // Skip if it looks like a category label (ends with colon and no content after)
        if (entityName.endsWith(':') && entityName.split(':').length === 2 && entityName.split(':')[1].trim() === '') {
            postConsoleAndNotification(`Journal Tools: Rejected - category label`, 
                `"${entityName}"`, false, true, false);
            return null;
        }
        
        const result = entityName.length > 0 ? entityName : null;
        if (result) {
            postConsoleAndNotification(`Journal Tools: Accepted entity`, 
                `"${entityName}" -> "${result}"`, false, true, false);
        } else {
            postConsoleAndNotification(`Journal Tools: Rejected - final check`, 
                `"${entityName}" -> null`, false, true, false);
        }
        return result;
    }

    // Generic method to upgrade a single entity link
    static async _upgradeEntityLink(entity, content, entityType) {
        try {
            postConsoleAndNotification(`Journal Tools: Processing ${entityType}`, 
                `${entity.name} (${entity.type})`, false, true, false);
            
            // Find the entity in compendiums
            let uuid = await this._findEntityInCompendiums(entity.name, entityType);
            
            // If not found in the specific entity type compendiums, try searching both
            if (!uuid) {
                postConsoleAndNotification(`Journal Tools: ${entityType} not found, trying both compendiums`, 
                    entity.name, false, true, false);
                uuid = await this._findEntityInBothCompendiums(entity.name);
            }
            
            if (!uuid) {
                            postConsoleAndNotification(`Journal Tools: Entity not found in any compendium`, 
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
            
            if (entity.isUuidLink) {
                // For existing UUID links, replace the entire UUID with the new one
                const uuidPattern = /@UUID\[([^\]]+)\]\{([^}]+)\}|@Actor\[([^\]]+)\]\{([^}]+)\}|@Item\[([^\]]+)\]\{([^}]+)\}/gi;
                const updatedLiContent = liContent.replace(uuidPattern, newLink);
                newContent = content.substring(0, liStart) + updatedLiContent + content.substring(liEnd);
            } else {
                // For plain text entities, replace just the entity name
                const updatedLiContent = liContent.replace(entity.name, newLink);
                newContent = content.substring(0, liStart) + updatedLiContent + content.substring(liEnd);
            }
        } else {
            // For other types, replace the full match
            newContent = content.substring(0, entity.startIndex) + newLink + content.substring(entity.endIndex);
        }
            
            postConsoleAndNotification(`Journal Tools: Successfully upgraded ${entityType}`, 
                `${entity.name} -> ${newLink}`, false, true, false);
            
            return newContent;
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error upgrading ${entityType}`, 
                `${entity.name}: ${error.message}`, false, false, false);
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
            
            // Console only - debug only
            postConsoleAndNotification(`Journal Tools: Searching for ${entityType}`, 
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
                    postConsoleAndNotification(`Journal Tools: Found ${entityType} in world`, 
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
                    
                    if (!compendiumName || compendiumName === '' || compendiumName === 'none') {
                        // Skip silently - this is normal for unconfigured compendiums
                        continue;
                    }
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) {
                            // Only warn if the compendium is configured but doesn't exist
                            postConsoleAndNotification(`Journal Tools: Configured compendium not found`, 
                                `${compendiumName} (${settingKey})`, false, false, true);
                            continue;
                        }
                        
                        const index = await pack.getIndex();
                        
                        // Only use exact match - no partial matching to avoid false positives
                        let entry = index.find(e => 
                            e.name.toLowerCase() === searchName.toLowerCase()
                        );
                        
                        if (entry) {
                            // Console only - always show successful finds
                            postConsoleAndNotification(`Journal Tools: Found ${entityType} in compendium`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, false, false);
                            return `Compendium.${compendiumName}.${entityType === 'actor' ? 'Actor' : 'Item'}.${entry._id}`;
                        } else {
                            // Console only - debug only
                            postConsoleAndNotification(`Journal Tools: ${entityType} not found in compendium`, 
                                `${searchName} not found in ${compendiumName}`, false, true, false);
                        }
                    } catch (error) {
                        postConsoleAndNotification(`Journal Tools: Error searching compendium`, 
                            `${compendiumName}: ${error.message}`, false, true, false);
                    }
                }
            }
            
            // Console only - debug only
            postConsoleAndNotification(`Journal Tools: ${entityType} not found in any compendium`, 
                strEntityName, false, true, false);
            return null;
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error finding ${entityType} in compendiums`, 
                `${entityName}: ${error.message}`, false, false, false);
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
            
            postConsoleAndNotification(`Journal Tools: Searching both compendiums`, 
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
                    
                    if (!compendiumName || compendiumName === '' || compendiumName === 'none') continue;
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) continue;
                        
                        const index = await pack.getIndex();
                        
                        let entry = index.find(e => e.name.toLowerCase() === searchName.toLowerCase());
                        
                        if (entry) {
                            // Console only - always show
                            postConsoleAndNotification(`Journal Tools: Found in actor compendium`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, false, false);
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
                    
                    if (!compendiumName || compendiumName === '' || compendiumName === 'none') continue;
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) continue;
                        
                        const index = await pack.getIndex();
                        
                        let entry = index.find(e => e.name.toLowerCase() === searchName.toLowerCase());
                        
                        if (entry) {
                            // Console only - always show
                            postConsoleAndNotification(`Journal Tools: Found in item compendium`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, false, false);
                            return `Compendium.${compendiumName}.Item.${entry._id}`;
                        }
                    } catch (error) {
                        // Continue to next compendium
                    }
                }
            }
            
            // Console only - debug only
            postConsoleAndNotification(`Journal Tools: Not found in any compendium`, 
                strEntityName, false, true, false);
            return null;
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error searching both compendiums`, 
                `${entityName}: ${error.message}`, false, false, false);
            return null;
        }
    }

    // Determine entity type based on context and existing links
    static _determineEntityTypeFromContext(entity, pageContent, allEntities) {
        // Get entity position early since it's used in multiple places
        const entityPosition = entity.startIndex;
        
        // If we have a detected entity type from UUID analysis, use it (100% accurate)
        if (entity.detectedEntityType) {
            postConsoleAndNotification(`Journal Tools: Using detected entity type from UUID`, 
                `${entity.name}: ${entity.detectedEntityType}`, false, true, false);
            return entity.detectedEntityType;
        }
        
        // If it's an existing link, determine type from the link itself
        if (entity.type === 'existing-link') {
            if (entity.fullMatch.includes('@Actor[') || entity.fullMatch.includes('Actor.')) {
                return 'actor';
            } else if (entity.fullMatch.includes('@Item[') || entity.fullMatch.includes('Item.')) {
                return 'item';
            }
        }
        
        // HIGHEST PRIORITY: Check if this entity is part of a list and use list-based logic
        if (entity.type === 'html-list' || entity.type === 'bullet-list') {
            // Find the previous entity in the same list
            let previousEntityInList = null;
            let minDistance = Infinity;
            
            for (const otherEntity of allEntities) {
                if (otherEntity === entity) continue; // Skip self
                
                // Only consider entities that are in the same list (similar distance from start)
                const distance = Math.abs(otherEntity.startIndex - entityPosition);
                if (distance < minDistance && distance < 200) { // Within 200 chars = same list
                    // Check if this other entity is before the current entity
                    if (otherEntity.startIndex < entityPosition) {
                        minDistance = distance;
                        previousEntityInList = otherEntity;
                    }
                }
            }
            
            if (previousEntityInList) {
                postConsoleAndNotification(`Journal Tools: Found previous entity in list for ${entity.name}`, 
                    `${previousEntityInList.name} (${previousEntityInList.type})`, false, true, false);
                
                // Determine the type of the previous entity
                if (previousEntityInList.type === 'existing-link') {
                    if (previousEntityInList.fullMatch.includes('@Actor[') || previousEntityInList.fullMatch.includes('Actor.')) {
                        postConsoleAndNotification(`Journal Tools: List-based bias towards actor`, 
                            `${entity.name}: Previous entity ${previousEntityInList.name} is actor`, false, true, false);
                        return 'actor';
                    } else if (previousEntityInList.fullMatch.includes('@Item[') || previousEntityInList.fullMatch.includes('Item.')) {
                        postConsoleAndNotification(`Journal Tools: List-based bias towards item`, 
                            `${entity.name}: Previous entity ${previousEntityInList.name} is item`, false, true, false);
                        return 'item';
                    }
                }
            }
        }
        
        // Look for section headers and immediate context - use smaller context for more precise detection
        const contextStart = Math.max(0, entityPosition - 1000);
        const contextEnd = Math.min(pageContent.length, entityPosition + 1000);
        const contextContent = pageContent.substring(contextStart, contextEnd);
        
        // Debug: Log the context content to help diagnose issues
        postConsoleAndNotification(`Journal Tools: Context analysis for ${entity.name}`, 
            `Context length: ${contextContent.length}, Position: ${entityPosition}`, false, true, false);
        
        // Check for section headers that indicate entity type - look for both HTML headers and strong/bold text
        const treasurePattern = /<(?:h[1-6]|strong|b)[^>]*>.*?[Tt]reasure.*?<\/(?:h[1-6]|strong|b)>/gi;
        const encounterPattern = /<(?:h[1-6]|strong|b)[^>]*>.*?[Ee]ncounters?.*?<\/(?:h[1-6]|strong|b)>/gi;
        const monsterPattern = /<(?:h[1-6]|strong|b)[^>]*>.*?[Mm]onsters?.*?<\/(?:h[1-6]|strong|b)>/gi;
        const itemPattern = /<(?:h[1-6]|strong|b)[^>]*>.*?[Ii]tems?.*?<\/(?:h[1-6]|strong|b)>/gi;
        
        // Also look for plain text patterns that might indicate sections
        const plainTreasurePattern = /[Tt]reasure[^<]*/gi;
        const plainEncounterPattern = /[Ee]ncounters?[^<]*/gi;
        const plainMonsterPattern = /[Mm]onsters?[^<]*/gi;
        const plainItemPattern = /[Ii]tems?[^<]*/gi;
        
        // Debug: Test each pattern and log results
        const treasureMatch = treasurePattern.test(contextContent) || plainTreasurePattern.test(contextContent);
        const itemMatch = itemPattern.test(contextContent) || plainItemPattern.test(contextContent);
        const encounterMatch = encounterPattern.test(contextContent) || plainEncounterPattern.test(contextContent);
        const monsterMatch = monsterPattern.test(contextContent) || plainMonsterPattern.test(contextContent);
        
        postConsoleAndNotification(`Journal Tools: Section header analysis for ${entity.name}`, 
            `Treasure: ${treasureMatch}, Item: ${itemMatch}, Encounter: ${encounterMatch}, Monster: ${monsterMatch}`, false, true, false);
        
        // Check actor patterns FIRST (higher priority)
        if (encounterMatch || monsterMatch) {
            postConsoleAndNotification(`Journal Tools: Context bias towards actor (section header)`, 
                `${entity.name}: Found Encounters/Monsters section`, false, true, false);
            return 'actor';
        }
        
        // Then check item patterns
        if (treasureMatch || itemMatch) {
            postConsoleAndNotification(`Journal Tools: Context bias towards item (section header)`, 
                `${entity.name}: Found Treasure/Items section`, false, true, false);
            return 'item';
        }
        

        
        // Look for immediate neighbors (previous and next entities in the same list)
        let previousEntity = null;
        let nextEntity = null;
        let minPrevDistance = Infinity;
        let minNextDistance = Infinity;
        
        for (const otherEntity of allEntities) {
            if (otherEntity === entity) continue; // Skip self
            
            const distance = otherEntity.startIndex - entityPosition;
            
            // Find closest previous entity
            if (distance < 0 && Math.abs(distance) < minPrevDistance) {
                minPrevDistance = Math.abs(distance);
                previousEntity = otherEntity;
            }
            
            // Find closest next entity
            if (distance > 0 && distance < minNextDistance) {
                minNextDistance = distance;
                nextEntity = otherEntity;
            }
        }
        
        // Check immediate neighbors for type bias
        let neighborActorCount = 0;
        let neighborItemCount = 0;
        
        // Debug: Log neighbor information
        if (previousEntity) {
            postConsoleAndNotification(`Journal Tools: Previous entity for ${entity.name}`, 
                `${previousEntity.name} (${previousEntity.type}) at distance ${minPrevDistance}`, false, true, false);
        }
        if (nextEntity) {
            postConsoleAndNotification(`Journal Tools: Next entity for ${entity.name}`, 
                `${nextEntity.name} (${nextEntity.type}) at distance ${minNextDistance}`, false, true, false);
        }
        
        if (previousEntity && minPrevDistance < 500) { // Within 500 chars
            if (previousEntity.type === 'existing-link') {
                if (previousEntity.fullMatch.includes('@Actor[') || previousEntity.fullMatch.includes('Actor.')) {
                    neighborActorCount += 2; // Weight previous entity more heavily
                    postConsoleAndNotification(`Journal Tools: Previous entity is actor`, 
                        `${previousEntity.name} -> +2 actor bias`, false, true, false);
                } else if (previousEntity.fullMatch.includes('@Item[') || previousEntity.fullMatch.includes('Item.')) {
                    neighborItemCount += 2;
                    postConsoleAndNotification(`Journal Tools: Previous entity is item`, 
                        `${previousEntity.name} -> +2 item bias`, false, true, false);
                }
            }
        }
        
        if (nextEntity && minNextDistance < 500) { // Within 500 chars
            if (nextEntity.type === 'existing-link') {
                if (nextEntity.fullMatch.includes('@Actor[') || nextEntity.fullMatch.includes('Actor.')) {
                    neighborActorCount += 1;
                    postConsoleAndNotification(`Journal Tools: Next entity is actor`, 
                        `${nextEntity.name} -> +1 actor bias`, false, true, false);
                } else if (nextEntity.fullMatch.includes('@Item[') || nextEntity.fullMatch.includes('Item.')) {
                    neighborItemCount += 1;
                    postConsoleAndNotification(`Journal Tools: Next entity is item`, 
                        `${nextEntity.name} -> +1 item bias`, false, true, false);
                }
            }
        }
        
        // If neighbors provide clear bias, use it
        if (neighborItemCount > neighborActorCount) {
            postConsoleAndNotification(`Journal Tools: Context bias towards item (neighbors)`, 
                `${entity.name}: ${neighborItemCount} item neighbors vs ${neighborActorCount} actor neighbors`, false, true, false);
            return 'item';
        } else if (neighborActorCount > neighborItemCount) {
            postConsoleAndNotification(`Journal Tools: Context bias towards actor (neighbors)`, 
                `${entity.name}: ${neighborActorCount} actor neighbors vs ${neighborItemCount} item neighbors`, false, true, false);
            return 'actor';
        }
        
        // Fall back to broader context analysis
        const contextRange = 1000; // Look within 1000 characters before and after
        const broadContextStart = Math.max(0, entityPosition - contextRange);
        const broadContextEnd = Math.min(pageContent.length, entityPosition + contextRange);
        const broadContextContent = pageContent.substring(broadContextStart, broadContextEnd);
        
        // Count actor vs item links in the broader context
        let actorLinks = 0;
        let itemLinks = 0;
        
        // Look for existing UUID links in the context
        const uuidPattern = /@UUID\[([^\]]+)\]/g;
        let match;
        while ((match = uuidPattern.exec(broadContextContent)) !== null) {
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
        
        // Determine bias based on broader context
        if (actorLinks > itemLinks) {
            postConsoleAndNotification(`Journal Tools: Context bias towards actor (broad context)`, 
                `${entity.name}: ${actorLinks} actor links vs ${itemLinks} item links in context`, false, true, false);
            return 'actor';
        } else if (itemLinks > actorLinks) {
            postConsoleAndNotification(`Journal Tools: Context bias towards item (broad context)`, 
                `${entity.name}: ${itemLinks} item links vs ${actorLinks} actor links in context`, false, true, false);
            return 'item';
        } else {
            // No clear bias, default to searching actors first, then items
            postConsoleAndNotification(`Journal Tools: No context bias, defaulting to actor-first search`, 
                `${entity.name}: ${actorLinks} actor links, ${itemLinks} item links in context`, false, true, false);
            return 'both';
        }
    }

    // Unified method to upgrade a single entity link
    static async _upgradeEntityLinkUnified(entity, content, entityType) {
        try {
            postConsoleAndNotification(`Journal Tools: Processing unified entity`, 
                `${entity.name} (${entity.type}, ${entityType})`, false, true, false);
            
            let uuid = null;
            let foundEntityType = null;
            let foundInWorld = false;
            let foundInCompendium = false;
            
            // For existing links, check if they're already optimal (in first compendium)
            if (entity.type === 'existing-link') {
                // Check if the existing link is already in the first compendium in the stack
                const existingUuid = entity.uuid;
                const isAlreadyOptimal = await this._isLinkAlreadyOptimal(existingUuid, entity.name);
                
                if (isAlreadyOptimal) {
                    postConsoleAndNotification(`Journal Tools: Link already optimal`, 
                        `${entity.name} -> ${existingUuid}`, false, true, false);
                    return { 
                        newContent: content, 
                        compendiumName: null, 
                        foundEntityType: null, 
                        foundInWorld: false, 
                        foundInCompendium: false,
                        skipReason: 'alreadyOptimal'
                    };
                }
                
                postConsoleAndNotification(`Journal Tools: Upgrading existing link to first compendium`, 
                    `${entity.name} -> ${entity.uuid}`, false, true, false);
            }
            
            // Search based on entity type
            if (entityType === 'actor') {
                uuid = await this._findEntityInCompendiums(entity.name, 'actor');
                if (uuid) {
                    foundEntityType = 'actor';
                    foundInCompendium = true;
                }
            } else if (entityType === 'item') {
                uuid = await this._findEntityInCompendiums(entity.name, 'item');
                if (uuid) {
                    foundEntityType = 'item';
                    foundInCompendium = true;
                }
            } else {
                // Search both compendiums and determine the actual type
                uuid = await this._findEntityInBothCompendiumsWithType(entity.name);
                if (uuid) {
                    foundInCompendium = true;
                    // Determine the actual entity type from the UUID
                    if (uuid.includes('.Actor.')) {
                        foundEntityType = 'actor';
                    } else if (uuid.includes('.Item.')) {
                        foundEntityType = 'item';
                    }
                }
            }
            
            // If not found in compendiums, check world as last resort
            if (!uuid) {
                const worldEntities = foundEntityType === 'item' ? game.items : game.actors;
                const worldEntity = worldEntities.find(e => 
                    e.name.toLowerCase() === entity.name.toLowerCase()
                );
                
                if (worldEntity) {
                    uuid = worldEntity.uuid;
                    foundInWorld = true;
                    foundEntityType = foundEntityType || (worldEntity.type === 'Item' ? 'item' : 'actor');
                    postConsoleAndNotification(`Journal Tools: Found entity in world`, 
                        `${entity.name} -> ${worldEntity.uuid}`, false, true, false);
                }
            }
            
            if (!uuid) {
                postConsoleAndNotification(`Journal Tools: Entity not found in any compendium or world`, 
                    entity.name, false, true, false);
                return { 
                    newContent: content, 
                    compendiumName: null, 
                    foundEntityType: null, 
                    foundInWorld: false, 
                    foundInCompendium: false,
                    skipReason: 'notFound'
                };
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
                
                if (entity.isUuidLink) {
                    // For existing UUID links, replace the entire UUID with the new one
                    // Handle both proper UUIDs and malformed ones
                    const uuidPattern = /@UUID\[([^\]]+)\]\{([^}]+)\}|@Actor\[([^\]]+)\]\{([^}]+)\}|@Item\[([^\]]+)\]\{([^}]+)\}|@UUID\{([^}]+)\}/gi;
                    const updatedLiContent = liContent.replace(uuidPattern, newLink);
                    newContent = content.substring(0, liStart) + updatedLiContent + content.substring(liEnd);
                } else {
                    // For plain text entities, replace just the entity name
                    const updatedLiContent = liContent.replace(entity.name, newLink);
                    newContent = content.substring(0, liStart) + updatedLiContent + content.substring(liEnd);
                }
            } else {
                // For other types, replace the full match
                newContent = content.substring(0, entity.startIndex) + newLink + content.substring(entity.endIndex);
            }
            
            // Extract compendium name for status message
            let compendiumName = foundInWorld ? "World" : "Unknown";
            if (foundInCompendium) {
                const compendiumMatch = uuid.match(/Compendium\.([^\.]+)/);
                if (compendiumMatch) {
                    compendiumName = compendiumMatch[1];
                }
            }
            
            postConsoleAndNotification(`Journal Tools: Successfully upgraded unified entity`, 
                `${entity.name} -> ${newLink} (${foundEntityType})`, false, true, false);
            
            return { newContent, compendiumName, foundEntityType, foundInWorld, foundInCompendium };
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error upgrading unified entity`, 
                `${entity.name}: ${error.message}`, false, false, false);
            return { newContent: content, compendiumName: null, foundEntityType: null, foundInWorld: false, foundInCompendium: false };
        }
    }

    // Search both actor and item compendiums and return the UUID (same as _findEntityInBothCompendiums but with better logging)
    static async _findEntityInBothCompendiumsWithType(entityName) {
        try {
            // Clean the entity name
            let strEntityName = entityName.trim();
            
            // Remove HTML tags if present
            strEntityName = strEntityName.replace(/<[^>]+>/g, '').trim();
            
            // Remove common suffixes like "(CR X)" or "(number)"
            strEntityName = strEntityName.replace(/\s*\([^)]*\)\s*$/, '').trim();
            
            // Console only - debug only
            postConsoleAndNotification(`Journal Tools: Searching both compendiums with type detection`, 
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
                // Check world first if enabled
                const searchWorldActorsFirst = game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsFirst');
                const searchWorldItemsFirst = game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsFirst');
                
                // Try world actors first if enabled
                if (searchWorldActorsFirst) {
                    const worldActor = game.actors.getName(searchName);
                    if (worldActor) {
                        postConsoleAndNotification(`Journal Tools: Found in world actors (first)`, 
                            `${searchName} -> ${worldActor.name}`, false, false, false);
                        return `Actor.${worldActor.id}`;
                    }
                }
                
                // Try world items first if enabled
                if (searchWorldItemsFirst) {
                    const worldItem = game.items.getName(searchName);
                    if (worldItem) {
                        postConsoleAndNotification(`Journal Tools: Found in world items (first)`, 
                            `${searchName} -> ${worldItem.name}`, false, false, false);
                        return `Item.${worldItem.id}`;
                    }
                }
                
                // Try actor compendiums
                const actorCompendiums = ['monsterCompendium1', 'monsterCompendium2', 'monsterCompendium3', 'monsterCompendium4', 
                                         'monsterCompendium5', 'monsterCompendium6', 'monsterCompendium7', 'monsterCompendium8'];
                
                for (const settingKey of actorCompendiums) {
                    const compendiumName = game.settings.get('coffee-pub-blacksmith', settingKey);
                    
                    if (!compendiumName || compendiumName === '' || compendiumName === 'none') continue;
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) continue;
                        
                        const index = await pack.getIndex();
                        
                        let entry = index.find(e => e.name.toLowerCase() === searchName.toLowerCase());
                        
                        if (entry) {
                            // Console only - always show
                            postConsoleAndNotification(`Journal Tools: Found in actor compendium (type detection)`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, false, false);
                            return `Compendium.${compendiumName}.Actor.${entry._id}`;
                        }
                    } catch (error) {
                        // Continue to next compendium
                    }
                }
                
                // Try item compendiums
                const itemCompendiums = ['itemCompendium1', 'itemCompendium2', 'itemCompendium3', 'itemCompendium4',
                                        'itemCompendium5', 'itemCompendium6', 'itemCompendium7', 'itemCompendium8'];
                
                for (const settingKey of itemCompendiums) {
                    const compendiumName = game.settings.get('coffee-pub-blacksmith', settingKey);
                    
                    if (!compendiumName || compendiumName === '' || compendiumName === 'none') continue;
                    
                    try {
                        const pack = game.packs.get(compendiumName);
                        if (!pack) continue;
                        
                        const index = await pack.getIndex();
                        
                        let entry = index.find(e => e.name.toLowerCase() === searchName.toLowerCase());
                        
                        if (entry) {
                            // Console only - always show
                            postConsoleAndNotification(`Journal Tools: Found in item compendium (type detection)`, 
                                `${searchName} -> ${entry.name} in ${compendiumName}`, false, false, false);
                            return `Compendium.${compendiumName}.Item.${entry._id}`;
                        }
                    } catch (error) {
                        // Continue to next compendium
                    }
                }
                
                // Check world last if enabled
                const searchWorldActorsLast = game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsLast');
                const searchWorldItemsLast = game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsLast');
                
                // Try world actors last if enabled
                if (searchWorldActorsLast) {
                    const worldActor = game.actors.getName(searchName);
                    if (worldActor) {
                        postConsoleAndNotification(`Journal Tools: Found in world actors (last)`, 
                            `${searchName} -> ${worldActor.name}`, false, false, false);
                        return `Actor.${worldActor.id}`;
                    }
                }
                
                // Try world items last if enabled
                if (searchWorldItemsLast) {
                    const worldItem = game.items.getName(searchName);
                    if (worldItem) {
                        postConsoleAndNotification(`Journal Tools: Found in world items (last)`, 
                            `${searchName} -> ${worldItem.name}`, false, false, false);
                        return `Item.${worldItem.id}`;
                    }
                }
            }
            
            // Console only - debug only
            postConsoleAndNotification(`Journal Tools: Entity not found in any compendium or world`, 
                `"${strEntityName}"`, false, true, false);
            
            return null;
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error searching compendiums with type detection`, 
                `${entityName}: ${error.message}`, false, false, false);
            return null;
        }
    }

    // Check if an existing link is already in the optimal compendium (first in stack)
    static async _isLinkAlreadyOptimal(existingUuid, entityName) {
        try {
            // Extract compendium name from existing UUID
            const compendiumMatch = existingUuid.match(/Compendium\.([^\.]+)/);
            if (!compendiumMatch) {
                // Not a compendium link, check if it's a world link and world is first
                if (existingUuid.includes('Actor.') || existingUuid.includes('Item.')) {
                    const searchWorldActorsFirst = game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsFirst');
                    const searchWorldItemsFirst = game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsFirst');
                    
                    if (existingUuid.includes('Actor.') && searchWorldActorsFirst) {
                        return true;
                    }
                    if (existingUuid.includes('Item.') && searchWorldItemsFirst) {
                        return true;
                    }
                }
                return false;
            }
            
            const existingCompendium = compendiumMatch[1];
            
            // Check if this compendium is first in the stack for this entity type
            const entityType = existingUuid.includes('.Actor.') ? 'actor' : 'item';
            const compendiumSetting = entityType === 'actor' ? 'actorCompendium' : 'itemCompendium';
            
            // Get the first compendium in the stack
            const firstCompendium = game.settings.get('coffee-pub-blacksmith', compendiumSetting);
            
            return existingCompendium === firstCompendium;
            
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error checking if link is optimal`, 
                `${entityName}: ${error.message}`, false, false, false);
            return false;
        }
    }

    // Check if an li tag contains actual entity candidates
    static _containsEntityCandidates(liContent) {
        const strippedContent = liContent.replace(/<[^>]+>/g, '').trim();
        
        // Skip if it's too short
        if (strippedContent.length < 3) {
            return false;
        }
        
        // Skip if it ends with a period (likely a sentence)
        if (strippedContent.endsWith('.')) {
            return false;
        }
        
        // Skip if it contains sentence indicators
        const sentenceIndicators = [
            ' is ', ' are ', ' was ', ' were ', ' has ', ' have ', ' had ',
            ' the ', ' a ', ' an ', ' this ', ' that ', ' these ', ' those ',
            ' with ', ' from ', ' into ', ' during ', ' including ', ' until ',
            ' against ', ' among ', ' throughout ', ' despite ', ' towards ',
            ' upon ', ' within ', ' without ', ' beneath ', ' underneath ',
            ' above ', ' below ', ' behind ', ' beside ', ' between ',
            ' reveals ', ' shows ', ' indicates ', ' suggests ', ' means ',
            ' contains ', ' holds ', ' carries ', ' bears ', ' displays ',
            ' pulses ', ' glows ', ' shines ', ' sparkles ', ' gleams ',
            ' discovery ', ' finding ', ' location ', ' area ', ' region ',
            ' chamber ', ' room ', ' hall ', ' passage ', ' corridor '
        ];
        
        const lowerContent = strippedContent.toLowerCase();
        for (const indicator of sentenceIndicators) {
            if (lowerContent.includes(indicator)) {
                return false;
            }
        }
        
        // Skip if it's too long (likely descriptive text)
        if (strippedContent.length > 50) {
            return false;
        }
        
        // Skip if it contains too many words (likely a sentence)
        const wordCount = strippedContent.split(/\s+/).length;
        if (wordCount > 4) {
            return false;
        }
        
        // Skip if it doesn't contain proper nouns (capitalized words)
        const hasProperNoun = /[A-Z][a-z]+/.test(strippedContent);
        if (!hasProperNoun) {
            return false;
        }
        
        // Skip if it looks like a category label
        if (strippedContent.endsWith(':') && strippedContent.split(':').length === 2) {
            return false;
        }
        
        return true;
    }

    // Method to upgrade macro links
    static async _upgradeMacroLink(macro, content) {
        try {
            const macroName = macro.name;
            
            // Search for the macro in the world
            const worldMacro = game.macros.getName(macroName);
            
            if (worldMacro) {
                // Create the new UUID link
                const newLink = `@UUID[Macro.${worldMacro.id}]{${macroName}}`;
                
                // Replace the old link with the new one
                const newContent = content.substring(0, macro.startIndex) + 
                                 newLink + 
                                 content.substring(macro.endIndex);
                
                postConsoleAndNotification(`Journal Tools: Macro upgraded`, 
                    `"${macroName}" -> ${worldMacro.id}`, false, true, false);
                
                return {
                    success: true,
                    newContent: newContent,
                    oldLink: macro.fullMatch,
                    newLink: newLink,
                    macroName: macroName,
                    macroId: worldMacro.id
                };
            } else {
                postConsoleAndNotification(`Journal Tools: Macro not found in world`, 
                    `"${macroName}" not found`, false, true, false);
                
                return {
                    success: false,
                    error: `Macro "${macroName}" not found in world`,
                    macroName: macroName
                };
            }
        } catch (error) {
            postConsoleAndNotification(`Journal Tools: Error upgrading macro`, 
                `${macro.name}: ${error.message}`, false, true, false);
            
            return {
                success: false,
                error: error.message,
                macroName: macro.name
            };
        }
    }
} 

// ================================================================== 
// ===== JOURNAL TOOLS WINDOW =======================================
// ================================================================== 

export class JournalToolsWindow extends FormApplication {
    constructor(journal) {
        super();
        this.journal = journal;
        this.isProcessing = false;
        this.shouldStop = false;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "journal-tools-window",
            title: "Journal Tools",
            template: "modules/coffee-pub-blacksmith/templates/journal-tools-window.hbs",
            width: 800,
            height: 1000,
            resizable: true,
            classes: ["journal-tools-window"]
        });
    }

    getData() {
        // Get all journals organized by folder
        const allJournals = game.journal.contents;
        const journalFolders = {};
        const ROOT_LABEL = '..Journal Root';
        
        // Group journals by folder
        allJournals.forEach(journal => {
            const folder = journal.folder?.name || ROOT_LABEL;
            if (!journalFolders[folder]) {
                journalFolders[folder] = [];
            }
            journalFolders[folder].push({
                id: journal.id,
                name: journal.name,
                selected: journal.id === this.journal.id
            });
        });
        
        // Convert to array format for template, keeping ROOT_LABEL first
        const availableJournals = Object.keys(journalFolders)
            .sort((a, b) => (a === ROOT_LABEL ? -1 : b === ROOT_LABEL ? 1 : a.localeCompare(b)))
            .map(folderName => ({
                folderName: folderName,
                journals: journalFolders[folderName].sort((a, b) => a.name.localeCompare(b.name))
            }));
        
        // Get all folders for search/replace, grouped by type
        const allFolders = game.folders.contents.filter(f => f.documentName && f.contents.length);
        const folderGroups = {};
        
        allFolders.forEach(folder => {
            const type = this._getFolderTypeDisplay(folder);
            if (!folderGroups[type]) {
                folderGroups[type] = [];
            }
            folderGroups[type].push({
                id: folder.id,
                name: folder.name
            });
        });
        
        // Sort folders within each type and sort types
        Object.keys(folderGroups).forEach(type => {
            folderGroups[type].sort((a, b) => a.name.localeCompare(b.name));
        });
        
        const availableFolders = Object.keys(folderGroups).sort().map(type => ({
            type: type,
            folders: folderGroups[type]
        }));
        
        return {
            journalName: this.journal.name,
            journalId: this.journal.id,
            availableJournals: availableJournals,
            availableFolders: availableFolders,
            searchWorldActorsFirst: game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsFirst'),
            searchWorldActorsLast: game.settings.get('coffee-pub-blacksmith', 'searchWorldActorsLast'),
            searchWorldItemsFirst: game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsFirst'),
            searchWorldItemsLast: game.settings.get('coffee-pub-blacksmith', 'searchWorldItemsLast')
        };
    }

    _getFolderTypeDisplay(folder) {
        // Try folder.type if it's not 'Folder'
        if (folder.type && folder.type !== 'Folder') return folder.type;
        // Fallback: look at the first document in contents
        if (folder.contents && folder.contents.length > 0) {
            const doc = folder.contents[0];
            // Try doc.documentName, then doc.constructor.documentName
            const type = doc.documentName || (doc.constructor && doc.constructor.documentName) || "Unknown";
            // Map to user-friendly display names
            const map = {
                Actor: "Actor",
                Item: "Item",
                JournalEntry: "Journal",
                Scene: "Scene",
                RollTable: "Roll Table",
                Playlist: "Playlist"
            };
            return map[type] || type.charAt(0).toUpperCase() + type.slice(1);
        }
        return "Unknown";
    }

    async _updateObject(event, formData) {
        // This method is called by FormApplication but we handle everything in _onApplyTools
        // So we just return without doing anything to avoid conflicts
        return;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Add event listeners for the custom buttons
        html.find('.apply-tools').click(this._onApplyTools.bind(this));
        html.find('.cancel-tools').click(this._onCancelTools.bind(this));
        html.find('#copy-results-entity').click(this._onCopyStatus.bind(this));
        html.find('.journal-tools-tab').click(this._onTabSwitch.bind(this));
        html.find('#open-journal-btn').click(this._onOpenJournal.bind(this));
        
        // Tab switching
        html.find('.journal-tools-tab').click(this._onTabSwitch.bind(this));
        
        // Search & Replace functionality
        html.find('.clear-search-btn').click(this._onClearSearch.bind(this));
        html.find('.run-report-btn').click(this._onRunReport.bind(this));
        html.find('.mass-replace-btn').click(this._onMassReplace.bind(this));
        html.find('#copy-results-search').click(this._onCopyResults.bind(this));

        // Delegated click for dynamically generated result titles
        html.on('click', '.replace-title', this._onResultTitleClick.bind(this));
    }

    _onResultTitleClick(event) {
        event.preventDefault();
        event.stopPropagation();

        try {
            const target = event.currentTarget;
            const $t = $(target);
            const type = $t.data('type');
            const id = $t.data('id');
            const pageId = $t.data('page-id');
            const soundId = $t.data('sound-id');

            if (!type || !id) return;

            const openSheet = (doc) => {
                if (!doc) return;
                if (doc.sheet) {
                    doc.sheet.render(true);
                } else if (doc.view) {
                    doc.view();
                }
            };

            if (type === 'journal-text' || type === 'journal-image' || type === 'journals') {
                const journal = game.journal.get(id);
                if (!journal) return;
                // Try to show a specific page if available (V10+ supports show with page)
                if (pageId) {
                    // Preferred modern API
                    if (typeof journal.show === 'function') {
                        journal.show({pageId, force: true});
                    } else {
                        // Fallbacks
                        openSheet(journal);
                        if (journal.sheet && typeof journal.sheet.viewPage === 'function') {
                            journal.sheet.viewPage(pageId);
                        } else {
                            const page = journal.pages?.get(pageId);
                            openSheet(page);
                        }
                    }
                } else {
                    openSheet(journal);
                }
                return;
            }

            if (type === 'actors') {
                openSheet(game.actors.get(id));
                return;
            }
            if (type === 'items') {
                openSheet(game.items.get(id));
                return;
            }
            if (type === 'scene' || type === 'scenes') {
                openSheet(game.scenes.get(id));
                return;
            }
            if (type === 'tables' || type === 'rolltables' || type === 'roll-tables') {
                openSheet(game.tables.get(id));
                return;
            }
            if (type === 'playlists') {
                const pl = game.playlists.get(id);
                if (!pl) return;
                openSheet(pl);
                return;
            }
        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error opening result link", error, false, false, false);
        }
    }

    async _onApplyTools(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // If already processing, this is a stop request
        if (this.isProcessing) {
            this.shouldStop = true;
            this.addStatusMessage("Stop request received. Processing will stop after current page...", "warning");
            return;
        }
        
        try {
            // Get form data
            const formData = new FormData(this.element.find('form')[0]);
            const upgradeActors = formData.get('upgradeActors') === 'true';
            const upgradeItems = formData.get('upgradeItems') === 'true';
            const upgradeMacros = formData.get('upgradeMacros') === 'true';
            
            // Get selected journal
            const selectedJournalId = formData.get('selectedJournalId');
            const selectedJournal = game.journal.get(selectedJournalId);
            
            if (!selectedJournal) {
                ui.notifications.error("Selected journal not found");
                return;
            }
            
            // Clear status area for fresh start
            this.element.find('#results-entity').empty();
            this.addStatusMessage("Ready to process...", "info");

            // Debug logging
            postConsoleAndNotification("Journal Tools: Form data debug", 
                `upgradeActors: ${upgradeActors}, upgradeItems: ${upgradeItems}, upgradeMacros: ${upgradeMacros}`, false, true, false);

            // Fallback: read checkbox values directly if FormData fails
            if (!upgradeActors && !upgradeItems && !upgradeMacros) {
                const actorsChecked = this.element.find('#upgrade-actors').is(':checked');
                const itemsChecked = this.element.find('#upgrade-items').is(':checked');
                const macrosChecked = this.element.find('#upgrade-macros').is(':checked');
                
                postConsoleAndNotification("Journal Tools: Fallback checkbox reading", 
                    `actors: ${actorsChecked}, items: ${itemsChecked}, macros: ${macrosChecked}`, false, true, false);
                
                if (!actorsChecked && !itemsChecked && !macrosChecked) {
                    ui.notifications.warn("Please select at least one tool to run");
                    return;
                }
                
                // Use the fallback values
                const upgradeActors = actorsChecked;
                const upgradeItems = itemsChecked;
                const upgradeMacros = macrosChecked;
            }

            if (!upgradeActors && !upgradeItems && !upgradeMacros) {
                ui.notifications.warn("Please select at least one tool to run");
                return;
            }

            // Save the settings
            const searchWorldActorsFirst = formData.get('searchWorldActorsFirst') === 'true';
            const searchWorldActorsLast = formData.get('searchWorldActorsLast') === 'true';
            const searchWorldItemsFirst = formData.get('searchWorldItemsFirst') === 'true';
            const searchWorldItemsLast = formData.get('searchWorldItemsLast') === 'true';

            await game.settings.set('coffee-pub-blacksmith', 'searchWorldActorsFirst', searchWorldActorsFirst);
            await game.settings.set('coffee-pub-blacksmith', 'searchWorldActorsLast', searchWorldActorsLast);
            await game.settings.set('coffee-pub-blacksmith', 'searchWorldItemsFirst', searchWorldItemsFirst);
            await game.settings.set('coffee-pub-blacksmith', 'searchWorldItemsLast', searchWorldItemsLast);

            // Set processing state
            this.isProcessing = true;
            this.shouldStop = false;
            
            // Show progress and status sections
            this.element.find('#progress-section').show();
            this.element.find('#status-section').show();
            
            // Change button to stop mode
            this.element.find('#apply-icon').removeClass('fa-check').addClass('fa-stop');
            this.element.find('#apply-text').text('Stop Update');
            this.element.find('#apply-button').addClass('stop-mode').prop('disabled', false);
            
            // Initialize progress
            this.updateOverallProgress(0, "Initializing...");
            this.updatePageProgress(0, "Ready...");
            this.addStatusMessage("Starting journal tools processing...", "info");

            // Create progress callbacks for the unified processing
            const overallProgressCallback = (progress, message) => {
                this.updateOverallProgress(progress, message);
            };
            
            const pageProgressCallback = (progress, message) => {
                this.updatePageProgress(progress, message);
            };

            const statusCallback = (message, type = "info") => {
                this.addStatusMessage(message, type);
            };

            const stopCallback = () => {
                return this.shouldStop;
            };

            if (upgradeActors || upgradeItems || upgradeMacros) {
                this.addStatusMessage(`Processing: Actors=${upgradeActors}, Items=${upgradeItems}, Macros=${upgradeMacros}`, "info");
                await JournalTools._upgradeJournalLinksUnified(selectedJournal, upgradeActors, upgradeItems, upgradeMacros, overallProgressCallback, pageProgressCallback, statusCallback, stopCallback);
            }

            // Check if processing was stopped
            if (this.shouldStop) {
                this.updateOverallProgress(100, "Stopped!");
                this.updatePageProgress(100, "Stopped!");
                this.addStatusMessage("Journal tools processing stopped by user.", "warning");
            } else {
                this.updateOverallProgress(100, "Complete!");
                this.updatePageProgress(100, "Complete!");

            }
            
            // Stop the spinner
            this.element.find('#progress-spinner').removeClass('fa-spin');
            
            // Reset button state
            this.element.find('#apply-icon').removeClass('fa-stop').addClass('fa-check');
            this.element.find('#apply-text').text('Update Links');
            this.element.find('#apply-button').removeClass('stop-mode').prop('disabled', false);
            
            // Reset processing state
            this.isProcessing = false;
            this.shouldStop = false;
            
            // Success message - console only
            postConsoleAndNotification("Journal Tools: Processing completed successfully", "", false, false, false);
            
        } catch (error) {
            this.addStatusMessage(`Error: ${error.message}`, "error");
            // Stop the spinner on error too
            this.element.find('#progress-spinner').removeClass('fa-spin');
            
            // Reset button state
            this.element.find('#apply-icon').removeClass('fa-stop').addClass('fa-check');
            this.element.find('#apply-text').text('Update Links');
            this.element.find('#apply-button').removeClass('stop-mode').prop('disabled', false);
            
            // Reset processing state
            this.isProcessing = false;
            this.shouldStop = false;
            
            postConsoleAndNotification("Journal Tools: Error applying tools", error, false, false, false);
            ui.notifications.error(`Error applying journal tools: ${error.message}`);
        }
    }

    updateOverallProgress(percentage, message) {
        this.element.find('#overall-progress-bar').css('width', `${percentage}%`);
        this.element.find('#overall-progress-text').text(message);
    }

    updatePageProgress(percentage, message) {
        this.element.find('#page-progress-bar').css('width', `${percentage}%`);
        this.element.find('#page-progress-text').text(message);
    }

    addStatusMessage(message, type = "info") {
        const statusArea = this.element.find('#results-entity');
        const messageDiv = $(`<div class="status-message ${type}">${message}</div>`);
        statusArea.append(messageDiv);
        statusArea.scrollTop(statusArea[0].scrollHeight);
        
        // Force UI update by yielding control back to browser
        setTimeout(() => {}, 0);
    }

    _onCopyStatus(event) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
            const statusArea = this.element.find('#results-entity');
            
            // Get all status messages and format them properly
            const statusMessages = statusArea.find('.status-message');
            let formattedText = '';
            
            statusMessages.each(function() {
                const message = $(this).text();
                formattedText += message + '\n';
            });
            
            if (formattedText && formattedText.trim()) {
                navigator.clipboard.writeText(formattedText).then(() => {
                    // Show notification that content was copied
                    ui.notifications.info("Status content copied to clipboard");
                    
                    // Console log for confirmation
                    postConsoleAndNotification("Journal Tools: Status copied to clipboard", "", false, false, false);
                }).catch(err => {
                    postConsoleAndNotification("Journal Tools: Failed to copy status", err.message, false, false, false);
                });
            } else {
                postConsoleAndNotification("Journal Tools: No status content to copy", "", false, false, false);
            }
        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error copying status", error.message, false, false, false);
        }
    }

    _onTabSwitch(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const targetTab = $(event.currentTarget).data('tab');
        
        // Update tab buttons
        this.element.find('.journal-tools-tab').removeClass('active');
        $(event.currentTarget).addClass('active');
        
        // Update tab content
        this.element.find('.journal-tools-tab-content').removeClass('active');
        this.element.find(`#${targetTab}-content`).addClass('active');
        
        // Show/hide appropriate footer
        if (targetTab === 'entity-replacement') {
            this.element.find('#entity-replacement-footer').show();
        } else {
            this.element.find('#entity-replacement-footer').hide();
        }
    }

    _onOpenJournal(event) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
            // Get the selected journal ID from the dropdown
            const selectedJournalId = this.element.find('#journal-tools-selector-entity-journal').val();
            
            if (!selectedJournalId) {
                ui.notifications.warn("No journal selected");
                return;
            }
            
            // Get the journal and open it
            const journal = game.journal.get(selectedJournalId);
            
            if (!journal) {
                ui.notifications.error("Selected journal not found");
                return;
            }
            
            // Open the journal sheet
            journal.sheet.render(true);
            
        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error opening journal", error, false, false, false);
            ui.notifications.error(`Error opening journal: ${error.message}`);
        }
    }

    _onClearSearch(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Reset all input fields
        this.element.find('#current-text').val("");
        this.element.find('#new-text').val("");
        this.element.find('#journal-tools-selector-search-folder').val("");
        this.element.find('#journal-tools-selector-match-mode').val("all");
        
        // Reset checkboxes
        this.element.find('#update-actors, #update-items, #update-scenes, #update-journals, #update-tables, #update-playlists').prop('checked', false);
        this.element.find('#target-images, #target-audio').prop('checked', false);
        this.element.find('#target-text').prop('checked', true); // Keep text checked by default
        
        // Clear the results area
        this.element.find('#results-search').html(`
            <div class="results-message">Always back up your files before running a mass change.</div>
            <div class="results-message">Run a search before doing a mass replace to verify what will be changed.</div>
        `);
    }

    _onRunReport(event) {
        event.preventDefault();
        event.stopPropagation();
        
        this._handleSearchReplace(false);
    }

    _onMassReplace(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!confirm("Are you sure you want to perform a mass replace? This cannot be undone.")) {
            return;
        }
        
        this._handleSearchReplace(true);
    }

    _onCopyResults(event) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
            const resultsArea = this.element.find('#results-search');
            const resultsText = resultsArea.text();
            
            if (resultsText && resultsText.trim()) {
                navigator.clipboard.writeText(resultsText).then(() => {
                    ui.notifications.info("Results copied to clipboard");
                    postConsoleAndNotification("Journal Tools: Results copied to clipboard", "", false, false, false);
                }).catch(err => {
                    postConsoleAndNotification("Journal Tools: Failed to copy results", err.message, false, false, false);
                });
            } else {
                postConsoleAndNotification("Journal Tools: No results to copy", "", false, false, false);
            }
        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error copying results", error.message, false, false, false);
        }
    }

    async _handleSearchReplace(doReplace = false) {
        const currentText = this.element.find('#current-text').val()?.trim();
        const newText = this.element.find('#new-text').val() ?? "";
        const folderFilter = this.element.find('#journal-tools-selector-search-folder').val();
        const matchMode = this.element.find('#journal-tools-selector-match-mode').val();
        const resultsArea = this.element.find('#results-search');
        
        // Target field checkboxes
        const targetImages = this.element.find('#target-images').is(':checked');
        const targetText = this.element.find('#target-text').is(':checked');
        const targetAudio = this.element.find('#target-audio').is(':checked');

        if (!targetImages && !targetText && !targetAudio) {
            ui.notifications.warn("Please select at least one target field (Images, Text, or Audio).");
            resultsArea.html(`<div class="results-message" style="color: #ff4444;"><strong>Warning:</strong> Please select at least one target field (Images, Text, or Audio).</div>`);
            return;
        }

        if (!currentText) {
            ui.notifications.error("Please provide the text to search for.");
            return;
        }

        // Document type options
        const options = {
            actors: this.element.find('#update-actors').is(':checked'),
            items: this.element.find('#update-items').is(':checked'),
            scenes: this.element.find('#update-scenes').is(':checked'),
            journals: this.element.find('#update-journals').is(':checked'),
            tables: this.element.find('#update-tables').is(':checked'),
            playlists: this.element.find('#update-playlists').is(':checked')
        };

        // Warn if no document type is selected
        if (!options.actors && !options.items && !options.scenes && !options.journals && !options.tables && !options.playlists) {
            ui.notifications.warn("Please select at least one document type (Actors, Items, Scenes, Journals, Roll Tables, or Playlists).");
            resultsArea.html(`<div class="results-message" style="color: #ff4444;"><strong>Warning:</strong> Please select at least one document type (Actors, Items, Scenes, Journals, Roll Tables, or Playlists).</div>`);
            return;
        }

        // Show progress
        this.element.find('#search-progress-section').show();
        this.element.find('#search-results-section').show();
        this.updateSearchProgress(0, doReplace ? "Running replacements..." : "Generating report...");
        
        resultsArea.html(`<div class="results-message"><strong>${doReplace ? "Running replacements..." : "Generating report..."}</strong></div>`);

        try {
            const changes = await this._collectChanges(currentText, newText, folderFilter, matchMode, options, targetImages, targetText, targetAudio);
            
            if (!changes.length) {
                resultsArea.append(`<div class="results-message"><em>No matching text found.</em></div>`);
                this.updateSearchProgress(100, "Complete!");
                return;
            }

            if (!doReplace) {
                // Show report
                const reportHtml = this._renderSearchResults(changes, matchMode, currentText, newText);
                resultsArea.append(reportHtml);
                this.updateSearchProgress(100, "Report complete!");
            } else {
                // Perform mass replace
                await this._performMassReplace(changes);
                const reportHtml = this._renderSearchResults(changes, matchMode, currentText, newText);
                resultsArea.html(reportHtml + `<div class="results-message" style="color: #4CAF50;"><strong>Success!</strong> ${changes.length} references updated.</div>`);
                this.updateSearchProgress(100, "Replace complete!");
            }
            
        } catch (error) {
            postConsoleAndNotification("Journal Tools: Error in search/replace", error.message, false, false, false);
            resultsArea.append(`<div class="results-message" style="color: #ff4444;"><strong>Error:</strong> ${error.message}</div>`);
            this.updateSearchProgress(100, "Error!");
        }
    }

    updateSearchProgress(percentage, message) {
        this.element.find('#search-progress-bar').css('width', `${percentage}%`);
        this.element.find('#search-progress-text').text(message);
    }

    async _collectChanges(currentText, newText, folderFilter, matchMode, options, targetImages, targetText, targetAudio) {
        const changes = [];
        
        // Helper function to check if value matches search criteria
        const match = (value) => {
            if (matchMode === "path") {
                // Only match if value looks like a path: must contain at least one '/' and end in a valid extension
                const pathRegex = /[\w\-./]+\.[a-zA-Z0-9]{1,4}/g;
                return pathRegex.test(value) && value.includes(currentText);
            }
            if (matchMode === "filename") {
                // Only match if value contains a filename (no '/' in the match, ends in valid extension)
                const filename = value.split("/").pop();
                const lastDot = filename.lastIndexOf('.');
                if (lastDot === -1) return false;
                const base = filename.slice(0, lastDot);
                const ext = filename.slice(lastDot + 1);
                if (ext.length < 1 || ext.length > 4) return false;
                return base.includes(currentText);
            }
            return value.includes(currentText);
        };

        // Helper function to get folder contents recursively
        const getAllFolderContents = (folder) => {
            const contents = [...folder.contents];
            for (const child of folder.children) contents.push(...getAllFolderContents(child));
            return contents;
        };

        // Helper function to collect changes for a collection
        const collect = (collection, imgField, type, fieldTag) => {
            if (!options[type] || !targetImages) return;
            let docs = collection.contents;
            if (folderFilter) {
                const folder = game.folders.get(folderFilter);
                if (folder) {
                    const allowedFolderIds = new Set(getAllFolderContents(folder).map(f => f.id));
                    docs = docs.filter(doc => doc.folder && allowedFolderIds.has(doc.folder.id));
                } else {
                    return;
                }
            }
            const typeMap = {
                actors: "Actor",
                items: "Item",
                journals: "JournalEntry",
                tables: "RollTable",
                playlists: "Playlist",
                scenes: "Scene"
            };
            const expectedType = typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1, -1);
            docs = docs.filter(doc => doc.documentName === expectedType);
            for (const doc of docs) {
                const img = foundry.utils.getProperty(doc, imgField);
                if (typeof img === "string" && match(img)) {
                    let newVal = (matchMode === "filename")
                        ? img.replace(currentText, newText)
                        : img.replaceAll(currentText, newText);
                    changes.push({ type, name: doc.name, field: imgField, old: img, new: newVal, id: doc.id, docClass: collection.documentClass, folder: doc.folder, fieldTag: "IMAGES" });
                }
                // For actors, also check the token path
                if (type === 'actors') {
                    const tokenPath = foundry.utils.getProperty(doc, 'prototypeToken.texture.src');
                    if (typeof tokenPath === "string" && match(tokenPath)) {
                        let newVal = (matchMode === "filename")
                            ? tokenPath.replace(currentText, newText)
                            : tokenPath.replaceAll(currentText, newText);
                        changes.push({ type, name: doc.name, field: 'prototypeToken.texture.src', old: tokenPath, new: newVal, id: doc.id, docClass: collection.documentClass, folder: doc.folder, fieldTag: "IMAGES" });
                    }
                }
            }
        };

        // Collect changes for different document types
        collect(game.actors, "img", "actors", "IMAGES");
        collect(game.items, "img", "items", "IMAGES");
        collect(game.tables, "img", "tables", "IMAGES");
        collect(game.playlists, "img", "playlists", "IMAGES");

        // Scenes (Images)
        if (options["scenes"] && targetImages) {
            let scenesToProcess = game.scenes.contents;
            if (folderFilter) {
                const folder = game.folders.get(folderFilter);
                if (folder && folder.type === "Scene") {
                    const allowedFolderIds = new Set(getAllFolderContents(folder).map(f => f.id));
                    scenesToProcess = scenesToProcess.filter(scene => scene.folder && allowedFolderIds.has(scene.folder.id));
                } else {
                    scenesToProcess = [];
                }
            }
            for (const scene of scenesToProcess) {
                const bg = scene.background?.src;
                if (typeof bg === "string" && match(bg)) {
                    let newVal = (matchMode === "filename")
                        ? bg.replace(currentText, newText)
                        : bg.replaceAll(currentText, newText);
                    changes.push({ type: "scene", name: scene.name, field: "background.src", old: bg, new: newVal, id: scene.id, folder: scene.folder, fieldTag: "IMAGES" });
                }
            }
        }

        // Journals (Images & Text)
        if (options["journals"]) {
            let journalsToProcess = game.journal.contents;
            if (folderFilter) {
                const folder = game.folders.get(folderFilter);
                if (folder) {
                    const allowedFolderIds = new Set(getAllFolderContents(folder).map(f => f.id));
                    journalsToProcess = journalsToProcess.filter(journal => journal.folder && allowedFolderIds.has(journal.folder.id));
                } else {
                    journalsToProcess = [];
                }
            }
            for (const journal of journalsToProcess) {
                for (const page of journal.pages.contents) {
                    if (page.type === "image" && targetImages && match(page.src)) {
                        let newVal = (matchMode === "filename")
                            ? page.src.replace(currentText, newText)
                            : page.src.replaceAll(currentText, newText);
                        changes.push({ type: "journal-image", name: `${journal.name} → ${page.name}`, field: "src", old: page.src, new: newVal, id: journal.id, pageId: page.id, folder: journal.folder, fieldTag: "IMAGES" });
                    }
                    if (page.type === "text" && targetText && page.text?.content?.includes(currentText)) {
                        let matches = [];
                        if (matchMode === "filename") {
                            const filenameRegex = /\b([\w\-\.]+)\.([a-zA-Z0-9]{1,4})\b/g;
                            let m;
                            while ((m = filenameRegex.exec(page.text.content)) !== null) {
                                const base = m[1];
                                const ext = m[2];
                                if (base.includes(currentText)) matches.push(`${base}.${ext}`);
                            }
                        } else if (matchMode === "path") {
                            const pathRegex = /[\w\-./]+\.[a-zA-Z0-9]{1,4}/g;
                            let m;
                            while ((m = pathRegex.exec(page.text.content)) !== null) {
                                if (m[0].includes(currentText)) matches.push(m[0]);
                            }
                        } else {
                            const regex = new RegExp(currentText, "g");
                            let m;
                            while ((m = regex.exec(page.text.content)) !== null) {
                                matches.push(currentText);
                            }
                        }
                        for (const matchText of matches) {
                            let newVal = matchText.replace(currentText, newText);
                            changes.push({ type: "journal-text", name: `${journal.name} → ${page.name}`, field: "text.content", old: matchText, new: newVal, id: journal.id, pageId: page.id, fullText: page.text.content, folder: journal.folder, fieldTag: "TEXT" });
                        }
                    }
                }
            }
        }

        // Playlists (Audio)
        if (options["playlists"] && targetAudio) {
            let playlistsToProcess = game.playlists.contents;
            if (folderFilter) {
                const folder = game.folders.get(folderFilter);
                if (folder) {
                    const allowedFolderIds = new Set(getAllFolderContents(folder).map(f => f.id));
                    playlistsToProcess = playlistsToProcess.filter(playlist => playlist.folder && allowedFolderIds.has(playlist.folder.id));
                } else {
                    playlistsToProcess = [];
                }
            }
            for (const playlist of playlistsToProcess) {
                for (const sound of playlist.sounds.contents) {
                    if (typeof sound.path === "string" && match(sound.path)) {
                        let newVal = (matchMode === "filename")
                            ? sound.path.replace(currentText, newText)
                            : sound.path.replaceAll(currentText, newText);
                        changes.push({ type: "playlists", name: `${playlist.name} → ${sound.name}`, field: "path", old: sound.path, new: newVal, id: playlist.id, soundId: sound.id, folder: playlist.folder, fieldTag: "AUDIO" });
                    }
                }
            }
        }

        return changes;
    }

    _renderSearchResults(changes, matchMode, currentText, newText) {
        let html = '';
        html += changes.map(c => {
            let title = c.name;
            let folderPath = [];
            let folder = c.folder;
            while (folder) {
                folderPath.unshift(folder.name);
                folder = folder.parent;
            }
            if (folderPath.length) {
                title = folderPath.join(' → ') + ' → ' + c.name;
            }
            
            let isTextField = c.type === 'journal-text';
            if (matchMode === 'all' && isTextField) {
                // Show all matches with context for text fields
                const contexts = this._allContextsWithBold(c.fullText || c.old, currentText, newText);
                return contexts.map(ctx => `
                    <div class="replace-result">
                        <div class="replace-result-title">
                            <div class="replace-title" data-type="${c.type}" data-id="${c.id}"${c.pageId ? ` data-page-id="${c.pageId}"` : ''}${c.soundId ? ` data-sound-id="${c.soundId}"` : ''}>${title}</div>
                            <div class="replace-result-tag">${c.type}</div><div class="replace-field-tag">${c.fieldTag}</div>
                        </div>
                        <div class="replace-old">
                            <span class="code-old-label">OLD</span>
                            <span class="code-old">${ctx.old}</span>
                        </div>
                        <div class="replace-new">
                            <span class="code-new-label">NEW</span>
                            <span class="code-new">${ctx.new}</span>
                        </div>
                    </div>`).join('');
            } else {
                let oldDisplay = this._boldSearch(c.old, currentText);
                let newDisplay = this._boldSearch(c.new, newText);
                return `
                    <div class="replace-result">
                        <div class="replace-result-title">
                            <div class="replace-title" data-type="${c.type}" data-id="${c.id}"${c.pageId ? ` data-page-id="${c.pageId}"` : ''}${c.soundId ? ` data-sound-id="${c.soundId}"` : ''}>${title}</div>
                            <div class="replace-result-tag">${c.type}</div><div class="replace-field-tag">${c.fieldTag}</div>
                        </div>
                        <div class="replace-old">
                            <span class="code-old-label">OLD</span>
                            <span class="code-old">${oldDisplay}</span>
                        </div>
                        <div class="replace-new">
                            <span class="code-new-label">NEW</span>
                            <span class="code-new">${newDisplay}</span>
                        </div>
                    </div>`;
            }
        }).join("");
        return html;
    }

    _boldSearch(str, search) {
        if (!search) return str;
        const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return str.replace(new RegExp(esc, 'gi'), match => `<span class="replace-result-searchstring">${match}</span>`);
    }

    _allContextsWithBold(str, search, replace) {
        if (!search) return [{old: str, new: str}];
        // Strip HTML tags for context extraction
        const plain = str.replace(/<[^>]+>/g, '');
        const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(esc, 'gi');
        let result = [];
        let m;
        while ((m = regex.exec(plain)) !== null) {
            // Find sentence boundaries
            let start = plain.lastIndexOf('.', m.index);
            let excl = plain.lastIndexOf('!', m.index);
            let quest = plain.lastIndexOf('?', m.index);
            let br = plain.lastIndexOf('\n', m.index);
            start = Math.max(start, excl, quest, br);
            start = start === -1 ? 0 : start + 1;
            let endDot = plain.indexOf('.', m.index + search.length);
            let endExcl = plain.indexOf('!', m.index + search.length);
            let endQuest = plain.indexOf('?', m.index + search.length);
            let endBr = plain.indexOf('\n', m.index + search.length);
            let ends = [endDot, endExcl, endQuest, endBr].filter(e => e !== -1);
            let end = ends.length ? Math.min(...ends) : plain.length;
            if (end === plain.length && plain.indexOf('\n', m.index + search.length) !== -1) {
                end = plain.indexOf('\n', m.index + search.length);
            }
            let context = plain.slice(start, end).trim();
            // For old: bold the matched search term
            let oldContext = context.replace(new RegExp(esc, 'gi'), mm => `<span class="replace-result-searchstring">${mm}</span>`);
            // For new: replace only the matched occurrence in this context, bold the replacement
            let relIndex = m.index - start;
            let before = context.slice(0, relIndex);
            let after = context.slice(relIndex + search.length);
            let newContext = before + `<span class="replace-result-searchstring">${replace}</span>` + after;
            result.push({old: oldContext, new: newContext});
        }
        return result.length ? result : [{old: plain, new: plain}];
    }

    async _performMassReplace(changes) {
        for (const c of changes) {
            try {
                if (c.type === 'actors') {
                    const doc = game.actors.get(c.id);
                    if (doc) await doc.update({ [c.field]: c.new });
                } else if (c.type === 'items') {
                    const doc = game.items.get(c.id);
                    if (doc) await doc.update({ [c.field]: c.new });
                } else if (c.type === 'scene') {
                    const doc = game.scenes.get(c.id);
                    if (doc && c.field === 'background.src') {
                        await doc.update({ 'background.src': c.new });
                    }
                } else if (c.type === 'tables') {
                    const doc = game.tables.get(c.id);
                    if (doc) await doc.update({ [c.field]: c.new });
                } else if (c.type === 'playlists') {
                    const doc = game.playlists.get(c.id);
                    if (doc && c.soundId) {
                        const sound = doc.sounds.get(c.soundId);
                        if (sound) await sound.update({ path: c.new });
                    } else if (doc) {
                        await doc.update({ [c.field]: c.new });
                    }
                } else if (c.type === 'journal-image') {
                    const journal = game.journal.get(c.id);
                    if (journal && c.pageId) {
                        const page = journal.pages.get(c.pageId);
                        if (page) await page.update({ src: c.new });
                    }
                } else if (c.type === 'journal-text') {
                    const journal = game.journal.get(c.id);
                    if (journal && c.pageId) {
                        const page = journal.pages.get(c.pageId);
                        if (page) {
                            let content = c.fullText;
                            const esc = c.old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(esc, 'i');
                            content = content.replace(regex, c.new);
                            await page.update({ 'text.content': content });
                        }
                    }
                }
            } catch (err) {
                postConsoleAndNotification("Journal Tools: Error updating document", `${c.name}: ${err.message}`, false, false, false);
            }
        }
    }

    _onCancelTools(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Close the window without applying tools
        this.close();
    }
} 