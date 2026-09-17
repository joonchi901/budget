import type { Allocation, MutationResult, TransactionInput } from '../shared/types';
import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import {
  commit,
  combineGuards,
  existsGuard,
  transactionById,
  type Binding,
  type Guard,
} from './storage';
import { tagIds, validateTags } from './tags';
import { checkVersion, date, identity, money, text, type ObjectBody } from './validation';
export { readBody } from './validation';
export { createLedger, patchLedger } from './ledgers';

export function bumpAssets(db: D1Database, h: string, ids: string[]): D1PreparedStatement[] {
  const unique = [...new Set(ids)];
  return unique.length
    ? [
        db
          .prepare(
            `UPDATE assets SET version=version+1 WHERE household_id=? AND id IN (${unique.map(() => '?').join(',')})`,
          )
          .bind(h, ...unique),
      ]
    : [];
}
export async function saveTransaction(
  db: D1Database,
  session: Session,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, 'transaction.save');
  if (op.previous) return op.previous;
  requireValue(
    body.transaction && typeof body.transaction === 'object' && !Array.isArray(body.transaction),
    '거래 내용을 확인해 주세요.',
  );
  const r = body.transaction as ObjectBody,
    h = session.householdId,
    id = r.id == null ? crypto.randomUUID() : text(r.id, '거래 ID');
  const existing = r.id == null ? null : await transactionById(db, h, id);
  if (r.id != null && !existing)
    throw new ApiError(404, 'NOT_FOUND', '수정할 거래를 찾을 수 없습니다.');
  requireValue(
    r.type === 'income' || r.type === 'expense',
    '거래에는 수입 또는 지출만 입력할 수 있습니다.',
  );
  requireValue(['u1', 'u2', 'shared'].includes(String(r.ownerId)), '지출 귀속을 선택해 주세요.');
  // Reject obsolete money fields rather than silently losing a v1 asset instruction.
  requireValue(
    !['assetId', 'toAssetId', 'category'].some((k) => Object.hasOwn(r, k)),
    '이전 거래 형식입니다. 화면을 새로 고침해 주세요.',
  );
  const tx: TransactionInput = {
    ledgerId: text(r.ledgerId, '가계부'),
    date: date(r.date, '거래일'),
    description: text(r.description, '내용', 240),
    amount: money(r.amount),
    type: r.type,
    ownerId: r.ownerId as TransactionInput['ownerId'],
    paymentMethodId: r.paymentMethodId == null ? null : text(r.paymentMethodId, '결제수단'),
    tagIds: tagIds(r.tagIds),
    allocations: [],
  };
  requireValue(
    !existing || existing.ledgerId === tx.ledgerId,
    '거래는 원본 가계부에서 수정해 주세요.',
  );
  requireValue(
    Array.isArray(r.allocations) && r.allocations.length <= 30,
    '자산 배분을 확인해 주세요.',
  );
  tx.allocations = r.allocations.map((a: unknown): Allocation => {
    requireValue(a && typeof a === 'object' && !Array.isArray(a), '자산 배분을 확인해 주세요.');
    const v = a as ObjectBody;
    return { assetId: text(v.assetId, '배분 자산'), amount: money(v.amount) };
  });
  requireValue(
    new Set(tx.allocations.map((a) => a.assetId)).size === tx.allocations.length,
    '같은 자산을 중복 배분할 수 없습니다.',
  );
  requireValue(
    !tx.allocations.length || tx.allocations.reduce((sum, a) => sum + a.amount, 0) === tx.amount,
    '자산 배분 합계가 거래 금액과 같아야 합니다.',
  );
  const results = await db.batch<Record<string, unknown>>([
    db
      .prepare('SELECT id,archived,version FROM ledgers WHERE household_id=? AND id=?')
      .bind(h, tx.ledgerId),
    db
      .prepare('SELECT id,archived,version FROM payment_methods WHERE household_id=? AND id=?')
      .bind(h, tx.paymentMethodId),
    db
      .prepare(
        "SELECT id,track_savings,archived,opening_date,version FROM assets WHERE household_id=? AND kind='asset'",
      )
      .bind(h),
    db
      .prepare(
        'SELECT asset_id,savings_tracking FROM asset_effects WHERE household_id=? AND transaction_id=?',
      )
      .bind(h, id),
  ]);
  requireValue(results[0].results.length === 1, '접근할 수 있는 원본 가계부를 선택해 주세요.');
  requireValue(
    tx.paymentMethodId === null || results[1].results.length === 1,
    '사용할 수 있는 결제수단을 선택해 주세요.',
  );
  requireValue(
    !results[0].results[0].archived || existing?.ledgerId === tx.ledgerId,
    '보관된 가계부에 새 내역을 추가할 수 없습니다.',
  );
  requireValue(
    tx.paymentMethodId === null ||
      !results[1].results[0].archived ||
      existing?.paymentMethodId === tx.paymentMethodId,
    '보관된 결제수단은 새로 선택할 수 없습니다.',
  );
  for (const allocation of tx.allocations) {
    const asset = results[2].results.find((a) => a.id === allocation.assetId);
    requireValue(
      asset &&
        (!asset.archived || existing?.allocations.some((a) => a.assetId === allocation.assetId)),
      '보관된 자산을 새로 배분할 수 없습니다.',
    );
    requireValue(
      !asset.opening_date || tx.date >= String(asset.opening_date),
      '자산 기준일 이전 거래는 배분할 수 없습니다.',
    );
  }
  const assets = new Map(results[2].results.map((a) => [String(a.id), Number(a.track_savings)])),
    previous = new Map(
      results[3].results.map((a) => [String(a.asset_id), Number(a.savings_tracking)]),
    );
  requireValue(
    tx.allocations.every((a) => assets.has(a.assetId)),
    '자산 배분에는 같은 가구의 일반 자산만 선택할 수 있습니다.',
  );
  const guards: Guard[] = await validateTags(
    db,
    h,
    tx.tagIds,
    'transaction',
    tx.ledgerId,
    existing?.tagIds,
  );
  if (tx.paymentMethodId !== null)
    guards.push(
      existsGuard('payment_methods', h, tx.paymentMethodId, Number(results[1].results[0].version)),
    );
  guards.push(existsGuard('ledgers', h, tx.ledgerId, Number(results[0].results[0].version)));
  if (tx.allocations.length) {
    // Guard configuration, not the balance version, so independent transactions
    // can both commit. JSON keeps a 30-asset allocation below D1's binding limit.
    const config = tx.allocations.map((allocation) => {
      const asset = results[2].results.find((a) => a.id === allocation.assetId)!;
      return {
        id: allocation.assetId,
        archived: Number(asset.archived),
        openingDate: asset.opening_date ?? null,
      };
    });
    guards.push({
      sql: `NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN assets a ON a.id=json_extract(j.value,'$.id') AND a.household_id=? WHERE a.id IS NULL OR a.archived<>json_extract(j.value,'$.archived') OR a.opening_date IS NOT json_extract(j.value,'$.openingDate'))`,
      bindings: [JSON.stringify(config), h],
    });
  }
  if (existing)
    guards.push(
      existsGuard(
        'transactions',
        h,
        id,
        checkVersion(existing, body.expectedVersion),
        ' AND deleted_at IS NULL',
      ),
    );
  const freshPolicies = tx.allocations
    .filter((a) => !previous.has(a.assetId))
    .map((a) => ({ id: a.assetId, tracking: assets.get(a.assetId)! }));
  if (freshPolicies.length)
    guards.push({
      sql: `NOT EXISTS(SELECT 1 FROM json_each(?) v LEFT JOIN assets a ON a.id=json_extract(v.value,'$.id') AND a.household_id=? WHERE a.id IS NULL OR a.track_savings<>json_extract(v.value,'$.tracking'))`,
      bindings: [JSON.stringify(freshPolicies), h],
    });
  const now = new Date().toISOString(),
    columns: Binding[] = [
      tx.ledgerId,
      tx.date,
      tx.description,
      tx.amount,
      tx.type,
      tx.ownerId,
      tx.paymentMethodId,
      JSON.stringify(tx.tagIds),
      JSON.stringify(tx.allocations),
      now,
      session.user.id,
    ];
  const statements: D1PreparedStatement[] = existing
    ? [
        db
          .prepare(
            'UPDATE transactions SET ledger_id=?,date=?,description=?,amount=?,type=?,owner_id=?,payment_method_id=?,tag_ids=?,allocations_json=?,updated_at=?,updated_by=?,version=version+1 WHERE household_id=? AND id=?',
          )
          .bind(...columns, h, id),
      ]
    : [
        db
          .prepare(
            "INSERT INTO transactions(ledger_id,date,description,amount,type,owner_id,payment_method_id,tag_ids,allocations_json,updated_at,updated_by,household_id,id,category,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'',?,?)",
          )
          .bind(...columns, h, id, session.user.id, now),
      ];
  statements.push(
    db.prepare('DELETE FROM asset_effects WHERE household_id=? AND transaction_id=?').bind(h, id),
  );
  for (const [i, a] of tx.allocations.entries()) {
    const amount = tx.type === 'income' ? a.amount : -a.amount,
      tracking = previous.get(a.assetId) ?? assets.get(a.assetId)!;
    statements.push(
      db
        .prepare(
          'INSERT INTO asset_effects(id,household_id,transaction_id,asset_id,amount,savings_amount,savings_tracking,date,description,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          `${id}:${i}`,
          h,
          id,
          a.assetId,
          amount,
          tracking ? amount : 0,
          tracking,
          tx.date,
          tx.description,
          session.user.id,
        ),
    );
  }
  statements.push(
    ...bumpAssets(db, h, [...previous.keys(), ...tx.allocations.map((a) => a.assetId)]),
  );
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'transaction',
    ledgerId: tx.ledgerId,
    statements,
    ...combineGuards(guards),
  });
}
export async function deleteTransaction(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
): Promise<MutationResult> {
  const op = await identity(db, session, body, `transaction.delete:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await transactionById(db, h, id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '삭제할 거래를 찾을 수 없습니다.');
  const now = new Date().toISOString();
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'deleted-transaction',
    ledgerId: current.ledgerId,
    ...combineGuards([
      existsGuard(
        'transactions',
        h,
        id,
        checkVersion(current, body.expectedVersion),
        ' AND deleted_at IS NULL',
      ),
    ]),
    statements: [
      db
        .prepare(
          'UPDATE transactions SET deleted_at=?,updated_at=?,updated_by=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(now, now, session.user.id, h, id),
      db
        .prepare(
          'UPDATE assets SET version=version+1 WHERE household_id=? AND id IN (SELECT asset_id FROM asset_effects WHERE household_id=? AND transaction_id=?)',
        )
        .bind(h, h, id),
      db.prepare('DELETE FROM asset_effects WHERE household_id=? AND transaction_id=?').bind(h, id),
    ],
  });
}
