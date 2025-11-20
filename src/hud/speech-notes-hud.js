// Speech Notes HUD (ASR/Hybrid only)
// Shows in dev (?dev=1 or __TP_DEV) or if localStorage 'tp_hud_prod' === '1'.
// Captures tp:speech:transcript + legacy HUD bus, but only when:
//  - Mode is 'asr' or 'hybrid'
//  - Mic/capture is active
//  - NOT in Rehearsal
(function(){
  'use strict';

  function isDev() {
    try {
      if ((window).__TP_DEV) return true;
      const sp = new URLSearchParams(location.search);
      if (sp.get('dev') === '1') return true;
      if (/#dev\b/i.test(location.hash)) return true;
    } catch {}
    return false;
  }

  const prodOptIn = (() => { try { return localStorage.getItem('tp_hud_prod') === '1'; } catch { return false; } })();
  if (!isDev() && !prodOptIn) return;

  if (document.getElementById('tp-speech-notes-hud')) return;

  const LS_KEY = 'tp_hud_speech_notes_v1';

  // Opt-in persistence (default: memory only)
  function savingEnabled() {
    try { return localStorage.getItem('tp_hud_save') === '1'; } catch { return false; }
  }

  // Simple PII redaction before store/export (tunable)
  function redactPII(s) {
    if (!s) return s;
    return String(s)
      // emails
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
      // phone (US-ish)
      .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, '[PHONE]')
      // SSN
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      // credit card (very rough)
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD]');
  }

  // --- Helpers
  function inRehearsal() {
    try { return !!document.body.classList.contains('mode-rehearsal'); } catch { return false; }
  }
  function currentMode() {
    try {
      const store = window.__tpStore;
      if (store && typeof store.get === 'function') {
        const scrollMode = store.get('scrollMode');
        if (scrollMode != null) return String(scrollMode).toLowerCase();
        const legacyMode = store.get('mode');
        if (legacyMode != null) return String(legacyMode).toLowerCase();
      }
      const router = window.__tpScrollMode;
      if (router && typeof router.getMode === 'function') {
        const mode = router.getMode();
        if (mode != null) return String(mode).toLowerCase();
      }
      if (typeof router === 'string') return router.toLowerCase();
    } catch {}
    return '';
  }
  function micActive() {
    try { return !!window.__tpMic?.isOpen?.(); } catch {}
    try { return !!window.__tpStore?.get?.('micEnabled'); } catch {}
    return false;
  }

  let captureOn = false; // set by speech:toggle or tp:speech-state
  function canCapture() {
    if (inRehearsal()) return false;
    if (!captureOn) return false;
    const m = currentMode();
    if (m !== 'asr' && m !== 'hybrid') return false;
    return true;
  }
  function captureGateReason() {
    if (inRehearsal()) return 'rehearsal-mode';
    if (!captureOn) return 'speech-idle';
    const m = currentMode();
    if (m !== 'asr' && m !== 'hybrid') return `mode-${m || 'unknown'}`;
    return 'ok';
  }

  // --- Mount UI
  const root = document.createElement('div');
  root.id = 'tp-speech-notes-hud';
  root.style.cssText = [
    'position:fixed','right:12px','bottom:12px','z-index:2147482000',
    'background:rgba(16,16,24,.92)','color:#fff','border-radius:10px',
    'border:1px solid rgba(255,255,255,.12)','max-width:520px','width:min(90vw,520px)',
    'max-height:50vh','display:flex','flex-direction:column','overflow:hidden',
    'font:12px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif','box-shadow:0 10px 30px rgba(0,0,0,.4)'
  ].join(';');
  root.innerHTML = `
    <div style="display:flex;gap:.5rem;align-items:center;padding:.5rem .75rem;background:rgba(0,0,0,.25);border-bottom:1px solid rgba(255,255,255,.08)">
      <strong>Speech · Notes</strong>
      <span id="snStatus" style="opacity:.8;margin-left:auto">idle</span>
      <label style="display:flex;align-items:center;gap:.35rem;margin-left:12px;opacity:.9;user-select:none">
        <input id="snFinalsOnly" type="checkbox"> finals-only
      </label>
      <button id="snCopy" style="all:unset;cursor:pointer;opacity:.85;margin-left:10px">Copy</button>
      <button id="snExport" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">Export</button>
      <button id="snClear" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">Clear</button>
      <button id="snClose" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">×</button>
    </div>
    <div id="snList" style="overflow:auto;padding:.5rem .75rem;display:grid;gap:.4rem;background:rgba(0,0,0,.15)"></div>
  `;
  document.body.appendChild(root);

  const $ = (id)=>document.getElementById(id);
  const listEl = $('snList'), finalsChk = $('snFinalsOnly'), statusEl = $('snStatus');

  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { notes = []; }
  // If saving is disabled, start fresh in RAM only
  if (!savingEnabled()) notes = [];
  function save(){ if (!savingEnabled()) return; try { localStorage.setItem(LS_KEY, JSON.stringify(notes)); } catch {} }

  function render(){
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const n of notes) {
      if (finalsOnly && !n.final) continue;
      const row = document.createElement('div');
      row.style.cssText = 'white-space:pre-wrap;background:#0b0d18;border:1px solid #2b2f3a;border-radius:8px;padding:6px 8px;opacity:' + (n.final ? '1' : '.9');
      const ts = new Date(n.ts || Date.now()).toLocaleTimeString();
      const sim = (typeof n.sim === 'number') ? `  [~${n.sim.toFixed(2)}]` : '';
      row.textContent = `${ts}${n.final?' (final)':''}${sim} — ${n.text}`;
      frag.appendChild(row);
    }
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function addNote(payload){
    let text = String(payload?.text || '').trim();
    if (!text) return;
    text = redactPII(text);
    const item = { text, final: !!payload.final, ts: Date.now(), sim: payload.sim };
    const last = notes[notes.length - 1];
    if (last && last.final && item.final && last.text === item.text) return; // de-dupe consecutive finals
    notes.push(item);
    if (notes.length > 500) notes.shift();
    save();
    render();
  }

  function clear(){ notes = []; save(); render(); }
  function buildExportBody(finalsOnly){
    return notes
      .filter(n => finalsOnly ? n.final : true)
      .map(n => `${new Date(n.ts).toISOString()}\t${n.final?'final':'interim'}\t${(n.sim??'')}\t${redactPII(n.text)}`)
      .join('\n');
  }
  function copyAll() {
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    const body = buildExportBody(finalsOnly);
    try { navigator.clipboard.writeText(body); } catch {}
  }
  function exportTxt(){
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    const body = buildExportBody(finalsOnly);
    const blob = new Blob([body], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `speech-notes_${Date.now()}.txt`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 0);
  }

  // controls
  $('snClear').onclick = clear;
  $('snCopy').onclick = copyAll;
  $('snExport').onclick = exportTxt;
  $('snClose').onclick = () => root.remove();
  if (finalsChk) finalsChk.onchange = render;

  // state sync for captureOn + status
  function updateStatus(){
    const m = currentMode();
    const on = canCapture();
    const persist = savingEnabled() ? ' · save=ON' : ' · save=OFF';
    statusEl.textContent = on ? `listening (${m})${persist}` : `idle${persist}`;
  }

  window.addEventListener('tp:speech-state', (e)=>{
    captureOn = !!(e && e.detail && e.detail.running);
    updateStatus();
  }, true);

  try {
    window.HUD?.bus?.on?.('speech:toggle', (on)=>{
      captureOn = !!on;
      updateStatus();
    });
  } catch {}

  window.addEventListener('tp:scroll:mode', updateStatus, true);

  // capture events (gated)
  window.addEventListener('tp:speech:transcript', (e) => {
    const detail = e?.detail || {};
    try { console.debug('[speech-notes] onTranscript', { text: detail.text, final: !!detail.final }); } catch {}
    if (canCapture()) {
      addNote(detail);
    } else {
      const reason = captureGateReason();
      try { console.warn('[speech-notes] blocked', { reason, text: detail.text || '', final: !!detail.final }); } catch {}
      try {
        window.HUD?.log?.('speech-notes:gate', { reason, text: detail.text || '', final: !!detail.final });
      } catch {}
    }
  }, true);
  try {
    window.HUD?.bus?.on?.('speech:partial', (p)=>{ if (canCapture()) addNote(p); });
    window.HUD?.bus?.on?.('speech:final',   (p)=>{ if (canCapture()) addNote(p); });
  } catch {}

  render();

  // Debug helpers for dev console (inspect capture state / force add notes)
  try {
    window.__tpSpeechNotesHud = {
      canCapture,
      captureGateReason,
      dumpState: () => ({
        captureOn,
        mode: currentMode(),
        micActive: micActive(),
        rehearsal: inRehearsal(),
        saving: savingEnabled(),
        statusText: statusEl?.textContent || ''
      }),
      addNote: (text, final = false) => addNote({ text, final }),
    };
  } catch {}
})();
