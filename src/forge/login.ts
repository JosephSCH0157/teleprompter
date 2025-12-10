// src/forge/login.ts
// Minimal login page wiring for the Forge /login shell (framework-agnostic).
import { supabase } from './supabaseClient';

function getRedirectTarget(): string {
  const params = new URLSearchParams(window.location.search || '');
  return params.get('redirect') || '/anvil';
}

async function checkExistingSession(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      window.location.href = getRedirectTarget();
    }
  } catch {
    // fall through to wiring the form
  }
}

async function handleLogin(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  window.location.href = getRedirectTarget();
}

async function handleSignup(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  const msg = document.getElementById('error');
  if (msg) msg.textContent = 'Check your email to confirm your account.';
}

function wireLoginPage(): void {
  const form = document.getElementById('login-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('error');
  const signupBtn = document.getElementById('signup-btn');

  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    try { ev.preventDefault(); } catch {}
    if (!errorEl) return;
    const email = (document.getElementById('email') as HTMLInputElement | null)?.value || '';
    const password = (document.getElementById('password') as HTMLInputElement | null)?.value || '';
    errorEl.textContent = '';
    try {
      await handleLogin(email, password);
    } catch (err: any) {
      errorEl.textContent = err?.message || 'Login failed.';
    }
  });

  if (signupBtn && errorEl) {
    signupBtn.addEventListener('click', async () => {
      const email = (document.getElementById('email') as HTMLInputElement | null)?.value || '';
      const password = (document.getElementById('password') as HTMLInputElement | null)?.value || '';
      errorEl.textContent = '';
      try {
        await handleSignup(email, password);
      } catch (err: any) {
        errorEl.textContent = err?.message || 'Sign-up failed.';
      }
    });
  }
}

// Boot: check session, then wire form
checkExistingSession()
  .then(wireLoginPage)
  .catch(() => wireLoginPage());
