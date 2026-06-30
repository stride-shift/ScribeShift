import { useState, useCallback } from 'react';
import { useGenerationJob } from './useGenerationJob';

/**
 * useTextGeneration — owns all text-cluster state and the text-generation phase.
 *
 * @param {{ brand: object, setError: function }} params
 *   brand     — the active brand record from useBrandState (read for payload construction).
 *   setError  — the shared error setter from GenerationProvider. Passed as a stable
 *               constructor param so errors surface in the shared UI error state.
 *
 * Exposes generateText({ setProgress, authHeaders, textTypes, totalSteps }):
 *   Returns { ok: true } on success, or { ok: false } on any failure/timeout.
 *   On failure it calls setError(...) for the user-facing message but does NOT
 *   call setIsGenerating — the provider's finally block owns that reset.
 *   This means the orchestrator can do:
 *     const textResult = await generateText(...);
 *     if (!textResult.ok) return;   // images are skipped; finally resets isGenerating
 */
export function useTextGeneration({ brand, setError }) {
  const { runJob, resumeJob } = useGenerationJob();

  // ── Text cluster state ────────────────────────────────────────────────────
  const [files, setFiles] = useState([]);
  const [videoUrls, setVideoUrls] = useState([]);
  const [textPrompt, setTextPrompt] = useState('');

  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [options, setOptions] = useState({
    tone: 'conversational',
    toneMode: 'preset',
    detectedTone: '',
    customTone: '',
    polish: 'natural',
    length: 'standard',
    audience: 'general',
    industry: 'general',
    goal: 'none',
  });
  const [isDetectingTone, setIsDetectingTone] = useState(false);

  const [content, setContent] = useState({});

  // ── handleContentUpdate ───────────────────────────────────────────────────
  const handleContentUpdate = useCallback((platform, newContent) => {
    setContent((prev) => ({ ...prev, [platform]: newContent }));
  }, []);

  // ── generateText — the text phase of handleGenerate ──────────────────────
  /**
   * Parameters threaded from the orchestrator because they live outside this hook:
   *   @param {function} setProgress  — shared progress setter (owned by provider)
   *   @param {object}   authHeaders  — pre-derived headers (shared with image phase)
   *   @param {string[]} textTypes    — non-image content types for this run
   *   @param {number}   totalSteps   — total step count (text + image) for progress math
   *
   * setError is NOT a param — it is a constructor-param closure (same pattern as
   * useImageGeneration) so it is always in scope here.
   */
  const generateText = useCallback(async ({ setProgress, authHeaders, textTypes, totalSteps, referenceIds = [] }) => {
    setProgress({ current: 0, total: totalSteps, label: 'Generating text content...' });

    const brandPayload = {
      brandName: brand.brandName,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      icpDescription: brand.icpDescription,
      brandGuidelines: brand.brandGuidelines,
      writingSamples: brand.writingSamples,
      ciDocumentText: brand.ciDocumentText,
    };

    let resolvedContent = null;

    // Background path (Cloud Run worker): no-file jobs run server-side so
    // they never time out and the user can navigate away. We only fall back
    // to the instant path when the job was NEVER queued (so we never
    // double-generate / double-charge). Files always use the instant path.
    let useSync = files.length > 0;

    if (!useSync) {
      const jobResult = await runJob({
        authHeaders,
        contentTypes: textTypes,
        options,
        brandData: brandPayload,
        textPrompt,
        videoUrls,
        referenceIds,
        totalSteps,
        setProgress,
      });

      if (jobResult.status === 'done') {
        resolvedContent = jobResult.content;
      } else if (jobResult.status === 'error') {
        setError(jobResult.error);
        return { ok: false };
      } else if (jobResult.status === 'timeout') {
        setError('Generation is taking longer than expected — check back shortly.');
        return { ok: false };
      } else {
        // status === 'unreachable' → never queued, fall back to sync path
        useSync = true;
      }
    }

    if (useSync) {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('contentTypes', JSON.stringify(textTypes));
      formData.append('options', JSON.stringify(options));
      formData.append('brandData', JSON.stringify(brandPayload));
      formData.append('videoUrls', JSON.stringify(videoUrls));
      formData.append('referenceIds', JSON.stringify(referenceIds));
      if (textPrompt.trim()) formData.append('textPrompt', textPrompt.trim());

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!res.ok && res.headers.get('content-type')?.indexOf('application/json') === -1) {
        throw new Error(`Server error (${res.status}). The request may have timed out.`);
      }

      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Text generation failed');
        return { ok: false };
      }
      resolvedContent = data.content;
    }

    setContent(resolvedContent);
    const wantImages = totalSteps > textTypes.length;
    setProgress({
      current: textTypes.length,
      total: totalSteps,
      label: wantImages ? 'Text done, generating images...' : 'Done!',
    });

    return { ok: true };
  // brand, files, videoUrls, textPrompt, options, setError are closure deps.
  // runJob is stable (no internal state, returned from a plain hook call).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, files, videoUrls, textPrompt, options, setError, runJob]);

  // ── resumeText — re-attach to a background job after a reload / reopened tab ──
  // Called once on provider mount. Restores the generated text into `content`
  // when the server-side job finishes (the whole point of "click away, come
  // back, see results"). Returns the resume status so the provider can manage
  // the generating spinner. status==='none' means there was nothing to resume.
  const resumeText = useCallback(async ({ setProgress } = {}) => {
    const r = await resumeJob({ setProgress });
    if (r.status === 'done') {
      setContent(r.content || {});
      return { status: 'done' };
    }
    if (r.status === 'error') {
      setError(r.error || 'Generation failed');
      return { status: 'error' };
    }
    // 'timeout' (still running — try again later) or 'none'
    return { status: r.status };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJob, setError]);

  return {
    files,
    setFiles,
    videoUrls,
    setVideoUrls,
    textPrompt,
    setTextPrompt,
    selectedTypes,
    setSelectedTypes,
    options,
    setOptions,
    isDetectingTone,
    setIsDetectingTone,
    content,
    setContent,
    handleContentUpdate,
    generateText,
    resumeText,
  };
}
