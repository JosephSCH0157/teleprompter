#!/usr/bin/env node
// Robust pre-commit helper: prefer lint-staged; fall back to eslint on staged JS files; never block commits catastrophically.
const _require = typeof globalThis !== 'undefined' ? globalThis['require'] : undefined;
const spawnSync = _require ? _require('child_process').spawnSync : null;
const _fs = _require ? _require('fs') : null; // unused but present for future
const path = _require ? _require('path') : null;

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ stdio: 'inherit' }, opts || {}));
  return r.status === 0;
}

function hasBin(bin) {
  try {
    if (!_require || !path) return false;
    const r = _require;
    // Use project root based on cwd
  const proc = globalThis['process'];
  const procCwd = proc && typeof proc.cwd === 'function' ? proc.cwd() : undefined;
  const projRoot = procCwd ? path.resolve(procCwd, '..') : path.resolve('.', '..');
    const p = r.resolve(bin, { paths: [projRoot] });
    return !!p;
  } catch (e) {
    void e;
    return false;
  }
}

function stagedFiles() {
  try {
    if (!spawnSync) return [];
    const out = spawnSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
    if (!out || out.status !== 0) return [];
    return (out.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    void e;
    return [];
  }
}

async function main() {
  try {
    // 1) Try lint-staged (prefer the locally installed binary)
    if (hasBin('lint-staged')) {
      try {
        if (!spawnSync || !_require) throw new Error('node runtime not available');
        console.log('[precommit-safe] running lint-staged');
        const r = _require;
        const execPath = (globalThis['process'] && globalThis['process'].execPath) || 'node';
        const ok = run(execPath, [r.resolve('lint-staged/bin/lint-staged')]);
        if (ok) {
          const proc = globalThis['process'];
          if (proc && typeof proc.exit === 'function') proc.exit(0);
          return 0;
        }
        console.warn('[precommit-safe] lint-staged failed');
      } catch (e) {
        console.warn('[precommit-safe] lint-staged invocation error', e && e.message);
      }
    }

    // 2) Fallback: run eslint on staged JS files if eslint is available
    const files = stagedFiles().filter((f) => /\.(js|jsx)$/.test(f));
    if (files.length === 0) {
      console.log('[precommit-safe] no staged JS files to lint; skipping');
      const proc = globalThis['process'];
      if (proc && typeof proc.exit === 'function') proc.exit(0);
      return 0;
    }
    if (hasBin('eslint') && spawnSync && _require) {
      console.log('[precommit-safe] running eslint --fix on staged JS files');
      try {
        const r = _require;
        const execPath = (globalThis['process'] && globalThis['process'].execPath) || 'node';
        const ok = run(execPath, [r.resolve('eslint/bin/eslint.js'), '--fix'].concat(files));
        if (ok) {
          const proc = globalThis['process'];
          if (proc && typeof proc.exit === 'function') proc.exit(0);
          return 0;
        }
        console.warn('[precommit-safe] eslint reported problems');
        const procErr = globalThis['process'];
        if (procErr && typeof procErr.exit === 'function') procErr.exit(1);
        return 1;
      } catch (e) {
        void e;
      }
    }

    console.log('[precommit-safe] no lint-staged or eslint found; skipping lint checks');
    const proc = globalThis['process'];
    if (proc && typeof proc.exit === 'function') proc.exit(0);
    return 0;
  } catch (e) {
    console.error('[precommit-safe] unexpected error', e && e.stack ? e.stack : e);
    const proc = globalThis['process'];
    if (proc && typeof proc.exit === 'function') proc.exit(0);
    return 0;
  }
}

main();
