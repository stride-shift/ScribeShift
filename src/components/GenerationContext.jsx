import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { useBrandState } from '../hooks/useBrandState';
import { useImageGeneration } from '../hooks/useImageGeneration';

const GenerationContext = createContext(null);

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be used within GenerationProvider');
  return ctx;
}

export function GenerationProvider({ children }) {
  const { getAuthHeaders, isAuthenticated } = useAuth();

  // Brand cluster — owned by useBrandState
  const { brand, setBrand, savedBrands, brandsMeta, activeBrandId, setActiveBrandId, loadBrands } = useBrandState();

  // Shared error state — declared before useImageGeneration so that hook can
  // receive setError as a stable constructor param (for regenerate/edit/variations).
  const [error, setError] = useState('');

  // Image cluster — owned by useImageGeneration
  const {
    imageConfig, setImageConfig,
    images, setImages,
    isImageGenerating, setIsImageGenerating,
    isImageRegenerating,
    handleRegenerateImage,
    handleEditImage,
    handleGenerateVariations,
    generateImages,
  } = useImageGeneration({ brand, setError });

  // File uploads & inputs
  const [files, setFiles] = useState([]);
  const [videoUrls, setVideoUrls] = useState([]);
  const [textPrompt, setTextPrompt] = useState('');

  // Content generation
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

  const [content, setContent] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const resultRef = useRef(null);

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

        let content = null;
        // Background path (Cloud Run worker): no-file jobs run server-side so
        // they never time out and the user can navigate away. We only fall back
        // to the instant path when the job was NEVER queued (so we never
        // double-generate / double-charge). Files always use the instant path.
        let useSync = files.length > 0;

        if (!useSync) {
          let jobId = null;
          try {
            const enqRes = await fetch('/api/generate/enqueue', {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ contentTypes: textTypes, options, brandData: brandPayload, textPrompt: textPrompt.trim(), videoUrls }),
            });
            if (enqRes.ok) { jobId = (await enqRes.json()).jobId || null; }
          } catch { /* enqueue unreachable */ }

          if (!jobId) {
            useSync = true; // never queued → safe to run the instant path
          } else {
            const deadline = Date.now() + 6 * 60 * 1000; // 6-min cap
            let done = false;
            while (Date.now() < deadline) {
              await new Promise(r => setTimeout(r, 2500));
              const { data: job } = await supabase
                .from('generation_jobs')
                .select('status, progress, result, error')
                .eq('id', jobId)
                .single();
              if (job?.progress) {
                setProgress({ current: job.progress.current ?? 0, total: totalSteps, label: job.progress.label || 'Generating…' });
              }
              if (job?.status === 'done') { content = job.result || {}; done = true; break; }
              if (job?.status === 'error') { setError(job.error || 'Text generation failed'); setIsGenerating(false); return; }
            }
            if (!done) { setError('Generation is taking longer than expected — check back shortly.'); setIsGenerating(false); return; }
          }
        }

        if (useSync) {
          const formData = new FormData();
          files.forEach(f => formData.append('files', f));
          formData.append('contentTypes', JSON.stringify(textTypes));
          formData.append('options', JSON.stringify(options));
          formData.append('brandData', JSON.stringify(brandPayload));
          formData.append('videoUrls', JSON.stringify(videoUrls));
          if (textPrompt.trim()) formData.append('textPrompt', textPrompt.trim());

          const res = await fetch('/api/generate', { method: 'POST', headers: authHeaders, body: formData });
          if (!res.ok && res.headers.get('content-type')?.indexOf('application/json') === -1) {
            throw new Error(`Server error (${res.status}). The request may have timed out.`);
          }
          const data = await res.json();
          if (!data.success) {
            setError(data.error || 'Text generation failed');
            setIsGenerating(false);
            return;
          }
          content = data.content;
        }

        setContent(content);
        setProgress({ current: textTypes.length, total: totalSteps, label: wantImages ? 'Text done, generating images...' : 'Done!' });
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

  const handleContentUpdate = (platform, newContent) => {
    setContent(prev => ({ ...prev, [platform]: newContent }));
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
