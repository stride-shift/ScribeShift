import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.CREDENTIAL_ENCRYPTION_KEY;

if (!KEY_HEX) {
  console.warn('[ENCRYPTION] Missing CREDENTIAL_ENCRYPTION_KEY — credential storage disabled');
}

function getKey() {
  if (!KEY_HEX) throw new Error('Encryption key not configured');
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns { encrypted, iv, tag } — all hex-encoded.
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypt an encrypted string.
 * @param {string} encrypted - hex-encoded ciphertext
 * @param {string} iv - hex-encoded IV
 * @param {string} tag - hex-encoded auth tag
 * @returns {string} plaintext
 */
export function decrypt(encrypted, iv, tag) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
