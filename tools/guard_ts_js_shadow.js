#!/usr/bin/env node
// Guard: prevent JS/TS shadowing of the same module name in src/**.
// Fails commit if a directory contains both foo.ts and foo.js (excluding .d.ts).

const fs = require('fs');
const path = require('path');

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const src = path.join(root, 'src');
  if (!fs.existsSync(src)) return 0;
  const files = walk(src).filter(f => /\.(ts|js)$/i.test(f) && !/\.d\.ts$/i.test(f));
  const map = new Map();
  for (const f of files) {
    const dir = path.dirname(f);
    const base = path.basename(f).replace(/\.(ts|js)$/i, '');
    const key = dir + '::' + base;
    const rec = map.get(key) || { ts: null, js: null };
    if (f.endsWith('.ts')) rec.ts = f;
    if (f.endsWith('.js')) rec.js = f;
    map.set(key, rec);
  }
  const conflicts = [...map.values()].filter(r => r.ts && r.js);
  if (conflicts.length) {
    console.error('[guard:ts-js-shadow] Found JS/TS shadowing for the same module name:');
    for (const c of conflicts) {
      console.error('  -', c.js, '\n    ', c.ts);
    }
    const allow = process.env.PRECOMMIT_ALLOW_SHADOW === '1' || process.env.PRECOMMIT_ALLOW_SHADOW === 'true';
    if (allow) {
      console.warn('[guard:ts-js-shadow] Bypassed by PRECOMMIT_ALLOW_SHADOW env var');
      process.exit(0);
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
