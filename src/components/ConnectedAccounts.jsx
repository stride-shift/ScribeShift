import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

// Platforms that use OAuth (official API)
const OAUTH_PLATFORMS = new Set(['linkedin']);

const PLATFORMS = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0077B5',
    authType: 'oauth',
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
    authType: 'credentials',
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
    authType: 'credentials',
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
    authType: 'credentials',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/>
      </svg>
    ),
  },
];

export default function ConnectedAccounts() {
  const { getAuthHeaders } = useAuth();
  const [credentials, setCredentials] = useState([]);
  const [linkedinStatus, setLinkedinStatus] = useState(null); // OAuth status
  const [loading, setLoading] = useState(true);
  const [addingPlatform, setAddingPlatform] = useState(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [connectingLinkedIn, setConnectingLinkedIn] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch credential-based connections (Twitter, Facebook, Instagram)
  const fetchCredentials = async () => {
    try {
      const res = await fetch('/api/credentials', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.credentials) setCredentials(data.credentials);
    } catch {
      // silent
    }
  };

  // Fetch LinkedIn OAuth connection status
  const fetchLinkedInStatus = async () => {
    try {
      const res = await fetch('/api/auth/linkedin/status', { headers: getAuthHeaders() });
      const data = await res.json();
      setLinkedinStatus(data);
    } catch {
      setLinkedinStatus({ connected: false });
    }
  };

  // Check for OAuth callback results in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedinSuccess = params.get('linkedin_success');
    const linkedinError = params.get('linkedin_error');
    const linkedinName = params.get('linkedin_name');

    if (linkedinSuccess) {
      setSuccess(`LinkedIn connected successfully${linkedinName ? ` as ${linkedinName}` : ''}!`);
      // Clean URL params
      window.history.replaceState({}, '', window.location.pathname);
    } else if (linkedinError) {
      setError(`LinkedIn connection failed: ${linkedinError}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCredentials(), fetchLinkedInStatus()]).finally(() => setLoading(false));
  }, []);

  // LinkedIn OAuth: redirect to LinkedIn authorization
  const handleLinkedInConnect = async () => {
    setConnectingLinkedIn(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/auth/linkedin', { headers: getAuthHeaders() });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setConnectingLinkedIn(false);
        return;
      }

      // Redirect to LinkedIn OAuth consent page
      window.location.href = data.url;
    } catch {
      setError('Failed to start LinkedIn connection');
      setConnectingLinkedIn(false);
    }
  };

  // LinkedIn OAuth: disconnect
  const handleLinkedInDisconnect = async () => {
    if (!confirm('Disconnect LinkedIn? Scheduled posts will no longer be published.')) return;

    try {
      await fetch('/api/auth/linkedin', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setLinkedinStatus({ connected: false });
      setSuccess('LinkedIn disconnected');
    } catch {
      setError('Failed to disconnect LinkedIn');
    }
  };

  // Credential-based platforms: save
  const handleSave = async () => {
    if (!formEmail || !formPassword) {
      setError('Email and password are required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: addingPlatform,
          email: formEmail,
          password: formPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`${PLATFORMS.find(p => p.id === addingPlatform)?.name} connected successfully!`);
        setAddingPlatform(null);
        setFormEmail('');
        setFormPassword('');
        fetchCredentials();
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, platform) => {
    if (!confirm(`Remove ${platform} connection?`)) return;

    try {
      await fetch(`/api/credentials/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      fetchCredentials();
    } catch {
      setError('Failed to remove');
    }
  };

  const handleTest = async (id) => {
    setTesting(id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/credentials/${id}/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Login test successful!');
      } else {
        setError(`Login test failed: ${data.message}`);
      }
      fetchCredentials();
    } catch {
      setError('Test failed');
    } finally {
      setTesting(null);
    }
  };

  const connectedPlatformIds = credentials.map(c => c.platform);
  const isLinkedInConnected = linkedinStatus?.connected;

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
            <p>LinkedIn uses official OAuth (no password needed). Other platforms use encrypted credentials with AES-256-GCM.</p>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {success && <div className="schedule-success">{success}</div>}

        {loading ? (
          <div className="credentials-loading">Loading connected accounts...</div>
        ) : (
          <>
            {/* ── LinkedIn (OAuth) ────────────────────────────── */}
            {isLinkedInConnected && (
              <div className="credentials-list">
                <div className="credential-card">
                  <div className="credential-card-left">
                    <div className="credential-platform-icon" style={{ color: '#0077B5' }}>
                      {PLATFORMS.find(p => p.id === 'linkedin')?.icon}
                    </div>
                    <div className="credential-info">
                      <div className="credential-platform-name">LinkedIn</div>
                      <div className="credential-email">
                        {linkedinStatus.personName || 'Connected via OAuth'}
                      </div>
                      <div className="credential-status">
                        <span className="credential-status-ok">Connected via official API</span>
                        {linkedinStatus.isExpired && (
                          <span className="credential-status-fail" style={{ marginLeft: 8 }}>
                            Token expired — reconnect needed
                          </span>
                        )}
                        {linkedinStatus.expiresAt && !linkedinStatus.isExpired && (
                          <span className="credential-last-used">
                            Expires {new Date(linkedinStatus.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="credential-card-actions">
                    {linkedinStatus.isExpired && (
                      <button
                        className="btn btn-primary admin-btn-sm"
                        onClick={handleLinkedInConnect}
                        disabled={connectingLinkedIn}
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      className="admin-btn-sm credential-delete-btn"
                      onClick={handleLinkedInDisconnect}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Credential-based connections (Twitter, FB, IG) ── */}
            {credentials.filter(c => c.platform !== 'linkedin').length > 0 && (
              <div className="credentials-list">
                {credentials.filter(c => c.platform !== 'linkedin').map((cred) => {
                  const platform = PLATFORMS.find(p => p.id === cred.platform);
                  return (
                    <div key={cred.id} className="credential-card">
                      <div className="credential-card-left">
                        <div className="credential-platform-icon" style={{ color: platform?.color }}>
                          {platform?.icon}
                        </div>
                        <div className="credential-info">
                          <div className="credential-platform-name">{platform?.name || cred.platform}</div>
                          <div className="credential-email">{cred.masked_email}</div>
                          <div className="credential-status">
                            {cred.last_login_success === true && (
                              <span className="credential-status-ok">Last login: success</span>
                            )}
                            {cred.last_login_success === false && (
                              <span className="credential-status-fail">Last login: failed</span>
                            )}
                            {cred.last_used_at && (
                              <span className="credential-last-used">
                                Used {new Date(cred.last_used_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="credential-card-actions">
                        <button
                          className="admin-btn-sm"
                          onClick={() => handleTest(cred.id)}
                          disabled={testing === cred.id}
                        >
                          {testing === cred.id ? 'Testing...' : 'Test Login'}
                        </button>
                        <button
                          className="admin-btn-sm"
                          onClick={() => {
                            setAddingPlatform(cred.platform);
                            setFormEmail('');
                            setFormPassword('');
                          }}
                        >
                          Update
                        </button>
                        <button
                          className="admin-btn-sm credential-delete-btn"
                          onClick={() => handleDelete(cred.id, platform?.name)}
                        >
                          Remove
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
                {(credentials.length > 0 || isLinkedInConnected) ? 'Connect another account' : 'Connect your first account'}
              </div>
              <div className="credentials-platform-buttons">
                {PLATFORMS.map((p) => {
                  const isConnected = p.id === 'linkedin'
                    ? isLinkedInConnected
                    : connectedPlatformIds.includes(p.id);

                  return (
                    <button
                      key={p.id}
                      className={`credential-platform-btn ${isConnected ? 'connected' : ''} ${addingPlatform === p.id ? 'active' : ''}`}
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        if (p.id === 'linkedin') {
                          if (!isConnected) handleLinkedInConnect();
                          return;
                        }
                        setAddingPlatform(addingPlatform === p.id ? null : p.id);
                        setFormEmail('');
                        setFormPassword('');
                      }}
                      disabled={p.id === 'linkedin' && connectingLinkedIn}
                      style={{ '--platform-color': p.color }}
                    >
                      <span className="credential-btn-icon">{p.icon}</span>
                      <span>
                        {p.id === 'linkedin' && connectingLinkedIn
                          ? 'Connecting...'
                          : p.name}
                      </span>
                      {isConnected && <span className="credential-connected-badge">Connected</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Credential form (for non-OAuth platforms) ──── */}
            {addingPlatform && !OAUTH_PLATFORMS.has(addingPlatform) && (
              <div className="credentials-form">
                <div className="credentials-form-header">
                  <span style={{ color: PLATFORMS.find(p => p.id === addingPlatform)?.color }}>
                    {PLATFORMS.find(p => p.id === addingPlatform)?.icon}
                  </span>
                  <span>
                    {connectedPlatformIds.includes(addingPlatform) ? 'Update' : 'Connect'}{' '}
                    {PLATFORMS.find(p => p.id === addingPlatform)?.name}
                  </span>
                </div>
                <div className="credentials-form-fields">
                  <div className="schedule-field">
                    <label>Email / Username</label>
                    <input
                      type="email"
                      className="brand-input"
                      placeholder="your.email@example.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="schedule-field">
                    <label>Password</label>
                    <input
                      type="password"
                      className="brand-input"
                      placeholder="Your account password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="credentials-form-actions">
                  <button className="admin-btn" onClick={() => setAddingPlatform(null)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={saving || !formEmail || !formPassword}
                  >
                    {saving ? 'Saving...' : 'Save & Connect'}
                  </button>
                </div>
                <div className="credentials-form-hint">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  ScribeShift uses your credentials only to publish posts you've scheduled. We recommend using an app-specific password if available.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
