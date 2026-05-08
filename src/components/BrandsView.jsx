import { useEffect, useState, useCallback } from 'react';
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
  };

  const setSample = (idx, value) => {
    const samples = [...draft.writing_samples];
    samples[idx] = value;
    setDraft({ ...draft, writing_samples: samples });
  };

  const saveDraft = async () => {
    if (!draft.brand_name.trim()) {
      setError('Brand name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = editingId ? `/api/brands/${editingId}` : '/api/brands';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${editingId ? 'update' : 'create'} brand`);
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
          <div className="brand-tile-logo-placeholder" style={{ background: brand.primary_color || '#3b82f6' }}>
            {(brand.brand_name || '?').charAt(0).toUpperCase()}
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
          <div className="brands-plan-badge">
            <span className="brands-plan-label">{planLabel} plan</span>
            <span className="brands-plan-count">{used} / {limit === Infinity ? '∞' : limit} brands</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="loading-spinner" style={{ margin: '2rem auto' }} /></div>
      ) : (
        <div className="brand-tile-grid">
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
              <div className="brands-editor-row">
                <div className="wizard-context-block" style={{ flex: 2 }}>
                  <label className="wizard-context-label">Brand name *</label>
                  <input
                    className="wizard-context-input"
                    value={draft.brand_name}
                    placeholder="e.g. StrideShift"
                    onChange={(e) => setDraft({ ...draft, brand_name: e.target.value })}
                  />
                </div>
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
              </div>

              <div className="brands-editor-row">
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
