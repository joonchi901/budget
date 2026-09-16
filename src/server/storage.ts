import type {
  Asset,
  Bootstrap,
  Ledger,
  MutationResult,
  PaymentMethod,
  Rule,
  Tag,
  Transaction,
  User,
} from '../shared/types';
import type { Session } from './auth';
import { ApiError } from './errors';

type Row = Record<string, unknown>;
export interface StoredRule extends Rule {
  version: number;
}

export const TX_COLUMNS = `id, ledger_id, date, description, amount, type, category, owner_id,
  payment_method_id, tag_ids, asset_id, to_asset_id, version, updated_at, updated_by`;
const TX_JSON = `json_object('id', id, 'ledgerId', ledger_id, 'date', date, 'description', description,
  'amount', amount, 'type', type, 'category', category, 'ownerId', owner_id,
  'paymentMethodId', payment_method_id, 'tagIds', json(tag_ids), 'assetId', asset_id,
  'toAssetId', to_asset_id, 'version', version, 'updatedAt', updated_at, 'updatedBy', updated_by)`;
const LEDGER_JSON = `json_object('id', id, 'name', name, 'icon', icon, 'kind', kind,
  'parentId', parent_id, 'budget', budget, 'startDate', start_date, 'endDate', end_date,
  'archived', json(CASE archived WHEN 1 THEN 'true' ELSE 'false' END), 'version', version)`;

export function transactionFromRow(r: Row): Transaction {
  return {
    id: String(r.id),
    ledgerId: String(r.ledger_id),
    date: String(r.date),
    description: String(r.description),
    amount: Number(r.amount),
    type: r.type as Transaction['type'],
    category: String(r.category),
    ownerId: r.owner_id as Transaction['ownerId'],
    paymentMethodId: String(r.payment_method_id),
    tagIds: JSON.parse(String(r.tag_ids)),
    assetId: r.asset_id === null ? null : String(r.asset_id),
    toAssetId: r.to_asset_id === null ? null : String(r.to_asset_id),
    version: Number(r.version),
    updatedAt: String(r.updated_at),
    updatedBy: String(r.updated_by),
  };
}

export function ledgerFromRow(r: Row): Ledger {
  return {
    id: String(r.id),
    name: String(r.name),
    icon: String(r.icon),
    kind: r.kind as Ledger['kind'],
    parentId: r.parent_id === null ? null : String(r.parent_id),
    budget: Number(r.budget),
    startDate: r.start_date === null ? null : String(r.start_date),
    endDate: r.end_date === null ? null : String(r.end_date),
    archived: Boolean(r.archived),
    version: Number(r.version),
  };
}

export async function transactionById(
  db: D1Database,
  householdId: string,
  id: string,
): Promise<Transaction | null> {
  const row = await db
    .prepare(
      `SELECT ${TX_COLUMNS} FROM transactions WHERE household_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(householdId, id)
    .first<Row>();
  return row ? transactionFromRow(row) : null;
}

export async function ledgerById(
  db: D1Database,
  householdId: string,
  id: string,
): Promise<Ledger | null> {
  const row = await db
    .prepare('SELECT * FROM ledgers WHERE household_id = ? AND id = ?')
    .bind(householdId, id)
    .first<Row>();
  return row ? ledgerFromRow(row) : null;
}

export async function getRevision(db: D1Database, householdId: string): Promise<number> {
  const row = await db
    .prepare('SELECT revision FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ revision: number }>();
  return row?.revision ?? 0;
}

export async function bootstrap(db: D1Database, session: Session): Promise<Bootstrap> {
  const h = session.householdId;
  // A single D1 batch gives the client a snapshot and a matching revision.
  const results = await db.batch<Row>([
    db.prepare('SELECT id, name, color FROM users WHERE household_id = ? ORDER BY id').bind(h),
    db.prepare('SELECT * FROM ledgers WHERE household_id = ? ORDER BY kind, name').bind(h),
    db
      .prepare(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE household_id = ? AND deleted_at IS NULL ORDER BY date DESC, updated_at DESC`,
      )
      .bind(h),
    db
      .prepare(
        `SELECT a.*, a.opening_balance + COALESCE(SUM(m.amount), 0) AS balance
      FROM assets a LEFT JOIN asset_movements m ON m.household_id = a.household_id AND m.asset_id = a.id
      WHERE a.household_id = ? GROUP BY a.id ORDER BY a.rowid`,
      )
      .bind(h),
    db.prepare('SELECT * FROM payment_methods WHERE household_id = ? ORDER BY rowid').bind(h),
    db.prepare('SELECT id, name, color FROM tags WHERE household_id = ? ORDER BY rowid').bind(h),
    db
      .prepare(
        'SELECT id, tag_id AS tagId, name, type FROM rules WHERE household_id = ? ORDER BY rowid',
      )
      .bind(h),
    db.prepare('SELECT revision FROM households WHERE id = ?').bind(h),
  ]);
  return {
    user: session.user,
    users: results[0].results as unknown as User[],
    ledgers: results[1].results.map(ledgerFromRow),
    transactions: results[2].results.map(transactionFromRow),
    assets: results[3].results.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: r.kind as Asset['kind'],
      openingBalance: Number(r.opening_balance),
      balance: Number(r.balance),
      color: String(r.color),
    })),
    paymentMethods: results[4].results.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      type: r.type as PaymentMethod['type'],
      ownerId: r.owner_id as PaymentMethod['ownerId'],
      closingDay: r.closing_day === null ? null : Number(r.closing_day),
      paymentDay: r.payment_day === null ? null : Number(r.payment_day),
    })),
    tags: results[5].results as unknown as Tag[],
    rules: results[6].results as unknown as Rule[],
    revision: Number(results[7].results[0].revision),
    mode: 'demo',
  };
}

export async function replay(
  db: D1Database,
  session: Session,
  mutationId: string,
  requestHash: string,
): Promise<MutationResult | null> {
  const row = await db
    .prepare(
      `SELECT request_hash, result_json FROM mutation_receipts
    WHERE household_id = ? AND user_id = ? AND mutation_id = ?`,
    )
    .bind(session.householdId, session.user.id, mutationId)
    .first<{ request_hash: string; result_json: string | null }>();
  if (!row) return null;
  if (row.request_hash !== requestHash)
    throw new ApiError(409, 'MUTATION_REUSED', '같은 요청 번호를 다른 내용에 사용할 수 없습니다.');
  if (!row.result_json)
    throw new ApiError(
      503,
      'INCOMPLETE_MUTATION',
      '저장 결과를 확인할 수 없습니다. 같은 요청으로 다시 시도해 주세요.',
    );
  return { ...JSON.parse(row.result_json), replayed: true };
}

interface Commit {
  mutationId: string;
  requestHash: string;
  entityId: string;
  entityType: 'transaction' | 'ledger' | 'deleted-transaction';
  ledgerId: string | null;
  guardSql: string;
  guardBindings: (string | number | null)[];
  statements: D1PreparedStatement[];
}

export async function commit(
  db: D1Database,
  session: Session,
  operation: Commit,
): Promise<MutationResult> {
  const h = session.householdId;
  const u = session.user.id;
  const now = new Date().toISOString();
  const selectEntity =
    operation.entityType === 'transaction'
      ? `, 'transaction', json((SELECT ${TX_JSON} FROM transactions WHERE household_id = ? AND id = ?))`
      : operation.entityType === 'ledger'
        ? `, 'ledger', json((SELECT ${LEDGER_JSON} FROM ledgers WHERE household_id = ? AND id = ?))`
        : '';
  const resultBindings: (string | number | null)[] = [h];
  if (selectEntity) resultBindings.push(h, operation.entityId);
  resultBindings.push(h, u, operation.mutationId);
  const statements = [
    db
      .prepare(
        `INSERT INTO mutation_receipts
      (household_id, user_id, mutation_id, request_hash, entity_id, created_at, guard_valid)
      VALUES (?, ?, ?, ?, ?, ?, (${operation.guardSql}))`,
      )
      .bind(
        h,
        u,
        operation.mutationId,
        operation.requestHash,
        operation.entityId,
        now,
        ...operation.guardBindings,
      ),
    ...operation.statements,
    db.prepare('UPDATE households SET revision = revision + 1 WHERE id = ?').bind(h),
    db
      .prepare(
        `INSERT INTO changes (household_id, revision, entity_type, entity_id, ledger_id, actor_id, created_at)
      SELECT id, revision, ?, ?, ?, ?, ? FROM households WHERE id = ?`,
      )
      .bind(operation.entityType, operation.entityId, operation.ledgerId, u, now, h),
    db
      .prepare(
        `UPDATE mutation_receipts SET result_json = json_object(
      'revision', (SELECT revision FROM households WHERE id = ?)${selectEntity})
      WHERE household_id = ? AND user_id = ? AND mutation_id = ?`,
      )
      .bind(...resultBindings),
    db
      .prepare(
        'SELECT result_json FROM mutation_receipts WHERE household_id = ? AND user_id = ? AND mutation_id = ?',
      )
      .bind(h, u, operation.mutationId),
  ];
  try {
    const results = await db.batch<{ result_json: string }>(statements);
    return JSON.parse(results.at(-1)!.results[0].result_json) as MutationResult;
  } catch (error) {
    // A simultaneous duplicate may have committed after the early replay check.
    const previous = await replay(db, session, operation.mutationId, operation.requestHash);
    if (previous) return previous;
    if (String(error).includes('mutation_version_guard')) {
      const current =
        operation.entityType === 'ledger'
          ? await ledgerById(db, h, operation.entityId)
          : await transactionById(db, h, operation.entityId);
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        '다른 곳에서 수정된 항목입니다. 최신 내용과 내 입력을 비교해 주세요.',
        current,
      );
    }
    throw error;
  }
}
