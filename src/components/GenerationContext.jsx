import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';

const GenerationContext = createContext(null);

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be used within GenerationProvider');
  return ctx;
}

export function GenerationProvider({ children }) {
  const { getAuthHeaders, isAuthenticated } = useAuth();

  // Brand identity (in-memory copy used by Create — synced from active brand on load)
  const [brand, setBrand] = useState({
    brandName: '',
    primaryColor: '#3b82f6',
    secondaryColor: '#475569',
    logoBase64: null,
    logoPreviewUrl: null,
    icpDescription: '',
    brandGuidelines: '',
    writingSamples: ['', '', ''],
  });

  // List of saved brands and the currently-active brand id (persisted)
  const [savedBrands, setSavedBrands] = useState([]);
  const [brandsMeta, setBrandsMeta] = useState({ limit: 1, used: 0 });
  const [activeBrandId, setActiveBrandIdRaw] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('scribeshift-active-brand') || null;
  });

  const setActiveBrandId = useCallback((id) => {
    setActiveBrandIdRaw(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('scribeshift-active-brand', id);
      else localStorage.removeItem('scribeshift-active-brand');
    }
  }, []);

  const loadBrands = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/brands', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const list = data.brands || [];
      setSavedBrands(list);
      setBrandsMeta({ limit: data.limit ?? 1, used: data.used ?? list.length });

      // Pick an active brand: stored id if still valid, else first available
      let activeId = activeBrandId;
      if (activeId && !list.some(b => b.id === activeId)) activeId = null;
      if (!activeId && list.length > 0) activeId = list[0].id;
      if (activeId !== activeBrandId) setActiveBrandId(activeId);

      // Hydrate the in-memory brand from the active record
      const active = list.find(b => b.id === activeId);
      if (active) {
        setBrand((prev) => ({
          ...prev,
          brandName: active.brand_name || '',
          primaryColor: active.primary_color || '#3b82f6',
          secondaryColor: active.secondary_color || '#475569',
          icpDescription: active.icp_description || '',
          brandGuidelines: active.brand_guidelines || '',
          writingSamples: (active.writing_samples && active.writing_samples.length > 0)
            ? active.writing_samples
            : ['', '', ''],
        }));
      }
    } catch (err) {
      console.warn('[BRANDS] load failed:', err.message);
    }
  }, [getAuthHeaders, isAuthenticated, activeBrandId, setActiveBrandId]);

  // Load brands on auth + when active brand changes
  useEffect(() => {
    if (isAuthenticated) loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeBrandId]);

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
  const [imageConfig, setImageConfig] = useState({
    selectedStyles: new Set(['minimal', 'vibrant', 'editorial']),
    customGuidelines: '',
    customStylePrompt: '',
    avoidList: '',
  });
  const [content, setContent] = useState({});
  const [images, setImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [isImageRegenerating, setIsImageRegenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [error, setError] = useState('');
  const resultRef = useRef(null);

  const canGenerate = (files.length > 0 || videoUrls.length > 0 || textPrompt.trim().length > 0) && selectedTypes.size > 0 && !isGenerating;
  const hasResults = Object.keys(content).length > 0 || images.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError('');
    setContent({});
    setImages([]);

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

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('contentTypes', JSON.stringify(textTypes));
        formData.append('options', JSON.stringify(options));
        formData.append('brandData', JSON.stringify({
          brandName: brand.brandName,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          icpDescription: brand.icpDescription,
          brandGuidelines: brand.brandGuidelines,
          writingSamples: brand.writingSamples,
        }));
        formData.append('videoUrls', JSON.stringify(videoUrls));
        if (textPrompt.trim()) {
          formData.append('textPrompt', textPrompt.trim());
        }

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
          setIsGenerating(false);
          return;
        }

        setContent(data.content);
        setProgress({ current: textTypes.length, total: totalSteps, label: wantImages ? 'Text done, generating images...' : 'Done!' });
      }

      if (wantImages) {
        setIsImageGenerating(true);
        // Prefer the user's own topic description over a generic brand-name placeholder —
        // weak topic summaries make the model invent dramatic, off-brand scenes.
        const topicFromPrompt = textPrompt && textPrompt.trim() ? textPrompt.trim().slice(0, 500) : '';
        const topicSummary = topicFromPrompt
          || (brand.brandName ? `Professional content for ${brand.brandName}` : 'Content based on uploaded materials');

        const promptRes = await fetch('/api/build-image-prompts', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicSummary,
            brandData: {
              brandName: brand.brandName,
              primaryColor: brand.primaryColor,
              secondaryColor: brand.secondaryColor,
              logoBase64: brand.logoBase64,
            },
            selectedStyles: [...imageConfig.selectedStyles],
            customGuidelines: imageConfig.customGuidelines,
            customStylePrompt: imageConfig.customStylePrompt,
            avoidList: imageConfig.avoidList,
          }),
        });
        const promptData = await promptRes.json();
        if (!promptData.success) {
          setError(prev => prev ? `${prev}\n${promptData.error}` : promptData.error);
          setIsImageGenerating(false);
        } else {
          const totalImages = promptData.prompts.length;
          const imageResults = [];
          let completed = 0;

          for (const { style, variant, prompt } of promptData.prompts) {
            setProgress(prev => ({ ...prev, label: `Generating image ${completed + 1} of ${totalImages} (${style})...` }));
            try {
              const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, logoBase64: brand.logoBase64 }),
              });
              const data = await res.json();
              imageResults.push({ style, variant, prompt, ...data });
            } catch (imgErr) {
              imageResults.push({ style, variant, prompt, success: false, error: imgErr.message });
            }
            completed++;
            setImages([...imageResults]);
          }
          setIsImageGenerating(false);
        }
      }

      setProgress({ current: totalSteps, total: totalSteps, label: 'Done!' });
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsGenerating(false);
      setIsImageGenerating(false);
    }
  };

  const handleContentUpdate = (platform, newContent) => {
    setContent(prev => ({ ...prev, [platform]: newContent }));
  };

  const handleRegenerateImage = async (imageIndex, prompt) => {
    setIsImageRegenerating(true);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, logoBase64: brand.logoBase64 }),
      });
      const data = await res.json();
      if (data.success) {
        setImages(prev => prev.map((img, i) =>
          i === imageIndex ? { ...img, base64: data.base64, mimeType: data.mimeType, prompt, success: true } : img
        ));
      } else {
        setError(`Image regeneration failed: ${data.error}`);
      }
    } catch (err) {
      setError(`Image regeneration error: ${err.message}`);
    } finally {
      setIsImageRegenerating(false);
    }
  };

  const handleEditImage = async (imageIndex, editInstruction) => {
    setIsImageRegenerating(true);
    try {
      const img = images[imageIndex];
      const res = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalBase64: img.base64,
          originalMimeType: img.mimeType,
          editInstruction,
          logoBase64: brand.logoBase64,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImages(prev => prev.map((im, i) =>
          i === imageIndex ? { ...im, base64: data.base64, mimeType: data.mimeType, success: true } : im
        ));
      } else {
        setError(`Image edit failed: ${data.error}`);
      }
    } catch (err) {
      setError(`Image edit error: ${err.message}`);
    } finally {
      setIsImageRegenerating(false);
    }
  };

  const handleGenerateVariations = async (imageIndex, basePrompt) => {
    setIsImageRegenerating(true);
    try {
      const sourceImg = images[imageIndex];
      const variationPrompts = [
        `${basePrompt}\n\nCreate variation 1: Keep the same overall theme and brand elements but adjust the composition, color balance, and visual details for a fresh take.`,
        `${basePrompt}\n\nCreate variation 2: Same topic and brand but explore a different visual approach — different layout, different emphasis, different mood within the same style family.`,
        `${basePrompt}\n\nCreate variation 3: A complementary piece that could sit alongside the original in a series. Same visual language but distinct enough to stand on its own.`,
      ];

      const newImages = [];
      for (let i = 0; i < variationPrompts.length; i++) {
        try {
          const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: variationPrompts[i], logoBase64: brand.logoBase64 }),
          });
          const data = await res.json();
          if (data.success) {
            newImages.push({
              base64: data.base64,
              mimeType: data.mimeType,
              prompt: variationPrompts[i],
              style: sourceImg.style,
              variant: (images.filter(img => img.style === sourceImg.style).length + i),
              success: true,
            });
          }
        } catch { /* continue on individual failures */ }
        if (i < variationPrompts.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages]);
      }
    } catch (err) {
      setError(`Variation generation error: ${err.message}`);
    } finally {
      setIsImageRegenerating(false);
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
