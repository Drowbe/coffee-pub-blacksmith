// ==================================================================
// ===== ACTOR PARSING - envelope consumption and post-create ========
// ==================================================================
// The Actor payload IS dnd5e Actor source data. What lives here is what an
// author writes AROUND it -- a sidekick block, a character's plain-name
// foundations, a friendly `token` -- and the work of folding those into the
// document before it is created.
//
// It deliberately does NOT validate the envelope's shape. The declaration in
// `declarations/declaration-actor.js` owns that: which sidekick roles exist,
// what a level may be, which spellcasting abilities are allowed. This file is
// reached only after that has passed, and re-checking it here is precisely the
// two-readers defect the declaration model exists to end.
//
// Moved out of `blacksmith.js` when Actor was declared; the god module had held
// it beside the roll pipeline for no reason other than history.
// ==================================================================

import { compendiumManager } from '../manager-compendiums.js';

/**
 * Fold a sidekick block into the Actor it describes.
 *
 * A sidekick is a SNAPSHOT NPC, not a new Actor type. The metadata is preserved
 * at the module's flag namespace and the Actor stays a plain dnd5e npc, which is
 * what keeps every sheet, every module and every export working on it. Nothing
 * about progression is calculated: the payload's statistics are final.
 *
 * `system.traits.important` is set so dnd5e exposes NPC death saves at 0 HP --
 * the one mechanical consequence of being a sidekick.
 *
 * @param {object} data - Document source data, mutated.
 * @param {object} sidekick - The validated sidekick envelope.
 * @returns {object} The same data.
 */
export function consumeSidekick(data, sidekick) {
    data.flags = foundry.utils.mergeObject(data.flags || {}, {
        'coffee-pub-blacksmith': {
            sidekick: {
                schemaVersion: 1,
                role: String(sidekick.role || '').trim().toLowerCase(),
                level: Number(sidekick.level),
                baseCreature: String(sidekick.baseCreature || '').trim(),
                baseStatBlock: String(sidekick.baseStatBlock || '').trim(),
                spellcastingAbility: String(sidekick.spellcastingAbility || '').trim().toLowerCase()
            }
        }
    }, { inplace: false });
    data.system = foundry.utils.mergeObject(data.system || {}, {
        traits: { important: true }
    }, { inplace: false });
    return data;
}

/**
 * Fold a Character's race, background, classes and subclasses into its items.
 *
 * These four are authored as plain NAMES rather than as embedded documents,
 * because a name survives a pack being rebuilt and an embedded id does not. They
 * become ordinary entries in `items[]` here, and the ids dnd5e wants in
 * `system.details.race`, `.background` and `.originalClass` can only be written
 * AFTER the Actor exists and the items have been embedded -- so the association
 * is recorded and applied by `linkCharacterFoundations` post-create.
 *
 * An element may be a plain name or a complete inline native definition. That
 * union is why the declaration types these as arrays without a nested shape:
 * declaring one of the two forms would reject the other, and declaring neither
 * and checking here is honest about which reader owns it.
 *
 * @param {object} data - Document source data, mutated. `data.items` must exist.
 * @param {object} entry - The authored payload.
 * @returns {object[]} The foundations recorded, for the post-create link step.
 */
export function consumeCharacterFoundations(data, entry) {
    // A native Foundry export carries `_id` and `system` on every item, and its
    // race/background/class ids point INTO that export. Accepting it would mean
    // remapping every relationship id to the ones Foundry assigns on create, which
    // is a different feature; refusing it plainly beats importing a character whose
    // race silently points at nothing.
    const nativeExportItems = data.items.filter(item => item && typeof item === 'object' && item._id && item.system);
    const hasFriendlyFoundations = entry.characterRace !== undefined
        || entry.characterBackground !== undefined
        || entry.characterClasses !== undefined
        || entry.characterSubclasses !== undefined;
    if (nativeExportItems.length && !hasFriendlyFoundations) {
        throw new Error('Native Character exports require relationship-ID remapping and are not accepted by Character Snapshot yet. Use the friendly Character template with plain-name foundations.');
    }

    const foundations = [];
    const addFoundation = (value, expectedType, field) => {
        if (value == null || value === '') return;
        // "Auto" is what a generator writes when it was asked for a name and had
        // none. Importing it produces an item called Auto that resolves to nothing.
        if (typeof value === 'string' && value.trim().toLowerCase() === 'auto') {
            throw new Error(`${field} must contain the generated exact name, not "Auto"`);
        }
        if (typeof value !== 'string' && (typeof value !== 'object' || Array.isArray(value))) {
            throw new Error(`${field} must be an exact Item name or an inline native Item definition`);
        }
        const name = typeof value === 'string' ? value.trim() : String(value.name || '').trim();
        if (!name) throw new Error(`${field} entries require a name`);
        if (expectedType === 'class' && typeof value === 'object' && !value.system) {
            const levels = Number(value.levels);
            if (!Number.isInteger(levels) || levels < 1 || levels > 20) {
                throw new Error('Friendly characterClasses entries require integer levels from 1 through 20');
            }
        }
        const foundation = typeof value === 'string'
            ? { name, type: expectedType }
            : { ...value, type: value.type || expectedType };
        const alreadyIncluded = data.items.some(item => {
            const itemName = typeof item === 'string' ? item : item?.name;
            const itemType = typeof item === 'object' ? item?.type : null;
            return String(itemName || '').trim().toLowerCase() === name.toLowerCase()
                && (!itemType || itemType === expectedType);
        });
        if (!alreadyIncluded) data.items.push(foundation);
        foundations.push({ field, expectedType, name });
    };

    addFoundation(entry.characterRace, 'race', 'characterRace');
    addFoundation(entry.characterBackground, 'background', 'characterBackground');
    (entry.characterClasses ?? []).forEach(value => addFoundation(value, 'class', 'characterClasses'));
    (entry.characterSubclasses ?? []).forEach(value => addFoundation(value, 'subclass', 'characterSubclasses'));
    return foundations;
}

/**
 * Merge the friendly `token` block forward onto `prototypeToken`.
 *
 * The friendly Actor schema has always called this `token`, while Foundry v13
 * persists Actor defaults as `prototypeToken`. An explicit `prototypeToken` in
 * the payload wins, so a native export is never overwritten by the friendly key.
 * @param {object} data - Document source data, mutated.
 * @param {object} token - The authored token envelope.
 * @returns {object} The same data.
 */
export function consumeToken(data, token) {
    data.prototypeToken = foundry.utils.mergeObject(token, data.prototypeToken || {}, { inplace: false });
    return data;
}

/**
 * The defaults every imported Actor gets: GM-only ownership, the root folder,
 * and a prototype token with artwork.
 * @param {object} data - Document source data, mutated.
 * @returns {object} The same data.
 */
export function applyActorDefaults(data) {
    if (!data.prototypeToken) data.prototypeToken = {};
    if (!data.ownership) data.ownership = { default: 0 };
    data.folder = null;
    if (!data.prototypeToken.texture) {
        data.prototypeToken.texture = { src: 'icons/svg/mystery-man.svg', scaleX: 1, scaleY: 1 };
    } else if (!data.prototypeToken.texture.src) {
        data.prototypeToken.texture.src = 'icons/svg/mystery-man.svg';
    }
    return data;
}

/**
 * Resolve the payload's named items, spells and features against the configured
 * compendiums.
 * @param {object} data - Document source data.
 * @returns {Promise<object>} The processed data, which may be a new object.
 */
export async function resolveActorContent(data) {
    return await compendiumManager.processCharacterData(data);
}

/**
 * Write the Actor-local ids of an imported Character's foundations into the
 * dnd5e relationship fields, after the items have been embedded.
 *
 * This is the only post-create work any import kind does, and the reason Actor
 * is the only kind that rolls back: the Actor exists and is wrong if this fails.
 *
 * @param {Actor} actor - The created Actor.
 * @param {object[]} foundations - From `consumeCharacterFoundations`.
 * @param {object[]} embedded - The embedded Items, from `addItemsToActor`.
 * @returns {Promise<void>}
 * @throws {Error} When a foundation cannot be matched to an embedded Item.
 */
export async function linkCharacterFoundations(actor, foundations, embedded) {
    const findFoundation = (foundation) => embedded.find(item => item.type === foundation.expectedType
        && item.name.trim().toLowerCase() === foundation.name.toLowerCase());
    const updates = {};
    const race = foundations.find(foundation => foundation.field === 'characterRace');
    const background = foundations.find(foundation => foundation.field === 'characterBackground');
    const originalClass = foundations.find(foundation => foundation.field === 'characterClasses');
    if (race) updates['system.details.race'] = findFoundation(race)?.id || null;
    if (background) updates['system.details.background'] = findFoundation(background)?.id || null;
    if (originalClass) updates['system.details.originalClass'] = findFoundation(originalClass)?.id || null;

    const missing = Object.entries(updates).filter(([, value]) => !value).map(([path]) => path.split('.').pop());
    if (missing.length) throw new Error(`Could not link Character foundation documents: ${missing.join(', ')}`);
    if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Warnings about a sidekick snapshot that are true but not fatal.
 *
 * Everything here compares the payload against something OUTSIDE it -- the
 * level-to-proficiency table, the size-to-hit-die table, the base stat block in
 * a compendium. None of it is expressible as a declaration rule, which is about
 * fields within one entry, and none of it should block an import: a deliberate
 * variant is a legitimate thing to author.
 *
 * @param {object} actorData - Assembled Actor source data.
 * @returns {Promise<string[]>}
 */
export async function validateSidekickSnapshot(actorData) {
    const warnings = [];
    const sidekick = actorData.flags?.['coffee-pub-blacksmith']?.sidekick;
    if (!sidekick) return warnings;

    const expectedProficiency = sidekick.level >= 17 ? 6 : sidekick.level >= 13 ? 5 : sidekick.level >= 9 ? 4 : sidekick.level >= 5 ? 3 : 2;
    const proficiency = Number(actorData.system?.attributes?.proficiency);
    if (Number.isFinite(proficiency) && proficiency !== expectedProficiency) {
        warnings.push(`Sidekick level ${sidekick.level} normally uses proficiency +${expectedProficiency}, but the snapshot supplies +${proficiency}.`);
    }

    const sheetSpellcastingAbility = String(actorData.system?.attributes?.spellcasting || '').trim().toLowerCase();
    if (sidekick.role === 'spellcaster') {
        if (!sidekick.spellcastingAbility) {
            warnings.push('Spellcaster Sidekick metadata requires spellcastingAbility set to int, wis, or cha.');
        } else if (sheetSpellcastingAbility !== sidekick.spellcastingAbility) {
            warnings.push(`Spellcaster Sidekick uses ${sidekick.spellcastingAbility} in metadata, but system.attributes.spellcasting is "${sheetSpellcastingAbility || '(blank)'}".`);
        }
    }

    const hitDiceBySize = { tiny: 4, sm: 6, med: 8, lg: 10, huge: 12, grg: 20 };
    const size = String(actorData.system?.traits?.size || '').toLowerCase();
    const formula = String(actorData.system?.attributes?.hp?.formula || '');
    const dieMatch = formula.match(/d(4|6|8|10|12|20)\b/i);
    if (hitDiceBySize[size] && dieMatch && Number(dieMatch[1]) !== hitDiceBySize[size]) {
        warnings.push(`Sidekick size ${size} uses d${hitDiceBySize[size]} Hit Dice, but HP formula "${formula}" uses d${dieMatch[1]}. Final HP was preserved.`);
    }

    if (sidekick.baseStatBlock) {
        const baseActor = await compendiumManager.resolveDocument(sidekick.baseStatBlock, 'Actor', { exact: true });
        if (!baseActor) {
            warnings.push(`No exact Actor named "${sidekick.baseStatBlock}" was found for sidekick.baseStatBlock.`);
        } else {
            const suppliedCR = Number(actorData.system?.details?.cr);
            const baseCR = Number(baseActor.system?.details?.cr);
            if (Number.isFinite(suppliedCR) && Number.isFinite(baseCR) && suppliedCR !== baseCR) {
                warnings.push(`Sidekick CR ${suppliedCR} differs from base stat block ${sidekick.baseStatBlock} CR ${baseCR}; sidekick CR should remain the unscaled base value.`);
            }
            const suppliedXP = Number(actorData.system?.details?.xp?.value);
            const baseXP = Number(baseActor.system?.details?.xp?.value);
            if (Number.isFinite(suppliedXP) && Number.isFinite(baseXP) && suppliedXP !== baseXP) {
                warnings.push(`Sidekick XP ${suppliedXP} differs from base stat block ${sidekick.baseStatBlock} XP ${baseXP}; sidekick XP should remain the unscaled base value.`);
            }
        }
    }
    return warnings;
}
