import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

// All platforms connect via OAuth API
const PLATFORMS = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0077B5',
    authPath: '/api/auth/linkedin',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    color: '#000000',
    authPath: '/api/auth/twitter',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    authPath: '/api/auth/facebook',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    authPath: '/api/auth/instagram',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/>
      </svg>
    ),
  },
];

export default function ConnectedAccounts() {
  const { getAuthHeaders } = useAuth();
  const [statuses, setStatuses] = useState({});
  const [gcalStatus, setGcalStatus] = useState({ connected: false, configured: true });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Facebook page selection state
  const [pageSelectionId, setPageSelectionId] = useState(null);
  const [pageOptions, setPageOptions] = useState([]);
  // Instagram account selection state
  const [igSelectionId, setIgSelectionId] = useState(null);
  const [igOptions, setIgOptions] = useState([]);

  // Fetch connection status for all platforms
  const fetchStatuses = async () => {
    const results = {};
    await Promise.all(
      PLATFORMS.map(async (p) => {
        try {
          const res = await fetch(`${p.authPath}/status`, { headers: getAuthHeaders() });
          results[p.id] = await res.json();
        } catch {
          results[p.id] = { connected: false };
        }
      })
    );
    setStatuses(results);

    try {
      const res = await fetch('/api/auth/google-calendar/status', { headers: getAuthHeaders() });
      setGcalStatus(await res.json());
    } catch {
      setGcalStatus({ connected: false, configured: false });
    }
  };

  const handleConnectGcal = async () => {
    setConnecting('google-calendar');
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/google-calendar', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setConnecting(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Failed to start Google Calendar connection');
      setConnecting(null);
    }
  };

  const handleDisconnectGcal = async () => {
    if (!confirm('Disconnect Google Calendar? Future scheduled posts will no longer be auto-added to your calendar.')) return;
    try {
      await fetch('/api/auth/google-calendar', { method: 'DELETE', headers: getAuthHeaders() });
      setGcalStatus({ connected: false, configured: gcalStatus.configured });
      setSuccess('Google Calendar disconnected');
    } catch {
      setError('Failed to disconnect Google Calendar');
    }
  };

  // Check for OAuth callback results in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    for (const p of PLATFORMS) {
      const pSuccess = params.get(`${p.id}_success`);
      const pError = params.get(`${p.id}_error`);
      const pName = params.get(`${p.id}_name`);

      if (pSuccess) {
        setSuccess(`${p.name} connected successfully${pName ? ` as ${pName}` : ''}!`);
        window.history.replaceState({}, '', window.location.pathname);
        break;
      }
      if (pError) {
        setError(`${p.name} connection failed: ${pError}`);
        window.history.replaceState({}, '', window.location.pathname);
        break;
      }
    }

    if (params.get('gcal_connected')) {
      setSuccess('Google Calendar connected — new scheduled posts will auto-create events.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('gcal_error')) {
      setError(`Google Calendar connection failed: ${params.get('gcal_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Facebook page selection flow
    const fbSelect = params.get('facebook_select_page');
    if (fbSelect) {
      setPageSelectionId(fbSelect);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Instagram account selection flow
    const igSelect = params.get('instagram_select_account');
    if (igSelect) {
      setIgSelectionId(igSelect);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load page options when Facebook selection is pending
  useEffect(() => {
    if (pageSelectionId) {
      fetch(`/api/auth/facebook/pages/${pageSelectionId}`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => setPageOptions(data.pages || []))
        .catch(() => setError('Failed to load Facebook Pages'));
    }
  }, [pageSelectionId]);

  // Load IG account options when Instagram selection is pending
  useEffect(() => {
    if (igSelectionId) {
      fetch(`/api/auth/instagram/accounts/${igSelectionId}`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => setIgOptions(data.accounts || []))
        .catch(() => setError('Failed to load Instagram accounts'));
    }
  }, [igSelectionId]);

  useEffect(() => {
    fetchStatuses().finally(() => setLoading(false));
  }, []);

  // Refresh statuses when the user returns to the tab (e.g. after completing OAuth)
  useEffect(() => {
    const handleFocus = () => {
      fetchStatuses();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Initiate OAuth connect for any platform
  const handleConnect = async (platform) => {
    setConnecting(platform.id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(platform.authPath, { headers: getAuthHeaders() });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setConnecting(null);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError(`Failed to start ${platform.name} connection`);
      setConnecting(null);
    }
  };

  // Disconnect a platform
  const handleDisconnect = async (platform) => {
    if (!confirm(`Disconnect ${platform.name}? Scheduled posts will no longer be published.`)) return;

    try {
      await fetch(platform.authPath, { method: 'DELETE', headers: getAuthHeaders() });
      setStatuses(prev => ({ ...prev, [platform.id]: { connected: false } }));
      setSuccess(`${platform.name} disconnected`);
    } catch {
      setError(`Failed to disconnect ${platform.name}`);
    }
  };

  // Select a Facebook Page
  const handleSelectPage = async (pageId) => {
    try {
      const res = await fetch(`/api/auth/facebook/pages/${pageSelectionId}/select`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Facebook connected as ${data.pageName}!`);
        setPageSelectionId(null);
        setPageOptions([]);
        fetchStatuses();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to select page');
    }
  };

  // Select an Instagram account
  const handleSelectIgAccount = async (igUserId) => {
    try {
      const res = await fetch(`/api/auth/instagram/accounts/${igSelectionId}/select`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ igUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Instagram connected as @${data.igUsername}!`);
        setIgSelectionId(null);
        setIgOptions([]);
        fetchStatuses();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to select account');
    }
  };

  return (
    <div className="settings-view">
      <div className="section-header">
        <h1 className="section-title">Account Settings</h1>
        <p className="section-desc">Connect your social media accounts for automated posting</p>
      </div>

      <div className="card">
        <div className="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          Connected Accounts
        </div>

        <div className="credentials-info-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            <strong>Secure connections</strong>
            <p>All platforms use official OAuth APIs. No passwords stored — just secure tokens.</p>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {success && <div className="schedule-success">{success}</div>}

        {/* Facebook Page Selection Dialog */}
        {pageSelectionId && pageOptions.length > 0 && (
          <div className="credentials-form">
            <div className="credentials-form-header">
              <span style={{ color: '#1877F2' }}>{PLATFORMS.find(p => p.id === 'facebook')?.icon}</span>
              <span>Select a Facebook Page to connect</span>
            </div>
            <div className="credentials-platform-buttons">
              {pageOptions.map(page => (
                <button
                  key={page.pageId}
                  className="credential-platform-btn"
                  onClick={() => handleSelectPage(page.pageId)}
                  style={{ '--platform-color': '#1877F2' }}
                >
                  <span>{page.pageName}</span>
                </button>
              ))}
            </div>
            <button className="admin-btn" onClick={() => { setPageSelectionId(null); setPageOptions([]); }}>
              Cancel
            </button>
          </div>
        )}

        {/* Instagram Account Selection Dialog */}
        {igSelectionId && igOptions.length > 0 && (
          <div className="credentials-form">
            <div className="credentials-form-header">
              <span style={{ color: '#E4405F' }}>{PLATFORMS.find(p => p.id === 'instagram')?.icon}</span>
              <span>Select an Instagram account to connect</span>
            </div>
            <div className="credentials-platform-buttons">
              {igOptions.map(account => (
                <button
                  key={account.igUserId}
                  className="credential-platform-btn"
                  onClick={() => handleSelectIgAccount(account.igUserId)}
                  style={{ '--platform-color': '#E4405F' }}
                >
                  <span>@{account.igUsername}</span>
                  <span className="credential-last-used">{account.pageName}</span>
                </button>
              ))}
            </div>
            <button className="admin-btn" onClick={() => { setIgSelectionId(null); setIgOptions([]); }}>
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <div className="credentials-loading">Loading connected accounts...</div>
        ) : (
          <>
            {/* ── Connected accounts list ──────────────────────── */}
            {PLATFORMS.filter(p => statuses[p.id]?.connected).length > 0 && (
              <div className="credentials-list" data-tour="settings-socials">
                {PLATFORMS.filter(p => statuses[p.id]?.connected).map((p) => {
                  const status = statuses[p.id];
                  return (
                    <div key={p.id} className="credential-card">
                      <div className="credential-card-left">
                        <div className="credential-platform-icon" style={{ color: p.color }}>
                          {p.icon}
                        </div>
                        <div className="credential-info">
                          <div className="credential-platform-name">{p.name}</div>
                          <div className="credential-email">
                            {status.personName || 'Connected'}
                          </div>
                          <div className="credential-status">
                            <span className="credential-status-ok">Connected via official API</span>
                            {status.isExpired && (
                              <span className="credential-status-fail" style={{ marginLeft: 8 }}>
                                Session expired
                              </span>
                            )}
                            {!status.isExpired && status.canRefresh && (
                              <span className="credential-last-used">
                                Auto-refreshes
                              </span>
                            )}
                            {!status.isExpired && !status.canRefresh && status.expiresAt && (
                              <span className="credential-last-used">
                                Expires {new Date(status.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="credential-card-actions">
                        {status.isExpired && (
                          <button
                            className="btn btn-primary admin-btn-sm"
                            onClick={() => handleConnect(p)}
                            disabled={connecting === p.id}
                          >
                            Reconnect
                          </button>
                        )}
                        <button
                          className="admin-btn-sm credential-delete-btn"
                          onClick={() => handleDisconnect(p)}
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Connect new account buttons ──────────────────── */}
            <div className="credentials-add-section">
              <div className="credentials-add-label">
                {PLATFORMS.some(p => statuses[p.id]?.connected) ? 'Connect another account' : 'Connect your first account'}
              </div>
              <div className="credentials-platform-buttons">
                {PLATFORMS.map((p) => {
                  const isConnected = statuses[p.id]?.connected;
                  return (
                    <button
                      key={p.id}
                      className={`credential-platform-btn ${isConnected ? 'connected' : ''}`}
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        if (!isConnected) handleConnect(p);
                      }}
                      disabled={connecting === p.id}
                      style={{ '--platform-color': p.color }}
                    >
                      <span className="credential-btn-icon">{p.icon}</span>
                      <span>
                        {connecting === p.id ? 'Connecting...' : p.name}
                      </span>
                      {isConnected && <span className="credential-connected-badge">Connected</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Google Calendar integration ──────────────────────── */}
      <div className="card" style={{ marginTop: 16 }} data-tour="settings-calendar">
        <div className="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Calendar
        </div>

        <div className="credentials-info-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div>
            <strong>Auto-add scheduled posts to your calendar</strong>
            <p>Connect Google Calendar and every post you schedule will automatically show up as an event on the day it's going out.</p>
          </div>
        </div>

        {!gcalStatus.configured ? (
          <div className="schedule-success" style={{ background: '#fef3c7', color: '#92400e' }}>
            Google Calendar integration isn't configured on the server yet. Ask an admin to add <code>GOOGLE_CALENDAR_CLIENT_ID</code>, <code>GOOGLE_CALENDAR_CLIENT_SECRET</code>, and <code>GOOGLE_CALENDAR_REDIRECT_URI</code>.
          </div>
        ) : gcalStatus.connected ? (
          <div className="credentials-list">
            <div className="credential-card">
              <div className="credential-card-left">
                <div className="credential-platform-icon" style={{ color: '#4285F4' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                  </svg>
                </div>
                <div className="credential-info">
                  <div className="credential-platform-name">Google Calendar</div>
                  <div className="credential-email">{gcalStatus.email || 'Connected'}</div>
                  <div className="credential-status">
                    <span className="credential-status-ok">Auto-creating events for scheduled posts</span>
                  </div>
                </div>
              </div>
              <div className="credential-card-actions">
                <button className="admin-btn-sm credential-delete-btn" onClick={handleDisconnectGcal}>
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="credentials-add-section">
            <div className="credentials-platform-buttons">
              <button
                className="credential-platform-btn"
                onClick={handleConnectGcal}
                disabled={connecting === 'google-calendar'}
                style={{ '--platform-color': '#4285F4' }}
              >
                <span className="credential-btn-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#4285F4">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                  </svg>
                </span>
                <span>{connecting === 'google-calendar' ? 'Connecting...' : 'Connect Google Calendar'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
