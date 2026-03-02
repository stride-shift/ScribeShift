import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// ── POST /api/auth/signup ───────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, companyName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
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

    // Create or find company
    let companyId = null;
    if (companyName) {
      const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', slug)
        .single();

      if (existing) {
        companyId = existing.id;
      } else {
        const { data: newCompany, error: companyError } = await supabase
          .from('companies')
          .insert({ name: companyName, slug })
          .select('id')
          .single();

        if (companyError) {
          console.error('[AUTH] Company creation error:', companyError.message);
        } else {
          companyId = newCompany.id;
        }
      }
    }

    // Create user profile
    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      email,
      full_name: fullName || '',
      role: 'user',
      company_id: companyId,
    });

    if (profileError) {
      console.error('[AUTH] Profile creation error:', profileError.message);
    }

    // Sign in to get a session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return res.status(400).json({ error: signInError.message });
    }

    res.json({
      user: {
        id: authData.user.id,
        email,
        full_name: fullName || '',
        role: 'user',
        company_id: companyId,
      },
      session: signInData.session,
    });
  } catch (err) {
    console.error('[AUTH] Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from('users')
      .select('*, companies(*)')
      .eq('id', data.user.id)
      .single();

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || '',
        role: profile?.role || 'user',
        company_id: profile?.company_id,
        company: profile?.companies,
        avatar_url: profile?.avatar_url,
      },
      session: data.session,
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  res.json({ user: req.user });
});

// ── PUT /api/auth/me ────────────────────────────────────────────────
router.put('/me', verifyToken, async (req, res) => {
  try {
    const { full_name, avatar_url } = req.body;
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── POST /api/auth/logout ───────────────────────────────────────────
router.post('/logout', async (req, res) => {
  res.json({ success: true });
});

export default router;
