import type { ReactNode } from 'react';
import { FormBody, FormFooter } from '../ui';
import { Dialog } from './Dialog';

type SheetProps = {
  title: string;
  subtitle?: string;
  onClose(): void;
  /** Closing asks before discarding unsaved input. */
  dirty?: boolean;
  locked?: boolean;
  children: ReactNode;
};

/**
 * Entry and settings screen. Full screen on phones with the actions pinned to the bottom;
 * a centered dialog on wider screens. Keeps Dialog's focus, Escape and unsaved-input rules.
 */
export function FullScreenSheet({
  footer,
  children,
  ...props
}: SheetProps & { footer: ReactNode }) {
  return (
    <Dialog {...props} className="ui-sheet-full">
      <FormBody>{children}</FormBody>
      <FormFooter>{footer}</FormFooter>
    </Dialog>
  );
}

/** Short content that rises from the bottom on phones, such as one day's records. */
export function BottomSheet({ children, ...props }: SheetProps) {
  return (
    <Dialog {...props} className="ui-sheet-bottom">
      <FormBody>{children}</FormBody>
    </Dialog>
  );
}
