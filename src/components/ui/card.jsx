export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }) {
  return (
    <div className={`px-5 pt-5 pb-3 flex items-start justify-between gap-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...props }) {
  return (
    <h3 className={`text-[15px] font-semibold text-[var(--text)] ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ className = '', children, ...props }) {
  return (
    <p className={`text-xs text-[var(--text-secondary)] mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className = '', children, ...props }) {
  return (
    <div className={`px-5 pb-5 ${className}`} {...props}>
      {children}
    </div>
  );
}
