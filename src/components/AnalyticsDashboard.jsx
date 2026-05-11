import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { Tabs } from './ui/tabs';
import { StatCard } from './ui/stat-card';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const PLATFORM_LABELS = {
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const PLATFORM_COLORS = {
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  facebook: '#1877F2',
  instagram: '#E4405F',
};

const PLATFORM_ICONS = {
  linkedin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z" />
    </svg>
  ),
  twitter: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  facebook: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  ),
  instagram: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
};

function formatNumber(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function AnalyticsDashboard() {
  const { getAuthHeaders } = useAuth();
  const [tab, setTab] = useState('native');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');

  const [accountOverview, setAccountOverview] = useState({ accounts: [], totals: null });
  const [postSummary, setPostSummary] = useState(null);
  const [posts, setPosts] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [scribeshift, setScribeshift] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    const auth = getAuthHeaders();
    try {
      const [accountsRes, summaryRes, postsRes, compRes, ssRes] = await Promise.all([
        fetch('/api/metrics/account-overview', { headers: auth }),
        fetch('/api/metrics/summary', { headers: auth }),
        fetch('/api/metrics/posts?sort_by=engagement_rate&order=desc&limit=10', { headers: auth }),
        fetch('/api/metrics/boosted-vs-organic', { headers: auth }),
        fetch('/api/metrics/scribeshift-stats?days=30', { headers: auth }),
      ]);
      const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [], totals: {} };
      const summaryData = summaryRes.ok ? await summaryRes.json() : { summary: null };
      const postsData = postsRes.ok ? await postsRes.json() : { metrics: [] };
      const compData = compRes.ok ? await compRes.json() : null;
      const ssData = ssRes.ok ? await ssRes.json() : null;

      setAccountOverview({ accounts: accountsData.accounts || [], totals: accountsData.totals || {} });
      setPostSummary(summaryData.summary || null);
      setPosts(postsData.metrics || []);
      setComparison(compData);
      setScribeshift(ssData);
    } catch (err) {
      setError(`Failed to load analytics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshNote('');
    try {
      const res = await fetch('/api/metrics/refresh', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');

      // Build a per-platform summary line for the user
      const accountResults = data.accounts || {};
      const ok = Object.entries(accountResults).filter(([, v]) => v.status === 'ok').map(([p]) => PLATFORM_LABELS[p] || p);
      const skipped = Object.entries(accountResults).filter(([, v]) => v.status === 'skipped').map(([p]) => PLATFORM_LABELS[p] || p);
      const errored = Object.entries(accountResults).filter(([, v]) => v.status === 'error').map(([p]) => PLATFORM_LABELS[p] || p);
      const parts = [];
      if (ok.length) parts.push(`✓ ${ok.join(', ')}`);
      if (skipped.length) parts.push(`skipped: ${skipped.join(', ')}`);
      if (errored.length) parts.push(`errored: ${errored.join(', ')}`);
      if (data.posts?.synced != null) parts.push(`${data.posts.synced} posts synced`);
      setRefreshNote(parts.join(' · ') || 'Refreshed');

      await loadAll();
    } catch (err) {
      setRefreshNote(`Error: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const lastSynced = useMemo(() => {
    const stamps = (accountOverview.accounts || []).map(a => a.synced_at).filter(Boolean);
    if (stamps.length === 0) return null;
    const latest = stamps.sort().pop();
    return latest;
  }, [accountOverview]);

  const totals = accountOverview.totals || {};
  const hasAnyAccount = (accountOverview.accounts || []).length > 0;
  const hasAnyPosts = (postSummary?.total_posts || 0) > 0;

  return (
    <div className="analytics-dashboard">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="section-title">Analytics</h1>
          <p className="section-desc">Native platform stats — plus what you've shipped through ScribeShift.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {lastSynced && (
            <span className="card-subtitle" style={{ margin: 0, fontSize: '0.78rem' }}>
              Last sync {timeAgo(lastSynced)}
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {refreshNote && (
        <div className="card-subtitle" style={{ marginTop: '-0.25rem', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
          {refreshNote}
        </div>
      )}

      {error && (
        <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      <div className="mb-4 flex items-center gap-3 flex-wrap" style={{ marginBottom: '1rem' }} data-tour="analytics-tabs">
        <Tabs
          items={[
            { value: 'native', label: 'Native platforms' },
            { value: 'scribeshift', label: 'Made with ScribeShift' },
            { value: 'compare', label: 'Boosted vs Organic' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {loading && !refreshing && (
        <div className="card"><div className="loading-spinner" style={{ margin: '2rem auto' }} /></div>
      )}

      {!loading && tab === 'native' && (
        <NativeTab
          accountOverview={accountOverview}
          posts={posts}
          postSummary={postSummary}
          totals={totals}
          hasAnyAccount={hasAnyAccount}
          hasAnyPosts={hasAnyPosts}
          onRefresh={handleRefresh}
        />
      )}

      {!loading && tab === 'scribeshift' && (
        <ScribeshiftTab data={scribeshift} />
      )}

      {!loading && tab === 'compare' && (
        <CompareTab comparison={comparison} hasAnyPosts={hasAnyPosts} />
      )}
    </div>
  );
}

/* ── Native platforms tab ───────────────────────────────────────────── */
function NativeTab({ accountOverview, posts, postSummary, totals, hasAnyAccount, hasAnyPosts, onRefresh }) {
  if (!hasAnyAccount) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>No connected accounts</h3>
        <p className="card-subtitle">
          Connect at least one social account in Settings to start pulling your followers, reach, and post performance.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { window.location.hash = 'settings'; }}
        >
          Go to Settings →
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Cross-platform totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-5" data-tour="analytics-top-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <StatCard tone="blue" label="Total followers"
          value={formatNumber(totals.followers || 0)}
          subtext={`across ${accountOverview.accounts.length} platform${accountOverview.accounts.length === 1 ? '' : 's'}`} />
        <StatCard tone="purple" label="30-day reach"
          value={formatNumber(totals.reach_30d || 0)}
          subtext="aggregated, where supported" />
        <StatCard tone="green" label="30-day impressions"
          value={formatNumber(totals.impressions_30d || 0)}
          subtext="aggregated, where supported" />
        <StatCard tone="amber" label="Total posts"
          value={formatNumber(totals.posts || 0)}
          subtext="lifetime, per platform API" />
      </div>

      {/* Per-platform account cards (rich) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.25rem' }}>
        {accountOverview.accounts.map(a => (
          <PlatformPanel key={a.id} a={a} />
        ))}
      </div>

      {/* Post-level performance */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Post performance</h3>
            <p className="card-subtitle" style={{ margin: 0 }}>
              Posts you've sent through ScribeShift, with metrics pulled from each platform.
            </p>
          </div>
          {postSummary && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <SummaryStat label="Posts" value={postSummary.total_posts} />
              <SummaryStat label="Impressions" value={postSummary.total_impressions} />
              <SummaryStat label="Reactions" value={postSummary.total_reactions} />
              <SummaryStat label="Engagement" value={`${postSummary.avg_engagement_rate || 0}%`} raw />
            </div>
          )}
        </div>

        {!hasAnyPosts ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)' }}>
            No post metrics yet. After your scheduled posts go live, hit Refresh and we'll pull stats from each platform.
          </div>
        ) : (
          <table className="metrics-table" data-tour="analytics-posts-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Platform</th>
                <th>Impressions</th>
                <th>Reactions</th>
                <th>Comments</th>
                <th>Shares</th>
                <th>Engagement</th>
              </tr>
            </thead>
            <tbody>
              {posts.slice(0, 10).map(p => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 320 }}>
                    {p.scheduled_posts?.external_post_url ? (
                      <a href={p.scheduled_posts.external_post_url} target="_blank" rel="noreferrer">
                        {(p.scheduled_posts?.post_text || '').slice(0, 80)}{p.scheduled_posts?.post_text?.length > 80 ? '…' : ''}
                      </a>
                    ) : (
                      (p.scheduled_posts?.post_text || '(no text)').slice(0, 80)
                    )}
                  </td>
                  <td>
                    <span style={{ color: PLATFORM_COLORS[p.platform] }}>
                      {PLATFORM_LABELS[p.platform] || p.platform}
                    </span>
                  </td>
                  <td>{formatNumber(p.impressions || 0)}</td>
                  <td>{formatNumber(p.reactions || 0)}</td>
                  <td>{formatNumber(p.comments || 0)}</td>
                  <td>{formatNumber(p.shares || 0)}</td>
                  <td><strong>{p.engagement_rate ? `${p.engagement_rate}%` : '—'}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ── Made with ScribeShift tab ──────────────────────────────────────── */
function ScribeshiftTab({ data }) {
  if (!data) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p className="card-subtitle">No data yet — start generating content from the Create tab.</p>
      </div>
    );
  }

  const { generated, scheduled, window: w } = data;
  const contentTypeData = Object.entries(generated.by_content_type || {}).map(([type, count]) => ({ type, count }));
  const platformData = Object.entries(scheduled.by_platform || {}).map(([platform, count]) => ({ platform: PLATFORM_LABELS[platform] || platform, count }));
  const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e', '#64748b'];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <StatCard tone="blue" label="Pieces generated" value={formatNumber(generated.total)} subtext={`last ${w.days} days`} />
        <StatCard tone="purple" label="Posts scheduled" value={formatNumber(scheduled.total)} subtext={`last ${w.days} days`} />
        <StatCard tone="green" label="Posted live" value={formatNumber(scheduled.by_status.posted || 0)} subtext={scheduled.by_status.failed ? `${scheduled.by_status.failed} failed` : 'no failures'} />
        <StatCard
          tone="amber"
          label="First-attempt success"
          value={scheduled.first_attempt_success_rate != null ? `${scheduled.first_attempt_success_rate}%` : '—'}
          subtext={scheduled.total_retries ? `${scheduled.total_retries} total retries` : 'no retries needed'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Content types you've generated</h3>
          {contentTypeData.length === 0 ? (
            <p className="card-subtitle" style={{ marginBottom: 0 }}>Nothing in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={contentTypeData} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}>
                  {contentTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Where you've scheduled to</h3>
          {platformData.length === 0 ? (
            <p className="card-subtitle" style={{ marginBottom: 0 }}>You haven't scheduled anything yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={platformData}>
                <XAxis dataKey="platform" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Generation activity</h3>
          {(!generated.time_series || generated.time_series.length === 0) ? (
            <p className="card-subtitle" style={{ marginBottom: 0 }}>No generations in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={generated.time_series}>
                <XAxis dataKey="date" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Schedule pipeline</h3>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {Object.entries(scheduled.by_status).map(([status, count]) => (
              <div key={status} style={{
                flex: '1 1 140px',
                padding: '0.75rem 1rem',
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}>
                <div className="card-subtitle" style={{ margin: 0, textTransform: 'capitalize' }}>{status}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Boosted vs Organic tab ─────────────────────────────────────────── */
function CompareTab({ comparison, hasAnyPosts }) {
  if (!hasAnyPosts || !comparison) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p className="card-subtitle">No post metrics to compare yet.</p>
      </div>
    );
  }
  const { organic, boosted } = comparison;

  const Block = ({ title, data, tone }) => (
    <div className="card" style={{ borderTop: `3px solid ${tone}` }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem 1.5rem' }}>
        <Stat label="Posts" value={data.count} />
        <Stat label="Impressions" value={data.impressions} />
        <Stat label="Reactions" value={data.reactions} />
        <Stat label="Comments" value={data.comments} />
        <Stat label="Shares" value={data.shares} />
        <Stat label="Clicks" value={data.clicks} />
        {data.total_spend > 0 && <Stat label="Total spend" value={`$${data.total_spend}`} raw />}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
      <Block title="Organic" data={organic} tone="#10b981" />
      <Block title="Boosted" data={boosted} tone="#f59e0b" />
    </div>
  );
}

/* ── small helpers ──────────────────────────────────────────────────── */
function Stat({ label, value, raw = false }) {
  const display = value == null ? '—' : raw ? value : formatNumber(value);
  return (
    <div>
      <div className="card-subtitle" style={{ margin: 0, fontSize: '0.72rem' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{display}</div>
    </div>
  );
}

function SummaryStat({ label, value, raw = false }) {
  const display = value == null ? '—' : raw ? value : formatNumber(value);
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="card-subtitle" style={{ margin: 0, fontSize: '0.7rem' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{display}</div>
    </div>
  );
}

/* ── Rich per-platform panel ────────────────────────────────────────── */
function PlatformPanel({ a }) {
  const color = PLATFORM_COLORS[a.platform] || '#94a3b8';
  const extra = a.extra_metrics || {};
  const recent = Array.isArray(a.recent_posts) ? a.recent_posts : [];
  const profilePic = extra.profile_image_url || extra.picture || null;
  const insightsError = extra.insights_error || null;
  const timelineDisclaimer = extra.timeline_disclaimer || null;
  const followersDisclaimer = extra.followers_disclaimer || null;
  const needsReconnect = insightsError && /reconnect/i.test(insightsError);

  // Platform-specific extra-metrics rows (only if value present)
  const extraRows = [];
  if (a.platform === 'twitter') {
    if (extra.tweet_impressions_estimate != null) extraRows.push(['Tweet impressions (recent)', formatNumber(extra.tweet_impressions_estimate)]);
    if (extra.link_clicks_estimate != null) extraRows.push(['Link clicks (recent)', formatNumber(extra.link_clicks_estimate)]);
    if (extra.listed_count != null) extraRows.push(['Listed in', formatNumber(extra.listed_count)]);
  } else if (a.platform === 'facebook') {
    if (extra.page_views_30d != null) extraRows.push(['Page views 30d', formatNumber(extra.page_views_30d)]);
    if (extra.new_followers_30d != null) extraRows.push(['New followers 30d', formatNumber(extra.new_followers_30d)]);
    if (extra.reactions_30d != null) extraRows.push(['Reactions 30d', formatNumber(extra.reactions_30d)]);
    if (extra.category) extraRows.push(['Category', extra.category]);
  } else if (a.platform === 'instagram') {
    if (extra.website_clicks_30d != null) extraRows.push(['Website clicks 30d', formatNumber(extra.website_clicks_30d)]);
    if (extra.follower_growth_30d != null) extraRows.push(['Follower growth 30d', formatNumber(extra.follower_growth_30d)]);
    if (extra.website) extraRows.push(['Website', extra.website]);
  } else if (a.platform === 'linkedin') {
    if (extra.connections_count != null) extraRows.push(['Connections', formatNumber(extra.connections_count)]);
  }

  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {profilePic ? (
          <img src={profilePic} alt="" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 22, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            {PLATFORM_ICONS[a.platform]}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <strong style={{ color }}>{PLATFORM_LABELS[a.platform] || a.platform}</strong>
            {extra.verified && (
              <span title="Verified" style={{ color }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={color}>
                  <path d="M22.5 12.5L20 10l1.5-3.5L18 5l-1-3.5L13.5 2 12 0l-1.5 2L7 1.5 6 5l-3.5 1L4 9.5 1.5 12 4 14.5 2.5 18 6 19l1 3.5 3.5-.5L12 24l1.5-2 3.5.5 1-3.5 3.5-1L20 14.5z"/>
                  <path d="M10 16l-4-4 1.4-1.4L10 13.2l6.6-6.6L18 8z" fill="white"/>
                </svg>
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>@{a.platform_user_name || '(unknown)'}</div>
          {extra.bio && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
              {extra.bio.length > 120 ? extra.bio.slice(0, 120) + '…' : extra.bio}
            </div>
          )}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Synced {timeAgo(a.synced_at) || 'never'}
        </div>
      </div>

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
        <Stat label="Followers" value={a.followers} />
        <Stat label="Following" value={a.following} />
        <Stat label="Posts" value={a.posts_count} />
        <Stat label="Reach 30d" value={a.reach_30d} />
        <Stat label="Impressions 30d" value={a.impressions_30d} />
        <Stat label="Profile views 30d" value={a.profile_views_30d} />
      </div>

      {/* Platform-specific extras */}
      {extraRows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem 1rem', marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-raised)', borderRadius: 8 }}>
          {extraRows.map(([label, value]) => (
            <div key={label}>
              <div className="card-subtitle" style={{ fontSize: '0.7rem', margin: 0 }}>{label}</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Soft warnings (insights / timeline / followers disclaimers) */}
      {(insightsError || timelineDisclaimer || followersDisclaimer) && (
        <div className="analytics-soft-warning" style={{ marginTop: '1rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ flex: 1 }}>{insightsError || timelineDisclaimer || followersDisclaimer}</span>
          {needsReconnect && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { window.location.hash = 'settings'; }}
            >
              Reconnect {PLATFORM_LABELS[a.platform]} →
            </button>
          )}
        </div>
      )}

      {/* Recent posts */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Recent {a.platform === 'instagram' ? 'media' : 'posts'}</strong>
          <span className="card-subtitle" style={{ fontSize: '0.7rem' }}>
            {recent.length > 0 ? `${recent.length} most recent` : ''}
          </span>
        </div>
        {recent.length === 0 ? (
          <p className="card-subtitle" style={{ marginTop: 0 }}>
            {a.platform === 'linkedin'
              ? "LinkedIn doesn't expose a member's full post list via API. Posts you ship through ScribeShift will show up here with their stats."
              : a.platform === 'twitter'
              ? "We can't list your full tweet timeline on the free X API tier. Tweets you send through ScribeShift will appear here with full stats."
              : a.platform === 'facebook'
              ? "Nothing posted to this Page yet — or the Page Insights endpoint can't see them. Posts you publish via ScribeShift will appear here."
              : 'No recent posts to show. Reconnect to grant insights permission, or post something first.'}
          </p>
        ) : (
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Posted</th>
                <th>Impressions</th>
                <th>Likes</th>
                <th>Comments</th>
                {a.platform === 'twitter' && <th>Retweets</th>}
                {a.platform === 'facebook' && <th>Shares</th>}
                {a.platform === 'instagram' && <th>Saved</th>}
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(p => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 320 }}>
                    {p.permalink ? (
                      <a href={p.permalink} target="_blank" rel="noreferrer">
                        {(p.text || '(no text)').slice(0, 100)}{(p.text || '').length > 100 ? '…' : ''}
                      </a>
                    ) : (
                      (p.text || '(no text)').slice(0, 100)
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {p.posted_at ? timeAgo(p.posted_at) : '—'}
                  </td>
                  <td>{p.impressions != null ? formatNumber(p.impressions) : '—'}</td>
                  <td>{p.likes != null ? formatNumber(p.likes) : '—'}</td>
                  <td>{p.comments != null ? formatNumber(p.comments) : '—'}</td>
                  {a.platform === 'twitter' && <td>{p.shares != null ? formatNumber(p.shares) : '—'}</td>}
                  {a.platform === 'facebook' && <td>{p.shares != null ? formatNumber(p.shares) : '—'}</td>}
                  {a.platform === 'instagram' && <td>{p.saved != null ? formatNumber(p.saved) : '—'}</td>}
                  <td>{p.link_clicks != null ? formatNumber(p.link_clicks) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
