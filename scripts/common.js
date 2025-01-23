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
import { postConsoleAndNotification, rollCoffeePubDice, playSound, getActorId, getTokenImage, getPortraitImage, getTokenId, objectToString, stringToObject,trimString, generateFormattedDate, toSentenceCase, convertSecondsToString} from './global.js';


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
    var templatePath = BLACKSMITH.JOURNAL_NARRATIVE_TEMPLATE;
    var response = await fetch(templatePath);
    var templateText = await response.text();
    var template = Handlebars.compile(templateText);

    let strSceneParent = journalData.sceneparent;
    let strSceneArea = journalData.scenearea;
    let strSceneEnvironment = journalData.sceneenvironment;
    let strSceneLocation = journalData.scenelocation;
    let strSceneTitle = toSentenceCase(journalData.scenetitle);
    let strContextIntro = journalData.contextintro;
    let strPrepEncounter = await createHTMLList(journalData.prepencounter);
    let strPrepEncounterDetails = journalData.prepencounterdetails;
    let strPrepRewards = journalData.preprewards;
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
    postConsoleAndNotification("BLACKSMITH: strSceneParent", strSceneParent, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strSceneArea", strSceneArea, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strSceneEnvironment", strSceneEnvironment, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strSceneLocation", strSceneLocation, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strSceneTitle", strSceneTitle, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strContextIntro", strContextIntro, false, true, false); 
    postConsoleAndNotification("BLACKSMITH: strPrepEncounter", strPrepEncounter, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strPrepEncounterDetails", strPrepEncounterDetails, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strPrepRewards", strPrepRewards, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strPrepSetup", strPrepSetup, false, true, false);   
    postConsoleAndNotification("BLACKSMITH: strCardTitle", strCardTitle, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strCardDescriptionPrimary", strCardDescriptionPrimary, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strCardImageTitle", strCardImageTitle, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strCardImage", strCardImage, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strCardDescriptionSecondary", strCardDescriptionSecondary, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strCardDialogue", strCardDialogue, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strContextAdditionalNarration", strContextAdditionalNarration, false, true, false); 
    postConsoleAndNotification("BLACKSMITH: strContextAtmosphere", strContextAtmosphere, false, true, false);
    postConsoleAndNotification("BLACKSMITH: strContextGMNotes", strContextGMNotes, false, true, false); 

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
        strContextGMNotes: strContextGMNotes
    };

    // Play a victory sound. lol
    playSound(COFFEEPUB.SOUNDEFFECTBOOK02, COFFEEPUB.SOUNDVOLUMENORMAL);

    // Set the content
    compiledHtml = template(CARDDATA);

    // Check if the journal entry already exists
    let existingEntry = game.journal.find(entry => entry.name === strSceneArea && entry.folder?.id === folder?.id);
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
                    format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML // Use the constant for the format
                }
            });
        } else {
            // Add a new page to the existing journal entry
            await existingEntry.createEmbeddedDocuments("JournalEntryPage", [{
                name: strSceneTitle,
                type: "text",
                text: {
                    content: compiledHtml,
                    format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML // Use the constant for the format
                }
            }]);
        }
    } else {
        // Create a new journal entry with a page
        await JournalEntry.create({
            name: strSceneArea,
            pages: [
                {
                    name: strSceneTitle,
                    type: "text",
                    text: {
                        content: compiledHtml,
                        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML // Use the constant for the format
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

export async function buildCompendiumLinkActor(actorName) {
    var strCompendiumName = "ddb-shared-compendium.ddb-monsters"; 
    var strActorName = actorName;
    let strActorID;
    var strCompendiumLink = "";

    let foundActor;
    try {
        foundActor = game.actors.getName(strActorName);
    } catch (error) {
        foundActor = null;
    }

    if (foundActor) {
        strActorID = foundActor.system._id;
        strCompendiumLink = "@UUID[Actor."+strActorID+"]{" + strActorName + "}";
    } else {
        // Actor not found locally, we will now look into the compendium
        let compendium = game.packs.get(strCompendiumName); 
        if (!compendium){
            strCompendiumLink = strActorName + "(Not Found locally or in the compendium.)";
            return strCompendiumLink;
        } else {
            let index = await compendium.getIndex();
            let entry = index.find(e => e.name === strActorName); 
            if (!entry){
                strCompendiumLink = strActorName + " (Link Manually)";
                return strCompendiumLink;
            } else {
                strActorID = entry._id;
                strCompendiumLink = "@UUID[Compendium." + strCompendiumName + ".Actor." + strActorID +"]{" + strActorName + "}";
            }
        }
    }
    return strCompendiumLink;
}