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
                expect('nothing stored', StageManager.normalizeState(undefined), { assignments: {}, extras: [] });
                expect('junk assignments are dropped', StageManager.normalizeState({ assignments: { a: 'x', b: 7, c: '' }, extras: 'no' }),
                    { assignments: { a: 'x' }, extras: [] });
                expect('extras are de-duplicated and filtered', StageManager.normalizeState({ extras: ['s1', 's1', '', 3, 's2'] }),
                    { assignments: {}, extras: ['s1', 's2'] });
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
                    await game.settings.set(MODULE_ID, 'stageState', { assignments: {}, extras: [] });
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
                    await game.settings.set(MODULE_ID, 'stageState', { assignments: {}, extras: [] });
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
                });
            }
        }
    ]
};
