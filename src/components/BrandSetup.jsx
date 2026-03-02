import React, { useRef } from 'react';

export default function BrandSetup({ brand, onChange }) {
  const logoInputRef = useRef(null);

  const set = (key, val) => onChange({ ...brand, [key]: val });

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      set('logoBase64', base64);
      onChange({
        ...brand,
        logoBase64: base64,
        logoPreviewUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    onChange({ ...brand, logoBase64: null, logoPreviewUrl: null });
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  return (
    <div className="card">
      <div className="card-title"><span className="step">1</span> Brand Identity</div>
      <p className="card-subtitle">Optional — adds your branding to all generated content</p>

      <div className="brand-grid">
        <div className="brand-logo-section">
          <label className="option-label">Logo</label>
          {brand.logoPreviewUrl ? (
            <div className="logo-preview">
              <img src={brand.logoPreviewUrl} alt="Brand logo" />
              <button className="logo-remove" onClick={removeLogo} title="Remove logo">&times;</button>
            </div>
          ) : (
            <div className="logo-upload-zone" onClick={() => logoInputRef.current?.click()}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Upload logo</span>
            </div>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
        </div>

        <div className="brand-fields">
          <div className="brand-name-field">
            <label className="option-label" htmlFor="brand-name">Brand Name</label>
            <input
              id="brand-name"
              type="text"
              placeholder="e.g. Acme Corp"
              value={brand.brandName || ''}
              onChange={(e) => set('brandName', e.target.value)}
              className="brand-input"
            />
          </div>

          <div className="brand-colors">
            <div className="color-picker-group">
              <label className="option-label">Primary</label>
              <div className="color-input-row">
                <input
                  type="color"
                  value={brand.primaryColor || '#FBBF24'}
                  onChange={(e) => set('primaryColor', e.target.value)}
                />
                <input
                  type="text"
                  value={brand.primaryColor || '#FBBF24'}
                  onChange={(e) => set('primaryColor', e.target.value)}
                  className="color-hex"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="color-picker-group">
              <label className="option-label">Secondary</label>
              <div className="color-input-row">
                <input
                  type="color"
                  value={brand.secondaryColor || '#475569'}
                  onChange={(e) => set('secondaryColor', e.target.value)}
                />
                <input
                  type="text"
                  value={brand.secondaryColor || '#475569'}
                  onChange={(e) => set('secondaryColor', e.target.value)}
                  className="color-hex"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
