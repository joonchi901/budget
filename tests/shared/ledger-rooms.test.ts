import { describe, expect, it } from 'vitest';
import { ledgerRooms } from '../../src/shared/ledger-rooms';
import type { Ledger, Transaction } from '../../src/shared/types';

const ledger = (
  id: string,
  parentId: string | null = null,
  extra: Partial<Ledger> = {},
): Ledger => ({
  id,
  name: id,
  parentId,
  kind: 'purpose',
  icon: '📒',
  budget: 0,
  startDate: null,
  endDate: null,
  archived: false,
  version: 1,
  ...extra,
});
const record = (
  id: string,
  ledgerId: string,
  updatedAt: string,
  date = '2026-01-01',
): Transaction => ({
  id,
  ledgerId,
  updatedAt,
  date,
  description: id,
  amount: 100,
  type: 'expense',
  ownerId: 'shared',
  paymentMethodId: null,
  tagIds: [],
  allocations: [],
  version: 1,
  updatedBy: 'u1',
});

describe('ledger room browser', () => {
  it('lists roots and summarizes deep records once, ordered by updates rather than future transaction dates', () => {
    const ledgers = [
      ledger('everyday'),
      ledger('2026'),
      ledger('jan', '2026'),
      ledger('trip', 'jan'),
    ];
    const records = [
      record('future', 'everyday', '2026-09-01T00:00:00Z', '2029-12-31'),
      record('child', 'jan', '2026-09-03T00:00:00Z'),
      record('deep', 'trip', '2026-09-02T00:00:00Z'),
    ];
    const rooms = ledgerRooms(ledgers, records);
    expect(rooms.map((room) => room.ledger.id)).toEqual(['2026', 'everyday']);
    expect(rooms[0].transactionCount).toBe(2);
    expect(rooms[0].descendantCount).toBe(2);
    expect(rooms[0].latestTransaction?.id).toBe('child');
    expect(records[0].date).toBe('2029-12-31');
  });

  it('searches names and full paths while hiding archived results unless requested', () => {
    const ledgers = [
      ledger('year', null, { name: '2026' }),
      ledger('jan', 'year', { name: '1월' }),
      ledger('trip', 'jan', { name: '여행', archived: true }),
    ];
    expect(ledgerRooms(ledgers, [], { query: '  １월  ' }).map((room) => room.ledger.id)).toEqual([
      'jan',
    ]);
    const found = ledgerRooms(ledgers, [], { query: '1월', includeArchived: true });
    expect(found.map((room) => room.ledger.id)).toEqual(['jan', 'trip']);
    expect(found[1].path).toBe('2026 / 1월 / 여행');
    expect(ledgerRooms(ledgers, [], { query: '없는 이름' })).toEqual([]);
  });

  it('keeps active children of hidden archives and orphans reachable with archived history in summaries', () => {
    const ledgers = [
      ledger('old', null, { archived: true }),
      ledger('active', 'old'),
      ledger('archived-trip', 'active', { archived: true }),
      ledger('orphan', 'missing'),
    ];
    const rooms = ledgerRooms(ledgers, [
      record('history', 'archived-trip', '2026-01-01T00:00:00Z'),
    ]);
    expect(rooms.map((room) => room.ledger.id)).toEqual(['active', 'orphan']);
    expect(rooms[0].transactionCount).toBe(1);
    expect(rooms[0].path).toBe('old / active');
    expect(
      ledgerRooms(ledgers, [], { includeArchived: true }).map((room) => room.ledger.id),
    ).toEqual(['old', 'orphan']);
  });

  it('handles malformed cycles, duplicate ledgers and invalid update timestamps deterministically', () => {
    const ledgers = [
      ledger('a', 'b'),
      ledger('b', 'a'),
      ledger('self', 'self'),
      ledger('self', 'self'),
    ];
    const rooms = ledgerRooms(ledgers, [
      record('invalid', 'b', 'invalid'),
      record('self-record', 'self', 'invalid'),
    ]);
    expect(rooms.map((room) => room.ledger.id)).toEqual(['a', 'self']);
    expect(rooms[0].descendantCount).toBe(1);
    expect(rooms[0].transactionCount).toBe(1);
    expect(rooms.every((room) => room.latestActivity === 0)).toBe(true);
  });
});
