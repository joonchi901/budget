import { createElement, type CSSProperties, type HTMLAttributes } from 'react';

export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
export type Columns = 1 | 2 | 3 | 4;
type LayoutTag = 'div' | 'section' | 'article' | 'aside' | 'header' | 'nav' | 'ul' | 'ol';
type NativeLayoutProps = HTMLAttributes<HTMLElement> & { as?: LayoutTag };
type LayoutStyle = CSSProperties & Record<`--ui-${string}`, string | number>;
const space = (value: Space) => (value === 0 ? '0px' : `var(--brand-space-${value})`);

export type StackProps = NativeLayoutProps & {
  gap?: Space;
};

/** Vertical composition; children may shrink and wrap instead of widening the page. */
export function Stack({ as = 'div', gap = 4, className = '', style, ...props }: StackProps) {
  return createElement(as, {
    ...props,
    className: `ui-stack ${className}`.trim(),
    style: { '--ui-gap': space(gap), ...style } as LayoutStyle,
  });
}

export type InlineProps = StackProps & {
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
};

/** Wrapping rows of actions, labels or metadata. Avoid nowrap for arbitrary user text. */
export function Inline({
  as = 'div',
  gap = 2,
  align = 'center',
  justify = 'start',
  wrap = true,
  className = '',
  style,
  ...props
}: InlineProps) {
  return createElement(as, {
    ...props,
    className: `ui-inline ${className}`.trim(),
    style: {
      '--ui-gap': space(gap),
      '--ui-align': align === 'start' || align === 'end' ? `flex-${align}` : align,
      '--ui-justify':
        justify === 'between'
          ? 'space-between'
          : justify === 'start' || justify === 'end'
            ? `flex-${justify}`
            : justify,
      '--ui-wrap': wrap ? 'wrap' : 'nowrap',
      ...style,
    } as LayoutStyle,
  });
}

export type GridProps = StackProps & {
  columns?: Columns;
  /** Columns at 761–1000 px; defaults to the desktop count. */
  tabletColumns?: Columns;
  /** Columns at 760 px and below; defaults to a readable single column. */
  mobileColumns?: Columns;
};

/** Equal, shrinkable columns. Data tables and seven-day calendars keep their own layouts. */
export function Grid({
  as = 'div',
  columns = 2,
  tabletColumns = columns,
  mobileColumns = 1,
  gap = 4,
  className = '',
  style,
  ...props
}: GridProps) {
  return createElement(as, {
    ...props,
    className: `ui-grid ${className}`.trim(),
    style: {
      '--ui-gap': space(gap),
      '--ui-grid-columns': columns,
      '--ui-grid-tablet-columns': tabletColumns,
      '--ui-grid-mobile-columns': mobileColumns,
      ...style,
    } as LayoutStyle,
  });
}

export type SurfaceProps = NativeLayoutProps & {
  padding?: Space;
  tone?: 'default' | 'subtle';
  raised?: boolean;
};

/** A content boundary with shared spacing, corners and optional elevation. */
export function Surface({
  as = 'section',
  padding = 6,
  tone = 'default',
  raised = false,
  className = '',
  style,
  ...props
}: SurfaceProps) {
  return createElement(as, {
    ...props,
    className: `ui-surface ${className}`.trim(),
    'data-tone': tone,
    'data-raised': raised || undefined,
    style: { '--ui-padding': space(padding), ...style } as LayoutStyle,
  });
}
