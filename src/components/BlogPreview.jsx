import { useState, useRef, useMemo } from 'react';
import { marked } from 'marked';
import html2pdf from 'html2pdf.js';

marked.setOptions({ breaks: true, gfm: true });

const TEMPLATES = [
  { key: 'editorial', name: 'Editorial', desc: 'Magazine-style with hero header and reading time' },
  { key: 'magazine',  name: 'Magazine',  desc: 'Drop cap, serif body, two-column inspired' },
  { key: 'minimal',   name: 'Minimal',   desc: 'Clean typography, generous whitespace, sans-serif' },
  { key: 'corporate', name: 'Corporate', desc: 'Sidebar metadata, structured sections, B2B feel' },
];

// Strip a leading H1 from the markdown so we can render it ourselves in the
// template chrome (date, byline, etc). Returns { title, dek, body }.
function splitTitleAndBody(md) {
  if (!md) return { title: '', dek: '', body: '' };
  const lines = md.split('\n');
  let title = '';
  let dek = '';
  let bodyStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('# ') && !title) {
      title = trimmed.replace(/^#\s+/, '').trim();
      bodyStartIdx = i + 1;
      // Look ahead for an italicised dek line
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].trim() === '') bodyStartIdx++;
      const next = (lines[bodyStartIdx] || '').trim();
      if (next.startsWith('*') && next.endsWith('*') && !next.startsWith('**')) {
        dek = next.replace(/^\*+|\*+$/g, '').trim();
        bodyStartIdx += 1;
      }
      break;
    }
    if (trimmed) break; // first non-empty line wasn't a title — bail out
  }
  const body = lines.slice(bodyStartIdx).join('\n').trim();
  return { title: title || '(Untitled)', dek, body };
}

function readingTimeMinutes(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export default function BlogPreview({ content, brand, onContentUpdate }) {
  const [template, setTemplate] = useState('editorial');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef(null);

  const brandName = brand?.brandName || 'ScribeShift';
  const primaryColor = brand?.primaryColor || '#3b82f6';
  const secondaryColor = brand?.secondaryColor || '#475569';
  const logoUrl = brand?.logoPreviewUrl || null;
  const author = brand?.brandName || 'ScribeShift Team';

  const { title, dek, body } = useMemo(() => splitTitleAndBody(content), [content]);
  const bodyHtml = useMemo(() => marked.parse(body), [body]);
  const readMin = useMemo(() => readingTimeMinutes(body), [body]);
  const today = useMemo(() => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), []);

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
      const opt = {
        margin: 0,
        filename: `${brandName.replace(/\s+/g, '_')}_blog.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      await html2pdf().set(opt).from(previewRef.current).save();
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleLinkClick = (e) => {
    const link = e.target.closest('a');
    if (link) {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href && href !== '#' && !href.startsWith('#')) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // ── Template renderers ───────────────────────────────────────────────
  const renderEditorial = () => (
    <article className="bp-editorial" ref={previewRef}>
      <header className="bp-edt-hero" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
        <div className="bp-edt-hero-meta">
          {logoUrl ? <img src={logoUrl} alt="" className="bp-edt-logo" /> : <span className="bp-edt-brand-pill">{brandName}</span>}
          <span className="bp-edt-dot">•</span>
          <span>{today}</span>
          <span className="bp-edt-dot">•</span>
          <span>{readMin} min read</span>
        </div>
        <h1 className="bp-edt-title">{title}</h1>
        {dek && <p className="bp-edt-dek">{dek}</p>}
      </header>
      <div className="bp-edt-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} onClick={handleLinkClick} />
      <footer className="bp-edt-footer">
        <span className="bp-edt-footer-line" style={{ background: primaryColor }} />
        <span>By {author} · {brandName}</span>
      </footer>
    </article>
  );

  const renderMagazine = () => (
    <article className="bp-magazine" ref={previewRef}>
      <header className="bp-mag-header">
        <div className="bp-mag-rule" style={{ borderColor: primaryColor }} />
        <div className="bp-mag-cat" style={{ color: primaryColor }}>{brandName.toUpperCase()}</div>
        <h1 className="bp-mag-title">{title}</h1>
        {dek && <p className="bp-mag-dek">{dek}</p>}
        <div className="bp-mag-byline">
          {logoUrl && <img src={logoUrl} alt="" className="bp-mag-avatar" />}
          <div>
            <div className="bp-mag-author">{author}</div>
            <div className="bp-mag-date">{today} · {readMin} min</div>
          </div>
        </div>
        <div className="bp-mag-rule" style={{ borderColor: primaryColor }} />
      </header>
      <div className="bp-mag-body bp-mag-dropcap" dangerouslySetInnerHTML={{ __html: bodyHtml }} onClick={handleLinkClick} />
      <footer className="bp-mag-footer">
        <span>{brandName}</span>
      </footer>
    </article>
  );

  const renderMinimal = () => (
    <article className="bp-minimal" ref={previewRef}>
      <header className="bp-min-header">
        <div className="bp-min-meta">
          {logoUrl && <img src={logoUrl} alt="" className="bp-min-logo" />}
          <span className="bp-min-brand">{brandName}</span>
        </div>
        <h1 className="bp-min-title">{title}</h1>
        {dek && <p className="bp-min-dek">{dek}</p>}
        <div className="bp-min-sub">{today} · {readMin} min read</div>
      </header>
      <div className="bp-min-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} onClick={handleLinkClick} />
      <footer className="bp-min-footer">
        <span>By {author}</span>
      </footer>
    </article>
  );

  const renderCorporate = () => (
    <article className="bp-corporate" ref={previewRef}>
      <div className="bp-corp-header" style={{ borderTopColor: primaryColor }}>
        <div className="bp-corp-header-row">
          {logoUrl && <img src={logoUrl} alt="" className="bp-corp-logo" />}
          <span className="bp-corp-brand">{brandName}</span>
        </div>
        <h1 className="bp-corp-title">{title}</h1>
        {dek && <p className="bp-corp-dek">{dek}</p>}
      </div>
      <div className="bp-corp-grid">
        <aside className="bp-corp-sidebar">
          <div className="bp-corp-side-section">
            <div className="bp-corp-side-label">Author</div>
            <div className="bp-corp-side-value">{author}</div>
          </div>
          <div className="bp-corp-side-section">
            <div className="bp-corp-side-label">Published</div>
            <div className="bp-corp-side-value">{today}</div>
          </div>
          <div className="bp-corp-side-section">
            <div className="bp-corp-side-label">Read time</div>
            <div className="bp-corp-side-value">{readMin} min</div>
          </div>
          <div className="bp-corp-side-bar" style={{ background: primaryColor }} />
        </aside>
        <div className="bp-corp-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} onClick={handleLinkClick} />
      </div>
      <footer className="bp-corp-footer" style={{ borderTopColor: primaryColor }}>
        <span>{brandName} · Generated with ScribeShift</span>
      </footer>
    </article>
  );

  const templateRenderers = {
    editorial: renderEditorial,
    magazine: renderMagazine,
    minimal: renderMinimal,
    corporate: renderCorporate,
  };

  return (
    <div className="blog-preview-wrapper">
      {/* Template selector */}
      <div className="bp-template-selector">
        <span className="bp-template-label">Template:</span>
        <div className="bp-template-options">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`bp-template-btn ${template === t.key ? 'active' : ''}`}
              onClick={() => setTemplate(t.key)}
              title={t.desc}
              style={template === t.key ? { borderColor: primaryColor, background: `${primaryColor}18` } : {}}
            >
              <span className="bp-template-name">{t.name}</span>
              <span className="bp-template-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

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
              <button className="post-action-btn" onClick={() => setEditing(true)}>Edit</button>
              <button className="post-action-btn" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
              <button className="post-action-btn" onClick={handleDownloadMd}>Download .md</button>
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

      {/* Edit / preview */}
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
        <div className="bp-preview-scroll">
          {templateRenderers[template]()}
        </div>
      )}
    </div>
  );
}
