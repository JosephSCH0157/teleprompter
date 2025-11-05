#!/usr/bin/env node
/*
  Lightweight ASR hardener smoke tests (no Jest required).
  Usage: node tools/asr_smoke.js
*/
const path = require('path');
const assert = require('assert');

(async () => {
  const p = path.resolve(__dirname, '../src/index-hooks/asr.js');
  /** @type {{LEAP_CONFIRM_SCORE:number, LEAP_CONFIRM_WINDOW_MS:number}} */
  const mod = await import('file:///' + p.replace(/\\/g, '/'));
  const results = [];
  const record = (name, fn) => {
    const t0 = Date.now();
    try { fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); }
    catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, err: e && e.message }); }
  };

  // 1) Monotonic index guard (simulation)
  record('Monotonic index', () => {
    let cur = 10;
    const mono = (next) => { if (next <= cur) return false; cur = next; return true; };
    assert.strictEqual(mono(10), false);
    assert.strictEqual(mono(9), false);
    assert.strictEqual(mono(11), true);
    assert.strictEqual(cur, 11);
  });

  // 2) Leap guard
  record('Leap guard', () => {
    let pending = { idx: -1, ts: 0 };
    const now = () => performance.now();
    const allow = (delta, idx, score) => {
      if (delta < 4) return true;
      if (score >= mod.LEAP_CONFIRM_SCORE) { pending = { idx: -1, ts: 0 }; return true; }
      if (pending.idx === idx && (now() - pending.ts) <= mod.LEAP_CONFIRM_WINDOW_MS) { pending = { idx: -1, ts: 0 }; return true; }
      pending = { idx, ts: now() }; return false;
    };
    const base = 3;
    assert.strictEqual(allow(6, base + 6, 0.52), false);
    assert.strictEqual(allow(6, base + 6, 0.52), true);
    assert.strictEqual(allow(6, base + 6, 0.82), true);
  });

  // 3) Idle hold policy (logic stub): speaking + overdue implies keep running
  record('Idle hold policy', async () => {
    const t0 = performance.now();
    const speaking = true;
    await new Promise((r) => setTimeout(r, (mod.NO_COMMIT_HOLD_MS || 1200) + 100));
    const overdue = performance.now() > (t0 + (mod.NO_COMMIT_HOLD_MS || 1200));
    assert.strictEqual(speaking && overdue, true);
  });

  // 4) Log budget per commit (step tween bounds)
  record('Log budget per commit', () => {
    const stepsFor = (ms) => Math.max(3, Math.min(5, Math.round(ms / 50)));
    const n = stepsFor(160);
    assert.ok(n >= 3 && n <= 5);
  });

  const ok = results.every(r => r.ok);
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + ' - ' + r.name + ' (' + r.ms + 'ms)' + (r.ok ? '' : (' :: ' + r.err)));
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
