#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

function run() {
  const root = path.resolve(__dirname, '..');
  try {
    const cmd = 'rg -n "index\\.html" src hud features index-hooks';
    const opts = { cwd: root, stdio: 'pipe' };
    const out = execSync(cmd, opts).toString().trim();
    if (!out) {
      console.log('[check-index-shell] no index.html references found in code.');
      return;
    }
    console.error('[check-index-shell] unacceptable index.html references detected:\n' + out);
    process.exit(1);
  } catch (err) {
    if (err.status === 1 && err.stdout && err.stdout.toString().trim()) {
      console.error('[check-index-shell] unacceptable index.html references detected:\n' + err.stdout.toString());
      process.exit(1);
    }
    if (err.status === 1) {
      console.log('[check-index-shell] no index.html references found in code.');
      return;
    }
    console.error('[check-index-shell] failed to run ripgrep:', err.message);
    process.exit(1);
  }
}

run();
