// ============================================
// APPLY TEST EFFECT - Script Macro
// ============================================
// Puts a timed Active Effect on every selected token, so the effect-expiry
// tests can be set up in two clicks instead of by hand in the effect sheet.
//
// Written for the items in `testing/effect-expiry.md`.
//
// TWO TICK SOURCES, AND THEY ARE NOT INTERCHANGEABLE. Blacksmith watches
// `updateWorldTime` and `updateCombat` separately, because a seconds duration
// moves with the world clock and a rounds duration moves with the combat
// tracker, and neither advances the other. So there are two tests here, not one:
//
//   in combat, rounds     pick "2 rounds", advance the tracker
//   out of combat, seconds  pick a seconds duration and leave "advance the world
//                           clock" ticked -- the macro applies it, jumps the
//                           clock past it, and reports PASS or FAIL itself
//
// WHY A MACRO AND NOT THE EFFECT SHEET. Those two tests turn on the duration
// being EXACTLY what the test says. Foundry's effect sheet writes whichever of
// `duration.seconds` / `duration.rounds` you filled in, and it is easy to leave
// the other populated or to type into the wrong one — at which point the test is
// measuring something else and passing or failing for the wrong reason. This
// writes one duration field and nulls the other, every time.
//
// Select one or more tokens, then run. GM only: effects are written to actors.
// ============================================

(async () => {
    const MODULE_ID = 'coffee-pub-blacksmith';

    if (!game.user.isGM) {
        ui.notifications.warn('Apply Test Effect: GM only.');
        return;
    }

    const tokens = canvas?.tokens?.controlled ?? [];
    if (!tokens.length) {
        ui.notifications.warn('Apply Test Effect: select at least one token first.');
        return;
    }

    // The two the tests actually call for, plus a long one for the "does NOT
    // convert" side of the Times Up case — its threshold is on short durations
    // only, so an effect above it must stay in seconds and is the control.
    const PRESETS = {
        '2 rounds': { rounds: 2, seconds: null },
        '20 seconds': { rounds: null, seconds: 20 },
        '1 round': { rounds: 1, seconds: null },
        '600 seconds (10 min, control)': { rounds: null, seconds: 600 }
    };

    const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: 'Apply Test Effect' },
        content: `
            <p>Applying to <strong>${tokens.length}</strong> selected token(s).</p>
            <div class="form-group">
                <label for="cpb-test-duration">Duration</label>
                <select id="cpb-test-duration" name="duration">
                    ${Object.keys(PRESETS).map((k) => `<option value="${k}">${k}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="cpb-test-advance">
                    <input type="checkbox" id="cpb-test-advance" name="advance" checked>
                    Advance the world clock past it (seconds durations only)
                </label>
                <p class="notes">
                    Runs the whole out-of-combat test in one go: the effect is applied, the
                    clock jumps past its duration, and Blacksmith's world-time sweep should
                    remove it immediately. Ignored for a rounds duration, which the clock
                    does not move.
                </p>
            </div>
        `,
        ok: {
            label: 'Apply',
            callback: (_event, button) => ({
                choice: button.form.elements.duration.value,
                advance: button.form.elements.advance.checked
            })
        },
        rejectClose: false
    });

    if (!result) return; // Dismissed. Writing nothing is the correct read of a dismissed dialog.

    const { choice, advance } = result;
    const { rounds, seconds } = PRESETS[choice];

    // `startRound`/`startTurn` matter: a rounds duration that does not know when
    // it began never reports a remainder, so the effect would sit there looking
    // permanent and the test would have nothing to measure.
    const inCombat = !!game.combat?.started;
    const duration = {
        rounds,
        seconds,
        startRound: inCombat ? game.combat.round : null,
        startTurn: inCombat ? game.combat.turn : null,
        startTime: game.time.worldTime
    };

    let applied = 0;
    const failures = [];

    for (const token of tokens) {
        const actor = token.actor;
        if (!actor) {
            failures.push(`${token.name}: no actor`);
            continue;
        }

        try {
            const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [{
                name: `Blacksmith Test (${choice})`,
                img: 'icons/svg/clockwork.svg',
                origin: actor.uuid,
                duration,
                // Nothing mechanical. The tests measure expiry and duration
                // reporting, and a real change would only add a second thing
                // that could go wrong.
                changes: [],
                disabled: false
            }]);

            const api = game.modules.get(MODULE_ID)?.api?.effects;
            const remaining = api?.getRemaining?.(effect) ?? null;
            console.log(`BLACKSMITH | TEST EFFECT applied to ${token.name}`, {
                effectId: effect.id,
                duration: effect.duration,
                // What the tests read. `unit` is the whole point of test 3: an
                // effect converted into rounds must still report seconds.
                blacksmithReports: remaining
            });
            applied++;
        } catch (error) {
            failures.push(`${token.name}: ${error?.message ?? error}`);
        }
    }

    const summary = `Applied "${choice}" to ${applied} token(s).`;
    if (failures.length) {
        console.warn('BLACKSMITH | TEST EFFECT failures', failures);
        ui.notifications.warn(`${summary} ${failures.length} failed — see console.`);
    } else {
        ui.notifications.info(summary);
    }

    // ONLY A ROUNDS DURATION NEEDS COMBAT. A seconds duration out of combat is
    // not a mistake to warn about -- it is the world-clock test, and Blacksmith
    // watches `updateWorldTime` as a tick source of its own, separately from
    // `updateCombat` (`api-effects.js`). An earlier version of this macro warned
    // whenever combat was absent and read as a refusal, which cost the author a
    // test run.
    if (rounds !== null && !inCombat) {
        ui.notifications.warn('That is a ROUNDS duration and no combat is running, so nothing will advance it. Start combat, or pick a seconds duration to test the world clock instead.');
        return;
    }

    if (!advance || seconds === null) return;
    if (!applied) return;

    // Past the end, not exactly to it: landing on the boundary leaves the
    // remainder at zero, and "expired" is `<= 0`, so an off-by-one here would
    // make a working sweep look broken.
    const jump = seconds + 1;
    const before = game.time.worldTime;
    await game.time.advance(jump);

    // The sweep runs from the `updateWorldTime` hook, which has to land first.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const survivors = [];
    for (const token of tokens) {
        for (const effect of token.actor?.effects ?? []) {
            if (effect.name?.startsWith('Blacksmith Test (')) survivors.push(`${token.name}: ${effect.name}`);
        }
    }

    console.log('BLACKSMITH | TEST EFFECT world clock advanced', {
        seconds: jump,
        worldTimeBefore: before,
        worldTimeAfter: game.time.worldTime,
        survivingTestEffects: survivors
    });

    if (survivors.length) {
        ui.notifications.error(`FAIL: advanced ${jump}s and ${survivors.length} test effect(s) are still there. See console.`);
    } else {
        ui.notifications.info(`PASS: advanced ${jump}s of world time and the effect expired.`);
    }
})();
