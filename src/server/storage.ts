import type {
  Asset,
  AssetOperation,
  Bootstrap,
  Ledger,
  MutationResult,
  PaymentMethod,
  Tag,
  TagGroup,
  Transaction,
} from '../shared/types';
import type { Session } from './auth';
import { ApiError } from './errors';
import type { Plan } from '../shared/planning';
import { paymentDefinition } from './payments';
import { planDefinition } from './planning';
import { assetDefinition } from './assets';

export type Binding = string | number | null;
type Entity =
  | 'transaction'
  | 'ledger'
  | 'asset'
  | 'tagGroup'
  | 'tag'
  | 'assetOperation'
  | 'paymentMethod'
  | 'plan';
type EntityMap = {
  transaction: Transaction;
  ledger: Ledger;
  asset: Asset;
  tagGroup: TagGroup;
  tag: Tag;
  assetOperation: AssetOperation;
  paymentMethod: PaymentMethod;
  plan: Plan;
};
const boolean = (column: string) => `json(CASE ${column} WHEN 1 THEN 'true' ELSE 'false' END)`;
const definitions: Record<Entity, { table: string; json: string; filter?: string }> = {
  paymentMethod: paymentDefinition,
  plan: planDefinition,
  transaction: {
    table: 'transactions',
    filter: " AND t.deleted_at IS NULL AND t.type IN ('income','expense')",
    json: `json_object('id',t.id,'ledgerId',t.ledger_id,'date',t.date,'description',t.description,'amount',t.amount,'type',t.type,'ownerId',t.owner_id,'paymentMethodId',t.payment_method_id,'tagIds',json(t.tag_ids),'allocations',json(t.allocations_json),'version',t.version,'updatedAt',t.updated_at,'updatedBy',t.updated_by,'createdBy',t.created_by,'createdAt',t.created_at)`,
  },
  ledger: {
    table: 'ledgers',
    json: `json_object('id',t.id,'name',t.name,'icon',t.icon,'kind',t.kind,'parentId',t.parent_id,'budget',t.budget,'startDate',t.start_date,'endDate',t.end_date,'archived',${boolean('t.archived')},'version',t.version,'periodStartDay',t.period_start_day,'fixedExpenseTagIds',json(t.fixed_expense_tag_ids),'tagMappings',json(t.tag_mappings))`,
  },
  asset: assetDefinition,
  tagGroup: {
    table: 'tag_groups',
    json: `json_object('id',t.id,'name',t.name,'selectionMode',t.selection_mode,'appliesTo',t.applies_to,'role',t.role,'ledgerIds',json(t.ledger_ids),'sortOrder',t.sort_order,'archived',${boolean('t.archived')},'version',t.version)`,
  },
  tag: {
    table: 'tags',
    json: `json_object('id',t.id,'groupId',t.group_id,'name',t.name,'color',t.color,'sortOrder',t.sort_order,'archived',${boolean('t.archived')},'version',t.version,'parentId',t.parent_id)`,
  },
  assetOperation: {
    table: 'asset_operations',
    json: `json_object('id',t.id,'type',t.type,'date',t.date,'description',t.description,'fromAssetId',t.from_asset_id,'toAssetId',t.to_asset_id,'assetId',t.asset_id,'amount',t.amount,'targetBalance',t.target_balance,'version',t.version,'createdBy',t.created_by,'createdAt',t.created_at,'deletedAt',t.deleted_at)`,
  },
};
export function auditSelection(entity: Entity) {
  const d = definitions[entity];
  const payload =
    entity === 'transaction' ? `json_set(${d.json},'$.deletedAt',t.deleted_at)` : d.json;
  return `SELECT ${payload} AS payload FROM ${d.table} t WHERE t.household_id=?`;
}
function selection(entity: Entity) {
  const d = definitions[entity];
  return `SELECT ${d.json} AS payload FROM ${d.table} t WHERE t.household_id=?${d.filter ?? ''}`;
}
export async function entityById<K extends Entity>(
  db: D1Database,
  h: string,
  entity: K,
  id: string,
): Promise<EntityMap[K] | null> {
  const row = await db
    .prepare(`${selection(entity)} AND t.id=?`)
    .bind(h, id)
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}
export const transactionById = (db: D1Database, h: string, id: string) =>
  entityById(db, h, 'transaction', id);
export const ledgerById = (db: D1Database, h: string, id: string) =>
  entityById(db, h, 'ledger', id);
export async function getRevision(db: D1Database, h: string): Promise<number> {
  return (
    (await db
      .prepare('SELECT revision FROM households WHERE id=?')
      .bind(h)
      .first<number>('revision')) ?? 0
  );
}
export async function bootstrap(db: D1Database, session: Session): Promise<Bootstrap> {
  const h = session.householdId;
  const keys: Entity[] = ['ledger', 'transaction', 'asset', 'tagGroup', 'tag', 'assetOperation'];
  const queries = keys.map((k) =>
    db
      .prepare(
        selection(k) +
          (k === 'transaction'
            ? ' ORDER BY t.date DESC,t.updated_at DESC'
            : k === 'tag' || k === 'tagGroup'
              ? ' ORDER BY t.sort_order,t.rowid'
              : ' ORDER BY t.rowid'),
      )
      .bind(h),
  );
  const results = await db.batch<{ payload: string }>([
    ...queries,
    db
      .prepare(
        "SELECT json_object('id',id,'name',name,'color',color) AS payload FROM users WHERE household_id=? ORDER BY id",
      )
      .bind(h),
    db.prepare(selection('paymentMethod') + ' ORDER BY t.rowid').bind(h),
    db
      .prepare(
        "SELECT json_object('id',id,'assetId',asset_id,'transactionId',transaction_id,'operationId',operation_id,'date',date,'description',description,'amount',amount,'savingsAmount',savings_amount,'actorId',actor_id) AS payload FROM asset_effects WHERE household_id=? ORDER BY date DESC,rowid DESC",
      )
      .bind(h),
    db.prepare('SELECT revision AS payload FROM households WHERE id=?').bind(h),
    db.prepare(selection('plan') + ' ORDER BY t.rowid').bind(h),
  ]);
  const rows = (i: number) => results[i].results.map((r) => JSON.parse(r.payload));
  return {
    user: session.user,
    householdId: session.householdId,
    ledgers: rows(0),
    transactions: rows(1),
    assets: rows(2),
    tagGroups: rows(3),
    tags: rows(4),
    assetOperations: rows(5),
    users: rows(6),
    paymentMethods: rows(7),
    assetMovements: rows(8),
    revision: Number(results[9].results[0].payload),
    mode: session.authKind === 'oidc' ? 'production' : 'demo',
    plans: rows(10),
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
      'SELECT request_hash,result_json FROM mutation_receipts WHERE household_id=? AND user_id=? AND mutation_id=?',
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
export interface Guard {
  sql: string;
  bindings: Binding[];
}
export const existsGuard = (
  table: string,
  h: string,
  id: string,
  version: number,
  extra = '',
): Guard => ({
  sql: `EXISTS(SELECT 1 FROM ${table} WHERE household_id=? AND id=? AND version=?${extra})`,
  bindings: [h, id, version],
});
export function combineGuards(guards: Guard[]): { guardSql: string; guardBindings: Binding[] } {
  return {
    guardSql: `SELECT CASE WHEN ${guards.map((g) => `(${g.sql})`).join(' AND ') || '1'} THEN 1 ELSE 0 END`,
    guardBindings: guards.flatMap((g) => g.bindings),
  };
}
interface Commit {
  mutationId: string;
  requestHash: string;
  entityId: string;
  entityType: Entity | 'deleted-transaction';
  ledgerId: string | null;
  guardSql: string;
  guardBindings: Binding[];
  statements: D1PreparedStatement[];
  conflictAssets?: string[];
}
export async function commit(
  db: D1Database,
  session: Session,
  op: Commit,
): Promise<MutationResult> {
  const h = session.householdId,
    u = session.user.id,
    now = new Date().toISOString();
  const entity = op.entityType === 'deleted-transaction' ? null : op.entityType;
  const auditEntity = entity ?? 'transaction',
    historyId = crypto.randomUUID();
  const extra = entity ? `, '${entity}',json((${selection(entity)} AND t.id=?))` : '';
  const bindings: Binding[] = [h];
  if (entity) bindings.push(h, op.entityId);
  bindings.push(h, u, op.mutationId);
  const statements = [
    db
      .prepare(
        `INSERT INTO mutation_receipts(household_id,user_id,mutation_id,request_hash,entity_id,created_at,guard_valid) VALUES(?,?,?,?,?,?,(${op.guardSql}))`,
      )
      .bind(h, u, op.mutationId, op.requestHash, op.entityId, now, ...op.guardBindings),
    db
      .prepare(
        `INSERT INTO record_history(id,household_id,revision,entity_type,entity_id,ledger_id,actor_id,created_at,action,before_json) SELECT ?,id,revision+1,?,?,?,?,?, ?,(${auditSelection(auditEntity)} AND t.id=?) FROM households WHERE id=?`,
      )
      .bind(
        historyId,
        auditEntity,
        op.entityId,
        op.ledgerId,
        u,
        now,
        op.entityType === 'deleted-transaction' ? 'delete' : 'update',
        h,
        op.entityId,
        h,
      ),
    ...op.statements,
    db
      .prepare(
        `UPDATE record_history SET after_json=(${auditSelection(auditEntity)} AND t.id=?), action=CASE WHEN action='delete' THEN 'delete' WHEN before_json IS NULL THEN 'create' ELSE 'update' END WHERE household_id=? AND id=?`,
      )
      .bind(h, op.entityId, h, historyId),
    db.prepare('UPDATE households SET revision=revision+1 WHERE id=?').bind(h),
    db
      .prepare(
        'INSERT INTO changes(household_id,revision,entity_type,entity_id,ledger_id,actor_id,created_at) SELECT id,revision,?,?,?,?,? FROM households WHERE id=?',
      )
      .bind(op.entityType, op.entityId, op.ledgerId, u, now, h),
    db
      .prepare(
        `UPDATE mutation_receipts SET result_json=json_object('revision',(SELECT revision FROM households WHERE id=?)${extra}) WHERE household_id=? AND user_id=? AND mutation_id=?`,
      )
      .bind(...bindings),
    db
      .prepare(
        'SELECT result_json FROM mutation_receipts WHERE household_id=? AND user_id=? AND mutation_id=?',
      )
      .bind(h, u, op.mutationId),
  ];
  try {
    const results = await db.batch<{ result_json: string }>(statements);
    return JSON.parse(results.at(-1)!.results[0].result_json);
  } catch (error) {
    const previous = await replay(db, session, op.mutationId, op.requestHash);
    if (previous) return previous;
    if (String(error).includes('mutation_version_guard')) {
      const current = op.conflictAssets
        ? {
            assets: await Promise.all(
              op.conflictAssets.map((id) => entityById(db, h, 'asset', id)),
            ),
          }
        : await entityById(db, h, entity ?? 'transaction', op.entityId);
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        '다른 곳에서 수정된 항목입니다. 최신 내용과 내 입력을 비교해 주세요.',
        current,
      );
    }
    if (
      String(error).includes('tags.household_id, tags.group_id, tags.name') ||
      String(error).includes('tag_name_in_group')
    )
      throw new ApiError(409, 'DUPLICATE_TAG', '같은 태그 유형에 같은 이름이 있습니다.');
    throw error;
  }
}
