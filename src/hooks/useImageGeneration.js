import { useState, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';

/**
 * useImageGeneration — owns all image-related state and handlers.
 *
 * @param {{ brand: object, setError: function }} params
 *   brand     — the active brand record from useBrandState. The hook reads
 *               logoBase64, brandName, primaryColor, secondaryColor,
 *               brandGuidelines, and ciDocumentText for image prompts and
 *               regeneration/edit calls.
 *   setError  — the shared error setter from GenerationProvider. Passed as
 *               a stable constructor param so the interactive handlers
 *               (regenerate, edit, variations) can surface errors into the
 *               shared UI error state, matching original behaviour exactly.
 */
export function useImageGeneration({ brand, setError }) {
  const { getAuthHeaders } = useAuth();

  // ── Image config ──────────────────────────────────────────────────────────
  const [imageConfig, setImageConfig] = useState({
    selectedStyles: new Set(['minimal', 'vibrant', 'editorial']),
    customGuidelines: '',
    customStylePrompt: '',
    avoidList: '',
    referenceImageBase64: null,
    referenceImageMimeType: null,
    referenceImagePreview: null, // data URL for the UI preview only
    generateThisRun: true,       // "Generate images this run?" toggle — default ON preserves existing behaviour
  });

  // ── Image results + loading flags ─────────────────────────────────────────
  const [images, setImages] = useState([]);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [isImageRegenerating, setIsImageRegenerating] = useState(false);

  // ── Image-phase orchestration (called from handleGenerate in the provider) ─
  /**
   * generateImages — runs the full image-generation phase.
   *
   * Parameters threaded from the orchestrator (GenerationContext.handleGenerate)
   * because they live in state/scope the hook does not own:
   *   @param {function} setProgress   — shared progress setter (owned by provider)
   *   @param {string}   textPrompt    — user's raw text input (owned by provider)
   *   @param {object}   authHeaders   — pre-derived headers from getAuthHeaders()
   *                                     (derived in the orchestrator so it can be
   *                                     shared with the text phase and is consistent
   *                                     within a single handleGenerate call)
   *
   * Note: setError is NOT passed here — it is a constructor param to the hook,
   * so generateImages inherits it via closure, just like the interactive handlers.
   */
  const generateImages = useCallback(async ({ setProgress, textPrompt, authHeaders }) => {
    // Early-return when the user toggled "Generate images this run?" OFF.
    // Placed BEFORE setIsImageGenerating(true) so isImageGenerating ownership
    // is never disturbed — quick_reference.org: "isImageGenerating is managed
    // entirely inside useImageGeneration; generateImages clears it in its own
    // finally. Do not add a reset in the provider's finally — it would create a race."
    // This is an ADDITIONAL skip path; the text-failure early-abort in the provider
    // (handleGenerate returns before images on { ok: false }) is unchanged.
    if (!imageConfig.generateThisRun) {
      setImages([]);
      return;
    }
    setIsImageGenerating(true);

    // Prefer the user's own topic description over a generic brand-name placeholder —
    // weak topic summaries make the model invent dramatic, off-brand scenes.
    const topicFromPrompt = textPrompt && textPrompt.trim() ? textPrompt.trim().slice(0, 500) : '';
    const topicSummary = topicFromPrompt
      || (brand.brandName ? `Professional content for ${brand.brandName}` : 'Content based on uploaded materials');

    try {
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
            // Pass full brand voice context so image prompts can honour
            // guidelines + CI document without overriding visual style.
            brandGuidelines: brand.brandGuidelines,
            ciDocumentText: brand.ciDocumentText,
          },
          selectedStyles: [...imageConfig.selectedStyles],
          customGuidelines: imageConfig.customGuidelines,
          customStylePrompt: imageConfig.customStylePrompt,
          avoidList: imageConfig.avoidList,
          hasReferenceImage: !!imageConfig.referenceImageBase64,
        }),
      });

      const promptData = await promptRes.json();
      if (!promptData.success) {
        setError(prev => prev ? `${prev}\n${promptData.error}` : promptData.error);
        setIsImageGenerating(false);
        return;
      }

      const totalImages = promptData.prompts.length;
      const imageResults = [];
      let completed = 0;

      for (const { style, variant, prompt } of promptData.prompts) {
        setProgress(prev => ({ ...prev, label: `Generating image ${completed + 1} of ${totalImages} (${style})...` }));
        try {
          const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              logoBase64: brand.logoBase64,
              referenceImageBase64: imageConfig.referenceImageBase64,
              referenceImageMimeType: imageConfig.referenceImageMimeType,
            }),
          });
          const data = await res.json();
          imageResults.push({ style, variant, prompt, ...data });
        } catch (imgErr) {
          imageResults.push({ style, variant, prompt, success: false, error: imgErr.message });
        }
        completed++;
        setImages([...imageResults]);
      }
    } finally {
      setIsImageGenerating(false);
    }
  // imageConfig and brand are read inside the async body via closure.
  // setError is also a closure dep (constructor param, stable across renders).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, imageConfig, setError]);

  // ── Regenerate a single image ─────────────────────────────────────────────
  const handleRegenerateImage = useCallback(async (imageIndex, prompt) => {
    setIsImageRegenerating(true);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          logoBase64: brand.logoBase64,
          // Keep the reference-image style on regeneration (was being dropped).
          referenceImageBase64: imageConfig.referenceImageBase64,
          referenceImageMimeType: imageConfig.referenceImageMimeType,
        }),
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
  }, [brand.logoBase64, imageConfig.referenceImageBase64, imageConfig.referenceImageMimeType, getAuthHeaders, setError]);

  // ── Edit an existing image ────────────────────────────────────────────────
  const handleEditImage = useCallback(async (imageIndex, editInstruction) => {
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
  }, [brand.logoBase64, images, getAuthHeaders, setError]);

  // ── Generate variations of an existing image ──────────────────────────────
  const handleGenerateVariations = useCallback(async (imageIndex, basePrompt) => {
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
            body: JSON.stringify({
              prompt: variationPrompts[i],
              logoBase64: brand.logoBase64,
              // Keep the reference-image style across variations too.
              referenceImageBase64: imageConfig.referenceImageBase64,
              referenceImageMimeType: imageConfig.referenceImageMimeType,
            }),
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
  }, [brand.logoBase64, imageConfig.referenceImageBase64, imageConfig.referenceImageMimeType, images, getAuthHeaders, setError]);

  return {
    imageConfig,
    setImageConfig,
    images,
    setImages,
    isImageGenerating,
    setIsImageGenerating,
    isImageRegenerating,
    setIsImageRegenerating,
    handleRegenerateImage,
    handleEditImage,
    handleGenerateVariations,
    generateImages,
  };
}
