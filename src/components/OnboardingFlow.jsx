import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useGeneration } from './GenerationContext';

const STEPS = ['company', 'brand', 'done'];

export default function OnboardingFlow({ onComplete }) {
  const { user, getAuthHeaders, refreshUser } = useAuth();
  const { setActiveBrandId, loadBrands } = useGeneration();

  const hasCompany = !!user?.company_id;
  const [step, setStep] = useState(hasCompany ? 'brand' : 'company');
  const [companyName, setCompanyName] = useState(user?.company?.name || '');
  const [brand, setBrand] = useState({
    brand_name: '',
    primary_color: '#3b82f6',
    secondary_color: '#475569',
    industry: 'general',
    icp_description: '',
    brand_guidelines: '',
    writing_samples: ['', '', ''],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setSample = (idx, value) => {
    const samples = [...brand.writing_samples];
    samples[idx] = value;
    setBrand({ ...brand, writing_samples: samples });
  };

  const submitCompany = async () => {
    if (!companyName.trim()) { setError('Company name is required'); return; }
    setBusy(true);
    setError('');
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
    } finally {
      setBusy(false);
    }
  };

  const submitBrand = async () => {
    if (!brand.brand_name.trim()) { setError('Brand name is required'); return; }
    setBusy(true);
    setError('');
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
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const skipBrand = async () => {
    // Create a minimal placeholder brand so subsequent flows have something to work with.
    setBusy(true);
    setError('');
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
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (onComplete) onComplete();
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.slice(0, -1).map((s, i) => (
            <div key={s} className={`onboarding-pip ${i <= stepIndex ? 'done' : ''}`} />
          ))}
        </div>

        {step === 'company' && (
          <>
            <h1>Welcome to ScribeShift</h1>
            <p className="onboarding-sub">Two short steps and you'll be generating your first piece of content.</p>

            <div className="wizard-context-block" style={{ marginTop: '1.5rem' }}>
              <label className="wizard-context-label">Company name</label>
              <p className="card-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                This is your tenant. Brands and content live under it.
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

        {step === 'brand' && (
          <>
            <h1>Tell us your brand voice</h1>
            <p className="onboarding-sub">
              The more you give us here, the more your generated content will sound like you. You can always edit this later.
            </p>

            <div className="wizard-context-block" style={{ marginTop: '1.25rem' }}>
              <label className="wizard-context-label">Brand name *</label>
              <input
                className="wizard-context-input"
                placeholder="e.g. StrideShift"
                value={brand.brand_name}
                onChange={(e) => setBrand({ ...brand, brand_name: e.target.value })}
                autoFocus
              />
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

        {step === 'done' && (
          <>
            <h1>You're set up.</h1>
            <p className="onboarding-sub">
              Your brand voice is saved. Every piece of content you generate from here pulls from it.
            </p>
            <div className="onboarding-tips">
              <div className="onboarding-tip">
                <strong>Tip 1.</strong> You can edit your brand any time from the Brands tab.
              </div>
              <div className="onboarding-tip">
                <strong>Tip 2.</strong> Add more brands as you grow — your plan controls how many.
              </div>
              <div className="onboarding-tip">
                <strong>Tip 3.</strong> Connect a social account in Settings before scheduling.
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