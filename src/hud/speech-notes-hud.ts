// Speech Notes HUD (ASR/Hybrid only)
// Ports legacy HUD to a typed, single-owner initializer.

import type { AppStore } from '../state/app-store';

export type HudBus = ((event: string, payload?: unknown) => void) & {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
  emit?(event: string, payload?: unknown): void;
  log?(event: string, payload?: unknown): void;
};

export interface SpeechNotesHudOptions {
  root?: HTMLElement | null;
  bus?: HudBus | null;
  store?: AppStore | null;
}

export interface SpeechNotesHudApi {
  show(): void;
  hide(): void;
  toggle(): void;
  destroy(): void;
}

type Note = { text: string; final: boolean; ts: number; sim?: number };

const HUD_ID = 'tp-speech-notes-hud';
const LS_KEY = 'tp_hud_speech_notes_v1';

function isDevSession(): boolean {
  try {
    if ((window as any).__TP_DEV) return true;
    const sp = new URLSearchParams(location.search);
    if (sp.get('dev') === '1') return true;
    if (/#dev\b/i.test(location.hash)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function savingEnabled(): boolean {
  try {
    return localStorage.getItem('tp_hud_save') === '1';
  } catch {
    return false;
  }
}

function prodHudOptIn(): boolean {
  try {
    return localStorage.getItem('tp_hud_prod') === '1';
  } catch {
    return false;
  }
}

function redactPII(s: string): string {
  if (!s) return s;
  return String(s)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD]');
}

function inRehearsal(): boolean {
  try {
    return !!document.body.classList.contains('mode-rehearsal');
  } catch {
    return false;
  }
}

function currentMode(store?: AppStore | null): string {
  try {
    const s = store || ((window as any).__tpStore as AppStore | null);
    if (s && typeof s.get === 'function') {
      const scrollMode = s.get('scrollMode');
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = s.get('mode' as any);
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }
    const router = (window as any).__tpScrollMode;
    if (router && typeof router.getMode === 'function') {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }
    if (typeof router === 'string') return router.toLowerCase();
  } catch {
    /* ignore */
  }
  return '';
}

function micActive(store?: AppStore | null): boolean {
  try {
    return !!(window as any).__tpMic?.isOpen?.();
  } catch {
    /* ignore */
  }
  try {
    return !!(store || (window as any).__tpStore)?.get?.('micEnabled');
  } catch {
    /* ignore */
  }
  return false;
}

export function initSpeechNotesHud(options: SpeechNotesHudOptions = {}): SpeechNotesHudApi | null {
  const { bus = null, store = null } = options;

  // gating: dev or explicit opt-in
  if (!isDevSession() && !prodHudOptIn()) return null;
  if (document.getElementById(HUD_ID)) return null;

  const root = options.root || document.body;
  if (!root) return null;

  // --- Mount UI ---
  const panel = document.createElement('div');
  panel.id = HUD_ID;
  panel.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:2147482000',
    'background:rgba(16,16,24,.92)',
    'color:#fff',
    'border-radius:10px',
    'border:1px solid rgba(255,255,255,.12)',
    'max-width:520px',
    'width:min(90vw,520px)',
    'max-height:50vh',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    'font:12px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif',
    'box-shadow:0 10px 30px rgba(0,0,0,.4)',
  ].join(';');
  panel.innerHTML = `
    <div style="display:flex;gap:.5rem;align-items:center;padding:.5rem .75rem;background:rgba(0,0,0,.25);border-bottom:1px solid rgba(255,255,255,.08)">
      <strong>Speech A\u00bb Notes</strong>
      <span id="snStatus" style="opacity:.8;margin-left:auto">idle</span>
      <label style="display:flex;align-items:center;gap:.35rem;margin-left:12px;opacity:.9;user-select:none">
        <input id="snFinalsOnly" type="checkbox"> finals-only
      </label>
      <button id="snCopy" style="all:unset;cursor:pointer;opacity:.85;margin-left:10px">Copy</button>
      <button id="snExport" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">Export</button>
      <button id="snClear" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">Clear</button>
      <button id="snClose" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">A\u00d7</button>
    </div>
    <div id="snList" style="overflow:auto;padding:.5rem .75rem;display:grid;gap:.4rem;background:rgba(0,0,0,.15)"></div>
  `;
  root.appendChild(panel);

  const $ = (id: string) => document.getElementById(id);
  const listEl = $('snList') as HTMLElement | null;
  const finalsChk = $('snFinalsOnly') as HTMLInputElement | null;
  const statusEl = $('snStatus') as HTMLElement | null;

  let notes: Note[] = [];
  try {
    notes = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as Note[];
  } catch {
    notes = [];
  }
  if (!savingEnabled()) notes = [];

  const save = () => {
    if (!savingEnabled()) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(notes));
    } catch {
      /* ignore */
    }
  };

  const render = () => {
    if (!listEl) return;
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const n of notes) {
      if (finalsOnly && !n.final) continue;
      const row = document.createElement('div');
      row.style.cssText =
        'white-space:pre-wrap;background:#0b0d18;border:1px solid #2b2f3a;border-radius:8px;padding:6px 8px;opacity:' +
        (n.final ? '1' : '.9');
      const ts = new Date(n.ts || Date.now()).toLocaleTimeString();
      const sim = typeof n.sim === 'number' ? `  [~${n.sim.toFixed(2)}]` : '';
      row.textContent = `${ts}${n.final ? ' (final)' : ''}${sim} – ${n.text}`;
      frag.appendChild(row);
    }
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;
  };

  const addNote = (payload: { text?: string; final?: boolean; sim?: number }) => {
    let text = String(payload?.text || '').trim();
    if (!text) return;
    text = redactPII(text);
    const item: Note = { text, final: !!payload.final, ts: Date.now(), sim: payload.sim };
    const last = notes[notes.length - 1];
    if (last && last.final && item.final && last.text === item.text) return; // de-dupe consecutive finals
    notes.push(item);
    if (notes.length > 500) notes.shift();
    save();
    render();
  };

  const clear = () => {
    notes = [];
    save();
    render();
  };

  const buildExportBody = (finalsOnly: boolean): string =>
    notes
      .filter((n) => (finalsOnly ? n.final : true))
      .map((n) => `${new Date(n.ts).toISOString()}\t${n.final ? 'final' : 'interim'}\t${n.sim ?? ''}\t${redactPII(n.text)}`)
      .join('\n');

  const copyAll = () => {
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    const body = buildExportBody(finalsOnly);
    try {
      navigator.clipboard.writeText(body);
    } catch {
      /* ignore */
    }
  };

  const exportTxt = () => {
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    const body = buildExportBody(finalsOnly);
    const blob = new Blob([body], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `speech-notes_${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  };

  // --- Capture gating ---
  let captureOn = false; // set by speech:toggle or tp:speech-state
  const canCapture = () => {
    if (inRehearsal()) return false;
    if (!captureOn) return false;
    const m = currentMode(store);
    if (m !== 'asr' && m !== 'hybrid') return false;
    return true;
  };
  const captureGateReason = () => {
    if (inRehearsal()) return 'rehearsal-mode';
    if (!captureOn) return 'speech-idle';
    const m = currentMode(store);
    if (m !== 'asr' && m !== 'hybrid') return `mode-${m || 'unknown'}`;
    return 'ok';
  };

  const updateStatus = () => {
    if (!statusEl) return;
    const m = currentMode(store);
    const on = canCapture();
    const persist = savingEnabled() ? ' • save=ON' : ' • save=OFF';
    statusEl.textContent = on ? `listening (${m})${persist}` : `idle${persist}`;
  };

  // --- Controls ---
  const clearBtn = $('snClear');
  const copyBtn = $('snCopy');
  const exportBtn = $('snExport');
  const closeBtn = $('snClose');

  if (clearBtn) clearBtn.onclick = clear;
  if (copyBtn) copyBtn.onclick = copyAll;
  if (exportBtn) exportBtn.onclick = exportTxt;
  if (closeBtn) closeBtn.onclick = () => panel.remove();
  if (finalsChk) finalsChk.onchange = render;

  // --- Event wiring ---
  const onSpeechState = (e: Event) => {
    const detail = (e as CustomEvent<any>)?.detail || {};
    captureOn = !!detail.running;
    updateStatus();
  };

  const onTranscript = (e: Event) => {
    const detail = (e as CustomEvent<any>)?.detail || {};
    try {
      console.debug('[speech-notes] onTranscript', { text: detail.text, final: !!detail.final });
    } catch {
      /* ignore */
    }
    if (canCapture()) {
      addNote(detail);
    } else {
      const reason = captureGateReason();
      try {
        console.warn('[speech-notes] blocked', { reason, text: detail.text || '', final: !!detail.final });
      } catch {
        /* ignore */
      }
      try {
        bus?.log?.('speech-notes:gate', { reason, text: detail.text || '', final: !!detail.final });
      } catch {
        /* ignore */
      }
    }
  };

  const onPartial = (p: any) => {
    if (canCapture()) addNote(p);
  };
  const onFinal = (p: any) => {
    if (canCapture()) addNote(p);
  };

  window.addEventListener('tp:speech-state', onSpeechState, true);
  window.addEventListener('tp:scroll:mode', updateStatus, true);
  window.addEventListener('tp:speech:transcript', onTranscript, true);

  const onSpeechToggle = (on: unknown) => {
    captureOn = !!on;
    updateStatus();
  };

  try {
    bus?.on('speech:toggle', onSpeechToggle);
    bus?.on('speech:partial', onPartial);
    bus?.on('speech:final', onFinal);
  } catch {
    /* ignore */
  }

  render();
  updateStatus();

  const show = () => {
    panel.style.display = '';
  };
  const hide = () => {
    panel.style.display = 'none';
  };
  const toggle = () => {
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };
  const destroy = () => {
    hide();
    window.removeEventListener('tp:speech-state', onSpeechState, true);
    window.removeEventListener('tp:scroll:mode', updateStatus, true);
    window.removeEventListener('tp:speech:transcript', onTranscript, true);
    try {
      bus?.off?.('speech:toggle', onSpeechToggle);
      bus?.off?.('speech:partial', onPartial);
      bus?.off?.('speech:final', onFinal);
    } catch {
      /* ignore */
    }
  };

  try {
    (window as any).__tpSpeechNotesHud = {
      canCapture,
      captureGateReason,
      dumpState: () => ({
        captureOn,
        mode: currentMode(store),
        micActive: micActive(store),
        rehearsal: inRehearsal(),
        saving: savingEnabled(),
        statusText: statusEl?.textContent || '',
      }),
      addNote: (text: string, final = false) => addNote({ text, final }),
      show,
      hide,
      toggle,
    };
  } catch {
    /* ignore */
  }

  return { show, hide, toggle, destroy };
}
