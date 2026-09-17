import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseAppRoute, serializeAppRoute, type AppRoute } from '../shared/app-route';
import {
  allowAppNavigation,
  navigationWarning,
  subscribeNavigationWarning,
} from './navigation-guard';

const historyKey = '__ugaRouteHistoryV1';
interface HistoryMarker {
  chain: string;
  index: number;
}
interface HistoryPosition extends HistoryMarker {
  url: string;
  browserIndex?: number;
}

function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function markerOf(state: unknown): HistoryMarker | null {
  if (!state || typeof state !== 'object') return null;
  const marker = (state as Record<string, unknown>)[historyKey] as HistoryMarker | undefined;
  return marker && typeof marker.chain === 'string' && Number.isSafeInteger(marker.index)
    ? marker
    : null;
}

function stateWithMarker(marker: HistoryMarker): Record<string, unknown> {
  const state: unknown = window.history.state;
  // Retain host-owned fields. Unusual primitive states remain recoverable as a whole value.
  return {
    ...(state && typeof state === 'object' && !Array.isArray(state)
      ? state
      : state === null
        ? {}
        : { __ugaOriginalHistoryState: state }),
    [historyKey]: { chain: marker.chain, index: marker.index },
  };
}

function browserHistoryIndex(): number | undefined {
  return window.navigation?.currentEntry?.index;
}

function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function readRoute(): AppRoute {
  return parseAppRoute(window.location.href, currentMonth());
}

function sameRoute(a: AppRoute, b: AppRoute): boolean {
  return a.page === b.page && a.ledgerId === b.ledgerId && a.view === b.view && a.month === b.month;
}

export function useAppRoute(): {
  route: AppRoute;
  go: (next: AppRoute, options?: { replace?: boolean }) => void;
  navigationWarning: string;
} {
  const [route, setRoute] = useState(readRoute);
  const position = useRef<HistoryPosition | null>(null);
  const restoring = useRef<string | null>(null);
  const blockedNavigation = useSyncExternalStore(subscribeNavigationWarning, navigationWarning);
  const ensurePosition = useCallback(() => {
    if (!position.current) {
      const marker = markerOf(window.history.state) ?? { chain: crypto.randomUUID(), index: 0 };
      window.history.replaceState(stateWithMarker(marker), '', currentUrl());
      position.current = { ...marker, url: currentUrl(), browserIndex: browserHistoryIndex() };
    }
    return position.current;
  }, []);
  const refresh = useCallback(() => {
    const next = readRoute();
    setRoute((previous) => (sameRoute(previous, next) ? previous : next));
  }, []);

  useEffect(() => {
    ensurePosition();
    const traverse = () => {
      const previous = ensurePosition();
      const nextUrl = currentUrl();
      if (nextUrl === previous.url) {
        restoring.current = null;
        return;
      }
      // A single traversal can emit both popstate and hashchange.
      if (restoring.current === nextUrl) return;
      const marker = markerOf(window.history.state);
      const browserIndex = browserHistoryIndex();
      const routeChanges = !sameRoute(parseAppRoute(previous.url, currentMonth()), readRoute());
      if (restoring.current || (routeChanges && !allowAppNavigation())) {
        // Reverse the traversal instead of pushing a replacement entry and losing Forward.
        const delta =
          previous.browserIndex !== undefined && browserIndex !== undefined
            ? previous.browserIndex - browserIndex
            : marker?.chain === previous.chain
              ? previous.index - marker.index
              : 1; // An unmarked legacy entry predates this app's tracked navigation.
        if (delta) {
          restoring.current = nextUrl;
          window.history.go(delta);
        }
        return;
      }
      const nextMarker =
        marker?.chain === previous.chain
          ? marker
          : {
              chain: previous.chain,
              index:
                browserIndex !== undefined && previous.browserIndex !== undefined
                  ? previous.index + browserIndex - previous.browserIndex
                  : previous.index + 1,
            };
      if (!marker || marker.chain !== nextMarker.chain)
        window.history.replaceState(stateWithMarker(nextMarker), '', nextUrl);
      position.current = { ...nextMarker, url: nextUrl, browserIndex };
      refresh();
    };
    // Supporting browsers can cancel a traversal before its URL or history position changes.
    const navigation = window.navigation;
    const beforeTraverse = (event: NavigateEvent) => {
      if (
        !restoring.current &&
        event.navigationType === 'traverse' &&
        event.destination.sameDocument &&
        event.cancelable &&
        !sameRoute(parseAppRoute(event.destination.url, currentMonth()), readRoute()) &&
        !allowAppNavigation()
      )
        event.preventDefault();
    };
    navigation?.addEventListener('navigate', beforeTraverse);
    window.addEventListener('popstate', traverse);
    window.addEventListener('hashchange', traverse);
    return () => {
      navigation?.removeEventListener('navigate', beforeTraverse);
      window.removeEventListener('popstate', traverse);
      window.removeEventListener('hashchange', traverse);
    };
  }, [ensurePosition, refresh]);

  const go = useCallback(
    (next: AppRoute, options?: { replace?: boolean }) => {
      const url = serializeAppRoute(next, window.location.href, currentMonth());
      if (url !== currentUrl()) {
        if (restoring.current || !allowAppNavigation()) return;
        const previous = ensurePosition();
        const marker = {
          chain: previous.chain,
          index: options?.replace ? previous.index : previous.index + 1,
        };
        if (options?.replace) window.history.replaceState(stateWithMarker(marker), '', url);
        else window.history.pushState(stateWithMarker(marker), '', url);
        position.current = { ...marker, url, browserIndex: browserHistoryIndex() };
      }
      refresh();
    },
    [ensurePosition, refresh],
  );

  return { route, go, navigationWarning: blockedNavigation };
}
