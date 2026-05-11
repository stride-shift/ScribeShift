import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';

// Pillars and the content pieces inside them are a COMPANY-shared resource —
// the team agrees on themes once and everyone publishes against them. Same
// rationale as brands: scoping these to a single user_id would silo a
// teammate's pillars from the rest of the org, and onboarding would force
// every new teammate to recreate the same pillar set.
//
// Super admins see everything across companies. Users without a company yet
// (edge case during initial signup) fall back to their own user_id.
function scopePlanner(req, query) {
  if (req.user.role === 'super_admin') return query;
  if (req.user.company_id) return query.eq('company_id', req.user.company_id);
  return query.eq('user_id', req.user.id);
}

const pillarSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color hex').optional(),
  description: z.string().max(500).optional(),
  topics: z.array(z.string().max(100)).optional(),
});

const pieceSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().max(10000).optional(),
  link: z.string().url().optional().or(z.literal('')),
  pillarId: z.string().uuid().optional().nullable(),
  platform: z.string().max(50).optional(),
  contentType: z.string().max(50).optional(),
  status: z.enum(['idea', 'draft', 'ready', 'published']).optional(),
  notes: z.string().max(1000).optional(),
});

const router = Router();
router.use(verifyToken);

// ═══════════════════════════════════════════════════════════════
//  PILLARS
// ═══════════════════════════════════════════════════════════════

// ── GET /api/planner/pillars ─────────────────────────────────
router.get('/pillars', async (req, res) => {
  try {
    let query = supabase
      .from('planner_pillars')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    query = scopePlanner(req, query);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Transform DB rows to frontend format
    const pillars = (data || []).map(row => ({
      id: row.id,
      label: row.label,
      color: row.color,
      description: row.description || '',
      topics: row.topics || [],
    }));

    res.json({ pillars });
  } catch (err) {
    console.error('[PLANNER] Get pillars error:', err.message);
    res.status(500).json({ error: 'Failed to fetch pillars' });
  }
});

// ── POST /api/planner/pillars ────────────────────────────────
router.post('/pillars', async (req, res) => {
  try {
    const parsed = pillarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { label, color, description, topics } = parsed.data;

    const { data, error } = await supabase
      .from('planner_pillars')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id,
        label: label.trim(),
        color: color || '#3b82f6',
        description: description || '',
        topics: topics || [],
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({
      success: true,
      pillar: {
        id: data.id,
        label: data.label,
        color: data.color,
        description: data.description || '',
        topics: data.topics || [],
      },
    });
  } catch (err) {
    console.error('[PLANNER] Create pillar error:', err.message);
    res.status(500).json({ error: 'Failed to create pillar' });
  }
});

// ── PUT /api/planner/pillars/:id ─────────────────────────────
router.put('/pillars/:id', async (req, res) => {
  try {
    const { label, color, description, topics } = req.body;

    let query = supabase
      .from('planner_pillars')
      .update({
        label: label?.trim(),
        color,
        description: description || '',
        topics: topics || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    query = scopePlanner(req, query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error('[PLANNER] Update pillar error:', err.message);
    res.status(500).json({ error: 'Failed to update pillar' });
  }
});

// ── DELETE /api/planner/pillars/:id ──────────────────────────
router.delete('/pillars/:id', async (req, res) => {
  try {
    // Unassign pieces first (SET NULL handled by FK, but clear explicitly)
    let delQuery = supabase
      .from('planner_pillars')
      .delete()
      .eq('id', req.params.id);

    delQuery = scopePlanner(req, delQuery);

    const { error } = await delQuery;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error('[PLANNER] Delete pillar error:', err.message);
    res.status(500).json({ error: 'Failed to delete pillar' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  CONTENT PIECES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/planner/pieces ──────────────────────────────────
router.get('/pieces', async (req, res) => {
  try {
    const { pillar_id, status } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    let query = supabase
      .from('planner_pieces')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    query = scopePlanner(req, query);

    if (pillar_id) query = query.eq('pillar_id', pillar_id);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Transform to frontend format
    const pieces = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      body: row.body || '',
      link: row.link || '',
      pillarId: row.pillar_id || '',
      platform: row.platform || '',
      contentType: row.content_type || '',
      status: row.status || 'idea',
      notes: row.notes || '',
      createdAt: row.created_at,
    }));

    res.json({ pieces, total: count, limit, offset });
  } catch (err) {
    console.error('[PLANNER] Get pieces error:', err.message);
    res.status(500).json({ error: 'Failed to fetch content pieces' });
  }
});

// ── POST /api/planner/pieces ─────────────────────────────────
router.post('/pieces', async (req, res) => {
  try {
    const parsed = pieceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { title, body, link, pillarId, platform, contentType, status, notes } = parsed.data;

    const { data, error } = await supabase
      .from('planner_pieces')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id,
        title: title.trim(),
        body: body || '',
        link: link || '',
        pillar_id: pillarId || null,
        platform: platform || '',
        content_type: contentType || '',
        status: status || 'idea',
        notes: notes || '',
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({
      success: true,
      piece: {
        id: data.id,
        title: data.title,
        body: data.body || '',
        link: data.link || '',
        pillarId: data.pillar_id || '',
        platform: data.platform || '',
        contentType: data.content_type || '',
        status: data.status || 'idea',
        notes: data.notes || '',
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    console.error('[PLANNER] Create piece error:', err.message);
    res.status(500).json({ error: 'Failed to create content piece' });
  }
});

// ── PUT /api/planner/pieces/:id ──────────────────────────────
router.put('/pieces/:id', async (req, res) => {
  try {
    const { title, body, link, pillarId, platform, contentType, status, notes } = req.body;

    let query = supabase
      .from('planner_pieces')
      .update({
        title: title?.trim(),
        body: body || '',
        link: link || '',
        pillar_id: pillarId || null,
        platform: platform || '',
        content_type: contentType || '',
        status: status || 'idea',
        notes: notes || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    query = scopePlanner(req, query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error('[PLANNER] Update piece error:', err.message);
    res.status(500).json({ error: 'Failed to update content piece' });
  }
});

// ── PATCH /api/planner/pieces/:id/status ─────────────────────
router.patch('/pieces/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    let query = supabase
      .from('planner_pieces')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    query = scopePlanner(req, query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error('[PLANNER] Update status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── DELETE /api/planner/pieces/:id ───────────────────────────
router.delete('/pieces/:id', async (req, res) => {
  try {
    let query = supabase
      .from('planner_pieces')
      .delete()
      .eq('id', req.params.id);

    query = scopePlanner(req, query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error('[PLANNER] Delete piece error:', err.message);
    res.status(500).json({ error: 'Failed to delete content piece' });
  }
});

export default router;
