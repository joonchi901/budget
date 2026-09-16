import { describe, expect, it } from 'vitest';
import { cardStatement, totals, visibleTransactions } from '../../src/shared/selectors';
import type { Bootstrap, Ledger, PaymentMethod, Transaction } from '../../src/shared/types';

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    ledgerId: 'main',
    date: '2026-09-15',
    description: id,
    amount: 100,
    type: 'expense',
    category: '식비',
    ownerId: 'shared',
    paymentMethodId: 'card',
    tagIds: [],
    assetId: null,
    toAssetId: null,
    version: 1,
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function ledger(id: string, overrides: Partial<Ledger> = {}): Ledger {
  return {
    id,
    name: id,
    icon: '🏡',
    kind: 'purpose',
    parentId: null,
    budget: 0,
    startDate: null,
    endDate: null,
    archived: false,
    version: 1,
    ...overrides,
  };
}

function bootstrap(transactions: Transaction[], ledgers: Ledger[]): Bootstrap {
  const user = { id: 'u1', name: '나', color: '#000' } as const;
  return {
    user,
    users: [user],
    ledgers,
    transactions,
    assets: [],
    paymentMethods: [],
    tags: [],
    rules: [],
    revision: 0,
    mode: 'demo',
  };
}

const card: PaymentMethod = {
  id: 'card',
  name: '생활 카드',
  type: 'card',
  ownerId: 'shared',
  closingDay: 31,
  paymentDay: 15,
};

describe('visibleTransactions', () => {
  it('includes main and directly linked purpose originals once, based on the transaction month', () => {
    const trip = transaction('trip-expense', { ledgerId: 'trip', tagIds: ['a', 'b'] });
    const data = bootstrap(
      [
        transaction('main-expense'),
        trip,
        { ...trip },
        transaction('detached-expense', { ledgerId: 'detached' }),
        transaction('nested-expense', { ledgerId: 'nested' }),
        transaction('previous-month', { date: '2026-08-31' }),
      ],
      [
        ledger('main', { kind: 'main' }),
        ledger('trip', { parentId: 'main', archived: true, startDate: '2026-10-01' }),
        ledger('detached'),
        ledger('nested', { parentId: 'trip' }),
      ],
    );

    expect(visibleTransactions(data, 'main', '2026-09').map((item) => item.id)).toEqual([
      'main-expense',
      'trip-expense',
    ]);
    expect(visibleTransactions(data, 'trip', '2026-09')).toEqual([trip]);
    expect(visibleTransactions(data, 'missing', '2026-09')).toEqual([]);
    expect(visibleTransactions(data, 'main', '2026-10')).toEqual([]);
  });

  it('changes main visibility after unlinking without changing purpose originals or totals', () => {
    const trip = transaction('trip', { ledgerId: 'trip', amount: 80000 });
    const data = bootstrap(
      [trip],
      [ledger('main', { kind: 'main' }), ledger('trip', { parentId: 'main' })],
    );
    expect(totals(visibleTransactions(data, 'main', '2026-09')).expense).toBe(80000);

    data.ledgers[1].parentId = null;
    expect(visibleTransactions(data, 'main', '2026-09')).toEqual([]);
    expect(visibleTransactions(data, 'trip', '2026-09')).toEqual([trip]);
    data.ledgers[1].parentId = 'main';
    expect(totals(visibleTransactions(data, 'main', '2026-09')).expense).toBe(80000);
    expect(data.transactions).toEqual([trip]);
  });
});

describe('totals', () => {
  it('keeps saving and transfer separate from expenses and deduplicates only by original ID', () => {
    const expense = transaction('expense', { amount: 20000, tagIds: ['a', 'b'] });
    expect(
      totals([
        expense,
        { ...expense },
        transaction('other-expense', { amount: 20000 }),
        transaction('income', { type: 'income', amount: 500000 }),
        transaction('saving', { type: 'saving', amount: 100000 }),
        transaction('transfer', { type: 'transfer', amount: 30000 }),
      ]),
    ).toEqual({ income: 500000, expense: 40000, saving: 100000, transfer: 30000 });
    expect(totals([])).toEqual({ income: 0, expense: 0, saving: 0, transfer: 0 });
  });
});

describe('cardStatement', () => {
  it('includes all ledgers and both range boundaries, excludes other payments and types, and never double-counts', () => {
    const start = transaction('start', { date: '2026-08-01', ledgerId: 'detached', amount: 50000 });
    const end = transaction('end', { date: '2026-08-31', ledgerId: 'trip', amount: 20000 });
    const source = [
      start,
      { ...start },
      end,
      transaction('before', { date: '2026-07-31' }),
      transaction('after', { date: '2026-09-01' }),
      transaction('other-card', { date: '2026-08-15', paymentMethodId: 'other' }),
      ...(['income', 'saving', 'transfer'] as const).map((type) =>
        transaction(type, { date: '2026-08-15', type }),
      ),
    ];
    const original = structuredClone(source);
    expect(cardStatement(source, card, '2026-09')).toEqual({
      amount: 70000,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      paymentDate: '2026-09-15',
      transactions: [start, end],
    });
    expect(source).toEqual(original);
  });

  it.each([
    ['2026-09', 5, 15, '2026-08-06', '2026-09-05', '2026-09-15'],
    ['2026-09', 15, 15, '2026-07-16', '2026-08-15', '2026-09-15'],
    ['2026-01', 31, 15, '2025-12-01', '2025-12-31', '2026-01-15'],
    ['2026-03', 31, 15, '2026-02-01', '2026-02-28', '2026-03-15'],
    ['2028-03', 31, 15, '2028-02-01', '2028-02-29', '2028-03-15'],
    ['2026-02', 30, 31, '2025-12-31', '2026-01-30', '2026-02-28'],
    ['2026-04', 30, 31, '2026-03-01', '2026-03-30', '2026-04-30'],
  ])(
    'calculates %s with closing %i/payment %i using clamped dates and strictly earlier closing',
    (month, closingDay, paymentDay, startDate, endDate, paymentDate) => {
      expect(cardStatement([], { ...card, closingDay, paymentDay }, month)).toEqual({
        amount: 0,
        startDate,
        endDate,
        paymentDate,
        transactions: [],
      });
    },
  );

  it('rejects missing or invalid card settings and invalid billing months', () => {
    for (const change of [
      { type: 'cash' as const },
      { closingDay: null },
      { paymentDay: null },
      { closingDay: 0 },
      { paymentDay: 32 },
      { paymentDay: 1.5 },
    ])
      expect(() => cardStatement([], { ...card, ...change }, '2026-09')).toThrow(RangeError);
    for (const month of ['2026-9', '2026-00', '2026-13', '2026-09-01']) {
      expect(() => cardStatement([], card, month)).toThrow(RangeError);
    }
  });
});
