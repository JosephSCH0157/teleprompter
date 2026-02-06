// src/forge/login.ts
// Minimal login page wiring for the Forge /login shell (framework-agnostic).
import { supabase } from './supabaseClient';
import { ensureUserAndProfile } from './authProfile';

function getRedirectTarget(): string {
  const params = new URLSearchParams(window.location.search || '');
  return params.get('redirect') || '/anvil';
}

async function checkExistingSession(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      window.location.assign(getRedirectTarget());
    }
  } catch {
    // fall through to wiring the form
  }
}

async function handleLogin(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await ensureUserAndProfile();
  window.location.assign(getRedirectTarget());
}

async function handleSignup(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // If email confirmation is required, this may fail until confirmed; ignore for now.
  try { await ensureUserAndProfile(); } catch {}
  const msg = document.getElementById('error');
  if (msg) msg.textContent = 'Check your email to confirm your account.';
}

function getResetRedirectUrl(): string {
  const override = (window as any).__forgeResetRedirectUrl;
  if (typeof override === 'string' && override.trim()) {
    return override;
  }

  const canonicalOrigin = (window as any).__forgeAppOrigin;
  if (typeof canonicalOrigin === 'string' && canonicalOrigin.trim()) {
    try {
      return new URL('reset', canonicalOrigin).toString();
    } catch {}
  }

  try {
    return new URL('reset', window.location.origin).toString();
  } catch {}

  return '/reset';
}

async function handleForgotPassword(email: string): Promise<void> {
  if (!email) throw new Error('Enter your email to receive a reset link.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getResetRedirectUrl(),
  });
  if (error) throw error;
}

function wireLoginPage(): void {
  const form = document.getElementById('login-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('error');
  const signupBtn = document.getElementById('signup-btn');
  const forgotBtn = document.getElementById('forgot-password');

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

  if (forgotBtn && errorEl) {
    forgotBtn.addEventListener('click', async () => {
      const email = (document.getElementById('email') as HTMLInputElement | null)?.value || '';
      errorEl.textContent = '';
      try {
        await handleForgotPassword(email);
        errorEl.textContent = 'If that email exists, a reset link is on the way.';
      } catch (err: any) {
        errorEl.textContent = err?.message || 'Password reset failed.';
      }
    });
  }
}

// Boot: check session, then wire form
checkExistingSession()
  .then(wireLoginPage)
  .catch(() => wireLoginPage());
