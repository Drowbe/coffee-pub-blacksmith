// ==================================================================
// Actor import prompt composition and generation direction
// ==================================================================

import { fetchPromptText, applyCampaignPlaceholders } from './utility-json-import-prompts.js';

const ACTOR_PROMPT_FILE = 'prompt-characters.txt';

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
            include: 'Spellcasting: REQUIRED. Include a coherent, role-appropriate spell selection and Ready Spell among standard action references.',
            omit: 'Spellcasting: omit spells and spellcasting features entirely.'
        }
    }
};

export function getActorPromptFields() {
    const select = (id, label, value, options) => ({ id, label, value, inputType: 'select', showForTemplate: 'npc', group: 'Generation direction', groupIcon: 'fa-solid fa-sliders', options });
    return [
        select('actorPurpose', 'Actor purpose', 'auto', [['auto','Auto'],['combat','Combatant'],['social','Social'],['exploration','Exploration / Support'],['boss','Boss']]),
        select('rulesPosture', 'Rules posture', 'balanced', [['official','Conservative'],['balanced','Balanced Homebrew'],['experimental','Experimental']]),
        select('actorDetail', 'Detail level', 'standard', [['concise','Concise'],['standard','Standard'],['detailed','Detailed']]),
        select('inventoryPolicy', 'Inventory', 'auto', [['auto','Auto'],['complete','Complete Kit'],['signature','Signature Only'],['none','None']]),
        select('featurePolicy', 'Features', 'complete', [['auto','Auto'],['complete','Complete Action Suite'],['signature','Signature Only']]),
        select('spellcastingPolicy', 'Spellcasting', 'auto', [['auto','Auto'],['include','Include'],['omit','Omit']])
    ].map((field) => ({ ...field, options: field.options.map(([value, label]) => ({ value, label })) }));
}

export function buildActorGenerationDirectives(options = {}) {
    return Object.entries(ACTOR_GENERATION_OPTIONS).map(([key, config]) => {
        const value = String(options[key] ?? config.default).trim().toLowerCase();
        const directive = config.values[value];
        if (!directive) throw new Error(`Unsupported Actor prompt option ${key}="${options[key]}"`);
        return `- ${directive}`;
    }).join('\n');
}

export async function buildActorImportPrompt(options = {}) {
    let prompt = await fetchPromptText(ACTOR_PROMPT_FILE);
    prompt += `\n\n========================================\nGENERATION DIRECTION (AUTHORITATIVE)\n========================================\n\n${buildActorGenerationDirectives(options)}`;
    return applyCampaignPlaceholders(prompt, { actorsSource: options.actorsSource });
}

export async function buildActorJsonTemplate() {
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
        features: ['Dash', 'Disengage', 'Grapple', 'Shove', 'Ready Action'],
        currency: [],
        ownership: { default: 0 },
        folder: null
    };
    return applyCampaignPlaceholders(JSON.stringify(data, null, 2));
}

export async function buildActorAuthoringGuide() {
    const json = await buildActorJsonTemplate();
    return `BLACKSMITH NPC/MONSTER JSON AUTHORING GUIDE

The JSON block below is a valid starter template. Copy only the JSON object into Blacksmith's Import JSON tab after editing it. Keep JSON value types intact: numbers and booleans must not be quoted.

Required basics
- name: the Actor's display name; it must not be blank when importing.
- type: keep "npc". Character-sheet imports are not supported by this profile.
- abilities: set the six ability scores; proficient is 1 only for saving-throw proficiency.
- attributes: set Armor Class, current/maximum HP, hit-die formula, movement, senses, and proficiency bonus.
- details: set alignment, creature type/subtype, CR, XP, source, biography, ideal, bond, and flaw.
- traits: use dnd5e size keys (tiny, sm, med, lg, huge, grg) and lowercase system keys for immunities, resistances, vulnerabilities, conditions, and languages.
- skills: add only relevant skill entries. Use { "value": 1, "bonus": 0, "ability": "dex" } for proficiency or value 2 for Expertise. Perception is prc; Persuasion is per.

Content arrays
- items: exact existing Item names or inline friendly/native Item definitions.
- spells: exact existing Spell names or inline friendly/native Spell definitions.
- features: signature features first, then standard action references. Ready Spell should be added for spellcasters.
- currency: entries such as { "type": "gp", "value": 10 }.
- Unresolved name references are warned and skipped. Do not use a made-up name alone for custom content; embed its definition.

Token and biography
- token.name is normally the generic creature label; name may be the individual's proper name.
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
