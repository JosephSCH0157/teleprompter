// One entry point for speech. Uses Web Speech by default.
// If /speech/orchestrator.js exists (built from TS), we load it instead.

let running = false;
let recog = null;

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
  // Enable/disable the button based on browser support (mirrors legacy behavior)
  try {
    const btn = document.getElementById('recBtn');
    const SRAvail = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (btn) {
      if (!SRAvail) {
        btn.disabled = true;
        btn.title = 'Speech recognition not supported in this browser';
        const chip = document.getElementById('recChip');
        if (chip) chip.textContent = 'Speech: unsupported';
      } else {
        btn.disabled = false;
        try { btn.removeAttribute('title'); } catch {}
        btn.title = 'Start speech sync';
      }
    }
  } catch {}

  // delegated wiring keeps working even if the button re-renders
  document.addEventListener('click', async (e) => {
    const t = e && e.target;
    try { if (!t?.closest?.('#recBtn')) return; } catch { return; }

    if (!running) {
      running = true; setRecUi(true);

      // Choose compiled TS orchestrator if present, else Web Speech
      let api = await tryLoadBuiltTs();
      if (api && typeof api.startOrchestrator === 'function') {
        try { recog = await api.startOrchestrator(); } catch { recog = null; }
      } else {
        recog = startWebSpeech();
      }

      // If OBS is enabled, kick off recording (best-effort)
      try {
        const S = window.__tpStore;
        if (S && S.get && S.get('obsEnabled')) {
          const obs = window.__tpOBS;
          const conn = window.__tpObsConn;
          if (obs && typeof obs.startRecording === 'function' && conn) {
            obs.startRecording(conn);
          }
        }
      } catch {}
    } else {
      running = false; setRecUi(false);
      try { recog?.stop?.(); } catch {}
      recog = null;

      // If OBS is enabled, stop recording (best-effort)
      try {
        const S = window.__tpStore;
        if (S && S.get && S.get('obsEnabled')) {
          const obs = window.__tpOBS;
          const conn = window.__tpObsConn;
          if (obs && typeof obs.stopRecording === 'function' && conn) {
            obs.stopRecording(conn);
          }
        }
      } catch {}
    }
  }, { capture: true });
}
