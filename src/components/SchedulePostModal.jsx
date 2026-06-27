import { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { PostPreview } from './SchedulePreviews';

const MAX_LINKEDIN_TARGETS = 5;

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
  // Media: a generic attachment (image / video / document / audio→video).
  // mediaUrl is the persistent URL (uploaded to Supabase Storage); mediaPreview
  // is a local object URL used only while uploading.
  const [mediaUrl, setMediaUrl] = useState(editingPost?.post_media_url || editingPost?.post_image_url || null);
  const [mediaType, setMediaType] = useState(editingPost?.post_media_type || (editingPost?.post_image_url ? 'image' : null));
  const [mediaFilename, setMediaFilename] = useState(editingPost?.post_media_filename || null);
  const [mediaPreview, setMediaPreview] = useState(editingPost?.post_media_url || editingPost?.post_image_url || null);

  // Image mode: 'generated' | 'caption_only' | 'uploaded'
  // Edit path: derive from persisted image_mode; fall back on media presence for legacy ('auto' or missing).
  // New post path: default 'caption_only' (no image attached; matches today's behaviour — no image sent).
  const [imageMode, setImageMode] = useState(() => {
    if (editingPost) {
      const persisted = editingPost.image_mode;
      if (persisted === 'generated' || persisted === 'caption_only' || persisted === 'uploaded') {
        return persisted;
      }
      // Legacy fallback: 'auto' or missing — infer from media presence
      const hasMedia = !!(editingPost.post_media_url || editingPost.post_image_url);
      return hasMedia ? 'generated' : 'caption_only';
    }
    // New post: default caption_only (no image attached yet — matches current submit behaviour)
    return 'caption_only';
  });
  const [uploading, setUploading] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // LinkedIn multi-target state
  const [linkedInPages, setLinkedInPages] = useState([]); // admin Pages
  const [linkedInOrgScopesGranted, setLinkedInOrgScopesGranted] = useState(null); // null = unknown
  const [linkedInPersonName, setLinkedInPersonName] = useState('');
  // Selected LinkedIn destinations: Set of target IDs.
  // 'person' is the personal profile sentinel; org IDs are page.id values.
  // Default: personal profile selected. Edit path also defaults to personal (v1 — prior targets not rehydrated).
  const [selectedLinkedInTargets, setSelectedLinkedInTargets] = useState(() => new Set(['person']));
  const pagesFetchedRef = useRef(false); // guard: fetch at most once per modal open

  // Fetch LinkedIn pages + org scope flag once LinkedIn becomes the active / selected platform.
  // Guard with pagesFetchedRef so we don't refetch on every render or selectedPlatforms change.
  useEffect(() => {
    const isLinkedInSelected = selectedPlatforms.has('linkedin');
    if (!isLinkedInSelected || pagesFetchedRef.current) return;
    pagesFetchedRef.current = true;

    const fetchLinkedInDestinations = async () => {
      const headers = getAuthHeaders();
      try {
        // Fetch status to get personName + orgScopesGranted (may already be in connectedAccounts
        // but orgScopesGranted is not guaranteed to be there yet, so re-fetch to be safe).
        const statusRes = await fetch('/api/auth/linkedin/status', { headers });
        const statusData = statusRes.ok ? await statusRes.json() : {};
        setLinkedInPersonName(statusData.personName || '');
        const orgScopes = statusData.orgScopesGranted !== false; // treat missing as true
        setLinkedInOrgScopesGranted(orgScopes);

        if (orgScopes) {
          const pagesRes = await fetch('/api/auth/linkedin/pages', { headers });
          if (pagesRes.ok) {
            const pagesData = await pagesRes.json();
            setLinkedInPages(pagesData.pages || []);
          }
        }
      } catch {
        // Non-fatal — personal profile posting still works
        setLinkedInOrgScopesGranted(false);
      }
    };

    fetchLinkedInDestinations();
  }, [selectedPlatforms]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState('');
  const [previewPlatform, setPreviewPlatform] = useState(null);
  const mediaInputRef = useRef(null);

  // Per-platform media support. Image is universally OK.
  const PLATFORM_MEDIA_SUPPORT = {
    linkedin: ['image', 'video', 'document'],
    twitter: ['image', 'video'],
    facebook: ['image', 'video'],
    instagram: ['image', 'video'],
  };

  // Platforms that can't accept the currently attached media type.
  const incompatiblePlatforms = mediaType
    ? [...selectedPlatforms].filter(p => !PLATFORM_MEDIA_SUPPORT[p]?.includes(mediaType))
    : [];

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

  // Toggle a LinkedIn destination (personal profile or a Page).
  // At least 1 must remain selected; max MAX_LINKEDIN_TARGETS can be selected.
  const toggleLinkedInTarget = (id) => {
    const next = new Set(selectedLinkedInTargets);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id); // enforce min 1
    } else {
      if (next.size < MAX_LINKEDIN_TARGETS) next.add(id);
      // If already at max, silently ignore — checkbox is disabled so this path won't normally fire
    }
    setSelectedLinkedInTargets(next);
  };

  // Build the linkedin_targets array from the current selection, given pages data + personName.
  const buildLinkedInTargets = () => {
    const targets = [];
    if (selectedLinkedInTargets.has('person')) {
      targets.push({ target_type: 'person', target_label: linkedInPersonName || 'Personal profile' });
    }
    for (const page of linkedInPages) {
      if (selectedLinkedInTargets.has(page.id)) {
        targets.push({ target_type: 'organization', target_urn: page.org_urn, target_label: page.name });
      }
    }
    return targets;
  };

  const handleMediaSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    // Show a local preview immediately for image/video (object URL)
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setMediaPreview(URL.createObjectURL(file));
    } else {
      setMediaPreview(null);
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setMediaUrl(data.url);
      setMediaType(data.type);
      setMediaFilename(data.original_filename || file.name);
      setMediaPreview(data.url);
      // Auto-switch to 'uploaded' when a file is successfully uploaded
      setImageMode('uploaded');
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
      setMediaPreview(null);
      setMediaUrl(null);
      setMediaType(null);
      setMediaFilename(null);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = () => {
    setMediaUrl(null);
    setMediaType(null);
    setMediaFilename(null);
    setMediaPreview(null);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
    // Removing media makes 'uploaded' and 'generated' meaningless; fall back to caption_only
    setImageMode(prev => (prev === 'uploaded' || prev === 'generated') ? 'caption_only' : prev);
  };

  const canProceed =
    postText.trim().length > 0 &&
    selectedPlatforms.size > 0 &&
    scheduledAt &&
    !uploading &&
    incompatiblePlatforms.length === 0;

  const handleSubmit = async () => {
    if (!canProceed || submitting) return;
    setSubmitting(true);
    setError('');

    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const platforms = [...selectedPlatforms];

    // Build media payload from imageMode:
    // 'caption_only' → strip all media regardless of what is attached
    // 'generated'    → pass through existing attached media (generated image was pre-attached)
    // 'uploaded'     → pass through uploaded media
    const effectiveMediaUrl = imageMode === 'caption_only' ? null : mediaUrl;
    const effectiveMediaType = imageMode === 'caption_only' ? null : mediaType;
    const effectiveMediaFilename = imageMode === 'caption_only' ? null : mediaFilename;

    const mediaPayload = effectiveMediaUrl
      ? {
          post_media_url: effectiveMediaUrl,
          post_media_type: effectiveMediaType,
          post_media_filename: effectiveMediaFilename,
          // Keep image URL field populated for image media so older code paths still work
          post_image_url: effectiveMediaType === 'image' ? effectiveMediaUrl : null,
        }
      : { post_image_url: null, post_media_url: null, post_media_type: null, post_media_filename: null };

    try {
      if (editingPost) {
        // Build edit body; add linkedin_targets only when the platform is LinkedIn.
        const editBody = {
          post_text: postText,
          scheduled_at: new Date(scheduledAt).toISOString(),
          platform: platforms[0],
          ...mediaPayload,
          image_mode: imageMode,
          is_boosted: editingPost.is_boosted,
          boost_spend: editingPost.boost_spend,
        };
        if (platforms[0] === 'linkedin') {
          editBody.linkedin_targets = buildLinkedInTargets();
        }
        const res = await fetch(`/api/schedule/${editingPost.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify(editBody),
        });
        if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to update'); setSubmitting(false); return; }
        onCreated?.();
      } else {
        for (const platform of platforms) {
          const payload = {
            post_text: postText,
            platform,
            scheduled_at: new Date(scheduledAt).toISOString(),
            ...mediaPayload,
            image_mode: imageMode,
            is_boosted: false,
          };
          // Add linkedin_targets only for LinkedIn; leave body unchanged for other platforms.
          if (platform === 'linkedin') {
            payload.linkedin_targets = buildLinkedInTargets();
          }
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

  // Delete the post being edited. window.confirm guards against accidental
  // clicks — this hits /api/schedule/:id DELETE which also cleans up the
  // linked calendar event server-side.
  const handleDelete = async () => {
    if (!editingPost) return;
    if (!window.confirm(`Delete this scheduled ${editingPost.platform} post? This can't be undone.`)) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/schedule/${editingPost.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete');
        setSubmitting(false);
        return;
      }
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete');
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

            {/* LinkedIn destination picker — shown only when LinkedIn is selected and connected */}
            {selectedPlatforms.has('linkedin') && connectedAccounts.linkedin?.connected && !connectedAccounts.linkedin?.isExpired && (
              <div className="spm-section">
                <label className="spm-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Post to (LinkedIn)
                  {selectedLinkedInTargets.size >= MAX_LINKEDIN_TARGETS && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                      Max {MAX_LINKEDIN_TARGETS} selected
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Personal profile row — always shown */}
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
                      background: selectedLinkedInTargets.has('person') ? 'color-mix(in srgb, #0A66C2 8%, var(--bg-raised))' : 'var(--bg-raised)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLinkedInTargets.has('person')}
                      onChange={() => toggleLinkedInTarget('person')}
                      style={{ accentColor: '#0A66C2', width: 15, height: 15, flexShrink: 0 }}
                    />
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#0A66C2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                      {linkedInPersonName || 'Personal profile'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Personal</span>
                  </label>

                  {/* Reconnect hint if org scopes missing */}
                  {linkedInOrgScopesGranted === false && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 12px', background: 'var(--bg-raised)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      Reconnect LinkedIn to post to company Pages.
                    </div>
                  )}

                  {/* Page rows — shown only when org scopes are granted and pages exist */}
                  {linkedInOrgScopesGranted !== false && linkedInPages.map(page => {
                    const isChecked = selectedLinkedInTargets.has(page.id);
                    const atMax = selectedLinkedInTargets.size >= MAX_LINKEDIN_TARGETS && !isChecked;
                    return (
                      <label
                        key={page.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          borderRadius: 8, border: '1px solid var(--border)', cursor: atMax ? 'not-allowed' : 'pointer',
                          background: isChecked ? 'color-mix(in srgb, #0A66C2 8%, var(--bg-raised))' : 'var(--bg-raised)',
                          opacity: atMax ? 0.55 : 1,
                          transition: 'background 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleLinkedInTarget(page.id)}
                          disabled={atMax}
                          style={{ accentColor: '#0A66C2', width: 15, height: 15, flexShrink: 0 }}
                        />
                        {page.logo_url ? (
                          <img
                            src={page.logo_url}
                            alt={page.name}
                            style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                          />
                        ) : (
                          <span style={{ width: 28, height: 28, borderRadius: 6, background: '#0A66C215', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          </span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {page.name}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Page</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

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

            {/* Media upload — image / video / pdf / docx / audio (audio is auto-converted to video) */}
            <div className="spm-section">
              <label className="spm-label">
                Media (optional)
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                  Image, video, PDF, DOCX, or audio (audio → video with waveform)
                </span>
              </label>

              {/* Image mode selector — 3-way control */}
              <div className="spm-image-mode" style={{ display: 'flex', gap: 4, marginBottom: 12, padding: 4, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, width: 'fit-content' }}>
                {[
                  { value: 'generated', label: 'Use generated', title: 'Use an AI-generated image attached to this post' },
                  { value: 'caption_only', label: 'Caption only', title: 'Post text only — no image or media' },
                  { value: 'uploaded', label: 'Upload own', title: 'Attach your own image or file' },
                ].map(({ value, label, title }) => {
                  const isActive = imageMode === value;
                  // 'generated' is only meaningful if there is attached media (this modal has no generate button)
                  const isDisabled = value === 'generated' && !mediaUrl;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`spm-image-mode__btn${isActive ? ' active' : ''}`}
                      title={title}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        setImageMode(value);
                        // Switching to 'Upload own' and there is no media yet → trigger file picker
                        if (value === 'uploaded' && !mediaUrl) {
                          mediaInputRef.current?.click();
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.15s, color 0.15s',
                        background: isActive ? 'var(--primary)' : 'transparent',
                        color: isActive ? '#fff' : isDisabled ? 'var(--text-muted)' : 'var(--text)',
                        opacity: isDisabled ? 0.45 : 1,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {uploading && (
                <div className="spm-image-preview" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, gap: 12, color: 'var(--text-muted)' }}>
                  <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  <span>{mediaType === null ? 'Uploading…' : `Processing ${mediaFilename || 'file'}…`}</span>
                </div>
              )}

              {/* Media previews: only show when not in caption_only mode */}
              {!uploading && mediaUrl && mediaType === 'image' && imageMode !== 'caption_only' && (
                <div className="spm-image-preview">
                  <img src={mediaPreview} alt="Post media" />
                  <button className="spm-image-remove" onClick={removeMedia}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )}

              {!uploading && mediaUrl && mediaType === 'video' && imageMode !== 'caption_only' && (
                <div className="spm-image-preview" style={{ position: 'relative', background: '#000' }}>
                  <video src={mediaPreview} controls style={{ width: '100%', maxHeight: 320, display: 'block', borderRadius: 8 }} />
                  <button className="spm-image-remove" onClick={removeMedia}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )}

              {!uploading && mediaUrl && mediaType === 'document' && imageMode !== 'caption_only' && (
                <div className="spm-image-preview" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, position: 'relative' }}>
                  <div style={{ width: 48, height: 56, borderRadius: 6, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    PDF
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaFilename || 'Document'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Document attachment</div>
                  </div>
                  <button className="spm-image-remove" onClick={removeMedia} style={{ position: 'static' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )}

              {/* Show upload button only when Upload own mode is active and no media is attached yet */}
              {!uploading && !mediaUrl && imageMode === 'uploaded' && (
                <button className="spm-image-upload" onClick={() => mediaInputRef.current?.click()}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Add media</span>
                </button>
              )}

              {/* Caption-only mode: no media prompt — just a note */}
              {!uploading && imageMode === 'caption_only' && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                  No image will be attached — text caption only.
                </div>
              )}

              {/* Generated mode with no media attached: nudge to upload or switch mode */}
              {!uploading && imageMode === 'generated' && !mediaUrl && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                  No generated image attached. Switch to "Upload own" to attach a file, or "Caption only" to post without media.
                </div>
              )}

              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleMediaSelect}
                style={{ display: 'none' }}
              />

              {/* Per-platform media compatibility warning */}
              {incompatiblePlatforms.length > 0 && (
                <div className="spm-error" style={{ marginTop: 8 }}>
                  {mediaType === 'document'
                    ? `Documents are only supported on LinkedIn. Remove the file or unselect ${incompatiblePlatforms.join(', ')}.`
                    : `${incompatiblePlatforms.join(', ')} ${incompatiblePlatforms.length > 1 ? "don't" : "doesn't"} support ${mediaType} attachments.`}
                </div>
              )}
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
              media={mediaUrl ? { url: mediaUrl, type: mediaType, filename: mediaFilename } : null}
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
                <span className="spm-summary__label">Media</span>
                <span className="spm-summary__value">
                  {mediaUrl
                    ? `${mediaType === 'document' ? 'Document' : mediaType === 'video' ? 'Video' : mediaType === 'image' ? 'Image' : 'Media'}${mediaFilename ? ` — ${mediaFilename}` : ''}`
                    : 'None'}
                </span>
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
              {editingPost && (
                <button
                  type="button"
                  className="spm-btn spm-btn--danger"
                  onClick={handleDelete}
                  disabled={submitting}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                  Delete
                </button>
              )}
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
              {editingPost && (
                <button
                  type="button"
                  className="spm-btn spm-btn--danger"
                  onClick={handleDelete}
                  disabled={submitting}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                  Delete
                </button>
              )}
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
