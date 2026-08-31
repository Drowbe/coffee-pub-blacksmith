// ==================================================================
// ===== ROLL TABLE DECLARATIONS ====================================
// ==================================================================
// Blacksmith's two Roll Table profiles, declared as data.
//
// The profiles are RESULT TYPES rather than document types: both build a
// RollTable, and they differ in what a result carries. Foundry v13 supports
// only `text` and `document`, so those are the two.
//
// This file is DATA. Derivation lives in manager-declarations.js.
// ==================================================================

import { registerDeclaration } from '../registry-declarations.js';

/** The fields every result carries, whichever profile it belongs to. */
const SHARED_RESULT_FIELDS = [
    { name: 'resultText', type: 'string', required: true, example: '',
      guidance: 'What the result says. For a document result this is the exact document name.' },
    { name: 'resultImagePath', type: 'string', default: '', example: '',
      guidance: 'An icon for the row; blank uses the document or table default.' },
    { name: 'resultWeight', type: 'integer', default: 1, example: 1,
      guidance: 'How many numbers on the die this result occupies. A whole number of 1 or more.' },
    { name: 'resultRangeLower', type: 'integer', nullable: true, default: null, example: 1,
      guidance: 'The first number that rolls this result. Omit and Blacksmith numbers the rows in order.' },
    { name: 'resultRangeUpper', type: 'integer', nullable: true, default: null, example: 1,
      guidance: 'The last number that rolls this result. Omit and it follows from the weight.' }
];

/** Fields shared by both Roll Table profiles, in template order. */
function rollTableFields(resultFields, { resultTypeExample }) {
    return [
        { name: 'tableName', path: 'name', type: 'string', required: true, example: '',
          guidance: 'The table name as it appears in the sidebar.' },
        { name: 'tableDescription', path: 'description', type: 'string', default: '', example: '',
          guidance: 'What the table is for, shown on the table sheet.' },
        { name: 'tableImagePath', path: 'img', type: 'string', default: '', example: '',
          guidance: 'Artwork for the table itself.' },
        { name: 'drawWithReplacement', path: 'replacement', type: 'boolean', default: true, example: true,
          guidance: 'Whether a drawn result can be drawn again. False draws each result at most once.' },
        { name: 'displayRollFormula', path: 'displayRoll', type: 'boolean', default: false, example: false,
          guidance: 'Whether the die roll is shown to players when the table is rolled.' },
        // Read by the rollTableResults derivation, which needs every result together:
        // a row's range follows from the row before it, and the table's formula from
        // the highest range across all of them.
        { name: 'results', role: 'input', type: 'array',
          fields: [
              { name: 'resultType', type: 'string', required: true, example: resultTypeExample,
                values: ['text', 'document'],
                guidance: 'Whether the row is plain text or a link to an existing document.' },
              ...resultFields
          ],
          guidance: 'The rows of the table, in order.' },
        // The die is derived from the rows rather than authored: a formula that
        // disagrees with the ranges produces a table that cannot roll some of them.
        { name: 'formula', path: 'formula', const: '1d1',
          guidance: 'Derived from the rows; never authored.' }
    ];
}

/**
 * Text results: the rows say what they say, and nothing is resolved.
 */
export const ROLLTABLE_TEXT_DECLARATION = {
    kind: 'rolltable',
    id: 'text',
    label: 'Roll Table (Text)',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'RollTable' },
    derive: ['rollTableResults'],
    fields: rollTableFields(SHARED_RESULT_FIELDS, { resultTypeExample: 'text' })
};

/**
 * Document results: each row names an existing document by EXACT name, and
 * Blacksmith resolves it to a UUID during import.
 *
 * The author never supplies a UUID. That is the whole point of the friendly
 * schema -- a name survives a pack being rebuilt and a UUID does not -- and it
 * is why `missingDocumentPolicy` exists: a name that resolves to nothing is
 * either an error worth stopping for or a row that degrades to plain text, and
 * only the person importing knows which.
 */
export const ROLLTABLE_DOCUMENT_DECLARATION = {
    kind: 'rolltable',
    id: 'document',
    label: 'Roll Table (Document)',
    schemaVersion: 1,
    form: 'mapped',
    document: { documentName: 'RollTable' },
    derive: ['rollTableResults'],
    fields: [
        ...rollTableFields([
            ...SHARED_RESULT_FIELDS,
            { name: 'resultDocumentType', type: 'string', required: true, example: 'Actor',
              values: ['Actor', 'Item', 'JournalEntry', 'Scene', 'RollTable', 'Macro', 'Playlist'],
              guidance: 'Which kind of document the name refers to.' },
            { name: 'resultDocumentSource', type: 'string', default: '', example: '',
              guidance: 'A specific compendium to look in; blank searches the configured sources in priority order.' }
        ], { resultTypeExample: 'document' }),
        // An IMPORT option rather than content: it decides what happens when a
        // reference cannot be resolved, not what the table says. It is carried in
        // the payload today, which is where authored tables put it, so it stays
        // readable there until import options have a home in the window.
        { name: 'missingDocumentPolicy', role: 'input', type: 'string',
          default: 'error', example: 'error', values: ['error', 'text'],
          guidance: 'What to do when a document name resolves to nothing: error stops the import, text keeps the row as plain text.' }
    ]
};

registerDeclaration(ROLLTABLE_TEXT_DECLARATION);
registerDeclaration(ROLLTABLE_DOCUMENT_DECLARATION);
