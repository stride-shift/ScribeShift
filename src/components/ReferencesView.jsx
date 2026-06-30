import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthProvider';

const PURPOSES = [
  { key: 'tone', label: 'Tone' },
  { key: 'look', label: 'Look & feel' },
  { key: 'imagery', label: 'Imagery' },
];

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown';

// Personal reference library: images / docs / PDFs the AI looks at when
// generating. Each reference is tagged with what to take from it.
export default function ReferencesView() {
  const { getAuthHeaders } = useAuth();
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPurposes, setUploadPurposes] = useState(['tone', 'look', 'imagery']);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/references', { headers: getAuthHeaders() });
      // A non-JSON body means the request hit the SPA fallback — the
      // /api/references route isn't loaded yet (restart the API server).
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error('References API not loaded yet — restart your API server (node server/index.js), then refresh.');
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load references');
      setRefs(data.references || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  const toggleUploadPurpose = (k) =>
    setUploadPurposes((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true); setError('');
    try {
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) { setError(`${file.name} is over 15MB`); continue; }
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
        });
        const res = await fetch('/api/references', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: dataUrl.split(',')[1], mimeType: file.type, filename: file.name, purposes: uploadPurposes }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        setRefs((prev) => [data.reference, ...prev]);
      }
    } catch (e) { setError(e.message); } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const togglePurpose = async (ref, k) => {
    const next = ref.purposes?.includes(k) ? ref.purposes.filter((x) => x !== k) : [...(ref.purposes || []), k];
    setRefs((prev) => prev.map((r) => r.id === ref.id ? { ...r, purposes: next } : r));
    try {
      await fetch(`/api/references/${ref.id}`, {
        method: 'PATCH', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ purposes: next }),
      });
    } catch { /* optimistic; reload not needed */ }
  };

  const remove = async (id) => {
    setRefs((prev) => prev.filter((r) => r.id !== id));
    try { await fetch(`/api/references/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); } catch { /* */ }
  };

  return (
    <>
      <div className="section-header">
        <h1 className="section-title">References</h1>
        <p className="section-desc">Upload images, docs, and PDFs for the AI to reference when generating — tag each with what it should take from it.</p>
      </div>

      <div className="card" style={{ marginTop: '1rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : '+ Add references'}
          </button>
          <span className="card-subtitle" style={{ margin: 0 }}>Images · PDF · text · markdown · max 15MB</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <span className="card-subtitle" style={{ margin: 0 }}>Use for:</span>
            {PURPOSES.map((p) => (
              <button key={p.key} type="button" onClick={() => toggleUploadPurpose(p.key)}
                className="btn btn-sm"
                style={{ borderColor: uploadPurposes.includes(p.key) ? 'var(--primary,#3b82f6)' : undefined, color: uploadPurposes.includes(p.key) ? 'var(--primary,#3b82f6)' : undefined }}>
                {uploadPurposes.includes(p.key) ? '✓ ' : ''}{p.label}
              </button>
            ))}
          </span>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={handleFiles} style={{ display: 'none' }} />
        </div>
        {error && <div className="error-msg" style={{ marginTop: '0.6rem' }}>{error}</div>}
      </div>

      {loading ? (
        <div className="card" style={{ marginTop: '1rem' }}><div className="loading-spinner" style={{ margin: '2rem auto' }} /></div>
      ) : refs.length === 0 ? (
        <div className="card" style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
          No references yet. Add brand images, example posts, or a style PDF — then tick them on the Create page.
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.85rem' }}>
          {refs.map((r) => (
            <div key={r.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 120, background: 'var(--surface-2, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {r.kind === 'image' ? (
                  <img src={r.storage_url} alt={r.filename || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted,#94a3b8)" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                )}
                <button onClick={() => remove(r.id)} title="Remove"
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ padding: '0.5rem 0.6rem' }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.filename || ''}>{r.filename || (r.kind === 'image' ? 'Image' : 'Document')}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {PURPOSES.map((p) => {
                    const on = r.purposes?.includes(p.key);
                    return (
                      <button key={p.key} type="button" onClick={() => togglePurpose(r, p.key)}
                        style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--primary,#3b82f6)' : 'var(--border)'}`,
                          background: on ? 'var(--primary,#3b82f6)' : 'transparent', color: on ? '#fff' : 'var(--text-secondary)' }}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
