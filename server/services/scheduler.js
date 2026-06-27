import { supabase } from '../config/supabase.js';

// ── Lazy-loaded API services ───────────────────────────────────────
let twitterApiService = null;
let facebookApiService = null;
let instagramApiService = null;
let linkedinApiService = null;

async function getTwitterApi() {
  if (!twitterApiService) {
    try { twitterApiService = await import('./twitter-api.js'); } catch {
      console.warn('[SCHEDULER] Twitter API service not available');
      return null;
    }
  }
  return twitterApiService;
}

async function getFacebookApi() {
  if (!facebookApiService) {
    try { facebookApiService = await import('./facebook-api.js'); } catch {
      console.warn('[SCHEDULER] Facebook API service not available');
      return null;
    }
  }
  return facebookApiService;
}

async function getInstagramApi() {
  if (!instagramApiService) {
    try { instagramApiService = await import('./instagram-api.js'); } catch {
      console.warn('[SCHEDULER] Instagram API service not available');
      return null;
    }
  }
  return instagramApiService;
}

async function getLinkedInApi() {
  if (!linkedinApiService) {
    try { linkedinApiService = await import('./linkedin-api.js'); } catch {
      console.warn('[SCHEDULER] LinkedIn API service not available');
      return null;
    }
  }
  return linkedinApiService;
}

const MAX_RETRIES = 3;
// Delays must sum (plus API wall time) to well under Vercel's 60s function
// cap. Previously [0, 30s, 120s] blew past it and left posts stuck in 'posting'.
const RETRY_DELAYS = [0, 5_000, 15_000]; // immediate, 5s, 15s

/**
 * Attempt to publish a post via the official API for the platform.
 * Returns { success, postUrl?, message }.
 */
async function attemptPost(post) {
  // Belt-and-suspenders: caption_only posts must never attach an image even if
  // post_image_url is somehow set. For all other modes (including 'auto' and
  // undefined) the resolved URL is unchanged — legacy behaviour is preserved.
  const effectiveImageUrl = post.image_mode === 'caption_only' ? null : post.post_image_url;

  const apiHandlers = {
    linkedin: async () => {
      const api = await getLinkedInApi();
      if (!api) return { success: false, message: 'LinkedIn API service not available' };
      return api.createLinkedInPostViaAPI(post.user_id, post.post_text, effectiveImageUrl);
    },
    twitter: async () => {
      const api = await getTwitterApi();
      if (!api) return { success: false, message: 'Twitter API service not available' };
      return api.createTwitterPost(post.user_id, post.post_text, effectiveImageUrl);
    },
    facebook: async () => {
      const api = await getFacebookApi();
      if (!api) return { success: false, message: 'Facebook API service not available' };
      return api.createFacebookPost(post.user_id, post.post_text, effectiveImageUrl);
    },
    instagram: async () => {
      const api = await getInstagramApi();
      if (!api) return { success: false, message: 'Instagram API service not available' };
      return api.createInstagramPost(post.user_id, post.post_text, effectiveImageUrl);
    },
  };

  const handler = apiHandlers[post.platform];
  if (!handler) return { success: false, message: `Platform ${post.platform} not supported` };
  return handler();
}

/**
 * Attempt a single LinkedIn target with the full retry budget.
 * Returns { success, postId?, postUrl?, message }.
 */
async function attemptLinkedInTarget(post, targetUrn) {
  const permanentFailures = [
    'session expired', 'please reconnect', 'no valid',
    'not configured', 'not supported', 'not available',
    'connect', 'token expired',
  ];

  const api = await getLinkedInApi();
  if (!api) return { success: false, message: 'LinkedIn API service not available' };

  // Same caption_only guard as attemptPost: a caption-only post never attaches an
  // image, even on the multi-target path. All other modes keep legacy behaviour.
  const effectiveImageUrl = post.image_mode === 'caption_only' ? null : post.post_image_url;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt] || 120_000;
      console.log(`[SCHEDULER] Retry ${attempt}/${MAX_RETRIES - 1} for target ${targetUrn} (post ${post.id}) in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }

    let result;
    try {
      result = await api.createLinkedInPostViaAPI(post.user_id, post.post_text, effectiveImageUrl, targetUrn);
    } catch (err) {
      const isFinal = attempt === MAX_RETRIES - 1;
      if (isFinal) return { success: false, message: `Failed after ${MAX_RETRIES} attempts: ${err.message}` };
      continue;
    }

    if (result.success) return result;

    const msgLower = (result.message || '').toLowerCase();
    const isPermanent = permanentFailures.some(f => msgLower.includes(f));
    if (isPermanent) return result;

    const isFinal = attempt === MAX_RETRIES - 1;
    if (isFinal) return { success: false, message: `Failed after ${MAX_RETRIES} attempts: ${result.message}` };
  }

  return { success: false, message: `Exhausted ${MAX_RETRIES} attempts` };
}

/**
 * Multi-target LinkedIn fan-out (Option B data model).
 * Publishes each scheduled_post_targets row SEQUENTIALLY (cap 5).
 * Rolls up the parent status: all posted → 'posted', mix → 'partial_failure',
 * all failed → 'failed'. partial_failure is terminal / user-retry-only.
 */
async function processLinkedInTargets(post, targets) {
  const now = () => new Date().toISOString();

  // Cap enforced by the route at insert time; fail fast here as a safety net
  if (targets.length > 5) {
    await supabase
      .from('scheduled_posts')
      .update({ status: 'failed', error_message: 'Too many targets (max 5)', updated_at: now() })
      .eq('id', post.id);
    return;
  }

  // Only process targets that still need work (idempotent for retries)
  const pending = targets.filter(t => t.status === 'pending' || t.status === 'failed');

  for (const target of pending) {
    // Mark as in-flight
    await supabase
      .from('scheduled_post_targets')
      .update({ status: 'posting', updated_at: now() })
      .eq('id', target.id);

    console.log(`[SCHEDULER] Publishing post ${post.id} to target ${target.target_urn}...`);
    const result = await attemptLinkedInTarget(post, target.target_urn);

    if (result.success) {
      await supabase
        .from('scheduled_post_targets')
        .update({
          status: 'posted',
          external_post_id: result.postId || null,
          external_post_url: result.postUrl || null,
          posted_at: now(),
          updated_at: now(),
        })
        .eq('id', target.id);
      console.log(`[SCHEDULER] Target ${target.target_urn} posted (post ${post.id})`);
    } else {
      await supabase
        .from('scheduled_post_targets')
        .update({
          status: 'failed',
          error_message: result.message,
          retry_count: (target.retry_count || 0) + 1,
          updated_at: now(),
        })
        .eq('id', target.id);
      console.warn(`[SCHEDULER] Target ${target.target_urn} failed (post ${post.id}): ${result.message}`);
      // Continue to the next target — don't abort the loop on a single failure
    }
  }

  // ── Roll up parent status ──────────────────────────────────────────────────
  // Re-read final target statuses (includes any already-posted rows from a
  // previous partial run, so this is idempotent for retries).
  const { data: finalTargets } = await supabase
    .from('scheduled_post_targets')
    .select('status, target_type, external_post_id, external_post_url')
    .eq('scheduled_post_id', post.id);

  const all = finalTargets || [];
  const postedCount  = all.filter(t => t.status === 'posted').length;
  const failedCount  = all.filter(t => t.status === 'failed').length;
  const totalCount   = all.length;

  let parentStatus;
  if (postedCount === totalCount)      parentStatus = 'posted';
  else if (postedCount > 0)            parentStatus = 'partial_failure';
  else                                 parentStatus = 'failed';

  // Mirror the person target's external_post_id/url onto the parent for
  // backward-compat display (UI reads these columns off the parent row).
  const personTarget = all.find(t => t.target_type === 'person' && t.status === 'posted');
  const firstPosted  = all.find(t => t.status === 'posted');
  const refTarget    = personTarget || firstPosted || null;

  await supabase
    .from('scheduled_posts')
    .update({
      status: parentStatus,
      external_post_id:  refTarget?.external_post_id  || null,
      external_post_url: refTarget?.external_post_url || null,
      posted_at: postedCount > 0 ? now() : null,
      error_message: parentStatus !== 'posted'
        ? `${failedCount}/${totalCount} target(s) failed`
        : null,
      updated_at: now(),
    })
    .eq('id', post.id);

  console.log(`[SCHEDULER] Post ${post.id} roll-up: ${parentStatus} (${postedCount}/${totalCount} posted)`);
}

/**
 * Process a single scheduled post with retry logic.
 * - LinkedIn with target rows: fan-out per target, roll up parent status.
 * - LinkedIn without target rows: legacy 1:1 personal-profile path (unchanged).
 * - Other platforms: unchanged single-publish path.
 * Retries up to 3 times with exponential backoff (0s, 5s, 15s).
 * Permanent failures (expired tokens, missing connections) are not retried.
 */
export async function processPost(post) {
  console.log(`[SCHEDULER] Processing post ${post.id} (${post.platform}) scheduled for ${post.scheduled_at}`);

  // ── LinkedIn multi-target fan-out ──────────────────────────────────────────
  if (post.platform === 'linkedin') {
    const { data: targets } = await supabase
      .from('scheduled_post_targets')
      .select('*')
      .eq('scheduled_post_id', post.id)
      .order('created_at', { ascending: true });

    if (targets && targets.length > 0) {
      // Multi-target path: fan-out, each target published sequentially
      await processLinkedInTargets(post, targets);
      return;
    }
    // No target rows → fall through to legacy single-publish path below
  }

  // ── Legacy 1:1 path (personal LinkedIn, Twitter, Facebook, Instagram) ───────
  const permanentFailures = [
    'session expired', 'please reconnect', 'no valid',
    'not configured', 'not supported', 'not available',
    'connect', 'token expired',
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] || 120_000;
        console.log(`[SCHEDULER] Retry ${attempt}/${MAX_RETRIES - 1} for post ${post.id} in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const result = await attemptPost(post);

      if (result.success) {
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'posted',
            external_post_id: result.postId || null,
            external_post_url: result.postUrl || null,
            posted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        console.log(`[SCHEDULER] Post ${post.id} published successfully (attempt ${attempt + 1})`);
        return;
      }

      // Check if this is a permanent failure (no point retrying)
      const msgLower = (result.message || '').toLowerCase();
      const isPermanent = permanentFailures.some(f => msgLower.includes(f));

      if (isPermanent) {
        console.error(`[SCHEDULER] Post ${post.id} permanently failed: ${result.message}`);
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            error_message: result.message,
            retry_count: attempt + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);
        return;
      }

      // Transient failure — retry if attempts remain.
      // Persist the latest error on every attempt so stuck posts are diagnosable
      // even if the function is killed before MAX_RETRIES completes.
      console.warn(`[SCHEDULER] Post ${post.id} attempt ${attempt + 1} failed: ${result.message}`);

      const isFinal = attempt === MAX_RETRIES - 1;
      await supabase
        .from('scheduled_posts')
        .update({
          status: isFinal ? 'failed' : 'posting',
          error_message: isFinal
            ? `Failed after ${MAX_RETRIES} attempts: ${result.message}`
            : `Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${result.message}`,
          retry_count: attempt + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);
    } catch (err) {
      console.error(`[SCHEDULER] Post ${post.id} attempt ${attempt + 1} threw:`, err.message);

      const isFinal = attempt === MAX_RETRIES - 1;
      await supabase
        .from('scheduled_posts')
        .update({
          status: isFinal ? 'failed' : 'posting',
          error_message: isFinal
            ? `Failed after ${MAX_RETRIES} attempts: ${err.message}`
            : `Attempt ${attempt + 1}/${MAX_RETRIES} threw: ${err.message}`,
          retry_count: attempt + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);
    }
  }
}

/**
 * Recover posts (and individual targets) stuck in 'posting' for more than 5 minutes.
 * A parent row stuck in 'posting' is reset to 'scheduled' so the cron can re-claim it.
 * A target row stuck in 'posting' is reset to 'pending' so processLinkedInTargets
 * will re-attempt it on the next processPost run.
 */
async function recoverStalePosts() {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // ── Recover stale parent rows ──────────────────────────────────────────────
    const { data: stalePosts, error } = await supabase
      .from('scheduled_posts')
      .select('id')
      .eq('status', 'posting')
      .lt('updated_at', fiveMinAgo);

    if (!error && stalePosts && stalePosts.length > 0) {
      console.log(`[SCHEDULER] Recovering ${stalePosts.length} stale post(s) stuck in 'posting'`);
      for (const post of stalePosts) {
        await supabase
          .from('scheduled_posts')
          .update({ status: 'scheduled', updated_at: new Date().toISOString() })
          .eq('id', post.id);
      }
    }

    // ── Recover stale target rows ──────────────────────────────────────────────
    // A target stuck in 'posting' means the publisher crashed mid-loop; reset it
    // to 'pending' so it will be retried on the next processPost invocation.
    const { data: staleTargets, error: tErr } = await supabase
      .from('scheduled_post_targets')
      .select('id')
      .eq('status', 'posting')
      .lt('updated_at', fiveMinAgo);

    if (!tErr && staleTargets && staleTargets.length > 0) {
      console.log(`[SCHEDULER] Recovering ${staleTargets.length} stale target(s) stuck in 'posting'`);
      for (const target of staleTargets) {
        await supabase
          .from('scheduled_post_targets')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', target.id);
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Error recovering stale posts:', err.message);
  }
}

/**
 * Check for due posts and process them.
 * Uses an atomic status transition (scheduled → posting) to prevent
 * duplicate processing when multiple cron instances run concurrently.
 * Returns the number of posts processed.
 */
export async function checkDuePosts() {
  try {
    await recoverStalePosts();

    const now = new Date().toISOString();

    // Atomically claim posts: only rows still in 'scheduled' state get updated.
    // Concurrent cron runs will not claim the same row twice because Supabase
    // (PostgreSQL) applies row-level locking on UPDATE.
    const { data: claimed, error } = await supabase
      .from('scheduled_posts')
      .update({ status: 'posting', updated_at: now })
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .select('*')
      .limit(5);

    if (error) {
      console.error('[SCHEDULER] Error claiming due posts:', error.message);
      return 0;
    }

    if (!claimed || claimed.length === 0) return 0;

    console.log(`[SCHEDULER] Claimed ${claimed.length} due post(s) at ${now}`);
    for (const post of claimed) {
      await processPost(post);
    }
    return claimed.length;
  } catch (err) {
    console.error('[SCHEDULER] Error in scheduler tick:', err.message);
    return 0;
  }
}
