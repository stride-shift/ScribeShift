import { Resend } from 'resend';

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'ScribeShift <no-reply@strideshift.ai>';

let resend = null;
function getClient() {
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY is not configured');
  if (!resend) resend = new Resend(RESEND_KEY);
  return resend;
}

export async function sendEmail({ to, subject, html, attachments }) {
  if (!to || !subject || !html) {
    throw new Error('sendEmail requires to, subject, and html');
  }
  try {
    const client = getClient();
    const { data, error } = await client.emails.send({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      attachments: attachments || undefined,
    });
    if (error) {
      console.error('[EMAIL] Resend error:', error);
      throw new Error(error.message || 'Email send failed');
    }
    console.log(`[EMAIL] Sent "${subject}" to ${to} — id ${data?.id}`);
    return data;
  } catch (err) {
    console.error('[EMAIL] Send exception:', err.message);
    throw err;
  }
}
