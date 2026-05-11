import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useGeneration } from './GenerationContext';

// Onboarding gates new users into the app. The order matches what Shanne
// asked for (May 2026 SM check-in): set up company → brand voice → content
// pillars → connect at least one social account. Until pillars are saved,
// the main app stays hidden behind the gate.
//
// We persist the current step in localStorage so an OAuth redirect (used by
// the "connect social account" step) brings the user back to the same step
// they were on, not the start.

const STEPS = ['company', 'brand', 'pillars', 'social', 'done'];
const STEP_STORAGE_KEY = 'scribeshift-onboarding-step';

// Pre-filled colour palette for new pillars — keeps the palette consistent.
const PILLAR_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

// Starter pillar suggestions to nudge users who aren't sure where to begin.
const PILLAR_SUGGESTIONS = [
  'Industry insights',
  'Customer stories',
  'Tutorials & how-tos',
  'Behind the scenes',
  'Product updates',
  'Thought leadership',
];

const SOCIAL_PLATFORMS = [
  { id: 'linkedin',  name: 'LinkedIn',     color: '#0A66C2', authPath: '/api/auth/linkedin' },
  { id: 'twitter',   name: 'Twitter / X',  color: '#0f0f0f', authPath: '/api/auth/twitter' },
  { id: 'facebook',  name: 'Facebook',     color: '#1877F2', authPath: '/api/auth/facebook' },
  { id: 'instagram', name: 'Instagram',    color: '#E4405F', authPath: '/api/auth/instagram' },
];

export default function OnboardingFlow({ onComplete }) {
  const { user, getAuthHeaders, refreshUser } = useAuth();
  const { setActiveBrandId, loadBrands } = useGeneration();

  const hasCompany = !!user?.company_id;

  // Restore the step from localStorage (handles OAuth round-trip). Falls back
  // to the right starting step based on what the user has already done.
  const [step, setStep] = useState(() => {
    try {
      const stored = window.localStorage.getItem(STEP_STORAGE_KEY);
      if (stored && STEPS.includes(stored)) return stored;
    } catch {}
    return hasCompany ? 'brand' : 'company';
  });

  useEffect(() => {
    try { window.localStorage.setItem(STEP_STORAGE_KEY, step); } catch {}
  }, [step]);

  // ── Field state ─────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState(user?.company?.name || '');
  const [brand, setBrand] = useState({
    brand_name: '',
    primary_color: '#3b82f6',
    secondary_color: '#475569',
    industry: 'general',
    icp_description: '',
    brand_guidelines: '',
    writing_samples: ['', '', ''],
    logo_url: null,
  });
  // URL-extract state: paste a website, AI fills the brand form.
  const [extractUrl, setExtractUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedFrom, setExtractedFrom] = useState('');

  const [pillars, setPillars] = useState([
    { label: '', color: PILLAR_COLORS[0], description: '' },
    { label: '', color: PILLAR_COLORS[1], description: '' },
    { label: '', color: PILLAR_COLORS[2], description: '' },
  ]);
  const [socialStatuses, setSocialStatuses] = useState({}); // { linkedin: { connected: true }, ... }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // ── Helpers ─────────────────────────────────────────────────────────
  const setSample = (idx, value) => {
    const samples = [...brand.writing_samples];
    samples[idx] = value;
    setBrand({ ...brand, writing_samples: samples });
  };

  const setPillar = (idx, patch) => {
    setPillars((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const addPillar = () => {
    if (pillars.length >= 6) return;
    setPillars((prev) => [
      ...prev,
      { label: '', color: PILLAR_COLORS[prev.length % PILLAR_COLORS.length], description: '' },
    ]);
  };

  const removePillar = (idx) => {
    setPillars((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Step submitters ─────────────────────────────────────────────────
  const submitCompany = async () => {
    if (!companyName.trim()) { setError('Company name is required'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/onboarding/company', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set up company');
      await refreshUser();
      setStep('brand');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const extractFromUrl = async () => {
    const trimmed = extractUrl.trim();
    if (!trimmed) {
      setExtractError('Paste a website URL first.');
      return;
    }
    setExtracting(true); setExtractError(''); setExtractedFrom('');
    try {
      const res = await fetch('/api/brands/extract-from-url', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      // Defensive parse — see BrandsView for context.
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

      // Merge AI suggestions into the form, but don't blow away anything the
      // user already typed — that would be jarring.
      setBrand((prev) => ({
        ...prev,
        brand_name: prev.brand_name || d.brand_name || '',
        primary_color: d.primary_color || prev.primary_color,
        secondary_color: d.secondary_color || prev.secondary_color,
        industry: d.industry || prev.industry,
        icp_description: prev.icp_description || d.icp_description || '',
        brand_guidelines: prev.brand_guidelines || d.brand_guidelines || '',
        writing_samples: (() => {
          const ai = Array.isArray(d.writing_samples) ? d.writing_samples : [];
          const merged = [...prev.writing_samples];
          for (let i = 0; i < 3; i += 1) {
            if (!merged[i] || !merged[i].trim()) merged[i] = ai[i] || merged[i] || '';
          }
          return merged;
        })(),
        logo_url: prev.logo_url || d.logo_url || null,
      }));
      setExtractedFrom(d.source_url || trimmed);
    } catch (err) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const submitBrand = async () => {
    if (!brand.brand_name.trim()) { setError('Brand name is required'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(brand),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create brand');
      if (data.brand?.id) setActiveBrandId(data.brand.id);
      await loadBrands();
      setStep('pillars');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const skipBrand = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: companyName || user?.full_name || 'My Brand' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create placeholder brand');
      if (data.brand?.id) setActiveBrandId(data.brand.id);
      await loadBrands();
      setStep('pillars');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const submitPillars = async () => {
    const validPillars = pillars
      .map((p) => ({ ...p, label: p.label.trim() }))
      .filter((p) => p.label.length > 0);

    if (validPillars.length === 0) {
      setError('Add at least one pillar — these guide every piece of content.');
      return;
    }

    setBusy(true); setError('');
    try {
      // Create each pillar sequentially so we can surface a clear error if one
      // fails (the API doesn't have a bulk endpoint).
      for (const p of validPillars) {
        const res = await fetch('/api/planner/pillars', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: p.label,
            color: p.color,
            description: p.description || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create pillar "${p.label}"`);
        }
      }
      setStep('social');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  // Fetch social account connection statuses when the user reaches the social step.
  useEffect(() => {
    if (step !== 'social') return;
    let cancelled = false;
    (async () => {
      const next = {};
      await Promise.all(
        SOCIAL_PLATFORMS.map(async (p) => {
          try {
            const res = await fetch(`${p.authPath}/status`, { headers: getAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            next[p.id] = { connected: !!data.connected };
          } catch {
            next[p.id] = { connected: false };
          }
        })
      );
      if (!cancelled) setSocialStatuses(next);
    })();
    return () => { cancelled = true; };
  }, [step, getAuthHeaders]);

  const connectSocial = async (platform) => {
    // OAuth flow: fetch the authorize URL with our auth headers, then redirect
    // the browser there. localStorage keeps `step` so when the user returns to
    // the onboarding flow they land back on this same screen.
    setBusy(true); setError('');
    try {
      const res = await fetch(platform.authPath, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.url) throw new Error('Connection failed — no authorize URL returned');
      window.location.href = data.url;
    } catch (err) {
      setError(`Failed to start ${platform.name} connection — ${err.message}`);
      setBusy(false);
    }
  };

  const submitSocial = () => {
    setStep('done');
  };

  const finish = () => {
    try { window.localStorage.removeItem(STEP_STORAGE_KEY); } catch {}
    if (onComplete) onComplete();
  };

  const stepIndex = STEPS.indexOf(step);
  const anySocialConnected = Object.values(socialStatuses).some((s) => s?.connected);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.slice(0, -1).map((s, i) => (
            <div key={s} className={`onboarding-pip ${i <= stepIndex ? 'done' : ''}`} title={s} />
          ))}
        </div>

        {/* ── Step 1: Company ───────────────────────────────────────── */}
        {step === 'company' && (
          <>
            <h1>Welcome to ScribeShift</h1>
            <p className="onboarding-sub">A few short steps and you'll be ready to generate your first piece of content.</p>

            <div className="wizard-context-block" style={{ marginTop: '1.5rem' }}>
              <label className="wizard-context-label">Company name</label>
              <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                This is your tenant. Brands, pillars and content all live under it.
              </p>
              <input
                className="wizard-context-input"
                placeholder="e.g. StrideShift"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                autoFocus
              />
            </div>

            {error && <div className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</div>}

            <div className="onboarding-actions">
              <button className="btn btn-primary" onClick={submitCompany} disabled={busy} type="button">
                {busy ? 'Setting up…' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Brand ─────────────────────────────────────────── */}
        {step === 'brand' && (
          <>
            <h1>Tell us your brand voice</h1>
            <p className="onboarding-sub">
              The more you give us here, the more your generated content will sound like you. You can edit this any time.
            </p>

            {/* URL-to-brand shortcut: paste a site, AI fills the form. */}
            <div className="onboarding-extract-block">
              <div className="onboarding-extract-header">
                <span className="onboarding-extract-badge">AI</span>
                <div>
                  <div className="onboarding-extract-title">Shortcut: pull this in from your website</div>
                  <div className="onboarding-extract-sub">
                    Paste your homepage URL and we'll fetch your logo, tone, colours, and a few writing samples automatically. You can still tweak anything below.
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
                  ✓ Pulled in suggestions from <strong>{extractedFrom}</strong>. Review the fields below — anything you already typed was kept.
                </div>
              )}
            </div>

            <div className="wizard-context-block" style={{ marginTop: '1.25rem' }}>
              <label className="wizard-context-label">Brand name *</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {brand.logo_url && (
                  <img
                    src={brand.logo_url}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      objectFit: 'contain',
                      background: '#fff',
                      border: '1px solid var(--border, rgba(15, 23, 42, 0.1))',
                      flex: '0 0 48px',
                    }}
                  />
                )}
                <input
                  className="wizard-context-input"
                  placeholder="e.g. StrideShift"
                  value={brand.brand_name}
                  onChange={(e) => setBrand({ ...brand, brand_name: e.target.value })}
                  style={{ flex: 1 }}
                  autoFocus
                />
              </div>
            </div>

            <div className="brands-editor-row">
              <div className="wizard-color-picker">
                <label className="wizard-context-label">Primary colour</label>
                <div className="wizard-color-input">
                  <input type="color" value={brand.primary_color} onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })} />
                  <input type="text" value={brand.primary_color} onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })} className="color-hex" maxLength={7} />
                </div>
              </div>
              <div className="wizard-color-picker">
                <label className="wizard-context-label">Secondary colour</label>
                <div className="wizard-color-input">
                  <input type="color" value={brand.secondary_color} onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })} />
                  <input type="text" value={brand.secondary_color} onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })} className="color-hex" maxLength={7} />
                </div>
              </div>
              <div className="wizard-context-block" style={{ flex: 1 }}>
                <label className="wizard-context-label">Industry</label>
                <select
                  className="wizard-context-select"
                  value={brand.industry}
                  onChange={(e) => setBrand({ ...brand, industry: e.target.value })}
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

            <div className="wizard-context-block">
              <label className="wizard-context-label">Ideal Customer Profile</label>
              <textarea
                className="wizard-textarea"
                rows={3}
                placeholder="Who reads your content? Be specific about role, company size, and what they care about."
                value={brand.icp_description}
                onChange={(e) => setBrand({ ...brand, icp_description: e.target.value })}
              />
            </div>

            <div className="wizard-context-block">
              <label className="wizard-context-label">Brand guidelines</label>
              <textarea
                className="wizard-textarea"
                rows={3}
                placeholder="Banned words, positioning, hard rules. e.g. 'Never use synergy or leverage. Numbers over claims.'"
                value={brand.brand_guidelines}
                onChange={(e) => setBrand({ ...brand, brand_guidelines: e.target.value })}
              />
            </div>

            <div className="wizard-context-block">
              <label className="wizard-context-label">3 writing samples (most impactful)</label>
              <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                Paste real posts, emails, or paragraphs from your team. The AI mirrors this voice.
              </p>
              {brand.writing_samples.map((sample, idx) => (
                <textarea
                  key={idx}
                  className="wizard-textarea"
                  rows={3}
                  placeholder={`Sample ${idx + 1}`}
                  value={sample}
                  onChange={(e) => setSample(idx, e.target.value)}
                  style={{ marginBottom: '0.5rem' }}
                />
              ))}
            </div>

            {error && <div className="error-msg" style={{ marginTop: '0.5rem' }}>{error}</div>}

            <div className="onboarding-actions">
              <button className="btn" onClick={skipBrand} disabled={busy} type="button">
                Skip for now
              </button>
              <button className="btn btn-primary" onClick={submitBrand} disabled={busy} type="button">
                {busy ? 'Saving…' : 'Save brand & continue'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Pillars ───────────────────────────────────────── */}
        {step === 'pillars' && (
          <>
            <h1>Define your content pillars</h1>
            <p className="onboarding-sub">
              Pillars are the 3-6 themes every post falls under. They make your content feel intentional instead of scattershot.
            </p>

            <div className="wizard-context-block" style={{ marginTop: '1rem', background: 'var(--bg-raised, #f8fafc)', padding: '0.85rem 1rem', borderRadius: 10 }}>
              <div className="card-subtitle" style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Need ideas?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                {PILLAR_SUGGESTIONS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className="onboarding-suggestion-chip"
                    onClick={() => {
                      // Drop the suggestion into the first empty pillar slot,
                      // or append a new one if all slots are filled.
                      const emptyIdx = pillars.findIndex((p) => !p.label.trim());
                      if (emptyIdx >= 0) setPillar(emptyIdx, { label: s });
                      else if (pillars.length < 6) {
                        setPillars((prev) => [
                          ...prev,
                          { label: s, color: PILLAR_COLORS[prev.length % PILLAR_COLORS.length], description: '' },
                        ]);
                      }
                    }}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="wizard-context-block" style={{ marginTop: '1.25rem' }}>
              {pillars.map((p, idx) => (
                <div key={idx} className="onboarding-pillar-row">
                  <input
                    type="color"
                    value={p.color}
                    onChange={(e) => setPillar(idx, { color: e.target.value })}
                    className="onboarding-pillar-color"
                    title="Pillar colour"
                  />
                  <input
                    type="text"
                    className="wizard-context-input"
                    placeholder={`Pillar ${idx + 1} name — e.g. ${PILLAR_SUGGESTIONS[idx % PILLAR_SUGGESTIONS.length]}`}
                    value={p.label}
                    onChange={(e) => setPillar(idx, { label: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  {pillars.length > 1 && (
                    <button
                      type="button"
                      className="onboarding-pillar-remove"
                      onClick={() => removePillar(idx)}
                      aria-label="Remove pillar"
                      title="Remove pillar"
                    >×</button>
                  )}
                </div>
              ))}

              {pillars.length < 6 && (
                <button
                  type="button"
                  className="onboarding-pillar-add"
                  onClick={addPillar}
                >+ Add another pillar</button>
              )}
            </div>

            {error && <div className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</div>}

            <div className="onboarding-actions">
              <button className="btn btn-primary" onClick={submitPillars} disabled={busy} type="button">
                {busy ? 'Saving…' : 'Save pillars & continue'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Social accounts ───────────────────────────────── */}
        {step === 'social' && (
          <>
            <h1>Connect your social accounts</h1>
            <p className="onboarding-sub">
              ScribeShift posts on your behalf, so you'll need at least one channel connected to schedule anything. You can connect more later in Settings.
            </p>

            <div className="onboarding-social-grid" style={{ marginTop: '1.25rem' }}>
              {SOCIAL_PLATFORMS.map((p) => {
                const connected = !!socialStatuses[p.id]?.connected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`onboarding-social-card ${connected ? 'is-connected' : ''}`}
                    onClick={() => !connected && connectSocial(p)}
                    disabled={connected}
                  >
                    <div className="onboarding-social-card-dot" style={{ background: p.color }} />
                    <div className="onboarding-social-card-name">{p.name}</div>
                    <div className="onboarding-social-card-status">
                      {connected ? '✓ Connected' : 'Connect →'}
                    </div>
                  </button>
                );
              })}
            </div>

            {!anySocialConnected && (
              <p className="card-subtitle" style={{ marginTop: '1rem', fontSize: 13 }}>
                You can finish onboarding without connecting an account, but you won't be able to schedule posts until at least one is linked.
              </p>
            )}

            {error && <div className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</div>}

            <div className="onboarding-actions">
              <button className="btn" onClick={submitSocial} type="button">
                {anySocialConnected ? 'Continue' : 'Skip for now'}
              </button>
              {anySocialConnected && (
                <button className="btn btn-primary" onClick={submitSocial} type="button">
                  Continue
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Step 5: Done ──────────────────────────────────────────── */}
        {step === 'done' && (
          <>
            <h1>You're set up.</h1>
            <p className="onboarding-sub">
              Brand voice, pillars, and {anySocialConnected ? 'social accounts' : 'next steps'} are saved. Time to make something.
            </p>
            <div className="onboarding-tips">
              <div className="onboarding-tip">
                <strong>Tip 1.</strong> Use Create to turn any source (URL, video, idea) into ready-to-publish content.
              </div>
              <div className="onboarding-tip">
                <strong>Tip 2.</strong> Everything you generate lands in History and can be sent to the scheduler.
              </div>
              <div className="onboarding-tip">
                <strong>Tip 3.</strong> Click the <strong>?</strong> Help icon any time for a guided tour of the tab you're on.
              </div>
            </div>
            <div className="onboarding-actions">
              <button className="btn btn-primary" onClick={finish} type="button">
                Generate my first piece of content →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
