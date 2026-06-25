// Invite-only gate helpers. A new account can only be provisioned when a
// pending invitation exists for its email (or an admin created the user
// directly via the admin route). Used by both sign-in paths:
//   - verifyToken middleware (first-time Google OAuth sign-in)
//   - POST /api/auth/signup (email + password)

import { supabase } from '../config/supabase.js';

// Return the pending invitation for an email, or null. Email match is
// case-insensitive (invites are stored lowercased).
export async function findPendingInvite(email) {
  if (!email) return null;
  const { data } = await supabase
    .from('invitations')
    .select('*')
    .eq('status', 'pending')
    .eq('email', String(email).toLowerCase())
    .maybeSingle();
  return data || null;
}

// Mark an invitation accepted once the profile has been created.
export async function acceptInvite(id) {
  if (!id) return;
  try {
    await supabase
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', id);
  } catch (err) {
    console.warn('[INVITES] Failed to mark invite accepted:', err.message);
  }
}
