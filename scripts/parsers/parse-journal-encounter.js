// ==================================================================
// Encounter journal JSON -> Foundry HTML page content
// ==================================================================
// The composer for the Encounter profile, extracted from `utility-common.js`
// when Journal moved onto declarations, so it sits beside its Area and Location
// counterparts.
//
// It composes only. Which entry the page joins, which folder that entry lives
// in, and whether an existing page is replaced are DESTINATION questions
// `utility-journal-destination.js` owns.
//
// Encounter is not offered for JSON in the import window -- it is labelled
// Legacy there and is prompt-only -- but it is NOT dead: Regent drives it
// through `api.createJournalEntry` on the API root.
// ==================================================================

import { toSentenceCase, playSound } from '../api-core.js';
import { buildFoundryBulletList, normalizeFoundryJournalHtml } from '../utility-journal-html.js';
import { compendiumManager } from '../manager-compendiums.js';

/** Blank, whitespace and the literal "none" all mean absent, so the template never shows "(None)". */
function omitIfNone(value) {
    if (value == null) return '';
    const out = String(value).trim();
    if (!out || out.toLowerCase() === 'none') return '';
    return out;
}

/**
 * A monster name resolved to its compendium UUID, or null.
 *
 * Moved here with the encounter composer: it was private to `utility-common.js`
 * and had exactly one caller, this one.
 * @param {*} monsterData
 * @returns {Promise<string|null>}
 */
async function findMonsterUUID(monsterData) {
    if (typeof monsterData !== 'string') return null;
    const result = await compendiumManager.resolve(monsterData, 'Actor', { exact: true, parseCount: true });
    return result.found ? result.uuid : null;
}

/**
 * Any of the three shapes an author writes a list in, as linked HTML.
 *
 * A string of comma-separated names, an HTML `<li>` list, or an object of
 * label/value pairs are all accepted, because all three appear in real payloads.
 * @param {*} value
 * @returns {Promise<string>}
 */
async function convertObjectToHtml(value) {
    const { buildCompendiumLinkItem } = await import('../utility-common.js');
    if (typeof value === 'string') {
        let items;
        if (value.includes('<li>')) {
            items = (value.match(/<li>(.*?)<\/li>/g) ?? [])
                .map(one => one.replace(/<li>|<\/li>/g, '').trim());
        } else if (value.includes(',')) {
            items = value.split(',').map(one => one.trim());
        } else {
            items = [value.trim()];
        }
        const linked = await Promise.all(items.map(async (item) =>
            (!item || item.toLowerCase() === 'none') ? item : await buildCompendiumLinkItem(item)));
        return buildFoundryBulletList(linked, (item) => item);
    }
    if (typeof value === 'object' && value !== null) {
        const items = [];
        for (const [key, entry] of Object.entries(value)) {
            const linked = typeof entry === 'string' ? await buildCompendiumLinkItem(entry) : entry;
            items.push(`<b>${key}:</b> ${linked}`);
        }
        return buildFoundryBulletList(items, (item) => item);
    }
    return '';
}

/** An existing journal of that name as a UUID link, or the plain title. */
async function createJournalLink(title) {
    const entry = game.journal.find(one => one.name === title);
    return entry ? `@UUID[JournalEntry.${entry.id}]{${title}}` : title;
}

/** The first captured group of whichever pattern matches, trimmed. */
function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = String(text ?? '').match(pattern);
        if (match && match[1]) return match[1].trim();
    }
    return '';
}

/**
 * Labelled values an author wrote as a bulleted list, pulled back out.
 *
 * Synopsis, Key Moments and Difficulty are authored as prose inside a list and
 * are also wanted as structured data, so they are recovered by pattern rather
 * than asked for twice. Three spellings each, because all three appear.
 * @param {string} label
 * @returns {RegExp[]}
 */
function labelPatterns(label) {
    return [
        new RegExp(`<li><strong>${label}</strong>:(.*?)</li>`, 'i'),
        new RegExp(`<li><strong>${label}</strong>(.*?)</li>`, 'i'),
        new RegExp(`<li><strong>${label}:</strong>(.*?)</li>`, 'i')
    ];
}

/**
 * Build the page for one Encounter payload, and the name of the entry it joins.
 *
 * @param {object} journalData - The authored payload.
 * @returns {Promise<{journalName: string, page: object}>}
 */
export async function buildEncounterJournalPage(journalData) {
    const { getCachedTemplate } = await import('../blacksmith.js');
    const { BLACKSMITH } = await import('../const.js');
    const { createHTMLList } = await import('../utility-common.js');

    const template = await getCachedTemplate(BLACKSMITH.JOURNAL_ENCOUNTER_TEMPLATE);

    // A monster list falls back to the first LINKED encounter's monsters, because
    // a page that links an encounter and names no monsters of its own means the
    // linked one's.
    const formatMonsterList = async (monsters) => {
        if (!monsters || monsters === '(Link Manually)') {
            const linked = journalData.linkedEncounters?.[0];
            if (linked?.monsters) return await createHTMLList(linked.monsters);
            return '<ul><li>(No monsters specified)</li></ul>';
        }
        return await createHTMLList(monsters);
    };

    const strRealm = omitIfNone(journalData.realm);
    const strRegion = omitIfNone(journalData.region);
    const strSite = omitIfNone(journalData.site);
    const strArea = omitIfNone(journalData.area);
    const strSceneTitle = omitIfNone(journalData.scenetitle)
        ? toSentenceCase(String(journalData.scenetitle).trim())
        : '';

    // One section built from the flat fields when none are supplied, so a payload
    // written before sections existed still renders.
    const rawSections = Array.isArray(journalData.sections) && journalData.sections.length
        ? journalData.sections
        : [{
            sectiontitle: journalData.sectiontitle ?? '',
            sectionintro: journalData.sectionintro ?? '',
            cards: Array.isArray(journalData.cards) && journalData.cards.length
                ? journalData.cards
                : [{
                    cardtitle: journalData.cardtitle,
                    carddescriptionprimary: journalData.carddescriptionprimary,
                    cardimagetitle: journalData.cardimagetitle,
                    cardimage: journalData.cardimage,
                    carddescriptionsecondary: journalData.carddescriptionsecondary,
                    carddialogue: journalData.carddialogue
                }]
        }];

    const unescapeQuotes = (value) => typeof value === 'string' ? value.replace(/\\"/g, '"') : value;
    const sections = rawSections.map(section => ({
        strSectionTitle: toSentenceCase(section.sectiontitle ?? ''),
        strSectionIntro: section.sectionintro ?? '',
        strContextAdditionalNarration: section.contextadditionalnarration ?? journalData.contextadditionalnarration ?? '',
        strContextAtmosphere: section.contextatmosphere ?? journalData.contextatmosphere ?? '',
        strContextGMNotes: section.contextgmnotes ?? journalData.contextgmnotes ?? '',
        cards: (section.cards ?? []).map(card => ({
            strCardTitle: toSentenceCase(card.cardtitle),
            strCardDescriptionPrimary: unescapeQuotes(card.carddescriptionprimary ?? ''),
            strCardImageTitle: toSentenceCase(card.cardimagetitle),
            strCardImage: card.cardimage ?? '',
            strCardDescriptionSecondary: unescapeQuotes(card.carddescriptionsecondary ?? ''),
            strCardDialogue: unescapeQuotes(card.carddialogue ?? ' ')
        }))
    }));

    let strLinkedEncounters = '';
    if (journalData.linkedEncounters?.length) {
        strLinkedEncounters = '<h3>Linked Encounters</h3><ul>';
        for (const encounter of journalData.linkedEncounters) {
            const name = encounter.name || '';
            if (!name) continue;
            strLinkedEncounters += `<li><strong>${await createJournalLink(name)}</strong>`;
            if (encounter.synopsis) strLinkedEncounters += `<br><em>${encounter.synopsis}</em>`;
            if (encounter.keyMoments?.length) {
                strLinkedEncounters += '<br><strong>Key Moments:</strong><ul>';
                for (const moment of encounter.keyMoments) strLinkedEncounters += `<li>${moment}</li>`;
                strLinkedEncounters += '</ul>';
            }
            if (encounter.monsters) {
                strLinkedEncounters += '<br><strong>Monsters:</strong>';
                strLinkedEncounters += await createHTMLList(encounter.monsters);
            }
            strLinkedEncounters += '</li>';
        }
        strLinkedEncounters += '</ul>';
    }

    const CARDDATA = {
        strRealm, strRegion, strSite, strArea, strSceneTitle,
        strContextIntro: journalData.contextintro,
        strPrepEncounter: await formatMonsterList(journalData.prepencounter),
        strPrepEncounterDetails: journalData.prepencounterdetails,
        strPrepRewards: await convertObjectToHtml(journalData.preprewards),
        strPrepSetup: journalData.prepsetup,
        sections,
        strLinkedEncounters,
        strContextAdditionalNarration: journalData.contextadditionalnarration,
        strContextAtmosphere: journalData.contextatmosphere,
        strContextGMNotes: journalData.contextgmnotes,
        linkedEncounters: journalData.linkedEncounters || [],
        // The raw payload, carried through hidden so the encounter toolbar can read
        // back what a page links without re-parsing the rendered HTML.
        linkedEncountersData: journalData.linkedEncounters?.length
            ? `<div style="display:none" data-linked-encounters="${encodeURIComponent(JSON.stringify(journalData.linkedEncounters))}"><![CDATA[${JSON.stringify(journalData.linkedEncounters)}]]></div>`
            : ''
    };

    playSound(window.COFFEEPUB?.SOUNDEFFECTBOOK02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
    let content = normalizeFoundryJournalHtml(template(CARDDATA));

    // Difficulty and the monster UUIDs ride as data attributes rather than as
    // rendered text: the encounter toolbar reads them, a player never sees them,
    // and recovering them from prose later would mean parsing the page back.
    let attributes = '';
    const difficulty = firstMatch(journalData.prepencounterdetails, labelPatterns('Difficulty'));
    if (difficulty) attributes += ` data-encounter-difficulty="${difficulty}"`;

    if (typeof journalData.prepencounter === 'string') {
        const uuids = [];
        for (const name of journalData.prepencounter.split(', ')) {
            const trimmed = name.trim();
            if (!trimmed) continue;
            const uuid = await findMonsterUUID(trimmed);
            if (uuid) uuids.push(uuid);
        }
        if (uuids.length) attributes += ` data-encounter-monsters="${uuids.join(',')}"`;
    }
    if (attributes) {
        content = `<div style="display:none" data-journal-type="encounter"${attributes}></div>${content}`;
    }

    return {
        // The entry is named for the AREA when there is one, so a site's encounters
        // gather under it, and for the scene otherwise.
        journalName: strArea || strSceneTitle || 'Unnamed Entry',
        page: {
            name: strSceneTitle || strArea || 'Encounter',
            text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }
        }
    };
}
