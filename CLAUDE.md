# ScribeShift — Claude rules

This file is loaded automatically at the start of every Claude Code conversation.
Follow it without exception.

## Pre-push secret-scanning checklist

**Before any `git commit` or `git push`, do these in order:**

1. **Run `git status` and read every line.** Anything in this NEVER-COMMIT list must be removed/unstaged before continuing. Do not "trust" `.gitignore` — verify directly.
2. **Run `git diff --cached`** to see exactly what is about to be committed.
3. **Grep the staged diff for known secret patterns:**
   ```bash
   git diff --cached | grep -nE "sbp_[A-Za-z0-9]+|GOCSPX-[A-Za-z0-9_-]+|re_[A-Za-z0-9_]+|WPL_AP1\.|eyJhbGciOi[A-Za-z0-9_.-]+|sk-[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{35}|GHA?[0-9A-Z]{36,}"
   ```
   If any match comes back, abort. Tell the user which file and line, and propose a fix (move to env var, add to `.gitignore`, or rotate).
4. **Use explicit file paths** with `git add path/to/file`. Never `git add -A`, `git add .`, or `git add *` — those are blanket adds that bypass all the safety above.
5. **Never commit a file containing a hardcoded API key, access token, client secret, JWT, or service-role key**, even if "just for testing." If a one-off script needs admin credentials, read them from `process.env` and document the env var name in a comment.

## NEVER commit (regardless of `.gitignore`)

| Path | Why |
| --- | --- |
| `.env`, `.env.*`, `.env.local` | Live API keys, secrets, OAuth credentials |
| `.claude/mcp.json` | Contains the Supabase Management API access token |
| `scripts/` | One-off migration / admin scripts that read live tokens hardcoded for convenience |
| `uploads/`, `playwright-data/`, `generated/`, `dist/`, `node_modules/` | Runtime artefacts, large binaries |
| Anything matching `*.key`, `*.pem`, `*-secret*`, `*-credentials*` | Likely credentials |

## Repo visibility

This repo **must remain private** on GitHub. Vercel's Hobby plan supports private repos — there is no reason to make it public. If asked to make it public, push back and confirm the user understands the consequences (source code, prompts, business logic become world-readable).

## Other conventions

- **Migrations**: place new SQL in `supabase/migrations/<YYYYMMDD>_<description>.sql`. Apply via `node scripts/run-migration.mjs <file>` (note: `scripts/` is gitignored — runner exists locally only).
- **Production env vars** live in Vercel Dashboard → Project → Settings → Environment Variables. After changing them, **redeploy** (env changes don't apply until next build).
- **Local env vars** live in `.env` at the repo root. After changing, restart the dev server (`dotenv` only reads at startup).
- **OAuth redirect URIs** in production must use the deployed domain (`scribe-shift.vercel.app` or `scribe-shift.strideshift.ai`), never `localhost` or `YOUR-APP.vercel.app` placeholders.
- **Sender email** for Resend uses the verified `strideshift.ai` domain — `EMAIL_FROM="ScribeShift <no-reply@strideshift.ai>"`.
