// Unified core UI binder (TS path)
// Centralizes lightweight, idempotent DOM event wiring that was previously
// scattered across legacy scripts. Keep this file SIDE-EFFECT FREE except for
// the explicit bindCoreUI() invocation by the caller (index.ts) so tests can
// re-run it safely.
//
// Contract:
//  - Safe to call multiple times (no duplicate listeners / mutations)
//  - Does not throw (best-effort guards everywhere)
//  - Exposes minimal helpers on window for legacy fallbacks (__tpUiBinder)
//  - Wires: scroll mode select → setScrollMode router, present mode button,
//           shortcuts / settings open helpers (kept tiny since index.ts also
//           provides overlay lifecycle events for smoke determinism), and
//           anchor HUD tick.
//
// NOTE: We intentionally DO NOT de‑duplicate all existing legacy wiring here
// yet; this first pass focuses on the scroll mode router + minimal parity.
// Future cleanup can migrate more overlay logic once smoke tests cover it.

export interface CoreUIBindOptions {
  scrollModeSelect?: string;      // CSS selector for the scroll mode <select>
  presentBtn?: string;            // Present mode toggle button (supports CSS list)
}

// --- Overlay bootstrap (globals + toggler + click delegator) ---
type OverlayName = 'settings' | 'help';

const OVERSEL: Record<OverlayName, string> = {
  settings: `[data-overlay="settings"], #settingsOverlay`,
  help:     `[data-overlay="help"], #helpOverlay, #shortcutsOverlay`,
};

function ensureOverlaysExist() {
  try {
    const root = document.body || document.documentElement;
    if (root && !root.querySelector(OVERSEL.settings)) {
      root.insertAdjacentHTML(
        'beforeend',
        `<div id="settingsOverlay" data-overlay="settings" role="dialog" aria-modal="true" style="display:none"></div>`
      );
    }
    if (root && !root.querySelector(OVERSEL.help)) {
      root.insertAdjacentHTML(
        'beforeend',
        `<div id="helpOverlay" data-overlay="help" role="dialog" aria-modal="true" style="display:none"></div>`
      );
    }
  } catch {}
}

export function toggleOverlay(name: OverlayName, on?: boolean) {
  try {
    const list = Array.from(document.querySelectorAll<HTMLElement>(OVERSEL[name]));
    if (!list.length) return;
    const want = on ?? list.some(el => el.hidden || getComputedStyle(el).display === 'none');
    for (const el of list) {
      if (want) {
        el.hidden = false;
        el.classList.remove('hidden','visually-hidden');
        try { el.style.setProperty('display','block','important'); } catch { el.style.display = 'block'; }
        // Allow clicks while open
        try { el.style.setProperty('pointer-events','auto','important'); } catch { el.style.pointerEvents = 'auto'; }
      } else {
        try { el.style.setProperty('display','none','important'); } catch { el.style.display = 'none'; }
        // Never eat clicks while closed
        try { el.style.setProperty('pointer-events','none','important'); } catch { el.style.pointerEvents = 'none'; }
        el.hidden = true;
      }
    }
    if (want) {
      try { (document.body as any).dataset.smokeOpen = name; } catch {}
      try { document.body.setAttribute('data-smoke-open', name); } catch {}
      try { document.body.style.overflow = 'hidden'; } catch {}
    } else {
      try { delete (document.body as any).dataset.smokeOpen; } catch {}
      try { document.body.removeAttribute('data-smoke-open'); } catch {}
      try { document.body.style.overflow = ''; } catch {}
    }

    // Dispatch overlay lifecycle events for downstream wiring (tabs, camera, etc.)
    try {
      const evName = `tp:${name}:${want ? 'open' : 'close'}`;
      window.dispatchEvent(new CustomEvent(evName, { detail: { source: 'toggler' } }));
    } catch {}

    // After listeners run, wire tabs on settings open (microtask to allow DOM updates)
    if (name === 'settings' && want) {
      try { queueMicrotask(() => ensureSettingsTabsWiring()); } catch {}
    }
  } catch {}
}

function installOverlayDelegatorOnce() {
  try {
    if ((document as any).__tpOLBound) return;
    document.addEventListener('click', (ev) => {
      try {
        // Guard: ignore tab interactions; inside overlays only act on explicit close buttons
        const el = ev.target as Element;
        if (el.closest('[role="tab"], .settings-tab')) return;
        if (el.closest('#settingsOverlay,[data-overlay="settings"],#shortcutsOverlay,[data-overlay="help"]')) {
          if (!el.closest('[data-action="settings-close"],#settingsClose,[data-action="help-close"],#helpClose')) return;
        }
        const t = ev.target as HTMLElement | null;
        const btn = t?.closest?.('[data-action], #settingsBtn, #shortcutsBtn, #settingsClose, #helpClose') as HTMLElement | null;
        if (!btn) return;
        const act = (btn.dataset?.action
          || (btn.id === 'settingsBtn'   && 'settings-open')
          || (btn.id === 'shortcutsBtn'  && 'help-open')
          || (btn.id === 'settingsClose' && 'settings-close')
          || (btn.id === 'helpClose'     && 'help-close')
          || '') as string;
        // Only prevent default for anchors with href="#"
        try {
          const isAnchor = btn.tagName === 'A';
          const href = isAnchor ? (btn as HTMLAnchorElement).getAttribute('href') : null;
          if (isAnchor && href === '#') (ev as Event).preventDefault?.();
        } catch {}
        if (act === 'settings-open')  { return toggleOverlay('settings', true); }
        if (act === 'settings-close') { return toggleOverlay('settings', false); }
        if (act === 'help-open')      { return toggleOverlay('help', true); }
        if (act === 'help-close')     { return toggleOverlay('help', false); }
      } catch {}
    }, { capture: true });

    document.addEventListener('keydown', (ev) => {
      try {
        if ((ev as KeyboardEvent).key !== 'Escape') return;
        const open = document.body.getAttribute('data-smoke-open') as OverlayName | null;
        if (open) toggleOverlay(open, false);
      } catch {}
    }, { capture: true });

    (document as any).__tpOLBound = true;
  } catch {}
}

declare global {
  interface Window {
    __tpOpen?: (name: OverlayName)  => void;
    __tpClose?: (name: OverlayName) => void;
  }
}
try { if (!(window as any).__tpOpen)  (window as any).__tpOpen  = (n: OverlayName) => toggleOverlay(n, true); } catch {}
try { if (!(window as any).__tpClose) (window as any).__tpClose = (n: OverlayName) => toggleOverlay(n, false); } catch {}

// init immediately so they exist even if other binders fail
try { ensureOverlaysExist(); } catch {}
try { installOverlayDelegatorOnce(); } catch {}

// Minimal media store for mic/camera fallbacks
const mediaStore: { mic?: MediaStream | null; cam?: MediaStream | null } = { mic: null, cam: null };

async function requestMic(): Promise<boolean> {
  try {
    // Prefer app ASR if present
    const fn = (window as any).__tpAsrImpl?.requestMic || (window as any).asr?.requestMic;
    if (typeof fn === 'function') { await fn(); }
    else {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStore.mic = s;
    }
    try { document.getElementById('recBtn')?.removeAttribute('disabled'); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:mic:state', { detail: { on: true } })); } catch {}
    return true;
  } catch (e) { try { console.warn('[mic] request failed', e); } catch {}; return false; }
}
function releaseMic() {
  try {
    const s = mediaStore.mic; mediaStore.mic = null;
    if (s) s.getTracks().forEach(t => { try { t.stop(); } catch {} });
    try { (window as any).__tpAsrImpl?.releaseMic?.(); } catch {}
    try { (window as any).asr?.stop?.(); } catch {}
  } catch {}
  finally {
    try { document.getElementById('recBtn')?.setAttribute('disabled','true'); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:mic:state', { detail: { on: false } })); } catch {}
  }
}
async function startCamera(): Promise<boolean> {
  try {
    // Prefer app camera if present
    const fn = (window as any).__tpCamImpl?.start || (window as any).cam?.start;
    if (typeof fn === 'function') { await fn(); return true; }
    const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
    const s = mediaStore.cam || await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    mediaStore.cam = s;
    if (v) { (v as any).srcObject = s; try { await v.play(); } catch {} }
    return true;
  } catch { return false; }
}
function stopCamera() {
  try {
    const s = mediaStore.cam; mediaStore.cam = null;
    if (s) s.getTracks().forEach(t => { try { t.stop(); } catch {} });
    const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
    if (v) { try { v.pause(); } catch {}; try { (v as any).srcObject = null; } catch {} }
  } catch {}
}
async function requestPiP() {
  try {
    const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
    if (!v) return;
    if ((document as any).pictureInPictureEnabled && !(document as any).pictureInPictureElement) {
      try { await (v as any).requestPictureInPicture?.(); } catch {}
    }
  } catch {}
}

// Camera picker helpers (enumerate + start by deviceId)
async function refreshCameras() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const sel = document.querySelector<HTMLSelectElement>('#cameraSelect');
    if (!sel) return;
    sel.innerHTML = cams.map(d => `<option value="${d.deviceId}">${d.label || 'Camera'}</option>`).join('');
  } catch {}
}
async function startCameraById(deviceId?: string) {
  try {
    const constraints = deviceId ? { video: { deviceId: { exact: deviceId } }, audio: false } : { video: true, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const v = document.querySelector<HTMLVideoElement>('#cameraPreview');
    if (v) { (v as any).srcObject = stream; try { await v.play(); } catch {}; v.hidden = false; }
  } catch {}
}

// Deterministic focus helper: waits until element is visible before focusing
function focusWhenVisible(el: HTMLElement | null, tries = 5) {
  try {
    if (!el) return;
    let n = 0;
    const tick = () => {
      try {
        n++;
        const visible = !!el && (el.offsetParent !== null || getComputedStyle(el).display !== 'none');
        if (visible) { try { (el as any).focus?.({ preventScroll: true }); } catch {}; return; }
        if (n < tries) requestAnimationFrame(tick);
      } catch {}
    };
    requestAnimationFrame(tick);
  } catch {}
}

// CI detection helper (query flag or webdriver)
function isCI(): boolean {
  try { return /\bci=1\b/i.test(location.search) || ((navigator as any).webdriver === true); } catch { return false; }
}

// Focusable finder (first tabbable inside an overlay)
function firstFocusable(root: HTMLElement): HTMLElement | null {
  try {
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const all = Array.from(root.querySelectorAll(sel)) as HTMLElement[];
    return all.find(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden')) || null;
  } catch { return null; }
}

function q<T extends HTMLElement = HTMLElement>(sel: string | undefined | null): T | null {
  if (!sel) return null; try { return document.querySelector(sel) as T | null; } catch { return null; }
}

// Multi-selector helper: returns first match from a list
function _qq<T extends HTMLElement = HTMLElement>(sels: readonly string[] | undefined | null): T | null {
  try {
    if (!sels || !Array.isArray(sels)) return null as any;
    for (const s of sels) {
      const el = q<T>(s);
      if (el) return el;
    }
  } catch {}
  return null as any;
}

function on(el: Element | null | undefined, ev: string, fn: any, opts?: any) {
  try { if (el && 'addEventListener' in el) (el as any).addEventListener(ev, fn, opts); } catch {}
}

// Global-safe binding cache so we can bind window/document idempotently
const __bound = new WeakMap<EventTarget, Set<string>>();
function onGlobal(target: EventTarget | null | undefined, type: string, listener: EventListener, key?: string, options?: AddEventListenerOptions) {
  try {
    if (!target) return;
    const k = key || type;
    let set = __bound.get(target);
    if (!set) { set = new Set(); __bound.set(target, set); }
    if (set.has(k)) return; // idempotent
    target.addEventListener(type, listener, options);
    set.add(k);
  } catch {}
}

/** Normalize visible button text for matching */
function _txt(el: Element | null): string {
  if (!el) return '';
  try {
    const t = (el as HTMLElement).innerText || (el.textContent || '');
    return t.trim().toLowerCase().replace(/\s+/g, ' ');
  } catch { return ''; }
}

// try a list of selectors, return the first match
function findOne(list: readonly string[]): HTMLElement | null {
  try {
    for (const s of list) {
      const el = document.querySelector(s) as HTMLElement | null;
      if (el) return el;
    }
  } catch {}
  return null;
}


/** Best-effort action guesser for legacy buttons by id or label */
function guessActionFor(el: HTMLElement): string | null {
  try {
    const id = (el.id || '').toLowerCase();
    // by id
    if (id.includes('settings'))   return 'settings-open';
    if (id.includes('help') || id.includes('shortcuts')) return 'help-open';
    if (id.includes('present'))    return 'present-toggle';
    if (id.includes('display'))    return 'display';
    if (id.includes('hud'))        return 'hud-toggle';
    if (id.includes('mic'))        return 'request-mic';
    if (id.includes('speech') || id.includes('rec')) return 'start-speech';
    if (id.includes('camera') || id.includes('cam')) return 'start-camera';
    if (id.includes('pip'))        return 'pip';
    if (id.includes('loadsample') || id.includes('load_sample') || id.includes('loadsampletext') || id.includes('loadsamplebtn') || id === 'loadsample') return 'load-sample';
    if (id.includes('normalize'))  return 'normalize';
    if (id.includes('upload'))     return 'upload';
    if (id.includes('saveas'))     return 'save-as';
    if (id === 'save' || id.includes('save_btn')) return 'save';
    if (id.includes('clear'))      return 'clear';
    if (id.includes('delete'))     return 'delete';
    if (id.includes('rename'))     return 'rename';
    if (id.includes('reset'))      return 'reset';
    if (id.includes('speakers') && id.includes('toggle')) return 'speakers-toggle';
    if (id.includes('speakers') && id.includes('key'))    return 'speakers-key';

    // by visible label
    const t = _txt(el);
    if (/^settings$/.test(t))                  return 'settings-open';
    if (/^help$|shortcuts/.test(t))            return 'help-open';
    if (/^present$|present mode/.test(t))      return 'present-toggle';
    if (/^display( window)?$/.test(t))         return 'display';
    if (/^hud$/.test(t))                       return 'hud-toggle';
    if (/request mic|mic( on)?/i.test(t))      return 'request-mic';
    if (/start speech|start sync|speech/i.test(t)) return 'start-speech';
    if (/start camera|camera on/i.test(t))     return 'start-camera';
    if (/picture[- ]in[- ]picture|pip/i.test(t)) return 'pip';
    if (/load sample/.test(t))                 return 'load-sample';
    if (/normalize/.test(t))                   return 'normalize';
    if (/upload/.test(t))                      return 'upload';
    if (/save as/.test(t))                     return 'save-as';
    if (/^save$/.test(t))                      return 'save';
    if (/^clear$/.test(t))                     return 'clear';
    if (/^delete$/.test(t))                    return 'delete';
    if (/^rename$/.test(t))                    return 'rename';
    if (/^reset$/.test(t))                     return 'reset';
    if (/speakers.*show|hide|toggle/i.test(t)) return 'speakers-toggle';
    if (/speakers.*key/i.test(t))              return 'speakers-key';
  } catch {}
  return null;
}

/** Add data-action to legacy buttons so binders always recognize them */
export function autoMarkActions() {
  try {
    const all = document.querySelectorAll('button,[role="button"],.btn');
    for (const el of Array.from(all)) {
      const he = el as HTMLElement;
      if (he.dataset.action) continue;
      const act = guessActionFor(he);
      if (act) he.dataset.action = act;
    }
  } catch {}
}

// ——— Emergency delegated binder (keeps UI alive even if per-button binding breaks) ———
let __tpEmergencyBound = false;

function closestAction(el: Element | null): { node: HTMLElement, action: string } | null {
  if (!el) return null;
  try {
    const node = (el as HTMLElement).closest?.('[data-action],button,[role="button"]') as HTMLElement | null;
    if (!node) return null;
    const ds = (node.dataset?.action || node.getAttribute('data-action') || '').trim();
    const guessed = guessActionFor(node) || '';
    let action = ds || guessed;
    // Special-case: release mic buttons with wrong data-action
    try {
      const id = (node.id || '').toLowerCase();
      if (action === 'request-mic' && id.includes('release')) action = 'release-mic';
    } catch {}
    return action ? { node, action } : null;
  } catch { return null; }
}

// minimal helpers used by handlers
function renderNow(name: string, text: string) {
  try { document.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name, text } })); } catch {}
}

// Central script name resolver: prefer mapped-folder current name, then sidebar select, then hidden title input
function getScriptName(): string {
  try { if ((window as any).__tpCurrentName) return String((window as any).__tpCurrentName); } catch {}
  try {
    const sel = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
    if (sel && sel.selectedOptions && sel.selectedOptions[0]) return sel.selectedOptions[0].text || sel.value || 'Untitled';
  } catch {}
  try {
    const t = document.getElementById('scriptTitle') as HTMLInputElement | null;
    if (t && t.value) return t.value;
  } catch {}
  return 'Untitled';
}
try { (window as any).__tpGetScriptName = getScriptName; } catch {}

async function pickPlainFile(): Promise<File | null> {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.docx,.md,.rtf,.json,.html,.htm';
    return await new Promise(resolve => {
      try {
        input.onchange = async () => {
          try { const f = input.files && input.files[0]; resolve(f || null); } catch { resolve(null); }
        };
        input.click();
      } catch { resolve(null); }
    });
  } catch { return null; }
}

// Upload helper: normalize File→text (DOCX via Mammoth ArrayBuffer, else plain text)
async function toText(file: File): Promise<string> {
  try {
    if (/\.docx$/i.test(file.name)) {
      const buf = await file.arrayBuffer();
      const ensure = (window as any).ensureMammoth;
      if (ensure) { try { await ensure(); } catch {} }
      const m = (window as any).mammoth;
      if (m && typeof m.extractRawText === 'function') {
        try {
          const { value } = await m.extractRawText({ arrayBuffer: buf });
          return value || '';
        } catch (e) {
          try { console.warn('[upload] mammoth parse failed', e); } catch {}
        }
      }
      // Fallback: treat as plain text inside (will likely be garbage XML)
      try { return await file.text(); } catch {}
      return '';
    }
    return await file.text();
  } catch { return ''; }
}

// (legacy toggleOverlay kept during migration; now unused)
// function toggleOverlay(sel: string, show?: boolean) {}


// Compatibility export: still provide this for callers; delegates to the bootstrap installer
export function installOverlayButtonWiringOnce() { try { installOverlayDelegatorOnce(); } catch {} }

function downloadNow(name: string, text: string, ext?: string) {
  try {
    const fmtSel = document.getElementById('downloadFormat') as HTMLSelectElement | null;
    const extFromSel = fmtSel ? (fmtSel.value || '').replace(/^\./,'') : '';
    const finalExt = (ext || extFromSel || 'txt').replace(/^\./,'');
    const base = String(name || 'Untitled').replace(/\.[^.]+$/, '');
    const fname = base + '.' + finalExt;
    const blob = new Blob([text||''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
  } catch {}
}

export function installEmergencyBinder() {
  if (__tpEmergencyBound) return;
  __tpEmergencyBound = true;

  try {
    // Live-render on editor paste/input as a safety net
    try {
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (ed && !(ed as any)._emergencyInputWired) {
        (ed as any)._emergencyInputWired = 1;
        const apply = () => {
          try {
            const t = ed.value || '';
            const name = getScriptName();
            document.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name, text: t } }));
          } catch {}
        };
        ed.addEventListener('paste', () => { try { setTimeout(apply, 0); } catch {} }, { capture: true });
        ed.addEventListener('input', () => { try { setTimeout(apply, 0); } catch {} }, { capture: true });
      }
    } catch {}

    document.addEventListener('click', async (evt) => {
      try {
        const el = evt.target as Element;
        if (el.closest('[role="tab"], .settings-tab')) return; // let tab wiring handle it
        if (el.closest('#settingsOverlay,[data-overlay="settings"],#shortcutsOverlay,[data-overlay="help"]')) {
          // inside overlays, only handle explicit close buttons
          if (!el.closest('[data-action="settings-close"],#settingsClose,[data-action="help-close"],#helpClose')) return;
        }
        const target = el;
        const hit = closestAction(target);
        if (!hit) return;
        const { action } = hit;
        evt.preventDefault();
        evt.stopPropagation();
        switch (action) {
          case 'settings-open':
            toggleOverlay('settings', true);
            try { document.dispatchEvent(new CustomEvent('tp:settings:open', { detail: { source: 'emergency' } })); } catch {}
            try { ensureSettingsTabsWiring(); } catch {}
            break;
          case 'settings-close':
            toggleOverlay('settings', false);
            try { document.dispatchEvent(new CustomEvent('tp:settings:close', { detail: { source: 'emergency' } })); } catch {}
            break;
          case 'help-open':
            toggleOverlay('help', true);
            break;
          case 'help-close':
            toggleOverlay('help', false);
            break;
          case 'present-toggle':
            try {
              const root = document.documentElement;
              const next = !root.classList.contains('tp-present');
              const fn = (window as any).__tpSetPresent;
              if (typeof fn === 'function') {
                fn(next);
              } else if (typeof (setPresent as any) === 'function') {
                (setPresent as any)(next);
              } else {
                // Fallback manual toggle if setter not yet defined (early emergency binder install)
                root.classList.toggle('tp-present', next);
                root.setAttribute('data-smoke-present', next ? '1' : '0');
              }
            } catch {}
            break;
          case 'hud-toggle':
            try { (window as any).HUD?.toggle?.(); } catch {}
            break;
          case 'display': {
            try {
              const displayUrl = `${location.origin}/display.html`;
              let urlToOpen = '';
              try {
                const r = await fetch(displayUrl, { method: 'HEAD' });
                urlToOpen = r.ok ? displayUrl : `${location.pathname}?display=1`;
              } catch {
                urlToOpen = `${location.pathname}?display=1`;
              }
              window.open(urlToOpen, 'AnvilDisplay', 'popup=yes,resizable=yes,scrollbars=no,width=1280,height=720');
            } catch {}
            break; }
          case 'display-close': {
            try { (window as any).__tpDisplayWindow?.close?.(); } catch {}
            break; }
          case 'request-mic':
            try {
              // Treat mislabeled release button that still carries request-mic id/data-action
              const el = target as HTMLElement | null;
              if (el && /release/i.test(el.id || '')) { releaseMic(); }
              else { await requestMic(); }
            } catch {}
            break;
          case 'release-mic':
            try { releaseMic(); } catch {}
            break;
          case 'start-speech':
            try { (window as any).__tpAsrImpl?.start?.(); } catch {}
            try { (window as any).asr?.start?.(); } catch {}
            break;
          case 'start-camera':
            try { await startCamera(); } catch {}
            break;
          case 'stop-camera':
            try { stopCamera(); } catch {}
            break;
          case 'pip':
            try { await requestPiP(); } catch {}
            break;
          case 'speakers-toggle': {
            try {
              const body = (document.getElementById('speakersBody') as HTMLElement | null)
                        || (document.querySelector('#speakersPanel,[data-panel="speakers"]') as HTMLElement | null);
              const btn = document.getElementById('toggleSpeakers') as HTMLButtonElement | null;
              if (body) body.hidden = !body.hidden;
              if (btn) { btn.textContent = body && body.hidden ? 'Show' : 'Hide'; btn.setAttribute('aria-expanded', String(!(body && body.hidden))); }
              // When opening, also focus the key input if present for accessibility
              if (body && !body.hidden) {
                const key = document.querySelector<HTMLInputElement>('#speakersKey, [data-speakers-key], input[name="speakersKey"]');
                focusWhenVisible(key);
              }
            } catch {}
            break; }
          case 'speakers-key': {
            try {
              const panel = document.querySelector<HTMLElement>('[data-panel="speakers"], #speakersBody');
              if (panel) {
                panel.hidden = false;
                panel.setAttribute('aria-expanded','true');
                panel.style.display = 'block';
              }
              const key = document.querySelector<HTMLInputElement>('#speakersKey, [data-speakers-key], input[name="speakersKey"]');
              focusWhenVisible(key);
            } catch {}
            break; }
          case 'load-sample': {
            const sample = `[s1]\nWelcome to Anvil — sample is live.\n[beat]\nUse step keys or auto-scroll to move.\n[/s1]`;
            renderNow('Sample.txt', sample);
            break; }
          case 'upload': {
            try {
              const mocked = (() => { try { return (new URL(location.href)).searchParams.get('uiMock') === '1'; } catch { return false; } })();
              if (mocked) { renderNow('SmokeUpload.txt','[s1] CI upload OK [/s1]'); break; }
              const input = document.querySelector<HTMLInputElement>('input[type=file]#uploadInput,[data-upload-input]');
              if (input && !(input as any)._uploadBound) {
                (input as any)._uploadBound = 1;
                input.addEventListener('change', async () => {
                  const f = input.files?.[0]; if (!f) return;
                  const text = await toText(f).catch(()=>'');
                  renderNow(f.name, text);
                }, { once: true });
              }
              if (input) { input.click(); }
              else {
                const f = await pickPlainFile(); if (!f) break;
                renderNow(f.name, await toText(f));
              }
            } catch {}
            break; }
          case 'download': {
            try {
              const name = getScriptName();
              const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
              const text = (ed && ed.value) || '';
              downloadNow(name, text);
            } catch {}
            break; }
          case 'save': {
            try {
              const name = getScriptName();
              const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
              downloadNow(name, (ed && ed.value) || '');
            } catch {}
            break; }
          case 'save-as': {
            try {
              const name = prompt('Save As name:', getScriptName()) || getScriptName();
              const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
              downloadNow(name, (ed && ed.value) || '');
            } catch {}
            break; }
          case 'load': {
            try {
              // Prefer loading the currently selected mapped-folder script
              const sel = (document.querySelector('#scriptSelectSidebar') || document.querySelector('#scriptSelect')) as HTMLSelectElement | null;
              if (sel) {
                // Trigger the existing change handler to perform the real load logic
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
              // Fallback: manual file pick if no mapped select exists
              const f = await pickPlainFile(); if (!f) break;
              const isDocx = f.name.toLowerCase().endsWith('.docx') && (window as any).docxToText;
              const text = isDocx ? await (window as any).docxToText(f) : await f.text();
              renderNow(f.name, text);
            } catch {}
            break; }
          case 'normalize': {
            try {
              const ed = document.querySelector('#editor') as HTMLTextAreaElement | null;
              if (!ed) break;
              const t = (ed.value || '')
                .replace(/\u00A0/g, ' ')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n');
              ed.value = t; renderNow('Normalized.txt', t);
            } catch {}
            break; }
          case 'clear': {
            try {
              const ed = document.querySelector('#editor') as HTMLTextAreaElement | null;
              if (ed) ed.value = '';
              renderNow('Untitled.txt','');
            } catch {}
            break; }
          case 'delete':
          case 'rename':
          case 'reset-script':
            // No-ops for legacy buttons; provide minimal UX feedback
            try { console.debug('[emergency-binder]', action, 'not implemented'); } catch {}
            break;
          default:
            try { console.debug('[emergency-binder] no handler for', action); } catch {}
        }
      } catch (e) {
        try { console.warn('[emergency-binder] handler error', e); } catch {}
      }
    }, { capture: true });
  } catch {}

  try { console.log('[emergency-binder] installed'); } catch {}
  // Attempt to wire settings tabs after emergency binder install (in case primary binder missed it)
  try { ensureSettingsTabsWiring(); } catch {}
}

// --- Settings tabs: robust, idempotent wiring ---
export function ensureSettingsTabsWiring() {
  const overlay =
    document.querySelector<HTMLElement>('#settingsOverlay,[data-overlay="settings"]');
  if (!overlay) return;

  // run once per DOM session
  if ((overlay as any).__tabsWired) return;
  (overlay as any).__tabsWired = true;

  // prefer role-based markup, fall back to legacy
  const tablist =
    overlay.querySelector<HTMLElement>('[role="tablist"]') ||
    overlay.querySelector<HTMLElement>('#settingsTabs');

  const tabs = Array.from(
    overlay.querySelectorAll<HTMLElement>('[role="tab"], .settings-tab')
  );

  const panels = Array.from(
    overlay.querySelectorAll<HTMLElement>(
      '[role="tabpanel"][data-tabpanel], .settings-card[data-tab]'
    )
  ).map(p => {
    // normalize role/attrs
    p.setAttribute('role', 'tabpanel');
    if (!p.hasAttribute('data-tabpanel') && (p as any).dataset.tab) {
      p.setAttribute('data-tabpanel', (p as any).dataset.tab!);
    }
    return p;
  });

  if (!tabs.length) return;

  // tabs must not be treated as feature buttons
  tabs.forEach(t => t.removeAttribute('data-action'));

  // ensure each tab has a stable id + aria-controls
  tabs.forEach((t, i) => {
    if (!t.id) t.id = `tab-${t.dataset.tab || i}`;
    const name = (t.dataset.tab || t.id.replace(/^tab-/, '')).toString();
    // ensure data-tab attribute exists canonically
    if (!t.dataset.tab) t.dataset.tab = name;
    // find / normalize panel
    const panel =
      overlay.querySelector<HTMLElement>(`[role="tabpanel"][data-tabpanel="${name}"], .settings-card[data-tab="${name}"]`);
    if (panel) {
      // assign canonical attributes
      panel.setAttribute('aria-labelledby', t.id);
      panel.setAttribute('data-tabpanel', name);
      if (!panel.id) panel.id = `settings-panel-${name}`;
      try { t.setAttribute('aria-controls', panel.id); } catch {}
    }
    t.setAttribute('role', 'tab');
    // defense in depth: remove rogue actions
    t.removeAttribute('data-action');
  });

  const indexOf = (tab: HTMLElement) => tabs.indexOf(tab);

  const show = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, tabs.length - 1));
    const activeTab = tabs[clamped];
    const name = (activeTab.dataset.tab || activeTab.id.replace(/^tab-/, '')).toString();

    tabs.forEach((t, j) => {
      const on = j === clamped;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });

    panels.forEach(p => {
      const hit =
        p.getAttribute('data-tabpanel') === name ||
        (p as any).dataset.tab === name;
      p.toggleAttribute('hidden', !hit);
    });

    // handy for smoke/debug
    (overlay as any).dataset.activeTab = name;
    window.dispatchEvent(new CustomEvent('tp:settings:tab', { detail: { name } }));
  };

  // initial state: if multiple were "active", collapse to the first
  const firstActive = Math.max(0, tabs.findIndex(t => t.classList.contains('active')));
  show(firstActive);

  // click: capture so nothing upstream swallows it
  tablist?.addEventListener('click', (e: MouseEvent) => {
    const t = (e.target as Element).closest('[role="tab"], .settings-tab') as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    show(indexOf(t));
  }, { capture: true });

  // keyboard: Arrow/Home/End
  tablist?.addEventListener('keydown', (e: KeyboardEvent) => {
    const current = indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    let next = current;
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;

    e.preventDefault();
    show(next);
    tabs[next].focus();
  }, { capture: true });
}

// Defense in depth: strip any rogue data-action attributes from tabs at module load.
try {
  document.querySelectorAll('[role="tab"],.settings-tab').forEach(el => el.removeAttribute('data-action'));
} catch {}

// Gate emergency binder to harness/dev contexts only
try {
  const isHarness = /[?&](dev|ci|uiMock|mockFolder)=1/.test(location.search) || ((navigator as any).webdriver === true);
  if (isHarness) { try { installEmergencyBinder(); } catch {} }
} catch {}

// Map <option value> → internal UiScrollMode (see index.ts applyUiScrollMode)
function mapScrollValue(v: string): 'auto'|'asr'|'step'|'rehearsal'|'off' {
  switch (v) {
    case 'timed': return 'auto';        // pure time-based
    case 'wpm': return 'auto';          // WPM currently modeled as timed brain
    case 'hybrid': return 'asr';        // legacy label for hybrid (auto + ASR)
    case 'asr': return 'asr';           // explicit ASR option
    case 'step': return 'step';
    case 'rehearsal': return 'rehearsal';
    default: return 'off';
  }
}

export function bindCoreUI(opts: CoreUIBindOptions = {}) {
  try {
    if ((window as any).__tpCoreUiBound) return; // idempotent short‑circuit
    (window as any).__tpCoreUiBound = true;
  } catch {}

  try { (window as any).__tpUiBinder = { rebind: () => { try { (window as any).__tpCoreUiBound = false; bindCoreUI(opts); } catch {} } }; } catch {}

  // Scroll Mode select → setScrollMode router
  try {
    const sel = q<HTMLSelectElement>(opts.scrollModeSelect || '#scrollMode');
    if (sel && !sel.dataset.uiBound) {
      sel.dataset.uiBound = '1';
      const apply = () => {
        try {
          const raw = String(sel.value || '').trim();
          const mode = mapScrollValue(raw);
          const fn = (window as any).setScrollMode as ((_m: any)=>void)|undefined;
          fn && fn(mode);
          // HUD log for visibility
          try { (window as any).HUD?.log?.('scroll:ui-mode', { raw, mapped: mode }); } catch {}
        } catch {}
      };
      on(sel, 'change', apply);
      // Initialize once DOM is stable (microtask → rAF)
      queueMicrotask(() => requestAnimationFrame(apply));
    }
  } catch {}

  // Present Mode toggle (mirrors legacy wiring in ui/dom.js but harmless if duplicated)
  try {
    const btn = q<HTMLButtonElement>(opts.presentBtn || '#presentBtn, [data-action="present-toggle"]');
    if (btn && !btn.dataset.uiBound) {
      btn.dataset.uiBound = '1';
      on(btn, 'click', (e: Event) => { try { e.preventDefault(); } catch {}; try { setPresent(!document.documentElement.classList.contains('tp-present')); } catch {} });
      // Do NOT restore persisted present mode automatically on load.
      // Default should be non-present; user must opt-in via a click each session.
    }
  } catch {}

  // ESC safety exit & keybinds (capture early to beat browser defaults)
  try {
    if (!(window as any).__tpCoreUiKeybinds) {
      (window as any).__tpCoreUiKeybinds = true;
      const hotkeys = (e: KeyboardEvent) => {
        try {
          const root = document.documentElement;
          const key = (e.key || '').toLowerCase();
          const withAccel = !!(e.ctrlKey || e.metaKey);
          if (key === 'escape' && root.classList.contains('tp-present')) setPresent(false);
          if ((key === 'p') && !e.metaKey && !e.ctrlKey && !e.altKey) setPresent(!root.classList.contains('tp-present'));
          // Ctrl/Cmd+O → Load selected script from mapped folder
          if (withAccel && key === 'o') {
            try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
            try { triggerMappedSelectLoad(); } catch {}
            return;
          }
          // Ctrl/Cmd+S → Save current script (browser download or FS handler)
          if (withAccel && key === 's') {
            try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
            try { (scripts as any)?.save?.(); } catch {}
            return;
          }
          // F2 → Rename selected script (avoid while typing in inputs/textareas)
          if (!withAccel && (e.key === 'F2' || key === 'f2')) {
            const ae = (document.activeElement as HTMLElement | null);
            const inEditable = !!(ae && (ae.closest('input,textarea,[contenteditable="true"]')));
            if (inEditable) return;
            try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
            try { (scripts as any)?.renameSel?.(); } catch {}
            return;
          }
          // Delete → Delete selected script (confirm inside handler). Skip while editing text.
          if (!withAccel && (e.key === 'Delete' || key === 'delete')) {
            const ae = (document.activeElement as HTMLElement | null);
            const inEditable = !!(ae && (ae.closest('input,textarea,[contenteditable="true"]')));
            if (inEditable) return;
            try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
            try { (scripts as any)?.deleteSel?.(); } catch {}
            return;
          }
        } catch {}
      };
      // Capture phase ensures we pre-empt browser defaults like Ctrl/Cmd+O
      onGlobal(window, 'keydown', hotkeys as any, 'core-ui-hotkeys-capture', { capture: true });
    }
  } catch {}

  // Anchor HUD heartbeat for dev visibility (fires lightweight event every 2s)
  try {
    if (!(window as any).__tpAnchorPulse) {
      (window as any).__tpAnchorPulse = true;
      setInterval(() => { try { window.dispatchEvent(new CustomEvent('tp:anchor:pulse')); } catch {}; }, 2000);
    }
  } catch {}

  // Settings / Help overlay wiring (single source of truth)
  try {
    // Deprecated local toggle helper removed (use toggleOverlayList instead)

    const settingsBtn     = _qq<HTMLButtonElement>(SEL.settingsOpen);
    const settingsClose   = _qq<HTMLButtonElement>(SEL.settingsClose);
    if (settingsBtn && !settingsBtn.dataset.uiBound) {
      settingsBtn.dataset.uiBound = '1';
      on(settingsBtn, 'click', (e: Event) => {
        try { e.preventDefault?.(); } catch {}
        toggleOverlay('settings', true);
        try { dispatch('tp:settings:open', { source: 'binder' }); } catch {}
        try { document.body.dispatchEvent(new CustomEvent('tp:settings:open', { detail: { source: 'binder' } })); } catch {}
      });
    }
    if (settingsClose && !settingsClose.dataset.uiBound) {
      settingsClose.dataset.uiBound = '1';
      on(settingsClose, 'click', (e: Event) => {
        try { e.preventDefault?.(); } catch {}
        toggleOverlay('settings', false);
        try { dispatch('tp:settings:close', { source: 'binder' }); } catch {}
        try { document.body.dispatchEvent(new CustomEvent('tp:settings:close', { detail: { source: 'binder' } })); } catch {}
      });
    }

  const helpBtn     = _qq<HTMLButtonElement>(SEL.helpOpen);
  const helpClose   = _qq<HTMLButtonElement>(SEL.helpClose);
    if (helpBtn && !helpBtn.dataset.uiBound) {
      helpBtn.dataset.uiBound = '1';
  on(helpBtn, 'click', (e: Event) => { try { e.preventDefault?.(); } catch {}; toggleOverlay('help', true); try { document.dispatchEvent(new CustomEvent('tp:help:open', { detail: { source: 'binder' } })); } catch {} });
    }
    if (helpClose && !helpClose.dataset.uiBound) {
      helpClose.dataset.uiBound = '1';
  on(helpClose, 'click', (e: Event) => { try { e.preventDefault?.(); } catch {}; toggleOverlay('help', false); try { document.dispatchEvent(new CustomEvent('tp:help:close', { detail: { source: 'binder' } })); } catch {} });
    }
    // ESC to close overlays (SAFE for window)
    onGlobal(window, 'keydown', (e: Event) => {
      try {
        const ev = e as KeyboardEvent;
        if (ev.key !== 'Escape') return;
        const name = document.body.getAttribute('data-smoke-open') as ('settings'|'help'|null);
        if (name) {
          try { ev.preventDefault?.(); } catch {}
          toggleOverlay(name, false);
        }
      } catch {}
    }, 'esc-close', { capture: true });
  } catch {}
}

// Present mode setter with CI smoke hook
function setPresent(on: boolean) {
  try {
    const html = document.documentElement;
    const body = document.body;
    html.classList.toggle('tp-present', on);
    body.classList.toggle('present-mode', on);
    html.setAttribute('data-smoke-present', on ? '1' : '0');
    const btn = document.querySelector<HTMLButtonElement>('#presentBtn,[data-action="present-toggle"]');
    if (btn) {
      btn.textContent = on ? 'Exit Present' : 'Present Mode';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    try { localStorage.setItem('tp_present', on ? '1' : '0'); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:present:changed', { detail: { on } })); } catch {}
  } catch {}
}

// Expose setter for test harness / legacy fallbacks
try { (window as any).__tpSetPresent = setPresent; } catch {}

// (No auto‑invoke here; index.ts calls bindCoreUI() inside its onReady path)

// ----------------- DEV/UI MOCKS AND CONTROL WIRING -----------------

// Lightweight event dispatcher used by mock flows
function dispatch(type: string, detail?: any) {
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
}

// File picker helper
async function pickFile(accept = '*/*'): Promise<File | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const [h]: any = await (window as any).showOpenFilePicker({ multiple: false, types: [{ description: 'Files', accept: { [accept]: ['.txt', '.md', '.rtf', '.docx'] } }] });
      const f = await h.getFile();
      return f as File;
    }
  } catch {}
  // Fallback: use a hidden input
  return await new Promise<File | null>((res) => {
    try {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.txt,.md,.rtf,.docx';
      inp.style.position = 'fixed';
      inp.style.left = '-9999px';
      inp.addEventListener('change', () => {
        try { res((inp.files && inp.files[0]) || null); } catch { res(null); }
      }, { once: true });
      document.body.appendChild(inp);
      inp.click();
      setTimeout(() => { try { inp.remove(); } catch {} }, 15000);
    } catch { res(null); }
  });
}

const DEV_UI = (() => { try { return location.search.includes('uiMock=1') || ((navigator as any).webdriver === true); } catch { return false; } })();
const fakeFile = (name: string, text: string) => new File([text], name, { type: 'text/plain' });

// script helpers used by UI controls
const scripts = {
  save() {
    try {
      const name = getScriptName();
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      const text = (ed && ed.value) || '';
      downloadNow(name, text);
      // Announce for any listeners (mapped-folder, telemetry)
      try { window.dispatchEvent(new CustomEvent('tp:script:save', { detail: { name, size: text.length } })); } catch {}
    } catch {}
  },
  async saveAs() {
    try {
      const current = getScriptName();
      const next = prompt('Save As name:', current) || current;
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      const text = (ed && ed.value) || '';
      downloadNow(next, text);
      try { window.dispatchEvent(new CustomEvent('tp:script:saveas', { detail: { from: current, to: next, size: text.length } })); } catch {}
    } catch {}
  },
  deleteSel() {
    try {
      const sel = (document.querySelector('#scriptSelectSidebar') || document.querySelector('#scriptSelect')) as HTMLSelectElement | null;
      const name = (sel && sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].text) || getScriptName();
      if (!name) return;
      const ok = confirm(`Delete script "${name}"?`);
      if (!ok) return;
      // Notify mapped-folder layer if present
      try { window.dispatchEvent(new CustomEvent('tp:folderScripts:delete', { detail: { name } })); } catch {}
      // Best-effort UI removal from both selects
      const both = [
        document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null,
        document.getElementById('scriptSelect') as HTMLSelectElement | null,
      ].filter(Boolean) as HTMLSelectElement[];
      for (const s of both) {
        try {
          const opt = Array.from(s.options).find(o => (o.text || '') === name);
          if (opt) opt.remove();
          s.disabled = (s.options.length === 0);
          (s as any).dataset.count = String(s.options.length);
        } catch {}
      }
      try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: (both[0]?.options.length || 0) } })); } catch {}
    } catch {}
  },
  renameSel() {
    try {
      const sel = (document.querySelector('#scriptSelectSidebar') || document.querySelector('#scriptSelect')) as HTMLSelectElement | null;
      const cur = (sel && sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].text) || getScriptName();
      if (!cur) return;
      const next = prompt('Rename script to:', cur);
      if (!next || next === cur) return;
      // Notify mapped-folder layer if present
      try { window.dispatchEvent(new CustomEvent('tp:folderScripts:rename', { detail: { from: cur, to: next } })); } catch {}
      // Best-effort UI rename in both selects
      const both = [
        document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null,
        document.getElementById('scriptSelect') as HTMLSelectElement | null,
      ].filter(Boolean) as HTMLSelectElement[];
      for (const s of both) {
        try {
          const opt = Array.from(s.options).find(o => (o.text || '') === cur);
          if (opt) opt.text = next;
        } catch {}
      }
    } catch {}
  },
  async loadSample() {
    const sample = `[s1]\nWelcome to Anvil. This is a sample script.\n[beat]\nUse the arrow keys or your foot pedal to step.\n[/s1]`;
    try {
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (ed && 'value' in ed) {
        ed.value = sample;
        try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      }
    } catch {}
    dispatch('tp:script-load', { name: 'Sample.txt', text: sample });
  },
  async upload() {
    try {
      if (DEV_UI) {
        const f = fakeFile('SmokeUpload.txt', '[s1] CI upload OK [/s1]');
        const text = await f.text();
        const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
        if (ed && 'value' in ed) {
          ed.value = text;
          try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
        }
        dispatch('tp:script-load', { name: f.name, text });
        return;
      }
      const f = await pickFile();
      if (!f) return;
      let text = '';
      if (f.name.toLowerCase().endsWith('.docx') && (window as any).docxToText) {
        try { text = await (window as any).docxToText(f); } catch { text = await f.text(); }
      } else {
        text = await f.text();
      }
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (ed && 'value' in ed) {
        ed.value = text;
        try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      }
      dispatch('tp:script-load', { name: f.name, text });
    } catch {}
  }
};

// ASR & Camera fallbacks used in headless/dev
const asr = {
  requestMic: (window as any).__tpAsrImpl?.requestMic
           ?? (window as any).ASR?.requestMic
           ?? (async () => DEV_UI ? true : ((await navigator.mediaDevices.getUserMedia({ audio: true })), true)),
  start:      (window as any).__tpAsrImpl?.start
           ?? (window as any).ASR?.start
           ?? (() => { if (DEV_UI) try { console.log('[ASR] start (mock)'); } catch {} })
};

const cam = {
  start: (window as any).__tpCamImpl?.start
       ?? (window as any).Camera?.start
       ?? (async () => { if (DEV_UI) { try { console.log('[CAM] start (mock)'); } catch {} return true; }
                         const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
                         if (!v) return false;
                         const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                         (v as any).srcObject = s; try { await (v as any).play?.(); } catch {} return true; }),
  pip: async () => {
    if (DEV_UI) { try { console.log('[PiP] request (mock)'); } catch {} return; }
    const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
    if (v && (document as any).pictureInPictureEnabled && !(document as any).pictureInPictureElement) {
      try { await (v as any).requestPictureInPicture?.(); } catch {}
    }
  }
};

// Common selectors for legacy + new data-action hooks
const SEL = {
  // overlays
  settingsOpen:   ['[data-action="settings-open"]','#settingsBtn','#btnSettings','#shortcutsBtn'],
  settingsClose:  ['#settingsClose','[data-action="settings-close"]'],
  settingsOverlay:['#settingsOverlay','[data-overlay="settings"]'],

  helpOpen:       ['#helpBtn','#shortcutsBtn','[data-action="help-open"]'],
  helpClose:      ['#helpClose','[data-action="help-close"]'],
  helpOverlay:    ['#helpOverlay','#shortcutsOverlay','[data-overlay="help"]'],

  // core toggles / windows
  present:        ['#presentBtn','[data-action="present-toggle"]'],
  display:        ['#displayWindowBtn','#openDisplayBtn','[data-action="display"]'],
  hud:            ['#hudBtn','[data-action="hud-toggle"]'],

  // asr / cam
  mic:            ['#requestMicBtn','#micBtn','[data-action="request-mic"]'],
  speech:         ['#startSpeechBtn','#recBtn','[data-action="start-speech"]'],
  camera:         ['#startCameraBtn','#startCam','[data-action="start-camera"]'],
  pip:            ['#pipBtn','#camPiP','[data-action="pip"]'],

  // scripts
  sample:         ['#loadSampleBtn','#loadSample','[data-action="load-sample"]'],
  upload:         ['#uploadBtn','#uploadFileBtn','[data-action="upload"]'],
  load:           ['#scriptLoadBtn','[data-action="load"]'],
  save:           ['#scriptSaveBtn','[data-action="save"]'],
  saveAs:         ['#scriptSaveAsBtn','[data-action="save-as"]'],
  del:            ['#scriptDeleteBtn','[data-action="delete"]'],
  ren:            ['#scriptRenameBtn','[data-action="rename"]'],

  // speakers
  speakersToggle: ['#speakersToggleBtn','[data-action="speakers-toggle"]'],
  speakersKey:    ['#speakersKeyBtn','[data-action="speakers-key"]'],
  speakersPanel:  ['#speakersPanel','[data-panel="speakers"]'],
  speakersKeyInput:['#speakersKey','[name="speakersKey"]','[data-key="speakers"]'],

  // scripts selects
  mainSelect:     ['#scriptSelect','[data-select="scripts-main"]'],
  sideSelect:     ['#scriptSelectSidebar','[data-select="scripts-side"]'],
  sidebar:        ['#sidebar','.sidebar','#leftCol'],
} as const;

// Wire the related buttons if present (idempotent via dataset flags); support both IDs and data-action hooks
(() => {
  try {
  const map: Array<{ sels: readonly string[]; fn: () => any }> = [
      { sels: SEL.sample, fn: () => scripts.loadSample() },
      { sels: SEL.upload, fn: () => scripts.upload() },
      { sels: SEL.load,   fn: () => triggerMappedSelectLoad() },
      { sels: SEL.save,   fn: () => scripts.save() },
      { sels: SEL.saveAs, fn: () => scripts.saveAs() },
      { sels: SEL.del,    fn: () => scripts.deleteSel() },
      { sels: SEL.ren,    fn: () => scripts.renameSel() },
      { sels: SEL.mic,    fn: () => asr.requestMic() },
      { sels: SEL.speech, fn: () => asr.start() },
      { sels: SEL.camera, fn: () => cam.start() },
      { sels: SEL.pip,    fn: () => cam.pip() },
    ];
    map.forEach(({ sels, fn }) => {
      try {
        for (const s of sels) {
          const el = q<HTMLElement>(s);
          if (el && !(el as any).dataset.coreUiWired) {
            (el as any).dataset.coreUiWired = '1';
            on(el, 'click', (e: any) => { try { e.preventDefault?.(); } catch {}; try { fn(); } catch {} });
          }
        }
      } catch {}
    });
  } catch {}
})();

// Trigger the mapped-folder select change to load the currently selected script
function triggerMappedSelectLoad(): boolean {
  try {
    const main = document.querySelector('#scriptSelect') as HTMLSelectElement | null;
    const side = document.querySelector('#scriptSelectSidebar') as HTMLSelectElement | null;
    // Prefer main select to ensure mapped-folder handles/files are used
    if (main && main.options && main.options.length > 0) {
      // If sidebar has a different selection, mirror it into main first
      try {
        if (side && side.value && side.value !== main.value) {
          main.value = side.value;
        }
      } catch {}
      main.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // Fallback to sidebar only when main is missing (will sync to main if mirror wiring is active)
    if (side && side.options && side.options.length > 0) {
      side.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // Resilience: if no mapped select exists at all, fall back to Upload picker
    try { (scripts as any)?.upload?.(); } catch {}
    return true;
  } catch { return false; }
}

// Ensure sidebar mirror select exists and two-way syncs (idempotent)
export function ensureSidebarMirror() {
  try {
    const main = document.querySelector('#scriptSelect,[data-select="scripts-main"]') as HTMLSelectElement | null;
    let side = document.querySelector('#scriptSelectSidebar,[data-select="scripts-side"]') as HTMLSelectElement | null;
    if (!main) {
      // If main select isn't present yet (late injection), observe once and retry when it appears
      try {
        if (!(window as any).__tpMirrorWait) {
          (window as any).__tpMirrorWait = 1;
          const mo = new MutationObserver(() => {
            try {
              const m = document.querySelector('#scriptSelect,[data-select="scripts-main"]') as HTMLSelectElement | null;
              if (m) { try { mo.disconnect(); } catch {}; (window as any).__tpMirrorWait = 2; ensureSidebarMirror(); }
            } catch {}
          });
          mo.observe(document.documentElement, { childList: true, subtree: true });
          // Safety timeout to avoid leaking the observer
          setTimeout(() => { try { mo.disconnect(); } catch {} }, 8000);
        }
      } catch {}
      return;
    }
    if (!side) {
      side = document.createElement('select');
      side.id = 'scriptSelectSidebar';
      side.setAttribute('aria-label', 'Mapped folder scripts');
      side.className = 'select-md';
      side.setAttribute('aria-busy', 'true');
      const host = document.getElementById('scriptsQuickRow') || document.getElementById('sidebar') || document.body;
      const wrap = document.createElement('div'); wrap.className = 'row';
      const lab = document.createElement('label'); lab.textContent = 'Scripts';
      lab.appendChild(side); wrap.appendChild(lab); host?.appendChild(wrap);
      try { window.dispatchEvent(new CustomEvent('tp:sidebar:ready', { detail: { id: 'scriptSelectSidebar' } })); } catch {}
    }
    if ((side as any)._mirrorWired) return;
    (side as any)._mirrorWired = '1';
    // Ensure the sidebar initially reflects the main select's options/state
    const copyOptions = () => {
      try {
        if (!main || !side) return;
        // Copy options list
        side.innerHTML = main.innerHTML;
        // Mirror disabled/busy state and dataset count for quick diagnostics
        const busy = main.getAttribute('aria-busy');
        if (busy != null) side.setAttribute('aria-busy', busy);
        else side.removeAttribute('aria-busy');
        try { (side as any).dataset.count = (main as any).dataset.count || String((main.options||[]).length||0); } catch {}
        // Keep value in sync if possible
        try { side.value = main.value; } catch {}
        // Enable/disable based on presence of options
        side.disabled = (side.options?.length || 0) === 0;
      } catch {}
    };
    // Run once now in case main is already populated
    copyOptions();
    let __syncingSelects = false;
    function syncSelect(from: HTMLSelectElement, to: HTMLSelectElement) {
      if (__syncingSelects) return;
      __syncingSelects = true;
      try {
        if (to.value !== from.value) {
          to.value = from.value;
          try { to.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
          try { to.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        }
      } finally {
        __syncingSelects = false;
      }
    }
    main.addEventListener('change', () => { if (side) syncSelect(main, side!); }, { capture: false });
    side.addEventListener('change', () => { if (main) syncSelect(side!, main); }, { capture: false });
    // When folder scripts are (re)populated, refresh sidebar options
    window.addEventListener('tp:folderScripts:populated', () => { copyOptions(); }, { capture: true });
  } catch {}
}

// One-time binding audit: prints presence of common controls/selectors
export function auditBindingsOnce() {
  try {
    if ((window as any).__tpUiAuditDone) return; (window as any).__tpUiAuditDone = true;
    const has = (s: string) => !!document.querySelector(s);
    const report = {
      settingsBtn: has('#settingsBtn,[data-action="settings-open"]'),
      helpBtn:     has('#helpBtn,#shortcutsBtn,[data-action="help-open"]'),
      presentBtn:  has('#presentBtn,[data-action="present-toggle"]'),
      displayBtn:  has('#displayWindowBtn,#openDisplayBtn,[data-action="display"]'),
      hudBtn:      has('#hudBtn,[data-action="hud-toggle"]'),
      mic:         has('#requestMicBtn,#micBtn,[data-action="request-mic"]'),
      speech:      has('#startSpeechBtn,#recBtn,[data-action="start-speech"]'),
      cam:         has('#startCameraBtn,#startCam,[data-action="start-camera"]'),
      pip:         has('#pipBtn,#camPiP,[data-action="pip"]'),
      loadSample:  has('#loadSampleBtn,#loadSample,[data-action="load-sample"]'),
      upload:      has('#uploadBtn,#uploadFileBtn,[data-action="upload"]'),
      speakersT:   has('#speakersToggleBtn,#toggleSpeakers,[data-action="speakers-toggle"]'),
      speakersK:   has('#speakersKeyBtn,[data-action="speakers-key"]'),
      mainSelect:  has('#scriptSelect,[data-select="scripts-main"]'),
      sideSelect:  has('#scriptSelectSidebar,[data-select="scripts-side"]'),
    } as const;
  console.table(report);
  } catch {}
}
