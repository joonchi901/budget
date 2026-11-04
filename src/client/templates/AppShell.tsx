import { createContext, useSyncExternalStore, type ReactNode } from 'react';

/** The desktop layout's width; templates.css switches at the same 1024px. */
export const WIDE_QUERY = '(min-width: 1024px)';

const subscribe = (onChange: () => void) => {
  const list = matchMedia(WIDE_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
};

/** Whether the desktop layout is showing, so the app can place a list beside the screen. */
export function useWide() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/** Set inside the list pane, so its screen is not the page's main content. */
export const InAside = createContext(false);

/**
 * Desktop frame: the app's navigation as a side rail, an optional list pane beside it (the room
 * list while a room is open, the 설정 menu beside its page) and the screen, each scrolling on
 * its own. On phones only the screen shows, carrying the navigation at its bottom.
 */
export function AppShell({
  nav,
  aside,
  asideLabel,
  children,
}: {
  /** Logo and the app's tabs, shown as the side rail from 1024px (icons only below 1440px). */
  nav: ReactNode;
  /** A list to keep beside the screen from 1024px. */
  aside?: ReactNode;
  asideLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-shell" data-has-aside={aside ? true : undefined}>
      <nav className="ui-shell-nav" aria-label="앱 메뉴">
        {nav}
      </nav>
      {aside && (
        <aside className="ui-shell-aside" aria-label={asideLabel}>
          <InAside.Provider value={true}>{aside}</InAside.Provider>
        </aside>
      )}
      <div className="ui-shell-main">{children}</div>
    </div>
  );
}
