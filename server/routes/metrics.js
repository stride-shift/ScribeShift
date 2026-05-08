import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { refreshAll, refreshAccountMetrics } from '../services/metrics-sync.js';

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

// ── GET /api/metrics/account-overview ───────────────────────────────
// Per-platform account analytics (followers, reach, etc) — what the user
// would see if they signed into the platform directly.
router.get('/account-overview', async (req, res) => {
  try {
    let query = supabase
      .from('account_metrics')
      .select('*')
      .order('platform');

    if (req.user.role === 'admin' || req.user.role === 'user') {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Roll up totals for the header
    const totals = {
      followers: 0,
      following: 0,
      posts: 0,
      reach_30d: 0,
      impressions_30d: 0,
    };
    for (const row of data || []) {
      totals.followers += row.followers || 0;
      totals.following += row.following || 0;
      totals.posts += row.posts_count || 0;
      totals.reach_30d += row.reach_30d || 0;
      totals.impressions_30d += row.impressions_30d || 0;
    }

    res.json({ accounts: data || [], totals });
  } catch (err) {
    console.error('[METRICS] account-overview:', err);
    res.status(500).json({ error: 'Failed to fetch account overview' });
  }
});

// ── POST /api/metrics/refresh ───────────────────────────────────────
// Triggers a sync of account-level + post-level metrics from each connected
// platform. Returns per-platform results (ok/skipped/error).
router.post('/refresh', async (req, res) => {
  try {
    const result = await refreshAll(req.user.id, req.user.company_id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[METRICS] refresh:', err);
    res.status(500).json({ error: 'Failed to refresh metrics' });
  }
});

// ── POST /api/metrics/refresh/accounts ───────────────────────────────
// Lighter sync that only refreshes account-level metrics (no per-post calls).
router.post('/refresh/accounts', async (req, res) => {
  try {
    const accounts = await refreshAccountMetrics(req.user.id, req.user.company_id);
    res.json({ success: true, accounts, refreshed_at: new Date().toISOString() });
  } catch (err) {
    console.error('[METRICS] refresh/accounts:', err);
    res.status(500).json({ error: 'Failed to refresh account metrics' });
  }
});

// ── GET /api/metrics/scribeshift-stats ──────────────────────────────
// Stats specific to what the user has done *through* ScribeShift —
// generated content count, scheduling success, content-type breakdown, etc.
router.get('/scribeshift-stats', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Generated content (text outputs from /api/generate)
    let generatedQ = supabase
      .from('generated_content')
      .select('content_type, created_at, brand_id', { count: 'exact' })
      .gte('created_at', since);
    if (req.user.role === 'user') generatedQ = generatedQ.eq('user_id', req.user.id);
    else generatedQ = generatedQ.eq('company_id', req.user.company_id);
    const { data: generated, count: generatedCount, error: genErr } = await generatedQ;
    if (genErr) return res.status(400).json({ error: genErr.message });

    // Content-type breakdown
    const contentTypeBreakdown = {};
    for (const row of generated || []) {
      const t = row.content_type || 'other';
      contentTypeBreakdown[t] = (contentTypeBreakdown[t] || 0) + 1;
    }

    // Scheduled posts and their statuses
    let scheduledQ = supabase
      .from('scheduled_posts')
      .select('id, status, platform, posted_at, scheduled_at, retry_count')
      .gte('created_at', since);
    if (req.user.role === 'user') scheduledQ = scheduledQ.eq('user_id', req.user.id);
    else scheduledQ = scheduledQ.eq('company_id', req.user.company_id);
    const { data: scheduled, error: schedErr } = await scheduledQ;
    if (schedErr) return res.status(400).json({ error: schedErr.message });

    const statusBreakdown = { scheduled: 0, posting: 0, posted: 0, failed: 0 };
    const platformBreakdown = {};
    let totalRetries = 0;
    let firstAttemptSuccess = 0;
    let postedTotal = 0;
    for (const p of scheduled || []) {
      if (statusBreakdown[p.status] !== undefined) statusBreakdown[p.status]++;
      platformBreakdown[p.platform] = (platformBreakdown[p.platform] || 0) + 1;
      totalRetries += p.retry_count || 0;
      if (p.status === 'posted') {
        postedTotal++;
        if ((p.retry_count || 0) === 0) firstAttemptSuccess++;
      }
    }
    const successRate = postedTotal > 0
      ? Number(((firstAttemptSuccess / postedTotal) * 100).toFixed(1))
      : null;

    // Generation activity over time (daily counts)
    const dailyCounts = {};
    for (const row of generated || []) {
      const day = new Date(row.created_at).toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }
    const timeSeries = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    res.json({
      window: { days, since },
      generated: {
        total: generatedCount || 0,
        by_content_type: contentTypeBreakdown,
        time_series: timeSeries,
      },
      scheduled: {
        total: scheduled?.length || 0,
        by_status: statusBreakdown,
        by_platform: platformBreakdown,
        first_attempt_success_rate: successRate,
        total_retries: totalRetries,
      },
    });
  } catch (err) {
    console.error('[METRICS] scribeshift-stats:', err);
    res.status(500).json({ error: 'Failed to fetch ScribeShift stats' });
  }
});

export default router;
