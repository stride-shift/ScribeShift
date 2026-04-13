import { checkDuePosts } from '../../server/services/scheduler.js';

export default async function handler(req, res) {
  // Verify the request comes from Vercel Cron or has the correct secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET env var is not set — refusing to run');
    return res.status(500).json({ error: 'Cron not configured' });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const count = await checkDuePosts();
    res.json({ success: true, processed: count });
  } catch (err) {
    console.error('[CRON] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
