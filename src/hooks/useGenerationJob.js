import { supabase } from '../lib/supabase';

/**
 * useGenerationJob — owns the async enqueue + poll lifecycle for text generation.
 *
 * This is the SOLE importer of supabase in the hooks layer.
 *
 * Exposes:
 *   runJob(...)                — enqueue a job, persist its id, poll to completion
 *   resumeJob({ setProgress }) — re-attach to a persisted in-flight job (after a
 *                                tab close / reload), poll it, restore the result
 *
 * Returns a discriminated-union status object so the caller can branch cleanly:
 *   { status: 'done', content }       — job completed; content is the result object
 *   { status: 'error', error }        — job reported an error (or stalled)
 *   { status: 'timeout' }             — poll deadline exceeded (job may still finish)
 *   { status: 'unreachable' }         — enqueue never succeeded; caller falls back to sync
 *   { status: 'none' }                — (resumeJob only) no persisted job to resume
 *
 * BACKGROUND-SAFE: the actual generation runs server-side (Cloud Run worker),
 * so it keeps running if the user navigates away or closes the tab. We persist
 * the job id to localStorage on enqueue so a reload / reopened tab can re-attach
 * and surface the result when it lands. The persisted entry is cleared on a
 * terminal status (done/error) but KEPT on timeout, so a still-running job can
 * be picked up again next time.
 *
 * NOTE: This hook does NOT call setError or setIsGenerating. All control flow is
 * expressed via the returned status so the orchestrator owns those side effects.
 */

const PERSIST_KEY = 'scribeshift-active-job';
const POLL_MS = 2500;
const MAX_POLL_MS = 6 * 60 * 1000;   // foreground poll cap per attempt
const STALL_MS = 12 * 60 * 1000;     // no job update in this long ⇒ worker died

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── localStorage helpers (best-effort; never throw) ─────────────────────────
function persistJob(job) {
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify(job)); } catch { /* ignore */ }
}
function clearPersistedJob() {
  try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
}
/** Synchronously read the persisted in-flight job, or null. Exported so the
 *  provider can decide on mount whether a resume is needed before any await. */
export function getPersistedJob() {
  try { return JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null'); }
  catch { return null; }
}

// ── Shared poll loop ────────────────────────────────────────────────────────
async function pollJob(jobId, { setProgress, totalSteps, deadline }) {
  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const { data: job } = await supabase
      .from('generation_jobs')
      .select('status, progress, result, error, updated_at')
      .eq('id', jobId)
      .single();

    if (!job) continue;

    if (job.progress && setProgress) {
      setProgress({
        current: job.progress.current ?? 0,
        total: totalSteps,
        label: job.progress.label || 'Generating…',
      });
    }

    if (job.status === 'done')  return { status: 'done', content: job.result || {} };
    if (job.status === 'error') return { status: 'error', error: job.error || 'Text generation failed' };

    // Stall guard: a pending/running job whose row hasn't been touched in
    // STALL_MS has lost its worker (crash / redeploy / resource cap). Fail it
    // here so the UI never spins forever. (Mirrors Justin's pg_cron sweeper,
    // client-side — a server-side sweeper can be added later as a backstop.)
    if (job.updated_at && Date.now() - new Date(job.updated_at).getTime() > STALL_MS) {
      return { status: 'error', error: 'Generation stalled and could not finish. Please try again.' };
    }
  }
  return { status: 'timeout' };
}

export function useGenerationJob() {
  const runJob = async ({
    authHeaders,
    contentTypes,
    options,
    brandData,
    textPrompt,
    videoUrls,
    referenceIds = [],
    totalSteps,
    setProgress,
  }) => {
    let jobId = null;

    try {
      const enqRes = await fetch('/api/generate/enqueue', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentTypes,
          options,
          brandData,
          textPrompt: textPrompt.trim(),
          videoUrls,
          referenceIds,
        }),
      });
      if (enqRes.ok) {
        jobId = (await enqRes.json()).jobId || null;
      }
    } catch {
      /* enqueue unreachable */
    }

    if (!jobId) {
      // Never queued → safe to run the instant (sync) path
      return { status: 'unreachable' };
    }

    // Persist so a reload / reopened tab can re-attach to this job.
    persistJob({ jobId, totalSteps, startedAt: Date.now() });

    const result = await pollJob(jobId, {
      setProgress,
      totalSteps,
      deadline: Date.now() + MAX_POLL_MS,
    });

    // Clear on terminal; KEEP on timeout so resume can pick it up later.
    if (result.status === 'done' || result.status === 'error') clearPersistedJob();
    return result;
  };

  // Re-attach to a persisted in-flight job after a reload / reopened tab.
  const resumeJob = async ({ setProgress } = {}) => {
    const persisted = getPersistedJob();
    if (!persisted?.jobId) return { status: 'none' };

    const result = await pollJob(persisted.jobId, {
      setProgress,
      totalSteps: persisted.totalSteps || 1,
      deadline: Date.now() + MAX_POLL_MS,
    });

    if (result.status === 'done' || result.status === 'error') clearPersistedJob();
    return result;
  };

  return { runJob, resumeJob };
}
