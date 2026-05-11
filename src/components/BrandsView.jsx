import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { useGeneration } from './GenerationContext';

const PLAN_LABELS = {
  free: 'Free',
  starter: 'Starter',
  agency: 'Agency',
  enterprise: 'Enterprise',
};

const EMPTY_DRAFT = {
  brand_name: '',
  primary_color: '#3b82f6',
  secondary_color: '#475569',
  industry: 'general',
  icp_description: '',
  brand_guidelines: '',
  writing_samples: ['', '', ''],
  logo_url: null,
  logoBase64: null,    // local-only: pending image to upload
  logoPreview: null,   // local-only: data URL for inline preview
  logoMimeType: null,
};

export default function BrandsView() {
  const { getAuthHeaders, user } = useAuth();
  const { activeBrandId, setActiveBrandId, loadBrands: refreshContextBrands } = useGeneration();
  const [brands, setBrands] = useState([]);
  const [limit, setLimit] = useState(1);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  // URL-extract state lives alongside the modal so we can reset it on close.
  const [extractUrl, setExtractUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedFrom, setExtractedFrom] = useState('');

  const planLabel = PLAN_LABELS[user?.company?.plan] || 'Free';
  const atLimit = used >= limit;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/brands', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load brands');
      setBrands(data.brands || []);
      setLimit(data.limit ?? 1);
      setUsed(data.used ?? 0);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    if (atLimit) return;
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError('');
    setModalMode('create');
  };

  const openEdit = (brand) => {
    setEditingId(brand.id);
    setDraft({
      brand_name: brand.brand_name || '',
      primary_color: brand.primary_color || '#3b82f6',
      secondary_color: brand.secondary_color || '#475569',
      industry: brand.industry || 'general',
      icp_description: brand.icp_description || '',
      brand_guidelines: brand.brand_guidelines || '',
      writing_samples: (brand.writing_samples && brand.writing_samples.length > 0)
        ? [...brand.writing_samples, '', '', ''].slice(0, Math.max(3, brand.writing_samples.length))
        : ['', '', ''],
      logo_url: brand.logo_url || null,
      logoBase64: null,
      logoPreview: brand.logo_url || null,
      logoMimeType: null,
    });
    setError('');
    setModalMode('edit');
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError('');
    setExtractUrl('');
    setExtractError('');
    setExtractedFrom('');
  };

  // Paste a website URL → AI fills the brand form. Mirrors the same flow in
  // OnboardingFlow's brand step (POST /api/brands/extract-from-url). Existing
  // user input is preserved — we only fill empty fields so the user never
  // loses anything they typed.
  const extractFromUrl = async () => {
    const trimmed = extractUrl.trim();
    if (!trimmed) {
      setExtractError('Paste a website URL first.');
      return;
    }
    setExtracting(true);
    setExtractError('');
    setExtractedFrom('');
    try {
      const res = await fetch('/api/brands/extract-from-url', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      // Defensive parsing: the endpoint may return HTML (e.g. if the dev API
      // server is running stale code without this route, the response could
      // be an SPA fallback). Don't blow up with a JSON parse error — show a
      // helpful message instead.
      const rawText = await res.text();
      let data;
      try { data = JSON.parse(rawText); }
      catch {
        throw new Error(
          res.status === 404
            ? 'Server is missing the extract endpoint — restart your dev server (npm run dev) and try again.'
            : `Server returned an unexpected response (HTTP ${res.status}). Check that the API server is running.`
        );
      }
      if (!res.ok) throw new Error(data.error || 'Could not analyse that site');
      const d = data.draft || {};
      setDraft((prev) => ({
        ...prev,
        brand_name: prev.brand_name || d.brand_name || '',
        primary_color: prev.primary_color && prev.primary_color !== '#3b82f6'
          ? prev.primary_color
          : (d.primary_color || prev.primary_color),
        secondary_color: prev.secondary_color && prev.secondary_color !== '#475569'
          ? prev.secondary_color
          : (d.secondary_color || prev.secondary_color),
        industry: prev.industry && prev.industry !== 'general'
          ? prev.industry
          : (d.industry || prev.industry),
        icp_description: prev.icp_description || d.icp_description || '',
        brand_guidelines: prev.brand_guidelines || d.brand_guidelines || '',
        writing_samples: (() => {
          const ai = Array.isArray(d.writing_samples) ? d.writing_samples : [];
          const merged = [...(prev.writing_samples || ['', '', ''])];
          for (let i = 0; i < Math.max(3, merged.length); i += 1) {
            if (!merged[i] || !merged[i].trim()) merged[i] = ai[i] || merged[i] || '';
          }
          return merged;
        })(),
        // Only pull in the remote logo if the user hasn't uploaded their own
        // (logoBase64) and the existing record doesn't already have one.
        logo_url: prev.logoBase64 ? prev.logo_url : (prev.logo_url || d.logo_url || null),
        logoPreview: prev.logoBase64
          ? prev.logoPreview
          : (prev.logoPreview || d.logo_url || null),
      }));
      setExtractedFrom(d.source_url || trimmed);
    } catch (err) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const setSample = (idx, value) => {
    const samples = [...draft.writing_samples];
    samples[idx] = value;
    setDraft({ ...draft, writing_samples: samples });
  };

  const fileInputRef = useRef(null);
  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Logo must be an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(',')[1];
      setDraft(prev => ({
        ...prev,
        logoBase64: base64,
        logoPreview: dataUrl,
        logoMimeType: file.type,
        logo_url: prev.logo_url, // keep existing until upload completes on save
      }));
      setError('');
    };
    reader.readAsDataURL(file);
  };
  const clearLogo = () => {
    setDraft(prev => ({ ...prev, logoBase64: null, logoPreview: null, logoMimeType: null, logo_url: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveDraft = async () => {
    if (!draft.brand_name.trim()) {
      setError('Brand name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Strip local-only image fields before sending to the JSON endpoint —
      // images upload separately to /logo to avoid 1MB JSON payload limits.
      // eslint-disable-next-line no-unused-vars
      const { logoBase64, logoPreview, logoMimeType, logo_url: draftLogoUrl, ...payload } = draft;

      // If user explicitly cleared the logo (preview is null but the brand
      // had a logo before), forward that as null so the backend wipes it.
      if (draftLogoUrl === null && editingId) {
        payload.logo_url = null;
      }

      const url = editingId ? `/api/brands/${editingId}` : '/api/brands';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${editingId ? 'update' : 'create'} brand`);

      const brandId = editingId || data.brand?.id;

      // If a new image is queued, upload it to the dedicated logo endpoint.
      if (brandId && logoBase64) {
        const upRes = await fetch(`/api/brands/${brandId}/logo`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: logoBase64, mimeType: logoMimeType || 'image/png' }),
        });
        if (!upRes.ok) {
          const upData = await upRes.json().catch(() => ({}));
          throw new Error(upData.error || 'Brand saved, but logo upload failed');
        }
      }

      if (!editingId && data.brand?.id) {
        setActiveBrandId(data.brand.id);
      }
      await load();
      await refreshContextBrands();
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBrand = async () => {
    if (!editingId) return;
    if (!confirm('Delete this brand? Generated content will keep its reference.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${editingId}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete brand');
      if (activeBrandId === editingId) setActiveBrandId(null);
      await load();
      await refreshContextBrands();
      closeModal();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const useForNextPost = (e, id) => {
    e.stopPropagation();
    setActiveBrandId(id);
  };

  const voiceCompleteness = (brand) => {
    let score = 0;
    if (brand.icp_description?.trim()) score++;
    if (brand.brand_guidelines?.trim()) score++;
    const samples = (brand.writing_samples || []).filter(s => typeof s === 'string' && s.trim());
    if (samples.length >= 1) score++;
    return score; // 0..3
  };

  // Tile component
  const BrandTile = ({ brand }) => {
    const isActive = activeBrandId === brand.id;
    const score = voiceCompleteness(brand);
    return (
      <button
        type="button"
        className={`brand-tile ${isActive ? 'is-active' : ''}`}
        onClick={() => openEdit(brand)}
      >
        <div className="brand-tile-swatches" aria-hidden="true">
          <span className="brand-tile-swatch" style={{ background: brand.primary_color || '#3b82f6' }} />
          <span className="brand-tile-swatch" style={{ background: brand.secondary_color || '#475569' }} />
        </div>

        {brand.logo_url ? (
          <img src={brand.logo_url} alt="" className="brand-tile-logo" />
        ) : (
          <div
            className="brand-tile-logo-placeholder brand-tile-logo-text"
            style={{ background: brand.primary_color || '#3b82f6' }}
            title={brand.brand_name || ''}
          >
            <span>{brand.brand_name || '?'}</span>
          </div>
        )}

        <div className="brand-tile-name">{brand.brand_name || '(unnamed)'}</div>
        <div className="brand-tile-industry">{brand.industry || 'general'}</div>

        <div className="brand-tile-meta">
          <span className={`brand-tile-voice voice-${score}`} title={`${score}/3 voice fields set`}>
            {score === 3 ? 'Voice fully set' : score === 0 ? 'No voice set' : `${score}/3 voice fields`}
          </span>
        </div>

        {isActive ? (
          <span className="brand-tile-active-tag">Active</span>
        ) : (
          <button
            type="button"
            className="brand-tile-use-btn"
            onClick={(e) => useForNextPost(e, brand.id)}
            title="Use this brand for the next generated post"
          >
            Use
          </button>
        )}
      </button>
    );
  };

  // Add tile
  const AddBrandTile = () => (
    <button
      type="button"
      data-tour="brands-create"
      className={`brand-tile brand-tile-add ${atLimit ? 'is-disabled' : ''}`}
      onClick={openCreate}
      disabled={atLimit}
      title={atLimit ? `${planLabel} plan is limited to ${limit} brand${limit === 1 ? '' : 's'}` : 'Create a new brand'}
    >
      <div className="brand-tile-add-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <div className="brand-tile-name">{atLimit ? 'Plan limit reached' : 'New brand'}</div>
      <div className="brand-tile-industry">
        {atLimit ? `Contact your admin to upgrade` : 'Set up voice + colours'}
      </div>
    </button>
  );

  return (
    <>
      <div className="section-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 className="section-title">Brands</h1>
            <p className="section-desc">Set up brand voice once. Every generation pulls from here.</p>
          </div>
          <div className="brands-plan-badge" data-tour="brands-limit">
            <span className="brands-plan-label">{planLabel} plan</span>
            <span className="brands-plan-count">{used} / {limit === Infinity ? '∞' : limit} brands</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="loading-spinner" style={{ margin: '2rem auto' }} /></div>
      ) : (
        <div className="brand-tile-grid" data-tour="brands-list">
          {brands.map((b) => <BrandTile key={b.id} brand={b} />)}
          <AddBrandTile />
        </div>
      )}

      {error && !modalMode && <div className="card error-msg" style={{ marginTop: '1rem' }}>{error}</div>}

      {/* ── Edit / Create modal ─────────────────────────────────────── */}
      {modalMode && (
        <div className="brand-modal-overlay" onClick={closeModal}>
          <div className="brand-modal" onClick={(e) => e.stopPropagation()}>
            <div className="brand-modal-header">
              <h3 className="brand-modal-title">
                {modalMode === 'create' ? 'New brand' : `Edit ${draft.brand_name || 'brand'}`}
              </h3>
              <button className="brand-modal-close" onClick={closeModal} type="button" aria-label="Close">×</button>
            </div>

            <div className="brand-modal-body">
              {/* URL-to-brand shortcut: paste a site, AI fills the form. Same
                  endpoint and merge behaviour as in OnboardingFlow. */}
              <div className="onboarding-extract-block" style={{ marginTop: 0, marginBottom: '1rem' }}>
                <div className="onboarding-extract-header">
                  <span className="onboarding-extract-badge">AI</span>
                  <div>
                    <div className="onboarding-extract-title">
                      {modalMode === 'create' ? 'Shortcut: pull this in from a website' : 'Refresh from a website'}
                    </div>
                    <div className="onboarding-extract-sub">
                      Paste a homepage URL and we'll fill in the logo, colours, tone, and writing samples below. Anything you've already typed is kept.
                    </div>
                  </div>
                </div>
                <div className="onboarding-extract-row">
                  <input
                    type="url"
                    className="wizard-context-input"
                    placeholder="https://yourcompany.com"
                    value={extractUrl}
                    onChange={(e) => setExtractUrl(e.target.value)}
                    disabled={extracting}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={extractFromUrl}
                    disabled={extracting || !extractUrl.trim()}
                  >
                    {extracting ? 'Analysing…' : 'Extract'}
                  </button>
                </div>
                {extractError && (
                  <div className="error-msg" style={{ marginTop: '0.5rem', fontSize: 13 }}>{extractError}</div>
                )}
                {extractedFrom && !extractError && (
                  <div className="onboarding-extract-success">
                    ✓ Pulled in suggestions from <strong>{extractedFrom}</strong>. Review the fields below.
                  </div>
                )}
              </div>

              {/* Logo: either upload an image OR type a text logo (which is also the brand name) */}
              <div className="wizard-context-block">
                <label className="wizard-context-label">Logo *</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
                  Upload an image, or just type your brand name and we'll use it as a text logo.
                </p>
                <div className="brand-logo-row">
                  <div className="brand-logo-preview" style={{ background: draft.primary_color }}>
                    {draft.logoPreview ? (
                      <img src={draft.logoPreview} alt="" />
                    ) : (
                      <span className="brand-logo-text-fallback">
                        {draft.brand_name ? draft.brand_name.slice(0, 14) : '?'}
                      </span>
                    )}
                  </div>
                  <div className="brand-logo-actions" style={{ flex: 1, minWidth: 220 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoFile}
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {draft.logoPreview ? 'Replace image' : 'Upload image'}
                      </button>
                      {draft.logoPreview && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={clearLogo}
                          style={{ color: '#ef4444' }}
                        >
                          Remove image
                        </button>
                      )}
                      <span className="card-subtitle" style={{ margin: 0, fontSize: '0.72rem' }}>
                        PNG, JPG, WEBP, SVG · max 5MB
                      </span>
                    </div>
                    <div className="brand-logo-divider">— or —</div>
                    <input
                      className="wizard-context-input"
                      placeholder="Type your brand name (e.g. StrideShift)"
                      value={draft.brand_name}
                      onChange={(e) => setDraft({ ...draft, brand_name: e.target.value })}
                    />
                    <p className="card-subtitle" style={{ margin: '0.3rem 0 0', fontSize: '0.7rem' }}>
                      We'll style this in your primary colour as a text logo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="brands-editor-row" style={{ marginTop: '1rem' }}>
                <div className="wizard-context-block" style={{ flex: 1 }}>
                  <label className="wizard-context-label">Industry</label>
                  <select
                    className="wizard-context-select"
                    value={draft.industry}
                    onChange={(e) => setDraft({ ...draft, industry: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="tech">Tech</option>
                    <option value="marketing">Marketing</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="finance">Finance</option>
                    <option value="education">Education</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="wizard-color-picker">
                  <label className="wizard-context-label">Primary colour</label>
                  <div className="wizard-color-input">
                    <input type="color" value={draft.primary_color} onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })} />
                    <input type="text" value={draft.primary_color} onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })} className="color-hex" maxLength={7} />
                  </div>
                </div>
                <div className="wizard-color-picker">
                  <label className="wizard-context-label">Secondary colour</label>
                  <div className="wizard-color-input">
                    <input type="color" value={draft.secondary_color} onChange={(e) => setDraft({ ...draft, secondary_color: e.target.value })} />
                    <input type="text" value={draft.secondary_color} onChange={(e) => setDraft({ ...draft, secondary_color: e.target.value })} className="color-hex" maxLength={7} />
                  </div>
                </div>
              </div>

              <div className="wizard-context-block" style={{ marginTop: '1rem' }}>
                <label className="wizard-context-label">Ideal Customer Profile</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                  Who are you writing for? Specifics beat adjectives.
                </p>
                <textarea
                  className="wizard-textarea"
                  value={draft.icp_description}
                  onChange={(e) => setDraft({ ...draft, icp_description: e.target.value })}
                  rows={3}
                  placeholder="e.g. Heads of marketing at 50-500 person B2B SaaS companies. Time-poor, value frameworks over fluff."
                />
              </div>

              <div className="wizard-context-block">
                <label className="wizard-context-label">Brand guidelines</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                  Rules, banned phrases, positioning. The AI will respect these.
                </p>
                <textarea
                  className="wizard-textarea"
                  value={draft.brand_guidelines}
                  onChange={(e) => setDraft({ ...draft, brand_guidelines: e.target.value })}
                  rows={3}
                  placeholder="e.g. Never use synergy, leverage, or unlock. Practical over theoretical. Numbers over claims."
                />
              </div>

              <div className="wizard-context-block">
                <label className="wizard-context-label">Writing samples</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                  Paste 3 real pieces of your writing — posts, emails, paragraphs. The AI mirrors this voice.
                </p>
                {draft.writing_samples.map((sample, idx) => (
                  <textarea
                    key={idx}
                    className="wizard-textarea"
                    value={sample}
                    onChange={(e) => setSample(idx, e.target.value)}
                    rows={3}
                    placeholder={`Sample ${idx + 1}`}
                    style={{ marginBottom: '0.5rem' }}
                  />
                ))}
              </div>

              {error && <div className="error-msg" style={{ marginTop: '0.5rem' }}>{error}</div>}
            </div>

            <div className="brand-modal-footer">
              {modalMode === 'edit' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={deleteBrand}
                  disabled={saving}
                  style={{ color: '#ef4444', marginRight: 'auto' }}
                >
                  Delete brand
                </button>
              )}
              <button type="button" className="btn" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveDraft} disabled={saving}>
                {saving ? 'Saving…' : modalMode === 'create' ? 'Create brand' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
