import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultProfileV1,
  coerceProfile,
  applyProfilePatch,
  profilePatch,
  type DeepPartial,
  type TpProfileV1,
} from './profile-schema';

type TpProfilesRow = {
  user_id: string;
  version: number;
  profile: unknown;
  created_at: string;
  updated_at: string;
};

export class ProfileStore {
  private cache: TpProfileV1 | null = null;

  constructor(private supabase: SupabaseClient) {}

  async loadProfile(): Promise<TpProfileV1> {
    const user = await this.getUser();
    const userId = user.id;

    const { data, error } = await this.supabase
      .from('tp_profiles')
      .select('user_id, version, profile, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle<TpProfilesRow>();

    if (error) throw error;

    if (!data) {
      const def = defaultProfileV1();
      const { error: insErr } = await this.supabase.from('tp_profiles').insert({
        user_id: userId,
        version: def.version,
        profile: def,
      });
      if (insErr) throw insErr;

      this.cache = def;
      return def;
    }

    const coerced = coerceProfile((data.profile as any) ?? {});
    this.cache = coerced;
    return coerced;
  }

  async getProfile(): Promise<TpProfileV1> {
    return this.cache ?? this.loadProfile();
  }

  async saveProfilePatch(patch: DeepPartial<TpProfileV1>): Promise<TpProfileV1> {
    const user = await this.getUser();
    const userId = user.id;

    const current = await this.getProfile();
    const next = applyProfilePatch(current, patch);
    this.cache = next;

    const { error } = await this.supabase
      .from('tp_profiles')
      .upsert(
        {
          user_id: userId,
          version: next.version,
          profile: next,
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;
    return next;
  }

  patch(p: DeepPartial<TpProfileV1>) {
    return profilePatch(p);
  }

  private async getUser() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Not authenticated: no user.');
    return data.user;
  }
}
