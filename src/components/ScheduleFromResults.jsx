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

export default function ScheduleFromResults({ content, onClose, onScheduled }) {
  const { getAuthHeaders } = useAuth();
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // type being edited
  const [editText, setEditText] = useState('');
  const [editedTexts, setEditedTexts] = useState({}); // { itemId: editedText }
  const [selectedPillar, setSelectedPillar] = useState('');
  const [pillars, setPillars] = useState([]);
  const [saving, setSaving] = useState(false);
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
    fetch('/api/planner/pillars', { headers }).then(r => r.json()).then(data => {
      if (data.pillars) { setPillars(data.pillars); if (data.pillars.length > 0) setSelectedPillar(data.pillars[0].id); }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse social posts into individual items
  const parseContent = () => {
    const items = [];
    for (const [type, text] of Object.entries(content)) {
      if (!text) continue;

      const isSocial = ['linkedin', 'twitter', 'facebook', 'instagram'].includes(type);
      if (isSocial) {
        // Split social content into individual posts
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
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
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

  const handleAddToPillars = async () => {
    if (selected.size === 0) {
      setError('Please select at least one item');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const headers = getAuthHeaders();
    const selectedItems = items.filter(i => selected.has(i.id));
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

    setSaving(false);
    if (addedCount > 0) {
      setSuccess(`Added ${addedCount} piece${addedCount > 1 ? 's' : ''} to pillars!`);
      if (onScheduled) onScheduled();
      setTimeout(() => onClose(), 2000);
    } else {
      setError('Failed to add content. Please try again.');
    }
  };

  return (
    <div className="schedule-overlay">
      <div className="schedule-modal">
        <div className="schedule-modal-header">
          <h3>Add to Pillars</h3>
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
                    <span className="schedule-item-label">{item.label}</span>
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

          {pillars.length > 0 && (
            <div className="schedule-datetime">
              <div className="schedule-field" style={{ flex: 1 }}>
                <label>Add to Pillar</label>
                <select
                  value={selectedPillar}
                  onChange={e => setSelectedPillar(e.target.value)}
                  className="brand-input"
                >
                  <option value="">No pillar (uncategorized)</option>
                  {pillars.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <div className="admin-error">{error}</div>}
          {success && <div className="schedule-success">{success}</div>}
        </div>

        <div className="schedule-modal-footer">
          <button className="admin-btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleAddToPillars}
            disabled={saving || selected.size === 0}
          >
            {saving ? 'Adding...' : `Add ${selected.size} Post${selected.size !== 1 ? 's' : ''} to Pillars`}
          </button>
        </div>
      </div>
    </div>
  );
}
