import { hasSupabaseConfig, supabase } from './forge/supabaseClient';
import './scroll/adapter';
import './features/scroll/scroll-router';

const IRON_MINE_URL = 'https://discord.com/channels/1457026850407841834/1457026850407841837';

try {
  window.addEventListener('tp:autoIntent', (ev: any) => {
    try {
      console.warn('[AUTO_INTENT] legacy tp:autoIntent event', ev?.detail);
      const on = ev?.detail?.on;
      const reason = ev?.detail?.reason;
      if (typeof on === 'boolean') {
        window.dispatchEvent(
          new CustomEvent('tp:auto:intent', { detail: { enabled: on, reason: reason ?? 'bridge:autoIntent' } }),
        );
      }
    } catch {}
  });
} catch {}

function isDisplayContext(): boolean {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('display') === '1') return true;
    const path = (window.location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
    if ((window as any).__TP_FORCE_DISPLAY) return true;
  } catch {
    // ignore
  }
  return false;
}

function ensureDisplayMode(): void {
  if (!isDisplayContext()) return;
  try {
    (window as any).__TP_FORCE_DISPLAY = true;
  } catch {}
}

function shouldBypassAuth(): boolean {
  try {
    const search = String(window.location.search || '');
    const hash = String(window.location.hash || '');
    if (search.includes('ci=1') || search.includes('uiMock=1') || search.includes('mockFolder=1')) return true;
    if (hash.includes('ci=1') || hash.includes('uiMock=1')) return true;
    if ((window as any).__TP_SKIP_AUTH === true) return true;
  } catch {
    // ignore
  }
  return false;
}

function getRedirectTarget(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

function buildLoginUrl(): string {
  const target = encodeURIComponent(getRedirectTarget());
  return `/login.html?redirect=${target}&return=${target}`;
}

function redirectToLogin(): void {
  try {
    window.location.assign(buildLoginUrl());
  } catch {
    // ignore
  }
}

function isIronMinePath(path: string): boolean {
  const clean = (path || '').toLowerCase();
  return clean === '/iron-mine' || clean === '/iron-mine.html' || clean === '/ironmine' || clean === '/ironmine.html';
}

async function maybeHandleIronMineRoute(): Promise<boolean> {
  if (!isIronMinePath(window.location.pathname)) return false;
  if (shouldBypassAuth()) {
    redirectToLogin();
    return true;
  }
  if (!hasSupabaseConfig) {
    redirectToLogin();
    return true;
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      window.location.assign(IRON_MINE_URL);
      return true;
    }
  } catch {
    // fall through to login
  }

  redirectToLogin();
  return true;
}

(async () => {
  ensureDisplayMode();
  if (isDisplayContext()) return;
  const handledIronMine = await maybeHandleIronMineRoute();
  if (handledIronMine) return;
  await import('./index-app');
})().catch((err) => {
  try { console.error('[TP-BOOT] preflight failed', err); } catch {}
  if (isDisplayContext()) return;
  void import('./index-app');
});
