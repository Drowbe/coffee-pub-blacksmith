/**
 * check-design-tokens.mjs — guard the design-token doc against drift.
 *
 * The published formatting standard says "point at code, don't copy it," because every copied
 * block found in the doc audits had drifted. A token reference is the one place copying earns
 * its keep: a consumer choosing between --blacksmith-space-sm and -md needs the values to
 * choose. This script removes the reason for the rule instead of breaking it — the values are
 * copied, but they cannot drift silently.
 *
 * Checks, against styles/vars.css as the single source of truth:
 *   1. every token the doc documents exists in vars.css
 *   2. every value the doc states matches vars.css exactly
 *   3. every token vars.css defines is documented (no silent omissions)
 *
 * Run: node tools/check-design-tokens.mjs
 * Exits non-zero on any mismatch, so it can gate a commit or a wiki publish.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VARS = path.join(ROOT, 'styles', 'vars.css');
const DOC = path.join(ROOT, 'documentation', 'design-system', 'design-tokens.md');

// ---- source of truth ----
function readVars() {
  const tokens = new Map();
  for (const line of fs.readFileSync(VARS, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/);
    if (m) tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

// ---- doc claims: rows shaped | `--token` | `value` | ... ----
function readDoc() {
  const claims = [];
  const lines = fs.readFileSync(DOC, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(/^\s*\|\s*`(--[\w-]+)`\s*\|\s*`([^`]+)`\s*\|/);
    if (m) claims.push({ token: m[1], value: m[2].trim(), line: i + 1 });
  });
  return claims;
}

const vars = readVars();
const claims = readDoc();
const problems = [];

for (const c of claims) {
  if (!vars.has(c.token)) {
    problems.push(`design-tokens.md:${c.line}  documents ${c.token}, which vars.css does not define`);
    continue;
  }
  const real = vars.get(c.token);
  // Compare whitespace-insensitively; rgba(0, 0, 0, .3) and rgba(0,0,0,.3) are the same value.
  const norm = (s) => s.replace(/\s+/g, '');
  if (norm(real) !== norm(c.value)) {
    problems.push(`design-tokens.md:${c.line}  ${c.token} documented as "${c.value}", vars.css says "${real}"`);
  }
}

const documented = new Set(claims.map((c) => c.token));
for (const token of vars.keys()) {
  if (!documented.has(token)) problems.push(`vars.css defines ${token}, design-tokens.md does not document it`);
}

if (problems.length) {
  console.error(`Design-token drift (${problems.length}):\n`);
  for (const p of problems) console.error('  ' + p);
  console.error(`\n${claims.length} documented / ${vars.size} defined.`);
  process.exit(1);
}

console.log(`Design tokens OK — ${claims.length} documented, all match styles/vars.css.`);
