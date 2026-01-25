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
  'login.html',
  'account.html',
  'reset.html',
  'sitemap.xml',
  'sitemaps.xml',
  'atom.xml',
  'assets',
  'forge-config.js',
  path.join('adapters', 'obsBridge.js'),
];

const SPEECH_STUBS = [
  { src: path.join('speech-stubs', 'recognizer.js'), dest: path.join('speech', 'recognizer.js') },
  { src: path.join('speech-stubs', 'matcher.js'), dest: path.join('speech', 'matcher.js') },
  { src: path.join('speech-stubs', 'orchestrator.js'), dest: path.join('speech', 'orchestrator.js') },
];

for (const rel of STATIC_PATHS) {
  copy(path.join(ROOT, rel), path.join(DIST, rel));
}

for (const stub of SPEECH_STUBS) {
  copy(path.join(ROOT, stub.src), path.join(DIST, stub.dest));
}
