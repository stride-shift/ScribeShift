import { useState, useRef, useEffect } from 'react';

/**
 * StyledSelect — an app-themed dropdown that replaces native <select> so the
 * options popover matches the app (the OS-rendered <select> popup can't be
 * styled). Near drop-in:
 *
 *   <StyledSelect value={v} onChange={setV} options={[{ value, label }]} />
 *
 * - onChange is called with the selected VALUE (not an event).
 * - options: [{ value, label }]. `placeholder` shows when nothing matches.
 * - className/style apply to the trigger button (e.g. width).
 */
export default function StyledSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  className = '',
  style,
  disabled = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));
  const display = selected ? selected.label : placeholder;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...(style?.width ? { width: style.width } : {}) }}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`ss-select-trigger ${className}`}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-input, var(--bg-card))', color: selected ? 'var(--text)' : 'var(--text-secondary)',
          fontSize: 13, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
          opacity: disabled ? 0.6 : 1, ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ flexShrink: 0, color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="ss-select-menu"
          style={{
            position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 200, minWidth: '100%',
            maxHeight: 280, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-card)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 4,
            animation: 'ss-view-in .14s ease both',
          }}
        >
          {options.map((o) => {
            const isSel = String(o.value) === String(value);
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                  fontFamily: 'inherit',
                  background: isSel ? 'var(--primary-glow, rgba(59,130,246,0.12))' : 'transparent',
                  color: isSel ? 'var(--primary, #3b82f6)' : 'var(--text)',
                  fontWeight: isSel ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'var(--bg-input, rgba(148,163,184,0.12))'; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
