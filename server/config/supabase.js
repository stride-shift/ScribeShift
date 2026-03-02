import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — database features disabled');
}

// Service role client (bypasses RLS — for server-side operations)
export const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '');

// Anon client factory (respects RLS — for user-scoped operations)
export function createUserClient(accessToken) {
  return createClient(supabaseUrl || '', supabaseAnonKey || '', {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export { supabaseUrl, supabaseAnonKey };
