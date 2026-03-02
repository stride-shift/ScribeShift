import React, { useState } from 'react';

const STYLE_LABELS = {
  minimal: 'Clean & Minimal',
  vibrant: 'Bold & Vibrant',
  editorial: 'Professional & Editorial',
  artistic: 'Artistic & Painterly',
  retro: 'Retro Vintage',
  modern: 'Modern & Sleek',
  futuristic: 'Futuristic & Neon',
  cinematic: 'Cinematic & Dramatic',
  custom: 'Custom Style',
};

const VARIATION_PRESETS = [
  { label: 'Subtle variation', suffix: 'Create a subtle variation of this image. Keep the same overall composition, colors, and mood but make small changes to layout, element placement, or details. The result should feel like a sibling of the original, not a twin.' },
  { label: 'Different angle', suffix: 'Reimagine this image from a completely different visual angle or perspective. Keep the same topic and brand elements but change the composition, layout, and visual approach significantly.' },
  { label: 'Bolder / more dramatic', suffix: 'Make this image more dramatic and impactful. Increase contrast, make colors more vibrant, add more visual weight. The mood should be more intense and attention-grabbing.' },
  { label: 'Softer / more minimal', suffix: 'Make this image softer and more minimal. Reduce visual complexity, add more white space, soften colors, and simplify the composition. Less is more.' },
];

export default function ImageGallery({ images, onRegenerateImage, isRegenerating, onGenerateVariations }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [activeVariation, setActiveVariation] = useState(null);

  // Derive unique styles from images instead of hardcoding
  const styles = [...new Set(images.map(img => img.style))];

  const handleExpand = (index) => {
    const img = images[index];
    setExpandedIndex(index);
    setEditPrompt(img.prompt || '');
    setChangeDescription('');
    setActiveVariation(null);
  };

  const handleClose = () => {
    setExpandedIndex(null);
    setEditPrompt('');
    setChangeDescription('');
    setActiveVariation(null);
  };

  const handleRegenerate = () => {
    if (expandedIndex === null) return;
    const finalPrompt = changeDescription
      ? `${editPrompt}\n\nAdditional changes requested: ${changeDescription}`
      : editPrompt;
    onRegenerateImage(expandedIndex, finalPrompt);
  };

  const handleVariation = (preset) => {
    if (expandedIndex === null) return;
    setActiveVariation(preset.label);
    const variationPrompt = `${editPrompt}\n\n${preset.suffix}`;
    onRegenerateImage(expandedIndex, variationPrompt);
  };

  const handleCreateSeries = () => {
    if (expandedIndex === null || !onGenerateVariations) return;
    onGenerateVariations(expandedIndex, editPrompt);
  };

  const handleDownload = (img, index) => {
    if (!img.base64) return;
    const link = document.createElement('a');
    link.href = `data:${img.mimeType || 'image/png'};base64,${img.base64}`;
    link.download = `scribeshift_${img.style}_v${img.variant + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    images.forEach((img, i) => {
      if (img.success && img.base64) {
        setTimeout(() => handleDownload(img, i), i * 200);
      }
    });
  };

  const expandedImg = expandedIndex !== null ? images[expandedIndex] : null;

  return (
    <div className="image-gallery">
      <div className="gallery-header">
        <span>Generated Images</span>
        <button className="btn" onClick={handleDownloadAll}>Download All</button>
      </div>

      {styles.map((style) => {
        const styleImages = images.filter(img => img.style === style);
        if (!styleImages.length) return null;

        return (
          <div key={style} className="gallery-style-group">
            <div className="gallery-style-label">{STYLE_LABELS[style] || style}</div>
            <div className="gallery-grid">
              {styleImages.map((img) => {
                const globalIndex = images.indexOf(img);
                return (
                  <div
                    key={globalIndex}
                    className={`gallery-cell ${img.success ? '' : 'failed'}`}
                    onClick={() => img.success && handleExpand(globalIndex)}
                  >
                    {img.success && img.base64 ? (
                      <img
                        src={`data:${img.mimeType || 'image/png'};base64,${img.base64}`}
                        alt={`${style} variant ${img.variant + 1}`}
                      />
                    ) : (
                      <div className="gallery-cell-error">
                        <span>Failed</span>
                        <span className="error-detail">{img.error?.substring(0, 60)}</span>
                      </div>
                    )}
                    <div className="gallery-cell-overlay">
                      <span>V{img.variant + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Expanded overlay with variation controls */}
      {expandedImg && (
        <div className="gallery-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
          <div className="gallery-overlay-content">
            <button className="overlay-close" onClick={handleClose}>&times;</button>

            <div className="overlay-image">
              {expandedImg.base64 && (
                <img
                  src={`data:${expandedImg.mimeType || 'image/png'};base64,${expandedImg.base64}`}
                  alt="Expanded view"
                />
              )}
            </div>

            <div className="overlay-controls">
              {/* Quick variation buttons */}
              <div className="variation-section">
                <label className="option-label">Quick Variations</label>
                <div className="variation-grid">
                  {VARIATION_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      className={`variation-btn ${activeVariation === preset.label && isRegenerating ? 'active' : ''}`}
                      onClick={() => handleVariation(preset)}
                      disabled={isRegenerating}
                    >
                      {activeVariation === preset.label && isRegenerating ? '...' : preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Create series from this image */}
              {onGenerateVariations && (
                <button
                  className={`btn btn-series ${isRegenerating ? 'loading' : ''}`}
                  onClick={handleCreateSeries}
                  disabled={isRegenerating}
                  title="Generate 3 more variations based on this image's style and prompt"
                >
                  Create Series (3 variants)
                </button>
              )}

              <div className="overlay-divider" />

              <label className="option-label">Edit Prompt</label>
              <textarea
                className="overlay-prompt"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={4}
              />

              <label className="option-label">Describe changes</label>
              <input
                type="text"
                className="brand-input"
                placeholder="e.g. Make the background darker, add more contrast..."
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
              />

              <div className="overlay-actions">
                <button
                  className={`btn btn-primary ${isRegenerating ? 'loading' : ''}`}
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? '' : 'Regenerate'}
                </button>
                <button className="btn" onClick={() => handleDownload(expandedImg, expandedIndex)}>
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
