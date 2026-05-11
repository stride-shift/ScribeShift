import { useState, useEffect, useRef } from 'react';
import { useAuth } from './components/AuthProvider';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import { GenerationProvider, useGeneration } from './components/GenerationContext';
import CreateView, { SIDEBAR_STEPS } from './components/CreateView';
import AdminDashboard from './components/AdminDashboard';
import ContentHistory from './components/ContentHistory';
import ScheduleView from './components/ScheduleView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ConnectedAccounts from './components/ConnectedAccounts';
import ContentPillarGraph from './components/ContentPillarGraph';
import BrandsView from './components/BrandsView';
import OnboardingFlow from './components/OnboardingFlow';
import TourProvider, { useTour } from './components/tour/TourProvider';
import { SidebarShapes } from './components/ui/sidebar-shapes';

// Theme hook with localStorage persistence
function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('scribeshift-theme') || 'light';
    }
    return 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('scribeshift-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  return { theme, toggleTheme };
}

// ── Navigation views ──────────────────────────────────────────────
// Order reflects user mental model: Create → see what you made → schedule it → plan ahead → analyze → admin/settings.
const NAV_VIEWS = [
  { id: 'create', label: 'Create', icon: 'M12 5v14M5 12h14', roles: ['user', 'admin', 'super_admin'] },
  { id: 'history', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'planner', label: 'Pillars', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', roles: ['user', 'admin', 'super_admin'] },
  { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'brands', label: 'Brands', icon: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01', roles: ['user', 'admin', 'super_admin'] },
  { id: 'settings', label: 'Settings', icon: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'admin', label: 'Admin', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: ['admin', 'super_admin'] },
];

// SVG icons
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const HelpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

function HelpMenu() {
  const {
    available,
    availableTours,
    startViewTour,
    startSequentialTour,
    startMainTour,
  } = useTour();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!available) return null;

  const handle = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="help-menu-wrap" ref={wrapRef}>
      <button
        className="theme-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Take a tour"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open help menu"
      >
        <HelpIcon />
      </button>
      {open && (
        <div className="help-menu" role="menu">
          <button className="help-menu-item help-menu-item--primary" onClick={handle(startSequentialTour)} role="menuitem">
            <span className="help-menu-item-title">Walk me through every tab</span>
            <span className="help-menu-item-sub">A guided tour across the whole app</span>
          </button>
          <button className="help-menu-item" onClick={handle(startMainTour)} role="menuitem">
            <span className="help-menu-item-title">Replay nav walkthrough</span>
            <span className="help-menu-item-sub">Quick orientation of the side nav</span>
          </button>
          <div className="help-menu-section">Tour a specific tab</div>
          {availableTours.map((t) => (
            <button
              key={t.id}
              className="help-menu-item help-menu-item--compact"
              onClick={handle(() => startViewTour(t.id))}
              role="menuitem"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const NavIcon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ── Workflow sidebar (only shown on Create view) ──────────────────
function WorkflowSidebar() {
  const { files, videoUrls, textPrompt, selectedTypes, isGenerating, hasResults } = useGeneration();

  // Active step inferred from progress through the form.
  const getActiveStep = () => {
    if (hasResults || isGenerating) return 'generate';
    if (selectedTypes.size > 0 && (files.length > 0 || videoUrls.length > 0 || textPrompt.trim())) return 'style';
    return 'source';
  };
  const activeStep = getActiveStep();

  const scrollToStep = (id) => {
    const el = document.getElementById(`step-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label">Workflow</div>
      <nav className="sidebar-nav">
        {SIDEBAR_STEPS.map((step) => {
          const isActive = activeStep === step.id;
          const isCompleted = SIDEBAR_STEPS.findIndex(s => s.id === activeStep) > SIDEBAR_STEPS.findIndex(s => s.id === step.id);
          return (
            <button
              key={step.id}
              type="button"
              className={`sidebar-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              onClick={() => scrollToStep(step.id)}
              style={{ background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}
            >
              <span className="step-number">
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : step.num}
              </span>
              <div className="step-info"><div className="step-label">{step.label}</div><div className="step-sublabel">{step.sub}</div></div>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ── Onboarding gate: show flow until user has a company AND at least one brand ──
function OnboardingGate({ children }) {
  const { user, getAuthHeaders } = useAuth();
  const { savedBrands, brandsMeta, loadBrands } = useGeneration();
  const [dismissed, setDismissed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pillarCount, setPillarCount] = useState(null);

  // Load workspace state we use to decide whether onboarding is complete:
  // brands (already in context) and pillars (one extra fetch). Both have to
  // be present before we let the user into the main app — per Shanne's ask,
  // the goal is to prevent generating content before the foundation is set.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [_brands, pillarsRes] = await Promise.all([
          loadBrands(),
          fetch('/api/planner/pillars', { headers: getAuthHeaders() }),
        ]);
        if (cancelled) return;
        if (pillarsRes.ok) {
          const data = await pillarsRes.json();
          setPillarCount((data.pillars || []).length);
        } else {
          setPillarCount(0);
        }
      } catch {
        if (!cancelled) setPillarCount(0);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!checked) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading your workspace...</p>
      </div>
    );
  }

  const needsCompany = !user?.company_id;
  const needsBrand = (savedBrands?.length || brandsMeta?.used || 0) === 0;
  const needsPillars = (pillarCount ?? 0) === 0;
  const needsOnboarding = !dismissed && (needsCompany || needsBrand || needsPillars);

  if (needsOnboarding) {
    return <OnboardingFlow onComplete={() => setDismissed(true)} />;
  }
  return children;
}

// ── Main app shell ──────────────────────────────────────────────
function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('scribeshift-sidebar-open');
    if (stored !== null) return stored === 'true';
    return window.innerWidth >= 900;
  });

  useEffect(() => {
    localStorage.setItem('scribeshift-sidebar-open', String(sidebarOpen));
  }, [sidebarOpen]);

  const [activeView, setActiveView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthKeys = ['linkedin_success','linkedin_error','twitter_success','twitter_error',
      'facebook_success','facebook_error','facebook_select_page',
      'instagram_success','instagram_error','instagram_select_account'];
    if (oauthKeys.some(k => params.has(k))) return 'settings';
    return 'create';
  });

  const visibleViews = NAV_VIEWS.filter(v => v.roles.includes(user?.role || 'user'));

  useEffect(() => {
    const handleHash = () => {
      const target = window.location.hash.replace(/^#/, '');
      if (target && NAV_VIEWS.some(v => v.id === target)) {
        setActiveView(target);
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'planner': return <ErrorBoundary label="Pillars"><ContentPillarGraph /></ErrorBoundary>;
      case 'schedule': return <ErrorBoundary label="Schedule"><ScheduleView /></ErrorBoundary>;
      case 'analytics': return <ErrorBoundary label="Analytics"><AnalyticsDashboard /></ErrorBoundary>;
      case 'history': return <ErrorBoundary label="History"><ContentHistory /></ErrorBoundary>;
      case 'brands': return <ErrorBoundary label="Brands"><BrandsView /></ErrorBoundary>;
      case 'settings': return <ErrorBoundary label="Settings"><ConnectedAccounts /></ErrorBoundary>;
      case 'admin': return <ErrorBoundary label="Admin"><AdminDashboard /></ErrorBoundary>;
      case 'create':
      default:
        return <ErrorBoundary label="Create"><CreateView /></ErrorBoundary>;
    }
  };

  return (
    <TourProvider activeView={activeView} setActiveView={setActiveView}>
      <nav className="app-navbar">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        ><MenuIcon /></button>
        <div className="navbar-brand">
          <svg className="navbar-logo" width="34" height="34" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="44" y2="44"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#2563eb" /></linearGradient></defs>
            <circle cx="22" cy="22" r="20" stroke="url(#logoGrad)" strokeWidth="2.5" /><circle cx="22" cy="22" r="7" fill="url(#logoGrad)" />
          </svg>
          <span className="navbar-title">ScribeShift</span>
        </div>
        <div className="navbar-spacer" />
        <div className="navbar-actions">
          <span className="navbar-user-info">
            {user?.full_name || user?.email?.split('@')[0]}
            <span className="navbar-role-badge">{user?.role?.replace('_', ' ')}</span>
          </span>
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <HelpMenu />
          <button className="logout-btn" onClick={logout} title="Sign out"><LogoutIcon /></button>
        </div>
      </nav>

      <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <SidebarShapes />
          <div className="sidebar-section-label">Views</div>
          <nav className="view-nav">
            {visibleViews.map((view) => (
              <button key={view.id}
                data-tour={`nav-${view.id}`}
                className={`view-nav-btn ${activeView === view.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveView(view.id);
                  if (typeof window !== 'undefined' && window.innerWidth < 900) setSidebarOpen(false);
                }}>
                <NavIcon d={view.icon} /><span>{view.label}</span>
              </button>
            ))}
          </nav>

          {activeView === 'create' && <WorkflowSidebar />}

          <div className="sidebar-divider" />
          <div className="sidebar-footer">
            <div className="sidebar-footer-text">Powered by{' '}<a href="https://www.strideshift.ai/" target="_blank" rel="noopener noreferrer">StrideShift Global</a></div>
          </div>
        </aside>

        <main className="app-main">
          <div className={`main-content ${activeView === 'create' ? 'main-content--narrow' : ''}`}>
            {renderView()}
          </div>
        </main>
      </div>
    </TourProvider>
  );
}

export default function App() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading ScribeShift...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/reset-password')) {
      return <ResetPasswordPage />;
    }
    return <LoginPage />;
  }

  return (
    <GenerationProvider>
      <OnboardingGate>
        <AppShell />
      </OnboardingGate>
    </GenerationProvider>
  );
}
