import type { ReactNode } from 'react';
import { Amount } from './Amount';
import { Bar } from './Bar';

const percent = new Intl.NumberFormat('ko-KR', { style: 'percent', maximumFractionDigits: 1 });

/** One stats line: label with its share and the amount, then a full-width bar. */
export function StatBar({
  label,
  value,
  total,
  max = total,
  color,
  className = '',
}: {
  label: ReactNode;
  value: number;
  /** The share is value / total. */
  total: number;
  /** Bar length is value / max; pass the largest item so the top item fills the bar. */
  max?: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`ui-stat-bar ${className}`.trim()}>
      <span className="ui-stat-bar-label">
        {label}{' '}
        <span className="ui-stat-bar-percent">{percent.format(total > 0 ? value / total : 0)}</span>
      </span>
      <Amount value={value} size="sm" />
      <Bar value={value} max={max} color={color} />
    </div>
  );
}
