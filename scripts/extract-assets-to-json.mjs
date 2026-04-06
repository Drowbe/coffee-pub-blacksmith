/**
 * One-time / CI: emit resources/asset-defaults/*.json from bundled assets (resources/assets.js).
 * Run from repo root: node scripts/extract-assets-to-json.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'resources', 'asset-defaults');
mkdirSync(outDir, { recursive: true });

const m = await import(join(root, 'resources', 'assets.js'));

const files = [
  ['assets-themes.json', m.dataTheme],
  ['assets-background-images.json', m.dataBackgroundImages],
  ['assets-icons.json', m.dataIcons],
  ['assets-nameplates.json', m.dataNameplate],
  ['assets-sounds.json', m.dataSounds],
  ['assets-volumes.json', m.dataVolume],
  ['assets-banners.json', m.dataBanners],
  ['assets-backgrounds.json', m.dataBackgrounds],
  ['assets-mvp-templates.json', { manifestVersion: 1, ...m.MVPTemplates }]
];

for (const [name, data] of files) {
  const payload = { manifestVersion: 1, ...data };
  writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2));
  console.log('Wrote', join('resources/asset-defaults', name));
}
console.log('Done. Add resources/asset-defaults/*.json to module manifest "files" if you ship them.');
