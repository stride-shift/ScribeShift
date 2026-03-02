import { useState } from 'react';
import { useAuth } from './AuthProvider';

const GOAL_OPTIONS = [
  { value: 'engagement', label: 'Engagement / Comments' },
  { value: 'lead_generation', label: 'Lead Generation' },
  { value: 'authority', label: 'Build Authority' },
  { value: 'awareness', label: 'Brand Awareness' },
  { value: 'signups', label: 'Drive Signups' },
];

const DURATION_OPTIONS = [
  { value: '1 week', label: '1 Week' },
  { value: '2 weeks', label: '2 Weeks' },
  { value: '1 month', label: '1 Month' },
];

const PLATFORM_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

const ARC_COLORS = {
  opening: '#3b82f6',
  rising: '#f59f0a',
  climax: '#ef4444',
  resolution: '#10b981',
};

const ARC_LABELS = {
  opening: 'Opening',
  rising: 'Rising Action',
  climax: 'Climax',
  resolution: 'Resolution',
};

const PILLAR_COLORS = {
  thought_leadership: '#8b5cf6',
  product: '#3b82f6',
  culture: '#f59f0a',
  education: '#10b981',
  social_proof: '#ef4444',
  engagement: '#ec4899',
  news: '#6366f1',
};

export default function CampaignPlanner({ onClose }) {
  const { getAuthHeaders } = useAuth();
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('engagement');
  const [duration, setDuration] = useState('2 weeks');
  const [platforms, setPlatforms] = useState(['linkedin']);
  const [brandName, setBrandName] = useState('');
  const [context, setContext] = useState('');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const togglePlatform = (p) => {
    setPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const handleGenerate = async () => {
    if (!topic.trim()) { setError('Enter a campaign topic'); return; }
    if (platforms.length === 0) { setError('Select at least one platform'); return; }

    setLoading(true);
    setError('');
    setPlan(null);

    try {
      const res = await fetch('/api/campaign/plan', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, goal, platforms, duration, brandName, context }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to generate campaign plan');
        return;
      }
      setPlan(data.plan);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // Group plan by arc phase
  const groupedPlan = plan ? plan.reduce((acc, item) => {
    const phase = item.arc_phase || 'opening';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(item);
    return acc;
  }, {}) : {};

  return (
    <div className="campaign-planner">
      <div className="campaign-planner-header">
        <div>
          <h3>Campaign Planner</h3>
          <p>AI-powered content campaign with story arcs and scheduling suggestions</p>
        </div>
        {onClose && (
          <button className="campaign-close-btn" onClick={onClose}>&times;</button>
        )}
      </div>

      {!plan && (
        <div className="campaign-form">
          <div className="campaign-form-group">
            <label>Campaign Topic / Theme</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="What's the campaign about? e.g., 'How AI is changing decision-making in enterprise' or 'Launching our new product feature'"
              rows={3}
              className="campaign-textarea"
            />
          </div>

          <div className="campaign-form-row">
            <div className="campaign-form-group">
              <label>Goal</label>
              <select value={goal} onChange={e => setGoal(e.target.value)} className="campaign-select">
                {GOAL_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="campaign-form-group">
              <label>Duration</label>
              <select value={duration} onChange={e => setDuration(e.target.value)} className="campaign-select">
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="campaign-form-group">
              <label>Brand (optional)</label>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Brand name"
                className="campaign-input"
              />
            </div>
          </div>

          <div className="campaign-form-group">
            <label>Platforms</label>
            <div className="campaign-platform-grid">
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p.value}
                  className={`campaign-platform-btn ${platforms.includes(p.value) ? 'active' : ''}`}
                  onClick={() => togglePlatform(p.value)}
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="campaign-form-group">
            <label>Additional Context (optional)</label>
            <input
              type="text"
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Any specific angles, events, or constraints to consider"
              className="campaign-input"
            />
          </div>

          {error && <div className="campaign-error">{error}</div>}

          <button
            className={`btn btn-primary campaign-generate-btn ${loading ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Planning campaign...' : 'Generate Campaign Plan'}
          </button>
        </div>
      )}

      {plan && (
        <div className="campaign-results">
          <div className="campaign-results-header">
            <h4>{topic}</h4>
            <div className="campaign-results-meta">
              <span>{plan.length} posts</span>
              <span>{duration}</span>
              <span>{platforms.join(', ')}</span>
            </div>
            <button className="admin-btn-sm" onClick={() => setPlan(null)}>Edit Plan</button>
          </div>

          {/* Story arc visualization */}
          <div className="campaign-arc-bar">
            {['opening', 'rising', 'climax', 'resolution'].map(phase => {
              const count = (groupedPlan[phase] || []).length;
              if (count === 0) return null;
              const pct = Math.round((count / plan.length) * 100);
              return (
                <div
                  key={phase}
                  className="campaign-arc-segment"
                  style={{ flex: pct, background: ARC_COLORS[phase] }}
                  title={`${ARC_LABELS[phase]}: ${count} posts`}
                >
                  <span className="campaign-arc-label">{ARC_LABELS[phase]}</span>
                </div>
              );
            })}
          </div>

          {/* Plan items grouped by phase */}
          {['opening', 'rising', 'climax', 'resolution'].map(phase => {
            const items = groupedPlan[phase];
            if (!items?.length) return null;

            return (
              <div key={phase} className="campaign-phase-group">
                <div className="campaign-phase-header" style={{ borderColor: ARC_COLORS[phase] }}>
                  <span className="campaign-phase-dot" style={{ background: ARC_COLORS[phase] }} />
                  <span className="campaign-phase-name">{ARC_LABELS[phase]}</span>
                  <span className="campaign-phase-count">{items.length} posts</span>
                </div>

                {items.map((item, i) => (
                  <div key={i} className="campaign-item">
                    <div className="campaign-item-header">
                      <span className="campaign-item-day">Day {item.day}</span>
                      <span className="campaign-item-platform">{item.platform}</span>
                      <span className="campaign-item-type">{item.type?.replace(/_/g, ' ')}</span>
                      {item.pillar && (
                        <span
                          className="campaign-item-pillar"
                          style={{ color: PILLAR_COLORS[item.pillar] || '#94a3b8' }}
                        >
                          {item.pillar.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className="campaign-item-hook">"{item.hook}"</div>
                    <div className="campaign-item-brief">{item.brief}</div>
                    {item.goal && (
                      <div className="campaign-item-goal">Goal: {item.goal}</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
