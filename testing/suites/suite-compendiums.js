// ==================================================================
// ===== SUITE: api.compendiums.search ==============================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste utilities/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-compendiums.md
// Implementation: scripts/manager-compendiums.js (search), scripts/api-compendiums.js
//
// Every check DERIVES ITS FIXTURE FROM THE LIVE WORLD rather than naming
// "Longsword" and hoping. The suite has to pass in any world with an Item
// mapping configured, and a hard-coded name would fail loudly in a world
// that simply uses different content — which trains the reader to ignore
// failures, the exact opposite of what a harness is for.
//
// The interesting assertions are the three DELIBERATE differences from
// resolve(), because a future reader will otherwise "fix" them back:
//   - ordering is source-then-tier, not tier-then-source
//   - fuzzy defaults ON
//   - itemType filters strictly instead of preferring-with-fallback
// The last one is asserted against a subtype that CANNOT exist, which
// separates the two semantics with no dependence on world content:
// filtering returns nothing, preferring falls back to everything.
// ==================================================================

import { requireApi, settingRow } from './harness-lib.js';

const TIER_RANK = { exact: 0, startsWith: 1, includes: 2 };
const RESULT_KEYS = ['uuid', 'name', 'type', 'documentClass', 'img', 'source', 'sourceLabel', 'sourcePackage', 'matchType'];

/** A subtype no system defines, used to tell "filter" from "prefer". */
const IMPOSSIBLE_SUBTYPE = 'blacksmith-harness-no-such-subtype';

/** A query no content contains. */
const IMPOSSIBLE_QUERY = 'zzqqxxvv-no-such-thing';

/**
 * First mapped Item pack that has a usable entry, plus its raw index.
 * The raw index is kept so `img` can be asserted against the source of truth
 * rather than merely "is a non-empty string".
 */
async function itemFixture() {
    const { compendiums } = requireApi('compendiums', 'compendiums.search');
    for (const packId of compendiums.getSelected('Item')) {
        const pack = game.packs.get(packId);
        if (!pack) continue;
        const index = Array.from(await pack.getIndex());
        const entry = index.find(e => typeof e.name === 'string' && e.name.trim().length >= 4);
        if (entry) return { compendiums, packId, pack, index, entry };
    }
    return null;
}

/** Consecutive results sharing a source, in the order search() returned them. */
function sourceRuns(results) {
    const runs = [];
    for (const result of results) {
        const last = runs[runs.length - 1];
        if (last?.source === result.source) last.items.push(result);
        else runs.push({ source: result.source, items: [result] });
    }
    return runs;
}

/** Whether `subset` appears inside `sequence` in the same relative order. */
function isOrderedSubsequence(subset, sequence) {
    let cursor = 0;
    for (const value of subset) {
        cursor = sequence.indexOf(value, cursor);
        if (cursor === -1) return false;
        cursor += 1;
    }
    return true;
}

export default {
    id: 'compendiums',
    label: 'Compendium Search',
    icon: 'fa-solid fa-magnifying-glass',

    settings: () => {
        const compendiums = game.modules.get('coffee-pub-blacksmith')?.api?.compendiums;
        if (!compendiums) return [settingRow('api.compendiums', 'MISSING')];
        let order = [];
        try {
            order = compendiums.getSearchOrder('Item');
        } catch (error) {
            order = [`threw: ${error.message}`];
        }
        return [
            settingRow('api.compendiums.search', typeof compendiums.search === 'function' ? 'available' : 'MISSING'),
            settingRow('Item search order', order.length ? order.join(' -> ') : 'NONE — map an Item compendium first',
                'sources in configured priority order'),
            settingRow('World Items', String(game.items?.size ?? 0),
                'the world-source checks are skipped at 0'),
            settingRow('Spell mapping', (compendiums.getSelected('Spell') ?? []).length
                ? 'configured' : 'none — the subtype check is skipped')
        ];
    },

    checks: [
        {
            id: 'fixture',
            tier: 'headless',
            group: 'Contract',
            label: 'A mapped Item compendium is available to test against',
            note: 'Everything else assumes this. If it fails, configure an Item compendium in Campaign Settings first.',
            run: async ({ expect, log }) => {
                const fixture = await itemFixture();
                expect.ok('a mapped Item compendium with named entries exists', !!fixture);
                if (fixture) log(`fixture: "${fixture.entry.name}" in ${fixture.packId}`);
            }
        },
        {
            id: 'shape',
            tier: 'headless',
            group: 'Contract',
            label: 'Result shape: exactly the seven documented fields, populated',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId } = fixture;

                const results = await compendiums.search('a', 'Item', { minLength: 1, limit: 5, sources: [packId] });
                expect.ok('returns an array', Array.isArray(results));
                expect.ok('the query matched something to inspect', results.length > 0);
                if (!results.length) return;

                const first = results[0];
                expect('exactly the documented keys', Object.keys(first).sort(), [...RESULT_KEYS].sort());
                expect.ok('uuid is a non-empty string', typeof first.uuid === 'string' && first.uuid.length > 0);
                expect.ok('uuid is a bare Compendium uuid', first.uuid.startsWith(`Compendium.${packId}.`));
                expect.ok('name is a non-empty string', typeof first.name === 'string' && first.name.length > 0);
                expect('source is the pack asked for', first.source, packId);
                expect.ok('matchType is a known tier', Object.keys(TIER_RANK).includes(first.matchType));
                expect.ok('every result carries the same shape',
                    results.every(r => RESULT_KEYS.every(k => k in r)));
                expect.ok('uuids are unique — tiers must be mutually exclusive',
                    new Set(results.map(r => r.uuid)).size === results.length);
            }
        },
        {
            id: 'all-packs',
            tier: 'headless',
            group: 'Mapping',
            label: 'getAllPacks/getAllChoices ignore the mapping and the content filters',
            note: 'The point is a compendium the user deliberately kept OUT of the search set. getChoices() cannot offer that.',
            run: async ({ expect, log }) => {
                const { compendiums } = requireApi('compendiums', 'compendiums.getAllPacks');

                for (const type of ['JournalEntry', 'Item', 'Actor', 'RollTable']) {
                    const packs = compendiums.getAllPacks(type);
                    const expectedClass = compendiums.getMapping(type).documentClass;

                    // Every pack of the right class is present -- that is what "unfiltered" means.
                    const installed = Array.from(game.packs.values())
                        .filter(p => p.metadata?.type === expectedClass)
                        .map(p => p.metadata.id);
                    expect(`${type}: every installed pack of its class is returned`,
                        packs.length, installed.length);
                    expect.ok(`${type}: no pack of another class leaks in`,
                        packs.every(p => installed.includes(p.id)));

                    // Discrete fields, per the lesson from sourceLabel.
                    if (packs.length) {
                        const first = packs[0];
                        expect.ok(`${type}: label is the pack's own name`,
                            first.label === game.packs.get(first.id)?.metadata?.label);
                        expect.ok(`${type}: package is separate from label`,
                            typeof first.package === 'string' && !first.label.includes(': '));
                        expect(`${type}: displayLabel composes the two`,
                            first.displayLabel, `${first.package}: ${first.label}`);
                        expect(`${type}: documentClass matches the mapping`,
                            first.documentClass, expectedClass);
                    }

                    // It is a SUPERSET of the mapped choices, never smaller.
                    const mapped = Object.keys(compendiums.getChoices(type) ?? {}).filter(k => k !== 'none');
                    const all = new Set(packs.map(p => p.id));
                    const missing = mapped.filter(id => !all.has(id));
                    expect(`${type}: contains everything getChoices offers`, missing.length, 0);
                    if (packs.length > mapped.length) {
                        log(`${type}: ${packs.length - mapped.length} pack(s) reachable ONLY through getAllPacks — `
                            + `that gap is the feature`);
                    }
                }

                const choices = compendiums.getAllChoices('JournalEntry');
                expect.ok('getAllChoices leads with a none entry', choices.none === '-- None --');
                expect.ok('and its keys are pack ids',
                    Object.keys(choices).filter(k => k !== 'none').every(k => !!game.packs.get(k)));
                expect.ok('{none: false} omits it',
                    !('none' in compendiums.getAllChoices('JournalEntry', { none: false })));

                expect('an unknown type returns nothing', compendiums.getAllPacks('NotAType').length, 0);

                // Synthetic types deliberately return every pack of their document class:
                // content sniffing is the filter this method exists to escape.
                if (compendiums.getAllPacks('Spell').length) {
                    expect('Spell returns Item packs, unsniffed',
                        compendiums.getAllPacks('Spell').length, compendiums.getAllPacks('Item').length);
                }
            }
        },
        {
            id: 'document-class',
            tier: 'headless',
            group: 'Contract',
            label: 'documentClass is the class, distinct from the subtype in type',
            note: 'This is the drag payload field. Getting it confused with `type` silently produces a payload no sheet accepts.',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId } = fixture;

                const items = await compendiums.search('a', 'Item', { minLength: 1, limit: 10, sources: [packId] });
                expect.ok('the query matched something to inspect', items.length > 0);
                expect('every Item result reports documentClass Item',
                    items.filter(r => r.documentClass !== 'Item').length, 0);
                expect.ok('documentClass is NOT the subtype',
                    items.every(r => r.type == null || r.documentClass !== r.type));

                // A synthetic type lives in Item packs, so its class must still be Item
                // even though the mapping and the subtype say Spell/spell.
                if (compendiums.getSelected('Spell').length) {
                    const spells = await compendiums.search('a', 'Spell', { minLength: 1, limit: 10 });
                    expect('a synthetic type still reports its real document class',
                        spells.filter(r => r.documentClass !== 'Item').length, 0);
                    expect('and its subtype is still spell',
                        spells.filter(r => r.type !== 'spell').length, 0);
                }

                if (compendiums.getSelected('Actor').length) {
                    const actors = await compendiums.search('a', 'Actor', { minLength: 1, limit: 10 });
                    expect('Actor results report documentClass Actor',
                        actors.filter(r => r.documentClass !== 'Actor').length, 0);
                }
            }
        },
        {
            id: 'multi-type',
            tier: 'headless',
            group: 'Matching',
            label: 'An array of types searches all of them, grouped, deduped, on one budget',
            note: 'Synthetic types share packs with Item, so a caller-side merge double-lists. This is the check that it does not.',
            run: async ({ expect, log }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums } = fixture;

                const types = compendiums.getTypes()
                    .filter(t => compendiums.getSearchOrder(t).length > 0);
                expect.ok('at least one type is mapped', types.length > 0);
                if (!types.length) return;

                const all = await compendiums.searchDetailed('a', types, { minLength: 1, limit: 400 });
                expect.ok('searching every mapped type returns something', all.results.length > 0);

                expect('no uuid appears twice across types',
                    all.results.length - new Set(all.results.map(r => r.uuid)).size, 0);

                // Grouping must survive the merge: each source still one contiguous run.
                const runs = sourceRuns(all.results);
                expect('each source is still ONE contiguous run',
                    new Set(runs.map(r => r.source)).size, runs.length);
                expect.ok('runs follow the merged source order',
                    isOrderedSubsequence(runs.map(r => r.source), all.searchOrder));

                // One budget, not one per type.
                const capped = await compendiums.search('a', types, { minLength: 1, limit: 7 });
                expect('limit is the total across every type', capped.length, 7);

                // A single type passed as a one-element array is the same as the bare token.
                const bare = await compendiums.search('a', 'Item', { minLength: 1, limit: 20 });
                const wrapped = await compendiums.search('a', ['Item'], { minLength: 1, limit: 20 });
                expect('a one-element array matches the bare token',
                    wrapped.map(r => r.uuid), bare.map(r => r.uuid));

                // Duplicate tokens must not double anything, including aliases of the
                // same canonical type ('item' and 'Item' both normalize to Item).
                const duped = await compendiums.search('a', ['Item', 'item', 'Item'], { minLength: 1, limit: 20 });
                expect('repeated and aliased type tokens collapse',
                    duped.map(r => r.uuid), bare.map(r => r.uuid));

                // The union is at least as large as any single type's contribution,
                // and every result names a type that was actually requested.
                const classes = new Set(types.map(t => compendiums.getMapping(t).documentClass));
                expect('every result reports a requested document class',
                    all.results.filter(r => !classes.has(r.documentClass)).length, 0);

                expect('an empty type array returns nothing',
                    (await compendiums.search('a', [], { minLength: 1 })).length, 0);

                log(`${all.results.length} result(s) across ${runs.length} source(s) from ${types.length} type(s)`);
            }
        },
        {
            id: 'truncation-report',
            tier: 'headless',
            group: 'Bounds',
            label: 'searchDetailed reports truncation instead of leaving it inferable',
            note: 'The count===limit inference over-reports. These assertions are the case it gets wrong.',
            run: async ({ expect, log }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums } = fixture;

                const full = await compendiums.searchDetailed('a', 'Item', { minLength: 1, limit: 4000 });
                expect.ok('the query matched something to inspect', full.results.length > 0);
                expect('a scan that reaches every source is not truncated', full.truncated, false);
                expect('every configured source was scanned',
                    full.skippedSources.length, 0);
                expect('scannedSources and searchOrder agree when nothing is skipped',
                    full.scannedSources.length, full.searchOrder.length);

                const capped = await compendiums.searchDetailed('a', 'Item', { minLength: 1, limit: 3 });
                expect('a capped scan is reported truncated', capped.truncated, true);
                expect('it still returns exactly the cap', capped.results.length, 3);
                expect.ok('skipped sources are named, not just counted',
                    Array.isArray(capped.skippedSources));
                expect.ok('scanned and skipped partition the search order',
                    capped.scannedSources.length + capped.skippedSources.length === capped.searchOrder.length);
                expect.ok('nothing appears in both',
                    !capped.scannedSources.some(s => capped.skippedSources.includes(s)));

                // THE CASE THE INFERENCE GETS WRONG: a cap set to exactly the number of
                // available results is a complete scan. `results.length === limit` says
                // truncated; the report says otherwise, and the report is right.
                const exact = await compendiums.searchDetailed('a', 'Item', {
                    minLength: 1, limit: full.results.length
                });
                expect('a cap that exactly fits is NOT truncated', exact.truncated, false);
                expect('and it returned everything', exact.results.length, full.results.length);
                log(`inference would have called this truncated: ${exact.results.length} results, limit ${full.results.length}`);

                const short = await compendiums.searchDetailed('a', 'Item', { minLength: 5 });
                expect('a query below minLength reports no scan', short.scannedSources.length, 0);
                expect('and is not truncated — nothing was cut off', short.truncated, false);

                expect('search() returns just the array',
                    Array.isArray(await compendiums.search('a', 'Item', { minLength: 1, limit: 3 })), true);
            }
        },
        {
            id: 'source-identity',
            tier: 'headless',
            group: 'Contract',
            label: 'Source identity is discrete fields, not one composed display string',
            note: 'getChoices() labels glue package + pack + a content summary into one line. A result must never carry that.',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId, pack } = fixture;

                const results = await compendiums.search('a', 'Item', { minLength: 1, limit: 5, sources: [packId] });
                expect.ok('the query matched something to inspect', results.length > 0);
                if (!results.length) return;
                const first = results[0];

                expect('sourceLabel is exactly the pack label', first.sourceLabel, pack.metadata.label);
                expect.ok('sourcePackage is a non-empty string',
                    typeof first.sourcePackage === 'string' && first.sourcePackage.length > 0);
                expect.ok('sourceLabel is not the raw pack id', first.sourceLabel !== packId);

                // The three specific ways the old composed label leaked through. Each is a
                // separate assertion so a failure names which glue character came back.
                expect.ok('sourceLabel carries no " — " content summary', !first.sourceLabel.includes(' — '));
                expect.ok('sourceLabel carries no "Package: Pack" prefix', !first.sourceLabel.includes(': '));
                expect.ok('sourceLabel carries no entry counts', !/\d+\s+\w+,/.test(first.sourceLabel));
                expect.ok('sourcePackage carries no content summary', !first.sourcePackage.includes(' — '));

                // The composed form still exists for callers that want it, and must not be
                // what search() returns.
                const choiceLabel = compendiums.getChoices('Item')?.[packId];
                if (typeof choiceLabel === 'string') {
                    expect.ok('the result label is NOT the settings-dropdown label',
                        first.sourceLabel !== choiceLabel);
                }
            }
        },
        {
            id: 'img',
            tier: 'headless',
            group: 'Contract',
            label: 'img matches the pack index, with no document loaded',
            note: 'This is the field added for pickers. It must come off the cached index, not a round-trip.',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId, index } = fixture;

                const byUuid = new Map(index.map(e => [e.uuid, e]));
                const results = await compendiums.search('a', 'Item', { minLength: 1, limit: 25, sources: [packId] });
                expect.ok('the query matched something to inspect', results.length > 0);

                const mismatched = results.filter(r => (byUuid.get(r.uuid)?.img ?? null) !== r.img);
                expect('every img equals the pack index img', mismatched.length, 0);
                expect.ok('at least one result has a real image path',
                    results.some(r => typeof r.img === 'string' && r.img.length > 0));
            }
        },
        {
            id: 'exact-tier',
            tier: 'headless',
            group: 'Matching',
            label: 'A full name matches at the exact tier and sorts first in its source',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId, entry } = fixture;

                const results = await compendiums.search(entry.name, 'Item', { minLength: 1, limit: 50, sources: [packId] });
                const hit = results.find(r => r.uuid === entry.uuid);
                expect.ok(`"${entry.name}" is present in its own pack`, !!hit);
                expect('it matched at the exact tier', hit?.matchType, 'exact');
                expect('an exact match sorts first within its source', results[0]?.matchType, 'exact');

                const prefix = entry.name.slice(0, 3);
                const loose = await compendiums.search(prefix, 'Item', { minLength: 1, limit: 200, sources: [packId] });
                expect.ok(`a 3-char prefix of it still finds it`, loose.some(r => r.uuid === entry.uuid));
            }
        },
        {
            id: 'fuzzy-default',
            tier: 'headless',
            group: 'Matching',
            label: 'fuzzy defaults ON; {fuzzy: false} drops the includes tier',
            note: 'Opposite of resolve(), deliberately — a picker should surface "Longsword" for "sword".',
            run: async ({ expect, log }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId } = fixture;

                const loose = await compendiums.search('a', 'Item', { minLength: 1, limit: 400, sources: [packId] });
                const strict = await compendiums.search('a', 'Item', { minLength: 1, limit: 400, sources: [packId], fuzzy: false });

                expect('{fuzzy:false} yields no includes-tier results',
                    strict.filter(r => r.matchType === 'includes').length, 0);
                expect.ok('the default is looser than {fuzzy:false}', loose.length >= strict.length);
                if (!loose.some(r => r.matchType === 'includes')) {
                    log('NOTE: no interior matches for "a" in this pack, so the default-on half is unproven here.');
                } else {
                    expect.ok('the default includes interior matches',
                        loose.some(r => r.matchType === 'includes'));
                }
            }
        },
        {
            id: 'itemtype-filters',
            tier: 'headless',
            group: 'Matching',
            label: 'itemType FILTERS (search) where it merely PREFERS (resolve)',
            note: 'Asserted with a subtype that cannot exist: filtering returns nothing, preferring falls back to everything.',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, packId, entry } = fixture;

                const filtered = await compendiums.search('a', 'Item', {
                    minLength: 1, limit: 50, sources: [packId], itemType: IMPOSSIBLE_SUBTYPE
                });
                expect('an impossible subtype yields nothing — it filters', filtered.length, 0);

                // The same impossible subtype through resolve(), which must STILL find the
                // entry. If this ever fails, the two semantics have been accidentally merged.
                const resolved = await compendiums.resolve(entry.name, 'Item', { itemType: IMPOSSIBLE_SUBTYPE });
                expect('resolve() still falls back to the unfiltered set', resolved.found, true);

                const realType = entry.type;
                if (!realType) return;
                const narrowed = await compendiums.search('a', 'Item', {
                    minLength: 1, limit: 100, sources: [packId], itemType: realType
                });
                expect(`every result is a ${realType}`,
                    narrowed.filter(r => r.type !== realType).length, 0);
            }
        },
        {
            id: 'ordering',
            tier: 'headless',
            group: 'Ordering',
            label: 'Grouped by source in priority order, tier-sorted then alphabetical within',
            note: 'The deliberate inverse of resolve(). Interleaving packs would destroy the grouping a picker renders.',
            run: async ({ expect, log }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums } = fixture;

                const order = compendiums.getSearchOrder('Item');
                const results = await compendiums.search('a', 'Item', { minLength: 1, limit: 4000 });
                expect.ok('the query matched something to inspect', results.length > 0);
                if (!results.length) return;

                const runs = sourceRuns(results);
                expect('each source forms ONE contiguous run',
                    new Set(runs.map(r => r.source)).size, runs.length);
                expect.ok('runs follow the configured priority order',
                    isOrderedSubsequence(runs.map(r => r.source), order));

                const tierBreaks = runs.filter(run => run.items.some((item, i) =>
                    i > 0 && TIER_RANK[item.matchType] < TIER_RANK[run.items[i - 1].matchType]));
                expect('tier rank never decreases within a source', tierBreaks.length, 0);

                const alphaBreaks = runs.filter(run => run.items.some((item, i) =>
                    i > 0
                    && item.matchType === run.items[i - 1].matchType
                    && run.items[i - 1].name.localeCompare(item.name) > 0));
                expect('names are alphabetical within a source+tier run', alphaBreaks.length, 0);

                if (runs.length < 2) log(`NOTE: only ${runs.length} source produced results — map a second Item compendium to prove grouping across sources.`);
                else log(`grouping proven across ${runs.length} sources: ${runs.map(r => r.source).join(' -> ')}`);
            }
        },
        {
            id: 'limit-minlength',
            tier: 'headless',
            group: 'Bounds',
            label: 'minLength short-circuits; limit caps and stops the scan',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums } = fixture;

                expect('a 1-char query is below the default minLength', (await compendiums.search('a', 'Item')).length, 0);
                expect('an empty query returns nothing', (await compendiums.search('', 'Item')).length, 0);
                expect('a whitespace query returns nothing', (await compendiums.search('   ', 'Item')).length, 0);
                expect('null returns nothing', (await compendiums.search(null, 'Item')).length, 0);

                const opened = await compendiums.search('a', 'Item', { minLength: 1, limit: 10 });
                expect.ok('{minLength: 1} lets the same query through', opened.length > 0);

                const capped = await compendiums.search('a', 'Item', { minLength: 1, limit: 3 });
                expect('limit caps the total', capped.length, 3);
                expect.ok('the capped results are the head of the uncapped ones',
                    capped.every((r, i) => r.uuid === opened[i]?.uuid));
            }
        },
        {
            id: 'misses',
            tier: 'headless',
            group: 'Bounds',
            label: 'Misses return [] rather than throwing',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums } = fixture;

                expect('no content matches', (await compendiums.search(IMPOSSIBLE_QUERY, 'Item', { minLength: 1 })).length, 0);
                expect('an unknown source id is dropped',
                    (await compendiums.search('a', 'Item', { minLength: 1, sources: ['no.such.pack'] })).length, 0);
                expect('an empty sources array searches nothing',
                    (await compendiums.search('a', 'Item', { minLength: 1, sources: [] })).length, 0);
            }
        },
        {
            id: 'subtype',
            tier: 'headless',
            group: 'Bounds',
            label: 'Synthetic types stay filtered to their document subtype',
            note: 'Skipped when no Spell compendium is mapped.',
            run: async ({ expect, log }) => {
                const { compendiums } = requireApi('compendiums', 'compendiums.search');
                if (!compendiums.getSelected('Spell').length) {
                    log('SKIPPED: no Spell compendium mapped.');
                    return;
                }
                const results = await compendiums.search('a', 'Spell', { minLength: 1, limit: 100 });
                expect.ok('the query matched something to inspect', results.length > 0);
                expect('every Spell result has subtype "spell"',
                    results.filter(r => r.type !== 'spell').length, 0);
            }
        },
        {
            id: 'world',
            tier: 'headless',
            group: 'Bounds',
            label: 'World items are searchable and carry img',
            note: 'Skipped in a world with no Items. `sources: ["world"]` works even when world-first/last is off.',
            run: async ({ expect, log }) => {
                const { compendiums } = requireApi('compendiums', 'compendiums.search');
                const item = game.items?.find(i => typeof i.name === 'string' && i.name.trim().length >= 4);
                if (!item) {
                    log('SKIPPED: no world Items to search.');
                    return;
                }
                const results = await compendiums.search(item.name, 'Item', { minLength: 1, limit: 50, sources: ['world'] });
                const hit = results.find(r => r.uuid === item.uuid);
                expect.ok(`world item "${item.name}" is found`, !!hit);
                expect('it matched exactly', hit?.matchType, 'exact');
                expect('its source is world', hit?.source, 'world');
                expect('its sourceLabel is World', hit?.sourceLabel, 'World');
                expect('its sourcePackage is the world title', hit?.sourcePackage, game.world?.title ?? 'World');
                expect('its img comes from the document', hit?.img, item.img ?? null);
            }
        },
        {
            id: 'regression',
            tier: 'headless',
            group: 'Regression',
            label: 'resolve() and resolveMany() still work over the changed index shape',
            note: 'Cached index entries gained an img field. Everything reading them must be unaffected.',
            run: async ({ expect }) => {
                const fixture = await itemFixture();
                if (!fixture) return expect.ok('fixture available', false);
                const { compendiums, entry } = fixture;

                const resolved = await compendiums.resolve(entry.name, 'Item');
                expect('resolve() finds the fixture', resolved.found, true);
                expect('resolve() matched exactly', resolved.matchType, 'exact');
                expect('resolve() reports high confidence', resolved.confidence, 'high');
                expect.ok('resolve() returns a bare uuid', !resolved.uuid?.startsWith('@'));

                const many = await compendiums.resolveMany([entry.name, '', IMPOSSIBLE_QUERY], 'Item');
                expect('resolveMany() returns one result per input, in order', many.length, 3);
                expect('the found one is first', many[0]?.found, true);
                expect('a blank input still yields a structured miss', many[1]?.found, false);
                expect('an unmatchable input yields a miss', many[2]?.found, false);

                const document = await compendiums.resolveDocument(entry.name, 'Item');
                expect.ok('resolveDocument() still loads a document', !!document);
            }
        },
        {
            id: 'picker',
            tier: 'interactive',
            label: 'Search-as-you-type picker preview',
            note: 'The actual use case Squire asked for. Type and watch: results must group under compendium headers, show images, and never flicker between groupings.',
            run: async ({ api, log }) => {
                const compendiums = api.compendiums;
                const subtypes = ['', 'weapon', 'equipment', 'consumable', 'spell', 'feat'];

                const content = `
                    <div data-picker>
                        <div style="display:flex; gap:8px; margin-bottom:8px;">
                            <input type="text" data-picker-query placeholder="Type at least 2 characters..."
                                   style="flex:1 1 auto;" autocomplete="off">
                            <select data-picker-subtype style="flex:0 0 140px;">
                                ${subtypes.map(t => `<option value="${t}">${t || 'any subtype'}</option>`).join('')}
                            </select>
                        </div>
                        <div data-picker-status style="opacity:0.65; font-size:0.9em; margin-bottom:6px;"></div>
                        <div data-picker-results style="max-height:46vh; overflow-y:auto;"></div>
                    </div>`;

                await foundry.applications.api.DialogV2.wait({
                    window: { title: 'Compendium Search — picker preview' },
                    position: { width: 520, height: 'auto' },
                    modal: false,
                    rejectClose: false,
                    content,
                    buttons: [{ action: 'close', label: 'Close', default: true }],
                    render: (_event, dialog) => {
                        const root = dialog?.element ?? dialog;
                        const input = root.querySelector('[data-picker-query]');
                        const subtype = root.querySelector('[data-picker-subtype]');
                        const status = root.querySelector('[data-picker-status]');
                        const list = root.querySelector('[data-picker-results]');

                        let token = 0;
                        let timer = null;

                        // Results are built as DOM nodes, never as an HTML string: compendium
                        // names are content, and this is a picker over arbitrary world data.
                        const render = (results) => {
                            list.replaceChildren();
                            let currentSource = null;
                            for (const result of results) {
                                if (result.source !== currentSource) {
                                    currentSource = result.source;
                                    const header = document.createElement('div');
                                    header.textContent = result.sourceLabel;
                                    header.style.cssText = 'margin:10px 0 4px 0; padding-bottom:3px; border-bottom:1px solid rgba(255,255,255,0.16); font-size:0.82em; letter-spacing:0.06em; text-transform:uppercase; opacity:0.75;';
                                    list.appendChild(header);
                                }
                                const row = document.createElement('div');
                                row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:3px 2px;';
                                const thumb = document.createElement('img');
                                thumb.src = result.img ?? 'icons/svg/mystery-man.svg';
                                thumb.style.cssText = 'flex:0 0 auto; width:26px; height:26px; object-fit:cover; border:none;';
                                const name = document.createElement('span');
                                name.textContent = result.name;
                                name.style.cssText = 'flex:1 1 auto;';
                                const meta = document.createElement('span');
                                meta.textContent = `${result.type ?? '-'} · ${result.matchType}`;
                                meta.style.cssText = 'flex:0 0 auto; opacity:0.55; font-size:0.85em;';
                                row.append(thumb, name, meta);
                                row.addEventListener('click', () => log(`clicked: ${result.name} -> ${result.uuid}`));
                                list.appendChild(row);
                            }
                        };

                        const run = async () => {
                            const mine = ++token;
                            const started = performance.now();
                            const results = await compendiums.search(input.value, 'Item', {
                                itemType: subtype.value || null,
                                limit: 40
                            });
                            // Out-of-order responses are the classic search-as-you-type bug;
                            // drop anything a newer keystroke has already superseded.
                            if (mine !== token) return;
                            const elapsed = Math.round(performance.now() - started);
                            const sources = new Set(results.map(r => r.source)).size;
                            status.textContent = `${results.length} result(s) across ${sources} source(s) in ${elapsed}ms`;
                            log(`"${input.value}" -> ${results.length} result(s), ${sources} source(s), ${elapsed}ms`);
                            render(results);
                        };

                        input.addEventListener('input', () => {
                            clearTimeout(timer);
                            timer = setTimeout(() => void run(), 120);
                        });
                        subtype.addEventListener('change', () => void run());
                        input.focus();
                    }
                });

                log('CHECK: did results group under compendium headers, show images, and stay ordered as you typed?');
                log('CHECK: first keystroke slower than the rest? That is the index warming once — subsequent queries hit the cache.');
            }
        }
    ]
};
