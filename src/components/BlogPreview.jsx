import { useState, useRef } from 'react';
import { marked } from 'marked';
import html2pdf from 'html2pdf.js';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

export default function BlogPreview({ content, brand, onContentUpdate }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef(null);

  const brandName = brand?.brandName || 'ScribeShift';
  const primaryColor = brand?.primaryColor || '#3b82f6';
  const secondaryColor = brand?.secondaryColor || '#475569';
  const logoUrl = brand?.logoPreviewUrl || null;

  const handleSave = () => {
    onContentUpdate('blog', editText);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditText(content);
    setEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brandName.replace(/\s+/g, '_')}_blog.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const element = previewRef.current;
      const opt = {
        margin: 0,
        filename: `${brandName.replace(/\s+/g, '_')}_blog.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const htmlContent = marked.parse(content || '');

  // Intercept clicks on links inside rendered blog HTML to prevent page reload
  const handleBlogClick = (e) => {
    const link = e.target.closest('a');
    if (link) {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href && href !== '#' && !href.startsWith('#')) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="blog-preview-wrapper">
      {/* Toolbar */}
      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          <span className="preview-toolbar-label">Blog Post</span>
        </div>
        <div className="preview-toolbar-actions">
          {editing ? (
            <>
              <button className="post-action-btn" onClick={handleSave}>Save</button>
              <button className="post-action-btn" onClick={handleCancel}>Cancel</button>
            </>
          ) : (
            <>
              <button className="post-action-btn" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="post-action-btn" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button className="post-action-btn" onClick={handleDownloadMd}>
                Download .md
              </button>
              <button
                className={`post-action-btn post-action-btn-primary ${exporting ? 'loading' : ''}`}
                onClick={handleDownloadPdf}
                disabled={exporting}
              >
                {exporting ? '' : 'Download PDF'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Edit mode */}
      {editing ? (
        <div className="preview-edit-area">
          <textarea
            className="preview-edit-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={20}
          />
        </div>
      ) : (
        /* Styled blog preview */
        <div className="blog-preview-container" ref={previewRef}>
          {/* Blog header with brand */}
          <div className="blog-header" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
            <div className="blog-header-inner">
              {logoUrl && (
                <img src={logoUrl} alt="" className="blog-header-logo" />
              )}
              <span className="blog-header-brand">{brandName}</span>
            </div>
          </div>

          {/* Blog body */}
          <div className="blog-body">
            <div
              className="blog-content-rendered"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
              onClick={handleBlogClick}
            />
          </div>

          {/* Blog footer */}
          <div className="blog-footer" style={{ borderTopColor: primaryColor }}>
            <div className="blog-footer-inner">
              {logoUrl && <img src={logoUrl} alt="" className="blog-footer-logo" />}
              <div className="blog-footer-text">
                <span className="blog-footer-brand">{brandName}</span>
                <span className="blog-footer-sub">Generated with ScribeShift</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
