// ==================================================================
// ===== SUITE: Away status =========================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO -- it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead.
//
// Contract:       documentation/architecture/architecture-away.md
// Implementation: scripts/manager-away.js
//
// WHAT THIS SUITE IS FOR. The status itself: what is stored on a user, what a read returns, who may write it. It does
// NOT cover the toast, the menubar icon or the Stage Manager chips, which need a second client: testing/away.md.
//
// WHAT IT TOUCHES. The running user's own `away` flag, which it restores in a `finally`.
// ==================================================================

const MODULE_ID = 'coffee-pub-blacksmith';

async function manager() {
    const { AwayManager, AwayAPI } = await import('../../scripts/manager-away.js');
    return { AwayManager, AwayAPI };
}

/** Run a body with this user's flag saved and put back afterwards, whatever happens. */
async function withOwnFlag(body) {
    const saved = foundry.utils.deepClone(game.user.getFlag(MODULE_ID, 'away') ?? null);
    try {
        await body();
    } finally {
        if (saved) await game.user.setFlag(MODULE_ID, 'away', saved);
        else await game.user.unsetFlag(MODULE_ID, 'away');
    }
}

export default {
    id: 'away',
    label: 'Away status',
    icon: 'fa-solid fa-user-clock',

    checks: [
        {
            id: 'read-shape',
            label: 'A read is always in full shape, and the public surface is what is documented',
            tier: 'headless',
            note: 'Pure reads, writes nothing.',
            run: async ({ expect }) => {
                const { AwayManager, AwayAPI } = await manager();
                expect('an unknown user is not away', AwayManager.get('zz-no-such-user'), null);
                expect('and is not reported away', AwayAPI.isAway('zz-no-such-user'), false);
                const rows = AwayAPI.list();
                expect('the list has one row per user', rows.length, game.users.size);
                expect('every row carries the fields', rows.every((r) => 'userId' in r && 'name' in r && 'isGM' in r && 'active' in r && 'away' in r), true);
                expect('the surface is the five calls', Object.keys(AwayAPI).sort(), ['clear', 'get', 'isAway', 'list', 'set']);
            }
        },
        {
            id: 'set-and-clear',
            label: 'Setting stores a trimmed message, setting again replaces it, clearing reports whether anything was cleared',
            tier: 'headless',
            note: 'Writes this user\'s own flag and restores it. Toasts this client and any connected one, as going away does.',
            run: async ({ expect }) => {
                const { AwayManager } = await manager();
                const me = game.user.id;
                await withOwnFlag(async () => {
                    await AwayManager.clear(me);
                    expect('available to start', AwayManager.get(me), null);
                    await AwayManager.set(me, { message: '  back in ten  ' });
                    expect('away with the message trimmed', AwayManager.get(me)?.message, 'back in ten');
                    expect('and a time', AwayManager.get(me)?.since > 0, true);
                    await AwayManager.set(me);
                    expect('setting again replaces the message', [AwayManager.isAway(me), AwayManager.get(me)?.message], [true, '']);
                    await AwayManager.set(me, { message: 'x'.repeat(500) });
                    expect('a message is capped at 200', AwayManager.get(me)?.message.length, 200);
                    expect('clearing says it cleared something', await AwayManager.clear(me), true);
                    expect('and is back', AwayManager.get(me), null);
                    expect('clearing again says nothing happened', await AwayManager.clear(me), false);
                });
            }
        },
        {
            id: 'who-may-write',
            label: 'A player can change only their own status; a GM can change anyone\'s',
            tier: 'headless',
            note: 'A player run refuses a write for another user. A GM run checks an unknown user is refused. Writes nothing.',
            run: async ({ expect }) => {
                const { AwayManager } = await manager();
                const refuses = async (userId) => {
                    try {
                        await AwayManager.set(userId);
                        return false;
                    } catch (_error) {
                        return true;
                    }
                };
                expect('an unknown user is refused', await refuses('zz-no-such-user'), true);
                if (!game.user.isGM) {
                    const other = game.users.find((u) => u.id !== game.user.id);
                    if (other) expect('a player cannot set another user', await refuses(other.id), true);
                }
            }
        }
    ]
};
