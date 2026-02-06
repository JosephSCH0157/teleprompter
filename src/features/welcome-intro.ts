import { applyScript } from './apply-script';
import { buildWelcomeScript } from '../welcome-script';
import { hasSupabaseConfig, supabase } from '../forge/supabaseClient';
import { ProfileStore } from '../profile/profile-store';
import type { TpProfileV1 } from '../profile/profile-schema';

const LOCAL_STORAGE_KEY = 'tp_welcome_seen_v1';
const LAST_USER_KEY = 'tp_last_user_id_v1';
const SCRIPT_STORAGE_KEYS = [
  'tp_local_scripts_v1',
  'tp_last_script_title',
  'tp_last_script_name',
  'tp_scripts_v1',
];
let welcomeCheckInFlight = false;
let welcomeCheckDone = false;

function isDevMode(): boolean {
  try {
    const w = window as any;
    if (w?.__TP_DEV_MODE === true) return true;
    if (window.localStorage.getItem('tp_dev_mode') === '1') return true;
    const href = String(window.location?.href ?? '');
    if (href.includes('?dev=1') || href.includes('&dev=1') || href.includes('#dev')) return true;
  } catch {}
  return false;
}

type WelcomeState = {
  seen: boolean;
  displayName: string;
  markSeen: () => Promise<void>;
};

async function ensureUserStorageFresh(): Promise<void> {
  if (!hasSupabaseConfig) return;
  if (typeof window === 'undefined') return;
  try {
    const { data, error } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (!userId || error) return;
    const storage = window.localStorage;
    const lastId = storage.getItem(LAST_USER_KEY);
    if (lastId && lastId !== userId) {
      const keysToClear = [...SCRIPT_STORAGE_KEYS, LOCAL_STORAGE_KEY];
      keysToClear.forEach((key) => {
        try {
          storage.removeItem(key);
        } catch {
          // ignore
        }
      });
    }
    if (storage.getItem(LAST_USER_KEY) !== userId) {
      try {
        storage.setItem(LAST_USER_KEY, userId);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore auth failures (let other guards run)
  }
}

function waitForScriptStabilization(timeoutMs = 220): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        window.removeEventListener('tp:script:rendered', handler);
      } catch {}
      try {
        window.removeEventListener('tp:script-rendered', handler);
      } catch {}
      resolve();
    };
    const handler = () => finish();
    try {
      window.addEventListener('tp:script:rendered', handler);
    } catch {}
    try {
      window.addEventListener('tp:script-rendered', handler);
    } catch {}
    timer = setTimeout(finish, Math.max(0, timeoutMs));
  });
}

function waitForEditorReady(timeoutMs = 1500): Promise<HTMLTextAreaElement | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (el) return resolve(el);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function normalizeScriptText(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^\uFEFF+/, '').trim();
}

function isTextPlaceholder(value: string, placeholder: string | null): boolean {
  if (!placeholder) return false;
  const normalizedPlaceholder = normalizeScriptText(placeholder);
  return normalizedPlaceholder.length > 0 && value === normalizedPlaceholder;
}

function captureEditorSnapshot() {
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const placeholder = editor?.getAttribute('placeholder') ?? null;
  const normalizedPlaceholder = normalizeScriptText(placeholder);
  const rawScript = normalizeScriptText((window as any).__tpRawScript);
  const editorValue = normalizeScriptText(editor?.value);
  const hasRawContent = rawScript.length > 0;
  const hasEditorContent = editorValue.length > 0 && !isTextPlaceholder(editorValue, normalizedPlaceholder);
  return {
    isEmpty: !hasRawContent && !hasEditorContent,
    text: hasRawContent ? rawScript : hasEditorContent ? editorValue : '',
    placeholder: normalizedPlaceholder,
  };
}

function readLocalStorageFlag(): boolean {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

function writeLocalStorageFlag(): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, '1');
  } catch {
    // ignore storage failures
  }
}

function resolveFallbackDisplayName(profile: TpProfileV1 | null): string {
  const fromIdentity = profile?.identity?.displayName?.trim();
  if (fromIdentity) return fromIdentity;
  const fromId = profile?.identity?.userId?.trim();
  if (fromId) return fromId;
  const forgeProfile = (window as any).__forgeProfile;
  if (forgeProfile?.display_name) return String(forgeProfile.display_name);
  const forgeUser = (window as any).__forgeUser;
  if (forgeUser?.email) return String(forgeUser.email);
  return 'there';
}

async function resolveWelcomeState(): Promise<WelcomeState> {
  const fallbackDisplay = resolveFallbackDisplayName(null);
  const localSeen = readLocalStorageFlag();
  if (hasSupabaseConfig) {
    try {
      const store = new ProfileStore(supabase);
      const profile = await store.getProfile();
      const name = resolveFallbackDisplayName(profile) || fallbackDisplay;
      const hasSupabaseValue = profile.workflow && typeof profile.workflow.hasSeenWelcome === 'boolean';
      const supabaseFlag = profile.workflow?.hasSeenWelcome;
      return {
        seen: hasSupabaseValue ? supabaseFlag : localSeen,
        displayName: name,
        markSeen: async () => {
          writeLocalStorageFlag();
          if (profile.workflow?.hasSeenWelcome) return;
          try {
            await store.saveProfilePatch({ workflow: { hasSeenWelcome: true } });
            profile.workflow = { ...(profile.workflow ?? {}), hasSeenWelcome: true };
          } catch (err) {
            console.warn('[welcome-intro] failed to persist hasSeenWelcome', err);
          }
        },
      };
    } catch (err) {
      console.warn('[welcome-intro] unable to fetch profile for welcome script', err);
    }
  }
  return {
    seen: localSeen,
    displayName: fallbackDisplay,
    markSeen: async () => {
      writeLocalStorageFlag();
    },
  };
}

export async function ensureWelcomeScript(): Promise<void> {
  if (welcomeCheckDone) return;
  if (welcomeCheckInFlight) return;
  if (typeof document === 'undefined') return;
  if ((window as any).__TP_FORCE_DISPLAY) return;
  welcomeCheckInFlight = true;

  try {
    const editor = await waitForEditorReady(2000);
    if (!editor) return;

    if (hasSupabaseConfig) {
      await ensureUserStorageFresh();
    }

    const initialSnapshot = captureEditorSnapshot();
    if (!initialSnapshot.isEmpty) {
      welcomeCheckDone = true;
      return;
    }

    await waitForScriptStabilization(1200);

    const state = await resolveWelcomeState();
    if (state.seen) {
      welcomeCheckDone = true;
      return;
    }

    const beforeApplySnapshot = captureEditorSnapshot();
    if (!beforeApplySnapshot.isEmpty) {
      welcomeCheckDone = true;
      return;
    }

    const script = buildWelcomeScript(state.displayName);
    applyScript(script, 'load', { updateEditor: true });
    await state.markSeen();
    welcomeCheckDone = true;
  } catch {
    // swallow errors to avoid blocking boot
  } finally {
    welcomeCheckInFlight = false;
  }
}

export async function devResetWelcomeSeen(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isDevMode()) {
    console.warn('[welcome-intro] devResetWelcomeSeen blocked (not in dev mode)');
    return;
  }

  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {}

  try {
    [...SCRIPT_STORAGE_KEYS].forEach((key) => window.localStorage.removeItem(key));
  } catch {}

  if (hasSupabaseConfig) {
    try {
      const store = new ProfileStore(supabase);
      await store.saveProfilePatch({ workflow: { hasSeenWelcome: false } });
      console.log('[welcome-intro] devResetWelcomeSeen: profile.workflow.hasSeenWelcome=false');
    } catch (err) {
      console.warn('[welcome-intro] devResetWelcomeSeen: failed to patch profile', err);
    }
  }

  welcomeCheckDone = false;
  welcomeCheckInFlight = false;
}

try {
  if (typeof window !== 'undefined' && isDevMode()) {
    (window as any).__tpDevResetWelcome = devResetWelcomeSeen;
  }
} catch {}
