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

// ── Token storage: save (upsert) ────────────────────────────────────
export async function saveTokens(userId, tokens, googleEmail) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const { error } = await supabase
    .from('google_calendar_tokens')
    .upsert({
      user_id: userId,
      google_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
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
    return { accessToken: row.access_token, calendarId: row.calendar_id || 'primary' };
  }

  // Refresh
  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
  await supabase
    .from('google_calendar_tokens')
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
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
  // Best effort: revoke refresh token with Google
  const { data: row } = await supabase
    .from('google_calendar_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (row?.refresh_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      console.warn('[GCAL] Token revoke failed (non-fatal):', err.message);
    }
  }
  await supabase.from('google_calendar_tokens').delete().eq('user_id', userId);
}

// ── Calendar API helpers ────────────────────────────────────────────
function buildEventBody({ platform, postText, scheduledAt, durationMinutes = 15 }) {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    summary: `ScribeShift: ${platform} post`,
    description: (postText || '').slice(0, 2000),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    },
    source: { title: 'ScribeShift', url: process.env.FRONTEND_URL || 'https://scribeshift.app' },
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
