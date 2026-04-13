/**
 * Stateless OAuth state store using signed JWTs.
 *
 * Replaces the per-service in-memory Maps that break on Vercel because
 * each serverless invocation may land on a different process instance.
 *
 * The state token is a JWT signed with CREDENTIAL_ENCRYPTION_KEY (or a
 * dedicated OAUTH_STATE_SECRET env var).  No database required.
 *
 * Payload shape:
 *   { userId, companyId, codeVerifier? }   + standard JWT iat/exp
 */

import jwt from 'jsonwebtoken';

const SECRET = process.env.OAUTH_STATE_SECRET || process.env.CREDENTIAL_ENCRYPTION_KEY;
const EXPIRY = '10m';

if (!SECRET) {
  console.error('[OAUTH-STATE] No signing secret — set OAUTH_STATE_SECRET or CREDENTIAL_ENCRYPTION_KEY');
}

/**
 * Create a signed state token containing user context.
 * @param {{ userId: string, companyId: string, codeVerifier?: string }} payload
 * @returns {string} opaque state token safe to use as an OAuth state parameter
 */
export function createState(payload) {
  if (!SECRET) throw new Error('OAuth state secret not configured');
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY });
}

/**
 * Verify and decode a state token.
 * @param {string} state
 * @returns {{ userId: string, companyId: string, codeVerifier?: string } | null}
 */
export function consumeState(state) {
  if (!SECRET) return null;
  try {
    const data = jwt.verify(state, SECRET);
    // Strip JWT-internal fields before returning
    const { userId, companyId, codeVerifier } = data;
    return { userId, companyId, ...(codeVerifier ? { codeVerifier } : {}) };
  } catch {
    return null;
  }
}
