#!/usr/bin/env node
/*
 * check-docs-structure.mjs -- enforce the documentation standard.
 *
 * The rules are in documentation/global/global-documentation-standard.md. This checks the ones a
 * reader cannot hold in their head: layout, prefixes, headers, the emoji ban, the transient-list ban,
 * HOLD hygiene, and assets in both directions.
 *
 * The publish rules (which folders publish, what is held) are IMPORTED from wiki-sync.mjs rather than
 * restated here. Two copies of "what publishes" is the drift this whole standard exists to prevent.
 *
 *   node tools/check-docs-structure.mjs
 *
 * Exits non-zero on any violation. Nothing else runs it -- the release workflow only zips and
 * releases on a tag.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISHED_FOLDERS, ROOT_PAGES, HOME_SRC, HOLD, IS_HUB, collect } from './wiki-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'documentation');
const ASSETS = path.join(DOCS, 'assets');

const problems = [];
const fail = (rule, detail) => problems.push({ rule, detail });

// The standard states the rules it enforces, so it necessarily contains the strings this checker
// looks for. Exempt it by name rather than weakening the check for every other document.
const SELF = 'global/global-documentation-standard.md';

// Prefix each folder expects. Do not derive it from the folder name: designsystem/ takes design-.
const PREFIX = {
  api: 'api-',
  architecture: 'architecture-',
  designsystem: 'design-',
  userguides: 'userguide-',
  global: 'global-',
  plans: 'plan-',
};
const ROOT_FILES = ['home.md', 'known-issues.md', 'TODO.md', 'TODO-GLOBAL.md'];
const VIDEO = /\.(mp4|mov|avi|webm|mkv|m4v)$/i;
const IMAGE_LINK = /!\[[^\]]*\]\(([^)]+)\)/g;
const ANY_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const relDocs = (f) => path.relative(DOCS, f).split(path.sep).join('/');
const allFiles = walk(DOCS);
const allMd = allFiles.filter((f) => f.endsWith('.md'));

// ---- 1. Folders exist. global/ is the hub's alone. -------------------------------------------
for (const dir of ['api', 'architecture', 'designsystem', 'userguides', 'plans', 'assets']) {
  if (!fs.existsSync(path.join(DOCS, dir))) {
    fail('folders', `documentation/${dir}/ does not exist (an empty folder makes missing work visible)`);
  }
}
const hasGlobal = fs.existsSync(path.join(DOCS, 'global'));
if (IS_HUB && !hasGlobal) fail('folders', 'the hub must carry documentation/global/');
if (!IS_HUB && hasGlobal) {
  fail('folders', 'documentation/global/ belongs to the hub alone; a satellite links to it, never copies it');
}

// ---- 2. Prefixes match folders; the root is an enumerated set. -------------------------------
for (const f of allMd) {
  const rel = relDocs(f);
  const parts = rel.split('/');
  if (parts.length === 1) {
    if (!ROOT_FILES.includes(parts[0])) {
      fail('root', `documentation/${rel} -- the root holds only ${ROOT_FILES.join(', ')}`);
    }
    continue;
  }
  const want = PREFIX[parts[0]];
  if (want && !path.basename(rel).startsWith(want)) {
    fail('prefix', `${rel} -- files in ${parts[0]}/ take the ${want} prefix`);
  }
  if (!want && parts[0] !== 'assets') {
    fail('folders', `documentation/${parts[0]}/ is not one of the standard's folders`);
  }
  if (rel !== rel.toLowerCase() && parts[0] !== 'assets') {
    fail('naming', `${rel} -- filenames are lowercase kebab-case; the name becomes the wiki page name`);
  }
}

// ---- 3. HOLD hygiene: every entry names a real file and carries a reason. ---------------------
for (const [rel, reason] of HOLD) {
  if (!fs.existsSync(path.join(DOCS, rel))) {
    fail('hold', `HOLD names ${rel}, which does not exist -- remove the entry`);
  }
  if (!reason || !String(reason).trim()) {
    fail('hold', `HOLD entry for ${rel} carries no reason; a hold without a reason is not a hold`);
  }
}

// ---- 4. Published documents: uniform header, no transient references, no Open work. -----------
const published = new Set([...collect(), HOME_SRC, ...ROOT_PAGES]);
// TODO and plans never publish, so a reference to one always rots. known-issues.md does publish and
// is emptied rather than deleted, so home.md may route to it; a spec citing it for fix status may not.
const NEVER_PUBLISHED = /(^|[^\w-])(TODO\.md|TODO-GLOBAL\.md|plans\/)/;
const KNOWN_ISSUES = /(^|[^\w-])known-issues\.md/;

for (const rel of published) {
  const abs = path.join(DOCS, rel);
  if (!fs.existsSync(abs)) continue;
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);

  if (!/^# \S/.test(lines[0] || '')) fail('header', `${rel} -- line 1 must be "# <Name>"`);
  if ((lines[1] || '').trim() !== '') fail('header', `${rel} -- line 2 must be blank`);
  if (!/^\*\*Audience:\*\* \S/.test(lines[2] || '')) {
    fail('header', `${rel} -- line 3 must be "**Audience:** <who>"`);
  }

  if (rel === SELF || rel === 'known-issues.md') continue;

  lines.forEach((line, i) => {
    if (/^\s*#{1,6}\s+(Open|Remaining) work\b/i.test(line)) {
      fail('transient', `${rel}:${i + 1} -- an "Open work" section belongs in TODO.md`);
    }
    if (NEVER_PUBLISHED.test(line)) {
      fail('transient', `${rel}:${i + 1} -- references TODO or a plan; those never publish, so the pointer rots`);
    }
    if (KNOWN_ISSUES.test(line) && /^(api|architecture)\//.test(rel)) {
      fail('transient', `${rel}:${i + 1} -- a spec states behaviour, not fix status; leave known-issues to the reader`);
    }
  });
}

// ---- 5. No emoji or dingbats, anywhere in the tree. -------------------------------------------
const isPictographic = (cp) =>
  (cp >= 0x1f300 && cp <= 0x1faff) ||
  (cp >= 0x2600 && cp <= 0x27bf) ||
  (cp >= 0x2b00 && cp <= 0x2bff) ||
  cp === 0xfe0f ||
  cp === 0x2705 ||
  cp === 0x274c;

for (const f of [...allMd, path.join(ROOT, 'README.md'), path.join(ROOT, 'CHANGELOG.md'), path.join(ROOT, 'CLAUDE.md')]) {
  if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    for (const ch of line) {
      if (isPictographic(ch.codePointAt(0))) {
        fail('emoji', `${path.relative(ROOT, f)}:${i + 1} -- contains "${ch}"; the no-emoji rule is absolute`);
        return;
      }
    }
  });
}

// ---- 6. Assets: every link resolves, and every asset is referenced. ---------------------------
const referenced = new Set();
for (const f of allMd) {
  const text = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  for (const re of [IMAGE_LINK, ANY_LINK]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const target = m[1].split('#')[0].trim();
      if (!target || /^(https?:|mailto:)/i.test(target)) continue;
      if (!/\.(webp|png|jpg|jpeg|gif|svg)$/i.test(target)) continue;
      const abs = path.resolve(dir, target);
      if (!fs.existsSync(abs)) {
        fail('assets', `${relDocs(f)} links ${target}, which is not committed`);
      } else if (abs.startsWith(ASSETS)) {
        referenced.add(path.basename(abs));
      }
    }
  }
}
if (fs.existsSync(ASSETS)) {
  for (const name of fs.readdirSync(ASSETS)) {
    if (name === '.gitkeep') continue;
    if (!referenced.has(name)) {
      fail('assets', `assets/${name} is referenced by no document -- delete it or link it`);
    }
  }
}

// ---- 7. No video committed under documentation/. ---------------------------------------------
for (const f of allFiles) {
  if (VIDEO.test(f)) fail('video', `${relDocs(f)} -- a wiki renders a link, not a player; use an animated WebP`);
}

// ---- Report ----------------------------------------------------------------------------------
if (!problems.length) {
  console.log(`check-docs-structure: OK (${allMd.length} documents, ${published.size} published)`);
  process.exit(0);
}
const byRule = new Map();
for (const p of problems) {
  if (!byRule.has(p.rule)) byRule.set(p.rule, []);
  byRule.get(p.rule).push(p.detail);
}
console.error(`check-docs-structure: ${problems.length} violation(s)\n`);
for (const [rule, details] of byRule) {
  console.error(`  [${rule}]`);
  for (const d of details) console.error(`    ${d}`);
  console.error('');
}
process.exit(1);
