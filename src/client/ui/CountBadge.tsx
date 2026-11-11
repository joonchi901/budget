import type { HTMLAttributes } from 'react';

export type CountBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  count: number;
  /** Larger counts show as `max+`. */
  max?: number;
  /** Full meaning for screen readers, such as "새 내역 3건"; a bare number is ambiguous. */
  label: string;
};

/** Small count such as unseen records on a room. Renders nothing for zero. */
export function CountBadge({ count, max = 99, label, className = '', ...props }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span {...props} className={`ui-count-badge ${className}`.trim()}>
      <span aria-hidden="true">{count > max ? `${max}+` : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
