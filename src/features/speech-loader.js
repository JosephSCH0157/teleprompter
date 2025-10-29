// One entry point for speech. Uses Web Speech by default.
// If /speech/orchestrator.js exists (built from TS), we load it instead.

let running = false;
let rec = null; // SR instance or orchestrator handle

function inRehearsal() {
  try { return !!document.body?.classList?.contains('mode-rehearsal'); } catch { return false; }
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
function setListeningUi(on) {
  try {
    const btn = document.getElementById('recBtn');
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) btn.textContent = on ? 'Stop speech sync' : 'Start speech sync';
    if (chip) chip.textContent = on ? 'Speech: listening…' : 'Speech: stopped';
    try {
      document.body.classList.toggle('speech-listening', !!on);
      // Maintain legacy class for existing CSS rules
      document.body.classList.toggle('listening', !!on);
    } catch {}
  } catch {}
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
      const force = (() => { try { return localStorage.getItem('tp_speech_force') === '1'; } catch {} return false; })();

      let hasOrchestrator = hasGlobalOrch;
      if (!hasOrchestrator) {
        // Best-effort existence probe without loading it
        try {
          const res = await fetch('/speech/orchestrator.js', { method: 'HEAD', cache: 'no-store' });
          hasOrchestrator = !!res && res.ok;
        } catch {}
      }

      const supported = SRAvail || hasOrchestrator;
      const canUse = supported || force;

      if (canUse) setReadyUi(); else setUnsupportedUi();
    } catch {}
  })();

  // delegated wiring keeps working even if the button re-renders
  document.addEventListener('click', async (e) => {
    const t = e && e.target;
    try { if (!t?.closest?.('#recBtn')) return; } catch { return; }
    const btn = document.getElementById('recBtn');

  const S = window.__tpStore;
  const HUD = window.HUD || window.__tpHud;

    async function doAutoRecordStart() {
      try {
        const auto = S?.get?.('autoRecord');
        const obsEnabled = S?.get?.('obsEnabled');
        if (auto && obsEnabled) {
          const mod = await import('/recorders.js');
          await mod.startSelected();
        }
      } catch {}
    }
    async function doAutoRecordStop() {
      try {
        const mod = await import('/recorders.js');
        await mod.stopSelected();
      } catch {}
    }

    async function startBackend() {
      if (window.__tpSpeechOrchestrator?.start) {
        rec = await window.__tpSpeechOrchestrator.start();
        // Orchestrator bridge: subscribe to events if available
        try {
          if (rec && typeof rec.on === 'function') {
            try { rec.on('final', (t) => routeTranscript(String(t || ''), true)); } catch {}
            try { rec.on('partial', (t) => routeTranscript(String(t || ''), false)); } catch {}
          }
        } catch {}
        try { window.__tpEmitSpeech = (t, final) => routeTranscript(String(t || ''), !!final); } catch {}
        return;
      }
      try {
        const mod = await import('/speech/orchestrator.js');
        if (mod?.startOrchestrator) {
          rec = await mod.startOrchestrator();
          // Orchestrator bridge: subscribe to events if available
          try {
            if (rec && typeof rec.on === 'function') {
              try { rec.on('final', (t) => routeTranscript(String(t || ''), true)); } catch {}
              try { rec.on('partial', (t) => routeTranscript(String(t || ''), false)); } catch {}
            }
          } catch {}
          try { window.__tpEmitSpeech = (t, final) => routeTranscript(String(t || ''), !!final); } catch {}
          return;
        }
      } catch {}
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
            const r = e.results[i];
            if (r.isFinal) finals += (r[0]?.transcript || '') + ' ';
            else interim += (r[0]?.transcript || '') + ' ';
          }
          if (finals) routeTranscript(finals, true);
          const now = performance.now();
          if (interim && now - _lastInterimAt > 150) {
            _lastInterimAt = now;
            routeTranscript(interim, false);
          }
        } catch {}
      };
      sr.onerror = (e) => { try { (HUD?.log || console.warn)?.('speech', { error: e?.error || String(e) }); } catch {} };
      sr.onend = () => { if (running) stopSpeech(); };
      try { sr.start(); } catch {}
      rec = sr;
    }

    // --- Pre-roll helpers (main + display) ---
    function sendToDisplay(payload) {
      try {
        if (window.__tpDisplay && typeof window.__tpDisplay.sendToDisplay === 'function') {
          window.__tpDisplay.sendToDisplay(payload);
          return;
        }
      } catch {}
      try {
        const w = window.__tpDisplayWindow;
        if (w && !w.closed) w.postMessage(payload, '*');
      } catch {}
    }

    function showPreroll(v) {
      try {
        const overlay = document.getElementById('countOverlay');
        const num = document.getElementById('countNum');
        if (overlay) overlay.style.display = 'flex';
        if (num && typeof v === 'number') num.textContent = String(v);
      } catch {}
      try { sendToDisplay({ type: 'preroll', show: true, n: v }); } catch {}
    }
    function hidePreroll() {
      try {
        const overlay = document.getElementById('countOverlay');
        if (overlay) overlay.style.display = 'none';
      } catch {}
      try { sendToDisplay({ type: 'preroll', show: false }); } catch {}
    }

    async function beginCountdownThen(sec, fn) {
      const n0 = Math.max(0, Number(sec) || 0);
      if (!n0) { hidePreroll(); await fn(); return; }
      let n = n0;
      let armed = false;
      const tick = async () => {
        showPreroll(n);
        if (!armed) { armed = true; await doAutoRecordStart(); }
        if (n <= 0) {
          hidePreroll();
          await fn();
        } else {
          setTimeout(() => { n -= 1; void tick(); }, 1000);
        }
      };
      // Show immediately, then start ticking down
      n = n0; void tick();
    }

    async function startSpeech() {
      if (running) return;
      if (btn && btn.disabled) return;
      if (btn) btn.disabled = true; // debounce
      try {
        running = true;
        // Flip UI + legacy speech gate immediately
        try { document.body.classList.add('listening'); } catch {}
        try { window.HUD?.bus?.emit('speech:toggle', true); } catch {}
        try { window.speechOn = true; } catch {}
        setListeningUi(true);
        try { (HUD?.log || console.debug)?.('speech', { state: 'start' }); } catch {}
        const sec = (S && S.get) ? Number(S.get('prerollSeconds') || 0) : 0;
        await beginCountdownThen(sec, async () => {
          await startBackend();
          // If auto-record isn't enabled, no-op; if enabled and already armed, ensure it's running
          try { await doAutoRecordStart(); } catch {}
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
      if (!running) return;
      if (btn && btn.disabled) return;
      if (btn) btn.disabled = true; // debounce
      try {
        running = false;
        setListeningUi(false);
        try { rec?.stop?.(); } catch {}
        rec = null;
        hidePreroll();
        await doAutoRecordStop();
        setReadyUi();
        // Flip UI + legacy speech gate off
        try { document.body.classList.remove('listening'); } catch {}
        try { window.HUD?.bus?.emit('speech:toggle', false); } catch {}
        try { window.speechOn = false; } catch {}
        try { (HUD?.log || console.debug)?.('speech', { state: 'stop' }); } catch {}
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    if (!running) await startSpeech(); else await stopSpeech();
  }, { capture: true });
}
