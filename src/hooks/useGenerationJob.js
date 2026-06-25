import { supabase } from '../lib/supabase';

/**
 * useGenerationJob — owns the async enqueue + poll lifecycle for text generation.
 *
 * This is the SOLE importer of supabase in the hooks layer.
 *
 * Exposes a single function:
 *   runJob({ authHeaders, contentTypes, options, brandData, textPrompt, videoUrls, totalSteps, setProgress })
 *
 * Returns a discriminated-union status object so the caller can branch cleanly:
 *   { status: 'done', content }       — job completed; content is the result object
 *   { status: 'error', error }        — job reported an error; caller shows the message
 *   { status: 'timeout' }             — 6-min deadline exceeded; caller shows the message
 *   { status: 'unreachable' }         — enqueue never succeeded; caller falls back to sync
 *
 * NOTE: This hook does NOT call setError or setIsGenerating. All control flow is
 * expressed via the returned status so the orchestrator owns those side effects.
 */
export function useGenerationJob() {
  const runJob = async ({
    authHeaders,
    contentTypes,
    options,
    brandData,
    textPrompt,
    videoUrls,
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

    const deadline = Date.now() + 6 * 60 * 1000; // 6-min cap
    let done = false;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));

      const { data: job } = await supabase
        .from('generation_jobs')
        .select('status, progress, result, error')
        .eq('id', jobId)
        .single();

      if (job?.progress) {
        setProgress({
          current: job.progress.current ?? 0,
          total: totalSteps,
          label: job.progress.label || 'Generating…',
        });
      }

      if (job?.status === 'done') {
        return { status: 'done', content: job.result || {} };
      }

      if (job?.status === 'error') {
        return { status: 'error', error: job.error || 'Text generation failed' };
      }
    }

    if (!done) {
      return { status: 'timeout' };
    }
  };

  return { runJob };
}
