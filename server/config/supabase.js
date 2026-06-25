import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  // Fail fast: a server/worker without DB credentials is non-functional. Throwing
  // here crashes the Express server and the Cloud Run worker at startup (the loud
  // failure we want); on Vercel, api/index.js's import try/catch turns it into a
  // JSON 500 rather than a silently-broken deployment.
  throw new Error('[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — cannot initialise database client');
}

// Service role client (bypasses RLS — for server-side operations). Explicit auth
// options: this is a stateless server/worker client, so disable session
// persistence, token refresh, and URL session detection (all default-on, all
// wrong for a service-role client).
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
