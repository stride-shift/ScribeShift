/**
 * Stateless approval-link tokens using signed JWTs.
 *
 * Mirrors oauth-state.js. A signed token is emailed to reviewers so they can
 * approve or request changes without logging in. The token is scoped to a
 * single post + company and expires in 7 days.
 *
 * Payload shape:
 *   { postId, companyId, scope: 'review' }  + standard JWT iat/exp
 *
 * SECRET source: OAUTH_STATE_SECRET || CREDENTIAL_ENCRYPTION_KEY
 * (same key as OAuth state — avoids introducing a new required env var).
 */

import jwt from 'jsonwebtoken';

const SECRET = process.env.OAUTH_STATE_SECRET || process.env.CREDENTIAL_ENCRYPTION_KEY;
const EXPIRY = '7d';

if (!SECRET) {
  throw new Error(
    '[APPROVAL-TOKEN] No signing secret configured — set OAUTH_STATE_SECRET or CREDENTIAL_ENCRYPTION_KEY'
  );
}

/**
 * Mint a signed review token for a specific post.
 * @param {{ postId: string, companyId: string }} payload
 * @returns {string} JWT safe to embed in an email link
 */
export function createApprovalToken({ postId, companyId }) {
  if (!SECRET) throw new Error('Approval token secret not configured');
  return jwt.sign({ postId, companyId, scope: 'review' }, SECRET, { expiresIn: EXPIRY });
}

/**
 * Verify and decode an approval token.
 * Returns null (never throws) if the token is invalid or expired.
 * @param {string} token
 * @returns {{ postId: string, companyId: string, scope: string } | null}
 */
export function verifyApprovalToken(token) {
  if (!SECRET) return null;
  try {
    const data = jwt.verify(token, SECRET);
    const { postId, companyId, scope } = data;
    if (scope !== 'review') return null;
    return { postId, companyId, scope };
  } catch {
    return null;
  }
}
