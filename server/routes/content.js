import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken, scopeByRole } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);

// ── GET /api/content ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, search, pinned, pillar, tone, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('generated_content')
      .select('*, users(email, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    query = scopeByRole(req)(query);

    if (type) query = query.eq('content_type', type);
    if (search) query = query.ilike('title', `%${search}%`);
    if (pinned === 'true') query = query.eq('pinned', true);
    if (pillar) query = query.eq('pillar', pillar);
    if (tone) query = query.eq('tone', tone);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ content: data, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// ── GET /api/content/facets ─────────────────────────────────────────
// Returns distinct pillar/tone/status values the current user has actually
// produced, so dropdowns can show only the options that are meaningful.
router.get('/facets', async (req, res) => {
  try {
    let query = supabase
      .from('generated_content')
      .select('pillar, tone, status, content_type');

    query = scopeByRole(req)(query);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const uniq = (key) =>
      [...new Set((data || []).map(r => r[key]).filter(Boolean))].sort();

    res.json({
      pillars:       uniq('pillar'),
      tones:         uniq('tone'),
      statuses:      uniq('status'),
      content_types: uniq('content_type'),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch facets' });
  }
});

// ── GET /api/content/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    let query = supabase
      .from('generated_content')
      .select('*, users(email, full_name)')
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { data, error } = await query.single();
    if (error) return res.status(404).json({ error: 'Content not found' });

    res.json({ content: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// ── PATCH /api/content/:id/pin ──────────────────────────────────────
router.patch('/:id/pin', async (req, res) => {
  try {
    const { pinned } = req.body;
    let query = supabase
      .from('generated_content')
      .update({ pinned: !!pinned })
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, pinned: !!pinned });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pin status' });
  }
});

// ── PATCH /api/content/:id/pillar ───────────────────────────────────
router.patch('/:id/pillar', async (req, res) => {
  try {
    const { pillar } = req.body;
    let query = supabase
      .from('generated_content')
      .update({ pillar: pillar || null })
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, pillar });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pillar' });
  }
});

// ── PATCH /api/content/:id/tone ─────────────────────────────────────
router.patch('/:id/tone', async (req, res) => {
  try {
    const { tone } = req.body;
    let query = supabase
      .from('generated_content')
      .update({ tone: tone || null })
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, tone });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tone' });
  }
});

// ── PATCH /api/content/:id/status ───────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    let query = supabase
      .from('generated_content')
      .update({ status: status || null })
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── DELETE /api/content/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    let query = supabase.from('generated_content').delete().eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

export default router;
