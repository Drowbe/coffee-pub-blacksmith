#!/usr/bin/env node
/**
 * check-settings-headings.mjs
 *
 * Verifies that a PLAYER sees the heading context a setting sits under.
 *
 * Foundry hides world-scoped settings from non-GM users. The rule, verbatim from
 * client/applications/settings/config.mjs:
 *
 *     if ( !setting.config || (!canConfigure && (setting.scope === CONST.SETTING_SCOPES.WORLD)) ) continue;
 *
 * Only `world` is hidden; `client` and `user` both render. Headings in settings.js are
 * ordinary String settings, so they obey the same rule -- which means a world-scoped
 * heading above a client- or user-scoped setting renders, to a player, as a bare control
 * with no context. Two identically-named "Enable" toggles from different sections become
 * indistinguishable.
 *
 * Three things are checked, per settings group:
 *
 *   ERROR  a heading is GM-only but something a player can see sits under it.
 *          The whole ancestor chain counts: an H1 that hides itself orphans every
 *          player-visible setting below it, however correct the H2 between them is.
 *   WARN   a heading is player-visible but nothing under it is. The player gets an
 *          empty heading followed immediately by the next one.
 *   WARN   a player-visible setting has no heading above it at all in its group.
 *
 * Only heading scopes are ever at issue. A setting's own scope is a functional decision
 * -- who the value belongs to -- and this check never asks for one to change.
 *
 * Usage:  node tools/check-settings-headings.mjs [--quiet]
 * Exits non-zero on ERROR.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');
// An explicit path is accepted so the check can be run against a deliberately broken
// copy. A check nobody has ever seen fail is a green light of unknown meaning.
const SRC = process.argv.slice(2).find(a => !a.startsWith('--'))
    ?? path.join(ROOT, 'scripts', 'settings.js');

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

/**
 * Headings that are player-visible with nothing under them ON PURPOSE.
 *
 * A heading setting renders its hint as body text, so one can carry prose rather than
 * introduce controls. These two are the module's intro block, shown to everyone by
 * design. They are listed rather than tolerated silently, so that a NEW empty heading
 * -- which is usually a heading whose settings all became GM-only -- still reports.
 */
const INTENTIONALLY_EMPTY = new Map([
    ['headingH1GettingStarted', 'parent of the intro block'],
    ['headingH4Introduction', 'its hint is the module description, deliberately shown to players']
]);

/**
 * Line ranges of named function declarations.
 *
 * A setting registered inside a helper lands in the list where the helper is CALLED,
 * not where it is written, and the two are thousands of lines apart here --
 * `ensureCoreLoadingProgressSettingRegistered` is defined at the top of the file and
 * called under a heading near the bottom. Using the definition line reports the setting
 * as having no heading and its real heading as empty: two false alarms for one artifact,
 * which is how a check teaches people to ignore it.
 */
function functionRanges() {
    const ranges = [];
    for (let i = 0; i < lines.length; i++) {
        const name = lines[i].match(/^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)?.[1];
        if (!name) continue;
        let depth = 0, started = false, end = i;
        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { depth++; started = true; }
                if (ch === '}') depth--;
            }
            if (started && depth === 0) { end = j; break; }
        }
        ranges.push({ name, start: i, end });
    }
    return ranges;
}

const FUNCTIONS = functionRanges();

/**
 * Helpers exported from settings.js and called by ANOTHER script.
 *
 * settings.js registers everything from registerSettings(), which runs in `ready`. A
 * helper called from elsewhere -- blacksmith.js calls
 * ensureCoreLoadingProgressSettingRegistered() during `init` -- registers FIRST, so its
 * settings render above every heading regardless of where the helper sits in this file.
 * Resolving to the in-file call site gets that exactly wrong and reports the setting as
 * correctly parented when a player actually sees it floating at the top of the list.
 */
function externallyCalledHelpers() {
    const exported = new Set();
    for (const line of lines) {
        const name = line.match(/^export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/)?.[1];
        if (name) exported.add(name);
    }
    if (!exported.size) return new Set();

    const dir = path.join(ROOT, 'scripts');
    const called = new Set();
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'settings.js')) {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const name of exported) {
            // Skip the import statement; look for an actual invocation.
            const invoked = new RegExp(`(^|[^.\\w])${name}\\s*\\(`, 'm');
            const withoutImports = text.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, '');
            if (invoked.test(withoutImports)) called.add(name);
        }
    }
    return called;
}

const EXTERNAL = externallyCalledHelpers();

/** Where a helper is invoked, if it is invoked exactly once outside itself. */
function callSite(name) {
    const own = FUNCTIONS.find(f => f.name === name);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
        if (own && i >= own.start && i <= own.end) continue;
        if (new RegExp(`(^|[^.\\w])${name}\\s*\\(`).test(lines[i])) hits.push(i);
    }
    return hits.length === 1 ? hits[0] : null;
}

/**
 * The line a registration effectively occupies in the rendered list, and whether it is
 * registered from outside registerSettings() and so lands before every heading.
 */
function placement(index) {
    const owner = FUNCTIONS.find(f => index > f.start && index <= f.end);
    if (!owner) return { order: index, external: false };
    if (EXTERNAL.has(owner.name)) return { order: -1, external: true, helper: owner.name };
    return { order: callSite(owner.name) ?? index, external: false };
}

// registerHeader('Id', 'labelKey', 'hintKey', 'H2', WORKFLOW_GROUPS.X[, 'scope'])
// The level argument is authoritative for nesting, NOT the H-number in the label key --
// they disagree in several places (headingH3CampaignCommon is registered at level H2).
const HEADER = /registerHeader\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'(H\d)'\s*,\s*([^,)]+?)\s*(?:,\s*'([^']+)'\s*)?\)/;
const REGISTER = /game\.settings\.register\(\s*MODULE\.ID\s*,\s*["'`]([^"'`$]+)["'`]/;

const entries = [];

for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(HEADER);
    if (header) {
        entries.push({
            kind: 'heading',
            ...placement(i),
            line: i + 1,
            key: `heading${header[4]}${header[1]}`,
            level: Number(header[4].slice(1)),
            group: header[5].trim(),
            scope: header[6] ?? 'world'   // registerHeader's own default
        });
        continue;
    }

    // The `heading${level}${id}` template inside registerHeader itself is excluded by
    // REGISTER rejecting `$` in the key -- it is the definition, not a registration.
    const reg = lines[i].match(REGISTER);
    if (!reg) continue;

    let depth = 0, started = false, body = '';
    for (let j = i; j < lines.length && j < i + 80; j++) {
        for (const ch of lines[j]) {
            if (ch === '{') { depth++; started = true; }
            if (started) body += ch;
            if (ch === '}') depth--;
        }
        if (started && depth === 0) break;
    }

    const key = reg[1];
    const level = key.match(/^headingH(\d)/)?.[1];
    entries.push({
        kind: level ? 'heading' : 'setting',
        ...placement(i),
        line: i + 1,
        key,
        level: level ? Number(level) : null,
        // Foundry's own default when omitted.
        scope: body.match(/scope\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? 'client',
        config: !/config\s*:\s*false/.test(body),
        group: body.match(/group\s*:\s*(WORKFLOW_GROUPS\.[A-Z_]+|null)/)?.[1] ?? null
    });
}

const seenByPlayer = e => e.config !== false && e.scope !== 'world';

// A stack per group. Groups are contiguous in the file today, but keying by group means
// this stays correct if a group is ever split across the file -- a heading in one group
// never claims a setting in another.
const stacks = new Map();
const headings = [];
const orphans = [];

// Registration order, with helper-registered settings sitting at their call site.
entries.sort((a, b) => a.order - b.order);

for (const entry of entries) {
    const group = entry.group ?? '(ungrouped)';
    if (!stacks.has(group)) stacks.set(group, []);
    const stack = stacks.get(group);

    if (entry.kind === 'heading') {
        while (stack.length && stack[stack.length - 1].level >= entry.level) stack.pop();
        const node = { ...entry, group, covers: [] };
        headings.push(node);
        stack.push(node);
        continue;
    }

    if (!seenByPlayer(entry)) continue;
    // Registered outside registerSettings(), so it renders above every heading no
    // matter which one it sits next to in this file.
    if (entry.external || !stack.length) { orphans.push({ ...entry, group }); continue; }
    for (const open of stack) open.covers.push(entry.key);
}

const errors = headings.filter(h => h.scope === 'world' && h.covers.length);
const empties = headings.filter(h => h.scope !== 'world' && !h.covers.length
    && !INTENTIONALLY_EMPTY.has(h.key));

const headingCount = entries.filter(e => e.kind === 'heading').length;
const settingCount = entries.filter(e => e.kind === 'setting').length;
const playerCount = entries.filter(e => e.kind === 'setting' && seenByPlayer(e)).length;

if (!QUIET || errors.length) {
    console.log(`Parsed ${headingCount} headings and ${settingCount} settings `
        + `(${playerCount} visible to players) in ${path.relative(ROOT, SRC)}.\n`);
}

if (errors.length) {
    console.log(`ERROR - ${errors.length} heading(s) hidden from players who can see settings beneath them:`);
    for (const h of errors) {
        console.log(`  settings.js:${h.line}  H${h.level} ${h.key}  [${h.group}]`);
        console.log(`      orphans ${h.covers.length}: ${h.covers.slice(0, 4).join(', ')}`
            + (h.covers.length > 4 ? ', ...' : ''));
        console.log(`      fix: pass 'user' as registerHeader's scope argument`);
    }
    console.log('');
}

if (!QUIET && empties.length) {
    console.log(`WARN - ${empties.length} heading(s) players see with nothing under them:`);
    for (const h of empties) {
        console.log(`  settings.js:${h.line}  H${h.level} ${h.key}  [${h.group}]`);
    }
    console.log('');
}

if (!QUIET && orphans.length) {
    console.log(`WARN - ${orphans.length} player-visible setting(s) with no heading above them:`);
    for (const o of orphans) {
        console.log(`  settings.js:${o.line}  ${o.key}  [${o.group}]`
            + (o.external ? `  -- registered by ${o.helper}() from another script, so it renders first` : ''));
    }
    console.log('');
}

// --player renders the list as a non-GM actually receives it, which is the thing this
// check is really about and the thing nobody can see without a second client logged in.
if (process.argv.includes('--player')) {
    let group = null;
    console.log('=== WHAT A PLAYER SEES ===\n');
    for (const e of entries) {
        if (!seenByPlayer(e)) continue;
        if (e.group !== group) {
            group = e.group;
            console.log(`\n--- ${String(group).replace('WORKFLOW_GROUPS.', '')} ---`);
        }
        if (e.kind === 'heading') console.log(`${'  '.repeat(e.level - 1)}${'#'.repeat(e.level)} ${e.key}`);
        else console.log(`${'  '.repeat(4)}${e.key}${e.external ? '   (renders first, above all headings)' : ''}`);
    }
    console.log('');
}

if (errors.length) {
    console.error(`Settings headings FAILED - ${errors.length} heading(s) leave players without context.`);
    process.exit(1);
}

if (!QUIET) {
    console.log('Settings headings OK - every player-visible setting keeps its heading chain.');
}
