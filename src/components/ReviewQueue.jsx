import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthProvider';

const PLATFORM_COLORS = {
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  facebook: '#1877F2',
  instagram: '#E4405F',
};

const PLATFORM_LABELS = {
  linkedin: 'LinkedIn',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const REVIEW_STATUS_STYLES = {
  pending_review: { label: 'Pending Review', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  changes_requested: { label: 'Changes Requested', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  approved: { label: 'Approved', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
};

function ReviewStatusBadge({ status }) {
  const s = REVIEW_STATUS_STYLES[status] || { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 99,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}33`,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {s.label}
    </span>
  );
}

// ── Chat-style comment thread ─────────────────────────────────────
function CommentThread({ comments, currentUserEmail }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [comments]);

  if (!comments || comments.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0, padding: '8px 0' }}>
        No messages yet. Start the conversation below.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
      {comments.map((c) => {
        const authorEmail = c.users?.email || c.author_email || '';
        const isMine = currentUserEmail && authorEmail && authorEmail === currentUserEmail;
        const authorName = c.users?.full_name || c.users?.email || c.author_name || 'Reviewer';
        return (
          <div
            key={c.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isMine ? 'flex-end' : 'flex-start',
            }}
          >
            {!isMine && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2, paddingLeft: 4 }}>
                {authorName}
              </span>
            )}
            <div
              style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isMine ? 'var(--primary, #3b82f6)' : 'var(--bg-raised)',
                color: isMine ? '#fff' : 'var(--text)',
                border: isMine ? 'none' : '1px solid var(--border)',
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {c.body}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, paddingLeft: isMine ? 0 : 4, paddingRight: isMine ? 4 : 0 }}>
              {c.comment_type && c.comment_type !== 'note' && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 99,
                    textTransform: 'uppercase',
                    color: c.comment_type === 'feedback' ? '#ef4444' : '#3b82f6',
                    background: c.comment_type === 'feedback' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                  }}
                >
                  {c.comment_type}
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {new Date(c.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function RequestChangesModal({ onConfirm, onCancel, loading }) {
  const [comment, setComment] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    onConfirm(comment.trim());
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          Request Changes
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Provide feedback for the author. This is required.
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe what needs to change..."
            rows={4}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-raised)',
              color: 'var(--text)',
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="sched-action-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !comment.trim()}
              className="sched-action-btn sched-action-btn--danger"
            >
              {loading ? 'Submitting…' : 'Request Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Inline message input (reply bar) ─────────────────────────────
function MessageInput({ postId, getAuthHeaders, onCommentAdded }) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/review/${postId}/comment`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send message'); return; }
      setBody('');
      onCommentAdded(data.comment);
      if (textareaRef.current) textareaRef.current.focus();
    } catch {
      setError('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Reply… (Enter to send, Shift+Enter for newline)"
        rows={2}
        disabled={loading}
        style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-raised)',
          color: 'var(--text)',
          fontSize: 13,
          resize: 'none',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />
      <button
        type="submit"
        disabled={loading || !body.trim()}
        className="sched-action-btn"
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}
        title="Send message"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        {loading ? 'Sending…' : 'Send'}
      </button>
      {error && (
        <p style={{ position: 'absolute', fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{error}</p>
      )}
    </form>
  );
}

// ── Version history panel ─────────────────────────────────────────
function VersionHistory({ postId, getAuthHeaders, currentText }) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/schedule/${postId}/revisions`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load history'); return; }
      setRevisions(data.revisions || []);
    } catch {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [postId, getAuthHeaders]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && revisions.length === 0) load();
  };

  const formatDate = (ds) =>
    new Date(ds).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <button
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="12 8 12 12 14 14" />
          <path d="M3.05 11a9 9 0 1 0 .5-4" />
          <polyline points="3 3 3 7 7 7" />
        </svg>
        Edit History {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
              <div className="loading-spinner" style={{ width: 14, height: 14 }} />
              Loading history…
            </div>
          )}
          {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
          {!loading && !error && revisions.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
              No prior edits recorded.
            </p>
          )}
          {!loading && revisions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Current version sentinel */}
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(34,197,94,0.07)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ fontWeight: 600, color: '#22c55e' }}>Current version</span>
              </div>
              {revisions.map((rev) => {
                const isOpen = expanded === rev.revision_number;
                const editor = rev.users?.full_name || rev.users?.email || 'Unknown editor';
                const preview = (rev.post_text || '').slice(0, 120);
                return (
                  <div
                    key={rev.revision_number}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      onClick={() => setExpanded(isOpen ? null : rev.revision_number)}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 99,
                          background: 'var(--surface-2, rgba(148,163,184,0.15))',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        v{rev.revision_number}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                        {editor} &middot; {formatDate(rev.created_at)}
                      </span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: 'var(--text-secondary)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    {rev.change_reason && (
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Reason: {rev.change_reason}
                      </p>
                    )}
                    {isOpen && (
                      <div style={{ marginTop: 8 }}>
                        {rev.post_text ? (
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              color: 'var(--text)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              padding: '8px 10px',
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              lineHeight: 1.55,
                            }}
                          >
                            {rev.post_text}
                          </p>
                        ) : (
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            No text recorded for this revision.
                          </p>
                        )}
                      </div>
                    )}
                    {!isOpen && rev.post_text && (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {preview}{rev.post_text.length > 120 ? '…' : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, getAuthHeaders, onRefresh, currentUserEmail }) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showChangesModal, setShowChangesModal] = useState(false);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/review/${post.id}/comments`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) setComments(data.comments || []);
      else setError(data.error || 'Failed to load messages');
    } catch {
      setError('Failed to load messages');
    } finally {
      setCommentsLoading(false);
    }
  }, [post.id, getAuthHeaders]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && comments === null) loadComments();
  };

  const handleApprove = async () => {
    if (!window.confirm('Approve this post? It will be scheduled for publishing.')) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/review/${post.id}/approve`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to approve'); return; }
      onRefresh();
    } catch {
      setError('Failed to approve post');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async (comment) => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/review/${post.id}/request-changes`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to request changes'); setActionLoading(false); return; }
      setShowChangesModal(false);
      onRefresh();
    } catch {
      setError('Failed to request changes');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommentAdded = (newComment) => {
    setComments((prev) => (prev ? [...prev, newComment] : [newComment]));
  };

  const formatDate = (ds) =>
    new Date(ds).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const platformColor = PLATFORM_COLORS[post.platform] || '#94a3b8';
  const platformLabel = PLATFORM_LABELS[post.platform] || post.platform;
  const commentCount = comments !== null ? comments.length : (post.comment_count ?? 0);

  return (
    <>
      {showChangesModal && (
        <RequestChangesModal
          onConfirm={handleRequestChanges}
          onCancel={() => setShowChangesModal(false)}
          loading={actionLoading}
        />
      )}

      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: platformColor,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {platformLabel}
              </span>
              <ReviewStatusBadge status={post.review_status} />
              {commentCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  {commentCount}
                </span>
              )}
            </div>

            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--text)',
                lineHeight: 1.55,
                display: '-webkit-box',
                WebkitLineClamp: expanded ? 'unset' : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {post.post_text}
            </p>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {post.scheduled_at && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Scheduled: {formatDate(post.scheduled_at)}
            </span>
          )}
          {post.users && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              By {post.users.full_name || post.users.email}
            </span>
          )}
          <button
            onClick={handleExpand}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: 'var(--primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {expanded ? 'Collapse ▲' : `Messages (${commentCount}) ▼`}
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="sched-action-btn"
            onClick={handleApprove}
            disabled={actionLoading}
            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}
          >
            {actionLoading ? 'Working…' : 'Approve'}
          </button>
          <button
            className="sched-action-btn sched-action-btn--danger"
            onClick={() => setShowChangesModal(true)}
            disabled={actionLoading}
          >
            Request Changes
          </button>
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>
        )}

        {/* Expanded panel: chat thread + reply input + version history */}
        {expanded && (
          <div
            style={{
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {commentsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                Loading messages…
              </div>
            ) : (
              <>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  Messages
                </h4>
                <CommentThread comments={comments} currentUserEmail={currentUserEmail} />
                <MessageInput
                  postId={post.id}
                  getAuthHeaders={getAuthHeaders}
                  onCommentAdded={handleCommentAdded}
                />
              </>
            )}
            <VersionHistory
              postId={post.id}
              getAuthHeaders={getAuthHeaders}
              currentText={post.post_text}
            />
          </div>
        )}
      </div>
    </>
  );
}

// ── Send-for-feedback section ─────────────────────────────────────
function SendForFeedback({ getAuthHeaders, onSent }) {
  const [myPosts, setMyPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');
  const [selectedPostId, setSelectedPostId] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('mine');     // 'mine' | 'org'
  const [members, setMembers] = useState([]);
  const [recipient, setRecipient] = useState(''); // assigned reviewer (optional)

  const loadPosts = useCallback(async (which) => {
    setPostsLoading(true);
    setPostsError('');
    try {
      const res = await fetch(`/api/schedule?limit=50&scope=${which}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) { setPostsError(data.error || 'Failed to load posts'); return; }
      setMyPosts(data.posts || []);
    } catch {
      setPostsError('Failed to load posts');
    } finally {
      setPostsLoading(false);
    }
  }, [getAuthHeaders]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/review/team-members', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setMembers(data.members || []);
    } catch { /* non-fatal */ }
  }, [getAuthHeaders]);

  const switchScope = (which) => {
    if (which === scope) return;
    setScope(which);
    setSelectedPostId('');
    loadPosts(which);
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      loadPosts(scope);
      if (members.length === 0) loadMembers();
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedPostId) return;
    setSending(true);
    setSendError('');
    try {
      const body = {};
      if (note.trim()) body.body = note.trim();
      if (recipient) body.assignedTo = recipient;
      const res = await fetch(`/api/review/${selectedPostId}/request-feedback`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setSendError(data.error || 'Failed to send for feedback'); return; }
      setSelectedPostId('');
      setNote('');
      setRecipient('');
      setOpen(false);
      onSent();
    } catch {
      setSendError('Failed to send for feedback');
    } finally {
      setSending(false);
    }
  };

  const truncate = (str, n) => (str && str.length > n ? str.slice(0, n) + '…' : str || '');
  const PLATFORM_SHORT = { linkedin: 'LI', twitter: 'TW', facebook: 'FB', instagram: 'IG' };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 8,
      }}
    >
      <button
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        Send a post for feedback
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: 'auto', color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <form onSubmit={handleSend} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {postsLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
              <div className="loading-spinner" style={{ width: 14, height: 14 }} />
              Loading your posts…
            </div>
          )}
          {postsError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{postsError}</p>}
          {!postsLoading && (
            <>
              {/* Scope toggle (my posts vs the org's) + quick add-new affordance */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {[['mine', 'My posts'], ['org', 'Organization']].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => switchScope(val)}
                      style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit',
                        background: scope === val ? 'var(--primary, #3b82f6)' : 'transparent',
                        color: scope === val ? '#fff' : 'var(--text-secondary)',
                      }}
                    >{lbl}</button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { window.location.hash = 'create'; }}
                  className="sched-action-btn"
                  style={{ marginLeft: 'auto', fontSize: 12 }}
                  title="Create or upload a new post, then come back to send it for feedback"
                >+ New post</button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Select a post
                </label>
                <select
                  value={selectedPostId}
                  onChange={(e) => setSelectedPostId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-raised)',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">— Choose a post —</option>
                  {myPosts.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{PLATFORM_SHORT[p.platform] || p.platform?.toUpperCase() || '?'}]&nbsp;
                      {p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' : ''}
                      {truncate(p.post_text, 60)}
                    </option>
                  ))}
                </select>
                {!postsLoading && myPosts.length === 0 && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    {scope === 'org' ? 'No posts found in the organization.' : 'No scheduled posts found.'}
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Send to <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg-raised)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                >
                  <option value="">Anyone on the team</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                  ))}
                </select>
                {members.length === 0 && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    No teammates to assign — it'll surface to the whole team.
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Opening note <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context for your reviewer..."
                  rows={2}
                  disabled={sending}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-raised)',
                    color: 'var(--text)',
                    fontSize: 13,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {sendError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{sendError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="sched-action-btn"
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !selectedPostId}
                  className="sched-action-btn"
                  style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--primary)', borderColor: 'rgba(59,130,246,0.3)' }}
                >
                  {sending ? 'Sending…' : 'Send for feedback'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}

export default function ReviewQueue() {
  const { getAuthHeaders, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/review/queue', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load feedback queue'); return; }
      setPosts(data.posts || []);
      setTotal(data.total ?? (data.posts || []).length);
    } catch {
      setError('Failed to load feedback queue');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Feedback
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Exchange feedback on posts with your team. Send a post for review or reply in a thread.
        </p>
      </div>

      {/* Send-for-feedback action */}
      <SendForFeedback getAuthHeaders={getAuthHeaders} onSent={loadQueue} />

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: 'var(--danger-bg)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            color: 'var(--danger)',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {error}
          <button
            onClick={() => setError('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', textDecoration: 'underline', fontSize: 12, fontFamily: 'inherit' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
          <div className="loading-spinner" />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>Loading feedback queue...</p>
        </div>
      ) : posts.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 24px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--text-secondary)', marginBottom: 12 }}
          >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
            No posts in feedback
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Send a post for feedback above or wait for one to arrive.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
            {total} post{total !== 1 ? 's' : ''} awaiting feedback
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                getAuthHeaders={getAuthHeaders}
                onRefresh={loadQueue}
                currentUserEmail={user?.email}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
