import type { Ledger, Transaction } from './types';

/** Parent reporting may rename classifications; the source record is never changed. */
export function transactionForLedger(
  ledgers: Ledger[],
  ledgerId: string,
  transaction: Transaction,
): Transaction {
  const viewer = ledgers.find((l) => l.id === ledgerId);
  const source = ledgers.find((l) => l.id === transaction.ledgerId);
  if (viewer?.kind !== 'main' || source?.parentId !== viewer.id) return transaction;
  return {
    ...transaction,
    tagIds: [...new Set(transaction.tagIds.map((id) => source.tagMappings?.[id] ?? id))],
  };
}
