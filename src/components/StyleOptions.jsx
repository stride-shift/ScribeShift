import React, { useState } from 'react';

const TONE_DESCRIPTIONS = {
  conversational: 'Like explaining to a friend over coffee',
  professional: 'Authoritative without being stiff or jargon-heavy',
  friendly: 'Warm and approachable, genuine not forced',
  provocative: 'Bold takes that challenge assumptions',
  challenging: 'Pushes readers to rethink what they know',
};

const POLISH_DESCRIPTIONS = {
  raw: 'Rough edges, imperfect, first-draft energy',
  natural: 'Human and unforced, not over-produced',
  balanced: 'Clear and structured with some texture',
  polished: 'Clean and crafted, but still has a pulse',
};

const GOAL_DESCRIPTIONS = {
  none: 'No specific optimization',
  engagement: 'Drive comments and conversation',
  lead_generation: 'Demonstrate expertise, earn follow-up',
  authority: 'Establish deep credibility on the topic',
  awareness: 'Make the brand/topic memorable',
  signups: 'Drive action without being salesy',
};

export default function StyleOptions({
  options,
  onChange,
  files,
  videoUrls,
  textPrompt,
  isDetectingTone,
  setIsDetectingTone,
  getAuthHeaders,
}) {
  const [toneError, setToneError] = useState('');
  const set = (key, val) => onChange({ ...options, [key]: val });
  const hasContent = files.length > 0 || videoUrls.length > 0 || (textPrompt && textPrompt.trim().length > 0);

  const handleDetectTone = async () => {
    if (!hasContent || isDetectingTone) return;
    setIsDetectingTone(true);
    setToneError('');

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('videoUrls', JSON.stringify(videoUrls));
      if (textPrompt?.trim()) formData.append('textPrompt', textPrompt.trim());

      const authHeaders = getAuthHeaders();
      const res = await fetch('/api/detect-tone', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Server error (${res.status})`);
      }

      const data = await res.json();

      if (data.success && data.detectedTone) {
        onChange({
          ...options,
          detectedTone: data.detectedTone,
          toneMode: 'detected',
        });
      } else {
        setToneError(data.error || 'Could not detect tone from your content. Try a different file or use a preset tone.');
      }
    } catch (err) {
      setToneError(`Tone detection failed: ${err.message}. You can use a preset or custom tone instead.`);
    } finally {
      setIsDetectingTone(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title"><span className="step">4</span> Style Options</div>

      {/* ── Tone & Voice ─────────────────────────────────────────── */}
      <div className="tone-section">
        <label className="tone-section-label">Tone & Voice</label>

        <div className="tone-mode-selector">
          <button
            type="button"
            className={`tone-mode-btn ${options.toneMode === 'preset' ? 'active' : ''}`}
            onClick={() => set('toneMode', 'preset')}
          >
            Preset
          </button>
          <button
            type="button"
            className={`tone-mode-btn ${options.toneMode === 'detected' ? 'active' : ''}`}
            onClick={() => {
              if (options.detectedTone) {
                set('toneMode', 'detected');
              } else if (hasContent) {
                handleDetectTone();
              }
            }}
            disabled={!hasContent && !options.detectedTone}
          >
            {isDetectingTone ? 'Detecting...' : 'Detect from Content'}
          </button>
          <button
            type="button"
            className={`tone-mode-btn ${options.toneMode === 'custom' ? 'active' : ''}`}
            onClick={() => set('toneMode', 'custom')}
          >
            Custom
          </button>
        </div>

        {toneError && (
          <div className="error-msg" style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>
            {toneError}
          </div>
        )}

        {/* Preset mode */}
        {options.toneMode === 'preset' && (
          <div className="tone-preset-row">
            <select value={options.tone} onChange={(e) => set('tone', e.target.value)}>
              <option value="conversational">Conversational</option>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="provocative">Provocative</option>
              <option value="challenging">Challenging</option>
            </select>
            <span className="option-hint">{TONE_DESCRIPTIONS[options.tone]}</span>
          </div>
        )}

        {/* Detected mode */}
        {options.toneMode === 'detected' && (
          <div className="tone-detected-area">
            {options.detectedTone ? (
              <div className="detected-tone-result">
                <p className="detected-tone-text">{options.detectedTone}</p>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleDetectTone}
                  disabled={!hasContent || isDetectingTone}
                >
                  {isDetectingTone ? 'Re-analyzing...' : 'Re-detect'}
                </button>
              </div>
            ) : (
              <div className="detected-tone-empty">
                <p>Analyzing your content to detect tone...</p>
                <div className="loading-spinner" style={{ width: 24, height: 24 }} />
              </div>
            )}
          </div>
        )}

        {/* Custom mode */}
        {options.toneMode === 'custom' && (
          <div className="tone-custom-area">
            <textarea
              className="tone-custom-textarea"
              value={options.customTone || ''}
              onChange={(e) => set('customTone', e.target.value)}
              placeholder="Describe the tone you want, e.g. 'Direct and punchy, like a seasoned founder who's seen it all. Short sentences. Occasional dry humor. No fluff.'"
              rows={3}
            />
          </div>
        )}
      </div>

      {/* ── Row 1: Polish, Length, Audience ───────────────────────── */}
      <div className="options-row">
        <div className="option-group">
          <label htmlFor="opt-polish">Polish Level</label>
          <select id="opt-polish" value={options.polish || 'natural'} onChange={(e) => set('polish', e.target.value)}>
            <option value="raw">Raw</option>
            <option value="natural">Natural</option>
            <option value="balanced">Balanced</option>
            <option value="polished">Polished</option>
          </select>
          <span className="option-hint">{POLISH_DESCRIPTIONS[options.polish || 'natural']}</span>
        </div>
        <div className="option-group">
          <label htmlFor="opt-length">Length</label>
          <select id="opt-length" value={options.length} onChange={(e) => set('length', e.target.value)}>
            <option value="short">Short</option>
            <option value="standard">Standard</option>
            <option value="long">Long</option>
          </select>
        </div>
        <div className="option-group">
          <label htmlFor="opt-audience">Audience</label>
          <select id="opt-audience" value={options.audience} onChange={(e) => set('audience', e.target.value)}>
            <option value="general">General</option>
            <option value="executives">Executives</option>
            <option value="technical">Technical</option>
            <option value="educators">Educators</option>
          </select>
        </div>
      </div>

      {/* ── Row 2: Industry, Content Goal ────────────────────────── */}
      <div className="options-row" style={{ marginTop: '12px' }}>
        <div className="option-group">
          <label htmlFor="opt-industry">Industry</label>
          <select id="opt-industry" value={options.industry || 'general'} onChange={(e) => set('industry', e.target.value)}>
            <option value="general">General</option>
            <option value="tech">Tech</option>
            <option value="marketing">Marketing</option>
            <option value="healthcare">Healthcare</option>
            <option value="finance">Finance</option>
            <option value="education">Education</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="option-group">
          <label htmlFor="opt-goal">Content Goal</label>
          <select id="opt-goal" value={options.goal || 'none'} onChange={(e) => set('goal', e.target.value)}>
            <option value="none">No specific goal</option>
            <option value="engagement">Engagement / Comments</option>
            <option value="lead_generation">Lead Generation</option>
            <option value="authority">Build Authority</option>
            <option value="awareness">Brand Awareness</option>
            <option value="signups">Drive Signups</option>
          </select>
          <span className="option-hint">{GOAL_DESCRIPTIONS[options.goal || 'none']}</span>
        </div>
      </div>
    </div>
  );
}
