import { accountingPeriod } from './planning';
import { ALL_LEDGERS_ID, ledgerDescendantIds } from './hierarchy';
import type { Bootstrap, PaymentMethod, Tag, Transaction } from './types';

interface CalendarMonth {
  year: number;
  month: number;
}

function parseMonth(value: string): CalendarMonth {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0, 4)) < 1) {
    throw new RangeError('월은 YYYY-MM 형식이어야 합니다.');
  }
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

function shiftMonth(value: CalendarMonth, offset: number): CalendarMonth {
  const index = value.year * 12 + value.month - 1 + offset;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

function daysInMonth({ year, month }: CalendarMonth): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function dateAt(month: CalendarMonth, day: number): string {
  return `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}

function uniqueTransactions(transactions: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  return transactions.filter((transaction) => {
    if (seen.has(transaction.id)) return false;
    seen.add(transaction.id);
    return true;
  });
}

/** Preserve source order and count each original transaction once. */
export function visibleTransactions(
  data: Bootstrap,
  ledgerId: string,
  month: string,
  options: { includeDescendants?: boolean; period?: 'month' | 'year' | 'period' } = {},
): Transaction[] {
  parseMonth(month);
  const ledger = data.ledgers.find((item) => item.id === ledgerId);
  if (!ledger && ledgerId !== ALL_LEDGERS_ID) return [];
  const ledgerIds =
    options.includeDescendants === false
      ? new Set([ledgerId])
      : ledgerDescendantIds(data.ledgers, ledgerId);
  const period =
    options.period === 'year'
      ? { startDate: `${month.slice(0, 4)}-01-01`, endDate: `${month.slice(0, 4)}-12-31` }
      : options.period === 'period'
        ? { startDate: ledger?.startDate ?? '0001-01-01', endDate: ledger?.endDate ?? '9999-12-31' }
        : accountingPeriod(month, ledger?.periodStartDay ?? 1);
  return uniqueTransactions(
    data.transactions.filter(
      (transaction) =>
        (ledgerId === ALL_LEDGERS_ID || ledgerIds.has(transaction.ledgerId)) &&
        transaction.date >= period.startDate &&
        transaction.date <= period.endDate,
    ),
  );
}

export function totals(transactions: Transaction[]): {
  income: number;
  expense: number;
} {
  const result = { income: 0, expense: 0 };
  for (const transaction of uniqueTransactions(transactions))
    result[transaction.type] += transaction.amount;
  return result;
}

/** Resolve historical selections too; archiving prevents new selection, not past display. */
export function tagsForTransaction(data: Bootstrap, transaction: Transaction): Tag[] {
  const groups = new Map(
    data.tagGroups
      .filter((group) => group.appliesTo === 'transaction')
      .map((group) => [group.id, group]),
  );
  const selected = new Set(transaction.tagIds);
  return data.tags
    .filter((tag) => selected.has(tag.id) && groups.has(tag.groupId))
    .sort(
      (a, b) =>
        groups.get(a.groupId)!.sortOrder - groups.get(b.groupId)!.sortOrder ||
        a.groupId.localeCompare(b.groupId) ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id),
    );
}

export function categoryNames(data: Bootstrap, transaction: Transaction): string[] {
  const categoryGroups = new Set(
    data.tagGroups.filter((group) => group.role === 'category').map((group) => group.id),
  );
  return tagsForTransaction(data, transaction)
    .filter((tag) => categoryGroups.has(tag.groupId))
    .map((tag) => tag.name);
}

/** Use the effect recorded at save time, not today's asset tags or savings settings. */
export function savingsSummary(
  data: Bootstrap,
  month: string,
): {
  inflow: number;
  outflow: number;
  net: number;
} {
  parseMonth(month);
  const seen = new Set<string>();
  let inflow = 0;
  let outflow = 0;
  for (const movement of data.assetMovements) {
    if (seen.has(movement.id)) continue;
    seen.add(movement.id);
    if (!movement.date.startsWith(`${month}-`)) continue;
    if (movement.savingsAmount > 0) inflow += movement.savingsAmount;
    else outflow -= movement.savingsAmount;
  }
  return { inflow, outflow, net: inflow - outflow };
}

/** OR within a group, AND between groups. Unknown selections fail closed. */
export function tagFilteredTransactions(
  data: Bootstrap,
  transactions: Transaction[],
  selectedIds: string[],
): Transaction[] {
  const groups = new Set(
    data.tagGroups.filter((group) => group.appliesTo === 'transaction').map((group) => group.id),
  );
  const tags = new Map(data.tags.map((tag) => [tag.id, tag]));
  const selectedGroups = new Map<string, Set<string>>();
  for (const id of selectedIds) {
    const tag = tags.get(id);
    if (!tag || !groups.has(tag.groupId)) return [];
    const selection = selectedGroups.get(tag.groupId) ?? new Set<string>();
    selection.add(id);
    selectedGroups.set(tag.groupId, selection);
  }
  return uniqueTransactions(transactions).filter((transaction) =>
    [...selectedGroups.values()].every((selection) =>
      transaction.tagIds.some((id) => selection.has(id)),
    ),
  );
}

export interface TagGroupBreakdownItem {
  tagId: string | null;
  name: string;
  color: string;
  amount: number;
  count: number;
}

/**
 * Each expense contributes once to each matching option, so multiple selections can
 * make option totals exceed the unique expense total. The last row is unclassified.
 * Zero-value and archived options remain available for a stable historical display.
 */
export function tagGroupBreakdown(
  data: Bootstrap,
  transactions: Transaction[],
  groupId: string,
): TagGroupBreakdownItem[] {
  if (!data.tagGroups.some((group) => group.id === groupId && group.appliesTo === 'transaction')) {
    return [];
  }
  const options: TagGroupBreakdownItem[] = data.tags
    .filter((tag) => tag.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((tag) => ({ tagId: tag.id, name: tag.name, color: tag.color, amount: 0, count: 0 }));
  const byId = new Map(options.map((option) => [option.tagId, option]));
  const uncategorized: TagGroupBreakdownItem = {
    tagId: null,
    name: '미분류',
    color: '#a5ad9f',
    amount: 0,
    count: 0,
  };
  for (const transaction of uniqueTransactions(transactions)) {
    if (transaction.type !== 'expense') continue;
    let classified = false;
    for (const id of new Set(transaction.tagIds)) {
      const option = byId.get(id);
      if (!option) continue;
      option.amount += transaction.amount;
      option.count += 1;
      classified = true;
    }
    if (!classified) {
      uncategorized.amount += transaction.amount;
      uncategorized.count += 1;
    }
  }
  return [...options, uncategorized];
}

/**
 * Estimate a statement from original household transactions, independent of ledger links.
 * The closing date must be strictly before the payment date: same-day closing belongs
 * to the next statement. Both dates clamp to the month's last day before comparison.
 * The range includes the day after the previous closing date through this closing date.
 * Installments, cancellations, carryovers, and bank-holiday adjustments are not modeled.
 */
export function cardStatement(
  transactions: Transaction[],
  payment: PaymentMethod,
  billingMonth: string,
): {
  amount: number;
  startDate: string;
  endDate: string;
  paymentDate: string;
  transactions: Transaction[];
} {
  const month = parseMonth(billingMonth);
  const { closingDay, paymentDay } = payment;
  if (
    payment.type !== 'card' ||
    closingDay === null ||
    paymentDay === null ||
    !Number.isInteger(closingDay) ||
    closingDay < 1 ||
    closingDay > 31 ||
    !Number.isInteger(paymentDay) ||
    paymentDay < 1 ||
    paymentDay > 31
  ) {
    throw new RangeError('카드의 마감일과 납부일을 1~31 사이의 정수로 설정해 주세요.');
  }

  const paymentDate = dateAt(month, paymentDay);
  const closingMonth = dateAt(month, closingDay) < paymentDate ? month : shiftMonth(month, -1);
  const endDate = dateAt(closingMonth, closingDay);
  const previousMonth = shiftMonth(closingMonth, -1);
  const previousClosingDay = Math.min(closingDay, daysInMonth(previousMonth));
  const startDate =
    previousClosingDay === daysInMonth(previousMonth)
      ? dateAt(closingMonth, 1)
      : dateAt(previousMonth, previousClosingDay + 1);
  const statementTransactions = uniqueTransactions(
    transactions.filter(
      (transaction) =>
        transaction.paymentMethodId === payment.id &&
        transaction.type === 'expense' &&
        transaction.date >= startDate &&
        transaction.date <= endDate,
    ),
  );

  return {
    amount: totals(statementTransactions).expense,
    startDate,
    endDate,
    paymentDate,
    transactions: statementTransactions,
  };
}
