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
// An <img> tag is the only way to set a width, which is exactly what a product screenshot needs,
// so a module doing the standard-blessed thing failed the orphan check. (Raised by coffee-pub-crier.)
const HTML_IMG = /<img\s[^>]*?src=["']([^"']+)["']/gi;
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

// ---- 2b. The front door must exist. ------------------------------------------------------------
// ROOT_FILES was only ever an allowlist for what MAY sit in the root, never a set that must be there.
// A module could adopt, pass every check, and publish a wiki with no Home page -- the publisher
// tolerates the absence deliberately, so nothing anywhere said the file was owed. Silent, in the
// place nobody watches, symptom (an empty wiki) far from the cause. (Raised by coffee-pub-crier.)
for (const required of ['home.md', 'known-issues.md']) {
  if (!fs.existsSync(path.join(DOCS, required))) {
    fail('root', `documentation/${required} does not exist -- every module owes it`);
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
// A BARE `TODO` is the same debt as `TODO.md` -- the standard says so explicitly, and it is the form
// the debt actually takes: `see TODO L8`, `TODO **A6**`. Matching only the filename missed every
// one of them, including four in Librarian's published architecture and one in Blacksmith's own.
// (Raised by coffee-pub-librarian.)
const NEVER_PUBLISHED = /(^|[^\w-])(TODOs?|TODO\.md|TODO-GLOBAL\.md|plans\/)([^\w-]|$)/;
const WORK_HEADING = /^\s*#{1,6}\s+((open|remaining|future|planned|outstanding)\b|next steps|in progress|implementation status|roadmap|wishlist|to ?do\b)/i;
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
    // A backlog inside a published document usually announces itself in a HEADING rather than the
    // word TODO. One module carried ~150 lines under "Outstanding Questions to Resolve" and
    // "Implementation Status / In Progress / Next Steps" without the word appearing once. Prose
    // work-words have no bounded list; headings do, because a heading is a deliberate structural act.
    // (Raised by coffee-pub-artificer.)
    if (WORK_HEADING.test(line)) {
      fail("transient", `${rel}:${i + 1} -- a work-shaped section heading; that content belongs in TODO.md`);
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

// ---- 4c. The hub must not cite a satellite's internals. ---------------------------------------
// The boundary rule refuses hub-to-satellite references, and that direction has no natural check:
// a satellite cannot see the hub's documents, and the hub has no reason to look. Found twice in one
// night here -- a stylesheet comment citing a sibling's CSS by line number, and an architecture
// document citing a sibling's script. (Raised by coffee-pub-librarian.)
// PUBLISHED documents only. Plans and TODO-GLOBAL.md are where cross-module work legitimately lives
// -- TODO-GLOBAL is defined as the place for it -- and neither ever reaches the wiki. The boundary
// rule governs what the hub PUBLISHES about a satellite, not what it tracks internally.
if (IS_HUB) {
  const SATELLITE_PATH = /coffee-pub-(?!blacksmith)[a-z]+\//;
  for (const rel of published) {
    const f = path.join(DOCS, rel);
    if (rel === SELF || !fs.existsSync(f)) continue;
    fs.readFileSync(f, 'utf8').split(NEWLINE).forEach((line, i) => {
      if (SATELLITE_PATH.test(line)) {
        fail('boundary', `${rel}:${i + 1} -- cites a path inside a satellite; the hub documents its own surface only`);
      }
    });
  }
}

// ---- 4d. User-guide coverage. -------------------------------------------------------------------
// Reported, never failed on: no tool can know how many features a module has. But a module with eight
// architecture documents and one user guide has almost certainly stopped at getting-started, which is
// the most common failure of that section -- five of the first nine adopters did it. Putting the two
// counts side by side makes the gap visible without inventing a threshold.
{
  const count = (dir) => {
    const abs = path.join(DOCS, dir);
    return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => f.endsWith('.md')).length : 0;
  };
  const guides = count('userguides');
  const arch = count('architecture');
  notes.push(`user guides: ${guides} against ${arch} architecture document(s)`);
  if (guides <= 1) {
    notes.push('  ^ one guide for a multi-part module is almost always incomplete -- name every feature');
    notes.push('    aloud and point at the guide that covers it. The standard: complete coverage, not a file count.');
  }
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
const reportedMissing = new Set();
// The README lives outside documentation/ but the standard explicitly blesses it drawing on assets/,
// so an asset used only by the README is not an orphan. Scanning documentation/ alone reported every
// one of them as unreferenced. (Raised by coffee-pub-crier.)
const assetScanned = [...allMd, path.join(ROOT, 'README.md')].filter((f) => fs.existsSync(f));
// Strip fenced blocks and inline code first. API documents illustrate image handling with example
// paths -- `path/to/image.webp`, `<img src="icons/svg/treasure.svg">` -- which are not links to
// anything and must not be read as one. This bit only after HTML images became visible, but the
// markdown regexes had the same latent hole.
const stripCode = (t) => t.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
for (const f of assetScanned) {
  const text = stripCode(fs.readFileSync(f, 'utf8'));
  const dir = path.dirname(f);
  for (const re of [IMAGE_LINK, ANY_LINK, HTML_IMG]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const target = m[1].split('#')[0].trim();
      if (!target || /^(https?:|mailto:)/i.test(target)) continue;
      if (!/\.(webp|png|jpg|jpeg|gif|svg)$/i.test(target)) continue;
      const abs = path.resolve(dir, target);
      if (!fs.existsSync(abs)) {
        const seenKey = `${f}|${target}`;
        if (reportedMissing.has(seenKey)) continue;   // an image link matches two of the three regexes
        reportedMissing.add(seenKey);
        fail('assets', `${path.relative(ROOT, f)} links ${target}, which is not committed`);
      } else if (abs.startsWith(ASSETS)) {
        referenced.add(path.basename(abs));
      }
    }
  }
}
// An asset prefixed with a document kind is claimed by that kind. Referencing it from a different
// kind means one of the two names is a lie. Everything else is free-form: a rule with no enforcement
// loses to whatever a human names a file, and that is the right outcome.
// (Raised by coffee-pub-merchant on adoption.)
const KIND_PREFIX = /^(api|architecture|design|userguide|global|plan)-/;
for (const f of allMd) {
  const rel = relDocs(f);
  const kind = rel.includes('/') ? rel.split('/')[0] : 'root';
  const folderKind = { api: 'api', architecture: 'architecture', designsystem: 'design',
                       userguides: 'userguide', global: 'global', plans: 'plan' }[kind];
  for (const m of fs.readFileSync(f, 'utf8').matchAll(ANY_LINK)) {
    const base = path.basename(m[1].split('#')[0].trim());
    const claim = KIND_PREFIX.exec(base);
    if (!claim || !/\.(webp|png|jpg|jpeg|gif|svg)$/i.test(base)) continue;
    if (claim[1] !== folderKind) {
      fail('assets', `${rel} references ${base}, whose name claims it belongs to a ${claim[1]} document`);
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
  // Normalise line endings before comparing. A satellite on Windows without .gitattributes yet has
  // a CRLF README, and a raw byte comparison then reports drift on a block that is character-for-
  // character identical -- the very defect class this check was added to catch, reappearing inside it.
  return text.slice(a + `<!-- ${marker} -->`.length, b).replace(/\r\n/g, '\n').trim();
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
