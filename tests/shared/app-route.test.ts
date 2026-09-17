import { describe, expect, it } from 'vitest';
import {
  parseAppRoute,
  serializeAppRoute,
  type AppPage,
  type AppRoute,
} from '../../src/shared/app-route';
import { ALL_LEDGERS_ID } from '../../src/shared/hierarchy';

const month = '2026-09';
const hub: AppRoute = { page: 'rooms', ledgerId: ALL_LEDGERS_ID, view: 'list', month };

describe('room-first navigation links', () => {
  it('opens the room list for the home URL and old preview links', () => {
    for (const url of ['/', '/?view=updated', '/?ledger=main', '/?page=not-a-page']) {
      expect(parseAppRoute(url, month)).toEqual(hub);
    }
  });

  it('restores a room, view and month from a shared link after reloading', () => {
    const room: AppRoute = {
      page: 'ledger',
      ledgerId: '우리집 / 여름 여행 🏖️',
      view: 'calendar',
      month: '2026-07',
    };
    const url = serializeAppRoute(room, '/', month);
    expect(parseAppRoute(`https://our-budget.example${url}`, '2027-01')).toEqual(room);
    expect(new URL(url, 'https://our-budget.example').searchParams.get('ledger')).toBe(
      room.ledgerId,
    );
  });

  it('keeps statistics and plans tied to the room that their shared link names', () => {
    for (const page of ['ledger', 'analytics', 'planning'] as const) {
      const scoped: AppRoute = { page, ledgerId: '2026-01', view: 'list', month: '2026-01' };
      expect(parseAppRoute(serializeAppRoute(scoped, '/', month), month)).toEqual(scoped);
      expect(parseAppRoute(`/?page=${page}`, month)).toEqual(hub);
      expect(parseAppRoute(`/?page=${page}&ledger=${ALL_LEDGERS_ID}`, month)).toEqual({
        ...hub,
        page,
      });
    }
  });

  it('does not imply a selected room on household-wide screens', () => {
    for (const page of ['rooms', 'assets', 'payments', 'tags', 'data'] as AppPage[]) {
      const url = serializeAppRoute(
        { page, ledgerId: 'private-trip', view: 'calendar', month: '2026-08' },
        '/?campaign=a&campaign=b&ledger=old&view=list#overview',
        month,
      );
      const parsedUrl = new URL(url, 'https://our-budget.example');
      expect(parsedUrl.searchParams.has('ledger')).toBe(false);
      expect(parsedUrl.searchParams.has('view')).toBe(false);
      expect(parsedUrl.searchParams.getAll('campaign')).toEqual(['a', 'b']);
      expect(parsedUrl.hash).toBe('#overview');
      expect(parseAppRoute(url, month)).toEqual({ ...hub, page, month: '2026-08' });
    }
  });

  it('handles broken or excessive ledger identifiers without picking another room', () => {
    for (const ledger of ['', '%20%20', '%00bad', '%E0%A4%A', 'a'.repeat(201)]) {
      expect(parseAppRoute(`/?page=ledger&ledger=${ledger}`, month)).toEqual(hub);
    }
    const id = 'a'.repeat(200);
    expect(parseAppRoute(`/?page=ledger&ledger=${id}`, month).ledgerId).toBe(id);
    expect(parseAppRoute('http://[invalid', month)).toEqual(hub);
  });

  it('decodes a ledger identifier once, retaining literal percent sequences', () => {
    const room: AppRoute = { ...hub, page: 'ledger', ledgerId: 'travel%2F2026+family' };
    const url = serializeAppRoute(room, '/', month);
    expect(parseAppRoute(url, month)).toEqual(room);
  });

  it('uses the current local month and list view for invalid optional selections', () => {
    for (const invalidMonth of ['2026-00', '2026-13', '2026-1', '26-01', '2026-01-01', '']) {
      expect(
        parseAppRoute(`/?page=ledger&ledger=main&month=${invalidMonth}&view=unknown`, month),
      ).toEqual({ ...hub, page: 'ledger', ledgerId: 'main' });
    }
  });

  it('produces a stable URL while changing only app navigation values', () => {
    const room: AppRoute = { ...hub, page: 'ledger', ledgerId: 'jan', view: 'calendar' };
    const source = '/budget?welcome=our%20home&page=ledger&ledger=old&view=list#history';
    const next = serializeAppRoute(room, source, month);
    expect(serializeAppRoute(parseAppRoute(next, month), next, month)).toBe(next);
    const url = new URL(next, 'https://our-budget.example');
    expect(url.pathname).toBe('/budget');
    expect(url.searchParams.get('welcome')).toBe('our home');
    expect(url.hash).toBe('#history');
  });
});
