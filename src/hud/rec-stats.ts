import type { AppStore } from '../state/app-store';
import type { HudBus } from './speech-notes-hud';

export interface RecStatsHudOptions {
  root?: HTMLElement | null;
  bus?: HudBus | null;
  store?: AppStore | null;
}

export interface RecStatsHudApi {
  destroy(): void;
}

const HUD_ID = 'recStatsHud';
const TEXT_ID = 'recStatsText';

function isDev(): boolean {
  try {
    if ((window as any).__TP_DEV) return true;
    if (/([?#]).*dev=1/.test(location.href)) return true;
    return localStorage.getItem('tp_dev_mode') === '1';
  } catch {
    return false;
  }
}

function ensureHudRoot(root?: HTMLElement | null): HTMLElement | null {
  if (root) return root;
  try {
    let r = document.getElementById('hud-root');
    if (!r) {
      r = document.createElement('div');
      r.id = 'hud-root';
      r.className = 'hud-root hidden';
      r.setAttribute('aria-hidden', 'true');
      r.setAttribute('inert', '');
      document.body.appendChild(r);
    }
    return r;
  } catch {
    return null;
  }
}

export function initRecStatsHud(opts: RecStatsHudOptions = {}): RecStatsHudApi | null {
  const { bus = null } = opts;
  if (!isDev()) return null;
  const root = ensureHudRoot(opts.root);
  if (!root) return null;

  let panel = document.getElementById(HUD_ID) as HTMLElement | null;
  if (!panel) {
    panel = document.createElement('div');
    panel.id = HUD_ID;
    panel.style.cssText =
      'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#9fb4c9;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin:4px 0;max-width:360px;';
    const strong = document.createElement('strong');
    strong.textContent = 'REC';
    strong.style.marginRight = '6px';
    panel.appendChild(strong);
    const span = document.createElement('span');
    span.id = TEXT_ID;
    span.textContent = '…';
    panel.appendChild(span);
    root.appendChild(panel);
    try {
      root.classList.remove('hidden');
      root.removeAttribute('aria-hidden');
      root.removeAttribute('inert');
    } catch {
      /* ignore */
    }
  }

  const textEl = document.getElementById(TEXT_ID) as HTMLElement | null;
  const fmt = (x: unknown) => {
    try {
      return x == null || !isFinite(Number(x)) ? '…' : String(Math.round(Number(x)));
    } catch {
      return '…';
    }
  };

  const handleStats = (payload: any) => {
    try {
      const d = (payload && payload.detail) || payload || {};
      const msg = `starts ${d.starts | 0} · retry ${d.retries | 0} · fallback ${d.fallbacks | 0} · dc ${d.disconnects | 0} · p95 start ${fmt(
        d.startP95Ms,
      )}ms · p95 stop ${fmt(d.stopP95Ms)}ms`;
      if (textEl) textEl.textContent = msg;
    } catch {
      /* ignore */
    }
  };

  const onWindowStats = (e: Event) => handleStats((e as CustomEvent<any>)?.detail ?? {});
  window.addEventListener('rec:stats', onWindowStats, { passive: true });
  try {
    bus?.on('rec:stats', handleStats);
  } catch {
    /* ignore */
  }

  const destroy = () => {
    window.removeEventListener('rec:stats', onWindowStats, true);
    try {
      bus?.off?.('rec:stats', handleStats);
    } catch {
      /* ignore */
    }
    try {
      const line = document.getElementById(HUD_ID);
      if (line) line.remove();
    } catch {
      /* ignore */
    }
  };

  try {
    (window as any).__tpRecStatsHud = { panel, destroy };
  } catch {
    /* ignore */
  }

  return { destroy };
}
