import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getAuthorizationUrl,
  consumeState,
  exchangeCodeForTokens,
  getUserProfile,
  storeTokens,
  getConnectionStatus,
  disconnectLinkedIn,
  LINKEDIN_CLIENT_ID,
} from '../services/linkedin-api.js';

const router = Router();

// ── GET /api/auth/linkedin — Initiate OAuth flow ─────────────────────
// Frontend calls this to get the LinkedIn authorization URL.
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!LINKEDIN_CLIENT_ID) {
      return res.status(500).json({
        error: 'LinkedIn integration not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env',
      });
    }

    const { url } = getAuthorizationUrl(req.user.id, req.user.company_id);
    res.json({ url });
  } catch (err) {
    console.error('[LINKEDIN-OAUTH] Auth URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/linkedin/callback — OAuth callback ─────────────────
// LinkedIn redirects here after user authorizes. No auth middleware —
// we identify the user via the state parameter.
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError, error_description } = req.query;

  // Build redirect URL to frontend
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (oauthError) {
    console.error(`[LINKEDIN-OAUTH] OAuth error: ${oauthError} — ${error_description}`);
    return res.redirect(`${frontendUrl}/?linkedin_error=${encodeURIComponent(error_description || oauthError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/?linkedin_error=${encodeURIComponent('Missing authorization code')}`);
  }

  // Validate state and get user info
  const stateData = consumeState(state);
  if (!stateData) {
    return res.redirect(`${frontendUrl}/?linkedin_error=${encodeURIComponent('Invalid or expired state. Please try again.')}`);
  }

  try {
    // Exchange code for tokens
    console.log(`[LINKEDIN-OAUTH] Exchanging code for tokens (user: ${stateData.userId})...`);
    const tokens = await exchangeCodeForTokens(code);

    // Get user's LinkedIn profile
    console.log(`[LINKEDIN-OAUTH] Fetching LinkedIn profile...`);
    const profile = await getUserProfile(tokens.accessToken);
    console.log(`[LINKEDIN-OAUTH] Connected as: ${profile.name} (${profile.personId})`);

    // Store encrypted tokens in database
    await storeTokens(stateData.userId, stateData.companyId, tokens, profile);
    console.log(`[LINKEDIN-OAUTH] Tokens stored successfully for user ${stateData.userId}`);

    // Redirect to frontend with success
    res.redirect(`${frontendUrl}/?linkedin_success=true&linkedin_name=${encodeURIComponent(profile.name)}`);
  } catch (err) {
    console.error(`[LINKEDIN-OAUTH] Callback error:`, err.message);
    res.redirect(`${frontendUrl}/?linkedin_error=${encodeURIComponent(err.message)}`);
  }
});

// ── GET /api/auth/linkedin/status — Check connection status ──────────
router.get('/status', verifyToken, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id);
    res.json(status);
  } catch (err) {
    console.error('[LINKEDIN-OAUTH] Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/auth/linkedin — Disconnect LinkedIn ──────────────────
router.delete('/', verifyToken, async (req, res) => {
  try {
    await disconnectLinkedIn(req.user.id);
    res.json({ success: true, message: 'LinkedIn disconnected' });
  } catch (err) {
    console.error('[LINKEDIN-OAUTH] Disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
