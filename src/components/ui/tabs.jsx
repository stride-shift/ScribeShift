export function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div
      className={`inline-flex items-center gap-1 p-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-md ${className}`}
    >
      {items.map((item) => {
        const id = typeof item === 'string' ? item : item.value;
        const label = typeof item === 'string' ? item : item.label;
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`px-3 py-1.5 text-[13px] font-medium rounded transition-colors ${
              active
                ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
