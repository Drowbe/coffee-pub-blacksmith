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
  // API
  'api/api-campaign.md',
  'api/api-canvas.md',
  'api/api-chatcards.md',
  'api/api-compendiums.md',
  'api/api-core.md',
  'api/api-create-journal-entry.md',
  'api/api-gmnotes.md',
  'api/api-hookmanager.md',
  'api/api-menubar.md',
  'api/api-pins.md',
  'api/api-requestroll.md',
  'api/api-sockets.md',
  'api/api-stats.md',
  'api/api-toast.md',
  'api/api-toolbar.md',
  'api/api-window.md',
  // Architecture
  'architecture/architecture-chatcards.md',
  'architecture/architecture-hookmanager.md',
  'architecture/architecture-pins.md',
  'architecture/architecture-rolls.md',
  'architecture/architecture-token-naming.md',
  'architecture/architecture-window.md',
];

// Held out of round 1 (documented so intent is explicit; move into PUBLISH when ready):
//   API:          api-tags (blocked on the flags-vs-tags code split)
//   Architecture: architecture-blacksmith, -socketmanager, -stats, -tags, -toast, -toolbarmanager, -xp
//   Also held:    known-issues.md (author decision), TODO.md (internal / holds security items)

const HOME_SRC = 'guides/guide-registering-with-blacksmith.md';

const pageName = (p) => path.basename(p, '.md');
const publishedPages = new Set([...PUBLISH.map(pageName), 'Home']);

// Clean sidebar label: strip the api-/architecture- prefix, kebab -> Sentence case.
function label(rel) {
  const base = pageName(rel).replace(/^(api|architecture)-/, '');
  const spaced = base.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---- Fence-aware link rewriting ----
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
  return [
    '### Getting started',
    '- [Home](Home)',
    '',
    '### API',
    group('api/'),
    '',
    '### Architecture',
    group('architecture/'),
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
    fs.rmSync(wiki, { recursive: true, force: true });
    console.log(`\nCloning wiki: ${WIKI_URL}`);
    execFileSync('git', ['clone', WIKI_URL, wiki], { stdio: 'inherit' });
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
