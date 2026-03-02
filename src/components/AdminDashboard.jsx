import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthProvider';

export default function AdminDashboard() {
  const { user, getAuthHeaders, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  // Modal state for editing
  const [editingUser, setEditingUser] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [newCompany, setNewCompany] = useState(null);
  const [newUser, setNewUser] = useState(null);
  const [addCreditsTarget, setAddCreditsTarget] = useState(null); // { id, name, amount }

  // Usage tab state
  const [expandedCompany, setExpandedCompany] = useState('_all');
  const [expandedUser, setExpandedUser] = useState(null);
  const [usageViewMode, setUsageViewMode] = useState('grouped'); // 'grouped' | 'all'

  const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const authHeaders = getAuthHeaders();
      const [usersRes, usageRes, companiesRes] = await Promise.all([
        fetch('/api/admin/users', { headers: authHeaders }),
        fetch('/api/admin/usage', { headers: authHeaders }),
        isSuperAdmin
          ? fetch('/api/admin/companies', { headers: authHeaders })
          : Promise.resolve(null),
      ]);

      const usersData = await usersRes.json();
      const usageData = await usageRes.json();

      if (usersData.users) setUsers(usersData.users);
      if (usageData.usage) setUsage(usageData.usage);

      if (companiesRes) {
        const companiesData = await companiesRes.json();
        if (companiesData.companies) setCompanies(companiesData.companies);
      }
    } catch (err) {
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update role');
        return;
      }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch {
      setError('Failed to update role');
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/active`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update status');
        return;
      }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: isActive } : u));
    } catch {
      setError('Failed to update status');
    }
  };

  const handleCreateUser = async () => {
    if (!newUser?.email || !newUser?.password) {
      setError('Email and password are required');
      return;
    }
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }
      setUsers(prev => [data.user, ...prev]);
      setNewUser(null);
    } catch {
      setError('Failed to create user');
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompany?.name) return;
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers,
        body: JSON.stringify(newCompany),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create company');
        return;
      }
      setCompanies(prev => [data.company, ...prev]);
      setNewCompany(null);
    } catch {
      setError('Failed to create company');
    }
  };

  const handleUpdateCompany = async () => {
    if (!editingCompany) return;
    try {
      const res = await fetch(`/api/admin/companies/${editingCompany.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: editingCompany.name,
          plan: editingCompany.plan,
          credit_balance: editingCompany.credit_balance,
          credit_monthly_limit: editingCompany.credit_monthly_limit,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update company');
        return;
      }
      setCompanies(prev => prev.map(c => c.id === editingCompany.id ? { ...c, ...editingCompany } : c));
      setEditingCompany(null);
    } catch {
      setError('Failed to update company');
    }
  };

  const handleAddCredits = async () => {
    if (!addCreditsTarget?.id || !addCreditsTarget.amount || addCreditsTarget.amount <= 0) {
      setError('Enter a positive credit amount');
      return;
    }
    try {
      const res = await fetch(`/api/admin/companies/${addCreditsTarget.id}/add-credits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount: addCreditsTarget.amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add credits');
        return;
      }
      setCompanies(prev => prev.map(c =>
        c.id === addCreditsTarget.id ? { ...c, credit_balance: data.new_balance } : c
      ));
      setAddCreditsTarget(null);
    } catch {
      setError('Failed to add credits');
    }
  };

  const handleToggleUnlimited = async (company) => {
    const isCurrentlyUnlimited = company.credit_monthly_limit === -1;
    const newLimit = isCurrentlyUnlimited ? 100 : -1;
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ credit_monthly_limit: newLimit }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update company');
        return;
      }
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? { ...c, credit_monthly_limit: newLimit } : c
      ));
    } catch {
      setError('Failed to update company');
    }
  };

  // Compute stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.is_active).length;
  const totalCreditsUsed = usage.reduce((sum, u) => sum + (u.credits_used || 0), 0);
  const recentUsage = usage.filter(u => {
    const d = new Date(u.created_at);
    const now = new Date();
    return (now - d) < 7 * 24 * 60 * 60 * 1000; // last 7 days
  });

  // Group usage by company → user
  const usageByCompany = useMemo(() => {
    const map = {};
    for (const log of usage) {
      const compId = log.company_id || '_none';
      const compName = log.companies?.name || 'No Company';
      const compPlan = log.companies?.plan || '';
      if (!map[compId]) map[compId] = { id: compId, name: compName, plan: compPlan, totalCredits: 0, users: {}, logs: [] };
      map[compId].totalCredits += log.credits_used || 0;
      map[compId].logs.push(log);

      const userId = log.user_id || '_unknown';
      const userName = log.users?.full_name || log.users?.email || 'Unknown';
      if (!map[compId].users[userId]) map[compId].users[userId] = { id: userId, name: userName, totalCredits: 0, actions: {}, logs: [] };
      map[compId].users[userId].totalCredits += log.credits_used || 0;
      map[compId].users[userId].logs.push(log);
      const action = log.action;
      map[compId].users[userId].actions[action] = (map[compId].users[userId].actions[action] || 0) + (log.credits_used || 0);
    }
    return Object.values(map).sort((a, b) => b.totalCredits - a.totalCredits);
  }, [usage]);

  const roleOptions = isSuperAdmin
    ? ['user', 'admin', 'super_admin']
    : ['user', 'admin'];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    ...(isSuperAdmin ? [{ id: 'companies', label: 'Companies' }] : []),
    { id: 'usage', label: 'Usage' },
  ];

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-screen" style={{ minHeight: '50vh' }}>
          <div className="loading-spinner" />
          <p>Loading admin data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h2>{isSuperAdmin ? 'Super Admin Dashboard' : 'Admin Dashboard'}</h2>
        <p className="admin-subtitle">
          {isSuperAdmin
            ? 'Manage all companies, users, credits, and platform analytics.'
            : 'Manage your team and view company analytics.'}
        </p>
      </div>

      {error && (
        <div className="admin-error">
          {error}
          <button className="admin-error-dismiss" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="admin-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`admin-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="admin-overview">
          <div className="admin-stats-grid">
            <StatCard label="Total Users" value={totalUsers} />
            <StatCard label="Active Users" value={activeUsers} />
            <StatCard label="Credits Used" value={totalCreditsUsed} />
            <StatCard label="Actions (7d)" value={recentUsage.length} />
            {isSuperAdmin && <StatCard label="Companies" value={companies.length} />}
          </div>

          {/* Recent activity */}
          <div className="admin-section">
            <h3>Recent Activity</h3>
            {usage.length === 0 ? (
              <p className="admin-empty">No usage data yet.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Action</th>
                      <th>Credits</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.slice(0, 20).map(u => (
                      <tr key={u.id}>
                        <td>{u.users?.full_name || u.users?.email || 'Unknown'}</td>
                        <td><span className="action-badge">{u.action.replace(/_/g, ' ')}</span></td>
                        <td>{u.credits_used}</td>
                        <td>{new Date(u.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h3>Users ({users.length})</h3>
            {isSuperAdmin && (
              <button className="admin-btn" onClick={() => setNewUser({
                email: '', password: '', full_name: '', role: 'user',
                company_id: '', is_active: true
              })}>
                + Add User
              </button>
            )}
          </div>

          {newUser && (
            <div className="admin-form-card">
              <h4>Create User</h4>
              <div className="admin-form-row">
                <input placeholder="Email" type="email" value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
                <input placeholder="Password" type="password" value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                <input placeholder="Full name" value={newUser.full_name}
                  onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="admin-form-row">
                <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                  {roleOptions.map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
                <select value={newUser.company_id}
                  onChange={e => setNewUser(p => ({ ...p, company_id: e.target.value }))}>
                  <option value="">No company</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={newUser.is_active}
                    onChange={e => setNewUser(p => ({ ...p, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>
              <div className="admin-form-actions">
                <button className="admin-btn" onClick={handleCreateUser}>Create User</button>
                <button className="admin-btn secondary" onClick={() => setNewUser(null)}>Cancel</button>
              </div>
            </div>
          )}

          {users.length === 0 ? (
            <p className="admin-empty">No users found.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    {isSuperAdmin && <th>Company</th>}
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={!u.is_active ? 'inactive-row' : ''}>
                      <td>{u.full_name || '—'}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          className="admin-select"
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                          disabled={u.id === user.id}
                        >
                          {roleOptions.map(r => (
                            <option key={r} value={r}>{r.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </td>
                      {isSuperAdmin && <td>{u.companies?.name || '—'}</td>}
                      <td>
                        <span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </td>
                      <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}</td>
                      <td>
                        {u.id !== user.id && (
                          <button
                            className={`admin-btn-sm ${u.is_active ? 'danger' : 'success'}`}
                            onClick={() => handleToggleActive(u.id, !u.is_active)}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
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

      {/* Companies Tab (Super Admin only) */}
      {tab === 'companies' && isSuperAdmin && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h3>Companies ({companies.length})</h3>
            <button className="admin-btn" onClick={() => setNewCompany({ name: '', plan: 'free', credit_balance: 100, credit_monthly_limit: 100 })}>
              + New Company
            </button>
          </div>

          {/* New company form */}
          {newCompany && (
            <div className="admin-form-card">
              <h4>Create Company</h4>
              <div className="admin-form-row">
                <input placeholder="Company name" value={newCompany.name}
                  onChange={e => setNewCompany(p => ({ ...p, name: e.target.value }))} />
                <select value={newCompany.plan} onChange={e => setNewCompany(p => ({ ...p, plan: e.target.value }))}>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                {newCompany.credit_monthly_limit !== -1 && (
                  <input type="number" placeholder="Credits" value={newCompany.credit_balance}
                    onChange={e => setNewCompany(p => ({ ...p, credit_balance: Number(e.target.value) }))} />
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={newCompany.credit_monthly_limit === -1}
                    onChange={e => setNewCompany(p => ({
                      ...p,
                      credit_monthly_limit: e.target.checked ? -1 : 100,
                    }))} />
                  Unlimited credits
                </label>
              </div>
              <div className="admin-form-actions">
                <button className="admin-btn" onClick={handleCreateCompany}>Create</button>
                <button className="admin-btn secondary" onClick={() => setNewCompany(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Edit company form */}
          {editingCompany && (
            <div className="admin-form-card">
              <h4>Edit: {editingCompany.name}</h4>
              <div className="admin-form-row">
                <input placeholder="Company name" value={editingCompany.name}
                  onChange={e => setEditingCompany(p => ({ ...p, name: e.target.value }))} />
                <select value={editingCompany.plan} onChange={e => setEditingCompany(p => ({ ...p, plan: e.target.value }))}>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                {editingCompany.credit_monthly_limit !== -1 && (
                  <>
                    <input type="number" placeholder="Credits" value={editingCompany.credit_balance}
                      onChange={e => setEditingCompany(p => ({ ...p, credit_balance: Number(e.target.value) }))} />
                    <input type="number" placeholder="Monthly limit" value={editingCompany.credit_monthly_limit}
                      onChange={e => setEditingCompany(p => ({ ...p, credit_monthly_limit: Number(e.target.value) }))} />
                  </>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={editingCompany.credit_monthly_limit === -1}
                    onChange={e => setEditingCompany(p => ({
                      ...p,
                      credit_monthly_limit: e.target.checked ? -1 : 100,
                    }))} />
                  Unlimited credits
                </label>
              </div>
              <div className="admin-form-actions">
                <button className="admin-btn" onClick={handleUpdateCompany}>Save</button>
                <button className="admin-btn secondary" onClick={() => setEditingCompany(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Add credits form */}
          {addCreditsTarget && (
            <div className="admin-form-card">
              <h4>Add Credits: {addCreditsTarget.name}</h4>
              <div className="admin-form-row">
                <input type="number" placeholder="Amount to add" min="1" value={addCreditsTarget.amount || ''}
                  onChange={e => setAddCreditsTarget(p => ({ ...p, amount: Number(e.target.value) }))}
                  onKeyDown={e => e.key === 'Enter' && handleAddCredits()} />
              </div>
              <div className="admin-form-actions">
                <button className="admin-btn" onClick={handleAddCredits}>Add Credits</button>
                <button className="admin-btn secondary" onClick={() => setAddCreditsTarget(null)}>Cancel</button>
              </div>
            </div>
          )}

          {companies.length === 0 ? (
            <p className="admin-empty">No companies yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Plan</th>
                    <th>Credits</th>
                    <th>Monthly Limit</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => {
                    const isUnlimited = c.credit_monthly_limit === -1;
                    return (
                      <tr key={c.id}>
                        <td><strong>{c.name}</strong></td>
                        <td><span className={`plan-badge ${c.plan}`}>{c.plan}</span></td>
                        <td>{isUnlimited ? <span className="plan-badge enterprise">Unlimited</span> : c.credit_balance}</td>
                        <td>{isUnlimited ? <span className="plan-badge enterprise">Unlimited</span> : c.credit_monthly_limit}</td>
                        <td>{new Date(c.created_at).toLocaleDateString()}</td>
                        <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button className="admin-btn-sm" onClick={() => setEditingCompany({ ...c })}>Edit</button>
                          {!isUnlimited && (
                            <button className="admin-btn-sm success" onClick={() => setAddCreditsTarget({ id: c.id, name: c.name, amount: '' })}>
                              + Credits
                            </button>
                          )}
                          <button
                            className={`admin-btn-sm ${isUnlimited ? 'danger' : ''}`}
                            onClick={() => handleToggleUnlimited(c)}
                          >
                            {isUnlimited ? 'Remove Unlimited' : 'Set Unlimited'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Usage Tab */}
      {tab === 'usage' && (
        <div className="admin-section">
          <div className="usage-tab-header">
            <h3>Usage Log</h3>
            <div className="usage-view-toggle">
              <button className={`usage-view-btn${usageViewMode === 'grouped' ? ' active' : ''}`} onClick={() => setUsageViewMode('grouped')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                By Company
              </button>
              <button className={`usage-view-btn${usageViewMode === 'all' ? ' active' : ''}`} onClick={() => setUsageViewMode('all')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                All Logs
              </button>
            </div>
          </div>
          {usage.length === 0 ? (
            <p className="admin-empty">No usage data yet. Usage will appear here as users generate content.</p>
          ) : (
            <>
              {/* Global usage breakdown by action */}
              <div className="usage-breakdown">
                {Object.entries(
                  usage.reduce((acc, u) => {
                    acc[u.action] = (acc[u.action] || 0) + u.credits_used;
                    return acc;
                  }, {})
                ).sort((a, b) => b[1] - a[1]).map(([action, total]) => (
                  <div key={action} className="usage-breakdown-item">
                    <span className="usage-action">{action.replace(/_/g, ' ')}</span>
                    <span className="usage-credits">{total} credits</span>
                  </div>
                ))}
              </div>

              {/* ── Grouped by Company view ── */}
              {usageViewMode === 'grouped' && (
                <div className="usage-companies">
                  {usageByCompany.map(comp => {
                    const isExpanded = expandedCompany === '_all' || expandedCompany === comp.id;
                    const compUsers = Object.values(comp.users).sort((a, b) => b.totalCredits - a.totalCredits);
                    return (
                      <div key={comp.id} className={`usage-company-card${isExpanded ? ' expanded' : ''}`}>
                        <div className="usage-company-header" onClick={() => setExpandedCompany(prev => prev === comp.id || prev === '_all' ? (prev === '_all' ? comp.id : null) : comp.id)}>
                          <div className="usage-company-left">
                            <svg className={`usage-chevron${isExpanded ? ' open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                            <span className="usage-company-name">{comp.name}</span>
                            {comp.plan && <span className="usage-company-plan">{comp.plan}</span>}
                            <span className="usage-company-user-count">{compUsers.length} user{compUsers.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="usage-company-right">
                            <span className="usage-company-credits">{comp.totalCredits} credits</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="usage-company-body">
                            {compUsers.map(u => {
                              const isUserExpanded = expandedUser === u.id;
                              return (
                                <div key={u.id} className={`usage-user-card${isUserExpanded ? ' expanded' : ''}`}>
                                  <div className="usage-user-header" onClick={() => setExpandedUser(isUserExpanded ? null : u.id)}>
                                    <div className="usage-user-left">
                                      <svg className={`usage-chevron${isUserExpanded ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                                      <span className="usage-user-name">{u.name}</span>
                                    </div>
                                    <div className="usage-user-right">
                                      <div className="usage-user-actions">
                                        {Object.entries(u.actions).sort((a, b) => b[1] - a[1]).map(([action, credits]) => (
                                          <span key={action} className="usage-user-action-chip">
                                            <span className="action-badge">{action.replace(/_/g, ' ')}</span>
                                            <span className="usage-user-action-credits">{credits}</span>
                                          </span>
                                        ))}
                                      </div>
                                      <span className="usage-user-total">{u.totalCredits} credits</span>
                                    </div>
                                  </div>

                                  {isUserExpanded && (
                                    <div className="usage-user-body">
                                      <div className="admin-table-wrap">
                                        <table className="admin-table">
                                          <thead>
                                            <tr>
                                              <th>Action</th>
                                              <th>Credits</th>
                                              <th>Date</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {u.logs.map(log => (
                                              <tr key={log.id}>
                                                <td><span className="action-badge">{log.action.replace(/_/g, ' ')}</span></td>
                                                <td>{log.credits_used}</td>
                                                <td>{new Date(log.created_at).toLocaleString()}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Flat "All Logs" view ── */}
              {usageViewMode === 'all' && (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        {isSuperAdmin && <th>Company</th>}
                        <th>User</th>
                        <th>Action</th>
                        <th>Credits</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map(u => (
                        <tr key={u.id}>
                          {isSuperAdmin && <td className="usage-table-company">{u.companies?.name || '—'}</td>}
                          <td>{u.users?.full_name || u.users?.email || 'Unknown'}</td>
                          <td><span className="action-badge">{u.action.replace(/_/g, ' ')}</span></td>
                          <td>{u.credits_used}</td>
                          <td>{new Date(u.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}
