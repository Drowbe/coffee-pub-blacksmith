// ============================================
// REPAIR STATS DATA - Console Command
// ============================================
// Copy/paste into browser console (as GM) to repair two defects in stored statistics:
//
//   1. Combat history entries whose `sceneId` holds a whole Scene document -- every token,
//      wall, tile, light and sound of the map -- instead of an id string. This is pure
//      bloat in a world setting that loads on every launch. `sceneName` is stored
//      separately and is the only part the UI displays, so nothing visible is lost.
//
//   2. Statistics recorded against actors that are not player characters. ONLY PLAYER-OWNED
//      CHARACTER SHEETS ARE TRACKED -- no NPCs, including summons, spell effects, animated
//      weapons, and NPCs a player owns permanently. They accumulated records because the old
//      code tested player ownership, and a summoned creature is handed to its summoner's
//      player while it exists.
//
// As a safety net this macro will NOT clear the record of a non-character actor that has
// ACTED -- landed a hit, missed, dealt damage, healed, revived -- unless CLEAR_NONEMPTY is
// set to true. It lists them instead, so anything holding a real history gets read by a
// human before it is deleted. Incidental figures do not trip the guard: a monster knocked
// out in a fight accrues an unconscious count and a turn count without ever having acted,
// and treating those as records worth saving would bury the ones that are.
//
// Both repairs are idempotent -- running twice is harmless.
//
// THIS MACRO IS SELF-CONTAINED and depends on no Blacksmith code, so it runs against a
// world whose installed module still has the defect. That matters: the data needing repair
// lives on the world that has not been updated yet.
//
// ORDERING. Repairing before the fixed module is installed gives immediate relief but is
// not durable -- the old code rewrites a Scene document into the history at the end of the
// very next combat, and re-initializes statistics on non-party actors. For a one-shot
// repair, update the module first, then run this. To reclaim the space now, run it now and
// run it again after the update.
//
// EXPORT YOUR STATISTICS FIRST (party stats window -> export). Then run once with
// DRY_RUN = true to see what would change, and again with DRY_RUN = false to apply.
// ============================================

(async () => {
    const DRY_RUN = true;          // <-- set to false to actually write the changes
    const CLEAR_NONEMPTY = false;  // <-- set to true only to clear records that hold data

    const MODULE_ID = 'coffee-pub-blacksmith';
    const tag = 'BLACKSMITH | REPAIR';

    if (!game.user.isGM) {
        console.error(`${tag} Only a GM can repair stored statistics.`);
        return;
    }

    // THE PREDICATE IS INLINED ON PURPOSE, and this is the one place duplicating it is right.
    //
    // This macro exists to repair a world whose installed Blacksmith is OLDER than the code
    // that fixes the defect. Calling `api.stats.utils.isPlayerCharacter` would make the repair
    // depend on the fix already being installed, which is circular and leaves no way to
    // clean up before a release.
    //
    // Source of truth is `isPlayerCharacter` in `scripts/api-core.js`. Keep the two in step.
    const isPlayerCharacter = (actor) => {
        if (actor?.type !== 'character') return false;
        return actor.hasPlayerOwner || game.users?.some(u => u.character?.id === actor.id) || false;
    };

    // Every field worth naming, so a verdict is never mysterious. `deed` marks the ones that
    // record something the actor DID; the rest are incidental, accrued by anything that stands
    // in a fight -- a monster that gets knocked out has an `unconscious` count and a `turns`
    // count without ever having acted.
    const FIELDS = [
        { key: 'hits', deed: true, get: (l) => l.attacks?.totalHits },
        { key: 'misses', deed: true, get: (l) => l.attacks?.totalMisses },
        { key: 'dmg', deed: true, get: (l) => l.attacks?.totalDamage },
        { key: 'crits', deed: true, get: (l) => l.attacks?.criticals },
        { key: 'fumbles', deed: true, get: (l) => l.attacks?.fumbles },
        { key: 'healGiven', deed: true, get: (l) => l.healing?.given },
        { key: 'revivesGiven', deed: true, get: (l) => l.revives?.given },
        { key: 'healRecvd', deed: false, get: (l) => l.healing?.received ?? l.healing?.total },
        { key: 'revivesRecvd', deed: false, get: (l) => l.revives?.received },
        { key: 'unconscious', deed: false, get: (l) => l.unconscious?.count },
        { key: 'turns', deed: false, get: (l) => l.turnStats?.count },
        { key: 'moved', deed: false, get: (l) => l.movement },
        { key: 'combats', deed: false, get: (l) => l.mvp?.combats }
    ];

    // THE GUARD COUNTS DEEDS ONLY, and that distinction is the whole point of it. It exists
    // to stop a companion's history being deleted because its flag was forgotten -- and a
    // companion is recognisable by having acted. Counting incidental fields instead made every
    // monster that had ever been knocked out look like a record worth saving, which buries the
    // one actor that actually is.
    const deedCount = (l) => !l ? 0
        : FIELDS.filter(f => f.deed).reduce((n, f) => n + (Number(f.get(l)) || 0), 0);

    // Named non-zero fields, so REFUSE and CLEAR both explain themselves.
    const describe = (l) => {
        if (!l) return 'empty record';
        const parts = FIELDS.map(f => [f.key, Number(f.get(l)) || 0])
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}=${v}`);
        return parts.length ? parts.join(' ') : 'empty record';
    };

    const mb = (o) => (JSON.stringify(o ?? null).length / 1024 / 1024).toFixed(3);
    console.log(`${tag} ${DRY_RUN ? 'DRY RUN -- nothing will be written.' : 'APPLYING CHANGES.'}`);

    // ---- 1. Scene documents stored in `sceneId` -------------------------------------
    const history = game.settings.get(MODULE_ID, 'combatHistory') || [];
    const beforeMB = mb(history);
    let stripped = 0;

    const repairedHistory = history.map((entry) => {
        const sid = entry?.sceneId;
        // A correct value is a string id or null. Anything else is a serialized document.
        if (!sid || typeof sid === 'string') return entry;

        stripped++;
        const resolvedId = typeof sid === 'object' ? (sid._id ?? sid.id ?? null) : null;
        console.log(`${tag}   "${entry.sceneName ?? 'Unknown Scene'}" carried ${mb(sid)} MB of scene data -> ${resolvedId ?? 'null'}`);

        return {
            ...entry,
            sceneId: resolvedId,
            // Keep a usable name even if the entry never recorded one.
            sceneName: entry.sceneName || (typeof sid === 'object' ? sid.name : null) || 'Unknown Scene'
        };
    });

    console.log(`${tag} Combat history: ${history.length} entries, ${stripped} carrying scene documents.`);
    console.log(`${tag}   ${beforeMB} MB -> ${mb(repairedHistory)} MB`);

    // ---- 2. Lifetime statistics on actors that are not party -------------------------
    const holders = game.actors.filter((a) => !a.isToken && a.getFlag(MODULE_ID, 'playerStats'));
    const toClear = [];
    const refused = [];

    console.log(`${tag} ${holders.length} actor(s) hold a statistics record:`);
    for (const actor of holders) {
        const lifetime = actor.getFlag(MODULE_ID, 'playerStats')?.lifetime;
        const deeds = deedCount(lifetime);
        const party = isPlayerCharacter(actor);

        let verdict;
        if (party) {
            verdict = 'KEEP  ';
        } else if (deeds > 0 && !CLEAR_NONEMPTY) {
            refused.push(actor);
            verdict = 'REFUSE';
        } else {
            toClear.push(actor);
            verdict = 'CLEAR ';
        }

        console.log(`${tag}   ${verdict}  ${actor.name.padEnd(28)} type=${actor.type.padEnd(10)} ${describe(lifetime)}`);
    }

    if (refused.length > 0) {
        console.warn(`${tag} ${refused.length} non-character actor(s) have ACTED, and were NOT cleared:`);
        for (const a of refused) {
            console.warn(`${tag}   ${a.name} (${a.id}) -- ${describe(a.getFlag(MODULE_ID, 'playerStats')?.lifetime)}`);
        }
        console.warn(`${tag} Read the list. Only player-owned CHARACTERS are tracked, so these go.`);
        console.warn(`${tag} Set CLEAR_NONEMPTY = true and re-run to clear them.`);
    }

    console.log(`${tag} ${toClear.length} record(s) will be cleared, ${refused.length} refused.`);

    if (DRY_RUN) {
        console.log(`${tag} Dry run complete. Set DRY_RUN = false to apply.`);
        return;
    }

    // ---- Apply ----------------------------------------------------------------------
    if (stripped > 0) {
        await game.settings.set(MODULE_ID, 'combatHistory', repairedHistory);
        console.log(`${tag} Combat history rewritten.`);
    }

    let cleared = 0;
    for (const actor of toClear) {
        try {
            await actor.unsetFlag(MODULE_ID, 'playerStats');
            cleared++;
        } catch (err) {
            console.error(`${tag} Failed to clear statistics on ${actor.name}:`, err);
        }
    }

    console.log(`${tag} Done. ${stripped} scene document(s) stripped, ${cleared} record(s) cleared, ${refused.length} refused.`);
    ui.notifications.info(`Statistics repaired: ${beforeMB} MB -> ${mb(repairedHistory)} MB, ${cleared} record(s) cleared.`);
})();
