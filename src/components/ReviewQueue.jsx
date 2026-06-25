import { useState, useEffect, useCallback } from 'react';
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

function CommentThread({ comments }) {
  if (!comments || comments.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
        No comments yet.
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {comments.map((c) => (
        <div
          key={c.id}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {c.users?.full_name || c.users?.email || c.author_name || 'Reviewer'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {new Date(c.created_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {c.comment_type && c.comment_type !== 'note' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 99,
                  textTransform: 'uppercase',
                  color: c.comment_type === 'feedback' ? '#ef4444' : '#3b82f6',
                  background: c.comment_type === 'feedback' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                }}
              >
                {c.comment_type}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
        </div>
      ))}
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

function AddCommentForm({ postId, getAuthHeaders, onCommentAdded }) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      if (!res.ok) { setError(data.error || 'Failed to add comment'); return; }
      setBody('');
      onCommentAdded(data.comment);
    } catch {
      setError('Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 10 }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add an internal note..."
        rows={2}
        disabled={loading}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-raised)',
          color: 'var(--text)',
          fontSize: 12,
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />
      {error && (
        <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--danger)' }}>{error}</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="sched-action-btn"
          style={{ fontSize: 12 }}
        >
          {loading ? 'Posting…' : 'Post Comment'}
        </button>
      </div>
    </form>
  );
}

function PostCard({ post, getAuthHeaders, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showChangesModal, setShowChangesModal] = useState(false);

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/review/${post.id}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) setDetail(data);
      else setError(data.error || 'Failed to load post detail');
    } catch {
      setError('Failed to load post detail');
    } finally {
      setDetailLoading(false);
    }
  }, [post.id, getAuthHeaders]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) loadDetail();
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
    setDetail((prev) =>
      prev ? { ...prev, comments: [...(prev.comments || []), newComment] } : prev
    );
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
              {post.comment_count > 0 && (
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
                  {post.comment_count}
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
            }}
          >
            {expanded ? 'Collapse ▲' : `Comments (${detail?.comments?.length ?? post.comment_count ?? 0}) ▼`}
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

        {/* Expanded detail: comment thread + add comment */}
        {expanded && (
          <div
            style={{
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {detailLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                Loading comments…
              </div>
            ) : (
              <>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  Comments
                </h4>
                <CommentThread comments={detail?.comments} />
                <AddCommentForm
                  postId={post.id}
                  getAuthHeaders={getAuthHeaders}
                  onCommentAdded={handleCommentAdded}
                />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function ReviewQueue() {
  const { getAuthHeaders } = useAuth();
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
      if (!res.ok) { setError(data.error || 'Failed to load review queue'); return; }
      setPosts(data.posts || []);
      setTotal(data.total ?? (data.posts || []).length);
    } catch {
      setError('Failed to load review queue');
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
          Review Queue
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Posts awaiting approval before they can be published.
        </p>
      </div>

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
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>Loading review queue...</p>
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
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
            Nothing to review
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            All posts have been reviewed. Great work!
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
            {total} post{total !== 1 ? 's' : ''} awaiting review
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                getAuthHeaders={getAuthHeaders}
                onRefresh={loadQueue}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
