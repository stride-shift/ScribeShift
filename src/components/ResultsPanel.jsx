import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import SocialPreview from './SocialPreview';
import ImageGallery from './ImageGallery';
import BlogPreview from './BlogPreview';
import NewsletterPreview from './NewsletterPreview';
import AudioPlayer from './AudioPlayer';
import ScheduleFromResults from './ScheduleFromResults';

const TEXT_TYPES = ['blog', 'video', 'newsletter'];
const SOCIAL_TYPES = ['linkedin', 'twitter', 'facebook', 'instagram'];
const ALL_SOCIAL = ['linkedin', 'twitter', 'facebook', 'instagram'];

const TYPE_NAMES = {
  blog: 'Blog Post',
  video: 'Video Script',
  newsletter: 'Newsletter',
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  images: 'Images',
};

const GROUP_ICONS = {
  text: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  social: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  media: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
};

export default function ResultsPanel({
  content,
  images,
  brand,
  onContentUpdate,
  onRegenerateImage,
  onGenerateVariations,
  isImageRegenerating,
}) {
  const { getAuthHeaders } = useAuth();
  const types = Object.keys(content);
  const hasImages = images && images.length > 0;

  const textTabs = types.filter(t => TEXT_TYPES.includes(t));
  const socialTabs = types.filter(t => SOCIAL_TYPES.includes(t));
  const allTabs = [...textTabs, ...socialTabs, ...(hasImages ? ['images'] : [])];

  const [activeTab, setActiveTab] = useState(allTabs[0] || '');
  const [ttsAudio, setTtsAudio] = useState({});
  const [ttsLoading, setTtsLoading] = useState({});
  const [showSchedule, setShowSchedule] = useState(false);
  const [isExpandingPlatforms, setIsExpandingPlatforms] = useState(false);

  useEffect(() => {
    if (allTabs.length && !allTabs.includes(activeTab)) {
      setActiveTab(allTabs[0]);
    }
  }, [allTabs.join(',')]);

  if (!allTabs.length) return null;

  const copy = (text) => navigator.clipboard.writeText(text).catch(() => {});

  const generateTTS = async (type, text) => {
    setTtsLoading(prev => ({ ...prev, [type]: true }));
    try {
      const res = await fetch('/api/generate-tts', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 5000), voiceStyle: 'professional' }),
      });
      const data = await res.json();
      if (data.success && data.audio) {
        setTtsAudio(prev => ({ ...prev, [type]: { audio: data.audio, mimeType: data.mimeType } }));
      }
    } catch {
      // silently fail
    } finally {
      setTtsLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const download = (type, text) => {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scribeshift_${type}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Cross-platform expansion: take existing content and generate for missing platforms
  const missingPlatforms = ALL_SOCIAL.filter(p => !content[p]);
  const canExpandPlatforms = missingPlatforms.length > 0 && (content.blog || content.linkedin || content.twitter || content.facebook || content.instagram);

  const handleExpandPlatforms = async () => {
    if (!canExpandPlatforms) return;
    setIsExpandingPlatforms(true);

    // Use existing content as source
    const existingSocial = ALL_SOCIAL.find(p => content[p]);
    const sourceContent = content.blog || content[existingSocial] || Object.values(content)[0];

    try {
      const formData = new FormData();
      formData.append('contentTypes', JSON.stringify(missingPlatforms));
      formData.append('options', JSON.stringify({ tone: 'conversational', polish: 'natural', length: 'standard', audience: 'general' }));
      formData.append('brandData', JSON.stringify({
        brandName: brand?.brandName || '',
        primaryColor: brand?.primaryColor || '#3b82f6',
        secondaryColor: brand?.secondaryColor || '#475569',
      }));
      formData.append('videoUrls', JSON.stringify([]));
      formData.append('textPrompt', sourceContent);

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.content) {
        for (const [platform, text] of Object.entries(data.content)) {
          if (text && !text.startsWith('Error')) {
            onContentUpdate(platform, text);
          }
        }
      }
    } catch (err) {
      console.error('Platform expansion failed:', err);
    } finally {
      setIsExpandingPlatforms(false);
    }
  };

  const renderTabGroup = (label, groupKey, tabs) => {
    if (!tabs.length) return null;
    return (
      <div className={`tab-group tab-group-${groupKey}`}>
        <span className="tab-group-icon">{GROUP_ICONS[groupKey]}</span>
        <span className="tab-group-label">{label}</span>
        {tabs.map((type) => (
          <button
            key={type}
            type="button"
            className={`tab-btn tab-btn-${groupKey} ${activeTab === type ? 'active' : ''}`}
            onClick={() => setActiveTab(type)}
          >
            {TYPE_NAMES[type] || type}
          </button>
        ))}
      </div>
    );
  };

  const renderTTSSection = (type, text) => (
    <div className="tts-section">
      {ttsAudio[type] ? (
        <AudioPlayer
          audioBase64={ttsAudio[type].audio}
          mimeType={ttsAudio[type].mimeType}
          onClose={() => setTtsAudio(prev => { const next = { ...prev }; delete next[type]; return next; })}
        />
      ) : (
        <button
          className="post-action-btn tts-btn"
          onClick={() => generateTTS(type, text)}
          disabled={ttsLoading[type]}
        >
          {ttsLoading[type] ? 'Generating audio...' : 'Generate Audio'}
        </button>
      )}
    </div>
  );

  const renderTextContent = (type) => {
    const text = content[type] || '';

    if (type === 'blog') {
      return (
        <div className="tab-content active">
          <BlogPreview content={text} brand={brand} onContentUpdate={onContentUpdate} />
          {renderTTSSection(type, text)}
        </div>
      );
    }

    if (type === 'newsletter') {
      return (
        <div className="tab-content active">
          <NewsletterPreview content={text} brand={brand} onContentUpdate={onContentUpdate} />
          {renderTTSSection(type, text)}
        </div>
      );
    }

    return (
      <div className="tab-content active">
        <div className="preview-toolbar">
          <div className="preview-toolbar-left">
            <span className="preview-toolbar-label">{TYPE_NAMES[type] || type}</span>
          </div>
          <div className="preview-toolbar-actions">
            <button className="post-action-btn" onClick={() => copy(text)}>Copy</button>
            <button className="post-action-btn" onClick={() => download(type, text)}>Download .md</button>
          </div>
        </div>
        <div className="content-box">{text}</div>
        {renderTTSSection(type, text)}
      </div>
    );
  };

  const renderSocialContent = (platform) => (
    <div className="tab-content active">
      <SocialPreview
        platform={platform}
        content={content[platform]}
        onContentUpdate={onContentUpdate}
        brand={brand}
      />
    </div>
  );

  const renderImageContent = () => (
    <div className="tab-content active">
      <ImageGallery
        images={images}
        onRegenerateImage={onRegenerateImage}
        onGenerateVariations={onGenerateVariations}
        isRegenerating={isImageRegenerating}
      />
    </div>
  );

  return (
    <div className="card results-panel" style={{ animationDelay: '0s' }}>
      <div className="card-title"><span className="step">6</span> Generated Content</div>

      <div className="tabs-row">
        {renderTabGroup('Text', 'text', textTabs)}
        {renderTabGroup('Social', 'social', socialTabs)}
        {hasImages && renderTabGroup('Media', 'media', ['images'])}
      </div>

      {TEXT_TYPES.includes(activeTab) && content[activeTab] && renderTextContent(activeTab)}
      {SOCIAL_TYPES.includes(activeTab) && content[activeTab] && renderSocialContent(activeTab)}
      {activeTab === 'images' && hasImages && renderImageContent()}

      {/* Action bar */}
      <div className="results-schedule-bar">
        {canExpandPlatforms && (
          <button
            className={`btn expand-platforms-btn ${isExpandingPlatforms ? 'loading' : ''}`}
            onClick={handleExpandPlatforms}
            disabled={isExpandingPlatforms}
            title={`Generate for: ${missingPlatforms.map(p => TYPE_NAMES[p]).join(', ')}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            {isExpandingPlatforms ? 'Expanding...' : `Expand to ${missingPlatforms.length} more platform${missingPlatforms.length > 1 ? 's' : ''}`}
          </button>
        )}
        <button className="btn btn-primary schedule-results-btn" onClick={() => setShowSchedule(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Schedule Posts
        </button>
      </div>

      {showSchedule && (
        <ScheduleFromResults
          content={content}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
}
