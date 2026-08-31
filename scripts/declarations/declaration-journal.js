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
// The geography vocabulary, from the LEAF rather than from manager-geography.js.
// The manager reaches const.js, which fetches module.json as it loads, and a
// static import of it here would cost the whole declaration layer its headless
// derivation -- the property that lets validation and templates be asserted
// outside a running world. The leaf has zero imports, verified by importing it.
import { GEOGRAPHY_FIELD_LIST } from '../utility-geography-vocabulary.js';

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
      guidance: 'A caption for the card artwork.' },
    { name: 'image', type: 'string', default: '', example: '',
      guidance: 'Artwork for the card; blank falls back to the campaign default.' }
];

/**
 * The geography every narrative profile carries, in breadcrumb order.
 *
 * DERIVED from the geography vocabulary rather than restated. These four were
 * declared in three places at once -- here, `manager-geography.js`, and the
 * importer's own seed map -- which is the defect the declaration model exists to
 * end, so having it inside the model was not tolerable.
 *
 * The vocabulary owns the names and their order; this owns how they are authored.
 * A fifth field appears in every profile with no edit here.
 */
const GEOGRAPHY_GUIDANCE = {
    realm: 'The largest containing place, such as a nation or plane.',
    region: 'The region within the realm.',
    site: 'The settlement, dungeon or structure.',
    area: 'The specific area within the site. Names the journal entry.'
};

/**
 * The spellings Regent's generated payloads use for three of the four.
 *
 * Accepted rather than dropped. Blacksmith read none of these names anywhere, so
 * every Regent encounter imported successfully with its whole breadcrumb missing --
 * a success that lost data, which is worse than a failure. `sceneenvironment` is
 * absent on purpose: it is a HABITAT, not a breadcrumb step.
 */
const REGENT_GEOGRAPHY_KEYS = {
    realm: 'scenelocation',
    region: 'sceneparent',
    area: 'scenearea'
};

const GEOGRAPHY_FIELDS = [
    ...GEOGRAPHY_FIELD_LIST.map(field => ({
        name: field.key, role: 'input', type: 'string', default: '', example: '',
        guidance: GEOGRAPHY_GUIDANCE[field.key] ?? `${field.label}.`
    })),
    // Not part of the vocabulary: an authored breadcrumb OVERRIDES the one built
    // from the four above, so it belongs to the journal profile rather than to
    // geography, which has no notion of a rendered path.
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
                    // An OBJECT of three labelled passages, not a string. The composer
                    // renders each as its own bullet under a Narrative heading, and a
                    // string here reaches it and renders nothing.
                    { name: 'narrative', type: 'object',
                      guidance: 'The descriptive prose following the card, in three parts.',
                      fields: [
                          { name: 'description', type: 'string', default: '', example: '',
                            guidance: 'What the area is.' },
                          { name: 'layout', type: 'string', default: '', example: '',
                            guidance: 'How the space is arranged and moved through.' },
                          { name: 'atmosphere', type: 'string', default: '', example: '',
                            guidance: 'How it feels: light, sound, smell, mood.' }
                      ] },
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

/** A read-aloud card. Encounter nests these inside sections; Area uses its own shape. */
const ENCOUNTER_CARD_FIELDS = [
    { name: 'cardtitle', type: 'string', default: '', example: '',
      guidance: 'The heading above the card.' },
    { name: 'carddescriptionprimary', type: 'string', default: '', example: '',
      guidance: 'The read-aloud text.' },
    { name: 'carddescriptionsecondary', type: 'string', default: '', example: '',
      guidance: 'A second passage, after the first.' },
    { name: 'carddialogue', type: 'string', default: '', example: '',
      guidance: 'Spoken lines, set apart from the description.' },
    { name: 'cardimage', type: 'string', default: '', example: '',
      guidance: 'Artwork for the card.' },
    { name: 'cardimagetitle', type: 'string', default: '', example: '',
      guidance: 'A caption for the artwork.' }
];

/** The three context passages, offered per section and again as a whole-page default. */
function contextFields(scope) {
    return [
        { name: 'contextadditionalnarration', type: 'string', default: '', example: '',
          guidance: `Further narration for ${scope}.` },
        { name: 'contextatmosphere', type: 'string', default: '', example: '',
          guidance: `Light, sound and mood for ${scope}.` },
        { name: 'contextgmnotes', type: 'string', default: '', example: '',
          guidance: `Guidance for the GM about ${scope}; never shown to players.` }
    ];
}

/**
 * Encounter: a prepared combat or challenge, in sections.
 *
 * Not offered for JSON in the import window -- it is labelled Legacy there and is
 * prompt-only -- but it is NOT dead. Regent drives it through
 * `api.createJournalEntry` on the API root, which is why it is declared rather
 * than retired.
 *
 * Regent's payloads name the breadcrumb fields differently, so those spellings are
 * declared as `acceptsKeys` rather than left to be dropped. They were being
 * dropped: Blacksmith read none of `scenelocation`, `sceneparent` or `scenearea`
 * anywhere, so every Regent encounter imported successfully with its entire
 * breadcrumb missing. `sceneenvironment` is deliberately NOT among them -- it is a
 * HABITAT, which is a scene-geography field with its own vocabulary rather than a
 * step in the breadcrumb, and it lands when the scene-geography write does.
 */
export const JOURNAL_ENCOUNTER_DECLARATION = {
    kind: 'journal',
    id: 'encounter',
    label: 'Encounter',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'JournalEntry' },
    // NOT REGISTERED YET. The composer it needs is still inside
    // `utility-common.js`'s encounter branch, and a profile whose derivation cannot
    // run is worse than one that does not exist: it registers, validates, and then
    // fails at construction. It registers when `parsers/parse-journal-encounter.js`
    // does. The field surface below is verified against the composer's CARDDATA and
    // is the finished half.
    derive: ['journalEncounterContent'],
    fields: [
        { name: 'journaltype', role: 'selector', type: 'string',
          values: ['encounter'], example: 'encounter',
          guidance: 'Identifies the profile. Keep it exactly "encounter".' },
        { name: 'foldername', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The Journal folder to file this under; created if it does not exist.' },
        ...GEOGRAPHY_FIELDS.map(field => ({
            ...field,
            ...(REGENT_GEOGRAPHY_KEYS[field.name]
                ? { acceptsKeys: [REGENT_GEOGRAPHY_KEYS[field.name]] }
                : {})
        })),
        { name: 'scenetitle', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The page name.' },
        { name: 'contextintro', role: 'input', type: 'string', default: '', example: '',
          guidance: 'The opening passage, before any section.' },
        { name: 'prepencounter', role: 'input', type: 'string', default: '', example: '',
          guidance: 'What the encounter is, in one line.' },
        { name: 'prepencounterdetails', role: 'input', type: 'string', default: '', example: '',
          guidance: 'How it runs: numbers, tactics, terrain.' },
        { name: 'preprewards', role: 'input', type: 'string', default: '', example: '',
          guidance: 'What the encounter yields.' },
        { name: 'prepsetup', role: 'input', type: 'string', default: '', example: '',
          guidance: 'What the GM should have ready before running it.' },
        ...contextFields('the whole page').map(field => ({ ...field, role: 'input' })),
        { name: 'sections', role: 'input', type: 'array', default: [], example: [],
          guidance: 'The beats of the encounter, in order.',
          fields: [
              { name: 'sectiontitle', type: 'string', default: '', example: '',
                guidance: 'The heading for this beat.' },
              { name: 'sectionintro', type: 'string', default: '', example: '',
                guidance: 'The opening passage for this beat.' },
              ...contextFields('this section'),
              { name: 'cards', type: 'array', default: [], example: [],
                guidance: 'Read-aloud cards within this section.',
                fields: ENCOUNTER_CARD_FIELDS }
          ] },
        { name: 'linkedEncounters', role: 'input', type: 'array', default: [], example: [],
          guidance: 'Encounters linked to this page, carried through for the encounter toolbar.' }
    ]
};

registerDeclaration(JOURNAL_AREA_DECLARATION);
registerDeclaration(JOURNAL_LOCATION_DECLARATION);
