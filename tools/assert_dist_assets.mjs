import fs from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'dist/teleprompter_pro.html',
  'dist/teleprompter_pro.css',
  'dist/display.html',
  'dist/hud_popout.html',
  'dist/login.html',
  'dist/reset.html',
  'dist/account.html',
  'dist/robots.txt',
  'dist/assets',
  'dist/forge-config.js',
  'dist/adapters/obsBridge.js',
  'dist/hud/debug.js',
  'dist/hud/popout-entry.js',
  'dist/speech/recognizer.real.js',
  'dist/speech/matcher.real.js',
  'dist/speech/orchestrator.real.js',
  'dist/speech/recognizer.js',
  'dist/speech/matcher.js',
  'dist/speech/orchestrator.js',
];

const missing = requiredFiles.filter((relative) => !fs.existsSync(path.resolve(relative)));

if (missing.length) {
  console.error('\n❌ Dist asset check failed. Missing:');
  for (const file of missing) {
    console.error(' -', file);
  }
  console.error('');
  process.exit(1);
}

console.log('✅ Dist asset check passed:', requiredFiles.length, 'files present.');
