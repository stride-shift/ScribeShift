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
const RETRY_DELAYS = [0, 30_000, 120_000]; // immediate, 30s, 2min

/**
 * Attempt to publish a post via the official API for the platform.
 * Returns { success, postUrl?, message }.
 */
async function attemptPost(post) {
  const apiHandlers = {
    linkedin: async () => {
      const api = await getLinkedInApi();
      if (!api) return { success: false, message: 'LinkedIn API service not available' };
      return api.createLinkedInPostViaAPI(post.user_id, post.post_text, post.post_image_url);
    },
    twitter: async () => {
      const api = await getTwitterApi();
      if (!api) return { success: false, message: 'Twitter API service not available' };
      return api.createTwitterPost(post.user_id, post.post_text, post.post_image_url);
    },
    facebook: async () => {
      const api = await getFacebookApi();
      if (!api) return { success: false, message: 'Facebook API service not available' };
      return api.createFacebookPost(post.user_id, post.post_text, post.post_image_url);
    },
    instagram: async () => {
      const api = await getInstagramApi();
      if (!api) return { success: false, message: 'Instagram API service not available' };
      return api.createInstagramPost(post.user_id, post.post_text, post.post_image_url);
    },
  };

  const handler = apiHandlers[post.platform];
  if (!handler) return { success: false, message: `Platform ${post.platform} not supported` };
  return handler();
}

/**
 * Process a single scheduled post with retry logic.
 * Retries up to 3 times with exponential backoff (0s, 30s, 2min).
 * Permanent failures (expired tokens, missing connections) are not retried.
 */
export async function processPost(post) {
  console.log(`[SCHEDULER] Processing post ${post.id} (${post.platform}) scheduled for ${post.scheduled_at}`);

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

      // Transient failure — retry if attempts remain
      console.warn(`[SCHEDULER] Post ${post.id} attempt ${attempt + 1} failed: ${result.message}`);

      if (attempt === MAX_RETRIES - 1) {
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            error_message: `Failed after ${MAX_RETRIES} attempts: ${result.message}`,
            retry_count: MAX_RETRIES,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);
      }
    } catch (err) {
      console.error(`[SCHEDULER] Post ${post.id} attempt ${attempt + 1} threw:`, err.message);

      if (attempt === MAX_RETRIES - 1) {
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            error_message: `Failed after ${MAX_RETRIES} attempts: ${err.message}`,
            retry_count: MAX_RETRIES,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);
      }
    }
  }
}

/**
 * Recover posts stuck in 'posting' for more than 5 minutes.
 */
async function recoverStalePosts() {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stalePosts, error } = await supabase
      .from('scheduled_posts')
      .select('id')
      .eq('status', 'posting')
      .lt('updated_at', fiveMinAgo);

    if (error || !stalePosts || stalePosts.length === 0) return;

    console.log(`[SCHEDULER] Recovering ${stalePosts.length} stale post(s) stuck in 'posting'`);
    for (const post of stalePosts) {
      await supabase
        .from('scheduled_posts')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', post.id);
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
