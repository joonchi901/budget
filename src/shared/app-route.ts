import { ALL_LEDGERS_ID } from './hierarchy';

export type AppPage =
  'rooms' | 'ledger' | 'assets' | 'payments' | 'analytics' | 'planning' | 'tags' | 'data';

export interface AppRoute {
  page: AppPage;
  ledgerId: string;
  view: 'list' | 'calendar';
  month: string;
}

const pages = new Set<AppPage>([
  'rooms',
  'ledger',
  'assets',
  'payments',
  'analytics',
  'planning',
  'tags',
  'data',
]);
const roomPages = new Set<AppPage>(['ledger', 'analytics', 'planning']);
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function routeUrl(input: string | URL): URL {
  try {
    return new URL(input, 'https://uga.invalid');
  } catch {
    return new URL('https://uga.invalid');
  }
}

function validLedgerId(value: string | null): value is string {
  return (
    value !== null &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f\ufffd]/u.test(value)
  );
}

export function isRoomPage(page: AppPage): boolean {
  return roomPages.has(page);
}

/** Read a deep link without guessing a ledger from an old or incomplete URL. */
export function parseAppRoute(input: string | URL, defaultMonth: string): AppRoute {
  const params = routeUrl(input).searchParams;
  const requestedPage = params.get('page') as AppPage | null;
  let page: AppPage = requestedPage && pages.has(requestedPage) ? requestedPage : 'rooms';
  const requestedLedger = params.get('ledger');
  if (isRoomPage(page) && !validLedgerId(requestedLedger)) page = 'rooms';
  const room = isRoomPage(page);
  const requestedMonth = params.get('month');
  return {
    page,
    ledgerId: room ? requestedLedger! : ALL_LEDGERS_ID,
    view: room && params.get('view') === 'calendar' ? 'calendar' : 'list',
    month: requestedMonth && monthPattern.test(requestedMonth) ? requestedMonth : defaultMonth,
  };
}

/** Only replace navigation parameters; retain other query values and the page anchor. */
export function serializeAppRoute(
  route: AppRoute,
  currentUrl: string | URL,
  defaultMonth: string,
): string {
  const url = routeUrl(currentUrl);
  const params = url.searchParams;
  params.set('page', route.page);
  params.set('ledger', route.ledgerId);
  params.set('view', route.view);
  params.set('month', route.month);
  const normalized = parseAppRoute(url, defaultMonth);
  if (normalized.page === 'rooms') params.delete('page');
  else params.set('page', normalized.page);
  if (isRoomPage(normalized.page)) {
    params.set('ledger', normalized.ledgerId);
    params.set('view', normalized.view);
  } else {
    params.delete('ledger');
    params.delete('view');
  }
  params.set('month', normalized.month);
  return `${url.pathname}${url.search}${url.hash}`;
}
