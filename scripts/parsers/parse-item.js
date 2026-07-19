// ==================================================================
// Flat item JSON → Foundry D&D 5e item documents
// ==================================================================

import { MODULE } from '../const.js';
import { GMNotesManager } from '../manager-gmnotes.js';

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
    if (itemPrice == null || String(itemPrice).trim() === '') return { value: 0, denomination: 'gp' };
    const s = String(itemPrice).trim();
    const match = s.match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp|ep|pp)?$/i);
    if (match) {
        return {
            value: Number(match[1]),
            denomination: (match[2] || 'gp').toLowerCase()
        };
    }
    throw new Error(`Unsupported itemPrice "${itemPrice}"; use a value such as "50 GP"`);
}

function _physicalItemProperties(flat) {
    return flat.itemIsMagical ? ['mgc'] : [];
}

function _attunementValue(value) {
    const token = String(value || '').trim().toLowerCase();
    if (!token || ['none', 'not required', 'attunement not required'].includes(token)) return '';
    if (['required', 'attunement required'].includes(token)) return 'required';
    if (['optional', 'attunement optional'].includes(token)) return 'optional';
    throw new Error(`Unsupported magicalAttunementRequired "${value}"`);
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

const RECOVERY_PERIODS = {
    'long rest': 'lr',
    'short rest': 'sr',
    day: 'day',
    dawn: 'dawn',
    dusk: 'dusk',
    initiative: 'initiative',
    'start of turn': 'turnStart',
    'end of turn': 'turnEnd',
    recharge: 'recharge'
};

const FRIENDLY_ACTIVITY_TYPES = new Set(['attack', 'damage', 'heal', 'save', 'utility']);
const SPELL_SCHOOLS = new Set(['abj', 'con', 'div', 'enc', 'evo', 'ill', 'nec', 'trs']);
const FEATURE_TYPES = new Set(['background', 'class', 'monster', 'race', 'enchantment', 'feat', 'supernaturalGift', 'vehicle']);

function _identifier(value) {
    return String(value || 'imported-item')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'imported-item';
}

function _recovery(value, formula = '') {
    const token = String(value || '').trim().toLowerCase();
    if (!token || token === 'none') return [];
    const period = RECOVERY_PERIODS[token];
    if (!period) throw new Error(`Unsupported recoveryPeriod "${value}"`);
    return [{ period, type: 'recoverAll', formula: period === 'recharge' ? String(formula || '6') : '' }];
}

function _uses(max, spent = 0, recoveryPeriod = 'none', recoveryFormula = '') {
    return {
        spent: Number.isFinite(Number(spent)) ? Number(spent) : 0,
        max: max == null || max === '' ? '' : String(max),
        recovery: _recovery(recoveryPeriod, recoveryFormula)
    };
}

function _damagePart(formula, damageType) {
    const raw = String(formula || '').trim();
    const type = String(damageType || '').trim().toLowerCase();
    const simple = raw.match(/^(\d+)d(\d+)(?:\s*([+-])\s*(.+))?$/i);
    if (simple) {
        return {
            number: Number(simple[1]),
            denomination: Number(simple[2]),
            bonus: simple[3] ? `${simple[3]}${simple[4]}` : '',
            types: type ? [type] : [],
            custom: { enabled: false, formula: '' },
            scaling: { mode: '', number: 1, formula: '' }
        };
    }
    return {
        number: null,
        denomination: null,
        bonus: '',
        types: type ? [type] : [],
        custom: { enabled: true, formula: raw },
        scaling: { mode: '', number: 1, formula: '' }
    };
}

function _activityBase(activity, index, parentType, parentHasUses) {
    const type = String(activity.activityType || 'utility').trim().toLowerCase();
    if (type === 'use') {
        throw new Error(`Activity ${index + 1}: "Use" is not a dnd5e activity type; use "Utility"`);
    }
    if (!FRIENDLY_ACTIVITY_TYPES.has(type)) {
        throw new Error(`Activity ${index + 1}: unsupported activityType "${activity.activityType}"`);
    }
    const id = foundry.utils.randomID();
    const hasActivityUses = activity.activityUsesMax != null && activity.activityUsesMax !== '';
    const consumptionTargets = hasActivityUses
        ? [{ type: 'activityUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]
        : (parentHasUses ? [{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }] : []);
    const duration = activity.activityDuration || {};
    const range = activity.activityRange || {};
    const target = activity.activityTarget || {};
    const hasDuration = activity.activityDuration && typeof activity.activityDuration === 'object';
    const hasRange = activity.activityRange && typeof activity.activityRange === 'object';
    const hasTarget = activity.activityTarget && typeof activity.activityTarget === 'object';
    for (const key of ['choice', 'contiguous', 'prompt']) {
        if (hasTarget && key in target && typeof target[key] !== 'boolean') {
            throw new Error(`Activity ${index + 1}: activityTarget.${key} must be a boolean`);
        }
    }
    return {
        _id: id,
        type,
        name: activity.activityName || activity.activityType || 'Use',
        img: activity.activityIcon || undefined,
        activation: {
            type: activity.activationType || (parentType === 'spell' ? 'action' : 'special'),
            value: activity.activationValue ?? null,
            condition: activity.activationCondition || '',
            override: false
        },
        consumption: {
            scaling: { allowed: false, max: '' },
            spellSlot: parentType === 'spell',
            targets: consumptionTargets
        },
        description: { chatFlavor: activity.activityFlavorText || '' },
        duration: {
            value: duration.value ?? '', units: duration.units || 'inst', special: duration.special || '',
            concentration: !!duration.concentration, override: !!hasDuration
        },
        effects: [],
        range: {
            value: range.value ?? '', units: range.units || 'self', special: range.special || '',
            override: !!hasRange
        },
        target: {
            template: {
                count: target.templateCount ?? '', contiguous: !!target.contiguous,
                type: target.templateType || '', size: target.templateSize ?? '',
                width: target.templateWidth ?? '', height: target.templateHeight ?? '', units: target.units || 'ft'
            },
            affects: {
                count: target.affectsCount ?? '', type: target.affectsType || '',
                choice: !!target.choice, special: target.special || ''
            },
            override: !!hasTarget,
            prompt: !!target.templateType && target.prompt !== false
        },
        uses: _uses(
            activity.activityUsesMax,
            activity.activityUsesSpent,
            activity.activityRecoveryPeriod,
            activity.activityRecoveryFormula
        )
    };
}

function _buildAppliedEffects(activity, activityIndex, effectDocuments, defaultImg) {
    if (activity.appliedEffects == null) return [];
    if (!Array.isArray(activity.appliedEffects)) {
        throw new Error(`Activity ${activityIndex + 1}: appliedEffects must be an array`);
    }
    return activity.appliedEffects.map((effect, effectIndex) => {
        if (!effect || typeof effect !== 'object' || !String(effect.name || '').trim()) {
            throw new Error(`Activity ${activityIndex + 1}, effect ${effectIndex + 1}: name is required`);
        }
        const id = foundry.utils.randomID();
        effectDocuments.push({
            _id: id,
            name: effect.name,
            img: effect.img || activity.activityIcon || defaultImg || 'icons/svg/aura.svg',
            description: effect.description || '',
            disabled: false,
            duration: {
                seconds: effect.durationSeconds ?? null,
                rounds: effect.durationRounds ?? null,
                turns: effect.durationTurns ?? null,
                startTime: null,
                startRound: null,
                startTurn: null
            },
            changes: Array.isArray(effect.changes) ? effect.changes : [],
            statuses: Array.isArray(effect.statuses) ? effect.statuses : [],
            transfer: false,
            flags: effect.flags && typeof effect.flags === 'object' ? effect.flags : {}
        });
        return { _id: id, onSave: !!effect.onSave };
    });
}

function _buildActivities(activities, parentType, parentHasUses = false, effectDocuments = [], defaultImg = '') {
    if (activities == null) return {};
    if (!Array.isArray(activities)) throw new Error('activities must be an array');
    const result = {};
    activities.forEach((activity, index) => {
        if (!activity || typeof activity !== 'object') throw new Error(`Activity ${index + 1} must be an object`);
        const data = _activityBase(activity, index, parentType, parentHasUses);
        data.effects = _buildAppliedEffects(activity, index, effectDocuments, defaultImg);
        const damageFormula = activity.damageFormula ?? activity.activityFormula ?? '';
        const damageType = activity.damageType ?? activity.activityEffectType ?? '';
        if (data.type === 'attack') {
            data.attack = {
                ability: activity.attackAbility || (parentType === 'spell' ? 'spellcasting' : ''),
                bonus: activity.attackBonus || '',
                critical: { threshold: null },
                flat: false,
                type: { value: activity.attackType || 'melee', classification: parentType === 'spell' ? 'spell' : 'weapon' }
            };
            data.damage = { critical: { bonus: '' }, includeBase: false, parts: damageFormula ? [_damagePart(damageFormula, damageType)] : [] };
        } else if (data.type === 'damage') {
            data.damage = { critical: { allow: false, bonus: '' }, parts: damageFormula ? [_damagePart(damageFormula, damageType)] : [] };
        } else if (data.type === 'heal') {
            const formula = activity.healingFormula ?? activity.activityFormula ?? '';
            data.healing = _damagePart(formula, activity.healingType ?? activity.activityEffectType ?? 'healing');
        } else if (data.type === 'save') {
            if (!activity.saveAbility) throw new Error(`Activity ${index + 1}: Save requires saveAbility`);
            const fixedDC = activity.saveDC != null && activity.saveDC !== '';
            data.damage = { onSave: activity.onSave || 'half', parts: damageFormula ? [_damagePart(damageFormula, damageType)] : [] };
            data.save = {
                ability: [String(activity.saveAbility).toLowerCase()],
                dc: { calculation: fixedDC ? '' : (parentType === 'spell' ? 'spellcasting' : 'initial'), formula: fixedDC ? String(activity.saveDC) : '' }
            };
        } else if (data.type === 'utility') {
            data.roll = { formula: activity.rollFormula || '', name: activity.rollName || '', prompt: false, visible: !!activity.rollFormula };
        }
        result[data._id] = data;
    });
    return result;
}

function _descriptionSystem(flat) {
    return {
        description: { value: flat.itemDescription || '', chat: flat.itemDescriptionChat || '' },
        identifier: _identifier(flat.itemName),
        source: { custom: flat.itemSource || 'Blacksmith Import', license: flat.itemLicense || '' }
    };
}

function _featureData(flat, img) {
    if (!flat.itemName?.trim()) throw new Error('Feature itemName is required');
    const type = String(flat.featureType || 'monster');
    if (!FEATURE_TYPES.has(type)) throw new Error(`Unsupported featureType "${flat.featureType}"`);
    const featureUsesMax = flat.featureUsesMax ?? flat.usesMax;
    const hasUses = featureUsesMax != null && featureUsesMax !== '';
    const effects = Array.isArray(flat.effects) ? foundry.utils.deepClone(flat.effects) : [];
    const activities = _buildActivities(flat.activities, 'feat', hasUses, effects, img);
    return {
        type: 'feat',
        name: flat.itemName,
        img,
        system: {
            ..._descriptionSystem(flat),
            activities,
            uses: _uses(
                featureUsesMax,
                flat.featureUsesSpent ?? flat.usesSpent,
                flat.featureRecoveryPeriod ?? flat.recoveryPeriod,
                flat.featureRecoveryFormula
            ),
            advancement: [],
            cover: null,
            crewed: false,
            enchant: { max: '', period: '' },
            prerequisites: { items: [], level: null, repeatable: false },
            properties: Array.isArray(flat.featureProperties) ? flat.featureProperties : [],
            requirements: flat.featureRequirements || null,
            type: { value: type, subtype: flat.featureSubtype || '' }
        },
        effects,
        flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
    };
}

function _spellData(flat, img) {
    if (!flat.itemName?.trim()) throw new Error('Spell itemName is required');
    const level = Number(flat.spellLevel);
    if (!Number.isInteger(level) || level < 0 || level > 9) throw new Error('spellLevel must be an integer from 0 through 9');
    const school = String(flat.spellSchool || '').toLowerCase();
    if (!SPELL_SCHOOLS.has(school)) throw new Error(`Unsupported spellSchool "${flat.spellSchool}"`);
    const preparation = { unprepared: 0, prepared: 1, always: 2 }[String(flat.spellPreparation || 'prepared').toLowerCase()];
    if (preparation == null) throw new Error(`Unsupported spellPreparation "${flat.spellPreparation}"`);
    const casting = flat.castingTime || {};
    const range = flat.spellRange || {};
    const duration = flat.spellDuration || {};
    const target = flat.spellTarget || {};
    const hasUses = flat.usesMax != null && flat.usesMax !== '';
    const effects = Array.isArray(flat.effects) ? foundry.utils.deepClone(flat.effects) : [];
    const activities = _buildActivities(flat.activities, 'spell', hasUses, effects, img);
    return {
        type: 'spell',
        name: flat.itemName,
        img,
        system: {
            ..._descriptionSystem(flat),
            activities,
            uses: _uses(flat.usesMax, flat.usesSpent, flat.recoveryPeriod),
            ability: flat.spellAbility || '',
            activation: { type: casting.units || 'action', value: casting.value ?? 1, condition: casting.condition || '' },
            duration: { value: duration.value ?? '', units: duration.units || 'inst', special: duration.special || '' },
            level,
            materials: {
                value: flat.materialDescription || '',
                consumed: !!flat.materialConsumed,
                cost: Number(flat.materialCost) || 0,
                supply: 0
            },
            method: '',
            prepared: preparation,
            properties: Array.isArray(flat.spellProperties) ? flat.spellProperties : [],
            range: { value: range.value ?? '', units: range.units || 'self', special: range.special || '' },
            school,
            sourceClass: flat.spellSourceClass || '',
            target: {
                template: {
                    count: target.templateCount ?? '', contiguous: !!target.contiguous,
                    type: target.templateType || '', size: target.templateSize ?? '', width: '', height: '', units: target.units || 'ft'
                },
                affects: { count: target.affectsCount ?? '', type: target.affectsType || '', choice: !!target.choice, special: target.special || '' }
            }
        },
        effects,
        flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
    };
}

/**
 * Whether an import entry is native Foundry Item data rather than Blacksmith's flat prompt shape.
 * A `system` object is the discriminator so lightweight actor references such as
 * `{ "name": "Fire Bolt", "type": "spell" }` remain references.
 * @param {object} entry
 * @returns {boolean}
 */
export function isNativeFoundryItemData(entry) {
    return !!entry
        && typeof entry === 'object'
        && typeof entry.name === 'string'
        && typeof entry.type === 'string'
        && entry.system != null
        && typeof entry.system === 'object'
        && !Array.isArray(entry.system);
}

/**
 * Prepare exported/native Item data for creation as a new world or embedded document.
 * Root document identity and placement fields cannot be reused; embedded data, effects,
 * activities, flags, and system-specific fields are deliberately preserved.
 * @param {object} entry
 * @returns {object}
 */
export function prepareNativeItemForCreation(entry) {
    const data = foundry.utils.deepClone(entry);
    delete data._id;
    delete data.folder;
    delete data.ownership;
    delete data._stats;
    delete data.pack;
    return data;
}

/**
 * Parse flat item JSON (import prompt template) into Foundry D&D 5e item data.
 * @param {object} flat
 * @returns {Promise<object>}
 */
export async function parseFlatItemToFoundry(flat) {
    if (isNativeFoundryItemData(flat)) {
        return prepareNativeItemForCreation(flat);
    }

    const type = (flat.itemType || 'loot').toLowerCase();
    let img = flat.itemImagePath;
    if (!img) {
        img = await guessIconPath(flat);
    }
    const shared = _sharedItemSystem(flat);
    let data = {};

    if (type === 'feature' || type === 'feat') {
        data = _featureData(flat, img);
    } else if (type === 'spell') {
        data = _spellData(flat, img);
    } else if (type === 'loot') {
        data = {
            type: 'loot',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: flat.itemSubType || 'trinket' },
                properties: _physicalItemProperties(flat)
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
    } else if (type === 'consumable') {
        const consumableValue = (flat.itemSubType || 'potion').toLowerCase().replace(/\s+/g, '-');
        const consumableSubtype = (flat.itemSubTypeNuance || '').trim();
        const itemRecoveryPeriod = flat.itemRecoveryPeriod ?? flat.recoveryPeriod;
        data = {
            type: 'consumable',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                consumableType: { value: consumableValue, subtype: consumableSubtype },
                type: { value: consumableValue, subtype: consumableSubtype },
                properties: _physicalItemProperties(flat),
                uses: {
                    ..._uses(flat.limitedUsesMax ?? flat.itemLimitedUses ?? 1, flat.limitedUsesSpent, itemRecoveryPeriod),
                    autoDestroy: !!flat.destroyOnEmpty
                },
                consume: { type: flat.destroyOnEmpty ? 'destroy' : 'none', target: null, amount: null },
                recharge: { value: itemRecoveryPeriod || 'none', formula: flat.recoveryAmount || 'recover all uses' }
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '', consumableSubtype } }
        };
        if (flat.itemIsMagical) {
            data.system.attunement = _attunementValue(flat.magicalAttunementRequired);
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
                properties: _physicalItemProperties(flat)
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
                properties: _physicalItemProperties(flat)
            },
            flags: { 'coffee-pub': { source: flat.itemSource, license: flat.itemLicense || '' } }
        };
        if (flat.itemIsMagical) {
            data.system.attunement = _attunementValue(flat.magicalAttunementRequired);
        }
    } else if (type === 'tool') {
        data = {
            type: 'tool',
            name: flat.itemName,
            img,
            system: {
                ...shared,
                type: { value: (flat.itemSubType || 'artisans-tools').toLowerCase().replace(/\s+/g, '-') },
                ability: { value: 'int', proficient: false },
                properties: _physicalItemProperties(flat)
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
                properties: _physicalItemProperties(flat)
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
                properties: _physicalItemProperties(flat)
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

    // Optional GM Notes → Blacksmith gmNotes flag (UI-gated, never required).
    const gmNotesHtml = typeof flat.itemGMNotes === 'string' ? flat.itemGMNotes
        : (typeof flat.gmNotes === 'string' ? flat.gmNotes : '');
    if (gmNotesHtml.trim()) {
        data.flags = data.flags || {};
        data.flags[MODULE.ID] = data.flags[MODULE.ID] || {};
        data.flags[MODULE.ID].gmNotes = GMNotesManager.buildEnvelope({ html: gmNotesHtml });
    }

    return data;
}
