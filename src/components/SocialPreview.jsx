import React, { useState } from 'react';
import { useAuth } from './AuthProvider';

const PLATFORM_CONFIG = {
  linkedin: {
    name: 'LinkedIn',
    color: '#0A66C2',
    bgColor: '#f3f2ef',
    textColor: '#000000',
    maxChars: 1300,
    footer: ['Like', 'Comment', 'Repost', 'Send'],
  },
  twitter: {
    name: 'Twitter / X',
    color: '#1DA1F2',
    bgColor: '#15202b',
    textColor: '#e7e9ea',
    maxChars: 280,
    footer: ['Reply', 'Repost', 'Like', 'Share'],
  },
  facebook: {
    name: 'Facebook',
    color: '#1877F2',
    bgColor: '#242526',
    textColor: '#e4e6eb',
    maxChars: 800,
    footer: ['Like', 'Comment', 'Share'],
  },
  instagram: {
    name: 'Instagram',
    color: '#E4405F',
    bgColor: '#000000',
    textColor: '#f5f5f5',
    maxChars: 1500,
    footer: ['Heart', 'Comment', 'Send', 'Save'],
  },
};

// Extract [IMAGE: description] tags from post text
function parseImageTags(text) {
  const tags = [];
  const regex = /\[IMAGE:\s*([^\]]+)\]/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tags.push({ full: match[0], description: match[1].trim() });
  }
  return tags;
}

// Remove [IMAGE: ...] tags from display text
function stripImageTags(text) {
  return text.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').trim();
}

function parsePosts(rawContent) {
  if (!rawContent) return [];
  const posts = [];

  // Find the first [POST X] marker and discard everything before it (preamble)
  const firstPostIdx = rawContent.search(/\[POST\s+\d+/i);
  const content = firstPostIdx > 0 ? rawContent.slice(firstPostIdx) : rawContent;

  const regex = /\[POST\s+\d+[^\]]*\]\s*/gi;
  const parts = content.split(regex).filter(Boolean);

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 10) {
      // Remove trailing character count like (245 characters)
      const cleaned = trimmed.replace(/\(\d+\s*characters?\)\s*$/i, '').trim();
      posts.push(cleaned);
    }
  }

  // Fallback: if no [POST] markers, split by double newlines
  if (posts.length === 0) {
    const chunks = rawContent.split(/\n{3,}/).filter(c => c.trim().length > 20);
    return chunks.slice(0, 5);
  }

  return posts.slice(0, 5);
}

// Posts longer than this get a Read more / Show less toggle so the card
// doesn't grow indefinitely and dominate the screen.
const COLLAPSE_THRESHOLD_CHARS = 500;

function PostCard({ platform, text, index, onEdit, brand, authHeaders }) {
  const config = PLATFORM_CONFIG[platform];
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [copied, setCopied] = useState(false);
  const [generatedImages, setGeneratedImages] = useState({});
  const [generatingImage, setGeneratingImage] = useState(null);
  const [postImage, setPostImage] = useState(null);
  const [generatingPostImage, setGeneratingPostImage] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const imageTags = parseImageTags(text);
  const displayText = stripImageTags(text);
  const charCount = displayText.length;
  const isLong = charCount > COLLAPSE_THRESHOLD_CHARS;

  const handleSave = () => {
    onEdit(index, editText);
    setEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadImage = (imageData, label) => {
    const link = document.createElement('a');
    link.href = `data:${imageData.mimeType || 'image/png'};base64,${imageData.base64}`;
    link.download = `scribeshift_${platform}_post${index + 1}_${label}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateImage = async (tag, tagIndex) => {
    setGeneratingImage(tagIndex);
    try {
      const prompt = `Social media post image for ${platform}: ${tag.description}. Clean, high quality, suitable for ${config.name}. 16:9 aspect ratio.`;
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          logoBase64: brand?.logoBase64 || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedImages(prev => ({
          ...prev,
          [tagIndex]: { base64: data.base64, mimeType: data.mimeType },
        }));
      }
    } catch (err) {
      console.error('Image generation failed:', err);
    } finally {
      setGeneratingImage(null);
    }
  };

  const handleGeneratePostImage = async () => {
    setGeneratingPostImage(true);
    try {
      const summary = displayText.length > 200 ? displayText.slice(0, 200) + '...' : displayText;
      const prompt = `Create a visually engaging social media image for a ${config.name} post. The post is about: ${summary}. Style: clean, modern, professional, suitable for ${config.name}. 16:9 aspect ratio.`;
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          logoBase64: brand?.logoBase64 || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPostImage({ base64: data.base64, mimeType: data.mimeType });
      }
    } catch (err) {
      console.error('Post image generation failed:', err);
    } finally {
      setGeneratingPostImage(false);
    }
  };

  return (
    <div className="social-post-card" style={{ borderLeftColor: config.color }}>
      <div className="post-card-header">
        <div className="post-platform-badge" style={{ background: config.color }}>
          {config.name}
        </div>
        <span className="post-number">#{index + 1}</span>
        <div className="post-actions">
          <button className="post-action-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            className="post-action-btn"
            onClick={() => editing ? handleSave() : setEditing(true)}
          >
            {editing ? 'Save' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Image tags — show above post body */}
      {imageTags.length > 0 && (
        <div className="post-image-section">
          {imageTags.map((tag, ti) => (
            <div key={ti} className="post-image-slot">
              {generatedImages[ti] ? (
                <div className="post-image-result">
                  <img
                    src={`data:${generatedImages[ti].mimeType || 'image/png'};base64,${generatedImages[ti].base64}`}
                    alt={tag.description}
                    className="post-generated-image"
                  />
                  <div className="post-image-actions">
                    <button className="post-action-btn" onClick={() => handleDownloadImage(generatedImages[ti], `img${ti + 1}`)}>
                      Download
                    </button>
                    <button
                      className={`post-action-btn ${generatingImage === ti ? 'loading' : ''}`}
                      onClick={() => handleGenerateImage(tag, ti)}
                      disabled={generatingImage !== null}
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              ) : (
                <div className="post-image-placeholder">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="image-placeholder-desc">{tag.description}</span>
                  <button
                    className={`btn btn-sm post-gen-img-btn ${generatingImage === ti ? 'loading' : ''}`}
                    onClick={() => handleGenerateImage(tag, ti)}
                    disabled={generatingImage !== null}
                  >
                    {generatingImage === ti ? '' : 'Generate Image'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generated post image */}
      {postImage && (
        <div className="post-image-section">
          <div className="post-image-slot">
            <div className="post-image-result">
              <img
                src={`data:${postImage.mimeType || 'image/png'};base64,${postImage.base64}`}
                alt={`Generated image for ${config.name} post`}
                className="post-generated-image"
              />
              <div className="post-image-actions">
                <button className="post-action-btn" onClick={() => handleDownloadImage(postImage, 'image')}>
                  Download
                </button>
                <button
                  className={`post-action-btn ${generatingPostImage ? 'loading' : ''}`}
                  onClick={handleGeneratePostImage}
                  disabled={generatingPostImage}
                >
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="post-card-body" style={{ background: config.bgColor, color: config.textColor }}>
        {editing ? (
          <textarea
            className="post-edit-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{ color: config.textColor, background: 'transparent' }}
          />
        ) : (
          <>
            <div className={`post-text ${isLong && !expanded ? 'is-clamped' : ''}`}>
              {displayText}
            </div>
            {isLong && (
              <button
                type="button"
                className="post-expand-toggle"
                onClick={() => setExpanded(v => !v)}
                style={{ color: config.color }}
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="post-card-footer">
        <div className="post-char-count" style={{ color: charCount > config.maxChars ? '#ef4444' : 'var(--text-muted)' }}>
          {charCount} / {config.maxChars}
        </div>
        <div className="post-footer-actions-row">
          <button
            className={`post-action-btn post-gen-image-btn ${generatingPostImage ? 'loading' : ''}`}
            onClick={handleGeneratePostImage}
            disabled={generatingPostImage || generatingImage !== null}
          >
            {generatingPostImage ? '' : (postImage ? 'Regenerate Image' : 'Generate Image')}
          </button>
          <div className="post-social-actions">
            {config.footer.map((action) => (
              <span key={action} className="post-footer-action">{action}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SocialPreview({ platform, content, onContentUpdate, brand }) {
  const { getAuthHeaders } = useAuth();
  const posts = parsePosts(content);
  const authHeaders = getAuthHeaders();

  const handleEdit = (index, newText) => {
    const allPosts = parsePosts(content);
    allPosts[index] = newText;
    // Rebuild the content string
    const rebuilt = allPosts.map((p, i) => `[POST ${i + 1}]\n${p}\n(${p.length} characters)`).join('\n\n');
    onContentUpdate(platform, rebuilt);
  };

  if (!posts.length) {
    return <div className="social-empty">No posts generated yet.</div>;
  }

  return (
    <div className="social-preview">
      {posts.map((post, i) => (
        <PostCard
          key={i}
          platform={platform}
          text={post}
          index={i}
          onEdit={handleEdit}
          brand={brand}
          authHeaders={authHeaders}
        />
      ))}
    </div>
  );
}
