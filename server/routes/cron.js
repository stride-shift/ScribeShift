import { Router } from 'express';
import checkPostsHandler from '../../api/cron/check-posts.js';

// Mirrors the Vercel serverless cron endpoints onto the Express app so that
// requests hitting Express via the /api/:path* catch-all rewrite still reach
// the correct handler. The handler performs its own Bearer-token auth against
// process.env.CRON_SECRET.
const router = Router();

router.post('/check-posts', (req, res) => checkPostsHandler(req, res));

// Diagnostic: which LinkedIn API version is this deploy actually sending?
router.get('/diag', (req, res) => {
  res.json({
    linkedin_version: process.env.LINKEDIN_API_VERSION || '202505',
    node_version: process.version,
    platform: process.platform,
    deployed_at: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  });
});

export default router;
