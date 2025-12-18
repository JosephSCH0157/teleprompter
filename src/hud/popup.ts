import { createHudBridge, type HudState } from './bridge';

type HudPopupOpts = {
  root?: HTMLElement | null;
  getStore?: () => any;
  dev?: boolean;
  maxLines?: number;
  popout?: boolean;
};

export type HudPopupApi = {
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  log: (line: string, data?: any) => void;
  dumpSnapshot: (label?: string) => void;
  clear: () => void;
  setFrozen: (frozen: boolean) => void;
  appendLines?: (lines: string[]) => void;
  setSnapshotText?: (text: string) => void;
  copyText?: (text: string) => void;
  getState?: () => HudState;
  openPopout?: () => void;
  closePopout?: () => void;
  setPopout?: (open: boolean) => void;
};

const LS_STATE = 'tp_hud_state_v2';

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

function storeGet(store: any, key: string): any {
  try {
    if (store?.get) return store.get(key);
    if (store?.get?.call) return store.get.call(store, key);
  } catch {}
  return undefined;
}

function loadState(): HudState {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) throw new Error('no state');
    const parsed = JSON.parse(raw);
    return {
      open: !!parsed.open,
      frozen: !!parsed.frozen,
      popout: !!parsed.popout,
      x: Number.isFinite(parsed.x) ? parsed.x : 12,
      y: Number.isFinite(parsed.y) ? parsed.y : 120,
    };
  } catch {
    return { open: false, frozen: false, popout: false, x: 12, y: 120 };
  }
}

function saveState(state: HudState) {
  try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch {}
}

export function initHudPopup(opts: HudPopupOpts = {}): HudPopupApi {
  const root = opts.root ?? document.getElementById('hud-root') ?? document.body;
  const getStore = opts.getStore;
  const maxLines = opts.maxLines ?? 600;
  const isPopout = opts.popout ?? !!(window as any).__TP_HUD_POPOUT__;
  const bridge = createHudBridge();
  try { (window as any).__tpHudBridge = bridge; } catch {}
  const storeLines: string[] = [];
  let snapshotText = '';

  const state = loadState();
  const wrap = document.createElement('div');
  wrap.className = 'tp-hud-popup';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Debug HUD');
  wrap.style.position = 'fixed';
  wrap.style.left = `${state.x}px`;
  wrap.style.top = `${state.y}px`;
  wrap.style.display = state.open ? 'block' : 'none';
  wrap.dataset.open = state.open ? '1' : '0';

  const head = document.createElement('div');
  head.className = 'tp-hud-popup__head';
  const title = document.createElement('div');
  title.className = 'tp-hud-popup__title';
  title.textContent = 'HUD Log';
  const btns = document.createElement('div');
  btns.className = 'tp-hud-popup__btns';

  const makeBtn = (text: string, extra = '') => {
    const btn = document.createElement('button');
    btn.className = 'tp-hud-btn' + (extra ? ` ${extra}` : '');
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

  btnFreeze.dataset.on = state.frozen ? '1' : '0';
  btnFreeze.textContent = state.frozen ? 'Frozen' : 'Freeze';
  btnPopout.style.display = state.popout ? 'none' : '';
  btnDock.style.display = state.popout ? '' : 'none';

  btns.append(btnDump, btnCopy, btnClear, btnFreeze, btnPopout, btnDock, btnClose);
  head.append(title, btns);

  const body = document.createElement('div');
  body.className = 'tp-hud-popup__body';
  const ta = document.createElement('textarea');
  ta.className = 'tp-hud-popup__text';
  ta.spellcheck = false;
  ta.wrap = 'off';
  body.appendChild(ta);

  wrap.append(head, body);
  wrap.style.pointerEvents = 'auto';
  root.appendChild(wrap);

  const ensureInsideViewport = () => {
    const maxX = Math.max(0, window.innerWidth - 260);
    const maxY = Math.max(0, window.innerHeight - 160);
    const x = clamp(Number(wrap.style.left) || 0, 0, maxX);
    const y = clamp(Number(wrap.style.top) || 0, 0, maxY);
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    state.x = x;
    state.y = y;
    saveState(state);
  };

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  head.style.cursor = 'grab';
  head.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement | null)?.closest('button')) return;
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
    ensureInsideViewport();
  });

  const appendLine = (line: string) => {
    const existing = ta.value ? ta.value.split('\n') : [];
    existing.push(line);
    if (existing.length > maxLines) {
      const drop = existing.length - maxLines;
      existing.splice(0, drop);
    }
    ta.value = existing.join('\n');
    ta.scrollTop = ta.scrollHeight;
    storeLines.length = existing.length;
    existing.forEach((l, idx) => storeLines[idx] = l);
    if (!isPopout) {
      broadcastAppend([line]);
    }
  };

  const log = (line: string, data?: any) => {
    if (!state.open || state.frozen) return;
    const prefix = `[${nowStamp()}] `;
    appendLine(prefix + line);
    if (data !== undefined) {
      const text = typeof data === 'string' ? data : safeJson(data);
      text.split('\n').forEach((l) => appendLine(prefix + '  ' + l));
    }
  };

  const dumpSnapshot = (label = 'SNAPSHOT') => {
    const store = getStore?.();
    const snap = {
      label,
      scrollMode: store ? storeGet(store, 'scrollMode') : undefined,
      clamp: store ? storeGet(store, 'scrollClamp') : undefined,
      asrEnabled: store ? storeGet(store, 'asrEnabled') : undefined,
      asrLive: store ? storeGet(store, 'asrLive') : undefined,
      autoEnabled: store ? storeGet(store, 'autoScrollEnabled') : undefined,
      autoSpeed: store ? storeGet(store, 'autoSpeed') : undefined,
      wpmTarget: store ? storeGet(store, 'wpmTarget') : undefined,
      speechReady: store ? storeGet(store, 'speechReady') : undefined,
      micAllowed: store ? storeGet(store, 'micAllowed') : undefined,
      hudEnabledByUser: store ? storeGet(store, 'hudEnabledByUser') : undefined,
      hudSupported: store ? storeGet(store, 'hudSupported') : undefined,
    };
    log(`[HUD ${label}]`, snap);
    snapshotText = JSON.stringify(snap, null, 2);
    if (!isPopout) broadcastSnapshot(snapshotText);
  };

  const clear = () => {
    ta.value = '';
    storeLines.length = 0;
    snapshotText = '';
    if (!isPopout) bridge.send({ type: 'hud:clear' });
  };

  const copyText = async (text?: string) => {
    const content = String(text ?? ta.value);
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const temp = document.createElement('textarea');
      temp.value = content;
      document.body.appendChild(temp);
      temp.select();
      try { document.execCommand('copy'); } catch {}
      temp.remove();
    }
  };

  const setSnapshotText = (text: string) => {
    snapshotText = text || '';
    if (!isPopout) broadcastSnapshot(snapshotText);
  };

  const setOpen = (next: boolean) => {
    state.open = next;
    wrap.dataset.open = next ? '1' : '0';
    wrap.style.display = next ? 'block' : 'none';
    saveState(state);
    if (!isPopout) {
      broadcastState();
    }
  };

  const setFrozen = (next: boolean) => {
    state.frozen = next;
    btnFreeze.dataset.on = next ? '1' : '0';
    btnFreeze.textContent = next ? 'Frozen' : 'Freeze';
    saveState(state);
    if (!isPopout) broadcastState();
  };

  const setPopout = (next: boolean) => {
    state.popout = next;
    btnPopout.style.display = next ? 'none' : '';
    btnDock.style.display = next ? '' : 'none';
    saveState(state);
    if (!isPopout) broadcastState();
  };

  const openPopout = () => {
    if (state.popout) return;
    const features = [
      'popup=yes',
      'width=520',
      'height=700',
      'resizable=yes',
      'scrollbars=yes',
    ].join(',');
    const win = window.open('/dist/hud_popout.html', 'tpHudPopout', features);
    if (!win) {
      setPopout(false);
      const message = 'HUD popout blocked — allow popups for this site.';
      (window as any).__tpToast?.warn?.(message) ?? console.warn(message);
      return;
    }
    (window as any).__tpHudPopoutWin = win;
    setPopout(true);
    bridge.send({ type: 'hud:state', state });
  };

  const closePopout = () => {
    setPopout(false);
    if (isPopout) return;
    const win = (window as any).__tpHudPopoutWin;
    if (win && !win.closed) {
      try { win.close(); } catch {}
    }
  };

  const broadcastState = () => {
    bridge.send({ type: 'hud:state', state });
  };

  const broadcastAppend = (lines: string[]) => {
    if (!lines.length) return;
    bridge.send({ type: 'hud:append', lines });
  };

  const broadcastSnapshot = (text: string) => {
    bridge.send({ type: 'hud:snapshot', text });
  };

  bridge.on((msg) => {
    if (isPopout) {
      switch (msg.type) {
        case 'hud:state':
          setOpen(msg.state.open);
          setFrozen(msg.state.frozen);
          break;
        case 'hud:append':
          msg.lines.forEach((line) => appendLine(line));
          break;
        case 'hud:snapshot':
          setSnapshotText(msg.text);
          break;
        case 'hud:clear':
          clear();
          break;
        case 'hud:setFrozen':
          setFrozen(msg.frozen);
          break;
        case 'hud:copy':
          copyText(msg.text);
          break;
        case 'hud:requestSync':
          // popout ignores this direction
          break;
      }
      return;
    }

    switch (msg.type) {
      case 'hud:requestSync':
        broadcastState();
        if (storeLines.length) bridge.send({ type: 'hud:append', lines: [...storeLines] });
        if (snapshotText) bridge.send({ type: 'hud:snapshot', text: snapshotText });
        break;
      case 'hud:clear':
        clear();
        break;
      case 'hud:setFrozen':
        setFrozen(msg.frozen);
        break;
      case 'hud:copy':
        copyText(msg.text);
        break;
    }
  });

  btnClose.addEventListener('click', () => setOpen(false));
  btnFreeze.addEventListener('click', () => setFrozen(!state.frozen));
  btnClear.addEventListener('click', () => clear());
  btnCopy.addEventListener('click', () => copyText());
  btnDump.addEventListener('click', () => dumpSnapshot('DUMP'));
  btnPopout.addEventListener('click', openPopout);
  btnDock.addEventListener('click', closePopout);

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['input', 'textarea', 'select'].includes((target.tagName || '').toLowerCase()))) {
      return;
    }
    const isTilde = e.shiftKey ? e.code === 'Backquote' : e.key === '`' || e.key === '~';
    if (!isTilde) return;
    setOpen(!state.open);
    e.preventDefault();
  }, { capture: true });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || !m.__tpHudPop) return;
    if (m.type === 'dock') {
      setPopout(false);
    }
  });

  if (!state.popout && state.open) {
    broadcastState();
  }

  window.addEventListener('beforeunload', () => {
    bridge.close();
  });

  return {
    isOpen: () => state.open,
    setOpen,
    log,
    dumpSnapshot,
    clear,
    setFrozen,
    appendLines: (lines: string[]) => lines.forEach((line) => appendLine(line)),
    setSnapshotText,
    copyText,
    getState: () => ({ ...state }),
    openPopout,
    closePopout,
    setPopout,
  };
}
