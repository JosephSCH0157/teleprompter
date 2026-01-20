import { applyScript } from './apply-script';
import { buildWelcomeScript } from '../welcome-script';
import { hasSupabaseConfig, supabase } from '../forge/supabaseClient';
import { ProfileStore } from '../profile/profile-store';
import type { TpProfileV1 } from '../profile/profile-schema';

const LOCAL_STORAGE_KEY = 'tp_welcome_seen_v1';
let welcomeCheckRun = false;

type WelcomeState = {
  seen: boolean;
  displayName: string;
  markSeen: () => Promise<void>;
};

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
  if (hasSupabaseConfig) {
    try {
      const store = new ProfileStore(supabase);
      const profile = await store.getProfile();
      const name = resolveFallbackDisplayName(profile);
      const seen = Boolean(profile.workflow?.hasSeenWelcome);
      return {
        seen,
        displayName: name,
        markSeen: async () => {
          if (profile.workflow?.hasSeenWelcome) return;
          try {
            await store.saveProfilePatch({ workflow: { hasSeenWelcome: true } });
            profile.workflow.hasSeenWelcome = true;
          } catch {
            // ignore patch failures
          }
        },
      };
    } catch {
      // fall through to local storage fallback
    }
  }
  const fallbackDisplay = resolveFallbackDisplayName(null);
  const seen = readLocalStorageFlag();
  return {
    seen,
    displayName: fallbackDisplay,
    markSeen: async () => {
      writeLocalStorageFlag();
    },
  };
}

function isScriptEmpty(): boolean {
  try {
    const existing = (window as any).__tpRawScript;
    if (typeof existing === 'string' && existing.trim()) return false;
    const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
    if (editor && typeof editor.value === 'string' && editor.value.trim()) return false;
  } catch {
    // ignore
  }
  return true;
}

export async function ensureWelcomeScript(): Promise<void> {
  if (welcomeCheckRun) return;
  welcomeCheckRun = true;
  if (typeof document === 'undefined') return;
  if (!isScriptEmpty()) return;

  try {
    const state = await resolveWelcomeState();
    if (state.seen) return;
    const script = buildWelcomeScript(state.displayName);
    applyScript(script, 'welcome', { updateEditor: true });
    await state.markSeen();
  } catch {
    // swallow errors to avoid blocking boot
  }
}
