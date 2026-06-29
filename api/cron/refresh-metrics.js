import { refreshDueUsers } from '../../server/services/metrics-sync.js';

export default async function handler(req, res) {
  // Same auth contract as the other cron endpoints.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET env var is not set — refusing to run');
    return res.status(500).json({ error: 'Cron not configured' });
  }

  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Time-box well under the 60s function cap; the next tick picks up where
    // this one left off (stalest users are processed first).
    const result = await refreshDueUsers({ maxUsers: 25, maxMs: 45000 });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[CRON] refresh-metrics error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
