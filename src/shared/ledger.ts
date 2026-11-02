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
      /** Shown for records without a value, such as '공동' for 누가. */
      emptyLabel?: string;
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

/** Stats axis name for the fixed 구분 field. */
export const KIND_AXIS = '구분';

/** Axes a stats view can group by: 구분, then select fields by name across the ledgers. */
export function statAxes(ledgers: Ledger[]): string[] {
  const names = ledgers.flatMap((ledger) =>
    ledger.fields
      .filter((field) => field.type !== 'text' && !field.hidden)
      .map((field) => field.name),
  );
  return [KIND_AXIS, ...new Set(names)];
}

export type Share = { name: string; color: string; value: number };

/**
 * Amounts per option of the `axis` field for records of one nature, largest first. Options with
 * the same name merge across ledgers. A multi-select record counts in full for each chosen
 * option, so shares may add up to more than the total. Ledgers without the field are skipped.
 */
export function breakdown(
  records: LedgerRecord[],
  ledgers: Ledger[],
  axis: string,
  nature: KindOption['nature'],
): Share[] {
  const kinds = new Map(ledgers.flatMap((ledger) => ledger.kinds.map((kind) => [kind.id, kind])));
  const shares = new Map<string, Share>();
  const add = (name: string, color: string, amount: number) => {
    const share = shares.get(name) ?? { name, color, value: 0 };
    share.value += amount;
    shares.set(name, share);
  };
  for (const record of records) {
    const kind = kinds.get(record.kindId);
    if (kind?.nature !== nature) continue;
    if (axis === KIND_AXIS) {
      add(kind.name, kind.color, record.amount);
      continue;
    }
    const ledger = ledgers.find((item) => item.id === record.ledgerId);
    const field = ledger?.fields.find((item) => item.name === axis);
    if (!field || field.type === 'text') continue;
    const value = record.values[field.id];
    const chosen = Array.isArray(value)
      ? field.options.filter((option) => value.includes(option.id))
      : [];
    if (!chosen.length) add(field.emptyLabel ?? '미지정', '#9B8674', record.amount);
    for (const option of chosen) add(option.name, option.color, record.amount);
  }
  return [...shares.values()].sort((a, b) => b.value - a.value);
}

export type RecordFilter = {
  /** Matches 내용 and text field values, ignoring case. */
  query?: string;
  nature?: KindOption['nature'];
  /** Every condition must match: an option name on an axis, as produced by breakdown(). */
  options?: { axis: string; name: string }[];
};

/** Records matching all conditions; option names match across ledgers like breakdown(). */
export function filterRecords(
  records: LedgerRecord[],
  ledgers: Ledger[],
  filter: RecordFilter,
): LedgerRecord[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? '';
  return records.filter((record) => {
    const ledger = ledgers.find((item) => item.id === record.ledgerId);
    const kind = ledger?.kinds.find((item) => item.id === record.kindId);
    if (!ledger || !kind) return false;
    if (filter.nature && kind.nature !== filter.nature) return false;
    if (query) {
      const texts = [
        record.title,
        ...ledger.fields
          .filter((field) => field.type === 'text')
          .map((field) => record.values[field.id]),
      ];
      if (
        !texts.some((text) => typeof text === 'string' && text.toLocaleLowerCase().includes(query))
      )
        return false;
    }
    return (filter.options ?? []).every(({ axis, name }) => {
      if (axis === KIND_AXIS) return kind.name === name;
      const field = ledger.fields.find((item) => item.name === axis);
      if (!field || field.type === 'text') return false;
      const value = record.values[field.id];
      const chosen = Array.isArray(value)
        ? field.options.filter((option) => value.includes(option.id)).map((option) => option.name)
        : [];
      return chosen.length ? chosen.includes(name) : (field.emptyLabel ?? '미지정') === name;
    });
  });
}
