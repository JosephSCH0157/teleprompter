import { hasSupabaseConfig, supabase } from './forge/supabaseClient';

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

async function gateAuth(): Promise<boolean> {
  if (!shouldGateAuth()) return true;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) return true;
  } catch {
    // fall through to redirect
  }

  try {
    const loginUrl = `/login?redirect=${encodeURIComponent(getRedirectTarget())}`;
    window.location.assign(loginUrl);
  } catch {
    // ignore
  }

  return false;
}

(async () => {
  const ok = await gateAuth();
  if (!ok) return;
  await import('./index-app');
})().catch((err) => {
  try { console.error('[TP-BOOT] preflight failed', err); } catch {}
  if (shouldGateAuth()) {
    try {
      const loginUrl = `/login?redirect=${encodeURIComponent(getRedirectTarget())}`;
      window.location.assign(loginUrl);
    } catch {}
    return;
  }
  void import('./index-app');
});
