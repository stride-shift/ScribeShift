import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';
import { passwordResetEmail } from '../templates/emails.js';

const RESET_TOKEN_TTL_MINUTES = 60;
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().max(100).optional(),
  companyName: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

const router = Router();

// ── POST /api/auth/signup ───────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { email, password, fullName, companyName } = parsed.data;

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
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { email, password } = parsed.data;

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

// ── POST /api/auth/forgot-password ──────────────────────────────────
// Always returns 200 to avoid leaking which emails exist.
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('id, email, full_name')
      .ilike('email', email)
      .maybeSingle();

    if (userRow) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000).toISOString();

      const { error: insertError } = await supabase.from('password_resets').insert({
        user_id: userRow.id,
        token_hash: hashToken(rawToken),
        expires_at: expiresAt,
      });

      if (insertError) {
        console.error('[AUTH] Failed to create reset token:', insertError.message);
      } else {
        const frontend = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'http://localhost:5173';
        const resetUrl = `${frontend}/reset-password?token=${rawToken}`;
        const { subject, html } = passwordResetEmail({ resetUrl, expiresMinutes: RESET_TOKEN_TTL_MINUTES });
        try {
          await sendEmail({ to: userRow.email, subject, html });
        } catch (emailErr) {
          console.error('[AUTH] Failed to send reset email:', emailErr.message);
        }
      }
    }

    res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) {
    console.error('[AUTH] forgot-password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ── POST /api/auth/reset-password ───────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token || token.length < 16) {
      return res.status(400).json({ error: 'Invalid or missing token' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = hashToken(token);
    const { data: row, error: lookupError } = await supabase
      .from('password_resets')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (lookupError || !row) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }
    if (row.used_at) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This reset link has expired' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(row.user_id, { password });
    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    await supabase
      .from('password_resets')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] reset-password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
