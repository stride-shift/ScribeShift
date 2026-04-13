import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getAuthorizationUrl,
  consumeState,
  exchangeCodeForTokens,
  getLongLivedToken,
  getUserPages,
  storeTokens,
  getConnectionStatus,
  disconnect,
  FACEBOOK_APP_ID,
} from '../services/facebook-api.js';
import { createSelectionToken, consumeSelectionToken } from '../services/oauth-selection.js';

const router = Router();

// ── GET /api/auth/facebook — Initiate OAuth flow ────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    if (!FACEBOOK_APP_ID) {
      return res.status(500).json({
        error: 'Facebook integration not configured. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to .env',
      });
    }
    const { url } = getAuthorizationUrl(req.user.id, req.user.company_id);
    res.json({ url });
  } catch (err) {
    console.error('[FACEBOOK-OAUTH] Auth URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/facebook/callback — OAuth callback ────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error_description, error: oauthError } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (oauthError) {
    return res.redirect(`${frontendUrl}/?facebook_error=${encodeURIComponent(error_description || oauthError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/?facebook_error=${encodeURIComponent('Missing authorization code')}`);
  }

  const stateData = consumeState(state);
  if (!stateData) {
    return res.redirect(`${frontendUrl}/?facebook_error=${encodeURIComponent('Invalid or expired state. Please try again.')}`);
  }

  try {
    // Get short-lived user token, then exchange for long-lived
    const shortTokens = await exchangeCodeForTokens(code);
    const longTokens = await getLongLivedToken(shortTokens.accessToken);
    const userAccessToken = longTokens.accessToken;

    // Get pages the user manages
    const pages = await getUserPages(userAccessToken);

    if (pages.length === 0) {
      return res.redirect(`${frontendUrl}/?facebook_error=${encodeURIComponent('No Facebook Pages found. Create a Facebook Page first.')}`);
    }

    if (pages.length === 1) {
      // Auto-select the only page
      const page = pages[0];
      await storeTokens(
        stateData.userId, stateData.companyId,
        page.pageAccessToken, page.pageId, page.pageName,
        longTokens.expiresIn
      );
      return res.redirect(`${frontendUrl}/?facebook_success=true&facebook_name=${encodeURIComponent(page.pageName)}`);
    }

    // Multiple pages — encode selection data as an encrypted token (no in-memory state)
    const selectionToken = createSelectionToken({
      userId: stateData.userId,
      companyId: stateData.companyId,
      pages,
      expiresIn: longTokens.expiresIn,
    });

    res.redirect(`${frontendUrl}/?facebook_select_page=${encodeURIComponent(selectionToken)}`);
  } catch (err) {
    console.error('[FACEBOOK-OAUTH] Callback error:', err.message);
    res.redirect(`${frontendUrl}/?facebook_error=${encodeURIComponent(err.message)}`);
  }
});

// ── GET /api/auth/facebook/pages/:selectionId — Get page options ────
router.get('/pages/:selectionId', verifyToken, (req, res) => {
  const data = consumeSelectionToken(decodeURIComponent(req.params.selectionId));
  if (!data) return res.status(404).json({ error: 'Selection expired. Please reconnect.' });

  res.json({
    pages: data.pages.map(p => ({
      pageId: p.pageId,
      pageName: p.pageName,
      picture: p.picture,
      // Pass token back so the client can use it in the select call
      _token: req.params.selectionId,
    })),
    _token: req.params.selectionId,
  });
});

// ── POST /api/auth/facebook/pages/:selectionId/select — Pick a page ─
router.post('/pages/:selectionId/select', verifyToken, async (req, res) => {
  const data = consumeSelectionToken(decodeURIComponent(req.params.selectionId));
  if (!data) return res.status(404).json({ error: 'Selection expired. Please reconnect.' });

  const { pageId } = req.body;
  const page = data.pages.find(p => p.pageId === pageId);
  if (!page) return res.status(400).json({ error: 'Invalid page selection' });

  try {
    await storeTokens(
      data.userId, data.companyId,
      page.pageAccessToken, page.pageId, page.pageName,
      data.expiresIn
    );
    res.json({ success: true, pageName: page.pageName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/facebook/status — Check connection status ─────────
router.get('/status', verifyToken, async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/auth/facebook — Disconnect ──────────────────────────
router.delete('/', verifyToken, async (req, res) => {
  try {
    await disconnect(req.user.id);
    res.json({ success: true, message: 'Facebook disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
