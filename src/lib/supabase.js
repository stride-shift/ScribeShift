import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fhamdnjrjsoczqnleirf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoYW1kbmpyanNvY3pxbmxlaXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjE2NDYsImV4cCI6MjA4NzA5NzY0Nn0.gzpvOdTxHjpwamtSngQ0LG1TLp6XlK3o3LBSJMNuUpA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
