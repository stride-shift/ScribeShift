import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { encrypt, decrypt } from '../services/encryption.js';

const router = Router();
router.use(verifyToken);

const SUPPORTED_PLATFORMS = ['linkedin', 'twitter', 'facebook', 'instagram'];

// ── GET /api/credentials — List user's connected accounts ───────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('social_credentials')
      .select('id, platform, account_label, is_active, last_used_at, last_login_success, created_at')
      .eq('user_id', req.user.id)
      .order('platform');

    if (error) return res.status(400).json({ error: error.message });

    // Decrypt email for display (masked) but never return passwords
    const credentials = [];
    for (const row of data) {
      // Fetch encrypted email to show masked version
      const { data: full } = await supabase
        .from('social_credentials')
        .select('encrypted_email, email_iv, email_tag')
        .eq('id', row.id)
        .single();

      let maskedEmail = '***';
      if (full) {
        try {
          const email = decrypt(full.encrypted_email, full.email_iv, full.email_tag);
          // Mask: show first 2 chars + *** + domain
          const [local, domain] = email.split('@');
          maskedEmail = local.slice(0, 2) + '***@' + domain;
        } catch {
          maskedEmail = '(decryption error)';
        }
      }

      credentials.push({
        id: row.id,
        platform: row.platform,
        account_label: row.account_label,
        masked_email: maskedEmail,
        is_active: row.is_active,
        last_used_at: row.last_used_at,
        last_login_success: row.last_login_success,
        created_at: row.created_at,
      });
    }

    res.json({ credentials });
  } catch (err) {
    console.error('[CREDENTIALS] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// ── POST /api/credentials — Save a new social credential ────────────
router.post('/', async (req, res) => {
  try {
    const { platform, email, password, account_label } = req.body;

    if (!platform || !email || !password) {
      return res.status(400).json({ error: 'platform, email, and password are required' });
    }

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: `Unsupported platform. Use: ${SUPPORTED_PLATFORMS.join(', ')}` });
    }

    // Encrypt email and password separately
    const encEmail = encrypt(email);
    const encPassword = encrypt(password);

    // Check if credential for this platform already exists
    const { data: existing } = await supabase
      .from('social_credentials')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('platform', platform)
      .eq('account_label', account_label || '')
      .single();

    if (existing) {
      // Update existing credential
      const { error } = await supabase
        .from('social_credentials')
        .update({
          encrypted_email: encEmail.encrypted,
          email_iv: encEmail.iv,
          email_tag: encEmail.tag,
          encrypted_password: encPassword.encrypted,
          encryption_iv: encPassword.iv,
          encryption_tag: encPassword.tag,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true, id: existing.id, message: 'Credential updated' });
    }

    // Insert new credential
    const { data, error } = await supabase
      .from('social_credentials')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id,
        platform,
        account_label: account_label || '',
        encrypted_email: encEmail.encrypted,
        email_iv: encEmail.iv,
        email_tag: encEmail.tag,
        encrypted_password: encPassword.encrypted,
        encryption_iv: encPassword.iv,
        encryption_tag: encPassword.tag,
      })
      .select('id')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, id: data.id, message: 'Credential saved' });
  } catch (err) {
    console.error('[CREDENTIALS] Save error:', err.message);
    res.status(500).json({ error: 'Failed to save credential' });
  }
});

// ── PUT /api/credentials/:id — Update a credential ──────────────────
router.put('/:id', async (req, res) => {
  try {
    const { email, password, is_active } = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (email) {
      const encEmail = encrypt(email);
      updates.encrypted_email = encEmail.encrypted;
      updates.email_iv = encEmail.iv;
      updates.email_tag = encEmail.tag;
    }

    if (password) {
      const encPassword = encrypt(password);
      updates.encrypted_password = encPassword.encrypted;
      updates.encryption_iv = encPassword.iv;
      updates.encryption_tag = encPassword.tag;
    }

    if (typeof is_active === 'boolean') {
      updates.is_active = is_active;
    }

    const { error } = await supabase
      .from('social_credentials')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    console.error('[CREDENTIALS] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update credential' });
  }
});

// ── DELETE /api/credentials/:id — Remove a credential ────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('social_credentials')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    console.error('[CREDENTIALS] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// ── POST /api/credentials/:id/test — Test a credential login ────────
router.post('/:id/test', async (req, res) => {
  try {
    // Fetch and decrypt credentials
    const { data: cred, error } = await supabase
      .from('social_credentials')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !cred) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const email = decrypt(cred.encrypted_email, cred.email_iv, cred.email_tag);
    const password = decrypt(cred.encrypted_password, cred.encryption_iv, cred.encryption_tag);

    // Try Playwright login based on platform
    let result = { success: false, message: 'Platform not yet supported for testing' };

    try {
      const pw = await import('../services/playwright.js');
      const loginFunctions = {
        linkedin: pw.loginToLinkedInWithCredentials,
        twitter: pw.loginToTwitterWithCredentials,
        facebook: pw.loginToFacebookWithCredentials,
        instagram: pw.loginToInstagramWithCredentials,
      };

      const loginFn = loginFunctions[cred.platform];
      if (loginFn) {
        result = await loginFn(email, password, req.user.id);
      }
    } catch (err) {
      result = { success: false, message: `Playwright not available: ${err.message}` };
    }

    // Update last login status
    await supabase
      .from('social_credentials')
      .update({
        last_used_at: new Date().toISOString(),
        last_login_success: result.success,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cred.id);

    res.json(result);
  } catch (err) {
    console.error('[CREDENTIALS] Test error:', err.message);
    res.status(500).json({ error: 'Failed to test credential' });
  }
});

export default router;
