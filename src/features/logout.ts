import { supabase } from '../forge/supabaseClient';

const LOGOUT_REDIRECT = '/login.html';
const SESSION_CACHE_KEYS = ['forge_profile_cache', 'forge_user_cache'];

async function finalizeLogout() {
  try {
    SESSION_CACHE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
  } catch {}
  try {
    window.location.href = LOGOUT_REDIRECT;
  } catch {}
}

async function handleLogoutClick(btn: HTMLButtonElement, originalText: string) {
  btn.disabled = true;
  btn.textContent = 'Signing out…';
  try {
    await supabase.auth.signOut();
  } catch (err) {
    try { console.error('[logout] signOut failed', err); } catch {}
  } finally {
    finalizeLogout();
    btn.textContent = originalText;
  }
}

export function wireTopbarLogout() {
  try {
    const btn = document.getElementById('logoutBtn') as HTMLButtonElement | null;
    if (!btn) return;
    const originalText = btn.textContent || 'Log out';
    btn.addEventListener('click', () => void handleLogoutClick(btn, originalText));
  } catch (err) {
    try { console.error('[logout] wiring failed', err); } catch {}
  }
}

wireTopbarLogout();
