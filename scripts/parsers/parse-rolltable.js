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
            const weight = result.resultWeight || 1;
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
                tableResult.documentCollection = result.resultDocumentType.charAt(0).toUpperCase() + result.resultDocumentType.slice(1);
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
