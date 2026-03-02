import { useState, useRef, useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import LoginPage from './components/LoginPage';
import BrandSetup from './components/BrandSetup';
import MultiFileUpload from './components/MultiFileUpload';
import ContentTypeSelector from './components/ContentTypeSelector';
import StyleOptions from './components/StyleOptions';
import ResultsPanel from './components/ResultsPanel';
import AdminDashboard from './components/AdminDashboard';
import ContentHistory from './components/ContentHistory';
import ScheduleViewComponent from './components/ScheduleView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ConnectedAccounts from './components/ConnectedAccounts';
import ContentPillarGraph from './components/ContentPillarGraph';

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
const NAV_VIEWS = [
  { id: 'create', label: 'Create', icon: 'M12 5v14M5 12h14', roles: ['user', 'admin', 'super_admin'] },
  { id: 'planner', label: 'Planner', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', roles: ['user', 'admin', 'super_admin'] },
  { id: 'schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'history', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'settings', label: 'Settings', icon: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z', roles: ['user', 'admin', 'super_admin'] },
  { id: 'admin', label: 'Admin', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: ['admin', 'super_admin'] },
];

const SIDEBAR_STEPS = [
  { num: 1, label: 'Brand Identity', sub: 'Logo, name & colors', id: 'brand' },
  { num: 2, label: 'Upload Content', sub: 'Files & URLs', id: 'upload' },
  { num: 3, label: 'Content Types', sub: 'Text, social & images', id: 'types' },
  { num: 4, label: 'Style Options', sub: 'Tone, length & audience', id: 'style' },
  { num: 5, label: 'Generate', sub: 'Create your content', id: 'generate' },
  { num: 6, label: 'Results', sub: 'View & download', id: 'results' },
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
const NavIcon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ── Placeholder views (will be replaced with full components) ─────
function ScheduleView() {
  return <ScheduleViewComponent />;
}

function AnalyticsView() {
  return <AnalyticsDashboard />;
}

function HistoryView() {
  return <ContentHistory />;
}

function AdminView() {
  return <AdminDashboard />;
}

export default function App() {
  const { user, loading, isAuthenticated, logout, getAuthHeaders } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('create');

  // Brand identity
  const [brand, setBrand] = useState({
    brandName: '',
    primaryColor: '#3b82f6',
    secondaryColor: '#475569',
    logoBase64: null,
    logoPreviewUrl: null,
  });

  // File uploads & inputs
  const [files, setFiles] = useState([]);
  const [videoUrls, setVideoUrls] = useState([]);
  const [textPrompt, setTextPrompt] = useState('');

  // Content generation
  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [options, setOptions] = useState({
    tone: 'conversational',
    toneMode: 'preset',
    detectedTone: '',
    customTone: '',
    polish: 'natural',
    length: 'standard',
    audience: 'general',
    industry: 'general',
    goal: 'none',
  });
  const [isDetectingTone, setIsDetectingTone] = useState(false);
  const [imageConfig, setImageConfig] = useState({
    selectedStyles: new Set(['minimal', 'vibrant', 'editorial']),
    customGuidelines: '',
    customStylePrompt: '',
  });
  const [content, setContent] = useState({});
  const [images, setImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [isImageRegenerating, setIsImageRegenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [error, setError] = useState('');
  const resultRef = useRef(null);

  const sectionRefs = {
    brand: useRef(null),
    upload: useRef(null),
    types: useRef(null),
    style: useRef(null),
    generate: useRef(null),
    results: resultRef,
  };

  // Auth loading screen
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading ScribeShift...</p>
      </div>
    );
  }

  // Not authenticated - show login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const canGenerate = (files.length > 0 || videoUrls.length > 0 || textPrompt.trim().length > 0) && selectedTypes.size > 0 && !isGenerating;
  const hasResults = Object.keys(content).length > 0 || images.length > 0;

  const scrollToSection = (id) => {
    sectionRefs[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setSidebarOpen(false);
  };

  const getActiveStep = () => {
    if (hasResults) return 'results';
    if (isGenerating) return 'generate';
    if (selectedTypes.size > 0) return 'generate';
    if (files.length > 0 || videoUrls.length > 0 || textPrompt.trim()) return 'types';
    if (brand.brandName || brand.logoBase64) return 'upload';
    return 'brand';
  };

  const activeStep = getActiveStep();

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError('');
    setContent({});
    setImages([]);

    const types = [...selectedTypes];
    const textTypes = types.filter(t => t !== 'images');
    const wantImages = types.includes('images');
    const totalSteps = textTypes.length + (wantImages ? 1 : 0);

    const hasMedia = files.some(f => f.type?.startsWith('video/') || f.type?.startsWith('audio/'));
    const hasYouTube = videoUrls.some(u => u.includes('youtube.com') || u.includes('youtu.be'));
    const prepLabel = (hasMedia || hasYouTube) ? 'Processing media & extracting transcripts...' : 'Preparing...';
    setProgress({ current: 0, total: totalSteps, label: prepLabel });

    const authHeaders = getAuthHeaders();

    try {
      if (textTypes.length > 0) {
        setProgress({ current: 0, total: totalSteps, label: 'Generating text content...' });

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('contentTypes', JSON.stringify(textTypes));
        formData.append('options', JSON.stringify(options));
        formData.append('brandData', JSON.stringify({
          brandName: brand.brandName,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
        }));
        formData.append('videoUrls', JSON.stringify(videoUrls));
        if (textPrompt.trim()) {
          formData.append('textPrompt', textPrompt.trim());
        }

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });
        if (!res.ok && res.headers.get('content-type')?.indexOf('application/json') === -1) {
          throw new Error(`Server error (${res.status}). The request may have timed out.`);
        }
        const data = await res.json();

        if (!data.success) {
          setError(data.error || 'Text generation failed');
          setIsGenerating(false);
          return;
        }

        setContent(data.content);
        setProgress({ current: textTypes.length, total: totalSteps, label: wantImages ? 'Text done, generating images...' : 'Done!' });
      }

      if (wantImages) {
        setIsImageGenerating(true);
        const topicSummary = brand.brandName
          ? `Professional content for ${brand.brandName}`
          : 'Content based on uploaded materials';

        // Step 1: Get prompts from server (fast, no image generation)
        const promptRes = await fetch('/api/build-image-prompts', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicSummary,
            brandData: {
              brandName: brand.brandName,
              primaryColor: brand.primaryColor,
              secondaryColor: brand.secondaryColor,
              logoBase64: brand.logoBase64,
            },
            selectedStyles: [...imageConfig.selectedStyles],
            customGuidelines: imageConfig.customGuidelines,
            customStylePrompt: imageConfig.customStylePrompt,
          }),
        });
        const promptData = await promptRes.json();
        if (!promptData.success) {
          setError(prev => prev ? `${prev}\n${promptData.error}` : promptData.error);
          setIsImageGenerating(false);
        } else {
          // Step 2: Generate each image individually (each call < 60s)
          const totalImages = promptData.prompts.length;
          const imageResults = [];
          let completed = 0;

          for (const { style, variant, prompt } of promptData.prompts) {
            setProgress(prev => ({ ...prev, label: `Generating image ${completed + 1} of ${totalImages} (${style})...` }));
            try {
              const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, logoBase64: brand.logoBase64 }),
              });
              const data = await res.json();
              imageResults.push({ style, variant, prompt, ...data });
            } catch (imgErr) {
              imageResults.push({ style, variant, prompt, success: false, error: imgErr.message });
            }
            completed++;
            setImages([...imageResults]);
          }
          setIsImageGenerating(false);
        }
      }

      setProgress({ current: totalSteps, total: totalSteps, label: 'Done!' });
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsGenerating(false);
      setIsImageGenerating(false);
    }
  };

  const handleContentUpdate = (platform, newContent) => {
    setContent(prev => ({ ...prev, [platform]: newContent }));
  };

  const handleRegenerateImage = async (imageIndex, prompt) => {
    setIsImageRegenerating(true);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, logoBase64: brand.logoBase64 }),
      });
      const data = await res.json();
      if (data.success) {
        setImages(prev => prev.map((img, i) =>
          i === imageIndex ? { ...img, base64: data.base64, mimeType: data.mimeType, prompt, success: true } : img
        ));
      } else {
        setError(`Image regeneration failed: ${data.error}`);
      }
    } catch (err) {
      setError(`Image regeneration error: ${err.message}`);
    } finally {
      setIsImageRegenerating(false);
    }
  };

  const handleGenerateVariations = async (imageIndex, basePrompt) => {
    setIsImageRegenerating(true);
    try {
      const sourceImg = images[imageIndex];
      const variationPrompts = [
        `${basePrompt}\n\nCreate variation 1: Keep the same overall theme and brand elements but adjust the composition, color balance, and visual details for a fresh take.`,
        `${basePrompt}\n\nCreate variation 2: Same topic and brand but explore a different visual approach — different layout, different emphasis, different mood within the same style family.`,
        `${basePrompt}\n\nCreate variation 3: A complementary piece that could sit alongside the original in a series. Same visual language but distinct enough to stand on its own.`,
      ];

      const newImages = [];
      for (let i = 0; i < variationPrompts.length; i++) {
        try {
          const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: variationPrompts[i], logoBase64: brand.logoBase64 }),
          });
          const data = await res.json();
          if (data.success) {
            newImages.push({
              base64: data.base64,
              mimeType: data.mimeType,
              prompt: variationPrompts[i],
              style: sourceImg.style,
              variant: (images.filter(img => img.style === sourceImg.style).length + i),
              success: true,
            });
          }
        } catch { /* continue on individual failures */ }
        if (i < variationPrompts.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages]);
      }
    } catch (err) {
      setError(`Variation generation error: ${err.message}`);
    } finally {
      setIsImageRegenerating(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const visibleViews = NAV_VIEWS.filter(v => v.roles.includes(user?.role || 'user'));

  const renderView = () => {
    switch (activeView) {
      case 'planner': return <ContentPillarGraph />;
      case 'schedule': return <ScheduleView />;
      case 'analytics': return <AnalyticsView />;
      case 'history': return <HistoryView />;
      case 'settings': return <ConnectedAccounts />;
      case 'admin': return <AdminView />;
      case 'create':
      default:
        return (
          <>
            <div className="section-header">
              <h1 className="section-title">Content Generation</h1>
              <p className="section-desc">Transform any content into polished, multi-format media</p>
            </div>
            <div ref={sectionRefs.brand} className="reveal"><BrandSetup brand={brand} onChange={setBrand} /></div>
            <div ref={sectionRefs.upload} className="reveal reveal-delay-1">
              <MultiFileUpload files={files} onFilesChange={setFiles} videoUrls={videoUrls} onVideoUrlsChange={setVideoUrls} textPrompt={textPrompt} onTextPromptChange={setTextPrompt} />
            </div>
            <div ref={sectionRefs.types} className="reveal reveal-delay-2">
              <ContentTypeSelector selected={selectedTypes} onChange={setSelectedTypes} imageConfig={imageConfig} onImageConfigChange={setImageConfig} />
            </div>
            <div ref={sectionRefs.style} className="reveal reveal-delay-3"><StyleOptions options={options} onChange={setOptions} files={files} videoUrls={videoUrls} textPrompt={textPrompt} isDetectingTone={isDetectingTone} setIsDetectingTone={setIsDetectingTone} getAuthHeaders={getAuthHeaders} /></div>
            <div ref={sectionRefs.generate} className="reveal reveal-delay-4">
              <div className="card">
                <div className="card-title"><span className="step">5</span> Generate</div>
                {error && <div className="error-msg">{error}</div>}
                <button className={`btn btn-primary generate-btn ${isGenerating ? 'loading' : ''}`} onClick={handleGenerate} disabled={!canGenerate}>
                  {isGenerating ? '' : 'Generate Content'}
                </button>
                {(isGenerating || isImageGenerating) && (
                  <div className="progress-area">
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="progress-label">{progress.label}</div>
                  </div>
                )}
              </div>
            </div>
            <div ref={resultRef}>
              {hasResults && (
                <div className="reveal visible">
                  <ResultsPanel content={content} images={images} brand={brand} onContentUpdate={handleContentUpdate} onRegenerateImage={handleRegenerateImage} onGenerateVariations={handleGenerateVariations} isImageRegenerating={isImageRegenerating} />
                </div>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <>
      <nav className="app-navbar">
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}><MenuIcon /></button>
        <div className="navbar-brand">
          <svg className="navbar-logo" width="34" height="34" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="44" y2="44"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#2563eb" /></linearGradient></defs>
            <circle cx="22" cy="22" r="20" stroke="url(#logoGrad)" strokeWidth="2.5" /><circle cx="22" cy="22" r="7" fill="url(#logoGrad)" />
          </svg>
          <span className="navbar-title">Scribe Shift</span>
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
          <button className="logout-btn" onClick={logout} title="Sign out"><LogoutIcon /></button>
        </div>
      </nav>

      <div className="app-layout">
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-section-label">Views</div>
          <nav className="view-nav">
            {visibleViews.map((view) => (
              <button key={view.id} className={`view-nav-btn ${activeView === view.id ? 'active' : ''}`}
                onClick={() => { setActiveView(view.id); setSidebarOpen(false); }}>
                <NavIcon d={view.icon} /><span>{view.label}</span>
              </button>
            ))}
          </nav>

          {activeView === 'create' && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Workflow</div>
              <nav className="sidebar-nav">
                {SIDEBAR_STEPS.map((step) => {
                  const isActive = activeStep === step.id;
                  const isCompleted = SIDEBAR_STEPS.findIndex(s => s.id === activeStep) > SIDEBAR_STEPS.findIndex(s => s.id === step.id);
                  return (
                    <div key={step.id} className={`sidebar-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                      onClick={() => scrollToSection(step.id)}>
                      <span className="step-number">
                        {isCompleted ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : step.num}
                      </span>
                      <div className="step-info"><div className="step-label">{step.label}</div><div className="step-sublabel">{step.sub}</div></div>
                    </div>
                  );
                })}
              </nav>
            </>
          )}

          <div className="sidebar-divider" />
          <div className="sidebar-footer">
            <div className="sidebar-footer-text">Powered by{' '}<a href="https://www.strideshift.ai/" target="_blank" rel="noopener noreferrer">StrideShift Global</a></div>
          </div>
        </aside>

        <main className="app-main"><div className="main-content">{renderView()}</div></main>
      </div>
    </>
  );
}
