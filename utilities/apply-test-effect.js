// ============================================
// APPLY TEST EFFECT - Script Macro
// ============================================
// Puts a timed Active Effect on every selected token, so the effect-expiry
// tests can be set up in two clicks instead of by hand in the effect sheet.
//
// Written for the tests in `testing/` that read:
//   "apply a 2-round effect in combat, advance 3 rounds"
//   "apply a 20-second effect during combat (it converts to rounds)"
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

    const choice = await foundry.applications.api.DialogV2.prompt({
        window: { title: 'Apply Test Effect' },
        content: `
            <p>Applying to <strong>${tokens.length}</strong> selected token(s).</p>
            <div class="form-group">
                <label for="cpb-test-duration">Duration</label>
                <select id="cpb-test-duration" name="duration">
                    ${Object.keys(PRESETS).map((k) => `<option value="${k}">${k}</option>`).join('')}
                </select>
            </div>
        `,
        ok: {
            label: 'Apply',
            callback: (_event, button) => button.form.elements.duration.value
        },
        rejectClose: false
    });

    if (!choice) return; // Dismissed. Writing nothing is the correct read of a dismissed dialog.

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

    if (!inCombat) {
        ui.notifications.warn('Applied, but no combat is running — a rounds duration cannot tick down. Start combat for tests 1 and 2.');
    }

    const summary = `Applied "${choice}" to ${applied} token(s).`;
    if (failures.length) {
        console.warn('BLACKSMITH | TEST EFFECT failures', failures);
        ui.notifications.warn(`${summary} ${failures.length} failed — see console.`);
    } else {
        ui.notifications.info(summary);
    }
})();
