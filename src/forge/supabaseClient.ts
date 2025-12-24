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

export let hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function createSupabaseStub(reason: string): SupabaseClient {
  const handler: ProxyHandler<any> = {
    get() {
      return new Proxy(() => { throw new Error(reason); }, handler);
    },
    apply() {
      throw new Error(reason);
    },
  };
  return new Proxy(() => { throw new Error(reason); }, handler) as SupabaseClient;
}

if (!hasSupabaseConfig) {
  try { console.error('[supabaseClient] Missing Supabase URL or anon key.'); } catch {}
}

let supabaseClient: SupabaseClient | null = null;

if (hasSupabaseConfig) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    hasSupabaseConfig = false;
    try { console.error('[supabaseClient] Failed to init Supabase client.', err); } catch {}
  }
}

export const supabase: SupabaseClient =
  supabaseClient || createSupabaseStub('[supabaseClient] Supabase not configured.');
