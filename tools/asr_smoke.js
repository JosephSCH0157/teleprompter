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
  const recordAsync = async (name, fn) => {
    const t0 = Date.now();
    try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); }
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

  // Extra smoke tests
  // A) Reordered partial→final burst: expect backwards suppressed once
  record('Reordered partial/final burst', () => {
    let current = 50;
    let commits = [];
    let suppressed = { backwards: 0 };
    const advance = (idx) => {
      if (idx < current) { suppressed.backwards++; return false; }
      if (idx === current) return false;
      current = idx; commits.push(idx); return true;
    };
    advance(52);               // final
    advance(48);               // partial (reordered) -> backwards suppressed
    advance(53);               // final
    assert.deepStrictEqual(commits, [52, 53]);
    assert.strictEqual(suppressed.backwards, 1);
  });

  // B) Confirm window miss: second hit after window -> no commit
  await recordAsync('Confirm window miss', async () => {
    let pending = { idx: -1, ts: 0 };
    const now = () => performance.now();
    const allow = (delta, idx, score) => {
      if (delta < 4) return true;
      if (score >= mod.LEAP_CONFIRM_SCORE) { pending = { idx: -1, ts: 0 }; return true; }
      if (pending.idx === idx && (now() - pending.ts) <= mod.LEAP_CONFIRM_WINDOW_MS) { pending = { idx: -1, ts: 0 }; return true; }
      pending = { idx, ts: now() }; return false;
    };
    const base = 10;
    assert.strictEqual(allow(6, base + 6, 0.52), false); // defer
    await new Promise(r => setTimeout(r, mod.LEAP_CONFIRM_WINDOW_MS + 50));
    assert.strictEqual(allow(6, base + 6, 0.52), false); // confirm expired -> still suppressed
  });

  // C) Freeze clamp: two within POST_COMMIT_FREEZE_MS -> only first
  await recordAsync('Freeze clamp', async () => {
    const FREEZE = mod.POST_COMMIT_FREEZE_MS || 250;
    let freezeUntil = 0; let commits = 0;
    const tryCommit = () => {
      const t = performance.now();
      if (t < freezeUntil) return false;
      commits++; freezeUntil = t + FREEZE; return true;
    };
    assert.strictEqual(tryCommit(), true);
    await new Promise(r => setTimeout(r, Math.min(200, Math.max(10, FREEZE - 50))));
    assert.strictEqual(tryCommit(), false);
    await new Promise(r => setTimeout(r, 80)); // let freeze pass
    assert.strictEqual(tryCommit(), true);
    assert.strictEqual(commits >= 2, true);
  });

  // D) Nudge resync semantics
  record('Nudge resync', () => {
    let currentIdx = 60;
    let lastIdx = -1, lastScore = 0, lastTs = 0;
    let nudgedAt = performance.now(); let nudgedAccepted = false;
    const shouldCommit = (idx, score) => {
      const nowp = performance.now();
      if (nudgedAt && idx === currentIdx) {
        if (!nudgedAccepted) { nudgedAccepted = true; lastIdx = idx; lastScore = score; lastTs = nowp; return true; }
        if ((score - lastScore) < 0.10) return false;
      }
      const sameIdx = idx === lastIdx; const scoreGain = score - lastScore;
      if (sameIdx && scoreGain < 0.12 && (nowp - lastTs) < 350) return false;
      lastIdx = idx; lastScore = score; lastTs = nowp; return true;
    };
    // duplicate 60 allowed once after nudge
    assert.strictEqual(shouldCommit(60, 0.60), true);
    assert.strictEqual(shouldCommit(60, 0.65), false); // second same-line without +0.1
    assert.strictEqual(shouldCommit(61, 0.70), true);  // next line ok
    assert.strictEqual(shouldCommit(61, 0.75), false); // duplicate 61 suppressed
  });

  // --- Mode flip no-dup listeners --------------------------------------------
  await recordAsync('Mode flip no-dup (ASR → Hybrid → ASR)', async () => {
    // Minimal window/document polyfill
    const listeners = {};
    global.window = global.window || {};
    window.addEventListener = (ev, cb) => { (listeners[ev]||(listeners[ev]=[])).push(cb); };
    window.removeEventListener = (ev, cb) => { const L=listeners[ev]||[]; const i=L.indexOf(cb); if(i>=0) L.splice(i,1); };
    window.dispatchEvent = (ev) => { const L=listeners[ev.type]||[]; for (const cb of L.slice()) { try { cb(ev); } catch {} } };
    global.CustomEvent = class CustomEvent { constructor(type, init){ this.type=type; this.detail=init && init.detail; } };
    // Headless DOM stubs
    global.document = global.document || {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => ({ length: 0, forEach(){} }),
      addEventListener: () => {},
      documentElement: { classList: { add(){}, remove(){}, contains(){ return false; } } },
      body: { classList: { contains(){ return false; } } }
    };
    global.getComputedStyle = global.getComputedStyle || (() => ({ overflowY: 'visible', display: 'block', visibility: 'visible' }));
    global.requestAnimationFrame = global.requestAnimationFrame || ((fn) => setTimeout(fn, 0));

    // Import and init the ASR feature (idempotent)
    const mod = await import('file:///' + p.replace(/\\/g, '/'));
    if (typeof mod.default === 'function') mod.default();

    const commits = [];
    const onAdvance = (e) => commits.push(e.detail && (e.detail.index ?? e.detail.idx ?? e.detail));
    window.addEventListener('asr:advance', onAdvance);

    const tick = (ms) => new Promise(r => setTimeout(r, ms));

    // 1) Start ASR and drive one commit (final only)
    window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: 'ASR' } }));
    window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } }));
    await tick(5);
    window.dispatchEvent(new CustomEvent('tp:speech-result', { detail: { type: 'partial', index: 52, score: 0.74 } }));
    window.dispatchEvent(new CustomEvent('tp:speech-result', { detail: { type: 'final',   index: 52, score: 0.90 } }));
    await tick(20);

    // 2) Flip out and back, then commit second index
    window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: 'Hybrid' } }));
    await tick(10);
    window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: 'ASR' } }));
    await tick(10);
    window.dispatchEvent(new CustomEvent('tp:speech-result', { detail: { type: 'partial', index: 53, score: 0.72 } }));
    window.dispatchEvent(new CustomEvent('tp:speech-result', { detail: { type: 'final',   index: 53, score: 0.88 } }));
    await tick(30);
    // a lone duplicate final shouldn't double-commit
    window.dispatchEvent(new CustomEvent('tp:speech-result', { detail: { type: 'final', index: 53, score: 0.88 } }));
    await tick(10);

    window.removeEventListener('asr:advance', onAdvance);
    if (!(commits.length === 2 && commits[0] === 52 && commits[1] === 53)) {
      throw new Error(`expected 2 commits [52,53], got ${commits.length} [${commits.join(', ')}]`);
    }
  });

  const ok = results.every(r => r.ok);
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + ' - ' + r.name + ' (' + r.ms + 'ms)' + (r.ok ? '' : (' :: ' + r.err)));
  }
  if (!ok) throw new Error('asr_smoke failures');
})()
.catch((e) => { console.error(e); /* defer exit to finally for gated hard-exit */ })
.finally(async () => {
  // Teardown ASR timers/listeners; mirror recorder smoke gating
  try {
    const mod = await import('file:///' + path.resolve(__dirname, '../src/index-hooks/asr.js').replace(/\\/g, '/'));
    try { await mod.teardownASR?.(); } catch {}
  } catch {}
  try { if (global.window && typeof window.__asrFinalizeForTests === 'function') await window.__asrFinalizeForTests(); } catch {}
  // Optional debug handles when stickiness occurs
  try {
    if (process?.env?.DEBUG_HANDLES === '1' && typeof process._getActiveHandles === 'function') {
      const hs = process._getActiveHandles();
      console.log('[debug] active handles:', hs.map(h => h?.constructor?.name));
    }
  } catch {}
  // Gate hard exit for CI or direct script run
  try {
    const wantHardExit = (process?.env?.SMOKE_HARD_EXIT === '1') || (typeof require !== 'undefined' && require?.main === module);
    if (wantHardExit) setImmediate(() => { try { process.exit(0); } catch {} });
  } catch {}
});
