import { createContext, useContext, useState, useRef } from 'react';
import { useAuth } from './AuthProvider';

const GenerationContext = createContext(null);

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be used within GenerationProvider');
  return ctx;
}

export function GenerationProvider({ children }) {
  const { getAuthHeaders } = useAuth();

  // Brand identity
  const [brand, setBrand] = useState({
    brandName: '',
    primaryColor: '#3b82f6',
    secondaryColor: '#475569',
    logoBase64: null,
    logoPreviewUrl: null,
  });

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
        const topicSummary = brand.brandName
          ? `Professional content for ${brand.brandName}`
          : 'Content based on uploaded materials';

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
