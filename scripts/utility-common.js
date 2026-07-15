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
import { MODULE, BLACKSMITH } from './const.js';
// COFFEEPUB now available globally via window.COFFEEPUB
// get the common utilities
import { postConsoleAndNotification, rollCoffeePubDice, playSound, getActorId, getTokenImage, getPortraitImage, getTokenId, objectToString, stringToObject,trimString, generateFormattedDate, toSentenceCase, convertSecondsToRounds} from './api-core.js';
// Import template caching function
import { getCachedTemplate } from './blacksmith.js';
import {
    buildFoundryBulletList,
    normalizeFoundryJournalHtml,
    applyJournalHeadingSpacing
} from './utility-journal-html.js';
import { buildAreaJournalTemplateData } from './parsers/parse-journal-area.js';
import { compendiumManager, parseQuantity, formatLink } from './manager-compendiums.js';


// ================================================================== 
// ===== GLOBAL FUNCTIONS ===========================================
// ================================================================== 


// ***************************************************
// ** UTILITY Build area / encounter / location journals
// ***************************************************
/**
 * Build and create a JournalEntry from structured JSON (area, encounter, or location).
 * Exposed on `game.modules.get('coffee-pub-blacksmith').api.createJournalEntry` — do not import this file from other modules.
 * @param {Object} journalData - Payload; see `documentation/api-create-journal-entry.md`.
 * @returns {Promise<JournalEntry|void>}
 */
export async function createJournalEntry(journalData) {
    var strFolderName = toSentenceCase(journalData.foldername);
    var compiledHtml = "";
    let folder;
    const journalType = String(journalData?.journaltype ?? '').trim().toUpperCase();

            postConsoleAndNotification(MODULE.NAME, "createJournalEntry journalData", journalData, true, false);

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

    if (journalType === "LOCATION") {
        return await createLocationJournalEntry(journalData, folder);
    }

    if (journalType === 'AREA') {
        return await createAreaJournalEntry(journalData, folder);
    }

    if (journalType === 'NARRATIVE') {
        throw new Error(
            'Legacy narrative journals are not supported. Use journaltype "area" with the blocks envelope (prompt-journal-profile-area.txt).'
        );
    }

    if (journalType !== 'ENCOUNTER') {
        throw new Error(
            `Unsupported journaltype "${journalData.journaltype}". Supported: area, encounter, location.`
        );
    }

    const template = await getCachedTemplate(BLACKSMITH.JOURNAL_ENCOUNTER_TEMPLATE);

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
            return buildFoundryBulletList(linkedItems, (item) => item);
        }
        if (typeof obj === 'object' && obj !== null) {
            const items = [];
            for (const [key, value] of Object.entries(obj)) {
                let linked = value;
                if (typeof value === 'string') {
                    linked = await buildCompendiumLinkItem(value);
                }
                items.push(`<b>${key}:</b> ${linked}`);
            }
            return buildFoundryBulletList(items, (item) => item);
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

    let strRealm = journalData.realm;
    let strRegion = journalData.region;
    let strSite = journalData.site;
    let strArea = journalData.area;
    // None or empty means omit from journal: normalize so template never shows "(None)"
    const omitIfNone = (s) => (s == null || String(s).trim() === '' || String(s).trim().toLowerCase() === 'none') ? '' : String(s).trim();
    strRealm = omitIfNone(strRealm);
    strRegion = omitIfNone(strRegion);
    strSite = omitIfNone(strSite);
    strArea = omitIfNone(strArea);
    const rawSceneTitle = journalData.scenetitle;
    let strSceneTitle = omitIfNone(rawSceneTitle) ? toSentenceCase(String(rawSceneTitle).trim()) : '';
    let strContextIntro = journalData.contextintro;
    let strPrepEncounter = await formatMonsterList(journalData.prepencounter);
    let strPrepEncounterDetails = journalData.prepencounterdetails;
    let strPrepRewards = await convertObjectToHtml(journalData.preprewards);
    let strPrepSetup = journalData.prepsetup;
    // Normalize to sections array: use journalData.sections if present, else one section from flat fields (sectiontitle, sectionintro, cards or legacy card fields)
    const rawSections = Array.isArray(journalData.sections) && journalData.sections.length > 0
        ? journalData.sections
        : (() => {
            const rawCards = Array.isArray(journalData.cards) && journalData.cards.length > 0
                ? journalData.cards
                : [{
                    cardtitle: journalData.cardtitle,
                    carddescriptionprimary: journalData.carddescriptionprimary,
                    cardimagetitle: journalData.cardimagetitle,
                    cardimage: journalData.cardimage,
                    carddescriptionsecondary: journalData.carddescriptionsecondary,
                    carddialogue: journalData.carddialogue
                }];
            return [{
                sectiontitle: journalData.sectiontitle ?? '',
                sectionintro: journalData.sectionintro ?? '',
                cards: rawCards
            }];
        })();
    const sections = rawSections.map(sec => ({
        strSectionTitle: toSentenceCase(sec.sectiontitle ?? ''),
        strSectionIntro: sec.sectionintro ?? '',
        strContextAdditionalNarration: sec.contextadditionalnarration ?? journalData.contextadditionalnarration ?? '',
        strContextAtmosphere: sec.contextatmosphere ?? journalData.contextatmosphere ?? '',
        strContextGMNotes: sec.contextgmnotes ?? journalData.contextgmnotes ?? '',
        cards: (Array.isArray(sec.cards) ? sec.cards : []).map(c => {
            const unescapeQuotes = (s) => typeof s === 'string' ? s.replace(/\\"/g, '"') : s;
            return {
                strCardTitle: toSentenceCase(c.cardtitle),
                strCardDescriptionPrimary: unescapeQuotes(c.carddescriptionprimary ?? ''),
                strCardImageTitle: toSentenceCase(c.cardimagetitle),
                strCardImage: c.cardimage ?? '',
                strCardDescriptionSecondary: unescapeQuotes(c.carddescriptionsecondary ?? ''),
                strCardDialogue: unescapeQuotes(c.carddialogue ?? ' ')
            };
        })
    }));
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
        strRealm: strRealm,
        strRegion: strRegion,
        strSite: strSite,
        strArea: strArea,
        strSceneTitle: strSceneTitle,
        strContextIntro: strContextIntro,
        strPrepEncounter: strPrepEncounter,
        strPrepEncounterDetails: strPrepEncounterDetails,
        strPrepRewards: strPrepRewards,
        strPrepSetup: strPrepSetup,
        sections: sections,
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
            playSound(window.COFFEEPUB?.SOUNDEFFECTBOOK02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

  // Set the content
    compiledHtml = normalizeFoundryJournalHtml(template(CARDDATA));

    // Add metadata at the top of the journal entry for programmatic access
    // This will make it easier to identify and manipulate journal entries
    const metadata = {
        type: journalData.journaltype,
        realm: strRealm || "",
        region: strRegion || "",
        site: strSite || "",
        area: strArea || "",
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
    
    // For encounters, create clean data attributes instead of bloated metadata
    if (journalData.journaltype && journalData.journaltype.toLowerCase() === 'encounter') {
        let encounterDataAttributes = '';
        
        // Extract difficulty from prepencounterdetails
        if (journalData.prepencounterdetails) {
            const difficultyPatterns = [
                /<li><strong>Difficulty<\/strong>:(.*?)<\/li>/i,
                /<li><strong>Difficulty<\/strong>(.*?)<\/li>/i,
                /<li><strong>Difficulty:<\/strong>(.*?)<\/li>/i
            ];
            
            for (const pattern of difficultyPatterns) {
                const match = journalData.prepencounterdetails.match(pattern);
                if (match && match[1]) {
                    encounterDataAttributes += ` data-encounter-difficulty="${match[1].trim()}"`;
                    break;
                }
            }
        }
        
        // Process monster names into UUIDs for the data attributes
        if (journalData.prepencounter && typeof journalData.prepencounter === 'string') {
            const monsterNames = journalData.prepencounter.split(", ");
            const monsterUUIDs = [];
            
            for (const monsterName of monsterNames) {
                const trimmedName = monsterName.trim();
                if (trimmedName) {
                    // Use the same logic as buildCompendiumLinkActor to find the UUID
                    const uuid = await findMonsterUUID(trimmedName);
                    if (uuid) {
                        monsterUUIDs.push(uuid);
                    }
                }
            }
            
            if (monsterUUIDs.length > 0) {
                encounterDataAttributes += ` data-encounter-monsters="${monsterUUIDs.join(',')}"`;
            }
        }
        
        // Add encounter data attributes to the HTML
        if (encounterDataAttributes) {
            const encounterDataBlock = `<div style="display:none" data-journal-type="encounter"${encounterDataAttributes}></div>`;
            compiledHtml = encounterDataBlock + compiledHtml;
        }
    }

    // Check if the journal entry already exists
    let existingEntry = game.journal.find(entry => {
        // If we have a scene area, use that, otherwise use scene title
        const entryName = strArea || strSceneTitle || "Unnamed Entry";
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
            name: strArea || strSceneTitle || "Unnamed Entry",
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

async function createAreaJournalEntry(journalData, folder) {
    const blocks = journalData?.blocks;
    if (!blocks || typeof blocks !== 'object' || (!blocks.area && !blocks.preparation)) {
        throw new Error('Area journals require a "blocks" object with at least blocks.area or blocks.preparation.');
    }

    const omitIfNone = (s) => (s == null || String(s).trim() === '' || String(s).trim().toLowerCase() === 'none')
        ? ''
        : String(s).trim();
    const strArea = omitIfNone(journalData.area);
    const rawSceneTitle = journalData.scenetitle;
    const strSceneTitle = omitIfNone(rawSceneTitle) ? toSentenceCase(String(rawSceneTitle).trim()) : '';

    let template;
    let templateData;
    let compiledHtml;
    try {
        template = await getCachedTemplate(BLACKSMITH.JOURNAL_AREA_TEMPLATE);
        templateData = await buildAreaJournalTemplateData(journalData);
        compiledHtml = applyJournalHeadingSpacing(normalizeFoundryJournalHtml(template(templateData)));
    } catch (error) {
        const detail = error?.message || String(error);
        throw new Error(`Area journal HTML build failed: ${detail}`);
    }

    playSound(window.COFFEEPUB?.SOUNDEFFECTBOOK02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);

    const existingEntry = game.journal.find((entry) => {
        const entryName = strArea || strSceneTitle || 'Unnamed Entry';
        return entry.name === entryName && entry.folder?.id === folder?.id;
    });

    const pagePayload = {
        name: strSceneTitle || strArea || 'Area',
        type: 'text',
        text: {
            content: compiledHtml,
            format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
        }
    };

    if (existingEntry) {
        const existingPage = existingEntry.pages.find((page) => page.name === pagePayload.name);
        if (existingPage) {
            await existingPage.update(pagePayload);
        } else {
            await existingEntry.createEmbeddedDocuments('JournalEntryPage', [pagePayload]);
        }
        return;
    }

    await JournalEntry.create({
        name: strArea || strSceneTitle || 'Unnamed Entry',
        pages: [pagePayload],
        folder: folder ? folder.id : undefined
    });
}

async function createLocationJournalEntry(journalData, folder) {
    const normalize = (value) => {
        if (value == null) return '';
        const out = String(value).trim();
        if (!out) return '';
        if (out.toLowerCase() === 'none') return '';
        return out;
    };

    const strTitle = toSentenceCase(
        normalize(journalData.title)
        || normalize(journalData.scenetitle)
        || normalize(journalData.realm)
        || 'Unnamed Location'
    );
    const strJournalName = toSentenceCase(
        normalize(journalData.journalname)
        || 'Locations'
    );
    const strRealm = normalize(journalData.realm);
    const strRegion = normalize(journalData.region);
    const strSite = normalize(journalData.site);
    const strArea = normalize(journalData.area);
    let targetFolder = folder;
    if (!targetFolder) {
        const defaultFolderName = 'Libraries';
        targetFolder = game.folders.find((x) => x.name === defaultFolderName && x.type === "JournalEntry");
        if (!targetFolder) {
            targetFolder = await Folder.create({
                name: defaultFolderName,
                type: "JournalEntry",
                parent: null
            });
        }
    }
    const strLocationImage = normalize(journalData.locationimage) || normalize(journalData.image);
    const formatFactsAsList = (value) => {
        const out = normalize(value);
        if (!out) return '';
        if (/<\s*(ul|ol)\b/i.test(out)) return out;
        if (/<\s*li\b/i.test(out)) return `<ul>${out}</ul>`;

        const escapeHtml = (s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        let items = out
            .split(/\r?\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (items.length <= 1) {
            items = out
                .split(/\s*;\s*/)
                .map((s) => s.trim())
                .filter(Boolean);
        }
        if (items.length <= 1) {
            items = [out];
        }
        return buildFoundryBulletList(items);
    };

    const template = await getCachedTemplate(BLACKSMITH.JOURNAL_LOCATION_TEMPLATE);
    const CARDDATA = {
        strTitle,
        strRealm,
        strRegion,
        strSite,
        strArea,
        strLocationImage,
        strIntroduction: normalize(journalData.introduction),
        strCardTitle: strTitle,
        strCardImageTitle: normalize(journalData.cardimagetitle) || normalize(journalData.imagetitle),
        strCardImage: strLocationImage,
        strCardDescriptionPrimary: normalize(journalData.carddescriptionprimary) || normalize(journalData.cardintro),
        strCardDescriptionSecondary: formatFactsAsList(normalize(journalData.carddescriptionsecondary) || normalize(journalData.cardfacts)),
        strGeography: normalize(journalData.geography),
        strGovernment: normalize(journalData.government),
        strTrade: normalize(journalData.trade),
        strCulture: normalize(journalData.culture),
        strReligion: normalize(journalData.religion),
        strHistory: normalize(journalData.history),
        strNotableLocations: normalize(journalData.notablelocations)
    };

    playSound(window.COFFEEPUB?.SOUNDEFFECTBOOK02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
    const compiledHtml = normalizeFoundryJournalHtml(template(CARDDATA));
    const pageData = {
        name: strTitle,
        type: "text",
        text: {
            content: compiledHtml,
            format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
        }
    };

    const existingEntry = game.journal.find((entry) => entry.name === strJournalName && entry.folder?.id === targetFolder?.id);
    if (existingEntry) {
        const existingPage = existingEntry.pages.find((page) => page.name === strTitle);
        if (existingPage) {
            await existingPage.update(pageData);
        } else {
            await existingEntry.createEmbeddedDocuments("JournalEntryPage", [pageData]);
        }
        return;
    }

    await JournalEntry.create({
        name: strJournalName,
        pages: [pageData],
        folder: targetFolder ? targetFolder.id : undefined
    });
}





// ***************************************************
// ** UTILITY Build Compendium Links
// ***************************************************
//
// These are thin wrappers over CompendiumManager (scripts/manager-compendiums.js),
// which owns the one implementation of name -> UUID resolution. Do not add
// setting-reading loops here; extend the manager instead.

// Helper function to find monster UUID
async function findMonsterUUID(monsterData) {
    if (typeof monsterData !== 'string') return null;
    const result = await compendiumManager.resolve(monsterData, 'Actor', { exact: true, parseCount: true });
    return result.found ? result.uuid : null;
}

export async function createHTMLList(monsterString) {
    const monsters = monsterString.split(', ');
    const items = [];
    for (const raw of monsters) {
        const linked = await buildCompendiumLinkActor(raw);
        items.push(linked);
    }
    return buildFoundryBulletList(items, (item) => item);
}

// ***************************************************
// ** UTILITY Build Actor Compendium Links
// ***************************************************

export async function buildCompendiumLinkActor(monsterData) {
    // Plain name, possibly annotated with a count ("Goblin (3)") or CR ("Goblin (CR 1/4)")
    if (typeof monsterData === 'string') {
        // Actors stay exact-match only so "Goblin" can't resolve to "Goblin Boss".
        return compendiumManager.resolveLink(monsterData, 'Actor', { exact: true, parseCount: true });
    }
    // If we already have a UUID, use it directly
    if (monsterData?.actorUuid) {
        const { name, count } = parseQuantity(monsterData.name);
        return formatLink(monsterData.actorUuid, name, count);
    }
    // Name but no UUID: resolve it
    return buildCompendiumLinkActor(monsterData?.actorName || monsterData?.name || '');
}

// ***************************************************
// ** UTILITY Build Item Compendium Links
// ***************************************************

export async function buildCompendiumLinkItem(itemData) {
    // Plain name. Items allow the startsWith tier (the resolver's default), which
    // preserves the prefix-match behavior this function has always had.
    if (typeof itemData === 'string') {
        return compendiumManager.resolveLink(itemData, 'Item');
    }
    // If we already have a UUID, use it directly
    if (itemData?.itemUuid) {
        return formatLink(itemData.itemUuid, String(itemData.name ?? '').trim());
    }
    // Name but no UUID: resolve it
    return buildCompendiumLinkItem(itemData?.itemName || itemData?.name || '');
}

// ***************************************************
// ** UTILITY Build Injury Journal
// ***************************************************

export async function buildInjuryJournalEntry(journalData) {
    let blnImage = true;
    let folder;
    const strJournalType = journalData.journaltype;
    const strCategory = journalData.category;
    const intOdds = journalData.odds;
    const strFolderName = toSentenceCase(journalData.foldername);
    const strTitle = toSentenceCase(journalData.title);
    const strImageTitle = toSentenceCase(journalData.imagetitle);
    let strImage = journalData.image;
    if (strImage === 'none') {
        blnImage = false;
    }
    const strDescription = journalData.description;
    const strTreatment = journalData.treatment;
    const strSeverity = journalData.severity;
    const intDamage = journalData.damage;
    const strCardDamage = `${intDamage} Hit Points`;
    const intDuration = journalData.duration;
    const strCardDuration = convertSecondsToRounds(journalData.duration);
    const strAction = journalData.action;
    const strStatusEffect = journalData.statuseffect;

    if (strFolderName) {
        const existingFolder = game.folders.find((x) => x.name === strFolderName && x.type === 'JournalEntry');
        if (existingFolder) {
            folder = existingFolder;
        } else {
            folder = await Folder.create({
                name: strFolderName,
                type: 'JournalEntry',
                parent: null
            });
        }
    }

    const template = await getCachedTemplate(BLACKSMITH.JOURNAL_INJURY_TEMPLATE);
    const CARDDATA = {
        strJournalType,
        strCategory: toSentenceCase(strCategory),
        intOdds,
        strFolderName,
        strTitle,
        blnImage,
        strImageTitle,
        strImage,
        strDescription,
        strTreatment,
        strSeverity: toSentenceCase(strSeverity),
        intDamage,
        strCardDamage,
        intDuration,
        strCardDuration,
        strAction,
        strStatusEffect
    };

    playSound(window.COFFEEPUB?.SOUNDEFFECTBOOK02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
    const compiledHtml = template(CARDDATA);
    const newPage = { type: 'text', name: strTitle, text: { content: compiledHtml } };
    const existingEntry = game.journal.contents.find((x) => x.name === toSentenceCase(strCategory));
    if (existingEntry) {
        const existingPages = Array.isArray(existingEntry.pages) ? existingEntry.pages : [];
        existingPages.push(newPage);
        await existingEntry.update({
            pages: existingPages,
            type: 'html',
            img: '',
            folder: folder ? folder.id : undefined
        });
    } else {
        await JournalEntry.create({
            name: toSentenceCase(strCategory),
            pages: [newPage],
            type: 'html',
            img: '',
            folder: folder ? folder.id : undefined
        });
    }
}

/**
 * Copy text to clipboard with multiple fallback methods
 * @param {string} text - The text to copy
 * @param {{ notify?: boolean, successMessage?: string }} [options]
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function copyToClipboard(text, options = {}) {
    const notify = options.notify !== false;
    const successMessage = options.successMessage ?? 'Copied to clipboard!';

    const notifySuccess = () => {
        if (notify) {
            ui.notifications.info(successMessage);
        }
    };

    // Method 1: Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            notifySuccess();
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Modern clipboard API failed', error, false, false);
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
            notifySuccess();
            return true;
        }
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Legacy clipboard method failed', error, false, false);
    }
    // Method 3: Show dialog with text for manual copying (DialogV2; content built as DOM so the snippet is not interpreted as HTML)
    const DialogV2 = foundry.applications.api.DialogV2;
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'Automatic clipboard copy failed. Please manually copy the text below:';
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.style.width = '100%';
    ta.style.height = '200px';
    ta.style.marginTop = '10px';
    ta.value = text;
    wrap.appendChild(p);
    wrap.appendChild(ta);

    let dlg;
    dlg = new DialogV2({
        window: { title: 'Copy to Clipboard' },
        position: { width: 480 },
        content: wrap,
        buttons: [
            {
                action: 'close',
                label: 'Close',
                default: true,
                callback: () => {
                    void dlg.close();
                }
            }
        ]
    });
    void dlg.render({ force: true });
    return false;
}
