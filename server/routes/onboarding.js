import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken, invalidateUserCache } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'company';
}

// ── POST /api/onboarding/company ────────────────────────────────────
// Creates a company for a user that doesn't have one yet, OR renames the
// user's existing company. Idempotent and safe on repeat calls.
router.post('/company', async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Company name is required' });

    // If the user already has a company, just rename it.
    if (req.user.company_id) {
      const { error } = await supabase
        .from('companies')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', req.user.company_id);
      if (error) return res.status(400).json({ error: error.message });
      invalidateUserCache(req.user.id);
      return res.json({ success: true, company_id: req.user.company_id });
    }

    // Otherwise create a fresh company. Slug must be unique — append suffix on conflict.
    const baseSlug = slugify(name);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('companies')
        .insert({ name, slug })
        .select('id')
        .single();
      if (!error) {
        await supabase
          .from('users')
          .update({ company_id: data.id, updated_at: new Date().toISOString() })
          .eq('id', req.user.id);
        invalidateUserCache(req.user.id);
        return res.json({ success: true, company_id: data.id });
      }
      if (error.code !== '23505') {
        return res.status(400).json({ error: error.message });
      }
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return res.status(500).json({ error: 'Could not create a unique company slug. Please try a different name.' });
  } catch (err) {
    console.error('[ONBOARDING] company error:', err);
    res.status(500).json({ error: 'Failed to set up company' });
  }
});

export default router;