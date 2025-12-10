// src/forge/account.ts
import type { User } from '@supabase/supabase-js';
import { ensureUserAndProfile, type ForgeProfile } from './authProfile';
import { supabase } from './supabaseClient';

interface AccountContext {
  user: User;
  profile: ForgeProfile;
}

function renderAccount(ctx: AccountContext) {
  const root = document.getElementById('account-details');
  if (!root) return;

  const { user, profile } = ctx;
  const email = user.email || '(no email)';
  const displayName = profile.display_name || '(no display name)';
  const tier = profile.tier || 'free';

  root.innerHTML = `
    <h2>Profile</h2>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Display name:</strong> ${displayName}</p>
    <p><strong>Plan:</strong> ${tier}</p>

    <h2>Plan & Billing</h2>
    <p>Your current plan is <strong>${tier}</strong>.</p>
    <button id="upgrade-btn" type="button">Upgrade plan (stub)</button>

    <h2>Session</h2>
    <button id="logout-btn" type="button">Log out</button>
  `;

  const logoutBtn = document.getElementById('logout-btn');
  const upgradeBtn = document.getElementById('upgrade-btn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '/login';
    });
  }

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      alert('Upgrade flow not implemented yet.');
    });
  }
}

async function main() {
  try {
    const { user, profile } = await ensureUserAndProfile();
    try { (window as any).__forgeUser = user; } catch {}
    try { (window as any).__forgeProfile = profile; } catch {}
    renderAccount({ user, profile });
  } catch (err) {
    console.error('[account] failed to load', err);
    const root = document.getElementById('account-details');
    if (root) {
      root.innerHTML = `<p>Sorry, we couldn’t load your account. Please refresh or try again later.</p>`;
    }
  }
}

main();
