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
    .split('\n')
    .filter((l) => !/^import\s/.test(l))
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

globalThis.CONFIG = { DND5E: { conditionTypes: { exhaustion: { levels: 6 } } } };
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
    return { buildRestState, postRestCardFromState, updateRestCard, isForagePending, buildRecoveryRows };`)();

const REST_PREAMBLE = `
    const MODULE = { ID: 'coffee-pub-blacksmith', NAME: 'Blacksmith' };
    const postConsoleAndNotification = () => {};
    const getSettingSafely = (m, k, d) => (k in globalThis.__world.settings ? globalThis.__world.settings[k] : d);
    const HookManager = { registerHook: () => {} };
    const ChatCardsAPI = globalThis.__ChatCardsAPI;
    const { buildRestState, postRestCardFromState, updateRestCard, isForagePending } = globalThis.__cards;

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
    `(dnd5e.mjs:79669). Suppress the system card without it and the character can rest all night.`
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
    `Got "${diceRow?.label}". dnd5e flips the sign for display (dnd5e.mjs:35016) because the dice were burnt.`
);
check('Counted as a positive number of dice.', diceRow?.trailing === '2', `Got "${diceRow?.trailing}".`);
check(
    'And not toned as a gain.',
    diceRow?.tone !== 'positive',
    `Filing a negative delta under Recovered toned positive says the character gained dice they just spent.`
);
check('The span still reads the right way round.', diceRow?.sublabel === '5 → 3', `Got "${diceRow?.sublabel}".`);

const longRows = cards.buildRecoveryRows(
    { system: { spells: {}, attributes: { hd: { value: 5 }, exhaustion: 0 } }, items: { get: () => null } },
    { deltas: { hitPoints: 0, hitDice: 2 }, clone: { system: { spells: {}, attributes: {} } }, updateItems: [] }
);
const longDice = longRows.find((r) => /Hit Dice/.test(r.label));
check('A long rest still recovers them.', longDice?.label === 'Hit Dice' && longDice?.trailing === '+2');
check('Toned as a gain.', longDice?.tone === 'positive');

// ==================================================================
// ===== REPORT =====================================================
// ==================================================================

if (problems.length > 0) {
    console.error(`Rest client-split check FAILED (${problems.length} of ${checks}):\n`);
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
}

console.log(`Rest client-split check passed (${checks} assertions): player-accepted rests reach the GM, ` +
    `our card completes the request, socket handlers survive startup order, provisions respect uses, ` +
    `and spent hit dice are not reported as recovered.`);
