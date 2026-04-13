import { encrypt, decrypt } from './encryption.js';
import { supabase } from '../config/supabase.js';
import { createState, consumeState } from './oauth-state.js';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:4321/api/auth/instagram/callback';

const FB_AUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const FB_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const FB_API_BASE = 'https://graph.facebook.com/v21.0';

// Instagram Publishing requires these Facebook permissions
const SCOPES = 'instagram_basic,instagram_content_publish,pages_show_list';
const PLATFORM = 'instagram';

// ── Generate OAuth authorization URL ────────────────────────────────
export function getAuthorizationUrl(userId, companyId) {
  if (!FACEBOOK_APP_ID) throw new Error('FACEBOOK_APP_ID not configured');

  const state = createState({ userId, companyId });

  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    state,
    scope: SCOPES,
    response_type: 'code',
  });

  return { url: `${FB_AUTH_URL}?${params}`, state };
}

export { consumeState };

// ── Exchange code for tokens ────────────────────────────────────────
export async function exchangeCodeForTokens(code) {
  const res = await fetch(`${FB_TOKEN_URL}?${new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    code,
  })}`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instagram token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();

  // Exchange for long-lived token
  const longRes = await fetch(`${FB_TOKEN_URL}?${new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    fb_exchange_token: data.access_token,
  })}`);

  if (!longRes.ok) {
    // Use short-lived token if long-lived exchange fails
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  const longData = await longRes.json();
  return {
    accessToken: longData.access_token,
    expiresIn: longData.expires_in,
  };
}

// ── Find the linked Instagram Business Account ──────────────────────
export async function getInstagramAccounts(userAccessToken) {
  // Get user's Facebook Pages
  const pagesRes = await fetch(
    `${FB_API_BASE}/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}`,
    { headers: { Authorization: `Bearer ${userAccessToken}` } }
  );

  if (!pagesRes.ok) {
    const err = await pagesRes.text();
    throw new Error(`Failed to fetch pages (${pagesRes.status}): ${err}`);
  }

  const { data: pages } = await pagesRes.json();
  const accounts = [];

  for (const page of pages) {
    if (page.instagram_business_account) {
      accounts.push({
        igUserId: page.instagram_business_account.id,
        igUsername: page.instagram_business_account.username,
        igPicture: page.instagram_business_account.profile_picture_url,
        pageId: page.id,
        pageName: page.name,
      });
    }
  }

  return accounts;
}

// ── Store tokens (IG user ID + page access token) ───────────────────
export async function storeTokens(userId, companyId, accessToken, igUserId, igUsername, expiresIn) {
  const encAccessToken = encrypt(accessToken);

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
    platform_user_id: igUserId,
    platform_user_name: igUsername,
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
async function loadTokens(userId) {
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
    igUserId: data.platform_user_id,
    igUsername: data.platform_user_name,
  };
}

// ── Create an Instagram post (two-step: container → publish) ────────
export async function createInstagramPost(userId, caption, imageUrl) {
  if (!imageUrl) {
    return { success: false, message: 'Instagram requires an image. No image URL provided.' };
  }

  const tokens = await loadTokens(userId);
  if (!tokens) {
    return { success: false, message: 'No valid Instagram connection. Connect Instagram in Settings.' };
  }

  if (tokens.expiresAt && tokens.expiresAt.getTime() < Date.now()) {
    await supabase.from('social_oauth_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', tokens.id);
    return { success: false, message: 'Instagram token expired. Please reconnect.' };
  }

  const { accessToken, igUserId } = tokens;

  try {
    // Step 1: Create media container
    const containerRes = await fetch(`${FB_API_BASE}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    });

    if (!containerRes.ok) {
      const err = await containerRes.text();
      console.error(`[INSTAGRAM-API] Container creation failed (${containerRes.status}):`, err);
      return { success: false, message: `Instagram container error: ${err.substring(0, 200)}` };
    }

    const { id: containerId } = await containerRes.json();
    console.log(`[INSTAGRAM-API] Media container created: ${containerId}`);

    // Wait briefly for container to process
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Publish the container
    const publishRes = await fetch(`${FB_API_BASE}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    if (!publishRes.ok) {
      const err = await publishRes.text();
      console.error(`[INSTAGRAM-API] Publish failed (${publishRes.status}):`, err);
      return { success: false, message: `Instagram publish error: ${err.substring(0, 200)}` };
    }

    const { id: mediaId } = await publishRes.json();
    const postUrl = `https://www.instagram.com/p/${mediaId}/`;
    console.log(`[INSTAGRAM-API] Post published: ${mediaId}`);

    return { success: true, postUrl, message: 'Instagram post published' };
  } catch (err) {
    console.error(`[INSTAGRAM-API] Post error:`, err.message);
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
    personName: tokens.igUsername,
    personId: tokens.igUserId,
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

export { FACEBOOK_APP_ID };
