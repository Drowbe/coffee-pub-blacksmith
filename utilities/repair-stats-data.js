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
//   2. Lifetime statistics recorded against actors that do not belong to the party --
//      summoned creatures and group actors. Summons (Conjure Animals, Spiritual Weapon,
//      Danse Macabre) are handed to a player so they can drive them, so they report
//      `hasPlayerOwner === true` while they exist, and the old predicate counted them as
//      party members. Persistent player-owned NPCs -- companions, familiars, sidekicks --
//      ARE party and are left alone.
//
//      Summons are identified by `flags.dnd5e.summon`, which dnd5e stamps on the actor it
//      creates. The report below lists every player-owned non-character actor and says
//      which side of the line it fell on, so a summon created some other way (a module, or
//      a hand-duplicated actor) is visible rather than silently kept.
//
//      For an actor no flag can classify -- a magic weapon with its own stat block looks
//      exactly like a familiar -- exclude it by hand and re-run:
//
//          await game.actors.getName('NAME').setFlag('coffee-pub-blacksmith', 'excludeFromStats', true);
//
// Both repairs are idempotent -- running twice is harmless.
//
// THIS MACRO IS SELF-CONTAINED and depends on no Blacksmith code, so it runs against a
// world whose installed module still has the defect. That matters: the data needing repair
// lives on the world that has not been updated yet.
//
// ORDERING. Repairing before the fixed module is installed gives immediate relief but is
// not durable -- the old code rewrites a Scene document into the history at the end of the
// very next combat, and re-initializes statistics on summons. For a one-shot repair, update
// the module first, then run this. To reclaim the space now, run it now and run it again
// after the update.
//
// EXPORT YOUR STATISTICS FIRST (party stats window -> export). Then run once with
// DRY_RUN = true to see what would change, and again with DRY_RUN = false to apply.
// ============================================

(async () => {
    const DRY_RUN = true;   // <-- set to false to actually write the changes

    const MODULE_ID = 'coffee-pub-blacksmith';
    const tag = 'BLACKSMITH | REPAIR';

    if (!game.user.isGM) {
        console.error(`${tag} Only a GM can repair stored statistics.`);
        return;
    }

    // THE PREDICATE IS INLINED ON PURPOSE, and this is the one place duplicating it is right.
    //
    // This macro exists to repair a world whose installed Blacksmith is OLDER than the code
    // that fixes the defect -- that is the whole point of a repair tool, and the data needing
    // repair is by definition on the world that has not been updated yet. Calling
    // `api.stats.utils.isPartyMember` would make the repair depend on the fix already being
    // installed, which is circular and leaves no way to clean up before a release.
    //
    // Source of truth is `isPartyMember` in `scripts/api-core.js`. Keep the two in step.
    const isPartyMember = (actor) => {
        if (!actor) return false;
        if (actor.getFlag(MODULE_ID, 'excludeFromStats')) return false;
        if (actor.type === 'group') return false;
        if (actor.flags?.dnd5e?.summon) return false;
        return actor.type === 'character'
            || actor.hasPlayerOwner
            || game.users?.some(u => u.character?.id === actor.id)
            || false;
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

    const afterMB = mb(repairedHistory);
    console.log(`${tag} Combat history: ${history.length} entries, ${stripped} carrying scene documents.`);
    console.log(`${tag}   ${beforeMB} MB -> ${afterMB} MB`);

    // ---- 2. Lifetime statistics on actors that do not belong to the party -------------
    //
    // Every player-owned non-character actor is reported, kept or not. A summon created by
    // something other than a dnd5e summoning activity carries no flag and so counts as
    // party -- it is kept, and listed here, rather than quietly deleted on a guess.
    const candidates = game.actors.filter((a) =>
        !a.isToken && a.type !== 'character' && (a.hasPlayerOwner || a.getFlag(MODULE_ID, 'playerStats'))
    );

    if (candidates.length > 0) {
        console.log(`${tag} Player-owned non-character actors:`);
        for (const actor of candidates) {
            const lifetime = actor.getFlag(MODULE_ID, 'playerStats')?.lifetime;
            const hits = lifetime?.attacks?.totalHits ?? 0;
            const dmg = lifetime?.attacks?.totalDamage ?? 0;
            const why = actor.getFlag(MODULE_ID, 'excludeFromStats') ? 'excluded'
                : actor.flags?.dnd5e?.summon ? 'summoned'
                : actor.type;
            const verdict = isPartyMember(actor) ? 'KEEP  (party)' : `CLEAR (${why})`;
            const record = lifetime ? `${hits} hits, ${dmg} damage` : 'no statistics';
            console.log(`${tag}   ${verdict}  ${actor.name.padEnd(28)} type=${actor.type.padEnd(8)} ${record}`);
        }
    }

    const strays = game.actors.filter((actor) =>
        actor.getFlag(MODULE_ID, 'playerStats') && !isPartyMember(actor)
    );

    console.log(`${tag} ${strays.length} actor(s) hold statistics that will be cleared.`);

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
    for (const actor of strays) {
        try {
            await actor.unsetFlag(MODULE_ID, 'playerStats');
            cleared++;
        } catch (err) {
            console.error(`${tag} Failed to clear statistics on ${actor.name}:`, err);
        }
    }

    console.log(`${tag} Done. ${stripped} scene document(s) stripped, ${cleared} stray stat record(s) cleared.`);
    ui.notifications.info(`Statistics repaired: ${beforeMB} MB -> ${afterMB} MB, ${cleared} stray record(s) cleared.`);
})();
