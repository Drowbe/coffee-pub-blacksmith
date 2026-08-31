// ==================================================================
// ===== ACTOR DECLARATIONS =========================================
// ==================================================================
// Blacksmith's three Actor profiles, declared as data.
//
// Actor is the PASSTHROUGH form, and the first profile of any kind to use it.
// The payload is already dnd5e Actor source data: abilities, attributes, traits,
// skills, items, effects. Blacksmith does not declare any of that, and declaring
// it would be a mistake rather than an omission -- dnd5e owns that schema, its
// data model validates it, and a second copy here would drift from it the next
// time the system changed. What a declaration adds is the ENVELOPE: the handful
// of keys an author writes that are not Actor data and have to be consumed into
// it before the document is created.
//
// The three profiles are not three Actor types. NPC and Sidekick both create a
// dnd5e `npc`; a sidekick is a snapshot NPC carrying metadata, which is what
// keeps every sheet and every other module working on it.
//
// This file is DATA. Derivation lives in manager-declarations.js, and the
// consumption the derivations call lives in parsers/parse-actor.js.
// ==================================================================

import { registerDeclaration } from '../registry-declarations.js';

/**
 * The keys every Actor profile shares, whichever it is.
 *
 * `items` is declared even though it is native, because the character profile
 * appends to it and a payload that omits it must still arrive as an array rather
 * than as undefined. Declaring it is how that is guaranteed once, rather than
 * being defended against in each derivation that touches it.
 */
function sharedActorFields(actorType) {
    return [
        { name: 'name', path: 'name', type: 'string', required: true, example: '',
          guidance: 'The Actor name as it appears in the sidebar.' },
        // A const rather than an authored field: the profile already decided this,
        // and an authored `type` that disagreed with the chosen profile could only
        // ever be wrong. The old parser silently rewrote anything that was not
        // "character" to "npc", which is the same decision made invisibly.
        { name: 'type', path: 'type', const: actorType,
          guidance: 'Set by the profile; never authored.' },
        { name: 'items', path: 'items', type: 'array', default: [], example: [],
          guidance: 'Exact existing Item names, or complete inline Item definitions.' },
        // Consumed into prototypeToken by the actorToken derivation. The friendly
        // schema has always called this `token`; Foundry v13 persists it as
        // `prototypeToken`, and an explicit `prototypeToken` in the payload wins.
        { name: 'token', role: 'envelope', type: 'object',
          guidance: 'Prototype token defaults. Blacksmith merges this onto prototypeToken.' }
    ];
}

/**
 * A plain NPC or monster. Nothing is consumed but the token block.
 */
export const ACTOR_NPC_DECLARATION = {
    kind: 'actor',
    id: 'npc',
    label: 'NPC',
    schemaVersion: 1,
    form: 'passthrough',
    document: { documentName: 'Actor' },
    derive: ['actorToken', 'actorContent'],
    fields: sharedActorFields('npc')
};

/**
 * A Sidekick: an NPC plus authoring metadata Blacksmith preserves.
 *
 * The metadata is authored at the ROOT of the payload rather than inside
 * `flags`, because an author should not have to know the module's namespace to
 * describe a sidekick. Blacksmith moves it there.
 *
 * Nothing about progression is derived. The statistics in the payload are final
 * at the level given; `validateSidekickSnapshot` warns where they disagree with
 * the usual tables, and warns rather than refuses because a deliberate variant is
 * a legitimate thing to author.
 */
export const ACTOR_SIDEKICK_DECLARATION = {
    kind: 'actor',
    id: 'sidekick',
    label: 'Sidekick',
    schemaVersion: 1,
    form: 'passthrough',
    document: { documentName: 'Actor' },
    derive: ['actorSidekick', 'actorToken', 'actorContent'],
    fields: [
        ...sharedActorFields('npc'),
        { name: 'sidekick', role: 'envelope', type: 'object', required: true,
          guidance: 'Sidekick metadata, which Blacksmith stores in its own flags.',
          fields: [
              { name: 'role', type: 'string', required: true, example: 'warrior',
                values: ['expert', 'spellcaster', 'warrior'],
                guidance: 'Which sidekick role the statistics were built for.' },
              { name: 'level', type: 'integer', required: true, min: 1, max: 20, example: 1,
                guidance: 'The level the supplied statistics are final at.' },
              { name: 'baseCreature', type: 'string', default: '', example: '',
                guidance: 'The narrative creature identity, such as a pseudodragon.' },
              { name: 'baseStatBlock', type: 'string', default: '', example: '',
                guidance: 'The exact name of an existing Actor supplying the mechanical base.' },
              { name: 'spellcastingAbility', type: 'string', default: '', example: '',
                values: ['int', 'wis', 'cha', ''],
                guidance: 'The spellcasting ability, matching system.attributes.spellcasting. Blank for a non-caster.' }
          ] }
    ]
};

/**
 * A Character snapshot.
 *
 * The four foundation keys are authored as plain NAMES, not as embedded
 * documents, because a name survives a pack being rebuilt and an embedded id does
 * not. They are typed as arrays and a string WITHOUT a nested shape on purpose:
 * an element may be a plain name or a complete inline definition, the field model
 * has no union type, and declaring either form alone would reject the other.
 * `parsers/parse-actor.js` owns that check and says so.
 */
export const ACTOR_CHARACTER_DECLARATION = {
    kind: 'actor',
    id: 'character',
    label: 'Character Snapshot',
    schemaVersion: 1,
    form: 'passthrough',
    document: { documentName: 'Actor' },
    derive: ['actorCharacterFoundations', 'actorToken', 'actorContent'],
    fields: [
        ...sharedActorFields('character'),
        { name: 'characterRace', role: 'envelope', type: 'string', default: '', example: '',
          guidance: 'The exact name of an existing Race Item, or an inline definition.' },
        { name: 'characterBackground', role: 'envelope', type: 'string', default: '', example: '',
          guidance: 'The exact name of an existing Background Item, or an inline definition.' },
        { name: 'characterClasses', role: 'envelope', type: 'array', default: [],
          example: [{ name: '', levels: 1 }],
          guidance: 'One entry per class, each an exact name with levels, or an inline definition.' },
        { name: 'characterSubclasses', role: 'envelope', type: 'array', default: [], example: [],
          guidance: 'One entry per subclass, each an exact name or an inline definition.' }
    ]
};

registerDeclaration(ACTOR_NPC_DECLARATION);
registerDeclaration(ACTOR_SIDEKICK_DECLARATION);
registerDeclaration(ACTOR_CHARACTER_DECLARATION);
