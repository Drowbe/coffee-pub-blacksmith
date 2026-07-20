import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', '.wiki-build', 'tokens-preview.html');

const css = fs.readFileSync(path.join(ROOT, 'styles/vars.css'), 'utf8');
let section = 'Other';
const groups = {};
for (const l of css.split(/\r?\n/)) {
  const s = l.match(/\/\*\s*---\s*([A-Z][A-Z0-9 :\/()-]+?)\s*-*\s*\*\//);
  if (s) { section = s[1].trim(); continue; }
  const t = l.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);\s*(?:\/\*\s*(.*?)\s*\*\/)?/);
  if (t) (groups[section] ||= []).push({ name: t[1], val: t[2].trim(), note: (t[3] || '').trim() });
}

const isColor = (v) => /^#|^rgba?\(/.test(v);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

let body = '';
for (const [g, ts] of Object.entries(groups)) {
  body += `<h2>${esc(g)}</h2>\n<div class="grid">\n`;
  for (const t of ts) {
    const swatch = isColor(t.val)
      ? `<div class="sw" style="background:${t.val}"></div>`
      : `<div class="sw non"><span>${esc(t.val)}</span></div>`;
    body += `<div class="cell">${swatch}<div class="meta"><code>${esc(t.name)}</code><span class="val">${esc(t.val)}</span>${t.note ? `<span class="note">${esc(t.note)}</span>` : ''}</div></div>\n`;
  }
  body += '</div>\n';
}

fs.writeFileSync(OUT, `<!doctype html><meta charset="utf-8"><title>Blacksmith design tokens</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:32px;background:#1b1b1b;color:#ddd;max-width:1100px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#999;margin:0 0 28px;font-size:13px}
  h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#c15701;
     margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid #333}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .cell{display:flex;gap:11px;align-items:center;background:#232323;border:1px solid #333;
        border-radius:4px;padding:9px}
  .sw{width:46px;height:46px;border-radius:4px;flex:0 0 46px;border:1px solid rgba(255,255,255,.16);
      background-image:linear-gradient(45deg,#444 25%,transparent 25%,transparent 75%,#444 75%),
                       linear-gradient(45deg,#444 25%,transparent 25%,transparent 75%,#444 75%);
      background-size:10px 10px;background-position:0 0,5px 5px}
  .sw.non{display:flex;align-items:center;justify-content:center;background:#2c2c2c;
          font-size:10px;color:#aaa;text-align:center;padding:2px;word-break:break-all}
  .meta{min-width:0;display:flex;flex-direction:column;gap:1px}
  code{font:12px ui-monospace,monospace;color:#e8e8e8;word-break:break-all}
  .val{color:#8d8061;font:11px ui-monospace,monospace}
  .note{color:#777;font-size:11px;font-style:italic}
</style>
<h1>Blacksmith design tokens</h1>
<p class="sub">Generated from styles/vars.css. Checkerboard shows through translucent values.</p>
${body}`);

console.log('Wrote ' + OUT);
