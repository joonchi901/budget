import { createContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '../ui';

/** The desktop layout's width; templates.css switches at the same 1024px. */
export const WIDE_QUERY = '(min-width: 1024px)';
/** Where the rail starts open with labels unless the person chose otherwise. */
const ROOMY_QUERY = '(min-width: 1440px)';
const RAIL_KEY = 'uga.rail';

function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Whether the desktop layout is showing, so the app can place a list beside the screen. */
export const useWide = () => useMedia(WIDE_QUERY);

/** Set inside the list pane, so its screen is not the page's main content. */
export const InAside = createContext(false);

/**
 * Desktop frame: the app's navigation as a side rail, an optional list pane beside it (the room
 * list while a room is open, the 설정 menu beside its page) and the screen, each scrolling on
 * its own. The rail folds to icons with the button at its top right; folded, the mark sits at
 * the top and turns into the unfold button under the pointer. It starts folded below 1440px and
 * then remembers the person's choice in this browser. On phones only the screen shows, carrying
 * the navigation at its bottom.
 */
export function AppShell({
  logo,
  mark,
  nav,
  aside,
  asideLabel,
  children,
}: {
  /** The full logo at the top of the open rail. */
  logo: ReactNode;
  /** A small square mark at the top of the folded rail. */
  mark: ReactNode;
  /** The app's tabs, shown in the side rail from 1024px. */
  nav: ReactNode;
  /** A list to keep beside the screen from 1024px. */
  aside?: ReactNode;
  asideLabel?: string;
  children: ReactNode;
}) {
  const roomy = useMedia(ROOMY_QUERY);
  const [chosen, setChosen] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY);
    } catch {
      return null;
    }
  });
  const folded = chosen ? chosen === 'folded' : !roomy;
  const toggle = () => {
    const next = folded ? 'open' : 'folded';
    setChosen(next);
    try {
      localStorage.setItem(RAIL_KEY, next);
    } catch {
      // A private window may refuse; the choice still holds until reload.
    }
  };
  return (
    <div
      className="ui-shell"
      data-has-aside={aside ? true : undefined}
      data-rail={folded ? 'folded' : 'open'}
    >
      <nav className="ui-shell-nav" aria-label="앱 메뉴">
        <div className="ui-shell-nav-head">
          {folded ? (
            <IconButton
              className="ui-shell-rail-toggle"
              aria-label="메뉴 펼치기"
              aria-expanded={false}
              onClick={toggle}
            >
              <span className="ui-shell-mark">{mark}</span>
              <PanelLeftOpen size={20} className="ui-shell-rail-icon" aria-hidden="true" />
            </IconButton>
          ) : (
            <>
              {logo}
              <IconButton aria-label="메뉴 접기" aria-expanded={true} onClick={toggle}>
                <PanelLeftClose size={20} aria-hidden="true" />
              </IconButton>
            </>
          )}
        </div>
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
