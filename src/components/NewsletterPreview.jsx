import { useState, useRef } from 'react';
import { marked } from 'marked';
import html2pdf from 'html2pdf.js';

marked.setOptions({ breaks: true, gfm: true });

const TEMPLATES = [
  { key: 'executive', name: 'Executive', desc: 'Clean corporate layout with colored header banner' },
  { key: 'modern', name: 'Modern', desc: 'Minimal design with card sections and large typography' },
  { key: 'bold', name: 'Bold', desc: 'High-energy with colored sidebar and strong accents' },
  { key: 'classic', name: 'Classic', desc: 'Traditional centered newsletter with serif headings' },
];

export default function NewsletterPreview({ content, brand, onContentUpdate }) {
  const [template, setTemplate] = useState('executive');
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
    onContentUpdate('newsletter', editText);
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

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const opt = {
        margin: 0,
        filename: `${brandName.replace(/\s+/g, '_')}_newsletter.pdf`,
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

  const handleDownloadMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brandName.replace(/\s+/g, '_')}_newsletter.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parse content into sections for structured rendering
  const parseSections = (text) => {
    if (!text) return { greeting: '', thinking: '', featured: '', quickHits: '', question: '', comingUp: '', signOff: '', raw: '' };

    const sections = {
      greeting: '',
      thinking: '',
      featured: '',
      quickHits: '',
      question: '',
      comingUp: '',
      signOff: '',
      raw: text,
    };

    // Try to split by markdown headers
    const lines = text.split('\n');
    let currentSection = 'greeting';
    let buffer = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.match(/^#+\s*.*subject\s*line/i) || lower.match(/^subject:/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [line];
        currentSection = 'greeting';
        continue;
      }
      if (lower.match(/^#+\s*.*greet/i) || lower.match(/^#+\s*.*hello/i) || lower.match(/^#+\s*.*hey/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'greeting';
        continue;
      }
      if (lower.match(/^#+\s*.*think/i) || lower.match(/^#+\s*.*been\s/i) || lower.match(/^#+\s*.*week/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'thinking';
        continue;
      }
      if (lower.match(/^#+\s*.*feature/i) || lower.match(/^#+\s*.*article/i) || lower.match(/^#+\s*.*main/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'featured';
        continue;
      }
      if (lower.match(/^#+\s*.*quick\s*hit/i) || lower.match(/^#+\s*.*insight/i) || lower.match(/^#+\s*.*highlight/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'quickHits';
        continue;
      }
      if (lower.match(/^#+\s*.*thought/i) || lower.match(/^#+\s*.*question/i) || lower.match(/^#+\s*.*chew/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'question';
        continue;
      }
      if (lower.match(/^#+\s*.*coming\s*up/i) || lower.match(/^#+\s*.*next\s*week/i) || lower.match(/^#+\s*.*preview/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'comingUp';
        continue;
      }
      if (lower.match(/^#+\s*.*sign.?off/i) || lower.match(/^#+\s*.*until\s*next/i) || lower.match(/^#+\s*.*warm/i) || lower.match(/^#+\s*.*cheers/i)) {
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim();
        buffer = [];
        currentSection = 'signOff';
        continue;
      }
      buffer.push(line);
    }
    if (buffer.length) sections[currentSection] = buffer.join('\n').trim();

    return sections;
  };

  const sections = parseSections(content);
  const htmlContent = marked.parse(content || '');

  // Intercept clicks on links inside rendered HTML to prevent page reload
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

  const renderExecutive = () => (
    <div className="nl-executive" ref={previewRef}>
      <div className="nl-exec-header" style={{ background: primaryColor }}>
        <div className="nl-exec-header-inner">
          {logoUrl && <img src={logoUrl} alt="" className="nl-logo" />}
          <div className="nl-exec-header-text">
            <div className="nl-exec-brand" style={{ color: getContrastColor(primaryColor) }}>{brandName}</div>
            <div className="nl-exec-tagline" style={{ color: getContrastColor(primaryColor, 0.8) }}>Weekly Newsletter</div>
          </div>
        </div>
      </div>
      <div className="nl-exec-body">
        <div className="nl-rendered" dangerouslySetInnerHTML={{ __html: htmlContent }} onClick={handleLinkClick} />
      </div>
      <div className="nl-exec-footer" style={{ background: primaryColor }}>
        <span style={{ color: getContrastColor(primaryColor) }}>{brandName} &bull; Generated with ScribeShift</span>
      </div>
    </div>
  );

  const renderModern = () => (
    <div className="nl-modern" ref={previewRef}>
      <div className="nl-modern-header">
        <div className="nl-modern-header-left">
          {logoUrl && <img src={logoUrl} alt="" className="nl-logo-sm" />}
          <span className="nl-modern-brand">{brandName}</span>
        </div>
        <div className="nl-modern-header-right" style={{ color: primaryColor }}>Newsletter</div>
      </div>
      <div className="nl-modern-divider" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
      <div className="nl-modern-body">
        <div className="nl-rendered" dangerouslySetInnerHTML={{ __html: htmlContent }} onClick={handleLinkClick} />
      </div>
      <div className="nl-modern-footer">
        <div className="nl-modern-footer-line" style={{ background: primaryColor }} />
        <span>{brandName} &bull; Generated with ScribeShift</span>
      </div>
    </div>
  );

  const renderBold = () => (
    <div className="nl-bold" ref={previewRef}>
      <div className="nl-bold-sidebar" style={{ background: `linear-gradient(180deg, ${primaryColor}, ${secondaryColor})` }} />
      <div className="nl-bold-content">
        <div className="nl-bold-header">
          <div className="nl-bold-brand-row">
            {logoUrl && <img src={logoUrl} alt="" className="nl-logo" />}
            <span className="nl-bold-brand" style={{ color: primaryColor }}>{brandName}</span>
          </div>
          <div className="nl-bold-title">Newsletter</div>
        </div>
        <div className="nl-rendered" dangerouslySetInnerHTML={{ __html: htmlContent }} onClick={handleLinkClick} />
        <div className="nl-bold-footer">
          <span>{brandName} &bull; Generated with ScribeShift</span>
        </div>
      </div>
    </div>
  );

  const renderClassic = () => (
    <div className="nl-classic" ref={previewRef}>
      <div className="nl-classic-header">
        {logoUrl && <img src={logoUrl} alt="" className="nl-logo-lg" />}
        <div className="nl-classic-brand">{brandName}</div>
        <div className="nl-classic-rule" style={{ borderColor: primaryColor }} />
        <div className="nl-classic-tagline">Weekly Newsletter</div>
      </div>
      <div className="nl-classic-body">
        <div className="nl-rendered" dangerouslySetInnerHTML={{ __html: htmlContent }} onClick={handleLinkClick} />
      </div>
      <div className="nl-classic-footer">
        <div className="nl-classic-rule" style={{ borderColor: primaryColor }} />
        <span>{brandName} &bull; Generated with ScribeShift</span>
      </div>
    </div>
  );

  const templateRenderers = {
    executive: renderExecutive,
    modern: renderModern,
    bold: renderBold,
    classic: renderClassic,
  };

  return (
    <div className="newsletter-preview-wrapper">
      {/* Template selector */}
      <div className="nl-template-selector">
        <span className="nl-template-label">Template:</span>
        <div className="nl-template-options">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              className={`nl-template-btn ${template === t.key ? 'active' : ''}`}
              onClick={() => setTemplate(t.key)}
              title={t.desc}
              style={template === t.key ? { borderColor: primaryColor, background: `${primaryColor}18` } : {}}
            >
              <span className="nl-template-name">{t.name}</span>
              <span className="nl-template-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          <span className="preview-toolbar-label">Newsletter</span>
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
              <button className="post-action-btn" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
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
        <div className="nl-preview-scroll">
          {templateRenderers[template]()}
        </div>
      )}
    </div>
  );
}

// Utility: get readable text color for a given background
function getContrastColor(hex, opacity = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const color = luminance > 0.5 ? '#1a1a2e' : '#ffffff';
  return opacity < 1 ? `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` : color;
}
