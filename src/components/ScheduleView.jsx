import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './AuthProvider';
import CampaignPlanner from './CampaignPlanner';
import SchedulePostModal from './SchedulePostModal';
import { StatCard } from './ui/stat-card';
import { Tabs } from './ui/tabs';
import { RailPanel, EmptyPanel } from './ui/empty-panel';

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

const PLATFORM_ICONS = {
  linkedin: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  twitter: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  facebook: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  instagram: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/></svg>,
};

const PLATFORM_LABELS = {
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const Icons = {
  health: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  alert: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  bulb: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z"/></svg>,
};

export default function ScheduleView() {
  const { getAuthHeaders } = useAuth();
  const [posts, setPosts] = useState([]);
  const [reusePool, setReusePool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [viewMode, setViewMode] = useState('calendar');
  const [calendarMode, setCalendarMode] = useState('month'); // 'month' | 'week'
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const [showPostModal, setShowPostModal] = useState(false);
  const [modalInitialDate, setModalInitialDate] = useState(null);
  const [modalInitialText, setModalInitialText] = useState('');
  const [showCampaignPlanner, setShowCampaignPlanner] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dragPost, setDragPost] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [expandedCell, setExpandedCell] = useState(null);

  const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

  useEffect(() => { loadPosts(); }, [statusFilter]);
  useEffect(() => { loadReusePool(); }, []);

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

  const loadReusePool = async () => {
    try {
      const res = await fetch('/api/content?pinned=true&limit=4', { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setReusePool(data.content || []);
    } catch { /* silent */ }
  };

  const openNewPostModal = (date, text) => {
    setModalInitialDate(date || null);
    setModalInitialText(text || '');
    setEditingPost(null);
    setShowPostModal(true);
  };

  const openEditModal = (post) => {
    setEditingPost(post);
    setModalInitialDate(null);
    setModalInitialText('');
    setShowPostModal(true);
  };

  const handleModalClose = () => {
    setShowPostModal(false);
    setEditingPost(null);
    setModalInitialDate(null);
    setModalInitialText('');
  };

  const handleModalCreated = () => {
    loadPosts();
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

  const handleRetry = async (id) => {
    try {
      const res = await fetch(`/api/schedule/${id}/retry`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) {
        setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'posting', error_message: null } : p));
      } else {
        setError(data.error || 'Failed to retry post');
      }
    } catch {
      setError('Failed to retry post');
    }
  };

  const handleCalendarDateClick = (date) => {
    setSelectedDate(date);
  };

  const handleCellDoubleClick = (e, date) => {
    e.stopPropagation();
    openNewPostModal(date);
  };

  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const formatDate = (dateStr) => new Date(dateStr).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Calendar data — month view
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

  // Calendar data — week view
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push({ day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), isCurrentMonth: true, date: d });
    }
    return days;
  }, [currentWeekStart]);

  const postsByDate = useMemo(() => {
    const map = {};
    let filteredPosts = posts;
    if (platformFilter) filteredPosts = posts.filter(p => p.platform === platformFilter);
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
  const prevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };
  const goToToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    const day = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - day);
    start.setHours(0, 0, 0, 0);
    setCurrentWeekStart(start);
    setSelectedDate(today);
  };

  const monthLabel = currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const weekLabel = (() => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    const startMonth = currentWeekStart.toLocaleString(undefined, { month: 'short' });
    const endMonth = end.toLocaleString(undefined, { month: 'short' });
    if (startMonth === endMonth) {
      return `${startMonth} ${currentWeekStart.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${startMonth} ${currentWeekStart.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  })();

  const displayPosts = platformFilter ? posts.filter(p => p.platform === platformFilter) : posts;
  const groupedPosts = displayPosts.reduce((acc, post) => {
    const date = new Date(post.scheduled_at).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  const selectedDateKey = selectedDate ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}` : null;
  const selectedDatePosts = selectedDateKey ? (postsByDate[selectedDateKey] || []) : [];

  const stats = useMemo(() => {
    const scheduled = posts.filter(p => p.status === 'scheduled').length;
    const posted = posts.filter(p => p.status === 'posted').length;
    const failed = posts.filter(p => p.status === 'failed').length;
    const total = posted + failed;
    const healthPct = total > 0 ? Math.round((posted / total) * 100) : null;
    let healthLabel;
    if (healthPct === null) healthLabel = 'No data';
    else if (healthPct >= 90) healthLabel = 'Excellent';
    else if (healthPct >= 70) healthLabel = 'Good';
    else if (healthPct >= 50) healthLabel = 'Fair';
    else healthLabel = 'Needs work';
    const lastPosted = posts.filter(p => p.status === 'posted').map(p => new Date(p.scheduled_at)).sort((a, b) => b - a)[0];
    let gapDays = null;
    if (lastPosted) gapDays = Math.floor((new Date() - lastPosted) / 86400000);
    return { scheduled, posted, failed, healthLabel, gapDays };
  }, [posts]);

  const statusColor = (status) => ({
    scheduled: '#3b82f6', posting: '#0da2e7', posted: '#22c55e', failed: '#ef4444',
  }[status] || '#94a3b8');

  const statusIcon = (status) => {
    switch (status) {
      case 'scheduled': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
      case 'posting': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
      case 'posted': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>;
      case 'failed': return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
      default: return null;
    }
  };

  /* ─── Reusable: render a single calendar cell ─── */
  const renderCalendarCell = (dayObj, idx, isWeekView) => {
    const dateKey = `${dayObj.year}-${dayObj.month}-${dayObj.day}`;
    const dayPosts = postsByDate[dateKey] || [];
    const isToday = dateKey === todayKey;
    const isSelected = selectedDateKey === dateKey;
    const isDragOver = dragOverDate === dateKey;
    const date = new Date(dayObj.year, dayObj.month, dayObj.day);
    const maxVisible = isWeekView ? 6 : 3;

    return (
      <div
        key={idx}
        className={`sched-cell group ${isWeekView ? 'sched-cell--week' : ''} ${
          dayObj.isCurrentMonth ? '' : 'sched-cell--muted'
        } ${isToday ? 'sched-cell--today' : ''} ${isSelected ? 'sched-cell--selected' : ''} ${isDragOver ? 'sched-cell--dragover' : ''}`}
        onClick={() => handleCalendarDateClick(date)}
        onDoubleClick={(e) => handleCellDoubleClick(e, date)}
        onDragOver={e => { e.preventDefault(); setDragOverDate(dateKey); }}
        onDragLeave={() => setDragOverDate(null)}
        onDrop={e => { e.preventDefault(); setDragOverDate(null); if (dragPost) { handleDragReschedule(dragPost, date); setDragPost(null); } }}
      >
        {/* Day header */}
        <div className="sched-cell__header">
          <span className={`sched-cell__day ${isToday ? 'sched-cell__day--today' : ''}`}>
            {isWeekView ? (
              <>
                <span className="sched-cell__weekday">{DAYS[date.getDay()]}</span>
                {dayObj.day}
              </>
            ) : dayObj.day}
          </span>
          {dayPosts.length > 0 && (
            <span className="sched-cell__count">{dayPosts.length}</span>
          )}
        </div>

        {/* Post chips */}
        <div className="sched-cell__posts">
            {dayPosts.slice(0, maxVisible).map((post, i) => (
              <div
                key={post.id || i}
                className="sched-chip"
                style={{ '--chip-color': PLATFORM_COLORS[post.platform] || '#94a3b8' }}
                draggable={post.status === 'scheduled'}
                onDragStart={(e) => { e.stopPropagation(); setDragPost(post.id); }}
                onDragEnd={() => setDragPost(null)}
                onClick={e => { e.stopPropagation(); openEditModal({ ...post }); }}
                title={`${post.platform} – ${formatTime(post.scheduled_at)} – ${post.status}\n${post.post_text.slice(0, 100)}`}
              >
                <span className="sched-chip__dot" />
                <span className="sched-chip__platform">{PLATFORM_LABELS[post.platform]}</span>
                {isWeekView && <span className="sched-chip__time">{formatTime(post.scheduled_at)}</span>}
                <span className="sched-chip__text">{post.post_text.slice(0, isWeekView ? 40 : 22)}</span>
              </div>
            ))}
            {dayPosts.length > maxVisible && (
              <span
                className="sched-cell__more"
                onClick={e => { e.stopPropagation(); setExpandedCell(expandedCell === dateKey ? null : dateKey); }}
              >
                +{dayPosts.length - maxVisible} more
              </span>
            )}
            {dayPosts.length === 0 && dayObj.isCurrentMonth && (
              <button
                className="sched-cell__add"
                onClick={e => { e.stopPropagation(); handleCellDoubleClick(e, date); }}
              >
                + Add
              </button>
            )}
          </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[22px] font-semibold text-[var(--text)] tracking-tight">Post Schedule</h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">Plan, organize, and grow your content with purpose.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            items={[{ value: 'calendar', label: 'Calendar' }, { value: 'list', label: 'List' }]}
            value={viewMode}
            onChange={setViewMode}
          />
          <button
            className="px-3 py-2 text-[13px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors"
            onClick={() => setShowCampaignPlanner(!showCampaignPlanner)}
          >
            {showCampaignPlanner ? 'Hide Planner' : 'Campaign Planner'}
          </button>
          <button
            className="px-4 py-2 text-[13px] font-semibold rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] transition-colors shadow-sm"
            onClick={() => openNewPostModal()}
          >
            + New Post
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <StatCard tone="green" icon={Icons.health} label="Content Health" value={stats.healthLabel} subtext="You're keeping the momentum going." />
        <StatCard tone="amber" icon={Icons.star} label="Top Performer" value="Hot Takes" trend={{ value: '25%', dir: 'up' }} subtext="Above your average" />
        <StatCard tone="blue" icon={Icons.clock} label="Posting Gap" value={stats.gapDays === null ? '7 days' : `${stats.gapDays} day${stats.gapDays === 1 ? '' : 's'}`} subtext="Since your last post" />
        <StatCard tone="red" icon={Icons.alert} label="Needs Attention" value={`${stats.failed} failed post${stats.failed === 1 ? '' : 's'}`} subtext="Review and try to improve delivery" />
        <StatCard tone="purple" icon={Icons.bulb} label="Suggestion" value="Post 1 Educational" subtext="+1 Contrarian this week" />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-[13px] rounded-md flex items-center justify-between">
          {error}
          <button className="text-[var(--danger)] underline text-xs" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {showCampaignPlanner && <CampaignPlanner onClose={() => setShowCampaignPlanner(false)} />}

      {/* Filters row */}
      <div className="flex items-center flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(s => (
          <button
            key={s.value || 'all'}
            onClick={() => setStatusFilter(s.value)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors ${
              statusFilter === s.value
                ? 'bg-[var(--text)] text-[var(--bg-card)] border-[var(--text)]'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="w-px h-5 bg-[var(--border)] mx-1" />
        <button
          className={`px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors ${
            platformFilter === '' ? 'bg-[var(--text)] text-[var(--bg-card)] border-[var(--text)]' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text)]'
          }`}
          onClick={() => setPlatformFilter('')}
        >All</button>
        {Object.entries(PLATFORM_ICONS).map(([key, icon]) => (
          <button
            key={key}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors"
            style={platformFilter === key ? { background: PLATFORM_COLORS[key], color: '#fff', borderColor: PLATFORM_COLORS[key] } : { color: PLATFORM_COLORS[key] }}
            onClick={() => setPlatformFilter(prev => prev === key ? '' : key)}
            title={PLATFORM_LABELS[key]}
          >{icon}</button>
        ))}

        <div className="flex-1" />

        {/* Week / Month toggle — now functional */}
        <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${calendarMode === 'week' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
            onClick={() => setCalendarMode('week')}
          >Week</button>
          <button
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors border-l border-[var(--border)] ${calendarMode === 'month' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)]'}`}
            onClick={() => setCalendarMode('month')}
          >Month</button>
        </div>

        <button
          className="w-8 h-8 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center"
          onClick={calendarMode === 'month' ? prevMonth : prevWeek}
        >←</button>
        <button
          className="w-8 h-8 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center"
          onClick={calendarMode === 'month' ? nextMonth : nextWeek}
        >→</button>
        <button
          className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] hover:bg-[var(--bg-card-hover)]"
          onClick={goToToday}
        >Today</button>
      </div>

      {/* ═══ SCHEDULE POST MODAL ═══ */}
      {showPostModal && (
        <SchedulePostModal
          onClose={handleModalClose}
          onCreated={handleModalCreated}
          initialDate={modalInitialDate}
          initialText={modalInitialText}
          editingPost={editingPost}
        />
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="loading-spinner" />
          <p className="text-[13px] text-[var(--text-secondary)] mt-3">Loading schedule...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
          {/* ═══ MAIN COLUMN ═══ */}
          <div className="min-w-0">
            {viewMode === 'calendar' ? (
              <div className="sched-calendar">
                {/* Calendar header */}
                <div className="sched-calendar__header">
                  <span className="sched-calendar__title">
                    {calendarMode === 'month' ? monthLabel : weekLabel}
                  </span>
                </div>

                {/* Day headers */}
                <div className={`sched-grid ${calendarMode === 'week' ? 'sched-grid--week' : ''}`}>
                  {DAYS.map(d => (
                    <div key={d} className="sched-grid__dayname">{d}</div>
                  ))}

                  {/* Calendar cells */}
                  {calendarMode === 'month'
                    ? calendarDays.map((dayObj, idx) => renderCalendarCell(dayObj, idx, false))
                    : weekDays.map((dayObj, idx) => renderCalendarCell(dayObj, idx, true))
                  }
                </div>

                {/* Legend */}
                <div className="sched-legend">
                  {[
                    { label: 'Hot Take', color: '#ef4444' },
                    { label: 'Educational', color: '#3b82f6' },
                    { label: 'Question', color: '#f59f0a' },
                    { label: 'Contrarian', color: '#8b5cf6' },
                    { label: 'Case Study', color: '#10b981' },
                    { label: 'Story', color: '#ec4899' },
                    { label: 'Empty Slot', color: '#94a3b8' },
                  ].map(c => (
                    <div key={c.label} className="sched-legend__item">
                      <span className="sched-legend__dot" style={{ background: c.color }} />
                      {c.label}
                    </div>
                  ))}
                </div>

                {/* Selected date detail */}
                {selectedDate && (
                  <div className="sched-detail">
                    <div className="sched-detail__header">
                      <h4 className="sched-detail__title">
                        {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </h4>
                      <span className="sched-detail__count">{selectedDatePosts.length} post{selectedDatePosts.length !== 1 ? 's' : ''}</span>
                      <button className="sched-detail__quickadd" onClick={() => { const dk = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`; setQuickAddDate(dk); }}>+ Quick Add</button>
                      <button className="sched-detail__close" onClick={() => setSelectedDate(null)}>×</button>
                    </div>

                    {selectedDatePosts.length === 0 ? (
                      <div className="sched-detail__empty">
                        No posts scheduled for this date.{' '}
                        <button className="text-[var(--primary)] underline" onClick={() => openNewPostModal(selectedDate)}>Schedule one</button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedDatePosts.map(post => (
                          <div key={post.id} className="sched-detail__post">
                            <div className="sched-detail__post-meta">
                              <span className="sched-detail__status" style={{ '--status-color': statusColor(post.status) }}>
                                {statusIcon(post.status)} {post.status}
                              </span>
                              <span className="font-semibold" style={{ color: PLATFORM_COLORS[post.platform] }}>{PLATFORM_LABELS[post.platform]}</span>
                              <span className="text-[var(--text-secondary)]">{formatTime(post.scheduled_at)}</span>
                              {post.is_boosted && <span className="text-[11px] font-semibold text-[var(--warning)] uppercase">Boosted</span>}
                            </div>
                            <p className="sched-detail__post-text">{post.post_text}</p>
                            {post.status === 'failed' && post.error_message && (
                              <div className="text-[12px] text-[var(--danger)] mb-2">{post.error_message}</div>
                            )}
                            <div className="flex gap-2 flex-wrap">
                              {post.status === 'scheduled' && (
                                <>
                                  <button className="sched-action-btn" onClick={() => openEditModal({ ...post })}>Edit</button>
                                  <button className="sched-action-btn" onClick={() => handlePostNow(post.id)}>Post Now</button>
                                  <button className="sched-action-btn sched-action-btn--danger" onClick={() => handleDelete(post.id)}>Delete</button>
                                </>
                              )}
                              {post.status === 'failed' && (
                                <>
                                  <button className="sched-action-btn" onClick={() => handleRetry(post.id)}>Retry</button>
                                  <button className="sched-action-btn" onClick={() => openEditModal({ ...post })}>Edit</button>
                                  <button className="sched-action-btn sched-action-btn--danger" onClick={() => handleDelete(post.id)}>Delete</button>
                                </>
                              )}
                              {post.status === 'posted' && post.external_post_url && (
                                <a href={post.external_post_url} target="_blank" rel="noopener noreferrer" className="sched-action-btn">View Post</a>
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
              displayPosts.length === 0 ? (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm py-16 text-center text-[var(--text-secondary)] text-[14px]">
                  {statusFilter || platformFilter ? 'No posts match this filter.' : 'No scheduled posts yet.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedPosts).map(([date, datePosts]) => (
                    <div key={date} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
                      <div className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">{date}</div>
                      <div className="space-y-3">
                        {datePosts.map(post => (
                          <div key={post.id} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-raised)]">
                            <div className="flex items-center gap-2 flex-wrap mb-2 text-[13px]">
                              <span className="sched-detail__status" style={{ '--status-color': statusColor(post.status) }}>
                                {statusIcon(post.status)} {post.status}
                              </span>
                              <span className="font-semibold" style={{ color: PLATFORM_COLORS[post.platform] }}>{PLATFORM_LABELS[post.platform]}</span>
                              <span className="text-[var(--text-secondary)]">{formatDate(post.scheduled_at)}</span>
                              {post.is_boosted && <span className="text-[11px] font-semibold text-[var(--warning)] uppercase">Boosted{post.boost_spend ? ` $${post.boost_spend}` : ''}</span>}
                            </div>
                            <p className="text-[14px] text-[var(--text)] whitespace-pre-wrap mb-3">{post.post_text}</p>
                            {post.users && <div className="text-[12px] text-[var(--text-secondary)] mb-2">By {post.users.full_name || post.users.email}</div>}
                            {post.status === 'failed' && post.error_message && <div className="text-[12px] text-[var(--danger)] mb-2">{post.error_message}</div>}
                            <div className="flex gap-2 flex-wrap">
                              {post.status === 'scheduled' && (
                                <>
                                  <button className="sched-action-btn" onClick={() => openEditModal({ ...post })}>Edit</button>
                                  <button className="sched-action-btn" onClick={() => handlePostNow(post.id)}>Post Now</button>
                                  <button className="sched-action-btn sched-action-btn--danger" onClick={() => handleDelete(post.id)}>Delete</button>
                                </>
                              )}
                              {post.status === 'failed' && (
                                <>
                                  <button className="sched-action-btn" onClick={() => handleRetry(post.id)}>Retry</button>
                                  <button className="sched-action-btn" onClick={() => openEditModal({ ...post })}>Edit</button>
                                  <button className="sched-action-btn sched-action-btn--danger" onClick={() => handleDelete(post.id)}>Delete</button>
                                </>
                              )}
                              {post.status === 'posted' && post.external_post_url && (
                                <a href={post.external_post_url} target="_blank" rel="noopener noreferrer" className="sched-action-btn">View Post</a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* ═══ RIGHT RAIL ═══ */}
          <div className="space-y-4">
            <RailPanel
              title="Reuse Content"
            >
              {reusePool.length === 0 ? (
                <div className="p-4 rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-raised)] text-center">
                  <p className="text-[12px] text-[var(--text-secondary)] mb-1">No content to reuse yet.</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">Pin your best-performing posts from the History tab to see them here.</p>
                </div>
              ) : (
                reusePool.map(item => (
                  <div
                    key={item.id}
                    className="p-3 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] hover:border-[var(--primary)] cursor-pointer transition-colors"
                    onClick={() => openNewPostModal(null, item.body || item.title || '')}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-semibold uppercase text-[var(--primary)]">{item.content_type || 'post'}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[var(--text)] line-clamp-2 mb-1">{item.title || (item.body || '').slice(0, 80)}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Pinned · {new Date(item.created_at).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </RailPanel>

            <RailPanel
              title="Suggested Ideas"
              action={<span className="text-[10px] text-[var(--text-secondary)]">AI-powered ideas for your posts</span>}
            >
              {[
                { tag: 'Hot Take', color: '#ef4444', title: 'AI is making average people look like experts' },
                { tag: 'Educational', color: '#3b82f6', title: 'How to build a daily AI habit that sticks' },
                { tag: 'Question', color: '#f59f0a', title: 'What\'s your biggest struggle with using AI right now?' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] hover:border-[var(--primary)] cursor-pointer transition-colors"
                  onClick={() => openNewPostModal(null, item.title)}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />
                    <span className="text-[10px] font-semibold uppercase" style={{ color: item.color }}>{item.tag}</span>
                  </div>
                  <div className="text-[12px] font-medium text-[var(--text)] line-clamp-2">{item.title}</div>
                </div>
              ))}
              <button
                className="w-full mt-2 px-3 py-2 text-[12px] font-medium text-[var(--primary)] border border-[var(--primary)]/30 rounded-md hover:bg-[var(--primary-glow)]"
                onClick={() => window.location.hash = '#create'}
              >
                Generate More Ideas
              </button>
            </RailPanel>
          </div>
        </div>
      )}
    </div>
  );
}
