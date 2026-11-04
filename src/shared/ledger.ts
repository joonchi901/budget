/**
 * Ledger domain contract shared by the UI and, later, the server.
 * Product rules live in docs/ledger-baseline.md.
 */

import type { Asset } from './assets';
import type { Friend, LedgerMember, RoomInvite, SignupLink } from './people';

/** Globally unique id. */
export type Id = string;
/** Calendar date `YYYY-MM-DD` in the household's local time. */
export type IsoDate = string;

export type TagOption = { id: Id; name: string; color: string; archived?: boolean };
/** A 유형 option, managed like a tag. Its nature decides which total the amount joins. */
export type KindOption = TagOption & {
  nature: 'income' | 'expense';
  /** 수입 and 지출 every ledger starts with: renamable, never archived. */
  base?: boolean;
};

/** A ledger's own fields; array order is display order. 유형·금액·내용·날짜 are fixed. */
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

/**
 * A ledger is one room. A ledger with children (상위 가계부) holds no records and no fields of
 * its own; it gathers every record of the ledgers below it. Ledgers nest to any depth and one
 * ledger may sit under several parents, but never under itself (no cycles).
 */
export type Ledger = {
  id: Id;
  name: string;
  /** UgaIcon name. */
  icon: string;
  period: { start: IsoDate; end: IsoDate };
  /** Empty for a parent. */
  kinds: KindOption[];
  /** Empty for a parent. */
  fields: FieldDef[];
  /** Direct children; empty for a ledger that holds records. */
  childIds: Id[];
  archived?: boolean;
  /** The 통계 tab's charts as the owner arranged them; without them, defaultStatCards(). */
  statCards?: StatCard[];
  /** 반복 내역: records written ahead for each month in the period (고정지출, 자동이체). */
  recurring?: RecurringRule[];
};

/**
 * A record a ledger repeats every month. Its records are written ahead on the rule's day of each
 * month in the period (when the rule is made, and when a copy makes the next ledger) and stay 예정
 * until that day.
 */
export type RecurringRule = {
  id: Id;
  title: string;
  kindId: Id;
  amount: number;
  values: { [fieldId: Id]: FieldValue };
  /** Day of the month, 1–31; past a month's end it falls on the last day (31 = 마지막 날). */
  day: number;
  /** The amount differs each month (관리비): each record asks for it once due. */
  variable?: true;
};

export const STAT_CHARTS = ['total', 'rank', 'donut', 'trend'] as const;
export const STAT_BUCKETS = ['day', 'week', 'month'] as const;

/**
 * One chart on a room's 통계 tab: 요약 (totals), 순위 (bars per tag), 비율 (a donut) or 추이
 * (columns per day, week or month). It names its axis, so a copied ledger keeps its charts.
 */
export type StatCard = {
  id: Id;
  chart: (typeof STAT_CHARTS)[number];
  nature: KindOption['nature'];
  /** 유형, 가계부 or a field name: 순위 and 비율 group by it, 추이 stacks by it. */
  axis?: string;
  /** 추이 only: one column per day, week (from Sunday) or month. */
  bucket?: (typeof STAT_BUCKETS)[number];
  /** Takes a whole row where charts sit two to a row. */
  wide?: boolean;
};

/** Text fields hold a string; select fields hold option ids (at most one for `select`). */
export type FieldValue = string | Id[];

/** Uga sticker reactions: sticker id to the members who reacted, oldest first. */
export type Reactions = { [reaction: string]: Id[] };

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
  reactions?: Reactions;
  /** Kept out of the linked asset's balance (자산에 반영 off). */
  notInAsset?: true;
  /** The 반복 내역 rule that wrote it ahead. */
  recurringId?: Id;
  /** Written by a rule whose amount varies, and not yet checked (금액 확인). */
  unconfirmed?: true;
};

/** A repeating record not yet due: shown as 예정 and kept out of every total. */
export const isScheduled = (record: LedgerRecord, today: IsoDate) =>
  Boolean(record.recurringId) && record.date > today;

/** The days a rule falls on within a period: its day each month, or that month's last day. */
export function recurringDates(day: number, period: { start: IsoDate; end: IsoDate }): IsoDate[] {
  const dates: IsoDate[] = [];
  let [year, month] = period.start.split('-').map(Number);
  for (;;) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
    if (date > period.end) return dates;
    if (date >= period.start) dates.push(date);
    [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
  }
}

/** The records a rule writes in a ledger's period after `after` (all of them by default). */
export function writeAhead(
  ledger: Ledger,
  rule: RecurringRule,
  createdBy: Id,
  after: IsoDate = '',
): LedgerRecord[] {
  return recurringDates(rule.day, ledger.period)
    .filter((date) => date > after)
    .map((date) => ({
      id: crypto.randomUUID(),
      ledgerId: ledger.id,
      date,
      kindId: rule.kindId,
      title: rule.title,
      amount: rule.amount,
      values: rule.values,
      createdBy,
      createdAt: new Date().toISOString(),
      recurringId: rule.id,
      ...(rule.variable ? { unconfirmed: true as const } : {}),
    }));
}

/**
 * What changing a ledger's rules does to its 예정 records: those of a stopped rule go; those of a
 * changed rule take its title, amount and tags and move, in order, onto its upcoming days in the
 * period (a month skipped by deleting its record stays skipped). Due records stay as they are.
 */
export function rescheduled(
  before: Ledger,
  after: Ledger,
  records: LedgerRecord[],
  today: IsoDate,
) {
  const changed: LedgerRecord[] = [];
  const removed: Id[] = [];
  for (const old of before.recurring ?? []) {
    const rule = after.recurring?.find((item) => item.id === old.id);
    const ahead = records
      .filter(
        (record) =>
          record.ledgerId === after.id &&
          record.recurringId === old.id &&
          isScheduled(record, today),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!rule) {
      removed.push(...ahead.map((record) => record.id));
      continue;
    }
    if (JSON.stringify(rule) === JSON.stringify(old)) continue;
    const dates = recurringDates(rule.day, after.period).filter((date) => date > today);
    ahead.forEach((record, index) => {
      if (!dates[index]) return removed.push(record.id);
      const { unconfirmed: _, ...rest } = record;
      changed.push({
        ...rest,
        date: dates[index],
        kindId: rule.kindId,
        title: rule.title,
        amount: rule.amount,
        values: rule.values,
        ...(rule.variable ? { unconfirmed: true as const } : {}),
      });
    });
  }
  return { changed, removed };
}

/**
 * A ledger's rules carried into a copy: kinds, fields and options are found by name, since the
 * copy gives them new ids. A rule whose 유형 is gone is left behind; a missing tag is dropped.
 */
export function carriedRules(
  rules: RecurringRule[],
  source: Ledger,
  copy: Ledger,
): RecurringRule[] {
  return rules.flatMap((rule) => {
    const kindName = source.kinds.find((kind) => kind.id === rule.kindId)?.name;
    const kind = copy.kinds.find((item) => item.name === kindName);
    if (!kind) return [];
    const values: RecurringRule['values'] = {};
    for (const [fieldId, value] of Object.entries(rule.values)) {
      const from = source.fields.find((field) => field.id === fieldId);
      const to = copy.fields.find((field) => field.name === from?.name && field.type === from.type);
      if (!from || !to) continue;
      if (from.type === 'text' || to.type === 'text') {
        values[to.id] = value;
        continue;
      }
      const names = from.options
        .filter((option) => value.includes(option.id))
        .map((option) => option.name);
      const ids = to.options
        .filter((option) => names.includes(option.name))
        .map((option) => option.id);
      if (ids.length) values[to.id] = ids;
    }
    return [{ ...rule, kindId: kind.id, values }];
  });
}

export type Member = { id: Id; name: string };

/** A line in a ledger's 대화: text or one Uga sticker, from a member. */
export type ChatMessage = {
  id: Id;
  ledgerId: Id;
  authorId: Id;
  text?: string;
  sticker?: string;
  /** ISO timestamp. */
  createdAt: string;
};

/** What the API returns after every read or change: the user and only what they may see. */
export type AppData = {
  user: Member & {
    handle: string;
    avatar?: string;
    /** This app's URL of the user's photo, when there is one. */
    photo?: string;
    /** The signed-in account's email, shown on 프로필. */
    email?: string;
    /** The first day the handle may change again (30 days after the last change). */
    handleChangeableFrom?: IsoDate;
  };
  ledgers: Ledger[];
  records: LedgerRecord[];
  /** Everyone who wrote or reacted to a visible record, for showing who reacted. */
  members?: Member[];
  /** The user's own assets (자산 tab). */
  assets?: Asset[];
  /** Recent 대화 of the ledgers the user can see, oldest first. */
  messages?: ChatMessage[];
  friends?: Friend[];
  /** Ledger invitations waiting for this user's answer. */
  invites?: RoomInvite[];
  signupLink?: SignupLink;
  /** Members (and pending invitees) of each ledger that holds records the user belongs to. */
  ledgerMembers?: { [ledgerId: Id]: LedgerMember[] };
  /** Records others added since the user last opened each room. */
  unseen?: { [ledgerId: Id]: number };
};

export type Totals = { income: number; expense: number; balance: number };

/** Reasons a record is invalid for its ledger; empty when valid. */
export function recordProblems(ledger: Ledger, record: LedgerRecord): string[] {
  const problems: string[] = [];
  if (record.ledgerId !== ledger.id) problems.push('다른 가계부의 내역');
  if (isParent(ledger)) problems.push('상위 가계부에는 내역을 둘 수 없음');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) problems.push('날짜');
  if (!ledger.kinds.some((kind) => kind.id === record.kindId)) problems.push('유형');
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

export const isParent = (ledger: Ledger) => ledger.childIds.length > 0;

/** Every ledger below `root` (not itself), each once even when reachable by several paths. */
export function descendants(ledgers: Ledger[], root: Ledger): Ledger[] {
  const byId = new Map(ledgers.map((ledger) => [ledger.id, ledger]));
  const seen = new Set<Id>([root.id]);
  const found: Ledger[] = [];
  const visit = (ledger: Ledger) => {
    for (const id of ledger.childIds) {
      const child = byId.get(id);
      if (!child || seen.has(id)) continue;
      seen.add(id);
      found.push(child);
      visit(child);
    }
  };
  visit(root);
  return found;
}

/** The ledgers that hold the room's records: itself, or every record-holding ledger below it. */
export function leafLedgers(ledgers: Ledger[], root: Ledger): Ledger[] {
  return isParent(root) ? descendants(ledgers, root).filter((ledger) => !isParent(ledger)) : [root];
}

/** The room's records. Each record counts once however the ledgers overlap. */
export function roomRecords(
  ledgers: Ledger[],
  root: Ledger,
  records: LedgerRecord[],
): LedgerRecord[] {
  const ids = new Set(leafLedgers(ledgers, root).map((ledger) => ledger.id));
  return records.filter((record) => ids.has(record.ledgerId));
}

/** Whether `child` may go under `parent` without a cycle (not itself, not one of its ancestors). */
export function canNest(ledgers: Ledger[], parent: Ledger, child: Ledger): boolean {
  return (
    parent.id !== child.id && !descendants(ledgers, child).some((item) => item.id === parent.id)
  );
}

/** The ledger to suggest when adding a record from a parent room on a given date. */
export function ledgerForDate(ledgers: Ledger[], date: IsoDate): Ledger | undefined {
  return ledgers.find(
    (ledger) => !ledger.archived && ledger.period.start <= date && date <= ledger.period.end,
  );
}

/** Stats and filter axis name for the fixed 유형 field. */
export const KIND_AXIS = '유형';

/** Stats axis comparing the ledgers of a group, e.g. 11월 vs 12월. */
export const LEDGER_AXIS = '가계부';
const LEDGER_COLORS = ['#D28C70', '#64866F', '#6C89A4', '#9176A6', '#E8AD3F', '#B9A27A'];

/** Axes a stats view can group by: 유형, 가계부 for several ledgers, then select fields by name. */
export function statAxes(ledgers: Ledger[]): string[] {
  const names = ledgers.flatMap((ledger) =>
    ledger.fields
      .filter((field) => field.type !== 'text' && !field.hidden)
      .map((field) => field.name),
  );
  return [KIND_AXIS, ...(ledgers.length > 1 ? [LEDGER_AXIS] : []), ...new Set(names)];
}

/** The most detailed single-select field (most options), such as 카테고리; else 유형. */
export function defaultStatAxis(ledgers: Ledger[]): string {
  let best: { name: string; options: number } | undefined;
  for (const ledger of ledgers)
    for (const field of ledger.fields)
      if (field.type === 'select' && !field.hidden && field.options.length > (best?.options ?? 0))
        best = { name: field.name, options: field.options.length };
  return best?.name ?? KIND_AXIS;
}

/** Axes whose shares add up to the whole (no multi-select), for a donut or a stacked trend. */
export function partAxes(ledgers: Ledger[]): string[] {
  const multiple = new Set(
    ledgers.flatMap((ledger) =>
      ledger.fields.filter((field) => field.type === 'multiSelect').map((field) => field.name),
    ),
  );
  return statAxes(ledgers).filter((axis) => !multiple.has(axis));
}

/**
 * The charts a room starts with: 요약, 순위 by the most detailed field, 비율 by the field with
 * the fewest options (such as 결제방식), and 추이 sized to the period. A parent's 추이 stacks by
 * 가계부.
 */
export function defaultStatCards(
  ledgers: Ledger[],
  period: { start: IsoDate; end: IsoDate },
): StatCard[] {
  const rank = defaultStatAxis(ledgers);
  const fewest = ledgers
    .flatMap((ledger) => ledger.fields)
    .filter(
      (field): field is Extract<FieldDef, { options: TagOption[] }> =>
        field.type === 'select' && !field.hidden && field.name !== rank && field.options.length > 1,
    )
    .sort((a, b) => a.options.length - b.options.length)[0];
  const days = (Date.parse(period.end) - Date.parse(period.start)) / 86400000 + 1;
  return [
    { id: 'total', chart: 'total', nature: 'expense', wide: true },
    { id: 'rank', chart: 'rank', nature: 'expense', axis: rank },
    { id: 'donut', chart: 'donut', nature: 'expense', axis: fewest?.name ?? KIND_AXIS },
    {
      id: 'trend',
      chart: 'trend',
      nature: 'expense',
      bucket: days > 92 ? 'month' : days > 35 ? 'week' : 'day',
      ...(ledgers.length > 1 ? { axis: LEDGER_AXIS } : {}),
      wide: true,
    },
  ];
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
    const index = ledgers.findIndex((item) => item.id === record.ledgerId);
    const ledger = ledgers[index];
    if (axis === LEDGER_AXIS && ledger) {
      add(ledger.name, LEDGER_COLORS[index % LEDGER_COLORS.length], record.amount);
      continue;
    }
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
  /**
   * Tag conditions: an option name on an axis (유형, 가계부 or a select field). Names on the same
   * axis match if any of them does; different axes must all match.
   */
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
    const byAxis = new Map<string, string[]>();
    for (const { axis, name } of filter.options ?? [])
      byAxis.set(axis, [...(byAxis.get(axis) ?? []), name]);
    return [...byAxis].every(([axis, names]) =>
      names.some((name) => {
        if (axis === KIND_AXIS) return kind.name === name;
        if (axis === LEDGER_AXIS) return ledger.name === name;
        const field = ledger.fields.find((item) => item.name === axis);
        if (!field || field.type === 'text') return false;
        const value = record.values[field.id];
        const chosen = Array.isArray(value)
          ? field.options.filter((option) => value.includes(option.id)).map((option) => option.name)
          : [];
        return chosen.length ? chosen.includes(name) : (field.emptyLabel ?? '미지정') === name;
      }),
    );
  });
}

export type TagAxis = { axis: string; options: { name: string; color: string }[] };

/**
 * The tags a room's records can be filtered by: 유형, 가계부 for several ledgers, then each
 * shown select field, with options merged by name across ledgers (archived ones left out).
 */
export function tagAxes(ledgers: Ledger[]): TagAxis[] {
  const merge = (options: TagOption[]) =>
    [
      ...new Map(
        options.filter((option) => !option.archived).map((option) => [option.name, option]),
      ).values(),
    ].map(({ name, color }) => ({ name, color }));
  const fields = new Map<string, TagOption[]>();
  for (const ledger of ledgers)
    for (const field of ledger.fields)
      if (field.type !== 'text' && !field.hidden)
        fields.set(field.name, [...(fields.get(field.name) ?? []), ...field.options]);
  return [
    { axis: KIND_AXIS, options: merge(ledgers.flatMap((ledger) => ledger.kinds)) },
    ...(ledgers.length > 1
      ? [
          {
            axis: LEDGER_AXIS,
            options: ledgers.map((ledger, index) => ({
              name: ledger.name,
              color: LEDGER_COLORS[index % LEDGER_COLORS.length],
            })),
          },
        ]
      : []),
    ...[...fields].map(([axis, options]) => ({ axis, options: merge(options) })),
  ].filter((item) => item.options.length > 0);
}
