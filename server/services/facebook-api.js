import { encrypt, decrypt } from './encryption.js';
import { supabase } from '../config/supabase.js';
import { createState, consumeState } from './oauth-state.js';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:4321/api/auth/facebook/callback';

const FB_AUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const FB_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const FB_API_BASE = 'https://graph.facebook.com/v21.0';

// business_management is required so Facebook Login for Business tokens can
// list the user's Businesses and their owned Pages — /me/accounts returns
// empty for FBLB tokens so we fall back to the Business → owned_pages path.
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement,business_management';
const PLATFORM = 'facebook';

// ── Generate OAuth authorization URL ────────────────────────────────
export function getAuthorizationUrl(userId, companyId) {
  if (!FACEBOOK_APP_ID) throw new Error('FACEBOOK_APP_ID not configured');

  const state = createState({ userId, companyId });

  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    state,
    scope: SCOPES,
    response_type: 'code',
  });

  return { url: `${FB_AUTH_URL}?${params}`, state };
}

export { consumeState };

// ── Exchange code for short-lived user token ────────────────────────
export async function exchangeCodeForTokens(code) {
  const res = await fetch(`${FB_TOKEN_URL}?${new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    code,
  })}`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

// ── Exchange short-lived token for long-lived token ─────────────────
async function getLongLivedToken(shortLivedToken) {
  const res = await fetch(`${FB_TOKEN_URL}?${new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  })}`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook long-lived token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in, // ~60 days
  };
}

// ── Get user's Pages and their Page Access Tokens ───────────────────
// Tries two paths because Facebook Login for Business and standard Facebook
// Login behave differently:
//   1. /me/accounts — works with standard Facebook Login (returns Pages the
//      user personally admins).
//   2. /me/businesses → /{business_id}/owned_pages — works with FBLB tokens,
//      which return [] from /me/accounts even when permissions are granted.
export async function getUserPages(userAccessToken) {
  const headers = { Authorization: `Bearer ${userAccessToken}` };
  const mapPage = (page) => ({
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    picture: page.picture?.data?.url,
  });

  // Path 1: standard Facebook Login
  const meAccountsRes = await fetch(
    `${FB_API_BASE}/me/accounts?fields=id,name,access_token,picture`,
    { headers }
  );
  if (meAccountsRes.ok) {
    const { data = [] } = await meAccountsRes.json();
    if (data.length > 0) {
      console.log(`[FB] Found ${data.length} Page(s) via /me/accounts`);
      return data.map(mapPage);
    }
    console.log('[FB] /me/accounts returned 0 Pages — trying Business path (FBLB)');
  } else {
    const err = await meAccountsRes.text();
    console.warn(`[FB] /me/accounts failed (${meAccountsRes.status}): ${err.slice(0, 200)} — trying Business path`);
  }

  // Path 2: Facebook Login for Business — list Businesses, then owned Pages
  const businessesRes = await fetch(`${FB_API_BASE}/me/businesses?fields=id,name`, { headers });
  if (!businessesRes.ok) {
    const err = await businessesRes.text();
    throw new Error(`Facebook pages fetch failed: /me/accounts returned no Pages and /me/businesses failed (${businessesRes.status}): ${err.slice(0, 200)}`);
  }
  const { data: businesses = [] } = await businessesRes.json();
  if (businesses.length === 0) {
    return []; // truly no Pages and no Businesses
  }

  const allPages = [];
  for (const business of businesses) {
    const ownedRes = await fetch(
      `${FB_API_BASE}/${business.id}/owned_pages?fields=id,name,access_token,picture`,
      { headers }
    );
    if (!ownedRes.ok) {
      const err = await ownedRes.text();
      console.warn(`[FB] owned_pages fetch failed for business ${business.id} (${ownedRes.status}): ${err.slice(0, 200)}`);
      continue;
    }
    const { data: pages = [] } = await ownedRes.json();
    console.log(`[FB] Business "${business.name}" has ${pages.length} owned Page(s)`);
    for (const page of pages) allPages.push(mapPage(page));
  }
  return allPages;
}

// ── Get user profile ────────────────────────────────────────────────
export async function getUserProfile(accessToken) {
  const res = await fetch(`${FB_API_BASE}/me?fields=id,name,email,picture`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook profile failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    userId: data.id,
    name: data.name,
    email: data.email,
    picture: data.picture?.data?.url,
  };
}

// ── Store tokens (page access token + page ID) ─────────────────────
export async function storeTokens(userId, companyId, pageAccessToken, pageId, pageName, expiresIn) {
  const encAccessToken = encrypt(pageAccessToken);

  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const { data: existing } = await supabase
    .from('social_oauth_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', PLATFORM)
    .single();

  const tokenData = {
    user_id: userId,
    company_id: companyId,
    platform: PLATFORM,
    encrypted_access_token: encAccessToken.encrypted,
    access_token_iv: encAccessToken.iv,
    access_token_tag: encAccessToken.tag,
    encrypted_refresh_token: null,
    refresh_token_iv: null,
    refresh_token_tag: null,
    token_expires_at: expiresAt,
    platform_user_id: pageId,
    platform_user_name: pageName,
    scope: SCOPES,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from('social_oauth_tokens').update(tokenData).eq('id', existing.id);
    if (error) throw new Error(`Failed to update tokens: ${error.message}`);
    return existing.id;
  }

  const { data, error } = await supabase.from('social_oauth_tokens').insert(tokenData).select('id').single();
  if (error) throw new Error(`Failed to store tokens: ${error.message}`);
  return data.id;
}

// ── Load tokens ─────────────────────────────────────────────────────
export async function loadTokens(userId) {
  const { data, error } = await supabase
    .from('social_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', PLATFORM)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  const accessToken = decrypt(data.encrypted_access_token, data.access_token_iv, data.access_token_tag);

  return {
    id: data.id,
    accessToken,
    expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
    pageId: data.platform_user_id,
    pageName: data.platform_user_name,
  };
}

// ── Create a Facebook Page post ─────────────────────────────────────
export async function createFacebookPost(userId, text, imageUrl = null) {
  const tokens = await loadTokens(userId);
  if (!tokens) {
    return { success: false, message: 'No valid Facebook connection. Connect Facebook in Settings.' };
  }

  // Check expiry
  if (tokens.expiresAt && tokens.expiresAt.getTime() < Date.now()) {
    await supabase.from('social_oauth_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', tokens.id);
    return { success: false, message: 'Facebook token expired. Please reconnect.' };
  }

  const { accessToken, pageId } = tokens;

  try {
    let res;

    if (imageUrl) {
      // Post with photo — Facebook accepts a public URL
      res = await fetch(`${FB_API_BASE}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: imageUrl,
          caption: text,
          access_token: accessToken,
        }),
      });
    } else {
      // Text-only post
      res = await fetch(`${FB_API_BASE}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          access_token: accessToken,
        }),
      });
    }

    if (res.ok) {
      const data = await res.json();
      const postId = data.id || data.post_id;
      const postUrl = postId ? `https://www.facebook.com/${postId}` : null;
      console.log(`[FACEBOOK-API] Post created: ${postId}`);
      return { success: true, postId, postUrl, message: 'Facebook post published' };
    }

    const errBody = await res.text();
    console.error(`[FACEBOOK-API] Post failed (${res.status}):`, errBody);

    if (res.status === 401 || res.status === 190) {
      await supabase.from('social_oauth_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', tokens.id);
      return { success: false, message: 'Facebook session expired. Please reconnect.' };
    }

    return { success: false, message: `Facebook API error (${res.status}): ${errBody.substring(0, 200)}` };
  } catch (err) {
    console.error(`[FACEBOOK-API] Post error:`, err.message);
    return { success: false, message: `Failed to post: ${err.message}` };
  }
}

// ── Connection status ───────────────────────────────────────────────
export async function getConnectionStatus(userId) {
  const tokens = await loadTokens(userId);
  if (!tokens) return { connected: false };

  const isExpired = tokens.expiresAt && tokens.expiresAt.getTime() < Date.now();
  return {
    connected: true,
    personName: tokens.pageName,
    personId: tokens.pageId,
    expiresAt: tokens.expiresAt?.toISOString(),
    isExpired,
    canRefresh: false,
  };
}

// ── Disconnect ──────────────────────────────────────────────────────
export async function disconnect(userId) {
  const { error } = await supabase
    .from('social_oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('platform', PLATFORM);

  if (error) throw new Error(`Failed to disconnect: ${error.message}`);
  return { success: true };
}

export { FACEBOOK_APP_ID, getLongLivedToken };
