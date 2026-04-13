/**
 * Serverless-safe OAuth multi-account selection store.
 *
 * When a user connects Facebook or Instagram and has multiple pages/accounts
 * we need to temporarily hold the list so the frontend can show a picker.
 * In-memory Maps break on Vercel because the callback and the subsequent
 * /select request may hit different serverless instances.
 *
 * This module stores the selection payload as an AES-256-GCM encrypted token
 * that the frontend holds as an opaque string.  No database required.
 *
 * Token format (URL-safe): "<iv>.<tag>.<ciphertext>" — all base64url.
 */

import { encrypt, decrypt } from './encryption.js';

const TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Encode a selection payload into an opaque URL-safe token.
 * @param {object} payload - arbitrary serialisable object
 * @returns {string} URL-safe token
 */
export function createSelectionToken(payload) {
  const data = JSON.stringify({ ...payload, _exp: Date.now() + TTL_MS });
  const { encrypted, iv, tag } = encrypt(data);
  // Join as base64url-encoded parts so the whole thing is URL safe
  const encode = (hex) => Buffer.from(hex, 'hex').toString('base64url');
  return `${encode(iv)}.${encode(tag)}.${encode(encrypted)}`;
}

/**
 * Decode and verify a selection token.
 * Returns the original payload, or null if invalid / expired.
 * @param {string} token
 * @returns {object|null}
 */
export function consumeSelectionToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decode = (b64u) => Buffer.from(b64u, 'base64url').toString('hex');
    const [iv, tag, encrypted] = parts.map(decode);
    const json = decrypt(encrypted, iv, tag);
    const payload = JSON.parse(json);
    if (!payload._exp || Date.now() > payload._exp) return null;
    const { _exp, ...rest } = payload;
    return rest;
  } catch {
    return null;
  }
}
