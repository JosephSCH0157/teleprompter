// src/forge/reset.ts
// Password reset page wiring for /reset.
import { supabase } from './supabaseClient';

function setText(id: string, msg: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function setDisabled(form: HTMLFormElement, disabled: boolean): void {
  form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach((el) => {
    el.disabled = disabled;
  });
}

async function ensureSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) return false;
    try {
      if (location.hash) history.replaceState(null, document.title, location.pathname + location.search);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

async function handleReset(form: HTMLFormElement): Promise<void> {
  const password = (document.getElementById('new-password') as HTMLInputElement | null)?.value || '';
  const confirm = (document.getElementById('confirm-password') as HTMLInputElement | null)?.value || '';

  setText('error', '');
  setText('status', '');

  if (!password || password.length < 8) {
    setText('error', 'Please choose a password of at least 8 characters.');
    return;
  }
  if (password !== confirm) {
    setText('error', 'Passwords do not match.');
    return;
  }

  setDisabled(form, true);
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setText('error', error.message || 'Reset failed.');
      return;
    }
    setText('status', 'Password updated. Redirecting to login...');
    setTimeout(() => {
      try { window.location.href = '/login'; } catch {}
    }, 800);
  } catch (err: any) {
    setText('error', err?.message || 'Reset failed.');
  } finally {
    setDisabled(form, false);
  }
}

async function main(): Promise<void> {
  const form = document.getElementById('reset-form') as HTMLFormElement | null;
  if (!form) return;

  const ok = await ensureSession();
  if (!ok) {
    setText('error', 'Reset link is invalid or expired. Please request a new reset email.');
    setDisabled(form, true);
    return;
  }

  form.addEventListener('submit', (ev) => {
    try { ev.preventDefault(); } catch {}
    void handleReset(form);
  });
}

main().catch(() => {
  setText('error', 'Reset page failed to load. Please refresh.');
});
