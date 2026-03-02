import crypto from 'crypto';
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getAuthorizationUrl,
  consumeState,
  exchangeCodeForTokens,
  getInstagramAccounts,
  storeTokens,
  getConnectionStatus,
  disconnect,
  FACEBOOK_APP_ID,
} from '../services/instagram-api.js';

const router = Router();

// Temp storage for tokens awaiting account selection
const pendingSelections = new Map();

// ── GET /api/auth/instagram — Initiate OAuth flow ───────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!FACEBOOK_APP_ID) {
      return res.status(500).json({
        error: 'Instagram integration not configured. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to .env',
      });
    }
    const { url } = getAuthorizationUrl(req.user.id, req.user.company_id);
    res.json({ url });
  } catch (err) {
    console.error('[INSTAGRAM-OAUTH] Auth URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/instagram/callback — OAuth callback ───────────────
router.get('/callback', async (req, res) => {
  const { code, state, error_description, error: oauthError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (oauthError) {
    return res.redirect(`${frontendUrl}/?instagram_error=${encodeURIComponent(error_description || oauthError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/?instagram_error=${encodeURIComponent('Missing authorization code')}`);
  }

  const stateData = consumeState(state);
  if (!stateData) {
    return res.redirect(`${frontendUrl}/?instagram_error=${encodeURIComponent('Invalid or expired state. Please try again.')}`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const accounts = await getInstagramAccounts(tokens.accessToken);

    if (accounts.length === 0) {
      return res.redirect(`${frontendUrl}/?instagram_error=${encodeURIComponent('No Instagram Business accounts found. Link an Instagram Business/Creator account to a Facebook Page first.')}`);
    }

    if (accounts.length === 1) {
      const account = accounts[0];
      await storeTokens(
        stateData.userId, stateData.companyId,
        tokens.accessToken, account.igUserId, account.igUsername,
        tokens.expiresIn
      );
      return res.redirect(`${frontendUrl}/?instagram_success=true&instagram_name=${encodeURIComponent(account.igUsername)}`);
    }

    // Multiple accounts — store temporarily and redirect for selection
    const selectionId = crypto.randomUUID();
    pendingSelections.set(selectionId, {
      userId: stateData.userId,
      companyId: stateData.companyId,
      accounts,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      createdAt: Date.now(),
    });

    setTimeout(() => pendingSelections.delete(selectionId), 10 * 60 * 1000);

    res.redirect(`${frontendUrl}/?instagram_select_account=${selectionId}`);
  } catch (err) {
    console.error('[INSTAGRAM-OAUTH] Callback error:', err.message);
    res.redirect(`${frontendUrl}/?instagram_error=${encodeURIComponent(err.message)}`);
  }
});

// ── GET /api/auth/instagram/accounts/:selectionId — Get IG accounts ─
router.get('/accounts/:selectionId', verifyToken, (req, res) => {
  const data = pendingSelections.get(req.params.selectionId);
  if (!data) return res.status(404).json({ error: 'Selection expired. Please reconnect.' });

  res.json({
    accounts: data.accounts.map(a => ({
      igUserId: a.igUserId,
      igUsername: a.igUsername,
      igPicture: a.igPicture,
      pageName: a.pageName,
    })),
  });
});

// ── POST /api/auth/instagram/accounts/:selectionId/select ───────────
router.post('/accounts/:selectionId/select', verifyToken, async (req, res) => {
  const data = pendingSelections.get(req.params.selectionId);
  if (!data) return res.status(404).json({ error: 'Selection expired. Please reconnect.' });

  const { igUserId } = req.body;
  const account = data.accounts.find(a => a.igUserId === igUserId);
  if (!account) return res.status(400).json({ error: 'Invalid account selection' });

  try {
    await storeTokens(
      data.userId, data.companyId,
      data.accessToken, account.igUserId, account.igUsername,
      data.expiresIn
    );
    pendingSelections.delete(req.params.selectionId);
    res.json({ success: true, igUsername: account.igUsername });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/instagram/status ──────────────────────────────────
router.get('/status', verifyToken, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/auth/instagram — Disconnect ─────────────────────────
router.delete('/', verifyToken, async (req, res) => {
  try {
    await disconnect(req.user.id);
    res.json({ success: true, message: 'Instagram disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
