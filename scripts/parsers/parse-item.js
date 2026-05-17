// ==================================================================
// Flat item JSON → Foundry D&D 5e item documents
// ==================================================================

import { MODULE } from '../const.js';

let iconPathsCache = null;

async function getIconPaths() {
    if (!game.user.isGM) {
        return [];
    }

    const now = Date.now();
    const CACHE_EXPIRATION = 5 * 60 * 1000;

    if (iconPathsCache && (now - iconPathsCache.timestamp) < CACHE_EXPIRATION) {
        return iconPathsCache.paths;
    }

    const paths = [];
    async function collect(dir) {
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        const result = await FilePicker.browse('public', dir);
        for (const file of result.files) {
            if (file.endsWith('.webp') || file.endsWith('.png') || file.endsWith('.jpg')) {
                paths.push(file);
            }
        }
        for (const subdir of result.dirs) {
            await collect(subdir);
        }
    }
    await collect('icons/');

    iconPathsCache = {
        paths,
        timestamp: now
    };

    return paths;
}

async function guessIconPath(item) {
    if (!game.user.isGM) {
        return '';
    }

    const paths = await getIconPaths();
    const name = (item.itemName || '').toLowerCase();
    const description = (item.itemDescription || '').toLowerCase();
    const lootType = (item.itemSubType || '').toLowerCase();

    const enhancedEnabled = game.settings.get(MODULE.ID, 'enableEnhancedImageGuessing');

    let synonymMapping = {};
    const basicMapping = {
        ring: ['commodities/treasure', 'commodities/gems', 'commodities/misc', 'sundries/misc'],
        key: ['tools/hand', 'commodities/metal', 'commodities/misc'],
        gem: ['commodities/gems', 'commodities/treasure'],
        book: ['sundries/books'],
        potion: ['consumables/potions'],
        scroll: ['sundries/scrolls'],
        mask: ['commodities/treasure', 'commodities/misc'],
        cube: ['commodities/treasure', 'commodities/misc']
    };

    if (enhancedEnabled) {
        try {
            const response = await fetch(`modules/${MODULE.ID}/resources/taxonomy.json`);
            synonymMapping = await response.json();
        } catch (error) {
            console.warn('BLACKSMITH | Item Import | Could not load taxonomy.json, falling back to basic mapping');
            synonymMapping = basicMapping;
        }
    } else {
        synonymMapping = basicMapping;
    }

    if (Array.isArray(item.itemImageTerms)) {
        for (const termRaw of item.itemImageTerms) {
            const term = (termRaw || '').toLowerCase().trim();
            if (!term) continue;
            if (synonymMapping[term]) {
                for (const folder of synonymMapping[term]) {
                    const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
                    if (folderImages.length > 0) {
                        return folderImages[Math.floor(Math.random() * folderImages.length)];
                    }
                }
            }
            for (const [synonym, folders] of Object.entries(synonymMapping)) {
                if (synonym.includes(term) || term.includes(synonym)) {
                    for (const folder of folders) {
                        const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
                        if (folderImages.length > 0) {
                            return folderImages[Math.floor(Math.random() * folderImages.length)];
                        }
                    }
                }
            }
        }
    }

    for (const [synonym, folders] of Object.entries(synonymMapping)) {
        const regex = new RegExp(`\\b${synonym}\\b`);
        if (regex.test(name)) {
            for (const folder of folders) {
                const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
                if (folderImages.length > 0) {
                    return folderImages[Math.floor(Math.random() * folderImages.length)];
                }
            }
        }
    }

    for (const [synonym, folders] of Object.entries(synonymMapping)) {
        if (name.includes(synonym)) {
            for (const folder of folders) {
                const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
                if (folderImages.length > 0) {
                    return folderImages[Math.floor(Math.random() * folderImages.length)];
                }
            }
        }
    }

    for (const [synonym, folders] of Object.entries(synonymMapping)) {
        const regex = new RegExp(`\\b${synonym}\\b`);
        if (regex.test(description)) {
            for (const folder of folders) {
                const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
                if (folderImages.length > 0) {
                    return folderImages[Math.floor(Math.random() * folderImages.length)];
                }
            }
        }
    }

    for (const [synonym, folders] of Object.entries(synonymMapping)) {
        if (description.includes(synonym)) {
            for (const folder of folders) {
                const folderImages = paths.filter(path => path.toLowerCase().includes(`/${folder}/`));
                if (folderImages.length > 0) {
                    return folderImages[Math.floor(Math.random() * folderImages.length)];
                }
            }
        }
    }

    if (lootType) {
        const lootTypeMatch = paths.find(path => path.toLowerCase().includes(`/${lootType}/`));
        if (lootTypeMatch) {
            return lootTypeMatch;
        }
    }

    for (const synonym of Object.keys(synonymMapping)) {
        const fileMatch = paths.find(path =>
            path.toLowerCase().match(new RegExp(`(^|/|_|-)${synonym}(-|_|\.|$)`, 'i'))
        );
        if (fileMatch) {
            return fileMatch;
        }
    }

    const fallbackFolders = ['commodities/treasure', 'commodities/misc', 'sundries/misc'];
    for (const folder of fallbackFolders) {
        const folderImages = paths.filter(path =>
            path.toLowerCase().includes(`/${folder}/`)
        );
        if (folderImages.length > 0) {
            return folderImages[Math.floor(Math.random() * folderImages.length)];
        }
    }

    return 'icons/commodities/treasure/mask-jeweled-gold.webp';
}

export async function getAvailableSynonyms() {
    try {
        const response = await fetch(`modules/${MODULE.ID}/resources/taxonomy.json`);
        const mapping = await response.json();
        return Object.keys(mapping).sort();
    } catch (error) {
        console.warn('BLACKSMITH | Item Import | Could not load synonym mapping for debugging');
        return [];
    }
}

export async function testImageGuessing(itemName, itemDescription = '') {
    return guessIconPath({
        itemName,
        itemDescription,
        itemSubType: 'treasure'
    });
}

function parseItemPrice(itemPrice) {
    if (itemPrice == null || String(itemPrice).trim() === '') return '0 gp';
    const s = String(itemPrice).trim();
    const match = s.match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp|ep|pp)?$/i);
    if (match) {
        const num = match[1];
        const denom = (match[2] || 'gp').toLowerCase();
        return `${num} ${denom}`;
    }
    return s;
}

function _sharedItemSystem(flat) {
    return {
        description: {
            value: flat.itemDescription || '',
            unidentified: flat.itemDescriptionUnidentified || '',
            chat: flat.itemDescriptionChat || ''
        },
        rarity: flat.itemRarity || 'common',
        weight: flat.itemWeight,
        price: parseItemPrice(flat.itemPrice),
        source: { custom: flat.itemSource || 'Artificer', license: flat.itemLicense || '' },
        quantity: flat.itemQuantity ?? 1,
        identified: flat.itemIdentified !== false
    };
}

/**
 * Parse flat item JSON (import prompt template) into Foundry D&D 5e item data.
 * @param {object} flat
 * @returns {Promise<object>}
 */
export async function parseFlatItemToFoundry(flat) {
    const type = (flat.itemType || 'loot').toLowerCase();
    let img = flat.itemImagePath;
    if (!img) {
        img = await guessIconPath(flat);
    }
    const shared = _sharedItemSystem(flat);
    let data = {};

    if (type === 'loot') {
        data = {
            type: 'loot',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: flat.itemSubType || 'trinket' },
                properties: { magical: !!flat.itemIsMagical }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
    } else if (type === 'consumable') {
        const consumableValue = (flat.itemSubType || 'potion').toLowerCase().replace(/\s+/g, '-');
        const consumableSubtype = (flat.itemSubTypeNuance || '').trim();
        data = {
            type: 'consumable',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                consumableType: { value: consumableValue, subtype: consumableSubtype },
                type: { value: consumableValue, subtype: consumableSubtype },
                properties: { mgc: !!flat.itemIsMagical },
                uses: {
                    spent: flat.limitedUsesSpent ?? 0,
                    max: flat.limitedUsesMax ?? flat.itemLimitedUses ?? 1,
                    recovery: flat.recoveryPeriod && String(flat.recoveryPeriod).toLowerCase() !== 'none'
                        ? [{ period: String(flat.recoveryPeriod).toLowerCase().replace(/\s+/g, '').replace('rest', ''), formula: String(flat.limitedUsesMax ?? flat.itemLimitedUses ?? 1) }]
                        : [],
                    autoDestroy: !!flat.destroyOnEmpty
                },
                consume: { type: flat.destroyOnEmpty ? 'destroy' : 'none', target: null, amount: null },
                recharge: { value: flat.recoveryPeriod || 'none', formula: flat.recoveryAmount || 'recover all uses' }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '', consumableSubtype } }
        };
        if (flat.itemIsMagical && flat.magicalAttunementRequired) {
            data.system.attunement = flat.magicalAttunementRequired;
        }
        if (flat.activities && Array.isArray(flat.activities)) {
            data.system.activities = {};
            flat.activities.forEach((activity, index) => {
                const activityId = `activity${index}`;
                data.system.activities[activityId] = {
                    type: (activity.activityType || 'util').toLowerCase(),
                    name: activity.activityName || activity.activityType || 'Use',
                    img: activity.activityIcon || '',
                    activation: { type: 'action', value: 1, condition: '' },
                    consumption: { targets: [], scaling: { allowed: false, max: '' } },
                    description: { chatFlavor: activity.activityFlavorText || '' },
                    duration: { value: '', units: '' },
                    range: {},
                    target: {},
                    uses: { spent: 0, max: '', recovery: [] },
                    ...(activity.activityType && activity.activityType.toLowerCase() === 'heal' ? {
                        healing: {
                            number: activity.activityEffectValue || 0,
                            denomination: activity.activityEffectDie ? activity.activityEffectDie.replace('d', '') : '',
                            bonus: activity.activityEffectBonus || 0,
                            types: activity.activityEffectType || 'healing'
                        }
                    } : {}),
                    ...(activity.activityType && activity.activityType.toLowerCase() === 'attack' ? {
                        damage: {
                            formula: activity.activityFormula || '',
                            parts: [[activity.activityFormula || '', activity.activityEffectType || 'damage']]
                        }
                    } : {})
                };
            });
        }
    } else if (type === 'container') {
        data = {
            type: 'container',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: flat.itemSubType || 'other' },
                properties: { magical: !!flat.itemIsMagical }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
    } else if (type === 'equipment') {
        data = {
            type: 'equipment',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: (flat.itemSubType || 'trinket').toLowerCase().replace(/\s+/g, '-') },
                properties: { magical: !!flat.itemIsMagical }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
        if (flat.itemIsMagical && flat.magicalAttunementRequired) {
            data.system.attunement = flat.magicalAttunementRequired;
        }
    } else if (type === 'tool') {
        data = {
            type: 'tool',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: (flat.itemSubType || 'artisans-tools').toLowerCase().replace(/\s+/g, '-') },
                ability: { value: 'int', proficient: false }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
    } else if (type === 'weapon') {
        data = {
            type: 'weapon',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: (flat.itemSubType || 'simpleM').toLowerCase().replace(/\s+/g, '-') },
                properties: { magical: !!flat.itemIsMagical }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
    }

    if (!data.name || !data.type) {
        data = {
            type: 'loot',
            name: flat.itemName || 'Imported Item',
            img: data.img || img,
            system: {
                ..._sharedItemSystem(flat),
                type: { value: flat.itemSubType || 'trinket' },
                properties: { magical: !!flat.itemIsMagical }
            },
            flags: data.flags || {}
        };
    }

    if (flat.flags && typeof flat.flags === 'object') {
        data.flags = data.flags || {};
        for (const [namespace, flagData] of Object.entries(flat.flags)) {
            if (namespace && flagData != null && typeof flagData === 'object') {
                data.flags[namespace] = foundry.utils.mergeObject(data.flags[namespace] || {}, flagData, { inplace: true });
            }
        }
    }
    return data;
}
