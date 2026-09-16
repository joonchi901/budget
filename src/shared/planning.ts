import type { Bootstrap, OwnerId, Transaction } from './types';
import { transactionForLedger } from './classification';

export type PlanKind = 'budget' | 'goal' | 'payroll' | 'event' | 'schedule';
export type Rounding = 'none' | 'floor10000' | 'ceil10000';
interface PlanBase {
  id: string;
  kind: PlanKind;
  ledgerId: string;
  title: string;
  startDate: string;
  endDate: string;
  amount: number;
  tagIds: string[];
  paymentMethodId: string | null;
  ownerId: OwnerId | null;
  includeLinked: boolean;
  notes: string;
  archived: boolean;
  version: number;
}
export interface BudgetPlan extends PlanBase {
  kind: 'budget';
  cadence: 'month' | 'week' | 'period';
  budgetScope: 'total' | 'category';
}
export interface GoalPlan extends PlanBase {
  kind: 'goal';
  metric: 'income' | 'expense' | 'savings';
  direction: 'atLeast' | 'atMost';
  assetId: string | null;
}
export interface PayrollLine {
  id: string;
  title: string;
  amount: number;
  rounding: Rounding;
  purpose: 'expense' | 'savings' | 'other';
  assetId: string | null;
}
export interface PayrollPlan extends PlanBase {
  kind: 'payroll';
  rounding: Rounding;
  lines: PayrollLine[];
}
export interface EventPlan extends PlanBase {
  kind: 'event';
  actualMode: 'transactions' | 'manual';
  actualAmount: number | null;
  evaluation: string;
}
export interface SchedulePayment {
  date: string;
  paidDate: string;
  amount: number;
  note: string;
}
export interface SchedulePlan extends PlanBase {
  kind: 'schedule';
  repeat: 'once' | 'monthly';
  payments: SchedulePayment[];
}
export type Plan = BudgetPlan | GoalPlan | PayrollPlan | EventPlan | SchedulePlan;
export type PlanInput = Plan extends infer P
  ? P extends Plan
    ? Omit<P, 'id' | 'version'>
    : never
  : never;
export type PlanningData = Pick<
  Bootstrap,
  'ledgers' | 'transactions' | 'tags' | 'tagGroups' | 'assetMovements'
> & { plans?: Plan[] };

const dayMs = 86_400_000;
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function utcDate(year: number, month: number, day: number) {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function monthParts(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1)
    throw new RangeError('월 형식을 확인해 주세요.');
  return [Number(month.slice(0, 4)), Number(month.slice(5)) - 1] as const;
}
/** Mirrors the workbook: a nonexistent monthly start day becomes next month's first day. */
export function accountingPeriod(month: string, startDay = 1) {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31)
    throw new RangeError('월 시작일은 1~31입니다.');
  const [year, index] = monthParts(month);
  const startAt = (offset: number) => {
    const last = utcDate(year, index + offset + 1, 0).getUTCDate();
    return utcDate(
      year,
      index + offset + (last < startDay ? 1 : 0),
      last < startDay ? 1 : startDay,
    );
  };
  return { startDate: iso(startAt(0)), endDate: iso(new Date(startAt(1).getTime() - dayMs)) };
}
export function roundPlanAmount(amount: number, rounding: Rounding) {
  return rounding === 'floor10000'
    ? Math.floor(amount / 10000) * 10000
    : rounding === 'ceil10000'
      ? Math.ceil(amount / 10000) * 10000
      : amount;
}
export function payrollSummary(plan: PayrollPlan) {
  const available = roundPlanAmount(plan.amount, plan.rounding);
  const lines = plan.lines.map((line) => ({
    ...line,
    allocated: roundPlanAmount(line.amount, line.rounding),
  }));
  const allocated = lines.reduce((sum, line) => sum + line.allocated, 0);
  return { available, allocated, remaining: available - allocated, lines };
}
export function planTransactions(data: PlanningData, plan: Plan): Transaction[] {
  const ids = new Set([plan.ledgerId]);
  if (plan.includeLinked && data.ledgers.find((l) => l.id === plan.ledgerId)?.kind === 'main')
    data.ledgers.filter((l) => l.parentId === plan.ledgerId).forEach((l) => ids.add(l.id));
  const seen = new Set<string>();
  const groups = new Map<string, Set<string>>();
  for (const id of plan.tagIds) {
    const tag = data.tags.find((t) => t.id === id);
    if (!tag) return [];
    const selected = groups.get(tag.groupId) ?? new Set<string>();
    selected.add(id);
    groups.set(tag.groupId, selected);
  }
  return data.transactions.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    const classified = transactionForLedger(data.ledgers, plan.ledgerId, t);
    return (
      ids.has(t.ledgerId) &&
      t.date >= plan.startDate &&
      t.date <= plan.endDate &&
      (!plan.ownerId || t.ownerId === plan.ownerId) &&
      (!plan.paymentMethodId || t.paymentMethodId === plan.paymentMethodId) &&
      [...groups.values()].every((selected) => classified.tagIds.some((id) => selected.has(id)))
    );
  });
}
export function planActual(data: PlanningData, plan: Plan): number {
  if (plan.kind === 'event' && plan.actualMode === 'manual') return plan.actualAmount ?? 0;
  if (plan.kind === 'schedule') return plan.payments.reduce((sum, p) => sum + p.amount, 0);
  if (plan.kind === 'goal' && plan.metric === 'savings') {
    const seen = new Set<string>();
    return data.assetMovements.reduce((sum, m) => {
      if (seen.has(m.id)) return sum;
      seen.add(m.id);
      return (
        sum +
        (m.date >= plan.startDate &&
        m.date <= plan.endDate &&
        (!plan.assetId || m.assetId === plan.assetId)
          ? m.savingsAmount
          : 0)
      );
    }, 0);
  }
  const type = plan.kind === 'payroll' ? 'income' : plan.kind === 'goal' ? plan.metric : 'expense';
  return planTransactions(data, plan)
    .filter((t) => t.type === type)
    .reduce((sum, t) => sum + t.amount, 0);
}
/** Total budget only: category and weekly budgets are separate ceilings and must never be added twice. */
export function budgetSummary(data: PlanningData, ledgerId: string, month: string) {
  const ledger = data.ledgers.find((l) => l.id === ledgerId);
  const period = accountingPeriod(
    month,
    (ledger as { periodStartDay?: number } | undefined)?.periodStartDay ?? 1,
  );
  const budgets = (data.plans ?? []).filter(
    (p): p is BudgetPlan =>
      p.kind === 'budget' &&
      !p.archived &&
      p.ledgerId === ledgerId &&
      p.budgetScope === 'total' &&
      !p.ownerId &&
      !p.paymentMethodId &&
      !p.tagIds.length,
  );
  const monthly = budgets.find(
    (p) =>
      p.cadence === 'month' && p.startDate === period.startDate && p.endDate === period.endDate,
  );
  const purpose =
    ledger?.kind === 'purpose'
      ? budgets.find(
          (p) =>
            p.cadence === 'period' &&
            p.startDate <= period.endDate &&
            p.endDate >= period.startDate,
        )
      : undefined;
  const selected = monthly ?? purpose;
  const fallback: BudgetPlan = {
    id: '',
    kind: 'budget',
    version: 0,
    archived: false,
    ledgerId,
    title: '',
    amount: ledger?.budget ?? 0,
    cadence: ledger?.kind === 'purpose' ? 'period' : 'month',
    budgetScope: 'total',
    tagIds: [],
    ownerId: null,
    paymentMethodId: null,
    includeLinked: ledger?.kind === 'main',
    notes: '',
    startDate: ledger?.kind === 'purpose' ? '0001-01-01' : period.startDate,
    endDate: ledger?.kind === 'purpose' ? '9999-12-31' : period.endDate,
  };
  const plan = selected ?? fallback;
  return {
    amount: plan.amount,
    expense: planActual(data, plan),
    label: plan.cadence === 'month' ? `${month} 예산` : '전체 기간 예산',
    periodStart: plan.startDate,
    periodEnd: plan.endDate,
  };
}
export function plannedBudget(data: PlanningData, ledgerId: string, month: string): number {
  return budgetSummary(data, ledgerId, month).amount;
}
/** Seven-day blocks anchored to the plan's start date; every day belongs to exactly one block. */
export function weeklyActuals(data: PlanningData, plan: Plan) {
  const rows = planTransactions(data, plan).filter((t) => t.type === 'expense');
  const weeks: { startDate: string; endDate: string; amount: number }[] = [];
  for (
    let date = new Date(`${plan.startDate}T00:00:00Z`);
    iso(date) <= plan.endDate;
    date = new Date(date.getTime() + 7 * dayMs)
  ) {
    const startDate = iso(date),
      endDate = [iso(new Date(date.getTime() + 6 * dayMs)), plan.endDate].sort()[0];
    weeks.push({
      startDate,
      endDate,
      amount: rows
        .filter((t) => t.date >= startDate && t.date <= endDate)
        .reduce((sum, t) => sum + t.amount, 0),
    });
  }
  return weeks;
}
export function scheduleOccurrences(plan: SchedulePlan, month?: string) {
  if (
    ![plan.startDate, plan.endDate].every(
      (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) >= 1,
    ) ||
    plan.startDate > plan.endDate
  )
    return [];
  const range = month
    ? accountingPeriod(month)
    : { startDate: plan.startDate, endDate: plan.endDate };
  const dates: string[] = [];
  if (plan.repeat === 'once') dates.push(plan.startDate);
  else {
    let [year, index] = monthParts(
      (range.startDate > plan.startDate ? range.startDate : plan.startDate).slice(0, 7),
    );
    const day = Number(plan.startDate.slice(8));
    for (let i = 0; i < 1200; i++, index++) {
      const last = utcDate(year, index + 1, 0).getUTCDate();
      const due = iso(utcDate(year, index, Math.min(day, last)));
      if (due > plan.endDate || due > range.endDate) break;
      if (due >= plan.startDate) dates.push(due);
    }
  }
  return dates
    .filter((d) => d >= range.startDate && d <= range.endDate)
    .map((date) => ({
      date,
      amount: plan.amount,
      payment: plan.payments.find((p) => p.date === date) ?? null,
    }));
}
