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
let welcomeCheckRun = false;

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
  if (welcomeCheckRun) return;
  if (typeof document === 'undefined') return;
  if ((window as any).__TP_FORCE_DISPLAY) return;
  welcomeCheckRun = true;

  if (hasSupabaseConfig) {
    await ensureUserStorageFresh();
  }

  const initialSnapshot = captureEditorSnapshot();
  if (!initialSnapshot.isEmpty) return;

  await waitForScriptStabilization();

  try {
    const state = await resolveWelcomeState();
    if (state.seen) return;

    const beforeApplySnapshot = captureEditorSnapshot();
    if (!beforeApplySnapshot.isEmpty) return;

    const script = buildWelcomeScript(state.displayName);
    applyScript(script, 'load', { updateEditor: true });
    await state.markSeen();
  } catch {
    // swallow errors to avoid blocking boot
  }
}
