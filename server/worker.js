// ScribeShift background generation worker — runs on Google Cloud Run.
//
// It polls the generation_jobs table for pending jobs and runs the FULL
// generation (reusing services/generation.js, which reuses skills.js prompts).
// Cloud Run has no 60s cap, so big multi-type jobs finish, and the browser just
// polls the job row — so the user can navigate away while it works.
//
// Run: node server/worker.js   (the Dockerfile sets this as the container CMD)

import http from 'node:http';
import { supabase } from './config/supabase.js';
import { assembleInput, runGeneration } from './services/generation.js';

const POLL_MS = Number(process.env.WORKER_POLL_MS || 4000);

// Fail fast BEFORE the health server starts. Without DB credentials the worker
// would answer Cloud Run's health check with 200 while silently processing zero
// jobs — exactly the "healthy-but-dead" failure to avoid. Exit non-zero so Cloud
// Run flags the container. (The ./config/supabase.js import above also throws on
// missing creds; this is an explicit, worker-branded guard against regressions.)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('[WORKER] FATAL: SUPABASE_URL or SUPABASE_SERVICE_KEY missing — aborting');
  process.exit(1);
}

// Cloud Run requires the container to listen on $PORT or it's killed at startup.
// This tiny server just answers health checks; the real work is the poll loop.
// Deploy with --no-cpu-throttling so the loop keeps running between requests.
const PORT = process.env.PORT || 8080;
http.createServer((_req, res) => { res.writeHead(200); res.end('scribeshift-worker ok'); })
  .listen(PORT, '0.0.0.0', () => console.log(`[WORKER] health server on :${PORT}`));

async function setJob(id, patch) {
  try {
    await supabase.from('generation_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  } catch (e) {
    console.error(`[WORKER] update job ${id} failed:`, e.message);
  }
}

async function processJob(job) {
  // Atomic claim: only proceed if WE flip it pending → running (prevents two
  // worker instances grabbing the same job).
  const { data: claimed } = await supabase
    .from('generation_jobs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id');
  if (!claimed || claimed.length === 0) return; // someone else got it

  console.log(`[WORKER] Processing job ${job.id}`);
  try {
    const input = job.input || {};
    const allInput = await assembleInput({ textPrompt: input.textPrompt || '', videoUrls: input.videoUrls || [] });
    const out = await runGeneration({
      allInput,
      contentTypes: input.contentTypes || [],
      options: input.options || {},
      brandData: input.brandData || {},
      userId: job.user_id,
      companyId: job.company_id,
      onProgress: (p) => setJob(job.id, { progress: p }),
    });

    if (!out.ok) {
      await setJob(job.id, { status: 'error', error: out.error });
      console.warn(`[WORKER] Job ${job.id} error: ${out.error}`);
    } else {
      await setJob(job.id, { status: 'done', result: out.results, progress: { label: 'Done' } });
      console.log(`[WORKER] Job ${job.id} done`);
    }
  } catch (err) {
    await setJob(job.id, { status: 'error', error: err.message });
    console.error(`[WORKER] Job ${job.id} threw:`, err.message);
  }
}

async function tick() {
  const { data: jobs, error } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(3);
  if (error) { console.error('[WORKER] poll error:', error.message); return; }
  for (const job of jobs || []) await processJob(job);
}

console.log(`[WORKER] ScribeShift generation worker started (poll ${POLL_MS}ms)`);
async function loop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await tick(); } catch (e) { console.error('[WORKER] tick error:', e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
loop();
