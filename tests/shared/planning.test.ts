import { describe, expect, it } from 'vitest';
import {
  accountingPeriod,
  budgetSummary,
  payrollSummary,
  planActual,
  plannedBudget,
  planTransactions,
  scheduleOccurrences,
  weeklyActuals,
  type BudgetPlan,
  type GoalPlan,
  type PayrollPlan,
  type PlanningData,
  type SchedulePlan,
} from '../../src/shared/planning';
import type { Ledger, Tag, Transaction } from '../../src/shared/types';

const base = {
  id: 'p',
  ledgerId: 'main',
  title: '계획',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  amount: 1000,
  tagIds: [] as string[],
  ownerId: null,
  paymentMethodId: null,
  includeLinked: true,
  notes: '',
  archived: false,
  version: 1,
};
function budget(patch: Partial<BudgetPlan> = {}): BudgetPlan {
  return { ...base, kind: 'budget', cadence: 'month', budgetScope: 'total', ...patch };
}
function ledger(id: string, kind: Ledger['kind'], parentId: string | null = null): Ledger {
  return {
    id,
    name: id,
    kind,
    parentId,
    icon: '',
    budget: 900,
    startDate: null,
    endDate: null,
    archived: false,
    version: 1,
  };
}
function tx(id: string, patch: Partial<Transaction> = {}): Transaction {
  return {
    id,
    ledgerId: 'main',
    date: '2026-09-15',
    description: id,
    amount: 100,
    type: 'expense',
    ownerId: 'shared',
    paymentMethodId: 'cash',
    tagIds: [],
    allocations: [],
    version: 1,
    updatedAt: '',
    updatedBy: 'u1',
    ...patch,
  };
}
function tag(id: string, groupId: string): Tag {
  return { id, groupId, name: id, color: '#000000', sortOrder: 0, archived: false, version: 1 };
}
function data(patch: Partial<PlanningData> = {}): PlanningData {
  return {
    ledgers: [
      ledger('main', 'main'),
      ledger('trip', 'purpose', 'main'),
      ledger('other', 'purpose'),
    ],
    transactions: [],
    tags: [],
    tagGroups: [],
    assetMovements: [],
    ...patch,
  };
}

describe('planning periods and actuals', () => {
  it('supports plans on any subtree and composes deep mappings while keeping budgets independent', () => {
    const source = data({
      transactions: [
        tx('trip', { ledgerId: 'trip', amount: 200 }),
        tx('deep', { ledgerId: 'deep', amount: 300, tagIds: ['meal'] }),
      ],
      tags: [tag('food', 'category')],
      plans: [
        budget({ amount: 1000 }),
        budget({ id: 'child-budget', ledgerId: 'trip', amount: 5000 }),
      ],
    });
    source.ledgers.push(ledger('deep', 'purpose', 'trip'));
    source.ledgers[1].tagMappings = { travel: 'food' };
    source.ledgers[3].tagMappings = { meal: 'travel' };
    expect(planActual(source, budget({ ledgerId: 'trip' }))).toBe(500);
    expect(planActual(source, budget({ ledgerId: 'trip', includeLinked: false }))).toBe(200);
    expect(planActual(source, budget({ budgetScope: 'category', tagIds: ['food'] }))).toBe(300);
    expect(budgetSummary(source, 'main', '2026-09')).toMatchObject({ amount: 1000, expense: 500 });
    source.ledgers[1].parentId = 'other';
    expect(planActual(source, budget())).toBe(0);
    expect(planActual(source, budget({ ledgerId: 'other' }))).toBe(500);
    expect(plannedBudget(source, 'main', '2026-09')).toBe(1000);
  });
  it('uses the parent tag mapping in category budgets without altering child records', () => {
    const source = data({
      tags: [
        {
          id: 'food',
          name: '식비',
          groupId: 'g',
          color: '#000000',
          sortOrder: 0,
          archived: false,
          version: 1,
        },
      ],
      transactions: [tx('trip-cost', { ledgerId: 'trip', tagIds: ['meal'], amount: 300 })],
    });
    source.ledgers[1].tagMappings = { meal: 'food' };
    expect(planActual(source, budget({ budgetScope: 'category', tagIds: ['food'] }))).toBe(300);
    expect(planTransactions(source, budget({ tagIds: ['food'] }))[0].tagIds).toEqual(['meal']);
    expect(planActual(source, budget({ includeLinked: false, tagIds: ['food'] }))).toBe(0);
  });
  it('uses the workbook start-day convention, including February, leap years, and year changes', () => {
    expect(accountingPeriod('2026-02', 31)).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-30',
    });
    expect(accountingPeriod('2028-02', 29)).toEqual({
      startDate: '2028-02-29',
      endDate: '2028-03-28',
    });
    expect(accountingPeriod('2026-12', 25)).toEqual({
      startDate: '2026-12-25',
      endDate: '2027-01-24',
    });
    expect(() => accountingPeriod('2026-13')).toThrow();
    expect(() => accountingPeriod('2026-01', 0)).toThrow();
  });
  it('counts linked original transactions once, filters dates, and isolates purpose budgets', () => {
    const shared = tx('child', { ledgerId: 'trip', amount: 200 });
    const source = data({
      transactions: [
        tx('main'),
        shared,
        shared,
        tx('other', { ledgerId: 'other' }),
        tx('outside', { date: '2026-10-01' }),
      ],
    });
    expect(planActual(source, budget())).toBe(300);
    expect(planActual(source, budget({ includeLinked: false }))).toBe(100);
    expect(planActual(source, budget({ ledgerId: 'trip', includeLinked: false }))).toBe(200);
    source.ledgers[1].parentId = null;
    expect(planActual(source, budget())).toBe(100);
  });
  it('applies OR inside one tag group and AND across groups with owner and payment filters', () => {
    const source = data({
      tags: [tag('food', 'category'), tag('transport', 'category'), tag('fixed', 'detail')],
      transactions: [
        tx('a', { tagIds: ['food', 'fixed'], ownerId: 'u1' }),
        tx('b', { tagIds: ['transport', 'fixed'], ownerId: 'u1' }),
        tx('c', { tagIds: ['food'], ownerId: 'u1' }),
        tx('d', { tagIds: ['food', 'fixed'], ownerId: 'u2' }),
        tx('e', { tagIds: ['food', 'fixed'], ownerId: 'u1', paymentMethodId: 'card' }),
      ],
    });
    expect(
      planTransactions(
        source,
        budget({ tagIds: ['food', 'transport', 'fixed'], ownerId: 'u1', paymentMethodId: 'cash' }),
      ).map((t) => t.id),
    ).toEqual(['a', 'b']);
    expect(planActual(source, budget({ tagIds: ['missing'] }))).toBe(0);
  });
  it('partitions partial weeks without overlap and excludes income', () => {
    const source = data({
      transactions: [
        tx('start', { date: '2026-09-01' }),
        tx('boundary', { date: '2026-09-07' }),
        tx('next', { date: '2026-09-08' }),
        tx('last', { date: '2026-09-30' }),
        tx('income', { type: 'income', amount: 999 }),
      ],
    });
    const weeks = weeklyActuals(source, budget());
    expect(weeks.map((week) => week.amount)).toEqual([200, 100, 0, 0, 100]);
    expect(weeks[4]).toEqual({ startDate: '2026-09-29', endDate: '2026-09-30', amount: 100 });
  });
  it('uses configured monthly total without double-adding category, weekly, or linked child budgets', () => {
    const source = data({
      plans: [
        budget(),
        budget({ id: 'category', budgetScope: 'category', tagIds: ['food'], amount: 300 }),
        budget({ id: 'week', cadence: 'week', endDate: '2026-09-07', amount: 200 }),
        budget({ id: 'child', ledgerId: 'trip', amount: 800 }),
      ],
    });
    expect(plannedBudget(source, 'main', '2026-09')).toBe(1000);
    expect(plannedBudget(source, 'main', '2026-10')).toBe(900);
    source.plans![0].archived = true;
    expect(plannedBudget(source, 'main', '2026-09')).toBe(900);
  });
  it('matches custom accounting periods and preserves independent purpose total-period budgets', () => {
    const source = data({
      plans: [
        budget({ ...accountingPeriod('2026-09', 25), amount: 1200 }),
        budget({
          id: 'trip',
          ledgerId: 'trip',
          cadence: 'period',
          startDate: '2026-09-03',
          endDate: '2026-09-10',
          amount: 800,
        }),
      ],
    });
    (source.ledgers[0] as Ledger & { periodStartDay: number }).periodStartDay = 25;
    expect(plannedBudget(source, 'main', '2026-09')).toBe(1200);
    expect(plannedBudget(source, 'trip', '2026-09')).toBe(800);
  });
  it('compares purpose monthly and period budgets with the matching actual date range', () => {
    const source = data({
      transactions: [
        tx('aug', { ledgerId: 'trip', date: '2026-08-31', amount: 70 }),
        tx('sep', { ledgerId: 'trip', amount: 130 }),
      ],
      plans: [budget({ ledgerId: 'trip', amount: 500 })],
    });
    expect(budgetSummary(source, 'trip', '2026-09')).toMatchObject({
      amount: 500,
      expense: 130,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    source.plans = [
      budget({ ledgerId: 'trip', cadence: 'period', startDate: '2026-08-25', amount: 800 }),
    ];
    expect(budgetSummary(source, 'trip', '2026-09')).toMatchObject({
      amount: 800,
      expense: 200,
      periodStart: '2026-08-25',
      periodEnd: '2026-09-30',
    });
    source.plans = [];
    source.ledgers[1].startDate = '2026-08-25';
    source.ledgers[1].endDate = '2026-09-30';
    expect(budgetSummary(source, 'trip', '2026-09')).toMatchObject({
      amount: 900,
      expense: 200,
      label: '전체 기간 예산',
      periodStart: '2026-08-25',
      periodEnd: '2026-09-30',
    });
  });
  it('uses configured dates for period budgets and keeps unbounded ledgers monthly by default', () => {
    const source = data({
      transactions: [
        tx('old', { date: '2025-12-31' }),
        tx('this-month'),
        tx('next-month', { date: '2026-10-01' }),
      ],
    });
    source.ledgers[0].startDate = '2026-01-01';
    source.ledgers[0].endDate = '2026-12-31';
    expect(budgetSummary(source, 'main', '2026-09', { period: 'period' })).toMatchObject({
      expense: 200,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    expect(budgetSummary(source, 'main', '2026-09', { period: 'year' })).toMatchObject({
      amount: 0,
      hasBudget: false,
      expense: 200,
      label: '2026 연간 예산',
    });
    expect(budgetSummary(source, 'main', '2026-09', { period: 'month' })).toMatchObject({
      expense: 100,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    source.ledgers[0].startDate = null;
    source.ledgers[0].endDate = null;
    expect(budgetSummary(source, 'main', '2026-09')).toMatchObject({
      expense: 100,
      label: '2026-09 예산',
    });
  });
  it('requires an exact annual plan instead of treating a monthly, child, or legacy budget as annual', () => {
    const source = data({
      transactions: [tx('january', { date: '2026-01-01' }), tx('september')],
      plans: [
        budget({ amount: 1000 }),
        budget({
          id: 'child-annual',
          ledgerId: 'trip',
          cadence: 'period',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          amount: 8000,
        }),
        budget({
          id: 'partial-period',
          cadence: 'period',
          startDate: '2026-01-01',
          endDate: '2026-11-30',
          amount: 2000,
        }),
      ],
    });
    expect(budgetSummary(source, 'main', '2026-09', { period: 'year' })).toMatchObject({
      amount: 0,
      hasBudget: false,
      expense: 200,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    expect(budgetSummary(source, 'main', '2026-09')).toMatchObject({
      amount: 1000,
      hasBudget: true,
    });
    const annual = budget({
      id: 'annual',
      cadence: 'period',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      amount: 12000,
    });
    source.plans!.push(annual);
    expect(budgetSummary(source, 'main', '2026-09', { period: 'year' })).toMatchObject({
      amount: 12000,
      hasBudget: true,
      expense: 200,
    });
    annual.amount = 0;
    expect(budgetSummary(source, 'main', '2026-09', { period: 'year' })).toMatchObject({
      amount: 0,
      hasBudget: true,
    });
    annual.archived = true;
    expect(budgetSummary(source, 'main', '2026-09', { period: 'year' })).toMatchObject({
      amount: 0,
      hasBudget: false,
    });
  });
  it('calculates payroll floor/ceiling allocations and shows overspending without creating records', () => {
    const payroll: PayrollPlan = {
      ...base,
      kind: 'payroll',
      amount: 3456789,
      rounding: 'floor10000',
      lines: [
        {
          id: 'interest',
          title: '이자',
          amount: 234567,
          rounding: 'ceil10000',
          purpose: 'expense',
          assetId: null,
        },
        {
          id: 'savings',
          title: '적금',
          amount: 3000000,
          rounding: 'none',
          purpose: 'savings',
          assetId: 'deposit',
        },
      ],
    };
    expect(payrollSummary(payroll)).toMatchObject({
      available: 3450000,
      allocated: 3240000,
      remaining: 210000,
    });
    expect(payrollSummary({ ...payroll, amount: 1000000 }).remaining).toBe(-2240000);
    const source = data({ transactions: [tx('pay', { type: 'income', amount: 3456789 })] });
    const before = JSON.stringify(source);
    expect(planActual(source, payroll)).toBe(3456789);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('tracks savings targets from recorded savings effects, not balances or expense totals', () => {
    const goal: GoalPlan = {
      ...base,
      kind: 'goal',
      metric: 'savings',
      direction: 'atLeast',
      assetId: null,
    };
    const effect = (id: string, assetId: string, savingsAmount: number) => ({
      id,
      assetId,
      transactionId: null,
      operationId: 'op',
      date: '2026-09-10',
      description: '',
      amount: 999999,
      savingsAmount,
      actorId: 'u1',
    });
    const one = effect('one', 'deposit', 500);
    const source = data({
      assetMovements: [
        one,
        one,
        effect('two', 'deposit', -100),
        effect('three', 'other', 200),
        effect('adjustment', 'deposit', 0),
      ],
    });
    expect(planActual(source, goal)).toBe(600);
    expect(planActual(source, { ...goal, assetId: 'deposit' })).toBe(400);
    // A savings goal always uses household asset effects, even on a nested or moved ledger.
    expect(planActual(source, { ...goal, ledgerId: 'trip', includeLinked: false })).toBe(600);
    source.ledgers[1].parentId = 'other';
    expect(planActual(source, { ...goal, ledgerId: 'trip', includeLinked: true })).toBe(600);
  });
  it('keeps manual event actuals separate from expense transactions', () => {
    const source = data({ transactions: [tx('expense')] });
    expect(
      planActual(source, {
        ...base,
        kind: 'event',
        actualMode: 'manual',
        actualAmount: 750,
        evaluation: '',
      }),
    ).toBe(750);
    expect(
      planActual(source, {
        ...base,
        kind: 'event',
        actualMode: 'transactions',
        actualAmount: null,
        evaluation: '',
      }),
    ).toBe(100);
    expect(source.transactions).toHaveLength(1);
  });
  it('clamps recurring payment dates to month end and associates manual payment confirmation once', () => {
    const schedule: SchedulePlan = {
      ...base,
      kind: 'schedule',
      repeat: 'monthly',
      startDate: '2026-01-31',
      endDate: '2026-04-30',
      payments: [{ date: '2026-02-28', paidDate: '2026-03-02', amount: 1100, note: '확인' }],
    };
    expect(scheduleOccurrences(schedule).map((o) => o.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(scheduleOccurrences(schedule, '2026-02')[0].payment?.amount).toBe(1100);
    expect(scheduleOccurrences(schedule, '2026-05')).toEqual([]);
    expect(planActual(data(), schedule)).toBe(1100);
    expect(scheduleOccurrences({ ...schedule, startDate: '' })).toEqual([]);
  });
});
