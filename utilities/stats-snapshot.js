// ============================================
// COMBAT STATS SNAPSHOT - Script Macro
// ============================================
// Prints the combat statistics counters, and the difference since the last time
// it was run. Paste into a script macro and run it before and after an attack.
//
// WHAT IT IS FOR. The remaining midi-qol work stops the statistics DAMAGE lane
// yielding to midi, so both lanes will record and something has to prove they do
// not both record the SAME thing. There is no way to check that by looking: a
// damage figure counted twice looks exactly like one counted once at the moment
// it lands, and the error is only visible in a running total.
//
// So the test is a comparison, and a comparison needs a baseline taken BEFORE the
// change. That is what this produces. Run it now, keep the output, and the same
// fight after the change must produce the same numbers.
//
// WHY A MACRO RATHER THAN READING THE CARD. The card rounds, aggregates and omits.
// This reads the counters the code actually increments, which is where a double
// count appears first and unambiguously.
//
// GM only: the statistics live on the GM client.
// ============================================

(() => {
    const MODULE_ID = 'coffee-pub-blacksmith';

    if (!game.user.isGM) {
        ui.notifications.warn('Stats Snapshot: GM only.');
        return;
    }

    const combat = game.combat;
    if (!combat) {
        ui.notifications.warn('Stats Snapshot: no combat. Start one first.');
        return;
    }

    // Read the live in-memory object rather than the persisted flag: the flag is
    // written on a debounce, so straight after an attack it is behind.
    // `api.stats.combat` is a namespace of query METHODS; the class holding the live
    // counters is exposed separately as `api.stats.CombatStats` (`api-stats.js:209`).
    const api = game.modules.get(MODULE_ID)?.api;
    const stats = api?.stats?.CombatStats ?? null;
    const totals = stats?.combatStats?.totals ?? null;

    if (!totals) {
        ui.notifications.error('Stats Snapshot: could not reach the combat statistics. Is trackCombatStats on?');
        console.warn('>>>> STATS could not reach the counters', { api: !!api, stats: !!stats });
        return;
    }

    const now = {
        attempts: totals.attacks?.attempts ?? 0,
        hits: totals.attacks?.hits ?? 0,
        misses: totals.attacks?.misses ?? 0,
        crits: totals.attacks?.crits ?? 0,
        fumbles: totals.attacks?.fumbles ?? 0,
        damageDealt: totals.damage?.dealt ?? 0,
        damageTaken: totals.damage?.taken ?? 0,
        healingGiven: totals.healing?.given ?? 0,
        kills: totals.kills ?? 0,
        // The per-hit records, because a doubled TOTAL and a doubled RECORD are
        // different bugs: the first is one increment applied twice, the second is
        // the whole event processed twice. They need telling apart.
        hitRecords: stats.currentStats?.hits?.length ?? 0,
        missRecords: stats.currentStats?.misses?.length ?? 0
    };

    const previous = globalThis.__cpbStatsSnapshot ?? null;
    globalThis.__cpbStatsSnapshot = now;

    const midiOn = (() => {
        try {
            return !!game.modules.get('midi-qol')?.active
                && game.settings.get(MODULE_ID, 'enableMidiIntegration') !== false;
        } catch { return false; }
    })();

    // A MARKER THAT SURVIVES A BUSY CONSOLE. A live world logs steadily -- Curator
    // swapping a dead token's image, Squire rebuilding a tray, midi narrating a
    // workflow -- so a plain prefix is easy to lose by the time you scroll back. `>>>>`
    // filters cleanly and matches nothing else in the suite.
    const MARK = '>>>> STATS';
    console.log(`${MARK} (round ${combat.round}, midi lane ${midiOn ? 'ON' : 'off'}) -- filter the console for: ${MARK}`);
    if (!previous) {
        console.table(now);
        ui.notifications.info(`Baseline taken. Act, then run again. Console filter: ${MARK}`);
        return;
    }

    const delta = {};
    for (const key of Object.keys(now)) delta[key] = now[key] - previous[key];
    console.table({ before: previous, after: now, delta });

    // The delta again as one line, because `console.table` does not survive being
    // copied out of the console and pasting a table is how the numbers get mangled.
    const moved = Object.entries(delta).filter(([, v]) => v !== 0);
    console.log(`${MARK} DELTA: ${moved.length ? moved.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') : 'nothing changed'}`);

    // ONLY `attempts` IS A RELIABLE DOUBLE-COUNT SIGNAL, and only against a known
    // number of swings.
    //
    // `attempts` increments once per ATTACK, never per target, so it is the one
    // counter that maps to something the person running this can count themselves.
    // `hits` and `hitRecords` legitimately rise once per TARGET, so a single swing at
    // two creatures produces two of each and flagging that is noise -- an earlier
    // version did, on a Scorching Ray at two targets, and reported a double count that
    // was not one.
    //
    // So this states what was seen and leaves the judgement where it belongs. The
    // reader knows how many times they attacked; the macro does not.
    if (delta.attempts >= 2) {
        console.warn(`>>>> STATS attempts rose by ${delta.attempts}.`,
            `\n  Correct if you made ${delta.attempts} attack rolls (several rays, several swings).`,
            '\n  A DOUBLE COUNT if you made one. Attempts is per attack, never per target.');
        ui.notifications.warn(`Stats Snapshot: attempts +${delta.attempts}. Correct only if you attacked that many times.`);
    } else {
        ui.notifications.info('Stats Snapshot: delta printed to console.');
    }
})();
