// ==================================================================
// ===== JOURNAL DECLARATIONS =======================================
// ==================================================================
// Blacksmith's own Journal profiles, declared as data.
//
// THERE IS NO `rendered` FORM HERE, and that is a finding rather than an
// omission. `rendered` was specified as a third form -- fields feed a template
// and the whole payload becomes one HTML string -- and nothing ever used it.
// Expressed against the model as built, it collapses: every Area field is
// `role: 'input'` because none lands at a document path on its own, and one
// derivation composes the HTML and writes the page. That is exactly what
// `rollTableResults` does for a table's rows and `actorContent` does for an
// Actor's envelope, both of them `mapped` and both already proven.
//
// A form that exists in a registry and a documentation table but in no profile
// is indistinguishable from a rule that can never fire, which is the defect
// family this migration keeps finding. So Journal is `mapped`, and `rendered`
// goes.
//
// This file is DATA. Derivation lives in manager-declarations.js, and the HTML
// composition the derivations call lives in parsers/parse-journal-area.js.
// ==================================================================

import { registerDeclaration } from '../registry-declarations.js';

/**
 * A narrative card: a quoted block with artwork, used for the area itself and
 * again for each speaker in the conversations block.
 *
 * Declared once and reused rather than repeated, so the two cannot drift -- they
 * are the same shape read by the same composer.
 */
const NARRATIVE_CARD_FIELDS = [
    { name: 'title', type: 'string', default: '', example: '',
      guidance: 'The heading above the card; defaults to the speaker or area name.' },
    { name: 'description', type: 'string', default: '', example: '',
      guidance: 'The read-aloud text. Plain prose, or an HTML fragment.' },
    { name: 'descriptionsecondary', type: 'string', default: '', example: '',
      guidance: 'A second passage, shown after the first.' },
    { name: 'dialogue', type: 'string', default: '', example: '', acceptsKeys: ['carddialogue'],
      guidance: 'Spoken lines, set apart from the description.' },
    { name: 'imagetitle', type: 'string', default: '', example: '',
      guidance: 'A caption for the card artwork.' }
];

/** The geography every narrative profile carries, in breadcrumb order. */
const GEOGRAPHY_FIELDS = [
    { name: 'realm', role: 'input', type: 'string', default: '', example: '',
      guidance: 'The largest containing place, such as a nation or plane.' },
    { name: 'region', role: 'input', type: 'string', default: '', example: '',
      guidance: 'The region within the realm.' },
    { name: 'site', role: 'input', type: 'string', default: '', example: '',
      guidance: 'The settlement, dungeon or structure.' },
    { name: 'area', role: 'input', type: 'string', default: '', example: '',
      guidance: 'The specific area within the site. Names the journal entry.' },
    // Authored breadcrumbs win over the derived one. The four fields above
    // normally compose it; a payload that says otherwise means it.
    { name: 'breadcrumb', role: 'input', type: 'string', default: '', example: '',
      guidance: 'An explicit breadcrumb, overriding the one built from the geography.' }
];

/**
 * Area Narrative: the scene as a whole, composed from four blocks.
 *
 * Every field is `role: 'input'`. The page content is one HTML document built
 * from all of them together -- a breadcrumb whose leaf falls back through three
 * fields, actor names resolved to links, cards that collapse when empty -- and
 * no field lands anywhere on its own. Splitting that composition per field would
 * be the model driving the code rather than describing it, the same call Roll
 * Table's ranges settled.
 */
export const JOURNAL_AREA_DECLARATION = {
    kind: 'journal',
    id: 'area',
    label: 'Area Narrative',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'JournalEntry' },
    derive: ['journalAreaContent'],
    fields: [
        { name: 'journaltype', role: 'selector', type: 'string',
          values: ['area'], example: 'area',
          guidance: 'Identifies the profile. Keep it exactly "area".' },
        { name: 'foldername', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The Journal folder to file this under; created if it does not exist.' },
        ...GEOGRAPHY_FIELDS,
        { name: 'scenetitle', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The page name. Falls back to the area name.' },
        { name: 'blocks', role: 'input', type: 'object', required: true,
          guidance: 'The content of the scene. At least area or preparation must be present.',
          fields: [
              { name: 'area', type: 'object',
                guidance: 'What the players see and can interact with.',
                fields: [
                    { name: 'title', type: 'string', default: '', example: '',
                      guidance: 'An on-page heading differing from the page name.' },
                    { name: 'narrativecard', type: 'object',
                      guidance: 'The read-aloud card opening the area.',
                      fields: NARRATIVE_CARD_FIELDS },
                    { name: 'narrative', type: 'string', default: '', example: '',
                      guidance: 'The descriptive prose following the card.' },
                    { name: 'interactivedetails', type: 'array', default: [], example: [],
                      guidance: 'Things the players can examine or use, one per entry.' },
                    { name: 'discoverablefacts', type: 'array', default: [], example: [],
                      guidance: 'What investigation reveals, one fact per entry.' }
                ] },
              { name: 'preparation', type: 'object',
                guidance: 'What the GM needs before running the scene.',
                fields: [
                    { name: 'purpose', type: 'array', default: [], example: [],
                      guidance: 'Why this scene exists in the adventure.' },
                    // `threats` is the legacy spelling; the composer reads either.
                    { name: 'actors', type: 'array', default: [], example: [],
                      acceptsKeys: ['threats'],
                      guidance: 'Creatures present. Exact Actor names are resolved to links.' },
                    { name: 'rewards', type: 'array', default: [], example: [],
                      guidance: 'What the scene can yield.' },
                    { name: 'gmnotes', type: 'array', default: [], example: [],
                      guidance: 'Guidance for the GM, never shown to players.' }
                ] },
              { name: 'encounter', type: 'object',
                guidance: 'The combat or challenge, when the scene has one.',
                fields: [
                    { name: 'overview', type: 'string', default: '', example: '',
                      guidance: 'What the encounter is.' },
                    { name: 'tactics', type: 'array', default: [], example: [],
                      guidance: 'How the opposition fights.' },
                    { name: 'triggers', type: 'array', default: [], example: [],
                      guidance: 'What starts it.' },
                    { name: 'specialconditions', type: 'array', default: [], example: [],
                      guidance: 'Terrain, hazards and other modifiers.' }
                ] },
              { name: 'conversations', type: 'array', default: [], example: [],
                guidance: 'The people worth talking to, one entry each.',
                fields: [
                    { name: 'name', type: 'string', required: true, example: '',
                      guidance: 'The speaker. An entry without one is skipped.' },
                    { name: 'keycharacter', type: 'boolean', default: false, example: false,
                      acceptsKeys: ['iskey'],
                      guidance: 'Whether this person is central to the scene.' },
                    { name: 'narrativecard', type: 'object',
                      guidance: 'A read-aloud card for this speaker.',
                      fields: NARRATIVE_CARD_FIELDS },
                    { name: 'snapshot', type: 'array', default: [], example: [],
                      guidance: 'Who they are, at a glance.' },
                    { name: 'theyknow', type: 'array', default: [], example: [],
                      guidance: 'What they know for certain.' },
                    { name: 'theyveheard', type: 'array', default: [], example: [],
                      guidance: 'Rumours they can pass on.' },
                    { name: 'theywant', type: 'array', default: [], example: [],
                      guidance: 'What they are after.' }
                ] }
          ] }
    ]
};

/**
 * Location Narrative: a gazetteer page for a place.
 *
 * Flat where Area is nested, and grouped differently: Area names its entry after
 * the area and holds one page, while Location files every page into one entry --
 * `journalname`, defaulting to "Locations" -- so a world's places read as a single
 * document. That difference is why "which document does a journal profile create"
 * is a per-profile question, and it is the same grouping shape a satellite needs.
 *
 * The `acceptsKeys` below are real authored spellings, not speculation: the
 * composer already reads each pair, and declaring them is what stops the second
 * spelling being reported as an unknown field.
 */
export const JOURNAL_LOCATION_DECLARATION = {
    kind: 'journal',
    id: 'location',
    label: 'Location Narrative',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'JournalEntry' },
    derive: ['journalLocationContent'],
    fields: [
        { name: 'journaltype', role: 'selector', type: 'string',
          values: ['location'], example: 'location',
          guidance: 'Identifies the profile. Keep it exactly "location".' },
        { name: 'foldername', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The Journal folder to file this under; defaults to Libraries.' },
        { name: 'journalname', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The entry every location page is filed into. Defaults to Locations.' },
        // The page name falls back through scenetitle and then realm, so a payload
        // carrying only geography still produces a named page.
        { name: 'title', role: 'input', type: 'string', default: '', example: '',
          acceptsKeys: ['scenetitle'],
          guidance: 'The page name. Falls back to the realm when absent.' },
        ...GEOGRAPHY_FIELDS.filter(field => field.name !== 'breadcrumb'),
        { name: 'locationimage', role: 'input', type: 'string', default: '', example: '',
          acceptsKeys: ['image'],
          guidance: 'Artwork for the location card.' },
        { name: 'introduction', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The opening passage, before the card.' },
        { name: 'cardimagetitle', role: 'input', type: 'string', default: '', example: '',
          acceptsKeys: ['imagetitle'],
          guidance: 'A caption for the card artwork.' },
        { name: 'carddescriptionprimary', role: 'input', type: 'string', default: '', example: '',
          acceptsKeys: ['cardintro'],
          guidance: 'The read-aloud text on the card.' },
        { name: 'carddescriptionsecondary', role: 'input', type: 'string', default: '', example: '',
          acceptsKeys: ['cardfacts'],
          guidance: 'Supporting facts, rendered as a list when comma-separated.' },
        { name: 'geography', role: 'input', type: 'string', default: '', example: '',
          guidance: 'Terrain, climate and the shape of the land.' },
        { name: 'government', role: 'input', type: 'string', default: '', example: '',
          guidance: 'Who rules, and how.' },
        { name: 'trade', role: 'input', type: 'string', default: '', example: '',
          guidance: 'What the place makes, buys and sells.' },
        { name: 'culture', role: 'input', type: 'string', default: '', example: '',
          guidance: 'Customs, and how outsiders are treated.' },
        { name: 'religion', role: 'input', type: 'string', default: '', example: '',
          guidance: 'What is worshipped here.' },
        { name: 'history', role: 'input', type: 'string', default: '', example: '',
          guidance: 'What happened here that still matters.' },
        { name: 'notablelocations', role: 'input', type: 'string', default: '', example: '',
          guidance: 'Places within this one that are worth visiting.' }
    ]
};

registerDeclaration(JOURNAL_AREA_DECLARATION);
registerDeclaration(JOURNAL_LOCATION_DECLARATION);
