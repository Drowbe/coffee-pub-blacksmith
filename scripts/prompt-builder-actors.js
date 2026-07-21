// ==================================================================
// Actor import prompt composition and generation direction
// ==================================================================

import { fetchPromptText, applyCampaignPlaceholders } from './utility-json-import-prompts.js';
import { getConfiguredCompendiums } from './utility-json-import-compendium-lists.js';
import { queryImportCatalog, formatImportCatalog } from './utility-rolltable-import-lists.js';

const ACTOR_PROMPT_FILE = 'prompt-characters.txt';
const CHARACTER_PROMPT_FILE = 'prompt-character-snapshot.txt';
const ACTOR_AUTHORING_PROFILES = 'npc sidekick character';
const ACTOR_CATALOG_PREFIX = 'actorCatalogPack:';
const ACTOR_WORLD_PREFIX = 'actorCatalogWorld:';

function collectActorCatalogPackIds(options, kind) {
    const prefix = `${ACTOR_CATALOG_PREFIX}${kind}:`;
    return Object.keys(options ?? {}).filter(key => key.startsWith(prefix) && options[key]).map(key => key.slice(prefix.length));
}

export function getActorPromptCheckboxes() {
    const checkboxes = [];
    const sections = [
        ['Item', 'Character Building & Item Compendiums', 'fa-solid fa-boxes-stacked'],
        ['Feature', 'Feature Compendiums', 'fa-solid fa-sparkles'],
        ['Spell', 'Spell Compendiums', 'fa-solid fa-book-sparkles']
    ];
    for (const [kind, section, sectionIcon] of sections) {
        const packs = getConfiguredCompendiums(kind);
        if (!packs.length) {
            checkboxes.push({
                id: `${ACTOR_CATALOG_PREFIX}${kind}:__none`, label: `No ${kind.toLowerCase()} compendiums configured (see module settings).`,
                checked: false, disabled: true, isNote: true, authoringModes: 'prompt', showForTemplate: ACTOR_AUTHORING_PROFILES,
                section, sectionIcon
            });
        } else {
            for (const pack of packs) {
                checkboxes.push({
                    id: `${ACTOR_CATALOG_PREFIX}${kind}:${pack.id}`, label: pack.label, checked: true,
                    authoringModes: 'prompt', showForTemplate: ACTOR_AUTHORING_PROFILES, section, sectionIcon
                });
            }
        }
    }
    checkboxes.push(
        { id: `${ACTOR_WORLD_PREFIX}Item`, label: 'Include world character-building Items and equipment', checked: false, authoringModes: 'prompt', showForTemplate: ACTOR_AUTHORING_PROFILES, section: 'World Content', sectionIcon: 'fa-solid fa-globe', stacked: true },
        { id: `${ACTOR_WORLD_PREFIX}Feature`, label: 'Include world Features', checked: false, authoringModes: 'prompt', showForTemplate: ACTOR_AUTHORING_PROFILES, section: 'World Content', sectionIcon: 'fa-solid fa-globe', stacked: true },
        { id: `${ACTOR_WORLD_PREFIX}Spell`, label: 'Include world Spells', checked: false, authoringModes: 'prompt', showForTemplate: ACTOR_AUTHORING_PROFILES, section: 'World Content', sectionIcon: 'fa-solid fa-globe', stacked: true }
    );
    return checkboxes;
}

async function buildActorCatalogSections(options = {}, onProgress) {
    const definitions = [
        ['Item', 'AVAILABLE CHARACTER-BUILDING ITEMS AND EQUIPMENT'],
        ['Feature', 'AVAILABLE FEATURES'],
        ['Spell', 'AVAILABLE SPELLS']
    ];
    const sections = [];
    for (const [kind, heading] of definitions) {
        const packIds = collectActorCatalogPackIds(options, kind);
        const includeWorld = !!options[`${ACTOR_WORLD_PREFIX}${kind}`];
        const rows = [];
        if (packIds.length) rows.push(...await queryImportCatalog({ kind, source: 'compendium', packIds, onProgress }));
        if (includeWorld) rows.push(...await queryImportCatalog({ kind, source: 'world', onProgress }));
        const usableRows = kind === 'Item' ? rows.filter(row => !['feat', 'spell'].includes(row.itemType)) : rows;
        if (!usableRows.length) continue;
        const scope = kind === 'Item'
            ? 'This catalog contains only Item documents found in the selected sources. Race/species, background, class, and subclass names are verified only when those document types appear below.'
            : `A plain ${kind} name is verified only when it appears below.`;
        sections.push(`========================================\n${heading}\n========================================\n\nUse exact names from this selected catalog whenever referencing existing content. Catalog metadata is guidance only; emit plain names, never UUIDs. ${scope}\n\n${formatImportCatalog(usableRows, kind)}`);
    }
    return sections.join('\n\n');
}

const ACTOR_GENERATION_OPTIONS = {
    actorPurpose: {
        default: 'auto',
        values: {
            auto: 'Actor purpose: infer the most useful role from supplied context.',
            combat: 'Actor purpose: combatant. Prioritize a complete, runnable combat turn, sound defenses, and tactically distinct actions.',
            social: 'Actor purpose: social character. Prioritize motives, knowledge, leverage, personality, and useful noncombat capabilities without neglecting baseline defenses.',
            exploration: 'Actor purpose: exploration/support. Prioritize skills, senses, movement, tools, utility features, and environmental usefulness.',
            boss: 'Actor purpose: boss or major antagonist. Build a durable, multi-beat encounter presence with varied decisions; do not inflate numbers beyond the requested challenge.'
        }
    },
    rulesPosture: {
        default: 'balanced',
        values: {
            official: 'Rules posture: conservative. Prefer official rules, exact compendium references, and familiar mechanics; minimize homebrew.',
            balanced: 'Rules posture: balanced homebrew. Use standard dnd5e conventions and bounded numbers while allowing distinctive custom features.',
            experimental: 'Rules posture: experimental. Distinctive mechanics are welcome, but every mechanic must remain explicit, playable, and representable by the import schema or clearly identified as GM-adjudicated.'
        }
    },
    actorDetail: {
        default: 'standard',
        values: {
            concise: 'Detail level: concise. Keep biography, notes, equipment, and features lean while preserving everything needed to run the Actor.',
            standard: 'Detail level: standard. Provide a complete table-ready Actor without redundant lore or inventory padding.',
            detailed: 'Detail level: detailed. Add richer motivations, tactics, possessions, and hooks while keeping sheet content quickly scannable.'
        }
    },
    inventoryPolicy: {
        default: 'auto',
        values: {
            auto: 'Inventory: infer a lean role-appropriate carried kit; omit inventory only for creatures that cannot plausibly carry it.',
            complete: 'Inventory: include a complete but practical carried kit: primary gear, tools, supplies, and expected mundane necessities.',
            signature: 'Inventory: include signature and mechanically relevant gear only.',
            none: 'Inventory: omit carried items except mechanically inseparable natural equipment.'
        }
    },
    featurePolicy: {
        default: 'complete',
        values: {
            auto: 'Features: infer the useful custom and referenced features needed for the stated role.',
            complete: 'Features: include a complete runnable action suite, standard action references, and every signature capability needed at the table.',
            signature: 'Features: include standard action references plus signature capabilities only; avoid minor trait clutter.'
        }
    },
    spellcastingPolicy: {
        default: 'auto',
        values: {
            auto: 'Spellcasting: include only when supported by the concept and role.',
            include: 'Spellcasting: REQUIRED. Include a coherent, role-appropriate spell selection and the shared Ready action among standard action references.',
            omit: 'Spellcasting: omit spells and spellcasting features entirely.'
        }
    }
};

export function getActorPromptFields() {
    const hints = {
        actorPurpose: 'Sets what the generator optimizes for. Auto infers the role from your description; Combatant emphasizes runnable turns and defenses; Social emphasizes motives and interaction; Exploration / Support emphasizes skills, senses, movement, and utility; Boss creates a durable multi-beat encounter without ignoring bounded numbers.',
        rulesPosture: 'Controls how closely generated mechanics follow familiar rules. Conservative favors official names and established mechanics; Balanced Homebrew permits distinctive but conventional additions; Experimental permits unusual mechanics when they remain explicit, playable, and clearly marked if GM adjudication is required.',
        actorDetail: 'Controls descriptive and supporting depth, not mechanical completeness. Concise minimizes biography and secondary detail; Standard produces a complete table-ready sheet; Detailed adds richer motives, tactics, possessions, and story hooks.',
        inventoryPolicy: 'Controls carried equipment. Auto supplies a lean role-appropriate kit when the creature can carry gear; Complete Kit adds practical tools, supplies, and necessities; Signature Only keeps mechanically or narratively important gear; None omits carried gear except inseparable natural equipment.',
        featurePolicy: 'Controls the breadth of actions and traits. Auto infers what the role needs; Complete Action Suite includes standard actions and all signature capabilities needed to run the Actor; Signature Only keeps the standard baseline plus distinctive features and removes minor clutter.',
        spellcastingPolicy: 'Controls whether the generator builds spellcasting. Auto includes it only when supported by the concept; Include requires a coherent spell selection and the shared Ready action; Omit removes spells and spellcasting features.'
    };
    const select = (id, label, value, options, showForTemplate, group = 'Generation direction', groupIcon = 'fa-solid fa-sliders', hint = '') => ({
        id, label, value, inputType: 'select', showForTemplate, group, groupIcon, hint,
        options: options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))
    });
    const shared = (showForTemplate, prefix = '') => [
        select(`${prefix}actorPurpose`, 'Actor purpose', 'auto', [['auto','Auto'],['combat','Combatant'],['social','Social'],['exploration','Exploration / Support'],['boss','Boss']], showForTemplate, 'Generation direction', 'fa-solid fa-sliders', hints.actorPurpose),
        select(`${prefix}rulesPosture`, 'Rules posture', 'balanced', [['official','Conservative'],['balanced','Balanced Homebrew'],['experimental','Experimental']], showForTemplate, 'Generation direction', 'fa-solid fa-sliders', hints.rulesPosture),
        select(`${prefix}actorDetail`, 'Detail level', 'standard', [['concise','Concise'],['standard','Standard'],['detailed','Detailed']], showForTemplate, 'Generation direction', 'fa-solid fa-sliders', hints.actorDetail),
        select(`${prefix}inventoryPolicy`, 'Inventory', 'auto', [['auto','Auto'],['complete','Complete Kit'],['signature','Signature Only'],['none','None']], showForTemplate, 'Generation direction', 'fa-solid fa-sliders', hints.inventoryPolicy),
        select(`${prefix}featurePolicy`, 'Features', 'complete', [['auto','Auto'],['complete','Complete Action Suite'],['signature','Signature Only']], showForTemplate, 'Generation direction', 'fa-solid fa-sliders', hints.featurePolicy),
        select(`${prefix}spellcastingPolicy`, 'Spellcasting', 'auto', [['auto','Auto'],['include','Include'],['omit','Omit']], showForTemplate, 'Generation direction', 'fa-solid fa-sliders', hints.spellcastingPolicy)
    ];
    return [
        ...shared('npc'),
        ...shared('sidekick', 'sidekick'),
        ...shared('character', 'character'),
        select('sidekickRole', 'Sidekick role', 'auto', [['auto','Auto'],['warrior','Warrior'],['expert','Expert'],['spellcaster','Spellcaster']], 'sidekick', 'Sidekick snapshot', 'fa-solid fa-user-shield', 'Auto infers the progression from the concept and feature set. Expert emphasizes skills, Helpful, Cunning Action, and support; Warrior emphasizes martial durability and attacks; Spellcaster uses the sidekick spellcasting progression. The generated JSON records the actual inferred role, never Auto.'),
        select('sidekickLevel', 'Current level', '1', Array.from({ length: 20 }, (_, index) => [String(index + 1), String(index + 1)]), 'sidekick', 'Sidekick snapshot', 'fa-solid fa-user-shield', 'The completed Sidekick level represented by this snapshot. The generator must precompute level-dependent proficiency, HP, features, and spells. Blacksmith records the level but does not calculate progression or auto-level.'),
        { id: 'sidekickBaseCreature', label: 'Base creature', value: '', inputType: 'text', placeholder: 'e.g. Wolf', showForTemplate: 'sidekick', group: 'Sidekick snapshot', groupIcon: 'fa-solid fa-user-shield', hint: 'Name the original creature or stat block that became the Sidekick, such as Wolf or Mastiff. Leave blank to have the generator infer it from your description. This is descriptive metadata; Blacksmith does not rebuild the base stat block.' },
        { id: 'sidekickBaseStatBlock', label: 'Base stat block', value: 'Auto', inputType: 'text', placeholder: 'Auto or exact Actor name', showForTemplate: 'sidekick', group: 'Sidekick snapshot', groupIcon: 'fa-solid fa-user-shield', hint: 'The exact world or compendium Actor name providing the mechanical base, such as Mastiff when a Bulldog uses Mastiff statistics. Auto asks the generator to infer it. Blacksmith uses this only for validation; it must not replace a named companion’s visible Actor or token name.' },
        select('sidekickSpellcastingAbility', 'Spellcasting ability', '', [['','Auto / None'],['int','Intelligence'],['wis','Wisdom'],['cha','Charisma']], 'sidekick', 'Sidekick snapshot', 'fa-solid fa-user-shield', 'Leave Auto / None to let a Spellcaster Sidekick choose Intelligence, Wisdom, or Charisma and to leave non-spellcasters blank. Select an ability only when you want to require that casting ability.'),
        { id: 'characterRacePreference', label: 'Race / species', value: 'Auto', inputType: 'text', showForTemplate: 'character', group: 'Character snapshot', groupIcon: 'fa-solid fa-user', hint: 'Auto lets the generator choose from the concept. Enter an exact preferred world or compendium Item name to constrain it. The generated JSON contains the chosen plain name; Blacksmith resolves and embeds it, so you never enter a UUID.' },
        { id: 'characterBackgroundPreference', label: 'Background', value: 'Auto', inputType: 'text', showForTemplate: 'character', group: 'Character snapshot', groupIcon: 'fa-solid fa-user', hint: 'Auto lets the generator choose an appropriate background. Enter an exact preferred world or compendium Item name to constrain it. Blacksmith resolves the generated plain name and assigns the embedded background ID.' },
        { id: 'characterClassPreference', label: 'Class', value: 'Auto', inputType: 'text', showForTemplate: 'character', group: 'Character snapshot', groupIcon: 'fa-solid fa-user', hint: 'Auto lets the generator choose the class and current level distribution. Enter one or more preferred class names to constrain it. Generated class references include their final level counts; Blacksmith embeds those Class Items but does not run advancements.' },
        { id: 'characterSubclassPreference', label: 'Subclass', value: 'Auto', inputType: 'text', showForTemplate: 'character', group: 'Character snapshot', groupIcon: 'fa-solid fa-user', hint: 'Auto lets the generator choose subclasses appropriate to the selected classes and levels. Enter one or more exact names to constrain it. Blacksmith resolves and embeds the chosen Subclass Items without making advancement choices.' }
    ];
}

export function buildActorGenerationDirectives(options = {}) {
    return Object.entries(ACTOR_GENERATION_OPTIONS).map(([key, config]) => {
        const value = String(options[key] ?? config.default).trim().toLowerCase();
        const directive = config.values[value];
        if (!directive) throw new Error(`Unsupported Actor prompt option ${key}="${options[key]}"`);
        return `- ${directive}`;
    }).join('\n');
}

export async function buildActorImportPrompt(profile = 'npc', options = {}, onProgress) {
    if (profile && typeof profile === 'object') {
        options = profile;
        profile = 'npc';
    }
    let prompt = await fetchPromptText(profile === 'character' ? CHARACTER_PROMPT_FILE : ACTOR_PROMPT_FILE);
    const profilePrefix = profile === 'sidekick' ? 'sidekick' : (profile === 'character' ? 'character' : '');
    const generationOptions = profilePrefix
        ? Object.fromEntries(Object.keys(ACTOR_GENERATION_OPTIONS).map((key) => [key, options[`${profilePrefix}${key[0].toUpperCase()}${key.slice(1)}`]]))
        : options;
    prompt += `\n\n========================================\nGENERATION DIRECTION (AUTHORITATIVE)\n========================================\n\n${buildActorGenerationDirectives(generationOptions)}`;
    if (profile === 'sidekick') {
        const role = String(options.sidekickRole || 'auto').toLowerCase();
        const level = Number(options.sidekickLevel || 1);
        const baseCreature = String(options.sidekickBaseCreature || '').trim();
        const baseStatBlockPreference = String(options.sidekickBaseStatBlock || 'Auto').trim() || 'Auto';
        const spellcastingAbility = String(options.sidekickSpellcastingAbility || '').toLowerCase();
        const roleInstruction = role === 'auto'
            ? 'Infer Expert, Spellcaster, or Warrior from the supplied concept and existing feature progression. Emit the inferred lowercase role in sidekick.role; never emit "auto".'
            : `Use ${role} and emit "${role}" in sidekick.role.`;
        const baseCreatureInstruction = baseCreature ? JSON.stringify(baseCreature) : 'the inferred actual base-creature name';
        const baseStatBlockInstruction = baseStatBlockPreference.toLowerCase() === 'auto'
            ? 'the inferred exact existing Actor name for the mechanical base stat block'
            : JSON.stringify(baseStatBlockPreference);
        const abilityInstruction = spellcastingAbility
            ? JSON.stringify(spellcastingAbility)
            : 'the actual int/wis/cha key for a Spellcaster, otherwise an empty string';
        const metadataInstruction = role === 'auto'
            ? `Add the top-level sidekick metadata property exactly once with role set to the inferred lowercase role, level ${level}, baseCreature set to ${baseCreatureInstruction}, baseStatBlock set to ${baseStatBlockInstruction}, and spellcastingAbility set to ${abilityInstruction}.`
            : `Add this top-level metadata property exactly once: "sidekick": ${JSON.stringify({ role, level, baseCreature, baseStatBlock: baseStatBlockPreference.toLowerCase() === 'auto' ? '' : baseStatBlockPreference, spellcastingAbility })}. If baseStatBlock is blank, infer and emit the exact existing Actor name instead.`;
        prompt += `\n\n========================================\nSIDEKICK SNAPSHOT (AUTHORITATIVE)\n========================================\n\n- Build a complete, immediately playable sidekick at its current level. Do not generate advancement rules, a Class item, or future-level choices.\n- Keep top-level type as "npc".\n- Sidekick role preference: ${role}. ${roleInstruction}\n- ${metadataInstruction}\n- The bare root-level sidekick property is Blacksmith's friendly import envelope, not a native Foundry Actor field. Put it beside name, type, system, token, items, spells, and features. Blacksmith consumes it before Actor.create() and stores the normalized result at flags["coffee-pub-blacksmith"].sidekick on the created Actor. Do not duplicate it in flags.\n- All system statistics, proficiencies, hit points, Armor Class, attacks, inventory, features, and spells must already include the supplied current-level sidekick progression. Blacksmith preserves those calculated values; it does not recalculate or level the sidekick.\n- Set system.attributes.proficiency from sidekick level, not CR. Preserve final precomputed HP and AC; do not derive either from CR.\n- For a Spellcaster Sidekick, set system.attributes.spellcasting to exactly the same int, wis, or cha key emitted in sidekick.spellcastingAbility. For Expert or Warrior, normally leave both blank.\n- Set system.traits.size to the creature's actual size using tiny, sm, med, lg, huge, or grg. Ensure the HP formula's Hit Die matches that size: d4, d6, d8, d10, d12, or d20 respectively. Blacksmith validates consistency but does not recalculate HP.\n- Set CR and XP to the unscaled base stat block's values. They are informational compatibility fields only and are excluded from Blacksmith sidekick encounter budgeting.\n- baseCreature is the narrative creature identity; baseStatBlock is the exact existing Actor name supplying the mechanics. They may differ, such as Bulldog and Mastiff. baseStatBlock is validation metadata only and must not determine the visible token name.\n- For a persistent named companion, set token.name to the same proper name as the root Actor name and set token.actorLink to true. Use a generic token.name and actorLink false only for an intentionally anonymous/reusable Sidekick Actor.\n- Put class-like sidekick abilities in features[] as ordinary Feature items.\n- Current level: ${level}. Base creature: ${baseCreature || 'infer from supplied context and record its name'}. Base stat block: ${baseStatBlockPreference}. Spellcasting ability: ${spellcastingAbility || 'none unless the completed design requires one'}.`;
    }
    if (profile === 'character') {
        const preference = (key) => String(options[key] || 'Auto').trim() || 'Auto';
        const template = await buildActorJsonTemplate('character');
        prompt += `\n\n========================================\nCHARACTER SNAPSHOT (AUTHORITATIVE)\n========================================\n\n- Build a complete, immediately playable dnd5e Character snapshot. Keep top-level type as "character". Do not ask the user to make build decisions and do not generate future-level instructions.\n- Race/species preference: ${preference('characterRacePreference')}. Background preference: ${preference('characterBackgroundPreference')}. Class preference: ${preference('characterClassPreference')}. Subclass preference: ${preference('characterSubclassPreference')}.\n- Auto means infer the best choice from the supplied concept. It does not mean emitting the word "Auto" in the JSON.\n- Emit characterRace and characterBackground as exact existing Item names or complete inline native Item definitions.\n- For existing classes, emit characterClasses entries as { "name": "Exact Class Name", "levels": 1 }; levels is the final current number of levels in that class. Inline native Class definitions may instead carry system.levels. Emit characterSubclasses as exact-name strings or inline native definitions.\n- Blacksmith resolves those plain names through its configured Item sources, embeds them, applies the supplied class levels, and assigns the resulting race, background, and original-class IDs. Never invent or emit UUIDs or embedded Item IDs.\n- Treat supplied catalogs as authoritative for resolvable plain names. Never fabricate a near-match, combine catalog names, or silently omit a required mechanic. If a required Feature is absent from the Feature catalog, embed a complete friendly Blacksmith Feature object with its rules, activities, Feature profile fields, and an itemGMNotes note identifying the catalog-gap fallback. Optional nonessential content may be omitted.\n- Selected Item catalogs contain race/species, background, class, and subclass documents only when the selected sources actually provide them. A foundation name is catalog-verified only if it appears in the supplied Item catalog. When a required foundation is absent, use a complete inline native Foundry Item only if its full document can be authored correctly; otherwise preserve the intended exact name and identify the unresolved dependency in the biography. Never silently substitute a different build choice.\n- Do not duplicate race, background, class, or subclass entries in items, features, or spells.\n- Supply final current-level abilities, HP, AC inputs, proficiencies, skills, tools, spell data, currency, inventory, features, and spells. Blacksmith imports the snapshot; it does not build, level, or repair the character.\n\nJSON SHAPE\n\nUse this shape, replacing every neutral value with the completed character data. Preserve JSON types.\n\n${template}`;
    }
    const catalogs = await buildActorCatalogSections(options, onProgress);
    if (catalogs) prompt += `\n\n${catalogs}`;
    return applyCampaignPlaceholders(prompt, { actorsSource: options.actorsSource });
}

export async function buildActorJsonTemplate(profile = 'npc') {
    const data = {
        name: '',
        type: 'npc',
        img: 'icons/svg/mystery-man.svg',
        system: {
            abilities: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((ability) => [ability, { value: 10, proficient: 0 }])),
            attributes: {
                ac: { flat: 10, calc: 'flat' },
                hp: { value: 1, min: 0, max: 1, formula: '1d8' },
                movement: { walk: 30 },
                senses: { darkvision: 0, passive: 10 },
                spellcasting: '',
                proficiency: 2
            },
            details: {
                alignment: 'unaligned',
                type: { value: 'humanoid', subtype: '', swarm: '', custom: '' },
                cr: 0,
                xp: { value: 0 },
                source: '[ADD-NPC-SOURCE-HERE]',
                biography: { value: '', public: '' },
                ideal: '', bond: '', flaw: ''
            },
            traits: {
                size: 'med',
                di: { value: [], custom: '' },
                dr: { value: [], custom: '' },
                dv: { value: [], custom: '' },
                ci: { value: [], custom: '' },
                languages: { value: ['common'], custom: '' }
            },
            skills: {}
        },
        token: {
            name: '', displayName: 20, actorLink: false,
            width: 1, height: 1, disposition: 0, vision: true,
            dimSight: 0, brightSight: 0, displayBars: 0,
            texture: { src: 'icons/svg/mystery-man.svg', scaleX: 1, scaleY: 1 }
        },
        prototypeToken: {},
        items: [],
        spells: [],
        features: ['Dash', 'Disengage', 'Grapple', 'Shove', 'Ready'],
        currency: [],
        ownership: { default: 0 },
        folder: null
    };
    if (profile === 'sidekick') {
        data.sidekick = { role: '', level: 1, baseCreature: '', baseStatBlock: '', spellcastingAbility: '' };
        data.system.traits.important = true;
        data.token.actorLink = true;
        data.prototypeToken.actorLink = true;
    }
    if (profile === 'character') {
        data.type = 'character';
        data.characterRace = '';
        data.characterBackground = '';
        data.characterClasses = [{ name: '', levels: 1 }];
        data.characterSubclasses = [];
        data.system.details = {
            biography: { value: '', public: '' }, alignment: '', ideal: '', bond: '', flaw: '',
            xp: { value: 0 }, appearance: '', trait: '', eyes: '', height: '', faith: '', hair: '', weight: '', gender: '', skin: '', age: ''
        };
        data.system.attributes = {
            ac: { calc: 'default' },
            hp: { value: 1, min: 0, max: 1, temp: 0, tempmax: 0 },
            movement: { walk: 30 }, senses: {}, spellcasting: '', inspiration: false,
            death: { success: 0, failure: 0 }
        };
        data.system.traits = {
            size: 'med', di: { value: [], custom: '' }, dr: { value: [], custom: '' },
            dv: { value: [], custom: '' }, ci: { value: [], custom: '' },
            languages: { value: ['common'], custom: '' }, weaponProf: { value: [], custom: '' }, armorProf: { value: [], custom: '' }
        };
        data.system.tools = {};
        data.features = [];
    }
    return applyCampaignPlaceholders(JSON.stringify(data, null, 2));
}

export async function buildActorAuthoringGuide(profile = 'npc') {
    const isSidekick = profile === 'sidekick';
    const isCharacter = profile === 'character';
    const json = await buildActorJsonTemplate(profile);
    return `BLACKSMITH ${isSidekick ? 'SIDEKICK SNAPSHOT' : (isCharacter ? 'CHARACTER SNAPSHOT' : 'NPC/MONSTER')} JSON AUTHORING GUIDE

The JSON block below is a valid starter template. Copy only the JSON object into Blacksmith's Import JSON tab after editing it. Keep JSON value types intact: numbers and booleans must not be quoted.

Required basics
- name: the Actor's display name; it must not be blank when importing.
- type: keep "${isCharacter ? 'character' : 'npc'}" for this profile.
${isSidekick ? '- sidekick: this root-level object is Blacksmith-friendly import metadata, placed beside name/type/system rather than inside Foundry flags. Set role to expert, spellcaster, or warrior; level to an integer from 1 through 20; baseCreature to the narrative creature identity; baseStatBlock to the exact existing Actor name supplying the mechanical base; and spellcastingAbility to int, wis, cha, or an empty string. Blacksmith consumes the object and stores it at flags["coffee-pub-blacksmith"].sidekick before creating the standard dnd5e NPC.\n- For a Spellcaster, system.attributes.spellcasting must use the same int/wis/cha key as sidekick.spellcastingAbility. Supply the finished current-level statistics and content; Blacksmith does not calculate sidekick progression or auto-level the Actor.' : ''}
${isSidekick ? '- Final HP, AC, proficiency bonus, abilities, skills, inventory, features, and spells are authoritative. Do not derive them from CR during import. CR and XP are informational compatibility values for this profile.\n- Blacksmith marks Sidekick NPCs as important so dnd5e exposes NPC death saves at 0 HP. Class-like abilities remain ordinary Feature items.' : ''}
${isCharacter ? '- characterRace and characterBackground accept an exact existing Item name or a complete inline native Item definition. characterClasses uses { "name": "Exact Class Name", "levels": 1 } for referenced classes (one entry per class) or complete inline native Class definitions. characterSubclasses accepts exact names or inline native definitions. Arrays support multiclass snapshots.\n- Plain names resolve through Blacksmith\'s configured Item sources. Do not supply UUIDs or embedded IDs. Leave a field blank only when the character intentionally has no such document.\n- Supply final current-level values and content. Blacksmith does not apply advancements, make build choices, auto-level, or repair an incomplete character.' : ''}
${isCharacter ? '- Actor-local state on an existing reference uses the friendly wrapper { "itemName": "Exact Name", "itemType": "Equipment", "equipped": true, "attuned": false, "quantity": 1 }; Spell wrappers may use prepared. Blacksmith copies the resolved document and applies only the supplied state keys.\n- Plain strings remain exact references when no state override is needed.' : ''}
- abilities: set the six ability scores; proficient is 1 only for saving-throw proficiency.
- attributes: set Armor Class, current/maximum HP, hit-die formula, movement, senses, and proficiency bonus.
- details: set alignment, creature type/subtype, CR, XP, source, biography, ideal, bond, and flaw.
- traits: use dnd5e size keys (tiny, sm, med, lg, huge, grg) and lowercase system keys for immunities, resistances, vulnerabilities, conditions, and languages.
- skills: add only relevant skill entries. Use { "value": 1, "bonus": 0, "ability": "dex" } for proficiency or value 2 for Expertise. Perception is prc; Persuasion is per.

Content arrays
- items: exact existing Item names or inline friendly/native Item definitions.
- spells: exact existing Spell names or inline friendly/native Spell definitions.
- features: signature features first, then standard action references. Use the single exact reference Ready for every Actor; never use Ready Action or Ready Spell.
- Catalog names must match exactly. Never use a guessed near-match for missing content. For a mechanically required Feature absent from the available catalog, use a complete inline friendly Feature definition rather than a bare unresolved name or silent omission.
- currency: entries such as { "type": "gp", "value": 10 }.
- Unresolved name references are warned and skipped. Do not use a made-up name alone for custom content; embed its definition.

Token and biography
- token.name is normally the generic creature label; name may be the individual's proper name.
${isSidekick ? '- For a persistent named Sidekick, token.name should match the root Actor name and token.actorLink should be true. baseStatBlock never controls the visible token name. Use a generic unlinked token only for an intentionally anonymous/reusable Sidekick.' : ''}
- disposition is -1 hostile, 0 neutral, or 1 friendly.
- displayName is 0 never, 10 owner hover, 20 anyone hover, 30 owner always, or 40 everyone always.
- biography.value may contain simple Foundry-safe HTML. Escape double quotes inside JSON strings.

Validation reminders
- Do not add comments or trailing commas inside the JSON.
- Keep prototypeToken as an object for Foundry v13 compatibility.
- Blacksmith forces Actor type npc, root-folder placement, and default GM ownership.

JSON TEMPLATE

\`\`\`json
${json}
\`\`\`
`;
}
