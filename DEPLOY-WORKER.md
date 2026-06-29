# Deploying the background generation worker (Google Cloud Run)

This runs your generator on Cloud Run so big jobs never time out and users can
navigate away while content is generated. Do this once.

## 1. Run the SQL (Supabase SQL editor)
```
supabase/migrations/20260608_generation_jobs_input.sql
```
(You already ran `20260608_generation_jobs.sql`, which created the jobs table.)

## 2. Install + set up the Google Cloud CLI (once)
```bash
# install: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 3. Deploy the worker
From the repo root (`gcloud` auto-detects the `Dockerfile`):
```bash
gcloud run deploy scribeshift-worker \
  --source . \
  --region europe-west1 \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 1 \
  --no-allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=...,SUPABASE_SERVICE_KEY=...,SUPABASE_ANON_KEY=...,GEMINI_API_KEY=..."
```
(Region tip: `africa-south1` = Johannesburg, closest to you; `europe-west1` is a safe default.)
Notes (simple):
- `--no-cpu-throttling` + `--min-instances 1` = the worker stays awake and keeps
  checking for new jobs (without this, Cloud Run pauses it between requests).
- `--max-instances 1` = one worker is plenty; avoids two grabbing the same job.
- Env vars: copy the **same** values you use in Vercel (`SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`). The worker needs
  the **service key** to write results.

## 4. Confirm it's running
```bash
gcloud run services logs read scribeshift-worker --region europe-west1 --limit 20
```
You should see `[WORKER] ScribeShift generation worker started`.

## 5. Flip the website onto it (after the worker is live)
The frontend hook `src/hooks/useGenerationJob.js` is already wired to enqueue jobs
(`POST /api/generate/enqueue`) and poll for results. Tell Claude "flip generation
onto the worker" and it'll switch `GenerationContext` to use it (with a fallback
to the existing instant path for file uploads).

## How it works
1. Browser → `POST /api/generate/enqueue` → a row in `generation_jobs` (status `pending`) → returns a job id instantly.
2. The Cloud Run worker polls that table, runs the full generation (reusing your `skills.js` prompts), and writes the result back.
3. Browser polls the job row → shows progress → you can navigate away; it keeps running.

File uploads still use the existing instant path on Vercel (the worker handles
typed prompts + reference/YouTube URLs — the long-running case).
