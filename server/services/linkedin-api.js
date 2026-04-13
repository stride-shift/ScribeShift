import { encrypt, decrypt } from './encryption.js';
import { supabase } from '../config/supabase.js';
import { createState, consumeState } from './oauth-state.js';

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:4321/api/auth/linkedin/callback';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_API_BASE = 'https://api.linkedin.com';
// LinkedIn Versioned API — format YYYYMM. LinkedIn keeps each version active
// for ~12 months before EOL. '202401' was rejected 2026-04 with
// NONEXISTENT_VERSION. Bump this roughly annually; set via env to override.
const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202505';

// Scopes needed: OpenID profile + post on behalf of user
const SCOPES = 'openid profile email w_member_social';

// ── Generate OAuth authorization URL ─────────────────────────────────
export function getAuthorizationUrl(userId, companyId) {
  if (!LINKEDIN_CLIENT_ID) throw new Error('LINKEDIN_CLIENT_ID not configured');

  const state = createState({ userId, companyId });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: LINKEDIN_REDIRECT_URI,
    state,
    scope: SCOPES,
  });

  return { url: `${LINKEDIN_AUTH_URL}?${params}`, state };
}

export { consumeState };

// ── Exchange authorization code for tokens ───────────────────────────
export async function exchangeCodeForTokens(code) {
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: LINKEDIN_REDIRECT_URI,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in,        // seconds (typically 5184000 = 60 days)
    refreshExpiresIn: data.refresh_token_expires_in || null,
    scope: data.scope,
  };
}

// ── Refresh an expired access token ──────────────────────────────────
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

// ── Get LinkedIn user profile (person URN + name) ────────────────────
export async function getUserProfile(accessToken) {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    personId: data.sub,
    name: data.name,
    email: data.email,
    picture: data.picture,
  };
}

// ── Store OAuth tokens in database (encrypted) ──────────────────────
export async function storeTokens(userId, companyId, tokens, profile) {
  const encAccessToken = encrypt(tokens.accessToken);
  const encRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null;

  // Upsert: update if exists, insert if not
  const { data: existing } = await supabase
    .from('social_oauth_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .single();

  const tokenData = {
    user_id: userId,
    company_id: companyId,
    platform: 'linkedin',
    encrypted_access_token: encAccessToken.encrypted,
    access_token_iv: encAccessToken.iv,
    access_token_tag: encAccessToken.tag,
    encrypted_refresh_token: encRefreshToken?.encrypted || null,
    refresh_token_iv: encRefreshToken?.iv || null,
    refresh_token_tag: encRefreshToken?.tag || null,
    token_expires_at: expiresAt,
    platform_user_id: profile.personId,
    platform_user_name: profile.name,
    scope: tokens.scope || SCOPES,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from('social_oauth_tokens')
      .update(tokenData)
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to update tokens: ${error.message}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('social_oauth_tokens')
    .insert(tokenData)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to store tokens: ${error.message}`);
  return data.id;
}

// ── Load and decrypt tokens for a user ──────────────────────────────
export async function loadTokens(userId) {
  const { data, error } = await supabase
    .from('social_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  const accessToken = decrypt(
    data.encrypted_access_token,
    data.access_token_iv,
    data.access_token_tag
  );

  let refreshToken = null;
  if (data.encrypted_refresh_token) {
    refreshToken = decrypt(
      data.encrypted_refresh_token,
      data.refresh_token_iv,
      data.refresh_token_tag
    );
  }

  return {
    id: data.id,
    accessToken,
    refreshToken,
    expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
    personId: data.platform_user_id,
    personName: data.platform_user_name,
  };
}

// ── Get a valid access token (auto-refresh if expired) ───────────────
export async function getValidAccessToken(userId) {
  const tokens = await loadTokens(userId);
  if (!tokens) return null;

  // Check if token is expired or will expire in the next 5 minutes
  const now = new Date();
  const buffer = 5 * 60 * 1000;
  const isExpired = tokens.expiresAt && (tokens.expiresAt.getTime() - buffer) < now.getTime();

  if (isExpired && tokens.refreshToken) {
    console.log(`[LINKEDIN-API] Token expired for user ${userId}, refreshing...`);
    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      const encAccessToken = encrypt(refreshed.accessToken);
      const encRefreshToken = refreshed.refreshToken ? encrypt(refreshed.refreshToken) : null;
      const expiresAt = refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
        : null;

      await supabase
        .from('social_oauth_tokens')
        .update({
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
        })
        .eq('id', tokens.id);

      return { accessToken: refreshed.accessToken, personId: tokens.personId };
    } catch (err) {
      console.error(`[LINKEDIN-API] Token refresh failed:`, err.message);
      // Mark as inactive so user knows to reconnect
      await supabase
        .from('social_oauth_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', tokens.id);
      return null;
    }
  }

  if (isExpired && !tokens.refreshToken) {
    console.log(`[LINKEDIN-API] Token expired for user ${userId}, no refresh token available`);
    await supabase
      .from('social_oauth_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', tokens.id);
    return null;
  }

  return { accessToken: tokens.accessToken, personId: tokens.personId };
}

// ── Upload image to LinkedIn ─────────────────────────────────────────
async function uploadImageToLinkedIn(accessToken, personId, imageData) {
  // Step 1: Initialize upload
  const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${personId}`,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`LinkedIn image init failed (${initRes.status}): ${err}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value.uploadUrl;
  const imageUrn = initData.value.image;

  // Step 2: Upload the image binary
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`LinkedIn image upload failed (${uploadRes.status}): ${err}`);
  }

  return imageUrn;
}

// ── Load image data from URL (Supabase Storage or any public URL) ────
async function loadImageData(imageSource) {
  if (!imageSource) return null;
  if (!imageSource.startsWith('http')) {
    console.warn(`[LINKEDIN-API] Non-URL image source ignored: ${imageSource}`);
    return null;
  }
  const res = await fetch(imageSource);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Create a LinkedIn post via API ───────────────────────────────────
export async function createLinkedInPostViaAPI(userId, text, imageSource = null) {
  const tokenData = await getValidAccessToken(userId);
  if (!tokenData) {
    return {
      success: false,
      message: 'No valid LinkedIn connection. User needs to connect LinkedIn in Settings.',
    };
  }

  const { accessToken, personId } = tokenData;
  const author = `urn:li:person:${personId}`;

  console.log(`[LINKEDIN-API] Creating post for user ${userId} (person: ${personId})...`);

  try {
    // Build post body
    const postBody = {
      author,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    };

    // Handle image upload if provided
    if (imageSource) {
      try {
        const imageData = await loadImageData(imageSource);
        if (imageData) {
          const imageUrn = await uploadImageToLinkedIn(accessToken, personId, imageData);
          postBody.content = {
            media: { id: imageUrn },
          };
          console.log(`[LINKEDIN-API] Image uploaded: ${imageUrn}`);
        }
      } catch (imgErr) {
        console.warn(`[LINKEDIN-API] Image upload failed, posting without image:`, imgErr.message);
      }
    }

    // Create the post
    const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (res.status === 201) {
      // Success - LinkedIn returns 201 with x-restli-id header
      const postId = res.headers.get('x-restli-id');
      const postUrl = postId
        ? `https://www.linkedin.com/feed/update/${postId}/`
        : null;

      console.log(`[LINKEDIN-API] Post created successfully! ID: ${postId || 'unknown'}`);

      // Update last used timestamp
      await supabase
        .from('social_oauth_tokens')
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('platform', 'linkedin');

      return { success: true, postUrl, message: 'Post published successfully via LinkedIn API' };
    }

    // Handle errors
    const errBody = await res.text();
    console.error(`[LINKEDIN-API] Post creation failed (${res.status}):`, errBody);

    // Token expired mid-request
    if (res.status === 401) {
      await supabase
        .from('social_oauth_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('platform', 'linkedin');
      return { success: false, message: 'LinkedIn session expired. Please reconnect LinkedIn in Settings.' };
    }

    return { success: false, message: `LinkedIn API error (${res.status}): ${errBody.substring(0, 200)}` };
  } catch (err) {
    console.error(`[LINKEDIN-API] Post error:`, err.message);
    return { success: false, message: `Failed to post: ${err.message}` };
  }
}

// ── Check connection status ──────────────────────────────────────────
export async function getConnectionStatus(userId) {
  const tokens = await loadTokens(userId);
  if (!tokens) return { connected: false };

  const isExpired = tokens.expiresAt && tokens.expiresAt.getTime() < Date.now();
  const hasRefresh = !!tokens.refreshToken;

  return {
    connected: true,
    personName: tokens.personName,
    personId: tokens.personId,
    expiresAt: tokens.expiresAt?.toISOString(),
    isExpired,
    canRefresh: hasRefresh,
  };
}

// ── Disconnect LinkedIn ──────────────────────────────────────────────
export async function disconnectLinkedIn(userId) {
  const { error } = await supabase
    .from('social_oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('platform', 'linkedin');

  if (error) throw new Error(`Failed to disconnect: ${error.message}`);
  return { success: true };
}

export { LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI };
