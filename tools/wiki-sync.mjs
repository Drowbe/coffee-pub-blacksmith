#!/usr/bin/env node
/*
 * wiki-sync.mjs — mirror the round-1 publish set of documentation/ into flat GitHub-wiki pages.
 *
 * The wiki is a pure mirror: each published doc becomes a top-level page named by its basename
 * (api-pins.md -> page "api-pins"), so there are no colons and no subdirectories. Inter-doc links
 * are rewritten from repo paths (../api/foo.md) to wiki page names (foo); links to code files, or
 * to docs not in the publish set, are downgraded to plain text so the wiki has no broken red links.
 *
 * Source docs are never modified. The publish/downgrade decision is made fresh each run from folder
 * membership minus HOLD, so releasing a doc from HOLD -- or simply creating it -- auto-links every
 * reference to it, with no source edits needed.
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'documentation');
const OUT = path.join(ROOT, 'tools', '.wiki-build');
// Identity comes from module.json so a satellite can copy this file unchanged. `url` is the repo page;
// the wiki and the raw host are derived from it. (The rest of the portable rewrite is still to come --
// see TODO-GLOBAL -- but the two values that would silently misbehave in a copied file start here.)
const MODULE = JSON.parse(fs.readFileSync(path.join(ROOT, 'module.json'), 'utf8'));
const REPO_URL = (MODULE.url || '').replace(/\/+$/, '');
const REPO_SLUG = REPO_URL.replace(/^https?:\/\/github\.com\//i, '');
const WIKI_URL = process.env.WIKI_URL || `${REPO_URL}.wiki.git`;
// Assets are rewritten to raw.githubusercontent so images render on the wiki, which cannot resolve a
// repo-relative path. Source docs keep the relative path, which renders in the repo and in an editor.
// The branch is read from the repository, so a module on `main` and a module on `master` both work.
// Hardcoding it silently breaks every image on the wiki of any module that does not use this one's.
function defaultBranch() {
  for (const args of [
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    ['rev-parse', '--abbrev-ref', 'HEAD'],
  ]) {
    try {
      const out = execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
      if (out && out !== 'HEAD') return out.replace(/^origin\//, '');
    } catch { /* not a checkout, or no origin: fall through */ }
  }
  return 'master';
}
const BRANCH = defaultBranch();
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}/documentation/assets`;
const ASSET_LINK = /(?:^|\/)assets\/([^/\\)]+)$/i;

// ---- What publishes: folder membership, not a hand-kept list. ----
//
// Every .md in a published folder goes live by existing. The previous version of this file carried a
// list of 68 paths and nothing published until somebody added a line to it -- which is how
// architecture-effects.md stayed written, finished, and invisible for months. Convention publishing
// fails in the direction people notice instead.
//
// `global/` is the hub's alone: suite-wide documents are authored once here and LINKED by the
// satellites, never copied. A satellite has no such folder, so this resolves to nothing there.
const HUB = 'coffee-pub-blacksmith';
const MODULE_ID = MODULE.id;
export const IS_HUB = MODULE_ID === HUB;

export const PUBLISHED_FOLDERS = ['api', 'architecture', 'designsystem', 'userguides', ...(IS_HUB ? ['global'] : [])];
export const ROOT_PAGES = ['known-issues.md'];
// home.md becomes the Home page. It is not in ROOT_PAGES as well, or it would publish twice.
export const HOME_SRC = 'home.md';

// ---- HOLD: deliberately withheld, each with a reason. A hold without a reason is not a hold. ----
// Empty by design. A document goes live by existing; add an entry here only to withhold one
// deliberately, and only with a reason -- a hold without a reason is not a hold, it is an oversight
// wearing a policy's clothes.
export const HOLD = new Map([]);

export function collect() {
  const out = [];
  for (const dir of PUBLISHED_FOLDERS) {
    const abs = path.join(DOCS, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      if (f.endsWith('.md') && !HOLD.has(`${dir}/${f}`)) out.push(`${dir}/${f}`);
    }
  }
  for (const f of ROOT_PAGES) {
    if (fs.existsSync(path.join(DOCS, f)) && !HOLD.has(f)) out.push(f);
  }
  return out;
}

// A HOLD entry naming a file that no longer exists is stale, and stale holds are how a document stays
// invisible after the reason for hiding it is gone.
function checkHold() {
  const stale = [...HOLD.keys()].filter((rel) => !fs.existsSync(path.join(DOCS, rel)));
  if (stale.length) {
    console.warn(`
HOLD names ${stale.length} file(s) that do not exist -- remove the entry:`);
    for (const rel of stale) console.warn('  ' + rel);
  }
}

const PUBLISH = collect();
const pageName = (p) => path.basename(p, '.md');
const publishedPages = new Set([...PUBLISH.map(pageName), 'Home']);

// Clean sidebar label: strip the api-/architecture- prefix, kebab -> Sentence case.
function label(rel) {
  if (rel === 'api/api-effects.md') return 'Active Effects';
  if (rel === 'global/global-dnd5e-conditions.md') return 'dnd5e conditions';
  if (rel === 'architecture/architecture-ownership.md') return 'Module ownership';
  const base = pageName(rel).replace(/^(api|architecture|design|global|userguide)-/, '');
  const spaced = base.replace(/-/g, ' ');
  const titled = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  // Sentence case mangles the acronyms that appear in guide names -- "Gm", "Api", "Ui".
  return titled.replace(/\b(Gm|Api|Ui|Npc|Css|Json|Uuid|Dc)\b/g, (m) => m.toUpperCase());
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
// Blacksmith's own copy IS_HUB is true, so it never rewrites and the hub cannot link out even by
// accident. A satellite copies this file unchanged and gets the other two directions right for free,
// because the identity comes from its own module.json rather than from a constant it must remember
// to edit.
//
// FRAGILITY WORTH KNOWING: an inbound link targets a page NAME. A doc that is renamed, or dropped
// into HOLD, silently 404s every inbound link in the suite. The publish set is therefore a contract
// with the satellites, not just a local choice.
// HUB, MODULE_ID and IS_HUB are declared above, derived from module.json. Nothing here is hardcoded
// per module: a satellite copies this file unchanged and gets the right answer.
const HUB_WIKI = 'https://github.com/Drowbe/coffee-pub-blacksmith/wiki';
const SIBLING_DOC = /coffee-pub-([a-z]+)[\\/]documentation[\\/](?:[^)]*[\\/])?([^/\\)]+)\.md(#.+)?$/i;

function siblingWikiUrl(target) {
  const m = target.match(SIBLING_DOC);
  if (!m) return null;
  const targetModule = `coffee-pub-${m[1].toLowerCase()}`;
  if (targetModule !== HUB) return null;      // -> satellite: refused, whoever is asking
  if (IS_HUB) return null;                    // hub -> anywhere: refused
  return `${HUB_WIKI}/${m[2]}${m[3] || ''}`;
}

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const CODE_LINK = /\.(js|mjs|css|hbs|json|txt|webp|png)(#.*)?$/i;
// CODE_PATH matches a directory name anywhere in the target, which is why the doc branch below runs
// first: a documentation folder may share a name with a code folder -- `documentation/resources/` did,
// before it became `documentation/primers/` -- and matching the code branch first would downgrade every
// link into it to plain text as if it were source. A `.md` target is always a doc, wherever it lives.
const CODE_PATH = /(scripts|styles|templates|resources)\//;

function rewriteLinks(md, srcRel) {
  const lines = md.split(/\r?\n/);
  let inFence = false;
  const downgraded = [];
  // Group consecutive non-fenced lines into one string before matching. The LINK alt text may span
  // a newline -- the house style wraps at 80-100 columns, so a long alt text is exactly what a
  // careful author writes -- and matching per line skipped those links entirely, emitting a
  // repo-relative path onto the wiki where it resolves to nothing. Silent: the checker passes,
  // because the path itself is correct; only the rewrite is missed.
  // (Found by coffee-pub-merchant on adoption.)
  const blocks = [];
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; blocks.push({ fenced: true, text: line }); continue; }
    const last = blocks[blocks.length - 1];
    if (last && last.fenced === false) last.text += "\n" + line;
    else blocks.push({ fenced: false, text: line });
  }
  const rewritten = blocks.map((b) => {
    if (b.fenced) return b.text;
    return b.text.replace(LINK, (whole, text, target) => {
      if (/^(https?:|mailto:|#)/i.test(target)) return whole;        // external / same-page anchor
      // Checked BEFORE the code/asset downgrade: a cross-module doc path contains `documentation/`,
      // which is not a code path, but the ordering is stated rather than assumed because a future
      // CODE_PATH entry could otherwise swallow these silently.
      const hub = siblingWikiUrl(target);
      if (hub) return `[${text}](${hub})`;
      const asset = target.match(ASSET_LINK);                         // documentation/assets -> raw URL
      if (asset) return `[${text}](${RAW_BASE}/${asset[1]})`;
      if (CODE_LINK.test(target)) {                                   // code / asset -> plain text
        downgraded.push(`${srcRel}: code -> text  (${target})`);
        return text;
      }
      // A .md target is a doc wherever it lives, and this is tested BEFORE CODE_PATH on purpose: a
      // documentation folder may share a name with a code folder (documentation/resources/ nearly did),
      // and the other ordering downgrades every link into it to plain text, silently.
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
      if (CODE_PATH.test(target)) {                                   // extensionless code dir -> text
        downgraded.push(`${srcRel}: code -> text  (${target})`);
        return text;
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
  // Stripping the folder prefix collides whenever two folders hold a document named for the module:
  // userguide-artificer and architecture-artificer both reduce to "Artificer", in adjacent groups.
  // A label used more than once falls back to the full page name, which is always unique because it
  // is the filename. (Raised by coffee-pub-artificer on adoption.)
  // Labels need only be unique WITHIN a group, because the sidebar prints the group heading above
  // them: "Gathering" under "Architecture" is unambiguous to a reader in a way it is not to a Set.
  // Deduping globally fired hardest on compliance -- a feature documented once for users and once for
  // whoever changes it is the standard working, not two files carelessly named, and the better a
  // module documents a topic the more such pairs it has. (Raised by coffee-pub-artificer.)
  const KIND_SUFFIX = { api: 'API', architecture: 'architecture', designsystem: 'design',
                        userguides: 'guide', global: 'global', plans: 'plan' };
  const labelsIn = (prefix) => {
    const counts = new Map();
    for (const rel of PUBLISH.filter((p) => p.startsWith(prefix))) {
      counts.set(label(rel), (counts.get(label(rel)) || 0) + 1);
    }
    return counts;
  };
  const uniqueLabelIn = (rel, counts) => {
    if ((counts.get(label(rel)) || 0) <= 1) return label(rel);
    const kind = KIND_SUFFIX[rel.split('/')[0]];
    return kind ? `${label(rel)} (${kind})` : pageName(rel);
  };

  // User guides render in READING order, not alphabetically. Alphabetical put getting-started third
  // in one module and buried the settings reference in the middle of the features. The order is:
  // getting-started, then the feature guides, then player, gm, and settings -- shallowest first,
  // reference last. Feature guides take their order from the links in home.md when that document
  // lists them, because home.md is the router the author wrote in the order that made sense to them;
  // otherwise they fall back to alphabetical. Nothing to configure, and no new file.
  const homeOrder = (() => {
    try {
      const home = fs.readFileSync(path.join(DOCS, HOME_SRC), 'utf8');
      return [...home.matchAll(/userguide-[a-z0-9-]+/g)].map((m) => m[0]);
    } catch { return []; }
  })();
  const guideRank = (rel) => {
    const name = pageName(rel);
    if (name === 'userguide-getting-started') return [0, 0, name];
    const tail = { 'userguide-player': 1, 'userguide-gm': 2, 'userguide-settings': 3 }[name];
    if (tail) return [2, tail, name];
    const i = homeOrder.indexOf(name);
    return [1, i === -1 ? Number.MAX_SAFE_INTEGER : i, name];
  };
  const cmp = (a, b) => {
    const [ax, ay, az] = guideRank(a), [bx, by, bz] = guideRank(b);
    return ax - bx || ay - by || az.localeCompare(bz);
  };
  const linksIn = (prefix) => {
    const rels = PUBLISH.filter((p) => p.startsWith(prefix));
    if (prefix === 'userguides/') rels.sort(cmp);
    const counts = labelsIn(prefix);
    return rels.map((rel) => `- [${uniqueLabelIn(rel, counts)}](${pageName(rel)})`);
  };
  // A group whose every document is held renders as a bare heading with nothing under it, which reads
  // as a broken sidebar rather than an empty category. Emit the heading only when it has links.
  const section = (title, links) => (links.length ? [`### ${title}`, links.join('\n'), ''] : []);
  const rootCounts = labelsIn('');
  const topLevel = PUBLISH.filter((p) => !p.includes('/'))
    .map((rel) => `- [${uniqueLabelIn(rel, rootCounts)}](${pageName(rel)})`);
  return [
    ...section('Getting started', ['- [Home](Home)', ...topLevel]),
    ...section('User guides', linksIn('userguides/')),
    ...section('Global', linksIn('global/')),
    ...section('API', linksIn('api/')),
    ...section('Architecture', linksIn('architecture/')),
    ...section('Design system', linksIn('designsystem/')),
  ].join('\n');
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  checkHold();

  // A satellite adopting the standard copies this file before it has written home.md, and an
  // unhandled ENOENT stack trace is a terrible way to learn that. Say what is missing and why.
  if (!fs.existsSync(path.join(DOCS, HOME_SRC))) {
    console.error(`
Missing documentation/${HOME_SRC} -- the wiki has no front door without it.`);
    console.error('Write it before running the publisher: a paragraph on what this module is, then');
    console.error('links to the user guides, the API, and the architecture. See the documentation');
    console.error('standard on the hub wiki, page global-documentation-standard.');
    process.exit(1);
  }

  const downgrades = [];
  for (const rel of PUBLISH) downgrades.push(...readRewriteWrite(rel, `${pageName(rel)}.md`));
  downgrades.push(...readRewriteWrite(HOME_SRC, 'Home.md'));
  fs.writeFileSync(path.join(OUT, '_Sidebar.md'), buildSidebar());

  console.log(`Built ${PUBLISH.length} pages + Home + _Sidebar into ${path.relative(ROOT, OUT)}/`);
  const unique = [...new Set(downgrades)].sort();
  if (unique.length) {
    console.log(`\n${unique.length} link(s) downgraded to plain text (target not in round 1):`);
    for (const d of unique) console.log('  ' + d);
    console.log('A link to CODE is downgraded permanently and correctly -- that is the common case.');
    console.log('A link to a DOCUMENT relinks itself once the file exists or leaves HOLD.');
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

// Run the CLI only when invoked directly. check-docs-structure.mjs imports the publish rules from
// here rather than restating them -- two copies of "what publishes" is exactly the drift this file
// exists to prevent -- and an unguarded dispatch would run a full build on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] || 'build';
  if (mode === 'build') build();
  else if (mode === 'publish') publish(process.argv[3]);
  else {
    console.error('usage: node tools/wiki-sync.mjs [build | publish [wikiClonePath]]');
    process.exit(1);
  }
}
