import { describe, expect, it } from 'vitest';
import { ALL_LEDGERS_ID } from '../../src/shared/hierarchy';
import {
  cardStatement,
  categoryNames,
  savingsSummary,
  tagFilteredTransactions,
  tagGroupBreakdown,
  tagsForTransaction,
  totals,
  visibleTransactions,
} from '../../src/shared/selectors';
import type {
  AssetMovement,
  Bootstrap,
  Ledger,
  PaymentMethod,
  Tag,
  TagGroup,
  Transaction,
} from '../../src/shared/types';

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    ledgerId: 'main',
    date: '2026-09-15',
    description: id,
    amount: 100,
    type: 'expense',
    ownerId: 'shared',
    paymentMethodId: 'card',
    tagIds: [],
    allocations: [],
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

function bootstrap(transactions: Transaction[] = [], ledgers: Ledger[] = []): Bootstrap {
  const user = { id: 'u1', name: '나', color: '#000' } as const;
  return {
    user,
    users: [user],
    ledgers,
    transactions,
    assets: [],
    paymentMethods: [],
    tagGroups: [],
    tags: [],
    assetOperations: [],
    assetMovements: [],
    revision: 0,
    mode: 'demo',
  };
}

function tagGroup(id: string, overrides: Partial<TagGroup> = {}): TagGroup {
  return {
    id,
    name: id,
    selectionMode: 'multiple',
    appliesTo: 'transaction',
    role: 'regular',
    ledgerIds: null,
    sortOrder: 0,
    archived: false,
    version: 1,
    ...overrides,
  };
}

function tag(id: string, groupId: string, overrides: Partial<Tag> = {}): Tag {
  return {
    id,
    groupId,
    name: id,
    color: '#31725f',
    sortOrder: 0,
    archived: false,
    version: 1,
    ...overrides,
  };
}

function tagData(): Bootstrap {
  const data = bootstrap();
  data.tagGroups = [
    tagGroup('category', { role: 'category', selectionMode: 'single', sortOrder: 0 }),
    tagGroup('occasion', { sortOrder: 1 }),
    tagGroup('asset-category', { appliesTo: 'asset', role: 'category', sortOrder: 2 }),
  ];
  data.tags = [
    tag('restaurant', 'category', { name: '외식', sortOrder: 1 }),
    tag('grocery', 'category', { name: '식비', sortOrder: 0 }),
    tag('travel', 'occasion', { name: '여행', sortOrder: 1 }),
    tag('together', 'occasion', { name: '함께', sortOrder: 0 }),
    tag('old', 'occasion', { name: '옛 기록', sortOrder: 2, archived: true }),
    tag('unused', 'occasion', { name: '미사용', sortOrder: 3 }),
    tag('cash-asset', 'asset-category', { name: '현금성 자산' }),
  ];
  return data;
}

function movement(id: string, overrides: Partial<AssetMovement> = {}): AssetMovement {
  return {
    id,
    assetId: 'savings',
    transactionId: null,
    operationId: 'operation',
    date: '2026-09-15',
    description: id,
    amount: 0,
    savingsAmount: 0,
    actorId: 'u1',
    ...overrides,
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
  it('includes every descendant original once, including archived ledgers, based on the transaction month', () => {
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
      'nested-expense',
    ]);
    expect(visibleTransactions(data, 'trip', '2026-09').map((item) => item.id)).toEqual([
      'trip-expense',
      'nested-expense',
    ]);
    expect(visibleTransactions(data, 'trip', '2026-09', { includeDescendants: false })).toEqual([
      trip,
    ]);
    expect(visibleTransactions(data, 'missing', '2026-09')).toEqual([]);
    expect(visibleTransactions(data, 'main', '2026-10')).toEqual([]);
  });

  it('supports annual and configured periods and overall originals without an actual all-ledger record', () => {
    const january = transaction('jan', { ledgerId: 'jan', date: '2026-01-10' });
    const data = bootstrap(
      [
        january,
        january,
        transaction('dec', { ledgerId: 'dec', date: '2026-12-31' }),
        transaction('next', { ledgerId: 'jan', date: '2027-01-01' }),
        transaction('other-root', { ledgerId: 'other', date: '2026-09-01' }),
      ],
      [
        ledger('year', { startDate: '2026-01-01', endDate: '2026-12-31' }),
        ledger('jan', { parentId: 'year' }),
        ledger('dec', { parentId: 'year' }),
        ledger('other'),
      ],
    );
    expect(visibleTransactions(data, 'year', '2026-09')).toEqual([]);
    expect(
      visibleTransactions(data, 'year', '2026-09', { period: 'year' }).map((row) => row.id),
    ).toEqual(['jan', 'dec']);
    expect(
      visibleTransactions(data, 'year', '2027-01', { period: 'period' }).map((row) => row.id),
    ).toEqual(['jan', 'dec']);
    expect(
      visibleTransactions(data, 'jan', '2026-09', { period: 'period' }).map((row) => row.id),
    ).toEqual(['jan', 'next']);
    expect(
      visibleTransactions(data, ALL_LEDGERS_ID, '2026-09', { period: 'year' }).map((row) => row.id),
    ).toEqual(['jan', 'dec', 'other-root']);
    expect(visibleTransactions(data, ALL_LEDGERS_ID, '2026-09', { period: 'period' })).toHaveLength(
      4,
    );
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
  it('counts income and expense once despite multiple tags or asset allocations', () => {
    const expense = transaction('expense', {
      amount: 20000,
      tagIds: ['a', 'b'],
      allocations: [
        { assetId: 'checking', amount: 15000 },
        { assetId: 'savings', amount: 5000 },
      ],
    });
    expect(
      totals([
        expense,
        { ...expense },
        transaction('other-expense', { amount: 20000 }),
        transaction('income', { type: 'income', amount: 500000 }),
      ]),
    ).toEqual({ income: 500000, expense: 40000 });
    expect(totals([])).toEqual({ income: 0, expense: 0 });
  });
});

describe('transaction tags and categories', () => {
  it('resolves category roles, preserves archived history, and orders groups and options', () => {
    const data = tagData();
    data.tagGroups[0].archived = true;
    data.tags.find((item) => item.id === 'restaurant')!.archived = true;
    const entry = transaction('entry', {
      tagIds: ['old', 'cash-asset', 'travel', 'restaurant', 'restaurant', 'missing', 'together'],
    });
    expect(tagsForTransaction(data, entry).map((item) => item.id)).toEqual([
      'restaurant',
      'together',
      'travel',
      'old',
    ]);
    expect(categoryNames(data, entry)).toEqual(['외식']);
    expect(categoryNames(data, transaction('empty'))).toEqual([]);
  });
});

describe('tagFilteredTransactions', () => {
  it('uses OR within each group and AND between groups without double counting', () => {
    const data = tagData();
    const one = transaction('one', { tagIds: ['grocery', 'together', 'travel'] });
    const two = transaction('two', { tagIds: ['restaurant', 'travel'] });
    const missingCategory = transaction('missing-category', { tagIds: ['travel'] });
    const missingOccasion = transaction('missing-occasion', { tagIds: ['grocery'] });
    const source = [one, { ...one }, two, missingCategory, missingOccasion];
    expect(
      tagFilteredTransactions(data, source, [
        'grocery',
        'restaurant',
        'travel',
        'together',
        'travel',
      ]),
    ).toEqual([one, two]);
    expect(tagFilteredTransactions(data, source, ['together', 'travel'])).toEqual([
      one,
      two,
      missingCategory,
    ]);
    expect(tagFilteredTransactions(data, source, [])).toEqual([
      one,
      two,
      missingCategory,
      missingOccasion,
    ]);
  });

  it('keeps archived options and groups searchable, without broadening invalid selections', () => {
    const data = tagData();
    data.tagGroups.find((group) => group.id === 'occasion')!.archived = true;
    const historical = transaction('old', { tagIds: ['old'] });
    const source = [historical, transaction('current', { tagIds: ['travel'] })];
    expect(tagFilteredTransactions(data, source, ['old'])).toEqual([historical]);
    expect(tagFilteredTransactions(data, source, ['old', 'missing'])).toEqual([]);
    expect(tagFilteredTransactions(data, source, ['cash-asset'])).toEqual([]);
  });
});

describe('tagGroupBreakdown', () => {
  it('counts each expense per selected option and puts only unmatched expenses in unclassified', () => {
    const data = tagData();
    const shared = transaction('shared', {
      amount: 20000,
      tagIds: ['together', 'travel', 'travel'],
    });
    const source = [
      shared,
      { ...shared },
      transaction('same-amount', { amount: 20000, tagIds: ['travel'] }),
      transaction('historical', { amount: 3000, tagIds: ['old'] }),
      transaction('category-only', { amount: 5000, tagIds: ['grocery'] }),
      transaction('unknown-only', { amount: 2000, tagIds: ['missing'] }),
      transaction('salary', { type: 'income', amount: 90000, tagIds: ['together'] }),
    ];
    const result = tagGroupBreakdown(data, source, 'occasion');
    expect(
      result.map(({ tagId, name, amount, count }) => ({ tagId, name, amount, count })),
    ).toEqual([
      { tagId: 'together', name: '함께', amount: 20000, count: 1 },
      { tagId: 'travel', name: '여행', amount: 40000, count: 2 },
      { tagId: 'old', name: '옛 기록', amount: 3000, count: 1 },
      { tagId: 'unused', name: '미사용', amount: 0, count: 0 },
      { tagId: null, name: '미분류', amount: 7000, count: 2 },
    ]);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(70000);
    expect(totals(source).expense).toBe(50000);
  });

  it('includes an empty unclassified row, preserves archived groups, and ignores asset groups', () => {
    const data = tagData();
    data.tagGroups[0].archived = true;
    expect(
      tagGroupBreakdown(data, [], 'category').map((row) => [row.tagId, row.amount, row.count]),
    ).toEqual([
      ['grocery', 0, 0],
      ['restaurant', 0, 0],
      [null, 0, 0],
    ]);
    expect(tagGroupBreakdown(data, [], 'missing')).toEqual([]);
    expect(tagGroupBreakdown(data, [], 'asset-category')).toEqual([]);
    data.tags = [];
    expect(tagGroupBreakdown(data, [transaction('unclassified')], 'occasion')).toEqual([
      { tagId: null, name: '미분류', color: '#a5ad9f', amount: 100, count: 1 },
    ]);
  });
});

describe('savingsSummary', () => {
  it('uses recorded savings effects for the movement month and deduplicates only movement IDs', () => {
    const data = bootstrap();
    const deposit = movement('deposit', { amount: 50000, savingsAmount: 50000 });
    data.assetMovements = [
      deposit,
      { ...deposit },
      movement('second-deposit', { amount: 50000, savingsAmount: 50000 }),
      movement('spending', { amount: -20000, savingsAmount: -5000, transactionId: 'expense' }),
      movement('previous-month', { date: '2026-08-31', amount: 70000, savingsAmount: 70000 }),
      movement('next-month', { date: '2026-10-01', amount: -90000, savingsAmount: -90000 }),
      movement('adjustment', { amount: 1000000, savingsAmount: 0, operationId: 'adjustment' }),
      movement('opening', { amount: 8000000, savingsAmount: 0, operationId: null }),
    ];
    expect(savingsSummary(data, '2026-09')).toEqual({ inflow: 100000, outflow: 5000, net: 95000 });
    expect(savingsSummary(data, '2026-08')).toEqual({ inflow: 70000, outflow: 0, net: 70000 });
    expect(savingsSummary(data, '2026-10')).toEqual({ inflow: 0, outflow: 90000, net: -90000 });
    expect(savingsSummary(data, '2026-11')).toEqual({ inflow: 0, outflow: 0, net: 0 });
  });

  it('keeps both inflow and outflow zero for recorded internal savings transfers', () => {
    const data = bootstrap();
    data.assetMovements = [
      movement('from-savings', { assetId: 'old-savings', amount: -30000, savingsAmount: 0 }),
      movement('to-savings', { assetId: 'new-savings', amount: 30000, savingsAmount: 0 }),
      movement('ordinary-transfer-out', { assetId: 'checking', amount: -10000, savingsAmount: 0 }),
      movement('ordinary-transfer-in', { assetId: 'cash', amount: 10000, savingsAmount: 0 }),
    ];
    expect(savingsSummary(data, '2026-09')).toEqual({ inflow: 0, outflow: 0, net: 0 });
    expect(totals(data.transactions)).toEqual({ income: 0, expense: 0 });
    expect(() => savingsSummary(data, '2026-9')).toThrow(RangeError);
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
      transaction('unassigned-payment', {
        date: '2026-08-15',
        paymentMethodId: null,
        amount: 99000,
      }),
      transaction('income', { date: '2026-08-15', type: 'income' }),
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
