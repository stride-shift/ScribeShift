#!/usr/bin/env node
/**
 * run-migration.mjs — apply SQL migrations from supabase/migrations/ to the
 * Supabase Postgres database.
 *
 * Credentials come from the ENVIRONMENT ONLY (never hardcoded), so this file is
 * safe to commit. Set the direct Postgres connection string:
 *
 *   SUPABASE_DB_URL=postgresql://postgres:<db-password>@db.<ref>.supabase.co:5432/postgres
 *   (Supabase dashboard → Project Settings → Database → Connection string → URI)
 *
 * Usage:
 *   node bin/run-migration.mjs --list            # list migrations in apply order (no DB connection)
 *   node bin/run-migration.mjs <file.sql>        # apply ONE migration by filename
 *   node bin/run-migration.mjs --all             # apply ALL migrations in lexical order
 *
 * Migrations are expected to be idempotent (CREATE ... IF NOT EXISTS / guarded
 * DO blocks), so re-applying is safe. Each file runs inside a transaction.
 *
 * NOTE (audit T3-D): files are applied in lexical sort order. The legacy
 * `add_social_oauth_tokens.sql` has no date prefix and therefore sorts LAST;
 * renaming/ordering cleanup is tracked separately (Tier 3).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations');

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function applyFiles(files) {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      'ERROR: SUPABASE_DB_URL is not set.\n' +
        'Export the Supabase Postgres connection string before applying migrations\n' +
        '(dashboard → Project Settings → Database → Connection string → URI).'
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`[MIGRATE] ${file} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

function printUsage(all) {
  console.log(
    'Usage:\n' +
      '  node bin/run-migration.mjs --list         list migrations (no DB connection)\n' +
      '  node bin/run-migration.mjs <file.sql>     apply one migration\n' +
      '  node bin/run-migration.mjs --all          apply all migrations in order'
  );
  console.log(`\n${all.length} migration(s) in supabase/migrations/`);
}

async function main() {
  const arg = process.argv[2];
  const all = listMigrations();

  if (!arg || arg === '--help' || arg === '-h') {
    printUsage(all);
    return;
  }

  if (arg === '--list' || arg === '--dry-run') {
    console.log(`Migrations (apply order) — ${all.length} file(s):`);
    all.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${f}`));
    return;
  }

  if (arg === '--all') {
    console.log(`Applying all ${all.length} migration(s)...`);
    await applyFiles(all);
    console.log('Done.');
    return;
  }

  if (!all.includes(arg)) {
    console.error(`ERROR: migration not found: ${arg}\nRun "--list" to see available migrations.`);
    process.exit(1);
  }
  await applyFiles([arg]);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
