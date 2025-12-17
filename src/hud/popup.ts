// src/hud/popup.ts
type HudPopupOpts = {
  root: HTMLElement;
  getStore?: () => any;
  dev?: boolean;
  maxLines?: number;
};

export type HudPopupApi = {
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  log: (line: string, data?: any) => void;
  dumpSnapshot: (label?: string) => void;
  clear: () => void;
  setFrozen: (frozen: boolean) => void;
};

const LS_POS = 'tp_hud_popup_pos_v1';
const LS_OPEN = 'tp_hud_popup_open_v1';
const LS_FROZEN = 'tp_hud_popup_frozen_v1';
const LS_POPOUT = 'tp_hud_popup_popout_v1';

function safeJson(v: any): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function nowStamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(LS_POS);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.x !== 'number' || typeof obj?.y !== 'number') return null;
    return { x: obj.x, y: obj.y };
  } catch { return null; }
}

function savePos(x: number, y: number): void {
  try { localStorage.setItem(LS_POS, JSON.stringify({ x, y })); } catch {}
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === '1' || raw === 'true';
  } catch { return fallback; }
}

function saveBool(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch {}
}

function storeGet(store: any, key: string): any {
  try {
    if (store?.get) return store.get(key);
    if (store?.get?.call) return store.get.call(store, key);
  } catch {}
  return undefined;
}

export function mountHudPopup(opts: HudPopupOpts): HudPopupApi {
  const { root, getStore, dev = false } = opts;
  const maxLines = opts.maxLines ?? 600;

  const wrap = document.createElement('div');
  wrap.className = 'tp-hud-popup';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Debug HUD');

  const head = document.createElement('div');
  head.className = 'tp-hud-popup__head';

  const title = document.createElement('div');
  title.className = 'tp-hud-popup__title';
  title.textContent = 'HUD Log';

  const btns = document.createElement('div');
  btns.className = 'tp-hud-popup__btns';

  const makeBtn = (text: string, extra = '') => {
    const btn = document.createElement('button');
    btn.className = 'tp-hud-btn ' + extra;
    btn.type = 'button';
    btn.textContent = text;
    return btn;
  };

  const btnDump = makeBtn('Dump');
  const btnCopy = makeBtn('Copy');
  const btnClear = makeBtn('Clear');
  const btnFreeze = makeBtn('Freeze');
  const btnPopout = makeBtn('Pop out');
  const btnDock = makeBtn('Dock');
  const btnClose = makeBtn('×', 'tp-hud-btn--close');

  btns.append(btnDump, btnCopy, btnClear, btnFreeze, btnPopout, btnDock, btnClose);
  head.append(title, btns);

  const body = document.createElement('div');
  body.className = 'tp-hud-popup__body';

  const ta = document.createElement('textarea');
  ta.className = 'tp-hud-popup__text';
  ta.spellcheck = false;
  ta.wrap = 'off';
  ta.value = '';

  body.appendChild(ta);
  wrap.append(head, body);
  wrap.style.pointerEvents = 'auto';

  const pos = loadPos() ?? { x: 12, y: 120 };
  wrap.style.left = `${pos.x}px`;
  wrap.style.top = `${pos.y}px`;

  let open = loadBool(LS_OPEN, false);
  wrap.dataset.open = open ? '1' : '0';
  wrap.style.display = open ? 'block' : 'none';

  let frozen = loadBool(LS_FROZEN, false);
  btnFreeze.dataset.on = frozen ? '1' : '0';
  btnFreeze.textContent = frozen ? 'Frozen' : 'Freeze';

  function setOpen(next: boolean) {
    open = next;
    saveBool(LS_OPEN, open);
    wrap.dataset.open = open ? '1' : '0';
    wrap.style.display = open ? 'block' : 'none';
  }

  function setFrozen(next: boolean) {
    frozen = next;
    saveBool(LS_FROZEN, frozen);
    btnFreeze.dataset.on = frozen ? '1' : '0';
    btnFreeze.textContent = frozen ? 'Frozen' : 'Freeze';
  }

  let popWin: Window | null = null;
  let poppedOut = loadBool(LS_POPOUT, false);

  const setPopButtons = () => {
    btnPopout.style.display = poppedOut ? 'none' : '';
    btnDock.style.display = poppedOut ? '' : 'none';
  };

  const isPopOpen = () => !!popWin && !popWin.closed;

  const sendToPop = (type: string, payload: any) => {
    if (!isPopOpen()) return;
    try {
      popWin!.postMessage({ __tpHudPop: true, type, payload }, '*');
    } catch {}
  };

  const setPoppedOut = (next: boolean) => {
    poppedOut = next;
    saveBool(LS_POPOUT, next);
    setPopButtons();
  };

  const dockBack = () => {
    setPoppedOut(false);
    if (isPopOpen()) {
      try { popWin!.close(); } catch {}
    }
    popWin = null;
  };

  const openPopout = () => {
    if (isPopOpen()) {
      popWin!.focus();
      return;
    }
    popWin = window.open('', 'tp_hud_popout', 'width=700,height=420,resizable=yes,scrollbars=no');
    if (!popWin) return;
    setPoppedOut(true);

    popWin.document.open();
    popWin.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Anvil HUD</title>
<style>
  html,body{margin:0;height:100%;background:#0b1117;color:#eaf3ff;font-family:system-ui,'Segoe UI',Roboto,Arial}
  .head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
  .btns{display:flex;gap:6px}
  button{font:600 12px/1 system-ui;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.08);color:rgba(235,245,255,.92);border:1px solid rgba(255,255,255,.16);cursor:pointer}
  button:hover{background:rgba(255,255,255,.12)}
  textarea{width:calc(100% - 20px);height:calc(100% - 56px);margin:10px;resize:none;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:rgba(235,245,255,.92);font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:10px;outline:none}
</style>
<script>
  const clearBtn = document.getElementById('clearBtn');
  const copyBtn = document.getElementById('copyBtn');
  const dockBtn = document.getElementById('dockBtn');
  const ta = document.getElementById('ta');
  clearBtn.onclick = () => ta.value = '';
  copyBtn.onclick = async () => {
    ta.focus(); ta.select();
    try { await navigator.clipboard.writeText(ta.value || ''); } catch {}
  };
  dockBtn.onclick = () => {
    window.opener?.postMessage({ __tpHudPop: true, type: 'dock' }, '*');
  };
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || !m.__tpHudPop) return;
    if (m.type === 'append') {
      ta.value += (ta.value ? '\\n' : '') + m.payload;
      ta.scrollTop = ta.scrollHeight;
    }
    if (m.type === 'set') {
      ta.value = String(m.payload || '');
      ta.scrollTop = ta.scrollHeight;
    }
  });
</script>
</head>
<body>
  <div class="head">
    <div><b>HUD Log</b></div>
    <div class="btns">
      <button id="copyBtn">Copy</button>
      <button id="clearBtn">Clear</button>
      <button id="dockBtn">Dock</button>
    </div>
  </div>
  <textarea id="ta" spellcheck="false" wrap="off"></textarea>
</body>
</html>
    `);
    popWin.document.close();
    sendToPop('set', ta.value);
    try {
      popWin.addEventListener('beforeunload', () => {
        setPoppedOut(false);
        popWin = null;
      });
    } catch {}
  };

  btnPopout.addEventListener('click', openPopout);
  btnDock.addEventListener('click', dockBack);
  setPoppedOut(poppedOut);

  function appendLine(line: string) {
    if (poppedOut && isPopOpen()) {
      sendToPop('append', line);
      return;
    }
    const existing = ta.value ? ta.value.split('\n') : [];
    existing.push(line);
    if (existing.length > maxLines) {
      const drop = existing.length - maxLines;
      existing.splice(0, drop);
    }
    ta.value = existing.join('\n');
    ta.scrollTop = ta.scrollHeight;
  }

  function log(line: string, data?: any) {
    if (!open || frozen) return;
    const prefix = `[${nowStamp()}] `;
    appendLine(prefix + line);
    if (data !== undefined) {
      const text = typeof data === 'string' ? data : safeJson(data);
      text.split('\n').forEach((l) => appendLine(prefix + '  ' + l));
    }
  }

  function dumpSnapshot(label = 'SNAPSHOT') {
    const store = getStore?.();
    const snap = {
      label,
      scrollMode: storeGet(store, 'scrollMode'),
      clamp: storeGet(store, 'scrollClamp'),
      asrEnabled: storeGet(store, 'asrEnabled'),
      asrLive: storeGet(store, 'asrLive'),
      autoEnabled: storeGet(store, 'autoScrollEnabled'),
      autoSpeed: storeGet(store, 'autoSpeed'),
      wpmTarget: storeGet(store, 'wpmTarget'),
      speechReady: storeGet(store, 'speechReady'),
      micAllowed: storeGet(store, 'micAllowed'),
      hudEnabledByUser: storeGet(store, 'hudEnabledByUser'),
      hudSupported: storeGet(store, 'hudSupported'),
    };
    log(`[HUD ${label}]`, snap);
  }

  btnClose.addEventListener('click', () => setOpen(false));
  btnFreeze.addEventListener('click', () => setFrozen(!frozen));
  btnClear.addEventListener('click', () => { ta.value = ''; });
  btnCopy.addEventListener('click', async () => {
    try {
      ta.focus();
      ta.select();
      const text = ta.value || '';
      await navigator.clipboard.writeText(text);
      if (dev) log('Copied HUD text to clipboard');
    } catch (e) {
      if (dev) log('Copy failed; text selected for Ctrl+C', String(e));
    }
  });
  btnDump.addEventListener('click', () => dumpSnapshot('DUMP'));

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  head.style.cursor = 'grab';
  head.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement)?.closest('button')) return;
    dragging = true;
    head.setPointerCapture(ev.pointerId);
    head.style.cursor = 'grabbing';
    startX = ev.clientX;
    startY = ev.clientY;
    baseX = parseFloat(wrap.style.left || '0') || 0;
    baseY = parseFloat(wrap.style.top || '0') || 0;
    ev.preventDefault();
  });

  head.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const maxX = Math.max(0, window.innerWidth - 260);
    const maxY = Math.max(0, window.innerHeight - 160);
    const x = clamp(baseX + dx, 0, maxX);
    const y = clamp(baseY + dy, 0, maxY);
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
  });

  head.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    head.style.cursor = 'grab';
    const x = parseFloat(wrap.style.left || '0') || 0;
    const y = parseFloat(wrap.style.top || '0') || 0;
    savePos(x, y);
  });

  root.appendChild(wrap);

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || !m.__tpHudPop) return;
    if (m.type === 'dock') dockBack();
  });

  const handleHotkey = (e: KeyboardEvent) => {
    try {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['input', 'textarea', 'select'].includes((target.tagName || '').toLowerCase()))) {
        return;
      }
      const isTilde = e.code === 'Backquote' && e.shiftKey || e.key === '`' || e.key === '~';
      if (!isTilde) return;
      setOpen(!open);
      e.preventDefault();
    } catch {}
  };
  window.addEventListener('keydown', handleHotkey, { capture: true });

  return {
    isOpen: () => open,
    setOpen,
    log,
    dumpSnapshot,
    clear: () => { ta.value = ''; },
    setFrozen,
  };
}
