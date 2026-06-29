/**
 * /api/review — Content approval workflow routes (Wave 1 backend).
 *
 * Authenticated routes (require verifyToken):
 *   GET  /queue              — list posts pending review for the caller's scope
 *   GET  /:id                — single post + its comments
 *   PUT  /:id/approve        — approve: flip status='scheduled', review_status='approved'
 *   PUT  /:id/request-changes — set review_status='changes_requested' + insert comment
 *   POST /:id/comment        — add an internal comment (author = req.user)
 *
 * Public routes (token-verified, no session required — for email links):
 *   GET  /act?token=...      — preview the post for an external reviewer
 *   POST /act                — external reviewer approves or requests changes
 *
 * GATE PROOF:
 *   - On schedule (POST /api/schedule), posts that require approval are written
 *     with status='draft' and review_status='pending_review'.
 *   - Only PUT /:id/approve sets status='scheduled' (the cron-visible value).
 *   - POST /act with action='approve' also sets status='scheduled'.
 *   - The cron predicate (status='scheduled') is NEVER changed in this file.
 *   - Therefore an unapproved post (review_status='pending_review' or
 *     'changes_requested') keeps status='draft' and is invisible to the cron
 *     publisher until explicitly approved.
 */

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { supabase } from '../config/supabase.js';
import { verifyToken, scopeByRole } from '../middleware/auth.js';
import { verifyApprovalToken } from '../services/approval-token.js';
import { finalizeDimensions } from '../services/image-finalizer.js';

const router = Router();

// Stricter rate limiter for the public /act endpoints (no auth → more abuse risk)
const actLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many review requests, please try again later.' },
});

// ── GET /api/review/queue ───────────────────────────────────────────────────────
// List posts currently in review (pending_review or changes_requested).
// Scoped by role: super_admin sees all; admin sees company; user sees own.
router.get('/queue', verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let query = supabase
      .from('scheduled_posts')
      .select(
        // users!user_id disambiguates: scheduled_posts has TWO FKs to users
        // (user_id = owner, reviewed_by = approver). Embed the owner.
        `*, users!user_id(email, full_name),
         post_comments(id)`,
        { count: 'exact' }
      )
      .in('review_status', ['pending_review', 'changes_requested'])
      .order('review_requested_at', { ascending: true })
      .range(offset, offset + limit - 1);

    query = scopeByRole(req)(query);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Annotate each post with a comment count for the UI
    const posts = (data || []).map(p => {
      const { post_comments, ...rest } = p;
      return { ...rest, comment_count: Array.isArray(post_comments) ? post_comments.length : 0 };
    });

    res.json({ posts, total: count, limit, offset });
  } catch (err) {
    console.error('[REVIEW] queue error:', err);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

// ── GET /api/review/act?token=... ───────────────────────────────────────────────
// PUBLIC. Validate a review token and return the post + comments for the
// external reviewer UI. Uses the service-role client (supabase) directly.
router.get('/act', actLimiter, async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'token is required' });

  const payload = verifyApprovalToken(token);
  if (!payload) {
    return res.status(401).json({
      error: 'invalid_or_expired_token',
      message: 'This review link has expired or is invalid. Please ask your contact to resend it.',
    });
  }

  try {
    const { data: post, error: postErr } = await supabase
      .from('scheduled_posts')
      .select('id, post_text, platform, scheduled_at, review_status, post_media_url, post_media_type')
      .eq('id', payload.postId)
      .eq('company_id', payload.companyId)
      .single();

    if (postErr || !post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { data: comments } = await supabase
      .from('post_comments')
      .select('id, author_name, author_email, body, comment_type, created_at')
      .eq('scheduled_post_id', payload.postId)
      .order('created_at', { ascending: true });

    res.json({ post, comments: comments || [] });
  } catch (err) {
    console.error('[REVIEW] GET /act error:', err);
    res.status(500).json({ error: 'Failed to load review' });
  }
});

// ── POST /api/review/act ────────────────────────────────────────────────────────
// PUBLIC. External reviewer submits their decision (approve or request_changes).
// Body: { token, action: 'approve'|'request_changes', comment?, name?, email? }
router.post('/act', actLimiter, async (req, res) => {
  const { token, action, comment, name, email } = req.body || {};

  if (!token) return res.status(400).json({ error: 'token is required' });
  if (!['approve', 'request_changes'].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'request_changes'" });
  }

  const payload = verifyApprovalToken(token);
  if (!payload) {
    return res.status(401).json({
      error: 'invalid_or_expired_token',
      message: 'This review link has expired or is invalid. Please ask your contact to resend it.',
    });
  }

  try {
    // Load current post state (include image fields for finalizeDimensions)
    const { data: post, error: postErr } = await supabase
      .from('scheduled_posts')
      .select('id, review_status, status, company_id, platform, image_mode, post_image_url')
      .eq('id', payload.postId)
      .eq('company_id', payload.companyId)
      .single();

    if (postErr || !post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Idempotency: if already actioned in a terminal state, return gracefully
    if (post.review_status === 'approved' || post.review_status === 'none') {
      return res.json({
        already_reviewed: true,
        review_status: post.review_status,
        message: 'This post has already been reviewed.',
      });
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      // Materialise per-platform image variants. Belt-and-suspenders: even though
      // finalizeDimensions is itself failure-isolated, wrap the call so the approval
      // flip below ALWAYS proceeds regardless of any (future) error in finalize.
      try { await finalizeDimensions(post); }
      catch (finErr) { console.error('[REVIEW] finalizeDimensions failed (approval continues):', finErr.message); }

      // GATE FLIP: status='draft' → 'scheduled', cron can now see this post
      const { error: updateErr } = await supabase
        .from('scheduled_posts')
        .update({
          review_status: 'approved',
          status: 'scheduled',          // ← the only place a public token can flip to 'scheduled'
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', post.id);

      if (updateErr) return res.status(400).json({ error: updateErr.message });
    } else {
      // request_changes — keep status='draft', just change review_status
      const { error: updateErr } = await supabase
        .from('scheduled_posts')
        .update({
          review_status: 'changes_requested',
          updated_at: now,
        })
        .eq('id', post.id);

      if (updateErr) return res.status(400).json({ error: updateErr.message });
    }

    // Insert a comment if a body was provided (or always for request_changes)
    const commentBody = comment || (action === 'request_changes' ? '(Changes requested — no comment provided)' : null);
    if (commentBody) {
      await supabase.from('post_comments').insert({
        scheduled_post_id: post.id,
        company_id: post.company_id,
        author_user_id: null,          // external reviewer — no user account
        author_name: name || null,
        author_email: email || null,
        body: commentBody,
        comment_type: action === 'approve' ? 'approval_note' : 'feedback',
      });
    }

    res.json({
      success: true,
      action,
      review_status: action === 'approve' ? 'approved' : 'changes_requested',
    });
  } catch (err) {
    console.error('[REVIEW] POST /act error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ── All remaining routes require authentication ─────────────────────────────────
router.use(verifyToken);

// ── GET /api/review/unread-count ─────────────────────────────────────────────────
// Badge count for the top-bar feedback icon. Counts comments/feedback created
// after `since` (the client's last-seen timestamp) that the caller hasn't
// authored themselves. Scoped by role: super_admin = all; company members =
// their company. External-reviewer comments (author_user_id NULL) are included.
//
// MUST be declared before GET /:id, or '/unread-count' is captured as an :id.
router.get('/unread-count', async (req, res) => {
  try {
    const since = req.query.since
      ? new Date(req.query.since).toISOString()
      : new Date(0).toISOString();

    let q = supabase
      .from('post_comments')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since)
      // Include external (null-author) comments; exclude the caller's own.
      .or(`author_user_id.is.null,author_user_id.neq.${req.user.id}`);

    if (req.user.role !== 'super_admin') {
      if (req.user.company_id) q = q.eq('company_id', req.user.company_id);
      else q = q.eq('author_user_id', req.user.id); // no company → effectively none
    }

    const { count, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ count: count || 0 });
  } catch (err) {
    console.error('[REVIEW] unread-count error:', err);
    // Non-fatal for the UI — return 0 so the badge just hides.
    res.json({ count: 0 });
  }
});

// ── GET /api/review/:id ─────────────────────────────────────────────────────────
// Fetch a single post + its comments, scoped by role.
router.get('/:id', async (req, res) => {
  try {
    let query = supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', req.params.id);

    query = scopeByRole(req)(query);

    const { data: post, error: postErr } = await query.single();
    if (postErr || !post) return res.status(404).json({ error: 'Post not found' });

    const { data: comments } = await supabase
      .from('post_comments')
      .select('*, users(email, full_name)')
      .eq('scheduled_post_id', post.id)
      .order('created_at', { ascending: true });

    res.json({ post, comments: comments || [] });
  } catch (err) {
    console.error('[REVIEW] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// ── PUT /api/review/:id/approve ─────────────────────────────────────────────────
// GATE FLIP (authenticated path): set review_status='approved', status='scheduled'.
router.put('/:id/approve', async (req, res) => {
  try {
    // Scope-check: ensure the caller can access this post
    // (include image fields so finalizeDimensions has what it needs)
    let fetchQuery = supabase
      .from('scheduled_posts')
      .select('id, review_status, status, company_id, platform, image_mode, post_image_url')
      .eq('id', req.params.id);
    fetchQuery = scopeByRole(req)(fetchQuery);
    const { data: post, error: fetchErr } = await fetchQuery.single();
    if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

    // Materialise per-platform image variants. Belt-and-suspenders: even though
    // finalizeDimensions is itself failure-isolated, wrap the call so the approval
    // flip below ALWAYS proceeds regardless of any (future) error in finalize.
    try { await finalizeDimensions(post); }
    catch (finErr) { console.error('[REVIEW] finalizeDimensions failed (approval continues):', finErr.message); }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('scheduled_posts')
      .update({
        review_status: 'approved',
        status: 'scheduled',            // ← GATE FLIP: draft → scheduled
        reviewed_at: now,
        reviewed_by: req.user.id,
        updated_at: now,
      })
      .eq('id', post.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ post: data });
  } catch (err) {
    console.error('[REVIEW] PUT /:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve post' });
  }
});

// ── PUT /api/review/:id/request-changes ────────────────────────────────────────
// Set review_status='changes_requested'; status stays 'draft'.
// Requires a feedback body in the request.
router.put('/:id/request-changes', async (req, res) => {
  try {
    const body = String(req.body?.comment || req.body?.body || '').trim();
    if (!body) {
      return res.status(400).json({ error: 'A feedback comment is required when requesting changes' });
    }

    // Scope-check
    let fetchQuery = supabase
      .from('scheduled_posts')
      .select('id, company_id, review_status')
      .eq('id', req.params.id);
    fetchQuery = scopeByRole(req)(fetchQuery);
    const { data: post, error: fetchErr } = await fetchQuery.single();
    if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('scheduled_posts')
      .update({
        review_status: 'changes_requested',
        // status intentionally NOT changed — stays 'draft'
        updated_at: now,
      })
      .eq('id', post.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Insert feedback comment
    await supabase.from('post_comments').insert({
      scheduled_post_id: post.id,
      company_id: post.company_id,
      author_user_id: req.user.id,
      author_name: req.user.full_name || null,
      author_email: req.user.email || null,
      body,
      comment_type: 'feedback',
    });

    res.json({ post: data });
  } catch (err) {
    console.error('[REVIEW] PUT /:id/request-changes error:', err);
    res.status(500).json({ error: 'Failed to request changes' });
  }
});

// ── GET /api/review/:id/comments ─────────────────────────────────────────────────
// Return the feedback/comment thread for a post, oldest-first, company-scoped.
// (Mirrors the comments payload of GET /:id but without re-fetching the post.)
router.get('/:id/comments', async (req, res) => {
  try {
    // Scope-check the parent post
    let fetchQuery = supabase
      .from('scheduled_posts')
      .select('id')
      .eq('id', req.params.id);
    fetchQuery = scopeByRole(req)(fetchQuery);
    const { data: post, error: fetchErr } = await fetchQuery.single();
    if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

    const { data: comments, error } = await supabase
      .from('post_comments')
      .select('*, users(email, full_name)')
      .eq('scheduled_post_id', post.id)
      .order('created_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ comments: comments || [] });
  } catch (err) {
    console.error('[REVIEW] GET /:id/comments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// ── POST /api/review/:id/request-feedback ─────────────────────────────────────────
// Flag a post as needing feedback so it surfaces in the feedback/review view,
// WITHOUT gating publishing. This sets review_status='pending_review' ONLY and
// leaves `status` untouched (so the cron predicate status='scheduled' is
// unaffected — an already-scheduled post keeps publishing on time). Optionally
// records an initial note comment. Company-scoped, authenticated.
router.post('/:id/request-feedback', async (req, res) => {
  try {
    // Scope-check
    let fetchQuery = supabase
      .from('scheduled_posts')
      .select('id, company_id, review_status')
      .eq('id', req.params.id);
    fetchQuery = scopeByRole(req)(fetchQuery);
    const { data: post, error: fetchErr } = await fetchQuery.single();
    if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

    const now = new Date().toISOString();

    // Surface in the feedback view WITHOUT touching `status` (no publish gate).
    const { data, error } = await supabase
      .from('scheduled_posts')
      .update({
        review_status: 'pending_review',
        // status intentionally NOT changed — must not gate publishing.
        review_requested_at: now,
        updated_at: now,
      })
      .eq('id', post.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Optional initial note (best-effort; must not fail the request)
    const note = String(req.body?.body || req.body?.comment || '').trim();
    if (note) {
      try {
        await supabase.from('post_comments').insert({
          scheduled_post_id: post.id,
          company_id: post.company_id,
          author_user_id: req.user.id,
          author_name: req.user.full_name || null,
          author_email: req.user.email || null,
          body: note,
          comment_type: 'note',
        });
      } catch (noteErr) {
        console.warn('[REVIEW] request-feedback note insert failed (continuing):', noteErr.message);
      }
    }

    res.json({ post: data });
  } catch (err) {
    console.error('[REVIEW] POST /:id/request-feedback error:', err);
    res.status(500).json({ error: 'Failed to request feedback' });
  }
});

// ── POST /api/review/:id/comment ────────────────────────────────────────────────
// Insert an internal comment from an authenticated user.
router.post('/:id/comment', async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Comment body is required' });

    // Scope-check
    let fetchQuery = supabase
      .from('scheduled_posts')
      .select('id, company_id')
      .eq('id', req.params.id);
    fetchQuery = scopeByRole(req)(fetchQuery);
    const { data: post, error: fetchErr } = await fetchQuery.single();
    if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

    const commentType = req.body?.comment_type || 'note';

    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        scheduled_post_id: post.id,
        company_id: post.company_id,
        author_user_id: req.user.id,
        author_name: req.user.full_name || null,
        author_email: req.user.email || null,
        body,
        comment_type: commentType,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ comment: data });
  } catch (err) {
    console.error('[REVIEW] POST /:id/comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

export default router;
