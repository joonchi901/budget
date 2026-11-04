import { useSyncExternalStore, type ReactNode } from 'react';
import { Button, CloseButton, FormBody, FormFooter } from '../ui';
import { Dialog } from './Dialog';
import { answerLeave, leavePending, subscribeNavigationWarning } from './navigation-guard';

/**
 * Mobile page frame for the room list and rooms: a sticky top region (title bar, summary,
 * view switch), the scrolling content, and an optional action pinned to the bottom. The main
 * landmark is here, so views own the page. Leaving with unsaved changes on it asks first.
 */
export function Screen({
  top,
  bottom,
  children,
}: {
  top: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
}) {
  const asking = useSyncExternalStore(subscribeNavigationWarning, leavePending);
  return (
    <div className="ui-screen" data-has-bottom={bottom ? true : undefined}>
      <header className="ui-screen-top">{top}</header>
      <main className="ui-screen-body">{children}</main>
      {bottom && <div className="ui-screen-bottom">{bottom}</div>}
      {asking && (
        <Dialog title="변경 내용을 버릴까요?" onClose={() => answerLeave(false)}>
          <FormBody>
            <p>저장하지 않은 변경 내용이 사라져요.</p>
          </FormBody>
          <FormFooter>
            <CloseButton variant="secondary" autoFocus>
              계속 수정
            </CloseButton>
            <Button variant="primary" onClick={() => answerLeave(true)}>
              변경 내용 버리기
            </Button>
          </FormFooter>
        </Dialog>
      )}
    </div>
  );
}
