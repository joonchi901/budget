import type { Ledger } from './types';

/** A view over every original record, never a writable ledger. */
export const ALL_LEDGERS_ID = '__all__';

export function sortedLedgerChildren(ledgers: Ledger[], parentId: string | null): Ledger[] {
  const ids = new Set(ledgers.map((ledger) => ledger.id));
  const seen = new Set<string>();
  return ledgers
    .filter((ledger) => {
      if (seen.has(ledger.id)) return false;
      seen.add(ledger.id);
      return parentId === null
        ? ledger.parentId === null || !ids.has(ledger.parentId)
        : ledger.parentId === parentId;
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

/** Iterative and cycle-safe, including archived history and detached root ledgers. */
export function ledgerDescendantIds(
  ledgers: Ledger[],
  ledgerId: string,
  includeSelf = true,
): Set<string> {
  if (ledgerId === ALL_LEDGERS_ID) return new Set(ledgers.map((ledger) => ledger.id));
  if (!ledgers.some((ledger) => ledger.id === ledgerId)) return new Set();
  const children = new Map<string, string[]>();
  for (const ledger of ledgers) {
    if (ledger.parentId === null) continue;
    const siblings = children.get(ledger.parentId) ?? [];
    siblings.push(ledger.id);
    children.set(ledger.parentId, siblings);
  }
  const found = new Set<string>();
  const pending = [ledgerId];
  while (pending.length) {
    const id = pending.pop()!;
    if (found.has(id)) continue;
    found.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  if (!includeSelf) found.delete(ledgerId);
  return found;
}

/** Root-to-parent order; malformed ancestry stops before repeating a node. */
export function ledgerAncestors(ledgers: Ledger[], ledgerId: string): Ledger[] {
  const byId = new Map(ledgers.map((ledger) => [ledger.id, ledger]));
  const seen = new Set([ledgerId]);
  const ancestors: Ledger[] = [];
  let parentId = byId.get(ledgerId)?.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }
  return ancestors;
}

export function ledgerPath(ledgers: Ledger[], ledgerId: string): string {
  if (ledgerId === ALL_LEDGERS_ID) return '가계부 전체 보기';
  const ledger = ledgers.find((item) => item.id === ledgerId);
  return ledger
    ? [...ledgerAncestors(ledgers, ledgerId), ledger].map((item) => item.name).join(' / ')
    : '';
}
