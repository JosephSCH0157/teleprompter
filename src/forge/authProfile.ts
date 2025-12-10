// src/forge/authProfile.ts
// Ensure a logged-in user and a profile row exist; redirect to /login otherwise.
import type { User } from '@supabase/supabase-js';
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

export async function ensureUserAndProfile(): Promise<ForgeSessionContext> {
  const redirectTarget = window.location.pathname + window.location.search;
  const loginUrl = `/login?redirect=${encodeURIComponent(redirectTarget)}`;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    window.location.href = loginUrl;
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
