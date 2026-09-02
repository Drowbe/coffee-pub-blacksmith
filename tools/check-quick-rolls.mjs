#!/usr/bin/env node
/**
 * Guard the Quick Rolls library against the two ways it can break silently.
 *
 * 1. THE ROW AND ITS READER MUST AGREE. `_quickRollRow` writes a check item's
 *    `data-*`; `_handleQuickRollItem` reads them back, and so do `_computeFavoriteId`
 *    and `_favoriteRecordFromItem`. An attribute the reader wants and the writer does
 *    not set is `undefined` — which every one of those readers treats as a legitimate
 *    "not set" rather than as an error. The roll fires, quietly, as something else:
 *    the wrong DC, the wrong side, or no contest at all.
 *
 *    These were twenty-four rows of hand-written markup until the library was made
 *    editable. While they were markup a mismatch was at least visible in the diff;
 *    now the writer is a function forty lines from its reader.
 *
 * 2. THE BUILT-IN ROLLS MUST STILL BE THE TWENTY-FOUR. They seed a world once and
 *    are never re-planted, so a default lost to a typo in the terse `flatMap` that
 *    builds them is lost for every world created afterwards, and no existing world
 *    reports it.
 *
 * 3. AN EXPORTED LIBRARY MUST IMPORT BACK. Export and parse are inverses; when they
 *    disagree the GM finds out at the far end, in another world, with the file that
 *    was supposed to carry their work.
 *
 * 4. THE ROLL BUILDER MUST STAY A TOOL WINDOW. It was written once as a bare window
 *    with its own root and its own painted fields, which looked like a different
 *    module and ignored the user's Light/Dark/Glass choice. Nothing errors when a
 *    window opts out of the shell -- it just renders, wrong, in two themes out of
 *    three, and only a person looking at it can tell.
 *
 *   node tools/check-quick-rolls.mjs
 *
 * Exits non-zero on a violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DIALOG = 'scripts/window-skillcheck.js';
const MANAGER = 'scripts/manager-quick-rolls.js';
const TEMPLATE = 'templates/window-skillcheck.hbs';

const problems = [];
/** The evaluated built-ins, shared with the round-trip section below. */
let defaultsForRoundTrip = null;
const dialog = read(DIALOG);
const manager = read(MANAGER);
const template = read(TEMPLATE);

/**
 * One method's source, from its class-body signature to its matching brace.
 *
 * The walk starts at the brace the SIGNATURE ENDS WITH, not at the first `{` after
 * the name. A default-object parameter -- `normalize(raw = {})` -- puts a brace
 * inside the signature, and a walk started there closes on the parameter and returns
 * a fragment that parses into nonsense.
 */
function slice(src, name, file) {
    const signature = `\n    ${name} {`;
    const start = src.indexOf(signature);
    if (start < 0) {
        problems.push(`${file}: method not found: ${name} -- renamed, or the section was rewritten`);
        return null;
    }
    let depth = 0;
    for (let i = start + signature.length - 1; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    problems.push(`${file}: unbalanced braces after ${name}`);
    return null;
}

// ===== THE ROW AND ITS READER ======================================

const rowSrc = slice(dialog, '_quickRollRow(roll)', DIALOG);
const handlerSrc = slice(dialog, '_handleQuickRollItem(htmlElement, item)', DIALOG);

if (rowSrc && handlerSrc) {
    const written = new Set([...rowSrc.matchAll(/row\.dataset\.([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]));
    const read_ = new Set([...handlerSrc.matchAll(/item\.dataset\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));

    for (const key of read_) {
        if (!written.has(key)) {
            problems.push(`${DIALOG}: _handleQuickRollItem reads item.dataset.${key}, which _quickRollRow never writes -- it will be undefined on every quick roll, and the handler treats that as "not set" rather than reporting it`);
        }
    }

    // The favourites machinery hashes a FIXED set of attributes into a stable id. A row
    // missing one still favourites, under an id that no longer matches the row it came
    // from -- so the heart never lights and the favourite cannot be removed from here.
    const favoriteSrc = slice(dialog, 'static _computeFavoriteId(item)', DIALOG);
    if (favoriteSrc) {
        const hashed = [...favoriteSrc.matchAll(/item\?\.dataset\?\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
        for (const key of ['type', 'value', 'rollType']) {
            if (!hashed.includes(key)) continue;
            if (!written.has(key)) {
                problems.push(`${DIALOG}: _computeFavoriteId hashes item.dataset.${key} but _quickRollRow does not set it -- a favourited quick roll would get an id its own row cannot reproduce`);
            }
        }
    }

    // WHO ROLLS must reach the handler in BOTH modes. For a normal roll it is folded
    // into `rollType` (`party` / `individual`); a contest spends `rollType` on saying it
    // is a contest, so the answer travels separately in `data-targets`. Dropping either
    // half gives a contested quick roll that fires against whatever happens to be
    // selected -- or refuses with "select at least one actor" -- which is what it did
    // before the attribute existed and is not distinguishable from a GM's own mistake.
    if (!/row\.dataset\.targets\s*=/.test(rowSrc)) {
        problems.push(`${DIALOG}: _quickRollRow must write data-targets on every row -- a contested roll has no other way to say who rolls it`);
    }
    if (!/item\.dataset\.targets/.test(handlerSrc)) {
        problems.push(`${DIALOG}: _handleQuickRollItem must read item.dataset.targets -- without it a contested quick roll cannot select its own challengers, and fires against whatever was already selected`);
    }

    // THE MARKS IN FRONT OF THE DESCRIPTION must come from the roll's own fields.
    // They exist because two rows can otherwise be identical on screen and behave
    // differently -- "DC 15 Perception Check" says nothing about group success or
    // about taking over the table's screen. A mark wired to the wrong field, or
    // dropped, restores exactly that: a list you fire from where the rows lie.
    for (const [pattern, what] of [
        // Each CONDITION pinned to ITS icon, in order. Checking only that both
        // conditions exist let the two icons be swapped -- a group roll wearing the
        // individual mark, which is the exact lie these marks were added to stop.
        [/roll\.mode === 'contested'\)\s*\{\s*meta\.appendChild\(markIcon\('fas fa-people-arrows'[\s\S]*?roll\.success === 'group'\)\s*\{\s*meta\.appendChild\(markIcon\('fas fa-users'[\s\S]*?else\s*\{\s*meta\.appendChild\(markIcon\('fas fa-user-check'/,
            'how success is decided, with contested / group / individual each on its own icon'],
        [/if \(roll\.dc\)[\s\S]{0,200}?DC \$\{roll\.dc\}/, 'the DC, shown only when there is one'],
        // Anchored to the MARK, not to `fa-film` near `isCinematic`. The looser form
        // was satisfied by the play indicator further down the same method, which is
        // also a film reel when the roll is cinematic -- so swapping the mark's icon
        // passed.
        [/markIcon\('fas fa-film'/, 'whether it plays as a cinematic'],
        [/markIcon\('fas fa-comment'/, 'that it posts to chat when it is not cinematic']
    ]) {
        if (!pattern.test(rowSrc)) {
            problems.push(`${DIALOG}: _quickRollRow no longer marks ${what} -- without it two rows can look identical and do different things`);
        }
    }

    // `data-dc` is set CONDITIONALLY and must stay that way: the handler treats the
    // attribute's presence as "override the window's DC box", so writing an empty
    // string forces a blank DC onto every roll that meant to inherit one.
    if (!/if \(roll\.dc\) row\.dataset\.dc/.test(rowSrc)) {
        problems.push(`${DIALOG}: _quickRollRow must set data-dc only when the roll has one -- _handleQuickRollItem reads the attribute's PRESENCE as an override, so an empty string blanks the DC instead of leaving it alone`);
    }
}

// ===== THE BUILT-IN ROLLS ==========================================

const defaultsStart = manager.indexOf('static DEFAULTS = [');
if (defaultsStart < 0) {
    problems.push(`${MANAGER}: DEFAULTS not found`);
} else {
    const body = manager.slice(defaultsStart + 'static DEFAULTS = '.length, manager.lastIndexOf('];') + 2);
    let defaults = null;
    try {
        defaults = new Function('foundry', `return ${body}`)({ utils: { randomID: () => 'stub' } });
    } catch (error) {
        problems.push(`${MANAGER}: DEFAULTS does not evaluate: ${error.message}`);
    }

    if (defaults) {
        defaultsForRoundTrip = defaults;
        // The counts the markup had, before it became data. They are the migration:
        // a world seeded with fewer than these lost a roll somebody used to have.
        const expected = {
            'Party Rolls (Individual Success)': 5,
            'Party Rolls (Group Success)': 5,
            'Common Rolls': 6,
            'Grapple Rolls': 4,
            'Manipulation Rolls': 3,
            'Stealth Rolls': 1
        };
        const counts = {};
        for (const roll of defaults) counts[roll.category] = (counts[roll.category] ?? 0) + 1;

        for (const [category, count] of Object.entries(expected)) {
            if (counts[category] !== count) {
                problems.push(`${MANAGER}: category "${category}" has ${counts[category] ?? 0} built-in roll(s), expected ${count} -- these are the rows the hand-written markup had, and a world seeds from them exactly once`);
            }
        }
        for (const category of Object.keys(counts)) {
            if (!(category in expected)) {
                problems.push(`${MANAGER}: unexpected built-in category "${category}" -- add it to this check's table deliberately, so the count is guarded like the others`);
            }
        }

        const ids = new Set();
        for (const roll of defaults) {
            if (ids.has(roll.id)) {
                problems.push(`${MANAGER}: two built-in rolls share the id "${roll.id}" -- the second overwrites the first on save, and a favourite of either points at whichever survived`);
            }
            ids.add(roll.id);
            for (const field of ['id', 'category', 'label', 'icon', 'mode', 'challenger', 'rollTitle']) {
                if (roll[field] == null || roll[field] === '') {
                    problems.push(`${MANAGER}: built-in roll "${roll.id ?? '(no id)'}" has no ${field}`);
                }
            }
            if (roll.mode === 'contested' && !roll.defender?.value) {
                problems.push(`${MANAGER}: contested built-in roll "${roll.id}" has no defender`);
            }
            if (roll.mode !== 'contested' && !roll.success) {
                problems.push(`${MANAGER}: normal built-in roll "${roll.id}" does not say whether success is group or individual`);
            }
        }
    }
}

// ===== EXPORT AND IMPORT ARE INVERSES ==============================
//
// `parseImport` is sliced out and run against what `exportPayload` produces, so the
// round trip is exercised rather than assumed. A GM only ever discovers a broken one
// at the far end: in another world, with the file that was meant to carry their work
// and a message saying it contains no rolls.

const parseSrc = slice(manager, 'static parseImport(text)', MANAGER);
const normalizeSrc = slice(manager, 'static normalize(raw = {})', MANAGER);
const sideSrc = slice(manager, 'static _normalizeSide(side, fallbackType)', MANAGER);
const idSrc = slice(manager, 'static newId()', MANAGER);
const typesMatch = manager.match(/static ROLL_TYPES = \[[\s\S]*?\];/);
const iconMatch = manager.match(/static DEFAULT_ICON = '[^']*';/);
const versionMatch = manager.match(/static EXPORT_VERSION = \d+;/);

if (parseSrc && normalizeSrc && sideSrc && idSrc && typesMatch && iconMatch && versionMatch) {
    const Manager = new Function('foundry', `
        class QuickRollsManager {
            ${typesMatch[0]}
            ${iconMatch[0]}
            ${versionMatch[0]}
            ${normalizeSrc}
            ${sideSrc}
            ${idSrc}
            ${parseSrc}
        }
        return QuickRollsManager;
    `)({ utils: { randomID: () => 'stubid1234' } });

    const library = (defaultsForRoundTrip ?? []).map((roll) => Manager.normalize(roll));
    const envelope = {
        type: 'coffee-pub-blacksmith.quick-rolls',
        version: 1,
        exportedAt: new Date().toISOString(),
        world: 'test',
        rolls: library
    };

    try {
        const back = Manager.parseImport(JSON.stringify(envelope, null, 2));
        if (back.length !== library.length) {
            problems.push(`${MANAGER}: exporting ${library.length} rolls and importing the file back yields ${back.length} -- parseImport is dropping rolls its own exporter wrote`);
        }
        const before = JSON.stringify(library);
        const after = JSON.stringify(back);
        if (before !== after) {
            problems.push(`${MANAGER}: a library does not survive its own export/import round trip unchanged`);
        }
    } catch (error) {
        problems.push(`${MANAGER}: parseImport refused a file its own exporter wrote: ${error.message}`);
    }

    // A bare array is accepted on purpose: it is what somebody hand-assembling a file
    // writes, and refusing it would be pedantry about a shape we recognise perfectly.
    try {
        Manager.parseImport(JSON.stringify(library));
    } catch (error) {
        problems.push(`${MANAGER}: parseImport refuses a bare array of rolls, which it is meant to accept: ${error.message}`);
    }

    // And these must be refused, with a reason rather than a stack trace.
    for (const [name, text] of [
        ['malformed JSON', '{ not json'],
        ['a file of the wrong kind', JSON.stringify({ hello: 'world' })],
        ['an array of things that are not rolls', JSON.stringify([{ foo: 1 }, 'bar'])],
        ['a newer format version', JSON.stringify({ version: 99, rolls: library })]
    ]) {
        let threw = false;
        try {
            Manager.parseImport(text);
        } catch {
            threw = true;
        }
        if (!threw) problems.push(`${MANAGER}: parseImport accepted ${name} -- an import that cannot work must say so rather than filling the tab with rolls that do nothing`);
    }
}

// ===== THE BUILDER IS A TOOL WINDOW ================================
//
// `documentation/api/api-window.md` is the contract: a small utility opened from an
// in-flow action extends `BlacksmithToolWindowBaseV2` and renders into the shared
// `window-tool-template.hbs`, which owns the root, the scrolling body, the footer,
// and every `input`, `select` and `textarea` inside it.
//
// The stylesheet check is the one that matters most and is the easiest to lose: the
// Tool shell's surfaces are per-theme custom properties, so ANY colour literal in a
// consumer's stylesheet is correct in one theme and wrong in the other two. That is
// invisible to everything except a person who has switched theme.

const BUILDER = 'scripts/window-rollbuilder.js';
const BUILDER_CSS = 'styles/window-rollbuilder.css';
const BUILDER_HBS = 'templates/window-rollbuilder.hbs';

const builder = read(BUILDER);
const builderCss = read(BUILDER_CSS);
const builderHbs = read(BUILDER_HBS);

if (!/extends\s+BlacksmithToolWindowBaseV2/.test(builder)) {
    problems.push(`${BUILDER}: the Roll Builder must extend BlacksmithToolWindowBaseV2 -- a bare window draws its own frame and fields and stops following the user's Light/Dark/Glass choice`);
}
if (!builder.includes('templates/window-tool-template.hbs')) {
    problems.push(`${BUILDER}: PARTS must render the shared templates/window-tool-template.hbs -- that template owns the root, the scrolling body and the footer`);
}
if (!/static ROOT_CLASS = 'blacksmith-window-tool-root'/.test(builder)) {
    problems.push(`${BUILDER}: ROOT_CLASS must be 'blacksmith-window-tool-root' to match the shared shell`);
}

// The body renders INTO the shell, so it must not bring a root or a footer of its own.
for (const [pattern, what] of [
    [/class="blacksmith-window-tool-root"/, 'a duplicate tool root'],
    [/<footer/, 'its own footer -- the shell renders one from toolFooterLeft/Right'],
    [/cpb-dialog-buttons|blacksmith-window-btn-/, "the standard window's action-bar classes, which belong to a dark window and would paint onto the parchment shell"]
]) {
    if (pattern.test(builderHbs)) {
        problems.push(`${BUILDER_HBS}: the body carries ${what}`);
    }
}

const literals = [...builderCss.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g)].map((m) => m[0]);
if (literals.length) {
    problems.push(`${BUILDER_CSS}: ${literals.length} colour literal(s) -- ${[...new Set(literals)].slice(0, 4).join(', ')}${literals.length > 4 ? ', …' : ''}. A Tool window's surfaces are per-theme custom properties, so a literal is right in one theme and wrong in the other two. Use the --blacksmith-tool-* family; window-compendium-search.css is the reference`);
}

// ===== THE MENUBAR MENU REACHES THE LIBRARY ========================
//
// The right-click menu on the Request Roll tool is the only way to fire a roll without
// opening the window, and for a long time it listed favourites and nothing else -- a
// table's whole quick roll library was invisible from it. A menu that silently offers
// less than it should looks exactly like a menu that is complete.

const menuStart = dialog.indexOf('contextMenuItems: () => {');
if (menuStart < 0) {
    problems.push(`${DIALOG}: the Request Roll menubar tool has no contextMenuItems`);
} else {
    // The menu literal runs to the close of the registerMenubarTool call.
    const menuSrc = dialog.slice(menuStart);
    if (!menuSrc.includes('QuickRollsManager.byCategory()')) {
        problems.push(`${DIALOG}: the menubar context menu must list the quick roll library by category -- it is the only way to fire a roll without opening the window`);
    }
    if (!menuSrc.includes('requestRollFavorites')) {
        problems.push(`${DIALOG}: the menubar context menu must still list favourites`);
    }
    // Anchored to the CATEGORY LOOP, not to `submenu:` anywhere. A bare test passed
    // while the categories rendered flat, because the favourites block above them has
    // a submenu of its own and satisfied it.
    if (!/byCategory\(\)[\s\S]{0,800}?submenu:/.test(menuSrc)) {
        problems.push(`${DIALOG}: each quick roll category must render as a submenu -- flat, a full library is dozens of rows and worse than opening the window`);
    }
    if (!/Favorites[\s\S]{0,400}?submenu:/.test(menuSrc)) {
        problems.push(`${DIALOG}: favourites must render as a submenu, alongside the categories`);
    }
    if (!menuSrc.includes('runQuickRoll')) {
        problems.push(`${DIALOG}: the menubar context menu must fire quick rolls through SkillCheckDialog.runQuickRoll`);
    }
}

// `runQuickRoll` opens the window with the roll pending, because a quick roll selects
// contestants in the dialog's own list and has no headless equivalent.
if (!/static runQuickRoll\(id\)/.test(dialog)) {
    problems.push(`${DIALOG}: SkillCheckDialog.runQuickRoll is missing -- the menubar menu has no way to fire a quick roll`);
}
if (!/pendingQuickRollId/.test(dialog)) {
    problems.push(`${DIALOG}: the dialog must accept pendingQuickRollId -- runQuickRoll opens the window with the roll pending and nothing else runs it`);
}

// ===== THE TEMPLATE'S SIDE =========================================

// The rolls left the template and must not creep back: a hand-written row is not in
// the library, so it cannot be edited, deleted, or seen by the builder.
if (template.includes('data-type="quick"')) {
    problems.push(`${TEMPLATE}: a hand-written quick roll row is back in the template -- quick rolls are library data now, and a row written here cannot be edited or deleted`);
}
for (const cls of ['cpb-quick-rolls-list', 'cpb-quick-rolls-add', 'cpb-quick-rolls-export', 'cpb-quick-rolls-import']) {
    if (!new RegExp(`class="${cls}"`).test(template)) {
        problems.push(`${TEMPLATE}: no element with class="${cls}" -- the dialog wires it by that exact selector, and a missing one renders nothing and reports nothing`);
    }
}

// ===== REPORT ======================================================

if (problems.length) {
    console.error(`check-quick-rolls: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}
console.log('check-quick-rolls: rows carry everything their readers want, the built-in rolls are all present, the builder is a Tool window with no colour literals, and a library survives its own export/import round trip.');
