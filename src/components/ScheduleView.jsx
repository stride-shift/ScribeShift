import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './AuthProvider';
import CampaignPlanner from './CampaignPlanner';

const STATUS_FILTERS = [
  { value: '', label: 'All Status' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'posting', label: 'Posting' },
  { value: 'posted', label: 'Posted' },
  { value: 'failed', label: 'Failed' },
];

const PLATFORM_COLORS = {
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  facebook: '#1877F2',
  instagram: '#E4405F',
};

const PLATFORM_LABELS = {
  linkedin: 'LI',
  twitter: 'X',
  facebook: 'FB',
  instagram: 'IG',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleView() {
  const { getAuthHeaders } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [viewMode, setViewMode] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showNewPost, setShowNewPost] = useState(false);
  const [showCampaignPlanner, setShowCampaignPlanner] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [newPost, setNewPost] = useState({
    post_text: '',
    platform: 'linkedin',
    scheduled_at: '',
    is_boosted: false,
    boost_spend: '',
    pillar: '',
  });
  // Interactive calendar features
  const [quickAddDate, setQuickAddDate] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddPlatform, setQuickAddPlatform] = useState('linkedin');
  const [dragPost, setDragPost] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [expandedCell, setExpandedCell] = useState(null);
  const quickAddRef = useRef(null);

  const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

  useEffect(() => {
    loadPosts();
  }, [statusFilter]);

  // Focus quick-add textarea when shown
  useEffect(() => {
    if (quickAddDate && quickAddRef.current) {
      quickAddRef.current.focus();
    }
  }, [quickAddDate]);

  const loadPosts = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/schedule?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load posts'); return; }
      setPosts(data.posts || []);
    } catch {
      setError('Failed to load scheduled posts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.post_text.trim() || !newPost.scheduled_at) {
      setError('Post text and scheduled date are required');
      return;
    }
    try {
      const payload = { ...newPost, scheduled_at: new Date(newPost.scheduled_at).toISOString() };
      const res = await fetch('/api/schedule', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to schedule post'); return; }
      setPosts(prev => [data.post, ...prev].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
      setShowNewPost(false);
      setNewPost({ post_text: '', platform: 'linkedin', scheduled_at: '', is_boosted: false, boost_spend: '', pillar: '' });
    } catch {
      setError('Failed to schedule post');
    }
  };

  const handleQuickAdd = async (date) => {
    if (!quickAddText.trim()) { setQuickAddDate(null); return; }
    const d = new Date(date);
    d.setHours(9, 0, 0, 0);
    try {
      const payload = {
        post_text: quickAddText.trim(),
        platform: quickAddPlatform,
        scheduled_at: d.toISOString(),
        is_boosted: false,
        boost_spend: '',
        pillar: '',
      };
      const res = await fetch('/api/schedule', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to schedule post'); return; }
      setPosts(prev => [data.post, ...prev].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
      setQuickAddText('');
      setQuickAddDate(null);
    } catch {
      setError('Failed to schedule post');
    }
  };

  const handleUpdatePost = async () => {
    if (!editingPost) return;
    try {
      const res = await fetch(`/api/schedule/${editingPost.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          post_text: editingPost.post_text,
          scheduled_at: new Date(editingPost.scheduled_at).toISOString(),
          platform: editingPost.platform,
          is_boosted: editingPost.is_boosted,
          boost_spend: editingPost.boost_spend,
        }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to update'); return; }
      setPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, ...editingPost } : p));
      setEditingPost(null);
    } catch {
      setError('Failed to update post');
    }
  };

  const handleDragReschedule = async (postId, newDate) => {
    const post = posts.find(p => p.id === postId);
    if (!post || post.status !== 'scheduled') return;

    const oldDate = new Date(post.scheduled_at);
    const target = new Date(newDate);
    target.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);

    try {
      const res = await fetch(`/api/schedule/${postId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ ...post, scheduled_at: target.toISOString() }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to reschedule'); return; }
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_at: target.toISOString() } : p));
    } catch {
      setError('Failed to reschedule post');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this scheduled post?')) return;
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) setPosts(prev => prev.filter(p => p.id !== id));
    } catch {
      setError('Failed to delete post');
    }
  };

  const handlePostNow = async (id) => {
    if (!confirm('Post this immediately?')) return;
    try {
      const res = await fetch(`/api/schedule/${id}/post-now`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'posting' } : p));
      else setError(data.error || 'Failed to post');
    } catch {
      setError('Failed to trigger post');
    }
  };

  const handleCalendarDateClick = (date) => {
    setSelectedDate(date);
    const d = new Date(date);
    d.setHours(9, 0, 0, 0);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    setNewPost(prev => ({ ...prev, scheduled_at: local.toISOString().slice(0, 16) }));
  };

  const handleCellDoubleClick = (e, date) => {
    e.stopPropagation();
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    setQuickAddDate(dateKey);
    setQuickAddText('');
    setQuickAddPlatform('linkedin');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return '#3b82f6';
      case 'posting': return '#0da2e7';
      case 'posted': return '#22c55e';
      case 'failed': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
      case 'posting': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
      case 'posted': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>;
      case 'failed': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
      default: return null;
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  // Calendar data
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, month: month - 1, year, isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month, year, isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: month + 1, year, isCurrentMonth: false });
    }

    return days;
  }, [currentMonth]);

  // Map posts to dates
  const postsByDate = useMemo(() => {
    const map = {};
    let filteredPosts = posts;
    if (platformFilter) {
      filteredPosts = posts.filter(p => p.platform === platformFilter);
    }
    filteredPosts.forEach(post => {
      const d = new Date(post.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(post);
    });
    return map;
  }, [posts, platformFilter]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  const monthLabel = currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const groupedPosts = posts.reduce((acc, post) => {
    const date = new Date(post.scheduled_at).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  const selectedDateKey = selectedDate ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}` : null;
  const selectedDatePosts = selectedDateKey ? (postsByDate[selectedDateKey] || []) : [];

  // Stats bar
  const stats = useMemo(() => {
    const scheduled = posts.filter(p => p.status === 'scheduled').length;
    const posted = posts.filter(p => p.status === 'posted').length;
    const failed = posts.filter(p => p.status === 'failed').length;
    const thisWeek = posts.filter(p => {
      const d = new Date(p.scheduled_at);
      const now = new Date();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
      return d >= weekStart && d < weekEnd;
    }).length;
    return { scheduled, posted, failed, thisWeek };
  }, [posts]);

  return (
    <div className="schedule-view">
      <div className="schedule-header">
        <div>
          <h2>Post Schedule</h2>
          <p className="schedule-subtitle">Plan, organize, and schedule your content</p>
        </div>
        <div className="schedule-header-actions">
          <div className="view-mode-toggle">
            <button className={`view-mode-btn ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Calendar
            </button>
            <button className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              List
            </button>
          </div>
          <button className="admin-btn campaign-plan-btn" onClick={() => setShowCampaignPlanner(!showCampaignPlanner)}>
            {showCampaignPlanner ? 'Hide Planner' : 'Campaign Planner'}
          </button>
          <button className="admin-btn" onClick={() => setShowNewPost(true)}>+ New Post</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="schedule-stats-bar">
        <div className="schedule-stat">
          <span className="schedule-stat-num" style={{ color: '#3b82f6' }}>{stats.scheduled}</span>
          <span className="schedule-stat-label">Scheduled</span>
        </div>
        <div className="schedule-stat">
          <span className="schedule-stat-num" style={{ color: '#22c55e' }}>{stats.posted}</span>
          <span className="schedule-stat-label">Posted</span>
        </div>
        <div className="schedule-stat">
          <span className="schedule-stat-num" style={{ color: '#ef4444' }}>{stats.failed}</span>
          <span className="schedule-stat-label">Failed</span>
        </div>
        <div className="schedule-stat">
          <span className="schedule-stat-num" style={{ color: '#f59f0a' }}>{stats.thisWeek}</span>
          <span className="schedule-stat-label">This Week</span>
        </div>
      </div>

      {error && (
        <div className="admin-error">
          {error}
          <button className="admin-error-dismiss" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {showCampaignPlanner && (
        <CampaignPlanner onClose={() => setShowCampaignPlanner(false)} />
      )}

      {/* Filters */}
      <div className="schedule-filters">
        <select className="admin-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="schedule-platform-filters">
          <button className={`schedule-plat-btn ${platformFilter === '' ? 'active' : ''}`} onClick={() => setPlatformFilter('')}>All</button>
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
            <button key={key} className={`schedule-plat-btn ${platformFilter === key ? 'active' : ''}`}
              style={platformFilter === key ? { background: PLATFORM_COLORS[key] + '22', color: PLATFORM_COLORS[key], borderColor: PLATFORM_COLORS[key] + '44' } : {}}
              onClick={() => setPlatformFilter(prev => prev === key ? '' : key)}>
              {label}
            </button>
          ))}
        </div>
        <span className="schedule-count">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
      </div>

      {/* New Post Form */}
      {showNewPost && (
        <div className="schedule-form-card">
          <h4>Schedule New Post</h4>
          <textarea
            className="schedule-textarea"
            placeholder="Write your post content..."
            value={newPost.post_text}
            onChange={e => setNewPost(p => ({ ...p, post_text: e.target.value }))}
            rows={4}
          />
          <div className="admin-form-row">
            <select value={newPost.platform} onChange={e => setNewPost(p => ({ ...p, platform: e.target.value }))}>
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">Twitter/X</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
            <input type="datetime-local" value={newPost.scheduled_at} onChange={e => setNewPost(p => ({ ...p, scheduled_at: e.target.value }))} />
            <label className="schedule-boost-label">
              <input type="checkbox" checked={newPost.is_boosted} onChange={e => setNewPost(p => ({ ...p, is_boosted: e.target.checked }))} />
              Boosted
            </label>
            {newPost.is_boosted && (
              <input type="number" placeholder="Spend ($)" value={newPost.boost_spend} onChange={e => setNewPost(p => ({ ...p, boost_spend: e.target.value }))} style={{ maxWidth: '100px' }} />
            )}
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn" onClick={handleCreatePost}>Schedule</button>
            <button className="admin-btn secondary" onClick={() => setShowNewPost(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Post Form */}
      {editingPost && (
        <div className="pillar-modal-overlay" onClick={() => setEditingPost(null)}>
          <div className="pillar-modal" onClick={e => e.stopPropagation()}>
            <div className="pillar-modal-header">
              <h4>Edit Post</h4>
              <button className="pillar-modal-close" onClick={() => setEditingPost(null)}>&times;</button>
            </div>
            <div className="pillar-modal-body">
              <label>Post Content</label>
              <textarea className="pillar-input" value={editingPost.post_text} onChange={e => setEditingPost(p => ({ ...p, post_text: e.target.value }))} rows={4} style={{ resize: 'vertical' }} />
              <label>Platform</label>
              <select value={editingPost.platform} onChange={e => setEditingPost(p => ({ ...p, platform: e.target.value }))} className="pillar-input">
                <option value="linkedin">LinkedIn</option>
                <option value="twitter">Twitter/X</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
              </select>
              <label>Scheduled At</label>
              <input type="datetime-local" className="pillar-input" value={editingPost.scheduled_at ? (() => { const d = new Date(editingPost.scheduled_at); const offset = d.getTimezoneOffset(); const local = new Date(d.getTime() - offset * 60000); return local.toISOString().slice(0, 16); })() : ''} onChange={e => setEditingPost(p => ({ ...p, scheduled_at: e.target.value }))} />
            </div>
            <div className="pillar-modal-footer">
              <button className="admin-btn" onClick={handleUpdatePost}>Save</button>
              <button className="admin-btn secondary" onClick={() => setEditingPost(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-screen" style={{ minHeight: '30vh' }}>
          <div className="loading-spinner" /><p>Loading schedule...</p>
        </div>
      ) : viewMode === 'calendar' ? (
        /* ═══ CALENDAR VIEW ═══ */
        <div className="calendar-container">
          <div className="calendar-nav">
            <button className="calendar-nav-btn" onClick={prevMonth}>&larr;</button>
            <span className="calendar-month-label">{monthLabel}</span>
            <button className="calendar-nav-btn" onClick={nextMonth}>&rarr;</button>
            <button className="calendar-today-btn" onClick={goToToday}>Today</button>
          </div>

          <p className="calendar-hint">Click a date to view details. Double-click to quick-add a post. Drag posts to reschedule.</p>

          <div className="calendar-grid">
            {DAYS.map(d => <div key={d} className="calendar-day-header">{d}</div>)}
            {calendarDays.map((dayObj, idx) => {
              const dateKey = `${dayObj.year}-${dayObj.month}-${dayObj.day}`;
              const dayPosts = postsByDate[dateKey] || [];
              const isToday = dateKey === todayKey;
              const isSelected = selectedDate && `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}` === dateKey;
              const isDragOver = dragOverDate === dateKey;
              const isQuickAdd = quickAddDate === dateKey;
              const date = new Date(dayObj.year, dayObj.month, dayObj.day);

              return (
                <div
                  key={idx}
                  className={`calendar-cell ${dayObj.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayPosts.length > 0 ? 'has-posts' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  onClick={() => handleCalendarDateClick(date)}
                  onDoubleClick={(e) => handleCellDoubleClick(e, date)}
                  onDragOver={e => { e.preventDefault(); setDragOverDate(dateKey); }}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOverDate(null);
                    if (dragPost) {
                      handleDragReschedule(dragPost, date);
                      setDragPost(null);
                    }
                  }}
                >
                  <div className="calendar-cell-top">
                    <span className="calendar-cell-day">{dayObj.day}</span>
                    {dayPosts.length > 0 && (
                      <span className="calendar-cell-badge">{dayPosts.length}</span>
                    )}
                  </div>

                  {/* Quick-add inline form */}
                  {isQuickAdd && (
                    <div className="calendar-quick-add" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                      <textarea
                        ref={quickAddRef}
                        className="calendar-quick-textarea"
                        value={quickAddText}
                        onChange={e => setQuickAddText(e.target.value)}
                        placeholder="Quick post..."
                        rows={2}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuickAdd(date); }
                          if (e.key === 'Escape') setQuickAddDate(null);
                        }}
                      />
                      <div className="calendar-quick-row">
                        <select value={quickAddPlatform} onChange={e => setQuickAddPlatform(e.target.value)} className="calendar-quick-select">
                          <option value="linkedin">LI</option>
                          <option value="twitter">X</option>
                          <option value="facebook">FB</option>
                          <option value="instagram">IG</option>
                        </select>
                        <button className="calendar-quick-btn" onClick={() => handleQuickAdd(date)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <button className="calendar-quick-btn cancel" onClick={() => setQuickAddDate(null)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {!isQuickAdd && dayPosts.length > 0 && (
                    <div className="calendar-cell-posts">
                      {dayPosts.slice(0, 3).map((post, i) => (
                        <div
                          key={post.id || i}
                          className="calendar-post-chip"
                          style={{ borderLeftColor: PLATFORM_COLORS[post.platform] || '#94a3b8' }}
                          draggable={post.status === 'scheduled'}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDragPost(post.id);
                          }}
                          onDragEnd={() => setDragPost(null)}
                          onClick={e => { e.stopPropagation(); setEditingPost({ ...post }); }}
                          title={`${post.platform} - ${formatTime(post.scheduled_at)} - ${post.status}\n${post.post_text.slice(0, 80)}`}
                        >
                          <span className="calendar-chip-status" style={{ color: getStatusColor(post.status) }}>{getStatusIcon(post.status)}</span>
                          <span className="calendar-chip-label">{PLATFORM_LABELS[post.platform]}</span>
                          <span className="calendar-chip-time">{formatTime(post.scheduled_at)}</span>
                        </div>
                      ))}
                      {dayPosts.length > 3 && (
                        <span className="calendar-post-more" onClick={e => { e.stopPropagation(); setExpandedCell(expandedCell === dateKey ? null : dateKey); }}>
                          +{dayPosts.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected date detail panel */}
          {selectedDate && (
            <div className="calendar-detail-panel">
              <div className="calendar-detail-header">
                <h4>{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h4>
                <span className="calendar-detail-count">{selectedDatePosts.length} post{selectedDatePosts.length !== 1 ? 's' : ''}</span>
                <button className="admin-btn-sm" onClick={() => { const dateKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`; setQuickAddDate(dateKey); }} style={{ marginLeft: 'auto' }}>
                  + Quick Add
                </button>
                <button className="calendar-detail-close" onClick={() => setSelectedDate(null)}>&times;</button>
              </div>

              {selectedDatePosts.length === 0 ? (
                <div className="calendar-detail-empty">
                  No posts scheduled for this date.
                  <button className="admin-btn-sm" onClick={() => setShowNewPost(true)} style={{ marginLeft: '0.5rem' }}>Schedule one</button>
                </div>
              ) : (
                <div className="calendar-detail-posts">
                  {selectedDatePosts.map(post => (
                    <div key={post.id} className="calendar-detail-post" draggable={post.status === 'scheduled'}
                      onDragStart={() => setDragPost(post.id)} onDragEnd={() => setDragPost(null)}>
                      <div className="calendar-detail-post-header">
                        <span className="schedule-status-badge" style={{ background: getStatusColor(post.status) + '22', color: getStatusColor(post.status), borderColor: getStatusColor(post.status) + '44' }}>
                          {getStatusIcon(post.status)} {post.status}
                        </span>
                        <span className="calendar-detail-platform" style={{ color: PLATFORM_COLORS[post.platform] }}>{post.platform}</span>
                        <span className="calendar-detail-time">{formatTime(post.scheduled_at)}</span>
                        {post.is_boosted && <span className="schedule-boosted">Boosted</span>}
                      </div>
                      <p className="calendar-detail-text">{post.post_text}</p>
                      <div className="schedule-post-actions">
                        {post.status === 'scheduled' && (
                          <>
                            <button className="admin-btn-sm" onClick={() => setEditingPost({ ...post })}>Edit</button>
                            <button className="admin-btn-sm" onClick={() => handlePostNow(post.id)}>Post Now</button>
                            <button className="admin-btn-sm danger" onClick={() => handleDelete(post.id)}>Delete</button>
                          </>
                        )}
                        {post.status === 'posted' && post.external_post_url && (
                          <a href={post.external_post_url} target="_blank" rel="noopener noreferrer" className="admin-btn-sm">View Post</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ═══ LIST VIEW ═══ */
        posts.length === 0 ? (
          <div className="admin-empty">
            {statusFilter ? 'No posts match this filter.' : 'No scheduled posts yet. Create a post above or schedule from the Create view.'}
          </div>
        ) : (
          <div className="schedule-list">
            {Object.entries(groupedPosts).map(([date, datePosts]) => (
              <div key={date} className="schedule-day-group">
                <div className="schedule-day-label">{date}</div>
                {datePosts.map(post => (
                  <div key={post.id} className="schedule-post-card">
                    <div className="schedule-post-header">
                      <div className="schedule-post-meta">
                        <span className="schedule-status-badge" style={{ background: getStatusColor(post.status) + '22', color: getStatusColor(post.status), borderColor: getStatusColor(post.status) + '44' }}>
                          {getStatusIcon(post.status)} {post.status}
                        </span>
                        <span className="schedule-platform" style={{ color: PLATFORM_COLORS[post.platform] }}>{post.platform}</span>
                        <span className="schedule-time">{formatDate(post.scheduled_at)}</span>
                        {post.is_boosted && <span className="schedule-boosted">Boosted{post.boost_spend ? ` $${post.boost_spend}` : ''}</span>}
                      </div>
                    </div>
                    <p className="schedule-post-text">{post.post_text}</p>
                    {post.users && <div className="schedule-post-author">By {post.users.full_name || post.users.email}</div>}
                    <div className="schedule-post-actions">
                      {post.status === 'scheduled' && (
                        <>
                          <button className="admin-btn-sm" onClick={() => setEditingPost({ ...post })}>Edit</button>
                          <button className="admin-btn-sm" onClick={() => handlePostNow(post.id)}>Post Now</button>
                          <button className="admin-btn-sm danger" onClick={() => handleDelete(post.id)}>Delete</button>
                        </>
                      )}
                      {post.status === 'posted' && post.external_post_url && (
                        <a href={post.external_post_url} target="_blank" rel="noopener noreferrer" className="admin-btn-sm">View Post</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
