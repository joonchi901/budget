import { ledgerDescendantIds, ledgerPath } from './hierarchy';
import type { Ledger, Transaction } from './types';

export interface LedgerRoom {
  ledger: Ledger;
  path: string;
  descendantCount: number;
  transactionCount: number;
  latestTransaction: Transaction | null;
  latestActivity: number;
}

function activityTime(transaction: Transaction): number {
  const time = Date.parse(transaction.updatedAt);
  return Number.isFinite(time) ? time : 0;
}

const structuralOrder = (a: Ledger, b: Ledger) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);

/** A room includes its original descendant records, without duplicating or changing them. */
export function ledgerRooms(
  ledgers: Ledger[],
  transactions: Transaction[],
  options: { query?: string; includeArchived?: boolean } = {},
): LedgerRoom[] {
  const unique = [...new Map(ledgers.map((ledger) => [ledger.id, ledger])).values()];
  const visible = unique.filter((ledger) => options.includeArchived || !ledger.archived);
  const visibleIds = new Set(visible.map((ledger) => ledger.id));
  const query = (options.query ?? '').normalize('NFKC').trim().toLocaleLowerCase('ko');
  let candidates: Ledger[];
  if (query) {
    candidates = visible.filter((ledger) =>
      ledgerPath(unique, ledger.id).normalize('NFKC').toLocaleLowerCase('ko').includes(query),
    );
  } else {
    // An active ledger stays reachable even if its parent is missing or archived.
    candidates = visible.filter((ledger) => !ledger.parentId || !visibleIds.has(ledger.parentId));
    const reachable = new Set<string>();
    const markReachable = (root: Ledger) => {
      const pending = [root.id];
      while (pending.length) {
        const id = pending.pop()!;
        if (reachable.has(id)) continue;
        reachable.add(id);
        pending.push(
          ...visible.filter((ledger) => ledger.parentId === id).map((ledger) => ledger.id),
        );
      }
    };
    candidates.forEach(markReachable);
    // Invalid historic cycles must not hide every member or trap the room browser.
    for (const ledger of [...visible].sort(structuralOrder)) {
      if (reachable.has(ledger.id)) continue;
      candidates.push(ledger);
      markReachable(ledger);
    }
  }

  return candidates
    .map((ledger): LedgerRoom => {
      const ids = ledgerDescendantIds(unique, ledger.id);
      const records = transactions.filter((transaction) => ids.has(transaction.ledgerId));
      const latestTransaction = records.reduce<Transaction | null>((latest, transaction) => {
        if (!latest) return transaction;
        const difference = activityTime(transaction) - activityTime(latest);
        return difference > 0 || (difference === 0 && transaction.id.localeCompare(latest.id) > 0)
          ? transaction
          : latest;
      }, null);
      return {
        ledger,
        path: ledgerPath(unique, ledger.id),
        descendantCount: Math.max(0, ids.size - 1),
        transactionCount: records.length,
        latestTransaction,
        latestActivity: latestTransaction ? activityTime(latestTransaction) : 0,
      };
    })
    .sort((a, b) => b.latestActivity - a.latestActivity || structuralOrder(a.ledger, b.ledger));
}
