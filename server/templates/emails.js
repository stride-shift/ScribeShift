// HTML email templates for ScribeShift transactional mail.
// All templates render the ScribeShift logo and share a consistent frame.

const FRONTEND_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://scribeshift.vercel.app';
const LOGO_URL = `${FRONTEND_URL}/scribeshift-logo.png`;
const BRAND_COLOR = '#3b82f6';
const BRAND_DARK = '#2563eb';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function frame({ preheader = '', bodyHtml }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ScribeShift</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
    <span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 2px 12px rgba(17,24,39,0.06);overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 16px;border-bottom:1px solid #eef1f6;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${LOGO_URL}" alt="ScribeShift" width="36" height="36" style="display:block;border-radius:8px;" />
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <span style="font-size:18px;font-weight:600;color:#1a1a2e;letter-spacing:-0.01em;">ScribeShift</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;font-size:15px;line-height:1.6;color:#334155;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fafbfd;border-top:1px solid #eef1f6;font-size:12px;color:#8792a3;text-align:center;">
                Sent by ScribeShift — powered by StrideShift Global<br/>
                If you didn't expect this email, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href, label) {
  return `<a href="${esc(href)}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">${esc(label)}</a>`;
}

// ── Password reset ──────────────────────────────────────────────────
export function passwordResetEmail({ resetUrl, expiresMinutes = 60 }) {
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Reset your password</h2>
    <p style="margin:0 0 16px;">We got a request to reset your ScribeShift password. Click the button below to choose a new one.</p>
    <p style="margin:0 0 24px;">${button(resetUrl, 'Reset password')}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">This link expires in ${expiresMinutes} minutes. If you didn't ask for this, you can ignore this email — your password won't change.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">Or paste this URL into your browser:<br/>${esc(resetUrl)}</p>
  `;
  return {
    subject: 'Reset your ScribeShift password',
    html: frame({ preheader: 'Reset your ScribeShift password', bodyHtml: body }),
  };
}

// ── Schedule confirmation ───────────────────────────────────────────
export function scheduleConfirmationEmail({ platform, scheduledAt, preview }) {
  const when = new Date(scheduledAt).toLocaleString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const snippet = (preview || '').slice(0, 280);
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Post scheduled ✓</h2>
    <p style="margin:0 0 16px;">Your <strong>${esc(platform)}</strong> post is queued to go out on <strong>${esc(when)}</strong>.</p>
    <div style="margin:0 0 20px;padding:16px;background:#f8fafc;border-left:3px solid ${BRAND_COLOR};border-radius:6px;font-size:14px;color:#475569;white-space:pre-wrap;">${esc(snippet)}${preview && preview.length > 280 ? '…' : ''}</div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">A calendar invite is attached — open it to add this post to your calendar.</p>
  `;
  return {
    subject: `Post scheduled for ${when}`,
    html: frame({ preheader: `Your ${platform} post is queued for ${when}`, bodyHtml: body }),
  };
}

// ── Per-post reminder (one email per scheduled post, morning-of) ────
export function postReminderEmail({ userName, post }) {
  const firstName = userName ? userName.split(' ')[0] : null;
  const greeting = firstName ? `Morning, ${esc(firstName)}` : 'Morning';
  const time = new Date(post.scheduled_at).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
  const snippet = esc((post.post_text || '').slice(0, 400));
  const truncated = post.post_text && post.post_text.length > 400;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">${greeting} 👋</h2>
    <p style="margin:0 0 20px;">Heads up — your <strong>${esc(post.platform)}</strong> post is going out today at <strong>${esc(time)}</strong>.</p>
    <div style="margin:0 0 20px;padding:16px;background:#f8fafc;border-left:3px solid ${BRAND_COLOR};border-radius:6px;font-size:14px;color:#475569;white-space:pre-wrap;">${snippet}${truncated ? '…' : ''}</div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Want to adjust it? Jump into ScribeShift to edit, reschedule, or cancel.</p>
    <p style="margin:16px 0 0;">${button(FRONTEND_URL, 'Open ScribeShift')}</p>
  `;
  return {
    subject: `Going out today at ${time} — your ${post.platform} post`,
    html: frame({ preheader: `Your ${post.platform} post is scheduled for ${time} today`, bodyHtml: body }),
  };
}
