import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { verifyToken, scopeByRole, scopeBySelection } from '../middleware/auth.js';
import { processPost } from '../services/scheduler.js';
import { sendEmail } from '../services/email.js';
import { scheduleConfirmationEmail, approvalRequestEmail } from '../templates/emails.js';
import { icsAttachment } from '../services/calendar.js';
import {
  createEvent as gcalCreateEvent,
  updateEvent as gcalUpdateEvent,
  deleteEvent as gcalDeleteEvent,
  getConnectionStatus as gcalStatus,
} from '../services/google-calendar.js';
import { createApprovalToken } from '../services/approval-token.js';
import { getValidAccessToken } from '../services/linkedin-api.js';

const FRONTEND_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://scribe-shift.vercel.app';

const MEDIA_TYPES = ['image', 'video', 'document', 'audio'];

const scheduleSchema = z.object({
  content_id: z.string().uuid().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  platform: z.enum(['linkedin', 'twitter', 'facebook', 'instagram']).default('linkedin'),
  post_text: z.string().min(1, 'post_text is required').max(5000),
  post_image_url: z.string().url().optional().nullable(),
  post_media_url: z.string().url().optional().nullable(),
  post_media_type: z.enum(MEDIA_TYPES).optional().nullable(),
  post_media_filename: z.string().max(200).optional().nullable(),
  scheduled_at: z.string().datetime({ message: 'scheduled_at must be a valid ISO datetime' }),
  is_boosted: z.boolean().optional().default(false),
  boost_spend: z.number().positive().optional().nullable(),
  // IANA timezone (e.g. "Africa/Johannesburg") from the client, so the
  // confirmation email shows the time in the user's local zone instead of UTC.
  timezone: z.string().max(64).optional().nullable(),
  // Multi-target LinkedIn publishing (Wave 2). One item per destination.
  // Max 5 targets enforced here and in the scheduler (cap 5 safety net).
  // target_type 'person' with no target_urn → resolved from the user's OAuth token.
  linkedin_targets: z.array(z.object({
    target_type: z.enum(['person', 'organization']),
    target_urn: z.string().optional(),
    target_label: z.string().optional(),
  })).max(5).optional(),
  // Per-post image intent. 'auto' = legacy media-presence-driven (default).
  image_mode: z.enum(['auto', 'generated', 'uploaded', 'caption_only']).default('auto').optional(),
});

// Per-platform support for non-image media. Images are universally OK.
const PLATFORM_MEDIA_SUPPORT = {
  linkedin: ['image', 'video', 'document'],
  twitter: ['image', 'video'],
  facebook: ['image', 'video'],
  instagram: ['image', 'video'],
};

function validateMediaForPlatform(platform, mediaType) {
  if (!mediaType) return null;
  const allowed = PLATFORM_MEDIA_SUPPORT[platform] || [];
  if (!allowed.includes(mediaType)) {
    return `${platform} doesn't support ${mediaType} attachments. Supported: ${allowed.join(', ')}.`;
  }
  return null;
}

const router = Router();
router.use(verifyToken);

// ── POST /api/schedule ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const {
      content_id, brand_id, platform, post_text,
      post_image_url, post_media_url, post_media_type, post_media_filename,
      scheduled_at, is_boosted, boost_spend, timezone,
      linkedin_targets, image_mode,
    } = parsed.data;

    // Per-platform media validation
    const mediaError = validateMediaForPlatform(platform, post_media_type);
    if (mediaError) return res.status(400).json({ error: mediaError });

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
        // Keep post_image_url for backwards compat — set it if media is an image.
        post_image_url: post_media_type === 'image' ? (post_media_url || post_image_url) : (post_image_url || null),
        post_media_url: post_media_url || post_image_url || null,
        post_media_type: post_media_type || (post_image_url ? 'image' : null),
        post_media_filename: post_media_filename || null,
        image_mode: image_mode || 'auto',
        scheduled_at,
        status: 'scheduled',
        utm_params,
        is_boosted: is_boosted || false,
        boost_spend: boost_spend || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // ── Capture v1 "Original" for version control (best-effort, never blocks) ──
    if (data?.id) {
      supabase.from('post_revisions').upsert({
        scheduled_post_id: data.id,
        company_id: data.company_id || null,
        revision_number: 1,
        post_text: data.post_text,
        post_media_url: data.post_media_url,
        post_media_type: data.post_media_type,
        changed_by: req.user.id,
        change_reason: 'Original',
      }, { onConflict: 'scheduled_post_id,revision_number' })
        .then(({ error: e }) => { if (e) console.warn('[SCHEDULE] v1 capture failed:', e.message); })
        .catch(() => {});
    }

    // ── Insert multi-target rows for LinkedIn (Wave 2) ───────────────────────
    // Only when the caller explicitly supplies linkedin_targets (platform=linkedin).
    // Absent → no target rows → scheduler uses the legacy single-publish path.
    // Targets are created even when the approval gate is on — they won't be
    // published until the parent is approved and set back to status='scheduled'.
    if (platform === 'linkedin' && linkedin_targets && linkedin_targets.length > 0) {
      try {
        // Resolve person URN for 'person' targets that omit target_urn
        let resolvedPersonUrn = null;
        const needsPersonUrn = linkedin_targets.some(
          t => t.target_type === 'person' && !t.target_urn
        );
        if (needsPersonUrn) {
          try {
            const tokenData = await getValidAccessToken(req.user.id);
            if (tokenData?.personId) {
              resolvedPersonUrn = `urn:li:person:${tokenData.personId}`;
            }
          } catch (tokenErr) {
            console.warn('[SCHEDULE] Could not resolve person URN for target:', tokenErr.message);
          }
        }

        const targetRows = linkedin_targets.map(t => ({
          scheduled_post_id: data.id,
          company_id: req.user.company_id || null,
          target_type: t.target_type,
          target_urn: t.target_urn || (t.target_type === 'person' ? resolvedPersonUrn : null),
          target_label: t.target_label || null,
          status: 'pending',
        }));

        // Drop any target that ended up with no URN (e.g. person URN could not be resolved)
        const validTargets = targetRows.filter(t => t.target_urn);
        if (validTargets.length > 0) {
          const { error: tErr } = await supabase
            .from('scheduled_post_targets')
            .insert(validTargets);
          if (tErr) {
            console.warn('[SCHEDULE] Failed to insert targets:', tErr.message);
          } else {
            console.log(`[SCHEDULE] Inserted ${validTargets.length} target(s) for post ${data.id}`);
          }
        }
      } catch (targetErr) {
        // Non-fatal: post was created; log and continue
        console.warn('[SCHEDULE] Target insertion error (post still scheduled):', targetErr.message);
      }
    }

    // ── Approval workflow hook ───────────────────────────────────────────────
    // Check if this company has the approval workflow enabled. If so:
    //   1. Flip the just-created post back to status='draft', review_status='pending_review'
    //      so the cron cannot see it until it's explicitly approved.
    //   2. Mint a signed approval token and email all active company users.
    // If not enabled, the post stays status='scheduled' (existing behaviour).
    let approvalEnabled = false;
    try {
      if (req.user.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('approval_workflow_enabled')
          .eq('id', req.user.company_id)
          .single();
        approvalEnabled = !!company?.approval_workflow_enabled;
      }
    } catch (approvalCheckErr) {
      console.warn('[SCHEDULE] Approval workflow check failed (skipping):', approvalCheckErr.message);
    }

    if (approvalEnabled) {
      try {
        const now = new Date().toISOString();
        // GATE: keep status='draft' until approved; cron predicate unchanged
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'draft',
            review_status: 'pending_review',
            review_requested_at: now,
            updated_at: now,
          })
          .eq('id', data.id);

        // Update the in-memory post object so res.json reflects the real state
        data.status = 'draft';
        data.review_status = 'pending_review';
        data.review_requested_at = now;

        // Mint token and build action URLs
        const approvalToken = createApprovalToken({ postId: data.id, companyId: req.user.company_id });
        const approveUrl = `${FRONTEND_URL}/review/act?token=${encodeURIComponent(approvalToken)}&action=approve`;
        const requestChangesUrl = `${FRONTEND_URL}/review/act?token=${encodeURIComponent(approvalToken)}&action=request_changes`;

        // Email all active company users (best-effort; failure must not block response)
        try {
          const { data: recipients } = await supabase
            .from('users')
            .select('email, full_name')
            .eq('company_id', req.user.company_id)
            .eq('is_active', true);

          const companyName = req.user.company?.name || null;
          const emailsToNotify = (recipients || [])
            .filter(u => u.email && u.email !== req.user.email); // exclude the post creator

          for (const recipient of emailsToNotify) {
            try {
              const { subject, html, attachments: emailAttachments } = approvalRequestEmail({
                postText: data.post_text,
                approveUrl,
                requestChangesUrl,
                companyName,
                expiresLabel: '7 days',
              });
              await sendEmail({ to: recipient.email, subject, html, attachments: emailAttachments });
            } catch (recipErr) {
              console.warn(`[SCHEDULE] Approval email failed for ${recipient.email}:`, recipErr.message);
            }
          }
        } catch (emailsErr) {
          console.warn('[SCHEDULE] Approval email send failed (post still created as draft):', emailsErr.message);
        }
      } catch (approvalUpdateErr) {
        console.error('[SCHEDULE] Approval workflow update failed:', approvalUpdateErr.message);
        // Non-fatal: post was created as 'scheduled'; log and continue
      }
    }

    // ── Skip calendar/confirmation email for posts under review ─────────────
    if (approvalEnabled) {
      return res.json({ post: data });
    }

    // Side effects — run BEFORE responding so they actually complete on
    // serverless (a detached promise can be frozen the instant we respond,
    // which is why the email/calendar were unreliable). Each is guarded, so a
    // failure here never stops the post from being scheduled.
    //   • Google Calendar connected → add the event straight to their calendar
    //   • not connected → attach an .ics invite to the email instead
    // Either way the user gets a confirmation email AND a calendar entry for
    // exactly when the post goes out.
    let gcalConnected = false;
    try {
      const status = await gcalStatus(req.user.id);
      if (status?.connected) {
        gcalConnected = true;
        const eventId = await gcalCreateEvent(req.user.id, data);
        if (eventId) {
          await supabase
            .from('scheduled_posts')
            .update({ google_event_id: eventId })
            .eq('id', data.id);
          console.log(`[SCHEDULE] Created Google Calendar event ${eventId} for post ${data.id}`);
        }
      }
    } catch (gcalErr) {
      console.error('[SCHEDULE] Google Calendar event creation failed:', gcalErr.message);
    }

    try {
      const toEmail = req.user?.email;
      if (toEmail) {
        const { subject, html, attachments: logoAttachments } = scheduleConfirmationEmail({
          platform: data.platform,
          scheduledAt: data.scheduled_at,
          preview: data.post_text,
          timezone,
          calendarAttached: !gcalConnected, // .ics attached only when not on Google Calendar
        });
        const allAttachments = [
          ...(logoAttachments || []),
          ...(gcalConnected ? [] : [icsAttachment(data)]),
        ];
        await sendEmail({
          to: toEmail,
          subject,
          html,
          attachments: allAttachments.length ? allAttachments : undefined,
        });
      }
    } catch (emailErr) {
      console.error('[SCHEDULE] Confirmation email failed:', emailErr.message);
    }

    res.json({ post: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

// ── GET /api/schedule ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, platform, from, to } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let query = supabase
      .from('scheduled_posts')
      .select('*, users!user_id(email, full_name), scheduled_post_targets(target_type, target_label, target_urn, status, external_post_url, error_message)', { count: 'exact' })
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    // ?scope=mine|org lets the picker toggle between personal + org posts.
    query = scopeBySelection(req, req.query.scope)(query);

    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);
    if (from) query = query.gte('scheduled_at', from);
    if (to) query = query.lte('scheduled_at', to);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ posts: data, total: count, limit, offset });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scheduled posts' });
  }
});

// ── POST /api/schedule/clear-failed ─────────────────────────────────
// Bulk-remove failed posts (the "clear out" action on the Failed filter).
// Scope-aware (?scope=mine|org via body). Declared before /:id routes.
router.post('/clear-failed', async (req, res) => {
  try {
    let q = supabase.from('scheduled_posts').delete({ count: 'exact' }).eq('status', 'failed');
    q = scopeBySelection(req, req.body?.scope)(q);
    const { error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, cleared: count || 0 });
  } catch (err) {
    console.error('[SCHEDULE] clear-failed error:', err.message);
    res.status(500).json({ error: 'Failed to clear failed posts' });
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

// ── GET /api/schedule/:id/revisions ─────────────────────────────────
// Version history for a post, newest-first. Company-scoped via the parent
// post's scopeByRole check (so a caller can only see revisions for posts
// they're allowed to see).
router.get('/:id/revisions', async (req, res) => {
  try {
    // Scope-check the parent post first
    let postQuery = supabase
      .from('scheduled_posts')
      .select('id')
      .eq('id', req.params.id);
    postQuery = scopeByRole(req)(postQuery);
    const { data: post, error: postErr } = await postQuery.single();
    if (postErr || !post) return res.status(404).json({ error: 'Post not found' });

    const { data, error } = await supabase
      .from('post_revisions')
      .select('*, users:changed_by(email, full_name)')
      .eq('scheduled_post_id', req.params.id)
      .order('revision_number', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ revisions: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

// ── PUT /api/schedule/:id ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['post_text', 'post_image_url', 'post_media_url', 'post_media_type', 'post_media_filename', 'image_mode', 'scheduled_at', 'platform', 'is_boosted', 'boost_spend'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    // Validate media if platform or media changed
    if (updates.platform || updates.post_media_type) {
      const mediaError = validateMediaForPlatform(updates.platform, updates.post_media_type);
      if (mediaError) return res.status(400).json({ error: mediaError });
    }

    // ── Version control: snapshot the PRE-edit state ──────────────────────────
    // Before applying the update, fetch the current row. If post_text or media
    // changed, append a post_revisions row capturing the OLD state (append-only).
    // Best-effort: a revision-write failure must NEVER block the edit.
    let preEdit = null;
    try {
      let curQuery = supabase
        .from('scheduled_posts')
        .select('post_text, post_media_url, post_media_type, company_id')
        .eq('id', req.params.id);
      curQuery = scopeByRole(req)(curQuery);
      const { data: cur } = await curQuery.single();
      preEdit = cur || null;
    } catch (snapFetchErr) {
      console.warn('[SCHEDULE] Pre-edit snapshot fetch failed (continuing):', snapFetchErr.message);
    }

    let query = supabase.from('scheduled_posts').update(updates).eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { data: updated, error } = await query.select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });

    // Versioning is now EXPLICIT via the Save button (POST /:id/save-version) +
    // the v1/v2/v3 rolling slots, so we no longer auto-append a revision on every
    // edit. (preEdit is still fetched above for other potential uses.)

    // Update the linked Google Calendar event if one exists
    if (updated?.google_event_id) {
      (async () => {
        try {
          await gcalUpdateEvent(req.user.id, updated.google_event_id, updated);
          console.log(`[SCHEDULE] Updated Google Calendar event ${updated.google_event_id}`);
        } catch (err) {
          console.error('[SCHEDULE] Google Calendar update failed:', err.message);
        }
      })();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// ── DELETE /api/schedule/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    // Fetch first so we can clean up the linked calendar event
    let fetchQuery = supabase.from('scheduled_posts').select('*').eq('id', req.params.id);
    fetchQuery = scopeByRole(req)(fetchQuery);
    const { data: existing } = await fetchQuery.maybeSingle();

    let query = supabase.from('scheduled_posts').delete().eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });

    if (existing?.google_event_id) {
      gcalDeleteEvent(req.user.id, existing.google_event_id).catch(err => {
        console.error('[SCHEDULE] Google Calendar delete failed:', err.message);
      });
    }
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

    // Publish synchronously: a detached promise can be frozen the instant we
    // respond on serverless (which is why posts silently never went out), and
    // awaiting lets us return the real success/failure to the user.
    await processPost(post);

    let statusQuery = supabase
      .from('scheduled_posts')
      .select('status, error_message, external_post_url')
      .eq('id', post.id);
    statusQuery = scopeByRole(req)(statusQuery);
    const { data: updated } = await statusQuery.single();

    if (updated?.status === 'posted') {
      return res.json({ success: true, status: 'posted', url: updated.external_post_url || null });
    }
    return res.status(502).json({
      success: false,
      status: updated?.status || 'unknown',
      error: updated?.error_message || 'Publishing failed',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger post' });
  }
});

// ── POST /api/schedule/:id/retry ────────────────────────────────────
// Retry a failed post: reset status to scheduled, clear error, then process.
router.post('/:id/retry', async (req, res) => {
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

    if (!['failed', 'partial_failure'].includes(post.status)) {
      return res.status(400).json({ error: `Can only retry failed or partial_failure posts (current status: '${post.status}')` });
    }

    // Reset parent to scheduled and clear error
    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update({
        status: 'scheduled',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to reset post' });
    }

    // Reset ONLY failed target rows to 'pending' — never re-publish already-posted
    // targets. This is the retry-failed-only guarantee for multi-target posts.
    try {
      await supabase
        .from('scheduled_post_targets')
        .update({ status: 'pending', error_message: null, updated_at: new Date().toISOString() })
        .eq('scheduled_post_id', post.id)
        .eq('status', 'failed');
    } catch (targetResetErr) {
      console.warn('[SCHEDULE] Failed to reset failed targets (continuing):', targetResetErr.message);
    }

    // Publish synchronously (see post-now) so the work finishes before the
    // serverless function can freeze, and the user gets a real result.
    const refreshedPost = { ...post, status: 'scheduled', error_message: null };
    await processPost(refreshedPost);

    let statusQuery = supabase
      .from('scheduled_posts')
      .select('status, error_message, external_post_url')
      .eq('id', post.id);
    statusQuery = scopeByRole(req)(statusQuery);
    const { data: updated } = await statusQuery.single();

    if (updated?.status === 'posted') {
      return res.json({ success: true, status: 'posted', url: updated.external_post_url || null });
    }
    // partial_failure = some targets posted, some failed; inform the caller
    if (updated?.status === 'partial_failure') {
      return res.status(207).json({
        success: false,
        status: 'partial_failure',
        url: updated.external_post_url || null,
        error: updated?.error_message || 'Some targets failed to publish',
      });
    }
    return res.status(502).json({
      success: false,
      status: updated?.status || 'unknown',
      error: updated?.error_message || 'Retry failed',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retry post' });
  }
});

// ── POST /api/schedule/:id/save-version ─────────────────────────────
// Explicit "Save" of the post's CURRENT content into the rolling version slots:
//   v1 = Original (locked once captured), v2 = previous saved, v3 = latest saved.
// Save rolls: 1st save -> v2, 2nd -> v3, thereafter v3 demotes to v2 + new -> v3.
// v1 is captured at post creation going forward; for legacy posts (no v1) it's
// backfilled from the current content on first save.
router.post('/:id/save-version', async (req, res) => {
  try {
    let fq = supabase
      .from('scheduled_posts')
      .select('id, company_id, post_text, post_media_url, post_media_type')
      .eq('id', req.params.id);
    fq = scopeByRole(req)(fq);
    const { data: post, error: fErr } = await fq.single();
    if (fErr || !post) return res.status(404).json({ error: 'Post not found' });

    const { data: revs } = await supabase
      .from('post_revisions')
      .select('revision_number, post_text, post_media_url, post_media_type')
      .eq('scheduled_post_id', post.id)
      .in('revision_number', [1, 2, 3]);
    const slot = {};
    (revs || []).forEach((r) => { slot[r.revision_number] = r; });

    const now = new Date().toISOString();
    const current = { post_text: post.post_text, post_media_url: post.post_media_url, post_media_type: post.post_media_type };
    const writeSlot = (n, c, reason) => supabase.from('post_revisions').upsert({
      scheduled_post_id: post.id,
      company_id: post.company_id || null,
      revision_number: n,
      post_text: c.post_text,
      post_media_url: c.post_media_url,
      post_media_type: c.post_media_type,
      changed_by: req.user.id,
      change_reason: reason || null,
      created_at: now,
    }, { onConflict: 'scheduled_post_id,revision_number' });

    if (!slot[1]) await writeSlot(1, current, 'Original'); // backfill legacy original
    if (!slot[2]) {
      await writeSlot(2, current, 'Saved');
    } else if (!slot[3]) {
      await writeSlot(3, current, 'Saved');
    } else {
      // Demote current v3 -> v2, then write the new content as v3.
      await writeSlot(2, slot[3], 'Saved');
      await writeSlot(3, current, 'Saved');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[SCHEDULE] save-version error:', err.message);
    res.status(500).json({ error: 'Failed to save version' });
  }
});

// ── POST /api/schedule/:id/restore-version/:n ───────────────────────
// Restore version slot n (1|2|3) back onto the live post.
router.post('/:id/restore-version/:n', async (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    if (![1, 2, 3].includes(n)) return res.status(400).json({ error: 'Invalid version' });

    let fq = supabase.from('scheduled_posts').select('id').eq('id', req.params.id);
    fq = scopeByRole(req)(fq);
    const { data: post, error: fErr } = await fq.single();
    if (fErr || !post) return res.status(404).json({ error: 'Post not found' });

    const { data: rev } = await supabase
      .from('post_revisions')
      .select('post_text, post_media_url, post_media_type')
      .eq('scheduled_post_id', post.id)
      .eq('revision_number', n)
      .maybeSingle();
    if (!rev) return res.status(404).json({ error: 'Version not found' });

    const { error: upErr } = await supabase
      .from('scheduled_posts')
      .update({
        post_text: rev.post_text,
        post_media_url: rev.post_media_url,
        post_media_type: rev.post_media_type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);
    if (upErr) return res.status(400).json({ error: upErr.message });

    res.json({ success: true, restored: n });
  } catch (err) {
    console.error('[SCHEDULE] restore-version error:', err.message);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

export default router;
