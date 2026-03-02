import React, { useState } from 'react';

const CATEGORIES = [
  {
    label: 'Text Content',
    types: [
      { value: 'blog', title: 'Blog Post', desc: '600 words, conversational tone' },
      { value: 'video', title: 'Video Script', desc: '3-5 min with visual directions' },
      { value: 'newsletter', title: 'Newsletter', desc: 'Warm, branded email format' },
    ],
  },
  {
    label: 'Social Media',
    types: [
      { value: 'linkedin', title: 'LinkedIn', desc: '5 professional thought-leadership posts' },
      { value: 'twitter', title: 'Twitter / X', desc: '5 punchy, shareable posts' },
      { value: 'facebook', title: 'Facebook', desc: '5 engaging, conversational posts' },
      { value: 'instagram', title: 'Instagram', desc: '5 captions with hashtags & image ideas' },
    ],
  },
];

const IMAGE_STYLES = [
  { key: 'minimal', name: 'Clean & Minimal', desc: 'Flat shapes, whitespace, Swiss-design', gradient: 'linear-gradient(135deg, #e2e8f0, #f8fafc, #cbd5e1)' },
  { key: 'vibrant', name: 'Bold & Vibrant', desc: 'Saturated colors, geometric, energetic', gradient: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)' },
  { key: 'editorial', name: 'Editorial', desc: 'Professional, magazine-quality, polished', gradient: 'linear-gradient(135deg, #1e293b, #334155, #475569)' },
  { key: 'artistic', name: 'Artistic', desc: 'Painterly, mixed-media, textured', gradient: 'linear-gradient(135deg, #c084fc, #fb923c, #34d399)' },
  { key: 'retro', name: 'Retro', desc: '70s/80s vintage, warm film tones', gradient: 'linear-gradient(135deg, #d97706, #b45309, #92400e)' },
  { key: 'modern', name: 'Modern', desc: 'Glass-morphism, gradients, sleek UI', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6)' },
  { key: 'futuristic', name: 'Futuristic', desc: 'Neon grids, cyberpunk, sci-fi glow', gradient: 'linear-gradient(135deg, #0f172a, #7c3aed, #06ffc7)' },
  { key: 'cinematic', name: 'Cinematic', desc: 'Movie-poster lighting, dramatic depth', gradient: 'linear-gradient(135deg, #0c0a09, #dc2626, #f59f0a)' },
];

const ALL_VALUES = CATEGORIES.flatMap(c => c.types.map(t => t.value));

export default function ContentTypeSelector({ selected, onChange, imageConfig, onImageConfigChange }) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const allSelected = ALL_VALUES.every(v => selected.has(v)) && selected.has('images');

  const toggle = (val) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    onChange(next);
  };

  const toggleCategory = (category) => {
    const vals = category.types.map(t => t.value);
    const allCatSelected = vals.every(v => selected.has(v));
    const next = new Set(selected);
    vals.forEach(v => allCatSelected ? next.delete(v) : next.add(v));
    onChange(next);
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange(new Set());
    } else {
      const next = new Set([...ALL_VALUES, 'images']);
      onChange(next);
    }
  };

  const toggleStyle = (key) => {
    const next = new Set(imageConfig.selectedStyles);
    if (next.has(key)) next.delete(key); else next.add(key);
    onImageConfigChange({ ...imageConfig, selectedStyles: next });
  };

  const imagesSelected = selected.has('images');
  const styleCount = imageConfig.selectedStyles.size;
  const customAdds = imageConfig.customStylePrompt.trim() ? 3 : 0;
  const totalImages = (styleCount * 3) + customAdds;

  const handleImagesToggle = () => {
    const next = new Set(selected);
    if (next.has('images')) {
      next.delete('images');
      setImageExpanded(false);
    } else {
      next.add('images');
      setImageExpanded(true);
    }
    onChange(next);
  };

  return (
    <div className="card">
      <div className="card-title"><span className="step">3</span> Content Types</div>

      {CATEGORIES.map((cat) => {
        const catSelected = cat.types.every(t => selected.has(t.value));
        return (
          <div key={cat.label} className="content-category">
            <div className="category-header" onClick={() => toggleCategory(cat)}>
              <span className={`category-dot ${catSelected ? 'active' : ''}`} />
              <span className="category-label">{cat.label}</span>
              <span className="category-count">
                {cat.types.filter(t => selected.has(t.value)).length}/{cat.types.length}
              </span>
            </div>
            <div className="type-grid">
              {cat.types.map((t) => (
                <label key={t.value} className={`type-card ${selected.has(t.value) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selected.has(t.value)} onChange={() => toggle(t.value)} />
                  <div className="info">
                    <h3>{t.title}</h3>
                    <p>{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {/* Image Suite Section */}
      <div className="content-category">
        <div className="category-header" onClick={handleImagesToggle}>
          <span className={`category-dot ${imagesSelected ? 'active' : ''}`} />
          <span className="category-label">Image Suite</span>
          {imagesSelected && (
            <span className="category-count">{styleCount} styles — {totalImages} images</span>
          )}
        </div>

        {imagesSelected && (
          <div className="image-config-section">
            <div className="image-style-grid">
              {IMAGE_STYLES.map((style) => {
                const isActive = imageConfig.selectedStyles.has(style.key);
                return (
                  <div
                    key={style.key}
                    className={`image-style-card ${isActive ? 'selected' : ''}`}
                    onClick={() => toggleStyle(style.key)}
                  >
                    <div className="style-swatch" style={{ background: style.gradient }} />
                    <div className="style-card-info">
                      <div className="style-card-name">{style.name}</div>
                      <div className="style-card-desc">{style.desc}</div>
                    </div>
                    {isActive && (
                      <div className="style-check">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="image-config-extras">
              <div className="image-config-field">
                <label className="option-label">Additional Guidelines (applied to all styles)</label>
                <textarea
                  className="image-config-textarea"
                  placeholder="e.g. Use dark backgrounds, include abstract shapes, keep text-free..."
                  value={imageConfig.customGuidelines}
                  onChange={(e) => onImageConfigChange({ ...imageConfig, customGuidelines: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="image-config-field">
                <label className="option-label">Custom Style Prompt (generates 3 extra images)</label>
                <textarea
                  className="image-config-textarea"
                  placeholder="e.g. Watercolor illustration on aged paper with botanical elements and gold leaf accents..."
                  value={imageConfig.customStylePrompt}
                  onChange={(e) => onImageConfigChange({ ...imageConfig, customStylePrompt: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="image-summary">
              {styleCount} style{styleCount !== 1 ? 's' : ''} selected
              {customAdds > 0 ? ' + custom' : ''}
              {' — '}
              <strong>{totalImages} images</strong> will be generated
            </div>
          </div>
        )}
      </div>

      <label className={`select-all-bar ${allSelected ? 'active' : ''}`}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
        Select All Types
      </label>
    </div>
  );
}
