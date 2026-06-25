import { createClient } from '@supabase/supabase-js';

// No hardcoded fallbacks: the URL and anon key must come from env (.env locally,
// Vercel env vars in prod). Baking real credentials in as defaults leaks the
// project ref into the bundle/git and silently masks a missing-config mistake.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — set them in your environment.');
}

// Defaults intentional: persistSession / autoRefreshToken / detectSessionInUrl are
// all on by default and correct for the browser — AuthProvider relies on them
// (setSession, getSession, onAuthStateChange). Do not disable them here.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
