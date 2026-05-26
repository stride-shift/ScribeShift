import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './AuthProvider';

const PLATFORMS = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  },
  {
    key: 'twitter',
    label: 'Twitter / X',
    color: '#1DA1F2',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    key: 'instagram',
    label: 'Instagram',
    color: '#E4405F',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/></svg>,
  },
];

const LONG_FORM_PLATFORMS = ['blog', 'newsletter', 'video'];

const TYPE_LABELS = {
  blog: 'Blog Post',
  video: 'Video Script',
  newsletter: 'Newsletter',
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

// Default the date picker to tomorrow 9am local
function defaultScheduledAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function ScheduleFromResults({ content, onClose, onScheduled }) {
  const { getAuthHeaders } = useAuth();

  // Parse all available posts up-front so we can pre-select which platforms
  // have content and which platform tiles are even worth showing.
  const allItems = useMemo(() => {
    const items = [];
    if (!content || typeof content !== 'object') return items;
    for (const [type, text] of Object.entries(content)) {
      if (!text) continue;
      const isSocial = PLATFORMS.some(p => p.key === type);
      if (isSocial) {
        const posts = text.split(/\[POST \d+[^\]]*\]/i).filter(p => p.trim());
        posts.forEach((post, i) => {
          const cleaned = post.replace(/\(\d+ characters?\)/gi, '').trim();
          if (cleaned) {
            items.push({
              id: `${type}-${i}`,
              type,
              platform: type,
              label: `${TYPE_LABELS[type]} #${i + 1}`,
              text: cleaned,
              schedulable: true,
            });
          }
        });
      } else if (LONG_FORM_PLATFORMS.includes(type)) {
        items.push({
          id: type,
          type,
          platform: type,
          label: TYPE_LABELS[type] || type,
          text,
          schedulable: false,
        });
      }
    }
    return items;
  }, [content]);

  // Platforms that actually have content in this generation
  const platformsWithContent = useMemo(() => {
    return PLATFORMS.filter(p => allItems.some(i => i.platform === p.key));
  }, [allItems]);

  // Default: every post selected
  const [selected, setSelected] = useState(() => new Set(allItems.map(i => i.id)));
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [selectedPillar, setSelectedPillar] = useState('');
  const [pillars, setPillars] = useState([]);
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const headers = getAuthHeaders();
    if (!headers.Authorization) return;

    fetch('/api/planner/pillars', { headers })
      .then(r => r.json())
      .then(data => { if (data.pillars) setPillars(data.pillars); })
      .catch(() => {});

    Promise.all(PLATFORMS.map(async (p) => {
      try {
        const res = await fetch(`/api/auth/${p.key}/status`, { headers });
        const data = await res.json();
        return [p.key, data];
      } catch {
        return [p.key, { connected: false }];
      }
    })).then(results => {
      const map = {};
      for (const [k, v] of results) map[k] = v;
      setConnectedAccounts(map);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePlatformAll = (platformKey) => {
    const platformItems = allItems.filter(i => i.platform === platformKey);
    const allSelected = platformItems.every(i => selected.has(i.id));
    setSelected(prev => {
      const next = new Set(prev);
      for (const it of platformItems) {
        if (allSelected) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });
  };

  const selectedItems = allItems.filter(i => selected.has(i.id));
  const schedulableSelected = selectedItems.filter(i => i.schedulable);
  const draftOnlySelected = selectedItems.filter(i => !i.schedulable);

  // Platforms that have selected items but aren't connected
  const missingConnections = useMemo(() => {
    const platforms = [...new Set(schedulableSelected.map(i => i.platform))];
    return platforms.filter(p => {
      const acc = connectedAccounts[p];
      return !acc?.connected || acc?.isExpired;
    });
  }, [schedulableSelected, connectedAccounts]);

  // ── Submit ────────────────────────────────────────────────────────
  // Two paths can fire from one click depending on what the user picked:
  //   1. schedule selected social posts (if any) via /api/schedule
  //   2. save to a content type (if a content type is selected) via /api/planner/pieces
  // Either-or-both is supported: tick a content type to also save drafts; leave it blank to just schedule.
  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setError('Select at least one post.');
      return;
    }
    if (schedulableSelected.length > 0 && !scheduledAt) {
      setError('Pick a date and time to schedule.');
      return;
    }
    if (schedulableSelected.length > 0 && missingConnections.length > 0) {
      setError(`Connect ${missingConnections.join(', ')} in Settings first.`);
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    let scheduledCount = 0;
    let savedCount = 0;
    let lastErr = '';

    // 1. Schedule social posts
    for (const item of schedulableSelected) {
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            post_text: item.text,
            platform: item.platform,
            scheduled_at: new Date(scheduledAt).toISOString(),
            is_boosted: false,
          }),
        });
        if (res.ok) scheduledCount++;
        else {
          const d = await res.json().catch(() => ({}));
          lastErr = d.error || 'Schedule failed';
        }
      } catch (err) {
        lastErr = err.message || 'Network error';
      }
    }

    // 2. Save to a content type (if one is picked, OR if any selected item is long-form)
    const shouldSaveDrafts = selectedPillar || draftOnlySelected.length > 0;
    if (shouldSaveDrafts && headers.Authorization) {
      // Save every selected item as a draft tagged with the chosen content type.
      // Long-form items always get this treatment; social items only if the user picked a content type.
      const itemsToSave = selectedPillar ? selectedItems : draftOnlySelected;
      for (const item of itemsToSave) {
        try {
          const piece = {
            title: item.label,
            body: item.text,
            pillarId: selectedPillar || '',
            platform: item.platform.charAt(0).toUpperCase() + item.platform.slice(1),
            contentType: ({ linkedin: 'Post', twitter: 'Post', facebook: 'Post', instagram: 'Post', blog: 'Article', video: 'Video', newsletter: 'Newsletter' })[item.platform] || 'Post',
            status: 'draft',
            notes: '',
          };
          const r = await fetch('/api/planner/pieces', { method: 'POST', headers, body: JSON.stringify(piece) });
          if (r.ok) savedCount++;
        } catch { /* continue */ }
      }
    }

    setBusy(false);
    if (scheduledCount > 0 || savedCount > 0) {
      const parts = [];
      if (scheduledCount > 0) parts.push(`scheduled ${scheduledCount} post${scheduledCount > 1 ? 's' : ''}`);
      if (savedCount > 0) {
        const pillarName = pillars.find(p => p.id === selectedPillar)?.label;
        parts.push(`saved ${savedCount} to ${pillarName || 'content type'}`);
      }
      setSuccess(parts.join(' • '));
      onScheduled?.();
      setTimeout(() => onClose(), 1800);
    } else {
      setError(lastErr || 'Nothing was scheduled or saved.');
    }
  };

  // Submit label tells the user exactly what's about to happen.
  const submitLabel = () => {
    if (busy) return 'Working…';
    const parts = [];
    if (schedulableSelected.length > 0) {
      parts.push(`Schedule ${schedulableSelected.length}`);
    }
    if (selectedPillar) {
      const targetCount = schedulableSelected.length > 0 ? selectedItems.length : selectedItems.length;
      parts.push(parts.length ? `save ${targetCount} to content type` : `Save ${targetCount} to content type`);
    } else if (draftOnlySelected.length > 0 && schedulableSelected.length === 0) {
      parts.push(`Save ${draftOnlySelected.length} as draft${draftOnlySelected.length > 1 ? 's' : ''}`);
    }
    return parts.length ? parts.join(' + ') : 'Schedule';
  };

  if (allItems.length === 0) {
    return createPortal(
      <div className="spm-overlay" onClick={onClose}>
        <div className="spm-modal" onClick={e => e.stopPropagation()}>
          <div className="spm-header">
            <h3 className="spm-title">Schedule Posts</h3>
            <button className="spm-close" onClick={onClose}>×</button>
          </div>
          <div className="spm-body">
            <p style={{ color: 'var(--text-muted)' }}>No posts to schedule yet — generate content first.</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="spm-header">
          <h3 className="spm-title">Schedule Posts</h3>
          <button className="spm-close" onClick={onClose} style={{ marginLeft: 'auto' }}>×</button>
        </div>

        {/* Body */}
        <div className="spm-body">
          {/* POST TO — platform tiles (informational + bulk-toggle) */}
          {platformsWithContent.length > 0 && (
            <div className="spm-section">
              <label className="spm-label">Post to</label>
              <div className="spm-platforms">
                {platformsWithContent.map(p => {
                  const account = connectedAccounts[p.key];
                  const connected = account?.connected && !account?.isExpired;
                  const platformItems = allItems.filter(i => i.platform === p.key);
                  const allOn = platformItems.every(i => selected.has(i.id));
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`spm-platform ${allOn ? 'selected' : ''} ${!connected ? 'disconnected' : ''}`}
                      onClick={() => connected && togglePlatformAll(p.key)}
                      disabled={!connected}
                      style={allOn ? { '--plat-color': p.color } : {}}
                    >
                      <span className="spm-platform__icon" style={{ color: allOn ? '#fff' : p.color, background: allOn ? p.color : `${p.color}15` }}>
                        {p.icon}
                      </span>
                      <span className="spm-platform__label">{p.label}</span>
                      {connected ? (
                        allOn && <span className="spm-platform__check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                      ) : (
                        <span className="spm-platform__status">Not connected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* POSTS — checkbox list */}
          <div className="spm-section">
            <label className="spm-label">Posts ({selected.size} of {allItems.length} selected)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allItems.map(item => {
                const platformMeta = PLATFORMS.find(p => p.key === item.platform);
                const isSelected = selected.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="schedule-item"
                    style={{
                      display: 'block',
                      cursor: 'pointer',
                      borderColor: isSelected ? (platformMeta?.color || 'var(--primary)') : 'var(--border)',
                      background: isSelected ? `${platformMeta?.color || '#3b82f6'}0d` : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        style={{ accentColor: platformMeta?.color || 'var(--primary)' }}
                      />
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: platformMeta?.color || 'var(--text-muted)',
                        color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {platformMeta?.label || item.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {item.label}
                      </span>
                      {!item.schedulable && (
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                          Draft only
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, paddingLeft: 26 }}>
                      {item.text.length > 180 ? item.text.slice(0, 180) + '…' : item.text}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* SCHEDULE FOR — only relevant for social posts */}
          {schedulableSelected.length > 0 && (
            <div className="spm-section">
              <label className="spm-label">Schedule for</label>
              <input
                type="datetime-local"
                className="spm-datetime"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          {/* CONTENT TYPE (optional) */}
          {pillars.length > 0 && (
            <div className="spm-section">
              <label className="spm-label">Also save to content type (optional)</label>
              <select
                className="spm-datetime"
                value={selectedPillar}
                onChange={e => setSelectedPillar(e.target.value)}
              >
                <option value="">Don't save to a content type</option>
                {pillars.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Tag these posts in the Content Types planner. Posts are still scheduled — this is in addition.
              </div>
            </div>
          )}

          {missingConnections.length > 0 && schedulableSelected.length > 0 && (
            <div className="spm-error">
              Connect these accounts in Settings before scheduling: {missingConnections.join(', ')}
            </div>
          )}

          {error && <div className="spm-error">{error}</div>}
          {success && (
            <div style={{
              padding: '0.65rem 1rem',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 8,
              color: '#22c55e',
              fontSize: '0.85rem',
            }}>
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="spm-footer">
          <button className="spm-btn spm-btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="spm-btn spm-btn--primary"
            onClick={handleSubmit}
            disabled={
              busy ||
              selectedItems.length === 0 ||
              (schedulableSelected.length > 0 && !scheduledAt) ||
              (schedulableSelected.length > 0 && missingConnections.length > 0)
            }
          >
            {submitLabel()}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
