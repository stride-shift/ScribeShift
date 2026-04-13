import { Router } from 'express';
import checkPostsHandler from '../../api/cron/check-posts.js';

// Mirrors the Vercel serverless cron endpoints onto the Express app so that
// requests hitting Express via the /api/:path* catch-all rewrite still reach
// the correct handler. The handler performs its own Bearer-token auth against
// process.env.CRON_SECRET.
const router = Router();

router.post('/check-posts', (req, res) => checkPostsHandler(req, res));

export default router;
