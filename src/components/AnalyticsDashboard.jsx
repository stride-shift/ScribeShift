import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

const SORT_OPTIONS = [
  { value: 'reactions', label: 'Reactions' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'engagement_rate', label: 'Engagement Rate' },
];

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

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [sortBy, filterBoosted]);

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
      // silently fail on filter update
    }
  };

  const formatNumber = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'posts', label: 'Post Performance' },
    { id: 'compare', label: 'Boosted vs Organic' },
  ];

  if (loading) {
    return (
      <div className="analytics-dashboard">
        <div className="loading-screen" style={{ minHeight: '50vh' }}>
          <div className="loading-spinner" />
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="analytics-header">
        <h2>Performance Analytics</h2>
        <p className="analytics-subtitle">Track engagement metrics across your published posts</p>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="admin-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`admin-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && summary && (
        <div className="analytics-overview">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-value">{formatNumber(summary.total_posts)}</div>
              <div className="admin-stat-label">Posts Tracked</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{formatNumber(summary.total_impressions)}</div>
              <div className="admin-stat-label">Impressions</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{formatNumber(summary.total_reactions)}</div>
              <div className="admin-stat-label">Reactions</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{formatNumber(summary.total_comments)}</div>
              <div className="admin-stat-label">Comments</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{formatNumber(summary.total_shares)}</div>
              <div className="admin-stat-label">Shares</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{summary.avg_engagement_rate}%</div>
              <div className="admin-stat-label">Avg Engagement</div>
            </div>
          </div>

          {/* Top 5 posts */}
          {metrics.length > 0 && (
            <div className="admin-section">
              <h3>Top Performing Posts</h3>
              <div className="analytics-top-posts">
                {metrics.slice(0, 5).map((m, i) => (
                  <div key={m.id} className="analytics-top-card">
                    <span className="analytics-rank">#{i + 1}</span>
                    <div className="analytics-top-content">
                      <p className="analytics-top-text">
                        {m.scheduled_posts?.post_text?.slice(0, 100) || 'Post'}
                        {m.scheduled_posts?.post_text?.length > 100 ? '...' : ''}
                      </p>
                      <div className="analytics-top-stats">
                        <span>{m.reactions || 0} reactions</span>
                        <span>{m.comments || 0} comments</span>
                        <span>{m.shares || 0} shares</span>
                        {m.is_boosted && <span className="schedule-boosted">Boosted</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {metrics.length === 0 && (
            <div className="admin-empty">
              No performance data yet. Metrics will appear here after posts are published and engagement data is collected.
            </div>
          )}
        </div>
      )}

      {/* Post Performance Tab */}
      {tab === 'posts' && (
        <div className="admin-section">
          <div className="analytics-filters">
            <label className="analytics-filter-label">Sort by:</label>
            <select className="admin-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="analytics-filter-label">Type:</label>
            <select className="admin-select" value={filterBoosted} onChange={e => setFilterBoosted(e.target.value)}>
              <option value="">All</option>
              <option value="true">Boosted</option>
              <option value="false">Organic</option>
            </select>
          </div>

          {metrics.length === 0 ? (
            <div className="admin-empty">No post metrics available yet.</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Platform</th>
                    <th>Impressions</th>
                    <th>Reactions</th>
                    <th>Comments</th>
                    <th>Shares</th>
                    <th>Clicks</th>
                    <th>Eng. Rate</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(m => (
                    <tr key={m.id}>
                      <td className="analytics-post-cell">
                        {m.scheduled_posts?.post_text?.slice(0, 60) || '—'}
                        {m.scheduled_posts?.post_text?.length > 60 ? '...' : ''}
                      </td>
                      <td>{m.platform || m.scheduled_posts?.platform || '—'}</td>
                      <td>{formatNumber(m.impressions || 0)}</td>
                      <td>{formatNumber(m.reactions || 0)}</td>
                      <td>{formatNumber(m.comments || 0)}</td>
                      <td>{formatNumber(m.shares || 0)}</td>
                      <td>{formatNumber(m.clicks || 0)}</td>
                      <td>{m.engagement_rate ? `${m.engagement_rate}%` : '—'}</td>
                      <td>{m.is_boosted ? <span className="schedule-boosted">Boosted</span> : <span className="analytics-organic">Organic</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Boosted vs Organic Tab */}
      {tab === 'compare' && comparison && (
        <div className="admin-section">
          <h3>Boosted vs Organic Comparison</h3>
          <div className="analytics-compare-grid">
            <ComparisonCard title="Organic" data={comparison.organic} color="#22c55e" />
            <ComparisonCard title="Boosted" data={comparison.boosted} color="#a855f7" />
          </div>

          {comparison.organic.count === 0 && comparison.boosted.count === 0 && (
            <div className="admin-empty" style={{ marginTop: '1rem' }}>
              No metrics data to compare. Post engagement data will appear here once tracked.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonCard({ title, data, color }) {
  return (
    <div className="analytics-compare-card" style={{ borderColor: color + '44' }}>
      <h4 style={{ color }}>{title}</h4>
      <div className="analytics-compare-stat">
        <span className="analytics-compare-number">{data.count}</span>
        <span className="analytics-compare-label">Posts</span>
      </div>
      <div className="analytics-compare-metrics">
        <div><strong>{data.impressions}</strong> impressions</div>
        <div><strong>{data.reactions}</strong> reactions</div>
        <div><strong>{data.comments}</strong> comments</div>
        <div><strong>{data.shares}</strong> shares</div>
        <div><strong>{data.clicks}</strong> clicks</div>
        {data.total_spend > 0 && <div><strong>${data.total_spend}</strong> total spend</div>}
      </div>
    </div>
  );
}
