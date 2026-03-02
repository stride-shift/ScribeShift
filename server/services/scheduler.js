import { supabase } from '../config/supabase.js';

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

/**
 * Process a single scheduled post using official APIs for all platforms.
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
    const handlers = {
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

    const handler = handlers[post.platform];
    if (!handler) {
      result = { success: false, message: `Platform ${post.platform} not supported` };
    } else {
      result = await handler();
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
 * Returns the number of posts processed.
 */
export async function checkDuePosts() {
  try {
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
      return 0;
    }

    if (duePosts && duePosts.length > 0) {
      console.log(`[SCHEDULER] Found ${duePosts.length} due post(s) at ${now}`);
      for (const post of duePosts) {
        await processPost(post);
      }
      return duePosts.length;
    }

    return 0;
  } catch (err) {
    console.error('[SCHEDULER] Error in scheduler tick:', err.message);
    return 0;
  }
}
