// One entry point for speech. Uses Web Speech by default.
// If /speech/orchestrator.js exists (built from TS), we load it instead.

let running = false;
let rec = null; // SR instance or orchestrator handle

async function tryLoadBuiltTs() {
  // Absolute path so it’s not relative to module location.
  try {
    // Quick existence check (avoids noisy import errors)
    const res = await fetch('/speech/orchestrator.js', { method: 'HEAD' });
    if (!res.ok) return null;
    // Load the compiled/bundled TS orchestrator (ESM)
    const mod = await import('/speech/orchestrator.js');
    return mod && (mod.startOrchestrator || mod.default?.startOrchestrator) ? (mod.startOrchestrator || mod.default) : null;
  } catch { return null; }
}

// Minimal Web Speech fallback
function startWebSpeech() {
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

function setRecUi(on) {
  try {
    const btn = document.getElementById('recBtn');
    const chip = document.getElementById('recChip');
    if (btn) btn.textContent = on ? 'Stop speech sync' : 'Start speech sync';
    if (chip) chip.textContent = on ? 'Speech: On' : 'Speech: Off';
  } catch {}
}

export function installSpeech() {
  // Enable/disable the button based on browser support or orchestrator presence.
  // Honor a dev force-enable escape hatch via localStorage.tp_speech_force === '1'.
  (async () => {
    try {
      const btn = document.getElementById('recBtn');
      if (!btn) return;
      const chip = document.getElementById('speechStatus') || document.getElementById('recChip');

      const SRAvail = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      const hasGlobalOrch = !!(window.__tpSpeechOrchestrator);
      const force = (() => { try { return localStorage.getItem('tp_speech_force') === '1'; } catch {} return false; })();

      let hasOrchestrator = hasGlobalOrch;
      if (!hasOrchestrator) {
        // Best-effort existence probe without loading it
        try {
          const res = await fetch('/speech/orchestrator.js', { method: 'HEAD' });
          hasOrchestrator = !!res && res.ok;
        } catch {}
      }

      const supported = SRAvail || hasOrchestrator;
      const canUse = supported || force;

      if (canUse) {
        btn.disabled = false;
        btn.title = 'Start speech sync';
        if (chip) chip.textContent = 'Speech: ready';
      } else {
        btn.disabled = true;
        btn.title = 'Speech not supported in this browser';
        if (chip) chip.textContent = 'Speech: unsupported';
      }
    } catch {}
  })();

  // delegated wiring keeps working even if the button re-renders
  document.addEventListener('click', async (e) => {
    const t = e && e.target;
    try { if (!t?.closest?.('#recBtn')) return; } catch { return; }

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

    async function startSpeech() {
      if (running) return;
      running = true;
      setRecUi(true);
      try { (HUD?.log || console.debug)?.('speech', { state: 'start' }); } catch {}

      try {
        if (window.__tpSpeechOrchestrator && typeof window.__tpSpeechOrchestrator.start === 'function') {
          rec = await window.__tpSpeechOrchestrator.start();
        } else {
          const api = await tryLoadBuiltTs();
          if (api && typeof api.startOrchestrator === 'function') {
            rec = await api.startOrchestrator();
          } else {
            // Web Speech fallback
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SR) {
              const r = new SR();
              r.interimResults = true;
              r.continuous = true;
              r.onresult = (e) => { try { (HUD?.log || console.debug)?.('speech', { onresult: true, len: e?.results?.length || 0 }); } catch {} };
              r.onerror = (e) => { try { (HUD?.log || console.warn)?.('speech', { error: e?.error || String(e) }); } catch {} };
              r.onend = () => { if (running) stopSpeech(); };
              try { r.start(); } catch {}
              rec = { stop: () => { try { r.stop(); } catch {} } };
            } else {
              rec = startWebSpeech();
            }
          }
        }
      } catch {}

      await doAutoRecordStart();
    }

    async function stopSpeech() {
      if (!running) return;
      running = false;
      setRecUi(false);
      try { (HUD?.log || console.debug)?.('speech', { state: 'stop' }); } catch {}
      try { rec?.stop?.(); } catch {}
      rec = null;
      await doAutoRecordStop();
    }

    if (!running) await startSpeech(); else await stopSpeech();
  }, { capture: true });
}
