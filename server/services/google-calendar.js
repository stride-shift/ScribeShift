import { encrypt, decrypt } from './encryption.js';
import { supabase } from '../config/supabase.js';

const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'];

function ensureConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('Google Calendar OAuth is not configured. Set GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI.');
  }
}

export function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

// ── OAuth: build consent URL ────────────────────────────────────────
export function buildAuthUrl(state) {
  ensureConfigured();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── OAuth: exchange code for tokens ─────────────────────────────────
export async function exchangeCodeForTokens(code) {
  ensureConfigured();
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed');
  return data; // { access_token, refresh_token, expires_in, scope, token_type }
}

// ── OAuth: refresh access token ─────────────────────────────────────
async function refreshAccessToken(refreshToken) {
  ensureConfigured();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed');
  return data;
}

// ── OAuth: fetch email for connected Google account ─────────────────
export async function fetchGoogleEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

// ── Encryption helpers ───────────────────────────────────────────────
/**
 * Decrypt a field from a DB row using the encrypted_* / *_iv / *_tag column
 * triple.  Falls back to the plaintext column (e.g. row.access_token) when the
 * encrypted column is absent — supports rows that have not yet been migrated by
 * bin/encrypt-gcal-tokens.mjs.
 *
 * @param {object} row       - DB row from google_calendar_tokens
 * @param {'access_token'|'refresh_token'} name - logical token name
 * @returns {string|null}
 */
function decryptField(row, name) {
  const encCol = `encrypted_${name}`;
  const ivCol  = `${name}_iv`;
  const tagCol = `${name}_tag`;

  if (row[encCol]) {
    return decrypt(row[encCol], row[ivCol], row[tagCol]);
  }
  // Transition-safe fallback: row not yet migrated, use plaintext column.
  return row[name] || null;
}

// ── Token storage: save (upsert) ────────────────────────────────────
export async function saveTokens(userId, tokens, googleEmail) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  const encAccess  = encrypt(tokens.access_token);
  const encRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  const { error } = await supabase
    .from('google_calendar_tokens')
    .upsert({
      user_id: userId,
      google_email: googleEmail,
      // Encrypted columns — the canonical storage going forward.
      encrypted_access_token:  encAccess.encrypted,
      access_token_iv:         encAccess.iv,
      access_token_tag:        encAccess.tag,
      encrypted_refresh_token: encRefresh?.encrypted || null,
      refresh_token_iv:        encRefresh?.iv        || null,
      refresh_token_tag:       encRefresh?.tag       || null,
      // Plaintext columns intentionally left null for new rows.
      // (NOT NULL was dropped in 20260625_gcal_token_encryption.sql)
      access_token:  null,
      refresh_token: null,
      scope: tokens.scope || SCOPES.join(' '),
      token_type: tokens.token_type || 'Bearer',
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw new Error(`Failed to save Google tokens: ${error.message}`);
}

// ── Token storage: load + refresh-if-needed ─────────────────────────
export async function getValidAccessToken(userId) {
  const { data: row, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load tokens: ${error.message}`);
  if (!row) return null;

  const msUntilExpiry = new Date(row.expires_at).getTime() - Date.now();
  if (msUntilExpiry > 30_000) {
    // Decrypt with transition-safe fallback (see decryptField).
    const accessToken = decryptField(row, 'access_token');
    return { accessToken, calendarId: row.calendar_id || 'primary' };
  }

  // Refresh — decrypt refresh token with fallback, then re-encrypt new access token.
  const storedRefreshToken = decryptField(row, 'refresh_token');
  const refreshed = await refreshAccessToken(storedRefreshToken);
  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();

  const encAccess = encrypt(refreshed.access_token);
  await supabase
    .from('google_calendar_tokens')
    .update({
      encrypted_access_token: encAccess.encrypted,
      access_token_iv:        encAccess.iv,
      access_token_tag:       encAccess.tag,
      // Null out the plaintext column on every refresh — gradually cleans up
      // rows that were written before this code was deployed.
      access_token: null,
      expires_at:   newExpiresAt,
      updated_at:   new Date().toISOString(),
    })
    .eq('user_id', userId);

  return { accessToken: refreshed.access_token, calendarId: row.calendar_id || 'primary' };
}

export async function getConnectionStatus(userId) {
  const { data: row } = await supabase
    .from('google_calendar_tokens')
    .select('google_email, calendar_id, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!row) return { connected: false };
  return {
    connected: true,
    email: row.google_email,
    calendarId: row.calendar_id || 'primary',
    updatedAt: row.updated_at,
  };
}

export async function disconnect(userId) {
  // Best effort: revoke refresh token with Google.
  // Select both encrypted and plaintext columns to support the transition period.
  const { data: row } = await supabase
    .from('google_calendar_tokens')
    .select('refresh_token, encrypted_refresh_token, refresh_token_iv, refresh_token_tag')
    .eq('user_id', userId)
    .maybeSingle();
  if (row) {
    const refreshToken = decryptField(row, 'refresh_token');
    if (refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (err) {
        console.warn('[GCAL] Token revoke failed (non-fatal):', err.message);
      }
    }
  }
  await supabase.from('google_calendar_tokens').delete().eq('user_id', userId);
}

// ── Calendar API helpers ────────────────────────────────────────────
const CAL_PLATFORM_LABELS = {
  linkedin: 'LinkedIn', twitter: 'Twitter / X', facebook: 'Facebook', instagram: 'Instagram',
};

function buildEventBody({ platform, postText, scheduledAt, durationMinutes = 15 }) {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const label = CAL_PLATFORM_LABELS[platform] || platform;
  const appUrl = (process.env.FRONTEND_URL || 'https://scribeshift.app').split(',')[0].trim();

  // Short topic reference instead of the full caption: the calendar entry is a
  // reminder of WHAT is going out, not a place to read the whole post.
  const firstLine = (postText || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const topic = firstLine.length > 80 ? firstLine.slice(0, 80).trimEnd() + '…' : firstLine;

  const description = topic
    ? `Scheduled with ScribeShift — based on: "${topic}"\n\nView or edit this post: ${appUrl}`
    : `Scheduled with ScribeShift.\n\nView or edit this post: ${appUrl}`;

  return {
    summary: `Post on ${label}`,
    description,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    },
    source: { title: 'ScribeShift', url: appUrl },
  };
}

export async function createEvent(userId, post) {
  const creds = await getValidAccessToken(userId);
  if (!creds) return null;
  const body = buildEventBody({
    platform: post.platform,
    postText: post.post_text,
    scheduledAt: post.scheduled_at,
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error('[GCAL] createEvent failed:', data);
    throw new Error(data.error?.message || 'Failed to create calendar event');
  }
  return data.id;
}

export async function updateEvent(userId, eventId, post) {
  const creds = await getValidAccessToken(userId);
  if (!creds || !eventId) return null;
  const body = buildEventBody({
    platform: post.platform,
    postText: post.post_text,
    scheduledAt: post.scheduled_at,
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('[GCAL] updateEvent failed:', data);
    // If the event was deleted on Google's side, create a fresh one
    if (res.status === 404 || res.status === 410) {
      return await createEvent(userId, post);
    }
    throw new Error(data.error?.message || 'Failed to update calendar event');
  }
  return eventId;
}

export async function deleteEvent(userId, eventId) {
  if (!eventId) return;
  const creds = await getValidAccessToken(userId);
  if (!creds) return;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.error('[GCAL] deleteEvent failed:', res.status);
  }
}
