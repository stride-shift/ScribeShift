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

// Secondary/ghost CTA button (grey outline — visually distinct from the primary).
function buttonSecondary(href, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
      <tr>
        <td style="background:#ffffff;border:2px solid #cbd5e1;border-radius:12px;">
          <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 26px;color:${TEXT_SECONDARY};text-decoration:none;font-weight:600;font-size:15px;letter-spacing:-0.005em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${esc(label)}
          </a>
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
export function scheduleConfirmationEmail({ platform, scheduledAt, preview, timezone, calendarAttached = true }) {
  // Friendly platform name — works for every platform, not just LinkedIn.
  const PLATFORM_LABELS = { linkedin: 'LinkedIn', twitter: 'Twitter / X', facebook: 'Facebook', instagram: 'Instagram' };
  const platformLabel = PLATFORM_LABELS[platform] || platform;

  // Format in the user's timezone if the client sent one — otherwise this runs
  // on the server (UTC on Vercel) and shows the wrong time (the bug Shanne hit:
  // 12:35 SAST scheduled, email said 10:35 UTC).
  const fmtOpts = {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  };
  let when;
  try {
    when = new Date(scheduledAt).toLocaleString('en-US', { ...fmtOpts, timeZone: timezone || 'UTC' });
    if (timezone) when += ` (${timezone.split('/').pop().replace(/_/g, ' ')})`;
  } catch {
    when = new Date(scheduledAt).toLocaleString('en-US', { ...fmtOpts, timeZone: 'UTC' }) + ' (UTC)';
  }
  const snippet = (preview || '').slice(0, 280);
  const body = `
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.015em;line-height:1.25;">
      Post scheduled
    </h1>
    <p style="margin:0 0 22px;font-size:15px;color:${TEXT_SECONDARY};">
      Your <strong style="color:${TEXT_PRIMARY};">${esc(platformLabel)}</strong> post is queued for <strong style="color:${TEXT_PRIMARY};">${esc(when)}</strong>.
    </p>
    <div style="margin:0 0 22px;padding:18px 20px;background:#f8fafc;border-left:3px solid ${BRAND_COLOR};border-radius:8px;font-size:14px;color:${TEXT_SECONDARY};white-space:pre-wrap;line-height:1.55;">${esc(snippet)}${preview && preview.length > 280 ? '…' : ''}</div>
    ${infoCallout(calendarAttached
      ? 'A calendar invite is attached — open it to add this post to your calendar.'
      : 'This post has been added to your Google Calendar.')}
  `;
  return {
    subject: `Post scheduled for ${when}`,
    html: frame({ preheader: `Your ${platformLabel} post is queued for ${when}`, heroTitle: 'Scheduled', bodyHtml: body }),
    attachments: logoAttachment(),
  };
}

// ── Approval request ────────────────────────────────────────────────
/**
 * Email sent to company users when a post enters pending_review.
 *
 * @param {{ postText: string, approveUrl: string, requestChangesUrl: string,
 *           companyName?: string, expiresLabel?: string }} opts
 */
export function approvalRequestEmail({ postText, approveUrl, requestChangesUrl, companyName, expiresLabel = '7 days' }) {
  const snippet = (postText || '').slice(0, 280);
  const forWhom = companyName
    ? ` for <strong style="color:${TEXT_PRIMARY};">${esc(companyName)}</strong>`
    : '';
  const body = `
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.015em;line-height:1.25;">
      Post ready for your review
    </h1>
    <p style="margin:0 0 22px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;">
      A new post${forWhom} is waiting for your approval before it goes live.
      Please review the content below and click <strong style="color:${TEXT_PRIMARY};">Approve</strong> to
      publish it as scheduled, or <strong style="color:${TEXT_PRIMARY};">Request changes</strong> if you'd like edits.
    </p>

    <div style="margin:0 0 24px;padding:18px 20px;background:#f8fafc;border-left:3px solid ${BRAND_COLOR};border-radius:8px;font-size:14px;color:${TEXT_SECONDARY};white-space:pre-wrap;line-height:1.55;">${esc(snippet)}${postText && postText.length > 280 ? '…' : ''}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding-right:12px;">${button(approveUrl, 'Approve')}</td>
        <td>${buttonSecondary(requestChangesUrl, 'Request changes')}</td>
      </tr>
    </table>

    ${infoCallout(`<strong style="color:${TEXT_PRIMARY};font-weight:600;">Link expires in ${esc(expiresLabel)}.</strong> After that, ask your team to resend the review link.`)}

    <p style="margin:16px 0 6px;font-size:12px;color:${TEXT_MUTED};">Trouble with the buttons? Paste one of these URLs into your browser:</p>
    <p style="margin:0 0 4px;font-size:12px;color:${BRAND_DARK};word-break:break-all;line-height:1.5;">
      <a href="${esc(approveUrl)}" style="color:${BRAND_DARK};text-decoration:underline;">Approve: ${esc(approveUrl)}</a>
    </p>
    <p style="margin:0;font-size:12px;color:${TEXT_SECONDARY};word-break:break-all;line-height:1.5;">
      <a href="${esc(requestChangesUrl)}" style="color:${TEXT_SECONDARY};text-decoration:underline;">Request changes: ${esc(requestChangesUrl)}</a>
    </p>
  `;
  return {
    subject: `Action required: post awaiting your approval${companyName ? ` — ${companyName}` : ''}`,
    html: frame({ preheader: 'A post is waiting for your approval', heroTitle: 'Review', bodyHtml: body }),
    attachments: logoAttachment(),
  };
}

// ── Invitation ──────────────────────────────────────────────────────
export function inviteEmail({ inviterName, companyName } = {}) {
  const who = inviterName ? esc(inviterName) : 'Your team';
  const where = companyName
    ? ` to join <strong style="color:${TEXT_PRIMARY};">${esc(companyName)}</strong> on ScribeShift`
    : ' to ScribeShift';
  const body = `
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.015em;line-height:1.25;">
      You're invited 🎉
    </h1>
    <p style="margin:0 0 22px;font-size:15px;color:${TEXT_SECONDARY};">
      ${who} has invited you${where} — turn long-form content into ready-to-publish posts, blogs, and newsletters.
    </p>
    <p style="margin:0 0 22px;font-size:14px;color:${TEXT_SECONDARY};">
      Sign in with <strong style="color:${TEXT_PRIMARY};">this email address</strong> (Google, or email + password) to get started.
    </p>
    <div>${button(FRONTEND_URL, 'Accept invite & sign in')}</div>
  `;
  return {
    subject: "You're invited to ScribeShift",
    html: frame({ preheader: 'Your ScribeShift invite is ready', heroTitle: 'Invitation', bodyHtml: body }),
    attachments: logoAttachment(),
  };
}
