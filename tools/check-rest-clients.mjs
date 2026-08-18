#!/usr/bin/env node
/**
 * Guard the rest flow's CLIENT SPLIT.
 *
 *   node tools/check-rest-clients.mjs
 *
 * Exits non-zero on a violation.
 *
 * WHY THIS EXISTS. Two defects shipped together, and both are invisible to a GM
 * testing alone:
 *
 *   1. `dnd5e.restCompleted` is `Hooks.callAll` -- a LOCAL hook, firing only on the
 *      client that ran the rest. A `if (!game.user.isGM) return` guard therefore did
 *      not defer to the GM, it discarded the rest. Every rest a player accepted
 *      produced no card, no rations, no exhaustion and no clock movement.
 *
 *   2. Silencing the system's rest card also silenced `flags.dnd5e.requestResult`,
 *      the only thing that ticks a character off a rest request -- so the request
 *      stayed live and the same character could rest repeatedly.
 *
 * Both survived a full round of live testing because a GM pressing Rest is the one
 * path where the acting client IS the GM. So this check MODELS TWO CLIENTS: the
 * module is instantiated twice, with separate static state, exactly as two browsers
 * would have it. A single-client stub cannot express either bug, which is precisely
 * how they got through.
 *
 * It executes the real files rather than pattern-matching them, because what is
 * being asserted is behaviour -- where the work happens -- and not a spelling.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load a module for evaluation with its imports replaced by stubs.
 *
 * The two rest files import Foundry-dependent siblings that cannot load outside a
 * browser, so imports are stripped and the names they bound are supplied by the
 * caller's preamble instead. Everything else is the real source.
 */
const strip = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
    // Imports are matched as STATEMENTS rather than lines, because a named import list
    // long enough to wrap is still one import -- and a line-by-line filter leaves the
    // continuation lines behind as a syntax error in whatever it builds next.
    .replace(/^import\s[\s\S]*?from\s*['"][^'"]*['"];?/gm, '')
    .replace(/^import\s+['"][^'"]*['"];?/gm, '')
    .split('\n')
    .map((l) => l.replace(/^export\s+(async\s+)?(function|const|let|class)\s/, '$1$2 '))
    .filter((l) => !/^export\s/.test(l))
    .join('\n');

const problems = [];
let checks = 0;

const check = (label, condition, detail = '') => {
    checks++;
    if (condition) return;
    problems.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};

// ==================================================================
// ===== THE WORLD =================================================
// ==================================================================

const world = {
    settings: {
        restAdvancesTime: true, restPostCard: true, restSuppressSystemCard: true,
        restSkipRequestDialog: true, restTrackFood: true, restTrackWater: true,
        restForagePlayerRolls: false, restForageDC: 12,
        restFoodItems: 'Rations', restWaterItems: 'Waterskin'
    },
    messages: new Map(),
    actors: new Map(),
    posted: [],
    advanced: [],
    warnings: [],
    sent: []
};

const reset = () => {
    world.posted.length = 0;
    world.advanced.length = 0;
    world.warnings.length = 0;
    world.sent.length = 0;
};

// Mirrors the real `CONFIG.DND5E` closely enough for the rules under test. The
// `recoverSpellSlotTypes` sets are dnd5e's own (`dnd5e.mjs:46445` and `:46462`) --
// a short rest gives back pact slots and nothing else.
globalThis.CONFIG = {
    DND5E: {
        conditionTypes: { exhaustion: { levels: 6 } },
        restTypes: {
            short: { recoverSpellSlotTypes: new Set(['pact']) },
            long: { newDay: true, recoverTemp: true, recoverTempMax: true, recoverHitDice: true,
                    recoverSpellSlotTypes: new Set(['spell', 'pact']) }
        }
    }
};
globalThis.ui = { notifications: { warn: (m) => world.warnings.push(m) } };
globalThis.fromUuid = async (uuid) => world.actors.get(uuid) ?? null;
globalThis.Hooks = { once: (name, fn) => (globalThis.__socketReadyCallbacks ??= []).push({ name, fn }) };
globalThis.game = {
    user: { isGM: true },
    messages: { get: (id) => world.messages.get(id) ?? null },
    time: { advance: async (s) => world.advanced.push(s), calendar: { days: { secondsPerMinute: 60 } } }
};

const asUser = (isGM) => { globalThis.game.user = { isGM }; };

/** A chat message as far as these two files are concerned. */
const makeMessage = (id, flags = {}) => ({
    id,
    flags,
    getFlag: (scope, key) => flags[scope]?.[key],
    async setFlag(scope, key, value) {
        (this.flags[scope] ??= {})[key] = value;
        return this;
    }
});

globalThis.__ChatCardsAPI = {
    async post(options) {
        const message = makeMessage(`card-${world.posted.length + 1}`, {});
        world.posted.push({ options, message });
        return message;
    },
    async update(message, options) {
        world.posted.push({ options, message, isUpdate: true });
        return message;
    },
    registerAction() { return true; }
};

// ==================================================================
// ===== THE MODULE UNDER TEST =====================================
// ==================================================================

const CARDS_PREAMBLE = `
    const MODULE = { ID: 'coffee-pub-blacksmith', NAME: 'Blacksmith' };
    const postConsoleAndNotification = () => {};
    const ChatCardsAPI = globalThis.__ChatCardsAPI;
`;

const cards = new Function(`${CARDS_PREAMBLE}\n${strip('scripts/cards-rest.js')}
    return { buildRestState, postRestCardFromState, updateRestCard, updateRestCardState, isForagePending,
             isRestPending, buildRecoveryRows, buildBeforeState, buildPartsFromState, buildStandingRows,
             buildForageParts, buildProvisionRows, buildHitDiceState, buildHitDiceParts,
             readHitDicePools, postBeforeCard };`)();

const REST_PREAMBLE = `
    const MODULE = { ID: 'coffee-pub-blacksmith', NAME: 'Blacksmith' };
    const postConsoleAndNotification = () => {};
    const getSettingSafely = (m, k, d) => (k in globalThis.__world.settings ? globalThis.__world.settings[k] : d);
    const HookManager = { registerHook: () => {} };
    const ChatCardsAPI = globalThis.__ChatCardsAPI;
    const {
        buildRestState, postRestCardFromState, updateRestCard, updateRestCardState,
        isForagePending, isRestPending
    } = globalThis.__cards;

    // Delegated rather than captured, so a test can swap the socket AFTER a client is
    // built -- which is the whole of the startup-order case below.
    const SocketManager = {
        get isSocketReady() { return globalThis.__SocketManager.isSocketReady; },
        getSocket: (...a) => globalThis.__SocketManager.getSocket(...a)
    };
`;

globalThis.__world = world;
globalThis.__cards = cards;

/**
 * A fresh client. TWO OF THESE IS THE ENTIRE POINT -- each gets its own copy of the
 * class and therefore its own static state, exactly as two browsers do. Sharing one
 * instance would let the GM's bookkeeping silently cover for the player's client.
 */
const makeClient = () => new Function(`${REST_PREAMBLE}\n${strip('scripts/manager-rest.js')}\nreturn RestManager;`)();

globalThis.__SocketManager = {
    isSocketReady: true,
    getSocket: () => ({
        register: (name, fn) => { (globalThis.__registered ??= new Map()).set(name, fn); },
        executeAsGM: async (name, payload) => { world.sent.push({ name, payload }); }
    })
};

// ==================================================================
// ===== 1. A PLAYER-ACCEPTED REQUESTED REST ========================
// ==================================================================
//
// The reviewer's reproduction, as code. GM sends a rest request; the PLAYER accepts
// on their own client. Before the fix this produced nothing whatsoever.

const player = makeClient();
const gm = makeClient();

world.actors.set('Actor.Nik', {
    id: 'Nik', name: 'Nik', uuid: 'Actor.Nik', img: 'nik.webp',
    system: { spells: {}, attributes: { hp: { value: 40, max: 40 }, exhaustion: 0 } },
    items: Object.assign([], { get: () => null, find: () => null }),
    async update() {}
});

const request = makeMessage('req-1', {});
request.system = { targets: [{ actor: 'Actor.Nik' }, { actor: 'Actor.Favia' }] };
world.messages.set('req-1', request);

const restConfig = () => {
    const config = { type: 'long', duration: 480, chat: true, dialog: true, request, advanceTime: false };
    player._onPreRest(config);
    return config;
};

const restResult = () => ({
    deltas: { hitPoints: 12, hitDice: 2 },
    clone: { system: { spells: {}, attributes: { exhaustion: 1 } }, items: { get: () => null } },
    updateItems: []
});

reset();
asUser(false);
const config = restConfig();
await player._onRestCompleted(config, world.actors.get('Actor.Nik'), restResult());

check(
    'A player accepting a rest must hand it to the GM, not drop it.',
    world.sent.length === 1,
    `Nothing was sent. \`dnd5e.restCompleted\` fires ONLY on the acting client, so a GM-only guard here discards the rest entirely.`
);
check(
    'The hop must carry the card state built on the acting client.',
    world.sent[0]?.payload?.state?.recovery?.length > 0,
    `\`result.clone\` exists only in that call stack; deferring the diff to the GM diffs the actor against itself.`
);
check(
    'The hop must record that we silenced the system card.',
    world.sent[0]?.payload?.suppressedSystemCard === true,
    `Without it the GM cannot know the request completion stamp is ours to write.`
);
check(
    'A player must write nothing themselves.',
    world.posted.length === 0 && world.advanced.length === 0,
    `Rations, exhaustion, the card and the clock are all GM-only writes.`
);

// Deliver it. Captured before the reset, because this IS the message that crossed
// the wire and it is the only copy.
const handoff = world.sent[0]?.payload ?? {};

reset();
asUser(true);
await gm._applyRest(handoff);

check('The GM posts the card.', world.posted.length === 1, `Posted ${world.posted.length}.`);
check(
    'The card is stamped so the request marks this character done.',
    world.posted[0]?.message?.flags?.dnd5e?.requestResult?.requestId === 'req-1',
    `\`flags.dnd5e.requestResult\` is the ONLY mechanism that ticks a target off a rest request ` +
    `(dnd5e.mjs:82950). Suppress the system card without it and the character can rest all night.`
);
check(
    'The stamp names the actor it completes.',
    world.posted[0]?.message?.flags?.dnd5e?.requestResult?.actorUuid === 'Actor.Nik'
);
check(
    'The clock waits for the rest of the party.',
    world.advanced.length === 0,
    `Two targets, one acceptance — the party is not eight hours later yet.`
);

// ==================================================================
// ===== 2. THE LAST SLEEPER MOVES THE CLOCK ========================
// ==================================================================

world.actors.set('Actor.Favia', { ...world.actors.get('Actor.Nik'), id: 'Favia', name: 'Favia', uuid: 'Actor.Favia' });

reset();
await gm._applyRest({
    actorUuid: 'Actor.Favia', requestId: 'req-1', restType: 'long', minutes: 480,
    systemAdvanced: false, suppressedSystemCard: true,
    state: cards.buildRestState({
        actor: world.actors.get('Actor.Favia'), result: restResult(), config: { type: 'long', duration: 480 }
    })
});

check('The second acceptance posts its own card.', world.posted.length === 1);
check(
    'And the clock now moves, once.',
    world.advanced.length === 1 && world.advanced[0] === 480 * 60,
    `Advanced ${JSON.stringify(world.advanced)}; expected one jump of ${480 * 60} seconds.`
);

reset();
await gm._applyRest({ actorUuid: 'Actor.Nik', requestId: 'req-1', restType: 'long', minutes: 480, state: {} });
check(
    'A late arrival for a finished request changes nothing.',
    world.posted.length === 0 && world.advanced.length === 0
);

// ==================================================================
// ===== 3. NOT OUR CARD, NOT OUR STAMP =============================
// ==================================================================
//
// When the system posts its own card it has already stamped the request. Stamping
// ours as well would repoint the target at the wrong message.

reset();
const soloGm = makeClient();
await soloGm._applyRest({
    actorUuid: 'Actor.Nik', requestId: 'req-2', restType: 'long', minutes: 480,
    systemAdvanced: false, suppressedSystemCard: false,
    state: cards.buildRestState({ actor: world.actors.get('Actor.Nik'), result: restResult(), config: { type: 'long', duration: 480 } })
});

check('A card still posts when the system card was left alone.', world.posted.length === 1);
check(
    'But it carries no request stamp.',
    world.posted[0]?.message?.flags?.dnd5e === undefined,
    `The system's own card already stamped the request; a second stamp repoints the target at ours.`
);

// ==================================================================
// ===== 4. THE SOCKET HANDLERS MUST SURVIVE STARTUP ORDER ==========
// ==================================================================
//
// RestManager.initialize() runs at blacksmith.js:534; SocketManager.initialize() at
// 1538. So the socket does NOT exist when the handlers are first registered, and a
// bare `getSocket()?.register?.()` silently registers nothing -- which is fatal,
// because executeAsGM runs the handler on the GM's client.

globalThis.__registered = new Map();
globalThis.__socketReadyCallbacks = [];
globalThis.__SocketManager = { isSocketReady: false, getSocket: () => null };

const early = makeClient();
early._registerActions();

check(
    'With no socket yet, registration must be deferred rather than dropped.',
    globalThis.__socketReadyCallbacks.some((h) => h.name === 'blacksmith.socketReady'),
    `Nothing waited on blacksmith.socketReady, so the handlers are registered against a null socket and lost.`
);

globalThis.__SocketManager = {
    isSocketReady: true,
    getSocket: () => ({ register: (n, fn) => globalThis.__registered.set(n, fn), executeAsGM: async () => {} })
};
for (const hook of globalThis.__socketReadyCallbacks) hook.fn();

check(
    'Once the socket is ready, the rest proxy is registered.',
    globalThis.__registered.has(early.REST_GM_PROXY),
    `Registered: ${[...globalThis.__registered.keys()].join(', ') || 'nothing'}`
);
check(
    'And so is the forage proxy.',
    globalThis.__registered.has(early.FORAGE_GM_PROXY)
);

// ==================================================================
// ===== 5. PROVISIONS: A WATERSKIN IS NOT A STACK ==================
// ==================================================================

const makeItem = (name, system) => {
    const item = { name, system, updates: [] };
    item.update = async (data) => {
        item.updates.push(data);
        Object.assign(item.system, {});
        return item;
    };
    return item;
};

const skin = makeItem('Waterskin', { quantity: 1, uses: { spent: 0, max: 4, value: 4 } });
const rations = makeItem('Rations', { quantity: 5 });

await gm._consume(skin);
check(
    'Drinking from a waterskin spends a use.',
    skin.updates[0]?.['system.uses.spent'] === 1,
    `Got ${JSON.stringify(skin.updates[0])}. A waterskin is one item holding pints, not a stack of skins.`
);
check(
    'And never touches its quantity.',
    skin.updates[0]?.['system.quantity'] === undefined,
    `Decrementing quantity DELETES the skin, so the character wakes with nothing to carry water in.`
);

await gm._consume(rations);
check(
    'Eating a ration still decrements the stack.',
    rations.updates[0]?.['system.quantity'] === 4,
    `Got ${JSON.stringify(rations.updates[0])}.`
);

check('A full skin counts as water.', gm._remaining(skin) === 4);
check(
    'An empty one does not.',
    gm._remaining(makeItem('Waterskin', { quantity: 1, uses: { spent: 4, max: 4, value: 0 } })) === 0,
    `An empty skin has a quantity of 1 and nothing in it; a quantity-only test calls that water.`
);

// ==================================================================
// ===== 6. SHORT-REST HIT DICE ARE SPENT, NOT RECOVERED ============
// ==================================================================

const shortRows = cards.buildRecoveryRows(
    { system: { spells: {}, attributes: { hd: { value: 3 }, exhaustion: 0 } }, items: { get: () => null } },
    { deltas: { hitPoints: 0, hitDice: -2 }, clone: { system: { spells: {}, attributes: {} } }, updateItems: [] }
);
const diceRow = shortRows.find((r) => /Hit Dice/.test(r.label));

check('A short rest still reports its hit dice.', !!diceRow);
check(
    'Labelled as spent.',
    diceRow?.label === 'Hit Dice Spent',
    `Got "${diceRow?.label}". dnd5e flips the sign for display (dnd5e.mjs:38338) because the dice were burnt.`
);
check('Counted as a positive number of dice.', diceRow?.trailing === '2', `Got "${diceRow?.trailing}".`);
check(
    'And not toned as a gain.',
    diceRow?.tone !== 'positive',
    `Filing a negative delta under Recovered toned positive says the character gained dice they just spent.`
);
check(
    'And carries no from-to sublabel.',
    diceRow?.sublabel === undefined,
    `Got "${diceRow?.sublabel}". The pre-rest phase already showed where the character stood, so restating ` +
    `the before number beside the change is the card explaining its own arithmetic.`
);

const longRows = cards.buildRecoveryRows(
    { system: { spells: {}, attributes: { hd: { value: 5 }, exhaustion: 0 } }, items: { get: () => null } },
    { deltas: { hitPoints: 0, hitDice: 2 }, clone: { system: { spells: {}, attributes: {} } }, updateItems: [] }
);
const longDice = longRows.find((r) => /Hit Dice/.test(r.label));
check('A long rest still recovers them.', longDice?.label === 'Hit Dice' && longDice?.trailing === '+2');
check('Toned as a gain.', longDice?.tone === 'positive');

// ==================================================================
// ===== 7. ONE CARD, TWO PHASES ====================================
// ==================================================================
//
// The GM window posts a card showing where a character stands, with a Rest button.
// Pressing it rests them and REWRITES THAT CARD. The question and the answer must
// end up in the same message, or the whole point of the pre-rest phase is lost.

const before = cards.buildBeforeState({
    actor: {
        uuid: 'Actor.Nik', name: 'Nik', img: 'nik.webp',
        system: {
            attributes: { hp: { value: 22, max: 40 }, hd: { value: 2, max: 5 }, exhaustion: 1 },
            // `type` is carried on every real pool -- dnd5e's own recovery keys off it
            // (`dnd5e.mjs:38519`), so a pool without one recovers from nothing.
            spells: { spell1: { value: 1, max: 4, type: 'spell' }, spell2: { value: 0, max: 2, type: 'spell' } }
        }
    },
    restType: 'long',
    restOptions: { newDay: true, trackFood: true, trackWater: false }
});

check('The pre-rest card knows which phase it is in.', before.phase === 'before');
check('It carries the GM choices so the rest matches what was asked for.',
    before.restOptions.newDay === true && before.restOptions.trackFood === true && before.restOptions.trackWater === false,
    JSON.stringify(before.restOptions));
check('It is pending until somebody rests.', cards.isRestPending(before) === true);
check('A rested card is not.', cards.isRestPending({ phase: 'rested' }) === false);

const standing = before.standing;
check('It shows hit dice as a proportion.', standing.find((r) => r.label === 'Hit Dice')?.trailing === '2 / 5',
    JSON.stringify(standing));
check('Spell slots are summed, not listed per level.',
    standing.find((r) => r.label === 'Spell Slots')?.trailing === '1 / 6',
    `Nine rows of mostly zeroes answers "how much have I got left" worse than one.`);
check('Exhaustion is shown when carried.', standing.find((r) => r.label === 'Exhaustion')?.trailing === 'Level 1');

// --- Slots only appear when THIS rest can give them back ------------------------
//
// A short rest restores pact slots and nothing else, so telling a wizard they are on
// 8 of 17 before one reports a number the rest will not move.

const caster = (spells) => ({ system: { attributes: { hd: { value: 9, max: 14 }, exhaustion: 0 }, spells } });
const WIZARD = { spell1: { value: 3, max: 4, type: 'spell' }, spell2: { value: 5, max: 13, type: 'spell' } };
const WARLOCK = { pact: { value: 1, max: 2, type: 'pact' } };
const slotsRow = (spells, type) => cards.buildStandingRows(caster(spells), type).find((r) => r.label === 'Spell Slots');

check(
    'A wizard is not shown spell slots before a SHORT rest.',
    !slotsRow(WIZARD, 'short'),
    `A short rest cannot restore them, so the number is true and useless.`
);
check('But is before a long one.', slotsRow(WIZARD, 'long')?.trailing === '8 / 17');
check(
    'A warlock IS shown them before a short rest, because pact slots come back.',
    slotsRow(WARLOCK, 'short')?.trailing === '1 / 2',
    `The rule is read from \`recoverSpellSlotTypes\`, so this works without the card knowing what a warlock is.`
);
check('A multiclass warlock/wizard shows only the pact half on a short rest.',
    slotsRow({ ...WIZARD, ...WARLOCK }, 'short')?.trailing === '1 / 2');
check('And everything on a long one.',
    slotsRow({ ...WIZARD, ...WARLOCK }, 'long')?.trailing === '9 / 19');
check(
    'Hit dice show on a short rest regardless -- they are what it SPENDS.',
    cards.buildStandingRows(caster(WIZARD), 'short').find((r) => r.label === 'Hit Dice')?.trailing === '9 / 14'
);

const fighter = cards.buildStandingRows({ system: { attributes: { hd: { value: 3, max: 3 }, exhaustion: 0 }, spells: {} } });
check('A character with no spellcasting is not told about slots.',
    !fighter.some((r) => r.label === 'Spell Slots'), JSON.stringify(fighter));
check('Nor about exhaustion they do not have.', !fighter.some((r) => r.label === 'Exhaustion'));

const beforeParts = cards.buildPartsFromState(before);
const restButton = beforeParts.find((p) => p.part === 'actions')?.buttons?.[0];

check('The pre-rest card offers a Rest control.', restButton?.action === 'rest', JSON.stringify(restButton));
check(
    'It is a BUTTON, not a row.',
    !!beforeParts.find((p) => p.part === 'actions'),
    `A clickable row carrying a name and an explanation read as another data row rather than the thing to press.`
);
check(
    'Weighted primary, because pressing it is the point of the card.',
    restButton?.variant === 'primary',
    `Got "${restButton?.variant}". Contrast the foraging control, which opens a roll and commits nothing.`
);
check(
    'The label says what pressing it does, and names the rest.',
    restButton?.label === 'Begin Long Rest',
    `Got "${restButton?.label}".`
);
check(
    'It does not repeat the character name.',
    !/Nik/.test(restButton?.label ?? ''),
    `The name is already the card's identity; repeating it is a third statement of the same fact.`
);
check('Namespaced to us.', restButton?.moduleId === 'coffee-pub-blacksmith');
check('It carries a health bar.', beforeParts.some((p) => p.part === 'meter'));
check(
    'And no section headings at all.',
    !beforeParts.some((p) => p.part === 'section'),
    `A pre-rest card has one thing to say about the character, so its rows have nothing to be ` +
    `distinguished from -- and a heading exists to separate one group from another.`
);

const shortButton = cards.buildPartsFromState(cards.buildBeforeState({
    actor: { uuid: 'Actor.Nik', name: 'Nik', system: { attributes: {}, spells: {} } }, restType: 'short'
})).find((p) => p.part === 'actions')?.buttons?.[0];
check('A short rest says so on its button.', shortButton?.label === 'Begin Short Rest', `Got "${shortButton?.label}".`);
check('And no recovery section, because nothing has happened yet.',
    !beforeParts.some((p) => p.label === 'Recovered'),
    `A card reporting "nothing recovered" before the rest reads as a rest that failed.`);

// Now rest from that card.
reset();
const cardMessage = makeMessage('card-before', {});
world.messages.set('card-before', cardMessage);

await gm._applyRest({
    actorUuid: 'Actor.Nik', requestId: null, restType: 'long', minutes: 480,
    systemAdvanced: false, suppressedSystemCard: true,
    cardId: 'card-before',
    provisionOptions: { trackFood: false, trackWater: false },
    state: cards.buildRestState({ actor: world.actors.get('Actor.Nik'), result: restResult(), config: { type: 'long', duration: 480 } })
});

check(
    'Resting from a card rewrites THAT card.',
    world.posted.length === 1 && world.posted[0].isUpdate === true && world.posted[0].message.id === 'card-before',
    `Posted ${world.posted.length}; isUpdate=${world.posted[0]?.isUpdate}. A second card would put the question and its answer in two places.`
);

// A DIFFERENT character, because Nik is already accounted for in this burst and the
// dedup would -- correctly -- turn a second arrival away before it reached the card.
reset();
await gm._applyRest({
    actorUuid: 'Actor.Favia', requestId: null, restType: 'long', minutes: 480,
    cardId: 'card-vanished', suppressedSystemCard: true,
    state: cards.buildRestState({ actor: world.actors.get('Actor.Favia'), result: restResult(), config: { type: 'long', duration: 480 } })
});
check(
    'A card deleted mid-rest falls back to posting rather than losing the rest.',
    world.posted.length === 1 && !world.posted[0].isUpdate
);

// ==================================================================
// ===== 7a0. HIT DICE ==============================================
// ==================================================================
//
// Three rules, all chosen deliberately and none of them derivable from the code by
// someone tidying up later:
//   - ONE BUTTON PER DENOMINATION, because hit dice are per class and a multiclass
//     character is allowed to keep the big ones back.
//   - OFFERED ONLY WHEN HURT, and only on a short rest.
//   - ONCE OFFERED, IT STAYS while dice remain -- including at full health.

const hurtActor = (over = {}) => ({
    name: 'Nik', uuid: 'Actor.Nik',
    system: {
        spells: {},
        attributes: {
            hp: { value: over.hp ?? 20, max: 40 },
            hd: { bySize: over.bySize ?? { d10: 3, d6: 2 } },
            exhaustion: 0
        }
    },
    items: { get: () => null }
});

const hdState = (actor, type = 'short') => cards.buildHitDiceState({ actor, config: { type } });

check('A hurt character on a short rest is offered their dice.', hdState(hurtActor())?.offered === true);
check(
    'A character at full health is not.',
    hdState(hurtActor({ hp: 40 })) === null,
    `Spending a die you cannot benefit from is a resource burnt for nothing.`
);
check(
    'Nor is anyone on a LONG rest.',
    hdState(hurtActor(), 'long') === null,
    `A long rest restores hit points outright.`
);
check('Nor a character with no dice left.', hdState(hurtActor({ bySize: { d10: 0 } })) === null);
check(
    'Empty pools are dropped rather than offered as a zero button.',
    JSON.stringify(hdState(hurtActor({ bySize: { d10: 2, d6: 0 } }))?.pools) === '{"d10":2}'
);

const hdParts = (hitDice) => cards.buildHitDiceParts({ hitDice });
const multi = hdParts({ offered: true, pools: { d10: 3, d6: 2 }, spent: [] });
const hdButtons = multi.find((p) => p.part === 'actions')?.buttons ?? [];

check('A multiclass character gets one button per size.', hdButtons.length === 2, `Got ${hdButtons.length}.`);
check('Each naming its die and how many are left.',
    hdButtons[0]?.label === 'Spend d10 (3)' && hdButtons[1]?.label === 'Spend d6 (2)',
    hdButtons.map((b) => b.label).join(', '));
check('The denomination rides on the button, so one handler serves every size.',
    hdButtons[0]?.value === 'd10' && hdButtons[1]?.value === 'd6');
check('A single-class character gets exactly one.',
    hdParts({ offered: true, pools: { d8: 5 }, spent: [] }).find((p) => p.part === 'actions')?.buttons?.length === 1);

const afterSpends = hdParts({
    offered: true, pools: { d10: 1 },
    spent: [{ denomination: 'd10', total: 9, healed: 9 }, { denomination: 'd10', total: 4, healed: 4 }]
});
const spentRows = afterSpends.find((p) => p.part === 'rows')?.items ?? [];
check('Every spend is recorded, in order.', spentRows.length === 2, `Got ${spentRows.length}.`);
check('Each showing what it healed.', spentRows[0]?.trailing === '+9' && spentRows[1]?.trailing === '+4');
check('And the button remains while a die does.',
    afterSpends.find((p) => p.part === 'actions')?.buttons?.length === 1);

// The state says FULL HEALTH explicitly, so this fails if composition ever consults
// hp again. Passing only `hitDice` would leave hp undefined and let a re-derived
// guard slip through on NaN comparisons -- which is exactly what it did at first.
check(
    'THE OFFER SURVIVES REACHING FULL HEALTH.',
    cards.buildHitDiceParts({
        hp: { value: 40, max: 40 },
        hitDice: { offered: true, pools: { d10: 2 }, spent: [{ denomination: 'd10', total: 9, healed: 9 }] }
    }).some((p) => p.part === 'actions'),
    `Composition reads only \`offered\` and the pools -- never current HP -- so a player who heals to full ` +
    `keeps the choice. A control that vanished underneath them would be the card overruling them.`
);
check(
    'It ends when the dice do, not before.',
    !hdParts({ offered: true, pools: { d10: 0 }, spent: [{ denomination: 'd10', total: 6 }] })
        .some((p) => p.part === 'actions')
);
check('A rest that never offered dice composes nothing.', cards.buildHitDiceParts({}).length === 0);

// ==================================================================
// ===== 7a1. FOOD AND WATER READ AS MARKS, NOT SENTENCES ===========
// ==================================================================

const provisionRow = (over) => cards.buildProvisionRows({ exhaustion: 0, dc: 12, ...over })[0];

check('Eating from the pack is a tick.',
    provisionRow({ food: 'ate' })?.trailingIcon?.includes('check'), JSON.stringify(provisionRow({ food: 'ate' })));
check('Foraging successfully is a tick.', provisionRow({ food: 'foraged' })?.trailingIcon?.includes('check'));
check('Going without is a cross.', provisionRow({ food: 'hungry' })?.trailingIcon?.includes('xmark'));
check('Toned to match.',
    provisionRow({ food: 'ate' })?.tone === 'positive' && provisionRow({ food: 'hungry' })?.tone === 'negative');
check(
    'And the words are gone.',
    provisionRow({ food: 'ate' })?.trailing === undefined,
    `A column of marks is read at a glance; a column of phrases has to be parsed row by row.`
);

const owedRow = provisionRow({ food: 'pending' });
check(
    'A check nobody has rolled is NEITHER a tick nor a cross.',
    !/(check|xmark)/.test(owedRow?.trailingIcon ?? ''),
    `Got "${owedRow?.trailingIcon}". Either would claim the question is settled while the button is still waiting.`
);
check('It reads as waiting.', owedRow?.tone === 'pending', String(owedRow?.tone));

check(
    'The one state a mark cannot explain keeps its words.',
    provisionRow({ food: 'unrolled' })?.trailing === 'Could not forage',
    `"We could not roll" is rare and needs saying; a glyph cannot say why.`
);

// The distinction the words used to carry has to survive them.
check(
    'A forager shows their roll; someone who ate from their pack does not.',
    !!provisionRow({ food: 'foraged', roll: { total: 17, dc: 12 } })?.sublabel
        && !provisionRow({ food: 'ate' })?.sublabel,
    `Otherwise "ate a ration" and "foraged" become the same green tick with nothing to tell them apart.`
);

// ==================================================================
// ===== 7a2. THE FORAGING CONTROL ==================================
// ==================================================================
//
// A BUTTON WHILE OWED, A ROW ONCE ANSWERED. Those are two different things -- a
// control and an outcome -- and were being made to share one clickable row that
// repeated the character's name and explained itself in a sublabel.

const forageState = (over) => ({ name: 'Nik', provisions: { food: 'pending', water: 'pending', dc: 12, ...over } });

const owed = cards.buildForageParts(forageState());
const forageButton = owed.find((p) => p.part === 'actions')?.buttons?.[0];

check(
    'There is no "Foraging" heading.',
    !owed.some((p) => p.part === 'section'),
    `It only ever sits directly under the Provisions rows, so it restates the section it is already inside.`
);
check('While owed, foraging offers a button.', forageButton?.action === 'forage', JSON.stringify(forageButton));
check('Carrying a d20, because it opens a roll.', forageButton?.icon?.includes('dice-d20'), forageButton?.icon);
check('One line that says what it does.', forageButton?.label === 'Forage for Food and Water', `Got "${forageButton?.label}".`);
check(
    'NOT primary — it decides nothing until dice land.',
    forageButton?.variant === undefined,
    `Got "${forageButton?.variant}". Matching the rest button's weight would claim they carry the same consequence.`
);
check(
    'The DC is stated while there is still a roll to make.',
    owed.find((p) => p.part === 'subject')?.value === 'DC 12'
);
check('And no result row yet.', !owed.some((p) => p.part === 'rows'));

const answered = cards.buildForageParts(forageState({ food: 'foraged', water: 'foraged', roll: { total: 17, dc: 12 } }));
const resultRow = answered.find((p) => p.part === 'rows')?.items?.[0];

check('Once answered, the button is gone.', !answered.some((p) => p.part === 'actions'));
check('Replaced by the outcome.', resultRow?.trailing === '17', JSON.stringify(resultRow));
check('Labelled by the check, not the character.', resultRow?.label === 'Survival Check', resultRow?.label);
check('Toned and marked as a success.', resultRow?.tone === 'positive' && resultRow?.trailingIcon?.includes('check'));
check(
    'And the DC line is gone, since the row now carries the answer.',
    !answered.some((p) => p.part === 'subject'),
    `A standing "DC 12" above a row labelled the same check says one thing twice.`
);

const failed = cards.buildForageParts(forageState({ food: 'hungry', water: 'hungry', roll: { total: 4, dc: 12 } }));
const failedRow = failed.find((p) => p.part === 'rows')?.items?.[0];
check('A failure reads as one.', failedRow?.tone === 'negative' && failedRow?.sublabel === 'Found nothing');

check('A well-fed character gets no foraging block at all.',
    cards.buildForageParts(forageState({ food: 'ate', water: 'ate' })).length === 0);

// ==================================================================
// ===== 7b. PRESSING REST ==========================================
// ==================================================================
//
// The entry point of the whole flow, and the one place Blacksmith calls into the
// system. What it must NOT do is compute anything: it hands dnd5e a configuration
// and dnd5e applies every rule.

const rested = [];
const restingActor = (owner = true) => ({
    name: 'Nik', uuid: 'Actor.Nik', isOwner: owner,
    system: { spells: {}, attributes: { exhaustion: 0 } },
    items: Object.assign([], { get: () => null, find: () => null }),
    async longRest(config) { rested.push({ method: 'longRest', config }); },
    async shortRest(config) { rested.push({ method: 'shortRest', config }); },
    async update() {}
});

const beforeCard = makeMessage('press-1', {
    'coffee-pub-blacksmith': { rest: cards.buildBeforeState({
        actor: { uuid: 'Actor.Nik', name: 'Nik', system: { attributes: {}, spells: {} } },
        restType: 'long',
        restOptions: { newDay: true, trackFood: true, trackWater: false }
    }) }
});

globalThis.fromUuid = async () => restingActor();
asUser(false);
await player._onRestClicked(beforeCard);

check('Pressing Rest rests the character.', rested.length === 1, `Called ${rested.length} times.`);
check('Through the system, on the right method.', rested[0]?.method === 'longRest', rested[0]?.method);
check('The system dialog is off — the card already asked.', rested[0]?.config?.dialog === false);
check('And so is the system card, because ours is the card.', rested[0]?.config?.chat === false);
check('The GM\'s new-day choice is honoured.', rested[0]?.config?.newDay === true);
check(
    'dnd5e is told NOT to move the clock.',
    rested[0]?.config?.advanceTime === false,
    `Its own advance fires once per character; the grouping in _applyRest knows who is still to rest.`
);
check(
    'The card that was pressed is named, so the result returns to it.',
    rested[0]?.config?.[player.CARD_KEY] === 'press-1',
    `Without it the rest posts a second card and the pre-rest phase was pointless.`
);
check(
    'The rest carries its provision choices.',
    rested[0]?.config?.[player.OPTIONS_KEY]?.trackFood === true
        && rested[0]?.config?.[player.OPTIONS_KEY]?.trackWater === false,
    JSON.stringify(rested[0]?.config?.[player.OPTIONS_KEY])
);

rested.length = 0;
world.warnings.length = 0;
globalThis.fromUuid = async () => restingActor(false);
await player._onRestClicked(beforeCard);
check('Resting a character that is not yours is refused.', rested.length === 0);
check('And says why.', world.warnings.some((m) => /not yours/i.test(m)), JSON.stringify(world.warnings));

rested.length = 0;
globalThis.fromUuid = async () => restingActor();
await player._onRestClicked(makeMessage('done-1', {
    'coffee-pub-blacksmith': { rest: { phase: 'rested', actorUuid: 'Actor.Nik' } }
}));
check(
    'A card that has already reported its rest cannot rest again.',
    rested.length === 0,
    `Otherwise a second click re-rests the character and overwrites the night.`
);

asUser(true);

// ==================================================================
// ===== 7c. A WINDOW REST GROUPS LIKE A SYSTEM REQUEST =============
// ==================================================================
//
// THE HOLE THIS FILE PREVIOUSLY HAD. Last-sleeper grouping was only exercised
// against a two-target dnd5e request, so 60 assertions passed while the flow a
// table actually uses -- the clock menu's Rest window -- had no grouping at all.
// Its rests create no system request, fell through to the 400ms burst timer, and
// moved the clock a full rest per character.
//
// The roster here is the CARDS THAT EXIST, so the world has to hold them.

const windowGm = makeClient();
const REST_ID = 'restgroup01';

world.messages.set('wcard-a', makeMessage('wcard-a', {
    'coffee-pub-blacksmith': { rest: { phase: 'before', restId: REST_ID, actorUuid: 'Actor.Nik' } }
}));
world.messages.set('wcard-b', makeMessage('wcard-b', {
    'coffee-pub-blacksmith': { rest: { phase: 'before', restId: REST_ID, actorUuid: 'Actor.Favia' } }
}));
// A card from a DIFFERENT rest must not inflate this one's roster.
world.messages.set('wcard-other', makeMessage('wcard-other', {
    'coffee-pub-blacksmith': { rest: { phase: 'before', restId: 'someothernight', actorUuid: 'Actor.Nik' } }
}));
globalThis.game.messages.contents = [...world.messages.values()];

const windowRest = (actorUuid, cardId) => ({
    actorUuid, requestId: null, groupId: REST_ID, restType: 'long', minutes: 480,
    systemAdvanced: false, suppressedSystemCard: true, cardId,
    state: cards.buildRestState({
        actor: world.actors.get(actorUuid), result: restResult(), config: { type: 'long', duration: 480 }
    })
});

check(
    'The roster is counted from the cards of THIS rest only.',
    windowGm._expectedFor({ groupId: REST_ID }) === 2,
    `Counted ${windowGm._expectedFor({ groupId: REST_ID })}; a card from another night must not inflate it.`
);

reset();
await windowGm._applyRest(windowRest('Actor.Nik', 'wcard-a'));
check('The first character rests and gets their card.', world.posted.length === 1);
check(
    'THE CLOCK WAITS.',
    world.advanced.length === 0,
    `This is the forty-hour bug: without grouping, each acceptance flushes its own burst and moves the clock a full rest.`
);

reset();
await windowGm._applyRest(windowRest('Actor.Favia', 'wcard-b'));
check('The last character rests.', world.posted.length === 1);
check(
    'And NOW the clock moves, once.',
    world.advanced.length === 1 && world.advanced[0] === 480 * 60,
    `Advanced ${JSON.stringify(world.advanced)}; expected exactly one jump of ${480 * 60} seconds.`
);

reset();
await windowGm._applyRest(windowRest('Actor.Nik', 'wcard-a'));
check('A late arrival for a finished window rest changes nothing.',
    world.posted.length === 0 && world.advanced.length === 0);

// A deleted card leaves the rest with a smaller roster rather than stalling it.
const soloGm2 = makeClient();
world.messages.delete('wcard-b');
globalThis.game.messages.contents = [...world.messages.values()];
reset();
await soloGm2._applyRest(windowRest('Actor.Nik', 'wcard-a'));
check(
    'Deleting a card removes that character from the rest rather than stalling it forever.',
    world.advanced.length === 1,
    `The roster is the cards that exist, so it corrects itself. A count baked in at post time could not.`
);

// ==================================================================
// ===== 7d. ONE CLICK, ONE REST ====================================
// ==================================================================
//
// The card stays `before` until the GM's rewrite lands, which is a socket round
// trip away -- so `isRestPending` still says "not yet" for the whole of it and a
// second click starts a SECOND longRest.

const doubleClickCard = makeMessage('press-2', {
    'coffee-pub-blacksmith': { rest: cards.buildBeforeState({
        actor: { uuid: 'Actor.Nik', name: 'Nik', system: { attributes: {}, spells: {} } },
        restType: 'long', restOptions: {}, restId: REST_ID
    }) }
});

rested.length = 0;

// The deferred is built UP FRONT. Creating it inside longRest would leave nothing to
// release until longRest had already been called -- and the whole point is to hold
// the rest open across the gap before it is, which is where the second click lands.
let releaseRest;
const restHeld = new Promise((resolve) => { releaseRest = resolve; });

globalThis.fromUuid = async () => ({
    ...restingActor(),
    longRest(config) { rested.push({ method: 'longRest', config }); return restHeld; }
});

asUser(false);
const firstClick = player._onRestClicked(doubleClickCard);
const secondClick = player._onRestClicked(doubleClickCard);

// A macrotask, so every pending microtask -- the `fromUuid` await both clicks are
// sitting behind -- has drained and both have reached the guard.
await new Promise((resolve) => setTimeout(resolve, 0));
releaseRest();
await Promise.all([firstClick, secondClick]);

check(
    'A second click while the first rest is in flight does nothing.',
    rested.length === 1,
    `Rested ${rested.length} times. Recovery would apply twice, another ration could go, and the clock could jump again.`
);

check(
    'And the card is released afterwards, so a genuine retry is still possible.',
    !player._restsInFlight.has('press-2'),
    `A guard that never clears turns a failed rest into a permanently dead button.`
);

check(
    'The window rest carries its group id to the GM.',
    rested[0]?.config?.[player.GROUP_KEY] === REST_ID,
    `Without it the GM cannot group, and the clock jumps per character.`
);

asUser(true);
globalThis.fromUuid = async (uuid) => world.actors.get(uuid) ?? null;

// ==================================================================
// ===== 8. THE REST'S OWN PROVISION CHOICE BEATS THE SETTING =======
// ==================================================================

const pantry = () => ({
    name: 'Rich', uuid: 'Actor.Rich',
    system: { spells: {}, attributes: { exhaustion: 0 } },
    items: Object.assign([], {
        get: () => null,
        find(fn) { return [...this].find(fn); }
    }),
    async update() {}
});

world.settings.restTrackFood = true;
world.settings.restTrackWater = true;

const noneWanted = await gm._provision('long', pantry(), { trackFood: false, trackWater: false });
check(
    'A rest that opted out tracks nothing, even with the setting on.',
    noneWanted === undefined,
    `The GM running a night at an inn must not have to change a world setting.`
);

const fromSetting = await gm._provision('long', pantry(), null);
check(
    'A rest that expressed no opinion falls back to the setting.',
    fromSetting !== undefined,
    `A rest started anywhere but our window has no choice of its own.`
);

world.settings.restTrackFood = false;
world.settings.restTrackWater = false;
const optedIn = await gm._provision('long', pantry(), { trackFood: true, trackWater: false });
check(
    'And a rest that opted IN tracks food with the setting off.',
    optedIn !== undefined && optedIn.food !== null,
    JSON.stringify(optedIn)
);
check('A short rest never provisions, whatever was asked for.',
    (await gm._provision('short', pantry(), { trackFood: true, trackWater: true })) === undefined,
    `A short rest is an hour by the tea, not a day's rations.`);

// ==================================================================
// ===== 9. THE WINDOW MUST NOT OVERRIDE THE SYSTEM'S DEFAULTS ======
// ==================================================================
//
// Source-level, because this is markup assembly and needs a DOM to run. The bug it
// guards is silent in the worst way: an unticked box is not a neutral default. The
// window sends `newDay` explicitly on every rest, so an unticked box sends
// `newDay: false` and OVERRIDES dnd5e's own `restTypes.long.newDay: true`
// (`dnd5e.mjs:46457`, defaulted at `dnd5e.mjs:38152`). Daily, dawn and dusk item
// uses only recover when `recoverDailyUses || config.newDay` (`dnd5e.mjs:38542`),
// so an ordinary night quietly skipped every one of them.

const windowSrc = fs.readFileSync(path.join(ROOT, 'scripts/window-rest.js'), 'utf8');

// --- It is a TOOL window, and must not drift back to the full one ---------------
//
// The rest window is a lightweight palette, not a dedicated editor. The tool base
// supplies the entire visual shell -- frame, native title bar, footer, field theming
// -- across three themes, and a consumer's job is body content and nothing else.

check(
    'The rest window extends the TOOL base.',
    /class RestWindow extends BlacksmithToolWindowBaseV2/.test(windowSrc),
    `The five-zone base is for editors and forms; this is a palette.`
);
check(
    'It does not restate PARTS or ROOT_CLASS.',
    !/static PARTS/.test(windowSrc) && !/static ROOT_CLASS/.test(windowSrc),
    `The tool base already points at window-tool-template.hbs and owns the root class. Restating either ` +
    `is the window disagreeing with its own shell.`
);
check(
    'It renders no standard-window template.',
    !/window-template\.hbs/.test(windowSrc)
);
check(
    'It returns the tool zones, not the five-zone keys.',
    /toolFooterLeft/.test(windowSrc) && /toolFooterRight/.test(windowSrc)
        && !/actionBarLeft|showHeader|windowTitle|showOptionBar/.test(windowSrc),
    `The tool shell renders Foundry's native title bar, so there is no header zone to fill.`
);
// Matched inside a `class="..."` rather than anywhere in the file: the header comment
// explains WHY the component is not used, and a bare substring test flagged the
// explanation as the offence.
check(
    'And it does NOT borrow `.blacksmith-window-section`.',
    !/class="[^"]*blacksmith-window-section/.test(windowSrc),
    `That component belongs to the five-zone window and paints rgba(0,0,0,0.35) -- a black panel on the ` +
    `tool frame's light parchment theme.`
);

const restCss = fs.readFileSync(path.join(ROOT, 'styles/window-rest.css'), 'utf8');
check(
    'Its stylesheet themes with the shell rather than against it.',
    /--blacksmith-tool-/.test(restCss),
    `The tool frame has light, dark and glass themes; a hardcoded colour is right in at most one.`
);
check(
    'And every rule is scoped to this window.',
    !/^\.(?!blacksmith-rest-tool-window)[a-z-]+\s*[,{]/m.test(restCss),
    `An unscoped rule from a tool window leaks onto every other consumer of the shared shell.`
);

check(
    'The window reads the system\'s own long-rest configuration.',
    /CONFIG\.DND5E\?\.restTypes\?\.long/.test(windowSrc),
    `Hardcoding these -- in either direction -- makes the window disagree with the system it is driving.`
);

// Asserted per OPTION rather than against one exact line, because the line's shape is
// nobody's contract: refactoring three reads into a shared `restConfig` local broke
// the previous spelling-matched assertion while the behaviour was untouched.
for (const option of ['newDay', 'recoverTemp', 'recoverTempMax']) {
    check(
        `\`${option}\` defaults from the system, not a literal.`,
        new RegExp(`const ${option} = restConfig\\.${option} === true;`).test(windowSrc),
        `The window sends its config explicitly, so an unticked box is not neutral -- it is \`false\`, sent deliberately.`
    );
}

for (const [option, field] of [['newDay', 'rest-new-day'], ['recoverTemp', 'rest-recover-temp'], ['recoverTempMax', 'rest-recover-temp-max']]) {
    check(
        `And the ${field} checkbox reflects it.`,
        new RegExp(`name="${field}"[^>]*\\$\\{${option} \\? 'checked' : ''\\}`).test(windowSrc),
        `Computing the default and then not rendering it is the same bug with extra steps.`
    );
}

check(
    'The hit point options are long-rest only, and hidden otherwise.',
    /blacksmith-rest-hitpoints/.test(windowSrc)
        && /LONG_REST_ONLY[\s\S]*?\][\s\S]{0,200}/.test(windowSrc)
        && /const LONG_REST_ONLY = \[[^\]]*blacksmith-rest-hitpoints/.test(windowSrc),
    `\`restTypes.short\` declares neither, so leaving them visible offers a GM a control that does nothing.`
);
check(
    'Hit dice are the SHORT rest\'s business, and hidden on a long one.',
    /const SHORT_REST_ONLY = \[[^\]]*blacksmith-rest-shortrest/.test(windowSrc),
    `A long rest restores hit points outright, so spending dice on one burns a resource for nothing.`
);
check(
    'New Day belongs to BOTH rests.',
    !/const LONG_REST_ONLY = \[[^\]]*blacksmith-rest-new-day/.test(windowSrc),
    `A short rest can start a new day -- a night watch broken by an hour's rest at dawn -- so only the ` +
    `DEFAULT differs, never the availability.`
);
check(
    'And its default follows the chosen rest type.',
    /CONFIG\.DND5E\?\.restTypes\?\.\[?lastType\]?\?\.newDay === true/.test(windowSrc),
    `dnd5e sets it for a long rest and not for a short one; switching type must follow that.`
);
check(
    'New Day is submitted as the GM left it, not gated on rest type.',
    /newDay: root\.querySelector\('\[name="rest-new-day"\]'\)\?\.checked === true/.test(windowSrc),
    `Gating it on \`isLong\` would silently discard a short rest's new day.`
);

check(
    'Selected tokens decide who starts ticked.',
    /getSelectedActors\(\)/.test(windowSrc) && /selected\.size === 0\) \|\| selected\.has/.test(windowSrc),
    `A GM who picked tokens out has already said who is resting; no selection means everybody, ` +
    `because an untouched canvas is not a request to rest nobody.`
);
check(
    'And a selected actor the party list does not know about still joins the roster.',
    /for \(const actor of this\.getSelectedActors\(\)\)/.test(windowSrc),
    `An NPC ally resting with the group is exactly the case the primary party misses.`
);
check(
    'Vehicles are left out, because dnd5e refuses to rest them.',
    /isVehicle/.test(windowSrc)
);
check(
    'Every posted card shares one rest id.',
    /const restId = foundry\.utils\.randomID\(\);/.test(windowSrc)
        && /postBeforeCard\(\{[^}]*restId[^}]*\}\)/.test(windowSrc),
    `Without a shared id each acceptance looks like a lone character and the clock jumps per person.`
);

// --- The hit die roll must not post a card, and must show our dice ---------------
const restSrc = fs.readFileSync(path.join(ROOT, 'scripts/manager-rest.js'), 'utf8');

check(
    'Spending a hit die posts NO system roll card.',
    /rollHitDie\(\{ denomination \}, \{\}, \{ create: false \}\)/.test(restSrc),
    `A party of five buries the card they are reading under twenty roll messages, leaving the answer ` +
    `somewhere above the scroll.`
);
check(
    'And the dice are shown through OUR roll API instead.',
    /RollsAPI\.showDice\(rolls\)/.test(restSrc),
    `Foundry has no 3D dice of its own; suppressing the card without showing them leaves a button that ` +
    `makes a number appear.`
);

// SCANNED ACROSS THE WHOLE MODULE, not one file. Two call sites existed and they
// DISAGREED: the roll pipeline honoured the world's Dice So Nice setting and
// `rollCoffeePubDice` did not, so a table that had switched dice off still got them
// from the toolbar. Checking a single file would not have found that.
const scriptFiles = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: `scripts/${f}`, text: fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8') }));

// Counted as CALLS, not files. Counting files would let a second call slip in beside
// the first -- which it did, the first time this was written.
const showForRollSites = scriptFiles
    .flatMap((f) => (f.text.match(/game\.dice3d\.showForRoll\(/g) ?? []).map(() => f.name));

check(
    'The module talks to Dice So Nice in exactly one place.',
    showForRollSites.length === 1 && showForRollSites[0] === 'scripts/api-core.js',
    `Found ${showForRollSites.length} call(s) in: ${[...new Set(showForRollSites)].join(', ') || 'nowhere'}. ` +
    `A second call site is a second place to forget the setting, the guard, or the try/catch -- and the ` +
    `two that existed disagreed about the setting.`
);

const coreSrc = fs.readFileSync(path.join(ROOT, 'scripts/api-core.js'), 'utf8');
check(
    'And that one place honours the table\'s Dice So Nice setting.',
    /showDiceAnimation[\s\S]*?diceRollToolEnableDiceSoNice/.test(coreSrc),
    `A table that has turned dice off must not get them anyway.`
);
check(
    'The formula wrapper delegates rather than animating itself.',
    /rollCoffeePubDice[\s\S]{0,400}?return showDiceAnimation\(roll\);/.test(coreSrc),
    `It used to call showForRoll directly, and skipped the setting doing it.`
);

// ==================================================================
// ===== REPORT =====================================================
// ==================================================================

if (problems.length > 0) {
    console.error(`Rest client-split check FAILED (${problems.length} of ${checks}):\n`);
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
}

console.log(`Rest client-split check passed (${checks} assertions): player-accepted rests reach the GM, ` +
    `one card carries both phases, our card completes a system request, socket handlers survive startup ` +
    `order, a rest's own provision choice beats the setting, and spent hit dice are not reported as recovered.`);
