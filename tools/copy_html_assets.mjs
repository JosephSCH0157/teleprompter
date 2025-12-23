import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}

const ASSETS = ['teleprompter_pro.html', 'display.html', 'hud_popout.html'];

for (const asset of ASSETS) {
  const src = path.join(ROOT, asset);
  const target = path.join(DIST, asset);
  if (!fs.existsSync(src)) {
    console.warn('[copy_html_assets] skipping missing file', src);
    continue;
  }
  fs.copyFileSync(src, target);
  console.log('[copy_html_assets] copied', asset, '→ dist/');
}
