import type { Session } from './auth';
import { ApiError, requireValue } from './errors';
import { bumpAssets } from './mutations';
import { commit, combineGuards, entityById, existsGuard } from './storage';
import { tagIds, validateTags } from './tags';
import {
  checkVersion,
  bool,
  color,
  date,
  identity,
  money,
  signedMoney,
  text,
  version,
  type ObjectBody,
} from './validation';

export async function createAsset(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'asset.create');
  if (op.previous) return op.previous;
  const h = session.householdId,
    id = crypto.randomUUID(),
    name = text(body.name, '자산 이름', 80),
    shade = color(body.color),
    opening = signedMoney(body.openingBalance),
    ids = tagIds(body.tagIds),
    track = bool(body.trackSavings);
  requireValue(body.kind === 'asset' || body.kind === 'liability', '자산 종류를 확인해 주세요.');
  requireValue(
    body.kind !== 'liability' || !track,
    '부채는 저축 집계 대상으로 설정할 수 없습니다.',
  );
  const guards = await validateTags(db, h, ids, 'asset', null);
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'asset',
    ledgerId: null,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'INSERT INTO assets(id,household_id,name,kind,opening_balance,color,tag_ids,track_savings) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(id, h, name, body.kind, opening, shade, JSON.stringify(ids), Number(track)),
    ],
  });
}
export async function patchAsset(db: D1Database, session: Session, id: string, body: ObjectBody) {
  const op = await identity(db, session, body, `asset.patch:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await entityById(db, h, 'asset', id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '자산을 찾을 수 없습니다.');
  const name = body.name === undefined ? current.name : text(body.name, '자산 이름', 80),
    shade = body.color === undefined ? current.color : color(body.color),
    ids = body.tagIds === undefined ? current.tagIds : tagIds(body.tagIds),
    track = body.trackSavings === undefined ? current.trackSavings : bool(body.trackSavings);
  requireValue(
    current.kind !== 'liability' || !track,
    '부채는 저축 집계 대상으로 설정할 수 없습니다.',
  );
  requireValue(
    !Object.hasOwn(body, 'openingBalance') && !Object.hasOwn(body, 'balance'),
    '잔액은 별도 잔액 조정으로 변경해 주세요.',
  );
  const guards = await validateTags(db, h, ids, 'asset', null, current.tagIds);
  guards.push(existsGuard('assets', h, id, checkVersion(current, body.expectedVersion)));
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'asset',
    ledgerId: null,
    ...combineGuards(guards),
    statements: [
      db
        .prepare(
          'UPDATE assets SET name=?,color=?,tag_ids=?,track_savings=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(name, shade, JSON.stringify(ids), Number(track), h, id),
    ],
  });
}
export async function createAssetOperation(db: D1Database, session: Session, body: ObjectBody) {
  const op = await identity(db, session, body, 'assetOperation.create');
  if (op.previous) return op.previous;
  const h = session.householdId,
    id = crypto.randomUUID(),
    when = date(body.date, '기록일'),
    description = text(body.description, '내용', 240),
    now = new Date().toISOString();
  requireValue(
    body.type === 'transfer' || body.type === 'adjustment',
    '자산 기록 종류를 확인해 주세요.',
  );
  requireValue(
    body.expectedAssetVersions &&
      typeof body.expectedAssetVersions === 'object' &&
      !Array.isArray(body.expectedAssetVersions),
    '자산의 최신 버전이 필요합니다.',
  );
  const expected = body.expectedAssetVersions as ObjectBody;
  const from = body.type === 'transfer' ? text(body.fromAssetId, '출금 자산') : null,
    to = body.type === 'transfer' ? text(body.toAssetId, '입금 자산') : null,
    assetId = body.type === 'adjustment' ? text(body.assetId, '조정 자산') : null;
  requireValue(
    body.type !== 'transfer' || from !== to,
    '서로 다른 출금 자산과 입금 자산을 선택해 주세요.',
  );
  const ids = body.type === 'transfer' ? [from!, to!] : [assetId!];
  const assets = await Promise.all(ids.map((a) => entityById(db, h, 'asset', a)));
  requireValue(
    assets.every((a) => a !== null),
    '같은 가구의 자산을 선택해 주세요.',
  );
  requireValue(
    body.type !== 'transfer' || assets.every((a) => a!.kind === 'asset'),
    '부채는 자산 이체에 사용할 수 없습니다.',
  );
  for (const a of assets)
    if (version(expected[a!.id]) !== a!.version)
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        '다른 곳에서 수정된 자산입니다. 최신 잔액을 확인해 주세요.',
        { assets },
      );
  const target = body.type === 'adjustment' ? signedMoney(body.targetBalance) : null;
  const amount = body.type === 'transfer' ? money(body.amount) : target! - assets[0]!.balance;
  requireValue(
    Number.isSafeInteger(amount) && Math.abs(amount) <= 2_000_000_000_000,
    '조정 금액이 허용 범위를 벗어났습니다.',
  );
  const guards = ids.map((a) => existsGuard('assets', h, a, version(expected[a])));
  const bothTracked = body.type === 'transfer' && assets.every((a) => a!.trackSavings);
  const statements = [
    db
      .prepare(
        'INSERT INTO asset_operations(id,household_id,type,date,description,from_asset_id,to_asset_id,asset_id,amount,target_balance,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        h,
        body.type,
        when,
        description,
        from,
        to,
        assetId,
        amount,
        target,
        session.user.id,
        now,
      ),
  ];
  for (const [i, a] of assets.entries()) {
    const delta = body.type === 'transfer' ? (i === 0 ? -amount : amount) : amount;
    const tracking = body.type === 'transfer' && a!.trackSavings ? 1 : 0;
    statements.push(
      db
        .prepare(
          'INSERT INTO asset_effects(id,household_id,operation_id,asset_id,amount,savings_amount,savings_tracking,date,description,actor_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          `${id}:${i}`,
          h,
          id,
          a!.id,
          delta,
          tracking && !bothTracked ? delta : 0,
          tracking,
          when,
          description,
          session.user.id,
        ),
    );
  }
  statements.push(...bumpAssets(db, h, ids));
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'assetOperation',
    ledgerId: null,
    ...combineGuards(guards),
    statements,
    conflictAssets: ids,
  });
}
export async function deleteAssetOperation(
  db: D1Database,
  session: Session,
  id: string,
  body: ObjectBody,
) {
  const op = await identity(db, session, body, `assetOperation.delete:${id}`);
  if (op.previous) return op.previous;
  const h = session.householdId,
    current = await entityById(db, h, 'assetOperation', id);
  if (!current || current.deletedAt)
    throw new ApiError(404, 'NOT_FOUND', '되돌릴 자산 기록을 찾을 수 없습니다.');
  return commit(db, session, {
    ...op,
    entityId: id,
    entityType: 'assetOperation',
    ledgerId: null,
    ...combineGuards([
      existsGuard(
        'asset_operations',
        h,
        id,
        checkVersion(current, body.expectedVersion),
        ' AND deleted_at IS NULL',
      ),
    ]),
    statements: [
      db
        .prepare(
          'UPDATE asset_operations SET deleted_at=?,version=version+1 WHERE household_id=? AND id=?',
        )
        .bind(new Date().toISOString(), h, id),
      db
        .prepare(
          'UPDATE assets SET version=version+1 WHERE household_id=? AND id IN (SELECT asset_id FROM asset_effects WHERE household_id=? AND operation_id=?)',
        )
        .bind(h, h, id),
      db.prepare('DELETE FROM asset_effects WHERE household_id=? AND operation_id=?').bind(h, id),
    ],
  });
}
