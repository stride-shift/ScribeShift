import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useBrandState } from '../hooks/useBrandState';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { useTextGeneration } from '../hooks/useTextGeneration';
import { getPersistedJob } from '../hooks/useGenerationJob';

const GenerationContext = createContext(null);

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be used within GenerationProvider');
  return ctx;
}

export function GenerationProvider({ children }) {
  const { getAuthHeaders } = useAuth();

  // Brand cluster — owned by useBrandState
  const { brand, setBrand, savedBrands, brandsMeta, activeBrandId, setActiveBrandId, loadBrands } = useBrandState();

  // Shared error state — declared before useImageGeneration and useTextGeneration so
  // that both hooks can receive setError as a stable constructor param.
  const [error, setError] = useState('');

  // Image cluster — owned by useImageGeneration
  const {
    imageConfig, setImageConfig,
    images, setImages,
    isImageGenerating,
    isImageRegenerating,
    handleRegenerateImage,
    handleEditImage,
    handleGenerateVariations,
    generateImages,
  } = useImageGeneration({ brand, setError });

  // Text cluster — owned by useTextGeneration
  const {
    files, setFiles,
    videoUrls, setVideoUrls,
    textPrompt, setTextPrompt,
    selectedTypes, setSelectedTypes,
    options, setOptions,
    isDetectingTone, setIsDetectingTone,
    content, setContent,
    handleContentUpdate,
    generateText,
    resumeText,
  } = useTextGeneration({ brand, setError });

  // H1 hoist: seed audience + image-style defaults from the active brand.
  // Only applies when the user is still on the generic defaults — we must not
  // clobber edits they've already made this session.
  // Runs whenever the loaded brand changes (covers initial load + brand switch).
  useEffect(() => {
    if (!brand || !brand.brandName) return;
    // Seed audience default: only when still at 'general' (the initial value).
    if (brand.default_audience) {
      setOptions((prev) => (
        prev.audience && prev.audience !== 'general'
          ? prev
          : { ...prev, audience: brand.default_audience }
      ));
    }
    // Seed image-style defaults: only when the user is still on the starter set.
    if (Array.isArray(brand.default_image_styles) && brand.default_image_styles.length > 0) {
      setImageConfig((prev) => {
        const currentKeys = [...prev.selectedStyles].sort().join(',');
        const starterKeys = ['editorial', 'minimal', 'vibrant'].sort().join(',');
        // Only overwrite when the user is still on the starter selection
        // so we don't clobber an active editing session.
        if (currentKeys !== starterKeys) return prev;
        return { ...prev, selectedStyles: new Set(brand.default_image_styles) };
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.brandName, brand.default_audience, brand.default_image_styles, activeBrandId]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const resultRef = useRef(null);

  // Resume an in-flight background generation after a reload / reopened tab.
  // The work runs server-side (Cloud Run worker), so it survived the tab being
  // closed; here we re-attach to it and drop the finished content into `content`
  // when it lands — "click away, come back, see your results."
  useEffect(() => {
    if (!getPersistedJob()?.jobId) return; // nothing to resume
    let cancelled = false;
    setIsGenerating(true);
    setProgress({ current: 0, total: 1, label: 'Resuming your generation…' });
    (async () => {
      const r = await resumeText({ setProgress });
      if (cancelled) return;
      setIsGenerating(false);
      if (r?.status === 'done') {
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate = (files.length > 0 || videoUrls.length > 0 || textPrompt.trim().length > 0) && selectedTypes.size > 0 && !isGenerating;
  const hasResults = Object.keys(content).length > 0 || images.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError('');
    setContent({});
    setImages([]);  // reset image results (setImages comes from useImageGeneration)

    const types = [...selectedTypes];
    const textTypes = types.filter(t => t !== 'images');
    const wantImages = types.includes('images');
    const totalSteps = textTypes.length + (wantImages ? 1 : 0);

    const hasMedia = files.some(f => f.type?.startsWith('video/') || f.type?.startsWith('audio/'));
    const hasYouTube = videoUrls.some(u => u.includes('youtube.com') || u.includes('youtu.be'));
    const prepLabel = (hasMedia || hasYouTube) ? 'Processing media & extracting transcripts...' : 'Preparing...';
    setProgress({ current: 0, total: totalSteps, label: prepLabel });

    const authHeaders = getAuthHeaders();

    try {
      if (textTypes.length > 0) {
        // Delegate to the text hook's phase function.
        // setError is a constructor param to the hook (closure) — not passed here.
        // We pass only: the shared progress setter, the pre-derived authHeaders,
        // the text content types, and totalSteps for progress math.
        // Reference picks (from the Create tickbox) — doc/PDF refs feed the
        // text prompt for tone/voice; image refs feed image gen separately.
        const referenceIds = (imageConfig.referencePicks || []).map((r) => r.id);
        const textResult = await generateText({ setProgress, authHeaders, textTypes, totalSteps, referenceIds });
        if (!textResult.ok) return;
      }

      if (wantImages) {
        // Delegate to the image hook's orchestration function.
        // setError is a constructor param to the hook (closure) — not passed here.
        // We pass only: the shared progress setter, the user's text prompt (for
        // topic inference), and the pre-derived authHeaders for this run.
        await generateImages({ setProgress, textPrompt, authHeaders });
      }

      setProgress({ current: totalSteps, total: totalSteps, label: 'Done!' });
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsGenerating(false);
      // isImageGenerating is managed by useImageGeneration; generateImages
      // clears it in its own finally block, so no action needed here.
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const value = {
    brand, setBrand,
    savedBrands, brandsMeta,
    activeBrandId, setActiveBrandId, loadBrands,
    files, setFiles,
    videoUrls, setVideoUrls,
    textPrompt, setTextPrompt,
    selectedTypes, setSelectedTypes,
    options, setOptions,
    isDetectingTone, setIsDetectingTone,
    imageConfig, setImageConfig,
    content, images,
    isGenerating, isImageGenerating, isImageRegenerating,
    progress, pct,
    error, setError,
    resultRef,
    canGenerate, hasResults,
    handleGenerate,
    handleContentUpdate,
    handleRegenerateImage,
    handleEditImage,
    handleGenerateVariations,
  };

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
}
