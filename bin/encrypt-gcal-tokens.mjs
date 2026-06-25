#!/usr/bin/env node
/**
 * encrypt-gcal-tokens.mjs — one-time migration: encrypt plaintext OAuth tokens
 * in the google_calendar_tokens table into the encrypted_* columns.
 *
 * Run AFTER deploying 20260625_gcal_token_encryption.sql and the updated
 * server/services/google-calendar.js.  Safe to re-run — already-encrypted rows
 * (encrypted_access_token IS NOT NULL) are skipped.
 *
 * Required env vars:
 *   SUPABASE_URL              Supabase project URL
 *   SUPABASE_SERVICE_KEY      Service-role key (bypasses RLS)
 *   CREDENTIAL_ENCRYPTION_KEY 32-byte AES key as hex (64 hex chars)
 *
 * Usage:
 *   node bin/encrypt-gcal-tokens.mjs            # migrate all un-migrated rows
 *   node bin/encrypt-gcal-tokens.mjs --dry-run  # count only, no writes
 */

import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../server/services/encryption.js';

// ── Env validation ───────────────────────────────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CREDENTIAL_ENCRYPTION_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[encrypt-gcal-tokens] FATAL: missing required env vars: ${missing.join(', ')}`);
  console.error('Set them before running this script (e.g. via .env + dotenv-cli, or export in shell).');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

// ── Supabase service-role client ─────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`[encrypt-gcal-tokens] mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  // Select rows that have plaintext tokens but no encrypted version yet.
  const { data: rows, error } = await supabase
    .from('google_calendar_tokens')
    .select('id, access_token, refresh_token')
    .not('access_token', 'is', null)
    .is('encrypted_access_token', null);

  if (error) {
    console.error('[encrypt-gcal-tokens] Failed to query rows:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('[encrypt-gcal-tokens] No un-migrated rows found. Nothing to do.');
    return;
  }

  console.log(`[encrypt-gcal-tokens] Found ${rows.length} row(s) to migrate.`);

  if (DRY_RUN) {
    console.log('[encrypt-gcal-tokens] --dry-run: skipping writes.');
    return;
  }

  let successCount = 0;
  let errorCount   = 0;

  for (const row of rows) {
    try {
      const encAccess  = encrypt(row.access_token);
      const encRefresh = row.refresh_token ? encrypt(row.refresh_token) : null;

      const patch = {
        encrypted_access_token:  encAccess.encrypted,
        access_token_iv:         encAccess.iv,
        access_token_tag:        encAccess.tag,
        encrypted_refresh_token: encRefresh?.encrypted || null,
        refresh_token_iv:        encRefresh?.iv        || null,
        refresh_token_tag:       encRefresh?.tag       || null,
        // Null out plaintext columns now that they are encrypted.
        access_token:  null,
        refresh_token: null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('google_calendar_tokens')
        .update(patch)
        .eq('id', row.id);

      if (updateError) {
        console.error(`[encrypt-gcal-tokens] row ${row.id}: update failed — ${updateError.message}`);
        errorCount++;
      } else {
        console.log(`[encrypt-gcal-tokens] row ${row.id}: migrated ok`);
        successCount++;
      }
    } catch (err) {
      console.error(`[encrypt-gcal-tokens] row ${row.id}: encrypt failed — ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n[encrypt-gcal-tokens] Done. success=${successCount} errors=${errorCount}`);
  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[encrypt-gcal-tokens] Unexpected error:', err.message);
  process.exit(1);
});
