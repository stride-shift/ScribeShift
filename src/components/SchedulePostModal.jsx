import { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { PostPreview } from './SchedulePreviews';

const PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>, charLimit: 3000 },
  { key: 'twitter', label: 'Twitter / X', color: '#1DA1F2', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>, charLimit: 280 },
  { key: 'facebook', label: 'Facebook', color: '#1877F2', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>, charLimit: 63206 },
  { key: 'instagram', label: 'Instagram', color: '#E4405F', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/></svg>, charLimit: 2200 },
];

const STEPS = ['compose', 'preview'];

export default function SchedulePostModal({ onClose, onCreated, initialDate, initialText, editingPost, contentType = 'social' }) {
  const { getAuthHeaders } = useAuth();
  const [step, setStep] = useState('compose');
  const [postText, setPostText] = useState(editingPost?.post_text || initialText || '');
  const isLongForm = ['blog', 'newsletter', 'video'].includes(contentType);
  const [viewMode, setViewMode] = useState(isLongForm ? 'longform' : 'platform');
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    editingPost ? new Set([editingPost.platform]) : new Set(['linkedin'])
  );
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (editingPost?.scheduled_at) {
      const d = new Date(editingPost.scheduled_at);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    if (initialDate) {
      const d = new Date(initialDate);
      d.setHours(9, 0, 0, 0);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    return '';
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(editingPost?.post_image_url || null);
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewPlatform, setPreviewPlatform] = useState(null);
  const imageInputRef = useRef(null);

  // Fetch connected accounts
  useEffect(() => {
    const fetchStatuses = async () => {
      setLoadingAccounts(true);
      const headers = getAuthHeaders();
      const results = {};
      await Promise.all(
        PLATFORMS.map(async (p) => {
          try {
            const res = await fetch(`/api/auth/${p.key}/status`, { headers });
            const data = await res.json();
            results[p.key] = data;
          } catch {
            results[p.key] = { connected: false };
          }
        })
      );
      setConnectedAccounts(results);
      setLoadingAccounts(false);

      // Auto-select connected platforms if no editing post
      if (!editingPost) {
        const connected = PLATFORMS.filter(p => results[p.key]?.connected).map(p => p.key);
        if (connected.length > 0) setSelectedPlatforms(new Set(connected.length > 0 ? [connected[0]] : ['linkedin']));
      }
    };
    fetchStatuses();
  }, []);

  // Keep preview platform in sync with selected platforms
  useEffect(() => {
    if (selectedPlatforms.size > 0 && !selectedPlatforms.has(previewPlatform)) {
      setPreviewPlatform([...selectedPlatforms][0]);
    }
  }, [selectedPlatforms, previewPlatform]);

  const togglePlatform = (key) => {
    const next = new Set(selectedPlatforms);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedPlatforms(next);
    if (!next.has(previewPlatform)) setPreviewPlatform([...next][0]);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const canProceed = postText.trim().length > 0 && selectedPlatforms.size > 0 && scheduledAt;

  const handleSubmit = async () => {
    if (!canProceed || submitting) return;
    setSubmitting(true);
    setError('');

    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const platforms = [...selectedPlatforms];

    // Upload image first if we have one
    let imageUrl = editingPost?.post_image_url || null;
    if (imageFile) {
      try {
        const formData = new FormData();
        formData.append('file', imageFile);
        const uploadRes = await fetch('/api/images/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.url || uploadData.publicUrl || null;
        }
      } catch {
        // Continue without image if upload fails
      }
    }

    try {
      if (editingPost) {
        // Update existing post
        const res = await fetch(`/api/schedule/${editingPost.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({
            post_text: postText,
            scheduled_at: new Date(scheduledAt).toISOString(),
            platform: platforms[0],
            post_image_url: imageUrl,
            is_boosted: editingPost.is_boosted,
            boost_spend: editingPost.boost_spend,
          }),
        });
        if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to update'); setSubmitting(false); return; }
        onCreated?.();
      } else {
        // Create posts for each selected platform
        for (const platform of platforms) {
          const payload = {
            post_text: postText,
            platform,
            scheduled_at: new Date(scheduledAt).toISOString(),
            post_image_url: imageUrl,
            is_boosted: false,
          };
          const res = await fetch('/api/schedule', {
            method: 'POST', headers,
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json();
            setError(`Failed to schedule on ${platform}: ${data.error || 'Unknown error'}`);
            setSubmitting(false);
            return;
          }
        }
        onCreated?.();
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const activePlatform =
    PLATFORMS.find(p => p.key === previewPlatform) ||
    PLATFORMS.find(p => p.key === [...selectedPlatforms][0]) ||
    PLATFORMS[0];
  const charCount = postText.length;
  const isOverLimit = charCount > activePlatform.charLimit;

  return (
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="spm-header">
          <h3 className="spm-title">{editingPost ? 'Edit Post' : 'Schedule New Post'}</h3>
          <div className="spm-steps">
            <button
              className={`spm-step-btn ${step === 'compose' ? 'active' : ''}`}
              onClick={() => setStep('compose')}
            >
              <span className="spm-step-num">1</span>
              Compose
            </button>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <button
              className={`spm-step-btn ${step === 'preview' ? 'active' : ''}`}
              onClick={() => canProceed && setStep('preview')}
              disabled={!canProceed}
            >
              <span className="spm-step-num">2</span>
              Preview & Confirm
            </button>
          </div>
          <button className="spm-close" onClick={onClose}>×</button>
        </div>

        {step === 'compose' ? (
          /* ═══ COMPOSE STEP ═══ */
          <div className="spm-body">
            {/* Platform selector */}
            <div className="spm-section">
              <label className="spm-label">Post to</label>
              <div className="spm-platforms">
                {PLATFORMS.map(p => {
                  const account = connectedAccounts[p.key];
                  const connected = account?.connected && !account?.isExpired;
                  const selected = selectedPlatforms.has(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`spm-platform ${selected ? 'selected' : ''} ${!connected ? 'disconnected' : ''}`}
                      onClick={() => connected && togglePlatform(p.key)}
                      disabled={!connected}
                      style={selected ? { '--plat-color': p.color } : {}}
                    >
                      <span className="spm-platform__icon" style={{ color: selected ? '#fff' : p.color, background: selected ? p.color : `${p.color}15` }}>
                        {p.icon}
                      </span>
                      <span className="spm-platform__label">{p.label}</span>
                      {connected ? (
                        selected && <span className="spm-platform__check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                      ) : (
                        <span className="spm-platform__status">Not connected</span>
                      )}
                    </button>
                  );
                })}
                {loadingAccounts && <div className="spm-loading-accounts">Checking accounts...</div>}
              </div>
            </div>

            {/* Post content */}
            <div className="spm-section">
              <label className="spm-label">Content</label>
              <textarea
                className="spm-textarea"
                value={postText}
                onChange={e => setPostText(e.target.value)}
                placeholder="What do you want to share?"
                rows={6}
              />
              <div className="spm-char-count" style={isOverLimit ? { color: 'var(--danger)' } : {}}>
                {charCount} / {activePlatform.charLimit} ({activePlatform.label})
                {isOverLimit && ' — over limit!'}
              </div>
            </div>

            {/* Image upload */}
            <div className="spm-section">
              <label className="spm-label">Image (optional)</label>
              {imagePreview ? (
                <div className="spm-image-preview">
                  <img src={imagePreview} alt="Post image" />
                  <button className="spm-image-remove" onClick={removeImage}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <button className="spm-image-upload" onClick={() => imageInputRef.current?.click()}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Add an image</span>
                </button>
              )}
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
            </div>

            {/* Schedule date/time */}
            <div className="spm-section">
              <label className="spm-label">Schedule for</label>
              <input
                type="datetime-local"
                className="spm-datetime"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </div>

            {error && <div className="spm-error">{error}</div>}
          </div>
        ) : (
          /* ═══ PREVIEW STEP ═══ */
          <div className="spm-body">
            {/* Long-form content: toggle between native long-form view and per-platform preview */}
            {isLongForm && (
              <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, width: 'fit-content' }}>
                <button
                  onClick={() => setViewMode('longform')}
                  style={{
                    padding: '8px 14px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: viewMode === 'longform' ? 'var(--primary)' : 'transparent',
                    color: viewMode === 'longform' ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {contentType === 'blog' ? 'Blog article' : contentType === 'newsletter' ? 'Newsletter email' : 'Video script'}
                </button>
                <button
                  onClick={() => setViewMode('platform')}
                  style={{
                    padding: '8px 14px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: viewMode === 'platform' ? 'var(--primary)' : 'transparent',
                    color: viewMode === 'platform' ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  Per-platform preview
                </button>
              </div>
            )}

            {/* Platform preview tabs — hidden in long-form view */}
            {viewMode === 'platform' && (
              <div className="spm-preview-tabs">
                {[...selectedPlatforms].map(key => {
                  const p = PLATFORMS.find(x => x.key === key);
                  return (
                    <button
                      key={key}
                      className={`spm-preview-tab ${previewPlatform === key ? 'active' : ''}`}
                      onClick={() => setPreviewPlatform(key)}
                      style={previewPlatform === key ? { borderColor: p.color, color: p.color } : {}}
                    >
                      {p.icon}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Platform-faithful preview */}
            <PostPreview
              contentType={contentType}
              platform={previewPlatform || [...selectedPlatforms][0] || 'linkedin'}
              text={postText}
              image={imagePreview}
              scheduledAt={scheduledAt}
              viewMode={viewMode}
            />

            {/* Summary */}
            <div className="spm-summary">
              <div className="spm-summary__row">
                <span className="spm-summary__label">Platforms</span>
                <span className="spm-summary__value">
                  {[...selectedPlatforms].map(k => PLATFORMS.find(p => p.key === k)?.label).join(', ')}
                </span>
              </div>
              <div className="spm-summary__row">
                <span className="spm-summary__label">Scheduled</span>
                <span className="spm-summary__value">
                  {scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Not set'}
                </span>
              </div>
              <div className="spm-summary__row">
                <span className="spm-summary__label">Image</span>
                <span className="spm-summary__value">{imagePreview ? 'Attached' : 'None'}</span>
              </div>
              <div className="spm-summary__row">
                <span className="spm-summary__label">Characters</span>
                <span className="spm-summary__value" style={isOverLimit ? { color: 'var(--danger)' } : {}}>
                  {charCount}
                </span>
              </div>
            </div>

            {error && <div className="spm-error">{error}</div>}
          </div>
        )}

        {/* Footer */}
        <div className="spm-footer">
          {step === 'compose' ? (
            <>
              <button className="spm-btn spm-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="spm-btn spm-btn--primary" onClick={() => setStep('preview')} disabled={!canProceed}>
                Preview Post
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </>
          ) : (
            <>
              <button className="spm-btn spm-btn--secondary" onClick={() => setStep('compose')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Back to Edit
              </button>
              <button className="spm-btn spm-btn--primary" onClick={handleSubmit} disabled={submitting || isOverLimit}>
                {submitting ? (
                  <>
                    <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    {editingPost ? 'Save Changes' : `Schedule to ${selectedPlatforms.size} platform${selectedPlatforms.size > 1 ? 's' : ''}`}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
