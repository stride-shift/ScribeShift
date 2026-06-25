import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken, requireRole, invalidateUserCache } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';
import { inviteEmail } from '../templates/emails.js';

const router = Router();

// All admin routes require authentication
router.use(verifyToken);

// ── Invitations (invite-only signup) ────────────────────────────────
// List pending invitations. Admins see only their company's; super_admins all.
router.get('/invitations', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    let query = supabase
      .from('invitations')
      .select('*, companies(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (req.user.role === 'admin') query = query.eq('company_id', req.user.company_id);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ invitations: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list invitations' });
  }
});

// Create (or refresh) an invitation for an email.
router.post('/invitations', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    const allowedRoles = ['user', 'admin', 'super_admin'];
    let role = allowedRoles.includes(req.body?.role) ? req.body.role : 'user';
    let company_id = req.body?.company_id || null;

    // Admins can only invite into their own company and can't mint super_admins.
    if (req.user.role === 'admin') {
      company_id = req.user.company_id;
      if (role === 'super_admin') role = 'admin';
    }

    // Already a user? Don't issue an invite.
    const { data: existingUser } = await supabase
      .from('users').select('id').ilike('email', email).maybeSingle();
    if (existingUser) return res.status(409).json({ error: 'That email already has an account.' });

    // Upsert the pending invite (unique on lower(email) where pending).
    const { data: existing } = await supabase
      .from('invitations').select('id').eq('status', 'pending').eq('email', email).maybeSingle();

    let invitation;
    if (existing) {
      const { data, error } = await supabase
        .from('invitations')
        .update({ role, company_id, invited_by: req.user.id })
        .eq('id', existing.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      invitation = data;
    } else {
      const { data, error } = await supabase
        .from('invitations')
        .insert({ email, role, company_id, invited_by: req.user.id })
        .select().single();
      if (error) return res.status(400).json({ error: error.message });
      invitation = data;
    }

    // Best-effort invite email — never block the response on it.
    try {
      let companyName = null;
      if (company_id) {
        const { data: co } = await supabase.from('companies').select('name').eq('id', company_id).single();
        companyName = co?.name || null;
      }
      const { subject, html, attachments } = inviteEmail({
        inviterName: req.user.full_name || req.user.email,
        companyName,
      });
      await sendEmail({ to: email, subject, html, attachments });
    } catch (mailErr) {
      console.warn('[ADMIN] Invite email failed (invite still created):', mailErr.message);
    }

    res.json({ invitation });
  } catch (err) {
    console.error('[ADMIN] Create invitation error:', err);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// Revoke a pending invitation.
router.delete('/invitations/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    let query = supabase
      .from('invitations').update({ status: 'revoked' }).eq('id', req.params.id);
    if (req.user.role === 'admin') query = query.eq('company_id', req.user.company_id);
    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

// ── GET /api/admin/users ────────────────────────────────────────────
// Admin: list company users / Super Admin: list all users
router.get('/users', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let query = supabase
      .from('users')
      .select('*, companies(name, slug)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role === 'admin') {
      query = query.eq('company_id', req.user.company_id);
    }

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ users: data, total: count, limit, offset });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── POST /api/admin/users ─────────────────────────────────────────────
// Super admin only: Create a new user account
router.post('/users', requireRole('super_admin'), async (req, res) => {
  try {
    const { email, password, full_name, role, company_id, is_active } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const allowedRoles = ['user', 'admin', 'super_admin'];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Use: ${allowedRoles.join(', ')}` });
    }

    if (company_id) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('id', company_id)
        .single();

      if (companyError || !company) {
        return res.status(400).json({ error: 'Company not found' });
      }
    }

    // Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name: full_name || '',
        role: role || 'user',
        company_id: company_id || null,
        is_active: is_active !== false,
      })
      .select('*, companies(name, slug)')
      .single();

    if (profileError) {
      console.error('[ADMIN] Profile creation error:', profileError.message);
      try { await supabase.auth.admin.deleteUser(authData.user.id); } catch {}
      return res.status(400).json({ error: `Failed to create user profile: ${profileError.message}` });
    }

    res.json({ user: profile });
  } catch (err) {
    console.error('[ADMIN] Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ── PUT /api/admin/users/:id/role ───────────────────────────────────
router.put('/users/:id/role', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const targetId = req.params.id;

    // Only super_admin can assign super_admin role
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can assign super_admin role' });
    }

    // Admins can only manage users in their company
    if (req.user.role === 'admin') {
      const { data: targetUser } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', targetId)
        .single();

      if (!targetUser || targetUser.company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Cannot manage users outside your company' });
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', targetId);

    if (error) return res.status(400).json({ error: error.message });
    invalidateUserCache(targetId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ── PUT /api/admin/users/:id/active ─────────────────────────────────
router.put('/users/:id/active', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { is_active } = req.body;
    const targetId = req.params.id;

    // Don't allow deactivating yourself
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    // Admins can only manage users in their company
    if (req.user.role === 'admin') {
      const { data: targetUser } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', targetId)
        .single();

      if (!targetUser || targetUser.company_id !== req.user.company_id) {
        return res.status(403).json({ error: 'Cannot manage users outside your company' });
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ is_active })
      .eq('id', targetId);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// ── PUT /api/admin/users/:id ───────────────────────────────────────
// Super admin: update user profile fields
router.put('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { full_name, email, company_id, role, is_active } = req.body;
    const targetId = req.params.id;

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot edit yourself from admin panel' });
    }

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (email !== undefined) updates.email = email;
    if (company_id !== undefined) updates.company_id = company_id || null;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', targetId)
      .select('*, companies(name, slug)')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // If email changed, update auth user too
    if (email !== undefined) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(targetId, { email });
      if (authUpdateError) {
        return res.status(500).json({ error: `Failed to update auth email: ${authUpdateError.message}` });
      }
    }

    invalidateUserCache(targetId);
    res.json({ user: data });
  } catch (err) {
    console.error('[ADMIN] Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────
// Super admin: delete a user account
router.delete('/users/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const targetId = req.params.id;

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Delete from users table first
    const { error: profileError } = await supabase
      .from('users')
      .delete()
      .eq('id', targetId);

    if (profileError) return res.status(400).json({ error: profileError.message });

    // Delete from Supabase Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(targetId);
    if (authError) {
      console.error('[ADMIN] Auth deletion error (profile already removed):', authError.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN] Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Default brand-count limit per plan, mirrored from server/routes/brands.js.
// Keep these in sync — the brands route enforces them and admin UI displays them.
const PLAN_BRAND_LIMITS = {
  free: 1,
  starter: 3,
  agency: 10,
  enterprise: 50,
};

// ── GET /api/admin/companies ────────────────────────────────────────
// Includes a `brand_count` and resolved `effective_brand_limit` per row so
// the super-admin UI can show "X / Y brands used" without N+1 queries.
router.get('/companies', requireRole('super_admin'), async (req, res) => {
  try {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // One grouped count query for all brands at once
    const { data: brandRows } = await supabase
      .from('brands')
      .select('company_id');

    const counts = new Map();
    for (const b of brandRows || []) {
      if (!b.company_id) continue;
      counts.set(b.company_id, (counts.get(b.company_id) || 0) + 1);
    }

    const enriched = (companies || []).map(c => ({
      ...c,
      brand_count: counts.get(c.id) || 0,
      effective_brand_limit:
        typeof c.max_brands === 'number'
          ? c.max_brands
          : (PLAN_BRAND_LIMITS[c.plan] ?? PLAN_BRAND_LIMITS.free),
      plan_brand_limit: PLAN_BRAND_LIMITS[c.plan] ?? PLAN_BRAND_LIMITS.free,
    }));

    res.json({ companies: enriched, plan_limits: PLAN_BRAND_LIMITS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// ── POST /api/admin/companies ───────────────────────────────────────
router.post('/companies', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, plan, credit_balance, credit_monthly_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const { data, error } = await supabase
      .from('companies')
      .insert({
        name,
        slug,
        plan: plan || 'free',
        credit_balance: credit_balance || 100,
        credit_monthly_limit: credit_monthly_limit || 100,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ company: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// ── PUT /api/admin/companies/:id ────────────────────────────────────
router.put('/companies/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, plan, credit_balance, credit_monthly_limit, logo_url, max_brands } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (plan !== undefined) updates.plan = plan;
    if (credit_balance !== undefined) updates.credit_balance = credit_balance;
    if (credit_monthly_limit !== undefined) updates.credit_monthly_limit = credit_monthly_limit;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    // null = clear override (fall back to plan default), number = explicit cap
    if (max_brands !== undefined) updates.max_brands = max_brands;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// ── DELETE /api/admin/companies/:id ────────────────────────────────
router.delete('/companies/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const companyId = req.params.id;

    // Check if company has users
    const { data: companyUsers, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);

    if (usersError) return res.status(400).json({ error: usersError.message });

    if (companyUsers && companyUsers.length > 0) {
      return res.status(400).json({ error: 'Cannot delete company with existing users. Remove or reassign users first.' });
    }

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN] Delete company error:', err);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// ── POST /api/admin/companies/:id/add-credits ─────────────────────
router.post('/companies/:id/add-credits', requireRole('super_admin'), async (req, res) => {
  try {
    const { amount } = req.body;
    const companyId = req.params.id;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Fetch current balance
    const { data: company, error: fetchError } = await supabase
      .from('companies')
      .select('credit_balance, name')
      .eq('id', companyId)
      .single();

    if (fetchError || !company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const newBalance = company.credit_balance + amount;

    const { error: updateError } = await supabase
      .from('companies')
      .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', companyId);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    console.log(`[ADMIN] Added ${amount} credits to "${company.name}" (${company.credit_balance} → ${newBalance})`);
    res.json({ success: true, previous_balance: company.credit_balance, new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add credits' });
  }
});

// ── GET /api/admin/usage ────────────────────────────────────────────
router.get('/usage', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = supabase
      .from('usage_logs')
      .select('*, users(email, full_name, company_id), companies(name, plan)')
      .order('created_at', { ascending: false })
      .limit(500);

    if (req.user.role === 'admin') {
      query = query.eq('company_id', req.user.company_id);
    }

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ usage: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// ── GET /api/admin/usage/credits ────────────────────────────────────
router.get('/usage/credits', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    let query = supabase
      .from('usage_logs')
      .select('user_id, company_id, action, credits_used, created_at');

    if (req.user.role === 'admin') {
      query = query.eq('company_id', req.user.company_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(1000);
    if (error) return res.status(400).json({ error: error.message });

    // Aggregate by user
    const byUser = {};
    for (const log of data) {
      if (!byUser[log.user_id]) byUser[log.user_id] = { total: 0, actions: {} };
      byUser[log.user_id].total += log.credits_used;
      byUser[log.user_id].actions[log.action] = (byUser[log.user_id].actions[log.action] || 0) + log.credits_used;
    }

    res.json({ credits: byUser, raw: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch credit usage' });
  }
});

export default router;
