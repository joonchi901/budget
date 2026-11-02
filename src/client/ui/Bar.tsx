import type { CSSProperties, HTMLAttributes } from 'react';
import { isHexColor } from './Tag';

export type BarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  value: number;
  max: number;
  /** A tag option's saved color (`#RRGGBB`; anything else falls back to the brand coral). */
  color?: string;
};

/** Decorative horizontal bar. Always show the value as text next to it (StatBar does). */
export function Bar({ value, max, color, className = '', style, ...props }: BarProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <span
      {...props}
      aria-hidden="true"
      className={`ui-bar ${className}`.trim()}
      style={
        {
          '--ui-bar-ratio': ratio,
          '--ui-bar-color': isHexColor(color) ? color : undefined,
          ...style,
        } as CSSProperties
      }
    >
      <span className="ui-bar-fill" />
    </span>
  );
}
