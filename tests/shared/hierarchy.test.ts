import { describe, expect, it } from 'vitest';
import {
  ALL_LEDGERS_ID,
  ledgerAncestors,
  ledgerDescendantIds,
  ledgerPath,
  sortedLedgerChildren,
} from '../../src/shared/hierarchy';
import { transactionForLedger } from '../../src/shared/classification';
import type { Ledger, Transaction } from '../../src/shared/types';

const ledger = (
  id: string,
  parentId: string | null = null,
  extra: Partial<Ledger> = {},
): Ledger => ({
  id,
  parentId,
  name: id,
  kind: 'purpose',
  icon: '',
  budget: 0,
  startDate: null,
  endDate: null,
  archived: false,
  version: 1,
  ...extra,
});
const tree = () => [
  ledger('2026'),
  ledger('jan', '2026', { sortOrder: 1 }),
  ledger('feb', '2026', { sortOrder: 2 }),
  ledger('trip', 'jan', { archived: true }),
  ledger('2027'),
  ledger('orphan', 'missing'),
];

describe('arbitrary ledger forest', () => {
  it('finds deep archived descendants, ordered siblings, detached roots and ancestor paths', () => {
    const ledgers = tree();
    expect([...ledgerDescendantIds(ledgers, '2026')].sort()).toEqual([
      '2026',
      'feb',
      'jan',
      'trip',
    ]);
    expect([...ledgerDescendantIds(ledgers, 'jan', false)]).toEqual(['trip']);
    expect([...ledgerDescendantIds(ledgers, 'missing')]).toEqual([]);
    expect(sortedLedgerChildren(ledgers, '2026').map((item) => item.id)).toEqual(['jan', 'feb']);
    expect(sortedLedgerChildren(ledgers, null).map((item) => item.id)).toEqual([
      '2026',
      '2027',
      'orphan',
    ]);
    expect(ledgerAncestors(ledgers, 'trip').map((item) => item.id)).toEqual(['2026', 'jan']);
    expect(ledgerPath(ledgers, 'trip')).toBe('2026 / jan / trip');
    expect(ledgerPath(ledgers, 'missing')).toBe('');
    expect(ledgerDescendantIds(ledgers, ALL_LEDGERS_ID).size).toBe(ledgers.length);
  });
  it('reflects subtree moves without rewriting any descendant relation', () => {
    const ledgers = tree();
    ledgers.find((item) => item.id === 'jan')!.parentId = '2027';
    expect([...ledgerDescendantIds(ledgers, '2026')].sort()).toEqual(['2026', 'feb']);
    expect([...ledgerDescendantIds(ledgers, '2027')].sort()).toEqual(['2027', 'jan', 'trip']);
    expect(ledgerPath(ledgers, 'trip')).toBe('2027 / jan / trip');
  });
  it('terminates duplicate, self-referential and cyclic fixture traversals', () => {
    const ledgers = [
      ledger('a', 'c'),
      ledger('b', 'a'),
      ledger('c', 'b'),
      ledger('self', 'self'),
      ledger('b', 'a'),
    ];
    expect([...ledgerDescendantIds(ledgers, 'a')].sort()).toEqual(['a', 'b', 'c']);
    expect([...ledgerDescendantIds(ledgers, 'a', false)].sort()).toEqual(['b', 'c']);
    expect(ledgerAncestors(ledgers, 'a').map((item) => item.id)).toEqual(['b', 'c']);
    expect(ledgerAncestors(ledgers, 'self')).toEqual([]);
    expect([...ledgerDescendantIds(ledgers, 'self', false)]).toEqual([]);
    expect(sortedLedgerChildren(ledgers, 'a')).toHaveLength(1);
  });
  it('maps classifications one edge at a time up to the selected ancestor, preserving originals', () => {
    const ledgers = tree();
    ledgers.find((item) => item.id === 'trip')!.tagMappings = { meal: 'travel' };
    ledgers.find((item) => item.id === 'jan')!.tagMappings = { travel: 'food' };
    const original = {
      id: 'tx',
      ledgerId: 'trip',
      tagIds: ['meal', 'travel'],
      amount: 100,
    } as Transaction;
    expect(transactionForLedger(ledgers, 'jan', original).tagIds).toEqual(['travel']);
    expect(transactionForLedger(ledgers, '2026', original).tagIds).toEqual(['food']);
    expect(transactionForLedger(ledgers, '2027', original)).toBe(original);
    expect(transactionForLedger(ledgers, ALL_LEDGERS_ID, original)).toBe(original);
    expect(transactionForLedger(ledgers, 'trip', original)).toBe(original);
    expect(original.tagIds).toEqual(['meal', 'travel']);
  });
});
