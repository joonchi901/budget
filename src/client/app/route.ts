import { useEffect, useRef, useState } from 'react';
import type { HomeTab } from '../ledger';
import { SHEET_BACK, guardLeave } from '../templates';
import type { Id } from '../../shared/ledger';

/** Where the app is: a home tab (and a page opened from 설정), or a ledger's room. */
export type Route = { tab: HomeTab; page?: 'profile' | 'assets'; roomId?: Id };

const tabPaths: Record<HomeTab, string> = {
  ledgers: '',
  friends: 'friends',
  assets: 'assets',
  settings: 'settings',
};

export function parseRoute(pathname: string): Route {
  const [first = '', second] = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (first === 'ledgers' && second) return { tab: 'ledgers', roomId: second };
  const tab = (Object.keys(tabPaths) as HomeTab[]).find((key) => tabPaths[key] === first);
  if (!tab) return { tab: 'ledgers' };
  return tab === 'settings' && (second === 'profile' || second === 'assets')
    ? { tab, page: second }
    : { tab };
}

export function routePath({ tab, page, roomId }: Route): string {
  if (roomId) return `/ledgers/${encodeURIComponent(roomId)}`;
  return `/${[tabPaths[tab], page].filter(Boolean).join('/')}`;
}

type Entry = { depth: number };
const depthOf = () => (history.state as Entry | null)?.depth ?? 1;

/**
 * The screen lives in the address, so refresh keeps it and the phone's back goes to the previous
 * screen. Back first closes an open sheet, and leaving unsaved changes asks before going.
 */
export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));
  const shown = useRef({ path: location.pathname, depth: 1 });
  useEffect(() => {
    // An entry under the first screen, so back there can still close a sheet before leaving.
    if (typeof (history.state as Entry | null)?.depth !== 'number') {
      history.replaceState({ depth: 0 } satisfies Entry, '');
      history.pushState({ depth: 1 } satisfies Entry, '');
    }
    shown.current = { path: location.pathname, depth: depthOf() };
    // Set while going back again after the person agreed to drop their changes.
    let leaving = false;
    const onPop = () => {
      const apply = () => {
        shown.current = { path: location.pathname, depth: depthOf() };
        setRoute(parseRoute(location.pathname));
      };
      // Undo the browser's step until the sheet or the question is answered.
      const stay = () =>
        history.pushState({ depth: shown.current.depth } satisfies Entry, '', shown.current.path);
      if (leaving) {
        leaving = false;
        return apply();
      }
      if (document.querySelector('dialog[open]')) {
        stay();
        window.dispatchEvent(new Event(SHEET_BACK));
        return;
      }
      let decided = false;
      guardLeave(() => {
        if (!decided) {
          decided = true;
          return apply();
        }
        leaving = true;
        history.back();
      });
      if (!decided) {
        decided = true;
        stay();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next: Route) =>
    guardLeave(() => {
      const path = routePath(next);
      const depth = depthOf() + 1;
      history.pushState({ depth } satisfies Entry, '', path);
      shown.current = { path, depth };
      setRoute(next);
    });
  /** The in-app back: the previous screen, or the room list when the app was opened here. */
  const back = () =>
    guardLeave(() => {
      if (depthOf() > 1) return history.back();
      history.replaceState({ depth: 1 } satisfies Entry, '', '/');
      shown.current = { path: '/', depth: 1 };
      setRoute({ tab: 'ledgers' });
    });
  return { route, go, back };
}
