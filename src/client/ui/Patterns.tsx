import { createElement, type ComponentPropsWithRef, type HTMLAttributes } from 'react';
import { Grid, type Columns, type Space } from './Layout';
type DivProps = ComponentPropsWithRef<'div'>;
export function FormBody({ className = '', ...props }: DivProps) {
  return <div {...props} className={`form-body ui-form-body ${className}`.trim()} />;
}
export function FormFooter({ className = '', ...props }: DivProps) {
  return <div {...props} className={`form-footer ui-form-footer ${className}`.trim()} />;
}
export function FormGrid({ className = '', ...props }: DivProps) {
  return <div {...props} className={`form-grid ui-form-grid ${className}`.trim()} />;
}
export function FormSection({ className = '', ...props }: ComponentPropsWithRef<'section'>) {
  return <section {...props} className={`form-section ${className}`.trim()} />;
}
export type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'div' | 'article' | 'details' | 'aside';
  open?: boolean;
};
export function Panel({ as = 'section', className = '', ...props }: PanelProps) {
  return createElement(as, { ...props, className: `panel ui-panel ${className}`.trim() });
}
export function SummaryGrid({
  columns = 4,
  className = '',
  gap = 4,
  ...props
}: HTMLAttributes<HTMLElement> & { columns?: Columns; gap?: Space }) {
  return (
    <Grid
      {...props}
      as="section"
      columns={columns}
      tabletColumns={2}
      mobileColumns={2}
      gap={gap}
      className={`stats-grid ui-summary-grid ${columns === 3 ? 'three' : ''} ${className}`.trim()}
    />
  );
}
export function Toolbar({ className = '', ...props }: DivProps) {
  return <div {...props} className={`section-heading ui-toolbar ${className}`.trim()} />;
}
/** Gives wide tables a named keyboard-scrollable region without forcing page overflow. */
export function TableScroll({ className = '', ...props }: DivProps & { 'aria-label': string }) {
  return (
    <div
      role="region"
      tabIndex={0}
      {...props}
      className={`table-scroll ui-scroll-region ${className}`.trim()}
    />
  );
}
