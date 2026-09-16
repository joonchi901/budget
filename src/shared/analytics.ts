import type { Bootstrap, Transaction } from './types';
import { transactionForLedger } from './classification';
import { accountingPeriod } from './planning';
import { tagFilteredTransactions, totals } from './selectors';

const uniqueTransactions = (rows: Transaction[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

export interface AnalysisFilter {
  ledgerId: string;
  sourceLedgerId?: string;
  startDate: string;
  endDate: string;
  ownerId?: string;
  paymentMethodId?: string;
  assetId?: string;
  tagIds?: string[];
  type?: string;
  search?: string;
}
/** Mapping is a view over source tags. It never rewrites a transaction or its money. */
export function mappedTransaction(data: Bootstrap, ledgerId: string, tx: Transaction): Transaction {
  return transactionForLedger(data.ledgers, ledgerId, tx);
}
export function analysisTransactions(data: Bootstrap, filter: AnalysisFilter): Transaction[] {
  const ledger = data.ledgers.find((l) => l.id === filter.ledgerId);
  const ids = new Set([
    filter.ledgerId,
    ...(ledger?.kind === 'main'
      ? data.ledgers.filter((l) => l.parentId === ledger.id).map((l) => l.id)
      : []),
  ]);
  const rows = data.transactions
    .filter(
      (tx) =>
        ids.has(tx.ledgerId) &&
        (!filter.sourceLedgerId || tx.ledgerId === filter.sourceLedgerId) &&
        tx.date >= filter.startDate &&
        tx.date <= filter.endDate &&
        (!filter.ownerId || tx.ownerId === filter.ownerId) &&
        (!filter.paymentMethodId || tx.paymentMethodId === filter.paymentMethodId) &&
        (!filter.assetId || tx.allocations.some((a) => a.assetId === filter.assetId)) &&
        (!filter.type || tx.type === filter.type) &&
        (!filter.search ||
          tx.description.toLocaleLowerCase().includes(filter.search.toLocaleLowerCase())),
    )
    .map((tx) => mappedTransaction(data, filter.ledgerId, tx));
  return tagFilteredTransactions(data, rows, filter.tagIds ?? []).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}
export function dailySeries(
  data: Bootstrap,
  rows: Transaction[],
  startDate: string,
  endDate: string,
  ledgerId: string,
) {
  const fixed = new Set(data.ledgers.find((l) => l.id === ledgerId)?.fixedExpenseTagIds ?? []);
  const unique = uniqueTransactions(rows);
  const result: {
    date: string;
    income: number;
    expense: number;
    variableExpense: number;
    cumulative: number;
  }[] = [];
  let cumulative = 0;
  const last = Date.parse(`${endDate}T00:00:00Z`);
  for (let time = Date.parse(`${startDate}T00:00:00Z`); time <= last; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const day = unique.filter((tx) => tx.date === date);
    const sum = totals(day);
    cumulative += sum.expense;
    result.push({
      date,
      ...sum,
      variableExpense: day
        .filter((tx) => tx.type === 'expense' && !tx.tagIds.some((id) => fixed.has(id)))
        .reduce((s, tx) => s + tx.amount, 0),
      cumulative,
    });
  }
  return result;
}
export function analysisYearPeriods(data: Bootstrap, ledgerId: string, year: number) {
  const startDay = data.ledgers.find((l) => l.id === ledgerId)?.periodStartDay ?? 1;
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${String(year).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`;
    return { month, ...accountingPeriod(month, startDay) };
  });
}
export function householdSavings(data: Bootstrap, startDate: string, endDate: string) {
  const seen = new Set<string>();
  return data.assetMovements.reduce((sum, movement) => {
    if (seen.has(movement.id)) return sum;
    seen.add(movement.id);
    return (
      sum + (movement.date >= startDate && movement.date <= endDate ? movement.savingsAmount : 0)
    );
  }, 0);
}
/** Annual comparisons use the selected year's accounting periods, independent of the detail date range. */
export function annualSeries(data: Bootstrap, filter: AnalysisFilter, year: number) {
  return analysisYearPeriods(data, filter.ledgerId, year).map(({ month, ...range }) => {
    const tx = analysisTransactions(data, { ...filter, ...range });
    const savings = householdSavings(data, range.startDate, range.endDate);
    // Savings always describes the household; transaction filters do not relabel it.
    const householdIncome = totals(
      data.transactions.filter((t) => t.date >= range.startDate && t.date <= range.endDate),
    ).income;
    return {
      month,
      ...range,
      ...totals(tx),
      savings,
      savingsRate: householdIncome ? savings / householdIncome : null,
    };
  });
}
export function groupedAnalysis(data: Bootstrap, rows: Transaction[], groupId: string) {
  const unique = uniqueTransactions(rows);
  const tags = data.tags
    .filter((t) => t.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = tags.map((tag) => ({
    id: tag.id,
    name: analysisTagName(data, tag.id),
    ...analysisMetrics(unique.filter((tx) => tx.tagIds.includes(tag.id))),
  }));
  const missing = unique.filter((tx) => !tags.some((t) => tx.tagIds.includes(t.id)));
  return [...groups, { id: '', name: '미분류', ...analysisMetrics(missing) }];
}
export function analysisTagName(data: Bootstrap, tagId: string): string {
  const names: string[] = [],
    seen = new Set<string>();
  let tag = data.tags.find((option) => option.id === tagId);
  while (tag && !seen.has(tag.id)) {
    seen.add(tag.id);
    names.unshift(tag.name);
    tag = data.tags.find((option) => option.id === tag!.parentId);
  }
  return names.join(' / ');
}
function analysisMetrics(rows: Transaction[]) {
  const unique = uniqueTransactions(rows);
  return { ...totals(unique), count: unique.length };
}
export function analysisOptionRows(
  data: Bootstrap,
  rows: Transaction[],
  groupId: string,
  optionId: string,
) {
  const tags = new Set(data.tags.filter((tag) => tag.groupId === groupId).map((tag) => tag.id));
  return uniqueTransactions(rows).filter((tx) =>
    optionId ? tx.tagIds.includes(optionId) : !tx.tagIds.some((id) => tags.has(id)),
  );
}
/** Each tag option may repeat a transaction; the separate overall row always uses unique records. */
export function annualTagMatrix(
  data: Bootstrap,
  filter: AnalysisFilter,
  year: number,
  groupId: string,
  asOf: string,
) {
  const periods = analysisYearPeriods(data, filter.ledgerId, year);
  const rows = analysisTransactions(data, {
    ...filter,
    startDate: periods[0].startDate,
    endDate: periods[11].endDate,
  });
  const elapsedPeriods = periods.filter((period) => period.startDate <= asOf).length;
  const summarize = (transactions: Transaction[]) => ({
    months: periods.map((period) =>
      analysisMetrics(
        transactions.filter((tx) => tx.date >= period.startDate && tx.date <= period.endDate),
      ),
    ),
    total: analysisMetrics(transactions),
    average: (() => {
      const elapsed = totals(transactions.filter((tx) => tx.date <= asOf));
      return {
        income: elapsedPeriods ? elapsed.income / elapsedPeriods : null,
        expense: elapsedPeriods ? elapsed.expense / elapsedPeriods : null,
      };
    })(),
  });
  const groups = groupedAnalysis(data, rows, groupId).map(({ id, name }) => ({
    id,
    name,
    ...summarize(analysisOptionRows(data, rows, groupId, id)),
  }));
  return { periods, rows, elapsedPeriods, groups, overall: summarize(rows) };
}
export function paymentAnalysis(data: Bootstrap, rows: Transaction[]) {
  const unique = uniqueTransactions(rows);
  const ids = [
    ...new Set([
      ...data.paymentMethods.map((payment) => payment.id),
      ...unique.map((row) => row.paymentMethodId),
    ]),
  ];
  return ids.map((id) => {
    const payment = data.paymentMethods.find((method) => method.id === id);
    return {
      id,
      name: payment ? `${payment.name}${payment.archived ? ' (보관)' : ''}` : '알 수 없는 결제수단',
      ...analysisMetrics(unique.filter((row) => row.paymentMethodId === id)),
    };
  });
}
export function ledgerAnalysis(data: Bootstrap, rows: Transaction[], ledgerId: string) {
  const unique = uniqueTransactions(rows);
  const viewer = data.ledgers.find((ledger) => ledger.id === ledgerId);
  const expense = totals(unique).expense;
  return data.ledgers
    .filter(
      (ledger) =>
        ledger.id === ledgerId || (viewer?.kind === 'main' && ledger.parentId === ledgerId),
    )
    .map((ledger) => {
      const summary = analysisMetrics(unique.filter((tx) => tx.ledgerId === ledger.id));
      return {
        id: ledger.id,
        name: `${ledger.name}${ledger.id === ledgerId && viewer?.kind === 'main' ? ' · 직접 기록' : ''}${ledger.archived ? ' (보관)' : ''}`,
        ...summary,
        expenseShare: expense ? summary.expense / expense : null,
      };
    });
}
export function transactionsCsv(data: Bootstrap, rows: Transaction[]) {
  // Spreadsheet formula injection is possible in labels entered by another editor.
  const cell = (v: unknown) =>
    `"${String(v ?? '')
      .replace(/^[=+@\-\t\r]/, (m) => `'${m}`)
      .replaceAll('"', '""')}"`;
  const lines = [
    [
      'ID',
      '날짜',
      '가계부',
      '종류',
      '내용',
      '금액(원)',
      '귀속',
      '결제수단',
      '태그',
      '자산 배분(원)',
    ],
    ...rows.map((t) => [
      t.id,
      t.date,
      data.ledgers.find((l) => l.id === t.ledgerId)?.name,
      t.type === 'income' ? '수입' : '지출',
      t.description,
      t.amount,
      t.ownerId,
      data.paymentMethods.find((p) => p.id === t.paymentMethodId)?.name,
      t.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).join(' / '),
      t.allocations
        .map((a) => `${data.assets.find((s) => s.id === a.assetId)?.name}: ${a.amount}`)
        .join(' / '),
    ]),
  ];
  return '\uFEFF' + lines.map((row) => row.map(cell).join(',')).join('\r\n');
}
