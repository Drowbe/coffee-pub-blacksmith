#!/usr/bin/env node
/*
 * wiki-sync.mjs — mirror the round-1 publish set of documentation/ into flat GitHub-wiki pages.
 *
 * The wiki is a pure mirror: each published doc becomes a top-level page named by its basename
 * (api-pins.md -> page "api-pins"), so there are no colons and no subdirectories. Inter-doc links
 * are rewritten from repo paths (../api/foo.md) to wiki page names (foo); links to code files, or
 * to docs not in the publish set, are downgraded to plain text so the wiki has no broken red links.
 *
 * Source docs are never modified. The publish/downgrade decision is made fresh each run from the
 * PUBLISH list below, so adding a held doc to that list later auto-links every reference to it —
 * no source edits needed.
 *
 * Usage:
 *   node tools/wiki-sync.mjs build              # write reviewable pages to tools/.wiki-build/
 *   node tools/wiki-sync.mjs publish            # build, clone the wiki, mirror, commit (NO push)
 *   node tools/wiki-sync.mjs publish <path>     # same, but use an existing wiki clone at <path>
 *
 * After publish: review the staged commit, then push it yourself:
 *   git -C <wiki-path> push
 *
 * Env: WIKI_URL overrides the wiki git URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'documentation');
const OUT = path.join(ROOT, 'tools', '.wiki-build');
const WIKI_URL = process.env.WIKI_URL || 'https://github.com/Drowbe/coffee-pub-blacksmith.wiki.git';

// ---- Round-1 publish set. Add held docs here as they are finished and verified clean. ----
const PUBLISH = [
  // Reference
  'known-issues.md',
  // API
  'api/api-campaign.md',
  'api/api-canvas.md',
  'api/api-chatcards.md',
  'api/api-compendiums.md',
  'api/api-dialog.md',
  'api/api-entity-list.md',
  'api/api-quantity-split.md',
  'api/api-effects.md',
  'api/api-contextmenu.md',
  'api/api-core.md',
  'api/api-create-journal-entry.md',
  'api/api-gmnotes.md',
  'api/api-health.md',
  'api/api-hookmanager.md',
  'api/api-inventory.md',
  'api/api-menubar.md',
  'api/api-notes.md',
  'api/api-pins.md',
  'api/api-requestroll.md',
  'api/api-rolls.md',
  'api/api-sockets.md',
  'api/api-stats.md',
  'api/api-tags.md',
  'api/api-toast.md',
  'api/api-tokens.md',
  'api/api-toolbar.md',
  'api/api-window.md',
  // Guides
  'guides/guide-dnd5e-conditions.md',
  // Architecture
  'architecture/architecture-ownership.md',
  'architecture/architecture-blacksmith.md',
  'architecture/architecture-chatcards.md',
  'architecture/architecture-encounter.md',
  'architecture/architecture-gmnotes.md',
  'architecture/architecture-hookmanager.md',
  'architecture/architecture-inventory.md',
  'architecture/architecture-menubar.md',
  'architecture/architecture-notes.md',
  'architecture/architecture-pins.md',
  'architecture/architecture-rolls.md',
  'architecture/architecture-stats.md',
  'architecture/architecture-socketmanager.md',
  'architecture/architecture-tags.md',
  'architecture/architecture-timers.md',
  'architecture/architecture-toast.md',
  'architecture/architecture-token-interactions.md',
  'architecture/architecture-token-naming.md',
  'architecture/architecture-tool-windows.md',
  'architecture/architecture-toolbarmanager.md',
  'architecture/architecture-window.md',
  'architecture/architecture-xp.md',
  // Design system
  'design-system/design-tokens.md',
  'design-system/design-components.md',
  'design-system/design-patterns.md',
  'design-system/design-extending.md',
];

// Held out of round 1 (documented so intent is explicit; move into PUBLISH when ready):
//   API:          api-importer.md (gate: JSON import verified — see TODO.md)
//   Architecture: architecture-importer.md (same gate)
//   Also held:    applicationv2-window/guidance-applicationv2.md (needs audit — see TODO.md)
//   Internal:     TODO.md, TODO-GLOBAL.md, plans/* (not consumer docs)
//   Out of tree:  testing docs moved to /testing alongside the harness. This script only
//                 scans documentation/, so they are now unpublishable by construction
//                 rather than by being left off the PUBLISH list.
//   Missing doc:  api-flags.md referenced in TODO but not written yet

const HOME_SRC = 'guides/guide-registering-with-blacksmith.md';

const pageName = (p) => path.basename(p, '.md');
const publishedPages = new Set([...PUBLISH.map(pageName), 'Home']);

// Clean sidebar label: strip the api-/architecture- prefix, kebab -> Sentence case.
function label(rel) {
  if (rel === 'api/api-effects.md') return 'Active Effects';
  if (rel === 'guides/guide-dnd5e-conditions.md') return 'dnd5e conditions';
  if (rel === 'architecture/architecture-ownership.md') return 'Module ownership';
  const base = pageName(rel).replace(/^(api|architecture|design|guide)-/, '');
  const spaced = base.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---- Fence-aware link rewriting ----
// ---- Cross-module links: ONE PREDICATE ENFORCES ALL THREE DIRECTIONS ----
//
// Suite rule (TODO-GLOBAL Ground Rule 2), stated as directions:
//   satellite -> Blacksmith   ALLOWED. Blacksmith is a required dependency of every satellite, so the
//                             coupling already exists and is mandatory; the link only makes it legible.
//   Blacksmith -> satellite   REFUSED. Couples the hub to something optional that may not be installed.
//   satellite -> satellite    REFUSED. Two optional things, neither guaranteed present.
//
// The rule used to live only in prose, and prose is why it was misapplied at least once. The predicate
// below is the whole of it: rewrite only when the TARGET is the hub and WE are not the hub. In
// Blacksmith own copy THIS_MODULE === HUB, so it never rewrites and the hub cannot link out even by
// accident. A satellite copying this file changes THIS_MODULE and gets the other two directions right
// for free.
//
// FRAGILITY WORTH KNOWING: an inbound link targets a page NAME from the hub PUBLISH list. A doc that
// leaves PUBLISH, or is renamed, silently 404s every inbound link in the suite. PUBLISH is therefore a
// contract with the satellites, not just a local choice.
const HUB = 'coffee-pub-blacksmith';
const THIS_MODULE = 'coffee-pub-blacksmith';
const HUB_WIKI = 'https://github.com/Drowbe/coffee-pub-blacksmith/wiki';
const SIBLING_DOC = /coffee-pub-([a-z]+)[\\/]documentation[\\/](?:[^)]*[\\/])?([^/\\)]+)\.md(#.+)?$/i;

function siblingWikiUrl(target) {
  const m = target.match(SIBLING_DOC);
  if (!m) return null;
  const targetModule = `coffee-pub-${m[1].toLowerCase()}`;
  if (targetModule !== HUB) return null;      // -> satellite: refused, whoever is asking
  if (THIS_MODULE === HUB) return null;       // hub -> anywhere: refused
  return `${HUB_WIKI}/${m[2]}${m[3] || ''}`;
}

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const CODE_LINK = /\.(js|mjs|css|hbs|json|txt|webp|png)(#.*)?$/i;
const CODE_PATH = /(scripts|styles|templates|resources)\//;

function rewriteLinks(md, srcRel) {
  const lines = md.split(/\r?\n/);
  let inFence = false;
  const downgraded = [];
  const rewritten = lines.map((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return line.replace(LINK, (whole, text, target) => {
      if (/^(https?:|mailto:|#)/i.test(target)) return whole;        // external / same-page anchor
      // Checked BEFORE the code/asset downgrade: a cross-module doc path contains `documentation/`,
      // which is not a code path, but the ordering is stated rather than assumed because a future
      // CODE_PATH entry could otherwise swallow these silently.
      const hub = siblingWikiUrl(target);
      if (hub) return `[${text}](${hub})`;
      if (CODE_LINK.test(target) || CODE_PATH.test(target)) {         // code / asset -> plain text
        downgraded.push(`${srcRel}: code -> text  (${target})`);
        return text;
      }
      const m = target.match(/([^/]+)\.md(#.+)?$/i);                 // .md doc link
      if (m) {
        const name = m[1];
        const anchor = m[2] || '';
        // If the visible text is just a bare filename, drop its .md too.
        const clean = /^[\w-]+\.md$/.test(text) ? text.replace(/\.md$/, '') : text;
        if (publishedPages.has(name)) return `[${clean}](${name}${anchor})`;
        downgraded.push(`${srcRel}: unpublished -> text  (${target})`);
        return clean;
      }
      return whole;
    });
  });
  return { md: rewritten.join('\n'), downgraded };
}

function readRewriteWrite(rel, outName) {
  const md = fs.readFileSync(path.join(DOCS, rel), 'utf8');
  const { md: out, downgraded } = rewriteLinks(md, rel);
  fs.writeFileSync(path.join(OUT, outName), out);
  return downgraded;
}

function buildSidebar() {
  const group = (prefix) =>
    PUBLISH.filter((p) => p.startsWith(prefix))
      .map((rel) => `- [${label(rel)}](${pageName(rel)})`)
      .join('\n');
  // Top-level docs (no api/ or architecture/ prefix) go under Reference.
  const topLevel = PUBLISH.filter((p) => !p.includes('/'))
    .map((rel) => `- [${label(rel)}](${pageName(rel)})`)
    .join('\n');
  return [
    '### Getting started',
    '- [Home](Home)',
    topLevel,
    '',
    '### Guides',
    group('guides/'),
    '',
    '### API',
    group('api/'),
    '',
    '### Architecture',
    group('architecture/'),
    '',
    '### Design system',
    group('design-system/'),
    '',
  ].join('\n');
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const downgrades = [];
  for (const rel of PUBLISH) downgrades.push(...readRewriteWrite(rel, `${pageName(rel)}.md`));
  downgrades.push(...readRewriteWrite(HOME_SRC, 'Home.md'));
  fs.writeFileSync(path.join(OUT, '_Sidebar.md'), buildSidebar());

  console.log(`Built ${PUBLISH.length} pages + Home + _Sidebar into ${path.relative(ROOT, OUT)}/`);
  const unique = [...new Set(downgrades)].sort();
  if (unique.length) {
    console.log(`\n${unique.length} link(s) downgraded to plain text (target not in round 1):`);
    for (const d of unique) console.log('  ' + d);
    console.log('These auto-become links again once their target is added to PUBLISH.');
  }
}

function publish(wikiPathArg) {
  build();

  let wiki = wikiPathArg;
  if (!wiki) {
    wiki = path.join(ROOT, 'tools', '.wiki-repo');
    if (fs.existsSync(path.join(wiki, '.git'))) {
      // REUSE THE CLONE, NEVER DELETE IT. `fs.rmSync` cannot remove a git object store on Windows --
      // its contents are read-only and `force: true` does not clear the attribute, so publish died
      // with EPERM. Fetch-and-reset reaches the same clean slate, and faster. The GitHub Action runs
      // on Linux and never hit this; it bit a sibling porting the script.
      console.log(`\nReusing wiki clone: ${wiki}`);
      execFileSync('git', ['-C', wiki, 'fetch', 'origin'], { stdio: 'inherit' });
      const head = execFileSync('git', ['-C', wiki, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
      execFileSync('git', ['-C', wiki, 'reset', '--hard', `origin/${head}`], { stdio: 'inherit' });
      execFileSync('git', ['-C', wiki, 'clean', '-fd'], { stdio: 'inherit' });
    } else {
      fs.rmSync(wiki, { recursive: true, force: true });
      console.log(`\nCloning wiki: ${WIKI_URL}`);
      execFileSync('git', ['clone', WIKI_URL, wiki], { stdio: 'inherit' });
    }
  } else if (!fs.existsSync(path.join(wiki, '.git'))) {
    console.error(`Not a git clone: ${wiki}`);
    process.exit(1);
  }

  // Mirror: remove existing pages (keep .git), copy the fresh build in.
  for (const f of fs.readdirSync(wiki)) {
    if (f === '.git') continue;
    fs.rmSync(path.join(wiki, f), { recursive: true, force: true });
  }
  for (const f of fs.readdirSync(OUT)) {
    fs.copyFileSync(path.join(OUT, f), path.join(wiki, f));
  }

  execFileSync('git', ['-C', wiki, 'add', '-A'], { stdio: 'inherit' });
  const status = execFileSync('git', ['-C', wiki, 'status', '--porcelain'], { encoding: 'utf8' });
  if (!status.trim()) {
    console.log('\nWiki already up to date — nothing to commit.');
    return;
  }
  execFileSync('git', ['-C', wiki, 'commit', '-m', 'Sync wiki from documentation/'], { stdio: 'inherit' });
  console.log(`\nStaged + committed in ${wiki}`);
  console.log('Review the commit, then push it yourself:');
  console.log(`  git -C "${wiki}" push`);
}

const mode = process.argv[2] || 'build';
if (mode === 'build') build();
else if (mode === 'publish') publish(process.argv[3]);
else {
  console.error('usage: node tools/wiki-sync.mjs [build | publish [wikiClonePath]]');
  process.exit(1);
}
