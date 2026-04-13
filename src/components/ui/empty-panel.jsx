export function EmptyPanel({ icon, title, description, action }) {
  return (
    <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-lg p-5 text-center">
      {icon && (
        <div className="mx-auto mb-2 w-9 h-9 rounded-full bg-[var(--bg-input)] text-[var(--text-secondary)] flex items-center justify-center">
          {icon}
        </div>
      )}
      {title && <div className="text-[13px] font-semibold text-[var(--text)]">{title}</div>}
      {description && (
        <div className="text-[11px] text-[var(--text-secondary)] mt-1">{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// A side-rail panel with a title and a stack of items.
export function RailPanel({ title, action, children, className = '' }) {
  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-[var(--text)]">{title}</h4>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
