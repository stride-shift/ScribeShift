// Platform-faithful previews for the schedule modal.
// Each preview renders the post as it would appear on the target platform.
// For long-form content (blog / newsletter / video) we render the source in
// its native format instead of squeezing it into a social card.

import { useAuth } from './AuthProvider';
import { marked } from 'marked';

// ── Shared helpers ─────────────────────────────────────────────────

function useDisplayIdentity() {
  const { user } = useAuth();
  const name = user?.full_name || user?.email?.split('@')[0] || 'You';
  const handle = (user?.email?.split('@')[0] || 'you').toLowerCase().replace(/[^a-z0-9]/g, '');
  const avatar = user?.avatar_url || null;
  const initial = name.charAt(0).toUpperCase();
  return { name, handle, avatar, initial };
}

function Avatar({ size = 40, shape = 'circle', color = '#3b82f6' }) {
  const { avatar, initial } = useDisplayIdentity();
  const radius = shape === 'circle' ? '50%' : '8px';
  if (avatar) {
    return <img src={avatar} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover' }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: `linear-gradient(135deg, ${color}, ${shade(color, -20)})`,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4,
    }}>{initial}</div>
  );
}

function shade(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `#${(0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

function formatWhen(scheduledAt) {
  if (!scheduledAt) return 'Scheduled';
  const d = new Date(scheduledAt);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── LinkedIn preview ───────────────────────────────────────────────

export function LinkedInPreview({ text, image, scheduledAt }) {
  const { name } = useDisplayIdentity();
  const [expanded, setExpanded] = useState(false);
  const limit = 210;
  const needsExpand = text && text.length > limit;
  const visible = !expanded && needsExpand ? text.slice(0, limit) + '…' : text;

  return (
    <div style={liStyles.card}>
      <div style={liStyles.header}>
        <Avatar size={48} color="#0A66C2" />
        <div style={liStyles.headerMeta}>
          <div style={liStyles.name}>{name}</div>
          <div style={liStyles.sub}>Posting to LinkedIn</div>
          <div style={liStyles.sub}>{formatWhen(scheduledAt)} · <span style={{ fontSize: 12 }}>🌐</span></div>
        </div>
        <div style={{ ...liStyles.sub, padding: '2px 10px', border: '1px solid #0A66C2', color: '#0A66C2', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>+ Follow</div>
      </div>
      <div style={liStyles.body}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, color: '#000000e0' }}>{visible}</div>
        {needsExpand && (
          <button onClick={() => setExpanded(e => !e)} style={liStyles.seeMore}>
            {expanded ? ' see less' : ' …see more'}
          </button>
        )}
      </div>
      {image && <img src={image} alt="" style={liStyles.image} />}
      <div style={liStyles.reactions}>
        <span style={liStyles.reactionStack}>
          <span style={{ ...liStyles.reactionBubble, background: '#0a66c2' }}>👍</span>
          <span style={{ ...liStyles.reactionBubble, background: '#df704d' }}>❤️</span>
          <span style={{ ...liStyles.reactionBubble, background: '#6dae4f' }}>💡</span>
        </span>
        <span style={{ fontSize: 13, color: '#00000099' }}>127</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#00000099' }}>14 comments · 3 reposts</span>
      </div>
      <div style={liStyles.actions}>
        {['👍 Like', '💬 Comment', '🔁 Repost', '➤ Send'].map(a => (
          <div key={a} style={liStyles.actionBtn}>{a}</div>
        ))}
      </div>
    </div>
  );
}

// ── Twitter / X preview ────────────────────────────────────────────

export function TwitterPreview({ text, image, scheduledAt }) {
  const { name, handle } = useDisplayIdentity();
  const time = formatWhen(scheduledAt);

  return (
    <div style={twStyles.card}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Avatar size={40} color="#000" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0f1419' }}>{name}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M20.396 11l-.87-1.006.69-1.127-.23-1.3-1.254-.42-.21-1.31-1.302-.133-.676-1.13-1.278.3-1.054-.801-1.16.629-1.259-.203-.646 1.131-1.277.277-.17 1.305-1.134.676.275 1.297-.625 1.16.802 1.055-.3 1.277 1.131.676.132 1.303 1.31.21.421 1.255 1.3.23 1.126-.69 1.006.87 1.006-.87 1.127.69 1.3.23.42 1.254 1.31.21.133 1.302 1.129.676-.3 1.278.801 1.054-.629 1.16.203 1.259 1.131.646.277 1.277 1.305.17.676 1.134 1.297-.275 1.16.625 1.055-.802 1.277.3.676-1.131 1.303-.132.21-1.31 1.255-.42.23-1.3-.69-1.127.87-1.006zM9.94 15.66l-3.25-3.25 1.17-1.18 2.08 2.09 4.94-4.95 1.18 1.18-6.12 6.11z"/></svg>
            <span style={{ fontSize: 15, color: '#536471' }}>@{handle}</span>
            <span style={{ fontSize: 15, color: '#536471' }}>·</span>
            <span style={{ fontSize: 15, color: '#536471' }}>{time}</span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.4, color: '#0f1419', marginTop: 4 }}>{text}</div>
          {image && <img src={image} alt="" style={{ width: '100%', borderRadius: 16, marginTop: 12, border: '1px solid #eff3f4' }} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 425, marginTop: 12, color: '#536471' }}>
            {[
              { icon: '💬', count: '42' },
              { icon: '🔁', count: '18' },
              { icon: '♡', count: '284' },
              { icon: '📊', count: '5.2K' },
              { icon: '🔖', count: '' },
            ].map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span>{x.icon}</span>{x.count && <span>{x.count}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Facebook preview ───────────────────────────────────────────────

export function FacebookPreview({ text, image, scheduledAt }) {
  const { name } = useDisplayIdentity();
  const [expanded, setExpanded] = useState(false);
  const limit = 125;
  const needsExpand = text && text.length > limit;
  const visible = !expanded && needsExpand ? text.slice(0, limit) + '…' : text;

  return (
    <div style={fbStyles.card}>
      <div style={fbStyles.header}>
        <Avatar size={40} shape="circle" color="#1877F2" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#050505' }}>{name}</div>
          <div style={{ fontSize: 13, color: '#65676b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{formatWhen(scheduledAt)}</span>
            <span>·</span>
            <span>🌍</span>
          </div>
        </div>
        <div style={{ fontSize: 20, color: '#65676b' }}>⋯</div>
      </div>
      <div style={{ padding: '0 16px 12px', fontSize: 15, color: '#050505', whiteSpace: 'pre-wrap', lineHeight: 1.33 }}>
        {visible}
        {needsExpand && (
          <button onClick={() => setExpanded(e => !e)} style={fbStyles.seeMore}>
            {expanded ? ' See less' : ' See more'}
          </button>
        )}
      </div>
      {image && <img src={image} alt="" style={{ width: '100%', display: 'block' }} />}
      <div style={fbStyles.reactionRow}>
        <span style={fbStyles.reactionEmojis}>
          <span style={fbStyles.reactionBubble}>👍</span>
          <span style={fbStyles.reactionBubble}>❤️</span>
          <span style={fbStyles.reactionBubble}>😮</span>
        </span>
        <span style={{ fontSize: 13, color: '#65676b' }}>Sarah, Mark and 203 others</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#65676b' }}>28 comments · 5 shares</span>
      </div>
      <div style={fbStyles.actions}>
        {['👍  Like', '💬  Comment', '↗  Share'].map(a => (
          <div key={a} style={fbStyles.actionBtn}>{a}</div>
        ))}
      </div>
    </div>
  );
}

// ── Instagram preview ──────────────────────────────────────────────

export function InstagramPreview({ text, image, scheduledAt }) {
  const { name, handle } = useDisplayIdentity();
  const [expanded, setExpanded] = useState(false);
  const limit = 125;
  const needsExpand = text && text.length > limit;
  const visible = !expanded && needsExpand ? text.slice(0, limit) : text;

  return (
    <div style={igStyles.card}>
      <div style={igStyles.header}>
        <div style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2, borderRadius: '50%' }}>
          <Avatar size={32} color="#E4405F" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>{handle}</div>
        </div>
        <div style={{ fontSize: 18, color: '#262626' }}>⋯</div>
      </div>
      {image ? (
        <img src={image} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={igStyles.noImage}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 13 }}>Instagram posts require an image</div>
          </div>
        </div>
      )}
      <div style={igStyles.actions}>
        <span style={{ fontSize: 22 }}>♡</span>
        <span style={{ fontSize: 22 }}>💬</span>
        <span style={{ fontSize: 22 }}>↗</span>
        <span style={{ marginLeft: 'auto', fontSize: 22 }}>🔖</span>
      </div>
      <div style={{ padding: '0 16px', fontSize: 14, fontWeight: 600, color: '#262626' }}>1,284 likes</div>
      <div style={{ padding: '4px 16px 4px', fontSize: 14, color: '#262626', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600, marginRight: 6 }}>{handle}</span>
        {visible}
        {needsExpand && !expanded && <button onClick={() => setExpanded(true)} style={igStyles.seeMore}>… more</button>}
      </div>
      <div style={{ padding: '8px 16px 12px', fontSize: 12, color: '#8e8e8e' }}>View all 47 comments · {formatWhen(scheduledAt)}</div>
    </div>
  );
}

// ── Blog preview (article layout) ──────────────────────────────────

export function BlogPreview({ text, image, scheduledAt }) {
  const { name } = useDisplayIdentity();
  const html = { __html: marked.parse(text || '', { breaks: true }) };
  return (
    <div style={longStyles.article}>
      <div style={longStyles.articleMeta}>
        <Avatar size={36} color="#6366f1" />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Publishing {formatWhen(scheduledAt)} · 4 min read</div>
        </div>
      </div>
      {image && <img src={image} alt="" style={longStyles.heroImg} />}
      <div style={longStyles.articleBody} dangerouslySetInnerHTML={html} />
    </div>
  );
}

// ── Newsletter preview (email client) ──────────────────────────────

export function NewsletterPreview({ text, image, scheduledAt }) {
  const { name, handle } = useDisplayIdentity();
  const lines = (text || '').split('\n');
  const firstLine = lines[0] || 'Your newsletter';
  const subject = firstLine.replace(/^#+\s*/, '').slice(0, 90);
  const bodyText = lines.slice(firstLine.match(/^#/) ? 1 : 0).join('\n').trim();
  const html = { __html: marked.parse(bodyText, { breaks: true }) };
  return (
    <div style={longStyles.email}>
      <div style={longStyles.emailSubject}>{subject}</div>
      <div style={longStyles.emailHeader}>
        <Avatar size={36} color="#10b981" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}><strong>{name}</strong> &lt;{handle}@strideshift.ai&gt;</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>to me · {formatWhen(scheduledAt)}</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📥 Inbox</div>
      </div>
      {image && <img src={image} alt="" style={longStyles.heroImg} />}
      <div style={longStyles.emailBody} dangerouslySetInnerHTML={html} />
      <div style={longStyles.emailFooter}>
        Sent via ScribeShift · <span style={{ textDecoration: 'underline' }}>Unsubscribe</span>
      </div>
    </div>
  );
}

// ── Video script preview ───────────────────────────────────────────

export function VideoScriptPreview({ text, scheduledAt }) {
  // Highlight [SCENE]/[VISUAL]/[B-ROLL]/[TEXT ON SCREEN] tags as colored blocks.
  const parts = (text || '').split(/(\[[^\]]+\][^\n]*)/g).filter(Boolean);
  return (
    <div style={longStyles.script}>
      <div style={longStyles.scriptHeader}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Video script</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatWhen(scheduledAt)}</div>
      </div>
      <div style={longStyles.scriptBody}>
        {parts.map((p, i) => {
          const tagMatch = p.match(/^\[([^\]]+)\](.*)/);
          if (tagMatch) {
            const tag = tagMatch[1].toUpperCase();
            const tagColor =
              tag.startsWith('SCENE') ? '#6366f1' :
              tag.startsWith('VISUAL') ? '#10b981' :
              tag.startsWith('B-ROLL') ? '#f59e0b' :
              tag.startsWith('TEXT') ? '#ec4899' :
              '#64748b';
            return (
              <div key={i} style={{ ...longStyles.scriptTag, borderLeftColor: tagColor }}>
                <span style={{ ...longStyles.scriptTagLabel, background: tagColor }}>{tag}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{tagMatch[2]}</span>
              </div>
            );
          }
          return <div key={i} style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: 'var(--text)', padding: '4px 0' }}>{p}</div>;
        })}
      </div>
    </div>
  );
}

// ── Style objects ──────────────────────────────────────────────────

import { useState } from 'react';

const liStyles = {
  card: { background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', color: '#000000e0' },
  header: { display: 'flex', gap: 10, padding: 12, alignItems: 'flex-start' },
  headerMeta: { flex: 1, minWidth: 0 },
  name: { fontWeight: 600, fontSize: 14, color: '#000000e0' },
  sub: { fontSize: 12, color: '#00000099' },
  body: { padding: '0 12px 12px', fontSize: 14 },
  seeMore: { background: 'none', border: 'none', color: '#00000099', cursor: 'pointer', padding: 0, fontSize: 14 },
  image: { width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' },
  reactions: { display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderTop: '1px solid #e0e0e0' },
  reactionStack: { display: 'flex' },
  reactionBubble: { width: 18, height: 18, borderRadius: '50%', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -4, border: '1.5px solid #fff' },
  actions: { display: 'flex', justifyContent: 'space-around', padding: 4, borderTop: '1px solid #e0e0e0' },
  actionBtn: { padding: '10px 12px', fontSize: 14, fontWeight: 600, color: '#00000099', cursor: 'pointer', borderRadius: 4 },
};

const twStyles = {
  card: { background: '#fff', border: '1px solid #eff3f4', padding: 16, borderRadius: 0, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' },
};

const fbStyles = {
  card: { background: '#fff', borderRadius: 8, border: '1px solid #dddfe2', overflow: 'hidden', fontFamily: 'Helvetica, Arial, sans-serif' },
  header: { display: 'flex', gap: 10, padding: 12, alignItems: 'center' },
  seeMore: { background: 'none', border: 'none', color: '#65676b', cursor: 'pointer', padding: 0, fontSize: 15, fontWeight: 600 },
  reactionRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderBottom: '1px solid #ced0d4' },
  reactionEmojis: { display: 'flex' },
  reactionBubble: { width: 18, height: 18, borderRadius: '50%', background: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -4, border: '1.5px solid #fff' },
  actions: { display: 'flex', padding: 4 },
  actionBtn: { flex: 1, textAlign: 'center', padding: 8, fontSize: 14, color: '#65676b', fontWeight: 600, cursor: 'pointer', borderRadius: 4 },
};

const igStyles = {
  card: { background: '#fff', borderRadius: 8, border: '1px solid #dbdbdb', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' },
  noImage: { width: '100%', aspectRatio: '1 / 1', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e8e', borderTop: '1px solid #efefef', borderBottom: '1px solid #efefef' },
  actions: { display: 'flex', gap: 16, padding: '10px 16px', color: '#262626' },
  seeMore: { background: 'none', border: 'none', color: '#8e8e8e', cursor: 'pointer', padding: 0, fontSize: 14 },
};

const longStyles = {
  article: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '24px 28px',
    color: 'var(--text)',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  articleMeta: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, fontFamily: '-apple-system, sans-serif' },
  articleBody: { fontSize: 17, lineHeight: 1.7, color: 'var(--text)' },
  heroImg: { width: '100%', borderRadius: 8, marginBottom: 20, display: 'block' },
  email: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  },
  emailSubject: { padding: '16px 20px 8px', fontSize: 20, fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
  emailHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)' },
  emailBody: { padding: '20px', fontSize: 15, lineHeight: 1.65, color: 'var(--text)' },
  emailFooter: { padding: '16px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
  script: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  scriptHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)' },
  scriptBody: { padding: '16px 20px', fontFamily: '"Courier New", Consolas, monospace' },
  scriptTag: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', margin: '8px 0', background: 'var(--bg-raised)', borderLeft: '3px solid', borderRadius: 4 },
  scriptTagLabel: { color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0 },
};

// ── Router: pick the right preview for (contentType, platform) ────

export function PostPreview({ contentType = 'social', platform = 'linkedin', text, image, scheduledAt, viewMode }) {
  // Long-form content: either render the full long-form view OR preview the
  // per-platform social adaptation depending on viewMode.
  const isLongForm = ['blog', 'newsletter', 'video'].includes(contentType);

  if (isLongForm && viewMode === 'longform') {
    if (contentType === 'blog') return <BlogPreview text={text} image={image} scheduledAt={scheduledAt} />;
    if (contentType === 'newsletter') return <NewsletterPreview text={text} image={image} scheduledAt={scheduledAt} />;
    if (contentType === 'video') return <VideoScriptPreview text={text} scheduledAt={scheduledAt} />;
  }

  switch (platform) {
    case 'twitter': return <TwitterPreview text={text} image={image} scheduledAt={scheduledAt} />;
    case 'facebook': return <FacebookPreview text={text} image={image} scheduledAt={scheduledAt} />;
    case 'instagram': return <InstagramPreview text={text} image={image} scheduledAt={scheduledAt} />;
    case 'linkedin':
    default:
      return <LinkedInPreview text={text} image={image} scheduledAt={scheduledAt} />;
  }
}
