// src/forge/supabaseClient.ts
// Shared Supabase client for Forge / Anvil surfaces.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Prefer window-provided values; fall back to import.meta.env if available.
const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;
const meta = (typeof import.meta !== 'undefined' ? (import.meta as any) : {}) as any;
const metaEnv = meta.env || {};

const SUPABASE_URL: string =
  w.__forgeSupabaseUrl ||
  metaEnv.VITE_SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY: string =
  w.__forgeSupabaseAnonKey ||
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  try { console.error('[supabaseClient] Missing Supabase URL or anon key.'); } catch {}
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
  },
});
