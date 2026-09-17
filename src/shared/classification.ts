import type { Ledger, Transaction } from './types';
import { ALL_LEDGERS_ID, ledgerAncestors } from './hierarchy';

/** Parent reporting may rename classifications; the source record is never changed. */
export function transactionForLedger(
  ledgers: Ledger[],
  ledgerId: string,
  transaction: Transaction,
): Transaction {
  if (ledgerId === ALL_LEDGERS_ID || ledgerId === transaction.ledgerId) return transaction;
  const source = ledgers.find((ledger) => ledger.id === transaction.ledgerId);
  if (!source) return transaction;
  const ancestors = ledgerAncestors(ledgers, source.id).reverse();
  const targetIndex = ancestors.findIndex((ledger) => ledger.id === ledgerId);
  if (targetIndex < 0) return transaction;
  let tagIds = transaction.tagIds;
  // The mapping belongs to the child-to-parent edge. Apply each edge exactly once.
  for (const child of [source, ...ancestors.slice(0, targetIndex)]) {
    tagIds = [...new Set(tagIds.map((id) => child.tagMappings?.[id] ?? id))];
  }
  return {
    ...transaction,
    tagIds,
  };
}
