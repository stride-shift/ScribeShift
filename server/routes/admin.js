import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication
router.use(verifyToken);

// ── GET /api/admin/users ────────────────────────────────────────────
// Admin: list company users / Super Admin: list all users
router.get('/users', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    let query = supabase
      .from('users')
      .select('*, companies(name, slug)')
      .order('created_at', { ascending: false });

    if (req.user.role === 'admin') {
      query = query.eq('company_id', req.user.company_id);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ users: data });
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

// ── GET /api/admin/companies ────────────────────────────────────────
router.get('/companies', requireRole('super_admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ companies: data });
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
    const { name, plan, credit_balance, credit_monthly_limit, logo_url } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (plan !== undefined) updates.plan = plan;
    if (credit_balance !== undefined) updates.credit_balance = credit_balance;
    if (credit_monthly_limit !== undefined) updates.credit_monthly_limit = credit_monthly_limit;
    if (logo_url !== undefined) updates.logo_url = logo_url;
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
