import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { uploadBase64 } from '../config/storage.js';
import { verifyToken, scopeByRole } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);

// ── GET /api/brands ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('brands')
      .select('*')
      .order('created_at', { ascending: false });

    query = scopeByRole(req)(query);
    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    res.json({ brands: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// ── POST /api/brands ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { brand_name, primary_color, secondary_color, logo_url, industry } = req.body;

    const { data, error } = await supabase
      .from('brands')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id,
        brand_name: brand_name || '',
        primary_color: primary_color || '#fbbf24',
        secondary_color: secondary_color || '#38bdf8',
        logo_url,
        industry: industry || 'general',
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ brand: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

// ── PUT /api/brands/:id ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['brand_name', 'primary_color', 'secondary_color', 'logo_url', 'industry'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    let query = supabase.from('brands').update(updates).eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

// ── POST /api/brands/:id/logo ──────────────────────────────────────
router.post('/:id/logo', async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: 'No image data provided' });

    const ext = (mimeType || 'image/png').split('/')[1] || 'png';
    const filePath = `${req.user.id}/${req.params.id}.${ext}`;
    const publicUrl = await uploadBase64('brand-logos', filePath, base64, mimeType || 'image/png');

    // Save URL to brand record
    await supabase
      .from('brands')
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, logo_url: publicUrl });
  } catch (err) {
    console.error('[BRANDS] Logo upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// ── DELETE /api/brands/:id ──────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    let query = supabase.from('brands').delete().eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

export default router;
