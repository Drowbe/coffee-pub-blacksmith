// ===== LEGACY FOUNDRY GLOBALS =====
//
// Which un-namespaced Foundry globals still resolve on the Foundry generation actually running.
//
// WHY THIS EXISTS. On 2026-09-09 two sessions catalogued 91 call sites across six categories on the
// shared belief that "v14 removes the un-namespaced globals", and planned a week of work around it. One
// line of console output refuted the premise: on 14.364 `CONST`, `Dialog`, `Application` and
// `FormApplication` all still resolve, and only `mergeObject`, `AudioHelper` and `duplicate` were gone.
// The real migration was two lines in one file. Every other site was deprecation debt with no deadline.
//
// The failure was not the audit -- the counts were accurate. It was reasoning confidently from an
// untested assumption about a generation nobody had asked. This answers that question in the first five
// minutes instead of the last, and it will answer it again for v15 without anybody re-deriving it.
//
// HOW TO ASK SAFELY. `typeof X` is the only expression that does not throw on an undeclared identifier.
// `X?.y` and `X.y ?? z` both throw `ReferenceError` -- optional chaining and nullish coalescing guard a
// null or undefined VALUE, never an unresolvable BINDING. That distinction is not academic: roughly a
// quarter of the suite's `CONST` sites are written as `CONST?.FOO ?? {}` or `CONST.FOO ?? {}`, which read
// as migration-ready defensive code and are exactly as fatal as the bare form. They are the sites a human
// audit skips. This module uses `in globalThis`, which is likewise safe and needs no `eval`.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Un-namespaced globals Foundry has deprecated, with where each moved to.
 *
 * Being listed here is not a claim that a global is gone -- that is the question this module asks the
 * running client. It is a claim that the namespaced form on the right is the one to write.
 */
export const LEGACY_GLOBALS = [
    // --- foundry.utils ---
    ...['mergeObject','duplicate','deepClone','diffObject','flattenObject','expandObject','filterObject',
        'getType','setProperty','getProperty','hasProperty','invertObject','randomID','isNewerVersion',
        'benchmark','timeSince','formatFileSize','parseS3URL','getRoute','fetchWithTimeout',
        'fetchJsonWithTimeout','debounce','throttle','deepFreeze','escapeHTML','logCompatibilityWarning',
        'isEmpty','encodeURL','srcExists','saveDataToFile','readTextFromFile','Semaphore','Color',
        'Collection','StringTree','WordTree','BitMask'].map(n => ({ name: n, modern: `foundry.utils.${n}` })),

    // --- foundry.audio ---
    ...['AudioHelper','Sound','AudioContainer'].map(n => ({ name: n, modern: `foundry.audio.${n}` })),

    // --- dice terms. `Roll` itself survives, which is what makes this family easy to miss. ---
    ...['Die','DiceTerm','NumericTerm','OperatorTerm','PoolTerm','ParentheticalTerm','StringTerm',
        'FunctionTerm','RollTerm','Coin','FateDie','MersenneTwister'].map(n => ({ name: n, modern: `foundry.dice.terms.${n}` })),

    // --- Application V1 and the sidebar family ---
    { name: 'Application', modern: 'foundry.applications.api.ApplicationV2' },
    { name: 'FormApplication', modern: 'foundry.applications.api.ApplicationV2 + HandlebarsApplicationMixin' },
    { name: 'Dialog', modern: 'foundry.applications.api.DialogV2' },
    { name: 'DocumentSheet', modern: 'foundry.applications.api.DocumentSheetV2' },
    { name: 'FilePicker', modern: 'foundry.applications.apps.FilePicker.implementation' },
    { name: 'TextEditor', modern: 'foundry.applications.ux.TextEditor.implementation' },
    { name: 'ContextMenu', modern: 'foundry.applications.ux.ContextMenu' },
    { name: 'DragDrop', modern: 'foundry.applications.ux.DragDrop' },
    { name: 'Tabs', modern: 'foundry.applications.ux.Tabs' },
    { name: 'SearchFilter', modern: 'foundry.applications.ux.SearchFilter' },
    ...['DocumentDirectory','SidebarTab','SidebarDirectory','PlayerList','PermissionConfig','WorldConfig',
        'HeadsUpDisplay','TextureUtils'].map(n => ({ name: n, modern: `see foundry.applications.* / foundry.canvas.* for ${n}` }))
];

/**
 * Names confirmed ABSENT from `globalThis` on Foundry 14.367 (dnd5e 5.3.3), 2026-09-09.
 *
 * Recorded so the probe can report what a LATER generation removed on top of these, which is the
 * question that actually matters when v15 lands. Not authoritative for any other version.
 */
export const REMOVED_IN_14_367 = new Set([
    'mergeObject','duplicate','deepClone','diffObject','flattenObject','expandObject','filterObject',
    'getType','setProperty','getProperty','hasProperty','invertObject','randomID','isNewerVersion',
    'benchmark','timeSince','formatFileSize','parseS3URL','getRoute','fetchWithTimeout',
    'fetchJsonWithTimeout','debounce','throttle','deepFreeze','escapeHTML','logCompatibilityWarning',
    'isEmpty','encodeURL','Semaphore','StringTree','WordTree','BitMask','AudioHelper','Sound',
    'AudioContainer','DocumentDirectory','SidebarTab','SidebarDirectory','PlayerList','PermissionConfig',
    'WorldConfig','HeadsUpDisplay','Die','DiceTerm','NumericTerm','OperatorTerm','PoolTerm',
    'ParentheticalTerm','StringTerm','FunctionTerm','RollTerm','Coin','FateDie','MersenneTwister',
    'TextureUtils'
]);

/**
 * Probe the running client for every entry in {@link LEGACY_GLOBALS}.
 *
 * @returns {{generation: number|string, version: string, present: object[], removed: object[]}}
 *   `removed` is the list that matters -- anything calling one of those names throws today.
 */
export function probeLegacyGlobals() {
    const present = [];
    const removed = [];

    for (const entry of LEGACY_GLOBALS) {
        // `in` cannot throw and needs no eval, unlike a bare reference or `typeof` on a dynamic name.
        const exists = entry.name in globalThis;
        const row = { ...entry, type: exists ? typeof globalThis[entry.name] : 'undefined' };
        (exists ? present : removed).push(row);
    }

    // Anything removed that 14.367 still had is news: a later generation took it away.
    const newlyRemoved = removed.filter(r => !REMOVED_IN_14_367.has(r.name));

    return {
        generation: game?.release?.generation ?? 'unknown',
        version: game?.version ?? game?.release?.version ?? 'unknown',
        present,
        removed,
        newlyRemoved
    };
}

/**
 * Console-friendly form of {@link probeLegacyGlobals}. Bound to `blacksmithLegacyGlobals()`.
 */
export function showLegacyGlobals() {
    const result = probeLegacyGlobals();
    console.groupCollapsed(
        `[${MODULE.ID}] Legacy globals on Foundry ${result.version} (generation ${result.generation}): `
        + `${result.removed.length} removed, ${result.present.length} still resolve`
    );

    if (result.removed.length) {
        console.warn('REMOVED -- calling any of these throws ReferenceError on this client:');
        console.table(result.removed.map(r => ({ global: r.name, 'use instead': r.modern })));
    } else {
        console.log('None of the tracked legacy globals have been removed on this client.');
    }

    console.log(
        'STILL RESOLVING -- deprecated, not yet removed. Worth migrating, but not a break on this '
        + 'generation. Do not describe these as fatal.'
    );
    console.table(result.present.map(r => ({ global: r.name, type: r.type, 'use instead': r.modern })));
    console.groupEnd();
    return result;
}

/**
 * Log removed globals once at startup so a generation change surfaces without anyone going looking.
 *
 * Deliberately quiet when nothing is removed: a check that prints on every load stops being read.
 * The full table is always available on demand via `blacksmithLegacyGlobals()`.
 */
export function reportLegacyGlobalsAtStartup() {
    const result = probeLegacyGlobals();

    if (result.newlyRemoved.length) {
        console.warn(
            `[${MODULE.ID}] Foundry ${result.version} has removed ${result.newlyRemoved.length} global(s) that `
            + `14.367 still had: ${result.newlyRemoved.map(r => r.name).join(', ')}. `
            + 'This generation is newer than anything Blacksmith has been checked against. '
            + 'Run blacksmithLegacyGlobals() and re-scan the suite for these names.'
        );
    }

    if (result.removed.length) {
        console.warn(
            `[${MODULE.ID}] Foundry ${result.version} has removed ${result.removed.length} legacy global(s): `
            + `${result.removed.map(r => r.name).join(', ')}. `
            + 'Run blacksmithLegacyGlobals() for the replacements. Any module still calling these throws.'
        );
    }

    postConsoleAndNotification(
        MODULE.NAME,
        'Legacy Globals | Probe',
        `Foundry ${result.version}: ${result.removed.length} removed, ${result.present.length} still resolve`,
        true,
        false
    );

    if (typeof window !== 'undefined') {
        window.blacksmithLegacyGlobals = () => showLegacyGlobals();
    }

    return result;
}
