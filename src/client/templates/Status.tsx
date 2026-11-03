import type { ReactNode } from 'react';
import { UgaMascot } from '../brand/Uga';
import { Empty, Stack } from '../ui';

/** A whole page that only says where loading stands: busy, or failed with a way to retry. */
export function StatusScreen({
  busy = false,
  children,
  action,
}: {
  busy?: boolean;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="ui-status-screen" aria-busy={busy || undefined}>
      {busy ? (
        <Stack gap={3} className="ui-status-screen-busy" role="status">
          <UgaMascot pose="record" size={96} />
          <p>{children}</p>
        </Stack>
      ) : (
        <Stack gap={4} className="ui-status-screen-failed">
          <Empty>{children}</Empty>
          {action}
        </Stack>
      )}
    </main>
  );
}
