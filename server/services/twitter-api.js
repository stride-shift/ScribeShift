import crypto from 'crypto';
import { encrypt, decrypt } from './encryption.js';
import { supabase } from '../config/supabase.js';
import { createState, consumeState } from './oauth-state.js';

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI || 'http://localhost:4321/api/auth/twitter/callback';

const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_API_BASE = 'https://api.twitter.com';
const TWITTER_UPLOAD_BASE = 'https://upload.twitter.com';

const SCOPES = 'tweet.read tweet.write users.read offline.access';
const PLATFORM = 'twitter';

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── Generate OAuth authorization URL ────────────────────────────────
export function getAuthorizationUrl(userId, companyId) {
  if (!TWITTER_CLIENT_ID) throw new Error('TWITTER_CLIENT_ID not configured');

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // codeVerifier is embedded in the signed state JWT so it survives across instances
  const state = createState({ userId, companyId, codeVerifier });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: TWITTER_REDIRECT_URI,
    state,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return { url: `${TWITTER_AUTH_URL}?${params}`, state };
}

export { consumeState };

// ── Exchange authorization code for tokens ──────────────────────────
export async function exchangeCodeForTokens(code, codeVerifier) {
  const basicAuth = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: TWITTER_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

// ── Refresh access token ────────────────────────────────────────────
export async function refreshAccessToken(refreshToken) {
  const basicAuth = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

// ── Get user profile ────────────────────────────────────────────────
export async function getUserProfile(accessToken) {
  const res = await fetch(`${TWITTER_API_BASE}/2/users/me?user.fields=profile_image_url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter user profile failed (${res.status}): ${err}`);
  }

  const { data } = await res.json();
  return {
    userId: data.id,
    username: data.username,
    name: data.name,
    picture: data.profile_image_url,
  };
}

// ── Store tokens (reuses social_oauth_tokens table) ─────────────────
export async function storeTokens(userId, companyId, tokens, profile) {
  const encAccessToken = encrypt(tokens.accessToken);
  const encRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
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
    encrypted_refresh_token: encRefreshToken?.encrypted || null,
    refresh_token_iv: encRefreshToken?.iv || null,
    refresh_token_tag: encRefreshToken?.tag || null,
    token_expires_at: expiresAt,
    platform_user_id: profile.userId,
    platform_user_name: profile.name,
    scope: tokens.scope || SCOPES,
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

// ── Load and decrypt tokens ─────────────────────────────────────────
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
  let refreshToken = null;
  if (data.encrypted_refresh_token) {
    refreshToken = decrypt(data.encrypted_refresh_token, data.refresh_token_iv, data.refresh_token_tag);
  }

  return {
    id: data.id,
    accessToken,
    refreshToken,
    expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
    platformUserId: data.platform_user_id,
    platformUserName: data.platform_user_name,
  };
}

// ── Get valid access token (auto-refresh) ───────────────────────────
export async function getValidAccessToken(userId) {
  const tokens = await loadTokens(userId);
  if (!tokens) return null;

  const now = new Date();
  const buffer = 5 * 60 * 1000;
  const isExpired = tokens.expiresAt && (tokens.expiresAt.getTime() - buffer) < now.getTime();

  if (isExpired && tokens.refreshToken) {
    console.log(`[TWITTER-API] Token expired for user ${userId}, refreshing...`);
    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      const encAccessToken = encrypt(refreshed.accessToken);
      const encRefreshToken = refreshed.refreshToken ? encrypt(refreshed.refreshToken) : null;
      const expiresAt = refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
        : null;

      await supabase.from('social_oauth_tokens').update({
        encrypted_access_token: encAccessToken.encrypted,
        access_token_iv: encAccessToken.iv,
        access_token_tag: encAccessToken.tag,
        ...(encRefreshToken ? {
          encrypted_refresh_token: encRefreshToken.encrypted,
          refresh_token_iv: encRefreshToken.iv,
          refresh_token_tag: encRefreshToken.tag,
        } : {}),
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', tokens.id);

      return { accessToken: refreshed.accessToken };
    } catch (err) {
      console.error(`[TWITTER-API] Token refresh failed:`, err.message);
      await supabase.from('social_oauth_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', tokens.id);
      return null;
    }
  }

  if (isExpired && !tokens.refreshToken) {
    await supabase.from('social_oauth_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', tokens.id);
    return null;
  }

  return { accessToken: tokens.accessToken };
}

// ── Upload media to Twitter ─────────────────────────────────────────
async function uploadMedia(accessToken, imageUrl) {
  // Download image from URL
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/png';
  const totalBytes = buffer.length;

  // INIT
  const initRes = await fetch(`${TWITTER_UPLOAD_BASE}/1.1/media/upload.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      command: 'INIT',
      total_bytes: String(totalBytes),
      media_type: contentType,
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Twitter media INIT failed (${initRes.status}): ${err}`);
  }
  const { media_id_string } = await initRes.json();

  // APPEND
  const formData = new FormData();
  formData.append('command', 'APPEND');
  formData.append('media_id', media_id_string);
  formData.append('segment_index', '0');
  formData.append('media_data', buffer.toString('base64'));

  const appendRes = await fetch(`${TWITTER_UPLOAD_BASE}/1.1/media/upload.json`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: formData,
  });

  if (!appendRes.ok) {
    const err = await appendRes.text();
    throw new Error(`Twitter media APPEND failed (${appendRes.status}): ${err}`);
  }

  // FINALIZE
  const finalRes = await fetch(`${TWITTER_UPLOAD_BASE}/1.1/media/upload.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      command: 'FINALIZE',
      media_id: media_id_string,
    }),
  });

  if (!finalRes.ok) {
    const err = await finalRes.text();
    throw new Error(`Twitter media FINALIZE failed (${finalRes.status}): ${err}`);
  }

  return media_id_string;
}

// ── Create a tweet ──────────────────────────────────────────────────
export async function createTwitterPost(userId, text, imageUrl = null) {
  const tokenData = await getValidAccessToken(userId);
  if (!tokenData) {
    return { success: false, message: 'No valid Twitter connection. Connect Twitter in Settings.' };
  }

  const { accessToken } = tokenData;

  try {
    const tweetBody = { text };

    if (imageUrl) {
      try {
        const mediaId = await uploadMedia(accessToken, imageUrl);
        tweetBody.media = { media_ids: [mediaId] };
        console.log(`[TWITTER-API] Media uploaded: ${mediaId}`);
      } catch (imgErr) {
        console.warn(`[TWITTER-API] Image upload failed, posting without image:`, imgErr.message);
      }
    }

    const res = await fetch(`${TWITTER_API_BASE}/2/tweets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    });

    if (res.ok) {
      const data = await res.json();
      const tweetId = data.data?.id;
      const postUrl = tweetId ? `https://x.com/i/status/${tweetId}` : null;
      console.log(`[TWITTER-API] Tweet created: ${tweetId}`);
      return { success: true, postId: tweetId, postUrl, message: 'Tweet published successfully' };
    }

    const errBody = await res.text();
    console.error(`[TWITTER-API] Tweet failed (${res.status}):`, errBody);

    if (res.status === 401) {
      await supabase.from('social_oauth_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('platform', PLATFORM);
      return { success: false, message: 'Twitter session expired. Please reconnect.' };
    }

    return { success: false, message: `Twitter API error (${res.status}): ${errBody.substring(0, 200)}` };
  } catch (err) {
    console.error(`[TWITTER-API] Post error:`, err.message);
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
    personName: tokens.platformUserName,
    personId: tokens.platformUserId,
    expiresAt: tokens.expiresAt?.toISOString(),
    isExpired,
    canRefresh: !!tokens.refreshToken,
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

export { TWITTER_CLIENT_ID };
