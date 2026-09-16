import type { Bootstrap, PaymentMethod, Transaction } from './types';

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
): Transaction[] {
  parseMonth(month);
  const ledger = data.ledgers.find((item) => item.id === ledgerId);
  if (!ledger) return [];

  const ledgerIds = new Set([ledgerId]);
  if (ledger.kind === 'main') {
    for (const child of data.ledgers) {
      if (child.kind === 'purpose' && child.parentId === ledgerId) ledgerIds.add(child.id);
    }
  }
  return uniqueTransactions(
    data.transactions.filter(
      (transaction) =>
        ledgerIds.has(transaction.ledgerId) && transaction.date.startsWith(`${month}-`),
    ),
  );
}

export function totals(transactions: Transaction[]): {
  income: number;
  expense: number;
  saving: number;
  transfer: number;
} {
  const result = { income: 0, expense: 0, saving: 0, transfer: 0 };
  for (const transaction of uniqueTransactions(transactions))
    result[transaction.type] += transaction.amount;
  return result;
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
