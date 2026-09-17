import { describe, it, expect } from 'vitest';
import type { Bootstrap, Ledger, Transaction } from '../../src/shared/types';
import {
  analysisTransactions,
  analysisOptionRows,
  analysisTagName,
  annualTagMatrix,
  annualSeries,
  dailySeries,
  groupedAnalysis,
  householdSavings,
  ledgerAnalysis,
  paymentAnalysis,
  transactionsCsv,
} from '../../src/shared/analytics';
import { visibleTransactions } from '../../src/shared/selectors';
import { ALL_LEDGERS_ID } from '../../src/shared/hierarchy';
const ledger = (id: string, more: Partial<Ledger> = {}): Ledger => ({
  id,
  name: id,
  icon: '',
  kind: 'main',
  parentId: null,
  budget: 0,
  startDate: null,
  endDate: null,
  archived: false,
  version: 1,
  ...more,
});
const tx = (id: string, more: Partial<Transaction> = {}): Transaction => ({
  id,
  ledgerId: 'main',
  date: '2026-09-15',
  description: id,
  type: 'expense',
  amount: 100,
  ownerId: 'shared',
  paymentMethodId: 'cash',
  tagIds: [],
  allocations: [],
  version: 1,
  updatedAt: '',
  updatedBy: 'u1',
  ...more,
});
function data(): Bootstrap {
  return {
    user: { id: 'u1', name: '나', color: '#000000' },
    users: [],
    ledgers: [
      ledger('main'),
      ledger('child', { kind: 'purpose', parentId: 'main', tagMappings: { trip: 'food' } }),
    ],
    transactions: [],
    assets: [],
    assetOperations: [],
    assetMovements: [],
    paymentMethods: [],
    tagGroups: [
      {
        id: 'category',
        name: '분류',
        selectionMode: 'multiple',
        appliesTo: 'transaction',
        role: 'category',
        ledgerIds: null,
        sortOrder: 0,
        archived: false,
        version: 1,
      },
    ],
    tags: ['food', 'trip', 'fixed'].map((id) => ({
      id,
      name: id,
      groupId: 'category',
      color: '#000000',
      sortOrder: 0,
      archived: false,
      version: 1,
    })),
    revision: 0,
    mode: 'demo',
  };
}
describe('complete analysis views', () => {
  it('aggregates arbitrary subtrees and partitions root or child contributions without double-counting', () => {
    const d = data();
    d.ledgers.push(
      ledger('grandchild', { kind: 'purpose', parentId: 'child', tagMappings: { meal: 'trip' } }),
      ledger('other-root', { kind: 'purpose' }),
    );
    d.transactions = [
      tx('root', { amount: 100 }),
      tx('child', { ledgerId: 'child', amount: 200 }),
      tx('grandchild', { ledgerId: 'grandchild', amount: 300, tagIds: ['meal'] }),
      tx('grandchild', { ledgerId: 'grandchild', amount: 300, tagIds: ['meal'] }),
      tx('other', { ledgerId: 'other-root', amount: 400 }),
    ];
    const filter = { ledgerId: 'main', startDate: '2026-09-01', endDate: '2026-09-30' };
    const selected = analysisTransactions(d, { ...filter, sourceLedgerId: 'child' });
    expect(selected.map((row) => row.id)).toEqual(['child', 'grandchild']);
    expect(selected.find((row) => row.id === 'grandchild')?.tagIds).toEqual(['food']);
    expect(analysisTransactions(d, { ...filter, ledgerId: 'child' }).map((row) => row.id)).toEqual([
      'child',
      'grandchild',
    ]);
    const groups = ledgerAnalysis(d, analysisTransactions(d, filter), 'main');
    expect(groups.map((group) => [group.id, group.expense])).toEqual([
      ['main', 100],
      ['child', 500],
    ]);
    const all = analysisTransactions(d, { ...filter, ledgerId: ALL_LEDGERS_ID });
    expect(
      ledgerAnalysis(d, all, ALL_LEDGERS_ID).map((group) => [group.id, group.expense]),
    ).toEqual([
      ['main', 600],
      ['other-root', 400],
    ]);
    expect(all.find((row) => row.id === 'grandchild')?.tagIds).toEqual(['meal']);
    d.ledgers.find((item) => item.id === 'child')!.parentId = 'other-root';
    expect(analysisTransactions(d, filter).map((row) => row.id)).toEqual(['root']);
    expect(analysisTransactions(d, { ...filter, ledgerId: 'other-root' })).toHaveLength(3);
    expect(d.transactions[2].tagIds).toEqual(['meal']);
  });
  it('maps child classification in the parent without modifying or duplicating original transactions', () => {
    const d = data();
    const original = tx('x', { ledgerId: 'child', tagIds: ['trip', 'food'] });
    d.transactions = [original, original];
    const rows = analysisTransactions(d, {
      ledgerId: 'main',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      tagIds: ['food'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tagIds).toEqual(['food']);
    expect(original.tagIds).toEqual(['trip', 'food']);
    expect(
      analysisTransactions(d, {
        ledgerId: 'child',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      })[0].tagIds,
    ).toEqual(['trip', 'food']);
    d.ledgers[1].parentId = null;
    expect(
      analysisTransactions(d, { ledgerId: 'main', startDate: '2026-09-01', endDate: '2026-09-30' }),
    ).toEqual([]);
  });
  it('uses accounting-period boundaries for ledger and annual figures', () => {
    const d = data();
    d.ledgers[0].periodStartDay = 25;
    d.transactions = [
      tx('before', { date: '2026-09-24' }),
      tx('start', { date: '2026-09-25' }),
      tx('end', { date: '2026-10-24' }),
      tx('after', { date: '2026-10-25' }),
    ];
    expect(visibleTransactions(d, 'main', '2026-09').map((t) => t.id)).toEqual(['start', 'end']);
    const year = annualSeries(d, { ledgerId: 'main', startDate: '', endDate: '' }, 2026);
    expect(year[8].expense).toBe(200);
    expect(year[9].expense).toBe(100);
  });
  it('keeps fixed expenses in spending but excludes them from no-spend amounts', () => {
    const d = data();
    d.ledgers[0].fixedExpenseTagIds = ['fixed'];
    const rows = [
      tx('fixed', { tagIds: ['fixed'], date: '2026-09-01' }),
      tx('food', { date: '2026-09-02', amount: 200 }),
      tx('income', { type: 'income', date: '2026-09-03', amount: 1000 }),
    ];
    const days = dailySeries(d, rows, '2026-09-01', '2026-09-03', 'main');
    expect(days.map((d) => d.variableExpense)).toEqual([0, 200, 0]);
    expect(days.map((d) => d.cumulative)).toEqual([100, 300, 300]);
  });
  it('shows all categories and income with unclassified, preserving distinct overall amounts', () => {
    const d = data();
    const rows = [tx('a', { type: 'income', tagIds: ['food', 'trip'] }), tx('b', { amount: 50 })];
    const groups = groupedAnalysis(d, rows, 'category');
    expect(groups.find((g) => g.id === 'food')?.income).toBe(100);
    expect(groups.find((g) => g.id === 'trip')?.income).toBe(100);
    expect(groups.find((g) => g.id === '')?.expense).toBe(50);
    expect(groups).toHaveLength(4);
  });
  it('exports quoted Unicode CSV and neutralizes formula-leading user labels', () => {
    const d = data();
    const csv = transactionsCsv(d, [tx('a', { description: '=SUM(1,2) "메모"' })]);
    expect(csv).toContain('"\'=SUM(1,2) ""메모"""');
    expect(csv).toContain('금액(원)');
  });
  it('builds twelve accounting-period tag columns, maps children and keeps the overall sum unique', () => {
    const d = data();
    d.ledgers[0].periodStartDay = 25;
    const duplicate = tx('child', {
      ledgerId: 'child',
      date: '2026-02-25',
      amount: 200,
      tagIds: ['trip'],
    });
    d.transactions = [
      tx('outside-before', { date: '2026-01-24', tagIds: ['food'] }),
      tx('jan-end', { date: '2026-02-24', tagIds: ['food'] }),
      duplicate,
      duplicate,
      tx('multi', { date: '2026-03-24', amount: 300, tagIds: ['food', 'fixed'] }),
      tx('future-current-period', { date: '2026-03-30', amount: 400, tagIds: ['food'] }),
      tx('dec-end', { date: '2027-01-24', amount: 500, tagIds: ['food'] }),
      tx('outside-after', { date: '2027-01-25', tagIds: ['food'] }),
      tx('missing', { date: '2026-02-10', amount: 50 }),
      tx('other-owner', { date: '2026-02-10', ownerId: 'u2', amount: 10000, tagIds: ['food'] }),
      tx('income', { date: '2026-02-10', type: 'income', amount: 1000, tagIds: ['food'] }),
    ];
    const matrix = annualTagMatrix(
      d,
      {
        ledgerId: 'main',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        ownerId: 'shared',
        type: 'expense',
      },
      2026,
      'category',
      '2026-03-25',
    );
    expect(matrix.periods).toHaveLength(12);
    expect(matrix.periods[0]).toMatchObject({ startDate: '2026-01-25', endDate: '2026-02-24' });
    expect(matrix.periods[11]).toMatchObject({ startDate: '2026-12-25', endDate: '2027-01-24' });
    const food = matrix.groups.find((row) => row.id === 'food')!;
    expect(food.months.map((month) => month.expense)).toEqual([
      100, 500, 400, 0, 0, 0, 0, 0, 0, 0, 0, 500,
    ]);
    expect(food.total).toEqual({ income: 0, expense: 1500, count: 5 });
    expect(matrix.overall.total).toEqual({ income: 0, expense: 1550, count: 6 });
    expect(matrix.groups.reduce((sum, row) => sum + row.total.expense, 0)).toBe(1850);
    expect(matrix.elapsedPeriods).toBe(3);
    expect(food.average.expense).toBe(200);
    expect(matrix.overall.average.expense).toBe(650 / 3);
    expect(analysisOptionRows(d, matrix.rows, 'category', 'food').map((row) => row.id)).toContain(
      'child',
    );
    expect(analysisOptionRows(d, matrix.rows, 'category', '').map((row) => row.id)).toEqual([
      'missing',
    ]);
    expect(d.transactions.find((row) => row.id === 'child')?.tagIds).toEqual(['trip']);
  });
  it('keeps future-year averages undefined, retains zero/archived options and respects payment/asset/tag filters', () => {
    const d = data();
    d.tags[2].archived = true;
    d.transactions = [
      tx('match', {
        type: 'income',
        date: '2028-02-29',
        paymentMethodId: 'account',
        tagIds: ['food'],
        allocations: [{ assetId: 'a', amount: 40 }],
      }),
      tx('wrong-payment', {
        type: 'income',
        date: '2028-02-29',
        paymentMethodId: 'cash',
        tagIds: ['food'],
        allocations: [{ assetId: 'a', amount: 40 }],
      }),
      tx('wrong-asset', {
        type: 'income',
        date: '2028-02-29',
        paymentMethodId: 'account',
        tagIds: ['food'],
      }),
      tx('wrong-tag', {
        type: 'income',
        date: '2028-02-29',
        paymentMethodId: 'account',
        allocations: [{ assetId: 'a', amount: 40 }],
      }),
    ];
    const matrix = annualTagMatrix(
      d,
      {
        ledgerId: 'main',
        startDate: '',
        endDate: '',
        paymentMethodId: 'account',
        assetId: 'a',
        tagIds: ['food'],
      },
      2028,
      'category',
      '2026-09-16',
    );
    expect(matrix.rows.map((row) => row.id)).toEqual(['match']);
    expect(matrix.periods[1].endDate).toBe('2028-02-29');
    expect(matrix.overall.total.income).toBe(100);
    expect(matrix.overall.average.income).toBeNull();
    expect(matrix.elapsedPeriods).toBe(0);
    expect(matrix.groups.find((row) => row.id === 'fixed')!.total.count).toBe(0);
  });
  it('shows distinct counts for tag/payment groups and retains archived or unknown payment histories', () => {
    const d = data();
    d.paymentMethods = [
      {
        id: 'cash',
        name: '현금',
        ownerId: 'shared',
        type: 'cash',
        closingDay: null,
        paymentDay: null,
        archived: true,
      },
    ];
    const original = tx('one', { tagIds: ['food', 'trip'] });
    const rows = [
      original,
      original,
      tx('two', { amount: 30, type: 'income', paymentMethodId: 'missing' }),
    ];
    expect(groupedAnalysis(d, rows, 'category').find((row) => row.id === 'food')!.count).toBe(1);
    const payments = paymentAnalysis(d, rows);
    expect(payments).toEqual([
      { id: 'cash', name: '현금 (보관)', income: 0, expense: 100, count: 1 },
      { id: 'missing', name: '알 수 없는 결제수단', income: 30, expense: 0, count: 1 },
    ]);
  });
  it('keeps unassigned payments in totals, distinguishes their filter from all payments and exports their label', () => {
    const d = data();
    const missing = tx('unassigned', { paymentMethodId: null, amount: 250 });
    d.transactions = [missing, tx('assigned', { amount: 100 })];
    const filter = { ledgerId: 'main', startDate: '2026-09-01', endDate: '2026-09-30' };
    expect(analysisTransactions(d, filter)).toHaveLength(2);
    expect(analysisTransactions(d, { ...filter, paymentMethodId: '' })).toHaveLength(2);
    expect(analysisTransactions(d, { ...filter, paymentMethodId: null })).toEqual([missing]);
    expect(
      analysisTransactions(d, { ...filter, paymentMethodId: 'cash' }).map((row) => row.id),
    ).toEqual(['assigned']);
    expect(paymentAnalysis(d, [missing, missing, ...d.transactions])).toEqual([
      { id: null, name: '미지정', income: 0, expense: 250, count: 1 },
      { id: 'cash', name: '알 수 없는 결제수단', income: 0, expense: 100, count: 1 },
    ]);
    expect(transactionsCsv(d, [missing])).toContain('"미지정"');
  });
  it('shows parent names for dependent options and terminates malformed cycles safely', () => {
    const d = data();
    d.tags[1].parentId = 'food';
    expect(analysisTagName(d, 'trip')).toBe('food / trip');
    d.tags[0].parentId = 'trip';
    expect(analysisTagName(d, 'trip')).toBe('food / trip');
  });
  it('compares original ledgers once, includes linked archives and supports main-only filtering', () => {
    const d = data();
    d.ledgers[1].archived = true;
    d.ledgers.push(ledger('detached', { kind: 'purpose' }));
    d.transactions = [
      tx('main', { amount: 100 }),
      tx('linked', { ledgerId: 'child', amount: 300 }),
      tx('detached', { ledgerId: 'detached', amount: 10000 }),
    ];
    const filter = { ledgerId: 'main', startDate: '2026-09-01', endDate: '2026-09-30' };
    const rows = analysisTransactions(d, filter);
    expect(ledgerAnalysis(d, rows, 'main')).toEqual([
      {
        id: 'main',
        name: 'main · 직접 기록',
        income: 0,
        expense: 100,
        count: 1,
        expenseShare: 0.25,
      },
      { id: 'child', name: 'child (보관)', income: 0, expense: 300, count: 1, expenseShare: 0.75 },
    ]);
    expect(
      analysisTransactions(d, { ...filter, sourceLedgerId: 'main', includeDescendants: false }).map(
        (row) => row.id,
      ),
    ).toEqual(['main']);
    expect(analysisTransactions(d, { ...filter, sourceLedgerId: 'detached' })).toEqual([]);
    d.ledgers[1].parentId = null;
    expect(ledgerAnalysis(d, analysisTransactions(d, filter), 'main')).toHaveLength(1);
    expect(d.transactions).toHaveLength(3);
  });
  it('deduplicates savings movements while keeping distinct same-value effects', () => {
    const d = data();
    const movement = {
      id: 'a',
      date: '2026-09-15',
      amount: 100,
      savingsAmount: 100,
      assetId: 'savings',
      actorId: 'u1' as const,
      description: '',
      transactionId: null,
      operationId: 'op',
    };
    d.assetMovements = [
      movement,
      movement,
      { ...movement, id: 'b' },
      { ...movement, id: 'future', date: '2026-10-01' },
    ];
    expect(householdSavings(d, '2026-09-01', '2026-09-30')).toBe(200);
    expect(annualSeries(d, { ledgerId: 'main', startDate: '', endDate: '' }, 2026)[8].savings).toBe(
      200,
    );
  });
});
