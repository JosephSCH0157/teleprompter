// Lightweight ASR ride-along (JS build) — mirrors src/index-hooks/asr.ts behavior
// Uses the Web Speech API directly to avoid TS build requirements in dev.

export function initAsrFeature() {
  try { console.info('[ASR] dev initAsrFeature()'); } catch {}
  // Ensure the status chip is present as early as possible
  try { (function(){ try { const el = document.getElementById('asrChip'); if (!el) { /* attempt mount into topbar */
    const host = document.querySelector('#topbarRight, .topbar, header, body') || document.body;
    const chip = document.createElement('span'); chip.id = 'asrChip'; chip.className = 'chip'; chip.textContent = 'ASR: off'; host.insertBefore(chip, host.firstChild);
  } } catch {} })(); } catch {}
  // Simple text normalizer (aligns with TS normalizeText/stripFillers basics)
  const normalize = (s) => {
    try { return String(s || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim(); } catch { return ''; }
  };
  const COVERAGE_THRESHOLD = 0.45; // conservative default; TS uses store threshold but we keep simple here

  // Mount a small status chip in the top bar to reflect ASR state
  const mountAsrChip = () => {
    try {
      if (document.getElementById('asrChip')) return document.getElementById('asrChip');
      const chip = document.createElement('span');
      chip.id = 'asrChip';
      chip.className = 'chip';
      chip.textContent = 'ASR: off';
      // Insert now (best-effort), then move it into #topbarRight when it appears
      const initialHost = document.body;
      initialHost.insertBefore(chip, initialHost.firstChild);
      // Update on state changes
      const map = { idle: 'off', ready: 'ready', listening: 'listening', running: 'listening', error: 'error' };
      window.addEventListener('asr:state', (e) => {
        try { const st = e?.detail?.state; chip.textContent = 'ASR: ' + (map[st] || st || 'off'); } catch {}
      });
      // Move chip into top bar when available
      try {
        const mo = new MutationObserver(() => {
          const host = document.querySelector('#topbarRight');
          if (host && host.isConnected && chip.parentElement !== host) {
            try { host.insertBefore(chip, host.firstChild); } catch {}
          }
        });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
        // Attempt immediate placement too
        const hostNow = document.querySelector('#topbarRight');
        if (hostNow) { try { hostNow.insertBefore(chip, hostNow.firstChild); } catch {} }
      } catch {}
      return chip;
    } catch {}
    return null;
  };

  class WebSpeechEngine {
    constructor() {
      const SR = (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (!SR) throw new Error('Web Speech API not available');
      this.SR = SR; this.rec = null; this.listeners = new Set(); this.running = false;
    }
    on(fn) { try { this.listeners.add(fn); } catch {} }
    off(fn) { try { this.listeners.delete(fn); } catch {} }
    emit(ev) { try { this.listeners.forEach(fn => { try { fn(ev); } catch {} }); } catch {} }
    async start(opts) {
      if (this.running) return;
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
      try { mountAsrChip(); } catch {}
    }
    getState() { return this.state; }
    async start() {
      if (this.state !== 'idle') return;
      // If HUD bus exists (speech-loader routes there), subscribe instead of starting our own SR.
      const bus = (window.HUD && window.HUD.bus) || (window.__tpHud && window.__tpHud.bus) || null;
      this._bus = bus;
      this._busHandlers = [];
      if (bus && typeof bus.on === 'function') {
        const onPartial = (p) => { try { this.onEngineEvent({ type: 'partial', text: String(p?.text || ''), confidence: 0.5 }); } catch {} };
        const onFinal   = (p) => { try { this.onEngineEvent({ type: 'final',   text: String(p?.text || ''), confidence: 1.0 }); } catch {} };
        try { bus.on('speech:partial', onPartial); this._busHandlers.push(['speech:partial', onPartial]); } catch {}
        try { bus.on('speech:final',   onFinal);   this._busHandlers.push(['speech:final',   onFinal]);   } catch {}
        this.setState('listening');
        this.dispatch('asr:state', { state: 'listening' });
        // Announce that we piggybacked on Speech Sync
        try { (window.HUD?.log || console.debug)?.('asr', { mode: 'bus-follow' }); } catch {}
        return;
      }
      // Fallback: start our own Web Speech recognizer
      this.engine = new WebSpeechEngine();
      this.engine.on((e) => this.onEngineEvent(e));
      this.setState('ready');
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
    }
    onEngineEvent(e) {
      if (e.type === 'ready') this.setState('ready');
      if (e.type === 'listening') this.setState('listening');
      if (e.type === 'partial' || e.type === 'final') {
        if (this.state !== 'running') this.setState('running');
        const text = normalize(e.text);
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
  tryAdvance(hyp, isFinal, confidence) {
      const { lines, idx0 } = this.getWindow();
      let bestIdx = -1, bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        const score = coverageScore(lines[i], hyp) * (confidence || 1);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      const thr = Number(localStorage.getItem('tp_asr_threshold') || COVERAGE_THRESHOLD) || COVERAGE_THRESHOLD;
      if (bestIdx >= 0 && bestScore >= thr) {
        const newIdx = idx0 + bestIdx;
        if (newIdx >= this.currentIdx) {
          this.currentIdx = newIdx; this.scrollToLine(newIdx); this.dispatch('asr:advance', { index: newIdx, score: bestScore });
          try { (window.HUD?.log || console.debug)?.('asr:advance', { index: newIdx, score: Number(bestScore).toFixed(2) }); } catch {}
        }
      } else if (isFinal) {
        this.rescueCount++;
        if (this.rescueCount <= 2) {
          this.currentIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
          this.scrollToLine(this.currentIdx);
          this.dispatch('asr:rescue', { index: this.currentIdx, reason: 'weak-final' });
          try { (window.HUD?.log || console.debug)?.('asr:rescue', { index: this.currentIdx }); } catch {}
        }
      }
    }
    scrollToLine(idx) {
      const els = this.getAllLineEls();
      const target = els[idx]; if (!target) return;
      // Skip during pre-roll
      try {
        const ov = document.getElementById('countOverlay');
        if (ov) { const cs = getComputedStyle(ov); const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && !ov.classList.contains('hidden'); if (visible) return; }
      } catch {}
      const scroller = findScroller(target); const marker = this.opts.markerOffsetPx;
      const top = elementTopRelativeTo(target, scroller) - marker;
      requestAnimationFrame(() => {
        try {
          if (scroller === document.scrollingElement || scroller === document.body) window.scrollTo({ top, behavior: 'smooth' });
          else scroller.scrollTo({ top, behavior: 'smooth' });
        } catch {}
      });
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
  const wantASR = () => { try { return String(document.getElementById('scrollMode')?.value || '').toLowerCase() === 'asr'; } catch { return false; } };
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
      speechActive = !!on; if (speechActive && wantASR()) void start(); else void stop();
    } catch {}
  });
  document.addEventListener('change', (ev) => { try { if (ev?.target?.id !== 'scrollMode') return; if (!speechActive) return; wantASR() ? void start() : void stop(); } catch {} });
  window.addEventListener('asr:toggle', (e) => { const armed = !!(e?.detail?.armed); armed ? void start() : void stop(); });
  window.addEventListener('asr:stop', () => { void stop(); });

  // Late-load reconcile
  try {
    const body = document.body; speechActive = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening'))) || (window.speechOn === true);
    if (speechActive && wantASR()) void start();
  } catch {}
}

export default initAsrFeature;
