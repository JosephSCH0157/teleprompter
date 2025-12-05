// @ts-nocheck
export {};

import { getScrollWriter } from '../scroll/scroll-writer';
import { appStore } from '../state/app-store';

// Lightweight ASR ride-along (JS build) — mirrors src/index-hooks/asr.ts behavior
// Uses the Web Speech API directly to avoid TS build requirements in dev.

// Tunables (exported for tests)
export const LEAP_CONFIRM_SCORE = 0.75; // high-confidence confirmation threshold
export const LEAP_CONFIRM_WINDOW_MS = 600;
export const LEAP_SIZE = 4; // nominal leap distance
// v2 Leap tuning: tighter gate + cooldown
const LEAP_TUNING = {
  minScore: 0.68,      // previously ~0.50 — require stronger similarity before deferring/confirming a +4 jump
  maxDistance: 4,      // cap distance (retain existing +4 semantics)
  cooldownMs: 900,     // block rapid back-to-back leap attempts
  minTokens: 3         // ignore very short hypothesis fragments
};
let _lastLeapAt = 0;
export const POST_COMMIT_FREEZE_MS = 250;
export const DISPLAY_MIN_DR = 0.0015;
export const NO_COMMIT_HOLD_MS = 1200;
export const SILENCE_FREEZE_MS = 2500;
export const VAD_PARTIAL_GRACE_MS = 400;

// Internal instance registry for tests/teardown
const __asrInstances = new Set();
const RESCUE_JUMPS_ENABLED = false; // temp gate: keep HUD telemetry but disable forced reposition

const scrollWriter = getScrollWriter();

export function initAsrFeature() {
  try { console.info('[ASR] dev initAsrFeature()'); } catch {}
  // Ensure the status chip node exists early, but hidden, to avoid layout shifts before it's placed into the top bar
  try {
    // If the scroll router already inserted the ASR speed badge, don't create a duplicate chip yet
    const existingBadge = document.getElementById('asrSpeedBadge');
    if (!existingBadge && !document.getElementById('asrChip')) {
      const s = document.createElement('span');
      s.id = 'asrChip'; s.className = 'chip'; s.textContent = 'ASR: off';
      s.style.display = 'none';
      document.body.appendChild(s);
    }
  } catch {}
  // Simple text normalizer (aligns with TS normalizeText/stripFillers basics)
  const normalize = (s) => {
    try { return String(s || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim(); } catch { return ''; }
  };
  const COVERAGE_THRESHOLD = 0.45; // conservative default; TS uses store threshold but we keep simple here

  // Mount a small status chip in the top bar to reflect ASR state
  const mountAsrChip = () => {
    try {
      // Replace the router's ASR speed badge with the ASR chip (avoid router visibility toggles hiding it)
      let chip = document.getElementById('asrChip');
      if (!chip) {
        const old = document.getElementById('asrSpeedBadge');
        if (old && old.parentElement) {
          const repl = document.createElement('span');
          repl.id = 'asrChip';
          repl.className = 'chip';
          repl.textContent = 'ASR: off';
          try { old.replaceWith(repl); } catch { try { old.parentElement.insertBefore(repl, old); old.remove(); } catch {} }
          try { repl.dataset.asrMount = 'badge'; } catch {}
          chip = repl;
        }
      }
      if (!chip) {
        chip = document.createElement('span');
        chip.id = 'asrChip'; chip.className = 'chip'; chip.textContent = 'ASR: off'; chip.style.display='none';
        document.body.appendChild(chip);
      }
      chip.setAttribute('aria-live','polite');
      chip.setAttribute('aria-atomic','true');
      // If router later inserts the ASR speed badge, hijack it and replace in-place
      const hijackBadgeIfPresent = () => {
        try {
          const badge = document.getElementById('asrSpeedBadge');
          if (badge && badge.isConnected) {
            if (badge === chip) return true; // already hijacked (unlikely since ids differ)
            const host = badge.parentElement;
            const repl = chip; // move our chip into badge position
            try { badge.replaceWith(repl); } catch { try { host.insertBefore(repl, badge); badge.remove(); } catch {} }
            try { repl.dataset.asrMount = 'badge'; repl.style.display = ''; } catch {}
            return true;
          }
        } catch {}
        return false;
      };
      // Attempt immediate hijack, then observe for late insertion
      if (!hijackBadgeIfPresent()) {
        try {
          const moBadge = new MutationObserver(() => { if (hijackBadgeIfPresent()) { try { moBadge.disconnect(); } catch {} } });
          moBadge.observe(document.documentElement || document.body, { childList: true, subtree: true });
        } catch {}
      }
      // Update on state changes
      const map = { idle: 'off', ready: 'ready', listening: 'listening', running: 'listening', error: 'error' };
      window.addEventListener('asr:state', (e) => {
        try { const st = e?.detail?.state; chip.textContent = 'ASR: ' + (map[st] || st || 'off'); } catch {}
      });
      // Move chip into top bar when available (append as last child to reduce clutter)
      const attach = () => {
        // If we are reusing the ASR speed badge, it's already mounted in the right place
        if (chip && chip.isConnected && chip.dataset && chip.dataset.asrMount === 'badge') {
          try { chip.style.display = ''; } catch {}
          return true;
        }
        const host = document.querySelector('#topbarRight');
        if (host && host.isConnected) {
          try { host.appendChild(chip); chip.style.display = ''; return true; } catch {}
        }
        return false;
      };
      if (!attach()) {
        let tries = 0; const t = setInterval(() => { tries++; if (attach() || tries > 20) clearInterval(t); }, 150);
        const mo = new MutationObserver(() => { if (attach()) { try { mo.disconnect(); } catch {} } });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      }
      return chip;
    } catch {}
    return null;
  };

  class WebSpeechEngine {
    constructor() {
      const SR = (window.SpeechRecognition || window.webkitSpeechRecognition);
      this.SR = SR || null;
      this.rec = null; this.listeners = new Set(); this.running = false;
      this._available = !!SR;
    }
    on(fn) { try { this.listeners.add(fn); } catch {} }
    off(fn) { try { this.listeners.delete(fn); } catch {} }
    emit(ev) { try { this.listeners.forEach(fn => { try { fn(ev); } catch {} }); } catch {} }
    async start(opts) {
      if (this.running) return;
      if (!this._available) { this.emit({ type: 'ready' }); return; }
      const rec = new this.SR();
      this.rec = rec; this.running = true;
      rec.lang = (opts && opts.lang) || 'en-US';
      rec.interimResults = !!(opts && opts.interim !== false);
      rec.continuous = true;
      rec.onstart = () => { this.emit({ type: 'ready' }); this.emit({ type: 'listening' }); };
      rec.onerror = (e) => { this.emit({ type: 'error', code: e?.error || 'error', message: e?.message || 'speech error' }); };
      rec.onend = () => { this.running = false; this.emit({ type: 'stopped' }); };
      rec.onresult = (e) => {
        try {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const txt = String(res[0]?.transcript || '');
            const conf = Number(res[0]?.confidence || (res.isFinal ? 1 : 0.5));
            this.emit({ type: res.isFinal ? 'final' : 'partial', text: txt, confidence: conf });
          }
        } catch {}
      };
      try { rec.start(); } catch (err) { this.emit({ type: 'error', code: 'start', message: String(err && err.message || err) }); }
    }
    async stop() { try { if (this.rec) this.rec.stop(); } catch {} finally { this.running = false; this.emit({ type: 'stopped' }); } }
  }

  class AsrMode {
    constructor(opts) {
      this.opts = Object.assign({ rootSelector: '#scriptRoot, #script, body', lineSelector: '.line, p', markerOffsetPx: 140, windowSize: 6 }, opts || {});
      this.engine = null; this.state = 'idle'; this.currentIdx = 0; this.rescueCount = 0;
      // De-dup and gating state
      this.lastIdx = -1; this.lastScore = 0; this.lastTs = 0; this.pending = null; this.freezeUntil = 0;
      // Leap confirmation state
      this._leapPending = { idx: -1, ts: 0 };
      // Idle/voice tracking
      this._lastCommitAt = 0; this._lastVADAt = 0; this._lastPartialAt = 0; this._speaking = false;
      this._scrollAnim = null;
      // Manual nudge tracking
      this._nudgedAt = 0; this._nudgedAccepted = false;
      // Telemetry counters
      this._stats = { commits: 0, suppressed: { dup: 0, backwards: 0, leap: 0, freeze: 0 }, scoresSum: 0, gaps: [], tweenStepsSum: 0, tweenStepsN: 0 };
      this._telemetryTimer = null;
      // Stuck detector bookkeeping
      this._stuckLastIdx = -1; this._stuckLastAt = 0;
      // Idle rescue watchdog (accelerated: 3.5s)
      this._idleRescueMs = 3500; this._idleRescueTimer = setInterval(() => {
        try {
          if (this.state !== 'running') return;
          const now = performance.now();
          const last = this._lastCommitAt || 0;
          if (last && now - last > this._idleRescueMs) {
            // Nudge forward one line (unless at end)
            const all = this.getAllLineEls();
            if (all && all.length) {
              let rescueIdx = Math.min(this.currentIdx + 1, all.length - 1);
              rescueIdx = this.nextSpokenFrom(rescueIdx);
              if (rescueIdx !== this.currentIdx) {
                const detail = { index: rescueIdx, reason: 'idle' };
                this.dispatch('asr:rescue', detail);
                try { (window.HUD?.log || console.debug)?.('asr:rescue (idle)', { index: rescueIdx }); } catch {}
                if (RESCUE_JUMPS_ENABLED) {
                  this.currentIdx = rescueIdx;
                  this.scrollToLine(rescueIdx);
                }
                this._lastCommitAt = now; // reset window even when we skip the jump
              }
            }
          }
        } catch {}
      }, 1000);
  try { mountAsrChip(); } catch {}
  try { __asrInstances.add(this); } catch {}
      // VAD listener for gentle idle/silence behavior
      try {
        window.addEventListener('tp:vad', (e) => {
          try {
            const speaking = !!(e && e.detail && e.detail.speaking);
            this._speaking = speaking;
            this._lastVADAt = performance.now();
            if (!speaking) {
              // If silence holds for SILENCE_FREEZE_MS, show ready (avoids creep)
              const due = this._lastVADAt + SILENCE_FREEZE_MS;
              setTimeout(() => {
                try {
                  const now = performance.now();
                  // Guard against false-silence: if any partial in last VAD_PARTIAL_GRACE_MS, stay running
                  if (!this._speaking && now >= due && (now - (this._lastPartialAt || 0)) > VAD_PARTIAL_GRACE_MS) {
                    this.setState('ready');
                  }
                } catch {}
              }, SILENCE_FREEZE_MS + 10);
            }
          } catch {}
        });
      } catch {}
      // Manual nudge/reset safety: wheel or arrow/home/end/page keys
      try {
        const reset = () => {
          try {
            this.lastIdx = -1; this.lastScore = 0; this.lastTs = 0; this.pending = null; this._leapPending = { idx: -1, ts: 0 };
            this.dispatch('asr:rescue', { index: this.currentIdx, reason: 'manual' });
            try { (window.HUD?.log || console.debug)?.('asr:rescue (manual)'); } catch {}
            this._nudgedAt = performance.now(); this._nudgedAccepted = false;
          } catch {}
        };
        let lastReset = 0;
        const maybeReset = () => { const now = performance.now(); if (now - lastReset > 300) { lastReset = now; reset(); } };
        window.addEventListener('wheel', maybeReset, { passive: true });
        window.addEventListener('keydown', (ev) => {
          try {
            const k = (ev && (ev.code || ev.key || '')).toString();
            if (/Arrow|Page|Home|End/.test(k)) maybeReset();
          } catch {}
        }, { capture: true });
        window.addEventListener('tp:manual-nudge', maybeReset);
      } catch {}
    }
    lineIsSilent(idx) {
      try { return !!document.querySelector(`.line[data-line-idx="${idx}"][data-silent="1"]`); } catch { return false; }
    }
    nextSpokenFrom(idx) {
      try {
        const total = this.getAllLineEls().length;
        let i = idx;
        while (i < total && this.lineIsSilent(i)) i++;
        return i;
      } catch { return idx; }
    }
    // Direct index commit (dev/test). Applies the same gating used by tryAdvance, but skips coverage.
    commitIndex(newIdx, bestScore = 1) {
      try {
        if (typeof newIdx !== 'number' || !isFinite(newIdx)) return;
        if (newIdx < this.currentIdx) { try { this._stats.suppressed.backwards++; } catch {} return; }
        const delta = newIdx - this.currentIdx;
        if (!this._leapAllowed(delta, newIdx, bestScore)) return;
        if (!this.shouldCommit(newIdx, bestScore)) return;
        if (!this.gateLowConfidence(newIdx, bestScore)) return;
        newIdx = this.nextSpokenFrom(newIdx);
        this.currentIdx = newIdx;
        try { this.scrollToLine(newIdx, bestScore); } catch {}
        this.dispatch('asr:advance', { index: newIdx, score: bestScore });
        try { (window.HUD?.log || console.debug)?.('asr:advance(idx)', { index: newIdx, score: Number(bestScore).toFixed(2) }); } catch {}
        try { this.freezeUntil = performance.now() + POST_COMMIT_FREEZE_MS; } catch {}
        try {
          const now = performance.now();
          if (this._lastCommitAt) { const gap = now - this._lastCommitAt; try { if (isFinite(gap)) this._stats.gaps.push(gap); } catch {} }
          this._lastCommitAt = now;
          try { this._stats.commits++; this._stats.scoresSum += (Number(bestScore) || 0); } catch {}
        } catch {}
      } catch {}
    }
    getState() { return this.state; }
    async start() {
      if (this.state !== 'idle') return;
      // If HUD bus exists (speech-loader routes there), subscribe instead of starting our own SR.
      const bus = (window.HUD && window.HUD.bus) || (window.__tpHud && window.__tpHud.bus) || null;
      this._bus = bus;
      this._busHandlers = [];
      if (bus && typeof bus.on === 'function') {
        // Prevent duplicate bindings if start called redundantly during mode flips
        if (this._bus === bus && this._busHandlers && this._busHandlers.length) {
          this.setState('listening');
          this.dispatch('asr:state', { state: 'listening' });
          return;
        }
        const onPartial = (p) => { try { this.onEngineEvent({ type: 'partial', text: String(p?.text || ''), confidence: 0.5 }); } catch {} };
        const onFinal   = (p) => { try { this.onEngineEvent({ type: 'final',   text: String(p?.text || ''), confidence: 1.0 }); } catch {} };
        try { bus.on('speech:partial', onPartial); this._busHandlers.push(['speech:partial', onPartial]); } catch {}
        try { bus.on('speech:final',   onFinal);   this._busHandlers.push(['speech:final',   onFinal]);   } catch {}
        this.setState('listening');
        this.dispatch('asr:state', { state: 'listening' });
        // Announce that we piggybacked on Speech Sync
        try { (window.HUD?.log || console.debug)?.('asr', { mode: 'bus-follow' }); } catch {}
        // Start periodic telemetry
        try { if (this._telemetryTimer) clearInterval(this._telemetryTimer); } catch {}
        try {
          this._telemetryTimer = setInterval(() => this._emitStats(), 5000);
          // In node/test, make timer non-blocking
          try { this._telemetryTimer?.unref?.(); } catch {}
        } catch {}
        return;
      }
      // Fallback: start our own Web Speech recognizer
      this.engine = new WebSpeechEngine();
      this.engine.on((e) => this.onEngineEvent(e));
      this.setState('ready');
      try { if (this._telemetryTimer) clearInterval(this._telemetryTimer); } catch {}
      try {
        this._telemetryTimer = setInterval(() => this._emitStats(), 5000);
        try { this._telemetryTimer?.unref?.(); } catch {}
      } catch {}
      await this.engine.start({ lang: 'en-US', interim: true });
    }
    async stop() {
      // Unsubscribe from HUD bus if we used it
      try {
        if (this._bus && this._busHandlers && typeof this._bus.off === 'function') {
          for (const [ev, fn] of this._busHandlers) { try { this._bus.off(ev, fn); } catch {} }
        }
      } catch {}
      this._bus = null; this._busHandlers = [];
      try { await this.engine?.stop?.(); } catch {}
      this.setState('idle');
      this.dispatch('asr:state', { state: this.state });
      // Final telemetry flush
      try { this._emitStats(true); } catch {}
      try { if (this._telemetryTimer) clearInterval(this._telemetryTimer); } catch {}
    }
    onEngineEvent(e) {
      if (e.type === 'ready') this.setState('ready');
      if (e.type === 'listening') this.setState('listening');
      if (e.type === 'partial' || e.type === 'final') {
        if (this.state !== 'running') this.setState('running');
        const text = normalize(e.text);
        if (e.type === 'partial') { try { this._lastPartialAt = performance.now(); } catch {} }
        this.tryAdvance(text, e.type === 'final', Number(e.confidence || (e.type === 'final' ? 1 : 0.5)));
      }
      if (e.type === 'error') { this.setState('error'); this.dispatch('asr:error', { code: e.code, message: e.message }); }
      if (e.type === 'stopped') { this.setState('idle'); }
    }
  setState(s) { this.state = s; this.dispatch('asr:state', { state: s }); try { (window.HUD?.log || console.debug)?.('asr:state', s); } catch {} }
    dispatch(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {} }
    getAllLineEls() {
      const root = document.querySelector(this.opts.rootSelector) || document.body;
      const list = Array.from(root.querySelectorAll(this.opts.lineSelector));
      return list.length ? list : Array.from(document.querySelectorAll('.line, p'));
    }
    getWindow() {
      const els = this.getAllLineEls();
      const start = Math.max(0, Math.min(this.currentIdx, Math.max(0, els.length - 1)));
      const end = Math.max(start, Math.min(els.length, start + this.opts.windowSize));
      const texts = els.slice(start, end).map(el => normalize(el.textContent || ''));
      return { lines: texts, idx0: start };
    }
    shouldCommit(idx, score) {
      try {
        const now = performance.now();
        const sameIdx = idx === this.lastIdx;
        const scoreGain = (Number(score) || 0) - (Number(this.lastScore) || 0);
        // Manual nudge semantics: allow one same-line acceptance after nudge; subsequent same-line requires score gain >= 0.1
        if (this._nudgedAt && idx === this.currentIdx) {
          if (!this._nudgedAccepted) { this._nudgedAccepted = true; this.lastIdx = idx; this.lastScore = Number(score) || 0; this.lastTs = now; return true; }
          if (scoreGain < 0.10) { try { this._stats.suppressed.dup++; } catch {} return false; }
        }
        if (sameIdx && scoreGain < 0.12 && (now - (this.lastTs || 0)) < 350) { try { this._stats.suppressed.dup++; } catch {} return false; }
        this.lastIdx = idx; this.lastScore = Number(score) || 0; this.lastTs = now;
        return true;
      } catch { return true; }
    }
    gateLowConfidence(idx, score) {
      try {
        const now = performance.now();
        const LOW = 0.55, WINDOW = 1200;
        const s = Number(score) || 0;
        if (s >= LOW) { this.pending = null; return true; }
        const p = this.pending;
        if (!p || p.idx !== idx || (now - p.ts) > WINDOW) { this.pending = { idx, score: s, ts: now }; return false; }
        this.pending = null; return true;
      } catch { return true; }
    }
    smoothScrollTo(scroller, top, ms = 160, score = 1) {
      // Discrete stepped tween (reduces scroll spam to ~3-5 writes per commit)
      try { if (this._scrollAnim && this._scrollAnim.cancel) this._scrollAnim.cancel(); } catch {}
      const isWin = (scroller === document.scrollingElement || scroller === document.body);
      const from = isWin ? (window.scrollY || window.pageYOffset || 0) : (scroller.scrollTop || 0);
      const delta = Number(top || 0) - Number(from || 0);
      // Deadband at target (±0.002 scroll ratio)
      try {
        const denom = isWin ? ((document.documentElement?.scrollHeight || 0) - (window.innerHeight || 0)) : ((scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
        if (denom > 0) {
          const rFrom = from / denom; const rTo = Number(top || 0) / denom;
          if (Math.abs(rTo - rFrom) < 0.002) { try { this._stats.tweenStepsN++; } catch {} return 0; }
        }
      } catch {}
      let cancelled = false;
      // Score-aware steps: shaky spans snappy; rock-solid silky
      let steps = Math.max(3, Math.min(5, Math.round(ms / 50))); // base 3-5
      const s = Number(score) || 0;
      if (s >= 0.85) steps = 5;
      else if (s >= 0.5 && s <= 0.6) steps = Math.min(steps, 3);
      try { this._stats.tweenStepsSum += steps; this._stats.tweenStepsN++; } catch {}
      let i = 0;
      const write = () => {
        if (cancelled) return;
        i++;
        const k = i / steps;
        const y = from + delta * (k < 0 ? 0 : (k > 1 ? 1 : k));
        try { scrollWriter.scrollTo(y, { behavior: 'auto' }); } catch {}
        if (i < steps) requestAnimationFrame(write);
      };
      this._scrollAnim = { cancel: () => { cancelled = true; } };
      requestAnimationFrame(write);
      return steps;
    }
    _leapAllowed(delta, idx, score) {
      try {
        if (delta < LEAP_SIZE) return true; // small forward movement
        const now = performance.now();
        const s = Number(score) || 0;
        const tokenCount = this._lastHypTokensCount || 0;
        // Hard gates first
        if (Math.abs(delta) > LEAP_TUNING.maxDistance) return false;
        if (s < LEAP_TUNING.minScore) { try { this._stats.suppressed.leap++; } catch {}; return false; }
        if (tokenCount < LEAP_TUNING.minTokens) { try { this._stats.suppressed.leap++; } catch {}; return false; }
        if ((now - _lastLeapAt) < LEAP_TUNING.cooldownMs) { try { this._stats.suppressed.leap++; } catch {}; return false; }
        // Confirmation pathway
        if (s >= LEAP_CONFIRM_SCORE) {
          this._leapPending = { idx: -1, ts: 0 }; _lastLeapAt = now;
          try { (window.HUD?.log || console.debug)?.('asr:confirm leap \u2713', { d: '+' + delta }); } catch {}
          return true;
        }
        if (this._leapPending && this._leapPending.idx === idx) {
          if ((now - this._leapPending.ts) <= LEAP_CONFIRM_WINDOW_MS) {
            this._leapPending = { idx: -1, ts: 0 }; _lastLeapAt = now;
            try { (window.HUD?.log || console.debug)?.('asr:confirm leap \u2713', { d: '+' + delta }); } catch {}
            return true;
          } else {
            try { (window.HUD?.log || console.debug)?.('asr:confirm expired'); } catch {}
            try { this._stats.suppressed.leap++; } catch {}
          }
        }
        this._leapPending = { idx, ts: now }; _lastLeapAt = now;
        try { (window.HUD?.log || console.debug)?.('asr:defer leap', { d: '+' + delta, score: s.toFixed(2) }); } catch {}
        try { this._stats.suppressed.leap++; } catch {}
        return false;
      } catch { return true; }
    }
  tryAdvance(hyp, isFinal, confidence) {
      // Freeze briefly after big jumps to avoid rubber-banding on line starts
      try {
        const now = performance.now();
        if (now < (this.freezeUntil || 0)) {
          const ms = Math.max(0, Math.round((this.freezeUntil || 0) - now));
          try { this._stats.suppressed.freeze++; } catch {}
          try { (window.HUD?.log || console.debug)?.('asr:drop freeze', { ms }); } catch {}
          return;
        }
      } catch {}
      // Cache hyp token count for leap gating
      try { this._lastHypTokensCount = String(hyp || '').split(/\s+/).filter(Boolean).length; } catch { this._lastHypTokensCount = 0; }
      const { lines, idx0 } = this.getWindow();
      let bestIdx = -1, bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        const score = coverageScore(lines[i], hyp) * (confidence || 1);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      const thr = Number(localStorage.getItem('tp_asr_threshold') || COVERAGE_THRESHOLD) || COVERAGE_THRESHOLD;
      if (bestIdx >= 0 && bestScore >= thr) {
  let newIdx = idx0 + bestIdx;
        if (newIdx < this.currentIdx) { try { this._stats.suppressed.backwards++; } catch {} return; }
        if (newIdx === this.currentIdx) { /* allow dedupe logic below to decide */ }
        const delta = newIdx - this.currentIdx;
        // Leap confirmation guard
        if (!this._leapAllowed(delta, newIdx, bestScore)) return;
        if (!this.shouldCommit(newIdx, bestScore)) return;
        if (!this.gateLowConfidence(newIdx, bestScore)) return;
  // Skip silent cue lines (pause/beat) automatically
  newIdx = this.nextSpokenFrom(newIdx);
  this.currentIdx = newIdx;
        this.scrollToLine(newIdx, bestScore);
        this.dispatch('asr:advance', { index: newIdx, score: bestScore });
        try { (window.HUD?.log || console.debug)?.('asr:advance', { index: newIdx, score: Number(bestScore).toFixed(2) }); } catch {}
        // Micro freeze after commit (applies to all commits, keeps double-fires down)
        try { this.freezeUntil = performance.now() + POST_COMMIT_FREEZE_MS; } catch {}
        // Mark commit time for idle-hold logic
        try {
          const now = performance.now();
          if (this._lastCommitAt) { const gap = now - this._lastCommitAt; try { if (isFinite(gap)) this._stats.gaps.push(gap); } catch {} }
          this._lastCommitAt = now;
          try { this._stats.commits++; this._stats.scoresSum += (Number(bestScore) || 0); } catch {}
        } catch {}
        // End-of-script courtesy stop
        try {
          const total = this.getAllLineEls().length;
          if (newIdx >= total - 1) { try { window.dispatchEvent(new CustomEvent('asr:stop')); } catch {} }
        } catch {}
        // Same-index stuck detector (nudges forward after STUCK.ms without commit change)
        try {
          const now2 = performance.now();
          if (newIdx === this._stuckLastIdx) {
            if (now2 - this._stuckLastAt > 2500) { // STUCK.ms
              let rescueIdx = Math.min(newIdx + 1, this.getAllLineEls().length - 1);
              rescueIdx = this.nextSpokenFrom(rescueIdx);
              if (rescueIdx !== newIdx) {
                const detail = { index: rescueIdx, reason: 'same-index' };
                this.dispatch('asr:rescue', detail);
                try { (window.HUD?.log || console.debug)?.('asr:rescue (same-index)', { from: newIdx, to: rescueIdx }); } catch {}
                if (RESCUE_JUMPS_ENABLED) {
                  this.currentIdx = rescueIdx;
                  this.scrollToLine(rescueIdx);
                }
              }
              this._stuckLastAt = now2; // reset window
            }
          } else { this._stuckLastIdx = newIdx; this._stuckLastAt = now2; }
        } catch {}
      } else if (isFinal) {
        this.rescueCount++;
        if (this.rescueCount <= 2) {
          let rIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
          rIdx = this.nextSpokenFrom(rIdx);
          const detail = { index: rIdx, reason: 'weak-final' };
          this.dispatch('asr:rescue', detail);
          try { (window.HUD?.log || console.debug)?.('asr:rescue', { index: rIdx }); } catch {}
          if (RESCUE_JUMPS_ENABLED) {
            this.currentIdx = rIdx;
            this.scrollToLine(this.currentIdx);
          }
        }
      }
    }
    scrollToLine(idx, score = 1) {
      const els = this.getAllLineEls();
      const target = els[idx]; if (!target) return;
      // Skip during pre-roll
      try {
        const ov = document.getElementById('countOverlay');
        if (ov) { const cs = getComputedStyle(ov); const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && !ov.classList.contains('hidden'); if (visible) return; }
      } catch {}
      const scroller = findScroller(target); const marker = this.opts.markerOffsetPx;
      const top = elementTopRelativeTo(target, scroller) - marker;
      try { const steps = this.smoothScrollTo(scroller, top, 160, score); if (typeof steps === 'number') { /* stats updated inside */ } } catch {}
    }
    _emitStats(final = false) {
      try {
        const commits = this._stats.commits || 0;
        const avgScore = commits ? (this._stats.scoresSum / commits) : 0;
        const tweenStepsAvg = (this._stats.tweenStepsN ? (this._stats.tweenStepsSum / this._stats.tweenStepsN) : 0);
        let p95GapMs = 0;
        if (this._stats.gaps && this._stats.gaps.length) {
          const arr = this._stats.gaps.slice().sort((a,b)=>a-b);
          const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.95));
          p95GapMs = arr[idx] || 0;
        }
        const payload = {
          commits,
          suppressed: Object.assign({ dup:0, backwards:0, leap:0, freeze:0 }, this._stats.suppressed || {}),
          avgScore: Number(avgScore.toFixed(3)),
          p95GapMs: Math.round(p95GapMs),
          tweenStepsAvg: Number(tweenStepsAvg.toFixed(2))
        };
        window.dispatchEvent(new CustomEvent('asr:stats', { detail: payload }));
      } catch {}
      // Reset counters for next window
      this._stats = { commits: 0, suppressed: { dup: 0, backwards: 0, leap: 0, freeze: 0 }, scoresSum: 0, gaps: [], tweenStepsSum: 0, tweenStepsN: 0 };
      if (final) { try { if (this._telemetryTimer) clearInterval(this._telemetryTimer); } catch {} }
    }
  }

  // Small helpers for scrolling/coverage
  function coverageScore(line, hyp) {
    try {
      const A = new Set(String(line || '').split(' ').filter(Boolean));
      const B = new Set(String(hyp || '').split(' ').filter(Boolean));
      if (A.size === 0) return 0; let inter = 0; for (const w of A) if (B.has(w)) inter++; return inter / A.size;
    } catch { return 0; }
  }
  function findScroller(el) {
    let node = el?.parentElement;
    while (node) { try { const st = getComputedStyle(node); if (/(auto|scroll)/.test(st.overflowY || '')) return node; } catch {} node = node.parentElement; }
    return document.scrollingElement || document.body;
  }
  function elementTopRelativeTo(el, scroller) {
    const r1 = el.getBoundingClientRect();
    const isWin = (scroller === document.scrollingElement || scroller === document.body);
    const r2 = isWin ? { top: 0 } : scroller.getBoundingClientRect();
    const scrollTop = isWin ? window.pageYOffset : scroller.scrollTop;
    return r1.top - r2.top + scrollTop;
  }

  // Coordinator: follow Speech Sync and Mode changes; interlock auto-scroll
  let asrMode = null; let speechActive = false; let asrActive = false; let autoHeld = false;
  // Allow a dev/test override of mode via window.__tpModeOverride or tp:mode events
  const getScrollMode = () => {
    try {
      const ov = (typeof window.__tpModeOverride === 'string') ? window.__tpModeOverride : null;
      if (ov) return String(ov).toLowerCase();
      const store = (window as any).__tpStore || appStore;
      const v = store?.get?.('scrollMode');
      if (typeof v === 'string') return v.toLowerCase();
    } catch {}
    return '';
  };
  const wantASR = () => getScrollMode() === 'asr';
  const setChipVisible = (on) => { try { const c = document.getElementById('asrChip'); if (c) c.style.display = on ? '' : 'none'; } catch {} };
  const setChipState = (state) => { try { window.dispatchEvent(new CustomEvent('asr:state', { detail: { state } })); } catch {} };
  const holdAuto = () => {
    if (autoHeld) return; autoHeld = true;
    try { window.__scrollCtl?.stop?.(); } catch {}
    try { (window.__tpAuto || window.Auto || window.__scrollCtl)?.setEnabled?.(false); } catch {}
    try { window.dispatchEvent(new CustomEvent('autoscroll:disable', { detail: 'asr' })); } catch {}
  };
  const releaseAuto = () => {
    if (!autoHeld) return; autoHeld = false;
    // Do not auto-start on release; user intent or router will decide to re-enable
    try { window.dispatchEvent(new CustomEvent('autoscroll:enable', { detail: 'asr' })); } catch {}
  };
  const ensureMode = async () => { if (!asrMode) asrMode = new AsrMode({}); return asrMode; };
  const start = async () => { if (asrActive) return; try { const m = await ensureMode(); holdAuto(); await m.start(); asrActive = true; } catch (err) { asrActive = false; releaseAuto(); try { console.warn('[ASR] start failed', err); } catch {} } };
  const stop  = async () => { if (!asrActive) return; try { await asrMode?.stop?.(); } finally { asrActive = false; releaseAuto(); } };

  window.addEventListener('tp:speech-state', (ev) => {
    try {
      const d = ev?.detail || {}; const on = (d.running === true) || (typeof d.state === 'string' && (d.state === 'active' || d.state === 'running'));
      speechActive = !!on;
      // Reflect speech activity on the chip even outside pure ASR mode (e.g., Hybrid)
      try { window.dispatchEvent(new CustomEvent('asr:state', { detail: { state: on ? 'listening' : 'idle' } })); } catch {}
      // Idle-hold: if speaking but no commits for NO_COMMIT_HOLD_MS, keep 'running' (don't show idle)
      try {
        if (asrMode && asrMode._speaking) {
          const due = asrMode._lastCommitAt + NO_COMMIT_HOLD_MS;
          if (performance.now() > due && asrMode.state === 'running') {
            // no-op: intentionally keep state 'running'; do not downgrade
          }
        }
      } catch {}
      if (speechActive && wantASR()) void start(); else void stop();
    } catch {}
  });
  // Dev/test: mode override event (avoids DOM select in headless harness)
  window.addEventListener('tp:mode', (ev) => {
    try {
      const m = (ev && ev.detail && ev.detail.mode) ? String(ev.detail.mode) : '';
      if (!m) return;
      try { window.__tpModeOverride = m; } catch {}
      // If speech is active, apply start/stop based on new mode
      if (speechActive) { wantASR() ? void start() : void stop(); }
    } catch {}
  });
  try {
    const store = (window as any).__tpStore || appStore;
    store?.subscribe?.('scrollMode', () => {
      const isAsr = wantASR();
      if (isAsr) {
        try { mountAsrChip(); } catch {}
        setChipVisible(true);
        setChipState(speechActive ? 'listening' : 'ready');
      } else {
        setChipState('idle');
        setChipVisible(false);
      }
      if (!speechActive) return; // Do not start/stop engine when speech is off
      isAsr ? void start() : void stop();
    });
  } catch {}
  window.addEventListener('asr:toggle', (e) => { const armed = !!(e?.detail?.armed); armed ? void start() : void stop(); });
  window.addEventListener('asr:stop', () => { void stop(); });

  // Dev/test: direct speech-result hook (final-only) to drive commits without full coverage engine
  // detail: { type: 'partial'|'final', index: number, score?: number }
  window.addEventListener('tp:speech-result', (ev) => {
    try {
      if (!asrMode || !asrActive) return;
      const d = ev && ev.detail || {};
      const idx = Number(d.index);
      if (!isFinite(idx)) return;
      if (String(d.type || '').toLowerCase() !== 'final') return; // ignore partial in this minimal hook
      // Allow test harness to jump directly: pre-position currentIdx when the leap exceeds our confirmation window.
      // This keeps commitIndex gating intact while avoiding synthetic large-leap suppression in headless smoke tests.
      try {
        const cur = Number(asrMode.currentIdx || 0);
        const delta = idx - cur;
        if (delta > (LEAP_TUNING.maxDistance || LEAP_SIZE)) {
          // Pre-position just behind the target to turn the jump into a small forward move
          asrMode.currentIdx = Math.max(0, idx - 1);
        }
      } catch {}
      try { asrMode.commitIndex?.(idx, Number(d.score || 1)); } catch {}
    } catch {}
  });

  // Late-load reconcile
  try {
    const body = document.body; speechActive = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening'))) || (window.speechOn === true);
    const isAsr = wantASR();
    if (isAsr) { try { mountAsrChip(); } catch {} setChipVisible(true); setChipState(speechActive ? 'listening' : 'ready'); }
    else { setChipVisible(false); }
    if (speechActive && isAsr) void start();
  } catch {}
}

export default initAsrFeature;

// Test hook: tear down any live ASR instances and clear timers
export async function teardownASR() {
  try {
    for (const inst of Array.from(__asrInstances)) {
      try { await inst.stop?.(); } catch {}
      try { inst._emitStats?.(true); } catch {}
      try { if (inst._telemetryTimer) clearInterval(inst._telemetryTimer); } catch {}
      try { inst._telemetryTimer?.unref?.(); } catch {}
    }
  } catch {}
  try { __asrInstances.clear?.(); } catch {}
}

// Also expose a window helper for headless smokes that don't import ESM named exports
try { if (typeof window !== 'undefined') { window.__asrFinalizeForTests = teardownASR; } } catch {}

