/**
 * Browser-side Supabase client. Used only for the OAuth handshake (Google
 * sign-in) and for reading the session tokens off the redirect URL fragment
 * inside /auth/callback. Everything else — recognize, enrol, memory reads —
 * still routes through the Flask backend using the JWT stored in
 * localStorage by auth-context.tsx.
 *
 * Anon key is public by design (RLS on every table enforces isolation).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL   = process.env.NEXT_PUBLIC_SUPABASE_URL   || '';
const ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!URL || !ANON) return null;
  if (_client) return _client;
  _client = createClient(URL, ANON, {
    auth: {
      persistSession:     false, // AuthContext owns storage
      autoRefreshToken:   false, // backend refresh flow handles this
      detectSessionInUrl: false, // /auth/callback parses the URL explicitly
      flowType: 'pkce',
    },
  });
  return _client;
}

export function isOAuthConfigured(): boolean {
  return Boolean(URL && ANON);
}
