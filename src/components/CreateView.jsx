import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useGeneration } from './GenerationContext';
import ResultsPanel from './ResultsPanel';

/* ─── Content type definitions with icons ─── */
const CONTENT_TYPES = [
  {
    value: 'linkedin',
    title: 'LinkedIn',
    desc: '5 professional thought-leadership posts',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
    color: '#0A66C2',
  },
  {
    value: 'twitter',
    title: 'Twitter / X',
    desc: '5 punchy, shareable posts',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    color: '#1DA1F2',
  },
  {
    value: 'facebook',
    title: 'Facebook',
    desc: '5 engaging, conversational posts',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
    color: '#1877F2',
  },
  {
    value: 'instagram',
    title: 'Instagram',
    desc: '5 captions with hashtags & image ideas',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
    color: '#E4405F',
  },
  {
    value: 'blog',
    title: 'Blog Post',
    desc: '600 words, conversational tone',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    color: '#8B5CF6',
  },
  {
    value: 'newsletter',
    title: 'Newsletter',
    desc: 'Warm, branded email format',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    color: '#F59E0B',
  },
  {
    value: 'video',
    title: 'Video Script',
    desc: '3-5 min with visual directions',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    color: '#EC4899',
  },
  {
    value: 'images',
    title: 'Image Suite',
    desc: 'AI-generated branded visuals',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    color: '#06B6D4',
  },
];

/* ─── Image styles ─── */
const IMAGE_STYLES = [
  { key: 'minimal', name: 'Clean & Minimal', desc: 'Flat shapes, whitespace, Swiss-design', gradient: 'linear-gradient(135deg, #e2e8f0, #f8fafc, #cbd5e1)' },
  { key: 'vibrant', name: 'Bold & Vibrant', desc: 'Saturated colors, geometric, energetic', gradient: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)' },
  { key: 'editorial', name: 'Editorial', desc: 'Professional, magazine-quality, polished', gradient: 'linear-gradient(135deg, #1e293b, #334155, #475569)' },
  { key: 'artistic', name: 'Artistic', desc: 'Painterly, mixed-media, textured', gradient: 'linear-gradient(135deg, #c084fc, #fb923c, #34d399)' },
  { key: 'retro', name: 'Retro', desc: '70s/80s vintage, warm film tones', gradient: 'linear-gradient(135deg, #d97706, #b45309, #92400e)' },
  { key: 'modern', name: 'Modern', desc: 'Glass-morphism, gradients, sleek UI', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6)' },
  { key: 'futuristic', name: 'Futuristic', desc: 'Neon grids, cyberpunk, sci-fi glow', gradient: 'linear-gradient(135deg, #0f172a, #7c3aed, #06ffc7)' },
  { key: 'cinematic', name: 'Cinematic', desc: 'Movie-poster lighting, dramatic depth', gradient: 'linear-gradient(135deg, #0c0a09, #dc2626, #f59f0a)' },
];

/* ─── Tone presets ─── */
const TONES = [
  { value: 'conversational', label: 'Conversational', desc: 'Like explaining to a friend over coffee' },
  { value: 'professional', label: 'Professional', desc: 'Authoritative without being stiff' },
  { value: 'friendly', label: 'Friendly', desc: 'Warm and approachable, genuine not forced' },
  { value: 'provocative', label: 'Provocative', desc: 'Bold takes that challenge assumptions' },
  { value: 'challenging', label: 'Challenging', desc: 'Pushes readers to rethink what they know' },
];

const SIDEBAR_STEPS = [
  { num: 1, label: 'Source', sub: 'Topic + content type', id: 'source' },
  { num: 2, label: 'Style', sub: 'Voice + visuals', id: 'style' },
  { num: 3, label: 'Generate', sub: 'Review & create', id: 'generate' },
];

export { SIDEBAR_STEPS };

const ACCEPTED = '.txt,.doc,.docx,.pdf,.md,.jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.webm,.mkv,.mp3,.wav,.m4a,.ogg';

/* ─── Branded picker — shows logo/swatch + name + chevron, opens a popover ─── */
function BrandPicker({ brands, activeBrandId, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const active = brands.find(b => b.id === activeBrandId) || brands[0];

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const renderBadge = (brand, size = 22) => {
    if (brand?.logo_url) {
      return <img src={brand.logo_url} alt="" className="brand-picker-logo" style={{ width: size, height: size }} />;
    }
    const letter = (brand?.brand_name || '?').charAt(0).toUpperCase();
    return (
      <span
        className="brand-picker-logo brand-picker-logo--placeholder"
        style={{ width: size, height: size, background: brand?.primary_color || '#3b82f6' }}
      >
        {letter}
      </span>
    );
  };

  return (
    <div className="brand-picker" ref={wrapRef}>
      <button
        type="button"
        className={`brand-picker-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active ? renderBadge(active) : null}
        <span className="brand-picker-name">{active?.brand_name || '(no brand)'}</span>
        <svg className="brand-picker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="brand-picker-menu" role="listbox">
          {brands.map(b => {
            const isActive = b.id === active?.id;
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`brand-picker-option ${isActive ? 'is-active' : ''}`}
                onClick={() => { onChange(b.id); setOpen(false); }}
              >
                {renderBadge(b, 26)}
                <span className="brand-picker-option-name">{b.brand_name || '(unnamed)'}</span>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CreateView() {
  const { getAuthHeaders } = useAuth();
  const {
    brand, setBrand,
    savedBrands, activeBrandId, setActiveBrandId,
    files, setFiles,
    videoUrls, setVideoUrls,
    textPrompt, setTextPrompt,
    selectedTypes, setSelectedTypes,
    options, setOptions,
    isDetectingTone, setIsDetectingTone,
    imageConfig, setImageConfig,
    content, images,
    isGenerating, isImageGenerating, isImageRegenerating,
    progress, pct,
    error,
    resultRef,
    canGenerate, hasResults,
    handleGenerate,
    handleContentUpdate,
    handleRegenerateImage,
    handleEditImage,
    handleGenerateVariations,
  } = useGeneration();

  const [inputTab, setInputTab] = useState('write');
  const [urlInput, setUrlInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [toneError, setToneError] = useState('');
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  /* ─── Content type toggle ─── */
  const toggleType = (val) => {
    const next = new Set(selectedTypes);
    if (next.has(val)) next.delete(val); else next.add(val);
    setSelectedTypes(next);
  };

  /* ─── File handling ─── */
  const MAX_FILE_SIZE = 200 * 1024 * 1024;
  const addFiles = (newFiles) => {
    setUploadError('');
    const existing = new Set(files.map(f => f.name + f.size));
    const unique = [...newFiles].filter(f => !existing.has(f.name + f.size));
    const oversized = unique.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setUploadError(`File too large: ${oversized.map(f => f.name).join(', ')} (max 200MB)`);
      const valid = unique.filter(f => f.size <= MAX_FILE_SIZE);
      if (valid.length > 0) setFiles([...files, ...valid]);
      return;
    }
    setFiles([...files, ...unique]);
  };

  const removeFile = (index) => setFiles(files.filter((_, i) => i !== index));

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };

  const addUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!videoUrls.includes(url)) setVideoUrls([...videoUrls, url]);
    setUrlInput('');
  };

  const removeUrl = (index) => setVideoUrls(videoUrls.filter((_, i) => i !== index));

  /* ─── Voice recording ─── */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-recording-${Date.now()}.webm`, { type: 'audio/webm' });
        setFiles(prev => [...prev, file]);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setUploadError('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  /* ─── Tone detection ─── */
  const hasContent = files.length > 0 || videoUrls.length > 0 || (textPrompt && textPrompt.trim().length > 0);

  const handleDetectTone = async () => {
    if (!hasContent || isDetectingTone) return;
    setIsDetectingTone(true);
    setToneError('');
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('videoUrls', JSON.stringify(videoUrls));
      if (textPrompt?.trim()) formData.append('textPrompt', textPrompt.trim());
      const res = await fetch('/api/detect-tone', { method: 'POST', headers: getAuthHeaders(), body: formData });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      if (data.success && data.detectedTone) {
        setOptions(prev => ({ ...prev, detectedTone: data.detectedTone, toneMode: 'detected' }));
      } else {
        setToneError(data.error || 'Could not detect tone.');
      }
    } catch (err) {
      setToneError(`Tone detection failed: ${err.message}`);
    } finally {
      setIsDetectingTone(false);
    }
  };

  const set = (key, val) => setOptions(prev => ({ ...prev, [key]: val }));

  /* ─── Image style toggle ─── */
  const toggleStyle = (key) => {
    const next = new Set(imageConfig.selectedStyles);
    if (next.has(key)) next.delete(key); else next.add(key);
    setImageConfig({ ...imageConfig, selectedStyles: next });
  };

  const imagesSelected = selectedTypes.has('images');
  const styleCount = imageConfig.selectedStyles.size;
  const customAdds = imageConfig.customStylePrompt.trim() ? 3 : 0;
  const totalImages = (styleCount * 3) + customAdds;

  /* ─── Format helpers ─── */
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /* ─── Summary for review step ─── */
  const selectedTypeLabels = CONTENT_TYPES.filter(t => selectedTypes.has(t.value)).map(t => t.title);
  const activeBrand = savedBrands.find(b => b.id === activeBrandId);
  const hasNoBrands = savedBrands.length === 0;
  // Block generation when there's no brand to attribute the content to —
  // prevents fully-generic output and makes the missing setup obvious.
  const blockGenerate = hasNoBrands || !canGenerate;

  return (
    <>
      {/* ─── Header with active brand picker ─── */}
      <div className="section-header create-header">
        <h1 className="section-title create-title">
          Create Content
          <svg className="create-sparkle" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" />
            <path d="M19 14l.7 1.7L21.5 16l-1.8.6L19 18l-.7-1.4L16.5 16l1.8-.3z" opacity="0.7" />
          </svg>
        </h1>
        <p className="section-desc">Three simple steps. Your brand voice is loaded automatically.</p>
        {hasNoBrands ? (
          <div className="create-empty-brand-card">
            <div>
              <h3 style={{ margin: '0 0 0.25rem 0' }}>No brand set up yet</h3>
              <p className="card-subtitle" style={{ marginTop: 0 }}>
                You need a brand before you can generate content. Brands hold the voice, audience, and visual identity that the AI mirrors.
              </p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => { window.location.hash = 'brands'; }}
                style={{ marginTop: '0.75rem' }}
              >
                Set up your first brand →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="create-brand-row" data-tour="create-brand-selector">
              <span className="create-brand-row-label">Generating for:</span>
              <BrandPicker
                brands={savedBrands}
                activeBrandId={activeBrandId}
                onChange={setActiveBrandId}
              />
              <a
                href="#brands"
                className="create-brand-manage"
                onClick={(e) => { e.preventDefault(); window.location.hash = 'brands'; }}
              >
                Manage brands
              </a>
            </div>
            {activeBrand && !activeBrand.icp_description && !activeBrand.brand_guidelines && (!activeBrand.writing_samples || activeBrand.writing_samples.filter(s => s && s.trim()).length === 0) && (
              <button
                type="button"
                className="create-voice-warning"
                onClick={() => { window.location.hash = 'brands'; }}
              >
                <svg className="create-voice-warning-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="create-voice-warning-text">
                  This brand has no voice fields set. <span className="create-voice-warning-link">Add ICP, guidelines, and writing samples</span> to dramatically improve match.
                </span>
                <svg className="create-voice-warning-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══ STEP 1: Source — content type + topic ═══ */}
      <div id="step-source" className="reveal">
        <div className="card">
          <div className="card-title"><span className="step">1</span> What are you creating, and what's it about?</div>

          <p className="card-subtitle" style={{ marginBottom: '0.75rem' }}>Pick one or more formats — we'll generate them all.</p>
          <div className="wizard-type-grid">
            {CONTENT_TYPES.map((t) => {
              const isActive = selectedTypes.has(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  className={`wizard-type-card ${isActive ? 'selected' : ''}`}
                  onClick={() => toggleType(t.value)}
                >
                  <div className="wizard-type-icon" style={{ color: isActive ? '#fff' : t.color, background: isActive ? t.color : `${t.color}12` }}>
                    {t.icon}
                  </div>
                  <div className="wizard-type-label">{t.title}</div>
                  <div className="wizard-type-desc">{t.desc}</div>
                  {isActive && (
                    <div className="wizard-type-check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {selectedTypes.size > 0 && (
            <p className="card-subtitle" style={{ marginTop: '0.5rem' }}>
              {selectedTypes.size} format{selectedTypes.size > 1 ? 's' : ''} selected
            </p>
          )}

          <div style={{ height: '1.25rem' }} />

          <p className="card-subtitle" style={{ marginBottom: '0.75rem' }}>Now share your topic or source — write, upload, paste a URL, or record.</p>
          <div className="wizard-input-tabs">
            <button type="button" className={`wizard-tab ${inputTab === 'write' ? 'active' : ''}`} onClick={() => setInputTab('write')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Write
            </button>
            <button type="button" className={`wizard-tab ${inputTab === 'upload' ? 'active' : ''}`} onClick={() => setInputTab('upload')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload
            </button>
            <button type="button" className={`wizard-tab ${inputTab === 'url' ? 'active' : ''}`} onClick={() => setInputTab('url')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              URL
            </button>
            <button type="button" className={`wizard-tab ${inputTab === 'voice' ? 'active' : ''}`} onClick={() => setInputTab('voice')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Record
            </button>
          </div>

          {inputTab === 'write' && (
            <div className="wizard-input-area">
              <textarea
                className="wizard-textarea"
                placeholder="e.g. Write about the future of AI in marketing, focusing on personalization at scale..."
                value={textPrompt || ''}
                onChange={(e) => setTextPrompt(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {inputTab === 'upload' && (
            <div className="wizard-input-area">
              {uploadError && <div className="error-msg" style={{ marginBottom: '0.75rem' }}>{uploadError}</div>}
              <div
                className={`wizard-upload-zone ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
              >
                <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div className="wizard-upload-label">Drop files here or click to browse</div>
                <div className="wizard-upload-hint">Documents, images, video & audio — up to 200MB each</div>
              </div>

              {files.length > 0 && (
                <div className="wizard-file-list">
                  {files.map((f, i) => (
                    <div key={i} className="wizard-file-item">
                      <span className="wizard-file-name">{f.name}</span>
                      <span className="wizard-file-size">{formatSize(f.size)}</span>
                      <button className="wizard-file-remove" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {inputTab === 'url' && (
            <div className="wizard-input-area">
              <div className="wizard-url-row">
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=... or any URL"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                  className="wizard-url-input"
                />
                <button className="btn" onClick={addUrl} type="button">Add</button>
              </div>
              {videoUrls.length > 0 && (
                <div className="wizard-url-list">
                  {videoUrls.map((url, i) => (
                    <div key={i} className="wizard-url-badge">
                      <span>{url.length > 55 ? url.slice(0, 55) + '...' : url}</span>
                      <button onClick={() => removeUrl(i)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {inputTab === 'voice' && (
            <div className="wizard-input-area">
              <div className="wizard-voice-area">
                <button
                  className={`wizard-voice-btn ${isRecording ? 'recording' : ''}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  type="button"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
                {isRecording && <span className="wizard-recording-dot">Recording in progress...</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ STEP 2: Style — tone, audience, length, visuals ═══ */}
      <div id="step-style" className="reveal reveal-delay-1">
        <div className="card">
          <div className="card-title"><span className="step">2</span> Set the voice and any visual style</div>

          {/* Audience + length + goal in one row */}
          <div className="wizard-options-row">
            <div className="wizard-option-group">
              <label>Audience</label>
              <select value={options.audience} onChange={(e) => set('audience', e.target.value)}>
                <option value="general">General</option>
                <option value="executives">Executives</option>
                <option value="technical">Technical</option>
                <option value="educators">Educators</option>
              </select>
            </div>
            <div className="wizard-option-group">
              <label>Length</label>
              <select value={options.length} onChange={(e) => set('length', e.target.value)}>
                <option value="short">Short</option>
                <option value="standard">Standard</option>
                <option value="long">Long</option>
              </select>
            </div>
            <div className="wizard-option-group">
              <label>Goal</label>
              <select value={options.goal || 'none'} onChange={(e) => set('goal', e.target.value)}>
                <option value="none">No specific goal</option>
                <option value="engagement">Engagement</option>
                <option value="lead_generation">Lead generation</option>
                <option value="authority">Build authority</option>
                <option value="awareness">Brand awareness</option>
                <option value="signups">Drive signups</option>
              </select>
            </div>
            <div className="wizard-option-group">
              <label>Edit level</label>
              <select value={options.polish || 'natural'} onChange={(e) => set('polish', e.target.value)}>
                <option value="raw">Raw</option>
                <option value="natural">Natural</option>
                <option value="balanced">Balanced</option>
                <option value="polished">Polished</option>
              </select>
            </div>
          </div>

          {/* Tone */}
          <div className="wizard-tone-section" style={{ marginTop: '1rem' }}>
            <label className="wizard-context-label" style={{ marginBottom: '0.5rem' }}>Tone</label>

            <div className="wizard-tone-mode-row">
              <button type="button" className={`wizard-tone-mode ${options.toneMode === 'preset' ? 'active' : ''}`} onClick={() => set('toneMode', 'preset')}>Preset</button>
              <button
                type="button"
                className={`wizard-tone-mode ${options.toneMode === 'detected' ? 'active' : ''}`}
                onClick={() => { if (options.detectedTone) set('toneMode', 'detected'); else if (hasContent) handleDetectTone(); }}
                disabled={!hasContent && !options.detectedTone}
                title={!hasContent && !options.detectedTone ? 'Upload a file or paste a URL first' : ''}
              >
                {isDetectingTone ? 'Detecting...' : 'Detect from content'}
              </button>
              <button type="button" className={`wizard-tone-mode ${options.toneMode === 'custom' ? 'active' : ''}`} onClick={() => set('toneMode', 'custom')}>Custom</button>
            </div>

            {toneError && <div className="error-msg" style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>{toneError}</div>}

            {options.toneMode === 'preset' && (
              <div className="wizard-tone-pills">
                {TONES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    className={`wizard-tone-pill ${options.tone === t.value ? 'active' : ''}`}
                    onClick={() => set('tone', t.value)}
                  >
                    {t.label}
                  </button>
                ))}
                <p className="wizard-tone-hint">{TONES.find(t => t.value === options.tone)?.desc}</p>
              </div>
            )}

            {options.toneMode === 'detected' && (
              <div className="wizard-detected-tone">
                {options.detectedTone ? (
                  <>
                    <p className="detected-tone-text">{options.detectedTone}</p>
                    <button type="button" className="btn btn-sm" onClick={handleDetectTone} disabled={!hasContent || isDetectingTone}>
                      {isDetectingTone ? 'Re-analyzing...' : 'Re-detect'}
                    </button>
                  </>
                ) : (
                  <div className="detected-tone-empty">
                    <p>Analyzing your content to detect tone...</p>
                    <div className="loading-spinner" style={{ width: 24, height: 24 }} />
                  </div>
                )}
              </div>
            )}

            {options.toneMode === 'custom' && (
              <textarea
                className="wizard-textarea"
                value={options.customTone || ''}
                onChange={(e) => set('customTone', e.target.value)}
                placeholder="Describe the tone, e.g. 'Direct and punchy, like a seasoned founder.'"
                rows={3}
                style={{ marginTop: '0.75rem' }}
              />
            )}
          </div>

          {/* Visual style — only when 'images' is selected */}
          {imagesSelected && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '1.5rem 0 1rem' }} />
              <label className="wizard-context-label" style={{ marginBottom: '0.5rem' }}>Visual style</label>

              <div className="image-style-grid">
                {IMAGE_STYLES.map((style) => {
                  const isActive = imageConfig.selectedStyles.has(style.key);
                  return (
                    <div
                      key={style.key}
                      className={`image-style-card ${isActive ? 'selected' : ''}`}
                      onClick={() => toggleStyle(style.key)}
                    >
                      <div className="style-swatch" style={{ background: style.gradient }} />
                      <div className="style-card-info">
                        <div className="style-card-name">{style.name}</div>
                        <div className="style-card-desc">{style.desc}</div>
                      </div>
                      {isActive && (
                        <div className="style-check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="wizard-image-extras">
                <div className="wizard-context-block" style={{ flex: 1 }}>
                  <label className="wizard-context-label">Additional guidelines</label>
                  <textarea
                    className="wizard-textarea"
                    placeholder="e.g. Use abstract geometric shapes, dark backgrounds..."
                    value={imageConfig.customGuidelines}
                    onChange={(e) => setImageConfig({ ...imageConfig, customGuidelines: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="wizard-context-block" style={{ flex: 1 }}>
                  <label className="wizard-context-label">Custom style prompt (+3 images)</label>
                  <textarea
                    className="wizard-textarea"
                    placeholder="e.g. Watercolor illustration on aged paper..."
                    value={imageConfig.customStylePrompt}
                    onChange={(e) => setImageConfig({ ...imageConfig, customStylePrompt: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              <div className="wizard-context-block" style={{ marginTop: '0.75rem' }}>
                <label className="wizard-context-label">Things to avoid</label>
                <textarea
                  className="wizard-textarea"
                  placeholder="e.g. No text rendered in the image, no human figures, no clichéd metaphors..."
                  value={imageConfig.avoidList || ''}
                  onChange={(e) => setImageConfig({ ...imageConfig, avoidList: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="image-summary">
                {styleCount} style{styleCount !== 1 ? 's' : ''} selected
                {customAdds > 0 ? ' + custom' : ''} — <strong>{totalImages} images</strong> will be generated
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ STEP 3: Review & Generate ═══ */}
      <div id="step-generate" className="reveal reveal-delay-2">
        <div className="card wizard-generate-card">
          <div className="card-title"><span className="step">3</span> Review and generate</div>

          <div className="wizard-review-summary">
            <div className="wizard-review-row">
              <span className="wizard-review-label">Brand</span>
              <span className="wizard-review-value">
                {activeBrand ? activeBrand.brand_name : <em className="wizard-review-empty">None selected</em>}
              </span>
            </div>
            <div className="wizard-review-row">
              <span className="wizard-review-label">Formats</span>
              <span className="wizard-review-value">
                {selectedTypeLabels.length > 0 ? selectedTypeLabels.join(', ') : <em className="wizard-review-empty">None selected</em>}
              </span>
            </div>
            <div className="wizard-review-row">
              <span className="wizard-review-label">Topic</span>
              <span className="wizard-review-value">
                {textPrompt ? (textPrompt.length > 60 ? textPrompt.slice(0, 60) + '...' : textPrompt)
                  : files.length > 0 ? `${files.length} file(s) uploaded`
                  : videoUrls.length > 0 ? `${videoUrls.length} URL(s) added`
                  : <em className="wizard-review-empty">Not specified</em>}
              </span>
            </div>
            <div className="wizard-review-row">
              <span className="wizard-review-label">Tone</span>
              <span className="wizard-review-value" style={{ textTransform: 'capitalize' }}>
                {options.toneMode === 'detected' ? 'Auto-detected' : options.toneMode === 'custom' ? 'Custom' : options.tone}
              </span>
            </div>
            {imagesSelected && (
              <div className="wizard-review-row">
                <span className="wizard-review-label">Images</span>
                <span className="wizard-review-value">{totalImages} ({styleCount} styles)</span>
              </div>
            )}
          </div>

          {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}

          <button
            className={`btn btn-primary generate-btn wizard-generate-btn ${isGenerating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={blockGenerate}
            title={hasNoBrands ? 'Set up a brand first' : ''}
          >
            {isGenerating ? (
              <>
                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Generating...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate Content
              </>
            )}
          </button>

          {(isGenerating || isImageGenerating) && (
            <div className="progress-area" style={{ marginTop: '1rem' }}>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <div className="progress-label">{progress.label}</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Results ─── */}
      <div ref={resultRef}>
        {hasResults && (
          <div className="reveal visible">
            <ResultsPanel
              content={content} images={images} brand={brand}
              onContentUpdate={handleContentUpdate}
              onRegenerateImage={handleRegenerateImage}
              onEditImage={handleEditImage}
              onGenerateVariations={handleGenerateVariations}
              isImageRegenerating={isImageRegenerating}
            />
          </div>
        )}
      </div>
    </>
  );
}
