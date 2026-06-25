import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CanvasRevealEffect } from './ui/sign-in-flow-1';

// ── LOGINLESS landing page for signed email review links.
// ── No useAuth, no Supabase import — mirrors ResetPasswordPage pattern.
// ── Route guard in App.jsx renders this when pathname starts with /review/act.

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

function BrandHeader() {
  return (
    <div className="reset-brand">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <defs>
          <linearGradient id="reviewActLogo" x1="0" y1="0" x2="44" y2="44">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r="20" stroke="url(#reviewActLogo)" strokeWidth="2.5" />
        <circle cx="22" cy="22" r="7" fill="url(#reviewActLogo)" />
      </svg>
      <span className="reset-brand-name">ScribeShift</span>
    </div>
  );
}

function CommentList({ comments }) {
  if (!comments || comments.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Comments
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.map((c) => (
          <div
            key={c.id}
            style={{
              padding: '8px 12px',
              background: 'rgba(148,163,184,0.06)',
              border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                {c.author_name || 'Team'}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {new Date(c.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReviewActPage() {
  const [token, setToken] = useState('');
  const [initialAction, setInitialAction] = useState(null); // pre-filled action from URL

  // Preview state
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');

  // Action form state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [selectedAction, setSelectedAction] = useState(null);

  // Result states
  const [success, setSuccess] = useState(false); // 'approve' | 'request_changes'
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [alreadyReviewedStatus, setAlreadyReviewedStatus] = useState('');

  // Spotlight cursor — matches ResetPasswordPage polish
  const [cursor, setCursor] = useState({ x: -1000, y: -1000 });
  const [cursorVisible, setCursorVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    const a = params.get('action') || null;
    setToken(t);
    if (a === 'approve' || a === 'request_changes') {
      setSelectedAction(a);
      setInitialAction(a);
    }
    if (!t) {
      setPreviewError('This review link is missing a token. Please ask your contact to resend it.');
      setPreviewLoading(false);
      return;
    }
    // Fetch preview
    (async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/review/act?token=${encodeURIComponent(t)}`);
        const data = await res.json();
        if (!res.ok) {
          setPreviewError(data.message || data.error || 'This review link is invalid or has expired.');
        } else {
          setPost(data.post);
          setComments(data.comments || []);
        }
      } catch {
        setPreviewError('Could not load the post for review. Please try again.');
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      setCursor({ x: e.clientX, y: e.clientY });
      if (!cursorVisible) setCursorVisible(true);
    };
    const onLeave = () => setCursorVisible(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [cursorVisible]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAction) return;
    if (selectedAction === 'request_changes' && !actionComment.trim()) {
      setActionError('Please describe what needs to change.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch('/api/review/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: selectedAction,
          comment: actionComment.trim() || undefined,
          name: reviewerName.trim() || undefined,
          email: reviewerEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'invalid_or_expired_token') {
          setActionError(data.message || 'This review link has expired or is invalid.');
        } else {
          setActionError(data.error || 'Failed to submit your review.');
        }
        return;
      }
      if (data.already_reviewed) {
        setAlreadyReviewed(true);
        setAlreadyReviewedStatus(data.review_status || '');
        return;
      }
      setSuccess(selectedAction);
    } catch {
      setActionError('Failed to submit your review. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (ds) =>
    new Date(ds).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const platformLabel = post ? (PLATFORM_LABELS[post.platform] || post.platform) : '';
  const platformColor = post ? (PLATFORM_COLORS[post.platform] || '#94a3b8') : '#94a3b8';

  return (
    <div className="reset-page">
      {/* Animated dot canvas background — same as sign-in / reset-password */}
      <div className="reset-bg">
        <CanvasRevealEffect
          animationSpeed={3}
          containerClassName="reset-canvas"
          colors={[
            [59, 130, 246],
            [96, 165, 250],
          ]}
          dotSize={6}
          reverse={!!success}
        />
        <div className="reset-bg-vignette" />
        <div className="reset-bg-top-fade" />
      </div>

      {/* Cursor spotlight */}
      <div
        className="reset-cursor-glow"
        style={{
          opacity: cursorVisible ? 1 : 0,
          background: `radial-gradient(circle 320px at ${cursor.x}px ${cursor.y}px, rgba(59,130,246,0.18), rgba(96,165,250,0.08) 40%, transparent 70%)`,
        }}
      />

      {/* Card */}
      <div className="reset-content" style={{ alignItems: 'flex-start', overflowY: 'auto', padding: '32px 16px' }}>
        <AnimatePresence mode="wait">
          {/* ── Success screen ── */}
          {success && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="reset-card"
            >
              <BrandHeader />
              <div className="reset-check-circle">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="reset-title">
                {success === 'approve' ? 'Post approved' : 'Changes requested'}
              </h1>
              <p className="reset-subtitle">
                {success === 'approve'
                  ? 'The team has been notified. This post will be published at its scheduled time.'
                  : 'Your feedback has been sent to the team. They will make adjustments and may reach out to you.'}
              </p>
            </motion.div>
          )}

          {/* ── Already-reviewed screen ── */}
          {!success && alreadyReviewed && (
            <motion.div
              key="already-reviewed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="reset-card"
            >
              <BrandHeader />
              <div className="reset-check-circle" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h1 className="reset-title">Already reviewed</h1>
              <p className="reset-subtitle">
                This post has already been reviewed
                {alreadyReviewedStatus ? ` (${alreadyReviewedStatus.replace('_', ' ')})` : ''}.
                No further action is needed.
              </p>
            </motion.div>
          )}

          {/* ── Loading preview ── */}
          {!success && !alreadyReviewed && previewLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="reset-card"
            >
              <BrandHeader />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
                <div className="loading-spinner" />
                <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>Loading post…</p>
              </div>
            </motion.div>
          )}

          {/* ── Token/preview error ── */}
          {!success && !alreadyReviewed && !previewLoading && previewError && (
            <motion.div
              key="preview-error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="reset-card"
            >
              <BrandHeader />
              <div
                className="reset-check-circle"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <h1 className="reset-title">Link unavailable</h1>
              <p className="reset-subtitle">{previewError}</p>
            </motion.div>
          )}

          {/* ── Review form ── */}
          {!success && !alreadyReviewed && !previewLoading && !previewError && post && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="reset-card"
              style={{ maxWidth: 520 }}
            >
              <BrandHeader />
              <h1 className="reset-title" style={{ marginBottom: 4 }}>Review this post</h1>
              <p className="reset-subtitle" style={{ marginBottom: 20 }}>
                Read the post below, then approve it or request changes.
              </p>

              {/* Post preview */}
              <div
                style={{
                  background: 'rgba(148,163,184,0.07)',
                  border: '1px solid rgba(148,163,184,0.18)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: platformColor }}>{platformLabel}</span>
                  {post.scheduled_at && (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      Scheduled: {formatDate(post.scheduled_at)}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    wordBreak: 'break-word',
                  }}
                >
                  {post.post_text}
                </p>
              </div>

              {/* Existing comments */}
              <CommentList comments={comments} />

              {/* Action form */}
              <form onSubmit={handleSubmit} style={{ marginTop: 20 }} className="reset-form">
                {/* Action selection */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedAction('approve')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 9,
                      border: `2px solid ${selectedAction === 'approve' ? '#22c55e' : 'rgba(148,163,184,0.25)'}`,
                      background: selectedAction === 'approve' ? 'rgba(34,197,94,0.12)' : 'transparent',
                      color: selectedAction === 'approve' ? '#22c55e' : '#94a3b8',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAction('request_changes')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 9,
                      border: `2px solid ${selectedAction === 'request_changes' ? '#ef4444' : 'rgba(148,163,184,0.25)'}`,
                      background: selectedAction === 'request_changes' ? 'rgba(239,68,68,0.1)' : 'transparent',
                      color: selectedAction === 'request_changes' ? '#ef4444' : '#94a3b8',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Request Changes
                  </button>
                </div>

                {/* Comment — required for request_changes, optional for approve */}
                <label className="reset-label" htmlFor="review-comment">
                  {selectedAction === 'request_changes'
                    ? 'Feedback (required)'
                    : 'Note (optional)'}
                </label>
                <textarea
                  id="review-comment"
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder={
                    selectedAction === 'request_changes'
                      ? 'Describe what needs to change…'
                      : 'Any notes for the team? (optional)'
                  }
                  rows={3}
                  disabled={actionLoading}
                  className="reset-input"
                  style={{ resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
                />

                {/* Optional identity fields */}
                <label className="reset-label" htmlFor="review-name" style={{ marginTop: 12 }}>
                  Your name (optional)
                </label>
                <input
                  id="review-name"
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="Jane Smith"
                  disabled={actionLoading}
                  className="reset-input"
                />

                <label className="reset-label" htmlFor="review-email" style={{ marginTop: 12 }}>
                  Your email (optional)
                </label>
                <input
                  id="review-email"
                  type="email"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  placeholder="jane@example.com"
                  disabled={actionLoading}
                  className="reset-input"
                />

                {actionError && (
                  <div className="reset-error" style={{ marginTop: 12 }}>{actionError}</div>
                )}

                <button
                  type="submit"
                  disabled={
                    actionLoading ||
                    !selectedAction ||
                    (selectedAction === 'request_changes' && !actionComment.trim())
                  }
                  className="reset-btn-primary"
                  style={{ marginTop: 18 }}
                >
                  {actionLoading
                    ? 'Submitting…'
                    : selectedAction === 'approve'
                    ? 'Approve Post'
                    : selectedAction === 'request_changes'
                    ? 'Submit Feedback'
                    : 'Select an action above'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
