#!/usr/bin/env node
// Guard: prevent JS/TS shadowing of critical modules.
// Default scope is narrow to avoid blocking repos that intentionally keep TS+JS twins.
// By default, we only guard the scroll router module (single source of truth = JS).
// Configure scope via GUARD_SHADOW_SCOPE env var (semicolon-separated base paths without extension),
// e.g., GUARD_SHADOW_SCOPE="src/features/scroll-router;src/index".

const fs = require('fs');
const path = require('path');

function _walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(_walk(p));
    else out.push(p);
  }
  return out;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const src = path.join(root, 'src');
  if (!fs.existsSync(src)) return 0;

  // Resolve scope
  const scopeEnv = (process.env.GUARD_SHADOW_SCOPE || '').trim();
  const scopes = scopeEnv
    ? scopeEnv.split(/\s*;\s*/).filter(Boolean)
    : ['src/features/scroll-router']; // default narrow guard

  // Build a check list of base paths (no extension)
  const checks = scopes.map((s) => {
    const abs = path.isAbsolute(s) ? s : path.join(root, s);
    return abs.replace(/\.(js|ts)$/i, '');
  });

  const conflicts = [];
  for (const base of checks) {
    const js = base + '.js';
    const ts = base + '.ts';
    const hasJs = fs.existsSync(js);
    const hasTs = fs.existsSync(ts);
    if (hasJs && hasTs) conflicts.push({ js, ts });
  }

  if (conflicts.length) {
    console.error('[guard:ts-js-shadow] Found JS/TS shadowing for guarded modules:');
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
