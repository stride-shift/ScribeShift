import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { StatCard } from './ui/stat-card';
import { Tabs } from './ui/tabs';
import { RailPanel, EmptyPanel } from './ui/empty-panel';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const SORT_OPTIONS = [
  { value: 'reactions', label: 'Reactions' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'engagement_rate', label: 'Engagement Rate' },
];

const PLATFORM_COLORS = {
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  facebook: '#1877F2',
  instagram: '#E4405F',
};

const Icons = {
  doc: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  eye: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  heart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  rate: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  comment: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  share: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
};

function formatNumber(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

export default function AnalyticsDashboard() {
  const { getAuthHeaders } = useAuth();
  const [summary, setSummary] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('reactions');
  const [filterBoosted, setFilterBoosted] = useState('');
  const [tab, setTab] = useState('overview');

  const authHeaders = getAuthHeaders();

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadMetrics(); }, [sortBy, filterBoosted]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, comparisonRes, metricsRes] = await Promise.all([
        fetch('/api/metrics/summary', { headers: authHeaders }),
        fetch('/api/metrics/boosted-vs-organic', { headers: authHeaders }),
        fetch(`/api/metrics/posts?sort_by=${sortBy}&order=desc`, { headers: authHeaders }),
      ]);
      const summaryData = await summaryRes.json();
      const comparisonData = await comparisonRes.json();
      const metricsData = await metricsRes.json();
      if (summaryData.summary) setSummary(summaryData.summary);
      if (comparisonData.organic) setComparison(comparisonData);
      if (metricsData.metrics) setMetrics(metricsData.metrics);
    } catch {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const params = new URLSearchParams({ sort_by: sortBy, order: 'desc' });
      if (filterBoosted) params.set('is_boosted', filterBoosted);
      const res = await fetch(`/api/metrics/posts?${params}`, { headers: authHeaders });
      const data = await res.json();
      if (data.metrics) setMetrics(data.metrics);
    } catch {
      // silent on filter update
    }
  };

  const hasData = summary && summary.total_posts > 0;

  // Build time series from metrics (grouped by date)
  const timeSeries = useMemo(() => {
    if (!metrics.length) return [];
    const map = {};
    metrics.forEach(m => {
      const dateStr = m.scheduled_posts?.scheduled_at;
      if (!dateStr) return;
      const d = new Date(dateStr);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!map[key]) {
        map[key] = { date: key, timestamp: d.getTime(), impressions: 0, engagement: 0, clicks: 0, count: 0 };
      }
      map[key].impressions += m.impressions || 0;
      map[key].clicks += m.clicks || 0;
      map[key].engagement += m.engagement_rate || 0;
      map[key].count += 1;
    });
    return Object.values(map)
      .map(row => ({ ...row, engagement: row.count > 0 ? +(row.engagement / row.count).toFixed(2) : 0 }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [metrics]);

  // Content type breakdown
  const typeBreakdown = useMemo(() => {
    if (!metrics.length) return [];
    const counts = {};
    metrics.forEach(m => {
      const p = m.platform || m.scheduled_posts?.platform || 'other';
      counts[p] = (counts[p] || 0) + 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts).map(([key, count]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: PLATFORM_COLORS[key] || '#64748b',
    }));
  }, [metrics]);

  // Platform bar data
  const platformBars = useMemo(() => {
    if (!metrics.length) return [];
    const map = {};
    metrics.forEach(m => {
      const p = m.platform || m.scheduled_posts?.platform || 'other';
      if (!map[p]) map[p] = { platform: p, impressions: 0, engagement: 0, count: 0 };
      map[p].impressions += m.impressions || 0;
      map[p].engagement += m.engagement_rate || 0;
      map[p].count += 1;
    });
    return Object.values(map).map(row => ({
      ...row,
      name: row.platform.charAt(0).toUpperCase() + row.platform.slice(1),
      engagement: row.count > 0 ? +(row.engagement / row.count).toFixed(2) : 0,
    }));
  }, [metrics]);

  // Top performing posts
  const topPosts = useMemo(() => {
    return [...metrics]
      .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
      .slice(0, 3);
  }, [metrics]);

  // Right-rail insights derived from real data
  const insights = useMemo(() => {
    if (!platformBars.length) return [];
    const top = [...platformBars].sort((a, b) => b.engagement - a.engagement)[0];
    const bot = [...platformBars].sort((a, b) => a.engagement - b.engagement)[0];
    const arr = [];
    if (top) arr.push({ kind: 'up', text: `${top.name} is your highest engagement channel — ${top.engagement}% avg.` });
    if (bot && bot !== top) arr.push({ kind: 'down', text: `${bot.name} could use more attention (${bot.engagement}% avg).` });
    if (summary?.avg_engagement_rate >= 3) {
      arr.push({ kind: 'up', text: `Strong overall engagement at ${summary.avg_engagement_rate}%.` });
    }
    return arr;
  }, [platformBars, summary]);

  if (loading) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="loading-spinner" />
          <p className="text-[13px] text-[var(--text-secondary)] mt-3">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-[22px] font-semibold text-[var(--text)] tracking-tight">Performance Analytics</h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            Track engagement metrics and turn data into better content.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 text-[12px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Apr 1 – Apr 30, 2026
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button className="px-3 py-2 text-[13px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] hover:bg-[var(--bg-card-hover)] flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-[13px] rounded-md">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard
          tone="blue"
          icon={Icons.doc}
          label="Posts Tracked"
          value={formatNumber(summary?.total_posts || 24)}
          trend={{ value: '26%', dir: 'up' }}
          subtext="vs last 30 days"
        />
        <StatCard
          tone="purple"
          icon={Icons.eye}
          label="Impressions"
          value={formatNumber(summary?.total_impressions || 123500)}
          trend={{ value: '12%', dir: 'up' }}
          subtext="vs last 30 days"
        />
        <StatCard
          tone="pink"
          icon={Icons.heart}
          label="Engagements"
          value={formatNumber((summary?.total_reactions || 0) + (summary?.total_comments || 0) + (summary?.total_shares || 0) || 7800)}
          trend={{ value: '34%', dir: 'up' }}
          subtext="vs last 30 days"
        />
        <StatCard
          tone="green"
          icon={Icons.rate}
          label="Avg Engagement Rate"
          value={summary ? `${summary.avg_engagement_rate || 6.3}%` : '6.3%'}
          trend={{ value: '8%', dir: 'up' }}
          subtext="vs last 30 days"
        />
        <StatCard
          tone="amber"
          icon={Icons.comment}
          label="Comments"
          value={formatNumber(summary?.total_comments || 1200)}
          trend={{ value: '15%', dir: 'up' }}
          subtext="vs last 30 days"
        />
        <StatCard
          tone="slate"
          icon={Icons.share}
          label="Shares"
          value={formatNumber(summary?.total_shares || 842)}
          trend={{ value: '5%', dir: 'up' }}
          subtext="vs last 30 days"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <Tabs
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'posts', label: 'Post Performance' },
            { value: 'types', label: 'Content Types' },
            { value: 'platforms', label: 'Platforms' },
            { value: 'compare', label: 'Boosted vs Organic' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Main grid: content + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
        <div className="min-w-0 space-y-5">
          {tab === 'overview' && (
            <>
              {!hasData && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--primary-glow)] text-[var(--primary)] mb-4">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>
                    </div>
                    <h3 className="text-[18px] font-semibold text-[var(--text)] mb-2">
                      Your insights start with your first post
                    </h3>
                    <p className="text-[13px] text-[var(--text-secondary)] mb-5 leading-relaxed">
                      Publish and engage with your audience using our powerful analytics.
                      Once you have data, you&apos;ll see what&apos;s working, how to improve, and how to grow faster.
                    </p>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 text-[13px] font-semibold rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] shadow-sm">
                        Create Your First Post
                      </button>
                      <button className="px-4 py-2 text-[13px] font-medium rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] hover:bg-[var(--bg-card-hover)]">
                        Plan My Work
                      </button>
                    </div>
                  </div>
                  <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-md p-5">
                    <div className="text-[13px] font-semibold text-[var(--text)] mb-3">How it works</div>
                    <ol className="space-y-3">
                      {[
                        { n: 1, t: 'Create or schedule a post' },
                        { n: 2, t: 'Publish and get engagement' },
                        { n: 3, t: 'See your insights here' },
                      ].map(s => (
                        <li key={s.n} className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--primary)] text-white text-[11px] font-bold flex items-center justify-center">
                            {s.n}
                          </span>
                          <span className="text-[13px] text-[var(--text)] pt-0.5">{s.t}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* Performance at a glance: 3 line charts */}
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[var(--text)]">Performance at a Glance</h3>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                      {hasData ? 'Data grouped by post date.' : 'This is example data. Your actual data appears after your first post.'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <MiniLineChart title="Impressions" color="#3b82f6" data={timeSeries} dataKey="impressions" total={summary?.total_impressions || 0} hasData={hasData} />
                  <MiniLineChart title="Engagement Rate" color="#10b981" data={timeSeries} dataKey="engagement" total={summary ? `${summary.avg_engagement_rate || 0}%` : '—'} hasData={hasData} suffix="%" />
                  <MiniLineChart title="Profile Clicks" color="#8b5cf6" data={timeSeries} dataKey="clicks" total={formatNumber(metrics.reduce((s, m) => s + (m.clicks || 0), 0))} hasData={hasData} />
                </div>
              </div>

              {/* Content Type Breakdown + Top Performing Posts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
                  <h3 className="text-[15px] font-semibold text-[var(--text)] mb-1">Content Type Breakdown</h3>
                  <p className="text-[12px] text-[var(--text-secondary)] mb-3">
                    See which content types resonate with your audience.
                  </p>
                  {typeBreakdown.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-[var(--text-secondary)]">
                      No data yet
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div style={{ width: 140, height: 140 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={typeBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={62}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {typeBreakdown.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {typeBreakdown.map(t => (
                          <div key={t.name} className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                              <span className="text-[var(--text)]">{t.name}</span>
                            </div>
                            <span className="text-[var(--text-secondary)] font-semibold">{t.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
                  <h3 className="text-[15px] font-semibold text-[var(--text)] mb-1">Top Performing Posts</h3>
                  <p className="text-[12px] text-[var(--text-secondary)] mb-3">
                    Your best content, ranked by engagement rate.
                  </p>
                  {topPosts.length === 0 ? (
                    <div className="py-8 text-center text-[13px] text-[var(--text-secondary)]">
                      No posts with metrics yet.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {topPosts.map((m, i) => {
                        const platform = m.platform || m.scheduled_posts?.platform || 'post';
                        return (
                          <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-md border border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                            <div
                              className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ background: PLATFORM_COLORS[platform] || '#64748b' }}
                            >
                              #{i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] text-[var(--text)] line-clamp-2 mb-1">
                                {m.scheduled_posts?.post_text?.slice(0, 100) || 'Post'}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                                <span className="capitalize">{platform}</span>
                                <span>·</span>
                                <span className="font-semibold text-[var(--success)]">
                                  {m.engagement_rate ? `${m.engagement_rate}%` : '—'}
                                </span>
                                {m.is_boosted && (
                                  <span className="text-[10px] font-semibold text-[var(--warning)] uppercase">Boosted</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Post Performance tab */}
          {tab === 'posts' && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <label className="text-[12px] font-medium text-[var(--text-secondary)]">Sort by:</label>
                <select
                  className="px-3 py-1.5 text-[13px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <label className="text-[12px] font-medium text-[var(--text-secondary)] ml-2">Type:</label>
                <select
                  className="px-3 py-1.5 text-[13px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  value={filterBoosted}
                  onChange={e => setFilterBoosted(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="true">Boosted</option>
                  <option value="false">Organic</option>
                </select>
              </div>
              {metrics.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[var(--text-secondary)]">
                  No post metrics available yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-left">
                        <th className="py-2 pr-3 font-semibold">Post</th>
                        <th className="py-2 pr-3 font-semibold">Platform</th>
                        <th className="py-2 pr-3 font-semibold text-right">Impr.</th>
                        <th className="py-2 pr-3 font-semibold text-right">React.</th>
                        <th className="py-2 pr-3 font-semibold text-right">Comm.</th>
                        <th className="py-2 pr-3 font-semibold text-right">Shares</th>
                        <th className="py-2 pr-3 font-semibold text-right">Clicks</th>
                        <th className="py-2 pr-3 font-semibold text-right">Eng.</th>
                        <th className="py-2 pr-3 font-semibold">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map(m => (
                        <tr key={m.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                          <td className="py-2.5 pr-3 text-[var(--text)] max-w-xs truncate">
                            {m.scheduled_posts?.post_text?.slice(0, 60) || '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--text)] capitalize">{m.platform || m.scheduled_posts?.platform || '—'}</td>
                          <td className="py-2.5 pr-3 text-right">{formatNumber(m.impressions || 0)}</td>
                          <td className="py-2.5 pr-3 text-right">{formatNumber(m.reactions || 0)}</td>
                          <td className="py-2.5 pr-3 text-right">{formatNumber(m.comments || 0)}</td>
                          <td className="py-2.5 pr-3 text-right">{formatNumber(m.shares || 0)}</td>
                          <td className="py-2.5 pr-3 text-right">{formatNumber(m.clicks || 0)}</td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-[var(--success)]">
                            {m.engagement_rate ? `${m.engagement_rate}%` : '—'}
                          </td>
                          <td className="py-2.5 pr-3">
                            {m.is_boosted ? (
                              <span className="text-[10px] font-semibold text-[var(--warning)] uppercase">Boosted</span>
                            ) : (
                              <span className="text-[10px] text-[var(--text-secondary)] uppercase">Organic</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Content Types tab */}
          {tab === 'types' && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
              <h3 className="text-[15px] font-semibold text-[var(--text)] mb-3">Content Type Performance</h3>
              {typeBreakdown.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[var(--text-secondary)]">
                  No content types tracked yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={typeBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {typeBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {typeBreakdown.map(t => (
                      <div key={t.name} className="flex items-center justify-between p-3 rounded-md border border-[var(--border)]">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                          <span className="text-[13px] text-[var(--text)]">{t.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-semibold text-[var(--text)]">{t.value} posts</div>
                          <div className="text-[11px] text-[var(--text-secondary)]">{t.pct}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Platforms tab */}
          {tab === 'platforms' && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
              <h3 className="text-[15px] font-semibold text-[var(--text)] mb-3">Platform Performance</h3>
              {platformBars.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[var(--text-secondary)]">
                  No platform data yet.
                </div>
              ) : (
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={platformBars}>
                      <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} />
                      <Tooltip cursor={{ fill: 'var(--bg-card-hover)' }} />
                      <Legend />
                      <Bar dataKey="impressions" fill="#3b82f6" name="Impressions" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="engagement" fill="#10b981" name="Engagement %" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Boosted vs Organic tab */}
          {tab === 'compare' && comparison && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-5">
              <h3 className="text-[15px] font-semibold text-[var(--text)] mb-3">Boosted vs Organic</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ComparisonCard title="Organic" data={comparison.organic} color="#22c55e" />
                <ComparisonCard title="Boosted" data={comparison.boosted} color="#a855f7" />
              </div>
              {comparison.organic.count === 0 && comparison.boosted.count === 0 && (
                <div className="mt-4 py-6 text-center text-[13px] text-[var(--text-secondary)]">
                  No metrics data to compare yet.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <RailPanel title="Insights">
            {insights.length === 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--primary-glow)] text-[var(--primary)] flex items-center justify-center">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div className="text-[12px] font-semibold text-[var(--text)]">No data yet, no problem</div>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mb-3">
                  Here&apos;s what to look for once you have insights:
                </div>
                <ul className="space-y-2 text-[11px] text-[var(--text-secondary)]">
                  <li className="flex items-start gap-1.5">
                    <span className="text-[var(--success)] font-bold">→</span>
                    Which posts get the highest engagement
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-[var(--success)] font-bold">→</span>
                    Questions get more comments
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-[var(--success)] font-bold">→</span>
                    Consistency matters: posting 2-3× per week drives growth
                  </li>
                </ul>
                <button className="mt-3 text-[11px] text-[var(--primary)] hover:underline">
                  Learn more about analytics →
                </button>
              </div>
            ) : (
              insights.map((ins, i) => (
                <div key={i} className="p-3 rounded-md bg-[var(--bg-raised)] border border-[var(--border)]">
                  <div className="flex items-start gap-2">
                    <span className={ins.kind === 'up' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                      {ins.kind === 'up' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
                      )}
                    </span>
                    <div className="text-[12px] text-[var(--text)] flex-1">{ins.text}</div>
                  </div>
                </div>
              ))
            )}
          </RailPanel>

          <RailPanel title="Recommendations">
            <div className="text-[10px] text-[var(--text-secondary)] mb-2">Smart insights to help you grow</div>
            {[
              {
                icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
                tone: '#3b82f6',
                title: 'Post 2 more times this week',
                desc: 'You\'re trending up by +25% this week',
              },
              {
                icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                tone: '#f59f0a',
                title: 'Try a video post',
                desc: 'Videos get 3× more engagement',
              },
              {
                icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
                tone: '#10b981',
                title: 'Revisit top performers',
                desc: '3 posts ready to be reused as carousels',
              },
            ].map((rec, i) => (
              <div key={i} className="p-3 rounded-md bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors">
                <div className="flex items-start gap-2">
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
                    style={{ background: rec.tone + '20', color: rec.tone }}
                  >
                    {rec.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--text)] mb-0.5">{rec.title}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{rec.desc}</div>
                  </div>
                </div>
              </div>
            ))}
            <button className="w-full text-[11px] text-[var(--primary)] hover:underline mt-2">
              View all recommendations →
            </button>
          </RailPanel>
        </div>
      </div>
    </div>
  );
}

function MiniLineChart({ title, color, data, dataKey, total, hasData, suffix = '' }) {
  // Generate synthetic example data if we have none
  const displayData = data.length > 0 ? data : [
    { date: '1', v: 12 }, { date: '2', v: 15 }, { date: '3', v: 10 }, { date: '4', v: 18 },
    { date: '5', v: 22 }, { date: '6', v: 19 }, { date: '7', v: 26 },
  ];
  const key = data.length > 0 ? dataKey : 'v';

  return (
    <div className="rounded-md border border-[var(--border)] p-3 bg-[var(--bg-raised)]">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[11px] text-[var(--text-secondary)]">{title}</div>
          <div className="text-[15px] font-semibold text-[var(--text)]">{total}{suffix && typeof total === 'number' ? suffix : ''}</div>
        </div>
        {!hasData && (
          <span className="text-[9px] uppercase text-[var(--text-secondary)]">Example</span>
        )}
      </div>
      <div style={{ height: 50 }}>
        <ResponsiveContainer>
          <LineChart data={displayData}>
            <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ComparisonCard({ title, data, color }) {
  return (
    <div
      className="rounded-md border p-4"
      style={{ borderColor: color + '44', background: color + '10' }}
    >
      <h4 className="text-[14px] font-semibold mb-2" style={{ color }}>{title}</h4>
      <div className="mb-3">
        <div className="text-[24px] font-bold text-[var(--text)]">{data.count}</div>
        <div className="text-[11px] text-[var(--text-secondary)] uppercase">Posts</div>
      </div>
      <div className="space-y-1 text-[12px] text-[var(--text)]">
        <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Impressions</span><strong>{formatNumber(data.impressions)}</strong></div>
        <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Reactions</span><strong>{formatNumber(data.reactions)}</strong></div>
        <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Comments</span><strong>{formatNumber(data.comments)}</strong></div>
        <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Shares</span><strong>{formatNumber(data.shares)}</strong></div>
        <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Clicks</span><strong>{formatNumber(data.clicks)}</strong></div>
        {data.total_spend > 0 && (
          <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Total Spend</span><strong>${data.total_spend}</strong></div>
        )}
      </div>
    </div>
  );
}
