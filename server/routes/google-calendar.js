import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { createState, consumeState } from '../services/oauth-state.js';
import {
  isConfigured, buildAuthUrl, exchangeCodeForTokens,
  fetchGoogleEmail, saveTokens, getConnectionStatus, disconnect,
} from '../services/google-calendar.js';

const router = Router();

// ── GET /api/auth/google-calendar/status ────────────────────────────
router.get('/status', verifyToken, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.json({ connected: false, configured: false });
    }
    const status = await getConnectionStatus(req.user.id);
    res.json({ ...status, configured: true });
  } catch (err) {
    console.error('[GCAL] status error:', err.message);
    res.status(500).json({ error: 'Failed to load status' });
  }
});

// ── GET /api/auth/google-calendar ───────────────────────────────────
// Returns the Google consent URL so the frontend can navigate to it.
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Google Calendar is not configured on the server' });
    }
    const state = createState({ userId: req.user.id, companyId: req.user.company_id || null });
    const url = buildAuthUrl(state);
    res.json({ url });
  } catch (err) {
    console.error('[GCAL] connect error:', err.message);
    res.status(500).json({ error: 'Failed to start OAuth' });
  }
});

// ── GET /api/auth/google-calendar/callback ──────────────────────────
// Google redirects the user here with ?code=...&state=...
router.get('/callback', async (req, res) => {
  const frontend = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || '/';
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${frontend}/?gcal_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${frontend}/?gcal_error=missing_code_or_state`);
    }
    const payload = consumeState(String(state));
    if (!payload?.userId) {
      return res.redirect(`${frontend}/?gcal_error=invalid_state`);
    }

    const tokens = await exchangeCodeForTokens(String(code));
    const email = await fetchGoogleEmail(tokens.access_token);
    await saveTokens(payload.userId, tokens, email);

    res.redirect(`${frontend}/?gcal_connected=1`);
  } catch (err) {
    console.error('[GCAL] callback error:', err.message);
    res.redirect(`${frontend}/?gcal_error=${encodeURIComponent(err.message)}`);
  }
});

// ── DELETE /api/auth/google-calendar ────────────────────────────────
router.delete('/', verifyToken, async (req, res) => {
  try {
    await disconnect(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[GCAL] disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
