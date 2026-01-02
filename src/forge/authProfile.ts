// src/forge/authProfile.ts
// Ensure a logged-in user and a profile row exist; redirect to /login otherwise.
import type { User } from '@supabase/supabase-js';
import type {
  SpeakerBindingsSettings,
  SpeakerProfile,
} from '../types/speaker-profiles';
import { supabase } from './supabaseClient';

export type ForgeTier = 'free' | 'creator' | 'studio' | 'admin' | string;

export interface ForgeProfile {
  user_id: string;
  display_name: string | null;
  tier: ForgeTier;
}

export interface ForgeSessionContext {
  user: User;
  profile: ForgeProfile;
}

export type PersistedAppKey =
  | 'scrollMode'
  | 'timedSpeed'
  | 'wpmTarget'
  | 'wpmBasePx'
  | 'wpmMinPx'
  | 'wpmMaxPx'
  | 'wpmEwmaSec'
  | 'hybridAttackMs'
  | 'hybridReleaseMs'
  | 'hybridIdleMs'
  | 'stepPx'
  | 'rehearsalPunct'
  | 'rehearsalResumeMs'
  | 'micDevice'
  | 'obsEnabled'
  | 'obsScene'
  | 'obsReconnect'
  | 'obsHost'
  | 'autoRecord'
  | 'prerollSeconds'
  | 'devHud'
  | 'hudEnabledByUser'
  | 'cameraEnabled'
  | 'settingsTab'
  | 'asr.engine'
  | 'asr.language'
  | 'asr.useInterimResults'
  | 'asr.filterFillers'
  | 'asr.threshold'
  | 'asr.endpointMs'
  | 'asrProfiles'
  | 'asrActiveProfileId'
  | 'asrTuningProfiles'
  | 'asrTuningActiveProfileId';

export type UserSettings = {
  app?: Partial<Record<PersistedAppKey, any>>;
  asrSettings?: Record<string, any>;
  asrProfiles?: any[];
  speakerProfiles?: SpeakerProfile[];
  speakerBindings?: SpeakerBindingsSettings;
};

export const DEFAULT_SETTINGS: UserSettings = {
  app: {},
  asrSettings: {},
  asrProfiles: [],
  speakerProfiles: [],
  speakerBindings: { s1: null, s2: null, g1: null, g2: null, activeSlot: 's1' },
};

// tiny deep merge (safe for plain objects)
function deepMerge<T>(base: T, incoming: any): T {
  if (!incoming || typeof incoming !== 'object') return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(incoming)) {
    const v = (incoming as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export type ProfileSettingsRow = {
  user_id: string;
  settings: any;
  settings_rev: number;
  settings_updated_at: string;
  asr_settings?: Record<string, unknown>;
  asr_calibration_profiles?: unknown[];
  asr_updated_at?: string;
};

export async function loadProfileSettings(userId: string): Promise<{
  settings: UserSettings;
  rev: number;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'settings, settings_rev, asr_settings, asr_calibration_profiles, asr_updated_at',
    )
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  const baseSettings = (data as any)?.settings ?? {};
  const asrSettings = (data as any)?.asr_settings ?? {};
  const asrProfiles = (data as any)?.asr_calibration_profiles ?? [];
  const merged = deepMerge(DEFAULT_SETTINGS, {
    ...baseSettings,
    asrSettings,
    asrProfiles,
  });
  const rev = Number((data as any)?.settings_rev ?? 0);
  return { settings: merged, rev };
}

export async function saveProfileSettings(opts: {
  userId: string;
  mergedSettings: UserSettings;
  expectedRev: number;
}): Promise<{ rev: number }> {
  const { userId, mergedSettings, expectedRev } = opts;

  const asrSettings = (mergedSettings as any)?.asrSettings ?? {};
  const asrProfiles = (mergedSettings as any)?.asrProfiles ?? [];

  const { data, error } = await supabase
    .from('profiles')
    .update({
      settings: mergedSettings,
      settings_rev: expectedRev + 1,
      settings_updated_at: new Date().toISOString(),
      asr_settings: asrSettings,
      asr_calibration_profiles: asrProfiles,
      asr_updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('settings_rev', expectedRev)
    .select('settings_rev')
    .single();

  if (error) {
    throw error;
  }

  return { rev: Number((data as any)?.settings_rev ?? expectedRev + 1) };
}

export function applySettingsPatch(current: UserSettings, patch: Partial<UserSettings>): UserSettings {
  return deepMerge(current, patch);
}

function shouldBypassAuth(): boolean {
  try {
    const search = String(window.location.search || '');
    const hash = String(window.location.hash || '');
    if (search.includes('ci=1') || search.includes('uiMock=1') || search.includes('mockFolder=1')) return true;
    if (hash.includes('ci=1') || hash.includes('uiMock=1')) return true;
    if ((window as any).__TP_SKIP_AUTH === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function ensureUserAndProfile(): Promise<ForgeSessionContext> {
  const redirectTarget = window.location.pathname + window.location.search + window.location.hash;
  const loginUrl = `/login?redirect=${encodeURIComponent(redirectTarget)}`;

  if (shouldBypassAuth()) {
    const mockUser = { id: 'test-user', email: 'test@example.com' } as unknown as User;
    const mockProfile: ForgeProfile = {
      user_id: mockUser.id,
      display_name: 'Test User',
      tier: 'free',
    };
    try { (window as any).__forgeUser = mockUser; } catch {}
    try { (window as any).__forgeProfile = mockProfile; } catch {}
    return { user: mockUser, profile: mockProfile };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    window.location.assign(loginUrl);
    throw new Error('No user session; redirecting to login.');
  }

  const user = userData.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, display_name, tier')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile) {
    return { user, profile: profile as ForgeProfile };
  }

  if (profileError && (profileError as any).code !== 'PGRST116') {
    console.error('[authProfile] error fetching profile', profileError);
    throw profileError;
  }

  const defaultDisplay =
    (user.user_metadata && (user.user_metadata.full_name as string)) ||
    user.email ||
    'New user';

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      user_id: user.id,
      display_name: defaultDisplay,
      tier: 'free',
    })
    .select('user_id, display_name, tier')
    .single();

  if (insertError) {
    // If the row already exists, re-fetch it (unique constraint friendly)
    if ((insertError as any).code === '23505') {
      const { data: existing, error: refetchError } = await supabase
        .from('profiles')
        .select('user_id, display_name, tier')
        .eq('user_id', user.id)
        .single();
      if (refetchError) throw refetchError;
      return { user, profile: existing as ForgeProfile };
    }
    console.error('[authProfile] error creating default profile', insertError);
    throw insertError;
  }

  return { user, profile: inserted as ForgeProfile };
}
