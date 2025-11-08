// One entry point for speech. Uses Web Speech by default.
// If /speech/orchestrator.js exists (built from TS), we load it instead.
// Autoscroll is managed externally; buffered stop handled in index listener

let running = false;
let rec = null; // SR instance or orchestrator handle

function inRehearsal() {
  try { return !!document.body?.classList?.contains('mode-rehearsal'); } catch { return false; }
}

// Scroll/mic state helpers for gating transcript capture
function getScrollMode() {
  try { return (window.__tpStore?.get?.('mode') ?? window.__tpScrollMode ?? '').toString().toLowerCase(); } catch { return ''; }
}
function micActive() {
  try { return !!window.__tpMic?.isOpen?.(); } catch {}
  try { return !!window.__tpStore?.get?.('micEnabled'); } catch {}
  return false;
}
function shouldEmitTranscript() {
  if (inRehearsal()) return false;
  const mode = getScrollMode();
  if (mode !== 'asr' && mode !== 'hybrid') return false;
  return micActive();
}

// Small router to bridge transcripts to both legacy and modern paths
function routeTranscript(text, isFinal) {
  try {
    if (!text) return;
    // In rehearsal, never steer — emit to HUD only
    if (inRehearsal()) {
      try {
        const payload = { text, final: !!isFinal, t: performance.now() };
        window.HUD?.bus?.emit(isFinal ? 'speech:final' : 'speech:partial', payload);
      } catch {}
      return;
    }
    // Legacy monolith path
    if (typeof window.advanceByTranscript === 'function') {
      try { window.advanceByTranscript(text, !!isFinal); } catch {}
    }
    // Modern/event-bus path (HUD bus if present)
    
    try {
      const payload = { text, final: !!isFinal, t: performance.now() };
      window.HUD?.bus?.emit(isFinal ? 'speech:final' : 'speech:partial', payload);
      if (shouldEmitTranscript()) {
        window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail: payload }));
      }
    } catch {}

  } catch {}
}

// (dynamic import of '/speech/orchestrator.js' is performed inline where needed)

// Minimal Web Speech fallback
function _startWebSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    try { console.warn('[speech] Web Speech not available'); } catch {}
    return { stop: () => {} };
  }
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  r.onresult = (_e) => {
    // TODO: hook into your scroll matcher if desired
    // const last = e.results[e.results.length-1]?.[0]?.transcript;
    // console.log('[speech] text:', last);
  };
  r.onerror = (e) => { try { console.warn('[speech] error', e); } catch {} };
  try { r.start(); } catch {}
  return { stop: () => { try { r.stop(); } catch {} } };
}

function setReadyUi() {
  try {
    const btn = document.getElementById('recBtn');
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      btn.disabled = false;
      btn.title = 'Start speech sync';
      try { btn.textContent = 'Start speech sync'; } catch {}
    }
    if (chip) chip.textContent = 'Speech: ready';
    try { document.body.classList.add('speech-ready'); } catch {}
  } catch {}
}

function setUnsupportedUi() {
  try {
    const btn = document.getElementById('recBtn');
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      btn.disabled = true;
      btn.title = 'Speech not supported in this browser';
    }
    if (chip) chip.textContent = 'Speech: unsupported';
    try { document.body.classList.remove('speech-ready', 'speech-listening', 'listening'); } catch {}
  } catch {}
}

// Update UI when speech is actively listening or stopped
function setListeningUi(listening) {
  try {
    const btn = document.getElementById('recBtn');
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      // Keep the button enabled/disabled state managed by callers; update labels
      btn.title = listening ? 'Stop speech sync' : 'Start speech sync';
      try { btn.textContent = listening ? 'Stop speech sync' : 'Start speech sync'; } catch {}
    }
    if (chip) chip.textContent = listening ? 'Speech: listening' : 'Speech: ready';
    try {
      if (listening) {
        document.body.classList.add('listening');
      } else {
        document.body.classList.remove('listening');
      }
    } catch {}
  } catch {}
}

// … (keep your existing helper functions unchanged above installSpeech)

// Provide safe no-op wrappers for auto-record start/stop so callers can invoke them
// without risking a ReferenceError if the feature is not present.
async function doAutoRecordStart() {
  try {
    if (window.__tpAutoRecord && typeof window.__tpAutoRecord.start === 'function') {
      return await window.__tpAutoRecord.start();
    }
  } catch {}
  // graceful no-op fallback
  return;
}

async function doAutoRecordStop() {
  try {
    if (window.__tpAutoRecord && typeof window.__tpAutoRecord.stop === 'function') {
      return await window.__tpAutoRecord.stop();
    }
  } catch {}
  // graceful no-op fallback
  return;
}

function beginCountdownThen(sec, cb) {
  // Run a simple seconds countdown (emit optional HUD events) then call the callback.
  // Resolves even if the callback throws; non-blocking and tolerant to environment failures.
  return new Promise((resolve) => {
    (async () => {
      try {
        const s = Number(sec) || 0;
        if (s <= 0) {
          try { await cb(); } catch {}
          return;
        }
        for (let i = s; i > 0; i--) {
          try { window.HUD?.bus?.emit('speech:countdown', { remaining: i }); } catch {}
          await new Promise(r => setTimeout(r, 1000));
        }
        try { await cb(); } catch {}
      } catch {}
    })().then(() => resolve()).catch(() => resolve());
  });
}

export function installSpeech() {
  // Enable/disable the button based on browser support or orchestrator presence.
  // Honor a dev force-enable escape hatch via localStorage.tp_speech_force === '1'.
  (async () => {
    try {
      const btn = document.getElementById('recBtn');
      if (!btn) return;

      const SRAvail = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      const hasGlobalOrch = !!(window.__tpSpeechOrchestrator);
      const force = ((() => { try { return localStorage.getItem('tp_speech_force') === '1'; } catch {} return false; })());
      const ciGuard = (() => {
        try {
          const ls = localStorage.getItem('tp_ci');
          if (ls === '1') return true;
        } catch {}
        try {
          const sp = new URLSearchParams(location.search);
          if (sp.get('ci') === '1') return true;
        } catch {}
        return false;
      })();

      // Optional probe: only if explicitly opted-in; default avoids 404 noise in dev
      const probeOptIn = (() => { try { return localStorage.getItem('tp_probe_speech') === '1' || new URLSearchParams(location.search).get('probe') === '1'; } catch { return false; } })();
      let hasOrchestrator = hasGlobalOrch;
      if (!hasOrchestrator && !ciGuard && probeOptIn) {
        try {
          const res = await fetch('/speech/orchestrator.js', { method: 'HEAD', cache: 'no-store' });
          hasOrchestrator = !!(res && res.ok);
        } catch {}
      }

      const supported = SRAvail || hasOrchestrator;
      const canUse = supported || force;

      if (canUse) setReadyUi(); else setUnsupportedUi();
      // Stash a flag for start path to decide whether to attempt dynamic import (no probe by default)
      try { window.__tpSpeechCanDynImport = !!hasOrchestrator && !ciGuard; } catch {}

      async function startBackend() {
        // Prefer orchestrator if available
        try {
          if (window.__tpSpeechOrchestrator?.start) {
            rec = await window.__tpSpeechOrchestrator.start();
            if (rec && typeof rec.on === 'function') {
              try { rec.on('final', (t) => routeTranscript(String(t || ''), true)); } catch {}
              try { rec.on('partial', (t) => routeTranscript(String(t || ''), false)); } catch {}
            }
            try { window.__tpEmitSpeech = (t, final) => routeTranscript(String(t || ''), !!final); } catch {}
            return;
          }
        } catch {}
        // Dynamic import if supported
        try {
          if (window.__tpSpeechCanDynImport) {
            const mod = await import('/speech/orchestrator.js');
            if (mod?.startOrchestrator) {
              rec = await mod.startOrchestrator();
              try {
                if (rec && typeof rec.on === 'function') {
                  try { rec.on('final', (t) => routeTranscript(String(t || ''), true)); } catch {}
                  try { rec.on('partial', (t) => routeTranscript(String(t || ''), false)); } catch {}
                }
              } catch {}
              try { window.__tpEmitSpeech = (t, final) => routeTranscript(String(t || ''), !!final); } catch {}
              return;
            }
          }
        } catch {}
        // Web Speech fallback
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) throw new Error('NoSpeechBackend');
        const sr = new SR();
        sr.interimResults = true;
        sr.continuous = true;
        // Web Speech → route finals and throttled partials
        let _lastInterimAt = 0;
        sr.onresult = (e) => {
          try {
            let interim = '', finals = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const res = e.results[i];
              if (res.isFinal) finals += res[0].transcript;
              else interim += res[0].transcript;
            }
            if (finals) routeTranscript(finals, true);
            const now = performance.now();
            if (interim && (now - _lastInterimAt) > 120) {
              _lastInterimAt = now;
              routeTranscript(interim, false);
            }
          } catch {}
        };
        sr.onerror = (e) => { try { console.warn('[speech] error', e); } catch {} };
        try { sr.start(); } catch {}
        rec = { stop: () => { try { sr.stop(); } catch {} } };
        try { window.__tpEmitSpeech = (t, final) => routeTranscript(String(t || ''), !!final); } catch {}
      }

      async function startSpeech() {
        if (btn) btn.disabled = true;
        try {
          running = true;
          // Flip UI + legacy speech gate immediately
          try { document.body.classList.add('listening'); } catch {}
          try { window.HUD?.bus?.emit('speech:toggle', true); } catch {}
          try { window.speechOn = true; } catch {}
          setListeningUi(true);
          try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } })); } catch {}
          // Ensure Hybrid router intent flips ON when speech starts
          try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: true } })); } catch {}
          try { (HUD?.log || console.debug)?.('speech', { state: 'start' }); } catch {}
          const S = window.__tpStore;
          const sec = (S && S.get) ? Number(S.get('prerollSeconds') || 0) : 0;
          await beginCountdownThen(sec, async () => {
            await startBackend();
            // If auto-record isn't enabled, no-op; if enabled and already armed, ensure it's running
            try { await doAutoRecordStart(); } catch {}
            // Ensure mic stream is granted so Hybrid gates (dB/VAD) can open
            try { await window.__tpMic?.requestMic?.(); } catch {}
          });
        } catch (e) {
          running = false;
          setListeningUi(false);
          setReadyUi();
          try { (HUD?.log || console.warn)?.('speech', { startError: String(e?.message || e) }); } catch {}
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      async function stopSpeech() {
        if (btn) btn.disabled = true;
        try {
          try { rec?.stop?.(); } catch {}
          running = false;
          try { document.body.classList.remove('listening'); } catch {}
          try { window.HUD?.bus?.emit('speech:toggle', false); } catch {}
          try { window.speechOn = false; } catch {}
          setListeningUi(false);
          setReadyUi();
          // If auto-record is on, stop it
          try { await doAutoRecordStop(); } catch {}
          // Ensure display window knows to stop auto modes
          try {
            const sendToDisplay = window.__tpSendToDisplay || (()=>{});
            sendToDisplay({ type: 'auto', op: 'stop' });
          } catch {}
          try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false } })); } catch {}
          // Optionally flip user intent OFF when speech stops
          try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: false } })); } catch {}
          try { (HUD?.log || console.debug)?.('speech', { state: 'stop' }); } catch {}
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      btn.addEventListener('click', async () => {
        if (!running) await startSpeech(); else await stopSpeech();
      }, { capture: true });
    } catch {}
  })();
}
