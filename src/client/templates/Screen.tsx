import type { ReactNode } from 'react';

/**
 * Mobile page frame for the room list and rooms: a sticky top region (title bar, summary,
 * view switch), the scrolling content, and an optional action pinned to the bottom. The main
 * landmark is here, so views own the page.
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
  return (
    <div className="ui-screen" data-has-bottom={bottom ? true : undefined}>
      <header className="ui-screen-top">{top}</header>
      <main className="ui-screen-body">{children}</main>
      {bottom && <div className="ui-screen-bottom">{bottom}</div>}
    </div>
  );
}
