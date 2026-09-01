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
const notes = [];
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
// TODO-GLOBAL.md is the hub's alone -- it tracks cross-module work, and a satellite carrying one is
// documenting other modules, which the boundary rule refuses.
const ROOT_FILES = ['home.md', 'known-issues.md', 'TODO.md', ...(IS_HUB ? ['TODO-GLOBAL.md'] : [])];
const VIDEO = /\.(mp4|mov|avi|webm|mkv|m4v)$/i;
const IMAGE_LINK = /!\[[^\]]*\]\(([^)]+)\)/g;
const NEWLINE = /\r?\n/;
const FENCE = /^\s*```/;
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

// ---- 1. Folders. --------------------------------------------------------------------------------
// REQUIRED everywhere, because every module genuinely owes these: it has internals, it has users, and
// it needs screenshots. An empty folder here is a real gap made visible.
//
// OPTIONAL: api/ and designsystem/. A leaf consumer exposes no API and publishes no tokens for anyone
// else, so requiring those folders advertises work that does not exist -- and pushes a maintainer into
// creating an empty folder purely to get a green run, which is the opposite of the point. plans/ is
// optional for the same reason: having no work in flight is a state, not an omission.
//
// This distinction was found the hard way, twice: a rule true of the hub was enforced unconditionally
// on satellites, and the satellite could satisfy it only by doing the wrong thing. If you add a check
// here, ask first whether it is true off the hub. (Raised by coffee-pub-minstrel on adoption.)
for (const dir of ['architecture', 'userguides', 'assets']) {
  if (!fs.existsSync(path.join(DOCS, dir))) {
    fail('folders', `documentation/${dir}/ does not exist -- every module owes it (an empty folder makes a real gap visible)`);
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

// ---- 4b. No wiki page names in source documents. ----------------------------------------------
// A source document links by repo-relative path; the publisher rewrites those to page names on the
// way out. Writing the page name directly -- [Artificer](architecture-artificer) -- publishes fine,
// because the publisher resolves it happily, and breaks only the repository-side view, where nobody
// looks. The standard warns against seeding a document from the wiki for this reason, and an author
// who wrote home.md from scratch made the same mistake by hand anyway, with the built sidebar open
// beside them. A rule people violate while trying to follow it wants a check.
// (Raised by coffee-pub-artificer on adoption.)
const WIKI_NAME_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
for (const f of allMd) {
  const rel = relDocs(f);
  fs.readFileSync(f, "utf8").split(NEWLINE).forEach((line, i) => {
    if (FENCE.test(line)) return;
    for (const m of line.matchAll(WIKI_NAME_LINK)) {
      const t = m[1];
      if (/^(https?:|mailto:|#|\/)/i.test(t)) continue;   // external, anchor, absolute
      if (t.includes("/") || t.includes(".")) continue;    // a path or a file: fine
      fail("wiki-link", `${rel}:${i + 1} -- "(${t})" is a wiki page name; link the repo path (../folder/${t}.md) and let the publisher rewrite it`);
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

// testing/ sits at the repository root by design, so scanning only documentation/ left the emoji
// rule unenforced exactly where the standard tells people to put a testing document.
// (Raised by coffee-pub-merchant on adoption.)
const testingDocs = walk(path.join(ROOT, 'testing')).filter((f) => f.endsWith('.md'));
for (const f of [...allMd, ...testingDocs, path.join(ROOT, 'README.md'), path.join(ROOT, 'CHANGELOG.md'), path.join(ROOT, 'CLAUDE.md')]) {
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

// ---- 7. Shared README blocks. -----------------------------------------------------------------
// The AI-assistance disclosure is meant to be identical in every module's README. A README does not
// publish, so the
// publisher cannot enforce "link, never copy" there -- and fifteen hand-maintained copies of the same
// paragraphs is how five satellites ended up with five diverging forks of the hub's API notes. So the
// copy is allowed and the drift is not.
//
// WHERE THE COMPARISON CAN RUN: only in the hub. The canonical file lives in global/, and a satellite
// is forbidden to carry global/ -- so off the hub there is nothing to compare against, and demanding
// one made this check and the global/ rule mutually exclusive on every satellite. (Found by
// coffee-pub-minstrel on first adoption, which is what a first adopter is for.) A satellite therefore
// verifies only that its markers are present and non-empty; the hub owns drift detection, and sweeps
// any sibling repositories it can see.
const MARKED = [{ canon: 'global/global-ai-assistance.md', marker: 'global:ai-assistance' }];

function sliceBlock(text, marker) {
  const a = text.indexOf(`<!-- ${marker} -->`);
  const b = text.indexOf(`<!-- /${marker} -->`);
  if (a === -1 || b === -1 || b < a) return null;
  return text.slice(a + `<!-- ${marker} -->`.length, b).trim();
}

for (const { canon, marker } of MARKED) {
  const readme = path.join(ROOT, 'README.md');
  const own = fs.existsSync(readme) ? sliceBlock(fs.readFileSync(readme, 'utf8'), marker) : null;

  if (own === null) {
    fail('shared-block', `README.md is missing the ${marker} markers, or they are malformed`);
  } else if (!own) {
    fail('shared-block', `README.md's ${marker} block is empty`);
  }

  // A satellite cannot compare against a canonical copy it is forbidden to carry, but it can say
  // whether it has the block at all -- and it must, because the number exists to make a suite-wide
  // gap visible and the modules that have not adopted are exactly the ones that need telling. Printing
  // only on the hub nudges the one repository that does not need nudging. (Raised by
  // coffee-pub-minstrel.)
  if (!IS_HUB) {
    notes.push(own === null
      ? `shared block: this README does NOT carry the ${marker} disclosure (the hub holds the canonical text)`
      : `shared block: this README carries the ${marker} disclosure; drift against the canonical text is checked in the hub`);
    continue;
  }

  const canonAbs = path.join(DOCS, canon);
  if (!fs.existsSync(canonAbs)) {
    fail('shared-block', `${canon} is missing; the hub owns the canonical ${marker} text`);
    continue;
  }
  const want = sliceBlock(fs.readFileSync(canonAbs, 'utf8'), marker);
  if (want === null || !want) {
    fail('shared-block', `${canon} has no usable ${marker} block`);
    continue;
  }
  if (own !== null && own && own !== want) {
    fail('shared-block', `README.md's ${marker} block has drifted from ${canon}; edit the canonical file and copy it out`);
  }

  // Opportunistic sibling sweep. The author's machine carries every module side by side, and that is
  // where a README gets hand-edited; CI has one repo and simply finds nothing here. Silence when a
  // sibling has no markers at all -- it has not adopted the standard yet, which is not drift.
  const parent = path.dirname(ROOT);
  let siblings = [];
  try {
    siblings = fs.readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('coffee-pub-') && path.join(parent, e.name) !== ROOT)
      .map((e) => path.join(parent, e.name));
  } catch { /* no parent to read: nothing to sweep */ }

  // Counted and reported, never failed on. Staying silent about a sibling that carries no markers is
  // right -- a checker must not fail on a repo it knows nothing about -- but silence and success then
  // produce identical output, so the check reads green across a suite where the block exists almost
  // nowhere. It is strictest on the repos that already complied and mute on the ones that did not.
  // The count is what makes the gap visible without inventing a failure. (Raised by coffee-pub-
  // artificer, relayed by coffee-pub-blacksmith-61.)
  let carried = 0;
  let seen = fs.existsSync(readme) ? 1 : 0;
  if (own !== null) carried += 1;

  for (const dir of siblings) {
    const sib = path.join(dir, 'README.md');
    if (!fs.existsSync(sib)) continue;
    seen += 1;
    const got = sliceBlock(fs.readFileSync(sib, 'utf8'), marker);
    if (got === null) continue;              // has not adopted the block yet: reported, not failed
    carried += 1;
    if (got !== want) {
      fail('shared-block', `${path.basename(dir)}/README.md's ${marker} block has drifted from the hub's ${canon}`);
    }
  }
  notes.push(`shared block: ${carried} of ${seen} module READMEs carry the ${marker} disclosure`);
}

// ---- 7. No video committed under documentation/. ---------------------------------------------
for (const f of allFiles) {
  if (VIDEO.test(f)) fail('video', `${relDocs(f)} -- a wiki renders a link, not a player; use an animated WebP`);
}

// ---- Report ----------------------------------------------------------------------------------
for (const n of notes) console.log(`check-docs-structure: ${n}`);
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
