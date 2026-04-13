import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);

// ── GET /api/metrics/posts ──────────────────────────────────────────
// The key table Shanne wants: per-post metrics sortable by engagement
router.get('/posts', async (req, res) => {
  try {
    const { platform, is_boosted, from, to, sort_by = 'reactions', order = 'desc' } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let query = supabase
      .from('post_metrics')
      .select('*, scheduled_posts(post_text, platform, scheduled_at, status, external_post_url)', { count: 'exact' })
      .order(sort_by, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    // Scope by role
    if (req.user.role === 'user') {
      query = query.eq('scheduled_posts.user_id', req.user.id);
    } else if (req.user.role === 'admin') {
      query = query.eq('company_id', req.user.company_id);
    }

    if (platform) query = query.eq('platform', platform);
    if (is_boosted !== undefined) query = query.eq('is_boosted', is_boosted === 'true');
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ metrics: data, total: count, limit, offset });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// ── GET /api/metrics/summary ────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    let query = supabase
      .from('post_metrics')
      .select('impressions, reactions, comments, shares, clicks, is_boosted');

    // post_metrics has company_id but not user_id, so scope manually
    if (req.user.role === 'admin') {
      query = query.eq('company_id', req.user.company_id);
    } else if (req.user.role === 'user') {
      query = query.eq('company_id', req.user.company_id);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const summary = {
      total_posts: data.length,
      total_impressions: data.reduce((s, m) => s + (m.impressions || 0), 0),
      total_reactions: data.reduce((s, m) => s + (m.reactions || 0), 0),
      total_comments: data.reduce((s, m) => s + (m.comments || 0), 0),
      total_shares: data.reduce((s, m) => s + (m.shares || 0), 0),
      total_clicks: data.reduce((s, m) => s + (m.clicks || 0), 0),
      avg_engagement_rate: data.length > 0
        ? (data.reduce((s, m) => s + (m.reactions || 0) + (m.comments || 0) + (m.shares || 0), 0) /
          Math.max(1, data.reduce((s, m) => s + (m.impressions || 0), 0)) * 100).toFixed(2)
        : 0,
    };

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ── GET /api/metrics/boosted-vs-organic ─────────────────────────────
router.get('/boosted-vs-organic', async (req, res) => {
  try {
    let query = supabase
      .from('post_metrics')
      .select('impressions, reactions, comments, shares, clicks, is_boosted, boost_spend');

    if (req.user.role === 'admin' || req.user.role === 'user') {
      query = query.eq('company_id', req.user.company_id);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const organic = data.filter(m => !m.is_boosted);
    const boosted = data.filter(m => m.is_boosted);

    const aggregate = (items) => ({
      count: items.length,
      impressions: items.reduce((s, m) => s + (m.impressions || 0), 0),
      reactions: items.reduce((s, m) => s + (m.reactions || 0), 0),
      comments: items.reduce((s, m) => s + (m.comments || 0), 0),
      shares: items.reduce((s, m) => s + (m.shares || 0), 0),
      clicks: items.reduce((s, m) => s + (m.clicks || 0), 0),
      total_spend: items.reduce((s, m) => s + (m.boost_spend || 0), 0),
    });

    res.json({
      organic: aggregate(organic),
      boosted: aggregate(boosted),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comparison' });
  }
});

// ── POST /api/metrics/:postId/manual ────────────────────────────────
router.post('/:postId/manual', async (req, res) => {
  try {
    const { impressions, reactions, comments, shares, clicks, is_boosted, boost_spend } = req.body;

    // Get the scheduled post to find brand_id and company_id
    const { data: post } = await supabase
      .from('scheduled_posts')
      .select('brand_id, company_id')
      .eq('id', req.params.postId)
      .single();

    const engagementTotal = (reactions || 0) + (comments || 0) + (shares || 0);
    const engagementRate = impressions > 0 ? (engagementTotal / impressions * 100) : 0;

    const { data, error } = await supabase
      .from('post_metrics')
      .insert({
        scheduled_post_id: req.params.postId,
        brand_id: post?.brand_id || null,
        company_id: post?.company_id || req.user.company_id,
        platform: req.body.platform || 'linkedin',
        impressions: impressions || 0,
        reactions: reactions || 0,
        comments: comments || 0,
        shares: shares || 0,
        clicks: clicks || 0,
        engagement_rate: engagementRate.toFixed(2),
        is_boosted: is_boosted || false,
        boost_spend: boost_spend || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ metric: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save metrics' });
  }
});

export default router;
