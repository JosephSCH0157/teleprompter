import type { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '../forge/supabaseClient';
import { appStore } from '../state/app-store';
import { setSessionPhase } from '../state/session';
import { showToast } from '../ui/toasts';

const TRIAL_LIMIT_MS = 5 * 60 * 1000;
const LOGIN_PATH = '/login.html';
const SESSION_CACHE_KEYS = ['forge_profile_cache', 'forge_user_cache'];

let initialized = false;
let currentSession: Session | null = null;
let trialLocked = false;
let liveStartedAt = 0;
let trialTimerId: number | null = null;
let trialChannel: BroadcastChannel | null = null;

function getRedirectTarget(): string {
  try {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  } catch {
    return '/teleprompter_pro.html';
  }
}

function buildLoginHref(): string {
  const target = encodeURIComponent(getRedirectTarget());
  return `${LOGIN_PATH}?redirect=${target}&return=${target}`;
}

function pickDisplayName(session: Session | null): string {
  const user = session?.user;
  if (!user) return 'Signed out';
  const metaName =
    (user.user_metadata?.display_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined);
  return (metaName && metaName.trim()) || user.email || 'Unknown';
}

function isAuthed(): boolean {
  return !!currentSession?.user;
}

function ensureTrialChannel(): BroadcastChannel | null {
  if (trialChannel) return trialChannel;
  try {
    trialChannel = new BroadcastChannel('tp_display');
  } catch {
    trialChannel = null;
  }
  return trialChannel;
}

function pushTrialStateToDisplay(): void {
  const payload = { type: 'tp:trial', kind: 'tp:trial', on: !isAuthed() };
  try { (window as any).__tpDisplay?.sendToDisplay?.(payload); } catch {}
  try { ensureTrialChannel()?.postMessage(payload as any); } catch {}
}

function syncTrialClass(): void {
  try {
    const on = !isAuthed();
    document.body.classList.toggle('mode-trial', on);
    (window as any).__TP_TRIAL = on;
  } catch {}
  pushTrialStateToDisplay();
}

function syncIronMineUi(): void {
  const tab = document.getElementById('ironMineTab') as HTMLButtonElement | null;
  if (!tab) return;
  const enabled = isAuthed();
  try { (window as any).__tpCanOpenIronMine = enabled; } catch {}
  tab.hidden = !enabled;
  tab.disabled = !enabled;
  tab.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  tab.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function syncAuthHeader(): void {
  const whoami = document.getElementById('whoamiChip') as HTMLElement | null;
  const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement | null;
  const loginLink = document.getElementById('loginLink') as HTMLAnchorElement | null;
  const authed = isAuthed();

  if (loginLink) {
    loginLink.href = buildLoginHref();
    loginLink.hidden = authed;
  }
  if (whoami) {
    whoami.hidden = !authed;
    whoami.textContent = authed ? `Logged in as ${pickDisplayName(currentSession)}` : '';
  }
  if (logoutBtn) {
    logoutBtn.hidden = !authed;
    if (!logoutBtn.dataset.authWired) {
      logoutBtn.dataset.authWired = '1';
      logoutBtn.addEventListener('click', () => {
        void signOutCurrentUser(logoutBtn);
      });
    }
  }
}

function stopTrialTimer(): void {
  if (trialTimerId == null) return;
  try { window.clearInterval(trialTimerId); } catch {}
  trialTimerId = null;
}

function syncTrialLockUi(): void {
  const recBtn = document.getElementById('recBtn') as HTMLButtonElement | null;
  if (!recBtn) return;
  const locked = !isAuthed() && trialLocked;
  if (locked) {
    if (!recBtn.dataset.trialPrevText) {
      recBtn.dataset.trialPrevText = recBtn.textContent || 'Start speech sync';
    }
    recBtn.dataset.trialLocked = '1';
    recBtn.disabled = true;
    recBtn.textContent = 'Trial limit reached';
    recBtn.title = 'Trial limit reached. Reset timer or log in.';
    return;
  }
  if (recBtn.dataset.trialLocked === '1') {
    recBtn.dataset.trialLocked = '0';
    recBtn.disabled = false;
    recBtn.textContent = recBtn.dataset.trialPrevText || 'Start speech sync';
    recBtn.title = 'Start speech sync';
  }
}

function forceStopSessionForTrial(): void {
  try {
    window.dispatchEvent(
      new CustomEvent('tp:auto:intent', { detail: { enabled: false, reason: 'trial-limit' } }),
    );
  } catch {}
  try {
    setSessionPhase('wrap');
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent('tp:session:stop', {
        detail: { source: 'trial-limit', reason: 'trial-limit', intentSource: 'trial' },
      }),
    );
  } catch {}
}

function maybeTriggerTrialLimit(): void {
  if (isAuthed() || trialLocked || !liveStartedAt) return;
  const elapsed = Date.now() - liveStartedAt;
  if (elapsed < TRIAL_LIMIT_MS) return;
  trialLocked = true;
  stopTrialTimer();
  forceStopSessionForTrial();
  syncTrialLockUi();
  try { window.setTimeout(() => syncTrialLockUi(), 0); } catch {}
  try { window.setTimeout(() => syncTrialLockUi(), 200); } catch {}
  try { window.setTimeout(() => syncTrialLockUi(), 800); } catch {}
  showToast('Trial limit reached - log in to record longer.', {
    type: 'warning',
    timeoutMs: 6000,
  });
}

function startTrialTimer(): void {
  if (trialTimerId) return;
  trialTimerId = window.setInterval(() => {
    maybeTriggerTrialLimit();
  }, 250);
}

function unlockTrialControls(): void {
  trialLocked = false;
  liveStartedAt = 0;
  stopTrialTimer();
  syncTrialLockUi();
}

function clearTrialLimit(): void {
  if (isAuthed()) return;
  trialLocked = false;
  liveStartedAt = 0;
  stopTrialTimer();
  syncTrialLockUi();
  try { setSessionPhase('idle'); } catch {}
}

function onSessionPhaseChange(phaseRaw?: string): void {
  const phase = String(phaseRaw || appStore.get('session.phase') || 'idle').toLowerCase();
  if (isAuthed()) {
    liveStartedAt = 0;
    stopTrialTimer();
    syncTrialLockUi();
    return;
  }
  if (phase === 'live') {
    if (trialLocked) {
      forceStopSessionForTrial();
      syncTrialLockUi();
      return;
    }
    if (!liveStartedAt) liveStartedAt = Date.now();
    startTrialTimer();
    maybeTriggerTrialLimit();
    return;
  }
  stopTrialTimer();
  if (phase === 'idle' || phase === 'wrap') {
    liveStartedAt = 0;
  }
  syncTrialLockUi();
}

function wireTrialGuards(): void {
  const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement | null;
  if (resetBtn && !resetBtn.dataset.trialResetWired) {
    resetBtn.dataset.trialResetWired = '1';
    resetBtn.addEventListener('click', () => {
      clearTrialLimit();
    });
  }

  if (!(window as any).__tpTrialRecGuardWired) {
    (window as any).__tpTrialRecGuardWired = true;
    document.addEventListener(
      'click',
      (ev) => {
        if (!trialLocked || isAuthed()) return;
        const target = ev.target as HTMLElement | null;
        const recBtn = target?.closest('#recBtn');
        if (!recBtn) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
          (ev as any).stopImmediatePropagation?.();
        } catch {}
        showToast('Trial limit reached - reset timer or log in to continue.', {
          type: 'warning',
          timeoutMs: 4500,
        });
      },
      true,
    );
  }

  try {
    window.addEventListener('tp:script:reset', () => clearTrialLimit(), { passive: true });
  } catch {}
  try {
    window.addEventListener('tp:speech-state', () => syncTrialLockUi(), { passive: true });
  } catch {}
  try {
    window.addEventListener('tp:display:opened', () => pushTrialStateToDisplay(), { passive: true });
  } catch {}
}

async function signOutCurrentUser(btn?: HTMLButtonElement | null): Promise<void> {
  const fallbackText = btn?.textContent || 'Log out';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing out...';
  }
  try {
    if (hasSupabaseConfig) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    try { console.error('[auth-unlock] signOut failed', err); } catch {}
  } finally {
    try {
      SESSION_CACHE_KEYS.forEach((key) => {
        try { localStorage.removeItem(key); } catch {}
      });
    } catch {}
    if (btn) {
      btn.disabled = false;
      btn.textContent = fallbackText;
    }
    applyAuthState(null);
  }
}

function applyAuthState(session: Session | null): void {
  currentSession = session;
  if (isAuthed()) {
    // Explicitly clear trial runtime state when auth flips on mid-session.
    unlockTrialControls();
  }
  syncAuthHeader();
  syncIronMineUi();
  syncTrialClass();
  onSessionPhaseChange();
}

async function loadInitialAuthState(): Promise<void> {
  if (!hasSupabaseConfig) {
    applyAuthState(null);
    return;
  }

  applyAuthState(null);
  try {
    const { data } = await supabase.auth.getSession();
    applyAuthState(data.session ?? null);
  } catch {
    applyAuthState(null);
  }

  try {
    supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthState(session ?? null);
    });
  } catch {}
}

export function initAuthUnlock(): void {
  if (initialized) return;
  initialized = true;

  wireTrialGuards();
  try {
    appStore.subscribe('session.phase', (phase) => {
      onSessionPhaseChange(String(phase || 'idle'));
    });
  } catch {}
  try {
    window.addEventListener('tp:session:phase', (ev) => {
      const phase = (ev as CustomEvent)?.detail?.phase;
      onSessionPhaseChange(String(phase || 'idle'));
    });
  } catch {}

  void loadInitialAuthState();
}
