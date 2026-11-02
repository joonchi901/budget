import type { ReactNode } from 'react';
import { UgaIllustration, UgaMascot } from '../brand/Uga';

export function Empty({
  children,
  illustration = 'empty',
}: {
  children: ReactNode;
  illustration?: 'empty' | 'search';
}) {
  return (
    <div className="empty uga-empty">
      {illustration === 'search' ? (
        <UgaMascot pose="search" size={92} />
      ) : (
        <UgaIllustration name="empty-state" size={120} />
      )}
      <p>{children}</p>
    </div>
  );
}
