import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken, scopeByRole } from '../middleware/auth.js';
import { processPost } from '../services/scheduler.js';

const router = Router();
router.use(verifyToken);

// ── POST /api/schedule ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      content_id, brand_id, platform, post_text,
      post_image_url, scheduled_at, is_boosted, boost_spend,
    } = req.body;

    if (!post_text || !scheduled_at) {
      return res.status(400).json({ error: 'post_text and scheduled_at required' });
    }

    // Auto-generate UTM params
    const postIdShort = Math.random().toString(36).substring(2, 8);
    const weekNum = Math.ceil((new Date().getDate()) / 7);
    const utm_params = {
      utm_source: platform || 'linkedin',
      utm_medium: 'social',
      utm_campaign: `scribeshift_week${weekNum}`,
      utm_content: `post_${postIdShort}`,
    };

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: req.user.id,
        company_id: req.user.company_id,
        content_id: content_id || null,
        brand_id: brand_id || null,
        platform: platform || 'linkedin',
        post_text,
        post_image_url: post_image_url || null,
        scheduled_at,
        status: 'scheduled',
        utm_params,
        is_boosted: is_boosted || false,
        boost_spend: boost_spend || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ post: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

// ── GET /api/schedule ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, platform, from, to } = req.query;

    let query = supabase
      .from('scheduled_posts')
      .select('*, users(email, full_name)')
      .order('scheduled_at', { ascending: true });

    query = scopeByRole(req)(query);

    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);
    if (from) query = query.gte('scheduled_at', from);
    if (to) query = query.lte('scheduled_at', to);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ posts: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scheduled posts' });
  }
});

// ── GET /api/schedule/:id ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    let query = supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { data, error } = await query.single();
    if (error) return res.status(404).json({ error: 'Post not found' });

    res.json({ post: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// ── PUT /api/schedule/:id ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['post_text', 'post_image_url', 'scheduled_at', 'status', 'platform', 'is_boosted', 'boost_spend'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    let query = supabase.from('scheduled_posts').update(updates).eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// ── DELETE /api/schedule/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    let query = supabase.from('scheduled_posts').delete().eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ── POST /api/schedule/:id/post-now ─────────────────────────────────
router.post('/:id/post-now', async (req, res) => {
  try {
    let query = supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { data: post, error: fetchError } = await query.single();
    if (fetchError || !post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'scheduled') {
      return res.status(400).json({ error: `Cannot post now: status is '${post.status}'` });
    }

    // Respond immediately, process in background (Playwright takes 10-30s)
    res.json({ success: true, message: 'Post queued for immediate publishing' });

    processPost(post).catch(err => {
      console.error(`[POST-NOW] Error processing post ${post.id}:`, err.message);
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger post' });
  }
});

export default router;
