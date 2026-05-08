// Metrics sync — fetches account-level + per-post analytics from each connected
// social platform and upserts into account_metrics / post_metrics.
//
// Goal: surface roughly the same data the user sees when they log into each
// platform's native analytics view. That means:
//   - profile snapshot (followers, following, post count, profile picture)
//   - 28/30-day rollups (impressions, reach, profile views, engagement)
//   - top-N recent posts with per-post stats
//   - platform-specific extras (mentions, link clicks, fan adds, etc) in extra_metrics
//
// Each platform fetcher is independent and fault-tolerant; one failing must
// not break others. We log warnings and surface per-platform error strings.

import { supabase } from '../config/supabase.js';
import { getValidAccessToken as getTwitterToken } from './twitter-api.js';
import { getValidAccessToken as getLinkedInToken } from './linkedin-api.js';
import { loadTokens as loadFacebookTokens } from './facebook-api.js';
import { loadTokens as loadInstagramTokens } from './instagram-api.js';

const FB_API_BASE = 'https://graph.facebook.com/v21.0';
const LINKEDIN_API_BASE = 'https://api.linkedin.com';
const TWITTER_API_BASE = 'https://api.twitter.com';

const RECENT_POSTS_LIMIT = 10;

// ── Twitter ─────────────────────────────────────────────────────────
async function syncTwitterAccount(userId, companyId) {
  const tokenData = await getTwitterToken(userId);
  if (!tokenData) return { skipped: 'not connected' };
  const accessToken = tokenData.accessToken;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Profile + public_metrics
  const profileRes = await fetch(
    `${TWITTER_API_BASE}/2/users/me?user.fields=public_metrics,profile_image_url,username,name,verified,description,created_at`,
    { headers }
  );
  if (!profileRes.ok) {
    const err = await profileRes.text();
    throw new Error(`Twitter /users/me ${profileRes.status}: ${err.slice(0, 200)}`);
  }
  const { data: profile } = await profileRes.json();
  const pm = profile?.public_metrics || {};

  // Recent tweets with full per-tweet metrics. The /2/users/:id/tweets endpoint
  // requires a paid X API tier; on the free tier it returns 402. We try it
  // first, then fall back to looking up individual tweets we sent through
  // ScribeShift (single-tweet lookup IS free).
  const recent = [];
  const extras = {};
  let timelineAccessible = false;
  try {
    const tweetsRes = await fetch(
      `${TWITTER_API_BASE}/2/users/${profile.id}/tweets?max_results=${RECENT_POSTS_LIMIT}&tweet.fields=public_metrics,organic_metrics,non_public_metrics,created_at,entities`,
      { headers }
    );
    if (tweetsRes.ok) {
      timelineAccessible = true;
      const t = await tweetsRes.json();
      let impressions30 = 0;
      let linkClicks30 = 0;
      for (const tweet of t.data || []) {
        const tpm = tweet.public_metrics || {};
        const org = tweet.organic_metrics || {};
        const np = tweet.non_public_metrics || {};
        const impressions = org.impression_count ?? np.impression_count ?? tpm.impression_count ?? null;
        const linkClicks = org.url_link_clicks ?? np.url_link_clicks ?? null;
        if (impressions) impressions30 += impressions;
        if (linkClicks) linkClicks30 += linkClicks;
        recent.push({
          id: tweet.id,
          text: tweet.text || '',
          posted_at: tweet.created_at,
          permalink: `https://twitter.com/${profile.username}/status/${tweet.id}`,
          impressions,
          likes: tpm.like_count ?? null,
          comments: tpm.reply_count ?? null,
          shares: tpm.retweet_count ?? null,
          quotes: tpm.quote_count ?? null,
          link_clicks: linkClicks,
        });
      }
      extras.tweet_impressions_estimate = impressions30 || null;
      extras.link_clicks_estimate = linkClicks30 || null;
    } else if (tweetsRes.status === 402) {
      extras.timeline_disclaimer = "Listing your full tweet timeline requires a paid X API tier. We can still fetch per-tweet metrics for tweets you've sent through ScribeShift — Refresh after publishing one.";
    } else {
      const err = await tweetsRes.text();
      console.warn(`[METRICS] Twitter /users/:id/tweets ${tweetsRes.status}: ${err.slice(0, 150)}`);
    }
  } catch (err) {
    console.warn(`[METRICS] Twitter recent-tweets failed: ${err.message}`);
  }

  // Fallback: look up tweets we sent via ScribeShift one-by-one (this works on
  // the free tier — single-tweet lookup is allowed).
  if (!timelineAccessible) {
    const { data: ourTweets } = await supabase
      .from('scheduled_posts')
      .select('post_text, posted_at, external_post_id, external_post_url')
      .eq('user_id', userId)
      .eq('platform', 'twitter')
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(RECENT_POSTS_LIMIT);
    for (const t of ourTweets || []) {
      if (!t.external_post_id) continue;
      try {
        const r = await fetch(
          `${TWITTER_API_BASE}/2/tweets/${t.external_post_id}?tweet.fields=public_metrics,organic_metrics,non_public_metrics,created_at`,
          { headers }
        );
        if (!r.ok) continue;
        const { data: tweet } = await r.json();
        const tpm = tweet?.public_metrics || {};
        const org = tweet?.organic_metrics || {};
        const np = tweet?.non_public_metrics || {};
        recent.push({
          id: t.external_post_id,
          text: tweet?.text || t.post_text || '',
          posted_at: tweet?.created_at || t.posted_at,
          permalink: t.external_post_url || `https://twitter.com/${profile.username}/status/${t.external_post_id}`,
          impressions: org.impression_count ?? np.impression_count ?? tpm.impression_count ?? null,
          likes: tpm.like_count ?? null,
          comments: tpm.reply_count ?? null,
          shares: tpm.retweet_count ?? null,
          quotes: tpm.quote_count ?? null,
          link_clicks: org.url_link_clicks ?? np.url_link_clicks ?? null,
        });
      } catch { /* skip individual failures */ }
    }
  }

  return {
    platform: 'twitter',
    platform_user_id: profile?.id || null,
    platform_user_name: profile?.username || profile?.name || null,
    followers: pm.followers_count ?? null,
    following: pm.following_count ?? null,
    posts_count: pm.tweet_count ?? null,
    impressions_30d: extras.tweet_impressions_estimate ?? null,
    raw_data: profile || {},
    recent_posts: recent,
    extra_metrics: {
      ...extras,
      verified: profile?.verified ?? null,
      profile_image_url: profile?.profile_image_url ?? null,
      bio: profile?.description ?? null,
      account_created_at: profile?.created_at ?? null,
      listed_count: pm.listed_count ?? null,
    },
  };
}

async function syncTwitterPost(userId, scheduledPostId, externalId) {
  const tokenData = await getTwitterToken(userId);
  if (!tokenData) return null;
  const res = await fetch(
    `${TWITTER_API_BASE}/2/tweets/${externalId}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`,
    { headers: { Authorization: `Bearer ${tokenData.accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.text();
    console.warn(`[METRICS] Twitter post ${externalId} ${res.status}: ${err.slice(0, 150)}`);
    return null;
  }
  const { data } = await res.json();
  const pm = data?.public_metrics || {};
  const om = data?.organic_metrics || {};
  const np = data?.non_public_metrics || {};
  return {
    impressions: om.impression_count ?? np.impression_count ?? pm.impression_count ?? null,
    reactions: pm.like_count ?? null,
    comments: pm.reply_count ?? null,
    shares: pm.retweet_count ?? null,
    clicks: om.url_link_clicks ?? np.url_link_clicks ?? null,
    raw_data: data,
  };
}

// ── LinkedIn ────────────────────────────────────────────────────────
async function syncLinkedInAccount(userId, companyId) {
  const tokenData = await getLinkedInToken(userId);
  if (!tokenData) return { skipped: 'not connected' };
  const accessToken = tokenData.accessToken;
  const personId = tokenData.personId;

  // Basic profile via OIDC userinfo
  const profileRes = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    throw new Error(`LinkedIn /v2/userinfo ${profileRes.status}`);
  }
  const profile = await profileRes.json();

  // Network connection count via /v2/connections (deprecated for 3rd party
  // apps but still returns something for some accounts). Best-effort.
  let connectionsCount = null;
  try {
    const connRes = await fetch(
      `${LINKEDIN_API_BASE}/v2/connections?q=viewer&start=0&count=0`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    if (connRes.ok) {
      const conn = await connRes.json();
      connectionsCount = conn?.paging?.total ?? null;
    }
  } catch (err) {
    console.warn(`[METRICS] LinkedIn connections failed: ${err.message}`);
  }

  // Recent ScribeShift-tracked posts (since LinkedIn doesn't expose member
  // post lists via API for 3rd-parties, we surface what we shipped via
  // the platform itself, with their socialActions stats).
  const { data: ourPosts } = await supabase
    .from('scheduled_posts')
    .select('id, post_text, posted_at, external_post_id, external_post_url')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(RECENT_POSTS_LIMIT);

  const recent = [];
  for (const post of ourPosts || []) {
    if (!post.external_post_id) continue;
    try {
      const urn = encodeURIComponent(post.external_post_id);
      const r = await fetch(`${LINKEDIN_API_BASE}/v2/socialActions/${urn}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });
      let likes = null, comments = null;
      if (r.ok) {
        const d = await r.json();
        likes = d?.likesSummary?.totalLikes ?? null;
        comments = d?.commentsSummary?.aggregatedTotalComments ?? null;
      } else {
        const err = await r.text();
        console.warn(`[METRICS] LinkedIn socialActions ${r.status} for ${post.external_post_id}: ${err.slice(0, 200)}`);
      }
      recent.push({
        id: post.external_post_id,
        text: post.post_text || '',
        posted_at: post.posted_at,
        permalink: post.external_post_url || null,
        impressions: null,
        likes,
        comments,
        shares: null,
        link_clicks: null,
      });
    } catch (err) {
      console.warn(`[METRICS] LinkedIn socialActions for ${post.external_post_id} failed: ${err.message}`);
    }
  }

  return {
    platform: 'linkedin',
    platform_user_id: personId || profile?.sub || null,
    platform_user_name: profile?.name || tokenData.personName || null,
    followers: connectionsCount,
    following: null,
    posts_count: ourPosts?.length || null,
    raw_data: profile || {},
    recent_posts: recent,
    extra_metrics: {
      profile_image_url: profile?.picture ?? null,
      email: profile?.email ?? null,
      connections_count: connectionsCount,
      followers_disclaimer: connectionsCount == null
        ? "LinkedIn restricts member analytics. Our app currently has the write-only scope (w_member_social) — to read follower counts, post impressions, or per-post engagement, LinkedIn requires r_member_social or r_organization_social, which they only grant to LinkedIn Marketing partners (multi-month application)."
        : null,
    },
  };
}

async function syncLinkedInPost(userId, scheduledPostId, externalId) {
  const tokenData = await getLinkedInToken(userId);
  if (!tokenData) return null;
  const urn = encodeURIComponent(externalId);
  const res = await fetch(
    `${LINKEDIN_API_BASE}/v2/socialActions/${urn}`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    impressions: null,
    reactions: data?.likesSummary?.totalLikes ?? null,
    comments: data?.commentsSummary?.aggregatedTotalComments ?? null,
    shares: null,
    clicks: null,
    raw_data: data,
  };
}

// ── Facebook ────────────────────────────────────────────────────────
async function syncFacebookAccount(userId, companyId) {
  const tokens = await loadFacebookTokens(userId);
  if (!tokens) return { skipped: 'not connected' };
  const at = tokens.accessToken;

  // Page profile
  const fields = 'name,username,fan_count,followers_count,about,category,picture,link,verification_status';
  const pageRes = await fetch(`${FB_API_BASE}/${tokens.pageId}?fields=${fields}&access_token=${at}`);
  if (!pageRes.ok) {
    const err = await pageRes.text();
    throw new Error(`Facebook /${tokens.pageId} ${pageRes.status}: ${err.slice(0, 200)}`);
  }
  const page = await pageRes.json();

  // Page-level insights. FB Graph v21 split many metrics across different
  // permission/access tiers. Some need "Advanced Access" approval, others
  // work with standard pages_read_engagement we already have. We ask each
  // metric individually with the period FB recommends for it — and try
  // alternative period values when the default fails.
  const extras = {};
  let reach30 = null;
  let impressions30 = null;
  // Each entry: metric key, where to store, period(s) to try in order.
  const fbMetrics = [
    { key: 'page_impressions',           dst: 'impressions_30d',     periods: ['day', 'days_28'] },
    { key: 'page_impressions_unique',    dst: 'reach_30d',           periods: ['day', 'days_28'] },
    { key: 'page_post_engagements',      dst: 'engagement_30d',      periods: ['day', 'days_28'] },
    { key: 'page_fans',                  dst: 'page_fans_total',     periods: ['day'] },
    { key: 'page_views_total',           dst: 'page_views_30d',      periods: ['day', 'days_28'] },
  ];
  const insightErrors = [];
  for (const m of fbMetrics) {
    let landed = false;
    for (const period of m.periods) {
      try {
        const r = await fetch(
          `${FB_API_BASE}/${tokens.pageId}/insights?metric=${m.key}&period=${period}&access_token=${at}`
        );
        if (r.ok) {
          const j = await r.json();
          // For metrics with period=day across days_28 we'd ideally sum, but
          // FB returns the most recent day's value — close enough for the
          // headline number and far better than nothing.
          const values = j.data?.[0]?.values || [];
          let value = values[values.length - 1]?.value;
          if (value == null) value = values[0]?.value;
          if (value != null) {
            if (m.dst === 'impressions_30d') impressions30 = value;
            else if (m.dst === 'reach_30d') reach30 = value;
            else extras[m.dst] = value;
            landed = true;
          }
          break;
        } else {
          const err = await r.text();
          // Only record the LAST error per metric; suppress retries on 100/200 if metric simply doesn't exist
          insightErrors.push(`${m.key} (${period}): ${r.status}`);
          console.warn(`[METRICS] FB ${m.key} period=${period} ${r.status}: ${err.slice(0, 120)}`);
          // If FB says metric is invalid, no point retrying with another period
          if (err.includes('valid insights metric')) break;
        }
      } catch (err) {
        insightErrors.push(`${m.key}: ${err.message}`);
      }
    }
  }
  if (impressions30 == null && reach30 == null && Object.keys(extras).length === 0 && insightErrors.length > 0) {
    extras.insights_error = 'Facebook page insights are unavailable for this Page right now. This usually means the FB App needs "Advanced Access" approval for the Page Insights API, or the page is too new / has too few followers for FB to surface metrics.';
  }

  // Recent posts with their reactions/comments/shares
  const recent = [];
  try {
    const postsRes = await fetch(
      `${FB_API_BASE}/${tokens.pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares&limit=${RECENT_POSTS_LIMIT}&access_token=${at}`
    );
    if (postsRes.ok) {
      const posts = await postsRes.json();
      for (const post of posts.data || []) {
        let impressions = null, clicks = null;
        try {
          const piRes = await fetch(
            `${FB_API_BASE}/${post.id}/insights?metric=post_impressions,post_clicks&access_token=${at}`
          );
          if (piRes.ok) {
            const pi = await piRes.json();
            for (const m of pi.data || []) {
              const v = m.values?.[0]?.value;
              if (m.name === 'post_impressions') impressions = v ?? null;
              if (m.name === 'post_clicks') clicks = v ?? null;
            }
          }
        } catch { /* ignore per-post failure */ }
        recent.push({
          id: post.id,
          text: post.message || '',
          posted_at: post.created_time,
          permalink: post.permalink_url || null,
          image_url: post.full_picture || null,
          impressions,
          likes: post.reactions?.summary?.total_count ?? null,
          comments: post.comments?.summary?.total_count ?? null,
          shares: post.shares?.count ?? null,
          link_clicks: clicks,
        });
      }
    }
  } catch (err) {
    console.warn(`[METRICS] Facebook recent-posts failed: ${err.message}`);
  }

  return {
    platform: 'facebook',
    platform_user_id: tokens.pageId,
    platform_user_name: page?.name || tokens.pageName || null,
    followers: page?.followers_count ?? page?.fan_count ?? null,
    following: null,
    posts_count: null,
    impressions_30d: impressions30,
    engagement_30d: reach30,
    raw_data: page || {},
    recent_posts: recent,
    extra_metrics: {
      ...extras,
      profile_image_url: page?.picture?.data?.url ?? null,
      page_url: page?.link ?? null,
      category: page?.category ?? null,
      about: page?.about ?? null,
      fan_count: page?.fan_count ?? null,
      verified: page?.verification_status ? page.verification_status !== 'not_verified' : null,
    },
  };
}

async function syncFacebookPost(userId, scheduledPostId, externalId) {
  const tokens = await loadFacebookTokens(userId);
  if (!tokens) return null;
  const metrics = ['post_impressions', 'post_engaged_users', 'post_clicks', 'post_reactions_by_type_total'];
  const res = await fetch(
    `${FB_API_BASE}/${externalId}/insights?metric=${metrics.join(',')}&access_token=${tokens.accessToken}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const out = { impressions: null, reactions: null, comments: null, shares: null, clicks: null, raw_data: data };
  for (const m of data.data || []) {
    const value = m.values?.[0]?.value;
    if (m.name === 'post_impressions') out.impressions = value ?? null;
    if (m.name === 'post_engaged_users') out.engagement = value ?? null;
    if (m.name === 'post_clicks') out.clicks = value ?? null;
    if (m.name === 'post_reactions_by_type_total' && value && typeof value === 'object') {
      out.reactions = Object.values(value).reduce((a, b) => a + (Number(b) || 0), 0);
    }
  }
  return out;
}

// ── Instagram ───────────────────────────────────────────────────────
async function syncInstagramAccount(userId, companyId) {
  const tokens = await loadInstagramTokens(userId);
  if (!tokens) return { skipped: 'not connected' };
  const at = tokens.accessToken;

  // Account profile
  const fields = 'username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website';
  const profileRes = await fetch(`${FB_API_BASE}/${tokens.igUserId}?fields=${fields}&access_token=${at}`);
  if (!profileRes.ok) {
    const err = await profileRes.text();
    throw new Error(`Instagram /${tokens.igUserId} ${profileRes.status}: ${err.slice(0, 200)}`);
  }
  const profile = await profileRes.json();

  // Account-level insights — IG Graph API v21 changed metric names and
  // parameter requirements. Each metric is asked for individually with
  // its specific period + metric_type so one bad call doesn't break others.
  const extras = {};
  let reach30 = null;
  let impressions30 = null;
  let profileViews30 = null;
  // IG Graph v21+ requires period=day for total_value-style metrics; only
  // `reach` accepts days_28 directly.
  const igMetrics = [
    { key: 'reach',            period: 'days_28', mt: null },
    { key: 'views',            period: 'day',     mt: 'total_value' },
    { key: 'profile_views',    period: 'day',     mt: 'total_value' },
    { key: 'website_clicks',   period: 'day',     mt: 'total_value' },
    { key: 'follower_count',   period: 'day',     mt: null },
    { key: 'accounts_engaged', period: 'day',     mt: 'total_value' },
  ];
  const igErrors = [];
  for (const m of igMetrics) {
    try {
      const params = new URLSearchParams({
        metric: m.key,
        period: m.period,
        access_token: at,
      });
      if (m.mt) params.set('metric_type', m.mt);
      const r = await fetch(`${FB_API_BASE}/${tokens.igUserId}/insights?${params.toString()}`);
      if (r.ok) {
        const j = await r.json();
        // total_value-style responses come back as { total_value: { value: N } }
        // simple period responses come back as { values: [{ value: N }] }
        const total = j.data?.[0]?.total_value?.value;
        const series = j.data?.[0]?.values?.[0]?.value;
        const value = total ?? series;
        if (value == null) continue;
        if (m.key === 'reach') reach30 = value;
        else if (m.key === 'views') impressions30 = value;
        else if (m.key === 'profile_views') profileViews30 = value;
        else if (m.key === 'website_clicks') extras.website_clicks_30d = value;
        else if (m.key === 'follower_count') extras.follower_growth_30d = value;
        else if (m.key === 'accounts_engaged') extras.accounts_engaged_30d = value;
      } else {
        const err = await r.text();
        igErrors.push(`${m.key}: ${r.status}`);
        console.warn(`[METRICS] IG ${m.key} ${r.status}: ${err.slice(0, 200)}`);
      }
    } catch (err) {
      igErrors.push(`${m.key}: ${err.message}`);
    }
  }
  if (igErrors.length > 0 && reach30 == null && impressions30 == null && profileViews30 == null && Object.keys(extras).filter(k => !['profile_image_url','bio','website'].includes(k)).length === 0) {
    extras.insights_error = `Instagram insights unavailable. Reconnect Instagram in Settings to grant the new instagram_manage_insights permission. (${igErrors[0]})`;
  }

  // Recent media + per-media insights
  const recent = [];
  try {
    const mediaRes = await fetch(
      `${FB_API_BASE}/${tokens.igUserId}/media?fields=id,caption,media_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count&limit=${RECENT_POSTS_LIMIT}&access_token=${at}`
    );
    if (mediaRes.ok) {
      const media = await mediaRes.json();
      for (const m of media.data || []) {
        let impressions = null, reach = null, saved = null;
        try {
          // Different media types support different insight metrics.
          const metricsByType = {
            IMAGE: 'impressions,reach,saved',
            VIDEO: 'impressions,reach,saved',
            CAROUSEL_ALBUM: 'impressions,reach,saved',
            REELS: 'plays,reach,saved',
          };
          const want = metricsByType[m.media_type] || 'reach,saved';
          const piRes = await fetch(`${FB_API_BASE}/${m.id}/insights?metric=${want}&access_token=${at}`);
          if (piRes.ok) {
            const pi = await piRes.json();
            for (const ins of pi.data || []) {
              const v = ins.values?.[0]?.value;
              if (ins.name === 'impressions' || ins.name === 'plays') impressions = v ?? null;
              if (ins.name === 'reach') reach = v ?? null;
              if (ins.name === 'saved') saved = v ?? null;
            }
          }
        } catch { /* ignore per-post failure */ }
        recent.push({
          id: m.id,
          text: m.caption || '',
          posted_at: m.timestamp,
          permalink: m.permalink || null,
          image_url: m.thumbnail_url || m.media_url || null,
          media_type: m.media_type,
          impressions,
          reach,
          saved,
          likes: m.like_count ?? null,
          comments: m.comments_count ?? null,
        });
      }
    }
  } catch (err) {
    console.warn(`[METRICS] Instagram recent-media failed: ${err.message}`);
  }

  return {
    platform: 'instagram',
    platform_user_id: tokens.igUserId,
    platform_user_name: profile?.username || tokens.igUsername || null,
    followers: profile?.followers_count ?? null,
    following: profile?.follows_count ?? null,
    posts_count: profile?.media_count ?? null,
    profile_views_30d: profileViews30,
    reach_30d: reach30,
    impressions_30d: impressions30,
    raw_data: profile || {},
    recent_posts: recent,
    extra_metrics: {
      ...extras,
      profile_image_url: profile?.profile_picture_url ?? null,
      bio: profile?.biography ?? null,
      website: profile?.website ?? null,
    },
  };
}

async function syncInstagramPost(userId, scheduledPostId, externalId) {
  const tokens = await loadInstagramTokens(userId);
  if (!tokens) return null;
  const metrics = ['impressions', 'reach', 'engagement', 'saved'];
  const res = await fetch(
    `${FB_API_BASE}/${externalId}/insights?metric=${metrics.join(',')}&access_token=${tokens.accessToken}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const out = { impressions: null, reactions: null, comments: null, shares: null, clicks: null, raw_data: data };
  for (const m of data.data || []) {
    const value = m.values?.[0]?.value;
    if (m.name === 'impressions') out.impressions = value ?? null;
    if (m.name === 'engagement') out.reactions = value ?? null;
  }
  return out;
}

// ── Public API ──────────────────────────────────────────────────────

const ACCOUNT_FETCHERS = {
  twitter: syncTwitterAccount,
  linkedin: syncLinkedInAccount,
  facebook: syncFacebookAccount,
  instagram: syncInstagramAccount,
};

const POST_FETCHERS = {
  twitter: syncTwitterPost,
  linkedin: syncLinkedInPost,
  facebook: syncFacebookPost,
  instagram: syncInstagramPost,
};

export async function refreshAccountMetrics(userId, companyId) {
  const platforms = Object.keys(ACCOUNT_FETCHERS);
  const results = {};
  for (const platform of platforms) {
    try {
      const data = await ACCOUNT_FETCHERS[platform](userId, companyId);
      if (data?.skipped) {
        results[platform] = { status: 'skipped', reason: data.skipped };
        continue;
      }
      const row = {
        user_id: userId,
        company_id: companyId,
        platform,
        platform_user_id: data.platform_user_id || null,
        platform_user_name: data.platform_user_name || null,
        followers: data.followers ?? null,
        following: data.following ?? null,
        posts_count: data.posts_count ?? null,
        profile_views_30d: data.profile_views_30d ?? null,
        reach_30d: data.reach_30d ?? null,
        impressions_30d: data.impressions_30d ?? null,
        engagement_30d: data.engagement_30d ?? null,
        raw_data: data.raw_data || {},
        recent_posts: data.recent_posts || [],
        extra_metrics: data.extra_metrics || {},
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('account_metrics')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', platform)
        .maybeSingle();

      if (existing) {
        await supabase.from('account_metrics').update(row).eq('id', existing.id);
      } else {
        await supabase.from('account_metrics').insert(row);
      }
      results[platform] = {
        status: 'ok',
        followers: row.followers,
        recent_posts: row.recent_posts.length,
      };
    } catch (err) {
      console.error(`[METRICS] ${platform} account sync failed:`, err.message);
      results[platform] = { status: 'error', error: err.message };
    }
  }
  return results;
}

export async function refreshPostMetrics(userId, companyId, { limit = 50 } = {}) {
  const { data: posts, error } = await supabase
    .from('scheduled_posts')
    .select('id, platform, external_post_id, brand_id')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .not('external_post_id', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[METRICS] post list query failed:', error.message);
    return { synced: 0, errors: [error.message] };
  }

  let synced = 0;
  const errors = [];
  for (const post of posts || []) {
    const fetcher = POST_FETCHERS[post.platform];
    if (!fetcher) continue;
    try {
      const data = await fetcher(userId, post.id, post.external_post_id);
      if (!data) continue;
      const row = {
        scheduled_post_id: post.id,
        brand_id: post.brand_id || null,
        company_id: companyId,
        platform: post.platform,
        impressions: data.impressions ?? null,
        reactions: data.reactions ?? null,
        comments: data.comments ?? null,
        shares: data.shares ?? null,
        clicks: data.clicks ?? null,
        engagement_rate: (data.impressions && (data.reactions || data.comments || data.shares))
          ? Number((((data.reactions || 0) + (data.comments || 0) + (data.shares || 0)) / data.impressions * 100).toFixed(2))
          : null,
        raw_data: data.raw_data || {},
        source: 'api_sync',
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('post_metrics')
        .select('id')
        .eq('scheduled_post_id', post.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('post_metrics').update(row).eq('id', existing.id);
      } else {
        await supabase.from('post_metrics').insert(row);
      }

      await supabase.from('scheduled_posts')
        .update({ metrics_synced_at: new Date().toISOString() })
        .eq('id', post.id);

      synced++;
    } catch (err) {
      errors.push(`${post.platform}/${post.id}: ${err.message}`);
    }
  }
  return { synced, total: posts?.length || 0, errors };
}

export async function refreshAll(userId, companyId) {
  const [accounts, posts] = await Promise.all([
    refreshAccountMetrics(userId, companyId),
    refreshPostMetrics(userId, companyId),
  ]);
  return { accounts, posts, refreshed_at: new Date().toISOString() };
}
