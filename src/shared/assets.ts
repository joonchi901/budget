import {
  leafLedgers,
  totals,
  type Id,
  type IsoDate,
  type Ledger,
  type LedgerRecord,
} from './ledger';

export type AssetKind = 'cash' | 'savings' | 'investment' | 'debt';
export const ASSET_KINDS: { value: AssetKind; label: string }[] = [
  { value: 'cash', label: '현금·통장' },
  { value: 'savings', label: '저축·청약' },
  { value: 'investment', label: '투자' },
  { value: 'debt', label: '부채' },
];

/**
 * Something the user owns or owes. `balance` is what it held on `since`; records from the linked
 * ledgers (and their children) dated from then on move it, unless a record is kept out.
 * A 부채 holds what is still owed, so a repayment (an expense) lowers it.
 */
export type Asset = {
  id: Id;
  name: string;
  kind: AssetKind;
  balance: number;
  since: IsoDate;
  ledgerIds: Id[];
};

/** Ledgers holding records whose money an asset follows: each linked ledger's leaves. */
export function coveredLedgerIds(asset: Asset, ledgers: Ledger[]): Set<Id> {
  return new Set(
    asset.ledgerIds.flatMap((id) => {
      const ledger = ledgers.find((item) => item.id === id);
      return ledger ? leafLedgers(ledgers, ledger).map((leaf) => leaf.id) : [];
    }),
  );
}

/** The asset a ledger's records go to, if any. One ledger never feeds two assets. */
export const assetFor = (assets: Asset[], ledgers: Ledger[], ledgerId: Id) =>
  assets.find((asset) => coveredLedgerIds(asset, ledgers).has(ledgerId));

/** Records that move an asset: from its linked ledgers, dated from its 기준일, not kept out. */
export function assetRecords(asset: Asset, ledgers: Ledger[], records: LedgerRecord[]) {
  const covered = coveredLedgerIds(asset, ledgers);
  return records.filter(
    (record) => covered.has(record.ledgerId) && record.date >= asset.since && !record.notInAsset,
  );
}

/** What the asset holds now: its starting balance plus income minus expense reflected since then. */
export const assetBalance = (asset: Asset, ledgers: Ledger[], records: LedgerRecord[]) =>
  asset.balance + totals(assetRecords(asset, ledgers, records), ledgers).balance;

export type AssetMonth = { month: string; income: number; expense: number; balance: number };

/** Each month the asset moved, newest first: what came in, what went out, the balance at its end. */
export function assetMonths(
  asset: Asset,
  ledgers: Ledger[],
  records: LedgerRecord[],
): AssetMonth[] {
  const moved = assetRecords(asset, ledgers, records);
  let balance = asset.balance;
  return [...new Set(moved.map((record) => record.date.slice(0, 7)))]
    .sort()
    .map((month) => {
      const sum = totals(
        moved.filter((record) => record.date.startsWith(month)),
        ledgers,
      );
      balance += sum.balance;
      return { month, income: sum.income, expense: sum.expense, balance };
    })
    .reverse();
}

/** Assets minus debts. */
export const netWorth = (assets: Asset[], ledgers: Ledger[], records: LedgerRecord[]) =>
  assets.reduce(
    (sum, asset) => sum + (asset.kind === 'debt' ? -1 : 1) * assetBalance(asset, ledgers, records),
    0,
  );

/** Reasons an asset cannot be saved next to the user's other assets; empty when valid. */
export function assetProblems(asset: Asset, others: Asset[], ledgers: Ledger[]): string[] {
  const problems: string[] = [];
  if (!asset.name.trim()) problems.push('이름');
  if (!Number.isSafeInteger(asset.balance)) problems.push('시작 잔액');
  const covered = coveredLedgerIds(asset, ledgers);
  if (
    others.some(
      (other) =>
        other.id !== asset.id &&
        [...coveredLedgerIds(other, ledgers)].some((id) => covered.has(id)),
    )
  )
    problems.push('다른 자산에 이미 연동된 가계부');
  return problems;
}
