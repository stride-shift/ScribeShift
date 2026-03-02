import cron from 'node-cron';
import { supabase } from '../config/supabase.js';

let playwrightService = null;
let linkedinApiService = null;

/**
 * Lazily load playwright service (used for Twitter, Facebook, Instagram).
 */
async function getPlaywright() {
  if (!playwrightService) {
    try {
      playwrightService = await import('./playwright.js');
    } catch {
      console.warn('[SCHEDULER] Playwright not available - non-LinkedIn posts will be marked as failed');
      return null;
    }
  }
  return playwrightService;
}

/**
 * Lazily load LinkedIn API service.
 */
async function getLinkedInApi() {
  if (!linkedinApiService) {
    try {
      linkedinApiService = await import('./linkedin-api.js');
    } catch {
      console.warn('[SCHEDULER] LinkedIn API service not available');
      return null;
    }
  }
  return linkedinApiService;
}

/**
 * Process a single scheduled post.
 * LinkedIn uses the official API; other platforms still use Playwright.
 */
export async function processPost(post) {
  console.log(`[SCHEDULER] Processing post ${post.id} (${post.platform}) scheduled for ${post.scheduled_at}`);

  // Mark as posting
  await supabase
    .from('scheduled_posts')
    .update({ status: 'posting', updated_at: new Date().toISOString() })
    .eq('id', post.id);

  let result;

  try {
    if (post.platform === 'linkedin') {
      // Use LinkedIn official API
      const linkedinApi = await getLinkedInApi();
      if (!linkedinApi) {
        result = { success: false, message: 'LinkedIn API service not available' };
      } else {
        result = await linkedinApi.createLinkedInPostViaAPI(
          post.user_id,
          post.post_text,
          post.post_image_url
        );
      }
    } else {
      // Other platforms use Playwright
      const pw = await getPlaywright();
      if (!pw) {
        result = { success: false, message: 'Playwright not available' };
      } else {
        const platformHandlers = {
          twitter: () => pw.createTwitterPost(post.post_text, post.post_image_url, post.user_id),
          facebook: () => pw.createFacebookPost(post.post_text, post.post_image_url, post.user_id),
          instagram: () => pw.createInstagramPost(post.post_text, post.post_image_url, post.user_id),
        };

        const handler = platformHandlers[post.platform];
        if (!handler) {
          result = { success: false, message: `Platform ${post.platform} not supported` };
        } else {
          result = await handler();
        }
      }
    }

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

      console.log(`[SCHEDULER] Post ${post.id} published successfully`);
    } else {
      console.error(`[SCHEDULER] Post ${post.id} failed: ${result.message}`);
      await supabase
        .from('scheduled_posts')
        .update({
          status: 'failed',
          error_message: result.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);
    }
  } catch (err) {
    console.error(`[SCHEDULER] Error processing post ${post.id}:`, err.message);
    await supabase
      .from('scheduled_posts')
      .update({
        status: 'failed',
        error_message: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);
  }
}

/**
 * Recover posts stuck in 'posting' for more than 5 minutes.
 * This handles cases where the server crashed mid-post.
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
 */
async function checkDuePosts() {
  try {
    // First recover any posts stuck in 'posting'
    await recoverStalePosts();

    const now = new Date().toISOString();
    const { data: duePosts, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('[SCHEDULER] Error fetching due posts:', error.message);
      return;
    }

    if (duePosts && duePosts.length > 0) {
      console.log(`[SCHEDULER] Found ${duePosts.length} due post(s) at ${now}`);
      for (const post of duePosts) {
        await processPost(post);
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Error in scheduler tick:', err.message);
  }
}

/**
 * Start the scheduler cron job.
 * Runs every minute to check for due posts.
 */
export function startScheduler() {
  console.log('[SCHEDULER] Starting post scheduler (checks every minute)');

  cron.schedule('* * * * *', () => {
    checkDuePosts();
  });

  // Also check immediately on startup
  checkDuePosts();
}
