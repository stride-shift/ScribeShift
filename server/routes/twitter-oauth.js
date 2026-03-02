import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getAuthorizationUrl,
  consumeState,
  exchangeCodeForTokens,
  getUserProfile,
  storeTokens,
  getConnectionStatus,
  disconnect,
  TWITTER_CLIENT_ID,
} from '../services/twitter-api.js';

const router = Router();

// ── GET /api/auth/twitter — Initiate OAuth flow ─────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!TWITTER_CLIENT_ID) {
      return res.status(500).json({
        error: 'Twitter integration not configured. Add TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET to .env',
      });
    }
    const { url } = getAuthorizationUrl(req.user.id, req.user.company_id);
    res.json({ url });
  } catch (err) {
    console.error('[TWITTER-OAUTH] Auth URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/twitter/callback — OAuth callback ─────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (oauthError) {
    return res.redirect(`${frontendUrl}/?twitter_error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/?twitter_error=${encodeURIComponent('Missing authorization code')}`);
  }

  const stateData = consumeState(state);
  if (!stateData) {
    return res.redirect(`${frontendUrl}/?twitter_error=${encodeURIComponent('Invalid or expired state. Please try again.')}`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, stateData.codeVerifier);
    const profile = await getUserProfile(tokens.accessToken);
    await storeTokens(stateData.userId, stateData.companyId, tokens, profile);

    console.log(`[TWITTER-OAUTH] Connected as: @${profile.username} (${profile.name})`);
    res.redirect(`${frontendUrl}/?twitter_success=true&twitter_name=${encodeURIComponent(profile.name)}`);
  } catch (err) {
    console.error('[TWITTER-OAUTH] Callback error:', err.message);
    res.redirect(`${frontendUrl}/?twitter_error=${encodeURIComponent(err.message)}`);
  }
});

// ── GET /api/auth/twitter/status — Check connection status ──────────
router.get('/status', verifyToken, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/auth/twitter — Disconnect ────────────────────────────
router.delete('/', verifyToken, async (req, res) => {
  try {
    await disconnect(req.user.id);
    res.json({ success: true, message: 'Twitter disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
