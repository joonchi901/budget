import type { ReactNode } from 'react';
import { UgaIllustration, UgaMascot } from '../brand/Uga';

export function Empty({
  children,
  illustration = 'empty',
}: {
  children: ReactNode;
  /** 'search' for no results, 'work' while something needs fixing, such as a failed load. */
  illustration?: 'empty' | 'search' | 'work';
}) {
  return (
    <div className="empty uga-empty">
      {illustration !== 'empty' ? (
        <UgaMascot pose={illustration} size={92} />
      ) : (
        <UgaIllustration name="empty-state" size={120} />
      )}
      <p>{children}</p>
    </div>
  );
}
