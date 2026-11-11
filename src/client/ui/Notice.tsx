import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * A message floating at the top of the page, such as a failed save or a copied link. Errors
 * interrupt screen readers; other notices are announced politely.
 */
export function Notice({
  tone = 'danger',
  children,
  action,
  onClose,
}: {
  tone?: 'danger' | 'success';
  children: ReactNode;
  /** A way to recover, such as 다시 시도, shown before 닫기. */
  action?: ReactNode;
  onClose(): void;
}) {
  return (
    <div className="ui-notice" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <span>{children}</span>
      {action}
      <Button variant="plain" onClick={onClose}>
        닫기
      </Button>
    </div>
  );
}
