import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');

const copy = (src, dest) => {
  if (!fs.existsSync(src)) {
    console.warn('[copy-static] skipping missing path', src);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('[copy-static] copied', src, '->', dest);
};

const STATIC_PATHS = [
  'teleprompter_pro.html',
  'teleprompter_pro.css',
  'display.html',
  'hud_popout.html',
  'assets',
  'forge-config.js',
  path.join('adapters', 'obsBridge.js'),
];

for (const rel of STATIC_PATHS) {
  copy(path.join(ROOT, rel), path.join(DIST, rel));
}
