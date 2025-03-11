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
    var response = await fetch(templatePath);
    var templateText = await response.text();
    var template = Handlebars.compile(templateText);

    // Convert any object fields to HTML
    const convertObjectToHtml = (obj) => {
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'object' && obj !== null) {
            let html = '<ul>';
            for (const [key, value] of Object.entries(obj)) {
                html += `<li><b>${key}:</b> ${value}</li>`;
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
    let strPrepRewards = convertObjectToHtml(journalData.preprewards);
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
        strLinkedEncounters: strLinkedEncounters
    };

    // Play a victory sound. lol
    playSound(COFFEEPUB.SOUNDEFFECTBOOK02, COFFEEPUB.SOUNDVOLUMENORMAL);

    // Set the content
    compiledHtml = template(CARDDATA);

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
        const primaryCompendium = game.settings.get(MODULE_ID, 'monsterCompendiumPrimary');
        const secondaryCompendium = game.settings.get(MODULE_ID, 'monsterCompendiumSecondary');
        const searchWorldFirst = game.settings.get(MODULE_ID, 'searchWorldActorsFirst');
        
        // Extract the count if it exists (matches the last parenthetical number)
        const countMatch = monsterData.match(/\((\d+)\)[^(]*$/);
        const count = countMatch ? countMatch[1] : null;
        
        // Clean up the monster name by removing parentheses containing numbers, CR values, or symbols
        const originalName = monsterData;
        // This regex matches:
        // 1. Parentheses containing numbers or symbols: \s*\([^a-zA-Z]*[0-9]+[^)]*\)
        // 2. Parentheses containing CR followed by any number/fraction: \s*\(CR\s*[0-9/]+\)
        const strActorName = monsterData.replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)|\s*\(CR\s*[0-9/]+\)/g, '').trim();
        
        let strActorID;
        let strCompendiumLink = "";

        console.log(`BLACKSMITH | REGENT: Original monster name: ${originalName}`);
        console.log(`BLACKSMITH | REGENT: Cleaned monster name for search: ${strActorName}`);
        console.log(`BLACKSMITH | REGENT: Count found: ${count}`);
        console.log(`BLACKSMITH | REGENT: Search world first: ${searchWorldFirst}`);
        console.log(`BLACKSMITH | REGENT: Primary compendium: ${primaryCompendium}`);
        console.log(`BLACKSMITH | REGENT: Secondary compendium: ${secondaryCompendium}`);

        // Function to format the final link with count
        const formatLink = (uuid, name) => {
            const baseLink = `@UUID[${uuid}]{${name}}`;
            return count ? `${baseLink} x ${count}` : baseLink;
        };

        // Only check world actors if the setting is enabled
        if (searchWorldFirst) {
            console.log(`BLACKSMITH | REGENT: Searching world actors...`);
            let foundActor;
            try {
                foundActor = game.actors.getName(strActorName);
                console.log(`BLACKSMITH | REGENT: World actor search result:`, foundActor);
            } catch (error) {
                console.log(`BLACKSMITH | REGENT: Error searching world actors:`, error);
                foundActor = null;
            }

            if (foundActor) {
                strActorID = foundActor.system._id;
                console.log(`BLACKSMITH | REGENT: Found in world actors, returning link with ID: ${strActorID}`);
                return formatLink(`Actor.${strActorID}`, strActorName);
            }
        }

        // Check primary compendium
        console.log(`BLACKSMITH | REGENT: Searching primary compendium...`);
        let compendium = game.packs.get(primaryCompendium);
        if (compendium) {
            console.log(`BLACKSMITH | REGENT: Found primary compendium:`, compendium);
            let index = await compendium.getIndex();
            let entry = index.find(e => e.name === strActorName);
            console.log(`BLACKSMITH | REGENT: Primary compendium search result:`, entry);
            if (entry) {
                strActorID = entry._id;
                console.log(`BLACKSMITH | REGENT: Found in primary compendium, returning link with ID: ${strActorID}`);
                return formatLink(`Compendium.${primaryCompendium}.Actor.${strActorID}`, strActorName);
            }
        } else {
            console.log(`BLACKSMITH | REGENT: Primary compendium not found`);
        }

        // If not found in primary, check secondary compendium
        console.log(`BLACKSMITH | REGENT: Searching secondary compendium...`);
        compendium = game.packs.get(secondaryCompendium);
        if (compendium) {
            console.log(`BLACKSMITH | REGENT: Found secondary compendium:`, compendium);
            let index = await compendium.getIndex();
            let entry = index.find(e => e.name === strActorName);
            console.log(`BLACKSMITH | REGENT: Secondary compendium search result:`, entry);
            if (entry) {
                strActorID = entry._id;
                console.log(`BLACKSMITH | REGENT: Found in secondary compendium, returning link with ID: ${strActorID}`);
                return formatLink(`Compendium.${secondaryCompendium}.Actor.${strActorID}`, strActorName);
            }
        } else {
            console.log(`BLACKSMITH | REGENT: Secondary compendium not found`);
        }

        // If not found in either compendium, return unlinked name
        console.log(`BLACKSMITH | REGENT: Monster not found anywhere, returning unlinked name`);
        return `${strActorName}${count ? ` x ${count}` : ''} (Link Manually)`;
    }

    // If we have UUID data, use that
    if (monsterData.actorUuid) {
        console.log(`BLACKSMITH | REGENT: Using provided UUID:`, monsterData.actorUuid);
        // Extract count if it exists in the name
        const countMatch = monsterData.name.match(/\((\d+)\)[^(]*$/);
        const count = countMatch ? ` x ${countMatch[1]}` : '';
        const cleanName = monsterData.name.replace(/\s*\([^a-zA-Z]*[0-9]+[^)]*\)/g, '').trim();
        return `@UUID[${monsterData.actorUuid}]{${cleanName}}${count}`;
    }

    // If we have the actor name but no UUID, fall back to the legacy behavior
    return buildCompendiumLinkActor(monsterData.actorName || monsterData.name);
}