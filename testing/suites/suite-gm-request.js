// ==================================================================
// ===== SUITE: gm-request, party, and the tool-window registry ======
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead.
//
// Contract:       documentation/api/api-gm-request.md, api-party.md, api-window.md
// Mechanism:      documentation/architecture/architecture-gm-request.md
// Implementation: scripts/api-gm-request.js, api-party.js, window-tool-base.js
//
// The identity guarantee cannot be proven from one client. What CAN be checked
// here is that it is installed, that the local-GM path answers, and that failure
// is closed rather than degraded. The two-client case is a manual step, called
// out in the interactive check.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const OP = 'coffee-pub-blacksmith.harnessEcho';

export default {
    id: 'gm-request',
    label: 'GM Request',
    icon: 'fa-solid fa-tower-broadcast',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        const gmRequest = api?.gmRequest;
        return [
            settingRow('api.gmRequest', gmRequest ? 'available' : 'MISSING'),
            settingRow('verified identity', gmRequest?.hasVerifiedIdentity?.() ? 'active' : 'UNAVAILABLE',
                gmRequest?.hasVerifiedIdentity?.() ? null : 'Requests from players will be refused IDENTITY_UNVERIFIED.'),
            settingRow('active GM', game.users?.activeGM?.name ?? 'none'),
            settingRow('this user', game.user?.isGM ? 'GM (local dispatch path)' : 'player (query path)'),
            settingRow('QUERY_USER', game.user?.hasPermission?.('QUERY_USER') ? 'granted' : 'DENIED')
        ];
    },

    checks: [
        {
            id: 'surface',
            tier: 'headless',
            group: 'GM Request',
            label: 'Surface, codes, and the core query registration',
            run: async ({ expect }) => {
                const api = requireApi('gmRequest');
                const gm = api.gmRequest;
                for (const method of ['request', 'registerOp', 'unregisterOp', 'getRegisteredOps', 'hasVerifiedIdentity']) {
                    expect.ok(`gmRequest.${method} is a function`, typeof gm[method] === 'function');
                }
                expect.ok('IDENTITY_UNVERIFIED exists', gm.CODES?.IDENTITY_UNVERIFIED === 'IDENTITY_UNVERIFIED');
                expect.ok('the query name is module-prefixed', String(gm.QUERY_NAME).includes('.'));
                expect.ok('and it is registered with core', typeof CONFIG.queries?.[gm.QUERY_NAME] === 'function');
            }
        },
        {
            id: 'op-registration',
            tier: 'headless',
            group: 'GM Request',
            label: 'Ops must be prefixed, and a collision is refused rather than overwritten',
            note: 'Unlike api.sockets.register, which replaces silently and cannot unregister.',
            run: async ({ expect }) => {
                const api = requireApi('gmRequest');
                const gm = api.gmRequest;
                try {
                    expect('an unprefixed op is refused',
                        gm.registerOp({ op: 'noprefix', handler: () => ({ ok: true }) }), false);
                    expect('a non-function handler is refused',
                        gm.registerOp({ op: 'coffee-pub-blacksmith.bad', handler: 'nope' }), false);

                    expect('a well-formed op registers',
                        gm.registerOp({ op: OP, module: 'harness', handler: (p, u) => ({ ok: true, echo: p, caller: u?.id }) }),
                        true);
                    expect('registering it again is REFUSED, not overwritten',
                        gm.registerOp({ op: OP, handler: () => ({ ok: true, replaced: true }) }), false);
                    expect.ok('and it appears in diagnostics',
                        gm.getRegisteredOps().some(entry => entry.op === OP));
                } finally {
                    gm.unregisterOp(OP);
                }
                expect('unregistering a missing op reports false', gm.unregisterOp(OP), false);
            }
        },
        {
            id: 'local-gm-dispatch',
            tier: 'headless',
            group: 'GM Request',
            label: 'A GM answers itself, with itself as the verified caller',
            note: 'This is what makes an op work in a world with no other clients connected.',
            run: async ({ expect, log }) => {
                const api = requireApi('gmRequest');
                const gm = api.gmRequest;
                if (!game.user.isGM) {
                    log('Not a GM on this client, so the local path cannot be exercised here.');
                    return;
                }
                try {
                    gm.registerOp({ op: OP, module: 'harness', handler: (payload, user) => ({ ok: true, seen: payload?.n, caller: user?.id }) });

                    const result = await gm.request(OP, { n: 42 });
                    expect('the op answered', result.ok, true);
                    expect('the payload arrived', result.seen, 42);
                    expect('and the caller is this GM, from the document not the payload', result.caller, game.user.id);

                    const missing = await gm.request('coffee-pub-blacksmith.harnessNotRegistered', {});
                    expect('an unknown op is refused', missing.code, gm.CODES.UNKNOWN_OP);

                    gm.unregisterOp(OP);
                    gm.registerOp({ op: OP, module: 'harness', handler: () => { throw new Error('boom'); } });
                    const threw = await gm.request(OP, {});
                    expect('a throwing handler becomes a code, not a rejection', threw.code, gm.CODES.HANDLER_ERROR);
                    expect.ok('and it carries the message', String(threw.message).includes('boom'));
                } finally {
                    gm.unregisterOp(OP);
                }
            }
        },
        {
            id: 'identity-two-client',
            tier: 'interactive',
            group: 'GM Request',
            label: 'A player request arrives with a caller the player did not choose',
            note: 'NEEDS TWO CLIENTS. Run this check on a PLAYER client while a GM is connected. It registers '
                + 'an op that reports the caller the GM resolved; the id it reports must be the player\'s own, '
                + 'and it must not be readable from the payload. Refused as IDENTITY_UNVERIFIED means the '
                + 'socket capture did not install — see the suite settings above.',
            run: async ({ expect, log }) => {
                const api = requireApi('gmRequest');
                const gm = api.gmRequest;
                if (game.user.isGM) {
                    log('This client is the GM. Register the op here, then run this check from a player client.');
                    gm.registerOp({
                        op: OP,
                        module: 'harness',
                        handler: (payload, user) => ({ ok: true, caller: user?.id, claimed: payload?.claimedUserId ?? null })
                    });
                    log(`Registered "${OP}" on the GM. Leave this window open and run the check as a player.`);
                    return;
                }

                // A deliberately false claim in the payload: the answer must ignore it.
                const result = await gm.request(OP, { claimedUserId: 'not-a-real-user-id' });
                log(`result: ${JSON.stringify(result)}`);
                if (result.code === gm.CODES.UNKNOWN_OP) {
                    log('The GM has not registered the op yet — run this check on the GM client first.');
                    return;
                }
                expect('the request was answered', result.ok, true);
                expect('the caller is THIS user, resolved by the GM', result.caller, game.user.id);
                expect.ok('and it is not the id the payload claimed', result.caller !== result.claimed);
            }
        },

        // ---------- party ----------
        {
            id: 'party-rosters',
            tier: 'headless',
            group: 'Party',
            label: 'Two rosters, and resting is the wider one',
            note: 'A familiar rests with the party and cannot buy a sword. If this world has no NPC party '
                + 'members the two lists will match, which is correct rather than a pass.',
            run: async ({ expect, log }) => {
                const api = requireApi('party');
                const party = api.party;

                const resting = party.resting();
                const acting = party.acting();
                expect.ok('resting() returns an array', Array.isArray(resting));
                expect.ok('acting() returns an array', Array.isArray(acting));
                expect.ok('hasPrimaryParty reports a boolean', typeof party.hasPrimaryParty() === 'boolean');

                const actingIds = new Set(acting.map(a => a.id));
                expect.ok('every actor who can act can also rest',
                    acting.every(a => resting.some(r => r.id === a.id)));
                expect.ok('acting() is characters only',
                    acting.every(a => a?.system?.isCharacter !== false));

                const extra = resting.filter(a => !actingIds.has(a.id));
                log(`primary party: ${party.hasPrimaryParty() ? party.actor()?.name ?? 'yes' : 'none — using the player-owned fallback'}`);
                log(`resting ${resting.length}, acting ${acting.length}`);
                log(extra.length
                    ? `rest-only members (NPC companions): ${extra.map(a => a.name).join(', ')}`
                    : 'no rest-only members in this world, so the two lists match here');
            }
        },

        // ---------- tool window registry ----------
        {
            id: 'window-registry',
            tier: 'headless',
            group: 'Tool windows',
            label: 'openFor is one window per target, per subclass',
            run: async ({ expect }) => {
                const api = requireApi('BlacksmithToolWindowBaseV2');
                const ToolBase = api.BlacksmithToolWindowBaseV2;

                class HarnessWindowA extends ToolBase {
                    constructor(target, options = {}) { super(options); this.target = target; }
                    async render() { this.rendered = true; return this; }
                    async close() { this._onClose({}); this.rendered = false; return this; }
                }
                class HarnessWindowB extends HarnessWindowA {}

                const token = { uuid: 'Harness.Target.1' };

                const first = await HarnessWindowA.openFor(token);
                expect.ok('a window opened', Boolean(first));
                expect('it is registered for the target', HarnessWindowA.isOpenFor(token), true);

                const second = await HarnessWindowA.openFor(token);
                expect.ok('a second call returns the SAME window, not a duplicate', second === first);
                expect('one window is open', HarnessWindowA.openWindows().length, 1);

                // Two subclasses on one target must not evict each other.
                const other = await HarnessWindowB.openFor(token);
                expect.ok('a different subclass gets its own window', other !== first);
                expect('and the first is still registered', HarnessWindowA.isOpenFor(token), true);

                expect('the instance reports its key', first.registryKey, 'Harness.Target.1');

                await HarnessWindowA.closeFor(token);
                expect('closing deregisters it', HarnessWindowA.isOpenFor(token), false);
                expect('while the other subclass is untouched', HarnessWindowB.isOpenFor(token), true);
                await HarnessWindowB.closeFor(token);

                const nothing = await HarnessWindowA.openFor({ noUuid: true });
                expect('a target with no key opens nothing', nothing, null);
            }
        }
    ]
};
