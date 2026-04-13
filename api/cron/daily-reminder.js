import { supabase } from '../../server/config/supabase.js';
import { sendEmail } from '../../server/services/email.js';
import { postReminderEmail } from '../../server/templates/emails.js';

// Fires daily at 07:00 UTC (see vercel.json). For every post with
// status='scheduled' whose scheduled_at falls on the current UTC day,
// send ONE reminder email to the post's owner.
export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET is not set — refusing to run');
    return res.status(500).json({ error: 'Cron not configured' });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).toISOString();
    const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)).toISOString();

    const { data: posts, error } = await supabase
      .from('scheduled_posts')
      .select('id, user_id, platform, post_text, scheduled_at, status, users(email, full_name)')
      .eq('status', 'scheduled')
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('[CRON] Query error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    let sent = 0;
    let failed = 0;
    for (const post of posts || []) {
      const toEmail = post.users?.email;
      if (!toEmail) continue;
      try {
        const { subject, html } = postReminderEmail({
          userName: post.users?.full_name,
          post,
        });
        await sendEmail({ to: toEmail, subject, html });
        sent++;
      } catch (err) {
        console.error(`[CRON] Failed reminder for post ${post.id}:`, err.message);
        failed++;
      }
    }

    console.log(`[CRON] Daily reminder: sent=${sent} failed=${failed} total=${posts?.length || 0}`);
    res.json({ success: true, sent, failed, total: posts?.length || 0 });
  } catch (err) {
    console.error('[CRON] Daily reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
