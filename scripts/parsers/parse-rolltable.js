// ==================================================================
// Flat roll table JSON → Foundry RollTable documents
// ==================================================================

import { MODULE } from '../const.js';
import { postConsoleAndNotification } from '../api-core.js';

/**
 * Convert flat roll table JSON into Foundry RollTable create data.
 * @param {object} flat
 * @returns {Promise<object>}
 */
export async function parseTableToFoundry(flat) {
    const data = {
        name: flat.tableName || 'Imported Table',
        description: flat.tableDescription || '',
        img: flat.tableImagePath || '',
        formula: '1d1',
        replacement: flat.drawWithReplacement !== false,
        displayRoll: flat.displayRollFormula === true,
        results: []
    };

    if (flat.results && Array.isArray(flat.results)) {
        let currentRange = 1;
        let maxRange = 0;

        for (const result of flat.results) {
            const weight = result.resultWeight ?? 1;
            if (!Number.isInteger(weight) || weight < 1) {
                throw new Error(`Invalid result weight for "${result.resultText || 'unnamed result'}": expected a positive whole number.`);
            }
            let rangeLower;
            let rangeUpper;

            if (result.resultRangeLower !== undefined && result.resultRangeUpper !== undefined) {
                rangeLower = result.resultRangeLower;
                rangeUpper = result.resultRangeUpper;
                currentRange = rangeUpper + 1;
            } else if (result.resultRangeLower !== undefined) {
                rangeLower = result.resultRangeLower;
                rangeUpper = rangeLower + weight - 1;
                currentRange = rangeUpper + 1;
            } else {
                rangeLower = currentRange;
                rangeUpper = currentRange + weight - 1;
                currentRange = rangeUpper + 1;
            }

            if (rangeLower > rangeUpper) {
                throw new Error(`Invalid range: lower bound (${rangeLower}) is greater than upper bound (${rangeUpper})`);
            }
            if (!Number.isInteger(rangeLower) || !Number.isInteger(rangeUpper) || rangeLower < 1) {
                throw new Error(`Invalid range for "${result.resultText || 'unnamed result'}": bounds must be positive whole numbers.`);
            }
            const overlaps = data.results.some(existing => rangeLower <= existing.range[1] && rangeUpper >= existing.range[0]);
            if (overlaps) {
                throw new Error(`Overlapping range for "${result.resultText || 'unnamed result'}": ${rangeLower}-${rangeUpper}.`);
            }

            if (rangeUpper > maxRange) {
                maxRange = rangeUpper;
            }

            let foundryType = (result.resultType || 'text').toLowerCase();
            if (foundryType === 'compendium') {
                foundryType = 'pack';
            }

            const tableResult = {
                type: foundryType,
                text: result.resultText || '',
                img: result.resultImagePath || '',
                weight,
                range: [rangeLower, rangeUpper],
                drawn: false
            };

            if (tableResult.type === 'document' && result.resultDocumentType) {
                const { collection, documentName } = getWorldCollection(result.resultDocumentType);
                tableResult.documentCollection = documentName;
                const entry = collection?.find?.(document => document.name.toLowerCase() === tableResult.text.toLowerCase());
                if (entry) {
                    tableResult.documentId = entry.id;
                } else {
                    postConsoleAndNotification(
                        MODULE.NAME,
                        'Table Import: World document not found',
                        `${result.resultText} not found in ${result.resultDocumentType}`,
                        false,
                        false
                    );
                }
            }

            if (tableResult.type === 'pack' && result.resultCompendium && result.resultText) {
                tableResult.documentCollection = result.resultCompendium;

                try {
                    const pack = game.packs.get(result.resultCompendium);
                    if (pack) {
                        const index = await pack.getIndex();
                        const entry = index.find(e => e.name.toLowerCase() === result.resultText.toLowerCase());
                        if (entry) {
                            tableResult.documentId = entry._id;
                        } else {
                            postConsoleAndNotification(
                                MODULE.NAME,
                                'Table Import: Item not found in compendium',
                                `${result.resultText} not found in ${result.resultCompendium}`,
                                false,
                                false
                            );
                        }
                    } else {
                        postConsoleAndNotification(
                            MODULE.NAME,
                            'Table Import: Compendium pack not found',
                            result.resultCompendium,
                            false,
                            false
                        );
                    }
                } catch (error) {
                    postConsoleAndNotification(
                        MODULE.NAME,
                        'Table Import: Error looking up compendium item',
                        `${result.resultCompendium}: ${error.message}`,
                        false,
                        false
                    );
                }
            }

            data.results.push(tableResult);
        }

        data.formula = `1d${Math.max(1, maxRange)}`;
    }

    return data;
}

function getWorldCollection(documentType) {
    const type = String(documentType ?? '').trim().toLowerCase();
    const collections = {
        actor: { documentName: 'Actor', collection: game.actors?.contents },
        adventure: { documentName: 'Adventure', collection: game.adventures?.contents },
        'card stack': { documentName: 'Cards', collection: game.cards?.contents },
        item: { documentName: 'Item', collection: game.items?.contents },
        'journal entry': { documentName: 'JournalEntry', collection: game.journal?.contents },
        macro: { documentName: 'Macro', collection: game.macros?.contents },
        playlist: { documentName: 'Playlist', collection: game.playlists?.contents },
        'rollable table': { documentName: 'RollTable', collection: game.tables?.contents },
        scene: { documentName: 'Scene', collection: game.scenes?.contents }
    };
    return collections[type] ?? { documentName: resultDocumentName(type), collection: [] };
}

function resultDocumentName(type) {
    return type.split(/\s+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
