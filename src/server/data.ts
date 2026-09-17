import {
  backupTables,
  type BackupTable,
  type BudgetBackup,
  type DataRow,
  type ImportPreview,
  type ImportRow,
  type RestorePreview,
  type RecordHistory,
} from '../shared/data';
import type { Bootstrap, MutationResult, TransactionInput } from '../shared/types';
import {
  scheduleOccurrences,
  payrollSummary,
  type SchedulePlan,
  type PayrollPlan,
} from '../shared/planning';
import { hash, type Session } from './auth';
import { ApiError, requireValue } from './errors';
import { bootstrap, getRevision, replay, type Binding } from './storage';
import { date, identity, stable, text, type ObjectBody } from './validation';
import { requireAdmin, hierarchyIncrement } from './hierarchy';
import { ALL_LEDGERS_ID } from '../shared/hierarchy';

const maximumBytes = 12_000_000;
export async function readDataBody(request: Request): Promise<ObjectBody> {
  const raw = await request.text();
  requireValue(
    new TextEncoder().encode(raw).byteLength <= maximumBytes,
    '파일은 12MB 이하로 나누어 주세요.',
  );
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'JSON 파일 형식을 확인해 주세요.');
  }
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    '요청 형식을 확인해 주세요.',
  );
  return value as ObjectBody;
}
interface Column {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
}
type Schema = Record<BackupTable, Column[]>;
const rawColumns: Record<BackupTable, string> = {
  ledgers:
    'id name icon kind parent_id budget start_date end_date archived version period_start_day fixed_expense_tag_ids tag_mappings sort_order',
  tag_groups: 'id name selection_mode applies_to role ledger_ids sort_order archived version',
  tags: 'id name color group_id sort_order archived version parent_id',
  assets:
    'id name kind opening_balance color tag_ids track_savings version opening_date archived metadata_json',
  payment_methods: 'id name type owner_id closing_day payment_day details_json version archived',
  rules: 'id tag_id name type version',
  transactions:
    'id ledger_id date description amount type category owner_id payment_method_id tag_ids asset_id to_asset_id version updated_at updated_by deleted_at allocations_json created_by created_at',
  asset_operations:
    'id type date description from_asset_id to_asset_id asset_id amount target_balance version created_by created_at deleted_at legacy_transaction_id',
  asset_movements: 'id transaction_id asset_id amount rule_id rule_version',
  asset_effects:
    'id transaction_id operation_id asset_id amount savings_amount savings_tracking date description actor_id',
  planning_records: 'id ledger_id kind payload_json archived version created_at',
  import_records:
    'id source_id row_id content_hash payload_json transaction_id imported_at actor_id batch_id',
  source_records: 'id source_id source_location kind payload_json note status version',
  record_history:
    'id revision entity_type entity_id ledger_id actor_id created_at action before_json after_json',
};
const integerColumns = new Set(
  'revision budget archived version period_start_day sort_order opening_balance track_savings closing_day payment_day amount target_balance rule_version savings_amount savings_tracking'.split(
    ' ',
  ),
);
const nullableColumns: Partial<Record<BackupTable, string[]>> = {
  ledgers: ['parent_id', 'start_date', 'end_date'],
  tag_groups: ['ledger_ids'],
  tags: ['group_id', 'parent_id'],
  assets: ['opening_date'],
  payment_methods: ['closing_day', 'payment_day'],
  transactions: ['asset_id', 'to_asset_id', 'deleted_at', 'created_by', 'created_at'],
  record_history: ['ledger_id', 'before_json', 'after_json'],
  asset_operations: [
    'from_asset_id',
    'to_asset_id',
    'asset_id',
    'target_balance',
    'deleted_at',
    'legacy_transaction_id',
  ],
  asset_effects: ['transaction_id', 'operation_id'],
};
async function schema(_db: D1Database): Promise<Schema> {
  return Object.fromEntries(
    backupTables.map((table) => [
      table,
      rawColumns[table].split(' ').map((name) => ({
        name,
        type: integerColumns.has(name) ? 'INTEGER' : 'TEXT',
        notnull: nullableColumns[table]?.includes(name) ? 0 : 1,
        dflt_value: null,
      })),
    ]),
  ) as Schema;
}
export async function exportBackup(db: D1Database, session: Session): Promise<BudgetBackup> {
  const h = session.householdId;
  const results = await db.batch<Record<string, unknown>>([
    ...backupTables.map((table) =>
      db.prepare(`SELECT * FROM ${table} WHERE household_id=? ORDER BY id`).bind(h),
    ),
    db.prepare('SELECT id,name,color FROM users WHERE household_id=? ORDER BY id').bind(h),
    db.prepare('SELECT revision FROM households WHERE id=?').bind(h),
  ]);
  return {
    format: 'our-budget',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    sourceHouseholdId: h,
    sourceRevision: Number(results.at(-1)!.results[0].revision),
    members: results.at(-2)!.results as BudgetBackup['members'],
    tables: Object.fromEntries(
      backupTables.map((table, i) => [
        table,
        results[i].results.map(({ household_id: _household, ...row }) => row),
      ]),
    ) as BudgetBackup['tables'],
  };
}
function object(value: unknown): value is ObjectBody {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function parseBackup(value: unknown): BudgetBackup {
  requireValue(
    object(value) &&
      value.format === 'our-budget' &&
      (value.schemaVersion === 1 || value.schemaVersion === 2) &&
      object(value.tables) &&
      Array.isArray(value.members) &&
      typeof value.sourceHouseholdId === 'string',
    '지원하는 가계부 JSON 백업 파일을 선택해 주세요.',
  );
  requireValue(
    Object.keys(value.tables).every((key) => backupTables.includes(key as BackupTable)),
    '백업에 지원하지 않는 테이블이 있어요.',
  );
  const document = structuredClone(value) as ObjectBody & { tables: Record<string, unknown> };
  // Version 1 did not persist sibling order. Preserve its array order on migration.
  if (document.schemaVersion === 1 && Array.isArray(document.tables.ledgers))
    document.tables.ledgers.forEach((row, index) => {
      if (object(row)) row.sort_order ??= index;
    });
  if (document.tables.source_records === undefined) document.tables.source_records = [];
  if (document.tables.record_history === undefined) document.tables.record_history = [];
  if (Array.isArray(document.tables.transactions))
    for (const row of document.tables.transactions) {
      if (object(row)) {
        row.created_by ??= null;
        row.created_at ??= null;
      }
    }
  let count = 0;
  for (const table of backupTables) {
    requireValue(Array.isArray(document.tables[table]), `${table} 자료가 누락되었어요.`);
    count += (document.tables[table] as unknown[]).length;
    requireValue(
      (document.tables[table] as unknown[]).every(object),
      `${table} 행 형식을 확인해 주세요.`,
    );
  }
  requireValue(count <= 30000, '복원은 한 번에 30,000행까지 지원해요.');
  requireValue(
    value.members.length > 0 &&
      value.members.length <= 10 &&
      value.members.every(
        (v) =>
          object(v) &&
          typeof v.id === 'string' &&
          typeof v.name === 'string' &&
          typeof v.color === 'string',
      ),
    '백업의 가구 구성원 정보를 확인해 주세요.',
  );
  return document as unknown as BudgetBackup;
}
const nullableId = (value: unknown) =>
  value === null || (typeof value === 'string' && value.length > 0 && value.length <= 2048);
const isDate = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const moneyValue = (value: unknown, signed = false) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= 2_000_000_000_000 &&
  (signed || value >= 0);
function referenceIssues(backup: BudgetBackup, columns: Schema): string[] {
  const issues: string[] = [];
  const ids = Object.fromEntries(
    backupTables.map((table) => [table, new Set(backup.tables[table].map((r) => r.id))]),
  ) as Record<BackupTable, Set<unknown>>;
  const members = new Set(backup.members.map((m) => m.id));
  const issue = (table: string, row: DataRow, message: string) => {
    if (issues.length < 100) issues.push(`${table} / ${String(row.id).slice(0, 80)}: ${message}`);
  };
  const ref = (
    table: BackupTable,
    row: DataRow,
    key: string,
    target: BackupTable,
    nullable = true,
  ) => {
    if (nullable && row[key] === null) return;
    if (!ids[target].has(row[key])) issue(table, row, `${key} 연결 대상이 없어요.`);
  };
  const member = (table: BackupTable, row: DataRow, key: string, shared = false) => {
    if (!(shared && row[key] === 'shared') && !members.has(String(row[key])))
      issue(table, row, `${key} 구성원이 없어요.`);
  };
  const decoded = (row: DataRow, key: string): unknown => {
    try {
      return row[key] === null ? null : JSON.parse(String(row[key]));
    } catch {
      return undefined;
    }
  };
  const jsonRefs = (
    table: BackupTable,
    row: DataRow,
    key: string,
    target: BackupTable,
    nullable = false,
  ) => {
    const values = decoded(row, key);
    if (nullable && values === null) return;
    if (
      !Array.isArray(values) ||
      values.some((id) => typeof id !== 'string' || !ids[target].has(id))
    )
      issue(table, row, `${key} 연결 목록을 확인해 주세요.`);
  };
  for (const table of backupTables) {
    if (ids[table].size !== backup.tables[table].length) issues.push(`${table}: 중복 ID가 있어요.`);
    for (const row of backup.tables[table]) {
      if (!nullableId(row.id) || row.id === null) issue(table, row, 'ID가 올바르지 않아요.');
      for (const key of Object.keys(row))
        if (!columns[table].some((c) => c.name === key))
          issue(table, row, `지원하지 않는 열 ${key}`);
      for (const column of columns[table]) {
        const value = row[column.name];
        if (value === undefined || (column.notnull && value === null)) {
          issue(table, row, `${column.name} 값이 누락되었어요.`);
          continue;
        }
        if (
          value !== null &&
          (column.type === 'INTEGER' ? !Number.isSafeInteger(value) : typeof value !== 'string')
        )
          issue(table, row, `${column.name} 자료형이 올바르지 않아요.`);
        if (column.name === 'version' && (typeof value !== 'number' || value < 1))
          issue(table, row, '버전이 올바르지 않아요.');
        if (
          ['archived', 'track_savings', 'savings_tracking'].includes(column.name) &&
          value !== 0 &&
          value !== 1
        )
          issue(table, row, `${column.name} 값은 0 또는 1이어야 해요.`);
        if (
          (column.name.endsWith('_json') ||
            ['tag_ids', 'ledger_ids', 'fixed_expense_tag_ids', 'tag_mappings'].includes(
              column.name,
            )) &&
          value !== null &&
          decoded(row, column.name) === undefined
        )
          issue(table, row, `${column.name} JSON 형식이 올바르지 않아요.`);
      }
      if (table === 'ledgers') {
        if (row.id === ALL_LEDGERS_ID)
          issue(table, row, '전체 보기 전용 ID는 실제 가계부에 사용할 수 없어요.');
        ref(table, row, 'parent_id', 'ledgers');
        if (
          !['main', 'purpose'].includes(String(row.kind)) ||
          !moneyValue(row.budget) ||
          !Number.isInteger(row.period_start_day) ||
          Number(row.period_start_day) < 1 ||
          Number(row.period_start_day) > 31
        )
          issue(table, row, '가계부 종류·예산·집계 시작일을 확인해 주세요.');
        if (
          (row.start_date !== null && !isDate(row.start_date)) ||
          (row.end_date !== null && !isDate(row.end_date)) ||
          (row.start_date && row.end_date && row.start_date > row.end_date)
        )
          issue(table, row, '가계부 기간이 올바르지 않아요.');
        if (row.parent_id === row.id)
          issue(table, row, '가계부를 자기 자신의 하위로 연결할 수 없어요.');
        if (!Number.isSafeInteger(row.sort_order) || Math.abs(Number(row.sort_order)) >= 1_000_000)
          issue(table, row, '가계부의 정렬 순서를 확인해 주세요.');
        jsonRefs(table, row, 'fixed_expense_tag_ids', 'tags');
        const mappings = decoded(row, 'tag_mappings');
        if (
          !object(mappings) ||
          Object.entries(mappings).some(([from, to]) => !ids.tags.has(from) || !ids.tags.has(to))
        )
          issue(table, row, '가계부 분류 연결을 확인해 주세요.');
      }
      if (table === 'tag_groups') {
        jsonRefs(table, row, 'ledger_ids', 'ledgers', true);
        if (
          !['single', 'multiple'].includes(String(row.selection_mode)) ||
          !['transaction', 'asset'].includes(String(row.applies_to)) ||
          !['category', 'regular'].includes(String(row.role))
        )
          issue(table, row, '태그 유형 설정을 확인해 주세요.');
      }
      if (table === 'tags') {
        ref(table, row, 'group_id', 'tag_groups', false);
        ref(table, row, 'parent_id', 'tags');
        if (row.parent_id === row.id)
          issue(table, row, '자기 자신을 상위 태그로 지정할 수 없어요.');
      }
      if (table === 'assets') {
        jsonRefs(table, row, 'tag_ids', 'tags');
        if (
          !['asset', 'liability'].includes(String(row.kind)) ||
          !moneyValue(row.opening_balance, true) ||
          (row.opening_date !== null && !isDate(row.opening_date))
        )
          issue(table, row, '자산 잔액·기준일을 확인해 주세요.');
        const meta = decoded(row, 'metadata_json');
        if (!object(meta)) issue(table, row, '자산 상세정보 형식을 확인해 주세요.');
        else if (meta.ownerId && meta.ownerId !== 'shared' && !members.has(String(meta.ownerId)))
          issue(table, row, '자산 명의를 확인해 주세요.');
      }
      if (table === 'payment_methods') {
        member(table, row, 'owner_id', true);
        if (!['card', 'account', 'cash'].includes(String(row.type)))
          issue(table, row, '결제수단 종류를 확인해 주세요.');
        for (const key of ['closing_day', 'payment_day'])
          if (
            row[key] !== null &&
            (!Number.isInteger(row[key]) || Number(row[key]) < 1 || Number(row[key]) > 31)
          )
            issue(table, row, '카드 마감일·납부일을 확인해 주세요.');
        const details = decoded(row, 'details_json');
        if (!object(details)) issue(table, row, '결제수단 상세정보를 확인해 주세요.');
        else {
          if (
            details.linkedAccountId &&
            !backup.tables.payment_methods.some(
              (p) => p.id === details.linkedAccountId && p.type === 'account',
            )
          )
            issue(table, row, '결제 통장 연결을 확인해 주세요.');
          if (
            details.assetId &&
            !backup.tables.assets.some((a) => a.id === details.assetId && a.kind === 'asset')
          )
            issue(table, row, '자산 연결을 확인해 주세요.');
        }
      }
      if (table === 'assets' || table === 'payment_methods') {
        const details = decoded(row, table === 'assets' ? 'metadata_json' : 'details_json');
        if (object(details)) {
          const strings =
            table === 'assets'
              ? [
                  'institution',
                  'notes',
                  'rateType',
                  'term',
                  'repaymentMethod',
                  'conditions',
                  'fees',
                  'benefits',
                ]
              : [
                  'institution',
                  'accountKind',
                  'purpose',
                  'expiry',
                  'accountNumber',
                  'benefits',
                  'usagePeriodNote',
                  'notes',
                ];
          if (strings.some((key) => details[key] !== undefined && typeof details[key] !== 'string'))
            issue(table, row, '상세 텍스트의 형식을 확인해 주세요.');
          const amounts =
            table === 'assets'
              ? ['principal', 'monthlyPayment']
              : ['monthlyBudget', 'annualFee', 'creditLimit', 'performanceTarget'];
          if (amounts.some((key) => details[key] != null && !moneyValue(details[key])))
            issue(table, row, '상세 금액을 확인해 주세요.');
          if (
            details.rate != null &&
            (typeof details.rate !== 'number' ||
              !Number.isFinite(details.rate) ||
              details.rate < 0 ||
              details.rate > 100)
          )
            issue(table, row, '금리를 확인해 주세요.');
          if (
            details.cardKind !== undefined &&
            !['credit', 'debit'].includes(String(details.cardKind))
          )
            issue(table, row, '카드 종류를 확인해 주세요.');
        }
      }
      if (table === 'record_history') {
        member(table, row, 'actor_id');
        if (
          !Number.isSafeInteger(row.revision) ||
          Number(row.revision) < 0 ||
          !['create', 'update', 'delete', 'import', 'restore', 'review'].includes(
            String(row.action),
          ) ||
          !Number.isFinite(Date.parse(String(row.created_at)))
        )
          issue(table, row, '감사 이력의 버전·작업·시각을 확인해 주세요.');
        for (const key of ['before_json', 'after_json'])
          if (row[key] !== null && !object(decoded(row, key)))
            issue(table, row, '이력 스냅샷은 객체여야 해요.');
      }
      if (table === 'rules') ref(table, row, 'tag_id', 'tags', false);
      if (table === 'transactions') {
        ref(table, row, 'ledger_id', 'ledgers', false);
        ref(table, row, 'payment_method_id', 'payment_methods', false);
        ref(table, row, 'asset_id', 'assets');
        ref(table, row, 'to_asset_id', 'assets');
        member(table, row, 'updated_by');
        if (row.created_by !== null) member(table, row, 'created_by');
        if (
          (row.created_by === null) !== (row.created_at === null) ||
          (row.created_at !== null && !Number.isFinite(Date.parse(String(row.created_at))))
        )
          issue(table, row, '최초 작성자·작성 시각을 함께 확인해 주세요.');
        member(table, row, 'owner_id', true);
        jsonRefs(table, row, 'tag_ids', 'tags');
        if (
          !['income', 'expense', 'saving', 'transfer'].includes(String(row.type)) ||
          !moneyValue(row.amount) ||
          Number(row.amount) <= 0 ||
          !isDate(row.date)
        )
          issue(table, row, '거래 유형·금액·날짜를 확인해 주세요.');
        const allocations = decoded(row, 'allocations_json');
        if (
          !Array.isArray(allocations) ||
          allocations.some(
            (a) =>
              !object(a) ||
              !ids.assets.has(a.assetId) ||
              !moneyValue(a.amount) ||
              Number(a.amount) <= 0,
          )
        )
          issue(table, row, '거래 자산 배분을 확인해 주세요.');
      }
      if (table === 'asset_operations') {
        for (const key of ['from_asset_id', 'to_asset_id', 'asset_id'])
          ref(table, row, key, 'assets');
        member(table, row, 'created_by');
        if (
          !['transfer', 'adjustment'].includes(String(row.type)) ||
          !isDate(row.date) ||
          !moneyValue(row.amount, true)
        )
          issue(table, row, '자산 변동 종류·날짜·금액을 확인해 주세요.');
      }
      if (table === 'asset_movements') {
        ref(table, row, 'transaction_id', 'transactions', false);
        ref(table, row, 'asset_id', 'assets', false);
        ref(table, row, 'rule_id', 'rules', false);
      }
      if (table === 'asset_effects') {
        ref(table, row, 'transaction_id', 'transactions');
        ref(table, row, 'operation_id', 'asset_operations');
        ref(table, row, 'asset_id', 'assets', false);
        member(table, row, 'actor_id');
        if (
          (row.transaction_id === null) === (row.operation_id === null) ||
          !isDate(row.date) ||
          !moneyValue(row.amount, true) ||
          !moneyValue(row.savings_amount, true)
        )
          issue(table, row, '자산 반영 내역을 확인해 주세요.');
        if (
          row.transaction_id &&
          backup.tables.transactions.find((r) => r.id === row.transaction_id)?.deleted_at
        )
          issue(table, row, '삭제 거래의 자산 효과가 남아 있어요.');
        if (
          row.operation_id &&
          backup.tables.asset_operations.find((r) => r.id === row.operation_id)?.deleted_at
        )
          issue(table, row, '취소 자산 변동의 효과가 남아 있어요.');
      }
      if (table === 'planning_records') {
        ref(table, row, 'ledger_id', 'ledgers', false);
        const payload = decoded(row, 'payload_json');
        if (
          !object(payload) ||
          !['budget', 'goal', 'payroll', 'event', 'schedule'].includes(String(row.kind))
        )
          issue(table, row, '계획 형식을 확인해 주세요.');
        else {
          if (
            typeof payload.title !== 'string' ||
            !payload.title.trim() ||
            typeof payload.notes !== 'string' ||
            typeof payload.includeLinked !== 'boolean'
          )
            issue(table, row, '계획 이름·메모·집계 범위를 확인해 주세요.');
          if (
            row.kind === 'budget' &&
            (!['month', 'week', 'period'].includes(String(payload.cadence)) ||
              !['total', 'category'].includes(String(payload.budgetScope)))
          )
            issue(table, row, '예산 종류를 확인해 주세요.');
          if (
            row.kind === 'goal' &&
            (!['income', 'expense', 'savings'].includes(String(payload.metric)) ||
              !['atLeast', 'atMost'].includes(String(payload.direction)))
          )
            issue(table, row, '목표 집계 기준을 확인해 주세요.');
          if (
            row.kind === 'payroll' &&
            (!['none', 'floor10000', 'ceil10000'].includes(String(payload.rounding)) ||
              !Array.isArray(payload.lines) ||
              payload.lines.some(
                (l) =>
                  !object(l) ||
                  typeof l.id !== 'string' ||
                  typeof l.title !== 'string' ||
                  !moneyValue(l.amount) ||
                  !['none', 'floor10000', 'ceil10000'].includes(String(l.rounding)) ||
                  !['expense', 'savings', 'other'].includes(String(l.purpose)),
              ))
          )
            issue(table, row, '월급 배분 항목을 확인해 주세요.');
          if (
            row.kind === 'event' &&
            (!['transactions', 'manual'].includes(String(payload.actualMode)) ||
              (payload.actualAmount !== null && !moneyValue(payload.actualAmount)) ||
              typeof payload.evaluation !== 'string')
          )
            issue(table, row, '행사 결산 항목을 확인해 주세요.');
          if (
            row.kind === 'schedule' &&
            (!['once', 'monthly'].includes(String(payload.repeat)) ||
              !Array.isArray(payload.payments) ||
              payload.payments.some(
                (p) =>
                  !object(p) ||
                  !isDate(p.date) ||
                  !isDate(p.paidDate) ||
                  !moneyValue(p.amount) ||
                  typeof p.note !== 'string',
              ))
          )
            issue(table, row, '결제 일정 납부 기록을 확인해 주세요.');
          if (
            !isDate(payload.startDate) ||
            !isDate(payload.endDate) ||
            String(payload.startDate) > String(payload.endDate) ||
            !moneyValue(payload.amount)
          )
            issue(table, row, '계획 기간·금액을 확인해 주세요.');
          if (!Array.isArray(payload.tagIds) || payload.tagIds.some((id) => !ids.tags.has(id)))
            issue(table, row, '계획 태그 연결을 확인해 주세요.');
          if (payload.paymentMethodId && !ids.payment_methods.has(payload.paymentMethodId))
            issue(table, row, '계획 결제수단 연결을 확인해 주세요.');
          if (payload.assetId && !ids.assets.has(payload.assetId))
            issue(table, row, '계획 자산 연결을 확인해 주세요.');
          if (
            payload.ownerId &&
            payload.ownerId !== 'shared' &&
            !members.has(String(payload.ownerId))
          )
            issue(table, row, '계획 귀속을 확인해 주세요.');
          if (
            Array.isArray(payload.lines) &&
            payload.lines.some((l) => !object(l) || (l.assetId && !ids.assets.has(l.assetId)))
          )
            issue(table, row, '월급 배분 자산 연결을 확인해 주세요.');
        }
      }
      if (table === 'source_records') {
        const payload = decoded(row, 'payload_json');
        if (!object(payload) && !Array.isArray(payload))
          issue(table, row, '원본 증거 형식을 확인해 주세요.');
        if (
          !['transaction', 'plan', 'management', 'reference'].includes(String(row.kind)) ||
          !['pending', 'resolved', 'reference'].includes(String(row.status))
        )
          issue(table, row, '원본 검토 종류·상태를 확인해 주세요.');
        if (
          typeof row.source_id !== 'string' ||
          !row.source_id.trim() ||
          typeof row.source_location !== 'string' ||
          !row.source_location.trim() ||
          typeof row.note !== 'string' ||
          row.note.length > 5000
        )
          issue(table, row, '원본 위치·검토 메모를 확인해 주세요.');
      }
      if (table === 'import_records') {
        ref(table, row, 'transaction_id', 'transactions', false);
        member(table, row, 'actor_id');
        const payload = decoded(row, 'payload_json');
        if (
          !object(payload) ||
          !Array.isArray(payload.tagIds) ||
          payload.tagIds.some((id) => !ids.tags.has(id)) ||
          !Array.isArray(payload.allocations) ||
          payload.allocations.some((a) => !object(a) || !ids.assets.has(a.assetId)) ||
          !ids.ledgers.has(payload.ledgerId) ||
          !ids.payment_methods.has(payload.paymentMethodId) ||
          (payload.ownerId !== 'shared' && !members.has(String(payload.ownerId)))
        )
          issue(table, row, '가져오기 원본 연결을 확인해 주세요.');
      }
    }
  }
  const ledgerParents = new Map(backup.tables.ledgers.map((row) => [row.id, row.parent_id]));
  const resolvedLedgers = new Set<unknown>();
  for (const ledger of backup.tables.ledgers) {
    const path = new Set<unknown>();
    let current: unknown = ledger.id;
    while (current != null && !resolvedLedgers.has(current)) {
      if (path.has(current)) {
        issue('ledgers', ledger, '상위 가계부가 순환 연결되어 있어요.');
        break;
      }
      path.add(current);
      current = ledgerParents.get(current as string) ?? null;
    }
    path.forEach((id) => resolvedLedgers.add(id));
  }
  if (backup.tables.tag_groups.filter((r) => r.role === 'category').length > 1)
    issues.push('기본 분류 태그 유형이 두 개 이상이에요.');
  for (const tag of backup.tables.tags) {
    const seen = new Set<unknown>([tag.id]);
    let parent = tag.parent_id;
    while (parent) {
      if (seen.has(parent)) {
        issue('tags', tag, '상위 태그가 순환 연결되어 있어요.');
        break;
      }
      seen.add(parent);
      parent = backup.tables.tags.find((t) => t.id === parent)?.parent_id ?? null;
    }
  }
  for (const tx of backup.tables.transactions.filter(
    (t) => !t.deleted_at && ['income', 'expense'].includes(String(t.type)),
  )) {
    const allocations = decoded(tx, 'allocations_json');
    if (!Array.isArray(allocations) || allocations.some((a) => !object(a))) continue;
    const effects = backup.tables.asset_effects.filter((e) => e.transaction_id === tx.id);
    if (
      allocations.length &&
      allocations.reduce((sum, a) => sum + Number(a.amount), 0) !== tx.amount
    )
      issue('transactions', tx, '자산 배분 합계가 거래 금액과 달라요.');
    if (
      effects.length !== allocations.length ||
      allocations.some(
        (a) =>
          !effects.some(
            (e) =>
              e.asset_id === a.assetId &&
              e.amount === (tx.type === 'income' ? Number(a.amount) : -Number(a.amount)) &&
              e.date === tx.date,
          ),
      )
    )
      issue('transactions', tx, '거래와 자산 반영 기록이 일치하지 않아요.');
  }
  const imported = new Set<string>();
  for (const record of backup.tables.import_records) {
    const key = JSON.stringify([record.source_id, record.row_id]);
    if (imported.has(key)) issue('import_records', record, '원본 자료·행 ID가 중복돼요.');
    imported.add(key);
  }
  return [...issues, ...invariantIssues(backup)].slice(0, 100);
}
async function restoreContext(db: D1Database, session: Session, body: ObjectBody) {
  requireValue(body.mode === 'replace', '복원 정책은 전체 교체만 지원해요.');
  const backup = parseBackup(body.backup),
    columns = await schema(db),
    current = await exportBackup(db, session);
  if (body.baseRevision !== undefined) {
    requireValue(
      Number.isSafeInteger(body.baseRevision) && Number(body.baseRevision) >= 0,
      '원본 기준 버전을 확인해 주세요.',
    );
    if (
      backup.sourceHouseholdId !== session.householdId ||
      backup.sourceRevision !== body.baseRevision ||
      current.sourceRevision !== body.baseRevision
    )
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        '가져오기를 준비한 뒤 다른 변경이 저장되었어요. 최신 자료로 다시 미리보기를 만들어 주세요.',
      );
  }
  const mapping = object(body.memberMap) ? body.memberMap : {};
  const issues = referenceIssues(backup, columns),
    currentMembers = new Set(current.members.map((m) => m.id));
  for (const m of backup.members)
    if (typeof mapping[m.id] !== 'string' || !currentMembers.has(String(mapping[m.id])))
      issues.push(`${m.name}: 현재 가구 구성원과 연결해 주세요.`);
  if (backup.sourceHouseholdId === session.householdId) {
    const collisionQuery = backupTables
      .map(
        (table) =>
          `EXISTS(SELECT 1 FROM ${table} WHERE household_id<>? AND id IN (SELECT value FROM json_each(?)))`,
      )
      .join(' OR ');
    const bindings = backupTables.flatMap((table) => [
      session.householdId,
      JSON.stringify(backup.tables[table].map((r) => r.id)),
    ]);
    const collision = await db
      .prepare(`SELECT CASE WHEN ${collisionQuery} THEN 1 ELSE 0 END AS collided`)
      .bind(...bindings)
      .first<number>('collided');
    if (collision)
      issues.push('복원 ID가 다른 가구의 기존 항목과 충돌해요. 원본 가구 정보를 확인해 주세요.');
  }
  const destinations = backup.members.map((m) => mapping[m.id]);
  if (new Set(destinations).size !== destinations.length)
    issues.push('서로 다른 원본 구성원을 같은 사람에게 연결할 수 없어요.');
  return {
    backup,
    columns,
    current,
    mapping,
    issues,
    digest: await hash(
      stable({
        backup,
        memberMap: mapping,
        mode: 'replace',
        ...(body.baseRevision === undefined ? {} : { baseRevision: body.baseRevision }),
      }),
    ),
  };
}
export async function previewRestore(
  db: D1Database,
  session: Session,
  body: ObjectBody,
): Promise<RestorePreview> {
  await requireAdmin(db, session);
  const c = await restoreContext(db, session, body);
  return {
    digest: c.digest,
    revision: c.current.sourceRevision,
    counts: Object.fromEntries(backupTables.map((t) => [t, c.backup.tables[t].length])),
    currentCounts: Object.fromEntries(backupTables.map((t) => [t, c.current.tables[t].length])),
    issues: c.issues,
    members: c.backup.members,
    mode: 'replace',
  };
}
async function transformBackup(
  backup: BudgetBackup,
  current: BudgetBackup,
  h: string,
  mapping: ObjectBody,
): Promise<BudgetBackup['tables']> {
  const maps = Object.fromEntries(
    await Promise.all(
      backupTables.map(async (table) => [
        table,
        new Map(
          await Promise.all(
            backup.tables[table].map(
              async (row) =>
                [
                  String(row.id),
                  backup.sourceHouseholdId === h
                    ? String(row.id)
                    : `restore_${(await hash(stable([h, table, row.id]))).slice(0, 48)}`,
                ] as const,
            ),
          ),
        ),
      ]),
    ),
  ) as Record<BackupTable, Map<string, string>>;
  const ref = (table: BackupTable, value: unknown) =>
    value == null ? null : (maps[table].get(String(value)) ?? value);
  const member = (value: unknown) =>
    value == null || value === 'shared' ? value : mapping[String(value)];
  const transformed = structuredClone(backup.tables);
  for (const table of backupTables)
    for (const row of transformed[table]) {
      const oldId = String(row.id);
      row.id = maps[table].get(oldId)!;
      // main/purpose are legacy labels, not hierarchy privileges. Normalizing on
      // restore also permits moving historical main ledgers and multiple roots.
      if (table === 'ledgers') row.kind = 'purpose';
      if ('version' in row)
        row.version =
          Math.max(
            Number(row.version),
            Number(current.tables[table].find((r) => r.id === row.id)?.version ?? 0),
          ) + 1;
      const idFields: Partial<Record<BackupTable, Record<string, BackupTable>>> = {
        ledgers: { parent_id: 'ledgers' },
        tags: { group_id: 'tag_groups', parent_id: 'tags' },
        rules: { tag_id: 'tags' },
        transactions: {
          ledger_id: 'ledgers',
          payment_method_id: 'payment_methods',
          asset_id: 'assets',
          to_asset_id: 'assets',
        },
        asset_operations: {
          from_asset_id: 'assets',
          to_asset_id: 'assets',
          asset_id: 'assets',
          legacy_transaction_id: 'transactions',
        },
        asset_movements: { transaction_id: 'transactions', asset_id: 'assets', rule_id: 'rules' },
        asset_effects: {
          transaction_id: 'transactions',
          operation_id: 'asset_operations',
          asset_id: 'assets',
        },
        planning_records: { ledger_id: 'ledgers' },
        import_records: { transaction_id: 'transactions' },
      };
      for (const [key, target] of Object.entries(idFields[table] ?? {}))
        row[key] = ref(target, row[key]) as string | null;
      for (const key of ['owner_id', 'updated_by', 'created_by', 'actor_id'])
        if (key in row) row[key] = member(row[key]) as string | null;
      for (const [key, target] of [
        ['tag_ids', 'tags'],
        ['fixed_expense_tag_ids', 'tags'],
        ['ledger_ids', 'ledgers'],
      ] as const)
        if (key in row && row[key] !== null)
          row[key] = JSON.stringify(
            (JSON.parse(String(row[key])) as string[]).map((id) => ref(target, id)),
          );
      if (table === 'ledgers')
        row.tag_mappings = JSON.stringify(
          Object.fromEntries(
            Object.entries(JSON.parse(String(row.tag_mappings))).map(([a, b]) => [
              ref('tags', a),
              ref('tags', b),
            ]),
          ),
        );
      if (table === 'transactions')
        row.allocations_json = JSON.stringify(
          (JSON.parse(String(row.allocations_json)) as ObjectBody[]).map((a) => ({
            ...a,
            assetId: ref('assets', a.assetId),
          })),
        );
      if (table === 'assets') {
        const v = JSON.parse(String(row.metadata_json));
        if (v.ownerId) v.ownerId = member(v.ownerId);
        row.metadata_json = JSON.stringify(v);
      }
      if (table === 'payment_methods') {
        const v = JSON.parse(String(row.details_json));
        if (v.linkedAccountId) v.linkedAccountId = ref('payment_methods', v.linkedAccountId);
        if (v.assetId) v.assetId = ref('assets', v.assetId);
        row.details_json = JSON.stringify(v);
      }
      if (table === 'import_records') {
        const v = JSON.parse(String(row.payload_json)) as TransactionInput;
        v.ledgerId = String(ref('ledgers', v.ledgerId));
        v.paymentMethodId = String(ref('payment_methods', v.paymentMethodId));
        v.ownerId = member(v.ownerId) as TransactionInput['ownerId'];
        v.tagIds = v.tagIds.map((id) => String(ref('tags', id)));
        v.allocations = v.allocations.map((a) => ({
          ...a,
          assetId: String(ref('assets', a.assetId)),
        }));
        row.payload_json = JSON.stringify(v);
        row.content_hash = await hash(stable(v));
      }
      if (table === 'record_history') {
        const entityTables: Record<string, BackupTable> = {
          transaction: 'transactions',
          ledger: 'ledgers',
          asset: 'assets',
          tagGroup: 'tag_groups',
          tag: 'tags',
          assetOperation: 'asset_operations',
          paymentMethod: 'payment_methods',
          plan: 'planning_records',
          sourceRecord: 'source_records',
        };
        const target = entityTables[String(row.entity_type)];
        if (target) row.entity_id = String(ref(target, row.entity_id));
        row.ledger_id = ref('ledgers', row.ledger_id) as string | null;
        const snapshot = (value: unknown, key = ''): unknown => {
          if (Array.isArray(value))
            return value.map((v) => snapshot(v, key === 'tagIds' ? 'tagId' : key));
          if (object(value))
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, snapshot(v, k)]));
          if (['ownerId', 'createdBy', 'updatedBy', 'actorId'].includes(key))
            return member(value) ?? value;
          const refs: Record<string, BackupTable> = {
            ledgerId: 'ledgers',
            assetId: 'assets',
            fromAssetId: 'assets',
            toAssetId: 'assets',
            paymentMethodId: 'payment_methods',
            linkedAccountId: 'payment_methods',
            tagId: 'tags',
            groupId: 'tag_groups',
          };
          if (key === 'id' && target) return ref(target, value);
          return refs[key] ? ref(refs[key], value) : value;
        };
        for (const key of ['before_json', 'after_json'])
          if (row[key] !== null) row[key] = JSON.stringify(snapshot(JSON.parse(String(row[key]))));
      }
      if (table === 'planning_records') {
        const v = JSON.parse(String(row.payload_json));
        if (v.id) v.id = row.id;
        if (v.ledgerId) v.ledgerId = ref('ledgers', v.ledgerId);
        if (v.ownerId) v.ownerId = member(v.ownerId);
        if (v.paymentMethodId) v.paymentMethodId = ref('payment_methods', v.paymentMethodId);
        if (v.assetId) v.assetId = ref('assets', v.assetId);
        if (v.tagIds) v.tagIds = v.tagIds.map((id: string) => ref('tags', id));
        if (v.lines)
          v.lines = v.lines.map((l: ObjectBody) => ({ ...l, assetId: ref('assets', l.assetId) }));
        row.payload_json = JSON.stringify(v);
      }
    }
  return transformed;
}
interface AuditDraft {
  entityType: string;
  entityId: string;
  ledgerId?: string | null;
  action: 'create' | 'update' | 'delete' | 'import' | 'restore' | 'review';
  before: ObjectBody | null;
  after: ObjectBody | null;
}
function transactionSnapshot(t: ObjectBody): ObjectBody {
  return {
    id: t.id,
    ledgerId: t.ledger_id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    type: t.type,
    ownerId: t.owner_id,
    paymentMethodId: t.payment_method_id,
    tagIds: JSON.parse(String(t.tag_ids ?? '[]')),
    allocations: JSON.parse(String(t.allocations_json ?? '[]')),
    createdBy: t.created_by ?? null,
    createdAt: t.created_at ?? null,
    updatedBy: t.updated_by,
    updatedAt: t.updated_at,
    deletedAt: t.deleted_at ?? null,
  };
}
function auditStatements(
  db: D1Database,
  h: string,
  u: string,
  revision: number,
  now: string,
  audits: AuditDraft[],
) {
  if (!audits.length) return [];
  const rows = audits.map((a) => ({
    id: crypto.randomUUID(),
    revision,
    entity_type: a.entityType,
    entity_id: a.entityId,
    ledger_id: a.ledgerId ?? null,
    actor_id: u,
    created_at: now,
    action: a.action,
    before_json: a.before === null ? null : JSON.stringify(a.before),
    after_json: a.after === null ? null : JSON.stringify(a.after),
  }));
  const columns = Object.keys(rows[0]);
  return [
    db
      .prepare(
        `INSERT INTO record_history(household_id,${columns.join(',')}) SELECT ?,${columns.map((c) => `json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`,
      )
      .bind(h, JSON.stringify(rows)),
  ];
}
async function dataCommit(
  db: D1Database,
  session: Session,
  body: ObjectBody,
  scope: string,
  statements: D1PreparedStatement[],
  extra: ObjectBody = {},
  audits: AuditDraft[] = [],
) {
  const op = await identity(db, session, body, scope);
  if (op.previous) return op.previous;
  const revision = body.expectedRevision;
  requireValue(
    typeof revision === 'number' && Number.isInteger(revision) && revision >= 0,
    '미리보기 기준 버전이 필요해요.',
  );
  const h = session.householdId,
    u = session.user.id,
    now = new Date().toISOString();
  const resultSelect =
    "json_set(?, '$.revision',(SELECT revision FROM households WHERE id=?),'$.hierarchyVersion',(SELECT hierarchy_version FROM households WHERE id=?))";
  const restoring = scope === 'data.restore';
  const permissionSql = restoring
    ? " AND EXISTS(SELECT 1 FROM users WHERE household_id=? AND id=? AND role='admin')"
    : '';
  const batch = [
    db
      .prepare(
        `INSERT INTO mutation_receipts(household_id,user_id,mutation_id,request_hash,entity_id,created_at,guard_valid) VALUES(?,?,?,?,?,?,(SELECT CASE WHEN revision=?${permissionSql} THEN 1 ELSE 0 END FROM households WHERE id=?))`,
      )
      .bind(
        h,
        u,
        op.mutationId,
        op.requestHash,
        op.mutationId,
        now,
        revision,
        ...(restoring ? [h, u] : []),
        h,
      ),
    ...statements,
    ...(restoring ? [hierarchyIncrement(db, h)] : []),
    ...auditStatements(
      db,
      h,
      u,
      Number(revision) + 1,
      now,
      audits.length
        ? audits
        : [
            {
              entityType: scope,
              entityId: op.mutationId,
              action: scope === 'data.restore' ? 'restore' : 'import',
              before: null,
              after: extra,
            },
          ],
    ),
    db.prepare('UPDATE households SET revision=revision+1 WHERE id=?').bind(h),
    db
      .prepare(
        'INSERT INTO changes(household_id,revision,entity_type,entity_id,ledger_id,actor_id,created_at) SELECT id,revision,?,?,NULL,?,? FROM households WHERE id=?',
      )
      .bind(scope, op.mutationId, u, now, h),
    db
      .prepare(
        `UPDATE mutation_receipts SET result_json=${resultSelect} WHERE household_id=? AND user_id=? AND mutation_id=?`,
      )
      .bind(JSON.stringify(extra), h, h, h, u, op.mutationId),
    db
      .prepare(
        'SELECT result_json FROM mutation_receipts WHERE household_id=? AND user_id=? AND mutation_id=?',
      )
      .bind(h, u, op.mutationId),
  ];
  try {
    const results = await db.batch<{ result_json: string }>(batch);
    return JSON.parse(results.at(-1)!.results[0].result_json) as MutationResult;
  } catch (error) {
    const previous = await replay(db, session, op.mutationId, op.requestHash);
    if (previous) return previous;
    if (String(error).includes('mutation_version_guard')) {
      if (restoring) await requireAdmin(db, session);
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        '다른 수정이 반영되었어요. 최신 상태로 미리보기를 다시 확인해 주세요.',
      );
    }
    throw error;
  }
}
export async function restoreBackup(db: D1Database, session: Session, body: ObjectBody) {
  await requireAdmin(db, session);
  const prior = await identity(db, session, body, 'data.restore');
  if (prior.previous) return prior.previous;
  requireValue(body.confirmReplace === true, '전체 교체 내용을 확인해 주세요.');
  if (body.baseRevision !== undefined && body.expectedRevision !== body.baseRevision)
    throw new ApiError(
      409,
      'VERSION_CONFLICT',
      '가져오기 기준 버전과 저장 버전이 달라요. 최신 자료로 다시 확인해 주세요.',
    );
  const c = await restoreContext(db, session, body);
  requireValue(
    c.issues.length === 0,
    `복원 자료를 확인해 주세요. ${c.issues.slice(0, 3).join(' ')}`,
  );
  requireValue(
    body.digest === c.digest,
    '미리보기 이후 파일이나 구성원 연결이 바뀌었어요. 다시 확인해 주세요.',
  );
  const tables = await transformBackup(c.backup, c.current, session.householdId, c.mapping);
  const currentHistory = new Map(c.current.tables.record_history.map((r) => [r.id, r]));
  tables.record_history = [
    ...tables.record_history.filter((r) => !currentHistory.has(r.id)),
    ...currentHistory.values(),
  ];
  const audits: AuditDraft[] = [];
  const restoreEntities: Partial<Record<BackupTable, string>> = {
    transactions: 'transaction',
    ledgers: 'ledger',
    assets: 'asset',
    payment_methods: 'paymentMethod',
    tag_groups: 'tagGroup',
    tags: 'tag',
    asset_operations: 'assetOperation',
    planning_records: 'plan',
    source_records: 'sourceRecord',
  };
  for (const [table, entityType] of Object.entries(restoreEntities) as [BackupTable, string][]) {
    const beforeRows = new Map(c.current.tables[table].map((r) => [r.id, r])),
      afterRows = new Map(tables[table].map((r) => [r.id, r]));
    const snapshot = (row: DataRow): ObjectBody => {
      if (table === 'transactions') return transactionSnapshot(row);
      if (table === 'source_records')
        return {
          id: row.id,
          sourceId: row.source_id,
          sourceLocation: row.source_location,
          kind: row.kind,
          note: row.note,
          status: row.status,
        };
      if (table === 'planning_records')
        return { ...JSON.parse(String(row.payload_json)), archived: row.archived === 1 };
      return Object.fromEntries(
        Object.entries(row)
          .filter(([k]) => k !== 'version')
          .map(([k, v]) => [
            k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            typeof v === 'string' &&
            (k.endsWith('_json') ||
              ['tag_ids', 'ledger_ids', 'fixed_expense_tag_ids', 'tag_mappings'].includes(k))
              ? JSON.parse(v)
              : v,
          ]),
      );
    };
    for (const id of new Set([...beforeRows.keys(), ...afterRows.keys()])) {
      const before = beforeRows.get(id),
        after = afterRows.get(id),
        oldSnapshot = before ? snapshot(before) : null,
        nextSnapshot = after ? snapshot(after) : null;
      if (stable(oldSnapshot) !== stable(nextSnapshot))
        audits.push({
          entityType,
          entityId: String(id),
          ledgerId: (after?.ledger_id ?? before?.ledger_id ?? null) as string | null,
          action: 'restore',
          before: oldSnapshot,
          after: nextSnapshot,
        });
    }
  }
  const statements: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys=ON')];
  for (const table of [...backupTables].reverse())
    statements.push(
      db.prepare(`DELETE FROM ${table} WHERE household_id=?`).bind(session.householdId),
    );
  for (const table of backupTables) {
    if (!tables[table].length) continue;
    const columns = c.columns[table].map((v) => v.name);
    statements.push(
      db
        .prepare(
          `INSERT INTO ${table}(household_id,${columns.join(',')}) SELECT ?,${columns.map((v) => `json_extract(value,'$.${v}')`).join(',')} FROM json_each(?)`,
        )
        .bind(session.householdId, JSON.stringify(tables[table])),
    );
  }
  return dataCommit(
    db,
    session,
    body,
    'data.restore',
    statements,
    {
      restored: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
    },
    audits,
  );
}

function validateImportRow(row: ImportRow, data: Bootstrap): string[] {
  const errors: string[] = [],
    t = normalizedImportTransaction(row.transaction);
  if (typeof row.rowId !== 'string' || !row.rowId.trim() || row.rowId.length > 160)
    errors.push('원본 행 ID가 필요해요.');
  if (!t || typeof t !== 'object') return [...errors, '거래 정보가 없어요.'];
  if (t.id !== undefined) errors.push('가져오기는 기존 거래를 수정하지 않아요.');
  const ledger = data.ledgers.find((l) => l.id === t.ledgerId);
  if (!ledger || ledger.archived) errors.push('사용 중인 가계부를 선택해 주세요.');
  if (!isDate(t.date)) errors.push('날짜는 유효한 YYYY-MM-DD여야 해요.');
  if (typeof t.description !== 'string' || !t.description.trim() || t.description.length > 240)
    errors.push('내역은 1~240자로 입력해 주세요.');
  if (!moneyValue(t.amount) || t.amount <= 0 || t.amount > 1_000_000_000_000)
    errors.push('금액은 양의 정수 원 단위여야 해요.');
  if (!['income', 'expense'].includes(t.type)) errors.push('유형은 수입 또는 지출이어야 해요.');
  if (t.ownerId !== 'shared' && !data.users.some((u) => u.id === t.ownerId))
    errors.push('귀속을 확인해 주세요.');
  if (!data.paymentMethods.some((p) => p.id === t.paymentMethodId && !p.archived))
    errors.push('사용 중인 결제수단을 선택해 주세요.');
  if (
    !Array.isArray(t.tagIds) ||
    new Set(t.tagIds).size !== t.tagIds.length ||
    t.tagIds.length > 30
  )
    errors.push('태그 목록을 확인해 주세요.');
  else {
    const groupCounts = new Map<string, number>();
    for (const id of t.tagIds) {
      const tag = data.tags.find((v) => v.id === id),
        group = data.tagGroups.find((g) => g.id === tag?.groupId);
      if (
        !tag ||
        tag.archived ||
        !group ||
        group.archived ||
        group.appliesTo !== 'transaction' ||
        (group.ledgerIds && !group.ledgerIds.includes(t.ledgerId))
      ) {
        errors.push('이 가계부에서 사용할 수 없는 태그가 있어요.');
        continue;
      }
      groupCounts.set(group.id, (groupCounts.get(group.id) ?? 0) + 1);
      if (tag.parentId && !t.tagIds.includes(tag.parentId))
        errors.push('하위 태그의 상위 분류도 선택해 주세요.');
    }
    for (const [id, count] of groupCounts)
      if (count > 1 && data.tagGroups.find((g) => g.id === id)?.selectionMode === 'single')
        errors.push('단일 선택 태그 유형에 옵션이 여러 개 있어요.');
  }
  if (
    !Array.isArray(t.allocations) ||
    t.allocations.length > 30 ||
    !t.allocations.every((a) => object(a))
  )
    errors.push('자산 배분을 확인해 주세요.');
  else {
    if (new Set(t.allocations.map((a) => a.assetId)).size !== t.allocations.length)
      errors.push('중복 자산 배분이 있어요.');
    for (const a of t.allocations) {
      const asset = data.assets.find((v) => v.id === a.assetId);
      if (
        !asset ||
        asset.kind !== 'asset' ||
        asset.archived ||
        !moneyValue(a.amount) ||
        a.amount <= 0
      )
        errors.push('자산 배분 대상·금액을 확인해 주세요.');
      if (asset?.openingDate && t.date < asset.openingDate)
        errors.push('자산 기준일 이전에 배분할 수 없어요.');
    }
    if (t.allocations.length && t.allocations.reduce((sum, a) => sum + a.amount, 0) !== t.amount)
      errors.push('자산 배분 합계가 거래 금액과 달라요.');
  }
  return [...new Set(errors)];
}
function normalizedImportTransaction(input: TransactionInput): TransactionInput {
  return {
    ...input,
    description:
      typeof input.description === 'string'
        ? input.description.trim().normalize('NFC')
        : input.description,
  };
}
function importInput(body: ObjectBody): { sourceId: string; rows: ImportRow[] } {
  const sourceId = text(body.sourceId, '원본 자료 ID', 240);
  requireValue(
    Array.isArray(body.rows) &&
      body.rows.length > 0 &&
      body.rows.length <= 2000 &&
      body.rows.every((r) => object(r) && object(r.transaction)),
    '가져오기 자료는 한 번에 1~2,000행으로 보내 주세요.',
  );
  return { sourceId, rows: body.rows as unknown as ImportRow[] };
}
export async function previewImport(
  db: D1Database,
  session: Session,
  body: ObjectBody,
): Promise<ImportPreview> {
  const { sourceId, rows } = importInput(body),
    data = await bootstrap(db, session);
  const imports = await db
    .prepare('SELECT row_id,content_hash FROM import_records WHERE household_id=? AND source_id=?')
    .bind(session.householdId, sourceId)
    .all<{ row_id: string; content_hash: string }>();
  const prior = new Map(imports.results.map((r) => [r.row_id, r.content_hash])),
    seen = new Set<string>();
  const previews = await Promise.all(
    rows.map(async (row) => {
      const errors = validateImportRow(row, data),
        contentHash = await hash(stable(normalizedImportTransaction(row.transaction)));
      if (seen.has(row.rowId)) errors.push('파일 안에 원본 행 ID가 중복돼요.');
      seen.add(row.rowId);
      const duplicate = prior.get(row.rowId) === contentHash;
      if (prior.has(row.rowId) && !duplicate)
        errors.push('같은 원본 행을 다른 내용으로 이미 가져왔어요. 원본 기록을 확인해 주세요.');
      return {
        ...row,
        errors,
        status: errors.length
          ? ('error' as const)
          : duplicate
            ? ('duplicate' as const)
            : ('ready' as const),
      };
    }),
  );
  const ready = previews.filter((r) => r.status === 'ready');
  return {
    sourceId,
    digest: await hash(stable({ sourceId, rows })),
    revision: data.revision,
    rows: previews,
    ready: ready.length,
    duplicate: previews.filter((r) => r.status === 'duplicate').length,
    errors: previews.filter((r) => r.status === 'error').length,
    income: ready
      .filter((r) => r.transaction.type === 'income')
      .reduce((sum, r) => sum + r.transaction.amount, 0),
    expense: ready
      .filter((r) => r.transaction.type === 'expense')
      .reduce((sum, r) => sum + r.transaction.amount, 0),
  };
}
export async function applyImport(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'data.import');
  if (op.previous) return op.previous;
  const preview = await previewImport(db, session, body);
  requireValue(
    body.digest === preview.digest,
    '미리보기 이후 자료가 변경되었어요. 다시 확인해 주세요.',
  );
  requireValue(
    body.confirmImport === true && preview.errors === 0,
    '오류를 수정하고 가져올 내역을 확인해 주세요.',
  );
  const data = await bootstrap(db, session),
    now = new Date().toISOString(),
    h = session.householdId;
  // The single revision guard below protects every reference and savings policy read above.
  requireValue(
    preview.revision === data.revision,
    '다른 수정이 반영되었어요. 미리보기를 다시 확인해 주세요.',
  );
  const transactions: ObjectBody[] = [],
    effects: ObjectBody[] = [],
    records: ObjectBody[] = [],
    assets = new Set<string>();
  for (const row of preview.rows.filter((r) => r.status === 'ready')) {
    const id = `import_${(await hash(stable([h, preview.sourceId, row.rowId]))).slice(0, 48)}`,
      t = normalizedImportTransaction(row.transaction);
    transactions.push({
      id,
      ledger_id: t.ledgerId,
      date: t.date,
      description: t.description.trim(),
      amount: t.amount,
      type: t.type,
      owner_id: t.ownerId,
      payment_method_id: t.paymentMethodId,
      tag_ids: JSON.stringify(t.tagIds),
      allocations_json: JSON.stringify(t.allocations),
      updated_at: now,
      updated_by: session.user.id,
      created_by: null,
      created_at: null,
      category: '',
    });
    t.allocations.forEach((a, index) => {
      const amount = t.type === 'income' ? a.amount : -a.amount,
        tracking = Number(data.assets.find((v) => v.id === a.assetId)?.trackSavings ?? false);
      assets.add(a.assetId);
      effects.push({
        id: `${id}:${index}`,
        transaction_id: id,
        asset_id: a.assetId,
        amount,
        savings_amount: tracking ? amount : 0,
        savings_tracking: tracking,
        date: t.date,
        description: t.description.trim(),
        actor_id: session.user.id,
      });
    });
    records.push({
      id,
      source_id: preview.sourceId,
      row_id: row.rowId,
      content_hash: await hash(stable(normalizedImportTransaction(t))),
      payload_json: JSON.stringify(normalizedImportTransaction(t)),
      transaction_id: id,
      imported_at: now,
      actor_id: session.user.id,
      batch_id: body.mutationId,
    });
  }
  const statements: D1PreparedStatement[] = [];
  for (const [table, rows] of [
    ['transactions', transactions],
    ['asset_effects', effects],
    ['import_records', records],
  ] as const) {
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    statements.push(
      db
        .prepare(
          `INSERT INTO ${table}(household_id,${columns.join(',')}) SELECT ?,${columns.map((c) => `json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`,
        )
        .bind(h, JSON.stringify(rows)),
    );
  }
  if (assets.size)
    statements.push(
      db
        .prepare(
          'UPDATE assets SET version=version+1 WHERE household_id=? AND id IN (SELECT value FROM json_each(?))',
        )
        .bind(h, JSON.stringify([...assets])),
    );
  return dataCommit(
    db,
    session,
    body,
    'data.import',
    statements,
    {
      imported: transactions.length,
      duplicates: preview.duplicate,
    },
    transactions.map((t) => ({
      entityType: 'transaction',
      entityId: String(t.id),
      ledgerId: String(t.ledger_id),
      action: 'import',
      before: null,
      after: transactionSnapshot(t),
    })),
  );
}
export async function dataHistory(db: D1Database, session: Session): Promise<RecordHistory[]> {
  const rows = await db
    .prepare(
      `SELECT r.id AS id,r.revision AS revision,r.entity_type AS entityType,r.entity_id AS entityId,r.actor_id AS actorId,u.name AS actorName,r.created_at AS createdAt,r.action,r.before_json,r.after_json FROM record_history r JOIN users u ON u.id=r.actor_id AND u.household_id=r.household_id WHERE r.household_id=?
    UNION ALL SELECT 'legacy:'||c.revision,c.revision,c.entity_type,c.entity_id,c.actor_id,u.name,c.created_at,'unknown',NULL,NULL FROM changes c JOIN users u ON u.id=c.actor_id AND u.household_id=c.household_id WHERE c.household_id=? AND NOT EXISTS(SELECT 1 FROM record_history r WHERE r.household_id=c.household_id AND r.revision=c.revision AND r.created_at=c.created_at)
    ORDER BY createdAt DESC,revision DESC,id DESC LIMIT 100`,
    )
    .bind(session.householdId, session.householdId)
    .all<Record<string, unknown>>();
  return rows.results.map(({ before_json, after_json, ...row }) => ({
    ...row,
    before: before_json == null ? null : JSON.parse(String(before_json)),
    after: after_json == null ? null : JSON.parse(String(after_json)),
  })) as RecordHistory[];
}

export async function sourceRecords(db: D1Database, session: Session) {
  const rows = await db
    .prepare(
      "SELECT id,source_id AS sourceId,source_location AS sourceLocation,kind,payload_json,note,status,version FROM source_records WHERE household_id=? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,source_id,source_location,id",
    )
    .bind(session.householdId)
    .all<{
      id: string;
      sourceId: string;
      sourceLocation: string;
      kind: string;
      payload_json: string;
      note: string;
      status: string;
      version: number;
    }>();
  return rows.results.map(({ payload_json, ...row }) => ({
    ...row,
    payload: JSON.parse(payload_json),
  }));
}
export async function patchSourceRecord(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
) {
  const scope = `sourceRecord.patch:${id}`,
    op = await identity(db, session, body, scope);
  if (op.previous) return op.previous;
  const current = await db
    .prepare('SELECT id,note,status,version FROM source_records WHERE household_id=? AND id=?')
    .bind(session.householdId, id)
    .first<{ id: string; note: string; status: string; version: number }>();
  if (!current) throw new ApiError(404, 'NOT_FOUND', '원본 검토 항목을 찾을 수 없어요.');
  requireValue(
    typeof body.expectedVersion === 'number' && Number.isSafeInteger(body.expectedVersion),
    '검토 항목 버전이 필요해요.',
  );
  if (body.expectedVersion !== current.version)
    throw new ApiError(
      409,
      'VERSION_CONFLICT',
      '다른 검토 내용이 저장되었어요. 최신 내용을 확인해 주세요.',
    );
  requireValue(
    ![
      'payload',
      'payload_json',
      'sourceId',
      'source_id',
      'sourceLocation',
      'source_location',
      'kind',
    ].some((key) => Object.hasOwn(body, key)),
    '원본 자료와 출처는 수정할 수 없어요. 검토 메모와 상태를 변경해 주세요.',
  );
  const note = body.note === undefined ? current.note : body.note,
    status = body.status === undefined ? current.status : body.status;
  requireValue(
    typeof note === 'string' && note.length <= 5000,
    '검토 메모는 5,000자 이내로 입력해 주세요.',
  );
  requireValue(
    ['pending', 'resolved', 'reference'].includes(String(status)),
    '검토 상태를 확인해 주세요.',
  );
  return dataCommit(
    db,
    session,
    body,
    scope,
    [
      db
        .prepare(
          'UPDATE source_records SET note=?,status=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(note, String(status), session.householdId, id),
    ],
    { sourceRecordId: id },
    [
      {
        entityType: 'sourceRecord',
        entityId: id,
        action: 'review',
        before: { note: current.note, status: current.status },
        after: { note, status },
      },
    ],
  );
}

/** Restoring raw tables must preserve the same money/relationship rules as normal edits. */
function invariantIssues(backup: BudgetBackup): string[] {
  const issues: string[] = [];
  const tables = backup.tables;
  const maps = Object.fromEntries(
    backupTables.map((table) => [table, new Map(tables[table].map((row) => [row.id, row]))]),
  ) as Record<BackupTable, Map<unknown, DataRow>>;
  const issue = (table: BackupTable, row: DataRow, message: string) => {
    if (issues.length < 100) issues.push(`${table} / ${String(row.id).slice(0, 80)}: ${message}`);
  };
  const decode = (row: DataRow, key: string): unknown => {
    try {
      return JSON.parse(String(row[key]));
    } catch {
      return null;
    }
  };
  const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  const normalAsset = (id: unknown) => !id || maps.assets.get(id)?.kind === 'asset';
  const tagNames = new Set<string>();
  for (const tag of tables.tags) {
    const key = JSON.stringify([tag.group_id, tag.parent_id ?? null, tag.name]);
    if (tagNames.has(key)) issue('tags', tag, '같은 유형·상위 옵션 안에 태그 이름이 중복돼요.');
    tagNames.add(key);
    const parent = maps.tags.get(tag.parent_id),
      group = maps.tag_groups.get(tag.group_id),
      parentGroup = maps.tag_groups.get(parent?.group_id);
    if (
      parent &&
      (parent.group_id === tag.group_id || group?.applies_to !== parentGroup?.applies_to)
    )
      issue('tags', tag, '상위 태그는 같은 적용 대상의 다른 유형이어야 해요.');
  }
  const checkTags = (table: 'transactions' | 'assets', row: DataRow) => {
    const selected = decode(row, 'tag_ids');
    if (!Array.isArray(selected)) return;
    if (new Set(selected).size !== selected.length) issue(table, row, '태그가 중복 선택되었어요.');
    const counts = new Map<unknown, number>();
    for (const id of selected) {
      const tag = maps.tags.get(id),
        group = maps.tag_groups.get(tag?.group_id);
      if (!tag || !group) continue;
      if (group.applies_to !== (table === 'assets' ? 'asset' : 'transaction'))
        issue(table, row, '태그 유형의 적용 대상이 달라요.');
      if (tag.parent_id && !selected.includes(tag.parent_id))
        issue(table, row, '하위 태그의 상위 옵션도 함께 선택해야 해요.');
      const count = (counts.get(group.id) ?? 0) + 1;
      counts.set(group.id, count);
      if (group.selection_mode === 'single' && count > 1)
        issue(table, row, '단일 선택 유형에 태그가 여러 개 있어요.');
    }
  };
  for (const row of tables.assets) {
    checkTags('assets', row);
    if (row.kind === 'liability' && (Number(row.opening_balance) < 0 || row.track_savings !== 0))
      issue('assets', row, '부채의 최초 잔액은 음수일 수 없고 저축 대상으로 지정할 수 없어요.');
    const balance = tables.asset_effects
      .filter((e) => e.asset_id === row.id)
      .reduce((sum, e) => sum + Number(e.amount), Number(row.opening_balance));
    if (!Number.isSafeInteger(balance))
      issue('assets', row, '자산 잔액 합계가 정확히 표현할 수 있는 정수 범위를 벗어났어요.');
  }
  for (const row of tables.payment_methods) {
    const details = decode(row, 'details_json');
    if (!object(details)) continue;
    if (details.linkedAccountId && row.type !== 'card')
      issue('payment_methods', row, '결제 통장은 카드에만 연결할 수 있어요.');
    if (details.assetId && row.type === 'card')
      issue('payment_methods', row, '자산은 통장·현금 항목에 연결해 주세요.');
  }
  for (const row of tables.rules)
    if (!['asset-expense', 'asset-income', 'saving', 'transfer'].includes(String(row.type)))
      issue('rules', row, '기존 규칙 유형을 확인해 주세요.');
  for (const tx of tables.transactions) {
    if (!tx.deleted_at && ['income', 'expense'].includes(String(tx.type)))
      checkTags('transactions', tx);
    const allocations = decode(tx, 'allocations_json');
    if (!Array.isArray(allocations) || !allocations.every(object)) continue;
    if (new Set(allocations.map((a) => a.assetId)).size !== allocations.length)
      issue('transactions', tx, '자산 배분 대상이 중복돼요.');
    for (const allocation of allocations) {
      const asset = maps.assets.get(allocation.assetId);
      if (
        asset?.kind !== 'asset' ||
        (asset.opening_date && String(tx.date) < String(asset.opening_date))
      )
        issue('transactions', tx, '일반 자산 또는 최초 잔액 기준일 이후로 배분해 주세요.');
    }
  }
  const effectKeys = new Set<string>();
  for (const e of tables.asset_effects) {
    const key = JSON.stringify([e.transaction_id, e.operation_id, e.asset_id]);
    if (effectKeys.has(key)) issue('asset_effects', e, '같은 기록에 자산이 중복 반영돼요.');
    effectKeys.add(key);
    const asset = maps.assets.get(e.asset_id);
    if (asset?.opening_date && String(e.date) < String(asset.opening_date))
      issue('asset_effects', e, '자산 기준일 이전의 반영 기록이 있어요.');
    if (e.transaction_id && e.savings_amount !== (e.savings_tracking ? e.amount : 0))
      issue('asset_effects', e, '거래 저축 정책과 반영 금액이 일치하지 않아요.');
  }
  for (const op of tables.asset_operations) {
    const effects = tables.asset_effects.filter((e) => e.operation_id === op.id);
    if (op.deleted_at) {
      if (effects.length) issue('asset_operations', op, '취소한 변동의 잔액 반영이 남아 있어요.');
      continue;
    }
    if (op.type === 'transfer') {
      const assets = [op.from_asset_id, op.to_asset_id].map((id) => maps.assets.get(id));
      if (
        op.asset_id !== null ||
        op.target_balance !== null ||
        !op.from_asset_id ||
        !op.to_asset_id ||
        op.from_asset_id === op.to_asset_id ||
        Number(op.amount) <= 0 ||
        assets.some((a) => a?.kind !== 'asset')
      )
        issue('asset_operations', op, '자산 이동의 출금·입금 자산과 금액을 확인해 주세요.');
      if (
        effects.length !== 2 ||
        !effects.some(
          (e) =>
            e.asset_id === op.from_asset_id &&
            e.amount === -Number(op.amount) &&
            e.date === op.date,
        ) ||
        !effects.some(
          (e) => e.asset_id === op.to_asset_id && e.amount === op.amount && e.date === op.date,
        )
      )
        issue('asset_operations', op, '자산 이동과 입출금 효과가 일치하지 않아요.');
      const bothTracking = effects.length === 2 && effects.every((e) => e.savings_tracking === 1);
      if (
        effects.some(
          (e) => e.savings_amount !== (bothTracking ? 0 : e.savings_tracking ? e.amount : 0),
        )
      )
        issue('asset_operations', op, '자산 이동의 저축 집계 정책이 일치하지 않아요.');
    } else if (op.type === 'adjustment') {
      const asset = maps.assets.get(op.asset_id);
      if (
        !op.asset_id ||
        op.from_asset_id !== null ||
        op.to_asset_id !== null ||
        !moneyValue(op.target_balance, true) ||
        (asset?.kind === 'liability' && Number(op.target_balance) < 0)
      )
        issue('asset_operations', op, '잔액 조정 대상과 목표 잔액을 확인해 주세요.');
      if (
        effects.length !== 1 ||
        !effects.some(
          (e) =>
            e.asset_id === op.asset_id &&
            e.amount === op.amount &&
            e.date === op.date &&
            e.savings_amount === 0 &&
            e.savings_tracking === 0,
        )
      )
        issue('asset_operations', op, '잔액 조정과 자산 반영 효과가 일치하지 않아요.');
    }
  }
  const totalBudgets: { row: DataRow; p: ObjectBody }[] = [];
  for (const row of tables.planning_records) {
    const p = decode(row, 'payload_json');
    if (!object(p)) continue;
    const ledger = maps.ledgers.get(row.ledger_id);
    if (
      (p.ledgerId !== undefined && p.ledgerId !== row.ledger_id) ||
      (p.kind !== undefined && p.kind !== row.kind)
    )
      issue('planning_records', row, '계획의 원본 가계부·종류가 일치하지 않아요.');
    const duration = (Date.parse(String(p.endDate)) - Date.parse(String(p.startDate))) / 86400000;
    if (duration > 3660 || String(p.startDate) < '0001-01-01' || String(p.endDate) > '9998-12-31')
      issue('planning_records', row, '계획 기간은 1~9998년 사이, 최대 10년 이내여야 해요.');
    if (Array.isArray(p.tagIds)) {
      if (
        new Set(p.tagIds).size !== p.tagIds.length ||
        p.tagIds.some(
          (id) => maps.tag_groups.get(maps.tags.get(id)?.group_id)?.applies_to !== 'transaction',
        )
      )
        issue('planning_records', row, '계획 조건에는 중복 없는 거래 태그를 선택해 주세요.');
      if (
        row.kind === 'budget' &&
        ((p.budgetScope === 'total' && p.tagIds.length > 0) ||
          (p.budgetScope === 'category' && !p.tagIds.length) ||
          (p.cadence === 'week' && duration > 6))
      )
        issue('planning_records', row, '전체·항목·주간 예산의 조건을 확인해 주세요.');
    }
    if (
      row.kind === 'goal' &&
      (!normalAsset(p.assetId) ||
        (p.metric !== 'savings' && p.assetId) ||
        (p.metric === 'savings' &&
          (!Array.isArray(p.tagIds) || p.tagIds.length || p.paymentMethodId || p.ownerId)))
    )
      issue('planning_records', row, '저축 목표는 가구 전체 또는 일반 자산을 집계해야 해요.');
    if (row.kind === 'payroll' && Array.isArray(p.lines) && p.lines.every(object)) {
      if (
        new Set(p.lines.map((l) => l.id)).size !== p.lines.length ||
        p.lines.some((l) => !normalAsset(l.assetId))
      )
        issue('planning_records', row, '월급 배분 번호·자산을 확인해 주세요.');
      try {
        if (
          !Number.isSafeInteger(
            payrollSummary({
              ...p,
              id: String(row.id),
              version: Number(row.version),
            } as unknown as PayrollPlan).allocated,
          )
        )
          issue('planning_records', row, '월급 배분 합계가 허용 범위를 벗어났어요.');
      } catch {
        issue('planning_records', row, '월급 배분 계산을 확인해 주세요.');
      }
    }
    if (
      row.kind === 'event' &&
      ((p.actualMode === 'manual' && !moneyValue(p.actualAmount)) ||
        (p.actualMode === 'transactions' && p.actualAmount !== null))
    )
      issue('planning_records', row, '행사 실적 방식과 입력 금액을 확인해 주세요.');
    if (row.kind === 'schedule' && Array.isArray(p.payments) && p.payments.every(object)) {
      if (
        (p.repeat === 'once' && p.startDate !== p.endDate) ||
        p.payments.length > 132 ||
        new Set(p.payments.map((v) => v.date)).size !== p.payments.length
      )
        issue('planning_records', row, '결제 일정 기간·중복 납부일을 확인해 주세요.');
      try {
        const dates = new Set(
          scheduleOccurrences({
            ...p,
            id: String(row.id),
            version: Number(row.version),
          } as unknown as SchedulePlan).map((o) => o.date),
        );
        if (p.payments.some((v) => !dates.has(String(v.date))))
          issue('planning_records', row, '납부 확인일이 결제 일정 밖에 있어요.');
      } catch {
        issue('planning_records', row, '결제 예정일을 계산할 수 없어요.');
      }
    }
    if (row.kind === 'budget' && !row.archived && p.budgetScope === 'total')
      totalBudgets.push({ row, p });
  }
  for (let i = 0; i < totalBudgets.length; i++)
    for (let j = i + 1; j < totalBudgets.length; j++) {
      const a = totalBudgets[i],
        b = totalBudgets[j];
      if (
        a.row.ledger_id === b.row.ledger_id &&
        a.p.cadence === b.p.cadence &&
        same(a.p.ownerId, b.p.ownerId) &&
        same(a.p.paymentMethodId, b.p.paymentMethodId) &&
        String(a.p.startDate) <= String(b.p.endDate) &&
        String(a.p.endDate) >= String(b.p.startDate)
      )
        issue('planning_records', b.row, '기간과 조건이 겹치는 전체 예산이 있어요.');
    }
  return issues;
}
