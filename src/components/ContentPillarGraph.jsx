import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { DonutChart, TreeChart, RadarChart } from './PillarCharts';
import SchedulePostModal from './SchedulePostModal';

const PRESET_COLORS = ['#8b5cf6', '#3b82f6', '#f59f0a', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4'];
const PLATFORM_OPTIONS = ['LinkedIn', 'Twitter/X', 'Facebook', 'Instagram', 'Blog', 'Newsletter', 'YouTube', 'TikTok'];
const CONTENT_TYPE_OPTIONS = ['Post', 'Article', 'Video', 'Carousel', 'Story', 'Poll', 'Thread', 'Newsletter', 'Infographic', 'Reel', 'Guide', 'Case Study'];
const STATUS_OPTIONS = [
  { id: 'idea', label: 'Idea', color: '#94a3b8' },
  { id: 'draft', label: 'Draft', color: '#f59f0a' },
  { id: 'ready', label: 'Ready', color: '#3b82f6' },
  { id: 'published', label: 'Published', color: '#10b981' },
];

const VIEW_MODES = [
  { id: 'donut', label: 'Donut', icon: 'M12 2a10 10 0 110 20 10 10 0 010-20zm0 4a6 6 0 100 12 6 6 0 000-12z' },
  { id: 'breakdown', label: 'Breakdown', icon: 'M4 6h16M4 12h10M4 18h6' },
  { id: 'bar', label: 'Bar', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { id: 'tree', label: 'Tree', icon: 'M12 3v6m0 0l-4 4m4-4l4 4M4 17h16M8 13v4m8-4v4' },
  { id: 'timeline', label: 'Timeline', icon: 'M3 12h18M8 7v10M13 7v10M18 7v10' },
  { id: 'radar', label: 'Radar', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z' },
  { id: 'board', label: 'Board', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
];

// Helper to read CSS variables
function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// Strip markdown markers so pillar content posts cleanly on socials
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_(?!\s)([^_\n]+?)_(?!_)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ContentPillarGraph() {
  const { getAuthHeaders } = useAuth();

  // ── State ──────────────────────────────────────────────────────
  const [pillars, setPillars] = useState(() => {
    try {
      const saved = localStorage.getItem('scribeshift-pillars-v2');
      if (saved) return JSON.parse(saved);
    } catch { /* empty */ }
    return [];
  });

  const [contentPieces, setContentPieces] = useState(() => {
    try {
      const saved = localStorage.getItem('scribeshift-content-pieces');
      if (saved) return JSON.parse(saved);
    } catch { /* empty */ }
    return [];
  });

  const [viewMode, setViewMode] = useState('donut');
  const [selectedPillar, setSelectedPillar] = useState(null);
  const [showAddPillar, setShowAddPillar] = useState(false);
  const [editingPillar, setEditingPillar] = useState(null);
  const [showAddContent, setShowAddContent] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [schedulingContent, setSchedulingContent] = useState(null);
  const [newTopic, setNewTopic] = useState('');
  const [dragItem, setDragItem] = useState(null);
  const [contentFilter, setContentFilter] = useState('all');
  const [contentSearch, setContentSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);
  const [quickAddBoard, setQuickAddBoard] = useState(null);
  const [quickAddBoardTitle, setQuickAddBoardTitle] = useState('');
  const [quickAddBoardPillar, setQuickAddBoardPillar] = useState('');
  const [quickAddBoardType, setQuickAddBoardType] = useState('');
  const quickAddBoardRef = useRef(null);

  const [newPillar, setNewPillar] = useState({
    label: '', color: PRESET_COLORS[0], description: '', topics: [],
  });
  const [newContent, setNewContent] = useState({
    title: '', body: '', link: '', pillarId: '', platform: '', contentType: '', status: 'idea', notes: '',
  });

  // Canvas refs removed — charts now use PillarCharts.jsx components

  // ── Load from API on mount, fall back to localStorage ─────────
  useEffect(() => {
    const headers = getAuthHeaders();
    if (!headers.Authorization) return; // not logged in, keep localStorage data

    Promise.all([
      fetch('/api/planner/pillars', { headers }).then(r => r.json()),
      fetch('/api/planner/pieces', { headers }).then(r => r.json()),
    ]).then(([pillarsRes, piecesRes]) => {
      if (pillarsRes.pillars) {
        setPillars(pillarsRes.pillars);
        localStorage.setItem('scribeshift-pillars-v2', JSON.stringify(pillarsRes.pillars));
      }
      if (piecesRes.pieces) {
        setContentPieces(piecesRes.pieces);
        localStorage.setItem('scribeshift-content-pieces', JSON.stringify(piecesRes.pieces));
      }
    }).catch(() => { /* keep localStorage data on network error */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist to localStorage as cache ──────────────────────────
  useEffect(() => { localStorage.setItem('scribeshift-pillars-v2', JSON.stringify(pillars)); }, [pillars]);
  useEffect(() => { localStorage.setItem('scribeshift-content-pieces', JSON.stringify(contentPieces)); }, [contentPieces]);

  // ── Derived data ───────────────────────────────────────────────
  const pillarStats = useMemo(() => {
    const stats = {};
    pillars.forEach(p => {
      const pieces = contentPieces.filter(c => c.pillarId === p.id);
      stats[p.id] = {
        total: pieces.length,
        byStatus: STATUS_OPTIONS.reduce((acc, s) => {
          acc[s.id] = pieces.filter(c => c.status === s.id).length;
          return acc;
        }, {}),
      };
    });
    return stats;
  }, [pillars, contentPieces]);

  const totalContent = contentPieces.length;
  const selectedPillarData = pillars.find(p => p.id === selectedPillar);

  const filteredContent = useMemo(() => {
    let list = contentPieces;
    if (contentFilter !== 'all') list = list.filter(c => c.pillarId === contentFilter);
    if (contentSearch.trim()) {
      const q = contentSearch.toLowerCase();
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        (c.body || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [contentPieces, contentFilter, contentSearch]);

  const getPillarById = (id) => pillars.find(p => p.id === id);
  const getStatusInfo = (id) => STATUS_OPTIONS.find(s => s.id === id) || STATUS_OPTIONS[0];

  // ── Pillar CRUD ────────────────────────────────────────────────
  const handleAddPillar = async () => {
    if (!newPillar.label.trim()) return;
    const headers = getAuthHeaders();
    const tempId = Date.now().toString();
    setPillars(prev => [...prev, { ...newPillar, id: tempId, topics: newPillar.topics || [] }]);
    setNewPillar({ label: '', color: PRESET_COLORS[(pillars.length + 1) % PRESET_COLORS.length], description: '', topics: [] });
    setShowAddPillar(false);
    if (headers.Authorization) {
      try {
        const res = await fetch('/api/planner/pillars', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(newPillar) });
        const data = await res.json();
        if (data.success && data.pillar) setPillars(prev => prev.map(p => p.id === tempId ? data.pillar : p));
      } catch { /* localStorage fallback */ }
    }
  };

  const handleUpdatePillar = async () => {
    if (!editingPillar) return;
    const headers = getAuthHeaders();
    setPillars(prev => prev.map(p => p.id === editingPillar.id ? editingPillar : p));
    setEditingPillar(null);
    if (headers.Authorization) {
      try { await fetch(`/api/planner/pillars/${editingPillar.id}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(editingPillar) }); } catch { /* localStorage fallback */ }
    }
  };

  const handleDeletePillar = async (id) => {
    const headers = getAuthHeaders();
    setPillars(prev => prev.filter(p => p.id !== id));
    setContentPieces(prev => prev.map(c => c.pillarId === id ? { ...c, pillarId: '' } : c));
    if (selectedPillar === id) setSelectedPillar(null);
    if (editingPillar?.id === id) setEditingPillar(null);
    setConfirmDelete(null);
    if (headers.Authorization) {
      try { await fetch(`/api/planner/pillars/${id}`, { method: 'DELETE', headers }); } catch { /* localStorage fallback */ }
    }
  };

  // ── Content CRUD ───────────────────────────────────────────────
  const handleAddContent = async () => {
    if (!newContent.title.trim()) return;
    const headers = getAuthHeaders();
    const tempId = Date.now().toString();
    setContentPieces(prev => [...prev, { ...newContent, id: tempId, createdAt: new Date().toISOString() }]);
    setNewContent({
      title: '', body: '', link: '',
      pillarId: selectedPillar || '',
      platform: '', contentType: '', status: 'idea', notes: '',
    });
    setShowAddContent(false);
    if (headers.Authorization) {
      try {
        const res = await fetch('/api/planner/pieces', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(newContent) });
        const data = await res.json();
        if (data.success && data.piece) setContentPieces(prev => prev.map(c => c.id === tempId ? data.piece : c));
      } catch { /* localStorage fallback */ }
    }
  };

  const handleUpdateContent = async () => {
    if (!editingContent) return;
    const headers = getAuthHeaders();
    setContentPieces(prev => prev.map(c => c.id === editingContent.id ? editingContent : c));
    setEditingContent(null);
    if (headers.Authorization) {
      try { await fetch(`/api/planner/pieces/${editingContent.id}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(editingContent) }); } catch { /* localStorage fallback */ }
    }
  };

  const handleDeleteContent = async (id) => {
    const headers = getAuthHeaders();
    setContentPieces(prev => prev.filter(c => c.id !== id));
    setConfirmDelete(null);
    if (headers.Authorization) {
      try { await fetch(`/api/planner/pieces/${id}`, { method: 'DELETE', headers }); } catch { /* localStorage fallback */ }
    }
  };

  const handleContentStatusChange = async (id, newStatus) => {
    const headers = getAuthHeaders();
    setContentPieces(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    if (headers.Authorization) {
      try { await fetch(`/api/planner/pieces/${id}/status`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) }); } catch { /* localStorage fallback */ }
    }
  };

  // ── Board quick-add ──────────────────────────────────────────
  useEffect(() => {
    if (quickAddBoard && quickAddBoardRef.current) quickAddBoardRef.current.focus();
  }, [quickAddBoard]);

  const handleQuickAddBoard = async (status) => {
    if (!quickAddBoardTitle.trim()) { setQuickAddBoard(null); return; }
    const headers = getAuthHeaders();
    const piece = {
      title: quickAddBoardTitle.trim(),
      body: '',
      link: '',
      pillarId: quickAddBoardPillar,
      platform: '',
      contentType: quickAddBoardType,
      status,
      notes: '',
    };
    const tempId = Date.now().toString();
    setContentPieces(prev => [...prev, { ...piece, id: tempId, createdAt: new Date().toISOString() }]);
    setQuickAddBoard(null);
    setQuickAddBoardTitle('');
    setQuickAddBoardPillar('');
    setQuickAddBoardType('');
    if (headers.Authorization) {
      try {
        const res = await fetch('/api/planner/pieces', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(piece) });
        const data = await res.json();
        if (data.success && data.piece) setContentPieces(prev => prev.map(c => c.id === tempId ? data.piece : c));
      } catch { /* localStorage fallback */ }
    }
  };

  const openBoardAddModal = (status) => {
    setNewContent(prev => ({ ...prev, status, pillarId: contentFilter !== 'all' ? contentFilter : (pillars[0]?.id || '') }));
    setShowAddContent(true);
  };

  // ── Close export menu on outside click ────────────────────────
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  // ── Export helpers ──────────────────────────────────────────────
  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildRows = () => contentPieces.map(c => {
    const pillar = pillars.find(p => p.id === c.pillarId);
    return {
      Title: c.title || '',
      Pillar: pillar?.label || '',
      Status: STATUS_OPTIONS.find(s => s.id === c.status)?.label || c.status,
      Platform: c.platform || '',
      Type: c.contentType || '',
      Link: c.link || '',
      Notes: c.notes || '',
      Body: c.body || '',
      Created: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
    };
  });

  // ── Export / Import ────────────────────────────────────────────
  const handleExportJSON = () => {
    const data = JSON.stringify({ pillars, contentPieces }, null, 2);
    triggerDownload(new Blob([data], { type: 'application/json' }), 'content-planner-export.json');
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const rows = buildRows();
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    triggerDownload(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), 'content-planner-export.csv');
    setShowExportMenu(false);
  };

  const handleExportExcel = async () => {
    // write-excel-file replaces the unmaintained xlsx package.
    // It expects 2-D arrays of cell objects rather than arrays of objects.
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const objectsToSheet = (objs) => {
      if (!objs.length) return [[]];
      const headers = Object.keys(objs[0]);
      return [
        headers.map(h => ({ value: h, fontWeight: 'bold' })),
        ...objs.map(r => headers.map(h => {
          const v = r[h];
          if (typeof v === 'number') return { type: Number, value: v };
          return { type: String, value: v == null ? '' : String(v) };
        })),
      ];
    };

    const rows = buildRows();
    const pillarRows = pillars.map(p => ({
      Name: p.label,
      Color: p.color,
      Description: p.description || '',
      Topics: (p.topics || []).join(', '),
      'Content Count': contentPieces.filter(c => c.pillarId === p.id).length,
    }));

    await writeXlsxFile(
      [objectsToSheet(rows), objectsToSheet(pillarRows)],
      { fileName: 'content-planner-export.xlsx', sheets: ['Content Plan', 'Pillars'] }
    );
    setShowExportMenu(false);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Content Planner Export', 14, 18);
    doc.setFontSize(10);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, 14, 25);
    const rows = buildRows();
    const columns = ['Title', 'Pillar', 'Status', 'Platform', 'Type', 'Notes'];
    doc.autoTable({
      startY: 30,
      head: [columns],
      body: rows.map(r => columns.map(c => r[c])),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [139, 92, 246] },
    });
    doc.save('content-planner-export.pdf');
    setShowExportMenu(false);
  };

  const handleExportWord = () => {
    const rows = buildRows();
    const tableRows = rows.map(r =>
      `<tr><td>${r.Title}</td><td>${r.Pillar}</td><td>${r.Status}</td><td>${r.Platform}</td><td>${r.Type}</td><td>${r.Notes}</td></tr>`,
    ).join('');
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>Content Planner</title>
      <style>body{font-family:Calibri,sans-serif}h1{color:#8b5cf6}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#8b5cf6;color:#fff}</style></head>
      <body><h1>Content Planner Export</h1><p>Exported: ${new Date().toLocaleDateString()}</p>
      <h2>Pillars</h2><ul>${pillars.map(p => `<li><strong>${p.label}</strong> — ${p.description || 'No description'} (${contentPieces.filter(c => c.pillarId === p.id).length} pieces)</li>`).join('')}</ul>
      <h2>Content Pieces</h2>
      <table><tr><th>Title</th><th>Pillar</th><th>Status</th><th>Platform</th><th>Type</th><th>Notes</th></tr>${tableRows}</table>
      </body></html>`;
    triggerDownload(new Blob([html], { type: 'application/msword' }), 'content-planner-export.doc');
    setShowExportMenu(false);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.pillars) setPillars(data.pillars);
        if (data.contentPieces) setContentPieces(data.contentPieces);
      } catch {
        // invalid format
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ═══════════════════════════════════════════════════════════════
  //  CHARTS (extracted to PillarCharts.jsx)
  // ═══════════════════════════════════════════════════════════════
  const chartProps = { pillars, pillarStats, selectedPillar, setSelectedPillar, totalContent };

  // ═══════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════
  const isEmpty = pillars.length === 0;

  const renderPillarSidebar = () => (
    <div className="pillar-wheel-sidebar">
      <h4>Your Pillars</h4>
      <div className="pillar-list">
        {pillars.map(p => (
          <div key={p.id} className={'pillar-list-item' + (selectedPillar === p.id ? ' active' : '')}
            onClick={() => setSelectedPillar(prev => prev === p.id ? null : p.id)}>
            <span className="pillar-list-dot" style={{ background: p.color }} />
            <span className="pillar-list-label">{p.label}</span>
            <span className="pillar-list-pct">{pillarStats[p.id]?.total || 0}</span>
            <button className="pillar-list-edit" onClick={e => { e.stopPropagation(); setEditingPillar({ ...p }); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        ))}
      </div>
      {selectedPillarData && (
        <div className="pillar-detail-card" style={{ borderColor: selectedPillarData.color + '44' }}>
          <h5 style={{ color: selectedPillarData.color }}>{selectedPillarData.label}</h5>
          {selectedPillarData.description && <p className="pillar-detail-desc">{selectedPillarData.description}</p>}
          <div className="pillar-detail-status-row">
            {STATUS_OPTIONS.map(s => (
              <span key={s.id} className="pillar-detail-status-chip" style={{ color: s.color }}>
                {pillarStats[selectedPillarData.id]?.byStatus[s.id] || 0} {s.label}
              </span>
            ))}
          </div>
          {selectedPillarData.topics?.length > 0 && (
            <div className="pillar-detail-topics">
              {selectedPillarData.topics.map((t, i) => (
                <span key={i} className="pillar-topic-chip-sm" style={{ color: selectedPillarData.color, borderColor: selectedPillarData.color + '33' }}>{t}</span>
              ))}
            </div>
          )}
          <button className="admin-btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => { setShowAddContent(true); setNewContent(prev => ({ ...prev, pillarId: selectedPillarData.id })); }}>+ Add Content Here</button>
        </div>
      )}
    </div>
  );

  const renderContentSection = () => (
    <div className="pillar-content-section">
      <div className="pillar-content-section-header">
        <h3>Content Pieces</h3>
        <div className="pillar-content-section-actions">
          <select className="admin-select" value={contentFilter} onChange={e => setContentFilter(e.target.value)}>
            <option value="all">All Pillars</option>
            {pillars.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input type="text" className="pillar-input" placeholder="Search..." value={contentSearch} onChange={e => setContentSearch(e.target.value)} style={{ maxWidth: '200px' }} />
          <button className="admin-btn" onClick={() => { setShowAddContent(true); setNewContent(prev => ({ ...prev, pillarId: contentFilter !== 'all' ? contentFilter : (selectedPillar || pillars[0]?.id || '') })); }}>+ Add Content</button>
        </div>
      </div>
      {filteredContent.length === 0 ? (
        <div className="pillar-board-empty" style={{ minHeight: '80px', margin: '0.5rem 0' }}>
          {contentSearch ? 'No matching content.' : 'No content yet. Click "+ Add Content" to add posts, drafts, ideas, and links.'}
        </div>
      ) : (
        <div className="pillar-content-grid">
          {filteredContent.slice(0, 20).map(c => {
            const pillar = getPillarById(c.pillarId);
            const status = getStatusInfo(c.status);
            return (
              <div key={c.id} className="pillar-content-card" onClick={() => setEditingContent({ ...c })}>
                <div className="pillar-content-card-top">
                  <span className="pillar-board-card-dot" style={{ background: pillar?.color || '#94a3b8' }} />
                  <span className="pillar-content-card-pillar" style={{ color: pillar?.color }}>{pillar?.label || 'Unassigned'}</span>
                  <span className="pillar-content-card-status" style={{ color: status.color, background: status.color + '18' }}>{status.label}</span>
                </div>
                <div className="pillar-content-card-title">{c.title}</div>
                {c.body && <div className="pillar-content-card-body">{c.body.slice(0, 120)}{c.body.length > 120 ? '...' : ''}</div>}
                <div className="pillar-content-card-meta">
                  {c.platform && <span className="pillar-board-tag">{c.platform}</span>}
                  {c.contentType && <span className="pillar-board-tag">{c.contentType}</span>}
                  {c.link && <span className="pillar-board-tag">Link</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filteredContent.length > 20 && <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem' }}>Showing 20 of {filteredContent.length}</p>}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="pillar-graph-container">
      {/* Header */}
      <div className="pillar-graph-header">
        <div>
          <h2>Content Planner</h2>
          <p className="pillar-graph-subtitle">Create pillars, add your content, and visualize your strategy</p>
        </div>
        <div className="pillar-graph-actions">
          <label className="admin-btn-sm pillar-import-btn" title="Import">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Import
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          {!isEmpty && (
            <div className="export-dropdown-wrapper" ref={exportMenuRef}>
              <button className="admin-btn-sm" onClick={() => setShowExportMenu(prev => !prev)} title="Export">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Export
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '2px' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showExportMenu && (
                <div className="export-dropdown-menu">
                  <button onClick={handleExportExcel}><span className="export-fmt-icon">xlsx</span>Excel (.xlsx)</button>
                  <button onClick={handleExportPDF}><span className="export-fmt-icon">pdf</span>PDF (.pdf)</button>
                  <button onClick={handleExportWord}><span className="export-fmt-icon">doc</span>Word (.doc)</button>
                  <button onClick={handleExportCSV}><span className="export-fmt-icon">csv</span>CSV (.csv)</button>
                  <button onClick={handleExportJSON}><span className="export-fmt-icon">json</span>JSON (.json)</button>
                </div>
              )}
            </div>
          )}
          <button className="admin-btn" onClick={() => setShowAddPillar(true)}>+ Add Pillar</button>
          {pillars.length > 0 && (
            <button className="admin-btn" onClick={() => { setShowAddContent(true); setNewContent(prev => ({ ...prev, pillarId: selectedPillar || pillars[0]?.id || '' })); }}>+ Add Content</button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {isEmpty && !showAddPillar && (
        <div className="pillar-empty-state">
          <div className="pillar-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
          </div>
          <h3>Build Your Content Strategy</h3>
          <p>Start by creating content pillars — the core themes that define your content. Then add your own pieces to each pillar.</p>
          <div className="pillar-empty-steps">
            <div className="pillar-empty-step">
              <span className="pillar-empty-step-num">1</span>
              <div><strong>Create Pillars</strong><span>Define your content themes (e.g., &ldquo;Thought Leadership&rdquo;, &ldquo;Product Updates&rdquo;)</span></div>
            </div>
            <div className="pillar-empty-step">
              <span className="pillar-empty-step-num">2</span>
              <div><strong>Add Your Content</strong><span>Upload ideas, drafts, links, or full posts and assign them to pillars</span></div>
            </div>
            <div className="pillar-empty-step">
              <span className="pillar-empty-step-num">3</span>
              <div><strong>Visualize &amp; Plan</strong><span>Switch between 6 views to see your content mix, progress, and gaps</span></div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddPillar(true)}>Create Your First Pillar</button>
          <p className="pillar-empty-import">Or <label className="pillar-empty-import-link">import an existing plan<input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} /></label></p>
        </div>
      )}

      {/* View Switcher */}
      {!isEmpty && (
        <div className="pillar-view-bar" data-tour="pillar-view-modes">
          <div className="view-mode-toggle pillar-view-toggle">
            {VIEW_MODES.map(v => (
              <button key={v.id} className={'view-mode-btn' + (viewMode === v.id ? ' active' : '')} onClick={() => setViewMode(v.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={v.icon} /></svg>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ DONUT ═══ */}
      {!isEmpty && viewMode === 'donut' && (
        <>
          <div className="pillar-wheel-layout" data-tour="pillar-chart">
            <div className="pillar-wheel-canvas-wrap">
              <DonutChart {...chartProps} />
            </div>
            {renderPillarSidebar()}
          </div>
          {renderContentSection()}
        </>
      )}

      {/* ═══ BREAKDOWN (stacked bar + card grid) ═══ */}
      {!isEmpty && viewMode === 'breakdown' && (() => {
        const totalAll = Math.max(contentPieces.length, 1);
        return (
          <>
            {/* Stacked proportional bar */}
            <div className="pillar-stacked-bar">
              {pillars.map(p => {
                const count = pillarStats[p.id]?.total || 0;
                const pct = Math.max(Math.round((count / totalAll) * 100), count > 0 ? 3 : 1);
                return (
                  <div key={p.id} className={'pillar-stacked-segment' + (selectedPillar === p.id ? ' active' : '')}
                    style={{ flex: pct, background: p.color }}
                    onClick={() => setSelectedPillar(prev => prev === p.id ? null : p.id)}
                    title={p.label + ': ' + count + ' pieces (' + Math.round((count / totalAll) * 100) + '%)'}
                  >
                    <span>{p.label}</span>
                  </div>
                );
              })}
            </div>
            {/* Pillar cards grid */}
            <div className="pillar-cards-grid">
              {pillars.map(p => {
                const total = pillarStats[p.id]?.total || 0;
                const pct = totalAll > 0 ? Math.round((total / totalAll) * 100) : 0;
                const isActive = selectedPillar === p.id;
                return (
                  <div key={p.id} className={'pillar-card' + (isActive ? ' active' : '')}
                    onClick={() => setSelectedPillar(prev => prev === p.id ? null : p.id)}>
                    <div className="pillar-card-header">
                      <span className="pillar-card-dot" style={{ background: p.color }} />
                      <span className="pillar-card-name">{p.label}</span>
                      <button className="pillar-list-edit" onClick={e => { e.stopPropagation(); setEditingPillar({ ...p }); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    </div>
                    <div className="pillar-card-bar-wrap">
                      <div className="pillar-card-bar" style={{ width: pct + '%', background: p.color }} />
                    </div>
                    <div className="pillar-card-meta">
                      <span style={{ color: p.color, fontWeight: 700 }}>{pct}%</span>
                      <span>{total} piece{total !== 1 ? 's' : ''}</span>
                    </div>
                    {(p.topics || []).length > 0 && (
                      <div className="pillar-card-topics">
                        {p.topics.slice(0, 3).map((t, i) => (
                          <span key={i} className="pillar-topic-chip-sm" style={{ color: p.color, borderColor: p.color + '33' }}>{t}</span>
                        ))}
                        {p.topics.length > 3 && <span className="pillar-topic-more">+{p.topics.length - 3}</span>}
                      </div>
                    )}
                    {/* Status breakdown row */}
                    <div className="pillar-card-status-row">
                      {STATUS_OPTIONS.map(s => {
                        const sc = pillarStats[p.id]?.byStatus[s.id] || 0;
                        if (sc === 0) return null;
                        return <span key={s.id} className="pillar-card-status-chip" style={{ color: s.color }}>{sc} {s.label}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {renderContentSection()}
          </>
        );
      })()}

      {/* ═══ BAR (vertical bars) ═══ */}
      {!isEmpty && viewMode === 'bar' && (() => {
        const sorted = [...pillars].sort((a, b) => (pillarStats[b.id]?.total || 0) - (pillarStats[a.id]?.total || 0));
        const maxCount = Math.max(...pillars.map(p => pillarStats[p.id]?.total || 0), 1);
        const BAR_H = 240;
        const step = maxCount <= 5 ? 1 : Math.ceil(maxCount / 5);
        const topVal = Math.ceil(maxCount / step) * step;
        const yTicks = [];
        for (let v = topVal; v >= 0; v -= step) yTicks.push(v);
        return (
          <>
            <div className="pillar-bar-view">
              <div className="pillar-vbar-chart">
                <div className="pillar-vbar-grid">
                  {/* Y-axis */}
                  <div className="pillar-vbar-yaxis" style={{ height: BAR_H }}>
                    {yTicks.map((v, i) => (
                      <span key={i} className="pillar-vbar-ytick" style={{ position: 'absolute', bottom: topVal > 0 ? (v / topVal) * 100 + '%' : '0%', transform: 'translateY(50%)' }}>{v}</span>
                    ))}
                  </div>
                  {/* Bars + labels wrapper */}
                  <div className="pillar-vbar-main">
                    <div className="pillar-vbar-bars" style={{ height: BAR_H }}>
                      {sorted.map(p => {
                        const total = pillarStats[p.id]?.total || 0;
                        const barH = topVal > 0 ? (total / topVal) * BAR_H : 0;
                        const isActive = selectedPillar === p.id;
                        return (
                          <div key={p.id} className={'pillar-vbar-col' + (isActive ? ' active' : '')} onClick={() => setSelectedPillar(prev => prev === p.id ? null : p.id)}>
                            <div className="pillar-vbar-fill" style={{ height: Math.max(barH, total > 0 ? 6 : 0), background: p.color, boxShadow: isActive ? '0 0 14px ' + p.color + '55' : 'none' }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="pillar-vbar-xlabels">
                      {sorted.map(p => {
                        const total = pillarStats[p.id]?.total || 0;
                        const isActive = selectedPillar === p.id;
                        return (
                          <div key={p.id} className="pillar-vbar-xlabel" onClick={() => setSelectedPillar(prev => prev === p.id ? null : p.id)}>
                            <span className="pillar-vbar-value">{total}</span>
                            <span className="pillar-vbar-label" style={{ color: isActive ? p.color : undefined }}>{p.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {renderContentSection()}
          </>
        );
      })()}

      {/* ═══ TREE ═══ */}
      {!isEmpty && viewMode === 'tree' && (
        <>
          <div className="pillar-tree-view">
            <div className="pillar-wheel-canvas-wrap">
              <TreeChart {...chartProps} />
            </div>
            {selectedPillarData && (
              <div className="pillar-tree-detail">
                <h4 style={{ color: selectedPillarData.color }}>{selectedPillarData.label}</h4>
                {selectedPillarData.description && <p className="pillar-detail-desc">{selectedPillarData.description}</p>}
                <div className="pillar-tree-content-list">
                  {contentPieces.filter(c => c.pillarId === selectedPillarData.id).slice(0, 8).map(c => (
                    <div key={c.id} className="pillar-tree-content-item" onClick={() => setEditingContent({ ...c })}>
                      <span className="pillar-board-card-dot" style={{ background: getStatusInfo(c.status).color }} />
                      <span className="pillar-tree-content-title">{c.title}</span>
                      {c.platform && <span className="pillar-board-tag">{c.platform}</span>}
                    </div>
                  ))}
                  {contentPieces.filter(c => c.pillarId === selectedPillarData.id).length === 0 && (
                    <p className="pillar-detail-desc">No content yet in this pillar.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {renderContentSection()}
        </>
      )}

      {/* ═══ TIMELINE ═══ */}
      {!isEmpty && viewMode === 'timeline' && (
        <div className="pillar-timeline-view">
          <div className="pillar-timeline-header">
            <select className="admin-select" value={contentFilter} onChange={e => setContentFilter(e.target.value)}>
              <option value="all">All Pillars</option>
              {pillars.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button className="admin-btn" onClick={() => { setShowAddContent(true); setNewContent(prev => ({ ...prev, pillarId: contentFilter !== 'all' ? contentFilter : (pillars[0]?.id || '') })); }}>+ Add Content</button>
          </div>
          <div className="pillar-timeline-track">
            {filteredContent.length === 0 ? (
              <div className="pillar-board-empty" style={{ minHeight: '120px' }}>No content to show. Add content pieces to see them here.</div>
            ) : (
              filteredContent.map(c => {
                const pillar = getPillarById(c.pillarId);
                const status = getStatusInfo(c.status);
                return (
                  <div key={c.id} className="pillar-tl-item">
                    <div className="pillar-tl-dot" style={{ background: pillar?.color || '#94a3b8' }} />
                    <div className="pillar-tl-card" onClick={() => setEditingContent({ ...c })}>
                      <div className="pillar-tl-card-header">
                        <span className="pillar-tl-pillar" style={{ color: pillar?.color }}>{pillar?.label || 'Unassigned'}</span>
                        <span className="pillar-tl-status" style={{ color: status.color }}>{status.label}</span>
                      </div>
                      <div className="pillar-tl-title">{c.title}</div>
                      {c.body && <div className="pillar-tl-body">{c.body.slice(0, 100)}{c.body.length > 100 ? '...' : ''}</div>}
                      <div className="pillar-tl-meta">
                        {c.platform && <span className="pillar-board-tag">{c.platform}</span>}
                        {c.contentType && <span className="pillar-board-tag">{c.contentType}</span>}
                        <span className="pillar-tl-date">{new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ═══ RADAR ═══ */}
      {!isEmpty && viewMode === 'radar' && (
        <>
          <div className="pillar-radar-view">
            <div className="pillar-wheel-canvas-wrap">
              <RadarChart {...chartProps} />
            </div>
            <div className="pillar-bar-legend" style={{ justifyContent: 'center' }}>
              {STATUS_OPTIONS.map(s => (
                <span key={s.id} className="pillar-bar-legend-item"><span className="pillar-bar-legend-dot" style={{ background: s.color }} />{s.label}</span>
              ))}
            </div>
          </div>
          {renderContentSection()}
        </>
      )}

      {/* ═══ BOARD (KANBAN) ═══ */}
      {viewMode === 'board' && (
        <div className="pillar-board-view">
          <div className="pillar-board-filters">
            <select className="admin-select" value={contentFilter} onChange={e => setContentFilter(e.target.value)}>
              <option value="all">All Pillars</option>
              {pillars.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input type="text" className="pillar-input" placeholder="Search content..." value={contentSearch} onChange={e => setContentSearch(e.target.value)} style={{ maxWidth: '220px' }} />
            <button className="admin-btn" onClick={() => { setShowAddContent(true); setNewContent(prev => ({ ...prev, pillarId: contentFilter !== 'all' ? contentFilter : (pillars[0]?.id || '') })); }}>+ Add Content</button>
          </div>
          <div className="pillar-board-columns">
            {STATUS_OPTIONS.map(col => {
              const colItems = filteredContent.filter(c => c.status === col.id);
              const isQuickAdd = quickAddBoard === col.id;
              return (
                <div key={col.id} className={`pillar-board-column${dragItem ? ' drop-target' : ''}`}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                  onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                  onDrop={e => { e.currentTarget.classList.remove('drag-over'); if (dragItem) { handleContentStatusChange(dragItem, col.id); setDragItem(null); } }}>
                  <div className="pillar-board-col-header">
                    <span className="pillar-board-col-dot" style={{ background: col.color }} />
                    <span>{col.label}</span>
                    <span className="pillar-board-col-count">{colItems.length}</span>
                    <button
                      className="pillar-board-col-add"
                      title={`Add to ${col.label}`}
                      onClick={() => {
                        if (isQuickAdd) { setQuickAddBoard(null); }
                        else { setQuickAddBoard(col.id); setQuickAddBoardTitle(''); setQuickAddBoardPillar(contentFilter !== 'all' ? contentFilter : ''); setQuickAddBoardType(''); }
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>
                  <div className="pillar-board-col-body">
                    {/* Inline quick-add form */}
                    {isQuickAdd && (
                      <div className="pillar-board-quick-add" onClick={e => e.stopPropagation()}>
                        <input
                          ref={quickAddBoardRef}
                          type="text"
                          className="pillar-board-quick-input"
                          value={quickAddBoardTitle}
                          onChange={e => setQuickAddBoardTitle(e.target.value)}
                          placeholder="Content title..."
                          onKeyDown={e => {
                            if (e.key === 'Enter' && quickAddBoardTitle.trim()) { e.preventDefault(); handleQuickAddBoard(col.id); }
                            if (e.key === 'Escape') setQuickAddBoard(null);
                          }}
                        />
                        <div className="pillar-board-quick-selects">
                          <select
                            value={quickAddBoardPillar}
                            onChange={e => setQuickAddBoardPillar(e.target.value)}
                            className="pillar-board-quick-select"
                          >
                            <option value="">No pillar</option>
                            {pillars.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                          <select
                            value={quickAddBoardType}
                            onChange={e => setQuickAddBoardType(e.target.value)}
                            className="pillar-board-quick-select"
                          >
                            <option value="">Type</option>
                            {CONTENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="pillar-board-quick-actions">
                          <button className="pillar-board-quick-btn confirm" onClick={() => handleQuickAddBoard(col.id)} disabled={!quickAddBoardTitle.trim()}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                          <button className="pillar-board-quick-btn cancel" onClick={() => setQuickAddBoard(null)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                          <button className="pillar-board-quick-btn expand" title="Open full form" onClick={() => { openBoardAddModal(col.id); setQuickAddBoard(null); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {colItems.map(item => {
                      const pillar = getPillarById(item.pillarId);
                      return (
                        <div key={item.id} className={`pillar-board-card${dragItem === item.id ? ' dragging' : ''}`} draggable
                          onDragStart={() => setDragItem(item.id)} onDragEnd={() => setDragItem(null)}>
                          <div className="pillar-board-card-pillar" style={{ color: pillar?.color || '#94a3b8' }}>
                            <span className="pillar-board-card-dot" style={{ background: pillar?.color || '#94a3b8' }} />
                            {pillar?.label || 'Unassigned'}
                          </div>
                          <div className="pillar-board-card-title">{item.title}</div>
                          {item.body && <div className="pillar-board-card-notes">{item.body.slice(0, 80)}{item.body.length > 80 ? '...' : ''}</div>}
                          <div className="pillar-board-card-tags">
                            {item.platform && <span className="pillar-board-tag">{item.platform}</span>}
                            {item.contentType && <span className="pillar-board-tag">{item.contentType}</span>}
                            {item.link && <span className="pillar-board-tag">Link</span>}
                          </div>
                          <div className="pillar-board-card-actions">
                            <button className="admin-btn-sm" onClick={() => setEditingContent({ ...item })}>Edit</button>
                            <button className="admin-btn-sm danger" onClick={() => setConfirmDelete({ type: 'content', id: item.id })}>Del</button>
                          </div>
                        </div>
                      );
                    })}
                    {colItems.length === 0 && !isQuickAdd && (
                      <div className="pillar-board-empty" onClick={() => { setQuickAddBoard(col.id); setQuickAddBoardTitle(''); setQuickAddBoardPillar(contentFilter !== 'all' ? contentFilter : ''); setQuickAddBoardType(''); }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.4 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Click to add or drag here</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══════════════════════════════════════════ */}

      {/* Add Pillar */}
      {showAddPillar && (
        <div className="pillar-modal-overlay" onClick={() => setShowAddPillar(false)}>
          <div className="pillar-modal" onClick={e => e.stopPropagation()}>
            <div className="pillar-modal-header"><h4>Create Content Pillar</h4><button className="pillar-modal-close" onClick={() => setShowAddPillar(false)}>&times;</button></div>
            <div className="pillar-modal-body">
              <label>Pillar Name *</label>
              <input type="text" value={newPillar.label} onChange={e => setNewPillar(p => ({ ...p, label: e.target.value }))} placeholder='e.g., Thought Leadership, Product Updates' className="pillar-input" autoFocus />
              <label>Description</label>
              <textarea value={newPillar.description} onChange={e => setNewPillar(p => ({ ...p, description: e.target.value }))} placeholder="What kind of content goes here?" className="pillar-input" rows={2} />
              <label>Color</label>
              <div className="pillar-color-row">
                {PRESET_COLORS.map(c => (
                  <button key={c} className={'pillar-color-swatch' + (newPillar.color === c ? ' active' : '')} style={{ background: c }} onClick={() => setNewPillar(p => ({ ...p, color: c }))} />
                ))}
              </div>
              <label>Topics / Tags</label>
              <div className="pillar-topics-list">
                {(newPillar.topics || []).map((t, i) => (
                  <span key={i} className="pillar-topic-chip" style={{ borderColor: newPillar.color + '44', color: newPillar.color }}>
                    {t}<button className="pillar-topic-remove" onClick={() => setNewPillar(p => ({ ...p, topics: p.topics.filter((_, idx) => idx !== i) }))}>&times;</button>
                  </span>
                ))}
              </div>
              <div className="pillar-topic-add-row">
                <input type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="Add a topic, press Enter..." className="pillar-input"
                  onKeyDown={e => { if (e.key === 'Enter' && newTopic.trim()) { e.preventDefault(); setNewPillar(p => ({ ...p, topics: [...(p.topics || []), newTopic.trim()] })); setNewTopic(''); } }} />
                <button className="admin-btn-sm" onClick={() => { if (newTopic.trim()) { setNewPillar(p => ({ ...p, topics: [...(p.topics || []), newTopic.trim()] })); setNewTopic(''); } }}>Add</button>
              </div>
            </div>
            <div className="pillar-modal-footer">
              <button className="admin-btn" onClick={handleAddPillar} disabled={!newPillar.label.trim()}>Create Pillar</button>
              <button className="admin-btn secondary" onClick={() => setShowAddPillar(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Pillar */}
      {editingPillar && (
        <div className="pillar-modal-overlay" onClick={() => setEditingPillar(null)}>
          <div className="pillar-modal" onClick={e => e.stopPropagation()}>
            <div className="pillar-modal-header"><h4>Edit Pillar</h4><button className="pillar-modal-close" onClick={() => setEditingPillar(null)}>&times;</button></div>
            <div className="pillar-modal-body">
              <label>Pillar Name</label>
              <input type="text" value={editingPillar.label} onChange={e => setEditingPillar(p => ({ ...p, label: e.target.value }))} className="pillar-input" />
              <label>Description</label>
              <textarea value={editingPillar.description || ''} onChange={e => setEditingPillar(p => ({ ...p, description: e.target.value }))} className="pillar-input" rows={2} />
              <label>Color</label>
              <div className="pillar-color-row">
                {PRESET_COLORS.map(c => (
                  <button key={c} className={'pillar-color-swatch' + (editingPillar.color === c ? ' active' : '')} style={{ background: c }} onClick={() => setEditingPillar(p => ({ ...p, color: c }))} />
                ))}
              </div>
              <label>Topics</label>
              <div className="pillar-topics-list">
                {(editingPillar.topics || []).map((t, i) => (
                  <span key={i} className="pillar-topic-chip" style={{ borderColor: editingPillar.color + '44', color: editingPillar.color }}>
                    {t}<button className="pillar-topic-remove" onClick={() => setEditingPillar(p => ({ ...p, topics: p.topics.filter((_, idx) => idx !== i) }))}>&times;</button>
                  </span>
                ))}
              </div>
              <div className="pillar-topic-add-row">
                <input type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="Add a topic..." className="pillar-input"
                  onKeyDown={e => { if (e.key === 'Enter' && newTopic.trim()) { e.preventDefault(); setEditingPillar(p => ({ ...p, topics: [...(p.topics || []), newTopic.trim()] })); setNewTopic(''); } }} />
                <button className="admin-btn-sm" onClick={() => { if (newTopic.trim()) { setEditingPillar(p => ({ ...p, topics: [...(p.topics || []), newTopic.trim()] })); setNewTopic(''); } }}>Add</button>
              </div>
            </div>
            <div className="pillar-modal-footer">
              <button className="admin-btn" onClick={handleUpdatePillar}>Save Changes</button>
              <button className="admin-btn secondary danger" onClick={() => setConfirmDelete({ type: 'pillar', id: editingPillar.id })}>Delete Pillar</button>
              <button className="admin-btn secondary" onClick={() => setEditingPillar(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Content */}
      {showAddContent && (
        <div className="pillar-modal-overlay" onClick={() => setShowAddContent(false)}>
          <div className="pillar-modal pillar-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="pillar-modal-header"><h4>Add Content Piece</h4><button className="pillar-modal-close" onClick={() => setShowAddContent(false)}>&times;</button></div>
            <div className="pillar-modal-body">
              <label>Title *</label>
              <input type="text" value={newContent.title} onChange={e => setNewContent(p => ({ ...p, title: e.target.value }))} placeholder="What's this content about?" className="pillar-input" autoFocus />
              <label>Content / Body</label>
              <textarea value={newContent.body} onChange={e => setNewContent(p => ({ ...p, body: e.target.value }))} placeholder="Paste your draft, outline, or idea..." className="pillar-input" rows={5} />
              <label>Link (optional)</label>
              <input type="text" value={newContent.link} onChange={e => setNewContent(p => ({ ...p, link: e.target.value }))} placeholder="URL to doc, sheet, post, video..." className="pillar-input" />
              <div className="pillar-modal-row">
                <div className="pillar-modal-field">
                  <label>Pillar</label>
                  <select value={newContent.pillarId} onChange={e => setNewContent(p => ({ ...p, pillarId: e.target.value }))} className="pillar-input">
                    <option value="">No pillar</option>
                    {pillars.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="pillar-modal-field">
                  <label>Status</label>
                  <select value={newContent.status} onChange={e => setNewContent(p => ({ ...p, status: e.target.value }))} className="pillar-input">
                    {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="pillar-modal-row">
                <div className="pillar-modal-field">
                  <label>Platform</label>
                  <select value={newContent.platform} onChange={e => setNewContent(p => ({ ...p, platform: e.target.value }))} className="pillar-input">
                    <option value="">Any / Not decided</option>
                    {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="pillar-modal-field">
                  <label>Content Type</label>
                  <select value={newContent.contentType} onChange={e => setNewContent(p => ({ ...p, contentType: e.target.value }))} className="pillar-input">
                    <option value="">Any / Not decided</option>
                    {CONTENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label>Notes</label>
              <textarea value={newContent.notes} onChange={e => setNewContent(p => ({ ...p, notes: e.target.value }))} placeholder="Angle, CTA, references..." className="pillar-input" rows={2} />
            </div>
            <div className="pillar-modal-footer">
              <button className="admin-btn" onClick={handleAddContent} disabled={!newContent.title.trim()}>Add Content</button>
              <button className="admin-btn secondary" onClick={() => setShowAddContent(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Content */}
      {editingContent && (
        <div className="pillar-modal-overlay" onClick={() => setEditingContent(null)}>
          <div className="pillar-modal pillar-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="pillar-modal-header"><h4>Edit Content</h4><button className="pillar-modal-close" onClick={() => setEditingContent(null)}>&times;</button></div>
            <div className="pillar-modal-body">
              <label>Title</label>
              <input type="text" value={editingContent.title} onChange={e => setEditingContent(p => ({ ...p, title: e.target.value }))} className="pillar-input" />
              <label>Content / Body</label>
              <textarea value={editingContent.body || ''} onChange={e => setEditingContent(p => ({ ...p, body: e.target.value }))} className="pillar-input" rows={5} />
              <label>Link</label>
              <input type="text" value={editingContent.link || ''} onChange={e => setEditingContent(p => ({ ...p, link: e.target.value }))} className="pillar-input" />
              <div className="pillar-modal-row">
                <div className="pillar-modal-field">
                  <label>Pillar</label>
                  <select value={editingContent.pillarId} onChange={e => setEditingContent(p => ({ ...p, pillarId: e.target.value }))} className="pillar-input">
                    <option value="">Unassigned</option>
                    {pillars.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="pillar-modal-field">
                  <label>Status</label>
                  <select value={editingContent.status} onChange={e => setEditingContent(p => ({ ...p, status: e.target.value }))} className="pillar-input">
                    {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="pillar-modal-row">
                <div className="pillar-modal-field">
                  <label>Platform</label>
                  <select value={editingContent.platform || ''} onChange={e => setEditingContent(p => ({ ...p, platform: e.target.value }))} className="pillar-input">
                    <option value="">Any</option>
                    {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="pillar-modal-field">
                  <label>Content Type</label>
                  <select value={editingContent.contentType || ''} onChange={e => setEditingContent(p => ({ ...p, contentType: e.target.value }))} className="pillar-input">
                    <option value="">Any</option>
                    {CONTENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label>Notes</label>
              <textarea value={editingContent.notes || ''} onChange={e => setEditingContent(p => ({ ...p, notes: e.target.value }))} className="pillar-input" rows={2} />
            </div>
            <div className="pillar-modal-footer">
              <button className="admin-btn" onClick={handleUpdateContent}>Save Changes</button>
              <button className="admin-btn secondary" onClick={() => setSchedulingContent(editingContent)}>Schedule Post</button>
              <button className="admin-btn secondary danger" onClick={() => { handleDeleteContent(editingContent.id); setEditingContent(null); }}>Delete</button>
              <button className="admin-btn secondary" onClick={() => setEditingContent(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Post Modal */}
      {schedulingContent && (() => {
        const t = (schedulingContent.contentType || '').toLowerCase();
        const contentType =
          ['article', 'guide', 'case study', 'blog'].includes(t) ? 'blog' :
          ['newsletter'].includes(t) ? 'newsletter' :
          ['video', 'reel'].includes(t) ? 'video' :
          'social';
        // Long-form content preserves markdown; social strips it for clean post text.
        const isLongForm = contentType !== 'social';
        const raw = [schedulingContent.title, schedulingContent.body].filter(Boolean).join('\n\n');
        return (
          <SchedulePostModal
            onClose={() => setSchedulingContent(null)}
            onCreated={() => setSchedulingContent(null)}
            initialText={isLongForm ? raw : stripMarkdown(raw)}
            contentType={contentType}
          />
        );
      })()}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="pillar-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="pillar-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px' }}>
            <div className="pillar-modal-header"><h4>Confirm Delete</h4><button className="pillar-modal-close" onClick={() => setConfirmDelete(null)}>&times;</button></div>
            <div className="pillar-modal-body">
              <p style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                {confirmDelete.type === 'pillar'
                  ? 'Delete this pillar? Content assigned to it will become unassigned.'
                  : 'Delete this content piece?'}
              </p>
            </div>
            <div className="pillar-modal-footer">
              <button className="admin-btn danger" onClick={() => {
                if (confirmDelete.type === 'pillar') handleDeletePillar(confirmDelete.id);
                else handleDeleteContent(confirmDelete.id);
              }}>Delete</button>
              <button className="admin-btn secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
