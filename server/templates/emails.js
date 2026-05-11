// HTML email templates for ScribeShift transactional mail.
// All templates share a consistent branded frame.
//
// The logo is sent as an inline CID attachment (referenced as `cid:scribeshift-logo`)
// because every reset email currently goes through Resend, which supports inline
// attachments with content_id. CID is the most reliable cross-client method —
// Gmail/Outlook/Apple Mail/mobile clients all render it without prompting users
// to "load images". A CSS-built emblem renders behind the <img> as a fallback
// in case the attachment is stripped.
//
// Each template returns { subject, html, attachments } so the caller forwards
// attachments to the Resend client.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirname, '../../public/scribeshift-logo.png');
let LOGO_BUFFER = null;
function getLogoBuffer() {
  if (LOGO_BUFFER) return LOGO_BUFFER;
  try {
    LOGO_BUFFER = fs.readFileSync(LOGO_PATH);
  } catch (err) {
    console.warn('[EMAIL] Could not read logo at', LOGO_PATH, '-', err.message);
    LOGO_BUFFER = null;
  }
  return LOGO_BUFFER;
}

// Returns the inline attachment array Resend expects, or undefined if the
// logo file isn't available (templates still render — the CSS emblem fallback
// behind the <img> shows instead).
export function logoAttachment() {
  const buf = getLogoBuffer();
  if (!buf) return undefined;
  return [
    {
      filename: 'scribeshift-logo.png',
      content: buf.toString('base64'),
      content_id: 'scribeshift-logo',
      contentId: 'scribeshift-logo', // Resend SDK accepts either case
      disposition: 'inline',
      type: 'image/png',
    },
  ];
}

const FRONTEND_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://scribe-shift.vercel.app';
const BRAND_COLOR = '#3b82f6';
const BRAND_DARK = '#2563eb';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#475569';
const TEXT_MUTED = '#94a3b8';
const BG_PAGE = '#f4f6fb';
const BG_CARD = '#ffffff';
const BORDER_SOFT = '#e6eaf2';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// CSS-only brand emblem: a blue ring around a filled centre, matching the
// in-app navbar logo. Works in every email client because it's just two
// nested DIVs with border-radius and background-color.
function brandEmblem(size = 36) {
  const ring = size;
  const inner = Math.round(size * 0.36);
  const innerOffset = Math.round((ring - inner) / 2);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="width:${ring}px;height:${ring}px;border-radius:${ring}px;background:#ffffff;line-height:1;padding:0;text-align:center;vertical-align:middle;border:2px solid rgba(255,255,255,0.95);box-shadow:inset 0 0 0 2.5px ${BRAND_DARK};">
          <div style="width:${inner}px;height:${inner}px;margin:${innerOffset - 2}px auto 0;border-radius:${inner}px;background:${BRAND_DARK};"></div>
        </td>
      </tr>
    </table>
  `;
}

function frame({ preheader = '', heroTitle = '', bodyHtml }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>ScribeShift</title>
  </head>
  <body style="margin:0;padding:0;background:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_PRIMARY};">
    <span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_PAGE};">
      <tr>
        <td align="center" style="padding:40px 16px;">

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border-collapse:separate;">
            <!-- Gradient header band -->
            <tr>
              <td bgcolor="${BRAND_DARK}" style="background:${BRAND_DARK};background-image:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%);border-radius:18px 18px 0 0;padding:30px 36px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;width:42px;">
                      <!--[if !mso]><!-->
                      <img src="cid:scribeshift-logo" alt="ScribeShift" width="40" height="40" style="display:block;border-radius:10px;background:#ffffff;padding:2px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                      <!--<![endif]-->
                      <!--[if mso]>
                        ${brandEmblem(40)}
                      <![endif]-->
                    </td>
                    <td style="padding-left:14px;vertical-align:middle;">
                      <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">ScribeShift</span>
                    </td>
                    <td style="text-align:right;vertical-align:middle;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);font-weight:600;">
                      ${esc(heroTitle || 'Account')}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Card body -->
            <tr>
              <td bgcolor="${BG_CARD}" style="background:${BG_CARD};padding:36px 36px 32px;border-left:1px solid ${BORDER_SOFT};border-right:1px solid ${BORDER_SOFT};font-size:15px;line-height:1.65;color:${TEXT_SECONDARY};">
                ${bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td bgcolor="${BG_CARD}" style="background:${BG_CARD};padding:22px 36px 26px;border:1px solid ${BORDER_SOFT};border-top:1px solid ${BORDER_SOFT};border-radius:0 0 18px 18px;font-size:12px;color:${TEXT_MUTED};text-align:center;line-height:1.6;">
                Sent by <strong style="color:${TEXT_SECONDARY};font-weight:600;">ScribeShift</strong> · Powered by StrideShift Global<br/>
                If you weren't expecting this email, you can safely ignore it.
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Big, on-brand CTA button. Uses a wrapper table for Outlook fallback.
function button(href, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
      <tr>
        <td bgcolor="${BRAND_COLOR}" style="background:${BRAND_COLOR};background-image:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%);border-radius:12px;box-shadow:0 6px 16px rgba(37,99,235,0.28);">
          <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:-0.005em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function infoCallout(text) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
      <tr>
        <td style="padding:14px 16px;background:#f8fafc;border:1px solid ${BORDER_SOFT};border-left:3px solid ${BRAND_COLOR};border-radius:8px;font-size:13px;color:${TEXT_SECONDARY};line-height:1.55;">
          ${text}
        </td>
      </tr>
    </table>
  `;
}

// ── Password reset ──────────────────────────────────────────────────
export function passwordResetEmail({ resetUrl, expiresMinutes = 60 }) {
  const body = `
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.015em;line-height:1.25;">
      Reset your password
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;">
      We got a request to reset your ScribeShift password. Click the button below to pick a new one — it takes a few seconds.
    </p>

    <div style="margin:0 0 28px;">${button(resetUrl, 'Reset my password')}</div>

    ${infoCallout(`<strong style="color:${TEXT_PRIMARY};font-weight:600;">Link expires in ${expiresMinutes} minutes.</strong> If you didn't request this, you can safely ignore this email — your password won't change.`)}

    <p style="margin:24px 0 6px;font-size:12px;color:${TEXT_MUTED};">Trouble with the button? Paste this URL into your browser:</p>
    <p style="margin:0;font-size:12px;color:${BRAND_DARK};word-break:break-all;line-height:1.5;">
      <a href="${esc(resetUrl)}" style="color:${BRAND_DARK};text-decoration:underline;">${esc(resetUrl)}</a>
    </p>
  `;
  return {
    subject: 'Reset your ScribeShift password',
    html: frame({ preheader: 'Reset your ScribeShift password in a few clicks', heroTitle: 'Password reset', bodyHtml: body }),
    attachments: logoAttachment(),
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
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.015em;line-height:1.25;">
      Post scheduled
    </h1>
    <p style="margin:0 0 22px;font-size:15px;color:${TEXT_SECONDARY};">
      Your <strong style="color:${TEXT_PRIMARY};">${esc(platform)}</strong> post is queued for <strong style="color:${TEXT_PRIMARY};">${esc(when)}</strong>.
    </p>
    <div style="margin:0 0 22px;padding:18px 20px;background:#f8fafc;border-left:3px solid ${BRAND_COLOR};border-radius:8px;font-size:14px;color:${TEXT_SECONDARY};white-space:pre-wrap;line-height:1.55;">${esc(snippet)}${preview && preview.length > 280 ? '…' : ''}</div>
    ${infoCallout('A calendar invite is attached — open it to add this post to your calendar.')}
  `;
  return {
    subject: `Post scheduled for ${when}`,
    html: frame({ preheader: `Your ${platform} post is queued for ${when}`, heroTitle: 'Scheduled', bodyHtml: body }),
    attachments: logoAttachment(),
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
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.015em;line-height:1.25;">
      ${greeting} 👋
    </h1>
    <p style="margin:0 0 22px;font-size:15px;color:${TEXT_SECONDARY};">
      Heads up — your <strong style="color:${TEXT_PRIMARY};">${esc(post.platform)}</strong> post is going out today at <strong style="color:${TEXT_PRIMARY};">${esc(time)}</strong>.
    </p>
    <div style="margin:0 0 22px;padding:18px 20px;background:#f8fafc;border-left:3px solid ${BRAND_COLOR};border-radius:8px;font-size:14px;color:${TEXT_SECONDARY};white-space:pre-wrap;line-height:1.55;">${snippet}${truncated ? '…' : ''}</div>
    <p style="margin:0 0 22px;font-size:14px;color:${TEXT_SECONDARY};">Want to adjust it? Jump into ScribeShift to edit, reschedule, or cancel.</p>
    <div>${button(FRONTEND_URL, 'Open ScribeShift')}</div>
  `;
  return {
    subject: `Going out today at ${time} — your ${post.platform} post`,
    html: frame({ preheader: `Your ${post.platform} post is scheduled for ${time} today`, heroTitle: 'Reminder', bodyHtml: body }),
    attachments: logoAttachment(),
  };
}
