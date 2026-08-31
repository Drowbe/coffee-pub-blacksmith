// ==================================================================
// Location journal JSON -> Foundry HTML page content
// ==================================================================
// The composer for the Location profile, extracted from `utility-common.js`
// when Journal moved onto declarations, so it sits beside its Area counterpart
// rather than inside the shared utility module.
//
// It composes only. Which entry the page joins, which folder that entry lives
// in, and whether an existing page is replaced are DESTINATION questions the
// importer owns, not this file.
// ==================================================================

import { buildFoundryBulletList, normalizeFoundryJournalHtml } from '../utility-journal-html.js';
import { toSentenceCase } from '../api-core.js';

/** Blank, whitespace and the literal "none" all mean absent. */
function normalize(value) {
    if (value == null) return '';
    const out = String(value).trim();
    if (!out || out.toLowerCase() === 'none') return '';
    return out;
}

/**
 * Supporting facts as a list, however they were written.
 *
 * Authors supply these three ways and all three are legitimate: already-marked-up
 * HTML, one fact per line, or semicolons. Guessing wrong turns a list of facts
 * into one run-on paragraph, so each shape is tried in turn and a single
 * unsplittable value is left as prose rather than forced into a one-item list.
 * @param {*} value
 * @returns {string}
 */
function formatFactsAsList(value) {
    const out = normalize(value);
    if (!out) return '';
    if (/<\s*(ul|ol)\b/i.test(out)) return out;
    if (/<\s*li\b/i.test(out)) return `<ul>${out}</ul>`;

    let items = out.split(/\r?\n+/).map((one) => one.trim()).filter(Boolean);
    if (items.length <= 1) {
        items = out.split(/\s*;\s*/).map((one) => one.trim()).filter(Boolean);
    }
    if (items.length <= 1) return out;
    return buildFoundryBulletList(items);
}

/**
 * Build the page for one Location payload, and the name of the entry it joins.
 *
 * The page name falls back through `title`, `scenetitle` and then `realm`, so a
 * payload carrying only geography still produces a named page rather than an
 * "Unnamed Location" nobody can find.
 *
 * @param {object} journalData - The authored payload.
 * @returns {Promise<{journalName: string, page: object}>}
 */
export async function buildLocationJournalPage(journalData) {
    const { getCachedTemplate } = await import('../blacksmith.js');
    const { BLACKSMITH } = await import('../const.js');

    const strTitle = toSentenceCase(
        normalize(journalData.title)
        || normalize(journalData.scenetitle)
        || normalize(journalData.realm)
        || 'Unnamed Location'
    );
    const strLocationImage = normalize(journalData.locationimage) || normalize(journalData.image);

    const template = await getCachedTemplate(BLACKSMITH.JOURNAL_LOCATION_TEMPLATE);
    const content = normalizeFoundryJournalHtml(template({
        strTitle,
        strRealm: normalize(journalData.realm),
        strRegion: normalize(journalData.region),
        strSite: normalize(journalData.site),
        strArea: normalize(journalData.area),
        strLocationImage,
        strIntroduction: normalize(journalData.introduction),
        strCardTitle: strTitle,
        strCardImageTitle: normalize(journalData.cardimagetitle) || normalize(journalData.imagetitle),
        strCardImage: strLocationImage,
        strCardDescriptionPrimary: normalize(journalData.carddescriptionprimary) || normalize(journalData.cardintro),
        strCardDescriptionSecondary: formatFactsAsList(
            normalize(journalData.carddescriptionsecondary) || normalize(journalData.cardfacts)),
        strGeography: normalize(journalData.geography),
        strGovernment: normalize(journalData.government),
        strTrade: normalize(journalData.trade),
        strCulture: normalize(journalData.culture),
        strReligion: normalize(journalData.religion),
        strHistory: normalize(journalData.history),
        strNotableLocations: normalize(journalData.notablelocations)
    }));

    return {
        // Every location page files into one shared entry, so a world's places
        // read as a single document rather than one entry per village.
        journalName: toSentenceCase(normalize(journalData.journalname) || 'Locations'),
        page: {
            name: strTitle,
            type: 'text',
            text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }
        }
    };
}
