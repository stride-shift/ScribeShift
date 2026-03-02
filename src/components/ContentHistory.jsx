import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

const CONTENT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'blog', label: 'Blog' },
  { value: 'linkedin', label: 'LinkedIn Post' },
  { value: 'twitter', label: 'Twitter Thread' },
  { value: 'facebook', label: 'Facebook Post' },
  { value: 'instagram', label: 'Instagram Caption' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'video', label: 'Video Script' },
];

const PILLARS = [
  { value: '', label: 'All Pillars' },
  { value: 'thought_leadership', label: 'Thought Leadership' },
  { value: 'product', label: 'Product / Feature' },
  { value: 'culture', label: 'Culture / Behind the Scenes' },
  { value: 'education', label: 'Education / How-To' },
  { value: 'social_proof', label: 'Social Proof / Results' },
  { value: 'engagement', label: 'Engagement / Community' },
  { value: 'news', label: 'Industry News / Trends' },
];

const PILLAR_COLORS = {
  thought_leadership: '#8b5cf6',
  product: '#3b82f6',
  culture: '#f59f0a',
  education: '#10b981',
  social_proof: '#ef4444',
  engagement: '#ec4899',
  news: '#6366f1',
};

export default function ContentHistory() {
  const { getAuthHeaders } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [pillarFilter, setPillarFilter] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const limit = 20;

  const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

  useEffect(() => {
    loadContent();
  }, [typeFilter, pillarFilter, pinnedOnly, offset]);

  const loadContent = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit, offset });
      if (typeFilter) params.set('type', typeFilter);
      if (pillarFilter) params.set('pillar', pillarFilter);
      if (pinnedOnly) params.set('pinned', 'true');
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/content?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load content'); return; }
      setItems(data.content || []);
      setTotal(data.total || 0);
    } catch {
      setError('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    loadContent();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this content?')) return;
    try {
      const res = await fetch(`/api/content/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        setTotal(prev => prev - 1);
      }
    } catch {
      setError('Failed to delete');
    }
  };

  const handleTogglePin = async (id, currentPinned) => {
    try {
      const res = await fetch(`/api/content/${id}/pin`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ pinned: !currentPinned }),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, pinned: !currentPinned } : i));
      }
    } catch {
      setError('Failed to update pin');
    }
  };

  const handleSetPillar = async (id, pillar) => {
    try {
      const res = await fetch(`/api/content/${id}/pillar`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ pillar }),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, pillar } : i));
      }
    } catch {
      setError('Failed to update pillar');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="content-history">
      <div className="history-header">
        <h2>Content Bank</h2>
        <p className="history-subtitle">Browse, pin, and organize your generated content</p>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <form className="history-search-form" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search by title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="history-search-input"
          />
          <button type="submit" className="admin-btn">Search</button>
        </form>
        <select className="admin-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setOffset(0); }}>
          {CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="admin-select" value={pillarFilter} onChange={e => { setPillarFilter(e.target.value); setOffset(0); }}>
          {PILLARS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button
          className={`pin-filter-btn ${pinnedOnly ? 'active' : ''}`}
          onClick={() => { setPinnedOnly(!pinnedOnly); setOffset(0); }}
          title="Show pinned only"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={pinnedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          Pinned
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="loading-screen" style={{ minHeight: '30vh' }}>
          <div className="loading-spinner" /><p>Loading content...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="admin-empty">
          {search || typeFilter || pillarFilter || pinnedOnly
            ? 'No content matches your filters.'
            : 'No content generated yet. Create content from the Create view to see it here.'}
        </div>
      ) : (
        <>
          <div className="history-count">{total} item{total !== 1 ? 's' : ''} found</div>

          <div className="history-list">
            {items.map(item => (
              <div key={item.id} className={`history-card ${item.pinned ? 'pinned' : ''}`}>
                <div className="history-card-header" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                  <div className="history-card-meta">
                    <span className="history-type-badge">{item.content_type?.replace(/_/g, ' ') || 'Content'}</span>
                    {item.pillar && (
                      <span
                        className="history-pillar-badge"
                        style={{ background: (PILLAR_COLORS[item.pillar] || '#94a3b8') + '22', color: PILLAR_COLORS[item.pillar] || '#94a3b8', borderColor: (PILLAR_COLORS[item.pillar] || '#94a3b8') + '44' }}
                      >
                        {PILLARS.find(p => p.value === item.pillar)?.label || item.pillar}
                      </span>
                    )}
                    <span className="history-date">{new Date(item.created_at).toLocaleDateString()}</span>
                    {item.pinned && (
                      <svg className="history-pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                    )}
                  </div>
                  <h4 className="history-card-title">{item.title || 'Untitled'}</h4>
                  {item.source_summary && <p className="history-card-summary">{item.source_summary.slice(0, 120)}...</p>}
                  <span className="history-expand-icon">{expanded === item.id ? '\u25B2' : '\u25BC'}</span>
                </div>

                {expanded === item.id && (
                  <div className="history-card-body">
                    <pre className="history-content-text">{item.body}</pre>

                    {/* Pillar assignment */}
                    <div className="history-pillar-row">
                      <label className="history-pillar-label">Content Pillar:</label>
                      <select
                        className="admin-select history-pillar-select"
                        value={item.pillar || ''}
                        onChange={e => handleSetPillar(item.id, e.target.value)}
                      >
                        <option value="">None</option>
                        {PILLARS.filter(p => p.value).map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="history-card-actions">
                      <button className="admin-btn-sm" onClick={() => copyToClipboard(item.body)}>Copy</button>
                      <button
                        className={`admin-btn-sm ${item.pinned ? 'pin-active' : ''}`}
                        onClick={() => handleTogglePin(item.id, item.pinned)}
                      >
                        {item.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button className="admin-btn-sm danger" onClick={() => handleDelete(item.id)}>Delete</button>
                    </div>
                    {item.users && (
                      <div className="history-author">By {item.users.full_name || item.users.email}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="history-pagination">
              <button className="admin-btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button>
              <span className="history-page-info">Page {currentPage} of {totalPages}</span>
              <button className="admin-btn-sm" disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
