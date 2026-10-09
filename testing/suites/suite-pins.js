// ==================================================================
// ===== SUITE: Pin links and relinking =============================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO -- it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead.
//
// Contract:       documentation/api/api-pins.md (taxonomy `target`, `copyable`,
//                 `relinkable`, `relinkScope`; the `relinked` event)
// Implementation: scripts/manager-pins.js (taxonomy normalising and merging,
//                 resolvePinTarget, findRelinkCandidates, relinkPin)
//
// WHAT THIS SUITE IS FOR. The pins' link machinery is pure logic wrapped around a
// few Foundry lookups, and it is the part a refactor breaks silently: a declaration
// dropped by the merge, a search that ranks a name above an id, a relink that
// writes the wrong key or fires nothing. The windows are not covered here; they
// stay in testing/verification-queue.md because a person has to look at them.
//
// WHAT IT TOUCHES. It creates UNPLACED pins (no scene, no canvas needed) under the
// module id `zz-harness-pins`, and temporary world journals, and removes both in a
// finally block. Taxonomy registrations are in-memory and last until the client
// reloads; each check uses a type name carrying a random suffix, so none can
// collide, and they affect no real pin. A few checks read the real Blacksmith
// declarations (`journal-pin`, `note`) and never write them.
//
// GM ONLY. Creating journals and unplaced pins is a GM write.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const MODULE_ID = 'coffee-pub-blacksmith';
const PROBE_MODULE = 'zz-harness-pins';

/** A type name no real pin can share, so a registration here can never touch one. */
function probeType(label) {
    return `zz-${label}-${foundry.utils.randomID(6).toLowerCase()}`;
}

/** The manager, for the helpers the API does not expose (resolvePinTarget, findRelinkCandidates, ...). */
async function manager() {
    const { PinManager } = await import('../../scripts/manager-pins.js');
    return PinManager;
}

/** A UUID that names a page of a journal that does not exist. */
function deadPageUuid(pageId = foundry.utils.randomID(16)) {
    return `JournalEntry.${foundry.utils.randomID(16)}.JournalEntryPage.${pageId}`;
}

/** Create a pin that is not on any scene. Returns the pin the API reports. */
async function makePin(api, { type, text = 'Probe pin', config = {} }) {
    return api.pins.create({ id: foundry.utils.randomID(16), moduleId: PROBE_MODULE, type, text, config });
}

/** Remove whatever a check made. Each step is independent so one failure cannot strand the rest. */
async function cleanup(api, { pins = [], journals = [] } = {}) {
    for (const id of pins) {
        try { await api.pins.delete(id); } catch (_) { /* already gone */ }
    }
    for (const journal of journals) {
        try { await journal?.delete(); } catch (_) { /* already gone */ }
    }
}

function requireGM() {
    if (!game.user?.isGM) throw new Error('GM only -- the checks create journals and pins.');
}

/** Unplaced pins a failed run left behind. */
function leftoverPins(api) {
    try {
        return (api.pins.list({ unplacedOnly: true }) ?? []).filter(p => p.moduleId === PROBE_MODULE).length;
    } catch (_) {
        return 0;
    }
}

export default {
    id: 'pins',
    label: 'Pins',
    icon: 'fa-solid fa-map-pin',

    settings: () => [
        settingRow('running as', game.user?.isGM ? 'GM' : 'player',
            game.user?.isGM ? null : 'Checks refuse to run -- they create journals and pins.'),
        settingRow('api.pins', game.modules.get(MODULE_ID)?.api?.pins ? 'present' : 'missing'),
        settingRow('leftover probe pins',
            game.modules.get(MODULE_ID)?.api?.pins ? leftoverPins(game.modules.get(MODULE_ID).api) : 'n/a',
            'Should be 0. Anything else is a check that failed mid-run.')
    ],

    checks: [
        // ---------------------------------------------------------------- declarations
        {
            id: 'declarations-default-off',
            label: 'A taxonomy entry that declares nothing is not copyable, not relinkable, has no target',
            tier: 'headless',
            group: 'Taxonomy declarations',
            note: 'Opting in is the whole point: an undeclared type must be refused, never assumed.',
            run: async ({ api, expect }) => {
                requireApi('pins.registerPinTaxonomy', 'pins.getPinTaxonomy');
                const type = probeType('plain');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, { label: 'Plain', tags: [] });
                const entry = api.pins.getPinTaxonomy(PROBE_MODULE, type);
                expect('copyable is false', entry.copyable, false);
                expect('relinkable is false', entry.relinkable, false);
                expect('relinkScope is any', entry.relinkScope, 'any');
                expect('target is empty', entry.target, []);
            }
        },
        {
            id: 'declarations-read-back',
            label: 'Declared copyable, relinkable, relinkScope and target read back, by type and by module',
            tier: 'headless',
            group: 'Taxonomy declarations',
            run: async ({ api, expect }) => {
                requireApi('pins.registerPinTaxonomy', 'pins.getPinTaxonomy', 'pins.getModuleTaxonomy');
                const type = probeType('declared');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, {
                    label: 'Declared', tags: [], copyable: true, relinkable: true, relinkScope: 'world', target: ['first', 'second']
                });
                const entry = api.pins.getPinTaxonomy(PROBE_MODULE, type);
                expect('copyable', entry.copyable, true);
                expect('relinkable', entry.relinkable, true);
                expect('relinkScope', entry.relinkScope, 'world');
                expect('target keeps its order', entry.target, ['first', 'second']);
                const byModule = api.pins.getModuleTaxonomy(PROBE_MODULE)[type];
                expect('getModuleTaxonomy carries every declaration',
                    [byModule?.copyable, byModule?.relinkable, byModule?.relinkScope, byModule?.target],
                    [true, true, 'world', ['first', 'second']]);
            }
        },
        {
            id: 'declarations-junk-ignored',
            label: 'A declaration of the wrong shape is ignored, not coerced into permission',
            tier: 'headless',
            group: 'Taxonomy declarations',
            note: 'A string "yes" must not make a type copyable, and an unknown scope must not narrow a search.',
            run: async ({ api, expect }) => {
                requireApi('pins.registerPinTaxonomy', 'pins.getPinTaxonomy');
                const type = probeType('junk');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, {
                    label: 'Junk', tags: [], copyable: 'yes', relinkable: 1, relinkScope: 'moon', target: 7
                });
                const entry = api.pins.getPinTaxonomy(PROBE_MODULE, type);
                expect('copyable stays false', entry.copyable, false);
                expect('relinkable stays false', entry.relinkable, false);
                expect('relinkScope stays any', entry.relinkScope, 'any');
                expect('target stays empty', entry.target, []);
            }
        },
        {
            id: 'declarations-merge-layers',
            label: 'A later layer that omits a declaration does not undo it; an explicit false does',
            tier: 'headless',
            group: 'Taxonomy declarations',
            note: 'The user override JSON is a later layer. Omitting copyable there must not switch off what a module declared.',
            run: async ({ expect }) => {
                const PM = await manager();
                const declared = PM._normalizeTaxonomyEntry(PROBE_MODULE, 't', {
                    label: 'A', tags: [], copyable: true, relinkable: true, relinkScope: 'world', target: ['k']
                });
                const silent = PM._normalizeTaxonomyEntry(PROBE_MODULE, 't', { label: 'B', tags: [] });
                const refused = PM._normalizeTaxonomyEntry(PROBE_MODULE, 't', { copyable: false, relinkable: false });
                const kept = PM._mergeTaxonomyEntries(declared, silent);
                expect('omission keeps copyable', kept.copyable, true);
                expect('omission keeps relinkable', kept.relinkable, true);
                expect('omission keeps relinkScope', kept.relinkScope, 'world');
                expect('omission keeps target', kept.target, ['k']);
                expect('the later label still wins', kept.label, 'B');
                const off = PM._mergeTaxonomyEntries(declared, refused);
                expect('explicit false switches copyable off', off.copyable, false);
                expect('explicit false switches relinkable off', off.relinkable, false);
            }
        },
        {
            id: 'declarations-blacksmith-own',
            label: 'Blacksmith declares journal pins copyable, relinkable and linked; notes linked only',
            tier: 'headless',
            group: 'Taxonomy declarations',
            note: 'Blacksmith is consumer zero: its own types go through the same declarations a satellite uses.',
            run: async ({ api, expect }) => {
                requireApi('pins.getModuleTaxonomy');
                const mine = api.pins.getModuleTaxonomy(MODULE_ID);
                expect('journal-pin copyable', mine['journal-pin']?.copyable, true);
                expect('journal-pin relinkable', mine['journal-pin']?.relinkable, true);
                expect('journal-pin target', mine['journal-pin']?.target, ['journalPageUuid', 'journalUuid']);
                expect('note target', mine.note?.target, ['noteUuid']);
                expect('note is not copyable', mine.note?.copyable, false);
                expect('note is not relinkable', mine.note?.relinkable, false);
            }
        },

        // ---------------------------------------------------------------- resolving a link
        {
            id: 'resolve-four-states',
            label: 'resolvePinTarget tells linked, broken, unlinked and untracked apart',
            tier: 'headless',
            group: 'Resolving a link',
            note: 'Untracked (the type declares no target) must never read as broken, or every pin of such a type would be flagged.',
            run: async ({ api, expect }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy');
                const PM = await manager();
                const journal = await JournalEntry.create({ name: `Probe ${foundry.utils.randomID(4)}`, pages: [{ name: 'Page', type: 'text' }] });
                try {
                    const tracked = probeType('tracked');
                    const plain = probeType('untracked');
                    api.pins.registerPinTaxonomy(PROBE_MODULE, tracked, { label: 'Tracked', tags: [], target: ['firstKey', 'secondKey'] });
                    api.pins.registerPinTaxonomy(PROBE_MODULE, plain, { label: 'Plain', tags: [] });
                    const pin = (type, config) => ({ moduleId: PROBE_MODULE, type, config });
                    const page = journal.pages.contents[0];

                    const linked = await PM.resolvePinTarget(pin(tracked, { firstKey: page.uuid }));
                    expect('a live link is not broken', linked.broken, false);
                    expect('a live link is declared', linked.declared, true);
                    expect('a live link resolves to the page', linked.doc?.id, page.id);
                    expect('a live link names the key that held it', linked.key, 'firstKey');

                    const broken = await PM.resolvePinTarget(pin(tracked, { firstKey: deadPageUuid() }));
                    expect('a dead link is broken', broken.broken, true);
                    expect('a dead link keeps its uuid', typeof broken.uuid, 'string');

                    const unlinked = await PM.resolvePinTarget(pin(tracked, {}));
                    expect('a declared type with no link is declared', unlinked.declared, true);
                    expect('a declared type with no link has no uuid', unlinked.uuid, null);
                    expect('a declared type with no link is not broken', unlinked.broken, false);

                    const untracked = await PM.resolvePinTarget(pin(plain, { firstKey: deadPageUuid() }));
                    expect('an undeclared type is not declared', untracked.declared, false);
                    expect('an undeclared type is never broken', untracked.broken, false);

                    const second = await PM.resolvePinTarget(pin(tracked, { secondKey: page.uuid }));
                    expect('the first key present wins, so a later key is found when the first is empty', second.key, 'secondKey');
                } finally {
                    await cleanup(api, { journals: [journal] });
                }
            }
        },

        // ---------------------------------------------------------------- relink search
        {
            id: 'candidates-ranking',
            label: 'World candidates rank a matching id above an exact name above a similar name, and drop the rest',
            tier: 'headless',
            group: 'Relink search',
            note: 'The pin keeps its dead UUID and its text. Those are the only clues the search has.',
            run: async ({ api, expect, log }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy');
                const PM = await manager();
                const nonce = foundry.utils.randomID(6).toLowerCase();
                const text = `Probe Alpha ${nonce}`;
                const deadId = foundry.utils.randomID(16);
                const type = probeType('search');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, { label: 'Search', tags: [], target: ['docUuid'], relinkable: true });

                const journal = await JournalEntry.create({
                    name: `Probe Journal ${nonce}`,
                    pages: [
                        { name: text, type: 'text' },
                        { name: `${text} Extended`, type: 'text' },
                        { name: `Probe Beta ${nonce}`, type: 'text' }
                    ]
                });
                const mover = await JournalEntry.create({ name: `Probe Mover ${nonce}`, pages: [] });
                try {
                    // The same page id, living elsewhere under another name: the document was moved
                    await mover.createEmbeddedDocuments('JournalEntryPage',
                        [{ _id: deadId, name: 'Totally Different', type: 'text' }], { keepId: true });

                    const pin = { moduleId: PROBE_MODULE, type, text, config: { docUuid: deadPageUuid(deadId) } };
                    const found = await PM.findRelinkCandidates(pin, { sources: 'world' });
                    log(`kind ${found.kind}; ${found.candidates.map(c => `${c.name} (${c.reason})`).join(' | ')}`);

                    expect('the kind is read from the dead uuid', found.kind, 'JournalEntryPage');
                    expect('candidates come in rank order',
                        found.candidates.map(c => c.reason),
                        ['Same ID', 'Same name', 'Similar name']);
                    expect('the moved page leads despite its name', found.candidates[0]?.name, 'Totally Different');
                    expect('an unrelated name is not offered', found.candidates.some(c => c.name === `Probe Beta ${nonce}`), false);
                    expect('every candidate is a world document', found.candidates.every(c => c.origin === 'world'), true);
                } finally {
                    await cleanup(api, { journals: [journal, mover] });
                }
            }
        },
        {
            id: 'candidates-world-only-scope',
            label: 'A relinkScope "world" type is searched in the world even when compendiums are asked for',
            tier: 'headless',
            group: 'Relink search',
            note: 'Merchant, codex and quest records exist only as world documents; a compendium has nothing for them.',
            run: async ({ api, expect }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy');
                const PM = await manager();
                const type = probeType('worldonly');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, {
                    label: 'World only', tags: [], target: ['docUuid'], relinkable: true, relinkScope: 'world'
                });
                const pin = { moduleId: PROBE_MODULE, type, text: `Nothing ${foundry.utils.randomID(6)}`, config: { docUuid: deadPageUuid() } };
                const found = await PM.findRelinkCandidates(pin, { sources: 'compendiums' });
                expect('compendiums asked for, world searched', found.sources, 'world');
            }
        },
        {
            id: 'candidates-no-link-no-kind',
            label: 'A pin with no link, or of an untracked type, has nothing to search for',
            tier: 'headless',
            group: 'Relink search',
            run: async ({ api, expect }) => {
                requireApi('pins.registerPinTaxonomy');
                const PM = await manager();
                const tracked = probeType('nolink');
                api.pins.registerPinTaxonomy(PROBE_MODULE, tracked, { label: 'No link', tags: [], target: ['docUuid'] });
                const none = await PM.findRelinkCandidates({ moduleId: PROBE_MODULE, type: tracked, text: 'x', config: {} }, { sources: 'world' });
                expect('no link, no kind', none.kind, null);
                expect('no link, no candidates', none.candidates, []);
                const plain = await PM.findRelinkCandidates({ moduleId: PROBE_MODULE, type: probeType('plain'), text: 'x', config: { docUuid: deadPageUuid() } }, { sources: 'world' });
                expect('an untracked type has no kind', plain.kind, null);
            }
        },

        // ---------------------------------------------------------------- relinking
        {
            id: 'relink-refusals',
            label: 'relinkPin refuses a type that is not relinkable, a missing document, and the wrong kind',
            tier: 'headless',
            group: 'Relinking',
            note: 'Every refusal must leave the pin exactly as it was.',
            run: async ({ api, expect }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy', 'pins.create', 'pins.get');
                const PM = await manager();
                const closed = probeType('closed');
                const open = probeType('open');
                api.pins.registerPinTaxonomy(PROBE_MODULE, closed, { label: 'Closed', tags: [], target: ['docUuid'] });
                api.pins.registerPinTaxonomy(PROBE_MODULE, open, { label: 'Open', tags: [], target: ['docUuid'], relinkable: true });
                const journal = await JournalEntry.create({ name: `Probe ${foundry.utils.randomID(4)}`, pages: [{ name: 'Page', type: 'text' }] });
                const pins = [];
                try {
                    const page = journal.pages.contents[0];
                    const dead = deadPageUuid();
                    const closedPin = await makePin(api, { type: closed, config: { docUuid: dead } });
                    const openPin = await makePin(api, { type: open, config: { docUuid: dead } });
                    const unlinkedPin = await makePin(api, { type: open, config: {} });
                    pins.push(closedPin.id, openPin.id, unlinkedPin.id);

                    await expect.throws('a type that is not relinkable is refused', () => PM.relinkPin(closedPin.id, page.uuid));
                    await expect.throws('a pin with no link has nothing to repair', () => PM.relinkPin(unlinkedPin.id, page.uuid));
                    await expect.throws('a document that does not exist is refused', () => PM.relinkPin(openPin.id, deadPageUuid()));
                    await expect.throws('a whole journal is refused for a page link', () => PM.relinkPin(openPin.id, journal.uuid));
                    expect('every refusal left the link as it was', api.pins.get(openPin.id).config.docUuid, dead);
                    expect('the refused closed pin is untouched', api.pins.get(closedPin.id).config.docUuid, dead);
                } finally {
                    await cleanup(api, { pins, journals: [journal] });
                }
            }
        },
        {
            id: 'relink-writes-and-announces',
            label: 'relinkPin rewrites only the key that held the link, and fires relinked with the batch flags',
            tier: 'headless',
            group: 'Relinking',
            note: 'A satellite repairs what it keeps from this payload, so the key, both uuids and the batch flags have to be right.',
            run: async ({ api, expect }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy', 'pins.create', 'pins.get', 'pins.on');
                const PM = await manager();
                const type = probeType('relink');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, { label: 'Relink', tags: [], target: ['docUuid'], relinkable: true });
                const journal = await JournalEntry.create({
                    name: `Probe ${foundry.utils.randomID(4)}`,
                    pages: [{ name: 'One', type: 'text' }, { name: 'Two', type: 'text' }]
                });
                const events = [];
                const hookCalls = [];
                const off = api.pins.on('relinked', (event) => events.push(event), { moduleId: PROBE_MODULE });
                const hookId = Hooks.on('blacksmith.pins.relinked', (payload) => hookCalls.push(payload));
                const pins = [];
                try {
                    const [one, two] = journal.pages.contents;
                    const dead = deadPageUuid();
                    const pin = await makePin(api, { type, config: { docUuid: dead, kept: 'yes' } });
                    pins.push(pin.id);

                    await PM.relinkPin(pin.id, one.uuid);
                    let now = api.pins.get(pin.id);
                    expect('the link key now holds the new page', now.config.docUuid, one.uuid);
                    expect('other config keys survive', now.config.kept, 'yes');
                    expect('the registered handler heard it once', events.length, 1);
                    expect('payload names the key', events[0]?.key, 'docUuid');
                    expect('payload carries the old uuid', events[0]?.oldUuid, dead);
                    expect('payload carries the new uuid', events[0]?.newUuid, one.uuid);
                    expect('a single relink is interactive', events[0]?.interactive, true);
                    expect('the Hook fired too', hookCalls.length, 1);

                    // The pin is not broken now, so repair it again by breaking it: batch flags ride along
                    await api.pins.update(pin.id, { config: { ...now.config, docUuid: deadPageUuid() } });
                    await PM.relinkPin(pin.id, two.uuid, { interactive: false, renameToMatch: true });
                    now = api.pins.get(pin.id);
                    expect('a batch relink writes the new page', now.config.docUuid, two.uuid);
                    expect('a batch relink says it is not interactive', events[1]?.interactive, false);
                    expect('a batch relink passes renameToMatch', events[1]?.renameToMatch, true);
                } finally {
                    off?.();
                    Hooks.off('blacksmith.pins.relinked', hookId);
                    await cleanup(api, { pins, journals: [journal] });
                }
            }
        },
        {
            id: 'relink-page-resolves-to-journal',
            label: 'A page given where a journal is wanted relinks to that page\'s journal',
            tier: 'headless',
            group: 'Relinking',
            note: 'The case that produced an endless refusal loop: a page dragged out of an open journal for a whole-journal pin.',
            run: async ({ api, expect }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy', 'pins.create', 'pins.get');
                const PM = await manager();
                const type = probeType('journalpin');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, { label: 'Journal link', tags: [], target: ['docUuid'], relinkable: true });
                const journal = await JournalEntry.create({ name: `Probe ${foundry.utils.randomID(4)}`, pages: [{ name: 'Page', type: 'text' }] });
                const pins = [];
                try {
                    const pin = await makePin(api, { type, config: { docUuid: `JournalEntry.${foundry.utils.randomID(16)}` } });
                    pins.push(pin.id);
                    await PM.relinkPin(pin.id, journal.pages.contents[0].uuid);
                    expect('the pin now points at the journal, not the page', api.pins.get(pin.id).config.docUuid, journal.uuid);
                } finally {
                    await cleanup(api, { pins, journals: [journal] });
                }
            }
        },
        {
            id: 'relink-world-only-refuses-compendium',
            label: 'A relinkScope "world" type refuses a compendium document',
            tier: 'headless',
            group: 'Relinking',
            note: 'Needs one Actor compendium with an entry; skips when the world has none.',
            run: async ({ api, expect, log }) => {
                requireGM();
                requireApi('pins.registerPinTaxonomy', 'pins.create', 'pins.get');
                const PM = await manager();
                const pack = game.packs.find(p => p.documentName === 'Actor' && p.index.size > 0)
                    ?? game.packs.find(p => p.documentName === 'Actor');
                const entry = pack ? (pack.index.contents[0] ?? (await pack.getIndex()).contents[0]) : null;
                if (!entry) {
                    log('no Actor compendium with an entry; nothing to refuse');
                    expect.ok('skipped: no Actor compendium available', true);
                    return;
                }
                const type = probeType('worldactor');
                api.pins.registerPinTaxonomy(PROBE_MODULE, type, {
                    label: 'World actor', tags: [], target: ['docUuid'], relinkable: true, relinkScope: 'world'
                });
                const pins = [];
                try {
                    const dead = `Actor.${foundry.utils.randomID(16)}`;
                    const pin = await makePin(api, { type, config: { docUuid: dead } });
                    pins.push(pin.id);
                    let message = '';
                    try {
                        await PM.relinkPin(pin.id, entry.uuid);
                    } catch (error) {
                        message = String(error?.message ?? error);
                    }
                    log(`refused with: ${message || '(it was accepted)'}`);
                    expect.ok('the compendium actor was refused, and the reason names the world', /world/i.test(message));
                    expect('the pin still holds its old link', api.pins.get(pin.id).config.docUuid, dead);
                } finally {
                    await cleanup(api, { pins });
                }
            }
        }
    ]
};
