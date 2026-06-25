import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { verifyToken, scopeByRole } from '../middleware/auth.js';
import { processPost } from '../services/scheduler.js';
import { sendEmail } from '../services/email.js';
import { scheduleConfirmationEmail } from '../templates/emails.js';
import { icsAttachment } from '../services/calendar.js';
import {
  createEvent as gcalCreateEvent,
  updateEvent as gcalUpdateEvent,
  deleteEvent as gcalDeleteEvent,
  getConnectionStatus as gcalStatus,
} from '../services/google-calendar.js';

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
        scheduled_at,
        status: 'scheduled',
        utm_params,
        is_boosted: is_boosted || false,
        boost_spend: boost_spend || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

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
      .select('*, users(email, full_name)', { count: 'exact' })
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    query = scopeByRole(req)(query);

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
    const allowed = ['post_text', 'post_image_url', 'post_media_url', 'post_media_type', 'post_media_filename', 'scheduled_at', 'platform', 'is_boosted', 'boost_spend'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    // Validate media if platform or media changed
    if (updates.platform || updates.post_media_type) {
      const mediaError = validateMediaForPlatform(updates.platform, updates.post_media_type);
      if (mediaError) return res.status(400).json({ error: mediaError });
    }

    let query = supabase.from('scheduled_posts').update(updates).eq('id', req.params.id);
    query = scopeByRole(req)(query);

    const { data: updated, error } = await query.select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });

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

    if (post.status !== 'failed') {
      return res.status(400).json({ error: `Can only retry failed posts (current status: '${post.status}')` });
    }

    // Reset to scheduled and clear error
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
    return res.status(502).json({
      success: false,
      status: updated?.status || 'unknown',
      error: updated?.error_message || 'Retry failed',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retry post' });
  }
});

export default router;
