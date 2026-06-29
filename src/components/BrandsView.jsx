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
  default_audience: '',
  default_image_styles: [],
  source_url: null,
  brand_palette: null,  // read-only, populated from API on edit — never sent to server
  // CI document fields — local pending state for upload, saved fields on edit
  ci_document_url: null,
  ci_document_name: null,
  ci_document_text: null,
  ciDocPending: null,  // { base64, mimeType, filename } before upload
};

const AUDIENCE_OPTIONS = [
  { value: '', label: 'No default — pick each time' },
  { value: 'general', label: 'General' },
  { value: 'executives', label: 'Executives' },
  { value: 'technical', label: 'Technical' },
  { value: 'educators', label: 'Educators' },
  { value: 'funders', label: 'Funders / Investors' },
];

const IMAGE_STYLE_CHIPS = [
  { key: 'minimal',    label: 'Clean & Minimal' },
  { key: 'vibrant',    label: 'Bold & Vibrant' },
  { key: 'editorial',  label: 'Editorial' },
  { key: 'artistic',   label: 'Artistic' },
  { key: 'retro',      label: 'Retro' },
  { key: 'modern',     label: 'Modern' },
  { key: 'futuristic', label: 'Futuristic' },
  { key: 'cinematic',  label: 'Cinematic' },
];

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
      default_audience: brand.default_audience || '',
      default_image_styles: Array.isArray(brand.default_image_styles) ? brand.default_image_styles : [],
      source_url: brand.source_url || null,
      brand_palette: brand.brand_palette ?? null,
      ci_document_url: brand.ci_document_url || null,
      ci_document_name: brand.ci_document_name || null,
      ci_document_text: brand.ci_document_text || null,
      ciDocPending: null,
    });
    // Prefill the extract input so the user can see what URL we used
    // for this brand and tweak/re-run if they want a fresh pull.
    if (brand.source_url) setExtractUrl(brand.source_url);
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
        source_url: d.source_url || trimmed,
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
      // Strip local-only fields before sending to the JSON endpoint — files
      // upload separately to dedicated endpoints to avoid the 1MB JSON cap.
      // eslint-disable-next-line no-unused-vars
      const { logoBase64, logoPreview, logoMimeType, logo_url: draftLogoUrl, ciDocPending, brand_palette: _brandPalette, ...payload } = draft;

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

      // If a new CI document is queued, upload + extract text on the server.
      if (brandId && ciDocPending?.base64) {
        const ciRes = await fetch(`/api/brands/${brandId}/ci-doc`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: ciDocPending.base64,
            mimeType: ciDocPending.mimeType || 'application/pdf',
            filename: ciDocPending.filename || 'brand-ci-document.pdf',
          }),
        });
        if (!ciRes.ok) {
          const ciData = await ciRes.json().catch(() => ({}));
          throw new Error(ciData.error || 'Brand saved, but CI document upload failed');
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

              {/* Logo: either upload an image OR type a text logo. When an
                  image is present we hide the text-logo input — the image IS
                  the brand identity. A small "Brand name" input still exists
                  for the picker / nav display, but it's de-emphasised. */}
              <div className="wizard-context-block">
                <label className="wizard-context-label">Logo *</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
                  {draft.logoPreview
                    ? 'Looking good. Your logo will appear everywhere the brand shows up.'
                    : "Upload an image, or just type your brand name and we'll use it as a text logo."}
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

                    {/* Text-logo input: full-blown when there's no image,
                        compact "display name" when there is. */}
                    {draft.logoPreview ? (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label className="wizard-context-label" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                          Display name (used in nav + picker)
                        </label>
                        <input
                          className="wizard-context-input"
                          placeholder="e.g. StrideShift"
                          value={draft.brand_name}
                          onChange={(e) => setDraft({ ...draft, brand_name: e.target.value })}
                          style={{ marginTop: '0.3rem' }}
                        />
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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

              {/* ── Read-only brand palette ─────────────────────────── */}
              {draft.brand_palette ? (
                <div className="wizard-context-block" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <label className="wizard-context-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Brand palette
                    <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-muted, #888)', textTransform: 'none' }}>
                      — extracted automatically · read-only
                    </span>
                  </label>

                  {/* Primary swatches: bg / text / accent / gradient */}
                  {draft.brand_palette.primary && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <p className="card-subtitle" style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', fontWeight: 600 }}>Primary</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {[
                          { hex: draft.brand_palette.primary?.bg,             label: 'bg' },
                          { hex: draft.brand_palette.primary?.text,           label: 'text' },
                          { hex: draft.brand_palette.primary?.accent,         label: 'accent' },
                          { hex: draft.brand_palette.primary?.gradient_start, label: 'grad start' },
                          { hex: draft.brand_palette.primary?.gradient_end,   label: 'grad end' },
                        ].filter(s => s.hex).map(({ hex, label }) => (
                          <div key={label} style={{ textAlign: 'center', minWidth: 44 }}>
                            <div
                              style={{
                                width: 36, height: 36, borderRadius: 6,
                                background: hex,
                                border: '1px solid var(--border)',
                                margin: '0 auto',
                              }}
                              title={`${label}: ${hex}`}
                            />
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #888)', marginTop: 2 }}>{hex}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #888)' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Single hex tokens: accent / neutral_light / neutral_dark */}
                  {(draft.brand_palette.accent || draft.brand_palette.neutral_light || draft.brand_palette.neutral_dark) && (
                    <div style={{ marginTop: '0.7rem' }}>
                      <p className="card-subtitle" style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', fontWeight: 600 }}>Accents & neutrals</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {[
                          { hex: draft.brand_palette.accent,        label: 'accent' },
                          { hex: draft.brand_palette.neutral_light, label: 'neutral light' },
                          { hex: draft.brand_palette.neutral_dark,  label: 'neutral dark' },
                        ].filter(s => s.hex).map(({ hex, label }) => (
                          <div key={label} style={{ textAlign: 'center', minWidth: 44 }}>
                            <div
                              style={{
                                width: 36, height: 36, borderRadius: 6,
                                background: hex,
                                border: '1px solid var(--border)',
                                margin: '0 auto',
                              }}
                              title={`${label}: ${hex}`}
                            />
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #888)', marginTop: 2 }}>{hex}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #888)' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secondary palette swatches with labels */}
                  {Array.isArray(draft.brand_palette.secondary) && draft.brand_palette.secondary.length > 0 && (
                    <div style={{ marginTop: '0.7rem' }}>
                      <p className="card-subtitle" style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', fontWeight: 600 }}>Secondary</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {draft.brand_palette.secondary.map((s, i) => s?.hex ? (
                          <div key={i} style={{ textAlign: 'center', minWidth: 44 }}>
                            <div
                              style={{
                                width: 36, height: 36, borderRadius: 6,
                                background: s.hex,
                                border: '1px solid var(--border)',
                                margin: '0 auto',
                              }}
                              title={`${s.label || ''}: ${s.hex}`}
                            />
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #888)', marginTop: 2 }}>{s.hex}</div>
                            {s.label && (
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted, #888)' }}>{s.label}</div>
                            )}
                          </div>
                        ) : null)}
                      </div>
                    </div>
                  )}

                  {/* Relationship + usage hints */}
                  {(draft.brand_palette.relationship || draft.brand_palette.usage) && (
                    <div style={{ marginTop: '0.7rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      {draft.brand_palette.relationship && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #888)' }}>
                          Colour relationship: <strong style={{ color: 'var(--text, inherit)' }}>{draft.brand_palette.relationship}</strong>
                        </span>
                      )}
                      {draft.brand_palette.usage?.primary && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #888)' }}>
                          Primary use: <strong style={{ color: 'var(--text, inherit)' }}>{draft.brand_palette.usage.primary}</strong>
                        </span>
                      )}
                      {draft.brand_palette.usage?.secondary && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #888)' }}>
                          Secondary use: <strong style={{ color: 'var(--text, inherit)' }}>{draft.brand_palette.usage.secondary}</strong>
                        </span>
                      )}
                      {draft.brand_palette.usage?.accent && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #888)' }}>
                          Accent use: <strong style={{ color: 'var(--text, inherit)' }}>{draft.brand_palette.usage.accent}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : modalMode === 'edit' ? (
                /* Legacy brand: no structured palette yet — show a subtle note */
                <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', borderRadius: 6, background: 'var(--surface-2, rgba(0,0,0,0.03))', fontSize: '0.72rem', color: 'var(--text-muted, #888)' }}>
                  No structured palette yet — using primary &amp; secondary colours above.
                  Re-extract from a website URL to generate a full palette.
                </div>
              ) : null}

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
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    const url = window.prompt('Paste a blog post or article URL — we\'ll pull the text into the next empty sample.');
                    if (!url) return;
                    try {
                      const res = await fetch('/api/brands/extract-sample-from-url', {
                        method: 'POST',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Could not pull from that URL');
                      // Drop into the first empty slot, else append a 4th.
                      const samples = [...draft.writing_samples];
                      const emptyIdx = samples.findIndex(s => !s || !s.trim());
                      if (emptyIdx >= 0) samples[emptyIdx] = data.text;
                      else samples.push(data.text);
                      setDraft({ ...draft, writing_samples: samples });
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  style={{ marginTop: '0.25rem' }}
                >
                  + Pull a sample from a URL
                </button>
              </div>

              {/* CI / brand identity document — optional. Uploaded file is
                   parsed for text by the server and that text is added to
                   the brand voice context the AI gets on every generation. */}
              <div className="wizard-context-block" style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <label className="wizard-context-label">Brand identity document (optional)</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                  Upload your CI / brand book (PDF or .txt). We'll extract the rules and feed them to the AI alongside everything above.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept="application/pdf,text/plain,text/markdown,.md"
                    id="brand-ci-upload"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) {
                        setError('CI document must be under 10MB');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const base64 = String(reader.result).split(',')[1];
                        setDraft({
                          ...draft,
                          ciDocPending: { base64, mimeType: file.type || 'application/pdf', filename: file.name },
                          ci_document_name: file.name,
                        });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <label htmlFor="brand-ci-upload" className="btn btn-sm" style={{ cursor: 'pointer' }}>
                    {draft.ci_document_url || draft.ciDocPending ? 'Replace document' : 'Upload PDF / text file'}
                  </label>
                  {(draft.ci_document_url || draft.ciDocPending) && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setDraft({
                        ...draft,
                        ci_document_url: null,
                        ci_document_name: null,
                        ci_document_text: null,
                        ciDocPending: null,
                      })}
                      style={{ color: '#ef4444' }}
                    >
                      Remove
                    </button>
                  )}
                  <span className="card-subtitle" style={{ margin: 0, fontSize: '0.72rem' }}>
                    {draft.ciDocPending
                      ? `Ready to upload: ${draft.ciDocPending.filename}`
                      : draft.ci_document_name
                        ? `Current: ${draft.ci_document_name}`
                        : 'PDF, plain text, or markdown · max 10MB'}
                  </span>
                </div>
              </div>

              {/* Defaults: pre-fill the Create step so the user doesn't pick these each time */}
              <div className="wizard-context-block" style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <label className="wizard-context-label">Generation defaults</label>
                <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                  Optional. These pre-fill the Create form when this brand is active — you can still override per generation.
                </p>

                <div style={{ marginTop: '0.75rem' }}>
                  <label className="wizard-context-label" style={{ fontSize: '0.72rem', fontWeight: 600 }}>Default audience</label>
                  <select
                    className="wizard-context-select"
                    value={draft.default_audience}
                    onChange={(e) => setDraft({ ...draft, default_audience: e.target.value })}
                  >
                    {AUDIENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginTop: '0.85rem' }}>
                  <label className="wizard-context-label" style={{ fontSize: '0.72rem', fontWeight: 600 }}>Default visual styles for images</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {IMAGE_STYLE_CHIPS.map(s => {
                      const isOn = draft.default_image_styles.includes(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            const next = isOn
                              ? draft.default_image_styles.filter(k => k !== s.key)
                              : [...draft.default_image_styles, s.key];
                            setDraft({ ...draft, default_image_styles: next });
                          }}
                          style={{
                            borderColor: isOn ? draft.primary_color : undefined,
                            background: isOn ? `${draft.primary_color}18` : undefined,
                          }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
