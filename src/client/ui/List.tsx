import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Button } from './Button';

/** Grouped list surface. role="list" keeps list semantics after list-style is removed. */
export function List({ className = '', ...props }: ComponentPropsWithRef<'ul'>) {
  return <ul {...props} role="list" className={`ui-list ${className}`.trim()} />;
}

export type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  /** Secondary line, such as the latest record or tag names. */
  description?: ReactNode;
  /** Right-aligned values stacked vertically, such as an amount, a time or a CountBadge. */
  trailing?: ReactNode;
  /** Makes the whole row one button. */
  onClick?(): void;
  /** Controls under the row, outside its button, such as reactions. */
  footer?: ReactNode;
  current?: boolean;
  className?: string;
};

/** One list item: leading visual, title with an optional second line, trailing values. */
export function ListRow({
  leading,
  title,
  description,
  trailing,
  onClick,
  current,
  footer,
  className = '',
}: ListRowProps) {
  const content = (
    <>
      {leading && <span className="ui-list-row-leading">{leading}</span>}
      <span className="ui-list-row-main">
        <span className="ui-list-row-title">{title}</span>
        {description && <span className="ui-list-row-description">{description}</span>}
      </span>
      {trailing && <span className="ui-list-row-trailing">{trailing}</span>}
    </>
  );
  return (
    <li className={`ui-list-item ${className}`.trim()}>
      {onClick ? (
        <Button
          variant="plain"
          className="ui-list-row"
          aria-current={current || undefined}
          onClick={onClick}
        >
          {content}
        </Button>
      ) : (
        <div className="ui-list-row">{content}</div>
      )}
      {footer && <div className="ui-list-row-footer">{footer}</div>}
    </li>
  );
}
