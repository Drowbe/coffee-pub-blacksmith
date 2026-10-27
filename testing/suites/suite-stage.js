// ==================================================================
// ===== SUITE: Stage Manager state =================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO -- it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead.
//
// Contract:       documentation/architecture/architecture-stage-manager.md
// Implementation: scripts/manager-stage.js
//
// WHAT THIS SUITE IS FOR. The Stage Manager's stored state and its view model: what is normalised away, what an
// assignment to the active scene does, and what the panel lists. It does NOT pull anyone: moving a connected
// player is a two-client check in testing/stage-manager.md.
//
// WHAT IT TOUCHES. The world setting `stageState`, which it saves first and restores in a `finally`. GM only.
// ==================================================================

const MODULE_ID = 'coffee-pub-blacksmith';

async function manager() {
    const { StageManager } = await import('../../scripts/manager-stage.js');
    return StageManager;
}

/** Run a body with the stored state saved and put back afterwards, whatever happens. */
async function withState(StageManager, body) {
    const saved = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'stageState'));
    try {
        await body();
    } finally {
        await game.settings.set(MODULE_ID, 'stageState', saved);
    }
}

export default {
    id: 'stage',
    label: 'Stage Manager',
    icon: 'fa-solid fa-masks-theater',

    checks: [
        {
            id: 'state-normalised',
            label: 'Stored state is always in full shape, with junk dropped and duplicates removed',
            tier: 'headless',
            note: 'Pure function, writes nothing.',
            run: async ({ expect }) => {
                const StageManager = await manager();
                expect('nothing stored', StageManager.normalizeState(undefined), { assignments: {}, extras: [], order: [], statuses: {}, lobbyScene: null, lobby: false });
                expect('junk assignments are dropped', StageManager.normalizeState({ assignments: { a: 'x', b: 7, c: '' }, extras: 'no' }),
                    { assignments: { a: 'x' }, extras: [], order: [], statuses: {}, lobbyScene: null, lobby: false });
                expect('extras are de-duplicated and filtered', StageManager.normalizeState({ extras: ['s1', 's1', '', 3, 's2'] }),
                    { assignments: {}, extras: ['s1', 's2'], order: [], statuses: {}, lobbyScene: null, lobby: false });
                expect('lobby is a real boolean', [StageManager.normalizeState({ lobby: true }).lobby, StageManager.normalizeState({ lobby: 'yes' }).lobby],
                    [true, false]);
                expect('only the two known statuses survive', StageManager.normalizeState({ statuses: { a: 'away', b: 'dnd', c: 'busy', d: 4 } }).statuses,
                    { a: 'away', b: 'dnd' });
                expect('a lobby scene must be a non-empty string', [StageManager.normalizeState({ lobbyScene: 's1' }).lobbyScene, StageManager.normalizeState({ lobbyScene: '' }).lobbyScene, StageManager.normalizeState({ lobbyScene: 5 }).lobbyScene],
                    ['s1', null, null]);
                expect('order is de-duplicated and filtered', StageManager.normalizeState({ order: ['b', 'a', 'b', '', 9] }).order, ['b', 'a']);
            }
        },
        {
            id: 'scene-drop',
            label: 'A dragged scene is understood: a world scene resolves, anything else does not',
            tier: 'headless',
            note: 'Pure reads, writes nothing.',
            run: async ({ expect }) => {
                const StageManager = await manager();
                const scene = game.scenes.contents[0];
                if (!scene) throw new Error('Needs at least one scene.');
                expect('a world scene resolves', StageManager.sceneFromDrop(JSON.stringify({ type: 'Scene', uuid: scene.uuid }))?.id, scene.id);
                expect('a compendium scene does not', StageManager.sceneFromDrop(JSON.stringify({ type: 'Scene', uuid: 'Compendium.a.b.Scene.x' })), null);
                expect('an actor does not', StageManager.sceneFromDrop(JSON.stringify({ type: 'Actor', uuid: 'Actor.x' })), null);
                expect('a user id and junk do not', [StageManager.sceneFromDrop(game.user.id), StageManager.sceneFromDrop('{'), StageManager.sceneFromDrop(null)], [null, null, null]);
            }
        },
        {
            id: 'assignment-rules',
            label: 'Assigning a player to the active scene clears the hold; to any other scene stores it',
            tier: 'headless',
            note: 'GM only. Saves and restores the stored state.',
            run: async ({ expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- the check writes a world setting.');
                const StageManager = await manager();
                const active = game.scenes.active;
                const other = game.scenes.contents.find((s) => s.id !== active?.id);
                if (!active || !other) throw new Error('Needs an active scene and at least one other scene.');
                await withState(StageManager, async () => {
                    await game.settings.set(MODULE_ID, 'stageState', { assignments: {}, extras: [], order: [] });
                    await StageManager.setAssignment('zz-probe-user', other.id);
                    expect('stored for another scene', StageManager.getState().assignments['zz-probe-user'], other.id);
                    await StageManager.setAssignment('zz-probe-user', active.id);
                    expect('cleared for the active scene', StageManager.getState().assignments['zz-probe-user'], undefined);
                    await StageManager.setAssignment('zz-probe-user', other.id);
                    await StageManager.setAssignment('zz-probe-user', null);
                    expect('cleared by null', StageManager.getState().assignments['zz-probe-user'], undefined);
                });
            }
        },
        {
            id: 'status-and-lobby',
            label: 'Statuses cycle and clear, Do Not Disturb refuses a move, and the lobby scene is a listed stage',
            tier: 'headless',
            note: 'GM only. Saves and restores the stored state. Pulls nobody: a Do Not Disturb move is refused before any pull.',
            run: async ({ expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- the check writes a world setting.');
                const StageManager = await manager();
                const player = game.users.find((u) => !u.isGM);
                const other = game.scenes.contents.find((s) => s.id !== game.scenes.active?.id);
                if (!player || !other) throw new Error('Needs a player user and a scene that is not active.');
                expect('the cycle runs available, away, do not disturb, available',
                    [null, 'away', 'dnd'].map((s) => StageManager.nextStatus(s)), ['away', 'dnd', null]);
                await withState(StageManager, async () => {
                    await game.settings.set(MODULE_ID, 'stageState', { assignments: {}, extras: [], order: [] });
                    expect('a GM takes no status', await StageManager.setStatus(game.user.id, 'away'), false);
                    expect('nobody has a status at first', StageManager.statusOf(player.id), null);
                    await StageManager.setStatus(player.id, 'away');
                    expect('away is stored', StageManager.statusOf(player.id), 'away');
                    await StageManager.setStatus(player.id, 'dnd');
                    expect('a move onto Do Not Disturb is refused', await StageManager.moveUser(player.id, other.id), false);
                    expect('and nothing is held', StageManager.getState().assignments[player.id], undefined);
                    await StageManager.setStatus(player.id, null);
                    expect('null clears it', StageManager.statusOf(player.id), null);
                    await StageManager.setLobbyScene(other.id);
                    expect('the lobby scene is stored', StageManager.lobbyScene()?.id, other.id);
                    expect('and listed as a stage', StageManager.stages().find((s) => s.id === other.id)?.isLobby, true);
                    await StageManager.setLobbyScene(null);
                    expect('and cleared', StageManager.lobbyScene(), null);
                    let refused = false;
                    try {
                        await StageManager.setLobby(true);
                    } catch (_error) {
                        refused = true;
                    }
                    expect('lobby mode needs a lobby scene', refused, true);
                    await StageManager.setLobbyScene(other.id);
                    await StageManager.setLobby(true);
                    expect('lobby mode turns on', StageManager.lobbyOn(), true);
                    await StageManager.setLobbyScene(null);
                    expect('and goes off with the lobby scene', [StageManager.lobbyOn(), StageManager.getState().lobby], [false, false]);
                });
            }
        },
        {
            id: 'stages-listed',
            label: 'The panel lists the active scene first, the scene the GM is on, hand-added stages, and held scenes',
            tier: 'headless',
            note: 'GM only. Saves and restores the stored state.',
            run: async ({ expect }) => {
                if (!game.user?.isGM) throw new Error('GM only -- the check writes a world setting.');
                const StageManager = await manager();
                const active = game.scenes.active;
                const spare = game.scenes.contents.filter((s) => s.id !== active?.id && s.id !== canvas.scene?.id);
                if (!active || spare.length < 2) throw new Error('Needs an active scene and two others the GM is not viewing.');
                const [added, held] = spare;
                await withState(StageManager, async () => {
                    await game.settings.set(MODULE_ID, 'stageState', { assignments: {}, extras: [], order: [] });
                    expect('the active scene is a stage', StageManager.stages().some((s) => s.id === active.id), true);
                    expect('and comes first', StageManager.stages()[0].id, active.id);
                    expect('a scene nobody uses is not listed', StageManager.stages().some((s) => s.id === added.id), false);

                    await StageManager.addStage(added.id);
                    const listed = StageManager.stages().find((s) => s.id === added.id);
                    expect('a hand-added scene is listed', !!listed, true);
                    expect('and marked as hand-added', listed?.isExtra, true);

                    await StageManager.setAssignment('zz-probe-user', held.id);
                    expect('a scene someone is held on is listed', StageManager.stages().some((s) => s.id === held.id), true);

                    await StageManager.removeStage(added.id);
                    expect('a removed stage goes', StageManager.stages().some((s) => s.id === added.id), false);

                    // The GM's own order wins, and a stage they have not placed goes after the placed ones.
                    await StageManager.addStage(added.id);
                    await StageManager.setOrder([added.id, active.id]);
                    const ids = StageManager.stages().map((s) => s.id);
                    expect('a placed stage comes first', ids[0], added.id);
                    expect('the next placed stage follows', ids[1], active.id);
                    expect('an unplaced stage goes last', ids.indexOf(held.id) > ids.indexOf(active.id), true);
                });
            }
        }
    ]
};
