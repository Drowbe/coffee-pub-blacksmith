// ================================================================== 
// ===== COMMON =====================================================
// ================================================================== 
//
// Put any functions or reusable code here for use in THIS module.
// This code is not shareable with other modules.
//
// Any SHARED code goes in "GLOBAL"... and each module shoudl get
// the exact same code set in it.
//
// ================================================================== 

// ================================================================== 
// ===== VARIABLE EXPORTS ===========================================
// ================================================================== 

// none


// ================================================================== 
// ===== GLOBAL IMPORTS =============================================
// ================================================================== 

// -- Import MODULE variables --
import { MODULE_TITLE, MODULE_ID, BLACKSMITH } from './const.js';
import { COFFEEPUB, MODULE_AUTHOR } from './global.js';
// get the common utilities
import { postConsoleAndNotification, rollCoffeePubDice, playSound, getActorId, getTokenImage, getPortraitImage, getTokenId, objectToString, stringToObject,trimString, generateFormattedDate, toSentenceCase, convertSecondsToRounds} from './global.js';
// Import template caching function
import { getCachedTemplate } from './blacksmith.js';


// ================================================================== 
// ===== GLOBAL FUNCTIONS ===========================================
// ================================================================== 


// ***************************************************
// ** UTILITY Build ENCOUNTER or NARRATIVE Journal
// ***************************************************
export async function createJournalEntry(journalData) {
    var strFolderName = toSentenceCase(journalData.foldername);
    var compiledHtml = "";
    let folder;

    postConsoleAndNotification("BLACKSMITH: createJournalEntry journalData", journalData, false, true, false);

    // ---------- CHECK & CREATE THE FOLDER ----------
    if (strFolderName) {
        let existingFolder = game.folders.find(x => x.name === strFolderName && x.type === "JournalEntry");
        if (existingFolder) {
            folder = existingFolder;
        } else {
            folder = await Folder.create({
                name: strFolderName,
                type: "JournalEntry",
                parent: null,
            });
        }
    }

    // Build the encounter data as appropriate.
    var templatePath = journalData.journaltype.toUpperCase() === "ENCOUNTER" ? 
        BLACKSMITH.JOURNAL_ENCOUNTER_TEMPLATE : 
        BLACKSMITH.JOURNAL_NARRATIVE_TEMPLATE;
    var template = await getCachedTemplate(templatePath);

    // Convert any object fields to HTML
    const convertObjectToHtml = async (obj) => {
        if (typeof obj === 'string') {
            // Try to parse as a list of items (comma or <li> separated)
            let items = [];
            if (obj.includes('<li>')) {
                // HTML list
                const matches = obj.match(/<li>(.*?)<\/li>/g);
                if (matches) {
                    items = matches.map(li => li.replace(/<li>|<\/li>/g, '').trim());
                }
            } else if (obj.includes(',')) {
                // Comma-separated
                items = obj.split(',').map(s => s.trim());
            } else {
                items = [obj.trim()];
            }
            // Link each item
            const linkedItems = await Promise.all(items.map(async item => {
                if (!item || item.toLowerCase() === 'none') return item;
                return await buildCompendiumLinkItem(item);
            }));
            // Return as HTML list
            return `<ul>${linkedItems.map(i => `<li>${i}</li>`).join('')}</ul>`;
        }
        if (typeof obj === 'object' && obj !== null) {
            let html = '<ul>';
            for (const [key, value] of Object.entries(obj)) {
                let linked = value;
                if (typeof value === 'string') {
                    linked = await buildCompendiumLinkItem(value);
                }
                html += `<li><b>${key}:</b> ${linked}</li>`;
            }
            html += '</ul>';
            return html;
        }
        return '';
    };

    // Function to create a journal link
    const createJournalLink = async (title) => {
        // Search for the journal entry
        const entry = game.journal.find(j => j.name === title);
        if (entry) {
            return `@UUID[JournalEntry.${entry.id}]{${title}}`;
        }
        return title;
    };

    // Function to format monster list with links
    const formatMonsterList = async (monsters) => {
        if (!monsters || monsters === "(Link Manually)") {
            // If we have linked encounters, try to extract monsters from there
            if (journalData.linkedEncounters && journalData.linkedEncounters.length > 0) {
                const linkedEncounter = journalData.linkedEncounters[0]; // Take the first linked encounter
                if (linkedEncounter.monsters) {
                    return await createHTMLList(linkedEncounter.monsters);
                }
            }
            return "<ul><li>(No monsters specified)</li></ul>";
        }
        return await createHTMLList(monsters);
    };

    let strSceneParent = journalData.sceneparent;
    let strSceneArea = journalData.scenearea;
    let strSceneEnvironment = journalData.sceneenvironment;
    let strSceneLocation = journalData.scenelocation;
    let strSceneTitle = toSentenceCase(journalData.scenetitle);
    let strContextIntro = journalData.contextintro;
    let strPrepEncounter = await formatMonsterList(journalData.prepencounter);
    let strPrepEncounterDetails = journalData.prepencounterdetails;
    let strPrepRewards = await convertObjectToHtml(journalData.preprewards);
    let strPrepSetup = journalData.prepsetup;
    let strCardTitle = toSentenceCase(journalData.cardtitle);
    let strCardDescriptionPrimary = journalData.carddescriptionprimary;
    let strCardImageTitle = toSentenceCase(journalData.cardimagetitle);
    let strCardImage = journalData.cardimage;
    let strCardDescriptionSecondary = journalData.carddescriptionsecondary;
    let strCardDialogue = journalData.carddialogue;
    let strContextAdditionalNarration = journalData.contextadditionalnarration;
    let strContextAtmosphere = journalData.contextatmosphere;
    let strContextGMNotes = journalData.contextgmnotes;

    // Handle linked encounters if they exist
    let strLinkedEncounters = '';
    if (journalData.linkedEncounters && journalData.linkedEncounters.length > 0) {
        strLinkedEncounters = '<h3>Linked Encounters</h3><ul>';
        for (const encounter of journalData.linkedEncounters) {
            const encounterName = encounter.name || '';
            if (encounterName) {
                // Create link for the encounter name
                const encounterLink = await createJournalLink(encounterName);
                strLinkedEncounters += `<li><strong>${encounterLink}</strong>`;
                
                // Add synopsis if available
                if (encounter.synopsis) {
                    strLinkedEncounters += `<br><em>${encounter.synopsis}</em>`;
                }
                
                // Add key moments if available
                if (encounter.keyMoments && encounter.keyMoments.length > 0) {
                    strLinkedEncounters += '<br><strong>Key Moments:</strong><ul>';
                    for (const moment of encounter.keyMoments) {
                        strLinkedEncounters += `<li>${moment}</li>`;
                    }
                    strLinkedEncounters += '</ul>';
                }
                
                // Add monsters if available
                if (encounter.monsters) {
                    strLinkedEncounters += '<br><strong>Monsters:</strong>';
                    strLinkedEncounters += await createHTMLList(encounter.monsters);
                }
                
                strLinkedEncounters += '</li>';
            }
        }
        strLinkedEncounters += '</ul>';
    }

    // Prepare data for the template
    var CARDDATA = {
        // Populate with necessary fields from journalData
        strSceneParent: strSceneParent,
        strSceneArea: strSceneArea,
        strSceneEnvironment: strSceneEnvironment,
        strSceneLocation: strSceneLocation,
        strSceneTitle: strSceneTitle,
        strContextIntro: strContextIntro,
        strPrepEncounter: strPrepEncounter,
        strPrepEncounterDetails: strPrepEncounterDetails,
        strPrepRewards: strPrepRewards,
        strPrepSetup: strPrepSetup,
        strCardTitle: strCardTitle,
        strCardDescriptionPrimary: strCardDescriptionPrimary,
        strCardImageTitle: strCardImageTitle,
        strCardImage: strCardImage,
        strCardDescriptionSecondary: strCardDescriptionSecondary,
        strCardDialogue: strCardDialogue,
        strContextAdditionalNarration: strContextAdditionalNarration,
        strContextAtmosphere: strContextAtmosphere,
        strContextGMNotes: strContextGMNotes,
        linkedEncounters: journalData.linkedEncounters || []
    };

    // Add a hidden CDATA section with the raw linked encounters data if available
    if (journalData.linkedEncounters && journalData.linkedEncounters.length > 0) {
        // Use HTML encoding for the data attribute to avoid issues with quotes
        const encodedData = encodeURIComponent(JSON.stringify(journalData.linkedEncounters));
        CARDDATA.linkedEncountersData = `<div style="display:none" data-linked-encounters="${encodedData}"><![CDATA[${JSON.stringify(journalData.linkedEncounters)}]]></div>`;
    } else {
        CARDDATA.linkedEncountersData = '';
    }

    // Play a victory sound. lol
    playSound(COFFEEPUB.SOUNDEFFECTBOOK02, COFFEEPUB.SOUNDVOLUMENORMAL);

    // Set the content
    compiledHtml = template(CARDDATA);

    // Add metadata at the top of the journal entry for programmatic access
    // This will make it easier to identify and manipulate journal entries
    const metadata = {
        type: journalData.journaltype,
        location: strSceneLocation || "",
        parent: strSceneParent || "",
        area: strSceneArea || "",
        environment: strSceneEnvironment || "",
        title: strSceneTitle || "",
        synopsis: "",
        keyMoments: "",
        difficulty: "",
        linkedEncounters: journalData.linkedEncounters || []
    };
    
    // Extract synopsis from prepsetup
    if (journalData.prepsetup) {
        // Try different patterns for Synopsis
        const synopsisPatterns = [
            /<li><strong>Synopsis<\/strong>:(.*?)<\/li>/i,
            /<li><strong>Synopsis<\/strong>(.*?)<\/li>/i,
            /<li><strong>Synopsis:<\/strong>(.*?)<\/li>/i
        ];
        
        for (const pattern of synopsisPatterns) {
            const match = journalData.prepsetup.match(pattern);
            if (match && match[1]) {
                metadata.synopsis = match[1].trim();
                break;
            }
        }
        
        // Try different patterns for Key Moments
        const keyMomentsPatterns = [
            /<li><strong>Key Moments<\/strong>:(.*?)<\/li>/i,
            /<li><strong>Key Moments<\/strong>(.*?)<\/li>/i,
            /<li><strong>Key Moments:<\/strong>(.*?)<\/li>/i
        ];
        
        for (const pattern of keyMomentsPatterns) {
            const match = journalData.prepsetup.match(pattern);
            if (match && match[1]) {
                metadata.keyMoments = match[1].trim();
                break;
            }
        }
    }
    
    // Extract difficulty from prepencounterdetails
    if (journalData.prepencounterdetails) {
        // Try different patterns for Difficulty
        const difficultyPatterns = [
            /<li><strong>Difficulty<\/strong>:(.*?)<\/li>/i,
            /<li><strong>Difficulty<\/strong>(.*?)<\/li>/i,
            /<li><strong>Difficulty:<\/strong>(.*?)<\/li>/i
        ];
        
        for (const pattern of difficultyPatterns) {
            const match = journalData.prepencounterdetails.match(pattern);
            if (match && match[1]) {
                metadata.difficulty = match[1].trim();
                break;
            }
        }
    }
    
    // For monster lists, extract UUIDs
    if (journalData.prepencounter && typeof journalData.prepencounter === 'string') {
        const monsterUUIDPattern = /@UUID\[(.*?)\]/g;
        const monsterUUIDs = [];
        let match;
        
        while ((match = monsterUUIDPattern.exec(journalData.prepencounter)) !== null) {
            monsterUUIDs.push(match[1]);
        }
        
        if (monsterUUIDs.length > 0) {
            metadata.monsters = monsterUUIDs;
        }
    }

    // Encode the metadata
    const encodedMetadata = encodeURIComponent(JSON.stringify(metadata));
    const metadataBlock = `<div style="display:none" data-journal-metadata="${encodedMetadata}" data-journal-type="${journalData.journaltype}"><![CDATA[${JSON.stringify(metadata)}]]></div>`;
    
    // Add the metadata block at the beginning of the HTML
    compiledHtml = metadataBlock + compiledHtml;

    // Check if the journal entry already exists
    let existingEntry = game.journal.find(entry => {
        // If we have a scene area, use that, otherwise use scene title
        const entryName = strSceneArea || strSceneTitle || "Unnamed Entry";
        return entry.name === entryName && entry.folder?.id === folder?.id;
    });
    if (existingEntry) {
        // Check if the page already exists
        let existingPage = existingEntry.pages.find(page => page.name === strSceneTitle);
        if (existingPage) {
            // Update the existing page
            await existingPage.update({
                name: strSceneTitle,
                type: "text",
                text: {
                    content: compiledHtml,
                    format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
                }
            });
        } else {
            // Add a new page to the existing journal entry
            await existingEntry.createEmbeddedDocuments("JournalEntryPage", [{
                name: strSceneTitle,
                type: "text",
                text: {
                    content: compiledHtml,
                    format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
                }
            }]);
        }
    } else {
        // Create a new journal entry with a page
        await JournalEntry.create({
            name: strSceneArea || strSceneTitle || "Unnamed Entry",
            pages: [
                {
                    name: strSceneTitle,
                    type: "text",
                    text: {
                        content: compiledHtml,
                        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
                    }
                }
            ],
            folder: folder ? folder.id : undefined,
        });
    }
}





// ***************************************************
// ** UTILITY Build Compendium Links
// ***************************************************

export async function createHTMLList(monsterString) {
    // Split the string by comma to get an array of monsters
    let monsters = monsterString.split(", ");

    // Begin the list
    let listHTML = "<ul>";
    
    // Iterate over the monsters, adding each one to the list
    for (let monster of monsters) {
        monster = await buildCompendiumLinkActor(monster);
        listHTML += `<li>${monster}</li>`;
    }
    
    //close the list
    listHTML += "</ul>";
    return listHTML;
}

// ***************************************************
// ** UTILITY Build Actor Compendium Links
// ***************************************************

export async function buildCompendiumLinkActor(monsterData) {
    // If we're passed a string, use the legacy behavior
    if (typeof monsterData === 'string') {
        const searchWorldFirst = game.settings.get(MODULE_ID, 'searchWorldActorsFirst');
        // Extract the count if it exists (matches the last parenthetical number)
        const countMatch = monsterData.match(/\((\d+)\)[^(]*$/);
        const count = countMatch ? countMatch[1] : null;
        // Clean up the monster name by removing parentheses containing numbers, CR values, or symbols
        const originalName = monsterData;
        const strActorName = monsterData.replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)|\s*\(CR\s*[0-9/]+\)/g, '').trim();
        let strActorID;
        // Function to format the final link with count
        const formatLink = (uuid, name) => {
            const baseLink = `@UUID[${uuid}]{${name}}`;
            return count ? `${baseLink} x ${count}` : baseLink;
        };
        // Only check world actors if the setting is enabled
        if (searchWorldFirst) {
            let foundActor;
            try {
                foundActor = game.actors.getName(strActorName);
            } catch (error) {
                foundActor = null;
            }
            if (foundActor) {
                strActorID = foundActor.system._id;
                return formatLink(`Actor.${strActorID}`, strActorName);
            }
        }
        // Check up to 5 compendium settings in order
        let found = false;
        for (let i = 1; i <= 5; i++) {
            const compendiumSetting = game.settings.get(MODULE_ID, `monsterCompendium${i}`);
            if (!compendiumSetting || compendiumSetting === 'none') continue;
            const compendium = game.packs.get(compendiumSetting);
            if (compendium) {
                let index = await compendium.getIndex();
                let entry = index.find(e => e.name === strActorName);
                if (entry) {
                    strActorID = entry._id;
                    return formatLink(`Compendium.${compendiumSetting}.Actor.${strActorID}`, strActorName);
                }
            }
        }
        // If not found in any compendium, return unlinked name
        return `${strActorName}${count ? ` x ${count}` : ''}`;
    }
    // If we have UUID data, use that
    if (monsterData.actorUuid) {
        const countMatch = monsterData.name.match(/\((\d+)\)[^(]*$/);
        const count = countMatch ? ` x ${countMatch[1]}` : '';
        const cleanName = monsterData.name.replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)/g, '').trim();
        return `@UUID[${monsterData.actorUuid}]{${cleanName}}${count}`;
    }
    // If we have the actor name but no UUID, fall back to the legacy behavior
    return buildCompendiumLinkActor(monsterData.actorName || monsterData.name);
}

// ***************************************************
// ** UTILITY Build Item Compendium Links
// ***************************************************

export async function buildCompendiumLinkItem(itemData) {
    if (typeof itemData === 'string') {
        const searchWorldFirst = game.settings.get(MODULE_ID, 'searchWorldItemsFirst');
        const originalName = itemData;
        const strItemName = itemData.trim();
        let strItemID;
        const formatLink = (uuid, name) => `@UUID[${uuid}]{${name}}`;
        // Only check world items if the setting is enabled
        if (searchWorldFirst) {
            let foundItem;
            try {
                foundItem = game.items.getName(strItemName);
            } catch (error) {
                foundItem = null;
            }
            if (foundItem) {
                strItemID = foundItem.id;
                return formatLink(`Item.${strItemID}`, strItemName);
            }
        }
        // Check up to 5 compendium settings in order
        for (let i = 1; i <= 5; i++) {
            const compendiumSetting = game.settings.get(MODULE_ID, `itemCompendium${i}`);
            if (!compendiumSetting || compendiumSetting === 'none') continue;
            const compendium = game.packs.get(compendiumSetting);
            if (compendium) {
                let index = await compendium.getIndex();
                // First try for exact match
                let entry = index.find(e => e.name.toLowerCase() === strItemName.toLowerCase());
                // If no exact match, try startsWith
                if (!entry) {
                    entry = index.find(e => e.name.toLowerCase().startsWith(strItemName.toLowerCase()));
                }
                if (entry) {
                    strItemID = entry._id;
                    return formatLink(`Compendium.${compendiumSetting}.Item.${strItemID}`, strItemName);
                }
            }
        }
        // If not found in any compendium, return unlinked name
        return `${strItemName}`;
    }
    // If we have UUID data, use that
    if (itemData.itemUuid) {
        const cleanName = itemData.name.trim();
        return `@UUID[${itemData.itemUuid}]{${cleanName}}`;
    }
    // If we have the item name but no UUID, fall back to the legacy behavior
    return buildCompendiumLinkItem(itemData.itemName || itemData.name);
}

/**
 * Copy text to clipboard with multiple fallback methods
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function copyToClipboard(text) {
    // Method 1: Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            ui.notifications.info('Copied to clipboard!');
            return true;
        } catch (error) {
            console.warn('Modern clipboard API failed:', error);
        }
    }
    // Method 2: Try legacy execCommand approach
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
            ui.notifications.info('Copied to clipboard!');
            return true;
        }
    } catch (error) {
        console.warn('Legacy clipboard method failed:', error);
    }
    // Method 3: Show dialog with text for manual copying
    new Dialog({
        title: 'Copy to Clipboard',
        content: `
            <p>Automatic clipboard copy failed. Please manually copy the text below:</p>
            <textarea style="width: 100%; height: 200px; margin-top: 10px;" readonly>${text}</textarea>
        `,
        buttons: {
            close: {
                label: 'Close'
            }
        }
    }).render(true);
    return false;
}