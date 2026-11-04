import { useContext, useSyncExternalStore, type ReactNode } from 'react';
import { Button, CloseButton, FormBody, FormFooter } from '../ui';
import { InAside } from './AppShell';
import { Dialog } from './Dialog';
import { answerLeave, leavePending, subscribeNavigationWarning } from './navigation-guard';

/**
 * Page frame for the room list, rooms and the home tabs: a sticky top region (title bar,
 * summary), the content, and a bar pinned to the bottom on phones: the screen's own tabs
 * (`bottom`, a room's) or else the app's navigation (`nav`). Inside the desktop AppShell the
 * body scrolls under the top, the screen's tabs move up under it and `nav` gives way to the
 * shell's side rail. The main landmark is here, so views own the page. Leaving with unsaved
 * changes on it asks first.
 */
export function Screen({
  top,
  nav,
  bottom,
  children,
}: {
  top: ReactNode;
  /** The app's tabs, for phones. */
  nav?: ReactNode;
  /** This screen's own tabs, which take the bottom on phones and sit under the top on desktop. */
  bottom?: ReactNode;
  children: ReactNode;
}) {
  const asking = useSyncExternalStore(subscribeNavigationWarning, leavePending);
  // A list beside the screen is not the page's main content, and leaves the asking to it.
  const inAside = useContext(InAside);
  const Body = inAside ? 'div' : 'main';
  const bar = bottom ?? nav;
  return (
    <div className="ui-screen" data-has-bottom={bar ? true : undefined}>
      <header className="ui-screen-top">{top}</header>
      <Body className="ui-screen-body">{children}</Body>
      {bar && (
        <div className="ui-screen-bottom" data-kind={bottom ? 'tabs' : 'nav'}>
          {bar}
        </div>
      )}
      {asking && !inAside && (
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
