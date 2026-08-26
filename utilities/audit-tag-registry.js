// ============================================
// AUDIT TAG REGISTRY - Console Command
// ============================================
// Copy/paste into the browser console as GM. Reports what is in the shared tag
// registry and, for each entry, whether anything accounts for it.
//
// WHY THIS IS A UTILITY AND NOT AN API. Answering "is this registry entry stale?"
// needs knowledge no single module has: every context key that exists, and the
// declared taxonomy across all of them. A consumer trying to assemble that has to
// hardcode a list of context keys it does not own, which passes today and silently
// mis-flags the moment another module adds a context. Librarian arrived at exactly
// this check, saw the problem, and correctly refused to build it.
//
// So the cross-context knowledge stays here. Consumers get `api.tags.getTagCounts`
// for their own vocabulary; the registry-wide question is GM housekeeping, asked
// occasionally by a person, and this is where a person asks it.
//
// THREE KINDS OF "ZERO RECORDS", and telling them apart is the entire point:
//   in use          - some context has records carrying it
//   declared        - no records, but a taxonomy offers it as a suggestion. NOT stale;
//                     this is a suggestion vocabulary doing its job.
//   unaccounted     - no records anywhere, offered by no taxonomy. The interesting set.
//
// Reports only. Deleting is a separate, deliberate act - the last section prints the
// command, and you run it after reading the list.
//
// Related: `api.tags.getTagCounts(contextKey)` is the consumer-facing half, for a module
// scoping its own vocabulary. This is the half that needs to see across modules.
// ============================================

(async () => {
    const MODULE_ID = 'coffee-pub-blacksmith';
    const api = game.modules.get(MODULE_ID)?.api?.tags;
    if (!api) {
        console.error('BLACKSMITH | TAGS api.tags not available - is the module enabled?');
        return;
    }
    if (!game.user?.isGM) {
        console.warn('BLACKSMITH | TAGS Audit reads world settings; run it as GM.');
        return;
    }

    const assignments = game.settings.get(MODULE_ID, 'tagAssignments') ?? {};
    const registry    = api.getRegistry();

    // --- usage, per tag, across every context -------------------------------
    const usage = new Map();          // tag -> Map(contextKey -> count)
    for (const contextKey of Object.keys(assignments)) {
        const counts = api.getTagCounts(contextKey);
        for (const [tag, n] of Object.entries(counts)) {
            if (!usage.has(tag)) usage.set(tag, new Map());
            usage.get(tag).set(contextKey, n);
        }
    }

    // --- what any taxonomy offers -------------------------------------------
    // `getChoices` needs a context key, and the public surface cannot list them -- which
    // is exactly why a consumer cannot write this audit. Being Blacksmith's own tooling,
    // this reads the taxonomy maps directly to enumerate every DECLARED context, not just
    // the ones that happen to hold assignments. Without that, a tag offered only by an
    // unused context reads as unaccounted, and deleting it would remove a live suggestion.
    const { TagManager } = await import(`/modules/${MODULE_ID}/scripts/manager-tags.js`);
    await TagManager.ensureTaxonomyLoaded();

    const contextKeys = new Set(Object.keys(assignments));
    for (const map of [TagManager._builtinRegistry, TagManager._overrideRegistry, TagManager._runtimeRegistry]) {
        for (const key of map.keys()) contextKeys.add(key);
    }

    const declared = new Set();
    for (const contextKey of contextKeys) {
        for (const choice of api.getChoices(contextKey) ?? []) declared.add(choice.key);
    }

    // --- classify ------------------------------------------------------------
    const inUse = [], declaredUnused = [], unaccounted = [];
    for (const tag of registry) {
        if (usage.has(tag)) inUse.push(tag);
        else if (declared.has(tag)) declaredUnused.push(tag);
        else unaccounted.push(tag);
    }

    console.log(`BLACKSMITH | TAGS registry audit - ${registry.length} entries, `
        + `${contextKeys.size} context(s) known`);

    console.groupCollapsed(`IN USE (${inUse.length})`);
    for (const tag of inUse.sort()) {
        const per = [...usage.get(tag)].map(([c, n]) => `${c}:${n}`).join('  ');
        console.log(`  ${tag.padEnd(32)} ${per}`);
    }
    console.groupEnd();

    console.groupCollapsed(`DECLARED, NOT YET USED (${declaredUnused.length}) - not stale`);
    console.log('  A taxonomy offers these as suggestions. Deleting them is wrong.');
    for (const tag of declaredUnused.sort()) console.log(`  ${tag}`);
    console.groupEnd();

    console.log(`UNACCOUNTED (${unaccounted.length}) - no records, offered by no taxonomy:`);
    for (const tag of unaccounted.sort()) console.log(`  ${tag}`);

    if (unaccounted.length) {
        console.log('\nRead the list first. To delete every entry above:\n'
            + `  for (const t of ${JSON.stringify(unaccounted.sort())}) `
            + `await game.modules.get('${MODULE_ID}').api.tags.delete(t);`);
    }

    console.log(`\nScanned ${contextKeys.size} context(s): every one holding assignments, `
        + 'plus every one any taxonomy declares.');
    console.log('A tag reaches UNACCOUNTED by being used nowhere and offered by nothing. The registry is '
        + 'append-only apart from an explicit delete(), so a tag whose every record was later removed '
        + 'stays here forever. That is ordinary sediment, not a fault.');
    console.log('CAVEAT: a taxonomy registered at RUNTIME through api.tags.register() only counts if that '
        + 'module has registered by the time this runs. No sibling does so today, which is why the list '
        + 'above is currently complete. If one starts, run this late in the session and check unfamiliar '
        + 'entries against that module before deleting anything.');
})();
