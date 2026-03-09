/**
 * Loot utilities: roll loot tables, add random coins, add loot to actor.
 * Used when converting dead token to loot pile.
 */
import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-helpers.js';

export class LootUtilities {
    /**
     * Roll a loot table and add results to an actor's inventory
     * @param {string} tableName - Name of the RollTable
     * @param {number} timesToRoll - How many times to roll the table
     * @param {Actor} actor - The actor to add items to
     * @param {number} quantityMax - Max quantity per item
     */
    static async _rollLootTable(tableName, timesToRoll, actor, quantityMax = 1) {
        try {
            postConsoleAndNotification(MODULE.NAME, `Looking for loot table: "${tableName}"`, "", true, false);

            const table = game.tables.find(t => t.name === tableName);
            if (!table) {
                postConsoleAndNotification(MODULE.NAME, `Loot table "${tableName}" not found`, "", false, false);
                return;
            }

            postConsoleAndNotification(MODULE.NAME, `Found table "${tableName}", rolling ${timesToRoll} times`, "", true, false);

            for (let i = 0; i < timesToRoll; i++) {
                const roll = await table.draw({ displayChat: false });
                postConsoleAndNotification(MODULE.NAME, `Roll ${i+1} results:`, roll, true, false);

                if (!roll || !roll.results || roll.results.length === 0) {
                    continue;
                }

                for (const result of roll.results) {
                    const resultName = result.name || result.description || 'N/A';
                    postConsoleAndNotification(MODULE.NAME, `Processing result - type: ${result.type}, name: ${resultName}, documentCollection: ${result.documentCollection}`, "", true, false);

                    if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT || result.type === 'pack' || result.documentCollection) {
                        postConsoleAndNotification(MODULE.NAME, `This is a document/pack result`, "", true, false);

                        let item = null;
                        if (result.documentCollection && result.documentId) {
                            postConsoleAndNotification(MODULE.NAME, `Getting item from pack: ${result.documentCollection}, ID: ${result.documentId}`, "", true, false);
                            const pack = game.packs.get(result.documentCollection);
                            if (pack) {
                                item = await pack.getDocument(result.documentId);
                                postConsoleAndNotification(MODULE.NAME, `Retrieved item:`, item, true, false);
                            } else {
                                postConsoleAndNotification(MODULE.NAME, `Pack not found: ${result.documentCollection}`, "", false, false);
                            }
                        }

                        if (item) {
                            const itemData = item.toObject();
                            if (itemData.system?.quantity !== undefined) {
                                const maxQuantity = Math.max(1, Number(quantityMax) || 1);
                                const quantity = maxQuantity > 1
                                    ? Math.floor(Math.random() * maxQuantity) + 1
                                    : 1;
                                itemData.system.quantity = quantity;
                            }
                            await actor.createEmbeddedDocuments('Item', [itemData]);
                            postConsoleAndNotification(MODULE.NAME, `Added ${itemData.name} to ${actor.name}`, "", false, false);
                        } else {
                            postConsoleAndNotification(MODULE.NAME, `Could not retrieve item from result`, "", false, false);
                        }
                    } else if (result.type === CONST.TABLE_RESULT_TYPES.TEXT || result.type === 'text') {
                        const textName = result.name || result.description || 'N/A';
                        postConsoleAndNotification(MODULE.NAME, `Loot table text result: ${textName}`, "", true, false);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, `Unknown result type: ${result.type}`, "", true, false);
                    }
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Error rolling loot table ${tableName}:`, error, false, false);
        }
    }

    static async _addRandomCoins(actor) {
        if (!game.user.isGM) return;

        try {
            const currency = actor.system.currency;
            const maxCopper = Math.max(0, Number(getSettingSafely(MODULE.ID, 'tokenLootMaxCopperAmount', 0)) || 0);
            const maxSilver = Math.max(0, Number(getSettingSafely(MODULE.ID, 'tokenLootMaxSilverAmount', 0)) || 0);
            const maxGold = Math.max(0, Number(getSettingSafely(MODULE.ID, 'tokenLootMaxGoldAmount', 0)) || 0);
            const maxPlatinum = Math.max(0, Number(getSettingSafely(MODULE.ID, 'tokenLootMaxPlatinumAmount', 0)) || 0);
            const maxElectrum = Math.max(0, Number(getSettingSafely(MODULE.ID, 'tokenLootMaxElectrumAmount', 0)) || 0);

            const copperAmount = maxCopper > 0 ? Math.floor(Math.random() * maxCopper) + 1 : 0;
            const silverAmount = maxSilver > 0 ? Math.floor(Math.random() * maxSilver) + 1 : 0;
            const goldAmount = maxGold > 0 ? Math.floor(Math.random() * maxGold) + 1 : 0;
            const platinumAmount = maxPlatinum > 0 ? Math.floor(Math.random() * maxPlatinum) + 1 : 0;
            const electrumAmount = maxElectrum > 0 ? Math.floor(Math.random() * maxElectrum) + 1 : 0;

            await actor.update({
                "system.currency.cp": currency.cp + copperAmount,
                "system.currency.sp": currency.sp + silverAmount,
                "system.currency.gp": currency.gp + goldAmount,
                "system.currency.pp": currency.pp + platinumAmount,
                "system.currency.ep": (currency.ep || 0) + electrumAmount
            });

            postConsoleAndNotification(
                MODULE.NAME,
                "Added coins:",
                `CP: ${copperAmount}, SP: ${silverAmount}, EP: ${electrumAmount}, GP: ${goldAmount}, PP: ${platinumAmount}`,
                false,
                false,
                false
            );
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error adding coins:", error, true, false);
        }
    }

    /**
     * Add loot to an actor (roll configured tables, add coins, epic roll).
     * @param {Actor} actor - The actor to add loot to
     */
    static async addLootToActor(actor) {
        if (!actor || !game.user.isGM) return;

        const tables = [
            { setting: 'tokenLootTableTreasure', amount: 'tokenLootTableTreasureAmount', quantity: 'tokenLootTableTreasureQuantity' },
            { setting: 'tokenLootTableGear', amount: 'tokenLootTableGearAmount', quantity: 'tokenLootTableGearQuantity' },
            { setting: 'tokenLootTableGeneral', amount: 'tokenLootTableGeneralAmount', quantity: 'tokenLootTableGeneralQuantity' }
        ];

        for (const table of tables) {
            const tableName = game.settings.get(MODULE.ID, table.setting);
            if (tableName && tableName !== 'none' && !tableName.startsWith('--')) {
                const amount = game.settings.get(MODULE.ID, table.amount);
                const quantityMax = game.settings.get(MODULE.ID, table.quantity);
                if (amount > 0) {
                    await LootUtilities._rollLootTable(tableName, amount, actor, quantityMax);
                }
            }
        }

        const addCoins = getSettingSafely(MODULE.ID, 'tokenLootAddCoins', true);
        if (addCoins) await LootUtilities._addRandomCoins(actor);

        const epicTableName = getSettingSafely(MODULE.ID, 'tokenLootTableEpic', '');
        const epicOddsSetting = Number(getSettingSafely(MODULE.ID, 'tokenLootTableEpicOdds', 0)) || 0;
        if (epicTableName && epicTableName !== 'none' && !epicTableName.startsWith('--') && epicOddsSetting > 0) {
            const epicRoll = Math.floor(Math.random() * 1000) + 1;
            if (epicRoll <= Math.min(epicOddsSetting, 1000)) {
                await LootUtilities._rollLootTable(epicTableName, 1, actor, 1);
            }
        }
    }
}
