import { hasSupabaseConfig, supabase } from './forge/supabaseClient';
import './scroll/adapter';
import './features/scroll/scroll-router';

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

function shouldGateAuth(): boolean {
  if (shouldBypassAuth()) return false;
  if (!hasSupabaseConfig) return false;
  return true;
}

function getRedirectTarget(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

function isLoginPath(path: string): boolean {
  const clean = (path || '').toLowerCase();
  return clean === '/login' || clean === '/login.html';
}

function isLoginPage(): boolean {
  return isLoginPath(window.location.pathname);
}

function buildLoginUrl(): string {
  return `/login.html?redirect=${encodeURIComponent(getRedirectTarget())}`;
}

function redirectToLogin(): void {
  if (isLoginPage()) return;
  try {
    window.location.assign(buildLoginUrl());
  } catch {
    // ignore
  }
}

async function gateAuth(): Promise<boolean> {
  if (isLoginPage()) return false;
  if (!shouldGateAuth()) return true;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) return true;
  } catch {
    // fall through to redirect
  }

  redirectToLogin();
  return false;
}

(async () => {
  ensureDisplayMode();
  if (isDisplayContext()) return;
  const ok = await gateAuth();
  if (!ok) return;
  await import('./index-app');
})().catch((err) => {
  try { console.error('[TP-BOOT] preflight failed', err); } catch {}
  if (isDisplayContext()) return;
  if (shouldGateAuth()) {
    redirectToLogin();
    return;
  }
  void import('./index-app');
});
