import { useState } from 'react';
import { useAuth } from './AuthProvider';

const PLATFORM_MAP = {
  linkedin: 'linkedin',
  twitter: 'twitter',
  facebook: 'facebook',
  instagram: 'instagram',
  blog: 'blog',
  newsletter: 'newsletter',
  video: 'video',
};

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
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduling, setScheduling] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const handleSchedule = async () => {
    if (!scheduleDate) {
      setError('Please select a date');
      return;
    }
    if (selected.size === 0) {
      setError('Please select at least one item to schedule');
      return;
    }

    setScheduling(true);
    setError('');
    setSuccess('');

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    const selectedItems = items.filter(i => selected.has(i.id));
    let scheduledCount = 0;

    for (const item of selectedItems) {
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: item.platform,
            post_text: editedTexts[item.id] ?? item.text,
            scheduled_at: scheduledAt,
            status: 'scheduled',
          }),
        });
        if (res.ok) scheduledCount++;
      } catch {
        // continue with others
      }
    }

    setScheduling(false);
    if (scheduledCount > 0) {
      setSuccess(`Scheduled ${scheduledCount} post${scheduledCount > 1 ? 's' : ''} successfully!`);
      if (onScheduled) onScheduled();
      setTimeout(() => onClose(), 2000);
    } else {
      setError('Failed to schedule posts. Please try again.');
    }
  };

  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="schedule-overlay">
      <div className="schedule-modal">
        <div className="schedule-modal-header">
          <h3>Schedule Content</h3>
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

          <div className="schedule-datetime">
            <div className="schedule-field">
              <label>Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={minDate}
                className="brand-input"
              />
            </div>
            <div className="schedule-field">
              <label>Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="brand-input"
              />
            </div>
          </div>

          {error && <div className="admin-error">{error}</div>}
          {success && <div className="schedule-success">{success}</div>}
        </div>

        <div className="schedule-modal-footer">
          <button className="admin-btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSchedule}
            disabled={scheduling || selected.size === 0}
          >
            {scheduling ? 'Scheduling...' : `Schedule ${selected.size} Post${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
