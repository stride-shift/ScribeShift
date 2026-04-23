// Tone determines the icon tile color. Keys map to soft colored backgrounds.
const TONES = {
  blue:   { bg: 'rgba(59, 130, 246, 0.12)',  fg: '#3b82f6' },
  green:  { bg: 'rgba(22, 162, 73, 0.12)',   fg: '#16a249' },
  amber:  { bg: 'rgba(245, 159, 10, 0.14)',  fg: '#f59f0a' },
  red:    { bg: 'rgba(239, 68, 68, 0.12)',   fg: '#ef4444' },
  purple: { bg: 'rgba(139, 92, 246, 0.12)',  fg: '#8b5cf6' },
  pink:   { bg: 'rgba(236, 72, 153, 0.12)',  fg: '#ec4899' },
  slate:  { bg: 'rgba(100, 116, 139, 0.12)', fg: '#64748b' },
  cyan:   { bg: 'rgba(6, 182, 212, 0.12)',   fg: '#06b6d4' },
};

// trend prop can be: { value: '+25%', dir: 'up' | 'down' | 'flat' }
export function StatCard({ icon, label, value, subtext, tone = 'blue', trend, onClick, ariaLabel }) {
  const { bg, fg } = TONES[tone] || TONES.blue;
  const trendColor =
    trend?.dir === 'down' ? 'var(--danger)' :
    trend?.dir === 'flat' ? 'var(--text-secondary)' : 'var(--success)';

  const isInteractive = typeof onClick === 'function';
  const Tag = isInteractive ? 'button' : 'div';
  const interactiveClasses = isInteractive
    ? 'cursor-pointer text-left w-full hover:border-[var(--primary)]/40 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-body)] transition-all'
    : '';

  return (
    <Tag
      type={isInteractive ? 'button' : undefined}
      onClick={onClick}
      aria-label={ariaLabel || (isInteractive ? `${label}: ${value}` : undefined)}
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-sm p-4 min-w-0 ${interactiveClasses}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
          style={{ backgroundColor: bg, color: fg }}
        >
          {icon}
        </div>
        {trend && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: trendColor, background: trendColor + '15' }}
          >
            {trend.dir === 'down' ? '↓' : trend.dir === 'flat' ? '→' : '↑'}
            {trend.value}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--text-secondary)] font-medium mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-bold text-[var(--text)] leading-tight">
        {value}
      </div>
      {subtext && (
        <div className="text-[11px] text-[var(--text-secondary)] mt-1">{subtext}</div>
      )}
    </Tag>
  );
}
