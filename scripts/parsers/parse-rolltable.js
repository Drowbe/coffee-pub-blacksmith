// ==================================================================
// Flat roll table JSON → Foundry RollTable documents
// ==================================================================

import { compendiumManager } from '../manager-compendiums.js';

/**
 * Convert flat roll table JSON into Foundry RollTable create data.
 * @param {object} flat
 * @returns {Promise<object>}
 */
export async function parseTableToFoundry(flat) {
    const missingDocumentPolicy = String(flat.missingDocumentPolicy || 'error').trim().toLowerCase();
    if (!['error', 'text'].includes(missingDocumentPolicy)) {
        throw new Error('missingDocumentPolicy must be "error" or "text".');
    }
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

            const foundryType = String(result.resultType || 'text').trim().toLowerCase();
            if (!['text', 'document'].includes(foundryType)) {
                throw new Error(`Unsupported Roll Table result type "${result.resultType}". Foundry v13+ imports support only "text" and "document".`);
            }

            const tableResult = {
                type: foundryType,
                text: result.resultText || '',
                img: result.resultImagePath || '',
                weight,
                range: [rangeLower, rangeUpper],
                drawn: false
            };

            if (tableResult.type === 'document') {
                const documentType = String(result.resultDocumentType || '').trim();
                const documentSource = String(result.resultDocumentSource || '').trim();
                if (!documentType) throw new Error(`Document result "${tableResult.text || 'unnamed result'}" is missing resultDocumentType.`);
                if (!tableResult.text) throw new Error('Document results require a non-empty resultText name.');
                const resolved = await compendiumManager.resolve(tableResult.text, documentType, {
                    exact: true,
                    sources: documentSource ? [documentSource] : null
                });
                if (!resolved.found) {
                    if (missingDocumentPolicy === 'text') {
                        tableResult.type = 'text';
                    } else {
                        const scope = documentSource ? ` in source "${documentSource}"` : '';
                        throw new Error(`Could not resolve ${documentType} "${tableResult.text}"${scope}.`);
                    }
                } else {
                    tableResult.documentCollection = resolved.packId || resolved.documentClass;
                    tableResult.documentId = resolved.uuid.split('.').at(-1);
                }
            }

            data.results.push(tableResult);
        }

        data.formula = `1d${Math.max(1, maxRange)}`;
    }

    return data;
}
