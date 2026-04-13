import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { StatCard } from './ui/stat-card';
import { Tabs } from './ui/tabs';
import { RailPanel, EmptyPanel } from './ui/empty-panel';

const CONTENT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'blog', label: 'Blog' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'video', label: 'Video' },
];

const PILLARS = [
  { value: '', label: 'All Pillars' },
  { value: 'thought_leadership', label: 'Thought Leadership' },
  { value: 'product', label: 'Product / Feature' },
  { value: 'culture', label: 'Culture' },
  { value: 'education', label: 'Education' },
  { value: 'social_proof', label: 'Social Proof' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'news', label: 'Industry News' },
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

const PLATFORM_COLORS = {
  blog: '#64748b',
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  facebook: '#1877F2',
  instagram: '#E4405F',
  newsletter: '#f59f0a',
  video: '#ef4444',
};

const Icons = {
  docs: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  pin: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>,
  trend: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  gap: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

function pillarLabel(value) {
  return PILLARS.find(p => p.value === value)?.label || value;
}

// Native-select-backed chip that displays as a pill button.
// The select is invisibly stacked on top so clicks open the OS dropdown.
function FilterChip({ label, value, onChange, options }) {
  const display = value || label;
  const active = !!value;
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className={`px-3 py-1.5 text-[12px] font-medium rounded-md border flex items-center gap-1 pointer-events-none ${
          active
            ? 'bg-[var(--primary-glow)] border-[var(--primary)]/40 text-[var(--primary)]'
            : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]'
        }`}
      >
        {display}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <select
        className="absolute inset-0 opacity-0 cursor-pointer"
        value={options.find(o => o.label === value)?.value || ''}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function weekBucket(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 7) return 'This Week';
  if (diffDays <= 14) return 'Last Week';
  return 'Earlier';
}

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

  // Close modal on Escape key
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);
  const [tab, setTab] = useState('timeline');
  const limit = 20;

  const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

  useEffect(() => { loadContent(); }, [typeFilter, pillarFilter, pinnedOnly, offset]);

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

  // Derived insights
  const stats = useMemo(() => {
    const pinnedCount = items.filter(i => i.pinned).length;
    const allPillars = PILLARS.filter(p => p.value).map(p => p.value);
    const presentPillars = new Set(items.map(i => i.pillar).filter(Boolean));
    const gapsCount = allPillars.filter(p => !presentPillars.has(p)).length;

    // Top pillar & top type from loaded items
    const pillarCounts = {};
    const typeCounts = {};
    items.forEach(i => {
      if (i.pillar) pillarCounts[i.pillar] = (pillarCounts[i.pillar] || 0) + 1;
      if (i.content_type) typeCounts[i.content_type] = (typeCounts[i.content_type] || 0) + 1;
    });
    const topPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      total,
      pinnedCount,
      gapsCount,
      topPillar: topPillar ? { key: topPillar[0], count: topPillar[1] } : null,
      topType: topType ? { key: topType[0], count: topType[1] } : null,
    };
  }, [items, total]);

  // Filter items for current tab
  const tabItems = useMemo(() => {
    if (tab === 'pinned') return items.filter(i => i.pinned);
    if (tab === 'performance') return items; // placeholder — no metrics yet
    return items;
  }, [items, tab]);

  // Timeline grouping (by week)
  const timelineGroups = useMemo(() => {
    const map = { 'This Week': [], 'Last Week': [], 'Earlier': [] };
    tabItems.forEach(item => {
      const bucket = weekBucket(item.created_at);
      map[bucket].push(item);
    });
    return map;
  }, [tabItems]);

  // Cluster grouping (by pillar)
  const clusterGroups = useMemo(() => {
    const map = {};
    tabItems.forEach(item => {
      const key = item.pillar || 'unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [tabItems]);

  const pinnedItems = items.filter(i => i.pinned).slice(0, 3);

  const renderCard = (item) => {
    const ptColor = PLATFORM_COLORS[item.content_type] || '#64748b';
    return (
    <div
      key={item.id}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm hover:shadow transition-shadow flex flex-col"
    >
      <div
        className="p-4 cursor-pointer flex-1"
        onClick={() => setExpanded(expanded === item.id ? null : item.id)}
      >
        {/* Platform line */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: ptColor }}
          >
            {(item.content_type || 'C').charAt(0).toUpperCase()}
          </span>
          <span className="text-[11px] font-semibold text-[var(--text)] capitalize">
            {item.content_type || 'Content'}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">·</span>
          <span className="text-[10px] text-[var(--text-secondary)]">
            {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {item.pinned && (
            <span className="ml-auto text-[var(--warning)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            </span>
          )}
        </div>

        {/* Type label */}
        {item.pillar && (
          <div
            className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded mb-2"
            style={{
              background: (PILLAR_COLORS[item.pillar] || '#94a3b8') + '22',
              color: PILLAR_COLORS[item.pillar] || '#94a3b8',
            }}
          >
            {pillarLabel(item.pillar)}
          </div>
        )}

        <h4 className="text-[14px] font-semibold text-[var(--text)] mb-2 line-clamp-3 leading-snug">
          {item.title || (item.body || '').slice(0, 100) || 'Untitled'}
        </h4>

        {/* Tag chips */}
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {item.pillar && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] capitalize">
              {pillarLabel(item.pillar)}
            </span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success)] font-semibold">
            Engagement High
          </span>
        </div>
      </div>

      {/* Card footer with action icons */}
      <div className="px-4 pb-3 flex items-center gap-2 border-t border-[var(--border)] pt-2.5 mt-auto">
        <button
          className="text-[var(--text-secondary)] hover:text-[var(--text)]"
          title="Edit"
          onClick={(e) => { e.stopPropagation(); setExpanded(item.id); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          className="text-[var(--text-secondary)] hover:text-[var(--primary)]"
          title="Copy"
          onClick={(e) => { e.stopPropagation(); copyToClipboard(item.body); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button
          className={`hover:text-[var(--warning)] ${item.pinned ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}
          title={item.pinned ? 'Unpin' : 'Pin'}
          onClick={(e) => { e.stopPropagation(); handleTogglePin(item.id, item.pinned); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={item.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
        </button>
        <div className="flex-1" />
        <button
          className="text-[var(--text-secondary)] hover:text-[var(--danger)]"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

    </div>
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[22px] font-semibold text-[var(--text)] tracking-tight">Content Bank</h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            Browse, pin, and organize your generated content.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 border border-[var(--border)] rounded-md bg-[var(--bg-card)]">
            <button className="px-2 py-1.5 rounded text-[var(--text)] bg-[var(--bg-input)]" title="Grid view">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button className="px-2 py-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text)]" title="Compact grid">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="4"/><rect x="14" y="3" width="7" height="4"/><rect x="3" y="10" width="7" height="4"/><rect x="14" y="10" width="7" height="4"/><rect x="3" y="17" width="7" height="4"/><rect x="14" y="17" width="7" height="4"/></svg>
            </button>
            <button className="px-2 py-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text)]" title="List view">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button className="px-2 py-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text)]" title="Kanban">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="6" height="18"/><rect x="11" y="3" width="6" height="12"/><rect x="19" y="3" width="2" height="8"/></svg>
            </button>
          </div>
          <button className="px-4 py-2 text-[13px] font-semibold rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] shadow-sm">
            + New Content
          </button>
        </div>
      </div>

      {/* Search bar (top row) */}
      <form
        onSubmit={handleSearch}
        className="mb-3 flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-md px-3 shadow-sm"
      >
        <span className="text-[var(--text-secondary)]">{Icons.search}</span>
        <input
          type="text"
          placeholder="Search anything: posts, topics, ideas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-0 py-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-secondary)] focus:outline-none"
        />
        <span className="text-[10px] text-[var(--text-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5">⌘K</span>
      </form>

      {/* Filter chip row */}
      <div className="mb-5 flex items-center gap-2 flex-wrap">
        <FilterChip
          label="Platform"
          value={typeFilter ? CONTENT_TYPES.find(t => t.value === typeFilter)?.label : ''}
          onChange={(v) => { setTypeFilter(v); setOffset(0); }}
          options={CONTENT_TYPES}
        />
        <FilterChip
          label="Pillar"
          value={pillarFilter ? PILLARS.find(p => p.value === pillarFilter)?.label : ''}
          onChange={(v) => { setPillarFilter(v); setOffset(0); }}
          options={PILLARS}
        />
        <button className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1">
          Tone
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1">
          Status
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1">
          Date
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button
          className={`px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors flex items-center gap-1.5 ${
            pinnedOnly
              ? 'bg-[var(--warning-bg)] border-[var(--warning)]/40 text-[var(--warning)]'
              : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
          onClick={() => { setPinnedOnly(!pinnedOnly); setOffset(0); }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill={pinnedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          Pinned
        </button>
        <button className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          More filters
        </button>
      </div>

      {/* Stat card row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard
          tone="blue"
          icon={Icons.docs}
          label="Total Posts"
          value={stats.total}
          subtext="All content generated"
        />
        <StatCard
          tone="amber"
          icon={Icons.pin}
          label="Pinned"
          value={stats.pinnedCount}
          subtext="Quick access"
        />
        <StatCard
          tone="green"
          icon={Icons.trend}
          label="Top Performers"
          value={stats.pinnedCount > 0 ? stats.pinnedCount : '—'}
          subtext="High engagement"
        />
        <StatCard
          tone="red"
          icon={Icons.gap}
          label="Content Gaps"
          value={stats.gapsCount}
          subtext="Opportunities"
        />
      </div>

      {/* Tabs + sort */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <Tabs
          items={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'clusters', label: 'Clusters' },
            { value: 'performance', label: 'Performance' },
            { value: 'pinned', label: 'Pinned' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="flex-1" />
        <span className="text-[12px] text-[var(--text-secondary)]">Sort by:</span>
        <button className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] flex items-center gap-1">
          Newest first
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-[13px] rounded-md">
          {error}
        </div>
      )}

      {/* Main grid: content + right rail (rail only shows on very wide screens) */}
      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_260px] gap-5 items-start">
        <div className="min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="loading-spinner" />
              <p className="text-[13px] text-[var(--text-secondary)] mt-3">Loading content...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-lg py-16 text-center">
              <div className="text-[14px] font-medium text-[var(--text)] mb-1">No content yet</div>
              <div className="text-[12px] text-[var(--text-secondary)]">
                {search || typeFilter || pillarFilter || pinnedOnly
                  ? 'No content matches your filters.'
                  : 'Create content from the Create view to see it here.'}
              </div>
            </div>
          ) : (
            <>
              {tab === 'timeline' && (
                <div className="space-y-6">
                  {Object.entries(timelineGroups).map(([bucket, bucketItems]) => (
                    bucketItems.length > 0 && (
                      <div key={bucket}>
                        <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                          {bucket}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                          {bucketItems.map(renderCard)}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {tab === 'clusters' && (
                <div className="space-y-6">
                  {Object.entries(clusterGroups).map(([pillar, clusterItems]) => (
                    <div key={pillar}>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: PILLAR_COLORS[pillar] || '#94a3b8' }}
                        />
                        <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                          {pillar === 'unassigned' ? 'Unassigned' : pillarLabel(pillar)}
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          · {clusterItems.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {clusterItems.map(renderCard)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'performance' && (
                <div>
                  <div className="mb-4 bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-lg p-4 text-center">
                    <div className="text-[13px] font-medium text-[var(--text)]">Performance sorting coming soon</div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Once posts are published and metrics sync, we&apos;ll rank your content by engagement here.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {tabItems.map(renderCard)}
                  </div>
                </div>
              )}

              {tab === 'pinned' && (
                tabItems.length === 0 ? (
                  <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-lg py-12 text-center">
                    <div className="text-[13px] font-medium text-[var(--text)] mb-1">Nothing pinned yet</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">Pin your best posts to keep them at your fingertips.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {tabItems.map(renderCard)}
                  </div>
                )
              )}

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] disabled:opacity-50"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Previous
                  </button>
                  <span className="text-[12px] text-[var(--text-secondary)]">Page {currentPage} of {totalPages}</span>
                  <button
                    className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] disabled:opacity-50"
                    disabled={currentPage >= totalPages}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right rail — only shown on very wide screens */}
        <div className="hidden 2xl:block space-y-4">
          <RailPanel title="Quick Insights">
            {stats.topPillar || stats.topType ? (
              <div className="space-y-3">
                {stats.topPillar && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-[var(--text-secondary)]">Top Pillar</div>
                    <div className="text-[13px] font-semibold text-[var(--text)]">
                      {pillarLabel(stats.topPillar.key)}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {stats.topPillar.count} post{stats.topPillar.count === 1 ? '' : 's'}
                    </div>
                  </div>
                )}
                {stats.topType && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-[var(--text-secondary)]">Most Used Type</div>
                    <div className="text-[13px] font-semibold text-[var(--text)] capitalize">
                      {stats.topType.key}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {stats.topType.count} post{stats.topType.count === 1 ? '' : 's'}
                    </div>
                  </div>
                )}
                <button
                  className="w-full text-[12px] text-[var(--primary)] hover:underline text-left"
                  onClick={() => setTab('performance')}
                >
                  View Full Analytics →
                </button>
              </div>
            ) : (
              <div className="text-[12px] text-[var(--text-secondary)] text-center py-2">
                Insights will appear as you add content.
              </div>
            )}
          </RailPanel>

          <RailPanel title="Reuse Ideas">
            {pinnedItems.length === 0 ? (
              <div className="text-[12px] text-[var(--text-secondary)] text-center py-2">
                Pin a post to see reuse ideas here.
              </div>
            ) : (
              pinnedItems.map(item => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] hover:border-[var(--primary)] cursor-pointer"
                  onClick={() => { setExpanded(item.id); }}
                >
                  <div className="text-[12px] font-medium text-[var(--text)] line-clamp-2 mb-1">
                    {item.title || (item.body || '').slice(0, 60)}
                  </div>
                  <div className="text-[10px] text-[var(--primary)] font-semibold uppercase">
                    Create Similar
                  </div>
                </div>
              ))
            )}
          </RailPanel>

          <RailPanel title="Suggested Next Steps">
            <EmptyPanel
              title="Coming soon"
              description="Actionable next steps based on your content performance."
            />
          </RailPanel>
        </div>
      </div>

      {/* Expanded content modal */}
      {expanded && (() => {
        const item = items.find(i => i.id === expanded);
        if (!item) return null;
        const ptColor = PLATFORM_COLORS[item.content_type] || '#6366f1';
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setExpanded(null)}
          >
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Modal header */}
              <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--border)]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ background: ptColor }}
                    >
                      {(item.content_type || 'C').charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[13px] font-semibold capitalize">{item.content_type || 'Content'}</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">·</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {item.pinned && (
                      <span className="text-[var(--warning)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                      </span>
                    )}
                  </div>
                  <h3 className="text-[16px] font-semibold text-[var(--text)] leading-tight">
                    {item.title || 'Untitled'}
                  </h3>
                </div>
                <button
                  className="text-[var(--text-secondary)] hover:text-[var(--text)] text-2xl leading-none flex-shrink-0"
                  onClick={() => setExpanded(null)}
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>

              {/* Modal body — scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <pre className="text-[13px] text-[var(--text)] whitespace-pre-wrap font-sans leading-relaxed">
                  {item.body}
                </pre>
              </div>

              {/* Modal footer — actions */}
              <div className="border-t border-[var(--border)] px-6 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">Pillar:</label>
                  <select
                    className="text-[12px] px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text)]"
                    value={item.pillar || ''}
                    onChange={e => handleSetPillar(item.id, e.target.value)}
                  >
                    <option value="">None</option>
                    {PILLARS.filter(p => p.value).map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1" />
                <button
                  className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-raised)] hover:bg-[var(--bg-card-hover)]"
                  onClick={() => copyToClipboard(item.body)}
                >
                  Copy
                </button>
                <button
                  className={`px-3 py-1.5 text-[12px] rounded-md border ${
                    item.pinned
                      ? 'border-[var(--warning)]/40 bg-[var(--warning-bg)] text-[var(--warning)]'
                      : 'border-[var(--border)] bg-[var(--bg-raised)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                  onClick={() => handleTogglePin(item.id, item.pinned)}
                >
                  {item.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--danger)]/40 bg-[var(--danger-bg)] text-[var(--danger)]"
                  onClick={() => {
                    handleDelete(item.id);
                    setExpanded(null);
                  }}
                >
                  Delete
                </button>
              </div>
              {item.users && (
                <div className="px-6 pb-3 text-[11px] text-[var(--text-secondary)]">
                  By {item.users.full_name || item.users.email}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
