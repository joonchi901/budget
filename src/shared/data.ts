import type { Bootstrap, OwnerId, TransactionInput } from './types';
export const backupTables = [
  'ledgers',
  'tag_groups',
  'tags',
  'assets',
  'payment_methods',
  'rules',
  'transactions',
  'asset_operations',
  'asset_movements',
  'asset_effects',
  'planning_records',
  'import_records',
  'source_records',
  'record_history',
] as const;
export type BackupTable = (typeof backupTables)[number];
export type DataRow = Record<string, string | number | null>;
export interface BudgetBackup {
  format: 'our-budget';
  schemaVersion: 1;
  exportedAt: string;
  sourceHouseholdId: string;
  sourceRevision: number;
  members: { id: string; name: string; color: string }[];
  tables: Record<BackupTable, DataRow[]>;
}
export interface RestorePreview {
  digest: string;
  revision: number;
  counts: Record<string, number>;
  currentCounts: Record<string, number>;
  issues: string[];
  members: BudgetBackup['members'];
  mode: 'replace';
}
export interface ImportRow {
  rowId: string;
  transaction: TransactionInput;
  sourceLocation?: string;
}
export interface ImportPreviewRow {
  rowId: string;
  sourceLocation?: string;
  transaction: TransactionInput;
  errors: string[];
  status: 'ready' | 'duplicate' | 'error';
}
export interface ImportPreview {
  sourceId: string;
  digest: string;
  revision: number;
  rows: ImportPreviewRow[];
  ready: number;
  duplicate: number;
  errors: number;
  income: number;
  expense: number;
}
export interface CsvMapping {
  rowId: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  payment: string;
  tags: string;
  owner: string;
}
export const csvMappingLabels: Record<keyof CsvMapping, string> = {
  rowId: '원본 행 ID',
  date: '날짜',
  description: '내역',
  amount: '금액',
  type: '수입/지출',
  payment: '결제수단',
  tags: '태그',
  owner: '귀속',
};
/** RFC4180-style parser, including quoted commas/newlines and escaped quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === '"') {
      if (value || closed) throw new Error('CSV 따옴표 형식을 확인해 주세요.');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value);
      value = '';
      closed = false;
      if (char !== ',') {
        rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (!closed || /\s/.test(char)) {
      if (!closed) value += char;
    } else throw new Error('CSV 닫는 따옴표 뒤의 형식을 확인해 주세요.');
  }
  if (quoted) throw new Error('CSV의 닫히지 않은 따옴표를 확인해 주세요.');
  if (value || row.length || closed) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}
export function defaultCsvMapping(headers: string[]): CsvMapping {
  const choices: Record<keyof CsvMapping, string[]> = {
    rowId: ['원본 행 ID', 'id', 'ID'],
    date: ['날짜', '거래일', 'date'],
    description: ['내역', '내용', 'description'],
    amount: ['금액', 'amount'],
    type: ['유형', '수입/지출', 'type'],
    payment: ['결제수단', 'payment'],
    tags: ['태그', 'tags'],
    owner: ['귀속', '명의', 'owner'],
  };
  return Object.fromEntries(
    Object.entries(choices).map(([key, values]) => [
      key,
      values.find((v) => headers.includes(v)) ?? '',
    ]),
  ) as unknown as CsvMapping;
}
export function csvImportRows(
  csv: string[][],
  mapping: CsvMapping,
  ledgerId: string,
  data: Bootstrap,
): { rows: ImportRow[]; errors: string[] } {
  const [headers, ...lines] = csv;
  if (!headers) return { rows: [], errors: ['CSV가 비어 있어요.'] };
  const errors: string[] = [];
  for (const key of ['rowId', 'date', 'description', 'amount', 'type', 'payment'] as const)
    if (!mapping[key] || !headers.includes(mapping[key]))
      errors.push(`${csvMappingLabels[key]} 열을 연결해 주세요.`);
  if (new Set(headers).size !== headers.length) errors.push('중복된 CSV 열 이름이 있어요.');
  const value = (line: string[], key: keyof CsvMapping) =>
    (line[headers.indexOf(mapping[key])] ?? '').trim();
  const rows = lines.map((line, index): ImportRow => {
    const where = `CSV ${index + 2}행`,
      rawDate = value(line, 'date');
    const parsedDate = rawDate
      .replace(/[./]/g, '-')
      .replace(
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
      );
    const rawAmount = value(line, 'amount'),
      rawType = value(line, 'type');
    const paymentName = value(line, 'payment');
    const payments = data.paymentMethods.filter(
      (p) => p.id === paymentName || p.name === paymentName,
    );
    if (payments.length !== 1)
      errors.push(`${where}: 결제수단 “${paymentName}”을 하나로 확인할 수 없어요.`);
    const tagIds = value(line, 'tags')
      .split('|')
      .map((v) => v.trim())
      .filter(Boolean)
      .flatMap((name) => {
        const options = data.tags.filter(
          (t) =>
            t.id === name ||
            `${data.tagGroups.find((g) => g.id === t.groupId)?.name}:${t.name}` === name ||
            t.name === name,
        );
        if (options.length !== 1) {
          errors.push(
            `${where}: 태그 “${name}”을 하나로 확인할 수 없어요. 유형:옵션 형식도 사용할 수 있어요.`,
          );
          return [];
        }
        return [options[0].id];
      });
    const rawOwner = value(line, 'owner');
    const owners = data.users.filter((u) => u.id === rawOwner || u.name === rawOwner);
    if (rawOwner && !['공동', 'shared'].includes(rawOwner) && owners.length !== 1)
      errors.push(`${where}: 귀속을 확인해 주세요.`);
    if (!['수입', '지출', 'income', 'expense'].includes(rawType))
      errors.push(`${where}: 유형은 수입 또는 지출이어야 해요.`);
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(rawAmount))
      errors.push(`${where}: 금액은 양의 정수 원 단위로 입력해 주세요.`);
    return {
      rowId: value(line, 'rowId'),
      sourceLocation: where,
      transaction: {
        ledgerId,
        date: parsedDate,
        description: value(line, 'description'),
        amount: Number(rawAmount.replace(/,/g, '')),
        type: rawType === '수입' || rawType === 'income' ? 'income' : 'expense',
        ownerId: owners[0]?.id ?? ('shared' as OwnerId),
        paymentMethodId: payments[0]?.id ?? '',
        tagIds,
        allocations: [],
      },
    };
  });
  return { rows, errors };
}
export function transactionsCsv(data: Bootstrap): string {
  const escape = (v: unknown) => {
    const value = String(v ?? '');
    const safe =
      typeof v === 'string' && /^[=+\-@\t\r]/.test(value) ? ` '${value}`.trimStart() : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['원본 행 ID', '날짜', '내역', '금액', '유형', '결제수단', '태그', '귀속', '가계부'],
    ...data.transactions.map((t) => [
      t.id,
      t.date,
      t.description,
      t.amount,
      t.type,
      data.paymentMethods.find((p) => p.id === t.paymentMethodId)?.name ?? t.paymentMethodId,
      t.tagIds
        .map((id) => {
          const tag = data.tags.find((v) => v.id === id);
          return tag ? `${data.tagGroups.find((g) => g.id === tag.groupId)?.name}:${tag.name}` : id;
        })
        .join('|'),
      t.ownerId,
      data.ledgers.find((l) => l.id === t.ledgerId)?.name,
    ]),
  ];
  // Text that spreadsheets could execute is neutralized. JSON retains exact originals.
  return '\uFEFF' + rows.map((r) => r.map(escape).join(',')).join('\r\n');
}

export interface SourceRecord {
  id: string;
  sourceId: string;
  sourceLocation: string;
  kind: 'transaction' | 'plan' | 'management' | 'reference';
  payload: Record<string, unknown> | unknown[];
  note: string;
  status: 'pending' | 'resolved' | 'reference';
  version: number;
}

export interface RecordHistory {
  id: string;
  revision: number;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  createdAt: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'restore' | 'review' | 'unknown';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
