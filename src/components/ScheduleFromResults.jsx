import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

const TYPE_LABELS = {
  blog: 'Blog Post',
  video: 'Video Script',
  newsletter: 'Newsletter',
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const SOCIAL_PLATFORMS = ['linkedin', 'twitter', 'facebook', 'instagram'];

// Default the date picker to tomorrow 9am local — sensible "send tomorrow morning" default
function defaultScheduledAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function ScheduleFromResults({ content, onClose, onScheduled }) {
  const { getAuthHeaders } = useAuth();
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [editedTexts, setEditedTexts] = useState({});
  const [selectedPillar, setSelectedPillar] = useState('');
  const [pillars, setPillars] = useState([]);
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const headers = getAuthHeaders();
    if (!headers.Authorization) {
      try {
        const saved = localStorage.getItem('scribeshift-pillars-v2');
        if (saved) { const p = JSON.parse(saved); setPillars(p); if (p.length > 0) setSelectedPillar(p[0].id); }
      } catch { /* empty */ }
      return;
    }
    // Pull pillars + connected social accounts in parallel — both feed the form.
    fetch('/api/planner/pillars', { headers }).then(r => r.json()).then(data => {
      if (data.pillars) { setPillars(data.pillars); if (data.pillars.length > 0) setSelectedPillar(data.pillars[0].id); }
    }).catch(() => {});

    Promise.all(SOCIAL_PLATFORMS.map(async (p) => {
      try {
        const res = await fetch(`/api/auth/${p}/status`, { headers });
        const data = await res.json();
        return [p, data];
      } catch {
        return [p, { connected: false }];
      }
    })).then(results => {
      const map = {};
      for (const [k, v] of results) map[k] = v;
      setConnectedAccounts(map);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const parseContent = () => {
    const items = [];
    for (const [type, text] of Object.entries(content)) {
      if (!text) continue;

      const isSocial = SOCIAL_PLATFORMS.includes(type);
      if (isSocial) {
        const posts = text.split(/\[POST \d+[^\]]*\]/i).filter(p => p.trim());
        posts.forEach((post, i) => {
          const cleaned = post.replace(/\(\d+ characters?\)/gi, '').trim();
          if (cleaned) {
            items.push({
              id: `${type}-${i}`,
              type,
              label: `${TYPE_LABELS[type]} #${i + 1}`,
              text: cleaned,
              platform: type,
              schedulable: true,
            });
          }
        });
      } else {
        items.push({
          id: type,
          type,
          label: TYPE_LABELS[type] || type,
          text,
          platform: type,
          schedulable: false,
        });
      }
    }
    return items;
  };

  const items = parseContent();

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setEditText(editedTexts[item.id] ?? item.text);
  };

  const saveEdit = (itemId) => {
    setEditedTexts(prev => ({ ...prev, [itemId]: editText }));
    setEditing(null);
    setEditText('');
  };

  const selectedItems = items.filter(i => selected.has(i.id));
  const schedulableSelected = selectedItems.filter(i => i.schedulable);
  const draftOnlySelected = selectedItems.filter(i => !i.schedulable);

  // Block the Schedule action when a selected social platform has no connected account —
  // /api/schedule will accept it but the post can never actually go out.
  const missingConnections = [...new Set(schedulableSelected.map(i => i.platform))]
    .filter(p => !connectedAccounts[p]?.connected || connectedAccounts[p]?.isExpired);

  // ── Schedule selected social posts via /api/schedule ──────────────
  const handleSchedule = async () => {
    if (schedulableSelected.length === 0) {
      setError('Select at least one social post to schedule.');
      return;
    }
    if (!scheduledAt) {
      setError('Pick a date and time.');
      return;
    }
    if (missingConnections.length > 0) {
      setError(`Connect ${missingConnections.join(', ')} first (Settings → Social accounts).`);
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    let okCount = 0;
    let lastErr = '';

    for (const item of schedulableSelected) {
      const postText = editedTexts[item.id] ?? item.text;
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            post_text: postText,
            platform: item.platform,
            scheduled_at: new Date(scheduledAt).toISOString(),
            is_boosted: false,
          }),
        });
        if (res.ok) okCount++;
        else {
          const d = await res.json().catch(() => ({}));
          lastErr = d.error || 'Schedule failed';
        }
      } catch (err) {
        lastErr = err.message || 'Network error';
      }
    }

    // Long-form items in the selection still get saved as pillar drafts — they
    // can't be auto-posted to a social platform, so drafts are the next-best.
    let draftCount = 0;
    if (draftOnlySelected.length > 0) {
      for (const item of draftOnlySelected) {
        try {
          const piece = {
            title: item.label,
            body: editedTexts[item.id] ?? item.text,
            pillarId: selectedPillar || '',
            platform: item.platform.charAt(0).toUpperCase() + item.platform.slice(1),
            contentType: ({ blog: 'Article', video: 'Video', newsletter: 'Newsletter' })[item.platform] || 'Post',
            status: 'draft',
            notes: '',
          };
          if (headers.Authorization) {
            const r = await fetch('/api/planner/pieces', { method: 'POST', headers, body: JSON.stringify(piece) });
            if (r.ok) draftCount++;
          }
        } catch { /* continue */ }
      }
    }

    setBusy(false);
    if (okCount > 0) {
      const parts = [`Scheduled ${okCount} post${okCount > 1 ? 's' : ''}`];
      if (draftCount > 0) parts.push(`saved ${draftCount} draft${draftCount > 1 ? 's' : ''} to pillars`);
      setSuccess(parts.join(' • '));
      onScheduled?.();
      setTimeout(() => onClose(), 2200);
    } else {
      setError(lastErr || 'Nothing was scheduled.');
    }
  };

  // ── Save all selected as pillar drafts (the old "Add to Pillars" path) ──
  const handleAddToPillars = async () => {
    if (selected.size === 0) {
      setError('Select at least one item.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    const headers = getAuthHeaders();
    let addedCount = 0;

    for (const item of selectedItems) {
      const postText = editedTexts[item.id] ?? item.text;
      const piece = {
        title: item.label,
        body: postText,
        pillarId: selectedPillar || '',
        platform: item.platform.charAt(0).toUpperCase() + item.platform.slice(1),
        contentType: ({ linkedin: 'Post', twitter: 'Post', facebook: 'Post', instagram: 'Post', blog: 'Article', video: 'Video', newsletter: 'Newsletter' })[item.platform] || 'Post',
        status: 'draft',
        notes: '',
      };
      if (headers.Authorization) {
        try {
          const res = await fetch('/api/planner/pieces', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(piece),
          });
          if (res.ok) addedCount++;
        } catch { /* continue */ }
      } else {
        try {
          const saved = localStorage.getItem('scribeshift-content-pieces');
          const pieces = saved ? JSON.parse(saved) : [];
          pieces.push({ ...piece, id: Date.now().toString() + '-' + item.id, createdAt: new Date().toISOString() });
          localStorage.setItem('scribeshift-content-pieces', JSON.stringify(pieces));
          addedCount++;
        } catch { /* continue */ }
      }
    }

    setBusy(false);
    if (addedCount > 0) {
      setSuccess(`Saved ${addedCount} draft${addedCount > 1 ? 's' : ''} to pillars.`);
      onScheduled?.();
      setTimeout(() => onClose(), 1800);
    } else {
      setError('Failed to save drafts.');
    }
  };

  return (
    <div className="schedule-overlay">
      <div className="schedule-modal">
        <div className="schedule-modal-header">
          <h3>Schedule Posts</h3>
          <button className="schedule-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="schedule-modal-body">
          <div className="schedule-select-bar">
            <button className="admin-btn-sm" onClick={selectAll}>
              {selected.size === items.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="schedule-count">{selected.size} of {items.length} selected</span>
          </div>

          <div className="schedule-items-list">
            {items.map(item => (
              <div key={item.id} className={`schedule-item ${selected.has(item.id) ? 'selected' : ''}`}>
                <div className="schedule-item-header">
                  <label className="schedule-item-check">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                    <span className="schedule-item-label">
                      {item.label}
                      {!item.schedulable && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                          (draft only — long-form content can't auto-post)
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="schedule-item-actions">
                    {editing === item.id ? (
                      <button className="admin-btn-sm" onClick={() => saveEdit(item.id)}>Save</button>
                    ) : (
                      <button className="admin-btn-sm" onClick={() => startEdit(item)}>Edit</button>
                    )}
                  </div>
                </div>
                {editing === item.id ? (
                  <textarea
                    className="schedule-edit-textarea"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={5}
                  />
                ) : (
                  <div className="schedule-item-preview">
                    {(() => { const t = editedTexts[item.id] ?? item.text; return t.length > 200 ? t.slice(0, 200) + '...' : t; })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Schedule date/time — the real point of this modal */}
          <div className="schedule-datetime">
            <div className="schedule-field" style={{ flex: 1 }}>
              <label>Send at</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="brand-input"
              />
            </div>
            {pillars.length > 0 && (
              <div className="schedule-field" style={{ flex: 1 }}>
                <label>Also tag with content type (optional)</label>
                <select
                  value={selectedPillar}
                  onChange={e => setSelectedPillar(e.target.value)}
                  className="brand-input"
                >
                  <option value="">No content type</option>
                  {pillars.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {missingConnections.length > 0 && schedulableSelected.length > 0 && (
            <div className="admin-error">
              Connect these accounts in Settings before scheduling: {missingConnections.join(', ')}
            </div>
          )}

          {error && <div className="admin-error">{error}</div>}
          {success && <div className="schedule-success">{success}</div>}
        </div>

        <div className="schedule-modal-footer">
          <button className="admin-btn" onClick={onClose}>Cancel</button>
          <button
            className="admin-btn"
            onClick={handleAddToPillars}
            disabled={busy || selected.size === 0}
            title="Save as drafts in your Content Types planner instead of scheduling now"
          >
            {busy ? '…' : 'Save as Drafts'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSchedule}
            disabled={busy || schedulableSelected.length === 0 || !scheduledAt || missingConnections.length > 0}
          >
            {busy
              ? 'Scheduling…'
              : `Schedule ${schedulableSelected.length} Post${schedulableSelected.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}