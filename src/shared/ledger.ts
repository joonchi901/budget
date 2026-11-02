/**
 * Ledger domain contract shared by the UI and, later, the server.
 * Product rules live in docs/ledger-baseline.md.
 */

/** Globally unique id. */
export type Id = string;
/** Calendar date `YYYY-MM-DD` in the household's local time. */
export type IsoDate = string;

export type TagOption = { id: Id; name: string; color: string; archived?: boolean };
/** A 구분 option. Its nature decides which total the amount joins. */
export type KindOption = TagOption & { nature: 'income' | 'expense' };

/** A ledger's own fields; array order is display order. 날짜·구분·내용·금액 are fixed. */
export type FieldDef =
  | { id: Id; name: string; type: 'text'; hidden?: boolean }
  | {
      id: Id;
      name: string;
      type: 'select' | 'multiSelect';
      options: TagOption[];
      hidden?: boolean;
    };

export type Ledger = {
  id: Id;
  name: string;
  /** UgaIcon name. */
  icon: string;
  period: { start: IsoDate; end: IsoDate };
  kinds: KindOption[];
  fields: FieldDef[];
  archived?: boolean;
};

/** Text fields hold a string; select fields hold option ids (at most one for `select`). */
export type FieldValue = string | Id[];

export type LedgerRecord = {
  id: Id;
  ledgerId: Id;
  date: IsoDate;
  kindId: Id;
  title: string;
  /** Whole won, always positive; the kind decides income or expense. */
  amount: number;
  values: { [fieldId: Id]: FieldValue };
  createdBy: Id;
  /** ISO timestamp. */
  createdAt: string;
};

/** A group (묶음) gathers ledgers. A ledger may sit in several groups. */
export type Group = { id: Id; name: string; icon: string; ledgerIds: Id[]; archived?: boolean };

export type Member = { id: Id; name: string };

export type Totals = { income: number; expense: number; balance: number };

/** Reasons a record is invalid for its ledger; empty when valid. */
export function recordProblems(ledger: Ledger, record: LedgerRecord): string[] {
  const problems: string[] = [];
  if (record.ledgerId !== ledger.id) problems.push('다른 가계부의 내역');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) problems.push('날짜');
  if (!ledger.kinds.some((kind) => kind.id === record.kindId)) problems.push('구분');
  if (!record.title.trim()) problems.push('내용');
  if (!Number.isSafeInteger(record.amount) || record.amount <= 0) problems.push('금액');
  for (const [fieldId, value] of Object.entries(record.values)) {
    const field = ledger.fields.find((item) => item.id === fieldId);
    if (!field) problems.push(`없는 필드 ${fieldId}`);
    else if (
      field.type === 'text'
        ? typeof value !== 'string'
        : !Array.isArray(value) ||
          (field.type === 'select' && value.length > 1) ||
          value.some((id) => !field.options.some((option) => option.id === id))
    )
      problems.push(field.name);
  }
  return problems;
}

/** Income, expense and balance, using the nature of each record's kind. */
export function totals(records: LedgerRecord[], ledgers: Ledger[]): Totals {
  const nature = new Map(
    ledgers.flatMap((ledger) => ledger.kinds.map((kind) => [kind.id, kind.nature] as const)),
  );
  let income = 0;
  let expense = 0;
  for (const record of records) {
    const kind = nature.get(record.kindId);
    if (kind === 'income') income += record.amount;
    if (kind === 'expense') expense += record.amount;
  }
  return { income, expense, balance: income - expense };
}

/** Records of the group's ledgers. Filtering keeps each record once however groups overlap. */
export function groupRecords(group: Group, records: LedgerRecord[]): LedgerRecord[] {
  const ledgerIds = new Set(group.ledgerIds);
  return records.filter((record) => ledgerIds.has(record.ledgerId));
}

/** The ledger to suggest when adding a record from a group room on a given date. */
export function ledgerForDate(ledgers: Ledger[], date: IsoDate): Ledger | undefined {
  return ledgers.find(
    (ledger) => !ledger.archived && ledger.period.start <= date && date <= ledger.period.end,
  );
}
